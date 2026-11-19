import Phaser from 'phaser';
import { PLAYER_BASE, XP_BASE, XP_GROWTH } from '../config/constants';
import type { CharacterDef } from '../config/characters';
import { chibiKey, type Facing, type WeaponType } from '../gfx/chibi';
import { weaponKey, SLASH_KEY } from '../gfx/weapons';
import { audio } from '../audio/engine';
import { STATUS_TUNING, StatusSet, type ApplyResult, type StatusId } from '../systems/status';
import { DodgeRoll, ROLL } from '../systems/dodgeRoll';
import type { PlayerSnapshot } from '../save/save';

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
  private hurtFlashMs = 0;
  private tintKey = '';
  /** Wet / burning / chilled / frozen / shocked. Frozen holds you still for a moment; shock only slows. */
  readonly statuses = new StatusSet({ frozenMs: STATUS_TUNING.frozenPlayerMs, shockStuns: false });
  private castUntil = 0;
  private castAngle = 0;

  /** Dodge roll: a short, untouchable dash. Shift or K on a keyboard, R on the touch cluster. */
  readonly roll = new DodgeRoll();
  private rollPressedAt = -Infinity;
  private rolling = false;
  private nextGhostAt = 0;
  private lastDodgeAt = -Infinity;
  /** Hits avoided by rolling (for the debug bridge and tests). */
  dodgeCount = 0;
  /** Set by the scene from the tile underfoot: wading slows (< 1), ice makes you slide (grip < 1). */
  terrainSpeed = 1;
  grip = 1;
  private frameDelta = 16;

  readonly weaponType: WeaponType;
  /** Direction of the last movement (8-way); melee and beam go this way. */
  readonly aim = new Phaser.Math.Vector2(0, 1);
  meleeReadyAt = 0;
  beamReadyAt = 0;
  private beamCooldownMs = 1;
  private swingKey!: Phaser.Input.Keyboard.Key;
  private beamKeys!: Phaser.Input.Keyboard.Key[];
  // A tap shorter than one frame would be missed by polling isDown, so a
  // press also "latches" for a moment.
  private swingPressedAt = -Infinity;
  private beamPressedAt = -Infinity;

  onLevelUp?: () => void;
  onDied?: () => void;

  constructor(scene: Phaser.Scene, x: number, y: number, character: CharacterDef) {
    super(scene, x, y, chibiKey(character.id, 'down', 'stand'));
    this.characterId = character.id;
    this.weaponType = character.style.weapon;

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
    this.swingKey = keyboard.addKey('SPACE');
    this.beamKeys = [keyboard.addKey('J'), keyboard.addKey('X')];
    keyboard.on('keydown-SPACE', () => (this.swingPressedAt = scene.time.now));
    keyboard.on('keydown-J', () => (this.beamPressedAt = scene.time.now));
    keyboard.on('keydown-X', () => (this.beamPressedAt = scene.time.now));
    keyboard.addKey('SHIFT'); // registered so the browser does not act on the keys
    keyboard.addKey('K');
    keyboard.on('keydown-SHIFT', () => (this.rollPressedAt = scene.time.now));
    keyboard.on('keydown-K', () => (this.rollPressedAt = scene.time.now));
  }

  /** Turn to face a direction without moving (the tutorial points the knight at its targets). */
  faceToward(dx: number, dy: number) {
    if (Math.hypot(dx, dy) < 0.001) return;
    this.aim.set(dx, dy).normalize();
    this.face(this.aim.x, this.aim.y);
    this.setTexture(chibiKey(this.characterId, this.facing, 'stand'));
  }

  /** True from the start of a roll until it ends: no swinging or firing meanwhile. */
  get isRolling(): boolean {
    return this.rolling;
  }

  /** 0..1 recharge of the dodge roll, for the HUD gauge. */
  rollCharge(time: number): number {
    return this.roll.charge(time);
  }

  /** Space held: swing the held weapon. */
  get wantsSwing(): boolean {
    return this.swingKey.isDown || this.scene.time.now - this.swingPressedAt < 150;
  }

  /** J or X held: fire the energy beam. */
  get wantsBeam(): boolean {
    return this.beamKeys.some((k) => k.isDown) || this.scene.time.now - this.beamPressedAt < 150;
  }

  /** 0..1 recharge of the beam, for the HUD gauge. */
  beamCharge(time: number): number {
    return Phaser.Math.Clamp(1 - (this.beamReadyAt - time) / this.beamCooldownMs, 0, 1);
  }

  startBeamCooldown(time: number, ms: number) {
    this.beamCooldownMs = ms;
    this.beamReadyAt = time + ms;
  }

  /** Battle-only speed buff from Storm Tea. Not written into the checkpoint. */
  private hasteUntil = 0;

  get effectiveMoveSpeed(): number {
    const haste = this.scene.time.now < this.hasteUntil ? 1.15 : 1;
    return this.baseMoveSpeed * (1 + 0.2 * this.powerups.gale) * this.statuses.speedMult * this.terrainSpeed * haste;
  }

  /** Armor and the HP you left Mistford with. A continued run uses the checkpoint instead. */
  applyBattleGear(stats: { hp: number; maxHp: number; baseMoveSpeed: number; attackDamage: number }) {
    this.maxHp = stats.maxHp;
    this.hp = Math.max(1, Math.min(stats.maxHp, stats.hp));
    this.baseMoveSpeed = stats.baseMoveSpeed;
    this.attackDamage = stats.attackDamage;
  }

  applyHaste(ms: number) {
    this.hasteUntil = this.scene.time.now + ms;
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    this.frameDelta = delta;
    const { burnTicks } = this.statuses.update(delta);
    for (let i = 0; i < burnTicks; i++) this.takeStatusDamage(1, time);
    this.hurtFlashMs = Math.max(0, this.hurtFlashMs - delta);
    this.tryStartRoll(time);
    this.handleMovement(time);
    this.handleAuras(time, delta);
    this.updateWeaponRest(time);
    this.weapon.setVisible(!this.rolling);
    this.refreshTint(time);
  }

  applyStatus(id: StatusId, ms: number): ApplyResult {
    return this.statuses.apply(id, ms);
  }

  /** Burn ticks: no invulnerability frames, but a rainbow shield still blocks them. */
  takeStatusDamage(amount: number, time: number) {
    if (this.isInvulnerable(time) || this.hp <= 0) return;
    this.hp -= amount;
    audio.play('burn');
    this.hurtFlashMs = 60;
    if (this.hp <= 0) {
      this.hp = 0;
      this.onDied?.();
    }
  }

  /** One place decides the tint so statuses never fight the red hurt flash. */
  private refreshTint(time: number) {
    const s = this.statuses;
    let key = '';
    if (this.hurtFlashMs > 0) key = 'hurt';
    else if (s.has('frozen')) key = 'frozen';
    else if (s.has('shocked')) key = Math.floor(time / 90) % 2 === 0 ? 'shock-a' : 'shock-b';
    else if (s.has('burning')) key = Math.floor(time / 120) % 2 === 0 ? 'burn-a' : 'burn-b';
    else if (s.has('chilled')) key = 'chilled';
    else if (s.has('wet')) key = 'wet';
    if (key === this.tintKey) return;
    this.tintKey = key;
    const tints: Record<string, number> = {
      frozen: 0xa0e8ff,
      'shock-a': 0xffff80,
      'shock-b': 0xffffff,
      'burn-a': 0xff9040,
      'burn-b': 0xffd070,
      chilled: 0xc8ecff,
      wet: 0x9ac0ff,
    };
    if (key === '') this.clearTint();
    else if (key === 'hurt') this.setTintFill(0xff4040);
    else this.setTint(tints[key]);
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
  private updateWeaponRest(time: number) {
    const flip = this.flipX ? -1 : 1;
    const hand = { down: { x: -5, y: 4, rot: -0.4 }, up: { x: 5, y: 3, rot: 0.4 }, side: { x: 5 * flip, y: 4, rot: 0.5 * flip } }[
      this.facing
    ];
    this.weapon.setPosition(this.x + hand.x, this.y + hand.y);
    this.weapon.setDepth(this.facing === 'up' ? 9 : 11);
    if (time < this.castUntil) this.weapon.setRotation(this.castAngle);
    else if (!this.scene.tweens.isTweening(this.weapon)) this.weapon.setRotation(hand.rot);
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

  /** Beam pose: face the aim direction with the weapon leveled along it. */
  playCast(time: number) {
    this.face(this.aim.x, this.aim.y);
    this.attackSwingUntil = time + 260;
    this.castUntil = time + 260;
    this.castAngle = Math.atan2(this.aim.y, this.aim.x) + Math.PI / 2;
    this.scene.tweens.killTweensOf(this.weapon);
    this.anims.stop();
    this.setTexture(chibiKey(this.characterId, this.facing, 'attack'));
  }

  /** Start a roll on a (buffered) press. Rolls toward the held direction, or where you face. */
  private tryStartRoll(time: number) {
    const pressed = time - this.rollPressedAt < ROLL.bufferMs;
    if (!pressed || this.hp <= 0 || this.statuses.stunned || !this.roll.canStart(time)) return;
    const dir = this.heldDirection();
    const dx = dir.lengthSq() > 0 ? dir.x : this.aim.x;
    const dy = dir.lengthSq() > 0 ? dir.y : this.aim.y;
    if (!this.roll.start(time, dx, dy)) return;
    this.rollPressedAt = -Infinity; // one press, one roll
    this.aim.set(this.roll.dir.x, this.roll.dir.y);
    this.face(this.roll.dir.x, this.roll.dir.y);
    this.attackSwingUntil = 0;
    this.castUntil = 0;
    this.scene.tweens.killTweensOf(this.weapon);
    this.rolling = true;
    this.nextGhostAt = time;
    audio.play('roll');
    if (this.statuses.extinguish()) this.emit('extinguished');
    this.emit('rolled');
  }

  private heldDirection(): Phaser.Math.Vector2 {
    const left = this.cursors.left?.isDown || this.wasd.left.isDown;
    const right = this.cursors.right?.isDown || this.wasd.right.isDown;
    const up = this.cursors.up?.isDown || this.wasd.up.isDown;
    const down = this.cursors.down?.isDown || this.wasd.down.isDown;
    return new Phaser.Math.Vector2((right ? 1 : 0) - (left ? 1 : 0), (down ? 1 : 0) - (up ? 1 : 0)).normalize();
  }

  /** Per-frame roll motion: a fast tumble along the roll direction, with afterimages. */
  private updateRoll(time: number) {
    const speed = ROLL.speed * this.statuses.speedMult;
    this.setVelocity(this.roll.dir.x * speed, this.roll.dir.y * speed);
    this.anims.stop();
    this.setTexture(chibiKey(this.characterId, this.facing, 'stand'));
    const sign = this.roll.dir.x < 0 ? -1 : 1;
    this.setRotation(this.roll.progress(time) * Math.PI * 2 * sign);
    if (time >= this.nextGhostAt) {
      this.nextGhostAt = time + ROLL.ghostEveryMs;
      const ghost = this.scene.add
        .image(this.x, this.y, this.texture.key, this.frame.name)
        .setFlipX(this.flipX)
        .setRotation(this.rotation)
        .setDepth(9)
        .setTint(0x9ad0ff)
        .setAlpha(0.45);
      this.scene.tweens.add({ targets: ghost, alpha: 0, duration: 200, onComplete: () => ghost.destroy() });
    }
  }

  private endRoll() {
    this.rolling = false;
    this.setRotation(0);
  }

  private handleMovement(time: number) {
    if (this.rolling) {
      if (this.roll.isActive(time)) return this.updateRoll(time);
      this.endRoll();
    }
    const left = this.cursors.left?.isDown || this.wasd.left.isDown;
    const right = this.cursors.right?.isDown || this.wasd.right.isDown;
    const up = this.cursors.up?.isDown || this.wasd.up.isDown;
    const down = this.cursors.down?.isDown || this.wasd.down.isDown;

    const dir = new Phaser.Math.Vector2(
      (right ? 1 : 0) - (left ? 1 : 0),
      (down ? 1 : 0) - (up ? 1 : 0)
    );
    const wantsMove = dir.lengthSq() > 0;
    const moving = wantsMove && !this.statuses.stunned;
    if (wantsMove) {
      dir.normalize();
      this.aim.copy(dir);
      if (time >= this.attackSwingUntil) this.face(dir.x, dir.y);
    }
    const speed = this.effectiveMoveSpeed;
    if (this.grip >= 1) {
      this.setVelocity(dir.x * speed, dir.y * speed);
    } else {
      // On ice the knight steers toward the wanted velocity slowly, so they slide.
      const body = this.body as Phaser.Physics.Arcade.Body;
      const k = 1 - Math.exp(-(this.frameDelta / 1000) * this.grip * 14);
      this.setVelocity(body.velocity.x + (dir.x * speed - body.velocity.x) * k, body.velocity.y + (dir.y * speed - body.velocity.y) * k);
    }
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
    return time < this.invulnerableUntil || this.roll.isInvulnerable(time);
  }

  takeDamage(amount: number, time: number) {
    if (this.hp <= 0) return;
    if (this.isInvulnerable(time)) {
      // Blocked by the roll alone (not by hit i-frames or a shield): a dodge.
      if (time >= this.invulnerableUntil && time - this.lastDodgeAt > 350) {
        this.lastDodgeAt = time;
        this.dodgeCount += 1;
        this.emit('dodged');
      }
      return;
    }
    this.hp -= amount;
    audio.play('hurt');
    this.emit('hurt', amount);
    this.invulnerableUntil = time + 500;
    this.hurtFlashMs = 120;
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

  toSnapshot(): PlayerSnapshot {
    return {
      x: this.x,
      y: this.y,
      hp: this.hp,
      maxHp: this.maxHp,
      baseMoveSpeed: this.baseMoveSpeed,
      attackDamage: this.attackDamage,
      attackRange: this.attackRange,
      attackCooldown: this.attackCooldown,
      magnetRadius: this.magnetRadius,
      pierce: this.pierce,
      xp: this.xp,
      level: this.level,
      xpToNext: this.xpToNext,
      kills: this.kills,
      powerups: { ...this.powerups },
      facing: this.facing,
      flipX: this.flipX,
      aimX: this.aim.x,
      aimY: this.aim.y,
    };
  }

  /** Restore a checkpoint over the fresh character defaults. */
  applySnapshot(snap: PlayerSnapshot) {
    this.maxHp = snap.maxHp;
    this.hp = snap.hp;
    this.baseMoveSpeed = snap.baseMoveSpeed;
    this.attackDamage = snap.attackDamage;
    this.attackRange = snap.attackRange;
    this.attackCooldown = snap.attackCooldown;
    this.magnetRadius = snap.magnetRadius;
    this.pierce = snap.pierce;
    this.xp = snap.xp;
    this.level = snap.level;
    this.xpToNext = snap.xpToNext;
    this.kills = snap.kills;
    this.powerups = { ...snap.powerups };
    this.setPosition(snap.x, snap.y);
    if (Math.hypot(snap.aimX, snap.aimY) < 0.1) this.aim.set(0, 1);
    else this.aim.set(snap.aimX, snap.aimY).normalize();
    this.facing = snap.facing;
    this.setFlipX(snap.flipX);
    this.setTexture(chibiKey(this.characterId, this.facing, 'stand'));
    const now = this.scene.time.now;
    if (this.powerups.sunbeam > 0) this.nextSunbeamTickAt = now + 2000;
    if (this.powerups.rainbowShield > 0) this.nextShieldTriggerAt = now + 8000;
  }
}
