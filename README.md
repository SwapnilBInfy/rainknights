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
| Enter | Confirm a menu, start a run, or continue from game over. |
| Esc or P | Pause or resume a live run. |
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
| Start | Pause while a run is live. Otherwise Enter, which covers the title and the game-over "PRESS START" |

With touch in use, the hints lead with those labels (`STICK MOVE  A SWING  B BEAM`
on the title, and `A/SPACE`, `B/J`, `START: pause` once a run has started).

A gamepad's **Start** button (button 9 in the standard mapping) pauses and
resumes a live run, the same as Esc, P, and the touch Start button. Movement
and attacks stay on the keyboard and the touch cluster.

### Pause menu

Pausing freezes the whole scene: enemy movement, auras, and the storm clock.
The menu is **Resume**, **Sound** (SOUND ON / SOUND OFF, the same mute as M),
and **Quit**. Arrows, W/S, or the d-pad move the selection. Enter, Space, Z,
or A activates it.

**Quit** asks **Abandon run?** **No** is selected by default, so confirming
again returns to the pause menu with the run still paused. **Yes** drops
the run and returns to the title. Esc, P, touch Start, and gamepad Start
leave that question and return to the pause menu.

The run also pauses if the window loses focus or the tab is hidden, while a
run is underway and a level-up menu is not already open.

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
npm run test:smoke  # Playwright smoke tests against a vite preview of dist/
```

`npm run test:smoke` serves the production build, so run `npm run build`
first. Install Chromium once with `npx playwright install chromium`. The
smoke config (`playwright.smoke.config.ts`) starts `vite preview` on
`127.0.0.1:4173` and runs `e2e/smoke.spec.ts`: page title, the 240×160 Phaser
canvas, region emblems, a clean console, the pause menu, touch controls under
phone emulation, the quit confirmation, and the level-up freeze. It skips
`e2e/feel-demo.spec.ts`. Passing runs also write screenshots under
`e2e-artifacts/` (gitignored).

`npm run capture` is a separate Playwright command (`playwright.config.ts`).
It records the clips in `capture/` against `CAPTURE_URL`, which defaults to
the GitHub Pages copy. `playwright.demo.config.ts` records
`e2e/feel-demo.spec.ts` locally and has no npm script. The workflow below
runs the smoke config only.

GitHub Actions (`.github/workflows/ci.yml`) runs on pull requests and on
pushes to `main`, on Ubuntu with Node 22:

1. `npm ci`
2. `npm run typecheck`
3. `npm run build`
4. install Playwright Chromium (`npx playwright install --with-deps chromium`,
   with `~/.cache/ms-playwright` cached on the lockfile)
5. `npm run test:smoke`

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

A GitHub Pages copy is also published at
**https://swapnilbinfy.github.io/rainknights/**. Repository settings deploy
Pages from a branch: the `gh-pages` branch, folder `/` (the root of that
branch). No workflow in this repo publishes it. GitHub's built-in
`pages-build-deployment` workflow serves the files already committed there
— a static `index.html` plus `assets/`. That branch is a snapshot last
updated on 2026-08-20, and pushes to `main` do not rebuild it. Whether the
Pages copy stays up is pending a decision by the owner.

## Project structure

```
src/
  main.ts          Phaser game bootstrap, touch controls, pause overlay
  scenes/          Boot, Menu, CharacterSelect, RegionSelect, Game, GameOver, Overlay
  entities/        Player, Projectile, enemy classes
  systems/         WeatherDirector, WeatherService, Terrain, LevelUpSystem, PowerupSystem
  gfx/             procedural pixel sprites, tiles, weapons, palette
  ui/              HUD, pause menu, windows
  input/           keyboard mapping, touch d-pad, on-screen hints
  audio/           synthesized music, sound effects, weather ambience
  config/          characters, regions, weapons, gameplay constants
e2e/               Playwright smoke tests
capture/           optional clip recordings (outside CI)
.github/workflows/ci.yml
```
