import type { Page } from '@playwright/test';
import { test, expect, beginCityRun } from './fixtures';

// The enemies of a city live at fixed spots, looping, and only come for the knight once they spot them. A defeated
// one is back once the knight has been far away. The boss waits at the far end. The knight's growth lasts.

type Spot = { x: number; y: number; type: string; alive: boolean; aggro: boolean; at: { x: number; y: number } | null };
type Camps = { count: number; alive: number; empty: number; spots: Spot[]; boss: { x: number; y: number; aggro: boolean } | null };
const camps = (page: Page) => page.evaluate(`window.__rk.camps()`) as Promise<Camps>;
const rk = <T>(page: Page, expr: string) => page.evaluate(`window.__rk.${expr}`) as Promise<T>;
const tp = (page: Page, x: number, y: number) => page.evaluate(`window.__rk.tpTo(${x}, ${y})`);
// (a knight who wanders into a camp could die before a test has made its point; the tests are not about survival)
const heal = (page: Page) => page.evaluate(`setInterval(() => { try { window.__rk.heal(); } catch {} }, 30)`);

/** Remember (in the page, every frame) whether any resident has noticed the knight: a fight can be over in a blink. */
const watchAggro = (page: Page) =>
  page.evaluate(() => {
    const w = window as any;
    w.__saw = false;
    const tick = () => {
      try {
        if (w.__rk.camps().spots.some((s: { aggro: boolean }) => s.aggro)) w.__saw = true;
      } catch {
        /* the scene is gone */
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
const sawAggro = (page: Page) => page.waitForFunction(() => (window as any).__saw === true, undefined, { polling: 'raf', timeout: 8_000 });

async function begin(page: Page, city = 'nyc') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/?seed=33&weather=clear');
  await beginCityRun(page, city);
  await page.waitForFunction(() => (window as any).__rk?.hp?.() > 0);
  return errors;
}

/** A resident near the plaza (the easy outskirts) that stands apart from the others, so a test can walk up to it alone. */
const loner = (c: Camps, me: { x: number; y: number }, type?: string) => {
  const apart = c.spots.filter((s) => (!type || s.type === type) && c.spots.filter((o) => o !== s && Math.hypot(o.x - s.x, o.y - s.y) < 150).length <= 1);
  const pool = apart.length > 0 ? apart : c.spots;
  return [...pool].sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
};
const knight = async (page: Page) => ({ x: await rk<number>(page, 'x()'), y: await rk<number>(page, 'y()') });

test('a city starts full of residents at fixed spots, and the knight starts in peace', async ({ page }) => {
  const errors = await begin(page);
  const c = await camps(page);
  expect(c.count).toBeGreaterThanOrEqual(30);
  expect(c.alive).toBe(c.count);
  expect(c.boss).not.toBeNull();
  // none is near the plaza the knight starts on, and none has noticed them
  const me = { x: await rk<number>(page, 'x()'), y: await rk<number>(page, 'y()') };
  for (const s of c.spots) expect(Math.hypot(s.x - me.x, s.y - me.y)).toBeGreaterThan(150);
  expect(c.spots.some((s) => s.aggro)).toBe(false);
  expect(c.boss!.aggro).toBe(false);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('residents stay near their spots, looping, while the knight is away', async ({ page }) => {
  const errors = await begin(page);
  await page.waitForTimeout(2500);
  const c = await camps(page);
  for (const s of c.spots) {
    expect(s.at, `${s.type} still stands`).not.toBeNull();
    expect(Math.hypot(s.at!.x - s.x, s.at!.y - s.y), `${s.type} strayed from its spot`).toBeLessThan(40);
  }
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a resident that spots the knight comes for them; one that does not, does not', async ({ page }) => {
  const errors = await begin(page);
  await heal(page);
  const target = loner(await camps(page), await knight(page));
  await watchAggro(page);
  // 200px away: out of sight
  await tp(page, target.x + 200, target.y);
  await page.waitForTimeout(700);
  expect(await page.evaluate(() => (window as any).__saw)).toBe(false);
  // close in: spotted
  await tp(page, target.x + 40, target.y);
  await sawAggro(page);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a resident gives up when the knight gets away, and walks home', async ({ page }) => {
  const errors = await begin(page);
  await heal(page);
  const target = loner(await camps(page), await knight(page));
  await watchAggro(page);
  await tp(page, target.x + 40, target.y);
  await sawAggro(page);
  // leave far behind, at once
  const far = target.x > 800 ? target.x - 600 : target.x + 600;
  await tp(page, far, target.y);
  // whoever lived through that settles: nobody chases, and the survivors are back at their spots
  await page.waitForFunction(
    (t) => {
      const spots = (window as any).__rk.camps().spots as Spot[];
      if (spots.some((s) => s.aggro)) return false;
      const home = spots.filter((s) => s.alive && Math.hypot(s.x - t.x, s.y - t.y) < 60);
      return home.every((s) => Math.hypot(s.at!.x - s.x, s.at!.y - s.y) < 40);
    },
    target,
    { polling: 'raf', timeout: 12_000 }
  );
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a defeated resident stays down until the knight has been away and come back', async ({ page }) => {
  const errors = await begin(page);
  await heal(page);
  const c0 = await camps(page);
  const target = loner(c0, await knight(page));
  await tp(page, target.x + 30, target.y);
  await page.waitForTimeout(150);
  // defeat what is near (the nearest is the one at this spot, or one of its camp)
  await page.evaluate(`window.__rk.killNearest()`);
  const down = await camps(page);
  expect(down.alive).toBeLessThan(c0.count); // (the fight's own bolts may have dropped a neighbour too)
  // still near: it stays down
  await page.waitForTimeout(800);
  expect((await camps(page)).alive).toBeLessThan(c0.count);
  // go far away (more than the respawn distance), and it comes back
  await tp(page, Math.min(1500, Math.max(100, target.x > 800 ? target.x - 600 : target.x + 600)), target.y);
  await page.waitForFunction((n) => (window as any).__rk.camps().alive >= n, c0.count, { polling: 'raf', timeout: 8_000 });
  expect(errors, errors.join('\n')).toEqual([]);
});

test('the boss waits at the far end and stands still until the knight comes, then the fight begins', async ({ page }) => {
  const errors = await begin(page);
  await heal(page);
  const c = await camps(page);
  const boss = c.boss!;
  const me = { x: await rk<number>(page, 'x()'), y: await rk<number>(page, 'y()') };
  expect(Math.hypot(boss.x - me.x, boss.y - me.y)).toBeGreaterThan(400); // the far end of the map
  await page.waitForTimeout(1500);
  const still = (await camps(page)).boss!;
  expect(Math.hypot(still.x - boss.x, still.y - boss.y)).toBeLessThan(6);
  expect(await rk<number | null>(page, 'bossHpFraction()')).toBe(1);
  // arrive: it notices, and the bar shows
  await tp(page, boss.x + 60, boss.y);
  await page.waitForFunction(() => (window as any).__rk.camps().boss?.aggro, undefined, { polling: 'raf', timeout: 5_000 });
  expect(errors, errors.join('\n')).toEqual([]);
});

test('defeating the waiting boss wins the run', async ({ page }) => {
  const errors = await begin(page, 'miami');
  await heal(page);
  const boss = (await camps(page)).boss!;
  await tp(page, boss.x + 60, boss.y);
  await page.waitForFunction(() => (window as any).__rk.camps().boss?.aggro, undefined, { polling: 'raf', timeout: 5_000 });
  await page.evaluate(`window.__rk.killBoss()`);
  await expect(page.locator('#app')).toHaveAttribute('data-scene', 'GameOverScene', { timeout: 10_000 });
  // the first boss won earns the second knight
  await expect(page.locator('#app')).toHaveAttribute('data-new-knight', /Hail Warden/);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('level, XP and spent points last: a defeat keeps them, and the next fight starts with them', async ({ page }) => {
  const errors = await begin(page);
  await page.evaluate(`window.__rk.grantLevel()`);
  await page.waitForFunction(() => (window as any).__rk.level() === 2);
  expect(await rk<boolean>(page, `spend('strength', 1)`)).toBe(true);
  await rk(page, 'addXp(5)');
  await page.waitForTimeout(200);
  // the profile holds the growth
  const hero = await page.evaluate(() => JSON.parse(localStorage.getItem('rainknights:save') ?? 'null').town.hero);
  expect(hero.level).toBe(2);
  expect(hero.alloc.strength).toBe(1);
  // a defeat sends the knight home, with their level
  await page.evaluate(`window.__rk.defeat()`);
  await expect(page.locator('#app')).toHaveAttribute('data-scene', 'GameOverScene', { timeout: 10_000 });
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('rainknights:save') ?? 'null').town.hero);
  expect(after.level).toBe(2);
  expect(after.alloc.strength).toBe(1);
  // and the next fight, anywhere, starts as that knight
  await page.goto('/?seed=33&weather=clear');
  await beginCityRun(page, 'london');
  await page.waitForFunction(() => (window as any).__rk?.hp?.() > 0);
  expect(await rk<number>(page, 'level()')).toBe(2);
  expect(await rk<number>(page, 'statPoints()')).toBe(2); // 3 earned, 1 spent
  expect(errors, errors.join('\n')).toEqual([]);
});

test('the battle screen has no clock', async ({ page }) => {
  await begin(page);
  // the HUD draws no timer text any more: the only texts are the level and the weather
  const texts = await page.evaluate(() => (window as any).__rk.hudTexts?.() ?? null);
  expect(texts === null || !texts.some((t: string) => /^\d\d:\d\d$/.test(t))).toBe(true);
});
