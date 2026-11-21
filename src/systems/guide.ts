/**
 * What to tell a player who does not know what to do next. Plain data and maths (no Phaser), so the rules can be
 * unit-tested. Two kinds of line, both short enough for the strip along the bottom of the 240px screen:
 *
 * - a **town tip** in Mistford: the next thing worth doing, for a knight who is not following the story (the story has
 *   its own objectives, which take the strip when it is started);
 * - a **run goal** in a city: the next level to reach, or the boss to find.
 *
 * And the one-time **tips** that explain a rule the first time it comes up (a foe spotting you, a locked gate), which
 * the save remembers so they are never repeated.
 */
import { gateLevels, suggestedLevel } from './zones';
import { CHARMS } from '../economy/charms';

/** The most characters the strip holds after its "* " mark. */
export const STRIP_MAX = 26;

export interface TownCtx {
  /** Fights fought (won, lost or fled). */
  runs: number;
  /** Boss fights won. */
  wins: number;
  level: number;
  /** Stat points earned and not spent. */
  unspent: number;
  coins: number;
  charmsOwned: number;
}

/** The cheapest charm in the shop: the point at which a first one is within reach. */
export const CHEAPEST_CHARM = Math.min(...CHARMS.map((c) => c.price));

/** The next thing worth doing in Mistford, or '' if there is nothing to say. */
export function townTip(c: TownCtx): string {
  if (c.runs === 0) return 'FLY: STAND ON THE BLUE PAD';
  if (c.unspent > 0) return 'POINTS TO SPEND: SHOP, I';
  if (c.charmsOwned === 0 && c.coins >= CHEAPEST_CHARM) return 'BUY A CHARM AT THE SHOP';
  if (c.wins === 0) return `FIRST BOSS: NEW YORK, LV${suggestedLevel('nyc')}+`;
  return '';
}

export interface RunCtx {
  regionId: string;
  level: number;
  /** The boss is still waiting. */
  bossAlive: boolean;
}

/** What to do in a city, as a line for the HUD ('' in places with no gates, like the finale). */
export function runGoal(c: RunCtx): string {
  const [first, second] = gateLevels(c.regionId);
  if (c.level < first) return `REACH LV${first}: OPENS THE GATE`;
  if (c.level < second) return `REACH LV${second}: OPENS THE CORE`;
  if (c.bossAlive) return c.level < suggestedLevel(c.regionId) ? `BOSS AT THE FAR END: LV${suggestedLevel(c.regionId)}+` : 'DEFEAT THE BOSS: FAR END';
  return '';
}

/** One-time tips: an id, and what to say (two lines of up to 27 characters). */
export const TIPS = {
  spotted: ['Foes notice you up close.', 'Sneak past, or fight!'],
  gate: ['Gates open as you level.', 'Foes drop XP gems!'],
} as const;

export type TipId = keyof typeof TIPS;
export const TIP_IDS = Object.keys(TIPS) as TipId[];

/** Read the list of tips already shown out of untrusted saved data: known ones only, no repeats. */
export function sanitizeTips(value: unknown): TipId[] {
  const out: TipId[] = [];
  if (Array.isArray(value)) for (const id of value) if (typeof id === 'string' && (TIP_IDS as string[]).includes(id) && !out.includes(id as TipId)) out.push(id as TipId);
  return out;
}
