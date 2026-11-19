/**
 * The world map under the knight when they fly. Plain data + math (no Phaser) so it can be unit-tested:
 * a projection from latitude and longitude to map pixels, a coarse outline of the continents, a land mask
 * rasterised from those outlines, where each location's star goes, and how a flight moves.
 *
 * The outlines are deliberately rough: a few dozen points per continent, enough to be recognisable on a
 * 240x160 screen without pretending to be an atlas.
 */

/** Map pixels per degree. The world is 360 x 180 degrees, equirectangular. */
export const PX_PER_DEG = 3;
export const MAP_W = 360 * PX_PER_DEG;
export const MAP_H = 180 * PX_PER_DEG;

export type LonLat = readonly [number, number];

/** Longitude and latitude (degrees) to map pixels. */
export function project(lon: number, lat: number): { x: number; y: number } {
  return { x: (lon + 180) * PX_PER_DEG, y: (90 - lat) * PX_PER_DEG };
}

export function unproject(x: number, y: number): { lon: number; lat: number } {
  return { lon: x / PX_PER_DEG - 180, lat: 90 - y / PX_PER_DEG };
}

// ---- Outlines (lon, lat) ---------------------------------------------------------------------------------

const NORTH_AMERICA: LonLat[] = [
  [-168, 65], [-163, 69], [-156, 71], [-141, 69.5], [-128, 70], [-115, 68], [-105, 68], [-95, 70], [-90, 68], [-85, 69],
  [-82, 66], [-90, 64], [-94, 60], [-93, 57], [-85, 55], [-80, 52], [-79, 55], [-78, 60], [-72, 61], [-65, 60],
  [-62, 57], [-56, 52], [-60, 48], [-66, 44.5], [-70, 43], [-70, 41.5], [-74, 40.5], [-76, 37], [-76, 35], [-81, 31],
  [-80, 27], [-80, 25.3], [-82, 26.8], [-83, 29.5], [-85, 30], [-89, 30], [-91, 29], [-94, 29.5], [-97, 27], [-97.5, 22],
  [-96, 19], [-94, 18.3], [-91, 19], [-90, 21], [-87, 21.5], [-88, 18], [-88.5, 15.8], [-84, 15.5], [-83.5, 11], [-80, 9],
  [-77.5, 8.5], [-80, 7.5], [-83, 8.5], [-86, 11], [-88, 13], [-92, 14.5], [-96, 15.8], [-101, 17.5], [-105.5, 20],
  [-105.5, 23], [-109, 26], [-112.5, 31], [-114.7, 31.7], [-117, 32.5], [-120.5, 34.5], [-122.5, 37.5], [-124, 40.5],
  [-124.5, 46], [-124, 48.5], [-128, 51], [-131, 54.5], [-135, 58], [-140, 59.8], [-148, 60.5], [-152, 59], [-158, 56.5],
  [-165, 54.5], [-160, 58.5], [-162, 60.5], [-165, 62.5],
];

const SOUTH_AMERICA: LonLat[] = [
  [-77.5, 8.5], [-72, 12], [-67, 10.8], [-62, 10.5], [-58, 7], [-52, 5], [-50, 0], [-44, -2.5], [-35, -5.5], [-35, -9],
  [-39, -14], [-39, -18], [-41, -22], [-45, -23.5], [-48.5, -26], [-49, -29], [-53, -33.5], [-57, -35], [-57.5, -38],
  [-62, -39], [-65, -41], [-64, -45], [-67.5, -46.5], [-66, -48], [-69, -51], [-68.5, -54], [-72, -54], [-75, -50],
  [-74, -44], [-73.5, -38], [-71.5, -30], [-70.5, -22], [-70.3, -18], [-75, -15], [-79, -8], [-81, -5], [-80, -2],
  [-78.5, 2], [-77.5, 4],
];

const EURASIA: LonLat[] = [
  [-9.3, 43.2], [-9, 37], [-6, 36.2], [-2, 36.7], [0, 38.7], [3, 42], [3.5, 43.3], [6.5, 43.1], [8.8, 44.3], [10.5, 43],
  [12.2, 41.8], [15.5, 40], [16, 38], [17.2, 39], [18.5, 40.2], [16.5, 41.2], [13.5, 43.5], [12.3, 44.8], [13.7, 45.6],
  [15, 44], [19, 41.5], [19.5, 40], [21, 38], [23.5, 37.5], [26, 40.5], [27, 37], [30, 36.3], [36, 36.6], [36, 34],
  [35, 29.5], [39, 22], [42.5, 16], [43.5, 12.7], [45, 12.8], [52, 16], [55, 17.5], [58.5, 20.5], [59.8, 22.5],
  [56.5, 24.5], [56.3, 26.2], [54, 24.2], [51.5, 24.5], [50.5, 26], [48.5, 29.8], [50, 30], [51.5, 27.5], [52, 27.5],
  [56.5, 27], [57, 25.5], [61.5, 25], [66.5, 25.4], [68, 23.5], [70, 21], [72.7, 21.2], [72.8, 19.1], [73.5, 16],
  [74.8, 12.8], [76.5, 9], [77.5, 8], [78.5, 8.8], [80, 10.3], [80.2, 13], [80.2, 15.8], [82.5, 17], [85, 19.8], [87, 21.5],
  [89, 21.8], [91.5, 22.5], [92.5, 20.5], [94, 18], [94.5, 16], [97.5, 16.5], [98.5, 13], [98.5, 9], [100, 6.5],
  [101.3, 3.5], [103.5, 1.3], [104.2, 2.5], [103.4, 5], [102.2, 6.5], [100.7, 10], [100, 13], [102.5, 12.2], [105, 8.7],
  [106.5, 10.5], [108.5, 11.5], [109.3, 13], [108.5, 15.5], [106.5, 18.5], [105.8, 19.8], [108, 21.5], [110, 20.8],
  [111, 21.5], [114, 22.3], [117, 23.5], [119.5, 25.5], [121.5, 28.5], [122, 30.8], [121, 32], [120.5, 35], [119, 37],
  [122.5, 37.2], [121, 38.8], [121.5, 40.5], [124, 39.8], [125, 38], [126.5, 37], [126.5, 34.8], [129, 35.2],
  [129.5, 37], [128, 38.5], [128.5, 39.8], [130, 42.5], [133, 43], [135.5, 43.8], [138, 46], [140.5, 48.5], [141, 52],
  [138, 54], [141, 58.5], [143, 59.3], [150, 59.5], [155, 59.5], [156.5, 57], [156, 51], [157, 51.5], [160, 54.5],
  [163, 57.5], [162.5, 60.5], [160, 61.5], [165, 62.5], [170, 60], [178, 64.5], [180, 65], [180, 68.5], [170, 69.8],
  [160, 69.5], [150, 71.3], [140, 72.5], [130, 71], [125, 73.5], [113, 74], [106, 77.5], [100, 76.5], [95, 76],
  [87, 75], [80, 73], [73, 72], [69, 73], [66, 69.5], [60, 69], [53, 68.5], [44, 68.5], [40, 66.5], [35, 66],
  [32, 69.5], [30, 70.2], [25, 71], [20, 70], [15, 68.5], [12, 65], [8, 63], [5.5, 61], [5, 59], [8, 58], [10, 57.5],
  [8.2, 56], [8.5, 54.5], [7, 53.5], [4.5, 52.5], [3.5, 51.3], [1.8, 51], [1.5, 50.2], [-1.5, 49.7], [-1.2, 48.7],
  [-4.5, 48.4], [-2.5, 47.3], [-1.2, 46], [-1.5, 44.5], [-1.8, 43.4], [-4, 43.4], [-8, 43.7],
];

const AFRICA: LonLat[] = [
  [-17, 21], [-16, 16], [-17, 14.7], [-15, 11], [-13, 8], [-9, 4.5], [-4.5, 5.2], [1, 6], [4.5, 6.3], [8.5, 4.5],
  [9.5, 3.5], [9.8, 0], [8.8, -1], [12, -5], [13.5, -11.5], [13, -16], [11.7, -17.5], [14.5, -22.5], [15.5, -27],
  [18, -32], [19, -34.8], [25, -34], [30, -31], [32.5, -28], [32.8, -26], [35, -24], [35, -20], [40.5, -15],
  [40.5, -10.5], [39.2, -7], [39, -4.5], [41, -1.5], [44, 1.5], [48, 5], [51, 11.8], [48, 11.3], [43.5, 11.8],
  [43, 12.7], [39.5, 15.5], [37.5, 18], [35.5, 23], [34, 27], [32.5, 29.8], [32, 31.2], [30, 31.2], [25, 31.8],
  [20, 31.8], [19, 30.3], [15, 32.2], [11, 33.2], [10.2, 37], [8, 36.9], [2, 36.6], [-2, 35.2], [-5.9, 35.8],
  [-9.8, 31], [-10, 29], [-13, 27.5], [-16, 23.5],
];

const AUSTRALIA: LonLat[] = [
  [113.5, -22], [114, -26], [115, -34], [118, -35], [123.5, -34], [129, -31.7], [134, -32.8], [137.5, -35], [139.5, -36],
  [141, -38], [144, -38.5], [146.5, -39], [150, -37.5], [151.2, -33.8], [153, -30], [153.5, -27], [150, -22.5],
  [146, -19], [145.4, -15], [143.6, -14], [142.5, -10.7], [141.5, -12.8], [141.5, -17], [139.5, -17.5], [135.5, -15],
  [136.8, -12.2], [132.5, -11.5], [130.5, -12.5], [129.5, -15], [126, -14], [122.3, -17.5], [121, -19.5], [117, -20.7],
  [114, -22],
];

const ISLANDS: Record<string, LonLat[]> = {
  greenland: [[-73, 78], [-60, 82], [-30, 83.5], [-20, 80], [-18, 76], [-22, 70], [-32, 68], [-42, 60], [-50, 62], [-54, 67], [-58, 75]],
  iceland: [[-24, 65.5], [-14, 66.2], [-14, 64.3], [-22, 63.5]],
  britain: [[-5.5, 50], [-3, 50.6], [1.4, 51.2], [1.7, 52.7], [0, 53.5], [-0.5, 54.5], [-1.5, 55.5], [-2.2, 56.5], [-1.8, 57.5], [-3.5, 58.6], [-5, 58.6], [-6, 57], [-5.5, 56], [-4.8, 55], [-3, 54.8], [-3, 53.5], [-4.5, 53.3], [-4.2, 52.2], [-5.2, 51.8], [-3, 51.4], [-5.7, 50.1]],
  ireland: [[-10, 51.7], [-6, 52], [-6, 54.5], [-8, 55.3], [-10, 54.2]],
  baffin: [[-80, 63.5], [-72, 70], [-68, 70], [-61, 66.5], [-65, 62.5], [-73, 62]],
  ellesmere: [[-90, 77], [-78, 83], [-60, 82], [-72, 78], [-80, 76.5]],
  victoria: [[-118, 70], [-105, 73], [-100, 70], [-108, 68.5]],
  newfoundland: [[-59.5, 47.6], [-55, 51.5], [-52.5, 47.5], [-54, 46.8], [-58.5, 47.5]],
  cuba: [[-85, 22], [-82, 23.2], [-78, 22.5], [-74.2, 20.2], [-77.5, 19.9], [-80, 21.5], [-84, 21.8]],
  hispaniola: [[-74.3, 19.7], [-70, 19.8], [-68.5, 18.5], [-71.5, 17.8], [-74.4, 18.4]],
  svalbard: [[11, 78.5], [20, 80.2], [27, 79], [17, 76.7]],
  novayaZemlya: [[52, 71], [58, 75.5], [68, 77], [60, 73.5], [55, 71]],
  madagascar: [[49.3, -12], [50.4, -15.4], [49.5, -17.7], [47.1, -24.9], [45, -25.4], [43.7, -23], [44.5, -19.5], [44, -17], [46.5, -15.7], [48.5, -13.5]],
  honshu: [[130.9, 34], [132.5, 35.4], [135.3, 35.7], [136.8, 37.4], [138.5, 37.4], [139.8, 39.8], [140, 41], [141.5, 41.3], [142, 39.5], [141, 37.5], [140.8, 35.7], [139.8, 35], [138, 34.6], [136.8, 34.4], [135, 33.6], [133.5, 34.3]],
  hokkaido: [[140, 41.5], [141.5, 45.5], [145.5, 43.3], [143, 42], [141, 41.8]],
  kyushu: [[129.7, 33], [131.5, 33.8], [132, 31.5], [130.8, 31], [129.8, 32.5]],
  shikoku: [[132.5, 33.8], [134.5, 34.2], [134.2, 33.2], [133, 32.8]],
  taiwan: [[120.2, 23], [121.5, 25.1], [122, 24.5], [120.8, 22]],
  sriLanka: [[79.8, 9.5], [81.8, 8.5], [81.5, 6.8], [80, 6]],
  sumatra: [[95.3, 5.5], [98, 4], [100.5, 1], [104, -1], [106, -3], [105.8, -5.9], [102.3, -4], [99, -1.5], [96, 2]],
  java: [[105.2, -6.8], [108, -6.3], [111, -6.5], [114.5, -7.8], [114.5, -8.7], [110, -8.2], [106, -7.4]],
  borneo: [[109, 1.5], [111, 2], [113.5, 3.5], [116.5, 7], [119, 5], [117.5, 1], [118, -1], [116, -4], [114, -3.5], [111.5, -3], [110, -1.5]],
  sulawesi: [[119, -5], [120.5, -2], [121, 1], [125, 1.5], [123, -1], [122, -4.5], [121, -3], [120.5, -5.5]],
  newGuinea: [[131, -0.8], [135, -3.3], [138, -1.7], [141, -2.6], [145, -4.5], [147.5, -6], [150.5, -10.5], [146, -8], [143, -9], [141, -9.1], [138.5, -8.3], [137, -5], [133, -4], [132, -2.5]],
  luzon: [[120, 18.5], [122.2, 18.4], [122, 15.5], [124, 13], [121.5, 13.5], [120.5, 14.5]],
  mindanao: [[122, 8], [125, 9.5], [126.5, 7], [126, 6], [124, 6.5], [122.5, 7]],
  nzNorth: [[172.7, -34.4], [175.5, -37], [178.5, -37.7], [176.9, -39.6], [175, -41.5], [174.8, -39.5], [173.8, -36.5]],
  nzSouth: [[172.7, -40.5], [174.3, -41.2], [173, -43], [171, -44.5], [169, -46.5], [166.5, -46], [168, -44], [171, -41.8]],
  tasmania: [[144.7, -40.7], [148.3, -41], [147.8, -43.2], [146, -43.5]],
  antarctica: [[-180, -90], [-180, -77], [-160, -78], [-150, -76], [-125, -73.5], [-100, -73], [-75, -72], [-62, -66], [-58, -63.8], [-65, -68], [-60, -75], [-45, -78], [-30, -76], [-15, -71], [0, -70], [20, -69], [35, -68], [55, -66.5], [70, -68], [80, -67], [100, -66], [120, -66.5], [135, -66], [150, -69], [165, -71], [180, -72], [180, -90]],
};

/** Water inside the land outlines: the Black Sea, the Caspian and the Baltic. */
const INLAND_WATER: LonLat[][] = [
  [[28.5, 41.2], [28.6, 43.5], [29.8, 45.2], [31.5, 46.6], [33.5, 46], [33, 44.6], [36, 45.3], [38, 44.5], [41.5, 41.5], [37, 41], [31, 41.2]],
  [[47, 45.5], [49.5, 46.5], [53, 45], [52, 42], [53.8, 40], [54, 37], [51, 36.7], [49, 37.6], [49, 39.5], [50.3, 40.5], [49.5, 42], [47.5, 43]],
  [[10.2, 54.2], [14, 54.2], [19, 54.5], [21, 57], [23.5, 59.2], [30, 60], [27.5, 60.5], [22, 60.5], [21.5, 61.5], [25, 65.5], [22, 65.8], [17.5, 62.5], [18.5, 60], [16.5, 57], [14, 55.5], [11.5, 56.5], [10.5, 56]],
];

export const LAND_OUTLINES: LonLat[][] = [NORTH_AMERICA, SOUTH_AMERICA, EURASIA, AFRICA, AUSTRALIA, ...Object.values(ISLANDS)];

/** Mistford, the fictional home island: out in the mid-Atlantic, between the Americas and Europe. */
export const MISTFORD_LONLAT: LonLat = [-38, 33];
const MISTFORD_OUTLINE: LonLat[] = [[-41, 34], [-37, 35.2], [-34, 33.6], [-35, 31], [-39, 30.8], [-41.5, 32.2]];

// ---- Rasterising -----------------------------------------------------------------------------------------

function inside(poly: readonly LonLat[], lon: number, lat: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

function fillPolygon(mask: Uint8Array, poly: readonly LonLat[], value: number) {
  const pts = poly.map(([lon, lat]) => project(lon, lat));
  const minY = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y))));
  const maxY = Math.min(MAP_H - 1, Math.ceil(Math.max(...pts.map((p) => p.y))));
  const minX = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x))));
  const maxX = Math.min(MAP_W - 1, Math.ceil(Math.max(...pts.map((p) => p.x))));
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const { lon, lat } = unproject(x + 0.5, y + 0.5);
      if (inside(poly, lon, lat)) mask[y * MAP_W + x] = value;
    }
  }
}

let cached: Uint8Array | null = null;

/** 1 for land, 0 for water. Built once, then shared. */
export function landMask(): Uint8Array {
  if (cached) return cached;
  const mask = new Uint8Array(MAP_W * MAP_H);
  for (const outline of LAND_OUTLINES) fillPolygon(mask, outline, 1);
  fillPolygon(mask, MISTFORD_OUTLINE, 1);
  for (const lake of INLAND_WATER) fillPolygon(mask, lake, 0);
  cached = mask;
  return mask;
}

export function isLandAt(lon: number, lat: number): boolean {
  const { x, y } = project(lon, lat);
  const px = Math.floor(x);
  const py = Math.floor(y);
  if (px < 0 || py < 0 || px >= MAP_W || py >= MAP_H) return false;
  return landMask()[py * MAP_W + px] === 1;
}

// ---- Stars -----------------------------------------------------------------------------------------------

export interface Star {
  id: string;
  name: string;
  x: number;
  y: number;
  /** The home star: Mistford. */
  home: boolean;
}

export interface StarSource {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export const MISTFORD_ID = 'mistford';

/** One star per location: Mistford first, then every city at its real coordinates. */
export function starsFor(cities: readonly StarSource[]): Star[] {
  const home = project(MISTFORD_LONLAT[0], MISTFORD_LONLAT[1]);
  return [
    { id: MISTFORD_ID, name: 'Mistford', x: home.x, y: home.y, home: true },
    ...cities.map((c) => ({ id: c.id, name: c.name, ...project(c.lon, c.lat), home: false })),
  ];
}

// ---- Flying ----------------------------------------------------------------------------------------------
//
// The view is a tilted ground plane (the world texture) seen from behind and above the knight, like the
// flying sections of a GBA action game. Heading 0 is north (up the map) and turns clockwise, in radians.

export const VIEW_W = 240;
export const VIEW_H = 160;
/** Screen row of the horizon. */
export const HORIZON = 50;
/** Focal length, in pixels. */
export const FOCAL = 90;
/** The camera sits this far behind the knight and this far above them. */
export const CAM_BACK = 50;
export const CAM_LIFT = 14;
/** Lowest and highest the knight flies. At the lowest, they can land. */
export const ALT_MIN = 12;
export const ALT_MAX = 46;
export const ALT_RATE = 26;
export const CRUISE = 95;
export const BOOST = 165;
export const SLOW = 42;
export const TURN_RATE = 1.9;
/** Map pixels from a star the knight must be (and no higher than ALT_MIN + this) to land on it. */
export const LAND_RADIUS = 26;
export const LAND_ALT_SLACK = 3;

export interface FlightState {
  x: number;
  y: number;
  heading: number;
  alt: number;
}

export interface FlightInput {
  left: boolean;
  right: boolean;
  /** Boost and brake. */
  up: boolean;
  down: boolean;
  /** A, B. */
  descend: boolean;
  ascend: boolean;
}

export const NO_INPUT: FlightInput = { left: false, right: false, up: false, down: false, descend: false, ascend: false };

/** Wrap a longitude difference (in map px) into [-MAP_W/2, MAP_W/2]: the world is round east to west. */
export function wrapDx(dx: number): number {
  const w = MAP_W;
  return ((((dx + w / 2) % w) + w) % w) - w / 2;
}

export const wrapX = (x: number): number => ((x % MAP_W) + MAP_W) % MAP_W;

/** Move one frame. The poles stop you; going far enough east or west brings you round again. */
export function stepFlight(f: FlightState, input: FlightInput, deltaMs: number): FlightState {
  const dt = deltaMs / 1000;
  const heading = f.heading + ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * TURN_RATE * dt;
  const speed = input.up ? BOOST : input.down ? SLOW : CRUISE;
  const x = wrapX(f.x + Math.sin(heading) * speed * dt);
  const y = Math.min(MAP_H - 6, Math.max(6, f.y - Math.cos(heading) * speed * dt));
  const climb = ((input.ascend ? 1 : 0) - (input.descend ? 1 : 0)) * ALT_RATE * dt;
  const alt = Math.min(ALT_MAX, Math.max(ALT_MIN, f.alt + climb));
  return { x, y, heading, alt };
}

/** Where the camera is: behind the knight, and above them. */
export function cameraOf(f: FlightState): { x: number; y: number; height: number } {
  return { x: f.x - Math.sin(f.heading) * CAM_BACK, y: f.y + Math.cos(f.heading) * CAM_BACK, height: f.alt + CAM_LIFT };
}

/**
 * Project a point on the map (at `z` above the ground) to the screen. `depth` is how far ahead of the camera
 * it is; null if it is behind the camera. Used for the stars; the ground itself is drawn row by row.
 */
export function projectToScreen(f: FlightState, wx: number, wy: number, z: number): { sx: number; sy: number; depth: number } | null {
  const cam = cameraOf(f);
  const dx = wrapDx(wx - cam.x);
  const dy = wy - cam.y;
  const fx = Math.sin(f.heading);
  const fy = -Math.cos(f.heading);
  const depth = dx * fx + dy * fy;
  if (depth < 6) return null;
  const side = dx * Math.cos(f.heading) + dy * Math.sin(f.heading);
  return { sx: VIEW_W / 2 + (side * FOCAL) / depth, sy: HORIZON + ((cam.height - z) * FOCAL) / depth, depth };
}

/** Straight-line distance over the ground from the knight to a star (the world wraps east-west). */
export function groundDistance(f: FlightState, star: Star): number {
  return Math.hypot(wrapDx(star.x - f.x), star.y - f.y);
}

/** The star the knight is above (within `radius`), nearest first, or null. */
export function starNear(stars: readonly Star[], f: FlightState, radius = LAND_RADIUS): Star | null {
  let best: Star | null = null;
  let bestD = radius;
  for (const star of stars) {
    const d = groundDistance(f, star);
    if (d <= bestD) {
      best = star;
      bestD = d;
    }
  }
  return best;
}

/** Low enough to land? */
export const atLandingHeight = (f: FlightState): boolean => f.alt <= ALT_MIN + LAND_ALT_SLACK;

/**
 * Where a star shows on the radar: the radar's up is the way the knight is facing. `range` (map px) is the
 * radar's edge; farther stars are pinned to the rim. Returns offsets in [-1, 1].
 */
export function radarPoint(f: FlightState, star: Star, range: number): { x: number; y: number; far: boolean } {
  const dx = wrapDx(star.x - f.x);
  const dy = star.y - f.y;
  const forward = dx * Math.sin(f.heading) - dy * Math.cos(f.heading);
  const right = dx * Math.cos(f.heading) + dy * Math.sin(f.heading);
  const d = Math.hypot(forward, right);
  const k = d > range ? range / d : 1;
  return { x: (right * k) / range, y: (-forward * k) / range, far: d > range };
}

/** The bearing from a point to a star, as a heading (so the flight can start facing a city). */
export function headingTo(fromX: number, fromY: number, star: Star): number {
  return Math.atan2(wrapDx(star.x - fromX), -(star.y - fromY));
}
