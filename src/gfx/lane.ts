import type Phaser from 'phaser';

/**
 * A charge lane drawn as pixel-aligned dashes: two edge lines plus a pulsing
 * run of chevron-ish centre dashes pointing the way the vehicle will go.
 * `progress` (0..1) fills the lane toward the vehicle as the wind-up ends.
 */
export function drawChargeLane(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  angle: number,
  length: number,
  width: number,
  progress: number,
  color: number,
  time: number,
  /** The lane ends at a wall: mark the spot where the vehicle will crash. */
  endMark = false
) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const nx = -dy;
  const ny = dx;
  const blink = Math.sin(time / (110 - 70 * progress)) > -0.2 ? 1 : 0.4;

  // translucent floor of the lane, built from small squares so it stays pixel-aligned
  for (let t = 4; t <= length; t += 3) {
    for (let w = -width / 2; w <= width / 2; w += 3) {
      g.fillStyle(color, 0.07 + 0.1 * progress);
      g.fillRect(Math.round(x + dx * t + nx * w), Math.round(y + dy * t + ny * w), 3, 3);
    }
  }
  // edge lines
  g.fillStyle(color, 0.85 * blink);
  for (let t = 4; t <= length; t += 2) {
    for (const w of [-width / 2, width / 2]) {
      g.fillRect(Math.round(x + dx * t + nx * w), Math.round(y + dy * t + ny * w), 2, 2);
    }
  }
  // dashes marching down the middle
  const marchOffset = (time / 60) % 14;
  g.fillStyle(0xffffff, 0.9 * blink);
  for (let t = 8 + marchOffset; t <= length; t += 14) {
    g.fillRect(Math.round(x + dx * t) - 1, Math.round(y + dy * t) - 1, 3, 3);
  }
  // arrowhead at the far end (or a crash burst where the lane meets a wall)
  const tipX = x + dx * length;
  const tipY = y + dy * length;
  if (endMark) {
    g.fillStyle(0xff7030, blink);
    for (let k = -3; k <= 3; k++) {
      g.fillRect(Math.round(tipX + k * 2) - 1, Math.round(tipY + k * 2) - 1, 2, 2);
      g.fillRect(Math.round(tipX + k * 2) - 1, Math.round(tipY - k * 2) - 1, 2, 2);
    }
    g.fillStyle(0xfff060, blink);
    g.fillRect(Math.round(tipX) - 2, Math.round(tipY) - 2, 4, 4);
    return;
  }
  g.fillStyle(0xffffff, blink);
  for (let k = 0; k < 4; k++) {
    for (const s of [-1, 1]) {
      g.fillRect(Math.round(tipX - dx * k * 2 + nx * s * k * 2) - 1, Math.round(tipY - dy * k * 2 + ny * s * k * 2) - 1, 2, 2);
    }
  }
}
