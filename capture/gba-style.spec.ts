// Feature capture: GBA-Pokémon look & feel (native 240x160, chibi knights,
// swinging weapons, boxed UI). See capture/region-weather.spec.ts for the
// pattern (canvas-only game → driven by keyboard shortcuts, own browser
// context so the video can be finalized and converted to .mp4 with ffmpeg).
import { test, expect, chromium } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
const OUTPUT_DIR = join(__dirname, 'output');
const FEATURE = 'gba-style';
const BASE_URL = process.env.CAPTURE_URL ?? 'https://swapnilbinfy.github.io/rainknights/';

test('game looks and feels like a GBA Pokémon title', async () => {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 960, height: 640 }, // integer zoom 4 of 240x160
    recordVideo: { dir: OUTPUT_DIR, size: { width: 960, height: 640 } },
  });
  const page = await context.newPage();

  await page.goto(BASE_URL);
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(1500); // title screen: knights walking in the rain

  await page.keyboard.press('Space'); // -> character select
  await page.waitForTimeout(700);
  await page.keyboard.press('ArrowDown'); // move the ▶ cursor
  await page.waitForTimeout(500);
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter'); // Rain Knight -> region select
  await page.waitForTimeout(2500); // live weather for both cities
  await page.keyboard.press('Digit1'); // NYC -> the run begins
  await page.waitForTimeout(1200);

  // Demonstrative moment: HUD panels, weather badge, message box, knight.
  await page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}.png`) });

  await page.keyboard.down('KeyD'); // walk right (side-facing walk cycle)
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyD');
  await page.keyboard.down('KeyS'); // walk down (front-facing walk cycle)
  await page.waitForTimeout(1500);
  await page.keyboard.up('KeyS');
  await page.waitForTimeout(1500); // auto-attack swings

  await context.close();
  await browser.close();

  const videoPath = await page.video()?.path();
  if (videoPath) {
    const mp4Path = join(OUTPUT_DIR, `${FEATURE}.mp4`);
    await run('ffmpeg', ['-y', '-i', videoPath, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', mp4Path]);
    await unlink(videoPath).catch(() => {});
  }
});
