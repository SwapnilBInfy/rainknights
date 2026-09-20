import type { KnightStyle } from '../gfx/chibi';

export interface CharacterMods {
  maxHp: number;
  moveSpeed: number;
  attackDamage: number;
  attackCooldown: number;
}

export interface CharacterDef {
  id: string;
  name: string;
  tagline: string;
  /** Drives the procedural chibi sprite (see gfx/chibi.ts) and held weapon. */
  style: KnightStyle;
  mods: CharacterMods;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'rainKnight',
    name: 'Rain Knight',
    tagline: 'Balanced. A steady drizzle.',
    style: {
      armor: [0x24428a, 0x3b6fd6, 0x86aef5],
      helm: [0x2a4a9a, 0x4a80e0, 0xa8c8ff],
      trim: 0xd83030,
      visor: 0x181828,
      weapon: 'sword',
      bulk: 0,
      plume: true,
      cape: true,
    },
    mods: { maxHp: 1, moveSpeed: 1, attackDamage: 1, attackCooldown: 1 },
  },
  {
    id: 'hailWarden',
    name: 'Hail Warden',
    tagline: 'Slow and unbreakable.',
    style: {
      armor: [0x7888a4, 0xb8c8de, 0xf0f8ff],
      helm: [0x7080a0, 0xc8d8ea, 0xffffff],
      trim: 0x48b8e8,
      visor: 0x203040,
      weapon: 'hammer',
      bulk: 1,
    },
    mods: { maxHp: 1.5, moveSpeed: 0.85, attackDamage: 0.85, attackCooldown: 1.1 },
  },
  {
    id: 'stormChaser',
    name: 'Storm Chaser',
    tagline: 'Fast and fragile.',
    style: {
      armor: [0xa87800, 0xf0c020, 0xfff080],
      helm: [0xb08000, 0xf8d030, 0xfffab0],
      trim: 0xe86020,
      visor: 0x282020,
      weapon: 'daggers',
      bulk: -1,
      scarf: true,
    },
    mods: { maxHp: 0.75, moveSpeed: 1.25, attackDamage: 1.1, attackCooldown: 0.8 },
  },
];

export function getCharacter(id: string | undefined): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}
