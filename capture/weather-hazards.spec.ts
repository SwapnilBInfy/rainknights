// Feature capture: status effects and weather hazards.
// Thunderstorm (telegraphed lightning + Wet), heat (scorch + burning) and a
// cold front (frost patch -> frozen). Hazards are forced with the debug bridge
// so the clip is deterministic. See capture/weapons.spec.ts for the pattern.
import { test, expect, chromium, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
const OUTPUT_DIR = join(__dirname, 'output');
const FEATURE = 'weather-hazards';
const BASE_URL = (process.env.CAPTURE_URL ?? 'https://rainknights.vercel.app/').replace(/\/?$/, '/');

async function begin(page: Page, weather: string) {
  await page.goto(`${BASE_URL}?weather=${weather}`);
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(800);
  await page.keyboard.press('Space'); // title -> character select
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter'); // Rain Knight -> region select
  await page.waitForTimeout(2500);
  await page.keyboard.press('Digit1'); // NYC -> the run begins
  await page.waitForTimeout(1800); // rain soaks the knight
}

const trigger = (page: Page, kind: string, dx: number) =>
  page.evaluate(([k, d]) => (window as any).__rk.triggerHazard(k, d, 0), [kind, dx] as const);

test('weather hazards are telegraphed, then soak, burn, shock and freeze', async () => {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 960, height: 640 },
    recordVideo: { dir: OUTPUT_DIR, size: { width: 960, height: 640 } },
  });
  // Each scene starts a fresh run, not the previous scene's saved one.
  await context.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {}
  });
  const page = await context.newPage();

  // 1) Thunderstorm: the circle blinks and closes in, then lightning lands.
  await begin(page, 'thunderstorm');
  await trigger(page, 'lightning', 0);
  await page.waitForTimeout(700);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}.png`) }); // the warning
  await page.waitForTimeout(430);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-strike.png`) });
  await page.waitForTimeout(1200);

  // 2) Heat: a scorch patch sets the knight on fire.
  await begin(page, 'heat');
  await trigger(page, 'scorch', 0);
  await page.waitForFunction(() => (window as any).__rk.statuses().includes('burning'), undefined, { timeout: 8000 });
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-burning.png`) });
  await page.waitForTimeout(1200);

  // 3) Cold front: a frost patch freezes the knight solid.
  await begin(page, 'cold_front');
  await trigger(page, 'frost', 0);
  await page.waitForFunction(() => (window as any).__rk.statuses().includes('frozen'), undefined, { timeout: 8000 });
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-frozen.png`) });
  await page.waitForTimeout(1500);

  await context.close();
  await browser.close();

  const videoPath = await page.video()?.path();
  if (videoPath) {
    const mp4Path = join(OUTPUT_DIR, `${FEATURE}.mp4`);
    await run('ffmpeg', ['-y', '-i', videoPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4Path]);
    await unlink(videoPath).catch(() => {});
  }
});
