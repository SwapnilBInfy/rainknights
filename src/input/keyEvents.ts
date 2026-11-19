/**
 * Phaser's keyboard manager pushes every DOM key event onto a queue that is only emptied at the end of the
 * frame, and each new event re-runs the whole queue through the scene's keyboard plugin. Its guard against
 * that only skips an event identical to the one handled immediately before, so when a keydown, its keyup and a
 * second keydown land in one frame (two quick taps, or a held key released as a menu opens) the first keydown
 * is dispatched again. A cursor menu that steps per `keydown` then moves twice, or backwards. Wrapping the
 * handler makes it see each DOM event once.
 */
export function eachKeyEventOnce(handler: (event: KeyboardEvent) => void): (event: KeyboardEvent) => void {
  const seen = new WeakSet<object>();
  return (event) => {
    if (seen.has(event)) return;
    seen.add(event);
    handler(event);
  };
}
