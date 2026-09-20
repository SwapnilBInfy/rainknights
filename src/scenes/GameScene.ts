import Phaser from 'phaser';
import { WORLD, PLAYER_BASE, AUTO_ATTACK } from '../config/constants';
import { MELEE, BEAM } from '../config/weapons';
import { beamKey, SPARK_KEY } from '../gfx/weapons';
import { TEX } from '../gfx/spriteDefs';
import { getCharacter } from '../config/characters';
import { getRegion } from '../config/regions';
import { Player } from '../entities/Player';
import { Projectile } from '../entities/Projectile';
import type { Enemy } from '../entities/enemies/Enemy';
import type { TornadoBoss } from '../entities/enemies/TornadoBoss';
import { createEnemy } from '../entities/enemies/factory';
import { WeatherDirector, type WeatherHost } from '../systems/WeatherDirector';
import { LevelUpSystem } from '../systems/LevelUpSystem';
import { applyFrostAura, applySunbeamPulse, applyStaticChain } from '../systems/PowerupSystem';
import { buildTerrain, type TerrainResult } from '../systems/Terrain';
import { HUD } from '../ui/HUD';

interface GameSceneData {
  characterId?: string;
  regionId?: string;
  startFrontIndex?: number;
  weatherLabel?: string;
  weatherCondition?: string;
  weatherTint?: number;
}

export class GameScene extends Phaser.Scene implements WeatherHost {
  player!: Player;
  private enemyGroup!: Phaser.Physics.Arcade.Group;
  private projectileGroup!: Phaser.Physics.Arcade.Group;
  private gemGroup!: Phaser.Physics.Arcade.Group;
  private weather!: WeatherDirector;
  private hud!: HUD;
  private levelUpSystem!: LevelUpSystem;
  private boss: TornadoBoss | null = null;
  private bossSummonEvent: Phaser.Time.TimerEvent | null = null;
  private paused = false;
  private ambientDrops: Phaser.GameObjects.Image[] = [];
  private terrain!: TerrainResult;
  private lastFrontIndex = 0;
  private pendingLevelUps = 0;
  private ended = false;

  constructor() {
    super('GameScene');
  }

  create(data: GameSceneData = {}) {
    this.paused = false;
    this.pendingLevelUps = 0;
    this.ended = false;
    this.boss = null;
    this.bossSummonEvent = null;

    const character = getCharacter(data.characterId);
    const region = getRegion(data.regionId);

    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
    this.terrain = buildTerrain(this, region);

    this.player = new Player(this, WORLD.width / 2, WORLD.height / 2, character);
    this.player.onDied = () => this.endRun(false);
    this.player.onLevelUp = () => this.pauseForLevelUp();
    this.player.on('sunbeamPulse', (radius: number, damage: number) => {
      applySunbeamPulse(this, this.player, radius, damage, this.getActiveEnemies(), () => {});
    });
    this.player.on('shieldActivated', (duration: number) => {
      this.player.setAlpha(0.55);
      this.time.delayedCall(duration, () => {
        if (this.player.active) this.player.setAlpha(1);
      });
    });

    this.enemyGroup = this.physics.add.group();
    this.projectileGroup = this.physics.add.group();
    this.gemGroup = this.physics.add.group();

    this.physics.add.overlap(this.player, this.enemyGroup, this.onPlayerHitEnemy as any, undefined, this);
    this.physics.add.overlap(
      this.projectileGroup,
      this.enemyGroup,
      this.onProjectileHitEnemy as any,
      undefined,
      this
    );
    this.physics.add.collider(this.player, this.terrain.layer);
    this.physics.add.collider(this.enemyGroup, this.terrain.layer);

    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.startFollow(this.player, true, 0.12, 0.12);
    this.cameras.main.setZoom(1);

    this.weather = new WeatherDirector(this, data.startFrontIndex ?? 0);

    this.hud = new HUD(this);
    this.levelUpSystem = new LevelUpSystem(this);
    this.hud.setWeatherCondition(data.weatherCondition ?? 'clear', data.weatherLabel ?? 'Clear');
    this.lastFrontIndex = this.weather.currentFrontIndex;
    this.time.delayedCall(3000, () => {
      if (!this.ended && !this.paused) this.hud.showMessage('SPACE: swing weapon\nJ or X: energy beam');
    });
    this.hud.showMessage(`${region.name}: ${data.weatherLabel ?? 'unknown'}.\nThe ${this.weather.frontName} begins!`);

    this.setupAmbientWeather(data.weatherTint ?? 0x8fe0ff);

    this.events.once('shutdown', () => {
      this.hud.destroy();
      this.levelUpSystem.close();
    });
  }

  update(time: number, delta: number) {
    if (this.paused) return;

    this.weather.update(delta);
    this.updateAmbientWeather(delta);
    this.updateGems();
    applyFrostAura(this.player, this.getActiveEnemies());
    this.updatePull();
    this.handleManualAttacks(time);
    this.handleAttack(time);

    this.hud.update(this.player, this.weather.elapsedSeconds, this.weather.frontName, delta, this.player.beamCharge(time));
    this.hud.setBoss(this.boss?.active ? this.boss.hp : null, this.boss?.maxHp ?? 1);
    if (this.weather.currentFrontIndex !== this.lastFrontIndex) {
      this.lastFrontIndex = this.weather.currentFrontIndex;
      this.hud.showMessage(`The ${this.weather.frontName} is rolling in!`);
    }
  }

  // --- WeatherHost ---

  spawnEnemyAroundPlayer(typeKey: string) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Phaser.Math.Between(130, 180);
    const x = Phaser.Math.Clamp(this.player.x + Math.cos(angle) * dist, 20, WORLD.width - 20);
    const y = Phaser.Math.Clamp(this.player.y + Math.sin(angle) * dist, 20, WORLD.height - 20);
    const enemy = createEnemy(this, typeKey, x, y, this.player);
    enemy.once('enemyDied', this.handleEnemyDeath);
    this.enemyGroup.add(enemy);
  }

  spawnBoss() {
    const angle = Math.random() * Math.PI * 2;
    const dist = 170;
    const x = Phaser.Math.Clamp(this.player.x + Math.cos(angle) * dist, 50, WORLD.width - 50);
    const y = Phaser.Math.Clamp(this.player.y + Math.sin(angle) * dist, 50, WORLD.height - 50);
    const boss = createEnemy(this, 'tornadoBoss', x, y, this.player) as TornadoBoss;
    boss.once('enemyDied', this.handleEnemyDeath);
    this.enemyGroup.add(boss);
    this.boss = boss;

    this.bossSummonEvent = this.time.addEvent({
      delay: 6000,
      loop: true,
      callback: () => {
        if (!this.boss?.active) return;
        this.spawnEnemyAroundPlayer(Phaser.Utils.Array.GetRandom(['hailBrute', 'lightningWisp']));
        this.spawnEnemyAroundPlayer(Phaser.Utils.Array.GetRandom(['hailBrute', 'lightningWisp']));
      },
    });
  }

  // --- combat ---

  private handleEnemyDeath = (enemy: Enemy) => {
    this.player.kills += 1;
    this.spawnXpGem(enemy.x, enemy.y, enemy.stats.xp);
    if (enemy === this.boss) {
      this.boss = null;
      this.bossSummonEvent?.remove(false);
      this.bossSummonEvent = null;
      this.time.delayedCall(300, () => this.endRun(true));
    }
  };

  private onPlayerHitEnemy = (_playerObj: unknown, enemyObj: unknown) => {
    const enemy = enemyObj as Enemy;
    if (!enemy.active) return;
    this.player.takeDamage(enemy.stats.damage, this.time.now);
  };

  /** Damage from any source; also feeds Static Charge chaining. */
  private damageEnemy(enemy: Enemy, damage: number) {
    enemy.takeDamage(damage);
    if (this.player.powerups.staticCharge > 0) {
      applyStaticChain(
        this,
        enemy,
        Math.round(damage * 0.5),
        this.player.powerups.staticCharge,
        this.getActiveEnemies(),
        () => {}
      );
    }
  }

  private onProjectileHitEnemy = (projObj: unknown, enemyObj: unknown) => {
    const proj = projObj as Projectile;
    const enemy = enemyObj as Enemy;
    if (!proj.active || !enemy.active || proj.hitSet.has(enemy)) return;
    proj.hitSet.add(enemy);

    this.damageEnemy(enemy, proj.damage);

    proj.pierceLeft -= 1;
    if (proj.pierceLeft < 0) proj.destroy();
  };

  /** Automatic Storm Bolt — a weaker backup to the manual swing and beam. */
  private handleAttack(time: number) {
    if (time - this.player.lastAttackAt < this.player.attackCooldown * AUTO_ATTACK.cooldownMult) return;
    const target = this.findNearestEnemy(this.player.attackRange);
    if (!target) return;
    this.player.lastAttackAt = time;
    this.fireProjectile(target);
  }

  private fireProjectile(target: Enemy) {
    const proj = new Projectile(this, this.player.x, this.player.y, TEX.projectile);
    this.add.existing(proj);
    this.physics.add.existing(proj);
    proj.setDepth(6);
    proj.damage = Math.max(1, Math.round(this.player.attackDamage * AUTO_ATTACK.damageMult));
    proj.pierceLeft = this.player.pierce;

    const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, target.x, target.y);
    const body = proj.body as Phaser.Physics.Arcade.Body;
    this.physics.velocityFromRotation(angle, PLAYER_BASE.projectileSpeed, body.velocity);
    proj.setRotation(angle);

    this.projectileGroup.add(proj);
    this.time.delayedCall(1000, () => {
      if (proj.active) proj.destroy();
    });
  }

  // --- manual attacks: Space swings the weapon, J / X fires the energy beam ---

  private handleManualAttacks(time: number) {
    // Upgrades and character speed that shorten the auto cooldown speed these up too.
    const ratio = this.player.attackCooldown / PLAYER_BASE.attackCooldown;
    if (this.player.wantsSwing && time >= this.player.meleeReadyAt) this.swingWeapon(time, ratio);
    if (this.player.wantsBeam && time >= this.player.beamReadyAt) this.fireBeam(time, ratio);
  }

  private hitSpark(x: number, y: number) {
    const spark = this.add.image(x, y, SPARK_KEY).setDepth(13);
    this.tweens.add({ targets: spark, scale: 1.8, alpha: 0, duration: 140, onComplete: () => spark.destroy() });
  }

  private swingWeapon(time: number, ratio: number) {
    const p = this.player;
    const stats = MELEE[p.weaponType];
    p.meleeReadyAt = time + stats.cooldownMs * ratio;
    p.playAttackSwing(time, p.x + p.aim.x * 30, p.y + p.aim.y * 30);

    const cosHalf = Math.cos(Phaser.Math.DegToRad(stats.arcDeg / 2));
    const damage = Math.round(p.attackDamage * stats.damageMult);
    for (const enemy of this.getActiveEnemies()) {
      const dx = enemy.x - p.x;
      const dy = enemy.y - p.y;
      const dist = Math.hypot(dx, dy);
      const radius = (enemy.body as Phaser.Physics.Arcade.Body).halfWidth;
      if (dist > stats.reach + radius) continue;
      const cos = dist > 0.001 ? (dx * p.aim.x + dy * p.aim.y) / dist : 1;
      if (dist > radius + 6 && cos < cosHalf) continue; // point-blank enemies are always hit

      this.damageEnemy(enemy, damage);
      if (enemy.active && dist > 0.001) {
        const shove = enemy === this.boss ? stats.knockback * 0.25 : stats.knockback;
        enemy.x += (dx / dist) * shove;
        enemy.y += (dy / dist) * shove;
      }
      this.hitSpark(enemy.x, enemy.y);
    }
    if (p.weaponType === 'hammer') this.cameras.main.shake(90, 0.002);
  }

  private fireBeam(time: number, ratio: number) {
    const p = this.player;
    const stats = BEAM[p.weaponType];
    p.startBeamCooldown(time, stats.cooldownMs * ratio);
    p.playCast(time);

    const len = p.attackRange * 0.95;
    const ox = p.x + p.aim.x * 8;
    const oy = p.y + p.aim.y * 8 + 2;
    const abx = p.aim.x * len;
    const aby = p.aim.y * len;
    const ex = ox + abx;
    const ey = oy + aby;

    const damage = Math.round(p.attackDamage * stats.damageMult);
    for (const enemy of this.getActiveEnemies()) {
      const t = Phaser.Math.Clamp(((enemy.x - ox) * abx + (enemy.y - oy) * aby) / (len * len), 0, 1);
      const dist = Math.hypot(enemy.x - (ox + abx * t), enemy.y - (oy + aby * t));
      const radius = (enemy.body as Phaser.Physics.Arcade.Body).halfWidth;
      if (dist > stats.halfWidth + radius) continue;
      this.damageEnemy(enemy, damage); // the beam pierces everything in line
      this.hitSpark(enemy.x, enemy.y);
    }

    const beam = this.add
      .image(ox, oy, beamKey(p.weaponType))
      .setOrigin(0, 0.5)
      .setRotation(Math.atan2(p.aim.y, p.aim.x))
      .setDisplaySize(len, stats.halfWidth * 2 + 1)
      .setDepth(12);
    this.tweens.add({
      targets: beam,
      scaleY: beam.scaleY * 0.25,
      alpha: 0,
      duration: 240,
      onComplete: () => beam.destroy(),
    });
    this.hitSpark(ox, oy);
    this.hitSpark(ex, ey);
    this.cameras.main.shake(70, 0.0015);
  }

  private findNearestEnemy(range: number): Enemy | null {
    let nearest: Enemy | null = null;
    let nearestDist = range;
    for (const enemy of this.getActiveEnemies()) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y);
      if (dist <= nearestDist) {
        nearest = enemy;
        nearestDist = dist;
      }
    }
    return nearest;
  }

  private getActiveEnemies(): Enemy[] {
    return this.enemyGroup.getChildren().filter((e) => e.active) as Enemy[];
  }

  private updatePull() {
    if (!this.boss || !this.boss.active) return;
    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, this.boss.x, this.boss.y);
    if (dist < 140 && dist > 25) {
      const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, this.boss.x, this.boss.y);
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      body.velocity.x += Math.cos(angle) * 20;
      body.velocity.y += Math.sin(angle) * 20;
    }
  }

  // --- xp gems ---

  private spawnXpGem(x: number, y: number, value: number) {
    const gem = this.physics.add.sprite(x, y, TEX.xpGem).setDepth(3);
    gem.setData('xp', value);
    this.gemGroup.add(gem);
  }

  private updateGems() {
    const magnetRadiusSq = this.player.magnetRadius * this.player.magnetRadius;
    for (const child of this.gemGroup.getChildren()) {
      const gem = child as Phaser.Physics.Arcade.Sprite;
      if (!gem.active) continue;
      const dx = this.player.x - gem.x;
      const dy = this.player.y - gem.y;
      const distSq = dx * dx + dy * dy;
      const body = gem.body as Phaser.Physics.Arcade.Body;

      if (distSq < 11 * 11) {
        this.player.addXp(gem.getData('xp'));
        gem.destroy();
        continue;
      }
      if (distSq < magnetRadiusSq) {
        const dist = Math.sqrt(distSq) || 1;
        body.setVelocity((dx / dist) * 190, (dy / dist) * 190);
      } else {
        body.setVelocity(0, 0);
      }
    }
  }

  // --- level up / end of run ---

  private pauseForLevelUp() {
    this.pendingLevelUps += 1;
    if (this.paused) return; // a menu is already open — this level is queued behind it
    this.showLevelUpMenu();
  }

  private showLevelUpMenu() {
    this.paused = true;
    this.physics.pause();
    this.hud.setVisible(false);
    // If several levels were gained at once, show each level's menu in turn.
    const level = this.player.level - (this.pendingLevelUps - 1);
    this.levelUpSystem.presentChoices(this.player, level, () => {
      this.pendingLevelUps -= 1;
      if (this.pendingLevelUps > 0) return this.showLevelUpMenu();
      this.hud.setVisible(true);
      this.physics.resume();
      this.paused = false;
    });
  }

  private endRun(won: boolean) {
    if (this.ended) return; // (a level-up menu being open must not block the ending)
    this.ended = true;
    this.levelUpSystem.close();
    this.paused = true;
    this.physics.pause();
    this.bossSummonEvent?.remove(false);
    const data = {
      won,
      time: this.weather.elapsedSeconds,
      kills: this.player.kills,
      level: this.player.level,
    };
    this.time.delayedCall(400, () => this.scene.start('GameOverScene', data));
  }

  // --- ambient weather ---

  private setupAmbientWeather(tint: number) {
    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, tint, 0.08)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(0.5);

    const { width, height } = this.scale;
    for (let i = 0; i < 22; i++) {
      const drop = this.add.image(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        TEX.rain
      );
      drop.setScrollFactor(0).setDepth(1).setAlpha(0.65).setTint(tint);
      this.ambientDrops.push(drop);
    }
  }

  private updateAmbientWeather(delta: number) {
    const { width, height } = this.scale;
    for (const drop of this.ambientDrops) {
      drop.y += (110 * delta) / 1000;
      drop.x -= (40 * delta) / 1000;
      if (drop.y > height + 6 || drop.x < -4) {
        drop.y = -6;
        drop.x = Phaser.Math.Between(0, width + 40);
      }
    }
  }
}
