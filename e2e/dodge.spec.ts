import { test, expect } from './fixtures';
import { type Page } from '@playwright/test';

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
/** Resolves in the first frame that sees the knight rolling (a 220ms roll is easy to miss with a slow poll). */
const seeRoll = (page: Page) =>
  page.waitForFunction(() => (window as any).__rk.rolling(), undefined, { polling: 'raf', timeout: 5000 });
/**
 * Start from a quiet moment: how long the scene has been running when a test begins varies (a slower
 * CI runner starts later), so ambient enemies may already be near and may have just hit the knight.
 * A roll only counts as a dodge when it alone blocks the hit, not the half second of hit
 * invulnerability, so clear the ambient enemies and wait that out. New ones take seconds to arrive.
 */
async function quietMoment(page: Page) {
  await page.evaluate(`for (let i = 0; i < 30; i++) window.__rk.killNearest()`);
  await page.waitForFunction(() => !(window as any).__rk.invulnerable(), undefined, { polling: 'raf', timeout: 3000 });
}
const pos = async (page: Page) => [await rk<number>(page, 'x()'), await rk<number>(page, 'y()')] as const;

test('K rolls in the held direction, untouchable, then recharges', async ({ page }) => {
  const errors = await beginRun(page);
  await expect(page.locator('#app')).toHaveAttribute('data-roll-key', 'K');
  expect(await rk<number>(page, 'rollCharge()')).toBe(1);

  const [x0, y0] = await pos(page);
  await page.keyboard.down('KeyD');
  await page.keyboard.press('KeyK');
  // Read everything in the same frame that first sees the roll (a separate call could arrive after it ends).
  const roll = (await page
    .waitForFunction(
      () => {
        const rk = (window as any).__rk;
        return rk.rolling() ? { invulnerable: rk.invulnerable(), charge: rk.rollCharge() } : false;
      },
      undefined,
      { polling: 'raf', timeout: 5000 }
    )
    .then((h) => h.jsonValue())) as { invulnerable: boolean; charge: number };
  expect(roll.invulnerable).toBe(true);
  expect(roll.charge).toBeLessThan(1);

  // The frame the roll ends, the gauge is still recharging (cooldown). Read it there: a wall-clock "press
  // again straight away" check would race the 0.85s cooldown on a slow runner. (Cooldown rules are unit-tested.)
  const ended = (await page
    .waitForFunction(() => ((window as any).__rk.rolling() ? false : { charge: (window as any).__rk.rollCharge() }), undefined, { polling: 'raf', timeout: 4000 })
    .then((h) => h.jsonValue())) as { charge: number };
  expect(ended.charge).toBeLessThan(1);
  await page.keyboard.up('KeyD');
  const [x1, y1] = await pos(page);
  expect(x1 - x0, 'rolled right').toBeGreaterThan(25);
  expect(Math.abs(y1 - y0), 'stayed level').toBeLessThan(6);

  // Once recharged, Shift rolls too.
  await expect.poll(() => rk<number>(page, 'rollCharge()'), { timeout: 3000 }).toBe(1);
  await page.keyboard.press('ShiftLeft');
  await seeRoll(page);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('rolling through an enemy avoids the hit and counts as a dodge', async ({ page }) => {
  const errors = await beginRun(page);
  await quietMoment(page);
  const hp = await rk<number>(page, 'hp()');
  // Rolling with no direction held goes the way you face (down at the start).
  // An enemy waits just ahead, so the knight tumbles straight through it.
  // Spawn the enemy and press the roll key in the same in-page step, so a slow runner cannot put a gap
  // of whole frames between them (the keydown is dispatched the way the touch buttons dispatch theirs).
  await page.evaluate(`(() => {
    window.__rk.spawnEnemy('rainImp', 0, 30);
    const down = new KeyboardEvent('keydown', { code: 'KeyK', key: 'k', bubbles: true, cancelable: true });
    Object.defineProperty(down, 'keyCode', { get: () => 75 });
    Object.defineProperty(down, 'which', { get: () => 75 });
    window.dispatchEvent(down);
    const up = new KeyboardEvent('keyup', { code: 'KeyK', key: 'k', bubbles: true, cancelable: true });
    Object.defineProperty(up, 'keyCode', { get: () => 75 });
    Object.defineProperty(up, 'which', { get: () => 75 });
    window.dispatchEvent(up);
  })()`);
  // Read hp at the very moment the dodge registers (the enemy may rightly hurt once the roll is over).
  const hpAtDodge = await page
    .waitForFunction(() => ((window as any).__rk.dodges() >= 1 ? (window as any).__rk.hp() : false), undefined, { polling: 'raf', timeout: 3000 })
    .then((h) => h.jsonValue());
  expect(hpAtDodge).toBe(hp);
  // Once the roll is over the same enemy can hurt again.
  await expect.poll(() => rk<number>(page, 'hp()'), { timeout: 4000 }).toBeLessThan(hp);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a roll puts out a fire', async ({ page }) => {
  const errors = await beginRun(page);
  await page.evaluate(`window.__rk.applyStatus('player', 'burning', 4000)`);
  expect(await rk<string[]>(page, 'statuses()')).toContain('burning');
  await page.keyboard.press('KeyK');
  // Read the statuses in the same frame that first sees the roll.
  const status = (await page
    .waitForFunction(() => ((window as any).__rk.rolling() ? { s: (window as any).__rk.statuses() as string[] } : false), undefined, { polling: 'raf', timeout: 5000 })
    .then((h) => h.jsonValue())) as { s: string[] };
  expect(status.s).not.toContain('burning');
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

test("a roll's untouchable window blocks a lightning strike", async ({ page }) => {
  const errors = await beginRun(page, 'thunderstorm');
  await quietMoment(page);
  // Roll, and once the knight is verifiably mid-roll drop a strike on them with no warning, so the bolt
  // arrives exactly while the roll is active (no dependence on key latency). The telegraph timing itself
  // is covered by the hazards tests.
  const hp = await rk<number>(page, 'hp()');
  const before = await rk<number>(page, 'dodges()');
  await page.keyboard.press('KeyK');
  // The strike is fired from inside the very frame that first sees the roll, so a slow runner's
  // round-trip latency cannot let the roll end first.
  await page.waitForFunction(
    () => {
      const rk = (window as any).__rk;
      if (!rk.rolling()) return false;
      rk.triggerHazard('lightning', 0, 14, true);
      return true;
    },
    undefined,
    { polling: 'raf', timeout: 5000 }
  );
  await expect.poll(() => rk<number>(page, 'dodges()'), { timeout: 2500 }).toBeGreaterThan(before);
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
    await seeRoll(page);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
