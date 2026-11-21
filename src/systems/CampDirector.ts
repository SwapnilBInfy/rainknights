import type { Camp } from './camps';
import type { Enemy } from '../entities/enemies/Enemy';

/** A defeated enemy comes back once the knight is at least this far from its spot (so it never pops in on screen). */
export const RESPAWN_FAR = 300;

export interface CampHost {
  /** Put a resident enemy of this type at a spot, looping around it. */
  place(type: string, x: number, y: number, phase: number): Enemy;
  /** Where the knight is. */
  knight(): { x: number; y: number };
}

interface Spot {
  type: string;
  x: number;
  y: number;
  phase: number;
  enemy: Enemy | null;
}

/**
 * The enemies of a place live at fixed spots. All of them stand there from the start; one that is defeated stays
 * defeated until the knight has gone far enough away and come back: it returns to its spot once the knight is out of
 * sight (`RESPAWN_FAR`), so leaving an area and returning finds it populated again.
 */
export class CampDirector {
  private readonly spots: Spot[] = [];
  /** While held, nothing comes back (the debug bridge's quiet city). */
  held = false;

  constructor(private readonly host: CampHost, camps: readonly Camp[], tile = 16) {
    for (const camp of camps) {
      const cx = camp.col * tile + tile / 2;
      const cy = camp.row * tile + tile / 2;
      for (const m of camp.members) this.spots.push({ type: m.type, x: cx + m.dx, y: cy + m.dy, phase: m.phase, enemy: null });
    }
  }

  /** Put every resident in place. */
  start() {
    for (const spot of this.spots) this.fill(spot);
  }

  /** Bring back whatever the knight has left far enough behind. */
  update() {
    if (this.held) return;
    const k = this.host.knight();
    for (const spot of this.spots) {
      if (spot.enemy?.active) continue;
      spot.enemy = null;
      if (Math.hypot(spot.x - k.x, spot.y - k.y) >= RESPAWN_FAR) this.fill(spot);
    }
  }

  private fill(spot: Spot) {
    spot.enemy = this.host.place(spot.type, spot.x, spot.y, spot.phase);
  }

  get count(): number {
    return this.spots.length;
  }

  /** Residents standing now. */
  get alive(): number {
    return this.spots.filter((s) => s.enemy?.active).length;
  }

  /** Spots whose resident has been defeated and not yet returned. */
  get empty(): number {
    return this.spots.length - this.alive;
  }

  /** Where the spots are (for the debug bridge). */
  positions(): { x: number; y: number; type: string; alive: boolean; aggro: boolean; at: { x: number; y: number } | null }[] {
    return this.spots.map((s) => ({ x: s.x, y: s.y, type: s.type, alive: !!s.enemy?.active, aggro: !!s.enemy?.active && s.enemy.isAggro, at: s.enemy?.active ? { x: s.enemy.x, y: s.enemy.y } : null }));
  }
}
