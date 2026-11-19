// Feature capture: more cities. London, Tokyo and Mumbai join New York and Miami: a five-city picker with a
// card for the highlighted city, then a run in each (their own map shape, colours, props and weather rules).
// See capture/weapons.spec.ts for the pattern.
import { test, expect, chromium, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'output');
const FEATURE = 'cities';
const BASE_URL = (process.env.CAPTURE_URL ?? 'https://rainknights.vercel.app/').replace(/\/?$/, '/');
const raf = { polling: 'raf' as const, timeout: 20_000 };
const CITIES = ['nyc', 'miami', 'london', 'tokyo', 'mumbai'];

async function toPicker(page: Page, query: string) {
  await page.goto(BASE_URL + query);
  await expect(page.locator('canvas')).toBeVisible();
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-scene', 'TownScene');
  await page.keyboard.down('ArrowDown');
  try {
    await expect(app).toHaveAttribute('data-scene', 'RegionSelectScene', { timeout: 8_000 });
  } finally {
    await page.keyboard.up('ArrowDown');
  }
  await page.waitForTimeout(600);
}

test('five cities: pick any from the list, each plays in its own shape and colours', async () => {
  test.setTimeout(240_000);
  await mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 960, height: 640 },
    recordVideo: { dir: OUTPUT_DIR, size: { width: 960, height: 640 } },
  });
  await context.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {}
  });
  const page = await context.newPage();

  // 1) The picker, walking down the list.
  await toPicker(page, '?seed=33&weather=rain');
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-picker-1.png`) });
  for (let i = 1; i < CITIES.length; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-picker-${i + 1}.png`) });
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}.png`) });

  // 2) A run in each city.
  for (const [i, city] of CITIES.entries()) {
    await toPicker(page, '?seed=33&weather=rain');
    await page.keyboard.press(`Digit${i + 1}`);
    await page.waitForFunction(() => (window as any).__rk?.hp?.() > 0, undefined, raf);
    await page.evaluate(`for (let i = 0; i < 30; i++) window.__rk.killNearest()`);
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-${city}.png`) });
    // and on a bridge, so the river or the sea shows
    await page.evaluate(`window.__rk.tpToTile(8, 2)`);
    await page.waitForTimeout(900);
    await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-${city}-bridge.png`) });
  }

  await context.close();
  await browser.close();
});
