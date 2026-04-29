# molly chat mode — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** molly 가 세 surface (Slack / Chrome ext / Playground) 에서 받은 mention/submit 을 무조건 Job 생성으로 처리하지 않고, **classifier → 분기** 구조로 코드 작업 외 모든 대화 (인사, 자기 소개, 서버 상태, 사용법, 개선 제안, 잡 상태 질의 등) 에 답할 수 있게 만든다.

**Architecture:** orchestrator 에 `/api/molly/respond` 단일 엔드포인트 — 내부적으로 (1) classifier (Haiku, 빠르고 싸게) 로 `code_change` / `chat` / `status_query` 분류 후 (2) kind 별로 분기. surface 는 기존에 직접 `createJob` 또는 `/api/chat` (Canvas AI Wizard) 부르던 자리에서 이 엔드포인트를 먼저 거침. Playground 는 chat 패널의 첫 사용자 메시지만 classifier 거치고 후속 turn 은 기존 Wizard 그대로 (multi-turn 보호). 분류 실패/애매 시 fallback 은 `chat` (잡 안 만드는 게 안전).

**Tech Stack:** Node http (`orchestrator/server.js`), `@anthropic-ai/sdk` 동일 패턴 (`fetch('https://api.anthropic.com/v1/messages')`). Slack: `@slack/bolt`. Chrome ext: vanilla JS.

---

## File Structure

- **Create:** `orchestrator/lib/molly-classifier.js` — `classifyMollyText(text, ctx) → {kind, reason}`. 1 LLM 호출 (Haiku), 짧은 system prompt + 사용자 텍스트, JSON 응답. ctx 는 surface + recent messages.
- **Create:** `orchestrator/lib/molly-chat.js` — `composeChatReply(text, ctx) → string`. Sonnet 1 호출. molly persona, conversational, ~2-3 문단.
- **Create:** `orchestrator/lib/molly-status.js` — `composeStatusReply(text, ctx, hooks) → string`. listJobs/getJob 호출 후 자연어 응답 (Haiku 또는 templated 답변 — 첫 cut 은 templated, LLM unwrap 옵션).
- **Modify:** `orchestrator/server.js` — 신규 라우터 `POST /api/molly/respond` 추가 (parseBody, dispatch, return).
- **Modify:** `orchestrator/lib/molly.js` — `handleMention` 안 createJob 호출 자리에서 분류 → 분기.
- **Modify:** `chrome-extension/sidepanel.js` — `performSubmit` 의 Job 모드 진입 자리에서 `/api/molly/respond` 우회. kind 분기 처리. **stateless 모드도 같은 게이트 거치게** — "안녕" 한 번에 단발 change-request 만들어지지 않도록.
- **Modify:** `playground-app/src/services/orchestrator-client.ts` — chat submit (현 `/api/chat` 호출) wrapper. 첫 메시지면 `/api/molly/respond` 우회, code_change 면 기존 `/api/chat` 흐름, chat/status 면 답만 반환.
- **Modify:** `playground-app/src/editor/AIPanel.tsx` (또는 chat 패널 위치) — molly 답변 surface 시 Wizard 진입 안 하고 chat 메시지로 append.

---

## 사전 검증

- [ ] **Step 0a: 서비스 가동 확인**

```bash
curl -s -o /dev/null -w "orch %{http_code}\n" http://localhost:3847/api/playground
```

Expected: `200`.

- [ ] **Step 0b: 기존 Slack flow 한 번 sanity check** — `@molly` 던져서 잡 잘 만들어지는지 확인 (옛 동작 baseline).

---

## Task 1: 서버 — classifier + chat + status libs + 엔드포인트

### Step 1.1: `orchestrator/lib/molly-classifier.js` 생성

- [ ] **classifier 단일 함수 export**

```js
// orchestrator/lib/molly-classifier.js
const CLASSIFY_MODEL = process.env.MOLLY_CLASSIFIER_MODEL || 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `당신은 molly 의 분류기입니다. 사용자가 보낸 메시지를 다음 셋 중 하나로 분류하세요:

1. **code_change** — 코드/UI/디자인 을 추가/변경/제거해달라는 요청. 페이지/컴포넌트/기능 작업 지시. 보통 명령형, 결과물 묘사. 예: "TAS 사이드바에 도움말 추가", "버튼을 빨강으로 바꿔줘", "PRD: ...".
2. **status_query** — 기존 잡/플레이그라운드/시스템 상태 질의. 예: "지금 잡 어디까지 됐어?", "어제 만든 거 어떻게 됐어?", "이 잡 cancel 됐어?", "지금 활성 잡 몇 개?", "서버 잘 돌고 있어?".
3. **chat** — 그 외 대화. 인사 / 감사 / 자기소개 질의 / 사용법 / 개선 제안 / 일반 질문 / molly 가 무엇을 할 수 있는지 / 미래 기능 질의 / GitHub/Drive 같은 외부 도구 가능성 질의 등. 예: "안녕", "고마워", "molly 가 뭐야?", "어떻게 쓰는 거야?", "더 잘하는 방법?", "GitHub 도 검색할 수 있어?".

응답 형식 (반드시 JSON 만):
{"kind": "code_change" | "status_query" | "chat", "reason": "<한 줄 한국어>"}

규칙:
- 애매하면 안전한 쪽 = **chat** (잡 안 만드는 게 부작용 0). code_change 는 *명백히* 코드 작업 지시일 때만.
- 길이 < 10자 인 경우 거의 chat 또는 status_query.
- 의문문이고 "어디", "어떻게", "됐어", "끝났어", "활성", "상태" 등 포함 → status_query 가능성 높음.
- 평서문/명령문이고 "추가", "수정", "변경", "만들어", "바꿔" + 구체적 대상 (페이지/컴포넌트/파일 등) 포함 → code_change.
- "할 수 있어?", "가능해?", "지원해?" 류 능력 질의 → chat.`;

/**
 * @param {string} text — 사용자 입력 (멘션 텍스트 stripped 등 cleanup 된 상태)
 * @param {object} [ctx] — { surface: 'slack'|'chrome-ext', recentMessages?: [...] }
 * @returns {Promise<{kind: 'code_change'|'status_query'|'chat', reason: string}>}
 */
export async function classifyMollyText(text, ctx = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const userMessage = ctx.recentMessages?.length
    ? `최근 대화:\n${ctx.recentMessages.slice(-3).map((m) => `- ${m}`).join('\n')}\n\n분류할 메시지:\n${text}`
    : `분류할 메시지:\n${text}`;

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CLASSIFY_MODEL,
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`classifier http ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const content = data?.content?.[0]?.text ?? '';
  // 응답에서 JSON 추출 — brace counting 으로 reason 안의 `}` 가 깨뜨리지
  // 않게. parse 실패 시 chat 으로 안전하게 폴백 (잡 안 만드는 게 부작용 0).
  const start = content.indexOf('{');
  if (start === -1) {
    return { kind: 'chat', reason: 'classifier produced no JSON, defaulting to chat' };
  }
  let depth = 0;
  let end = -1;
  for (let i = start; i < content.length; i++) {
    const ch = content[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end === -1) {
    return { kind: 'chat', reason: 'classifier JSON unterminated, defaulting to chat' };
  }
  let parsed;
  try {
    parsed = JSON.parse(content.slice(start, end + 1));
  } catch (err) {
    return { kind: 'chat', reason: `classifier parse failed: ${err.message?.slice(0, 80)}, defaulting to chat` };
  }
  if (!['code_change', 'status_query', 'chat'].includes(parsed?.kind)) {
    return { kind: 'chat', reason: `classifier returned invalid kind="${parsed?.kind}", defaulting to chat` };
  }
  return { kind: parsed.kind, reason: parsed.reason || '' };
}
```

### Step 1.2: `orchestrator/lib/molly-chat.js` 생성

- [ ] **chat reply lib**

```js
// orchestrator/lib/molly-chat.js
const CHAT_MODEL = process.env.MOLLY_CHAT_MODEL || 'claude-sonnet-4-20250514';

const SYSTEM_PROMPT = `당신은 Moloco Inspect 의 AI 어시스턴트 "molly" 입니다. 톤은 친근하고 간결한 한국어. 답변은 2-4 문단, 필요하면 1-2 줄로 더 짧게.

## molly 가 지금 할 수 있는 일

- **PRD → PR**: PRD 한 줄 또는 문단 던지면 잡 만들어서 [승인 / 재계획 / 취소] 후 자동으로 코드 작성 → 리뷰 → 자동 QA (스크린샷 + 콘솔 + Vision 종합 판정) → 사용자 [QA 통과] → [Promote] 클릭으로 GitHub PR 생성
- **세 surface 통합**: Slack \`@molly\` / Chrome 확장 사이드패널 / Playground 채팅 어디서 시작해도 같은 잡 진행 추적 + 같은 라이프사이클 버튼
- **잡/시스템 상태 질의**: "지금 잡 어디까지 됐어?", "활성 잡 몇 개?", "어제 만든 거 어떻게 됐어?"
- **계획 다듬기**: 잡 만든 후 사용자가 ✏️ 다시 계획 / 태스크 별 ✎ 편집 / 자유 피드백 입력 가능
- **External cancel detection**: 잡이 다른 surface 에서 취소되면 모든 surface 에 알림

## 사용법 핵심

- 코드 작업 요청: 명확한 PRD 한 줄 → 멘션 (Slack: \`@molly ...\`, Chrome ext: 사이드패널 입력창, Playground: 채팅 입력창)
- 진행 추적: Inspect Console (\`http://localhost:4174\`) 의 Jobs 탭, 또는 사용 중인 surface
- 잡 결과 확인: 자동 QA 스크린샷 + 사람 검토 후 [QA 통과] → [Promote] 클릭으로 PR

## 아직 할 수 없는 일 (질문 받으면 솔직히 안내)

- GitHub 직접 검색/수정 (PR 생성만 됨)
- Google Drive 문서 검색/생성
- 외부 도메인 멀티-tenant 자동화 (지금은 티빙 기반 MSM Portal 한정)
- 실시간 코드 리뷰 컴멘트 답변 (사람이 PR 머지 후 이슈 보고 새 잡 던지는 흐름)

위 셋은 향후 추가 고려 중이라고 안내. 사용자가 구체적으로 요청하면 "그건 이번 슬라이스에 없는데, 다음 작업 후보로 기억해두겠습니다" 식으로.

## 답변 톤

- 막연한 인사/감사면 짧게 (1-2 줄)
- 자기소개 / "뭐 할 수 있어?" 질문이면 위 "지금 할 수 있는 일" 에서 핵심만 골라 1-2 줄 + 예시 한 줄
- 사용자가 잡을 만들고 싶어 보이는데 PRD 가 없으면: "PRD 한 줄과 함께 멘션해 주시면 잡 만들어드릴게요. 예: 'TAS 사이드바에 도움말 메뉴 추가'."
- 솔직한 것 우선 — 모르면 모른다 하고, 아직 안 되는 거면 안 된다 함`;

/**
 * @param {string} text — 사용자 입력
 * @param {object} [ctx] — { surface, recentMessages? }
 * @returns {Promise<string>} — 답변 (Slack mrkdwn 호환 일반 텍스트)
 */
export async function composeChatReply(text, ctx = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const userMessage = ctx.recentMessages?.length
    ? `최근 대화:\n${ctx.recentMessages.slice(-3).map((m) => `- ${m}`).join('\n')}\n\n사용자: ${text}`
    : `사용자: ${text}`;
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    throw new Error(`chat http ${resp.status}: ${t.slice(0, 200)}`);
  }
  const data = await resp.json();
  const content = data?.content?.[0]?.text ?? '';
  return content.trim() || '음… 답을 못 만들었어요. 다시 시도해 주세요.';
}
```

### Step 1.3: `orchestrator/lib/molly-status.js` 생성

- [ ] **status query lib — Haiku 가 잡 목록 + 사용자 질문 받아서 자연어 응답**

`composeStatusReply(text, ctx)` 가 잡 raw 데이터를 모은 뒤 Haiku 한 번 태워 사용자 질의에 답하게 함. 템플릿보다 ~50ms 더 들지만 "어제 만든 거" 같은 시간/필터 질의도 답할 수 있고 톤도 자연스러움.

```js
// orchestrator/lib/molly-status.js

const STATUS_MODEL = process.env.MOLLY_STATUS_MODEL || 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = `당신은 molly 의 status reporter 입니다. 사용자가 잡/시스템 상태에 대해 질문하면 아래 raw 데이터를 보고 친근한 한국어로 답변합니다.

답변 형식:
- 사용자가 묻는 것 (활성 / 어제 / 특정 잡 등) 만 골라 답
- 잡이 많으면 5개 이내로 요약
- 잡 id 는 첫 8자만 (백틱)
- 진행 중인 잡은 reviewed 수 / total 수, 상태, targetRoute
- "자세한 건 Inspect Console (http://localhost:4174) 의 Jobs 탭" 안내 한 줄
- 답변 길이 2-4 문단, 필요하면 1-2 줄

raw 데이터 형식: JSON 배열, 각 잡은 { id, status, tasks: [{status}], targetRoute, createdAt, prdText (앞 80자), playgroundId }`;

/**
 * @param {string} text — 사용자 질문
 * @param {object} ctx — { listJobs, getJob }
 * @returns {Promise<string>}
 */
export async function composeStatusReply(text, ctx) {
  const jobs = (ctx.listJobs?.() ?? [])
    .slice()
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
    .slice(0, 20)
    .map((j) => ({
      id: j.id,
      status: j.status,
      tasks: (j.tasks ?? []).map((t) => ({ status: t.status })),
      targetRoute: j.targetRoute || null,
      createdAt: j.createdAt || null,
      prdText: (j.prdText || '').slice(0, 80),
      playgroundId: j.playgroundId || null,
    }));
  if (jobs.length === 0) {
    return '🤔 아직 잡이 하나도 없어요. PRD 한 줄과 함께 멘션해 주시면 작업을 시작할게요.';
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  const userMessage =
    `잡 데이터 (createdAt 내림차순, 최대 20개):\n${JSON.stringify(jobs, null, 2)}\n\n사용자 질문: ${text}`;
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: STATUS_MODEL,
      max_tokens: 600,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    }),
  });
  if (!resp.ok) {
    // status 답변 실패 시 templated 폴백 — 사용자가 빈 화면 보지 않게.
    const text = await resp.text().catch(() => '');
    console.warn(`[molly-status] http ${resp.status}: ${text.slice(0, 120)} — templated fallback`);
    return templatedFallback(jobs);
  }
  const data = await resp.json();
  const content = data?.content?.[0]?.text ?? '';
  return content.trim() || templatedFallback(jobs);
}

function templatedFallback(jobs) {
  const TERMINAL = new Set(['complete', 'cancelled']);
  const active = jobs.filter((j) => !TERMINAL.has(j.status));
  const recentDone = jobs.filter((j) => TERMINAL.has(j.status)).slice(0, 3);
  const lines = [];
  if (active.length > 0) {
    lines.push(`🛠️ 진행 중인 잡 ${active.length}개`);
    for (const j of active) {
      const reviewed = j.tasks.filter((t) => t.status === 'reviewed').length;
      lines.push(`• \`${j.id.slice(0, 8)}\` (${j.status}) — ${reviewed}/${j.tasks.length}${j.targetRoute ? ` · ${j.targetRoute}` : ''}`);
    }
  }
  if (recentDone.length > 0) {
    if (lines.length) lines.push('');
    lines.push(`📜 최근 완료`);
    for (const j of recentDone) {
      const verdict = j.status === 'complete' ? '✅' : '❌';
      lines.push(`• \`${j.id.slice(0, 8)}\` ${verdict} ${j.status}`);
    }
  }
  lines.push('');
  lines.push('자세한 건 Inspect Console (http://localhost:4174) 의 Jobs 탭에서.');
  return lines.join('\n');
}
```

### Step 1.4: server.js 신규 엔드포인트

- [ ] **`POST /api/molly/respond` 라우터 추가**

`server.js` 의 `/api/chat` 핸들러 직후에 추가 (line ~2480 근처):

```js
  // molly chat mode — classifier 후 분기. 코드 변경 요청이면 잡 생성을
  // 호출자가 알아서 (jobId 반환은 안 함 — surface 가 createJob/decompose
  // 직접 부름. 이 엔드포인트는 분류 + chat/status 응답만 책임).
  if (pathname === '/api/molly/respond' && req.method === 'POST') {
    try {
      const { classifyMollyText } = await import('./lib/molly-classifier.js');
      const { composeChatReply } = await import('./lib/molly-chat.js');
      const { composeStatusReply } = await import('./lib/molly-status.js');
      const payload = await parseBody(req);
      const text = String(payload?.text ?? '').trim();
      if (!text) return json(res, 400, { ok: false, error: 'text required' });
      const ctx = {
        surface: payload?.surface || 'unknown',
        recentMessages: Array.isArray(payload?.recentMessages) ? payload.recentMessages : [],
      };
      const { kind, reason } = await classifyMollyText(text, ctx);
      if (kind === 'chat') {
        const response = await composeChatReply(text, ctx);
        return json(res, 200, { ok: true, kind, reason, response });
      }
      if (kind === 'status_query') {
        const response = await composeStatusReply(text, { listJobs, getJob });
        return json(res, 200, { ok: true, kind, reason, response });
      }
      // code_change — surface 가 직접 createJob 호출하라고 알려줌.
      // (server 가 잡까지 만들어버리면 surface-specific context — slack
      // thread, playgroundId 결정 — 가 결합돼서 책임 모호해짐.)
      return json(res, 200, { ok: true, kind, reason });
    } catch (err) {
      return json(res, 500, { ok: false, error: err?.message ?? String(err) });
    }
  }
```

### Step 1.5: 검증

- [ ] **`node --check orchestrator/server.js` syntax 확인**
- [ ] **orchestrator 재시작** (사용자에게 안내)
- [ ] **3 케이스 curl 검증**

```bash
# code_change
curl -s -X POST http://localhost:3847/api/molly/respond \
  -H 'content-type: application/json' \
  -d '{"text":"TAS 사이드바에 도움말 메뉴 추가","surface":"slack"}' | head -c 400

# chat
curl -s -X POST http://localhost:3847/api/molly/respond \
  -H 'content-type: application/json' \
  -d '{"text":"안녕","surface":"slack"}' | head -c 400

# status_query
curl -s -X POST http://localhost:3847/api/molly/respond \
  -H 'content-type: application/json' \
  -d '{"text":"지금 잡 어디까지 됐어?","surface":"slack"}' | head -c 400
```

Expected:
- 1번: `{"ok":true,"kind":"code_change","reason":"..."}` (response 필드 없음)
- 2번: `{"ok":true,"kind":"chat","reason":"...","response":"..."}`
- 3번: `{"ok":true,"kind":"status_query","reason":"...","response":"🛠️ ..."}` (또는 잡 없으면 안내)

### Step 1.6: Commit

```bash
git add orchestrator/lib/molly-classifier.js orchestrator/lib/molly-chat.js orchestrator/lib/molly-status.js orchestrator/server.js
git commit -m "$(cat <<'EOF'
feat(orchestrator): /api/molly/respond — classifier + chat/status reply libs

molly 가 받은 텍스트를 무조건 Job 생성으로 처리하지 않도록 분류 게이트
도입. 분류기 (Haiku, JSON 응답) 가 code_change / chat / status_query 셋
중 하나로 라벨링.
- chat → Sonnet 한 번 호출, 친근한 한국어 답변
- status_query → listJobs templated 응답 (active + recent done)
- code_change → kind 만 반환 (surface 가 직접 createJob 호출)

다음 commit 들에서 Slack handleMention + Chrome ext performSubmit 가
이 엔드포인트로 우회.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Slack 통합 (`handleMention`)

**Files:**
- Modify: `orchestrator/lib/molly.js` (`handleMention` 함수 ~line 324)

molly 의 handleMention 은 server 와 같은 process 라 import 직접 가능. HTTP 우회 안 해도 됨 (성능/통신 비용 절감).

### Step 2.1: import + 분기

- [ ] **handleMention 의 createJob 직전에 분류 호출**

기존 코드 (대략):
```js
async function handleMention({ event, client, say, logger }, allowedChannel) {
  // ... (channel guard, mention strip, eyes 반응, defaultPlaygroundId 가드)
  const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  const threadTs = event.thread_ts ?? event.ts;
  // ...
  if (!text) {
    await say({...});
    return;
  }
  // ... defaultPlaygroundId 가드 ...
  // Create job + kick decomposer.
  let job;
  try {
    job = opts.createJob({...});
  } ...
```

수정:
```js
async function handleMention({ event, client, say, logger }, allowedChannel) {
  // ... (channel guard, mention strip, eyes 반응)
  const text = event.text.replace(/<@[A-Z0-9]+>/g, '').trim();
  const threadTs = event.thread_ts ?? event.ts;
  // ...
  if (!text) {
    await say({...});
    return;
  }

  // 분류 게이트 — text 가 코드 변경 요청이 아닐 수 있으니 먼저 분류.
  // chat / status_query 는 thread reply 만 하고 끝.
  // 분류 실패 시 폴백은 'chat' (잡 안 만드는 게 안전 — 사용자가 다시
  // 명시적으로 PRD 보내면 그때 진행).
  let cls;
  try {
    const { classifyMollyText } = await import('./molly-classifier.js');
    cls = await classifyMollyText(text, { surface: 'slack' });
  } catch (err) {
    logger.warn(`[molly] classifier failed, falling back to chat: ${err.message}`);
    cls = { kind: 'chat', reason: 'classifier failed' };
  }

  if (cls.kind === 'chat') {
    try {
      const { composeChatReply } = await import('./molly-chat.js');
      const reply = await composeChatReply(text, { surface: 'slack' });
      await say({ thread_ts: threadTs, text: reply });
    } catch (err) {
      await say({
        thread_ts: threadTs,
        text: `⚠️ chat 응답 실패: ${err.message?.slice(0, 200) ?? err}`,
      });
    }
    return;
  }
  if (cls.kind === 'status_query') {
    try {
      const { composeStatusReply } = await import('./molly-status.js');
      const reply = await composeStatusReply(text, {
        listJobs: opts.listJobs,
        getJob: opts.getJob,
      });
      await say({ thread_ts: threadTs, text: reply });
    } catch (err) {
      await say({
        thread_ts: threadTs,
        text: `⚠️ status 응답 실패: ${err.message?.slice(0, 200) ?? err}`,
      });
    }
    return;
  }

  // code_change — 기존 흐름 그대로.
  if (!opts?.defaultPlaygroundId) { ... 기존 ... }
  // ... 기존 createJob + decomposer + plan post ...
}
```

(`defaultPlaygroundId` 가드는 code_change 분기 안으로 이동 — chat/status_query 는 playground 없어도 응답 가능해야 함.)

### Step 2.2: 검증

- [ ] **`node --check orchestrator/lib/molly.js`**
- [ ] **orchestrator 재시작** + Slack 에서 `@molly 안녕` / `@molly 지금 잡 어디까지 됐어?` / `@molly 사이드바에 BETA 라벨 추가` 셋 다 던져 정상 동작 확인 (수동)

### Step 2.3: Commit

```bash
git add orchestrator/lib/molly.js
git commit -m "$(cat <<'EOF'
feat(molly): Slack mention 분류 게이트 — chat/status_query 답변 모드

handleMention 가 사용자 텍스트를 createJob 직전에 classifyMollyText 로
분류. chat/status_query 면 thread reply 만 하고 잡 안 만듦 (코드/QA
파이프라인 통째로 건너뜀). code_change 만 기존 createJob + decomposer
흐름 진행.

defaultPlaygroundId 가드도 code_change 분기 안으로 이동 — chat/status
는 playground 없어도 응답.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Chrome ext 통합 (`performSubmit`)

**Files:**
- Modify: `chrome-extension/sidepanel.js` (`performSubmit` ~line 3502)

Chrome ext 는 별도 process 라 HTTP `/api/molly/respond` 로 호출.

### Step 3.1: classifier 우회 + 분기

- [ ] **`performSubmit` 의 가장 첫 단계에 분류 — Job 모드 + stateless 둘 다**

`performSubmit` 의 진입부 (payload 정리 직후, 어떤 흐름으로 가기 전) 에 classifier 호출. Job 모드든 stateless 든 사용자가 "안녕" 입력했으면 둘 다 잡/단발 change-request 안 만들어야 함.

핵심 로직:
```js
async function performSubmit(plan) {
  const payload = plan.payload;
  // ... (기존 ai analysis 처리 등) ...

  // 분류 게이트 — Job 모드든 stateless 든 사용자 입력이 일반 대화일
  // 가능성. classifier 가 chat/status_query 로 분류하면 잡/change-request
  // 안 만들고 답만 surface. classifier 실패 시 안전 폴백 = chat
  // (잡 안 만드는 게 부작용 0).
  const userInput = String(payload.userInput || payload.text || '').trim();
  if (userInput) {
    try {
      const baseUrl = await getServerUrl();
      const r = await fetch(`${baseUrl}/api/molly/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: userInput, surface: 'chrome-ext' }),
      });
      if (r.ok) {
        const data = await r.json();
        const kind = data?.kind;
        if (kind === 'chat' || kind === 'status_query') {
          addMollyChatMessage(data.response || '(빈 응답)', kind);
          return; // 잡/change-request 안 만듦
        }
        // kind === 'code_change' → 기존 흐름 진행
      }
      // r.ok=false 면 fallback: code_change 진행 (사용자 의도 보호)
    } catch (err) {
      console.warn('[molly] classifier fetch failed, falling back to code_change:', err.message);
    }
  }

  // 기존 흐름 — code_change 또는 stateless
  // ... chrome.runtime.sendMessage(...) 등 ...
}
```

**fallback 정책 비대칭 메모**: server 의 classifier 자체 fallback 은 chat (안전). 클라이언트가 classifier 호출 자체에 실패 (네트워크 등) 했을 때는 사용자 의도 보호 위해 code_change 폴백 — 사용자가 PRD 던졌는데 네트워크 에러로 chat 응답 받으면 더 이상함.

### Step 3.2: `addMollyChatMessage` 헬퍼

- [ ] **사이드패널 chat 에 molly 답변 카드 add**

기존 `addSystemMessage` 와 비슷하지만 molly 페르소나용 별도 스타일:

```js
  /**
   * Phase 2 follow-up: molly chat 모드 응답 카드. text 또는 status
   * templated 응답을 사용자에게 보여줌. progress card 와 다르게
   * lifecycle 없음 — pure 답변.
   */
  function addMollyChatMessage(text, kind) {
    removeWelcome();
    const wrap = document.createElement('div');
    wrap.className = 'msg msg-system';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble molly-chat-card';
    const header = document.createElement('div');
    header.className = 'molly-chat-header';
    header.textContent = kind === 'status_query' ? '📊 molly status' : '💬 molly';
    const body = document.createElement('div');
    body.className = 'molly-chat-body';
    // text 는 server 가 신뢰 — 다만 textContent 로 안전하게.
    body.textContent = text;
    bubble.appendChild(header);
    bubble.appendChild(body);
    wrap.appendChild(bubble);
    messagesEl.appendChild(wrap);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }
```

### Step 3.3: CSS

- [ ] **`chrome-extension/sidepanel.css` 끝에 append**

```css
.molly-chat-card .molly-chat-header {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-tertiary);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.molly-chat-card .molly-chat-body {
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  color: var(--text-primary);
}
```

### Step 3.4: 검증

- [ ] **`node --check chrome-extension/sidepanel.js`**
- [ ] **Chrome ext reload + 사이드패널에 "안녕" / "지금 잡 어떻게 됐어?" 던져 응답 카드 확인** (수동)

### Step 3.5: Commit

```bash
git add chrome-extension/sidepanel.js chrome-extension/sidepanel.css
git commit -m "$(cat <<'EOF'
feat(chrome-ext): molly chat mode — classifier 우회 + 답변 카드

사이드패널 performSubmit 가 Job 모드 진입 직전에 /api/molly/respond
호출. chat/status_query 분류 시 잡 안 만들고 답변 카드 노출. code_change
면 기존 Job pipeline 흐름 그대로.

Slack 의 handleMention 분류 게이트와 같은 정책 — molly 가 세 surface
에서 일관되게 동작.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Playground 통합 (chat 패널)

**Files:**
- Modify: `playground-app/src/services/orchestrator-client.ts` — chat submit wrapper
- Modify: `playground-app/src/editor/AIPanel.tsx` (또는 chat 패널 호출처) — molly 답변 메시지 surface

Playground 의 chat 패널은 이미 `/api/chat` (Canvas AI Wizard) 와 multi-turn 대화 중. molly classifier 는 **첫 사용자 메시지에서만** 거치고, 후속 turn (Wizard 의 clarification 답변) 은 그대로 Wizard 로 통과 — multi-turn 보호.

### Step 4.1: orchestrator-client.ts 의 chat wrapper

- [ ] **새 함수 `mollyClassifyAndDispatch` 추가**

`postChat` (현 `/api/chat` 호출) 직전에 호출되는 helper. 첫 user message 만 분류, 후속은 통과.

```ts
// playground-app/src/services/orchestrator-client.ts (postChat 근처)

export interface MollyDispatchResult {
  kind: 'chat' | 'status_query' | 'code_change';
  response?: string; // chat / status_query 일 때만
  reason: string;
}

/**
 * 첫 사용자 메시지를 molly classifier 로 분류. code_change 면 호출자가
 * 기존 Wizard 흐름 (postChat) 으로 진행. chat / status_query 면 response
 * 를 사용자에게 surface 하고 Wizard 진입 안 함.
 */
export async function mollyClassifyAndDispatch(
  text: string,
  isFirstMessage: boolean,
): Promise<MollyDispatchResult | null> {
  if (!isFirstMessage) return null; // multi-turn 보호 — 후속 turn 은 Wizard 로
  try {
    const resp = await fetch(`${ORCHESTRATOR_URL}/api/molly/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, surface: 'playground' }),
    });
    if (!resp.ok) return null; // 실패 시 호출자가 기존 흐름 진행
    const data = await resp.json();
    return {
      kind: data?.kind ?? 'code_change',
      response: data?.response,
      reason: data?.reason ?? '',
    };
  } catch {
    return null;
  }
}
```

### Step 4.2: AIPanel chat submit 처리

- [ ] **chat panel 의 submit 핸들러 (AIPanel.tsx 또는 chat 호출처) 수정**

기존 흐름 (대략):
```ts
async function handleSendMessage(text: string) {
  // append user message to local chat
  // call postChat with full message history
  // append assistant reply
  // if reply is plan JSON → emit plan / create job
}
```

수정:
```ts
async function handleSendMessage(text: string) {
  appendUserMessage(text);
  const isFirst = currentMessages.filter(m => m.role === 'user').length === 1; // 방금 append 한 메시지가 첫 user
  const dispatch = await mollyClassifyAndDispatch(text, isFirst);
  if (dispatch && (dispatch.kind === 'chat' || dispatch.kind === 'status_query')) {
    // molly 가 직접 답변 — Wizard 진입 안 함
    appendAssistantMessage({
      content: dispatch.response ?? '(빈 응답)',
      mollyKind: dispatch.kind, // optional metadata for styling
    });
    return;
  }
  // code_change 또는 dispatch null (실패) → 기존 Wizard 흐름
  const reply = await postChat(currentMessages);
  appendAssistantMessage(reply);
  // ... 기존 plan emit / createJob ...
}
```

(실제 호출처 위치는 explorer 단계에서 확정 — `playground-app/src/services/orchestrator-client.ts:215` 의 `postChat` 사용자 위치 grep 으로 찾기.)

### Step 4.3: molly 답변 styling (선택)

- [ ] **molly chat / status_query 메시지에 별도 인디케이터 (예: "💬 molly")**

```ts
// AIPanel 의 ChatMessage 렌더링 안
{message.mollyKind && (
  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginRight: 4 }}>
    {message.mollyKind === 'status_query' ? '📊 molly status' : '💬 molly'}
  </span>
)}
{message.content}
```

(스킵 가능 — content 만으로도 사용자가 무엇인지 알 수 있음. v0 에서는 styling 미적용 OK.)

### Step 4.4: 검증

- [ ] **`pnpm --filter playground-app exec tsc --noEmit` syntax check**
- [ ] **Playground 띄우고 chat 패널에서 "안녕" / "지금 잡 어디까지 됐어?" / 실제 PRD 셋 다 던져 검증** (수동, Step 5 와 합쳐서)

### Step 4.5: Commit

```bash
git add playground-app/src/services/orchestrator-client.ts playground-app/src/editor/AIPanel.tsx
git commit -m "$(cat <<'EOF'
feat(playground): molly chat mode — classifier wraps Wizard chat panel

playground-app 의 chat 패널 첫 사용자 메시지를 /api/molly/respond 로
분류. chat/status_query 면 Wizard 진입 안 하고 답만 surface. code_change
면 기존 /api/chat (Canvas AI Wizard) 흐름 그대로. 후속 turn (Wizard
clarification 답변) 은 multi-turn 보호 위해 분류 안 거침.

이로써 molly 가 세 surface (Slack/Chrome ext/Playground) 에서 정확히
같은 정책 — "코드 작업 외 모든 입력은 답변으로".

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Manual E2E + handoff/memory

### Step 5.1: 9 케이스 매뉴얼 검증

- [ ] **Slack chat**: `@molly 안녕` → 친근한 답변 1개, 잡 X
- [ ] **Slack status**: `@molly 지금 잡 어디까지 됐어?` → LLM-generated 답변
- [ ] **Slack code_change**: `@molly TAS 사이드바에 도움말 메뉴 추가` → 기존 plan card flow
- [ ] **Chrome ext chat**: 사이드패널에 "안녕" → 답변 카드, 잡 X
- [ ] **Chrome ext status**: "활성 잡 몇 개?" → 잡 목록 카드
- [ ] **Chrome ext code_change**: PRD-like 텍스트 → 기존 Job pipeline
- [ ] **Playground chat**: 채팅창에 "molly 가 뭐야?" → molly 답변, Wizard 진입 X
- [ ] **Playground status**: "어제 만든 거 어떻게 됐어?" → LLM-generated 잡 요약
- [ ] **Playground code_change**: PRD 던짐 → Wizard 의 기존 plan emit + createJob 흐름

추가 회귀:
- [ ] **Playground multi-turn Wizard**: 첫 PRD 후 Wizard clarification 답변 → 분류 안 거치고 Wizard 그대로 진행 (multi-turn 보호 검증)

### Step 5.2: handoff 작성

- [ ] **`docs/superpowers/handoffs/2026-04-30-molly-chat-mode.md`**
  - 5 commits 정리
  - 알려진 한계: classifier misfire (애매 → chat 폴백 정책)
  - JSON parse 실패 시 chat 폴백
  - 다음 슬라이스 후보: GitHub/Drive 외부 도구 통합, multi-turn molly chat (현재는 1-turn), molly 가 잡 cancel 같은 액션도 자연어로 받기

### Step 5.3: memory 갱신

- [ ] **`project_canvas_app.md` 의 "What ships next session" 섹션 업데이트** — molly chat mode ✅ (3 surface 통합).

---

## Self-Review

- [x] Spec coverage: handoff 의 후보 2 (molly chat mode) — classifier + chat + status_query + 세 surface 통합 (Slack + Chrome ext + Playground 모두 포함).
- [x] Placeholder scan: 없음. 모든 코드/엔드포인트/test curl 명시.
- [x] Type consistency: `classifyMollyText`, `composeChatReply`, `composeStatusReply`, `addMollyChatMessage`, `mollyClassifyAndDispatch` 이름 모든 task 에서 일관.
- [x] Endpoint 검증: `/api/molly/respond` 신규. 기존 `/api/chat` (Canvas AI Wizard) 와 공존 — Playground 는 첫 메시지만 분류, 후속 turn 은 Wizard 그대로.
- [x] Fallback 정책: server-side classifier 자체 실패 → chat (안전). Slack handleMention classifier 호출 실패 → chat. Chrome ext / Playground client classifier fetch 실패 → code_change (사용자 의도 보호 — 비대칭 의도적).
- [x] JSON parse 견고성: brace counting 으로 reason 안의 `}` 안전 처리, 모든 실패 path 가 chat 폴백.
- [x] DRY: 세 surface 가 각자 다른 entry point — Slack in-process import, Chrome ext HTTP, Playground HTTP wrapper. Lib (`molly-classifier.js` 등) 가 single source.

## 예상 시간

- Task 1 (server libs + endpoint): ~1.0~1.5h
- Task 2 (Slack handleMention): ~0.5h
- Task 3 (Chrome ext performSubmit): ~0.5~1.0h
- Task 4 (Playground chat panel wrapper): ~1.0~1.5h
- Task 5 (검증 + handoff): ~0.5h
- **합계**: ~3.5~5.0h. handoff 의 ~2-3h 추정 + Playground 포함으로 +1~2h.

## 주의사항

1. **Classifier 모델 비용/지연**: Haiku 4.5 는 ~50ms~200ms. 사용자 입력마다 LLM 호출 — 비용 무시 가능. status reply 도 Haiku 한 번 더 — 총 ~150~400ms. 필요하면 짧은 텍스트 (≤5자) 는 LLM 안 부르고 chat 로 룰베이스 처리 (v0 외).
2. **Fallback 비대칭**: server-side 폴백 = chat (안전 우선). client-side fetch 실패 폴백 = code_change (사용자가 PRD 던졌는데 네트워크 에러로 chat 응답 받으면 더 이상함 — 의도 보호 우선). 두 정책이 다른 이유 명시 — 헷갈리지 말 것.
3. **Playground multi-turn 보호**: Wizard 의 clarification 답변 (첫 user 메시지가 아닌 후속) 은 분류 안 거침. `mollyClassifyAndDispatch` 의 `isFirstMessage` 가드 필수.
4. **`@anthropic-ai/sdk` 사용 안 함**: 기존 코드처럼 `fetch('https://api.anthropic.com/v1/messages')` 직접 사용 — orchestrator 가 SDK 의존성 없음. 같은 패턴 통일.
5. **Playground AIPanel.tsx 정확한 chat 호출처는 explorer 단계에서 확정** — `postChat` 호출 위치 grep 으로 찾을 것 (Plan 의 Task 4.2 코드는 패턴 가이드, 실제 변경 시 위치 매칭 필수).
