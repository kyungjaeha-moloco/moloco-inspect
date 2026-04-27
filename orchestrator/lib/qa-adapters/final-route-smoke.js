/**
 * `final_route_smoke` adapter — the highest-leverage v1 strategy.
 *
 * Drives a headless chromium against the playground's vite dev server
 * at `http://127.0.0.1:${vitePort}${targetRoute}` and asserts:
 *   - HTTP response is 2xx
 *   - body has at least 50 chars of rendered text (catches blank renders)
 *   - URL didn't get redirected to /sign-in (catches the allowedRoles
 *     permission-gate footgun the agent loves to introduce)
 *   - no console errors emitted during load
 *
 * Playwright is loaded lazily so a missing chromium install crashes
 * the QA run cleanly with a sensible note instead of breaking
 * orchestrator boot.
 *
 * @typedef {{ passed: boolean, notes: string, evidence?: object }} QaResult
 *
 * @param {{ targetRoute?: string }} job
 * @param {{ vitePort?: number, sandboxContainerName?: string }} playground
 * @returns {Promise<QaResult>}
 */
export async function finalRouteSmoke(job, playground) {
  if (!job?.targetRoute) {
    return {
      passed: false,
      notes: 'targetRoute 없음 — 사람이 확인해주세요',
    };
  }
  if (!playground?.vitePort) {
    return {
      passed: false,
      notes: 'vitePort 미할당 — 플레이그라운드 컨테이너를 확인하세요',
    };
  }

  let chromium;
  try {
    ({ chromium } = await import('playwright'));
  } catch (err) {
    return {
      passed: false,
      notes: `Playwright 로드 실패: ${err.message}. \`npx playwright install chromium\` 실행 필요`,
    };
  }

  const url = `http://127.0.0.1:${playground.vitePort}${job.targetRoute}`;
  /** @type {string[]} */
  const consoleErrors = [];
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    page.on('pageerror', (e) => consoleErrors.push(String(e?.message ?? e)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    /** @type {import('playwright').Response | null} */
    let resp;
    try {
      resp = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 15_000,
      });
    } catch (err) {
      // networkidle is strict — fall back to domcontentloaded + small
      // settle so SPAs with long-running fetches don't false-fail.
      try {
        resp = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 10_000,
        });
        await page.waitForTimeout(2_000);
      } catch (err2) {
        return {
          passed: false,
          notes: `라우트 접근 실패: ${err2.message.slice(0, 120)}`,
          evidence: { url, attempt: 'domcontentloaded-fallback' },
        };
      }
    }

    if (!resp || !resp.ok()) {
      return {
        passed: false,
        notes: `HTTP ${resp?.status() ?? 'no-response'} — 라우트가 떠 있지 않습니다`,
        evidence: { url, status: resp?.status() },
      };
    }

    const finalUrl = page.url();
    if (finalUrl.includes('/sign-in')) {
      return {
        passed: false,
        notes:
          '로그인 페이지로 리다이렉트됨 — 권한 가드(`allowedRoles`)가 현재 사용자를 막고 있을 가능성',
        evidence: { url, finalUrl },
      };
    }

    const bodyChars = await page.evaluate(
      () => document.body?.innerText?.length ?? 0,
    );
    if (bodyChars < 50) {
      return {
        passed: false,
        notes: `페이지가 비어있음 (텍스트 ${bodyChars}자) — 렌더 실패 가능성`,
        evidence: { url, finalUrl, bodyChars },
      };
    }

    if (consoleErrors.length) {
      const first = consoleErrors[0].slice(0, 100);
      return {
        passed: false,
        notes: `콘솔 에러 ${consoleErrors.length}건: ${first}`,
        evidence: { url, finalUrl, consoleErrors: consoleErrors.slice(0, 5) },
      };
    }

    return {
      passed: true,
      notes: `라우트 로드 + 렌더 확인 (${bodyChars}자, 콘솔 에러 없음)`,
      evidence: { url, finalUrl, bodyChars },
    };
  } catch (err) {
    return {
      passed: false,
      notes: `Playwright 실행 중 예외: ${err.message?.slice(0, 120) ?? String(err).slice(0, 120)}`,
    };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // ignore
      }
    }
  }
}
