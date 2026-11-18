// Feature capture: the optional tutorial, started from the title with T.
// Real input for movement, swinging and the beam; the debug bridge skips the
// slow parts (gems, killing the cab) so the clip stays short.
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
const FEATURE = 'tutorial';
const BASE_URL = (process.env.CAPTURE_URL ?? 'https://rainknights.vercel.app/').replace(/\/?$/, '/');
const raf = { polling: 'raf' as const, timeout: 30_000 };

const toStep = (page: Page, id: string) => page.waitForFunction((s) => (window as any).__rk.tutorialStep() === s, id, raf);
const shot = (page: Page, name: string) => page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}${name}.png`) });

test('the title offers a tutorial that teaches each mechanic in the real game', async () => {
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

  await page.goto(BASE_URL);
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(1500);
  await shot(page, ''); // the title with its "T: TUTORIAL" link
  await page.keyboard.press('KeyT');
  await toStep(page, 'move');
  await page.waitForTimeout(900);
  await shot(page, '-move');

  await page.keyboard.down('KeyD'); // 1 move
  await toStep(page, 'swing');
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(500);
  await shot(page, '-swing');
  await page.keyboard.down('Space'); // 2 swing
  await toStep(page, 'beam');
  await page.keyboard.up('Space');
  await page.waitForTimeout(700);
  await shot(page, '-beam');
  await page.keyboard.down('KeyJ'); // 3 beam
  await toStep(page, 'gems');
  await page.keyboard.up('KeyJ');
  await page.waitForTimeout(700);
  await shot(page, '-gems');

  await page.keyboard.press('Enter'); // skip the walk to the gems: 5 level up
  await toStep(page, 'levelup');
  await page.waitForTimeout(900);
  await shot(page, '-levelup');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await toStep(page, 'dodge');
  await page.waitForFunction(() => (window as any).__rk.alerts() > 0, undefined, raf);
  await page.waitForTimeout(450);
  await shot(page, '-dodge'); // the cab's lane
  await page.waitForTimeout(2200);

  await page.keyboard.press('Enter'); // skip to strike, then defeat the cab
  await toStep(page, 'strike');
  await page.evaluate(`window.__rk.killNearest()`);
  await toStep(page, 'wet');
  await page.waitForTimeout(600);
  await shot(page, '-wet');
  await page.keyboard.down('KeyJ');
  await toStep(page, 'storm');
  await page.keyboard.up('KeyJ');
  await page.waitForFunction(() => (window as any).__rk.hazards()?.zones?.length > 0, undefined, raf);
  await page.waitForTimeout(500);
  await shot(page, '-storm'); // the blinking circle
  await page.keyboard.down('KeyD');
  await toStep(page, 'done');
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(900);
  await shot(page, '-done');
  await page.keyboard.press('Space');
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
