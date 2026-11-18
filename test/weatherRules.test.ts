import { describe, expect, it } from 'vitest';
import { WEATHER_RULES, ruleFor, scaledInterval, zoneCount } from '../src/config/weatherRules';

describe('weather rules', () => {
  it('has a rule for every condition the weather service can produce', () => {
    for (const id of ['clear', 'humid', 'rain', 'thunderstorm', 'tropical_downpour', 'hurricane', 'cold_front', 'windy', 'heat']) {
      expect(WEATHER_RULES[id], id).toBeDefined();
    }
  });

  it('falls back to a calm rule for unknown conditions', () => {
    expect(ruleFor('nonsense').hazards).toEqual([]);
  });

  it('every hazardous condition explains itself in two short lines', () => {
    for (const [id, rule] of Object.entries(WEATHER_RULES)) {
      if (rule.hazards.length === 0 && !rule.wet) continue;
      expect(rule.hint, id).toBeTruthy();
      const lines = rule.hint!.split('\n');
      expect(lines.length, id).toBeLessThanOrEqual(2);
      for (const line of lines) expect(line.length, `${id}: "${line}"`).toBeLessThanOrEqual(27);
    }
  });

  it('hazards speed up as the storm front escalates', () => {
    const spec = WEATHER_RULES.thunderstorm.hazards[0];
    const mid = () => 0.5;
    expect(scaledInterval(spec, 5, mid)).toBeLessThan(scaledInterval(spec, 0, mid));
    expect(scaledInterval(spec, 0, () => 0)).toBe(spec.minMs);
    expect(scaledInterval(spec, 0, () => 1)).toBe(spec.maxMs);
  });

  it('adds an extra strike zone on later fronts', () => {
    const spec = WEATHER_RULES.thunderstorm.hazards[0];
    expect(zoneCount(spec, 0)).toBe(1);
    expect(zoneCount(spec, 4)).toBe(2);
  });
});
