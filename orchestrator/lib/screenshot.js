/**
 * Host-side Playwright helper used by:
 *   - QA adapters (agent-review captures screenshots + console errors)
 *   - molly's Slack completion message (attaches the result page screenshot)
 *
 * Why host-side: chromium is installed on the orchestrator host (~300MB),
 * not in the sandbox docker image. Targeting the sandbox's vite via
 * `localhost:${vitePort}` works because docker forwards the port to the
 * host. Adding chromium to the sandbox would balloon the image; keeping
 * it host-side is the cheaper trade.
 *
 * Lazy import keeps orchestrator boot fast even if playwright is missing.
 */

let cachedChromium = null;

async function loadChromium() {
  if (cachedChromium) return cachedChromium;
  const mod = await import('playwright');
  cachedChromium = mod.chromium;
  return cachedChromium;
}

/**
 * Drive headless chromium against the playground's vite dev server,
 * collect navigation + render evidence.
 *
 * @param {{ vitePort: number, route: string, fullPage?: boolean }} opts
 * @returns {Promise<{
 *   screenshotBytes: Buffer | null,
 *   httpStatus: number | null,
 *   finalUrl: string | null,
 *   consoleErrors: string[],
 *   pageErrors: string[],
 *   bodyText: string,
 *   navigationError: string | null,
 * }>}
 */
export async function capturePageEvidence({ vitePort, route, fullPage = false }) {
  if (!vitePort) throw new Error('vitePort required');
  const targetRoute = typeof route === 'string' && route.startsWith('/') ? route : '/';
  const url = `http://127.0.0.1:${vitePort}${targetRoute}`;

  let chromium;
  try {
    chromium = await loadChromium();
  } catch (err) {
    throw new Error(`playwright import failed: ${err.message}`);
  }

  /** @type {string[]} */
  const consoleErrors = [];
  /** @type {string[]} */
  const pageErrors = [];
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)));
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    /** @type {import('playwright').Response | null} */
    let resp = null;
    let navigationError = null;
    try {
      resp = await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 15_000,
      });
    } catch (err) {
      // networkidle is strict — fall back to domcontentloaded + 2s settle
      // for SPAs with long-running fetches that never quiesce.
      try {
        resp = await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 10_000,
        });
        await page.waitForTimeout(2_000);
      } catch (err2) {
        navigationError = err2.message?.slice(0, 200) ?? String(err2).slice(0, 200);
      }
    }

    const httpStatus = resp?.status() ?? null;
    const finalUrl = page.url();
    let bodyText = '';
    try {
      bodyText = await page.evaluate(
        () => document.body?.innerText?.slice(0, 2000) ?? '',
      );
    } catch {
      /* swallow — page may have crashed mid-evaluate */
    }

    let screenshotBytes = null;
    try {
      screenshotBytes = await page.screenshot({ fullPage, type: 'png' });
    } catch (err) {
      // Screenshot may fail on totally blank/crashed pages — that's a
      // signal in itself. Caller decides what to do.
      pageErrors.push(`screenshot failed: ${err.message}`);
    }

    return {
      screenshotBytes,
      httpStatus,
      finalUrl,
      consoleErrors,
      pageErrors,
      bodyText,
      navigationError,
    };
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
    }
  }
}
