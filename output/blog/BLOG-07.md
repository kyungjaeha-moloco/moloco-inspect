---
id: BLOG-07
title: "흩어진 Figma와 코드에서 JSON 디자인 시스템을 추출하는 법"
url_placeholder: extracting-json-design-system-from-figma-and-code
source_materials: [MAT-016, MAT-017, MAT-018, MAT-019]
date: 2026-04-15
author: Kyungjae Ha
---

## TL;DR

디자인 시스템을 "만든다"는 건 없는 걸 새로 짓는 게 아니다. 이미 코드베이스 곳곳에 흩어져 있는 것들을 발굴하고, 정리하고, 구조화하는 작업이다. Inspect의 112개 컴포넌트 JSON은 그렇게 만들어졌다.

---

## 배경

우리 팀의 프론트엔드 코드베이스는 전형적인 중견 스타트업의 모습이었다. 디자인 시스템이 공식적으로 존재하긴 했다. 사내 UI 라이브러리라는 패키지가 있었고, `@msm-portal/common`이라는 래퍼 레이어도 있었다. 그런데 실제로 어떤 컴포넌트가 있는지, 어떤 걸 써야 하고 어떤 건 쓰면 안 되는지를 한눈에 파악할 수 있는 곳이 없었다.

Figma에는 디자인 파일이 있었다. 코드에는 컴포넌트들이 있었다. 그 둘이 정확히 매핑됐냐 하면, 솔직히 아니었다. Figma에만 있고 코드에 없는 것도 있었고, 코드에만 있고 Figma에 없는 것도 있었다. 히스토리가 쌓이면서 생긴 자연스러운 분화였다.

AI Agent에게 이 코드베이스를 다루게 하려면, 먼저 내가 이 코드베이스를 이해해야 했다. 그리고 그 이해를 JSON으로 만들어야 했다.

---

## 시도

### Step 1: grep으로 전수 조사

가장 먼저 한 건 무식하지만 확실한 방법이었다. 코드베이스 전체를 grep으로 훑어서 `MC*` 패턴으로 시작하는 컴포넌트 임포트를 모두 추출했다.

```bash
grep -r "from '@msm-portal/common'" apps/ --include="*.tsx" -h \
  | grep -oP "MC\w+" | sort | uniq -c | sort -rn
```

결과물은 충격적이었다. 생각보다 훨씬 많은 컴포넌트가 있었다. 이름이 비슷한 것들도 있었고(MCButton, MCButton2, MCIconButton), 이름만 봐서는 뭘 하는지 알 수 없는 것들도 있었다(MCChip? MCChipGroup? 뭐가 다른 거지?).

사용 빈도도 함께 뽑았다. 어떤 컴포넌트는 1,000번 이상 쓰이고 있었고, 어떤 건 3번이었다. 이 숫자가 나중에 거버넌스 판단의 기준이 됐다.

### Step 2: 패턴 식별과 클러스터링

raw 데이터를 보면서 패턴이 보이기 시작했다. 컴포넌트들은 자연스럽게 몇 가지 군집으로 묶였다.

- 액션 계열: MCButton, MCButton2, MCIconButton, MCToggleButton
- 인풋 계열: MCTextField, MCSelect, MCDatePicker, MCTimePicker...
- 표시 계열: MCChip, MCBadge, MCTag, MCTooltip...
- 레이아웃 계열: MCCard, MCModal, MCDrawer, MCSidebar...

이 클러스터링이 나중에 16개 카테고리 분류 체계의 뼈대가 됐다. 처음부터 카테고리를 설계한 게 아니라, 데이터에서 패턴을 읽어낸 것이다.

### Step 3: JSON 스키마 설계

컴포넌트 목록이 나왔으면, 이제 각 컴포넌트에 대해 뭘 기록할지 결정해야 했다. AI가 읽을 JSON이니까, AI에게 필요한 정보가 뭔지부터 생각했다.

AI가 코드를 짤 때 컴포넌트에 대해 알아야 하는 것들:
1. 이름과 임포트 경로 (어디서 가져오는가)
2. 언제 써야 하는가 (when_to_use)
3. 언제 쓰면 안 되는가 (do_not_use)
4. 어떤 props가 있는가 (key_props)
5. 대체 컴포넌트가 있는가 (deprecated면 replacement)

최종 스키마는 이렇게 됐다:

```json
{
  "name": "MCButton2",
  "import_path": "@msm-portal/common",
  "functional_category": "action",
  "when_to_use": "사용자 액션을 트리거하는 버튼. 폼 제출, 다이얼로그 열기 등",
  "do_not_use": "MCButton 대신 항상 MCButton2를 사용. MCButton은 deprecated",
  "key_props": ["variant", "size", "disabled", "onClick"],
  "status": "active"
}
```

---

## 해결

### 3-layer 아키텍처

작업을 하면서 컴포넌트들이 자연스럽게 세 레이어로 나뉜다는 걸 알게 됐다.

**Primitives** (사내 UI 라이브러리): 가장 기본 단위. 디자인 토큰, 색상, 타이포그래피, 기본 UI 요소들. 이 레이어는 직접 쓰는 경우가 드물다.

**Wrappers** (`@msm-portal/common`): Primitives를 우리 서비스에 맞게 래핑하고 확장한 것. 대부분의 개발자가 실제로 쓰는 레이어다. MCButton2, MCTextField 같은 것들이 여기 있다.

**App Pages** (`apps/tving/` 등): 특정 제품에 특화된 컴포넌트. 재사용 범위가 좁고, 비즈니스 로직이 포함된다.

이 레이어 구조를 JSON에 반영했다. 각 컴포넌트에 `layer` 필드를 추가해서 어느 레이어에 속하는지 명시했다. AI Agent는 이 필드를 보고 "이 작업에는 wrapper 레이어 컴포넌트를 써야 하는구나"를 판단할 수 있다.

### 추출 자동화

112개 컴포넌트를 손으로 하나씩 JSON으로 만드는 건 불가능하다. 어느 정도는 자동화가 필요했다. TypeScript 타입 정의 파일에서 props를 추출하고, 사용 패턴에서 when_to_use 힌트를 얻고, 기존 Confluence 문서에서 설명을 가져오는 작업을 했다.

물론 자동화로 나온 결과물을 그대로 쓸 수는 없었다. 각 컴포넌트에 대해 검토하고, when_to_use와 do_not_use를 사람이 다듬어야 했다. 이 부분이 가장 시간이 많이 걸렸다. 컴포넌트 하나당 5분이라고 해도 112개면 9시간이다.

---

## 인사이트

디자인 시스템 추출 작업에서 가장 배운 것은 "코드가 가장 정직한 문서"라는 것이다. Figma는 이상적인 상태를 보여주고, Confluence는 작성 당시의 의도를 보여준다. 하지만 코드는 지금 실제로 쓰이는 것을 보여준다.

grep 결과에서 나온 사용 빈도는 거버넌스 결정에 직접 쓰였다. 사용 빈도가 10 미만인 컴포넌트에는 `low_adoption` 플래그를 달았고, 0인 것은 `zero_usage` 플래그를 달았다. 이 플래그들이 나중에 "이 컴포넌트를 살릴지 말지" 논의의 출발점이 됐다.

---

## 패턴

흩어진 디자인 시스템을 JSON으로 추출하는 프로세스를 정리하면 이렇다:

1. **코드베이스 전수 조사**: grep으로 실제 사용 현황 파악. 이상이 아닌 현실에서 시작.
2. **사용 빈도 분석**: 얼마나 쓰이는지가 중요도와 거버넌스 결정의 기준.
3. **자연 클러스터 식별**: 데이터에서 카테고리를 유도. 억지로 분류하지 않기.
4. **AI 중심 스키마 설계**: 누가 읽을 것인가를 먼저 결정하고 필드를 설계.
5. **레이어 명시화**: 어느 레이어에서 가져와야 하는지 명시. 모호함 제거.

디자인 시스템이 없다고 생각하는 팀이 많다. 실제로 없는 게 아니라, 아직 발굴되지 않은 것이다. 코드베이스를 grep하면 거기 있다.
