/**
 * Which enemy a spawn slot becomes. A region can have a signature enemy (the
 * Cab Wraith in New York) that replaces some of the front's usual spawns,
 * more often as the storm escalates. Plain data + math so it can be tested.
 */

/** Chance, by storm-front index, that a spawn is the region's signature enemy. */
export const SIGNATURE_CHANCE: readonly number[] = [0, 0.1, 0.12, 0.16, 0.18, 0.2];

export function signatureChance(frontIndex: number): number {
  const i = Math.max(0, Math.min(SIGNATURE_CHANCE.length - 1, Math.floor(frontIndex)));
  return SIGNATURE_CHANCE[i];
}

/** `rand` returns [0, 1). Two draws at most: one for the signature roll, one for the pick. */
export function pickEnemyType(
  frontEnemies: readonly string[],
  frontIndex: number,
  signature: string | undefined,
  rand: () => number
): string {
  if (signature && rand() < signatureChance(frontIndex)) return signature;
  return frontEnemies[Math.min(frontEnemies.length - 1, Math.floor(rand() * frontEnemies.length))];
}
