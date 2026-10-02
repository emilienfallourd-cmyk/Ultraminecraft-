// Modèles de blocs à éléments (format proche des modèles JSON de Minecraft)
// faces: 0 E(+X) 1 O(-X) 2 H(+Y) 3 B(-Y) 4 S(+Z) 5 N(-Z) — unités en 1/16 de bloc

export function box(from, to, tex, o = {}) {
  const faces = new Array(6);
  for (let f = 0; f < 6; f++) {
    const t = Array.isArray(tex) ? tex[f] : tex;
    if (t == null || (o.only && !o.only.includes(f))) { faces[f] = null; continue; }
    const onEdge = (f === 0 && to[0] >= 16) || (f === 1 && from[0] <= 0) || (f === 2 && to[1] >= 16) ||
      (f === 3 && from[1] <= 0) || (f === 4 && to[2] >= 16) || (f === 5 && from[2] <= 0);
    faces[f] = { t, uv: o.uv ? (Array.isArray(o.uv[0]) ? o.uv[f] : o.uv) : null, cull: o.noCull ? false : onEdge, tint: !!o.tint };
  }
  return { from, to, faces, rot: o.rot || null, shade: o.shade !== false, emissive: !!o.emissive };
}

// Plan simple (deux faces) pour les plantes, le feu, etc.
function plane(from, to, t, o = {}) {
  // un plan est une boîte plate : on n'émet que les faces dans l'axe plat
  const flat = from[0] === to[0] ? 0 : from[1] === to[1] ? 1 : 2;
  const only = flat === 0 ? [0, 1] : flat === 1 ? [2, 3] : [4, 5];
  return box(from, to, t, { ...o, only, noCull: true });
}

const FACING_ROT = [0, 270, 180, 90]; // facing -> rotation Y (modèle de base orienté +Z / sud)

export function facingRot(meta) { return FACING_ROT[meta & 3]; }

function connects(id, BLK, kind) {
  const b = BLK[id];
  if (!b) return false;
  if (b.opaque) return true;
  if (kind === 'fence') return b.model === 'fence';
  if (kind === 'wall') return b.model === 'wall' || b.model === 'fence';
  if (kind === 'bars') return b.model === 'bars' || b.render === 'translucent' && b.shape === 'cube';
  return false;
}

export const MODELS = {
  farmland(meta, b) {
    const t = b.tex;
    return { els: [box([0, 0, 0], [16, 15, 16], [t[0], t[1], t[2], t[3], t[4], t[5]], { uv: [[0, 1, 16, 16], [0, 1, 16, 16], null, null, [0, 1, 16, 16], [0, 1, 16, 16]] })] };
  },
  snow_layer(meta, b) {
    const h = ((meta & 7) + 1) * 2;
    return { els: [box([0, 0, 0], [16, h, 16], 'snow')] };
  },
  chest(meta) {
    return {
      els: [
        box([1, 0, 1], [15, 14, 15], ['chest_side', 'chest_side', 'chest_top', 'chest_top', 'chest_front', 'chest_side'], { noCull: true }),
        box([7, 7, 15], [9, 11, 16], 'chest_latch', { noCull: true }),
      ],
      rotY: facingRot(meta),
    };
  },
  fence(meta, b, ctx, BLK) {
    const t = b.tex[0];
    const els = [box([6, 0, 6], [10, 16, 10], t)];
    const dirs = [[0, 1, 0], [-1, 0, 1], [0, -1, 2], [1, 0, 3]];
    for (const [dx, dz, i] of dirs) {
      if (!connects(ctx.id(dx, 0, dz), BLK, 'fence')) continue;
      const rot = FACING_ROT[i];
      els.push(box([7, 12, 10], [9, 15, 16], t, { rot: { axis: 'y', angle: rot, origin: [8, 8, 8], snap: true } }));
      els.push(box([7, 6, 10], [9, 9, 16], t, { rot: { axis: 'y', angle: rot, origin: [8, 8, 8], snap: true } }));
    }
    return { els };
  },
  wall(meta, b, ctx, BLK) {
    const t = b.tex[0];
    const els = [box([4, 0, 4], [12, 16, 12], t)];
    const dirs = [[0, 1, 0], [-1, 0, 1], [0, -1, 2], [1, 0, 3]];
    for (const [dx, dz, i] of dirs) {
      if (!connects(ctx.id(dx, 0, dz), BLK, 'wall')) continue;
      els.push(box([5, 0, 12], [11, 14, 16], t, { rot: { axis: 'y', angle: FACING_ROT[i], origin: [8, 8, 8], snap: true } }));
    }
    return { els };
  },
  bars(meta, b, ctx, BLK) {
    const els = [box([7, 0, 7], [9, 16, 9], 'iron_bars', { uv: [7, 0, 9, 16] })];
    const dirs = [[0, 1, 0], [-1, 0, 1], [0, -1, 2], [1, 0, 3]];
    let any = false;
    for (const [dx, dz, i] of dirs) {
      if (!connects(ctx.id(dx, 0, dz), BLK, 'bars')) continue;
      any = true;
      els.push(box([7.5, 0, 9], [8.5, 16, 16], 'iron_bars', { rot: { axis: 'y', angle: FACING_ROT[i], origin: [8, 8, 8], snap: true }, uv: [[9, 0, 16, 16], [9, 0, 16, 16], [7, 9, 9, 16], [7, 9, 9, 16], null, null] }));
    }
    if (!any) {
      els.push(plane([8, 0, 0], [8, 16, 16], 'iron_bars'));
      els.push(plane([0, 0, 8], [16, 16, 8], 'iron_bars'));
    }
    return { els };
  },
  door(meta) {
    const upper = meta & 8, open = meta & 4;
    const t = upper ? 'oak_door_top' : 'oak_door_bottom';
    const el = box([0, 0, 13], [16, 16, 16], [t, t, 'oak_planks', 'oak_planks', t, t], { noCull: true });
    return { els: [el], rotY: (facingRot(meta) + (open ? 90 : 0)) % 360 };
  },
  rail(meta) {
    return { els: [plane([0, 1, 0], [16, 1, 16], 'rail')], rotY: (meta & 1) ? 90 : 0 };
  },
  ladder(meta) {
    return { els: [plane([0, 0, 15.2], [16, 16, 15.2], 'ladder')], rotY: facingRot(meta) };
  },
  stairs(meta, b) {
    const t = b.tex[0];
    const up = meta & 4;
    const els = up
      ? [box([0, 8, 0], [16, 16, 16], t), box([0, 0, 8], [16, 8, 16], t)]
      : [box([0, 0, 0], [16, 8, 16], t), box([0, 8, 8], [16, 16, 16], t)];
    return { els, rotY: facingRot(meta) };
  },
  slab(meta, b) {
    const t = b.tex;
    const m = meta & 3;
    if (m === 2) return { els: [box([0, 0, 0], [16, 16, 16], t)] };
    if (m === 1) return { els: [box([0, 8, 0], [16, 16, 16], t)] };
    return { els: [box([0, 0, 0], [16, 8, 16], t)] };
  },
  torch(meta, b) {
    const t = b.tex[0];
    const uvs = [[7, 6, 9, 16], [7, 6, 9, 16], [7, 6, 9, 8], [7, 14, 9, 16], [7, 6, 9, 16], [7, 6, 9, 16]];
    const m = meta & 7;
    if (m === 0) return { els: [box([7, 0, 7], [9, 10, 9], t, { uv: uvs, noCull: true, emissive: true })] };
    // torche murale : penchée, collée au mur opposé à la direction
    const el = box([-1, 3.5, 7], [1, 13.5, 9], t, { uv: uvs, noCull: true, emissive: true, rot: { axis: 'z', angle: -22.5, origin: [0, 3.5, 8] } });
    const f = (m - 1) & 3; // direction de la torche (opposée au mur)
    return { els: [el], rotY: [270, 180, 90, 0][f] };
  },
  lantern(meta, b) {
    const t = b.tex[0];
    return {
      els: [
        box([5, 0, 5], [11, 7, 11], t, { uv: [[0, 2, 6, 9], [0, 2, 6, 9], [0, 9, 6, 15], [0, 9, 6, 15], [0, 2, 6, 9], [0, 2, 6, 9]], noCull: true, emissive: true }),
        box([6, 7, 6], [10, 9, 10], t, { uv: [[1, 0, 5, 2], [1, 0, 5, 2], [1, 10, 5, 14], [1, 10, 5, 14], [1, 0, 5, 2], [1, 0, 5, 2]], noCull: true }),
        plane([8, 9, 6.5], [8, 11, 9.5], t, { uv: [11, 1, 14, 3] }),
      ],
    };
  },
  bed(meta) {
    const head = meta & 8;
    const top = head ? 'bed_head_top' : 'bed_foot_top';
    const els = [
      box([0, 3, 0], [16, 9, 16], ['bed_side', 'bed_side', top, 'oak_planks', head ? 'bed_end' : 'bed_side', head ? 'bed_side' : 'bed_end'], { noCull: true }),
    ];
    // pieds
    if (head) { els.push(box([0, 0, 13], [3, 3, 16], 'bed_leg')); els.push(box([13, 0, 13], [16, 3, 16], 'bed_leg')); }
    else { els.push(box([0, 0, 0], [3, 3, 3], 'bed_leg')); els.push(box([13, 0, 0], [16, 3, 3], 'bed_leg')); }
    return { els, rotY: facingRot(meta) };
  },
  cactus(meta, b) {
    const t = b.tex;
    return {
      els: [
        box([1, 0, 1], [15, 16, 15], [t[0], t[1], null, null, t[4], t[5]], { noCull: true }),
        box([0, 0, 0], [16, 16, 16], [null, null, t[2], t[3], null, null]),
      ],
    };
  },
  bamboo(meta, b, ctx) {
    const off = Math.floor(ctx.hash * 4) * 2;
    const els = [box([6 + (off % 4), 0, 6 + ((off >> 2) * 2)], [9 + (off % 4), 16, 9 + ((off >> 2) * 2)], 'bamboo_stalk', { uv: [[0, 0, 3, 16], [0, 0, 3, 16], [13, 0, 16, 3], [13, 0, 16, 3], [0, 0, 3, 16], [0, 0, 3, 16]], noCull: true })];
    if (ctx.id(0, 1, 0) !== b.id) {
      els.push(plane([8, 4, 0], [8, 20, 16], 'bamboo_leaves', { tint: false }));
      els.push(plane([0, 4, 8], [16, 20, 8], 'bamboo_leaves', { tint: false }));
    }
    return { els };
  },
  vine(meta) {
    const els = [];
    const m = meta || 4;
    if (m & 1) els.push(plane([0, 0, 15.2], [16, 16, 15.2], 'vine', { tint: true }));
    if (m & 2) els.push(plane([0.8, 0, 0], [0.8, 16, 16], 'vine', { tint: true }));
    if (m & 4) els.push(plane([0, 0, 0.8], [16, 16, 0.8], 'vine', { tint: true }));
    if (m & 8) els.push(plane([15.2, 0, 0], [15.2, 16, 16], 'vine', { tint: true }));
    return { els };
  },
  lily_pad(meta, b, ctx) {
    return { els: [plane([0, 0.25, 0], [16, 0.25, 16], 'lily_pad', { tint: true })], rotY: [0, 90, 180, 270][Math.floor(ctx.hash * 4)] };
  },
  crop(meta, b) {
    const c = b.crop;
    const st = Math.min(meta, c.stages - 1);
    const t = c.tex + st;
    return {
      els: [
        plane([4, -1, 0], [4, 15, 16], t), plane([12, -1, 0], [12, 15, 16], t),
        plane([0, -1, 4], [16, 15, 4], t), plane([0, -1, 12], [16, 15, 12], t),
      ],
    };
  },
  fire(meta, b) {
    const t = b.tex[0];
    return {
      els: [
        plane([8, 0, 0], [8, 22, 16], t, { emissive: true }), plane([0, 0, 8], [16, 22, 8], t, { emissive: true }),
        plane([1.5, 0, 0], [1.5, 22, 16], t, { emissive: true }), plane([14.5, 0, 0], [14.5, 22, 16], t, { emissive: true }),
        plane([0, 0, 1.5], [16, 22, 1.5], t, { emissive: true }), plane([0, 0, 14.5], [16, 22, 14.5], t, { emissive: true }),
      ],
    };
  },
  portal(meta) {
    return { els: [box([0, 0, 6], [16, 16, 10], 'nether_portal', { only: [4, 5], noCull: true, emissive: true })], rotY: (meta & 1) ? 90 : 0 };
  },
  end_portal() {
    return { els: [box([0, 0, 0], [16, 12, 16], 'end_portal', { only: [2], noCull: true, emissive: true })] };
  },
  end_portal_frame(meta, b) {
    const els = [box([0, 0, 0], [16, 13, 16], ['end_portal_frame_side', 'end_portal_frame_side', 'end_portal_frame_top', 'end_stone', 'end_portal_frame_side', 'end_portal_frame_side'])];
    if (meta & 4) els.push(box([4, 13, 4], [12, 16, 12], 'end_portal_frame_eye', { noCull: true, emissive: true }));
    return { els, rotY: facingRot(meta) };
  },
  dragon_egg() {
    return {
      els: [
        box([6, 15, 6], [10, 16, 10], 'dragon_egg', { noCull: true }), box([5, 14, 5], [11, 15, 11], 'dragon_egg', { noCull: true }),
        box([4, 13, 4], [12, 14, 12], 'dragon_egg', { noCull: true }), box([3, 11, 3], [13, 13, 13], 'dragon_egg', { noCull: true }),
        box([2, 8, 2], [14, 11, 14], 'dragon_egg', { noCull: true }), box([1, 3, 1], [15, 8, 15], 'dragon_egg', { noCull: true }),
        box([2, 1, 2], [14, 3, 14], 'dragon_egg', { noCull: true }), box([3, 0, 3], [13, 1, 13], 'dragon_egg', { noCull: true }),
      ],
    };
  },
  end_rod() {
    return {
      els: [
        box([7, 1, 7], [9, 16, 9], 'end_rod', { uv: [[0, 0, 2, 15], [0, 0, 2, 15], [2, 0, 4, 2], [2, 0, 4, 2], [0, 0, 2, 15], [0, 0, 2, 15]], noCull: true, emissive: true }),
        box([6, 0, 6], [10, 1, 10], 'end_rod', { uv: [[2, 6, 6, 7], [2, 6, 6, 7], [2, 2, 6, 6], [2, 2, 6, 6], [2, 6, 6, 7], [2, 6, 6, 7]], noCull: true }),
      ],
    };
  },
  chorus(meta, b, ctx, BLK) {
    const t = 'chorus_plant';
    const els = [box([3, 3, 3], [13, 13, 13], t, { noCull: true })];
    const isC = (id) => BLK[id] && (BLK[id].key === 'chorus_plant' || BLK[id].key === 'chorus_flower');
    if (isC(ctx.id(0, 1, 0))) els.push(box([4, 13, 4], [12, 16, 12], t));
    const below = ctx.id(0, -1, 0);
    if (isC(below) || (BLK[below] && BLK[below].key === 'end_stone')) els.push(box([4, 0, 4], [12, 3, 12], t));
    if (isC(ctx.id(1, 0, 0))) els.push(box([13, 4, 4], [16, 12, 12], t));
    if (isC(ctx.id(-1, 0, 0))) els.push(box([0, 4, 4], [3, 12, 12], t));
    if (isC(ctx.id(0, 0, 1))) els.push(box([4, 4, 13], [12, 12, 16], t));
    if (isC(ctx.id(0, 0, -1))) els.push(box([4, 4, 0], [12, 12, 3], t));
    return { els };
  },
  sculk_sensor() {
    return {
      els: [
        box([0, 0, 0], [16, 8, 16], ['sculk_sensor_side', 'sculk_sensor_side', 'sculk_sensor_top', 'sculk_sensor_bottom', 'sculk_sensor_side', 'sculk_sensor_side']),
        plane([8, 8, 2], [8, 16, 14], 'sculk_sensor_tendril', { emissive: true, rot: { axis: 'y', angle: 45, origin: [8, 8, 8] } }),
        plane([2, 8, 8], [14, 16, 8], 'sculk_sensor_tendril', { emissive: true, rot: { axis: 'y', angle: 45, origin: [8, 8, 8] } }),
      ],
    };
  },
  sculk_shrieker() {
    return {
      els: [
        box([0, 0, 0], [16, 8, 16], ['sculk_shrieker_side', 'sculk_shrieker_side', 'sculk_shrieker_top', 'sculk_shrieker_bottom', 'sculk_shrieker_side', 'sculk_shrieker_side']),
        box([1, 8, 1], [15, 15, 15], ['sculk_shrieker_can', 'sculk_shrieker_can', 'sculk_shrieker_inner', null, 'sculk_shrieker_can', 'sculk_shrieker_can'], { noCull: true }),
      ],
    };
  },
  skull(meta) {
    return { els: [box([4, 0, 4], [12, 8, 12], ['wither_skull_side', 'wither_skull_side', 'wither_skull_top', 'wither_skull_top', 'wither_skull', 'wither_skull_back'], { noCull: true })], rotY: facingRot(meta) };
  },
  cauldron(meta, b) {
    const s = b.tex[0];
    const top = b.key === 'composter' ? 'composter_top' : 'cauldron_top';
    const inner = b.key === 'composter' ? 'composter_bottom' : 'cauldron_inner';
    return {
      els: [
        box([0, 3, 0], [2, 16, 16], [inner, s, top, null, s, s]),
        box([14, 3, 0], [16, 16, 16], [s, inner, top, null, s, s]),
        box([2, 3, 0], [14, 16, 2], [null, null, top, null, inner, s]),
        box([2, 3, 14], [14, 16, 16], [null, null, top, null, s, inner]),
        box([2, 3, 2], [14, 4, 14], [null, null, inner, s, null, null]),
        box([0, 0, 0], [4, 3, 2], s), box([12, 0, 0], [16, 3, 2], s), box([0, 0, 14], [4, 3, 16], s), box([12, 0, 14], [16, 3, 16], s),
        box([0, 0, 2], [2, 3, 4], s), box([14, 0, 2], [16, 3, 4], s), box([0, 0, 12], [2, 3, 14], s), box([14, 0, 12], [16, 3, 14], s),
      ],
    };
  },
  anvil(meta) {
    const t = 'anvil', tt = 'anvil_top';
    return {
      els: [
        box([2, 0, 2], [14, 4, 14], t), box([4, 4, 3], [12, 5, 13], t), box([6, 5, 4], [10, 10, 12], t),
        box([3, 10, 0], [13, 16, 16], [t, t, tt, t, t, t]),
      ],
      rotY: facingRot(meta),
    };
  },
  enchanting_table() {
    return {
      els: [
        box([0, 0, 0], [16, 12, 16], ['enchanting_table_side', 'enchanting_table_side', 'enchanting_table_top', 'enchanting_table_bottom', 'enchanting_table_side', 'enchanting_table_side']),
        box([4, 13, 5], [12, 15, 11], 'enchanting_book', { noCull: true, rot: { axis: 'x', angle: -22.5, origin: [8, 13, 8] } }),
      ],
    };
  },
  bell() {
    return {
      els: [
        box([0, 13, 7], [16, 15, 9], 'dark_oak_planks'),
        box([0, 0, 6], [2, 16, 10], 'stone'), box([14, 0, 6], [16, 16, 10], 'stone'),
        box([5, 6, 5], [11, 13, 11], 'bell_body', { noCull: true }), box([4, 4, 4], [12, 6, 12], 'bell_body', { noCull: true }),
      ],
    };
  },
  campfire() {
    const l = 'campfire_log';
    return {
      els: [
        box([1, 0, 0], [5, 4, 16], l), box([11, 0, 0], [15, 4, 16], l),
        box([0, 3, 11], [16, 7, 15], l), box([0, 3, 1], [16, 7, 5], l),
        box([5, 0, 0], [11, 1, 16], 'campfire_log_lit'),
        plane([8, 1, 0.8], [8, 17, 15.2], 'campfire_fire', { emissive: true, rot: { axis: 'y', angle: 45, origin: [8, 8, 8] } }),
        plane([0.8, 1, 8], [15.2, 17, 8], 'campfire_fire', { emissive: true, rot: { axis: 'y', angle: 45, origin: [8, 8, 8] } }),
      ],
    };
  },
  petals(meta, b, ctx) {
    return { els: [plane([0, 0.6, 0], [16, 0.6, 16], 'pink_petals')], rotY: [0, 90, 180, 270][Math.floor(ctx.hash * 4)] };
  },
};
// modèles dépendant des voisins
MODELS.fence.dynamic = true;
MODELS.wall.dynamic = true;
MODELS.bars.dynamic = true;
MODELS.chorus.dynamic = true;
MODELS.bamboo.dynamic = true;
MODELS.lily_pad.dynamic = true;
MODELS.petals.dynamic = true;

// ------------------------------------------------------------ COLLISIONS
export function rotBox(b, deg) {
  if (!deg) return b;
  const r = (deg * Math.PI) / 180;
  const c = Math.round(Math.cos(r)), s = Math.round(Math.sin(r));
  const rx = (x, z) => 0.5 + (x - 0.5) * c + (z - 0.5) * s;
  const rz = (x, z) => 0.5 - (x - 0.5) * s + (z - 0.5) * c;
  const xs = [rx(b[0], b[2]), rx(b[3], b[5])], zs = [rz(b[0], b[2]), rz(b[3], b[5])];
  return [Math.min(xs[0], xs[1]), b[1], Math.min(zs[0], zs[1]), Math.max(xs[0], xs[1]), b[4], Math.max(zs[0], zs[1])];
}

const fenceConn = (world, x, y, z, kind) => {
  if (!world) return [false, false, false, false];
  const B = world.blockDefs;
  return [[0, 1], [-1, 0], [0, -1], [1, 0]].map(([dx, dz]) => connects(world.getBlock(x + dx, y, z + dz), B, kind));
};

export const BOXES = {
  full: () => [[0, 0, 0, 1, 1, 1]],
  half: () => [[0, 0, 0, 1, 0.5, 1]],
  farmland: () => [[0, 0, 0, 1, 15 / 16, 1]],
  snow_layer: (m) => { const h = (m & 7) * 2 / 16; return h > 0 ? [[0, 0, 0, 1, h, 1]] : null; },
  soul_sand: () => [[0, 0, 0, 1, 14 / 16, 1]],
  chest: () => [[1 / 16, 0, 1 / 16, 15 / 16, 14 / 16, 15 / 16]],
  cactus: () => [[1 / 16, 0, 1 / 16, 15 / 16, 15 / 16, 15 / 16]],
  slab: (m) => (m & 3) === 2 ? [[0, 0, 0, 1, 1, 1]] : (m & 3) === 1 ? [[0, 0.5, 0, 1, 1, 1]] : [[0, 0, 0, 1, 0.5, 1]],
  stairs: (m) => {
    const r = FACING_ROT[m & 3];
    return (m & 4)
      ? [[0, 0.5, 0, 1, 1, 1], rotBox([0, 0, 0.5, 1, 0.5, 1], r)]
      : [[0, 0, 0, 1, 0.5, 1], rotBox([0, 0.5, 0.5, 1, 1, 1], r)];
  },
  door: (m) => {
    if (m & 16) return null;
    return [rotBox([0, 0, 13 / 16, 1, 1, 1], (FACING_ROT[m & 3] + ((m & 4) ? 90 : 0)) % 360)];
  },
  ladder: (m) => [rotBox([0, 0, 13 / 16, 1, 1, 1], FACING_ROT[m & 3])],
  bed: () => [[0, 0, 0, 1, 9 / 16, 1]],
  fence: (m, world, x, y, z) => {
    const c = fenceConn(world, x, y, z, 'fence');
    const out = [[0.375, 0, 0.375, 0.625, 1.5, 0.625]];
    c.forEach((on, i) => { if (on) out.push(rotBox([0.375, 0, 0.625, 0.625, 1.5, 1], FACING_ROT[i])); });
    return out;
  },
  bars: (m, world, x, y, z) => {
    const c = fenceConn(world, x, y, z, 'bars');
    const out = [[7 / 16, 0, 7 / 16, 9 / 16, 1, 9 / 16]];
    c.forEach((on, i) => { if (on) out.push(rotBox([7 / 16, 0, 9 / 16, 9 / 16, 1, 1], FACING_ROT[i])); });
    if (out.length === 1) out.push([0, 0, 7 / 16, 1, 1, 9 / 16], [7 / 16, 0, 0, 9 / 16, 1, 1]);
    return out;
  },
  lantern: () => [[5 / 16, 0, 5 / 16, 11 / 16, 9 / 16, 11 / 16]],
  bamboo: () => [[6 / 16, 0, 6 / 16, 10 / 16, 1, 10 / 16]],
  lily_pad: () => [[0, 0, 0, 1, 1.5 / 16, 1]],
  rail: () => [[0, 0, 0, 1, 2 / 16, 1]],
  end_portal_frame: () => [[0, 0, 0, 1, 13 / 16, 1]],
  dragon_egg: () => [[1 / 16, 0, 1 / 16, 15 / 16, 1, 15 / 16]],
  end_rod: () => [[6 / 16, 0, 6 / 16, 10 / 16, 1, 10 / 16]],
  chorus: () => [[3 / 16, 0, 3 / 16, 13 / 16, 1, 13 / 16]],
  skull: () => [[4 / 16, 0, 4 / 16, 12 / 16, 0.5, 12 / 16]],
  anvil: () => [[0, 0, 0, 1, 1, 1]],
  enchanting_table: () => [[0, 0, 0, 1, 0.75, 1]],
  bell: () => [[0, 0, 0.35, 1, 1, 0.65]],
  campfire: () => [[0, 0, 0, 1, 7 / 16, 1]],
};
