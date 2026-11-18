/**
 * Tutorial copy. Touch screens label the cluster A / B / Start; keyboards
 * keep Space / J / X. When a touch screen is in use, lead with the buttons
 * and keep the keyboard aliases so a paired keyboard still makes sense.
 */

export function attackHint(touch: boolean): string {
  if (touch) return 'A/SPACE: swing weapon\nB/J: beam  START: pause';
  return 'SPACE: swing weapon\nJ or X: energy beam';
}

export function menuHint(touch: boolean): string {
  if (touch) return 'STICK MOVE  A SWING  B BEAM';
  return 'WASD MOVE  SPACE SWING  J BEAM';
}

/** Single letter beside the beam gauge. The box only fits one glyph. */
export function beamKeyLabel(touch: boolean): string {
  return touch ? 'B' : 'J';
}

/** Second tutorial message, a few seconds after the attack hint. */
export function rollHint(touch: boolean): string {
  if (touch) return 'R: dodge roll\nYou cannot be hit mid-roll!';
  return 'SHIFT or K: dodge roll\nYou cannot be hit mid-roll!';
}

/** Single letter beside the roll gauge. */
export function rollKeyLabel(touch: boolean): string {
  return touch ? 'R' : 'K';
}
