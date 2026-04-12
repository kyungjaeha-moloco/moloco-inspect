# Sandbox — Docker Container Execution Environment

Moloco Inspect의 agent 실행, 코드 수정, preview, screenshot을 격리된 Docker container에서 수행합니다.

## 구조

```
sandbox/
  Dockerfile           # Sandbox image 정의 (OpenCode + Node + Chromium)
  .dockerignore
  build-image.sh       # Image 빌드 스크립트
  host-ca.pem          # 빌드 시 생성 (gitignore됨)
  agents/
    ui-editor.md       # UI 수정 전문 OpenCode agent
    reviewer.md        # 코드 리뷰 subagent
  scripts/
    start-preview.sh   # Vite preview server + screenshot 캡처
    capture-screenshot.sh  # 독립 screenshot 캡처
```

## Image 빌드

```bash
# 1. Host CA 번들 복사 (기업 네트워크 SSL용)
cp /etc/ssl/cert.pem sandbox/host-ca.pem

# 2. Image 빌드
bash sandbox/build-image.sh
```

## 환경변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `OPENAI_API_KEY` | OpenAI API key (agent 실행용) | - |
| `ANTHROPIC_API_KEY` | Anthropic API key (대안) | - |
| `SANDBOX_IMAGE` | Docker image 이름 | `moloco-inspect-sandbox:latest` |
| `SANDBOX_MODEL` | Agent 모델 | `gpt-4o` (OpenAI) / `claude-sonnet-4-20250514` (Anthropic) |

## 수동 테스트

```bash
# Container 실행
docker run -d --name test-sandbox \
  -p 4096:4096 -p 5173:5173 \
  -e OPENAI_API_KEY=$OPENAI_API_KEY \
  -e NODE_TLS_REJECT_UNAUTHORIZED=0 \
  -v /etc/ssl/cert.pem:/etc/ssl/cert.pem:ro \
  moloco-inspect-sandbox:latest

# Health check
curl http://localhost:4096/global/health

# 정리
docker rm -f test-sandbox
```

## Ramp Inspector 참조

이 sandbox 구조는 [Ramp Inspector](https://builders.ramp.com/post/why-we-built-our-background-agent)의 sandboxed VM 패턴을 로컬에서 재현한 것입니다. 추후 Modal/Fly.io로 이식 가능한 구조입니다.
