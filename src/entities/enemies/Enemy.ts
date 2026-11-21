import Phaser from 'phaser';
import type { EnemyStats } from '../../config/constants';
import { FONT } from '../../ui/Window';
import { StatusSet, type ApplyResult, type StatusId } from '../../systems/status';
import type { TerrainField } from '../../systems/Terrain';
import type { Scale } from '../../systems/difficulty';
import { HOME_RADIUS, HOME_SPEED, PATROL_SPEED, nextMode, patrolPoint, tuningFor, type AggroTuning, type Mode } from '../../systems/aggro';

const STATUS_TINT: Partial<Record<StatusId, number>> = {
  frozen: 0xa0e8ff,
  shocked: 0xffff80,
  chilled: 0xc8ecff,
  wet: 0x8ab8ff,
};

export abstract class Enemy extends Phaser.Physics.Arcade.Sprite {
  stats: EnemyStats;
  hp: number;
  maxHp: number;
  target: Phaser.Physics.Arcade.Sprite;
  wobbleSeed = Math.random() * 1000;
  nextStateChangeAt = 0;
  readonly statuses: StatusSet;
  /** Set by enemies that flash white to telegraph an attack (see DasherEnemy). */
  protected telegraphing = false;
  private flashMs = 0;
  /** Enemies that steer by rotation (cars) switch the idle flip-flop off. */
  protected bobs = true;
  /** False for enemies that drive their own paths (vehicles, dummies). */
  protected chasesAround = true;
  /** Extra damage taken (a stalled engine is vulnerable). */
  damageMultiplier = 1;
  /** Set by the scene from the tile underfoot: wading slows (< 1), ice makes it slide (grip < 1). */
  terrainSpeed = 1;
  grip = 1;
  /** The map, for enemies that care about walls and streets. Set by the scene on spawn. */
  terrain: TerrainField | null = null;
  private tintKey = '';
  /** A yellow "!" over the head while an attack is being wound up. */
  private alertMark: Phaser.GameObjects.Text | null = null;

  /**
   * Set for an enemy that lives at a spot (see `live`): it walks a small loop round `home`, ignores the knight until
   * the knight is spotted, then chases, and walks home again if the knight gets away. A free enemy (a summoned one,
   * one from the debug bridge) has no home and always chases.
   */
  home: { x: number; y: number } | null = null;
  private mode: Mode = 'chase';
  private tuning: AggroTuning | null = null;
  private loopPhase = 0;
  private loopRadius = 14;
  private returningSince = 0;

  /** Make this enemy as tough as the zone and city it is in call for (see difficulty.ts): health, damage and the XP it gives. */
  scaleTo(scale: Scale) {
    this.stats = {
      ...this.stats,
      hp: Math.max(1, Math.round(this.stats.hp * scale.hp)),
      damage: Math.max(1, Math.round(this.stats.damage * scale.damage)),
      xp: Math.max(1, Math.round(this.stats.xp * scale.xp)),
    };
    this.hp = this.maxHp = this.stats.hp;
  }

  /** Make this enemy a resident of the spot it stands on. A radius of 0 stands still (a boss waiting). */
  live(home: { x: number; y: number }, phase = 0, loopRadius = 14) {
    this.home = { ...home };
    this.mode = 'idle';
    this.tuning = tuningFor(this.stats.key);
    this.loopPhase = phase;
    this.loopRadius = loopRadius;
  }

  /** Chasing the knight (always true for a free enemy). */
  get isAggro(): boolean {
    return !this.home || this.mode === 'chase';
  }

  /** A resident that has not spotted the knight: it does no harm, and a knight brushing past it is not hurt. */
  get isPassive(): boolean {
    return !!this.home && this.mode !== 'chase';
  }

  /** A hit wakes a resident at once (a knight who sneaks up and swings is spotted). */
  provoke() {
    if (this.home && this.mode !== 'chase') this.setMode('chase');
  }

  private setMode(next: Mode) {
    const before = this.mode;
    this.mode = next;
    if (next === 'chase' && before !== 'chase') this.emit('spotted', this);
    if (next === 'idle' && before !== 'idle') this.emit('calmed', this);
    if (next === 'return') this.returningSince = this.scene.time.now;
  }

  /** One step of a resident's life: loop at home, chase once spotted, give up and walk home. */
  private liveStep(time: number, delta: number) {
    const home = this.home!;
    const tuning = this.tuning!;
    const toKnight = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y);
    const toHome = Phaser.Math.Distance.Between(this.x, this.y, home.x, home.y);
    const next = nextMode(this.mode, toKnight, toHome, tuning);
    if (next !== this.mode) this.setMode(next);
    if (this.mode === 'chase') {
      this.behavior(time, delta);
      return;
    }
    this.telegraphing = false;
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (this.mode === 'return') {
      // stuck behind something for too long: back it goes, in a blink
      if (time - this.returningSince > 7000) {
        this.setPosition(home.x, home.y);
        this.setMode('idle');
        return;
      }
      if (toHome <= HOME_RADIUS) this.setMode('idle');
      else this.scene.physics.moveTo(this, home.x, home.y, this.stats.speed * HOME_SPEED);
      return;
    }
    if (this.loopRadius <= 0) {
      if (toHome > HOME_RADIUS) this.scene.physics.moveTo(this, home.x, home.y, this.stats.speed * HOME_SPEED);
      else body.setVelocity(0, 0);
      return;
    }
    const goal = patrolPoint(home, time, this.loopPhase, this.loopRadius);
    if (Phaser.Math.Distance.Between(this.x, this.y, goal.x, goal.y) < 2) body.setVelocity(0, 0);
    else this.scene.physics.moveTo(this, goal.x, goal.y, this.stats.speed * PATROL_SPEED);
  }

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    stats: EnemyStats,
    target: Phaser.Physics.Arcade.Sprite
  ) {
    super(scene, x, y, stats.key);
    this.stats = stats;
    this.hp = stats.hp;
    this.maxHp = stats.hp;
    this.target = target;
    this.statuses = new StatusSet({
      immune: stats.immune,
      durationMult: stats.statusResist ?? 1,
      shockStuns: true,
    });
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(5);
    this.setScale(stats.scale);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle((this.width / 2) * 0.8);
    body.setOffset(this.width / 2 - body.radius, this.height / 2 - body.radius);
    this.on(Phaser.GameObjects.Events.DESTROY, () => {
      this.alertMark?.destroy();
      this.alertMark = null;
    });
  }

  /** Speed multiplier for driving on a road or off it (vehicles are faster on streets). */
  roadSpeed(_onRoad: boolean): number {
    return 1;
  }

  /**
   * Still in the world. A destroyed enemy is inactive and has no physics body, so code that loops over a snapshot
   * of enemies must check this before touching `body`: an earlier hit in the same loop (a Static Charge chain, a
   * lightning strike) may have killed a later one.
   */
  get isLive(): boolean {
    return this.active && !!this.body;
  }

  /** Damage dealt on contact; a charging vehicle hits harder than a cruising one. (A resident that has not spotted the knight does none.) */
  get contactDamage(): number {
    return this.stats.damage;
  }

  /** Name of the current behaviour phase, for the debug bridge and tests. */
  get debugPhase(): string {
    return '';
  }

  takeDamage(amount: number): boolean {
    this.provoke();
    this.hp -= amount;
    this.flashMs = 70;
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  /** True while winding up an attack (the "!" mark is showing). */
  get isTelegraphing(): boolean {
    return this.telegraphing;
  }

  applyStatus(id: StatusId, ms: number): ApplyResult {
    return this.statuses.apply(id, ms);
  }

  die() {
    this.emit('enemyDied', this);
    this.destroy();
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    if (!this.active || !this.target.active) return;

    const { burnTicks } = this.statuses.update(delta);
    for (let i = 0; i < burnTicks && this.active; i++) {
      this.takeDamage(Math.max(2, Math.round(this.maxHp * 0.04)));
    }
    if (!this.active) return;
    this.flashMs = Math.max(0, this.flashMs - delta);

    if (this.statuses.stunned) {
      // Frozen or shocked: stops dead, mid-stride, until it wears off.
      this.setVelocity(0, 0);
    } else {
      // Two-frame idle bob: mirror the sprite every ~280ms, like a GBA critter.
      if (this.bobs) this.setFlipX(Math.floor((time + this.wobbleSeed) / 280) % 2 === 0);
      const body = this.body as Phaser.Physics.Arcade.Body;
      const prevX = body.velocity.x;
      const prevY = body.velocity.y;
      if (this.home) this.liveStep(time, delta);
      else this.behavior(time, delta);
      const slow = this.statuses.speedMult * this.terrainSpeed;
      if (slow !== 1) body.velocity.scale(slow);
      if (this.grip < 1) {
        // Slide: only move part of the way from last frame's velocity to the wanted one.
        const k = 1 - Math.exp(-(delta / 1000) * this.grip * 14);
        body.velocity.set(prevX + (body.velocity.x - prevX) * k, prevY + (body.velocity.y - prevY) * k);
      }
      this.slideAroundWalls(body);
    }
    this.refreshTint(time);
    this.updateAlertMark(time);
  }

  private slideDir = 0;

  /**
   * Enemies chase in a straight line, so a wall between them and the knight would pin them
   * against it. When blocked, they slide along the wall (toward the knight's side) instead.
   */
  private slideAroundWalls(body: Phaser.Physics.Arcade.Body) {
    if (!this.chasesAround || this.statuses.stunned) return;
    const b = body.blocked;
    const horizontal = b.left || b.right;
    const vertical = b.up || b.down;
    if (!horizontal && !vertical) {
      this.slideDir = 0;
      return;
    }
    const speed = Math.max(this.stats.speed * this.terrainSpeed * this.statuses.speedMult, 1);
    if (horizontal && Math.abs(body.velocity.y) < speed * 0.3) {
      if (this.slideDir === 0) this.slideDir = this.target.y >= this.y ? 1 : -1;
      body.velocity.y = this.slideDir * speed;
    } else if (vertical && Math.abs(body.velocity.x) < speed * 0.3) {
      if (this.slideDir === 0) this.slideDir = this.target.x >= this.x ? 1 : -1;
      body.velocity.x = this.slideDir * speed;
    }
  }

  /** Warns the player that an attack is about to land (a wound-up dash, for example). */
  private updateAlertMark(time: number) {
    if (!this.telegraphing) {
      this.alertMark?.setVisible(false);
      return;
    }
    if (!this.alertMark) {
      this.alertMark = this.scene.add
        .text(0, 0, '!', { fontFamily: FONT, fontSize: '8px', color: '#f8d020', stroke: '#101018', strokeThickness: 2 })
        .setOrigin(0.5, 1)
        .setDepth(41);
    }
    const bounce = Math.floor(time / 90) % 2 === 0 ? 0 : 1;
    this.alertMark.setVisible(true).setPosition(Math.round(this.x), Math.round(this.y - this.displayHeight / 2 - 2 - bounce));
  }

  /** One place decides the tint, so statuses never fight the hit flash or attack telegraphs. */
  private refreshTint(time: number) {
    let key = '';
    if (this.flashMs > 0) key = 'flash';
    else if (this.telegraphing) key = 'telegraph';
    else if (this.statuses.has('frozen')) key = 'frozen';
    else if (this.statuses.has('shocked')) key = Math.floor(time / 90) % 2 === 0 ? 'shock-a' : 'shock-b';
    else if (this.statuses.has('burning')) key = Math.floor(time / 120) % 2 === 0 ? 'burn-a' : 'burn-b';
    else if (this.statuses.has('chilled')) key = 'chilled';
    else if (this.statuses.has('wet')) key = 'wet';

    if (key === this.tintKey) return;
    this.tintKey = key;
    switch (key) {
      case '':
        this.clearTint();
        break;
      case 'flash':
        this.setTintFill(0xffffff);
        break;
      case 'telegraph':
        this.setTint(0xffffff);
        break;
      case 'shock-a':
        this.setTint(STATUS_TINT.shocked!);
        break;
      case 'shock-b':
        this.setTint(0xffffff);
        break;
      case 'burn-a':
        this.setTint(0xff9040);
        break;
      case 'burn-b':
        this.setTint(0xffd070);
        break;
      default:
        this.setTint(STATUS_TINT[key as StatusId]!);
    }
  }

  abstract behavior(time: number, delta: number): void;
}
