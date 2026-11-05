import { test, expect } from '@playwright/test';

test('page title loads and a Phaser canvas renders without console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(error.message);
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  // Register before navigation so BootScene's emblem loads are not missed.
  const emblemsLoaded = Promise.all([
    page.waitForResponse((response) => response.url().includes('emblem_nyc.png')),
    page.waitForResponse((response) => response.url().includes('emblem_miami.png')),
  ]);

  await page.goto('/');

  await expect(page).toHaveTitle('Rainknights');

  const canvas = page.locator('#app canvas');
  await expect(canvas).toBeVisible();
  // Phaser sets the bitmap to the native 240×160 view once the game boots.
  await expect(canvas).toHaveJSProperty('width', 240);
  await expect(canvas).toHaveJSProperty('height', 160);

  const responses = await emblemsLoaded;
  for (const response of responses) {
    expect(response.ok(), `${response.url()} returned ${response.status()}`).toBe(true);
  }

  expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
});
