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
  resetSave: () => void;
}

const CHOICES = ['resume', 'sound', 'quit', 'reset'] as const;
type Choice = (typeof CHOICES)[number];
type Mode = 'menu' | 'confirm';
type ConfirmKind = 'quit' | 'reset';

let overlay: HTMLDivElement | null = null;
let titleEl: HTMLParagraphElement | null = null;
let menuPanel: HTMLDivElement | null = null;
let confirmPanel: HTMLDivElement | null = null;
let menuButtons: HTMLButtonElement[] = [];
let confirmButtons: HTMLButtonElement[] = [];
let buttons: HTMLButtonElement[] = [];
let mode: Mode = 'menu';
let confirmKind: ConfirmKind = 'quit';
let selected = 0;
let frame: ScreenFrame | null = null;
let repeatTimer = 0;
let repeatDir: 'up' | 'down' | null = null;
let repeatAt = 0;

/**
 * DOM pause menu scaled onto the canvas. GameScene owns when the simulation
 * actually freezes; this only draws the menu and turns Esc / P / Start /
 * blur / a gamepad Start button into that request.
 *
 * QUIT asks "Abandon run?" first. RESET SAVE asks "Erase save?". NO is the
 * default, so a second tap on A does not throw the run or the save away.
 * Esc / Start / P backs out of that question instead of resuming.
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
  setMode('menu', 0);
  if (overlay) overlay.hidden = false;
  layout();
  buttons[0]?.focus({ preventScroll: true });
  armRepeat();
}

export function closePauseMenu() {
  if (overlay) overlay.hidden = true;
  setMode('menu', 0);
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
        if (!e.repeat) requestResume(host);
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
      if (host.isUserPaused()) requestResume(host);
      else if (host.canPause()) host.pause();
    }
    startWasDown = down;
  };
  raf = requestAnimationFrame(pollPad);

  setStartConsumer(() => {
    if (host.isEnded()) return false;
    if (host.isLevelUp()) return true;
    if (host.isUserPaused()) {
      requestResume(host);
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

/** Esc, Start, and P resume — unless the abandon question is up, which they cancel. */
function requestResume(host: PauseHost) {
  if (mode === 'confirm') {
    const index = confirmKind === 'reset' ? CHOICES.indexOf('reset') : CHOICES.indexOf('quit');
    setMode('menu', index);
    return;
  }
  host.resume();
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
  titleEl = document.createElement('p');
  titleEl.className = 'title';
  titleEl.id = 'pause-title';
  titleEl.textContent = 'PAUSED';

  menuPanel = document.createElement('div');
  menuPanel.dataset.panel = 'menu';
  const resume = menuButton('resume', 'RESUME');
  const sound = menuButton('sound', 'SOUND ON');
  const quit = menuButton('quit', 'QUIT');
  const reset = menuButton('reset', 'RESET SAVE');
  menuButtons = [resume, sound, quit, reset];
  menuPanel.append(resume, sound, quit, reset);

  confirmPanel = document.createElement('div');
  confirmPanel.dataset.panel = 'confirm';
  confirmPanel.hidden = true;
  const no = menuButton('no', 'NO');
  const yes = menuButton('yes', 'YES');
  confirmButtons = [no, yes];
  confirmPanel.append(no, yes);

  buttons = menuButtons;
  inner.append(titleEl, menuPanel, confirmPanel);
  panel.append(inner);
  overlay.append(panel);
  document.body.append(overlay);

  audio.subscribeMute(() => {
    if (!overlay?.hidden) render();
  });
}

function menuButton(choice: string, text: string) {
  const el = document.createElement('button');
  el.type = 'button';
  el.dataset.choice = choice;
  el.textContent = text;
  return el;
}

function wireButtons(host: PauseHost) {
  const wire = (group: HTMLButtonElement[]) => {
    group.forEach((button, index) => {
      button.onpointerover = () => {
        if (overlay?.hidden || buttons !== group || selected === index) return;
        selected = index;
        audio.play('move');
        render();
      };
      button.onclick = () => {
        if (overlay?.hidden || buttons !== group) return;
        selected = index;
        render();
        activate(host);
      };
    });
  };
  wire(menuButtons);
  wire(confirmButtons);
}

function setMode(next: Mode, index: number, kind: ConfirmKind = confirmKind) {
  mode = next;
  if (next === 'confirm') confirmKind = kind;
  selected = index;
  if (menuPanel) menuPanel.hidden = next !== 'menu';
  if (confirmPanel) confirmPanel.hidden = next !== 'confirm';
  buttons = next === 'menu' ? menuButtons : confirmButtons;
  const question = confirmKind === 'reset' ? 'Erase save?' : 'Abandon run?';
  if (titleEl) titleEl.textContent = next === 'confirm' ? question : 'PAUSED';
  if (overlay) overlay.setAttribute('aria-label', next === 'confirm' ? question : 'Paused');
  render();
}

function step(delta: number) {
  const count = buttons.length;
  if (count === 0) return;
  const next = (selected + delta + count) % count;
  if (next === selected) return;
  selected = next;
  audio.play('move');
  render();
}

function activate(host: PauseHost) {
  if (mode === 'confirm') {
    audio.play('confirm');
    if (selected === 1) {
      if (confirmKind === 'reset') host.resetSave();
      else host.quit();
    } else {
      const index = confirmKind === 'reset' ? CHOICES.indexOf('reset') : CHOICES.indexOf('quit');
      setMode('menu', index);
    }
    return;
  }
  const choice: Choice = CHOICES[selected];
  if (choice === 'sound') {
    audio.toggleMute();
    audio.play('confirm');
    render();
    return;
  }
  audio.play('confirm');
  if (choice === 'quit') setMode('confirm', 0, 'quit');
  else if (choice === 'reset') setMode('confirm', 0, 'reset');
  else host.resume();
}

function render() {
  if (mode === 'menu') {
    const sound = audio.muted ? 'SOUND OFF' : 'SOUND ON';
    const labels = ['RESUME', sound, 'QUIT', 'RESET SAVE'];
    menuButtons.forEach((button, index) => {
      button.textContent = labels[index];
    });
  }
  const inactive = mode === 'menu' ? confirmButtons : menuButtons;
  inactive.forEach((button) => button.removeAttribute('aria-current'));
  buttons.forEach((button, index) => {
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
