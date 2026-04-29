# Chrome ext Phase 2 Step 3+4 — Slack lifecycle parity

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sidepanel(`chrome-extension/sidepanel.js`) 의 Job pipeline에 Slack/Playground 와 동일한 lifecycle UI를 추가한다 — 리뷰 실패 task의 [재시도/그대로 통과/건너뛰기] 버튼 + QA 단계의 [QA 통과/자동 QA 재실행] + 완료 단계의 [Promote/Playground 보기].

**Architecture:** 폴링 기반 (`startHttpJobPolling`)에 per-task 상태 머신과 job-level state 트랜지션 머신을 얹는다. 둘 다 dedupe 가드(`announcedTaskState`, `announcedJobStates`)로 중복 메시지를 막는 Slack의 패턴(`orchestrator/lib/molly.js#pollJobUntilDoneInner`)을 그대로 미러링한다. 새 메시지는 별도 `msg-system` 카드(per-task 메시지) 또는 새 `qa-card`/`promote-card` 카드로 sidepanel chat에 append. 서버 측 엔드포인트는 이미 전부 존재하므로 클라이언트 only 변경.

**Tech Stack:** Vanilla JS (chrome-extension/sidepanel.js, sidepanel.css). DOM 직접 조작. `fetch` 로 orchestrator 통신.

---

## File Structure

- **Modify:** `chrome-extension/sidepanel.js` — 폴링 루프 확장 + 3종 신규 메시지 렌더러
  - `startHttpJobPolling`: TERMINAL 정의를 `complete`/`cancelled` 만에서 → "사용자 인터랙션이 끝났을 때" 로 정정. `qa`/`complete` 에서 폴링을 계속 돌리고, 매 폴 마다 task 상태 변화와 job-level 트랜지션을 검사
  - `addTaskTransitionMessage(task, idx, total, jobId)`: per-task 메시지 카드. Slack의 `taskTransitionPayload` 미러. 실패 시 [재시도/그대로 통과/건너뛰기] 버튼 노출
  - `updateTaskTransitionMessage(taskId, ...)`: 기존 카드를 in-place 업데이트 (Slack의 `chat.update` 미러)
  - `addQaCompletionMessage(job)`: status=qa 진입 시 1회. QA 결과 + [QA 통과] (+ 실패 시 [자동 QA 재실행])
  - `addCompletePromoteMessage(job)`: status=complete 진입 시 1회. [Promote (PR 생성)] [Playground 보기]
  - `lockButtons` 헬퍼는 plan card의 패턴 재사용
- **Modify:** `chrome-extension/sidepanel.css` — 신규 카드 스타일 (`.qa-card`, `.promote-card`, `.task-transition-card`) — 기존 `.plan-card` / `.plan-btn` 토큰 재사용
- **No server-side change** — 모든 엔드포인트(`/api/job/:id/retry-task` 외)는 이미 존재

---

## 사전 검증 (실행 전)

- [ ] **Step 0a: 서비스 가동 확인**

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3847/api/playground
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4180/
```

Expected: 둘 다 `200`

- [ ] **Step 0b: 엔드포인트 sanity check**

```bash
# 활성 잡 하나 잡아서 그 jobId로 GET 동작 확인
JID=$(curl -s http://localhost:3847/api/jobs | head -c 2000 | grep -oE '"id":"[a-z0-9]+"' | head -1 | cut -d'"' -f4)
echo "test jobId=$JID"
curl -s "http://localhost:3847/api/job/$JID" | head -c 200
```

Expected: `{"job":{"id":"...", "status":"...", "tasks":[...]}}`

---

## Task 1: Per-task 트랜지션 메시지 (Step 3)

**Files:**
- Modify: `chrome-extension/sidepanel.js` (`startHttpJobPolling` 의 poll 함수 + 신규 헬퍼들)
- Modify: `chrome-extension/sidepanel.css` (신규 `.task-transition-card`, `.task-fail-actions` 스타일)

리뷰 실패한 task에 [재시도/그대로 통과/건너뛰기] 버튼을 inline 으로 노출. 통과한 task는 ✅ 한 줄로. 모든 트랜지션은 동일한 카드를 in-place 업데이트.

### Step 1.1: 폴링 루프에 task transition 디텍션 추가

- [ ] **`startHttpJobPolling` 의 `poll` 함수 안 (현재 line ~2142)에 `announcedTaskState` Map 도입 + DOM sniff 가드**

사이드패널 reload 시 같은 jobId 폴링이 재진입할 수 있음. 그때 chat 에 이미 들어가 있는 카드를 다시 만들지 않도록 `announcedJobStates` / `announcedTaskState` 를 DOM 에서 sniff 해서 prefill. `TERMINAL` 정의는 `cancelled` + `complete` 둘 다 유지 — Slack 의 `pollJobUntilDoneInner` 도 `complete` announce 후 즉시 return (molly.js:1424). Promote 클릭은 사용자 직접 fetch 라 폴링 재진입 불필요.

기존 함수 시작부에 클로저 변수 추가:
```js
function startHttpJobPolling(jobId) {
  // Reset the legacy currentRequestId so older flows don't race.
  currentRequestId = null;
  const startedAt = Date.now();
  const POLL_MS = 3000;
  const TIMEOUT_MS = 30 * 60 * 1000;
  // 'complete' 는 announce 후 즉시 finishLoop — Promote 클릭은 user
  // 가 직접 fetch 호출이라 polling 이 더 봐줄 필요 없음. (Slack 의
  // pollJobUntilDoneInner 와 동일 정책: molly.js:1424 의 return.)
  const TERMINAL = new Set(['complete', 'cancelled']);
  let planCardShown = false;
  /** @type {Map<string, string>} taskId → last announced status */
  const announcedTaskState = new Map();
  /** @type {Set<string>} job-level state announcements (qa-landed, completed, paused) */
  const announcedJobStates = new Set();

  // Reload sniff: sidepanel 새로고침 후 같은 jobId 가 다시 폴링될 때
  // chat 에 이미 들어가 있는 카드를 다시 만들지 않게 dedupe Set 을 prefill.
  if (messagesEl.querySelector(`.msg-system[data-qa-card-job-id="${CSS.escape(jobId)}"]`)) {
    announcedJobStates.add('qa-landed');
  }
  if (messagesEl.querySelector(`.msg-system[data-promote-card-job-id="${CSS.escape(jobId)}"]`)) {
    announcedJobStates.add('completed');
  }
  if (messagesEl.querySelector(`.msg-system[data-paused-card-job-id="${CSS.escape(jobId)}"]`)) {
    announcedJobStates.add('paused');
  }
  messagesEl
    .querySelectorAll(`.msg-system[data-task-transition-id]`)
    .forEach((el) => {
      const tid = el.dataset.taskTransitionId;
      const status = el.dataset.taskTransitionStatus;
      if (tid && status) announcedTaskState.set(tid, status);
    });
```

- [ ] **poll 함수의 task 루프 추가 (현재 `addPlanApprovalCard` 호출 직후)**

`if (job && job.status === 'planning' && !planCardShown)` 블록 직후, terminal 체크 전에 추가:

```js
      // Per-task transitions — Slack 의 pollJobUntilDoneInner 미러.
      // 통과/실패/건너뜀이 발생할 때마다 chat 에 카드를 띄우고, 같은
      // task의 후속 트랜지션은 in-place 업데이트.
      const ANNOUNCEABLE = new Set(['running', 'committed', 'reviewed', 'failed', 'skipped']);
      if (job && Array.isArray(job.tasks)) {
        for (let i = 0; i < job.tasks.length; i++) {
          const t = job.tasks[i];
          if (!t?.id) continue;
          if (!ANNOUNCEABLE.has(t.status)) continue;
          if (announcedTaskState.get(t.id) === t.status) continue;
          const existed = announcedTaskState.has(t.id);
          if (existed) {
            updateTaskTransitionMessage(t, i, job.tasks.length, jobId);
          } else {
            addTaskTransitionMessage(t, i, job.tasks.length, jobId);
          }
          announcedTaskState.set(t.id, t.status);
        }
      }

      // Paused state — Slack 의 paused 처리 미러 (molly.js:1373-1398).
      // pausedReason 을 surface 하고 dedupe. 재개되면 set 에서 제거해
      // 다음에 paused 진입 시 다시 announce.
      if (job && job.status === 'paused' && !announcedJobStates.has('paused')) {
        announcedJobStates.add('paused');
        addPausedMessage(job);
      }
      if (job && job.status !== 'paused' && announcedJobStates.has('paused')) {
        announcedJobStates.delete('paused');
      }
```

### Step 1.2: `addTaskTransitionMessage` 렌더러

- [ ] **`addPlanApprovalCard` 함수 직후에 새 함수 추가**

```js
  /**
   * Phase 2 Step 3: per-task transition card. Slack의 taskTransitionPayload
   * 미러. 같은 task의 후속 트랜지션은 updateTaskTransitionMessage 가
   * 같은 카드를 in-place 업데이트.
   */
  function addTaskTransitionMessage(task, idx, total, jobId) {
    const wrap = document.createElement('div');
    wrap.className = 'msg msg-system';
    wrap.dataset.taskTransitionId = task.id;
    wrap.dataset.taskTransitionStatus = task.status;

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble task-transition-card';
    renderTaskTransitionBody(bubble, task, idx, total, jobId);

    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function updateTaskTransitionMessage(task, idx, total, jobId) {
    const wrapSel = `.msg-system[data-task-transition-id="${CSS.escape(task.id)}"]`;
    const wrap = messagesEl.querySelector(wrapSel);
    if (!wrap) {
      addTaskTransitionMessage(task, idx, total, jobId);
      return;
    }
    wrap.dataset.taskTransitionStatus = task.status;
    const bubble = wrap.querySelector('.task-transition-card');
    if (!bubble) {
      addTaskTransitionMessage(task, idx, total, jobId);
      return;
    }
    bubble.innerHTML = '';
    renderTaskTransitionBody(bubble, task, idx, total, jobId);
  }

  /**
   * Phase 2 Step 3 (paused): job.status=paused 진입 시 1회. Slack 의
   * paused 처리 미러. 재개되면 announcedJobStates 에서 'paused' 가
   * 빠지므로 다음에 다시 paused 되면 또 한 번 카드 노출.
   */
  function addPausedMessage(job) {
    const wrap = document.createElement('div');
    wrap.className = 'msg msg-system';
    wrap.dataset.pausedCardJobId = job.id;
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble task-transition-card';
    const line = document.createElement('div');
    line.className = 'task-transition-line';
    line.textContent = `⏸️ 작업 일시정지: ${job.pausedReason || '(원인 없음)'}`;
    bubble.appendChild(line);
    const hint = document.createElement('div');
    hint.className = 'task-transition-stamp';
    hint.textContent = 'Playground 또는 Inspect Console 에서 확인 후 resume / cancel 가능합니다.';
    bubble.appendChild(hint);
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function renderTaskTransitionBody(bubble, task, idx, total, jobId) {
    const num = `${idx + 1}/${total}`;
    const title = task.title || '(no title)';
    const line = document.createElement('div');
    line.className = 'task-transition-line';
    switch (task.status) {
      case 'running':
        line.textContent = `🔧 ${num} ${title} — 작업 중…`;
        break;
      case 'committed':
        line.textContent = `🔍 ${num} ${title} — 검토 중…`;
        break;
      case 'reviewed':
        line.textContent = `✅ ${num} ${title} — 통과`;
        break;
      case 'skipped':
        line.textContent = `⏭ ${num} ${title} — 건너뜀`;
        break;
      case 'failed': {
        line.textContent = `❌ ${num} ${title} — 검토 실패`;
        const notesEl = document.createElement('div');
        notesEl.className = 'task-transition-notes';
        notesEl.textContent = task.review?.notes?.slice(0, 240) || '(원인 없음)';
        bubble.appendChild(line);
        bubble.appendChild(notesEl);
        appendTaskFailActions(bubble, task, jobId);
        return;
      }
      default:
        line.textContent = `${task.status} ${num} ${title}`;
    }
    bubble.appendChild(line);
  }

  function appendTaskFailActions(bubble, task, jobId) {
    const actions = document.createElement('div');
    actions.className = 'task-fail-actions';

    const retryBtn = document.createElement('button');
    retryBtn.type = 'button';
    retryBtn.textContent = '🔁 재시도';
    retryBtn.className = 'plan-btn plan-btn-primary';

    const acceptBtn = document.createElement('button');
    acceptBtn.type = 'button';
    acceptBtn.textContent = '✅ 그대로 통과';
    acceptBtn.className = 'plan-btn';

    const skipBtn = document.createElement('button');
    skipBtn.type = 'button';
    skipBtn.textContent = '⏭ 건너뛰기';
    skipBtn.className = 'plan-btn plan-btn-danger';

    let pendingStamp = null;
    const lock = (note) => {
      retryBtn.disabled = true;
      acceptBtn.disabled = true;
      skipBtn.disabled = true;
      pendingStamp = document.createElement('div');
      pendingStamp.className = 'task-transition-stamp';
      pendingStamp.textContent = note;
      bubble.appendChild(pendingStamp);
    };
    const unlockOnError = () => {
      retryBtn.disabled = false;
      acceptBtn.disabled = false;
      skipBtn.disabled = false;
      if (pendingStamp && pendingStamp.parentNode) {
        pendingStamp.parentNode.removeChild(pendingStamp);
      }
      pendingStamp = null;
    };

    const post = async (path, label) => {
      lock(`${label} 처리 중…`);
      try {
        const baseUrl = await getServerUrl();
        const res = await fetch(
          `${baseUrl}/api/job/${encodeURIComponent(jobId)}/${path}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ taskId: task.id }),
          },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          addSystemMessage(`${label} 실패: ${res.status} ${text.slice(0, 120)}`, 'error');
          unlockOnError();
        }
        // 성공 시 unlock 안 함 — 폴링이 새 status 로 카드를 in-place
        // update 하면서 stamp 가 통째로 갈리니 그대로 두면 됨.
      } catch (err) {
        addSystemMessage(`${label} 실패: ${err.message}`, 'error');
        unlockOnError();
      }
    };

    retryBtn.addEventListener('click', () => void post('retry-task', '🔁 재시도'));
    acceptBtn.addEventListener('click', () => void post('accept-task', '✅ 그대로 통과'));
    skipBtn.addEventListener('click', () => void post('skip-task', '⏭ 건너뛰기'));

    actions.appendChild(retryBtn);
    actions.appendChild(acceptBtn);
    actions.appendChild(skipBtn);
    bubble.appendChild(actions);
  }
```

### Step 1.3: CSS 추가 (`chrome-extension/sidepanel.css` 뒷부분에 append)

- [ ] **새 스타일 블록 append**

```css
/* Phase 2 Step 3+4 lifecycle cards */
.task-transition-card,
.qa-card,
.promote-card {
  font-size: 12px;
  line-height: 1.5;
}
.task-transition-card .task-transition-line {
  font-weight: 500;
}
.task-transition-card .task-transition-notes {
  margin-top: 4px;
  padding: 6px 8px;
  background: rgba(218, 30, 40, 0.06);
  border: 1px solid rgba(218, 30, 40, 0.18);
  border-radius: 4px;
  font-size: 11px;
  color: var(--error, #da1e28);
  font-style: italic;
}
.task-fail-actions,
.qa-card .qa-actions,
.promote-card .promote-actions {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}
.task-transition-stamp {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-tertiary);
}
.qa-card .qa-summary,
.promote-card .promote-summary {
  margin-bottom: 8px;
  white-space: pre-wrap;
}
.qa-card .qa-result-pass {
  color: var(--success, #24a148);
}
.qa-card .qa-result-fail {
  color: var(--error, #da1e28);
}
```

### Step 1.4: 매뉴얼 검증

- [ ] **Reload 확장 + chrome ext 사이드패널 열기 + 새 잡 던지기**

수동 검증 절차 (자동 테스트 없음):
1. Chrome 의 `chrome://extensions/` 에서 "Moloco Inspect" 새로고침 (코드 reload)
2. Inspect Console 로 가서 새 playground 띄우거나 기존 활성 playground 선택
3. 사이드패널에 PRD 류 요청 입력 (예: "사이드바에 BETA 라벨 추가")
4. 계획 승인 → 작업이 진행되며 task 1 (running → committed → reviewed) 한 줄에서 evolve 하는지 확인
5. **negative path**: PRD 의 일부를 일부러 잘못 작성해서 reviewer fail 유도. 실패 메시지에 [🔁 재시도] [✅ 그대로 통과] [⏭ 건너뛰기] 버튼이 붙는지 확인
6. ✅ 그대로 통과 클릭 → 같은 카드가 ✅ reviewed 로 in-place 업데이트되는지 확인

기대: 위 순서대로 사이드패널 chat 에 한 줄씩 카드 stream.

- [ ] **Step 1.5: Commit**

```bash
git add chrome-extension/sidepanel.js chrome-extension/sidepanel.css
git commit -m "$(cat <<'EOF'
feat(chrome-ext): Phase 2 Step 3 — per-task transition cards + fail actions

Sidepanel polling now mirrors Slack의 pollJobUntilDoneInner:
- ANNOUNCEABLE 상태(running/committed/reviewed/failed/skipped)에 카드 1개씩.
- 동일 task 후속 트랜지션은 in-place 업데이트(announcedTaskState dedupe).
- failed task 카드에 [🔁 재시도] [✅ 그대로 통과] [⏭ 건너뛰기] inline 버튼.
- 버튼은 /api/job/:id/{retry-task,accept-task,skip-task} 호출 후 stamp.
- 서버 에러 시 unlockOnError 로 버튼 복구 (영구 잠금 방지).
- paused 상태도 surface (Slack 미러). 재개 시 dedupe set 에서 제거.
- 사이드패널 reload 시 DOM sniff 로 dedupe 가드 prefill.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: QA 결과 + [QA 통과] / [자동 QA 재실행] 메시지 (Step 4 — 1/2)

**Files:**
- Modify: `chrome-extension/sidepanel.js`

job.status 가 `qa` 로 진입할 때 1회 메시지 + 버튼.

### Step 2.1: 폴링 루프에 qa-landed 디텍션 + rerun 결과 업데이트

- [ ] **task 트랜지션/paused 블록 직후, terminal 체크 전에 추가**

```js
      if (job && job.status === 'qa') {
        if (!announcedJobStates.has('qa-landed')) {
          announcedJobStates.add('qa-landed');
          addQaCompletionMessage(job);
        } else {
          // 이미 카드는 떠 있음. rerun 후 qaAutoResult 가 placeholder
          // ('재실행 중…') → 실 결과로 교체될 때 카드를 in-place update.
          updateQaCompletionMessage(job);
        }
      }
```

### Step 2.2: `addQaCompletionMessage` 렌더러

- [ ] **`addTaskTransitionMessage` 함수 묶음 직후에 추가**

```js
  /**
   * Phase 2 Step 4 (1/2): job.status=qa 진입 시 1회. QA 결과 요약 +
   * [QA 통과] (+ 실패 시 [자동 QA 재실행]) 버튼.
   */
  function addQaCompletionMessage(job) {
    const wrap = document.createElement('div');
    wrap.className = 'msg msg-system';
    wrap.dataset.qaCardJobId = job.id;
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble qa-card';
    renderQaCompletionBody(bubble, job);
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function updateQaCompletionMessage(job) {
    const sel = `.msg-system[data-qa-card-job-id="${CSS.escape(job.id)}"] .qa-card`;
    const bubble = messagesEl.querySelector(sel);
    if (!bubble) {
      addQaCompletionMessage(job);
      return;
    }
    bubble.innerHTML = '';
    renderQaCompletionBody(bubble, job);
  }

  function renderQaCompletionBody(bubble, job) {
    const reviewedCount = (job.tasks || []).filter((t) => t.status === 'reviewed').length;
    const skippedCount = (job.tasks || []).filter((t) => t.status === 'skipped').length;
    const total = (job.tasks || []).length;
    const qaResult = job.qaAutoResult;
    const qaPassed = qaResult?.passed === true;
    const isRerunning = qaResult?.notes === '재실행 중…';

    const summary = document.createElement('div');
    summary.className = 'qa-summary';
    const lines = [];
    lines.push(`🎉 작업 완료! (job: ${job.id?.slice(0, 8) ?? '?'})`);
    lines.push(
      `• 완료 task: ${reviewedCount}/${total}` +
        (skippedCount > 0 ? ` (스킵 ${skippedCount})` : ''),
    );
    if (isRerunning) {
      lines.push(`• 자동 QA: 🔁 재실행 중…`);
    } else if (qaResult) {
      const verdictClass = qaPassed ? 'qa-result-pass' : 'qa-result-fail';
      lines.push(
        `• 자동 QA: ${qaPassed ? '✅ 통과' : '⚠️ 실패'} — ${(qaResult.notes || '').slice(0, 120)}`,
      );
      summary.classList.add(verdictClass);
    } else if (job.qaStrategy) {
      lines.push(`• 자동 QA: ${job.qaStrategy} (실행 대기 중)`);
    }
    if (job.targetRoute) lines.push(`• 결과 페이지: ${job.targetRoute}`);
    summary.textContent = lines.join('\n');
    bubble.appendChild(summary);

    const hint = document.createElement('div');
    hint.className = 'task-transition-stamp';
    hint.textContent = '✅ QA 통과 를 누르면 작업이 complete 으로 넘어가고 Promote 버튼이 보입니다.';
    bubble.appendChild(hint);

    const actions = document.createElement('div');
    actions.className = 'qa-actions';

    const passBtn = document.createElement('button');
    passBtn.type = 'button';
    passBtn.textContent = '✅ QA 통과';
    passBtn.className = 'plan-btn plan-btn-primary';

    const showRerun = qaResult && !qaPassed && !isRerunning;
    const rerunBtn = showRerun ? document.createElement('button') : null;
    if (rerunBtn) {
      rerunBtn.type = 'button';
      rerunBtn.textContent = '🔁 자동 QA 재실행';
      rerunBtn.className = 'plan-btn';
    }

    let pendingStamp = null;
    const lock = (note) => {
      passBtn.disabled = true;
      if (rerunBtn) rerunBtn.disabled = true;
      pendingStamp = document.createElement('div');
      pendingStamp.className = 'task-transition-stamp';
      pendingStamp.textContent = note;
      bubble.appendChild(pendingStamp);
    };
    const unlockOnError = () => {
      passBtn.disabled = false;
      if (rerunBtn) rerunBtn.disabled = false;
      if (pendingStamp && pendingStamp.parentNode) {
        pendingStamp.parentNode.removeChild(pendingStamp);
      }
      pendingStamp = null;
    };

    passBtn.addEventListener('click', async () => {
      lock('✅ QA 통과 처리 중…');
      try {
        const baseUrl = await getServerUrl();
        const res = await fetch(
          `${baseUrl}/api/job/${encodeURIComponent(job.id)}/mark-qa-pass`,
          { method: 'POST' },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          addSystemMessage(`QA 통과 실패: ${res.status} ${text.slice(0, 120)}`, 'error');
          unlockOnError();
        }
      } catch (err) {
        addSystemMessage(`QA 통과 실패: ${err.message}`, 'error');
        unlockOnError();
      }
    });

    if (rerunBtn) {
      rerunBtn.addEventListener('click', async () => {
        lock('🔁 자동 QA 재실행 중…');
        try {
          const baseUrl = await getServerUrl();
          const res = await fetch(
            `${baseUrl}/api/job/${encodeURIComponent(job.id)}/rerun-qa`,
            { method: 'POST' },
          );
          if (!res.ok) {
            const text = await res.text().catch(() => '');
            addSystemMessage(`QA 재실행 실패: ${res.status} ${text.slice(0, 120)}`, 'error');
            unlockOnError();
          }
          // 성공 시 폴링이 placeholder 결과를 잡아 updateQaCompletionMessage
          // 가 실행돼 카드 전체가 갈림. 따라서 unlock 불필요.
        } catch (err) {
          addSystemMessage(`QA 재실행 실패: ${err.message}`, 'error');
          unlockOnError();
        }
      });
    }

    actions.appendChild(passBtn);
    if (rerunBtn) actions.appendChild(rerunBtn);
    bubble.appendChild(actions);
  }
```

### Step 2.3: 매뉴얼 검증

- [ ] **새 잡 던지고 status=qa 진입 시점 확인**

수동 검증:
1. PRD 던지고 계획 승인 → tasks 모두 reviewed → job.status 가 `qa` 로 전환
2. 사이드패널에 "🎉 작업 완료!" 카드 1회 노출 확인
3. 자동 QA 통과 시: ✅ QA 통과 버튼만 보임
4. 자동 QA 실패 시: 두 버튼 다 보임. 🔁 자동 QA 재실행 클릭 → 카드가 lock 되고 jobs 가 다시 qa 상태로 폴링이 진행됨 (재실행 placeholder 가 노트로 들어옴)
5. ✅ QA 통과 클릭 → status 가 `complete` 로 넘어감 → 다음 Step (Task 3) 의 Promote 카드가 보임 (Task 3 적용 후)

- [ ] **Step 2.4: Commit**

```bash
git add chrome-extension/sidepanel.js
git commit -m "$(cat <<'EOF'
feat(chrome-ext): Phase 2 Step 4 (1/2) — QA completion card with pass/rerun

Sidepanel polling가 job.status=qa 진입 시 1회 카드를 띄움 (Slack의
postCompletionMessage 미러):
- 완료 task 수 + skip 수 + 자동 QA 결과 요약 + targetRoute.
- [✅ QA 통과] (항상) + [🔁 자동 QA 재실행] (자동 QA 실패 시).
- 버튼은 /mark-qa-pass / /rerun-qa 호출 후 lock + stamp.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: 완료 단계 [Promote] / [Playground 보기] 메시지 (Step 4 — 2/2)

**Files:**
- Modify: `chrome-extension/sidepanel.js`

### Step 3.1: 폴링 루프에 complete 디텍션

- [ ] **qa-landed 블록 직후, terminal 분기 직전에 추가**

```js
      if (job && job.status === 'complete' && !announcedJobStates.has('completed')) {
        announcedJobStates.add('completed');
        addCompletePromoteMessage(job);
      }
```

`TERMINAL` 에 `'complete'` 가 그대로 들어 있으므로 announce 직후 다음 iteration 의 terminal 분기에서 `finishLoop()` 가 호출되어 polling 종료. Promote 클릭은 사용자가 직접 fetch 호출이라 polling 이 계속 돌 필요 없음. (Slack 의 molly.js:1424 와 동일 정책 — `complete` announce 후 즉시 return.)

### Step 3.2: `addCompletePromoteMessage` 렌더러

- [ ] **`addQaCompletionMessage` 직후에 추가**

```js
  /**
   * Phase 2 Step 4 (2/2): job.status=complete 진입 시 1회. Promote
   * 버튼 + Playground 링크. PR 생성 성공 시 같은 카드를 PR URL 로
   * in-place 업데이트하고 finishLoop() 호출.
   */
  function addCompletePromoteMessage(job) {
    const wrap = document.createElement('div');
    wrap.className = 'msg msg-system';
    wrap.dataset.promoteCardJobId = job.id;
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble promote-card';

    const headline = document.createElement('div');
    headline.className = 'promote-summary';
    headline.textContent = `🎉 ${job.id?.slice(0, 8) ?? '?'} 완료 처리됨 — Promote 하시겠어요?`;
    bubble.appendChild(headline);

    const note = document.createElement('div');
    note.className = 'task-transition-stamp';
    note.textContent = `Promote 하면 Playground (${job.playgroundId?.slice(0, 8) ?? '?'}) 의 모든 commit 이 prod repo 의 새 PR 로 올라갑니다. 머지는 GitHub 에서 직접.`;
    bubble.appendChild(note);

    const actions = document.createElement('div');
    actions.className = 'promote-actions';

    const promoteBtn = document.createElement('button');
    promoteBtn.type = 'button';
    promoteBtn.textContent = '🚀 Promote (PR 생성)';
    promoteBtn.className = 'plan-btn plan-btn-primary';

    const openBtn = document.createElement('button');
    openBtn.type = 'button';
    openBtn.textContent = '📺 Playground 보기';
    openBtn.className = 'plan-btn';

    let pendingStamp = null;
    const lock = (text) => {
      promoteBtn.disabled = true;
      pendingStamp = document.createElement('div');
      pendingStamp.className = 'task-transition-stamp';
      pendingStamp.textContent = text;
      bubble.appendChild(pendingStamp);
    };
    const unlockOnError = () => {
      promoteBtn.disabled = false;
      if (pendingStamp && pendingStamp.parentNode) {
        pendingStamp.parentNode.removeChild(pendingStamp);
      }
      pendingStamp = null;
    };

    promoteBtn.addEventListener('click', async () => {
      if (!job.playgroundId) {
        addSystemMessage('Promote 실패: playground id 없음', 'error');
        return;
      }
      lock('🚀 Promote 진행 중 — PR 생성 중…');
      try {
        const baseUrl = await getServerUrl();
        const res = await fetch(
          `${baseUrl}/api/playground/${encodeURIComponent(job.playgroundId)}/promote`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          },
        );
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          addSystemMessage(`Promote 실패: ${res.status} ${text.slice(0, 200)}`, 'error');
          unlockOnError();
          return;
        }
        // server.js:2969-2985 의 promote 핸들러 응답: top-level prUrl
        // (정확히는 spread of promotePlayground 결과 — {ok, playground,
        // patches, ..., prUrl, dryRun}). prUrl 평면 위치라 result.prUrl
        // 분기 불필요.
        const data = await res.json().catch(() => ({}));
        const prUrl = data?.prUrl;
        // pendingStamp 를 결과 메시지로 갈음 — lock 상태 유지 (성공 시
        // 두 번째 클릭 시도 시 또 PR 생성하면 안 됨). polling 은 이미
        // finishLoop 됐으므로 카드 in-place update 도 없음.
        if (pendingStamp && pendingStamp.parentNode) {
          pendingStamp.parentNode.removeChild(pendingStamp);
        }
        pendingStamp = null;
        const result = document.createElement('div');
        result.className = 'task-transition-stamp';
        if (prUrl) {
          result.innerHTML =
            `✅ Promote 완료! 🔗 <a href="${prUrl}" target="_blank" rel="noreferrer">${prUrl}</a> — GitHub 에서 머지하면 끝.`;
        } else {
          result.textContent = '✅ Promote 완료 (PR URL 못 받음 — Playground 헤더에서 확인하세요).';
        }
        bubble.appendChild(result);
        promoteBtn.disabled = true; // 영구 lock — concurrent click 방지
      } catch (err) {
        addSystemMessage(`Promote 실패: ${err.message}`, 'error');
        unlockOnError();
      }
    });

    openBtn.addEventListener('click', () => {
      const url = `http://localhost:4180/p/${encodeURIComponent(job.playgroundId)}`;
      chrome.runtime.sendMessage({ type: 'inspect-open-url', url });
    });

    actions.appendChild(promoteBtn);
    actions.appendChild(openBtn);
    bubble.appendChild(actions);

    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
```

### Step 3.3: 폴링 종료 조건 — 기존 그대로 유지 (complete + cancelled 모두 finishLoop)

- [ ] **변경 없음 — 다만 progress card status 라벨 표시는 그대로**

기존 코드 (현재 sidepanel.js:2188-2198):
```js
if (job && TERMINAL.has(job.status)) {
  if (card) {
    const status = card.querySelector('.msg-status');
    if (status) {
      const ok = job.status === 'complete';
      status.innerHTML = `<span class="dot ${ok ? 'dot-success' : 'dot-error'}"></span> ${ok ? 'complete' : 'cancelled'}`;
    }
  }
  finishLoop();
  return;
}
```

이 블록은 그대로 둠. `addCompletePromoteMessage` 가 TERMINAL 분기 *이전* 에 호출되어 `announcedJobStates.add('completed')` 가 먼저 일어남. 그 직후 같은 iteration 의 TERMINAL 분기에서 progress card status 를 'complete' 으로 바꾸고 finishLoop 호출. 사용자가 Promote 클릭 시 fetch 응답이 카드에 직접 반영되므로 polling 이 더 봐줄 필요 없음 — Slack 의 molly.js:1424 와 같은 정책.

(만약 나중에 외부 Promote — Slack/curl/Playground 에서 promote — 까지 chrome ext 가 미러하고 싶다면, 그때 polling window 를 늘리는 후속 슬라이스로 다룸. 현재 v0 범위 밖.)

### Step 3.4: 매뉴얼 검증

- [ ] **end-to-end lifecycle test**

수동 검증:
1. 새 잡 → 계획 승인 → tasks 진행 → status=qa → ✅ QA 통과 클릭 → status=complete
2. 사이드패널에 "🎉 ... 완료 처리됨 — Promote 하시겠어요?" 카드 1회 노출
3. 🚀 Promote 클릭 → 카드가 "PR 생성 중…" 으로 lock → 성공 시 같은 카드에 PR URL 링크 추가
4. PR URL 클릭 → 새 탭으로 GitHub PR 열림
5. 📺 Playground 보기 클릭 → 새 탭으로 Playground URL 열림

- [ ] **Step 3.5: Commit**

```bash
git add chrome-extension/sidepanel.js
git commit -m "$(cat <<'EOF'
feat(chrome-ext): Phase 2 Step 4 (2/2) — Promote card on job complete

Sidepanel polling 가 job.status=complete 진입 시 1회 카드를 띄움
(Slack의 postCompletePromoteMessage 미러):
- [🚀 Promote (PR 생성)] [📺 Playground 보기] 버튼.
- Promote 클릭 → POST /api/playground/:id/promote (response top-level
  prUrl) 후 결과(PR URL link)를 같은 카드에 stamp 로 추가.
- 에러 시 unlockOnError. announce 직후 polling 종료 (Slack 미러).

이로써 Chrome ext 도 PRD → 코드 → QA → PR 풀 lifecycle 가능 — Slack
parity 달성.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: 통합 검증 + Handoff 갱신

### Step 4.1: 회귀 테스트 — 기존 흐름이 망가지지 않았는지

- [ ] **회귀 1: stateless (no-job) 흐름**
  - 사이드패널에서 playground select 를 "Stateless (no playground)" 로 두고 요청 보내기 → 기존 단발 change-request 흐름이 정상 작동
  - 새 카드들은 노출되지 않아야 함

- [ ] **회귀 2: 잡 취소**
  - 새 잡 → 계획 승인 → 진행 중 ❌ 취소 (progress card 옆 또는 plan card 의 cancel — 아직 plan card 만 있다면 그걸로) 
  - Slack 가 있으면 그쪽에도 같은 시점에 [✅ QA 통과] 메시지가 가지 않는지 (cancelled 는 qa-landed 우회) — 이건 server-side 동작이라 변경 없으니 정상이어야 함

- [ ] **회귀 3: redecompose**
  - planning 단계에서 ✏️ 다시 계획 → 새 plan card 가 나타남 (기존 plan card 는 그대로 남음 — 이건 v0 한계, ok)
  - 새 plan 승인 후 Step 1~3 흐름 정상 작동

### Step 4.2: handoff 문서 갱신

- [ ] **`docs/superpowers/handoffs/2026-04-29-molly-everywhere.md` 의 "다음 세션 후보" 섹션에서 Step 3+4 항목을 ✅ 완료로 표시**

```markdown
### 1. Chrome ext Phase 2 Step 3+4 (Slack lifecycle parity)  ✅ 2026-04-29 완료
- Step 3 ✅ — sidepanel.js 의 per-task transition cards + fail buttons
- Step 4 ✅ — QA completion card + Promote card (Slack parity 달성)
```

또는 새 handoff 추가가 더 깔끔할 수도 있음. 사용자가 결정.

- [ ] **Step 4.3: Memory 업데이트** — `project_canvas_app.md` 의 "Through 2026-04-29 molly-everywhere" 라인에 "+ chrome-ext lifecycle parity" 한 줄 append.

---

## Self-Review (실행 전 검토)

- [x] Spec coverage: handoff 의 Step 3 (task buttons) + Step 4 (QA pass/Promote) 둘 다 커버. Task 1 = Step 3 + paused, Task 2+3 = Step 4.
- [x] Placeholder scan: 모든 step 에 실제 코드/명령 포함. TBD 없음. Promote 응답 shape 확정 (top-level prUrl).
- [x] Type consistency: `announcedTaskState`, `announcedJobStates`, `addQaCompletionMessage`, `updateQaCompletionMessage`, `renderQaCompletionBody`, `addCompletePromoteMessage`, `addTaskTransitionMessage`, `addPausedMessage` 등 이름이 모든 task 에서 일관적.
- [x] 서버 엔드포인트는 모두 검증된 기존 라우트 (`/api/job/:id/{retry-task,accept-task,skip-task,mark-qa-pass,rerun-qa}`, `/api/playground/:id/promote`).
- [x] DRY: lock + unlockOnError + pendingStamp 패턴이 모든 카드(task/qa/promote)에 일관적용. `getServerUrl()` / `addSystemMessage()` / `chrome.runtime.sendMessage({type:'inspect-open-url'})` 모두 sidepanel.js 의 기존 헬퍼.
- [x] Polling 정책: Slack의 molly.js:1424 와 동일 — `complete` announce 후 즉시 finishLoop. Promote 클릭은 사용자 직접 fetch.
- [x] Reload-resilience: `announcedJobStates` / `announcedTaskState` 가 클로저 변수지만 진입 시 DOM sniff 로 prefill — 카드 중복 없음.

## 예상 시간

- Task 1 (Step 3 — per-task transitions + fail buttons + paused): ~1.0~1.5h
- Task 2 (Step 4 part 1 — QA card with pass/rerun + update path): ~1.0~1.5h
- Task 3 (Step 4 part 2 — Promote card): ~0.5~1.0h
- Task 4 (회귀 검증 + handoff): ~0.5h
- **합계**: ~3.0~4.5h (handoff 의 ~2.5h 추정에 + paused / dedupe sniff / update path / unlock-on-error 가 추가됨)

## 주의사항 (executing 시 참고)

1. **DOM selector escape**: `data-task-transition-id` 같은 dataset selector 는 CSS.escape 로 감싸야 task ID 가 특수문자 포함 시 안전.
2. **Promote 응답 shape (확정)**: server.js:2969-2985 의 `/api/playground/:id/promote` 핸들러는 `lib/playground.js#promotePlayground` 결과를 spread 해서 응답 — top-level `prUrl` (그리고 `branch`, `applied`, `skipped`, `dryRun` 등). 따라서 `data.prUrl` 평면 접근 1형태만 사용.
3. **Polling 종료**: `complete` 진입 시 announce 직후 finishLoop. 사용자가 사이드패널 reload 후 다시 들어와도 DOM sniff 로 announcedJobStates 가 prefill 되어 카드 중복 없음. Promote 클릭은 사용자 직접 fetch 라 polling 의 도움 불필요.
4. **재실행 placeholder → 실 결과 update**: server 의 `rerun-qa` 가 `qaAutoResult.notes='재실행 중…'` 으로 placeholder 를 찍고, runner 가 끝나면 실 결과로 replace. polling 이 매 tick `qa` 상태에서 qa-landed dedupe 가 set 에 있으면 `updateQaCompletionMessage` 를 호출 — 카드가 placeholder → 실결과로 in-place update.
5. **Plan card duplication on redecompose** (improvement, optional): 현재 ✏️ 다시 계획 → 새 plan card 추가 시 기존 plan card 가 그대로 남음 (handoff 의 v0 한계). 후속 슬라이스에서 `wrap.dataset.jobPlanId` 로 기존 카드 dim 처리 권장 — 이번 plan 의 범위는 아님.
6. **버튼 unlock on error**: 모든 fail action / qa pass / qa rerun / promote 버튼은 server 응답이 not-ok 면 `unlockOnError()` 로 버튼 복구 + pendingStamp 제거. polling 이 새 status 를 잡아 카드를 in-place update 하면 자동으로 stamp 가 갈리니 성공 시 unlock 불필요.
