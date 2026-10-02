// Redstone : poudre (puissance 0-15), torches (inverseurs), leviers, boutons, plaques de pression,
// répéteurs, observateurs, capteurs de lumière, lampes, pistons (collants) et mécanismes (portes, TNT,
// blocs musicaux, cloches). Modèle proche de Minecraft Java : alimentation forte/faible des blocs pleins.
import { BLOCK as K, BLOCKS, B_OPAQUE, B_SOLID, B_FLUID } from '../blocks/blocks.js';
import { wireConn } from '../blocks/models.js';
import { HEIGHT } from '../constants.js';

// directions : 0 haut, 1 bas, 2 sud (+Z), 3 ouest (-X), 4 nord (-Z), 5 est (+X)  (2 + facing)
export const V6 = [[0, 1, 0], [0, -1, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1], [1, 0, 0]];
export const OPP6 = [1, 0, 4, 5, 2, 3];
const H4_K = [5, 3, 2, 4]; // ordre E, O, S, N de wireConn -> direction 6

const RS = new Array(1024).fill(null);   // id -> type de composant
const MECH = new Array(1024).fill(null); // id -> type de mécanisme
for (const b of BLOCKS) { if (b.rs) RS[b.id] = b.rs; if (b.mech) MECH[b.id] = b.mech; }
const RELEVANT = new Uint8Array(1024);
for (let i = 0; i < 1024; i++) if (RS[i] || MECH[i]) RELEVANT[i] = 1;
RELEVANT[K.piston_head] = 1;

// bloc conducteur (plein, opaque) : peut être alimenté et relayer le courant
const isConductor = (id) => B_OPAQUE[id] === 1 && B_SOLID[id] === 1 && !RS[id];

// direction vers le bloc support
export function attachDir(id, meta) {
  const t = RS[id];
  if (t === 'torch' || t === 'torch_off') { const m = meta & 7; return m === 0 ? 1 : 2 + ((((m - 1) & 3) + 2) & 3); }
  const face = (meta >> 2) & 3;
  return face === 0 ? 1 : face === 2 ? 0 : 2 + (((meta & 3) + 2) & 3);
}

// rayon de mise à jour (distance de Manhattan <= 2)
const R2 = [];
for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) <= 2) R2.push([dx, dy, dz]);

const key = (x, y, z) => x + ',' + y + ',' + z;

export class Redstone {
  constructor(game) {
    this.game = game;
    this.queue = []; this.qset = new Set();
    this.wires = []; this.wset = new Set();
    this.busy = false;
    this.edge = new Map();   // état précédent des mécanismes à front (portes, blocs musicaux, cloches)
    this.toggles = new Map(); // historique des torches (grillage)
  }

  // ------------------------------------------------------------ PUISSANCE
  wirePoints(w, x, y, z, k) {
    if (k === 1) return true;
    if (k === 0) return false;
    const c = wireConn((dx, dy, dz) => w.getBlock(x + dx, y + dy, z + dz), (dx, dy, dz) => w.getMeta(x + dx, y + dy, z + dz), BLOCKS);
    const n = c.side[0] + c.side[1] + c.side[2] + c.side[3];
    const i = H4_K.indexOf(k);
    if (n === 0) return true;
    if (n === 1) return c.side[i] === 1 || c.side[i ^ 1] === 1;
    return c.side[i] === 1;
  }

  // puissance émise directement par le composant (x,y,z) vers son voisin dans la direction k
  emit(w, x, y, z, id, meta, k, wires) {
    switch (RS[id]) {
      case 'wire': { if (!wires) return 0; const p = meta & 15; return p && this.wirePoints(w, x, y, z, k) ? p : 0; }
      case 'block': return 15;
      case 'torch': return k === attachDir(id, meta) ? 0 : 15;
      case 'lever': case 'button': return (meta & 16) ? 15 : 0;
      case 'plate': return (meta & 1) ? 15 : 0;
      case 'repeater': return (meta & 16) && k === 2 + (meta & 3) ? 15 : 0;
      case 'observer': return (meta & 8) && k === OPP6[meta & 7] ? 15 : 0;
      case 'daylight': return meta & 15;
      default: return 0;
    }
  }
  // puissance forte transmise à un bloc plein voisin
  strong(w, x, y, z, id, meta, k, wires) {
    switch (RS[id]) {
      case 'wire': return wires ? this.emit(w, x, y, z, id, meta, k, true) : 0;
      case 'torch': return k === 0 ? 15 : 0;
      case 'lever': case 'button': return (meta & 16) && k === attachDir(id, meta) ? 15 : 0;
      case 'plate': return (meta & 1) && k === 1 ? 15 : 0;
      case 'repeater': case 'observer': return this.emit(w, x, y, z, id, meta, k, true);
      default: return 0;
    }
  }
  // puissance reçue par un bloc plein
  blockPower(w, x, y, z, wires) {
    let best = 0;
    for (let k = 0; k < 6; k++) {
      const d = V6[k], nx = x + d[0], ny = y + d[1], nz = z + d[2];
      const id = w.getBlock(nx, ny, nz);
      if (!RS[id]) continue;
      const p = this.strong(w, nx, ny, nz, id, w.getMeta(nx, ny, nz), OPP6[k], wires);
      if (p > best) { best = p; if (best >= 15) break; }
    }
    return best;
  }
  // puissance reçue depuis la direction k (composant voisin ou bloc plein alimenté)
  inputFrom(w, x, y, z, k) {
    const d = V6[k], nx = x + d[0], ny = y + d[1], nz = z + d[2];
    const id = w.getBlock(nx, ny, nz);
    if (RS[id]) return this.emit(w, nx, ny, nz, id, w.getMeta(nx, ny, nz), OPP6[k], true);
    if (isConductor(id)) return this.blockPower(w, nx, ny, nz, true);
    return 0;
  }
  // un mécanisme est-il alimenté (toutes directions sauf `except`)
  powered(w, x, y, z, except = -1) {
    for (let k = 0; k < 6; k++) if (k !== except && this.inputFrom(w, x, y, z, k) > 0) return true;
    return false;
  }
  torchShouldLight(w, x, y, z, meta) {
    const k = attachDir(K.redstone_torch, meta);
    return this.inputFrom(w, x, y, z, k) === 0;
  }
  repeaterInput(w, x, y, z, meta) { return this.inputFrom(w, x, y, z, 2 + (((meta & 3) + 2) & 3)) > 0; }

  // ------------------------------------------------------------ POUDRE
  wireNeighbors(w, x, y, z, out) {
    out.length = 0;
    const aboveOpaque = B_OPAQUE[w.getBlock(x, y + 1, z)];
    for (let i = 0; i < 4; i++) {
      const d = V6[H4_K[i]], nx = x + d[0], nz = z + d[2];
      const id = w.getBlock(nx, y, nz);
      if (RS[id] === 'wire') { out.push(nx, y, nz); continue; }
      if (!aboveOpaque && RS[w.getBlock(nx, y + 1, nz)] === 'wire') out.push(nx, y + 1, nz);
      if (!B_OPAQUE[id] && RS[w.getBlock(nx, y - 1, nz)] === 'wire') out.push(nx, y - 1, nz);
    }
    return out;
  }
  // puissance reçue par la poudre d'autre chose que de la poudre
  wireSource(w, x, y, z) {
    let best = 0;
    for (let k = 0; k < 6; k++) {
      const d = V6[k], nx = x + d[0], ny = y + d[1], nz = z + d[2];
      const id = w.getBlock(nx, ny, nz);
      let p = 0;
      if (RS[id]) { if (RS[id] !== 'wire') p = this.emit(w, nx, ny, nz, id, w.getMeta(nx, ny, nz), OPP6[k], false); }
      else if (isConductor(id)) p = this.blockPower(w, nx, ny, nz, false);
      if (p > best) { best = p; if (best >= 15) break; }
    }
    return best;
  }
  // recalcule tout le réseau de poudre connecté aux positions de départ
  updateWires(w, starts) {
    const idx = new Map(), pos = [], adj = [];
    const add = (x, y, z) => {
      const k = key(x, y, z);
      if (idx.has(k)) return idx.get(k);
      if (RS[w.getBlock(x, y, z)] !== 'wire') return -1;
      idx.set(k, pos.length / 3); pos.push(x, y, z);
      return pos.length / 3 - 1;
    };
    for (let i = 0; i < starts.length; i += 3) add(starts[i], starts[i + 1], starts[i + 2]);
    const nb = [];
    for (let i = 0; i < pos.length / 3 && i < 4096; i++) {
      this.wireNeighbors(w, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], nb);
      const a = [];
      for (let j = 0; j < nb.length; j += 3) { const n = add(nb[j], nb[j + 1], nb[j + 2]); if (n >= 0) a.push(n); }
      adj[i] = a;
    }
    const n = pos.length / 3;
    const pw = new Int8Array(n);
    const buckets = Array.from({ length: 16 }, () => []);
    for (let i = 0; i < n; i++) { pw[i] = this.wireSource(w, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]); buckets[pw[i]].push(i); }
    for (let p = 15; p > 1; p--) {
      for (const i of buckets[p]) {
        if (pw[i] !== p || !adj[i]) continue;
        for (const j of adj[i]) if (pw[j] < p - 1) { pw[j] = p - 1; buckets[p - 1].push(j); }
      }
    }
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      if ((w.getMeta(x, y, z) & 15) === pw[i]) continue;
      w.setMeta(x, y, z, pw[i]);
      this.notifyAround(w, x, y, z, false);
    }
  }

  // -------------------------------------------------------- MISES À JOUR
  enqueue(x, y, z) {
    const k = key(x, y, z);
    if (this.qset.has(k)) return;
    this.qset.add(k); this.queue.push(x, y, z);
  }
  enqueueWire(x, y, z) {
    const k = key(x, y, z);
    if (this.wset.has(k)) return;
    this.wset.add(k); this.wires.push(x, y, z);
  }
  // marque les composants à portée (voisins directs et voisins des blocs pleins voisins)
  notifyAround(w, x, y, z, wiresToo = true) {
    for (const [dx, dy, dz] of R2) {
      const id = w.getBlock(x + dx, y + dy, z + dz);
      if (!RELEVANT[id]) continue;
      if (RS[id] === 'wire') { if (wiresToo) this.enqueueWire(x + dx, y + dy, z + dz); }
      else this.enqueue(x + dx, y + dy, z + dz);
    }
  }

  // appelé à chaque changement de bloc
  blockChanged(w, x, y, z, oldId, newId) {
    if (w !== this.game.world) return;
    this.observe(w, x, y, z);
    let any = RELEVANT[oldId] || RELEVANT[newId];
    if (!any) for (const [dx, dy, dz] of R2) if (RELEVANT[w.getBlock(x + dx, y + dy, z + dz)]) { any = 1; break; }
    if (!any) return;
    this.notifyAround(w, x, y, z, true);
    this.flush(w);
  }
  // appelé quand seule la donnée d'un bloc change (croissance, poudre…)
  metaChanged(w, x, y, z) { this.observe(w, x, y, z); }

  flush(w) {
    if (this.busy) return;
    this.busy = true;
    let guard = 0;
    try {
      while ((this.queue.length || this.wires.length) && guard++ < 400) {
        while (this.queue.length && guard++ < 400) {
          const q = this.queue; this.queue = [];
          this.qset.clear();
          for (let i = 0; i < q.length; i += 3) this.updateAt(w, q[i], q[i + 1], q[i + 2]);
        }
        if (this.wires.length) {
          const s = this.wires; this.wires = []; this.wset.clear();
          this.updateWires(w, s);
        }
      }
    } finally {
      this.queue.length = 0; this.qset.clear(); this.wires.length = 0; this.wset.clear();
      this.busy = false;
    }
  }

  // mise à jour immédiate d'un composant ou mécanisme
  updateAt(w, x, y, z) {
    const id = w.getBlock(x, y, z);
    const meta = w.getMeta(x, y, z);
    switch (RS[id]) {
      case 'torch': case 'torch_off':
        if (this.torchShouldLight(w, x, y, z, meta) !== (id === K.redstone_torch)) w.schedule(x, y, z, 2);
        return;
      case 'repeater':
        if (this.repeaterInput(w, x, y, z, meta) !== !!(meta & 16)) w.schedule(x, y, z, 2 * (((meta >> 2) & 3) + 1));
        return;
      case 'daylight': w.schedule(x, y, z, 1); return;
    }
    switch (MECH[id]) {
      case 'lamp': {
        const p = this.powered(w, x, y, z);
        if (p && id === K.redstone_lamp) w.setBlock(x, y, z, K.redstone_lamp_on, 0);
        else if (!p && id === K.redstone_lamp_on) w.schedule(x, y, z, 4);
        return;
      }
      case 'piston': {
        const ext = !!(meta & 8);
        if (this.powered(w, x, y, z, meta & 7) !== ext) w.schedule(x, y, z, 1);
        return;
      }
      case 'tnt':
        if (this.powered(w, x, y, z)) { w.setBlock(x, y, z, 0); this.game.primeTnt(x, y, z); }
        return;
      case 'door': {
        const by = (meta & 8) ? y - 1 : y;
        if (w.getBlock(x, by, z) !== id) return;
        const p = this.powered(w, x, by, z) || this.powered(w, x, by + 1, z);
        const k = key(x, by, z);
        const prev = this.edge.get(k) || false;
        if (p === prev) return;
        this.edge.set(k, p);
        const bm = w.getMeta(x, by, z);
        if (!!(bm & 4) === p) return;
        const nm = p ? bm | 4 : bm & ~4;
        w.setBlock(x, by, z, id, nm, { notify: false });
        w.setBlock(x, by + 1, z, id, nm | 8, { notify: false });
        this.game.audio.play(p ? 'door_open' : 'door_close', x + 0.5, by + 0.5, z + 0.5);
        return;
      }
      case 'note': case 'bell': {
        const p = this.powered(w, x, y, z);
        const k = key(x, y, z);
        const prev = this.edge.get(k) || false;
        if (p === prev) return;
        if (p) this.edge.set(k, true); else this.edge.delete(k);
        if (!p) return;
        if (MECH[id] === 'note') this.game.playNoteBlock(x, y, z, false);
        else this.game.audio.play('bell', x + 0.5, y + 0.5, z + 0.5);
        return;
      }
    }
  }

  // ticks planifiés
  scheduledTick(w, x, y, z, id) {
    const meta = w.getMeta(x, y, z);
    const g = this.game;
    switch (RS[id]) {
      case 'torch': case 'torch_off': {
        const lit = id === K.redstone_torch;
        const want = this.torchShouldLight(w, x, y, z, meta);
        if (want === lit) return;
        const k = key(x, y, z);
        let h = this.toggles.get(k);
        if (!h) { h = { t: [], until: 0 }; this.toggles.set(k, h); }
        if (want && w.tick < h.until) { w.schedule(x, y, z, h.until - w.tick + 1); return; }
        h.t = h.t.filter((t) => w.tick - t < 60);
        h.t.push(w.tick);
        if (h.t.length > 8) {
          // la torche grille si elle clignote trop vite
          h.until = w.tick + 160; h.t.length = 0;
          w.setBlock(x, y, z, K.redstone_torch_off, meta);
          g.audio.play('fizz', x + 0.5, y + 0.5, z + 0.5, 0.5);
          for (let i = 0; i < 5; i++) g.particles.smoke?.(x + 0.5, y + 0.7, z + 0.5);
          w.schedule(x, y, z, 161);
          return;
        }
        if (this.toggles.size > 512) for (const [kk, v] of this.toggles) if (w.tick - (v.t[v.t.length - 1] || 0) > 200 && w.tick > v.until) this.toggles.delete(kk);
        w.setBlock(x, y, z, want ? K.redstone_torch : K.redstone_torch_off, meta);
        return;
      }
      case 'repeater': {
        const want = this.repeaterInput(w, x, y, z, meta);
        const on = !!(meta & 16);
        if (want === on) return;
        w.setBlock(x, y, z, id, want ? meta | 16 : meta & ~16);
        // impulsion trop courte : on la prolonge
        if (want && !this.repeaterInput(w, x, y, z, meta)) w.schedule(x, y, z, 2 * (((meta >> 2) & 3) + 1));
        return;
      }
      case 'button':
        if (meta & 16) { w.setBlock(x, y, z, id, meta & ~16); g.audio.play('button_off', x + 0.5, y + 0.5, z + 0.5); }
        return;
      case 'plate':
        if (!(meta & 1)) return;
        if (this.plateOccupied(w, x, y, z, id)) w.schedule(x, y, z, 10);
        else { w.setBlock(x, y, z, id, meta & ~1); g.audio.play('plate_off', x + 0.5, y + 0.1, z + 0.5); }
        return;
      case 'observer':
        if (meta & 8) w.setBlock(x, y, z, id, meta & ~8);
        else { w.setBlock(x, y, z, id, meta | 8); w.schedule(x, y, z, 2); }
        return;
      case 'daylight': {
        const p = this.daylightPower(w, x, y, z, meta);
        if ((meta & 15) !== p) w.setBlock(x, y, z, id, (meta & ~15) | p);
        w.schedule(x, y, z, 40);
        return;
      }
    }
    switch (MECH[id]) {
      case 'lamp': if (id === K.redstone_lamp_on && !this.powered(w, x, y, z)) w.setBlock(x, y, z, K.redstone_lamp, 0); return;
      case 'piston': {
        const k = meta & 7;
        const want = this.powered(w, x, y, z, k);
        const ext = !!(meta & 8);
        if (want && !ext) this.extend(w, x, y, z, id, meta);
        else if (!want && ext) this.retract(w, x, y, z, id, meta);
        return;
      }
    }
  }

  // tick aléatoire : répare les états bloqués (sauvegarde pendant une impulsion, etc.)
  randomTick(w, x, y, z, id, meta) {
    const t = RS[id];
    if (t === 'button' && (meta & 16)) w.schedule(x, y, z, 1);
    else if (t === 'plate' && (meta & 1)) w.schedule(x, y, z, 1);
    else if (t === 'observer' && (meta & 8)) w.schedule(x, y, z, 1);
    else if (t === 'daylight') w.schedule(x, y, z, 1);
    else if (t || MECH[id] === 'lamp' || MECH[id] === 'piston') { this.enqueue(x, y, z); this.flush(w); }
  }

  daylightPower(w, x, y, z, meta) {
    const sky = w.getSkyLight(x, y + 1, z);
    const g = this.game;
    let p;
    if (g.dim !== 0) p = 0;
    else {
      const day = Math.max(0, Math.min(1, ((g.env && g.env.daylight) ?? 1)));
      p = Math.round(sky * Math.pow(day, 1.4) * (1 - (g.weather ? g.weather.rain * 0.25 : 0)));
    }
    p = Math.max(0, Math.min(15, p));
    return (meta & 16) ? 15 - p : p;
  }

  // ------------------------------------------------------------ OBSERVATEURS
  observe(w, x, y, z) {
    for (let k = 0; k < 6; k++) {
      const d = V6[k], nx = x + d[0], ny = y + d[1], nz = z + d[2];
      const id = w.getBlock(nx, ny, nz);
      if (RS[id] !== 'observer') continue;
      const m = w.getMeta(nx, ny, nz);
      // l'observateur regarde dans la direction m&7 : il voit (x,y,z) si celui-ci est devant lui
      if ((m & 7) === OPP6[k] && !(m & 8)) w.schedule(nx, ny, nz, 2);
    }
  }

  // ------------------------------------------------------------ INTERACTIONS
  use(x, y, z, id) {
    const w = this.game.world, g = this.game;
    const meta = w.getMeta(x, y, z);
    switch (RS[id]) {
      case 'lever':
        w.setBlock(x, y, z, id, meta ^ 16);
        g.audio.play('lever', x + 0.5, y + 0.5, z + 0.5);
        return true;
      case 'button':
        if (meta & 16) return true;
        w.setBlock(x, y, z, id, meta | 16);
        w.schedule(x, y, z, BLOCKS[id].pulse || 20);
        g.audio.play('button', x + 0.5, y + 0.5, z + 0.5);
        return true;
      case 'repeater':
        w.setBlock(x, y, z, id, (meta & ~12) | ((((meta >> 2) & 3) + 1) & 3) << 2);
        g.audio.play('click', x + 0.5, y + 0.2, z + 0.5);
        return true;
      case 'daylight': {
        const nm = meta ^ 16;
        w.setBlock(x, y, z, id, (nm & ~15) | this.daylightPower(w, x, y, z, nm));
        g.audio.play('click', x + 0.5, y + 0.4, z + 0.5);
        return true;
      }
    }
    return false;
  }

  // ------------------------------------------------------------ PLAQUES
  plateOccupied(w, x, y, z, id) {
    const wooden = BLOCKS[id].wooden;
    const hit = (e) => {
      if (!e || e.dead) return false;
      const b = e.aabb ? e.aabb() : null;
      if (!b) return false;
      return b[0] < x + 15 / 16 && b[3] > x + 1 / 16 && b[2] < z + 15 / 16 && b[5] > z + 1 / 16 && b[1] < y + 0.3 && b[4] > y;
    };
    const p = this.game.player;
    if (!p.spectator && !p.dead && hit(p)) return true;
    for (const e of this.game.entities.list) {
      if (!wooden && !e.def) continue;
      if (hit(e)) return true;
    }
    return false;
  }
  // chaque tick : les entités qui marchent sur une plaque la déclenchent
  tick() {
    const g = this.game, w = g.world;
    const check = (e, all) => {
      if (!e || e.dead) return;
      if (e.onGround === false && Math.abs(e.vy || 0) > 0.6) return;
      const hw = (e.w || 0.6) / 2 - 0.05;
      const y = Math.floor(e.y + 0.01);
      for (const [cx, cz] of [[e.x - hw, e.z - hw], [e.x + hw, e.z - hw], [e.x - hw, e.z + hw], [e.x + hw, e.z + hw]]) {
        const x = Math.floor(cx), z = Math.floor(cz);
        const id = w.getBlock(x, y, z);
        if (RS[id] !== 'plate') continue;
        if (!all && BLOCKS[id].wooden !== true && !e.def) continue;
        const m = w.getMeta(x, y, z);
        if (m & 1) continue;
        w.setBlock(x, y, z, id, m | 1);
        w.schedule(x, y, z, 20);
        g.audio.play('plate_on', x + 0.5, y + 0.1, z + 0.5);
      }
    };
    const p = g.player;
    if (!p.spectator && !p.dead) check(p, true);
    for (const e of g.entities.list) {
      if (Math.abs(e.x - p.x) > 96 || Math.abs(e.z - p.z) > 96) continue;
      check(e, false);
    }
  }

  // ------------------------------------------------------------ PISTONS
  // réaction d'un bloc poussé : 0 vide (écrasé), 1 normal, 2 détruit, 3 immobile
  pushReaction(w, x, y, z, id) {
    if (id === 0 || B_FLUID[id]) return 0;
    const b = BLOCKS[id];
    if (id === K.bedrock || id === K.obsidian || id === K.crying_obsidian || id === K.end_portal_frame || id === K.nether_portal || id === K.end_portal ||
      id === K.piston_head || id === K.reinforced_deepslate || id === K.respawn_anchor || id === K.enchanting_table || id === K.ender_chest) return 3;
    if (b.hardness < 0) return 3;
    if ((MECH[id] === 'piston') && (w.getMeta(x, y, z) & 8)) return 3;
    if (w.getBlockEntity(x, y, z) || b.interact === 'chest' || b.interact === 'furnace' || b.interact === 'jukebox') return 3;
    if (b.replaceable) return 2;
    if (!b.solid || b.support || b.tall || b.tallTop || b.key === 'oak_door' || b.key === 'red_bed' || b.key === 'cactus' || b.key === 'cake') return 2;
    return 1;
  }
  extend(w, x, y, z, id, meta) {
    const g = this.game;
    const k = meta & 7, d = V6[k];
    const line = [];
    let cx = x + d[0], cy = y + d[1], cz = z + d[2];
    let destroy = null;
    for (let i = 0; ; i++) {
      if (cy < 0 || cy >= HEIGHT) return false;
      const bid = w.getBlock(cx, cy, cz);
      const r = this.pushReaction(w, cx, cy, cz, bid);
      if (r === 3) return false;
      if (r === 0) break;
      if (r === 2) { destroy = [cx, cy, cz]; break; }
      if (i >= 12) return false;
      line.push([cx, cy, cz, bid, w.getMeta(cx, cy, cz)]);
      cx += d[0]; cy += d[1]; cz += d[2];
    }
    if (!w.isLoaded(cx, cz)) return false;
    const was = this.busy;
    this.busy = true;
    try {
      if (destroy) g.breakBlock(destroy[0], destroy[1], destroy[2], true, false);
      for (let i = line.length - 1; i >= 0; i--) {
        const [bx, by, bz, bid, bm] = line[i];
        w.setBlock(bx + d[0], by + d[1], bz + d[2], bid, bm);
      }
      const hx = x + d[0], hy = y + d[1], hz = z + d[2];
      w.setBlock(x, y, z, id, meta | 8, { notify: false });
      w.setBlock(hx, hy, hz, K.piston_head, k | (BLOCKS[id].sticky ? 8 : 0), { notify: false });
      g.logic.onBlockChanged(w, x, y, z, id, id, meta, meta | 8);
      g.logic.onBlockChanged(w, hx, hy, hz, 0, K.piston_head, 0, k);
      // pousse les entités
      this.pushEntities(line.map((b) => [b[0] + d[0], b[1] + d[1], b[2] + d[2]]).concat([[hx, hy, hz]]), d);
    } finally { this.busy = was; }
    g.audio.play('piston_out', x + 0.5, y + 0.5, z + 0.5);
    this.notifyAround(w, x, y, z, true);
    this.flush(w);
    return true;
  }
  retract(w, x, y, z, id, meta) {
    const g = this.game;
    const k = meta & 7, d = V6[k];
    const hx = x + d[0], hy = y + d[1], hz = z + d[2];
    const was = this.busy;
    this.busy = true;
    try {
      w.setBlock(x, y, z, id, meta & ~8, { notify: false });
      if (w.getBlock(hx, hy, hz) === K.piston_head) w.setBlock(hx, hy, hz, 0, 0, { notify: false });
      if (BLOCKS[id].sticky) {
        const px = hx + d[0], py = hy + d[1], pz = hz + d[2];
        const bid = w.getBlock(px, py, pz);
        if (bid && this.pushReaction(w, px, py, pz, bid) === 1 && !(MECH[bid] === 'piston' && (w.getMeta(px, py, pz) & 8))) {
          const bm = w.getMeta(px, py, pz);
          w.setBlock(px, py, pz, 0);
          w.setBlock(hx, hy, hz, bid, bm);
        }
      }
      g.logic.onBlockChanged(w, x, y, z, id, id, meta, meta & ~8);
      g.logic.onBlockChanged(w, hx, hy, hz, K.piston_head, w.getBlock(hx, hy, hz), 0, 0);
    } finally { this.busy = was; }
    g.audio.play('piston_in', x + 0.5, y + 0.5, z + 0.5);
    this.notifyAround(w, x, y, z, true);
    this.flush(w);
    return true;
  }
  pushEntities(cells, d) {
    const g = this.game;
    const list = [g.player, ...g.entities.list];
    for (const e of list) {
      if (!e || e.dead || !e.aabb || e.spectator) continue;
      const b = e.aabb();
      for (const [x, y, z] of cells) {
        if (b[0] < x + 1 && b[3] > x && b[1] < y + 1 && b[4] > y && b[2] < z + 1 && b[5] > z) {
          e.x += d[0] * 1.01; e.y += d[1] > 0 ? 1.01 : 0; e.z += d[2] * 1.01;
          if (d[1] > 0 && e.vy !== undefined) e.vy = Math.max(e.vy, 0.1);
          break;
        }
      }
    }
  }

  // cohérence piston / tête (appelé par la vérification des supports)
  checkPiston(w, x, y, z, id) {
    const meta = w.getMeta(x, y, z);
    if (this.busy) return;
    if (id === K.piston_head) {
      const d = V6[meta & 7];
      const bx = x - d[0], by = y - d[1], bz = z - d[2];
      const b = w.getBlock(bx, by, bz);
      const bm = w.getMeta(bx, by, bz);
      if (MECH[b] !== 'piston' || !(bm & 8) || (bm & 7) !== (meta & 7)) w.setBlock(x, y, z, 0);
      return;
    }
    if (MECH[id] === 'piston' && (meta & 8)) {
      const d = V6[meta & 7];
      if (w.getBlock(x + d[0], y + d[1], z + d[2]) !== K.piston_head) this.game.breakBlock(x, y, z, true, false);
    }
  }
}
