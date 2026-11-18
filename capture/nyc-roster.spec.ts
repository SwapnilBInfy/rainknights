// Feature capture: New York's signature enemy (Cab Wraith) and boss (Phantom Bus).
// The debug bridge places them so the clip is deterministic. See capture/weapons.spec.ts.
import { test, expect, chromium } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
const OUTPUT_DIR = join(__dirname, 'output');
const FEATURE = 'nyc-roster';
const BASE_URL = (process.env.CAPTURE_URL ?? 'https://rainknights.vercel.app/').replace(/\/?$/, '/');
const raf = { polling: 'raf' as const, timeout: 25_000 };

test('a Cab Wraith charges down its lane; the Phantom Bus boss lumbers in and enrages', async () => {
  test.setTimeout(90_000); // waits on real wind-up timings
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
  await page.keyboard.press('Digit1'); // New York -> the run begins
  await page.waitForTimeout(1500);

  // 1) A Cab Wraith: honks and shows its lane, charges, then stalls (the moment to hit it).
  await page.evaluate(`window.__rk.spawnEnemy('cabWraith', 90, -20)`);
  await page.waitForFunction(() => (window as any).__rk.alerts() > 0, undefined, raf);
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}.png`) }); // the lane
  await page.waitForFunction(() => (window as any).__rk.enemyPhases().includes('charge'), undefined, raf);
  await page.waitForTimeout(120);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-charge.png`) });
  await page.waitForFunction(() => (window as any).__rk.enemyPhases().includes('stall'), undefined, raf);
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-stall.png`) });
  await page.waitForTimeout(800);

  // 2) The boss: the Phantom Bus.
  await page.evaluate(`window.__rk.spawnBoss()`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-boss-intro.png`) });
  await page.waitForFunction(
    () => {
      const rk = (window as any).__rk;
      const i = rk.enemyTypes().indexOf('phantomBus');
      return i >= 0 && rk.enemyPhases()[i] === 'telegraph';
    },
    undefined,
    raf
  );
  await page.waitForTimeout(650);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-boss-lane.png`) });

  // 3) Below half health it enrages: a redder lane, faster charges, backup arrives.
  await page.evaluate(`window.__rk.setBossHp(0.45)`);
  await page.waitForFunction(() => (window as any).__rk.bossRaging(), undefined, raf);
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-boss-rage.png`) });
  await page.waitForTimeout(2500);

  await context.close();
  await browser.close();

  const videoPath = await page.video()?.path();
  if (videoPath) {
    const mp4Path = join(OUTPUT_DIR, `${FEATURE}.mp4`);
    await run('ffmpeg', ['-y', '-i', videoPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4Path]);
    await unlink(videoPath).catch(() => {});
  }
});
