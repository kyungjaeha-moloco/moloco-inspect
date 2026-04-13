# Migration Status

> 컴포넌트 전환 현황. 개발팀과 논의 시 참고 자료.
> **기준**: Tving 앱 (`apps/tving/`) 코드 분석 (2026-04-13)

---

## MCButton → MCButton2 전환

### 현황

| 버전 | Tving 사용 파일 수 | 비율 | 상태 |
|------|-------------------|------|------|
| **MCButton2** (신) | 115개 | 88% | 현재 표준 |
| **MCButton** (구) | 15개 | 12% | 레거시 |

### Props 변경 매핑

| MCButton (구) | MCButton2 (신) | 비고 |
|--------------|---------------|------|
| `variant="contained"` | `variant="basic"` | 이름 변경 |
| `variant="text"` | `variant="text"` | 동일 |
| `variant="icon"` | — | 제거됨. 별도 구현 필요 |
| `color="primary"` | `color="primary"` | 동일 |
| `color="secondary"` | `color="secondary"` | 동일 |
| `color="danger"` | `color="error"` | 이름 변경 |
| `color="default"` | `color="tertiary"` | 이름 변경 |
| — | `loading={boolean}` | **신규**. CircularLoader + auto-disabled |
| `leftIcon={<ReactNode>}` | `leftIcon="icon-name"` 또는 `{<ReactNode>}` | **확장**. 문자열 아이콘명 지원 |

### MCButton2의 개선점

1. **`loading` prop 내장** — 로딩 상태 시 CircularLoader 오버레이 + 자동 disabled
2. **아이콘 문자열 지원** — `leftIcon="check"` → 자동으로 `<MCIcon icon="check">` 렌더링
3. **사이즈별 아이콘 자동 조절** — large/default=16px, small=12px
4. **Color primitives 직접 참조** — theme 간접 참조 대신 직접 색상 사용으로 예측 가능성 향상

### MCButton2의 제한사항

1. **`icon` variant 없음** — 아이콘 전용 버튼은 별도 구현 필요
2. **text variant는 primary만** — secondary, tertiary, error는 text variant에서 스타일 미정의

### MCButton(구)이 남아있는 곳 (Tving)

모두 **주문(Order) 관련 레거시 코드**:

| 영역 | 파일 수 |
|------|---------|
| 주문 크리에이티브 설정 (AuctionOrder) | 4 |
| 주문 컨테이너 (Order Container) | 5 |
| 주문 폼 (LineItemSettingPanel, creative) | 2 |
| 타겟팅 (MCKeyValuesForm) | 1 |
| 트래킹 링크 | 1 |
| 주문 댓글 | 1 |
| 사용자 설정 (APIAccess) | 1 |

### 논의 필요

- [ ] MCButton(구) → MCButton2 일괄 전환 일정
- [ ] `icon` variant 대안 (별도 MCIconButton 컴포넌트?)
- [ ] text variant에서 secondary/error color 지원 계획

---

## Deprecated 컴포넌트 전환

### 현황 (Tving 기준)

| Deprecated | 대체 | Tving 사용 | 전환 상태 |
|-----------|------|-----------|---------|
| **MCLoader** | MCCircularLoader | **0개** | 완료 |
| **MCSelect** | MCFormSingleRichSelect | **0개** | 완료 |
| **MCDatePicker** | MCFormDateRangePicker | **0개** | 완료 |
| **MCModal** | MCCommonDialog | **18개** | 미완료 |

### MCModal 잔존 현황 (18개 파일)

**핵심**: `MCModalFormDialog`(공통 래퍼)가 MCModal을 사용하고, 나머지 17개가 이를 통해 간접 사용.
→ **MCModalFormDialog 1개만 전환하면 18개 전부 해결 가능**.

| 영역 | 파일 수 | 설명 |
|------|---------|------|
| **크리에이티브 폼** | 6 | Image, Video, NativeVideo, PauseAds, SplashAds, OutstreamAds |
| **컨테이너 (Create)** | 5 | PublisherTarget, AudienceTarget, AdAccountCustomerSet, PublisherCustomerSet, Creative |
| **타겟팅 폼** | 3 | PublisherTargetForm, AudienceTargetForm, FormCustomAudienceSet |
| **모달 폼 공통** | 2 | MCModalFormDialog, MCModalFormCreateGuide |
| **경매 주문** | 1 | AuctionOrderCampaignForm |
| **고객 세트** | 1 | CustomerSetForm |

### 전환 이유

| 구 → 신 | 전환 이유 |
|---------|---------|
| MCLoader → MCCircularLoader | 전체 화면 로딩 → 인라인/부분 로딩 지원 |
| MCSelect → MCFormSingleRichSelect | HTML native select → 검색, 다중선택, 커스텀 옵션 |
| MCDatePicker → MCFormDateRangePicker | 단일 날짜 → 범위 선택 + Formik 통합 |
| MCModal → MCCommonDialog | react-modal(외부 의존) → 자체 구현, 일관된 스타일 |

### 논의 필요

- [ ] MCModal → MCCommonDialog 전환 일정 (MCModalFormDialog 기점)
- [ ] 라이브러리에서 deprecated export 제거 시점 (v4.0.0?)
- [ ] MCModal 제거 시 react-modal 의존성 제거 가능 여부

---

## Brand Color 정정

### 변경 내역

| 항목 | DS 문서 (이전) | 실제 (라이브러리) | 상태 |
|------|--------------|----------------|------|
| Brand / Accent | `#6360DC` (보라) | `#346bea` (파랑, BLUE[500]) | **정정 완료** — tokens.md 참조 |

라이브러리 소스: `packages/ui/src/theme/color/primitives.ts` → `BLUE['500']`
Foundation 매핑: `palette.foundation.assent` → `#346bea`

### 확인 사항

- [x] 프로덕션 brand color는 `#346bea` (개발자 확인 완료)
- [ ] 향후 brand color 변경 계획 여부 (미확인)

---

## DS 문서 보완 목록

### 완료

- [x] 컴포넌트 레이어 구조 문서화 (architecture.md)
- [x] 래퍼 패턴 문서화 (architecture.md)
- [x] MCButton vs MCButton2 비교 (migration-status.md)
- [x] Deprecated 전환 현황 (migration-status.md)
- [x] Brand color 정정 (migration-status.md)

### 추후 보완 예정

- [ ] tokens.json에서 `#6360DC` → `#346bea` 수정 (있는 경우)
- [ ] Color primitives 전체 스케일 (900-50) 문서화
- [ ] Typography 수치 검증 (H1=34px, H2=28px, H3=18px, H4=16px, H5=14px)
- [ ] MCFormLayout의 bodyWidth, fullScreen 옵션 상세 문서화
