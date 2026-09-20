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
};

export const RAIN_IMP = { main: 0x3aa0e0, highlight: 0x9fd8ff, shadow: 0x1c5f8f };
export const WIND_WRAITH = { main: 0xbfe9e6, highlight: 0xffffff, shadow: 0x6fb6b0 };
export const HAIL_BRUTE = { main: 0xc9d3da, highlight: 0xffffff, shadow: 0x7c8894 };
export const LIGHTNING_WISP = { main: 0xf5e13a, highlight: 0xfff9b0, shadow: 0xb8951a };
export const SNOW_GOLEM = { main: 0xdfeaf5, highlight: 0xffffff, shadow: 0x9db4c9 };
export const TORNADO_BOSS = { main: 0x6c5b8f, highlight: 0xa695c9, shadow: 0x3b2f57 };

export const XP_GEM = { main: 0x4be05a, highlight: 0xb6ffb8, shadow: 0x1f8a2e };
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
