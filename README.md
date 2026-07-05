# Thronefall — Fan Web Remake

A fan-made study project recreating the look, feel, and vertical-slice mechanics of
[Thronefall](https://store.steampowered.com/app/2239150/Thronefall/) (Grizzly Games).
Not affiliated with Grizzly Games or Mythwright.

## What's here

| Path | What it is |
|---|---|
| `index.html` | Landing hub |
| `game/` | **The 3D remake** — three.js (vendored, no build step), procedural low-poly art, real day/night lighting |
| `thronefall-ui-mockup.html` | The interactive UI/UX design document (SVG mockup, style guide, spec annotations) |
| `ROADMAP.md` | Architecture decisions, art-direction cheat sheet, staged build prompts |

## Play

- **WASD / arrows** — ride the King
- **E** — build at the nearest slot (or click a slot ring)
- **Space** — begin the night
- **Q** — spear throw · **E** — rally horn (at night)
- **1 / 2** — troop stance (Hold / Charge) · **Esc** — pause

Three nights. Build economy and defenses by day; if the Castle Center falls, the run ends.

## Run locally

Static files with ES modules — needs any local server:

```
node serve.mjs      # http://localhost:8123
```

Deploys as-is to any static host (Vercel: push to main).

## Test scenarios (deterministic)

`/game/?scenario=day2` · `?scenario=night2` (mid-combat, frozen) · `?scenario=vic` (full night → dawn).
`window.__pump(seconds)` advances the fixed-timestep sim headlessly.

## Tech notes

- three.js r185 vendored in `game/vendor/` via import map — no bundler, no build step.
- Flat-shaded procedural geometry only; palette day/night lerp + real light rig (warm sun → cool moon,
  torch point lights, additive glow sprites). No textures except a generated radial-gradient sprite.
- Fixed 60 Hz simulation with accumulator; object-pooled projectiles, damage numbers, coins, poofs.
- Exact economy/combat numbers documented in `ROADMAP.md` §7.
