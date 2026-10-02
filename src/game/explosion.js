// Explosions façon Minecraft : rayons depuis le centre, résistance des blocs, dégâts et recul des entités
import { BLOCKS, BLOCK as K, B_SOLID } from '../blocks/blocks.js';
import { HEIGHT } from '../constants.js';

const RAYS = [];
for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) for (let k = 0; k < 16; k++) {
  if (i !== 0 && i !== 15 && j !== 0 && j !== 15 && k !== 0 && k !== 15) continue;
  let dx = i / 15 * 2 - 1, dy = j / 15 * 2 - 1, dz = k / 15 * 2 - 1;
  const l = Math.hypot(dx, dy, dz);
  RAYS.push([dx / l, dy / l, dz / l]);
}

export function explode(game, x, y, z, power, opts = {}) {
  const w = game.world;
  const destroy = new Map();
  if (!opts.noBlocks && !(opts.inWater)) {
    const inFluid = BLOCKS[w.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))].fluid;
    if (!inFluid || opts.force) {
      for (const [dx, dy, dz] of RAYS) {
        let f = power * (0.7 + Math.random() * 0.6);
        let px = x, py = y, pz = z;
        while (f > 0) {
          const bx = Math.floor(px), by = Math.floor(py), bz = Math.floor(pz);
          if (by < 0 || by >= HEIGHT) break;
          const id = w.getBlock(bx, by, bz);
          if (id) {
            const def = BLOCKS[id];
            const res = def.hardness < 0 ? 3600000 : def.blast;
            f -= (res + 0.3) * 0.3;
            if (f > 0 && def.hardness >= 0 && !(def.fluid)) destroy.set(bx + ',' + by + ',' + bz, [bx, by, bz, id]);
          }
          px += dx * 0.3; py += dy * 0.3; pz += dz * 0.3;
          f -= 0.225;
        }
      }
    }
  }
  // blocs détruits
  let n = 0;
  for (const [, [bx, by, bz, id]] of destroy) {
    const def = BLOCKS[id];
    if (id === K.tnt) { w.setBlock(bx, by, bz, 0); game.primeTnt(bx, by, bz, 10 + Math.floor(Math.random() * 20)); continue; }
    const drop = Math.random() < (opts.tnt === false ? 1 / power : 1 / Math.max(1, power * 0.7));
    game.breakBlock(bx, by, bz, drop, n++ % 3 !== 0);
    if (opts.fire && Math.random() < 0.33 && B_SOLID[w.getBlock(bx, by - 1, bz)]) w.setBlock(bx, by, bz, K.fire);
  }
  // entités
  const r = power * 2;
  for (const e of game.entities.near(x, y, z, r + 2).concat(game.player.dead ? [] : [game.player])) {
    if (e === opts.source || e.removed) continue;
    const ex = e.x - x, ey = (e.y + (e.eyeHeight || e.h / 2)) - y, ez = e.z - z;
    const d = Math.hypot(ex, ey, ez);
    if (d > r) continue;
    const exposure = rayExposure(w, x, y, z, e);
    const impact = (1 - d / r) * exposure;
    const dmg = Math.floor((impact * impact + impact) / 2 * 7 * r + 1);
    if (e.type === 'item' || e.type === 'xp') { if (e.damage) e.damage(dmg, { type: 'explosion' }); continue; }
    if (opts.dragonImmune && e.type === 'ender_dragon') continue;
    e.damage(dmg, { type: 'explosion', attacker: opts.attacker });
    if (opts.wither && e.addEffect) e.addEffect('wither', 200, 1);
    const kb = impact * (1 - (e.knockbackResist || 0));
    if (d > 0.01) { e.vx += ex / d * kb; e.vy += ey / d * kb * 0.8; e.vz += ez / d * kb; }
  }
  game.particles.explosion(x, y, z, power);
  game.audio.play('explode', x, y, z, Math.min(1, power / 4));
  const pd = Math.hypot(game.player.x - x, game.player.y - y, game.player.z - z);
  game.camShake = Math.min(1.5, game.camShake + Math.max(0, power * 0.4 - pd * 0.03));
  game.vibration(x, y, z, 3, null);
}

function rayExposure(w, x, y, z, e) {
  let hit = 0, total = 0;
  const hw = e.w / 2;
  for (const fx of [0, 1]) for (const fy of [0, 0.5, 1]) for (const fz of [0, 1]) {
    const tx = e.x - hw + fx * e.w, ty = e.y + fy * e.h, tz = e.z - hw + fz * e.w;
    total++;
    const dx = tx - x, dy = ty - y, dz = tz - z, d = Math.hypot(dx, dy, dz);
    const steps = Math.ceil(d / 0.4);
    let blocked = false;
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      if (B_SOLID[w.getBlock(Math.floor(x + dx * t), Math.floor(y + dy * t), Math.floor(z + dz * t))]) { blocked = true; break; }
    }
    if (!blocked) hit++;
  }
  return hit / total;
}
