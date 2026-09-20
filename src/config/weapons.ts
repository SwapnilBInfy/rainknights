import type { WeaponType } from '../gfx/chibi';

/** Manual melee swing (Space): an arc in front of the knight. */
export interface MeleeStats {
  /** How far the weapon reaches, in pixels. */
  reach: number;
  /** Total width of the hit arc, in degrees. */
  arcDeg: number;
  /** Multiplier on the knight's attack damage. */
  damageMult: number;
  cooldownMs: number;
  /** Pixels enemies are shoved back on a hit. */
  knockback: number;
}

/** Manual energy beam (J / X): a piercing line in the aim direction. */
export interface BeamStats {
  damageMult: number;
  cooldownMs: number;
  /** Half the beam's thickness, in pixels (drives both hit test and sprite). */
  halfWidth: number;
  /** Beam colors, outer edge → mid → core. */
  colors: [edge: number, mid: number, core: number];
}

export const MELEE: Record<WeaponType, MeleeStats> = {
  sword: { reach: 30, arcDeg: 150, damageMult: 2.2, cooldownMs: 380, knockback: 8 },
  hammer: { reach: 28, arcDeg: 200, damageMult: 3.2, cooldownMs: 640, knockback: 14 },
  daggers: { reach: 24, arcDeg: 130, damageMult: 1.4, cooldownMs: 230, knockback: 4 },
};

export const BEAM: Record<WeaponType, BeamStats> = {
  sword: { damageMult: 1.6, cooldownMs: 900, halfWidth: 3, colors: [0x2080d8, 0x70d8ff, 0xffffff] },
  hammer: { damageMult: 2.1, cooldownMs: 1300, halfWidth: 5, colors: [0x5090c8, 0xb0e8ff, 0xffffff] },
  daggers: { damageMult: 1.1, cooldownMs: 600, halfWidth: 2, colors: [0xd89000, 0xfff060, 0xffffff] },
};
