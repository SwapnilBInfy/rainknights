import { describe, expect, it } from 'vitest';
import { eachKeyEventOnce } from '../src/input/keyEvents';

const press = (key: string) => ({ key, type: 'keydown' }) as KeyboardEvent;

describe('eachKeyEventOnce', () => {
  it('runs the handler once per DOM event, even when Phaser dispatches it again', () => {
    const seen: string[] = [];
    const handle = eachKeyEventOnce((e) => seen.push(e.key));
    const a = press('ArrowDown');
    const b = press('ArrowDown');
    // Phaser replays the frame's queue on every new event: a, then a and b, then a and b again.
    for (const e of [a, a, b, a, b]) handle(e);
    expect(seen).toEqual(['ArrowDown', 'ArrowDown']);
  });

  it('keeps separate state per wrapped handler', () => {
    const one: string[] = [];
    const two: string[] = [];
    const first = eachKeyEventOnce((e) => one.push(e.key));
    const second = eachKeyEventOnce((e) => two.push(e.key));
    const e = press('s');
    first(e);
    second(e);
    expect([one, two]).toEqual([['s'], ['s']]);
  });
});
