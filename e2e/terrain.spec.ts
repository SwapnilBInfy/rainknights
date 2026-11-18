import { test, expect, type Browser, type Page } from '@playwright/test';

// The world: seeded, city-shaped maps that the weather changes, and tiles that do things to you.
// Tile ids (systems/mapGen.ts): 0 grass, 2 road, 3 deep water, 4 rock, 5 shallow, 6 ice, 7 building, 8 bridge.
const GRASS = 0;
const SHALLOW = 5;
const ICE = 6;
const SOLID = [3, 4, 7];

type Terrain = { seed: number; floodRings: number; counts: Record<string, number>; under: number; grip: number; speed: number };

async function begin(page: Page, query = '', region: 'nyc' | 'miami' = 'nyc') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/' + query);
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

const terrain = (page: Page) => page.evaluate(`window.__rk.terrain()`) as Promise<Terrain>;
const tp = (page: Page, type: number, run = 0) => page.evaluate(`window.__rk.tpToTile(${type}, ${run})`) as Promise<boolean>;
const statuses = (page: Page) => page.evaluate(`window.__rk.statuses()`) as Promise<string[]>;
const raf = { polling: 'raf' as const, timeout: 8000 };

/** Boot a run just to read its map, in a fresh browser context (a saved run would otherwise show the Continue menu). */
async function mapOf(browser: Browser, query: string, region: 'nyc' | 'miami' = 'nyc') {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await begin(page, query, region);
  const t = await terrain(page);
  await ctx.close();
  return t;
}

async function quietMoment(page: Page) {
  await page.evaluate(`for (let i = 0; i < 30; i++) window.__rk.killNearest()`);
  await page.waitForFunction(() => !(window as any).__rk.invulnerable(), undefined, raf);
}

test.describe('generation', () => {
  test('the same seed makes the same map and a different seed a different one', async ({ browser }) => {
    const a = await mapOf(browser, '?seed=11');
    const b = await mapOf(browser, '?seed=11');
    const c = await mapOf(browser, '?seed=12');
    expect(a.seed).toBe(11);
    expect(b.counts).toEqual(a.counts);
    expect(c.counts).not.toEqual(a.counts);
  });

  test('New York is a built-up city with a river and bridges; Miami is open beach, ocean and canals', async ({ browser }) => {
    const nyc = await mapOf(browser, '?seed=11');
    const miami = await mapOf(browser, '?seed=33', 'miami');
    expect(nyc.counts.BUILDING).toBeGreaterThan(2000);
    expect(nyc.counts.BRIDGE).toBeGreaterThan(40);
    expect(nyc.counts.WATER).toBeGreaterThan(150);
    expect(miami.counts.BUILDING).toBeLessThan(nyc.counts.BUILDING / 3);
    expect(miami.counts.WATER).toBeGreaterThan(500);
    expect(miami.counts.BRIDGE).toBeGreaterThan(40);
  });

  test('enemies are only ever placed on open ground, never inside a building or the water', async ({ page }) => {
    const errors = await begin(page, '?seed=11');
    const worst = await page.evaluate(
      `new Promise((resolve) => { let max = 0; const t0 = performance.now(); const tick = () => { max = Math.max(max, window.__rk.enemiesInSolid()); if (performance.now() - t0 > 9000) resolve(max); else requestAnimationFrame(tick); }; tick(); })`
    );
    expect(worst).toBe(0);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('Continue returns to the same map, and an older save without a seed still puts the knight on open ground', async ({ page }) => {
    const errors = await begin(page, '?seed=77');
    await page.waitForTimeout(800); // the run is checkpointed as soon as it starts
    await page.goto('/');
    await expect(page.locator('#app')).toHaveAttribute('data-title-menu', 'continue');
    await page.keyboard.press('Enter');
    await expect(page.locator('#app')).toHaveAttribute('data-scene', 'GameScene');
    expect((await terrain(page)).seed).toBe(77);

    // An older save has no seed: the map is new, and the saved position may now be inside a building.
    const saved = await page.evaluate(`(() => { const s = JSON.parse(localStorage.getItem('rainknights:save')); delete s.run.mapSeed; s.run.player.x = 900; s.run.player.y = 800; localStorage.setItem('rainknights:save', JSON.stringify(s)); return true; })()`);
    expect(saved).toBe(true);
    await page.goto('/');
    await expect(page.locator('#app')).toHaveAttribute('data-title-menu', 'continue');
    await page.keyboard.press('Enter');
    await expect(page.locator('#app')).toHaveAttribute('data-scene', 'GameScene');
    expect(SOLID).not.toContain((await terrain(page)).under);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test.describe('weather changes the map', () => {
  test('a cold front freezes every pond and river into ice', async ({ page }) => {
    const errors = await begin(page, '?seed=11&weather=cold_front');
    const t = await terrain(page);
    expect(t.counts.ICE).toBeGreaterThan(400);
    expect(t.counts.WATER).toBe(0);
    expect(t.counts.SHALLOW).toBe(0);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('heat dries the shallows but the deep water stays', async ({ page }) => {
    await begin(page, '?seed=11&weather=heat');
    const t = await terrain(page);
    expect(t.counts.SHALLOW).toBe(0);
    expect(t.counts.WATER).toBeGreaterThan(150);
  });

  test('rain leaves puddles, and a hurricane has already flooded the streets', async ({ browser }) => {
    const clear = await mapOf(browser, '?seed=11');
    const storm = await mapOf(browser, '?seed=11&weather=thunderstorm');
    const hurricane = await mapOf(browser, '?seed=11&weather=hurricane');
    expect(storm.counts.SHALLOW).toBeGreaterThan(clear.counts.SHALLOW);
    expect(hurricane.floodRings).toBe(4);
    expect(hurricane.counts.SHALLOW).toBeGreaterThan(storm.counts.SHALLOW * 2);
    expect(hurricane.counts.BUILDING).toBe(clear.counts.BUILDING); // water never swallows a building
  });
});

test.describe('tiles do things to you', () => {
  test('wading soaks and slows the knight, and stepping out restores them', async ({ page }) => {
    const errors = await begin(page, '?seed=11');
    await quietMoment(page);
    expect(await tp(page, SHALLOW, 1)).toBe(true);
    await page.waitForFunction(() => (window as any).__rk.statuses().includes('wet') && (window as any).__rk.terrain().speed < 1, undefined, raf);
    expect((await terrain(page)).speed).toBeCloseTo(0.85, 2);
    expect(await tp(page, GRASS, 2)).toBe(true);
    await page.waitForFunction(() => (window as any).__rk.terrain().speed === 1, undefined, raf);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('stepping into water puts out a fire', async ({ page }) => {
    const errors = await begin(page, '?seed=11');
    await quietMoment(page);
    await page.evaluate(`window.__rk.applyStatus('player', 'burning', 4000)`);
    expect(await statuses(page)).toContain('burning');
    expect(await tp(page, SHALLOW, 1)).toBe(true);
    await page.waitForFunction(() => !(window as any).__rk.statuses().includes('burning') && (window as any).__rk.statuses().includes('wet'), undefined, raf);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('on ice the knight slides after letting go; on plain ground they stop at once', async ({ page }) => {
    const errors = await begin(page, '?seed=11&weather=cold_front');
    await quietMoment(page);
    const slide = async (type: number) => {
      expect(await tp(page, type, 6)).toBe(true);
      // The tile under the knight is sampled on a short tick, so wait for the grip to settle, not a fixed time.
      await page.waitForFunction((icy) => (icy ? (window as any).__rk.terrain().grip < 1 : (window as any).__rk.terrain().grip === 1), type === ICE, raf);
      await page.waitForTimeout(150);
      await page.keyboard.down('KeyD');
      await page.waitForTimeout(500);
      await page.keyboard.up('KeyD');
      // Measure from just after the key is up (reading x while it is still held would count a frame or two of
      // ordinary walking), over a further half second: a slide keeps going, plain ground has already stopped.
      await page.waitForTimeout(120);
      const settled = (await page.evaluate(`window.__rk.x()`)) as number;
      await page.waitForTimeout(500);
      return ((await page.evaluate(`window.__rk.x()`)) as number) - settled;
    };
    const onIce = await slide(ICE);
    expect((await terrain(page)).under).toBe(ICE);
    const onGround = await slide(GRASS);
    expect(onIce, `slid on ice (${onIce}px)`).toBeGreaterThan(5);
    expect(onGround, `stopped on plain ground (slid ${onGround}px)`).toBeLessThan(2);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});

test.describe('water carries lightning', () => {
  test('a strike a few tiles away shocks a knight standing in the same water', async ({ page }) => {
    const errors = await begin(page, '?seed=11&weather=thunderstorm');
    await quietMoment(page);
    expect(await tp(page, SHALLOW, 2)).toBe(true); // three shallow tiles in a row
    await page.waitForFunction(() => (window as any).__rk.terrain().speed < 1, undefined, raf);
    await quietMoment(page);
    const hp = (await page.evaluate(`window.__rk.hp()`)) as number;
    await page.evaluate(`window.__rk.triggerHazard('lightning', 32, 0, true)`); // two tiles along the water, outside the strike's own circle
    await page.waitForFunction(() => (window as any).__rk.statuses().includes('shocked'), undefined, raf);
    expect(await page.evaluate(`window.__rk.hp()`)).toBeLessThan(hp);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('the same strike over dry ground does nothing to a knight standing beside it', async ({ page }) => {
    const errors = await begin(page, '?seed=11&weather=thunderstorm');
    await quietMoment(page);
    expect(await tp(page, GRASS, 2)).toBe(true);
    await page.waitForFunction(() => (window as any).__rk.terrain().under === 0, undefined, raf);
    await quietMoment(page);
    const hp = (await page.evaluate(`window.__rk.hp()`)) as number;
    await page.evaluate(`window.__rk.triggerHazard('lightning', 32, 0, true)`);
    await page.waitForTimeout(700);
    expect(await statuses(page)).not.toContain('shocked');
    expect(await page.evaluate(`window.__rk.hp()`)).toBe(hp);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
