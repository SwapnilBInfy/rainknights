import { XP_BASE, XP_GROWTH } from '../config/constants';

export interface LevelState {
  xp: number;
  xpToNext: number;
  level: number;
  hp: number;
  maxHp: number;
}

/**
 * Add XP. Every level gained, including several at once, restores HP to the
 * knight's current maximum (armor included).
 */
export function grantXp(state: LevelState, amount: number): { state: LevelState; levels: number } {
  let { xp, xpToNext, level, hp, maxHp } = state;
  let levels = 0;
  xp += Math.max(0, amount);
  while (xp >= xpToNext && xpToNext > 0) {
    xp -= xpToNext;
    level += 1;
    levels += 1;
    xpToNext = XP_BASE + level * XP_GROWTH;
    hp = maxHp;
  }
  return { state: { xp, xpToNext, level, hp, maxHp }, levels };
}
