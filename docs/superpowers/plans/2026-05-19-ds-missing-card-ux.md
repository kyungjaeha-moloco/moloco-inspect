# Plan — DS Missing Card UX 명확화

**Date:** 2026-05-19
**Author:** kyungjae.ha (with Claude session)
**Status:** **DEPRECATED v1** — momus 1차 리뷰 (B1/B2/M1/M2/M3/M4) + 사용자 product 방향 재정렬 결과 폐기. 후속: `2026-05-19-ds-missing-ai-judge-governance.md`
**Trigger:** 2026-05-19 사용자 피드백 (Chrome ext + Slack 양쪽 관찰): "DS missing 을 별도로 분리한건 너무 좋다. 그런데 이것도 좀더 선택하기 쉽고, 이해하기 쉽게 해주면 좋겠어. 그리고 Run 버튼 아래에 있는데 Run 버튼의 영향을 받는 구조라서 위의 plan 과 묶어줘야 하나 싶은 생각도 드는데 어때?"
**Parent:** `docs/superpowers/plans/2026-05-12-ds-escalation-workflow.md` (Slice A)

---

## 1. 문제 진술

DS escalation Slice A 가 발사하는 "DS MISSING" 카드는 분리 자체는 좋으나:

### 1.1 선택지 명확성 부족 (4 옵션)
1. ⭐ Proceed with X (similarity %)
2. Build custom (outside DS)
3. Propose new DS component
4. Extend existing component

사용자가 의미 / 영향 / 어느 상황에 어느 옵션을 골라야 하는지 추론 어려움. 옵션 라벨이 추상적이고 결과 차이가 보이지 않음.

### 1.2 Run 버튼과의 관계 모호
Chrome ext의 카드 layout (오늘 스크린샷 기준):
```
[Plan card (6 items)]
   ...
[Cancel] [✏️ Re-plan] [Run →]    ← 플랜의 Run 버튼

[🔍 DS MISSING]                  ← 별 박스, Plan Run 버튼 아래
  ⭐ Proceed with MCI18nTable
  Build custom (outside DS)
  Propose new DS component
  Extend existing component
```

사용자 머릿속의 질문:
- "Run 누르면 DS missing 선택까지 같이 적용되나? 아니면 DS missing은 별 액션?"
- "Run 먼저 누르면 DS missing 선택이 무시되나?"
- "DS missing 선택 안 하고 Run하면 default 선택?"

→ 정답이 코드에는 있으나 UI에 명시 없음.

### 1.3 Slack 표현은 더 약함
Slack에서 DS missing 정보는 separate message로 mention만 있고 사용자 액션 흐름이 명확치 않음 (screenshot에서 "@kyungjae.ha chose closest_match" 로 사후 표시되지만 사전 옵션 흐름이 안 보임).

---

## 2. 현재 흐름 / 코드 매핑

### 2.1 백엔드 (`orchestrator/lib/ds-escalation.js`)
- DS escalation 트리거: plan-emitter가 `unresolved_components` 발사 시 자동 미발/매치 (≥1 component requires DS)
- API: `POST /api/missing-choice` — 4 choice keys: `closest_match`, `outside_ds`, `propose_new`, `extend_existing`
- 결과 telemetry: `state/molly-missing-choices.jsonl`
- 일부 옵션은 추가 LLM 호출 (`propose_new` / `extend_existing` → 별 draft preview)

### 2.2 프론트엔드
- **Chrome ext** (`sidepanel.js:2758-2926`) — Plan card 아래 DS missing 카드, 4 option 버튼, `/api/missing-choice` POST
- **Playground** (`AIPanel.tsx:4100-4328`) — 동일 패턴, `playground-store.ts:62` 의 store state로 draft preview 관리
- **Slack** (`molly.js:1622`) — missing-choice preview post로 thread reply

### 2.3 Run 버튼과의 wiring
- **현재 동작 (코드 분석 시점)**: Run 버튼은 Plan items만 처리. DS missing 옵션은 사용자가 별 클릭 시에만 동작. 즉 **독립적인 두 액션**.
- **사용자 인지**: 같은 카드 영역에 있으니 묶여있다고 생각.

---

## 3. 목표 / 비목표

### 3.1 목표
- **G1** — DS missing 카드의 각 옵션이 무엇을 의미하는지 + 어느 상황에 선택할지 한 줄 가이드 표시
- **G2** — Plan Run 버튼과 DS missing 선택의 관계를 UI에 명시 (독립 vs 연동)
- **G3** — 옵션을 줄이거나 그룹핑하여 인지 부하 감소
- **G4** — Slack에서도 동일 UX 패턴으로 명확 표시
- **G5** — 기존 백엔드 (ds-escalation.js, /api/missing-choice) API contract 보존

### 3.2 비목표
- ~~새 옵션 추가~~ — 4 옵션은 현재 충분
- ~~Plan과 DS missing을 하나의 cohesive action으로 통합~~ — wiring 큰 변경, 별 plan
- ~~DS escalation logic 변경 (matching algorithm, similarity threshold)~~ — UX만 손봄
- ~~telemetry schema 변경~~ — 기존 그대로
- ~~MCP 도구 통합~~ — 별 thread

---

## 4. 설계 결정 (Q&A)

### Q1 — 옵션 줄일까 (4 → 2)?

선택지:
- (a) **유지 (4 옵션)** — 모두 의미 있음. UI 라벨/설명만 개선.
- (b) **2 옵션 + Advanced** — 기본은 ⭐ Proceed / Build custom. Propose/Extend는 "Advanced..." 메뉴로 숨김.
- (c) **2 옵션 통합** — Propose new + Extend existing → "Improve DS" 단일 옵션 (모달에서 세부 선택)

**제안: (b).** 90% 케이스는 Proceed 또는 Build custom 중 선택. Propose/Extend는 DS contributor 의도 — 별 메뉴 자연스러움.

### Q2 — Run 버튼과 DS missing의 관계 어떻게 명시?

선택지:
- (a) **Inline note**: "Run은 Plan만 실행. DS missing은 별 선택 시 처리됨" 안내 한 줄.
- (b) **2-단계 흐름**: DS missing 미선택 시 Run 비활성화. 사용자가 옵션 선택 후 Run 활성화.
- (c) **묶음 액션**: Run = Plan run + DS missing default (⭐). 사용자가 변경 안 하면 ⭐ proceed.

**제안: (c) + (a).** 명시적 묶음 + UI note. Run 누르면 ⭐ default 채택 + plan 실행, 다른 선택 원하면 옵션 클릭. 이게 사용자 직관 (Run = "그냥 실행하자")에 가장 맞음.

다만 (c) 는 백엔드 wiring 변경 — Plan Run handler가 DS missing default 적용 로직 추가 필요. scope 확장.

### Q3 — 옵션 라벨 어떻게 명확화?

현재 라벨 → 제안 라벨 (한국어 + 영어 paired):

| 옵션 | 현재 | 제안 (한국어) | 제안 (영어) |
|---|---|---|---|
| ⭐ closest_match | "Proceed with X (similarity %)" | "X 컴포넌트로 진행 (유사도 50%)" | "Use X (50% match)" |
| outside_ds | "Build custom (outside DS)" | "DS 없이 직접 만들기" | "Build outside DS" |
| propose_new | "Propose new DS component" | "새 DS 컴포넌트 제안하기 (PR 생성)" | "Suggest a new DS component" |
| extend_existing | "Extend existing component" | "기존 컴포넌트에 기능 추가 제안" | "Extend an existing component" |

각 라벨 아래 1-line 부연 ("어느 상황에 / 결과 어떻게"):
- ⭐: "지금 가장 빠른 길 — 추천 컴포넌트로 비슷하게 구현"
- outside_ds: "DS에 잘 안 맞는 경우 — 직접 생성. DS 일관성에는 손해"
- propose_new: "이 패턴이 자주 필요해 보이면 — DS 팀에 PR 제안"
- extend_existing: "있는 컴포넌트에 살짝 변형으로 가능하면 — 기능 확장 PR 제안"

### Q4 — Slack UX 패턴

Slack은 4 버튼이 한 메시지에 들어가면 시각적 부담. 선택지:
- (a) Chrome ext와 동일 (4 버튼)
- (b) **2 primary 버튼 (Proceed / Build custom) + "더 보기" 링크** → 별 modal/thread reply
- (c) 한 줄 텍스트 안내 + 사용자가 reaction으로 선택 (⭐ / 💼 / 🆕 / 🔧)

**제안: (b).** Slack native dialog/modal pattern 활용 가능.

### Q5 — 묶음 액션 (Q2-c) 구현 위치

옵션:
- (a) Plan Run handler에 DS missing default 흡수 — `/api/job` 호출 시 미리 `closest_match` 자동 선택 + telemetry 기록
- (b) 클라이언트 단에서 Run 클릭 시 두 요청 (DS missing default + Plan run) 순차 발사
- (c) 새 endpoint `/api/job-and-default-missing-choice` — 묶음 액션 server-side

**제안: (b).** 클라이언트에서 처리. 백엔드 contract 무변경. 구현 가장 가벼움. (c)는 API 폭증 위험.

### Q6 — Backward compatibility

- 기존 telemetry (jsonl)는 4 choice key 그대로 — 변경 없음
- Advanced 메뉴에 들어간 propose_new / extend_existing은 동일 endpoint 호출
- 변경되는 건 *UI 라벨 + 부연 + 그룹핑* 만, *백엔드 contract 0 변경*

---

## 5. 영향 받는 코드/기능

### 5.1 Chrome ext (1 파일)
- **`sidepanel.js:2758-2926`** DS missing card 렌더링 영역:
  - 4 버튼 → 2 primary + "Advanced..." accordion
  - 각 버튼 아래 1-line 부연 추가
  - "Run = ⭐ default 자동 채택" 안내 짧은 텍스트

### 5.2 Playground (1 파일)
- **`playground-app/src/editor/AIPanel.tsx:4100-4328`** + 관련 component
  - Chrome ext와 동일 패턴 적용
  - playground-store 의 draft preview state는 그대로

### 5.3 Slack (1 파일)
- **`molly.js:1622`** missing-choice preview message
  - 2 primary 버튼 + "More options..." (thread reply 또는 link)

### 5.4 백엔드 — 변경 없음
- `orchestrator/lib/ds-escalation.js` — API contract 보존
- `/api/missing-choice` — 변경 없음

### 5.5 Plan Run handler 묶음 액션 wiring
- 클라이언트 단 변경 (Chrome ext + Playground):
  - Run 클릭 시 DS missing이 있다면 user 선택 없으면 `closest_match` 자동 호출
  - 그 다음 Plan run 호출
  - Slack에서는 thread reply로 같은 패턴

---

## 6. 슬라이스

### Slice D0 — UX prototype + 사용자 피드백 *(45min-1h)*
- 4 → 2+Advanced 그룹핑 mockup (Figma 또는 ASCII)
- Run = default 자동 채택 안내 wording 초안 3개
- 사용자 1차 review

### Slice D1 — Chrome ext 라벨 + accordion *(1h)*
- `sidepanel.js:2758-2926` 라벨 수정 + 부연 추가 + Advanced 접기 구현
- "Run = default 자동 채택" 안내 추가

### Slice D2 — Chrome ext Run 묶음 액션 *(45min)*
- Run 클릭 핸들러:
  - 만약 DS missing 있고 사용자 선택 0 → `closest_match` 자동 POST
  - 그 다음 Plan run 호출 (기존 흐름)
- telemetry: `auto_default_applied: true` 필드 추가

### Slice D3 — Playground 동일 적용 *(1-1.5h)*
- AIPanel.tsx 동일 패턴
- store state는 동일 (변경 없음)

### Slice D4 — Slack 묶음 액션 *(1-1.5h)*
- molly.js missing-choice preview 메시지 재설계
- 2 primary 버튼 + "More options..." 링크
- approve_plan 흐름과 묶음

### Slice D5 — 사용자 검증 (3 surface) *(30-45min)*
- Chrome ext, Playground, Slack 각각에서:
  - DS missing 있을 때 옵션 선택 → plan run 후 정상 처리
  - DS missing 있을 때 옵션 선택 안 하고 Run → ⭐ default + plan run
  - 묶음 액션 telemetry 기록 확인

---

## 7. 검증

### 7.1 기능 검증
- [ ] DS missing 카드의 2 primary 옵션 + "Advanced" 메뉴
- [ ] 각 옵션 아래 1-line 부연 표시
- [ ] "Run = default" 안내 표시
- [ ] Run 클릭 시:
  - DS missing + 선택 0 → `closest_match` 자동 호출 + plan run
  - DS missing + 사용자 선택 있음 → 그 선택 + plan run
  - DS missing 없음 → plan run만
- [ ] 3 surface (Chrome ext / Playground / Slack) 동일 패턴

### 7.2 telemetry 검증
- [ ] `molly-missing-choices.jsonl` 에 `auto_default_applied: true` 필드 기록 (자동 선택 시)
- [ ] 기존 4 choice key 분포 변화 측정 (자동 default 비율 / 사용자 명시 선택 비율)

### 7.3 사용자 만족도
- [ ] 옵션 선택 어렵다는 피드백 감소
- [ ] "Run 누르면 어떻게 되나" 모호함 감소

---

## 8. 리스크 / 미해결

| 리스크 | 영향 | 대응 |
|--------|------|------|
| 자동 default가 잘못된 선택 (closest_match 적합 안 함) | medium | telemetry 모니터, 자동 비율 > 90%면 default가 너무 강한 가정 — 검토 |
| Advanced 메뉴로 숨겨진 옵션 (propose/extend) 사용 빈도 감소 | low | telemetry — 숨김 전후 비율. 사용 빈도 < 5% 면 acceptable |
| Slack에서 modal/link UX가 sidepanel만큼 매끄럽지 않음 | medium | D4 prototype 후 결정 |
| 라벨 변경이 기존 사용자 기대와 충돌 | low | 3 surface 한 번에 변경, 일관성 |
| 묶음 액션 race condition (auto-default + plan-run 순차 vs 동시) | low | 클라이언트 await 순차 |
| ⭐ 별표 시각 강조 → 사용자가 "맹목적으로 default 클릭" → 잘못된 매핑 plan 통과 | medium | manual review 권장 안내 추가 (Plan card에 "Plan 검토 후 Run") |

**미해결 (defer):**
- DS escalation matching algorithm 자체 정확도 (similarity threshold)
- MCP 도구로 DS catalog 확장 시 escalation 빈도 감소 기대 — 별 thread
- DS missing 발생 빈도 자체 줄이기 (DS coverage 확장) — 별 lane

---

## 9. 추정

| Slice | 추정 |
|-------|------|
| D0 prototype + 피드백 | 45min-1h |
| D1 Chrome ext 라벨 + accordion | 1h |
| D2 Chrome ext 묶음 액션 | 45min |
| D3 Playground 동일 적용 | 1-1.5h |
| D4 Slack 묶음 액션 | 1-1.5h |
| D5 3-surface 검증 | 30-45min |
| **합계** | **~4.5-6h** |

---

## 10. 검토 후 진행 순서

1. v1 plan momus 리뷰
2. D0 (prototype + 사용자 피드백) 우선 — 사용자 반응 보고 D1-D4 조정
3. D1 → D2 (Chrome ext 먼저, 사용자가 가장 자주 쓰는 surface)
4. D3 → D4 (Playground + Slack)
5. D5 통합 검증

---

## 11. 메모리/핸드오프 업데이트 영향

- 별 핸드오프 (D5 완료 후) — DS missing UX 변경 결과 + 자동 default 채택 비율 + 사용자 피드백
- `project_ds_direction.md` — DS missing UX 항목 닫힘 표시

---

*Plan 작성: 2026-05-19 Claude session. DS escalation Slice A는 commit `348e7c1`로 wiring 완료. 본 plan은 UX 명확화 follow-up.*
