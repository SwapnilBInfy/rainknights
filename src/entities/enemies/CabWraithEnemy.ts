import Phaser from 'phaser';
import { Enemy } from './Enemy';
import type { EnemyStats } from '../../config/constants';
import { ChargeCycle, type ChargePhase, type ChargeTuning } from '../../systems/chargeCycle';
import { drawChargeLane } from '../../gfx/lane';
import { audio } from '../../audio/engine';

const TUNING: ChargeTuning = { cruiseMs: [1400, 2600], telegraphMs: 800, chargeMs: 550, stallMs: 900 };
const CHARGE_SPEED_MULT = 4.2;
const CHARGE_DAMAGE_MULT = 1.6;
const LANE_LENGTH = 130;
const LANE_WIDTH = 14;
const WIND_UP_RANGE = 170;
const TURN_RATE = 2.4; // rad/s while cruising
const STALL_DAMAGE_MULT = 1.5;

/**
 * New York's signature enemy. A ghost taxi that cruises at you, stops and
 * honks while a lane shows where it will go, charges down that lane, then
 * stalls with its engine cut out, which is the moment to hit it.
 */
export class CabWraithEnemy extends Enemy {
  private cycle = new ChargeCycle(TUNING);
  private heading: number;
  private chargeAngle = 0;
  private lane: Phaser.GameObjects.Graphics;
  /** A charge may turn the last bit of its aim until it commits, a fair moment before it goes. */
  private static readonly COMMIT_MS = 250;

  constructor(scene: Phaser.Scene, x: number, y: number, stats: EnemyStats, target: Phaser.Physics.Arcade.Sprite) {
    super(scene, x, y, stats, target);
    this.bobs = false;
    this.chasesAround = false;
    this.heading = Phaser.Math.Angle.Between(x, y, target.x, target.y);
    this.setRotation(this.heading);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(6, this.width / 2 - 6, this.height / 2 - 6);
    this.lane = scene.add.graphics().setDepth(2.6);
    this.on(Phaser.GameObjects.Events.DESTROY, () => this.lane.destroy());
  }

  get contactDamage(): number {
    return this.cycle.phase === 'charge' ? Math.round(this.stats.damage * CHARGE_DAMAGE_MULT) : this.stats.damage;
  }

  get debugPhase(): string {
    return this.cycle.phase;
  }

  behavior(time: number, delta: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const toTarget = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y);
    const dist = Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y);
    const blocked = body.blocked.left || body.blocked.right || body.blocked.up || body.blocked.down;
    const dt = Math.min(delta, 100) / 1000;

    const changed = this.cycle.update(delta, { inRange: dist < WIND_UP_RANGE, blocked });
    if (changed) this.enter(changed, toTarget);

    this.lane.clear();
    switch (this.cycle.phase) {
      case 'cruise': {
        this.heading = Phaser.Math.Angle.RotateTo(this.heading, toTarget, TURN_RATE * dt);
        this.setVelocity(Math.cos(this.heading) * this.stats.speed, Math.sin(this.heading) * this.stats.speed);
        break;
      }
      case 'telegraph': {
        this.setVelocity(0, 0);
        if (this.cycle.telegraphLeftMs > CabWraithEnemy.COMMIT_MS) {
          this.chargeAngle = Phaser.Math.Angle.RotateTo(this.chargeAngle, toTarget, 5 * dt);
        }
        this.heading = this.chargeAngle;
        const shake = Math.floor(time / 50) % 2 === 0 ? 0.04 : -0.04; // engine revving
        this.setRotation(this.heading + shake);
        drawChargeLane(this.lane, this.x, this.y, this.chargeAngle, LANE_LENGTH, LANE_WIDTH, this.cycle.progress, 0xffd030, time);
        return;
      }
      case 'charge': {
        const speed = this.stats.speed * CHARGE_SPEED_MULT;
        this.setVelocity(Math.cos(this.chargeAngle) * speed, Math.sin(this.chargeAngle) * speed);
        break;
      }
      case 'stall': {
        body.velocity.scale(Math.pow(0.04, dt)); // skids to a stop
        this.setAlpha(Math.floor(time / 90) % 2 === 0 ? 0.55 : 0.95); // a dying engine flickers
        break;
      }
    }
    this.setRotation(this.heading);
  }

  private enter(phase: ChargePhase, toTarget: number) {
    this.telegraphing = phase === 'telegraph';
    this.damageMultiplier = phase === 'stall' ? STALL_DAMAGE_MULT : 1;
    if (phase !== 'stall') this.setAlpha(1);
    if (phase === 'telegraph') {
      this.chargeAngle = toTarget;
      audio.play('honk');
    } else if (phase === 'charge') {
      audio.play('skid');
    }
  }
}
