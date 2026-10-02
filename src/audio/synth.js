// Synthèse sonore hors ligne (en JavaScript pur, rendue une fois dans des AudioBuffer) :
// filtres biquad, bruits blanc/rose/brun, grains, résonateurs modaux (pierre, bois, métal, verre),
// voix à formants (créatures), cordes pincées (Karplus-Strong), souffles, bulles, réverbération.
let SR = 44100;
export function setSampleRate(r) { SR = r; }
export function sampleRate() { return SR; }

export function makeRng(seed) {
  let s = (Math.imul(seed | 0, 2654435761) >>> 0) || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export const rr = (r, a, b) => a + (b - a) * r();
export const logr = (r, a, b) => a * Math.pow(b / a, r());

// --------------------------------------------------------------- FILTRES
export class Biquad {
  constructor(type = 'lp', f = 1000, q = 0.707, db = 0) { this.x1 = this.x2 = this.y1 = this.y2 = 0; this.set(type, f, q, db); }
  set(type, f, q = 0.707, db = 0) {
    const w = 2 * Math.PI * Math.max(10, Math.min(f, SR * 0.45)) / SR, cw = Math.cos(w), sw = Math.sin(w), a = sw / (2 * Math.max(0.05, q));
    const A = Math.pow(10, db / 40);
    let b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + a; a1 = -2 * cw; a2 = 1 - a; }
    else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + a; a1 = -2 * cw; a2 = 1 - a; }
    else if (type === 'bp') { b0 = a; b1 = 0; b2 = -a; a0 = 1 + a; a1 = -2 * cw; a2 = 1 - a; }
    else { b0 = 1 + a * A; b1 = -2 * cw; b2 = 1 - a * A; a0 = 1 + a / A; a1 = -2 * cw; a2 = 1 - a / A; } // peak
    this.b0 = b0 / a0; this.b1 = b1 / a0; this.b2 = b2 / a0; this.a1 = a1 / a0; this.a2 = a2 / a0;
    return this;
  }
  p(x) {
    const y = this.b0 * x + this.b1 * this.x1 + this.b2 * this.x2 - this.a1 * this.y1 - this.a2 * this.y2;
    this.x2 = this.x1; this.x1 = x; this.y2 = this.y1; this.y1 = y;
    return y;
  }
}
// passe-bas à un pôle
export class OnePole { constructor(f) { this.y = 0; this.set(f); } set(f) { this.k = 1 - Math.exp(-2 * Math.PI * f / SR); } p(x) { this.y += (x - this.y) * this.k; return this.y; } }

// ---------------------------------------------------------------- BRUITS
export function pink(r) {
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  return () => {
    const w = r() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
    const o = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362; b6 = w * 0.115926;
    return o * 0.11;
  };
}
export function brown(r) { let l = 0; return () => { l = (l + 0.02 * (r() * 2 - 1)) / 1.02; return l * 3.5; }; }

export function buffer(sec) { return new Float32Array(Math.max(1, Math.ceil(sec * SR))); }

// ------------------------------------------------------------- BRIQUES
// grain de bruit filtré : craquements, gravier, sable, herbe froissée
export function grain(out, t0, o) {
  const { dur = 0.004, f = 2000, q = 1.2, amp = 1, type = 'bp', r, noise } = o;
  const i0 = Math.floor(t0 * SR), n = Math.max(8, Math.ceil(dur * SR));
  const bq = new Biquad(type, f, q);
  const src = noise || (() => r() * 2 - 1);
  const att = Math.max(1, n * (o.attack ?? 0.08)), tau = n * (o.tau ?? 0.3);
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    const e = Math.min(1, i / att) * Math.exp(-i / tau);
    out[i0 + i] += bq.p(src()) * e * amp;
  }
}
// nuée de grains répartis dans le temps
export function grains(out, t0, { count, spread, fLo, fHi, amp = 1, dur = [0.002, 0.006], q = [0.8, 2.5], r, shape = 1.6, type = 'bp' }) {
  for (let k = 0; k < count; k++) {
    const u = Math.pow(r(), shape);
    grain(out, t0 + u * spread, { dur: rr(r, dur[0], dur[1]), f: logr(r, fLo, fHi), q: rr(r, q[0], q[1]), amp: amp * (0.25 + r() * 0.75) * (1 - u * 0.6), type, r });
  }
}
// bruit filtré sur une durée, avec enveloppe
export function noiseBurst(out, t0, { dur, f, q = 1, type = 'bp', amp = 1, r, f2 = null, attack = 0.005, kind = 'white', am = 0, amDepth = 0, envPow = 1 }) {
  const i0 = Math.floor(t0 * SR), n = Math.ceil(dur * SR);
  const bq = new Biquad(type, f, q);
  const src = kind === 'pink' ? pink(r) : kind === 'brown' ? brown(r) : () => r() * 2 - 1;
  const att = Math.max(1, attack * SR);
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    const t = i / n;
    if (f2 && i % 32 === 0) bq.set(type, f * Math.pow(f2 / f, t), q);
    let e = Math.min(1, i / att) * Math.pow(1 - t, envPow * 2);
    if (am) e *= 1 - amDepth * (0.5 + 0.5 * Math.sin(2 * Math.PI * am * i / SR + r() * 0.3));
    out[i0 + i] += bq.p(src()) * e * amp;
  }
}
// résonateur modal : sinus amortis (impact sur un matériau)
export function modal(out, t0, modes, amp = 1, r = null, detune = 0) {
  const i0 = Math.floor(t0 * SR);
  for (const m of modes) {
    const f = m[0] * (1 + (r ? (r() * 2 - 1) * detune : 0)), decay = m[1], a = m[2] * amp;
    const w = 2 * Math.PI * f / SR;
    if (w >= Math.PI) continue;
    const n = Math.min(out.length - i0, Math.ceil(decay * 7 * SR));
    const k = Math.exp(-1 / (decay * SR));
    const p0 = r ? r() * 6.283 : 0;
    let s1 = Math.sin(p0), s0 = Math.sin(p0 - w);
    const c2 = 2 * Math.cos(w);
    let e = a;
    for (let i = 0; i < n; i++) {
      const s = c2 * s1 - s0; s0 = s1; s1 = s;
      out[i0 + i] += s * e * Math.min(1, i / 12);
      e *= k;
    }
  }
}
// impact sourd (grosse caisse) : sinus à glissement descendant
export function thump(out, t0, { f = 90, f2 = 45, dur = 0.09, amp = 1 }) {
  const i0 = Math.floor(t0 * SR), n = Math.ceil(dur * SR);
  let ph = 0;
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    const t = i / n;
    ph += (f * Math.pow(f2 / f, t)) / SR;
    out[i0 + i] += Math.sin(2 * Math.PI * ph) * Math.min(1, i / 30) * Math.exp(-t * 5) * amp;
  }
}
export function click(out, t0, amp, r, f = 3500) { grain(out, t0, { dur: 0.0016, f, q: 0.6, type: 'hp', amp, r, attack: 0.02, tau: 0.25 }); }
// souffle balayé (épée, flèche, battement d'ailes)
export function whoosh(out, t0, { dur, f1, f2, q = 1.4, amp = 1, r, kind = 'pink' }) {
  const i0 = Math.floor(t0 * SR), n = Math.ceil(dur * SR);
  const bq = new Biquad('bp', f1, q), src = kind === 'brown' ? brown(r) : pink(r);
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    const t = i / n;
    if (i % 32 === 0) bq.set('bp', f1 * Math.pow(f2 / f1, t), q);
    out[i0 + i] += bq.p(src()) * Math.pow(Math.sin(Math.PI * t), 1.5) * amp * 3;
  }
}
// bulle d'eau : sinus dont la hauteur monte en s'amortissant
export function bubble(out, t0, { f = 700, dur = 0.05, amp = 0.5 }) {
  const i0 = Math.floor(t0 * SR), n = Math.ceil(dur * SR);
  let ph = 0;
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    const t = i / n;
    ph += f * (1 + t * 1.6) / SR;
    out[i0 + i] += Math.sin(2 * Math.PI * ph) * Math.exp(-t * 4) * Math.min(1, i / 40) * amp;
  }
}
// corde pincée (Karplus-Strong)
export function pluck(out, t0, { f = 110, dur = 0.8, bright = 0.5, amp = 1, r }) {
  const i0 = Math.floor(t0 * SR), n = Math.ceil(dur * SR);
  const L = Math.max(2, Math.round(SR / f));
  const d = new Float32Array(L);
  for (let i = 0; i < L; i++) d[i] = r() * 2 - 1;
  let idx = 0, prev = 0;
  const damp = 0.5 + bright * 0.49;
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    const cur = d[idx];
    const v = (cur * damp + prev * (1 - damp)) * 0.996;
    prev = cur; d[idx] = v;
    idx = (idx + 1) % L;
    out[i0 + i] += cur * amp * Math.min(1, i / 10);
  }
}
// cloche (partiels inharmoniques)
export function bell(out, t0, f, amp = 1, dur = 2.5) {
  modal(out, t0, [[f * 0.5, dur * 0.9, 0.25], [f, dur * 0.7, 0.5], [f * 1.19, dur * 0.5, 0.25], [f * 1.56, dur * 0.4, 0.2], [f * 2.0, dur * 0.35, 0.18], [f * 2.74, dur * 0.25, 0.12], [f * 3.76, dur * 0.18, 0.08]], amp);
}

// ------------------------------------------------------- VOIX À FORMANTS
export const VOWELS = {
  a: [730, 1090, 2440], e: [530, 1840, 2480], i: [300, 2200, 2950], o: [570, 840, 2410], u: [320, 800, 2240],
  uh: [640, 1190, 2390], m: [260, 1000, 2300], n: [300, 1300, 2500], aw: [600, 900, 2500], ee: [280, 2500, 3200],
};
export const vlerp = (a, b) => (t) => { const A = VOWELS[a], B = VOWELS[b]; return [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t]; };
export function voice(out, t0, o) {
  const { dur, f0, vowel, r, breath = 0.1, jitter = 0.02, shimmer = 0.1, amp = 1, bw = [90, 110, 150], growl = 0, trem = 0, tremDepth = 0, env = null, sub = 0, nasal = 0 } = o;
  const n = Math.ceil(dur * SR), i0 = Math.floor(t0 * SR);
  const F = [new Biquad('bp', 500, 5), new Biquad('bp', 1500, 8), new Biquad('bp', 2500, 12)];
  const nas = new Biquad('peak', 250, 2, nasal * 12);
  const g = [1, 0.7, 0.32];
  let ph = 0, jit = 0, jitT = 0, shm = 1, phs = 0;
  for (let i = 0; i < n && i0 + i < out.length; i++) {
    const t = i / n;
    if (i % 48 === 0) {
      const fm = typeof vowel === 'function' ? vowel(t) : (VOWELS[vowel] || vowel);
      for (let k = 0; k < 3; k++) F[k].set('bp', fm[k], fm[k] / bw[k]);
      jitT = (r() * 2 - 1) * jitter; shm = 1 + (r() * 2 - 1) * shimmer;
    }
    jit += (jitT - jit) * 0.01;
    let f = (typeof f0 === 'function' ? f0(t) : f0) * (1 + jit);
    if (trem) f *= 1 + Math.sin(2 * Math.PI * trem * i / SR) * tremDepth;
    ph += f / SR; if (ph >= 1) ph -= 1;
    phs += f * 0.5 / SR; if (phs >= 1) phs -= 1;
    // source glottique : impulsion asymétrique (proche de Rosenberg) + sous-harmonique + souffle
    let src = ph < 0.6 ? Math.sin(Math.PI * ph / 0.6) ** 2 : 0;
    src = (src - 0.35) * 2 * shm;
    if (sub) src += Math.sin(2 * Math.PI * phs) * sub;
    if (growl) src = Math.tanh(src * (1 + growl * 4)) * (1 + growl * 0.5) + (r() * 2 - 1) * growl * 0.25 * (ph < 0.5 ? 1 : 0.3);
    src += (r() * 2 - 1) * breath;
    if (nasal) src = nas.p(src);
    let e = env ? env(t) : Math.min(1, t * 14) * Math.pow(1 - t, 1.2);
    if (trem && tremDepth > 0.05) e *= 1 - 0.35 * (0.5 + 0.5 * Math.sin(2 * Math.PI * trem * i / SR));
    let y = 0;
    for (let k = 0; k < 3; k++) y += F[k].p(src) * g[k];
    out[i0 + i] += y * e * amp;
  }
}

// ------------------------------------------------------------ FINITION
export function finish(out, peak = 0.9, fadeOut = 0.012) {
  let m = 0;
  for (let i = 0; i < out.length; i++) { const a = Math.abs(out[i]); if (a > m) m = a; }
  const k = m > 1e-6 ? peak / m : 1;
  const fi = Math.min(out.length, 48), fo = Math.min(out.length, Math.ceil(fadeOut * SR));
  for (let i = 0; i < out.length; i++) out[i] *= k;
  for (let i = 0; i < fi; i++) out[i] *= i / fi;
  for (let i = 0; i < fo; i++) out[out.length - 1 - i] *= i / fo;
  return out;
}
// saturation douce (explosions, rugissements)
export function saturate(out, drive = 2) { for (let i = 0; i < out.length; i++) out[i] = Math.tanh(out[i] * drive); return out; }
// boucle sans couture : fondu enchaîné de la fin sur le début
export function loopify(out, sec = 0.4) {
  const n = Math.min(Math.floor(out.length / 3), Math.ceil(sec * SR));
  const L = out.length - n;
  const res = new Float32Array(L);
  for (let i = 0; i < L; i++) res[i] = out[i];
  for (let i = 0; i < n; i++) { const t = i / n; res[i] = out[i] * Math.sqrt(t) + out[L + i] * Math.sqrt(1 - t); }
  return res;
}
// réponse impulsionnelle stéréo : premières réflexions + queue amortie qui s'assombrit
export function impulse(sec, decay, damp = 3000, seed = 7) {
  const r = makeRng(seed), n = Math.ceil(sec * SR);
  const ch = [new Float32Array(n), new Float32Array(n)];
  for (let c = 0; c < 2; c++) {
    const d = ch[c], lp = new OnePole(damp);
    for (let i = 0; i < n; i++) {
      const t = i / n;
      lp.set(damp * Math.pow(0.18, t) + 200);
      d[i] = lp.p(r() * 2 - 1) * Math.pow(1 - t, decay) * 1.6;
    }
    for (let k = 0; k < 9; k++) { const at = Math.floor(rr(r, 0.006, 0.07) * SR); if (at < n) d[at] += (r() < 0.5 ? -1 : 1) * rr(r, 0.3, 0.8); }
  }
  return ch;
}
