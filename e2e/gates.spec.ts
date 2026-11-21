import type { Page } from '@playwright/test';
import { test, expect, beginCityRun } from './fixtures';
import { HOUSE, TOWN } from '../src/town/mistford';
import { ZONE_RADII } from '../src/systems/zones';

// Each city is cut into three zones by two rings of rock with a gate in each, and a gate opens only for a knight of
// its level. Only the first knight is there at the start; the others are earned.

type Gate = { ring: number; level: number; open: boolean; x: number; y: number; tiles: number };
const rk = <T>(page: Page, expr: string) => page.evaluate(`window.__rk.${expr}`) as Promise<T>;
const gates = (page: Page) => rk<Gate[]>(page, 'gates()');
const heal = (page: Page) => page.evaluate(`setInterval(() => { try { window.__rk.heal(); } catch {} }, 30)`);
const PLAZA = { x: 50 * 16 + 8, y: 50 * 16 + 8 };

async function begin(page: Page, city = 'nyc', seed = 33) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`/?seed=${seed}&weather=clear`);
  await beginCityRun(page, city);
  await page.waitForFunction(() => (window as any).__rk?.hp?.() > 0);
  await page.evaluate(`window.__rk.clearEnemies()`); // nobody to knock the knight about
  await heal(page);
  return errors;
}

/**
 * Stand just inside a gate and walk at it, straight out from the plaza, for a while. Returns how far from the plaza the
 * knight is at the end, in tiles.
 */
async function walkAt(page: Page, gate: Gate): Promise<number> {
  const dx = gate.x - PLAZA.x;
  const dy = gate.y - PLAZA.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const sign = (horizontal ? dx : dy) > 0 ? 1 : -1;
  // start 34px short of the gate's middle (on the plaza side), lined up with it, and walk on
  const sx = horizontal ? gate.x - sign * 34 : gate.x;
  const sy = horizontal ? gate.y : gate.y - sign * 34;
  await page.evaluate(`window.__rk.tpTo(${sx}, ${sy})`);
  await page.waitForTimeout(150);
  const key = horizontal ? (sign > 0 ? 'ArrowRight' : 'ArrowLeft') : sign > 0 ? 'ArrowDown' : 'ArrowUp';
  await page.keyboard.down(key);
  await page.waitForTimeout(1600);
  await page.keyboard.up(key);
  const x = await rk<number>(page, 'x()');
  const y = await rk<number>(page, 'y()');
  return Math.hypot(x - PLAZA.x, y - PLAZA.y) / 16;
}

test('a city has two gates at the levels that city asks, both shut for a new knight', async ({ page }) => {
  const errors = await begin(page);
  const g = await gates(page);
  expect(g.filter((x) => x.ring === 1).length).toBeGreaterThanOrEqual(1);
  expect(g.filter((x) => x.ring === 2).length).toBeGreaterThanOrEqual(1);
  expect(new Set(g.filter((x) => x.ring === 1).map((x) => x.level))).toEqual(new Set([3]));
  expect(new Set(g.filter((x) => x.ring === 2).map((x) => x.level))).toEqual(new Set([6]));
  expect(g.every((x) => !x.open)).toBe(true);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('later cities ask for a higher level', async ({ page }) => {
  const errors = await begin(page, 'tokyo');
  const g = await gates(page);
  expect(g.find((x) => x.ring === 1)!.level).toBe(8);
  expect(g.find((x) => x.ring === 2)!.level).toBe(13);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a shut gate stops the knight; it opens, for good, at its level', async ({ page }) => {
  const errors = await begin(page);
  const first = (await gates(page)).find((x) => x.ring === 1)!;
  // shut: the knight does not get through
  const stopped = await walkAt(page, first);
  expect(stopped).toBeLessThan(ZONE_RADII[0] + 0.5);
  // at the level, it opens
  await rk(page, `setLevel(${first.level})`);
  await page.waitForFunction(() => (window as any).__rk.gates().some((g: Gate) => g.ring === 1 && g.open));
  expect((await gates(page)).filter((x) => x.ring === 2).every((x) => !x.open)).toBe(true); // the second is still shut
  const through = await walkAt(page, first);
  expect(through).toBeGreaterThan(ZONE_RADII[0] + 1.5);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('the second gate asks more, and midtown is not the core', async ({ page }) => {
  const errors = await begin(page);
  const gs = await gates(page);
  const second = gs.find((x) => x.ring === 2)!;
  await rk(page, `setLevel(${gs.find((x) => x.ring === 1)!.level})`); // enough for the first, not the second
  expect(await walkAt(page, second)).toBeLessThan(ZONE_RADII[1] + 0.5);
  await rk(page, `setLevel(${second.level})`);
  await page.waitForFunction(() => (window as any).__rk.gates().every((g: Gate) => g.open));
  expect(await walkAt(page, second)).toBeGreaterThan(ZONE_RADII[1] + 1.5);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('the gates are on the Bag map', async ({ page }) => {
  const errors = await begin(page);
  await page.keyboard.press('KeyN');
  await expect(page.locator('#app')).toHaveAttribute('data-bag-page', 'map');
  await page.screenshot({ path: 'e2e-artifacts/gates-map.png' });
  await page.keyboard.press('KeyI');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('the tutorial arena has no gates', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('KeyT');
  await expect(page.locator('#app')).toHaveAttribute('data-scene', 'GameScene');
  await page.waitForFunction(() => (window as any).__rk?.hp?.() > 0);
  expect(await gates(page)).toEqual([]);
});

test('a tunnel is no way round a gate: the far stairs are sealed to a knight too low for where they come out', async ({ page }) => {
  type Poi = { id: number; kind: string; col: number; row: number; pair?: number };
  const zoneOf = (p: Poi) => Math.hypot(p.col - 50, p.row - 50);
  // find a map with an entrance in the outskirts whose other end comes out in a higher zone
  let n = -1;
  let errors: string[] = [];
  for (const seed of [33, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
    errors = await begin(page, 'nyc', seed);
    const ents = (await rk<Poi[]>(page, 'pois()')).filter((p) => p.kind === 'entrance');
    n = ents.findIndex((e) => zoneOf(e) < ZONE_RADII[0] && ents.find((o) => o.id === e.pair) && zoneOf(ents.find((o) => o.id === e.pair)!) >= ZONE_RADII[0]);
    if (n >= 0) break;
  }
  expect(n, 'some map has such a tunnel').toBeGreaterThanOrEqual(0);
  await rk(page, `setLevel(30)`);
  await rk(page, `tpToPoi('entrance', ${n})`);
  await page.waitForFunction(() => (window as any).__rk.depth() === 'underground', undefined, { polling: 'raf', timeout: 20_000 });
  await rk(page, 'setLevel(1)');
  await rk(page, `tpToStairs('far')`);
  await page.waitForTimeout(3500);
  expect(await rk<string>(page, 'depth()')).toBe('underground'); // sealed
  await rk(page, 'setLevel(30)');
  await rk(page, `tpToStairs('far')`);
  await page.waitForFunction(() => (window as any).__rk.depth() === 'surface', undefined, { polling: 'raf', timeout: 20_000 });
  expect(errors, errors.join('\n')).toEqual([]);
});

// ---- knights ----

const saveOf = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('rainknights:save') ?? 'null'));

async function toMirror(page: Page) {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-scene', 'TownScene');
  await page.waitForFunction(() => (window as any).__hub?.frames() > 2);
  await page.evaluate(`window.__hub.tp(${TOWN.houseMat.col}, ${TOWN.houseMat.row})`);
  await expect(page.locator('#app')).toHaveAttribute('data-scene', 'HouseScene');
  await page.waitForFunction(() => (window as any).__hub?.place() === 'house' && (window as any).__hub?.frames() > 2);
  await page.evaluate(`window.__hub.tp(${HOUSE.mirror.col}, ${HOUSE.mirror.row + 1})`);
  await expect(page.locator('#app')).toHaveAttribute('data-interact', 'mirror');
  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-scene', 'CharacterSelectScene');
}

test('at the start only the Rain Knight can be chosen; the others are shadows that say what to do', async ({ page }) => {
  await toMirror(page);
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-knight-locked', '');
  await page.keyboard.press('ArrowDown');
  await expect(app).toHaveAttribute('data-knight-locked', 'hailWarden');
  await page.screenshot({ path: 'e2e-artifacts/mirror-locked.png' });
  await page.keyboard.press('Space'); // cannot be chosen
  await page.waitForTimeout(300);
  await expect(app).toHaveAttribute('data-scene', 'CharacterSelectScene');
  expect((await saveOf(page)).town.characterId).toBe('rainKnight');
  await page.keyboard.press('ArrowDown');
  await expect(app).toHaveAttribute('data-knight-locked', 'stormChaser');
  expect((await saveOf(page)).town.unlocked).toEqual(['rainKnight']);
});

test('a boss won earns the Hail Warden, who can then be chosen at the mirror', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-scene', 'TownScene');
  await page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem('rainknights:save') ?? 'null');
    doc.meta.wins = 1;
    localStorage.setItem('rainknights:save', JSON.stringify(doc));
  });
  await toMirror(page); // (reloads, so the game reads it)
  const app = page.locator('#app');
  await page.keyboard.press('ArrowDown');
  await expect(app).toHaveAttribute('data-knight-locked', ''); // earned
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-scene', 'HouseScene');
  const town = (await saveOf(page)).town;
  expect(town.characterId).toBe('hailWarden');
  expect(town.unlocked).toEqual(['rainKnight', 'hailWarden']);
});

test('reaching level 10 earns the Storm Chaser', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-scene', 'TownScene');
  await page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem('rainknights:save') ?? 'null');
    doc.town.hero = { level: 10, xp: 0, alloc: { strength: 0, power: 0, endurance: 0, speed: 0 } };
    localStorage.setItem('rainknights:save', JSON.stringify(doc));
  });
  await toMirror(page);
  const app = page.locator('#app');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect(app).toHaveAttribute('data-knight-locked', '');
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-scene', 'HouseScene');
  expect((await saveOf(page)).town.characterId).toBe('stormChaser');
});
