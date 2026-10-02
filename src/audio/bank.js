// Recettes des sons : matériaux (pas, coups, pose, casse), créatures (voix à formants),
// effets (explosions, tonnerre, arc, seaux, portails…), ambiances en boucle et sons ponctuels.
import { buffer, grain, grains, noiseBurst, modal, thump, click, whoosh, bubble, pluck, bell, voice, vlerp, VOWELS, finish, saturate, loopify, rr, logr, pink, brown, Biquad, sampleRate } from './synth.js';

const SRt = () => sampleRate();
const vox = (r, dur, o, pre = 0.01) => { const out = buffer(dur + pre + 0.06); voice(out, pre, { dur, r, ...o }); return out; };
const vchain = (...keys) => (t) => {
  const n = keys.length - 1, u = Math.min(n - 1e-6, t * n), k = Math.floor(u), f = u - k;
  const A = VOWELS[keys[k]], B = VOWELS[keys[k + 1]];
  return [A[0] + (B[0] - A[0]) * f, A[1] + (B[1] - A[1]) * f, A[2] + (B[2] - A[2]) * f];
};
const mix = (...bufs) => {
  const n = Math.max(...bufs.map((b) => b.length));
  const out = new Float32Array(n);
  for (const b of bufs) for (let i = 0; i < b.length; i++) out[i] += b[i];
  return out;
};
function chirp(out, t0, f1, f2, dur, amp, shape = 1) {
  const SR = SRt(), i0 = Math.floor(t0 * SR), n = Math.ceil(dur * SR);
  let ph = 0;
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    const t = i / n;
    ph += (f1 + (f2 - f1) * Math.pow(t, shape)) / SR;
    out[i0 + i] += Math.sin(2 * Math.PI * ph) * Math.sin(Math.PI * t) * amp;
  }
}

// =============================================================== MATÉRIAUX
const MAT = {
  grass: { grains: { count: 26, spread: 0.1, fLo: 1400, fHi: 6500, amp: 0.8 }, rustle: { f: 3200, dur: 0.09, amp: 0.25 }, thump: [85, 0.3] },
  gravel: { grains: { count: 40, spread: 0.13, fLo: 450, fHi: 2800, amp: 1.0, dur: [0.003, 0.009] }, thump: [70, 0.45] },
  sand: { grains: { count: 80, spread: 0.16, fLo: 2500, fHi: 9500, amp: 0.45 }, rustle: { f: 5500, dur: 0.14, amp: 0.3, type: 'hp' }, thump: [60, 0.15] },
  snow: { grains: { count: 36, spread: 0.12, fLo: 600, fHi: 2600, amp: 0.8, dur: [0.003, 0.008] }, squeak: true, thump: [70, 0.35] },
  stone: { click: 0.7, modal: [[430, 0.022, 0.6], [1170, 0.016, 0.4], [2350, 0.01, 0.25], [3700, 0.006, 0.15]], rustle: { f: 2600, dur: 0.03, amp: 0.45, q: 0.8 }, thump: [115, 0.4] },
  wood: { click: 0.45, modal: [[170, 0.05, 0.8], [395, 0.035, 0.5], [760, 0.025, 0.3], [1350, 0.015, 0.15]], rustle: { f: 1000, dur: 0.035, amp: 0.25, q: 0.9 }, thump: [100, 0.45] },
  metal: { click: 0.6, modal: [[540, 0.2, 0.3], [1380, 0.16, 0.25], [2530, 0.11, 0.2], [3910, 0.07, 0.14], [5200, 0.05, 0.08]], thump: [130, 0.2] },
  glass: { click: 0.4, modal: [[2150, 0.06, 0.4], [3460, 0.05, 0.3], [5180, 0.035, 0.2]], thump: [150, 0.15] },
  wool: { rustle: { f: 500, dur: 0.07, amp: 0.5, type: 'lp', q: 0.5 }, thump: [75, 0.45] },
  sculk: { squish: true, thump: [60, 0.4] },
};

export function materialSound(mat, action, r) {
  const M = MAT[mat] || MAT.stone;
  const big = action === 'break' ? 1 : action === 'place' ? 0.7 : action === 'hit' ? 0.3 : 0.4;
  const out = buffer(action === 'break' ? 0.7 : 0.32);
  if (M.thump) thump(out, 0, { f: M.thump[0] * rr(r, 0.85, 1.15), f2: M.thump[0] * 0.55, dur: 0.06 + big * 0.05, amp: M.thump[1] * (0.6 + big) });
  if (M.click) click(out, 0.001, M.click * (0.5 + big), r);
  if (M.modal) modal(out, 0.0015, M.modal, 0.6 + big * 0.6, r, 0.07);
  if (M.rustle) noiseBurst(out, 0, { dur: M.rustle.dur * (1 + big * 1.5), f: M.rustle.f * rr(r, 0.85, 1.2), q: M.rustle.q || 1, type: M.rustle.type || 'bp', amp: M.rustle.amp * (1 + big), r });
  if (M.grains) { const G = M.grains; grains(out, 0.002, { ...G, count: Math.round(G.count * (1 + big * 1.4)), spread: G.spread * (1 + big * 1.6), amp: G.amp * (0.8 + big * 0.6), r }); }
  if (M.squeak) modal(out, 0.02, [[rr(r, 900, 1300), 0.025, 0.12]], 1, r);
  if (M.squish) noiseBurst(out, 0, { dur: 0.12 + big * 0.2, f: 600, f2: 250, q: 2.5, amp: 1, r, kind: 'brown', am: 28, amDepth: 0.6 });
  if (action === 'break') {
    switch (mat) {
      case 'stone': grains(out, 0.03, { count: 70, spread: 0.4, fLo: 300, fHi: 2600, amp: 0.7, dur: [0.004, 0.012], r }); noiseBurst(out, 0, { dur: 0.25, f: 180, type: 'lp', q: 0.7, amp: 0.8, r, kind: 'brown' }); break;
      case 'wood': grains(out, 0, { count: 30, spread: 0.18, fLo: 1500, fHi: 5000, amp: 0.6, r }); modal(out, 0.05, [[220, 0.08, 0.4], [510, 0.05, 0.25]], 1, r, 0.1); break;
      case 'grass': case 'gravel': noiseBurst(out, 0, { dur: 0.22, f: 2600, q: 0.9, amp: 0.5, r, am: 45, amDepth: 0.8 }); grains(out, 0.05, { count: 50, spread: 0.35, fLo: 350, fHi: 1800, amp: 0.6, dur: [0.004, 0.01], r }); break;
      case 'sand': noiseBurst(out, 0.02, { dur: 0.4, f: 4500, q: 0.5, type: 'hp', amp: 0.35, r }); break;
      case 'snow': grains(out, 0.03, { count: 40, spread: 0.3, fLo: 400, fHi: 1600, amp: 0.5, r }); break;
      case 'glass':
        for (let k = 0; k < 45; k++) modal(out, Math.pow(r(), 1.8) * 0.5, [[logr(r, 2500, 9000), rr(r, 0.015, 0.07), rr(r, 0.1, 0.35)]], 1, r);
        noiseBurst(out, 0, { dur: 0.08, f: 6000, type: 'hp', q: 0.7, amp: 0.8, r }); break;
      case 'metal': modal(out, 0.03, [[880, 0.3, 0.15], [2140, 0.25, 0.1]], 1, r, 0.05); break;
      case 'wool': noiseBurst(out, 0.01, { dur: 0.2, f: 900, type: 'lp', q: 0.6, amp: 0.5, r }); break;
      default:
    }
  }
  return finish(out, 0.9);
}

// pas dans l'eau / éclaboussures
export function splash(r, size = 1) {
  const out = buffer(0.5 + size * 0.4);
  noiseBurst(out, 0, { dur: 0.15 + size * 0.25, f: 1800, f2: 600, q: 0.6, type: 'lp', amp: 1, r, kind: 'pink', attack: 0.004 });
  for (let k = 0; k < 6 + size * 14; k++) bubble(out, rr(r, 0.01, 0.2 + size * 0.4), { f: logr(r, 350, 1600), dur: rr(r, 0.02, 0.07), amp: rr(r, 0.1, 0.35) });
  return finish(out, 0.85);
}

// =============================================================== CRÉATURES
const rattle = (r, n, spread, amp = 1) => {
  const out = buffer(spread + 0.15);
  let t = 0.005;
  for (let k = 0; k < n && t < spread; k++) {
    modal(out, t, [[rr(r, 800, 1150), 0.012, 0.6], [rr(r, 1900, 2500), 0.008, 0.4], [rr(r, 3200, 3900), 0.005, 0.25]], amp * rr(r, 0.5, 1), r);
    click(out, t, 0.4 * amp, r);
    t += rr(r, 0.025, 0.07);
  }
  return out;
};
const squish = (r, dur = 0.2, f = 500) => { const out = buffer(dur + 0.1); noiseBurst(out, 0, { dur, f, f2: f * 0.45, q: 3, amp: 1, r, kind: 'brown', attack: 0.003 }); bubble(out, 0.01, { f: f * 0.5, dur: dur * 0.6, amp: 0.4 }); return out; };
const hiss = (r, dur, f = 3500) => { const out = buffer(dur + 0.05); noiseBurst(out, 0, { dur, f, q: 1.1, amp: 1, r, attack: 0.04, am: 32, amDepth: 0.5, envPow: 0.5 }); return out; };
const chitter = (r, dur, f = 3000) => { const out = buffer(dur + 0.05); grains(out, 0, { count: Math.round(dur * 120), spread: dur, fLo: f * 0.6, fHi: f * 1.6, amp: 0.8, shape: 1, q: [3, 6], r }); return out; };
const growlV = (r, dur, f0, o = {}) => vox(r, dur, { f0: (t) => f0 * (1 - 0.15 * t), vowel: 'aw', growl: 0.9, breath: 0.35, jitter: 0.08, sub: 0.4, ...o });

const C = {};
const def = (types, recipes) => { for (const t of types) C[t] = recipes; };
def(['zombie', 'zombie_villager'], {
  say: (r) => vox(r, rr(r, 1.0, 1.5), { f0: (t) => 95 * (1 - 0.18 * t) * (1 + 0.06 * Math.sin(t * 14)), vowel: vlerp('u', 'uh'), breath: 0.35, jitter: 0.07, growl: 0.55, env: (t) => Math.min(1, t * 5) * Math.pow(1 - t, 0.8) }),
  hurt: (r) => vox(r, 0.32, { f0: (t) => 140 - 50 * t, vowel: 'uh', breath: 0.3, growl: 0.5, jitter: 0.05 }),
  death: (r) => vox(r, 1.4, { f0: (t) => 110 - 60 * t, vowel: vlerp('uh', 'u'), breath: 0.4, growl: 0.6, jitter: 0.06 }),
});
def(['husk'], {
  say: (r) => vox(r, rr(r, 1.0, 1.4), { f0: (t) => 80 * (1 - 0.2 * t), vowel: vlerp('aw', 'u'), breath: 0.55, jitter: 0.09, growl: 0.7 }),
  hurt: (r) => vox(r, 0.3, { f0: (t) => 120 - 40 * t, vowel: 'aw', breath: 0.5, growl: 0.6 }),
  death: (r) => vox(r, 1.3, { f0: (t) => 95 - 50 * t, vowel: 'aw', breath: 0.6, growl: 0.7 }),
});
def(['drowned'], {
  say: (r) => { const v = vox(r, 1.2, { f0: (t) => 90 * (1 - 0.15 * t), vowel: vlerp('o', 'u'), breath: 0.3, jitter: 0.08, growl: 0.5 }); for (let k = 0; k < 10; k++) bubble(v, rr(r, 0, 1.1), { f: logr(r, 300, 900), dur: 0.04, amp: 0.3 }); return v; },
  hurt: (r) => vox(r, 0.3, { f0: (t) => 130 - 40 * t, vowel: 'o', breath: 0.3, growl: 0.5 }),
  death: (r) => vox(r, 1.4, { f0: (t) => 100 - 55 * t, vowel: 'u', breath: 0.4, growl: 0.6 }),
});
def(['skeleton', 'stray', 'wither_skeleton'], {
  say: (r) => rattle(r, 9, rr(r, 0.35, 0.55)),
  hurt: (r) => mix(rattle(r, 5, 0.2), vox(r, 0.14, { f0: 210, vowel: 'a', breath: 0.6, growl: 0.3 })),
  death: (r) => mix(rattle(r, 22, 0.9, 1.2), vox(r, 0.5, { f0: (t) => 200 - 90 * t, vowel: 'a', breath: 0.6, growl: 0.4 })),
});
def(['spider', 'cave_spider'], {
  say: (r) => mix(hiss(r, rr(r, 0.4, 0.7)), chitter(r, 0.5)),
  hurt: (r) => vox(r, 0.25, { f0: (t) => 420 + 200 * t, vowel: 'ee', breath: 0.7, growl: 0.6 }),
  death: (r) => mix(hiss(r, 0.9, 2500), chitter(r, 0.7, 2200)),
});
def(['silverfish', 'endermite'], { say: (r) => chitter(r, 0.35, 4200), hurt: (r) => chitter(r, 0.2, 5000), death: (r) => chitter(r, 0.5, 3500) });
def(['creeper'], {
  say: null,
  hurt: (r) => mix(growlV(r, 0.3, 110, { vowel: 'uh', growl: 0.5 }), squish(r, 0.15, 700)),
  death: (r) => mix(growlV(r, 0.7, 95, { vowel: 'uh', growl: 0.5 }), squish(r, 0.3, 500)),
});
def(['enderman'], {
  say: (r) => vox(r, 0.75, { f0: (t) => 190 * Math.pow(0.42, t), vowel: vlerp('o', 'u'), trem: 9, tremDepth: 0.09, growl: 0.35, breath: 0.25, env: (t) => Math.pow(t, 1.4) * (1 - Math.pow(t, 6)) }),
  hurt: (r) => vox(r, 0.4, { f0: (t) => 600 + 300 * t + 80 * Math.sin(t * 40), vowel: 'ee', growl: 0.7, breath: 0.4 }),
  death: (r) => vox(r, 1.6, { f0: (t) => 500 * Math.pow(0.25, t), vowel: vlerp('ee', 'u'), growl: 0.6, trem: 14, tremDepth: 0.15, breath: 0.3 }),
});
def(['slime', 'magma_cube'], { say: (r) => squish(r, 0.18, rr(r, 400, 650)), jump: (r) => squish(r, 0.16, rr(r, 450, 700)), hurt: (r) => squish(r, 0.2, 800), death: (r) => mix(squish(r, 0.35, 350), squish(r, 0.2, 900)) });
def(['squid', 'glow_squid', 'axolotl'], { say: (r) => squish(r, 0.25, 350), hurt: (r) => squish(r, 0.2, 700), death: (r) => squish(r, 0.5, 300) });
def(['cod', 'turtle'], { say: (r) => splash(r, 0.2), hurt: (r) => squish(r, 0.12, 900), death: (r) => splash(r, 0.4) });
def(['ghast'], {
  say: (r) => vox(r, 1.7, { f0: (t) => 520 + 140 * Math.sin(Math.PI * t), vowel: vlerp('u', 'a'), trem: 6, tremDepth: 0.03, breath: 0.5, env: (t) => Math.min(1, t * 3) * Math.pow(1 - t, 0.7) }),
  hurt: (r) => vox(r, 0.7, { f0: (t) => 800 + 300 * Math.sin(Math.PI * t), vowel: 'ee', breath: 0.5, growl: 0.3 }),
  death: (r) => vox(r, 2.2, { f0: (t) => 700 * Math.pow(0.35, t), vowel: vlerp('a', 'u'), trem: 5, tremDepth: 0.05, breath: 0.5 }),
});
def(['vex', 'allay'], {
  say: (r) => { const o = buffer(0.8); for (let k = 0; k < 3; k++) chirp(o, k * 0.12, rr(r, 1400, 1900), rr(r, 1800, 2600), 0.18, 0.4); return o; },
  hurt: (r) => vox(r, 0.25, { f0: 900, vowel: 'ee', breath: 0.4 }), death: (r) => vox(r, 0.6, { f0: (t) => 1000 - 500 * t, vowel: 'ee', breath: 0.4 }),
});
def(['blaze'], {
  say: (r) => { const o = buffer(1.3); noiseBurst(o, 0, { dur: 1.2, f: 500, type: 'lp', q: 0.7, amp: 1, r, kind: 'brown', am: 3, amDepth: 0.7, attack: 0.2, envPow: 0.4 }); grains(o, 0, { count: 30, spread: 1.1, fLo: 1500, fHi: 6000, amp: 0.5, shape: 1, r }); return o; },
  hurt: (r) => { const o = buffer(0.4); noiseBurst(o, 0, { dur: 0.3, f: 1600, q: 2, amp: 1, r }); modal(o, 0, [[900, 0.08, 0.4], [1500, 0.06, 0.3]], 1, r); return o; },
  death: (r) => { const o = buffer(1.2); noiseBurst(o, 0, { dur: 1.0, f: 3500, type: 'hp', q: 0.7, amp: 1, r }); return o; },
});
def(['pig'], {
  say: (r) => { const o = mix(vox(r, 0.18, { f0: (t) => 175 - 45 * t, vowel: 'o', nasal: 0.8, breath: 0.35, growl: 0.3 })); if (r() < 0.5) return mix(o, vox(r, 0.15, { f0: (t) => 165 - 40 * t, vowel: 'o', nasal: 0.8, breath: 0.35, growl: 0.3 }, 0.24)); return o; },
  hurt: (r) => vox(r, 0.35, { f0: (t) => 520 + 280 * Math.sin(Math.PI * t), vowel: 'ee', breath: 0.25, growl: 0.2 }),
  death: (r) => vox(r, 0.7, { f0: (t) => 600 - 300 * t, vowel: vlerp('ee', 'e'), breath: 0.3, growl: 0.3 }),
});
def(['hoglin', 'zoglin', 'piglin', 'zombified_piglin', 'ravager'], {
  say: (r) => { const o = growlV(r, rr(r, 0.4, 0.7), 120, { vowel: 'o', nasal: 0.7 }); noiseBurst(o, 0, { dur: 0.15, f: 800, q: 1.2, amp: 0.4, r }); return o; },
  hurt: (r) => growlV(r, 0.3, 170, { vowel: 'aw' }),
  death: (r) => growlV(r, 1.0, 140, { vowel: vlerp('aw', 'u') }),
});
def(['cow', 'mooshroom'], {
  say: (r) => vox(r, rr(r, 1.0, 1.4), { f0: (t) => 108 * (1 + 0.12 * Math.sin(Math.PI * t) - 0.1 * t), vowel: vchain('m', 'o', 'o', 'u'), breath: 0.12, nasal: 0.4, trem: 5, tremDepth: 0.02, sub: 0.2, env: (t) => Math.min(1, t * 4) * Math.pow(1 - t, 0.6) }),
  hurt: (r) => vox(r, 0.45, { f0: (t) => 150 - 30 * t, vowel: vlerp('m', 'o'), breath: 0.2, nasal: 0.4 }),
  death: (r) => vox(r, 1.3, { f0: (t) => 120 - 50 * t, vowel: vchain('m', 'o', 'u'), breath: 0.2, nasal: 0.4 }),
});
def(['sheep', 'goat', 'llama'], {
  say: (r) => vox(r, rr(r, 0.6, 0.85), { f0: (t) => 265 + 30 * Math.sin(Math.PI * t), trem: 13, tremDepth: 0.06, vowel: vlerp('e', 'a'), breath: 0.2 }),
  hurt: (r) => vox(r, 0.35, { f0: (t) => 330 + 40 * Math.sin(Math.PI * t), trem: 15, tremDepth: 0.07, vowel: 'e', breath: 0.25 }),
  death: (r) => vox(r, 0.9, { f0: (t) => 300 - 120 * t, trem: 12, tremDepth: 0.08, vowel: vlerp('e', 'a'), breath: 0.25 }),
});
def(['chicken', 'parrot'], {
  say: (r) => { const o = buffer(0.5); for (let k = 0, n = 2 + Math.floor(r() * 3); k < n; k++) voice(o, 0.01 + k * rr(r, 0.08, 0.12), { dur: 0.07, f0: (t) => 720 - 260 * t, vowel: 'a', breath: 0.2, r }); return o; },
  hurt: (r) => vox(r, 0.22, { f0: (t) => 950 - 200 * t, vowel: 'ee', breath: 0.3, growl: 0.4 }),
  death: (r) => vox(r, 0.4, { f0: (t) => 900 - 400 * t, vowel: 'ee', breath: 0.3, growl: 0.4 }),
});
def(['horse', 'camel'], {
  say: (r) => { const o = vox(r, 1.0, { f0: (t) => 430 - 230 * t, trem: 22, tremDepth: 0.12, vowel: vlerp('e', 'a'), growl: 0.3, breath: 0.3 }); noiseBurst(o, 0.9, { dur: 0.2, f: 900, q: 0.7, amp: 0.5, r }); return o; },
  hurt: (r) => vox(r, 0.35, { f0: (t) => 500 - 150 * t, trem: 20, tremDepth: 0.1, vowel: 'e', growl: 0.4, breath: 0.3 }),
  death: (r) => vox(r, 1.2, { f0: (t) => 380 - 250 * t, trem: 18, tremDepth: 0.12, vowel: vlerp('a', 'u'), growl: 0.4, breath: 0.35 }),
});
const hmm = (r, f, dur, vowel = 'm') => vox(r, dur, { f0: (t) => f * (1 + 0.28 * Math.sin(Math.PI * t * 1.2) - 0.1 * t), vowel, nasal: vowel === 'm' ? 1 : 0.4, breath: 0.06 });
def(['villager', 'wandering_trader'], { say: (r) => hmm(r, rr(r, 135, 160), rr(r, 0.4, 0.6), r() < 0.6 ? 'm' : 'uh'), hurt: (r) => hmm(r, 210, 0.3, 'uh'), death: (r) => hmm(r, 170, 0.9, 'uh') });
def(['pillager', 'vindicator', 'evoker'], { say: (r) => vox(r, 0.5, { f0: (t) => 120 + 30 * Math.sin(Math.PI * t), vowel: 'uh', nasal: 0.6, growl: 0.25, breath: 0.15 }), hurt: (r) => vox(r, 0.3, { f0: 170, vowel: 'uh', growl: 0.3 }), death: (r) => vox(r, 0.9, { f0: (t) => 150 - 60 * t, vowel: 'uh', growl: 0.3 }) });
def(['witch'], {
  say: (r) => { const o = buffer(0.8); for (let k = 0; k < 5; k++) voice(o, 0.01 + k * 0.11, { dur: 0.08, f0: 430 - k * 20, vowel: 'i', breath: 0.3, r }); return o; },
  hurt: (r) => vox(r, 0.3, { f0: 480, vowel: 'e', breath: 0.3 }), death: (r) => vox(r, 0.9, { f0: (t) => 450 - 200 * t, vowel: 'a', breath: 0.3 }),
});
def(['wolf', 'fox'], {
  say: (r) => { const o = buffer(0.6); const f = rr(r, 380, 460); voice(o, 0.01, { dur: 0.13, f0: (t) => f - 120 * t, vowel: 'a', growl: 0.45, breath: 0.4, r }); if (r() < 0.7) voice(o, 0.24, { dur: 0.12, f0: (t) => f * 0.95 - 110 * t, vowel: 'a', growl: 0.45, breath: 0.4, r }); return o; },
  hurt: (r) => vox(r, 0.2, { f0: (t) => 900 - 300 * t, vowel: 'ee', breath: 0.3 }),
  death: (r) => vox(r, 0.9, { f0: (t) => 700 - 350 * t, vowel: vlerp('ee', 'u'), breath: 0.3, trem: 6, tremDepth: 0.04 }),
});
def(['polar_bear', 'panda'], { say: (r) => growlV(r, 0.8, 95), hurt: (r) => growlV(r, 0.35, 140), death: (r) => growlV(r, 1.1, 90) });
def(['cat', 'ocelot'], {
  say: (r) => vox(r, rr(r, 0.5, 0.7), { f0: (t) => 520 + 230 * Math.sin(Math.PI * t * 0.9), vowel: (t) => (t < 0.3 ? vlerp('i', 'a')(t / 0.3) : vlerp('a', 'u')((t - 0.3) / 0.7)), breath: 0.15 }),
  hurt: (r) => mix(hiss(r, 0.25, 4000), vox(r, 0.2, { f0: 700, vowel: 'a', breath: 0.3 })),
  death: (r) => vox(r, 0.8, { f0: (t) => 600 - 250 * t, vowel: vlerp('a', 'u'), breath: 0.2 }),
});
def(['rabbit', 'frog', 'armadillo', 'sniffer', 'bee', 'strider'], {
  say: (r) => { const o = buffer(0.5); noiseBurst(o, 0, { dur: 0.25, f: 1200, q: 0.8, amp: 0.6, r, am: 12, amDepth: 0.6 }); return o; },
  hurt: (r) => vox(r, 0.15, { f0: 900, vowel: 'ee', breath: 0.3 }), death: (r) => vox(r, 0.4, { f0: (t) => 800 - 300 * t, vowel: 'ee', breath: 0.3 }),
});
C.frog.say = (r) => { const o = buffer(0.5); for (let k = 0; k < 2; k++) voice(o, 0.01 + k * 0.16, { dur: 0.11, f0: 120, vowel: 'aw', growl: 0.5, breath: 0.2, r }); return o; };
C.bee.say = (r) => vox(r, 0.9, { f0: (t) => 225 + 10 * Math.sin(t * 30), vowel: 'ee', trem: 30, tremDepth: 0.02, breath: 0.1, env: (t) => Math.sin(Math.PI * t) });
C.strider.say = (r) => vox(r, 0.6, { f0: 210, trem: 14, tremDepth: 0.2, vowel: 'o', breath: 0.2 });
C.sniffer.say = (r) => { const o = buffer(0.9); noiseBurst(o, 0, { dur: 0.35, f: 700, f2: 400, q: 1.2, amp: 1, r, kind: 'pink', am: 9, amDepth: 0.5 }); noiseBurst(o, 0.45, { dur: 0.35, f: 500, q: 1, amp: 0.8, r, kind: 'pink' }); return o; };
def(['bat'], {
  say: (r) => { const o = buffer(0.3); for (let k = 0; k < 2; k++) chirp(o, k * 0.07, rr(r, 3200, 3900), rr(r, 4000, 4800), 0.035, 0.6); return o; },
  hurt: (r) => { const o = buffer(0.2); chirp(o, 0, 4200, 3000, 0.08, 0.7); return o; }, death: (r) => { const o = buffer(0.3); chirp(o, 0, 4200, 2200, 0.2, 0.7); return o; },
});
def(['dolphin'], {
  say: (r) => { const o = buffer(0.8); for (let k = 0; k < 8; k++) click(o, k * 0.03, 0.6, r, 2500); chirp(o, 0.3, rr(r, 1200, 1500), rr(r, 2000, 2600), 0.35, 0.4, 0.6); return o; },
  hurt: (r) => { const o = buffer(0.4); chirp(o, 0, 2400, 1200, 0.25, 0.6); return o; }, death: (r) => { const o = buffer(0.8); chirp(o, 0, 2000, 600, 0.6, 0.6); return o; },
});
def(['iron_golem'], {
  say: (r) => { const o = buffer(0.8); modal(o, 0, [[90, 0.3, 0.6], [220, 0.2, 0.3], [530, 0.12, 0.2]], 1, r, 0.05); noiseBurst(o, 0, { dur: 0.4, f: 300, type: 'lp', amp: 0.4, r, kind: 'brown' }); return o; },
  hurt: (r) => { const o = buffer(0.8); modal(o, 0, MAT.metal.modal.map((m) => [m[0] * 0.5, m[1] * 1.5, m[2]]), 1.2, r, 0.05); click(o, 0, 1, r); return o; },
  death: (r) => { const o = buffer(1.4); for (let k = 0; k < 4; k++) modal(o, k * 0.15, MAT.metal.modal.map((m) => [m[0] * 0.4, m[1] * 2, m[2]]), 1, r, 0.08); return o; },
});
def(['snow_golem'], { say: (r) => materialSound('snow', 'step', r), hurt: (r) => materialSound('snow', 'hit', r), death: (r) => materialSound('snow', 'break', r) });
def(['phantom'], { say: (r) => vox(r, 0.9, { f0: (t) => 850 - 250 * t, vowel: 'ee', growl: 0.7, breath: 0.4, trem: 11, tremDepth: 0.05 }), hurt: (r) => vox(r, 0.35, { f0: 1000, vowel: 'ee', growl: 0.7, breath: 0.4 }), death: (r) => vox(r, 1.2, { f0: (t) => 900 - 500 * t, vowel: 'ee', growl: 0.6, breath: 0.4 }) });
def(['guardian', 'elder_guardian'], { say: (r) => vox(r, 1.4, { f0: (t) => 150 - 30 * t, vowel: 'o', trem: 4, tremDepth: 0.04, breath: 0.3, env: (t) => Math.sin(Math.PI * t) }), hurt: (r) => squish(r, 0.25, 600), death: (r) => vox(r, 1.6, { f0: (t) => 160 - 80 * t, vowel: 'u', breath: 0.4 }) });
def(['shulker'], { say: (r) => { const o = buffer(0.4); modal(o, 0, [[300, 0.05, 0.6], [760, 0.03, 0.4]], 1, r, 0.1); click(o, 0, 0.6, r); return o; }, hurt: (r) => squish(r, 0.15, 700), death: (r) => materialSound('wood', 'break', r) });
def(['breeze'], { say: (r) => { const o = buffer(1.0); whoosh(o, 0, { dur: 0.9, f1: 400, f2: 2200, q: 2, amp: 1, r }); return o; }, hurt: (r) => { const o = buffer(0.4); whoosh(o, 0, { dur: 0.3, f1: 2000, f2: 800, amp: 1, r }); return o; }, death: (r) => { const o = buffer(1.0); whoosh(o, 0, { dur: 0.9, f1: 2500, f2: 300, amp: 1, r }); return o; } });

export function creatureSound(type, act, r) {
  const c = C[type];
  let fn = c ? c[act] : null;
  if (c && act === 'say' && c.say === null) return null;
  if (!fn) {
    if (act === 'jump') return null;
    if (!c && act !== 'hurt' && act !== 'death') fn = (rr2) => vox(rr2, 0.25, { f0: (t) => 230 - 60 * t, vowel: 'uh', breath: 0.3 });
    else if (act === 'hurt') fn = (rr2) => vox(rr2, 0.22, { f0: (t) => 300 - 80 * t, vowel: 'uh', breath: 0.3, growl: 0.3 });
    else fn = (rr2) => vox(rr2, 0.6, { f0: (t) => 260 - 140 * t, vowel: 'uh', breath: 0.35, growl: 0.3 });
  }
  const out = fn(r);
  return out ? finish(out, 0.9) : null;
}

// ================================================================= EFFETS
function boom(r, dur, low = 1) {
  const out = buffer(dur);
  noiseBurst(out, 0, { dur: 0.07, f: 900, type: 'hp', q: 0.6, amp: 1.6, r, attack: 0.0005 });
  noiseBurst(out, 0, { dur: dur * 0.92, f: 900, f2: 55, type: 'lp', q: 0.7, amp: 2.2 * low, r, kind: 'brown', attack: 0.003, envPow: 0.55 });
  thump(out, 0, { f: 70, f2: 26, dur: Math.min(1.4, dur * 0.5), amp: 1.5 * low });
  grains(out, 0.05, { count: 140, spread: dur * 0.45, fLo: 250, fHi: 3500, amp: 0.4, dur: [0.004, 0.015], shape: 1.4, r });
  return saturate(out, 1.6);
}
const E = {
  explode: (r) => boom(r, 3.6),
  thunder: (r) => {
    const out = buffer(7);
    noiseBurst(out, 0, { dur: 0.18, f: 1500, type: 'hp', q: 0.6, amp: 1.4, r, attack: 0.001 });
    noiseBurst(out, 0, { dur: 0.5, f: 2500, f2: 300, type: 'lp', q: 0.7, amp: 1.2, r, kind: 'pink' });
    for (let k = 0; k < 9; k++) noiseBurst(out, rr(r, 0, 3.2), { dur: rr(r, 1.4, 3.6), f: rr(r, 90, 260), type: 'lp', q: 0.7, amp: rr(r, 0.5, 1.1), r, kind: 'brown', attack: rr(r, 0.05, 0.3), envPow: 0.6 });
    return saturate(out, 1.3);
  },
  fuse: (r) => { const o = buffer(1.6); noiseBurst(o, 0, { dur: 1.5, f: 2600, type: 'hp', q: 0.7, amp: 1, r, attack: 0.25, envPow: 0.3, am: 24, amDepth: 0.35 }); return o; },
  fizz: (r) => { const o = buffer(0.8); noiseBurst(o, 0, { dur: 0.6, f: 3000, type: 'hp', q: 0.7, amp: 1, r, envPow: 0.8 }); for (let k = 0; k < 10; k++) bubble(o, rr(r, 0, 0.5), { f: logr(r, 900, 2500), dur: 0.03, amp: 0.3 }); return o; },
  pickup: (r) => { const o = buffer(0.15); bubble(o, 0, { f: rr(r, 520, 760), dur: 0.07, amp: 1 }); click(o, 0, 0.2, r); return o; },
  xp: (r) => { const o = buffer(0.4); const f = rr(r, 1500, 2600); modal(o, 0, [[f, 0.12, 0.6], [f * 2.01, 0.07, 0.25], [f * 3.02, 0.04, 0.1]], 1); return o; },
  levelup: (r) => { const o = buffer(2.4); [1046, 1318, 1568, 2093].forEach((f, i) => bell(o, i * 0.11, f, 0.8, 1.6)); return o; },
  hurt: (r) => { const o = vox(r, 0.2, { f0: (t) => 165 - 55 * t, vowel: vlerp('u', 'uh'), breath: 0.25, growl: 0.25, jitter: 0.04 }); thump(o, 0, { f: 110, f2: 60, dur: 0.08, amp: 0.5 }); noiseBurst(o, 0, { dur: 0.04, f: 1300, q: 1, amp: 0.4, r }); return o; },
  fall_small: (r) => { const o = materialSound('gravel', 'place', r); return o; },
  fall_big: (r) => { const o = buffer(0.6); thump(o, 0, { f: 75, f2: 35, dur: 0.25, amp: 1.2 }); grains(o, 0, { count: 50, spread: 0.2, fLo: 300, fHi: 2500, amp: 0.6, r }); voice(o, 0.03, { dur: 0.22, f0: (t) => 150 - 50 * t, vowel: 'uh', breath: 0.3, growl: 0.3, r, amp: 0.8 }); return o; },
  attack_weak: (r) => { const o = buffer(0.25); whoosh(o, 0, { dur: 0.12, f1: 900, f2: 2600, amp: 0.6, r }); noiseBurst(o, 0.06, { dur: 0.04, f: 1500, q: 1, amp: 0.7, r }); thump(o, 0.06, { f: 120, f2: 70, dur: 0.05, amp: 0.4 }); return o; },
  attack_strong: (r) => { const o = buffer(0.35); whoosh(o, 0, { dur: 0.16, f1: 700, f2: 3200, amp: 0.8, r }); noiseBurst(o, 0.08, { dur: 0.06, f: 1300, q: 1, amp: 1, r }); thump(o, 0.08, { f: 95, f2: 50, dur: 0.09, amp: 0.9 }); return o; },
  attack_crit: (r) => { const o = E.attack_strong(r); modal(o, 0.08, [[2400, 0.06, 0.3], [3900, 0.04, 0.2]], 1, r); noiseBurst(o, 0.1, { dur: 0.05, f: 4000, type: 'hp', amp: 0.6, r }); return o; },
  eat: (r) => { const o = buffer(0.2); grains(o, 0, { count: 25, spread: 0.08, fLo: 800, fHi: 4500, amp: 0.8, r }); noiseBurst(o, 0, { dur: 0.08, f: 700, q: 1.2, amp: 0.6, r, am: 40, amDepth: 0.5 }); return o; },
  burp: (r) => vox(r, 0.4, { f0: (t) => 90 - 15 * t, vowel: 'aw', growl: 0.7, jitter: 0.12, breath: 0.2 }),
  bow: (r) => { const o = buffer(0.6); pluck(o, 0, { f: 98, dur: 0.5, bright: 0.25, amp: 0.8, r }); whoosh(o, 0.01, { dur: 0.25, f1: 1200, f2: 3200, amp: 0.4, r }); return o; },
  arrow_hit: (r) => { const o = buffer(0.4); modal(o, 0, [[260, 0.05, 0.7], [620, 0.03, 0.4], [1400, 0.015, 0.2]], 1, r, 0.08); click(o, 0, 0.6, r); modal(o, 0.005, [[rr(r, 120, 160), 0.12, 0.25]], 1); return o; },
  throw: (r) => { const o = buffer(0.35); whoosh(o, 0, { dur: 0.25, f1: 600, f2: 2400, amp: 0.8, r }); return o; },
  glass: (r) => materialSound('glass', 'break', r),
  teleport: (r) => { const o = buffer(0.6); noiseBurst(o, 0, { dur: 0.45, f: 3200, f2: 380, q: 4, amp: 1, r }); voice(o, 0, { dur: 0.45, f0: (t) => 420 * Math.pow(0.35, t), vowel: 'o', growl: 0.3, trem: 30, tremDepth: 0.1, breath: 0.2, r, amp: 0.5 }); return o; },
  bucket_fill: (r) => { const o = buffer(0.7); noiseBurst(o, 0, { dur: 0.5, f: 600, f2: 1300, q: 1.5, amp: 1, r, kind: 'pink', am: 9, amDepth: 0.5 }); for (let k = 0; k < 9; k++) bubble(o, rr(r, 0.05, 0.5), { f: logr(r, 300, 1100), dur: 0.05, amp: 0.3 }); return o; },
  bucket_empty: (r) => { const o = buffer(0.9); noiseBurst(o, 0, { dur: 0.6, f: 1400, f2: 500, q: 1.2, amp: 1, r, kind: 'pink' }); for (let k = 0; k < 12; k++) bubble(o, rr(r, 0.1, 0.7), { f: logr(r, 300, 1300), dur: 0.05, amp: 0.3 }); return o; },
  bucket_fill_lava: (r) => { const o = buffer(0.8); noiseBurst(o, 0, { dur: 0.6, f: 300, type: 'lp', q: 0.8, amp: 1, r, kind: 'brown' }); for (let k = 0; k < 6; k++) bubble(o, rr(r, 0.05, 0.5), { f: logr(r, 120, 320), dur: 0.08, amp: 0.5 }); return o; },
  ignite: (r) => { const o = buffer(0.6); noiseBurst(o, 0, { dur: 0.12, f: 3500, type: 'hp', q: 0.8, amp: 0.8, r }); for (let k = 0; k < 6; k++) click(o, rr(r, 0, 0.1), 0.5, r, 6000); noiseBurst(o, 0.05, { dur: 0.45, f: 300, type: 'lp', q: 0.7, amp: 0.8, r, kind: 'brown', attack: 0.06 }); return o; },
  equip: (r) => { const o = buffer(0.4); noiseBurst(o, 0, { dur: 0.2, f: 2000, q: 0.8, amp: 0.5, r, am: 30, amDepth: 0.6 }); modal(o, 0.03, [[1800, 0.08, 0.3], [2900, 0.05, 0.2]], 1, r, 0.1); return o; },
  chest_open: (r) => { const o = vox(r, 0.4, { f0: (t) => 75 + 50 * t, vowel: [420, 1250, 2600], growl: 0.9, jitter: 0.3, breath: 0.05 }); modal(o, 0.38, [[420, 0.04, 0.5], [900, 0.03, 0.3]], 1, r); click(o, 0.38, 0.5, r); return o; },
  door_open: (r) => { const o = vox(r, 0.3, { f0: (t) => 85 + 45 * t, vowel: [400, 1100, 2500], growl: 0.9, jitter: 0.3, breath: 0.05 }); modal(o, 0.0, [[150, 0.06, 0.6], [380, 0.04, 0.4]], 1, r, 0.08); return o; },
  door_close: (r) => { const o = buffer(0.5); thump(o, 0, { f: 95, f2: 55, dur: 0.12, amp: 1 }); modal(o, 0, [[160, 0.07, 0.7], [400, 0.05, 0.4], [800, 0.03, 0.2]], 1, r, 0.08); click(o, 0, 0.5, r); return o; },
  bell: (r) => { const o = buffer(3.5); bell(o, 0, 880, 1, 3); bell(o, 0, 1320, 0.25, 2); return o; },
  sculk_click: (r) => { const o = buffer(0.25); click(o, 0, 0.7, r, 2500); noiseBurst(o, 0, { dur: 0.12, f: 400, q: 2, amp: 0.6, r, kind: 'brown' }); return o; },
  shriek: (r) => vox(r, 1.5, { f0: (t) => 900 + 300 * t, vowel: 'ee', growl: 0.8, breath: 0.5, trem: 9, tremDepth: 0.06 }),
  portal_open: (r) => { const o = buffer(2.4); noiseBurst(o, 0, { dur: 2.2, f: 280, f2: 1300, q: 3, amp: 1, r, kind: 'pink', attack: 0.3, envPow: 0.5 }); voice(o, 0, { dur: 2.2, f0: (t) => 110 + 110 * t, vowel: 'o', breath: 0.4, r, amp: 0.3, env: (t) => Math.sin(Math.PI * t) }); return o; },
  portal_trigger: (r) => { const o = buffer(3.8); noiseBurst(o, 0, { dur: 3.6, f: 200, f2: 1800, q: 6, amp: 1, r, kind: 'pink', attack: 0.6, envPow: 0.3 }); voice(o, 0, { dur: 3.6, f0: (t) => 160 * Math.pow(4, t), vowel: vlerp('o', 'a'), breath: 0.4, trem: 5, tremDepth: 0.03, r, amp: 0.35, env: (t) => Math.min(1, t * 2) * (1 - t * t) }); return o; },
  end_portal_open: (r) => { const o = buffer(4); [262, 330, 392, 523].forEach((f, i) => bell(o, i * 0.25, f, 0.6, 3)); noiseBurst(o, 0, { dur: 3, f: 200, type: 'lp', amp: 0.8, r, kind: 'brown', attack: 0.4 }); return o; },
  eye_place: (r) => { const o = buffer(0.8); modal(o, 0, [[600, 0.3, 0.4], [905, 0.25, 0.3], [1500, 0.15, 0.15]], 1); click(o, 0, 0.4, r); return o; },
  enderman_scream: (r) => vox(r, 1.0, { f0: (t) => 500 + 400 * Math.sin(t * 20), vowel: 'ee', growl: 0.8, trem: 25, tremDepth: 0.15, breath: 0.4 }),
  ghast_warn: (r) => vox(r, 0.7, { f0: (t) => 650 + 150 * t, vowel: 'u', breath: 0.5 }),
  ghast_shoot: (r) => { const o = buffer(0.9); whoosh(o, 0, { dur: 0.6, f1: 300, f2: 120, q: 1, amp: 1, r, kind: 'brown' }); grains(o, 0.05, { count: 30, spread: 0.5, fLo: 1000, fHi: 5000, amp: 0.4, r }); return o; },
  wither_shoot: (r) => { const o = buffer(0.7); whoosh(o, 0, { dur: 0.45, f1: 500, f2: 150, amp: 1, r, kind: 'brown' }); voice(o, 0, { dur: 0.35, f0: 80, vowel: 'aw', growl: 1, breath: 0.3, r, amp: 0.6 }); return o; },
  pop: (r) => { const o = buffer(0.12); bubble(o, 0, { f: rr(r, 700, 900), dur: 0.05, amp: 1 }); return o; },
  shear: (r) => { const o = buffer(0.35); for (let k = 0; k < 2; k++) { modal(o, k * 0.12, [[4200, 0.02, 0.5], [6100, 0.015, 0.3]], 1, r, 0.05); noiseBurst(o, k * 0.12, { dur: 0.04, f: 5000, type: 'hp', amp: 0.5, r }); } return o; },
  milk: (r) => E.bucket_fill(r),
  break_tool: (r) => { const o = buffer(0.8); click(o, 0, 1, r); modal(o, 0, [[1900, 0.2, 0.4], [3100, 0.15, 0.3], [4700, 0.1, 0.2]], 1, r, 0.05); for (let k = 0; k < 10; k++) modal(o, rr(r, 0.05, 0.4), [[logr(r, 3000, 7000), 0.03, 0.15]], 1, r); return o; },
  totem: (r) => { const o = buffer(2.5); [523, 784, 1046, 1568].forEach((f, i) => bell(o, i * 0.08, f, 0.7, 1.8)); whoosh(o, 0, { dur: 1.2, f1: 300, f2: 3000, amp: 0.5, r }); return o; },
  dragon_growl: (r) => mix(growlV(r, 2.0, 68, { vowel: 'aw', sub: 0.6 }), (() => { const o = buffer(2.1); noiseBurst(o, 0, { dur: 2, f: 250, type: 'lp', amp: 0.5, r, kind: 'brown', attack: 0.2 }); return o; })()),
  dragon_roar: (r) => { const o = mix(growlV(r, 3.4, 58, { vowel: vlerp('aw', 'o'), sub: 0.7 }), growlV(r, 3.4, 116, { vowel: 'a', growl: 1 })); noiseBurst(o, 0, { dur: 3.4, f: 450, type: 'lp', amp: 0.6, r, kind: 'brown', attack: 0.3 }); return saturate(o, 1.4); },
  dragon_flap: (r) => { const o = buffer(0.8); whoosh(o, 0, { dur: 0.7, f1: 160, f2: 70, q: 0.8, amp: 1.2, r, kind: 'brown' }); return o; },
  dragon_shoot: (r) => { const o = buffer(1.4); whoosh(o, 0, { dur: 1.2, f1: 900, f2: 250, q: 0.7, amp: 1, r }); grains(o, 0.1, { count: 50, spread: 1.0, fLo: 800, fHi: 5000, amp: 0.4, r }); return o; },
  dragon_hurt: (r) => growlV(r, 0.9, 140, { vowel: 'a' }),
  dragon_death: (r) => { const o = mix(growlV(r, 7.5, 95, { f0: (t) => 95 * Math.pow(0.35, t), vowel: vlerp('a', 'u'), sub: 0.6 }), boom(r, 6, 0.6)); return o; },
  wither_spawn: (r) => { const o = mix(growlV(r, 3.8, 55, { f0: (t) => 55 + 45 * t, vowel: vlerp('u', 'aw'), sub: 0.6 }), boom(r, 3.5, 0.5)); return saturate(o, 1.3); },
  wither_ambient: (r) => growlV(r, 1.2, 95, { vowel: vlerp('aw', 'u') }),
  wither_hurt: (r) => growlV(r, 0.45, 180, { vowel: 'a' }),
  wither_death: (r) => mix(growlV(r, 4, 120, { f0: (t) => 120 * Math.pow(0.3, t) }), boom(r, 3.5, 0.6)),
  warden_emerge: (r) => { const o = buffer(4.2); noiseBurst(o, 0, { dur: 4, f: 140, type: 'lp', q: 0.7, amp: 1, r, kind: 'brown', attack: 0.6, envPow: 0.4 }); grains(o, 0.2, { count: 160, spread: 3.6, fLo: 200, fHi: 1800, amp: 0.4, shape: 1, r }); thump(o, 0, { f: 40, f2: 30, dur: 3, amp: 0.6 }); return o; },
  warden_heartbeat: (r) => { const o = buffer(0.6); thump(o, 0, { f: 58, f2: 38, dur: 0.18, amp: 1 }); thump(o, 0.22, { f: 55, f2: 36, dur: 0.18, amp: 0.7 }); return o; },
  warden_listen: (r) => { const o = buffer(0.6); for (let k = 0; k < 6; k++) click(o, k * 0.05, 0.5, r, 1800); voice(o, 0.1, { dur: 0.4, f0: 300, vowel: 'ee', trem: 20, tremDepth: 0.05, breath: 0.4, r, amp: 0.6 }); return o; },
  warden_sniff: (r) => { const o = buffer(1.1); noiseBurst(o, 0, { dur: 0.5, f: 900, f2: 400, q: 1.2, amp: 1, r, kind: 'pink', am: 10, amDepth: 0.5 }); noiseBurst(o, 0.55, { dur: 0.45, f: 500, q: 1, amp: 0.7, r, kind: 'pink' }); return o; },
  sonic_charge: (r) => vox(r, 1.6, { f0: (t) => 80 * Math.pow(5, t), vowel: vlerp('u', 'a'), growl: 0.8, breath: 0.3, env: (t) => Math.min(1, t * 1.2) }),
  sonic_boom: (r) => { const o = buffer(1.6); noiseBurst(o, 0, { dur: 0.08, f: 800, type: 'hp', amp: 1.5, r }); whoosh(o, 0, { dur: 1.2, f1: 1200, f2: 80, q: 1, amp: 1.4, r, kind: 'brown' }); thump(o, 0, { f: 60, f2: 30, dur: 1, amp: 1.4 }); return saturate(o, 1.5); },
  warden_attack: (r) => { const o = buffer(0.5); thump(o, 0, { f: 70, f2: 35, dur: 0.2, amp: 1.2 }); grains(o, 0, { count: 40, spread: 0.15, fLo: 300, fHi: 2500, amp: 0.7, r }); return o; },
  warden_hurt: (r) => growlV(r, 0.7, 110, { vowel: 'a' }),
  warden_death: (r) => growlV(r, 3, 95, { f0: (t) => 95 * Math.pow(0.3, t), vowel: vlerp('a', 'u') }),
  click: (r) => { const o = buffer(0.08); modal(o, 0, [[2200, 0.012, 0.6], [3700, 0.008, 0.3]], 1); click(o, 0, 0.3, r); return o; },
  lever: (r) => { const o = buffer(0.2); click(o, 0, 0.8, r, 1800); modal(o, 0, [[620, 0.03, 0.6], [1450, 0.02, 0.35], [2900, 0.01, 0.2]], 1, r, 0.06); thump(o, 0, { f: 140, f2: 90, dur: 0.04, amp: 0.4 }); return o; },
  button: (r) => { const o = buffer(0.15); click(o, 0, 0.7, r, 2600); modal(o, 0, [[900, 0.02, 0.5], [2100, 0.012, 0.3]], 1, r, 0.05); return o; },
  button_off: (r) => { const o = buffer(0.12); click(o, 0, 0.45, r, 2000); modal(o, 0, [[760, 0.015, 0.4], [1700, 0.01, 0.2]], 1, r, 0.05); return o; },
  plate_on: (r) => { const o = buffer(0.15); thump(o, 0, { f: 120, f2: 80, dur: 0.05, amp: 0.6 }); click(o, 0, 0.5, r, 1500); return o; },
  plate_off: (r) => { const o = buffer(0.12); click(o, 0, 0.35, r, 1300); thump(o, 0, { f: 100, f2: 70, dur: 0.04, amp: 0.3 }); return o; },
  piston_out: (r) => { const o = buffer(0.5); whoosh(o, 0, { dur: 0.16, f1: 500, f2: 1600, amp: 0.5, r }); thump(o, 0.08, { f: 110, f2: 60, dur: 0.12, amp: 1 }); modal(o, 0.08, [[310, 0.06, 0.5], [780, 0.04, 0.3], [1600, 0.02, 0.2]], 1, r, 0.08); grains(o, 0.08, { count: 18, spread: 0.08, fLo: 500, fHi: 3000, amp: 0.4, r }); return o; },
  piston_in: (r) => { const o = buffer(0.45); whoosh(o, 0, { dur: 0.14, f1: 1400, f2: 450, amp: 0.45, r }); thump(o, 0.07, { f: 95, f2: 55, dur: 0.1, amp: 0.8 }); modal(o, 0.07, [[280, 0.05, 0.5], [700, 0.03, 0.25]], 1, r, 0.08); return o; },
  splash: (r) => splash(r, 1),
  splash_small: (r) => splash(r, 0.3),
};
E.creeper_hiss = E.fuse;
E.bucket_empty_lava = E.bucket_fill_lava;
E.blaze_shoot = E.ghast_shoot;
E.dragon_breath = E.dragon_shoot;

export function effectSound(name, r) {
  const fn = E[name];
  if (!fn) return null;
  return finish(fn(r), 0.9, 0.03);
}

// =============================================================== AMBIANCES
export function ambientLoop(name, r) {
  let out;
  if (name === 'rain') {
    out = buffer(6.4);
    const p = pink(r), hp = new Biquad('hp', 500, 0.7), lp = new Biquad('lp', 9000, 0.7);
    for (let i = 0; i < out.length; i++) out[i] = lp.p(hp.p(p())) * 0.6;
    for (let k = 0; k < 1400; k++) grain(out, rr(r, 0, 6.3), { dur: rr(r, 0.002, 0.006), f: logr(r, 1800, 8000), q: rr(r, 1, 3), amp: rr(r, 0.05, 0.4), r });
    for (let k = 0; k < 90; k++) bubble(out, rr(r, 0, 6.3), { f: logr(r, 900, 2400), dur: 0.015, amp: rr(r, 0.05, 0.15) });
  } else if (name === 'wind') {
    out = buffer(9);
    const b = brown(r), bp = new Biquad('bp', 400, 0.8);
    for (let i = 0; i < out.length; i++) {
      const t = i / out.length;
      if (i % 64 === 0) bp.set('bp', 300 + 260 * Math.sin(t * Math.PI * 2 * 2 + 1) + 150 * Math.sin(t * Math.PI * 2 * 5), 0.9);
      out[i] = bp.p(b()) * (0.6 + 0.4 * Math.sin(t * Math.PI * 2 * 3) ** 2) * 2;
    }
  } else if (name === 'water') {
    out = buffer(5.5);
    const p = pink(r), bp = new Biquad('bp', 800, 0.6);
    for (let i = 0; i < out.length; i++) out[i] = bp.p(p()) * 0.8;
    for (let k = 0; k < 260; k++) bubble(out, rr(r, 0, 5.4), { f: logr(r, 350, 1800), dur: rr(r, 0.015, 0.06), amp: rr(r, 0.05, 0.3) });
  } else if (name === 'lava') {
    out = buffer(6);
    const b = brown(r), lp = new Biquad('lp', 260, 0.7);
    for (let i = 0; i < out.length; i++) out[i] = lp.p(b()) * 1.2;
    for (let k = 0; k < 22; k++) bubble(out, rr(r, 0, 5.8), { f: logr(r, 110, 320), dur: rr(r, 0.06, 0.14), amp: rr(r, 0.3, 0.7) });
    grains(out, 0, { count: 60, spread: 5.9, fLo: 1500, fHi: 6000, amp: 0.25, shape: 1, r });
  } else if (name === 'underwater') {
    out = buffer(7);
    const b = brown(r), lp = new Biquad('lp', 380, 0.7);
    for (let i = 0; i < out.length; i++) { const t = i / out.length; out[i] = lp.p(b()) * (0.8 + 0.2 * Math.sin(t * Math.PI * 6)); }
    for (let k = 0; k < 30; k++) bubble(out, rr(r, 0, 6.8), { f: logr(r, 250, 900), dur: rr(r, 0.03, 0.08), amp: rr(r, 0.05, 0.2) });
  } else if (name === 'nether' || name === 'end') {
    out = buffer(10);
    const b = brown(r), lp = new Biquad('lp', name === 'nether' ? 150 : 220, 0.7);
    let ph = 0;
    for (let i = 0; i < out.length; i++) {
      const t = i / out.length;
      ph += (name === 'nether' ? 41 : 55) / SRt();
      out[i] = lp.p(b()) * 1.4 + Math.sin(2 * Math.PI * ph) * 0.18 * (0.6 + 0.4 * Math.sin(t * Math.PI * 2));
    }
    if (name === 'nether') for (let k = 0; k < 3; k++) voice(out, rr(r, 0, 7.5), { dur: rr(r, 1.5, 2.5), f0: rr(r, 70, 110), vowel: 'o', breath: 0.6, r, amp: 0.15, env: (t) => Math.sin(Math.PI * t) });
    else for (let k = 0; k < 5; k++) bell(out, rr(r, 0, 8), logr(r, 500, 1400), 0.05, 2.5);
  } else return null;
  return finish(loopify(out, 0.5), 0.8, 0);
}
export function ambientShot(name, r) {
  const out = buffer(name === 'cave' ? 5 : 1.8);
  if (name === 'bird') {
    let t = 0;
    const base = logr(r, 2200, 4200), n = 2 + Math.floor(r() * 6);
    for (let k = 0; k < n; k++) {
      const d = rr(r, 0.04, 0.12), up = r() < 0.5;
      chirp(out, t, base * rr(r, 0.85, 1.15), base * (up ? rr(r, 1.2, 1.6) : rr(r, 0.6, 0.85)), d, rr(r, 0.4, 0.9), rr(r, 0.5, 2));
      t += d + rr(r, 0.02, 0.1);
    }
  } else if (name === 'cricket') {
    const f = rr(r, 4200, 5000);
    for (let k = 0; k < 3; k++) for (let j = 0; j < 4; j++) modal(out, k * 0.38 + j * 0.035, [[f, 0.008, 0.6]], 1);
  } else if (name === 'drip') {
    chirp(out, 0, rr(r, 1300, 1700), rr(r, 2400, 3200), 0.03, 0.8, 0.5);
  } else if (name === 'cave') {
    noiseBurst(out, 0, { dur: 4.5, f: rr(r, 200, 500), q: 3, amp: 0.8, r, kind: 'brown', attack: 1.2, envPow: 0.4 });
    const f = rr(r, 60, 140);
    voice(out, 0.3, { dur: 4, f0: (t) => f * (1 - 0.3 * t), vowel: 'o', breath: 0.7, r, amp: 0.4, env: (t) => Math.sin(Math.PI * t) });
  } else return null;
  return finish(out, 0.8, 0.02);
}
