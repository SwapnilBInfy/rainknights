import type Phaser from 'phaser';

/** The canvas as it is actually drawn: integer zoom, centered in the window. */
export interface ScreenFrame {
  left: number;
  top: number;
  width: number;
  height: number;
  zoom: number;
}

/**
 * Fires when the canvas moves or the integer zoom changes. Window resizes
 * can recenter the canvas without changing its size, so both the canvas and
 * its parent are observed along with the window.
 */
export function watchScreen(game: Phaser.Game, onFrame: (frame: ScreenFrame) => void): () => void {
  let scheduled = false;
  const emit = () => {
    scheduled = false;
    const canvas = game.canvas;
    if (!canvas?.isConnected) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return;
    onFrame({
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      zoom: game.scale.zoom || 1,
    });
  };
  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(emit);
  };

  const observer = new ResizeObserver(schedule);
  observer.observe(game.canvas);
  const app = document.getElementById('app');
  if (app) observer.observe(app);
  window.addEventListener('resize', schedule);
  window.addEventListener('orientationchange', schedule);
  schedule();

  return () => {
    observer.disconnect();
    window.removeEventListener('resize', schedule);
    window.removeEventListener('orientationchange', schedule);
  };
}
