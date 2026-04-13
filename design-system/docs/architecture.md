# Component Architecture

> MSM Portal UI는 3개 레이어로 구성된다. 코드를 수정하거나 새 컴포넌트를 만들 때 반드시 이 구조를 이해해야 한다.

---

## Layer 구조

```
Layer 1: @moloco/moloco-cloud-react-ui (v0.0.123)
         GitHub: moloco/moloco-cloud-react-library
         └── UI 프리미티브 (MCButton, MCSingleTextInput, MCSelect, MCDatePicker...)
             Formik 없음. styled-components + theme 기반.

Layer 2: @msm-portal/common/component/*
         GitHub: moloco/msm-portal → js/msm-portal-web/src/common/component/
         └── Layer 1을 Formik으로 래핑 (MCFormTextInput, MCFormPanel, MCFormLayout...)
             에러 처리, 레이아웃, Label 자동화 추가.

Layer 3: 서비스 페이지 (apps/tving/, apps/onboard-demo/, apps/msm-default/)
         └── Layer 2 컴포넌트를 조합하여 실제 화면 구성.
```

### Layer별 역할

| Layer | 패키지 | 역할 | 예시 |
|-------|--------|------|------|
| **1 — Library** | `@moloco/moloco-cloud-react-ui` | UI 프리미티브, 테마, 아이콘 | MCButton2, MCSingleTextInput, MCIcon |
| **2 — Wrapper** | `@msm-portal/common/component/*` | Formik 통합, 폼 레이아웃, 공통 패턴 | MCFormTextInput, MCFormPanel, MCFormLayout |
| **3 — App** | `apps/tving/`, `apps/onboard-demo/` | 비즈니스 로직, 페이지 조합 | 캠페인 생성, 리포트 조회 |

---

## Layer 1 — React Library

### 패키지 구조 (monorepo)

| 패키지 | npm 이름 | 역할 |
|--------|---------|------|
| `packages/ui` | `@moloco/moloco-cloud-react-ui` | UI 컴포넌트 + 테마 |
| `packages/hooks` | `@moloco/moloco-cloud-react-hooks` | React hooks 유틸 |
| `packages/configuration` | `@moloco/moloco-cloud-react-configuration` | 설정 관리 (Firebase) |
| `packages/imageGenerator` | `@moloco/moloco-cloud-image-generator` | 이미지 생성 |

### 제공 컴포넌트 (28개 카테고리)

**입력**: MCSingleTextInput, MCSingleTextArea, MCRadioInput, MCCheckBoxInput, MCChipInput, MCSingleNumberInput, MCDebounceInput
**선택**: MCSelect, MCSingleRichSelect, MCMultiRichSelect, MCCardSelect, MCInlineChipRichSelect
**버튼**: MCButton (구), MCButton2 (현재 표준)
**날짜**: MCDatePicker, MCDateRangePicker, MCTimePicker
**데이터**: MCDataTable (react-table 기반, react-window 가상화)
**피드백**: MCBanner, MCLoader, MCCircularLoader
**오버레이**: MCModal, MCDialog, MCPopper, MCPopover, MCTooltip
**기타**: MCCollapse, MCChip, MCTag, MCMarkdown, MCSearchBar, MCFilter, MCStepper, MCSwitch, MCTab, MCIcon, MCStack, MCTextEllipsis, MCWeeklyTimeTablePicker

### 테마 시스템

```typescript
// 라이브러리 기본 테마 생성
import { createTheme } from '@moloco/moloco-cloud-react-ui';
const theme = createTheme(undefined); // MSM Portal은 커스텀 오버라이드 없음

// styled-components에서 접근
const SCComponent = styled.div`
  color: ${(props) => getTheme(props).palette.content.primary};
  font-size: ${(props) => getTheme(props).typography.BODY_1_BODY.size};
  padding: ${(props) => getTheme(props).spacing(2)};
`;
```

**getTheme() 유틸리티**: 모든 styled-component에서 사용하는 핵심 패턴.
```typescript
import { getTheme } from '@moloco/moloco-cloud-react-ui';

// theme.mcui를 반환. ThemeProvider 없으면 기본 테마로 fallback.
const theme = getTheme(props); // → theme.mcui
```

### Color Primitives (900-50 스케일)

| 이름 | 500 값 | 용도 |
|------|--------|------|
| **BLUE** | `#346bea` | Brand, primary actions |
| **BLUE_GREY** | — | Navigation, secondary UI |
| **GREY** | `#9E9E9E` | Text, borders, disabled |
| **RED** | `#e53935` | Error, danger |
| **ORANGE** | — | Warning accents |
| **YELLOW** | `#ffca28` | Warning |
| **GREEN** | `#429746` | Success |

---

## Layer 2 — Portal Wrapper 패턴

### Formik 래핑 패턴

모든 MCForm* 컴포넌트는 동일한 패턴으로 Library 프리미티브를 래핑한다:

```typescript
// MCFormTextInput 내부 구현 (간략화)
const MCFormTextInput = ({ name, fieldLabel, required, hint, showError = true, onChange, readonly, ...rest }) => {
  // 1. Formik useField로 상태 추출
  const [field, meta, helper] = useField<string>(name);
  const error = !!(meta.touched && meta.error);

  // 2. onChange는 value를 직접 전달 (이벤트 아님)
  const handleChange = (event) => {
    helper.setValue(event.target.value);
    onChange?.(event.target.value); // 선택적 콜백
  };

  // 3. MCFormField 컨테이너로 레이아웃 통일
  return (
    <MCFormField>
      {fieldLabel && <MCFormFieldLabel label={fieldLabel} required={required} />}
      {readonly ? (
        <MCTextEllipsis>{meta.value}</MCTextEllipsis>  // readonly 모드
      ) : (
        <>
          <MCSingleTextInput {...field} {...rest} error={error} onChange={handleChange} fullWidth />
          {hint && <MCFormHint>{hint}</MCFormHint>}
          {showError && error && <MCFormFieldError>{meta.error}</MCFormFieldError>}
        </>
      )}
    </MCFormField>
  );
};
```

### 래퍼가 추가하는 것

| 기능 | 설명 |
|------|------|
| **Formik 통합** | `useField(name)` — value, error, touched 자동 관리 |
| **에러 표시** | touched 이후에만 에러 표시 (사용자 인터랙션 후) |
| **Label 자동화** | `required=false`이면 "(Optional)" 자동 표시, 툴팁 아이콘 지원 |
| **readonly 모드** | `readonly=true`이면 입력 대신 MCTextEllipsis 렌더링 |
| **힌트/설명** | `hint`, `description` prop으로 필드 아래 텍스트 |
| **너비 제어** | `MEFormFieldWidth` enum (SMALL=40%, MEDIUM=70%, FULL=100%, FIT_CONTENT) |
| **방향 제어** | `$direction='row'|'column'` — label과 input 배치 방향 |
| **onChange 변환** | 이벤트 → value 직접 전달 `(value: string) => void` |
| **fullWidth 강제** | 내부적으로 항상 fullWidth=true 설정 |
| **testId 자동** | field name을 testId로 자동 설정 |

### MEFormFieldWidth enum

```typescript
enum MEFormFieldWidth {
  SMALL = '40%',
  MEDIUM = '70%',
  FULL = '100%',     // 기본값
  FIT_CONTENT = 'fit-content',
  UNSET = 'unset',
}
```

### Form Scaffold 컴포넌트

| 컴포넌트 | 역할 | 스타일 |
|---------|------|--------|
| `MCFormField` | 필드 컨테이너 | flex, direction 제어, width enum |
| `MCFormFieldLabel` | 필드 레이블 | required=false → "(Optional)" 표시, 툴팁 지원 |
| `MCFormFieldError` | 에러 메시지 | BODY_2_SPECIAL, negative 색상 |
| `MCFormFieldGroup` | 필드 그룹 | row/column, theme spacing |
| `MCFormPanel` | 섹션 컨테이너 | 6 unit padding, 1.5 unit margin, border + rounded |
| `MCFormPanelTitle` | 섹션 제목 | H_3, 3 unit margin bottom |
| `MCFormActions` | 액션 버튼 영역 | flex, gap 1 unit, right-aligned, 4 unit padding |
| `MCFormHint` | 도움말 텍스트 | BODY_2, secondary 색상 |
| `MCFormGuideMessage` | 안내 박스 | tertiary 배경, 1.5 unit padding |
| `MCFormDescription` | 필드 설명 | BODY_3, primary 색상 |
| `MCFormDivider` | 구분선 | top border |

### MCFormLayout

전체 페이지 폼 레이아웃:

```
┌─────────────────────────────────────────┐
│ Header (44px): [X] Breadcrumbs  [Right] │
├─────────────────────────────────────────┤
│                                         │
│   Scrollable Body (width: 860px)        │
│                                         │
│   ┌─── MCFormPanel ──────────────────┐  │
│   │ Title                            │  │
│   │ MCFormFieldGroup                 │  │
│   │   MCFormTextInput                │  │
│   │   MCFormNumberInput              │  │
│   └──────────────────────────────────┘  │
│                                         │
├─────────────────────────────────────────┤
│ Footer (sticky): [Cancel]  [Save]       │
└─────────────────────────────────────────┘
```

Props:
- `onClose` — 닫기 버튼 콜백
- `breadCrumbs` — 네비게이션 경로
- `bodyWidth` — 본문 너비 (기본 860px)
- `footerContent` — 푸터 영역
- `fullScreen` — 포털 렌더링 모드
- `noHeader` — 헤더 숨기기

---

## Provider Stack

앱 루트에서 Provider 래핑 순서 (순서 중요):

```typescript
// App.tsx
<ReactQueryProvider>
  <BrowserRouter>
    <I18nextProvider i18n={i18n}>
      <ThemeProvider theme={createTheme(undefined)}>
        <MCGlobalStyle />
        <MCInAppAlertProvider>
          {/* 페이지 라우팅 */}
        </MCInAppAlertProvider>
      </ThemeProvider>
    </I18nextProvider>
  </BrowserRouter>
</ReactQueryProvider>
```

### 최소 Provider (미리보기용)

| 용도 | 필요한 Provider |
|------|----------------|
| **UI만 렌더링** | ThemeProvider + MCGlobalStyle |
| **폼 미리보기** | ThemeProvider + MCGlobalStyle + Formik |
| **전체 앱** | 위 전체 스택 |

---

## 주의사항 (에이전트/개발자용)

1. **Layer 1 컴포넌트를 직접 사용하지 말 것** — 폼에서는 반드시 Layer 2 래퍼(MCForm*) 사용. Formik 상태 관리가 없으면 에러 처리, 검증이 작동하지 않음.
2. **onChange 시그니처 주의** — Layer 1은 `(event) => void`, Layer 2는 `(value) => void`. 혼동하면 런타임 에러.
3. **Theme 커스터마이징 없음** — 현재 모든 앱이 `createTheme(undefined)` 사용. 색상 변경이 필요하면 라이브러리 레벨에서 변경해야 함.
4. **MCButton2 사용** — MCButton(구)이 아닌 MCButton2 사용. variant는 `basic`(contained 대신), color는 `error`(danger 대신).
5. **fullWidth 자동 적용** — 래퍼가 내부적으로 fullWidth=true 설정. 별도 지정 불필요.
