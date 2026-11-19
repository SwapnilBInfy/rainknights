import type { TerrainTheme } from './tiles';

// Small limited retro palette. Kept intentionally narrow for a chunky, GBA-era feel.
export const OUTLINE = 0x14121f;

export const NYC_TERRAIN: TerrainTheme = {
  style: 'pavement',
  groundA: 0x9aa2b2,
  groundB: 0x8e96a8,
  pathA: 0x555c6c,
  pathB: 0xe8d050,
  water: 0x5c8cc8,
  waterLight: 0x98c0f0,
  waterDark: 0x3c64a0,
  rock: 0x7c7f8c,
  rockLight: 0xa8acb8,
  rockDark: 0x3c3e4a,
  roof: 0x6a6f82,
  roofLight: 0x8e94a8,
  roofDark: 0x383c4c,
  roofVent: 0x4a4e60,
};

export const MIAMI_TERRAIN: TerrainTheme = {
  style: 'sand',
  groundA: 0xf0dc98,
  groundB: 0xe6cc80,
  pathA: 0xc09058,
  pathB: 0x8c6238,
  water: 0x38c0c0,
  waterLight: 0x88f0e8,
  waterDark: 0x1c8890,
  rock: 0xe89080,
  rockLight: 0xf8c0b0,
  rockDark: 0x8a4a40,
  roof: 0xf0a0b8,
  roofLight: 0xffd0dc,
  roofDark: 0xa05878,
  roofVent: 0x78d0c8,
};


/** London: damp slate pavement, brick-red roofs, a wide grey-green Thames. */
export const LONDON_TERRAIN: TerrainTheme = {
  style: 'pavement',
  groundA: 0x8fa088,
  groundB: 0x84967e,
  pathA: 0x5a5e66,
  pathB: 0xd8d0b0,
  water: 0x4f7a8a,
  waterLight: 0x8cb6c0,
  waterDark: 0x2e5260,
  rock: 0x7a7c78,
  rockLight: 0xa8aaa4,
  rockDark: 0x3a3c3a,
  roof: 0x8a4a42,
  roofLight: 0xb8726a,
  roofDark: 0x4a2622,
  roofVent: 0x5e5a5a,
};

/** Tokyo: dark asphalt, cool lilac concrete, neon-bright canal and roofs. */
export const TOKYO_TERRAIN: TerrainTheme = {
  style: 'pavement',
  groundA: 0x8c88a8,
  groundB: 0x817da0,
  pathA: 0x3c3a52,
  pathB: 0xf0e8f8,
  water: 0x4a68d0,
  waterLight: 0x8aa8f8,
  waterDark: 0x2a3c8c,
  rock: 0x6c6a84,
  rockLight: 0x9a98b4,
  rockDark: 0x32304a,
  roof: 0x4a4668,
  roofLight: 0x7a74a8,
  roofDark: 0x24223a,
  roofVent: 0xe05890,
};

/** Mumbai: terracotta ground, monsoon-green shallows, a heavy teal sea. */
export const MUMBAI_TERRAIN: TerrainTheme = {
  style: 'sand',
  groundA: 0xd8b078,
  groundB: 0xcea468,
  pathA: 0x9a6a40,
  pathB: 0x6a4428,
  water: 0x2f9a98,
  waterLight: 0x7ad8c8,
  waterDark: 0x1a6068,
  rock: 0xb87a58,
  rockLight: 0xe0a888,
  rockDark: 0x6a3c2a,
  roof: 0xd86c48,
  roofLight: 0xf8a078,
  roofDark: 0x8a3c28,
  roofVent: 0x58b8a0,
};

export const TERRAIN_THEMES: Record<string, TerrainTheme> = {
  nyc: NYC_TERRAIN,
  miami: MIAMI_TERRAIN,
  london: LONDON_TERRAIN,
  tokyo: TOKYO_TERRAIN,
  mumbai: MUMBAI_TERRAIN,
};

/** Colours for the decor layer (shorelines, curbs, buildings, props), by city. */
export type DecorPalette = Record<import('../systems/decorRules').Role, number>;

const DECOR_COMMON = {
  foam: 0xeaf8ff,
  foamSoft: 0xcfeefa,
  deepEdge: 0x2c5488,
  deckShadow: 0x10243c,
  iceEdge: 0xffffff,
  iceCrack: 0x86b4d2,
  shadow: 0x101828,
  leaf: 0x3aa84c,
  leafLight: 0x7ee07a,
  leafDark: 0x1e6a34,
  trunk: 0x7a4a2c,
  frond: 0x2f9a48,
  frondLight: 0x74d878,
  carGlass: 0x8fd8f0,
  carTire: 0x1a1a24,
  lampPole: 0x30343c,
  lampLight: 0xfff4a8,
  hydrant: 0xd8382c,
  hydrantCap: 0xf0f0f0,
  railDark: 0x2a2c38,
  railLight: 0xa8acb8,
  vent: 0x474b5c,
  ventLight: 0x8e94a8,
} as const;

export const DECOR_NYC: DecorPalette = {
  ...DECOR_COMMON,
  curb: 0xc0c4d0,
  curbShade: 0x2a2c38,
  lane: 0xe8d050,
  parapetLight: 0x9ea4b8,
  parapetDark: 0x2c3040,
  wallFace: 0x9a5a50,
  wallShade: 0x4a2c30,
  window: 0x3a4660,
  windowLit: 0xf8e078,
  carBody: 0xd04038,
  carBody2: 0xe8c838,
  carBody3: 0x4880d8,
  umbrellaA: 0xffffff,
  umbrellaB: 0xff5050,
};

export const DECOR_MIAMI: DecorPalette = {
  ...DECOR_COMMON,
  curb: 0xf8e8b8,
  curbShade: 0x8c6238,
  lane: 0xffffff,
  parapetLight: 0xffe0ea,
  parapetDark: 0xa05878,
  wallFace: 0xf6b8c8,
  wallShade: 0xc87898,
  window: 0x58b8c0,
  windowLit: 0xfff0a0,
  carBody: 0xffffff,
  carBody2: 0xffffff,
  carBody3: 0xffffff,
  umbrellaA: 0xff6a8a,
  umbrellaB: 0xfff4c8,
  railDark: 0x6a4222,
  railLight: 0xe8c890,
  leaf: 0x3aa84c,
};

export const DECOR_LONDON: DecorPalette = {
  ...DECOR_COMMON,
  curb: 0xb8b4a8,
  curbShade: 0x34322e,
  lane: 0xf0e8a0,
  parapetLight: 0xa88a80,
  parapetDark: 0x3a2a28,
  wallFace: 0x9a4a40,
  wallShade: 0x4a2220,
  window: 0x4a5870,
  windowLit: 0xf8dc88,
  carBody: 0x1c1c24,
  carBody2: 0xd83028,
  carBody3: 0x3a5a8a,
  umbrellaA: 0x1c1c24,
  umbrellaB: 0x1c1c24,
  lampLight: 0xffe49a,
  hydrant: 0xe8d048,
};

export const DECOR_TOKYO: DecorPalette = {
  ...DECOR_COMMON,
  curb: 0xc8c4e0,
  curbShade: 0x24223a,
  lane: 0xffffff,
  parapetLight: 0x8c88b8,
  parapetDark: 0x24223a,
  wallFace: 0x58548c,
  wallShade: 0x2c2a4c,
  window: 0x2c3a68,
  windowLit: 0xff78c8,
  carBody: 0xf0f0f8,
  carBody2: 0x28283c,
  carBody3: 0x58d8e8,
  umbrellaA: 0xff78c8,
  umbrellaB: 0x58d8e8,
  lampLight: 0xff9ad8,
  hydrant: 0xff4a8a,
  leaf: 0x58a878,
  leafLight: 0xf8a8c8,
  leafDark: 0x2e7a58,
};

export const DECOR_MUMBAI: DecorPalette = {
  ...DECOR_COMMON,
  curb: 0xe8cc98,
  curbShade: 0x6a4428,
  lane: 0xf0d860,
  parapetLight: 0xf0b890,
  parapetDark: 0x8a3c28,
  wallFace: 0xe89058,
  wallShade: 0xa85a38,
  window: 0x2f6a78,
  windowLit: 0xffe890,
  carBody: 0xf0c830,
  carBody2: 0x28282c,
  carBody3: 0xf0c830,
  umbrellaA: 0xf06848,
  umbrellaB: 0xffe8a0,
  railDark: 0x5a3820,
  railLight: 0xe0b888,
  leaf: 0x2e9a48,
};

export const DECOR_PALETTES: Record<string, DecorPalette> = {
  nyc: DECOR_NYC,
  miami: DECOR_MIAMI,
  london: DECOR_LONDON,
  tokyo: DECOR_TOKYO,
  mumbai: DECOR_MUMBAI,
};

export const RAIN_IMP = { main: 0x3aa0e0, highlight: 0x9fd8ff, shadow: 0x1c5f8f };
export const WIND_WRAITH = { main: 0xbfe9e6, highlight: 0xffffff, shadow: 0x6fb6b0 };
export const HAIL_BRUTE = { main: 0xc9d3da, highlight: 0xffffff, shadow: 0x7c8894 };
export const LIGHTNING_WISP = { main: 0xf5e13a, highlight: 0xfff9b0, shadow: 0xb8951a };
export const SNOW_GOLEM = { main: 0xdfeaf5, highlight: 0xffffff, shadow: 0x9db4c9 };
export const TORNADO_BOSS = { main: 0x6c5b8f, highlight: 0xa695c9, shadow: 0x3b2f57 };

export const XP_GEM = { main: 0x4be05a, highlight: 0xb6ffb8, shadow: 0x1f8a2e };
export const COIN = { main: 0xf8d040, highlight: 0xfff6a0, shadow: 0xc08010 };
export const SUPPLY = { main: 0xe8c090, highlight: 0xfff0d0, shadow: 0xa07040 };
export const PROJECTILE = { main: 0x8fe0ff, highlight: 0xffffff, shadow: 0x3f9ec9 };

export const PU_SUN = { main: 0xffb020, highlight: 0xfff2b0, shadow: 0xb87200 };
export const PU_RAINBOW = { main: 0xff5fa2, highlight: 0xffffff, shadow: 0x7a2fd6 };
export const PU_GALE = { main: 0xb9f5c0, highlight: 0xffffff, shadow: 0x5fbf70 };
export const PU_FROST = { main: 0xaee9ff, highlight: 0xffffff, shadow: 0x5fa9d6 };
export const PU_STATIC = { main: 0xfff066, highlight: 0xffffff, shadow: 0xc9a800 };

// GBA-Pokémon-style UI colors (text boxes, HP bars, menus).
export const UI = {
  ink: 0x383838,
  inkSoft: 0x686868,
  paper: 0xf8f8f8,
  paperShade: 0xd8d8e0,
  border: 0x505868,
  borderLight: 0xa8b0c0,
  hpGreen: 0x48d048,
  hpYellow: 0xf8b800,
  hpRed: 0xf03830,
  hpTrack: 0x484848,
  xpBlue: 0x48a0f8,
  bg: 0x0a0a12,
  accent: 0xe8a010,
};
