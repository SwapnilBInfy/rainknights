import { describe, expect, it } from 'vitest';
import { DIGIT_GLYPHS, digitWidth } from '../src/ui/digits';

describe('pixel digits', () => {
  it('draws 8 closed on both sides, not as an S', () => {
    const eight = DIGIT_GLYPHS['8'];
    const five = DIGIT_GLYPHS['5'];
    expect(eight).toEqual(['111', '101', '111', '101', '111']);
    // The middle band and the side rows keep ink on the left and the right.
    for (const row of [eight[1], eight[2], eight[3]]) {
      expect(row[0]).toBe('1');
      expect(row[2]).toBe('1');
    }
    // 5 is the open, S-like shape and must not be what an 8 uses.
    expect(five[1]).toBe('100');
    expect(five[3]).toBe('001');
    expect(eight).not.toEqual(five);
  });

  it('measures a run of digits with a one-pixel gap', () => {
    expect(digitWidth('')).toBe(0);
    expect(digitWidth('8')).toBe(3);
    expect(digitWidth('20')).toBe(7);
  });
});
