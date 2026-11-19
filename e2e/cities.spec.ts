import { beginCityRun, test, expect } from './fixtures';
import { type Page } from '@playwright/test';
import { CITIES as REGIONS } from '../src/config/regions';

// London, Tokyo and Mumbai join New York and Miami: a five-city picker, and each city runs with its own map,
// forecast rules and boss.

const rk = <T>(page: Page, expr: string) => page.evaluate(`window.__rk.${expr}`) as Promise<T>;

async function begin(page: Page, city: string, query = '?seed=33') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/' + query);
  await beginCityRun(page, city);
  return errors;
}

async function toPicker(page: Page) {
  const app = page.locator('#app');
  await page.goto('/');
  await expect(app).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-scene', 'TownScene');
  await page.keyboard.down('ArrowDown');
  try {
    await expect(app).toHaveAttribute('data-scene', 'RegionSelectScene', { timeout: 8_000 });
  } finally {
    await page.keyboard.up('ArrowDown');
  }
}

test('the picker lists every city and Down + Enter picks one from the list', async ({ page }) => {
  expect(REGIONS.map((r) => r.id)).toEqual(['nyc', 'miami', 'london', 'tokyo', 'mumbai']);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await toPicker(page);
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown'); // New York -> Mumbai
  await page.keyboard.press('Enter');
  await expect(page.locator('#app')).toHaveAttribute('data-scene', 'GameScene');
  expect(await rk<string>(page, 'regionId()')).toBe('mumbai');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('the list wraps round: Up from New York is Mumbai', async ({ page }) => {
  await toPicker(page);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect(page.locator('#app')).toHaveAttribute('data-scene', 'GameScene');
  expect(await rk<string>(page, 'regionId()')).toBe('mumbai');
});

for (const [city, boss] of [
  ['london', 'PHANTOM BUS'],
  ['tokyo', 'TORNADO'],
  ['mumbai', 'TORNADO'],
] as const) {
  test(`${city}: starts a run on its own map and meets its boss`, async ({ page }) => {
    const errors = await begin(page, city);
    expect(await rk<string>(page, 'regionId()')).toBe(city);
    const terrain = await rk<{ counts: Record<string, number>; decorOps: number }>(page, 'terrain()');
    expect(terrain.decorOps, 'the world is painted').toBeGreaterThan(1000);
    // each city's own shape
    if (city === 'london') expect(terrain.counts.WATER + terrain.counts.SHALLOW).toBeGreaterThan(900);
    if (city === 'tokyo') expect(terrain.counts.BUILDING).toBeGreaterThan(2500);
    if (city === 'mumbai') expect(terrain.counts.WATER).toBeGreaterThan(800);
    await page.evaluate(`window.__rk.spawnBoss()`);
    await expect(page.locator('#app')).toHaveAttribute('data-boss', boss);
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test('a Tokyo run saves and resumes as Tokyo, on the same map', async ({ page }) => {
  const errors = await begin(page, 'tokyo', '?seed=77');
  const before = await rk<{ seed: number; counts: Record<string, number> }>(page, 'terrain()');
  // the run saves itself as it goes; wait until the save names Tokyo
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('rainknights:save');
    return !!raw && JSON.parse(raw).run?.regionId === 'tokyo';
  }, undefined, { timeout: 15_000 });
  await page.reload();
  await expect(page.locator('#app')).toHaveAttribute('data-scene', 'MenuScene');
  await expect(page.locator('#app')).toHaveAttribute('data-title-menu', 'continue');
  await page.keyboard.press('Digit1'); // CONTINUE
  await expect(page.locator('#app')).toHaveAttribute('data-scene', 'GameScene', { timeout: 10_000 });
  expect(await rk<string>(page, 'regionId()')).toBe('tokyo');
  const after = await rk<{ seed: number; counts: Record<string, number> }>(page, 'terrain()');
  expect(after.seed).toBe(before.seed);
  expect(after.counts).toEqual(before.counts);
  expect(errors, errors.join('\n')).toEqual([]);
});
