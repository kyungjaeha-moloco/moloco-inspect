# Bootstrap Plan

## 목적

`moloco-inspect`를 proposal repo로 먼저 세우고, 기존 workspace의 자산을 한 번에 복사하지 않고 순서대로 안정적으로 가져오는 것이 목표입니다.

## 원칙

1. 처음부터 전체를 옮기지 않는다
2. 설명 문서와 구조 문서부터 정리한다
3. 그 다음 실행 가능한 최소 단위를 가져온다
4. 마지막에 제품 repo 연결을 정리한다

## 추천 이관 순서

### Phase 1

- README
- handoff 문서
- architecture 문서
- repo strategy 문서

### Phase 2

- dashboard 문서 앱
- analytics schema / ledger contract 문서
- orchestrator 1차 이관
- chrome-extension 1차 이관

### Phase 3

- chrome-extension
- orchestrator

### Phase 4

- design-system JSON 중 proposal에 필요한 subset
- preview verification / request schema / UX writing

### Phase 5

- msm-portal 연동 전략 정리
- 실제 제품 repo 반영을 위한 extraction plan 수립

## 지금 단계에서 하지 않을 것

- `msm-portal` 전체를 이 repo에 통째로 복사
- 팀 repo 반영을 전제로 한 브랜치 전략 설계
- proposal 단계에서 PR 자동화까지 완성

## 바로 다음 액션

1. 이 repo 안의 문서 세트 정리
2. 현재 원본 workspace에서 가져올 1차 자산 범위 확정
3. 초기 커밋 생성
