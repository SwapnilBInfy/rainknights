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
 * New game wakes up in Mistford. Hold south to the road, then pick a city the way the old
 * title flow picked a region. Callers still `goto` first and wait until the title is up.
 */
export async function beginCityRun(page: Page, region: string = 'nyc') {
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-scene', 'TownScene');
  await page.keyboard.down('ArrowDown');
  try {
    await expect(app).toHaveAttribute('data-scene', 'RegionSelectScene', { timeout: 8_000 });
  } finally {
    await page.keyboard.up('ArrowDown');
  }
  const slot = REGIONS.findIndex((r) => r.id === region) + 1;
  expect(slot, `unknown city ${region}`).toBeGreaterThan(0);
  await page.keyboard.press(`Digit${slot}`);
  await expect(app).toHaveAttribute('data-scene', 'GameScene');
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
