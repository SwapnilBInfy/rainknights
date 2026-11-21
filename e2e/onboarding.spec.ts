import type { Page } from '@playwright/test';
import { test, expect, beginCityRun } from './fixtures';

// A player who does not know what to do next is told: a tip in Mistford, a goal in a city, a word the first time a rule
// comes up, and a help page in the Bag.

const app = (page: Page) => page.locator('#app');
const rk = <T>(page: Page, expr: string) => page.evaluate(`window.__rk.${expr}`) as Promise<T>;
const objective = (page: Page) => app(page).getAttribute('data-objective');
const save = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('rainknights:save') ?? 'null'));

/** Into Mistford with a patched save (the patch runs after the first visit has written one, then the page reloads). */
async function mistford(page: Page, patch?: (doc: any) => void) {
  await page.goto('/');
  await expect(app(page)).toHaveAttribute('data-scene', 'MenuScene');
  if (patch) {
    await page.keyboard.press('Space');
    await expect(app(page)).toHaveAttribute('data-scene', 'TownScene');
    await page.evaluate((src) => {
      const doc = JSON.parse(localStorage.getItem('rainknights:save') ?? 'null');
      new Function('doc', src)(doc);
      localStorage.setItem('rainknights:save', JSON.stringify(doc));
    }, `(${patch.toString()})(doc)`);
    await page.goto('/');
    await expect(app(page)).toHaveAttribute('data-scene', 'MenuScene');
  }
  await page.keyboard.press(patch ? 'Enter' : 'Space');
  if (patch) await page.keyboard.press('Digit1'); // Continue / into town, whichever the title offers
  await expect(app(page)).toHaveAttribute('data-scene', 'TownScene');
  await page.waitForFunction(() => (window as any).__hub?.frames() > 3);
}

test('a new player is told to fly from the blue pad', async ({ page }) => {
  await mistford(page);
  await expect(app(page)).toHaveAttribute('data-objective', 'FLY: STAND ON THE BLUE PAD');
});

test('once they have flown, the tip moves on: points to spend, then a charm to buy, then the first boss', async ({ page }) => {
  await mistford(page, (doc) => {
    doc.meta.runs = 1;
    doc.town.hero = { level: 2, xp: 0, alloc: { strength: 0, power: 0, endurance: 0, speed: 0 } };
    doc.town.coins = 10;
  });
  await expect(app(page)).toHaveAttribute('data-objective', 'POINTS TO SPEND: SHOP, I');
});

test('with points spent and drips to spare, the tip is to buy a charm; then the first boss', async ({ page }) => {
  await mistford(page, (doc) => {
    doc.meta.runs = 1;
    doc.town.coins = 200;
  });
  await expect(app(page)).toHaveAttribute('data-objective', 'BUY A CHARM AT THE SHOP');
  await mistford(page, (doc) => {
    doc.meta.runs = 1;
    doc.town.coins = 10;
  });
  await expect(app(page)).toHaveAttribute('data-objective', /^FIRST BOSS: NEW YORK, LV\d+\+$/);
});

test('a knight who has won a boss and has nothing pressing is left alone', async ({ page }) => {
  await mistford(page, (doc) => {
    doc.meta.runs = 3;
    doc.meta.wins = 1;
    doc.town.coins = 10;
  });
  expect(await objective(page)).toBeNull();
});

test('in a city the strip says which level opens the next gate, then the boss', async ({ page }) => {
  await page.goto('/?seed=33&weather=clear');
  await beginCityRun(page, 'nyc');
  await page.waitForFunction(() => (window as any).__rk?.hp?.() > 0);
  await expect(app(page)).toHaveAttribute('data-objective', 'REACH LV3: OPENS THE GATE');
  await rk(page, 'setLevel(3)');
  await rk(page, 'grantLevel()'); // (a level gained is when the strip is redrawn)
  await expect(app(page)).toHaveAttribute('data-objective', 'REACH LV6: OPENS THE CORE');
  await rk(page, 'setLevel(6)');
  await rk(page, 'grantLevel()');
  await expect(app(page)).toHaveAttribute('data-objective', /^BOSS AT THE FAR END: LV8\+$/);
  await rk(page, 'setLevel(8)');
  await rk(page, 'grantLevel()');
  await expect(app(page)).toHaveAttribute('data-objective', 'DEFEAT THE BOSS: FAR END');
});

test('the first time a foe spots the knight a tip is shown and remembered; it is not shown again', async ({ page }) => {
  await page.goto('/?seed=33&weather=clear');
  await beginCityRun(page, 'nyc');
  await page.waitForFunction(() => (window as any).__rk?.hp?.() > 0);
  await page.evaluate(`setInterval(() => { try { window.__rk.heal(); } catch {} }, 30)`);
  expect((await save(page)).tips ?? []).toEqual([]);
  const spots = (await rk<{ x: number; y: number }[]>(page, 'camps().spots'));
  const near = [...spots].sort((a, b) => Math.hypot(a.x - 808, a.y - 808) - Math.hypot(b.x - 808, b.y - 808))[0];
  await page.evaluate(`window.__rk.tpTo(${near.x + 40}, ${near.y})`);
  await expect.poll(async () => (await save(page)).tips ?? [], { timeout: 8000 }).toContain('spotted');
  // a second foe noticing the knight adds nothing: the tip is on the list once
  await page.waitForTimeout(1500);
  expect(((await save(page)).tips as string[]).filter((t) => t === 'spotted')).toHaveLength(1);
});

test('walking up to a locked gate explains gates once, and it is remembered', async ({ page }) => {
  await page.goto('/?seed=33&weather=clear');
  await beginCityRun(page, 'nyc');
  await page.waitForFunction(() => (window as any).__rk?.hp?.() > 0);
  await page.evaluate(`window.__rk.clearEnemies()`);
  const gate = (await rk<{ x: number; y: number; ring: number }[]>(page, 'gates()')).find((g) => g.ring === 1)!;
  await page.evaluate(`window.__rk.tpTo(${gate.x}, ${gate.y})`);
  await expect.poll(async () => (await save(page)).tips ?? [], { timeout: 9000 }).toContain('gate');
});

test('the Bag has a HELP page that lists the controls', async ({ page }) => {
  await page.goto('/?seed=33&weather=clear');
  await beginCityRun(page, 'nyc');
  await page.waitForFunction(() => (window as any).__rk?.hp?.() > 0);
  await page.keyboard.press('KeyI');
  await expect(app(page)).toHaveAttribute('data-bag-page', 'top');
  for (const key of ['ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'Space']) {
    await page.waitForTimeout(90);
    await page.keyboard.press(key);
  }
  await expect(app(page)).toHaveAttribute('data-bag-page', 'help');
  await page.screenshot({ path: 'e2e-artifacts/bag-help.png' });
  await page.keyboard.press('Escape');
  await expect(app(page)).toHaveAttribute('data-bag-page', 'top');
  await page.keyboard.press('KeyI');
  await expect(app(page)).not.toHaveAttribute('data-bag-page', /.+/);
});
