import { chromium } from '@playwright/test';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = 'http://localhost:8000';
const AUTH_STATE_PATH = path.resolve(__dirname, '../playwright-auth.json');

async function main() {
  console.log('[auth] Opening browser for manual login...');
  console.log('[auth] Please log in at the browser window.');
  console.log('[auth] After logging in, press Enter here to save the session.\n');

  const browser = await chromium.launch({ headless: false }); // Visible browser
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();
  await page.goto(`${BASE_URL}/sign-in`);

  // Wait for user to press Enter in terminal
  await new Promise<void>((resolve) => {
    process.stdin.once('data', () => resolve());
  });

  // Save auth state
  await context.storageState({ path: AUTH_STATE_PATH });
  console.log(`[auth] Session saved to ${AUTH_STATE_PATH}`);
  console.log('[auth] Now run: npx tsx scripts/capture-screens.ts');

  await browser.close();
}

main().catch(console.error);
