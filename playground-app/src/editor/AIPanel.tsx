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
  type TargetClient,
} from '../store/playground-store';
import {
  postChat,
  postIntake,
  type IntakeHistoryTurn,
  type IntakeResult,
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
import { usePinStore, type PinComment } from '../store/pin-store';
import type { BridgeElementContext } from '../services/playground-bridge';
import { JobCard } from './JobCard';

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
      setCurrent: s.setCurrent,
      iframeMode: s.mode,
      setIframeMode: s.setMode,
    })),
  );

  /** Sha the sandbox is actually sitting on now — either a time-travel
   *  checkout or HEAD when there is no checkout. Drives the "현재 이 시점"
   *  / "이 시점으로 돌아가기" split on ExecutionCard. */
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
        setError('Playground가 선택되지 않았습니다.');
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
      // history-aware 흐름에서 priorUser 가 "이대로" 같은 짧은 승인 텍스트일 수 있음.
      // override 가 명시적으로 지정됐으면 (빈 문자열 포함) 그걸 사용 — server 가
      // 의도적으로 비울 수 있음. 미지정 (undefined) 시에만 priorUser/summary 폴백.
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
        content: '샌드박스에서 실행 시작…',
        execution: {
          requestId: '',
          status: 'processing',
          phase: 'queued',
          phasesSeen: ['queued'],
        },
      });

      try {
        const ack = await postChangeRequest({
          userPrompt,
          pagePath,
          client: targetClient,
          requestContract: { change_intent: plan.meta.intent },
          planItems: enabledItems,
          visualConstraints: plan.meta.visualConstraints,
          playgroundId: sentPlaygroundId,
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
            ? `실행 요청 실패: ${err.message}`
            : err instanceof Error
              ? err.message
              : '실행 요청 실패';
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
        setError(err instanceof Error ? err.message : '시점 복원 실패');
      }
    },
    [playgroundId, setCurrent, setError],
  );

  const handleRestoreToSha = useCallback(
    async (sha: string, labelHint?: string) => {
      if (!playgroundId) return;
      const label = labelHint ?? `체크포인트 ${sha.slice(0, 7)}`;
      const ok = window.confirm(
        `"${label}" 로 되돌릴까요?\n\n이 체크포인트 이후의 변경은 Restore 커밋으로 되돌려집니다 (히스토리는 유지됩니다).`,
      );
      if (!ok) return;
      try {
        const pg = await restorePlaygroundToSha(playgroundId, sha);
        setCurrent(pg);
      } catch (err) {
        console.error('[AIPanel] restore-to-sha failed', err);
        setError(err instanceof Error ? err.message : 'Restore 실패');
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
    // Keeps follow-up planning terse ("바꿔줘" → actionable) instead of
    // triggering a "어느 페이지인가요?" clarification round-trip.
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
      // Phase 3 Task 3.1 sub-phase C 마무리 (2026-05-06) — history-aware intake
      // default ON. 우선순위:
      //   1. build-time `VITE_MOLLY_HISTORY_AWARE='0'` → 전체 강제 OFF (회귀 시 hot-fix)
      //   2. 사용자별 `localStorage.MOLLY_HISTORY_AWARE='0'` → opt-out (개별 폴백)
      //   3. 기본 ON
      // 1-2주 운영 후 legacy path (mollyClassifyAndDispatch + postChat) 삭제 예정.
      // 회귀 신고 backout: console 에서 `localStorage.setItem('MOLLY_HISTORY_AWARE','0')`.
      const buildEnvForceOff =
        import.meta.env.VITE_MOLLY_HISTORY_AWARE === '0';
      const userOptOut =
        typeof window !== 'undefined' &&
        window.localStorage?.getItem('MOLLY_HISTORY_AWARE') === '0';
      const historyAware = !buildEnvForceOff && !userOptOut;

      if (historyAware) {
        // 새 user msg 는 current 의 마지막. history 는 그 이전 turn 들.
        // sub-phase C 마무리 (2026-05-06) — assistant.kind 는 store 에
        // 기록된 m.kind 우선, 옛 메시지는 plan 유무로 폴백 추정.
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
        let result: IntakeResult;
        try {
          result = await postIntake({
            text: intakeText,
            surface: 'playground',
            history,
            client: playgroundClient ?? undefined,
            routeOrPage: currentRoute ?? undefined,
          });
        } catch (err) {
          if (!isStillActive()) return;
          const msg =
            err instanceof OrchestratorError
              ? err.status === 503
                ? 'AI 서비스 미설정 — ANTHROPIC_API_KEY 설정 후 orchestrator 재시작.'
                : `Intake 실패: ${err.message}`
              : err instanceof Error
                ? err.message
                : 'Intake 실패';
          console.error('[AIPanel] postIntake failed:', err);
          addAssistantMessage({ content: `⚠️ ${msg}` });
          setError(msg);
          return;
        }
        if (!isStillActive()) return;
        switch (result.kind) {
          case 'chat':
            addAssistantMessage({
              content: result.response ?? '(빈 응답)',
              kind: 'chat',
            });
            break;
          case 'status_query':
            addAssistantMessage({
              content: result.response ?? '(빈 응답)',
              kind: 'status_query',
            });
            break;
          case 'lifecycle_action':
            addAssistantMessage({
              content: result.response ?? '(빈 응답)',
              kind: 'lifecycle_action',
            });
            break;
          case 'code_change_ambiguous':
            addAssistantMessage({
              content: `🤔 ${result.clarifyingQuestion ?? '추가 정보를 알려주세요.'}`,
              kind: 'code_change_ambiguous',
              clarifyingQuestion: result.clarifyingQuestion,
            });
            break;
          case 'plan_emit':
            if (result.plan) {
              addAssistantMessage({
                content: result.plan.summary || '아래 계획으로 진행 가능합니다:',
                plan: rawToPlan(result.plan),
                kind: 'plan_emit',
              });
            } else {
              addAssistantMessage({ content: '계획이 준비됐어요.', kind: 'plan_emit' });
            }
            break;
          case 'job_dispatched': {
            // Sub-phase C 마무리 (2026-05-06) — 직전 plan_emit 메시지
            // 자동 lookup → executePlan 으로 잡 시작. archived /
            // planResolved=accepted 가드로 중복 dispatch 차단.
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
                  '⚠️ 승인된 계획을 찾지 못했어요. plan 카드의 승인 버튼을 사용해주세요.',
                kind: 'job_dispatched',
              });
              break;
            }
            updateMessage(planMsg.id, { planResolved: 'accepted' });
            addAssistantMessage({
              content: '✅ 계획 승인 — 잡을 시작합니다.',
              kind: 'job_dispatched',
            });
            // cumulativePrd 가 있으면 priorUser ("이대로") 대신 사용 —
            // clarification 거친 경우 누적 PRD 가 정답.
            void executePlan(planMsg, { userPromptOverride: result.cumulativePrd });
            break;
          }
          case 'code_change_clear':
            // 첫 턴에 plan_emit 으로 묶이지 않은 fallback 케이스 (서버
            // emitPlan 실패 등). plan 카드 없으니 사용자에게 그렇게 안내.
            addAssistantMessage({
              content:
                'PRD 가 명확합니다. 다만 지금은 plan 카드를 만들 수 없어요. 잠시 후 다시 같은 요청을 보내주세요 (또는 좀 더 구체적으로 적어주시면 plan 이 바로 떠요).',
              kind: 'code_change_clear',
            });
            break;
        }
        return;
      }

      // LEGACY path (default) — mollyClassifyAndDispatch + postChat.
      // molly 분류 게이트 — 매 turn 거침. 사용자가 mid-Wizard 에 status
      // 질의 / chat 던질 수 있어야 함 ("지금 서버상태 어때?" 같은). 단점:
      // Wizard 의 clarifying 답변 ("TVING") 이 chat 으로 misclassify 가능.
      // 그 trade-off 는 phase 2 (/api/intake 통합) 에서 진정 해결.
      const dispatch = await mollyClassifyAndDispatch(trimmed, true);
      if (dispatch && (dispatch.kind === 'chat' || dispatch.kind === 'status_query')) {
        if (!isStillActive()) return;
        addAssistantMessage({ content: dispatch.response ?? '(빈 응답)' });
        return;
      }

      const reply = await postChat(apiMessages);
      if (!isStillActive()) return;
      if (reply.type === 'question') {
        addAssistantMessage({ content: reply.content });
      } else {
        addAssistantMessage({
          content: reply.content || '아래 계획으로 진행 가능합니다:',
          plan: rawToPlan(reply.plan),
        });
      }
    } catch (err) {
      if (!isStillActive()) return;
      const msg =
        err instanceof OrchestratorError
          ? err.status === 503
            ? 'AI 서비스 미설정 — ANTHROPIC_API_KEY 설정 후 orchestrator 재시작.'
            : `AI 응답 실패: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'AI 응답 실패';
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
          ? '요소 선택 모드 끄기'
          : '요소 선택 — 화면 위 요소를 클릭해서 컨텍스트 첨부',
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
        title: 'PRD 첨부 — 텍스트 / Google Docs / Jira 링크로 job 시작',
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
              title="이 플레이그라운드의 변경 히스토리를 봅니다"
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
              📜 히스토리
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
              title="새 대화"
              aria-label="새 대화"
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
              // clicked 보기) or a restored sha (user clicked Restore
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
              messages.forEach((m, idx) => {
                if (m.archived) {
                  archivedRun.push(m);
                  return;
                }
                flushArchived();
                out.push(
                  <MessageRow
                    key={m.id}
                    message={m}
                    activeSha={activeSha}
                    onChoice={handleChoice}
                    isSending={isSending}
                    checkpointNumber={checkpointByMessageId[m.id]}
                    dimmed={dimFromIdx >= 0 && idx > dimFromIdx}
                    onTogglePlanItem={(itemId) => togglePlanItem(m.id, itemId)}
                    onAcceptPlan={() => {
                      resolvePlan(m.id, 'accepted');
                      void executePlan(m);
                    }}
                    onRejectPlan={() => resolvePlan(m.id, 'rejected')}
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
                ? '무엇을 만들고 싶으세요? (예: TVING nav에 Moloco Ads 섹션 추가)'
                : '메시지 보내기...'
            }
            onChange={setInput}
            onSubmit={handleSend}
            canSubmit={canSubmit}
            disabled={isSending || !playgroundId}
            toolbarButtons={toolbarButtons}
            hint="Enter 전송 · Shift+Enter 줄바꿈"
            sendLabel={isSending ? '⋯' : '전송'}
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
                      과거 시점 미리보기 중 — 새 요청은{' '}
                      <strong style={{ color: 'var(--text-primary)' }}>
                        작업중
                      </strong>{' '}
                      탭에서 가능합니다
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
        <CommentsList playgroundId={playgroundId} headCommitSha={headCommitSha} />
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
              content: 'PRD 를 받았어요. 작업을 나눠서 진행할게요.',
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
          PRD 로 job 시작
        </h2>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
          큰 요구사항을 붙여 넣으면 AI 가 작은 태스크로 쪼갭니다. 각 태스크는
          샌드박스에서 순차 실행되고, 커밋 diff 는 LLM 이 검토합니다.
        </p>
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border-primary)' }}>
          {([
            ['text', '텍스트'],
            ['gdoc', 'Google Docs'],
            ['jira', 'Jira 티켓'],
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
            placeholder="PRD 전문을 붙여넣으세요..."
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
              v0은 링크를 자동으로 열지 못합니다 (Google/Atlassian OAuth 미지원). URL
              과 아래 메모만 AI 에 전달됩니다. 필요하면 문서 내용을 복붙해서 메모에
              넣어주세요.
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="선택: 문서 요약이나 핵심 발췌"
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
            취소
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
            {submitting ? '생성 중…' : '시작'}
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
  return `[선택된 요소: ${name}${suffix}]`;
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
    '선택된 요소';
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
          aria-label="선택 해제"
          title="선택 해제"
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
}: {
  playgroundId: string | null;
  headCommitSha: string | null;
}) {
  const allPins = usePinStore((s) => s.pins);
  const deletePin = usePinStore((s) => s.deletePin);
  const toggleResolved = usePinStore((s) => s.toggleResolved);
  const updatePinText = usePinStore((s) => s.updatePinText);
  const addReply = usePinStore((s) => s.addReply);
  const updateReplyText = usePinStore((s) => s.updateReplyText);
  const deleteReply = usePinStore((s) => s.deleteReply);

  const pins = useMemo(
    () => allPins.filter((p) => p.playgroundId === playgroundId),
    [allPins, playgroundId],
  );

  if (!playgroundId) {
    return (
      <div style={commentsEmptyStyle}>Playground가 선택되지 않았습니다.</div>
    );
  }

  if (pins.length === 0) {
    return (
      <div style={commentsEmptyStyle}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          아직 댓글이 없습니다.
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 6, lineHeight: 1.5 }}>
          우측 iframe에서 <strong style={{ color: 'var(--text-primary)' }}>📍 Pin</strong> 모드로 전환 후
          원하는 위치를 클릭해 댓글을 남겨보세요.
          <br />
          컴포넌트 단위 타겟팅은 M3 Vite 플러그인 picker에서 연결될 예정입니다.
        </div>
      </div>
    );
  }

  return (
    <div className="ui-scroll" style={commentsListStyle}>
      {pins.map((pin, idx) => (
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
        />
      ))}
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
      style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--border-secondary)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        opacity: resolved ? 0.6 : 1,
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
          placeholder="메모"
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
          onClick={() => setIsEditingBody(true)}
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
          {pin.text || '메모 추가…'}
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
            💬 댓글{replyCount > 0 ? ` ${replyCount}` : ''}
          </button>
        )}
        <button
          type="button"
          onClick={onToggleResolved}
          style={linkButtonStyle}
        >
          {resolved ? '↺ 다시 열기' : '✓ 해결'}
        </button>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          onClick={onDelete}
          style={{ ...linkButtonStyle, color: 'var(--error)' }}
        >
          삭제
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
          title="댓글 삭제"
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
        placeholder="댓글 입력…"
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
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
          취소
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
          전송
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
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return new Date(ts).toLocaleDateString();
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
          보관된 이전 작업 · {messages.length}개 메시지
        </span>
        {durationMs > 0 && (
          <span>({formatDurationLabel(durationMs)})</span>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 10 }}>{open ? '▾ 접기' : '▸ 펼치기'}</span>
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
              title="보관된 이전 작업 — 현재 작업 트리에는 반영되지 않음"
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
  if (mins < 1) return '<1분';
  if (mins < 60) return `${mins}분`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins ? `${hours}시간 ${remMins}분` : `${hours}시간`;
}

function EmptyState() {
  const suggestions = [
    'TVING Ad System nav에 Moloco Ads 섹션 추가',
    '경매형 주문 페이지에 대량 상태 변경 기능 추가',
    '광고 소재 리뷰 페이지 컬럼 정리',
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
          무엇을 만들어 볼까요?
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
          Jira 티켓·PRD 링크를 붙이거나, 바꾸고 싶은 것을 자연어로 설명해 주세요.
          <br />
          AI가 DS 패턴 기반으로 계획을 세워드립니다.
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
          예시
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
  onCheckoutCommit,
  onRestoreToSha,
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
  onCheckoutCommit: (sha: string) => void;
  onRestoreToSha: (sha: string, labelHint?: string) => void;
}) {
  const isUser = message.role === 'user';
  const parsed = useMemo(
    () => (message.content && !isUser ? parseAssistantContent(message.content) : null),
    [message.content, isUser],
  );

  // When an ExecutionCard is attached the placeholder content
  // ("샌드박스에서 실행 시작…") becomes stale the moment the run
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
      title={dimmed ? '과거 시점으로 돌아간 뒤에 생성된 항목 — 현재 작업 트리에는 없음' : undefined}
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
        />
      )}

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
    '선택된 요소';
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
              옵션 선택
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
}: {
  plan: { meta: PlanMeta; items: PlanItem[] };
  resolved?: 'accepted' | 'rejected';
  onToggleItem: (id: string) => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  const enabledCount = useMemo(
    () => plan.items.filter((i) => i.enabled).length,
    [plan.items],
  );
  const dim = resolved === 'rejected';

  return (
    <Card tone={resolved === 'accepted' ? 'accent' : 'default'} style={{ opacity: dim ? 0.5 : 1 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <Chip label={plan.meta.intent} color="accent" />
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
        계획 ({enabledCount}/{plan.items.length})
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
            {/* flex 자식은 minWidth:0 가 없으면 콘텐츠 폭으로 커져 부모를 밀어냄.
                긴 파일 경로가 description / title 에 inline 으로 들어가는 경우
                좌측 클리핑 발생 → minWidth:0 으로 자연스럽게 wrap. */}
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
              {item.targetFile && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text-secondary)',
                    marginTop: 4,
                    fontFamily:
                      'ui-monospace, SFMono-Regular, "Menlo", monospace',
                    background: 'var(--bg-secondary)',
                    padding: '3px 6px',
                    borderRadius: 4,
                    // 파일 경로 줄바꿈 정책:
                    // - 가능한 한 `/` 경계에서 줄바꿈 (wbr 삽입)
                    // - 단일 segment 가 컨테이너 폭 초과 시에만 단어 중간 끊기
                    //   (overflow-wrap:anywhere). 둘 다 폭 초과 누락 안 됨.
                    overflowWrap: 'anywhere',
                    wordBreak: 'normal',
                    lineHeight: 1.4,
                  }}
                  title={item.targetFile}
                >
                  📄{' '}
                  {item.targetFile.split('/').map((segment, i, arr) => (
                    <span key={i}>
                      {segment}
                      {i < arr.length - 1 && (
                        <>
                          /<wbr />
                        </>
                      )}
                    </span>
                  ))}
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
            거부
          </button>
          <button
            onClick={onAccept}
            disabled={enabledCount === 0}
            style={{
              padding: '6px 14px',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              background: enabledCount === 0 ? 'var(--bg-tertiary)' : 'var(--approve-bg)',
              color: enabledCount === 0 ? 'var(--text-tertiary)' : '#fff',
              cursor: enabledCount === 0 ? 'not-allowed' : 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            실행하기 →
          </button>
        </div>
      ) : (
        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: resolved === 'accepted' ? 'var(--success)' : 'var(--text-tertiary)',
            fontWeight: 500,
          }}
        >
          {resolved === 'accepted' ? '✓ 승인됨' : '✕ 거부됨'}
        </div>
      )}
    </Card>
  );
}

const PHASE_LABELS: Record<string, string> = {
  queued: '대기',
  starting_agent: '에이전트 시작',
  syncing_source: '소스 동기화',
  running_agent: 'AI 실행',
  collecting_diff: '변경 수집',
  capturing_screenshot: '스크린샷 캡처',
  applying_local_patch: '패치 적용',
  verifying: '타입 검증 중',
  verification_retry: '재시도 중 (검증 실패)',
  verification_failed: '검증 실패',
  preview_ready: '완료',
  no_change_needed: '변경 불필요',
  pipeline_error: '파이프라인 오류',
  error: '오류',
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
    ? '실행 실패'
    : done
      ? '실행 완료'
      : execution.phase
        ? (PHASE_LABELS[execution.phase] ?? execution.phase)
        : '대기';

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
            ? ` · ${execution.changedFiles.length}개 파일`
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
                  diff 보기 →
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
              ? `체크포인트 ${checkpointNumber}`
              : 'Checkpoint'}
          </span>
          <code style={checkpointShaStyle}>
            {execution.commitSha.slice(0, 7)}
          </code>
          <div style={{ flex: 1 }} />
          {isRestoreAnchor ? (
            // Once restored, collapse the action row into a single
            // green "Restored" indicator — showing 보기 / Restore
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
              title="이 체크포인트로 복원된 상태 — 이후 메시지는 현재 작업 트리에 반영되지 않습니다."
            >
              ↺ Restored
            </span>
          ) : (
            <>
              {isCurrent ? (
                <span style={checkpointCurrentBadgeStyle}>작업중</span>
              ) : canRewind ? (
                <button
                  type="button"
                  onClick={() => onCheckoutCommit(execution.commitSha!)}
                  style={checkpointGhostButtonStyle}
                  title="이 체크포인트를 미리 봅니다 (복원 아님)"
                >
                  보기
                </button>
              ) : null}
              {execution.requestId && (
                <a
                  href={`http://127.0.0.1:4174/requests/${execution.requestId}`}
                  target="_blank"
                  rel="noreferrer"
                  style={checkpointGhostLinkStyle}
                  title="대시보드에서 이 요청의 변경 내역 상세"
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
                        ? `체크포인트 ${checkpointNumber}`
                        : undefined,
                    )
                  }
                  style={checkpointRestoreButtonStyle}
                  title="이 체크포인트 이후의 변경을 되돌립니다 (히스토리는 유지됨)"
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
        aria-label="완료"
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
        aria-label="진행 중"
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
        aria-label="실패"
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
      aria-label="대기"
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

// Phase-based progress messages — UX 피드백 (2026-04-30): 입력이
// PRD/chat/status 무엇인지 클라가 모르므로 일반적 wording.
//   0s    "molly 가 살펴보고 있어요"     classifier (모든 입력 거침)
//   2s    "맥락 분석 중..."              chat/status/analyzer (~3-10s)
//   8s    "응답 정리 중... (10-20초)"    plan emit OR 긴 응답 단계
//   20s   "조금만 더 기다려 주세요..."   timeout 가까워졌을 때
const TYPING_PHASES = [
  { atMs: 0, label: 'molly 가 살펴보고 있어요' },
  { atMs: 2000, label: '맥락 분석 중...' },
  { atMs: 8000, label: '응답 정리 중... (10-20초)' },
  { atMs: 20000, label: '조금만 더 기다려 주세요...' },
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

// ── Helpers ────────────────────────────────────────────

function rawToPlan(raw: RawPlan): { meta: PlanMeta; items: PlanItem[] } {
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
  };
}

// Inject keyframes once
if (typeof document !== 'undefined' && !document.getElementById('aipanel-keyframes')) {
  const style = document.createElement('style');
  style.id = 'aipanel-keyframes';
  style.textContent = `@keyframes aipanel-dot { 0%,60%,100% { opacity: 0.3; transform: translateY(0); } 30% { opacity: 1; transform: translateY(-2px); } }`;
  document.head.appendChild(style);
}
