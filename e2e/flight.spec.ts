import { test, expect } from './fixtures';
import { type Page } from '@playwright/test';

// The blue flight pad in Mistford, and flying over the world map: steer, climb, descend, land on a star.

const frame = { polling: 'raf' as const, timeout: 20_000 };
const flight = <T>(page: Page, expr: string) => page.evaluate(`window.__flight.${expr}`) as Promise<T>;
type FlightState = { lon: number; lat: number; alt: number; speed: number; yaw: number; p: { x: number; y: number; z: number } };
const state = (page: Page) => flight<FlightState>(page, 'state()');
/** The angle along the ground between two flight states, in radians of the planet. */
const angle = (a: FlightState, b: FlightState) => Math.acos(Math.max(-1, Math.min(1, a.p.x * b.p.x + a.p.y * b.p.y + a.p.z * b.p.z)));
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
const afterTakeoff = (page: Page) => page.waitForFunction(() => (window as any).__flight.state().alt >= 0.07, undefined, frame);

test('standing on the blue pad shows the A prompt, and A takes off into the flight map', async ({ page }) => {
  const errors = await takeOff(page);
  expect((await state(page)).speed, 'the knight starts at a standstill').toBe(0);
  await afterTakeoff(page);
  expect((await state(page)).speed, 'and the climb out does not fly them anywhere').toBe(0);
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

test('the knight does not fly on its own: it hovers until Up (or W) is held, and stops when it is released', async ({ page }) => {
  await takeOff(page);
  await afterTakeoff(page);
  await page.waitForTimeout(300);
  const still = await state(page);
  await page.waitForTimeout(1500);
  const later = await state(page);
  expect(angle(still, later), 'hovering: no drift at all').toBeLessThan(1e-6);
  expect(later.speed).toBe(0);

  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(900);
  const flying = await state(page);
  expect(flying.speed).toBeGreaterThan(0.1);
  expect(angle(later, flying)).toBeGreaterThan(0.05);
  await page.keyboard.up('ArrowUp');
  await page.waitForFunction(() => (window as any).__flight.state().speed === 0, undefined, frame);
  const stopped = await state(page);
  await page.waitForTimeout(800);
  expect(angle(stopped, await state(page)), 'and it stays stopped').toBeLessThan(1e-6);

  // W does the same as Up
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(700);
  await page.keyboard.up('KeyW');
  expect(angle(stopped, await state(page))).toBeGreaterThan(0.03);
});

test('left and right turn on the spot, and the world goes round under the knight as they fly', async ({ page }) => {
  await takeOff(page);
  await afterTakeoff(page);
  const y0 = (await state(page)).yaw;
  const p0 = await state(page);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowRight');
  const y1 = (await state(page)).yaw;
  expect(y1).toBeGreaterThan(y0 + 0.3);
  expect(angle(p0, await state(page)), 'turning does not move them').toBeLessThan(1e-6);
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(900);
  await page.keyboard.up('ArrowLeft');
  expect((await state(page)).yaw).toBeLessThan(y1 - 0.5);
});

test('flying higher is faster: the same time at the top of the climb covers far more ground', async ({ page }) => {
  await takeOff(page);
  await afterTakeoff(page);
  const run = async () => {
    const a = await state(page);
    await page.keyboard.down('ArrowUp');
    await page.waitForTimeout(1200);
    await page.keyboard.up('ArrowUp');
    return angle(a, await state(page));
  };
  const low = await run();
  await page.waitForFunction(() => (window as any).__flight.state().speed === 0, undefined, frame);
  await page.keyboard.down('KeyJ');
  await page.waitForFunction(() => (window as any).__flight.state().alt > 0.28, undefined, frame);
  await page.keyboard.up('KeyJ');
  const high = await run();
  expect(high).toBeGreaterThan(low * 1.8);
});

test('B climbs and A descends, and the knight cannot go below the lowest level or above the highest', async ({ page }) => {
  await takeOff(page);
  await afterTakeoff(page);
  // out over the sea first, so that coming down does not land on Mistford's star
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(1000);
  await page.keyboard.up('ArrowUp');
  const alt = async () => (await state(page)).alt;
  const a0 = await alt();
  await page.keyboard.down('KeyJ'); // B
  await page.waitForTimeout(500);
  await page.keyboard.up('KeyJ');
  expect(await alt()).toBeGreaterThan(a0 + 0.04);
  await page.keyboard.down('KeyJ');
  await page.waitForTimeout(2600);
  await page.keyboard.up('KeyJ');
  const top = await alt();
  expect(top).toBeLessThanOrEqual(0.3);
  expect(top).toBeGreaterThan(0.29);
  await page.keyboard.down('Space'); // A, held (over open sea: nothing to land on)
  await page.waitForTimeout(2600);
  await page.keyboard.up('Space');
  const bottom = await alt();
  expect(bottom).toBeGreaterThanOrEqual(0.02);
  expect(bottom).toBeLessThan(0.03);
});

test('descending over a city and pressing A lands there and starts a run in it', async ({ page }) => {
  const errors = await takeOff(page);
  await flight(page, `teleportTo('tokyo', 0.02)`);
  await page.waitForFunction(() => (window as any).__flight.near() === 'tokyo' && (window as any).__flight.low(), undefined, frame);
  await page.keyboard.press('Space');
  await expect(scene(page)).toHaveAttribute('data-scene', 'GameScene', { timeout: 8_000 });
  expect(await page.evaluate(`window.__rk.regionId()`)).toBe('tokyo');
  expect(errors, errors.join('\n')).toEqual([]);
});

for (const city of ['nyc', 'miami', 'london', 'mumbai']) {
  test(`${city} can be landed on from the map`, async ({ page }) => {
    const errors = await takeOff(page);
    await flight(page, `teleportTo('${city}', 0.02)`);
    await page.waitForFunction((c) => (window as any).__flight.near() === c, city, frame);
    await page.keyboard.press('Space');
    await expect(scene(page)).toHaveAttribute('data-scene', 'GameScene', { timeout: 8_000 });
    expect(await page.evaluate(`window.__rk.regionId()`)).toBe(city);
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test('A over a star does not land from the air, but held all the way down it does (A: descend / land)', async ({ page }) => {
  await takeOff(page);
  await flight(page, `teleportTo('london', 0.2)`);
  await page.keyboard.press('Space'); // a tap, too high: nothing
  await page.waitForTimeout(300);
  await expect(scene(page)).toHaveAttribute('data-scene', 'FlightScene');
  expect(await flight<boolean>(page, 'landing()')).toBe(false);
  // a few units above the ground, over the star: hold A and the knight comes down and lands
  await flight(page, `teleportTo('london', 0.03)`);
  await page.keyboard.down('Space');
  await expect(scene(page)).toHaveAttribute('data-scene', 'GameScene', { timeout: 8_000 });
  await page.keyboard.up('Space');
  expect(await page.evaluate(`window.__rk.regionId()`)).toBe('london');
});

test('landing on Mistford brings you back to the pad, and Esc flies you home from anywhere', async ({ page }) => {
  const errors = await takeOff(page);
  await flight(page, `teleportTo('mistford', 0.02)`);
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
  await flight(page, `teleportTo('mistford', 0.02)`);
  await page.keyboard.press('Space');
  await expect(scene(page)).toHaveAttribute('data-scene', 'TownScene', { timeout: 8_000 });
  const after = await page.evaluate(() => localStorage.getItem('rainknights:save'));
  const parse = (raw: string | null) => (raw ? JSON.parse(raw).town : null);
  expect(parse(after)?.coins).toBe(parse(before)?.coins);
  expect(parse(after)?.characterId).toBe(parse(before)?.characterId);
});
