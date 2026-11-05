import { expect, test, type Page } from '@playwright/test';

/**
 * Paced walkthrough for the feel follow-ups. Not part of CI; the smoke
 * config ignores this file. Recorded locally into a short demo clip.
 */
test('feel follow-ups demo', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  const app = page.locator('#app');
  await expect(app).toHaveAttribute('data-menu-hint', /A SWING/);
  await page.waitForTimeout(1400);

  await page.keyboard.press('Space');
  await expect(app).toHaveAttribute('data-scene', 'CharacterSelectScene');
  await page.waitForTimeout(700);
  await page.keyboard.press('Digit1');
  await expect(app).toHaveAttribute('data-scene', 'RegionSelectScene');
  await page.waitForTimeout(700);
  await page.keyboard.press('Digit1');
  await expect(app).toHaveAttribute('data-scene', 'GameScene');
  await expect(app).toHaveAttribute('data-attack-hint', /A\/SPACE: swing weapon/);
  await expect(app).toHaveAttribute('data-beam-key', 'B');
  await page.waitForTimeout(1700);

  await hold(page, 'a');
  await page.waitForTimeout(900);
  await release(page, 'a');
  await hold(page, 'b');
  await page.waitForTimeout(700);
  await release(page, 'b');
  await page.waitForTimeout(400);

  await tap(page, 'start');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  await page.waitForTimeout(800);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(280);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(280);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Abandon run?' })).toBeVisible();
  await page.waitForTimeout(1600);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Paused' })).toBeHidden();
  await page.waitForTimeout(500);

  await page.evaluate(() => window.__rk?.grantLevel());
  await expect(app).toHaveAttribute('data-level-up', 'open');
  expect(await page.evaluate(() => window.__rk?.isScenePaused())).toBe(true);
  await page.waitForTimeout(1600);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(350);
  await page.keyboard.press('Space');
  await expect(app).not.toHaveAttribute('data-level-up', 'open');
  await page.waitForTimeout(900);
});

async function tap(page: Page, className: string) {
  await hold(page, className);
  await release(page, className);
}

async function hold(page: Page, className: string) {
  await page.evaluate((name) => {
    const el = document.querySelector<HTMLButtonElement>(`#touch-controls button.${name}`);
    if (!el) throw new Error(`missing ${name}`);
    const rect = el.getBoundingClientRect();
    el.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerId: 4,
        pointerType: 'touch',
        button: 0,
        buttons: 1,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      })
    );
  }, className);
}

async function release(page: Page, className: string) {
  await page.evaluate((name) => {
    const el = document.querySelector<HTMLButtonElement>(`#touch-controls button.${name}`);
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.dispatchEvent(
      new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        pointerId: 4,
        pointerType: 'touch',
        button: 0,
        buttons: 0,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      })
    );
  }, className);
}

declare global {
  interface Window {
    __rk?: {
      grantLevel: () => void;
      isScenePaused: () => boolean;
    };
  }
}
