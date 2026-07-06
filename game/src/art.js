/* art.js — procedural flat-shaded low-poly builders for Thronefall Web Remake.
   No textures, no assets: geometry + the locked palette, lit by the real sun. */
import * as THREE from 'three';

/* ---------- palette: [day, night] per material; lights do most of the night work,
   but bases also cool slightly so shadows never go muddy ---------- */
const PAL = {
  grass:   ['#A8D08D', '#5E7770'], grassLt: ['#B8DCA0', '#6A8379'],
  sand:    ['#F0D59D', '#8A8578'], path:    ['#E5C98F', '#7E7A6E'],
  water:   ['#7BC5E3', '#2C4A74'], waterLt: ['#9AD4EA', '#3C5D88'],
  stone:   ['#DDE2EB', '#9AA3B8'], stoneDk: ['#C2C9D6', '#818B9F'],
  wood:    ['#D4A373', '#8A7A66'], cream:   ['#F4E8CB', '#B0AC9F'],
  roof:    ['#D3705C', '#96625C'], roofB:   ['#7B93C9', '#5A6C96'],
  pine:    ['#5FA263', '#46635C'], pineDk:  ['#4C8A54', '#3A554E'],
  trunk:   ['#8A6A48', '#5E5347'], snow:    ['#F4F8FA', '#C6D2E6'],
  wheat:   ['#E8CD74', '#9A8F6A'], dark:    ['#3A3138', '#2A252E'],
};
export const CONST = { threat:'#E64A53', toxic:'#85D671', gold:'#F0B429', steel:'#C9D2DE',
  skin:'#E8B98E', horse:'#C89A6B', mane:'#8A6A48', rust:'#C97B5A' };

const REG = [];   // material registry for day/night lerp
const EMIS = [];  // emissive registry {m, day, night} intensities
export const ANIMS = []; // per-frame decorations: fn(time, dt)

function M(name, opts = {}) {
  const [d, n] = PAL[name];
  const m = new THREE.MeshStandardMaterial({ color: d, flatShading: true, roughness: .92, metalness: 0, ...opts });
  REG.push({ m, d: new THREE.Color(d), n: new THREE.Color(n) });
  return m;
}
function MC(hex, opts = {}) { // constant (threat/gold/etc), slight self-light so it reads at night
  const { glow, ...rest } = opts;
  return new THREE.MeshStandardMaterial({ color: hex, flatShading: true, roughness: .9, metalness: 0,
    emissive: hex, emissiveIntensity: glow ?? .18, ...rest });
}
export function windowMat() {
  const m = new THREE.MeshStandardMaterial({ color: '#8A7A58', emissive: '#FFD97A', emissiveIntensity: 0, roughness: .8 });
  EMIS.push({ m, day: 0, night: 2.4 });
  return m;
}
function flameMat() {
  const m = new THREE.MeshStandardMaterial({ color: '#FFC85C', emissive: '#FFB35C', emissiveIntensity: 0, roughness: .6 });
  EMIS.push({ m, day: 0, night: 3.2 });
  return m;
}
/* additive glow sprites — the game's soft light halos, no post-processing needed */
const glowTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.35, 'rgba(255,255,255,.4)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const GLOWS = [];
export function glow(color, size, day, night, flick = false) {
  const m = new THREE.SpriteMaterial({ map: glowTex, color, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  GLOWS.push({ m, day, night, flick: flick ? Math.random() * 9 : null });
  return s;
}
export function setPhase(t, time = 0) { // 0 = day, 1 = night
  for (const r of REG) r.m.color.lerpColors(r.d, r.n, t);
  for (const e of EMIS) e.m.emissiveIntensity = e.day + (e.night - e.day) * t;
  for (const g of GLOWS) {
    let o = g.day + (g.night - g.day) * t;
    if (g.flick !== null) o *= .8 + .2 * Math.sin(time * 7 + g.flick);
    g.m.opacity = o;
  }
}

/* shared materials */
const mats = {};
for (const k in PAL) mats[k] = M(k);
mats.water.roughness = .35;
const mThreat = MC(CONST.threat), mToxic = MC(CONST.toxic, { glow: .3 }), mGold = MC(CONST.gold, { glow: .12 });
const mSteel = MC(CONST.steel, { glow: .05 }), mSkin = MC(CONST.skin, { glow: .1 }),
      mHorse = MC(CONST.horse, { glow: .06 }), mMane = MC(CONST.mane, { glow: 0 }), mRust = MC(CONST.rust, { glow: .1 });
const mWhite = new THREE.MeshBasicMaterial({ color: '#F6F2E8' });

/* ---------- geometry helpers ---------- */
function mesh(geo, mat, x = 0, y = 0, z = 0, shadow = true) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  o.castShadow = shadow; o.receiveShadow = true;
  return o;
}
const box = (w, h, d, m, x = 0, y = 0, z = 0) => mesh(new THREE.BoxGeometry(w, h, d), m, x, y + h / 2, z);
const cyl = (rt, rb, h, seg, m, x = 0, y = 0, z = 0) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m, x, y + h / 2, z);
const cone = (r, h, seg, m, x = 0, y = 0, z = 0) => cyl(0.001, r, h, seg, m, x, y, z);
function prismRoof(w, d, h, m, x = 0, y = 0, z = 0) { // 4-sided pyramid stretched to rectangle
  const o = cone(0.72, h, 4, m, x, y, z);
  o.rotation.y = Math.PI / 4;
  o.scale.set(w, 1, d);
  return o;
}
function flag(color, s = 1) {
  const g = new THREE.Group();
  g.add(cyl(.035 * s, .035 * s, 1.5 * s, 5, mats.dark));
  const f = box(.75 * s, .38 * s, .04 * s, typeof color === 'string' ? MC(color, { glow: .15 }) : color, .42 * s, 1.18 * s, 0);
  g.add(f);
  const ph = Math.random() * 9;
  ANIMS.push((t) => { f.rotation.y = Math.sin(t * 2.4 + ph) * .28; });
  return g;
}

/* ---------- terrain ---------- */
function coastShape(grow, sx = 1, sz = 1, sc = 1) {
  const pts = [];
  for (let i = 0; i < 72; i++) {
    const th = i / 72 * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
    const base = 24 / Math.pow(Math.max(Math.abs(c), Math.abs(s)), 0.72);
    const wob = Math.sin(th * 3 + 1.7) * 1.1 + Math.sin(th * 5 + .4) * .7 + Math.sin(th * 8 + 2.9) * .45;
    const r = (base + wob) * sc + grow;
    pts.push(new THREE.Vector2(25 + r * c * sx, -(25 + r * s * sz)));
  }
  return new THREE.Shape(pts);
}
function blob(grow, depth, mat, topY, sx, sz, sc) {
  const geo = new THREE.ExtrudeGeometry(coastShape(grow, sx, sz, sc), { depth, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, topY - depth, 0);
  const o = new THREE.Mesh(geo, mat);
  o.receiveShadow = true; o.castShadow = false;
  return o;
}
/* alternate grounds: regolith for the moon, drowned stone for the abyss */
function M2(day, night, opts = {}) {
  const m = new THREE.MeshStandardMaterial({ color: day, flatShading: true, roughness: .92, metalness: 0, ...opts });
  REG.push({ m, d: new THREE.Color(day), n: new THREE.Color(night) });
  return m;
}
const lavaMat = (() => {
  const m = new THREE.MeshStandardMaterial({ color: '#3A2320', flatShading: true, roughness: .8,
    emissive: '#FF6A3D', emissiveIntensity: .55 });
  ANIMS.push((t) => { m.emissiveIntensity = .45 + Math.sin(t * 2.2) * .2; }); // the roads themselves breathe fire
  return m;
})();
const cloudMat = new THREE.MeshBasicMaterial({ color: '#E8EEF6' });
const TERRA = {
  ash: { grass: M2('#4A4048', '#241E26'), grassLt: M2('#5A4E56', '#2C2530'), sand: M2('#6A5A52', '#332A28'), get path() { return lavaMat; } },
  dune: { grass: M2('#E8CD8E', '#8A7A56'), grassLt: M2('#F2DCA4', '#988762'), sand: M2('#D9B87A', '#7A6A4A'), path: M2('#C9A45E', '#6E5A3A') },
  sky: { grass: M2('#D8E2F0', '#586A8E'), grassLt: M2('#E6EEF8', '#64769A'), sand: M2('#B9C7DE', '#485A7E'), path: M2('#A9B9D4', '#40526F') },
  ice: { grass: M2('#E6EEF5', '#5E6E86'), grassLt: M2('#F2F8FC', '#6A7A92'), sand: M2('#C6D6E3', '#4A5A70'), path: M2('#B4C7D8', '#42526A') },
  jungle: { grass: M2('#5E9A4E', '#2E4A38'), grassLt: M2('#74B25E', '#3A5A42'), sand: M2('#C9B87A', '#6A6248'), path: M2('#A98F5E', '#575038') },
  moon: { grass: M2('#B9BFC9', '#4A5160'), grassLt: M2('#CBD1DA', '#575E6D'), sand: M2('#8E939E', '#3A404C'), path: M2('#A6ACB8', '#4A505C') },
  abyss: { grass: M2('#3E7D8A', '#1E3A4A'), grassLt: M2('#4E96A0', '#26485A'), sand: M2('#7BAF9E', '#2E5450'), path: M2('#5E9AA6', '#2A4A56') },
};
const spaceMat = new THREE.MeshBasicMaterial({ color: '#0A0D18' });
let seaMesh = null; // the open sea persists across maps
export function buildTerrain(group, lanes, opts = {}) {
  const { sx = 1, sz = 1, sc = 1, pond = true, pal = null } = opts;
  const T = TERRA[pal] || mats;
  const SP = (u, v) => [25 + (u - 25) * sc, 25 + (v - 25) * sc]; // decorative coords stretch with the island
  if (!seaMesh) {
    seaMesh = mesh(new THREE.PlaneGeometry(500, 500), mats.water, 25, 0, 25, false);
    seaMesh.rotation.x = -Math.PI / 2; seaMesh.position.y = -.55;
  }
  if (!seaMesh.parent) group.parent?.add(seaMesh);
  seaMesh.material = pal === 'moon' ? spaceMat : pal === 'sky' ? cloudMat : mats.water;
  const shallow = blob(3.4, .1, new THREE.MeshStandardMaterial({ color: '#9AD4EA', transparent: true, opacity: .45, roughness: .5 }), -.42, sx, sz, sc);
  REG.push({ m: shallow.material, d: new THREE.Color('#9AD4EA'), n: new THREE.Color('#3C5D88') });
  group.add(shallow);
  group.add(blob(1.1, .6, T.sand, -.06, sx, sz, sc));
  group.add(blob(0, 2.6, T.grass, 0, sx, sz, sc));
  /* meadow patches */
  for (const [u0, v0, r] of [[14,20,3],[33,36,4],[24,10,2.5],[40,20,3],[10,37,2.6],[38,8,3.2],[8,10,2.8],[42,44,3]]) {
    const [u, v] = SP(u0, v0);
    const p = cyl(r * sc, r * sc, .04, 24, T.grassLt, u, .02, v); p.castShadow = false; group.add(p);
  }
  /* lanes as rounded plates */
  const plate = (u, v, r, m, y) => { const p = cyl(r, r, .05, 14, m, u, y, v); p.castShadow = false; group.add(p); };
  for (const pts of lanes) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [au, av] = pts[i], [bu, bv] = pts[i + 1];
      const n = Math.ceil(Math.hypot(bu - au, bv - av) / .9);
      for (let j = 0; j <= n; j++) {
        const u = au + (bu - au) * j / n, v = av + (bv - av) * j / n;
        plate(u, v, 1.55, T.sand, .035); plate(u, v, 1.15, T.path, .06);
      }
    }
  }
  plate(25, 27.4, 3.1, T.sand, .035); plate(25, 27.4, 2.55, T.path, .06);
  if (pond) {
    const [pu, pv] = SP(43, 37);
    plate(pu, pv, 4.3, T.sand, .03);
    const pd = cyl(3.9, 3.9, .05, 24, mats.waterLt, pu, .05, pv); pd.castShadow = false; group.add(pd);
  }
  /* flowers */
  if (!pal) for (const [u0, v0] of [[12,18],[18,13.5],[30,10],[37,15],[40,28],[35,41],[24,40],[13,38],[8,30],[28,36.5],[20,19],[31,31.5],[6,20],[44,12],[10,44],[41,40]]) {
    const [u, v] = SP(u0, v0);
    group.add(cyl(.09, .09, .3, 5, mWhite, u, 0, v));
    group.add(cyl(.08, .08, .24, 5, mGold, u + .5, 0, v - .3));
  }
  /* fireflies — drift over the meadows, night only */
  let seed = 9;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < Math.round(14 * sc); i++) {
    const u = 25 + (7 + rnd() * 36 - 25) * sc, v = 25 + (7 + rnd() * 36 - 25) * sc, ph = rnd() * 9, sp = .6 + rnd();
    const s = glow('#FFD97A', .8 + rnd() * .5, 0, .8, true);
    group.add(s);
    ANIMS.push((t) => {
      if (!s.parent) return;
      s.position.set(u + Math.sin(t * sp * .5 + ph) * 2.2, 1 + Math.sin(t * sp + ph * 2) * .5, v + Math.cos(t * sp * .4 + ph) * 2.2);
    });
  }
}

/* ---------- flora & rocks ---------- */
export function treePine(s = 1) {
  const g = new THREE.Group();
  g.add(cyl(.16 * s, .2 * s, .9 * s, 6, mats.trunk));
  g.add(cone(1.15 * s, 1.9 * s, 7, mats.pine, 0, .7 * s, 0));
  g.add(cone(.85 * s, 1.6 * s, 7, mats.pineDk, 0, 1.9 * s, 0));
  return g;
}
export function treeRound(s = 1) {
  const g = new THREE.Group();
  g.add(cyl(.17 * s, .22 * s, 1 * s, 6, mats.trunk));
  const c = mesh(new THREE.IcosahedronGeometry(1.15 * s, 0), mats.pineDk, 0, 2 * s, 0); c.scale.y = .85; g.add(c);
  const c2 = mesh(new THREE.IcosahedronGeometry(.6 * s, 0), mats.pine, -.55 * s, 2.5 * s, .2 * s); g.add(c2);
  return g;
}
export function bush(s = 1) {
  const c = mesh(new THREE.IcosahedronGeometry(.8 * s, 0), mats.pineDk, 0, .45 * s, 0); c.scale.y = .7;
  const g = new THREE.Group(); g.add(c);
  g.add(mesh(new THREE.IcosahedronGeometry(.42 * s, 0), mats.pine, -.4 * s, .7 * s, .1 * s));
  return g;
}
export function rock(s = 1) {
  const r = mesh(new THREE.IcosahedronGeometry(.9 * s, 0), mats.stoneDk, 0, .4 * s, 0); r.scale.y = .62;
  return r;
}
export function mountain(s = 1) {
  const g = new THREE.Group();
  g.add(cone(3.4 * s, 7.4 * s, 5, mats.stoneDk));
  g.add(cone(1.15 * s, 2.5 * s, 5, mats.snow, 0, 5.4 * s, 0));
  const side = cone(2 * s, 4.4 * s, 5, mats.stone, 2.3 * s, 0, -.8 * s); side.rotation.y = .7; g.add(side);
  return g;
}
export function spawnFlagArt() {
  const g = new THREE.Group(); g.add(flag(CONST.threat, 1.4)); return g;
}
export function boat() {
  const g = new THREE.Group();
  const hull = box(1.5, .32, .7, mats.wood); hull.scale.z = .85; g.add(hull);
  g.add(cyl(.03, .03, 1.3, 4, mats.dark, 0, .3, 0));
  const sail = cone(.42, .95, 3, mWhite, .02, .55, 0); sail.castShadow = false; g.add(sail);
  ANIMS.push((t) => { g.position.y = .02 + Math.sin(t * 1.6) * .05; g.rotation.z = Math.sin(t * 1.3) * .05; });
  return g;
}

/* ---------- walls / gates / castle ---------- */
export function wallRun(len) {
  const g = new THREE.Group();
  g.add(box(.9, 2.1, len, mats.stone, 0, 0, len / 2));
  for (let i = 0; i < Math.floor(len / 1.3); i++) g.add(box(.66, .55, .7, mats.stoneDk, 0, 2.1, .6 + i * 1.3));
  return g;
}
export function gateTower() {
  const g = new THREE.Group();
  g.add(box(1.7, 4, 1.7, mats.stone));
  g.add(box(2, .38, 2, mats.stoneDk, 0, 4, 0));
  g.add(prismRoof(1.45, 1.45, 1.7, mats.roofB, 0, 4.38, 0));
  const fl = mesh(new THREE.SphereGeometry(.16, 6, 5), flameMat(), .95, 2.2, .95); fl.castShadow = false; g.add(fl);
  const gw = glow('#FFB35C', 3.4, 0, .85, true); gw.position.set(.95, 2.3, .95); g.add(gw);
  g.userData.torch = new THREE.Vector3(.95, 2.4, .95);
  return g;
}
function turret(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  g.add(cyl(.55, .62, 5.1, 7, mats.stone));
  g.add(cyl(.72, .72, .32, 7, mats.stoneDk, 0, 5.1, 0));
  g.add(cone(.78, 1.7, 7, mats.roofB, 0, 5.42, 0));
  return g;
}
export function castleArt() {
  const g = new THREE.Group();
  g.add(box(5.6, .9, 5.6, mats.stoneDk));
  g.add(box(4, 4.6, 4, mats.stone, 0, .9, 0));
  for (let i = 0; i < 4; i++) { // crenellations on the keep rim
    g.add(box(.55, .6, .4, mats.stoneDk, -1.55 + i * 1.05, 5.5, 1.85));
    g.add(box(.4, .6, .55, mats.stoneDk, 1.85, 5.5, -1.55 + i * 1.05));
  }
  g.add(box(2, 3.8, 2, mats.stone, 0, 5.5, 0));
  g.add(prismRoof(1.75, 1.75, 2.9, mats.roofB, 0, 9.3, 0));
  g.add(turret(-2.35, -2.35)); g.add(turret(2.35, -2.35)); g.add(turret(-2.35, 2.35)); g.add(turret(2.35, 2.35));
  g.add(box(1.15, 1.7, .15, mats.dark, 0, .9, 2.02));               // gate door
  const wm = windowMat();
  g.add(box(.42, .8, .1, wm, -.5, 7.6, 1.02)); g.add(box(.42, .8, .1, wm, .5, 7.6, 1.02));
  g.add(box(.42, .7, .1, wm, 0, 2.6, 2.02));
  const f1 = mesh(new THREE.SphereGeometry(.17, 6, 5), flameMat(), -1.3, 1.9, 2.6); f1.castShadow = false; g.add(f1);
  const f2 = mesh(new THREE.SphereGeometry(.17, 6, 5), flameMat(), 1.3, 1.9, 2.6); f2.castShadow = false; g.add(f2);
  const gw1 = glow('#FFB35C', 3.8, 0, .9, true); gw1.position.set(-1.3, 2, 2.6); g.add(gw1);
  const gw2 = glow('#FFB35C', 3.8, 0, .9, true); gw2.position.set(1.3, 2, 2.6); g.add(gw2);
  const gw3 = glow('#FFD97A', 3, 0, .5); gw3.position.set(0, 7.6, 1.2); g.add(gw3);
  const bf = flag(CONST.gold, 1.5); bf.position.y = 12.2; g.add(bf);
  g.userData.torches = [new THREE.Vector3(-1.3, 2.1, 2.6), new THREE.Vector3(1.3, 2.1, 2.6)];
  return g;
}

/* ---------- buildings ---------- */
export function houseArt(upg, manor) {
  const g = new THREE.Group(); const hh = manor ? 2.9 : upg ? 2.3 : 1.7;
  g.add(box(2.7, hh, 2, mats.cream));
  g.add(prismRoof(2.1, 1.6, 1.5, manor ? mats.roofB : mats.roof, 0, hh, 0));
  g.add(box(.6, .95, .12, mats.dark, .3, 0, 1.02));
  g.add(box(.55, .55, .1, windowMat(), -.7, hh - 1, 1.02));
  if (manor) g.add(box(.55, .55, .1, windowMat(), .55, hh - 1.9, 1.02));
  const gw = glow('#FFD97A', 1.9, 0, .45); gw.position.set(-.7, hh - .75, 1.2); g.add(gw);
  if (upg) { const f = flag(manor ? CONST.threat : CONST.gold, .9); f.position.set(-.9, hh + .6, -.5); g.add(f); }
  if (manor) g.add(box(3, .25, 2.3, mGold, 0, hh - .1, 0));
  return g;
}
export function millArt(upg) {
  const g = new THREE.Group();
  g.add(box(2.1, 2.7, 2.1, mats.cream));
  if (upg) g.add(box(2.3, .25, 2.3, mGold, 0, 2.55, 0));
  g.add(prismRoof(1.7, 1.7, 1.6, mats.roof, 0, 2.7, 0));
  g.add(box(.55, .85, .12, mats.dark, 0, 0, 1.07));
  const hub = new THREE.Group(); hub.position.set(0, 2.5, 1.18); g.add(hub);
  const sailS = upg ? 1.35 : 1;
  for (let i = 0; i < 4; i++) {
    const b = box(.34 * sailS, 1.5 * sailS, .06, mWhite, 0, .45 * sailS, 0);
    const arm = new THREE.Group(); arm.rotation.z = i * Math.PI / 2; arm.add(b); hub.add(arm);
  }
  hub.add(mesh(new THREE.SphereGeometry(.16, 6, 5), mats.dark));
  ANIMS.push((t, dt) => { hub.rotation.z += dt * .8; });
  return g;
}
export function fieldArt() {
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) g.add(box(2.6, .32, .5, mats.wheat, 0, 0, -.85 + i * .85));
  return g;
}
export function mineArt(deep) {
  const g = new THREE.Group();
  g.add(cone(1.9, 2.3, 5, mats.stoneDk));
  g.add(box(.8, 1, .14, mats.dark, 0, 0, 1.15));
  g.add(mesh(new THREE.IcosahedronGeometry(.28, 0), mGold, 1.1, .18, 1.2));
  g.add(mesh(new THREE.IcosahedronGeometry(.2, 0), mGold, -1.15, .14, 1));
  if (deep) { // deep shaft: pit-head frame and a richer seam
    g.add(box(.2, 1.6, .2, mats.trunk, -.55, 0, 1.15)); g.add(box(.2, 1.6, .2, mats.trunk, .55, 0, 1.15));
    g.add(box(1.4, .2, .3, mats.trunk, 0, 1.5, 1.15));
    g.add(mesh(new THREE.IcosahedronGeometry(.24, 0), mGold, .2, 2, .3));
  }
  return g;
}
export function harbourArt(upg, upg2) {
  const g = new THREE.Group();
  if (upg2) { // the lighthouse calls more boats home
    g.add(cyl(.3, .38, 2.6, 7, mWhite, -1.9, 0, -.8));
    g.add(cyl(.34, .34, .3, 7, mThreat, -1.9, 2.6, -.8));
    const lg = glow('#FFE9A6', 3, .1, .95, true); lg.position.set(-1.9, 3, -.8); g.add(lg);
  }
  g.add(box(1.8, 1.5, 1.9, mats.cream, -.9, 0, 0));
  g.add(prismRoof(1.5, 1.6, 1.2, mats.roof, -.9, 1.5, 0));
  g.add(box(2.6, .3, 1, mats.wood, 1.1, .15, .2));
  g.add(box(.5, .5, .1, windowMat(), -.9, .6, .98));
  if (upg) g.add(box(1.4, .3, .9, mats.wood, 1.4, .15, -1));
  const b = boat(); b.scale.setScalar(.75); b.position.set(1.9, .3, .9); g.add(b);
  return g;
}
export function towerArt(upg, mw) {
  const g = new THREE.Group(); const tall = upg === 'sniper' ? 1.3 : 0;
  g.add(cyl(.8, .92, 3.6 + tall, 8, mats.stone));
  if (upg === 'archer') g.add(cyl(.95, .95, .35, 8, mGold, 0, 2.1, 0));
  if (upg === 'frost') {
    g.add(cyl(.95, .95, .35, 8, MC('#9FD8F0', { glow: .5 }), 0, 2.1, 0));
    const iceGw = glow('#9FD8F0', 2.6, .25, .7); iceGw.position.set(0, 4.6 + tall, 0); g.add(iceGw);
  }
  g.add(cyl(1.05, 1.05, .4, 8, mats.stoneDk, 0, 3.6 + tall, 0));
  g.add(cone(1.12, 1.8, 8, upg === 'frost' ? mats.snow : mats.roofB, 0, 4 + tall, 0));
  g.add(box(.3, .8, .1, windowMat(), 0, 2.2 + tall, .88));
  const gw = glow('#FFD97A', 2.2, 0, .5); gw.position.set(0, 2.6 + tall, 1.05); g.add(gw);
  if (upg === 'sniper') { const f = flag('#5FA8C9', .8); f.position.y = 5.6 + tall; g.add(f); }
  if (mw) g.add(cone(.22, .6, 6, mGold, 0, 5.7 + tall, 0)); // masterwork finial
  g.userData.z = 4 + tall; // arrow launch height
  return g;
}
export function barracksArt(_, vet) {
  const g = new THREE.Group();
  g.add(box(3.2, 1.9, 2.2, mats.wood));
  g.add(prismRoof(2.5, 1.8, 1.4, mats.roof, 0, 1.9, 0));
  g.add(box(.75, 1.1, .12, mats.dark, 0, 0, 1.12));
  const f = flag(CONST.threat, .95); f.position.set(1.3, 2.6, -.7); g.add(f);
  if (vet) { // the veteran company hangs its shields on the wall
    for (let i = 0; i < 3; i++) g.add(cyl(.26, .26, .08, 8, mSteel, -1 + i, 1.2, 1.14));
    const f2 = flag(CONST.gold, .8); f2.position.set(-1.3, 2.5, -.7); g.add(f2);
  }
  return g;
}
export function rangeArt(_, guild) {
  const g = new THREE.Group();
  g.add(box(2.4, .7, 1.8, mats.wood));                    // shooting platform
  g.add(box(2.6, .18, 2, mats.cream, 0, .7, 0));
  /* standing target on a post, facing the platform */
  const t = new THREE.Group(); t.position.set(1.9, 0, .6); t.rotation.y = -.9; g.add(t);
  t.add(cyl(.06, .06, .9, 5, mats.trunk));
  const face = new THREE.Group(); face.position.y = 1.15; face.rotation.x = Math.PI / 2; t.add(face);
  face.add(cyl(.5, .5, .08, 12, mWhite));
  face.add(cyl(.32, .32, .1, 12, mThreat));
  face.add(cyl(.12, .12, .12, 12, mWhite));
  const f = flag('#5FA8C9', .85); f.position.set(-1, .88, -.6); g.add(f);
  if (guild) { // fletchers' guild: a second target and a gold pennant
    const t2 = new THREE.Group(); t2.position.set(2.2, 0, -.8); t2.rotation.y = -.7; g.add(t2);
    t2.add(cyl(.06, .06, .9, 5, mats.trunk));
    const face2 = new THREE.Group(); face2.position.y = 1.15; face2.rotation.x = Math.PI / 2; t2.add(face2);
    face2.add(cyl(.4, .4, .08, 12, mWhite));
    face2.add(cyl(.24, .24, .1, 12, mGold));
    const f2 = flag(CONST.gold, .7); f2.position.set(-1.6, .88, .4); g.add(f2);
  }
  return g;
}
export function roadWallArt(kind, upg2) {
  const g = new THREE.Group();
  if (kind === 'stone' || kind === 'gate') {
    const h = kind === 'gate' ? 2.9 : 2.4;
    g.add(box(.85, h, 3.6, mats.stone));
    for (let i = 0; i < 3; i++) g.add(box(.62, .5, .62, mats.stoneDk, 0, h, -1.2 + i * 1.2));
    g.add(box(1.15, kind === 'gate' ? 3.4 : 1, 1.15, mats.stoneDk, 0, 0, -2.05));
    g.add(box(1.15, kind === 'gate' ? 3.4 : 1, 1.15, mats.stoneDk, 0, 0, 2.05));
    if (kind === 'gate') { // archers walk the parapet
      g.add(box(1.1, .35, 4.6, mats.wood, 0, h, 0));
      const a = archerArt('longbow'); a.position.set(0, h + .35, .8); a.scale.setScalar(.85); g.add(a);
      const f = flag(CONST.gold, .8); f.position.set(0, h + 1.2, -1.8); g.add(f);
    }
  } else { // palisade
    const h = 1.9;
    g.add(box(.85, h, 3.6, mats.wood));
    for (let i = 0; i < 3; i++) g.add(box(.62, .5, .62, mats.trunk, 0, h, -1.2 + i * 1.2));
    for (const z of [-1.9, 1.9]) g.add(cyl(.14, .17, 2.2, 5, mats.trunk, 0, 0, z));
  }
  if (upg2) for (const z of [-1.35, 1.35]) { // reinforcing braces
    const b = box(.18, 2.2, .18, mats.trunk, .62, .1, z); b.rotation.z = .5; g.add(b);
  }
  return g;
}
export const BUILD_ART = { house: houseArt, mill: millArt, field: fieldArt, mine: mineArt,
  harbour: harbourArt, tower: towerArt, barracks: barracksArt, range: rangeArt, wall: roadWallArt };

/* ---------- leviathan bones ---------- */
export function ribArt(s = 1) {
  const arc = mesh(new THREE.TorusGeometry(3.1 * s, .2 * s, 6, 14, Math.PI), mats.snow);
  const g = new THREE.Group(); g.add(arc);
  return g;
}
export function boneSpike(s = 1) {
  const c = cone(.32 * s, 1.6 * s, 5, mats.snow);
  c.rotation.z = (Math.random() - .5) * .5;
  const g = new THREE.Group(); g.add(c);
  return g;
}
export function skullArt(s = 1) {
  const g = new THREE.Group();
  const sk = mesh(new THREE.IcosahedronGeometry(2.4 * s, 1), mats.snow, 0, 1.9 * s, 0);
  sk.scale.set(1.1, .92, 1.3); g.add(sk);
  g.add(box(3 * s, .7 * s, 2 * s, mats.snow, 0, .1 * s, .8 * s));
  g.add(box(.66 * s, .85 * s, .3 * s, mats.dark, -.85 * s, 2 * s, 2.15 * s));
  g.add(box(.66 * s, .85 * s, .3 * s, mats.dark, .85 * s, 2 * s, 2.15 * s));
  for (let i = 0; i < 5; i++) g.add(cone(.16 * s, .55 * s, 5, mats.snow, -1 * s + i * .5 * s, .35 * s, 1.75 * s));
  return g;
}

/* ---------- characters ---------- */
export function kingArt(char = 'aldric') {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body); g.userData.body = body;
  const h = new THREE.Group(); body.add(h);
  h.add(box(1.35, .55, .55, mHorse, 0, .62, 0));                     // horse body
  for (const [x, z] of [[-.48, .17], [-.48, -.17], [.48, .17], [.48, -.17]])
    h.add(cyl(.09, .09, .62, 5, mMane, x, 0, z));
  const neck = box(.3, .55, .3, mHorse, .62, .95, 0); neck.rotation.z = -.5; h.add(neck);
  h.add(box(.42, .28, .3, mHorse, .88, 1.28, 0));
  h.add(box(.3, .4, .06, mMane, .62, 1.05, 0));
  const tail = box(.1, .5, .1, mMane, -.72, .7, 0); tail.rotation.z = .5; h.add(tail);
  const capeM = char === 'maren' ? MC('#3E8E9E', { glow: .12 }) : char === 'grimbold' ? MC('#8A5A3A', { glow: .08 }) : mThreat;
  body.add(box(.5, .18, .4, capeM, 0, 1.12, 0));                    // saddle
  const k = new THREE.Group(); k.position.set(0, 1.28, 0); body.add(k);
  k.add(mesh(new THREE.CapsuleGeometry(char === 'grimbold' ? .27 : .22, .4, 3, 8), capeM, 0, .4, 0));
  k.add(mesh(new THREE.SphereGeometry(.2, 8, 7), mSkin, 0, .92, 0));
  if (char === 'maren') k.add(cone(.21, .32, 6, capeM, 0, 1.02, 0));                            // falconer's hood
  else if (char === 'grimbold') { k.add(cyl(.19, .22, .22, 7, mSteel, 0, .98, 0)); k.add(box(.1, .55, .48, mSteel, -.32, .4, 0)); } // helm + shield
  else k.add(cyl(.14, .17, .16, 6, mGold, 0, 1.05, 0));                                         // the crown
  if (char === 'maren') { // her falcon rides the wind beside her
    const falcon = new THREE.Group();
    falcon.add(mesh(new THREE.SphereGeometry(.13, 6, 5), mWhite));
    falcon.add(box(.5, .03, .14, mWhite, 0, .04, 0));
    falcon.add(cone(.05, .14, 4, mGold, .16, 0, 0));
    falcon.position.set(1.3, 2.3, 0);
    g.add(falcon); g.userData.falcon = falcon;
  }
  /* one prop per weapon; the game shows the chosen one */
  const spear = new THREE.Group(); spear.position.set(.3, .62, 0); spear.rotation.z = -.9; k.add(spear);
  spear.add(cyl(.03, .03, 1.5, 5, mMane));
  spear.add(cone(.08, .26, 5, mSteel, 0, .75, 0));
  const bow = new THREE.Group(); bow.position.set(.34, .55, 0); bow.rotation.z = -.4; k.add(bow);
  const arc = mesh(new THREE.TorusGeometry(.4, .035, 5, 12, Math.PI), mMane); arc.rotation.z = Math.PI / 2; bow.add(arc);
  bow.add(cyl(.012, .012, .78, 4, mWhite, -.02, 0, 0));
  const hammer = new THREE.Group(); hammer.position.set(.32, .6, 0); hammer.rotation.z = -.8; k.add(hammer);
  hammer.add(cyl(.045, .045, 1.1, 6, mMane));
  hammer.add(box(.34, .3, .3, mSteel, 0, .45, 0));
  const staff = new THREE.Group(); staff.position.set(.32, .6, 0); staff.rotation.z = -.5; k.add(staff);
  staff.add(cyl(.035, .035, 1.4, 5, mMane));
  staff.add(mesh(new THREE.OctahedronGeometry(.16, 0), MC('#9FD8F0', { glow: .9 }), 0, .82, 0));
  bow.visible = hammer.visible = staff.visible = false;
  g.userData.weapons = { spear, bow, hammer, staff };
  return g;
}

/* ---------- the Leviathan itself — a sea titan that surfaces off the coast ---------- */
export function serpentArt() {
  const g = new THREE.Group();
  const mSea = MC('#2E6E7E', { glow: .14 }), mBelly = MC('#8FCABB', { glow: .08 });
  const head = new THREE.Group(); head.position.set(0, 3.4, 0); g.add(head); g.userData.head = head;
  const skull = mesh(new THREE.IcosahedronGeometry(1.5, 0), mSea); skull.scale.set(1, .85, 1.4); head.add(skull);
  head.add(box(1.4, .5, 1.7, mBelly, 0, -.65, .35));
  head.add(mesh(new THREE.SphereGeometry(.19, 6, 5), MC('#85D671', { glow: 1.3 }), -.55, .35, 1));
  head.add(mesh(new THREE.SphereGeometry(.19, 6, 5), MC('#85D671', { glow: 1.3 }), .55, .35, 1));
  head.add(cone(.32, 1.1, 5, mSea, 0, 1.15, -.4));
  const neck = cyl(.62, .85, 2.8, 7, mSea, 0, 1.7, -.7); neck.rotation.x = .35; g.add(neck);
  const coils = [];
  for (const [dz, s] of [[-3.4, 1.1], [-6.6, .85]]) {
    const c = mesh(new THREE.TorusGeometry(1.5 * s, .55 * s, 7, 12, Math.PI), mSea, 0, 0, dz);
    c.rotation.y = Math.PI / 2;
    g.add(c); coils.push(c);
  }
  g.userData.coils = coils;
  const tail = cone(.5, 1.7, 5, mSea, 0, .6, -9); tail.rotation.x = -.8; g.add(tail);
  return g;
}
export function finArt() {
  const g = new THREE.Group();
  const f = cone(.45, 1.3, 4, mats.stoneDk); f.rotation.z = -.25; g.add(f);
  return g;
}
export function knightArt(kind) {
  const g = new THREE.Group();
  const m = kind === 'berserk' ? mRust : mSteel;
  g.add(mesh(new THREE.CapsuleGeometry(.26, .5, 3, 8), m, 0, .55, 0));
  g.add(mesh(new THREE.SphereGeometry(.2, 8, 7), mSteel, 0, 1.05, 0));
  const w = cyl(.035, .035, .8, 5, mMane, .3, .7, 0); w.rotation.z = -.7; g.add(w);
  if (kind === 'berserk') g.add(box(.3, .22, .06, mSteel, .55, 1, 0));
  else g.add(cone(.07, .22, 5, mSteel, .58, .98, 0));
  return g;
}
export function archerArt(kind) {
  const g = new THREE.Group();
  const m = kind === 'fire' ? mRust : mats.pine;
  g.add(mesh(new THREE.CapsuleGeometry(.24, .45, 3, 8), m, 0, .5, 0));
  g.add(cone(.2, .35, 6, kind === 'fire' ? mRust : mats.pineDk, 0, .95, 0));
  const bow = mesh(new THREE.TorusGeometry(.32, .03, 5, 10, Math.PI), mMane, .32, .7, 0);
  bow.rotation.z = -Math.PI / 2; g.add(bow);
  return g;
}
/* ---------- the Ironfront: war machines of another age ---------- */
const mOlive = MC('#6B7A4A', { glow: .1 }), mArmor = MC('#5A6B62', { glow: .08 });
function ww2Art(type) {
  const g = new THREE.Group();
  const bodyG = new THREE.Group(); g.add(bodyG); g.userData.body = bodyG;
  const tank = (s) => {
    bodyG.add(box(1.5 * s, .5 * s, 1 * s, mArmor, 0, .3 * s, 0));
    bodyG.add(box(1.6 * s, .3 * s, .24 * s, mats.dark, 0, .15 * s, .55 * s));
    bodyG.add(box(1.6 * s, .3 * s, .24 * s, mats.dark, 0, .15 * s, -.55 * s));
    bodyG.add(box(.7 * s, .4 * s, .7 * s, mArmor, -.1 * s, .8 * s, 0));
    const barrel = cyl(.07 * s, .07 * s, 1.2 * s, 6, mats.dark, .55 * s, .95 * s, 0);
    barrel.rotation.z = Math.PI / 2; bodyG.add(barrel);
  };
  if (type === 'slime') { // rifleman
    bodyG.add(mesh(new THREE.CapsuleGeometry(.24, .45, 3, 8), mOlive, 0, .5, 0));
    bodyG.add(cyl(.22, .25, .14, 8, mArmor, 0, .95, 0));
    const r = cyl(.03, .03, .8, 4, mats.dark, .28, .6, 0); r.rotation.z = -.5; bodyG.add(r);
  } else if (type === 'runner') { // commando
    bodyG.add(mesh(new THREE.CapsuleGeometry(.22, .4, 3, 8), mats.dark, 0, .45, 0));
    bodyG.add(cyl(.19, .21, .12, 8, mats.dark, 0, .85, 0));
    bodyG.add(mesh(new THREE.SphereGeometry(.05, 5, 4), mThreat, .1, .8, .18));
  } else if (type === 'barrel') tank(1);
  else if (type === 'ogre') { tank(1.7); bodyG.add(cone(.2, .5, 5, mThreat, -.9, 1.6, 0)); }
  else if (type === 'wasp') { // dive bomber
    const fus = mesh(new THREE.CapsuleGeometry(.22, .8, 3, 8), mArmor, 0, 0, 0); fus.rotation.z = Math.PI / 2; bodyG.add(fus);
    bodyG.add(box(1.7, .06, .4, mOlive, 0, .05, 0));
    bodyG.add(box(.5, .3, .06, mOlive, -.55, .15, 0));
    const prop = cyl(.04, .04, .5, 4, mats.dark, .62, 0, 0); prop.rotation.x = Math.PI / 2; bodyG.add(prop);
    bodyG.position.y = 2; g.userData.hoverY = 2;
  } else if (type === 'spitter') { // field gun
    const w1 = cyl(.32, .32, .12, 10, mats.dark, 0, .32, .5); w1.rotation.x = Math.PI / 2; bodyG.add(w1);
    const w2 = cyl(.32, .32, .12, 10, mats.dark, 0, .32, -.5); w2.rotation.x = Math.PI / 2; bodyG.add(w2);
    const bar = cyl(.08, .1, 1.4, 6, mArmor, .3, .7, 0); bar.rotation.z = -1.1; bodyG.add(bar);
    bodyG.add(box(.7, .6, .9, mArmor, -.2, .4, 0));
  } else if (type === 'chief') { // officer
    bodyG.add(mesh(new THREE.CapsuleGeometry(.26, .5, 3, 8), mArmor, 0, .55, 0));
    bodyG.add(cyl(.2, .23, .16, 8, mats.dark, 0, 1.08, 0));
    const f = flag(CONST.threat, 1); f.position.set(-.4, .8, -.3); bodyG.add(f);
  } else return null;
  return g;
}
export function enemyArt(type, skin) {
  if (skin === 'ww2') { const w = ww2Art(type); if (w) return w; }
  const g = new THREE.Group();
  const bodyG = new THREE.Group(); g.add(bodyG); g.userData.body = bodyG;
  if (type === 'cinderling') { // a coal that learned to crawl
    const b = mesh(new THREE.IcosahedronGeometry(.5, 0), MC('#FF6A3D', { glow: .8 }), 0, .4, 0); b.scale.y = .82; bodyG.add(b);
    bodyG.add(mesh(new THREE.SphereGeometry(.07, 5, 4), mats.dark, .17, .5, .36));
    bodyG.add(mesh(new THREE.SphereGeometry(.07, 5, 4), mats.dark, -.17, .5, .36));
    const gw = glow('#FF6A3D', 1.6, .3, .8, true); gw.position.y = .5; g.add(gw);
    return g;
  }
  if (type === 'scarab') { // rolls out of the dunes
    const b = mesh(new THREE.SphereGeometry(.45, 8, 6), MC('#3A6E8A', { glow: .3 }), 0, .38, 0); b.scale.set(1.25, .7, .95); bodyG.add(b);
    bodyG.add(mesh(new THREE.SphereGeometry(.2, 6, 5), mats.dark, .48, .3, 0));
    bodyG.add(cone(.08, .3, 4, mats.dark, .68, .35, 0));
    for (const z of [-.3, .3]) for (const x of [-.3, .1, .5]) bodyG.add(cyl(.04, .04, .3, 4, mats.dark, x, .05, z));
    return g;
  }
  if (type === 'sprite') { // a knot of stormlight
    const b = mesh(new THREE.IcosahedronGeometry(.3, 0), MC('#BFD8FF', { glow: 1.4 }), 0, 0, 0); bodyG.add(b);
    const gw = glow('#BFD8FF', 2.4, .4, .9, true); bodyG.add(gw);
    g.userData.hoverY = 1.6;
    bodyG.position.y = 1.6;
    return g;
  }
  if (type === 'iceling') { // frost given hunger
    const b = mesh(new THREE.IcosahedronGeometry(.52, 0), MC('#BFE4F5', { glow: .5 }), 0, .42, 0); b.scale.y = .82; bodyG.add(b);
    bodyG.add(cone(.1, .35, 4, mats.snow, 0, .8, 0));
    bodyG.add(mesh(new THREE.SphereGeometry(.07, 5, 4), mats.dark, .17, .5, .36));
    bodyG.add(mesh(new THREE.SphereGeometry(.07, 5, 4), mats.dark, -.17, .5, .36));
    return g;
  }
  if (type === 'panther') { // low, black, fast
    const b = box(1.1, .4, .45, mats.dark, 0, .35, 0); bodyG.add(b);
    bodyG.add(box(.35, .3, .35, mats.dark, .6, .55, 0));
    bodyG.add(mesh(new THREE.SphereGeometry(.05, 5, 4), MC('#F6C95C', { glow: 1.3 }), .78, .68, .1));
    bodyG.add(mesh(new THREE.SphereGeometry(.05, 5, 4), MC('#F6C95C', { glow: 1.3 }), .78, .68, -.1));
    const tail = cyl(.04, .06, .7, 4, mats.dark, -.6, .55, 0); tail.rotation.z = .8; bodyG.add(tail);
    for (const [x, z] of [[-.4, .18], [-.4, -.18], [.4, .18], [.4, -.18]])
      bodyG.add(cyl(.06, .06, .35, 4, mats.dark, x, 0, z));
    return g;
  }
  if (type === 'gorilla') { // a silverback of the deep green — a tiny boss
    const b = mesh(new THREE.CapsuleGeometry(.55, .5, 3, 8), mats.dark, 0, .85, 0); bodyG.add(b);
    bodyG.add(box(.7, .35, .3, mSteel, 0, .95, -.25));
    bodyG.add(mesh(new THREE.SphereGeometry(.28, 7, 6), mats.dark, 0, 1.5, .15));
    bodyG.add(mesh(new THREE.SphereGeometry(.06, 5, 4), mThreat, .1, 1.55, .4));
    bodyG.add(mesh(new THREE.SphereGeometry(.06, 5, 4), mThreat, -.1, 1.55, .4));
    for (const x of [-.6, .6]) { const arm = cyl(.14, .18, 1, 5, mats.dark, x, .2, .1); arm.rotation.z = x > 0 ? -.25 : .25; bodyG.add(arm); }
    return g;
  }
  if (type === 'moonling') { // pale things that hop in the low gravity
    const b = mesh(new THREE.IcosahedronGeometry(.5, 0), MC('#D8E6F5', { glow: .55 }), 0, .4, 0); b.scale.y = .85; bodyG.add(b);
    bodyG.add(mesh(new THREE.SphereGeometry(.07, 5, 4), mats.dark, .17, .52, .35));
    bodyG.add(mesh(new THREE.SphereGeometry(.07, 5, 4), mats.dark, -.17, .52, .35));
    return g;
  }
  if (type === 'tyrant') { // a crater tyrant, hide like stone
    const b = mesh(new THREE.IcosahedronGeometry(1.15, 0), mats.stoneDk, 0, 1, 0); b.scale.y = 1.1; bodyG.add(b);
    bodyG.add(mesh(new THREE.SphereGeometry(.1, 5, 4), MC('#B9F0FF', { glow: 1.2 }), .25, 1.55, .8));
    bodyG.add(mesh(new THREE.SphereGeometry(.1, 5, 4), MC('#B9F0FF', { glow: 1.2 }), -.25, 1.55, .8));
    const club = cyl(.15, .24, 1.7, 6, mats.stone, 1.2, .9, 0); club.rotation.z = -.7; bodyG.add(club);
    return g;
  }
  if (type === 'crab') { // sidles up from the trenches
    const b = mesh(new THREE.SphereGeometry(.5, 8, 6), MC('#D96A4A', { glow: .2 }), 0, .4, 0); b.scale.set(1.3, .6, 1); bodyG.add(b);
    for (const x of [-.5, .5]) for (const z of [-.35, .35]) {
      const leg = cyl(.05, .05, .5, 4, mats.dark, x * 1.2, .15, z); leg.rotation.z = x > 0 ? -.8 : .8; bodyG.add(leg);
    }
    bodyG.add(cone(.16, .4, 5, MC('#D96A4A', { glow: .25 }), .55, .45, .35));
    bodyG.add(cone(.16, .4, 5, MC('#D96A4A', { glow: .25 }), .55, .45, -.35));
    bodyG.add(mesh(new THREE.SphereGeometry(.06, 5, 4), mats.dark, .3, .62, .15));
    bodyG.add(mesh(new THREE.SphereGeometry(.06, 5, 4), mats.dark, .3, .62, -.15));
    return g;
  }
  if (type === 'jelly') { // drifts over wall and blade alike
    const mJel = MC('#8FD8F0', { glow: .6, transparent: true, opacity: .72 });
    const dome = mesh(new THREE.SphereGeometry(.5, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mJel, 0, 0, 0); bodyG.add(dome);
    for (let i = 0; i < 4; i++)
      bodyG.add(cyl(.03, .05, .7, 4, mJel, Math.cos(i * 1.57) * .25, -.6, Math.sin(i * 1.57) * .25));
    g.userData.hoverY = 1.5;
    bodyG.position.y = 1.5;
    return g;
  }
  if (type === 'urchin') { // a rolling fortress of spines
    const b = mesh(new THREE.IcosahedronGeometry(.8, 0), mats.dark, 0, .8, 0); bodyG.add(b);
    for (let i = 0; i < 10; i++) {
      const th = i / 10 * Math.PI * 2;
      const sp = cone(.09, .7, 4, MC('#B07EC9', { glow: .35 }), Math.cos(th) * .7, .55, Math.sin(th) * .7);
      sp.rotation.z = -th; bodyG.add(sp);
    }
    bodyG.add(mesh(new THREE.SphereGeometry(.09, 5, 4), mThreat, .3, 1.1, .55));
    bodyG.add(mesh(new THREE.SphereGeometry(.09, 5, 4), mThreat, -.3, 1.1, .55));
    return g;
  }
  if (type === 'skeleton') { // the dead walk the deep hollows
    bodyG.add(mesh(new THREE.CapsuleGeometry(.2, .5, 3, 8), mats.snow, 0, .55, 0));
    bodyG.add(mesh(new THREE.SphereGeometry(.19, 7, 6), mats.snow, 0, 1.08, 0));
    bodyG.add(box(.07, .09, .05, mats.dark, -.07, 1.1, .16));
    bodyG.add(box(.07, .09, .05, mats.dark, .07, 1.1, .16));
    const sw = box(.06, .7, .06, mSteel, .3, .6, 0); sw.rotation.z = -.6; bodyG.add(sw);
    return g;
  }
  if (type === 'slime') {
    const b = mesh(new THREE.IcosahedronGeometry(.55, 0), mToxic, 0, .42, 0); b.scale.y = .8; bodyG.add(b);
    bodyG.add(mesh(new THREE.SphereGeometry(.07, 5, 4), mats.dark, .2, .55, .38));
    bodyG.add(mesh(new THREE.SphereGeometry(.07, 5, 4), mats.dark, -.2, .55, .38));
  } else if (type === 'barrel') {
    bodyG.add(cyl(.42, .46, .95, 9, mats.wood, 0, 0, 0));
    bodyG.add(cyl(.48, .48, .1, 9, mats.trunk, 0, .28, 0));
    bodyG.add(cyl(.48, .48, .1, 9, mats.trunk, 0, .68, 0));
    bodyG.add(cone(.44, .4, 8, mSteel, 0, .95, 0));
    bodyG.add(mesh(new THREE.SphereGeometry(.06, 5, 4), mThreat, .16, .82, .4));
    bodyG.add(mesh(new THREE.SphereGeometry(.06, 5, 4), mThreat, -.16, .82, .4));
  } else if (type === 'wasp') {
    const b = mesh(new THREE.SphereGeometry(.42, 8, 7), mGold, 0, 0, 0); b.scale.set(1.25, .85, .9); bodyG.add(b);
    bodyG.add(mesh(new THREE.SphereGeometry(.2, 7, 6), mats.dark, .5, .05, 0));
    const sting = cone(.1, .3, 5, mats.dark, -.62, 0, 0); sting.rotation.z = Math.PI / 2; bodyG.add(sting);
    const wingM = new THREE.MeshBasicMaterial({ color: '#EDF2F8', transparent: true, opacity: .75, side: THREE.DoubleSide });
    const w1 = mesh(new THREE.PlaneGeometry(.55, .3), wingM, -.05, .32, .3, false);
    const w2 = mesh(new THREE.PlaneGeometry(.55, .3), wingM, -.05, .32, -.3, false);
    bodyG.add(w1); bodyG.add(w2);
    g.userData.wings = [w1, w2]; // animated by the sim so nothing leaks when the wasp dies
    bodyG.position.y = 1.7;
  } else if (type === 'runner') {
    const b = mesh(new THREE.IcosahedronGeometry(.42, 0), mThreat, 0, .34, 0); b.scale.y = .8; bodyG.add(b);
    bodyG.add(mesh(new THREE.SphereGeometry(.06, 5, 4), mats.dark, .15, .44, .3));
    bodyG.add(mesh(new THREE.SphereGeometry(.06, 5, 4), mats.dark, -.15, .44, .3));
  } else if (type === 'shade') {
    const mShade = new THREE.MeshStandardMaterial({ color: '#3A2E52', transparent: true, opacity: .78,
      emissive: '#6B4FA0', emissiveIntensity: .5, flatShading: true, roughness: .9 });
    const b = cone(.5, 1.3, 6, mShade, 0, .3, 0); bodyG.add(b);
    bodyG.add(mesh(new THREE.SphereGeometry(.07, 5, 4), MC('#B9F0FF', { glow: 1.4 }), .16, 1.05, .3));
    bodyG.add(mesh(new THREE.SphereGeometry(.07, 5, 4), MC('#B9F0FF', { glow: 1.4 }), -.16, 1.05, .3));
    bodyG.position.y = 1;
  } else if (type === 'chief') {
    bodyG.add(cyl(.5, .55, 1.15, 8, mSteel, 0, 0, 0));
    bodyG.add(cone(.5, .45, 8, mThreat, 0, 1.15, 0));
    bodyG.add(mesh(new THREE.SphereGeometry(.07, 5, 4), mThreat, .18, .92, .46));
    bodyG.add(mesh(new THREE.SphereGeometry(.07, 5, 4), mThreat, -.18, .92, .46));
    const f = flag(CONST.threat, 1.1); f.position.set(-.45, .9, -.3); bodyG.add(f);
    const drum = cyl(.24, .24, .3, 8, mats.wood, .55, .55, .2); drum.rotation.z = Math.PI / 2; bodyG.add(drum);
  } else if (type === 'spitter') {
    const mViolet = MC('#B07EC9', { glow: .3 });
    const b = mesh(new THREE.IcosahedronGeometry(.6, 0), mViolet, 0, .5, 0); b.scale.y = .9; bodyG.add(b);
    const snout = cone(.2, .5, 6, mats.dark, 0, .55, .55); snout.rotation.x = Math.PI / 2.3; bodyG.add(snout);
    bodyG.add(mesh(new THREE.SphereGeometry(.08, 5, 4), mats.dark, .22, .78, .4));
    bodyG.add(mesh(new THREE.SphereGeometry(.08, 5, 4), mats.dark, -.22, .78, .4));
  } else { // ogre
    const b = mesh(new THREE.IcosahedronGeometry(1.05, 0), MC('#7FA35A', { glow: .2 }), 0, .95, 0); b.scale.y = 1.1; bodyG.add(b);
    bodyG.add(mesh(new THREE.SphereGeometry(.55, 8, 7), MC('#93B56E', { glow: .15 }), 0, .7, .6));
    bodyG.add(mesh(new THREE.SphereGeometry(.09, 5, 4), mats.dark, .22, 1.5, .78));
    bodyG.add(mesh(new THREE.SphereGeometry(.09, 5, 4), mats.dark, -.22, 1.5, .78));
    const club = cyl(.13, .2, 1.5, 6, mats.trunk, 1.1, .9, 0); club.rotation.z = -.7; bodyG.add(club);
  }
  return g;
}

export function bossArt(kind) {
  if (kind === 'warlord') {
    const g = enemyArt('ogre');
    g.scale.setScalar(1.85);
    g.userData.body.add(cyl(.36, .46, .36, 6, mGold, 0, 2.05, 0));
    const f = flag(CONST.threat, 1.1); f.position.set(-.8, 1.6, -.5); g.userData.body.add(f);
    return g;
  }
  if (kind === 'skeleking') { // the Skeleton King, and the dead answer him
    const g = enemyArt('skeleton');
    g.scale.setScalar(2);
    g.userData.body.add(cyl(.18, .23, .2, 6, mGold, 0, 1.28, 0));
    g.userData.body.add(box(.5, .9, .08, MC('#3A2E52', { glow: .2 }), -.15, .45, -.2));
    const f = flag('#B07EC9', .9); f.position.set(-.4, 1, -.3); g.userData.body.add(f);
    return g;
  }
  if (kind === 'landship') { // a fortress on tracks
    const g = ww2Art('ogre');
    g.scale.setScalar(1.5);
    const t2 = new THREE.Group(); t2.position.set(-.9, 1.5, 0); g.userData.body.add(t2);
    t2.add(box(.6, .35, .6, mArmor));
    const b2 = cyl(.06, .06, .9, 6, mats.dark, .45, .25, 0); b2.rotation.z = Math.PI / 2; t2.add(b2);
    const f = flag(CONST.threat, 1.2); f.position.set(-1.6, 1.4, 0); g.userData.body.add(f);
    return g;
  }
  if (kind === 'acewing') { // the ace's gilded bomber
    const g = ww2Art('wasp');
    g.scale.setScalar(2.2);
    const nose = cone(.14, .4, 5, mGold, .95, -.15, 0); nose.rotation.z = -Math.PI / 2; g.userData.body.add(nose);
    return g;
  }
  if (kind === 'sab') { // the saboteur, cloaked and carrying his charge
    const g = new THREE.Group();
    const bodyG = new THREE.Group(); g.add(bodyG); g.userData.body = bodyG;
    bodyG.add(cone(.42, 1.25, 6, mats.dark, 0, .1, 0));
    bodyG.add(mesh(new THREE.SphereGeometry(.06, 5, 4), mThreat, .12, .95, .3));
    bodyG.add(mesh(new THREE.SphereGeometry(.06, 5, 4), mThreat, -.12, .95, .3));
    bodyG.add(mesh(new THREE.SphereGeometry(.22, 7, 6), mats.dark, .35, .5, 0));
    const fuse = cyl(.02, .02, .25, 4, mGold, .42, .78, 0); fuse.rotation.z = -.4; bodyG.add(fuse);
    g.scale.setScalar(1.3);
    return g;
  }
  if (kind === 'starspawn') { // something that fell from farther than the moon
    const g = enemyArt('jelly');
    g.scale.setScalar(2.6);
    g.userData.body.add(mesh(new THREE.IcosahedronGeometry(.2, 0), MC('#F0B429', { glow: 1.2 }), 0, .35, 0));
    g.userData.hoverY = 2;
    return g;
  }
  if (kind === 'tyrantking') { // the regolith giant
    const g = enemyArt('tyrant');
    g.scale.setScalar(1.8);
    g.userData.body.add(cyl(.4, .5, .38, 6, mGold, 0, 2.1, 0));
    return g;
  }
  if (kind === 'jellyqueen') {
    const g = enemyArt('jelly');
    g.scale.setScalar(2.3);
    g.userData.body.add(cyl(.22, .3, .24, 6, mGold, 0, .3, 0));
    return g;
  }
  if (kind === 'yeti') { // the mountain that walks
    const g = new THREE.Group();
    const bodyG = new THREE.Group(); g.add(bodyG); g.userData.body = bodyG;
    const b = mesh(new THREE.CapsuleGeometry(.9, .9, 3, 8), mats.snow, 0, 1.4, 0); bodyG.add(b);
    bodyG.add(mesh(new THREE.SphereGeometry(.45, 8, 6), mats.snow, 0, 2.5, .2));
    bodyG.add(mesh(new THREE.SphereGeometry(.09, 5, 4), MC('#7BC5E3', { glow: 1.4 }), .16, 2.6, .55));
    bodyG.add(mesh(new THREE.SphereGeometry(.09, 5, 4), MC('#7BC5E3', { glow: 1.4 }), -.16, 2.6, .55));
    bodyG.add(cone(.12, .5, 4, mats.stoneDk, .35, 2.85, .1));
    bodyG.add(cone(.12, .5, 4, mats.stoneDk, -.35, 2.85, .1));
    for (const x of [-.95, .95]) { const arm = cyl(.22, .3, 1.6, 5, mats.snow, x, .3, .1); arm.rotation.z = x > 0 ? -.2 : .2; bodyG.add(arm); }
    return g;
  }
  if (kind === 'meg') { // the megalodon — teeth the size of gate doors
    const g = new THREE.Group();
    const bodyG = new THREE.Group(); g.add(bodyG); g.userData.body = bodyG;
    const mShark = MC('#7A8EA0', { glow: .1 });
    const b = mesh(new THREE.SphereGeometry(1.4, 9, 7), mShark, .2, 1.1, 0); b.scale.set(1.7, .8, .7); bodyG.add(b);
    bodyG.add(box(2.2, .4, 1, MC('#E8F0F6', { glow: .08 }), .4, .45, 0));
    const fin = cone(.6, 1.5, 4, mShark, 0, 1.9, 0); bodyG.add(fin);
    const tail = cone(.5, 1.3, 4, mShark, -2.3, 1.2, 0); tail.rotation.z = 1.3; bodyG.add(tail);
    for (let i = 0; i < 6; i++) bodyG.add(cone(.1, .35, 4, mats.snow, 1.2 + (i % 3) * .3, .55, i < 3 ? .35 : -.35));
    bodyG.add(mesh(new THREE.SphereGeometry(.12, 5, 4), mats.dark, 1.6, 1.3, .5));
    bodyG.add(mesh(new THREE.SphereGeometry(.12, 5, 4), mats.dark, 1.6, 1.3, -.5));
    return g;
  }
  if (kind === 'vinehorror') { // the jungle, awake and displeased
    const g = new THREE.Group();
    const bodyG = new THREE.Group(); g.add(bodyG); g.userData.body = bodyG;
    const mVine = MC('#4E8A3E', { glow: .2 });
    bodyG.add(cyl(.7, 1, 2.2, 7, mats.trunk, 0, 0, 0));
    for (let i = 0; i < 5; i++) {
      const th = i / 5 * Math.PI * 2;
      const t = cone(.18, 1.8, 5, mVine, Math.cos(th) * .8, 1.8, Math.sin(th) * .8);
      t.rotation.z = Math.cos(th) * -.5; t.rotation.x = Math.sin(th) * .5; bodyG.add(t);
    }
    bodyG.add(mesh(new THREE.SphereGeometry(.5, 8, 6), MC('#E87A9C', { glow: .8 }), 0, 2.6, 0));
    const gw = glow('#E87A9C', 4, .25, .8, true); gw.position.y = 2.6; g.add(gw);
    return g;
  }
  if (kind === 'magmalord') { // the mountain's anger, walking
    const g = new THREE.Group();
    const bodyG = new THREE.Group(); g.add(bodyG); g.userData.body = bodyG;
    const b = mesh(new THREE.IcosahedronGeometry(1.3, 0), MC('#3A2320', { glow: .1 }), 0, 1.2, 0); b.scale.y = 1.1; bodyG.add(b);
    for (const [x, y, z] of [[-.5, 1.5, .6], [.6, 1, .5], [0, .6, .9], [.4, 1.8, .2]])
      bodyG.add(mesh(new THREE.IcosahedronGeometry(.28, 0), MC('#FF6A3D', { glow: 1.2 }), x, y, z));
    bodyG.add(mesh(new THREE.SphereGeometry(.11, 5, 4), MC('#FFD97A', { glow: 1.6 }), .3, 1.9, .85));
    bodyG.add(mesh(new THREE.SphereGeometry(.11, 5, 4), MC('#FFD97A', { glow: 1.6 }), -.3, 1.9, .85));
    const club = cyl(.16, .26, 1.9, 6, mats.dark, 1.35, 1, 0); club.rotation.z = -.7; bodyG.add(club);
    const gw = glow('#FF6A3D', 6, .4, .95, true); gw.position.y = 1.5; g.add(gw);
    return g;
  }
  if (kind === 'wyrm') { // the dune wyrm, sand pouring off its back
    const g = new THREE.Group();
    const bodyG = new THREE.Group(); g.add(bodyG); g.userData.body = bodyG;
    const mWyrm = MC('#C9A45E', { glow: .15 });
    const head = mesh(new THREE.SphereGeometry(1, 8, 7), mWyrm, .8, 1.2, 0); head.scale.set(1.2, 1, .9); bodyG.add(head);
    for (let i = 0; i < 8; i++) bodyG.add(cone(.14, .5, 4, mats.snow, 1.5, 1 + (i % 4) * .2, (i < 4 ? .4 : -.4)));
    bodyG.add(mesh(new THREE.SphereGeometry(.13, 5, 4), mThreat, 1.3, 1.7, .45));
    bodyG.add(mesh(new THREE.SphereGeometry(.13, 5, 4), mThreat, 1.3, 1.7, -.45));
    const hump1 = mesh(new THREE.SphereGeometry(.8, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mWyrm, -1, .2, 0); bodyG.add(hump1);
    const hump2 = mesh(new THREE.SphereGeometry(.6, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), mWyrm, -2.6, .1, 0); bodyG.add(hump2);
    return g;
  }
  if (kind === 'roc') { // the storm roc, wings wide as a wall
    const g = new THREE.Group();
    const bodyG = new THREE.Group(); g.add(bodyG); g.userData.body = bodyG;
    const mRoc = MC('#586A8E', { glow: .2 });
    const b = mesh(new THREE.CapsuleGeometry(.5, 1.1, 3, 8), mRoc, 0, 0, 0); b.rotation.z = Math.PI / 2; bodyG.add(b);
    bodyG.add(mesh(new THREE.SphereGeometry(.35, 7, 6), mRoc, .95, .15, 0));
    bodyG.add(cone(.12, .5, 4, MC('#F0B429', { glow: .6 }), 1.35, .1, 0)).rotation;
    const w1 = mesh(new THREE.BoxGeometry(1.1, .08, 2.2), mRoc, -.1, .2, 1.3, false);
    const w2 = mesh(new THREE.BoxGeometry(1.1, .08, 2.2), mRoc, -.1, .2, -1.3, false);
    bodyG.add(w1); bodyG.add(w2);
    g.userData.wings = [w1, w2]; // it truly flies
    g.userData.hoverY = 2.4;
    bodyG.position.y = 2.4;
    return g;
  }
  if (kind === 'maw') { // the anglerfish that ate the trench
    const g = new THREE.Group();
    const bodyG = new THREE.Group(); g.add(bodyG); g.userData.body = bodyG;
    const mDeep = MC('#25384A', { glow: .12 });
    const b = mesh(new THREE.SphereGeometry(1.5, 9, 7), mDeep, 0, 1.5, 0); b.scale.set(1.25, 1, .95); bodyG.add(b);
    bodyG.add(box(2.2, .5, 1.6, MC('#8FCABB', { glow: .1 }), .4, .35, 0));
    for (let i = 0; i < 5; i++) bodyG.add(cone(.12, .5, 4, mats.snow, -.6 + i * .45, .6, .75));
    for (let i = 0; i < 5; i++) bodyG.add(cone(.12, .5, 4, mats.snow, -.6 + i * .45, .6, -.75));
    bodyG.add(mesh(new THREE.SphereGeometry(.2, 6, 5), MC('#F6C95C', { glow: 1.4 }), .8, 2.2, .8));
    const stalk = cyl(.04, .04, 1.4, 4, mDeep, .2, 2.4, 0); stalk.rotation.z = -.5; bodyG.add(stalk);
    const lure = mesh(new THREE.SphereGeometry(.22, 6, 5), MC('#B9F0FF', { glow: 1.6 }), .85, 3.1, 0); bodyG.add(lure);
    const gw = glow('#B9F0FF', 4, .3, .9, true); gw.position.set(.85, 3.1, 0); g.add(gw);
    const fin = cone(.5, 1.1, 4, mDeep, -1.6, 1.7, 0); fin.rotation.z = 1.2; bodyG.add(fin);
    return g;
  }
  const g = enemyArt('wasp'); // the Broodmother
  g.scale.setScalar(2.1);
  g.userData.body.add(cyl(.22, .3, .26, 6, mGold, .45, .38, 0));
  return g;
}
/* ---------- battlefield & mining props ---------- */
export function craterArt(s = 1) {
  const g = new THREE.Group();
  const rim = mesh(new THREE.TorusGeometry(1 * s, .25 * s, 5, 12), mats.path, 0, .05, 0); rim.rotation.x = -Math.PI / 2; g.add(rim);
  const hole = cyl(.9 * s, .9 * s, .06, 12, mats.dark, 0, 0, 0); hole.castShadow = false; g.add(hole);
  return g;
}
export function wireArt(len = 3) {
  const g = new THREE.Group();
  for (let i = 0; i <= len; i += 1.5) {
    const p1 = box(.08, .9, .08, mats.trunk, 0, 0, i); p1.rotation.x = .3; g.add(p1);
    const p2 = box(.08, .9, .08, mats.trunk, 0, 0, i); p2.rotation.x = -.3; g.add(p2);
  }
  const w = cyl(.025, .025, len + .6, 4, mats.dark, 0, .62, len / 2); w.rotation.x = Math.PI / 2; g.add(w);
  return g;
}
export function deadTreeArt(s = 1) {
  const g = new THREE.Group();
  g.add(cyl(.12 * s, .2 * s, 1.8 * s, 5, mats.trunk));
  const b1 = cyl(.06 * s, .09 * s, .9 * s, 4, mats.trunk, .25 * s, 1.5 * s, 0); b1.rotation.z = -.7; g.add(b1);
  const b2 = cyl(.05 * s, .08 * s, .7 * s, 4, mats.trunk, -.2 * s, 1.2 * s, .1 * s); b2.rotation.z = .8; g.add(b2);
  return g;
}
export function bunkerArt() {
  const g = new THREE.Group();
  g.add(box(2.6, 1.3, 2, mats.stoneDk));
  g.add(box(2.8, .3, 2.2, mats.dark, 0, 1.3, 0));
  g.add(box(1.4, .3, .12, mats.dark, 0, .75, 1.02));
  return g;
}
export function nuggetArt(s = 1) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.IcosahedronGeometry(.3 * s, 0), mGold, 0, .18 * s, 0));
  g.add(mesh(new THREE.IcosahedronGeometry(.18 * s, 0), mGold, .4 * s, .1 * s, .2 * s));
  return g;
}
export function palmArt(s = 1) {
  const g = new THREE.Group();
  const t = cyl(.12 * s, .18 * s, 2.4 * s, 5, mats.trunk); t.rotation.z = .15; g.add(t);
  for (let i = 0; i < 5; i++) {
    const th = i / 5 * Math.PI * 2;
    const leaf = cone(.35 * s, 1.4 * s, 4, mats.pine, Math.cos(th) * .55 * s, 2.3 * s, Math.sin(th) * .55 * s);
    leaf.rotation.z = Math.cos(th) * 1.25; leaf.rotation.x = -Math.sin(th) * 1.25; g.add(leaf);
  }
  return g;
}
export function cactusArt(s = 1) {
  const g = new THREE.Group();
  const m = MC('#4E8A3E', { glow: .12 });
  g.add(cyl(.22 * s, .26 * s, 1.6 * s, 6, m));
  g.add(cyl(.12 * s, .14 * s, .7 * s, 5, m, .35 * s, .6 * s, 0));
  g.add(cyl(.12 * s, .14 * s, .5 * s, 5, m, -.32 * s, .8 * s, 0));
  return g;
}
export function lavaPoolArt(r = 2) {
  const g = new THREE.Group();
  const p = cyl(r, r, .06, 14, lavaMat); p.castShadow = false; g.add(p);
  const gw = glow('#FF6A3D', r * 2.4, .35, .9, true); gw.position.y = .4; g.add(gw);
  return g;
}
export function floatRockArt(s = 1) {
  const g = new THREE.Group();
  const r = mesh(new THREE.IcosahedronGeometry(.9 * s, 0), mats.stoneDk, 0, 0, 0); r.scale.y = .7; g.add(r);
  const ph = Math.random() * 9;
  ANIMS.push((t) => { if (!g.parent) return; g.position.y = 2.2 + Math.sin(t * .7 + ph) * .5; g.rotation.y = t * .1 + ph; });
  return g;
}
export function volcanoArt(s = 1) {
  const g = new THREE.Group();
  g.add(cone(4 * s, 6.5 * s, 6, mats.dark));
  const lip = cyl(1.2 * s, 1.5 * s, .6 * s, 6, lavaMat, 0, 6 * s, 0); lip.castShadow = false; g.add(lip);
  const gw = glow('#FF6A3D', 7 * s, .5, 1, true); gw.position.y = 6.6 * s; g.add(gw);
  return g;
}

export function weatherSnow(group, sc = 1) { // it never stops snowing here
  for (let i = 0; i < 26; i++) {
    const f = glow('#FFFFFF', .45 + Math.random() * .3, .55, .75);
    group.add(f);
    const cx = 25 + (Math.random() - .5) * 40 * sc, cz = 25 + (Math.random() - .5) * 40 * sc;
    const off = Math.random() * 12, sp = .9 + Math.random() * .8, dr = Math.random() * 9;
    ANIMS.push((t) => {
      if (!f.parent) return;
      f.position.set(cx + Math.sin(t * .7 + dr) * 2.5, 11 - ((t * sp + off) % 11), cz + Math.cos(t * .5 + dr) * 2);
    });
  }
}
export function birdsOver(group, sc = 1) { // a far flock, wheeling over the island
  for (let k = 0; k < 2; k++) {
    const flock = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const b = mesh(new THREE.ConeGeometry(.12, .5, 3), mWhite, i * .8 - .8, (i % 2) * .3, (i % 2) * .6, false);
      b.rotation.x = Math.PI / 2; flock.add(b);
    }
    group.add(flock);
    const ph = k * Math.PI, r1 = (14 + k * 6) * sc, sp = .07 + k * .02;
    ANIMS.push((t) => {
      if (!flock.parent) return;
      const a = t * sp + ph;
      flock.position.set(25 + Math.cos(a) * r1, 8.5 + Math.sin(t * .9 + ph) * .7, 25 + Math.sin(a) * r1 * .8);
      flock.rotation.y = -a - Math.PI / 2;
    });
  }
}
export function hillArt(r = 3, h = 1.2, pal = null) {
  const m = TERRA[pal] ? TERRA[pal].grassLt : mats.grassLt;
  const dome = mesh(new THREE.SphereGeometry(r, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2), m);
  dome.scale.y = h / r; dome.castShadow = false;
  const g = new THREE.Group(); g.add(dome); return g;
}
/* ---------- the moon and the deep ---------- */
export function spireArt(s = 1) {
  const g = new THREE.Group();
  g.add(cone(.7 * s, 4.5 * s, 5, mats.stoneDk));
  g.add(cone(.4 * s, 2.2 * s, 5, mats.stone, 1 * s, 0, .4 * s));
  return g;
}
export function earthArt() { // home, hanging in the black
  const g = new THREE.Group();
  const e = mesh(new THREE.SphereGeometry(3.4, 12, 10), MC('#4A90D9', { glow: .55 }), 0, 0, 0, false);
  g.add(e);
  for (const [x, y, z, s] of [[1, .9, 2.6, 1], [-1.5, -.4, 2.7, .75], [.3, -1.7, 2.6, .6]])
    g.add(mesh(new THREE.SphereGeometry(.95 * s, 7, 6), MC('#7BC47F', { glow: .35 }), x, y, z, false));
  const halo = glow('#9CC8FF', 12, .5, .9); g.add(halo);
  return g;
}
export function coralArt(s = 1) {
  const g = new THREE.Group();
  const m1 = MC('#E87A9C', { glow: .35 }), m2 = MC('#F0A45C', { glow: .3 });
  g.add(cone(.3 * s, 1.4 * s, 5, m1, 0, 0, 0));
  g.add(cone(.22 * s, 1 * s, 5, m2, .5 * s, 0, .3 * s));
  g.add(cone(.25 * s, 1.2 * s, 5, m1, -.45 * s, 0, .25 * s));
  g.add(mesh(new THREE.IcosahedronGeometry(.4 * s, 0), m2, .1 * s, .2 * s, -.5 * s));
  const gw = glow('#F0A45C', 2 * s, .15, .6); gw.position.y = .8 * s; g.add(gw);
  return g;
}
export function kelpArt(s = 1) {
  const g = new THREE.Group();
  const stalks = [];
  for (const [x, z, h] of [[0, 0, 3.4], [.5, .3, 2.6], [-.4, .2, 2.9]]) {
    const k = cyl(.07 * s, .1 * s, h * s, 4, MC('#4E9A5E', { glow: .2 }), x * s, 0, z * s);
    g.add(k); stalks.push([k, h]);
  }
  const ph = Math.random() * 9;
  ANIMS.push((t) => {
    if (!g.parent) return;
    stalks.forEach(([k, h], i) => { k.rotation.z = Math.sin(t * 1.1 + ph + i) * .16; k.rotation.x = Math.cos(t * .9 + ph + i) * .12; });
  });
  return g;
}
export function bubblesAt(group, u, v, color = '#BFEAF5') { // a slow column of light rising
  for (let i = 0; i < 3; i++) {
    const b = glow(color, .9 + Math.random() * .6, .3, .7);
    group.add(b);
    const off = Math.random() * 10, sp = .8 + Math.random() * .7;
    ANIMS.push((t) => {
      if (!b.parent) return;
      b.position.set(u + Math.sin(t * .8 + off) * .5, ((t * sp + off) % 11), v + Math.cos(t * .7 + off) * .5);
    });
  }
}

/* ---------- fx meshes ---------- */
export function arrowMesh() {
  const g = new THREE.Group();
  const shaft = cyl(.035, .035, .85, 4, new THREE.MeshBasicMaterial({ color: '#F2E6C9' }));
  shaft.position.y = 0; shaft.rotation.x = Math.PI / 2; g.add(shaft);
  const tip = cone(.07, .2, 4, mSteel); tip.position.set(0, 0, .5); tip.rotation.x = Math.PI / 2; g.add(tip);
  return g;
}
export function coinMesh() {
  const c = cyl(.2, .2, .07, 10, mGold);
  c.castShadow = false;
  return c;
}
export function poofMesh() {
  const m = new THREE.MeshBasicMaterial({ color: '#F6F2E8', transparent: true, opacity: .9, side: THREE.DoubleSide });
  const r = mesh(new THREE.TorusGeometry(.5, .06, 5, 20), m, 0, 0, 0, false);
  r.rotation.x = -Math.PI / 2;
  return r;
}
export function ringMesh(radius, color, opacity) {
  const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide });
  const r = mesh(new THREE.TorusGeometry(radius, .07, 5, 48), m, 0, 0, 0, false);
  r.rotation.x = -Math.PI / 2;
  return r;
}
export function slotMarker(cost) {
  const g = new THREE.Group();
  const ring = ringMesh(1.25, CONST.gold, .85); ring.position.y = .1; g.add(ring);
  g.userData.ring = ring;
  const ph = Math.random() * 9;
  ANIMS.push((t) => { if (!g.visible) return;
    ring.material.opacity = .6 + Math.sin(t * 3 + ph) * .25;
    ring.scale.setScalar(1 + Math.sin(t * 3 + ph) * .05); });
  for (let i = 0; i < cost; i++)
    g.add(cyl(.16, .16, .06, 8, mGold, (i - (cost - 1) / 2) * .45, .1, 1.7));
  return g;
}
export function hitCylinder(r, h) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  m.castShadow = false; m.position.y = h / 2;
  return m;
}
/* visible reward for castle tiers */
export function castleTrim(lvl) {
  const g = new THREE.Group();
  if (lvl === 2) {
    g.add(box(2.3, .28, 2.3, mGold, 0, 9.05, 0));
    g.add(box(4.3, .3, 4.3, mGold, 0, 5.5, 0));
  } else if (lvl === 3) {
    for (const [x, z] of [[-2.35, -2.35], [2.35, -2.35], [-2.35, 2.35], [2.35, 2.35]])
      g.add(cone(.35, .8, 7, mGold, x, 6.9, z));
    const f = flag(CONST.threat, 1.1); f.position.set(1.2, 12.2, 0); g.add(f);
  } else { // Lv 4 — the Royal Bastion
    g.add(cone(1.95, 1.2, 8, mGold, 0, 12.1, 0));
    for (const [x, z] of [[-2.35, 0], [2.35, 0], [0, -2.35], [0, 2.35]]) {
      const f = flag(CONST.gold, .8); f.position.set(x, 6.6, z); g.add(f);
    }
  }
  return g;
}
export { mats };
