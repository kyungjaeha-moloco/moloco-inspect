import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = 'http://localhost:8000';
const SCREENSHOT_DIR = path.resolve(__dirname, '../public/screenshots');
const MANIFEST_PATH = path.join(SCREENSHOT_DIR, 'manifest.json');

// Routes that don't require auth
const PUBLIC_ROUTES = [
  { id: 'sign-in', path: '/sign-in', name: '로그인' },
  { id: 'reset-password', path: '/reset-password', name: '비밀번호 재설정' },
];

// Routes that require auth (will be skipped if not logged in)
const AUTH_ROUTES = [
  { id: 'select-workplace', path: '/v1/select-workplace', name: '워크스페이스 선택' },
];

interface ScreenManifest {
  id: string;
  name: string;
  path: string;
  screenshotFile: string;
  iframeUrl: string;
  capturedAt: string;
  width: number;
  height: number;
  requiresAuth: boolean;
}

async function main() {
  // Ensure screenshot directory exists
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2, // Retina quality
  });

  // Try to load saved auth state
  const authStatePath = path.resolve(__dirname, '../playwright-auth.json');
  if (fs.existsSync(authStatePath)) {
    try {
      await context.close();
      await browser.close();

      const browser2 = await chromium.launch({ headless: true });
      const context2 = await browser2.newContext({
        storageState: authStatePath,
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 2,
      });

      console.log('[capture] Loaded auth state from playwright-auth.json');
      await captureRoutes(context2, [...PUBLIC_ROUTES, ...AUTH_ROUTES]);
      await context2.close();
      await browser2.close();
      return;
    } catch (e) {
      console.log('[capture] Auth state invalid, proceeding without auth');
    }
  }

  console.log('[capture] No auth state — capturing public routes only');
  console.log('[capture] To capture auth routes, run: npx tsx scripts/save-auth.ts');

  await captureRoutes(context, PUBLIC_ROUTES);
  await context.close();
  await browser.close();
}

async function captureRoutes(context: Awaited<ReturnType<typeof chromium.launch>> extends infer B ? B extends { newContext: (...args: any[]) => Promise<infer C> } ? C : never : never, routes: typeof PUBLIC_ROUTES) {
  const manifest: ScreenManifest[] = [];

  for (const route of routes) {
    const page = await context.newPage();
    const url = `${BASE_URL}${route.path}`;

    console.log(`[capture] ${route.name} → ${url}`);

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

      // Wait a bit for any animations to settle
      await page.waitForTimeout(1000);

      const filename = `${route.id}.png`;
      const filepath = path.join(SCREENSHOT_DIR, filename);

      await page.screenshot({
        path: filepath,
        fullPage: false, // Viewport only (1440x900)
      });

      manifest.push({
        id: route.id,
        name: route.name,
        path: route.path,
        screenshotFile: filename,
        iframeUrl: url,
        capturedAt: new Date().toISOString(),
        width: 1440,
        height: 900,
        requiresAuth: AUTH_ROUTES.some(r => r.id === route.id),
      });

      console.log(`  saved ${filename}`);
    } catch (err) {
      console.error(`  failed: ${(err as Error).message}`);
    }

    await page.close();
  }

  // Write manifest
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  console.log(`\n[capture] Done! ${manifest.length} screens captured.`);
  console.log(`[capture] Manifest: ${MANIFEST_PATH}`);
  console.log(`[capture] Screenshots: ${SCREENSHOT_DIR}/`);
}

main().catch(console.error);
