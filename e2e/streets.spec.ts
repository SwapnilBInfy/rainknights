import { beginCityRun, test, expect } from './fixtures';
import { type Page } from '@playwright/test';

// Vehicles drive the streets: lanes follow the street directions, and a charge into a wall is a crash.

async function begin(page: Page, query = '?seed=11') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/' + query);
  await beginCityRun(page);
  return errors;
}

const raf = { polling: 'raf' as const, timeout: 25_000 };
const rk = <T>(page: Page, expr: string) => page.evaluate(`window.__rk.${expr}`) as Promise<T>;

async function quietMoment(page: Page) {
  await page.evaluate(`for (let i = 0; i < 30; i++) window.__rk.killNearest()`);
  await page.waitForFunction(() => !(window as any).__rk.invulnerable(), undefined, raf);
}

test('a Cab Wraith lines its charge up along a street direction, never at an odd angle', async ({ page }) => {
  const errors = await begin(page);
  await quietMoment(page);
  await page.evaluate(`window.__rk.spawnEnemy('cabWraith', 95, -25)`);
  // Sample the cab's heading every frame while it winds up.
  const angles = (await page.waitForFunction(
    () => {
      const w = window as any;
      w.__heads ??= [];
      const i = w.__rk.enemyTypes().indexOf('cabWraith');
      if (i >= 0 && w.__rk.enemyPhases()[i] === 'telegraph') w.__heads.push(w.__rk.enemyAngles()[i]);
      return w.__heads.length >= 20 ? w.__heads : false;
    },
    undefined,
    raf
  ).then((h) => h.jsonValue())) as number[];
  const lateFrames = angles.slice(8); // the cab turns into the lane in the first few frames
  for (const a of lateFrames) {
    const off = Math.min(a % 90, 90 - (a % 90)); // distance to the nearest multiple of 90 degrees
    expect(off, `heading ${a.toFixed(1)}deg`).toBeLessThan(4.5);
  }
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a Cab Wraith that starts diagonally from the knight squares up into a lane before it charges', async ({ page }) => {
  const errors = await begin(page);
  await quietMoment(page);
  await page.evaluate(`window.__rk.spawnEnemy('cabWraith', 80, -80)`); // 45 degrees off: no street line to the knight yet
  // The frame the wind-up starts, read where the cab is relative to the knight.
  const at = (await page.waitForFunction(
    () => {
      const rk = (window as any).__rk;
      const i = rk.enemyTypes().indexOf('cabWraith');
      if (i < 0 || rk.enemyPhases()[i] !== 'telegraph') return false;
      return rk.enemyOffsets()[i];
    },
    undefined,
    raf
  ).then((h) => h.jsonValue())) as number[];
  const [dx, dy] = at.map(Math.abs);
  expect(Math.min(dx, dy), `across the lane: offset ${dx.toFixed(0)},${dy.toFixed(0)}`).toBeLessThanOrEqual(30); // lined up on a street axis
  expect(Math.max(dx, dy), 'with a run-up').toBeGreaterThanOrEqual(38);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a Cab Wraith that charges into the wall at the end of a street crashes', async ({ page }) => {
  const errors = await begin(page);
  await quietMoment(page);
  expect(await rk<boolean>(page, 'tpStreetEnd(3)')).toBe(true); // three tiles before the street ends at a wall
  await quietMoment(page);
  const before = await rk<number>(page, 'crashes()');
  await page.evaluate(`window.__rk.spawnEnemy('cabWraith', -96, 0)`); // up the street, charging toward the knight and the wall behind
  await page.waitForFunction((n) => (window as any).__rk.crashes() > n, before, raf);
  expect(errors, errors.join('\n')).toEqual([]);
});
