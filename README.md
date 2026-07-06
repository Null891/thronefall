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

- **Pick your loadout on the menu** — a map (Nordfels, or **Leviathan** once you've survived
  3 nights), a rider (King Aldric · Lady Maren and her falcon · stout Grimbold), a weapon
  (Spear / Longbow / Warhammer, each with its own **Q** ability), and two **royal edicts**
- **WASD / arrows** — ride (screen-relative)
- **E** — build or upgrade at the nearest slot (or click any building / the castle)
- **Space** — begin the night · **Q** — weapon ability · **E** — rally horn
- **1 / 2 / 3** — troop orders (Hold / Charge / **Follow Me**) · **Esc** — pause · **M** — mute

**Taxes lie in the streets.** At dawn every building spills its coins on the ground — ride close
and they leap into your purse. Barrel Knights and Ogres drop loot mid-battle too. Anything left
uncollected sweeps itself in when night falls.

**Commanding troops.** *Follow Me* (3) gathers only the soldiers **around the King** — ride past
others to add them to the retinue — then *Hold* (1) stations the whole party right where it stands.
*Charge* (2) sends melee hunting across the whole field while archers advance to firing positions.
Soldiers in the road **body-block the horde**, and **palisade walls** (a buildable slot on every
road) stop it cold until battered down; masons repair them at dawn. Fallen soldiers muster again
at nightfall.

**The Armory.** Every night survived banks **crowns** (double on boss nights). Spend them on the
menu for permanent unlocks: the **Frost Staff** (chilling bolts, Q = Blizzard), the **Royal Seal**
(a third edict slot), two new edicts, and the **Royal Bastion** fourth castle tier.

**Bosses & the deep.** Every 5th night a boss marches — the Ogre Warlord on Nordfels, the
Broodmother on Leviathan. Nights 8+ bring wall-ignoring **Shades**; war chiefs drive the horde
from night 10, and surviving ten nights earns your saga screen. And on Leviathan, from night 4…
watch the water.

**Endless campaign.** Nights 1–3 are authored; from night 4 the horde scales forever (runners from
night 4, spitters from night 6, ogre packs every 3rd night, +18% enemy HP per night past 3). From
night 3 the horde comes in **two waves** with a brief lull between them. New build plots are surveyed
as days pass, the Castle Center can be fortified twice (its arrows improve), and the King himself can
fall in melee — he respawns at the keep after 6 s. Survive as long as you can.

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
- Procedural WebAudio (`game/src/audio.js`): synth sfx + a generative score that crossfades from
  folk plucks by day to drone-and-heartbeat by night. No samples; wakes on the first input.
- Exact economy/combat numbers documented in `ROADMAP.md` §7.
