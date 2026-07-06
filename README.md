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

- **WASD / arrows** — ride the King (screen-relative)
- **E** — build or upgrade at the nearest slot (or click any building / the castle)
- **Space** — begin the night
- **Q** — spear throw · **E** — rally horn (at night)
- **1 / 2** — troop stance (Hold / Charge) · **Esc** — pause

**Endless campaign.** Nights 1–3 are authored; from night 4 the horde scales forever (runners from
night 4, spitters from night 6, ogre packs every 3rd night, +18% enemy HP per night past 3). New build
plots are surveyed as days pass, the Castle Center can be fortified twice (its arrows improve), and the
King himself can fall in melee — he respawns at the keep after 6 s. Survive as long as you can.

## Run locally

Static files with ES modules — needs any local server:

```
node serve.mjs      # http://localhost:8123
```

Deploys as-is to any static host (Vercel: push to main).

## Test scenarios (deterministic)

`/game/?scenario=day2` · `?scenario=night2` · `?scenario=night6` (endless-mode wave, castle Lv 2) ·
`?scenario=vic` (full night → dawn). `window.__pump(seconds)` advances the fixed-timestep sim headlessly;
`window.__dbg` exposes state for behavioral tests.

## Tech notes

- three.js r185 vendored in `game/vendor/` via import map — no bundler, no build step.
- Flat-shaded procedural geometry only; palette day/night lerp + real light rig (warm sun → cool moon,
  torch point lights, additive glow sprites). No textures except a generated radial-gradient sprite.
- Fixed 60 Hz simulation with accumulator; object-pooled projectiles, damage numbers, coins, poofs.
- Exact economy/combat numbers documented in `ROADMAP.md` §7.
