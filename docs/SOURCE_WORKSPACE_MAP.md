# Source Workspace Map

## 현재 구현이 있는 원본 workspace

- `/Users/kyungjae.ha/Documents/Agent-Design-System`

## 주요 자산 위치

### Chrome extension

- `/Users/kyungjae.ha/Documents/Agent-Design-System/chrome-extension`

포함 내용:

- inspector
- selection / multi-select
- capture
- clarification
- execution plan confirmation
- preview review card
- PRD ingest 1차 UI

### Orchestrator

- `/Users/kyungjae.ha/Documents/Agent-Design-System/orchestrator`

포함 내용:

- change request handling
- inspect worktree flow
- validate / typecheck / preview
- local apply
- analytics ledger
- PRD ingest endpoint

### Design system

- `/Users/kyungjae.ha/Documents/Agent-Design-System/design-system`

포함 내용:

- component catalog
- semantic tokens
- component dependencies
- PM/SA request schema
- preview verification
- golden example states
- UX writing

### Dashboard

- `/Users/kyungjae.ha/Documents/Agent-Design-System/contract-first-program/dashboard`

포함 내용:

- docs site
- progress dashboard
- request history
- drill-down analytics
- charts

### Product target

- `/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal`

포함 내용:

- preview bootstrap route
- mock workplace/auth flow
- 실제 수정 대상 앱 코드

## 이관 우선순위

1. dashboard
2. orchestrator
3. chrome-extension
4. design-system subset
5. product integration docs

## 현재 이관 상태

- `dashboard/`: 1차 이관 완료, local `design-system` 우선 참조
- `orchestrator/`: 1차 이관 완료, source workspace product/design-system 참조
- `chrome-extension/`: 1차 이관 완료
- `design-system/`: 1차 이관 완료

## 아직 source workspace에 의존하는 핵심

- `msm-portal/js/msm-portal-web/src/*`
- runtime preview를 위한 실제 앱 코드와 mock auth/workplace flow
- 일부 orchestrator/product integration 경로
