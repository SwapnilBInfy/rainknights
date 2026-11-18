import { test, expect, type Page } from '@playwright/test';

// New York's own roster: the Cab Wraith and the Phantom Bus. Miami keeps the Tornado.

async function beginRun(page: Page, region: 'nyc' | 'miami', weather?: string) {
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
  await page.keyboard.press(region === 'nyc' ? 'Digit1' : 'Digit2');
  await expect(app).toHaveAttribute('data-scene', 'GameScene');
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
  await page.waitForFunction(() => (window as any).__rk.enemyTypes().includes('cabWraith'), undefined, frame);
  await expect(page.locator('#app')).toHaveAttribute('data-signature-hint', /Cab Wraiths charge/, { timeout: 8000 });
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
