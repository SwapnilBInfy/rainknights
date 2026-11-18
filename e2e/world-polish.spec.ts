import { test, expect, stubWeather } from './fixtures';
import { type Browser, type Page } from '@playwright/test';

// The painted world: street furniture and greenery that block the way, decor that repaints when the flood rises.
// Tile ids (systems/mapGen.ts): 9 tree, 10 parked car, 11 lamp / hydrant / umbrella.
const TREE = 9;
const CAR = 10;
const PROP = 11;

type Terrain = { counts: Record<string, number>; decorOps: number; decorDraws: number };

async function begin(page: Page, query: string, city: 'Digit1' | 'Digit2' = 'Digit1') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/' + query);
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-scene', 'CharacterSelectScene');
  await page.keyboard.press('Digit1');
  await expect(app).toHaveAttribute('data-scene', 'RegionSelectScene');
  await page.keyboard.press(city);
  await expect(app).toHaveAttribute('data-scene', 'GameScene');
  return errors;
}
const terrain = (page: Page) => page.evaluate(`window.__rk.terrain()`) as Promise<Terrain>;

async function mapOf(browser: Browser, query: string, city: 'Digit1' | 'Digit2' = 'Digit1') {
  const ctx = await browser.newContext();
  await stubWeather(ctx);
  const page = await ctx.newPage();
  const errors = await begin(page, query, city);
  const t = await terrain(page);
  await ctx.close();
  return { t, errors };
}

test('New York has parked cars, trees and street lamps; Miami has palms and umbrellas but no cars', async ({ browser }) => {
  const nyc = await mapOf(browser, '?seed=11');
  const miami = await mapOf(browser, '?seed=33', 'Digit2');
  expect(nyc.t.counts.CAR).toBeGreaterThan(12);
  expect(nyc.t.counts.TREE).toBeGreaterThan(20);
  expect(nyc.t.counts.PROP).toBeGreaterThan(6);
  expect(miami.t.counts.CAR).toBe(0);
  expect(miami.t.counts.TREE).toBeGreaterThan(220);
  expect(miami.t.counts.PROP).toBeGreaterThan(8);
  expect([...nyc.errors, ...miami.errors]).toEqual([]);
});

test('the painted detail is there, and is repainted when the flood rises', async ({ page }) => {
  const errors = await begin(page, '?seed=11');
  const before = await terrain(page);
  expect(before.decorOps).toBeGreaterThan(2000);
  expect(before.decorDraws).toBe(1);
  const changed = (await page.evaluate(`window.__rk.floodTo(2)`)) as number;
  expect(changed).toBeGreaterThan(0);
  const after = await terrain(page);
  expect(after.decorDraws).toBe(2);
  expect(after.counts.SHALLOW).toBeGreaterThan(before.counts.SHALLOW);
  expect(after.decorOps).not.toBe(before.decorOps); // new shorelines where the water reached
  // raising it to the same level again does nothing (it only ever rises)
  expect(await page.evaluate(`window.__rk.floodTo(2)`)).toBe(0);
  expect((await terrain(page)).decorDraws).toBe(2);
  expect(errors, errors.join('\n')).toEqual([]);
});

for (const [name, type] of [['a tree', TREE], ['a parked car', CAR], ['a street lamp or hydrant', PROP]] as const) {
  test(`the knight cannot walk through ${name}`, async ({ page }) => {
    const errors = await begin(page, '?seed=11');
    await page.evaluate(`for (let i = 0; i < 30; i++) window.__rk.killNearest()`);
    expect(await page.evaluate(`window.__rk.tpBesideSolid(${type})`)).toBe(true);
    await page.waitForTimeout(150);
    const start = (await page.evaluate(`window.__rk.x()`)) as number;
    await page.keyboard.down('KeyD'); // walk straight into it
    await page.waitForTimeout(900);
    await page.keyboard.up('KeyD');
    const end = (await page.evaluate(`window.__rk.x()`)) as number;
    // the solid tile starts 8px east of the starting tile's centre; the knight's body is wider than a pixel, so it stops short of it
    expect(end - start, `walked ${(end - start).toFixed(1)}px into it`).toBeLessThan(8);
    expect(errors, errors.join('\n')).toEqual([]);
  });
}
