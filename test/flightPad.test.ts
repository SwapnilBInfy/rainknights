import { describe, expect, it } from 'vitest';
import { onPad, PAD_CHARGE_MS, PAD_DRAIN, PAD_OFFSET, PAD_REACH, padCenterFor, stepPadCharge } from '../src/systems/flightPad';
import { generateMap, PLAZA_RADIUS, isSolid } from '../src/systems/mapGen';
import { REGIONS } from '../src/config/regions';
import { TILE } from '../src/config/constants';

describe('the flight pad in a city', () => {
  it('sits to the east of where the knight starts, and counts only when they stand on it', () => {
    const spawn = { x: 800, y: 800 };
    const pad = padCenterFor(spawn);
    expect(pad).toEqual({ x: 800 + PAD_OFFSET, y: 800 });
    expect(onPad(spawn, pad)).toBe(false); // the knight does not start on it
    expect(onPad(pad, pad)).toBe(true);
    expect(onPad({ x: pad.x + PAD_REACH, y: pad.y - PAD_REACH }, pad)).toBe(true);
    expect(onPad({ x: pad.x + PAD_REACH + 1, y: pad.y }, pad)).toBe(false);
  });

  it('fills while the knight stands on it, and flies out only when full', () => {
    let charge = 0;
    for (let ms = 0; ms < PAD_CHARGE_MS - 100; ms += 50) charge = stepPadCharge(charge, true, 50);
    expect(charge).toBeLessThan(1);
    expect(charge).toBeGreaterThan(0.9);
    charge = stepPadCharge(charge, true, 200);
    expect(charge).toBe(1);
  });

  it('drains quickly when they step off, so a pass over it in a fight does nothing', () => {
    expect(stepPadCharge(0.5, false, (PAD_CHARGE_MS / PAD_DRAIN) * 0.25)).toBeCloseTo(0.25, 9);
    expect(stepPadCharge(0.2, false, 5000)).toBe(0);
    // a quick dash across: ~0.25 s on the pad is nowhere near enough
    expect(stepPadCharge(0, true, 250)).toBeLessThan(0.2);
  });

  it('is on clear ground in every city, for any seed, and the knight starts off it', () => {
    for (const region of REGIONS) {
      for (const seed of [1, 33, 4242, 90210, 777777]) {
        const { grid, spawn } = generateMap(region.id, seed);
        const at = { x: (spawn.col + 0.5) * TILE, y: (spawn.row + 0.5) * TILE };
        const pad = padCenterFor(at);
        expect(Math.hypot(pad.x - at.x, pad.y - at.y)).toBeLessThan((PLAZA_RADIUS - 1) * TILE);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const col = Math.floor((pad.x + dx * 16) / TILE);
            const row = Math.floor((pad.y + dy * 16) / TILE);
            expect(isSolid(grid[row][col]), `${region.id} ${seed} ${col},${row}`).toBe(false);
          }
        }
        expect(onPad(at, pad)).toBe(false);
      }
    }
  });
});
