/**
 * Charms: the skills a knight used to pick when levelling up, now items. They are bought in Mistford, found in crates
 * and chests, and dropped by enemies. Own a charm and it is yours for good; own a second of the same kind and it
 * ranks up (to III). A knight wears only as many as they have slots for. Plain data and maths (no Phaser).
 *
 * There are two kinds: knight charms change a number (damage, speed of attack, range, pierce, health, magnet), and
 * weather charms switch on one of the five weather powers, at the charm's rank.
 */

export type CharmId =
  | 'boltRing'
  | 'squallBand'
  | 'gustLens'
  | 'hailTip'
  | 'vitalityStone'
  | 'lodestone'
  | 'sunCharm'
  | 'rainbowCharm'
  | 'galeCharm'
  | 'frostCharm'
  | 'staticCharm';

export type PowerName = 'sunbeam' | 'rainbowShield' | 'gale' | 'frost' | 'staticCharge';

export interface CharmDef {
  id: CharmId;
  name: string;
  /** What it does, at rank I (the shop adds the rank). Short enough for the 8px font. */
  blurb: string;
  /** The price of rank I; each further rank costs this much more again. */
  price: number;
  kind: 'knight' | 'weather';
  /** A weather charm's power. */
  power?: PowerName;
}

export const MAX_RANK = 3;
const ROMAN = ['', 'I', 'II', 'III'];
export const rankLabel = (rank: number): string => ROMAN[Math.max(0, Math.min(MAX_RANK, rank))];

export const CHARMS: CharmDef[] = [
  { id: 'boltRing', name: 'Bolt Ring', blurb: 'Auto-attack damage +6.', price: 90, kind: 'knight' },
  { id: 'squallBand', name: 'Squall Band', blurb: 'Attack cooldown -12%.', price: 110, kind: 'knight' },
  { id: 'gustLens', name: 'Gust Lens', blurb: 'Attack range +25.', price: 80, kind: 'knight' },
  { id: 'hailTip', name: 'Hail Tip', blurb: 'Bolts pierce +1 enemy.', price: 140, kind: 'knight' },
  { id: 'vitalityStone', name: 'Vital Stone', blurb: 'Max HP +20.', price: 100, kind: 'knight' },
  { id: 'lodestone', name: 'Lodestone', blurb: 'XP magnet radius +20.', price: 70, kind: 'knight' },
  { id: 'sunCharm', name: 'Sun Charm', blurb: 'Heals and bursts light.', price: 160, kind: 'weather', power: 'sunbeam' },
  { id: 'rainbowCharm', name: 'Rainbow Charm', blurb: 'A brief shield, often.', price: 170, kind: 'weather', power: 'rainbowShield' },
  { id: 'galeCharm', name: 'Gale Charm', blurb: 'Move speed +20%.', price: 130, kind: 'weather', power: 'gale' },
  { id: 'frostCharm', name: 'Frost Charm', blurb: 'Slows nearby enemies.', price: 150, kind: 'weather', power: 'frost' },
  { id: 'staticCharm', name: 'Static Charm', blurb: 'Attacks chain to another.', price: 180, kind: 'weather', power: 'staticCharge' },
];

export const CHARM_IDS = new Set<string>(CHARMS.map((c) => c.id));
export const charm = (id: string): CharmDef | undefined => CHARMS.find((c) => c.id === id);

/** The charms a knight owns (rank 1 to 3) and which of them are worn. */
export interface CharmBox {
  owned: Record<string, number>;
  worn: string[];
}

export const emptyBox = (): CharmBox => ({ owned: {}, worn: [] });

/** How many a knight at this level can wear: three, then one more at level 5 and another at level 10. */
export function charmSlots(level: number): number {
  return 3 + (level >= 5 ? 1 : 0) + (level >= 10 ? 1 : 0);
}

/** What the next rank of a charm costs (null if it is already rank III). */
export function nextPrice(box: CharmBox, id: string): number | null {
  const def = charm(id);
  if (!def) return null;
  const rank = box.owned[id] ?? 0;
  return rank >= MAX_RANK ? null : def.price * (rank + 1);
}

/** Add a charm, or rank up one already owned. A new charm is worn at once if there is a free slot. */
export function gain(box: CharmBox, id: string, slots: number): { box: CharmBox; rank: number; wornNow: boolean } | null {
  if (!charm(id)) return null;
  const rank = box.owned[id] ?? 0;
  if (rank >= MAX_RANK) return null;
  const owned = { ...box.owned, [id]: rank + 1 };
  const free = box.worn.length < slots && !box.worn.includes(id);
  return { box: { owned, worn: free ? [...box.worn, id] : box.worn }, rank: rank + 1, wornNow: free };
}

/** Put a worn charm away, or wear an owned one. Null if it is not owned or there is no free slot. */
export function toggle(box: CharmBox, id: string, slots: number): CharmBox | null {
  if (!(box.owned[id] > 0)) return null;
  if (box.worn.includes(id)) return { ...box, worn: box.worn.filter((w) => w !== id) };
  if (box.worn.length >= slots) return null;
  return { ...box, worn: [...box.worn, id] };
}

/** If the slots have shrunk (or a charm is somehow not owned), drop the extras off the end. */
export function fit(box: CharmBox, slots: number): CharmBox {
  const worn = box.worn.filter((id, i) => box.owned[id] > 0 && box.worn.indexOf(id) === i).slice(0, slots);
  return worn.length === box.worn.length && worn.every((id, i) => id === box.worn[i]) ? box : { ...box, worn };
}

export interface CharmEffects {
  attackDamage: number;
  cooldownMult: number;
  range: number;
  pierce: number;
  maxHp: number;
  magnet: number;
  powers: Record<PowerName, number>;
}

export const NO_CHARMS: CharmEffects = {
  attackDamage: 0,
  cooldownMult: 1,
  range: 0,
  pierce: 0,
  maxHp: 0,
  magnet: 0,
  powers: { sunbeam: 0, rainbowShield: 0, gale: 0, frost: 0, staticCharge: 0 },
};

/** What the worn charms do, at their ranks. */
export function charmEffects(box: CharmBox): CharmEffects {
  const out: CharmEffects = { ...NO_CHARMS, powers: { ...NO_CHARMS.powers } };
  for (const id of box.worn) {
    const rank = Math.min(MAX_RANK, box.owned[id] ?? 0);
    if (rank < 1) continue;
    switch (id) {
      case 'boltRing':
        out.attackDamage += 6 * rank;
        break;
      case 'squallBand':
        out.cooldownMult *= Math.pow(0.88, rank);
        break;
      case 'gustLens':
        out.range += 25 * rank;
        break;
      case 'hailTip':
        out.pierce += rank;
        break;
      case 'vitalityStone':
        out.maxHp += 20 * rank;
        break;
      case 'lodestone':
        out.magnet += 20 * rank;
        break;
      default: {
        const power = charm(id)?.power;
        if (power) out.powers[power] += rank;
      }
    }
  }
  return out;
}

/** Read a charm box out of untrusted saved data: known charms at ranks 1 to 3, worn ones owned and without repeats. */
export function sanitizeCharms(owned: unknown, worn: unknown): CharmBox {
  const box = emptyBox();
  if (typeof owned === 'object' && owned !== null) {
    for (const [id, rank] of Object.entries(owned as Record<string, unknown>)) {
      if (CHARM_IDS.has(id) && typeof rank === 'number' && Number.isInteger(rank) && rank >= 1) box.owned[id] = Math.min(MAX_RANK, rank);
    }
  }
  if (Array.isArray(worn)) {
    for (const id of worn) if (typeof id === 'string' && box.owned[id] > 0 && !box.worn.includes(id)) box.worn.push(id);
  }
  return box;
}

/** A random charm for a drop or a chest: one not yet at rank III, if any. `roll` is in [0, 1). */
export function randomCharm(box: CharmBox, roll: number): CharmId | null {
  const open = CHARMS.filter((c) => (box.owned[c.id] ?? 0) < MAX_RANK);
  if (open.length === 0) return null;
  return open[Math.min(open.length - 1, Math.floor(roll * open.length))].id;
}
