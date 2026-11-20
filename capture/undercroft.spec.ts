// Feature capture: the Undercroft (story stage 5). Aurel's tablets in the tunnels under the cities, the cellar hatch in
// Mistford that opens when three have been read, and the crypt below, where the Lantern waits.
import { test, expect, chromium, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultSave, serialize } from '../src/save/save';
import { clearPending, freshStory, interact, readTablet, runEnded, startStory, type StoryState, type Target } from '../src/story/story';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'output');
const BASE_URL = (process.env.CAPTURE_URL ?? 'https://rainknights.vercel.app/').replace(/\/?$/, '/');
const raf = { polling: 'raf' as const, timeout: 20_000 };
const talk = (s: StoryState, t: Target) => interact(s, t).state;
function stage5(): StoryState {
  let s = clearPending(startStory(freshStory()));
  for (const t of ['pia', 'vane', 'marrow'] as const) s = talk(s, t);
  s = clearPending(talk(talk(talk(runEnded(clearPending(s), 'nyc', true).state, 'altar'), 'marrow'), 'marrow'));
  s = runEnded(runEnded(s, 'london', true).state, 'tokyo', true).state;
  s = clearPending(talk(talk(s, 'altar'), 'brent'));
  return clearPending(talk(talk(talk(runEnded(s, 'miami', true).state, 'altar'), 'marrow'), 'marrow'));
}
const shot = (page: Page, name: string) => page.screenshot({ path: join(OUTPUT_DIR, `undercroft-${name}.png`) });
const app = (page: Page) => page.locator('#app');
async function open(page: Page, story: StoryState) {
  const save = defaultSave();
  save.story = story;
  save.town.visited = true;
  save.town.coins = 40;
  await page.addInitScript((raw) => localStorage.getItem('seeded') || (localStorage.setItem('rainknights:save', raw), localStorage.setItem('seeded', '1')), serialize(save));
  await page.goto(BASE_URL + '?weather=rain&seed=33');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(700);
  await page.keyboard.press('KeyG');
  await page.waitForFunction(() => (window as any).__hub?.frames() > 3, undefined, raf);
}

test('the Undercroft', async () => {
  test.setTimeout(240_000);
  await mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 960, height: 640 }, recordVideo: { dir: OUTPUT_DIR, size: { width: 960, height: 640 } } });
  const page = await ctx.newPage();
  await open(page, stage5());
  await page.evaluate(`window.__hub.tp(8, 5)`);
  await page.waitForTimeout(500);
  await shot(page, 'hatch-sealed');
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(300);
  await shot(page, 'journal');
  await page.keyboard.press('KeyQ');

  // a tablet in a tunnel
  await page.evaluate(`window.__hub.tp(8, 12)`);
  await expect(app(page)).toHaveAttribute('data-scene', 'RegionSelectScene', { timeout: 15_000 });
  await page.waitForTimeout(400);
  await page.keyboard.press('Digit1');
  await page.waitForFunction(() => (window as any).__rk?.hp?.() > 0, undefined, raf);
  await page.waitForTimeout(500);
  await shot(page, 'run-objective');
  await page.evaluate(`for (let i = 0; i < 40; i++) window.__rk.killNearest()`);
  await page.evaluate(`window.__rk.tpToPoi('entrance', 0)`);
  await page.waitForFunction(() => (window as any).__rk?.depth?.() === 'underground', undefined, raf);
  await page.waitForTimeout(800);
  await page.evaluate(`for (let i = 0; i < 40; i++) window.__rk.killNearest()`);
  await page.evaluate(`window.__rk.tpToStairs('tablet', 0)`);
  await page.waitForTimeout(700);
  await shot(page, 'tablet');
  await page.waitForTimeout(4200);
  await shot(page, 'tablet-2');
  await ctx.close();

  // three tablets read: the hatch is open; the crypt below
  const ctx2 = await browser.newContext({ viewport: { width: 960, height: 640 }, recordVideo: { dir: OUTPUT_DIR, size: { width: 960, height: 640 } } });
  const p2 = await ctx2.newPage();
  let s = stage5();
  for (const city of ['nyc', 'tokyo', 'miami']) s = readTablet(s, city).state;
  await open(p2, s);
  await p2.evaluate(`window.__hub.tp(8, 5)`);
  await p2.waitForTimeout(400);
  await shot(p2, 'hatch-ready');
  await p2.evaluate(`window.__hub.tp(7, 4)`);
  await p2.keyboard.press('Space');
  for (let i = 0; i < 4; i++) {
    await p2.waitForTimeout(250);
    await p2.keyboard.press('Space');
  }
  await expect(app(p2)).toHaveAttribute('data-scene', 'UndercroftScene', { timeout: 8_000 });
  await p2.waitForTimeout(900);
  await shot(p2, 'crypt');
  await p2.evaluate(`window.__hub.tp(9, 3)`);
  await p2.waitForTimeout(600);
  await shot(p2, 'pedestal');
  await p2.keyboard.press('Space');
  await p2.waitForTimeout(700);
  await shot(p2, 'lantern-taken');
  await ctx2.close();
  await browser.close();
});
