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
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
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
Object.assign(sun.shadow.camera, { left: -52, right: 52, top: 52, bottom: -52, near: 5, far: 220 });
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
const CASTLE_SLOT = { castle: true, id: 'castle', u: 25, v: 26.5 };

function place(obj, u, v, ry = 0, s = 1) { obj.position.set(u, 0, v); obj.rotation.y = ry; obj.scale.setScalar(s); mapGroup.add(obj); return obj; }
function gateAt(u, v) {
  const g = place(ART.gateTower(), u, v);
  addTorch(g.userData.torch.clone().add(g.position));
}

/* map mastery is per map: nights survived THERE unlock the next world */
let BESTS = {};
try { BESTS = JSON.parse(localStorage.tf_bests || '{}'); } catch { /* fresh device */ }
try { const legacy = +localStorage.tf_best || 0; if (legacy > (BESTS.nordfels || 0)) BESTS.nordfels = legacy; } catch { /* ok */ }
function saveBests() { try { localStorage.tf_bests = JSON.stringify(BESTS); } catch { /* private mode */ } }
function mapUnlocked(def) { const r = def.unlockAfter; return !r || (BESTS[r.map] || 0) >= r.nights; }
const BOSS_DEFS = {
  warlord:   { name: 'THE OGRE WARLORD', kind: 'warlord', hp: 55, speed: .55, dmg: 6, rate: 2.2 },
  brood:     { name: 'THE BROODMOTHER', kind: 'brood', hp: 45, speed: 1.05, dmg: 3, rate: 1.6, fly: true, brood: 5, broodType: 'bat' },
  skeleking: { name: 'THE SKELETON KING', kind: 'skeleking', hp: 60, speed: .6, dmg: 4, rate: 2, brood: 6, broodType: 'skeleton' },
  landship:  { name: 'THE LANDSHIP', kind: 'landship', hp: 70, speed: .5, dmg: 7, rate: 2.1 },
  acewing:   { name: 'THE ACE WING', kind: 'acewing', hp: 50, speed: 1.1, dmg: 3, rate: 1.5, fly: true, brood: 8 },
  starspawn: { name: 'THE STARSPAWN', kind: 'starspawn', hp: 65, speed: 1, dmg: 4, rate: 1.6, fly: true, brood: 7, broodType: 'moonling' },
  tyrantking:{ name: 'THE REGOLITH GIANT', kind: 'tyrantking', hp: 80, speed: .5, dmg: 7, rate: 2.2 },
  maw:       { name: 'THE MAW', kind: 'maw', hp: 75, speed: .6, dmg: 5, rate: 2 },
  jellyqueen:{ name: 'THE JELLY QUEEN', kind: 'jellyqueen', hp: 50, speed: 1.1, dmg: 3, rate: 1.5, fly: true, brood: 6, broodType: 'jelly' },
  yeti:      { name: 'THE YETI', kind: 'yeti', hp: 85, speed: .55, dmg: 6, rate: 2 },
  meg:       { name: 'THE MEGALODON', kind: 'meg', hp: 70, speed: .9, dmg: 5, rate: 1.8 },
  vinehorror:{ name: 'THE VINE HORROR', kind: 'vinehorror', hp: 70, speed: .5, dmg: 5, rate: 2, brood: 8, broodType: 'slime' },
  magmalord: { name: 'THE MAGMA LORD', kind: 'magmalord', hp: 90, speed: .5, dmg: 7, rate: 2.1 },
  wyrm:      { name: 'THE DUNE WYRM', kind: 'wyrm', hp: 80, speed: 1.2, dmg: 5, rate: 1.8 },
  roc:       { name: 'THE STORM ROC', kind: 'roc', hp: 70, speed: 1.2, dmg: 4, rate: 1.5, fly: true, brood: 7, broodType: 'sprite' },
};
const MAPS = {
  nordfels: {
    id: 'nordfels', name: 'Nordfels',
    laneIds: ['A', 'B', 'C', 'D'],
    bounds: { u: [-19, 69], v: [-19, 69] },
    lanePts: {
      A: [[-16, 25.5], [-6, 25.2], [4, 25], [12, 25.2], [19.5, 25], [21.7, 25]],
      B: [[66, 25.5], [56, 25.2], [46, 25], [38, 24.8], [29.6, 25], [28.3, 25]],
      C: [[25, -15], [24.6, -6], [25.2, 3], [24.8, 10], [25, 17], [25, 21.6]],
      D: [[25, 63], [25.4, 54], [24.7, 46], [25.2, 38], [25, 33], [25, 28.8]],
    },
    terrain: { sx: 1, sz: 1, sc: 1.9, pond: true },
    boss: BOSS_DEFS.warlord, bosses: [BOSS_DEFS.warlord, BOSS_DEFS.brood],
    slots: [
      /* the old town around the keep */
      { id: 's1', u: 18,   v: 21,   type: 'range' },   { id: 's2', u: 18,   v: 29,   type: 'tower' },
      { id: 's3', u: 32,   v: 21,   type: 'tower' },   { id: 's4', u: 32,   v: 29,   type: 'barracks' },
      { id: 's5', u: 22,   v: 31.5, type: 'house' },   { id: 's6', u: 28,   v: 30.5, type: 'house' },
      { id: 's9', u: 30.5, v: 33.5, type: 'house' },   { id: 's7', u: 17,   v: 35,   type: 'mill' },
      { id: 's8', u: 38.5, v: 34.5, type: 'harbour' }, { id: 's10', u: 7.5, v: 21,   type: 'mine' },
      { id: 'f1', u: 14,   v: 33.5, type: 'field', hidden: true }, { id: 'f2', u: 16.5, v: 38, type: 'field', hidden: true },
      { id: 'x1', u: 33.5, v: 36.5, type: 'house',    hidden: true, unlockDay: 2 },
      { id: 'x2', u: 10.5, v: 22.7, type: 'tower',    hidden: true, unlockDay: 3 },
      { id: 'x3', u: 39.5, v: 27.5, type: 'tower',    hidden: true, unlockDay: 3 },
      { id: 'x4', u: 20.5, v: 19.5, type: 'barracks', hidden: true, unlockDay: 4 },
      { id: 'x5', u: 19.5, v: 39.5, type: 'house',    hidden: true, unlockDay: 4 },
      { id: 'x6', u: 44.5, v: 28,   type: 'mine',     hidden: true, unlockDay: 5 },
      { id: 'x7', u: 36.5, v: 13.5, type: 'range',    hidden: true, unlockDay: 5 },
      { id: 'x8', u: 12,   v: 27.5, type: 'house',    hidden: true, unlockDay: 6 },
      /* gate walls on all four roads, and a far ring for the late game */
      { id: 'w1', type: 'wall', wall: { lane: 'A', d: 29 } },
      { id: 'w2', type: 'wall', wall: { lane: 'B', d: 29 } },
      { id: 'w3', type: 'wall', wall: { lane: 'C', d: 28 } },
      { id: 'w4', type: 'wall', wall: { lane: 'D', d: 29 } },
      { id: 'w5', type: 'wall', wall: { lane: 'A', d: 10 }, hidden: true, unlockDay: 2 },
      { id: 'w6', type: 'wall', wall: { lane: 'B', d: 10 }, hidden: true, unlockDay: 2 },
      { id: 'w7', type: 'wall', wall: { lane: 'C', d: 11 }, hidden: true, unlockDay: 3 },
      { id: 'w8', type: 'wall', wall: { lane: 'D', d: 11 }, hidden: true, unlockDay: 3 },
      /* the outskirts: hamlets spread along all four roads as the days pass */
      { id: 'o1',  u: 6,    v: 28,   type: 'house',    hidden: true, unlockDay: 2 },
      { id: 'o5',  u: 43,   v: 27.5, type: 'house',    hidden: true, unlockDay: 2 },
      { id: 'o10', u: 21.5, v: 11,   type: 'house',    hidden: true, unlockDay: 2 },
      { id: 'o15', u: 22,   v: 39.5, type: 'house',    hidden: true, unlockDay: 2 },
      { id: 'o2',  u: -1,   v: 22.5, type: 'house',    hidden: true, unlockDay: 3 },
      { id: 'o6',  u: 50,   v: 22.5, type: 'house',    hidden: true, unlockDay: 3 },
      { id: 'o11', u: 29,   v: 9,    type: 'house',    hidden: true, unlockDay: 3 },
      { id: 'o16', u: 28.5, v: 41.5, type: 'house',    hidden: true, unlockDay: 3 },
      { id: 'o3',  u: -4,   v: 28,   type: 'tower',    hidden: true, unlockDay: 3 },
      { id: 'o7',  u: 53,   v: 27.5, type: 'tower',    hidden: true, unlockDay: 3 },
      { id: 'o12', u: 16.5, v: 7,    type: 'mill',     hidden: true, unlockDay: 4 },
      { id: 'nf1', u: 12,   v: 5,    type: 'field', hidden: true }, { id: 'nf2', u: 11.5, v: 10, type: 'field', hidden: true },
      { id: 'o13', u: 20,   v: 3,    type: 'tower',    hidden: true, unlockDay: 4 },
      { id: 'o17', u: 32.5, v: 46,   type: 'tower',    hidden: true, unlockDay: 4 },
      { id: 'o18', u: 17.5, v: 45.5, type: 'barracks', hidden: true, unlockDay: 4 },
      { id: 'o9',  u: 45,   v: 33,   type: 'house',    hidden: true, unlockDay: 4 },
      { id: 'o4',  u: -12,  v: 22,   type: 'mine',     hidden: true, unlockDay: 5 },
      { id: 'o8',  u: 58,   v: 22,   type: 'barracks', hidden: true, unlockDay: 5 },
      { id: 'o14', u: 30.5, v: 2.5,  type: 'range',    hidden: true, unlockDay: 5 },
      { id: 'o19', u: 33,   v: 52,   type: 'mine',     hidden: true, unlockDay: 5 },
      { id: 'o20', u: 24,   v: 56,   type: 'house',    hidden: true, unlockDay: 6 },
    ],
    decor() {
      const P = (u, v) => [25 + (u - 25) * 1.85, 25 + (v - 25) * 1.85];
      for (const [u0, v0, s] of [[6,9,1],[5,15,.8],[5,31,.9],[7.5,39,.7],[12,4.5,.9],[23,3.5,1.25],[34,4,.85],[42,6.5,.95],[45.5,11,.7],[45,38,.9],[38,45,1.1],[10,45,.8]]) {
        const [u, v] = P(u0, v0);
        place(ART.mountain(), u, v, Math.random() * 6, s);
      }
      for (const [u0, v0, s] of [[9,12,.9],[7,28.5,.8],[11,33,1],[9,44,.85],[16,7,1],[28,5,.8],[40,7,1],[45,13,.9],[44,19,.75],[14,42,1],[33,45,.9],[45,44,.8],[21,44,.7],[36,30,.7],[4,22,.9],[46,29,.85],[30,47,.95],[18,48,.8],[48,35,.9],[2,35,.85]]) {
        const [u, v] = P(u0, v0);
        place(ART.treePine(s), u, v, Math.random() * 6);
      }
      /* an inner belt of woods keeps the middle from feeling empty */
      for (const [u, v, s] of [[9,12,.9],[11,36.5,.85],[26,6.5,.9],[41.5,33,.85],[43,23,.7],[36,42,.8],[7,32,.75],[41,10,.85],[13,15,.8],[38,38.5,.75]])
        place(ART.treeRound(s), u, v, Math.random() * 6);
      for (const [u, v, s] of [[12,21.5,.9],[31,16.5,1],[39.5,23,.8],[20,35,.9],[28,43,.8],[9,31,.7],[34,9,.8],[14,44,.75],[44,40,.7]])
        place(ART.bush(s), u, v, Math.random() * 6);
      place(ART.rock(1), 6.5, 19.5); place(ART.rock(.7), 37.5, 38.5); place(ART.rock(.9), 40, 5); place(ART.rock(.8), 8, 42);
      /* the inner bailey: gate towers on all four roads */
      place(ART.wallRun(3.6), 15.1, 18.6); place(ART.wallRun(3.6), 15.1, 27.8);
      place(ART.wallRun(3.6), 35.1, 18.6); place(ART.wallRun(3.6), 35.1, 27.8);
      place(ART.wallRun(3.4), 18.9, 17.5, Math.PI / 2); place(ART.wallRun(3.4), 27.6, 17.5, Math.PI / 2);
      place(ART.wallRun(3.4), 18.6, 32.5, Math.PI / 2); place(ART.wallRun(3.4), 28, 32.5, Math.PI / 2);
      for (const [u, v] of [[15.1,23],[15.1,27],[35.1,23],[35.1,27],[23,17.5],[27,17.5],[22.8,32.5],[27.2,32.5]]) gateAt(u, v);
      for (const [u0, v0, r, h] of [[10,8,4,1.4],[40,10,5,1.6],[8,40,4.5,1.3],[42,44,4,1.5],[36,14,3.2,1.1]]) {
        const [u, v] = P(u0, v0);
        place(ART.hillArt(r, h), u, v);
        HILLS.push([u, v, r, h]);
      }
      place(ART.boat(), 59.5, 48.5, .6);
      ART.birdsOver(mapGroup, 1.9);
    },
  },
  leviathan: {
    id: 'leviathan', name: 'Leviathan', unlockAfter: { map: 'nordfels', nights: 5 }, extraWasps: 3, theme: 'bone',
    serpent: true, serpPos: { u: 45, v: 49 }, camZoom: 1.12,
    bounds: { u: [-17, 67], v: [-1, 51] },
    laneIds: ['A', 'B', 'C'],
    lanePts: {
      A: [[-14, 25.7], [-6, 25.6], [1, 25.4], [7, 25.2], [14, 25], [19.5, 25], [21.7, 25]],
      B: [[64, 25.7], [56, 25.6], [49, 25.4], [42, 25.2], [36, 25], [29.6, 25], [28.3, 25]],
      C: [[25, -4], [24.8, 3], [25, 9], [24.8, 14], [25, 18], [25, 21.6]],
    },
    terrain: { sx: 1.45, sz: .9, sc: 1.25, pond: false },
    boss: BOSS_DEFS.brood, bosses: [BOSS_DEFS.brood, BOSS_DEFS.meg],
    slots: [
      { id: 's1', u: 18,   v: 21,   type: 'range' },   { id: 's2', u: 18,   v: 29,   type: 'tower' },
      { id: 's3', u: 32,   v: 21,   type: 'tower' },   { id: 's4', u: 32,   v: 29,   type: 'barracks' },
      { id: 's5', u: 22,   v: 31.5, type: 'house' },   { id: 's6', u: 26.5, v: 31.5, type: 'house' },
      { id: 's7', u: 17,   v: 35,   type: 'mill' },    { id: 's9', u: 30.5, v: 33.5, type: 'house' },
      { id: 's8', u: 38.5, v: 34.5, type: 'harbour' }, { id: 's10', u: 7.5, v: 21,   type: 'mine' },
      { id: 'f1', u: 14,   v: 33.5, type: 'field', hidden: true }, { id: 'f2', u: 16.5, v: 38, type: 'field', hidden: true },
      { id: 'w1', type: 'wall', wall: { lane: 'A', d: 27 } },
      { id: 'w2', type: 'wall', wall: { lane: 'B', d: 27 } },
      { id: 'w3', type: 'wall', wall: { lane: 'C', d: 19 } },
      { id: 'w4', type: 'wall', wall: { lane: 'A', d: 12 }, hidden: true, unlockDay: 2 },
      { id: 'w5', type: 'wall', wall: { lane: 'B', d: 12 }, hidden: true, unlockDay: 2 },
      { id: 'w6', type: 'wall', wall: { lane: 'C', d: 10 }, hidden: true, unlockDay: 3 },
      { id: 'n1', u: 21.5, v: 13.5, type: 'tower',    hidden: true, unlockDay: 2 },
      { id: 'n2', u: 28.5, v: 13.5, type: 'tower',    hidden: true, unlockDay: 2 },
      { id: 'n3', u: 20.5, v: 9.5,  type: 'house',    hidden: true, unlockDay: 3 },
      { id: 'n4', u: 29.5, v: 9,    type: 'barracks', hidden: true, unlockDay: 3 },
      { id: 'x1', u: 41,   v: 27.5, type: 'mine',     hidden: true, unlockDay: 4 },
      { id: 'x2', u: 36,   v: 17,   type: 'house',    hidden: true, unlockDay: 4 },
      { id: 'le1', u: -4,  v: 27.5, type: 'house',    hidden: true, unlockDay: 2 },
      { id: 'le3', u: 54,  v: 27.5, type: 'house',    hidden: true, unlockDay: 2 },
      { id: 'le6', u: 2,   v: 33,   type: 'house',    hidden: true, unlockDay: 3 },
      { id: 'le2', u: -8,  v: 22,   type: 'tower',    hidden: true, unlockDay: 4 },
      { id: 'le4', u: 58,  v: 22,   type: 'tower',    hidden: true, unlockDay: 4 },
      { id: 'le5', u: 46,  v: 38,   type: 'mine',     hidden: true, unlockDay: 5 },
    ],
    decor() {
      const P = (u, v) => [25 + (u - 25) * 1.25, 25 + (v - 25) * 1.25];
      /* the island rests on a titan's bones: rib arches straddle the roads */
      for (const [x, s] of [[10, 1.1], [15.5, 1.25], [34.5, 1.25], [40, 1.1]])
        place(ART.ribArt(s), x, 25, Math.PI / 2);
      place(ART.ribArt(1.1), 25, 9.5); place(ART.ribArt(1.2), 25, 13.5);
      place(ART.skullArt(1.5), 0, 33, 2.6);
      for (const [u0, v0, s] of [[8,19,1.2],[12,30,.9],[30,7,1],[37,32,1.3],[44,21,.9],[20,6,1.1],[31,42,1],[13,41,1.2],[42,15,.8],[48,28,1],[2,20,.9]]) {
        const [u, v] = P(u0, v0);
        place(ART.boneSpike(s), u, v, Math.random() * 6);
      }
      for (const [u0, v0, s] of [[45,8,.9],[5,42,.8],[44,42,.85]]) {
        const [u, v] = P(u0, v0);
        place(ART.mountain(), u, v, Math.random() * 6, s);
      }
      for (const [u0, v0, s] of [[9,38,.9],[40,39,.8],[16,42,.75],[44,31,.7],[35,41,.85],[3,29,.8],[47,33,.9]]) {
        const [u, v] = P(u0, v0);
        place(ART.treePine(s), u, v, Math.random() * 6);
      }
      for (const [u, v, s] of [[12,17,.9],[38,20,.8],[8,28,.7],[28,40,.8]])
        place(ART.rock(s), u, v, Math.random() * 6);
      for (const [u, v, s] of [[20,33,.9],[30,17.5,.8],[41,24,.7]])
        place(ART.bush(s), u, v, Math.random() * 6);
      place(ART.wallRun(3.6), 15.1, 18.6); place(ART.wallRun(3.6), 15.1, 27.8);
      place(ART.wallRun(3.6), 35.1, 18.6); place(ART.wallRun(3.6), 35.1, 27.8);
      place(ART.wallRun(3.4), 18.9, 17.5, Math.PI / 2); place(ART.wallRun(3.4), 27.6, 17.5, Math.PI / 2);
      for (const [u, v] of [[15.1,23],[15.1,27],[35.1,23],[35.1,27],[23,17.5],[27,17.5]]) gateAt(u, v);
      place(ART.boat(), 48, 39, .6);
      for (let i = 0; i < 2; i++) { // something old circles the island, day and night
        const fin = place(ART.finArt(), 0, 0);
        const ph = i * Math.PI;
        ART.ANIMS.push((t) => {
          if (!fin.parent) return;
          const a = t * .1 + ph;
          fin.position.set(25 + Math.cos(a) * 52, -.2, 25 + Math.sin(a) * 33);
          fin.rotation.y = -a;
        });
      }
    },
  },
  deephollow: {
    id: 'deephollow', name: 'Deephollow', unlockAfter: { map: 'leviathan', nights: 8 },
    saboteur: true, camZoom: 1.05,
    bounds: { u: [-14, 64], v: [-14, 64] },
    laneIds: ['A', 'B', 'C'],
    lanePts: {
      A: [[-10, 25.5], [-2, 25.2], [6, 25], [13, 25.1], [19.5, 25], [21.7, 25]],
      B: [[60, 25.5], [52, 25.2], [44, 25], [37, 24.9], [29.6, 25], [28.3, 25]],
      C: [[25, -11], [24.7, -3], [25.2, 5], [24.8, 11], [25, 17], [25, 21.6]],
    },
    terrain: { sx: 1, sz: 1, sc: 1.6, pond: false },
    castleStyle: 'bone', theme: 'dark', slotXform: 'mirrorX',
    sub: { slime: 'skeleton' }, // the dead walk these hills
    boss: BOSS_DEFS.skeleking, bosses: [BOSS_DEFS.skeleking, BOSS_DEFS.warlord],
    slots: [
      { id: 's1', u: 18,   v: 21,   type: 'range' },   { id: 's2', u: 18,   v: 29,   type: 'tower' },
      { id: 's3', u: 32,   v: 21,   type: 'tower' },   { id: 's4', u: 32,   v: 29,   type: 'barracks' },
      { id: 's5', u: 22,   v: 31.5, type: 'house' },   { id: 's6', u: 27.5, v: 31.5, type: 'house' },
      { id: 's7', u: 17,   v: 35,   type: 'mill' },    { id: 's9', u: 30.5, v: 33.5, type: 'house' },
      { id: 's10', u: 7.5, v: 21,   type: 'mine' },
      { id: 'f1', u: 14,   v: 33.5, type: 'field', hidden: true }, { id: 'f2', u: 16.5, v: 38, type: 'field', hidden: true },
      { id: 'w1', type: 'wall', wall: { lane: 'A', d: 23 } },
      { id: 'w2', type: 'wall', wall: { lane: 'B', d: 23 } },
      { id: 'w3', type: 'wall', wall: { lane: 'C', d: 24 } },
      { id: 'w4', type: 'wall', wall: { lane: 'A', d: 8 },  hidden: true, unlockDay: 2 },
      { id: 'w5', type: 'wall', wall: { lane: 'B', d: 8 },  hidden: true, unlockDay: 2 },
      { id: 'w6', type: 'wall', wall: { lane: 'C', d: 10 }, hidden: true, unlockDay: 3 },
      /* the hollows are honeycombed with mineshafts — gold everywhere, if you can hold it */
      { id: 'm1', u: 6,    v: 10,   type: 'mine',     hidden: true, unlockDay: 2 },
      { id: 'm2', u: 44,   v: 10,   type: 'mine',     hidden: true, unlockDay: 3 },
      { id: 'm3', u: 6,    v: 40,   type: 'mine',     hidden: true, unlockDay: 3 },
      { id: 'm4', u: 44,   v: 40,   type: 'mine',     hidden: true, unlockDay: 4 },
      { id: 'd1', u: 12,   v: 10,   type: 'house',    hidden: true, unlockDay: 2 },
      { id: 'd2', u: 38,   v: 8,    type: 'house',    hidden: true, unlockDay: 2 },
      { id: 'd3', u: 10,   v: 38,   type: 'house',    hidden: true, unlockDay: 4 },
      { id: 'd4', u: 40,   v: 42,   type: 'house',    hidden: true, unlockDay: 4 },
      { id: 't1', u: 21.5, v: 13.5, type: 'tower',    hidden: true, unlockDay: 2 },
      { id: 't2', u: 28.5, v: 13.5, type: 'tower',    hidden: true, unlockDay: 2 },
      { id: 't3', u: 12,   v: 30,   type: 'tower',    hidden: true, unlockDay: 3 },
      { id: 't4', u: 38,   v: 30,   type: 'tower',    hidden: true, unlockDay: 3 },
      { id: 'bb', u: 29.5, v: 9,    type: 'barracks', hidden: true, unlockDay: 3 },
      { id: 'rr2', u: 36,  v: 17,   type: 'range',    hidden: true, unlockDay: 5 },
    ],
    decor() {
      const P = (u, v) => [25 + (u - 25) * 1.55, 25 + (v - 25) * 1.55];
      /* hills upon hills — the hollows are dug into them */
      for (const [u0, v0, s] of [[6,9,1.1],[5,15,.9],[5,31,1],[7.5,39,.8],[12,4.5,1],[23,3.5,1.3],[34,4,.95],[42,6.5,1.05],[45.5,11,.8],[45,38,1],[38,45,1.2],[10,45,.9],[45,25,.9],[25,46,1],[14,25.5,0]]) {
        if (!s) continue;
        const [u, v] = P(u0, v0);
        place(ART.mountain(), u, v, Math.random() * 6, s);
      }
      for (const [u0, v0] of [[10,16],[40,16],[10,34],[40,34],[25,44]]) {
        const [u, v] = P(u0, v0);
        place(ART.mineArt(true), u, v, Math.random() * 6, 1.1); // abandoned shafts
        place(ART.nuggetArt(1), u + 2.2, v + 1, Math.random() * 6);
      }
      for (const [u, v, s] of [[8,26,1],[42,24,.9],[20,42,.8],[30,40,1],[16,12,.9],[34,12,.8],[24,8,1],[44,32,.9],[6,36,.8]])
        place(ART.rock(s * 1.2), 25 + (u - 25) * 1.4, 25 + (v - 25) * 1.4, Math.random() * 6);
      for (const [u, v, s] of [[14,40,.8],[36,42,.75],[12,20,.7],[38,20,.7]])
        place(ART.deadTreeArt(s * 1.3), 25 + (u - 25) * 1.4, 25 + (v - 25) * 1.4, Math.random() * 6);
      for (const [u, v] of [[18,10],[32,38],[6,24],[44,27]]) place(ART.nuggetArt(.8), u, v, Math.random() * 6);
      place(ART.wallRun(3.6), 15.1, 18.6); place(ART.wallRun(3.6), 15.1, 27.8);
      place(ART.wallRun(3.6), 35.1, 18.6); place(ART.wallRun(3.6), 35.1, 27.8);
      place(ART.wallRun(3.4), 18.9, 17.5, Math.PI / 2); place(ART.wallRun(3.4), 27.6, 17.5, Math.PI / 2);
      for (const [u, v] of [[15.1,23],[15.1,27],[35.1,23],[35.1,27],[23,17.5],[27,17.5]]) gateAt(u, v);
    },
  },
  ironfront: {
    id: 'ironfront', name: 'Ironfront', unlockAfter: { map: 'deephollow', nights: 10 },
    saboteur: true, skin: 'ww2', castleStyle: 'bunker', theme: 'ww2', camZoom: 1.05,
    terrain: { sx: 1, sz: 1, sc: 1.9, pond: false },
    laneIds: ['A', 'B', 'C', 'D'],
    boss: BOSS_DEFS.landship, bosses: [BOSS_DEFS.landship, BOSS_DEFS.acewing],
    decor() {
      const P = (u, v) => [25 + (u - 25) * 1.85, 25 + (v - 25) * 1.85];
      /* a churned battlefield: craters, wire and the stumps of a burned wood */
      for (const [u0, v0, s] of [[10,14,1.2],[36,10,1],[42,30,1.4],[12,38,1.1],[30,44,1],[6,26,.9],[44,18,1],[20,6,1.1],[24,47,1.2],[46,42,1]]) {
        const [u, v] = P(u0, v0);
        place(ART.craterArt(s), u, v, Math.random() * 6);
      }
      for (const [u0, v0, ry] of [[8,20,.3],[40,22,-.4],[14,44,1.2],[38,42,.8],[22,4,0],[30,3,.2],[4,32,1.5],[46,34,1.6]]) {
        const [u, v] = P(u0, v0);
        place(ART.wireArt(3.5), u, v, ry);
      }
      for (const [u0, v0, s] of [[9,12,1],[7,28.5,.9],[16,7,1.1],[40,7,1],[45,13,.9],[14,42,1],[33,45,1],[45,44,.9],[21,44,.8],[36,30,.8],[4,22,1],[46,29,.9]]) {
        const [u, v] = P(u0, v0);
        place(ART.deadTreeArt(s), u, v, Math.random() * 6);
      }
      for (const [u0, v0, s] of [[6,9,1],[42,6.5,.95],[45,38,.9],[10,45,.8]]) {
        const [u, v] = P(u0, v0);
        place(ART.mountain(), u, v, Math.random() * 6, s);
      }
      for (const [u0, v0] of [[12,22],[38,22],[22,12],[28,38]]) {
        const [u, v] = P(u0, v0);
        place(ART.bunkerArt(), u, v, Math.random() * 6);
      }
      place(ART.wallRun(3.6), 15.1, 18.6); place(ART.wallRun(3.6), 15.1, 27.8);
      place(ART.wallRun(3.6), 35.1, 18.6); place(ART.wallRun(3.6), 35.1, 27.8);
      place(ART.wallRun(3.4), 18.9, 17.5, Math.PI / 2); place(ART.wallRun(3.4), 27.6, 17.5, Math.PI / 2);
      place(ART.wallRun(3.4), 18.6, 32.5, Math.PI / 2); place(ART.wallRun(3.4), 28, 32.5, Math.PI / 2);
      for (const [u, v] of [[15.1,23],[15.1,27],[35.1,23],[35.1,27],[23,17.5],[27,17.5],[22.8,32.5],[27.2,32.5]]) gateAt(u, v);
    },
  },
  lunaris: {
    id: 'lunaris', name: 'Lunaris', unlockAfter: { map: 'ironfront', nights: 12 },
    camZoom: 1.05, mini: 'tyrant',
    bounds: { u: [-12, 62], v: [-12, 62] },
    laneIds: ['A', 'B', 'C'],
    lanePts: {
      A: [[-9, 25.5], [-2, 25.2], [6, 25], [13, 25.1], [19.5, 25], [21.7, 25]],
      B: [[59, 25.5], [52, 25.2], [44, 25], [37, 24.9], [29.6, 25], [28.3, 25]],
      C: [[25, -9], [24.7, -2], [25.2, 5], [24.8, 11], [25, 17], [25, 21.6]],
    },
    terrain: { sx: 1, sz: 1, sc: 1.5, pond: false, pal: 'moon' },
    castleStyle: 'crystal', theme: 'crystal', slotXform: 'rot90',
    sub: { slime: 'moonling' },
    boss: BOSS_DEFS.starspawn, bosses: [BOSS_DEFS.starspawn, BOSS_DEFS.tyrantking],
    slots: [
      { id: 's1', u: 18,   v: 21,   type: 'range' },   { id: 's2', u: 18,   v: 29,   type: 'tower' },
      { id: 's3', u: 32,   v: 21,   type: 'tower' },   { id: 's4', u: 32,   v: 29,   type: 'barracks' },
      { id: 's5', u: 22,   v: 31.5, type: 'house' },   { id: 's6', u: 27.5, v: 31.5, type: 'house' },
      { id: 's7', u: 17,   v: 35,   type: 'mill' },    { id: 's9', u: 30.5, v: 33.5, type: 'house' },
      { id: 's10', u: 7.5, v: 21,   type: 'mine' },
      { id: 'f1', u: 14,   v: 33.5, type: 'field', hidden: true }, { id: 'f2', u: 16.5, v: 38, type: 'field', hidden: true },
      { id: 'w1', type: 'wall', wall: { lane: 'A', d: 22 } },
      { id: 'w2', type: 'wall', wall: { lane: 'B', d: 22 } },
      { id: 'w3', type: 'wall', wall: { lane: 'C', d: 22 } },
      { id: 'w4', type: 'wall', wall: { lane: 'A', d: 8 },  hidden: true, unlockDay: 2 },
      { id: 'w5', type: 'wall', wall: { lane: 'B', d: 8 },  hidden: true, unlockDay: 2 },
      { id: 'w6', type: 'wall', wall: { lane: 'C', d: 8 },  hidden: true, unlockDay: 3 },
      { id: 'l1', u: 21.5, v: 13.5, type: 'tower',    hidden: true, unlockDay: 2 },
      { id: 'l2', u: 28.5, v: 13.5, type: 'tower',    hidden: true, unlockDay: 2 },
      { id: 'l3', u: 8,    v: 12,   type: 'mine',     hidden: true, unlockDay: 2 },
      { id: 'l4', u: 42,   v: 12,   type: 'mine',     hidden: true, unlockDay: 3 },
      { id: 'l5', u: 12,   v: 10,   type: 'house',    hidden: true, unlockDay: 2 },
      { id: 'l6', u: 38,   v: 9,    type: 'house',    hidden: true, unlockDay: 3 },
      { id: 'l7', u: 40,   v: 30,   type: 'house',    hidden: true, unlockDay: 3 },
      { id: 'l8', u: 29.5, v: 9,    type: 'barracks', hidden: true, unlockDay: 3 },
      { id: 'l9', u: 10,   v: 30,   type: 'tower',    hidden: true, unlockDay: 4 },
      { id: 'l10', u: 40,  v: 40,   type: 'mine',     hidden: true, unlockDay: 4 },
      { id: 'l11', u: 12,  v: 40,   type: 'house',    hidden: true, unlockDay: 4 },
      { id: 'l12', u: 36,  v: 17,   type: 'range',    hidden: true, unlockDay: 5 },
    ],
    decor() {
      const P = (u, v) => [25 + (u - 25) * 1.45, 25 + (v - 25) * 1.45];
      for (const [u0, v0, s] of [[10,14,1.3],[36,10,1],[42,30,1.6],[12,38,1.2],[30,44,1.1],[6,26,1],[44,18,1.1],[20,6,1.2],[24,47,1.3],[46,42,1],[8,8,1.4],[42,44,1.2]]) {
        const [u, v] = P(u0, v0);
        place(ART.craterArt(s), u, v, Math.random() * 6);
      }
      for (const [u0, v0, s] of [[6,9,1],[42,6.5,.9],[45,38,1],[10,45,.9],[25,45,.8],[45,25,.7]]) {
        const [u, v] = P(u0, v0);
        place(ART.spireArt(s), u, v, Math.random() * 6);
      }
      for (const [u, v, s] of [[8,26,1.1],[42,24,1],[20,42,.9],[30,40,1.1],[16,12,1],[34,12,.9],[24,8,1.1],[44,32,1],[6,36,.9],[38,38,.9]])
        place(ART.rock(s * 1.3), 25 + (u - 25) * 1.35, 25 + (v - 25) * 1.35, Math.random() * 6);
      for (const [u0, v0, r, h] of [[12,8,4,1.4],[38,42,5,1.6],[8,40,4,1.2],[42,10,4.5,1.4]]) {
        const [u, v] = P(u0, v0);
        place(ART.hillArt(r, h, 'moon'), u, v);
        HILLS.push([u, v, r, h]);
      }
      const earth = place(ART.earthArt(), -6, -4);
      earth.position.y = 32;
      place(ART.wallRun(3.6), 15.1, 18.6); place(ART.wallRun(3.6), 15.1, 27.8);
      place(ART.wallRun(3.6), 35.1, 18.6); place(ART.wallRun(3.6), 35.1, 27.8);
      place(ART.wallRun(3.4), 18.9, 17.5, Math.PI / 2); place(ART.wallRun(3.4), 27.6, 17.5, Math.PI / 2);
      for (const [u, v] of [[15.1,23],[15.1,27],[35.1,23],[35.1,27],[23,17.5],[27,17.5]]) gateAt(u, v);
    },
  },
  abyss: {
    id: 'abyss', name: 'The Abyss', unlockAfter: { map: 'lunaris', nights: 12 },
    camZoom: 1.05, mini: 'urchin',
    bounds: { u: [-12, 62], v: [-12, 62] },
    laneIds: ['A', 'B', 'C'],
    lanePts: {
      A: [[-9, 25.5], [-2, 25.2], [6, 25], [13, 25.1], [19.5, 25], [21.7, 25]],
      B: [[59, 25.5], [52, 25.2], [44, 25], [37, 24.9], [29.6, 25], [28.3, 25]],
      C: [[25, 59], [25.3, 52], [24.8, 44], [25.2, 37], [25, 32.5], [25, 28.8]],
    },
    terrain: { sx: 1, sz: 1, sc: 1.5, pond: false, pal: 'abyss' },
    castleStyle: 'coral', theme: 'coral', slotXform: 'mirrorZ',
    sub: { slime: 'crab', wasp: 'jelly' },
    boss: BOSS_DEFS.maw, bosses: [BOSS_DEFS.maw, BOSS_DEFS.jellyqueen],
    slots: [
      { id: 's1', u: 18,   v: 21,   type: 'range' },   { id: 's2', u: 18,   v: 29,   type: 'tower' },
      { id: 's3', u: 32,   v: 21,   type: 'tower' },   { id: 's4', u: 32,   v: 29,   type: 'barracks' },
      { id: 's5', u: 22,   v: 31.5, type: 'house' },   { id: 's6', u: 28,   v: 30.5, type: 'house' },
      { id: 's7', u: 17,   v: 35,   type: 'mill' },    { id: 's9', u: 30.5, v: 33.5, type: 'house' },
      { id: 's8', u: 38.5, v: 34.5, type: 'harbour' }, { id: 's10', u: 7.5, v: 21,   type: 'mine' },
      { id: 'f1', u: 14,   v: 33.5, type: 'field', hidden: true }, { id: 'f2', u: 16.5, v: 38, type: 'field', hidden: true },
      { id: 'w1', type: 'wall', wall: { lane: 'A', d: 22 } },
      { id: 'w2', type: 'wall', wall: { lane: 'B', d: 22 } },
      { id: 'w3', type: 'wall', wall: { lane: 'C', d: 22 } },
      { id: 'w4', type: 'wall', wall: { lane: 'A', d: 8 },  hidden: true, unlockDay: 2 },
      { id: 'w5', type: 'wall', wall: { lane: 'B', d: 8 },  hidden: true, unlockDay: 2 },
      { id: 'w6', type: 'wall', wall: { lane: 'C', d: 8 },  hidden: true, unlockDay: 3 },
      { id: 'a1', u: 22,   v: 38,   type: 'tower',    hidden: true, unlockDay: 2 },
      { id: 'a2', u: 28.5, v: 38,   type: 'tower',    hidden: true, unlockDay: 2 },
      { id: 'a3', u: 10,   v: 12,   type: 'house',    hidden: true, unlockDay: 2 },
      { id: 'a4', u: 40,   v: 12,   type: 'house',    hidden: true, unlockDay: 3 },
      { id: 'a5', u: 12,   v: 40,   type: 'house',    hidden: true, unlockDay: 3 },
      { id: 'a6', u: 40,   v: 42,   type: 'harbour',  hidden: true, unlockDay: 4 },
      { id: 'a7', u: 8,    v: 32,   type: 'mine',     hidden: true, unlockDay: 4 },
      { id: 'a8', u: 42,   v: 26,   type: 'mine',     hidden: true, unlockDay: 5 },
      { id: 'a9', u: 20,   v: 42,   type: 'barracks', hidden: true, unlockDay: 3 },
      { id: 'a10', u: 36,  v: 17,   type: 'range',    hidden: true, unlockDay: 5 },
    ],
    decor() {
      const P = (u, v) => [25 + (u - 25) * 1.45, 25 + (v - 25) * 1.45];
      for (const [u0, v0, s] of [[10,14,1.2],[36,10,1],[42,30,1.4],[12,38,1.1],[30,44,1],[6,26,1],[44,18,1.1],[20,6,1],[46,42,1.2],[8,8,1.1]]) {
        const [u, v] = P(u0, v0);
        place(ART.coralArt(s), u, v, Math.random() * 6);
      }
      for (const [u0, v0, s] of [[8,20,1],[40,22,1.1],[14,44,1],[38,42,1.2],[22,4,1],[30,3,1],[4,32,1],[46,34,1],[16,8,1.1],[34,46,1]]) {
        const [u, v] = P(u0, v0);
        place(ART.kelpArt(s), u, v, Math.random() * 6);
      }
      for (const [u, v, s] of [[8,26,1.1],[42,24,1],[20,42,.9],[16,12,1],[34,12,.9],[44,32,1]])
        place(ART.rock(s * 1.2), 25 + (u - 25) * 1.35, 25 + (v - 25) * 1.35, Math.random() * 6);
      for (const [u0, v0, r, h] of [[12,8,4,1.2],[38,42,5,1.4],[8,40,4,1.1]]) {
        const [u, v] = P(u0, v0);
        place(ART.hillArt(r, h, 'abyss'), u, v);
        HILLS.push([u, v, r, h]);
      }
      for (const [u0, v0] of [[14,18],[36,32],[24,44],[42,8]]) {
        const [u, v] = P(u0, v0);
        ART.bubblesAt(mapGroup, u, v);
      }
      place(ART.wallRun(3.6), 15.1, 18.6); place(ART.wallRun(3.6), 15.1, 27.8);
      place(ART.wallRun(3.6), 35.1, 18.6); place(ART.wallRun(3.6), 35.1, 27.8);
      place(ART.wallRun(3.4), 18.6, 32.5, Math.PI / 2); place(ART.wallRun(3.4), 28, 32.5, Math.PI / 2);
      for (const [u, v] of [[15.1,23],[15.1,27],[35.1,23],[35.1,27],[22.8,32.5],[27.2,32.5]]) gateAt(u, v);
    },
  },
  frostmaw: {
    id: 'frostmaw', name: 'Frostmaw', unlockAfter: { map: 'abyss', nights: 14 },
    camZoom: 1.05, coldSnap: true, castleStyle: 'ice', theme: 'ice', merchant: true, slotXform: 'mirrorX',
    bounds: { u: [-12, 62], v: [-12, 62] },
    laneIds: ['A', 'B', 'C'],
    lanePts: {
      A: [[-9, 25.5], [-2, 25.2], [6, 25], [13, 25.1], [19.5, 25], [21.7, 25]],
      B: [[59, 25.5], [52, 25.2], [44, 25], [37, 24.9], [29.6, 25], [28.3, 25]],
      C: [[25, -9], [24.7, -2], [25.2, 5], [24.8, 11], [25, 17], [25, 21.6]],
    },
    terrain: { sx: 1, sz: 1, sc: 1.5, pond: false, pal: 'ice' },
    sub: { slime: 'iceling' },
    boss: BOSS_DEFS.yeti, bosses: [BOSS_DEFS.yeti, BOSS_DEFS.tyrantking],
    slots: [
      { id: 's1', u: 18,   v: 21,   type: 'range' },   { id: 's2', u: 18,   v: 29,   type: 'tower' },
      { id: 's3', u: 32,   v: 21,   type: 'tower' },   { id: 's4', u: 32,   v: 29,   type: 'barracks' },
      { id: 's5', u: 22,   v: 31.5, type: 'house' },   { id: 's6', u: 27.5, v: 31.5, type: 'house' },
      { id: 's7', u: 17,   v: 35,   type: 'mill' },    { id: 's9', u: 30.5, v: 33.5, type: 'house' },
      { id: 's10', u: 7.5, v: 21,   type: 'mine' },
      { id: 'f1', u: 14,   v: 33.5, type: 'field', hidden: true }, { id: 'f2', u: 16.5, v: 38, type: 'field', hidden: true },
      { id: 'w1', type: 'wall', wall: { lane: 'A', d: 22 } },
      { id: 'w2', type: 'wall', wall: { lane: 'B', d: 22 } },
      { id: 'w3', type: 'wall', wall: { lane: 'C', d: 22 } },
      { id: 'w4', type: 'wall', wall: { lane: 'A', d: 8 }, hidden: true, unlockDay: 2 },
      { id: 'w5', type: 'wall', wall: { lane: 'B', d: 8 }, hidden: true, unlockDay: 2 },
      { id: 'w6', type: 'wall', wall: { lane: 'C', d: 8 }, hidden: true, unlockDay: 3 },
      { id: 'fr1', u: 21.5, v: 13.5, type: 'tower',    hidden: true, unlockDay: 2 },
      { id: 'fr2', u: 28.5, v: 13.5, type: 'tower',    hidden: true, unlockDay: 2 },
      { id: 'fr3', u: 10,   v: 12,   type: 'house',    hidden: true, unlockDay: 2 },
      { id: 'fr4', u: 40,   v: 12,   type: 'house',    hidden: true, unlockDay: 3 },
      { id: 'fr5', u: 12,   v: 40,   type: 'house',    hidden: true, unlockDay: 3 },
      { id: 'fr6', u: 40,   v: 40,   type: 'mine',     hidden: true, unlockDay: 4 },
      { id: 'fr7', u: 29.5, v: 9,    type: 'barracks', hidden: true, unlockDay: 3 },
      { id: 'fr8', u: 36,   v: 17,   type: 'range',    hidden: true, unlockDay: 5 },
      { id: 'fr9', u: 8,    v: 32,   type: 'mine',     hidden: true, unlockDay: 5 },
    ],
    decor() {
      const P = (u, v) => [25 + (u - 25) * 1.45, 25 + (v - 25) * 1.45];
      for (const [u0, v0, s] of [[6,9,1.2],[5,15,.9],[12,4.5,1],[23,3.5,1.4],[34,4,1],[42,6.5,1.1],[45,38,1.1],[38,45,1.3],[10,45,1],[45,25,.9],[25,46,1.1],[6,32,1]]) {
        const [u, v] = P(u0, v0);
        place(ART.mountain(), u, v, Math.random() * 6, s);
      }
      for (const [u0, v0, s] of [[9,12,.9],[16,7,1],[40,7,1],[45,13,.9],[14,42,1],[33,45,.9],[21,44,.8],[36,30,.8],[4,22,.9],[46,29,.9]]) {
        const [u, v] = P(u0, v0);
        place(ART.treePine(s), u, v, Math.random() * 6);
      }
      for (const [u, v, s] of [[8,26,1.1],[42,24,1],[20,42,.9],[16,12,1],[34,12,.9],[44,32,1],[12,34,.9]])
        place(ART.rock(s * 1.2), 25 + (u - 25) * 1.35, 25 + (v - 25) * 1.35, Math.random() * 6);
      for (const [u0, v0, r, h] of [[12,8,4,1.4],[38,42,5,1.6],[8,40,4,1.2],[42,10,4,1.3]]) {
        const [u, v] = P(u0, v0);
        place(ART.hillArt(r, h, 'ice'), u, v);
        HILLS.push([u, v, r, h]);
      }
      place(ART.wallRun(3.6), 15.1, 18.6); place(ART.wallRun(3.6), 15.1, 27.8);
      place(ART.wallRun(3.6), 35.1, 18.6); place(ART.wallRun(3.6), 35.1, 27.8);
      place(ART.wallRun(3.4), 18.9, 17.5, Math.PI / 2); place(ART.wallRun(3.4), 27.6, 17.5, Math.PI / 2);
      for (const [u, v] of [[15.1,23],[15.1,27],[35.1,23],[35.1,27],[23,17.5],[27,17.5]]) gateAt(u, v);
      ART.weatherSnow(mapGroup, 1.5);
    },
  },
  verdania: {
    id: 'verdania', name: 'Verdania', unlockAfter: { map: 'frostmaw', nights: 14 },
    camZoom: 1.05, mini: 'gorilla',
    bounds: { u: [-12, 62], v: [-12, 62] },
    laneIds: ['A', 'B', 'C'],
    lanePts: {
      A: [[-9, 25.5], [-2, 25.2], [6, 25], [13, 25.1], [19.5, 25], [21.7, 25]],
      B: [[59, 25.5], [52, 25.2], [44, 25], [37, 24.9], [29.6, 25], [28.3, 25]],
      C: [[25, 59], [25.3, 52], [24.8, 44], [25.2, 37], [25, 32.5], [25, 28.8]],
    },
    terrain: { sx: 1, sz: 1, sc: 1.5, pond: true, pal: 'jungle' },
    castleStyle: 'vine', theme: 'vine', merchant: true, slotXform: 'rot90',
    sub: { runner: 'panther' },
    boss: BOSS_DEFS.vinehorror, bosses: [BOSS_DEFS.vinehorror, BOSS_DEFS.warlord],
    slots: [
      { id: 's1', u: 18,   v: 21,   type: 'range' },   { id: 's2', u: 18,   v: 29,   type: 'tower' },
      { id: 's3', u: 32,   v: 21,   type: 'tower' },   { id: 's4', u: 32,   v: 29,   type: 'barracks' },
      { id: 's5', u: 22,   v: 31.5, type: 'house' },   { id: 's6', u: 28,   v: 30.5, type: 'house' },
      { id: 's7', u: 17,   v: 35,   type: 'mill' },    { id: 's9', u: 30.5, v: 33.5, type: 'house' },
      { id: 's10', u: 7.5, v: 21,   type: 'mine' },
      { id: 'f1', u: 14,   v: 33.5, type: 'field', hidden: true }, { id: 'f2', u: 16.5, v: 38, type: 'field', hidden: true },
      { id: 'w1', type: 'wall', wall: { lane: 'A', d: 22 } },
      { id: 'w2', type: 'wall', wall: { lane: 'B', d: 22 } },
      { id: 'w3', type: 'wall', wall: { lane: 'C', d: 22 } },
      { id: 'w4', type: 'wall', wall: { lane: 'A', d: 8 }, hidden: true, unlockDay: 2 },
      { id: 'w5', type: 'wall', wall: { lane: 'B', d: 8 }, hidden: true, unlockDay: 2 },
      { id: 'w6', type: 'wall', wall: { lane: 'C', d: 8 }, hidden: true, unlockDay: 3 },
      { id: 'v1', u: 22,   v: 38,   type: 'tower',    hidden: true, unlockDay: 2 },
      { id: 'v2', u: 28.5, v: 38,   type: 'tower',    hidden: true, unlockDay: 2 },
      { id: 'v3', u: 10,   v: 12,   type: 'house',    hidden: true, unlockDay: 2 },
      { id: 'v4', u: 40,   v: 12,   type: 'house',    hidden: true, unlockDay: 3 },
      { id: 'v5', u: 12,   v: 40,   type: 'house',    hidden: true, unlockDay: 3 },
      { id: 'v6', u: 40,   v: 42,   type: 'mine',     hidden: true, unlockDay: 4 },
      { id: 'v7', u: 20,   v: 42,   type: 'barracks', hidden: true, unlockDay: 3 },
      { id: 'v8', u: 36,   v: 17,   type: 'range',    hidden: true, unlockDay: 5 },
      { id: 'v9', u: 8,    v: 32,   type: 'mill',     hidden: true, unlockDay: 4 },
    ],
    decor() {
      const P = (u, v) => [25 + (u - 25) * 1.45, 25 + (v - 25) * 1.45];
      /* the green presses in on every side */
      for (const [u0, v0, s] of [[9,12,1.2],[7,28.5,1.1],[11,33,1.3],[9,44,1.1],[16,7,1.3],[28,5,1.1],[40,7,1.3],[45,13,1.2],[44,19,1],[14,42,1.3],[33,45,1.2],[45,44,1.1],[21,44,1],[36,30,1],[4,22,1.2],[46,29,1.1],[30,47,1.2],[18,48,1.1],[6,36,1.2],[42,36,1.1]]) {
        const [u, v] = P(u0, v0);
        place(ART.treeRound(s * 1.25), u, v, Math.random() * 6);
      }
      for (const [u0, v0, s] of [[12,21.5,1],[31,16.5,1.1],[39.5,23,.9],[20,35,1],[28,43,.9],[9,31,.8],[34,9,.9],[14,44,.85],[44,40,.8],[24,10,1]]) {
        const [u, v] = P(u0, v0);
        place(ART.bush(s * 1.3), u, v, Math.random() * 6);
      }
      for (const [u0, v0, r, h] of [[12,8,4,1.3],[38,42,5,1.5],[8,40,4,1.1]]) {
        const [u, v] = P(u0, v0);
        place(ART.hillArt(r, h), u, v);
        HILLS.push([u, v, r, h]);
      }
      for (const [u, v, s] of [[8,26,1],[42,24,.9],[16,12,.9]])
        place(ART.rock(s), 25 + (u - 25) * 1.35, 25 + (v - 25) * 1.35, Math.random() * 6);
      place(ART.wallRun(3.6), 15.1, 18.6); place(ART.wallRun(3.6), 15.1, 27.8);
      place(ART.wallRun(3.6), 35.1, 18.6); place(ART.wallRun(3.6), 35.1, 27.8);
      place(ART.wallRun(3.4), 18.6, 32.5, Math.PI / 2); place(ART.wallRun(3.4), 28, 32.5, Math.PI / 2);
      for (const [u, v] of [[15.1,23],[15.1,27],[35.1,23],[35.1,27],[22.8,32.5],[27.2,32.5]]) gateAt(u, v);
      ART.birdsOver(mapGroup, 1.45);
    },
  },
  cinderpeak: {
    id: 'cinderpeak', name: 'Cinderpeak', unlockAfter: { map: 'verdania', nights: 15 },
    camZoom: 1.05, mini: 'tyrant',
    bounds: { u: [-12, 62], v: [-12, 62] },
    laneIds: ['A', 'B', 'C'],
    lanePts: {
      A: [[-9, 25.5], [-2, 25.2], [6, 25], [13, 25.1], [19.5, 25], [21.7, 25]],
      B: [[59, 25.5], [52, 25.2], [44, 25], [37, 24.9], [29.6, 25], [28.3, 25]],
      C: [[25, -9], [24.7, -2], [25.2, 5], [24.8, 11], [25, 17], [25, 21.6]],
    },
    terrain: { sx: 1, sz: 1, sc: 1.5, pond: false, pal: 'ash' },
    castleStyle: 'magma', theme: 'magma', merchant: true, slotXform: 'mirrorZ',
    sub: { slime: 'cinderling' },
    boss: BOSS_DEFS.magmalord, bosses: [BOSS_DEFS.magmalord, BOSS_DEFS.tyrantking],
    slots: [
      { id: 's1', u: 18,   v: 21,   type: 'range' },   { id: 's2', u: 18,   v: 29,   type: 'tower' },
      { id: 's3', u: 32,   v: 21,   type: 'tower' },   { id: 's4', u: 32,   v: 29,   type: 'barracks' },
      { id: 's5', u: 22,   v: 31.5, type: 'house' },   { id: 's6', u: 27.5, v: 31.5, type: 'house' },
      { id: 's7', u: 17,   v: 35,   type: 'mill' },    { id: 's9', u: 30.5, v: 33.5, type: 'house' },
      { id: 's10', u: 7.5, v: 21,   type: 'mine' },
      { id: 'f1', u: 14,   v: 33.5, type: 'field', hidden: true }, { id: 'f2', u: 16.5, v: 38, type: 'field', hidden: true },
      { id: 'w1', type: 'wall', wall: { lane: 'A', d: 22 } },
      { id: 'w2', type: 'wall', wall: { lane: 'B', d: 22 } },
      { id: 'w3', type: 'wall', wall: { lane: 'C', d: 22 } },
      { id: 'w4', type: 'wall', wall: { lane: 'A', d: 8 }, hidden: true, unlockDay: 2 },
      { id: 'w5', type: 'wall', wall: { lane: 'B', d: 8 }, hidden: true, unlockDay: 2 },
      { id: 'w6', type: 'wall', wall: { lane: 'C', d: 8 }, hidden: true, unlockDay: 3 },
      { id: 'c1', u: 21.5, v: 13.5, type: 'tower',    hidden: true, unlockDay: 2 },
      { id: 'c2', u: 28.5, v: 13.5, type: 'tower',    hidden: true, unlockDay: 2 },
      { id: 'c3', u: 10,   v: 12,   type: 'mine',     hidden: true, unlockDay: 2 },
      { id: 'c4', u: 40,   v: 12,   type: 'mine',     hidden: true, unlockDay: 3 },
      { id: 'c5', u: 12,   v: 10,   type: 'house',    hidden: true, unlockDay: 2 },
      { id: 'c6', u: 38,   v: 9,    type: 'house',    hidden: true, unlockDay: 3 },
      { id: 'c7', u: 12,   v: 40,   type: 'house',    hidden: true, unlockDay: 3 },
      { id: 'c8', u: 29.5, v: 9,    type: 'barracks', hidden: true, unlockDay: 3 },
      { id: 'c9', u: 40,   v: 40,   type: 'tower',    hidden: true, unlockDay: 4 },
      { id: 'c10', u: 36,  v: 17,   type: 'range',    hidden: true, unlockDay: 5 },
    ],
    decor() {
      const P = (u, v) => [25 + (u - 25) * 1.45, 25 + (v - 25) * 1.45];
      place(ART.volcanoArt(1.4), 25 + (8 - 25) * 1.45, 25 + (8 - 25) * 1.45, .5);
      place(ART.volcanoArt(1), 25 + (44 - 25) * 1.45, 25 + (40 - 25) * 1.45, 2.2);
      for (const [u0, v0, r] of [[14,10,2.2],[38,14,1.8],[10,36,2],[36,42,1.6],[44,26,1.5]]) {
        const [u, v] = P(u0, v0);
        place(ART.lavaPoolArt(r), u, v);
      }
      for (const [u0, v0, s] of [[6,20,1],[42,8,1.1],[20,6,1],[30,44,1.1],[46,34,1],[8,44,1]]) {
        const [u, v] = P(u0, v0);
        place(ART.mountain(s ? s : 1), u, v, Math.random() * 6, s);
      }
      for (const [u0, v0, s] of [[9,12,1],[16,7,1],[40,7,1],[14,42,1],[33,45,1],[36,30,.9],[4,22,1]]) {
        const [u, v] = P(u0, v0);
        place(ART.deadTreeArt(s), u, v, Math.random() * 6);
      }
      for (const [u, v, s] of [[8,26,1.2],[42,24,1.1],[20,42,1],[16,12,1.1],[34,12,1],[44,32,1.1]])
        place(ART.rock(s * 1.3), 25 + (u - 25) * 1.35, 25 + (v - 25) * 1.35, Math.random() * 6);
      for (const [u0, v0] of [[14,10],[38,14],[10,36],[8,8]]) {
        const [u, v] = P(u0, v0);
        ART.bubblesAt(mapGroup, u, v, '#FFB35C');
      }
      place(ART.wallRun(3.6), 15.1, 18.6); place(ART.wallRun(3.6), 15.1, 27.8);
      place(ART.wallRun(3.6), 35.1, 18.6); place(ART.wallRun(3.6), 35.1, 27.8);
      place(ART.wallRun(3.4), 18.9, 17.5, Math.PI / 2); place(ART.wallRun(3.4), 27.6, 17.5, Math.PI / 2);
      for (const [u, v] of [[15.1,23],[15.1,27],[35.1,23],[35.1,27],[23,17.5],[27,17.5]]) gateAt(u, v);
    },
  },
  sandsea: {
    id: 'sandsea', name: 'Sandsea', unlockAfter: { map: 'cinderpeak', nights: 15 },
    camZoom: 1.05,
    bounds: { u: [-12, 62], v: [-12, 62] },
    laneIds: ['A', 'B', 'C'],
    lanePts: {
      A: [[-9, 25.5], [-2, 25.2], [6, 25], [13, 25.1], [19.5, 25], [21.7, 25]],
      B: [[59, 25.5], [52, 25.2], [44, 25], [37, 24.9], [29.6, 25], [28.3, 25]],
      C: [[25, 59], [25.3, 52], [24.8, 44], [25.2, 37], [25, 32.5], [25, 28.8]],
    },
    terrain: { sx: 1, sz: 1, sc: 1.5, pond: true, pal: 'dune' },
    castleStyle: 'dune', theme: 'dune', merchant: true, slotXform: 'rot90',
    sub: { slime: 'scarab' },
    boss: BOSS_DEFS.wyrm, bosses: [BOSS_DEFS.wyrm, BOSS_DEFS.warlord],
    slots: [
      { id: 's1', u: 18,   v: 21,   type: 'range' },   { id: 's2', u: 18,   v: 29,   type: 'tower' },
      { id: 's3', u: 32,   v: 21,   type: 'tower' },   { id: 's4', u: 32,   v: 29,   type: 'barracks' },
      { id: 's5', u: 22,   v: 31.5, type: 'house' },   { id: 's6', u: 28,   v: 30.5, type: 'house' },
      { id: 's7', u: 17,   v: 35,   type: 'mill' },    { id: 's9', u: 30.5, v: 33.5, type: 'house' },
      { id: 's10', u: 7.5, v: 21,   type: 'mine' },
      { id: 'f1', u: 14,   v: 33.5, type: 'field', hidden: true }, { id: 'f2', u: 16.5, v: 38, type: 'field', hidden: true },
      { id: 'w1', type: 'wall', wall: { lane: 'A', d: 22 } },
      { id: 'w2', type: 'wall', wall: { lane: 'B', d: 22 } },
      { id: 'w3', type: 'wall', wall: { lane: 'C', d: 22 } },
      { id: 'w4', type: 'wall', wall: { lane: 'A', d: 8 }, hidden: true, unlockDay: 2 },
      { id: 'w5', type: 'wall', wall: { lane: 'B', d: 8 }, hidden: true, unlockDay: 2 },
      { id: 'w6', type: 'wall', wall: { lane: 'C', d: 8 }, hidden: true, unlockDay: 3 },
      { id: 'sd1', u: 22,   v: 38,   type: 'tower',    hidden: true, unlockDay: 2 },
      { id: 'sd2', u: 28.5, v: 38,   type: 'tower',    hidden: true, unlockDay: 2 },
      { id: 'sd3', u: 10,   v: 12,   type: 'house',    hidden: true, unlockDay: 2 },
      { id: 'sd4', u: 40,   v: 12,   type: 'house',    hidden: true, unlockDay: 3 },
      { id: 'sd5', u: 12,   v: 40,   type: 'house',    hidden: true, unlockDay: 3 },
      { id: 'sd6', u: 40,   v: 42,   type: 'mine',     hidden: true, unlockDay: 4 },
      { id: 'sd7', u: 20,   v: 42,   type: 'barracks', hidden: true, unlockDay: 3 },
      { id: 'sd8', u: 36,   v: 17,   type: 'range',    hidden: true, unlockDay: 5 },
      { id: 'sd9', u: 8,    v: 32,   type: 'mine',     hidden: true, unlockDay: 5 },
    ],
    decor() {
      const P = (u, v) => [25 + (u - 25) * 1.45, 25 + (v - 25) * 1.45];
      for (const [u0, v0, r, h] of [[12,8,5,1.6],[38,42,6,1.8],[8,40,4.5,1.3],[42,10,5,1.5],[25,44,4,1.2],[6,24,4,1.2]]) {
        const [u, v] = P(u0, v0);
        place(ART.hillArt(r, h, 'dune'), u, v);
        HILLS.push([u, v, r, h]);
      }
      for (const [u0, v0, s] of [[10,14,1],[36,10,1.1],[42,30,1],[12,38,1],[30,44,1],[44,18,1],[16,8,1]]) {
        const [u, v] = P(u0, v0);
        place(ART.palmArt(s), u, v, Math.random() * 6);
      }
      for (const [u0, v0, s] of [[8,20,1],[40,22,1],[14,44,1],[22,4,1],[4,32,1],[46,34,1],[34,46,1]]) {
        const [u, v] = P(u0, v0);
        place(ART.cactusArt(s), u, v, Math.random() * 6);
      }
      for (const [u, v, s] of [[8,26,1],[42,24,1],[16,12,1],[34,12,.9]])
        place(ART.rock(s), 25 + (u - 25) * 1.35, 25 + (v - 25) * 1.35, Math.random() * 6);
      for (const [u0, v0] of [[18,10],[32,38],[44,27]]) place(ART.nuggetArt(.8), ...P(u0, v0), 0);
      place(ART.wallRun(3.6), 15.1, 18.6); place(ART.wallRun(3.6), 15.1, 27.8);
      place(ART.wallRun(3.6), 35.1, 18.6); place(ART.wallRun(3.6), 35.1, 27.8);
      place(ART.wallRun(3.4), 18.6, 32.5, Math.PI / 2); place(ART.wallRun(3.4), 28, 32.5, Math.PI / 2);
      for (const [u, v] of [[15.1,23],[15.1,27],[35.1,23],[35.1,27],[22.8,32.5],[27.2,32.5]]) gateAt(u, v);
    },
  },
  aetherreach: {
    id: 'aetherreach', name: 'Aetherreach', unlockAfter: { map: 'sandsea', nights: 18 },
    camZoom: 1.05, mini: 'urchin',
    bounds: { u: [-12, 62], v: [-12, 62] },
    laneIds: ['A', 'B', 'C'],
    lanePts: {
      A: [[-9, 25.5], [-2, 25.2], [6, 25], [13, 25.1], [19.5, 25], [21.7, 25]],
      B: [[59, 25.5], [52, 25.2], [44, 25], [37, 24.9], [29.6, 25], [28.3, 25]],
      C: [[25, -9], [24.7, -2], [25.2, 5], [24.8, 11], [25, 17], [25, 21.6]],
    },
    terrain: { sx: 1, sz: 1, sc: 1.5, pond: false, pal: 'sky' },
    castleStyle: 'crystal', theme: 'crystal', merchant: true, slotXform: 'mirrorX',
    sub: { wasp: 'sprite' },
    boss: BOSS_DEFS.roc, bosses: [BOSS_DEFS.roc, BOSS_DEFS.starspawn],
    slots: [
      { id: 's1', u: 18,   v: 21,   type: 'range' },   { id: 's2', u: 18,   v: 29,   type: 'tower' },
      { id: 's3', u: 32,   v: 21,   type: 'tower' },   { id: 's4', u: 32,   v: 29,   type: 'barracks' },
      { id: 's5', u: 22,   v: 31.5, type: 'house' },   { id: 's6', u: 27.5, v: 31.5, type: 'house' },
      { id: 's7', u: 17,   v: 35,   type: 'mill' },    { id: 's9', u: 30.5, v: 33.5, type: 'house' },
      { id: 's10', u: 7.5, v: 21,   type: 'mine' },
      { id: 'f1', u: 14,   v: 33.5, type: 'field', hidden: true }, { id: 'f2', u: 16.5, v: 38, type: 'field', hidden: true },
      { id: 'w1', type: 'wall', wall: { lane: 'A', d: 22 } },
      { id: 'w2', type: 'wall', wall: { lane: 'B', d: 22 } },
      { id: 'w3', type: 'wall', wall: { lane: 'C', d: 22 } },
      { id: 'w4', type: 'wall', wall: { lane: 'A', d: 8 }, hidden: true, unlockDay: 2 },
      { id: 'w5', type: 'wall', wall: { lane: 'B', d: 8 }, hidden: true, unlockDay: 2 },
      { id: 'w6', type: 'wall', wall: { lane: 'C', d: 8 }, hidden: true, unlockDay: 3 },
      { id: 'ae1', u: 21.5, v: 13.5, type: 'tower',    hidden: true, unlockDay: 2 },
      { id: 'ae2', u: 28.5, v: 13.5, type: 'tower',    hidden: true, unlockDay: 2 },
      { id: 'ae3', u: 10,   v: 12,   type: 'house',    hidden: true, unlockDay: 2 },
      { id: 'ae4', u: 40,   v: 12,   type: 'house',    hidden: true, unlockDay: 3 },
      { id: 'ae5', u: 12,   v: 40,   type: 'house',    hidden: true, unlockDay: 3 },
      { id: 'ae6', u: 40,   v: 40,   type: 'mine',     hidden: true, unlockDay: 4 },
      { id: 'ae7', u: 29.5, v: 9,    type: 'barracks', hidden: true, unlockDay: 3 },
      { id: 'ae8', u: 36,   v: 17,   type: 'range',    hidden: true, unlockDay: 5 },
    ],
    decor() {
      const P = (u, v) => [25 + (u - 25) * 1.45, 25 + (v - 25) * 1.45];
      for (const [u0, v0, s] of [[6,9,1],[42,6.5,.9],[45,38,1],[10,45,.9],[25,45,.8],[45,25,.7],[8,30,.9],[36,8,.8]]) {
        const [u, v] = P(u0, v0);
        place(ART.spireArt(s), u, v, Math.random() * 6);
      }
      for (const [u0, v0, s] of [[10,14,1],[36,10,.9],[42,30,1.1],[12,38,1],[30,44,.9],[44,18,1],[20,6,1],[46,42,.9]]) {
        const [u, v] = P(u0, v0);
        place(ART.floatRockArt(s), u, v);
      }
      for (const [u0, v0, r, h] of [[12,8,4,1.3],[38,42,5,1.5],[8,40,4,1.1]]) {
        const [u, v] = P(u0, v0);
        place(ART.hillArt(r, h, 'sky'), u, v);
        HILLS.push([u, v, r, h]);
      }
      place(ART.wallRun(3.6), 15.1, 18.6); place(ART.wallRun(3.6), 15.1, 27.8);
      place(ART.wallRun(3.6), 35.1, 18.6); place(ART.wallRun(3.6), 35.1, 27.8);
      place(ART.wallRun(3.4), 18.9, 17.5, Math.PI / 2); place(ART.wallRun(3.4), 27.6, 17.5, Math.PI / 2);
      for (const [u, v] of [[15.1,23],[15.1,27],[35.1,23],[35.1,27],[23,17.5],[27,17.5]]) gateAt(u, v);
    },
  },
};
/* the Ironfront is fought over Nordfels' ground plan — same roads, same plots, different war */
MAPS.ironfront.lanePts = MAPS.nordfels.lanePts;
MAPS.ironfront.slots = MAPS.nordfels.slots;
MAPS.ironfront.bounds = MAPS.nordfels.bounds;

/* the coast is the real boundary: same superellipse+wobble the terrain is built from */
function onLand(u, v) {
  const t = MAP.terrain || {}, sx = t.sx || 1, sz = t.sz || 1, sc = t.sc || 1;
  const x = (u - 25) / sx, z = (v - 25) / sz;
  const rr = Math.hypot(x, z);
  if (rr < 12 * sc) return true;
  const th = Math.atan2(z, x);
  const base = 24 / Math.pow(Math.max(Math.abs(Math.cos(th)), Math.abs(Math.sin(th))), 0.72);
  const wob = Math.sin(th * 3 + 1.7) * 1.1 + Math.sin(th * 5 + .4) * .7 + Math.sin(th * 8 + 2.9) * .45;
  return rr <= (base + wob) * sc + .8; // riders may reach the wet sand, not the waves
}
function blockedBy(u, v) { // stone and timber stop a horse; crops and open gates do not
  if (Math.hypot(u - 25, v - 24) < 3.4) return true; // the keep itself
  for (const sl of SLOTS) {
    const b = S.builds[sl.id];
    if (!b || b.type === 'wall' || b.type === 'field') continue;
    if (Math.hypot(u - sl.u, v - sl.v) < 1.35) return true;
  }
  return false;
}
const passable = (u, v) => onLand(u, v) && !blockedBy(u, v);
function slideMove(o, nx, nz) { // clamp to map bounds, then glide around whatever is in the way
  const bu = (MAP.bounds || {}).u || [1.5, 48.5], bv = (MAP.bounds || {}).v || [1.5, 48.5];
  nx = Math.max(bu[0], Math.min(bu[1], nx)); nz = Math.max(bv[0], Math.min(bv[1], nz));
  if (!passable(o.u, o.v)) { if (onLand(nx, nz)) { o.u = nx; o.v = nz; } return; } // trapped inside? any road out is legal
  if (passable(nx, nz)) { o.u = nx; o.v = nz; return; }
  if (passable(nx, o.v)) { o.u = nx; return; }
  if (passable(o.u, nz)) { o.v = nz; return; }
  /* head-on against something round: curve along its tangent instead of grinding to a halt */
  const step = Math.hypot(nx - o.u, nz - o.v);
  if (step < 1e-6) return;
  const ang = Math.atan2(nz - o.v, nx - o.u);
  for (const rot of [.7, -.7, 1.2, -1.2]) {
    const mu = o.u + Math.cos(ang + rot) * step, mv = o.v + Math.sin(ang + rot) * step;
    if (mu >= bu[0] && mu <= bu[1] && mv >= bv[0] && mv <= bv[1] && passable(mu, mv)) { o.u = mu; o.v = mv; return; }
  }
}

let HILLS = [];
function heightAt(u, v) { // the land rises where the hills were raised
  let y = 0;
  for (const [hu, hv, r, h] of HILLS) {
    const d = Math.hypot(u - hu, v - hv);
    if (d < r) { const c = Math.cos(d / r * Math.PI / 2); y = Math.max(y, h * c * c); }
  }
  return y;
}
const XFORMS = {
  mirrorX: (u, v) => [50 - u, v],
  mirrorZ: (u, v) => [u, 50 - v],
  rot90: (u, v) => [v, 50 - u],
};
function loadMap(id) {
  const def = MAPS[id] || MAPS.nordfels;
  MAP = def; S.map = def.id;
  ART.setTheme(def.theme || null);
  HILLS = [];
  try { localStorage.tf_map = def.id; } catch { /* private mode */ }
  if (mapGroup) scene.remove(mapGroup);
  mapGroup = new THREE.Group(); scene.add(mapGroup);
  torchLights.length = 0;
  hitMeshes = []; LANES = {};
  for (const lid of def.laneIds) { LANES[lid] = sampleLane(def.lanePts[lid]); LANES[lid].start = def.lanePts[lid][0]; }
  ART.buildTerrain(mapGroup, def.laneIds.map(l => def.lanePts[l]), def.terrain);
  def.decor();
  castle = place(ART.castleArt(), 25, 24);
  if (def.castleStyle) castle.add(ART.castleDress(def.castleStyle));
  for (const p of castle.userData.torches) addTorch(p.clone().add(castle.position));
  for (const lid of def.laneIds) place(ART.spawnFlagArt(), LANES[lid].start[0], LANES[lid].start[1]);
  SLOTS = def.slots.map(s => ({ ...s }));
  const xf = XFORMS[def.slotXform];
  if (xf) for (const sl of SLOTS) { // each realm arranges its town differently
    if (sl.u == null || sl.wall) continue;
    [sl.u, sl.v] = xf(sl.u, sl.v);
  }
  for (const sl of SLOTS) {
    if (sl.wall) { // walls sit on the road itself, square across it
      const p = LANES[sl.wall.lane].at(sl.wall.d), q = LANES[sl.wall.lane].at(sl.wall.d + .6);
      sl.u = p.u; sl.v = p.v;
      sl.ang = Math.atan2(-(q.v - p.v), q.u - p.u);
    }
    sl.y = heightAt(sl.u, sl.v);
    sl.marker = place(ART.slotMarker(BTYPES[sl.type].cost), sl.u, sl.v);
    sl.marker.position.y = sl.y;
    const hit = ART.hitCylinder(2.3, 4.5);
    hit.position.set(sl.u, sl.y + 2.25, sl.v); hit.userData.slot = sl;
    mapGroup.add(hit); hitMeshes.push(hit);
    sl.holder = new THREE.Group(); sl.holder.position.set(sl.u, sl.y, sl.v);
    if (sl.ang) sl.holder.rotation.y = sl.ang;
    mapGroup.add(sl.holder);
    sl.pop = 0;
  }
  const chit = ART.hitCylinder(4.6, 12);
  chit.position.set(25, 0, 24); chit.userData.slot = CASTLE_SLOT;
  mapGroup.add(chit); hitMeshes.push(chit);
  SERP = def.serpPos || { u: 40, v: 46 };
  $('#mapName').textContent = def.name;
  resetRun();
}

/* ============================== game state (exact ECS numbers) ============================== */
const S = { view: 'menu', phaseName: 'day', day: 1, gold: 8, castleHP: 15, castleMax: 15, castleLvl: 1,
  builds: {}, settings: { dmg: true, ranges: true, shake: true, music: true, sound: true, tilt: true, mini: true }, stance: 'hold' };
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
/* ---- achievements: medals on the wall, and a secret at the end of them ---- */
const ACHS = {
  first:   { n: 'First Dawn',      d: 'Survive your first night' },
  n5:      { n: 'Boss Slayer',     d: 'Survive night 5' },
  n10:     { n: 'Saga Written',    d: 'Survive ten nights in one realm' },
  n15:     { n: 'Legend',          d: 'Survive fifteen nights in one realm' },
  boss:    { n: 'Giantsbane',      d: 'Slay a boss' },
  serpent: { n: 'Deepslayer',      d: 'Slay the Leviathan itself' },
  maps3:   { n: 'Wayfarer',        d: 'Unlock three realms' },
  crowns50:{ n: 'Royal Treasury',  d: 'Bank 50 crowns in total' },
  raze0:   { n: 'Not One Stone',   d: 'Survive night 6+ with no building razed' },
};
let ACH = {};
try { ACH = JSON.parse(localStorage.tf_ach || '{}'); } catch { /* fresh device */ }
function achCount() { return Object.keys(ACHS).filter(k => ACH[k]).length; }
function award(id) {
  if (ACH[id] || !ACHS[id]) return;
  ACH[id] = 1;
  try { localStorage.tf_ach = JSON.stringify(ACH); } catch { /* private */ }
  flashBanner('🏅 ' + ACHS[id].n.toUpperCase());
  sfx.upgrade();
  if (achCount() >= 6 && !ACH.golem) {
    ACH.golem = 1;
    try { localStorage.tf_ach = JSON.stringify(ACH); } catch { /* private */ }
    setTimeout(() => flashBanner('SECRET — A STONE GOLEM ANSWERS YOUR BANNERS'), 2600);
  }
  refreshAch();
}
function refreshAch() {
  const el = $('#achGrid');
  if (!el) return;
  $('#achNum').textContent = achCount() + '/' + Object.keys(ACHS).length;
  el.innerHTML = Object.entries(ACHS).map(([k, a]) =>
    '<div class="medal' + (ACH[k] ? ' won' : '') + '"><div class="mIc">' + (ACH[k] ? '🏅' : '🔒') + '</div>' +
    '<b>' + a.n + '</b><span>' + a.d + '</span></div>').join('') +
    '<div class="medal' + (ACH.golem ? ' won' : '') + '"><div class="mIc">' + (ACH.golem ? '🗿' : '❓') + '</div>' +
    '<b>' + (ACH.golem ? 'The Golem' : '???') + '</b><span>' + (ACH.golem ? 'It fights beside your soldiers now' : 'Earn six medals…') + '</span></div>';
}

/* ---- the armory: crowns earned each night survived buy permanent unlocks ---- */
const META = { crowns: 0, owned: {} };
try { Object.assign(META, JSON.parse(localStorage.tf_meta || '{}')); } catch { /* fresh device */ }
function saveMeta() { try { localStorage.tf_meta = JSON.stringify(META); } catch { /* private mode */ } }
const ARMORY = {
  frost: { cost: 15 }, seal: { cost: 18 }, beacons: { cost: 9 }, pockets: { cost: 9 }, bastion: { cost: 12 }, arcana: { cost: 12 },
};
let CROWN_TOTAL = 0;
try { CROWN_TOTAL = +localStorage.tf_ctotal || 0; } catch { /* ok */ }
function earnCrowns(n) {
  META.crowns += n; CROWN_TOTAL += n;
  try { localStorage.tf_ctotal = CROWN_TOTAL; } catch { /* ok */ }
  saveMeta(); refreshArmory();
  if (CROWN_TOTAL >= 50) award('crowns50');
}
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
  outriders:  { name: 'Outriders',       desc: 'Soldiers march 25% faster' },
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
  if (b) {
    sl.holder.add(ART.BUILD_ART[b.type](b.type === 'wall' ? b.kind : b.upg, b.upg2));
    sl.pop = 1; sl.holder.scale.setScalar(.2);
  }
}

/* ============================== economy ============================== */
function dawnRows() {
  const rows = [{ l: 'Castle stipend', n: 1 }];
  let houses = 0, fields = 0, mills = 0;
  for (const id in S.builds) {
    const b = S.builds[id];
    if (b.type === 'house') houses += b.upg2 ? 3 : b.upg ? 2 : 1;
    else if (b.type === 'field') fields += 1;
    else if (b.type === 'mill') mills += b.upg ? 2 : 1;
    else if (b.type === 'mine') rows.push({ l: 'Gold Mine (decaying)', n: Math.max(0, 6 - (b.upg ? Math.floor(b.age / 2) : b.age)) });
    else if (b.type === 'harbour') { const nb = Math.min(b.upg2 ? 7 : 5, b.boats + 1); rows.push({ l: `Harbour (${nb} boat${nb > 1 ? 's' : ''})`, n: nb * (b.upg ? 2 : 1) }); }
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
    if (b.type === 'harbour') b.boats = Math.min(b.upg2 ? 7 : 5, b.boats + 1);
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
const HINT0 = 'Ride with WASD · Shift gallops · E builds & upgrades · Space begins the night';
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
  ogre:    { hp: 18, speed: .7,  dmg: 3, rate: 1.8, ranged: 5 },  // hurls boulders at the keep
  shade:   { hp: 4,  speed: 2.2, dmg: 2, rate: 1.3, fly: true },  // drifts over walls and soldiers alike
  chief:   { hp: 12, speed: .9,  dmg: 2, rate: 1.6, buff: 5 },    // drives nearby monsters onward
  skeleton:{ hp: 3,  speed: 1.7, dmg: 1, rate: 1.2 },             // the dead of the deep hollows
  moonling:{ hp: 3,  speed: 1.8, dmg: 1, rate: 1.3 },             // hops in the low gravity
  tyrant:  { hp: 30, speed: .8,  dmg: 4, rate: 1.8 },             // a crater tyrant — a tiny boss
  crab:    { hp: 4,  speed: 1.3, dmg: 1, rate: 1.5 },
  jelly:   { hp: 3,  speed: 2.2, dmg: 1, rate: 1.2, fly: true },
  urchin:  { hp: 26, speed: .6,  dmg: 3, rate: 2 },               // a rolling tiny boss
  iceling: { hp: 3,  speed: 1.6, dmg: 1, rate: 1.3 },
  panther: { hp: 2,  speed: 3.8, dmg: 2, rate: 1.1 },             // fast and mean
  gorilla: { hp: 28, speed: .9,  dmg: 4, rate: 1.7 },             // a tiny boss of the green
  cinderling:{ hp: 3, speed: 1.7, dmg: 1, rate: 1.3 },
  scarab:  { hp: 4,  speed: 1.5, dmg: 1, rate: 1.4 },
  sprite:  { hp: 2,  speed: 2.8, dmg: 1, rate: 1.1, fly: true },
  wolfrider:{ hp: 5, speed: 3.2, dmg: 2, rate: 1.1 },             // goblin cavalry, fast as a fright
  bat:     { hp: 1,  speed: 3.4, dmg: 1, rate: 1, fly: true },    // the Broodmother's true children
};
/* endless campaign: nights 1–3 are authored, then the horde scales forever.
   Enemies rotate across every road the map has. */
function nightPlan(n) {
  const ids = MAP.laneIds;
  let li = 0;
  const q = []; const p = (type) => q.push({ type, lane: ids[li++ % ids.length] });
  const xw = MAP.extraWasps || 0;
  /* a share of the light troops break for the farms instead of the keep */
  const done = () => {
    if (MAP.mini && n >= 4) { p(MAP.mini); if (n >= 8) p(MAP.mini); }
    if (n >= 2) q.forEach(s => { if ((s.type === 'slime' || s.type === 'runner' || s.type === 'wolfrider') && Math.random() < .45) s.raid = true; });
    return q;
  };
  if (n === 1) { for (let i = 0; i < 10; i++) q.push({ type: 'slime', lane: ids[0] }); return q; }
  if (n === 2) {
    for (let i = 0; i < 8; i++) p('slime');
    for (let i = 0; i < 4; i++) p('barrel');
    for (let i = 0; i < 3 + xw; i++) p('wasp');
    return done();
  }
  if (n === 3) {
    for (let i = 0; i < 10; i++) p('slime');
    for (let i = 0; i < 6; i++) p('barrel');
    for (let i = 0; i < 5 + xw; i++) p('wasp');
    p('ogre');
    return done();
  }
  const slimes = Math.min(40, 8 + Math.round(2.4 * n)), barrels = Math.min(24, n + 2),
    wasps = Math.min(20, n) + xw, runners = Math.min(22, Math.round((n - 3) * 2.5)),
    wolfriders = n >= 3 ? Math.min(12, n) : 0,
    spitters = Math.min(12, n - 4), ogres = n % 3 === 0 ? Math.min(8, Math.floor(n / 3) + 1) : 0,
    shades = n >= 8 ? Math.min(12, n - 6) : 0,
    chiefs = n >= 10 && n % 2 === 0 ? Math.min(4, Math.floor((n - 8) / 2)) : 0;
  for (let i = 0; i < slimes; i++) p('slime');
  for (let i = 0; i < barrels; i++) p('barrel');
  for (let i = 0; i < runners; i++) p('runner');
  for (let i = 0; i < wolfriders; i++) p('wolfrider');
  for (let i = 0; i < wasps; i++) p('wasp');
  for (let i = 0; i < spitters; i++) p('spitter');
  for (let i = 0; i < shades; i++) p('shade');
  for (let i = 0; i < chiefs; i++) p('chief');
  for (let i = 0; i < ogres; i++) p('ogre');
  return done();
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
    if (!c.magnet && S.view === 'game' && !(K.down > 0) && Math.hypot(c.x - K.u, c.z - K.v) < 3.4) c.magnet = true;
    if (c.magnet) {
      _a.set(K.u - c.x, 1 - c.y, K.v - c.z);
      const d = _a.length();
      if (d < .65) { // picked up
        S.gold += c.value; c.m.visible = false; groundCoins.splice(i, 1);
        sfx.coin(); refreshGold();
        continue;
      }
      _a.normalize().multiplyScalar(Math.min(21 * dt, d));
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
const K = { u: 25, v: 29.5, hp: 20, max: 20, spd: 9, vx: 0, vz: 0, face: 0, atkCd: 0, mesh: null };
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
  aldric:   { name: 'King Aldric', icon: '👑', hp: 20, spd: 10.5 },
  maren:    { name: 'Lady Maren',  icon: '🦅', hp: 14, spd: 12.5, falcon: true },
  grimbold: { name: 'Grimbold',    icon: '🛡', hp: 28, spd: 8.5, aura: 6 },
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
  $('#kingWeap').textContent = W.name;
  $('#abQIc').textContent = W.icon;
  $('#abSpear').title = W.q;
}
function setWeapon(w) {
  if (!WEAPONS[w] || (w === 'frost' && !META.owned.frost)) w = 'spear';
  S.weapon = w;
  try { localStorage.tf_weapon = w; } catch { /* private mode */ }
  const props = K.mesh.userData.weapons;
  const propKey = w === 'frost' ? 'staff' : w;
  for (const key in props) props[key].visible = key === propKey;
  K.wpBase = { spear: -.9, bow: -.4, hammer: -.8, frost: -.5 }[w] || -.9;
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
  K.ring = ART.ringMesh(5.5, '#F0B429', .16); // the muster circle, shown while Follow is sounded
  K.ring.position.y = .07;
  K.ring.visible = false;
  K.mesh.add(K.ring);
  $$('.ccard').forEach(x => x.classList.toggle('on', x.dataset.c === c));
  setWeapon(S.weapon); // re-hang the chosen weapon on the new rider
}
const keys = {};
const DIAG = Math.SQRT1_2; // camera yaw is fixed 45°: W = screen-up = world (-1,-1)/√2
function updateKing(dt) {
  if (K.down > 0) { // the king has fallen — he returns at the keep
    K.down -= dt;
    if (K.down <= 0) {
      K.hp = K.max; K.u = 25; K.v = 29.5; K.vx = 0; K.vz = 0;
      K.mesh.visible = true; K.mesh.position.set(K.u, 0, K.v);
      poof(K.u, 1, K.v, true);
    }
    return;
  }
  const fwd = (keys.w || keys.arrowup ? 1 : 0) - (keys.s || keys.arrowdown ? 1 : 0);
  const side = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
  let ax = (-fwd + side) * DIAG, az = (-fwd - side) * DIAG;
  const im = Math.hypot(ax, az);
  if (im) { ax /= im; az /= im; }
  /* momentum: the horse leans into a gallop and eases out of it */
  const sprint = keys.shift ? 1.4 : 1; // lean low over the mane and gallop
  K.vx = THREE.MathUtils.damp(K.vx, ax * K.spd * sprint, 11, dt);
  K.vz = THREE.MathUtils.damp(K.vz, az * K.spd * sprint, 11, dt);
  const moving = im > 0;
  if (Math.abs(K.vx) > .15 || Math.abs(K.vz) > .15)
    slideMove(K, K.u + K.vx * dt, K.v + K.vz * dt);
  /* guardian angel: no snag may pin the king for more than a heartbeat */
  if (moving) {
    if (Math.hypot(K.u - (K._lu ?? K.u), K.v - (K._lv ?? K.v)) < .01) {
      K._pin = (K._pin || 0) + dt;
      if (K._pin > 1.2) {
        K._pin = 0;
        const hu = K.u + ax * 1.7, hv = K.v + az * 1.7;
        if (onLand(hu, hv)) { K.u = hu; K.v = hv; }        // hop past it (escape rule frees him after)
        else if (onLand(K.u - ax * 1.4, K.v - az * 1.4)) { K.u -= ax * 1.4; K.v -= az * 1.4; }
      }
    } else K._pin = 0;
  } else K._pin = 0;
  K._lu = K.u; K._lv = K.v;
  if (moving) K.face = Math.atan2(ax, az);
  if (K.ring) K.ring.visible = S.phaseName === 'night' && S.stance === 'follow';
  if (S.phaseName === 'day') K.hp = Math.min(K.max, K.hp + 2.5 * dt);
  K.mesh.position.set(K.u, heightAt(K.u, K.v), K.v);
  const diff = ((K.face - K.mesh.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  K.mesh.rotation.y += diff * (1 - Math.exp(-12 * dt));
  const body = K.mesh.userData.body;
  K.gallop = THREE.MathUtils.damp(K.gallop || 0, moving ? 1 : 0, 8, dt);
  body.position.y = Math.abs(Math.sin(perf * 11)) * .16 * K.gallop;
  body.rotation.x = Math.sin(perf * 11) * .05 * K.gallop;
  const wp = K.mesh.userData.weapons[S.weapon];
  if (K.atkAnim > 0 && wp) { // the arm remembers the blow
    K.atkAnim -= dt;
    wp.rotation.z = (K.wpBase || -.9) - Math.sin(Math.max(0, K.atkAnim) / .3 * Math.PI) * .9;
  }
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
    K.hp = 0; K.down = 6; K.vx = 0; K.vz = 0;
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
  bmenu._u = sl.u; bmenu._v = sl.v;
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
  if (b.type === 'house') return !b.upg ? { label: 'Second Storey', cost: 3 } : !b.upg2 ? { label: 'Manor', cost: 4 } : null;
  if (b.type === 'tower') return !b.upg ? { label: 'Choose a spire', cost: 4 } : !b.upg2 ? { label: 'Masterwork Arms', cost: 5 } : null;
  if (b.type === 'harbour') return !b.upg ? { label: 'Big Docks', cost: 3 } : !b.upg2 ? { label: 'Lighthouse', cost: 4 } : null;
  if (b.type === 'mill' && !b.upg) return { label: 'Great Sails', cost: 3 };
  if (b.type === 'wall' && !b.upg2) return { label: 'Reinforce', cost: 3 };
  if (b.type === 'mine' && !b.upg) return { label: 'Deep Shaft', cost: 4 };
  if (b.type === 'barracks' && !b.upg2) return { label: 'Veteran Company', cost: 5 };
  if (b.type === 'range' && !b.upg2) return { label: "Fletchers' Guild", cost: 5 };
  return null;
}
const CASTLE_TIERS = [null, { cost: 10, hp: 10, desc: '+10 castle HP · heavier arrows' },
  { cost: 17, hp: 10, desc: '+10 castle HP · rapid volleys' },
  { cost: 24, hp: 15, desc: '+15 castle HP · twin ballistae' }];
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
  'Big Docks': 'Each boat pays 2 gold', 'Reinforce': 'Braces and buttresses — +12 wall HP',
  'Lighthouse': 'Boats fish farther — up to 7 return', 'Great Sails': 'The mill pays 2 gold at dawn',
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
      opt('data-u="sniper"', '🎯', "Sniper's Perch", '+range, +damage', 4, S.gold >= 4) +
      opt('data-u="archer"', '🏹', "Archer's Spire", 'Shoots twice as fast', 4, S.gold >= 4) +
      opt('data-u="frost"', '❄', 'Frost Spire', 'Arrows chill the horde to a crawl', 4, S.gold >= 4));
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
    const cost = spire ? 4 : (upgradable(sl) || {}).cost;
    if (cost == null || S.gold < cost) return;
    S.gold -= cost;
    if (spire) b.upg = u;
    else if (!b.upg && b.type !== 'barracks' && b.type !== 'range' && b.type !== 'wall') b.upg = true;
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
  if (sl.type === 'wall') { // a proper fortress offers more than one wall
    openMenu(sl, 'Raise a wall',
      opt('data-k="palisade"', '🪵', 'Palisade', 'Quick timber · 12 HP', 2, S.gold >= 2) +
      opt('data-k="stone"', '🧱', 'Stone Wall', 'Mortared stone · 24 HP', 4, S.gold >= 4) +
      opt('data-k="gate"', '🏰', 'Gatehouse', '30 HP · archers on the parapet', 6, S.gold >= 6));
    const WCOST = { palisade: 2, stone: 4, gate: 6 };
    bmenu.querySelectorAll('[data-k]').forEach(btn => btn.addEventListener('click', () =>
      build(sl, { kind: btn.dataset.k, cost: WCOST[btn.dataset.k] })));
    return;
  }
  /* gold is irreversible — show what the coin buys before it leaves the purse */
  openMenu(sl, 'Build ' + t.name,
    opt('data-b="1"', t.icon, t.name, t.desc, t.cost, S.gold >= t.cost));
  const btn = bmenu.querySelector('[data-b]');
  if (btn) btn.addEventListener('click', () => build(sl, {}));
}
function build(sl, extra) {
  const t = BTYPES[sl.type];
  const cost = extra.cost != null ? extra.cost : t.cost;
  if (S.gold < cost) return;
  S.gold -= cost;
  S.builds[sl.id] = { type: sl.type, age: 0, boats: 0, ...extra };
  renderBuild(sl); closeBmenu(); refreshDayHUD();
  if (sl.type !== 'wall' && sl.type !== 'field') { // never wall the king into his own house
    const d = Math.hypot(K.u - sl.u, K.v - sl.v);
    if (d < 1.9) {
      const ang = d < .05 ? Math.PI / 4 : Math.atan2(K.v - sl.v, K.u - sl.u);
      K.u = sl.u + Math.cos(ang) * 2.1; K.v = sl.v + Math.sin(ang) * 2.1;
      K.vx = 0; K.vz = 0;
    }
  }
  poof(sl.u, .5, sl.v);
  sfx.build();
  if (sl.type === 'mill') {
    SLOTS.filter(x => x.type === 'field').forEach(x => x.hidden = false);
    refreshMarkers(); flashHint('The Windmill opened the field plots');
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
  if (bmenu.style.display === 'block' && Math.hypot((bmenu._u || 0) - K.u, (bmenu._v || 0) - K.v) > 7) closeBmenu();
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
  if (S.day % 5 === 0) { // the bosses take turns leading the horde
    if (MAP.bosses) MAP.boss = MAP.bosses[(S.day / 5 - 1) % MAP.bosses.length];
    queue.push({ type: 'boss', lane: MAP.laneIds[S.day % MAP.laneIds.length] });
  }
  N = { queue, total: queue.filter(x => !x.lull).length, spawned: 0, killed: 0, enemies: [], units: [], towers: [], walls: [], bldgs: [], boss: null,
    spawnEvery: Math.max(.26, 1.02 - S.day * .075), spawnT: .6, kingCd: 0, abQ: 0, abE: 0, hornUntil: 0, t: 0, over: false };
  for (const sl of SLOTS) {
    const b = S.builds[sl.id]; if (!b) continue;
    if (b.type !== 'wall') // everything else can burn
      N.bldgs.push({ sl, id: sl.id, type: b.type, u: sl.u, v: sl.v,
        hp: BHP[b.type] + (b.upg ? 3 : 0) + (b.upg2 ? 3 : 0), max: BHP[b.type] + (b.upg ? 3 : 0) + (b.upg2 ? 3 : 0), dead: false, hpEl: null });
    if (b.type === 'tower') N.towers.push({ id: sl.id, u: sl.u, v: sl.v, z: sl.holder.children[0]?.userData.z || 4, cd: .4 + Math.random() * .4, spec: towerSpec(b) });
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
      const WHP = { palisade: 12, stone: 24, gate: 30 };
      const hp = (WHP[b.kind] || 12) + (b.upg2 ? 12 : 0) + (hasPerk('masonry') ? 8 : 0);
      N.walls.push({ sl, lane: sl.wall.lane, d: sl.wall.d, u: sl.u, v: sl.v, hp, max: hp, broken: false, hpEl: null });
      if (b.kind === 'gate') // archers man the gatehouse parapet
        N.towers.push({ id: sl.id, u: sl.u, v: sl.v, z: 3.2, cd: .6, spec: { range: 7, rate: 1.1, dmg: 1 } });
    }
  }
  if (hasPerk('beacons')) N.towers.forEach(t => { t.spec = { ...t.spec, range: t.spec.range * 1.15 }; });
  N.towers.push({ u: 25, v: 24, z: 9.5, cd: .8, castle: true,
    spec: { range: 11, rate: S.castleLvl >= 4 ? .5 : S.castleLvl >= 3 ? .7 : 1.1, dmg: S.castleLvl >= 4 ? 4 : S.castleLvl >= 2 ? 3 : 2 } });
  if (ACH.golem) spawnUnit(25 + 2.5, 28.8, 'golem', 0); // the stone friend keeps its vigil
  if (S._mercs) { for (let i = 0; i < S._mercs; i++) spawnUnit(23 + i * 1.4, 30.5, 'knight', 2); S._mercs = 0; }
  N.trapsLeft = S._traps || 0; S._traps = 0;
  if (S._powder) { N.towers.forEach(t => t.spec = { ...t.spec, dmg: t.spec.dmg + 1 }); S._powder = false; }
  N.bellSlow = S._bell ? .88 : 1; S._bell = false;
  N.serpentAt = (MAP.serpent && S.serpent && !S.serpent.slain && S.day >= 4) ? 8 + Math.random() * 10 : 0;
  N.serp = null;
  N.sabAt = (MAP.saboteur && S.day >= 3 && N.bldgs.length) ? 10 + Math.random() * 14 : 0;
  N.sab = null;
  $('#serpWrap').style.display = 'none';
  if (S.settings.ranges) for (const t of N.towers) {
    if (t.castle) continue;
    const r = ART.ringMesh(t.spec.range, '#F0B429', .22);
    r.position.set(t.u, .12, t.v); scene.add(r); rangeRings.push(r);
    t.ring = r;
  }
  S.castleHP = S.castleMax;
  $('#castleFill').style.width = '100%'; $('#kingFill').style.width = '100%';
  $('#waveTitle').textContent = 'NIGHT ' + S.day;
  $('#remainNum').textContent = N.total;
  setClock('#clockNight', 0);
  if (S.day === 2) setTimeout(() => flashBanner(MAP.skin === 'ww2' ? 'PANZERS ON THE ROADS' : 'BARREL KNIGHTS ON THE ROADS'), 1600);
  if (S.day === 1) setTimeout(() => { if (N && !N.over) flashBanner('ORDERS — 1 HOLD · 2 CHARGE · 3 FOLLOW ME'); }, 6000);
  S.stance = 'hold';
  $$('.tchip').forEach(x => x.classList.toggle('on', x.dataset.stance === 'hold'));
  sfx.night();
  cine('NIGHT ' + S.day);
  setPhase('night');
}
function spawnUnit(u, v, kind) {
  const specs = { knight: { range: 1.9, rate: .7, dmg: 1, hp: 5 }, berserk: { range: 1.9, rate: .8, dmg: 2, hp: 4 },
    longbow: { range: 13, rate: 1.15, dmg: 1, hp: 2 }, fire: { range: 9, rate: 1.2, dmg: 1, splash: 1.7, hp: 2 },
    golem: { range: 2.2, rate: 1.4, dmg: 4, hp: 30 } };
  const sp = { ...specs[kind] };
  if (hasPerk('discipline')) { sp.hp += 2; sp.rate *= .85; }
  sp.hp += arguments[3] || 0; // veteran bonus
  const mesh = kind === 'golem' ? ART.golemArt()
    : kind === 'knight' || kind === 'berserk' ? ART.knightArt(kind, MAP.skin) : ART.archerArt(kind, MAP.skin);
  mesh.position.set(u, 0, v); mesh.rotation.y = Math.random() * 6; scene.add(mesh);
  const ring = ART.ringMesh(.55, '#F0B429', .75); // lights up while this soldier rides with the king
  ring.position.y = .06; ring.visible = false; mesh.add(ring);
  N.units.push({ u, v, pu: u, pv: v, kind, cd: .3 + Math.random() * .5, ...sp, max: sp.hp,
    mesh, ring, dead: false, hpEl: null, tgt: null, bob: Math.random() * 9, fo: Math.random() * Math.PI * 2, fr: 1.5 + Math.random() * 1.3, pop: 1 });
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
const BOSS_HP_MULT = 1.7; // a boss night should be an event, not a speed bump
function spawnEnemy(spec) {
  const isBoss = spec.type === 'boss';
  const type = (!isBoss && MAP.sub && MAP.sub[spec.type]) || spec.type;
  const T = isBoss ? { ...MAP.boss, hp: Math.round(MAP.boss.hp * BOSS_HP_MULT) } : ETYPES[type];
  const lane = LANES[spec.lane];
  const mesh = isBoss ? ART.bossArt(MAP.boss.kind) : ART.enemyArt(type, MAP.skin);
  scene.add(mesh);
  const hpScale = 1 + Math.max(0, S.day - 2) * .24; // endless nights harden the horde
  const e = { type, laneId: spec.lane, lane, d: 0, hp: Math.round(T.hp * hpScale), max: Math.round(T.hp * hpScale),
    speed: T.speed, dmg: T.dmg, rate: T.rate, ranged: T.ranged || 0,
    atkCd: .8, fly: T.fly, mesh, dead: false, ph: Math.random() * 9, hpEl: null, kCd: .5, uCd: .7, pop: 1, flinch: 0,
    boss: isBoss, brood: isBoss ? (T.brood || 0) : 0, broodT: 4, broodType: T.broodType || 'wasp' };
  if (N.trapsLeft > 0 && !isBoss && !spec.raid) { N.trapsLeft--; e.trapAt = e.lane.total * (.35 + Math.random() * .25); }
  if (spec.raid && !isBoss) { // a raider veers off the road toward gold on its own flank
    const st = LANES[spec.lane].start;
    const targets = N.bldgs.filter(g => !g.dead && (INCOME_T.has(g.type) || S.day >= 6))
      .sort((a, b) => Math.hypot(a.u - st[0], a.v - st[1]) - Math.hypot(b.u - st[0], b.v - st[1]));
    if (targets.length) {
      const g = targets[Math.floor(Math.random() * Math.min(3, targets.length))];
      e.free = true; e.fx = st[0]; e.fz = st[1]; e.tgt = g;
      if (!N._raidSeen) { N._raidSeen = true; flashBanner('RAIDERS BREAK FOR THE FARMS'); }
    }
  }
  N.enemies.push(e); N.spawned++;
  if (isBoss) {
    N.boss = e;
    $('#bossWrap').style.display = 'block';
    $('#bossName').textContent = MAP.boss.name;
    $('#bossFill').style.width = '100%';
    flashBanner(MAP.boss.name + ' EMERGES');
    sfx.night();
  }
  const MINI_LINES = { tyrant: 'A CRATER TYRANT LUMBERS IN', urchin: 'A DREADURCHIN ROLLS FORTH', gorilla: 'A SILVERBACK BEATS THE DRUMS OF WAR' };
  if (MINI_LINES[type] && !N['_seen' + type]) { N['_seen' + type] = true; flashBanner(MINI_LINES[type]); }
  if (spec.type === 'ogre') flashBanner('AN OGRE APPROACHES');
  if (spec.type === 'spitter' && !N._spitSeen) { N._spitSeen = true; flashBanner('SPITTERS LOB FILTH FROM AFAR'); }
  if (spec.type === 'shade' && !N._shadeSeen) { N._shadeSeen = true; flashBanner('SHADES DRIFT OVER WALL AND BLADE'); }
  if (spec.type === 'chief' && !N._chiefSeen) { N._chiefSeen = true; flashBanner('A WAR CHIEF DRIVES THE HORDE'); }
}
function epos(e) { return e.free ? { u: e.fx, v: e.fz } : e.lane.at(e.d); }
/* raiders and saboteurs move freely; when their work is done they merge onto the nearest road */
function mergeOntoLane(e) {
  let bd = 1e9, bdd = 0;
  for (let d = 0; d <= e.lane.total; d += 1) {
    const p = e.lane.at(d), dd = Math.hypot(p.u - e.fx, p.v - e.fz);
    if (dd < bd) { bd = dd; bdd = d; }
  }
  e.d = bdd; e.free = false;
}
/* every building can be razed — and razed means gone until rebuilt with gold */
const BHP = { house: 8, mill: 8, field: 4, mine: 10, harbour: 8, tower: 12, barracks: 12, range: 10 };
const INCOME_T = new Set(['house', 'mill', 'field', 'mine', 'harbour']);
const BRUTES = new Set(['barrel', 'ogre', 'chief', 'skeleton']);
function hurtBldg(g, dmg) {
  if (g.dead) return;
  g.hp -= dmg;
  dmgNum(g.u, 2, g.v, dmg);
  sfx.hit();
  if (!g.hpEl) g.hpEl = ehpPool.take();
  if (g.hpEl) g.hpEl.firstChild.style.width = Math.max(0, 100 * g.hp / g.max) + '%';
  if (g.hp <= 0) {
    g.dead = true;
    poof(g.u, 1, g.v, true);
    sfx.castleHit();
    delete S.builds[g.id]; // razed — the plot must be bought again
    N._anyRazed = true;
    renderBuild(g.sl); g.sl.holder.clear();
    if (g.hpEl) { ehpPool.release(g.hpEl); g.hpEl = null; }
    if (g.type === 'tower') {
      const t = N.towers.find(x => x.id === g.id);
      if (t) { t.dead = true; if (t.ring) t.ring.visible = false; }
    }
    flashBanner('THE ' + BTYPES[g.type].name.toUpperCase() + ' IS RAZED');
  }
}
function spawnSaboteur() { // he comes for your buildings out of nowhere, and keeps coming
  const targets = N.bldgs.filter(g => !g.dead);
  if (!targets.length) return null;
  const g = targets[Math.floor(Math.random() * targets.length)];
  const lid = MAP.laneIds[Math.floor(Math.random() * MAP.laneIds.length)];
  const st = LANES[lid].start;
  const mesh = ART.bossArt('sab');
  scene.add(mesh);
  const hpScale = 1 + Math.max(0, S.day - 3) * .22;
  const hp = Math.round(14 * hpScale);
  const e = { type: 'sab', sab: true, extra: true, laneId: lid, lane: LANES[lid], d: 0, hp, max: hp,
    speed: 3, dmg: 6, rate: 1, ranged: 0, atkCd: .8, fly: false, mesh, dead: false,
    ph: Math.random() * 9, hpEl: null, kCd: .5, uCd: .7, pop: 1, flinch: 0, boss: false, brood: 0,
    free: true, fx: st[0], fz: st[1], tgt: g };
  N.enemies.push(e);
  flashBanner('A SABOTEUR SLIPS IN FROM THE DARK');
  sfx.night();
  return e;
}

/* ---- the secret of the second map: the Leviathan itself surfaces off the coast,
   on its own clock, lobbing brine at the keep until it dives again. Its wounds
   carry over night to night — slay it across nights for a royal bounty. ---- */
let SERP = { u: 40, v: 46 };
function spawnSerpent() {
  const mesh = ART.serpentArt();
  mesh.position.set(SERP.u, -8.5, SERP.v);
  mesh.lookAt(25, -8.5, 24);
  scene.add(mesh);
  const e = { type: 'serpent', serpent: true, laneId: 'S', lane: { at: () => ({ u: SERP.u, v: SERP.v }), total: 0 },
    d: 0, hp: S.serpent.hp, max: S.serpent.max, speed: 0, dmg: 3, rate: 2.1, ranged: 8,
    atkCd: 3, fly: false, mesh, dead: false, ph: 0, hpEl: null, kCd: .5, uCd: .7, pop: 0, flinch: 0,
    boss: false, brood: 0, rise: 0, leaveAt: N.t + 40 };
  N.enemies.push(e); // NOTE: not part of the wave count — a visitation, not an invader
  for (let i = 0; i < 3; i++) { // it does not come alone: the deep answers
    N.total++;
    spawnEnemy({ type: i % 2 ? 'jelly' : 'crab', lane: MAP.laneIds[Math.floor(Math.random() * MAP.laneIds.length)] });
  }
  $('#remainNum').textContent = N.total - N.killed;
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
const ehpPool = domPool(48, 'ehp');
function hurt(e, dmg) {
  if (e.dead) return;
  if (e.serpent) { // the titan keeps its own ledger
    if (e.leaving) return;
    e.hp -= dmg; e.flinch = 1;
    dmgNum(SERP.u, 5, SERP.v, dmg);
    sfx.hit();
    $('#serpFill').style.width = Math.max(0, 100 * e.hp / e.max) + '%';
    if (!e.leaving && e.hp > 0 && e.hp < e.max * .35 && !S.serpent._dove) {
      S.serpent._dove = true;
      e.leaving = true;
      $('#serpWrap').style.display = 'none';
      S.serpent.hp = Math.min(Math.round(e.max * .55), e.hp + 30); // it licks its wounds below
      N.serpentAt = N.t + 18; N.serp = null; // and it WILL be back tonight
      flashBanner('THE LEVIATHAN PLUNGES — IT WILL RETURN');
      sfx.roar();
      return;
    }
    if (e.hp <= 0) {
      e.dead = true;
      S.serpent.hp = 0; S.serpent.slain = true;
      $('#serpWrap').style.display = 'none';
      poof(SERP.u, 1, SERP.v, true); poof(SERP.u, 3.5, SERP.v, true);
      sfx.kill(true);
      dropCoins(38.5, 43.5, 12); // its hoard washes ashore
      earnCrowns(5);
      award('serpent');
      fxAdd({ kind: 'die', mesh: e.mesh, t: 0, dur: .5 });
      flashBanner('THE LEVIATHAN IS SLAIN — ITS HOARD WASHES ASHORE');
    }
    return;
  }
  e.hp -= dmg;
  const p = epos(e);
  dmgNum(p.u, e.fly ? 2.6 : 1.4, p.v, dmg);
  if (e.boss) {
    $('#bossFill').style.width = Math.max(0, 100 * e.hp / e.max) + '%';
    if (!e.enraged && e.hp < e.max * .4) { // wounded, it stops playing
      e.enraged = true; e.rate *= .68; e.speed *= 1.35;
      flashBanner(MAP.boss.name + ' RAGES'); sfx.roar();
      if (S.settings.shake && !matchMedia('(prefers-reduced-motion: reduce)').matches) shakeT = .35;
    }
  }
  else {
    if (!e.hpEl) e.hpEl = ehpPool.take();
    if (e.hpEl) e.hpEl.firstChild.style.width = Math.max(0, 100 * e.hp / e.max) + '%';
  }
  if (e.hp <= 0) {
    e.dead = true;
    const big = e.boss || e.type === 'ogre' || e.type === 'barrel';
    poof(p.u, e.fly ? 1.7 : .5, p.v, big);
    sfx.kill(big);
    if (e.boss) { $('#bossWrap').style.display = 'none'; N.boss = null; dropCoins(p.u, p.v, 6); flashBanner(MAP.boss.name + ' IS SLAIN'); award('boss'); }
    else if (e.sab) dropCoins(p.u, p.v, 3);
    else if (e.type === 'barrel') dropCoins(p.u, p.v, 1);   // the heavies carry loot
    else if (e.type === 'ogre') dropCoins(p.u, p.v, 2);
    else if (hasPerk('loot') && Math.random() < .25) dropCoins(p.u, p.v, 1);
    fxAdd({ kind: 'die', mesh: e.mesh, t: 0, dur: .34, fly: e.fly }); // removed from the scene when the squash ends
    if (e.hpEl) ehpPool.release(e.hpEl);
    if (!e.extra) { // visitations don't count toward the wave
      N.killed++;
      $('#remainNum').textContent = N.total - N.killed;
      setClock('#clockNight', N.killed / N.total);
    }
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
    const t = N.towers.find(x => x.id === w.sl.id); // gatehouse archers flee the rubble
    if (t) { t.dead = true; if (t.ring) t.ring.visible = false; }
    if (w.hpEl) { ehpPool.release(w.hpEl); w.hpEl = null; }
    flashBanner('THE WALL IS BREACHED');
  }
}
let shakeT = 0, flashT = null;
function hurtCastle(n) {
  S.castleHP = Math.max(0, S.castleHP - n);
  sfx.castleHit();
  const fl = $('#hitFlash'); // the throne room feels every blow
  if (fl) { fl.style.opacity = '.32'; clearTimeout(flashT); flashT = setTimeout(() => { fl.style.opacity = '0'; }, 70); }
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
  if (MAP.coldSnap && S.day >= 2) { // the cold cares nothing for banners
    N.snapT = (N.snapT == null ? 14 : N.snapT) - dt;
    if (N.snapT <= 0) {
      N.snapT = 24 + Math.random() * 10;
      N.units.forEach(un => { if (!un.dead) { un.stunT = 1.8; poof(un.u, .6, un.v); } });
      flashBanner('COLD SNAP — YOUR SOLDIERS FREEZE');
      sfx.freeze();
    }
  }
  if (N.sabAt && !N.sab && N.t >= N.sabAt) N.sab = spawnSaboteur();
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
        spawnEnemy({ type: e.broodType, lane: e.laneId });
        $('#remainNum').textContent = N.total - N.killed;
      }
    }
    /* the march may be blocked by a wall (fliers soar over) or a soldier in the road */
    let stop = e.lane.total - e.ranged, wall = null;
    if (!e.fly && !e.free) for (const w of N.walls) {
      if (!w.broken && w.lane === e.laneId && w.d - .8 > e.d - .01 && w.d - .8 < stop) { stop = w.d - .8; wall = w; }
    }
    const p0 = epos(e);
    let foe = null;
    if (!e.fly) {
      let bd = 1.3;
      for (const un of N.units) {
        if (un.dead) continue;
        const d = Math.hypot(un.u - p0.u, un.v - p0.v);
        if (d < bd) { bd = d; foe = un; }
      }
    }
    /* brutes smash any building beside the road as they pass */
    let bldg = null;
    if (!foe && !e.fly && !e.free && BRUTES.has(e.type)) {
      for (const g of N.bldgs) {
        if (g.dead) continue;
        if (Math.hypot(g.u - p0.u, g.v - p0.v) < 2.4) { bldg = g; break; }
      }
    }
    if (foe) {
      e.uCd -= dt;
      if (e.uCd <= 0) { e.uCd = e.rate; e.atkAnim = .35; hurtUnit(foe, e.dmg); }
    } else if (e.free) { // raiders and saboteurs cut across country toward their prize
      const g = e.tgt;
      if (!g || g.dead) {
        if (e.sab) {
          const alive = N.bldgs.filter(x => !x.dead);
          if (alive.length) e.tgt = alive[Math.floor(Math.random() * alive.length)];
          else mergeOntoLane(e);
        } else mergeOntoLane(e);
      } else {
        const d = Math.hypot(g.u - e.fx, g.v - e.fz);
        if (d > 1.7) {
          const mult = e.slowT > 0 ? .6 : 1;
          e.fx += (g.u - e.fx) / d * e.speed * mult * dt;
          e.fz += (g.v - e.fz) / d * e.speed * mult * dt;
        } else {
          e.atkCd -= dt;
          if (e.atkCd <= 0) { e.atkCd = e.rate; e.atkAnim = .35; hurtBldg(g, e.dmg); }
        }
      }
    } else if (bldg) { // siege the roadside building
      e.atkCd -= dt;
      if (e.atkCd <= 0) { e.atkCd = e.rate; e.atkAnim = .35; hurtBldg(bldg, e.dmg * (e.type === 'ogre' || e.boss ? 2 : 1)); }
    } else if (e.d < stop) {
      e.uCd = .7;
      let mult = (e.slowT > 0 ? .6 : 1) * (N.bellSlow || 1);
      if (chiefPos && e.type !== 'chief') { // the war chief's drums quicken the march
        const pp = epos(e);
        if (chiefPos.some(c => Math.hypot(c.u - pp.u, c.v - pp.v) < 5)) mult *= 1.3;
      }
      e.d = Math.min(stop, e.d + e.speed * mult * dt);
      if (e.trapAt && e.d >= e.trapAt) { e.trapAt = 0; poof(p0.u, .4, p0.v, true); sfx.kill(false); hurt(e, 999); }
    }
    else if (wall) {
      e.atkCd -= dt;
      if (e.atkCd <= 0) { e.atkCd = e.rate; e.atkAnim = .35; hurtWall(wall, e.dmg); }
    } else {
      e.atkCd -= dt;
      if (e.atkCd <= 0) {
        e.atkCd = e.rate;
        if (e.ranged) { // spitters lob filth; the Leviathan lobs brine
          const sp = epos(e);
          arrow(new THREE.Vector3(sp.u, e.serpent ? 4.4 : 1, sp.v), new THREE.Vector3(25, 2, 24.8), 3, () => hurtCastle(e.dmg), e.serpent);
        } else { e.atkAnim = .35; hurtCastle(e.dmg); }
      }
    }
    if (e.serpent) continue; // its body is animated by serpentTick, not the lane
    const p = epos(e);
    const q = e.free && e.tgt && !e.tgt.dead ? { u: e.tgt.u, v: e.tgt.v } : e.free ? { u: 25, v: 24 } : e.lane.at(e.d + .5);
    e.mesh.position.set(p.u, e.fly ? 0 : heightAt(p.u, p.v), p.v);
    if (foe && !foe.dead) e.mesh.lookAt(foe.u, 0, foe.v);
    else if (bldg) e.mesh.lookAt(bldg.u, 0, bldg.v);
    else e.mesh.lookAt(q.u, 0, q.v);
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
    if (['slime', 'runner', 'moonling', 'iceling', 'cinderling'].includes(e.type)) {
      const sq = e.type === 'runner' ? 14 : 9;
      body.scale.y = 1 + Math.sin(N.t * sq + e.ph) * .16;
      body.position.y = Math.abs(Math.sin(N.t * sq + e.ph)) * .22;
    } else if (e.fly) {
      const a = Math.sin(N.t * 40 + e.ph) * .6, w = e.mesh.userData.wings;
      if (w) { w[0].rotation.x = -.9 + a * .3; w[1].rotation.x = .9 - a * .3; }
      else body.position.y = (e.mesh.userData.hoverY || 1) + Math.sin(N.t * 3 + e.ph) * .22; // shades and machines hover at their own height
    } else body.rotation.z = Math.sin(N.t * 7 + e.ph) * .07;
    if (e.atkAnim > 0) { // the blow itself: a whole-body lunge
      e.atkAnim -= dt;
      body.rotation.x = -Math.sin(Math.max(0, e.atkAnim) / .35 * Math.PI) * .5;
    }
    /* brawlers turn on the king when he rides into them */
    if (!e.fly && !K.down && Math.hypot(p.u - K.u, p.v - K.v) < 1.35) {
      e.kCd -= dt;
      if (e.kCd <= 0) { e.kCd = e.rate; hurtKing(e.dmg); }
    }
    if (e.hpEl) anchor(e.hpEl, p.u, e.fly ? 2.9 : 1.8, p.v);
  }
  N.enemies = N.enemies.filter(e => !e.dead);
  for (const w of N.walls) if (w.hpEl && !w.broken) anchor(w.hpEl, w.u, 2.8, w.v);
  for (const g of N.bldgs) if (g.hpEl && !g.dead) anchor(g.hpEl, g.u, 2.6, g.v);
  for (const t of N.towers) {
    if (t.dead) continue;
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
  const horn = N.t < N.hornUntil; // the rally horn quickens king and soldiers alike
  for (const un of N.units) {
    if (un.dead) continue;
    if (un.stunT > 0) { un.stunT -= dt; continue; } // rimed solid for a breath
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
      if (!un.following && !K.down && Math.hypot(un.u - K.u, un.v - K.v) < 5.5) { un.following = true; poof(un.u, .9, un.v); }
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
    if (hasPerk('outriders')) sp *= 1.25;
    if (!charge) un.tgt = null;
    let walking = false;
    if (tx !== null) {
      const dx = tx - un.u, dz = tz - un.v, d = Math.hypot(dx, dz);
      if (d > stopAt) {
        const mv = Math.min(d, sp * dt);
        slideMove(un, un.u + dx / d * mv, un.v + dz / d * mv);
        un.mesh.lookAt(tx, 0, tz);
        walking = true;
      }
    }
    un.ring.visible = follow && !!un.following;
    un.mesh.position.x = un.u; un.mesh.position.z = un.v;
    un.mesh.position.y = heightAt(un.u, un.v) + Math.abs(Math.sin(N.t * (walking ? 9 : 5) + un.bob)) * (walking ? .12 : .05);
    if (un.cd <= 0) {
      let e = charge && un.tgt && !un.tgt.dead ? un.tgt : null;
      if (e) { const pt = epos(e); if (Math.hypot(pt.u - un.u, pt.v - un.v) > un.range * 1.1) e = null; }
      if (!e) e = nearestEnemy(un.u, un.v, un.range * (charge ? 1.5 : 1));
      if (e) {
        un.cd = un.rate * (horn ? .7 : 1); const p = epos(e);
        un.mesh.lookAt(p.u, 0, p.v);
        if (un.range > 4) arrow(new THREE.Vector3(un.u, 1.1, un.v), new THREE.Vector3(p.u, e.fly ? 1.7 : .6, p.v), 1.6, () => {
          hurt(e, un.dmg);
          if (un.splash) for (const o of [...N.enemies]) { const q = epos(o); if (o !== e && Math.hypot(q.u - p.u, q.v - p.v) < un.splash) hurt(o, un.dmg); }
        }, un.kind === 'fire');
        else { hurt(e, un.dmg * (charge ? 1.15 : 1)); poof(p.u, .8, p.v); }
      } else un.cd = .15;
    }
    if (un.hpEl) anchor(un.hpEl, un.u, 2.2, un.v);
  }
  N.units = N.units.filter(u => !u.dead);
  N.kingCd -= dt;
  if (N.kingCd <= 0 && !K.down) {
    const W = WEAPONS[S.weapon];
    const e = nearestEnemy(K.u, K.v, W.reach);
    if (e) {
      N.kingCd = W.rate * (horn ? .62 : 1);
      const p = epos(e);
      if (W.ranged) arrow(new THREE.Vector3(K.u, 2, K.v), new THREE.Vector3(p.u, e.fly ? 1.7 : .6, p.v), 1.3,
        () => { hurt(e, W.dmg, .2); if (W.chill) e.slowT = 2; });
      else {
        K.atkAnim = .3;
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
  updAb('#abSpear', '#abSpearCd', N.abQ, qMax());
  updAb('#abHorn', '#abHornCd', N.abE, 14);
  if (!N.queue.length && N.spawned === N.total && N.killed === N.total && !N.over) endNight(true);
}
function updAb(bsel, csel, cd, max) {
  $(csel).style.setProperty('--cd', (cd / max * 100).toFixed(1));
  $(bsel).classList.toggle('ready', cd <= 0);
}
const qMax = () => WEAPONS[S.weapon].qcd * (META.owned.arcana ? .75 : 1);
function useQ() {
  if (!N || N.over || N.abQ > 0 || K.down) return;
  const W = WEAPONS[S.weapon];
  if (S.weapon === 'frost') { // blizzard — the whole field freezes mid-stride
    if (!N.enemies.some(e => !e.dead && !e.serpent)) { flashBanner('NO TARGET IN RANGE'); return; }
    N.abQ = qMax();
    sfx.freeze();
    N.enemies.forEach(e => {
      if (e.dead || e.serpent) return;
      e.stunT = 2.5; e.slowT = Math.max(e.slowT || 0, 4.5);
      const p = epos(e); poof(p.u, .6, p.v);
      if (META.owned.arcana) hurt(e, 3); // studied frost bites as it binds
    });
    flashBanner('BLIZZARD!');
    return;
  }
  if (S.weapon === 'hammer') { // ground slam — everything nearby is crushed and thrown back
    const hits = N.enemies.filter(e => { if (e.dead || e.fly) return false; const p = epos(e); return Math.hypot(p.u - K.u, p.v - K.v) < 4.2; });
    if (!hits.length) { flashBanner('NO TARGET IN RANGE'); return; }
    N.abQ = qMax();
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
    N.abQ = qMax();
    sfx.spear();
    es.forEach((e, i) => { const p = epos(e);
      arrow(new THREE.Vector3(K.u, 2.4, K.v), new THREE.Vector3(p.u, e.fly ? 1.7 : .7, p.v), 2.5 + i * .3,
        () => { hurt(e, 4, .4); poof(p.u, .9, p.v); }, i === 0); });
    return;
  }
  const e = nearestEnemy(K.u, K.v, 10); // spear throw
  if (!e) { flashBanner('NO TARGET IN RANGE'); return; }
  N.abQ = qMax();
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
  N.bldgs.forEach(g => { if (g.hpEl) ehpPool.release(g.hpEl); });
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
  N.over = true; N._win = win;
  N.endCd = win ? .65 : .25; // sim clock first (works under headless pumps) …
  setTimeout(() => { // … real clock as fallback (hidden tabs, throttled timers)
    if (N && N.endCd != null) { N.endCd = null; finishNight(); }
  }, win ? 750 : 320);
}
function finishNight() {
  const win = N._win;
  {
    const slain = N.killed, integ = Math.round(100 * S.castleHP / S.castleMax);
    cleanupNight();
    win ? sfx.victory() : sfx.defeat();
    if (win) {
      try { const b = +localStorage.tf_best || 0; if (S.day > b) localStorage.tf_best = S.day; } catch { /* private mode */ }
      BESTS[S.map] = Math.max(BESTS[S.map] || 0, S.day); saveBests(); // mastery of THIS map unlocks the next
      award('first');
      if (S.day >= 5) award('n5');
      if (S.day >= 10) award('n10');
      if (S.day >= 15) award('n15');
      if (S.day >= 6 && !N._anyRazed) award('raze0');
      if (Object.values(MAPS).filter(m => mapUnlocked(m)).length >= 3) award('maps3');
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
  }
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
    else if (b.type === 'harbour') v = Math.min(b.upg2 ? 7 : 5, b.boats + 1) * (b.upg ? 2 : 1);
    if (v) drops.push([sl.u, sl.v, v]);
  }
  applyDawn(); S.day++; S.castleHP = S.castleMax;
  N = null; setPhase('day'); revealPlots(); refreshDayHUD();
  cine('DAY ' + S.day);
  SLOTS.forEach(sl => { const b = S.builds[sl.id]; if (b && b.type === 'wall') sl.holder.scale.y = 1; }); // masons repair overnight
  for (const [u, v, val] of drops) dropCoins(u, v, val);
  flashHint('Dawn taxes lie in the streets — ride and collect, then build');
  if (MAP.merchant && S.day > 2 && S.day % 3 === 0) setTimeout(openMerchant, 1400);
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
$('#vicMenu').addEventListener('click', () => { // retire with honors — crowns are already banked
  $('#ovVictory').style.display = 'none';
  N = null; resetRun(); setView('menu'); refreshMapCards();
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
  S.serpent = MAP.serpent ? { hp: 140, max: 140, slain: false } : null;
  S._saga = false;
  if (typeof CHEAT !== 'undefined') { // the crown's testing boons persist into the run
    if (CHEAT.gold) S.gold += CHEAT.gold;
    if (CHEAT.god) { S.castleMax = 999; S.castleHP = 999; K.max = 200; K.hp = 200; }
    if (CHEAT.day) { S.day = CHEAT.day; }
  }
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
  $$('.mcard').forEach(c => {
    const def = MAPS[c.dataset.m];
    const locked = !mapUnlocked(def);
    c.classList.toggle('locked', locked);
    const lk = c.querySelector('.lock');
    if (lk) {
      if (def.unlockAfter) lk.textContent = '🔒 ' + def.unlockAfter.nights + ' nights in ' + MAPS[def.unlockAfter.map].name;
      lk.style.display = locked ? '' : 'none';
    }
    c.classList.toggle('on', c.dataset.m === S.map);
  });
}
$$('.mcard').forEach(c => c.addEventListener('click', () => {
  const id = c.dataset.m;
  if (id === S.map) return;
  if (!mapUnlocked(MAPS[id])) { sfx.error(); return; }
  loadMap(id); refreshMapCards(); refreshDayHUD();
}));
$$('.pchip').forEach(c => c.addEventListener('click', () => togglePerk(c.dataset.p)));
$$('.pchip').forEach(c => c.classList.toggle('on', perkSet.has(c.dataset.p)));
$('#beginNight').addEventListener('click', startNight);
function anyOverlay() { return ['ovVictory', 'ovDefeat', 'ovCleared', 'ovPause', 'ovSettings', 'ovArmory', 'ovAch', 'ovMerchant'].some(id => $('#' + id).style.display === 'grid'); }
$('#pauseBtn').addEventListener('click', () => { $('#ovPause').style.display = 'grid'; });
$('#pauseResume').addEventListener('click', () => { $('#ovPause').style.display = 'none'; });
$('#pauseRestart').addEventListener('click', () => {
  $('#ovPause').style.display = 'none';
  if (S.phaseName !== 'night') return; // nothing to restart by daylight
  abortNight(); startNight();
});
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
bindSet('#setMusic', 'music'); bindSet('#setSound', 'sound'); bindSet('#setTilt', 'tilt'); bindSet('#setMini', 'mini');
function syncSetUI() {
  $('#setDmg').checked = S.settings.dmg; $('#setRanges').checked = S.settings.ranges;
  $('#setShake').checked = S.settings.shake; $('#setMusic').checked = S.settings.music;
  $('#setSound').checked = S.settings.sound; $('#setTilt').checked = S.settings.tilt;
  $('#setMini').checked = S.settings.mini;
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
      N.units.forEach(un => {
        un.ring.visible = false;
        if (un.following) { un.pu = un.u; un.pv = un.v; poof(un.u, .4, un.v); }
        un.following = false;
      });
    /* entering Follow gathers only the soldiers inside the muster circle — ride near others to add them */
    if (to === 'follow') {
      joined = 0;
      N.units.forEach(un => {
        un.following = !un.dead && Math.hypot(un.u - K.u, un.v - K.v) < 5.5;
        if (un.following) joined++;
      });
    }
  }
  S.stance = to;
  if (K.ring) K.ring.visible = S.phaseName === 'night' && to === 'follow';
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
  if (['w', 'a', 's', 'd', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { keys[k] = true; if (k.startsWith('arrow')) e.preventDefault(); return; }
  if (e.repeat) return;
  if (e.key === ' ' && S.view === 'game' && S.phaseName === 'day' && !anyOverlay()) { e.preventDefault(); startNight(); }
  else if (k === 'e' && S.view === 'game' && S.phaseName === 'day' && nearSlot && !anyOverlay()) {
    /* second press of E confirms the first affordable option in the open menu */
    if (bmenu.style.display === 'block' && bmenu.dataset.slot === (nearSlot.id || 'castle')) {
      const btn = bmenu.querySelector('.bopt:not(:disabled)');
      if (btn) btn.click();
    } else (nearSlot.castle || S.builds[nearSlot.id]) ? slotAction(nearSlot) : tryBuild(nearSlot);
  }
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
  else if (e.key === 'Escape' && S.view === 'game' && (S.phaseName === 'day' || (N && !N.over)))
    $('#ovPause').style.display = $('#ovPause').style.display === 'grid' ? 'none' : 'grid';
});
document.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
/* alt-tabbing away must not leave a key stuck down — the king would ride forever */
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
/* buttons must not keep focus, or Space re-triggers them mid-game */
document.addEventListener('click', e => { const b = e.target.closest('button'); if (b) { b.blur(); if (!b.disabled) sfx.ui(); } });

/* ============================== wave preview & castle bar ============================== */
function updateFloaters() {
  /* day: tonight's full wave preview · night: enemies still to spawn from each road */
  const cnt = { A: 0, B: 0, C: 0 };
  let showPrev = false;
  if (S.view === 'game' && S.phaseName === 'day') { showPrev = true; nightPlan(S.day).forEach(e => cnt[e.lane]++); }
  else if (S.view === 'game' && N && !N.over) { showPrev = true; N.queue.forEach(e => { if (e.lane) cnt[e.lane]++; }); }
  for (const lid of ['A', 'B', 'C', 'D']) {
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

/* ============================== minimap ============================== */
const miniC = $('#mini'), miniX = miniC.getContext('2d');
let miniTick = 0;
function drawMini() {
  if (!S.settings.mini || S.view !== 'game') { miniC.style.display = 'none'; return; }
  miniC.style.display = 'block';
  if (miniTick++ % 6) return; // ~10 fps is plenty for a map
  const t = MAP.terrain || {}, sx = t.sx || 1, sz = t.sz || 1, sc = t.sc || 1;
  const bu = (MAP.bounds || {}).u || [0, 50], bv = (MAP.bounds || {}).v || [0, 50];
  const span = Math.max(bu[1] - bu[0], bv[1] - bv[0]) + 6;
  const px = (u, v) => [(u - 25) / span * 168 + 88, (v - 25) / span * 168 + 88];
  const X = miniX;
  X.clearRect(0, 0, 176, 176);
  /* the island silhouette from the same coast formula */
  X.beginPath();
  for (let i = 0; i <= 72; i++) {
    const th = i / 72 * Math.PI * 2, c = Math.cos(th), s2 = Math.sin(th);
    const base = 24 / Math.pow(Math.max(Math.abs(c), Math.abs(s2)), 0.72);
    const wob = Math.sin(th * 3 + 1.7) * 1.1 + Math.sin(th * 5 + .4) * .7 + Math.sin(th * 8 + 2.9) * .45;
    const r = (base + wob) * sc;
    const [mx, my] = px(25 + r * c * sx, 25 + r * s2 * sz);
    i ? X.lineTo(mx, my) : X.moveTo(mx, my);
  }
  X.closePath();
  X.fillStyle = 'rgba(120,140,110,.35)'; X.fill();
  /* roads */
  X.strokeStyle = 'rgba(229,201,143,.55)'; X.lineWidth = 2;
  for (const lid of MAP.laneIds) {
    const pts = MAP.lanePts[lid];
    X.beginPath();
    pts.forEach(([u, v], i) => { const [mx, my] = px(u, v); i ? X.lineTo(mx, my) : X.moveTo(mx, my); });
    X.stroke();
  }
  /* buildings and walls */
  for (const sl of SLOTS) {
    const b = S.builds[sl.id]; if (!b) continue;
    const [mx, my] = px(sl.u, sl.v);
    X.fillStyle = b.type === 'wall' ? '#C9D2DE' : INCOME_T.has(b.type) ? '#F0B429' : '#B8C4E8';
    X.fillRect(mx - 1.5, my - 1.5, 3, 3);
  }
  /* the keep */
  { const [mx, my] = px(25, 24); X.fillStyle = '#F6C95C'; X.beginPath(); X.moveTo(mx, my - 4); X.lineTo(mx + 3.5, my); X.lineTo(mx, my + 4); X.lineTo(mx - 3.5, my); X.closePath(); X.fill(); }
  /* coins worth riding for */
  X.fillStyle = '#FFD97A';
  for (const c of groundCoins) { const [mx, my] = px(c.x, c.z); X.fillRect(mx - 1, my - 1, 2, 2); }
  if (N) {
    /* soldiers */
    X.fillStyle = '#8FD8F0';
    for (const un of N.units) { if (un.dead) continue; const [mx, my] = px(un.u, un.v); X.fillRect(mx - 1, my - 1, 2, 2); }
    /* the horde */
    for (const e of N.enemies) {
      if (e.dead) continue;
      const p = epos(e), [mx, my] = px(p.u, p.v);
      X.fillStyle = e.serpent ? '#7BE0C8' : e.boss ? '#FF6A3D' : '#E64A53';
      const r2 = e.boss || e.serpent ? 3 : 1.6;
      X.beginPath(); X.arc(mx, my, r2, 0, 7); X.fill();
    }
  }
  /* the rider */
  if (!(K.down > 0)) {
    const [mx, my] = px(K.u, K.v);
    X.fillStyle = '#FFE9A6'; X.beginPath(); X.arc(mx, my, 2.6, 0, 7); X.fill();
    X.strokeStyle = 'rgba(255,233,166,.6)'; X.lineWidth = 1; X.beginPath(); X.arc(mx, my, 4.5, 0, 7); X.stroke();
  }
}

/* cinematic title card */
function cine(txt) {
  const c = $('#cine');
  c.textContent = txt;
  c.classList.remove('show');
  void c.offsetWidth;
  c.classList.add('show');
}

/* ============================== camera ============================== */
const CAMOFF = new THREE.Vector3(17.5, 36, 17.5);
const camTarget = new THREE.Vector3(25, 0, 27);
let menuAngle = 0;
function updateCamera(dt) {
  if (S.view === 'menu') {
    menuAngle += dt * .07;
    const t = (MAP && MAP.terrain) || {};
    const mr = 62 * Math.max(t.sc || 1, ((t.sc || 1) + (t.sx || 1)) / 2);
    camera.position.set(25 + Math.cos(menuAngle) * mr, 44 * mr / 62, 25 + Math.sin(menuAngle) * mr);
    camera.lookAt(25, 0, 25);
    return;
  }
  const zoom = (1 + phase.t * .18) * ((MAP && MAP.camZoom) || 1);
  /* the camera leads the gallop slightly so you see where you're riding */
  camTarget.x = THREE.MathUtils.damp(camTarget.x, K.u + K.vx * .55, 5, dt);
  camTarget.z = THREE.MathUtils.damp(camTarget.z, K.v + K.vz * .55, 5, dt);
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
  if (N && N.over && N.endCd != null) {
    N.endCd -= dt;
    if (N.endCd <= 0) { N.endCd = null; finishNight(); }
  }
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
  drawMini();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
window.__pump = s => { for (let i = 0; i < Math.round(s * 60); i++) step(STEP); };
window.__dbg = { S, K, keys, AUDIO, get N() { return N; }, get MAP() { return MAP; }, get coins() { return groundCoins.length; } };
/* seal the realm into a code, carry it anywhere */
function saveCode() {
  const d = { v: 1, map: S.map, day: S.day, gold: S.gold, builds: S.builds, lvl: S.castleLvl,
    max: S.castleMax, serp: S.serpent, saga: !!S._saga, char: S.char, weap: S.weapon };
  return 'TF1.' + btoa(unescape(encodeURIComponent(JSON.stringify(d))));
}
function loadCode(code) {
  try {
    code = String(code || '').trim();
    if (!code.startsWith('TF1.')) return false;
    const d = JSON.parse(decodeURIComponent(escape(atob(code.slice(4)))));
    if (!MAPS[d.map]) return false;
    loadMap(d.map);
    S.day = d.day || 1; S.gold = d.gold || 8;
    S.castleLvl = d.lvl || 1; S.castleMax = d.max || 15; S.castleHP = S.castleMax;
    if (d.serp) S.serpent = d.serp;
    S._saga = !!d.saga;
    S.builds = d.builds || {};
    for (let i = 2; i <= S.castleLvl; i++) { const tr = ART.castleTrim(i); castle.add(tr); castleTrims.push(tr); }
    SLOTS.forEach(sl => {
      if (S.builds[sl.id]) sl.hidden = false;
      renderBuild(sl); sl.pop = 0; sl.holder.scale.setScalar(1);
    });
    setChar(d.char || 'aldric'); setWeapon(d.weap || 'spear');
    revealPlots(true); refreshDayHUD(); setPhase('day'); setView('game');
    flashHint('The realm remembers — day ' + S.day + ' on ' + MAP.name);
    return true;
  } catch { return false; }
}
window.saveCode = saveCode; window.loadCode = loadCode;
$('#pauseSave').addEventListener('click', () => {
  const code = saveCode();
  try { navigator.clipboard.writeText(code); } catch { /* no clipboard */ }
  prompt('Your save code (copied to clipboard) — keep it safe:', code);
});
$('#loadBtn').addEventListener('click', () => {
  const code = prompt('Paste your save code:');
  if (code && loadCode(code)) { $('#ovPause').style.display = 'none'; }
  else if (code) { sfx.error(); alert('That code would not open.'); }
});
$('#achBtn').addEventListener('click', () => { refreshAch(); $('#ovAch').style.display = 'grid'; });
$('#achClose').addEventListener('click', () => { $('#ovAch').style.display = 'none'; });
$('#cheatGo').addEventListener('click', () => {
  const out = window.cheat($('#cheatIn').value);
  $('#cheatOut').textContent = out;
  $('#cheatIn').value = '';
});
$('#cheatGo2').addEventListener('click', () => {
  const out = window.cheat($('#cheatIn2').value);
  $('#cheatOut2').textContent = out;
  $('#cheatIn2').value = '';
});

/* the wandering merchant of the far realms */
const MERCH_POOL = [
  { id: 'merc', ic: '⚔️', n: 'Sellsword Band', d: 'Three veteran knights fight for you tonight', c: 6 },
  { id: 'trap', ic: '🪤', n: 'Bear Traps', d: 'The first 4 invaders down the roads are snared and slain', c: 7 },
  { id: 'tonic', ic: '🧪', n: 'Hearth Tonic', d: 'The King gains +6 max HP for this run', c: 5 },
  { id: 'powder', ic: '🧨', n: 'Blast Powder', d: 'Every tower strikes +1 harder tonight', c: 6 },
  { id: 'bell', ic: '🔔', n: 'Warning Bell', d: 'Tonight the horde marches 12% slower', c: 4 },
];
function openMerchant() {
  if (S.view !== 'game' || S.phaseName !== 'day' || anyOverlay()) return; // he waits politely outside
  const offers = [...MERCH_POOL].sort(() => Math.random() - .5).slice(0, 3);
  $('#merchRows').innerHTML = offers.map(o =>
    '<div class="aitem" data-mc="' + o.id + '" data-c="' + o.c + '"><span class="ic">' + o.ic + '</span><span><span class="nm">' + o.n +
    '</span><br><span class="ds">' + o.d + '</span></span><button>🪙 ' + o.c + '</button></div>').join('');
  $('#ovMerchant').style.display = 'grid';
  $$('#merchRows .aitem button').forEach(b => b.addEventListener('click', () => {
    const el = b.closest('.aitem'), id = el.dataset.mc, c = +el.dataset.c;
    if (S.gold < c) { sfx.error(); return; }
    S.gold -= c; refreshDayHUD(); sfx.upgrade();
    if (id === 'merc') S._mercs = 3;
    if (id === 'trap') S._traps = 4;
    if (id === 'tonic') { K.max += 6; K.hp = K.max; }
    if (id === 'powder') S._powder = true;
    if (id === 'bell') S._bell = true;
    b.textContent = 'SOLD'; b.disabled = true;
  }));
}
$('#merchClose').addEventListener('click', () => { $('#ovMerchant').style.display = 'none'; });
window.openMerchant = openMerchant;
/* the crown's testing chamber: type a word of power into the Armory */
const CHEAT = { gold: 0, god: false, day: 0 };
window.cheat = (code) => {
  code = String(code || '').trim().toLowerCase();
  if (code === 'gold') { S.gold += 200; CHEAT.gold += 200; refreshGold(); refreshDayHUD(); return 'gold +200 (kept through PLAY)'; }
  if (code === 'crowns') { earnCrowns(100); return 'crowns +100'; }
  if (code === 'unlock') {
    for (const id in MAPS) BESTS[id] = 30;
    saveBests();
    for (const id in ARMORY) META.owned[id] = true;
    saveMeta(); applyOwned(); refreshArmory(); refreshMapCards();
    return 'all realms and armory unlocked';
  }
  if (code.startsWith('day')) {
    const d = parseInt(code.slice(3).trim(), 10);
    if (d > 0) { CHEAT.day = d; S.day = d; S.gold += d * 4; revealPlots(true); refreshDayHUD(); return 'jumped to day ' + d + ' (kept through PLAY)'; }
  }
  if (code === 'god') { CHEAT.god = true; S.castleMax = 999; S.castleHP = 999; K.max = 200; K.hp = 200; return 'castle and king fortified (kept through PLAY)'; }
  if (code === 'night') { if (S.phaseName === 'day' && S.view === 'game') { startNight(); return 'night falls at your command'; } return 'only by day, in the field'; }
  if (code === 'win') {
    if (N && !N.over) {
      N.queue.length = 0;
      N.total = N.spawned;
      $('#remainNum').textContent = N.total - N.killed;
      for (const e of [...N.enemies]) if (!e.dead && !e.extra && !e.serpent) hurt(e, 99999);
      return 'the horde is swept away';
    }
    return 'no battle to win';
  }
  if (code === 'medals') { for (const k in ACHS) award(k); return 'all medals'; }
  if (code === 'sovereign') return 'words of power: gold · crowns · unlock · day N · god · medals · night · win';
  return 'nothing happens';
};

/* ============================== boot & test scenarios ============================== */
try { setChar(S.char); } catch { setChar('aldric'); }
{
  let mapStart = 'nordfels';
  try {
    const m = localStorage.tf_map;
    if (MAPS[m] && mapUnlocked(MAPS[m])) mapStart = m;
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
refreshAch();
refreshDayHUD();
setPhase('day'); setView('menu');
{ const bs = $('#boot'); if (bs) { bs.style.opacity = '0'; setTimeout(() => bs.remove(), 700); } }
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
