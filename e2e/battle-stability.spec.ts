import { beginCityRun, test, expect } from './fixtures';
import type { Page } from '@playwright/test';

// The game used to freeze for good during battle. Phaser's frame loop is `callback(); requestAnimationFrame(next)`,
// so a single uncaught error in one frame meant no next frame, ever. These tests pin the two fixes:
//  - the cause: a Static Charge chain (or a lightning kill) destroying an enemy while a loop was still going through a
//    snapshot of enemies, which then read the destroyed enemy's physics body;
//  - the safety net: even if a frame does throw, the game carries on.

const raf = { polling: 'raf' as const, timeout: 10_000 };

async function begin(page: Page, query = '?seed=11') {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => m.type() === 'error' && problems.push('console: ' + m.text()));
  await page.goto('/' + query);
  await beginCityRun(page);
  return problems;
}

/**
 * The game clock keeps advancing: the loop is alive. Kills can open the level-up menu, which pauses on purpose, and
 * several can queue up one after another, so this polls both together: pick an upgrade whenever a menu is open, and
 * succeed once the clock has moved on by half a second.
 */
async function expectRunning(page: Page) {
  const clock = () => page.evaluate(`window.__rk.elapsedSeconds()`) as Promise<number>;
  let base = await clock();
  for (let i = 0; i < 120; i++) {
    if (await page.evaluate(`window.__rk.levelUpOpen()`)) {
      await page.waitForTimeout(450); // the menu ignores the key that opened it for a moment
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Space');
      await page.waitForTimeout(150);
      base = await clock();
      continue;
    }
    await page.waitForTimeout(150);
    if ((await clock()) > base + 0.5) return;
  }
  throw new Error(`the game clock stopped at ${base}s: the frame loop is not running`);
}

const quiet = async (page: Page) => {
  await page.evaluate(`for (let i = 0; i < 30; i++) window.__rk.killNearest()`);
  await page.waitForFunction(() => !(window as any).__rk.invulnerable(), undefined, raf);
};
const key = (code: string, keyCode: number, type: 'keydown' | 'keyup') =>
  `(() => { const e = new KeyboardEvent('${type}', { code: '${code}', key: '${code.replace('Key', '').toLowerCase()}', bubbles: true, cancelable: true }); Object.defineProperty(e, 'keyCode', { get: () => ${keyCode} }); Object.defineProperty(e, 'which', { get: () => ${keyCode} }); window.dispatchEvent(e); })()`;

test('a frame that throws is skipped and the game carries on (it used to freeze for good)', async ({ page }) => {
  const problems = await begin(page);
  await expectRunning(page);
  await page.evaluate(`window.__rk.throwNextFrame()`);
  await expect(page.locator('#app')).toHaveAttribute('data-frame-errors', '1');
  await expectRunning(page); // the clock still advances after the bad frame
  // the error was reported, not swallowed
  expect(problems.some((p) => p.includes('a frame threw'))).toBe(true);
  expect(problems.some((p) => p.includes('test fault'))).toBe(true);
});

test('a Static Charge chain that kills enemies mid-swing no longer breaks the swing loop', async ({ page }) => {
  const problems = await begin(page);
  await quiet(page);
  await page.evaluate(`window.__rk.givePowerup('staticCharge', 4)`); // chains to 4 neighbours
  // A tight pack below the knight (they face down at the start), all within sword reach; then swing in the same step.
  await page.evaluate(`(() => {
    for (const [dx, dy] of [[0, 20], [6, 24], [-6, 24], [0, 30], [8, 30], [-8, 30]]) window.__rk.spawnEnemy('rainImp', dx, dy);
    ${key('Space', 32, 'keydown')};
    ${key('Space', 32, 'keyup')};
  })()`);
  await page.waitForTimeout(400);
  await expectRunning(page);
  await expect(page.locator('#app')).not.toHaveAttribute('data-frame-errors', /.+/);
  expect(problems, problems.join('\n')).toEqual([]);
});

test('a Static Charge chain that kills enemies mid-beam no longer breaks the beam loop', async ({ page }) => {
  const problems = await begin(page);
  await quiet(page);
  await page.evaluate(`window.__rk.givePowerup('staticCharge', 4)`);
  // One line of enemies down the beam, and neighbours off to the side that the chain will reach.
  await page.evaluate(`(() => {
    for (const [dx, dy] of [[0, 22], [0, 38], [0, 54], [14, 30], [-14, 30], [14, 46], [-14, 46]]) window.__rk.spawnEnemy('rainImp', dx, dy);
    ${key('KeyJ', 74, 'keydown')};
    ${key('KeyJ', 74, 'keyup')};
  })()`);
  await page.waitForTimeout(400);
  await expectRunning(page);
  await expect(page.locator('#app')).not.toHaveAttribute('data-frame-errors', /.+/);
  expect(problems, problems.join('\n')).toEqual([]);
});

test('lightning that kills a pack, with a Static Charge chain, no longer breaks the strike', async ({ page }) => {
  const problems = await begin(page, '?seed=11&weather=thunderstorm');
  await quiet(page);
  await page.evaluate(`window.__rk.givePowerup('staticCharge', 4)`);
  await page.evaluate(`(() => {
    for (const [dx, dy] of [[0, 30], [8, 34], [-8, 34], [0, 40], [10, 40], [-10, 40]]) window.__rk.spawnEnemy('rainImp', dx, dy);
    window.__rk.triggerHazard('lightning', 0, 34, true); // lands on the pack straight away
  })()`);
  await page.waitForTimeout(500);
  await expectRunning(page);
  await expect(page.locator('#app')).not.toHaveAttribute('data-frame-errors', /.+/);
  expect(problems, problems.join('\n')).toEqual([]);
});

test('the storm stops spawning once a crowd of enemies is alive, instead of piling up without limit', async ({ page }) => {
  const problems = await begin(page);
  await page.evaluate(`window.__rk.spawnAround('rainImp', 400)`);
  const alive = (await page.evaluate(`window.__rk.enemyTypes().length`)) as number;
  expect(alive).toBeGreaterThan(100);
  expect(alive, 'the storm spawns respect the cap').toBeLessThanOrEqual(145);
  await expectRunning(page);
  expect(problems, problems.join('\n')).toEqual([]);
});

test('a Static Charge build can fight a crowd for a while without a frame ever throwing', async ({ page }) => {
  test.setTimeout(60_000);
  const problems = await begin(page, '?seed=11&weather=thunderstorm');
  await page.evaluate(`window.__rk.givePowerup('staticCharge', 5)`);
  // Keep the knight alive and swinging while a crowd (and the storm's lightning) closes in; the chain kills things mid-loop constantly.
  await page.evaluate(`setInterval(() => { try { window.__rk.heal(); } catch {} }, 300)`);
  await page.keyboard.down('Space');
  await page.keyboard.down('KeyJ');
  for (let i = 0; i < 12; i++) {
    await page.evaluate(`window.__rk.spawnAround('rainImp', 14)`);
    if (await page.evaluate(`window.__rk.levelUpOpen()`)) {
      await page.waitForTimeout(400);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(900);
  }
  await page.keyboard.up('Space');
  await page.keyboard.up('KeyJ');
  await expectRunning(page);
  await expect(page.locator('#app')).not.toHaveAttribute('data-frame-errors', /.+/);
  expect(problems, problems.join('\n')).toEqual([]);
});
