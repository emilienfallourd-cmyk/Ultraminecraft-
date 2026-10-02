// Audio procédural (Web Audio) : bruitages synthétisés, sons des créatures, ambiances, musique générative au piano
import { BLOCKS } from '../blocks/blocks.js';

export class Audio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ready = false;
    this.listener = [0, 0, 0];
    this.musicTimer = 30 + Math.random() * 60;
    this.dim = 0;
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
      this.master = c.createGain(); this.master.connect(c.destination);
      this.sfx = c.createGain(); this.sfx.connect(this.master);
      this.music = c.createGain(); this.music.connect(this.master);
      this.amb = c.createGain(); this.amb.connect(this.master);
      // réverbération
      this.reverb = c.createConvolver();
      this.reverb.buffer = this.impulse(3.2, 2.5);
      this.revGain = c.createGain(); this.revGain.gain.value = 0.35;
      this.reverb.connect(this.revGain); this.revGain.connect(this.master);
      this.caveRev = c.createGain(); this.caveRev.gain.value = 0; this.caveRev.connect(this.reverb);
      // bruit
      const len = c.sampleRate * 2;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.brown = c.createBuffer(1, len, c.sampleRate);
      const b = this.brown.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }
      this.startAmbience();
      this.ready = true;
      this.applyVolumes();
    } catch (e) { console.warn('Audio indisponible', e); }
  }
  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    this.master.gain.value = (s.volume ?? 0.8);
    this.sfx.gain.value = (s.sfxVolume ?? 1);
    this.music.gain.value = (s.musicVolume ?? 0.5) * 0.5;
    this.amb.gain.value = (s.sfxVolume ?? 1) * 0.8;
  }
  impulse(sec, decay) {
    const c = this.ctx, len = c.sampleRate * sec, buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
    return buf;
  }

  // -------------------------------------------------------- PRIMITIVES
  out(x, y, z, vol = 1, reverb = 0.15) {
    const c = this.ctx;
    const g = c.createGain(); g.gain.value = vol;
    if (x === undefined || x === null) { g.connect(this.sfx); }
    else {
      const p = c.createPanner();
      p.panningModel = 'equalpower'; p.distanceModel = 'inverse'; p.refDistance = 3; p.maxDistance = 64; p.rolloffFactor = 1.2;
      const [lx, ly, lz] = this.listener;
      const dx = x - lx, dy = y - ly, dz = z - lz;
      if (dx * dx + dy * dy + dz * dz > 48 * 48) return null;
      if (p.positionX) { p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z; } else p.setPosition(x, y, z);
      g.connect(p); p.connect(this.sfx);
    }
    if (reverb > 0) { const r = c.createGain(); r.gain.value = reverb; g.connect(r); r.connect(this.reverb); g.connect(this.caveRev); }
    return g;
  }
  burst(dest, { dur = 0.1, f = 1000, q = 1, type = 'bandpass', gain = 0.5, attack = 0.002, brown = false, f2 = null, rate = 1, delay = 0 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const s = c.createBufferSource(); s.buffer = brown ? this.brown : this.noise; s.playbackRate.value = rate;
    const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f2), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(fl); fl.connect(g); g.connect(dest);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  tone(dest, { f = 440, f2 = null, dur = 0.2, type = 'sine', gain = 0.3, attack = 0.005, delay = 0, vib = 0 }) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(Math.max(10, f2), t + dur);
    if (vib) { const l = c.createOscillator(); l.frequency.value = vib; const lg = c.createGain(); lg.gain.value = f * 0.04; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
    const g = c.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------- BLOCS
  blockSound(type, action, dest) {
    const r = 0.85 + Math.random() * 0.3;
    const v = action === 'break' ? 0.9 : action === 'place' ? 0.75 : action === 'hit' ? 0.35 : 0.22;
    const d = action === 'break' ? 0.25 : 0.12;
    switch (type) {
      case 'stone': this.burst(dest, { dur: d, f: 1800 * r, q: 0.8, gain: v }); this.burst(dest, { dur: d * 0.6, f: 400 * r, q: 1, gain: v * 0.5, type: 'lowpass' }); break;
      case 'wood': this.burst(dest, { dur: d, f: 700 * r, q: 2, gain: v }); this.tone(dest, { f: 180 * r, f2: 120, dur: d, type: 'triangle', gain: v * 0.4 }); break;
      case 'grass': this.burst(dest, { dur: d * 1.2, f: 2600 * r, q: 0.6, gain: v * 0.8, f2: 1200 }); break;
      case 'gravel': this.burst(dest, { dur: d * 1.3, f: 900 * r, q: 0.5, gain: v, rate: 0.7 }); break;
      case 'sand': this.burst(dest, { dur: d * 1.3, f: 3200 * r, q: 0.4, gain: v * 0.7, type: 'highpass' }); break;
      case 'snow': this.burst(dest, { dur: d * 1.2, f: 1500 * r, q: 0.4, gain: v * 0.6, type: 'lowpass', brown: true }); break;
      case 'wool': this.burst(dest, { dur: d, f: 500 * r, q: 0.4, gain: v * 0.6, type: 'lowpass' }); break;
      case 'glass':
        if (action === 'break') { for (let i = 0; i < 5; i++) this.tone(dest, { f: 2000 + Math.random() * 3000, dur: 0.3, gain: 0.08, delay: i * 0.02, type: 'triangle' }); this.burst(dest, { dur: 0.3, f: 5000, q: 1, gain: 0.5, type: 'highpass' }); }
        else this.burst(dest, { dur: d, f: 2500 * r, q: 2, gain: v }); break;
      case 'metal': this.burst(dest, { dur: d, f: 3000 * r, q: 3, gain: v * 0.6 }); this.tone(dest, { f: 900 * r, dur: 0.4, type: 'triangle', gain: v * 0.15 }); break;
      case 'sculk': this.burst(dest, { dur: d * 1.4, f: 300 * r, q: 2, gain: v, brown: true }); break;
      default: this.burst(dest, { dur: d, f: 1200 * r, gain: v });
    }
  }
  playBlock(id, action, x, y, z) {
    if (!this.ready) return;
    const def = BLOCKS[id];
    const dest = this.out(x, y, z, 1);
    if (!dest) return;
    this.blockSound(def ? def.sound : 'stone', action, dest);
  }
  step(ent, jump) {
    if (!this.ready) return;
    const w = ent.game.world;
    const id = w.getBlock(Math.floor(ent.x), Math.floor(ent.y - 0.2), Math.floor(ent.z));
    if (ent.inWater) { const d = this.out(ent.x, ent.y, ent.z, 0.4); if (d) this.burst(d, { dur: 0.25, f: 600, q: 0.7, gain: 0.3, type: 'lowpass', brown: true }); return; }
    if (!id) return;
    const d = this.out(ent.x, ent.y, ent.z, jump ? 0.6 : 0.45, 0.05);
    if (d) this.blockSound(BLOCKS[id].sound, 'step', d);
  }

  // ------------------------------------------------------- CRÉATURES
  mob(type, act, x, y, z) {
    if (!this.ready) return;
    const d = this.out(x, y, z, 0.8);
    if (!d) return;
    const r = 0.9 + Math.random() * 0.2;
    if (act === 'hurt' && !['ghast', 'enderman'].includes(type)) { this.tone(d, { f: 300 * r, f2: 200, dur: 0.15, type: 'sawtooth', gain: 0.12 }); }
    const T = (o) => this.tone(d, o), N = (o) => this.burst(d, o);
    switch (type) {
      case 'pig': if (act !== 'hurt') { T({ f: 180 * r, f2: 130, dur: 0.25, type: 'sawtooth', gain: 0.15, vib: 30 }); N({ dur: 0.25, f: 500, q: 3, gain: 0.2 }); } break;
      case 'cow': case 'mooshroom': T({ f: 140 * r, f2: 95, dur: 0.9, type: 'sawtooth', gain: 0.14, vib: 5, attack: 0.1 }); T({ f: 280 * r, f2: 190, dur: 0.9, type: 'triangle', gain: 0.06, attack: 0.1 }); break;
      case 'sheep': T({ f: 330 * r, f2: 300, dur: 0.6, type: 'sawtooth', gain: 0.1, vib: 18, attack: 0.05 }); break;
      case 'chicken': for (let i = 0; i < 3; i++) T({ f: 900 * r, f2: 700, dur: 0.06, type: 'square', gain: 0.05, delay: i * 0.09 }); break;
      case 'zombie': case 'husk': case 'drowned': case 'zombie_villager': case 'zombified_piglin':
        T({ f: 110 * r, f2: 80, dur: 0.8, type: 'sawtooth', gain: 0.12, vib: 7, attack: 0.1 }); N({ dur: 0.8, f: 300, q: 2, gain: 0.12, brown: true }); break;
      case 'skeleton': case 'stray': case 'wither_skeleton': for (let i = 0; i < 4; i++) N({ dur: 0.04, f: 2500, q: 4, gain: 0.25, delay: i * 0.05 }); break;
      case 'spider': case 'cave_spider': N({ dur: 0.3, f: 1200, q: 6, gain: 0.15, f2: 600 }); break;
      case 'creeper': if (act === 'hurt') N({ dur: 0.2, f: 1500, q: 1, gain: 0.3 }); break;
      case 'enderman': T({ f: 70 * r, f2: 40, dur: 0.6, type: 'sawtooth', gain: 0.1, vib: 12 }); if (act === 'hurt') T({ f: 600, f2: 900, dur: 0.3, type: 'square', gain: 0.06, vib: 40 }); break;
      case 'ghast': T({ f: act === 'death' ? 300 : 700 * r, f2: act === 'death' ? 150 : 500, dur: 1.2, type: 'triangle', gain: 0.15, vib: 8, attack: 0.1 }); N({ dur: 1.2, f: 1800, q: 4, gain: 0.08 }); break;
      case 'blaze': N({ dur: 0.6, f: 400, q: 1, gain: 0.2, brown: true }); T({ f: 200, f2: 150, dur: 0.5, type: 'sawtooth', gain: 0.06, vib: 20 }); break;
      case 'slime': case 'magma_cube': N({ dur: 0.15, f: 300 * r, q: 3, gain: 0.3, brown: true }); break;
      case 'wolf': if (act === 'death') T({ f: 600, f2: 200, dur: 0.6, type: 'sawtooth', gain: 0.1 }); else { T({ f: 500 * r, f2: 350, dur: 0.12, type: 'sawtooth', gain: 0.1 }); T({ f: 500 * r, f2: 350, dur: 0.12, type: 'sawtooth', gain: 0.1, delay: 0.2 }); } break;
      case 'villager': T({ f: 220 * r, f2: 180, dur: 0.35, type: 'sawtooth', gain: 0.1, vib: 6 }); T({ f: 330 * r, f2: 260, dur: 0.35, type: 'triangle', gain: 0.05 }); break;
      case 'iron_golem': N({ dur: 0.4, f: 200, q: 1, gain: 0.3, brown: true }); T({ f: 80, dur: 0.3, type: 'triangle', gain: 0.1 }); break;
      case 'horse': for (let i = 0; i < 5; i++) T({ f: (500 - i * 40) * r, dur: 0.1, type: 'sawtooth', gain: 0.08, delay: i * 0.07, vib: 25 }); break;
      case 'cat': T({ f: 600 * r, f2: 900, dur: 0.4, type: 'triangle', gain: 0.08, vib: 6 }); break;
      case 'bat': T({ f: 4000 * r, f2: 3500, dur: 0.08, type: 'sine', gain: 0.04 }); break;
      case 'piglin': case 'hoglin': T({ f: 160 * r, f2: 110, dur: 0.3, type: 'sawtooth', gain: 0.14, vib: 25 }); break;
      default: if (act !== 'say') N({ dur: 0.15, f: 800, q: 1, gain: 0.15 });
    }
  }

  // ---------------------------------------------------------- DIVERS
  play(name, x, y, z, vol = 1) {
    if (!this.ready) return;
    const d = this.out(x, y, z, vol);
    if (!d) return;
    const T = (o) => this.tone(d, o), N = (o) => this.burst(d, o);
    const r = 0.9 + Math.random() * 0.2;
    switch (name) {
      case 'explode':
        N({ dur: 2.2, f: 120, q: 0.5, gain: 1.2, type: 'lowpass', brown: true, f2: 40, attack: 0.005 });
        N({ dur: 0.6, f: 1200, q: 0.4, gain: 0.6, type: 'lowpass', f2: 200 });
        T({ f: 60, f2: 25, dur: 1.4, type: 'sine', gain: 0.6 }); break;
      case 'thunder': N({ dur: 4, f: 200, q: 0.4, gain: 1, type: 'lowpass', brown: true, f2: 40, attack: 0.05 }); N({ dur: 0.4, f: 2500, q: 0.3, gain: 0.4, type: 'lowpass' }); break;
      case 'fuse': case 'creeper_hiss': N({ dur: 1.5, f: 5000, q: 0.5, gain: 0.25, type: 'highpass', attack: 0.1 }); break;
      case 'fizz': N({ dur: 0.5, f: 4000, q: 0.5, gain: 0.3, type: 'highpass' }); break;
      case 'pickup': T({ f: 1200 * r, f2: 1800, dur: 0.08, type: 'sine', gain: 0.15 }); break;
      case 'xp': T({ f: 1500 + Math.random() * 1000, dur: 0.15, type: 'sine', gain: 0.08 }); T({ f: 2200 + Math.random() * 800, dur: 0.12, type: 'sine', gain: 0.05, delay: 0.03 }); break;
      case 'levelup': [523, 659, 784, 1046].forEach((f, i) => T({ f, dur: 0.5, type: 'triangle', gain: 0.12, delay: i * 0.12 })); break;
      case 'hurt': T({ f: 330 * r, f2: 220, dur: 0.18, type: 'sawtooth', gain: 0.15 }); N({ dur: 0.12, f: 900, gain: 0.25 }); break;
      case 'fall_small': N({ dur: 0.15, f: 300, gain: 0.4, type: 'lowpass' }); break;
      case 'fall_big': N({ dur: 0.3, f: 200, gain: 0.6, type: 'lowpass', brown: true }); T({ f: 90, f2: 50, dur: 0.3, gain: 0.3 }); break;
      case 'attack_weak': N({ dur: 0.08, f: 1200, gain: 0.25 }); break;
      case 'attack_strong': N({ dur: 0.12, f: 800, q: 1.5, gain: 0.45 }); T({ f: 150, f2: 80, dur: 0.12, gain: 0.2 }); break;
      case 'attack_crit': N({ dur: 0.15, f: 2500, q: 2, gain: 0.4 }); T({ f: 200, f2: 90, dur: 0.15, gain: 0.25 }); break;
      case 'eat': N({ dur: 0.08, f: 1800 * r, q: 1, gain: 0.25 }); break;
      case 'burp': T({ f: 140, f2: 90, dur: 0.3, type: 'sawtooth', gain: 0.1, vib: 30 }); break;
      case 'bow': N({ dur: 0.25, f: 2200, q: 2, gain: 0.3, f2: 600 }); T({ f: 200, f2: 120, dur: 0.15, type: 'triangle', gain: 0.2 }); break;
      case 'arrow_hit': N({ dur: 0.08, f: 1500, q: 1, gain: 0.3 }); T({ f: 300, f2: 200, dur: 0.1, gain: 0.1 }); break;
      case 'throw': N({ dur: 0.2, f: 1500, q: 1, gain: 0.2, f2: 3000 }); break;
      case 'glass': this.blockSound('glass', 'break', d); break;
      case 'teleport': T({ f: 200, f2: 1200, dur: 0.4, type: 'sawtooth', gain: 0.08, vib: 30 }); N({ dur: 0.4, f: 3000, q: 4, gain: 0.15, f2: 600 }); break;
      case 'bucket_fill': N({ dur: 0.4, f: 700, q: 1, gain: 0.35, f2: 1400 }); break;
      case 'bucket_empty': N({ dur: 0.5, f: 1200, q: 1, gain: 0.35, f2: 400 }); break;
      case 'bucket_fill_lava': case 'bucket_empty_lava': N({ dur: 0.6, f: 300, q: 1, gain: 0.4, brown: true }); break;
      case 'ignite': N({ dur: 0.15, f: 4000, q: 2, gain: 0.3 }); N({ dur: 0.4, f: 800, q: 0.5, gain: 0.2, type: 'lowpass', brown: true }); break;
      case 'equip': N({ dur: 0.15, f: 2500, q: 3, gain: 0.25 }); T({ f: 600, dur: 0.2, type: 'triangle', gain: 0.06 }); break;
      case 'chest_open': N({ dur: 0.3, f: 500, q: 2, gain: 0.3 }); T({ f: 160, f2: 220, dur: 0.3, type: 'triangle', gain: 0.1 }); break;
      case 'door_open': case 'door_close': N({ dur: 0.18, f: 600, q: 2, gain: 0.35 }); T({ f: 150, f2: name === 'door_open' ? 200 : 110, dur: 0.15, type: 'triangle', gain: 0.15 }); break;
      case 'bell': [880, 1320, 2200].forEach((f, i) => T({ f, dur: 2.5, type: 'sine', gain: 0.15 / (i + 1) })); break;
      case 'sculk_click': N({ dur: 0.06, f: 1800, q: 6, gain: 0.25 }); break;
      case 'shriek': T({ f: 900, f2: 1400, dur: 1.5, type: 'sawtooth', gain: 0.12, vib: 9, attack: 0.1 }); T({ f: 1350, f2: 2000, dur: 1.5, type: 'square', gain: 0.04, vib: 11 }); break;
      case 'portal_open': N({ dur: 2, f: 300, q: 3, gain: 0.3, f2: 1200 }); T({ f: 110, f2: 220, dur: 2, type: 'sawtooth', gain: 0.06, vib: 3 }); break;
      case 'portal_trigger': T({ f: 160, f2: 640, dur: 3.5, type: 'sawtooth', gain: 0.06, vib: 5, attack: 0.5 }); N({ dur: 3.5, f: 500, q: 5, gain: 0.1, f2: 2000, attack: 0.5 }); break;
      case 'end_portal_open': [262, 330, 392, 523].forEach((f, i) => T({ f, dur: 3, type: 'triangle', gain: 0.1, delay: i * 0.25 })); N({ dur: 3, f: 200, q: 1, gain: 0.3, brown: true }); break;
      case 'eye_place': T({ f: 600, f2: 900, dur: 0.4, type: 'triangle', gain: 0.12 }); break;
      case 'enderman_scream': T({ f: 400, f2: 1200, dur: 1, type: 'sawtooth', gain: 0.1, vib: 30 }); T({ f: 620, f2: 1500, dur: 1, type: 'square', gain: 0.05, vib: 45 }); break;
      case 'ghast_warn': T({ f: 500, f2: 800, dur: 0.6, type: 'triangle', gain: 0.12, vib: 7 }); break;
      case 'ghast_shoot': case 'blaze_shoot': N({ dur: 0.5, f: 600, q: 0.7, gain: 0.5, type: 'lowpass', brown: true, f2: 200 }); break;
      case 'wither_shoot': N({ dur: 0.4, f: 500, q: 1, gain: 0.4, brown: true }); T({ f: 120, f2: 80, dur: 0.3, type: 'sawtooth', gain: 0.1 }); break;
      case 'pop': T({ f: 800, f2: 400, dur: 0.08, gain: 0.2 }); break;
      case 'shear': N({ dur: 0.1, f: 4000, q: 4, gain: 0.25 }); N({ dur: 0.1, f: 4500, q: 4, gain: 0.25, delay: 0.1 }); break;
      case 'milk': N({ dur: 0.5, f: 900, q: 1, gain: 0.3 }); break;
      case 'break_tool': N({ dur: 0.3, f: 3000, q: 2, gain: 0.4 }); T({ f: 400, f2: 100, dur: 0.3, type: 'square', gain: 0.1 }); break;
      case 'totem': [523, 784, 1046, 1568].forEach((f, i) => T({ f, dur: 1.2, type: 'triangle', gain: 0.12, delay: i * 0.08 })); break;
      case 'dragon_growl': T({ f: 70, f2: 45, dur: 2, type: 'sawtooth', gain: 0.35, vib: 6, attack: 0.2 }); N({ dur: 2, f: 250, q: 1, gain: 0.3, brown: true, attack: 0.2 }); break;
      case 'dragon_roar': T({ f: 90, f2: 40, dur: 3.5, type: 'sawtooth', gain: 0.5, vib: 4, attack: 0.3 }); T({ f: 180, f2: 70, dur: 3.5, type: 'square', gain: 0.12, vib: 7, attack: 0.3 }); N({ dur: 3.5, f: 400, q: 1, gain: 0.4, brown: true, attack: 0.3 }); break;
      case 'dragon_flap': N({ dur: 0.6, f: 150, q: 0.6, gain: 0.5, type: 'lowpass', brown: true, attack: 0.15 }); break;
      case 'dragon_shoot': case 'dragon_breath': N({ dur: 1.2, f: 800, q: 0.6, gain: 0.4, f2: 300 }); break;
      case 'dragon_hurt': T({ f: 140, f2: 80, dur: 0.8, type: 'sawtooth', gain: 0.35, vib: 10 }); break;
      case 'dragon_death': T({ f: 100, f2: 30, dur: 8, type: 'sawtooth', gain: 0.4, vib: 3, attack: 0.5 }); N({ dur: 8, f: 300, q: 1, gain: 0.3, brown: true, f2: 60 }); break;
      case 'wither_spawn': T({ f: 60, f2: 200, dur: 4, type: 'sawtooth', gain: 0.4, vib: 6 }); N({ dur: 4, f: 300, gain: 0.4, brown: true }); break;
      case 'wither_ambient': T({ f: 100 * r, f2: 70, dur: 1.2, type: 'sawtooth', gain: 0.15, vib: 9 }); break;
      case 'wither_hurt': T({ f: 200, f2: 120, dur: 0.4, type: 'sawtooth', gain: 0.2 }); break;
      case 'wither_death': T({ f: 120, f2: 30, dur: 4, type: 'sawtooth', gain: 0.4, vib: 5 }); break;
      case 'warden_emerge': N({ dur: 4, f: 120, q: 1, gain: 0.6, brown: true, attack: 0.5 }); T({ f: 40, dur: 4, type: 'sine', gain: 0.4, attack: 0.5 }); break;
      case 'warden_heartbeat': T({ f: 55, f2: 40, dur: 0.18, type: 'sine', gain: 0.5 }); T({ f: 55, f2: 40, dur: 0.18, type: 'sine', gain: 0.35, delay: 0.22 }); break;
      case 'warden_listen': T({ f: 300, f2: 450, dur: 0.4, type: 'triangle', gain: 0.1, vib: 20 }); break;
      case 'warden_sniff': N({ dur: 0.6, f: 900, q: 1, gain: 0.3, f2: 300 }); break;
      case 'sonic_charge': T({ f: 100, f2: 600, dur: 1.6, type: 'sawtooth', gain: 0.25, vib: 12, attack: 0.3 }); break;
      case 'sonic_boom': T({ f: 300, f2: 40, dur: 1.2, type: 'sawtooth', gain: 0.7 }); N({ dur: 1, f: 600, gain: 0.8, type: 'lowpass', f2: 100 }); break;
      case 'warden_attack': N({ dur: 0.3, f: 300, gain: 0.8, brown: true, type: 'lowpass' }); T({ f: 80, f2: 40, dur: 0.3, gain: 0.5 }); break;
      case 'warden_hurt': T({ f: 120, f2: 70, dur: 0.6, type: 'sawtooth', gain: 0.3, vib: 10 }); break;
      case 'warden_death': T({ f: 90, f2: 25, dur: 3, type: 'sawtooth', gain: 0.4, vib: 4 }); break;
      case 'click': T({ f: 1000, f2: 800, dur: 0.05, type: 'square', gain: 0.06 }); break;
      default: N({ dur: 0.1, f: 1000, gain: 0.2 });
    }
  }

  // ------------------------------------------------------- AMBIANCES
  startAmbience() {
    const c = this.ctx;
    const loop = (buf, f, q, type) => {
      const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
      const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
      const g = c.createGain(); g.gain.value = 0;
      s.connect(fl); fl.connect(g); g.connect(this.amb); s.start();
      return { g, fl };
    };
    this.rainL = loop(this.noise, 2200, 0.4, 'lowpass');
    this.windL = loop(this.brown, 400, 0.5, 'lowpass');
    this.waterL = loop(this.brown, 900, 0.7, 'bandpass');
    this.lavaL = loop(this.brown, 200, 1, 'lowpass');
    this.underL = loop(this.brown, 300, 0.7, 'lowpass');
    // drone du Nether / End
    const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 41;
    const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 180;
    this.droneG = c.createGain(); this.droneG.gain.value = 0;
    o.connect(fl); fl.connect(this.droneG); this.droneG.connect(this.amb); o.start();
    this.drone = o;
  }
  setDimension(d) { this.dim = d; if (this.drone) this.drone.frequency.value = d === 2 ? 55 : 41; }
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
    const set = (g, v) => { g.gain.value += (v - g.gain.value) * Math.min(1, dt * 2); };
    set(this.rainL.g, game.dim === 0 ? game.weather.rain * outdoor * 0.25 : 0);
    set(this.windL.g, game.dim === 0 ? (0.03 + Math.max(0, (p.y - 80) / 40) * 0.12) * outdoor + game.weather.thunder * 0.1 : 0);
    set(this.underL.g, p.eyeInWater ? 0.35 : 0);
    // eau et lave proches
    let water = 0, lava = 0;
    if (game.tickCount % 10 === 0) {
      for (let i = 0; i < 40; i++) {
        const id = w.getBlock(Math.floor(p.x + (Math.random() - 0.5) * 16), Math.floor(p.y + (Math.random() - 0.5) * 8), Math.floor(p.z + (Math.random() - 0.5) * 16));
        if (BLOCKS[id] && BLOCKS[id].fluid === 'water' && w.getMeta) water++;
        if (BLOCKS[id] && BLOCKS[id].fluid === 'lava') lava++;
      }
      this.wl = water / 40; this.ll = lava / 40;
    }
    set(this.waterL.g, (this.wl || 0) * 0.12);
    set(this.lavaL.g, (this.ll || 0) * 0.3);
    set(this.droneG, game.dim === 1 ? 0.05 : game.dim === 2 ? 0.035 : 0);
    // réverbération de grotte
    this.caveRev.gain.value += ((1 - outdoor) * 0.6 - this.caveRev.gain.value) * Math.min(1, dt);
    // sons de grotte occasionnels
    if (game.dim === 0 && outdoor < 0.2 && p.y < 50 && Math.random() < dt / 90) this.caveSound();
    // musique
    this.musicTimer -= dt;
    if (this.musicTimer <= 0 && (this.settings.musicVolume ?? 0.5) > 0) { this.musicTimer = 150 + Math.random() * 200; this.playMusic(game.dim); }
  }
  caveSound() {
    const d = this.out(this.listener[0] + (Math.random() - 0.5) * 20, this.listener[1] + (Math.random() - 0.5) * 6, this.listener[2] + (Math.random() - 0.5) * 20, 0.6, 0.8);
    if (!d) return;
    const f = 60 + Math.random() * 120;
    this.tone(d, { f, f2: f * (0.6 + Math.random() * 0.8), dur: 4, type: 'sawtooth', gain: 0.06, vib: 2, attack: 1.2 });
    this.burst(d, { dur: 4, f: 200 + Math.random() * 400, q: 3, gain: 0.12, brown: true, attack: 1.2 });
  }
  // musique générative (piano doux)
  playMusic(dim) {
    const c = this.ctx;
    const scales = dim === 1 ? [[0, 1, 5, 7, 8]] : dim === 2 ? [[0, 2, 3, 7, 10]] : [[0, 2, 4, 7, 9], [0, 2, 5, 7, 9], [0, 3, 5, 7, 10]];
    const sc = scales[Math.floor(Math.random() * scales.length)];
    const root = dim === 1 ? 45 : dim === 2 ? 50 : [48, 50, 53, 55][Math.floor(Math.random() * 4)];
    const tempo = 0.55 + Math.random() * 0.4;
    const n = 28 + Math.floor(Math.random() * 20);
    let t = 0.5;
    const note = (midi, time, vel, dur) => {
      const f = 440 * Math.pow(2, (midi - 69) / 12);
      const g = c.createGain(); g.connect(this.music);
      const rv = c.createGain(); rv.gain.value = 0.6; g.connect(rv); rv.connect(this.reverb);
      const st = c.currentTime + time;
      for (const [h, a] of [[1, 1], [2, 0.35], [3, 0.12], [4, 0.06]]) {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f * h * (1 + (Math.random() - 0.5) * 0.001);
        const og = c.createGain();
        og.gain.setValueAtTime(0, st); og.gain.linearRampToValueAtTime(vel * a * 0.09, st + 0.008);
        og.gain.exponentialRampToValueAtTime(0.0005, st + dur * (1.4 - h * 0.15));
        o.connect(og); og.connect(g); o.start(st); o.stop(st + dur * 1.5);
      }
    };
    let deg = Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      if (i % 8 === 0) { // accord de basse
        const b = sc[Math.floor(Math.random() * 3)];
        note(root - 12 + b, t, 0.7, 5); note(root - 12 + b + 7, t + 0.05, 0.5, 5);
      }
      deg = Math.max(0, Math.min(9, deg + Math.floor(Math.random() * 5) - 2));
      const midi = root + sc[deg % 5] + 12 * Math.floor(deg / 5);
      if (Math.random() < 0.85) note(midi, t, 0.4 + Math.random() * 0.4, 3);
      if (Math.random() < 0.15) note(midi + 12, t + tempo / 2, 0.25, 2);
      t += tempo * (Math.random() < 0.3 ? 2 : 1);
    }
  }
}
