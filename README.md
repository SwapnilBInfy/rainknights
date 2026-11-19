# Rainknights

A top-down survival game: you play a lone knight fighting off waves of enemies
conjured from real weather patterns, as an incoming storm escalates around you.

Built with **Phaser 3** + **TypeScript** + **Vite**. The look and feel is a
homage to the GBA Pokémon games: a native 240×160 canvas (integer-scaled to
your window), 16×16 tiles, chibi 4-direction overworld sprites, Pokémon-style
text boxes/menus and the Press Start 2P pixel font. All characters, tiles and
UI are original and procedurally drawn in code; only the two region emblems
are AI-generated (via `npm run art:generate`).

## Play

- **Choose a knight**: Rain Knight (balanced), Hail Warden (tanky), or Storm
  Chaser (fast/fragile) — each with different stats
- **Choose a city**: New York City or Miami. That city's current weather sets
  which storm front the run starts on
- **Move**: Arrow keys or WASD (blocked by lakes and rock clusters on the map)
- **Swing**: hold **Space** to swing your weapon (sword / hammer / daggers) in an arc
  toward the way you're facing — strong, with knockback
- **Energy beam**: hold **J** or **X** to fire a piercing beam in your facing
  direction (short recharge, shown by the gauge under your HP)
- **Auto-attack**: a weaker Storm Bolt still fires at the nearest enemy as a backup
- **Level up**: collect XP gems from defeated enemies, then pick one of three
  upgrades (weapon, stat, or weather power). The fight freezes until you pick
- **Pause**: **Esc** or **P** during a run (see Controls)
- **Goal**: survive the escalating storm fronts and defeat the **Tornado**
  boss that arrives at the 5-minute mark

### Controls

Keyboard, the on-screen buttons on a touch screen, and a gamepad Start button.

| Input | What it does |
| ----- | ------------ |
| Arrow keys or WASD | Move, including diagonals. Arrows and W/S move menu cursors. On the city screen, Left/A selects New York and Right/D selects Miami. |
| Space | Swing (hold). Also confirms menus, starts a run, and continues from game over. |
| J or X | Energy beam (hold). |
| Shift or K | Dodge roll: a quick tumble in the direction you are moving (or facing). You cannot be hit mid-roll. |
| Enter | Confirm a menu, start a run, or continue from game over. On the title menu, confirms Continue, New game, or Reset save. |
| Esc or P | Pause or resume a live run. On the title's "Erase save?" question, backs out without erasing. |
| M | Mute or unmute. The choice is remembered between visits, and M still works while paused. |
| 1–3, Z, mouse | Number keys pick a listed option. Z confirms, the same as Enter. Hover and click work on menus, the title, and game over. |

Touch controls show up when the device has a touch screen (or after the first
touch) and stay hidden in a mouse-only browser. They sit in the letterbox
around the canvas when there is room, and in the lower corners when the
canvas fills the window.

| On screen | Sends |
| --------- | ----- |
| D-pad | Arrow keys, including diagonals |
| A | Space (swing, confirm, start) |
| B | J (energy beam). X remains the keyboard alias |
| R | K (dodge roll). Shift is the other keyboard key |
| Start | Pause while a run is live. Otherwise Enter, which covers the title (PRESS START, Continue, New game) and the game-over "PRESS START" |

With touch in use, the hints lead with those labels (`STICK MOVE  A SWING  B BEAM`
on the title, and `A/SPACE`, `B/J`, `START: pause` once a run has started).

A gamepad's **Start** button (button 9 in the standard mapping) pauses and
resumes a live run, the same as Esc, P, and the touch Start button. Movement
and attacks stay on the keyboard and the touch cluster.

### Tutorial

New players can learn the game first. On the title screen press **T** (or tap
**TAP: TUTORIAL** on a touch screen); it is there for fresh players and for
anyone with a saved game.

It is the real game with nothing at stake: no storm clock, no waves, no boss,
and you cannot lose. A panel at the bottom gives one short instruction at a
time, and each step finishes when you actually do the thing:

1. **Move** around
2. **Swing** at a training dummy
3. **Energy beam** through two dummies in a line
4. **XP gems**: collect them
5. **Level up**: pick a weather powerup
6. **Dodge roll** across a Cab Wraith's charge lane
7. **Stall strike**: hit the cab while it is stalled (+50%)
8. **Wet + shock**: beam a wet foe
9. **Lightning**: leave the blinking circle before the bolt lands
10. **All set**: Space (or **A**) returns to the title

Instructions use your device's controls (WASD / SPACE / J / SHIFT or K, or
the STICK / A / B / R on touch). **Enter** skips a step (a stuck step moves on
by itself after about 75 seconds). Pause works as usual; quitting asks "Leave
tutorial?". The tutorial never reads or writes your saved run, so a game in
progress is always still there for **Continue**.

### Pause menu

Pausing freezes the whole scene: enemy movement, auras, and the storm clock.
The menu is **Resume**, **Sound** (SOUND ON / SOUND OFF, the same mute as M),
**Quit**, and **Reset save**. Arrows, W/S, or the d-pad move the selection.
Enter, Space, Z, or A activates it.

**Quit** asks **Abandon run?** **No** is selected by default, so confirming
again returns to the pause menu with the run still paused. **Yes** drops
the run and returns to the title. Esc, P, touch Start, and gamepad Start
leave that question and return to the pause menu.

**Reset save** asks **Erase save?** **No** is selected by default. **Yes**
wipes the save — the run, bests, and the mute setting — and returns to the
title. Esc, P, touch Start, and gamepad Start leave that question too.

The run also pauses if the window loses focus or the tab is hidden, while a
run is underway and a level-up menu is not already open.

### Continue

With nothing stored, the title is still **PRESS START**.

Once a run is in progress, the title offers **Continue**, **New game**, and
**Reset save**, in a GBA-style window. Up/Down, W/S, or the d-pad move the
cursor. Enter, Space, Z, A, or Start confirms. 1–3 pick a row. **Continue**
is selected first. The window shows the saved level and storm clock.

**New game** does not delete the checkpoint. The old run stays available
until the new fight actually starts. **Reset save** asks **Erase save?**
first, with **No** selected. The same question is on the pause menu.

If you have never left a run unfinished, but you have a best or the sound
is muted, the title offers **New game** and **Reset save** instead of
PRESS START. Space still starts a run.

Bests (time, level, enemies defeated, finished runs, victories) are kept
when a run ends. Abandoning from the pause menu drops the in-progress run
and keeps the bests and the mute setting. The game-over screen shows your
best time.

Progress is stored only in this browser (`localStorage`, key
`rainknights:save`, schema version 1). There is no account and no server.
The game writes that save when a fight starts, when you pick a level-up,
when the weather front changes, when you pause, and when the tab is hidden
or the page closes.

A checkpoint keeps the knight, city, weather, storm clock, position, HP,
level, XP, upgrades, and the tornado's HP if it is already on the field.
Enemies, shots, and XP gems are not stored; the storm keeps spawning after
you continue. A level-up menu that was open is opened again.

Mute used to live in its own key (`rainknights:muted`). The first load
folds that into the save and then removes the old key.

If the save is corrupt, the game boots on PRESS START and replaces it the
next time it writes. A save from a newer version is left untouched and this
build plays as if nothing was stored. If storage is blocked (private mode),
the fight still runs and nothing is written.

A level-up menu freezes the scene the same way and stays up until you pick an
upgrade. Esc, P, and Start leave that menu alone, and Start cannot confirm a
choice. A swing that was already held (Space or touch A) waits out a short
beat before it can select anything; after that, Enter, Space, or Z confirms
the highlighted row, and 1–3 pick directly. A level gained while the pause
menu is open waits until you resume. Several levels in a row show one menu
after another.

### Music & sound

All audio is original and synthesized live in the browser (WebAudio
square/triangle/noise chiptune — no audio files): a title theme, a theme per
city, a boss theme, victory/game-over jingles, sound effects for every
action, and rain/wind/thunder ambience that follows each city's live weather.
Browsers only allow sound after your first key press, click, or touch.

### City weather

The two cities have fixed coordinates. Before the run starts, the game asks
the free [Open-Meteo](https://open-meteo.com/) API (no key) for that city's
current conditions and uses them to choose the starting row in the table
below — a storm already over the city starts you further in. If the request
fails, the run starts on the calm fallback.

### Weather fronts (escalating difficulty)

| Time    | Front            | New enemy         |
| ------- | ---------------- | ------------------ |
| 0:00    | Light Drizzle    | Rain Imp            |
| 0:45    | Gusty Winds      | Wind Wraith          |
| 1:40    | Hailstorm        | Hail Brute            |
| 2:40    | Thunderstorm     | Lightning Wisp          |
| 3:40    | Blizzard         | Snow Golem                |
| 4:40    | Tornado Warning  | —                            |
| 5:00    | —                | **Tornado** (boss)             |

### Status effects and weather hazards

The live weather also changes how the run plays. Rules start a few seconds in
(a short hint explains them), and every hazard is drawn on the ground *before*
it hits, so nothing is a surprise.

| Weather            | Everyone is | Hazard                                              |
| ------------------ | ----------- | --------------------------------------------------- |
| Rain               | Wet         | —                                                   |
| Thunderstorm       | Wet         | Lightning strikes a blinking circle                  |
| Tropical downpour  | Wet         | Rare lightning                                       |
| Hurricane risk     | Wet         | Frequent lightning + wind gusts                      |
| Cold front         | —           | Frost patches that freeze whoever stands in them     |
| Urban wind         | —           | Gusts shove you and enemies (watch the arrows)       |
| Heat               | —           | Scorch patches that set you and enemies on fire      |

Statuses (shown as icons under your HP): **Wet**, **Burning**, **Chilled**,
**Frozen** and **Shocked**. They interact:

- Beams, bolts and lightning deal **+50%** to a Wet target and shock it.
- A melee hit on a Frozen target **shatters** the ice for bonus damage
  (hammer x3, sword x2, daggers x1.8).
- Water puts out fire (steam); fire thaws ice. You thaw with a short
  immunity, so you can never be frozen twice in a row.
- Hail Brutes and Snow Golems cannot be chilled or frozen, Lightning Wisps
  cannot be shocked, and the Tornado resists all of it.

Hazards are switched off under browser automation so tests stay deterministic.
`?weather=thunderstorm` (or `rain`, `heat`, `cold_front`, `windy`,
`hurricane`, `tropical_downpour`, `clear`) forces a condition and turns them
back on — handy for demos and capture scripts. Status and hazard state is not
saved; a continued run starts clean.

### Dodge roll and combat feel

**Shift** or **K** (the **R** button on a touch screen) rolls the knight about
two tiles in the direction they are moving, or the way they face when standing
still. The roll is a dodge, not an attack: no swinging or firing while it lasts.

- **Untouchable** for ~0.26s, a touch longer than the roll itself. A hit it
  avoids pops up **DODGE**. The cooldown is 0.85s (the green **K** gauge under
  your HP), so it cannot be chained.
- A roll **puts out Burning**. A frozen knight cannot roll, and a roll does not
  shrug off a gust.
- Rolling out of a lightning circle only works if you are not still inside it
  when it lands, so roll *through* the telegraph and out the far side.
- **Damage numbers** float off enemies (yellow for a Wet shock, blue for a
  shatter) and red numbers show what hurt you.
- **Hit-stop**: a brief freeze-frame on kills and on hits you take (longer for
  the Tornado), rate limited so crowds do not stutter.
- A yellow **"!"** appears over an enemy while it winds up a dash.

### The world

Each run is played on a freshly generated, **seeded** map, shaped like the city
and changed by the live weather. The map is saved with a run, so **Continue**
returns to the same one. (`?seed=123` pins a map for demos and tests.)

- **New York** is a street grid of city blocks (buildings, parks with ponds,
  empty lots with rubble) with a river crossed by **bridges**.
- **Miami** is a beach with an ocean edge, canals crossed by boardwalk
  bridges, resort buildings and lagoons.
- Every walkable tile can be reached from the start (small walled-off
  pockets are filled in, bigger ones get a road), and you always begin in a
  clear plaza. Enemies are placed on open ground, and slide along walls when
  something is in their way.

The city is dressed, too: **curbs and lane markings** on the streets, **shorelines**
with foam where water meets land, buildings with **wall faces and windows**,
bridges with **rails** over their water, **trees, parked cars and street lamps or
hydrants** in New York, **palms and beach umbrellas** in Miami. Trees, cars and
lamps are solid, so they are cover and obstacles. The world's edge is a skyline
of buildings in New York and a palm-lined sea wall in Miami.

Tiles do things to whoever stands on them:

| Tile | Effect |
| ---- | ------ |
| Shallow water (ponds, puddles, floods) | Makes you **Wet**, slows you 15%, and puts out a fire. |
| Deep water, buildings, rock | Solid. |
| Ice | Walkable but **slippery**: you slide, enemies too. |
| Bridge | Crosses water, and you stay dry. |

And the weather changes the map:

| Weather | What happens to the world |
| ------- | ------------------------- |
| Cold front | Every pond and river **freezes** into walkable ice, so the river can be crossed anywhere. |
| Heat | The shallows **dry up** (deep water stays). |
| Rain, thunderstorm | **Puddles** appear on the streets. |
| Tropical downpour, hurricane | The streets **flood** inland, one more ring of shallow water each storm front. |
| Thunderstorm, downpour, hurricane | **Water carries lightning**: a strike on water shocks everyone standing in the same water, nearby. The water lights up while it is coming, and strikes like to land in it. Stay on dry ground or a bridge. |

### City enemies and bosses

Each city can have its own signature enemy and boss on top of the shared
weather roster. **New York** has both; **Miami** still faces the Tornado.

| City | Signature enemy | Boss (5:00) |
| ---- | --------------- | ----------- |
| New York | **Cab Wraith** | **Phantom Bus** |
| Miami | none yet | **Tornado** |

The Cab Wraith replaces a share of each front's spawns from the second front
on (10% rising to 20% by the last front). Both New York foes drive by the same
loop, always telegraphed:

1. **Cruise**: steers toward you (the bus turns slowly).
2. **Wind-up**: stops, honks, shows a glowing **lane** on the ground and a
   yellow "!". The lane keeps tracking you, then locks for the last quarter
   second.
3. **Charge**: a fast straight run down the lane, hitting harder than a touch
   (x1.6 for the cab, x1.5 for the bus). Hitting a wall cuts it short.
4. **Stall**: the engine cuts out. It skids to a stop, flickers, and takes
   **+50% damage**: the moment to strike. Then it cruises again.

The streets matter to them. Their lanes follow the **street directions** (north,
south, east or west, never a diagonal), so a charge runs down the road, and the
lane shown on the ground stops where it meets a wall or a parked car, with a
burst marking the spot. A cab or the bus keeps a car-length from you to line up
a charge, only winds up when you are actually in its lane, and is quick on roads
but sluggish across grass. If a charge ends by **crashing** into a building, a
parked car or the world's edge, it is dazed for longer, takes **even more
damage** (x1.75 for a cab, x2 for the bus), and the crash shakes the screen and
throws sparks.

Roll sideways across the lane (see Dodge roll above). The **Phantom Bus** has
1100 HP and a wider, longer lane. Below half health it **enrages**: shorter
cruises, faster charges, a red lane, and its backup arrives sooner. Every few
seconds it calls Cab Wraiths and Rain Imps. Defeating it wins the run, same as
the Tornado. The Tornado alone pulls you toward it.

### Weather powerups (picked at level-up)

- **Sunbeam** — periodic heal + damage pulse around you
- **Rainbow Shield** — periodic brief invulnerability
- **Gale Force** — passive move speed boost
- **Frost Aura** — slows enemies near you
- **Static Charge** — attacks chain to a second enemy

## Development & CI

```bash
npm install
npm run dev         # Vite dev server (port 5173)
npm run typecheck   # tsc --noEmit
npm run build       # tsc -b && vite build → static dist/
npm run preview     # serve dist/ locally
npm run test:unit   # save/load/migration tests (vitest, no build)
npm run test:smoke  # Playwright smoke tests against a vite preview of dist/
```

### Keeping the game loop alive

Phaser's frame loop is `callback(); requestAnimationFrame(next)`, so a single
uncaught error in a single frame means the next frame is never scheduled and
the game is frozen for good (the page itself stays responsive). Two things
guard against that:

- `src/main.ts` wraps Phaser's step: an error is reported to the console
  (`data-frame-errors` on `#app` counts them), that frame is skipped, and the
  game carries on.
- Code that loops over a snapshot of enemies must check `enemy.isLive` before
  touching an enemy: an earlier hit in the same loop (a Static Charge chain, a
  lightning strike) may already have destroyed it, and a destroyed enemy has no
  physics body. `e2e/battle-stability.spec.ts` pins this for swings, the beam
  and lightning.

Living enemies are capped (`MAX_LIVING_ENEMIES`) so a knight who cannot keep up
does not let hundreds pile up.

`npm run test:smoke` serves the production build, so run `npm run build`
first. Install Chromium once with `npx playwright install chromium`. The
smoke config (`playwright.smoke.config.ts`) starts `vite preview` on
`127.0.0.1:4173` and runs `e2e/smoke.spec.ts`: page title, the meta description,
canonical URL, Open Graph and Twitter tags, favicon, web manifest, robots.txt,
the 240×160 Phaser canvas, region emblems, a clean console, the pause menu,
touch controls under phone emulation, the quit confirmation, the level-up
freeze, and a save that survives reload (Continue restores the run and the
mute; Reset save clears it). It skips `e2e/feel-demo.spec.ts`. Passing runs
also write screenshots under `e2e-artifacts/` (gitignored).

`npm run capture` is a separate Playwright command (`playwright.config.ts`).
It records the clips in `capture/` against `CAPTURE_URL`, which defaults to
the GitHub Pages copy. `playwright.demo.config.ts` records
`e2e/feel-demo.spec.ts` locally and has no npm script. The workflow below
runs the smoke config only.

GitHub Actions (`.github/workflows/ci.yml`) runs on pull requests and on
pushes to `main`, on Ubuntu with Node 22:

1. `npm ci`
2. `npm run typecheck`
3. `npm run test:unit`
4. `npm run build`
5. install Playwright Chromium (`npx playwright install --with-deps chromium`,
   with `~/.cache/ms-playwright` cached on the lockfile)
6. `npm run test:smoke`

If the smoke test fails, the Playwright HTML report and trace
(`playwright-report/` and `test-results/`) are uploaded as the
`playwright-report` artifact. Screenshots in `e2e-artifacts/*.png` are
uploaded as `feel-screenshots` on every run. Both artifacts are kept for 7
days.

## Hosting

`npm run build` writes a static `dist/` folder. Playing the game needs no
backend and no environment variables.

**https://rainknights.vercel.app** is the live site. The Vercel project
`rainknights` (Vite) deploys that production URL automatically from
pushes to `main`.

The GitHub Pages copy is retired. **https://rainknights.vercel.app** is the only site.

## Project structure

```
src/
  main.ts          Phaser game bootstrap, touch controls, pause overlay, exit save
  save/            versioned localStorage save, migration, run checkpoints
  scenes/          Boot, Menu, CharacterSelect, RegionSelect, Game, GameOver, Overlay
  entities/        Player, Projectile, enemy classes
  systems/         WeatherDirector, WeatherService, Terrain, LevelUpSystem, PowerupSystem
  gfx/             procedural pixel sprites, tiles, weapons, palette
  ui/              HUD, pause menu, windows
  input/           keyboard mapping, touch d-pad, on-screen hints
  audio/           synthesized music, sound effects, weather ambience
  config/          characters, regions, weapons, gameplay constants
e2e/               Playwright smoke tests
test/              unit tests for the save
capture/           optional clip recordings (outside CI)
.github/workflows/ci.yml
```
