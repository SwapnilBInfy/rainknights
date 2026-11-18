import { test as base, expect, type BrowserContext } from '@playwright/test';

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

export const test = base.extend({
  context: async ({ context }, use) => {
    await stubWeather(context);
    await use(context);
  },
});

export { expect };
