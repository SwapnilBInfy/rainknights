import Phaser from 'phaser';
import { PLAYER_BASE, XP_BASE, XP_GROWTH } from '../config/constants';
import type { CharacterDef } from '../config/characters';
import { chibiKey, type Facing } from '../gfx/chibi';
import { weaponKey, SLASH_KEY } from '../gfx/weapons';

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

  private characterId: string;
  private facing: Facing = 'down';
  private weapon: Phaser.GameObjects.Image;
  private attackSwingUntil = 0;

  onLevelUp?: () => void;
  onDied?: () => void;

  constructor(scene: Phaser.Scene, x: number, y: number, character: CharacterDef) {
    super(scene, x, y, chibiKey(character.id, 'down', 'stand'));
    this.characterId = character.id;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(10);

    this.weapon = scene.add.image(x, y, weaponKey(character.style.weapon)).setOrigin(0.5, 1).setDepth(11);
    this.on(Phaser.GameObjects.Events.DESTROY, () => this.weapon.destroy());

    this.maxHp = Math.round(PLAYER_BASE.maxHp * character.mods.maxHp);
    this.hp = this.maxHp;
    this.baseMoveSpeed = PLAYER_BASE.moveSpeed * character.mods.moveSpeed;
    this.attackDamage = Math.round(PLAYER_BASE.attackDamage * character.mods.attackDamage);
    this.attackCooldown = Math.round(PLAYER_BASE.attackCooldown * character.mods.attackCooldown);

    // Small circle around the feet, like a GBA tile-sized footprint.
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setCircle(5, 3, 13);
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
    this.handleMovement(time);
    this.handleAuras(time, delta);
    this.updateWeaponRest();
  }

  private facingFor(dx: number, dy: number): { facing: Facing; flip: boolean } {
    if (Math.abs(dx) >= Math.abs(dy)) return { facing: 'side', flip: dx < 0 };
    return { facing: dy > 0 ? 'down' : 'up', flip: false };
  }

  private face(dx: number, dy: number) {
    const { facing, flip } = this.facingFor(dx, dy);
    this.facing = facing;
    this.setFlipX(flip);
  }

  /** Keeps the held weapon at the knight's hand while it isn't mid-swing. */
  private updateWeaponRest() {
    const flip = this.flipX ? -1 : 1;
    const hand = { down: { x: -5, y: 4, rot: -0.4 }, up: { x: 5, y: 3, rot: 0.4 }, side: { x: 5 * flip, y: 4, rot: 0.5 * flip } }[
      this.facing
    ];
    this.weapon.setPosition(this.x + hand.x, this.y + hand.y);
    this.weapon.setDepth(this.facing === 'up' ? 9 : 11);
    if (!this.scene.tweens.isTweening(this.weapon)) this.weapon.setRotation(hand.rot);
  }

  /** Faces the target, shows the attack pose and swings the weapon through an arc. */
  playAttackSwing(time: number, targetX: number, targetY: number) {
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    this.face(dx, dy);
    this.attackSwingUntil = time + 200;
    this.anims.stop();
    this.setTexture(chibiKey(this.characterId, this.facing, 'attack'));

    const angle = Math.atan2(dy, dx) + Math.PI / 2; // weapon sprites point up at rotation 0
    this.scene.tweens.killTweensOf(this.weapon);
    this.weapon.setRotation(angle - 1.3);
    this.scene.tweens.add({ targets: this.weapon, rotation: angle + 1.3, duration: 150, ease: 'Sine.easeInOut' });

    const fx = this.scene.add
      .image(this.weapon.x, this.weapon.y, SLASH_KEY)
      .setOrigin(0.5, 1)
      .setRotation(angle)
      .setDepth(12);
    this.scene.tweens.add({
      targets: fx,
      alpha: 0,
      scale: 1.25,
      duration: 160,
      onComplete: () => fx.destroy(),
    });
  }

  private handleMovement(time: number) {
    const left = this.cursors.left?.isDown || this.wasd.left.isDown;
    const right = this.cursors.right?.isDown || this.wasd.right.isDown;
    const up = this.cursors.up?.isDown || this.wasd.up.isDown;
    const down = this.cursors.down?.isDown || this.wasd.down.isDown;

    const dir = new Phaser.Math.Vector2(
      (right ? 1 : 0) - (left ? 1 : 0),
      (down ? 1 : 0) - (up ? 1 : 0)
    );
    const moving = dir.lengthSq() > 0;
    if (moving) {
      dir.normalize();
      if (time >= this.attackSwingUntil) this.face(dir.x, dir.y);
    }
    this.setVelocity(dir.x * this.effectiveMoveSpeed, dir.y * this.effectiveMoveSpeed);
    this.updateWalkAnimation(moving, time);
  }

  private updateWalkAnimation(moving: boolean, time: number) {
    if (time < this.attackSwingUntil) return; // let the attack pose finish showing first

    const standKey = chibiKey(this.characterId, this.facing, 'stand');
    if (moving) {
      // "Running" is a faster playback of the same walk cycle while Gale
      // Force is active, rather than separate sprint frames.
      const frameRate = this.powerups.gale > 0 ? 12 : 8;
      const animKey = `walk_${this.characterId}_${this.facing}`;
      if (!this.anims.isPlaying || this.anims.currentAnim?.key !== animKey) {
        this.play({ key: animKey, frameRate });
      } else {
        this.anims.msPerFrame = 1000 / frameRate;
      }
    } else if (this.anims.isPlaying || this.texture.key !== standKey) {
      this.anims.stop();
      this.setTexture(standKey);
    }
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
    return 30 + 10 * this.powerups.sunbeam;
  }

  get frostRadius(): number {
    return this.powerups.frost > 0 ? 25 + 8 * this.powerups.frost : 0;
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
