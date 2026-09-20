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
- **Move**: WASD or Arrow keys (blocked by lakes and rock clusters on the map)
- **Menus**: Arrow keys / W-S + Enter/Space/Z, number keys, or the mouse
- **Swing**: hold **Space** to swing your weapon (sword / hammer / daggers) in an arc
  toward the way you're facing — strong, with knockback
- **Energy beam**: hold **J** or **X** to fire a piercing beam in your facing
  direction (short recharge, shown by the gauge under your HP)
- **Auto-attack**: a weaker Storm Bolt still fires at the nearest enemy as a backup
- **Level up**: collect XP gems from defeated enemies, then pick one of three
  upgrades (weapon, stat, or weather power)
- **Goal**: survive the escalating storm fronts and defeat the **Tornado**
  boss that arrives at the 5-minute mark

### Music & sound

All audio is original and synthesized live in the browser (WebAudio
square/triangle/noise chiptune — no audio files): a title theme, a theme per
city, a boss theme, victory/game-over jingles, sound effects for every
action, and rain/wind/thunder ambience that follows each city's live weather.
Browsers only allow sound after your first key press or click. Press **M** to
mute/unmute (remembered between visits).

### Live local weather

Before each run, the game asks your browser for your location and checks the
**real current weather there** (via the free [Open-Meteo](https://open-meteo.com/)
API — no key required) to decide which storm front you *start* the run on:
actually raining where you are means you start further into the storm. If
location access is denied, unavailable, or the request times out, the run
just starts calm — there's no hard dependency on it.

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

## Development

```bash
npm install
npm run dev       # start the dev server
npm run build     # type-check and build a static dist/ bundle
npm run preview   # preview the production build locally
```

## Hosting

`npm run build` produces a fully static `dist/` folder with no backend or
environment variables required. It can be deployed to any static host:

- **Vercel / Netlify**: import the repo, framework preset "Vite", build
  command `npm run build`, output directory `dist`
- **GitHub Pages**: push the contents of `dist/` to a `gh-pages` branch (or
  use an action that runs `npm run build` and publishes `dist/`)
- **itch.io**: zip the contents of `dist/` and upload as an HTML5 game

## Project structure

```
src/
  main.ts              Phaser game bootstrap
  scenes/               Boot, Menu, CharacterSelect, WeatherCheck, Game, GameOver
  entities/              Player, Projectile, enemy classes
  systems/                 WeatherDirector, WeatherService, Terrain, LevelUpSystem, PowerupSystem
  gfx/                       procedural pixel-sprite generator + palette
  ui/                          HUD
  config/                        characters, tunable gameplay constants
```
