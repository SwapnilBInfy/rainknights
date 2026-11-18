import { describe, expect, it } from 'vitest';
import {
  HOLD_MS,
  KEYBOARD_CONTROLS,
  MAX_LINE,
  STUCK_MS,
  TOUCH_CONTROLS,
  TUTORIAL_STEPS,
  TutorialRunner,
  type TutorialState,
} from '../src/systems/tutorialSteps';

const run = (r: TutorialRunner, ms: number) => {
  const out = [];
  for (let t = 0; t < ms; t += 50) out.push(...r.update(50));
  return out;
};
const types = (events: { type: string }[]) => events.map((e) => e.type);

describe('tutorial text', () => {
  it.each([
    ['keyboard', KEYBOARD_CONTROLS],
    ['touch', TOUCH_CONTROLS],
  ])('every line fits the prompt panel (%s)', (_name, controls) => {
    for (const step of TUTORIAL_STEPS) {
      const lines = step.lines(controls);
      expect(lines).toHaveLength(2);
      for (const line of lines) expect(line.length, `${step.id}: "${line}"`).toBeLessThanOrEqual(MAX_LINE);
      expect(step.title.length).toBeLessThanOrEqual(12);
    }
  });

  it('names the right controls for each device', () => {
    const swing = TUTORIAL_STEPS.find((s) => s.id === 'swing')!;
    expect(swing.lines(KEYBOARD_CONTROLS).join(' ')).toContain('SPACE');
    expect(swing.lines(TOUCH_CONTROLS).join(' ')).toContain('A');
    const dodge = TUTORIAL_STEPS.find((s) => s.id === 'dodge')!;
    expect(dodge.lines(TOUCH_CONTROLS).join(' ')).toContain('R');
    expect(dodge.lines(KEYBOARD_CONTROLS).join(' ')).toContain('SHIFT');
  });

  it('covers the whole game, ending on a final step', () => {
    expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual(['move', 'swing', 'beam', 'gems', 'levelup', 'dodge', 'strike', 'wet', 'storm', 'done']);
  });
});

describe('TutorialRunner', () => {
  it('starts on the first step and does not advance until it is done', () => {
    const r = new TutorialRunner();
    expect(types(r.begin())).toEqual(['enter']);
    expect(run(r, 5000)).toEqual([]);
    expect(r.step.id).toBe('move');
  });

  it('completes a step, lingers, then enters the next', () => {
    const r = new TutorialRunner();
    r.state.movedPx = 100;
    expect(types(r.update(50))).toEqual(['complete']);
    expect(r.isHolding).toBe(true);
    expect(r.step.id).toBe('move');
    r.state.swingHits = 1; // progress made during the hold does not end it early
    expect(r.update(50)).toEqual([]);
    expect(r.isHolding).toBe(true);
    const events = run(r, HOLD_MS + 100);
    expect(types(events)).toEqual(['enter']);
    expect(r.step.id).toBe('swing');
    expect(r.isHolding).toBe(false);
  });

  it('a step already satisfied on entry completes straight away', () => {
    const r = new TutorialRunner();
    r.state.movedPx = 100;
    r.state.swingHits = 5;
    const events = run(r, HOLD_MS + 100);
    expect(types(events)).toEqual(['complete', 'enter', 'complete']); // move done, then swing found already done
    expect(r.step.id).toBe('swing');
    expect(r.isHolding).toBe(true);
  });

  it('skip moves on, reports it as skipped, and cannot be spammed through a hold', () => {
    const r = new TutorialRunner();
    const ev = r.skip();
    expect(ev[0]).toMatchObject({ type: 'complete', skipped: true });
    expect(ev[1]).toMatchObject({ type: 'enter', index: 1 });
    r.state.swingHits = 9;
    r.update(50); // completes -> holding
    expect(r.isHolding).toBe(true);
    expect(r.skip()).toEqual([]);
  });

  it('moves a stuck player on after a long wait, but only before the last step', () => {
    const r = new TutorialRunner();
    const events = run(r, STUCK_MS + 500);
    expect(events.some((e) => e.type === 'complete' && (e as { skipped: boolean }).skipped)).toBe(true);
    expect(r.step.id).toBe('swing');

    const end = new TutorialRunner();
    for (let i = 0; i < TUTORIAL_STEPS.length - 1; i++) end.skip();
    expect(end.step.id).toBe('done');
    run(end, STUCK_MS * 2);
    expect(end.step.id).toBe('done'); // never times out of the ending
    expect(end.isFinished).toBe(false);
    expect(end.skip()).toEqual([]);
  });

  it('finishes when the player confirms the last step', () => {
    const r = new TutorialRunner();
    for (let i = 0; i < TUTORIAL_STEPS.length - 1; i++) r.skip();
    r.state.finished = true;
    expect(types(r.update(50))).toEqual(['complete', 'finished']);
    expect(r.isFinished).toBe(true);
    expect(r.update(50)).toEqual([]);
  });

  it('a frame hiccup cannot skip the hold or the stuck timer', () => {
    const r = new TutorialRunner();
    r.state.movedPx = 100;
    r.update(50);
    expect(r.update(60_000)).toEqual([]); // clamped to 100ms of a 1100ms hold
    expect(r.isHolding).toBe(true);
  });

  it('each completion rule needs the right thing', () => {
    const by = (id: string, patch: Partial<TutorialState>) => {
      const s = new TutorialRunner().state;
      Object.assign(s, patch);
      return TUTORIAL_STEPS.find((x) => x.id === id)!.done(s);
    };
    expect(by('move', { movedPx: 59 })).toBe(false);
    expect(by('move', { movedPx: 60 })).toBe(true);
    expect(by('swing', { swingHits: 1 })).toBe(false);
    expect(by('swing', { swingHits: 2 })).toBe(true);
    expect(by('beam', { beamHits: 2 })).toBe(true);
    expect(by('gems', { gems: 2 })).toBe(false);
    expect(by('gems', { gems: 3 })).toBe(true);
    expect(by('levelup', { powerupPicked: true })).toBe(true);
    expect(by('dodge', { dodgedCharge: true })).toBe(true);
    expect(by('strike', { cabKilled: true })).toBe(true);
    expect(by('wet', { wetShocks: true })).toBe(true);
    expect(by('storm', { strikeAvoided: true })).toBe(true);
    expect(by('done', { finished: true })).toBe(true);
    expect(by('done', {})).toBe(false);
  });
});
