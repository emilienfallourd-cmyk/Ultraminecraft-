// Gestionnaire d'entités : tick, rendu, requêtes de proximité, poussées entre mobs
export class EntityManager {
  constructor(game) { this.game = game; this.list = []; }
  get scene() { return this.game.pipeline.entityScene; }
  add(e) {
    this.list.push(e);
    if (e.model) this.scene.add(e.model);
    return e;
  }
  tick() {
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (e.removed) continue;
      e.tick();
    }
    // poussée entre créatures
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (!a.pushable || a.removed || a.dead) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (!b.pushable || b.removed || b.dead) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const r = (a.w + b.w) / 2;
        if (Math.abs(dx) > r || Math.abs(dz) > r || Math.abs(b.y - a.y) > Math.max(a.h, b.h)) continue;
        const d = Math.hypot(dx, dz) || 0.01;
        const f = 0.05 * (1 - d / (r * 1.42));
        if (f <= 0) continue;
        const ma = a.mass || 1, mb = b.mass || 1;
        a.vx -= dx / d * f * mb / (ma + mb) * 2; a.vz -= dz / d * f * mb / (ma + mb) * 2;
        b.vx += dx / d * f * ma / (ma + mb) * 2; b.vz += dz / d * f * ma / (ma + mb) * 2;
      }
    }
    // joueur poussé par les créatures
    const p = this.game.player;
    if (p && !p.dead && !p.spectator) for (const a of L) {
      if (!a.pushable || a.dead || a.removed) continue;
      const dx = p.x - a.x, dz = p.z - a.z, r = (a.w + p.w) / 2;
      if (Math.abs(dx) > r || Math.abs(dz) > r || p.y > a.y + a.h || a.y > p.y + p.h) continue;
      const d = Math.hypot(dx, dz) || 0.01;
      const f = 0.04 * (1 - d / (r * 1.42));
      if (f > 0) { p.vx += dx / d * f; p.vz += dz / d * f; a.vx -= dx / d * f * 0.5; a.vz -= dz / d * f * 0.5; }
    }
    // retrait
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const e = L[i];
      if (e.removed) { if (e.model) { this.scene.remove(e.model); this.disposeModel(e.model); } if (e.dispose) e.dispose(); continue; }
      L[w++] = e;
    }
    L.length = w;
  }
  disposeModel(m) {
    m.traverse((o) => { if (o.material && o.material.dispose && !o.material.shared) o.material.dispose(); });
  }
  render(alpha, camera) {
    for (const e of this.list) if (!e.removed && e.render) e.render(alpha, 0, camera);
  }
  near(x, y, z, r) {
    const out = [];
    const r2 = r * r;
    for (const e of this.list) {
      if (e.removed) continue;
      const dx = e.x - x, dy = e.y - y, dz = e.z - z;
      if (dx * dx + dy * dy + dz * dz <= r2) out.push(e);
    }
    return out;
  }
  count(fn) { let n = 0; for (const e of this.list) if (!e.removed && fn(e)) n++; return n; }
  clear() {
    for (const e of this.list) { if (e.model) { this.scene.remove(e.model); this.disposeModel(e.model); } if (e.dispose) e.dispose(); }
    this.list = [];
  }
}
