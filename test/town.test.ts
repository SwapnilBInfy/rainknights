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
} from '../src/town/mistford';

describe('Mistford map', () => {
  it('is a small rectangle with a clear road from the plaza to the house, the market, and the south gate', () => {
    expect(TOWN_ROWS.every((row) => row.length === TOWN_ROWS[0].length)).toBe(true);
    expect(townGrid.length).toBeGreaterThan(10);
    expect(townGrid[0].length).toBeGreaterThan(15);
    const reached = reachableFrom(townGrid, TOWN.spawn);
    for (const cell of [TOWN.houseMat, TOWN.shopMat, TOWN.houseExit, TOWN.shopExit, TOWN.padSpawn, ...TOWN.pad, ...TOWN.gates]) {
      expect(reached.has(`${cell.col},${cell.row}`), `${cell.col},${cell.row}`).toBe(true);
    }
    expect(isSolid(townGrid[TOWN.spawn.row][TOWN.spawn.col])).toBe(false);
    expect(townGrid[2][3]).toBe(TileType.BUILDING);
    expect(reached.has('3,2')).toBe(false);
    expect(sameCell(TOWN.spawn, TOWN.gates[0])).toBe(false);
  });

  it('has a 2x2 flight pad, clear of the road, the pond and the villagers, that you land on', () => {
    expect(TOWN.pad).toHaveLength(4);
    expect(new Set(TOWN.pad.map((c) => c.col)).size).toBe(2);
    expect(new Set(TOWN.pad.map((c) => c.row)).size).toBe(2);
    expect(TOWN.pad.some((c) => sameCell(c, TOWN.padSpawn))).toBe(true);
    for (const cell of TOWN.pad) {
      expect(TOWN.gates.some((g) => sameCell(g, cell))).toBe(false);
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
