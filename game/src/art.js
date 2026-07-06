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
function coastShape(grow) {
  const pts = [];
  for (let i = 0; i < 72; i++) {
    const th = i / 72 * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
    const base = 24 / Math.pow(Math.max(Math.abs(c), Math.abs(s)), 0.72);
    const wob = Math.sin(th * 3 + 1.7) * 1.1 + Math.sin(th * 5 + .4) * .7 + Math.sin(th * 8 + 2.9) * .45;
    const r = base + wob + grow;
    pts.push(new THREE.Vector2(25 + r * c, -(25 + r * s)));
  }
  return new THREE.Shape(pts);
}
function blob(grow, depth, mat, topY) {
  const geo = new THREE.ExtrudeGeometry(coastShape(grow), { depth, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, topY - depth, 0);
  const o = new THREE.Mesh(geo, mat);
  o.receiveShadow = true; o.castShadow = false;
  return o;
}
export function buildTerrain(scene, LANE_A_PTS, LANE_B_PTS) {
  const sea = mesh(new THREE.PlaneGeometry(500, 500), mats.water, 25, 0, 25, false);
  sea.rotation.x = -Math.PI / 2; sea.position.y = -.55; scene.add(sea);
  const shallow = blob(3.4, .1, new THREE.MeshStandardMaterial({ color: '#9AD4EA', transparent: true, opacity: .45, roughness: .5 }), -.42);
  REG.push({ m: shallow.material, d: new THREE.Color('#9AD4EA'), n: new THREE.Color('#3C5D88') });
  scene.add(shallow);
  scene.add(blob(1.1, .6, mats.sand, -.06));
  scene.add(blob(0, 2.6, mats.grass, 0));
  /* meadow patches */
  for (const [u, v, r] of [[14,20,3],[33,36,4],[24,10,2.5],[40,20,3],[10,37,2.6]]) {
    const p = cyl(r, r, .04, 24, mats.grassLt, u, .02, v); p.castShadow = false; scene.add(p);
  }
  /* lanes as rounded plates */
  const plate = (u, v, r, m, y) => { const p = cyl(r, r, .05, 14, m, u, y, v); p.castShadow = false; scene.add(p); };
  for (const pts of [LANE_A_PTS, LANE_B_PTS]) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [au, av] = pts[i], [bu, bv] = pts[i + 1];
      const n = Math.ceil(Math.hypot(bu - au, bv - av) / .9);
      for (let j = 0; j <= n; j++) {
        const u = au + (bu - au) * j / n, v = av + (bv - av) * j / n;
        plate(u, v, 1.55, mats.sand, .035); plate(u, v, 1.15, mats.path, .06);
      }
    }
  }
  plate(25, 27.4, 3.1, mats.sand, .035); plate(25, 27.4, 2.55, mats.path, .06);
  /* pond */
  plate(43, 37, 4.3, mats.sand, .03);
  const pond = cyl(3.9, 3.9, .05, 24, mats.waterLt, 43, .05, 37); pond.castShadow = false; scene.add(pond);
  /* flowers */
  for (const [u, v] of [[12,18],[18,13.5],[30,10],[37,15],[40,28],[35,41],[24,40],[13,38],[8,30],[28,36.5],[20,19],[31,31.5]]) {
    scene.add(cyl(.09, .09, .3, 5, mWhite, u, 0, v));
    scene.add(cyl(.08, .08, .24, 5, mGold, u + .5, 0, v - .3));
  }
  /* fireflies — drift over the meadows, night only */
  let seed = 9;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 14; i++) {
    const u = 7 + rnd() * 36, v = 7 + rnd() * 36, ph = rnd() * 9, sp = .6 + rnd();
    const s = glow('#FFD97A', .8 + rnd() * .5, 0, .8, true);
    scene.add(s);
    ANIMS.push((t) => {
      s.position.set(u + Math.sin(t * sp * .5 + ph) * 2.2, 1 + Math.sin(t * sp + ph * 2) * .5, v + Math.cos(t * sp * .4 + ph) * 2.2);
    });
  }
  return { sea };
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
export function houseArt(upg) {
  const g = new THREE.Group(); const hh = upg ? 2.3 : 1.7;
  g.add(box(2.7, hh, 2, mats.cream));
  g.add(prismRoof(2.1, 1.6, 1.5, mats.roof, 0, hh, 0));
  g.add(box(.6, .95, .12, mats.dark, .3, 0, 1.02));
  g.add(box(.55, .55, .1, windowMat(), -.7, hh - 1, 1.02));
  const gw = glow('#FFD97A', 1.9, 0, .45); gw.position.set(-.7, hh - .75, 1.2); g.add(gw);
  if (upg) { const f = flag(CONST.gold, .9); f.position.set(-.9, hh + .6, -.5); g.add(f); }
  return g;
}
export function millArt() {
  const g = new THREE.Group();
  g.add(box(2.1, 2.7, 2.1, mats.cream));
  g.add(prismRoof(1.7, 1.7, 1.6, mats.roof, 0, 2.7, 0));
  g.add(box(.55, .85, .12, mats.dark, 0, 0, 1.07));
  const hub = new THREE.Group(); hub.position.set(0, 2.5, 1.18); g.add(hub);
  for (let i = 0; i < 4; i++) {
    const b = box(.34, 1.5, .06, mWhite, 0, .45, 0);
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
export function mineArt() {
  const g = new THREE.Group();
  g.add(cone(1.9, 2.3, 5, mats.stoneDk));
  g.add(box(.8, 1, .14, mats.dark, 0, 0, 1.15));
  g.add(mesh(new THREE.IcosahedronGeometry(.28, 0), mGold, 1.1, .18, 1.2));
  g.add(mesh(new THREE.IcosahedronGeometry(.2, 0), mGold, -1.15, .14, 1));
  return g;
}
export function harbourArt(upg) {
  const g = new THREE.Group();
  g.add(box(1.8, 1.5, 1.9, mats.cream, -.9, 0, 0));
  g.add(prismRoof(1.5, 1.6, 1.2, mats.roof, -.9, 1.5, 0));
  g.add(box(2.6, .3, 1, mats.wood, 1.1, .15, .2));
  g.add(box(.5, .5, .1, windowMat(), -.9, .6, .98));
  if (upg) g.add(box(1.4, .3, .9, mats.wood, 1.4, .15, -1));
  const b = boat(); b.scale.setScalar(.75); b.position.set(1.9, .3, .9); g.add(b);
  return g;
}
export function towerArt(upg) {
  const g = new THREE.Group(); const tall = upg === 'sniper' ? 1.3 : 0;
  g.add(cyl(.8, .92, 3.6 + tall, 8, mats.stone));
  if (upg === 'archer') g.add(cyl(.95, .95, .35, 8, mGold, 0, 2.1, 0));
  g.add(cyl(1.05, 1.05, .4, 8, mats.stoneDk, 0, 3.6 + tall, 0));
  g.add(cone(1.12, 1.8, 8, mats.roofB, 0, 4 + tall, 0));
  g.add(box(.3, .8, .1, windowMat(), 0, 2.2 + tall, .88));
  const gw = glow('#FFD97A', 2.2, 0, .5); gw.position.set(0, 2.6 + tall, 1.05); g.add(gw);
  if (upg === 'sniper') { const f = flag('#5FA8C9', .8); f.position.y = 5.6 + tall; g.add(f); }
  g.userData.z = 4 + tall; // arrow launch height
  return g;
}
export function barracksArt() {
  const g = new THREE.Group();
  g.add(box(3.2, 1.9, 2.2, mats.wood));
  g.add(prismRoof(2.5, 1.8, 1.4, mats.roof, 0, 1.9, 0));
  g.add(box(.75, 1.1, .12, mats.dark, 0, 0, 1.12));
  const f = flag(CONST.threat, .95); f.position.set(1.3, 2.6, -.7); g.add(f);
  return g;
}
export function rangeArt() {
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
  return g;
}
export const BUILD_ART = { house: houseArt, mill: millArt, field: fieldArt, mine: mineArt,
  harbour: harbourArt, tower: towerArt, barracks: barracksArt, range: rangeArt };

/* ---------- characters ---------- */
export function kingArt() {
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
  body.add(box(.5, .18, .4, mThreat, 0, 1.12, 0));                  // saddle
  const k = new THREE.Group(); k.position.set(0, 1.28, 0); body.add(k);
  k.add(mesh(new THREE.CapsuleGeometry(.22, .4, 3, 8), mThreat, 0, .4, 0));
  k.add(mesh(new THREE.SphereGeometry(.2, 8, 7), mSkin, 0, .92, 0));
  k.add(cyl(.14, .17, .16, 6, mGold, 0, 1.05, 0));
  const spear = new THREE.Group(); spear.position.set(.3, .62, 0); spear.rotation.z = -.9; k.add(spear);
  spear.add(cyl(.03, .03, 1.5, 5, mMane));
  spear.add(cone(.08, .26, 5, mSteel, 0, .75, 0));
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
export function enemyArt(type) {
  const g = new THREE.Group();
  const bodyG = new THREE.Group(); g.add(bodyG); g.userData.body = bodyG;
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
  } else {
    for (const [x, z] of [[-2.35, -2.35], [2.35, -2.35], [-2.35, 2.35], [2.35, 2.35]])
      g.add(cone(.35, .8, 7, mGold, x, 6.9, z));
    const f = flag(CONST.threat, 1.1); f.position.set(1.2, 12.2, 0); g.add(f);
  }
  return g;
}
export { mats };
