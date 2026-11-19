import { beginCityRun, test, expect } from './fixtures';
import { type Page } from '@playwright/test';

// New York's own roster: the Cab Wraith and the Phantom Bus. Miami keeps the Tornado.

async function beginRun(page: Page, region: 'nyc' | 'miami', weather?: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(weather ? `/?weather=${weather}` : '/');
  await beginCityRun(page, region);
  return errors;
}

const rk = <T>(page: Page, expr: string) => page.evaluate(`window.__rk.${expr}`) as Promise<T>;
const frame = { polling: 'raf' as const, timeout: 25_000 };

/** Records, every frame, the phases of the first enemy of `type` (and how many "!" marks showed). */
async function recordPhases(page: Page, type: string) {
  await page.evaluate((t) => {
    const w = window as any;
    w.__log = { phases: [] as string[], alertsAtWindUp: 0 };
    const tick = () => {
      const i = w.__rk?.enemyTypes().indexOf(t) ?? -1;
      if (i >= 0) {
        const p = w.__rk.enemyPhases()[i];
        const log = w.__log;
        if (log.phases[log.phases.length - 1] !== p) log.phases.push(p);
        if (p === 'telegraph') log.alertsAtWindUp = Math.max(log.alertsAtWindUp, w.__rk.alerts());
      }
      requestAnimationFrame(tick);
    };
    tick();
  }, type);
}
const phaseLog = (page: Page) => page.evaluate(`window.__log`) as Promise<{ phases: string[]; alertsAtWindUp: number }>;

test('a Cab Wraith winds up with a warning, charges, stalls, then cruises again', async ({ page }) => {
  const errors = await beginRun(page, 'nyc');
  await recordPhases(page, 'cabWraith');
  await page.evaluate(`window.__rk.spawnEnemy('cabWraith', 80, 0)`);
  await page.waitForFunction(() => (window as any).__log.phases.filter((p: string) => p === 'cruise').length >= 2, undefined, frame);
  const log = await phaseLog(page);
  expect(log.phases.slice(0, 5)).toEqual(['cruise', 'telegraph', 'charge', 'stall', 'cruise']);
  expect(log.alertsAtWindUp, 'the "!" mark shows during the wind-up').toBeGreaterThanOrEqual(1);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('NYC spawns Cab Wraiths as the storm builds, and the first one announces itself', async ({ page }) => {
  const errors = await beginRun(page, 'nyc', 'thunderstorm'); // starts on the Thunderstorm front
  // This test is about the hint, not survival: an idle knight in a storm would otherwise be overrun.
  await page.evaluate(`setInterval(() => window.__rk && window.__rk.heal(), 150)`);
  await page.waitForFunction(() => (window as any).__rk.enemyTypes().includes('cabWraith'), undefined, frame);
  // The idle knight can level up from the storm's kills; the upgrade menu pauses the game on purpose, and the hint only
  // shows while it is running. So pick an upgrade whenever the menu is open, until the hint appears.
  const app = page.locator('#app');
  for (let i = 0; i < 80 && !(await app.getAttribute('data-signature-hint')); i++) {
    if (await page.evaluate(`window.__rk.levelUpOpen()`)) {
      await page.waitForTimeout(450);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Space');
    }
    await page.waitForTimeout(250);
  }
  await expect(app).toHaveAttribute('data-signature-hint', /Cab Wraiths charge/);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Miami has no Cab Wraiths', async ({ page }) => {
  const errors = await beginRun(page, 'miami', 'thunderstorm');
  await page.evaluate(() => {
    const w = window as any;
    w.__cabSeen = false;
    const tick = () => {
      if (w.__rk?.enemyTypes().includes('cabWraith')) w.__cabSeen = true;
      requestAnimationFrame(tick);
    };
    tick();
  });
  await page.waitForTimeout(6000);
  expect(await page.evaluate(`window.__cabSeen`)).toBe(false);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('NYC boss is the Phantom Bus: it telegraphs a lane and enrages below half health', async ({ page }) => {
  const errors = await beginRun(page, 'nyc');
  await recordPhases(page, 'phantomBus');
  await page.evaluate(`window.__rk.spawnBoss()`);
  await expect(page.locator('#app')).toHaveAttribute('data-boss', 'PHANTOM BUS');
  expect(await rk<number>(page, 'bossHpFraction()')).toBe(1);
  expect(await rk<boolean>(page, 'bossRaging()')).toBe(false);

  await page.waitForFunction(() => (window as any).__log.phases.includes('telegraph'), undefined, frame);
  expect((await phaseLog(page)).alertsAtWindUp).toBeGreaterThanOrEqual(1);

  await page.evaluate(`window.__rk.setBossHp(0.4)`);
  await page.waitForFunction(() => (window as any).__rk.bossRaging(), undefined, frame);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Miami keeps the Tornado as its boss', async ({ page }) => {
  const errors = await beginRun(page, 'miami');
  await page.evaluate(`window.__rk.spawnBoss()`);
  await expect(page.locator('#app')).toHaveAttribute('data-boss', 'TORNADO');
  expect(errors, errors.join('\n')).toEqual([]);
});
