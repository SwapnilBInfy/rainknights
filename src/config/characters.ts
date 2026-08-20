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
  /** Procedural fallback texture, always present. */
  textureKey: string;
  /** AI-generated sprite pair — may not exist until art:generate has been run. */
  idleTextureKey: string;
  strideTextureKey: string;
  /** Display scale for the procedural fallback texture. */
  displayScale: number;
  /** Display scale for the (much larger) generated sprite textures. */
  spriteScale: number;
  mods: CharacterMods;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'rainKnight',
    name: 'Rain Knight',
    tagline: 'Balanced. A steady drizzle.',
    textureKey: TEX.playerRainKnight,
    idleTextureKey: 'char_rainKnight_idle',
    strideTextureKey: 'char_rainKnight_stride',
    displayScale: 1,
    spriteScale: 0.26,
    mods: { maxHp: 1, moveSpeed: 1, attackDamage: 1, attackCooldown: 1 },
  },
  {
    id: 'hailWarden',
    name: 'Hail Warden',
    tagline: 'Slow and unbreakable.',
    textureKey: TEX.playerHailWarden,
    idleTextureKey: 'char_hailWarden_idle',
    strideTextureKey: 'char_hailWarden_stride',
    displayScale: 1.15,
    spriteScale: 0.3,
    mods: { maxHp: 1.5, moveSpeed: 0.85, attackDamage: 0.85, attackCooldown: 1.1 },
  },
  {
    id: 'stormChaser',
    name: 'Storm Chaser',
    tagline: 'Fast and fragile.',
    textureKey: TEX.playerStormChaser,
    idleTextureKey: 'char_stormChaser_idle',
    strideTextureKey: 'char_stormChaser_stride',
    displayScale: 0.9,
    spriteScale: 0.23,
    mods: { maxHp: 0.75, moveSpeed: 1.25, attackDamage: 1.1, attackCooldown: 0.8 },
  },
];

export function getCharacter(id: string | undefined): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}
