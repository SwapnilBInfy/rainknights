import { KEYS, tapKey } from './keys';

/**
 * The touch Start button. A live run consumes it to toggle pause; otherwise
 * it falls through to Enter so "PRESS START" still works on the title and
 * the game-over screen.
 */
let consumer: (() => boolean) | null = null;

export function setStartConsumer(next: (() => boolean) | null) {
  consumer = next;
}

export function emitStart() {
  if (consumer?.()) return;
  tapKey(KEYS.confirm);
}
