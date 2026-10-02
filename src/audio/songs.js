// Musique : instruments synthétisés (échantillons rejoués à différentes hauteurs),
// compositeur de morceaux originaux pour les disques et la musique d'ambiance.
import { buffer, modal, thump, click, pluck, bell, voice, noiseBurst, finish, makeRng, sampleRate } from './synth.js';

// ---------------------------------------------------------------- INSTRUMENTS
// base : note MIDI de l'échantillon (au centre de la tessiture du bloc musical)
export const INSTRUMENTS = {
  harp: { base: 66, name: 'Harpe' },
  bass: { base: 42, name: 'Contrebasse' },
  guitar: { base: 54, name: 'Guitare' },
  banjo: { base: 66, name: 'Banjo' },
  bell: { base: 90, name: 'Cloche' },
  chime: { base: 90, name: 'Carillon' },
  flute: { base: 78, name: 'Flûte' },
  xylophone: { base: 90, name: 'Xylophone' },
  iron_xylophone: { base: 66, name: 'Vibraphone' },
  cow_bell: { base: 78, name: 'Cloche de vache' },
  didgeridoo: { base: 42, name: 'Didgeridoo' },
  bit: { base: 66, name: '8 bits' },
  pling: { base: 66, name: 'Piano électrique' },
  piano: { base: 60, name: 'Piano' },
  pad: { base: 54, name: 'Nappe' },
  basedrum: { base: 60, name: 'Grosse caisse', drum: true },
  snare: { base: 60, name: 'Caisse claire', drum: true },
  hat: { base: 60, name: 'Charleston', drum: true },
};
const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

export function instrumentSample(name) {
  const r = makeRng(name.length * 977 + name.charCodeAt(0) * 31);
  const I = INSTRUMENTS[name] || INSTRUMENTS.harp, f = hz(I.base), SR = sampleRate();
  let out;
  switch (name) {
    case 'harp': out = buffer(1.8); pluck(out, 0, { f, dur: 1.75, bright: 0.55, amp: 1, r }); modal(out, 0, [[f, 1.1, 0.25], [f * 2, 0.6, 0.08]], 1); break;
    case 'bass': out = buffer(1.6); pluck(out, 0, { f, dur: 1.55, bright: 0.3, amp: 1, r }); modal(out, 0, [[f, 0.9, 0.5], [f * 2, 0.4, 0.15]], 1); break;
    case 'guitar': out = buffer(1.6); pluck(out, 0, { f, dur: 1.55, bright: 0.8, amp: 1, r }); modal(out, 0, [[f * 2, 0.5, 0.06]], 1); break;
    case 'banjo': out = buffer(0.9); pluck(out, 0, { f, dur: 0.85, bright: 0.96, amp: 1, r }); modal(out, 0, [[2100, 0.05, 0.15], [f * 3, 0.15, 0.1]], 1); break;
    case 'bell': out = buffer(2.4); bell(out, 0, f / 2, 1, 2.2); break;
    case 'chime': out = buffer(2.2); modal(out, 0, [[f, 1.6, 0.6], [f * 2.76, 0.7, 0.25], [f * 5.4, 0.3, 0.1]], 1); break;
    case 'xylophone': out = buffer(0.6); modal(out, 0, [[f, 0.16, 0.8], [f * 3.93, 0.05, 0.3], [f * 9.5, 0.015, 0.1]], 1); click(out, 0, 0.15, r); break;
    case 'iron_xylophone': out = buffer(1.2); modal(out, 0, [[f, 0.45, 0.7], [f * 2, 0.28, 0.25], [f * 3, 0.16, 0.15], [f * 4.1, 0.08, 0.08]], 1); break;
    case 'cow_bell': out = buffer(0.8); modal(out, 0, [[f, 0.22, 0.6], [f * 1.48, 0.18, 0.45], [f * 2.3, 0.08, 0.15]], 1); break;
    case 'didgeridoo': out = buffer(1.5); voice(out, 0, { dur: 1.45, f0: f, vowel: (t) => [450 + 150 * Math.sin(t * 9), 900, 2400], growl: 0.25, breath: 0.15, r, env: (t) => Math.min(1, t * 10) * Math.pow(1 - t, 0.6) }); break;
    case 'bit': {
      out = buffer(0.6); let ph = 0;
      for (let i = 0; i < out.length; i++) { ph += f / SR; if (ph >= 1) ph -= 1; out[i] = (ph < 0.5 ? 0.6 : -0.6) * Math.exp(-i / (SR * 0.18)); }
      break;
    }
    case 'pling': out = buffer(1.8); modal(out, 0, [[f, 1.3, 0.7], [f * 2, 0.6, 0.25], [f * 4.2, 0.12, 0.2], [f * 7.1, 0.04, 0.08]], 1); break;
    case 'piano': {
      out = buffer(2.6);
      const parts = []; for (let h = 1; h <= 8; h++) parts.push([f * h * Math.sqrt(1 + 0.0004 * h * h), 1.8 / (1 + h * 0.35), 0.9 / Math.pow(h, 1.25)]);
      modal(out, 0, parts, 1, r); click(out, 0, 0.12, r, 2500);
      break;
    }
    case 'pad': {
      out = buffer(3.2); let p1 = 0, p2 = 0, p3 = 0;
      for (let i = 0; i < out.length; i++) {
        const t = i / out.length;
        p1 += f / SR; p2 += f * 1.004 / SR; p3 += f * 2.002 / SR;
        const e = Math.min(1, t * 6) * Math.pow(1 - t, 0.8);
        out[i] = (Math.sin(2 * Math.PI * p1) + Math.sin(2 * Math.PI * p2) * 0.8 + Math.sin(2 * Math.PI * p3) * 0.25) * e;
      }
      break;
    }
    case 'basedrum': out = buffer(0.45); thump(out, 0, { f: 75, f2: 38, dur: 0.4, amp: 1 }); click(out, 0, 0.25, r, 1500); break;
    case 'snare': out = buffer(0.3); noiseBurst(out, 0, { dur: 0.22, f: 1900, q: 0.7, amp: 1, r, attack: 0.001 }); modal(out, 0, [[190, 0.06, 0.6], [330, 0.04, 0.3]], 1); break;
    case 'hat': out = buffer(0.1); noiseBurst(out, 0, { dur: 0.07, f: 7500, type: 'hp', q: 0.7, amp: 1, r, attack: 0.0005 }); break;
    default: out = buffer(1); pluck(out, 0, { f, dur: 0.95, bright: 0.5, amp: 1, r });
  }
  return finish(out, 0.85, 0.02);
}

// instrument d'un bloc musical selon le bloc situé dessous (comme Minecraft)
export function noteInstrument(below) {
  if (!below) return 'harp';
  const k = below.key || '';
  if (k === 'gold_block') return 'bell';
  if (k === 'clay') return 'flute';
  if (k === 'packed_ice') return 'chime';
  if (k.endsWith('_wool')) return 'guitar';
  if (k === 'bone_block') return 'xylophone';
  if (k === 'iron_block') return 'iron_xylophone';
  if (k === 'soul_sand') return 'cow_bell';
  if (k === 'pumpkin' || k === 'carved_pumpkin') return 'didgeridoo';
  if (k === 'emerald_block') return 'bit';
  if (k === 'hay_block') return 'banjo';
  if (k === 'glowstone') return 'pling';
  if (below.sound === 'wood') return 'bass';
  if (below.sound === 'sand' || below.sound === 'gravel') return 'snare';
  if (below.sound === 'glass') return 'hat';
  if (below.sound === 'stone' || below.sound === 'metal') return 'basedrum';
  return 'harp';
}
// note du bloc (0 à 24) → note MIDI pour l'instrument (tessiture de deux octaves)
export function noteMidi(inst, n) { return (INSTRUMENTS[inst] || INSTRUMENTS.harp).base - 12 + n; }
// couleur de la particule de note (vert → violet → rouge → jaune → vert, comme Minecraft)
export function noteColor(n) {
  const h = (n / 24) * 0.9 + 0.33;
  const c = (x) => Math.max(0, Math.min(1, Math.abs(((h + x) % 1) * 6 - 3) - 1));
  return [c(0), c(2 / 3), c(1 / 3)];
}

// ---------------------------------------------------------------- DISQUES
export const DISCS = {
  disc_cat: { title: 'Chat', color: '#4ab83a', style: 'cat' },
  disc_dawn: { title: 'Aube', color: '#f0c040', style: 'dawn' },
  disc_tavern: { title: 'Taverne', color: '#c0602a', style: 'tavern' },
  disc_cave: { title: 'Caverne', color: '#7a7a8a', style: 'cave' },
  disc_ember: { title: 'Braises', color: '#d03020', style: 'ember' },
  disc_party: { title: 'Fête', color: '#e040c0', style: 'party' },
  disc_ocean: { title: 'Océan', color: '#3080e0', style: 'ocean' },
  disc_lullaby: { title: 'Berceuse', color: '#f0a0c0', style: 'lullaby' },
};

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10], penta: [0, 2, 4, 7, 9], mixo: [0, 2, 4, 5, 7, 9, 10],
};
// styles : tempo, tonalité, gamme, grille d'accords (degrés), instruments, motifs rythmiques
const STYLES = {
  cat: { bpm: 118, root: 60, scale: 'major', prog: [0, 5, 3, 4], beats: 4, lead: 'harp', chords: 'pling', bass: 'bass', arp: 'eighths', drums: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...x.' }, accent: 'bell', form: ['I', 'A', 'A', 'B', 'A', 'B', 'A', 'O'], rhythm: [[1, 0.5, 0.5, 1, 1], [0.5, 0.5, 1, 0.5, 0.5, 1], [1.5, 0.5, 1, 1], [2, 1, 1]] },
  dawn: { bpm: 72, root: 62, scale: 'major', prog: [0, 3, 5, 4], seventh: true, beats: 4, lead: 'flute', chords: 'piano', bass: 'bass', arp: 'rolling', form: ['I', 'A', 'A', 'B', 'A', 'O'], rhythm: [[2, 1, 1], [1, 1, 2], [3, 1], [1.5, 0.5, 2]] },
  tavern: { bpm: 132, root: 62, scale: 'dorian', prog: [0, 6, 0, 4], beats: 4, lead: 'banjo', chords: 'guitar', chordOct: -12, bass: 'bass', arp: 'strum', drums: { k: 'x.......x.......', s: '....x.......x..x', h: 'x.x.x.x.x.x.x.x.' }, form: ['I', 'A', 'A', 'B', 'B', 'A', 'A', 'O'], rhythm: [[0.5, 0.5, 0.5, 0.5, 1, 1], [1, 0.5, 0.5, 1, 1], [0.5, 0.5, 1, 0.5, 0.5, 1], [0.25, 0.25, 0.5, 1, 1, 1]] },
  cave: { bpm: 56, root: 50, scale: 'minor', prog: [0, 5, 3, 4], beats: 4, lead: 'chime', leadOct: 24, chords: 'pad', bass: 'didgeridoo', arp: 'pad', sparse: 0.25, form: ['I', 'A', 'B', 'A', 'B', 'O'], rhythm: [[2, 2], [1, 1, 2], [3, 1], [1, 3], [2, 1, 1]] },
  ember: { bpm: 100, root: 52, scale: 'phrygian', prog: [0, 1, 0, 6], beats: 4, lead: 'iron_xylophone', chords: 'pad', bass: 'bass', arp: 'ostinato', drums: { k: 'x..x..x.x..x....', s: '....x.......x...', h: '' }, accent: 'cow_bell', form: ['I', 'A', 'A', 'B', 'A', 'B', 'O'], rhythm: [[0.5, 0.5, 1, 0.5, 0.5, 1], [1, 1, 1, 1], [0.75, 0.75, 0.5, 2]] },
  party: { bpm: 126, root: 57, scale: 'minor', prog: [0, 5, 2, 6], beats: 4, lead: 'bit', chords: 'pling', bass: 'bass', arp: 'offbeat', drums: { k: 'x...x...x...x...', s: '....x.......x...', h: '..x...x...x...xx' }, form: ['I', 'A', 'A', 'B', 'A', 'B', 'B', 'O'], rhythm: [[0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1], [0.75, 0.75, 0.5, 1, 1], [0.5, 0.5, 1, 2]] },
  ocean: { bpm: 84, root: 64, scale: 'penta', prog: [0, 3, 1, 4], beats: 4, lead: 'bell', leadOct: 12, chords: 'harp', bass: 'bass', arp: 'flowing', form: ['I', 'A', 'B', 'A', 'B', 'O'], rhythm: [[1, 1, 2], [2, 1, 1], [1.5, 0.5, 1, 1], [4]] },
  lullaby: { bpm: 96, root: 67, scale: 'major', prog: [0, 3, 4, 0], beats: 3, lead: 'xylophone', leadOct: 12, chords: 'chime', chordOct: 12, bass: 'harp', arp: 'waltz', form: ['I', 'A', 'A', 'B', 'B', 'A', 'A', 'O'], rhythm: [[1, 1, 1], [2, 1], [1.5, 0.5, 1], [3]] },
  ambient: { bpm: 66, root: 60, scale: 'major', prog: [0, 4, 5, 3], seventh: true, beats: 4, lead: 'piano', chords: 'piano', bass: 'piano', arp: 'rolling', sparse: 0.35, form: ['A', 'B', 'A'], rhythm: [[2, 2], [1, 1, 2], [3, 1], [4]] },
};

// compose un morceau : liste d'évènements [temps (s), instrument, note MIDI, vélocité]
export function compose(styleName, seed, overrides = {}) {
  const r = makeRng(seed);
  const st = { ...STYLES[styleName] || STYLES.ambient, ...overrides };
  const sc = SCALES[st.scale];
  const bp = st.beats, spb = 60 / st.bpm;
  const deg = (d) => { const o = Math.floor(d / sc.length); return sc[((d % sc.length) + sc.length) % sc.length] + 12 * o; };
  const chordTones = (d) => [deg(d), deg(d + 2), deg(d + 4)].concat(st.seventh ? [deg(d + 6)] : []);
  const ev = [];
  const add = (beat, inst, midi, vel) => ev.push([Math.max(0, beat * spb + (r() - 0.5) * 0.012), inst, midi, Math.max(0.05, Math.min(1, vel * (0.9 + r() * 0.2)))]);
  // un motif mélodique par section
  const motifs = {};
  const motif = (key) => {
    if (motifs[key]) return motifs[key];
    const bars = [];
    let pos = 7 + Math.floor(r() * 4);
    for (let b = 0; b < 2; b++) {
      const rh = st.rhythm[Math.floor(r() * st.rhythm.length)].map((d) => d * bp / 4);
      const notes = [];
      let t = 0;
      for (const d of rh) {
        pos = Math.max(3, Math.min(14, pos + Math.round((r() - 0.5) * 4)));
        notes.push([t, pos, d, r() < (st.sparse || 0) ? 0 : 1]);
        t += d;
      }
      bars.push(notes);
    }
    return (motifs[key] = bars);
  };
  let bar = 0;
  for (const sec of st.form) {
    const nb = sec === 'I' || sec === 'O' ? 4 : 8;
    for (let k = 0; k < nb; k++, bar++) {
      const b0 = bar * bp;
      const cd = st.prog[(sec === 'B' ? k + 2 : k) % st.prog.length];
      const tones = chordTones(cd);
      const root = st.root;
      const fade = sec === 'O' ? 1 - k / nb : sec === 'I' ? 0.6 + 0.4 * k / nb : 1;
      // basse
      if (st.bass) {
        const bm = root - ((INSTRUMENTS[st.bass] || INSTRUMENTS.bass).base <= 45 ? 24 : 12) + tones[0];
        if (st.arp === 'waltz') add(b0, st.bass, bm, 0.7 * fade);
        else if (st.arp === 'pad') add(b0, st.bass, bm, 0.6 * fade);
        else { add(b0, st.bass, bm, 0.8 * fade); add(b0 + bp / 2, st.bass, (r() < 0.5 ? bm + 7 : bm + 12), 0.6 * fade); }
      }
      // accords / arpèges
      const C = st.chords, cm = (i) => root + (st.chordOct || 0) + tones[i % tones.length] + 12 * Math.floor(i / tones.length);
      switch (st.arp) {
        case 'eighths': for (let s = 0; s < bp * 2; s++) add(b0 + s / 2, C, cm(s % 4 === 3 ? 1 : s % 3), 0.35 * fade); break;
        case 'rolling': for (let s = 0; s < 6; s++) add(b0 + s * bp / 6, C, cm(s < 4 ? s : 6 - s), 0.3 * fade); break;
        case 'strum': for (let s = 0; s < bp; s++) for (let i = 0; i < 3; i++) add(b0 + s + i * 0.02 + (s % 2 ? 0.5 : 0), C, cm(i), 0.32 * fade); break;
        case 'pad': for (let i = 0; i < 3; i++) add(b0, C, cm(i) - 12, 0.3 * fade); break;
        case 'ostinato': for (let s = 0; s < bp * 2; s++) add(b0 + s / 2, C === 'pad' ? 'iron_xylophone' : C, cm([0, 2, 1, 2][s % 4]) - 12, 0.28 * fade); if (k % 2 === 0) for (let i = 0; i < 3; i++) add(b0, 'pad', cm(i) - 12, 0.22 * fade); break;
        case 'offbeat': for (let s = 0; s < bp; s++) for (let i = 0; i < 3; i++) add(b0 + s + 0.5, C, cm(i), 0.3 * fade); break;
        case 'flowing': for (let s = 0; s < bp * 2; s++) add(b0 + s / 2, C, cm([0, 1, 2, 3, 4, 3, 2, 1][s % 8]), 0.3 * fade); break;
        case 'waltz': add(b0 + 1, C, cm(1), 0.3 * fade); add(b0 + 1, C, cm(2), 0.3 * fade); add(b0 + 2, C, cm(1), 0.25 * fade); add(b0 + 2, C, cm(2), 0.25 * fade); break;
        default:
      }
      // batterie
      if (st.drums && sec !== 'I') {
        const steps = 16, sl = bp / steps;
        for (const [key, inst, v] of [['k', 'basedrum', 0.8], ['s', 'snare', 0.55], ['h', 'hat', 0.3]]) {
          const pat = st.drums[key] || '';
          for (let s = 0; s < pat.length; s++) if (pat[s] === 'x') add(b0 + s * sl * (16 / pat.length), inst, 60, v * fade);
        }
      }
      // mélodie
      if (sec !== 'I') {
        const m = motif(sec)[k % 2];
        const vary = k >= 4 && r() < 0.5;
        for (const [t, p, d, on] of m) {
          if (!on) continue;
          let pp = p + (vary && r() < 0.4 ? (r() < 0.5 ? 1 : -1) : 0);
          // notes fortes sur les notes de l'accord
          if (t === 0) { let best = pp, bd = 99; for (let q = pp - 2; q <= pp + 2; q++) if (tones.some((tt) => ((deg(q) - tt) % 12 + 12) % 12 === 0) && Math.abs(q - pp) < bd) { best = q; bd = Math.abs(q - pp); } pp = best; }
          add(b0 + t, st.lead, root + (st.leadOct || 0) + deg(pp), (0.65 + (t === 0 ? 0.15 : 0)) * fade);
          if (st.accent && t === 0 && k % 4 === 0) add(b0 + t, st.accent, root + deg(pp) + (st.accent === 'bell' ? 24 : 12), 0.35 * fade);
        }
      }
    }
  }
  ev.sort((a, b) => a[0] - b[0]);
  return { events: ev, length: bar * bp * spb + 3 };
}
