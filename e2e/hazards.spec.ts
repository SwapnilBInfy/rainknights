import { beginCityRun, test, expect } from './fixtures';
import { type Page } from '@playwright/test';

// `?weather=` forces a condition and turns hazards on under automation
// (they are off by default so the other smoke tests stay deterministic).


async function beginRun(page: Page, weather: string) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`/?weather=${weather}`);
  await beginCityRun(page);
  return errors;
}

const statuses = (page: Page) => page.evaluate(() => (window as any).__rk.statuses() as string[]);
const hazards = (page: Page) => page.evaluate(() => (window as any).__rk.hazards());
const trigger = (page: Page, kind: string, dx = 0) =>
  page.evaluate(([k, d]) => (window as any).__rk.triggerHazard(k, d, 0), [kind, dx] as const);

test('thunderstorm: rain soaks the knight and a lightning strike is telegraphed before it hurts', async ({ page }) => {
  const errors = await beginRun(page, 'thunderstorm');
  await expect.poll(() => statuses(page), { timeout: 5000 }).toContain('wet');
  await expect(page.locator('#app')).toHaveAttribute('data-statuses', /wet/);

  // Clear the ambient enemies and any hit invulnerability first, so the only thing that can hurt is the strike.
  await page.evaluate(`window.__rk.clearEnemies()`);
  await page.waitForFunction(() => !(window as any).__rk.invulnerable(), undefined, { polling: 'raf', timeout: 3000 });
  const hpBefore = await page.evaluate(() => (window as any).__rk.hp() as number);
  await trigger(page, 'lightning', 0);
  const warn = await hazards(page);
  expect(warn?.zones).toEqual([expect.objectContaining({ kind: 'lightning', phase: 'warn' })]);
  expect(await page.evaluate(() => (window as any).__rk.hp() as number)).toBe(hpBefore); // nothing yet

  await expect.poll(() => page.evaluate(() => (window as any).__rk.hp() as number), { timeout: 4000 }).toBeLessThan(hpBefore);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('cold front: standing in a frost patch freezes the knight, then they thaw', async ({ page }) => {
  const errors = await beginRun(page, 'cold_front');
  await trigger(page, 'frost', 0);
  // Frozen lasts only ~1s, so watch every frame; a slow poll can miss it entirely.
  await page.waitForFunction(() => (window as any).__rk.statuses().includes('frozen'), undefined, { polling: 'raf', timeout: 8000 });
  await page.waitForFunction(() => !(window as any).__rk.statuses().includes('frozen'), undefined, { polling: 'raf', timeout: 8000 });
  expect(errors, errors.join('\n')).toEqual([]);
});

test('heat: a scorch patch sets the knight on fire', async ({ page }) => {
  const errors = await beginRun(page, 'heat');
  await trigger(page, 'scorch', 0);
  await expect.poll(() => statuses(page), { timeout: 5000 }).toContain('burning');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('windy: a gust is announced with a warning before it pushes', async ({ page }) => {
  const errors = await beginRun(page, 'windy');
  const pos = () => page.evaluate(() => [(window as any).__rk.x(), (window as any).__rk.y()] as [number, number]);
  const [x0, y0] = await pos();
  await trigger(page, 'gust');
  expect((await hazards(page))?.gust).toBe('warn');
  await expect.poll(async () => (await hazards(page))?.gust, { timeout: 4000 }).toBe('live');
  // Nothing moved the knight during the warning; the live gust then shoves them.
  await expect.poll(async () => {
    const [x, y] = await pos();
    return Math.abs(x - x0) + Math.abs(y - y0);
  }, { timeout: 4000 }).toBeGreaterThan(20);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('clear weather has no hazards and no status effects', async ({ page }) => {
  const errors = await beginRun(page, 'clear');
  expect(await hazards(page)).toBeNull();
  await page.waitForTimeout(1500);
  expect(await statuses(page)).toEqual([]);
  expect(errors, errors.join('\n')).toEqual([]);
});
