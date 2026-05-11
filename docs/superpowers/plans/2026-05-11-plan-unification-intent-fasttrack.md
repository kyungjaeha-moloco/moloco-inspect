# Plan 통일 + Intent 기반 fast-track — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 3 surface (Playground/Slack/Chrome ext) 가 일관되게 plan_items 카드를 노출하고, 단순 intent (copy_update / spacing / token 등) 는 decomposer skip 로 fast-track. Job tasks 카드는 진행 상황 표시용 (승인 X, 취소만).

**Architecture:** plan-emitter 의 `intent` 필드를 fast-track 판단에 활용. `intent ∈ FAST_TRACK_INTENTS` 면 decomposer skip, agent 가 plan_items 직접 받아 코딩. 그 외는 기존 decomposer 흐름이되 자동 승인. Slack/Chrome ext 는 plan_items 카드를 신설.

**Tech Stack:** Node.js (orchestrator), React (Playground), Slack Bolt SDK, vanilla JS (Chrome ext sidepanel)

---

## 범위

### Fast-track intent 목록
다음 intent 는 plan_items 단계만 거치고 decomposer skip:
- `copy_update`
- `spacing_adjustment`
- `token_alignment`
- `accessibility_improvement`
- `state_handling`

나머지 intent 는 full path (decomposer 실행, 단 사용자 승인 없이 자동):
- `component_swap` / `layout_adjustment` / `new_page` / `new_feature` / `data_display_change` / `form_field_addition` / `bulk_operation`

### UX 흐름

```
사용자 PRD
  ↓
plan-emitter → { intent, plan_items, ... }
  ↓
[모든 surface] Plan 카드 노출:
  - 제목 + intent 배지 + plan_items 목록
  - 버튼: [취소] [✏️ 다시 계획] [실행하기]
  - fast-track 인 경우 헤더에 "빠른 실행" 배지 표시 (decomposer skip 안내)
  ↓ 사용자 실행하기
  ↓
[Backend] createJob({ autoApprove: true, skipDecomposer: isFastTrack })
  ├─ fast-track: decomposer 건너뛰고 agent 가 plan_items 받아 직접 코딩
  └─ full path: decomposer 실행 → job tasks → agent (사용자 승인 없이 자동 진행)
  ↓
[Slack/Chrome ext] Job tasks 진행 카드 (full path 만):
  - 헤더 "진행 상황" + 각 task 의 진행 상태 (대기/진행 중/완료)
  - 버튼: [취소] 만 (승인 X)
  - fast-track 의 경우 이 카드 skip — execution card 만 표시
  ↓
agent 코드 작성 → preview
```

## 파일 변경

| 파일 | 변경 |
|---|---|
| `orchestrator/lib/molly-plan-emitter.js` | 변경 없음 (이미 intent emit) |
| `orchestrator/lib/molly.js` | `kind === 'plan_emit'` 분기 추가 — `postPlanItemsMessage` 호출. 기존 `code_change_clear` 흐름은 fallback 으로 유지. plan 승인 action handler 추가. |
| `orchestrator/lib/molly-intake.js` | 변경 없음 (이미 plan_emit kind 반환) |
| `orchestrator/server.js` | `createJob` (또는 동등) 에 `autoApprove` + `skipDecomposer` flag 추가. Job lifecycle 에 두 옵션 반영. |
| `orchestrator/lib/job.js` | autoApprove → 'awaiting_approval' phase skip. skipDecomposer → 'decomposing' phase skip, plan_items 그대로 task 로 매핑. |
| `playground-app/src/editor/AIPanel.tsx` | (a) `intent` 가 fast-track 인 경우 plan 카드 헤더에 "빠른 실행" 배지 표시. (b) executePlan 에 autoApprove + skipDecomposer 플래그 전달. |
| `chrome-extension/sidepanel.js` | (a) 신규 `addPlanItemsCard(planResp)` — plan_items 카드 (취소/다시 계획/실행하기). (b) 기존 `addPlanApprovalCard` 의 [승인] 버튼 제거, [취소] 만 유지. |
| Slack message 신규 builder | `buildPlanItemsBlocks(plan)` — Slack Block Kit plan_items 카드 |

## Tasks

### Task 1: Backend — fast-track 판정 helper

**Files:**
- Create: `orchestrator/lib/plan-intent.js`

- [ ] **Step 1: 생성**

```javascript
// orchestrator/lib/plan-intent.js
// plan-emitter intent → fast-track 분기 판정. agent 가 plan_items 만 받아
// 바로 코딩 가능한 단순 변경 ↔ decomposer 가 필요한 복잡 변경.

export const FAST_TRACK_INTENTS = new Set([
  'copy_update',
  'spacing_adjustment',
  'token_alignment',
  'accessibility_improvement',
  'state_handling',
]);

export function isFastTrackIntent(intent) {
  return typeof intent === 'string' && FAST_TRACK_INTENTS.has(intent);
}
```

- [ ] **Step 2: node check**

```bash
node --check orchestrator/lib/plan-intent.js
```

Expected: exit 0.

- [ ] **Step 3: commit**

```bash
git add orchestrator/lib/plan-intent.js
git commit -m "feat(plan): fast-track intent 판정 helper"
```

### Task 2: Job lifecycle — autoApprove / skipDecomposer 옵션

**Files:**
- Modify: `orchestrator/lib/job.js` (또는 job 생성/실행 코드 위치) — `createJob` signature 확장.

- [ ] **Step 1: 위치 파악**

```bash
grep -n "function createJob\|export.*createJob\|awaiting_approval\|decomposing" orchestrator/lib/job.js orchestrator/server.js
```

Expected: createJob 함수 정의 + phase 전환 지점 출력.

- [ ] **Step 2: createJob 옵션 추가**

createJob 의 옵션 object 에 `autoApprove?: boolean` + `skipDecomposer?: boolean` 추가. 기존 호출자는 둘 다 undefined → 기존 동작 그대로. 코드:

```javascript
// createJob (예시 — 실제 시그니처는 코드 보고 맞춰서 추가)
function createJob({ prdText, planItems, autoApprove = false, skipDecomposer = false, ... }) {
  const job = {
    id: nextJobId(),
    status: 'created',
    prdText,
    planItems,
    autoApprove,
    skipDecomposer,
    tasks: skipDecomposer ? planItemsToTasks(planItems) : [],
    // ... 기존 필드
  };
  return job;
}

// planItemsToTasks — fast-track 시 plan_items 를 그대로 task array 로 매핑.
function planItemsToTasks(planItems) {
  return (planItems || []).filter((p) => p.enabled !== false).map((p, i) => ({
    id: p.id ?? `task-${i + 1}`,
    title: p.title,
    description: p.description ?? '',
    targetFile: p.target_file ?? null,
    patternId: p.pattern_id ?? null,
    status: 'pending',
  }));
}
```

- [ ] **Step 3: Job runner 의 awaiting_approval / decomposing phase 분기 추가**

Job runner (job lifecycle 진행 코드 — pickNextTask / advanceJobStatus 부근) 에서:
- `job.autoApprove === true` → 'awaiting_approval' phase skip (바로 'planning' 또는 'agent' 로)
- `job.skipDecomposer === true` → 'decomposing' phase skip (이미 tasks 채워져 있음)

코드 예시:

```javascript
// awaiting_approval 전환 시점
if (job.status === 'awaiting_approval') {
  if (job.autoApprove) {
    setJobStatus(job.id, 'approved', { approvedAt: Date.now(), approver: 'auto' });
  }
}

// decomposing 전환 시점
if (job.status === 'decomposing') {
  if (job.skipDecomposer && job.tasks?.length > 0) {
    setJobStatus(job.id, 'delegating'); // 다음 phase 로 바로
  }
}
```

- [ ] **Step 4: node check + smoke test**

```bash
node --check orchestrator/lib/job.js orchestrator/server.js
```

Expected: exit 0.

Manual smoke: `POST /api/job` 에 `autoApprove:true skipDecomposer:true` 보내 job 생성 후 polling 으로 phase 전환 관찰 — 'awaiting_approval' / 'decomposing' 없이 'delegating' 으로 직행 확인.

- [ ] **Step 5: commit**

```bash
git add orchestrator/lib/job.js orchestrator/server.js
git commit -m "feat(job): autoApprove + skipDecomposer 옵션 — fast-track 흐름 backend"
```

### Task 3: Slack — plan_items 카드 + handler

**Files:**
- Modify: `orchestrator/lib/molly.js` — `handleMention` 분기 + 신규 builder + 신규 action handler.

- [ ] **Step 1: handleMention 에 plan_emit 분기 추가**

`molly.js:530` 부근의 `// result.kind === 'code_change_clear'` 직전에 새 분기:

```javascript
if (result.kind === 'plan_emit') {
  if (thinkingTs) {
    try { await client.chat.delete({ channel: event.channel, ts: thinkingTs }); } catch {}
  }
  const { isFastTrackIntent } = await import('./plan-intent.js');
  const isFastTrack = isFastTrackIntent(result.plan?.intent);
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
```

- [ ] **Step 2: postPlanItemsMessage builder 추가**

molly.js 의 postPlanMessage 근처에 추가:

```javascript
async function postPlanItemsMessage({ client, channel, threadTs, plan, cumulativePrd, isFastTrack }) {
  const blocks = buildPlanItemsBlocks(plan, isFastTrack);
  const result = await client.chat.postMessage({
    channel,
    thread_ts: threadTs,
    text: `📋 Plan (${(plan.plan_items || []).length} items)`,
    blocks,
  });
  // plan items message ts → state 저장 (다시 계획 / 실행하기 / 취소 action 에서 lookup)
  if (result?.ts) {
    rememberPlanItemsContext(channel, threadTs, result.ts, { plan, cumulativePrd, isFastTrack });
  }
}

const planItemsContexts = new Map(); // key=`${channel}:${threadTs}:${msgTs}` → { plan, cumulativePrd, isFastTrack, expireAt }

function rememberPlanItemsContext(channel, threadTs, msgTs, ctx) {
  const key = `${channel}:${threadTs}:${msgTs}`;
  planItemsContexts.set(key, { ...ctx, expireAt: Date.now() + 30 * 60 * 1000 });
  // 만료 cleanup
  if (planItemsContexts.size > 500) {
    const now = Date.now();
    for (const [k, v] of planItemsContexts) {
      if (v.expireAt <= now) planItemsContexts.delete(k);
    }
  }
}

function getPlanItemsContext(channel, threadTs, msgTs) {
  const v = planItemsContexts.get(`${channel}:${threadTs}:${msgTs}`);
  if (!v || v.expireAt <= Date.now()) return null;
  return v;
}
```

- [ ] **Step 3: buildPlanItemsBlocks 추가**

```javascript
function buildPlanItemsBlocks(plan, isFastTrack) {
  const items = plan.plan_items || [];
  const headerText = isFastTrack
    ? `📋 Plan (${items.length} items) — ⚡ 빠른 실행`
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
    const desc = p.description ? `\n${toSlackMrkdwn(trunc(p.description, 1000))}` : '';
    const file = p.target_file ? `\n_${p.target_file}_` : '';
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*${i + 1}. ${toSlackMrkdwn(p.title || '(no title)')}*${desc}${file}` },
    });
  });
  blocks.push({
    type: 'actions',
    elements: [
      { type: 'button', action_id: 'molly_planitems_cancel', text: { type: 'plain_text', text: '취소' }, style: 'danger' },
      { type: 'button', action_id: 'molly_planitems_redecompose', text: { type: 'plain_text', text: '✏️ 다시 계획' } },
      { type: 'button', action_id: 'molly_planitems_approve', text: { type: 'plain_text', text: '실행하기 →' }, style: 'primary' },
    ],
  });
  return blocks;
}
```

- [ ] **Step 4: 3 action handler 등록 (startMolly 안)**

```javascript
appInstance.action('molly_planitems_approve', async (ctx) => {
  await ctx.ack();
  try {
    const { channel, message } = ctx.body;
    const threadTs = message.thread_ts ?? message.ts;
    const planCtx = getPlanItemsContext(channel.id, threadTs, message.ts);
    if (!planCtx) {
      await ctx.respond({ text: '⏱️ 플랜 컨텍스트가 만료되었습니다. 다시 멘션해 주세요.', replace_original: false });
      return;
    }
    // 카드 disable
    await ctx.client.chat.update({
      channel: channel.id,
      ts: message.ts,
      text: '계획 승인 — 실행 중…',
      blocks: stampApprovedBlocks(message.blocks, ctx.body.user.id),
    });
    // createJob with autoApprove + (fast-track 시) skipDecomposer
    await opts.createJob({
      prdText: planCtx.cumulativePrd,
      planItems: planCtx.plan.plan_items,
      autoApprove: true,
      skipDecomposer: planCtx.isFastTrack,
      slackContext: { channel: channel.id, threadTs },
    });
  } catch (err) {
    ctx.logger.error(`[molly] planitems_approve crashed: ${err?.stack ?? err}`);
  }
});

appInstance.action('molly_planitems_redecompose', async (ctx) => {
  await ctx.ack();
  try {
    // 모달 열기 (기존 redecompose 패턴 카피)
    await openPlanItemsRedecomposeModal(ctx);
  } catch (err) {
    ctx.logger.error(`[molly] planitems_redecompose crashed: ${err?.stack ?? err}`);
  }
});

appInstance.action('molly_planitems_cancel', async (ctx) => {
  await ctx.ack();
  try {
    const { channel, message } = ctx.body;
    await ctx.client.chat.update({
      channel: channel.id,
      ts: message.ts,
      text: '계획 취소됨',
      blocks: stampCancelledBlocks(message.blocks, ctx.body.user.id),
    });
  } catch (err) {
    ctx.logger.error(`[molly] planitems_cancel crashed: ${err?.stack ?? err}`);
  }
});
```

`openPlanItemsRedecomposeModal` 은 기존 `handleRedecomposeOpen` 패턴 카피 — feedback textarea 모달. submit 시:

```javascript
appInstance.view('molly_planitems_redecompose_submit', async (ctx) => {
  await ctx.ack();
  try {
    const meta = JSON.parse(ctx.view.private_metadata); // { channel, threadTs, msgTs }
    const feedback = ctx.view.state.values.feedback_input.feedback.value?.trim();
    if (!feedback) return;
    const planCtx = getPlanItemsContext(meta.channel, meta.threadTs, meta.msgTs);
    if (!planCtx) return;
    // /api/plan 재호출 (previousPlan + feedback)
    const newPlan = await callEmitPlanWithFeedback(planCtx.plan, planCtx.cumulativePrd, feedback);
    rememberPlanItemsContext(meta.channel, meta.threadTs, meta.msgTs, {
      ...planCtx,
      plan: newPlan,
      isFastTrack: isFastTrackIntent(newPlan.intent),
    });
    // 카드 update
    const newBlocks = buildPlanItemsBlocks(newPlan, isFastTrackIntent(newPlan.intent));
    await ctx.client.chat.update({
      channel: meta.channel,
      ts: meta.msgTs,
      text: `📋 Plan (${(newPlan.plan_items || []).length} items)`,
      blocks: newBlocks,
    });
  } catch (err) {
    ctx.logger.error(`[molly] planitems_redecompose_submit crashed: ${err?.stack ?? err}`);
  }
});

async function callEmitPlanWithFeedback(previousPlan, prdText, feedback) {
  const { emitPlan } = await import('./molly-plan-emitter.js');
  return emitPlan({ goal: prdText, previousPlan, feedback }, mollyCtx);
}
```

`stampApprovedBlocks` / `stampCancelledBlocks` — 기존 동등 헬퍼 패턴 카피 (Slack block 의 actions 를 read-only context 로 치환).

- [ ] **Step 5: node check + commit**

```bash
node --check orchestrator/lib/molly.js
git add orchestrator/lib/molly.js orchestrator/lib/plan-intent.js
git commit -m "feat(molly slack): plan_items 카드 + 3 버튼 (취소/다시 계획/실행하기) + fast-track 배지"
```

Manual smoke: Slack 에서 `@molly 사이드바 정리해줘` → plan_items 카드 뜨고 3 버튼 보임 → 실행하기 → job 자동 실행 (autoApprove) 확인.

### Task 4: Chrome ext — plan_items 카드

**Files:**
- Modify: `chrome-extension/sidepanel.js` — 신규 `addPlanItemsCard`, 기존 `addPlanApprovalCard` 의 [승인] 버튼 제거.

- [ ] **Step 1: addPlanItemsCard 추가**

기존 `addPlanApprovalCard(job)` (line 2456 부근) 위에 plan_items 용 함수 추가. plan 응답 객체 받고 카드 DOM 생성. 버튼 3개 (취소 / 다시 계획 / 실행하기).

```javascript
function addPlanItemsCard(plan, cumulativePrd) {
  const isFastTrack = ['copy_update', 'spacing_adjustment', 'token_alignment', 'accessibility_improvement', 'state_handling'].includes(plan.intent);
  const wrap = document.createElement('div');
  wrap.className = 'msg msg-system';

  const bubble = document.createElement('div');
  bubble.className = 'msg-bubble plan-card';

  const title = document.createElement('div');
  title.className = 'progress-card-title';
  title.textContent = isFastTrack
    ? `📋 Plan (${plan.plan_items.length} items) — ⚡ 빠른 실행`
    : `📋 Plan (${plan.plan_items.length} items)`;
  bubble.appendChild(title);

  if (plan.summary) {
    const summary = document.createElement('div');
    summary.style.fontSize = '12px';
    summary.style.color = 'var(--text-muted, #888)';
    summary.style.marginBottom = '8px';
    summary.textContent = plan.summary;
    bubble.appendChild(summary);
  }

  const ol = document.createElement('ol');
  ol.style.margin = '8px 0';
  ol.style.paddingLeft = '20px';
  ol.style.fontSize = '12px';
  for (const p of plan.plan_items) {
    const li = document.createElement('li');
    li.style.marginBottom = '6px';
    const titleEl = document.createElement('strong');
    titleEl.textContent = p.title || '(no title)';
    li.appendChild(titleEl);
    if (p.description) {
      const desc = document.createElement('div');
      desc.style.color = 'var(--text-muted, #888)';
      desc.style.marginTop = '2px';
      desc.textContent = p.description;
      li.appendChild(desc);
    }
    if (p.target_file) {
      const file = document.createElement('code');
      file.style.fontSize = '10px';
      file.textContent = p.target_file;
      li.appendChild(document.createElement('br'));
      li.appendChild(file);
    }
    ol.appendChild(li);
  }
  bubble.appendChild(ol);

  // 버튼 3개
  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.gap = '6px';
  actions.style.marginTop = '10px';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = '취소';
  cancelBtn.className = 'plan-btn plan-btn-danger';

  const redecBtn = document.createElement('button');
  redecBtn.textContent = '✏️ 다시 계획';
  redecBtn.className = 'plan-btn';

  const approveBtn = document.createElement('button');
  approveBtn.textContent = '실행하기 →';
  approveBtn.className = 'plan-btn plan-btn-primary';

  const lockButtons = (note) => {
    cancelBtn.disabled = true;
    redecBtn.disabled = true;
    approveBtn.disabled = true;
    if (note) {
      const stamp = document.createElement('div');
      stamp.style.marginTop = '6px';
      stamp.style.fontSize = '11px';
      stamp.style.color = 'var(--text-muted, #888)';
      stamp.textContent = note;
      bubble.appendChild(stamp);
    }
  };

  approveBtn.addEventListener('click', async () => {
    lockButtons('✅ 실행 중…');
    const baseUrl = await getServerUrl();
    try {
      await fetch(`${baseUrl}/api/job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prdText: cumulativePrd,
          planItems: plan.plan_items,
          autoApprove: true,
          skipDecomposer: isFastTrack,
        }),
      });
    } catch (err) {
      lockButtons(`❌ 실행 실패: ${err.message}`);
    }
  });

  cancelBtn.addEventListener('click', () => {
    lockButtons('❌ 취소됨');
  });

  redecBtn.addEventListener('click', async () => {
    const feedback = prompt('어떻게 수정할까요? (예: "3번째 항목은 X 대신 Y 로")');
    if (!feedback || !feedback.trim()) return;
    lockButtons('✏️ 재생성 중…');
    const baseUrl = await getServerUrl();
    try {
      const r = await fetch(`${baseUrl}/api/plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: cumulativePrd,
          client: 'tving', // TODO: 실제 컨텍스트
          routeOrPage: '/',
          previousPlan: plan,
          feedback: feedback.trim(),
        }),
      });
      const body = await r.json();
      if (body.ok) {
        wrap.remove();
        addPlanItemsCard(body.plan, cumulativePrd);
      } else {
        lockButtons(`❌ 재생성 실패: ${body.error}`);
      }
    } catch (err) {
      lockButtons(`❌ 재생성 실패: ${err.message}`);
    }
  });

  actions.appendChild(cancelBtn);
  actions.appendChild(redecBtn);
  actions.appendChild(approveBtn);
  bubble.appendChild(actions);
  wrap.appendChild(bubble);

  const list = document.getElementById('msg-list');
  if (list) list.appendChild(wrap);
}
```

- [ ] **Step 2: PRD 제출 flow 변경**

기존: PRD → POST /api/job 직행 → 폴링 → addPlanApprovalCard 표시
새: PRD → POST /api/plan 먼저 → addPlanItemsCard 표시 → 사용자 실행하기 → POST /api/job

```bash
grep -n "POST.*api/job\|api/plan\|sendPrompt" chrome-extension/sidepanel.js | head -10
```

코드 변경 위치 찾아 PRD 제출 부분에 plan 먼저 호출 로직 삽입.

- [ ] **Step 3: 기존 addPlanApprovalCard 의 [승인] 버튼 제거**

line 2540 부근의 approveBtn 정의 + 이벤트 리스너 제거. cancel/redec 만 유지. 헤더 텍스트도 "📋 작업 계획" → "📋 진행 상황" 으로 변경 (Step 4 에서).

- [ ] **Step 4: addPlanApprovalCard 헤더 변경**

```javascript
// line 2467 부근
title.textContent = `📋 진행 상황 (${(job.tasks || []).length} tasks)`;
```

- [ ] **Step 5: 검증 + commit**

```bash
git add chrome-extension/sidepanel.js
git commit -m "feat(chrome-ext): plan_items 카드 추가 + job tasks 카드 read-only 화"
```

Manual smoke: Chrome ext 에서 PRD 입력 → plan_items 카드 뜸 → 실행하기 → job 자동 실행 → progress 카드 (read-only) 표시.

### Task 5: Playground — fast-track 배지 + executePlan 옵션 전달

**Files:**
- Modify: `playground-app/src/editor/AIPanel.tsx`

- [ ] **Step 1: PlanCard 에 fast-track 배지**

PlanCard 렌더링 (line 2616 부근) 헤더 영역에 추가:

```typescript
const FAST_TRACK_INTENTS = new Set([
  'copy_update', 'spacing_adjustment', 'token_alignment',
  'accessibility_improvement', 'state_handling',
]);
// ...
{FAST_TRACK_INTENTS.has(plan.meta.intent) && (
  <Chip label="⚡ 빠른 실행" color="accent" />
)}
```

- [ ] **Step 2: executePlan 에 autoApprove + skipDecomposer 전달**

executePlan 안의 postChangeRequest 호출에 추가. 단, Playground 는 이미 plan_items 노출 + 사용자 승인 단계 있음 → autoApprove 는 항상 true. skipDecomposer 는 intent 기반:

```typescript
const isFastTrack = FAST_TRACK_INTENTS.has(plan.meta.intent);
const ack = await postChangeRequest({
  userPrompt,
  // ...
  autoApprove: true,
  skipDecomposer: isFastTrack,
});
```

postChangeRequest 시그니처 + 백엔드 /api/change-request 도 두 옵션 받도록 갱신 (Task 2 의 createJob 와 동일 의미).

- [ ] **Step 3: 검증**

```bash
cd /Users/kyungjae.ha/Documents/moloco-inspect/playground-app && pnpm tsc --noEmit
```

Expected: 통과.

- [ ] **Step 4: commit**

```bash
git add playground-app/src/editor/AIPanel.tsx playground-app/src/services/orchestrator-client.ts
git commit -m "feat(playground): plan 카드에 fast-track 배지 + skipDecomposer 전달"
```

## 검증 (수동)

1. **Fast-track 흐름** — Playground / Slack / Chrome ext 각각에서:
   - PRD: "버튼 라벨 X 에서 Y 로 바꿔줘" (intent=copy_update)
   - Plan 카드에 ⚡ 빠른 실행 배지 확인
   - 실행하기 → decomposer skip, agent 가 plan_items 보고 바로 코딩
   - Job tasks 카드는 안 보이거나 progress 만 (Slack/Chrome ext)

2. **Full path 흐름** — 각각에서:
   - PRD: "새 페이지 만들어줘" (intent=new_page)
   - Plan 카드에 fast-track 배지 없음
   - 실행하기 → decomposer 실행 → progress 카드 (read-only) → agent 코딩

3. **다시 계획** — Slack/Chrome ext 에서:
   - Plan 카드의 ✏️ 다시 계획 → feedback 입력 → 카드 update → 새 plan 표시

4. **취소** — 각 surface 에서 plan 카드의 취소 → 카드 disable, job 안 만들어짐.

5. **회귀 측정** — 운영 1주 후:
   - Cost dashboard 에서 plan-emitter + decomposer 호출 횟수 비교 (fast-track 적용 후 decomposer ↓ 기대)
   - 사용자 승인 단계 감소율
   - quality 회귀 (verification_failed) 비율

## 알려진 한계

- **Slack 카드 컨텍스트 만료** (30분): 사용자가 plan 카드 받고 30분 후 클릭 → "만료" 안내. 재 멘션 필요.
- **Chrome ext 의 prompt() 모달**: native prompt() 는 UX 한계. 정식 모달 컴포넌트는 별 슬라이스.
- **Fast-track 오판**: plan-emitter 가 intent 잘못 분류 가능 (예: copy_update 인데 실제론 복잡 변경). decomposer 의 안전망 사라지므로 typecheck verify (D / D+) 가 더 중요해짐.
- **autoApprove + skipDecomposer 가 같은 createJob 옵션**: 두 flag 가 합쳐져 새로운 동작. 운영 1-2주 데이터 보고 default 변경 검토.

## Backout

- 각 surface 별 commit 독립 revert 가능.
- `autoApprove` / `skipDecomposer` 옵션 안 보내면 backend 가 기존 동작 (사용자 승인 + decomposer). → backward compat 안전.
