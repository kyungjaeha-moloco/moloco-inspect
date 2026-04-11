# Initial Handoff

## 이 repo의 역할

이 저장소는 proposal 단계의 `Moloco Inspect`를 설명하고 발전시키기 위한 개인 작업 repo입니다.

## 현재 중요한 사실

- 실제 구현은 아직 원본 workspace에 있습니다
- 이 repo는 현재 문서와 구조를 먼저 세우는 단계입니다
- 이후 구현 자산을 점진적으로 가져오는 방향으로 운영합니다

## 이미 검증된 핵심 흐름

원본 workspace 기준으로 아래는 이미 작동 경험을 확인했습니다.

1. inspector로 요소 선택
2. 자연어 요청
3. 계획 확인
4. code change
5. validate / typecheck
6. preview screenshot
7. preview page
8. local apply
9. analytics 기록

## 현재 중요 의사결정

- proposal repo 이름은 `moloco-inspect`
- intent 분류는 과하게 규칙화하지 않고 LLM + 사용자 확인 중심
- preview는 extension의 임시 복구가 아니라 app bootstrap route 기준
- dashboard는 운영 관측을 위한 별도 1급 자산으로 유지
- UX writing은 디자인 시스템의 일부로 취급

## 다음 AI가 가장 먼저 읽을 것

1. `/Users/kyungjae.ha/Documents/moloco-inspect/README.md`
2. `/Users/kyungjae.ha/Documents/moloco-inspect/docs/BOOTSTRAP_PLAN.md`
3. `/Users/kyungjae.ha/Documents/moloco-inspect/docs/SOURCE_WORKSPACE_MAP.md`
4. 원본 workspace의 상세 handoff:
   - `/Users/kyungjae.ha/Documents/Agent-Design-System/contract-first-program/docs/CLAUDE_HANDOFF_2026-04-11.md`

## 다음 작업 추천

1. proposal README 다듬기
2. dashboard부터 1차 이관 시작
3. orchestrator analytics contract 문서 분리
4. extension 기능 범위를 MVP로 다시 묶기
