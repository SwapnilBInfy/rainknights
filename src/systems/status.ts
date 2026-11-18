/**
 * Status effects (wet / burning / chilled / frozen / shocked) for enemies and
 * the player. Everything here is plain data + math with no Phaser import, so
 * the rules can be unit-tested. Timers count down on frame deltas rather than
 * wall-clock timestamps, which keeps them correct across pause menus.
 */

export type StatusId = 'wet' | 'burning' | 'chilled' | 'frozen' | 'shocked';
export const STATUS_IDS: StatusId[] = ['wet', 'burning', 'chilled', 'frozen', 'shocked'];

/** What happened when fire met water or ice. Lets the scene show feedback. */
export type Reaction = 'steam' | 'thaw';

export interface ApplyResult {
  applied: boolean;
  reaction?: Reaction;
}

export const STATUS_TUNING = {
  /** Frame deltas above this are treated as a hiccup (tab switch, resume). */
  maxStepMs: 100,
  wetMs: 5000,
  burnMs: 4000,
  burnTickMs: 500,
  chilledMs: 2500,
  chilledSpeed: 0.6,
  /** Time spent in frost before freezing solid. Wet doubles the build-up. */
  freezeAtMs: 1000,
  /** How fast the frost meter drains once you are out of the patch. */
  chillDecay: 0.5,
  frozenEnemyMs: 2000,
  frozenPlayerMs: 1000,
  /** After thawing you cannot be re-frozen for a while (no freeze-lock). */
  thawImmunityMs: 2500,
  shockedEnemyMs: 450,
  shockedPlayerMs: 500,
  shockedPlayerSpeed: 0.35,
  /** Damage multiplier electricity deals to a Wet target. */
  wetShockBonus: 1.5,
} as const;

export interface StatusOptions {
  /** Statuses this creature can never receive. */
  immune?: StatusId[];
  /** Scales every duration; bosses use a small value so they cannot be locked down. */
  durationMult?: number;
  frozenMs?: number;
  /** Enemies are stopped dead by a shock; the player is only slowed. */
  shockStuns?: boolean;
}

export class StatusSet {
  private remaining: Record<StatusId, number> = { wet: 0, burning: 0, chilled: 0, frozen: 0, shocked: 0 };
  private chillMeter = 0;
  private thawImmunity = 0;
  private burnClock = 0;
  private chilledThisStep = false;

  constructor(private readonly opts: StatusOptions = {}) {}

  private mult(): number {
    return this.opts.durationMult ?? 1;
  }

  private immune(id: StatusId): boolean {
    return this.opts.immune?.includes(id) ?? false;
  }

  has(id: StatusId): boolean {
    return this.remaining[id] > 0;
  }

  /** Active statuses, in a stable order (used for HUD icons and tests). */
  list(): StatusId[] {
    return STATUS_IDS.filter((id) => this.has(id));
  }

  /** 0..1 progress toward freezing, for visuals. */
  get chill(): number {
    return Math.min(1, this.chillMeter / STATUS_TUNING.freezeAtMs);
  }

  get stunned(): boolean {
    return this.has('frozen') || (this.has('shocked') && (this.opts.shockStuns ?? true));
  }

  /** Multiplier applied to movement speed. */
  get speedMult(): number {
    if (this.stunned) return 0;
    let m = 1;
    if (this.has('chilled')) m *= STATUS_TUNING.chilledSpeed;
    if (this.has('shocked')) m *= STATUS_TUNING.shockedPlayerSpeed;
    return m;
  }

  /**
   * Apply a status for `baseMs` (before the creature's duration multiplier).
   * Reactions: water puts out fire (steam), fire thaws ice (thaw) and in both
   * cases the new status is *not* applied.
   */
  apply(id: StatusId, baseMs: number): ApplyResult {
    if (this.immune(id)) return { applied: false };
    const ms = baseMs * this.mult();

    switch (id) {
      case 'wet': {
        const extinguished = this.remaining.burning > 0;
        this.remaining.burning = 0;
        this.burnClock = 0;
        this.remaining.wet = Math.max(this.remaining.wet, ms);
        return extinguished ? { applied: true, reaction: 'steam' } : { applied: true };
      }
      case 'burning': {
        if (this.remaining.wet > 0) {
          this.remaining.wet = 0;
          return { applied: false, reaction: 'steam' };
        }
        if (this.remaining.frozen > 0 || this.remaining.chilled > 0 || this.chillMeter > 0) {
          this.remaining.frozen = 0;
          this.remaining.chilled = 0;
          this.chillMeter = 0;
          return { applied: false, reaction: 'thaw' };
        }
        this.remaining.burning = Math.max(this.remaining.burning, ms);
        return { applied: true };
      }
      case 'frozen': {
        if (this.thawImmunity > 0) return { applied: false };
        this.remaining.frozen = Math.max(this.remaining.frozen, ms);
        this.remaining.chilled = Math.max(this.remaining.chilled, ms);
        this.chillMeter = 0;
        return { applied: true };
      }
      default:
        this.remaining[id] = Math.max(this.remaining[id], ms);
        return { applied: true };
    }
  }

  /**
   * Time spent standing in frost. Builds a meter that freezes the creature
   * solid once full. Returns true on the step it freezes.
   */
  addChill(ms: number): boolean {
    if (this.immune('chilled') || this.thawImmunity > 0 || this.has('burning')) return false;
    this.chilledThisStep = true;
    this.remaining.chilled = Math.max(this.remaining.chilled, STATUS_TUNING.chilledMs * this.mult());
    if (this.has('frozen')) return false;
    this.chillMeter += ms * (this.has('wet') ? 2 : 1);
    if (this.chillMeter < STATUS_TUNING.freezeAtMs) return false;
    if (this.immune('frozen')) {
      this.chillMeter = 0;
      return false;
    }
    const frozenMs = this.opts.frozenMs ?? STATUS_TUNING.frozenEnemyMs;
    return this.apply('frozen', frozenMs).applied;
  }

  /** A heavy hit on a frozen target: consumes the ice. Returns true if it shattered. */
  shatter(): boolean {
    if (!this.has('frozen')) return false;
    this.remaining.frozen = 0;
    this.remaining.chilled = 0;
    this.chillMeter = 0;
    this.thawImmunity = STATUS_TUNING.thawImmunityMs;
    return true;
  }

  /** Advance timers. Returns how many burn damage ticks elapsed. */
  update(deltaMs: number): { burnTicks: number } {
    const dt = Math.min(Math.max(deltaMs, 0), STATUS_TUNING.maxStepMs);
    const wasFrozen = this.has('frozen');

    for (const id of STATUS_IDS) this.remaining[id] = Math.max(0, this.remaining[id] - dt);

    if (wasFrozen && !this.has('frozen')) this.thawImmunity = STATUS_TUNING.thawImmunityMs;
    else this.thawImmunity = Math.max(0, this.thawImmunity - dt);

    if (!this.chilledThisStep) this.chillMeter = Math.max(0, this.chillMeter - dt * STATUS_TUNING.chillDecay);
    this.chilledThisStep = false;

    let burnTicks = 0;
    if (this.has('burning')) {
      this.burnClock += dt;
      while (this.burnClock >= STATUS_TUNING.burnTickMs) {
        this.burnClock -= STATUS_TUNING.burnTickMs;
        burnTicks++;
      }
    } else {
      this.burnClock = 0;
    }
    return { burnTicks };
  }

  clear() {
    for (const id of STATUS_IDS) this.remaining[id] = 0;
    this.chillMeter = 0;
    this.thawImmunity = 0;
    this.burnClock = 0;
  }
}

/** Where a hit came from. Drives which reactions it can trigger. */
export type DamageKind = 'melee' | 'beam' | 'bolt' | 'lightning' | 'hazard';

export interface HitOutcome {
  damage: number;
  /** Milliseconds of shock to apply to the target, if any. */
  shockMs: number;
  shattered: boolean;
  wetShock: boolean;
}

/**
 * The reaction rules in one place:
 * - electricity (beam, bolt, lightning) deals +50% to a Wet target and shocks it
 *   (lightning shocks even dry targets, for longer);
 * - a melee hit on a Frozen target shatters the ice for `shatterMult` damage.
 * Consumes the Frozen status when it shatters.
 */
export function resolveHit(kind: DamageKind, target: StatusSet, baseDamage: number, shatterMult = 1): HitOutcome {
  const out: HitOutcome = { damage: baseDamage, shockMs: 0, shattered: false, wetShock: false };
  const electric = kind === 'beam' || kind === 'bolt' || kind === 'lightning';

  if (electric) {
    if (target.has('wet')) {
      out.damage = Math.round(baseDamage * STATUS_TUNING.wetShockBonus);
      out.shockMs = STATUS_TUNING.shockedEnemyMs;
      out.wetShock = true;
    }
    if (kind === 'lightning') out.shockMs = Math.max(out.shockMs, STATUS_TUNING.shockedEnemyMs * 2);
  }

  if (kind === 'melee' && target.shatter()) {
    out.damage = Math.round(baseDamage * shatterMult);
    out.shattered = true;
  }
  return out;
}
