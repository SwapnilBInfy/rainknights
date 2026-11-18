// Feature capture: the world. City-shaped seeded maps; weather freezes water, floods streets and dries shallows;
// tiles slow, soak and slide you; lightning runs through water. See capture/weapons.spec.ts for the pattern.
import { test, expect, chromium, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
const OUTPUT_DIR = join(__dirname, 'output');
const FEATURE = 'terrain';
const BASE_URL = (process.env.CAPTURE_URL ?? 'https://rainknights.vercel.app/').replace(/\/?$/, '/');
const raf = { polling: 'raf' as const, timeout: 20_000 };
const GRASS = 0;
const SHALLOW = 5;
const ICE = 6;
const BRIDGE = 8;

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
  await page.evaluate(`for (let i = 0; i < 30; i++) window.__rk.killNearest()`); // a quiet moment for the shot
}
const tp = (page: Page, type: number, run = 0) => page.evaluate(`window.__rk.tpToTile(${type}, ${run})`);

test('maps are shaped like the city and the weather changes them: bridges, ice, floods, water that carries lightning', async () => {
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

  // 1) New York: a bridge over the river between city blocks.
  await begin(page, '?seed=11');
  await tp(page, BRIDGE, 2);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}.png`) });

  // 2) A cold front froze the river: walk onto the ice and slide.
  await begin(page, '?seed=11&weather=cold_front');
  await tp(page, ICE, 6);
  await page.waitForFunction(() => (window as any).__rk.terrain().grip < 1, undefined, raf);
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-ice.png`) });
  await page.keyboard.down('KeyD');
  await page.waitForTimeout(600);
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-slide.png`) }); // still gliding after letting go
  await page.waitForTimeout(900);

  // 3) A thunderstorm: stand in a puddle and a strike lands two tiles away. The water lights up as a warning,
  //    then everyone standing in it is shocked.
  await begin(page, '?seed=11&weather=thunderstorm');
  await tp(page, SHALLOW, 2);
  await page.waitForFunction(() => (window as any).__rk.terrain().speed < 1, undefined, raf);
  await page.waitForTimeout(600);
  await page.evaluate(`window.__rk.triggerHazard('lightning', 32, 0)`);
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-conduct-warning.png`) });
  await page.waitForFunction(() => (window as any).__rk.statuses().includes('shocked'), undefined, raf);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-conduct.png`) });
  await page.waitForTimeout(900);

  // 4) A hurricane has already flooded the streets.
  await begin(page, '?seed=11&weather=hurricane');
  await tp(page, SHALLOW, 3);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-flood.png`) });

  // 5) Miami: boardwalks over canals, with the ocean at the edge.
  await begin(page, '?seed=33', 'Digit2');
  await tp(page, BRIDGE, 2);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-miami.png`) });
  await page.waitForTimeout(500);

  await context.close();
  await browser.close();

  const videoPath = await page.video()?.path();
  if (videoPath) {
    const mp4Path = join(OUTPUT_DIR, `${FEATURE}.mp4`);
    await run('ffmpeg', ['-y', '-i', videoPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4Path]);
    await unlink(videoPath).catch(() => {});
  }
});
