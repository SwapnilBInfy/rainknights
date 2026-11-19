import { test, expect } from './fixtures';
import { type Page } from '@playwright/test';

// The blue flight pad in Mistford, and flying over the world map: steer, climb, descend, land on a star.

const frame = { polling: 'raf' as const, timeout: 20_000 };
const flight = <T>(page: Page, expr: string) => page.evaluate(`window.__flight.${expr}`) as Promise<T>;
const scene = (page: Page) => page.locator('#app');

/** Fresh game, then walk down the road and east along the south edge of the plaza onto the pad. */
async function toPad(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/');
  await expect(scene(page)).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('Space');
  await expect(scene(page)).toHaveAttribute('data-scene', 'TownScene');
  await page.keyboard.down('ArrowDown');
  await page.waitForFunction(() => (window as any).__hub?.y() > 176, undefined, frame);
  await page.keyboard.up('ArrowDown');
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => (window as any).__hub?.x() > 232, undefined, frame);
  await page.keyboard.up('ArrowRight');
  return errors;
}

async function takeOff(page: Page) {
  const errors = await toPad(page);
  await expect(scene(page)).toHaveAttribute('data-interact', 'pad');
  await page.keyboard.press('Space');
  await expect(scene(page)).toHaveAttribute('data-scene', 'FlightScene');
  await page.waitForFunction(() => (window as any).__flight?.frames() > 3, undefined, frame);
  return errors;
}

/** The climb out of Mistford takes a moment; the controls are the knight's after it. */
const afterTakeoff = (page: Page) => page.waitForFunction(() => (window as any).__flight.state().alt > 28, undefined, frame);

test('standing on the blue pad shows the A prompt, and A takes off into the flight map', async ({ page }) => {
  const errors = await takeOff(page);
  const state = await flight<{ alt: number }>(page, 'state()');
  expect(state.alt, 'the knight starts low and climbs').toBeLessThan(30);
  await afterTakeoff(page);
  expect(await flight<number>(page, 'stars().length')).toBe(6); // Mistford and five cities
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a villager next to the pad does not steal the A button from it', async ({ page }) => {
  // Brent stands by the pond, within talking range of the pad's west edge.
  const errors = await toPad(page);
  await expect(scene(page)).toHaveAttribute('data-interact', 'pad');
  await page.keyboard.press('Space');
  await expect(scene(page)).toHaveAttribute('data-scene', 'FlightScene');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('left and right steer, up boosts, and the world keeps moving under the knight', async ({ page }) => {
  await takeOff(page);
  await afterTakeoff(page);
  const h0 = (await flight<{ heading: number }>(page, 'state()')).heading;
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowRight');
  const h1 = (await flight<{ heading: number }>(page, 'state()')).heading;
  expect(h1).toBeGreaterThan(h0 + 0.3);
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(900);
  await page.keyboard.up('ArrowLeft');
  expect((await flight<{ heading: number }>(page, 'state()')).heading).toBeLessThan(h1 - 0.5);

  const speed = async (key?: string) => {
    if (key) await page.keyboard.down(key);
    const a = await flight<{ x: number; y: number }>(page, 'state()');
    await page.waitForTimeout(600);
    const b = await flight<{ x: number; y: number }>(page, 'state()');
    if (key) await page.keyboard.up(key);
    return Math.hypot(b.x - a.x, b.y - a.y);
  };
  const cruise = await speed();
  const boost = await speed('ArrowUp');
  expect(cruise, 'the knight is always flying').toBeGreaterThan(20);
  expect(boost).toBeGreaterThan(cruise * 1.3);
});

test('B climbs and A descends, and the knight cannot go below the lowest level or above the highest', async ({ page }) => {
  await takeOff(page);
  await afterTakeoff(page);
  const alt = async () => (await flight<{ alt: number }>(page, 'state()')).alt;
  const a0 = await alt();
  await page.keyboard.down('KeyJ'); // B
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyJ');
  expect(await alt()).toBeGreaterThan(a0 + 5);
  await page.keyboard.down('KeyJ');
  await page.waitForTimeout(1800);
  await page.keyboard.up('KeyJ');
  const top = await alt();
  expect(top).toBeLessThanOrEqual(46);
  expect(top).toBeGreaterThan(44);
  await page.keyboard.down('Space'); // A, held
  await page.waitForTimeout(2200);
  await page.keyboard.up('Space');
  const bottom = await alt();
  expect(bottom).toBeGreaterThanOrEqual(12);
  expect(bottom).toBeLessThan(13);
});

test('descending over a city and pressing A lands there and starts a run in it', async ({ page }) => {
  const errors = await takeOff(page);
  await flight(page, `teleportTo('tokyo', 12)`);
  await page.waitForFunction(() => (window as any).__flight.near() === 'tokyo' && (window as any).__flight.low(), undefined, frame);
  await page.keyboard.press('Space');
  await expect(scene(page)).toHaveAttribute('data-scene', 'GameScene', { timeout: 8_000 });
  expect(await page.evaluate(`window.__rk.regionId()`)).toBe('tokyo');
  expect(errors, errors.join('\n')).toEqual([]);
});

for (const city of ['nyc', 'miami', 'london', 'mumbai']) {
  test(`${city} can be landed on from the map`, async ({ page }) => {
    const errors = await takeOff(page);
    await flight(page, `teleportTo('${city}', 12)`);
    await page.waitForFunction((c) => (window as any).__flight.near() === c, city, frame);
    await page.keyboard.press('Space');
    await expect(scene(page)).toHaveAttribute('data-scene', 'GameScene', { timeout: 8_000 });
    expect(await page.evaluate(`window.__rk.regionId()`)).toBe(city);
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test('A over a star does not land from the air, but held all the way down it does (A: descend / land)', async ({ page }) => {
  await takeOff(page);
  await flight(page, `teleportTo('london', 40)`);
  await page.keyboard.press('Space'); // a tap, too high: nothing
  await page.waitForTimeout(300);
  await expect(scene(page)).toHaveAttribute('data-scene', 'FlightScene');
  expect(await flight<boolean>(page, 'landing()')).toBe(false);
  // a few units above the ground, over the star: hold A and the knight comes down and lands
  await flight(page, `teleportTo('london', 15)`);
  await page.keyboard.down('Space');
  await expect(scene(page)).toHaveAttribute('data-scene', 'GameScene', { timeout: 8_000 });
  await page.keyboard.up('Space');
  expect(await page.evaluate(`window.__rk.regionId()`)).toBe('london');
});

test('landing on Mistford brings you back to the pad, and Esc flies you home from anywhere', async ({ page }) => {
  const errors = await takeOff(page);
  await flight(page, `teleportTo('mistford', 12)`);
  await page.waitForFunction(() => (window as any).__flight.near() === 'mistford', undefined, frame);
  await page.keyboard.press('Space');
  await expect(scene(page)).toHaveAttribute('data-scene', 'TownScene', { timeout: 8_000 });
  await page.waitForFunction(() => (window as any).__hub?.x() > 224 && (window as any).__hub?.y() > 160, undefined, frame);
  await expect(scene(page)).toHaveAttribute('data-interact', 'pad');

  // fly again, and go home with Esc
  await page.keyboard.press('Space');
  await expect(scene(page)).toHaveAttribute('data-scene', 'FlightScene');
  await page.waitForFunction(() => (window as any).__flight?.frames() > 3, undefined, frame);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.press('Escape');
  await expect(scene(page)).toHaveAttribute('data-scene', 'TownScene', { timeout: 8_000 });
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a flight does not touch the save: you still have your drips and your knight', async ({ page }) => {
  await takeOff(page);
  const before = await page.evaluate(() => localStorage.getItem('rainknights:save'));
  await flight(page, `teleportTo('mistford', 12)`);
  await page.keyboard.press('Space');
  await expect(scene(page)).toHaveAttribute('data-scene', 'TownScene', { timeout: 8_000 });
  const after = await page.evaluate(() => localStorage.getItem('rainknights:save'));
  const parse = (raw: string | null) => (raw ? JSON.parse(raw).town : null);
  expect(parse(after)?.coins).toBe(parse(before)?.coins);
  expect(parse(after)?.characterId).toBe(parse(before)?.characterId);
});
