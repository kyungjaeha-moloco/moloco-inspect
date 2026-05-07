# Slack 쓰레드 자동 응답 (멘션 없이) — Design Spec

**Date:** 2026-05-07
**Author:** kyungjae.ha (with Claude)
**Branch:** main
**Related:**
- 직전 핸드오프: `docs/superpowers/handoffs/2026-05-07-incident-burn-down.md`
- 함께 진행 중 (별 슬라이스): `docs/superpowers/specs/2026-05-07-d-plus-verification-auto-retry-design.md`

---

## 1. 동기

현재 Slack 에서 Molly 와 대화하려면 매 메시지마다 `@molly` 멘션이 필요하다. 사람 대 사람 대화에서는 쓰레드가 시작되면 멘션 없이 자연스럽게 이어가는데, Molly 와도 같은 흐름이 자연스럽다.

```
사용자: "@molly 사이드바 정리해줘"
Molly:  "네, 잡 만들었어요"
사용자: "근데 색깔도 바꿔줘"     ← 지금: 못 들음 / 변경 후: 자동 응답
```

## 2. 목표 / 비-목표

**목표**
- Molly 가 한 번이라도 답한 쓰레드 안에서는 멘션 없이도 응답
- 짧은 ack / 사이드 대화는 자동 무시 (spam 방지)
- DM 에서도 자연스러운 1:1 대화 (멘션 없이)
- 무한 루프 / 노이즈 차단

**비-목표**
- channel-level (쓰레드 아닌) 메시지에 자동 응답
- 다른 봇 / 시스템 메시지 처리
- Slack 외 surface (Playground / Chrome ext) — 이미 자체 채팅 흐름

## 3. 결정 사항 (브레인스토밍 결과)

| 항목 | 결정 | 이유 |
|---|---|---|
| 적격 쓰레드 | **Molly 가 한 번이라도 답한 쓰레드** | "Molly 와 대화 중" 인간적 직관과 일치. cache 로 latency 최소화. |
| 채널 범위 | **Public + Private + DM + MPIM** (모든 scope) | Slack manifest 한 번에 다 바꿔서 향후 추가 oauth 재인증 회피 |
| 응답/무시 결정 | **classifier 가 `silent_skip` 분류** | 짧은 ack ("감사합니다", "ㅇㅇ") / 사이드 대화 자동 차단. 휴리스틱보다 정확. |
| 핸들러 통합 | **`handleMention` 함수 추출, 두 이벤트 공유** | DRY. 코드 중복 X. |
| Bot 루프 방지 | `bot_id` / `subtype='bot_message'` skip | Slack 표준 |

## 4. Architecture

```
slack message event
  │
  ├─ subtype === 'message_changed' / 'message_deleted'? → skip
  ├─ bot_id || subtype === 'bot_message'? → skip (loop 방지)
  ├─ thread_ts 없음 + 채널 메시지? → skip
  │     단, DM/MPIM 인 경우 thread_ts 체크 skip (모든 메시지 처리)
  ├─ thread_ts 가 "Molly 참여 thread" 가 아님? → skip
  │     판정 로직: in-memory LRUCache<`${channel}:${thread_ts}`>
  │       1) cache hit → 처리 진행
  │       2) cache miss → conversations.replies API 1회 호출
  │          - 봇 user_id 가 답변자 중에 있음 → cache.add → 처리
  │          - 없음 → silent skip
  │
  └─ 통과 → handleMention(ctx, event)
        ├─ classifier (intake 첫 단계, 기존)
        ├─ kind === 'silent_skip' → 응답 없이 종료 (analytics: thread_reply_skipped)
        └─ chat / status / plan_emit / clarification / lifecycle / ambiguous → 기존 분기
```

## 5. 변경되는 파일 / 모듈

| 파일 | 변경 |
|---|---|
| `orchestrator/lib/molly.js` | (a) 신규 `message` 이벤트 핸들러. (b) `mollyThreads` LRUCache 모듈-스코프 신설. (c) 기존 `app_mention` 핸들러에 `mollyThreads.set(...)` 추가. (d) `handleMention` 본체 함수로 추출 — `app_mention` / `message` 공유. (e) `conversations.replies` fallback 헬퍼 (`isMollyParticipating`). |
| `orchestrator/lib/molly-classifier.js` | classifier prompt 에 `silent_skip` 케이스 추가 + 예시. JSON output schema 의 kind enum 에 추가. |
| `orchestrator/lib/molly-intake.js` | `IntakeKind` union 에 `silent_skip` 추가. routing switch 에 분기 (응답 없이 종료). |
| `playground-app/src/services/orchestrator-client.ts` | `IntakeKind` union 에 `silent_skip` 추가 (TS 일관성, Playground UI 에선 노출 안 함) |
| Slack manifest (Slack workspace 콘솔에서) | `message.channels`, `message.groups`, `message.im`, `message.mpim` scope 추가. **사용자 액션 필요** (workspace 재인증) |

## 6. 핵심 인터페이스

### `mollyThreads` cache

```javascript
// orchestrator/lib/molly.js (모듈 스코프)
// 미니멀 TTL+capacity Map — 별 dependency 안 추가 (lru-cache 미사용 프로젝트).
// 정확한 LRU 가 아니라 capacity 초과 시 oldest insertion 부터 evict (FIFO),
// 매 set 시 expired entry 가까이 한 번 sweep. 1000개 / 30분 규모에선 충분.
const MOLLY_THREADS_MAX = 1000;
const MOLLY_THREADS_TTL_MS = 30 * 60 * 1000;
const mollyThreads = new Map(); // key → { value: true, expireAt: number }

function threadKey(channel, threadTs) {
  return `${channel}:${threadTs}`;
}

function pruneExpired() {
  const now = Date.now();
  for (const [k, v] of mollyThreads) {
    if (v.expireAt <= now) mollyThreads.delete(k);
  }
}

function markMollyParticipating(channel, threadTs) {
  if (mollyThreads.size >= MOLLY_THREADS_MAX) {
    // 한도 초과 — expired 한 번 청소, 그래도 가득이면 oldest (Map 의 insertion order) 1개 drop
    pruneExpired();
    if (mollyThreads.size >= MOLLY_THREADS_MAX) {
      const oldest = mollyThreads.keys().next().value;
      mollyThreads.delete(oldest);
    }
  }
  mollyThreads.set(threadKey(channel, threadTs), {
    value: true,
    expireAt: Date.now() + MOLLY_THREADS_TTL_MS,
  });
}

async function isMollyParticipating(client, botUserId, channel, threadTs) {
  const entry = mollyThreads.get(threadKey(channel, threadTs));
  if (entry && entry.expireAt > Date.now()) return true;
  if (entry) mollyThreads.delete(threadKey(channel, threadTs)); // expired
  // fallback: conversations.replies 1회
  try {
    const result = await client.conversations.replies({
      channel, ts: threadTs, limit: 50,
    });
    const messages = result.messages || [];
    const found = messages.some((m) =>
      m.user === botUserId || m.bot_id || m.subtype === 'bot_message'
    );
    if (found) {
      mollyThreads.set(threadKey(channel, threadTs), true);
    }
    return found;
  } catch (err) {
    // API 실패 시 안전하게 skip (참여 불확실)
    logger.warn(`[molly] isMollyParticipating fallback failed: ${err.message?.slice(0, 80)}`);
    return false;
  }
}
```

### `handleMention` 추출

```javascript
// before — app_mention 안에 인라인
appInstance.event('app_mention', async (ctx) => { ... });

// after — 공통 함수
async function handleMention(ctx, event) {
  // 기존 app_mention 본체 (line 206 이후) — 변경 없음
}

appInstance.event('app_mention', async (ctx) => {
  // 자동 cache add — 처음 멘션 받은 쓰레드 등록
  const threadTs = ctx.event.thread_ts ?? ctx.event.ts;
  markMollyParticipating(ctx.event.channel, threadTs);
  await handleMention(ctx, ctx.event);
});

appInstance.event('message', async (ctx) => {
  const ev = ctx.event;
  // 1) 시스템 메시지 / 봇 메시지 / 편집/삭제 skip
  if (ev.bot_id || ev.subtype === 'bot_message') return;
  if (ev.subtype === 'message_changed' || ev.subtype === 'message_deleted') return;
  if (!ev.text) return;

  // 2) 채널 종류별 분기
  const isDmLike = ev.channel_type === 'im' || ev.channel_type === 'mpim';
  if (!isDmLike) {
    // 채널: thread reply 만
    if (!ev.thread_ts || ev.thread_ts === ev.ts) return;
  }

  // 3) Molly 참여 thread 인지
  const threadTs = ev.thread_ts ?? ev.ts;
  const botUserId = await getBotUserId(ctx.client); // cache
  if (!isDmLike) {
    const ok = await isMollyParticipating(ctx.client, botUserId, ev.channel, threadTs);
    if (!ok) return;
  }
  // DM 은 항상 Molly 와 대화 → participation check skip

  // 4) 공통 핸들러
  markMollyParticipating(ev.channel, threadTs);
  await handleMention(ctx, ev);
});
```

### Classifier 변경 (prompt + schema)

```javascript
// orchestrator/lib/molly-classifier.js (prompt 일부)
const CLASSIFIER_PROMPT = `사용자 메시지를 다음 중 하나로 분류:

- code_change_clear: 명확한 코드/UI 변경 요청
- code_change_ambiguous: 변경 요청이지만 명세 부족
- chat: 정보 조회 / 질문 / 일반 대화
- status_query: 잡 진행 상태 확인
- clarification_answer: 이전 명확화 질문에 대한 답변
- lifecycle_action: 잡 취소/재시도/아카이브 등
- silent_skip: 짧은 ack ("감사합니다" / "넵" / "ㅇㅇ" / 이모지만), 사이드 대화 ("A야 너는 어떻게 생각해?"), Molly 가 아닌 다른 사람에게 보내는 메시지

...
`;

// schema enum
kind: 'code_change_clear' | 'code_change_ambiguous' | 'chat' | 'status_query'
    | 'clarification_answer' | 'lifecycle_action' | 'silent_skip'
```

### Intake routing

```javascript
// orchestrator/lib/molly-intake.js
export async function processIntake(input) {
  const { kind, ... } = await classify(input);
  switch (kind) {
    case 'silent_skip':
      return { kind: 'silent_skip', response: null }; // 응답 없음
    case 'chat': /* 기존 */ ;
    // ... 등
  }
}
```

handler (molly.js) 에서:
```javascript
const result = await processIntake(...);
if (result.kind === 'silent_skip') {
  appendAnalyticsEvent(null, 'thread_reply_skipped', { reason: 'silent_skip', ... });
  return; // 응답 없이 종료
}
// 기존 응답 흐름
```

## 7. 에러 처리 / 경계 케이스

| 케이스 | 처리 |
|---|---|
| 봇 자기 메시지 | `bot_id` / `subtype='bot_message'` skip |
| `conversations.replies` API 실패 | silent skip (참여 불확실, 안 끼어듦이 안전) |
| Cache TTL 만료 | 다음 reply 시 fallback 으로 자동 회복 |
| Edited / Deleted message | skip |
| 텍스트 없는 file upload | skip (`!ev.text`) |
| Classifier 호출 실패 | thread reply 컨텍스트에선 **skip** (기존 chat fallback 은 spam 위험) |
| `@molly` 가 thread reply 안에서 멘션 (event 가 message 와 app_mention 두 번 발사 가능성) | Slack 은 멘션 포함 메시지에 대해 `app_mention` + `message` 두 이벤트를 모두 발사한다 (Slack 공식 문서 기준). 같은 `event_ts` 로 중복 처리 가능 → 처리한 event_ts 를 짧은 TTL Set 에 저장하고 두 핸들러 모두 dedup 체크. (구현은 `processedEventIds` Set, TTL 5분) |
| Bot user id 조회 실패 | 부팅 시 1회 `auth.test` → 실패 시 message 핸들러 비활성화 (graceful degradation) |
| 부팅 직후 cache 비어있음 | 첫 thread reply 만 fallback latency (~200ms), 이후 hit |
| Channel 메시지에 멘션 없이 시작 | 무시 (현재와 동일) |

## 8. Analytics

```javascript
appendAnalyticsEvent(null, 'thread_reply_received', {
  channel, threadTs, kind, textLength
});
appendAnalyticsEvent(null, 'thread_reply_skipped', {
  reason: 'silent_skip' | 'not_participating' | 'bot_message'
        | 'edit_or_delete' | 'no_text' | 'classifier_error',
  channel, threadTs
});
```

운영 후 측정:
- thread_reply_received / thread_reply_skipped 비율
- silent_skip false-positive (사용자 재멘션 패턴으로 추정)
- conversations.replies fallback latency 분포

## 9. 검증 / 테스트

자동:
- `node -c` (molly.js, molly-classifier.js, molly-intake.js)
- `pnpm tsc --noEmit` (playground-app — IntakeKind union 변경)
- Cache 단위: set/get/TTL/LRU eviction

수동 (사용자 환경):
1. **신규 쓰레드 자동 응답**: `@molly 하이` → 응답 → 같은 쓰레드 멘션 없이 "사이드바 정리해줘" → Molly 응답 ✓
2. **짧은 ack 무시**: 위 시나리오 후 "감사합니다" → 응답 X ✓
3. **사이드 대화 무시**: `@molly` 시작 → 다른 멤버에게 "B 야 이건?" → 응답 X ✓
4. **봇 메시지 무시**: Molly 답변에 다른 봇이 reaction/reply → loop 방지 ✓
5. **Edited message 무시**: Molly 답변 후 기존 메시지 수정 → 재처리 X ✓
6. **부팅 직후 cache miss**: orchestrator 재기동 → 기존 쓰레드 reply → fallback → 정상 처리 ✓
7. **DM 자동 응답**: Molly 에게 DM → 멘션 없이도 응답 ✓
8. **Private channel**: 비공개 채널에서 `@molly` → reply → 응답 ✓

## 10. 알려진 한계

- **Classifier 비용**: thread reply 1회 = Haiku ~$0.01. 평균 운영량 (예: 일 100 reply) → 월 $30. 운영 1주 측정 후 cache (text → kind) 도입 검토.
- **False-positive `silent_skip`**: "괜찮네" / "음..." 같은 모호한 메시지 무시 가능. 사용자가 "molly?" 한 번 더 부르면 회복.
- **Slack manifest 변경 + 재인증**: 한 번 사용자 액션 필요. workspace admin 권한 보유자가 OAuth 재승인.
- **Cache restart loss**: 부팅 시 LRU 비어있음 → 모든 기존 쓰레드 첫 reply 는 fallback. (정상 동작, 첫 회만 +200ms)
- **봇 간 대화 (drama)**: 다른 봇이 Molly 메시지에 reaction → loop 위험 → bot_id 검사로 차단. 그러나 사용자가 직접 두 봇 함께 멘션하는 케이스는 별 사고.

## 11. Backout

- `message` 이벤트 핸들러 제거만으로 즉시 backout. 기존 `app_mention` 흐름 그대로.
- Classifier prompt 변경 / `silent_skip` kind 추가는 backward-compatible (다른 kind 영향 없음).
- Slack manifest scope 는 추가만 — 제거하지 않으면 OAuth 손해 X.

## 12. 추정 작업량

- molly.js: ~80 줄 (cache + handler 추출 + message 이벤트)
- molly-classifier.js: ~20 줄 (prompt + schema)
- molly-intake.js: ~10 줄 (kind 추가 + skip routing)
- playground-app TS: ~5 줄
- Slack manifest: workspace 콘솔에서 수동
- 합계: ~115 줄, **0.25-0.5d**

## 13. 다음 단계

1. 본 spec 사용자 리뷰 → 확정
2. `superpowers:writing-plans` 로 implementation plan 작성
3. 구현 + 자동 테스트 + 사용자 수동 smoke
4. Slack manifest 변경 + 재인증 (사용자 액션)
5. 배포 후 1주 운영 → analytics 측정 → silent_skip 정확도 / 비용 검토
