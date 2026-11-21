/**
 * Which knights the player can use. Only the first, the Rain Knight, is theirs at the start; the others come with the
 * story, or when an objective is done. Plain data and maths (no Phaser), so the rules can be unit-tested.
 */

export const FIRST_KNIGHT = 'rainKnight';

/** What the rules look at: the knight's record and the story so far. */
export interface UnlockContext {
  /** Boss fights won. */
  wins: number;
  /** The knight's level. */
  level: number;
  storyStarted: boolean;
  storyStage: number;
  storyComplete: boolean;
}

interface Rule {
  /** What to do, short enough for the mirror's panel. */
  hint: string;
  met(ctx: UnlockContext): boolean;
}

const storyAt = (ctx: UnlockContext, stage: number): boolean => ctx.storyComplete || (ctx.storyStarted && ctx.storyStage >= stage);

export const KNIGHT_RULES: Record<string, Rule> = {
  // the Warden: win a boss fight, or follow the story to the Mist Shard
  hailWarden: { hint: 'Win a boss fight.', met: (c) => c.wins >= 1 || storyAt(c, 3) },
  // the Chaser: a seasoned knight (level 10), or the story as far as the tunnels
  stormChaser: { hint: 'Reach level 10.', met: (c) => c.level >= 10 || storyAt(c, 5) },
};

/** What a locked knight asks for (the first knight asks for nothing). */
export const unlockHint = (id: string): string => KNIGHT_RULES[id]?.hint ?? '';

/** Every knight the rules say this player has earned. */
export function earnedKnights(ctx: UnlockContext): string[] {
  return [FIRST_KNIGHT, ...Object.keys(KNIGHT_RULES).filter((id) => KNIGHT_RULES[id].met(ctx))];
}

/** Knights earned that the player does not have yet. */
export function newlyEarned(have: readonly string[], ctx: UnlockContext): string[] {
  return earnedKnights(ctx).filter((id) => !have.includes(id));
}

/** Read the list of knights out of untrusted saved data: known knights only, the first always, and the one in use. */
export function sanitizeUnlocked(value: unknown, known: ReadonlySet<string>, inUse: string): string[] {
  const out: string[] = [FIRST_KNIGHT];
  if (Array.isArray(value)) for (const id of value) if (typeof id === 'string' && known.has(id) && !out.includes(id)) out.push(id);
  // a knight already in use (a save from before knights were earned) is theirs
  if (known.has(inUse) && !out.includes(inUse)) out.push(inUse);
  return out;
}
