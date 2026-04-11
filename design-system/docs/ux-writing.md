<!-- AUTO-GENERATED — Do not edit directly. Edit src/ux-writing.json then run: node generate.mjs -->

# UX Writing

> UX writing rules for MSM Portal. Defines tone, terminology, surface-specific rules, review criteria, and machine-readable checks for consistent product writing.
> **Version**: 1.0.0

---

## Service Voice

### Clear and specific

Say exactly what will happen. Prefer action-specific labels over generic verbs.

**Good examples**

- ko: `비밀번호 재설정 이메일 보내기`, `변경 사항 저장`, `테스트 링크 보내기`
- en: `Send password reset email`, `Save changes`, `Send test link`

**Avoid**

- ko: `보내기`, `제출`, `확인`
- en: `Submit`, `Confirm`, `Done`

### Calm and professional

Use matter-of-fact language. Explain problems without blame or unnecessary urgency.

**Good examples**

- ko: `입력한 이메일 주소를 다시 확인해 주세요.`, `이 링크는 유효하지 않습니다. 설정을 다시 확인해 주세요.`
- en: `Check the email address and try again.`, `This link is invalid. Check the settings and try again.`

**Avoid**

- ko: `반드시`, `지금 당장`
- en: `simply`, `obviously`, `must`

### Helpful guidance

When the user is blocked, explain the next step instead of only describing the problem.

**Good examples**

- ko: `타이틀을 입력하면 초안으로 저장할 수 있습니다.`, `워크플레이스를 선택한 뒤 다시 시도해 주세요.`
- en: `Enter a title to save this as a draft.`, `Select a workplace and try again.`

## Terminology

| Concept | Korean | English |
|---------|--------|---------|
| draft | 초안 | draft |
| review | 검토 | review |
| workplace | 워크플레이스 | workplace |

Use the same noun for the same product concept across labels, empty states, dialogs, and toasts.

---

## Surface Rules

### buttons_and_cta

Label the result of the action, not the UI event.

- Prefer 'Save changes' over 'Save' when the page edits an existing entity.
- Prefer 'Send password reset email' over 'Submit'.
- Use destructive labels that name the action, such as 'Delete order'.

**Do**

- ko: `변경 사항 저장`, `주문 제출`, `테스트 링크 보내기`
- en: `Save changes`, `Submit order`, `Send test link`

**Don't**

- ko: `보내기`, `제출`, `확인`
- en: `Submit`, `Confirm`, `Done`

### labels_and_placeholders

Labels describe the field. Placeholders give lightweight examples, not full instructions.

- Keep field labels noun-based and stable.
- Do not rely on placeholder text as the only explanation.
- Avoid placeholder text that repeats the label word-for-word without adding value.

### validation_and_errors

Explain what is wrong and how to recover.

- State the specific issue first.
- When possible, include the next action.
- Avoid blameful language such as 'You entered an invalid value.'

**Examples**

- ko
  - good: `이메일 주소 형식을 다시 확인해 주세요.`, `제목을 입력하면 초안으로 저장할 수 있습니다.`
  - bad: `오류가 발생했습니다.`, `잘못 입력했습니다.`
- en
  - good: `Check the email address format and try again.`, `Enter a title to save this as a draft.`
  - bad: `Error occurred.`, `Invalid input.`

### empty_states

Empty states should explain what is missing and what the user can do next.

- Name the empty thing clearly.
- Provide a next step or CTA when available.
- Avoid blank or purely decorative empty states.

### dialogs_and_confirmations

The title should name the decision. The body should explain the consequence.

- Use a direct confirmation title for destructive actions.
- Mention what will change, be removed, or stay the same.
- Keep the confirm button action-specific.

### toasts_and_status

Toasts should be short and outcome-based. Status text should be stable and reusable.

- Use success to confirm a completed action.
- Use error to explain the failure and next step when possible.
- Keep status nouns consistent with the domain terminology.

## Writing Process

### Authoring Steps

- Identify the user goal, not just the UI element.
- Choose stable domain terminology before writing labels or errors.
- Write the shortest copy that still explains the action or outcome.
- Check the wording in Korean and English for parity of meaning, not literal word count.
- Review the copy in context: label, button, dialog, empty state, or toast.

### Review Questions

- Does the copy tell the user what will happen?
- Would this still make sense without reading surrounding code?
- If the action fails, does the user know the next step?
- Is the same product concept named the same way across the screen?

---

## Validation Process

**Automation policy**: UX writing quality needs human judgment, so automated checks should guide reviewers without blocking legitimate domain-specific wording.

### Automated Checks

- **uxw-discouraged-phrases**: Warn when a locale string contains discouraged tone markers such as blameful or unnecessarily forceful wording.
- **uxw-generic-cta**: Warn when submit-style action keys use generic verbs instead of the concrete outcome.

### Manual Review

- Confirm that button labels reflect the real action on the current screen.
- Confirm that empty states and error states include recovery guidance.
- Review key copy in both Korean and English for consistent meaning.
- Check destructive dialogs for consequence clarity and button specificity.

---

## Machine Checks

### Discouraged Phrases

| ID | Locale | Match | Value | Severity |
|----|--------|-------|-------|----------|
| `uxw-discouraged-en-simply` | en | includes | `simply` | warning |
| `uxw-discouraged-en-obviously` | en | includes | `obviously` | warning |
| `uxw-discouraged-ko-just-now` | ko | includes | `지금 당장` | warning |

### Generic CTA Rules

| ID | Locale | Key Suffixes | Exact Values | Severity |
|----|--------|-------------|-------------|----------|
| `uxw-generic-submit-en` | en | `.submit` | `Submit` | warning |
| `uxw-generic-submit-ko` | ko | `.submit` | `보내기` | warning |

---

## Examples

### button_labels

**Password reset form**

- Before: ko `보내기` / en `Submit`
- After: ko `비밀번호 재설정 이메일 보내기` / en `Send password reset email`
- Why: The improved label tells the user exactly what will happen.

**Edit page primary action**

- Before: ko `저장` / en `Save`
- After: ko `변경 사항 저장` / en `Save changes`
- Why: The improved label matches the edit intent and sets a clearer expectation.

### error_messages

**Required title for saving a draft**

- Before: ko `오류가 발생했습니다.` / en `Error occurred.`
- After: ko `타이틀을 입력하면 초안으로 저장할 수 있습니다.` / en `Enter a title to save this as a draft.`
- Why: The improved message explains the recovery step.

### empty_states

**Empty order list**

- Before: ko `데이터가 없습니다.` / en `No data.`
- After: ko `예약형 주문이 없습니다. 새 주문을 만들어 시작해 보세요.` / en `There are no reserved orders yet. Create a new order to get started.`
- Why: The improved empty state names the missing content and suggests the next action.

