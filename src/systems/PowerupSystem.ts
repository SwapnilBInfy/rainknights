import Phaser from 'phaser';
import type { Player } from '../entities/Player';
import type { Enemy } from '../entities/enemies/Enemy';

/** Frost Aura: continuously dampens velocity of enemies near the player. */
export function applyFrostAura(player: Player, enemies: Enemy[]) {
  const radius = player.frostRadius;
  if (radius <= 0) return;
  const slowFactor = 1 - Math.min(0.7, 0.2 + 0.12 * player.powerups.frost);
  for (const enemy of enemies) {
    if (!enemy.active) continue;
    const dist = Phaser.Math.Distance.Between(player.x, player.y, enemy.x, enemy.y);
    if (dist <= radius) {
      const body = enemy.body as Phaser.Physics.Arcade.Body;
      body.velocity.scale(slowFactor);
    }
  }
}

/** Sunbeam: one-off radial damage pulse around the player. */
export function applySunbeamPulse(
  scene: Phaser.Scene,
  player: Player,
  radius: number,
  damage: number,
  enemies: Enemy[],
  onDamage: (enemy: Enemy) => void
) {
  const ring = scene.add.circle(player.x, player.y, radius, 0xffb020, 0.18).setDepth(4);
  scene.tweens.add({
    targets: ring,
    alpha: 0,
    scale: 1.2,
    duration: 350,
    onComplete: () => ring.destroy(),
  });
  for (const enemy of enemies) {
    if (!enemy.active) continue;
    const dist = Phaser.Math.Distance.Between(player.x, player.y, enemy.x, enemy.y);
    if (dist <= radius) {
      enemy.takeDamage(damage);
      onDamage(enemy);
    }
  }
}

/** Static Charge: chains a fraction of hit damage to nearby enemies. */
export function applyStaticChain(
  scene: Phaser.Scene,
  origin: Enemy,
  damage: number,
  chainCount: number,
  enemies: Enemy[],
  onDamage: (enemy: Enemy) => void
) {
  const candidates = enemies
    .filter((e) => e.active && e !== origin)
    .map((e) => ({ e, dist: Phaser.Math.Distance.Between(origin.x, origin.y, e.x, e.y) }))
    .filter((c) => c.dist <= 140)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, chainCount);

  let from = origin;
  for (const { e } of candidates) {
    const line = scene.add.line(0, 0, from.x, from.y, e.x, e.y, 0xfff066, 0.9).setLineWidth(2).setDepth(6);
    scene.tweens.add({ targets: line, alpha: 0, duration: 150, onComplete: () => line.destroy() });
    e.takeDamage(damage);
    onDamage(e);
    from = e;
  }
}
