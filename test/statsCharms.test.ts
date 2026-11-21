import { describe, expect, it } from 'vitest';
import {
  addPoint,
  freshAllocation,
  NO_EFFECTS,
  POINTS_PER_LEVEL,
  pointsForLevel,
  pointsSpent,
  removePoint,
  sanitizeAllocation,
  STAT_CAP,
  STAT_IDS,
  statEffects,
  type Spend,
} from '../src/systems/stats';
import {
  CHARMS,
  charm,
  charmEffects,
  charmSlots,
  emptyBox,
  fit,
  gain,
  MAX_RANK,
  nextPrice,
  NO_CHARMS,
  randomCharm,
  rankLabel,
  sanitizeCharms,
  toggle,
  type CharmBox,
} from '../src/economy/charms';

const fresh = (points = 0): Spend => ({ points, alloc: freshAllocation() });

describe('stat points', () => {
  it('every level gives three points, and a new knight has earned none', () => {
    expect(POINTS_PER_LEVEL).toBe(3);
    expect(pointsForLevel(1)).toBe(0);
    expect(pointsForLevel(2)).toBe(3);
    expect(pointsForLevel(10)).toBe(27);
    expect(pointsForLevel(0)).toBe(0);
  });

  it('spends a point on a stat, and takes it back, without ever creating or losing one', () => {
    let s = fresh(3);
    for (const id of STAT_IDS.slice(0, 3)) {
      const next = addPoint(s, id);
      expect(next).not.toBeNull();
      s = next!;
    }
    expect(s.points).toBe(0);
    expect(pointsSpent(s.alloc)).toBe(3);
    expect(addPoint(s, 'speed'), 'none left to spend').toBeNull();
    const back = removePoint(s, 'power')!;
    expect(back.points).toBe(1);
    expect(back.alloc.power).toBe(0);
    expect(back.points + pointsSpent(back.alloc)).toBe(3);
    expect(removePoint(back, 'power'), 'nothing in it to take').toBeNull();
  });

  it('a stat is capped, so no build is the only build', () => {
    let s = fresh(STAT_CAP + 5);
    for (let i = 0; i < STAT_CAP; i++) s = addPoint(s, 'strength')!;
    expect(s.alloc.strength).toBe(STAT_CAP);
    expect(addPoint(s, 'strength')).toBeNull();
    expect(s.points).toBe(5);
  });

  it('does nothing at zero, and each stat does what it says', () => {
    expect(statEffects(freshAllocation())).toEqual(NO_EFFECTS);
    const a = { strength: 10, power: 5, endurance: 10, speed: 10 };
    const fx = statEffects(a);
    expect(fx.melee).toBeCloseTo(1.7, 9);
    expect(fx.ranged).toBeCloseTo(1.35, 9);
    expect(fx.maxHp).toBe(80);
    expect(fx.taken).toBeCloseTo(0.8, 9);
    expect(fx.move).toBeCloseTo(1.4, 9);
    expect(fx.roll).toBeCloseTo(0.7, 9);
    // strength does not touch the ranged attack, and power does not touch the swing
    expect(statEffects({ ...freshAllocation(), strength: 8 }).ranged).toBe(1);
    expect(statEffects({ ...freshAllocation(), power: 8 }).melee).toBe(1);
  });

  it('keeps what endurance and speed give within a floor, however many points go in', () => {
    const maxed = statEffects({ strength: 0, power: 0, endurance: STAT_CAP, speed: STAT_CAP });
    expect(maxed.taken).toBeGreaterThanOrEqual(0.6);
    expect(maxed.roll).toBeGreaterThanOrEqual(0.6);
    expect(maxed.move).toBeLessThan(2.3);
  });

  it('more points always means more, for every stat', () => {
    for (const id of STAT_IDS) {
      const lo = statEffects({ ...freshAllocation(), [id]: 3 });
      const hi = statEffects({ ...freshAllocation(), [id]: 9 });
      const delta = (k: keyof typeof lo) => Math.abs((hi[k] as number) - (NO_EFFECTS[k] as number)) - Math.abs((lo[k] as number) - (NO_EFFECTS[k] as number));
      expect(Object.keys(lo).some((k) => delta(k as keyof typeof lo) > 0), id).toBe(true);
    }
  });

  it('reads an allocation out of damaged saved data: whole numbers within the cap, nothing else', () => {
    expect(sanitizeAllocation(null)).toEqual(freshAllocation());
    expect(sanitizeAllocation('x')).toEqual(freshAllocation());
    expect(sanitizeAllocation({ strength: 4, power: -3, endurance: 2.5, speed: 999, extra: 7 })).toEqual({ strength: 4, power: 0, endurance: 0, speed: STAT_CAP });
  });
});

describe('charms', () => {
  it('has the eleven skills the level-up menu used to offer, each with a name, a blurb and a price', () => {
    expect(CHARMS).toHaveLength(11);
    expect(new Set(CHARMS.map((c) => c.id)).size).toBe(11);
    expect(CHARMS.filter((c) => c.kind === 'weather').map((c) => c.power).sort()).toEqual(['frost', 'gale', 'rainbowShield', 'staticCharge', 'sunbeam']);
    for (const c of CHARMS) {
      expect(c.name.length, c.id).toBeLessThanOrEqual(15);
      expect(c.blurb.length, c.id).toBeLessThanOrEqual(26);
      expect(c.price, c.id).toBeGreaterThan(0);
    }
    expect(rankLabel(1)).toBe('I');
    expect(rankLabel(3)).toBe('III');
  });

  it('a knight gets more slots as they level: three, then four at level 5, five at level 10', () => {
    expect(charmSlots(1)).toBe(3);
    expect(charmSlots(4)).toBe(3);
    expect(charmSlots(5)).toBe(4);
    expect(charmSlots(9)).toBe(4);
    expect(charmSlots(10)).toBe(5);
    expect(charmSlots(40)).toBe(5);
  });

  it('a new charm is worn at once if there is room, and a second of the same kind ranks it up', () => {
    const first = gain(emptyBox(), 'frostCharm', 3)!;
    expect(first.rank).toBe(1);
    expect(first.wornNow).toBe(true);
    expect(first.box.worn).toEqual(['frostCharm']);
    const second = gain(first.box, 'frostCharm', 3)!;
    expect(second.rank).toBe(2);
    expect(second.wornNow).toBe(false);
    expect(second.box.worn).toEqual(['frostCharm']);
    expect(second.box.owned.frostCharm).toBe(2);
    expect(gain(gain(second.box, 'frostCharm', 3)!.box, 'frostCharm', 3), 'rank III is the top').toBeNull();
    expect(gain(emptyBox(), 'nonsense', 3)).toBeNull();
  });

  it('a charm found when the slots are full is owned but not worn', () => {
    let box: CharmBox = emptyBox();
    for (const id of ['boltRing', 'squallBand', 'gustLens']) box = gain(box, id, 3)!.box;
    const extra = gain(box, 'hailTip', 3)!;
    expect(extra.wornNow).toBe(false);
    expect(extra.box.owned.hailTip).toBe(1);
    expect(extra.box.worn).toHaveLength(3);
  });

  it('wears and puts away owned charms, within the slots, and cannot wear what it does not own', () => {
    let box: CharmBox = { owned: { boltRing: 1, lodestone: 1, hailTip: 1, gustLens: 1 }, worn: [] };
    box = toggle(box, 'boltRing', 3)!;
    box = toggle(box, 'lodestone', 3)!;
    box = toggle(box, 'hailTip', 3)!;
    expect(box.worn).toEqual(['boltRing', 'lodestone', 'hailTip']);
    expect(toggle(box, 'gustLens', 3), 'no free slot').toBeNull();
    expect(toggle(box, 'gustLens', 4)?.worn).toHaveLength(4);
    expect(toggle(box, 'lodestone', 3)!.worn).toEqual(['boltRing', 'hailTip']);
    expect(toggle(box, 'frostCharm', 5), 'not owned').toBeNull();
  });

  it('prices each rank higher than the last, and stops at rank III', () => {
    const def = charm('hailTip')!;
    expect(nextPrice(emptyBox(), 'hailTip')).toBe(def.price);
    expect(nextPrice({ owned: { hailTip: 1 }, worn: [] }, 'hailTip')).toBe(def.price * 2);
    expect(nextPrice({ owned: { hailTip: 2 }, worn: [] }, 'hailTip')).toBe(def.price * 3);
    expect(nextPrice({ owned: { hailTip: MAX_RANK }, worn: [] }, 'hailTip')).toBeNull();
    expect(nextPrice(emptyBox(), 'nope')).toBeNull();
  });

  it('what is worn changes the knight, and only what is worn', () => {
    expect(charmEffects(emptyBox())).toEqual(NO_CHARMS);
    expect(charmEffects({ owned: { boltRing: 3 }, worn: [] })).toEqual(NO_CHARMS);
    const fx = charmEffects({
      owned: { boltRing: 2, squallBand: 1, gustLens: 3, hailTip: 2, vitalityStone: 1, lodestone: 2, frostCharm: 2, galeCharm: 1 },
      worn: ['boltRing', 'squallBand', 'gustLens', 'hailTip', 'vitalityStone', 'lodestone', 'frostCharm', 'galeCharm'],
    });
    expect(fx.attackDamage).toBe(12);
    expect(fx.cooldownMult).toBeCloseTo(0.88, 9);
    expect(fx.range).toBe(75);
    expect(fx.pierce).toBe(2);
    expect(fx.maxHp).toBe(20);
    expect(fx.magnet).toBe(40);
    expect(fx.powers).toEqual({ sunbeam: 0, rainbowShield: 0, gale: 1, frost: 2, staticCharge: 0 });
    // a higher rank is a stronger charm
    expect(charmEffects({ owned: { squallBand: 3 }, worn: ['squallBand'] }).cooldownMult).toBeLessThan(charmEffects({ owned: { squallBand: 1 }, worn: ['squallBand'] }).cooldownMult);
  });

  it('every charm does something when worn', () => {
    for (const c of CHARMS) {
      const fx = charmEffects({ owned: { [c.id]: 1 }, worn: [c.id] });
      expect(JSON.stringify(fx), c.id).not.toEqual(JSON.stringify(NO_CHARMS));
    }
  });

  it('shrinks to fit fewer slots, dropping what is not owned and any repeats', () => {
    const box: CharmBox = { owned: { boltRing: 1, lodestone: 1 }, worn: ['boltRing', 'ghost', 'boltRing', 'lodestone'] };
    expect(fit(box, 5).worn).toEqual(['boltRing', 'lodestone']);
    expect(fit(box, 1).worn).toEqual(['boltRing']);
    const ok: CharmBox = { owned: { boltRing: 1 }, worn: ['boltRing'] };
    expect(fit(ok, 3)).toBe(ok);
  });

  it('reads saved data defensively: known charms, ranks 1 to 3, worn ones owned, no repeats', () => {
    expect(sanitizeCharms(null, null)).toEqual(emptyBox());
    const box = sanitizeCharms({ boltRing: 9, frostCharm: 0, ghost: 2, hailTip: 1.5, lodestone: 2 }, ['lodestone', 'lodestone', 'frostCharm', 'ghost', 7, 'boltRing']);
    expect(box.owned).toEqual({ boltRing: 3, lodestone: 2 });
    expect(box.worn).toEqual(['lodestone', 'boltRing']);
  });

  it('a random charm is one that can still improve, and none when everything is rank III', () => {
    expect(randomCharm(emptyBox(), 0)).toBe(CHARMS[0].id);
    expect(randomCharm(emptyBox(), 0.999)).toBe(CHARMS[CHARMS.length - 1].id);
    const nearly: CharmBox = { owned: Object.fromEntries(CHARMS.slice(1).map((c) => [c.id, MAX_RANK])), worn: [] };
    expect(randomCharm(nearly, 0.5)).toBe(CHARMS[0].id);
    const all: CharmBox = { owned: Object.fromEntries(CHARMS.map((c) => [c.id, MAX_RANK])), worn: [] };
    expect(randomCharm(all, 0.5)).toBeNull();
  });
});
