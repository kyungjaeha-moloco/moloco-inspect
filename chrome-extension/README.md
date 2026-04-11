# Moloco Inspect Extension

## Goal

Validate a local workflow where:

1. A PM or SA views a locally running product in Chrome.
2. They select a UI element with the extension.
3. They write a change request in the side panel.
4. A local orchestrator sends the request to Codex.
5. Codex edits code in an isolated worktree, validates it, and returns a preview state.
6. On approval, the patch is applied back to the local `msm-portal` workspace.

## Current Architecture

- `chrome-extension/`
  - Chrome side panel UI
  - content script for selecting localhost elements
  - background worker for HTTP/native routing
- `orchestrator/server.js`
  - receives HTTP requests from the extension
  - creates a git worktree from `msm-portal/`
  - runs `codex exec`
  - prepares diff / validation / apply-local flow
- `design-system/`
  - validation source of truth

## Local Setup

1. Run the product locally
   - Example: `cd msm-portal/js/msm-portal-web && pnpm start:msm-default:test`
2. Run the orchestrator
   - `cd /Users/kyungjae.ha/Documents/moloco-inspect/orchestrator && node server.js`
3. Load the unpacked extension
   - Open `chrome://extensions`
   - Enable Developer Mode
   - Click `Load unpacked`
   - Select `/Users/kyungjae.ha/Documents/moloco-inspect/chrome-extension`
4. Open the side panel
   - Keep `Connection mode` as `HTTP orchestrator`
   - Keep `Server URL` as `http://localhost:3847`
5. Open a localhost product page and press `Alt + I`
6. Optional: run the orchestrator smoke test
   - `cd /Users/kyungjae.ha/Documents/moloco-inspect/orchestrator`
   - `pnpm smoke -- --component "Forgot password subtitle spacing" --file "js/msm-portal-web/src/common/component/auth/form/forgot-password/MCForgotPasswordForm.tsx" --line 70 --prompt "Increase the spacing below the forgot-password subtitle slightly so the email field starts a bit lower. Keep the change minimal and preserve the current layout." --approve --expect-file "/Users/kyungjae.ha/Documents/Agent-Design-System/msm-portal/js/msm-portal-web/src/common/component/auth/form/forgot-password/MCForgotPasswordForm.tsx" --expect-pattern "\$marginBottom={48}"`
   - For screenshot preview verification:
     - `pnpm smoke -- --component "Sign in title spacing preview" --file "js/msm-portal-web/src/common/component/auth/form/sign-in/MCSignInForm.tsx" --line 78 --page-url "http://localhost:9002/" --page-path "/" --prompt "Increase the spacing below the sign-in title slightly so the form starts a bit lower. Keep the change minimal and preserve the current layout." --expect-screenshot`

## Current Status

- The extension can:
  - inspect localhost pages
  - collect selected element metadata
  - send HTTP requests to the orchestrator
  - expose server URL and mode settings in the side panel
- The orchestrator can:
  - create `msm-portal` git worktrees
  - write request payloads into `.omc/`
  - invoke `codex exec`
  - prepare local-apply approval flow instead of PR flow
- Verified:
  - `GET /api/health` works
  - change requests reach `/api/change-request`
  - worktree creation now uses the real git repo root (`msm-portal`)

## Current MVP State

The local loop now works for small UI edits:

- request submission works
- worktree creation works
- Codex produces a scoped diff
- design-system validation runs
- typecheck runs
- screenshot-backed preview state returns
- approve applies the patch back to the local `msm-portal` workspace

## Migration Note

이 확장은 `moloco-inspect` proposal repo로 가져온 1차 이관본입니다.

현재는 확장 코드가 이 repo 안에 있고, backend/source workspace는 아래 원본 경로를 기준으로 동작합니다.

- `/Users/kyungjae.ha/Documents/Agent-Design-System`

## Next Fix Target

The next most valuable MVP improvements are:

- reduce noisy Codex logs even further in the side panel
- support a few more request types beyond simple spacing tweaks
- make the side panel show a clearer success summary after local apply
- make the side panel render screenshot review a little more cleanly
