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
import {
  getPlaygroundIdForThread,
  setPlaygroundIdForThread,
  clearPlaygroundForThread,
} from './slack-thread-map.js';

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
 * @property {(id: string) => any} markQaPass
 * @property {(id: string) => void} rerunQa
 * @property {(jobId: string, taskId: string, actionMeta?: {reason?: string|null, reasonText?: string|null}) => any} retryTask
 * @property {(jobId: string, taskId: string, actionMeta?: {reason?: string|null, reasonText?: string|null}) => any} acceptTask
 * @property {(jobId: string, taskId: string, actionMeta?: {reason?: string|null, reasonText?: string|null}) => any} skipTaskJob
 * @property {(id: string) => Promise<{prUrl?: string, branch?: string}>} promoteJob
 * @property {(args: {title?: string, createdBy?: string, prdUrl?: string, jiraUrl?: string}) => Promise<any>} createPlayground
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
 * Jobs whose plan was approved via molly's own ✅ button. Mirror of
 * selfCancelledJobs — `handleApprove` adds before flipping status, and
 * `pollJobUntilDoneInner` consumes-and-clears when it observes the
 * `planning → delegating` transition. External approves (Playground UI,
 * curl, Chrome ext) are NOT in this set, so the poll loop announces
 * them in Slack thread + stamps the plan card buttons as inactive.
 *
 * @type {Set<string>}
 */
const selfApprovedJobs = new Set();

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
 * Phase 3 Task 3.1 sub-phase D — Slack thread reply 를 IntakeHistoryTurn[]
 * 으로 변환. dispatcher 가 prev kind 보고 multi-turn (clarification +
 * plan) 라우팅. Slack 은 message metadata 가 plain text 라 kind 는 휴리
 * 스틱:
 *  - assistant message ("🤔 " 접두사) → code_change_ambiguous
 *  - 그 외 bot 메시지 → chat
 *  - 사용자 메시지 → user (no kind)
 *
 * @param {object} client — Slack bolt App.client
 * @param {string} channel
 * @param {string} threadTs — Slack thread ts (event.thread_ts ?? event.ts)
 * @param {string} excludeTs — 현재 처리 중인 mention 의 ts (history 에서 제외)
 * @returns {Promise<Array<{role:'user'|'assistant', content:string, kind?:string}>>}
 */
async function buildSlackHistory(client, channel, threadTs, excludeTs) {
  if (!threadTs || !client) return [];
  try {
    const resp = await client.conversations.replies({
      channel,
      ts: threadTs,
      limit: 20,
    });
    const messages = Array.isArray(resp?.messages) ? resp.messages : [];
    const history = [];
    for (const m of messages) {
      if (!m || m.ts === excludeTs) continue; // skip current trigger
      const text = String(m.text || '').replace(/<@[A-Z0-9]+>\s*/g, '').trim();
      if (!text) continue;
      // bot 메시지 (Slack app 응답) — bot_id 또는 bot_profile 있으면 assistant.
      const isBot = !!m.bot_id || !!m.bot_profile || m.subtype === 'bot_message';
      if (isBot) {
        const kind = text.startsWith('🤔') ? 'code_change_ambiguous' : 'chat';
        history.push({ role: 'assistant', content: text.slice(0, 1000), kind });
      } else {
        history.push({ role: 'user', content: text.slice(0, 1000) });
      }
    }
    return history.slice(-10); // last 10 turns 만 — 토큰 비용
  } catch (err) {
    console.warn(`[molly] buildSlackHistory failed: ${err.message?.slice(0, 80)}`);
    return [];
  }
}

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

  // "✅ QA 통과" — flips status qa → complete. The poll loop catches
  // the transition and posts the Promote message.
  appInstance.action('molly_qa_pass', async (ctx) => {
    await ctx.ack();
    try {
      await handleQaPass(ctx);
    } catch (err) {
      ctx.logger.error(`[molly] handleQaPass crashed: ${err?.stack ?? err}`);
    }
  });

  // "🔁 자동 QA 재실행" — re-fires the picked QA strategy.
  appInstance.action('molly_qa_rerun', async (ctx) => {
    await ctx.ack();
    try {
      await handleQaRerun(ctx);
    } catch (err) {
      ctx.logger.error(`[molly] handleQaRerun crashed: ${err?.stack ?? err}`);
    }
  });

  // "🚀 Promote" — turns the playground's commits into a GitHub PR.
  appInstance.action('molly_promote', async (ctx) => {
    await ctx.ack();
    try {
      await handlePromote(ctx);
    } catch (err) {
      ctx.logger.error(`[molly] handlePromote crashed: ${err?.stack ?? err}`);
    }
  });

  // "📺 Playground 보기" — pure URL button; just ack so Slack
  // doesn't show a "didn't respond" warning.
  appInstance.action('molly_open_playground', async (ctx) => {
    await ctx.ack();
  });

  // Task-failure resolution buttons. value="${jobId}:${taskId}".
  appInstance.action('molly_task_retry', async (ctx) => {
    await ctx.ack();
    try {
      await handleTaskAction(ctx, 'retry');
    } catch (err) {
      ctx.logger.error(`[molly] handleTaskAction retry crashed: ${err?.stack ?? err}`);
    }
  });
  appInstance.action('molly_task_accept', async (ctx) => {
    await ctx.ack();
    try {
      await handleTaskAction(ctx, 'accept');
    } catch (err) {
      ctx.logger.error(`[molly] handleTaskAction accept crashed: ${err?.stack ?? err}`);
    }
  });
  appInstance.action('molly_task_skip', async (ctx) => {
    await ctx.ack();
    try {
      await handleTaskAction(ctx, 'skip');
    } catch (err) {
      ctx.logger.error(`[molly] handleTaskAction skip crashed: ${err?.stack ?? err}`);
    }
  });

  // Modal submit — calls the appropriate lib hook with reason picker result.
  appInstance.view('molly_task_action_submit', async (ctx) => {
    await ctx.ack();
    try {
      await handleTaskActionSubmit(ctx);
    } catch (err) {
      ctx.logger.error(`[molly] handleTaskActionSubmit crashed: ${err?.stack ?? err}`);
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

  // Typing indicator — classifier + LLM 합산 1-1.5s 지연 동안 UX 신호.
  // thread reply 로 "🤔 잠깐만요…" 보내고 chat/status 응답 후 delete.
  let thinkingTs = null;
  try {
    const r = await say({ thread_ts: threadTs, text: '🤔 잠깐만요…' });
    thinkingTs = r?.ts ?? null;
  } catch { /* swallow — indicator 실패해도 본 흐름 이어감 */ }

  // Phase 3 Task 3.3 — Phase 1 의 인라인 분기 (classifier + analyzer 별개)
  // 를 processIntake 단일 호출로 정리. /api/molly/respond 가 하던 4 종
  // kind 분기를 라이브러리 호출로 흡수 — surface 별 중복 제거.
  // Sub-phase D — thread reply 를 history 로 변환해 동봉 → multi-turn
  // (clarification + plan) 가 dispatcher 에서 작동.
  // 폴백: intake 자체 throw (network / API key 없음 등) 시 안전하게 chat
  // 응답으로 (잡 안 만드는 게 부작용 0).
  let result;
  try {
    const { processIntake } = await import('./molly-intake.js');
    const history = await buildSlackHistory(client, event.channel, threadTs, event.ts);
    result = await processIntake(text, {
      surface: 'slack',
      listJobs: opts.listJobs,
      getJob: opts.getJob,
      channel: event.channel,
      threadTs,
      history,
    });
  } catch (err) {
    logger.warn(`[molly] processIntake failed, falling back to chat: ${err.message}`);
    result = {
      kind: 'chat',
      reason: 'intake failed',
      response: `⚠️ 잠시 문제가 있어요. 다시 시도해 주세요. (${err.message?.slice(0, 100) ?? ''})`,
    };
  }

  if (result.kind === 'chat' || result.kind === 'status_query') {
    if (thinkingTs) {
      try { await client.chat.delete({ channel: event.channel, ts: thinkingTs }); } catch {}
    }
    await say({ thread_ts: threadTs, text: result.response || '(빈 응답)' });
    return;
  }

  if (result.kind === 'code_change_ambiguous') {
    if (thinkingTs) {
      try { await client.chat.delete({ channel: event.channel, ts: thinkingTs }); } catch {}
    }
    await say({
      thread_ts: threadTs,
      text: `🤔 ${result.clarifyingQuestion}`,
    });
    return;
  }

  // result.kind === 'code_change_clear' — 기존 흐름 (createJob ...).
  // thinking indicator 는 잡 plan post 후 자연스럽게 사라지게 둠
  // (사용자가 "🛠️ 받았습니다" 메시지 보고 indicator 사라지면 OK).
  if (thinkingTs) {
    try { await client.chat.delete({ channel: event.channel, ts: thinkingTs }); } catch {}
  }

  // code_change — Slack thread → playground 1:1 매핑.
  // 같은 thread 의 후속 멘션은 같은 playground 를 reuse, 다른 thread
  // 는 다른 playground. 매핑 없거나 가리키는 playground 가 inactive
  // 면 새 playground 부팅.
  let playgroundId = getPlaygroundIdForThread(event.channel, threadTs);
  let pg = playgroundId ? opts.getPlayground(playgroundId) : null;
  if (!pg || pg.status !== 'active') {
    if (playgroundId) {
      // Stale 매핑 (archived/hibernated/삭제) — clear 후 새로 만듦.
      clearPlaygroundForThread(event.channel, threadTs);
      playgroundId = null;
      pg = null;
    }
    // 매핑 없는 첫 멘션 = 새 thread = 새 playground. MOLLY_PLAYGROUND_ID
    // legacy fallback 은 의도적으로 제거 — "Slack thread = playground 1:1"
    // 정책의 핵심. 새 thread 면 무조건 새 playground (createPlayground 분기).
  }
  if (!pg) {
    if (!opts?.createPlayground) {
      await say({
        thread_ts: threadTs,
        text: '⚠️ Playground 생성 hook 이 없습니다. 서버 설정을 확인해주세요.',
      });
      return;
    }
    await say({
      thread_ts: threadTs,
      text: '🐣 새 Playground 부팅 중… (~30초 소요)',
    });
    try {
      pg = await opts.createPlayground({
        title: `Slack: ${trunc(text, 60)}`,
        createdBy: `molly (slack ${event.user || 'unknown'})`,
      });
      playgroundId = pg.id;
      setPlaygroundIdForThread(event.channel, threadTs, playgroundId);
    } catch (err) {
      await say({
        thread_ts: threadTs,
        text: `❌ Playground 생성 실패: ${err.message?.slice(0, 200) ?? err}`,
      });
      return;
    }
  }

  // Create job + kick decomposer.
  let job;
  try {
    job = opts.createJob({
      playgroundId,
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
    appendChatMessages(playgroundId, [
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

  const playgroundUrl = `${PLAYGROUND_BASE_URL}/${playgroundId}`;
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

  // Mark BEFORE flipping status so a fast pollJobUntilDoneInner tick
  // can't race and observe `delegating` before we've claimed responsibility.
  // Mirrors selfCancelledJobs pattern.
  selfApprovedJobs.add(jobId);

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

async function handleQaPass({ body, action, client, logger }) {
  const jobId = action.value;
  const channel = body.channel.id;
  const threadTs = body.message.thread_ts ?? body.message.ts;
  const userId = body.user.id;

  try {
    opts.markQaPass(jobId);
    logger.info(`[molly] qa-pass: job=${jobId} user=${userId}`);
  } catch (err) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `❌ QA 통과 실패: ${err.message?.slice(0, 200) ?? String(err)}`,
    });
    return;
  }

  // Disable the buttons on the original completion message — the poll
  // loop will post the Promote follow-up shortly.
  try {
    await client.chat.update({
      channel,
      ts: body.message.ts,
      text: body.message.text ?? 'QA 통과됨',
      blocks: stampQaPassedBlocks(body.message.blocks, userId),
    });
  } catch (err) {
    logger.warn(`[molly] chat.update (qa-pass) failed: ${err.message}`);
  }
}

async function handleQaRerun({ body, action, client, logger }) {
  const jobId = action.value;
  const channel = body.channel.id;
  const threadTs = body.message.thread_ts ?? body.message.ts;
  const userId = body.user.id;

  try {
    opts.rerunQa(jobId);
    logger.info(`[molly] qa-rerun: job=${jobId} user=${userId}`);
  } catch (err) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `❌ QA 재실행 실패: ${err.message?.slice(0, 200) ?? String(err)}`,
    });
    return;
  }

  // Re-running QA stamps a placeholder result so the poll loop sees
  // a state change. Allow the poll loop to re-announce by clearing
  // the qa-landed flag — wait, that's local to this loop. Easiest
  // path: announce via a fresh thread reply now.
  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `🔁 <@${userId}> 님이 자동 QA 재실행을 요청했습니다…`,
  });
}

async function handlePromote({ body, action, client, logger }) {
  const jobId = action.value;
  const channel = body.channel.id;
  const threadTs = body.message.thread_ts ?? body.message.ts;
  const userId = body.user.id;

  // Disable the buttons immediately so concurrent clicks don't fire
  // multiple promote attempts (each creates a PR).
  try {
    await client.chat.update({
      channel,
      ts: body.message.ts,
      text: body.message.text ?? 'Promote 진행 중',
      blocks: stampPromotePendingBlocks(body.message.blocks, userId),
    });
  } catch (err) {
    logger.warn(`[molly] chat.update (promote-pending) failed: ${err.message}`);
  }

  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `🚀 <@${userId}> 님이 Promote 를 요청했습니다. PR 생성 중…`,
  });

  /** @type {{prUrl?: string, branch?: string} | undefined} */
  let result;
  try {
    result = await opts.promoteJob(jobId);
    logger.info(`[molly] promote done: job=${jobId} pr=${result?.prUrl}`);
  } catch (err) {
    logger.error(`[molly] promote failed: ${err.message}`);
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `❌ Promote 실패: ${err.message?.slice(0, 240) ?? String(err)}`,
    });
    return;
  }

  if (result?.prUrl) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `✅ Promote 완료!\n🔗 PR: ${result.prUrl}\n_GitHub 에서 머지하면 끝._`,
    });
  } else {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `✅ Promote 완료 (PR URL 못 받음 — Playground 헤더에서 확인하세요).`,
    });
  }
}

/** Reason picker options — mirrors Chrome ext Slice 3 ACTION_REASONS enum. */
const TASK_ACTION_REASON_OPTIONS = [
  { text: { type: 'plain_text', text: '문법/타입 에러' }, value: 'syntax_error' },
  { text: { type: 'plain_text', text: '논리/구현 오류' }, value: 'logic_error' },
  { text: { type: 'plain_text', text: '범위 벗어남' }, value: 'scope_creep' },
  { text: { type: 'plain_text', text: '부분 구현' }, value: 'partial' },
  { text: { type: 'plain_text', text: '잘못된 파일' }, value: 'wrong_target' },
  { text: { type: 'plain_text', text: '오버 딜리버' }, value: 'over_delivered' },
  { text: { type: 'plain_text', text: '기타' }, value: 'other' },
];

/**
 * Generic handler for the three task-failure buttons. `mode` selects
 * which orchestrator hook to call:
 *   - retry   → opts.retryTask    (re-run the same task)
 *   - accept  → opts.acceptTask    (mark reviewed, accept-anyway)
 *   - skip    → opts.skipTaskJob   (skip + cascade blocked)
 *
 * value is encoded as "${jobId}:${taskId}".
 *
 * Instead of calling the lib immediately, opens a reason picker modal.
 * The actual lib call happens in handleTaskActionSubmit (view submit handler).
 */
async function handleTaskAction({ body, action, client, logger }, mode) {
  const raw = String(action.value ?? '');
  const sepIdx = raw.indexOf(':');
  if (sepIdx === -1) {
    logger.warn(`[molly] task action: malformed value=${raw}`);
    return;
  }
  const jobId = raw.slice(0, sepIdx);
  const taskId = raw.slice(sepIdx + 1);
  const channel = body.channel.id;
  const threadTs = body.message.thread_ts ?? body.message.ts;
  const msgTs = body.message.ts;

  const verbMap = { retry: '재시도', accept: '그대로 통과', skip: '건너뛰기' };
  const verb = verbMap[mode];
  if (!verb) {
    logger.warn(`[molly] task action: unknown mode=${mode}`);
    return;
  }

  await client.views.open({
    trigger_id: body.trigger_id,
    view: {
      type: 'modal',
      callback_id: 'molly_task_action_submit',
      private_metadata: JSON.stringify({ jobId, taskId, mode, channel, threadTs, msgTs }),
      title: { type: 'plain_text', text: verb },
      submit: { type: 'plain_text', text: '확인' },
      close: { type: 'plain_text', text: '취소' },
      blocks: [
        {
          type: 'input',
          block_id: 'reason_block',
          optional: true,
          label: { type: 'plain_text', text: '사유 (선택)' },
          element: {
            type: 'static_select',
            action_id: 'reason',
            placeholder: { type: 'plain_text', text: '사유 선택…' },
            options: TASK_ACTION_REASON_OPTIONS,
          },
        },
        {
          type: 'input',
          block_id: 'reason_text_block',
          optional: true,
          label: { type: 'plain_text', text: '추가 설명 (선택)' },
          element: {
            type: 'plain_text_input',
            action_id: 'reason_text',
            multiline: true,
            max_length: 500,
            placeholder: { type: 'plain_text', text: '예: 3번 페이지에서 i18n 키가 충돌해서 …' },
          },
        },
      ],
    },
  });
  logger.info(`[molly] task action modal opened: mode=${mode} job=${jobId} task=${taskId}`);
}

/**
 * View submit handler for the task-action reason picker modal.
 * Extracts reason / reasonText, calls the appropriate lib hook with actionMeta,
 * then stamps the original message and posts a thread update.
 */
async function handleTaskActionSubmit({ body, view, client, logger }) {
  /** @type {{jobId: string, taskId: string, mode: string, channel: string, threadTs: string, msgTs: string}} */
  const meta = JSON.parse(view.private_metadata);
  const { jobId, taskId, mode, channel, threadTs, msgTs } = meta;
  const userId = body.user.id;

  const reason =
    view.state?.values?.reason_block?.reason?.selected_option?.value ?? null;
  const reasonText =
    view.state?.values?.reason_text_block?.reason_text?.value?.trim() || null;
  const actionMeta = { reason, reasonText };

  const verbMap = { retry: '재시도', accept: '그대로 통과', skip: '건너뛰기' };
  const verb = verbMap[mode] ?? mode;

  const hookMap = {
    retry: () => opts.retryTask(jobId, taskId, actionMeta),
    accept: () => opts.acceptTask(jobId, taskId, actionMeta),
    skip: () => opts.skipTaskJob(jobId, taskId, actionMeta),
  };
  const runHook = hookMap[mode];
  if (!runHook) {
    logger.warn(`[molly] task action submit: unknown mode=${mode}`);
    return;
  }

  try {
    runHook();
    logger.info(
      `[molly] task action ${mode}: job=${jobId} task=${taskId} user=${userId} reason=${reason}`,
    );
  } catch (err) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `❌ Task ${verb} 실패: ${err.message?.slice(0, 200) ?? String(err)}`,
    });
    return;
  }

  // Strip buttons and stamp who-did-what so the user sees the
  // resolution in-place. Future task transitions for this same task
  // (e.g. retry → running → reviewed) will replace this via the
  // chat.update path.
  try {
    // Fetch the original message blocks via conversations.history
    // (view submit ctx doesn't carry body.message). We use the msgTs
    // we stashed in private_metadata.
    const hist = await client.conversations.history({
      channel,
      latest: msgTs,
      inclusive: true,
      limit: 1,
    });
    const original = hist?.messages?.[0]?.blocks ?? [];
    const filtered = original.filter((b) => b.type !== 'actions');
    const reasonLabel = reason
      ? TASK_ACTION_REASON_OPTIONS.find((o) => o.value === reason)?.text?.text ?? reason
      : null;
    const stampText = reasonLabel
      ? `↳ <@${userId}> 님이 *${verb}* 처리했습니다 — _${reasonLabel}${reasonText ? ': ' + reasonText.slice(0, 100) : ''}_`
      : `↳ <@${userId}> 님이 *${verb}* 처리했습니다`;
    filtered.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: stampText }],
    });
    await client.chat.update({
      channel,
      ts: msgTs,
      text: `${verb} 처리됨`,
      blocks: filtered,
    });
  } catch (err) {
    logger.warn(`[molly] chat.update (task action submit) failed: ${err.message}`);
  }
}

function stampQaPassedBlocks(originalBlocks, userId) {
  const filtered = (originalBlocks ?? []).filter((b) => b.type !== 'actions');
  filtered.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `✅ <@${userId}> 님이 QA 통과 처리했습니다`,
      },
    ],
  });
  return filtered;
}

function stampPromotePendingBlocks(originalBlocks, userId) {
  const filtered = (originalBlocks ?? []).filter((b) => b.type !== 'actions');
  filtered.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `🚀 <@${userId}> 님이 Promote 진행 중…`,
      },
    ],
  });
  return filtered;
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
  const result = await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `📋 작업 계획 (${job.tasks.length} tasks)`, // fallback for clients that don't render blocks
    blocks,
  });
  // Persist plan card ts so polling can chat.update it on external
  // approve/cancel transitions (Playground UI / curl / Chrome ext).
  // Without this, plan card buttons stay clickable after external
  // approve and Slack thread doesn't reflect the state change.
  if (result?.ts) {
    try {
      opts.setJobSlackContext(job.id, { planMessageTs: result.ts });
    } catch (err) {
      // best-effort — polling fallback (post fresh thread reply) still works
      console.warn(`[molly] setJobSlackContext planMessageTs failed: ${err?.message ?? err}`);
    }
  }
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

  // PRD-specific risks the decomposer flagged. Skip the section
  // entirely when empty so plan UI stays compact for boring jobs.
  if (Array.isArray(job.risksKo) && job.risksKo.length > 0) {
    const risksLines = job.risksKo
      .map((r, i) => `${i + 1}. ${trunc(r, 200)}`)
      .join('\n');
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `⚠️ *주의사항 (이 작업 특화)*\n${risksLines}`,
      },
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

/**
 * External-source variants — Playground UI / curl / Chrome ext 가
 * status 를 바꾼 케이스. userId 가 없어 source 라벨 ("Playground 등
 * 외부") 만 표시. plan card buttons 같이 제거.
 */
function stampExternallyApprovedBlocks(originalBlocks) {
  const filtered = (originalBlocks ?? []).filter(
    (b) => b.type !== 'actions',
  );
  filtered.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `✅ Playground 또는 외부에서 승인됐습니다`,
      },
    ],
  });
  return filtered;
}

function stampExternallyCancelledBlocks(originalBlocks) {
  const filtered = (originalBlocks ?? []).filter(
    (b) => b.type !== 'actions',
  );
  filtered.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: `❌ Playground 또는 외부에서 취소됐습니다`,
      },
    ],
  });
  return filtered;
}

/**
 * Fetch the current blocks of a Slack message via conversations.history.
 * Used by the poll loop to stamp the plan card on external transitions
 * (we don't store original blocks anywhere — Slack does).
 *
 * @param {object} client
 * @param {string} channel
 * @param {string} ts
 * @returns {Promise<Array<object> | null>}
 */
async function fetchSlackMessageBlocks(client, channel, ts) {
  try {
    const r = await client.conversations.history({
      channel,
      latest: ts,
      oldest: ts,
      inclusive: true,
      limit: 1,
    });
    return r?.messages?.[0]?.blocks ?? null;
  } catch {
    return null;
  }
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
 * For task transitions: returns the slack `text` and (when relevant)
 * `blocks` payload. Non-failed states just send text. Failed states
 * attach a row of [🔁 재시도] [✅ 그대로 통과] [⏭ 건너뛰기] buttons so
 * the user can resolve from Slack instead of switching to the
 * Playground.
 *
 * @param {object} task
 * @param {number} idx
 * @param {number} total
 * @param {string} jobId
 * @returns {{ text: string | null, blocks?: Array<object> }}
 */
function taskTransitionPayload(task, idx, total, jobId) {
  const text = taskTransitionMessage(task, idx, total);
  if (!text) return { text: null };
  if (task.status !== 'failed') return { text };
  const value = `${jobId}:${task.id}`;
  return {
    text,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text } },
      {
        type: 'actions',
        block_id: `molly_task_actions_${task.id}`,
        elements: [
          {
            type: 'button',
            style: 'primary',
            text: { type: 'plain_text', text: '🔁 재시도' },
            action_id: 'molly_task_retry',
            value,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '✅ 그대로 통과' },
            action_id: 'molly_task_accept',
            value,
          },
          {
            type: 'button',
            style: 'danger',
            text: { type: 'plain_text', text: '⏭ 건너뛰기' },
            action_id: 'molly_task_skip',
            value,
          },
        ],
      },
    ],
  };
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

    const prevStatus = lastStatus;
    if (job.status !== lastStatus) {
      lastStatus = job.status;
    }

    // External approve detection — `planning` 에서 다른 상태로 빠진
    // 트랜지션이 molly 자체 ✅ 버튼 (selfApprovedJobs) 가 아니면
    // Playground/Chrome ext/curl 가 트리거. Slack thread 에 알림 +
    // plan card 의 버튼 비활성화. 첫 iteration 은 historical resume
    // 일 수 있어 skip.
    if (
      prevStatus === 'planning' &&
      job.status !== 'planning' &&
      !wasFirstIteration &&
      !announcedJobStates.has('externally-approved')
    ) {
      if (selfApprovedJobs.has(jobId)) {
        // We posted the approval in handleApprove — don't duplicate.
        selfApprovedJobs.delete(jobId);
        announcedJobStates.add('externally-approved');
      } else if (job.status !== 'cancelled') {
        // External approve (or redecompose if status === 'decomposing').
        // For redecompose we don't surface here — handleRedecomposeSubmit
        // already handles its own UI flow when triggered from Slack.
        // External Playground redecompose is acceptable to skip in v0.
        announcedJobStates.add('externally-approved');
        const planTs = job.slackContext?.planMessageTs;
        if (planTs) {
          const blocks = await fetchSlackMessageBlocks(client, channel, planTs);
          if (blocks) {
            try {
              await client.chat.update({
                channel,
                ts: planTs,
                text: '계획이 외부에서 승인됐습니다',
                blocks: stampExternallyApprovedBlocks(blocks),
              });
            } catch (err) {
              /* swallow — fallback message below still surfaces signal */
            }
          }
        }
        if (job.status === 'decomposing') {
          await client.chat.postMessage({
            channel,
            thread_ts: threadTs,
            text: '🔁 Playground 또는 외부에서 계획을 다시 세우는 중입니다…',
          });
        } else {
          await client.chat.postMessage({
            channel,
            thread_ts: threadTs,
            text: '✅ Playground 또는 외부에서 계획이 승인됐습니다. 작업을 시작합니다…',
          });
        }
      }
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
        const payload = taskTransitionPayload(t, i, job.tasks.length, jobId);
        if (!payload.text) {
          announcedTaskState.set(t.id, t.status);
          continue;
        }
        const existingTs = taskMessageTs.get(t.id);
        // Always pass `blocks` so transitioning failed → reviewed (via
        // accept-anyway) clears the action buttons by replacing the
        // blocks array. Slack treats omitted `blocks` as "leave
        // existing blocks" on chat.update, which would leave stale
        // buttons hanging around.
        const updateArgs = {
          channel,
          ts: existingTs ?? '',
          text: payload.text,
          blocks: payload.blocks ?? [
            { type: 'section', text: { type: 'mrkdwn', text: payload.text } },
          ],
        };
        if (existingTs) {
          // Edit the existing per-task message in-place so the thread
          // shows ONE line per task that evolves through states.
          try {
            await client.chat.update(updateArgs);
          } catch {
            // Edit failed (message too old, deleted, etc.) — fall back
            // to a fresh post so the user still sees the transition.
            try {
              const r = await client.chat.postMessage({
                channel,
                thread_ts: threadTs,
                text: payload.text,
                blocks: payload.blocks,
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
              text: payload.text,
              blocks: payload.blocks,
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
      // Plan card stamp — buttons 가 여전히 활성이면 사용자가 잘못
      // 승인할 수 있으니 같이 무력화.
      const planTsCancel = job.slackContext?.planMessageTs;
      if (planTsCancel) {
        const blocks = await fetchSlackMessageBlocks(client, channel, planTsCancel);
        if (blocks) {
          try {
            await client.chat.update({
              channel,
              ts: planTsCancel,
              text: '계획 외부에서 취소됨',
              blocks: stampExternallyCancelledBlocks(blocks),
            });
          } catch {
            /* swallow */
          }
        }
      }
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

    if (job.status === 'qa') {
      if (!announcedJobStates.has('qa-landed')) {
        if (!wasFirstIteration) {
          await postCompletionMessage({ client, channel, threadTs, job });
        }
        announcedJobStates.add('qa-landed');
      }
      // Keep polling: user may click ✅ QA 통과 (→ complete), 🔁
      // 재실행 (qaAutoResult resets), or ❌ 취소 (→ cancelled).
      continue;
    }

    if (job.status === 'complete') {
      if (!announcedJobStates.has('completed')) {
        if (!wasFirstIteration) {
          await postCompletePromoteMessage({ client, channel, threadTs, job });
        }
        announcedJobStates.add('completed');
      }
      // Truly terminal — keep polling for a brief window so a click
      // on Promote here can update the same message? Promote handler
      // posts its own follow-up so polling can stop. But we may want
      // to surface external Promote (curl, playground) too — return
      // for now since complete + Promote is rare from outside.
      return;
    }
  }

  // Build the URL from the playground id, not the jobId. (Earlier
  // versions of this file accidentally used jobId here, which led
  // to broken `/p/<jobId>` links.)
  const finalJob = opts.getJob(jobId);
  // Skip expiration message for "user-waiting" statuses — qa / complete
  // / paused 는 사용자 액션 대기 상태라 30분 만료 알림이 행동 유발하지
  // 못하고 노이즈만 된다. 특히 orchestrator restart 시 resumeWatchersFromDisk
  // 가 매번 새 30분 watcher 를 붙여서, 이 메시지가 N번 반복 발사되는
  // spam 의 원인이었다. 활성 처리 중인 (decomposing/delegating/reviewing)
  // 잡만 expiration 알림 가치가 있음.
  const SILENT_TIMEOUT_STATUSES = new Set(['qa', 'complete', 'paused']);
  if (finalJob && SILENT_TIMEOUT_STATUSES.has(finalJob.status)) {
    return;
  }
  const pgUrl = finalJob?.playgroundId
    ? `${PLAYGROUND_BASE_URL}/${finalJob.playgroundId}`
    : '(playground unknown)';
  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `⏱️ molly 의 watcher 가 30분 후 만료됐습니다. (Job ${jobId} 의 상태 추적 종료) — Playground 에서 직접 확인하세요: ${pgUrl}`,
  });
}

/**
 * Posted when the job lands at status=qa — the auto-runner has finished
 * (or human_only just no-op'd) and we're waiting for the user's
 * confirmation. Includes [✅ QA 통과] (always) + [🔁 자동 QA 재실행]
 * (when the auto run failed). Manual cancel button stays as well.
 */
async function postCompletionMessage({ client, channel, threadTs, job }) {
  const reviewedCount = job.tasks.filter((t) => t.status === 'reviewed').length;
  const skippedCount = job.tasks.filter((t) => t.status === 'skipped').length;
  const playgroundUrl = `${PLAYGROUND_BASE_URL}/${job.playgroundId}`;
  const qaResult = job.qaAutoResult;
  const qaPassed = qaResult?.passed === true;

  /** @type {string[]} */
  const summaryLines = [];
  summaryLines.push(`🎉 작업 완료! (job: \`${job.id}\`)`);
  summaryLines.push(
    `• 완료 task: ${reviewedCount}/${job.tasks.length}` +
      (skippedCount > 0 ? ` (스킵 ${skippedCount})` : ''),
  );
  if (qaResult) {
    const emoji = qaPassed ? '✅' : '⚠️';
    const verdict = qaPassed ? '통과' : '실패';
    summaryLines.push(
      `• 자동 QA: ${emoji} ${verdict} — ${trunc(qaResult.notes ?? '', 120)}`,
    );
  } else if (job.qaStrategy) {
    summaryLines.push(`• 자동 QA: ${job.qaStrategy} (실행 대기 중)`);
  }
  if (job.targetRoute) summaryLines.push(`• 결과 페이지: \`${job.targetRoute}\``);
  summaryLines.push(`• Playground: ${playgroundUrl}`);

  /** @type {Array<object>} */
  const buttons = [
    {
      type: 'button',
      style: 'primary',
      text: { type: 'plain_text', text: '✅ QA 통과' },
      action_id: 'molly_qa_pass',
      value: job.id,
    },
  ];
  if (qaResult && !qaPassed) {
    buttons.push({
      type: 'button',
      text: { type: 'plain_text', text: '🔁 자동 QA 재실행' },
      action_id: 'molly_qa_rerun',
      value: job.id,
    });
  }

  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: summaryLines.join('\n'),
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: summaryLines.join('\n') } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: '*✅ QA 통과* 를 누르면 작업이 *complete* 으로 넘어가고 Promote 버튼이 보입니다.' }] },
      { type: 'actions', block_id: `molly_qa_actions_${job.id}`, elements: buttons },
    ],
  });
}

/**
 * Posted when the job reaches status=complete (user confirmed QA).
 * Final stage: surface the Promote button so the lifecycle wraps up
 * inside Slack instead of forcing a Playground hop.
 */
async function postCompletePromoteMessage({ client, channel, threadTs, job }) {
  const playgroundUrl = `${PLAYGROUND_BASE_URL}/${job.playgroundId}`;
  const headline = `🎉 *${job.id}* 완료 처리됨 — Promote 하시겠어요?`;
  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: headline,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: headline } },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Promote 하면 Playground (\`${job.playgroundId}\`) 의 모든 commit 이 prod repo 의 새 PR 로 올라갑니다. 머지는 GitHub 에서 직접.`,
          },
        ],
      },
      {
        type: 'actions',
        block_id: `molly_promote_actions_${job.id}`,
        elements: [
          {
            type: 'button',
            style: 'primary',
            text: { type: 'plain_text', text: '🚀 Promote (PR 생성)' },
            action_id: 'molly_promote',
            value: job.id,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '📺 Playground 보기' },
            action_id: 'molly_open_playground',
            url: playgroundUrl,
            value: job.playgroundId,
          },
        ],
      },
    ],
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
