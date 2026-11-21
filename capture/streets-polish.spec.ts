// Feature capture: streets suit the vehicles (street-direction lanes, a lane that stops at a wall, crashes) and the
// painted world (curbs, lane markings, wall faces, shorelines, rails, trees, parked cars, lamps, palms, umbrellas).
// See capture/weapons.spec.ts for the pattern.
import { test, expect, chromium, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
const OUTPUT_DIR = join(__dirname, 'output');
const FEATURE = 'streets-polish';
const BASE_URL = (process.env.CAPTURE_URL ?? 'https://rainknights.vercel.app/').replace(/\/?$/, '/');
const raf = { polling: 'raf' as const, timeout: 25_000 };
const BRIDGE = 8;
const TREE = 9;
const CAR = 10;
const PROP = 11;

async function begin(page: Page, query: string, city: 'Digit1' | 'Digit2' = 'Digit1') {
  await page.goto(BASE_URL + query);
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(700);
  await page.keyboard.press('Space'); // title -> character select
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter'); // Rain Knight -> region select
  await page.waitForTimeout(2200);
  await page.keyboard.press(city); // the run begins
  await page.waitForFunction(() => (window as any).__rk?.hp?.() > 0, undefined, raf);
  await page.evaluate(`window.__rk.clearEnemies()`); // a quiet moment for the shot
}
const tp = (page: Page, type: number, run = 0, dx = 0, dy = 0) => page.evaluate(`window.__rk.tpToTile(${type}, ${run}, ${dx}, ${dy})`);

test('the streets are dressed, and vehicles line up along them and crash at the end of one', async () => {
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

  // 1) A New York street: curbs, a dashed centre line, parked cars, trees, lamps, building fronts with windows.
  await begin(page, '?seed=11');
  await tp(page, CAR, 0, 0, 1);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}.png`) });
  await tp(page, TREE, 0, 0, 1);
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-trees.png`) });
  await tp(page, BRIDGE, 2);
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-bridge.png`) }); // rails, shoreline foam, a deck shadow on the water

  // 2) A Cab Wraith lines up along the street. The lane stops at the wall; it crashes into it.
  await begin(page, '?seed=11');
  await page.evaluate(`window.__rk.tpStreetEnd(1)`);
  await page.waitForTimeout(500);
  await page.evaluate(`window.__rk.spawnEnemy('cabWraith', -64, 0)`);
  await page.waitForFunction(() => (window as any).__rk.alerts() > 0, undefined, raf);
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-lane.png`) }); // the lane, ending in a burst at the wall
  await page.waitForFunction(() => (window as any).__rk.crashes() > 0, undefined, raf);
  await page.waitForTimeout(120);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-crash.png`) });
  await page.waitForTimeout(1500);

  // 3) Miami: palms and umbrellas on the beach, a boardwalk bridge over a canal.
  await begin(page, '?seed=33', 'Digit2');
  await tp(page, PROP, 0, 0, 1);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-miami.png`) });
  await tp(page, BRIDGE, 2);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-miami-bridge.png`) });

  await context.close();
  await browser.close();

  const videoPath = await page.video()?.path();
  if (videoPath) {
    const mp4Path = join(OUTPUT_DIR, `${FEATURE}.mp4`);
    await run('ffmpeg', ['-y', '-i', videoPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4Path]);
    await unlink(videoPath).catch(() => {});
  }
});
