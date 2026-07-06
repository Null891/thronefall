/* main.js — Thronefall Web Remake: engine, simulation, HUD.
   World units: 1u = 1m-ish; map coords match the design doc (u = x, v = z, castle at 25,24). */
'use strict';
import * as THREE from 'three';
import * as ART from './art.js';
import { AUDIO, sfx } from './audio.js';

const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];

/* ============================== renderer & scene ============================== */
const canvas = $('#gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(32, innerWidth / innerHeight, 1, 400);

function resize() {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize); resize();

/* ============================== lighting & day/night ============================== */
const sun = new THREE.DirectionalLight('#FFE7C0', 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -36, right: 36, top: 36, bottom: -36, near: 5, far: 160 });
sun.shadow.bias = -0.0006;
sun.target.position.set(25, 0, 25);
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight('#BFE0FF', '#86A96F', .8);
scene.add(hemi);
scene.fog = new THREE.Fog('#A5D8EA', 70, 220);
scene.background = new THREE.Color('#A5D8EA');

const DAY = { sunPos: new THREE.Vector3(58, 62, 38), sunCol: new THREE.Color('#FFE7C0'), sunInt: 2.6,
  hemiSky: new THREE.Color('#BFE0FF'), hemiGnd: new THREE.Color('#86A96F'), hemiInt: .8,
  bg: new THREE.Color('#A5D8EA'), exp: 1.12, torch: 0 };
const NIGHT = { sunPos: new THREE.Vector3(2, 46, -8), sunCol: new THREE.Color('#8FB0E8'), sunInt: .38,
  hemiSky: new THREE.Color('#16223E'), hemiGnd: new THREE.Color('#0C1016'), hemiInt: .55,
  bg: new THREE.Color('#0D1526'), exp: .82, torch: 2.4 };
const phase = { t: 0, target: 0 };
const torchLights = [];
function addTorch(pos) {
  const l = new THREE.PointLight('#FFB35C', 0, 10, 1.8);
  l.position.copy(pos); scene.add(l); torchLights.push(l);
}
function applyPhase() {
  const t = phase.t, L = (a, b) => a + (b - a) * t;
  sun.position.lerpVectors(DAY.sunPos, NIGHT.sunPos, t).add(new THREE.Vector3(25, 0, 25));
  sun.color.lerpColors(DAY.sunCol, NIGHT.sunCol, t);
  sun.intensity = L(DAY.sunInt, NIGHT.sunInt);
  hemi.color.lerpColors(DAY.hemiSky, NIGHT.hemiSky, t);
  hemi.groundColor.lerpColors(DAY.hemiGnd, NIGHT.hemiGnd, t);
  hemi.intensity = L(DAY.hemiInt, NIGHT.hemiInt);
  scene.background.lerpColors(DAY.bg, NIGHT.bg, t);
  scene.fog.color.copy(scene.background);
  renderer.toneMappingExposure = L(DAY.exp, NIGHT.exp);
  for (const l of torchLights) l.intensity = L(DAY.torch, NIGHT.torch) * (0.9 + Math.sin(perf * 7 + l.position.x) * .12);
  ART.setPhase(t, perf);
  AUDIO.setPhase(t);
}

/* ============================== static world ============================== */
const LANE_A_PTS = [[0,25.5],[7,25.2],[14,25],[19.5,25],[21.7,25]];
const LANE_B_PTS = [[50,25.5],[42,25.2],[36,25],[29.6,25],[28.3,25]];
ART.buildTerrain(scene, LANE_A_PTS, LANE_B_PTS);

function place(obj, u, v, ry = 0, s = 1) { obj.position.set(u, 0, v); obj.rotation.y = ry; obj.scale.setScalar(s); scene.add(obj); return obj; }
for (const [u, v, s] of [[6,9,1],[5,15,.8],[5,31,.9],[7.5,39,.7],[12,4.5,.9],[23,3.5,1.25],[34,4,.85],[42,6.5,.95],[45.5,11,.7]])
  place(ART.mountain(), u, v, Math.random() * 6, s);
for (const [u, v, s] of [[9,12,.9],[7,28.5,.8],[11,33,1],[9,44,.85],[16,7,1],[28,5,.8],[40,7,1],[45,13,.9],[44,19,.75],[14,42,1],[33,45,.9],[45,44,.8],[21,44,.7],[36,30,.7]])
  place(ART.treePine(s), u, v, Math.random() * 6);
for (const [u, v, s] of [[26,6.5,.9],[41.5,33,.85],[11,36.5,.8],[33,42.5,.75],[43,23,.7]])
  place(ART.treeRound(s), u, v, Math.random() * 6);
for (const [u, v, s] of [[12,21.5,.9],[31,16.5,1],[39.5,23,.8],[20,35,.9],[28,43,.8],[9,31,.7]])
  place(ART.bush(s), u, v, Math.random() * 6);
place(ART.rock(1), 6.5, 19.5); place(ART.rock(.7), 37.5, 38.5);
place(ART.wallRun(3.6), 15.1, 18.6); place(ART.wallRun(3.6), 15.1, 27.8);
place(ART.wallRun(3.6), 35.1, 18.6); place(ART.wallRun(3.6), 35.1, 27.8);
for (const [u, v] of [[15.1,23],[15.1,27],[35.1,23],[35.1,27]]) {
  const g = place(ART.gateTower(), u, v);
  addTorch(g.userData.torch.clone().add(g.position));
}
place(ART.spawnFlagArt(), 2, 25); place(ART.spawnFlagArt(), 48, 25);
place(ART.boat(), 43.5, 37.5, .6);
const castle = place(ART.castleArt(), 25, 24);
for (const p of castle.userData.torches) addTorch(p.clone().add(castle.position));

/* ============================== game state (exact ECS numbers) ============================== */
const S = { view: 'menu', phaseName: 'day', day: 1, gold: 8, castleHP: 15, castleMax: 15, castleLvl: 1,
  builds: {}, settings: { dmg: true, ranges: true, shake: true, music: true, sound: true }, stance: 'hold' };
try { Object.assign(S.settings, JSON.parse(localStorage.tf_set || '{}')); } catch { /* fresh device */ }
function saveSet() { try { localStorage.tf_set = JSON.stringify(S.settings); } catch { /* private mode */ } }
AUDIO.setEnabled(S.settings.music, S.settings.sound);
AUDIO.arm();
const BTYPES = {
  house:    { name: 'House',           cost: 2, icon: '🏠', desc: '+1 gold at dawn' },
  mill:     { name: 'Windmill',        cost: 3, icon: '🌀', desc: '+1 gold · unlocks Fields' },
  field:    { name: 'Field',           cost: 1, icon: '🌾', desc: '+1 gold at dawn' },
  mine:     { name: 'Gold Mine',       cost: 5, icon: '⛏', desc: 'Pays 6 gold, −1 each night' },
  harbour:  { name: 'Fishing Harbour', cost: 3, icon: '⛵', desc: '+1 boat a night · boats pay 1' },
  tower:    { name: 'Arrow Tower',     cost: 3, icon: '🗼', desc: 'Fires on the horde' },
  barracks: { name: 'Barracks',        cost: 4, icon: '🛡', desc: 'Trains 4 soldiers' },
  range:    { name: 'Archery Range',   cost: 4, icon: '🏹', desc: 'Trains 3 archers' },
};
const SLOTS = [
  { id: 's1', u: 18,   v: 21,   type: 'range' },   { id: 's2', u: 18,   v: 29,   type: 'tower' },
  { id: 's3', u: 32,   v: 21,   type: 'tower' },   { id: 's4', u: 32,   v: 29,   type: 'barracks' },
  { id: 's5', u: 22,   v: 31.5, type: 'house' },   { id: 's6', u: 26.5, v: 31.5, type: 'house' },
  { id: 's9', u: 30.5, v: 33.5, type: 'house' },   { id: 's7', u: 17,   v: 35,   type: 'mill' },
  { id: 's8', u: 38.5, v: 34.5, type: 'harbour' }, { id: 's10', u: 7.5, v: 21,   type: 'mine' },
  { id: 'f1', u: 14,   v: 33.5, type: 'field', hidden: true }, { id: 'f2', u: 16.5, v: 38, type: 'field', hidden: true },
  /* the kingdom grows: outskirt plots surveyed as the days pass */
  { id: 'x1', u: 33.5, v: 36.5, type: 'house',    hidden: true, unlockDay: 2 },
  { id: 'x2', u: 10.5, v: 22.7, type: 'tower',    hidden: true, unlockDay: 3 },
  { id: 'x3', u: 39.5, v: 27.5, type: 'tower',    hidden: true, unlockDay: 3 },
  { id: 'x4', u: 26,   v: 17.5, type: 'barracks', hidden: true, unlockDay: 4 },
  { id: 'x5', u: 19.5, v: 39.5, type: 'house',    hidden: true, unlockDay: 4 },
  { id: 'x6', u: 44.5, v: 28,   type: 'mine',     hidden: true, unlockDay: 5 },
];
const hitMeshes = [];
for (const sl of SLOTS) {
  sl.marker = place(ART.slotMarker(BTYPES[sl.type].cost), sl.u, sl.v);
  const hit = ART.hitCylinder(1.7, 3);
  hit.position.set(sl.u, 1.5, sl.v); hit.userData.slot = sl;
  scene.add(hit); hitMeshes.push(hit);
  sl.holder = new THREE.Group(); sl.holder.position.set(sl.u, 0, sl.v); scene.add(sl.holder);
  sl.pop = 0;
}
const CASTLE_SLOT = { castle: true, u: 25, v: 26.5 };
{
  const hit = ART.hitCylinder(4, 12);
  hit.position.set(25, 0, 24); hit.userData.slot = CASTLE_SLOT;
  scene.add(hit); hitMeshes.push(hit);
}
function revealPlots(quiet) {
  let fresh = 0;
  for (const sl of SLOTS)
    if (sl.unlockDay && sl.hidden && S.day >= sl.unlockDay) { sl.hidden = false; fresh++; }
  if (fresh && !quiet) flashHint(`Surveyors opened ${fresh} new plot${fresh > 1 ? 's' : ''} on the outskirts`);
  refreshMarkers();
}
function refreshMarkers() {
  for (const sl of SLOTS) sl.marker.visible = !sl.hidden && !S.builds[sl.id] && S.view === 'game' && S.phaseName === 'day';
}
function renderBuild(sl) {
  sl.holder.clear();
  const b = S.builds[sl.id];
  if (b) { sl.holder.add(ART.BUILD_ART[b.type](b.upg)); sl.pop = 1; sl.holder.scale.setScalar(.2); }
}

/* ============================== economy ============================== */
function dawnRows() {
  const rows = [{ l: 'Castle stipend', n: 1 }];
  let houses = 0, fields = 0, mills = 0;
  for (const id in S.builds) {
    const b = S.builds[id];
    if (b.type === 'house') houses += b.upg ? 2 : 1;
    else if (b.type === 'field') fields += 1;
    else if (b.type === 'mill') mills += 1;
    else if (b.type === 'mine') rows.push({ l: 'Gold Mine (decaying)', n: Math.max(0, 6 - b.age) });
    else if (b.type === 'harbour') { const nb = Math.min(5, b.boats + 1); rows.push({ l: `Harbour (${nb} boat${nb > 1 ? 's' : ''})`, n: nb * (b.upg ? 2 : 1) }); }
  }
  if (houses) rows.splice(1, 0, { l: 'Houses', n: houses });
  if (mills) rows.push({ l: 'Windmill', n: mills });
  if (fields) rows.push({ l: 'Fields', n: fields });
  return { rows, total: rows.reduce((a, r) => a + r.n, 0) };
}
function applyDawn() {
  for (const id in S.builds) {
    const b = S.builds[id];
    if (b.type === 'mine') b.age++;
    if (b.type === 'harbour') b.boats = Math.min(5, b.boats + 1);
  }
}

/* ============================== HUD ============================== */
function makeDots(sel) { const d = $(sel); d.innerHTML = ''; for (let i = 0; i < 10; i++) { const s = document.createElement('span'); s.className = 'dot'; d.appendChild(s); } }
makeDots('#clockDay'); makeDots('#clockNight');
function setClock(sel, frac) { $$(sel + ' .dot').forEach((d, i) => d.classList.toggle('f', i < Math.round(frac * 10))); }
function refreshDayHUD() {
  $('#goldNum').textContent = S.gold;
  $('#incomeNum').textContent = '+' + dawnRows().total + ' at dawn';
  $('#dayNum').textContent = `Day ${S.day}`;
  refreshMarkers();
}
let hintT = null;
const HINT0 = 'Ride with WASD · E builds & upgrades · Space begins the night';
function flashHint(t) { const el = $('#dayHint'); el.textContent = t; clearTimeout(hintT); hintT = setTimeout(() => { el.textContent = HINT0; }, 2600); }
function flashBanner(txt) {
  const t = $('#waveTitle'), old = 'NIGHT ' + S.day;
  t.textContent = txt; t.style.color = '#F6C95C';
  setTimeout(() => { t.textContent = old; t.style.color = ''; }, 2400);
}

/* world → screen for DOM anchoring */
const _v = new THREE.Vector3();
function proj(x, y, z) {
  _v.set(x, y, z).project(camera);
  return { x: (_v.x * .5 + .5) * innerWidth, y: (-_v.y * .5 + .5) * innerHeight, ok: _v.z < 1 };
}
function anchor(el, x, y, z) {
  const p = proj(x, y, z);
  el.style.display = p.ok ? '' : 'none';
  el.style.left = p.x.toFixed(1) + 'px'; el.style.top = p.y.toFixed(1) + 'px';
}

/* ============================== lanes / enemies ============================== */
function sampleLane(pts) {
  const cum = [0]; let tot = 0;
  for (let i = 1; i < pts.length; i++) { tot += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); cum.push(tot); }
  return { total: tot, at(d) {
    d = Math.max(0, Math.min(d, tot));
    let i = 1; while (i < cum.length - 1 && cum[i] < d) i++;
    const t = (d - cum[i - 1]) / (cum[i] - cum[i - 1]);
    return { u: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, v: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t };
  } };
}
const LANE_A = sampleLane(LANE_A_PTS), LANE_B = sampleLane(LANE_B_PTS);
const ETYPES = {
  slime:   { hp: 2,  speed: 1.5, dmg: 1, rate: 1.4 },
  barrel:  { hp: 5,  speed: 1.0, dmg: 2, rate: 1.6 },
  wasp:    { hp: 2,  speed: 2.6, dmg: 1, rate: 1.1, fly: true },
  runner:  { hp: 1,  speed: 3.4, dmg: 1, rate: 1.2 },
  spitter: { hp: 3,  speed: 1.1, dmg: 1, rate: 2.0, ranged: 6 },
  ogre:    { hp: 18, speed: .7,  dmg: 3, rate: 1.8 },
};
/* endless campaign: nights 1–3 are authored, then the horde scales forever */
function nightPlan(n) {
  const q = []; const p = (type, lane) => q.push({ type, lane });
  if (n === 1) { for (let i = 0; i < 10; i++) p('slime', 'A'); return q; }
  if (n === 2) {
    for (let i = 0; i < 8; i++) p('slime', i % 2 ? 'B' : 'A');
    for (let i = 0; i < 4; i++) p('barrel', i % 2 ? 'A' : 'B');
    for (let i = 0; i < 3; i++) p('wasp', 'B');
    return q;
  }
  if (n === 3) {
    for (let i = 0; i < 10; i++) p('slime', i % 2 ? 'B' : 'A');
    for (let i = 0; i < 6; i++) p('barrel', i % 3 ? 'A' : 'B');
    for (let i = 0; i < 5; i++) p('wasp', i % 2 ? 'A' : 'B');
    p('ogre', 'A');
    return q;
  }
  const slimes = Math.min(24, 6 + 2 * n), barrels = Math.min(14, n),
    wasps = Math.min(10, n - 1), runners = Math.min(12, (n - 3) * 2),
    spitters = Math.min(6, n - 4), ogres = n % 3 === 0 ? Math.min(4, Math.floor(n / 3)) : 0;
  for (let i = 0; i < slimes; i++) p('slime', i % 2 ? 'B' : 'A');
  for (let i = 0; i < barrels; i++) p('barrel', i % 2 ? 'A' : 'B');
  for (let i = 0; i < runners; i++) p('runner', i % 2 ? 'B' : 'A');
  for (let i = 0; i < wasps; i++) p('wasp', i % 2 ? 'A' : 'B');
  for (let i = 0; i < spitters; i++) p('spitter', i % 2 ? 'B' : 'A');
  for (let i = 0; i < ogres; i++) p('ogre', i % 2 ? 'B' : 'A');
  return q;
}
function towerSpec(b) {
  if (b.upg === 'sniper') return { range: 13.5, rate: 1.2, dmg: 3 };
  if (b.upg === 'archer') return { range: 8.5, rate: .48, dmg: 2 };
  return { range: 8.5, rate: .95, dmg: 2 };
}

/* ============================== pools ============================== */
function pool(n, maker) {
  const items = [];
  for (let i = 0; i < n; i++) { const o = maker(); o.visible = false; scene.add(o); items.push(o); }
  return { take() { const o = items.find(x => !x.visible); if (o) o.visible = true; return o; }, all: items };
}
const arrowPool = pool(50, ART.arrowMesh), coinPool = pool(28, ART.coinMesh), poofPool = pool(14, ART.poofMesh);
function domPool(n, cls) {
  const layer = $('#floatLayer'), items = [];
  for (let i = 0; i < n; i++) { const el = document.createElement(cls === 'ehp' ? 'div' : 'span'); el.className = cls; if (cls === 'ehp') el.innerHTML = '<i></i>'; layer.appendChild(el); items.push(el); }
  return { take() { const el = items.find(x => x.style.visibility !== 'visible'); if (el) el.style.visibility = 'visible'; return el; }, release(el) { el.style.visibility = 'hidden'; }, all: items };
}
const dmgPool = domPool(50, 'dmgnum');
let fx = [];
function fxAdd(o) { fx.push(o); }
function dmgNum(x, y, z, n) {
  if (!S.settings.dmg) return;
  const el = dmgPool.take(); if (!el) return;
  el.textContent = '-' + n;
  fxAdd({ kind: 'dmg', el, x, y, z, t: 0, dur: .75 });
}
function poof(x, y, z, big) {
  const m = poofPool.take(); if (!m) return;
  m.position.set(x, y, z);
  fxAdd({ kind: 'poof', m, t: 0, dur: .42, big: !!big });
}
function arrow(from, to, arc, onHit, big) {
  const m = arrowPool.take(); if (!m) return;
  sfx.arrow();
  const dist = from.distanceTo(to);
  m.scale.setScalar(big ? 1.8 : 1);
  fxAdd({ kind: 'arrow', m, from: from.clone(), to: to.clone(), arc, t: 0, dur: Math.max(.12, dist / 26), hit: onHit });
}
function coinFly(x, y, z, delay) {
  const m = coinPool.take(); if (!m) return;
  m.position.set(x, y, z);
  fxAdd({ kind: 'coin', m, t: -delay, dur: 2.2, x, y, z,
    vx: (Math.random() - .5) * 5, vy: 5 + Math.random() * 3, vz: (Math.random() - .5) * 5 });
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
function updateFx(dt) {
  for (const f of fx) {
    f.t += dt; const k = Math.min(1, f.t / f.dur);
    if (f.t < 0) continue;
    if (f.kind === 'dmg') { const p = proj(f.x, f.y + k * 1.6, f.z); f.el.style.left = p.x + 'px'; f.el.style.top = p.y + 'px'; f.el.style.opacity = 1 - k; }
    if (f.kind === 'poof') { const s = .4 + (f.big ? 3.4 : 1.8) * k; f.m.scale.setScalar(s); f.m.material.opacity = .9 * (1 - k); }
    if (f.kind === 'die') { // squash into the ground, splaying wide
      f.mesh.scale.set(1 + k * .8, Math.max(.04, 1 - k * 1.05), 1 + k * .8);
      if (f.fly) f.mesh.position.y = -1.5 * k * k;
    }
    if (f.kind === 'arrow') {
      _a.lerpVectors(f.from, f.to, k); _a.y += f.arc * 4 * k * (1 - k);
      const k2 = Math.min(1, k + .04);
      _b.lerpVectors(f.from, f.to, k2); _b.y += f.arc * 4 * k2 * (1 - k2);
      f.m.position.copy(_a); f.m.lookAt(_b);
      if (k >= 1 && !f.done) { f.done = true; f.hit && f.hit(); }
    }
    if (f.kind === 'coin') {
      if (f.t < .55) { // scatter under gravity
        f.vy -= 22 * dt; f.x += f.vx * dt; f.y = Math.max(.15, f.y + f.vy * dt); f.z += f.vz * dt;
        if (f.y <= .16 && f.vy < 0) f.vy *= -.4;
      } else {         // vacuum to the king
        const sp = 26 * dt;
        _a.set(K.u, 1, K.v).sub(_b.set(f.x, f.y, f.z));
        const d = _a.length();
        if (d < .8) { f.t = f.dur; poof(f.x, f.y, f.z); sfx.coin(); }
        else { _a.normalize().multiplyScalar(Math.min(sp, d)); f.x += _a.x; f.y += _a.y; f.z += _a.z; }
      }
      f.m.position.set(f.x, f.y, f.z); f.m.rotation.y += 8 * dt;
    }
  }
  fx = fx.filter(f => {
    if (f.t >= f.dur) {
      if (f.el) dmgPool.release(f.el);
      if (f.m) f.m.visible = false;
      if (f.mesh) scene.remove(f.mesh);
      return false;
    } return true;
  });
}

/* ============================== the King ============================== */
const K = { u: 25, v: 29.5, hp: 20, max: 20, face: 0, atkCd: 0, mesh: ART.kingArt() };
scene.add(K.mesh);
const kingGlow = ART.glow('#FFC98A', 4.5, 0, .5);
kingGlow.position.set(0, 1.6, 0);
K.mesh.add(kingGlow);
const keys = {};
const DIAG = Math.SQRT1_2; // camera yaw is fixed 45°: W = screen-up = world (-1,-1)/√2
function updateKing(dt) {
  if (K.down > 0) { // the king has fallen — he returns at the keep
    K.down -= dt;
    if (K.down <= 0) {
      K.hp = K.max; K.u = 25; K.v = 29.5;
      K.mesh.visible = true; K.mesh.position.set(K.u, 0, K.v);
      poof(K.u, 1, K.v, true);
    }
    return;
  }
  const fwd = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0);
  const side = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
  let dx = (-fwd + side) * DIAG, dz = (-fwd - side) * DIAG;
  const moving = dx || dz;
  if (moving) {
    const m = Math.hypot(dx, dz); dx /= m; dz /= m;
    K.u = Math.max(1.5, Math.min(48.5, K.u + dx * 9 * dt));
    K.v = Math.max(1.5, Math.min(48.5, K.v + dz * 9 * dt));
    K.face = Math.atan2(dx, dz);
  }
  if (S.phaseName === 'day') K.hp = Math.min(K.max, K.hp + 2.5 * dt);
  K.mesh.position.set(K.u, 0, K.v);
  const diff = ((K.face - K.mesh.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  K.mesh.rotation.y += diff * (1 - Math.exp(-12 * dt));
  const body = K.mesh.userData.body;
  K.gallop = THREE.MathUtils.damp(K.gallop || 0, moving ? 1 : 0, 8, dt);
  body.position.y = Math.abs(Math.sin(perf * 11)) * .16 * K.gallop;
  body.rotation.x = Math.sin(perf * 11) * .05 * K.gallop;
  updatePrompt();
}
function hurtKing(n) {
  if (K.down > 0) return;
  K.hp -= n;
  poof(K.u, 1.2, K.v);
  sfx.kingHit();
  if (K.hp <= 0) {
    K.hp = 0; K.down = 6;
    K.mesh.visible = false;
    poof(K.u, .8, K.v, true);
    sfx.fallen();
    flashBanner('THE KING HAS FALLEN — HE RETURNS AT THE KEEP');
  }
}

/* ============================== build flow ============================== */
const bmenu = $('#bmenu'), eprompt = $('#eprompt');
function closeBmenu() { bmenu.style.display = 'none'; bmenu.dataset.slot = ''; }
function openMenu(sl, title, rows) {
  bmenu.innerHTML = `<div class="h">${title}</div>` + rows;
  bmenu.style.display = 'block'; bmenu.dataset.slot = sl.id;
  const p = proj(sl.u, 2.4, sl.v);
  bmenu.style.left = Math.max(150, Math.min(innerWidth - 150, p.x)) + 'px';
  bmenu.style.top = Math.max(190, Math.min(innerHeight - 40, p.y)) + 'px';
}
function opt(attr, ic, nm, ds, cost, can) {
  return `<button class="bopt" ${attr} ${can ? '' : 'disabled'}><span class="ic">${ic}</span>
    <span><span class="nm">${nm}</span><br><span class="ds">${ds}</span></span>
    ${cost ? `<span class="cost">🪙 ${cost}</span>` : ''}</button>`;
}
function upgradable(sl) {
  const b = S.builds[sl.id];
  if (!b) return null;
  if (b.type === 'house' && !b.upg) return { label: 'Second Storey', cost: 2 };
  if (b.type === 'tower' && !b.upg) return { label: 'Choose a spire', cost: 3 };
  if (b.type === 'harbour' && !b.upg) return { label: 'Big Docks', cost: 3 };
  return null;
}
const CASTLE_TIERS = [null, { cost: 8, hp: 10, desc: '+10 castle HP · heavier arrows' },
  { cost: 14, hp: 10, desc: '+10 castle HP · rapid volleys' }];
function castleMenu() {
  const tier = CASTLE_TIERS[S.castleLvl];
  if (!tier) {
    openMenu(CASTLE_SLOT, 'Castle Center — Lv 3',
      `<div style="font-size:12px;opacity:.75;padding:2px 4px 4px">The keep stands at full strength. ${S.castleMax} HP, rapid volleys.</div>`);
    return;
  }
  openMenu(CASTLE_SLOT, `Castle Center — Lv ${S.castleLvl}`,
    opt('data-c="1"', '🏰', `Fortify to Lv ${S.castleLvl + 1}`, tier.desc, tier.cost, S.gold >= tier.cost));
  bmenu.querySelector('[data-c]')?.addEventListener('click', () => {
    if (S.gold < tier.cost) return;
    S.gold -= tier.cost; S.castleLvl++;
    S.castleMax += tier.hp; S.castleHP = S.castleMax;
    const trim = ART.castleTrim(S.castleLvl);
    castle.add(trim); castleTrims.push(trim);
    poof(25, 5, 24, true);
    sfx.upgrade();
    refreshDayHUD(); closeBmenu();
    flashHint(`The Castle Center stands taller — Lv ${S.castleLvl}`);
  });
}
function slotAction(sl) {
  if (S.phaseName !== 'day' || S.view !== 'game') return;
  if (sl.castle) { castleMenu(); return; }
  const b = S.builds[sl.id];
  if (!b) { tryBuild(sl); return; }
  if (b.type === 'house' && !b.upg)
    openMenu(sl, 'Upgrade House', opt('data-u="house"', '🏠', 'Second Storey', '+2 gold at dawn instead of +1', 2, S.gold >= 2));
  else if (b.type === 'tower' && !b.upg)
    openMenu(sl, 'Choose a spire',
      opt('data-u="sniper"', '🎯', "Sniper's Perch", '+range, +damage', 3, S.gold >= 3) +
      opt('data-u="archer"', '🏹', "Archer's Spire", 'Shoots twice as fast', 3, S.gold >= 3));
  else if (b.type === 'harbour' && !b.upg)
    openMenu(sl, 'Upgrade Harbour', opt('data-u="docks"', '⛵', 'Big Docks', 'Each boat pays 2 gold', 3, S.gold >= 3));
  else {
    openMenu(sl, BTYPES[b.type].name,
      `<div style="font-size:12px;opacity:.75;padding:2px 4px 4px">${BTYPES[b.type].desc}. Standing strong.</div>`);
    return;
  }
  bmenu.querySelectorAll('[data-u]').forEach(btn => btn.addEventListener('click', () => {
    const u = btn.dataset.u, cost = u === 'house' ? 2 : 3;
    if (S.gold < cost) return;
    S.gold -= cost; S.builds[sl.id].upg = (u === 'house' || u === 'docks') ? true : u;
    renderBuild(sl); refreshDayHUD(); closeBmenu();
    sfx.upgrade();
  }));
}
function tryBuild(sl) {
  const t = BTYPES[sl.type];
  if (S.gold < t.cost) { flashHint('Not enough gold — the ' + t.name + ' costs ' + t.cost); sfx.error(); return; }
  if (sl.type === 'barracks') {
    openMenu(sl, 'Barracks — choose a company',
      opt('data-k="knight"', '🛡', 'Knights', 'Balanced, armored against arrows', 4, true) +
      opt('data-k="berserk"', '⚔️', 'Berserks', 'Glass cannons — double damage', 4, true));
    bmenu.querySelectorAll('[data-k]').forEach(btn => btn.addEventListener('click', () => build(sl, { kind: btn.dataset.k })));
    return;
  }
  if (sl.type === 'range') {
    openMenu(sl, 'Archery Range — choose archers',
      opt('data-k="longbow"', '🏹', 'Longbow Archers', 'Extremely long range, fragile', 4, true) +
      opt('data-k="fire"', '🔥', 'Fire Archers', 'Splash damage on impact', 4, true));
    bmenu.querySelectorAll('[data-k]').forEach(btn => btn.addEventListener('click', () => build(sl, { kind: btn.dataset.k })));
    return;
  }
  build(sl, {});
}
function build(sl, extra) {
  const t = BTYPES[sl.type];
  if (S.gold < t.cost) return;
  S.gold -= t.cost;
  S.builds[sl.id] = { type: sl.type, age: 0, boats: 0, ...extra };
  renderBuild(sl); closeBmenu(); refreshDayHUD();
  poof(sl.u, .5, sl.v);
  sfx.build();
  if (sl.type === 'mill') {
    SLOTS.filter(x => x.type === 'field').forEach(x => x.hidden = false);
    refreshMarkers(); flashHint('The Windmill opened two Field plots nearby');
  }
}
/* raycast picking */
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
canvas.addEventListener('pointerdown', e => {
  closeBmenu();
  if (S.view !== 'game' || S.phaseName !== 'day') return;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(hitMeshes, false)[0];
  if (hit) slotAction(hit.object.userData.slot);
});
let nearSlot = null;
function updatePrompt() {
  nearSlot = null;
  let label = '', py = 2.6;
  if (S.phaseName === 'day' && S.view === 'game') {
    let bd = 3.2;
    for (const sl of SLOTS) {
      if (sl.hidden) continue;
      const d = Math.hypot(sl.u - K.u, sl.v - K.v);
      if (d >= bd) continue;
      if (!S.builds[sl.id]) {
        const t = BTYPES[sl.type];
        bd = d; nearSlot = sl;
        label = S.gold >= t.cost ? `<span class="k">E</span>Build ${t.name} · ${t.cost}g` : `Need ${t.cost} gold for the ${t.name}`;
      } else {
        const up = upgradable(sl);
        if (up) { bd = d; nearSlot = sl; label = `<span class="k">E</span>${up.label} · ${up.cost}g`; }
      }
    }
    /* the keep itself is a shop */
    if (!nearSlot && Math.hypot(25 - K.u, 25.8 - K.v) < 4.6 && CASTLE_TIERS[S.castleLvl]) {
      nearSlot = CASTLE_SLOT; py = 4;
      label = `<span class="k">E</span>Fortify Castle · ${CASTLE_TIERS[S.castleLvl].cost}g`;
    }
  }
  if (nearSlot && bmenu.style.display !== 'block') {
    eprompt.innerHTML = label;
    eprompt.style.display = 'block';
    anchor(eprompt, nearSlot.u, py, nearSlot.v);
  } else eprompt.style.display = 'none';
}

/* ============================== night simulation ============================== */
let N = null;
const rangeRings = [];
function startNight() {
  if (S.phaseName === 'night') return;
  closeBmenu(); eprompt.style.display = 'none';
  const queue = nightPlan(S.day);
  N = { queue, total: queue.length, spawned: 0, killed: 0, enemies: [], units: [], towers: [],
    spawnEvery: Math.max(.35, 1.05 - S.day * .07), spawnT: .6, kingCd: 0, abQ: 0, abE: 0, hornUntil: 0, t: 0, over: false };
  for (const sl of SLOTS) {
    const b = S.builds[sl.id]; if (!b) continue;
    if (b.type === 'tower') N.towers.push({ u: sl.u, v: sl.v, z: sl.holder.children[0]?.userData.z || 4, cd: .4 + Math.random() * .4, spec: towerSpec(b) });
    if (b.type === 'barracks') for (const o of [[.3,-3.2],[-1.3,-2.4],[1.7,-2.5],[.3,-1.6]]) spawnUnit(sl.u + o[0], sl.v + o[1], b.kind || 'knight');
    if (b.type === 'range') for (const o of [[.2,2.6],[-1.4,2],[1.6,2.1]]) spawnUnit(sl.u + o[0], sl.v + o[1], b.kind || 'longbow');
  }
  N.towers.push({ u: 25, v: 24, z: 9.5, cd: .8, castle: true,
    spec: { range: 11, rate: S.castleLvl >= 3 ? .7 : 1.1, dmg: S.castleLvl >= 2 ? 3 : 2 } });
  if (S.settings.ranges) for (const t of N.towers) {
    if (t.castle) continue;
    const r = ART.ringMesh(t.spec.range, '#F0B429', .22);
    r.position.set(t.u, .12, t.v); scene.add(r); rangeRings.push(r);
  }
  S.castleHP = S.castleMax;
  $('#castleFill').style.width = '100%'; $('#kingFill').style.width = '100%';
  $('#waveTitle').textContent = 'NIGHT ' + S.day;
  $('#remainNum').textContent = N.total;
  setClock('#clockNight', 0);
  if (S.day === 2) setTimeout(() => flashBanner('BARREL KNIGHTS ON THE ROADS'), 1600);
  S.stance = 'hold';
  $$('.tchip').forEach(x => x.classList.toggle('on', x.dataset.stance === 'hold'));
  sfx.night();
  setPhase('night');
}
function spawnUnit(u, v, kind) {
  const specs = { knight: { range: 1.9, rate: .7, dmg: 1 }, berserk: { range: 1.9, rate: .8, dmg: 2 },
    longbow: { range: 13, rate: 1.15, dmg: 1 }, fire: { range: 9, rate: 1.2, dmg: 1, splash: 1.7 } };
  const mesh = kind === 'knight' || kind === 'berserk' ? ART.knightArt(kind) : ART.archerArt(kind);
  mesh.position.set(u, 0, v); mesh.rotation.y = Math.random() * 6; scene.add(mesh);
  N.units.push({ u, v, pu: u, pv: v, kind, cd: .3 + Math.random() * .5, ...specs[kind], mesh,
    bob: Math.random() * 9, fo: Math.random() * Math.PI * 2, fr: 1.5 + Math.random() * 1.3, pop: 1 });
}
function spawnEnemy(spec) {
  const T = ETYPES[spec.type], lane = spec.lane === 'A' ? LANE_A : LANE_B;
  const mesh = ART.enemyArt(spec.type);
  scene.add(mesh);
  const hpScale = 1 + Math.max(0, S.day - 3) * .18; // endless nights harden the horde
  const e = { type: spec.type, lane, d: 0, hp: Math.round(T.hp * hpScale), max: Math.round(T.hp * hpScale),
    speed: T.speed, dmg: T.dmg, rate: T.rate, ranged: T.ranged || 0,
    atkCd: .8, fly: T.fly, mesh, dead: false, ph: Math.random() * 9, hpEl: null, kCd: .5, pop: 1, flinch: 0 };
  N.enemies.push(e); N.spawned++;
  if (spec.type === 'ogre') flashBanner('AN OGRE APPROACHES');
  if (spec.type === 'spitter' && !N._spitSeen) { N._spitSeen = true; flashBanner('SPITTERS LOB FILTH FROM AFAR'); }
}
function epos(e) { return e.lane.at(e.d); }
const ehpPool = domPool(30, 'ehp');
function hurt(e, dmg, kb = 0) {
  if (e.dead) return;
  e.hp -= dmg;
  if (kb) e.d = Math.max(0, e.d - kb);
  const p = epos(e);
  dmgNum(p.u, e.fly ? 2.6 : 1.4, p.v, dmg);
  if (!e.hpEl) e.hpEl = ehpPool.take();
  if (e.hpEl) e.hpEl.firstChild.style.width = Math.max(0, 100 * e.hp / e.max) + '%';
  if (e.hp <= 0) {
    e.dead = true; N.killed++;
    const big = e.type === 'ogre' || e.type === 'barrel';
    poof(p.u, e.fly ? 1.7 : .5, p.v, big);
    sfx.kill(big);
    fxAdd({ kind: 'die', mesh: e.mesh, t: 0, dur: .34, fly: e.fly }); // removed from the scene when the squash ends
    if (e.hpEl) ehpPool.release(e.hpEl);
    $('#remainNum').textContent = N.total - N.killed;
    setClock('#clockNight', N.killed / N.total);
  } else { e.flinch = 1; sfx.hit(); }
}
let shakeT = 0;
function hurtCastle(n) {
  S.castleHP = Math.max(0, S.castleHP - n);
  sfx.castleHit();
  $('#castleFill').style.width = (100 * S.castleHP / S.castleMax) + '%';
  if (S.settings.shake && !matchMedia('(prefers-reduced-motion: reduce)').matches) shakeT = .25;
  poof(25, 2, 26.5);
  if (S.castleHP <= 0) endNight(false);
}
function nearestEnemy(u, v, range) {
  let best = null, bd = range;
  for (const e of N.enemies) {
    if (e.dead) continue;
    const p = epos(e), d = Math.hypot(p.u - u, p.v - v);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}
function simTick(dt) {
  N.t += dt; N.spawnT -= dt;
  if (N.spawnT <= 0 && N.queue.length) { N.spawnT = N.spawnEvery; spawnEnemy(N.queue.shift()); }
  for (const e of N.enemies) {
    if (e.dead) continue;
    const stop = e.lane.total - e.ranged;
    if (e.d < stop) e.d = Math.min(stop, e.d + e.speed * dt);
    else {
      e.atkCd -= dt;
      if (e.atkCd <= 0) {
        e.atkCd = e.rate;
        if (e.ranged) { // spitter lobs filth at the keep from a distance
          const sp = epos(e);
          arrow(new THREE.Vector3(sp.u, 1, sp.v), new THREE.Vector3(25, 2, 24.8), 3, () => hurtCastle(e.dmg));
        } else hurtCastle(e.dmg);
      }
    }
    const p = epos(e), q = e.lane.at(e.d + .5);
    e.mesh.position.set(p.u, 0, p.v);
    e.mesh.lookAt(q.u, 0, q.v);
    if (e.pop > 0) { // pop out of the road on spawn
      e.pop = Math.max(0, e.pop - dt * 3);
      const k = 1 - e.pop;
      e.mesh.scale.setScalar(k * (1 + Math.sin(k * Math.PI) * .22) + .001);
    } else if (e.flinch > 0) { // squash on taking a hit
      e.flinch = Math.max(0, e.flinch - dt * 5);
      const s = e.flinch * .2;
      e.mesh.scale.set(1 + s, 1 - s, 1 + s);
    }
    const body = e.mesh.userData.body;
    if (e.type === 'slime' || e.type === 'runner') {
      const sq = e.type === 'runner' ? 14 : 9;
      body.scale.y = 1 + Math.sin(N.t * sq + e.ph) * .16;
      body.position.y = Math.abs(Math.sin(N.t * sq + e.ph)) * .22;
    } else if (e.fly) {
      const a = Math.sin(N.t * 40 + e.ph) * .6, w = e.mesh.userData.wings;
      if (w) { w[0].rotation.x = -.9 + a * .3; w[1].rotation.x = .9 - a * .3; }
    } else body.rotation.z = Math.sin(N.t * 7 + e.ph) * .07;
    /* brawlers turn on the king when he rides into them */
    if (!e.fly && !K.down && Math.hypot(p.u - K.u, p.v - K.v) < 1.35) {
      e.kCd -= dt;
      if (e.kCd <= 0) { e.kCd = e.rate; hurtKing(e.dmg); }
    }
    if (e.hpEl) anchor(e.hpEl, p.u, e.fly ? 2.9 : 1.8, p.v);
  }
  N.enemies = N.enemies.filter(e => !e.dead);
  for (const t of N.towers) {
    t.cd -= dt;
    if (t.cd <= 0) {
      const e = nearestEnemy(t.u, t.v, t.spec.range);
      if (e) { t.cd = t.spec.rate; const p = epos(e);
        arrow(new THREE.Vector3(t.u, t.z, t.v), new THREE.Vector3(p.u, e.fly ? 1.7 : .6, p.v), 2.2, () => hurt(e, t.spec.dmg)); }
      else t.cd = .12;
    }
  }
  const charge = S.stance === 'charge', follow = S.stance === 'follow';
  for (const un of N.units) {
    un.cd -= dt;
    if (un.pop > 0) { // muster pop
      un.pop = Math.max(0, un.pop - dt * 2.5);
      const k = 1 - un.pop;
      un.mesh.scale.setScalar(k * (1 + Math.sin(k * Math.PI) * .3) + .001);
    }
    /* stances move the company: follow the king, charge the horde, or hold the post.
       Leaving Follow plants a new post wherever each soldier stands — that is how you re-station troops. */
    let tx = null, tz = null, sp = 0, stopAt = .3;
    if (follow && !K.down) { tx = K.u + Math.cos(un.fo) * un.fr; tz = K.v + Math.sin(un.fo) * un.fr; sp = 7.5; }
    else if (charge && un.range < 4) {
      const e = nearestEnemy(un.u, un.v, 12);
      if (e) { const p = epos(e); tx = p.u; tz = p.v; sp = 3.6; stopAt = un.range * .8; }
    } else if (!follow && !charge && Math.hypot(un.pu - un.u, un.pv - un.v) > .4) { tx = un.pu; tz = un.pv; sp = 3.4; }
    let walking = false;
    if (tx !== null) {
      const dx = tx - un.u, dz = tz - un.v, d = Math.hypot(dx, dz);
      if (d > stopAt) {
        const mv = Math.min(d, sp * dt);
        un.u = Math.max(1.5, Math.min(48.5, un.u + dx / d * mv));
        un.v = Math.max(1.5, Math.min(48.5, un.v + dz / d * mv));
        un.mesh.lookAt(tx, 0, tz);
        walking = true;
      }
    }
    un.mesh.position.x = un.u; un.mesh.position.z = un.v;
    un.mesh.position.y = Math.abs(Math.sin(N.t * (walking ? 9 : 5) + un.bob)) * (walking ? .12 : .05);
    if (un.cd <= 0) {
      const e = nearestEnemy(un.u, un.v, un.range * (charge ? 1.5 : 1));
      if (e) {
        un.cd = un.rate; const p = epos(e);
        un.mesh.lookAt(p.u, 0, p.v);
        if (un.range > 4) arrow(new THREE.Vector3(un.u, 1.1, un.v), new THREE.Vector3(p.u, e.fly ? 1.7 : .6, p.v), 1.6, () => {
          hurt(e, un.dmg);
          if (un.splash) for (const o of [...N.enemies]) { const q = epos(o); if (o !== e && Math.hypot(q.u - p.u, q.v - p.v) < un.splash) hurt(o, un.dmg); }
        }, un.kind === 'fire');
        else { hurt(e, un.dmg * (charge ? 1.3 : 1), .25); poof(p.u, .8, p.v); }
      } else un.cd = .15;
    }
  }
  N.kingCd -= dt;
  const horn = N.t < N.hornUntil;
  if (N.kingCd <= 0 && !K.down) {
    const e = nearestEnemy(K.u, K.v, 2.4);
    if (e) { N.kingCd = horn ? .34 : .55; const p = epos(e); hurt(e, 2, .45); poof(p.u, .9, p.v); }
    else N.kingCd = .1;
  }
  N.abQ = Math.max(0, N.abQ - dt); N.abE = Math.max(0, N.abE - dt);
  updAb('#abSpear', '#abSpearCd', N.abQ, 6);
  updAb('#abHorn', '#abHornCd', N.abE, 14);
  if (!N.queue.length && N.spawned === N.total && N.killed === N.total && !N.over) endNight(true);
}
function updAb(bsel, csel, cd, max) {
  $(csel).style.setProperty('--cd', (cd / max * 100).toFixed(1));
  $(bsel).classList.toggle('ready', cd <= 0);
}
function useSpear() {
  if (!N || N.over || N.abQ > 0 || K.down) return;
  const e = nearestEnemy(K.u, K.v, 10);
  if (!e) { flashBanner('NO TARGET IN RANGE'); return; }
  N.abQ = 6;
  sfx.spear();
  const p = epos(e);
  arrow(new THREE.Vector3(K.u, 2.2, K.v), new THREE.Vector3(p.u, e.fly ? 1.7 : .7, p.v), 1.2,
    () => { hurt(e, 8, .8); poof(p.u, 1, p.v, true); }, true);
}
function useHorn() {
  if (!N || N.over || N.abE > 0) return;
  N.abE = 14; N.hornUntil = N.t + 6;
  sfx.horn();
  flashBanner('RALLY! THE KING FIGHTS HARDER');
}
$('#abSpear').addEventListener('click', useSpear);
$('#abHorn').addEventListener('click', useHorn);
function cleanupNight() {
  if (!N) return;
  N.enemies.forEach(e => { if (!e.dead) { scene.remove(e.mesh); if (e.hpEl) ehpPool.release(e.hpEl); } });
  N.units.forEach(u => scene.remove(u.mesh));
  rangeRings.forEach(r => scene.remove(r)); rangeRings.length = 0;
  fx.forEach(f => { if (f.el) dmgPool.release(f.el); if (f.m) f.m.visible = false; if (f.mesh) scene.remove(f.mesh); }); fx = [];
}
function abortNight() {
  if (!N) return;
  cleanupNight(); N = null;
  ['#ovVictory', '#ovDefeat', '#ovPause', '#ovCleared'].forEach(s => $(s).style.display = 'none');
}
function endNight(win) {
  if (!N || N.over) return;
  N.over = true;
  setTimeout(() => {
    const slain = N.killed, integ = Math.round(100 * S.castleHP / S.castleMax);
    cleanupNight();
    win ? sfx.victory() : sfx.defeat();
    if (win) {
      const dr = dawnRows(), flaw = integ === 100 ? 2 : 0;
      $('#vicSub').textContent = S.day % 5 === 0
        ? `Night ${S.day} survived. The kingdom endures — the horde grows bolder.`
        : `The kingdom stands. Night ${S.day} survived.`;
      let rows = `<div class="row"><span>Enemies slain</span><b>${slain}</b></div>
        <div class="row"><span>Castle integrity</span><b>${integ}%</b></div>`;
      for (const r of dr.rows) rows += `<div class="row"><span>${r.l}</span><b>+${r.n}</b></div>`;
      if (flaw) rows += `<div class="row"><span>Flawless defense bonus</span><b>+2</b></div>`;
      rows += `<div class="row"><span><b style="color:#F6F2E8">Gold at dawn</b></span><b>${S.gold} → ${S.gold + dr.total + flaw}</b></div>`;
      $('#vicTally').innerHTML = rows;
      $('#vicNext').textContent = 'CONTINUE TO DAY ' + (S.day + 1);
      $('#ovVictory').style.display = 'grid';
      N._earned = dr.total + flaw;
    } else {
      $('#defNights').textContent = String(S.day - 1);
      $('#ovDefeat').style.display = 'grid';
    }
  }, win ? 650 : 250);
}
$('#vicNext').addEventListener('click', () => {
  $('#ovVictory').style.display = 'none';
  sfx.dawn();
  S.gold += N._earned || 0; applyDawn(); S.day++; S.castleHP = S.castleMax;
  N = null; setPhase('day'); revealPlots(); refreshDayHUD();
  let ci = 0;
  coinFly(25, 3, 24, ci++ * .08);
  for (const sl of SLOTS) {
    const b = S.builds[sl.id]; if (!b) continue;
    if (['house', 'mill', 'field', 'mine', 'harbour'].includes(b.type)) {
      coinFly(sl.u, 1.5, sl.v, ci++ * .08);
      if (b.type === 'house' && b.upg) coinFly(sl.u, 2.2, sl.v, ci++ * .08);
    }
  }
  flashHint('Dawn pays taxes — reinvest before night ' + S.day);
});
$('#defRetry').addEventListener('click', () => { $('#ovDefeat').style.display = 'none'; N = null; startNight(); });
$('#defMenu').addEventListener('click', () => { $('#ovDefeat').style.display = 'none'; N = null; resetRun(); setView('menu'); });
$('#clrMenu').addEventListener('click', () => { $('#ovCleared').style.display = 'none'; resetRun(); setView('menu'); });
const castleTrims = [];
function resetRun() {
  S.day = 1; S.gold = 8; S.builds = {};
  S.castleLvl = 1; S.castleMax = 15; S.castleHP = 15;
  castleTrims.forEach(t => castle.remove(t)); castleTrims.length = 0;
  SLOTS.forEach(sl => { sl.hidden = sl.type === 'field' || !!sl.unlockDay; renderBuild(sl); });
  revealPlots(true);
  K.u = 25; K.v = 29.5; K.hp = K.max; K.down = 0; K.mesh.visible = true;
  setPhase('day'); refreshDayHUD();
}

/* ============================== views & phases ============================== */
function setView(v) {
  S.view = v;
  $('#menuScreen').style.display = v === 'menu' ? 'grid' : 'none';
  $('#hudDay').style.display = (v === 'game' && S.phaseName === 'day') ? '' : 'none';
  $('#hudNight').style.display = (v === 'game' && S.phaseName === 'night') ? '' : 'none';
  refreshMarkers(); closeBmenu();
}
function setPhase(p) {
  S.phaseName = p;
  phase.target = p === 'night' ? 1 : 0;
  setView(S.view);
}
$('#playBtn').addEventListener('click', () => { setPhase('day'); setView('game'); refreshDayHUD(); });
$('#beginNight').addEventListener('click', startNight);
function anyOverlay() { return ['ovVictory', 'ovDefeat', 'ovCleared', 'ovPause', 'ovSettings'].some(id => $('#' + id).style.display === 'grid'); }
$('#pauseBtn').addEventListener('click', () => { $('#ovPause').style.display = 'grid'; });
$('#pauseResume').addEventListener('click', () => { $('#ovPause').style.display = 'none'; });
$('#pauseRestart').addEventListener('click', () => { $('#ovPause').style.display = 'none'; abortNight(); startNight(); });
$('#pauseAbandon').addEventListener('click', () => { $('#ovPause').style.display = 'none'; abortNight(); resetRun(); setView('menu'); });
$('#pauseSettings').addEventListener('click', () => { $('#ovSettings').style.display = 'grid'; });
$('#setClose').addEventListener('click', () => { $('#ovSettings').style.display = 'none'; });
function bindSet(id, key) { $(id).addEventListener('change', e => {
  S.settings[key] = e.target.checked; saveSet();
  if (key === 'ranges') rangeRings.forEach(r => r.visible = e.target.checked);
  if (key === 'music' || key === 'sound') AUDIO.setEnabled(S.settings.music, S.settings.sound);
}); }
bindSet('#setDmg', 'dmg'); bindSet('#setRanges', 'ranges'); bindSet('#setShake', 'shake');
bindSet('#setMusic', 'music'); bindSet('#setSound', 'sound');
function syncSetUI() {
  $('#setDmg').checked = S.settings.dmg; $('#setRanges').checked = S.settings.ranges;
  $('#setShake').checked = S.settings.shake; $('#setMusic').checked = S.settings.music;
  $('#setSound').checked = S.settings.sound;
}
syncSetUI();
$$('.tchip').forEach(c => c.addEventListener('click', () => {
  /* leaving Follow stations each soldier where he stands */
  if (N && S.stance === 'follow' && c.dataset.stance !== 'follow')
    N.units.forEach(un => { un.pu = un.u; un.pv = un.v; });
  S.stance = c.dataset.stance;
  $$('.tchip').forEach(x => x.classList.toggle('on', x === c));
}));
document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys[k] = true; if (k.startsWith('arrow')) e.preventDefault(); return; }
  if (e.repeat) return;
  if (e.key === ' ' && S.view === 'game' && S.phaseName === 'day' && !anyOverlay()) { e.preventDefault(); startNight(); }
  else if (k === 'e' && S.view === 'game' && S.phaseName === 'day' && nearSlot && !anyOverlay())
    (nearSlot.castle || S.builds[nearSlot.id]) ? slotAction(nearSlot) : tryBuild(nearSlot);
  else if (k === 'q' && S.phaseName === 'night' && !anyOverlay()) useSpear();
  else if (k === 'e' && S.phaseName === 'night' && !anyOverlay()) useHorn();
  else if (['1', '2', '3'].includes(e.key) && S.phaseName === 'night') $$('.tchip')[+e.key - 1].click();
  else if (k === 'm') {
    const on = !(S.settings.music && S.settings.sound);
    S.settings.music = S.settings.sound = on;
    saveSet(); syncSetUI(); AUDIO.setEnabled(on, on);
    if (S.view === 'game' && S.phaseName === 'day') flashHint(on ? 'Sound on' : 'Sound muted');
    else if (S.phaseName === 'night') flashBanner(on ? 'SOUND ON' : 'SOUND MUTED');
  }
  else if (e.key === 'Escape' && S.phaseName === 'night' && N && !N.over)
    $('#ovPause').style.display = $('#ovPause').style.display === 'grid' ? 'none' : 'grid';
});
document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
/* buttons must not keep focus, or Space re-triggers them mid-game */
document.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { b.blur(); if (!b.disabled) sfx.ui(); } });

/* ============================== wave preview & castle bar ============================== */
function updateFloaters() {
  /* day: tonight's full wave preview · night: enemies still to spawn from each road */
  const cnt = { A: 0, B: 0 };
  let showPrev = false;
  if (S.view === 'game' && S.phaseName === 'day') { showPrev = true; nightPlan(S.day).forEach(e => cnt[e.lane]++); }
  else if (S.view === 'game' && N && !N.over) { showPrev = true; N.queue.forEach(e => cnt[e.lane]++); }
  for (const [id, lane, u, v] of [['#prevA', 'A', 2, 25], ['#prevB', 'B', 48, 25]]) {
    const el = $(id);
    if (showPrev && cnt[lane]) { el.style.display = 'flex'; $(id + 'n').textContent = '×' + cnt[lane]; anchor(el, u, 3.6, v); }
    else el.style.display = 'none';
  }
  const cb = $('#castleWrap');
  if (S.view === 'game' && S.phaseName === 'night') { cb.style.display = 'block'; anchor(cb, 25, 13.6, 24); }
  else cb.style.display = 'none';
  $('#kingFill').style.width = (100 * K.hp / K.max) + '%';
}

/* ============================== camera ============================== */
const CAMOFF = new THREE.Vector3(17.5, 36, 17.5);
const camTarget = new THREE.Vector3(25, 0, 27);
let menuAngle = 0;
function updateCamera(dt) {
  if (S.view === 'menu') {
    menuAngle += dt * .07;
    camera.position.set(25 + Math.cos(menuAngle) * 62, 44, 25 + Math.sin(menuAngle) * 62);
    camera.lookAt(25, 0, 25);
    return;
  }
  const zoom = 1 + phase.t * .18;
  camTarget.x = THREE.MathUtils.damp(camTarget.x, K.u, 4, dt);
  camTarget.z = THREE.MathUtils.damp(camTarget.z, K.v, 4, dt);
  camera.position.set(camTarget.x + CAMOFF.x * zoom, CAMOFF.y * zoom, camTarget.z + CAMOFF.z * zoom);
  if (shakeT > 0) {
    shakeT -= dt;
    camera.position.x += (Math.random() - .5) * .5; camera.position.y += (Math.random() - .5) * .4;
  }
  camera.lookAt(camTarget.x, 0, camTarget.z);
}

/* ============================== master loop ============================== */
const STEP = 1 / 60;
let last = performance.now(), acc = 0, perf = 0;
function step(dt) {
  perf += dt;
  if (S.view === 'game') updateKing(dt);
  if (N && !N.over) simTick(dt);
  updateFx(dt);
  for (const sl of SLOTS) if (sl.pop > 0) { // elastic build pop
    sl.pop = Math.max(0, sl.pop - dt * 2.2);
    const k = 1 - sl.pop, over = 1 + Math.sin(k * Math.PI) * .18;
    sl.holder.scale.setScalar((.2 + .8 * k) * over);
  }
  phase.t = THREE.MathUtils.damp(phase.t, phase.target, 1.35, dt);
  for (const fn of ART.ANIMS) fn(perf, dt);
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, .1); last = now;
  if (!anyOverlay()) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 6) { step(STEP); acc -= STEP; n++; }
    if (n === 6) acc = 0;
  }
  updateCamera(dt);
  applyPhase();
  updateFloaters();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
window.__pump = s => { for (let i = 0; i < Math.round(s * 60); i++) step(STEP); };
window.__dbg = { S, K, keys, AUDIO, get N() { return N; } };

/* ============================== boot & test scenarios ============================== */
refreshDayHUD();
setPhase('day'); setView('menu');
{
  const q = new URLSearchParams(location.search);
  const sc = q.get('scenario');
  const prebuild = () => {
    S.gold = 30;
    build(SLOTS.find(s => s.id === 's2'), {}); S.builds.s2.upg = 'sniper'; renderBuild(SLOTS.find(s => s.id === 's2'));
    build(SLOTS.find(s => s.id === 's4'), { kind: 'knight' });
    build(SLOTS.find(s => s.id === 's1'), { kind: 'longbow' });
    build(SLOTS.find(s => s.id === 's5'), {}); S.builds.s5.upg = true; renderBuild(SLOTS.find(s => s.id === 's5'));
    build(SLOTS.find(s => s.id === 's7'), {});
  };
  if (sc === 'day') { setView('game'); refreshDayHUD(); }
  else if (sc === 'day2') { S.day = 2; prebuild(); setView('game'); refreshDayHUD(); K.u = 20; K.v = 27; }
  else if (sc === 'night2') {
    S.day = 2; prebuild(); setView('game'); startNight();
    window.__pump(parseFloat(q.get('pump') || '9.5')); N.over = true;
    phase.t = 1; applyPhase();
  } else if (sc === 'night6') {
    S.day = 6; prebuild(); revealPlots(true);
    S.gold = 40;
    build(SLOTS.find(s => s.id === 'x2'), {}); build(SLOTS.find(s => s.id === 'x3'), {});
    S.gold = 30; castleMenu(); bmenu.querySelector('[data-c]')?.click(); // castle to Lv 2
    setView('game'); startNight();
    window.__pump(parseFloat(q.get('pump') || '16')); N.over = true;
    phase.t = 1; applyPhase();
  } else if (sc === 'vic') {
    S.gold = 10; build(SLOTS.find(s => s.id === 's2'), {}); build(SLOTS.find(s => s.id === 's5'), {});
    setView('game'); startNight(); window.__pump(80);
    setTimeout(() => { $('#vicNext').click(); window.__pump(.5); phase.t = 0; }, 900);
  }
  if (sc) { camTarget.set(K.u, 0, K.v); updateCamera(0); }
  if (q.get('debug')) {
    const d = document.createElement('div'); d.id = 'dbg';
    const upd = () => { d.textContent = JSON.stringify({ iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio,
      cw: canvas.width, ch: canvas.height, sw: canvas.style.width, sh: canvas.style.height }); };
    upd(); setInterval(upd, 500);
    document.body.appendChild(d);
    window.addEventListener('error', e => { d.textContent += ' ERR: ' + e.message; });
  }
}
