// Feature capture: dodge roll (Shift / K) plus combat juice (damage numbers,
// hit-stop, "!" attack warnings, DODGE popup). Uses the debug bridge to place
// enemies so the clip is deterministic. See capture/weapons.spec.ts.
import { test, expect, chromium, type Page } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
const OUTPUT_DIR = join(__dirname, 'output');
const FEATURE = 'dodge-roll';
const BASE_URL = (process.env.CAPTURE_URL ?? 'https://rainknights.vercel.app/').replace(/\/?$/, '/');

const ev = <T>(page: Page, expr: string) => page.evaluate(expr) as Promise<T>;

test('the knight rolls through danger; hits show numbers and attacks show a warning', async () => {
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

  await page.goto(BASE_URL);
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(800);
  await page.keyboard.press('Space'); // title -> character select
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter'); // Rain Knight -> region select
  await page.waitForTimeout(2500);
  await page.keyboard.press('Digit1'); // NYC -> the run begins
  await page.waitForTimeout(1200);

  // 1) Swing at an imp: damage numbers float up and the kill freezes for a beat.
  await ev(page, `window.__rk.spawnEnemy('rainImp', 26, 0)`);
  await page.keyboard.down('KeyD'); // face right
  await page.waitForTimeout(120);
  await page.keyboard.up('KeyD');
  await page.keyboard.press('Space');
  await page.waitForTimeout(110);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-numbers.png`) });
  await page.waitForTimeout(700);

  // 2) A wisp winds up a dash: a yellow "!" marks it.
  await ev(page, `window.__rk.spawnEnemy('lightningWisp', 70, -10)`);
  await page.waitForFunction(() => (window as any).__rk.alerts() > 0, undefined, { timeout: 5000 });
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-warning.png`) });
  await page.waitForTimeout(500);

  // 3) Roll: the knight tumbles, leaves a trail, and the gauge empties.
  await page.keyboard.down('KeyA');
  await page.keyboard.press('KeyK');
  await page.waitForTimeout(90);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}.png`) });
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyA');

  // 4) Roll through an enemy that was about to hit: DODGE.
  await page.waitForFunction(() => (window as any).__rk.rollCharge() >= 1, undefined, { timeout: 4000 });
  await ev(page, `window.__rk.spawnEnemy('windWraith', -28, 0)`);
  await page.keyboard.press('KeyK');
  await page.waitForFunction(() => (window as any).__rk.dodges() > 0, undefined, { timeout: 2000 });
  await page.waitForTimeout(60);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-dodge.png`) });
  await page.waitForTimeout(1200);

  await context.close();
  await browser.close();

  const videoPath = await page.video()?.path();
  if (videoPath) {
    const mp4Path = join(OUTPUT_DIR, `${FEATURE}.mp4`);
    await run('ffmpeg', ['-y', '-i', videoPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4Path]);
    await unlink(videoPath).catch(() => {});
  }
});
