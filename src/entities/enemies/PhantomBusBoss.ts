import Phaser from 'phaser';
import { Enemy } from './Enemy';
import type { EnemyStats } from '../../config/constants';
import { ChargeCycle, type ChargePhase, type ChargeTuning } from '../../systems/chargeCycle';
import { drawChargeLane } from '../../gfx/lane';
import { checkLane, MIN_ALONG as MIN_RUN_UP, type LaneCheck } from '../../systems/streets';
import { audio } from '../../audio/engine';

const CALM: ChargeTuning = { cruiseMs: [2600, 3600], telegraphMs: 1100, chargeMs: 750, stallMs: 1500, crashStallMs: 1100 };
const RAGE: ChargeTuning = { cruiseMs: [1300, 2000], telegraphMs: 850, chargeMs: 800, stallMs: 1100, crashStallMs: 1100 };
const CHARGE_SPEED_MULT = { calm: 6, rage: 7.4 };
const CHARGE_DAMAGE_MULT = 1.5;
const LANE_LENGTH = 170;
const LANE_WIDTH = 24;
const TURN_RATE = { calm: 0.9, rage: 1.3 };
const STALL_DAMAGE_MULT = 1.5;
/** Slamming into a building leaves it dazed for a long while, and badly hurt. */
const CRASH_DAMAGE_MULT = 2;
/** How far off the street's axis the knight can be and still be worth a charge (the bus lane is wide). */
const LANE_TOLERANCE = 34;
const RAGE_AT = 0.5;
/** The bus holds this far from the knight to line up (and reverses if crowded). */
const STANDOFF = 78;
const COMMIT_MS = 300;

/**
 * New York's boss: a huge ghost bus. It lumbers after you, then lines up,
 * leans on the horn and barrels down a wide lane. After each charge it
 * stalls (take your hits then). Below half health it is faster and
 * summons Cab Wraiths (the scene drives the summons off `raging`).
 */
export class PhantomBusBoss extends Enemy {
  private cycle = new ChargeCycle(CALM);
  private heading: number;
  private chargeAngle = 0;
  private laneLen = LANE_LENGTH;
  private laneWall = false;
  /** Which way to slide when lined up but blocked, and how long it has been trying. */
  private alignDir = Math.random() < 0.5 ? 1 : -1;
  private unlinedMs = 0;
  /** Stuck watchdog: where it was a moment ago, how long it has barely moved, and a strafe-free burst. */
  private watchX = 0;
  private watchY = 0;
  private stuckMs = 0;
  private unstickMs = 0;
  private lane: Phaser.GameObjects.Graphics;
  /** True once the bus has dropped below half health. */
  raging = false;

  constructor(scene: Phaser.Scene, x: number, y: number, stats: EnemyStats, target: Phaser.Physics.Arcade.Sprite) {
    super(scene, x, y, stats, target);
    this.bobs = false;
    this.chasesAround = true; // while cruising, slide round a building in the way
    this.heading = Phaser.Math.Angle.Between(x, y, target.x, target.y);
    this.setRotation(this.heading);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(10, this.width / 2 - 10, this.height / 2 - 10);
    this.lane = scene.add.graphics().setDepth(2.6);
    this.on(Phaser.GameObjects.Events.DESTROY, () => this.lane.destroy());
  }

  get contactDamage(): number {
    return this.cycle.phase === 'charge' ? Math.round(this.stats.damage * CHARGE_DAMAGE_MULT) : this.stats.damage;
  }

  get debugPhase(): string {
    return this.cycle.phase;
  }

  /** A bus is built for streets. */
  roadSpeed(onRoad: boolean): number {
    return onRoad ? 1.15 : 0.9;
  }

  private checkLane(): LaneCheck | null {
    const field = this.terrain;
    if (!field) return null;
    return checkLane((x, y) => field.isSolidAt(x, y), this.x, this.y, this.target.x, this.target.y, LANE_LENGTH, LANE_TOLERANCE, 60);
  }

  behavior(time: number, delta: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const toTarget = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y);
    const blocked = body.blocked.left || body.blocked.right || body.blocked.up || body.blocked.down;
    const dist = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y);
    const dt = Math.min(delta, 100) / 1000;
    const mood = this.raging ? 'rage' : 'calm';

    if (!this.raging && this.hp <= this.maxHp * RAGE_AT) {
      this.raging = true;
      this.cycle.setTuning(RAGE);
      this.emit('bossRage', this);
    }

    // It lines up down a street, so it only winds up when the knight is in a usable lane.
    const lane = this.checkLane();
    const changed = this.cycle.update(delta, { inRange: lane ? lane.usable : true, blocked });
    if (changed) this.enter(changed, toTarget, lane);

    this.lane.clear();
    switch (this.cycle.phase) {
      case 'cruise': {
        this.heading = Phaser.Math.Angle.RotateTo(this.heading, toTarget, TURN_RATE[mood] * dt);
        // Close the gap, hold a car-length off (reversing if crowded), and slide sideways until there is a
        // clear street line to the knight: into the lane if off to one side, or a steady way round if
        // something (a tree, a parked car, a wall) is in the way. Never hug the knight.
        const near = dist <= STANDOFF + 10;
        const drive = !near ? 1 : dist < STANDOFF - 10 ? -0.8 : 0;
        let vx = Math.cos(this.heading) * this.stats.speed * drive;
        let vy = Math.sin(this.heading) * this.stats.speed * drive;
        if (near && lane && !lane.usable && lane.along >= MIN_RUN_UP + 20) {
          this.unlinedMs += delta;
          if (this.unlinedMs > 1400) {
            this.alignDir = -this.alignDir; // this way is not getting anywhere: try the other
            this.unlinedMs = 0;
          }
          const perp = lane.angle + Math.PI / 2;
          const dir = lane.across > LANE_TOLERANCE ? Math.sign(lane.side) : this.alignDir;
          vx += Math.cos(perp) * dir * this.stats.speed * 0.9;
          vy += Math.sin(perp) * dir * this.stats.speed * 0.9;
        } else {
          this.unlinedMs = 0;
        }
        // Not making progress toward the knight (pinned on something): strafe sideways for a moment to get free.
        if (!near) {
          this.stuckMs += delta;
          if (this.stuckMs >= 1200) {
            if (Math.hypot(this.x - this.watchX, this.y - this.watchY) < 8) {
              this.unstickMs = 900;
              this.alignDir = -this.alignDir;
            }
            this.watchX = this.x;
            this.watchY = this.y;
            this.stuckMs = 0;
          }
        } else {
          this.stuckMs = 0;
          this.watchX = this.x;
          this.watchY = this.y;
        }
        if (this.unstickMs > 0) {
          this.unstickMs -= delta;
          const side = this.heading + (Math.PI / 2) * this.alignDir;
          vx = Math.cos(side) * this.stats.speed;
          vy = Math.sin(side) * this.stats.speed;
        }
        this.setVelocity(vx, vy);
        break;
      }
      case 'telegraph': {
        this.setVelocity(0, 0);
        if (this.cycle.telegraphLeftMs > COMMIT_MS) {
          if (lane) {
            this.chargeAngle = lane.angle;
            this.laneLen = Math.min(LANE_LENGTH, lane.ray.dist);
            this.laneWall = lane.ray.hitWall;
          } else {
            this.chargeAngle = Phaser.Math.Angle.RotateTo(this.chargeAngle, toTarget, 3 * dt);
          }
        }
        this.heading = Phaser.Math.Angle.RotateTo(this.heading, this.chargeAngle, 4 * dt);
        const shake = Math.floor(time / 55) % 2 === 0 ? 0.025 : -0.025;
        this.setRotation(this.heading + shake);
        drawChargeLane(this.lane, this.x, this.y, this.chargeAngle, this.laneLen, LANE_WIDTH, this.cycle.progress, this.raging ? 0xff6050 : 0xffd030, time, this.laneWall);
        return;
      }
      case 'charge': {
        const speed = this.stats.speed * CHARGE_SPEED_MULT[mood];
        this.setVelocity(Math.cos(this.chargeAngle) * speed, Math.sin(this.chargeAngle) * speed);
        break;
      }
      case 'stall': {
        body.velocity.scale(Math.pow(0.05, dt));
        this.setAlpha(Math.floor(time / 90) % 2 === 0 ? 0.6 : 0.95);
        break;
      }
    }
    this.setRotation(this.heading);
  }

  private enter(phase: ChargePhase, toTarget: number, lane: LaneCheck | null) {
    this.telegraphing = phase === 'telegraph';
    this.chasesAround = phase === 'cruise';
    const crashed = phase === 'stall' && this.cycle.crashed;
    this.damageMultiplier = phase === 'stall' ? (crashed ? CRASH_DAMAGE_MULT : STALL_DAMAGE_MULT) : 1;
    if (crashed) this.emit('crash', this);
    if (phase !== 'stall') this.setAlpha(1);
    if (phase === 'telegraph') {
      this.chargeAngle = lane ? lane.angle : toTarget;
      this.laneLen = lane ? Math.min(LANE_LENGTH, lane.ray.dist) : LANE_LENGTH;
      this.laneWall = lane ? lane.ray.hitWall : false;
      audio.play('honk');
    } else if (phase === 'charge') {
      audio.play('skid');
      this.scene.cameras.main.shake(180, 0.003);
    } else if (phase === 'stall') {
      this.emit('bossStall', this);
    }
  }
}
