import { describe, expect, it } from 'vitest';
import {
  ARMOR,
  BAG_CAP,
  CONSUMABLES,
  STARTING_DRIPS,
  bagLabel,
  battleGear,
  buy,
  chooseKnight,
  collect,
  equip,
  freshProfile,
  grantArrival,
  lootFor,
  rest,
  shopRows,
  spendItem,
  transfer,
  useItem,
} from '../src/economy/economy';

describe('Mistford economy', () => {
  it('gives a new knight a jar of drips, and a migrated save nothing', () => {
    const arrived = grantArrival(freshProfile());
    expect(arrived.visited).toBe(true);
    expect(arrived.coins).toBe(STARTING_DRIPS);
    expect(arrived.hp).toBe(100);

    const again = grantArrival(arrived);
    expect(again.coins).toBe(STARTING_DRIPS);

    const legacy = grantArrival({ ...freshProfile(), fromLegacy: true });
    expect(legacy.coins).toBe(0);
    expect(legacy.visited).toBe(true);
  });

  it('prices a bun under the starting jar and the first armor at two short runs', () => {
    const bun = CONSUMABLES[0];
    const vest = ARMOR[0];
    expect(bun.id).toBe('rainBun');
    expect(vest.id).toBe('cloth');
    expect(STARTING_DRIPS).toBeGreaterThanOrEqual(bun.price);
    expect(STARTING_DRIPS).toBeLessThan(vest.price);
    const shortRun = 8 * lootFor('rainImp', 0.99).coins;
    expect(shortRun * 2).toBeGreaterThanOrEqual(vest.price);
    expect(lootFor('tornadoBoss', 0.5).coins).toBeGreaterThan(lootFor('rainImp', 0.5).coins * 10);
    expect(lootFor('phantomBus', 0).itemId).toBe('sunBean');
    expect(lootFor('trainingDummy', 0).coins).toBe(0);
    expect(lootFor('rainImp', 0).itemId).toBe('rainBun');
    expect(lootFor('rainImp', 0.99).itemId).toBeNull();
  });

  it('buys food and armor, and refuses an empty purse, a full bag, and a second vest', () => {
    let profile = { ...grantArrival(freshProfile()), coins: 80 };
    const bun = buy(profile, 'rainBun');
    expect(bun.ok).toBe(true);
    if (bun.ok) profile = bun.profile;
    expect(profile.bag.rainBun).toBe(1);
    expect(profile.coins).toBe(68);

    const broke = buy({ ...profile, coins: 5 }, 'cloth');
    expect(broke.ok).toBe(false);
    if (!broke.ok) expect(broke.reason).toBe('coins');

    const vest = buy(profile, 'cloth');
    expect(vest.ok).toBe(true);
    if (vest.ok) profile = vest.profile;
    expect(profile.armorId).toBe('cloth');
    expect(profile.ownedArmor).toEqual(['cloth']);
    expect(profile.hp).toBe(118);
    expect(buy(profile, 'cloth').ok).toBe(false);

    const stuffed = { ...profile, coins: 100, bag: { rainBun: BAG_CAP } };
    const full = buy(stuffed, 'rainBun');
    expect(full.ok).toBe(false);
    if (!full.ok) expect(full.reason).toBe('full');
  });

  it('makes worn armor change the stats a run starts with', () => {
    const bare = battleGear('rainKnight', null, 100);
    expect(bare).toMatchObject({ hp: 100, maxHp: 100, attackDamage: 12 });
    const mailed = battleGear('rainKnight', 'mail', 100);
    expect(mailed.maxHp).toBe(128);
    expect(mailed.attackDamage).toBe(15);
    const cloaked = battleGear('stormChaser', 'cloak', 50);
    expect(cloaked.maxHp).toBe(Math.round(100 * 0.75));
    expect(cloaked.baseMoveSpeed).toBeGreaterThan(80 * 1.25);
    expect(cloaked.hp).toBe(50);
  });

  it('heals from the bag, rests to full, and moves one stack into the chest', () => {
    let profile = { ...freshProfile(), bag: { rainBun: 1, sunBean: 1 }, hp: 40 };
    const used = useItem(profile, 'rainBun', false);
    expect(used.ok).toBe(true);
    if (used.ok) {
      expect(used.healed).toBe(40);
      expect(used.profile.hp).toBe(80);
      expect(used.profile.bag.rainBun).toBeUndefined();
      profile = used.profile;
    }
    const full = useItem({ ...profile, hp: 100 }, 'sunBean', false);
    expect(full.ok).toBe(false);

    const tea = useItem({ ...freshProfile(), bag: { stormTea: 1 }, hp: 100 }, 'stormTea', true);
    expect(tea.ok).toBe(true);
    if (tea.ok) expect(tea.hasteMs).toBeGreaterThan(0);

    profile = rest({ ...profile, hp: 10, armorId: 'cloth', ownedArmor: ['cloth'] });
    expect(profile.hp).toBe(118);

    const stored = transfer({ ...freshProfile(), bag: { rainBun: 2 } }, 'rainBun', 'store');
    expect(stored?.bag.rainBun).toBe(1);
    expect(stored?.stash.rainBun).toBe(1);
    const back = transfer(stored!, 'rainBun', 'take');
    expect(back?.stash.rainBun).toBeUndefined();
    expect(bagLabel(back!.bag)).toBe('rainBun:2');

    const spent = spendItem({ ...freshProfile(), bag: { rainBun: 1 } }, 'rainBun');
    expect(spent?.bag.rainBun).toBeUndefined();
  });

  it('equips, changes knight, and lists the counter', () => {
    const owned = { ...freshProfile(), ownedArmor: ['cloth', 'cloak'], hp: 100 };
    const worn = equip(owned, 'cloak');
    expect(worn.armorId).toBe('cloak');
    expect(worn.hp).toBe(100);
    // a knight not yet earned cannot be chosen; one that is, can
    expect(chooseKnight(worn, 'hailWarden')).toBe(worn);
    expect(worn.unlocked).toEqual(['rainKnight']);
    const warden = chooseKnight({ ...worn, unlocked: ['rainKnight', 'hailWarden'] }, 'hailWarden');
    expect(warden.characterId).toBe('hailWarden');
    expect(warden.hp).toBe(Math.round(100 * 1.5));
    const rows = shopRows(warden);
    expect(rows.some((row) => row.id === 'rainBun')).toBe(true);
    expect(rows.find((row) => row.id === 'cloak')?.label).toContain('OWN');
    expect(rows.at(-1)?.id).toBe('leave');
  });

  it('collects coins and a bun, and leaves the bun when the bag is full', () => {
    const got = collect(freshProfile(), 4, 'rainBun');
    expect(got.profile.coins).toBe(4);
    expect(got.storedItem).toBe(true);
    const full = collect({ ...freshProfile(), bag: { rainBun: BAG_CAP } }, 4, 'rainBun');
    expect(full.profile.coins).toBe(4);
    expect(full.storedItem).toBe(false);
    expect(full.profile.bag.rainBun).toBe(BAG_CAP);
  });
});
