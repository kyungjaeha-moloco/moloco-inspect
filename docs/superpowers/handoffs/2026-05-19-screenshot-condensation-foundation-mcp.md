# Handoff — 2026-05-13 ~ 2026-05-19: Screenshot → LLM, Plan-emitter condensation (Layer 0), MCP auto-registration

**Date range:** 2026-05-13 ~ 2026-05-19
**Author:** kyungjae.ha (with Claude session)
**Branch:** main
**Commits added by this thread:** 5 (`7ebe162`, `fddf2ec`, `cdbd2c8`, `5e16f28`, `8fe3287`)

> Parallel thread also active 2026-05-19: VP pre-read finalization (`c9bd44f`, `1868a54`) — see `2026-05-19-vp-pre-read-finalization.md`. This handoff covers the plan-emitter / DS knowledge layer / MCP work only.

---

## 1. Trigger

- 2026-05-13: 사용자가 Chrome ext에서 `test-tving-portal.moloco.cloud` 화면 region 캡처 + Molly chat 입력 → Molly가 화면을 못 보고 "Which page or screen has the '보관' tab?" 라고 되묻기. 캡처 이미지가 사이드패널에는 보이지만 LLM에 전달 안 됨.
- 인접 디버깅 중 plan-emitter system block 비용 문제 발견 (components.json ~500KB 매번 직렬화).
- Open CoDesign (OpenCoworkAI/open-codesign) 레포 영감 + 사용자 합의 변형 (#3 비교 패널, #4 기획 우선, #6 회고적 audit) → 6-track plan v2 momus 2회 리뷰 → 우선순위 🥇 Track 1 (DESIGN.md condensation).

---

## 2. Shipped — 5 commits

| Commit | 한 줄 |
|--------|------|
| `7ebe162` | **Chrome ext**: `*.moloco.cloud` HTTPS URL 허용 + 캡처 미리보기 lightbox (썸네일 max 160px → 클릭 시 확장) + `/api/intake` POST body에 `selectionScreenshotDataUrl` / `selectionRect` |
| `fddf2ec` | **plan-emitter + prd-analyzer**: image content block 첨부 (Lane 2) + `DESIGN.md` foundation + slim `components-index` (~22KB) + slim `component-props` (~100KB). Paired smoke 측정 **−52.6% cache_create**. agent-review.js reference 패턴 사용. |
| `cdbd2c8` | **plans + research**: `2026-05-13-screenshot-to-llm.md` (Lane 2), `2026-05-16-open-codesign-inspired-six-tracks.md` (v1 DEPRECATED), `2026-05-17-open-codesign-inspired-six-tracks-v2.md` (v2 — 11 momus 항목 반영), `2026-05-17-plan-emitter-baseline.md`, `scripts/smoke-plan-emitter.mjs` |
| `5e16f28` | **Foundation pattern**: `DESIGN.md`를 systemBlocks[1]로 이동 + SYSTEM_PROMPT에 "Read DESIGN.md first" framing. CLAUDE.md / progressive-disclosure Layer 0 패턴. 다이어그램 + 두 overview md 업데이트 (`★ DESIGN.md (Foundation)` + `Slim Contracts` 노드 분리) |
| `8fe3287` | **MCP auto-register**: `.mcp.json` (root) — Claude Code가 이 repo 열면 자동 등록. `design-system-mcp/README.md` (setup + 9 tool 카탈로그). `design-system/mcp-server/README.md` deprecation notice |

---

## 3. 측정 결과 (paired smoke, 2 PRDs)

### 토큰
| | 응축 전 | T1 (DESIGN.md + slim index) | T1+S3 (+ slim props) | + Foundation order |
|---|---|---|---|---|
| system block cold (cache_create) | 237,078 | 121,851 | **112,338** | 112,399 |
| Reduction vs 응축 전 | — | −48.6% | **−52.6%** | −52.6% |

### Plan 품질 (Smoke 1: "예약형 주문 리스트 보관 옆 삭제 탭")
| | 응축 전 | T1+S3 | + Foundation |
|---|---|---|---|
| plan_items | 5 | 5 | 7 |
| referenced_components | 5 | 7 (더 풍부) | 6 |
| unresolved_components | 0 | 1 (더 신중) | 1 |
| Hallucination | 0 | 0 (MCBetaTag 실측 검증) | 0 |

### Latency
- Smoke 1: 100s → 78–97s (−9 to −22%)
- Smoke 2: 82s → 65–82s (0 to −21%)

### 비용
- Cold start당 약 $0.35 절감 (Sonnet $3/MTok creation rate)
- 호출 100건/day 가정 → 월 ~$1,050 절감

---

## 4. H1 threshold 진화 (Plan v2 patch history)

- 원안: cache_creation **−80%** ↓
- momus 1차: 현실 조정 → **−70%**
- 측정 후 final: **−50%** (T1+S3 −52.6% 달성). −70% 도달은 patterns.json / api-ui-contracts.json 도 응축 필요 — grounding 핵심이라 위험. 별 Track으로 분리 (Track 1.6 후보).

---

## 5. DS Knowledge Layer 모델 — wrapper 직관 검증

사용자 직관: "DESIGN.md가 다른 contract를 wrap (감싸기)".

리서치 (4 출처: Google Stitch / VoltAgent / Open CoDesign / Anthropic CLAUDE.md docs) 결과: **wrapper 패턴은 어디에도 없음**. 가장 가까운 검증 패턴 = **Layer 0 always-on foundation** (CLAUDE.md + progressive disclosure).

→ **Foundation 채택**, wrapper 시각화 제거. 다이어그램은 `Knowledge → ★ Foundation + Slim → Molly` 두 갈래 흐름으로 분리.

자세한 rationale: `docs/superpowers/research/2026-05-18-design-md-condensation.md`.

---

## 6. MCP 서버 상태 (2026-05-19 검증)

- 위치: `design-system-mcp/` (active, top-level). 9 tools.
- 빌드: `dist/index.js` 31KB, src와 같은 시각 (stale 아님).
- 자동 등록: `.mcp.json` (root) — Claude Code가 자동 인식.
- Smoke 검증: `initialize` OK + `tools/list` 9 tools + `search_components({query:"beta tag"})` → MCBetaTag relevance 31 (정확).
- Dormant duplicate: `design-system/mcp-server/` — deprecation notice 추가. 5월 말 trial 후 제거 예정.

---

## 7. 미해결 결정 / 후속

| # | 항목 | 위치 |
|---|------|------|
| 1 | **Lane 2 측정 게이트 (n≥5 positive)** 통과 검증 — Slice 1.4 측정 안 됨 | `2026-05-13-screenshot-to-llm.md` Slice 1.4 + Plan v2 Track 2 T2.0 gate |
| 2 | Track 2 진입 (region-targeted edit) — 1번 통과 후 | Plan v2 §Track 2 |
| 3 | Track 6 (audit log) — T6.0 (OpenCode SDK tool_use emit 명세 조사) 선행 | Plan v2 §Track 6 + Ontology Phase 2 cross-link |
| 4 | Track 1.6 (별 Track) — patterns.json / api-ui-contracts.json 응축으로 H1 −70% 도달 검토 | 별 plan 필요 |
| 5 | Track 4 (skills 기획 T4.0) — 사용자 합의 "기획 먼저". G1/G2/G3 게이트 정의됨, 진입 미정 | Plan v2 §Track 4 |
| 6 | DESIGN.md Living document 자동 update — 새 token 발견 시 PR 자동화 | future, Track 4와 합치기 가능 |
| 7 | `design-system/mcp-server/` 디렉토리 실제 삭제 | trial 후 |
| 8 | typecheck pass rate baseline 절대값 측정 — paired delta로만 검증, n=2 small sample | Track 1.3 시 n≥10 확장 권장 |

---

## 8. 다음 세션 우선순위 (consolidated)

| 순위 | 항목 | 추정 |
|------|------|------|
| 🥇 1 | **Lane 2 Slice 1.4 측정** — 사용자 보고 케이스 재현 + intake_result.kind 카운터 → Track 2 gate 평가 | 30min + $1 |
| 🥈 2 | (게이트 통과 시) **Track 2 region-targeted edit 진입** | 1.5-2.5d |
| 🥉 3 | Track 6 T6.0 (OpenCode SDK tool_use 조사) | 1-2h |
| 4 | Track 4 T4.0 기획 (G1/G2/G3) | 1d |
| 5 | Track 1.6 (patterns/api 응축 검토 — 별 plan) | 1-2h plan only |
| 6 | DESIGN.md update 자동화 검토 | future |

3 lanes summary (2026-05-12)의 priority와 종합:
- 🥇 **2-person Cloudflare Tunnel trial** (5-6h) — 가장 외부 신호. Lane 2 측정 + DS condensation 검증 둘 다 trial에서 함께 측정 가능.
- 🥈 **DS escalation Slice B (Auto-PR GitHub App)** (1-1.5d) — Lane C handoff
- 🥉 **Slice F-full (coder-side A/B)** (0.5-1d + $10-20)

trial과 본 thread 우선순위 사이의 sequencing이 다음 결정 포인트.

---

## 9. Service ports + verification (2026-05-19)

- orchestrator `:3847` ✅ listening
- playground-app `:4180` ✅
- dashboard `:4174` ✅
- design-system-site `:4176` — 본 세션에서 dev server 띄움

MCP 서버 verification:
```bash
(printf '%s\n%s\n' \
  '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0"}}}' \
  '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'; sleep 1) \
  | node design-system-mcp/dist/index.js
```

---

## 10. Memory 갱신 권장

| 메모리 항목 | 갱신 내용 |
|------------|---------|
| `project_ds_direction.md` | DESIGN.md condensation + Foundation pattern (Layer 0) 추가 |
| `project_canvas_app.md` | Lane 2 (screenshot → LLM) Phase 1 완료 추가 |
| `project_molly_ds_loop.md` | T1.0~T1.3 측정 완료, S3 응축 적용, n=11 baseline 확보 |
| `reference_ds_research.md` (가능 시 새로 만들기) | DESIGN.md best practices 4 출처 — Google Stitch / VoltAgent / Open CoDesign / Anthropic memory docs |

---

## 11. 관련 파일 인덱스

### 코드
- `chrome-extension/manifest.json`, `background.js`, `sidepanel.{css,html,js}` — Lane 1
- `orchestrator/lib/image-attachment.js` — new (Lane 2)
- `orchestrator/lib/molly-plan-emitter.js` — Foundation order + condensation + image block
- `orchestrator/lib/molly-prd-analyzer.js` — image block + timeout +10s
- `orchestrator/server.js` — `/api/intake` payload re-assign + ctx.attachment

### Design system
- `design-system/src/DESIGN.md` — new, 11.2KB / 207줄 — Foundation 정의

### MCP
- `.mcp.json` — new (root)
- `design-system-mcp/README.md` — new
- `design-system/mcp-server/README.md` — deprecation notice

### Plans / research / overview docs
- `docs/superpowers/plans/2026-05-13-screenshot-to-llm.md`
- `docs/superpowers/plans/2026-05-16-open-codesign-inspired-six-tracks.md` (v1 DEPRECATED)
- `docs/superpowers/plans/2026-05-17-open-codesign-inspired-six-tracks-v2.md`
- `docs/superpowers/research/2026-05-17-plan-emitter-baseline.md`
- `docs/superpowers/research/2026-05-18-design-md-condensation.md`
- `docs/2026-05-13-inspect-overview.md` §3 + §4 + mermaid (Foundation pattern)
- `docs/2026-05-13-inspect-overview-ko.md` 동일
- `docs/images/ds-knowledge-layer.{mmd,svg,png}` + `docs/2026-05-13-inspect-overview-ds-knowledge.png` (Foundation + Slim 노드)

### Smoke / utility
- `scripts/smoke-plan-emitter.mjs` — paired measurement harness

---

*Handoff 작성: 2026-05-19 Claude session. Cross-link only — 모든 디테일은 위 plan/research doc 참조.*
