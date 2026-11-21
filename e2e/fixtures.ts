import { existsSync, mkdirSync } from 'node:fs';
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { REGIONS } from '../src/config/regions';

/**
 * Every e2e page gets a fixed, clear-weather reading instead of calling the live Open-Meteo API: the tests
 * do not depend on the network (or its rate limits) or on what the weather happens to be today.
 * Tests that need a particular condition force it with `?weather=...` as before.
 */
export async function stubWeather(context: BrowserContext) {
  await context.route('https://api.open-meteo.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ current: { weather_code: 0, temperature_2m: 18, wind_speed_10m: 5, relative_humidity_2m: 50 } }),
    })
  );
}

/**
 * Start a run in a city. Cities are only reachable by flying, so this uses the automation-only `window.__start` (see
 * main.ts) to skip the trip: it is for the many tests that are about something else. Callers `goto` first and wait for
 * the title. The real route (Mistford's pad, the flight map, landing) is `flyToCity`, and is tested in flight.spec.
 */
export async function beginCityRun(page: Page, region: string = 'nyc') {
  const app = page.locator('#app');
  expect(REGIONS.some((r) => r.id === region), `unknown city ${region}`).toBe(true);
  await expect(app).toHaveAttribute('data-scene', 'MenuScene');
  await page.waitForFunction(() => typeof (window as unknown as { __start?: unknown }).__start === 'function');
  await page.evaluate((id) => (window as unknown as { __start: (id: string) => Promise<void> }).__start(id), region);
  await expect(app).toHaveAttribute('data-scene', 'GameScene');
}

/**
 * The real route, with real input: from the title into Mistford, onto the blue pad, up into the flight map, over the
 * city's star, and down onto it (holding A all the way down lands). Leaves the run started.
 */
export async function flyToCity(page: Page, region: string = 'nyc') {
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-scene', 'TownScene');
  await page.waitForFunction(() => (window as any).__hub?.frames() > 2);
  await page.evaluate(`window.__hub.tp(14, 11)`);
  await expect(app).toHaveAttribute('data-interact', 'pad');
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-scene', 'FlightScene');
  await page.waitForFunction(() => (window as any).__flight?.frames() > 3);
  await page.evaluate(`window.__flight.teleportTo('${region}', 0.02)`);
  await page.waitForFunction((id) => (window as any).__flight.near() === id, region);
  await page.keyboard.down('Space');
  try {
    await expect(app).toHaveAttribute('data-scene', 'GameScene', { timeout: 10_000 });
  } finally {
    await page.keyboard.up('Space');
  }
}

export const test = base.extend({
  context: async ({ context }, use) => {
    await stubWeather(context);
    await use(context);
  },
});

export { expect };

/**
 * Where a test writes a screenshot. Cursor's agents collect them from /opt/cursor/artifacts when that folder exists;
 * everywhere else (a laptop, CI) they go to the git-ignored e2e-artifacts folder, so the tests never fail just
 * because a path from one particular sandbox is missing.
 */
export function artifactPath(name: string): string {
  const dir = existsSync('/opt/cursor/artifacts') ? '/opt/cursor/artifacts' : 'e2e-artifacts';
  mkdirSync(dir, { recursive: true });
  return `${dir}/${name}`;
}
