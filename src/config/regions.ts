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
  },
];

export function getRegion(id: string | undefined): RegionDef {
  return REGIONS.find((r) => r.id === id) ?? REGIONS[0];
}
