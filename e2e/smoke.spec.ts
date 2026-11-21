import { mkdirSync } from 'node:fs';
import { beginCityRun, test, expect } from './fixtures';
import { devices, type Page } from '@playwright/test';

declare global {
  interface Window {
    __rk?: {
      grantLevel: () => void;
      isScenePaused: () => boolean;
      elapsedSeconds: () => number;
      bagPage: () => string | null;
      statPoints: () => number;
      maxHp: () => number;
      spend: (stat: string, dir: number) => boolean;
      level: () => number;
      x: () => number;
      y: () => number;
      hp: () => number;
      characterId: () => string;
      regionId: () => string;
    };
  }
}

const SHOTS = 'e2e-artifacts';
mkdirSync(SHOTS, { recursive: true });

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

  await expect(page).toHaveTitle('RainKnights — pixel-art storm survival');
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /lone knight fights weather-born enemies/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://rainknights.vercel.app/');
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /RainKnights/);
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute('content', /weather-born enemies/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', 'https://rainknights.vercel.app/og.png');
  await expect(page.locator('meta[property="og:image:width"]')).toHaveAttribute('content', '1200');
  await expect(page.locator('meta[property="og:image:height"]')).toHaveAttribute('content', '630');
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute('content', 'summary_large_image');
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute('content', 'https://rainknights.vercel.app/og.png');
  await expect(page.locator('link[rel="icon"][href*="favicon.ico"]')).toHaveAttribute('href', /favicon\.ico/);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', /site\.webmanifest/);

  const og = await page.request.get('/og.png');
  expect(og.ok(), `og.png returned ${og.status()}`).toBe(true);
  const ogBytes = await og.body();
  // PNG IHDR width/height sit at bytes 16 and 20.
  expect(ogBytes.readUInt32BE(16), 'social image width').toBe(1200);
  expect(ogBytes.readUInt32BE(20), 'social image height').toBe(630);

  const favicon = await page.request.get('/favicon.ico');
  expect(favicon.ok(), `favicon.ico returned ${favicon.status()}`).toBe(true);
  expect((await favicon.body()).byteLength).toBeGreaterThan(100);

  const manifest = await page.request.get('/site.webmanifest');
  expect(manifest.ok(), `manifest returned ${manifest.status()}`).toBe(true);
  const manifestJson = await manifest.json();
  expect(manifestJson.name).toBe('RainKnights');
  expect(manifestJson.icons?.length).toBeGreaterThan(0);

  const robots = await page.request.get('/robots.txt');
  expect(robots.ok()).toBe(true);
  const robotsText = await robots.text();
  expect(robotsText).toContain('User-agent:');
  expect(robotsText).not.toContain('<html');

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
  await expect(page.locator('#app')).toHaveAttribute('data-menu-hint', 'WASD MOVE  SPACE HIT  J BEAM');

  expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
});

test('pause overlay opens and closes from the keyboard', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await beginRun(page);
  await expect(page.locator('#app')).toHaveAttribute('data-beam-key', 'J');

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
    await expect(page.locator('#app')).toHaveAttribute('data-menu-hint', 'STICK MOVE  A SWING  B BEAM');

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

test.describe('feel follow-ups', () => {
  test.describe('touch labels, press, and quit confirm', () => {
    test.use({
      viewport: { width: 780, height: 1100 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 1,
    });

    test('HUD prompt uses A/B/Start while touch is active', async ({ page }) => {
      const errors = collectErrors(page);
      await beginRun(page);
      const app = page.locator('#app');
      await expect(app).toHaveAttribute('data-beam-key', 'B');
      await expect(app).toHaveAttribute('data-attack-hint', /A\/SPACE: swing weapon/);
      await expect(app).toHaveAttribute('data-attack-hint', /START: pause/);
      await page.screenshot({ path: `${SHOTS}/mobile-hud-touch-labels.png` });

      await holdTouchButton(page, 'a');
      const pressed = await page.locator('#touch-controls button.a').evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          transform: style.transform,
          filter: style.filter,
          background: style.backgroundColor,
          tap: style.getPropertyValue('-webkit-tap-highlight-color'),
        };
      });
      expect(pressed.transform).not.toBe('none');
      expect(pressed.filter).toContain('brightness');
      expect(pressed.background).not.toBe('rgb(255, 255, 255)');
      expect(pressed.tap === '' || pressed.tap === 'transparent' || pressed.tap === 'rgba(0, 0, 0, 0)').toBe(true);
      await page.screenshot({ path: `${SHOTS}/mobile-press-feedback.png` });
      await releaseTouchButton(page, 'a');

      expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
    });

    test('quit asks before abandoning the run', async ({ page }) => {
      const errors = collectErrors(page);
      await beginRun(page);

      await page.keyboard.press('Escape');
      const pause = page.getByRole('dialog', { name: 'Paused' });
      await expect(pause).toBeVisible();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');

      const confirm = page.getByRole('dialog', { name: 'Abandon run?' });
      await expect(confirm).toBeVisible();
      await expect(confirm.getByText('Abandon run?')).toBeVisible();
      await expect(confirm.getByRole('button', { name: 'NO' })).toHaveAttribute('aria-current', 'true');
      await expect(page.locator('#app')).toHaveAttribute('data-scene', 'GameScene');
      await page.screenshot({ path: `${SHOTS}/mobile-quit-confirm.png` });

      // Default NO returns to the pause menu instead of dropping the run.
      await page.keyboard.press('Enter');
      await expect(pause).toBeVisible();
      await expect(page.locator('#app')).toHaveAttribute('data-scene', 'GameScene');

      // Esc backs out of the question rather than resuming.
      await page.keyboard.press('Enter');
      await expect(confirm).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(pause).toBeVisible();

      await page.keyboard.press('Enter');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(page.locator('#app')).toHaveAttribute('data-scene', 'MenuScene');
      await expect(page.locator('#app')).toHaveAttribute('data-title-menu', 'town');
      const abandoned = await page.evaluate(() => JSON.parse(localStorage.getItem('rainknights:save') || 'null'));
      expect(abandoned.run).toBeNull();

      expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
    });
  });

  test('a level is a reward, not an interruption: three points, a message, and play goes on', async ({ page }) => {
    const errors = collectErrors(page);
    await beginRun(page);
    expect(await page.evaluate(() => window.__rk?.statPoints())).toBe(0);

    await page.evaluate(() => window.__rk?.grantLevel());
    await page.waitForFunction(() => (window.__rk?.level() ?? 1) > 1, undefined, { polling: 'raf', timeout: 10_000 });
    expect(await page.evaluate(() => window.__rk?.statPoints())).toBe(3);
    // no menu, no pause: the clock keeps running
    expect(await page.evaluate(() => window.__rk?.bagPage())).toBeNull();
    expect(await page.evaluate(() => window.__rk?.isScenePaused())).toBe(false);
    const before = await page.evaluate(() => window.__rk?.elapsedSeconds() ?? 0);
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.__rk?.elapsedSeconds() ?? 0)).toBeGreaterThan(before);
    await page.screenshot({ path: `${SHOTS}/desktop-level-points.png` });

    expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
  });

  test('the Bag (I) stops the game, spends points on a stat, and I closes it', async ({ page }) => {
    const errors = collectErrors(page);
    await beginRun(page);
    const app = page.locator('#app');
    await page.evaluate(() => window.__rk?.grantLevel());
    await page.waitForFunction(() => (window.__rk?.statPoints() ?? 0) === 3, undefined, { polling: 'raf', timeout: 10_000 });
    const hpMax = await page.evaluate(() => window.__rk?.maxHp() ?? 0);

    await page.keyboard.press('KeyI');
    await expect(app).toHaveAttribute('data-bag-page', 'top');
    expect(await page.evaluate(() => window.__rk?.isScenePaused())).toBe(true);
    const before = await page.evaluate(() => window.__rk?.elapsedSeconds());
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.__rk?.elapsedSeconds())).toBe(before);
    await page.screenshot({ path: `${SHOTS}/desktop-bag.png` });

    // STATS is the third row; ENDURANCE the third stat. Right adds a point.
    const tapMenu = async (key: string) => {
      await page.keyboard.press(key);
      await page.waitForTimeout(80); // one key per menu frame
    };
    await tapMenu('ArrowDown');
    await tapMenu('ArrowDown');
    await tapMenu('Space');
    await expect(app).toHaveAttribute('data-bag-page', 'stats');
    await tapMenu('ArrowDown');
    await tapMenu('ArrowDown');
    await tapMenu('ArrowRight');
    await tapMenu('ArrowRight');
    await page.waitForFunction(() => (window.__rk?.statPoints() ?? 9) === 1);
    expect(await page.evaluate(() => window.__rk?.maxHp() ?? 0)).toBe(hpMax + 16);
    await page.screenshot({ path: `${SHOTS}/desktop-bag-stats.png` });

    // Esc steps back to the Bag; I closes it and the game runs again.
    await page.keyboard.press('Escape');
    await expect(app).toHaveAttribute('data-bag-page', 'top');
    await page.keyboard.press('KeyI');
    await expect(app).not.toHaveAttribute('data-bag-page', /.+/);
    expect(await page.evaluate(() => window.__rk?.isScenePaused())).toBe(false);

    expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
  });
});

test('a run and the mute setting survive reload and Continue', async ({ page }) => {
  const errors = collectErrors(page);
  await beginRun(page);
  await page.waitForTimeout(1200);
  await page.keyboard.press('KeyM');

  await page.evaluate(() => window.__rk?.grantLevel());
  const app = page.locator('#app');
  await page.waitForFunction(() => (window.__rk?.level() ?? 1) > 1, undefined, { polling: 'raf', timeout: 10_000 });

  const before = await page.evaluate(() => {
    const raw = localStorage.getItem('rainknights:save');
    const save = raw ? JSON.parse(raw) : null;
    return {
      save,
      level: window.__rk?.level() ?? 0,
      time: window.__rk?.elapsedSeconds() ?? 0,
    };
  });
  expect(before.level).toBe(2);
  expect(before.save.version).toBe(2);
  expect(before.save.settings.muted).toBe(true);
  expect(before.save.run.player.level).toBe(2);
  expect(before.save.run.characterId).toBe('rainKnight');
  expect(before.save.run.regionId).toBe('nyc');
  expect(before.save.run.elapsedSeconds).toBeGreaterThan(0);

  await page.reload();
  await expect(app).toHaveAttribute('data-scene', 'MenuScene');
  await expect(app).toHaveAttribute('data-title-menu', 'continue');
  await expect(app).toHaveAttribute('data-title-choice', 'continue');
  await expect(app).toHaveAttribute('data-run-level', '2');
  await page.screenshot({ path: `${SHOTS}/desktop-continue-menu.png` });

  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(app).toHaveAttribute('data-erase-confirm', 'open');
  await expect(app).toHaveAttribute('data-title-choice', 'no');
  await page.screenshot({ path: `${SHOTS}/desktop-erase-confirm.png` });
  await page.keyboard.press('Enter');
  await expect(app).not.toHaveAttribute('data-erase-confirm', 'open');
  await expect(app).toHaveAttribute('data-title-choice', 'reset');

  await page.keyboard.press('Digit1');
  await expect(app).toHaveAttribute('data-scene', 'GameScene');
  const after = await page.evaluate(() => ({
    level: window.__rk?.level() ?? 0,
    time: window.__rk?.elapsedSeconds() ?? 0,
    characterId: window.__rk?.characterId() ?? '',
    regionId: window.__rk?.regionId() ?? '',
  }));
  expect(after.level).toBe(2);
  expect(after.characterId).toBe('rainKnight');
  expect(after.regionId).toBe('nyc');
  expect(after.time).toBeGreaterThanOrEqual(before.save.run.elapsedSeconds - 0.05);

  await page.keyboard.press('Escape');
  const pause = page.getByRole('dialog', { name: 'Paused' });
  await expect(pause).toBeVisible();
  await expect(pause.getByRole('button', { name: 'SOUND OFF' })).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const erase = page.getByRole('dialog', { name: 'Erase save?' });
  await expect(erase).toBeVisible();
  await expect(erase.getByRole('button', { name: 'NO' })).toHaveAttribute('aria-current', 'true');
  await page.keyboard.press('Enter');
  await expect(pause).toBeVisible();
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');

  await expect(app).toHaveAttribute('data-scene', 'MenuScene');
  await expect(app).toHaveAttribute('data-title-menu', 'start');
  const wiped = await page.evaluate(() => ({
    save: localStorage.getItem('rainknights:save'),
    legacy: localStorage.getItem('rainknights:muted'),
  }));
  expect(wiped.save).toBeNull();
  expect(wiped.legacy).toBeNull();

  expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
});

test('a corrupt save still boots the title', async ({ page }) => {
  const errors = collectErrors(page);
  await page.addInitScript(() => {
    localStorage.setItem('rainknights:save', '{not json');
  });
  await page.goto('/');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-scene', 'MenuScene');
  await expect(app).toHaveAttribute('data-title-menu', 'start');
  expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
});

test.describe('saved run on a phone', () => {
  const pixel = devices['Pixel 7'];
  test.use({
    viewport: pixel.viewport,
    userAgent: pixel.userAgent,
    deviceScaleFactor: pixel.deviceScaleFactor,
    isMobile: pixel.isMobile,
    hasTouch: pixel.hasTouch,
  });

  test('Continue and Erase save render, and Continue restores the run', async ({ page }) => {
    const errors = collectErrors(page);
    await page.addInitScript((save) => {
      localStorage.setItem('rainknights:save', JSON.stringify(save));
    }, seededSave());

    await page.goto('/');
    const app = page.locator('#app');
    await expect(app).toHaveAttribute('data-scene', 'MenuScene');
    await expect(app).toHaveAttribute('data-title-menu', 'continue');
    await expect(app).toHaveAttribute('data-run-level', '4');
    await page.screenshot({ path: `${SHOTS}/mobile-continue-menu.png` });

    await page.keyboard.press('Digit3');
    await expect(app).toHaveAttribute('data-erase-confirm', 'open');
    await page.screenshot({ path: `${SHOTS}/mobile-erase-confirm.png` });
    await page.keyboard.press('Enter');
    await expect(app).not.toHaveAttribute('data-erase-confirm', 'open');

    await page.keyboard.press('Digit1');
    await expect(app).toHaveAttribute('data-scene', 'GameScene');
    const restored = await page.evaluate(() => ({
      level: window.__rk?.level() ?? 0,
      time: window.__rk?.elapsedSeconds() ?? 0,
      regionId: window.__rk?.regionId() ?? '',
    }));
    expect(restored.level).toBe(4);
    expect(restored.regionId).toBe('nyc');
    expect(restored.time).toBeGreaterThanOrEqual(12);

    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'SOUND OFF' })).toBeVisible();

    expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
  });
});

function seededSave() {
  return {
    version: 1,
    settings: { muted: true },
    meta: { bestTime: 40, bestLevel: 3, bestKills: 10, runs: 1, wins: 0 },
    run: {
      characterId: 'rainKnight',
      regionId: 'nyc',
      weatherLabel: 'Clear',
      weatherCondition: 'clear',
      weatherTint: 0x8fe0ff,
      startFrontIndex: 0,
      elapsedSeconds: 12.5,
      bossHp: null,
      pendingLevelUps: 0,
      player: {
        x: 900,
        y: 800,
        hp: 80,
        maxHp: 100,
        baseMoveSpeed: 80,
        attackDamage: 18,
        attackRange: 110,
        attackCooldown: 550,
        magnetRadius: 34,
        pierce: 0,
        xp: 4,
        level: 4,
        xpToNext: 76,
        kills: 6,
        powerups: { sunbeam: 0, rainbowShield: 0, gale: 0, frost: 0, staticCharge: 0 },
        facing: 'down' as const,
        flipX: false,
        aimX: 0,
        aimY: 1,
      },
    },
  };
}

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  return errors;
}

async function holdTouchButton(page: Page, className: string) {
  await page.evaluate((name) => {
    const el = document.querySelector<HTMLButtonElement>(`#touch-controls button.${name}`);
    if (!el) throw new Error(`missing touch button ${name}`);
    const rect = el.getBoundingClientRect();
    el.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 7,
        pointerType: 'touch',
        button: 0,
        buttons: 1,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      })
    );
  }, className);
}

async function releaseTouchButton(page: Page, className: string) {
  await page.evaluate((name) => {
    const el = document.querySelector<HTMLButtonElement>(`#touch-controls button.${name}`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        pointerId: 7,
        pointerType: 'touch',
        button: 0,
        buttons: 0,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      })
    );
  }, className);
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

async function beginRun(page: Page) {
  await page.goto('/');
  await beginCityRun(page);
}
