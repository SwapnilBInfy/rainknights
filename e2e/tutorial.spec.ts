import { test, expect } from './fixtures';
import { type Page } from '@playwright/test';

// The optional tutorial: reachable from the title, teaches each mechanic in the
// real game, and never touches the saved run.

const SAVE_KEY = 'rainknights:save';

async function openTutorial(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-scene', 'MenuScene');
  await expect(app).toHaveAttribute('data-tutorial-link', 'T: TUTORIAL');
  await page.keyboard.press('KeyT');
  await expect(app).toHaveAttribute('data-scene', 'GameScene');
  return errors;
}

const step = (page: Page) => page.evaluate(`window.__rk.tutorialStep()`) as Promise<string | null>;
const frame = { polling: 'raf' as const, timeout: 20_000 };
const waitForStep = (page: Page, id: string) =>
  page.waitForFunction((s) => (window as any).__rk.tutorialStep() === s, id, frame).catch(async (e) => {
    const state = await page
      .evaluate(`JSON.stringify({ step: window.__rk.tutorialStep(), hp: window.__rk.hp(), x: Math.round(window.__rk.x()), y: Math.round(window.__rk.y()), types: window.__rk.enemyTypes(), d: window.__rk.enemyDistances().map(Math.round), gems: window.__rk.gems().map(g => g.map(Math.round)), under: window.__rk.terrain().under })`)
      .catch(() => 'unavailable');
    throw new Error(`still waiting for step "${id}": ${state}\n${e.message}`);
  });

/** Steer toward the nearest gem until none are left (or the step has moved on). */
async function walkToGems(page: Page) {
  const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
  const down = new Set<string>();
  const set = async (want: Set<string>) => {
    for (const k of keys) {
      if (want.has(k) && !down.has(k)) await page.keyboard.down(k), down.add(k);
      if (!want.has(k) && down.has(k)) await page.keyboard.up(k), down.delete(k);
    }
  };
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const info = await page.evaluate(`JSON.stringify({ step: window.__rk.tutorialStep(), x: window.__rk.x(), y: window.__rk.y(), gems: window.__rk.gems() })`);
    const { step: s, x, y, gems } = JSON.parse(info as string) as { step: string; x: number; y: number; gems: number[][] };
    if (s !== 'gems' || gems.length === 0) break;
    const [gx, gy] = gems.reduce((a, b) => (Math.hypot(a[0] - x, a[1] - y) <= Math.hypot(b[0] - x, b[1] - y) ? a : b));
    const want = new Set<string>();
    if (gx - x > 3) want.add('KeyD');
    if (x - gx > 3) want.add('KeyA');
    if (gy - y > 3) want.add('KeyS');
    if (y - gy > 3) want.add('KeyW');
    await set(want);
    await page.waitForTimeout(40);
  }
  await set(new Set());
}

test('the title offers the tutorial, and a fresh player can start it with T', async ({ page }) => {
  const errors = await openTutorial(page);
  await expect(page.locator('#app')).toHaveAttribute('data-prompt', /^1\/10 MOVE \| Walk around with WASD/);
  expect(await step(page)).toBe('move');
  // No storm: no clock, no waves, no boss.
  await page.waitForTimeout(1500);
  expect(await page.evaluate(`window.__rk.elapsedSeconds()`)).toBe(0);
  expect(await page.evaluate(`window.__rk.enemyTypes()`)).toEqual([]);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('walks through every step with real input, then returns to the title', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = await openTutorial(page);
  const app = page.locator('#app');

  // 1 MOVE: walk right.
  await page.keyboard.down('KeyD');
  await waitForStep(page, 'swing');
  await page.keyboard.up('KeyD');

  // 2 SWING: a dummy stands in front; swing at it.
  expect(await page.evaluate(`window.__rk.enemyTypes()`)).toContain('trainingDummy');
  await page.keyboard.down('Space');
  await waitForStep(page, 'beam');
  await page.keyboard.up('Space');

  // 3 BEAM: two dummies in a line; fire.
  await page.waitForFunction(() => (window as any).__rk.enemyTypes().filter((t: string) => t === 'trainingDummy').length >= 2, undefined, frame);
  await page.keyboard.down('KeyJ');
  await waitForStep(page, 'gems');
  await page.keyboard.up('KeyJ');

  // 4 GEMS: three gems appear around the knight. Walk to each one.
  await walkToGems(page);
  await waitForStep(page, 'levelup');

  // 5 LEVEL UP: the level gave 3 points; open the Bag (I) to see them, then close it.
  await page.keyboard.press('KeyI');
  await expect(app).toHaveAttribute('data-bag-page', 'top');
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyI');
  await expect(app).not.toHaveAttribute('data-bag-page', /.+/);
  await waitForStep(page, 'dodge');

  // 6 DODGE: roll just as the cab's charge reaches us (the roll's untouchable window covers the pass).
  // A mistimed roll is fine: the game says "OUCH! AGAIN" and the cab comes round for another try.
  for (let attempt = 0; attempt < 6 && (await step(page)) === 'dodge'; attempt++) {
    await page.waitForFunction(
      () => {
        const rk = (window as any).__rk;
        if (rk.tutorialStep() !== 'dodge') return true;
        const i = rk.enemyTypes().indexOf('cabWraith');
        return i >= 0 && rk.enemyPhases()[i] === 'charge' && rk.enemyDistances()[i] < 60;
      },
      undefined,
      frame
    ).catch(async (e) => {
      const state = await page.evaluate(`JSON.stringify({ step: window.__rk.tutorialStep(), hp: window.__rk.hp(), x: Math.round(window.__rk.x()), y: Math.round(window.__rk.y()), types: window.__rk.enemyTypes(), phases: window.__rk.enemyPhases(), offsets: window.__rk.enemyOffsets().map(o => o.map(Math.round)), under: window.__rk.terrain().under })`).catch(() => 'unavailable');
      throw new Error(`the dodge step stalled: ${state}\n${e.message}`);
    });
    if ((await step(page)) === 'dodge') await page.keyboard.press('KeyK');
    await page.waitForTimeout(1600); // let the charge finish and the cab stall
  }
  await waitForStep(page, 'strike');

  // 7 STRIKE: defeat the cab (we use the debug kill: chasing a moving cab is not what is under test).
  await page.evaluate(`window.__rk.killNearest()`);
  await waitForStep(page, 'wet');

  // 8 WET: beam the wet dummy in front of us.
  await page.keyboard.down('KeyJ');
  await waitForStep(page, 'storm');
  await page.keyboard.up('KeyJ');

  // 9 STORM: lightning strikes under the knight after a beat; walk out of the circle.
  // (The terrain is random, so try a different way each round in case a rock is in the path.)
  for (const dir of ['KeyD', 'KeyS', 'KeyA', 'KeyW', 'KeyD', 'KeyS']) {
    if ((await step(page)) !== 'storm') break;
    await page.keyboard.down(dir);
    await page.waitForTimeout(1900);
    await page.keyboard.up(dir);
  }
  await waitForStep(page, 'done').catch(async (e) => {
    const state = await page.evaluate(`JSON.stringify({ step: window.__rk.tutorialStep(), hp: window.__rk.hp(), x: Math.round(window.__rk.x()), y: Math.round(window.__rk.y()), hazards: window.__rk.hazards() })`);
    throw new Error(`stuck at the storm step: ${state}\n${e.message}`);
  });

  // 10 DONE: Space returns to the title.
  await expect(app).toHaveAttribute('data-prompt', /^10\/10 ALL SET!/);
  await page.waitForTimeout(900);
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-scene', 'MenuScene');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Enter skips a step', async ({ page }) => {
  const errors = await openTutorial(page);
  await page.keyboard.press('Enter');
  await waitForStep(page, 'swing');
  await page.keyboard.press('Enter');
  await waitForStep(page, 'beam');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('the tutorial never touches a saved run, and pausing then quitting returns to the title', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const seeded = JSON.stringify({
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
        x: 900, y: 800, hp: 80, maxHp: 100, baseMoveSpeed: 80, attackDamage: 18, attackRange: 110, attackCooldown: 550,
        magnetRadius: 34, pierce: 0, xp: 4, level: 4, xpToNext: 76, kills: 6,
        powerups: { sunbeam: 0, rainbowShield: 0, gale: 0, frost: 0, staticCharge: 0 },
        facing: 'down', flipX: false, aimX: 0, aimY: 1,
      },
    },
  });
  await page.addInitScript(([key, value]) => {
    if (!localStorage.getItem(key)) localStorage.setItem(key, value);
  }, [SAVE_KEY, seeded] as const);
  await page.goto('/');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-title-menu', 'continue'); // a save exists: the menu, not PRESS START
  await expect(app).toHaveAttribute('data-tutorial-link', 'T: TUTORIAL');
  const before = await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY);

  await page.keyboard.press('KeyT');
  await expect(app).toHaveAttribute('data-scene', 'GameScene');
  await page.keyboard.down('KeyD');
  await waitForStep(page, 'swing');
  await page.keyboard.up('KeyD');
  await page.waitForTimeout(1200);

  // Pause, then Quit (confirm) from the pause menu.
  await page.keyboard.press('Escape');
  const pause = page.getByRole('dialog', { name: 'Paused' });
  await expect(pause).toBeVisible();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter'); // Quit -> asks first
  await expect(page.getByRole('dialog', { name: /Leave tutorial\?/ })).toBeVisible();
  await page.keyboard.press('ArrowDown'); // NO -> YES
  await page.keyboard.press('Enter');
  await expect(app).toHaveAttribute('data-scene', 'MenuScene');

  // The saved run is exactly as it was, and Continue is still offered.
  expect(await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY)).toBe(before);
  await expect(app).toHaveAttribute('data-title-menu', 'continue');
  expect(errors, errors.join('\n')).toEqual([]);
});

test.describe('touch', () => {
  test.use({ viewport: { width: 780, height: 1100 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

  test('touch players see touch wording', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/');
    const app = page.locator('#app');
    await expect(app).toHaveAttribute('data-tutorial-link', 'TAP: TUTORIAL');
    await page.keyboard.press('KeyT'); // a paired keyboard still works
    await expect(app).toHaveAttribute('data-scene', 'GameScene');
    await expect(app).toHaveAttribute('data-prompt', /Walk around with the STICK/);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
