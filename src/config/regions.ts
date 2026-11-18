import type { SongKey } from '../audio/music';

export interface RegionDef {
  id: string;
  name: string;
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
}

export const REGIONS: RegionDef[] = [
  {
    id: 'nyc',
    name: 'New York City',
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
  },
];

export function getRegion(id: string | undefined): RegionDef {
  return REGIONS.find((r) => r.id === id) ?? REGIONS[0];
}
