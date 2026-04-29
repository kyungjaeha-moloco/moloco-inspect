/**
 * molly — Slack bot entry point for Inspect.
 *
 * Phase 2.0 — `@molly <PRD>` mention starts a real Job:
 *   1. Strip mention text → use as PRD.
 *   2. Create a Job against the molly default playground (env-pinned).
 *   3. Trigger decomposeJobInBackground; poll until the plan lands.
 *   4. Post the plan to the thread with [✅ 승인] / [❌ 취소] buttons.
 *   5. On approve → kick the job runner + poll for completion → post a
 *      result message with the playground URL the user should open.
 *   6. On cancel → cancelJob; post acknowledgement.
 *
 * Phase 2.1 (next slice) will stream task progress + add free-form
 * "다시 계획 세우기" feedback.
 *
 * Disabled-by-default: any missing token → log + return. Orchestrator
 * boot is unaffected; molly is a feature, not a hard dependency.
 *
 * Required env:
 *   SLACK_BOT_TOKEN, SLACK_APP_TOKEN, SLACK_SIGNING_SECRET
 *
 * Optional env:
 *   INSPECT_SLACK_CHANNEL — single channel ID whitelist
 *   MOLLY_PLAYGROUND_ID   — playground that all mentions write to.
 *                           Empty → bot stays in echo-only mode.
 */

import bolt from '@slack/bolt';
import { appendChatMessages, generateMessageId } from './chat-store.js';

const { App } = bolt;

/** @type {bolt.App | null} */
let appInstance = null;

/**
 * Hooks injected by server.js so molly doesn't import server internals
 * directly. Keeps the bot decoupled from the orchestrator's HTTP layer.
 *
 * @typedef {object} MollyOptions
 * @property {string|null} defaultPlaygroundId
 * @property {(args: {playgroundId: string, prdText: string, baselineHeadSha?: string}) => any} createJob
 * @property {(id: string) => any} getJob
 * @property {() => Array<any>} listJobs
 * @property {(id: string, ctx: {channel: string, threadTs: string}) => any} setJobSlackContext
 * @property {(id: string) => any} approveJobPlan
 * @property {(id: string) => any} cancelJob
 * @property {(id: string, opts?: object) => void} decomposeJobInBackground
 * @property {(id: string) => void} runJobInBackground
 * @property {(id: string) => any} getPlayground
 * @property {(id: string, feedback?: string) => void} redecomposeJob
 */

/** @type {MollyOptions | null} */
let opts = null;

/**
 * Jobs whose cancellation was triggered by molly's own ❌ button.
 * `handleCancel` posts the announcement directly; `pollJobUntilDone`
 * uses this set to avoid double-posting when it later observes the
 * same `cancelled` status. External cancellations (Playground UI,
 * curl, etc.) are NOT in this set and therefore get announced by
 * the poll loop.
 *
 * @type {Set<string>}
 */
const selfCancelledJobs = new Set();

/**
 * Jobs molly is currently polling. Prevents double-watching the same
 * job (handleApprove kicks the loop; the orchestrator-restart
 * resumption scan also tries to kick it; later actions like resume
 * also kick it). Cleaned up when the loop exits.
 *
 * @type {Set<string>}
 */
const watchedJobs = new Set();

const PLAYGROUND_BASE_URL = 'http://localhost:4180/p';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const trunc = (str, n) => (str.length > n ? `${str.slice(0, n)}…` : str);

/**
 * Korean labels for the QA strategies the strategist can pick.
 * Mirrors the catalog in `lib/job-qa-strategist.js#QA_STRATEGIES`.
 */
const QA_STRATEGY_LABELS_KO = {
  agent_review: '에이전트 종합 리뷰 — 스크린샷 + 콘솔 + diff 종합 판정',
  inline_per_task: '각 작업 직후 검증',
  final_route_smoke: '라우트 스모크만 (가벼움)',
  visual_diff: '시각 회귀 비교',
  lint_only: '타입/린트만',
  human_only: '사람이 직접 확인',
};

/**
 * The decomposer sometimes emits sub-bullets on the same line as the
 * prose — e.g. "...페이지가 보입니다. (1) 제목... (2) 안내문구...".
 * Slack mrkdwn doesn't auto-wrap before parenthesised numbers, so the
 * whole thing renders as a run-on paragraph. Insert a newline before
 * each `(N)` when it follows whitespace mid-text. Also handles the
 * `1.` / `2.` style as a fallback (only when preceded by whitespace
 * and followed by a space — avoids splitting decimals like `1.5`).
 */
function normalizeBullets(text) {
  return text
    .replace(/\s+\((\d+)\)\s+/g, '\n($1) ')
    .replace(/\s+(\d+)\.\s+/g, '\n$1. ');
}

/**
 * @param {MollyOptions} options
 */
export function startMolly(options) {
  opts = options;

  const botToken = process.env.SLACK_BOT_TOKEN;
  const appToken = process.env.SLACK_APP_TOKEN;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;

  if (!botToken || !appToken || !signingSecret) {
    console.log('[molly] tokens not set — bot disabled');
    return;
  }

  const allowedChannel = process.env.INSPECT_SLACK_CHANNEL?.trim() || null;

  appInstance = new App({
    token: botToken,
    appToken,
    signingSecret,
    socketMode: true,
  });

  appInstance.event('app_mention', async (ctx) => {
    try {
      await handleMention(ctx, allowedChannel);
    } catch (err) {
      ctx.logger.error(`[molly] handleMention crashed: ${err?.stack ?? err}`);
      try {
        await ctx.say({
          thread_ts: ctx.event.thread_ts ?? ctx.event.ts,
          text: `⚠️ 에러: ${err?.message ?? err}`,
        });
      } catch {
        /* swallow */
      }
    }
  });

  // Button handlers — action_id pattern matches button definitions in
  // postPlanMessage. value carries the jobId so handlers don't need
  // to mutate global state to find their target.
  appInstance.action('molly_approve', async (ctx) => {
    await ctx.ack();
    try {
      await handleApprove(ctx);
    } catch (err) {
      ctx.logger.error(`[molly] handleApprove crashed: ${err?.stack ?? err}`);
    }
  });

  appInstance.action('molly_cancel', async (ctx) => {
    await ctx.ack();
    try {
      await handleCancel(ctx);
    } catch (err) {
      ctx.logger.error(`[molly] handleCancel crashed: ${err?.stack ?? err}`);
    }
  });

  // "✏️ 다시 계획" — opens a modal where the user can (optionally)
  // add free-form feedback before re-decomposing.
  appInstance.action('molly_redecompose', async (ctx) => {
    await ctx.ack();
    try {
      await handleRedecomposeOpen(ctx);
    } catch (err) {
      ctx.logger.error(`[molly] handleRedecomposeOpen crashed: ${err?.stack ?? err}`);
    }
  });

  // Modal submit — kicks the redecomposer with the user's feedback
  // (if any), then waits for the new plan to land and posts it back
  // into the same Slack thread.
  appInstance.view('molly_redecompose_submit', async (ctx) => {
    await ctx.ack();
    try {
      await handleRedecomposeSubmit(ctx);
    } catch (err) {
      ctx.logger.error(`[molly] handleRedecomposeSubmit crashed: ${err?.stack ?? err}`);
    }
  });

  appInstance.error(async (err) => {
    console.error('[molly] error:', err);
  });

  appInstance
    .start()
    .then(() => {
      const mode = opts?.defaultPlaygroundId
        ? `playground=${opts.defaultPlaygroundId}`
        : 'echo-only (MOLLY_PLAYGROUND_ID unset)';
      console.log(
        `[molly] ⚡️ listening (Socket Mode${
          allowedChannel ? `, channel=${allowedChannel}` : ', any channel'
        }, ${mode})`,
      );
      // Resume polling for any active job that was started via Slack
      // before this orchestrator process boot. Without this, a
      // playground-side cancel/resume after a restart would never make
      // it back to the original Slack thread.
      resumeWatchersFromDisk();
    })
    .catch((err) => {
      console.error('[molly] failed to start:', err.message);
      appInstance = null;
    });
}

/**
 * Re-attach poll loops to every active molly-tracked job after an
 * orchestrator restart. Active = status is anything but `complete` or
 * `cancelled`. The poll loop itself is idempotent (watchedJobs guard)
 * so even if a fresh action handler kicks the same job in parallel,
 * we won't double-watch.
 */
function resumeWatchersFromDisk() {
  if (!appInstance || !opts?.listJobs || !opts?.getJob) return;
  /** @type {Array<any>} */
  const jobs = opts.listJobs();
  const TERMINAL = new Set(['complete', 'cancelled']);
  let resumed = 0;
  for (const j of jobs) {
    if (!j?.slackContext?.channel || !j?.slackContext?.threadTs) continue;
    if (TERMINAL.has(j.status)) continue;
    void pollJobUntilDone({
      client: appInstance.client,
      channel: j.slackContext.channel,
      threadTs: j.slackContext.threadTs,
      jobId: j.id,
    });
    resumed += 1;
  }
  if (resumed > 0) {
    console.log(`[molly] resumed ${resumed} active job watcher(s) from disk`);
  }
}

// ── Handlers ────────────────────────────────────────────────────────

async function handleMention({ event, client, say, logger }, allowedChannel) {
  if (allowedChannel && event.channel !== allowedChannel) {
    logger.info(
      `[molly] mention ignored: channel=${event.channel} not whitelisted`,
    );
    return;
  }

  const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  const threadTs = event.thread_ts ?? event.ts;

  // Immediate ack — Slack expects <3s. Reaction is the cheapest signal.
  try {
    await client.reactions.add({
      channel: event.channel,
      timestamp: event.ts,
      name: 'eyes',
    });
  } catch (err) {
    logger.warn(`[molly] reaction failed: ${err.message}`);
  }

  if (!text) {
    await say({
      thread_ts: threadTs,
      text: '👋 무엇을 도와드릴까요? 멘션과 함께 요청 내용을 적어주세요.',
    });
    return;
  }

  if (!opts?.defaultPlaygroundId) {
    await say({
      thread_ts: threadTs,
      text: '⚠️ molly 가 아직 작업 모드로 설정되지 않았습니다 (`MOLLY_PLAYGROUND_ID` 미설정).',
    });
    return;
  }

  const pg = opts.getPlayground(opts.defaultPlaygroundId);
  if (!pg) {
    await say({
      thread_ts: threadTs,
      text: `⚠️ 설정된 플레이그라운드(${opts.defaultPlaygroundId})를 찾을 수 없습니다.`,
    });
    return;
  }

  // Create job + kick decomposer.
  let job;
  try {
    job = opts.createJob({
      playgroundId: opts.defaultPlaygroundId,
      prdText: text,
      baselineHeadSha: pg.headCommitSha,
    });
  } catch (err) {
    await say({
      thread_ts: threadTs,
      text: `❌ Job 생성 실패: ${err.message}`,
    });
    return;
  }

  // Persist Slack thread on the job record so molly can re-attach
  // a poll loop after an orchestrator restart, and so playground-side
  // state changes (cancel, resume, etc.) can route notifications back
  // to this same conversation.
  try {
    opts.setJobSlackContext(job.id, {
      channel: event.channel,
      threadTs,
    });
  } catch (err) {
    logger.warn(`[molly] setJobSlackContext failed: ${err.message}`);
  }

  // Mirror this conversation into the playground's chat panel so the
  // user can switch to the playground app and see the same job there
  // (with a live inline JobCard, since the assistant message carries
  // jobId). One-time write — JobCard polls for state itself.
  try {
    const now = Date.now();
    appendChatMessages(opts.defaultPlaygroundId, [
      {
        id: generateMessageId(),
        role: 'user',
        content: text,
        timestamp: now,
      },
      {
        id: generateMessageId(),
        role: 'assistant',
        content: `Slack 멘션으로 받은 요청입니다. 작업 진행 상황은 아래 카드에서 확인하세요.`,
        jobId: job.id,
        timestamp: now + 1,
      },
    ]);
  } catch (err) {
    logger.warn(`[molly] chat mirror failed: ${err.message}`);
  }

  const playgroundUrl = `${PLAYGROUND_BASE_URL}/${opts.defaultPlaygroundId}`;
  await say({
    thread_ts: threadTs,
    text: [
      `🛠️ 받았습니다. 작업 계획을 세우는 중… (job: \`${job.id}\`)`,
      `📺 Playground: ${playgroundUrl}`,
      `_Playground 채팅에도 동일한 내용이 기록됩니다._`,
    ].join('\n'),
  });

  opts.decomposeJobInBackground(job.id);

  // Poll until the decomposer lands a plan (status=planning) or fails
  // (status=paused). Bound at 90s — the decomposer typically returns
  // in 10-30s.
  const ready = await waitForStatus(job.id, ['planning', 'paused'], 90_000);
  if (!ready) {
    await say({
      thread_ts: threadTs,
      text: '⏱️ 계획 세우기 시간 초과 (90s). Playground 에서 확인해주세요.',
    });
    return;
  }

  job = opts.getJob(job.id);
  if (job.status === 'paused') {
    await say({
      thread_ts: threadTs,
      text: `❌ 계획 세우기 실패: ${job.pausedReason ?? '(원인 없음)'}`,
    });
    return;
  }

  // Wait briefly for the QA strategist to stamp `qaStrategy` on the
  // job — it fires fire-and-forget right after the decomposer lands,
  // and we want to render verification info as part of the same plan.
  // 30s is generous; falls through with no strategy if it times out
  // (buildPlanBlocks renders a "still picking" note in that case).
  const stratDeadline = Date.now() + 30_000;
  while (Date.now() < stratDeadline) {
    const j = opts.getJob(job.id);
    if (j?.qaStrategy) break;
    await sleep(500);
  }
  job = opts.getJob(job.id);

  await postPlanMessage({
    client,
    channel: event.channel,
    threadTs,
    job,
  });
}

async function handleApprove({ ack: _ack, body, action, client, logger }) {
  const jobId = action.value;
  const channel = body.channel.id;
  const threadTs = body.message.thread_ts ?? body.message.ts;
  const userId = body.user.id;

  try {
    opts.approveJobPlan(jobId);
  } catch (err) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `❌ 승인 실패: ${err.message}`,
    });
    return;
  }

  // Disable the buttons on the original plan message so the user can't
  // double-click. Slack lets us replace the message in-place via
  // chat.update.
  try {
    await client.chat.update({
      channel,
      ts: body.message.ts,
      text: body.message.text ?? '계획 승인됨',
      blocks: stampApprovedBlocks(body.message.blocks, userId),
    });
  } catch (err) {
    logger.warn(`[molly] chat.update failed: ${err.message}`);
  }

  opts.runJobInBackground(jobId);

  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `🛠️ <@${userId}> 님이 승인했습니다. 작업 시작합니다…`,
  });

  // Poll for completion. Fire-and-forget — the handler returned ack
  // already and Slack doesn't need us blocking.
  void pollJobUntilDone({ client, channel, threadTs, jobId });
}

async function handleCancel({ ack: _ack, body, action, client, logger }) {
  const jobId = action.value;
  const channel = body.channel.id;
  const threadTs = body.message.thread_ts ?? body.message.ts;
  const userId = body.user.id;

  // Mark BEFORE cancelling so a fast pollJobUntilDone tick can't race
  // and observe `cancelled` before we've claimed responsibility.
  selfCancelledJobs.add(jobId);

  try {
    opts.cancelJob(jobId);
  } catch (err) {
    logger.warn(`[molly] cancelJob failed: ${err.message}`);
    // continue — best-effort UI even if backend rejects
  }

  try {
    await client.chat.update({
      channel,
      ts: body.message.ts,
      text: body.message.text ?? '취소됨',
      blocks: stampCancelledBlocks(body.message.blocks, userId),
    });
  } catch (err) {
    logger.warn(`[molly] chat.update failed: ${err.message}`);
  }

  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `❌ <@${userId}> 님이 취소했습니다.`,
  });
}

async function handleRedecomposeOpen({ body, action, client }) {
  const jobId = action.value;
  const channel = body.channel.id;
  const threadTs = body.message.thread_ts ?? body.message.ts;
  const planMsgTs = body.message.ts;

  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: 'modal',
      callback_id: 'molly_redecompose_submit',
      // private_metadata is the round-trip channel — Slack mirrors it
      // back on submission so we know which thread/job to update.
      private_metadata: JSON.stringify({ jobId, channel, threadTs, planMsgTs }),
      title: { type: 'plain_text', text: '계획 다시 세우기' },
      submit: { type: 'plain_text', text: '제출' },
      close: { type: 'plain_text', text: '닫기' },
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              '구체적인 피드백을 남기면 새 계획이 그쪽으로 더 맞춰집니다.\n비워두고 제출해도 됩니다 — 그럼 LLM 이 자유롭게 다시 나눕니다.',
          },
        },
        {
          type: 'input',
          block_id: 'feedback_input',
          optional: true,
          label: { type: 'plain_text', text: '피드백 (선택)' },
          element: {
            type: 'plain_text_input',
            action_id: 'feedback',
            multiline: true,
            placeholder: {
              type: 'plain_text',
              text:
                "예: 1번을 둘로 쪼개고 권한 가드 task 빼줘. 'BETA' 라벨 색은 빨강 말고 주황으로.",
            },
            max_length: 1500,
          },
        },
      ],
    },
  });
}

async function handleRedecomposeSubmit({ body, view, client, logger }) {
  /** @type {{jobId: string, channel: string, threadTs: string, planMsgTs: string}} */
  const meta = JSON.parse(view.private_metadata);
  const { jobId, channel, threadTs, planMsgTs } = meta;
  const feedback =
    view.state?.values?.feedback_input?.feedback?.value?.trim() || '';
  const userId = body.user.id;
  logger.info(
    `[molly] redecompose submit: job=${jobId} user=${userId} feedback="${feedback.slice(0, 80)}"`,
  );

  // Replace the old plan message's buttons with a "이 계획은 다시
  // 세우는 중" badge so the user can't double-click while the
  // re-decompose is in flight.
  try {
    await client.chat.update({
      channel,
      ts: planMsgTs,
      text: '계획을 다시 세우는 중…',
      blocks: stampPendingRedecomposeBlocks(undefined, userId, feedback),
    });
  } catch (err) {
    logger.warn(`[molly] chat.update (pending redecompose) failed: ${err.message}`);
  }

  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: feedback
      ? `🔁 <@${userId}> 님 요청으로 계획을 다시 세우는 중…\n_피드백: ${trunc(feedback, 200)}_`
      : `🔁 <@${userId}> 님 요청으로 계획을 다시 세우는 중…`,
  });

  try {
    opts.redecomposeJob(jobId, feedback || undefined);
    logger.info(`[molly] redecompose kicked: job=${jobId}`);
  } catch (err) {
    logger.error(
      `[molly] redecomposeJob hook threw: ${err?.message ?? err}`,
    );
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `❌ 재계획 시작 실패: ${err.message?.slice(0, 200) ?? String(err)}`,
    });
    return;
  }

  // Wait for the decomposer to land. We watch for `planning` (success
  // — flipped via setJobTasks). `paused` would mean the decomposer
  // crashed mid-call. We deliberately exclude `decomposing` because
  // that's the in-flight state we just transitioned INTO.
  const ready = await waitForStatus(jobId, ['planning', 'paused'], 90_000);
  if (!ready) {
    const cur = opts.getJob(jobId);
    logger.warn(
      `[molly] redecompose timeout: job=${jobId} status=${cur?.status ?? 'unknown'}`,
    );
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `⏱️ 재계획 시간 초과 (90s). 현재 상태: \`${cur?.status ?? 'unknown'}\``,
    });
    return;
  }
  logger.info(
    `[molly] redecompose landed: job=${jobId} status=${ready.status}`,
  );
  const job = opts.getJob(jobId);
  if (job.status === 'paused') {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `❌ 재계획 실패: ${job.pausedReason ?? '(원인 없음)'}`,
    });
    return;
  }

  // Post the new plan as a fresh message — keeps the timeline clear
  // (old plan message is the "stamped pending" version above).
  try {
    await postPlanMessage({ client, channel, threadTs, job });
    logger.info(`[molly] new plan posted to Slack: job=${jobId}`);
  } catch (err) {
    logger.error(
      `[molly] postPlanMessage failed: ${err?.message ?? err}`,
    );
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `⚠️ 새 계획을 Slack 에 표시하지 못했습니다 (\`${err.message?.slice(0, 100) ?? '?'}\`). Playground 에서 확인해주세요.`,
    });
  }
}

function stampPendingRedecomposeBlocks(_originalBlocks, userId, feedback) {
  /** @type {Array<object>} */
  const out = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: feedback
          ? `🔁 <@${userId}> 님이 다시 계획 세우기를 요청했습니다.\n_피드백: ${trunc(feedback, 300)}_`
          : `🔁 <@${userId}> 님이 다시 계획 세우기를 요청했습니다.`,
      },
    },
  ];
  return out;
}

// ── Plan message + button helpers ──────────────────────────────────

async function postPlanMessage({ client, channel, threadTs, job }) {
  const blocks = buildPlanBlocks(job);
  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `📋 작업 계획 (${job.tasks.length} tasks)`, // fallback for clients that don't render blocks
    blocks,
  });
}

function buildPlanBlocks(job) {
  /** @type {Array<object>} */
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `📋 작업 계획 (${job.tasks.length} tasks)`,
      },
    },
  ];

  if (job.tasks.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_(태스크 없음)_' },
    });
  } else {
    // One section per task so the full description (including the
    // 1./2./3. sub-bullets the decomposer emits) makes it through to
    // Slack — the previous compressed version only kept the first
    // line, which dropped the bulk of the user-visible plan.
    // Slack section blocks cap at 3000 chars; trunc to 2500 for safety.
    job.tasks.forEach((t, i) => {
      const desc = normalizeBullets((t.description || '').trim());
      const md = [`*${i + 1}. ${t.title}*`, '', trunc(desc, 2500)].join('\n');
      blocks.push({
        type: 'section',
        text: { type: 'mrkdwn', text: md },
      });
    });
  }

  if (job.targetRoute) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `📍 결과 페이지: \`${job.targetRoute}\``,
        },
      ],
    });
  }

  // QA strategy as part of the plan — surfaces *what verification will
  // happen after the agent's tasks finish* so the user signs off on
  // the whole pipeline, not just the code work.
  if (job.qaStrategy) {
    const label = QA_STRATEGY_LABELS_KO[job.qaStrategy] ?? job.qaStrategy;
    const rationale = job.qaRationaleKo
      ? `\n   _${trunc(job.qaRationaleKo, 200)}_`
      : '';
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🧪 *검증 단계*: ${label}${rationale}`,
      },
    });
  } else {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `🧪 검증 전략 자동 선택 중… (post-approve 결정)`,
        },
      ],
    });
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `Playground: \`${job.playgroundId}\` · Job: \`${job.id}\``,
      },
    ],
  });

  blocks.push({
    type: 'actions',
    block_id: `molly_plan_actions_${job.id}`,
    elements: [
      {
        type: 'button',
        style: 'primary',
        text: { type: 'plain_text', text: '✅ 승인하고 시작' },
        action_id: 'molly_approve',
        value: job.id,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '✏️ 다시 계획' },
        action_id: 'molly_redecompose',
        value: job.id,
      },
      {
        type: 'button',
        style: 'danger',
        text: { type: 'plain_text', text: '❌ 취소' },
        action_id: 'molly_cancel',
        value: job.id,
      },
    ],
  });

  return blocks;
}

function stampApprovedBlocks(originalBlocks, userId) {
  const filtered = (originalBlocks ?? []).filter(
    (b) => b.type !== 'actions',
  );
  filtered.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `✅ <@${userId}> 님이 승인했습니다`,
      },
    ],
  });
  return filtered;
}

function stampCancelledBlocks(originalBlocks, userId) {
  const filtered = (originalBlocks ?? []).filter(
    (b) => b.type !== 'actions',
  );
  filtered.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `❌ <@${userId}> 님이 취소했습니다`,
      },
    ],
  });
  return filtered;
}

// ── Polling ────────────────────────────────────────────────────────

async function waitForStatus(jobId, statuses, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = opts.getJob(jobId);
    if (job && statuses.includes(job.status)) return job;
    await sleep(1000);
  }
  return null;
}

/**
 * Per-task status values we surface to Slack as a thread message.
 * `pending` / `blocked` are hidden — they're noise since they don't
 * mean the agent is doing anything yet.
 */
const ANNOUNCEABLE_TASK_STATUSES = new Set([
  'running',
  'committed',
  'reviewed',
  'failed',
  'skipped',
]);

function taskTransitionMessage(task, idx, total) {
  const num = `${idx + 1}/${total}`;
  const title = task.title || '(no title)';
  switch (task.status) {
    case 'running':
      return `🔧 *${num} ${title}* — 작업 중…`;
    case 'committed':
      return `🔍 *${num} ${title}* — 검토 중…`;
    case 'reviewed':
      return `✅ *${num} ${title}* — 통과`;
    case 'failed': {
      const notes = task.review?.notes?.slice(0, 240) || '(원인 없음)';
      return `❌ *${num} ${title}* — 검토 실패\n_${notes}_`;
    }
    case 'skipped':
      return `⏭ *${num} ${title}* — 건너뜀`;
    default:
      return null;
  }
}

/**
 * Watch a job until it reaches a terminal-ish state (qa / complete /
 * cancelled / paused) and post a final summary. Posts per-task
 * transition messages along the way so the user sees liveness in
 * Slack instead of wondering if molly froze. Times out at 30 min.
 */
async function pollJobUntilDone({ client, channel, threadTs, jobId }) {
  // Idempotency guard — see watchedJobs comment.
  if (watchedJobs.has(jobId)) return;
  watchedJobs.add(jobId);
  try {
    return await pollJobUntilDoneInner({ client, channel, threadTs, jobId });
  } finally {
    watchedJobs.delete(jobId);
  }
}

async function pollJobUntilDoneInner({ client, channel, threadTs, jobId }) {
  const TIMEOUT_MS = 30 * 60 * 1000;
  const deadline = Date.now() + TIMEOUT_MS;
  /** @type {string | null} */
  let lastStatus = null;
  /** @type {Map<string, string>} */
  const announcedTaskState = new Map();
  // Slack message ts of the live "current state" line per task. The
  // first announcement creates a message; subsequent transitions
  // *edit* the same message in-place. Result: one line per task in
  // the thread that evolves "🔧 작업 중 → 🔍 검토 중 → ✅ 통과"
  // instead of three separate messages. Cuts thread noise ~3x.
  /** @type {Map<string, string>} */
  const taskMessageTs = new Map();
  // Dedupe per job-status announcements — without this, a job that
  // sits in `paused` for several poll cycles would re-spam the same
  // ⏸ message every 4s.
  /** @type {Set<string>} */
  const announcedJobStates = new Set();
  // True on the first iteration only. Used to suppress announcements
  // for states the original poll loop already surfaced (e.g.
  // restart-resumption attaching to a job that's been done for
  // hours — without this guard we'd re-post every task transition
  // and the completion message).
  let isFirstPollIteration = true;

  while (Date.now() < deadline) {
    await sleep(4000);
    // Snapshot the first-iteration flag and immediately clear it.
    // Multiple `continue` paths below mean a single end-of-loop
    // assignment is fragile; this pattern guarantees the flag flips
    // exactly once.
    const wasFirstIteration = isFirstPollIteration;
    isFirstPollIteration = false;

    const job = opts.getJob(jobId);
    if (!job) {
      await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: '⚠️ Job 이 사라졌습니다. (상태 추적 중단)',
      });
      return;
    }

    if (job.status !== lastStatus) {
      lastStatus = job.status;
    }

    // Per-task transitions — post one message per (task, status)
    // pair. Map dedupes so subsequent polls don't re-announce the
    // same state.
    //
    // First-observation filter: when a poll loop starts on a job
    // whose tasks are *already* in a terminal state (e.g. an
    // orchestrator restart re-attached us to a long-since-completed
    // job), don't announce those terminal states — they were already
    // surfaced by the original poll loop. Only announce active
    // transitions (running / committed) on first observation; record
    // reviewed/failed/skipped silently.
    if (Array.isArray(job.tasks)) {
      for (let i = 0; i < job.tasks.length; i++) {
        const t = job.tasks[i];
        if (!t?.id) continue;
        if (!ANNOUNCEABLE_TASK_STATUSES.has(t.status)) continue;
        if (announcedTaskState.get(t.id) === t.status) continue;
        const isFirstSeen = !announcedTaskState.has(t.id);
        const isTerminalStatus =
          t.status === 'reviewed' ||
          t.status === 'failed' ||
          t.status === 'skipped';
        if (wasFirstIteration && isFirstSeen && isTerminalStatus) {
          announcedTaskState.set(t.id, t.status);
          continue;
        }
        const msg = taskTransitionMessage(t, i, job.tasks.length);
        if (!msg) {
          announcedTaskState.set(t.id, t.status);
          continue;
        }
        const existingTs = taskMessageTs.get(t.id);
        if (existingTs) {
          // Edit the existing per-task message in-place so the thread
          // shows ONE line per task that evolves through states.
          try {
            await client.chat.update({
              channel,
              ts: existingTs,
              text: msg,
            });
          } catch {
            // Edit failed (message too old, deleted, etc.) — fall back
            // to a fresh post so the user still sees the transition.
            try {
              const r = await client.chat.postMessage({
                channel,
                thread_ts: threadTs,
                text: msg,
              });
              if (r?.ts) taskMessageTs.set(t.id, r.ts);
            } catch {
              /* swallow */
            }
          }
        } else {
          try {
            const r = await client.chat.postMessage({
              channel,
              thread_ts: threadTs,
              text: msg,
            });
            if (r?.ts) taskMessageTs.set(t.id, r.ts);
          } catch {
            /* best-effort — keep polling even if one post fails */
          }
        }
        announcedTaskState.set(t.id, t.status);
      }
    }

    if (job.status === 'cancelled') {
      if (selfCancelledJobs.has(jobId)) {
        // We posted the cancellation in handleCancel — don't duplicate.
        selfCancelledJobs.delete(jobId);
        return;
      }
      // External cancellation (Playground UI, curl, etc.) — surface it
      // in the Slack thread so the user sees the same signal on both
      // surfaces.
      await client.chat.postMessage({
        channel,
        thread_ts: threadTs,
        text: [
          '❌ 작업이 취소되었습니다 (Playground 또는 외부에서)',
          ``,
          `Playground: ${PLAYGROUND_BASE_URL}/${job.playgroundId}`,
        ].join('\n'),
      });
      return;
    }

    if (job.status === 'paused') {
      if (!announcedJobStates.has('paused')) {
        if (!wasFirstIteration) {
          await client.chat.postMessage({
            channel,
            thread_ts: threadTs,
            text: [
              `⏸️ 작업 일시정지: ${job.pausedReason ?? '(원인 없음)'}`,
              ``,
              `Playground 에서 확인 필요: ${PLAYGROUND_BASE_URL}/${job.playgroundId}`,
            ].join('\n'),
          });
        }
        announcedJobStates.add('paused');
      }
      // Keep polling — the user may resume, retry, accept-anyway, or
      // cancel from the playground. Each of those flips the status
      // and we want to surface it on the next poll.
      continue;
    }

    // Resumed from paused → clear the dedupe flag so the *next* time
    // it pauses we announce again.
    if (lastStatus !== 'paused' && announcedJobStates.has('paused')) {
      announcedJobStates.delete('paused');
    }

    if (job.status === 'qa' || job.status === 'complete') {
      if (!announcedJobStates.has('done')) {
        if (!wasFirstIteration) {
          await postCompletionMessage({ client, channel, threadTs, job });
        }
        announcedJobStates.add('done');
      }
      // `complete` is truly terminal; bail. `qa` is "auto-runner
      // finished, awaiting human approval" — could still be cancelled
      // or marked-pass; keep polling so we surface those events.
      if (job.status === 'complete') return;
      continue;
    }
  }

  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `⏱️ 작업 시간 초과 (30분). Playground 에서 확인하세요: ${PLAYGROUND_BASE_URL}/${jobId}`,
  });
}

async function postCompletionMessage({ client, channel, threadTs, job }) {
  const reviewedCount = job.tasks.filter((t) => t.status === 'reviewed').length;
  const skippedCount = job.tasks.filter((t) => t.status === 'skipped').length;
  const playgroundUrl = `${PLAYGROUND_BASE_URL}/${job.playgroundId}`;

  /** @type {string[]} */
  const lines = [];
  lines.push(`🎉 작업 완료! (job: \`${job.id}\`)`);
  lines.push('');
  lines.push(`• 완료 task: ${reviewedCount}/${job.tasks.length}` + (skippedCount > 0 ? ` (스킵 ${skippedCount})` : ''));

  if (job.qaAutoResult) {
    const passed = job.qaAutoResult.passed;
    const emoji = passed ? '✅' : '⚠️';
    const verdict = passed ? '통과' : '실패';
    lines.push(`• 자동 QA: ${emoji} ${verdict} — ${trunc(job.qaAutoResult.notes ?? '', 120)}`);
  } else if (job.qaStrategy) {
    lines.push(`• 자동 QA: ${job.qaStrategy} (실행 대기 중)`);
  }

  if (job.targetRoute) {
    lines.push(`• 결과 페이지: \`${job.targetRoute}\``);
  }

  lines.push(`• Playground: ${playgroundUrl}`);
  lines.push('');
  lines.push(
    'Playground 에서 직접 확인 후 *✅ QA 통과* / *🚀 Promote* 진행해주세요. (Slack 인터랙션은 다음 슬라이스에서 추가됩니다.)',
  );

  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: lines.join('\n'),
  });
}

// ── Lifecycle ──────────────────────────────────────────────────────

export async function stopMolly() {
  if (!appInstance) return;
  try {
    await appInstance.stop();
  } catch (err) {
    console.warn('[molly] stop error:', err.message);
  } finally {
    appInstance = null;
  }
}
