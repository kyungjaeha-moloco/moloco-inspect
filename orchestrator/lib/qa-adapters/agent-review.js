/**
 * `agent_review` adapter — LLM-driven holistic QA.
 *
 * The strategist picks this when a job's outcome needs *judgment*, not
 * just rule-based checks (e.g. "did this PRD actually get implemented",
 * "does the new feature look right"). The adapter:
 *
 *   1. Drives headless chromium against the playground's vite at
 *      `targetRoute`, capturing screenshot + HTTP status + console
 *      errors + first ~2000 chars of rendered body text.
 *   2. Runs `git diff baseline..HEAD` inside the sandbox to get the
 *      cumulative diff for this job.
 *   3. Sends ALL evidence (PRD + diff + screenshot[vision] + telemetry)
 *      to Claude in a single multimodal message.
 *   4. Parses the model's structured `{passed, notes}` verdict.
 *
 * Tradeoffs vs `final_route_smoke`:
 *   - Slower (1-2s extra for the LLM call) and more expensive (~$0.04
 *     per run vs $0).
 *   - But catches bugs the rule-based smoke can't: subtle visual
 *     regressions ("the badge is grey instead of red"), wrong copy,
 *     missing components, scope-creep that silently broke the page,
 *     "logged in but the page is blank" cases.
 *
 * Failure modes are gentle: any step that throws falls back to a
 * passed:false with a human-readable note instead of crashing the
 * runner.
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { capturePageEvidence } from '../screenshot.js';

const execAsync = promisify(exec);
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_PROMPT = `You are a QA reviewer for Moloco Inspect — a low-code playground that turns PRD-style change requests into actual UI implementations via a coding agent.

Inputs you receive (in the user message):
- The original PRD (what the user asked for).
- The cumulative git diff across every commit this job landed.
- A screenshot of the result page after all tasks completed.
- Telemetry: HTTP status, final URL after navigation, console errors, page errors, first ~2000 chars of rendered body text.

Your job: judge whether the implementation actually satisfies the PRD intent.

PASS criteria (all must hold):
- The intended UI change is *visible* in the screenshot OR clearly present in the diff (the screenshot may not always show every change — e.g. backend-shape PRDs).
- The route loaded with HTTP 2xx and didn't redirect to /sign-in (a sign-in redirect means a permission gate is blocking the result page — almost always a regression).
- No console/page errors block rendering (a stray warning is fine; an actual blank-screen error is not).
- The diff stays within reasonable scope of the PRD (deleting unrelated routes, components, i18n keys is FAIL even if the headline change works).

FAIL examples:
- 200 OK but body is empty / shows only "<div id='root'></div>" → render failed.
- Final URL contains /sign-in → permission gate regression.
- Diff includes scope-creep deletes ("removed Post Creative Review feature" while adding a header badge).
- Screenshot shows the wrong color, missing label, broken layout, or default placeholder text.

Output a single fenced \`\`\`json\`\`\` block with this exact shape — no prose outside the fence:
\`\`\`json
{
  "passed": true | false,
  "notes": "한국어 1~2문장, 200자 이내, 사용자가 통과/실패 사유를 한눈에 알 수 있게."
}
\`\`\``;

/**
 * @param {object} job
 * @param {object} playground
 * @returns {Promise<{ passed: boolean, notes: string, evidence?: object }>}
 */
export async function agentReview(job, playground) {
  if (!playground?.vitePort) {
    return {
      passed: false,
      notes: 'vitePort 미할당 — 플레이그라운드 컨테이너 확인 필요',
    };
  }

  const apiKey =
    process.env.ANTHROPIC_API_KEY ||
    (process.env.SANDBOX_API_KEY?.startsWith('sk-ant-')
      ? process.env.SANDBOX_API_KEY
      : null);
  if (!apiKey) {
    return {
      passed: false,
      notes: 'ANTHROPIC_API_KEY 미설정 — 자동 리뷰 불가',
    };
  }

  // 1. Capture page evidence via Playwright.
  const route = job.targetRoute || '/';
  /** @type {Awaited<ReturnType<typeof capturePageEvidence>>} */
  let evidence;
  try {
    evidence = await capturePageEvidence({
      vitePort: playground.vitePort,
      route,
    });
  } catch (err) {
    return {
      passed: false,
      notes: `스크린샷 캡처 실패: ${err.message?.slice(0, 120) ?? String(err).slice(0, 120)}`,
    };
  }

  // 2. Cumulative diff via docker exec.
  let diffSummary = '(diff not available)';
  if (job.baselineHeadSha && playground.sandboxContainerName) {
    try {
      const cmd = `docker exec ${playground.sandboxContainerName} sh -c "cd /workspace/msm-portal && git diff ${job.baselineHeadSha}..HEAD --stat"`;
      const { stdout: stat } = await execAsync(cmd, {
        timeout: 15_000,
        maxBuffer: 4 * 1024 * 1024,
      });
      const cmd2 = `docker exec ${playground.sandboxContainerName} sh -c "cd /workspace/msm-portal && git diff ${job.baselineHeadSha}..HEAD | head -c 12000"`;
      const { stdout: body } = await execAsync(cmd2, {
        timeout: 15_000,
        maxBuffer: 4 * 1024 * 1024,
      });
      diffSummary = `${stat}\n---\n${body}`;
    } catch (err) {
      diffSummary = `(diff capture failed: ${err.message?.slice(0, 120) ?? String(err).slice(0, 120)})`;
    }
  }

  // 3. Compose the user message with text + screenshot.
  /** @type {Array<object>} */
  const userContent = [];
  const textBlock = [
    `PRD:`,
    job.prdText || '(no PRD provided)',
    ``,
    `Target route: ${job.targetRoute || '(none specified)'}`,
    `HTTP status: ${evidence.httpStatus ?? 'no-response'}`,
    `Final URL: ${evidence.finalUrl || '(no navigation)'}`,
    evidence.navigationError ? `Navigation error: ${evidence.navigationError}` : null,
    ``,
    `Body text (first 2000 chars):`,
    evidence.bodyText || '(empty)',
    ``,
    `Console errors (${evidence.consoleErrors.length}):`,
    evidence.consoleErrors.length
      ? evidence.consoleErrors.slice(0, 10).map((e) => `- ${e.slice(0, 200)}`).join('\n')
      : '(none)',
    ``,
    `Page errors (${evidence.pageErrors.length}):`,
    evidence.pageErrors.length
      ? evidence.pageErrors.slice(0, 10).map((e) => `- ${e.slice(0, 200)}`).join('\n')
      : '(none)',
    ``,
    `Cumulative diff (baseline..HEAD):`,
    diffSummary,
  ]
    .filter((line) => line !== null)
    .join('\n');

  userContent.push({ type: 'text', text: textBlock });

  if (evidence.screenshotBytes) {
    userContent.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
        data: evidence.screenshotBytes.toString('base64'),
      },
    });
  }

  // 4. Call Claude.
  const model =
    process.env.QA_REVIEW_MODEL ||
    process.env.PLAN_MODEL ||
    'claude-sonnet-4-5-20250929';
  /** @type {Response} */
  let resp;
  try {
    resp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      }),
    });
  } catch (err) {
    return {
      passed: false,
      notes: `Claude 호출 실패: ${err.message?.slice(0, 120) ?? String(err).slice(0, 120)}`,
    };
  }

  if (!resp.ok) {
    const txt = await resp.text();
    return {
      passed: false,
      notes: `Claude ${resp.status}: ${txt.slice(0, 200)}`,
    };
  }

  const result = await resp.json();
  const text = (result.content?.[0]?.text || '').trim();
  if (!text) {
    return {
      passed: false,
      notes: 'Claude 빈 응답',
    };
  }

  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  const bare = !fenced && text.startsWith('{') ? text : null;
  const raw = fenced ? fenced[1] : bare;
  if (!raw) {
    return {
      passed: false,
      notes: `Claude 응답 파싱 실패: ${text.slice(0, 120)}`,
    };
  }

  /** @type {any} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      passed: false,
      notes: `Claude JSON 파싱 실패: ${err.message?.slice(0, 80) ?? String(err).slice(0, 80)}`,
    };
  }

  const passed = !!parsed.passed;
  const notes =
    typeof parsed.notes === 'string'
      ? parsed.notes.trim().slice(0, 300)
      : passed
        ? '리뷰 통과 (상세 메시지 없음)'
        : '리뷰 실패 (상세 메시지 없음)';

  return {
    passed,
    notes,
    evidence: {
      httpStatus: evidence.httpStatus,
      finalUrl: evidence.finalUrl,
      consoleErrorCount: evidence.consoleErrors.length,
      pageErrorCount: evidence.pageErrors.length,
      bodyChars: evidence.bodyText.length,
      hasScreenshot: !!evidence.screenshotBytes,
    },
  };
}
