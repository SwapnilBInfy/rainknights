import { CHARACTERS, getCharacter } from '../config/characters';
import { PLAYER_BASE } from '../config/constants';
import { freshHero, type Hero } from '../systems/hero';
import { sanitizeUnlocked } from '../systems/unlocks';
import { CHARMS, charm as charmDef, charmSlots, gain, nextPrice, rankLabel, randomCharm, type CharmBox } from './charms';

/**
 * Mistford's economy: Drips (coins), food, and armor.
 *
 * A new knight finds a jar of drips — enough for one bun, not for armor.
 * A short run is about eight foes. Two of those pay for the cloth vest.
 * Saves migrated from v1 do not receive the jar (see `grantArrival`).
 */

export const STARTING_DRIPS = 20;
export const BAG_CAP = 9;
export const STASH_CAP = 30;
export const MAX_DRIPS = 999_999;
/** Share of max HP a knight limps home with after a defeat. */
export const DEFEAT_HP_FRACTION = 0.3;

export interface ConsumableDef {
  id: string;
  name: string;
  /** Shop label, kept short for the 8px font. */
  short: string;
  price: number;
  blurb: string;
  /** Flat heal. Ignored when `fullHeal` is set. */
  heal: number;
  fullHeal: boolean;
  /** Battle-only move-speed buff. */
  hasteMs: number;
}

export interface ArmorDef {
  id: string;
  name: string;
  price: number;
  blurb: string;
  maxHp: number;
  /** Added to the knight's move-speed multiplier (0.1 = +10%). */
  moveSpeed: number;
  attackDamage: number;
}

export const CONSUMABLES: ConsumableDef[] = [
  { id: 'rainBun', name: 'Rain Bun', short: 'BUN', price: 12, blurb: 'Heal 40.', heal: 40, fullHeal: false, hasteMs: 0 },
  { id: 'stormTea', name: 'Storm Tea', short: 'TEA', price: 28, blurb: 'Heal 25. Quick on the road.', heal: 25, fullHeal: false, hasteMs: 8000 },
  { id: 'sunBean', name: 'Sun Bean', short: 'BEAN', price: 55, blurb: 'A full heal. Like a senzu.', heal: 0, fullHeal: true, hasteMs: 0 },
];

export const ARMOR: ArmorDef[] = [
  { id: 'cloth', name: 'Cloth Vest', price: 60, blurb: '+18 HP.', maxHp: 18, moveSpeed: 0, attackDamage: 0 },
  { id: 'cloak', name: 'Rain Cloak', price: 140, blurb: '+10% speed.', maxHp: 0, moveSpeed: 0.1, attackDamage: 0 },
  { id: 'mail', name: 'Storm Mail', price: 240, blurb: '+28 HP, +3 dmg.', maxHp: 28, moveSpeed: 0, attackDamage: 3 },
];

/** Coins and the usual food drop for each foe. Bosses always drop a Sun Bean. */
const LOOT: Record<string, { coins: number; itemId: string | null; chance: number }> = {
  rainImp: { coins: 4, itemId: 'rainBun', chance: 0.12 },
  windWraith: { coins: 6, itemId: 'rainBun', chance: 0.12 },
  hailBrute: { coins: 10, itemId: 'stormTea', chance: 0.14 },
  lightningWisp: { coins: 8, itemId: 'stormTea', chance: 0.12 },
  snowGolem: { coins: 16, itemId: 'sunBean', chance: 0.1 },
  cabWraith: { coins: 12, itemId: 'rainBun', chance: 0.15 },
  tornadoBoss: { coins: 90, itemId: 'sunBean', chance: 1 },
  phantomBus: { coins: 110, itemId: 'sunBean', chance: 1 },
  tempestRegent: { coins: 200, itemId: 'sunBean', chance: 1 },
  trainingDummy: { coins: 0, itemId: null, chance: 0 },
};

export interface TownProfile {
  characterId: string;
  /** The knights the player has earned (the first always). */
  unlocked: string[];
  coins: number;
  bag: Record<string, number>;
  stash: Record<string, number>;
  ownedArmor: string[];
  armorId: string | null;
  /** Charms owned (rank 1 to 3) and which are worn. */
  charms: Record<string, number>;
  worn: string[];
  /** The knight's level, XP and spent stat points: they last across fights, defeats and flights. */
  hero: Hero;
  hp: number;
  /** Set the first time Mistford is entered, so the title can offer a way back. */
  visited: boolean;
  /**
   * Migrated from a v1 (or older) save. Those knights do not receive the
   * new-game jar of drips; they start at 0.
   */
  fromLegacy: boolean;
}

export interface GearStats {
  hp: number;
  maxHp: number;
  baseMoveSpeed: number;
  attackDamage: number;
}

export function consumable(id: string): ConsumableDef | undefined {
  return CONSUMABLES.find((item) => item.id === id);
}

export function armor(id: string | null): ArmorDef | undefined {
  if (!id) return undefined;
  return ARMOR.find((item) => item.id === id);
}

export function freshProfile(characterId = 'rainKnight'): TownProfile {
  const id = getCharacter(characterId).id;
  return {
    characterId: id,
    unlocked: sanitizeUnlocked([], new Set(CHARACTERS.map((c) => c.id)), id),
    coins: 0,
    bag: {},
    stash: {},
    ownedArmor: [],
    armorId: null,
    charms: {},
    worn: [],
    hero: freshHero(),
    hp: townMaxHp(id, null),
    visited: false,
    fromLegacy: false,
  };
}

/** First step into Mistford. New games find the jar; migrated saves do not. */
export function grantArrival(profile: TownProfile): TownProfile {
  if (profile.visited) return profile;
  const coins = profile.coins + (profile.fromLegacy ? 0 : STARTING_DRIPS);
  const max = townMaxHp(profile.characterId, profile.armorId);
  const hp = profile.hp < 1 || profile.hp > max ? max : profile.hp;
  return { ...profile, visited: true, coins, hp };
}

export function townMaxHp(characterId: string, armorId: string | null): number {
  const character = getCharacter(characterId);
  return Math.round(PLAYER_BASE.maxHp * character.mods.maxHp) + (armor(armorId)?.maxHp ?? 0);
}

/** Stats for a fresh run. A continued run keeps the checkpoint instead. */
export function battleGear(characterId: string, armorId: string | null, hp: number): GearStats {
  const character = getCharacter(characterId);
  const piece = armor(armorId);
  const maxHp = Math.round(PLAYER_BASE.maxHp * character.mods.maxHp) + (piece?.maxHp ?? 0);
  return {
    maxHp,
    hp: Math.max(1, Math.min(maxHp, Math.round(hp))),
    baseMoveSpeed: PLAYER_BASE.moveSpeed * character.mods.moveSpeed * (1 + (piece?.moveSpeed ?? 0)),
    attackDamage: Math.round(PLAYER_BASE.attackDamage * character.mods.attackDamage) + (piece?.attackDamage ?? 0),
  };
}

/** The chance an enemy leaves a charm behind. Bosses always do. */
const CHARM_DROP: Record<string, number> = {
  rainImp: 0.02,
  windWraith: 0.025,
  hailBrute: 0.045,
  lightningWisp: 0.04,
  snowGolem: 0.07,
  cabWraith: 0.04,
  tornadoBoss: 1,
  phantomBus: 1,
  tempestRegent: 1,
};

/** The id to put in a pickup for a charm (so it travels like any other item). */
export const charmPickup = (id: string): string => `charm:${id}`;
export const charmOfPickup = (itemId: string | null | undefined): string | null => (itemId && itemId.startsWith('charm:') ? itemId.slice(6) : null);

/**
 * A charm an enemy leaves behind, or null. `roll` decides whether it drops, `pick` which one (both in [0, 1)); it is
 * always one the knight can still improve.
 */
export function charmDrop(enemyKey: string, roll: number, pick: number, box: CharmBox): string | null {
  const chance = CHARM_DROP[enemyKey] ?? 0;
  if (roll < 0 || roll >= chance) return null;
  const id = randomCharm(box, pick);
  return id ? charmPickup(id) : null;
}

/** A charm in a supply crate (a buried chest is better): `roll` decides if, `pick` which, both in [0, 1). */
export function crateCharm(buried: boolean, roll: number, pick: number, box: CharmBox): string | null {
  if (roll < 0 || roll >= (buried ? 0.22 : 0.1)) return null;
  const id = randomCharm(box, pick);
  return id ? charmPickup(id) : null;
}

export function lootFor(enemyKey: string, roll: number): { coins: number; itemId: string | null } {
  const row = LOOT[enemyKey];
  if (!row || roll < 0 || roll >= 1) return { coins: row?.coins ?? 0, itemId: null };
  const itemId = row.itemId && roll < row.chance ? row.itemId : null;
  return { coins: row.coins, itemId };
}

export type BuyFail = 'unknown' | 'coins' | 'owned' | 'full' | 'maxed';

export function buy(profile: TownProfile, id: string): { ok: true; profile: TownProfile } | { ok: false; reason: BuyFail; profile: TownProfile } {
  const food = consumable(id);
  const piece = armor(id);
  const ch = charmDef(id);
  if (ch) {
    // a charm: its next rank (the first, or a better one of a charm you own)
    const price = nextPrice({ owned: profile.charms, worn: profile.worn }, id);
    if (price === null) return { ok: false, reason: 'maxed', profile };
    if (profile.coins < price) return { ok: false, reason: 'coins', profile };
    const got = gain({ owned: profile.charms, worn: profile.worn }, id, charmSlots(profile.hero.level));
    if (!got) return { ok: false, reason: 'maxed', profile };
    return { ok: true, profile: { ...profile, coins: profile.coins - price, charms: got.box.owned, worn: got.box.worn } };
  }
  if (!food && !piece) return { ok: false, reason: 'unknown', profile };
  const price = food?.price ?? piece!.price;
  if (profile.coins < price) return { ok: false, reason: 'coins', profile };
  if (piece) {
    if (profile.ownedArmor.includes(piece.id)) return { ok: false, reason: 'owned', profile };
    const owned = [...profile.ownedArmor, piece.id];
    const paid = { ...profile, coins: profile.coins - price, ownedArmor: owned };
    return { ok: true, profile: equip(paid, piece.id) };
  }
  const count = profile.bag[food!.id] ?? 0;
  if (count >= BAG_CAP) return { ok: false, reason: 'full', profile };
  return {
    ok: true,
    profile: { ...profile, coins: profile.coins - price, bag: { ...profile.bag, [food!.id]: count + 1 } },
  };
}

/** Wear an owned piece (or null to take it off). Max HP changes carry the same HP over. */
export function equip(profile: TownProfile, armorId: string | null): TownProfile {
  if (armorId !== null && !profile.ownedArmor.includes(armorId)) return profile;
  const before = townMaxHp(profile.characterId, profile.armorId);
  const after = townMaxHp(profile.characterId, armorId);
  const hp = Math.max(1, Math.min(after, profile.hp + (after - before)));
  return { ...profile, armorId, hp };
}

export function chooseKnight(profile: TownProfile, characterId: string): TownProfile {
  const id = getCharacter(characterId).id;
  if (!id || !profile.unlocked.includes(id)) return profile; // a knight not yet earned cannot be chosen
  return { ...profile, characterId: id, hp: townMaxHp(id, profile.armorId) };
}

export function rest(profile: TownProfile): TownProfile {
  return { ...profile, hp: townMaxHp(profile.characterId, profile.armorId) };
}

export interface UseOk {
  ok: true;
  profile: TownProfile;
  healed: number;
  hasteMs: number;
}

/** Remove one consumable from the bag without changing HP (the battle applies the heal itself). */
export function spendItem(profile: TownProfile, id: string): TownProfile | null {
  if (!consumable(id) || (profile.bag[id] ?? 0) < 1) return null;
  const bag = { ...profile.bag, [id]: profile.bag[id] - 1 };
  if (bag[id] <= 0) delete bag[id];
  return { ...profile, bag };
}

export function useItem(profile: TownProfile, id: string, inBattle: boolean): UseOk | { ok: false; reason: 'missing' | 'full'; profile: TownProfile } {
  const item = consumable(id);
  const count = profile.bag[id] ?? 0;
  if (!item || count < 1) return { ok: false, reason: 'missing', profile };
  const max = townMaxHp(profile.characterId, profile.armorId);
  const healed = item.fullHeal ? Math.max(0, max - profile.hp) : Math.max(0, Math.min(item.heal, max - profile.hp));
  const hasteMs = inBattle ? item.hasteMs : 0;
  if (healed === 0 && hasteMs === 0) return { ok: false, reason: 'full', profile };
  const left = count - 1;
  const bag = { ...profile.bag };
  if (left > 0) bag[id] = left;
  else delete bag[id];
  return { ok: true, profile: { ...profile, bag, hp: profile.hp + healed }, healed, hasteMs };
}

export function transfer(profile: TownProfile, id: string, dir: 'store' | 'take'): TownProfile | null {
  if (!consumable(id)) return null;
  const from = dir === 'store' ? profile.bag : profile.stash;
  const to = dir === 'store' ? profile.stash : profile.bag;
  const cap = dir === 'store' ? STASH_CAP : BAG_CAP;
  if ((from[id] ?? 0) < 1) return null;
  if ((to[id] ?? 0) >= cap) return null;
  const nextFrom = { ...from, [id]: from[id] - 1 };
  if (nextFrom[id] <= 0) delete nextFrom[id];
  const nextTo = { ...to, [id]: (to[id] ?? 0) + 1 };
  return dir === 'store' ? { ...profile, bag: nextFrom, stash: nextTo } : { ...profile, stash: nextFrom, bag: nextTo };
}

/** Pickup during a run. A full bag refuses the item (the coin still lands). */
export function collect(
  profile: TownProfile,
  coins: number,
  itemId: string | null,
  slots = charmSlots(profile.hero.level)
): { profile: TownProfile; storedItem: boolean; charm?: { id: string; rank: number; wornNow: boolean } } {
  const next: TownProfile = { ...profile, coins: Math.min(MAX_DRIPS, profile.coins + Math.max(0, coins)), bag: { ...profile.bag } };
  const found = charmOfPickup(itemId);
  if (found) {
    // a charm: it is owned for good (or ranks up one you have), and worn at once if there is room
    const got = gain({ owned: profile.charms, worn: profile.worn }, found, slots);
    if (!got) return { profile: next, storedItem: true }; // already rank III: the coins land, the charm is a spent find
    return { profile: { ...next, charms: got.box.owned, worn: got.box.worn }, storedItem: true, charm: { id: found, rank: got.rank, wornNow: got.wornNow } };
  }
  if (!itemId || !consumable(itemId)) return { profile: next, storedItem: false };
  const count = next.bag[itemId] ?? 0;
  if (count >= BAG_CAP) return { profile: next, storedItem: false };
  next.bag[itemId] = count + 1;
  return { profile: next, storedItem: true };
}

export function bagLabel(bag: Record<string, number>): string {
  return Object.keys(bag)
    .filter((id) => bag[id] > 0)
    .sort()
    .map((id) => `${id}:${bag[id]}`)
    .join(',');
}

export interface ShopRow {
  id: string;
  label: string;
  blurb: string;
  /** Price, drawn as pixel digits so an 8 is not an S. */
  value?: string;
}

export function shopRows(profile: TownProfile): ShopRow[] {
  const rows: ShopRow[] = [];
  for (const item of CONSUMABLES) {
    const owned = profile.bag[item.id] ?? 0;
    rows.push({
      id: item.id,
      label: item.name,
      value: String(item.price),
      blurb: owned > 0 ? `${item.blurb}  x${owned}` : item.blurb,
    });
  }
  for (const piece of ARMOR) {
    const owned = profile.ownedArmor.includes(piece.id);
    rows.push({
      id: piece.id,
      label: owned ? `${piece.name} OWN` : piece.name,
      value: owned ? undefined : String(piece.price),
      blurb: owned && profile.armorId === piece.id ? `${piece.blurb}  WORN` : piece.blurb,
    });
  }
  rows.push({ id: 'charms', label: 'CHARMS', blurb: 'Rings and stones. They make you stronger.' });
  rows.push({ id: 'leave', label: 'LEAVE', blurb: 'Back to the shop.' });
  return rows;
}

/** The charm shop: every charm, what it does, its next rank and what that costs. */
export function charmShopRows(profile: TownProfile): ShopRow[] {
  const rows: ShopRow[] = CHARMS.map((def) => {
    const rank = profile.charms[def.id] ?? 0;
    const price = nextPrice({ owned: profile.charms, worn: profile.worn }, def.id);
    return {
      id: def.id,
      label: rank > 0 ? `${def.name} ${rankLabel(rank)}` : def.name,
      value: price === null ? undefined : String(price),
      blurb: price === null ? `${def.blurb}  MAX` : rank > 0 ? `${def.blurb}  Next: ${rankLabel(rank + 1)}` : def.blurb,
    };
  });
  rows.push({ id: 'leave', label: 'LEAVE', blurb: 'Back to the shop.' });
  return rows;
}

export function buyFailText(reason: BuyFail): string {
  if (reason === 'coins') return 'Not enough drips.';
  if (reason === 'owned') return 'You already own it.';
  if (reason === 'full') return 'Your bag is full.';
  if (reason === 'maxed') return 'Already at its best.';
  return 'They do not sell that.';
}

