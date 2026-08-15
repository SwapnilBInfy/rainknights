import Phaser from 'phaser';
import { PLAYER_BASE, XP_BASE, XP_GROWTH } from '../config/constants';
import type { CharacterDef } from '../config/characters';

export interface PowerupLevels {
  sunbeam: number;
  rainbowShield: number;
  gale: number;
  frost: number;
  staticCharge: number;
}

export class Player extends Phaser.Physics.Arcade.Sprite {
  hp = PLAYER_BASE.maxHp;
  maxHp = PLAYER_BASE.maxHp;
  baseMoveSpeed = PLAYER_BASE.moveSpeed;
  attackDamage = PLAYER_BASE.attackDamage;
  attackRange = PLAYER_BASE.attackRange;
  attackCooldown = PLAYER_BASE.attackCooldown;
  magnetRadius = PLAYER_BASE.magnetRadius;
  pierce = 0;

  xp = 0;
  level = 1;
  xpToNext = XP_BASE;

  invulnerableUntil = 0;
  lastAttackAt = -Infinity;
  kills = 0;

  powerups: PowerupLevels = { sunbeam: 0, rainbowShield: 0, gale: 0, frost: 0, staticCharge: 0 };
  private nextSunbeamTickAt = 0;
  private nextShieldTriggerAt = 0;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };

  onLevelUp?: () => void;
  onDied?: () => void;

  constructor(scene: Phaser.Scene, x: number, y: number, character: CharacterDef) {
    super(scene, x, y, character.textureKey);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(10);

    this.maxHp = Math.round(PLAYER_BASE.maxHp * character.mods.maxHp);
    this.hp = this.maxHp;
    this.baseMoveSpeed = PLAYER_BASE.moveSpeed * character.mods.moveSpeed;
    this.attackDamage = Math.round(PLAYER_BASE.attackDamage * character.mods.attackDamage);
    this.attackCooldown = Math.round(PLAYER_BASE.attackCooldown * character.mods.attackCooldown);

    const scale = character.displayScale;
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(30 * scale, 10 * scale, 22 * scale);
    body.setCollideWorldBounds(true);

    const keyboard = scene.input.keyboard!;
    this.cursors = keyboard.createCursorKeys();
    this.wasd = {
      up: keyboard.addKey('W'),
      down: keyboard.addKey('S'),
      left: keyboard.addKey('A'),
      right: keyboard.addKey('D'),
    };
  }

  get effectiveMoveSpeed(): number {
    return this.baseMoveSpeed * (1 + 0.2 * this.powerups.gale);
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    this.handleMovement();
    this.handleAuras(time, delta);
  }

  private handleMovement() {
    const left = this.cursors.left?.isDown || this.wasd.left.isDown;
    const right = this.cursors.right?.isDown || this.wasd.right.isDown;
    const up = this.cursors.up?.isDown || this.wasd.up.isDown;
    const down = this.cursors.down?.isDown || this.wasd.down.isDown;

    const dir = new Phaser.Math.Vector2(
      (right ? 1 : 0) - (left ? 1 : 0),
      (down ? 1 : 0) - (up ? 1 : 0)
    );
    if (dir.lengthSq() > 0) {
      dir.normalize();
      if (dir.x !== 0) this.setFlipX(dir.x < 0);
    }
    this.setVelocity(dir.x * this.effectiveMoveSpeed, dir.y * this.effectiveMoveSpeed);
  }

  private handleAuras(time: number, _delta: number) {
    if (this.powerups.sunbeam > 0 && time >= this.nextSunbeamTickAt) {
      this.nextSunbeamTickAt = time + 2000;
      this.heal(2 * this.powerups.sunbeam);
      this.emit('sunbeamPulse', this.sunbeamRadius, 4 * this.powerups.sunbeam);
    }
    if (this.powerups.rainbowShield > 0 && time >= this.nextShieldTriggerAt) {
      this.nextShieldTriggerAt = time + 8000;
      const duration = 1000 + 200 * this.powerups.rainbowShield;
      this.invulnerableUntil = Math.max(this.invulnerableUntil, time + duration);
      this.emit('shieldActivated', duration);
    }
  }

  get sunbeamRadius(): number {
    return 60 + 20 * this.powerups.sunbeam;
  }

  get frostRadius(): number {
    return this.powerups.frost > 0 ? 50 + 15 * this.powerups.frost : 0;
  }

  heal(amount: number) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  isInvulnerable(time: number): boolean {
    return time < this.invulnerableUntil;
  }

  takeDamage(amount: number, time: number) {
    if (this.isInvulnerable(time) || this.hp <= 0) return;
    this.hp -= amount;
    this.invulnerableUntil = time + 500;
    this.setTintFill(0xff4040);
    this.scene.time.delayedCall(120, () => {
      if (this.active) this.clearTint();
    });
    if (this.hp <= 0) {
      this.hp = 0;
      this.onDied?.();
    }
  }

  addXp(amount: number) {
    this.xp += amount;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      this.xpToNext = XP_BASE + this.level * XP_GROWTH;
      this.onLevelUp?.();
    }
  }
}
