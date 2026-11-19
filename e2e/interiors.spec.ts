import { devices, type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { HOUSE, MARKET, TOWN, cellCenter } from '../src/town/mistford';

// The south mat is the way out. Standing just inside it and pressing A (or
// walking onto it) returns you to the street outside that building.

async function hub(page: Page) {
  return page.evaluate(() => {
    const bridge = (window as unknown as { __hub?: { x: () => number; y: () => number } }).__hub;
    const app = document.getElementById('app');
    return {
      x: bridge?.x() ?? 0,
      y: bridge?.y() ?? 0,
      scene: app?.dataset.scene ?? '',
      interact: app?.dataset.interact ?? '',
      place: app?.dataset.place ?? '',
    };
  });
}

async function steer(page: Page, goal: { x: number; y: number; scene?: string; interact?: string }, dead = 6) {
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
    const info = await hub(page);
    last = JSON.stringify(info);
    if (goal.scene && info.scene === goal.scene) done = true;
    else if (goal.interact && info.interact === goal.interact && (!goal.scene || info.scene === goal.scene)) done = true;
    else if (!goal.scene && !goal.interact && Math.hypot(info.x - goal.x, info.y - goal.y) < dead) done = true;
    if (done) break;
    const want = new Set<string>();
    if (goal.x - info.x > 2) want.add('ArrowRight');
    if (info.x - goal.x > 2) want.add('ArrowLeft');
    if (goal.y - info.y > 2) want.add('ArrowDown');
    if (info.y - goal.y > 2) want.add('ArrowUp');
    await set(want);
    await page.waitForTimeout(30);
  }
  await set(new Set());
  if (!done) throw new Error(`could not reach ${JSON.stringify(goal)} from ${last}`);
}

async function wake(page: Page) {
  await page.goto('/');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-scene', 'TownScene');
  return app;
}

/** Just inside the mat: close enough for the A bubble, not standing on the tile that walks you out. */
function insideDoor(door: { col: number; row: number }) {
  return cellCenter({ col: door.col, row: door.row - 1 });
}

test('keyboard leaves the house and the market by the south door', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1100, height: 760 });
  const app = await wake(page);

  await steer(page, cellCenter(TOWN.houseExit));
  await steer(page, { ...cellCenter(TOWN.houseMat), scene: 'HouseScene' });
  await page.waitForTimeout(1500);
  await page.locator('#app canvas').screenshot({ path: '/opt/cursor/artifacts/house_interior.png' });
  await steer(page, { ...insideDoor(HOUSE.door), interact: 'door' });
  await expect(app).toHaveAttribute('data-interact', 'door');
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-scene', 'TownScene');
  await expect(app).toHaveAttribute('data-place', 'town');

  await steer(page, cellCenter(TOWN.houseExit));
  await steer(page, { ...cellCenter(TOWN.houseMat), scene: 'HouseScene' });
  await steer(page, { ...cellCenter(HOUSE.door), scene: 'TownScene' });
  await expect(app).toHaveAttribute('data-place', 'town');

  await steer(page, cellCenter(TOWN.shopExit));
  await steer(page, { ...cellCenter(TOWN.shopMat), scene: 'MarketScene' });
  await page.waitForTimeout(1500);
  await page.locator('#app canvas').screenshot({ path: '/opt/cursor/artifacts/market_interior.png' });
  await steer(page, { ...insideDoor(MARKET.door), interact: 'door' });
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-scene', 'TownScene');

  await steer(page, cellCenter(TOWN.shopExit));
  await steer(page, { ...cellCenter(TOWN.shopMat), scene: 'MarketScene' });
  await steer(page, { ...cellCenter(MARKET.door), scene: 'TownScene' });
  await expect(app).toHaveAttribute('data-place', 'town');
});

test.describe('touch exit', () => {
  const pixel = devices['Pixel 7'];
  test.use({
    viewport: pixel.viewport,
    userAgent: pixel.userAgent,
    deviceScaleFactor: pixel.deviceScaleFactor,
    isMobile: pixel.isMobile,
    hasTouch: pixel.hasTouch,
  });

  test('A on the house mat and the market mat walks back outside', async ({ page }) => {
    test.setTimeout(60_000);
    const app = await wake(page);
    await expect(page.getByTestId('touch-controls')).toBeVisible();

    await steer(page, cellCenter(TOWN.houseExit));
    await steer(page, { ...cellCenter(TOWN.houseMat), scene: 'HouseScene' });
    await steer(page, { ...insideDoor(HOUSE.door), interact: 'door' });
    await tapA(page);
    await expect(app).toHaveAttribute('data-scene', 'TownScene');

    await steer(page, cellCenter(TOWN.shopExit));
    await steer(page, { ...cellCenter(TOWN.shopMat), scene: 'MarketScene' });
    await steer(page, { ...insideDoor(MARKET.door), interact: 'door' });
    await tapA(page);
    await expect(app).toHaveAttribute('data-scene', 'TownScene');
  });
});

async function tapA(page: Page) {
  await page.evaluate(() => {
    const el = document.querySelector<HTMLButtonElement>('#touch-controls button.a');
    if (!el) throw new Error('missing A');
    const rect = el.getBoundingClientRect();
    const point = (type: string) =>
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 7,
        pointerType: 'touch',
        button: 0,
        buttons: type === 'pointerup' ? 0 : 1,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      });
    el.dispatchEvent(point('pointerdown'));
    el.dispatchEvent(point('pointerup'));
  });
}
