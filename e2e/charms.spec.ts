import { test, expect, beginCityRun } from './fixtures';
import type { Page } from '@playwright/test';

// Charms are the old level-up skills, as items: found, bought or won, worn in slots, and kept between fights.

type Combat = { damage: number; range: number; cooldown: number; pierce: number; magnet: number; moveSpeed: number; worn: string[] };
const combat = (page: Page) => page.evaluate(`window.__rk.combat()`) as Promise<Combat>;
const maxHp = (page: Page) => page.evaluate(`window.__rk.maxHp()`) as Promise<number>;
const drop = (page: Page, id: string) => page.evaluate(`window.__rk.dropCharm('${id}')`);
const owned = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('rainknights:save') ?? 'null')?.town);

async function begin(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/?seed=5&weather=clear');
  await beginCityRun(page, 'nyc');
  await page.waitForFunction(() => (window as any).__rk?.hp?.() > 0);
  await page.evaluate(`for (let i = 0; i < 40; i++) window.__rk.killNearest()`);
  return errors;
}

test('a charm found on the ground is worn at once and changes the knight; a second ranks it up', async ({ page }) => {
  const errors = await begin(page);
  const base = await combat(page);
  const hp = await maxHp(page);
  expect(base.worn).toEqual([]);

  await drop(page, 'vitalityStone');
  await page.waitForFunction((was) => (window as any).__rk.maxHp() > was, hp);
  expect(await maxHp(page)).toBe(hp + 20);
  await drop(page, 'vitalityStone');
  await page.waitForFunction((was) => (window as any).__rk.maxHp() > was, hp + 20);
  expect(await maxHp(page)).toBe(hp + 40); // rank II

  await drop(page, 'hailTip');
  await page.waitForFunction(() => (window as any).__rk.combat().pierce === 1);
  await drop(page, 'boltRing');
  await page.waitForFunction((was) => (window as any).__rk.combat().damage > was, base.damage);
  expect((await combat(page)).damage).toBe(base.damage + 6);
  expect((await combat(page)).worn).toEqual(['vitalityStone', 'hailTip', 'boltRing']);

  // they are the knight's for good: the town profile holds them
  const town = await owned(page);
  expect(town.charms).toEqual({ vitalityStone: 2, hailTip: 1, boltRing: 1 });
  expect(town.worn).toEqual(['vitalityStone', 'hailTip', 'boltRing']);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('three slots at the start: a fourth charm is kept but not worn, until one is taken off in the Bag', async ({ page }) => {
  const errors = await begin(page);
  for (const id of ['boltRing', 'squallBand', 'gustLens']) {
    await drop(page, id);
    await page.waitForFunction((n) => (window as any).__rk.combat().worn.length >= n, (await combat(page)).worn.length + 1);
  }
  await drop(page, 'lodestone');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('rainknights:save') ?? 'null')?.town?.charms?.lodestone === 1);
  expect((await combat(page)).worn).toEqual(['boltRing', 'squallBand', 'gustLens']);

  // The Bag's CHARMS page: take Bolt Ring off (Enter), then wear Lodestone.
  const app = page.locator('#app');
  await page.evaluate(`window.__rk.openBag('charms')`);
  await expect(app).toHaveAttribute('data-bag-page', 'charms');
  const tap = async (key: string) => {
    await page.keyboard.press(key);
    await page.waitForTimeout(80);
  };
  await tap('Enter'); // the first row: Bolt Ring, off
  await page.waitForFunction(() => (window as any).__rk.combat().worn.length === 2);
  await tap('ArrowDown');
  await tap('ArrowDown');
  await tap('ArrowDown'); // Lodestone
  await tap('Enter');
  await page.waitForFunction(() => (window as any).__rk.combat().worn.includes('lodestone'));
  expect((await combat(page)).worn.sort()).toEqual(['gustLens', 'lodestone', 'squallBand']);
  await page.screenshot({ path: 'e2e-artifacts/bag-charms.png' });
  await page.keyboard.press('KeyI');
  await expect(app).not.toHaveAttribute('data-bag-page', /.+/);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('stat points: strength and power raise damage, speed raises move speed, and points can be taken back', async ({ page }) => {
  const errors = await begin(page);
  await page.evaluate(`window.__rk.grantLevel()`);
  await page.waitForFunction(() => (window as any).__rk.statPoints() === 3);
  const base = await combat(page);
  expect(await page.evaluate(`window.__rk.spend('speed', 1)`)).toBe(true);
  expect(await page.evaluate(`window.__rk.spend('speed', 1)`)).toBe(true);
  expect(await page.evaluate(`window.__rk.spend('speed', 1)`)).toBe(true);
  expect(await page.evaluate(`window.__rk.spend('speed', 1)`)).toBe(false); // none left
  expect((await combat(page)).moveSpeed).toBeCloseTo(base.moveSpeed * 1.12, 5);
  expect(await page.evaluate(`window.__rk.spend('speed', -1)`)).toBe(true);
  expect(await page.evaluate(`window.__rk.statPoints()`)).toBe(1);
  expect((await combat(page)).moveSpeed).toBeCloseTo(base.moveSpeed * 1.08, 5);
  expect(await page.evaluate(`window.__rk.spend('strength', -1)`)).toBe(false); // nothing in it to take back
  expect(errors, errors.join('\n')).toEqual([]);
});
