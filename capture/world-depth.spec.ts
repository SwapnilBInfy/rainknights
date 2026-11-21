// Feature capture: the world's depth. Supply crates and weather shrines on the surface, mud after rain, a minimap,
// and the stairs down to the tunnels (a subway under the street cities, a cave under the coast): dark, dry, full of
// chests, and with an exit somewhere else on the map. See capture/weapons.spec.ts for the pattern.
import { test, expect, chromium, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'output');
const FEATURE = 'world';
const BASE_URL = (process.env.CAPTURE_URL ?? 'https://rainknights.vercel.app/').replace(/\/?$/, '/');
const raf = { polling: 'raf' as const, timeout: 20_000 };
const rk = <T>(page: Page, expr: string) => page.evaluate(`window.__rk.${expr}`) as Promise<T>;
const shot = (page: Page, name: string) => page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-${name}.png`) });

/** A beat for a crate's spill to settle (a level is a message now, not a menu). */
async function dismissMenus(page: Page) {
  await page.waitForTimeout(600);
}

async function begin(page: Page, query: string, digit: string) {
  await page.goto(BASE_URL + query);
  await expect(page.locator('canvas')).toBeVisible();
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-scene', 'TownScene');
  await page.keyboard.down('ArrowDown');
  await expect(app).toHaveAttribute('data-scene', 'RegionSelectScene', { timeout: 15_000 });
  await page.keyboard.up('ArrowDown');
  await page.waitForTimeout(500);
  await page.keyboard.press(digit);
  await page.waitForFunction(() => (window as any).__rk?.hp?.() > 0, undefined, raf);
  await page.evaluate(`window.__rk.clearEnemies()`);
}

for (const [city, digit] of [['nyc', 'Digit1'], ['miami', 'Digit2']] as const) {
  test(`the world's depth in ${city}`, async () => {
    test.setTimeout(180_000);
    await mkdir(OUTPUT_DIR, { recursive: true });
    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 960, height: 640 }, recordVideo: city === 'nyc' ? { dir: OUTPUT_DIR, size: { width: 960, height: 640 } } : undefined });
    const page = await context.newPage();
    await begin(page, '?seed=33&weather=rain', digit);
    await page.waitForTimeout(800);
    await page.keyboard.press('KeyN'); // the map lives in the Bag
    await page.waitForTimeout(400);
    await shot(page, `${city}-map`);
    await page.keyboard.press('KeyI');
    await page.waitForTimeout(300);

    await rk(page, `tpToPoi('crate', 0)`);
    await page.waitForTimeout(350);
    await shot(page, `${city}-crate`);
    await dismissMenus(page);

    await dismissMenus(page);
    await rk(page, `tpToPoi('shrine', 0)`);
    await page.waitForTimeout(500);
    await shot(page, `${city}-shrine-charging`);
    await page.waitForTimeout(1300);
    await shot(page, `${city}-shrine-blessed`);
    await dismissMenus(page);

    await page.evaluate(`window.__rk.clearEnemies()`);
    await rk(page, `tpToPoi('entrance', 0)`);
    await page.waitForTimeout(450);
    await shot(page, `${city}-stairs`);
    await dismissMenus(page);
    await page.waitForFunction(() => (window as any).__rk?.depth?.() === 'underground', undefined, raf);
    await page.waitForTimeout(1600);
    await page.evaluate(`window.__rk.clearEnemies()`);
    await shot(page, `${city}-underground`);

    await rk(page, `tpToStairs('chest', 0)`);
    await page.waitForTimeout(500);
    await shot(page, `${city}-chest`);

    await rk(page, `tpToStairs('far', 0)`);
    await page.waitForFunction(() => (window as any).__rk?.depth?.() === 'surface', undefined, raf);
    await page.waitForTimeout(1500);
    await shot(page, `${city}-emerged`);
    await context.close();
    await browser.close();
  });
}
