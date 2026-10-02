// Portails (Nether, End), forts, invocations (Wither, golem), hurleurs sculk
import { BLOCKS, BLOCK as K, B_SOLID } from '../blocks/blocks.js';
import { HEIGHT } from '../constants.js';
import { strongholdPositions } from '../world/gen/structures.js';
import { Entity } from '../entity/entity.js';
import * as THREE from 'three';
import { spriteMesh } from '../entity/models.js';
import { ITEM, ItemStack } from '../items/items.js';

export class Portals {
  constructor(game) { this.game = game; this.shriekCount = 0; this.shriekCd = 0; }

  // --------------------------------------------------- PORTAIL DU NETHER
  tryLight(x, y, z) {
    const w = this.game.world;
    if (this.game.dim === 2) return false;
    for (const axis of [0, 1]) {
      const ax = axis === 0 ? [1, 0] : [0, 1];
      // descendre jusqu'au cadre
      let by = y;
      while (by > 0 && w.getBlock(x, by - 1, z) !== K.obsidian && y - by < 22) { if (w.getBlock(x, by - 1, z) !== 0) break; by--; }
      if (w.getBlock(x, by - 1, z) !== K.obsidian) continue;
      // aller vers le bord gauche
      let lx = x, lz = z, n = 0;
      while (w.getBlock(lx - ax[0], by, lz - ax[1]) === 0 && n < 22) { lx -= ax[0]; lz -= ax[1]; n++; }
      if (w.getBlock(lx - ax[0], by, lz - ax[1]) !== K.obsidian) continue;
      // largeur
      let width = 0;
      while (width < 22 && w.getBlock(lx + ax[0] * width, by, lz + ax[1] * width) === 0) width++;
      if (width < 2 || width > 21 || w.getBlock(lx + ax[0] * width, by, lz + ax[1] * width) !== K.obsidian) continue;
      // hauteur
      let height = 0;
      while (height < 22 && w.getBlock(lx, by + height, lz) === 0) height++;
      if (height < 3 || height > 21) continue;
      // vérification complète
      let ok = true;
      for (let i = 0; i < width && ok; i++) {
        if (w.getBlock(lx + ax[0] * i, by - 1, lz + ax[1] * i) !== K.obsidian) ok = false;
        if (w.getBlock(lx + ax[0] * i, by + height, lz + ax[1] * i) !== K.obsidian) ok = false;
        for (let j = 0; j < height && ok; j++) { const b = w.getBlock(lx + ax[0] * i, by + j, lz + ax[1] * i); if (b !== 0 && b !== K.fire) ok = false; }
      }
      for (let j = 0; j < height && ok; j++) {
        if (w.getBlock(lx - ax[0], by + j, lz - ax[1]) !== K.obsidian) ok = false;
        if (w.getBlock(lx + ax[0] * width, by + j, lz + ax[1] * width) !== K.obsidian) ok = false;
      }
      if (!ok) continue;
      for (let i = 0; i < width; i++) for (let j = 0; j < height; j++) w.setBlock(lx + ax[0] * i, by + j, lz + ax[1] * i, K.nether_portal, axis, { notify: false });
      this.game.audio.play('portal_open', x, y, z);
      return true;
    }
    return false;
  }

  tickPlayer(p) {
    const g = this.game;
    if (p.inPortal === 'nether') {
      p.portalTicks = (p.portalTicks || 0) + 1;
      if (p.portalTicks === 1) g.audio.play('portal_trigger', p.x, p.y, p.z);
      if (p.portalCooldown <= 0 && p.portalTicks >= (p.creative ? 2 : 80)) { p.portalTicks = 0; p.portalCooldown = 100; this.travelNether(p); }
    } else if (p.inPortal === 'end') {
      if (p.portalCooldown <= 0) { p.portalCooldown = 100; this.travelEnd(p); }
    } else if (p.inPortal === 'gateway') {
      if (p.portalCooldown <= 0) { p.portalCooldown = 60; this.travelGateway(p); }
    } else p.portalTicks = Math.max(0, (p.portalTicks || 0) - 2);
    if (this.shriekCd > 0) this.shriekCd--;
    // yeux de l'Ender en vol
    if (this.eyes) for (const e of this.eyes) e.tick();
  }

  async travelNether(p) {
    const g = this.game;
    const toNether = g.dim === 0;
    const target = toNether ? [Math.floor(p.x / 8), Math.floor(p.z / 8)] : [Math.floor(p.x * 8), Math.floor(p.z * 8)];
    const y = toNether ? Math.min(100, Math.max(30, Math.floor(p.y))) : Math.floor(p.y);
    this.arrival = { kind: 'nether', x: target[0], y, z: target[1] };
    g.pendingSafeSpawn = false;
    await g.enterDimension(toNether ? 1 : 0, [target[0] + 0.5, y, target[1] + 0.5]);
    g.pendingSafeSpawn = true;
  }
  async travelEnd(p) {
    const g = this.game;
    if (g.dim === 2) {
      // portail de sortie : retour à la surface
      g.pendingSafeSpawn = true;
      g.ui.showCredits && g.ui.showCredits();
      await g.enterDimension(0, p.spawnPoint || g.meta.spawn);
      return;
    }
    this.arrival = { kind: 'end' };
    g.pendingSafeSpawn = false;
    await g.enterDimension(2, [100.5, 49, 0.5]);
    g.pendingSafeSpawn = true;
  }
  async travelGateway(p) {
    const g = this.game;
    const a = Math.atan2(p.z, p.x);
    const tx = Math.cos(a) * 1000, tz = Math.sin(a) * 1000;
    const w = g.world;
    p.setPos(tx, 80, tz);
    g.world.setCenter(Math.floor(tx) >> 4, Math.floor(tz) >> 4, g.settings.renderDistance);
    this.pendingGatewayLand = 200;
    void w;
  }

  onArrive(dim) {
    const g = this.game, w = g.world, p = g.player;
    const a = this.arrival;
    this.arrival = null;
    if (!a) return;
    if (a.kind === 'end') {
      // plateforme d'obsidienne
      for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
        w.setBlock(100 + dx, 48, dz, K.obsidian);
        for (let dy = 1; dy <= 3; dy++) w.setBlock(100 + dx, 48 + dy, dz, 0);
      }
      p.setPos(100.5, 49, 0.5); p.yaw = Math.PI / 2;
      return;
    }
    if (a.kind === 'nether') {
      // portail existant à proximité ?
      const R = dim === 1 ? 16 : 64;
      let best = null, bd = Infinity;
      for (const c of w.chunks.values()) {
        if (Math.abs(c.cx * 16 - a.x) > R + 16 || Math.abs(c.cz * 16 - a.z) > R + 16) continue;
        for (let i = 0; i < c.blocks.length; i++) {
          if (c.blocks[i] !== K.nether_portal) continue;
          const x = c.cx * 16 + (i & 15), y = i >> 8, z = c.cz * 16 + ((i >> 4) & 15);
          if (w.getBlock(x, y - 1, z) === K.nether_portal) continue;
          const d = (x - a.x) ** 2 + (z - a.z) ** 2 + (y - a.y) ** 2 * 0.25;
          if (d < bd) { bd = d; best = [x, y, z]; }
        }
      }
      if (best && bd < R * R * 2) { p.setPos(best[0] + 0.5, best[1], best[2] + 0.5); p.portalCooldown = 100; return; }
      // construire un nouveau portail
      const spot = this.findPortalSpot(w, a.x, a.y, a.z, dim);
      this.buildPortal(w, spot[0], spot[1], spot[2]);
      p.setPos(spot[0] + 1.5, spot[1], spot[2] + 0.5);
      p.portalCooldown = 100;
    }
  }

  findPortalSpot(w, x, y, z, dim) {
    let best = null, bestScore = -Infinity;
    for (let dx = -12; dx <= 12; dx += 2) for (let dz = -12; dz <= 12; dz += 2) {
      for (let yy = (dim === 1 ? 100 : HEIGHT - 8); yy > 8; yy--) {
        const X = x + dx, Z = z + dz;
        if (!B_SOLID[w.getBlock(X, yy - 1, Z)] || BLOCKS[w.getBlock(X, yy - 1, Z)].fluid) continue;
        let free = true;
        for (let i = 0; i < 4 && free; i++) for (let j = 0; j < 5 && free; j++) if (B_SOLID[w.getBlock(X + i - 1, yy + j, Z)] || BLOCKS[w.getBlock(X + i - 1, yy + j, Z)].fluid) free = false;
        if (!free) continue;
        const score = -Math.abs(yy - y) - (dx * dx + dz * dz) * 0.05;
        if (score > bestScore) { bestScore = score; best = [X - 1, yy, Z]; }
        break;
      }
    }
    if (!best) best = [x, Math.max(32, Math.min(100, y)), z];
    return best;
  }

  buildPortal(w, x, y, z) {
    // plateforme
    for (let i = -1; i <= 4; i++) for (let k = -1; k <= 1; k++) if (!B_SOLID[w.getBlock(x + i, y - 1, z + k)] || BLOCKS[w.getBlock(x + i, y - 1, z + k)].fluid) w.setBlock(x + i, y - 1, z + k, K.obsidian);
    for (let i = -1; i <= 4; i++) for (let k = -1; k <= 1; k++) for (let j = 0; j < 5; j++) if (k !== 0) w.setBlock(x + i, y + j, z + k, 0);
    for (let i = 0; i < 4; i++) for (let j = -1; j < 5; j++) {
      const frame = i === 0 || i === 3 || j === -1 || j === 4;
      w.setBlock(x + i, y + j, z, frame ? K.obsidian : K.nether_portal, frame ? 0 : 0, { notify: false });
    }
  }

  // ------------------------------------------------------- PORTAIL DE L'END
  checkEndPortal(x, y, z) {
    const w = this.game.world;
    // cherche un anneau 5x5 de cadres autour d'un centre 3x3
    for (let cx = x - 4; cx <= x + 4; cx++) for (let cz = z - 4; cz <= z + 4; cz++) {
      let ok = true;
      const ring = [];
      for (let i = -1; i <= 1; i++) { ring.push([cx + i, cz - 2], [cx + i, cz + 2], [cx - 2, cz + i], [cx + 2, cz + i]); }
      for (const [rx, rz] of ring) {
        if (w.getBlock(rx, y, rz) !== K.end_portal_frame || !(w.getMeta(rx, y, rz) & 4)) { ok = false; break; }
      }
      if (!ok) continue;
      for (let i = -1; i <= 1; i++) for (let k = -1; k <= 1; k++) w.setBlock(cx + i, y, cz + k, K.end_portal, 0, { notify: false });
      this.game.audio.play('end_portal_open', cx, y, cz);
      this.game.ui.toast('Le portail de l\'End s\'est ouvert…');
      return true;
    }
    return false;
  }

  nearestStronghold(x, z) {
    const list = strongholdPositions(this.game.seed);
    let best = null, bd = Infinity;
    for (const s of list) { const d = (s[0] - x) ** 2 + (s[2] - z) ** 2; if (d < bd) { bd = d; best = s; } }
    return best;
  }
  throwEye(p, target) {
    this.eyes = this.eyes || [];
    this.eyes.push(new EyeOfEnder(this.game, p.x, p.y + 1.5, p.z, target));
  }

  // --------------------------------------------------------- INVOCATIONS
  checkWitherSummon(x, y, z) {
    const w = this.game.world;
    const isSS = (a, b, c) => { const id = w.getBlock(a, b, c); return id === K.soul_sand || id === K.soul_soil; };
    for (const ax of [[1, 0], [0, 1]]) {
      for (let off = -2; off <= 0; off++) {
        const sx = x + ax[0] * off, sz = z + ax[1] * off; // crâne gauche
        const skulls = [0, 1, 2].map((i) => [sx + ax[0] * i, y, sz + ax[1] * i]);
        if (!skulls.every(([a, b, c]) => w.getBlock(a, b, c) === K.wither_skeleton_skull)) continue;
        const mid = skulls[1];
        const body = [[mid[0] - ax[0], y - 1, mid[2] - ax[1]], [mid[0], y - 1, mid[2]], [mid[0] + ax[0], y - 1, mid[2] + ax[1]], [mid[0], y - 2, mid[2]]];
        if (!body.every(([a, b, c]) => isSS(a, b, c))) continue;
        for (const [a, b, c] of [...skulls, ...body]) w.setBlock(a, b, c, 0);
        this.game.spawnMob('wither', mid[0] + 0.5, y - 2, mid[2] + 0.5);
        this.game.ui.toast('Le Wither a été invoqué !');
        return true;
      }
    }
    return false;
  }
  checkGolemSummon(x, y, z) {
    const w = this.game.world;
    if (w.getBlock(x, y - 1, z) === K.snow_block && w.getBlock(x, y - 2, z) === K.snow_block) {
      w.setBlock(x, y, z, 0); w.setBlock(x, y - 1, z, 0); w.setBlock(x, y - 2, z, 0);
      this.game.spawnMob('snow_golem', x + 0.5, y - 2, z + 0.5);
      return;
    }
    if (w.getBlock(x, y - 1, z) !== K.iron_block || w.getBlock(x, y - 2, z) !== K.iron_block) return;
    for (const ax of [[1, 0], [0, 1]]) {
      if (w.getBlock(x + ax[0], y - 1, z + ax[1]) === K.iron_block && w.getBlock(x - ax[0], y - 1, z - ax[1]) === K.iron_block) {
        for (const [a, b, c] of [[x, y, z], [x, y - 1, z], [x, y - 2, z], [x + ax[0], y - 1, z + ax[1]], [x - ax[0], y - 1, z - ax[1]]]) w.setBlock(a, b, c, 0);
        this.game.spawnMob('iron_golem', x + 0.5, y - 2, z + 0.5);
        return;
      }
    }
  }
  shriek(x, y, z) {
    const g = this.game;
    if (this.shriekCd > 0) return;
    this.shriekCd = 200;
    this.shriekCount++;
    g.audio.play('shriek', x, y, z);
    for (let i = 0; i < 12; i++) g.particles.soul(x + 0.5, y + 1 + i * 0.15, z + 0.5);
    g.player.addEffect('darkness', 260, 0);
    if (this.shriekCount >= 3 && !g.entities.list.some((e) => e.mobType === 'warden' && !e.dead)) {
      this.shriekCount = 0;
      // le Warden émerge du sol
      for (let tries = 0; tries < 20; tries++) {
        const sx = x + Math.floor((Math.random() - 0.5) * 10), sz = z + Math.floor((Math.random() - 0.5) * 10);
        for (let sy = y + 3; sy > y - 6; sy--) {
          if (B_SOLID[g.world.getBlock(sx, sy - 1, sz)] && !B_SOLID[g.world.getBlock(sx, sy, sz)] && !B_SOLID[g.world.getBlock(sx, sy + 1, sz)] && !B_SOLID[g.world.getBlock(sx, sy + 2, sz)]) {
            g.spawnMob('warden', sx + 0.5, sy, sz + 0.5, { emerging: true });
            g.ui.toast('Le Warden approche…');
            return;
          }
        }
      }
    } else g.ui.toast(['Un hurlement résonne dans les abîmes…', 'Le Warden s\'agite…'][Math.min(1, this.shriekCount - 1)]);
  }
}

// Œil de l'Ender lancé (vole vers le fort)
class EyeOfEnder {
  constructor(game, x, y, z, target) {
    this.game = game; this.x = x; this.y = y; this.z = z; this.age = 0;
    const dx = target[0] - x, dz = target[2] - z, d = Math.hypot(dx, dz);
    this.tx = x + dx / d * Math.min(12, d); this.tz = z + dz / d * Math.min(12, d); this.ty = y + 8;
    this.mesh = spriteMesh(ITEM.ender_eye);
    this.mesh.scale.setScalar(0.4);
    game.pipeline.entityScene.add(this.mesh);
    game.audio.play('throw', x, y, z);
  }
  tick() {
    if (this.dead) return;
    this.age++;
    const t = Math.min(1, this.age / 50);
    const px = this.x + (this.tx - this.x) * t, pz = this.z + (this.tz - this.z) * t, py = this.y + (this.ty - this.y) * Math.sin(t * Math.PI * 0.6);
    this.mesh.position.set(px, py, pz);
    this.mesh.quaternion.copy(this.game.pipeline.camera.quaternion);
    this.game.particles.portal(px, py, pz, 2);
    if (this.age > 70) {
      this.dead = true;
      this.game.pipeline.entityScene.remove(this.mesh);
      if (Math.random() < 0.8) this.game.dropItem(new ItemStack(ITEM.ender_eye, 1), px, py, pz);
      else { this.game.particles.burst(px, py, pz, 0x2a8a6a, 12); this.game.audio.play('glass', px, py, pz); }
    }
  }
}
export { Entity, THREE };
