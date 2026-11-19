import Phaser from 'phaser';
import { chibiKey, type Facing } from '../gfx/chibi';

/** The knight as they walk Mistford. No combat — the cities are where the storm is. */
export class Avatar extends Phaser.Physics.Arcade.Sprite {
  /** Menus and talk boxes hold them still. */
  locked = false;
  private characterId: string;
  private facing: Facing = 'down';
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd: { up: Phaser.Input.Keyboard.Key; down: Phaser.Input.Keyboard.Key; left: Phaser.Input.Keyboard.Key; right: Phaser.Input.Keyboard.Key };

  constructor(scene: Phaser.Scene, x: number, y: number, characterId: string) {
    super(scene, x, y, chibiKey(characterId, 'down', 'stand'));
    this.characterId = characterId;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(10);

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

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    if (this.locked) {
      this.setVelocity(0, 0);
      this.stand();
      return;
    }
    const left = this.cursors.left?.isDown || this.wasd.left.isDown;
    const right = this.cursors.right?.isDown || this.wasd.right.isDown;
    const up = this.cursors.up?.isDown || this.wasd.up.isDown;
    const down = this.cursors.down?.isDown || this.wasd.down.isDown;
    const dir = new Phaser.Math.Vector2((right ? 1 : 0) - (left ? 1 : 0), (down ? 1 : 0) - (up ? 1 : 0));
    if (dir.lengthSq() === 0) {
      this.setVelocity(0, 0);
      this.stand();
      return;
    }
    dir.normalize();
    this.setVelocity(dir.x * 80, dir.y * 80);
    if (Math.abs(dir.x) >= Math.abs(dir.y)) {
      this.facing = 'side';
      this.setFlipX(dir.x < 0);
    } else {
      this.facing = dir.y > 0 ? 'down' : 'up';
      this.setFlipX(false);
    }
    const key = `walk_${this.characterId}_${this.facing}`;
    if (this.anims.currentAnim?.key !== key || !this.anims.isPlaying) this.play(key);
  }

  private stand() {
    this.anims.stop();
    this.setTexture(chibiKey(this.characterId, this.facing, 'stand'));
  }
}
