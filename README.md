# Rainknights

A top-down survival game: you play a lone knight fighting off waves of enemies
conjured from real weather patterns, as an incoming storm escalates around you.

Built with **Phaser 3** + **TypeScript** + **Vite**. All art is procedurally
generated pixel-art (no external image/audio assets), rendered with hard,
non-anti-aliased pixels for a chunky, retro handheld look.

## Play

- **Move**: WASD or Arrow keys
- **Attack**: automatic — your Storm Bolt fires at the nearest enemy in range
- **Level up**: collect XP gems from defeated enemies, then pick one of three
  upgrades (weapon, stat, or weather power)
- **Goal**: survive the escalating storm fronts and defeat the **Tornado**
  boss that arrives at the 5-minute mark

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
  scenes/               Boot, Menu, Game, GameOver
  entities/              Player, Projectile, enemy classes
  systems/                 WeatherDirector, LevelUpSystem, PowerupSystem
  gfx/                       procedural pixel-sprite generator + palette
  ui/                          HUD
  config/                        tunable gameplay constants
```
