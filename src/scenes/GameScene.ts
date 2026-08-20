import Phaser from 'phaser';
import { WORLD, PLAYER_BASE } from '../config/constants';
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
  weatherGlyph?: string;
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

  constructor() {
    super('GameScene');
  }

  create(data: GameSceneData = {}) {
    this.paused = false;
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
    this.cameras.main.setZoom(1.5);

    this.weather = new WeatherDirector(this, data.startFrontIndex ?? 0);

    const uiRoot = document.getElementById('ui')!;
    uiRoot.innerHTML = '';
    this.hud = new HUD(uiRoot);
    this.levelUpSystem = new LevelUpSystem(uiRoot);
    this.hud.setWeatherCondition(data.weatherGlyph ?? '☀', data.weatherLabel ?? 'Unknown skies');

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
    this.handleAttack(time);

    this.hud.update(this.player, this.weather.elapsedSeconds, this.weather.frontName);
    this.hud.setBoss(this.boss?.active ? this.boss.hp : null, this.boss?.maxHp ?? 1);
  }

  // --- WeatherHost ---

  spawnEnemyAroundPlayer(typeKey: string) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Phaser.Math.Between(420, 600);
    const x = Phaser.Math.Clamp(this.player.x + Math.cos(angle) * dist, 40, WORLD.width - 40);
    const y = Phaser.Math.Clamp(this.player.y + Math.sin(angle) * dist, 40, WORLD.height - 40);
    const enemy = createEnemy(this, typeKey, x, y, this.player);
    enemy.once('enemyDied', this.handleEnemyDeath);
    this.enemyGroup.add(enemy);
  }

  spawnBoss() {
    const angle = Math.random() * Math.PI * 2;
    const dist = 550;
    const x = Phaser.Math.Clamp(this.player.x + Math.cos(angle) * dist, 100, WORLD.width - 100);
    const y = Phaser.Math.Clamp(this.player.y + Math.sin(angle) * dist, 100, WORLD.height - 100);
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

  private onProjectileHitEnemy = (projObj: unknown, enemyObj: unknown) => {
    const proj = projObj as Projectile;
    const enemy = enemyObj as Enemy;
    if (!proj.active || !enemy.active || proj.hitSet.has(enemy)) return;
    proj.hitSet.add(enemy);

    enemy.takeDamage(proj.damage);
    if (this.player.powerups.staticCharge > 0) {
      applyStaticChain(
        this,
        enemy,
        Math.round(proj.damage * 0.5),
        this.player.powerups.staticCharge,
        this.getActiveEnemies(),
        () => {}
      );
    }

    proj.pierceLeft -= 1;
    if (proj.pierceLeft < 0) proj.destroy();
  };

  private handleAttack(time: number) {
    if (time - this.player.lastAttackAt < this.player.attackCooldown) return;
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
    proj.damage = this.player.attackDamage;
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
    if (dist < 320 && dist > 50) {
      const angle = Phaser.Math.Angle.Between(this.player.x, this.player.y, this.boss.x, this.boss.y);
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      body.velocity.x += Math.cos(angle) * 40;
      body.velocity.y += Math.sin(angle) * 40;
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

      if (distSq < 22 * 22) {
        this.player.addXp(gem.getData('xp'));
        gem.destroy();
        continue;
      }
      if (distSq < magnetRadiusSq) {
        const dist = Math.sqrt(distSq) || 1;
        body.setVelocity((dx / dist) * 380, (dy / dist) * 380);
      } else {
        body.setVelocity(0, 0);
      }
    }
  }

  // --- level up / end of run ---

  private pauseForLevelUp() {
    this.paused = true;
    this.physics.pause();
    this.levelUpSystem.presentChoices(this.player, () => {
      this.physics.resume();
      this.paused = false;
    });
  }

  private endRun(won: boolean) {
    if (this.paused) return;
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
    for (let i = 0; i < 26; i++) {
      const drop = this.add.image(
        Phaser.Math.Between(0, width),
        Phaser.Math.Between(0, height),
        TEX.projectile
      );
      drop.setScrollFactor(0).setDepth(1).setAlpha(0.3).setScale(0.55).setTint(tint);
      this.ambientDrops.push(drop);
    }
  }

  private updateAmbientWeather(delta: number) {
    const { width, height } = this.scale;
    for (const drop of this.ambientDrops) {
      drop.y += (260 * delta) / 1000;
      if (drop.y > height + 10) {
        drop.y = -10;
        drop.x = Phaser.Math.Between(0, width);
      }
    }
  }
}
