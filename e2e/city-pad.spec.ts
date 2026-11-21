import { beginCityRun, test, expect } from './fixtures';
import { type Page } from '@playwright/test';
import { CITIES as REGIONS } from '../src/config/regions';

// Every city has a blue flight pad on the plaza. Stand still on it until the ring fills and the knight flies out:
// the run ends as a retreat (HP carries home) and the flight map opens over that city.

const frame = { polling: 'raf' as const, timeout: 20_000 };
const rk = <T>(page: Page, expr: string) => page.evaluate(`window.__rk.${expr}`) as Promise<T>;
const scene = (page: Page) => page.locator('#app');
const save = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('rainknights:save') ?? 'null'));

async function begin(page: Page, city: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/?seed=33');
  await beginCityRun(page, city);
  // a quiet plaza: no ambient enemies to knock the knight off the pad
  await page.evaluate(`window.__rk.clearEnemies()`);
  return errors;
}

for (const city of REGIONS.map((r) => r.id)) {
  test(`${city}: standing still on the pad flies the knight out over ${city}`, async ({ page }) => {
    const errors = await begin(page, city);
    const pad = await rk<{ x: number; y: number }>(page, 'padAt()');
    expect(pad.x).toBeGreaterThan(0);
    await page.evaluate(`window.__rk.tpToPad()`);
    await page.waitForFunction(() => (window as any).__rk.padCharge() > 0.3, undefined, frame);
    expect(await rk<number>(page, 'padCharge()'), 'the ring fills while they stand on it').toBeGreaterThan(0.3);
    await expect(scene(page)).toHaveAttribute('data-scene', 'FlightScene', { timeout: 8_000 });
    await page.waitForFunction(() => (window as any).__flight?.frames() > 3, undefined, frame);
    expect(await page.evaluate(`window.__flight.near()`), 'the flight starts over the city they left').toBe(city);
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test('flying out ends the run as a retreat: nothing is left to continue, the run is counted, and HP carries home', async ({ page }) => {
  const errors = await begin(page, 'nyc');
  const before = await save(page);
  expect(before.run, 'a run is in progress').not.toBeNull();
  await page.evaluate(`window.__rk.wound(20)`);
  await page.evaluate(`window.__rk.tpToPad()`);
  await expect(scene(page)).toHaveAttribute('data-scene', 'FlightScene', { timeout: 8_000 });
  const after = await save(page);
  expect(after.run, 'the run is over').toBeNull();
  expect(after.meta.runs).toBe(before.meta.runs + 1);
  expect(after.meta.wins, 'a retreat is not a win').toBe(before.meta.wins);
  expect(after.town.hp, 'the wound came home with them').toBeLessThan(before.town.hp);
  expect(after.town.hp).toBeGreaterThan(0);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('running over the pad does not fly out: it has to be stood on until the ring is full', async ({ page }) => {
  const errors = await begin(page, 'london');
  await page.evaluate(`window.__rk.tpToPad()`);
  await page.waitForTimeout(250);
  const partial = await rk<number>(page, 'padCharge()');
  expect(partial).toBeGreaterThan(0);
  expect(partial).toBeLessThan(0.6);
  await page.evaluate(`window.__rk.tpToTile(0, 0)`); // off the pad, onto open ground
  await page.waitForFunction(() => (window as any).__rk.padCharge() === 0, undefined, frame);
  await expect(scene(page)).toHaveAttribute('data-scene', 'GameScene');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('the knight starts off the pad, so a run never begins by flying out', async ({ page }) => {
  await begin(page, 'tokyo');
  await page.waitForTimeout(2200);
  await expect(scene(page)).toHaveAttribute('data-scene', 'GameScene');
  expect(await rk<number>(page, 'padCharge()')).toBe(0);
});

test('after flying out you can land on the same city and start a new run', async ({ page }) => {
  const errors = await begin(page, 'miami');
  await page.evaluate(`window.__rk.tpToPad()`);
  await expect(scene(page)).toHaveAttribute('data-scene', 'FlightScene', { timeout: 8_000 });
  await page.waitForFunction(() => (window as any).__flight?.near() === 'miami' && (window as any).__flight.state().alt >= 0.07, undefined, frame);
  // they are over the city they left, so holding A all the way down lands them there
  await page.keyboard.down('Space');
  await expect(scene(page)).toHaveAttribute('data-scene', 'GameScene', { timeout: 8_000 });
  await page.keyboard.up('Space');
  expect(await rk<string>(page, 'regionId()')).toBe('miami');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('the tutorial has no flight pad', async ({ page }) => {
  await page.goto('/');
  await expect(scene(page)).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('KeyT');
  await expect(scene(page)).toHaveAttribute('data-scene', 'GameScene');
  await page.waitForFunction(() => (window as any).__rk?.hp?.() > 0, undefined, frame);
  await page.evaluate(`window.__rk.tpToPad()`);
  await page.waitForTimeout(2200);
  await expect(scene(page)).toHaveAttribute('data-scene', 'GameScene');
  expect(await rk<number>(page, 'padCharge()')).toBe(0);
});
