import Phaser from 'phaser';
import { audio } from '../audio/engine';
import { drawWindow, textStyle } from '../ui/Window';

/** Always-on-top scene: briefly shows "SOUND ON/OFF" when the M key toggles mute. */
export class OverlayScene extends Phaser.Scene {
  private badge: Phaser.GameObjects.Container | null = null;

  constructor() {
    super('OverlayScene');
  }

  create() {
    audio.onMuteChange = (muted) => this.show(muted);
    this.events.once('shutdown', () => (audio.onMuteChange = undefined));
  }

  private show(muted: boolean) {
    this.badge?.destroy();
    const win = drawWindow(this, 152, 31, 86, 14);
    const label = this.add.text(157, 34, muted ? 'SOUND OFF' : 'SOUND ON', textStyle(muted ? '#d03028' : '#28a038'));
    this.badge = this.add.container(0, 0, [win, label]).setDepth(1000);
    this.scene.bringToTop();
    this.tweens.killTweensOf(this.badge);
    this.tweens.add({ targets: this.badge, alpha: 0, delay: 1200, duration: 300, onComplete: () => this.badge?.destroy() });
  }
}
