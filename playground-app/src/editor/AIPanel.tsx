import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  usePlaygroundStore,
  type ChatMessage,
  type ExecutionState,
  type PlanItem,
  type PlanMeta,
  type PlanUnresolvedComponent,
  type TargetClient,
} from '../store/playground-store';
import {
  postChat,
  postIntake,
  postMissingChoice,
  type IntakeHistoryTurn,
  type IntakeResult,
  type MissingChoiceKind,
  type RawUnresolvedComponent,
  mollyClassifyAndDispatch,
  postChangeRequest,
  subscribeChangeRequest,
  changeRequestScreenshotUrl,
  changeRequestDiffUrl,
  getPlayground,
  checkoutPlaygroundCommit,
  restorePlaygroundHead,
  restorePlaygroundToSha,
  OrchestratorError,
  createJob,
  ORCHESTRATOR_URL,
  type ChangeRequestEvent,
  type RawPlan,
} from '../services/orchestrator-client';
import {
  InputArea,
  Card,
  CardSectionLabel,
  Chip,
  type InputAreaToolbarButton,
} from '../shared-ui';
import { usePinStore, type PinComment, isPinStale } from '../store/pin-store';
import type { BridgeElementContext } from '../services/playground-bridge';
import { JobCard } from './JobCard';

// **Source of truth: orchestrator/lib/plan-intent.js**
// Mirrored here because a separate definition is needed on the TS surface.
// The 5 intents bypass the decomposer (skipDecomposer:true). When adding or
// changing entries, update all 3 places: plan-intent.js (backend) +
// chrome-extension/sidepanel.js.
const FAST_TRACK_INTENTS = new Set<string>([
  'copy_update',
  'spacing_adjustment',
  'token_alignment',
  'accessibility_improvement',
  'state_handling',
]);

function isFastTrackIntent(intent: string | undefined | null): boolean {
  return typeof intent === 'string' && FAST_TRACK_INTENTS.has(intent);
}

/**
 * AIPanel — left-pane conversational interface for the Playground editor.
 *
 * Runs in the 2-pane context: the sibling `LivePreview` iframe already
 * renders the sandboxed app, so there is no screenshot/canvas fan-out —
 * every plan fires a single change-request against the playground's
 * queue, and the live app just re-HMRs into the updated state.
 *
 * Shares chat message types with `shared-ui/` primitives so the Chrome
 * extension sidepanel can adopt the same components later.
 */
export const AIPanel = React.memo(function AIPanel({
  onShowHistory,
}: {
  onShowHistory?: () => void;
} = {}) {
  const {
    messages,
    isSending,
    error,
    playgroundId,
    playgroundClient,
    currentRoute,
    checkedOutSha,
    restoredFromSha,
    headCommitSha,
    lastPickedElement,
    setLastPickedElement,
    addUserMessage,
    addAssistantMessage,
    archiveMessagesAfter,
    updateMessage,
    updateExecution,
    setSending,
    setError,
    reset,
    togglePlanItem,
    resolvePlan,
    replacePlan,
    setCurrent,
    iframeMode,
    setIframeMode,
  } = usePlaygroundStore(
    useShallow((s) => ({
      messages: s.messages,
      isSending: s.isSending,
      error: s.error,
      playgroundId: s.current?.id ?? null,
      playgroundClient: s.current?.client ?? null,
      currentRoute: s.currentRoute,
      checkedOutSha: s.current?.checkedOutSha ?? null,
      restoredFromSha: s.current?.restoredFromSha ?? null,
      headCommitSha: s.current?.headCommitSha ?? null,
      lastPickedElement: s.lastPickedElement,
      setLastPickedElement: s.setLastPickedElement,
      addUserMessage: s.addUserMessage,
      addAssistantMessage: s.addAssistantMessage,
      archiveMessagesAfter: s.archiveMessagesAfter,
      updateMessage: s.updateMessage,
      updateExecution: s.updateExecution,
      setSending: s.setSending,
      setError: s.setError,
      reset: s.reset,
      togglePlanItem: s.togglePlanItem,
      resolvePlan: s.resolvePlan,
      replacePlan: s.replacePlan,
      setCurrent: s.setCurrent,
      iframeMode: s.mode,
      setIframeMode: s.setMode,
    })),
  );

  const selectPin = usePinStore((s) => s.selectPin);
  const requestIframeNav = usePlaygroundStore((s) => s.requestIframeNav);
  // useShallow — `.filter()` returns a new array on every render → zustand's Object.is
  // default comparison fails → useSyncExternalStore treats it as a "snapshot changed"
  // every time → infinite re-render (Maximum update depth exceeded). useShallow does
  // element-wise comparison, so unchanged pin contents yield the same result.
  const pinsForPlayground = usePinStore(
    useShallow((s) =>
      playgroundId ? s.pins.filter((p) => p.playgroundId === playgroundId) : [],
    ),
  );

  /** Sha the sandbox is actually sitting on now — either a time-travel
   *  checkout or HEAD when there is no checkout. Drives the "current point in time"
   *  / "go back to this point" split on ExecutionCard. */
  const activeSha = checkedOutSha ?? headCommitSha ?? null;

  const [input, setInput] = useState('');
  const [activeTab, setActiveTab] = useState<'chat' | 'comments'>('chat');
  const [prdModalOpen, setPrdModalOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Tracks whether the user is "pinned" near the bottom. We auto-scroll
  // only when this is true, so a user reading older messages doesn't
  // get yanked away by a JobCard live update or a new bubble.
  const stickToBottomRef = useRef(true);

  // Snap to bottom on every messages change (sending, hydrating, new
  // assistant reply). Bypasses the stick-to-bottom guard — sending a
  // message is an explicit "I want to see what I just did" intent.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    stickToBottomRef.current = true;
  }, [messages, isSending]);

  // SELECTED ELEMENT deselect — Escape key. Intuitive key for users who want to
  // "stop this selection" after picking an element via the picker. Escape inside
  // an input (textarea blur etc.) is handled by that handler via stopPropagation,
  // so there is no conflict. The global listener is only registered when
  // lastPickedElement is set.
  useEffect(() => {
    if (!lastPickedElement) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Escape pressed inside an input field (textarea / input / contenteditable)
      // — that field's own behaviour (blur etc.) takes priority, so skip element
      // deselect. Exception: if the input is empty, ESC is likely intended as
      // "deselect", so handle it.
      const target = e.target as HTMLElement | null;
      const isInput =
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'INPUT' ||
        target?.isContentEditable === true;
      const inputValue =
        target && (target as HTMLInputElement | HTMLTextAreaElement).value;
      if (isInput && inputValue) return;
      e.preventDefault();
      setLastPickedElement(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lastPickedElement, setLastPickedElement]);

  // First paint + every playground switch: defer two frames so JobCards
  // and other async-mounted children have a chance to lay out before
  // we measure scrollHeight. Without this, the first render lands at
  // scrollHeight that doesn't yet include the inline JobCard, so the
  // user re-enters mid-scroll.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
        stickToBottomRef.current = true;
      });
      // store cancel handle so the cleanup below cancels both frames
      (el as any).__pendingRaf2 = raf2;
    });
    return () => {
      cancelAnimationFrame(raf1);
      const r2 = (el as any).__pendingRaf2;
      if (r2 != null) cancelAnimationFrame(r2);
    };
  }, [playgroundId, activeTab]);

  // Live content growth (JobCard polling adds task rows, plan blocks
  // expand, comments load). When content gets taller AND the user was
  // already at the bottom, slide them to the new bottom. If they had
  // scrolled up to read history, leave them alone.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    });
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    // Also observe direct children that get added later (e.g. inline
    // dialogs). Modern browsers tolerate observing the same target via
    // multiple observers; we observe the container itself as a backup.
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeTab]);

  // Track scroll position so the resize observer knows whether to
  // auto-scroll. "Near bottom" = within 80px (forgiving threshold for
  // long messages with internal scroll quirks).
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distance < 80;
  };

  // Epoch guard — bump on every send so late SSE events from a previous
  // run don't stomp on the current conversation after a reset.
  const epochRef = useRef(0);

  const executePlan = useCallback(
    async (m: ChatMessage, opts?: { userPromptOverride?: string }) => {
      if (!m.plan) return;
      if (!playgroundId) {
        setError('No Playground selected.');
        return;
      }
      const plan = m.plan;
      const sentEpoch = epochRef.current;
      const sentPlaygroundId = playgroundId;

      const history = usePlaygroundStore.getState().messages;
      const idx = history.findIndex((x) => x.id === m.id);
      const priorUser = [...history.slice(0, idx)]
        .reverse()
        .find((x) => x.role === 'user');
      // In the history-aware flow, priorUser may be a short approval text like "looks good".
      // If override is explicitly set (including empty string), use it — the server may
      // intentionally send an empty value. Fall back to priorUser/summary only when
      // override is undefined.
      const userPrompt =
        opts?.userPromptOverride !== undefined
          ? opts.userPromptOverride
          : (priorUser?.content ?? plan.meta.summary ?? m.content);

      // Playground is bound to a single app — its `client` always wins over
      // whatever the plan came back with. Otherwise the agent happily edits
      // the wrong app folder (e.g. msm-default) while the iframe is serving
      // tving, and the "change applied" commit looks empty to the user.
      const targetClient =
        playgroundClient ?? plan.meta.targetClient ?? 'msm-default';
      const pagePath = plan.meta.targetRoute ?? '/';
      const enabledItems = plan.items.filter((i) => i.enabled);

      const isStillActive = () =>
        sentEpoch === epochRef.current &&
        usePlaygroundStore.getState().current?.id === sentPlaygroundId;

      const execMsg = addAssistantMessage({
        content: 'Starting execution in sandbox…',
        execution: {
          requestId: '',
          status: 'processing',
          phase: 'queued',
          phasesSeen: ['queued'],
        },
      });

      try {
        const isFastTrack = isFastTrackIntent(plan.meta.intent);
        const ack = await postChangeRequest({
          userPrompt,
          pagePath,
          client: targetClient,
          requestContract: { change_intent: plan.meta.intent },
          planItems: enabledItems,
          visualConstraints: plan.meta.visualConstraints,
          playgroundId: sentPlaygroundId,
          autoApprove: true,
          skipDecomposer: isFastTrack,
        });
        if (!isStillActive()) return;
        updateExecution(execMsg.id, { requestId: ack.id, status: ack.status });

        let commitCaptured = false;
        const close = subscribeChangeRequest(
          ack.id,
          (event: ChangeRequestEvent) => {
            if (!isStillActive()) {
              close();
              return;
            }
            updateExecution(execMsg.id, {
              status: event.status,
              phase: event.phase,
              latestLog: event.latestLog,
              diffUrl: event.diff ? changeRequestDiffUrl(ack.id) : undefined,
              changedFiles: event.changedFiles ?? undefined,
              error: event.error,
              screenshotUrl:
                event.status === 'preview' || event.status === 'approved'
                  ? changeRequestScreenshotUrl(ack.id)
                  : undefined,
            });

            const done =
              event.phase === 'preview_ready' ||
              event.status === 'preview' ||
              event.status === 'approved';
            if (done && !commitCaptured) {
              commitCaptured = true;
              // Queue is serialized per playground (v3 §4), so HEAD right
              // after completion corresponds to this execution's commit.
              getPlayground(sentPlaygroundId)
                .then((pg) => {
                  if (!isStillActive()) return;
                  setCurrent(pg);
                  if (pg.headCommitSha) {
                    updateExecution(execMsg.id, { commitSha: pg.headCommitSha });
                  }
                })
                .catch((err) => {
                  console.warn(
                    '[AIPanel] failed to capture playground HEAD after execution',
                    err,
                  );
                });
            }

            if (event.status === 'error') close();
          },
        );
      } catch (err) {
        const msg =
          err instanceof OrchestratorError
            ? `Execution request failed: ${err.message}`
            : err instanceof Error
              ? err.message
              : 'Execution request failed';
        updateExecution(execMsg.id, {
          status: 'error',
          phase: 'error',
          error: msg,
        });
      }
    },
    [
      playgroundId,
      playgroundClient,
      addAssistantMessage,
      updateExecution,
      setError,
      setCurrent,
    ],
  );

  /**
   * "Re-plan" — sends the previous plan + user feedback to /api/plan and swaps
   * in the new plan. Uses the same priorUser fallback logic as executePlan to
   * extract the original goal.
   *
   * Success: in-place swap via replacePlan, planResolved also reset (decision needed again).
   * Failure: throws — PlanCard displays the error via its internal state.
   */
  const redecomposePlan = useCallback(
    async (m: ChatMessage, feedback: string): Promise<void> => {
      if (!m.plan) return;
      const trimmed = feedback.trim();
      if (!trimmed) throw new Error('Please enter feedback');

      const history = usePlaygroundStore.getState().messages;
      const idx = history.findIndex((x) => x.id === m.id);
      const priorUser = [...history.slice(0, idx)]
        .reverse()
        .find((x) => x.role === 'user');
      const goal =
        priorUser?.content ?? m.plan.meta.summary ?? m.content ?? '';
      if (!goal.trim()) throw new Error('Could not find the original PRD');

      const targetClient: TargetClient =
        ((playgroundClient as TargetClient | null) ??
          m.plan.meta.targetClient ??
          'msm-default') as TargetClient;
      const routeOrPage = m.plan.meta.targetRoute ?? '/';

      // Backend (emitPlan) previousPlan input expects the original emit result shape
      // (intent, target_entity, summary, visual_constraints, plan_items[]).
      // store plan.items are {id,title,description,...,enabled} →
      // convert to the plan_items shape the backend expects (include enabled so
      // the LLM is aware of disabled items).
      const previousPlan = {
        intent: m.plan.meta.intent,
        target_entity: m.plan.meta.targetEntity ?? null,
        summary: m.plan.meta.summary ?? '',
        plan_items: m.plan.items.map((it) => ({
          id: it.id,
          title: it.title,
          description: it.description ?? '',
          pattern_id: it.patternId ?? null,
          target_file: it.targetFile ?? null,
          depends_on: [],
          enabled: it.enabled,
        })),
      };

      const res = await fetch(`${ORCHESTRATOR_URL}/api/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal,
          client: targetClient,
          routeOrPage,
          previousPlan,
          feedback: trimmed,
        }),
      });
      const body = await res.json().catch(() => ({ ok: false, error: 'invalid response' }));
      if (!res.ok || !body.ok) {
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const newPlan = body.plan;

      // /api/plan response → convert to store plan shape (see executePlan flow)
      const items = (newPlan.plan_items || []).map((it: any) => ({
        id: String(it.id),
        title: String(it.title ?? ''),
        description: it.description ?? undefined,
        patternId: it.pattern_id ?? undefined,
        targetFile: it.target_file ?? undefined,
        dependsOn: Array.isArray(it.depends_on) ? it.depends_on : [],
        enabled: true,
      }));
      replacePlan(m.id, {
        meta: {
          intent: newPlan.intent ?? m.plan.meta.intent,
          targetEntity: newPlan.target_entity ?? null,
          summary: newPlan.summary ?? '',
          visualConstraints: Array.isArray(newPlan.visual_constraints)
            ? newPlan.visual_constraints
            : (m.plan.meta.visualConstraints ?? []),
          targetClient,
          targetRoute: routeOrPage,
        },
        items,
      });
    },
    [playgroundClient, replacePlan],
  );

  const handleCheckoutCommit = useCallback(
    async (sha: string) => {
      if (!playgroundId) return;
      const currentHead = usePlaygroundStore.getState().current?.headCommitSha;
      try {
        // Viewing the latest checkpoint is indistinguishable from
        // being on the working branch — avoid a detached-HEAD checkout
        // that would only serve to flip UI into "time-travel" mode and
        // block new requests.
        const pg =
          currentHead && sha === currentHead
            ? await restorePlaygroundHead(playgroundId)
            : await checkoutPlaygroundCommit(playgroundId, sha);
        setCurrent(pg);
      } catch (err) {
        console.error('[AIPanel] checkout failed', err);
        setError(err instanceof Error ? err.message : 'Failed to restore checkpoint');
      }
    },
    [playgroundId, setCurrent, setError],
  );

  const handleRestoreToSha = useCallback(
    async (sha: string, labelHint?: string) => {
      if (!playgroundId) return;
      const label = labelHint ?? `Checkpoint ${sha.slice(0, 7)}`;
      const ok = window.confirm(
        `Restore to "${label}"?\n\nChanges after this checkpoint will be reverted via a Restore commit (history is preserved).`,
      );
      if (!ok) return;
      try {
        const pg = await restorePlaygroundToSha(playgroundId, sha);
        setCurrent(pg);
      } catch (err) {
        console.error('[AIPanel] restore-to-sha failed', err);
        setError(err instanceof Error ? err.message : 'Restore failed');
      }
    },
    [playgroundId, setCurrent, setError],
  );

  // Checkpoint numbering: scan messages in order and assign a sequential
  // index (1-based) to each execution that produced a real commit. A
  // map keyed by messageId keeps the lookup O(1) from MessageRow.
  const checkpointByMessageId = useMemo(() => {
    const out: Record<string, number> = {};
    let n = 0;
    for (const m of messages) {
      if (m.execution?.commitSha) {
        n += 1;
        out[m.id] = n;
      }
    }
    return out;
  }, [messages]);

  // Chat tab stream: mix messages + pinsForPlayground in chronological order by createdAt.
  // ChatMessage has no createdAt field, so array index is used as a fallback.
  type StreamItem =
    | { kind: 'message'; createdAt: number; data: ChatMessage }
    | { kind: 'pin'; createdAt: number; data: PinComment };
  const chatStream = useMemo((): StreamItem[] => {
    const items: StreamItem[] = [
      ...messages.map((m, i) => ({
        kind: 'message' as const,
        createdAt: i,
        data: m,
      })),
      ...pinsForPlayground.map((p) => ({
        kind: 'pin' as const,
        createdAt: p.createdAt,
        data: p,
      })),
    ];
    items.sort((a, b) => a.createdAt - b.createdAt);
    return items;
  }, [messages, pinsForPlayground]);

  const sendPrompt = useCallback(async (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed || isSending) return;

    epochRef.current += 1;
    const sentEpoch = epochRef.current;
    const sentPlaygroundId = playgroundId;

    setError(null);

    // Time-travel / restore → archive + (for time-travel) restore head:
    // if the user is viewing a past checkpoint *or* on a restored
    // snapshot, archive everything below the anchor so the new work
    // stands alone. For the live-checkout case we also need to bring
    // HEAD back to the work branch before sending; for a restore,
    // HEAD is already advanced past the anchor so the next commit
    // naturally supersedes it (and updatePlaygroundHead clears the
    // restoredFromSha flag for us).
    const anchorShaForSend = checkedOutSha ?? restoredFromSha;
    if (anchorShaForSend && playgroundId && anchorShaForSend !== headCommitSha) {
      const anchor = messages.find(
        (m) =>
          !!m.execution?.commitSha &&
          (m.execution.commitSha === anchorShaForSend ||
            m.execution.commitSha.startsWith(anchorShaForSend)),
      );
      if (anchor) archiveMessagesAfter(anchor.id);
      if (checkedOutSha) {
        try {
          const pg = await restorePlaygroundHead(playgroundId);
          setCurrent(pg);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
          return;
        }
      }
    }

    // Store the picked element on the message (not concatenated into
    // text) so the chat bubble can render it as a chip. The outbound
    // prompt the agent sees still gets the element prefix — we build
    // that on the fly in `apiMessages` below, keeping the on-screen log
    // clean while keeping the agent honest about which element the user
    // referred to.
    addUserMessage(trimmed, lastPickedElement ?? undefined);
    // Clear the picked-element chip as soon as the message is queued —
    // the user expects "press send" to consume the selection. Mode was
    // already flipped back to 'view' by LivePreview on pick.
    if (lastPickedElement) setLastPickedElement(null);

    const current = usePlaygroundStore.getState().messages;
    // Prepend an implicit context message so the chat model knows which
    // client and route the user is looking at without having to ask.
    // Keeps follow-up planning terse ("change it" → actionable) instead of
    // triggering a "which page?" clarification round-trip.
    const contextLines: string[] = [];
    if (playgroundClient) contextLines.push(`client: ${playgroundClient}`);
    if (currentRoute) contextLines.push(`route: ${currentRoute}`);
    const contextMessage = contextLines.length
      ? {
          role: 'user' as const,
          content: `[Context (do not mention to the user unless asked)]\n${contextLines.join('\n')}`,
        }
      : null;

    const apiMessages = [
      ...(contextMessage ? [contextMessage] : []),
      ...current.map((m) => {
        const contextPrefix = m.attachedElement
          ? `${formatElementContext(m.attachedElement)}\n\n`
          : '';
        const planSuffix = m.plan
          ? `\n\n(Plan with ${m.plan.items.length} items)`
          : '';
        return {
          role: m.role,
          content: `${contextPrefix}${m.content}${planSuffix}`,
        };
      }),
    ];

    const isStillActive = () =>
      sentEpoch === epochRef.current &&
      usePlaygroundStore.getState().current?.id === sentPlaygroundId;

    setSending(true);
    try {
      // Phase 3 Task 3.1 sub-phase C wrap-up (2026-05-06) — history-aware intake
      // is ON by default. Priority order:
      //   1. build-time `VITE_MOLLY_HISTORY_AWARE='0'` → force OFF globally (hot-fix for regressions)
      //   2. per-user `localStorage.MOLLY_HISTORY_AWARE='0'` → opt-out (individual fallback)
      //   3. ON by default
      // After 1-2 weeks in production, delete the legacy path (mollyClassifyAndDispatch + postChat).
      // Regression backout: run `localStorage.setItem('MOLLY_HISTORY_AWARE','0')` in console.
      const buildEnvForceOff =
        import.meta.env.VITE_MOLLY_HISTORY_AWARE === '0';
      const userOptOut =
        typeof window !== 'undefined' &&
        window.localStorage?.getItem('MOLLY_HISTORY_AWARE') === '0';
      const historyAware = !buildEnvForceOff && !userOptOut;

      if (historyAware) {
        // The new user message is the last item in current. History is the preceding turns.
        // sub-phase C wrap-up (2026-05-06) — assistant.kind prefers the m.kind stored in
        // the store; for old messages without kind, fall back to inferring from plan presence.
        const prevMessages = current.slice(0, -1);
        const history: IntakeHistoryTurn[] = prevMessages.map((m) => ({
          role: m.role,
          content: m.content,
          kind:
            m.role === 'assistant'
              ? (m.kind ?? (m.plan ? 'plan_emit' : 'chat'))
              : undefined,
          ...(m.role === 'assistant' && m.clarifyingQuestion
            ? { clarifyingQuestion: m.clarifyingQuestion }
            : {}),
        }));
        const elementCtx = lastPickedElement
          ? `${formatElementContext(lastPickedElement)}\n\n`
          : '';
        const intakeText = `${elementCtx}${trimmed}`;
        // plan_feedback (2026-05-11) — among the most recent assistant messages,
        // find one that has a plan and no planResolved yet → notify the classifier as a
        // "pending plan". This causes user natural-language revision requests sent via
        // chat to be classified as plan_feedback.
        const pendingPlanMsg = [...prevMessages]
          .reverse()
          .find((m) => m.role === 'assistant' && !!m.plan && !m.planResolved && !m.archived);
        let result: IntakeResult;
        try {
          result = await postIntake({
            text: intakeText,
            surface: 'playground',
            history,
            client: playgroundClient ?? undefined,
            routeOrPage: currentRoute ?? undefined,
            hasPendingPlan: !!pendingPlanMsg,
            pendingPlanSummary: pendingPlanMsg?.plan?.meta?.summary ?? undefined,
          });
        } catch (err) {
          if (!isStillActive()) return;
          const msg =
            err instanceof OrchestratorError
              ? err.status === 503
                ? 'AI service not configured — set ANTHROPIC_API_KEY and restart the orchestrator.'
                : `Intake failed: ${err.message}`
              : err instanceof Error
                ? err.message
                : 'Intake failed';
          console.error('[AIPanel] postIntake failed:', err);
          addAssistantMessage({ content: `⚠️ ${msg}` });
          setError(msg);
          return;
        }
        if (!isStillActive()) return;
        switch (result.kind) {
          case 'chat':
            addAssistantMessage({
              content: result.response ?? '(empty response)',
              kind: 'chat',
            });
            break;
          case 'status_query':
            addAssistantMessage({
              content: result.response ?? '(empty response)',
              kind: 'status_query',
            });
            break;
          case 'lifecycle_action':
            addAssistantMessage({
              content: result.response ?? '(empty response)',
              kind: 'lifecycle_action',
            });
            break;
          case 'code_change_ambiguous':
            addAssistantMessage({
              content: `🤔 ${result.clarifyingQuestion ?? 'Could you provide more details?'}`,
              kind: 'code_change_ambiguous',
              clarifyingQuestion: result.clarifyingQuestion,
            });
            break;
          case 'plan_emit':
            if (result.plan) {
              addAssistantMessage({
                content: result.plan.summary || 'Here is a plan we can proceed with:',
                plan: rawToPlan(result.plan),
                kind: 'plan_emit',
              });
            } else {
              addAssistantMessage({ content: 'Plan is ready.', kind: 'plan_emit' });
            }
            break;
          case 'job_dispatched': {
            // Sub-phase C wrap-up (2026-05-06) — auto-lookup the most recent
            // plan_emit message → start the job via executePlan. The archived /
            // planResolved=accepted guard prevents duplicate dispatches.
            const planMsg = [...current].reverse().find(
              (x) =>
                x.role === 'assistant' &&
                !x.archived &&
                x.planResolved !== 'accepted' &&
                (x.kind === 'plan_emit' || !!x.plan),
            );
            if (!planMsg?.plan) {
              addAssistantMessage({
                content:
                  '⚠️ Could not find an approved plan. Please use the Approve button on the plan card.',
                kind: 'job_dispatched',
              });
              break;
            }
            updateMessage(planMsg.id, { planResolved: 'accepted' });
            addAssistantMessage({
              content: '✅ Plan approved — starting job.',
              kind: 'job_dispatched',
            });
            // If cumulativePrd is present, use it instead of priorUser ("looks good") —
            // when clarification rounds happened, the accumulated PRD is the right input.
            void executePlan(planMsg, { userPromptOverride: result.cumulativePrd });
            break;
          }
          case 'code_change_clear':
            // Fallback case where the first turn was not bundled into plan_emit
            // (e.g. server emitPlan failed). No plan card available — inform the user.
            addAssistantMessage({
              content:
                'The PRD is clear, but a plan card cannot be created right now. Please try the same request again shortly (or describe it more specifically to get a plan right away).',
              kind: 'code_change_clear',
            });
            break;
          case 'plan_feedback':
            // User chat classified as a "plan revision request" — find the pending plan
            // message and call redecomposePlan(feedback). Equivalent to the "Re-plan" button flow.
            if (pendingPlanMsg) {
              addAssistantMessage({
                content: '✏️ Incorporating feedback and rebuilding plan...',
                kind: 'plan_feedback',
              });
              const feedback = result.feedback ?? trimmed;
              redecomposePlan(pendingPlanMsg, feedback).catch((err) => {
                console.error('[AIPanel] plan_feedback redecomposePlan failed:', err);
                addAssistantMessage({
                  content: `⚠️ Re-plan failed: ${err instanceof Error ? err.message : String(err)}`,
                });
              });
            } else {
              // If hasPendingPlan was false the backend classifier would have downgraded
              // to chat, but if a race condition lands us here anyway, fall back to chat.
              addAssistantMessage({
                content: '⚠️ The plan card to revise has gone. Please start a new PRD request.',
                kind: 'chat',
              });
            }
            break;
        }
        return;
      }

      // LEGACY path (default) — mollyClassifyAndDispatch + postChat.
      // molly classification gate — runs on every turn. Users must be able to send
      // status queries / chat mid-Wizard (e.g. "what's the server status right now?").
      // Downside: Wizard clarifying answers (e.g. "TVING") can be misclassified as chat.
      // That trade-off is properly resolved in phase 2 (/api/intake integration).
      const dispatch = await mollyClassifyAndDispatch(trimmed, true);
      if (dispatch && (dispatch.kind === 'chat' || dispatch.kind === 'status_query')) {
        if (!isStillActive()) return;
        addAssistantMessage({ content: dispatch.response ?? '(empty response)' });
        return;
      }

      const reply = await postChat(apiMessages);
      if (!isStillActive()) return;
      if (reply.type === 'question') {
        addAssistantMessage({ content: reply.content });
      } else {
        addAssistantMessage({
          content: reply.content || 'Here is a plan we can proceed with:',
          plan: rawToPlan(reply.plan),
        });
      }
    } catch (err) {
      if (!isStillActive()) return;
      const msg =
        err instanceof OrchestratorError
          ? err.status === 503
            ? 'AI service not configured — set ANTHROPIC_API_KEY and restart the orchestrator.'
            : `AI response failed: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'AI response failed';
      console.error('[AIPanel] chat failed:', err);
      addAssistantMessage({ content: `⚠️ ${msg}` });
      setError(msg);
    } finally {
      if (isStillActive()) setSending(false);
    }
  }, [
    isSending,
    playgroundId,
    setSending,
    setError,
    addUserMessage,
    addAssistantMessage,
    updateMessage,
    executePlan,
    lastPickedElement,
    setLastPickedElement,
  ]);

  const handleSendCommentToMolly = useCallback(
    (pin: PinComment) => {
      const parts: string[] = ['[Comment-based request]', pin.text?.trim() || ''];
      const target =
        pin.element?.label ??
        pin.element?.testId ??
        pin.element?.displayName ??
        pin.route ??
        `(${pin.x}, ${pin.y})`;
      parts.push('', `Target: ${target}`);
      if (pin.element?.sourceFile) parts.push(`File: ${pin.element.sourceFile}`);
      if (pin.route && pin.route !== target) parts.push(`Route: ${pin.route}`);
      const prd = parts.join('\n');
      setActiveTab('chat');
      if (pin.element) setLastPickedElement(pin.element);
      void sendPrompt(prd);
    },
    [sendPrompt, setActiveTab, setLastPickedElement],
  );

  const handleSend = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    setInput('');
    void sendPrompt(trimmed);
  }, [input, sendPrompt]);

  const handleChoice = useCallback(
    (text: string) => {
      if (!text || isSending) return;
      void sendPrompt(text);
    },
    [sendPrompt, isSending],
  );

  const pickActive = iframeMode === 'pick';
  const toolbarButtons: InputAreaToolbarButton[] = useMemo(
    () => [
      {
        id: 'pick',
        title: pickActive
          ? 'Turn off element selection mode'
          : 'Element selection — click an element on the screen to attach context',
        active: pickActive,
        onClick: () => setIframeMode(pickActive ? 'interactive' : 'pick'),
        // Crosshair — matches the Chrome extension's inspect toggle icon
        // (sidepanel.html / .inspect-btn) so the affordance is learnable
        // across both entry points into the picker flow.
        icon: (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="7" />
            <line x1="12" y1="1" x2="12" y2="5" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="1" y1="12" x2="5" y2="12" />
            <line x1="19" y1="12" x2="23" y2="12" />
          </svg>
        ),
      },
      {
        id: 'attach',
        title: 'Attach PRD — start a job from text / Google Docs / Jira link',
        disabled: !playgroundId,
        onClick: () => setPrdModalOpen(true),
        icon: (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
          </svg>
        ),
      },
    ],
    [pickActive, setIframeMode, playgroundId],
  );

  const isEmpty = messages.length === 0;
  // A checkout whose sha matches the working-branch tip is effectively
  // no time travel — unblock new requests in that case (the tabs and
  // the hint both use the same signal so they stay consistent).
  const isTimeTravel =
    !!checkedOutSha && checkedOutSha !== headCommitSha;

  const canSubmit =
    input.trim().length > 0 && !isSending && !!playgroundId && !isTimeTravel;

  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        background: 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        color: 'var(--text-primary)',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {/* Header — Claude-style: icon pill + title, then Chat tab row with + */}
      <div
        style={{
          padding: '16px 18px 0',
          background: 'var(--bg-primary)',
          flex: '0 0 auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              aria-hidden
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background:
                  'linear-gradient(135deg, #b9ceff 0%, #4f86ff 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
                color: '#ffffff',
              }}
            >
              ◎
            </div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: 'var(--text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              Moloco Inspect
            </div>
          </div>
          {onShowHistory && (
            <button
              type="button"
              onClick={onShowHistory}
              title="View change history for this Playground"
              style={{
                padding: '4px 9px',
                fontSize: 12,
                border: '1px solid var(--border-primary)',
                borderRadius: 6,
                background: 'transparent',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              📜 History
            </button>
          )}
        </div>

        {/* Tab row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 14,
            borderBottom: '1px solid var(--border-primary)',
          }}
        >
          <div style={{ display: 'flex', gap: 18 }}>
            {(['chat', 'comments'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setActiveTab(t)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: '8px 0',
                  fontSize: 13,
                  fontWeight: activeTab === t ? 600 : 500,
                  color:
                    activeTab === t
                      ? 'var(--text-primary)'
                      : 'var(--text-tertiary)',
                  borderBottom:
                    activeTab === t
                      ? '2px solid var(--text-primary)'
                      : '2px solid transparent',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                }}
              >
                {t === 'chat' ? 'Chat' : 'Comments'}
              </button>
            ))}
          </div>
          {activeTab === 'chat' && (
            <button
              type="button"
              onClick={reset}
              title="New conversation"
              aria-label="New conversation"
              style={{
                border: 'none',
                background: 'transparent',
                padding: 4,
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                fontSize: 18,
                lineHeight: 1,
                fontFamily: 'inherit',
              }}
            >
              +
            </button>
          )}
        </div>
      </div>

      {activeTab === 'chat' ? (
        <>
          {/* Messages area */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="ui-scroll"
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: isEmpty ? 0 : '16px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              background: 'var(--bg-primary)',
            }}
          >
            {isEmpty && <EmptyState />}
            {(() => {
              // Two concerns composed in one pass:
              //   1. Dim messages below the time-travel anchor (user
              //      is viewing a past checkpoint; later work is not
              //      reflected in the working tree).
              //   2. Fold *archived* messages (previous branches the
              //      user moved past by sending a new prompt during
              //      time-travel) into a single collapsed accordion
              //      at their original position.
              // Runs of consecutive archived messages collapse into
              // one `<ArchivedGroup>` node; non-archived messages
              // render individually with optional dim.
              // Time-travel anchor: either a live checkout (user
              // clicked "view") or a restored sha (user clicked Restore
              // and the forward-work clock hasn't ticked yet). Either
              // way, everything below this message is conceptually
              // superseded and should dim.
              const anchorSha = checkedOutSha ?? restoredFromSha;
              const anchorIdx =
                anchorSha &&
                anchorSha !== headCommitSha &&
                messages.findIndex(
                  (m) =>
                    !!m.execution?.commitSha &&
                    (m.execution.commitSha === anchorSha ||
                      m.execution.commitSha.startsWith(anchorSha)),
                );
              const dimFromIdx =
                typeof anchorIdx === 'number' && anchorIdx >= 0 ? anchorIdx : -1;

              const out: React.ReactNode[] = [];
              let archivedRun: ChatMessage[] = [];
              const flushArchived = () => {
                if (archivedRun.length === 0) return;
                const first = archivedRun[0];
                out.push(
                  <ArchivedGroup
                    key={`archived-${first.id}`}
                    messages={archivedRun}
                  />,
                );
                archivedRun = [];
              };
              let msgIdx = 0;
              // DS Escalation Slice A — track the most recent user message
              // content so MessageRow can pass it to MissingComponentCard as
              // the PRD source for the draft-preview build.
              let lastUserContent: string | undefined;
              chatStream.forEach((item) => {
                if (item.kind === 'pin') {
                  flushArchived();
                  const pin = item.data;
                  out.push(
                    <CommentInlineCard
                      key={`c-${pin.id}`}
                      pin={pin}
                      onActivate={() => {
                        selectPin(pin.id);
                        if (pin.route && pin.route !== currentRoute) {
                          requestIframeNav(pin.route);
                        }
                      }}
                      onSendToMolly={() => handleSendCommentToMolly(pin)}
                    />,
                  );
                  return;
                }
                const m = item.data;
                const idx = msgIdx++;
                if (m.role === 'user' && m.content) {
                  lastUserContent = m.content;
                }
                if (m.archived) {
                  archivedRun.push(m);
                  return;
                }
                flushArchived();
                out.push(
                  <MessageRow
                    key={`m-${m.id}`}
                    message={m}
                    activeSha={activeSha}
                    onChoice={handleChoice}
                    isSending={isSending}
                    checkpointNumber={checkpointByMessageId[m.id]}
                    dimmed={dimFromIdx >= 0 && idx > dimFromIdx}
                    priorUserContent={lastUserContent}
                    onTogglePlanItem={(itemId) => togglePlanItem(m.id, itemId)}
                    onAcceptPlan={() => {
                      resolvePlan(m.id, 'accepted');
                      void executePlan(m);
                    }}
                    onRejectPlan={() => resolvePlan(m.id, 'rejected')}
                    onRedecomposePlan={(feedback) => redecomposePlan(m, feedback)}
                    onCheckoutCommit={handleCheckoutCommit}
                    onRestoreToSha={handleRestoreToSha}
                  />,
                );
              });
              flushArchived();
              return out;
            })()}
            {isSending && <TypingIndicator />}
          </div>

          <InputArea
            value={input}
            placeholder={
              isEmpty
                ? 'What would you like to build? (e.g. Add a Moloco Ads section to TVING nav)'
                : 'Send a message...'
            }
            onChange={setInput}
            onSubmit={handleSend}
            canSubmit={canSubmit}
            disabled={isSending || !playgroundId}
            toolbarButtons={toolbarButtons}
            hint="Enter to send · Shift+Enter for new line"
            sendLabel={isSending ? '⋯' : 'Send'}
            aboveInput={
              <>
                {isTimeTravel && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 8px',
                      background: 'var(--bg-elevated)',
                      border: '1px solid var(--border-secondary)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 11,
                      color: 'var(--text-secondary)',
                      lineHeight: 1.4,
                    }}
                  >
                    <span aria-hidden>🕐</span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                      Viewing a past checkpoint — new requests are available in the{' '}
                      <strong style={{ color: 'var(--text-primary)' }}>
                        Working
                      </strong>{' '}
                      tab
                    </span>
                  </div>
                )}
                {lastPickedElement && (
                  <PickedElementChip
                    element={lastPickedElement}
                    onClear={() => setLastPickedElement(null)}
                  />
                )}
              </>
            }
            footer={
              <>
                <span
                  style={{
                    padding: '1px 6px',
                    background: 'var(--badge-bg)',
                    color: 'var(--badge-text)',
                    borderRadius: 10,
                    fontSize: 10,
                    fontWeight: 500,
                  }}
                >
                  inspect agent
                </span>
                <span
                  style={{
                    padding: '1px 6px',
                    background: 'var(--success-light)',
                    color: 'var(--success)',
                    borderRadius: 10,
                    fontSize: 10,
                    fontWeight: 500,
                  }}
                >
                  playground
                </span>
              </>
            }
          />
          {error && (
            <div
              style={{
                padding: '6px 12px',
                fontSize: 11,
                color: 'var(--error)',
                background: 'var(--error-light)',
                borderTop: '1px solid var(--border-primary)',
              }}
            >
              ⚠️ {error}
            </div>
          )}
        </>
      ) : (
        <CommentsList
            playgroundId={playgroundId}
            headCommitSha={headCommitSha}
            onSendToMolly={handleSendCommentToMolly}
          />
      )}
      {prdModalOpen && playgroundId && (
        <PrdModal
          onCancel={() => setPrdModalOpen(false)}
          onSubmit={async (prdText) => {
            const job = await createJob(playgroundId, prdText);
            setPrdModalOpen(false);
            // Seed an assistant message that owns the JobCard; the card
            // polls for live state, so we don't need to stream updates
            // into additional chat messages afterwards. The content
            // acts as a brief one-liner above the card.
            addAssistantMessage({
              content: 'PRD received. Breaking it into tasks.',
              jobId: job.id,
            });
          }}
        />
      )}
    </div>
  );
});

type PrdSource = 'text' | 'gdoc' | 'jira';

const textareaStyle: React.CSSProperties = {
  width: '100%',
  fontSize: 12,
  fontFamily: 'inherit',
  padding: 10,
  borderRadius: 6,
  border: '1px solid var(--border-primary)',
  resize: 'vertical',
  boxSizing: 'border-box',
};

/**
 * PRD source modal — opens from the attach (📎) button in the input
 * bar. Three entry paths: paste text / Google Docs link / Jira ticket
 * link. Link paths are v0-stubs: we can't fetch OAuth-gated content
 * yet, so we prepend the URL into the PRD text as a reference line and
 * submit that as the job body. The user can paste supplementary notes
 * in the textarea if they want the AI to work off more than the URL.
 */
function PrdModal({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (prdText: string) => Promise<void>;
}) {
  const [source, setSource] = useState<PrdSource>('text');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildPayload = (): string | null => {
    if (source === 'text') {
      const trimmed = text.trim();
      return trimmed.length >= 10 ? trimmed : null;
    }
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return null;
    if (!/^https?:\/\//i.test(trimmedUrl)) return null;
    const label = source === 'gdoc' ? 'Google Docs' : 'Jira';
    const note = notes.trim();
    return `PRD source (${label}): ${trimmedUrl}${note ? `\n\nNotes:\n${note}` : ''}`;
  };
  const payload = buildPayload();
  const canSubmit = !!payload && !submitting;

  return (
    <div
      role="dialog"
      aria-modal
      aria-labelledby="prd-modal-title"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560,
          maxWidth: 'calc(100vw - 48px)',
          background: 'var(--bg-surface, #ffffff)',
          border: '1px solid var(--border-primary, rgba(0,0,0,0.08))',
          borderRadius: 10,
          boxShadow: 'var(--shadow-md, 0 20px 60px rgba(0, 0, 0, 0.18))',
          padding: 18,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <h2 id="prd-modal-title" style={{ margin: 0, fontSize: 15 }}>
          Start a job from PRD
        </h2>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
          Paste a large requirement and the AI will break it into smaller tasks. Each task
          runs sequentially in the sandbox and commit diffs are reviewed by the LLM.
        </p>
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border-primary)' }}>
          {([
            ['text', 'Text'],
            ['gdoc', 'Google Docs'],
            ['jira', 'Jira ticket'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setSource(key)}
              style={{
                border: 'none',
                background: 'transparent',
                padding: '6px 10px',
                fontSize: 12,
                fontWeight: source === key ? 600 : 500,
                color: source === key ? 'var(--text-primary)' : 'var(--text-tertiary)',
                borderBottom:
                  source === key ? '2px solid var(--text-primary)' : '2px solid transparent',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {source === 'text' ? (
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste the full PRD here..."
            rows={10}
            style={textareaStyle}
          />
        ) : (
          <>
            <input
              autoFocus
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={
                source === 'gdoc'
                  ? 'https://docs.google.com/document/d/...'
                  : 'https://<workspace>.atlassian.net/browse/KEY-123'
              }
              style={{
                width: '100%',
                fontSize: 12,
                fontFamily: 'inherit',
                padding: '8px 10px',
                borderRadius: 6,
                border: '1px solid var(--border-primary)',
                boxSizing: 'border-box',
              }}
            />
            <p style={{ margin: 0, fontSize: 10, color: 'var(--text-tertiary)' }}>
              v0 cannot open links automatically (Google/Atlassian OAuth not supported). Only the URL
              and notes below are sent to the AI. If needed, paste the document content into the notes.
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional: document summary or key excerpts"
              rows={6}
              style={textareaStyle}
            />
          </>
        )}
        {error && (
          <div style={{ fontSize: 11, color: 'var(--text-danger, #d33)' }}>{error}</div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              background: 'transparent',
              border: '1px solid var(--border-primary)',
              borderRadius: 6,
              cursor: 'pointer',
              color: 'var(--text-secondary)',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={async () => {
              if (!payload) return;
              setSubmitting(true);
              setError(null);
              try {
                await onSubmit(payload);
              } catch (err) {
                setError(err instanceof Error ? err.message : String(err));
                setSubmitting(false);
              }
            }}
            style={{
              padding: '6px 12px',
              fontSize: 12,
              background: canSubmit ? 'var(--accent)' : 'var(--bg-elevated)',
              color: canSubmit ? 'var(--text-inverse, #fff)' : 'var(--text-tertiary)',
              border: 'none',
              borderRadius: 6,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            {submitting ? 'Creating…' : 'Start'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────

/**
 * Format the picked-element bundle as a short, human-readable context
 * line prepended to the outgoing chat prompt.
 *
 * Falls through in priority order — label (picker's own compose) →
 * displayName → testId → selector — so the agent always has something
 * to latch onto, even on stacks where fiber displayNames are mangled.
 *
 * `sourceFile` lands as a trailing `@ path:line` hint when available;
 * keep it concise so the rest of the user's prompt dominates the LLM
 * context budget.
 */
function formatElementContext(el: BridgeElementContext): string {
  const name =
    el.label ??
    el.displayName ??
    (el.testId ? `[${el.testId}]` : undefined) ??
    el.selector ??
    '?';
  const suffix = el.sourceFile ? ` @ ${el.sourceFile}` : '';
  return `[Selected element: ${name}${suffix}]`;
}

// ── Sub-components ─────────────────────────────────────────

function PickedElementChip({
  element,
  onClear,
}: {
  element: BridgeElementContext;
  onClear: () => void;
}) {
  const primary =
    element.label ??
    element.displayName ??
    (element.testId ? `[${element.testId}]` : undefined) ??
    element.selector ??
    'Selected element';
  // Shorten source file to last two path segments for a chip-scale hint.
  const shortSource = element.sourceFile
    ? (() => {
        const parts = element.sourceFile.split('/');
        return parts.slice(-2).join('/');
      })()
    : null;
  return (
    <div
      style={{
        margin: '8px 12px 0',
        padding: '8px 10px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border-primary)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        fontSize: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span
          style={{
            fontSize: 10,
            letterSpacing: 0.5,
            textTransform: 'uppercase',
            color: 'var(--text-tertiary)',
            fontWeight: 600,
          }}
        >
          Selected Element
        </span>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear selection"
          title="Clear selection"
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-tertiary)',
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1,
            padding: '0 2px',
          }}
        >
          ×
        </button>
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          minWidth: 0,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--accent)',
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontWeight: 500,
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}
          title={primary}
        >
          {primary}
        </span>
      </div>
      {shortSource && (
        <div
          style={{
            fontSize: 10,
            color: 'var(--text-tertiary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, monospace)',
          }}
          title={element.sourceFile ?? undefined}
        >
          {shortSource}
        </div>
      )}
    </div>
  );
}

function CommentsList({
  playgroundId,
  headCommitSha,
  onSendToMolly,
}: {
  playgroundId: string | null;
  headCommitSha: string | null;
  onSendToMolly?: (pin: PinComment) => void;
}) {
  const allPins = usePinStore((s) => s.pins);
  const deletePin = usePinStore((s) => s.deletePin);
  const toggleResolved = usePinStore((s) => s.toggleResolved);
  const updatePinText = usePinStore((s) => s.updatePinText);
  const addReply = usePinStore((s) => s.addReply);
  const updateReplyText = usePinStore((s) => s.updateReplyText);
  const deleteReply = usePinStore((s) => s.deleteReply);
  const selectPin = usePinStore((s) => s.selectPin);
  const requestIframeNav = usePlaygroundStore((s) => s.requestIframeNav);
  const currentRoute = usePlaygroundStore((s) => s.currentRoute);

  const [archivedOpen, setArchivedOpen] = useState(false);

  const pins = useMemo(
    () => allPins.filter((p) => p.playgroundId === playgroundId),
    [allPins, playgroundId],
  );

  const { active, archived } = useMemo(() => {
    const out: { active: PinComment[]; archived: PinComment[] } = { active: [], archived: [] };
    for (const p of pins) {
      if (isPinStale(p, headCommitSha)) out.archived.push(p);
      else out.active.push(p);
    }
    return out;
  }, [pins, headCommitSha]);

  if (!playgroundId) {
    return (
      <div style={commentsEmptyStyle}>No Playground selected.</div>
    );
  }

  if (active.length === 0 && archived.length === 0) {
    return (
      <div style={commentsEmptyStyle}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          No comments yet.
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6, lineHeight: 1.5 }}>
          Switch to <strong style={{ color: 'var(--text-primary)' }}>📍 Pin</strong> mode in the iframe on the right,
          then click anywhere to leave a comment.
          <br />
          Component-level targeting will be connected via the M3 Vite plugin picker.
        </div>
      </div>
    );
  }

  const renderCommentRow = (pin: PinComment, idx: number) => (
    <CommentRow
      key={pin.id}
      pin={pin}
      index={idx + 1}
      isStale={!!pin.commitSha && pin.commitSha !== headCommitSha}
      onEditText={(text) => updatePinText(pin.id, text)}
      onToggleResolved={() => toggleResolved(pin.id)}
      onDelete={() => deletePin(pin.id)}
      onAddReply={(text) => addReply(pin.id, text)}
      onUpdateReplyText={(replyId, text) =>
        updateReplyText(pin.id, replyId, text)
      }
      onDeleteReply={(replyId) => deleteReply(pin.id, replyId)}
      onActivate={() => {
        selectPin(pin.id);
        if (pin.route && pin.route !== currentRoute) {
          requestIframeNav(pin.route);
        }
      }}
      onSendToMolly={() => onSendToMolly?.(pin)}
    />
  );

  return (
    <div className="ui-scroll" style={commentsListStyle}>
      {active.map((pin, idx) => renderCommentRow(pin, idx))}

      {archived.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border-secondary)', marginTop: 12 }}>
          <button
            type="button"
            onClick={() => setArchivedOpen((v) => !v)}
            style={{
              width: '100%',
              padding: '10px 16px',
              fontSize: 11,
              color: 'var(--text-tertiary)',
              background: 'none',
              border: 'none',
              textAlign: 'left',
              cursor: 'pointer',
            }}
          >
            {archivedOpen ? '▾' : '▸'} Archived ({archived.length})
          </button>
          {archivedOpen && archived.map((pin, idx) => renderCommentRow(pin, idx))}
        </div>
      )}
    </div>
  );
}

function CommentRow({
  pin,
  index,
  isStale,
  onEditText,
  onToggleResolved,
  onDelete,
  onAddReply,
  onUpdateReplyText,
  onDeleteReply,
  onActivate,
  onSendToMolly,
}: {
  pin: PinComment;
  index: number;
  isStale: boolean;
  onEditText: (text: string) => void;
  onToggleResolved: () => void;
  onDelete: () => void;
  onAddReply: (text: string) => void;
  onUpdateReplyText: (replyId: string, text: string) => void;
  onDeleteReply: (replyId: string) => void;
  onActivate: () => void;
  onSendToMolly: () => void;
}) {
  const resolved = !!pin.resolvedAt;
  const replyCount = pin.replies?.length ?? 0;
  const targetLabel =
    pin.element?.label ??
    pin.element?.testId ??
    pin.element?.displayName ??
    (pin.route ? pin.route : `(${pin.x}, ${pin.y})`);
  const when = formatWhen(pin.createdAt);

  const [isEditingBody, setIsEditingBody] = useState(!pin.text);
  const [composeOpen, setComposeOpen] = useState(false);

  return (
    <div
      onClick={(e) => {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'BUTTON' || tag === 'TEXTAREA' || tag === 'INPUT' || tag === 'A') return;
        onActivate();
      }}
      style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--border-secondary)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        opacity: resolved ? 0.6 : 1,
        cursor: 'pointer',
      }}
    >
      {/* Header: number + target + time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: resolved
              ? 'var(--success)'
              : isStale
                ? 'var(--warning)'
                : 'var(--accent)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: '0 0 auto',
          }}
        >
          {index}
        </span>
        <span
          style={{
            color: 'var(--text-tertiary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}
          title={targetLabel}
        >
          {targetLabel}
        </span>
        <span style={{ color: 'var(--text-tertiary)' }}>{when}</span>
      </div>

      {/* Body — click to edit, blur to save */}
      {isEditingBody ? (
        <textarea
          autoFocus
          defaultValue={pin.text}
          placeholder="Note"
          onKeyDown={(e) => {
            if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
          }}
          onBlur={(e) => {
            if (e.target.value !== pin.text) onEditText(e.target.value);
            setIsEditingBody(false);
          }}
          style={inlineBodyInputStyle}
        />
      ) : (
        <div
          onClick={(e) => { e.stopPropagation(); setIsEditingBody(true); }}
          style={{
            fontSize: 14,
            lineHeight: 1.5,
            color: pin.text ? 'var(--text-primary)' : 'var(--text-tertiary)',
            cursor: 'text',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            minHeight: 18,
          }}
        >
          {pin.text || 'Add a note…'}
        </div>
      )}

      {/* Replies (plain read-only rows) */}
      {replyCount > 0 && (
        <div
          style={{
            marginLeft: 6,
            paddingLeft: 10,
            borderLeft: '2px solid var(--border-secondary)',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          {pin.replies!.map((r) => (
            <ReplyRow
              key={r.id}
              text={r.text}
              createdAt={r.createdAt}
              onUpdateText={(text) => onUpdateReplyText(r.id, text)}
              onDelete={() => onDeleteReply(r.id)}
            />
          ))}
        </div>
      )}

      {/* Reply compose — hidden until the user asks */}
      {composeOpen && (
        <div
          style={{
            marginLeft: 6,
            paddingLeft: 10,
            borderLeft: '2px solid var(--accent-light)',
          }}
        >
          <ReplyCompose
            onSubmit={(text) => {
              onAddReply(text);
              setComposeOpen(false);
            }}
            onCancel={() => setComposeOpen(false)}
          />
        </div>
      )}

      {/* Action row — discreet text-only buttons */}
      <div
        style={{
          display: 'flex',
          gap: 14,
          fontSize: 11,
          color: 'var(--text-tertiary)',
        }}
      >
        {!resolved && (
          <button
            type="button"
            onClick={() => setComposeOpen((v) => !v)}
            style={linkButtonStyle}
          >
            💬 Reply{replyCount > 0 ? ` ${replyCount}` : ''}
          </button>
        )}
        <button
          type="button"
          onClick={onToggleResolved}
          style={linkButtonStyle}
        >
          {resolved ? '↺ Reopen' : '✓ Resolve'}
        </button>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSendToMolly();
          }}
          style={{
            fontSize: 11,
            padding: '4px 10px',
            background: 'transparent',
            border: '1px solid var(--border-primary)',
            borderRadius: 4,
            cursor: 'pointer',
            color: 'var(--text-secondary)',
          }}
          title="Convert this comment to a PRD and send a request to Molly"
          disabled={!pin.text?.trim()}
        >
          🤖 Ask Molly
        </button>
        <button
          type="button"
          onClick={onDelete}
          style={{ ...linkButtonStyle, color: 'var(--error)' }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function ReplyRow({
  text,
  createdAt,
  onUpdateText,
  onDelete,
}: {
  text: string;
  createdAt: number;
  onUpdateText: (text: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div
        style={{
          display: 'flex',
          gap: 6,
          fontSize: 10,
          color: 'var(--text-tertiary)',
        }}
      >
        <span>{formatWhen(createdAt)}</span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onDelete}
          style={{
            ...linkButtonStyle,
            fontSize: 10,
            padding: 0,
          }}
          title="Delete reply"
        >
          ✕
        </button>
      </div>
      {editing ? (
        <textarea
          autoFocus
          defaultValue={text}
          onKeyDown={(e) => {
            if (e.key === 'Escape') (e.target as HTMLTextAreaElement).blur();
          }}
          onBlur={(e) => {
            if (e.target.value !== text) onUpdateText(e.target.value);
            setEditing(false);
          }}
          style={inlineBodyInputStyle}
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          style={{
            fontSize: 13,
            lineHeight: 1.5,
            color: 'var(--text-primary)',
            cursor: 'text',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {text}
        </div>
      )}
    </div>
  );
}

function ReplyCompose({
  onSubmit,
  onCancel,
}: {
  onSubmit: (text: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const canSubmit = value.trim().length > 0;
  const submit = () => {
    if (!canSubmit) return;
    onSubmit(value.trim());
    setValue('');
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <textarea
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Add a reply…"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        style={inlineBodyInputStyle}
      />
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button type="button" onClick={onCancel} style={linkButtonStyle}>
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          style={{
            padding: '4px 10px',
            fontSize: 11,
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            background: canSubmit ? 'var(--accent)' : 'var(--bg-tertiary)',
            color: canSubmit ? 'var(--text-inverse)' : 'var(--text-tertiary)',
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            fontWeight: 600,
            fontFamily: 'inherit',
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

const inlineBodyInputStyle: React.CSSProperties = {
  width: '100%',
  minHeight: 40,
  resize: 'vertical',
  fontSize: 13,
  fontFamily: 'inherit',
  color: 'var(--text-primary)',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-sm)',
  padding: 6,
  boxSizing: 'border-box',
  lineHeight: 1.5,
};

const linkButtonStyle: React.CSSProperties = {
  border: 'none',
  background: 'transparent',
  padding: 0,
  fontSize: 11,
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

function formatWhen(ts: number) {
  const diffMs = Date.now() - ts;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(ts).toLocaleDateString('en-US');
}

const commentsEmptyStyle: React.CSSProperties = {
  padding: '32px 20px',
  textAlign: 'center',
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-tertiary)',
};

const commentsListStyle: React.CSSProperties = {
  flex: 1,
  overflowY: 'auto',
  background: 'var(--bg-primary)',
};

/**
 * Collapsed accordion that wraps a run of archived messages. Archive
 * fires when the user sends a fresh prompt while the playground was
 * checked out at a past commit — the intermediate messages are still
 * here, just folded out of the main timeline so the new work stands
 * alone. Click to expand in-place; the internal MessageRow renders
 * with `dimmed` so it's clear these are historical.
 */
function ArchivedGroup({ messages }: { messages: ChatMessage[] }) {
  const [open, setOpen] = useState(false);
  if (messages.length === 0) return null;
  const first = messages[0];
  const last = messages[messages.length - 1];
  const durationMs = last.timestamp - first.timestamp;
  return (
    <div
      style={{
        margin: '6px 0',
        border: '1px dashed var(--border-primary)',
        borderRadius: 8,
        background:
          'repeating-linear-gradient(45deg, var(--bg-elevated, #f5f6f8), var(--bg-elevated, #f5f6f8) 6px, transparent 6px, transparent 12px)',
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '8px 12px',
          width: '100%',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
          fontSize: 11,
          color: 'var(--text-tertiary)',
        }}
        aria-expanded={open}
      >
        <span aria-hidden>📦</span>
        <span style={{ fontWeight: 600 }}>
          Archived work · {messages.length} messages
        </span>
        {durationMs > 0 && (
          <span>({formatDurationLabel(durationMs)})</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10 }}>{open ? '▾ Collapse' : '▸ Expand'}</span>
      </button>
      {open && (
        <div
          style={{
            padding: '0 12px 10px',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {messages.map((m) => (
            <div
              key={m.id}
              style={{ opacity: 0.6 }}
              title="Archived work — not reflected in the current working tree"
            >
              {/* Shallow render — just content text, no actions. Users
                  who need to dig in can copy the prompt into a fresh
                  message. Keeping this light avoids re-wiring every
                  plan/execution handler for archived items. */}
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                <strong style={{ marginRight: 6 }}>
                  {m.role === 'user' ? '👤' : '◎'}
                </strong>
                {m.content || (m.plan ? '(plan)' : m.execution ? '(execution)' : m.jobId ? '(job)' : '')}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDurationLabel(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return '<1m';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins ? `${hours}h ${remMins}m` : `${hours}h`;
}

function EmptyState() {
  const suggestions = [
    'Add Moloco Ads section to TVING Ad System nav',
    'Add bulk status change to auction order page',
    'Clean up columns on ad creative review page',
  ];

  const pickSuggestion = (s: string) => {
    const el = document.querySelector('textarea');
    if (!el) return;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value',
    )?.set;
    setter?.call(el, s);
    (el as HTMLTextAreaElement).focus();
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        textAlign: 'center',
        color: 'var(--text-secondary)',
        gap: 20,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: '50%',
          background: 'var(--accent-light)',
          color: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-hidden
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="12" cy="12" r="7" />
          <line x1="12" y1="1" x2="12" y2="5" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="1" y1="12" x2="5" y2="12" />
          <line x1="19" y1="12" x2="23" y2="12" />
        </svg>
      </div>
      <div>
        <div
          style={{
            fontSize: 15,
            fontWeight: 600,
            color: 'var(--text-primary)',
            marginBottom: 6,
          }}
        >
          What would you like to build?
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
          Paste a Jira ticket or PRD link, or describe what you want to change in plain language.
          <br />
          AI will create a plan based on DS patterns.
        </div>
      </div>

      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color: 'var(--text-tertiary)',
            fontWeight: 600,
            marginBottom: 2,
            textAlign: 'left',
          }}
        >
          Examples
        </div>
        {suggestions.map((s) => (
          <button
            key={s}
            onClick={() => pickSuggestion(s)}
            style={{
              textAlign: 'left',
              border: '1px solid var(--border-primary)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 10px',
              background: 'var(--bg-secondary)',
              cursor: 'pointer',
              fontSize: 12,
              color: 'var(--text-secondary)',
              lineHeight: 1.4,
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)';
              e.currentTarget.style.background = 'var(--accent-light)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border-primary)';
              e.currentTarget.style.background = 'var(--bg-secondary)';
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function CommentInlineCard({
  pin,
  onActivate,
  onSendToMolly,
}: {
  pin: PinComment;
  onActivate: () => void;
  onSendToMolly: () => void;
}) {
  const target =
    pin.element?.label ??
    pin.element?.testId ??
    pin.element?.displayName ??
    pin.route ??
    `(${pin.x}, ${pin.y})`;
  const when = formatWhen(pin.createdAt);

  return (
    <div
      onClick={(e) => {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'BUTTON' || tag === 'A') return;
        onActivate();
      }}
      style={{
        padding: '8px 10px',
        background: 'var(--bg-secondary)',
        borderLeft: '3px solid var(--accent)',
        borderRadius: 4,
        fontSize: 12,
        display: 'flex',
        gap: 8,
        alignItems: 'flex-start',
        cursor: 'pointer',
      }}
      title="Click to locate in iframe"
    >
      <span style={{ fontSize: 14, flex: '0 0 auto' }}>💬</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, overflowWrap: 'anywhere', lineHeight: 1.4 }}>
          {pin.text || '(no content)'}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 2 }}>
          {target} · {when}
        </div>
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onSendToMolly();
        }}
        disabled={!pin.text?.trim()}
        style={{
          fontSize: 11,
          padding: '2px 6px',
          background: 'transparent',
          border: '1px solid var(--border-primary)',
          borderRadius: 3,
          cursor: pin.text?.trim() ? 'pointer' : 'not-allowed',
          opacity: pin.text?.trim() ? 1 : 0.4,
          flex: '0 0 auto',
        }}
        title="Convert this comment to a PRD and send to Molly"
      >
        🤖
      </button>
    </div>
  );
}

function MessageRow({
  message,
  activeSha,
  onChoice,
  isSending,
  checkpointNumber,
  dimmed = false,
  onTogglePlanItem,
  onAcceptPlan,
  onRejectPlan,
  onRedecomposePlan,
  onCheckoutCommit,
  onRestoreToSha,
  priorUserContent,
}: {
  message: ChatMessage;
  activeSha: string | null;
  onChoice: (text: string) => void;
  isSending: boolean;
  checkpointNumber?: number;
  dimmed?: boolean;
  onTogglePlanItem: (itemId: string) => void;
  onAcceptPlan: () => void;
  onRejectPlan: () => void;
  onRedecomposePlan: (feedback: string) => Promise<void>;
  onCheckoutCommit: (sha: string) => void;
  onRestoreToSha: (sha: string, labelHint?: string) => void;
  /** PRD source for the DS-missing card (most recent prior user message). */
  priorUserContent?: string;
}) {
  const isUser = message.role === 'user';
  const parsed = useMemo(
    () => (message.content && !isUser ? parseAssistantContent(message.content) : null),
    [message.content, isUser],
  );

  // When an ExecutionCard is attached the placeholder content
  // ("Starting execution in sandbox…") becomes stale the moment the run
  // advances past that phase — the card itself shows live status, so
  // rendering both makes finished runs look hung. Skip the text bubble
  // whenever the message carries an execution.
  const showContent = !!message.content && !message.execution;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        opacity: dimmed ? 0.45 : 1,
        transition: 'opacity 120ms ease-out',
      }}
      title={dimmed ? 'Created after rewinding to a past point — not in the current working tree' : undefined}
    >
      {showContent && (
        isUser ? (
          <UserBubble
            content={message.content}
            attachedElement={message.attachedElement}
          />
        ) : (
          <AssistantBubble
            parsed={parsed}
            fallbackContent={message.content}
            onChoice={onChoice}
            isSending={isSending}
          />
        )
      )}

      {message.plan && (
        <PlanCard
          plan={message.plan}
          resolved={message.planResolved}
          onToggleItem={onTogglePlanItem}
          onAccept={onAcceptPlan}
          onReject={onRejectPlan}
          onRedecompose={onRedecomposePlan}
        />
      )}

      {message.plan?.unresolvedComponents?.map((u) => (
        <MissingComponentCard
          key={`${message.id}-missing-${u.intent}`}
          messageId={message.id}
          unresolved={u}
          prd={priorUserContent ?? message.plan?.meta.summary ?? ''}
          playgroundClient={message.plan?.meta.targetClient ?? null}
        />
      ))}

      {message.execution && (
        <ExecutionCard
          execution={message.execution}
          activeSha={activeSha}
          checkpointNumber={checkpointNumber}
          onCheckoutCommit={onCheckoutCommit}
          onRestoreToSha={onRestoreToSha}
        />
      )}

      {message.jobId && <JobCard jobId={message.jobId} />}
    </div>
  );
}

// ── Chat bubbles + markdown + choice parser ─────────────────────────

interface ParsedChoice {
  /** The raw label sent back to the agent when clicked. */
  value: string;
  /** Letter or number marker e.g. 'a', 'b', '1'. */
  marker: string;
  /** Description text that followed the bold label, or empty. */
  description: string;
}

interface ParsedAssistantContent {
  lead: string;
  choices: ParsedChoice[];
  tail: string;
}

/**
 * Extract a block of (a)/(b)/(c) or 1./2./3. style choices from an
 * assistant message. A choice is recognized as a line matching one of:
 *   - `(a) **Label** — description`
 *   - `a) **Label** — description`
 *   - `1. **Label** — description`
 * A choice block requires at least 2 such lines (possibly separated by
 * blank lines) appearing consecutively. Text before/after is returned
 * as `lead`/`tail` so the prose context survives.
 */
function parseAssistantContent(content: string): ParsedAssistantContent {
  const lines = content.split('\n');
  const CHOICE_RE =
    /^\s*\(?([a-zA-Z]|\d+)\)?\s*[.\)]\s*\*\*([^*]+)\*\*\s*(?:[—\-:]\s*)?(.*)$/;
  const matches: Array<{ idx: number; marker: string; label: string; desc: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    const m = CHOICE_RE.exec(lines[i]);
    if (m) {
      matches.push({ idx: i, marker: m[1].toLowerCase(), label: m[2].trim(), desc: m[3].trim() });
    }
  }

  // Find the longest consecutive run (allowing blank-line gaps of 1)
  if (matches.length < 2) {
    return { lead: content, choices: [], tail: '' };
  }
  let bestStart = 0;
  let bestEnd = 0;
  let curStart = 0;
  let curEnd = 0;
  for (let i = 1; i < matches.length; i++) {
    const gap = matches[i].idx - matches[i - 1].idx;
    // Allow up to 2 blank/non-choice lines between — agents often insert them.
    if (gap <= 3) {
      curEnd = i;
    } else {
      if (curEnd - curStart > bestEnd - bestStart) {
        bestStart = curStart;
        bestEnd = curEnd;
      }
      curStart = i;
      curEnd = i;
    }
  }
  if (curEnd - curStart > bestEnd - bestStart) {
    bestStart = curStart;
    bestEnd = curEnd;
  }
  if (bestEnd - bestStart < 1) {
    return { lead: content, choices: [], tail: '' };
  }

  const block = matches.slice(bestStart, bestEnd + 1);
  const firstLine = block[0].idx;
  const lastLine = block[block.length - 1].idx;
  const lead = lines.slice(0, firstLine).join('\n').trim();
  const tail = lines.slice(lastLine + 1).join('\n').trim();
  const choices: ParsedChoice[] = block.map((b) => ({
    value: b.label,
    marker: b.marker,
    description: b.desc,
  }));
  return { lead, choices, tail };
}

/**
 * Render a minimal markdown subset: `**bold**`, `` `code` ``, and line breaks.
 * Avoids pulling in a full markdown library — assistant replies in this app
 * are short conversational prose, not full documents.
 */
function renderInlineMarkdown(text: string): React.ReactNode {
  const lines = text.split('\n');
  return lines.map((line, li) => (
    <React.Fragment key={li}>
      {renderInlineSegments(line)}
      {li < lines.length - 1 && <br />}
    </React.Fragment>
  ));
}

function renderInlineSegments(line: string): React.ReactNode[] {
  // Tokenize on **bold**, `code`, and bare http(s) URLs in a single pass.
  // Greedy enough for short assistant replies; not a full CommonMark parser.
  // URL regex: scheme http/https only (whitelist — avoids `javascript:` etc.),
  // followed by non-whitespace. Trailing punctuation (.,!?:;)] etc.) is
  // trimmed before linking so "see http://x.com." doesn't link the period.
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s<>`)]+)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = re.exec(line)) !== null) {
    if (match.index > lastIdx) {
      parts.push(line.slice(lastIdx, match.index));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      parts.push(
        <strong key={`b${key++}`} style={{ fontWeight: 600 }}>
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('`')) {
      parts.push(
        <code
          key={`c${key++}`}
          style={{
            fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            fontSize: '0.88em',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-secondary)',
            padding: '0 4px',
            borderRadius: 4,
          }}
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      // Bare URL — strip trailing punctuation so it doesn't get pulled into
      // the link target ("...http://x.com." → href=http://x.com, then "." text).
      const trailMatch = token.match(/[.,!?:;)]+$/);
      const trailing = trailMatch?.[0] ?? '';
      const href = trailing ? token.slice(0, -trailing.length) : token;
      parts.push(
        <a
          key={`u${key++}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--accent-primary)', textDecoration: 'underline' }}
        >
          {href}
        </a>,
      );
      if (trailing) parts.push(trailing);
    }
    lastIdx = match.index + token.length;
  }
  if (lastIdx < line.length) parts.push(line.slice(lastIdx));
  return parts;
}

function UserBubble({
  content,
  attachedElement,
}: {
  content: string;
  attachedElement?: BridgeElementContext;
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div
        style={{
          maxWidth: '85%',
          background: 'var(--msg-user-bg)',
          color: 'var(--msg-user-text)',
          padding: '9px 13px',
          borderRadius: '14px 14px 3px 14px',
          fontSize: 13,
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {attachedElement && <UserBubbleAttachmentChip element={attachedElement} />}
        {content}
      </div>
    </div>
  );
}

/**
 * Chip shown inside a user bubble when that message carried a picked
 * element. Mirrors the pre-send PickedElementChip styling but inverted
 * for the accent-on-accent user-bubble background.
 */
function UserBubbleAttachmentChip({ element }: { element: BridgeElementContext }) {
  const primary =
    element.label ??
    element.displayName ??
    (element.testId ? `[${element.testId}]` : undefined) ??
    element.selector ??
    'Selected element';
  const shortSource = element.sourceFile
    ? element.sourceFile.split('/').slice(-2).join('/')
    : null;
  return (
    <div
      style={{
        padding: '6px 8px',
        borderRadius: 8,
        background: 'rgba(255, 255, 255, 0.18)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        fontSize: 11,
        color: 'rgba(255, 255, 255, 0.95)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.95)',
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}
          title={primary}
        >
          {primary}
        </span>
      </div>
      {shortSource && (
        <div
          style={{
            fontSize: 10,
            color: 'rgba(255, 255, 255, 0.75)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, monospace)',
          }}
          title={element.sourceFile ?? undefined}
        >
          {shortSource}
        </div>
      )}
    </div>
  );
}

function AssistantBubble({
  parsed,
  fallbackContent,
  onChoice,
  isSending,
}: {
  parsed: ParsedAssistantContent | null;
  fallbackContent: string;
  onChoice: (text: string) => void;
  isSending: boolean;
}) {
  const lead = parsed?.lead ?? fallbackContent;
  const choices = parsed?.choices ?? [];
  const tail = parsed?.tail ?? '';

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <div
        aria-hidden
        style={{
          flex: '0 0 auto',
          width: 24,
          height: 24,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #b9ceff 0%, #4f86ff 100%)',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          marginTop: 2,
        }}
      >
        ◎
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {lead && (
          <div style={assistantTextStyle}>{renderInlineMarkdown(lead)}</div>
        )}
        {choices.length > 0 && (
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--text-tertiary)',
                marginBottom: 2,
              }}
            >
              Select an option
            </div>
            {choices.map((c) => (
              <button
                key={c.marker + c.value}
                type="button"
                onClick={() => onChoice(c.value)}
                disabled={isSending}
                style={choiceButtonStyle(isSending)}
              >
                <span style={choiceMarkerStyle}>
                  {c.marker.toUpperCase()}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1, minWidth: 0 }}>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {c.value}
                  </span>
                  {c.description && (
                    <span
                      style={{
                        fontSize: 12,
                        color: 'var(--text-secondary)',
                        lineHeight: 1.45,
                      }}
                    >
                      {renderInlineMarkdown(c.description)}
                    </span>
                  )}
                </span>
                <span
                  aria-hidden
                  style={{ color: 'var(--text-tertiary)', fontSize: 13, flexShrink: 0 }}
                >
                  →
                </span>
              </button>
            ))}
          </div>
        )}
        {tail && (
          <div style={{ ...assistantTextStyle, marginTop: 10 }}>
            {renderInlineMarkdown(tail)}
          </div>
        )}
      </div>
    </div>
  );
}

const assistantTextStyle: React.CSSProperties = {
  fontSize: 13,
  lineHeight: 1.6,
  color: 'var(--text-primary)',
  wordBreak: 'break-word',
};

function choiceButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    width: '100%',
    padding: '10px 12px',
    textAlign: 'left',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border-primary)',
    borderRadius: 'var(--radius-md)',
    color: 'var(--text-primary)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.55 : 1,
    fontFamily: 'inherit',
    fontSize: 13,
    transition: 'border-color 120ms ease, background 120ms ease',
  };
}

const choiceMarkerStyle: React.CSSProperties = {
  flex: '0 0 auto',
  width: 24,
  height: 24,
  borderRadius: '50%',
  background: 'var(--chip-bg)',
  border: '1px solid var(--chip-border)',
  color: 'var(--chip-text)',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 11,
  fontWeight: 700,
  marginTop: 1,
};

function PlanCard({
  plan,
  resolved,
  onToggleItem,
  onAccept,
  onReject,
  onRedecompose,
}: {
  plan: { meta: PlanMeta; items: PlanItem[] };
  resolved?: 'accepted' | 'rejected';
  onToggleItem: (id: string) => void;
  onAccept: () => void;
  onReject: () => void;
  /** "Re-plan" — takes feedback and re-calls plan-emitter. On success, plan is swapped automatically. */
  onRedecompose?: (feedback: string) => Promise<void>;
}) {
  const enabledCount = useMemo(
    () => plan.items.filter((i) => i.enabled).length,
    [plan.items],
  );
  const dim = resolved === 'rejected';

  // "Re-plan" inline editor state
  const [redecomposeOpen, setRedecomposeOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submitRedecompose = useCallback(async () => {
    if (!onRedecompose) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onRedecompose(feedbackText);
      // Success — collapse the inline area and reset text (new plan has been swapped in)
      setRedecomposeOpen(false);
      setFeedbackText('');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [feedbackText, onRedecompose]);

  return (
    <Card tone={resolved === 'accepted' ? 'accent' : 'default'} style={{ opacity: dim ? 0.5 : 1 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <Chip label={plan.meta.intent} color="accent" />
        {isFastTrackIntent(plan.meta.intent) && (
          <Chip label="⚡ Fast track" color="accent" />
        )}
        {plan.meta.targetClient && <Chip label={plan.meta.targetClient} />}
        {plan.meta.targetRoute && <Chip label={plan.meta.targetRoute} />}
        {plan.meta.targetEntity && <Chip label={plan.meta.targetEntity} color="entity" />}
      </div>

      {plan.meta.summary && (
        <div
          style={{
            fontSize: 12,
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
            marginBottom: 10,
            padding: '8px 10px',
            background: 'var(--bg-primary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-primary)',
          }}
        >
          {plan.meta.summary}
        </div>
      )}

      <CardSectionLabel>
        Plan ({enabledCount}/{plan.items.length})
      </CardSectionLabel>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
        {plan.items.map((item) => (
          <li
            key={item.id}
            onClick={() => !resolved && onToggleItem(item.id)}
            style={{
              fontSize: 12,
              padding: '6px 8px',
              borderRadius: 'var(--radius-sm)',
              background: item.enabled ? 'var(--bg-primary)' : 'transparent',
              border: `1px solid ${item.enabled ? 'var(--border-primary)' : 'var(--border-secondary)'}`,
              cursor: resolved ? 'default' : 'pointer',
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
              opacity: item.enabled ? 1 : 0.55,
            }}
          >
            <span
              style={{
                color: item.enabled ? 'var(--success)' : 'var(--text-tertiary)',
                fontSize: 13,
                lineHeight: '1.2',
                flex: '0 0 auto',
                marginTop: 1,
              }}
            >
              {item.enabled ? '✓' : '○'}
            </span>
            {/* Without minWidth:0 a flex child expands to its content width and pushes the parent.
                When long file paths appear inline in description / title, left clipping occurs
                — minWidth:0 lets them wrap naturally. */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  color: item.enabled ? 'var(--text-primary)' : 'var(--text-tertiary)',
                  textDecoration: item.enabled ? 'none' : 'line-through',
                  fontWeight: 500,
                  lineHeight: 1.4,
                  overflowWrap: 'anywhere',
                }}
              >
                {item.title}
              </div>
              {item.description && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-tertiary)',
                    lineHeight: 1.45,
                    marginTop: 2,
                    overflowWrap: 'anywhere',
                  }}
                >
                  {item.description}
                </div>
              )}
              {item.patternId && (
                <div
                  style={{
                    fontSize: 10,
                    color: 'var(--text-tertiary)',
                    marginTop: 3,
                  }}
                >
                  pattern:{' '}
                  <code
                    style={{
                      background: 'var(--accent-light)',
                      color: 'var(--accent-text)',
                      padding: '0 4px',
                      borderRadius: 3,
                    }}
                  >
                    {item.patternId}
                  </code>
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>

      {!resolved ? (
        <>
          {/* "Re-plan" inline editor — only when onRedecompose is provided and the user has clicked the button */}
          {redecomposeOpen && onRedecompose && (
            <div
              style={{
                marginTop: 10,
                padding: 10,
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                How would you like to revise? (e.g. "Use Y instead of X for item 3")
              </div>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                disabled={submitting}
                placeholder="Enter your feedback freely..."
                rows={3}
                style={{
                  fontSize: 12,
                  fontFamily: 'inherit',
                  padding: 8,
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-sm)',
                  resize: 'vertical',
                  background: submitting ? 'var(--bg-tertiary)' : 'var(--bg-primary)',
                  color: 'var(--text-primary)',
                }}
              />
              {submitError && (
                <div style={{ fontSize: 11, color: 'var(--danger)' }}>
                  ⚠️ {submitError}
                </div>
              )}
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setRedecomposeOpen(false);
                    setSubmitError(null);
                  }}
                  disabled={submitting}
                  style={{
                    padding: '4px 10px',
                    border: '1px solid var(--border-primary)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'transparent',
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                    color: 'var(--text-secondary)',
                  }}
                >
                  Close
                </button>
                <button
                  onClick={submitRedecompose}
                  disabled={submitting || !feedbackText.trim()}
                  style={{
                    padding: '4px 12px',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    background:
                      submitting || !feedbackText.trim()
                        ? 'var(--bg-tertiary)'
                        : 'var(--approve-bg)',
                    color:
                      submitting || !feedbackText.trim()
                        ? 'var(--text-tertiary)'
                        : '#fff',
                    cursor:
                      submitting || !feedbackText.trim() ? 'not-allowed' : 'pointer',
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  {submitting ? 'Regenerating…' : 'Regenerate'}
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              onClick={onReject}
              style={{
                padding: '6px 12px',
                border: '1px solid var(--border-primary)',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-primary)',
                cursor: 'pointer',
                fontSize: 12,
                color: 'var(--text-secondary)',
              }}
            >
              Cancel
            </button>
            {onRedecompose && (
              <button
                onClick={() => {
                  setRedecomposeOpen((v) => !v);
                  setSubmitError(null);
                }}
                disabled={submitting}
                style={{
                  padding: '6px 12px',
                  border: '1px solid var(--border-primary)',
                  borderRadius: 'var(--radius-md)',
                  background: redecomposeOpen
                    ? 'var(--bg-tertiary)'
                    : 'var(--bg-primary)',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                }}
                title="Provide feedback and regenerate the plan"
              >
                ✏️ Re-plan
              </button>
            )}
            <button
              onClick={onAccept}
              disabled={enabledCount === 0 || submitting}
              style={{
                padding: '6px 14px',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                background:
                  enabledCount === 0 || submitting
                    ? 'var(--bg-tertiary)'
                    : 'var(--approve-bg)',
                color:
                  enabledCount === 0 || submitting
                    ? 'var(--text-tertiary)'
                    : '#fff',
                cursor:
                  enabledCount === 0 || submitting ? 'not-allowed' : 'pointer',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Run →
            </button>
          </div>
        </>
      ) : (
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: resolved === 'accepted' ? 'var(--success)' : 'var(--text-tertiary)',
            fontWeight: 500,
          }}
        >
          {resolved === 'accepted' ? '✓ Accepted' : '✕ Rejected'}
        </div>
      )}
    </Card>
  );
}

const PHASE_LABELS: Record<string, string> = {
  queued: 'Queued',
  starting_agent: 'Starting agent',
  syncing_source: 'Syncing source',
  running_agent: 'Running AI',
  collecting_diff: 'Collecting diff',
  capturing_screenshot: 'Capturing screenshot',
  applying_local_patch: 'Applying patch',
  verifying: 'Verifying types',
  verification_retry: 'Retrying (verification failed)',
  verification_failed: 'Verification failed',
  preview_ready: 'Done',
  no_change_needed: 'No change needed',
  pipeline_error: 'Pipeline error',
  error: 'Error',
};
function ExecutionCard({
  execution,
  activeSha,
  checkpointNumber,
  onCheckoutCommit,
  onRestoreToSha,
}: {
  execution: ExecutionState;
  activeSha: string | null;
  checkpointNumber?: number;
  onCheckoutCommit: (sha: string) => void;
  onRestoreToSha: (sha: string, labelHint?: string) => void;
}) {
  const restoredFromSha = usePlaygroundStore(
    (s) => s.current?.restoredFromSha ?? null,
  );
  const isRestoreAnchor =
    !!execution.commitSha &&
    !!restoredFromSha &&
    (execution.commitSha === restoredFromSha ||
      execution.commitSha.startsWith(restoredFromSha));
  const done =
    execution.phase === 'preview_ready' ||
    execution.status === 'approved' ||
    execution.status === 'preview';
  const errored = execution.status === 'error' || execution.phase === 'error';
  const canRewind =
    done &&
    !errored &&
    !!execution.commitSha &&
    execution.commitSha !== activeSha;
  const isCurrent = !!execution.commitSha && execution.commitSha === activeSha;
  // Collapsed once the run is either finished or errored — expanded by
  // default while work is in flight so the user can watch progress.
  const [open, setOpen] = useState(!done && !errored);
  // Inner "Action history" — same default, but decouples from outer
  // so the user can expand the card to see the checkpoint footer
  // without re-showing the full phase log once it's all green.
  const [historyOpen, setHistoryOpen] = useState(!done && !errored);

  const phaseLabel = errored
    ? 'Run failed'
    : done
      ? 'Run complete'
      : execution.phase
        ? (PHASE_LABELS[execution.phase] ?? execution.phase)
        : 'Queued';

  const accent = errored
    ? 'var(--error)'
    : done
      ? 'var(--success)'
      : 'var(--accent)';

  return (
    <div
      style={{
        borderRadius: 10,
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border-secondary)',
      }}
    >
      {/* Disclosure header — click to expand/collapse */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <span
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: accent,
            opacity: errored ? 1 : done ? 1 : 0.25,
            display: 'inline-block',
            flex: '0 0 auto',
          }}
          aria-hidden
        />
        <span
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: 'var(--text-primary)',
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {phaseLabel}
          {execution.changedFiles && execution.changedFiles.length > 0
            ? ` · ${execution.changedFiles.length} files`
            : ''}
        </span>
        {execution.requestId && (
          <span
            style={{
              fontSize: 11,
              color: 'var(--text-tertiary)',
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
            }}
          >
            #{execution.requestId.slice(0, 8)}
          </span>
        )}
        <span
          style={{
            color: 'var(--text-tertiary)',
            fontSize: 12,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s ease',
          }}
          aria-hidden
        >
          ⌄
        </span>
      </button>

      {open && (
        <div
          style={{
            padding: '0 12px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 8px',
              background: 'var(--bg-primary)',
              border: '1px solid var(--border-secondary)',
              borderRadius: 'var(--radius-sm)',
              fontFamily: 'inherit',
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <span
              aria-hidden
              style={{
                color: 'var(--text-tertiary)',
                transform: historyOpen ? 'rotate(90deg)' : 'none',
                transition: 'transform 120ms ease',
                display: 'inline-block',
              }}
            >
              ▸
            </span>
            <span>Action history</span>
          </button>
          {historyOpen && (
            <div style={{ padding: '4px 4px 0' }}>
              <PhaseTimeline
                execution={execution}
                done={done}
                errored={errored}
              />
            </div>
          )}

          {execution.error && (
            <div
              style={{
                fontSize: 12,
                color: 'var(--error)',
                padding: 8,
                background: 'var(--error-light)',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              {execution.error}
            </div>
          )}

          {execution.changedFiles && execution.changedFiles.length > 0 && (
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {execution.changedFiles.map((f) => (
                  <li
                    key={f}
                    style={{
                      fontSize: 10,
                      color: 'var(--text-tertiary)',
                      fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                      padding: '1px 0',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={f}
                  >
                    {f}
                  </li>
                ))}
              </ul>
              {execution.diffUrl && (
                <a
                  href={execution.diffUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    fontSize: 11,
                    color: 'var(--link, #0043ce)',
                    textDecoration: 'none',
                  }}
                >
                  View diff →
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {execution.commitSha && (
        <div style={checkpointFooterStyle}>
          <span style={checkpointBadgeStyle}>
            <span aria-hidden style={{ marginRight: 4 }}>
              ⚑
            </span>
            {checkpointNumber != null
              ? `Checkpoint ${checkpointNumber}`
              : 'Checkpoint'}
          </span>
          <code style={checkpointShaStyle}>
            {execution.commitSha.slice(0, 7)}
          </code>
          <div style={{ flex: 1 }} />
          {isRestoreAnchor ? (
            // Once restored, collapse the action row into a single
            // green "Restored" indicator — showing "view" / Restore
            // alongside would be redundant (already there) and
            // clickable Restore would be confusing (already done).
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '4px 10px',
                borderRadius: 'var(--radius-sm, 4px)',
                background: 'rgba(27, 122, 67, 0.14)',
                color: 'var(--text-success, #1b7a43)',
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
              title="Restored to this checkpoint — subsequent messages are not reflected in the current working tree."
            >
              ↺ Restored
            </span>
          ) : (
            <>
              {isCurrent ? (
                <span style={checkpointCurrentBadgeStyle}>Working</span>
              ) : canRewind ? (
                <button
                  type="button"
                  onClick={() => onCheckoutCommit(execution.commitSha!)}
                  style={checkpointGhostButtonStyle}
                  title="Preview this checkpoint (not a restore)"
                >
                  View
                </button>
              ) : null}
              {execution.requestId && (
                <a
                  href={`http://127.0.0.1:4174/requests/${execution.requestId}`}
                  target="_blank"
                  rel="noreferrer"
                  style={checkpointGhostLinkStyle}
                  title="View change details for this request in the dashboard"
                  onClick={(e) => e.stopPropagation()}
                >
                  View changes ↗
                </a>
              )}
              {done && !errored && !isCurrent && (
                <button
                  type="button"
                  onClick={() =>
                    onRestoreToSha(
                      execution.commitSha!,
                      checkpointNumber != null
                        ? `Checkpoint ${checkpointNumber}`
                        : undefined,
                    )
                  }
                  style={checkpointRestoreButtonStyle}
                  title="Revert changes after this checkpoint (history is preserved)"
                >
                  ↺ Restore
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const checkpointFooterStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: 6,
  rowGap: 4,
  padding: '8px 10px',
  borderTop: '1px solid var(--border-secondary)',
  background: 'var(--bg-primary)',
  borderBottomLeftRadius: 10,
  borderBottomRightRadius: 10,
};

const checkpointBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-secondary)',
  display: 'inline-flex',
  alignItems: 'center',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const checkpointShaStyle: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
  fontSize: 10,
  color: 'var(--text-tertiary)',
  padding: '1px 6px',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border-secondary)',
  borderRadius: 4,
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const checkpointCurrentBadgeStyle: React.CSSProperties = {
  fontSize: 11,
  color: 'var(--success)',
  fontWeight: 600,
  padding: '2px 8px',
  background: 'var(--success-light)',
  borderRadius: 999,
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const checkpointGhostButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 11,
  fontWeight: 500,
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const checkpointGhostLinkStyle: React.CSSProperties = {
  padding: '4px 8px',
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  textDecoration: 'none',
  borderRadius: 'var(--radius-sm)',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

const checkpointRestoreButtonStyle: React.CSSProperties = {
  padding: '4px 10px',
  fontSize: 11,
  fontWeight: 600,
  border: '1px solid var(--border-primary)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--bg-elevated)',
  color: 'var(--text-primary)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  whiteSpace: 'nowrap',
  flexShrink: 0,
};

// ── Phase Timeline (vertical sandbox log view) ──────────────────────

function PhaseTimeline({
  execution,
  done,
  errored,
}: {
  execution: ExecutionState;
  done: boolean;
  errored: boolean;
}) {
  // Render exactly what the server reported, in arrival order. No
  // hardcoded "expected" future phases — agents choose different
  // pipelines (`starting_agent` → `collecting_diff` vs `syncing_source`
  // → `running_agent` → `capturing_screenshot` etc.) and showing
  // pre-baked greyed-out steps for a pipeline that isn't running is
  // misleading. The current phase lands at the end when it hasn't
  // joined `phasesSeen` yet (the server emits it via a separate field
  // and flushes on phase transitions).
  const rows: string[] = [...execution.phasesSeen];
  if (execution.phase && !rows.includes(execution.phase)) {
    rows.push(execution.phase);
  }
  if (rows.length === 0) rows.push('queued');

  return (
    <ol style={timelineListStyle}>
      {rows.map((p, i) => {
        const isCurrent = execution.phase === p && !done && !errored;
        const isLast = i === rows.length - 1;
        const state: 'done' | 'current' | 'error' = errored && isCurrent
          ? 'error'
          : isCurrent
            ? 'current'
            : 'done';

        return (
          <li key={`${p}-${i}`} style={timelineRowStyle}>
            <div style={timelineMarkerColumnStyle}>
              <PhaseMarker state={state} />
              {!isLast && (
                <div
                  style={{
                    ...timelineConnectorStyle,
                    background: state === 'done'
                      ? 'var(--success)'
                      : state === 'error'
                        ? 'var(--error)'
                        : 'var(--accent)',
                  }}
                />
              )}
            </div>
            <div style={timelineContentStyle}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: state === 'current' ? 600 : 500,
                  color:
                    state === 'error'
                      ? 'var(--error)'
                      : 'var(--text-primary)',
                }}
              >
                {PHASE_LABELS[p] ?? humanizePhase(p)}
              </div>
              {state === 'current' && execution.latestLog && (
                <div style={timelineLogStyle}>{execution.latestLog}</div>
              )}
              {state === 'done' && p === execution.phase && execution.latestLog && (
                <div style={timelineLogStyle}>{execution.latestLog}</div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Lightweight humanizer for server-side phase names we don't have a
 *  Korean label for. Turns `starting_agent` → `starting agent`. */
function humanizePhase(raw: string): string {
  return raw.replace(/_/g, ' ');
}

function PhaseMarker({ state }: { state: 'done' | 'current' | 'pending' | 'error' }) {
  const size = 14;
  if (state === 'done') {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'var(--success)',
          color: 'var(--text-inverse)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 9,
          fontWeight: 700,
          flex: '0 0 auto',
        }}
        aria-label="Done"
      >
        ✓
      </div>
    );
  }
  if (state === 'current') {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          border: '2px solid var(--accent)',
          borderTopColor: 'transparent',
          animation: 'spin 1s linear infinite',
          flex: '0 0 auto',
        }}
        aria-label="In progress"
      />
    );
  }
  if (state === 'error') {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: 'var(--error)',
          color: 'var(--text-inverse)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 700,
          flex: '0 0 auto',
        }}
        aria-label="Failed"
      >
        ×
      </div>
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        border: '1px solid var(--border-primary)',
        background: 'var(--bg-primary)',
        flex: '0 0 auto',
      }}
      aria-label="Queued"
    />
  );
}

const timelineListStyle: React.CSSProperties = {
  listStyle: 'none',
  padding: 0,
  margin: 0,
  display: 'flex',
  flexDirection: 'column',
};

const timelineRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 10,
  position: 'relative',
};

const timelineMarkerColumnStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  flex: '0 0 auto',
  minHeight: 24,
};

const timelineConnectorStyle: React.CSSProperties = {
  width: 2,
  flex: 1,
  minHeight: 12,
  marginTop: 2,
  marginBottom: -2,
};

const timelineContentStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  paddingBottom: 10,
  paddingTop: 0,
};

const timelineLogStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 11,
  color: 'var(--text-secondary)',
  padding: '6px 8px',
  background: 'var(--bg-primary)',
  borderRadius: 'var(--radius-sm)',
  border: '1px solid var(--border-secondary)',
  lineHeight: 1.5,
  wordBreak: 'break-word',
};

// Phase-based progress messages — UX feedback (2026-04-30): the client
// doesn't know whether the input is PRD/chat/status, so wording is generic.
//   0s    "Molly is looking into it"        classifier (all inputs pass through)
//   2s    "Analyzing context..."            chat/status/analyzer (~3-10s)
//   8s    "Preparing response... (10-20s)"  plan emit OR long response phase
//   20s   "Just a moment longer..."         approaching timeout
const TYPING_PHASES = [
  { atMs: 0, label: 'Molly is looking into it' },
  { atMs: 2000, label: 'Analyzing context...' },
  { atMs: 8000, label: 'Preparing response... (10-20s)' },
  { atMs: 20000, label: 'Almost there...' },
] as const;

function TypingIndicator() {
  const [phaseIdx, setPhaseIdx] = useState(0);
  useEffect(() => {
    const timers = TYPING_PHASES.slice(1).map((p, i) =>
      setTimeout(() => setPhaseIdx(i + 1), p.atMs),
    );
    return () => timers.forEach(clearTimeout);
  }, []);
  const label = TYPING_PHASES[phaseIdx].label;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 2 }}>
      <div
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          background: 'var(--accent-light)',
          color: 'var(--accent)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
        }}
        aria-hidden
      >
        ✦
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{label}</span>
        <div style={{ display: 'flex', gap: 3 }}>
          <Dot delay={0} />
          <Dot delay={160} />
          <Dot delay={320} />
        </div>
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: number }) {
  return (
    <span
      style={{
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: 'var(--text-tertiary)',
        animation: `aipanel-dot 1.2s infinite ${delay}ms`,
      }}
    />
  );
}

// ── DS Escalation Slice A — MissingComponentCard ─────────────────────
// Rendered below PlanCard when the planner reports unresolved_components.
// 4 buttons (closest_match / custom_build / propose_new / extend_existing).
// Recommended = closest_match when similarity_score >= 0.5; otherwise the
// kind-aligned escalation option. Posts the user's choice to
// `/api/missing-choice` and asks the store to remember the resolution so
// the buttons disable themselves on re-render.

function MissingComponentCard({
  messageId,
  unresolved,
  prd,
  playgroundClient,
}: {
  messageId: string;
  unresolved: PlanUnresolvedComponent;
  prd: string;
  playgroundClient: TargetClient | null;
}) {
  const resolveMissingComponent = usePlaygroundStore((s) => s.resolveMissingComponent);
  const [submitting, setSubmitting] = useState<MissingChoiceKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closest = unresolved.closest_match;
  const closestUsable = !!closest && (closest.similarity_score ?? 0) >= 0.5;
  let recommendedKind: MissingChoiceKind;
  if (closestUsable) recommendedKind = 'closest_match';
  else if (unresolved.kind === 'extension' && closest) recommendedKind = 'extend_existing';
  else recommendedKind = 'propose_new';

  const resolved = unresolved.resolution ?? null;
  const draftPreview = unresolved.draftPreview ?? null;

  const choose = useCallback(
    async (choice: MissingChoiceKind) => {
      if (resolved || submitting) return;
      setSubmitting(choice);
      setError(null);
      try {
        const rawClosest = closest
          ? {
              name: closest.name,
              importStatement: closest.importStatement ?? null,
              similarity_score: closest.similarity_score,
              reasoning: closest.reasoning,
            }
          : null;
        const rawUnresolved: RawUnresolvedComponent = {
          intent: unresolved.intent,
          reason: unresolved.reason,
          kind: unresolved.kind,
          closest_match: rawClosest,
        };
        const reply = await postMissingChoice({
          surface: 'playground',
          choice,
          unresolved: rawUnresolved,
          prd,
          client: playgroundClient ?? null,
        });
        resolveMissingComponent(
          messageId,
          unresolved.intent,
          choice,
          reply.draftPreview ?? undefined,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to record DS-missing choice';
        setError(msg);
      } finally {
        setSubmitting(null);
      }
    },
    [resolved, submitting, closest, unresolved, prd, playgroundClient, resolveMissingComponent, messageId],
  );

  const options: Array<{ kind: MissingChoiceKind; label: string; disabled: boolean; hint: string }> = [
    {
      kind: 'closest_match',
      label: closestUsable && closest ? `Proceed with ${closest.name}` : 'Use closest match',
      disabled: !closest,
      hint: closest
        ? `${closest.name} (${Math.round((closest.similarity_score ?? 0) * 100)}%) — ${closest.reasoning || ''}`.trim()
        : 'No closest match provided by the planner.',
    },
    {
      kind: 'custom_build',
      label: 'Build custom (outside DS)',
      disabled: false,
      hint: 'Generate locally, auto-labeled "outside DS".',
    },
    {
      kind: 'propose_new',
      label: 'Propose new DS component',
      disabled: false,
      hint: 'Preview a DS-request draft (Slice B will turn approval into a real PR).',
    },
    {
      kind: 'extend_existing',
      label: 'Extend existing component',
      disabled: !closest,
      hint: closest
        ? `Preview adding a prop/variant to ${closest.name}.`
        : 'Needs a closest_match to extend.',
    },
  ];

  return (
    <Card
      style={{
        padding: 14,
        background: '#1c1f24',
        border: '1px solid #3a3f48',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <CardSectionLabel>🔍 DS missing</CardSectionLabel>
        {resolved && <Chip label={resolved} color="success" />}
      </div>
      <div style={{ fontSize: 13, lineHeight: 1.5, color: '#e1e3e8' }}>
        <strong>Intent:</strong> {unresolved.intent || '(no intent)'}
        <br />
        <span style={{ color: '#aab1bb' }}>{unresolved.reason}</span>
      </div>
      {closest && (
        <div style={{ fontSize: 12, color: '#aab1bb', background: '#15171b', borderRadius: 6, padding: 8 }}>
          <strong>Closest:</strong> <code>{closest.name}</code>{' '}
          <span>(similarity {Math.round((closest.similarity_score ?? 0) * 100)}%)</span>
          <br />
          {closest.reasoning}
        </div>
      )}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gap: 8,
        }}
      >
        {options.map((opt) => {
          const isRecommended = !resolved && opt.kind === recommendedKind && !opt.disabled;
          const isThisResolved = resolved === opt.kind;
          const isLoading = submitting === opt.kind;
          return (
            <button
              key={opt.kind}
              type="button"
              disabled={!!resolved || opt.disabled || !!submitting}
              onClick={() => void choose(opt.kind)}
              style={{
                textAlign: 'left',
                padding: 10,
                borderRadius: 6,
                background: isThisResolved
                  ? '#2d4a2d'
                  : isRecommended
                    ? '#2b2f3a'
                    : '#23262c',
                color: opt.disabled ? '#6f747c' : '#e1e3e8',
                border: isRecommended ? '1px solid #5a8bff' : '1px solid #3a3f48',
                cursor: resolved || opt.disabled || submitting ? 'default' : 'pointer',
                opacity: resolved && !isThisResolved ? 0.55 : 1,
                fontSize: 12,
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {isRecommended && '⭐ '}
                {opt.label}
                {isLoading && ' …'}
              </div>
              <div style={{ color: '#9aa1aa', fontSize: 11 }}>{opt.hint}</div>
            </button>
          );
        })}
      </div>
      {error && <div style={{ color: '#ff6b6b', fontSize: 11 }}>{error}</div>}
      {draftPreview && (resolved === 'propose_new' || resolved === 'extend_existing') && (
        <pre
          style={{
            background: '#0e1014',
            border: '1px solid #2a2d34',
            borderRadius: 6,
            padding: 10,
            fontSize: 11,
            lineHeight: 1.45,
            color: '#cfd3da',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            margin: 0,
            maxHeight: 320,
            overflow: 'auto',
          }}
        >
          {draftPreview}
        </pre>
      )}
    </Card>
  );
}

// ── Helpers ────────────────────────────────────────────

function rawToPlan(raw: RawPlan): {
  meta: PlanMeta;
  items: PlanItem[];
  unresolvedComponents?: PlanUnresolvedComponent[];
} {
  return {
    meta: {
      intent: raw.intent,
      targetEntity: raw.target_entity,
      summary: raw.summary,
      targetClient: (raw.target?.client ?? undefined) as TargetClient | undefined,
      targetRoute: raw.target?.route_or_page,
      visualConstraints: raw.visual_constraints ?? [],
    },
    items: (raw.plan_items ?? []).map((it) => ({
      id: it.id,
      title: it.title,
      description: it.description,
      patternId: it.pattern_id ?? undefined,
      targetFile: it.target_file ?? undefined,
      dependsOn: it.depends_on,
      enabled: true,
    })),
    unresolvedComponents: (raw.unresolved_components ?? []).map(normalizeUnresolvedComponent),
  };
}

// DS Escalation Slice A — normalize the LLM output so the UI doesn't need to
// branch on legacy string `closest_match`. Mirrors normalizeUnresolved() in
// orchestrator/lib/ds-escalation.js.
function normalizeUnresolvedComponent(
  raw: RawUnresolvedComponent,
): PlanUnresolvedComponent {
  const kind: PlanUnresolvedComponent['kind'] =
    raw.kind === 'extension' || raw.kind === 'composition_miss' ? raw.kind : 'new_component';
  let closest_match: PlanUnresolvedComponent['closest_match'] = null;
  if (raw.closest_match && typeof raw.closest_match === 'object' && 'name' in raw.closest_match) {
    const cm = raw.closest_match;
    closest_match = {
      name: cm.name,
      importStatement: typeof cm.importStatement === 'string' ? cm.importStatement : null,
      similarity_score: typeof cm.similarity_score === 'number' ? cm.similarity_score : 0,
      reasoning: typeof cm.reasoning === 'string' ? cm.reasoning : '',
    };
  } else if (typeof raw.closest_match === 'string' && raw.closest_match.trim()) {
    closest_match = {
      name: raw.closest_match.trim(),
      importStatement: null,
      similarity_score: 0,
      reasoning: '(legacy string closest_match — re-emit plan for full structure)',
    };
  }
  return {
    intent: raw.intent ?? '',
    reason: raw.reason ?? '',
    kind,
    closest_match,
  };
}

// Inject keyframes once
if (typeof document !== 'undefined' && !document.getElementById('aipanel-keyframes')) {
  const style = document.createElement('style');
  style.id = 'aipanel-keyframes';
  style.textContent = `@keyframes aipanel-dot { 0%,60%,100% { opacity: 0.3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-2px); } }`;
  document.head.appendChild(style);
}
