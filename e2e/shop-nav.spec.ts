import { devices, type Page } from '@playwright/test';
import { test, expect } from './fixtures';
import { MARKET, TOWN, cellCenter } from '../src/town/mistford';

// The shop used to move only when a keydown event arrived. Holding an arrow
// (or the touch stick, which never auto-repeats) left the cursor sitting on
// one row while the knight was locked, which feels like the menu froze.
// A direction already held to walk up to the counter also spun the list.

const ORDER = ['rainBun', 'stormTea', 'sunBean', 'cloth', 'cloak', 'mail', 'leave'] as const;

async function hub(page: Page) {
  return page.evaluate(() => {
    const bridge = (window as unknown as { __hub?: { x: () => number; y: () => number; frames: () => number } }).__hub;
    const app = document.getElementById('app');
    return {
      x: bridge?.x() ?? 0,
      y: bridge?.y() ?? 0,
      frames: bridge?.frames() ?? 0,
      scene: app?.dataset.scene ?? '',
      interact: app?.dataset.interact ?? '',
      shop: app?.dataset.shop ?? '',
      item: app?.dataset.shopItem ?? '',
      coins: app?.dataset.coins ?? '',
      frameErrors: app?.dataset.frameErrors ?? '0',
    };
  });
}

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

function watch(page: Page) {
  const errors: string[] = [];
  const ignore = (text: string) => text.includes('Failed to start the audio device');
  page.on('pageerror', (error) => {
    if (!ignore(error.message)) errors.push(error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error' && !ignore(message.text())) errors.push(message.text());
  });
  return errors;
}

async function atCounter(page: Page) {
  await page.goto('/');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-scene', 'TownScene');
  await steer(page, cellCenter(TOWN.shopExit));
  await steer(page, { ...cellCenter(TOWN.shopMat), scene: 'MarketScene' });
  await steer(page, { ...cellCenter({ col: MARKET.spawn.col, row: MARKET.counterRow }), interact: 'shop' });
  return app;
}

test('holding a direction scrolls the shop, and the walk key does not spin it', async ({ page }) => {
  test.setTimeout(45_000);
  const errors = watch(page);
  await page.setViewportSize({ width: 1100, height: 760 });
  const app = await atCounter(page);

  await page.keyboard.down('ArrowUp');
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-shop', 'open');
  await expect(app).toHaveAttribute('data-shop-item', 'rainBun');
  for (let i = 0; i < 6; i++) {
    await page.evaluate(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', bubbles: true, cancelable: true, repeat: true })
      );
    });
  }
  await expect(app).toHaveAttribute('data-shop-item', 'rainBun');
  await page.keyboard.up('ArrowUp');

  await page.keyboard.down('ArrowDown');
  const seen = new Set<string>();
  const framesAt = (await hub(page)).frames;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(100);
    seen.add((await hub(page)).item);
  }
  await page.keyboard.up('ArrowDown');
  expect([...seen].length, `held down visited ${[...seen].join(',')}`).toBeGreaterThanOrEqual(3);
  const framesLater = (await hub(page)).frames;
  expect(framesLater).toBeGreaterThan(framesAt + 8);
  expect(Number((await hub(page)).frameErrors)).toBe(0);

  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(50);
  const tapped: string[] = [(await hub(page)).item];
  for (let i = 0; i < ORDER.length + 2; i++) {
    await page.keyboard.press('s');
    await page.waitForTimeout(50);
    tapped.push((await hub(page)).item);
  }
  for (const id of ORDER) expect(tapped, tapped.join(',')).toContain(id);

  for (let i = 0; i < ORDER.length + 2 && (await hub(page)).item !== 'rainBun'; i++) {
    await page.keyboard.press('w');
    await page.waitForTimeout(50);
  }
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-coins', '8');
  await expect(app).toHaveAttribute('data-shop', 'open');

  for (let i = 0; i < ORDER.length + 2 && (await hub(page)).item !== 'cloak'; i++) {
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);
  }
  const coins = (await hub(page)).coins;
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-coins', coins);
  await expect(app).toHaveAttribute('data-shop', 'open');

  await page.keyboard.press('Escape');
  await expect(app).toHaveAttribute('data-shop', 'closed');
  expect(errors, errors.join('\n')).toEqual([]);
});

test.describe('touch stick hold', () => {
  const pixel = devices['Pixel 7'];
  test.use({
    viewport: pixel.viewport,
    userAgent: pixel.userAgent,
    deviceScaleFactor: pixel.deviceScaleFactor,
    isMobile: pixel.isMobile,
    hasTouch: pixel.hasTouch,
  });

  test('holding the d-pad keeps moving through the shop', async ({ page }) => {
    test.setTimeout(45_000);
    const errors = watch(page);
    const app = await atCounter(page);
    await expect(page.getByTestId('touch-controls')).toBeVisible();

    await holdStick(page, 'up');
    await tapButton(page, 'a');
    await expect(app).toHaveAttribute('data-shop', 'open');
    await expect(app).toHaveAttribute('data-coins', '20');
    await releaseStick(page);

    await holdStick(page, 'down');
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      await page.waitForTimeout(100);
      seen.add((await hub(page)).item);
    }
    await releaseStick(page);
    expect([...seen].length, `stick visited ${[...seen].join(',')}`).toBeGreaterThanOrEqual(3);
    expect((await hub(page)).frames).toBeGreaterThan(10);

    while ((await hub(page)).item !== 'leave') {
      await nudgeStick(page, 'down');
    }
    await tapButton(page, 'a');
    await expect(app).toHaveAttribute('data-shop', 'closed');
    await expect(app).toHaveAttribute('data-coins', '20');
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test('a gamepad d-pad scrolls the shop and the face buttons buy and close', async ({ page }) => {
  test.setTimeout(45_000);
  const errors = watch(page);
  await page.setViewportSize({ width: 1100, height: 760 });
  const app = await atCounter(page);
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-shop', 'open');
  await page.evaluate(() => {
    const button = (pressed = false) => ({ pressed, value: pressed ? 1 : 0, touched: false });
    const buttons = Array.from({ length: 16 }, () => button(false));
    const pad = {
      id: 'test-pad',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons,
    };
    (window as unknown as { __pad: typeof pad }).__pad = pad;
    navigator.getGamepads = () => [pad as unknown as Gamepad];
  });
  await page.evaluate(() => {
    (window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }).__pad.buttons[13].pressed = true;
    (window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }).__pad.buttons[13].value = 1;
  });
  const seen = new Set<string>();
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(100);
    seen.add((await hub(page)).item);
  }
  expect([...seen].length, `pad visited ${[...seen].join(',')}`).toBeGreaterThanOrEqual(3);
  await page.evaluate(() => {
    const pad = (window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }).__pad;
    pad.buttons[13].pressed = false;
    pad.buttons[13].value = 0;
  });
  expect(errors, errors.join('\n')).toEqual([]);
});

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

async function tapButton(page: Page, className: string) {
  await page.evaluate((name) => {
    const el = document.querySelector<HTMLButtonElement>(`#touch-controls button.${name}`);
    if (!el) throw new Error(`missing ${name}`);
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
