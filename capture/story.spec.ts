// Feature capture: story mode, "The Long Rain". The title link, the prologue, Mistford with the weathervane, the
// altar, Marrow and the journal; the flight map marking the objective; the finale against the Tempest Regent; and
// Mistford in the sun once the rain has stopped. See capture/weapons.spec.ts for the pattern.
import { test, expect, chromium, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultSave, serialize } from '../src/save/save';
import { clearPending, freshStory, interact, readTablet, runEnded, startStory, type StoryState, type Target } from '../src/story/story';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = join(__dirname, 'output');
const FEATURE = 'story';
const BASE_URL = (process.env.CAPTURE_URL ?? 'https://rainknights.vercel.app/').replace(/\/?$/, '/');
const raf = { polling: 'raf' as const, timeout: 20_000 };

const talk = (s: StoryState, t: Target) => interact(s, t).state;
function stageAt(n: number): StoryState {
  let s = clearPending(startStory(freshStory()));
  if (n <= 1) return s;
  for (const t of ['pia', 'vane', 'marrow'] as const) s = talk(s, t);
  s = clearPending(s);
  if (n <= 2) return s;
  s = clearPending(talk(talk(talk(runEnded(s, 'nyc', true).state, 'altar'), 'marrow'), 'marrow'));
  if (n <= 3) return s;
  s = runEnded(runEnded(s, 'london', true).state, 'tokyo', true).state;
  s = clearPending(talk(talk(s, 'altar'), 'brent'));
  if (n <= 4) return s;
  s = clearPending(talk(talk(talk(runEnded(s, 'miami', true).state, 'altar'), 'marrow'), 'marrow'));
  if (n <= 5) return s;
  for (const city of ['nyc', 'london', 'miami']) s = readTablet(s, city).state;
  return clearPending(talk(talk(s, 'hatch'), 'pedestal'));
}

const seedSave = (story: StoryState) => {
  const save = defaultSave();
  save.story = story;
  save.town.visited = true;
  save.town.coins = 40;
  return serialize(save);
};

async function open(page: Page, story: StoryState | null) {
  if (story) {
    await page.addInitScript((raw) => {
      if (!localStorage.getItem('seeded')) {
        localStorage.setItem('rainknights:save', raw);
        localStorage.setItem('seeded', '1');
      }
    }, seedSave(story));
  }
  await page.goto(BASE_URL + '?weather=rain');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(700);
}
const app = (page: Page) => page.locator('#app');
async function skip(page: Page) {
  for (let i = 0; i < 60 && (await app(page).getAttribute('data-scene')) === 'CutsceneScene'; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(120);
  }
}
const shot = (page: Page, name: string) => page.screenshot({ path: join(OUTPUT_DIR, `${FEATURE}-${name}.png`) });

test('story mode: title, prologue, Mistford, journal and the altar', async () => {
  test.setTimeout(240_000);
  await mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 960, height: 640 }, recordVideo: { dir: OUTPUT_DIR, size: { width: 960, height: 640 } } });
  const page = await context.newPage();
  await open(page, null);
  await shot(page, 'title');
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(2600);
  await shot(page, 'prologue');
  await skip(page);
  await page.evaluate(`window.__hub.tp(5, 10)`);
  await page.keyboard.press('Space');
  await page.waitForTimeout(500);
  await shot(page, 'pia');
  for (let i = 0; i < 4; i++) await page.keyboard.press('Space');
  await page.evaluate(`window.__hub.tp(9, 6)`);
  await page.waitForTimeout(700);
  await shot(page, 'mistford');
  await page.keyboard.press('KeyQ');
  await page.waitForTimeout(300);
  await shot(page, 'journal');
  await context.close();

  // three shards home, and Marrow
  const ctx2 = await browser.newContext({ viewport: { width: 960, height: 640 } });
  const p2 = await ctx2.newPage();
  let later = stageAt(4);
  later = talk(runEnded(later, 'miami', true).state, 'altar');
  await open(p2, clearPending(later));
  await p2.keyboard.press('KeyG');
  await p2.waitForTimeout(900);
  await p2.evaluate(`window.__hub.tp(9, 6)`);
  await p2.waitForTimeout(600);
  await shot(p2, 'altar-whole');
  await ctx2.close();
  await browser.close();
});

test('story mode: the finale', async () => {
  test.setTimeout(240_000);
  await mkdir(OUTPUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 960, height: 640 }, recordVideo: { dir: OUTPUT_DIR, size: { width: 960, height: 640 } } });
  const page = await context.newPage();
  await open(page, talk(stageAt(6), 'quill'));
  await page.keyboard.press('KeyG');
  await page.waitForTimeout(800);
  await page.evaluate(`window.__hub.tp(14, 11)`);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => (window as any).__flight?.frames() > 5, undefined, raf);
  await page.waitForTimeout(1500);
  await shot(page, 'flight-objective');
  await page.evaluate(`window.__flight.teleportTo('stormhold', 0.03)`);
  await page.waitForTimeout(600);
  await shot(page, 'flight-eye');
  await page.keyboard.down('Space');
  await page.waitForFunction(() => (window as any).__rk?.hp?.() > 0, undefined, raf);
  await page.keyboard.up('Space');
  await page.evaluate(`for (let i = 0; i < 40; i++) window.__rk.killNearest()`);
  await page.waitForTimeout(1200);
  await shot(page, 'stormhold');
  await page.evaluate(`window.__rk.spawnBoss()`);
  await page.waitForTimeout(1200);
  await shot(page, 'regent');
  await page.waitForFunction(() => (window as any).__rk.lightningCasts() >= 1, undefined, raf);
  await page.waitForTimeout(600);
  await shot(page, 'lightning');
  await page.evaluate(`window.__rk.setBossHp(0.25)`);
  await page.waitForTimeout(2500);
  await shot(page, 'regent-rage');
  await page.evaluate(`window.__rk.killBoss()`);
  await page.waitForTimeout(1600);
  await shot(page, 'gameover');
  await page.keyboard.press('Space');
  await page.waitForTimeout(3200);
  await shot(page, 'ending');
  await skip(page);
  await page.waitForTimeout(900);
  await shot(page, 'sunny');
  await context.close();
  await browser.close();
});
