---
id: BLOG-10
title: "디자인 시스템은 만드는 것보다 관리하는 게 더 어렵다"
url_placeholder: maintaining-design-system-is-harder-than-building
source_materials: [MAT-020, MAT-021, MAT-044, MAT-060]
date: 2026-04-15
author: Kyungjae Ha
---

## TL;DR

디자인 시스템을 만들었다고 끝이 아니다. 진짜 문제는 그 다음이다. 컴포넌트는 deprecated되고, 마이그레이션은 중간에 멈추고, 안 쓰이는 컴포넌트가 계속 남아있는다. governance.json과 Health Dashboard는 이 "다음 단계"를 시스템으로 관리하기 위해 만들었다.

---

## 배경

MCButton2를 도입한 건 좋은 결정이었다. 기존 MCButton보다 API가 명확하고, 접근성도 개선됐고, 새로운 디자인 토큰 체계와도 잘 맞았다. 팀 전체가 동의했다. "앞으로 MCButton2 쓰자."

그로부터 여섯 달 후. 코드베이스에는 아직 MCButton이 수백 곳에 있었다. 마이그레이션 진행률을 아는 사람이 없었다. "나는 내 담당 파일은 바꿨는데 다른 사람들이 안 바꿨나?"라는 말이 나왔다.

이건 MCButton만의 문제가 아니었다. 디자인 시스템에서 뭔가를 deprecated하거나 새 버전을 도입할 때마다 이런 상황이 반복됐다. 결정은 쉽게 내려지는데, 실제 전환은 유야무야됐다.

근본적인 문제는 추적 시스템이 없다는 거였다. 마이그레이션 상태를 Jira 티켓으로 관리해봤고, Confluence 페이지로도 해봤다. 둘 다 빠르게 stale해졌다. 아무도 업데이트하지 않으니까.

---

## 시도

### governance.json 설계

해결책은 마이그레이션 상태를 코드로 관리하는 것이었다. 사람이 수동으로 업데이트하는 문서가 아니라, 자동으로 계산되는 데이터로.

`governance.json`은 이렇게 생겼다:

```json
{
  "migrations": [
    {
      "id": "mcbutton-to-mcbutton2",
      "deprecated_component": "MCButton",
      "replacement_component": "MCButton2",
      "status": "in_progress",
      "progress_percent": 88,
      "total_usages": 342,
      "migrated_usages": 301,
      "remaining_usages": 41,
      "started_at": "2025-10-01",
      "target_completion": "2026-02-01",
      "removal_planned": "2026-04-01"
    }
  ],
  "component_health": [
    {
      "name": "MCLegacyTable",
      "status": "deprecated",
      "adoption_count": 3,
      "flag": "low_adoption",
      "last_used": "2025-11-15"
    },
    {
      "name": "MCExperimentalChart",
      "status": "active",
      "adoption_count": 0,
      "flag": "zero_usage",
      "last_used": null
    }
  ]
}
```

`progress_percent`는 수동으로 입력하는 게 아니다. CI에서 실행되는 스크립트가 코드베이스를 grep해서 MCButton과 MCButton2의 사용 빈도를 계산하고 자동으로 업데이트한다. 아무도 손대지 않아도 PR이 머지될 때마다 최신 상태가 된다.

---

## 해결

### deprecated → promotion → removal 큐

마이그레이션을 관리하는 것만으로는 부족했다. 컴포넌트 생애 주기 전체를 시스템화해야 했다.

세 단계의 큐를 만들었다:

**Deprecated 큐**: 더 이상 새 코드에서 쓰면 안 되는 컴포넌트. validate.ts가 새로운 임포트를 감지하면 경고를 낸다. 기존 코드는 허용하되, 새로 추가하는 건 막는다.

**Promotion 큐**: Experimental에서 Stable로 승격을 기다리는 컴포넌트. 일정 기간(보통 3개월) 이상 안정적으로 쓰이면 승격 후보가 된다. 승격 기준은 adoption_count > 10이고 violation 없음.

**Removal 큐**: Deprecated된 후 일정 시간이 지났고, 사용처가 모두 마이그레이션된 컴포넌트. MCButton은 MCButton2 마이그레이션이 100%가 되면 removal 큐로 이동하고, 그 다음 릴리즈에서 실제로 제거된다.

이 큐들이 governance.json에 명시되면, AI Agent도 이 상태를 읽을 수 있다. "MCButton은 removal 큐에 있으니 절대 쓰면 안 된다"를 프롬프트에 적을 필요 없이, AI가 governance.json을 읽으면 알아서 판단한다.

### zero-usage / low-adoption 플래그

컴포넌트 목록에서 자주 보이는 두 가지 상황이 있다.

**zero_usage**: 만들었는데 아무도 안 쓰는 컴포넌트. 이유가 있다. 이름이 이상하거나, 기존 컴포넌트와 너무 비슷하거나, 문서가 없거나, 아니면 애초에 필요 없었거나. CI 스크립트가 90일 이상 사용 빈도가 0인 컴포넌트에 이 플래그를 달면, 다음 디자인 시스템 리뷰에서 논의 안건으로 올라온다.

**low_adoption**: 만들어진 지 오래됐는데 사용 빈도가 낮은 컴포넌트. 5 미만이면 플래그가 달린다. 이 컴포넌트가 deprecated되면 마이그레이션 부담이 적다는 뜻이기도 하다.

두 플래그가 없으면, 컴포넌트 목록은 계속 커지기만 한다. 만들기는 쉽고 지우기는 무서우니까. 플래그는 "이 컴포넌트를 지워도 되는가"를 논의할 수 있는 객관적인 근거를 제공한다.

---

## Health Dashboard

이 모든 데이터를 시각화한 게 Health Dashboard다. Inspect의 일부로 만든 것으로, 두 가지 정보를 한눈에 보여준다.

**마이그레이션 현황**: MCButton → MCButton2 88%. 수평 프로그레스 바와 함께 "남은 사용처 41곳"이 표시된다. 클릭하면 어떤 파일들이 남았는지 리스트가 나온다.

**거버넌스 큐**: Deprecated 큐 3개, Promotion 큐 2개, Removal 큐 1개. 각 항목에 마우스를 올리면 이유와 타임라인이 나온다.

대시보드를 만들기 전에는 "마이그레이션이 얼마나 됐어?"라는 질문에 답하려면 grep을 돌려야 했다. 대시보드가 생기면서 이 질문의 답이 항상 보이게 됐다. 그리고 재미있는 일이 생겼다. 대시보드에 88%가 표시되자, 팀원들이 자발적으로 "내가 저 12% 마저 끝내볼게"라고 말하기 시작했다. 진행률이 보이니까 완료하고 싶어지는 것이다.

---

## 인사이트

디자인 시스템 관리의 가장 큰 적은 관성이다. deprecated를 결정하는 회의는 10분 만에 끝난다. 실제 마이그레이션은 6개월이 걸린다. 그 사이에 다른 일들이 생기고, 담당자가 바뀌고, 아무도 신경 쓰지 않게 된다.

governance.json이 해결하는 것은 관성 극복이다. 진행률이 자동으로 업데이트되니까 stale해지지 않는다. 타임라인이 명시돼 있으니 deadline이 생긴다. AI Agent도 이 상태를 읽으니까, 새로운 deprecated 컴포넌트가 절대 늘어나지 않는다.

두 번째 인사이트: 관리는 자동화할 수 있는 것과 사람이 해야 하는 것을 구분해야 한다. 진행률 계산, 플래그 달기, 현황 표시는 자동화 영역이다. 마이그레이션을 결정하고, promotion 기준을 설정하고, removal을 최종 승인하는 건 사람의 영역이다. 자동화가 사람의 결정을 대신하는 게 아니라, 사람이 더 잘 결정할 수 있도록 정보를 제공하는 것이다.

---

## 패턴

디자인 시스템을 장기적으로 관리하기 위한 시스템 설계:

**자동화된 상태 추적**: 마이그레이션 진행률, adoption 수치, zero_usage 감지를 CI에서 자동 계산. 수동 업데이트에 의존하지 않는다.

**명시적 생애 주기**: deprecated → in_progress → removal 큐. 컴포넌트가 어디 있는지 항상 명확하게. 모호한 "쓰면 안 됩니다" 대신 `status` 필드 하나로.

**플래그 기반 신호**: zero_usage, low_adoption 플래그로 "지워도 되는 것들"을 식별. 없애는 것도 관리의 일부다.

**시각화**: 숫자가 보여야 움직인다. 대시보드가 없으면 88%는 그냥 생각 속 숫자다. 보이는 순간 의미가 생긴다.

디자인 시스템을 만들겠다고 결심하는 사람은 많다. 만든 후에 관리 시스템도 함께 설계하겠다고 결심하는 사람은 적다. 그 차이가 6개월 후에 드러난다.
