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
  agent_review: 'Agent review — screenshot + console + diff',
  inline_per_task: 'Verify after each task',
  final_route_smoke: 'Route smoke only (lightweight)',
  visual_diff: 'Visual regression diff',
  lint_only: 'Type-check / lint only',
  human_only: 'Manual verification',
};

/**
 * CommonMark → Slack mrkdwn 변환.
 *
 * LLM (Anthropic) 은 CommonMark 로 출력하지만 Slack 은 mrkdwn 사용:
 *  - 굵게:   `**텍스트**`        → `*텍스트*`
 *  - 기울임: `*텍스트*` (단일)   → `_텍스트_`
 *  - 취소:   `~~텍스트~~`        → `~텍스트~`
 *  - 링크:   `[label](url)`      → `<url|label>`
 *
 * 인라인 코드 `` `x` `` / 코드블록 ```...``` / 인용 `>` / 리스트 `-` `*` 은
 * 양쪽 동일. 헤더 `#` 는 Slack 에 미지원 — 그대로 두면 plain text 로 보임.
 *
 * 정책: 굵게/기울임 충돌을 피하려 placeholder 단계 거침.
 *   1) `**...**` → 임시 토큰 (단일 `*` 가 italic 이라 헷갈리지 않게 격리)
 *   2) 단일 `*...*` → `_..._`
 *   3) 임시 토큰 → `*...*` 복원
 *
 * Slack 외 surface (Playground / Chrome ext) 는 CommonMark 그대로 원하니
 * 이 변환은 Slack 출력 직전에만 적용.
 */
function toSlackMrkdwn(text) {
  if (!text || typeof text !== 'string') return text;
  return (
    text
      // 1) 마크다운 링크: [label](url) → <url|label>
      .replace(
        /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<$2|$1>',
      )
      // 2) 굵게 보호 (단일 * italic 변환에서 격리)
      .replace(/\*\*([^*\n]+)\*\*/g, 'BOLD$1/BOLD')
      // 3) 단일 * italic → _italic_ (앞뒤 공백 / 줄바꿈 / 문장부호 경계에서만)
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1_$2_')
      // 4) 굵게 복원: *bold*
      .replace(/BOLD([^]+)\/BOLD/g, '*$1*')
      // 5) 취소선: ~~text~~ → ~text~
      .replace(/~~([^~\n]+)~~/g, '~$1~')
  );
}

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
          text: `⚠️ Error: ${err?.message ?? err}`,
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

  // Plan items card — 3 buttons (approve / redecompose / cancel).
  appInstance.action('molly_planitems_approve', async (ctx) => {
    await ctx.ack();
    try {
      await handlePlanItemsApprove(ctx);
    } catch (err) {
      ctx.logger.error(`[molly] planitems_approve crashed: ${err?.stack ?? err}`);
    }
  });

  appInstance.action('molly_planitems_redecompose', async (ctx) => {
    await ctx.ack();
    try {
      await handlePlanItemsRedecomposeOpen(ctx);
    } catch (err) {
      ctx.logger.error(`[molly] planitems_redecompose crashed: ${err?.stack ?? err}`);
    }
  });

  appInstance.action('molly_planitems_cancel', async (ctx) => {
    await ctx.ack();
    try {
      await handlePlanItemsCancel(ctx);
    } catch (err) {
      ctx.logger.error(`[molly] planitems_cancel crashed: ${err?.stack ?? err}`);
    }
  });

  appInstance.view('molly_planitems_redecompose_submit', async (ctx) => {
    await ctx.ack();
    try {
      await handlePlanItemsRedecomposeSubmit(ctx);
    } catch (err) {
      ctx.logger.error(`[molly] planitems_redecompose_submit crashed: ${err?.stack ?? err}`);
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
      text: '👋 How can I help? Mention me with your request.',
    });
    return;
  }

  // Typing indicator — classifier + LLM 합산 1-1.5s 지연 동안 UX 신호.
  // thread reply 로 "🤔 잠깐만요…" 보내고 chat/status 응답 후 delete.
  let thinkingTs = null;
  try {
    const r = await say({ thread_ts: threadTs, text: '🤔 One moment…' });
    thinkingTs = r?.ts ?? null;
  } catch { /* swallow — indicator 실패해도 본 흐름 이어감 */ }

  // Phase 3 Task 3.3 — Phase 1 의 인라인 분기 (classifier + analyzer 별개)
  // 를 processIntake 단일 호출로 정리. /api/molly/respond 가 하던 4 종
  // kind 분기를 라이브러리 호출로 흡수 — surface 별 중복 제거.
  // Sub-phase D — thread reply 를 history 로 변환해 동봉 → multi-turn
  // (clarification + plan) 가 dispatcher 에서 작동.
  // 폴백: intake 자체 throw (network / API key 없음 등) 시 안전하게 chat
  // 응답으로 (잡 안 만드는 게 부작용 0).
  // plan_feedback (2026-05-11) 활성화 — thread 에 pending plan_items 카드 있는지
  // lookup. planItemsContexts 의 channel:threadTs:* 형태 중 살아있는 entry 1개라도
  // 있으면 hasPendingPlan=true. summary 는 분류 정확도 위해.
  const pendingPlanForThread = findPendingPlanForThread(event.channel, threadTs);

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
      // S2 fix (2026-05-07): emitPlan in handleFirstTurn requires
      // designSystemRoot via ctx — was missing, causing fallback to
      // code_change_clear (cumulativePrd-only response without a plan).
      designSystemRoot: opts.designSystemRoot,
      requestSchemaPath: opts.requestSchemaPath,
      // plan_feedback 활성화 신호
      hasPendingPlan: !!pendingPlanForThread,
      pendingPlanSummary: pendingPlanForThread?.plan?.summary ?? null,
    });
  } catch (err) {
    logger.warn(`[molly] processIntake failed, falling back to chat: ${err.message}`);
    result = {
      kind: 'chat',
      reason: 'intake failed',
      response: `⚠️ Something went wrong. Please try again. (${err.message?.slice(0, 100) ?? ''})`,
    };
  }

  if (result.kind === 'chat' || result.kind === 'status_query') {
    if (thinkingTs) {
      try { await client.chat.delete({ channel: event.channel, ts: thinkingTs }); } catch {}
    }
    await say({
      thread_ts: threadTs,
      text: toSlackMrkdwn(result.response) || '(empty response)',
    });
    return;
  }

  if (result.kind === 'code_change_ambiguous') {
    if (thinkingTs) {
      try { await client.chat.delete({ channel: event.channel, ts: thinkingTs }); } catch {}
    }
    await say({
      thread_ts: threadTs,
      text: `🤔 ${toSlackMrkdwn(result.clarifyingQuestion) ?? ''}`,
    });
    return;
  }

  if (result.kind === 'plan_emit') {
    if (thinkingTs) {
      try { await client.chat.delete({ channel: event.channel, ts: thinkingTs }); } catch {}
    }
    if (!result.plan || !Array.isArray(result.plan.plan_items)) {
      // 안전 fallback — plan 없으면 기존 code_change_clear 흐름으로 떨어뜨림
    } else {
      const { isFastTrackIntent } = await import('./plan-intent.js');
      const isFastTrack = isFastTrackIntent(result.plan.intent);
      await postPlanItemsMessage({
        client,
        channel: event.channel,
        threadTs,
        plan: result.plan,
        cumulativePrd: result.cumulativePrd ?? text,
        isFastTrack,
      });
      return;
    }
  }

  // plan_feedback (2026-05-11) — 사용자가 채팅으로 자연어 plan 수정 요청.
  // hasPendingPlan 컨텍스트로 classifier 가 분류 → 여기서 직접 emitPlan
  // (previousPlan + feedback) 재호출 후 카드 swap. 버튼 클릭으로 모달 띄우는
  // 흐름과 동등한 결과. button 흐름은 그대로 유지 (mutex 안 필요 — Slack
  // chat.update 가 idempotent).
  if (result.kind === 'plan_feedback' && pendingPlanForThread) {
    if (thinkingTs) {
      try { await client.chat.delete({ channel: event.channel, ts: thinkingTs }); } catch {}
    }
    try {
      const ack = await say({
        thread_ts: threadTs,
        text: '✏️ Applying feedback and rebuilding the plan...',
      });
      const { emitPlan } = await import('./molly-plan-emitter.js');
      const newPlan = await emitPlan(
        {
          goal: pendingPlanForThread.cumulativePrd,
          client: pendingPlanForThread.plan?.targetClient || 'msm-default',
          routeOrPage: '/',
          previousPlan: pendingPlanForThread.plan,
          feedback: result.feedback,
        },
        {
          designSystemRoot: opts.designSystemRoot,
          requestSchemaPath: opts.requestSchemaPath,
        },
      );
      const { isFastTrackIntent } = await import('./plan-intent.js');
      const isFastTrack = isFastTrackIntent(newPlan.intent);
      rememberPlanItemsContext(event.channel, threadTs, pendingPlanForThread.msgTs, {
        plan: newPlan,
        cumulativePrd: pendingPlanForThread.cumulativePrd,
        isFastTrack,
      });
      await client.chat.update({
        channel: event.channel,
        ts: pendingPlanForThread.msgTs,
        text: `📋 Plan (${(newPlan.plan_items || []).length} items)`,
        blocks: buildPlanItemsBlocks(newPlan, isFastTrack),
      });
      // ack 메시지 정리
      if (ack?.ts) {
        try { await client.chat.delete({ channel: event.channel, ts: ack.ts }); } catch {}
      }
    } catch (err) {
      logger.warn(`[molly] plan_feedback emitPlan failed: ${err.message?.slice(0, 120)}`);
      try {
        await say({
          thread_ts: threadTs,
          text: `❌ Re-plan failed: ${err.message?.slice(0, 200) ?? err}`,
        });
      } catch {}
    }
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
        text: '⚠️ No Playground creation hook configured. Please check the server settings.',
      });
      return;
    }
    await say({
      thread_ts: threadTs,
      text: '🐣 Booting a new Playground… (~30 seconds)',
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
        text: `❌ Failed to create Playground: ${err.message?.slice(0, 200) ?? err}`,
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
      text: `❌ Failed to create job: ${err.message}`,
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
        content: `Request received via Slack mention. Check the card below for progress.`,
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
      `🛠️ Got it. Building the work plan… (job: \`${job.id}\`)`,
      `📺 Playground: ${playgroundUrl}`,
      `_This is also recorded in the Playground chat._`,
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
      text: '⏱️ Plan building timed out (90s). Check in the Playground.',
    });
    return;
  }

  job = opts.getJob(job.id);
  if (job.status === 'paused') {
    await say({
      thread_ts: threadTs,
      text: `❌ Plan building failed: ${job.pausedReason ?? '(no reason given)'}`,
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
      text: `❌ Approval failed: ${err.message}`,
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
      text: body.message.text ?? 'Plan approved',
      blocks: stampApprovedBlocks(body.message.blocks, userId),
    });
  } catch (err) {
    logger.warn(`[molly] chat.update failed: ${err.message}`);
  }

  opts.runJobInBackground(jobId);

  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `🛠️ <@${userId}> approved and started the job…`,
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
      text: body.message.text ?? 'Cancelled',
      blocks: stampCancelledBlocks(body.message.blocks, userId),
    });
  } catch (err) {
    logger.warn(`[molly] chat.update failed: ${err.message}`);
  }

  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `❌ <@${userId}> cancelled.`,
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
      title: { type: 'plain_text', text: 'Re-plan' },
      submit: { type: 'plain_text', text: 'Submit' },
      close: { type: 'plain_text', text: 'Close' },
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text:
              'Specific feedback will help shape the new plan. Leave it blank to let the LLM re-split freely.',
          },
        },
        {
          type: 'input',
          block_id: 'feedback_input',
          optional: true,
          label: { type: 'plain_text', text: 'Feedback (optional)' },
          element: {
            type: 'plain_text_input',
            action_id: 'feedback',
            multiline: true,
            placeholder: {
              type: 'plain_text',
              text:
                "e.g. Split item 1 into two, remove the auth-guard task. Use orange instead of red for the 'BETA' label.",
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
      text: 'Re-planning…',
      blocks: stampPendingRedecomposeBlocks(undefined, userId, feedback),
    });
  } catch (err) {
    logger.warn(`[molly] chat.update (pending redecompose) failed: ${err.message}`);
  }

  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: feedback
      ? `🔁 Re-planning at <@${userId}>'s request…\n_Feedback: ${trunc(feedback, 200)}_`
      : `🔁 Re-planning at <@${userId}>'s request…`,
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
      text: `❌ Failed to start re-plan: ${err.message?.slice(0, 200) ?? String(err)}`,
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
      text: `⏱️ Re-plan timed out (90s). Current status: \`${cur?.status ?? 'unknown'}\``,
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
      text: `❌ Re-plan failed: ${job.pausedReason ?? '(no reason given)'}`,
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
      text: `⚠️ Could not post the new plan to Slack (\`${err.message?.slice(0, 100) ?? '?'}\`). Check in the Playground.`,
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
      text: `❌ QA pass failed: ${err.message?.slice(0, 200) ?? String(err)}`,
    });
    return;
  }

  // Disable the buttons on the original completion message — the poll
  // loop will post the Promote follow-up shortly.
  try {
    await client.chat.update({
      channel,
      ts: body.message.ts,
      text: body.message.text ?? 'QA passed',
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
      text: `❌ QA re-run failed: ${err.message?.slice(0, 200) ?? String(err)}`,
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
    text: `🔁 <@${userId}> requested an auto QA re-run…`,
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
      text: body.message.text ?? 'Promote in progress',
      blocks: stampPromotePendingBlocks(body.message.blocks, userId),
    });
  } catch (err) {
    logger.warn(`[molly] chat.update (promote-pending) failed: ${err.message}`);
  }

  await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `🚀 <@${userId}> requested a Promote. Creating PR…`,
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
      text: `❌ Promote failed: ${err.message?.slice(0, 240) ?? String(err)}`,
    });
    return;
  }

  if (result?.prUrl) {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `✅ Promote done!\n🔗 PR: ${result.prUrl}\n_Merge it on GitHub and you're done._`,
    });
  } else {
    await client.chat.postMessage({
      channel,
      thread_ts: threadTs,
      text: `✅ Promote done (no PR URL returned — check the Playground header).`,
    });
  }
}

/** Reason picker options — mirrors Chrome ext Slice 3 ACTION_REASONS enum. */
const TASK_ACTION_REASON_OPTIONS = [
  { text: { type: 'plain_text', text: 'Syntax / type error' }, value: 'syntax_error' },
  { text: { type: 'plain_text', text: 'Logic / implementation error' }, value: 'logic_error' },
  { text: { type: 'plain_text', text: 'Scope creep' }, value: 'scope_creep' },
  { text: { type: 'plain_text', text: 'Partial implementation' }, value: 'partial' },
  { text: { type: 'plain_text', text: 'Wrong file' }, value: 'wrong_target' },
  { text: { type: 'plain_text', text: 'Over-delivered' }, value: 'over_delivered' },
  { text: { type: 'plain_text', text: 'Other' }, value: 'other' },
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

  const verbMap = { retry: 'Retry', accept: 'Accept as-is', skip: 'Skip' };
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
      submit: { type: 'plain_text', text: 'Confirm' },
      close: { type: 'plain_text', text: 'Cancel' },
      blocks: [
        {
          type: 'input',
          block_id: 'reason_block',
          optional: true,
          label: { type: 'plain_text', text: 'Reason (optional)' },
          element: {
            type: 'static_select',
            action_id: 'reason',
            placeholder: { type: 'plain_text', text: 'Select a reason…' },
            options: TASK_ACTION_REASON_OPTIONS,
          },
        },
        {
          type: 'input',
          block_id: 'reason_text_block',
          optional: true,
          label: { type: 'plain_text', text: 'Additional notes (optional)' },
          element: {
            type: 'plain_text_input',
            action_id: 'reason_text',
            multiline: true,
            max_length: 500,
            placeholder: { type: 'plain_text', text: 'e.g. i18n key collision on page 3…' },
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

  const verbMap = { retry: 'Retry', accept: 'Accept as-is', skip: 'Skip' };
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
      text: `❌ Task ${verb} failed: ${err.message?.slice(0, 200) ?? String(err)}`,
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
      ? `↳ <@${userId}> marked *${verb}* — _${reasonLabel}${reasonText ? ': ' + reasonText.slice(0, 100) : ''}_`
      : `↳ <@${userId}> marked *${verb}*`;
    filtered.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: stampText }],
    });
    await client.chat.update({
      channel,
      ts: msgTs,
      text: `${verb} done`,
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
        text: `✅ <@${userId}> marked QA passed`,
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
        text: `🚀 <@${userId}> is promoting…`,
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
          ? `🔁 <@${userId}> requested a re-plan.\n_Feedback: ${trunc(feedback, 300)}_`
          : `🔁 <@${userId}> requested a re-plan.`,
      },
    },
  ];
  return out;
}

// ── Plan items card (pre-decomposer fast-track) ────────────────────

// Plan items 카드 컨텍스트 캐시 — action handler 에서 lookup 용.
// key = `${channel}:${threadTs}:${msgTs}` → { plan, cumulativePrd, isFastTrack, expireAt }
// TTL 30분 + capacity 500 LRU-ish (size 초과 시 expired 정리, 그래도 가득이면 oldest drop)
const PLAN_ITEMS_CTX_TTL_MS = 30 * 60 * 1000;
const PLAN_ITEMS_CTX_MAX = 500;
const planItemsContexts = new Map();

function planItemsCtxKey(channel, threadTs, msgTs) {
  return `${channel}:${threadTs}:${msgTs}`;
}

function rememberPlanItemsContext(channel, threadTs, msgTs, ctx) {
  if (planItemsContexts.size >= PLAN_ITEMS_CTX_MAX) {
    const now = Date.now();
    for (const [k, v] of planItemsContexts) {
      if (v.expireAt <= now) planItemsContexts.delete(k);
    }
    if (planItemsContexts.size >= PLAN_ITEMS_CTX_MAX) {
      const oldest = planItemsContexts.keys().next().value;
      if (oldest) planItemsContexts.delete(oldest);
    }
  }
  planItemsContexts.set(planItemsCtxKey(channel, threadTs, msgTs), {
    ...ctx,
    expireAt: Date.now() + PLAN_ITEMS_CTX_TTL_MS,
  });
}

/**
 * thread 단위로 살아있는 (만료 X) plan_items 컨텍스트 1개 찾음.
 * 채팅으로 plan_feedback 들어왔을 때 어떤 plan 카드를 update 할지 결정.
 * 여러 plan 카드가 같은 thread 에 있을 경우 expireAt 이 가장 늦은 (= 가장
 * 최근 만들어진) 것 선택.
 */
function findPendingPlanForThread(channel, threadTs) {
  const prefix = `${channel}:${threadTs}:`;
  const now = Date.now();
  let best = null;
  let bestMsgTs = null;
  for (const [key, ctx] of planItemsContexts) {
    if (!key.startsWith(prefix)) continue;
    if (ctx.expireAt <= now) continue;
    if (!best || ctx.expireAt > best.expireAt) {
      best = ctx;
      bestMsgTs = key.slice(prefix.length);
    }
  }
  if (!best) return null;
  return { ...best, msgTs: bestMsgTs };
}

function getPlanItemsContext(channel, threadTs, msgTs) {
  const v = planItemsContexts.get(planItemsCtxKey(channel, threadTs, msgTs));
  if (!v || v.expireAt <= Date.now()) {
    if (v) planItemsContexts.delete(planItemsCtxKey(channel, threadTs, msgTs));
    return null;
  }
  return v;
}

async function postPlanItemsMessage({ client, channel, threadTs, plan, cumulativePrd, isFastTrack }) {
  const blocks = buildPlanItemsBlocks(plan, isFastTrack);
  const result = await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `📋 Plan (${(plan.plan_items || []).length} items)`,
    blocks,
  });
  if (result?.ts) {
    rememberPlanItemsContext(channel, threadTs, result.ts, { plan, cumulativePrd, isFastTrack });
  }
}

function buildPlanItemsBlocks(plan, isFastTrack) {
  const items = plan.plan_items || [];
  const headerText = isFastTrack
    ? `📋 Plan (${items.length} items) — ⚡ Fast track`
    : `📋 Plan (${items.length} items)`;
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: headerText } },
  ];
  if (plan.summary) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: toSlackMrkdwn(plan.summary) },
    });
  }
  items.forEach((p, i) => {
    const descRaw = p.description ? toSlackMrkdwn(trunc(p.description, 1000)) : '';
    const desc = descRaw ? `\n${descRaw}` : '';
    const file = p.target_file ? `\n\`${p.target_file}\`` : '';
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*${i + 1}. ${toSlackMrkdwn(p.title || '(no title)')}*${desc}${file}` },
    });
  });
  blocks.push({
    type: 'actions',
    elements: [
      { type: 'button', action_id: 'molly_planitems_cancel', text: { type: 'plain_text', text: 'Cancel' }, style: 'danger' },
      { type: 'button', action_id: 'molly_planitems_redecompose', text: { type: 'plain_text', text: '✏️ Re-plan' } },
      { type: 'button', action_id: 'molly_planitems_approve', text: { type: 'plain_text', text: 'Run →' }, style: 'primary' },
    ],
  });
  return blocks;
}

function stampPlanItemsApproved(blocks, userId) {
  const stripped = (blocks || []).filter((b) => b.type !== 'actions');
  return [
    ...stripped,
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `✅ <@${userId}> approved and started.` }],
    },
  ];
}

function stampPlanItemsCancelled(blocks, userId) {
  const stripped = (blocks || []).filter((b) => b.type !== 'actions');
  return [
    ...stripped,
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `❌ <@${userId}> cancelled.` }],
    },
  ];
}

async function handlePlanItemsApprove({ body, client }) {
  const { channel, message, user } = body;
  const threadTs = message.thread_ts ?? message.ts;
  const planCtx = getPlanItemsContext(channel.id, threadTs, message.ts);
  if (!planCtx) {
    try {
      await client.chat.postMessage({
        channel: channel.id,
        thread_ts: threadTs,
        text: '⏱️ Plan context has expired. Please mention me again.',
      });
    } catch {}
    return;
  }

  // 카드 disable — actions 블록 제거 후 승인 stamp context 블록 추가
  try {
    const newBlocks = stampPlanItemsApproved(message.blocks, user.id);
    await client.chat.update({
      channel: channel.id,
      ts: message.ts,
      text: 'Plan approved — running…',
      blocks: newBlocks,
    });
  } catch (err) {
    /* best-effort */
  }

  // playground 보장 후 createJob(autoApprove:true, skipDecomposer:isFastTrack)
  let playgroundId = getPlaygroundIdForThread(channel.id, threadTs);
  let pg = playgroundId ? opts.getPlayground(playgroundId) : null;
  if (!pg || pg.status !== 'active') {
    if (playgroundId) {
      clearPlaygroundForThread(channel.id, threadTs);
      playgroundId = null;
      pg = null;
    }
    if (!opts?.createPlayground) {
      await client.chat.postMessage({
        channel: channel.id,
        thread_ts: threadTs,
        text: '⚠️ No Playground creation hook configured.',
      });
      return;
    }
    try {
      pg = await opts.createPlayground({
        surface: 'slack',
        slackChannel: channel.id,
        slackThreadTs: threadTs,
        requestedBy: user.id,
      });
      if (pg?.id) {
        setPlaygroundIdForThread(channel.id, threadTs, pg.id);
        playgroundId = pg.id;
      }
    } catch (err) {
      await client.chat.postMessage({
        channel: channel.id,
        thread_ts: threadTs,
        text: `❌ Failed to create Playground: ${err.message?.slice(0, 200) ?? err}`,
      });
      return;
    }
  }

  if (!opts?.createJob) {
    await client.chat.postMessage({
      channel: channel.id,
      thread_ts: threadTs,
      text: '⚠️ No job creation hook configured.',
    });
    return;
  }

  try {
    await opts.createJob({
      prdText: planCtx.cumulativePrd,
      planItems: planCtx.plan.plan_items,
      autoApprove: true,
      skipDecomposer: planCtx.isFastTrack,
      playgroundId: pg?.id ?? playgroundId,
      slackContext: { channel: channel.id, threadTs },
      surface: 'slack',
    });
  } catch (err) {
    await client.chat.postMessage({
      channel: channel.id,
      thread_ts: threadTs,
      text: `❌ Failed to create job: ${err.message?.slice(0, 200) ?? err}`,
    });
  }
}

async function handlePlanItemsRedecomposeOpen({ body, client }) {
  const { channel, message, trigger_id } = body;
  const threadTs = message.thread_ts ?? message.ts;
  const planCtx = getPlanItemsContext(channel.id, threadTs, message.ts);
  if (!planCtx) return;

  await client.views.open({
    trigger_id,
    view: {
      type: 'modal',
      callback_id: 'molly_planitems_redecompose_submit',
      private_metadata: JSON.stringify({
        channel: channel.id,
        threadTs,
        msgTs: message.ts,
      }),
      title: { type: 'plain_text', text: 'Revise plan' },
      submit: { type: 'plain_text', text: 'Submit' },
      close: { type: 'plain_text', text: 'Close' },
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'How should it be changed? e.g. "Replace item 3 with Y instead of X"',
          },
        },
        {
          type: 'input',
          block_id: 'feedback_input',
          element: {
            type: 'plain_text_input',
            action_id: 'feedback',
            multiline: true,
            placeholder: { type: 'plain_text', text: 'Enter your feedback freely' },
          },
          label: { type: 'plain_text', text: 'Feedback' },
        },
      ],
    },
  });
}

async function handlePlanItemsRedecomposeSubmit({ body, view, client, logger }) {
  const meta = JSON.parse(view.private_metadata);
  const feedback = view.state.values.feedback_input?.feedback?.value?.trim() || '';
  if (!feedback) return;

  const planCtx = getPlanItemsContext(meta.channel, meta.threadTs, meta.msgTs);
  if (!planCtx) return;

  let newPlan;
  try {
    const { emitPlan } = await import('./molly-plan-emitter.js');
    newPlan = await emitPlan(
      {
        goal: planCtx.cumulativePrd,
        client: planCtx.plan?.targetClient || 'msm-default',
        routeOrPage: '/',
        previousPlan: planCtx.plan,
        feedback,
      },
      {
        designSystemRoot: opts.designSystemRoot,
        requestSchemaPath: opts.requestSchemaPath,
      },
    );
  } catch (err) {
    logger?.warn(`[molly] planitems redecompose emitPlan failed: ${err.message?.slice(0, 120)}`);
    try {
      await client.chat.postMessage({
        channel: meta.channel,
        thread_ts: meta.threadTs,
        text: `❌ Re-plan failed: ${err.message?.slice(0, 200) ?? err}`,
      });
    } catch {}
    return;
  }

  const { isFastTrackIntent } = await import('./plan-intent.js');
  const isFastTrack = isFastTrackIntent(newPlan.intent);

  rememberPlanItemsContext(meta.channel, meta.threadTs, meta.msgTs, {
    plan: newPlan,
    cumulativePrd: planCtx.cumulativePrd,
    isFastTrack,
  });

  try {
    await client.chat.update({
      channel: meta.channel,
      ts: meta.msgTs,
      text: `📋 Plan (${(newPlan.plan_items || []).length} items)`,
      blocks: buildPlanItemsBlocks(newPlan, isFastTrack),
    });
  } catch (err) {
    logger?.warn(`[molly] planitems redecompose chat.update failed: ${err.message}`);
  }
}

async function handlePlanItemsCancel({ body, client }) {
  const { channel, message, user } = body;
  try {
    const newBlocks = stampPlanItemsCancelled(message.blocks, user.id);
    await client.chat.update({
      channel: channel.id,
      ts: message.ts,
      text: 'Plan cancelled',
      blocks: newBlocks,
    });
  } catch (err) {
    /* best-effort */
  }
}

// ── Plan message + button helpers ──────────────────────────────────

async function postPlanMessage({ client, channel, threadTs, job }) {
  const blocks = buildPlanBlocks(job);
  const result = await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `📋 Work plan (${job.tasks.length} tasks)`, // fallback for clients that don't render blocks
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
        text: `📋 Work plan (${job.tasks.length} tasks)`,
      },
    },
  ];

  if (job.tasks.length === 0) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '_(no tasks)_' },
    });
  } else {
    // One section per task so the full description (including the
    // 1./2./3. sub-bullets the decomposer emits) makes it through to
    // Slack — the previous compressed version only kept the first
    // line, which dropped the bulk of the user-visible plan.
    // Slack section blocks cap at 3000 chars; trunc to 2500 for safety.
    job.tasks.forEach((t, i) => {
      // LLM (decomposer) 이 CommonMark 로 출력 — Slack mrkdwn 으로 변환.
      const desc = toSlackMrkdwn(normalizeBullets((t.description || '').trim()));
      const title = toSlackMrkdwn((t.title || '').trim());
      const md = [`*${i + 1}. ${title}*`, '', trunc(desc, 2500)].join('\n');
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
          text: `📍 Target page: \`${job.targetRoute}\``,
        },
      ],
    });
  }

  // PRD-specific risks the decomposer flagged. Skip the section
  // entirely when empty so plan UI stays compact for boring jobs.
  // Back-compat: old state files may have `risksKo` instead of `risks`
  const jobRisks = job.risks ?? job.risksKo;
  if (Array.isArray(jobRisks) && jobRisks.length > 0) {
    const risksLines = jobRisks
      .map((r, i) => `${i + 1}. ${trunc(r, 200)}`)
      .join('\n');
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `⚠️ *Risks (specific to this job)*\n${risksLines}`,
      },
    });
  }

  // QA strategy as part of the plan — surfaces *what verification will
  // happen after the agent's tasks finish* so the user signs off on
  // the whole pipeline, not just the code work.
  if (job.qaStrategy) {
    const label = QA_STRATEGY_LABELS_KO[job.qaStrategy] ?? job.qaStrategy;
    // Back-compat: old state files may have `qaRationaleKo` instead of `qaRationale`
    const qaRationale = job.qaRationale ?? job.qaRationaleKo;
    const rationale = qaRationale
      ? `\n   _${trunc(qaRationale, 200)}_`
      : '';
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `🧪 *Verification*: ${label}${rationale}`,
      },
    });
  } else {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `🧪 Auto-selecting verification strategy… (decided post-approve)`,
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
        text: { type: 'plain_text', text: '✅ Approve and start' },
        action_id: 'molly_approve',
        value: job.id,
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '✏️ Re-plan' },
        action_id: 'molly_redecompose',
        value: job.id,
      },
      {
        type: 'button',
        style: 'danger',
        text: { type: 'plain_text', text: '❌ Cancel' },
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
        text: `✅ <@${userId}> approved`,
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
        text: `❌ <@${userId}> cancelled`,
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
        text: `✅ Approved from Playground or external source`,
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
        text: `❌ Cancelled from Playground or external source`,
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
      return `🔧 *${num} ${title}* — working…`;
    case 'committed':
      return `🔍 *${num} ${title}* — reviewing…`;
    case 'reviewed':
      return `✅ *${num} ${title}* — passed`;
    case 'failed': {
      const notes = task.review?.notes?.slice(0, 240) || '(no reason given)';
      return `❌ *${num} ${title}* — review failed\n_${notes}_`;
    }
    case 'skipped':
      return `⏭ *${num} ${title}* — skipped`;
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
            text: { type: 'plain_text', text: '🔁 Retry' },
            action_id: 'molly_task_retry',
            value,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '✅ Accept as-is' },
            action_id: 'molly_task_accept',
            value,
          },
          {
            type: 'button',
            style: 'danger',
            text: { type: 'plain_text', text: '⏭ Skip' },
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
        text: '⚠️ Job no longer exists. (Stopped tracking)',
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
                text: 'Plan approved externally',
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
            text: '🔁 Re-planning from Playground or external source…',
          });
        } else {
          await client.chat.postMessage({
            channel,
            thread_ts: threadTs,
            text: '✅ Plan approved from Playground or external source. Starting work…',
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
          '❌ Job cancelled (from Playground or external source)',
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
              text: 'Plan cancelled externally',
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
              `⏸️ Job paused: ${job.pausedReason ?? '(no reason given)'}`,
              ``,
              `Check in the Playground: ${PLAYGROUND_BASE_URL}/${job.playgroundId}`,
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
    text: `⏱️ Molly's watcher expired after 30 minutes. (Stopped tracking job ${jobId}) — Check directly in the Playground: ${pgUrl}`,
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
  summaryLines.push(`🎉 Job complete! (job: \`${job.id}\`)`);
  summaryLines.push(
    `• Tasks done: ${reviewedCount}/${job.tasks.length}` +
      (skippedCount > 0 ? ` (skipped ${skippedCount})` : ''),
  );
  if (qaResult) {
    const emoji = qaPassed ? '✅' : '⚠️';
    const verdict = qaPassed ? 'passed' : 'failed';
    summaryLines.push(
      `• Auto QA: ${emoji} ${verdict} — ${trunc(qaResult.notes ?? '', 120)}`,
    );
  } else if (job.qaStrategy) {
    summaryLines.push(`• Auto QA: ${job.qaStrategy} (pending)`);
  }
  if (job.targetRoute) summaryLines.push(`• Target page: \`${job.targetRoute}\``);
  summaryLines.push(`• Playground: ${playgroundUrl}`);

  /** @type {Array<object>} */
  const buttons = [
    {
      type: 'button',
      style: 'primary',
      text: { type: 'plain_text', text: '✅ QA pass' },
      action_id: 'molly_qa_pass',
      value: job.id,
    },
  ];
  if (qaResult && !qaPassed) {
    buttons.push({
      type: 'button',
      text: { type: 'plain_text', text: '🔁 Re-run auto QA' },
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
      { type: 'context', elements: [{ type: 'mrkdwn', text: 'Clicking *✅ QA pass* moves the job to *complete* and shows the Promote button.' }] },
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
  const headline = `🎉 *${job.id}* marked complete — ready to Promote?`;
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
            text: `Promoting will open a new PR in the prod repo with all commits from Playground (\`${job.playgroundId}\`). Merge it on GitHub.`,
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
            text: { type: 'plain_text', text: '🚀 Promote (create PR)' },
            action_id: 'molly_promote',
            value: job.id,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '📺 View Playground' },
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
