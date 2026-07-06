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
  l.position.copy(pos); mapGroup.add(l); torchLights.push(l);
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

/* ============================== maps ============================== */
let MAP = null, mapGroup = null, castle = null;
let SLOTS = [], hitMeshes = [], LANES = {};
const CASTLE_SLOT = { castle: true, u: 25, v: 26.5 };

function place(obj, u, v, ry = 0, s = 1) { obj.position.set(u, 0, v); obj.rotation.y = ry; obj.scale.setScalar(s); mapGroup.add(obj); return obj; }
function gateAt(u, v) {
  const g = place(ART.gateTower(), u, v);
  addTorch(g.userData.torch.clone().add(g.position));
}

const MAPS = {
  nordfels: {
    id: 'nordfels', name: 'Nordfels',
    laneIds: ['A', 'B'],
    lanePts: {
      A: [[0, 25.5], [7, 25.2], [14, 25], [19.5, 25], [21.7, 25]],
      B: [[50, 25.5], [42, 25.2], [36, 25], [29.6, 25], [28.3, 25]],
    },
    terrain: { sx: 1, sz: 1, pond: true },
    boss: { name: 'THE OGRE WARLORD', kind: 'warlord', hp: 55, speed: .55, dmg: 6, rate: 2.2 },
    slots: [
      { id: 's1', u: 18,   v: 21,   type: 'range' },   { id: 's2', u: 18,   v: 29,   type: 'tower' },
      { id: 's3', u: 32,   v: 21,   type: 'tower' },   { id: 's4', u: 32,   v: 29,   type: 'barracks' },
      { id: 's5', u: 22,   v: 31.5, type: 'house' },   { id: 's6', u: 26.5, v: 31.5, type: 'house' },
      { id: 's9', u: 30.5, v: 33.5, type: 'house' },   { id: 's7', u: 17,   v: 35,   type: 'mill' },
      { id: 's8', u: 38.5, v: 34.5, type: 'harbour' }, { id: 's10', u: 7.5, v: 21,   type: 'mine' },
      { id: 'f1', u: 14,   v: 33.5, type: 'field', hidden: true }, { id: 'f2', u: 16.5, v: 38, type: 'field', hidden: true },
      { id: 'w1', type: 'wall', wall: { lane: 'A', d: 13 } },
      { id: 'w2', type: 'wall', wall: { lane: 'B', d: 13 } },
      { id: 'w3', type: 'wall', wall: { lane: 'A', d: 6.5 }, hidden: true, unlockDay: 2 },
      { id: 'w4', type: 'wall', wall: { lane: 'B', d: 6.5 }, hidden: true, unlockDay: 2 },
      { id: 'x1', u: 33.5, v: 36.5, type: 'house',    hidden: true, unlockDay: 2 },
      { id: 'x2', u: 10.5, v: 22.7, type: 'tower',    hidden: true, unlockDay: 3 },
      { id: 'x3', u: 39.5, v: 27.5, type: 'tower',    hidden: true, unlockDay: 3 },
      { id: 'x4', u: 26,   v: 17.5, type: 'barracks', hidden: true, unlockDay: 4 },
      { id: 'x5', u: 19.5, v: 39.5, type: 'house',    hidden: true, unlockDay: 4 },
      { id: 'x6', u: 44.5, v: 28,   type: 'mine',     hidden: true, unlockDay: 5 },
      { id: 'x7', u: 36.5, v: 13.5, type: 'range',    hidden: true, unlockDay: 5 },
      { id: 'x8', u: 12,   v: 27.5, type: 'house',    hidden: true, unlockDay: 6 },
    ],
    decor() {
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
      for (const [u, v] of [[15.1,23],[15.1,27],[35.1,23],[35.1,27]]) gateAt(u, v);
      place(ART.boat(), 43.5, 37.5, .6);
    },
  },
  leviathan: {
    id: 'leviathan', name: 'Leviathan', unlockBest: 3, extraWasps: 3,
    serpent: true, camZoom: 1.12, bounds: { u: [-6, 56], v: [4, 46] },
    laneIds: ['A', 'B', 'C'],
    lanePts: {
      A: [[-6, 25.6], [1, 25.4], [7, 25.2], [14, 25], [19.5, 25], [21.7, 25]],
      B: [[56, 25.6], [49, 25.4], [42, 25.2], [36, 25], [29.6, 25], [28.3, 25]],
      C: [[25, 2], [24.8, 8], [25, 13], [25, 18], [25, 21.6]],
    },
    terrain: { sx: 1.45, sz: .9, pond: false },
    boss: { name: 'THE BROODMOTHER', kind: 'brood', hp: 45, speed: 1.05, dmg: 3, rate: 1.6, fly: true, brood: 7 },
    slots: [
      { id: 's1', u: 18,   v: 21,   type: 'range' },   { id: 's2', u: 18,   v: 29,   type: 'tower' },
      { id: 's3', u: 32,   v: 21,   type: 'tower' },   { id: 's4', u: 32,   v: 29,   type: 'barracks' },
      { id: 's5', u: 22,   v: 31.5, type: 'house' },   { id: 's6', u: 26.5, v: 31.5, type: 'house' },
      { id: 's7', u: 17,   v: 35,   type: 'mill' },    { id: 's9', u: 30.5, v: 33.5, type: 'house' },
      { id: 's8', u: 38.5, v: 34.5, type: 'harbour' }, { id: 's10', u: 7.5, v: 21,   type: 'mine' },
      { id: 'f1', u: 14,   v: 33.5, type: 'field', hidden: true }, { id: 'f2', u: 16.5, v: 38, type: 'field', hidden: true },
      { id: 'w1', type: 'wall', wall: { lane: 'A', d: 20 } },
      { id: 'w2', type: 'wall', wall: { lane: 'B', d: 20 } },
      { id: 'w3', type: 'wall', wall: { lane: 'C', d: 13 } },
      { id: 'w4', type: 'wall', wall: { lane: 'A', d: 13.5 }, hidden: true, unlockDay: 2 },
      { id: 'w5', type: 'wall', wall: { lane: 'B', d: 13.5 }, hidden: true, unlockDay: 2 },
      { id: 'w6', type: 'wall', wall: { lane: 'C', d: 7.5 }, hidden: true, unlockDay: 3 },
      { id: 'n1', u: 21.5, v: 13.5, type: 'tower',    hidden: true, unlockDay: 2 },
      { id: 'n2', u: 28.5, v: 13.5, type: 'tower',    hidden: true, unlockDay: 2 },
      { id: 'n3', u: 20.5, v: 9.5,  type: 'house',    hidden: true, unlockDay: 3 },
      { id: 'n4', u: 29.5, v: 9,    type: 'barracks', hidden: true, unlockDay: 3 },
      { id: 'x1', u: 41,   v: 27.5, type: 'mine',     hidden: true, unlockDay: 4 },
      { id: 'x2', u: 36,   v: 17,   type: 'house',    hidden: true, unlockDay: 4 },
    ],
    decor() {
      /* the island rests on a titan's bones: rib arches straddle the roads */
      for (const [x, s] of [[10, 1.1], [15.5, 1.25], [34.5, 1.25], [40, 1.1]])
        place(ART.ribArt(s), x, 25, Math.PI / 2);
      place(ART.ribArt(1.1), 25, 9.5); place(ART.ribArt(1.2), 25, 13.5);
      place(ART.skullArt(1.5), 5, 31.5, 2.6);
      for (const [u, v, s] of [[8,19,1.2],[12,30,.9],[30,7,1],[37,32,1.3],[44,21,.9],[20,6,1.1],[31,42,1],[13,41,1.2],[42,15,.8]])
        place(ART.boneSpike(s), u, v, Math.random() * 6);
      for (const [u, v, s] of [[45,8,.9],[5,42,.8],[44,42,.85]])
        place(ART.mountain(), u, v, Math.random() * 6, s);
      for (const [u, v, s] of [[9,38,.9],[40,39,.8],[16,42,.75],[44,31,.7],[35,41,.85]])
        place(ART.treePine(s), u, v, Math.random() * 6);
      for (const [u, v, s] of [[12,17,.9],[38,20,.8],[8,28,.7],[28,40,.8]])
        place(ART.rock(s), u, v, Math.random() * 6);
      for (const [u, v, s] of [[20,33,.9],[30,17.5,.8],[41,24,.7]])
        place(ART.bush(s), u, v, Math.random() * 6);
      place(ART.wallRun(3.6), 15.1, 18.6); place(ART.wallRun(3.6), 15.1, 27.8);
      place(ART.wallRun(3.6), 35.1, 18.6); place(ART.wallRun(3.6), 35.1, 27.8);
      place(ART.wallRun(3.4), 18.9, 17.5, Math.PI / 2); place(ART.wallRun(3.4), 27.6, 17.5, Math.PI / 2);
      for (const [u, v] of [[15.1,23],[15.1,27],[35.1,23],[35.1,27],[23,17.5],[27,17.5]]) gateAt(u, v);
      place(ART.boat(), 43.5, 36, .6);
      for (let i = 0; i < 2; i++) { // something old circles the island, day and night
        const fin = place(ART.finArt(), 0, 0);
        const ph = i * Math.PI;
        ART.ANIMS.push((t) => {
          if (!fin.parent) return;
          const a = t * .1 + ph;
          fin.position.set(25 + Math.cos(a) * 42, -.2, 25 + Math.sin(a) * 27);
          fin.rotation.y = -a;
        });
      }
    },
  },
};

function loadMap(id) {
  const def = MAPS[id] || MAPS.nordfels;
  MAP = def; S.map = def.id;
  try { localStorage.tf_map = def.id; } catch { /* private mode */ }
  if (mapGroup) scene.remove(mapGroup);
  mapGroup = new THREE.Group(); scene.add(mapGroup);
  torchLights.length = 0;
  hitMeshes = []; LANES = {};
  for (const lid of def.laneIds) { LANES[lid] = sampleLane(def.lanePts[lid]); LANES[lid].start = def.lanePts[lid][0]; }
  ART.buildTerrain(mapGroup, def.laneIds.map(l => def.lanePts[l]), def.terrain);
  def.decor();
  castle = place(ART.castleArt(), 25, 24);
  for (const p of castle.userData.torches) addTorch(p.clone().add(castle.position));
  for (const lid of def.laneIds) place(ART.spawnFlagArt(), LANES[lid].start[0], LANES[lid].start[1]);
  SLOTS = def.slots.map(s => ({ ...s }));
  for (const sl of SLOTS) {
    if (sl.wall) { // walls sit on the road itself, square across it
      const p = LANES[sl.wall.lane].at(sl.wall.d), q = LANES[sl.wall.lane].at(sl.wall.d + .6);
      sl.u = p.u; sl.v = p.v;
      sl.ang = Math.atan2(-(q.v - p.v), q.u - p.u);
    }
    sl.marker = place(ART.slotMarker(BTYPES[sl.type].cost), sl.u, sl.v);
    const hit = ART.hitCylinder(1.7, 3);
    hit.position.set(sl.u, 1.5, sl.v); hit.userData.slot = sl;
    mapGroup.add(hit); hitMeshes.push(hit);
    sl.holder = new THREE.Group(); sl.holder.position.set(sl.u, 0, sl.v);
    if (sl.ang) sl.holder.rotation.y = sl.ang;
    mapGroup.add(sl.holder);
    sl.pop = 0;
  }
  const chit = ART.hitCylinder(4, 12);
  chit.position.set(25, 0, 24); chit.userData.slot = CASTLE_SLOT;
  mapGroup.add(chit); hitMeshes.push(chit);
  $('#mapName').textContent = def.name;
  resetRun();
}

/* ============================== game state (exact ECS numbers) ============================== */
const S = { view: 'menu', phaseName: 'day', day: 1, gold: 8, castleHP: 15, castleMax: 15, castleLvl: 1,
  builds: {}, settings: { dmg: true, ranges: true, shake: true, music: true, sound: true, tilt: true }, stance: 'hold' };
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
  wall:     { name: 'Palisade Wall',   cost: 2, icon: '🧱', desc: 'Blocks a road — the horde must break it' },
};
/* ---- the armory: crowns earned each night survived buy permanent unlocks ---- */
const META = { crowns: 0, owned: {} };
try { Object.assign(META, JSON.parse(localStorage.tf_meta || '{}')); } catch { /* fresh device */ }
function saveMeta() { try { localStorage.tf_meta = JSON.stringify(META); } catch { /* private mode */ } }
const ARMORY = {
  frost:   { cost: 10 }, seal: { cost: 12 }, beacons: { cost: 6 }, pockets: { cost: 6 }, bastion: { cost: 8 },
};
function earnCrowns(n) { META.crowns += n; saveMeta(); refreshArmory(); }
function refreshArmory() {
  $('#crownNum').textContent = META.crowns;
  $('#armCrowns').textContent = META.crowns;
  $$('.aitem').forEach(el => {
    const id = el.dataset.a, btn = el.querySelector('button');
    if (META.owned[id]) { btn.textContent = 'OWNED'; btn.disabled = true; }
    else { btn.textContent = '⚜ ' + ARMORY[id].cost; btn.disabled = META.crowns < ARMORY[id].cost; }
  });
}
function applyOwned() {
  $('.wcard[data-w="frost"]').style.display = META.owned.frost ? '' : 'none';
  $('.pchip[data-p="beacons"]').style.display = META.owned.beacons ? '' : 'none';
  $('.pchip[data-p="pockets"]').style.display = META.owned.pockets ? '' : 'none';
  $('.plbl').textContent = 'Royal edicts · choose ' + (META.owned.seal ? 'three' : 'two');
}
function buyItem(id) {
  if (!ARMORY[id] || META.owned[id] || META.crowns < ARMORY[id].cost) { sfx.error(); return; }
  META.crowns -= ARMORY[id].cost; META.owned[id] = true;
  saveMeta(); sfx.upgrade(); applyOwned(); refreshArmory();
}

/* royal edicts — picked before a run */
const PERKS = {
  masonry:    { name: 'Masonry',         desc: 'Castle +8 HP · walls +8 HP' },
  loot:       { name: 'Loot Goblins',    desc: 'Slain enemies sometimes drop a coin' },
  discipline: { name: 'Iron Discipline', desc: 'Soldiers +2 HP and strike faster' },
  warhorn:    { name: 'War Horn',        desc: 'Rally lasts 10 s and heals the King' },
  beacons:    { name: 'Signal Beacons',  desc: 'Towers see 15% farther', req: 'beacons' },
  pockets:    { name: 'Deep Pockets',    desc: 'Begin every run with +4 gold', req: 'pockets' },
};
let perkSet = new Set();
try {
  perkSet = new Set(JSON.parse(localStorage.tf_perks || '[]')
    .filter(p => PERKS[p] && (!PERKS[p].req || META.owned[PERKS[p].req])));
} catch { /* fresh device */ }
const hasPerk = p => perkSet.has(p);
function togglePerk(p) {
  if (perkSet.has(p)) perkSet.delete(p);
  else { if (perkSet.size >= (META.owned.seal ? 3 : 2)) { sfx.error(); return; } perkSet.add(p); }
  try { localStorage.tf_perks = JSON.stringify([...perkSet]); } catch { /* private mode */ }
  $$('.pchip').forEach(c => c.classList.toggle('on', perkSet.has(c.dataset.p)));
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
  if (b) { sl.holder.add(ART.BUILD_ART[b.type](b.upg, b.upg2)); sl.pop = 1; sl.holder.scale.setScalar(.2); }
}

/* ============================== economy ============================== */
function dawnRows() {
  const rows = [{ l: 'Castle stipend', n: 1 }];
  let houses = 0, fields = 0, mills = 0;
  for (const id in S.builds) {
    const b = S.builds[id];
    if (b.type === 'house') houses += b.upg2 ? 3 : b.upg ? 2 : 1;
    else if (b.type === 'field') fields += 1;
    else if (b.type === 'mill') mills += 1;
    else if (b.type === 'mine') rows.push({ l: 'Gold Mine (decaying)', n: Math.max(0, 6 - (b.upg ? Math.floor(b.age / 2) : b.age)) });
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
  refreshGold();
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
const ETYPES = {
  slime:   { hp: 2,  speed: 1.5, dmg: 1, rate: 1.4 },
  barrel:  { hp: 5,  speed: 1.0, dmg: 2, rate: 1.6 },
  wasp:    { hp: 2,  speed: 2.6, dmg: 1, rate: 1.1, fly: true },
  runner:  { hp: 1,  speed: 3.4, dmg: 1, rate: 1.2 },
  spitter: { hp: 3,  speed: 1.1, dmg: 1, rate: 2.0, ranged: 6 },
  ogre:    { hp: 18, speed: .7,  dmg: 3, rate: 1.8 },
  shade:   { hp: 4,  speed: 2.2, dmg: 2, rate: 1.3, fly: true },  // drifts over walls and soldiers alike
  chief:   { hp: 12, speed: .9,  dmg: 2, rate: 1.6, buff: 5 },    // drives nearby monsters onward
};
/* endless campaign: nights 1–3 are authored, then the horde scales forever.
   Enemies rotate across every road the map has. */
function nightPlan(n) {
  const ids = MAP.laneIds;
  let li = 0;
  const q = []; const p = (type) => q.push({ type, lane: ids[li++ % ids.length] });
  const xw = MAP.extraWasps || 0;
  if (n === 1) { for (let i = 0; i < 10; i++) q.push({ type: 'slime', lane: ids[0] }); return q; }
  if (n === 2) {
    for (let i = 0; i < 8; i++) p('slime');
    for (let i = 0; i < 4; i++) p('barrel');
    for (let i = 0; i < 3 + xw; i++) p('wasp');
    return q;
  }
  if (n === 3) {
    for (let i = 0; i < 10; i++) p('slime');
    for (let i = 0; i < 6; i++) p('barrel');
    for (let i = 0; i < 5 + xw; i++) p('wasp');
    p('ogre');
    return q;
  }
  const slimes = Math.min(24, 6 + 2 * n), barrels = Math.min(14, n),
    wasps = Math.min(10, n - 1) + xw, runners = Math.min(12, (n - 3) * 2),
    spitters = Math.min(6, n - 4), ogres = n % 3 === 0 ? Math.min(4, Math.floor(n / 3)) : 0,
    shades = n >= 8 ? Math.min(8, n - 6) : 0,
    chiefs = n >= 10 && n % 2 === 0 ? Math.min(3, Math.floor((n - 8) / 2)) : 0;
  for (let i = 0; i < slimes; i++) p('slime');
  for (let i = 0; i < barrels; i++) p('barrel');
  for (let i = 0; i < runners; i++) p('runner');
  for (let i = 0; i < wasps; i++) p('wasp');
  for (let i = 0; i < spitters; i++) p('spitter');
  for (let i = 0; i < shades; i++) p('shade');
  for (let i = 0; i < chiefs; i++) p('chief');
  for (let i = 0; i < ogres; i++) p('ogre');
  return q;
}
function towerSpec(b) {
  const s = b.upg === 'sniper' ? { range: 13.5, rate: 1.2, dmg: 3 }
    : b.upg === 'archer' ? { range: 8.5, rate: .48, dmg: 2 }
    : b.upg === 'frost' ? { range: 9.5, rate: .85, dmg: 1, chill: 2 }
    : { range: 8.5, rate: .95, dmg: 2 };
  if (b.upg2) s.dmg += 1; // masterwork arms
  return s;
}

/* ============================== pools ============================== */
function pool(n, maker) {
  const items = [];
  for (let i = 0; i < n; i++) { const o = maker(); o.visible = false; scene.add(o); items.push(o); }
  return { take() { const o = items.find(x => !x.visible); if (o) o.visible = true; return o; }, all: items };
}
const arrowPool = pool(50, ART.arrowMesh), coinPool = pool(48, ART.coinMesh), poofPool = pool(14, ART.poofMesh);
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
/* ground coins — dawn taxes and enemy drops lie in the streets; the king rides over to collect */
const groundCoins = [];
function refreshGold() {
  $('#goldNum').textContent = S.gold;
  $('#goldNight').textContent = S.gold;
}
function dropCoins(u, v, value) {
  let rem = value;
  const count = Math.max(1, Math.min(value, 7));
  for (let i = 0; i < count && rem > 0; i++) {
    const val = Math.min(rem, Math.floor(value / count) + (i < value % count ? 1 : 0) || 1);
    const m = coinPool.take();
    if (!m) { S.gold += rem; refreshGold(); return; } // pool dry: bank the rest quietly
    m.position.set(u, 1, v);
    groundCoins.push({ m, x: u + (Math.random() - .5) * 2.2, y: 1, z: v + (Math.random() - .5) * 2.2,
      vx: 0, vy: 2.5 + Math.random() * 2, value: val, ph: Math.random() * 9, magnet: false, settled: false });
    const c = groundCoins[groundCoins.length - 1];
    c.vx = (c.x - u) * 2; c.vz = (c.z - v) * 2; c.x = u; c.z = v;
    rem -= val;
  }
  if (rem > 0) { S.gold += rem; refreshGold(); }
}
function collectAllCoins(quiet) {
  let tot = 0;
  for (const c of groundCoins) { tot += c.value; c.m.visible = false; }
  groundCoins.length = 0;
  if (tot) { S.gold += tot; if (!quiet) sfx.coin(); refreshGold(); }
  return tot;
}
function updateGroundCoins(dt) {
  for (let i = groundCoins.length - 1; i >= 0; i--) {
    const c = groundCoins[i];
    c.m.rotation.y += 4 * dt;
    if (!c.magnet && S.view === 'game' && !(K.down > 0) && Math.hypot(c.x - K.u, c.z - K.v) < 2.5) c.magnet = true;
    if (c.magnet) {
      _a.set(K.u - c.x, 1 - c.y, K.v - c.z);
      const d = _a.length();
      if (d < .65) { // picked up
        S.gold += c.value; c.m.visible = false; groundCoins.splice(i, 1);
        sfx.coin(); refreshGold();
        continue;
      }
      _a.normalize().multiplyScalar(Math.min(16 * dt, d));
      c.x += _a.x; c.y += _a.y; c.z += _a.z;
    } else if (!c.settled) { // scatter under gravity
      c.vy -= 20 * dt; c.x += c.vx * dt; c.z += c.vz * dt; c.y += c.vy * dt;
      if (c.y <= .18) { c.y = .18; if (Math.abs(c.vy) > 1.2) c.vy *= -.35; else { c.settled = true; c.vy = 0; } }
    } else c.y = .18 + Math.abs(Math.sin(perf * 2.5 + c.ph)) * .06;
    c.m.position.set(c.x, c.y, c.z);
  }
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
const K = { u: 25, v: 29.5, hp: 20, max: 20, spd: 9, face: 0, atkCd: 0, mesh: null };
const kingGlow = ART.glow('#FFC98A', 4.5, 0, .5);
kingGlow.position.set(0, 1.6, 0);
/* the king's arsenal — chosen on the menu, sworn for the run */
const WEAPONS = {
  spear:  { name: 'Spear',       dmg: 2, rate: .55,  reach: 2.4, icon: '🗡', q: 'Spear Throw · Q', qcd: 6 },
  bow:    { name: 'Longbow',     dmg: 1, rate: .5,   reach: 9,   icon: '🏹', q: 'Arrow Storm · Q', qcd: 8, ranged: true },
  hammer: { name: 'Warhammer',   dmg: 5, rate: 1.15, reach: 2.2, icon: '🔨', q: 'Ground Slam · Q', qcd: 8, splash: 1.7 },
  frost:  { name: 'Frost Staff', dmg: 1, rate: .6,   reach: 8.5, icon: '❄', q: 'Blizzard · Q',    qcd: 12, ranged: true, chill: true },
};
/* the riders — each defends Nordfels in their own way */
const CHARS = {
  aldric:   { name: 'King Aldric', icon: '👑', hp: 20, spd: 9 },
  maren:    { name: 'Lady Maren',  icon: '🦅', hp: 14, spd: 10.5, falcon: true },
  grimbold: { name: 'Grimbold',    icon: '🛡', hp: 28, spd: 7.5, aura: 6 },
};
S.weapon = 'spear'; S.char = 'aldric';
try { if (localStorage.tf_weapon in WEAPONS) S.weapon = localStorage.tf_weapon; } catch { /* private mode */ }
try { if (localStorage.tf_char in CHARS) S.char = localStorage.tf_char; } catch { /* private mode */ }
function refreshKingHUD() {
  const C = CHARS[S.char], W = WEAPONS[S.weapon];
  $('#kingName').textContent = C.name;
  $('#kingIcon').textContent = C.icon;
  $('#portrait').textContent = C.icon;
  $('#kingTitle').textContent = C.name + ' · ' + W.name;
  $('#kingWeap').textContent = W.name + ' · Lv 3';
  $('#abQIc').textContent = W.icon;
  $('#abSpear').title = W.q;
}
function setWeapon(w) {
  if (!WEAPONS[w] || (w === 'frost' && !META.owned.frost)) w = 'spear';
  S.weapon = w;
  try { localStorage.tf_weapon = w; } catch { /* private mode */ }
  const props = K.mesh.userData.weapons;
  for (const key in props) props[key].visible = key === w;
  $$('.wcard').forEach(c => c.classList.toggle('on', c.dataset.w === w));
  refreshKingHUD();
}
function setChar(c) {
  if (!CHARS[c]) c = 'aldric';
  S.char = c;
  try { localStorage.tf_char = c; } catch { /* private mode */ }
  if (K.mesh) scene.remove(K.mesh);
  K.mesh = ART.kingArt(c);
  K.mesh.position.set(K.u, 0, K.v);
  K.mesh.add(kingGlow);
  scene.add(K.mesh);
  K.max = CHARS[c].hp; K.hp = K.max; K.spd = CHARS[c].spd;
  $$('.ccard').forEach(x => x.classList.toggle('on', x.dataset.c === c));
  setWeapon(S.weapon); // re-hang the chosen weapon on the new rider
}
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
    const bu = (MAP.bounds || {}).u || [1.5, 48.5], bv = (MAP.bounds || {}).v || [1.5, 48.5];
    K.u = Math.max(bu[0], Math.min(bu[1], K.u + dx * K.spd * dt));
    K.v = Math.max(bv[0], Math.min(bv[1], K.v + dz * K.spd * dt));
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
  const fal = K.mesh.userData.falcon;
  if (fal) { // Maren's falcon rides her wake
    const a = perf * 2.4;
    fal.position.set(Math.cos(a) * 1.5, 2.3 + Math.sin(perf * 5) * .15, Math.sin(a) * 1.5);
    fal.rotation.y = -a;
  }
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
  if (b.type === 'house') return !b.upg ? { label: 'Second Storey', cost: 2 } : !b.upg2 ? { label: 'Manor', cost: 3 } : null;
  if (b.type === 'tower') return !b.upg ? { label: 'Choose a spire', cost: 3 } : !b.upg2 ? { label: 'Masterwork Arms', cost: 4 } : null;
  if (b.type === 'harbour' && !b.upg) return { label: 'Big Docks', cost: 3 };
  if (b.type === 'wall' && !b.upg) return { label: 'Stone Bulwark', cost: 3 };
  if (b.type === 'mine' && !b.upg) return { label: 'Deep Shaft', cost: 4 };
  if (b.type === 'barracks' && !b.upg2) return { label: 'Veteran Company', cost: 4 };
  if (b.type === 'range' && !b.upg2) return { label: "Fletchers' Guild", cost: 4 };
  return null;
}
const CASTLE_TIERS = [null, { cost: 8, hp: 10, desc: '+10 castle HP · heavier arrows' },
  { cost: 14, hp: 10, desc: '+10 castle HP · rapid volleys' },
  { cost: 20, hp: 15, desc: '+15 castle HP · twin ballistae' }];
function castleMenu() {
  const tier = (S.castleLvl === 3 && !META.owned.bastion) ? null : CASTLE_TIERS[S.castleLvl];
  if (!tier) {
    openMenu(CASTLE_SLOT, 'Castle Center — Lv ' + S.castleLvl,
      `<div style="font-size:12px;opacity:.75;padding:2px 4px 4px">The keep stands at full strength. ${S.castleMax} HP.${S.castleLvl === 3 && !META.owned.bastion ? ' The Royal Bastion tier awaits in the Armory.' : ''}</div>`);
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
const UPG_DESCS = {
  'Second Storey': '+2 gold at dawn instead of +1', 'Manor': '+3 gold at dawn — a lord in residence',
  'Big Docks': 'Each boat pays 2 gold', 'Stone Bulwark': 'Stone over timber — nearly twice the HP',
  'Deep Shaft': 'The gold vein decays half as fast', 'Veteran Company': 'One more soldier, and all of them tougher',
  "Fletchers' Guild": 'One more archer at the range', 'Masterwork Arms': '+1 damage to every shot from this tower',
};
function slotAction(sl) {
  if (S.phaseName !== 'day' || S.view !== 'game') return;
  if (sl.castle) { castleMenu(); return; }
  const b = S.builds[sl.id];
  if (!b) { tryBuild(sl); return; }
  if (b.type === 'tower' && !b.upg)
    openMenu(sl, 'Choose a spire',
      opt('data-u="sniper"', '🎯', "Sniper's Perch", '+range, +damage', 3, S.gold >= 3) +
      opt('data-u="archer"', '🏹', "Archer's Spire", 'Shoots twice as fast', 3, S.gold >= 3) +
      opt('data-u="frost"', '❄', 'Frost Spire', 'Arrows chill the horde to a crawl', 3, S.gold >= 3));
  else {
    const up = upgradable(sl);
    if (!up) {
      openMenu(sl, BTYPES[b.type].name,
        `<div style="font-size:12px;opacity:.75;padding:2px 4px 4px">${BTYPES[b.type].desc}. Standing strong.</div>`);
      return;
    }
    openMenu(sl, 'Upgrade ' + BTYPES[b.type].name,
      opt('data-u="tier"', BTYPES[b.type].icon, up.label, UPG_DESCS[up.label] || '', up.cost, S.gold >= up.cost));
  }
  bmenu.querySelectorAll('[data-u]').forEach(btn => btn.addEventListener('click', () => {
    const u = btn.dataset.u;
    const spire = u === 'sniper' || u === 'archer' || u === 'frost';
    const cost = spire ? 3 : (upgradable(sl) || {}).cost;
    if (cost == null || S.gold < cost) return;
    S.gold -= cost;
    if (spire) b.upg = u;
    else if (!b.upg && b.type !== 'barracks' && b.type !== 'range') b.upg = true;
    else b.upg2 = true;
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
  collectAllCoins(); // leftover taxes sweep themselves into the purse at dusk
  refreshGold();
  const queue = nightPlan(S.day);
  if (S.day >= 3) queue.splice(Math.ceil(queue.length * .55), 0, { lull: true });
  if (S.day % 5 === 0) queue.push({ type: 'boss', lane: MAP.laneIds[S.day % MAP.laneIds.length] });
  N = { queue, total: queue.filter(x => !x.lull).length, spawned: 0, killed: 0, enemies: [], units: [], towers: [], walls: [], boss: null,
    spawnEvery: Math.max(.35, 1.05 - S.day * .07), spawnT: .6, kingCd: 0, abQ: 0, abE: 0, hornUntil: 0, t: 0, over: false };
  for (const sl of SLOTS) {
    const b = S.builds[sl.id]; if (!b) continue;
    if (b.type === 'tower') N.towers.push({ u: sl.u, v: sl.v, z: sl.holder.children[0]?.userData.z || 4, cd: .4 + Math.random() * .4, spec: towerSpec(b) });
    if (b.type === 'barracks') {
      const offs = [[.3,-3.2],[-1.3,-2.4],[1.7,-2.5],[.3,-1.6]];
      if (b.upg2) offs.push([-.7,-3.4]); // the veteran company musters five
      for (const o of offs) spawnUnit(sl.u + o[0], sl.v + o[1], b.kind || 'knight', b.upg2 ? 1 : 0);
    }
    if (b.type === 'range') {
      const offs = [[.2,2.6],[-1.4,2],[1.6,2.1]];
      if (b.upg2) offs.push([.1,3.4]);
      for (const o of offs) spawnUnit(sl.u + o[0], sl.v + o[1], b.kind || 'longbow', 0);
    }
    if (b.type === 'wall') { // repaired overnight, manned at dusk
      sl.holder.scale.y = 1;
      const hp = (b.upg ? 22 : 12) + (hasPerk('masonry') ? 8 : 0);
      N.walls.push({ sl, lane: sl.wall.lane, d: sl.wall.d, u: sl.u, v: sl.v, hp, max: hp, broken: false, hpEl: null });
    }
  }
  if (hasPerk('beacons')) N.towers.forEach(t => { t.spec = { ...t.spec, range: t.spec.range * 1.15 }; });
  N.towers.push({ u: 25, v: 24, z: 9.5, cd: .8, castle: true,
    spec: { range: 11, rate: S.castleLvl >= 4 ? .5 : S.castleLvl >= 3 ? .7 : 1.1, dmg: S.castleLvl >= 4 ? 4 : S.castleLvl >= 2 ? 3 : 2 } });
  N.serpentAt = (MAP.serpent && S.serpent && !S.serpent.slain && S.day >= 4) ? 8 + Math.random() * 10 : 0;
  N.serp = null;
  $('#serpWrap').style.display = 'none';
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
  const specs = { knight: { range: 1.9, rate: .7, dmg: 1, hp: 7 }, berserk: { range: 1.9, rate: .8, dmg: 2, hp: 5 },
    longbow: { range: 13, rate: 1.15, dmg: 1, hp: 3 }, fire: { range: 9, rate: 1.2, dmg: 1, splash: 1.7, hp: 3 } };
  const sp = { ...specs[kind] };
  if (hasPerk('discipline')) { sp.hp += 2; sp.rate *= .85; }
  sp.hp += arguments[3] || 0; // veteran bonus
  const mesh = kind === 'knight' || kind === 'berserk' ? ART.knightArt(kind) : ART.archerArt(kind);
  mesh.position.set(u, 0, v); mesh.rotation.y = Math.random() * 6; scene.add(mesh);
  N.units.push({ u, v, pu: u, pv: v, kind, cd: .3 + Math.random() * .5, ...sp, max: sp.hp,
    mesh, dead: false, hpEl: null, tgt: null, bob: Math.random() * 9, fo: Math.random() * Math.PI * 2, fr: 1.5 + Math.random() * 1.3, pop: 1 });
}
function hurtUnit(un, dmg) {
  if (un.dead) return;
  if (CHARS[S.char].aura && !K.down && Math.hypot(un.u - K.u, un.v - K.v) < CHARS[S.char].aura)
    dmg = Math.max(1, dmg - 1); // Grimbold's shadow shelters his soldiers
  un.hp -= dmg;
  dmgNum(un.u, 1.6, un.v, dmg);
  if (!un.hpEl) un.hpEl = ehpPool.take();
  if (un.hpEl) un.hpEl.firstChild.style.width = Math.max(0, 100 * un.hp / un.max) + '%';
  if (un.hp <= 0) {
    un.dead = true;
    poof(un.u, .7, un.v);
    sfx.kill(false);
    fxAdd({ kind: 'die', mesh: un.mesh, t: 0, dur: .34 });
    if (un.hpEl) ehpPool.release(un.hpEl);
    if (!N._lost) { N._lost = true; flashBanner('A SOLDIER HAS FALLEN — MORE MUSTER AT DAWN'); }
  }
}
function spawnEnemy(spec) {
  const isBoss = spec.type === 'boss';
  const T = isBoss ? MAP.boss : ETYPES[spec.type];
  const lane = LANES[spec.lane];
  const mesh = isBoss ? ART.bossArt(MAP.boss.kind) : ART.enemyArt(spec.type);
  scene.add(mesh);
  const hpScale = 1 + Math.max(0, S.day - 3) * .18; // endless nights harden the horde
  const e = { type: spec.type, laneId: spec.lane, lane, d: 0, hp: Math.round(T.hp * hpScale), max: Math.round(T.hp * hpScale),
    speed: T.speed, dmg: T.dmg, rate: T.rate, ranged: T.ranged || 0,
    atkCd: .8, fly: T.fly, mesh, dead: false, ph: Math.random() * 9, hpEl: null, kCd: .5, uCd: .7, pop: 1, flinch: 0,
    boss: isBoss, brood: isBoss ? (T.brood || 0) : 0, broodT: 4 };
  N.enemies.push(e); N.spawned++;
  if (isBoss) {
    N.boss = e;
    $('#bossWrap').style.display = 'block';
    $('#bossName').textContent = MAP.boss.name;
    $('#bossFill').style.width = '100%';
    flashBanner(MAP.boss.name + ' EMERGES');
    sfx.night();
  }
  if (spec.type === 'ogre') flashBanner('AN OGRE APPROACHES');
  if (spec.type === 'spitter' && !N._spitSeen) { N._spitSeen = true; flashBanner('SPITTERS LOB FILTH FROM AFAR'); }
  if (spec.type === 'shade' && !N._shadeSeen) { N._shadeSeen = true; flashBanner('SHADES DRIFT OVER WALL AND BLADE'); }
  if (spec.type === 'chief' && !N._chiefSeen) { N._chiefSeen = true; flashBanner('A WAR CHIEF DRIVES THE HORDE'); }
}
function epos(e) { return e.lane.at(e.d); }

/* ---- the secret of the second map: the Leviathan itself surfaces off the coast,
   on its own clock, lobbing brine at the keep until it dives again. Its wounds
   carry over night to night — slay it across nights for a royal bounty. ---- */
const SERP = { u: 40, v: 46 };
function spawnSerpent() {
  const mesh = ART.serpentArt();
  mesh.position.set(SERP.u, -8.5, SERP.v);
  mesh.lookAt(25, -8.5, 24);
  scene.add(mesh);
  const e = { type: 'serpent', serpent: true, laneId: 'S', lane: { at: () => ({ u: SERP.u, v: SERP.v }), total: 0 },
    d: 0, hp: S.serpent.hp, max: S.serpent.max, speed: 0, dmg: 2, rate: 2.6, ranged: 8,
    atkCd: 3, fly: false, mesh, dead: false, ph: 0, hpEl: null, kCd: .5, uCd: .7, pop: 0, flinch: 0,
    boss: false, brood: 0, rise: 0, leaveAt: N.t + 26 };
  N.enemies.push(e); // NOTE: not part of the wave count — a visitation, not an invader
  $('#serpWrap').style.display = 'block';
  $('#serpFill').style.width = (100 * e.hp / e.max) + '%';
  flashBanner('THE LEVIATHAN RISES FROM THE DEEP');
  sfx.roar();
  if (S.settings.shake && !matchMedia('(prefers-reduced-motion: reduce)').matches) shakeT = .4;
  for (let i = 0; i < 4; i++) poof(SERP.u + (Math.random() - .5) * 4, .2, SERP.v + (Math.random() - .5) * 3, true);
  return e;
}
function serpentTick(e, dt) {
  if (!e.leaving && N.t > e.leaveAt) {
    e.leaving = true;
    $('#serpWrap').style.display = 'none';
    poof(SERP.u, .5, SERP.v, true);
  }
  if (e.leaving) { // slips back beneath the waves, keeping its wounds
    e.mesh.position.y -= 5 * dt;
    if (e.mesh.position.y < -8.5) { S.serpent.hp = e.hp; e.dead = true; scene.remove(e.mesh); }
    return;
  }
  e.rise = Math.min(1, e.rise + dt / 1.8);
  const k = 1 - Math.pow(1 - e.rise, 3);
  e.mesh.position.y = -8.5 + 8.5 * k + (e.rise >= 1 ? Math.sin(N.t * 1.3) * .35 : 0);
  const h = e.mesh.userData.head, coils = e.mesh.userData.coils;
  h.rotation.y = Math.sin(N.t * .9) * .35;
  h.position.y = 3.4 + Math.sin(N.t * 1.7) * .25;
  coils[0].position.y = Math.sin(N.t * 1.3 + 1.2) * .4;
  coils[1].position.y = Math.sin(N.t * 1.3 + 2.4) * .35;
  if (e.flinch > 0) { e.flinch = Math.max(0, e.flinch - dt * 5); const s = e.flinch * .08; e.mesh.scale.set(1 + s, 1 - s, 1 + s); }
}
const ehpPool = domPool(30, 'ehp');
function hurt(e, dmg, kb = 0) {
  if (e.dead) return;
  if (e.serpent) { // the titan keeps its own ledger
    if (e.leaving) return;
    e.hp -= dmg; e.flinch = 1;
    dmgNum(SERP.u, 5, SERP.v, dmg);
    sfx.hit();
    $('#serpFill').style.width = Math.max(0, 100 * e.hp / e.max) + '%';
    if (e.hp <= 0) {
      e.dead = true;
      S.serpent.hp = 0; S.serpent.slain = true;
      $('#serpWrap').style.display = 'none';
      poof(SERP.u, 1, SERP.v, true); poof(SERP.u, 3.5, SERP.v, true);
      sfx.kill(true);
      dropCoins(38.5, 43.5, 12); // its hoard washes ashore
      earnCrowns(5);
      fxAdd({ kind: 'die', mesh: e.mesh, t: 0, dur: .5 });
      flashBanner('THE LEVIATHAN IS SLAIN — ITS HOARD WASHES ASHORE');
    }
    return;
  }
  e.hp -= dmg;
  if (kb) e.d = Math.max(0, e.d - kb * (e.boss ? .3 : 1));
  const p = epos(e);
  dmgNum(p.u, e.fly ? 2.6 : 1.4, p.v, dmg);
  if (e.boss) $('#bossFill').style.width = Math.max(0, 100 * e.hp / e.max) + '%';
  else {
    if (!e.hpEl) e.hpEl = ehpPool.take();
    if (e.hpEl) e.hpEl.firstChild.style.width = Math.max(0, 100 * e.hp / e.max) + '%';
  }
  if (e.hp <= 0) {
    e.dead = true; N.killed++;
    const big = e.boss || e.type === 'ogre' || e.type === 'barrel';
    poof(p.u, e.fly ? 1.7 : .5, p.v, big);
    sfx.kill(big);
    if (e.boss) { $('#bossWrap').style.display = 'none'; N.boss = null; dropCoins(p.u, p.v, 6); flashBanner(MAP.boss.name + ' IS SLAIN'); }
    else if (e.type === 'barrel') dropCoins(p.u, p.v, 1);   // the heavies carry loot
    else if (e.type === 'ogre') dropCoins(p.u, p.v, 2);
    else if (hasPerk('loot') && Math.random() < .25) dropCoins(p.u, p.v, 1);
    fxAdd({ kind: 'die', mesh: e.mesh, t: 0, dur: .34, fly: e.fly }); // removed from the scene when the squash ends
    if (e.hpEl) ehpPool.release(e.hpEl);
    $('#remainNum').textContent = N.total - N.killed;
    setClock('#clockNight', N.killed / N.total);
  } else { e.flinch = 1; sfx.hit(); }
}
function hurtWall(w, dmg) {
  if (w.broken) return;
  w.hp -= dmg;
  dmgNum(w.u, 2.1, w.v, dmg);
  sfx.hit();
  if (!w.hpEl) w.hpEl = ehpPool.take();
  if (w.hpEl) w.hpEl.firstChild.style.width = Math.max(0, 100 * w.hp / w.max) + '%';
  if (w.hp <= 0) {
    w.broken = true;
    poof(w.u, 1, w.v, true);
    sfx.castleHit();
    w.sl.holder.scale.y = .16; // battered to rubble until dawn
    if (w.hpEl) { ehpPool.release(w.hpEl); w.hpEl = null; }
    flashBanner('THE WALL IS BREACHED');
  }
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
  if (N.spawnT <= 0 && N.queue.length) {
    const nx = N.queue.shift();
    if (nx.lull) { N.spawnT = 4.5; flashBanner('THE SECOND WAVE GATHERS'); sfx.night(); }
    else { N.spawnT = N.spawnEvery; spawnEnemy(nx); }
  }
  if (N.serpentAt && !N.serp && N.t >= N.serpentAt) N.serp = spawnSerpent();
  const chiefPos = N.enemies.some(e => !e.dead && e.type === 'chief')
    ? N.enemies.filter(e => !e.dead && e.type === 'chief').map(e => epos(e)) : null;
  for (const e of N.enemies) {
    if (e.dead) continue;
    if (e.serpent) {
      serpentTick(e, dt);
      if (e.rise < 1 || e.leaving) continue; // silent while rising or diving
    }
    if (e.slowT > 0) e.slowT -= dt;
    if (e.stunT > 0) { e.stunT -= dt; continue; } // frozen solid mid-stride
    if (e.brood) { // the Broodmother calls waspings out of the dark
      e.broodT -= dt;
      if (e.broodT <= 0) {
        e.broodT = e.brood; N.total++;
        spawnEnemy({ type: 'wasp', lane: e.laneId });
        $('#remainNum').textContent = N.total - N.killed;
      }
    }
    /* the march may be blocked by a wall (fliers soar over) or a soldier in the road */
    let stop = e.lane.total - e.ranged, wall = null;
    if (!e.fly) for (const w of N.walls) {
      if (!w.broken && w.lane === e.laneId && w.d - .8 > e.d - .01 && w.d - .8 < stop) { stop = w.d - .8; wall = w; }
    }
    let foe = null;
    if (!e.fly) {
      const p0 = epos(e);
      let bd = 1.3;
      for (const un of N.units) {
        if (un.dead) continue;
        const d = Math.hypot(un.u - p0.u, un.v - p0.v);
        if (d < bd) { bd = d; foe = un; }
      }
    }
    if (foe) {
      e.uCd -= dt;
      if (e.uCd <= 0) { e.uCd = e.rate; hurtUnit(foe, e.dmg); }
    } else if (e.d < stop) {
      e.uCd = .7;
      let mult = e.slowT > 0 ? .6 : 1;
      if (chiefPos && e.type !== 'chief') { // the war chief's drums quicken the march
        const pp = epos(e);
        if (chiefPos.some(c => Math.hypot(c.u - pp.u, c.v - pp.v) < 5)) mult *= 1.3;
      }
      e.d = Math.min(stop, e.d + e.speed * mult * dt);
    }
    else if (wall) {
      e.atkCd -= dt;
      if (e.atkCd <= 0) { e.atkCd = e.rate; hurtWall(wall, e.dmg); }
    } else {
      e.atkCd -= dt;
      if (e.atkCd <= 0) {
        e.atkCd = e.rate;
        if (e.ranged) { // spitters lob filth; the Leviathan lobs brine
          const sp = epos(e);
          arrow(new THREE.Vector3(sp.u, e.serpent ? 4.4 : 1, sp.v), new THREE.Vector3(25, 2, 24.8), 3, () => hurtCastle(e.dmg), e.serpent);
        } else hurtCastle(e.dmg);
      }
    }
    if (e.serpent) continue; // its body is animated by serpentTick, not the lane
    const p = epos(e), q = e.lane.at(e.d + .5);
    e.mesh.position.set(p.u, 0, p.v);
    if (foe && !foe.dead) e.mesh.lookAt(foe.u, 0, foe.v); else e.mesh.lookAt(q.u, 0, q.v);
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
      else body.position.y = 1 + Math.sin(N.t * 3 + e.ph) * .22; // shades hover
    } else body.rotation.z = Math.sin(N.t * 7 + e.ph) * .07;
    /* brawlers turn on the king when he rides into them */
    if (!e.fly && !K.down && Math.hypot(p.u - K.u, p.v - K.v) < 1.35) {
      e.kCd -= dt;
      if (e.kCd <= 0) { e.kCd = e.rate; hurtKing(e.dmg); }
    }
    if (e.hpEl) anchor(e.hpEl, p.u, e.fly ? 2.9 : 1.8, p.v);
  }
  N.enemies = N.enemies.filter(e => !e.dead);
  for (const w of N.walls) if (w.hpEl && !w.broken) anchor(w.hpEl, w.u, 2.8, w.v);
  for (const t of N.towers) {
    t.cd -= dt;
    if (t.cd <= 0) {
      const e = nearestEnemy(t.u, t.v, t.spec.range);
      if (e) { t.cd = t.spec.rate; const p = epos(e);
        arrow(new THREE.Vector3(t.u, t.z, t.v), new THREE.Vector3(p.u, e.fly ? 1.7 : .6, p.v), 2.2,
          () => { hurt(e, t.spec.dmg); if (t.spec.chill) e.slowT = t.spec.chill; }); }
      else t.cd = .12;
    }
  }
  const charge = S.stance === 'charge', follow = S.stance === 'follow';
  for (const un of N.units) {
    if (un.dead) continue;
    un.cd -= dt;
    if (un.pop > 0) { // muster pop
      un.pop = Math.max(0, un.pop - dt * 2.5);
      const k = 1 - un.pop;
      un.mesh.scale.setScalar(k * (1 + Math.sin(k * Math.PI) * .3) + .001);
    }
    /* orders: Follow rings the king; Charge locks a hunt target anywhere on the field —
       melee runs it down, archers advance into firing positions; Hold returns to the post.
       Leaving Follow plants a new post wherever each soldier stands — that is how you re-station troops. */
    let tx = null, tz = null, sp = 0, stopAt = .3;
    if (follow) {
      /* riding close recruits a soldier into the king's retinue */
      if (!un.following && !K.down && Math.hypot(un.u - K.u, un.v - K.v) < 4) { un.following = true; poof(un.u, .9, un.v); }
      if (un.following && !K.down) { tx = K.u + Math.cos(un.fo) * un.fr; tz = K.v + Math.sin(un.fo) * un.fr; sp = 8.5; }
    } else if (charge) {
      if (!un.tgt || un.tgt.dead) un.tgt = nearestEnemy(un.u, un.v, 999);
      if (un.tgt) {
        const p = epos(un.tgt), d = Math.hypot(p.u - un.u, p.v - un.v);
        stopAt = un.range < 4 ? un.range * .85 : un.range * .82;
        if (d > stopAt) { tx = p.u; tz = p.v; sp = un.range < 4 ? 5 : 4.4; }
      }
    }
    /* anyone without an active order drifts back to his post */
    if (tx === null && !charge && !un.following && Math.hypot(un.pu - un.u, un.pv - un.v) > .4) { tx = un.pu; tz = un.pv; sp = 4.2; }
    if (!charge) un.tgt = null;
    let walking = false;
    if (tx !== null) {
      const dx = tx - un.u, dz = tz - un.v, d = Math.hypot(dx, dz);
      if (d > stopAt) {
        const mv = Math.min(d, sp * dt);
        const bu = (MAP.bounds || {}).u || [1.5, 48.5], bv = (MAP.bounds || {}).v || [1.5, 48.5];
        un.u = Math.max(bu[0], Math.min(bu[1], un.u + dx / d * mv));
        un.v = Math.max(bv[0], Math.min(bv[1], un.v + dz / d * mv));
        un.mesh.lookAt(tx, 0, tz);
        walking = true;
      }
    }
    un.mesh.position.x = un.u; un.mesh.position.z = un.v;
    un.mesh.position.y = Math.abs(Math.sin(N.t * (walking ? 9 : 5) + un.bob)) * (walking ? .12 : .05);
    if (un.cd <= 0) {
      let e = charge && un.tgt && !un.tgt.dead ? un.tgt : null;
      if (e) { const pt = epos(e); if (Math.hypot(pt.u - un.u, pt.v - un.v) > un.range * 1.1) e = null; }
      if (!e) e = nearestEnemy(un.u, un.v, un.range * (charge ? 1.5 : 1));
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
    if (un.hpEl) anchor(un.hpEl, un.u, 2.2, un.v);
  }
  N.units = N.units.filter(u => !u.dead);
  N.kingCd -= dt;
  const horn = N.t < N.hornUntil;
  if (N.kingCd <= 0 && !K.down) {
    const W = WEAPONS[S.weapon];
    const e = nearestEnemy(K.u, K.v, W.reach);
    if (e) {
      N.kingCd = W.rate * (horn ? .62 : 1);
      const p = epos(e);
      if (W.ranged) arrow(new THREE.Vector3(K.u, 2, K.v), new THREE.Vector3(p.u, e.fly ? 1.7 : .6, p.v), 1.3,
        () => { hurt(e, W.dmg, .2); if (W.chill) e.slowT = 2; });
      else {
        hurt(e, W.dmg, W.splash ? .7 : .45); poof(p.u, .9, p.v, !!W.splash);
        if (W.splash) for (const o of [...N.enemies]) {
          const q2 = epos(o);
          if (o !== e && !o.dead && Math.hypot(q2.u - p.u, q2.v - p.v) < W.splash) hurt(o, 3, .4);
        }
      }
    } else N.kingCd = .1;
  }
  if (CHARS[S.char].falcon && !K.down) { // Maren's falcon strikes at fliers
    N.falconCd = (N.falconCd ?? 0) - dt;
    if (N.falconCd <= 0) {
      let best = null, bd = 6.5;
      for (const x of N.enemies) {
        if (x.dead || !x.fly) continue;
        const p2 = epos(x), d2 = Math.hypot(p2.u - K.u, p2.v - K.v);
        if (d2 < bd) { bd = d2; best = x; }
      }
      if (best) { N.falconCd = .9; const p2 = epos(best); hurt(best, 1); poof(p2.u, 2.4, p2.v); }
      else N.falconCd = .15;
    }
  }
  N.abQ = Math.max(0, N.abQ - dt); N.abE = Math.max(0, N.abE - dt);
  updAb('#abSpear', '#abSpearCd', N.abQ, WEAPONS[S.weapon].qcd);
  updAb('#abHorn', '#abHornCd', N.abE, 14);
  if (!N.queue.length && N.spawned === N.total && N.killed === N.total && !N.over) endNight(true);
}
function updAb(bsel, csel, cd, max) {
  $(csel).style.setProperty('--cd', (cd / max * 100).toFixed(1));
  $(bsel).classList.toggle('ready', cd <= 0);
}
function useQ() {
  if (!N || N.over || N.abQ > 0 || K.down) return;
  const W = WEAPONS[S.weapon];
  if (S.weapon === 'frost') { // blizzard — the whole field freezes mid-stride
    if (!N.enemies.some(e => !e.dead && !e.serpent)) { flashBanner('NO TARGET IN RANGE'); return; }
    N.abQ = W.qcd;
    sfx.freeze();
    N.enemies.forEach(e => {
      if (e.dead || e.serpent) return;
      e.stunT = 2.5; e.slowT = Math.max(e.slowT || 0, 4.5);
      const p = epos(e); poof(p.u, .6, p.v);
    });
    flashBanner('BLIZZARD!');
    return;
  }
  if (S.weapon === 'hammer') { // ground slam — everything nearby is crushed and thrown back
    const hits = N.enemies.filter(e => { if (e.dead || e.fly) return false; const p = epos(e); return Math.hypot(p.u - K.u, p.v - K.v) < 4.2; });
    if (!hits.length) { flashBanner('NO TARGET IN RANGE'); return; }
    N.abQ = W.qcd;
    sfx.slam();
    if (S.settings.shake && !matchMedia('(prefers-reduced-motion: reduce)').matches) shakeT = .3;
    poof(K.u, .5, K.v, true);
    hits.forEach(e => hurt(e, 6, 2.2));
    return;
  }
  if (S.weapon === 'bow') { // arrow storm — five shafts rain on the nearest enemies
    const es = N.enemies.filter(e => { if (e.dead) return false; const p = epos(e); return Math.hypot(p.u - K.u, p.v - K.v) < 12; })
      .sort((a, b) => { const pa = epos(a), pb = epos(b);
        return Math.hypot(pa.u - K.u, pa.v - K.v) - Math.hypot(pb.u - K.u, pb.v - K.v); })
      .slice(0, 5);
    if (!es.length) { flashBanner('NO TARGET IN RANGE'); return; }
    N.abQ = W.qcd;
    sfx.spear();
    es.forEach((e, i) => { const p = epos(e);
      arrow(new THREE.Vector3(K.u, 2.4, K.v), new THREE.Vector3(p.u, e.fly ? 1.7 : .7, p.v), 2.5 + i * .3,
        () => { hurt(e, 4, .4); poof(p.u, .9, p.v); }, i === 0); });
    return;
  }
  const e = nearestEnemy(K.u, K.v, 10); // spear throw
  if (!e) { flashBanner('NO TARGET IN RANGE'); return; }
  N.abQ = W.qcd;
  sfx.spear();
  const p = epos(e);
  arrow(new THREE.Vector3(K.u, 2.2, K.v), new THREE.Vector3(p.u, e.fly ? 1.7 : .7, p.v), 1.2,
    () => { hurt(e, 8, .8); poof(p.u, 1, p.v, true); }, true);
}
function useHorn() {
  if (!N || N.over || N.abE > 0) return;
  N.abE = 14; N.hornUntil = N.t + (hasPerk('warhorn') ? 10 : 6);
  if (hasPerk('warhorn')) K.hp = Math.min(K.max, K.hp + 6);
  sfx.horn();
  flashBanner('RALLY! THE KING FIGHTS HARDER');
}
$('#abSpear').addEventListener('click', useQ);
$('#abHorn').addEventListener('click', useHorn);
function cleanupNight() {
  if (!N) return;
  N.enemies.forEach(e => { if (!e.dead) { scene.remove(e.mesh); if (e.hpEl) ehpPool.release(e.hpEl); } });
  N.units.forEach(u => { scene.remove(u.mesh); if (u.hpEl) ehpPool.release(u.hpEl); });
  N.walls.forEach(w => { if (w.hpEl) ehpPool.release(w.hpEl); });
  if (N.serp && !N.serp.dead) S.serpent.hp = N.serp.hp; // it remembers its wounds
  $('#bossWrap').style.display = 'none';
  $('#serpWrap').style.display = 'none';
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
      try { const b = +localStorage.tf_best || 0; if (S.day > b) localStorage.tf_best = S.day; } catch { /* private mode */ }
      refreshMapCards();
      const dr = dawnRows(), flaw = integ === 100 ? 2 : 0;
      $('#vicSub').textContent = S.day % 5 === 0
        ? `Night ${S.day} survived. The kingdom endures — the horde grows bolder.`
        : `The kingdom stands. Night ${S.day} survived.`;
      const crowns = S.day % 5 === 0 ? 2 : 1;
      earnCrowns(crowns);
      let rows = `<div class="row"><span>Enemies slain</span><b>${slain}</b></div>
        <div class="row"><span>Castle integrity</span><b>${integ}%</b></div>
        <div class="row"><span>Crowns for the armory</span><b>+${crowns} ⚜</b></div>`;
      for (const r of dr.rows) rows += `<div class="row"><span>${r.l}</span><b>+${r.n}</b></div>`;
      if (flaw) rows += `<div class="row"><span>Flawless defense bonus</span><b>+2</b></div>`;
      rows += `<div class="row"><span><b style="color:#F6F2E8">Taxes to collect at dawn</b></span><b>+${dr.total + flaw}</b></div>`;
      $('#vicTally').innerHTML = rows;
      $('#vicNext').textContent = 'CONTINUE TO DAY ' + (S.day + 1);
      $('#ovVictory').style.display = 'grid';
      N._flaw = flaw;
    } else {
      $('#defNights').textContent = String(S.day - 1);
      $('#ovDefeat').style.display = 'grid';
    }
  }, win ? 650 : 250);
}
$('#vicNext').addEventListener('click', () => {
  $('#ovVictory').style.display = 'none';
  sfx.dawn();
  /* taxes fall in the streets — the king rides to collect them (income computed before mines age) */
  const drops = [[25, 27.8, 1 + (N._flaw || 0)]];
  for (const sl of SLOTS) {
    const b = S.builds[sl.id]; if (!b) continue;
    let v = 0;
    if (b.type === 'house') v = b.upg2 ? 3 : b.upg ? 2 : 1;
    else if (b.type === 'field' || b.type === 'mill') v = 1;
    else if (b.type === 'mine') v = Math.max(0, 6 - (b.upg ? Math.floor(b.age / 2) : b.age));
    else if (b.type === 'harbour') v = Math.min(5, b.boats + 1) * (b.upg ? 2 : 1);
    if (v) drops.push([sl.u, sl.v, v]);
  }
  applyDawn(); S.day++; S.castleHP = S.castleMax;
  N = null; setPhase('day'); revealPlots(); refreshDayHUD();
  SLOTS.forEach(sl => { const b = S.builds[sl.id]; if (b && b.type === 'wall') sl.holder.scale.y = 1; }); // masons repair overnight
  for (const [u, v, val] of drops) dropCoins(u, v, val);
  flashHint('Dawn taxes lie in the streets — ride and collect, then build');
  if (S.day === 11 && !S._saga) { // ten nights weathered — the saga milestone
    S._saga = true;
    $('#clrTitle').textContent = 'THE SAGA OF ' + MAP.name.toUpperCase();
    $('#clrTally').innerHTML =
      `<div class="row"><span>Nights weathered</span><b>10</b></div>
       <div class="row"><span>Crowns in the armory</span><b>${META.crowns} ⚜</b></div>
       <div class="row"><span>The horde ahead</span><b>only grows bolder</b></div>`;
    $('#ovCleared').style.display = 'grid';
    sfx.victory();
  }
});
$('#defRetry').addEventListener('click', () => { $('#ovDefeat').style.display = 'none'; N = null; startNight(); });
$('#defMenu').addEventListener('click', () => { $('#ovDefeat').style.display = 'none'; N = null; resetRun(); setView('menu'); });
$('#clrGo').addEventListener('click', () => { $('#ovCleared').style.display = 'none'; }); // the saga continues
$('#clrMenu').addEventListener('click', () => { $('#ovCleared').style.display = 'none'; resetRun(); setView('menu'); });
const castleTrims = [];
function resetRun() {
  groundCoins.forEach(c => c.m.visible = false); groundCoins.length = 0;
  S.day = 1; S.gold = 8 + (hasPerk('pockets') ? 4 : 0); S.builds = {};
  S.castleLvl = 1; S.castleMax = 15 + (hasPerk('masonry') ? 8 : 0); S.castleHP = S.castleMax;
  S.serpent = MAP.serpent ? { hp: 80, max: 80, slain: false } : null;
  S._saga = false;
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
$('#playBtn').addEventListener('click', () => { resetRun(); setPhase('day'); setView('game'); refreshDayHUD(); });
function refreshMapCards() {
  let best = 0; try { best = +localStorage.tf_best || 0; } catch { /* private mode */ }
  const locked = best < (MAPS.leviathan.unlockBest || 0);
  const lc = $('.mcard[data-m="leviathan"]');
  lc.classList.toggle('locked', locked);
  $('#levLock').style.display = locked ? '' : 'none';
  $$('.mcard').forEach(c => c.classList.toggle('on', c.dataset.m === S.map));
}
$$('.mcard').forEach(c => c.addEventListener('click', () => {
  const id = c.dataset.m;
  if (id === S.map) return;
  let best = 0; try { best = +localStorage.tf_best || 0; } catch { /* private mode */ }
  if ((MAPS[id].unlockBest || 0) > best) { sfx.error(); return; }
  loadMap(id); refreshMapCards(); refreshDayHUD();
}));
$$('.pchip').forEach(c => c.addEventListener('click', () => togglePerk(c.dataset.p)));
$$('.pchip').forEach(c => c.classList.toggle('on', perkSet.has(c.dataset.p)));
$('#beginNight').addEventListener('click', startNight);
function anyOverlay() { return ['ovVictory', 'ovDefeat', 'ovCleared', 'ovPause', 'ovSettings', 'ovArmory'].some(id => $('#' + id).style.display === 'grid'); }
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
  if (key === 'tilt') $('#tilt').style.display = e.target.checked ? '' : 'none';
}); }
bindSet('#setDmg', 'dmg'); bindSet('#setRanges', 'ranges'); bindSet('#setShake', 'shake');
bindSet('#setMusic', 'music'); bindSet('#setSound', 'sound'); bindSet('#setTilt', 'tilt');
function syncSetUI() {
  $('#setDmg').checked = S.settings.dmg; $('#setRanges').checked = S.settings.ranges;
  $('#setShake').checked = S.settings.shake; $('#setMusic').checked = S.settings.music;
  $('#setSound').checked = S.settings.sound; $('#setTilt').checked = S.settings.tilt;
  $('#tilt').style.display = S.settings.tilt ? '' : 'none';
}
syncSetUI();
$$('.tchip').forEach(c => c.addEventListener('click', () => {
  const to = c.dataset.stance;
  if (S.stance === to) return;
  let joined = -1;
  if (N) {
    /* leaving Follow stations each follower where he stands */
    if (S.stance === 'follow')
      N.units.forEach(un => { if (un.following) { un.pu = un.u; un.pv = un.v; } un.following = false; });
    /* entering Follow gathers only the soldiers around the king — ride near others to add them */
    if (to === 'follow') {
      joined = 0;
      N.units.forEach(un => {
        un.following = !un.dead && Math.hypot(un.u - K.u, un.v - K.v) < 7;
        if (un.following) joined++;
      });
    }
  }
  S.stance = to;
  $$('.tchip').forEach(x => x.classList.toggle('on', x === c));
  if (N && !N.over) { // the order sounds and the company reacts at once
    N.units.forEach(un => { un.tgt = null; un.cd = Math.min(un.cd, .25); });
    sfx.command();
    flashBanner(to === 'charge' ? 'CHARGE!' : to === 'hold' ? 'HOLD THE LINE'
      : joined > 0 ? `TO ME! · ${joined} FALL IN` : 'TO ME! — RIDE NEAR SOLDIERS TO GATHER THEM');
  }
}));
document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys[k] = true; if (k.startsWith('arrow')) e.preventDefault(); return; }
  if (e.repeat) return;
  if (e.key === ' ' && S.view === 'game' && S.phaseName === 'day' && !anyOverlay()) { e.preventDefault(); startNight(); }
  else if (k === 'e' && S.view === 'game' && S.phaseName === 'day' && nearSlot && !anyOverlay())
    (nearSlot.castle || S.builds[nearSlot.id]) ? slotAction(nearSlot) : tryBuild(nearSlot);
  else if (k === 'q' && S.phaseName === 'night' && !anyOverlay()) useQ();
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
  const cnt = { A: 0, B: 0, C: 0 };
  let showPrev = false;
  if (S.view === 'game' && S.phaseName === 'day') { showPrev = true; nightPlan(S.day).forEach(e => cnt[e.lane]++); }
  else if (S.view === 'game' && N && !N.over) { showPrev = true; N.queue.forEach(e => { if (e.lane) cnt[e.lane]++; }); }
  for (const lid of ['A', 'B', 'C']) {
    const el = $('#prev' + lid);
    if (LANES[lid] && showPrev && cnt[lid]) {
      el.style.display = 'flex'; $('#prev' + lid + 'n').textContent = '×' + cnt[lid];
      anchor(el, LANES[lid].start[0], 3.6, LANES[lid].start[1]);
    } else el.style.display = 'none';
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
  const zoom = (1 + phase.t * .18) * ((MAP && MAP.camZoom) || 1);
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
  updateGroundCoins(dt);
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
window.__dbg = { S, K, keys, AUDIO, get N() { return N; }, get MAP() { return MAP; }, get coins() { return groundCoins.length; } };

/* ============================== boot & test scenarios ============================== */
try { setChar(S.char); } catch { setChar('aldric'); }
{
  let mapStart = 'nordfels';
  try {
    const m = localStorage.tf_map, best = +localStorage.tf_best || 0;
    if (MAPS[m] && (MAPS[m].unlockBest || 0) <= best) mapStart = m;
  } catch { /* private mode */ }
  loadMap(mapStart);
  refreshMapCards();
}
$$('.wcard').forEach(c => c.addEventListener('click', () => setWeapon(c.dataset.w)));
$$('.ccard').forEach(c => c.addEventListener('click', () => setChar(c.dataset.c)));
$('#armBtn').addEventListener('click', () => { refreshArmory(); $('#ovArmory').style.display = 'grid'; });
$('#armClose').addEventListener('click', () => { $('#ovArmory').style.display = 'none'; });
$$('.aitem button').forEach(b => b.addEventListener('click', () => buyItem(b.closest('.aitem').dataset.a)));
applyOwned();
refreshArmory();
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
