# RainKnights handoff

Pixel-art survival game, Phaser 3 + TypeScript + Vite. Native view is 240×160, integer-scaled. Live site: https://rainknights.vercel.app. Save key: `rainknights:save`, schema version 2.

## Town, market, currency

New games wake in **Mistford** (`TownScene`), not in a fight. West door is the safe house (`HouseScene`), east door is the market (`MarketScene`). The south road opens `RegionSelectScene` (New York or Miami) and a finished run returns home.

Currency is **Drips**. A new knight finds 20. Migrated v1 saves arrive with 0 (`fromLegacy`) and still Continue. The tutorial never writes the save. `?seed=` only affects the battle map.

State lives on `TownProfile` in `src/economy/economy.ts` and is persisted by `src/save/save.ts`:

- `coins`, `bag` (cap 9), `stash` (cap 30), `ownedArmor`, `armorId`, `hp`, `characterId`, `visited`
- Prices: Rain Bun 12, Storm Tea 28, Sun Bean 55, Cloth Vest 60, Rain Cloak 140, Storm Mail 240
- Armor changes the next fight's max HP, speed, and damage via `battleGear`. A resumed fight keeps the stats it already had
- Defeat returns you at about 30% HP. The bed calls `rest` and fills HP

Maps are hand-authored strings in `src/town/mistford.ts`. `d` is a door mat, `K` is the market counter, `*` is the south gate. `houseExit` / `shopExit` are one tile south of the town mats so coming back does not immediately re-enter.

## Menus

`ListMenu` (`src/ui/listMenu.ts`) is the only menu path for the shop, chest, bed, rack, bag, and the "back to title" ask. The scene calls `pump(time)` every frame.

- A tap (arrow, WASD, touch stick, gamepad d-pad buttons 12/13 or the vertical axis) moves one row
- Holding repeats after a short delay
- A direction already held when the menu opens is ignored until it is released, so walking into the counter does not spin the list
- Confirm is Space, Enter, Z, touch A, or gamepad button 0. Back is Esc, P, or gamepad button 1
- Phaser hears the keyups. The menu does not capture or stop them. `hide()` resets Phaser's keys so a held direction does not walk the knight out afterwards

## HUD

`HubChrome` (`src/ui/hubChrome.ts`) is the town layer: a short HP bar top-left, pixel drips top-right (so an 8 is not an S — see `src/ui/digits.ts`), a place name that fades, and an A bubble only while you are close enough to use something. **I** opens the bag. The battle HUD (`src/ui/HUD.ts`) is the same idea along the top: level, timer, HP, thin J/K gauges, one-line weather chip. Touch controls stay in the lower corners or the letterbox.

Interiors draw real props from `src/gfx/furniture.ts` (bed, chest, mirror, armor rack, market counter and shelves). The south mat of each interior is the exit: walk onto it, or press A beside it. The A bubble sits on that mat.

A level-up restores HP to the knight's current maximum (armor included), plays the sunbeam sound, flashes the sprite green, and then opens the upgrade menu. Several levels gained at once each heal; the menus still show one after another. See `grantXp` in `src/entities/levelUp.ts`.

## Tests

```bash
npm run typecheck
npm run test:unit      # vitest, test/
npm run build
npm run test:smoke     # Playwright, e2e/, production preview on 127.0.0.1:4173
```

Smoke covers Chromium for the whole suite. `e2e/shop-nav.spec.ts` also runs on Firefox and WebKit. CI is `.github/workflows/ci.yml`. Weather is stubbed in `e2e/fixtures.ts`. `beginCityRun` walks out of Mistford into a fight.

Useful specs: `e2e/town.spec.ts` (buy, leave, coins, return), `e2e/town-menus.spec.ts` (market and chest do not freeze), `e2e/shop-nav.spec.ts` (hold, stick, gamepad), `e2e/interiors.spec.ts` (exit doors), `test/levelUp.test.ts`, `test/economy.test.ts`, `test/save.test.ts`.

## Open questions

- **Mistford** and **Drips** are the names in the game and the save. They were chosen for this hub and can be renamed without a schema change if the owner prefers something else.
- The mirror in the house opens the wardrobe (`CharacterSelectScene` with `wardrobe: true`) and can switch the knight. A brand-new game still starts as the Rain Knight; there is no "pick your knight" step before the first visit unless someone adds one.
- Escape inside a building still leaves immediately, in addition to the south mat.
- Gamepad support is the standard d-pad plus buttons 0 and 1 on menus only. It is not wired into the fight.
