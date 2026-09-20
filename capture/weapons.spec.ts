// Feature capture: manual weapon swing (Space) and energy beam (J).
// See capture/region-weather.spec.ts for the pattern this follows.
import { test, expect, chromium } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
const OUTPUT_DIR = join(__dirname, 'output');
const FEATURE = 'weapons';
const BASE_URL = process.env.CAPTURE_URL ?? 'https://swapnilbinfy.github.io/rainknights/';

test('Space swings the weapon and J fires a piercing energy beam', async () => {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 960, height: 640 },
    recordVideo: { dir: OUTPUT_DIR, size: { width: 960, height: 640 } },
  });
  const page = await context.newPage();

  await page.goto(BASE_URL);
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(800);
  await page.keyboard.press('Space'); // title -> character select
  await page.waitForTimeout(600);
  await page.keyboard.press('Enter'); // Rain Knight -> region select
  await page.waitForTimeout(2500);
  await page.keyboard.press('Digit1'); // NYC -> the run begins
  await page.waitForTimeout(3600); // let the first enemies close in

  let shot = false;
  for (const dir of ['KeyD', 'KeyS', 'KeyA', 'KeyW']) {
    await page.keyboard.down(dir); // turn to face this way
    await page.waitForTimeout(250);
    await page.keyboard.up(dir);
    await page.keyboard.press('Space'); // swing
    await page.waitForTimeout(350);
    await page.keyboard.press('KeyJ'); // beam
    if (!shot) {
      await page.waitForTimeout(60);
      // Demonstrative moment: beam mid-flash.
      await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}.png`) });
      shot = true;
    }
    await page.waitForTimeout(900);
  }

  await context.close();
  await browser.close();

  const videoPath = await page.video()?.path();
  if (videoPath) {
    const mp4Path = join(OUTPUT_DIR, `${FEATURE}.mp4`);
    await run('ffmpeg', ['-y', '-i', videoPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4Path]);
    await unlink(videoPath).catch(() => {});
  }
});
