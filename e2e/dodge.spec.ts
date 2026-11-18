import { test, expect, type Page } from '@playwright/test';

// The dodge roll: Shift / K on a keyboard, the R button on the touch cluster.
// The debug bridge (window.__rk) exposes just enough state to assert on it.

async function beginRun(page: Page, weather?: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(weather ? `/?weather=${weather}` : '/');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-scene', 'CharacterSelectScene');
  await page.keyboard.press('Digit1');
  await expect(app).toHaveAttribute('data-scene', 'RegionSelectScene');
  await page.keyboard.press('Digit1');
  await expect(app).toHaveAttribute('data-scene', 'GameScene');
  return errors;
}

const rk = <T>(page: Page, fn: string) => page.evaluate(`window.__rk.${fn}`) as Promise<T>;
const pos = async (page: Page) => [await rk<number>(page, 'x()'), await rk<number>(page, 'y()')] as const;

test('K rolls in the held direction, untouchable, then recharges', async ({ page }) => {
  const errors = await beginRun(page);
  await expect(page.locator('#app')).toHaveAttribute('data-roll-key', 'K');
  expect(await rk<number>(page, 'rollCharge()')).toBe(1);

  const [x0, y0] = await pos(page);
  await page.keyboard.down('KeyD');
  await page.keyboard.press('KeyK');
  await expect.poll(() => rk<boolean>(page, 'rolling()')).toBe(true);
  expect(await rk<boolean>(page, 'invulnerable()')).toBe(true);
  expect(await rk<number>(page, 'rollCharge()')).toBeLessThan(1);

  await expect.poll(() => rk<boolean>(page, 'rolling()'), { timeout: 2000 }).toBe(false);
  await page.keyboard.up('KeyD');
  const [x1, y1] = await pos(page);
  expect(x1 - x0, 'rolled right').toBeGreaterThan(25);
  expect(Math.abs(y1 - y0), 'stayed level').toBeLessThan(6);

  // Cooldown: a second press straight away does nothing; later it does.
  await page.keyboard.press('KeyK');
  await page.waitForTimeout(100);
  expect(await rk<boolean>(page, 'rolling()')).toBe(false);
  await expect.poll(() => rk<number>(page, 'rollCharge()'), { timeout: 3000 }).toBe(1);
  await page.keyboard.press('ShiftLeft');
  await expect.poll(() => rk<boolean>(page, 'rolling()')).toBe(true);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('rolling through an enemy avoids the hit and counts as a dodge', async ({ page }) => {
  const errors = await beginRun(page);
  const hp = await rk<number>(page, 'hp()');
  // Rolling with no direction held goes the way you face (down at the start).
  // An enemy waits just ahead, so the knight tumbles straight through it.
  await page.evaluate(`window.__rk.spawnEnemy('rainImp', 0, 30)`);
  await page.keyboard.press('KeyK');
  await expect.poll(() => rk<number>(page, 'dodges()'), { timeout: 1000 }).toBeGreaterThanOrEqual(1);
  expect(await rk<number>(page, 'hp()')).toBe(hp);
  // Once the roll is over the same enemy can hurt again.
  await expect.poll(() => rk<number>(page, 'hp()'), { timeout: 4000 }).toBeLessThan(hp);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a roll puts out a fire', async ({ page }) => {
  const errors = await beginRun(page);
  await page.evaluate(`window.__rk.applyStatus('player', 'burning', 4000)`);
  expect(await rk<string[]>(page, 'statuses()')).toContain('burning');
  await page.keyboard.press('KeyK');
  await expect.poll(() => rk<boolean>(page, 'rolling()')).toBe(true);
  expect(await rk<string[]>(page, 'statuses()')).not.toContain('burning');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('an enemy winding up a dash shows a warning', async ({ page }) => {
  const errors = await beginRun(page);
  await page.evaluate(`window.__rk.spawnEnemy('lightningWisp', 90, 0)`);
  // The wind-up lasts only ~0.35s, so check every frame rather than on a slow poll.
  await page.waitForFunction(() => (window as any).__rk.alerts() >= 1, undefined, { polling: 'raf', timeout: 5000 });
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a frozen knight cannot roll', async ({ page }) => {
  const errors = await beginRun(page);
  await page.evaluate(`window.__rk.applyStatus('player', 'frozen', 1500)`);
  await page.keyboard.press('KeyK');
  await page.waitForTimeout(150);
  expect(await rk<boolean>(page, 'rolling()')).toBe(false);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('rolling through a telegraphed lightning strike avoids the damage', async ({ page }) => {
  const errors = await beginRun(page, 'thunderstorm');
  const hp = await rk<number>(page, 'hp()');
  // The strike lands 1.1s after the warning, just ahead of the roll's path.
  const t0 = await rk<number>(page, 'elapsedSeconds()');
  await page.evaluate(`window.__rk.triggerHazard('lightning', 0, 36)`);
  await page.waitForFunction((t) => window.__rk!.elapsedSeconds() >= t + 0.93, t0, { polling: 'raf' });
  await page.keyboard.press('KeyK'); // untouchable ~0.26s: the bolt arrives while the knight is inside the circle
  await expect.poll(() => rk<number>(page, 'dodges()'), { timeout: 2500 }).toBeGreaterThanOrEqual(1);
  expect(await rk<number>(page, 'hp()')).toBe(hp);
  expect(errors, errors.join('\n')).toEqual([]);
});

test.describe('touch', () => {
  test.use({ viewport: { width: 780, height: 1100 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });

  test('the R button rolls and the HUD labels it R', async ({ page }) => {
    const errors = await beginRun(page);
    const r = page.getByRole('button', { name: /dodge roll/i });
    await expect(r).toBeVisible();
    await expect(page.locator('#app')).toHaveAttribute('data-roll-key', 'R');
    await r.click();
    await expect.poll(() => rk<boolean>(page, 'rolling()')).toBe(true);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
