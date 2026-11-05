import type Phaser from 'phaser';
import { audio } from '../audio/engine';
import { KEYS, getHeldDirections, releaseKey } from '../input/keys';
import { setStartConsumer } from '../input/start';
import { watchScreen, type ScreenFrame } from './screenFrame';

export interface PauseHost {
  canPause: () => boolean;
  isUserPaused: () => boolean;
  isLevelUp: () => boolean;
  isEnded: () => boolean;
  pause: () => void;
  resume: () => void;
  quit: () => void;
}

const CHOICES = ['resume', 'sound', 'quit'] as const;
type Choice = (typeof CHOICES)[number];

let overlay: HTMLDivElement | null = null;
let buttons: HTMLButtonElement[] = [];
let selected = 0;
let frame: ScreenFrame | null = null;
let repeatTimer = 0;
let repeatDir: 'up' | 'down' | null = null;
let repeatAt = 0;

/**
 * DOM pause menu scaled onto the canvas. GameScene owns when the simulation
 * actually freezes; this only draws the menu and turns Esc / P / Start /
 * blur / a gamepad Start button into that request.
 */
export function attachPauseOverlay(game: Phaser.Game) {
  ensureOverlay();
  return watchScreen(game, (next) => {
    frame = next;
    layout();
  });
}

export function openPauseMenu() {
  ensureOverlay();
  selected = 0;
  render();
  if (overlay) overlay.hidden = false;
  layout();
  buttons[0]?.focus({ preventScroll: true });
  armRepeat();
}

export function closePauseMenu() {
  if (overlay) overlay.hidden = true;
  disarmRepeat();
  if (document.activeElement instanceof HTMLElement && overlay?.contains(document.activeElement)) {
    document.activeElement.blur();
  }
}

export function bindGameplayPause(host: PauseHost): () => void {
  ensureOverlay();

  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const pauseKey = e.key === 'Escape' || e.code === 'KeyP';
    if (host.isUserPaused()) {
      if (e.key === 'm' || e.key === 'M') return;
      if (e.repeat && e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'w' && e.key !== 'W' && e.key !== 's' && e.key !== 'S') {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      if (pauseKey) {
        if (!e.repeat) host.resume();
        return;
      }
      // The stick injects untrusted arrows; the repeat poller owns those.
      if (!e.isTrusted && (e.key === 'ArrowUp' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        return;
      }
      const k = e.key.toLowerCase();
      if (k === 'arrowup' || k === 'w') step(-1);
      else if (k === 'arrowdown' || k === 's') step(1);
      else if (k === 'arrowleft' || k === 'arrowright' || k === 'a' || k === 'd') {
        /* vertical menu */
      } else if (k === 'enter' || k === ' ' || k === 'z') {
        releaseKey(KEYS.swing);
        releaseKey(KEYS.beam);
        activate(host);
      } else {
        releaseKey(KEYS.swing);
        releaseKey(KEYS.beam);
      }
      return;
    }
    if (pauseKey && !e.repeat && host.canPause()) {
      e.preventDefault();
      host.pause();
    }
  };

  const autoPause = () => {
    if (host.canPause()) host.pause();
  };
  const onVisibility = () => {
    if (document.hidden) autoPause();
  };

  let startWasDown = false;
  let raf = 0;
  const pollPad = () => {
    raf = requestAnimationFrame(pollPad);
    let down = false;
    try {
      const pads = navigator.getGamepads?.() ?? [];
      for (const pad of pads) {
        if (pad?.buttons[9]?.pressed) down = true;
      }
    } catch {
      return;
    }
    if (down && !startWasDown) {
      if (host.isUserPaused()) host.resume();
      else if (host.canPause()) host.pause();
    }
    startWasDown = down;
  };
  raf = requestAnimationFrame(pollPad);

  setStartConsumer(() => {
    if (host.isEnded()) return false;
    if (host.isLevelUp()) return true;
    if (host.isUserPaused()) {
      host.resume();
      return true;
    }
    if (host.canPause()) {
      host.pause();
      return true;
    }
    return false;
  });

  window.addEventListener('keydown', onKey, true);
  window.addEventListener('blur', autoPause);
  document.addEventListener('visibilitychange', onVisibility);

  wireButtons(host);

  return () => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('blur', autoPause);
    document.removeEventListener('visibilitychange', onVisibility);
    cancelAnimationFrame(raf);
    setStartConsumer(null);
    closePauseMenu();
  };
}

function ensureOverlay() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.id = 'pause-overlay';
  overlay.dataset.testid = 'pause-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Paused');
  overlay.hidden = true;

  const panel = document.createElement('div');
  panel.className = 'panel';
  const inner = document.createElement('div');
  inner.className = 'panel-inner';
  const title = document.createElement('p');
  title.className = 'title';
  title.id = 'pause-title';
  title.textContent = 'PAUSED';

  const resume = menuButton('resume', 'RESUME');
  const sound = menuButton('sound', 'SOUND ON');
  const quit = menuButton('quit', 'QUIT');
  buttons = [resume, sound, quit];
  inner.append(title, resume, sound, quit);
  panel.append(inner);
  overlay.append(panel);
  document.body.append(overlay);

  audio.subscribeMute(() => {
    if (!overlay?.hidden) render();
  });
}

function menuButton(choice: Choice, text: string) {
  const el = document.createElement('button');
  el.type = 'button';
  el.dataset.choice = choice;
  el.textContent = text;
  return el;
}

function wireButtons(host: PauseHost) {
  buttons.forEach((button, index) => {
    button.onpointerover = () => {
      if (overlay?.hidden || selected === index) return;
      selected = index;
      audio.play('move');
      render();
    };
    button.onclick = () => {
      if (overlay?.hidden) return;
      selected = index;
      render();
      activate(host);
    };
  });
}

function step(delta: number) {
  const next = (selected + delta + CHOICES.length) % CHOICES.length;
  if (next === selected) return;
  selected = next;
  audio.play('move');
  render();
}

function activate(host: PauseHost) {
  const choice = CHOICES[selected];
  if (choice === 'sound') {
    audio.toggleMute();
    audio.play('confirm');
    render();
    return;
  }
  audio.play('confirm');
  if (choice === 'quit') host.quit();
  else host.resume();
}

function render() {
  const sound = audio.muted ? 'SOUND OFF' : 'SOUND ON';
  const labels = ['RESUME', sound, 'QUIT'];
  buttons.forEach((button, index) => {
    button.textContent = labels[index];
    if (index === selected) button.setAttribute('aria-current', 'true');
    else button.removeAttribute('aria-current');
  });
  const current = buttons[selected];
  if (current && overlay && !overlay.hidden && document.activeElement !== current) {
    current.focus({ preventScroll: true });
  }
}

function layout() {
  if (!overlay || !frame || overlay.hidden) return;
  overlay.style.left = `${Math.round(frame.left)}px`;
  overlay.style.top = `${Math.round(frame.top)}px`;
  overlay.style.transform = `scale(${frame.zoom || 1})`;
}

function armRepeat() {
  disarmRepeat();
  repeatDir = null;
  repeatTimer = window.setInterval(() => {
    if (!overlay || overlay.hidden) return;
    const dirs = getHeldDirections();
    const want = dirs.up && !dirs.down ? 'up' : dirs.down && !dirs.up ? 'down' : null;
    const now = performance.now();
    if (want !== repeatDir) {
      repeatDir = want;
      repeatAt = now + 320;
      if (want) step(want === 'up' ? -1 : 1);
      return;
    }
    if (want && now >= repeatAt) {
      step(want === 'up' ? -1 : 1);
      repeatAt = now + 150;
    }
  }, 40);
}

function disarmRepeat() {
  if (repeatTimer) window.clearInterval(repeatTimer);
  repeatTimer = 0;
  repeatDir = null;
}
