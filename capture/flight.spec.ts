// Feature capture: flying. A blue flight pad in Mistford lifts the knight over a world map seen in perspective,
// with every location a star. A descends, B ascends, left and right steer; descend over a star to land there.
// See capture/weapons.spec.ts for the pattern.
import { test, expect, chromium, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'output');
const FEATURE = 'flight';
const BASE_URL = (process.env.CAPTURE_URL ?? 'https://rainknights.vercel.app/').replace(/\/?$/, '/');
const raf = { polling: 'raf' as const, timeout: 20_000 };

async function toPad(page: Page) {
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-scene', 'TownScene');
  await page.keyboard.down('ArrowDown');
  await page.waitForFunction(() => (window as any).__hub?.y() > 176, undefined, raf);
  await page.keyboard.up('ArrowDown');
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => (window as any).__hub?.x() > 232, undefined, raf);
  await page.keyboard.up('ArrowRight');
}
const fl = <T>(page: Page, expr: string) => page.evaluate(`window.__flight.${expr}`) as Promise<T>;

test('a flight pad lifts the knight over a world map: steer, climb, descend and land on a star', async () => {
  test.setTimeout(150_000);
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
  await page.goto(BASE_URL + '?weather=rain');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(600);
  await toPad(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-pad.png`) });

  await page.keyboard.press('Space'); // take off
  await expect(page.locator('#app')).toHaveAttribute('data-scene', 'FlightScene');
  await page.waitForFunction(() => (window as any).__flight?.frames() > 5, undefined, raf);
  await page.waitForTimeout(1600);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}.png`) });

  // climb, turn, and look around
  await page.keyboard.down('KeyJ');
  await page.waitForTimeout(1200);
  await page.keyboard.up('KeyJ');
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(900);
  await page.keyboard.up('ArrowLeft');
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-high.png`) });

  // over a city: the star, the radar and the landing prompt
  await page.evaluate(`window.__flight.teleportTo('london', 12)`);
  await page.evaluate(`window.__flight.state()`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-star.png`) });

  // a star on the horizon, with its beam: fly toward Tokyo from the Atlantic at a safe height
  await page.evaluate(`window.__flight.teleportTo('mistford', 34)`);
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-beacon.png`) });

  // how fast does it run? frames in two seconds
  const fps = await page.evaluate(async () => {
    const f0 = (window as any).__flight.frames();
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 2000));
    return ((window as any).__flight.frames() - f0) / ((performance.now() - t0) / 1000);
  });
  console.log(`flight runs at ${fps.toFixed(1)} fps`);

  await context.close();
  await browser.close();
});
