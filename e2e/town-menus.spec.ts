import { devices, type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { HOUSE, MARKET, TOWN, cellCenter, padCenter } from '../src/town/mistford';

// Opening the market or the chest used to swallow keyup. Space's keyup bought the
// first item, and a held direction stayed down, so the knight walked into the
// counter and the town looked frozen. These tests hold a direction, open and
// close both menus, and require the loop and the stick to keep working.

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
    const info = await hub(page);
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

async function hub(page: Page) {
  return page.evaluate(() => {
    const bridge = (
      window as unknown as {
        __hub?: {
          x: () => number;
          y: () => number;
          frames: () => number;
          keys?: () => { up: boolean; down: boolean; left: boolean; right: boolean };
        };
      }
    ).__hub;
    const app = document.getElementById('app');
    return {
      x: bridge?.x() ?? 0,
      y: bridge?.y() ?? 0,
      frames: bridge?.frames() ?? 0,
      keys: bridge?.keys?.() ?? null,
      scene: app?.dataset.scene ?? '',
      interact: app?.dataset.interact ?? '',
      shop: app?.dataset.shop ?? '',
      coins: app?.dataset.coins ?? '',
      dialog: app?.dataset.dialog ?? '',
      hp: app?.dataset.hp ?? '',
      frameErrors: app?.dataset.frameErrors ?? '0',
    };
  });
}

async function watchFrames(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __raf?: number };
    w.__raf = 0;
    const tick = () => {
      w.__raf = (w.__raf ?? 0) + 1;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

async function assertLoop(page: Page) {
  const before = await hub(page);
  const rafBefore = await page.evaluate(() => (window as unknown as { __raf?: number }).__raf ?? 0);
  await page.waitForTimeout(250);
  const after = await hub(page);
  const rafAfter = await page.evaluate(() => (window as unknown as { __raf?: number }).__raf ?? 0);
  expect(after.frames).toBeGreaterThan(before.frames + 4);
  expect(rafAfter).toBeGreaterThan(rafBefore + 4);
  expect(Number(after.frameErrors)).toBe(0);
}

async function startTown(page: Page) {
  await page.setViewportSize({ width: 1100, height: 760 });
  await page.goto('/');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-scene', 'TownScene');
  await watchFrames(page);
  return app;
}

test('market and chest open and close without freezing, and items move', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  const app = await startTown(page);

  await steer(page, cellCenter(TOWN.shopExit));
  await steer(page, { ...cellCenter(TOWN.shopMat), scene: 'MarketScene' });
  await steer(page, { ...cellCenter({ col: MARKET.spawn.col, row: MARKET.counterRow }), interact: 'shop' });

  for (let i = 0; i < 3; i++) {
    await page.keyboard.down('ArrowUp');
    await page.keyboard.down('Space');
    await expect(app).toHaveAttribute('data-shop', 'open');
    await expect(app).toHaveAttribute('data-coins', '20');
    await page.keyboard.up('Space');
    await expect(app).toHaveAttribute('data-coins', '20');
    await expect(app).toHaveAttribute('data-shop', 'open');
    await page.keyboard.up('ArrowUp');
    await assertLoop(page);
    await page.keyboard.press('Escape');
    await expect(app).toHaveAttribute('data-shop', 'closed');
    const parked = await hub(page);
    await page.waitForTimeout(350);
    const still = await hub(page);
    expect(still.scene).toBe(parked.scene);
    expect(Math.abs(still.y - parked.y)).toBeLessThan(3);
    expect(Math.abs(still.x - parked.x)).toBeLessThan(3);
    expect(still.keys).toEqual({ up: false, down: false, left: false, right: false });
    await page.keyboard.down('ArrowDown');
    await page.waitForTimeout(280);
    await page.keyboard.up('ArrowDown');
    const moved = await hub(page);
    expect(moved.y).toBeGreaterThan(parked.y + 4);
    await steer(page, { ...cellCenter({ col: MARKET.spawn.col, row: MARKET.counterRow }), interact: 'shop' });
  }

  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-shop', 'open');
  await expect(app).toHaveAttribute('data-shop-item', 'rainBun');
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-coins', '8');
  await page.keyboard.press('Escape');
  await expect(app).toHaveAttribute('data-shop', 'closed');
  await assertLoop(page);

  await steer(page, { ...cellCenter(MARKET.door), scene: 'TownScene' });
  await steer(page, cellCenter(TOWN.houseExit));
  await steer(page, { ...cellCenter(TOWN.houseMat), scene: 'HouseScene' });
  const chest = cellCenter(HOUSE.chest);
  await steer(page, { ...chest, interact: 'chest' });

  for (let i = 0; i < 3; i++) {
    await page.keyboard.down('ArrowUp');
    await page.keyboard.down('Space');
    await expect(app).toHaveAttribute('data-shop', 'open');
    await page.keyboard.up('Space');
    await expect(app).toHaveAttribute('data-shop', 'open');
    await expect(app).toHaveAttribute('data-bag', /rainBun/);
    await page.keyboard.up('ArrowUp');
    await assertLoop(page);
    await page.keyboard.press('Escape');
    await expect(app).toHaveAttribute('data-shop', 'closed');
    const parked = await hub(page);
    await page.waitForTimeout(350);
    const still = await hub(page);
    expect(Math.abs(still.x - parked.x)).toBeLessThan(3);
    expect(Math.abs(still.y - parked.y)).toBeLessThan(3);
    await steer(page, { ...chest, interact: 'chest' });
  }

  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-shop', 'open');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(80);
  await page.keyboard.press('Space');
  await expect
    .poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('rainknights:save') ?? '{}').town.stash.rainBun))
    .toBe(1);
  await expect(app).toHaveAttribute('data-bag', '');
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(80);
  await page.keyboard.press('Space');
  await expect
    .poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('rainknights:save') ?? '{}').town.bag.rainBun))
    .toBe(1);
  await page.keyboard.press('Escape');
  await expect(app).toHaveAttribute('data-shop', 'closed');
  await assertLoop(page);

  const bed = cellCenter(HOUSE.bed);
  await page.evaluate(() => (window as unknown as { __hub: { wound: (hp: number) => void } }).__hub.wound(30));
  await expect(app).toHaveAttribute('data-hp', '30');
  await steer(page, { ...bed, interact: 'bed' });
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-shop', 'open');
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-hp', '100');
  await expect(app).toHaveAttribute('data-dialog', 'open');
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-dialog', '');

  const mirror = cellCenter(HOUSE.mirror);
  await steer(page, { ...mirror, interact: 'mirror' });
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-scene', 'CharacterSelectScene');
  await page.keyboard.press('Escape');
  await expect(app).toHaveAttribute('data-scene', 'HouseScene');

  const rack = cellCenter(HOUSE.rack);
  await steer(page, { ...rack, interact: 'rack' });
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-dialog', 'open');
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-dialog', '');

  await steer(page, { ...cellCenter(HOUSE.door), scene: 'TownScene' });
  const pia = cellCenter({ col: 5, row: 9 });
  await steer(page, { ...pia, interact: 'pia' });
  await page.keyboard.down('Space');
  await expect(app).toHaveAttribute('data-dialog', 'open');
  await page.keyboard.up('Space');
  await expect(app).toHaveAttribute('data-dialog', 'open');
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-dialog', '');

  // onto the flight pad and up into the map, then Esc flies home
  await steer(page, { ...padCenter(), interact: 'pad' });
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-scene', 'FlightScene');
  await page.keyboard.press('Escape');
  await expect(app).toHaveAttribute('data-scene', 'TownScene', { timeout: 8_000 });
  await assertLoop(page);

  expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
});

test('the market has a CHARMS counter: buy one, and it is worn and shown in the bag', async ({ page }) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  // a pocketful of drips, so a charm is within reach
  await page.goto('/');
  await expect(page.locator('#app')).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('Space');
  await expect(page.locator('#app')).toHaveAttribute('data-scene', 'TownScene');
  await page.evaluate(() => {
    const doc = JSON.parse(localStorage.getItem('rainknights:save') ?? 'null');
    doc.town.coins = 500;
    localStorage.setItem('rainknights:save', JSON.stringify(doc));
  });
  const app = await startTown(page);
  await steer(page, cellCenter(TOWN.shopExit));
  await steer(page, { ...cellCenter(TOWN.shopMat), scene: 'MarketScene' });
  await steer(page, { ...cellCenter({ col: MARKET.spawn.col, row: MARKET.counterRow }), interact: 'shop' });
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-shop', 'open');
  // LEAVE is the last row and CHARMS the one before it: up from the top wraps to LEAVE
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(100);
  await page.keyboard.press('ArrowUp');
  await expect(app).toHaveAttribute('data-shop-item', 'charms');
  await page.waitForTimeout(100);
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'e2e-artifacts/market-charms.png' });
  await page.keyboard.press('Space'); // the first charm on the list: Bolt Ring
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('rainknights:save') ?? 'null')?.town?.charms?.boltRing === 1);
  const town = await page.evaluate(() => JSON.parse(localStorage.getItem('rainknights:save') ?? 'null').town);
  expect(town.worn).toEqual(['boltRing']);
  expect(town.coins).toBeLessThan(500);
  expect(errors, errors.join('\n')).toEqual([]);
});

test.describe('touch', () => {
  const pixel = devices['Pixel 7'];
  test.use({
    viewport: pixel.viewport,
    userAgent: pixel.userAgent,
    deviceScaleFactor: pixel.deviceScaleFactor,
    isMobile: pixel.isMobile,
    hasTouch: pixel.hasTouch,
  });

  test('A opens the market without buying, and the stick still moves afterwards', async ({ page }) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });

    await page.goto('/');
    const app = page.locator('#app');
    await expect(app).toHaveAttribute('data-scene', 'MenuScene');
    await page.keyboard.press('Space');
    await expect(app).toHaveAttribute('data-scene', 'TownScene');
    await watchFrames(page);
    await expect(page.getByTestId('touch-controls')).toBeVisible();

    await steer(page, cellCenter(TOWN.shopExit));
    await steer(page, { ...cellCenter(TOWN.shopMat), scene: 'MarketScene' });
    await steer(page, { ...cellCenter({ col: MARKET.spawn.col, row: MARKET.counterRow }), interact: 'shop' });

    await holdStick(page, 'up');
    await tapButton(page, 'a');
    await expect(app).toHaveAttribute('data-shop', 'open');
    await expect(app).toHaveAttribute('data-coins', '20');
    await releaseStick(page);
    await assertLoop(page);

    // down past every row (the CHARMS counter is the one before LEAVE) to LEAVE
    for (let i = 0; i < 7; i++) await nudgeStick(page, 'down');
    await expect(app).toHaveAttribute('data-shop-item', 'leave');
    await tapButton(page, 'a');
    await expect(app).toHaveAttribute('data-shop', 'closed');
    await expect(app).toHaveAttribute('data-coins', '20');

    const parked = await hub(page);
    await holdStick(page, 'down');
    await page.waitForTimeout(280);
    await releaseStick(page);
    const moved = await hub(page);
    expect(moved.y).toBeGreaterThan(parked.y + 4);
    await assertLoop(page);
    expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
  });
});

async function tapButton(page: Page, className: string) {
  await page.evaluate((name) => {
    const el = document.querySelector<HTMLButtonElement>(`#touch-controls button.${name}`);
    if (!el) throw new Error(`missing touch button ${name}`);
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
  }, className);
}

async function holdStick(page: Page, dir: 'up' | 'down') {
  await page.evaluate((direction) => {
    const stick = document.querySelector<HTMLElement>('#touch-controls .stick');
    if (!stick) throw new Error('missing stick');
    const rect = stick.getBoundingClientRect();
    const y = direction === 'up' ? rect.top + rect.height * 0.12 : rect.top + rect.height * 0.88;
    stick.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 3,
        pointerType: 'touch',
        button: 0,
        buttons: 1,
        clientX: rect.left + rect.width / 2,
        clientY: y,
      })
    );
  }, dir);
}

async function releaseStick(page: Page) {
  await page.evaluate(() => {
    const stick = document.querySelector<HTMLElement>('#touch-controls .stick');
    if (!stick) return;
    const rect = stick.getBoundingClientRect();
    stick.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        pointerId: 3,
        pointerType: 'touch',
        button: 0,
        buttons: 0,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      })
    );
  });
}

async function nudgeStick(page: Page, dir: 'up' | 'down') {
  await holdStick(page, dir);
  await page.waitForTimeout(30);
  await releaseStick(page);
  await page.waitForTimeout(30);
}
