import Phaser from 'phaser';
import { Enemy } from './Enemy';
import type { EnemyStats } from '../../config/constants';
import { ChargeCycle, type ChargePhase, type ChargeTuning } from '../../systems/chargeCycle';
import { drawChargeLane } from '../../gfx/lane';
import { audio } from '../../audio/engine';

const CALM: ChargeTuning = { cruiseMs: [2600, 3600], telegraphMs: 1100, chargeMs: 750, stallMs: 1500 };
const RAGE: ChargeTuning = { cruiseMs: [1300, 2000], telegraphMs: 850, chargeMs: 800, stallMs: 1100 };
const CHARGE_SPEED_MULT = { calm: 6, rage: 7.4 };
const CHARGE_DAMAGE_MULT = 1.5;
const LANE_LENGTH = 170;
const LANE_WIDTH = 24;
const TURN_RATE = { calm: 0.9, rage: 1.3 };
const STALL_DAMAGE_MULT = 1.5;
const RAGE_AT = 0.5;
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
  private lane: Phaser.GameObjects.Graphics;
  /** True once the bus has dropped below half health. */
  raging = false;

  constructor(scene: Phaser.Scene, x: number, y: number, stats: EnemyStats, target: Phaser.Physics.Arcade.Sprite) {
    super(scene, x, y, stats, target);
    this.bobs = false;
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

  behavior(time: number, delta: number): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const toTarget = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y);
    const blocked = body.blocked.left || body.blocked.right || body.blocked.up || body.blocked.down;
    const dt = Math.min(delta, 100) / 1000;
    const mood = this.raging ? 'rage' : 'calm';

    if (!this.raging && this.hp <= this.maxHp * RAGE_AT) {
      this.raging = true;
      this.cycle.setTuning(RAGE);
      this.emit('bossRage', this);
    }

    const changed = this.cycle.update(delta, { inRange: true, blocked });
    if (changed) this.enter(changed, toTarget);

    this.lane.clear();
    switch (this.cycle.phase) {
      case 'cruise': {
        this.heading = Phaser.Math.Angle.RotateTo(this.heading, toTarget, TURN_RATE[mood] * dt);
        this.setVelocity(Math.cos(this.heading) * this.stats.speed, Math.sin(this.heading) * this.stats.speed);
        break;
      }
      case 'telegraph': {
        this.setVelocity(0, 0);
        if (this.cycle.telegraphLeftMs > COMMIT_MS) {
          this.chargeAngle = Phaser.Math.Angle.RotateTo(this.chargeAngle, toTarget, 3 * dt);
        }
        this.heading = this.chargeAngle;
        const shake = Math.floor(time / 55) % 2 === 0 ? 0.025 : -0.025;
        this.setRotation(this.heading + shake);
        drawChargeLane(this.lane, this.x, this.y, this.chargeAngle, LANE_LENGTH, LANE_WIDTH, this.cycle.progress, this.raging ? 0xff6050 : 0xffd030, time);
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

  private enter(phase: ChargePhase, toTarget: number) {
    this.telegraphing = phase === 'telegraph';
    this.damageMultiplier = phase === 'stall' ? STALL_DAMAGE_MULT : 1;
    if (phase !== 'stall') this.setAlpha(1);
    if (phase === 'telegraph') {
      this.chargeAngle = toTarget;
      audio.play('honk');
    } else if (phase === 'charge') {
      audio.play('skid');
      this.scene.cameras.main.shake(180, 0.003);
    } else if (phase === 'stall') {
      this.emit('bossStall', this);
    }
  }
}
