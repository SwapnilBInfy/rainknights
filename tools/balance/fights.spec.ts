import type { Page } from '@playwright/test';
import { test } from '../../e2e/fixtures';
import { beginCityRun } from '../../e2e/fixtures';
import { writeFileSync, mkdirSync, appendFileSync } from 'node:fs';

/**
 * A bot that fights. For each knight level it walks into a camp of each zone (and the boss) and swings at whatever is
 * nearest, the way an ok-but-not-great player would: steering at the nearest foe, swing and beam held, a roll when hurt.
 * It records whether the knight won, how long it took, and how much health it lost. Stat points go half to Strength and
 * half to Endurance. No charms, no armor, no food.
 *
 *   npm run build && npx playwright test --config=playwright.balance.config.ts
 */

type Spot = { x: number; y: number; type: string; alive: boolean; aggro: boolean; at: { x: number; y: number } | null };
type Camps = { spots: Spot[]; boss: { x: number; y: number; aggro: boolean } | null };
type Result = { scenario: string; level: number; won: boolean; died: boolean; seconds: number; hpLost: number; minHpPct: number; xpGained: number };

const PLAZA = { x: 808, y: 808 };
const tierOf = (s: { x: number; y: number }) => {
  const d = Math.hypot(s.x - PLAZA.x, s.y - PLAZA.y) / 16;
  return d < 24 ? 0 : d < 40 ? 1 : 2;
};

async function setup(page: Page, level: number, city: string, seed: number) {
  await page.goto(`/?seed=${seed}&weather=clear`);
  await beginCityRun(page, city);
  await page.waitForFunction(() => (window as any).__rk?.hp?.() > 0);
  await page.evaluate(`window.__rk.setLevel(${level})`);
  const pts = 3 * (level - 1);
  for (let i = 0; i < pts; i++) await page.evaluate(`window.__rk.spend('${i % 2 === 0 ? 'strength' : 'endurance'}', 1)`);
  await page.evaluate(`window.__rk.heal()`);
}

/** Fight until the targets are gone, the knight falls, or the time is up. */
async function fight(page: Page, scenario: string, level: number, targets: (c: Camps) => { x: number; y: number }[], capSeconds: number): Promise<Result> {
  const held = new Set<string>();
  const set = async (want: Set<string>) => {
    for (const k of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      if (want.has(k) && !held.has(k)) { await page.keyboard.down(k); held.add(k); }
      if (!want.has(k) && held.has(k)) { await page.keyboard.up(k); held.delete(k); }
    }
  };
  await page.keyboard.down('Space');
  await page.keyboard.down('KeyJ');
  const t0 = Date.now();
  const hp0 = await page.evaluate(`window.__rk.hp()`) as number;
  const max = await page.evaluate(`window.__rk.maxHp()`) as number;
  const lvl0 = await page.evaluate(`window.__rk.level()`) as number;
  let minHp = hp0;
  let hpLost = 0;
  let last = hp0;
  let died = false;
  let won = false;
  let lastRoll = 0;
  let prevHp = hp0;
  while ((Date.now() - t0) / 1000 < capSeconds) {
    let s: { x: number; y: number; hp: number; camps: Camps } | null = null;
    try {
      s = await page.evaluate(`({ x: window.__rk.x(), y: window.__rk.y(), hp: window.__rk.hp(), camps: window.__rk.camps() })`) as never;
    } catch {
      // the scene is gone: the run ended. The game-over screen says how.
      const result = await page.waitForFunction(() => document.getElementById('app')?.dataset.runResult, undefined, { timeout: 4000 }).then((h) => h.jsonValue()).catch(() => 'lost');
      won = result === 'won';
      died = !won;
      break;
    }
    if (!s || s.hp <= 0) { died = true; break; }
    if (s.hp < last) hpLost += last - s.hp;
    last = s.hp;
    minHp = Math.min(minHp, s.hp);
    const alive = targets(s.camps);
    if (alive.length === 0) { won = true; break; }
    const me = { x: s.x, y: s.y };
    const near = [...alive].sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
    const dx = near.x - me.x;
    const dy = near.y - me.y;
    const want = new Set<string>();
    // stand just inside sword reach (30px): close enough to hit, not on top of it
    if (Math.hypot(dx, dy) > 26) {
      if (dx > 6) want.add('ArrowRight'); else if (dx < -6) want.add('ArrowLeft');
      if (dy > 6) want.add('ArrowDown'); else if (dy < -6) want.add('ArrowUp');
    }
    await set(want);
    // a knight who has just been hit rolls (the roll is untouchable), away from what hit them: the way a player would
    if (s.hp < prevHp - max * 0.06 && Date.now() - lastRoll > 900) {
      lastRoll = Date.now();
      await set(new Set([dx > 0 ? 'ArrowLeft' : 'ArrowRight', dy > 0 ? 'ArrowUp' : 'ArrowDown']));
      await page.keyboard.press('KeyK');
      await page.waitForTimeout(260);
    }
    prevHp = s.hp;
    await page.waitForTimeout(70);
  }
  const lvl1 = await page.evaluate(`window.__rk.level()`).catch(() => lvl0) as number;
  await set(new Set());
  await page.keyboard.up('Space').catch(() => {});
  await page.keyboard.up('KeyJ').catch(() => {});
  void lvl1;
  return { scenario, level, won, died, seconds: Math.round((Date.now() - t0) / 100) / 10, hpLost: Math.round(hpLost), minHpPct: Math.max(0, Math.round((minHp / max) * 100)), xpGained: 0 };
}

const OUT = 'tools/balance/out/fights.jsonl';
const record = (r: Result & { seed: number; maxHp: number }) => {
  mkdirSync('tools/balance/out', { recursive: true });
  appendFileSync(OUT, JSON.stringify(r) + '\n');
};
const LEVELS = [1, 3, 6, 10, 16];
const SEEDS = [33, 5, 12, 21];
const CITY = process.env.BOT_CITY ?? 'nyc';

test.beforeAll(() => {
  mkdirSync('tools/balance/out', { recursive: true });
  if (process.env.BOT_KEEP !== '1') writeFileSync(OUT, '');
});

for (const seed of SEEDS) {
  for (const zone of [0, 1, 2] as const) {
    for (const level of LEVELS) {
      test(`zone ${zone} camp at level ${level} (seed ${seed})`, async ({ page }) => {
        await setup(page, level, CITY, seed);
        const c = (await page.evaluate(`window.__rk.camps()`)) as Camps;
        const pool = c.spots.filter((s) => tierOf(s) === zone);
        // the camp of that zone nearest the plaza: where a player meets it first
        const first = [...pool].sort((a, b) => Math.hypot(a.x - PLAZA.x, a.y - PLAZA.y) - Math.hypot(b.x - PLAZA.x, b.y - PLAZA.y))[0];
        const near = (s: Spot) => Math.hypot(s.x - first.x, s.y - first.y) < 90;
        const max = (await page.evaluate(`window.__rk.maxHp()`)) as number;
        await page.evaluate(`window.__rk.tpTo(${first.x + 45}, ${first.y})`);
        const r = await fight(page, `zone ${zone} camp`, level, (cc) => cc.spots.filter((s) => near(s) && s.alive && s.at).map((s) => s.at!), 45);
        record({ ...r, seed, maxHp: max });
      });
    }
  }
  for (const level of [6, 10, 16]) {
    test(`the boss at level ${level} (seed ${seed})`, async ({ page }) => {
      await setup(page, level, CITY, seed);
      const c = (await page.evaluate(`window.__rk.camps()`)) as Camps;
      const boss = c.boss!;
      const max = (await page.evaluate(`window.__rk.maxHp()`)) as number;
      await page.evaluate(`window.__rk.tpTo(${boss.x + 70}, ${boss.y})`);
      const r = await fight(page, 'the boss', level, (cc) => (cc.boss ? [{ x: cc.boss.x, y: cc.boss.y }] : []), 150);
      record({ ...r, seed, maxHp: max });
    });
  }
}
