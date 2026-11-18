/**
 * What each live weather condition does to a run. Every rule is something the
 * player can see coming: hazards are drawn on the ground before they hit, and a
 * message explains the rule when the run starts.
 */

export type HazardKind = 'lightning' | 'scorch' | 'frost' | 'gust';

export interface HazardSpec {
  kind: HazardKind;
  /** Time between spawns, before the storm-front intensity scaling. */
  minMs: number;
  maxMs: number;
  /** Zones per spawn; `extraFromFront` adds one more from that storm front on. */
  count?: number;
  extraFromFront?: number;
}

export interface WeatherRule {
  /** Rain soaks everyone: Wet targets take extra damage from electricity. */
  wet: boolean;
  hazards: HazardSpec[];
  /** Two short lines (27 chars each) for the message box. */
  hint?: string;
  /** A second hint about what the weather does to the map (27 chars per line). */
  terrainHint?: string;
}

export const WEATHER_RULES: Record<string, WeatherRule> = {
  clear: { wet: false, hazards: [] },
  humid: { wet: false, hazards: [] },
  rain: {
    wet: true,
    hazards: [],
    hint: 'Rain: everyone is WET.\nBeams shock wet foes!',
    terrainHint: 'Puddles soak and slow you.\nWet foes take more shock!',
  },
  thunderstorm: {
    wet: true,
    hazards: [{ kind: 'lightning', minMs: 6000, maxMs: 10000, count: 1, extraFromFront: 4 }],
    hint: 'Lightning hits where it\nflashes. Move away!',
    terrainHint: 'Lightning runs through\nwater. Stay out of it!',
  },
  tropical_downpour: {
    wet: true,
    hazards: [{ kind: 'lightning', minMs: 14000, maxMs: 20000, count: 1 }],
    hint: 'Downpour: all WET. Rare\nlightning - watch circles!',
    terrainHint: 'The streets will flood.\nWater carries lightning!',
  },
  hurricane: {
    wet: true,
    hazards: [
      { kind: 'lightning', minMs: 4500, maxMs: 7500, count: 2 },
      { kind: 'gust', minMs: 12000, maxMs: 18000 },
    ],
    hint: 'Hurricane! Gusts shove you\nand lightning strikes!',
    terrainHint: 'Floods spread inland.\nWater carries lightning!',
  },
  cold_front: {
    wet: false,
    hazards: [{ kind: 'frost', minMs: 7000, maxMs: 11000, count: 1, extraFromFront: 4 }],
    hint: 'Frost patches freeze you.\nMelee shatters ice!',
    terrainHint: 'The water froze: walk the\nice, but you will slide!',
  },
  windy: {
    wet: false,
    hazards: [{ kind: 'gust', minMs: 9000, maxMs: 14000 }],
    hint: 'Gusts shove everyone.\nWatch the arrow!',
  },
  heat: {
    wet: false,
    hazards: [{ kind: 'scorch', minMs: 6000, maxMs: 9000, count: 1, extraFromFront: 3 }],
    hint: 'Scorched ground burns\nyou and enemies!',
    terrainHint: 'Heat dried the shallows.\nDeep water still blocks.',
  },
};

export function ruleFor(condition: string): WeatherRule {
  return WEATHER_RULES[condition] ?? WEATHER_RULES.clear;
}

/** Players get a quiet opening before the first hazard. */
export const FIRST_HAZARD_DELAY_MS = 8000;

/** Hazards come faster as the storm front escalates (+12% per front). */
export function scaledInterval(spec: HazardSpec, frontIndex: number, rand: () => number): number {
  const base = spec.minMs + (spec.maxMs - spec.minMs) * rand();
  return base / (1 + 0.12 * Math.max(0, frontIndex));
}

export function zoneCount(spec: HazardSpec, frontIndex: number): number {
  const extra = spec.extraFromFront != null && frontIndex >= spec.extraFromFront ? 1 : 0;
  return (spec.count ?? 1) + extra;
}

/**
 * Hazards are off under browser automation so CI and recordings stay
 * deterministic, unless a specific weather is forced with `?weather=`.
 */
export function hazardsEnabled(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return true;
  if (!navigator.webdriver) return true;
  return new URLSearchParams(window.location.search).has('weather');
}
