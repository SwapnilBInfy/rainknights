import { describe, expect, it } from 'vitest';
import { XP_BASE, XP_GROWTH } from '../src/config/constants';
import { grantXp, type LevelState } from '../src/entities/levelUp';
import { townMaxHp } from '../src/economy/economy';

function fresh(maxHp: number, hp = 30): LevelState {
  return { xp: 0, xpToNext: XP_BASE, level: 1, hp, maxHp };
}

describe('level-up heal', () => {
  it('restores HP to the current maximum, armor included', () => {
    const bare = townMaxHp('rainKnight', null);
    const mailed = townMaxHp('rainKnight', 'mail');
    expect(mailed).toBeGreaterThan(bare);

    const once = grantXp(fresh(mailed, 40), XP_BASE);
    expect(once.levels).toBe(1);
    expect(once.state.level).toBe(2);
    expect(once.state.hp).toBe(mailed);
    expect(once.state.xpToNext).toBe(XP_BASE + 2 * XP_GROWTH);
  });

  it('heals on every level when several arrive at once', () => {
    const maxHp = townMaxHp('hailWarden', 'cloth');
    const second = XP_BASE + 2 * XP_GROWTH;
    const twice = grantXp(fresh(maxHp, 12), XP_BASE + second);
    expect(twice.levels).toBe(2);
    expect(twice.state.level).toBe(3);
    expect(twice.state.hp).toBe(maxHp);
    expect(twice.state.xp).toBe(0);
  });

  it('leaves HP alone when the xp does not reach a level', () => {
    const shy = grantXp(fresh(100, 40), XP_BASE - 1);
    expect(shy.levels).toBe(0);
    expect(shy.state.hp).toBe(40);
    expect(shy.state.level).toBe(1);
  });
});
