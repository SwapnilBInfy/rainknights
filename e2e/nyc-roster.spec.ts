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
  await page.evaluate(`window.__rk.clearEnemies()`); // (the city's own Cab Wraiths would be recorded too)
  await recordPhases(page, 'cabWraith');
  await page.evaluate(`window.__rk.spawnEnemy('cabWraith', 80, 0)`);
  await page.waitForFunction(() => (window as any).__log.phases.filter((p: string) => p === 'cruise').length >= 2, undefined, frame);
  const log = await phaseLog(page);
  expect(log.phases.slice(0, 5)).toEqual(['cruise', 'telegraph', 'charge', 'stall', 'cruise']);
  expect(log.alertsAtWindUp, 'the "!" mark shows during the wind-up').toBeGreaterThanOrEqual(1);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('NYC has Cab Wraiths in its camps, and the first one to spot the knight announces itself', async ({ page }) => {
  const errors = await beginRun(page, 'nyc');
  const app = page.locator('#app');
  // (this is about the hint, not survival: a core camp now hits hard enough to end a level-1 knight before it shows)
  await page.evaluate(`setInterval(() => { try { window.__rk.heal(); } catch {} }, 30)`);
  const spots = await page.evaluate(`window.__rk.camps().spots`) as { x: number; y: number; type: string }[];
  const cab = spots.find((s) => s.type === 'cabWraith');
  expect(cab, 'a camp with a Cab Wraith').toBeTruthy();
  // nothing has been said yet: no cab has noticed the knight
  expect(await app.getAttribute('data-signature-hint')).toBeNull();
  // walk up to it (stand a short way off, on open ground)
  await page.evaluate(`window.__rk.tpTo(${cab!.x + 40}, ${cab!.y})`);
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
