import { describe, expect, it } from 'vitest';
import { STATUS_TUNING, StatusSet, resolveHit } from '../src/systems/status';

describe('StatusSet', () => {
  it('applies a status and counts it down on frame deltas', () => {
    const s = new StatusSet();
    expect(s.apply('wet', 300).applied).toBe(true);
    expect(s.has('wet')).toBe(true);
    s.update(100);
    s.update(100);
    expect(s.has('wet')).toBe(true);
    s.update(100);
    expect(s.has('wet')).toBe(false);
  });

  it('treats a huge frame delta as a hiccup, not instant expiry', () => {
    const s = new StatusSet();
    s.apply('wet', 1000);
    s.update(60_000); // e.g. returning to the tab
    expect(s.has('wet')).toBe(true);
  });

  it('wet puts out burning (steam) and still applies wet', () => {
    const s = new StatusSet();
    s.apply('burning', 4000);
    const r = s.apply('wet', 5000);
    expect(r).toEqual({ applied: true, reaction: 'steam' });
    expect(s.has('burning')).toBe(false);
    expect(s.has('wet')).toBe(true);
  });

  it('fire on a wet target makes steam and does not ignite it', () => {
    const s = new StatusSet();
    s.apply('wet', 5000);
    const r = s.apply('burning', 4000);
    expect(r).toEqual({ applied: false, reaction: 'steam' });
    expect(s.has('burning')).toBe(false);
    expect(s.has('wet')).toBe(false);
  });

  it('fire thaws ice instead of igniting it', () => {
    const s = new StatusSet();
    s.apply('frozen', 2000);
    expect(s.apply('burning', 4000)).toEqual({ applied: false, reaction: 'thaw' });
    expect(s.has('frozen')).toBe(false);
    expect(s.has('chilled')).toBe(false);
  });

  it('burning deals a tick every 500ms and stops when it ends', () => {
    const s = new StatusSet();
    s.apply('burning', 1200);
    let ticks = 0;
    for (let i = 0; i < 30; i++) ticks += s.update(50).burnTicks;
    expect(ticks).toBe(2); // 1200ms of burning -> ticks at 500 and 1000
  });

  it('freezes after the frost meter fills, twice as fast when wet', () => {
    const dry = new StatusSet();
    let frozenAt = 0;
    for (let t = 0; t < 2000 && !dry.has('frozen'); t += 50) {
      dry.addChill(50);
      dry.update(50);
      frozenAt = t + 50;
    }
    expect(dry.has('frozen')).toBe(true);
    expect(frozenAt).toBe(STATUS_TUNING.freezeAtMs);

    const wet = new StatusSet();
    wet.apply('wet', 5000);
    let wetFrozenAt = 0;
    for (let t = 0; t < 2000 && !wet.has('frozen'); t += 50) {
      wet.addChill(50);
      wet.update(50);
      wetFrozenAt = t + 50;
    }
    expect(wetFrozenAt).toBe(STATUS_TUNING.freezeAtMs / 2);
  });

  it('the frost meter drains once you leave the patch', () => {
    const s = new StatusSet();
    s.addChill(600);
    s.update(100);
    for (let i = 0; i < 20; i++) s.update(100);
    expect(s.chill).toBe(0);
  });

  it('frozen creatures cannot move; chilled ones are slowed', () => {
    const s = new StatusSet();
    s.apply('chilled', 1000);
    expect(s.speedMult).toBe(STATUS_TUNING.chilledSpeed);
    s.apply('frozen', 1000);
    expect(s.stunned).toBe(true);
    expect(s.speedMult).toBe(0);
  });

  it('after thawing you cannot be frozen again straight away', () => {
    const s = new StatusSet();
    s.apply('frozen', 200);
    s.update(100);
    s.update(100);
    expect(s.has('frozen')).toBe(false);
    expect(s.apply('frozen', 2000).applied).toBe(false);
    for (let i = 0; i < 26; i++) s.update(100);
    expect(s.apply('frozen', 2000).applied).toBe(true);
  });

  it('shatter consumes the ice and grants thaw immunity', () => {
    const s = new StatusSet();
    s.apply('frozen', 2000);
    expect(s.shatter()).toBe(true);
    expect(s.has('frozen')).toBe(false);
    expect(s.shatter()).toBe(false);
    expect(s.apply('frozen', 2000).applied).toBe(false);
  });

  it('respects immunities and duration multipliers', () => {
    const golem = new StatusSet({ immune: ['frozen', 'chilled'] });
    expect(golem.apply('frozen', 2000).applied).toBe(false);
    expect(golem.addChill(5000)).toBe(false);

    const boss = new StatusSet({ durationMult: 0.25 });
    boss.apply('shocked', 400);
    boss.update(60);
    boss.update(60);
    expect(boss.has('shocked')).toBe(false); // 100ms total
  });

  it('a shock stuns enemies but only slows the player', () => {
    const enemy = new StatusSet();
    enemy.apply('shocked', 400);
    expect(enemy.speedMult).toBe(0);

    const player = new StatusSet({ shockStuns: false });
    player.apply('shocked', 400);
    expect(player.stunned).toBe(false);
    expect(player.speedMult).toBe(STATUS_TUNING.shockedPlayerSpeed);
  });

  it('lists active statuses in a stable order', () => {
    const s = new StatusSet();
    s.apply('shocked', 100);
    s.apply('wet', 100);
    expect(s.list()).toEqual(['wet', 'shocked']);
  });
});

describe('resolveHit', () => {
  it('electricity deals bonus damage to wet targets and shocks them', () => {
    const t = new StatusSet();
    t.apply('wet', 5000);
    const hit = resolveHit('beam', t, 20);
    expect(hit.damage).toBe(30);
    expect(hit.shockMs).toBe(STATUS_TUNING.shockedEnemyMs);
    expect(hit.wetShock).toBe(true);
  });

  it('electricity on a dry target is plain damage', () => {
    const hit = resolveHit('bolt', new StatusSet(), 20);
    expect(hit).toMatchObject({ damage: 20, shockMs: 0, wetShock: false });
  });

  it('lightning always shocks, longer, and still gets the wet bonus', () => {
    const dry = resolveHit('lightning', new StatusSet(), 30);
    expect(dry.shockMs).toBe(STATUS_TUNING.shockedEnemyMs * 2);
    expect(dry.damage).toBe(30);

    const wet = new StatusSet();
    wet.apply('wet', 5000);
    expect(resolveHit('lightning', wet, 30).damage).toBe(45);
  });

  it('melee shatters frozen targets for the weapon multiplier, once', () => {
    const t = new StatusSet();
    t.apply('frozen', 2000);
    const first = resolveHit('melee', t, 10, 3);
    expect(first).toMatchObject({ damage: 30, shattered: true });
    expect(resolveHit('melee', t, 10, 3)).toMatchObject({ damage: 10, shattered: false });
  });

  it('only melee shatters; a beam leaves the ice alone', () => {
    const t = new StatusSet();
    t.apply('frozen', 2000);
    expect(resolveHit('beam', t, 10, 3).shattered).toBe(false);
    expect(t.has('frozen')).toBe(true);
  });
});

describe('extinguish', () => {
  it('puts out a fire and reports it', () => {
    const t = new StatusSet();
    t.apply('burning', 4000);
    expect(t.extinguish()).toBe(true);
    expect(t.has('burning')).toBe(false);
    expect(t.update(1000).burnTicks).toBe(0);
  });

  it('does nothing when not burning', () => {
    const t = new StatusSet();
    t.apply('wet', 4000);
    expect(t.extinguish()).toBe(false);
    expect(t.has('wet')).toBe(true);
  });
});
