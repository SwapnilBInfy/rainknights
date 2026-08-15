import { TEX } from '../gfx/spriteDefs';

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
  textureKey: string;
  displayScale: number;
  mods: CharacterMods;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'rainKnight',
    name: 'Rain Knight',
    tagline: 'Balanced. A steady drizzle.',
    textureKey: TEX.playerRainKnight,
    displayScale: 1,
    mods: { maxHp: 1, moveSpeed: 1, attackDamage: 1, attackCooldown: 1 },
  },
  {
    id: 'hailWarden',
    name: 'Hail Warden',
    tagline: 'Slow and unbreakable.',
    textureKey: TEX.playerHailWarden,
    displayScale: 1.15,
    mods: { maxHp: 1.5, moveSpeed: 0.85, attackDamage: 0.85, attackCooldown: 1.1 },
  },
  {
    id: 'stormChaser',
    name: 'Storm Chaser',
    tagline: 'Fast and fragile.',
    textureKey: TEX.playerStormChaser,
    displayScale: 0.9,
    mods: { maxHp: 0.75, moveSpeed: 1.25, attackDamage: 1.1, attackCooldown: 0.8 },
  },
];

export function getCharacter(id: string | undefined): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}
