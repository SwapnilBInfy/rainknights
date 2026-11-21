import { describe, expect, it } from 'vitest';
import { TileType, isSolid } from '../src/systems/mapGen';
import {
  HOUSE,
  MARKET,
  TOWN,
  TOWN_ROWS,
  cellOf,
  houseGrid,
  marketGrid,
  reachableFrom,
  sameCell,
  townGrid,
  UNDERCROFT,
  undercroftGrid,
} from '../src/town/mistford';
import { STORY_SPOTS } from '../src/town/storyTown';

describe('the Undercroft', () => {
  it('is a closed room with the stairs up, Aurel\'s statue, two plaques and the pedestal, all reachable', () => {
    expect(undercroftGrid.length).toBeGreaterThan(8);
    expect(undercroftGrid.every((row) => row.length === undercroftGrid[0].length)).toBe(true);
    expect(UNDERCROFT.plaques).toHaveLength(2);
    const reached = reachableFrom(undercroftGrid, UNDERCROFT.spawn);
    const below = (c: { col: number; row: number }) => `${c.col},${c.row + 1}`;
    expect(reached.has(`${UNDERCROFT.exit.col},${UNDERCROFT.exit.row}`)).toBe(true);
    // each prop can be walked up to from the south, where the knight stands to use it
    for (const c of [UNDERCROFT.statue, UNDERCROFT.pedestal, ...UNDERCROFT.plaques]) expect(reached.has(below(c)), `${c.col},${c.row}`).toBe(true);
    // walled all round
    for (let c = 0; c < undercroftGrid[0].length; c++) {
      expect(isSolid(undercroftGrid[0][c])).toBe(true);
      expect(isSolid(undercroftGrid[undercroftGrid.length - 1][c])).toBe(true);
    }
    expect(sameCell(UNDERCROFT.spawn, UNDERCROFT.exit)).toBe(false);
  });

  it('the cellar hatch and the step beside it, in the alcove, clear of the altar and Marrow', () => {
    expect(sameCell(TOWN.hatch, TOWN.hatchExit)).toBe(false);
    expect(Math.abs(TOWN.hatch.row - TOWN.hatchExit.row) + Math.abs(TOWN.hatch.col - TOWN.hatchExit.col)).toBe(1);
    for (const spot of [STORY_SPOTS.vane, STORY_SPOTS.altar, STORY_SPOTS.marrow, STORY_SPOTS.quill]) expect(sameCell(spot, TOWN.hatch), 'not under a prop').toBe(false);
    expect(STORY_SPOTS.hatch).toEqual(TOWN.hatch);
  });
});

describe('Mistford map', () => {
  it('is a small rectangle with a clear road from the plaza to the house, the market and the flight pad', () => {
    expect(TOWN_ROWS.every((row) => row.length === TOWN_ROWS[0].length)).toBe(true);
    expect(townGrid.length).toBeGreaterThan(10);
    expect(townGrid[0].length).toBeGreaterThan(15);
    const reached = reachableFrom(townGrid, TOWN.spawn);
    for (const cell of [TOWN.houseMat, TOWN.shopMat, TOWN.houseExit, TOWN.shopExit, TOWN.padSpawn, TOWN.hatch, TOWN.hatchExit, ...TOWN.pad]) {
      expect(reached.has(`${cell.col},${cell.row}`), `${cell.col},${cell.row}`).toBe(true);
    }
    expect(isSolid(townGrid[TOWN.spawn.row][TOWN.spawn.col])).toBe(false);
    expect(townGrid[2][3]).toBe(TileType.BUILDING);
    expect(reached.has('3,2')).toBe(false);
  });

  it('has no way out on foot: cities are reached only by flying from the pad', () => {
    expect('gates' in TOWN).toBe(false);
    // the south edge is a closed row of floor against the wall, with nothing that leads anywhere
    const bottom = townGrid.length - 1;
    for (let c = 0; c < townGrid[0].length; c++) expect(isSolid(townGrid[bottom][c]), `edge ${c}`).toBe(true);
    expect(TOWN_ROWS.some((row) => row.includes('*'))).toBe(false);
  });

  it('has a 2x2 flight pad, clear of the road, the pond and the villagers, that you land on', () => {
    expect(TOWN.pad).toHaveLength(4);
    expect(new Set(TOWN.pad.map((c) => c.col)).size).toBe(2);
    expect(new Set(TOWN.pad.map((c) => c.row)).size).toBe(2);
    expect(TOWN.pad.some((c) => sameCell(c, TOWN.padSpawn))).toBe(true);
    for (const cell of TOWN.pad) {
      expect(isSolid(townGrid[cell.row][cell.col])).toBe(false);
      expect(townGrid[cell.row][cell.col]).not.toBe(TileType.SHALLOW);
    }
  });

  it('keeps the house and market doors a step away from where you appear', () => {
    expect(sameCell(HOUSE.spawn, HOUSE.door)).toBe(false);
    expect(sameCell(MARKET.spawn, MARKET.door)).toBe(false);
    expect(reachableFrom(houseGrid, HOUSE.spawn).has(`${HOUSE.door.col},${HOUSE.door.row}`)).toBe(true);
    expect(reachableFrom(houseGrid, HOUSE.spawn).has(`${HOUSE.bed.col},${HOUSE.bed.row}`)).toBe(true);
    expect(reachableFrom(marketGrid, MARKET.spawn).has(`${MARKET.door.col},${MARKET.door.row}`)).toBe(true);
    expect(marketGrid[3].every((tile, col) => col === 0 || col === marketGrid[3].length - 1 || tile === TileType.BUILDING)).toBe(true);
    const feet = cellOf(MARKET.spawn.col * 16 + 8, MARKET.spawn.row * 16 + 8);
    expect(sameCell(feet, MARKET.door)).toBe(false);
  });
});
