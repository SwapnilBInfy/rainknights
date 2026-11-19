import type { SongKey } from '../audio/music';

export interface RegionDef {
  id: string;
  name: string;
  /** Fits the picker's list when the full name is too long. */
  shortName?: string;
  subtitle: string;
  lat: number;
  lon: number;
  emblemKey: string;
  terrainTilesKey: string;
  music: SongKey;
  /** Enemy type that replaces some of each front's spawns here (none = just the shared roster). */
  signature?: string;
  /** Message shown the first time the signature enemy appears (2 lines, 27 chars each). */
  signatureHint?: string;
  /** The boss that arrives at the 5:00 mark; defeating it wins the run. */
  boss: string;
  /** Message shown when the boss arrives (2 lines, 27 chars each). */
  bossIntro?: string;
  /** Seconds into the run when the boss arrives (default 5:00). */
  bossAt?: number;
  /** A place only the story takes you: not in the city list, and not on the flight map until the story marks it. */
  story?: boolean;

  /** How the world is laid out: a street grid, or a coast with an ocean edge. */
  layout: 'city' | 'coast';
  /** What the world is dressed with: street lamps, cars and lane lines, or palms, umbrellas and boardwalks. */
  dress: 'street' | 'beach';
  /** Layout tuning. Anything left out uses the New York / Miami defaults. */
  tuning?: LayoutTuning;
  /** Which of the weather rules read the live forecast: cold and wind cut-offs. */
  climate: Climate;
  /** Tint and temperature shown when the forecast cannot be fetched. */
  fallback: { tint: number; temp: number };
}

/** Tuning for the street-grid layout. */
export interface CityTuning {
  /** Half-width range of the river, in tiles. `[0, 0]` means no river at all. */
  river: [number, number];
  /** Share of city blocks that are built up, then the share that are parks (the rest are empty lots). */
  built: number;
  park: number;
  /** Tiles between parallel streets (x then y). */
  gapX: [number, number];
  gapY: [number, number];
}

/** Tuning for the coastal layout. */
export interface CoastTuning {
  canals: [number, number];
  /** How many resort or apartment buildings to place. */
  buildings: number;
}

export type LayoutTuning = Partial<CityTuning> & Partial<CoastTuning>;

/** How a city's live forecast becomes a front. */
export interface Climate {
  /** `temperate` cities get Thunderstorm / Cold Front / Wind / Rain / Clear; `tropical` ones get the storm-and-heat set. */
  kind: 'temperate' | 'tropical';
  /** Temperature (C) at or below which a temperate city has a Cold Front. */
  coldAt?: number;
  /** Wind speed (km/h) at which a temperate city is Windy. */
  windyAt?: number;
  /** Wind speed (km/h) that turns a storm into a hurricane or typhoon. Temperate cities never do if this is left out. */
  stormWindAt?: number;
  /** Temperature (C) at which a tropical city has a Heat front, and the humidity (%) for a Humid one. */
  heatAt?: number;
  humidAt?: number;
}

export const REGIONS: RegionDef[] = [
  {
    id: 'nyc',
    name: 'New York City',
    shortName: 'New York',
    subtitle: 'The Gray Storm',
    lat: 40.7128,
    lon: -74.006,
    emblemKey: 'emblem_nyc',
    terrainTilesKey: 'terrainTiles_nyc',
    music: 'nyc',
    signature: 'cabWraith',
    signatureHint: 'Cab Wraiths charge in\nstraight lines. Sidestep!',
    boss: 'phantomBus',
    bossIntro: 'The Phantom Bus roars in!\nSidestep its charge lane!',
    layout: 'city',
    dress: 'street',
    climate: { kind: 'temperate', coldAt: 5, windyAt: 30 },
    fallback: { tint: 0x8fe0ff, temp: 15 },
  },
  {
    id: 'miami',
    name: 'Miami',
    subtitle: 'The Amber Heat',
    lat: 25.7617,
    lon: -80.1918,
    emblemKey: 'emblem_miami',
    terrainTilesKey: 'terrainTiles_miami',
    music: 'miami',
    boss: 'tornadoBoss',
    layout: 'coast',
    dress: 'beach',
    climate: { kind: 'tropical', stormWindAt: 60, heatAt: 30, humidAt: 70 },
    fallback: { tint: 0xffe9b3, temp: 28 },
  },
  {
    // Drizzle city: a wide, winding river, a lot of parks, and a night bus that never stops running.
    id: 'london',
    name: 'London',
    subtitle: 'The Soft Drizzle',
    lat: 51.5072,
    lon: -0.1276,
    emblemKey: 'emblem_london',
    terrainTilesKey: 'terrainTiles_london',
    music: 'london',
    boss: 'phantomBus',
    bossIntro: 'The Night Bus thunders in!\nSidestep its charge lane!',
    layout: 'city',
    dress: 'street',
    tuning: { river: [3, 4], built: 0.38, park: 0.4, gapX: [13, 17], gapY: [11, 15] },
    climate: { kind: 'temperate', coldAt: 3, windyAt: 35 },
    fallback: { tint: 0x9fb8c8, temp: 11 },
  },
  {
    // Neon city: tight blocks, narrow streets, almost no open ground, and typhoon season.
    id: 'tokyo',
    name: 'Tokyo',
    subtitle: 'The Neon Typhoon',
    lat: 35.6762,
    lon: 139.6503,
    emblemKey: 'emblem_tokyo',
    terrainTilesKey: 'terrainTiles_tokyo',
    music: 'tokyo',
    boss: 'tornadoBoss',
    layout: 'city',
    dress: 'street',
    tuning: { river: [1, 1], built: 0.94, park: 0.04, gapX: [11, 14], gapY: [10, 13] },
    climate: { kind: 'temperate', coldAt: 2, windyAt: 32, stormWindAt: 55 },
    fallback: { tint: 0xc8a0e8, temp: 18 },
  },
  {
    // Monsoon city: a crowded seafront, a lot of buildings, and rain that does not stop for months.
    id: 'mumbai',
    name: 'Mumbai',
    subtitle: 'The Monsoon Tide',
    lat: 19.076,
    lon: 72.8777,
    emblemKey: 'emblem_mumbai',
    terrainTilesKey: 'terrainTiles_mumbai',
    music: 'mumbai',
    boss: 'tornadoBoss',
    layout: 'coast',
    dress: 'beach',
    tuning: { canals: [1, 2], buildings: 30 },
    climate: { kind: 'tropical', stormWindAt: 50, heatAt: 34, humidAt: 78 },
    fallback: { tint: 0x7fc8a8, temp: 30 },
  },
  {
    // The finale: a storm island in the Pacific where the Tempest Regent waits. Only the story goes here.
    id: 'stormhold',
    name: 'The Eye',
    shortName: 'The Eye',
    subtitle: 'The Black Storm',
    lat: 5,
    lon: -149.5,
    emblemKey: 'emblem_stormhold',
    terrainTilesKey: 'terrainTiles_stormhold',
    music: 'stormhold',
    boss: 'tempestRegent',
    bossIntro: 'The Tempest Regent rises!\nIts storm answers its call.',
    bossAt: 50,
    story: true,
    layout: 'coast',
    dress: 'beach',
    tuning: { canals: [1, 1], buildings: 8 },
    climate: { kind: 'tropical', stormWindAt: 30 },
    fallback: { tint: 0x2a1f3a, temp: 24 },
  },
];

/** The cities you can pick from the list and fly to; the story's own places are left out. */
export const CITIES: RegionDef[] = REGIONS.filter((r) => !r.story);

export function getRegion(id: string | undefined): RegionDef {
  return REGIONS.find((r) => r.id === id) ?? REGIONS[0];
}
