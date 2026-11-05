import { test, expect, devices, type Page } from '@playwright/test';

test('page title loads and a Phaser canvas renders without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // Register before navigation so BootScene's emblem loads are not missed.
  const emblemsLoaded = Promise.all([
    page.waitForResponse((response) => response.url().includes('emblem_nyc.png')),
    page.waitForResponse((response) => response.url().includes('emblem_miami.png')),
  ]);

  await page.goto('/');

  await expect(page).toHaveTitle('Rainknights');

  const canvas = page.locator('#app canvas');
  await expect(canvas).toBeVisible();
  // Phaser sets the bitmap to the native 240×160 view once the game boots.
  await expect(canvas).toHaveJSProperty('width', 240);
  await expect(canvas).toHaveJSProperty('height', 160);

  const responses = await emblemsLoaded;
  for (const response of responses) {
    expect(response.ok(), `${response.url()} returned ${response.status()}`).toBe(true);
  }

  // A mouse-only browser keeps the virtual controls out of the playfield.
  await expect(page.getByTestId('touch-controls')).toBeHidden();

  expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
});

test('pause overlay opens and closes from the keyboard', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await beginRun(page);

  const pause = page.getByRole('dialog', { name: 'Paused' });
  await expect(pause).toBeHidden();

  await page.keyboard.press('Escape');
  await expect(pause).toBeVisible();
  await expect(pause.getByRole('button', { name: /^resume$/i })).toBeVisible();
  await expect(pause.getByRole('button', { name: /^sound (on|off)$/i })).toBeVisible();
  await expect(pause.getByRole('button', { name: /^quit$/i })).toBeVisible();

  await page.keyboard.press('KeyP');
  await expect(pause).toBeHidden();

  expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
});

test.describe('touch devices', () => {
  // defaultBrowserType cannot be set inside a describe, so copy the device fields that emulate a phone.
  const pixel = devices['Pixel 7'];
  test.use({
    viewport: pixel.viewport,
    userAgent: pixel.userAgent,
    deviceScaleFactor: pixel.deviceScaleFactor,
    isMobile: pixel.isMobile,
    hasTouch: pixel.hasTouch,
  });

  test('touch controls render under touch emulation', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/');
    await expect(page.locator('#app canvas')).toBeVisible();

    const controls = page.getByTestId('touch-controls');
    await expect(controls).toBeVisible();
    const stick = page.getByTestId('touch-stick');
    await expect(stick).toBeVisible();
    await expect(page.getByRole('button', { name: /^a$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^b$/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /^start$/i })).toBeVisible();

    const stickBox = await stick.boundingBox();
    const aBox = await page.getByRole('button', { name: /^a$/i }).boundingBox();
    const canvasBox = await page.locator('#app canvas').boundingBox();
    expect(stickBox, 'd-pad has a layout box').not.toBeNull();
    expect(aBox, 'A button has a layout box').not.toBeNull();
    // Thumb-sized, not a 16px game pixel. Pixel 7 letterbox scales the pad up.
    expect(stickBox!.width).toBeGreaterThanOrEqual(100);
    expect(stickBox!.height).toBeGreaterThanOrEqual(100);
    expect(aBox!.width).toBeGreaterThanOrEqual(64);
    expect(aBox!.height).toBeGreaterThanOrEqual(64);
    expect(overlaps(stickBox!, canvasBox!), 'd-pad should sit outside the screen').toBe(false);
    expect(overlaps(aBox!, canvasBox!), 'A should sit outside the screen').toBe(false);

    const touchAction = await page.locator('canvas').evaluate((el) => getComputedStyle(el).touchAction);
    expect(touchAction).toBe('none');

    // Two fingers at once: steer right and hold A. Neither may cancel the other.
    const held = await page.evaluate(() => {
      const pad = document.querySelector<HTMLElement>('#touch-controls .stick')!;
      const attack = document.querySelector<HTMLElement>('#touch-controls button.a')!;
      const padBox = pad.getBoundingClientRect();
      const attackBox = attack.getBoundingClientRect();
      const point = (type: string, id: number, x: number, y: number) =>
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerId: id,
          pointerType: 'touch',
          button: 0,
          buttons: type === 'pointerup' ? 0 : 1,
          clientX: x,
          clientY: y,
        });
      pad.dispatchEvent(point('pointerdown', 1, padBox.left + padBox.width * 0.86, padBox.top + padBox.height / 2));
      attack.dispatchEvent(
        point('pointerdown', 2, attackBox.left + attackBox.width / 2, attackBox.top + attackBox.height / 2)
      );
      const during = {
        dir: pad.parentElement?.dataset.dir ?? '',
        attack: attack.dataset.held === '1',
      };
      pad.dispatchEvent(point('pointerup', 1, padBox.left + padBox.width * 0.86, padBox.top + padBox.height / 2));
      attack.dispatchEvent(
        point('pointerup', 2, attackBox.left + attackBox.width / 2, attackBox.top + attackBox.height / 2)
      );
      return during;
    });
    expect(held.dir).toContain('right');
    expect(held.attack).toBe(true);

    expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
  });
});

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function beginRun(page: Page) {
  await page.goto('/');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-scene', 'CharacterSelectScene');
  await page.keyboard.press('Digit1');
  await expect(app).toHaveAttribute('data-scene', 'RegionSelectScene');
  await page.keyboard.press('Digit1');
  await expect(app).toHaveAttribute('data-scene', 'GameScene');
}
