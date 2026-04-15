---
id: BLOG-09
title: "AI에게 디자인 규칙을 가르치는 3가지 방법"
url_placeholder: three-ways-to-teach-design-rules-to-ai
source_materials: [MAT-032, MAT-035, MAT-036, MAT-037]
date: 2026-04-15
author: Kyungjae Ha
---

## TL;DR

AI에게 "이 버튼 써라"고 말하는 건 쉽다. "이 상황에서는 반드시 이 버튼을 써야 하고, 저 상황에서는 쓰면 안 된다"를 가르치는 건 다르다. Inspect에서 사용하는 세 가지 방법: task_loading_guide, validate.ts, decision_trees.

---

## 배경

디자인 규칙을 AI에게 가르친다는 말이 처음에는 막연하게 느껴졌다. 규칙이라는 게 결국 "이렇게 해라, 저렇게 하지 마라"인데, 그걸 프롬프트에 쓰면 되는 거 아닌가?

실제로 해보면 세 가지 문제를 만난다.

첫째, 규칙이 많아지면 프롬프트가 길어지고 AI는 앞부분을 잊는다. 중요한 규칙이 뒤에 있으면 무시될 가능성이 높다.

둘째, 규칙은 맥락에 따라 다르게 적용된다. "MCButton2를 써라"는 버튼이 필요한 상황에만 해당한다. 모달을 만드는 작업에서 버튼 규칙을 계속 읽고 있는 건 낭비다.

셋째, AI는 규칙을 따랐다고 생각하지만 실제로 위반하는 경우가 있다. 검증 없이는 알 수 없다.

이 세 문제에 대응하는 세 가지 방법을 만들었다.

---

## 방법 1: index.json task_loading_guide — 작업 유형별 읽기 순서

규칙을 한꺼번에 다 로드하지 않는다. 작업 유형에 따라 필요한 규칙만 순서대로 로드한다.

`index.json`에는 `task_loading_guide` 섹션이 있다. 예시:

```json
{
  "task_loading_guide": {
    "create_button": [
      "primitives/button.json",
      "wrappers/mc-button2.json",
      "governance.json#button_migrations"
    ],
    "create_form": [
      "primitives/form.json",
      "wrappers/mc-form-field.json",
      "wrappers/mc-text-field.json",
      "wrappers/mc-select.json",
      "rules/form-validation.json"
    ],
    "create_modal": [
      "wrappers/mc-modal.json",
      "rules/overlay-rules.json"
    ]
  }
}
```

AI Agent가 작업을 시작할 때 가장 먼저 index.json을 읽는다. 그리고 지금 할 작업이 무엇인지 판단한 뒤, 해당 로딩 가이드에 명시된 파일들만 순서대로 읽는다.

이 방식의 장점은 두 가지다. 첫째, 컨텍스트 낭비가 없다. 버튼 만드는 데 폼 규칙을 읽을 필요가 없다. 둘째, 로딩 순서가 우선순위를 반영한다. 먼저 읽는 파일이 더 중요한 규칙이다. AI는 나중에 읽은 내용보다 먼저 읽은 내용을 더 강하게 내면화하는 경향이 있다.

task_loading_guide를 설계할 때 기준은 하나였다: "이 작업을 완료하기 위해 AI가 반드시 알아야 할 최소한의 정보는 무엇인가?" 최소한, 이 키워드가 중요하다.

---

## 방법 2: validate.ts — 수정 후 자동 검증 루프

AI가 코드를 수정하면, validate.ts가 그 결과를 검증한다. 수동 리뷰 없이 자동으로.

validate.ts에는 디자인 규칙들이 코드로 표현돼 있다. 몇 가지 예:

```typescript
// 규칙: 색상 값을 하드코딩하면 안 된다
function checkNoHardcodedColors(code: string): ValidationResult {
  const hardcodedColorPattern = /#[0-9A-Fa-f]{3,6}|rgb\(|rgba\(/g;
  const matches = code.match(hardcodedColorPattern);
  if (matches) {
    return {
      pass: false,
      violations: matches.map(m => ({
        type: 'hardcoded_color',
        value: m,
        message: '색상은 반드시 디자인 토큰을 사용하세요'
      }))
    };
  }
  return { pass: true };
}

// 규칙: deprecated 컴포넌트를 임포트하면 안 된다
function checkNoDeprecatedImports(code: string, governance: GovernanceJson): ValidationResult {
  const deprecatedComponents = governance.components
    .filter(c => c.status === 'deprecated')
    .map(c => c.name);
  
  for (const component of deprecatedComponents) {
    if (code.includes(component)) {
      const replacement = governance.components.find(c => c.name === component)?.replacement;
      return {
        pass: false,
        violations: [{
          type: 'deprecated_import',
          component,
          message: `${component}는 deprecated됐습니다. ${replacement}를 사용하세요`
        }]
      };
    }
  }
  return { pass: true };
}
```

AI Agent의 워크플로우에서 validate.ts는 마지막 단계에 실행된다. 결과가 통과(pass: true)면 작업 완료. 실패면 AI가 위반 내용을 읽고 수정한 뒤 다시 검증한다. 이 루프가 자동으로 돌아간다.

"색상은 반드시 토큰으로"라는 규칙을 강제하는 유일한 방법은 검증이다. 가르치는 것만으로는 부족하다. 지키지 않으면 실패한다는 피드백 루프가 있어야 규칙이 실질적으로 작동한다.

---

## 방법 3: decision_trees — 인풋에서 컴포넌트로 자동 매핑

가장 흥미로운 부분이다. 사용자의 요청이나 작업 조건이 주어졌을 때, 어떤 컴포넌트를 써야 하는지 자동으로 매핑한다.

예를 들어 "버튼을 만들어야 해"라는 요청이 왔을 때, 무조건 MCButton2를 추천하면 될까? 그렇지 않다. 버튼에도 종류가 많다.

decision_trees는 이런 조건 분기를 JSON으로 표현한다:

```json
{
  "tree_id": "button_selection",
  "root": {
    "question": "버튼에 아이콘만 있는가?",
    "yes": {
      "result": "MCIconButton",
      "reason": "텍스트 없이 아이콘만 있는 버튼은 MCIconButton을 사용"
    },
    "no": {
      "question": "버튼이 on/off 상태를 가지는가?",
      "yes": {
        "result": "MCToggleButton",
        "reason": "토글 상태가 있는 버튼은 MCToggleButton을 사용"
      },
      "no": {
        "result": "MCButton2",
        "reason": "일반 클릭 버튼은 MCButton2를 사용. MCButton(구버전)이 아님에 주의"
      }
    }
  }
}
```

AI Agent는 작업 시작 전에 관련 decision_tree를 읽고, 질문들에 답하면서 올바른 컴포넌트를 결정한다. 이 과정이 명시적이기 때문에 왜 이 컴포넌트를 선택했는지 추적할 수 있다.

decision_trees의 핵심은 "모호함을 제거하는 것"이다. "버튼 만들어"라는 요청에 대해 AI가 항상 일관된 선택을 하게 만든다.

---

## 인사이트

세 가지 방법을 비교하면 각각 다른 시점에 작동한다:

- **task_loading_guide**: 작업 시작 전. 뭘 읽을지 결정.
- **decision_trees**: 컴포넌트 선택 시. 뭘 쓸지 결정.
- **validate.ts**: 작업 완료 후. 올바르게 했는지 확인.

이 세 시점을 모두 커버해야 규칙이 실질적으로 작동한다. 하나만 있으면 허점이 생긴다. 가르치기만 하고 검증하지 않으면 규칙이 있으나 없으나 같다. 검증만 있고 가이드가 없으면 AI가 반복적으로 실패하면서 시간을 낭비한다.

또 하나 배운 것: 규칙은 구체적일수록 좋다. "좋은 코드를 써라"는 AI에게 아무 의미가 없다. "색상 값에 #RRGGBB 형식을 쓰면 안 된다. `colors.primary` 같은 토큰을 써야 한다"는 검증 가능하다.

---

## 패턴

AI에게 디자인 규칙을 가르치는 방법을 선택할 때 이 질문을 먼저 한다:

1. 이 규칙은 작업 유형에 따라 달라지는가? → task_loading_guide에서 조건부 로드
2. 이 규칙은 여러 선택지 중 하나를 고르는 것인가? → decision_trees로 매핑
3. 이 규칙은 결과물을 보고 판단할 수 있는가? → validate.ts로 자동 검증

세 방법을 조합하면 "가르치고 → 결정하고 → 확인하는" 완전한 루프가 만들어진다. 이 루프 안에서 AI는 단순히 지시를 따르는 게 아니라 시스템의 규칙 안에서 스스로 올바른 선택을 하게 된다.
