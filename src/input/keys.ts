/**
 * Virtual buttons speak the same keyboard events the scenes already listen
 * for. Phaser's keyboard plugin reads `keyCode` (the KeyboardEvent
 * constructor leaves it at 0), so the property is defined before dispatch.
 *
 * Mapping (GBA-style labels on the touch cluster):
 * - D-pad / stick → Arrow keys (movement and menu cursors; 8-way)
 * - A            → Space (swing a weapon, confirm menus, start a run)
 * - B            → J (energy beam; X remains the keyboard alias)
 * - Start        → pause while a run is live, otherwise Enter
 *                  (title, menus, and the game-over "PRESS START")
 */

export interface VirtualKey {
  code: string;
  key: string;
  keyCode: number;
}

export const KEYS = {
  up: { code: 'ArrowUp', key: 'ArrowUp', keyCode: 38 },
  down: { code: 'ArrowDown', key: 'ArrowDown', keyCode: 40 },
  left: { code: 'ArrowLeft', key: 'ArrowLeft', keyCode: 37 },
  right: { code: 'ArrowRight', key: 'ArrowRight', keyCode: 39 },
  swing: { code: 'Space', key: ' ', keyCode: 32 },
  beam: { code: 'KeyJ', key: 'j', keyCode: 74 },
  confirm: { code: 'Enter', key: 'Enter', keyCode: 13 },
} as const satisfies Record<string, VirtualKey>;

const held = new Map<number, VirtualKey>();

function makeEvent(key: VirtualKey, type: 'keydown' | 'keyup'): KeyboardEvent {
  const event = new KeyboardEvent(type, {
    code: key.code,
    key: key.key,
    bubbles: true,
    cancelable: true,
  });
  if (event.keyCode !== key.keyCode) {
    try {
      Object.defineProperty(event, 'keyCode', { configurable: true, get: () => key.keyCode });
      Object.defineProperty(event, 'which', { configurable: true, get: () => key.keyCode });
    } catch {
      /* property was not configurable — Phaser will ignore this event */
    }
  }
  return event;
}

function dispatch(key: VirtualKey, type: 'keydown' | 'keyup') {
  window.dispatchEvent(makeEvent(key, type));
}

/** Hold or release a key. Repeating a hold does not send another keydown. */
export function setKeyDown(key: VirtualKey, down: boolean) {
  const has = held.has(key.keyCode);
  if (down === has) return;
  if (down) held.set(key.keyCode, key);
  else held.delete(key.keyCode);
  dispatch(key, down ? 'keydown' : 'keyup');
}

export function releaseKey(key: VirtualKey) {
  setKeyDown(key, false);
}

/** A press and release, for menus that listen to keydown rather than isDown. */
export function tapKey(key: VirtualKey) {
  const already = held.has(key.keyCode);
  dispatch(key, 'keydown');
  if (!already) dispatch(key, 'keyup');
}

export function releaseAllKeys() {
  for (const key of [...held.values()]) setKeyDown(key, false);
}

/** After a scene resume, Phaser's keyboard state was frozen. Re-assert holds. */
export function replayHeldKeys() {
  for (const key of held.values()) dispatch(key, 'keydown');
}

export function getHeldDirections() {
  return {
    up: held.has(KEYS.up.keyCode),
    down: held.has(KEYS.down.keyCode),
    left: held.has(KEYS.left.keyCode),
    right: held.has(KEYS.right.keyCode),
  };
}
