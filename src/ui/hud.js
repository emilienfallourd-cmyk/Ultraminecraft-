// Affichage tête haute : barre d'action, cœurs, faim, armure, oxygène, XP, barres de boss, débogage, notifications
import { itemIcon } from '../gfx/icons.js';
import { BIOMES } from '../world/biomes.js';
import { BLOCKS } from '../blocks/blocks.js';
import { DIM_LABELS, DAY_LENGTH } from '../constants.js';

const $ = (s) => document.querySelector(s);

function pix(rows, pal) {
  const c = document.createElement('canvas'); c.width = 9; c.height = 9;
  const x = c.getContext('2d');
  rows.forEach((r, j) => [...r].forEach((ch, i) => { if (pal[ch]) { x.fillStyle = pal[ch]; x.fillRect(i, j, 1, 1); } }));
  return c.toDataURL();
}
const HEART = ['.XX...XX.', 'XRRX.XRRX', 'XRWRXRRRX', 'XRRRRRRRX', 'XRRRRRRRX', '.XRRRRRX.', '..XRRRX..', '...XRX...', '....X....'];
const HALF = (rows) => rows.map((r) => [...r].map((c, i) => (i > 4 && c !== 'X' && c !== '.' ? 'E' : c)).join(''));
const FOOD = ['.....XX..', '....XBBX.', '...XBBBX.', '..XMMBX..', '.XMMMMX..', 'XMMMMX...', 'XMWMX....', 'XMMX.....', '.XX......'];
const ARMOR = ['.XXX.XXX.', 'XAAAXAAAX', 'XAWAAAAAX', 'XAAAAAAAX', '.XAAAAAX.', '.XAAAAAX.', '.XAAAAAX.', '.XAAAAAX.', '..XXXXX..'];
const BUBBLE = ['..XXXXX..', '.XBBBBBX.', 'XBWWBBBBX', 'XBWBBBBBX', 'XBBBBBBBX', 'XBBBBBBBX', 'XBBBBBBBX', '.XBBBBBX.', '..XXXXX..'];
const ICONS = {};
function makeIcons() {
  const K = '#1a1a1a';
  ICONS.heart = pix(HEART, { X: K, R: '#e51b1b', W: '#ffb3b3' });
  ICONS.half = pix(HALF(HEART), { X: K, R: '#e51b1b', W: '#ffb3b3', E: '#3a0d0d' });
  ICONS.empty = pix(HEART, { X: K, R: '#3a0d0d', W: '#3a0d0d' });
  ICONS.poison = pix(HEART, { X: K, R: '#7a9a1a', W: '#c4e080' });
  ICONS.poisonHalf = pix(HALF(HEART), { X: K, R: '#7a9a1a', W: '#c4e080', E: '#3a0d0d' });
  ICONS.wither = pix(HEART, { X: K, R: '#2a2a2a', W: '#6a6a6a' });
  ICONS.gold = pix(HEART, { X: K, R: '#e8c020', W: '#fff2a0' });
  ICONS.food = pix(FOOD, { X: K, B: '#e8dcc0', M: '#b8692a', W: '#e8a060' });
  ICONS.foodHalf = pix(FOOD.map((r) => [...r].map((c, i) => (i < 4 && c === 'M' ? 'E' : c)).join('')), { X: K, B: '#e8dcc0', M: '#b8692a', W: '#e8a060', E: '#3a2a1a' });
  ICONS.foodEmpty = pix(FOOD, { X: K, B: '#3a2a1a', M: '#3a2a1a', W: '#3a2a1a' });
  ICONS.foodHunger = pix(FOOD, { X: K, B: '#a8c070', M: '#5a7a2a', W: '#8aaa4a' });
  ICONS.armor = pix(ARMOR, { X: K, A: '#d8d8d8', W: '#ffffff' });
  ICONS.armorHalf = pix(ARMOR.map((r) => [...r].map((c, i) => (i > 4 && c !== 'X' && c !== '.' ? 'E' : c)).join('')), { X: K, A: '#d8d8d8', W: '#fff', E: '#3a3a3a' });
  ICONS.armorEmpty = pix(ARMOR, { X: K, A: '#3a3a3a', W: '#3a3a3a' });
  ICONS.bubble = pix(BUBBLE, { X: '#1a3a7a', B: '#5a9aff', W: '#e0f0ff' });
}

export class HUD {
  constructor(ui) {
    this.ui = ui;
    this.dirty = true;
    this.sig = '';
    this.chatMsgs = [];
    this.debugT = 0;
    this.lastHealth = 20;
    makeIcons();
  }
  get game() { return this.ui.game; }
  build() {
    const hb = $('#hotbar');
    hb.innerHTML = '';
    this.slots = [];
    for (let i = 0; i < 9; i++) {
      const d = document.createElement('div');
      d.className = 'slot';
      d.style.pointerEvents = 'auto';
      d.addEventListener('touchstart', (e) => { e.preventDefault(); this.game.player.selected = i; this.ui.onHotbarChange(); }, { passive: false });
      hb.appendChild(d);
      this.slots.push(d);
    }
    this.dirty = true;
  }
  update(dt) {
    const g = this.game;
    if (!g || !g.player || !this.slots) return;
    const p = g.player;
    // barre d'action
    if (this.dirty) {
      this.dirty = false;
      for (let i = 0; i < 9; i++) {
        const s = p.inventory[i];
        const d = this.slots[i];
        d.classList.toggle('sel', i === p.selected);
        const key = s ? s.id + ':' + s.count + ':' + s.damage : '';
        if (d.dataset.k !== key) { d.dataset.k = key; this.ui.paintSlot(d, s); }
      }
    }
    const surv = !p.creative && !p.spectator;
    $('#stats').style.visibility = surv ? 'visible' : 'hidden';
    $('#xpbar').style.visibility = p.spectator ? 'hidden' : 'visible';
    $('#hotbar').style.visibility = p.spectator ? 'hidden' : 'visible';
    // cœurs, nourriture, armure, oxygène
    const sig = [Math.ceil(p.health), p.food, p.armorPoints(), Math.ceil(p.air / 30), p.eyeInWater, p.xpLevel, Math.round(p.xpProgress * 100), !!p.effects.poison, !!p.effects.wither, Math.ceil(p.absorption || 0), !!p.effects.hunger, p.health <= 4].join(',');
    if (sig !== this.sig) {
      this.sig = sig;
      const hearts = $('#hearts');
      let h = '';
      const hp = Math.ceil(p.health);
      const pois = p.effects.poison, wit = p.effects.wither;
      for (let i = 0; i < 10; i++) {
        const v = hp - i * 2;
        let ic = v >= 2 ? (wit ? ICONS.wither : pois ? ICONS.poison : ICONS.heart) : v === 1 ? (pois ? ICONS.poisonHalf : ICONS.half) : ICONS.empty;
        h += `<img src="${ic}" class="${p.health <= 4 ? 'shake' : ''}" style="animation-delay:${i * 0.03}s">`;
      }
      const abs = Math.ceil(p.absorption || 0);
      for (let i = 0; i < Math.ceil(abs / 2); i++) h += `<img src="${ICONS.gold}">`;
      hearts.innerHTML = h;
      let f = '';
      for (let i = 0; i < 10; i++) {
        const v = p.food - i * 2;
        f += `<img src="${p.effects.hunger ? ICONS.foodHunger : v >= 2 ? ICONS.food : v === 1 ? ICONS.foodHalf : ICONS.foodEmpty}">`;
      }
      $('#food').innerHTML = f;
      const ap = p.armorPoints();
      let a = '';
      if (ap > 0) for (let i = 0; i < 10; i++) { const v = ap - i * 2; a += `<img src="${v >= 2 ? ICONS.armor : v === 1 ? ICONS.armorHalf : ICONS.armorEmpty}">`; }
      $('#armor').innerHTML = a;
      let b = '';
      if (p.eyeInWater || p.air < 300) { const n = Math.max(0, Math.ceil(p.air / 30)); for (let i = 0; i < n; i++) b += `<img src="${ICONS.bubble}">`; }
      $('#air').innerHTML = b;
      $('#xpfill').style.width = Math.round(p.xpProgress * 100) + '%';
      $('#xplevel').textContent = p.xpLevel > 0 ? String(p.xpLevel) : '';
    }
    // barres de boss
    const bb = $('#bossbars');
    const bars = [...g.bossBars.values()];
    const bsig = bars.map((b) => b.name + Math.round(b.frac * 200)).join('|');
    if (bsig !== this.bsig) {
      this.bsig = bsig;
      bb.innerHTML = bars.map((b) => `<div class="boss">${b.name}<div class="bar"><div class="fill" style="width:${(b.frac * 100).toFixed(1)}%;background:linear-gradient(${b.color},${b.color}88)"></div></div></div>`).join('');
    }
    // discussion : estompage
    const now = performance.now();
    for (const m of this.chatMsgs) if (!this.chatOpen && now - m.t > 10000) m.el.classList.add('fade');
    // débogage
    this.debugT -= dt;
    if (!$('#debug').classList.contains('hidden') && this.debugT <= 0) { this.debugT = 0.25; this.renderDebug(); }
    // titre
    if (this.titleT !== undefined) { this.titleT -= dt; if (this.titleT <= 0) { $('#title').classList.remove('show'); this.titleT = undefined; } }
    if (this.actionT !== undefined) { this.actionT -= dt; if (this.actionT <= 0) { $('#actionbar').classList.remove('show'); this.actionT = undefined; } }
  }
  gpuName() {
    if (this._gpu) return this._gpu;
    try {
      const gl = this.game.pipeline.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      this._gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).replace(/[<>&]/g, '').replace(/^ANGLE \((.*)\)$/, '$1').slice(0, 70);
    } catch (e) { this._gpu = '?'; }
    return this._gpu;
  }
  renderDebug() {
    const g = this.game, p = g.player, w = g.world, r = g.pipeline.renderer.info;
    const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    const l = w.getLight(bx, by, bz);
    const bio = BIOMES[w.getBiome(bx, bz)];
    const ld = p.lookDir();
    const facing = Math.abs(ld[0]) > Math.abs(ld[2]) ? (ld[0] > 0 ? 'est (+X)' : 'ouest (-X)') : (ld[2] > 0 ? 'sud (+Z)' : 'nord (-Z)');
    const t = g.interact.target;
    const tod = Math.floor(((g.time % DAY_LENGTH) / 1000 + 6) % 24);
    const lines = [
      `UltraMinecraft — ${g.fps} i/s  (${r.render.calls} appels, ${(r.render.triangles / 1000).toFixed(0)}k tri.)`,
      `Dimension : ${DIM_LABELS[g.dim]}`,
      `XYZ : ${p.x.toFixed(3)} / ${p.y.toFixed(3)} / ${p.z.toFixed(3)}`,
      `Bloc : ${bx} ${by} ${bz}   Chunk : ${bx >> 4} ${by >> 4} ${bz >> 4}`,
      `Orientation : ${facing}  (${(p.yaw * 180 / Math.PI).toFixed(1)}° / ${(p.pitch * 180 / Math.PI).toFixed(1)}°)`,
      `Biome : ${bio ? bio.name : '?'}`,
      `Lumière : ${l >> 4} ciel, ${l & 15} bloc`,
      `Heure : ${String(tod).padStart(2, '0')}h  (jour ${Math.floor(g.time / DAY_LENGTH) + 1})   Météo : ${g.weather.rain > 0.5 ? (g.weather.thunder > 0.5 ? 'orage' : 'pluie') : 'clair'}`,
      `Chunks : ${w.chunks.size}  (sales : ${w.dirty.size}, file : ${g.gen.pendingCount})`,
      `Entités : ${g.entities.list.length}   Particules : ${g.particles.p.length}`,
      t ? `Visé : ${BLOCKS[t.id].name} [${BLOCKS[t.id].key}] @ ${t.x} ${t.y} ${t.z}` : '',
      `Mode : ${['Survie', 'Créatif', '', 'Spectateur'][p.gamemode]}`,
      `Carte graphique : ${this.gpuName()}`,
    ];
    $('#debug').innerHTML = lines.filter(Boolean).map((s) => `<span>${s}</span>`).join('\n');
  }
  action(text) {
    const a = $('#actionbar');
    a.textContent = text;
    a.classList.toggle('show', !!text);
    this.actionT = 2.2;
  }
  title(main, sub) {
    $('#titleMain').textContent = main; $('#titleSub').textContent = sub || '';
    $('#title').classList.add('show');
    this.titleT = 4;
  }
  chat(html) {
    const log = $('#chatlog');
    const d = document.createElement('div');
    d.className = 'msg';
    d.innerHTML = html;
    log.appendChild(d);
    this.chatMsgs.push({ el: d, t: performance.now() });
    while (this.chatMsgs.length > 60) { const m = this.chatMsgs.shift(); m.el.remove(); }
  }
  chatVisible(v) {
    this.chatOpen = v;
    for (const m of this.chatMsgs) if (v) m.el.classList.remove('fade'); else if (performance.now() - m.t > 10000) m.el.classList.add('fade');
  }
  toast(msg, ms) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), ms);
    while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
  }
}
export { itemIcon };
