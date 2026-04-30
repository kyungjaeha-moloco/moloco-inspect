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
 * Level 1 deterministic assertions — LLM verdict 와 별개로 코드가
 * 자동 검증할 수 있는 hard rule. LLM 이 catch 못 한 가짜 pass 차단.
 * 5 framework 컨센서스 (Hamel Husain Level 1, Anthropic Capability
 * Evals 등) 의 deterministic 레이어.
 *
 * @param {object} evidence — capturePageEvidence 결과
 * @param {object} job
 * @returns {{ passed: boolean, failures: string[], warnings: string[] }}
 */
export function runLevel1Assertions(evidence, job) {
  /** @type {string[]} */
  const failures = [];

  // A1. 권한 가드 회귀 — finalUrl 이 /sign-in 으로 redirect.
  // 실 잡 88a27157 에서 LLM 이 놓친 케이스 — 코드로 직접 catch.
  if (evidence.finalUrl && /\/sign-in(\?|$|\/)/.test(evidence.finalUrl)) {
    failures.push(
      `A1 권한 가드 회귀: finalUrl 이 /sign-in 으로 리다이렉트됨 (${evidence.finalUrl.slice(0, 200)})`,
    );
  }

  // A2. HTTP 비-2xx — 라우트 자체가 깨짐. (no-response 도 fail.)
  if (
    evidence.httpStatus == null ||
    evidence.httpStatus < 200 ||
    evidence.httpStatus >= 300
  ) {
    failures.push(
      `A2 HTTP 상태 비정상: ${evidence.httpStatus ?? 'no-response'}`,
    );
  }

  // A3. targetRoute 와 finalUrl 의 path 가 일치하지 않으면 redirect 발생.
  // (sign-in 외에도 다른 redirect — 예: forbidden 페이지, 404 페이지 등)
  // ⚠️ false positive 빈도 우려 — PRD 가 "버튼 클릭 시 /detail 이동",
  // "form submit 후 /list redirect" 같은 의도적 redirect 면 fail 처리되면
  // 안 됨. v0 정책: **warning only — final verdict 에 영향 X**, 단
  // failures 배열에 별도 prefix 'WARN' 으로 기록 → 데이터 누적 후 패턴
  // 보고 hard fail 로 전환할지 결정.
  /** @type {string[]} */
  const warnings = [];
  if (job.targetRoute && evidence.finalUrl) {
    try {
      const finalPath = new URL(evidence.finalUrl).pathname;
      if (finalPath !== job.targetRoute && !finalPath.startsWith(`${job.targetRoute}/`)) {
        if (!/\/sign-in/.test(finalPath)) {
          warnings.push(
            `A3 라우트 redirect (warning): targetRoute=${job.targetRoute}, finalPath=${finalPath}`,
          );
        }
      }
    } catch {
      // URL parse 실패 → A2 에서 잡힐 가능성 큼. silent.
    }
  }

  // A4. 빈 body 렌더 — `<div id='root'></div>` 만 보이는 케이스.
  // ⚠️ hydration race 우려 — screenshot.js 의 networkidle 후 SPA 가
  // hydrate 끝나기 전에 측정될 수 있음 (screenshot.js:69 근처). v0:
  // 임계값 더 낮춤 (< 20 자) + 명확한 빈-root 패턴 직접 매칭 둘 중
  // 하나만 fail. hydration 보강 (waitForSelector 등) 은 별도 슬라이스.
  const bodyTrim = (evidence.bodyText || '').trim();
  const isExplicitlyEmptyRoot =
    /^<\s*div[^>]*\bid\s*=\s*['"]?root['"]?[^>]*>\s*<\/\s*div\s*>/i.test(bodyTrim) ||
    bodyTrim === '' ||
    bodyTrim === '<div id="root"></div>';
  if (isExplicitlyEmptyRoot || (bodyTrim.length > 0 && bodyTrim.length < 20)) {
    failures.push(
      `A4 빈 body 렌더: bodyText 길이 ${bodyTrim.length}자 (hydration race 가능성 — pageErrors 같이 확인)`,
    );
  }

  // A5. 페이지 에러 — 사용자에게 보이는 throw. console warn 은 OK.
  if (Array.isArray(evidence.pageErrors) && evidence.pageErrors.length > 0) {
    failures.push(
      `A5 페이지 에러 ${evidence.pageErrors.length}개: ${(evidence.pageErrors[0] || '').slice(0, 120)}`,
    );
  }

  return { passed: failures.length === 0, failures, warnings };
}

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

  // 1.5. Level 1 assertions — LLM 호출 전에 미리 돌림. evidence 만으로
  // 판정 가능한 deterministic 체크. LLM 가 호출 실패해도 assertion
  // 결과는 evidence 에 보존.
  const lvl1 = runLevel1Assertions(evidence, job);

  // helper — LLM 실패 시에도 assertion 결과 보존하기 위한 evidence 빌더.
  const buildEvidence = (extras = {}) => ({
    httpStatus: evidence.httpStatus,
    finalUrl: evidence.finalUrl,
    consoleErrorCount: evidence.consoleErrors.length,
    pageErrorCount: evidence.pageErrors.length,
    bodyChars: evidence.bodyText.length,
    hasScreenshot: !!evidence.screenshotBytes,
    assertionPassed: lvl1.passed,
    assertionFailures: lvl1.failures,
    assertionWarnings: lvl1.warnings,
    ...extras,
  });

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
      passed: lvl1.passed && false,  // LLM 결과 없으면 conservative fail
      notes: !lvl1.passed
        ? `Level 1 fail: ${lvl1.failures[0]}`
        : `Claude 호출 실패: ${err.message?.slice(0, 120) ?? String(err).slice(0, 120)}`,
      evidence: buildEvidence({ llmVerdict: null, llmError: `fetch error: ${err.message?.slice(0, 80) ?? String(err).slice(0, 80)}` }),
    };
  }

  if (!resp.ok) {
    const txt = await resp.text();
    return {
      passed: lvl1.passed && false,  // LLM 결과 없으면 conservative fail
      notes: !lvl1.passed
        ? `Level 1 fail: ${lvl1.failures[0]}`
        : `Claude ${resp.status}: ${txt.slice(0, 200)}`,
      evidence: buildEvidence({ llmVerdict: null, llmError: `http ${resp.status}` }),
    };
  }

  const result = await resp.json();
  const text = (result.content?.[0]?.text || '').trim();
  if (!text) {
    return {
      passed: lvl1.passed && false,  // LLM 결과 없으면 conservative fail
      notes: !lvl1.passed
        ? `Level 1 fail: ${lvl1.failures[0]}`
        : 'Claude 빈 응답',
      evidence: buildEvidence({ llmVerdict: null, llmError: 'empty response' }),
    };
  }

  const fenced = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
  const bare = !fenced && text.startsWith('{') ? text : null;
  const raw = fenced ? fenced[1] : bare;
  if (!raw) {
    return {
      passed: lvl1.passed && false,  // LLM 결과 없으면 conservative fail
      notes: !lvl1.passed
        ? `Level 1 fail: ${lvl1.failures[0]}`
        : `Claude 응답 파싱 실패: ${text.slice(0, 120)}`,
      evidence: buildEvidence({ llmVerdict: null, llmError: 'parse error' }),
    };
  }

  /** @type {any} */
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return {
      passed: lvl1.passed && false,  // LLM 결과 없으면 conservative fail
      notes: !lvl1.passed
        ? `Level 1 fail: ${lvl1.failures[0]}`
        : `Claude JSON 파싱 실패: ${err.message?.slice(0, 80) ?? String(err).slice(0, 80)}`,
      evidence: buildEvidence({ llmVerdict: null, llmError: 'json parse error' }),
    };
  }

  const passed = !!parsed.passed;
  const notes =
    typeof parsed.notes === 'string'
      ? parsed.notes.trim().slice(0, 300)
      : passed
        ? '리뷰 통과 (상세 메시지 없음)'
        : '리뷰 실패 (상세 메시지 없음)';

  // Level 1 assertion 와 LLM verdict 결합.
  // - LLM 이 fail 이면 무조건 fail
  // - LLM 이 pass 인데 assertion 이 fail 이면 final fail (LLM false-pass 차단)
  // - 둘 다 pass 면 final pass
  let finalPassed = passed && lvl1.passed;
  let finalNotes = notes;
  if (passed && !lvl1.passed) {
    // LLM 통과시켰지만 assertion 가 fail — assertion 메시지 우선.
    finalNotes = `Level 1 fail (${lvl1.failures.length}): ${lvl1.failures[0]}`;
  } else if (!passed && !lvl1.passed) {
    // 둘 다 fail — 합쳐서 표시.
    finalNotes = `${notes} | Level 1 fail: ${lvl1.failures[0]}`;
  }

  return {
    passed: finalPassed,
    notes: finalNotes,
    evidence: buildEvidence({ llmVerdict: passed }),
  };
}
