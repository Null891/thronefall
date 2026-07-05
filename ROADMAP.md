# Thronefall Web Remake — Blueprint, Resources, and Build Prompt

This document is the complete plan for taking the current SVG/DOM mockup (`thronefall-ui-mockup.html`, v0.4)
to a real, playable, browser-based game that looks and feels like actual Thronefall.

---

## 0. Fix the target first

Two contradictory goals are floating around this project:

1. "Blender-Cycles photorealism, Minecraft shaders on steroids, PBR, 8K, caustics, parallax occlusion."
2. "Make it like the real game."

These are opposites. Thronefall's entire visual identity is **flat-shaded, untextured low-poly** with
saturated pastel colors, one warm sun, soft shadows, and restrained post-processing (bloom on emissives,
gentle grading). It contains no PBR texture work, no parallax mapping, no photorealistic water.
Chasing SEUS-style rendering moves the project AWAY from the target. The correct goal:

> A true-3D, GPU-rendered, flat-shaded low-poly island with a follow camera, real lighting that
> changes between day and night, physical game-feel (knockback, squash/stretch, coin vacuum),
> and the flat opaque UI already designed in the mockup.

---

## 1. Autopsy of the pasted "WebGL 2.0 remediation" document

What it gets right:
- The DOM/SVG ceiling is real **for a full game** (hundreds of animated entities). GPU rendering is the correct next step.
- Fixed-timestep simulation decoupled from render — correct (v0.4 already does this).
- Instancing for repeated geometry, pooling for effects — correct.
- Vertex-shader wind sway via world-position sine — correct and cheap; keep this idea.

What it gets wrong:
- **Deferred shading mandate is overkill.** A Thronefall scene has 1 directional light + a handful of
  night point lights (torches/windows). Forward rendering handles that trivially. Deferred costs you MSAA,
  complicates transparency, and multiplies implementation time for zero visible benefit at this light count.
- **"No external libraries" is counterproductive.** Hand-rolling a scene graph, GLTF loader, shadow maps,
  and a post chain is months of work. Three.js provides all of it, battle-tested, in ~170 KB gzipped.
  The constraint only makes sense as a learning exercise, not as a path to a finished game.
- **Its own code sample contradicts the text.** The GLSL provided is a forward Blinn-Phong shader with fog
  and ACES — there is no G-buffer, no lighting pass, no draw call, no geometry, no camera matrix. It renders
  literally nothing. It is a skeleton wearing a manifesto.
- **"Kawasaki Bloom" does not exist.** The technique is the (dual) **Kawase** blur, after Masaki Kawase.
  Small error, but it tells you the text is pattern-matched, not written by someone who has shipped it.
- **"Upload 10,000 grass matrices via gl.bufferData per frame"** is an anti-pattern. Static instances are
  uploaded once; only dynamic transforms get updated per frame.
- **"8K internal rendering"** (4× supersampling) is the most brute-force AA that exists and will melt an iGPU.
- The procedural-texture mandate solves a non-problem: the target art style needs approximately one
  256×4 gradient ramp texture, total.

---

## 2. Where the current mockup genuinely falls short of the real game

Keep the mockup — it is now the UI/UX spec and the design document. But these are the real gaps:

1. **Dimensionality + camera** (biggest gap). Real Thronefall is true 3D with a damped follow camera on
   the king, zoom, and parallax as you ride. The mockup is a fixed 2D frame.
2. **The command layer.** In the real game you rally troops to follow the king and release them — that is
   the core tactical verb at night. The mockup has stationary auto-attackers and a global stance chip.
3. **Physicality.** Knockback impulses, collision separation between units, arrows that arc and can whiff,
   melee swings with hit arcs, deaths that pop. The mockup's combat is deterministic bookkeeping.
4. **Scale + progression.** Real maps: 15–30+ build spots, multi-tier castle/wall upgrades, XP levels,
   pre-level loadout (weapon, perks, mutators). Mockup: 12 slots, 3 nights, loadout only in the style guide.
5. **Day/night as lighting, not palette.** Real transition = the sun actually sets: moving shadows,
   exposure shift, warm→cool ambient. The token swap is a good 2D stand-in but reads as recolor, not light.
6. **Audio. There is none.** A third of Thronefall's feel is audio: dawn stingers, wave horns, thunks.
7. **Animation.** Procedural bob/squash-stretch on everything that moves; the mockup has CSS wobbles.
8. **Enemy design.** Real game: ranged, shielded, exploding, building-targeting flyers, scripted bosses.
   Mockup: four flat stat blocks.

What is already right and must be preserved: economy numbers, day/night loop, wave preview at spawn,
flat opaque HUD, cooldown sweeps, locked threat colors, tabular numerals, palette tokens.

---

## 3. Stack decision

**Primary recommendation: Three.js (r160+) + Vite + vanilla JS + DOM overlay for UI.**
- Shadow maps, GLTF loading, `InstancedMesh`, `EffectComposer`/`UnrealBloomPass`/`SSAOPass` out of the box.
- Deploys as static files — drops straight into the existing GitHub → Vercel pipeline.
- The mockup's HUD (fonts, chips, sweeps, banners) ports over nearly verbatim as an HTML overlay layer.

Alternatives:
- **Godot 4** — if the ambition outgrows the browser. Free, real engine, but web export is a heavy wasm
  payload and iteration is slower for a web-first project.
- **Unity URP** — what Grizzly Games actually used. Best if you ever want Steam; worst licensing/setup noise.
- **Raw WebGL2 deferred pipeline** — rejected. Months of plumbing for a scene that forward rendering
  handles at 60fps with headroom.

---

## 4. Art direction cheat sheet (how Thronefall actually gets its look)

- **Geometry**: chunky low-poly, exaggerated proportions (fat crenellations, oversized doors), flat shading.
- **Color**: no textures — vertex colors or a tiny gradient-atlas (the Imphenzia technique: UV-point-paint
  onto a small color ramp). Reuse the locked palette: day grass `#A8D08D/#85B56A/#5A8B58`,
  night grass `#455A64/#2E3C43/#1A2327`, threat red `#E64A53`, toxic green `#85D671`, gold `#F0B429`.
- **Light rig**: one warm directional sun (~40° elevation, soft PCF shadows) + cool hemisphere ambient.
  Night = lerp the sun to a dim cool moon direction, drop exposure, raise emissive windows/torches
  (point lights + bloom). The transition IS the feature — take 3–4 seconds over it.
- **Post**: ACES tone mapping (built into three.js), selective bloom driven by emissive materials,
  subtle SSAO, vignette. Depth of field only on the menu diorama.
- **Water**: flat plane + gentle sine displacement + foam ring at the coast. No caustics — the game has none.
- **Wind**: vertex-shader sway on foliage (`sin(time + worldPos)` weighted by height).
- **Camera**: perspective FOV 30–35° (near-orthographic compression), pitch ~55°, fixed yaw ~45°,
  damped follow on the king, slight zoom-out at night.

---

## 5. Build roadmap (each stage is shippable)

- **Stage 0 — Toolchain (half a day).** Node + `npm create vite@latest` + `npm i three`.
  Acceptance: a flat-shaded spinning cube with ACES + bloom, deployed on Vercel.
- **Stage 1 — Greybox loop (1–2 weekends).** Ground plane, two Catmull-Rom spline lanes, king capsule with
  WASD + follow camera, raycast-clickable build rings, box buildings, capsule enemies marching, castle HP,
  dawn payout. Port the ECS numbers verbatim from the mockup. Acceptance: a full 3-night run can be won
  and lost at 60fps with zero art.
- **Stage 2 — Art pass (1–2 weekends).** Kenney/Quaternius GLTFs or Blender customs, palette ramp,
  sun + shadows, night lighting lerp, emissive windows.
- **Stage 3 — Feel pass (1 weekend).** Squash/stretch tweens, knockback, physical coin burst + vacuum,
  camera shake, hit flashes, audio (CC0 packs + jsfxr).
- **Stage 4 — Command layer + content.** Rally/follow troops (the real game's key verb), 2–3 new enemy
  archetypes, castle upgrade tiers.
- **Stage 5 — UI port.** Move the mockup HUD over as the DOM overlay: chips, cooldown sweeps, wave
  previews, pause/settings/victory. It is already designed; don't redesign it.
- **Stage 6 — Polish.** Post tuning, menu diorama with DoF, perks screen, difficulty mutators.

---

## 6. Resources (verified 2026-07-05)

Reference on the actual game:
- Buy Thronefall on Steam (~$13) and record your own reference footage — nothing substitutes for this.
- Game Developer: "Mastering minimalism and layering complexity with strategy game Thronefall" —
  https://www.gamedeveloper.com/design/mastering-minimalism-and-layering-complexity-with-strategy-game-thronefall
- GameDiscoverCo deep dive on Thronefall's minimalism and sales —
  https://newsletter.gamediscover.co/p/deep-dive-how-thronefall-went-minimal
- Interview with Paul Schnepf — https://int-magazine.com/interview/paul-schnepf-of-thronefall/
- Jonas Tyroller's YouTube channel (co-developer; has making-of/devlog material on Thronefall).
  Grizzly Games = Jonas Tyroller + Paul Schnepf (Islanders); note the IP was later acquired by Mythwright.

Engine & rendering:
- three.js docs + examples — https://threejs.org (manual at threejs.org/manual is the best free intro)
- Discover three.js (free book) — https://discoverthreejs.com
- Three.js Journey (Bruno Simon, paid, canonical course) — https://threejs-journey.com
- pmndrs postprocessing (better bloom/SSAO chain than stock) — https://github.com/pmndrs/postprocessing
- The Book of Shaders (GLSL fundamentals) — https://thebookofshaders.com
- webgl2fundamentals.org — only if you insist on raw WebGL2 someday.

Assets (all CC0):
- Kenney Tower Defense Kit (160 models) — https://kenney.nl/assets/tower-defense-kit
- Kenney Nature Kit (330 models) — https://kenney.nl/assets/nature-kit
- Kenney's full catalog (UI packs, audio packs too) — https://kenney.nl/assets
- Quaternius (low-poly medieval/nature/animated characters) — https://quaternius.com
- poly.pizza (CC0 model search) — https://poly.pizza
- Blender + the Imphenzia "gradient palette" workflow (YouTube: "Imphenzia low poly") for custom pieces.

Audio:
- Kenney audio packs (CC0), freesound.org, jsfxr (https://sfxr.me) for UI blips and impacts.

---

## 7. The build prompt (copy-paste, run stage by stage)

Feed the ROLE+CONSTANTS block plus ONE stage at a time to your code agent. Do not paste all stages at
once — you want a verifiable checkpoint between each.

```
[ROLE + CONSTANTS — include with every stage]

You are building "Thronefall Web Remake": a browser game recreating the look, feel, and vertical-slice
mechanics of Thronefall (Grizzly Games). Stack: Vite + three.js (latest) + vanilla JS + a DOM overlay
for all UI. No React. No physics engine — hand-rolled kinematics.

ART DIRECTION (hard constraints):
- Flat-shaded low-poly. NO PBR textures, NO photorealism, NO deferred rendering. MeshLambert/MeshToon
  or flat-shaded MeshStandard with vertex colors / a single gradient-ramp texture only.
- Palette tokens (day): grass #A8D08D/#85B56A/#5A8B58, sand #F0D59D, water #7BC5E3, stone #DDE2EB,
  wood #D4A373, gold #F0B429. Night: desaturated cool (grass #455A64 family, water #3A5A85 family).
- Threat colors locked, unshaded: red #E64A53, toxic green #85D671.
- Lighting: one warm directional sun with PCF soft shadows + cool hemisphere light. Night = 3.5s
  animated lerp: sun→dim cool moon, exposure down, emissive windows/torches up (point lights + bloom).
- Post: ACESFilmicToneMapping, selective bloom (emissive-driven), subtle vignette. 60fps on integrated
  graphics at 1080p is the budget; InstancedMesh for trees/grass/enemies; object-pool all projectiles,
  damage numbers, and particles.
- Camera: perspective FOV 32°, pitch ~55°, yaw fixed 45°, damped follow on the king, zoom out 15% at night.

MECHANICS (exact numbers, do not change):
- Loop: Day (build) → Night (defend) ×3, victory tally at dawn, defeat if castle HP 0.
- Economy: House 2g→+1 (upgrade 2g→+2), Windmill 3g→+1 & unlocks Fields, Field 1g→+1,
  Mine 5g→pays 6 decaying −1/night, Harbour 3g→+1 boat/night (max 5) paying 1 each
  (upgrade 3g→2 each), Tower 3g (upgrades: Sniper +range/+dmg 3g, Rapid ×2 rate 3g),
  Barracks 4g→4 units (Knights or Berserks), Range 4g→3 archers (Longbows or Fire Archers).
- Combat stats: Slime hp2 spd1.5 dmg1 rate1.4; Barrel hp5 spd1.0 dmg2 rate1.6; Wasp hp2 spd2.6 dmg1
  rate1.1 flying; Ogre hp18 spd0.7 dmg3 rate1.8. Knight rng1.9 rate0.7 dmg1; Berserk 1.9/0.8/2;
  Longbow 13/1.15/1; Fire archer 9/1.2/1 splash r1.7; Tower 8.5/0.95/2; Sniper 13.5/1.2/3;
  Rapid 8.5/0.48/2; Castle 11/1.1/2. King: spd 9, hp 20, melee 2 dmg @0.55s (0.34s under horn),
  Spear Q: 6s cd, 8 dmg, range 10. Horn E: 14s cd, 6s attack-speed buff.
- Waves: N1 = 10 slimes lane A. N2 = 8 slimes A/B, 4 barrels, 3 wasps. N3 = 10 slimes, 6 barrels,
  5 wasps, 1 ogre (A). Wave preview banners (skull + count) hover at spawn points during the day.
- Sim: fixed 60Hz timestep with accumulator, render interpolation. Expose window.__pump(seconds)
  that advances the sim deterministically for headless testing.

UI: DOM overlay, flat and opaque: panels #1A1622 with 2px #3A3049 borders, Cinzel display font,
Nunito UI font, font-variant-numeric: tabular-nums on all counters, flat gold CTA (#F0B429, hover
#F6C95C + translateY(-2px) + hard shadow), radial cooldown sweeps on ability buttons.

VERIFY: after each stage, the game must boot with zero console errors and hit the stage's acceptance
criteria before you proceed.
```

```
[STAGE 1 — GREYBOX]
Build the playable loop with placeholder geometry only (boxes/capsules/rings). Island = flat disc in a
water plane. Two enemy lanes as Catmull-Rom splines from coast to castle. King = capsule, WASD/arrows,
damped follow camera. Build slots = clickable rings with coin-pip costs (raycast picking, E-key nearest).
Implement the full economy, wave, and combat spec from CONSTANTS. HUD: gold, day counter, castle HP,
king HP, ability buttons with cooldown sweeps, begin-night CTA, wave preview markers.
ACCEPTANCE: full 3-night run winnable and losable; 60fps; __pump-driven headless run reaches victory
deterministically.
```

```
[STAGE 2 — ART PASS]
Replace greybox with flat-shaded low-poly art per ART DIRECTION: castle with corner turrets, houses,
windmill with spinning blades, mine, harbour with boats, walls and gate towers, pines and round trees,
rocks, wildflower instances. Gradient-ramp or vertex-color materials only. Implement the animated
day↔night lighting transition and emissive night windows/torches with selective bloom. Water plane with
gentle sine swell and a foam ring at the coast. Vertex-shader wind sway on all foliage.
ACCEPTANCE: side-by-side screenshot pair (day/night) reads unmistakably as Thronefall's style; 60fps.
```

```
[STAGE 3 — GAME FEEL]
Squash/stretch tween on every spawn/hit/death. Knockback impulses on melee hits. Soft collision
separation between units. Physical coins: burst from buildings at dawn, scatter with gravity, vacuum
to the king when within 4 units. Camera shake on castle damage (respect prefers-reduced-motion).
Audio: CC0 one-shots for build/coin/hit/death/horn + a dawn stinger; WebAudio with a master volume
setting. ACCEPTANCE: a 20-second capture of night combat visibly and audibly "feels" like Thronefall.
```

```
[STAGE 4 — COMMAND LAYER + CONTENT]
Rally mechanic: hold F to call nearby allied units to follow the king; release to station them at the
king's position. Add 2 enemy archetypes: a ranged spitter (attacks from 6 units) and a building-seeking
flyer that targets economy structures. Castle upgrade tiers (2 levels: +HP, +castle arrow rate).
ACCEPTANCE: night 3 is winnable only by actively repositioning troops; enemies visibly threaten economy.
```

Stages 5–6 (UI port from thronefall-ui-mockup.html, menus/perks/polish) follow the same pattern.
```

---

## 8. What to do right now

1. Commit this file: `git add ROADMAP.md && git commit -m "roadmap" && git push`.
2. Install Node.js if you haven't, then Stage 0 (Vite + three.js hello-world on Vercel).
3. Run Stage 1 with the prompt above — in Claude Code, in this repo, so the ECS numbers and UI spec
   are on hand as ground truth.
