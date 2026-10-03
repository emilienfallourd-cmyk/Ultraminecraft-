// Cités de l'End, reconstruites comme dans Minecraft : assemblage récursif de pièces
// (maison de base, étages, toit, tours à escalier en colimaçon, couronnes de tour, ponts plats /
// en pente douce / en escalier raide, grosses tours à trésor) et le vaisseau de l'End
// (élytres dans un cadre, tête de dragon à la proue, coffres, alambic, shulkers).
import { RNG } from '../../util/noise.js';
import { BLOCK as K, BLOCKS } from '../../blocks/blocks.js';

const P = K.purpur_block, PP = K.purpur_pillar, SL = K.purpur_slab, ST = K.purpur_stairs, EB = K.end_stone_bricks;
const G = K.magenta_stained_glass, ROD = K.end_rod, BAN = K.end_banner;
const MAX_DEPTH = 8, MAX_PIECES = 90;

// rotation des coordonnées locales (r : 0 sud, 1 ouest, 2 nord, 3 est)
function rotXZ(x, z, r) { switch (r & 3) { case 1: return [-z, x]; case 2: return [-x, -z]; case 3: return [z, -x]; default: return [x, z]; } }
const DIR_MODELS = new Set(['door', 'ladder', 'stairs', 'bed', 'chest', 'skull', 'item_frame', 'banner', 'dragon_head']);
function rotMeta(id, m, r) {
  r &= 3;
  if (!r) return m;
  const b = BLOCKS[id];
  if (!b) return m;
  if (b.axis) { const a = m & 3; return (r & 1) && (a === 1 || a === 2) ? (m & ~3) | (3 - a) : m; }
  if (b.model === 'end_rod') { const k = m & 7; return k >= 2 ? (m & ~7) | (2 + (((k - 2) + r) & 3)) : m; }
  if (b.facing || DIR_MODELS.has(b.model)) return (m & ~3) | (((m & 3) + r) & 3);
  return m;
}

// étendue locale de chaque pièce [x0, x1, y0, y1, z0, z1]
const EXT = {
  hb: [-5, 5, -1, 3, -6, 5], hu: [-7, 7, -1, 4, -7, 7], hr: [-6, 6, 0, 2, -6, 6],
  tp: [-3, 3, 0, 3, -3, 3], tt: [-4, 4, -1, 8, -4, 4],
  bf: [-2, 2, -1, 2, 0, 3], bs: [-2, 2, -1, 6, 0, 3], bg: [-2, 2, -1, 4, 0, 3], be: [-2, 2, -1, 2, 0, 0],
  fb: [-6, 6, 0, 4, -6, 6], fm: [-6, 6, 0, 7, -6, 6], ft: [-7, 7, -1, 10, -7, 7],
  ship: [-5, 5, -6, 14, -14, 15],
};
function pieceBB(p) {
  const e = EXT[p.t];
  const a = rotXZ(e[0], e[4], p.r), b = rotXZ(e[1], e[5], p.r);
  return [p.x + Math.min(a[0], b[0]), p.y + e[2], p.z + Math.min(a[1], b[1]), p.x + Math.max(a[0], b[0]), p.y + e[3], p.z + Math.max(a[1], b[1])];
}
const hit = (a, b) => a[0] < b[3] && a[3] > b[0] && a[1] < b[4] && a[4] > b[1] && a[2] < b[5] && a[5] > b[2];

// ------------------------------------------------------------ PLAN DE LA CITÉ
export function endCityLayout(x, y, z, seed) {
  let best = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const L = layoutOnce(x, y, z, seed + attempt * 7919);
    if (!best || (L.ship && !best.ship) || (L.ship === best.ship && L.pieces.length > best.pieces.length)) best = L;
    if (L.ship && L.pieces.length > 20) break;
  }
  const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const p of best.pieces) for (let i = 0; i < 3; i++) { bb[i] = Math.min(bb[i], p.bb[i]); bb[i + 3] = Math.max(bb[i + 3], p.bb[i + 3]); }
  return { pieces: best.pieces, ship: best.ship, bb };
}

function layoutOnce(x, y, z, seed) {
  const rng = new RNG(seed);
  const pieces = [];
  const st = { ship: false };
  const fits = (p, parent) => {
    if (pieces.length >= MAX_PIECES || p.bb[4] > 124 || p.bb[1] < 4) return false;
    const s = [p.bb[0] + 1, p.bb[1] + 1, p.bb[2] + 1, p.bb[3] - 1, p.bb[4] - 1, p.bb[5] - 1];
    for (const q of pieces) if (q !== parent && hit(q.bb, s)) return false;
    return true;
  };
  const make = (t, px, py, pz, r, extra) => { const p = { t, x: px, y: py, z: pz, r: r & 3, s: rng.int(1e9), ...extra }; p.bb = pieceBB(p); return p; };
  const fwd = (o, r, dz, dy = 0, dx = 0) => { const [a, b] = rotXZ(dx, dz, r); return [o[0] + a, o[1] + dy, o[2] + b]; };

  // maison + tour (la maison de départ, puis celles au bout des ponts)
  const houseTower = (o, r, depth, parent, base = false) => {
    const hb = make('hb', o[0], o[1], o[2], r, { found: base });
    if (!fits(hb, parent)) return false;
    pieces.push(hb);
    let yy = o[1] + 4;
    const floors = base ? 1 + rng.int(2) : rng.int(2);
    let last = hb;
    for (let i = 0; i < floors; i++) {
      const hu = make('hu', o[0], yy, o[2], r, { holeX: last.t === 'hb' ? 4 : -4 });
      if (!fits(hu, last)) break;
      pieces.push(hu); last = hu; yy += 5;
    }
    const hr = make('hr', o[0], yy, o[2], r, { holeX: last.t === 'hb' ? 4 : -4 });
    if (fits(hr, last)) { pieces.push(hr); last = hr; } else return true;
    tower([o[0], yy + 1, o[2]], r, depth + 1, last);
    return true;
  };

  // tour étroite : 3 à 6 tronçons, des ponts partent de certains tronçons, couronne au sommet
  const tower = (o, r, depth, parent) => {
    const n = 3 + rng.int(4);
    let last = parent;
    const used = new Set();
    const bridges = [];
    for (let i = 0; i < n; i++) {
      const tp = make('tp', o[0], o[1] + i * 4, o[2], r, { i, door: i === 0 ? 2 : null });
      if (!fits(tp, last)) return;
      pieces.push(tp); last = tp;
      if (i >= 1 && depth < MAX_DEPTH && bridges.length < 2 && rng.chance(0.5)) {
        let side = rng.int(4);
        for (let k = 0; k < 4 && used.has(side); k++) side = (side + 1) & 3;
        if (!used.has(side)) { used.add(side); tp.door = side; bridges.push([tp, side]); }
      }
    }
    const tt = make('tt', o[0], o[1] + n * 4, o[2], r);
    if (fits(tt, last)) pieces.push(tt);
    // côté local 0 = +z, 1 = -x, 2 = -z, 3 = +x  ->  direction du pont r + côté
    for (const [tp, side] of bridges) { const dirR = (r + side) & 3; bridge(fwd([tp.x, tp.y, tp.z], dirR, 4), dirR, depth + 1, tp); }
  };

  // pont : 1 à 3 tronçons (plat, pente douce, escalier raide), puis une destination
  const bridge = (o, r, depth, parent) => {
    let cur = o, last = parent;
    const segs = 1 + rng.int(3);
    for (let i = 0; i < segs; i++) {
      const v = rng.next();
      const t = cur[1] > 96 ? 'bf' : v < 0.3 ? 'bs' : v < 0.55 ? 'bg' : 'bf';
      const p = make(t, cur[0], cur[1], cur[2], r);
      if (!fits(p, last)) return;
      pieces.push(p); last = p;
      cur = fwd(cur, r, 4, t === 'bs' ? 4 : t === 'bg' ? 2 : 0);
    }
    const end = make('be', cur[0], cur[1], cur[2], r);
    if (!fits(end, last)) return;
    pieces.push(end);
    const next = fwd(cur, r, 1);
    const roll = rng.next();
    if (!st.ship && depth >= 2 && roll < 0.7) {
      const ship = make('ship', ...fwd(cur, r, 5), r + 1);
      if (fits(ship, end)) { pieces.push(ship); st.ship = true; return; }
    }
    if (depth >= MAX_DEPTH) return;
    if (roll < 0.55 || roll >= 0.85) houseTower(fwd(next, r, 5), r, depth, end);
    else fatTower(fwd(next, r, 6), r, depth, end);
  };

  // grosse tour : base, 1 à 2 étages, sommet à trésor ; un pont peut repartir du sommet
  const fatTower = (o, r, depth, parent) => {
    const fb = make('fb', o[0], o[1], o[2], r);
    if (!fits(fb, parent)) return;
    pieces.push(fb);
    let yy = o[1] + 5, last = fb;
    const n = 1 + rng.int(2);
    for (let i = 0; i < n; i++) {
      const fm = make('fm', o[0], yy, o[2], r, { below: last.t });
      if (!fits(fm, last)) return;
      pieces.push(fm); last = fm; yy += 8;
    }
    const ft = make('ft', o[0], yy, o[2], r, { below: last.t });
    if (!fits(ft, last)) return;
    pieces.push(ft);
    if (depth < MAX_DEPTH && rng.chance(0.6)) {
      const side = 1 + rng.int(3);
      const dirR = (r + side) & 3;
      ft.door = side;
      bridge(fwd([ft.x, ft.y, ft.z], dirR, 8), dirR, depth + 1, ft);
    }
  };

  houseTower([x, y, z], rng.int(4), 0, null, true);
  return { pieces, ship: st.ship };
}

// ------------------------------------------------------------ CONSTRUCTION
export function drawEndCityPiece(S, p) {
  const rng = new RNG(p.s);
  const r = p.r;
  const put = (lx, ly, lz, id, m = 0) => { const [a, b] = rotXZ(lx, lz, r); S.set(p.x + a, p.y + ly, p.z + b, id, rotMeta(id, m, r)); };
  const at = (lx, ly, lz) => { const [a, b] = rotXZ(lx, lz, r); return [p.x + a, p.y + ly, p.z + b]; };
  const mob = (lx, ly, lz) => { const [x, y, z] = at(lx, ly, lz); S.mob(x, y, z, 'shulker'); };
  const chest = (lx, ly, lz, facing) => { const [x, y, z] = at(lx, ly, lz); S.chest(x, y, z, 'end_city', rng, rotMeta(K.chest, facing, r)); };
  const fill = (x0, y0, z0, x1, y1, z1, id, m = 0) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) put(x, y, z, id, m); };
  // anneau de marches renversées sous un débord (corniche), marches tournées vers l'intérieur
  const corbel = (h, ly) => {
    for (let k = -h + 1; k <= h - 1; k++) {
      put(k, ly, h, ST, 2 | 4); put(k, ly, -h, ST, 0 | 4); put(h, ly, k, ST, 1 | 4); put(-h, ly, k, ST, 3 | 4);
    }
  };
  // marches de toit tournées vers l'intérieur sur un anneau
  const roofRing = (h, ly) => {
    for (let k = -h + 1; k <= h - 1; k++) { put(k, ly, h, ST, 2); put(k, ly, -h, ST, 0); put(h, ly, k, ST, 1); put(-h, ly, k, ST, 3); }
    for (const [a, b] of [[h, h], [h, -h], [-h, h], [-h, -h]]) put(a, ly, b, P);
  };

  switch (p.t) {
    // ---------------------------------------------- maison : rez-de-chaussée
    case 'hb': {
      for (let lx = -5; lx <= 5; lx++) for (let lz = -5; lz <= 5; lz++) {
        put(lx, 0, lz, Math.max(Math.abs(lx), Math.abs(lz)) >= 5 ? P : EB);
        if (p.found) { const [x, , z] = at(lx, 0, lz); S.foundation(x, p.y - 1, z, K.end_stone); }
        const ex = Math.abs(lx) === 5, ez = Math.abs(lz) === 5;
        for (let ly = 1; ly <= 3; ly++) {
          if (ex && ez) put(lx, ly, lz, PP);
          else if (ex || ez) {
            const along = ex ? lz : lx;
            const door = lz === -5 && lx === 0 && ly <= 2;
            const win = ly === 2 && Math.abs(along) === 2 && !(lz === -5);
            put(lx, ly, lz, door ? 0 : win ? G : P);
          } else put(lx, ly, lz, 0);
        }
      }
      // escalier vers l'étage
      put(4, 1, -2, ST, 0); put(4, 2, -1, ST, 0); put(4, 3, 0, ST, 0);
      put(4, 0, -2, EB);
      // barres de l'End au plafond, bannières de part et d'autre de la porte
      for (const [a, b] of [[-3, -3], [-3, 3], [3, 3]]) put(a, 3, b, ROD, 1);
      put(-2, 3, -6, BAN, 2); put(2, 3, -6, BAN, 2);
      put(0, 3, -5, P);
      if (rng.chance(0.6)) mob(-3, 1, 2);
      break;
    }
    // ---------------------------------------------- maison : étage plus large
    case 'hu': {
      for (let lx = -6; lx <= 6; lx++) for (let lz = -6; lz <= 6; lz++) {
        const hole = lx === p.holeX && lz === (p.holeX === 4 ? 0 : 2);
        put(lx, 0, lz, hole ? 0 : Math.max(Math.abs(lx), Math.abs(lz)) >= 6 ? P : EB);
        const ex = Math.abs(lx) === 6, ez = Math.abs(lz) === 6;
        for (let ly = 1; ly <= 4; ly++) {
          if (ex && ez) put(lx, ly, lz, PP);
          else if (ex || ez) {
            const along = ex ? lz : lx;
            const win = (ly === 2 || ly === 3) && Math.abs(along) <= 1;
            put(lx, ly, lz, win ? G : (ly === 4 && Math.abs(along) % 3 === 0) ? PP : P);
          } else put(lx, ly, lz, 0);
        }
      }
      corbel(6, -1);
      put(p.holeX, 0, p.holeX === 4 ? 1 : 3, ST, 0);
      // escalier vers le toit
      put(-4, 1, -1, ST, 0); put(-4, 2, 0, ST, 0); put(-4, 3, 1, ST, 0); put(-4, 4, 2, ST, 0);
      for (const [a, b] of [[-4, -4], [4, 4], [4, -4]]) put(a, 4, b, ROD, 1);
      for (const [a, b, f] of [[-3, 7, 0], [3, 7, 0], [7, -3, 3], [-7, 3, 1]]) { const [x, z] = rotXZ(a, b, 0); put(x, 3, z, BAN, f); }
      if (rng.chance(0.45)) chest(3, 1, -5, 0);
      if (rng.chance(0.6)) mob(2, 1, 4);
      break;
    }
    // ---------------------------------------------- toit plat à rebord
    case 'hr': {
      for (let lx = -6; lx <= 6; lx++) for (let lz = -6; lz <= 6; lz++) {
        const hole = lx === p.holeX && lz === (p.holeX === 4 ? 0 : 2);
        put(lx, 0, lz, hole ? 0 : P);
        const ex = Math.abs(lx) === 6, ez = Math.abs(lz) === 6;
        if (ex && ez) { put(lx, 1, lz, PP); put(lx, 2, lz, ROD, 0); } else if (ex || ez) put(lx, 1, lz, SL, 0);
      }
      put(p.holeX, 0, p.holeX === 4 ? 1 : 3, ST, 0);
      break;
    }
    // ---------------------------------------------- tronçon de tour (colimaçon)
    case 'tp': {
      for (let lx = -3; lx <= 3; lx++) for (let lz = -3; lz <= 3; lz++) {
        const ex = Math.abs(lx) === 3, ez = Math.abs(lz) === 3;
        for (let ly = 0; ly <= 3; ly++) {
          if (ex && ez) put(lx, ly, lz, PP);
          else if (ex || ez) {
            const along = ex ? lz : lx;
            const side = lz === 3 ? 0 : lx === -3 ? 1 : lz === -3 ? 2 : 3;
            const door = p.door === side && along === 0 && (ly === 1 || ly === 2);
            const win = !door && (ly === 1 || ly === 2) && along === 0 && ((side + p.i) & 1) === 0;
            put(lx, ly, lz, door ? 0 : win ? G : P);
          } else put(lx, ly, lz, p.i === 0 && ly === 0 ? P : 0);
        }
      }
      // escalier en colimaçon : un côté par tronçon
      const q = (4 - (p.i & 3)) & 3;
      for (let t = 0; t < 4; t++) {
        const [a, b] = rotXZ(-2 + t, 2, q);
        put(a, t, b, ST, rotMeta(ST, 3, q));
      }
      { const [a, b] = rotXZ(2, 2, q); put(a, 3, b, SL, 1); }
      if (p.door != null) { const [a, b] = rotXZ(0, 2, p.door); put(a, 0, b, SL, 1); }
      if (rng.chance(0.25)) mob(-2, 1, -2);
      break;
    }
    // ---------------------------------------------- couronne de tour
    case 'tt': {
      for (let lx = -4; lx <= 4; lx++) for (let lz = -4; lz <= 4; lz++) {
        put(lx, 0, lz, P);
        const ex = Math.abs(lx) === 4, ez = Math.abs(lz) === 4;
        if (ex && ez) { for (let ly = 1; ly <= 3; ly++) put(lx, ly, lz, PP); }
        else if (ex || ez) put(lx, 1, lz, SL, 0);
        for (let ly = 2; ly <= 3; ly++) if (!(ex && ez)) put(lx, ly, lz, 0);
        put(lx, 4, lz, P);
      }
      put(2, 0, 2, 0);
      corbel(4, -1);
      roofRing(3, 5); fill(-2, 5, -2, 2, 5, 2, P);
      roofRing(2, 6); fill(-1, 6, -1, 1, 6, 1, P);
      put(0, 7, 0, SL, 0); put(0, 8, 0, ROD, 0);
      for (const [a, b] of [[4, 4], [4, -4], [-4, 4], [-4, -4]]) put(a, 5, b, ROD, 0);
      for (const [a, b] of [[2, -2], [-2, 2], [-2, -2]]) put(a, 3, b, ROD, 1);
      if (rng.chance(0.7)) mob(-2, 1, 0);
      if (rng.chance(0.5)) mob(0, 6 + 1, -3);
      break;
    }
    // ---------------------------------------------- ponts
    case 'bf': case 'bs': case 'bg': case 'be': {
      const len = p.t === 'be' ? 1 : 4;
      for (let t = 0; t < len; t++) {
        let ly = 0, step = false;
        if (p.t === 'bs') { ly = t; step = true; }
        else if (p.t === 'bg') { ly = t >> 1; step = (t & 1) === 1; }
        for (let lx = -1; lx <= 1; lx++) {
          put(lx, ly, t, P);
          if (step) put(lx, ly + 1, t, ST, 0);
          else { put(lx, ly + 1, t, 0); put(lx, ly + 2, t, 0); }
        }
        const top = ly + (step ? 1 : 0);
        for (const s of [-2, 2]) {
          put(s, ly, t, P);
          if (step) put(s, ly + 1, t, P);
          const post = p.t === 'be' || t === 0;
          if (post) { put(s, top + 1, t, PP); put(s, top + 2, t, ROD, 0); } else put(s, top + 1, t, SL, 0);
        }
        put(0, ly - 1, t, PP, 2);
        if (t === 2 && p.t !== 'be') put(0, ly - 2, t, ROD, 1);
      }
      break;
    }
    // ---------------------------------------------- grosse tour : base
    case 'fb': case 'fm': {
      const H = p.t === 'fb' ? 4 : 7;
      for (let lx = -6; lx <= 6; lx++) for (let lz = -6; lz <= 6; lz++) {
        const hole = p.t === 'fm' && lx === 4 && lz === (p.below === 'fb' ? -1 : 2);
        put(lx, 0, lz, hole ? 0 : Math.max(Math.abs(lx), Math.abs(lz)) >= 6 ? P : EB);
        const ex = Math.abs(lx) === 6, ez = Math.abs(lz) === 6;
        for (let ly = 1; ly <= H; ly++) {
          if (ex && ez) put(lx, ly, lz, PP);
          else if (ex || ez) {
            const along = ex ? lz : lx;
            const door = p.t === 'fb' && lz === -6 && Math.abs(lx) <= 1 && ly <= 3;
            const win = p.t === 'fm' && ly >= 3 && ly <= 5 && Math.abs(along) >= 2 && Math.abs(along) <= 4;
            put(lx, ly, lz, door ? 0 : win ? G : along === 0 ? PP : P);
          } else put(lx, ly, lz, 0);
        }
      }
      // escalier droit le long du mur est (et marche d'arrivée depuis l'étage du dessous)
      for (let k = 0; k < H; k++) put(4, 1 + k, -4 + k, ST, 0);
      if (p.t === 'fm') put(4, 0, p.below === 'fb' ? 0 : 3, ST, 0);
      if (p.t === 'fb') { put(-2, 4, -7, BAN, 2); put(2, 4, -7, BAN, 2); }
      for (const [a, b] of [[-4, -4], [-4, 4], [4, 4]]) put(a, H, b, ROD, 1);
      if (rng.chance(0.7)) mob(-4, 1, 0);
      break;
    }
    // ---------------------------------------------- grosse tour : sommet à trésor
    case 'ft': {
      for (let lx = -7; lx <= 7; lx++) for (let lz = -7; lz <= 7; lz++) {
        const hole = lx === 4 && lz === (p.below === 'fb' ? -1 : 2);
        const m = Math.max(Math.abs(lx), Math.abs(lz));
        put(lx, 0, lz, hole ? 0 : m >= 6 ? P : EB);
        if (m === 7) { put(lx, 1, lz, SL, 0); continue; }
        const ex = Math.abs(lx) === 6, ez = Math.abs(lz) === 6;
        for (let ly = 1; ly <= 4; ly++) {
          if (ex && ez) put(lx, ly, lz, PP);
          else if (ex || ez) {
            const along = ex ? lz : lx;
            const side = lz === 6 ? 0 : lx === -6 ? 1 : lz === -6 ? 2 : 3;
            const door = p.door === side && along === 0 && ly <= 2;
            const win = !door && ly >= 2 && ly <= 3 && Math.abs(along) >= 2 && Math.abs(along) <= 3;
            put(lx, ly, lz, door ? 0 : win ? G : P);
          } else put(lx, ly, lz, 0);
        }
        if (m <= 6) put(lx, 5, lz, P);
      }
      corbel(7, -1);
      put(4, 0, p.below === 'fb' ? 0 : 3, ST, 0);
      roofRing(5, 6); fill(-4, 6, -4, 4, 6, 4, P);
      roofRing(4, 7); fill(-3, 7, -3, 3, 7, 3, P);
      roofRing(3, 8); fill(-2, 8, -2, 2, 8, 2, P);
      put(0, 9, 0, PP); put(0, 10, 0, ROD, 0);
      for (const [a, b] of [[6, 6], [6, -6], [-6, 6], [-6, -6]]) put(a, 6, b, ROD, 0);
      for (const [a, b] of [[-3, -3], [3, -3], [-3, 3]]) put(a, 4, b, ROD, 1);
      // deux coffres au trésor
      chest(-4, 1, -4, 0); chest(4, 1, -4, 0);
      mob(0, 1, 3); if (rng.chance(0.6)) mob(-4, 1, 3);
      break;
    }
    // ---------------------------------------------- vaisseau de l'End
    case 'ship': drawShip(put, mob, chest, rng); break;
  }
}

function shipWidth(z) {
  if (z <= -12) return 3;
  if (z <= 7) return 4;
  return [4, 3, 3, 2, 2, 1, 1, 0][z - 7] ?? 0;
}
function drawShip(put, mob, chest, rng) {
  // coque en V, pont au niveau 0, cale vide dessous
  for (let z = -13; z <= 14; z++) {
    const w = shipWidth(z);
    const d = z <= 9 ? 4 : Math.max(1, 4 - (z - 9));
    for (let k = 0; k <= d; k++) {
      const hw = Math.max(0, w - Math.floor(k * 0.75));
      const ly = -k;
      for (let lx = -hw; lx <= hw; lx++) {
        if (k === 0) { put(lx, 0, z, P); continue; }
        const shell = Math.abs(lx) === hw || k === d;
        if (shell) put(lx, ly, z, k === 2 && Math.abs(lx) === hw && z % 3 === 0 && z > -11 && z < 8 ? G : P);
        else put(lx, ly, z, 0);
      }
    }
    if (z >= -11 && z <= 9) put(0, -d - 1, z, PP, 2);
    // bastingage
    if (w > 0) {
      for (const s of [-w, w]) {
        const post = z % 4 === 0;
        put(s, 1, z, post ? PP : SL, 0);
        if (post) put(s, 2, z, ROD, 0);
      }
    }
  }
  // proue : tête de dragon fixée à l'avant
  put(0, 1, 14, SL, 0);
  put(0, 0, 15, K.dragon_head, 4 | 0);
  // château arrière (cabine) avec les élytres
  for (let z = -13; z <= -7; z++) for (let lx = -3; lx <= 3; lx++) {
    const wall = Math.abs(lx) === 3 || z === -13 || z === -7;
    for (let ly = 1; ly <= 4; ly++) {
      if (!wall) { put(lx, ly, z, 0); continue; }
      const corner = Math.abs(lx) === 3 && (z === -13 || z === -7);
      const door = z === -7 && lx === 0 && ly <= 2;
      const win = (ly === 2 || ly === 3) && ((Math.abs(lx) === 3 && (z === -11 || z === -9)) || (z === -13 && Math.abs(lx) === 2));
      put(lx, ly, z, door ? 0 : corner ? PP : win ? G : P);
    }
    put(lx, 5, z, Math.abs(lx) === 3 || z === -13 || z === -7 ? SL : P, 0);
  }
  put(0, 2, -12, K.elytra_frame, 0);
  put(0, 4, -12, ROD, 1);
  chest(-2, 1, -12, 0); chest(2, 1, -12, 0);
  put(-2, 1, -8, K.brewing_stand);
  put(2, 1, -8, ROD, 0);
  // mât avec vergue et bannières en guise de voiles
  for (let ly = 1; ly <= 12; ly++) put(0, ly, 2, PP, 0);
  put(0, 13, 2, ROD, 0);
  for (let lx = -3; lx <= 3; lx++) for (const ly of [9, 10]) if (lx !== 0) put(lx, ly, 2, P);
  for (const lx of [-2, 2]) { put(lx, 9, 3, BAN, 0); put(lx, 9, 1, BAN, 2); }
  for (const lx of [-3, 3]) put(lx, 11, 2, ROD, 0);
  // shulkers de garde
  mob(-2, 1, 5); mob(2, 1, -2); mob(0, 6, -10);
  if (rng.chance(0.5)) mob(0, -2, 0);
}
