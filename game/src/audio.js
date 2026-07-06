/* audio.js — procedural WebAudio for Thronefall Web Remake: synth sfx + a generative
   day/night score. No samples, no assets; the AudioContext wakes on the first gesture. */
'use strict';

let ctx = null, master, sfxBus, musBus, dayBus, nightBus;
let enabled = { music: true, sound: true };

function init() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return; }
  try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; }
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 8;
  master = ctx.createGain(); master.gain.value = .9;
  master.connect(comp); comp.connect(ctx.destination);
  sfxBus = ctx.createGain(); sfxBus.gain.value = enabled.sound ? 1 : 0; sfxBus.connect(master);
  musBus = ctx.createGain(); musBus.gain.value = enabled.music ? 1 : 0; musBus.connect(master);
  dayBus = ctx.createGain(); dayBus.gain.value = 1; dayBus.connect(musBus);
  nightBus = ctx.createGain(); nightBus.gain.value = 0; nightBus.connect(musBus);
  startScore();
}
function arm() {
  const kick = () => { init(); removeEventListener('pointerdown', kick); removeEventListener('keydown', kick); };
  addEventListener('pointerdown', kick); addEventListener('keydown', kick);
}
function setEnabled(music, sound) {
  enabled = { music, sound };
  if (!ctx) return;
  musBus.gain.value = music ? 1 : 0;
  sfxBus.gain.value = sound ? 1 : 0;
}
function setPhase(t) { // equal-power crossfade between the two score layers
  if (!ctx) return;
  const w = t * Math.PI / 2;
  dayBus.gain.value = Math.cos(w);
  nightBus.gain.value = Math.sin(w) * 1.1;
}

/* ---------- tiny synth voices ---------- */
function tone(bus, { f = 440, type = 'sine', t = 0, a = .01, d = .3, v = .5, bend = null, fc = null }) {
  if (!ctx || !bus) return;
  const T = ctx.currentTime + t;
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(f, T);
  if (bend) o.frequency.exponentialRampToValueAtTime(Math.max(20, bend), T + a + d);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, T);
  g.gain.linearRampToValueAtTime(v, T + a);
  g.gain.exponentialRampToValueAtTime(.0001, T + a + d);
  let head = o;
  if (fc) { const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = fc; o.connect(fl); head = fl; }
  head.connect(g); g.connect(bus);
  o.start(T); o.stop(T + a + d + .1);
}
let noiseBuf = null;
function noise(bus, { t = 0, d = .2, v = .4, fc = 1200, bend = null, q = .7, type = 'bandpass' }) {
  if (!ctx || !bus) return;
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * .5, ctx.sampleRate);
    const ch = noiseBuf.getChannelData(0);
    for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  const T = ctx.currentTime + t;
  const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const fl = ctx.createBiquadFilter();
  fl.type = type; fl.frequency.setValueAtTime(fc, T); fl.Q.value = q;
  if (bend) fl.frequency.exponentialRampToValueAtTime(Math.max(30, bend), T + d);
  const g = ctx.createGain();
  g.gain.setValueAtTime(v, T);
  g.gain.exponentialRampToValueAtTime(.0001, T + d);
  s.connect(fl); fl.connect(g); g.connect(bus);
  s.start(T); s.stop(T + d + .05);
}
/* per-name rate gate so 30 simultaneous arrows don't stack into a screech */
const lastAt = {};
function ready(name, gap) {
  if (!ctx) return false;
  const now = performance.now();
  if (lastAt[name] && now - lastAt[name] < gap) return false;
  lastAt[name] = now; return true;
}

/* ---------- sfx ---------- */
export const sfx = {
  ui()      { if (ready('ui', 70)) tone(sfxBus, { f: 640, type: 'triangle', a: .004, d: .07, v: .14 }); },
  build()   { if (!ready('build', 90)) return;
    noise(sfxBus, { d: .16, v: .3, fc: 320, bend: 110, type: 'lowpass' });
    tone(sfxBus, { f: 196, type: 'triangle', a: .005, d: .18, v: .28 });
    tone(sfxBus, { f: 392, t: .07, type: 'triangle', a: .005, d: .22, v: .18 }); },
  upgrade() { [523, 659, 784, 1047].forEach((f, i) => tone(sfxBus, { f, t: i * .07, type: 'triangle', a: .005, d: .28, v: .17 })); },
  coin()    { if (!ready('coin', 55)) return;
    const f = 1150 + Math.random() * 200;
    tone(sfxBus, { f, type: 'sine', a: .003, d: .12, v: .15 });
    tone(sfxBus, { f: f * 1.5, t: .03, type: 'sine', a: .003, d: .16, v: .09 }); },
  arrow()   { if (ready('arrow', 75)) noise(sfxBus, { d: .11, v: .1, fc: 2600, bend: 800, q: 1.4 }); },
  hit()     { if (!ready('hit', 50)) return;
    noise(sfxBus, { d: .07, v: .18, fc: 700, bend: 240, type: 'lowpass' });
    tone(sfxBus, { f: 130 + Math.random() * 50, type: 'square', a: .003, d: .06, v: .1 }); },
  kill(big) { if (!ready('kill', 65)) return;
    tone(sfxBus, { f: big ? 210 : 430, bend: big ? 55 : 120, type: 'square', a: .004, d: big ? .3 : .15, v: big ? .26 : .17 });
    noise(sfxBus, { d: big ? .3 : .13, v: big ? .24 : .12, fc: big ? 380 : 900, bend: 130, type: 'lowpass' }); },
  castleHit() { if (!ready('castle', 160)) return;
    tone(sfxBus, { f: 68, bend: 38, type: 'sine', a: .005, d: .5, v: .5 });
    noise(sfxBus, { d: .35, v: .28, fc: 240, bend: 70, type: 'lowpass' }); },
  kingHit() { if (ready('kingH', 130)) tone(sfxBus, { f: 185, bend: 115, type: 'sawtooth', a: .004, d: .15, v: .2 }); },
  fallen()  { [220, 175, 147, 110].forEach((f, i) => tone(sfxBus, { f, t: i * .16, type: 'sawtooth', a: .01, d: .32, v: .16, fc: 900 })); },
  spear()   { noise(sfxBus, { d: .28, v: .26, fc: 3200, bend: 480, q: 1 });
    tone(sfxBus, { f: 320, bend: 540, type: 'triangle', a: .01, d: .2, v: .16 }); },
  slam()    { tone(sfxBus, { f: 75, bend: 40, type: 'sine', a: .005, d: .45, v: .5 });
    noise(sfxBus, { d: .3, v: .3, fc: 300, bend: 80, type: 'lowpass' }); },
  command() { tone(sfxBus, { f: 392, type: 'sawtooth', a: .01, d: .18, v: .11, fc: 1600 });
    tone(sfxBus, { f: 523, t: .09, type: 'sawtooth', a: .01, d: .22, v: .09, fc: 1600 }); },
  horn()    { [262, 330, 392].forEach(f => {
    tone(sfxBus, { f, type: 'sawtooth', a: .06, d: .85, v: .12, fc: 1400 });
    tone(sfxBus, { f: f * 1.006, type: 'sawtooth', a: .09, d: .85, v: .08, fc: 1200 }); }); },
  night()   { tone(sfxBus, { f: 98, type: 'sawtooth', a: .08, d: 1.3, v: .22, fc: 700 });
    tone(sfxBus, { f: 147, t: .12, type: 'sawtooth', a: .1, d: 1.1, v: .13, fc: 800 });
    noise(sfxBus, { d: .8, v: .14, fc: 150, bend: 55, type: 'lowpass' }); },
  dawn()    { [784, 988, 1175, 1568].forEach((f, i) => tone(sfxBus, { f, t: i * .09, type: 'sine', a: .004, d: .5, v: .13 })); },
  victory() { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(sfxBus, { f, t: i * .1, type: 'triangle', a: .01, d: .45, v: .15 })); },
  defeat()  { [330, 311, 262, 196].forEach((f, i) => tone(sfxBus, { f, t: i * .22, type: 'sawtooth', a: .02, d: .55, v: .14, fc: 1100 })); },
  error()   { tone(sfxBus, { f: 160, type: 'square', a: .004, d: .13, v: .12 });
    tone(sfxBus, { f: 151, type: 'square', a: .004, d: .13, v: .09 }); },
  roar()    { tone(sfxBus, { f: 58, bend: 130, type: 'sawtooth', a: .12, d: 1.6, v: .4, fc: 460 });
    noise(sfxBus, { d: 1.4, v: .3, fc: 360, bend: 90, type: 'lowpass' }); },
  freeze()  { [1568, 1245, 988, 784].forEach((f, i) => tone(sfxBus, { f, t: i * .06, type: 'sine', a: .004, d: .5, v: .11 }));
    noise(sfxBus, { d: .7, v: .16, fc: 5200, bend: 2100, q: 2 }); },
};

/* ---------- generative score: gentle folk plucks by day, drone + heartbeat by night ---------- */
const ROOT = 130.81; // C3
const st = n => ROOT * Math.pow(2, n / 12);
const DAY_CH = [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]]; // C · G · Am · F
const NITE_R = [9, 5, 9, 4];                                      // A · F · A · E drones
const NITE_SC = [9, 12, 16, 19, 21];                              // A-minor colors
const STEP = .36; // one eighth at ~83 bpm
let step = 0, nextT = 0;

function scheduleStep(s, at) {
  const bar = Math.floor(s / 8) % 4, pos = s % 8;
  const ch = DAY_CH[bar];
  /* day layer */
  if (pos === 0) {
    tone(dayBus, { f: st(ch[0]), t: at, type: 'sine', a: .6, d: 2.3, v: .05 });
    tone(dayBus, { f: st(ch[2]) / 2, t: at, type: 'sine', a: .7, d: 2.2, v: .04 });
  }
  if ([0, 3, 4, 6].includes(pos) && Math.random() < .8) {
    const n = ch[Math.floor(Math.random() * 3)] + 12 * (Math.random() < .3 ? 2 : 1);
    tone(dayBus, { f: st(n), t: at, type: 'triangle', a: .008, d: .7, v: .07 });
  }
  if (Math.random() < .12) tone(dayBus, { f: st(ch[Math.floor(Math.random() * 3)] + 24), t: at, type: 'sine', a: .02, d: 1.1, v: .035 });
  /* night layer */
  if (pos === 0) {
    const r = st(NITE_R[bar]) / 2;
    tone(nightBus, { f: r, t: at, type: 'sawtooth', a: .5, d: 2.6, v: .05, fc: 260 });
    tone(nightBus, { f: r * 1.005, t: at, type: 'sawtooth', a: .6, d: 2.6, v: .04, fc: 220 });
  }
  if (pos % 4 === 2) tone(nightBus, { f: 62, bend: 38, t: at, type: 'sine', a: .004, d: .22, v: .13 });
  if (pos % 2 === 1 && Math.random() < .28)
    tone(nightBus, { f: st(NITE_SC[Math.floor(Math.random() * NITE_SC.length)] + 12), t: at, type: 'sine', a: .02, d: .9, v: .045 });
}
function startScore() {
  nextT = ctx.currentTime + .15;
  setInterval(() => {
    if (!ctx || ctx.state !== 'running') return;
    if (nextT < ctx.currentTime) nextT = ctx.currentTime + .05; // tab was asleep
    while (nextT < ctx.currentTime + .45) { scheduleStep(step, nextT - ctx.currentTime); step++; nextT += STEP; }
  }, 110);
}

export const AUDIO = { arm, init, setPhase, setEnabled, get on() { return !!ctx; } };
