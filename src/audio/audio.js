// Audio : sons synthétisés hors ligne (voir synth.js / bank.js) puis joués en 3D (HRTF),
// avec atténuation des aigus selon la distance, réverbération de grotte, ambiances en boucle
// (pluie, vent, eau, lave, sous l'eau, Nether, End), oiseaux, grillons, gouttes, et musique générative.
import { BLOCKS } from '../blocks/blocks.js';
import { setSampleRate, makeRng, impulse } from './synth.js';
import { materialSound, creatureSound, effectSound, ambientLoop, ambientShot, splash } from './bank.js';
import { instrumentSample, compose, INSTRUMENTS, DISCS } from './songs.js';

const VARIANTS = 4;

export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ready = false;
    this.listener = [0, 0, 0];
    this.musicTimer = 30 + Math.random() * 60;
    this.dim = 0;
    this.cache = new Map();
    this.seed = 1;
    this.voices = 0;
    this.ambT = { bird: 4, cricket: 3, drip: 6, cave: 60 };
    this.songs = new Set();
    this.bgSong = null;
    this.inst = new Map();
    this.musicTimer = 15 + Math.random() * 15;
    const unlock = () => { this.init(); };
    addEventListener('pointerdown', unlock, { once: false });
    addEventListener('keydown', unlock, { once: false });
    addEventListener('touchstart', unlock, { once: false });
  }
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = this.ctx = new AC();
      setSampleRate(c.sampleRate);
      // limiteur en sortie : pas de saturation quand beaucoup de sons se superposent
      this.limiter = c.createDynamicsCompressor();
      this.limiter.threshold.value = -10; this.limiter.knee.value = 8; this.limiter.ratio.value = 6;
      this.limiter.attack.value = 0.004; this.limiter.release.value = 0.2;
      this.limiter.connect(c.destination);
      this.master = c.createGain(); this.master.connect(this.limiter);
      this.sfx = c.createGain(); this.sfx.connect(this.master);
      this.music = c.createGain(); this.music.connect(this.master);
      this.amb = c.createGain(); this.amb.connect(this.master);
      // réverbération : salle courte en surface, longue en grotte
      this.reverb = c.createConvolver();
      const ir = impulse(2.8, 3.2, 4500);
      const b = c.createBuffer(2, ir[0].length, c.sampleRate);
      b.copyToChannel(ir[0], 0); b.copyToChannel(ir[1], 1);
      this.reverb.buffer = b;
      this.revGain = c.createGain(); this.revGain.gain.value = 0.3;
      this.reverb.connect(this.revGain); this.revGain.connect(this.master);
      this.caveRev = c.createGain(); this.caveRev.gain.value = 0; this.caveRev.connect(this.reverb);
      this.ready = true;
      this.applyVolumes();
      // ambiances et préchauffage des sons courants, étalés pour ne pas bloquer
      setTimeout(() => this.startAmbience(), 50);
      const warm = ['grass', 'stone', 'wood', 'gravel', 'sand'].map((m) => () => this.variants('m:' + m + ':step', () => materialSound(m, 'step', this.rng())));
      warm.push(() => this.variants('e:click', () => effectSound('click', this.rng())));
      for (const n of ['hurt', 'attack_weak', 'attack_strong', 'explode', 'thunder']) warm.push(() => this.variants('e:' + n, () => effectSound(n, this.rng()), n === 'explode' || n === 'thunder' ? 2 : 3));
      warm.push(() => this.variants('e:pickup', () => effectSound('pickup', this.rng())));
      const next = () => { const f = warm.shift(); if (f) { f(); setTimeout(next, 30); } };
      setTimeout(next, 400);
    } catch (e) { console.warn('Audio indisponible', e); }
  }
  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    this.master.gain.value = (s.volume ?? 0.8);
    this.sfx.gain.value = (s.sfxVolume ?? 1) * 0.9;
    this.music.gain.value = (s.musicVolume ?? 0.5) * 0.5;
    this.amb.gain.value = (s.sfxVolume ?? 1) * 0.8;
  }
  rng() { return makeRng(this.seed++ * 7919 + 13); }
  // variantes d'un son, synthétisées à la première utilisation
  // (la première variante tout de suite, les suivantes en tâche de fond pour éviter les à-coups)
  variants(key, gen, n = VARIANTS) {
    let v = this.cache.get(key);
    if (v) return v;
    v = [];
    this.cache.set(key, v);
    const make = () => {
      const data = gen();
      if (!data) return false;
      const b = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
      b.copyToChannel(data, 0);
      v.push(b);
      return true;
    };
    if (make()) { let left = n - 1; const more = () => { if (left-- > 0 && make()) setTimeout(more, 120); }; setTimeout(more, 200); }
    return v;
  }
  pick(key, gen, n) { const v = this.variants(key, gen, n); return v.length ? v[Math.floor(Math.random() * v.length)] : null; }

  // ---------------------------------------------------------- LECTURE
  // joue un tampon, en 3D si une position est donnée
  playBuf(buf, x, y, z, { gain = 1, rate = 1, reverb = 0.12, delay = 0, maxDist = 48 } = {}) {
    if (!buf || !this.ready) return null;
    const c = this.ctx;
    if (this.voices > 64) return null;
    const src = c.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(g);
    let outNode = g;
    if (x !== undefined && x !== null) {
      const [lx, ly, lz] = this.listener;
      const d = Math.hypot(x - lx, y - ly, z - lz);
      if (d > maxDist) return null;
      // absorption de l'air : les sons lointains perdent leurs aigus
      if (d > 6) { const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = Math.max(900, 18000 * Math.exp(-(d - 6) / 14)); outNode.connect(lp); outNode = lp; }
      const p = c.createPanner();
      p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 2.5; p.maxDistance = maxDist; p.rolloffFactor = 1.1;
      if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
      outNode.connect(p); p.connect(this.sfx);
    } else outNode.connect(this.sfx);
    if (reverb > 0) { const r = c.createGain(); r.gain.value = reverb; g.connect(r); r.connect(this.reverb); }
    g.connect(this.caveRev);
    this.voices++;
    src.onended = () => { this.voices--; };
    src.start(c.currentTime + delay);
    return src;
  }

  // ---------------------------------------------------------- BLOCS
  playBlock(id, action, x, y, z) {
    if (!this.ready) return;
    const def = BLOCKS[id];
    const mat = def ? def.sound || 'stone' : 'stone';
    const act = action === 'break' ? 'break' : action === 'place' ? 'place' : action === 'hit' ? 'hit' : 'step';
    const buf = this.pick('m:' + mat + ':' + act, () => materialSound(mat, act, this.rng()));
    const gain = act === 'break' ? 0.9 : act === 'place' ? 0.8 : act === 'hit' ? 0.35 : 0.3;
    this.playBuf(buf, x, y, z, { gain, rate: 0.92 + Math.random() * 0.16, reverb: 0.1 });
  }
  step(ent, jump) {
    if (!this.ready) return;
    const w = ent.game.world;
    if (ent.inWater) {
      const buf = this.pick('e:splash_small', () => effectSound('splash_small', this.rng()));
      this.playBuf(buf, ent.x, ent.y, ent.z, { gain: 0.35, rate: 0.9 + Math.random() * 0.2 });
      return;
    }
    const id = w.getBlock(Math.floor(ent.x), Math.floor(ent.y - 0.2), Math.floor(ent.z));
    if (!id) return;
    const mat = BLOCKS[id].sound || 'stone';
    const buf = this.pick('m:' + mat + ':step', () => materialSound(mat, 'step', this.rng()));
    this.playBuf(buf, ent.x, ent.y, ent.z, { gain: jump ? 0.45 : 0.3, rate: 0.9 + Math.random() * 0.2, reverb: 0.05 });
  }
  splash(x, y, z, big = 1) {
    if (!this.ready) return;
    const buf = this.pick('e:splash' + (big > 0.5 ? '' : '_small'), () => (big > 0.5 ? splash(this.rng(), 1) : splash(this.rng(), 0.3)));
    this.playBuf(buf, x, y, z, { gain: 0.6 });
  }

  // ------------------------------------------------------- CRÉATURES
  mob(type, act, x, y, z) {
    if (!this.ready) return;
    const buf = this.pick('c:' + type + ':' + act, () => creatureSound(type, act, this.rng()), act === 'death' ? 2 : 3);
    if (!buf) return;
    const big = ['ghast', 'iron_golem', 'ravager', 'elder_guardian'].includes(type);
    this.playBuf(buf, x, y, z, { gain: act === 'say' ? 0.55 : 0.7, rate: 0.93 + Math.random() * 0.14, reverb: big ? 0.35 : 0.15, maxDist: big ? 80 : 40 });
  }

  // ---------------------------------------------------------- EFFETS
  play(name, x, y, z, vol = 1) {
    if (!this.ready) return;
    const long = ['explode', 'thunder', 'dragon_roar', 'dragon_death', 'wither_spawn', 'wither_death', 'warden_emerge', 'end_portal_open', 'portal_trigger'].includes(name);
    const buf = this.pick('e:' + name, () => effectSound(name, this.rng()), long ? 2 : 3);
    if (!buf) return;
    const pitched = !['levelup', 'totem', 'bell', 'end_portal_open'].includes(name);
    this.playBuf(buf, x, y, z, { gain: vol * (name === 'click' ? 0.35 : 0.8), rate: pitched ? 0.93 + Math.random() * 0.14 : 1, reverb: long ? 0.4 : 0.14, maxDist: long ? 160 : 48 });
  }

  // ------------------------------------------------------- AMBIANCES
  startAmbience() {
    const c = this.ctx;
    const loop = (name) => {
      const data = ambientLoop(name, this.rng());
      const b = c.createBuffer(1, data.length, c.sampleRate); b.copyToChannel(data, 0);
      const s = c.createBufferSource(); s.buffer = b; s.loop = true;
      const g = c.createGain(); g.gain.value = 0;
      s.connect(g); g.connect(this.amb); s.start(c.currentTime, Math.random() * b.duration);
      return { g };
    };
    const names = ['rain', 'wind', 'water', 'lava', 'underwater', 'nether', 'end'];
    const step = () => {
      const n = names.shift();
      if (!n) return;
      this[n + 'L'] = loop(n);
      setTimeout(step, 60);
    };
    step();
  }
  setDimension(d) { this.dim = d; }
  update(game, dt) {
    if (!this.ready) return;
    const c = this.ctx, p = game.player, cam = game.pipeline.camera;
    this.listener = [cam.position.x, cam.position.y, cam.position.z];
    const L = c.listener;
    const fw = new cam.position.constructor(0, 0, -1).applyQuaternion(cam.quaternion);
    if (L.positionX) {
      L.positionX.value = cam.position.x; L.positionY.value = cam.position.y; L.positionZ.value = cam.position.z;
      L.forwardX.value = fw.x; L.forwardY.value = fw.y; L.forwardZ.value = fw.z; L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else { L.setPosition(cam.position.x, cam.position.y, cam.position.z); L.setOrientation(fw.x, fw.y, fw.z, 0, 1, 0); }
    const w = game.world;
    const sky = w.getSkyLight(Math.floor(p.x), Math.floor(p.y + 1.6), Math.floor(p.z));
    const outdoor = sky / 15;
    const set = (o, v) => { if (o) o.g.gain.value += (v - o.g.gain.value) * Math.min(1, dt * 2); };
    const surface = game.dim === 0;
    set(this.rainL, surface ? game.weather.rain * outdoor * 0.5 : 0);
    set(this.windL, surface ? (0.05 + Math.max(0, (p.y - 80) / 40) * 0.2) * outdoor + game.weather.thunder * 0.15 : 0);
    set(this.underwaterL, p.eyeInWater ? 0.5 : 0);
    // eau et lave proches
    if (game.tickCount % 10 === 0) {
      let water = 0, lava = 0;
      for (let i = 0; i < 40; i++) {
        const id = w.getBlock(Math.floor(p.x + (Math.random() - 0.5) * 16), Math.floor(p.y + (Math.random() - 0.5) * 8), Math.floor(p.z + (Math.random() - 0.5) * 16));
        const b = BLOCKS[id];
        if (b && b.fluid === 'water') water++;
        if (b && b.fluid === 'lava') lava++;
      }
      this.wl = water / 40; this.ll = lava / 40;
    }
    set(this.waterL, p.eyeInWater ? 0 : (this.wl || 0) * 0.35);
    set(this.lavaL, (this.ll || 0) * 0.6);
    set(this.netherL, game.dim === 1 ? 0.35 : 0);
    set(this.endL, game.dim === 2 ? 0.3 : 0);
    // réverbération de grotte
    this.caveRev.gain.value += ((1 - outdoor) * 0.45 - this.caveRev.gain.value) * Math.min(1, dt);
    // sons ponctuels : oiseaux le jour, grillons la nuit, gouttes et grondements en grotte
    const day = (game.env && game.env.daylight) ?? 1;
    const T = this.ambT;
    for (const k in T) T[k] -= dt;
    const around = (r, dy = 3) => [p.x + (Math.random() - 0.5) * r, p.y + 2 + (Math.random() - 0.5) * dy, p.z + (Math.random() - 0.5) * r];
    if (surface && outdoor > 0.8 && game.weather.rain < 0.3) {
      if (day > 0.5 && T.bird <= 0) { T.bird = 3 + Math.random() * 9; const [x, y, z] = around(30, 6); this.playBuf(this.pick('a:bird', () => ambientShot('bird', this.rng()), 8), x, y + 4, z, { gain: 0.22, rate: 0.9 + Math.random() * 0.25, reverb: 0.2, maxDist: 40 }); }
      if (day < 0.3 && T.cricket <= 0) { T.cricket = 1.5 + Math.random() * 4; const [x, y, z] = around(24, 2); this.playBuf(this.pick('a:cricket', () => ambientShot('cricket', this.rng()), 4), x, y - 2, z, { gain: 0.12, rate: 0.95 + Math.random() * 0.1, maxDist: 32 }); }
    }
    if (outdoor < 0.25) {
      if (T.drip <= 0) { T.drip = 2 + Math.random() * 7; const [x, y, z] = around(16, 4); this.playBuf(this.pick('a:drip', () => ambientShot('drip', this.rng()), 6), x, y + 2, z, { gain: 0.25, rate: 0.85 + Math.random() * 0.3, reverb: 0.8, maxDist: 24 }); }
      if (surface && p.y < 50 && T.cave <= 0) { T.cave = 60 + Math.random() * 120; const [x, y, z] = around(30, 8); this.playBuf(this.pick('a:cave', () => ambientShot('cave', this.rng()), 3), x, y, z, { gain: 0.35, reverb: 0.9, maxDist: 60 }); }
    }
    // musique : morceaux en cours (juke-box, ambiance) et prochaine musique d'ambiance
    this.tickSongs(game);
    const jukeNear = [...this.songs].some((h) => h.x != null && Math.hypot(h.x - p.x, h.y - p.y, h.z - p.z) < 48);
    if (this.bgSong) this.bgSong.out.gain.value += ((jukeNear ? 0 : 0.55) - this.bgSong.out.gain.value) * Math.min(1, dt * 1.5);
    if (!this.bgSong && !jukeNear) {
      this.musicTimer -= dt;
      if (this.musicTimer <= 0 && (this.settings.musicVolume ?? 0.5) > 0) this.playMusic(game.dim);
    }
  }

  // ----------------------------------------------------------- MUSIQUE
  instrument(name) {
    let b = this.inst.get(name);
    if (b) return b;
    const data = instrumentSample(name);
    b = this.ctx.createBuffer(1, data.length, this.ctx.sampleRate);
    b.copyToChannel(data, 0);
    this.inst.set(name, b);
    return b;
  }
  // vitesse de lecture pour jouer la note MIDI (ramenée dans une plage où le timbre reste naturel)
  rateFor(name, midi) {
    const I = INSTRUMENTS[name] || INSTRUMENTS.harp;
    if (I.drum) return 1;
    let rate = Math.pow(2, (midi - I.base) / 12);
    while (rate > 2.6) rate /= 2;
    while (rate < 0.38) rate *= 2;
    return rate;
  }
  // note d'un bloc musical
  noteBlock(inst, midi, x, y, z) {
    if (!this.ready) return;
    this.playBuf(this.instrument(inst), x, y, z, { gain: 0.9, rate: this.rateFor(inst, midi), reverb: 0.2, maxDist: 48 });
  }
  // démarre un morceau (disque ou ambiance), en 3D si une position est donnée
  startSong(style, seed, x = null, y = null, z = null, gain = 0.9, overrides = {}) {
    if (!this.ready) return null;
    const c = this.ctx;
    const song = compose(style, seed, overrides);
    const out = c.createGain(); out.gain.value = gain;
    let panner = null;
    if (x != null) {
      panner = c.createPanner();
      panner.panningModel = 'HRTF'; panner.distanceModel = 'linear'; panner.refDistance = 3; panner.maxDistance = 64; panner.rolloffFactor = 1;
      if (panner.positionX) { panner.positionX.value = x; panner.positionY.value = y; panner.positionZ.value = z; } else panner.setPosition(x, y, z);
      out.connect(panner); panner.connect(this.sfx);
    } else out.connect(this.music);
    const rv = c.createGain(); rv.gain.value = 0.25; out.connect(rv); rv.connect(this.reverb);
    // préparer les instruments utilisés
    for (const e of song.events) if (!this.inst.has(e[1])) this.instrument(e[1]);
    const h = { song, out, panner, x, y, z, start: c.currentTime + 0.15, idx: 0, done: false };
    this.songs.add(h);
    return h;
  }
  stopSong(h, fade = 0.6) {
    if (!h || h.done) return;
    h.done = true;
    const c = this.ctx, t = c.currentTime;
    h.out.gain.cancelScheduledValues(t);
    h.out.gain.setValueAtTime(h.out.gain.value, t);
    h.out.gain.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => { try { h.out.disconnect(); if (h.panner) h.panner.disconnect(); } catch (e) { /* déjà déconnecté */ } }, (fade + 0.3) * 1000);
    this.songs.delete(h);
    if (h === this.bgSong) { this.bgSong = null; this.musicTimer = 120 + Math.random() * 120; }
  }
  stopAllSongs() { for (const h of [...this.songs]) this.stopSong(h, 0.3); }
  tickSongs(game) {
    const c = this.ctx, now = c.currentTime;
    for (const h of [...this.songs]) {
      const ev = h.song.events;
      while (h.idx < ev.length && h.start + ev[h.idx][0] < now + 0.3) {
        const [t, inst, midi, vel] = ev[h.idx++];
        const src = c.createBufferSource();
        src.buffer = this.instrument(inst);
        src.playbackRate.value = this.rateFor(inst, midi);
        const g = c.createGain(); g.gain.value = vel * 0.6;
        src.connect(g); g.connect(h.out);
        src.start(Math.max(now, h.start + t));
        // notes qui s'envolent du juke-box
        if (h.x != null && game && game.particles && Math.random() < 0.08) game.particles.note(h.x, h.y + 0.6, h.z, (midi % 24) / 24);
      }
      if (now > h.start + h.song.length) this.stopSong(h, 0.1);
    }
  }
  // juke-box
  playJukebox(discKey, x, y, z) {
    this.stopJukebox(x, y, z);
    const d = DISCS[discKey];
    const h = this.startSong(d ? d.style : 'ambient', 1000 + Object.keys(DISCS).indexOf(discKey) * 7919, x + 0.5, y + 0.5, z + 0.5, 1);
    if (h) { h.juke = x + ',' + y + ',' + z; if (this.bgSong) this.stopSong(this.bgSong, 2); }
    return h;
  }
  stopJukebox(x, y, z) { const key = x + ',' + y + ',' + z; for (const h of [...this.songs]) if (h.juke === key) this.stopSong(h, 0.4); }
  jukeboxPlaying(x, y, z) { const key = x + ',' + y + ',' + z; return [...this.songs].some((h) => h.juke === key); }
  // musique d'ambiance : morceau calme composé à la volée selon la dimension
  playMusic(dim) {
    if (this.bgSong) return;
    const styles = dim === 1 ? ['ember'] : dim === 2 ? ['cave', 'ocean'] : ['ambient', 'ambient', 'dawn', 'ocean', 'lullaby'];
    const style = styles[Math.floor(Math.random() * styles.length)];
    this.bgSong = this.startSong(style, Math.floor(Math.random() * 1e9), null, null, null, 0.55, { drums: null, accent: null });
    this.musicTimer = 120 + Math.random() * 120;
  }
}
