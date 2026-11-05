import type Phaser from 'phaser';
import { KEYS, releaseAllKeys, setKeyDown, type VirtualKey } from './keys';
import { emitStart } from './start';
import { watchScreen, type ScreenFrame } from '../ui/screenFrame';

/** Unscaled pixel size. An integer scale turns these into thumb-sized CSS pixels. */
const STICK = 72;
const ACTIONS_W = 78;
const ACTIONS_H = 90;
const SCREEN_PAD = 10;

interface Dirs {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

const NO_DIRS: Dirs = { up: false, down: false, left: false, right: false };

let touchActive = false;
const touchListeners = new Set<(active: boolean) => void>();

/** True once the on-screen A / B / Start cluster is actually shown. */
export function isTouchControlsActive(): boolean {
  return touchActive;
}

/** Fires immediately with the current value, then on every visibility change. */
export function onTouchControlsChange(listener: (active: boolean) => void): () => void {
  touchListeners.add(listener);
  listener(touchActive);
  return () => {
    touchListeners.delete(listener);
  };
}

function setTouchActive(next: boolean) {
  if (next === touchActive) return;
  touchActive = next;
  document.documentElement.dataset.touchControls = next ? '1' : '0';
  for (const listener of touchListeners) listener(next);
}

/**
 * On-screen d-pad (drag it like a stick; diagonals hold two arrows) plus
 * A / B / Start. Hidden unless the device actually has a touch screen.
 * Prefer the letterbox around the canvas so the controls don't cover the
 * playfield; overlay the side gutters only when there is no room outside.
 */
export function mountTouchControls(game: Phaser.Game) {
  const root = document.createElement('div');
  root.id = 'touch-controls';
  root.dataset.testid = 'touch-controls';
  root.hidden = true;

  const wrap = document.createElement('div');
  wrap.className = 'stick-wrap';
  wrap.dataset.testid = 'touch-stick';

  const stick = document.createElement('div');
  stick.className = 'stick';
  stick.setAttribute('role', 'group');
  stick.setAttribute('aria-label', 'Move');

  const crossH = document.createElement('div');
  crossH.className = 'cross-h';
  const crossV = document.createElement('div');
  crossV.className = 'cross-v';
  const nub = document.createElement('div');
  nub.className = 'nub';
  nub.dataset.testid = 'touch-nub';
  stick.append(crossH, crossV);
  wrap.append(stick, nub);

  const actions = document.createElement('div');
  actions.className = 'actions';
  actions.dataset.testid = 'touch-actions';

  const start = button('start', 'Start', 'START');
  const beam = button('b', 'B', 'B');
  const swing = button('a', 'A', 'A');
  actions.append(start, beam, swing);

  root.append(wrap, actions);
  document.body.append(root);

  let dirs = { ...NO_DIRS };
  let stickPointer: number | null = null;
  // Cached on pointerdown so steering does not force a layout on every move.
  let stickRect: DOMRect | null = null;

  const moveNub = (x: number, y: number) => {
    const size = 18;
    nub.style.left = `${STICK / 2 + x - size / 2}px`;
    nub.style.top = `${STICK / 2 + y - size / 2}px`;
  };

  const applyDirs = (next: Dirs) => {
    if (next.up !== dirs.up) setKeyDown(KEYS.up, next.up);
    if (next.down !== dirs.down) setKeyDown(KEYS.down, next.down);
    if (next.left !== dirs.left) setKeyDown(KEYS.left, next.left);
    if (next.right !== dirs.right) setKeyDown(KEYS.right, next.right);
    dirs = next;
    const held = (['up', 'down', 'left', 'right'] as const).filter((dir) => next[dir]);
    wrap.dataset.dir = held.join(' ');
  };

  const resetStick = () => {
    stickPointer = null;
    stickRect = null;
    applyDirs({ ...NO_DIRS });
    moveNub(0, 0);
  };

  const pointStick = (clientX: number, clientY: number) => {
    const rect = stickRect ?? stick.getBoundingClientRect();
    const scale = rect.width / STICK || 1;
    const dx = (clientX - (rect.left + rect.width / 2)) / scale;
    const dy = (clientY - (rect.top + rect.height / 2)) / scale;
    const dist = Math.hypot(dx, dy);
    // Small center deadzone so a thumb landing on an arm moves on the first event.
    if (dist < 8) {
      applyDirs({ ...NO_DIRS });
      moveNub(0, 0);
      return;
    }
    const nx = dx / dist;
    const ny = dy / dist;
    const t = 0.45;
    applyDirs({ up: ny < -t, down: ny > t, left: nx < -t, right: nx > t });
    const reach = Math.min(dist, 18);
    moveNub(nx * reach, ny * reach);
  };

  const steer = (e: PointerEvent) => {
    if (e.pointerId !== stickPointer) return;
    e.preventDefault();
    pointStick(e.clientX, e.clientY);
  };
  stick.addEventListener('pointerdown', (e) => {
    if (stickPointer !== null || e.button !== 0) return;
    stickPointer = e.pointerId;
    stickRect = stick.getBoundingClientRect();
    capturePointer(stick, e.pointerId);
    e.preventDefault();
    e.stopPropagation();
    pointStick(e.clientX, e.clientY);
  });
  stick.addEventListener('pointermove', steer);
  // Uncoalesced updates: pointermove can be a frame late on a phone.
  stick.addEventListener('pointerrawupdate', steer as EventListener);
  const endStick = (e: PointerEvent) => {
    if (e.pointerId !== stickPointer) return;
    resetStick();
    releasePointer(stick, e.pointerId);
  };
  stick.addEventListener('pointerup', endStick);
  stick.addEventListener('pointercancel', endStick);

  bindHold(swing, KEYS.swing);
  bindHold(beam, KEYS.beam);
  bindTap(start, () => emitStart());

  // Backstop for browsers that still pan or pinch when touch-action is ignored.
  const blockGesture = (e: Event) => e.preventDefault();
  window.addEventListener('touchmove', blockGesture, { passive: false });
  window.addEventListener('gesturestart', blockGesture, { passive: false });
  window.addEventListener('gesturechange', blockGesture, { passive: false });
  root.addEventListener('contextmenu', blockGesture);

  const releasePointers = () => {
    stickPointer = null;
    swing.classList.remove('down');
    beam.classList.remove('down');
    start.classList.remove('down');
    applyDirs({ ...NO_DIRS });
    moveNub(0, 0);
    releaseAllKeys();
  };
  // Registered before the gameplay pause listener so a blur releases keys
  // while the scene can still process the keyup.
  window.addEventListener('blur', releasePointers);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releasePointers();
  });

  const place = (el: HTMLElement, left: number, top: number, scale: number) => {
    el.style.left = `${Math.round(left)}px`;
    el.style.top = `${Math.round(top)}px`;
    el.style.transform = `scale(${scale})`;
  };

  const layout = (frame: ScreenFrame) => {
    const zoom = Math.max(1, frame.zoom);
    const marginL = frame.left;
    const marginR = window.innerWidth - (frame.left + frame.width);
    const marginB = window.innerHeight - (frame.top + frame.height);
    const portrait = window.innerHeight >= window.innerWidth;
    // Largest integer scale that fits in `room` CSS pixels. Capped so a huge
    // display doesn't grow a dinner-plate d-pad; 4×72 is already a big thumb.
    const fitScale = (room: number, logical: number) => {
      if (room < logical + SCREEN_PAD) return 0;
      return Math.min(4, Math.floor((room - SCREEN_PAD) / logical));
    };
    const bottomScale = Math.min(
      fitScale(marginB, ACTIONS_H),
      fitScale(window.innerWidth - SCREEN_PAD * 2, STICK + ACTIONS_W + 12)
    );
    const sideScale = fitScale(Math.min(marginL, marginR), STICK);

    // Portrait phones have a deep letterbox under the 160px screen. Park
    // large controls in the bottom corners, where the thumbs actually are.
    if ((portrait || marginB >= Math.min(marginL, marginR)) && bottomScale >= 1) {
      const stickTop = window.innerHeight - SCREEN_PAD - STICK * bottomScale;
      const actionsTop = window.innerHeight - SCREEN_PAD - ACTIONS_H * bottomScale;
      if (Math.min(stickTop, actionsTop) >= frame.top + frame.height + 4) {
        place(wrap, SCREEN_PAD, stickTop, bottomScale);
        place(actions, window.innerWidth - SCREEN_PAD - ACTIONS_W * bottomScale, actionsTop, bottomScale);
        root.dataset.layout = 'below';
        return;
      }
    }
    if (sideScale >= 1) {
      const mid = frame.top + frame.height / 2;
      place(wrap, frame.left - STICK * sideScale - 8, mid - (STICK * sideScale) / 2, sideScale);
      place(actions, frame.left + frame.width + 8, mid - (ACTIONS_H * sideScale) / 2, sideScale);
      root.dataset.layout = 'side';
      return;
    }
    // Canvas fills the window: same integer zoom as the pixels, in the lower corners.
    place(wrap, frame.left + 2 * zoom, frame.top + (160 - STICK - 2) * zoom, zoom);
    place(actions, frame.left + (240 - ACTIONS_W - 2) * zoom, frame.top + (160 - ACTIONS_H - 2) * zoom, zoom);
    root.dataset.layout = 'overlay';
  };

  watchScreen(game, layout);

  let touched = false;
  const sync = () => {
    const coarse = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    const show = touched || navigator.maxTouchPoints > 0 || coarse;
    root.hidden = !show;
    setTouchActive(show);
    if (show) {
      const canvas = game.canvas;
      if (canvas?.isConnected) {
        const rect = canvas.getBoundingClientRect();
        if (rect.width >= 2) {
          layout({
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            zoom: game.scale.zoom || 1,
          });
        }
      }
    }
  };
  sync();
  window.matchMedia('(hover: none) and (pointer: coarse)').addEventListener('change', sync);
  window.addEventListener(
    'touchstart',
    () => {
      touched = true;
      sync();
    },
    { passive: true }
  );
}

function button(className: string, label: string, text: string) {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = className;
  el.setAttribute('aria-label', label);
  el.tabIndex = -1;
  el.textContent = text;
  return el;
}

function capturePointer(el: HTMLElement, pointerId: number) {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    /* Synthetic events have no active pointer. */
  }
}

function releasePointer(el: HTMLElement, pointerId: number) {
  try {
    if (el.hasPointerCapture(pointerId)) el.releasePointerCapture(pointerId);
  } catch {
    /* Pointer was already released. */
  }
}

function bindHold(el: HTMLButtonElement, key: VirtualKey) {
  let pointerId: number | null = null;
  const release = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    el.classList.remove('down');
    delete el.dataset.held;
    setKeyDown(key, false);
    releasePointer(el, e.pointerId);
  };
  el.addEventListener('pointerdown', (e) => {
    // A second finger on the other button has its own pointer id. Don't drop
    // the one already holding this button, and don't block the other finger.
    if (e.button !== 0 || pointerId !== null) return;
    pointerId = e.pointerId;
    capturePointer(el, e.pointerId);
    e.preventDefault();
    e.stopPropagation();
    el.classList.add('down');
    el.dataset.held = '1';
    setKeyDown(key, true);
  });
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
}

function bindTap(el: HTMLButtonElement, onTap: () => void) {
  let pointerId: number | null = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    pointerId = e.pointerId;
    capturePointer(el, e.pointerId);
    e.preventDefault();
    e.stopPropagation();
    el.classList.add('down');
  });
  const finish = (e: PointerEvent, fire: boolean) => {
    if (e.pointerId !== pointerId) return;
    pointerId = null;
    el.classList.remove('down');
    releasePointer(el, e.pointerId);
    if (!fire) return;
    const rect = el.getBoundingClientRect();
    const inside =
      e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
    if (inside) onTap();
  };
  el.addEventListener('pointerup', (e) => finish(e, true));
  el.addEventListener('pointercancel', (e) => finish(e, false));
}
