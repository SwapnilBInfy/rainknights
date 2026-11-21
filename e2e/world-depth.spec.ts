import { beginCityRun, test, expect } from './fixtures';
import { type Page } from '@playwright/test';

// The world's depth: supply crates and weather shrines on the surface, mud after rain, a minimap, and the stairs down
// to the tunnels (a subway under the street cities, a cave under the coast): dark, dry, full of chests, and with an
// exit somewhere else on the map.

const frame = { polling: 'raf' as const, timeout: 20_000 };
const rk = <T>(page: Page, expr: string) => page.evaluate(`window.__rk.${expr}`) as Promise<T>;
const app = (page: Page) => page.locator('#app');
type PoiRow = { id: number; kind: string; col: number; row: number; used: boolean };

async function begin(page: Page, city = 'nyc', query = '?seed=33') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/' + query);
  await beginCityRun(page, city);
  await quiet(page);
  return errors;
}

/** A quiet moment: nothing around to knock the knight about, a full health bar, and no Bag open. */
async function quiet(page: Page) {
  for (let i = 0; i < 6; i++) {
    await page.evaluate(`for (let i = 0; i < 40; i++) window.__rk.killNearest()`);
    await rk(page, 'heal()');
    if ((await app(page).getAttribute('data-bag-page')) === null) return;
    await page.keyboard.press('KeyI');
    await page.waitForTimeout(250);
  }
}

/** Wait for the level to change. */
async function waitForDepth(page: Page, want: 'surface' | 'underground') {
  for (let i = 0; i < 160; i++) {
    if ((await app(page).getAttribute('data-scene')) === 'GameScene' && (await page.evaluate(`window.__rk?.depth?.()`)) === want && (await page.evaluate(`window.__rk?.hp?.() > 0`))) return;
    await page.waitForTimeout(120);
  }
  throw new Error(`never reached ${want}`);
}

const depth = (page: Page) => rk<string>(page, 'depth()');
const pois = (page: Page) => rk<PoiRow[]>(page, 'pois()');
const goDown = async (page: Page, n = 0) => {
  await quiet(page);
  expect(await rk<boolean>(page, `tpToPoi('entrance', ${n})`)).toBe(true);
  await waitForDepth(page, 'underground');
};
const upBy = async (page: Page, which: 'back' | 'far') => {
  await quiet(page);
  expect(await rk<boolean>(page, `tpToStairs('${which}')`)).toBe(true);
  await waitForDepth(page, 'surface');
};

test('the surface has four entrances, three shrines and ten crates, every one on the map', async ({ page }) => {
  const errors = await begin(page);
  const all = await pois(page);
  expect(all.filter((p) => p.kind === 'entrance')).toHaveLength(4);
  expect(all.filter((p) => p.kind === 'shrine')).toHaveLength(3);
  expect(all.filter((p) => p.kind === 'crate')).toHaveLength(10);
  expect(all.every((p) => !p.used)).toBe(true);
  expect(await depth(page)).toBe('surface');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('the map is in the Bag, not on the screen: N opens it, and it stops the game until you close it', async ({ page }) => {
  const errors = await begin(page);
  await expect(app(page)).not.toHaveAttribute('data-minimap', /.+/); // no corner minimap any more
  expect(await rk<string | null>(page, 'bagPage()')).toBeNull();
  await page.keyboard.press('KeyN');
  await expect(app(page)).toHaveAttribute('data-bag-page', 'map');
  expect(await rk<boolean>(page, 'isScenePaused()')).toBe(true);
  await page.screenshot({ path: 'e2e-artifacts/bag-map.png' });
  await page.keyboard.press('Escape'); // back to the Bag
  await expect(app(page)).toHaveAttribute('data-bag-page', 'top');
  await page.keyboard.press('KeyI'); // and out
  await expect(app(page)).not.toHaveAttribute('data-bag-page', /.+/);
  expect(await rk<boolean>(page, 'isScenePaused()')).toBe(false);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a supply crate opens when touched, once: drips and gems, and it stays open', async ({ page }) => {
  const errors = await begin(page);
  const before = await rk<number>(page, 'coins()');
  expect(await rk<boolean>(page, `tpToPoi('crate', 0)`)).toBe(true);
  await page.waitForFunction(() => (window as any).__rk.usedPois().includes('s' + (window as any).__rk.pois().filter((p: PoiRow) => p.kind === 'crate')[0].id), undefined, frame);
  expect((await pois(page)).filter((p) => p.kind === 'crate')[0].used).toBe(true);
  // the drips come out as pickups, which the knight collects
  await page.waitForFunction((was) => (window as any).__rk.coins() > was, before, { polling: 'raf', timeout: 8_000 });
  const after = await rk<number>(page, 'coins()');
  // stepping away and back does nothing more
  await rk(page, `tpToPoi('shrine', 0)`);
  await rk(page, `tpToPoi('crate', 0)`);
  await page.waitForTimeout(600);
  await quiet(page);
  expect(await rk<number>(page, 'coins()')).toBe(after);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a shrine grants its power after you stand at it, once, and mends the knight a little', async ({ page }) => {
  const errors = await begin(page);
  await rk(page, 'hurt(40)');
  const hurt = await rk<number>(page, 'hp()');
  const power = (await rk<Record<string, number>>(page, 'powers()'));
  expect(Object.values(power).reduce((a, b) => a + b, 0)).toBe(0);
  await rk(page, `tpToPoi('shrine', 0)`);
  await page.waitForFunction(() => Object.values((window as any).__rk.powers()).some((v) => (v as number) > 0), undefined, frame);
  const gained = await rk<Record<string, number>>(page, 'powers()');
  expect(Object.values(gained).reduce((a, b) => a + b, 0)).toBe(1);
  expect(await rk<number>(page, 'hp()')).toBeGreaterThan(hurt);
  expect((await pois(page)).filter((p) => p.kind === 'shrine')[0].used).toBe(true);
  // it does not give a second blessing
  await page.waitForTimeout(1800);
  expect(Object.values(await rk<Record<string, number>>(page, 'powers()')).reduce((a, b) => a + b, 0)).toBe(1);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('running past a shrine does not take it: you have to stand there', async ({ page }) => {
  await begin(page);
  await rk(page, `tpToPoi('shrine', 1)`);
  await page.waitForTimeout(250);
  await rk(page, `tpToPoi('crate', 4)`); // away again, before the ring fills
  await page.waitForTimeout(1600);
  expect((await pois(page)).filter((p) => p.kind === 'shrine')[1].used).toBe(false);
});

test('down the stairs: the tunnel is dark and still; its chests, its enemies, and no weather', async ({ page }) => {
  const errors = await begin(page, 'nyc', '?seed=33&weather=thunderstorm');
  const t0 = await rk<number>(page, 'elapsedSeconds()');
  await goDown(page);
  expect(await rk<boolean>(page, 'dark()')).toBe(true);
  expect(await rk<number>(page, 'tunnelChests()')).toBeGreaterThanOrEqual(4);
  // time stands still, and there is no storm to strike
  const frozen = await rk<number>(page, 'elapsedSeconds()');
  expect(Math.abs(frozen - t0)).toBeLessThan(2);
  await page.waitForTimeout(2500);
  expect(await rk<number>(page, 'elapsedSeconds()')).toBeCloseTo(frozen, 1);
  expect(await rk<unknown>(page, 'hazards()')).toBeNull();
  // but it is not empty
  await page.waitForFunction(() => (window as any).__rk.enemyTypes().length > 0, undefined, { polling: 'raf', timeout: 12_000 });
  expect(errors, errors.join('\n')).toEqual([]);
});

test('the same tunnel every time, and the way back brings you up at the stairs you took', async ({ page }) => {
  const errors = await begin(page);
  const entrance = (await pois(page)).filter((p) => p.kind === 'entrance')[0];
  await goDown(page, 0);
  const chests = await rk<number>(page, 'tunnelChests()');
  await upBy(page, 'back');
  expect(await depth(page)).toBe('surface');
  // down the same stairs again: the same tunnel
  await goDown(page, 0);
  expect(await rk<number>(page, 'tunnelChests()')).toBe(chests);
  await upBy(page, 'back');
  expect(entrance.kind).toBe('entrance');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('the far stairs come up at the other end: the tunnel is a way across the map', async ({ page }) => {
  const errors = await begin(page);
  const entrances = (await pois(page)).filter((p) => p.kind === 'entrance');
  await goDown(page, 0);
  await upBy(page, 'far');
  // we are now at the paired entrance: standing there does not send us straight back down (the knight is set a step off it)
  await page.waitForTimeout(1500);
  expect(await depth(page)).toBe('surface');
  expect(entrances).toHaveLength(4);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('the knight comes back as they left: level, kills, health and powers carry down and up', async ({ page }) => {
  await begin(page);
  await rk(page, `givePowerup('frost', 2)`);
  await rk(page, 'addXp(40)');
  await quiet(page);
  const level = await rk<number>(page, 'level()');
  expect(level).toBeGreaterThan(1);
  await rk(page, 'hurt(30)');
  const hp = await rk<number>(page, 'hp()');
  await goDown(page);
  expect(await rk<number>(page, 'level()')).toBe(level);
  expect((await rk<Record<string, number>>(page, 'powers()')).frost).toBe(2);
  expect(await rk<number>(page, 'hp()')).toBeGreaterThanOrEqual(hp - 1);
  await upBy(page, 'back');
  expect(await rk<number>(page, 'level()')).toBe(level);
  expect((await rk<Record<string, number>>(page, 'powers()')).frost).toBe(2);
});

test('what you used stays used: a crate opened before going down is still open after, and tunnel chests do not refill', async ({ page }) => {
  await begin(page);
  await rk(page, `tpToPoi('crate', 2)`);
  await page.waitForFunction(() => (window as any).__rk.usedPois().length >= 1, undefined, frame);
  await quiet(page);
  await goDown(page);
  await rk(page, `tpToStairs('chest', 0)`);
  await page.waitForFunction(() => (window as any).__rk.usedPois().some((k: string) => k.startsWith('u')), undefined, frame);
  await quiet(page);
  const used = await rk<string[]>(page, 'usedPois()');
  await upBy(page, 'back');
  expect(await rk<string[]>(page, 'usedPois()')).toEqual(expect.arrayContaining(used));
  expect((await pois(page)).filter((p) => p.kind === 'crate')[2].used).toBe(true);
  await goDown(page);
  expect(await rk<string[]>(page, 'usedPois()')).toEqual(expect.arrayContaining(used));
});

test('a trip underground does not touch the storm clock, and a boss on the field waits for you, hurt as you left it', async ({ page }) => {
  await begin(page);
  await rk(page, 'spawnBoss()'); // (after the quiet moment: clearing enemies would clear the boss too)
  await rk(page, 'setBossHp(0.6)');
  const clock = await rk<number>(page, 'elapsedSeconds()');
  await rk(page, 'heal()');
  await rk(page, `tpToPoi('entrance', 1)`);
  await waitForDepth(page, 'underground');
  expect(await rk<number | null>(page, 'bossHpFraction()')).toBeNull(); // no boss in the tunnel
  await rk(page, `tpToStairs('back')`);
  await waitForDepth(page, 'surface');
  const fraction = await rk<number | null>(page, 'bossHpFraction()');
  expect(fraction).not.toBeNull();
  expect(fraction!).toBeCloseTo(0.6, 1);
  expect(Math.abs((await rk<number>(page, 'elapsedSeconds()')) - clock)).toBeLessThan(3);
});

test('dying underground ends the run like anywhere else', async ({ page }) => {
  await begin(page);
  await goDown(page);
  await rk(page, 'defeat()');
  await expect(app(page)).toHaveAttribute('data-scene', 'GameOverScene', { timeout: 8_000 });
});

test('Continue after leaving a run underground returns to the surface, at the stairs', async ({ page }) => {
  await begin(page);
  const level = await rk<number>(page, 'level()');
  await goDown(page);
  // the save is the surface run at the entrance; reload and continue
  await page.reload();
  await expect(app(page)).toHaveAttribute('data-scene', 'MenuScene');
  await expect(app(page)).toHaveAttribute('data-title-menu', 'continue');
  await page.keyboard.press('Digit1');
  await expect(app(page)).toHaveAttribute('data-scene', 'GameScene');
  await page.waitForFunction(() => (window as any).__rk?.hp?.() > 0, undefined, frame);
  expect(await depth(page)).toBe('surface');
  expect(await rk<number>(page, 'level()')).toBe(level);
});

test('caves under the coast: Miami goes underground too, and its tunnel is its own', async ({ page }) => {
  const errors = await begin(page, 'miami');
  await goDown(page);
  expect(await rk<boolean>(page, 'dark()')).toBe(true);
  expect(await rk<number>(page, 'tunnelChests()')).toBeGreaterThanOrEqual(4);
  await upBy(page, 'back');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('mud: rain churns the grass into mud that slows the knight; a clear day leaves none', async ({ page }) => {
  await begin(page, 'nyc', '?seed=33&weather=tropical_downpour');
  const counts = await rk<Record<string, number>>(page, 'terrain().counts');
  expect(counts.MUD).toBeGreaterThan(10);
  expect(await rk<boolean>(page, 'tpToTile(12, 0)')).toBe(true);
  // the slow-down is applied by the terrain update a moment after the knight lands on the tile
  await page.waitForFunction(() => (window as any).__rk.terrain().under === 12 && (window as any).__rk.terrain().speed < 0.7, undefined, frame);
  expect((await rk<{ speed: number }>(page, 'terrain()')).speed).toBeCloseTo(0.6, 1);
});

test('a clear day leaves no mud', async ({ page }) => {
  await begin(page, 'nyc', '?seed=33&weather=clear');
  expect((await rk<Record<string, number>>(page, 'terrain().counts')).MUD ?? 0).toBe(0);
});

test('the tutorial has no crates, shrines or stairs', async ({ page }) => {
  await page.goto('/');
  await expect(app(page)).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('KeyT');
  await expect(app(page)).toHaveAttribute('data-scene', 'GameScene');
  await page.waitForFunction(() => (window as any).__rk?.hp?.() > 0, undefined, frame);
  expect(await pois(page)).toEqual([]);
  expect(await depth(page)).toBe('surface');
});
