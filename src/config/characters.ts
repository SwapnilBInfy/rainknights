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
  /**
   * AI-generated sprite set — may not exist until art:generate has been run.
   * All poses are authored facing/moving right; the game flips horizontally
   * for leftward movement.
   */
  idleTextureKey: string;
  walkTextureKeys: [string, string, string];
  attackTextureKey: string;
  /** Display scale for the procedural fallback texture. */
  displayScale: number;
  /** Display scale for the (much larger) generated sprite textures. */
  spriteScale: number;
  mods: CharacterMods;
}

function generatedKeys(id: string) {
  return {
    idleTextureKey: `char_${id}_idle`,
    walkTextureKeys: [`char_${id}_walkA`, `char_${id}_walkB`, `char_${id}_walkC`] as [string, string, string],
    attackTextureKey: `char_${id}_attack`,
  };
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'rainKnight',
    name: 'Rain Knight',
    tagline: 'Balanced. A steady drizzle.',
    textureKey: TEX.playerRainKnight,
    ...generatedKeys('rainKnight'),
    displayScale: 1,
    spriteScale: 0.26,
    mods: { maxHp: 1, moveSpeed: 1, attackDamage: 1, attackCooldown: 1 },
  },
  {
    id: 'hailWarden',
    name: 'Hail Warden',
    tagline: 'Slow and unbreakable.',
    textureKey: TEX.playerHailWarden,
    ...generatedKeys('hailWarden'),
    displayScale: 1.15,
    spriteScale: 0.3,
    mods: { maxHp: 1.5, moveSpeed: 0.85, attackDamage: 0.85, attackCooldown: 1.1 },
  },
  {
    id: 'stormChaser',
    name: 'Storm Chaser',
    tagline: 'Fast and fragile.',
    textureKey: TEX.playerStormChaser,
    ...generatedKeys('stormChaser'),
    displayScale: 0.9,
    spriteScale: 0.23,
    mods: { maxHp: 0.75, moveSpeed: 1.25, attackDamage: 1.1, attackCooldown: 0.8 },
  },
];

export function getCharacter(id: string | undefined): CharacterDef {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}
