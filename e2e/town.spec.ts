import { test, expect, artifactPath } from './fixtures';
import type { Page } from '@playwright/test';
import { HOUSE, MARKET, TOWN, cellCenter, padCenter } from '../src/town/mistford';

// Mistford: wake up in town, buy a bun, leave for a city, pick up drips, come home.

async function steer(page: Page, goal: { x: number; y: number; scene?: string; interact?: string }) {
  const keys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const;
  const down = new Set<string>();
  const set = async (want: Set<string>) => {
    for (const key of keys) {
      if (want.has(key) && !down.has(key)) {
        await page.keyboard.down(key);
        down.add(key);
      }
      if (!want.has(key) && down.has(key)) {
        await page.keyboard.up(key);
        down.delete(key);
      }
    }
  };
  const deadline = Date.now() + 12_000;
  let last = '';
  let done = false;
  while (Date.now() < deadline) {
    const info = await page.evaluate(() => {
      const hub = (window as unknown as { __hub?: { x: () => number; y: () => number } }).__hub;
      const app = document.getElementById('app');
      return {
        x: hub?.x() ?? 0,
        y: hub?.y() ?? 0,
        scene: app?.dataset.scene ?? '',
        interact: app?.dataset.interact ?? '',
      };
    });
    last = JSON.stringify(info);
    if (goal.scene && info.scene === goal.scene) done = true;
    else if (goal.interact && info.interact === goal.interact) done = true;
    else if (!goal.scene && !goal.interact && Math.hypot(info.x - goal.x, info.y - goal.y) < 10) done = true;
    if (done) break;
    const want = new Set<string>();
    if (goal.x - info.x > 2) want.add('ArrowRight');
    if (info.x - goal.x > 2) want.add('ArrowLeft');
    if (goal.y - info.y > 2) want.add('ArrowDown');
    if (info.y - goal.y > 2) want.add('ArrowUp');
    await set(want);
    await page.waitForTimeout(40);
  }
  await set(new Set());
  if (!done) throw new Error(`could not reach ${JSON.stringify(goal)} from ${last}`);
}

test('start in Mistford, buy a bun, collect drips, and come home', async ({ page }) => {
  test.setTimeout(60_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto('/');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-scene', 'TownScene');
  await expect(app).toHaveAttribute('data-place', 'town');
  await expect(app).toHaveAttribute('data-coins', '20');
  await page.screenshot({ path: artifactPath('town_plaza.png') });

  const shop = cellCenter(TOWN.shopMat);
  await steer(page, cellCenter(TOWN.shopExit));
  await steer(page, { ...shop, scene: 'MarketScene' });
  await expect(app).toHaveAttribute('data-place', 'market');

  const counter = cellCenter({ col: MARKET.spawn.col, row: MARKET.counterRow });
  await steer(page, { ...counter, interact: 'shop' });
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-shop', 'open');
  await expect(app).toHaveAttribute('data-shop-item', 'rainBun');
  await page.screenshot({ path: artifactPath('market_shop.png') });
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-coins', '8');
  await expect(app).toHaveAttribute('data-bag', /rainBun:1/);

  await page.keyboard.press('Escape');
  await expect(app).toHaveAttribute('data-shop', 'closed');
  const out = cellCenter(MARKET.door);
  await steer(page, { ...out, scene: 'TownScene' });

  // The only way to a city is by air: walk onto the pad, take off, fly over New York's star and come down on it.
  await steer(page, { ...padCenter(), interact: 'pad' });
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-scene', 'FlightScene');
  await page.waitForFunction(() => (window as unknown as { __flight?: { frames: () => number } }).__flight!.frames() > 3);
  await page.evaluate(`window.__flight.teleportTo('nyc', 0.02)`);
  await page.waitForFunction(() => (window as unknown as { __flight: { near: () => string } }).__flight.near() === 'nyc');
  await page.keyboard.down('Space');
  await expect(app).toHaveAttribute('data-scene', 'GameScene', { timeout: 10_000 });
  await page.keyboard.up('Space');

  await page.evaluate(() => (window as unknown as { __rk: { spawnEnemy: (t: string, x: number, y: number) => void } }).__rk.spawnEnemy('rainImp', 18, 0));
  await page.evaluate(() => (window as unknown as { __rk: { killNearest: () => void } }).__rk.killNearest());
  await expect.poll(async () => page.evaluate(() => (window as unknown as { __rk: { coins: () => number } }).__rk.coins()), { timeout: 5_000 }).toBeGreaterThanOrEqual(12);
  await page.screenshot({ path: artifactPath('coin_drop.png') });

  await page.evaluate(() => (window as unknown as { __rk: { defeat: () => void } }).__rk.defeat());
  await expect(app).toHaveAttribute('data-scene', 'GameOverScene');
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-scene', 'TownScene');
  await expect(app).toHaveAttribute('data-bag', /rainBun:/);
  await expect(app).toHaveAttribute('data-hp', '30');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('rainknights:save') || 'null'));
  expect(saved.version).toBe(2);
  expect(saved.run).toBeNull();
  expect(saved.town.coins).toBeGreaterThanOrEqual(12);
  expect(saved.town.visited).toBe(true);

  const door = cellCenter(TOWN.houseMat);
  await steer(page, cellCenter(TOWN.houseExit));
  await steer(page, { ...door, scene: 'HouseScene' });
  await expect(app).toHaveAttribute('data-place', 'house');
  await page.screenshot({ path: artifactPath('safe_house.png') });
  const bed = cellCenter(HOUSE.bed);
  await steer(page, { ...bed, interact: 'bed' });
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-shop', 'open');
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-hp', '100');

  expect(errors, errors.join('\n')).toEqual([]);
});
