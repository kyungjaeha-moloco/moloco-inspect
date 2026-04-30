# Level 1 assertion + 액션 사유 enum — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:**
1. agent_review 의 LLM verdict 가 가짜 pass 찍는 케이스 차단 (실제 잡 88a27157 사례). `finalUrl /sign-in` / `httpStatus !== 200` 등 코드 자동 체크 (Level 1).
2. 사용자 [재시도/그대로 통과/건너뛰기/취소] 시 사유 enum capture — 데이터 누적 시점부터 분석 가능. v0: server schema + 1 surface (Chrome ext) UI. Slack/Playground 은 follow-up.

**Architecture:**
- agent-review.js 에 deterministic assertion 함수 추가. LLM verdict 와 결합 — 어느 한 쪽이 fail 이면 final passed=false. evidence 에 `assertionResult` 별도 기록 (디버깅).
- job.js 의 액션 함수 (`retryTask`/`acceptTask`/`skipTask`/`cancelJob`) 시그니처에 optional `{ reason, reasonText }` 추가. `task.actionHistory[]` 또는 `task.lastAction = {kind, reason, at}` persist.
- server.js 라우터가 body 에서 `reason`/`reasonText` 받아 lib 에 전달.
- Chrome ext 사이드패널 의 fail-actions 버튼에 reason 선택 → server 호출 시 body 에 포함.

**Tech Stack:** Node http, vanilla JS (sidepanel.js), 기존 fetch 패턴.

---

## File Structure

- **Modify:** `orchestrator/lib/qa-adapters/agent-review.js` — `runLevel1Assertions(evidence, job)` 추가. LLM 호출 후 결과와 결합.
- **Modify:** `orchestrator/lib/job.js` — 4 개 액션 함수 시그니처 + persist 필드.
- **Modify:** `orchestrator/server.js` — 4 개 라우터 body 에서 reason 추출.
- **Modify:** `chrome-extension/sidepanel.js` — `appendTaskFailActions` 의 fetch 호출 시 reason 추가. 작은 picker UI (select element) 추가.
- **Modify:** `chrome-extension/sidepanel.css` — `.task-fail-reason-picker` 스타일.

---

## Task 1: Level 1 assertion in agent_review

**Files:** `orchestrator/lib/qa-adapters/agent-review.js`

### Step 1.1: 신규 함수 `runLevel1Assertions`

- [ ] **agent-review.js 안에 helper 함수 추가** (line ~70 직전, `agentReview` 함수 위)

```js
/**
 * Level 1 deterministic assertions — LLM verdict 와 별개로 코드가
 * 자동 검증할 수 있는 hard rule. LLM 이 catch 못 한 가짜 pass 차단.
 * 5 framework 컨센서스 (Hamel Husain Level 1, Anthropic Capability
 * Evals 등) 의 deterministic 레이어.
 *
 * @param {object} evidence — capturePageEvidence 결과
 * @param {object} job
 * @returns {{ passed: boolean, failures: string[] }}
 */
export function runLevel1Assertions(evidence, job) {
  /** @type {string[]} */
  const failures = [];

  // A1. 권한 가드 회귀 — finalUrl 이 /sign-in 으로 redirect.
  // 실 잡 88a27157 에서 LLM 이 놓친 케이스 — 코드로 직접 catch.
  if (evidence.finalUrl && /\/sign-in(\?|$|\/)/.test(evidence.finalUrl)) {
    failures.push(
      `A1 권한 가드 회귀: finalUrl 이 /sign-in 으로 리다이렉트됨 (${evidence.finalUrl.slice(0, 200)})`,
    );
  }

  // A2. HTTP 비-2xx — 라우트 자체가 깨짐. (no-response 도 fail.)
  if (
    evidence.httpStatus == null ||
    evidence.httpStatus < 200 ||
    evidence.httpStatus >= 300
  ) {
    failures.push(
      `A2 HTTP 상태 비정상: ${evidence.httpStatus ?? 'no-response'}`,
    );
  }

  // A3. targetRoute 와 finalUrl 의 path 가 일치하지 않으면 redirect 발생.
  // (sign-in 외에도 다른 redirect — 예: forbidden 페이지, 404 페이지 등)
  // ⚠️ false positive 빈도 우려 — PRD 가 "버튼 클릭 시 /detail 이동",
  // "form submit 후 /list redirect" 같은 의도적 redirect 면 fail 처리되면
  // 안 됨. v0 정책: **warning only — final verdict 에 영향 X**, 단
  // failures 배열에 별도 prefix 'WARN' 으로 기록 → 데이터 누적 후 패턴
  // 보고 hard fail 로 전환할지 결정.
  /** @type {string[]} */
  const warnings = [];
  if (job.targetRoute && evidence.finalUrl) {
    try {
      const finalPath = new URL(evidence.finalUrl).pathname;
      if (finalPath !== job.targetRoute && !finalPath.startsWith(`${job.targetRoute}/`)) {
        if (!/\/sign-in/.test(finalPath)) {
          warnings.push(
            `A3 라우트 redirect (warning): targetRoute=${job.targetRoute}, finalPath=${finalPath}`,
          );
        }
      }
    } catch {
      // URL parse 실패 → A2 에서 잡힐 가능성 큼. silent.
    }
  }

  // A4. 빈 body 렌더 — `<div id='root'></div>` 만 보이는 케이스.
  // ⚠️ hydration race 우려 — screenshot.js 의 networkidle 후 SPA 가
  // hydrate 끝나기 전에 측정될 수 있음 (screenshot.js:69 근처). v0:
  // 임계값 더 낮춤 (< 20 자) + 명확한 빈-root 패턴 직접 매칭 둘 중
  // 하나만 fail. hydration 보강 (waitForSelector 등) 은 별도 슬라이스.
  const bodyTrim = (evidence.bodyText || '').trim();
  const isExplicitlyEmptyRoot =
    /^<\s*div[^>]*\bid\s*=\s*['"]?root['"]?[^>]*>\s*<\/\s*div\s*>/i.test(bodyTrim) ||
    bodyTrim === '' ||
    bodyTrim === '<div id="root"></div>';
  if (isExplicitlyEmptyRoot || (bodyTrim.length > 0 && bodyTrim.length < 20)) {
    failures.push(
      `A4 빈 body 렌더: bodyText 길이 ${bodyTrim.length}자 (hydration race 가능성 — pageErrors 같이 확인)`,
    );
  }

  // A5. 페이지 에러 — 사용자에게 보이는 throw. console warn 은 OK.
  if (Array.isArray(evidence.pageErrors) && evidence.pageErrors.length > 0) {
    failures.push(
      `A5 페이지 에러 ${evidence.pageErrors.length}개: ${(evidence.pageErrors[0] || '').slice(0, 120)}`,
    );
  }

  return { passed: failures.length === 0, failures, warnings };
}
```

### Step 1.2: agentReview 가 assertion 결과와 LLM verdict 결합

- [ ] **assertion 호출을 capturePageEvidence 직후 (line ~106 이후) 로 옮김**. LLM 호출 전이라 LLM 실패 fall-through 시에도 assertion 가 작동.

```js
  // 1.5. Level 1 assertions — LLM 호출 전에 미리 돌림. evidence 만으로
  // 판정 가능한 deterministic 체크. LLM 가 호출 실패해도 assertion
  // 결과는 evidence 에 보존.
  const lvl1 = runLevel1Assertions(evidence, job);
```

- [ ] **모든 early return path (capturePageEvidence 실패는 제외 — evidence 자체가 없음) 가 assertion 결과 evidence 에 포함**

LLM 호출 실패 / 응답 파싱 실패 등 6 개 early-return path (agent-review.js:197, 205, 215, 224, 234) 모두 동일 evidence 객체 반환하도록 helper 추가:

```js
  // helper — LLM 실패 시에도 assertion 결과 보존하기 위한 evidence 빌더.
  const buildEvidence = (extras = {}) => ({
    httpStatus: evidence.httpStatus,
    finalUrl: evidence.finalUrl,
    consoleErrorCount: evidence.consoleErrors.length,
    pageErrorCount: evidence.pageErrors.length,
    bodyChars: evidence.bodyText.length,
    hasScreenshot: !!evidence.screenshotBytes,
    assertionPassed: lvl1.passed,
    assertionFailures: lvl1.failures,
    assertionWarnings: lvl1.warnings,
    ...extras,
  });
```

각 LLM 실패 early-return 가 다음 형태:

```js
  if (!resp.ok) {
    const txt = await resp.text();
    // assertion 가 fail 이면 그 verdict 우선. assertion 도 pass 면
    // LLM 실패 자체가 fail 사유.
    return {
      passed: lvl1.passed && false,  // LLM 결과 없으면 conservative fail
      notes: !lvl1.passed
        ? `Level 1 fail: ${lvl1.failures[0]}`
        : `Claude ${resp.status}: ${txt.slice(0, 200)}`,
      evidence: buildEvidence({ llmVerdict: null, llmError: `http ${resp.status}` }),
    };
  }
```

다른 5 개 early-return 도 같은 패턴 (notes 만 케이스별, evidence 는 buildEvidence + llmError 적절 메시지).

- [ ] **정상 path 의 마지막 return — assertion 와 LLM verdict 결합**

```js
  // Level 1 assertion 와 LLM verdict 결합.
  // - LLM 이 fail 이면 무조건 fail
  // - LLM 이 pass 인데 assertion 이 fail 이면 final fail (LLM false-pass 차단)
  // - 둘 다 pass 면 final pass
  let finalPassed = passed && lvl1.passed;
  let finalNotes = notes;
  if (passed && !lvl1.passed) {
    // LLM 통과시켰지만 assertion 가 fail — assertion 메시지 우선.
    finalNotes = `Level 1 fail (${lvl1.failures.length}): ${lvl1.failures[0]}`;
  } else if (!passed && !lvl1.passed) {
    // 둘 다 fail — 합쳐서 표시.
    finalNotes = `${notes} | Level 1 fail: ${lvl1.failures[0]}`;
  }

  return {
    passed: finalPassed,
    notes: finalNotes,
    evidence: buildEvidence({ llmVerdict: passed }),
  };
```

### Step 1.3: 검증

- [ ] **node --check + 합성 검증 재실행** — 기존 `verify-agent-review.mjs` 의 4 케이스 + 신규 케이스 (LLM 이 잘못 pass 찍은 케이스)

신규 5 번째 케이스 추가 — LLM 이 잘못 pass 찍는 시나리오:
- finalUrl = `/sign-in?redirect=/admin/stats`
- bodyText = "Sign in form..."
- LLM 가 어쩌다 passed=true 찍었다 가정 (실제로는 verifier prompt 가 잡지만 코드 레벨 체크 검증용)

이건 합성 검증 스크립트의 추가 case 로 들어가야 — 하지만 `verify-agent-review.mjs` 는 LLM 직접 호출이라 확정적 fail 만들기 어려움. 따라서 unit-style 테스트 추가 — `runLevel1Assertions` 함수를 직접 호출해서 5 가지 input 에 대한 expected output 확인.

- [ ] **`orchestrator/scripts/verify-level1-assertions.mjs` 신설**

```js
#!/usr/bin/env node
/**
 * Unit-style verification of runLevel1Assertions — 코드 자체 회귀
 * 방지. agent-review.js 안의 함수를 직접 호출.
 */
import { runLevel1Assertions } from '../lib/qa-adapters/agent-review.js';

// runLevel1Assertions 가 export 되도록 agent-review.js 수정 필요 (Task 1.1 보완).

const cases = [
  {
    name: 'A1 sign-in redirect',
    evidence: { finalUrl: 'http://localhost:5173/sign-in?redirect=/admin/stats', httpStatus: 200, bodyText: 'Sign in form ...', pageErrors: [], consoleErrors: [] },
    job: { targetRoute: '/admin/stats' },
    expectedPassed: false,
    expectedFailureRegex: /A1/,
  },
  {
    name: 'A2 500 error',
    evidence: { finalUrl: 'http://localhost:5173/help', httpStatus: 500, bodyText: 'error', pageErrors: [], consoleErrors: [] },
    job: { targetRoute: '/help' },
    expectedPassed: false,
    expectedFailureRegex: /A2/,
  },
  {
    // A3 는 warning only — final verdict 에 영향 X. failures 에 안 들어가고
    // warnings 에 들어가야 함.
    name: 'A3 redirect to forbidden (warning only)',
    evidence: { finalUrl: 'http://localhost:5173/forbidden', httpStatus: 200, bodyText: 'Forbidden page content here that is more than 50 characters long.', pageErrors: [], consoleErrors: [] },
    job: { targetRoute: '/admin/stats' },
    expectedPassed: true,  // A3 는 fail 안 시킴
    expectedFailureRegex: null,
    expectedWarningRegex: /A3/,
  },
  {
    name: 'A4 empty body',
    evidence: { finalUrl: 'http://localhost:5173/help', httpStatus: 200, bodyText: '<div id="root"></div>', pageErrors: [], consoleErrors: [] },
    job: { targetRoute: '/help' },
    expectedPassed: false,
    expectedFailureRegex: /A4/,
  },
  {
    name: 'A5 page error',
    evidence: { finalUrl: 'http://localhost:5173/help', httpStatus: 200, bodyText: 'some content here that is more than 50 characters long enough', pageErrors: ['TypeError: x is undefined'], consoleErrors: [] },
    job: { targetRoute: '/help' },
    expectedPassed: false,
    expectedFailureRegex: /A5/,
  },
  {
    name: '🟢 clean — all assertions pass',
    evidence: { finalUrl: 'http://localhost:5173/help', httpStatus: 200, bodyText: '<html><body><h1>Help</h1><p>곧 컨텐츠가 추가됩니다</p></body></html>', pageErrors: [], consoleErrors: [] },
    job: { targetRoute: '/help' },
    expectedPassed: true,
    expectedFailureRegex: null,
  },
];

let pass = 0;
for (const c of cases) {
  const r = runLevel1Assertions(c.evidence, c.job);
  const matchesPassed = r.passed === c.expectedPassed;
  const matchesFailure =
    c.expectedFailureRegex == null
      ? r.failures.length === 0
      : r.failures.some((f) => c.expectedFailureRegex.test(f));
  const matchesWarning =
    c.expectedWarningRegex == null
      ? true  // warning 검증 안 하는 케이스는 자동 통과
      : (r.warnings || []).some((w) => c.expectedWarningRegex.test(w));
  const ok = matchesPassed && matchesFailure && matchesWarning;
  console.log(
    `${ok ? '✅' : '❌'} ${c.name}: passed=${r.passed}, ` +
      `failures=${JSON.stringify(r.failures)}, warnings=${JSON.stringify(r.warnings || [])}`,
  );
  if (ok) pass++;
}
console.log(`\nResults: ${pass}/${cases.length}`);
process.exit(pass === cases.length ? 0 : 1);
```

- [ ] **agent-review.js 의 `runLevel1Assertions` 를 export 로 바꿈** — 위 unit test 가 import 가능해야.

### Step 1.4: Commit

```bash
git add orchestrator/lib/qa-adapters/agent-review.js orchestrator/scripts/verify-level1-assertions.mjs
git commit -m "$(cat <<'EOF'
feat(qa): Level 1 deterministic assertions on top of agent_review LLM verdict

5 framework 컨센서스 (Hamel Husain Level 1, Anthropic Capability Evals)
의 deterministic 레이어 도입. agent_review LLM 이 false-pass 찍은 실
잡 88a27157 (sign-in redirect 인데 passed=true) 케이스 방지.

5 assertion:
- A1 권한 가드 회귀 (finalUrl 에 /sign-in)
- A2 HTTP 비-2xx
- A3 targetRoute ↔ finalPath 불일치 (다른 redirect)
- A4 빈 body 렌더 (<50자)
- A5 페이지 에러 (uncaught throw)

LLM verdict 와 결합 — 어느 한 쪽이라도 fail 이면 final passed=false.
evidence 에 assertionPassed / assertionFailures / llmVerdict 별도
기록 — debugging + 향후 disagreement 분석용.

Unit test (verify-level1-assertions.mjs) 6/6 케이스 통과.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: 액션 사유 enum — server schema + Chrome ext UI

**Files:**
- `orchestrator/lib/job.js` — 4 액션 함수 시그니처
- `orchestrator/server.js` — 4 라우터 body 추출
- `chrome-extension/sidepanel.js` — picker UI + reason 전달
- `chrome-extension/sidepanel.css` — picker 스타일

### Step 2.1: enum 정의

- [ ] **`orchestrator/lib/job.js` 의 상단 (export 들 위) 에 enum + helper 추가**

```js
/**
 * 사용자가 task action 또는 job cancel 시 선택할 사유.
 * 5 framework 의 "shipped 직전 데이터 capture 못 하면 영영 손실"
 * 원칙. v0 enum 은 작게 — 향후 데이터 분포 보고 추가/통합.
 */
export const ACTION_REASONS = Object.freeze({
  syntax_error: '문법/타입 에러',
  logic_error: '논리/구현 오류',
  scope_creep: '범위 벗어남 (PRD 외 변경)',
  partial: '부분 구현 (요구사항 일부만)',
  wrong_target: '잘못된 파일/컴포넌트',
  over_delivered: '오버 딜리버 (과한 변경)',
  other: '기타',
});

function normalizeReason(reason) {
  if (!reason) return null;
  if (typeof reason !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(ACTION_REASONS, reason) ? reason : null;
}
```

### Step 2.2: 4 액션 함수 시그니처 확장

- [ ] **`retryTask`, `acceptTask`, `skipTask`, `cancelJob` 시그니처에 optional 4th 파라미터 `actionMeta = { reason, reasonText }` 추가**

기존:
```js
export function retryTask(jobId, taskId) { ... }
```

변경:
```js
export function retryTask(jobId, taskId, actionMeta = {}) {
  // ... 기존 로직 ...
  // 끝부분에 actionHistory 추가:
  const reason = normalizeReason(actionMeta.reason);
  const reasonText = typeof actionMeta.reasonText === 'string' ? actionMeta.reasonText.slice(0, 500) : null;
  if (reason || reasonText) {
    if (!task.actionHistory) task.actionHistory = [];
    task.actionHistory.push({
      kind: 'retry',
      reason,
      reasonText,
      at: Date.now(),
    });
  }
  // 기존 persist 호출
}
```

같은 패턴으로 `acceptTask` (kind='accept'), `skipTask` (kind='skip'), `cancelJob` (job.cancelMeta = {reason, reasonText, at}).

### Step 2.3: server.js 라우터

- [ ] **4 라우터 body 에서 reason / reasonText 추출 후 lib 에 전달**

기존:
```js
else if (action === 'retry-task') {
  const body = await parseBody(req);
  updated = retryTask(jobId, body?.taskId);
  runJobInBackground(jobId);
}
```

변경:
```js
else if (action === 'retry-task') {
  const body = await parseBody(req);
  updated = retryTask(jobId, body?.taskId, {
    reason: body?.reason,
    reasonText: body?.reasonText,
  });
  runJobInBackground(jobId);
}
```

같은 패턴 4 개. cancel 라우터는 `cancelJob(jobId, { reason, reasonText })` 만 추가 (rewind 인자는 그대로).

### Step 2.4: Chrome ext sidepanel — fail-actions picker

- [ ] **`appendTaskFailActions` 안에 reason picker 추가 (버튼 위에)**

기존 fail actions 컨테이너에 select element 추가:

```js
function appendTaskFailActions(bubble, task, jobId) {
  const wrap = document.createElement('div');
  wrap.className = 'task-fail-reason-picker';
  const pickerLabel = document.createElement('span');
  pickerLabel.className = 'task-fail-reason-label';
  pickerLabel.textContent = '사유:';
  wrap.appendChild(pickerLabel);

  const picker = document.createElement('select');
  picker.className = 'task-fail-reason-select';
  const reasonOptions = [
    ['', '(선택 안 함)'],
    ['syntax_error', '문법/타입 에러'],
    ['logic_error', '논리/구현 오류'],
    ['scope_creep', '범위 벗어남'],
    ['partial', '부분 구현'],
    ['wrong_target', '잘못된 파일'],
    ['over_delivered', '오버 딜리버'],
    ['other', '기타'],
  ];
  for (const [v, label] of reasonOptions) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = label;
    picker.appendChild(opt);
  }
  wrap.appendChild(picker);
  bubble.appendChild(wrap);

  // ... 기존 actions div + 버튼 정의 ...

  const post = async (path, label) => {
    lock(`${label} 처리 중…`);
    try {
      const baseUrl = await getServerUrl();
      const reason = picker.value || undefined;
      const res = await fetch(
        `${baseUrl}/api/job/${encodeURIComponent(jobId)}/${path}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: task.id, reason }),
        },
      );
      // ... 기존 에러 처리 ...
    }
    // ...
  };
}
```

(이 변경은 기존 `appendTaskFailActions` 코드 안에 picker 만 추가 + post 함수의 fetch body 에 reason 만 추가. 다른 부분 동일.)

### Step 2.5: CSS

- [ ] **`chrome-extension/sidepanel.css` 끝에 append**

```css
.task-fail-reason-picker {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  font-size: 11px;
}
.task-fail-reason-label {
  color: var(--text-tertiary);
  font-weight: 500;
}
.task-fail-reason-select {
  font-size: 11px;
  padding: 2px 6px;
  border: 1px solid var(--border-primary);
  border-radius: 3px;
  background: var(--bg-elevated);
  color: var(--text-primary);
  cursor: pointer;
}
```

### Step 2.6: 검증

- [ ] **node --check 모든 변경 파일**
- [ ] **수동 케이스 (사용자 검증 절차)**:
  - Chrome ext 사이드패널 reload
  - 새 잡 → 의도적 review fail 유도 → fail-actions 카드에 [사유 select] 노출 확인
  - "scope_creep" 선택 후 [그대로 통과] → orchestrator 의 job state JSON 에 actionHistory 기록 확인:
    ```bash
    cat orchestrator/state/job/<jobId>.json | python3 -c "import sys,json;j=json.load(sys.stdin);[print(t.get('id'),t.get('actionHistory')) for t in j.get('tasks',[])]"
    ```
- [ ] **회귀 — reason 안 보내도 (구 클라이언트 호환) 정상 동작**

### Step 2.7: Commit

```bash
git add orchestrator/lib/job.js orchestrator/server.js chrome-extension/sidepanel.js chrome-extension/sidepanel.css
git commit -m "$(cat <<'EOF'
feat(action-reasons): capture optional reason on retry/accept/skip/cancel

5 framework 컨센서스 — "shipped 직전 capture 못 하면 영영 손실".
사용자 액션 사유를 enum 으로 capture, persist 시작.

Server:
- ACTION_REASONS enum (job.js): syntax_error, logic_error, scope_creep,
  partial, wrong_target, over_delivered, other
- 4 액션 함수 (retryTask/acceptTask/skipTask/cancelJob) 시그니처에
  optional actionMeta = { reason, reasonText } 추가
- task.actionHistory[] (또는 job.cancelMeta) 에 persist
- 라우터가 body 에서 reason 추출 후 전달
- 후위 호환 — reason 미전달 시 기존 동작 그대로

Chrome ext:
- task-fail-actions 카드에 reason select picker 추가 (8 옵션)
- post 호출 시 body 에 reason 포함

Slack/Playground 는 follow-up.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: handoff + memory

### Step 3.1: handoff doc

- [ ] **`docs/superpowers/handoffs/2026-04-30-level1-assertions-action-reasons.md` 작성**
  - 2 commits 정리
  - Level 1 assertion 효과 측정 방법 (다음 잡들의 assertionPassed != llmVerdict 케이스 추적)
  - 액션 사유 분포 분석 시점 — 50+ 잡 누적 후
  - 다음 슬라이스: multi-tenant v1 (research 끝남)

### Step 3.2: memory 갱신

- [ ] `project_canvas_app.md` 업데이트.

---

## Self-Review

- [x] Spec coverage: Level 1 assertion 5종 + 액션 사유 enum + 1 surface (Chrome ext) UI
- [x] 후위 호환: reason 미전달 시 기존 동작
- [x] Test: unit-level (verify-level1-assertions.mjs 6 케이스)
- [x] Surface 분리: Slack/Playground 는 명시적 follow-up
- [x] Naming: `runLevel1Assertions`, `ACTION_REASONS`, `actionHistory`, `actionMeta` 일관

## 예상 시간

- Task 1 (Level 1 assertion + unit test + 6 케이스 + early-return path 보강): ~1.5~2.0h
- Task 2 (액션 사유 server enum + 4 라우터 + Chrome ext picker + CSS): ~2.0~2.5h
- Task 3 (handoff + memory): ~0.5h
- 합계: ~4~5h

## 주의사항

1. **runLevel1Assertions export** — `export function` 으로 명시 (Step 1.1 코드 블록 반영). verify-level1-assertions.mjs 가 import.

2. **A3 는 warning only — final verdict 영향 X** — PRD 가 "버튼 클릭 시 /detail 이동" 등 의도적 redirect 인 케이스 false fail 방지. `evidence.assertionWarnings[]` 에 별도 기록 → 데이터 누적 후 패턴 보고 hard fail 로 전환할지 결정. 50 잡 누적 후 의도된 redirect vs 실제 회귀 비율이 7:3 이상이면 v1 에서 hard fail 전환.

3. **A4 hydration race** — 임계값 `< 20 자` + 명시적 빈-root 패턴 (`<div id="root"></div>` 정확 매칭) 둘 중 하나만 fail. screenshot.js 의 networkidle 후 SPA hydrate race 가능성 — 정상 SPA 에서 false fail 발생하면 임계값 더 낮추거나 hydration wait 보강 (waitForSelector('body :not(:empty)')) 별도 슬라이스.

4. **assertion 적용 시점** — capturePageEvidence 직후. LLM 호출 실패 / 응답 파싱 실패 6 개 early-return path 모두 buildEvidence helper 로 assertion 결과 보존. evidence-only verdict 가능 (LLM 없어도 deterministic 만으로 fail 판정).

5. **picker 미선택 (`""`)** — server normalizeReason null 처리. 강제 X — 인지 부담 ↓. **측정 trigger**: 50 잡 누적 후 `task.actionHistory[].reason !== null` 비율 < 30% 면 v1 에서 강제 enum (필수 선택) 으로 전환.

6. **task.actionHistory[] 분석 패턴** — array 유지 (여러 retry 누적). **default 분석**: `actionHistory[0]` (첫 액션 사유 = 왜 처음 실패했나) 가 가장 가치 큼. 최종 결정만 보고 싶으면 `slice(-1)[0]`. 둘 다 자주 보이면 v1 에서 `firstActionReason` 캐시 필드 추가.

7. **Slack/Playground reason capture follow-up entry point**:
   - **Slack**: `molly.js` 의 `handleTaskAction` (~line 826). Slack button payload 시그니처 한계로 인라인 picker 불가 — modal trigger 필요. value 에 `${jobId}:${taskId}` 외에 reason picker modal trigger 추가 후 `views.open` 으로 reason picker → submit 시 lib 호출. ~1.5h.
   - **Playground**: `JobCard.tsx` 의 `<ReviewFailActions>` (~line 1052). 버튼 옆에 select element 추가. 가장 단순 — Chrome ext 패턴 그대로 mirror. ~30 min.
   - 두 surface 합쳐 별도 슬라이스 (~2-3h).

8. **multi-tenant v1 은 다음 슬라이스** — 이번 슬라이스 손 안 댐. research doc (`2026-04-30-multi-tenant-onboarding.md`) v1 권장: baseTheme + CLI 자동화 ~1-2 주.
