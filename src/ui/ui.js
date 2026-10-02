// Interface : ATH, inventaires (artisanat, fourneau, coffre, créatif), menus, discussion et commandes
import { ITEMS, ITEM, ItemStack, maxStack, ALL_ITEM_IDS } from '../items/items.js';
import { matchRecipe, craftableRecipes, SMELT, fuelValue } from '../items/recipes.js';
import { itemIcon } from '../gfx/icons.js';
import { BLOCKS } from '../blocks/blocks.js';
import { BIOMES } from '../world/biomes.js';
import { HUD } from './hud.js';
import { Menus } from './menus.js';
import { runCommand } from './commands.js';
import { playerPreview, hintIcon } from './preview.js';

const $ = (s) => document.querySelector(s);
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; };

const CATS = [
  ['build', 'Construction'], ['deco', 'Décoration'], ['nature', 'Nature'], ['func', 'Fonctionnel'], ['redstone', 'Mécanismes'],
  ['tools', 'Outils'], ['combat', 'Combat'], ['food', 'Nourriture'], ['materials', 'Matériaux'], ['eggs', 'Œufs'], ['search', 'Recherche'],
];

export class UI {
  constructor(app) {
    this.app = app;
    this.game = null;
    this.biomes = BIOMES;
    this.screen = null;
    this.cursor = null;
    this.hud = new HUD(this);
    this.menus = new Menus(this);
    this.chatOpen = false;
    this.chatHistory = [];
    this.histIdx = -1;
    this.mouse = [0, 0];
    this.creativeTab = 'build';
    this.creativeSearch = '';
    this.showRecipes = false;
    addEventListener('mousemove', (e) => { this.mouse = [e.clientX, e.clientY]; this.moveFloating(); if (this.screen && this.screen.type === 'inventory') playerPreview().look(e.clientX, e.clientY); });
    addEventListener('touchmove', (e) => { if (e.touches[0]) { this.mouse = [e.touches[0].clientX, e.touches[0].clientY]; this.moveFloating(); } }, { passive: true });
    const ci = $('#chatInput');
    ci.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { const v = ci.value.trim(); this.closeChat(); if (v) this.submitChat(v); }
      else if (e.key === 'Escape') this.closeChat();
      else if (e.key === 'ArrowUp') { if (this.chatHistory.length) { this.histIdx = Math.max(0, (this.histIdx < 0 ? this.chatHistory.length : this.histIdx) - 1); ci.value = this.chatHistory[this.histIdx]; } e.preventDefault(); }
      else if (e.key === 'ArrowDown') { if (this.histIdx >= 0) { this.histIdx = Math.min(this.chatHistory.length - 1, this.histIdx + 1); ci.value = this.chatHistory[this.histIdx]; } }
      else if (e.key === 'Tab') { e.preventDefault(); this.autocomplete(ci); }
    });
    $('#screen').addEventListener('mousedown', (e) => { if (e.target.id === 'screen') this.clickOutside(e.button); });
    $('#screen').addEventListener('contextmenu', (e) => e.preventDefault());
  }

  attach(game) {
    this.game = game;
    const inp = game.input;
    inp.onKey = (code, e) => this.onKey(code, e);
    inp.pad.onConnect = (on, id) => {
      const name = (id || '').replace(/\(.*?\)/g, '').trim().slice(0, 40) || 'Manette';
      if (on) this.toast('🎮 <b>' + name + '</b> connectée. Stick gauche : bouger, stick droit : regarder, RT : casser, LT : poser, Y : inventaire. Mode graphique conseillé : <b>Manette / TV</b> (Options).', 7000);
      else this.toast('🎮 Manette déconnectée.');
    };
    inp.onLockChange = (locked, failed) => {
      if (failed) { if (!game.input.padActive) this.toast('Verrouillage de la souris indisponible : maintenez le clic molette ou utilisez le glisser pour regarder.'); return; }
      if (!locked && game.running && !this.screen && !this.chatOpen && !this.menus.open && !this.ignoreUnlock && !game.input.touch && !game.player.dead) this.menus.pause();
      this.ignoreUnlock = false;
    };
  }

  // -------------------------------------------------------------- ÉTAT
  isScreenOpen() { return !!this.screen || this.chatOpen || this.menus.open; }
  setUiOpen() { if (this.game) this.game.input.uiOpen = this.isScreenOpen(); }
  onWorldStarted() {
    $('#hud').classList.remove('hidden');
    this.menus.close();
    this.hud.build();
    this.refresh();
    if (this.game.input.touch) $('#touch').classList.add('active');
    else if (!this.game.input.padActive) this.game.input.requestLock();
    if (this.game.input.touch) this.toast('Bienvenue ! Posez le pouce à gauche pour marcher, glissez à droite pour regarder, touchez pour poser, appui long pour miner. 🎒 : inventaire.', 6000);
    else if (this.game.input.padActive) this.toast('Bienvenue ! <b>Y</b> : inventaire, <b>RT</b> : miner, <b>LT</b> : poser, <b>Menu</b> : pause.');
    else this.toast('Bienvenue ! Appuyez sur <b>E</b> pour l\'inventaire, <b>T</b> pour la discussion, <b>/help</b> pour les commandes.');
  }
  leaveWorld() {
    $('#hud').classList.add('hidden');
    $('#touch').classList.remove('active');
    this.closeScreen();
  }
  refresh() { this.hud.dirty = true; if (this.screen) this.renderScreen(); }
  onHotbarChange() {
    this.hud.dirty = true;
    const h = this.game.player.held;
    this.hud.action(h ? h.def.name : '');
    this.game.audio.play('click');
  }
  update(dt) { this.hud.update(dt); if (this.screen && this.screen.type === 'furnace') this.updateFurnaceBars(); }
  menuFrame(dt) { this.menus.frame(dt); }
  toast(msg, ms = 4500) { this.hud.toast(msg, ms); }
  showTitle(a, b) { this.hud.title(a, b); }
  showLoading(text, prog) {
    const L = $('#loading');
    L.classList.remove('hidden');
    L.querySelector('.ltext').textContent = text;
    if (prog !== undefined) L.querySelector('.lfill').style.width = Math.round(prog * 100) + '%';
    if (!L.dataset.tip) {
      const tips = ['Astuce : les zombies brûlent au soleil.', 'Astuce : le sable et le gravier tombent !', 'Astuce : un lit définit votre point de réapparition.', 'Astuce : l\'obsidienne s\'obtient avec de l\'eau sur une source de lave.', 'Astuce : accroupissez-vous pour ne pas tomber des bords.', 'Astuce : lancez un œil de l\'Ender pour trouver le fort.', 'Astuce : ne réveillez pas le Warden…', 'Astuce : appuyez sur F5 pour la vue à la troisième personne.'];
      L.querySelector('.ltip').textContent = tips[Math.floor(Math.random() * tips.length)];
      L.dataset.tip = '1';
    }
  }
  hideLoading() { const L = $('#loading'); L.classList.add('hidden'); L.dataset.tip = ''; }
  showDeath(src, score) { this.closeScreen(); this.menus.death(src, score); }
  showCredits() { this.showTitle('Félicitations !', 'Vous avez terminé UltraMinecraft'); }

  // ------------------------------------------------------------ CLAVIER
  onKey(code, e) {
    const g = this.game;
    if (!g || !g.running) { if (code === 'Escape') this.menus.back(); return; }
    if (this.chatOpen) return;
    if (code === 'Escape') {
      if (this.screen) { this.closeScreen(); return; }
      if (this.menus.open) { this.menus.back(); return; }
      if (!g.player.dead) this.menus.pause();
      return;
    }
    if (this.menus.open) return;
    if (code === 'KeyE') { if (this.screen) this.closeScreen(); else if (!g.player.dead) this.openInventory(); return; }
    if (this.screen) {
      if (/^Digit[1-9]$/.test(code) && this.hoverRef) this.swapHotbar(this.hoverRef, +code.slice(5) - 1);
      if (code === 'KeyQ' && this.hoverRef) this.dropFromSlot(this.hoverRef, e && e.ctrlKey);
      return;
    }
    if (code === 'KeyT' || code === 'Enter') { e && e.preventDefault(); this.openChat(''); return; }
    if (code === 'Slash') { e && e.preventDefault(); this.openChat('/'); return; }
    if (code === 'F1') { g.settings.showHud = !(g.settings.showHud !== false); $('#hud').style.opacity = g.settings.showHud === false ? 0 : 1; return; }
    if (code === 'F3') { $('#debug').classList.toggle('hidden'); return; }
    if (code === 'F2') { this.screenshot(); return; }
  }
  screenshot() {
    try {
      const g = this.game;
      g.pipeline.renderer.domElement.toBlob((b) => {
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'ultraminecraft-' + Date.now() + '.png'; a.click();
      });
      this.toast('Capture d\'écran enregistrée');
    } catch (e) { this.toast('Capture impossible'); }
  }

  // ------------------------------------------------------------ DISCUSSION
  openChat(prefix) {
    this.chatOpen = true; this.setUiOpen();
    this.ignoreUnlock = true;
    this.game.input.exitLock();
    const c = $('#chat'); c.classList.remove('hidden');
    const ci = $('#chatInput'); ci.value = prefix; this.histIdx = -1;
    setTimeout(() => ci.focus(), 0);
    this.hud.chatVisible(true);
  }
  closeChat() {
    this.chatOpen = false; this.setUiOpen();
    $('#chat').classList.add('hidden');
    $('#chatInput').blur();
    this.hud.chatVisible(false);
    if (!this.game.input.touch) this.game.input.requestLock();
  }
  submitChat(v) {
    this.chatHistory.push(v);
    if (v.startsWith('/')) {
      const out = runCommand(this.game, v.slice(1));
      if (out) this.chat(out);
    } else this.chat('<span style="color:#fff">&lt;Joueur&gt;</span> ' + escapeHtml(v));
  }
  chat(msg) { this.hud.chat(msg); }
  autocomplete(ci) {
    const v = ci.value;
    const m = v.match(/^\/(give|summon)\s+(\S*)$/);
    if (m) {
      const list = m[1] === 'give' ? Object.keys(ITEM) : Object.keys(this.game.mobDefs || {});
      const c = list.filter((k) => k.startsWith(m[2]));
      if (c.length === 1) ci.value = '/' + m[1] + ' ' + c[0] + ' ';
      else if (c.length) this.chat(c.slice(0, 30).join(', '));
    }
  }

  // ========================================================= ÉCRANS
  openInventory() {
    const p = this.game.player;
    if (p.creative) this.openScreen({ type: 'creative' });
    else this.openScreen({ type: 'inventory', grid: p.craft, size: 2 });
  }
  openCrafting() { this.openScreen({ type: 'crafting', grid: new Array(9).fill(null), size: 3 }); }
  openChest(be, x, y, z, name) {
    be.items = (be.items || new Array(27).fill(null)).map((s) => ItemStack.from(s));
    while (be.items.length < 27) be.items.push(null);
    this.openScreen({ type: 'chest', be, pos: [x, y, z], name: name || 'Coffre' });
  }
  openFurnace(be, x, y, z) {
    for (const k of ['input', 'fuel', 'output']) be[k] = ItemStack.from(be[k]);
    this.openScreen({ type: 'furnace', be, pos: [x, y, z] });
  }
  openScreen(s) {
    this.screen = s;
    this.setUiOpen();
    this.ignoreUnlock = true;
    this.game.input.exitLock();
    $('#screen').classList.remove('hidden');
    this.renderScreen();
  }
  closeScreen() {
    const s = this.screen;
    if (!s) return;
    const p = this.game.player;
    // rendre les objets de la grille et du curseur
    if (s.grid) for (let i = 0; i < s.grid.length; i++) if (s.grid[i]) { this.giveBack(s.grid[i]); s.grid[i] = null; }
    if (this.cursor) { this.giveBack(this.cursor); this.cursor = null; }
    if (s.type === 'chest' || s.type === 'furnace') {
      this.game.world.setBlockEntity(s.pos[0], s.pos[1], s.pos[2], s.be);
      if (s.type === 'chest') this.game.audio.play('chest_open', s.pos[0], s.pos[1], s.pos[2]);
    }
    this.screen = null;
    $('#screen').classList.add('hidden');
    $('#tooltip').classList.add('hidden');
    this.renderCursor();
    this.setUiOpen();
    this.hud.dirty = true;
    if (!this.game.input.touch && !this.menus.open) this.game.input.requestLock();
    void p;
  }
  giveBack(stack) {
    const p = this.game.player;
    const left = p.addItem(stack);
    if (left > 0) this.game.dropItem(new ItemStack(stack.id, left, stack.damage), p.x, p.y + 1.2, p.z, p.lookDir());
  }
  clickOutside(button) {
    if (!this.cursor) return;
    const p = this.game.player;
    const n = button === 2 ? 1 : this.cursor.count;
    this.game.dropItem(new ItemStack(this.cursor.id, n, this.cursor.damage), p.x, p.y + 1.3, p.z, p.lookDir());
    this.cursor.count -= n;
    if (this.cursor.count <= 0) this.cursor = null;
    this.renderScreen();
  }

  // références d'emplacements
  invRef(i) { const p = this.game.player; return { get: () => p.inventory[i], set: (v) => { p.inventory[i] = v; }, inv: i }; }
  armorRef(i) {
    const p = this.game.player;
    return { get: () => p.armor[i], set: (v) => { p.armor[i] = v; }, accept: (s) => !!(s.def.armor && s.def.armor.slot === i) || (i === 0 && s.id === ITEM.carved_pumpkin), armor: i };
  }
  arrRef(arr, i, accept) { return { get: () => arr[i], set: (v) => { arr[i] = v; }, accept }; }
  objRef(o, k, accept) { return { get: () => o[k], set: (v) => { o[k] = v; }, accept }; }

  slotEl(ref, opts = {}) {
    const d = el('div', 'slot' + (opts.cls ? ' ' + opts.cls : ''));
    if (opts.hint) { d.dataset.hint = opts.hint; }
    this.paintSlot(d, ref.get(), opts.hint);
    d.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); this.clickSlot(ref, e.button, e.shiftKey); });
    let lp = null;
    d.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); lp = setTimeout(() => { lp = 'long'; this.clickSlot(ref, 2, false); }, 380); }, { passive: false });
    d.addEventListener('touchend', (e) => { e.preventDefault(); if (lp !== 'long') { clearTimeout(lp); this.clickSlot(ref, 0, false); } lp = null; }, { passive: false });
    d.addEventListener('mouseenter', () => { this.hoverRef = ref; this.showTooltip(ref.get()); });
    d.addEventListener('mouseleave', () => { this.hoverRef = null; $('#tooltip').classList.add('hidden'); });
    return d;
  }
  paintSlot(d, s, hint) {
    d.innerHTML = '';
    d.classList.toggle('armor-empty', !s && !!hint);
    if (!s) { const h = hint && hintIcon(hint); if (h) { const im = el('img', 'hint'); im.src = h; im.draggable = false; d.appendChild(im); } return; }
    const img = el('img'); img.src = itemIcon(s.id); img.draggable = false; d.appendChild(img);
    if (s.count > 1) d.appendChild(el('div', 'cnt', String(s.count)));
    const dur = s.def.durability;
    if (dur && s.damage > 0) {
      const f = 1 - s.damage / dur;
      const bar = el('div', 'dur'); const fill = el('div');
      fill.style.width = Math.round(f * 100) + '%';
      fill.style.background = `hsl(${Math.round(f * 120)}, 100%, 45%)`;
      bar.appendChild(fill); d.appendChild(bar);
    }
  }
  showTooltip(s) {
    const t = $('#tooltip');
    if (!s) { t.classList.add('hidden'); return; }
    let html = escapeHtml(s.def.name);
    if (s.def.durability) html += `<div class="sub">Durabilité : ${s.def.durability - s.damage} / ${s.def.durability}</div>`;
    if (s.def.food) html += `<div class="sub">Nourriture : +${s.def.food.hunger}</div>`;
    if (s.def.armor && s.def.armor.points) html += `<div class="sub">+${s.def.armor.points} armure</div>`;
    if (s.def.damage) html += `<div class="sub">${s.def.damage} dégâts d'attaque</div>`;
    if (this.game.settings.advancedTooltips) html += `<div class="sub">${s.def.key} (#${s.id})</div>`;
    t.innerHTML = html;
    t.classList.remove('hidden');
    this.moveFloating();
  }
  moveFloating() {
    const [x, y] = this.mouse;
    const c = $('#cursorItem');
    c.style.left = x + 'px'; c.style.top = y + 'px';
    const t = $('#tooltip');
    t.style.left = (x + 16) + 'px'; t.style.top = (y - 28) + 'px';
  }
  renderCursor() { this.paintSlot($('#cursorItem'), this.cursor); $('#cursorItem').style.display = this.cursor ? 'block' : 'none'; }

  clickSlot(ref, button, shift) {
    const g = this.game;
    const cur = this.cursor;
    const s = ref.get();
    if (ref.creativeSource) { // grille créative
      if (cur) { this.cursor = null; }
      else if (shift) { const st = new ItemStack(ref.id, maxStack(ref.id)); g.player.addItem(st); }
      else this.cursor = new ItemStack(ref.id, button === 2 ? 1 : maxStack(ref.id));
      this.afterClick(); return;
    }
    if (ref.trash) { if (shift) { g.player.inventory.fill(null); } this.cursor = null; this.afterClick(); return; }
    if (ref.result) {
      if (!s) return;
      if (shift) {
        let n = 0;
        while (ref.get() && n < 64) {
          const r = ref.get();
          if (g.player.addItem(r.clone()) > 0) break;
          ref.take(); n++;
        }
      } else if (!cur) { this.cursor = s.clone(); ref.take(); }
      else if (cur.canStack(s) && cur.count + s.count <= maxStack(s.id)) { cur.count += s.count; ref.take(); }
      g.audio.play('click');
      this.afterClick(); return;
    }
    if (shift && s) { this.quickMove(ref); this.afterClick(); return; }
    const accept = (x) => !ref.accept || ref.accept(x);
    if (button === 0) {
      if (!cur) { if (s) { this.cursor = s; ref.set(null); } }
      else if (!s) { if (accept(cur)) { ref.set(cur); this.cursor = null; } }
      else if (s.canStack(cur)) { const n = Math.min(maxStack(s.id) - s.count, cur.count); s.count += n; cur.count -= n; if (cur.count <= 0) this.cursor = null; }
      else if (accept(cur)) { ref.set(cur); this.cursor = s; }
    } else if (button === 2) {
      if (!cur) { if (s) { const h = Math.ceil(s.count / 2); this.cursor = new ItemStack(s.id, h, s.damage); s.count -= h; if (s.count <= 0) ref.set(null); } }
      else if (!s) { if (accept(cur)) { ref.set(new ItemStack(cur.id, 1, cur.damage)); cur.count--; if (cur.count <= 0) this.cursor = null; } }
      else if (s.canStack(cur) && s.count < maxStack(s.id)) { s.count++; cur.count--; if (cur.count <= 0) this.cursor = null; }
    }
    this.afterClick();
  }
  afterClick() {
    const s = this.screen;
    if (s && s.type === 'furnace') this.game.activeFurnaces.add(s.pos.join(','));
    this.renderScreen();
    this.hud.dirty = true;
  }
  quickMove(ref) {
    const p = this.game.player, s = ref.get(), scr = this.screen;
    if (!s) return;
    let targets = [];
    if (ref.inv !== undefined) {
      if (scr.type === 'chest') targets = scr.be.items.map((_, i) => this.arrRef(scr.be.items, i));
      else if (scr.type === 'furnace') targets = [SMELT.has(s.id) ? this.objRef(scr.be, 'input') : null, fuelValue(s.id) ? this.objRef(scr.be, 'fuel') : null].filter(Boolean);
      else if (s.def.armor && !p.armor[s.def.armor.slot] && scr.type === 'inventory') targets = [this.armorRef(s.def.armor.slot)];
      if (!targets.length) {
        const range = ref.inv < 9 ? [9, 36] : [0, 9];
        for (let i = range[0]; i < range[1]; i++) targets.push(this.invRef(i));
      }
    } else {
      for (let i = 0; i < 36; i++) targets.push(this.invRef(i < 9 ? i + 27 >= 36 ? i : i : i));
      targets = [...[...Array(27)].map((_, i) => this.invRef(9 + i)), ...[...Array(9)].map((_, i) => this.invRef(i))];
    }
    // fusion d'abord
    for (const t of targets) { const ts = t.get(); if (ts && ts.canStack(s) && ts.count < maxStack(s.id)) { const n = Math.min(maxStack(s.id) - ts.count, s.count); ts.count += n; s.count -= n; if (s.count <= 0) { ref.set(null); return; } } }
    for (const t of targets) { if (!t.get() && (!t.accept || t.accept(s))) { t.set(s); ref.set(null); return; } }
  }
  swapHotbar(ref, i) {
    if (ref.result || ref.creativeSource) { if (ref.creativeSource) { this.game.player.inventory[i] = new ItemStack(ref.id, maxStack(ref.id)); this.renderScreen(); } return; }
    const p = this.game.player;
    const a = ref.get(), b = p.inventory[i];
    ref.set(b); p.inventory[i] = a;
    this.renderScreen(); this.hud.dirty = true;
  }
  dropFromSlot(ref, all) {
    const s = ref.get();
    if (!s || ref.creativeSource || ref.result) return;
    const p = this.game.player;
    const n = all ? s.count : 1;
    this.game.dropItem(new ItemStack(s.id, n, s.damage), p.x, p.y + 1.3, p.z, p.lookDir());
    s.count -= n; if (s.count <= 0) ref.set(null);
    this.renderScreen();
  }

  // --------------------------------------------------- RENDU DES ÉCRANS
  renderScreen() {
    const s = this.screen;
    if (!s) return;
    const P = $('#screenPanel');
    const scrollKeep = P.querySelector('.creative-grid') ? P.querySelector('.creative-grid').scrollTop : 0;
    P.innerHTML = '';
    if (s.type === 'inventory' || s.type === 'crafting') this.renderCraftScreen(P, s);
    else if (s.type === 'chest') this.renderChest(P, s);
    else if (s.type === 'furnace') this.renderFurnace(P, s);
    else if (s.type === 'creative') this.renderCreative(P, s);
    const cg = P.querySelector('.creative-grid'); if (cg) cg.scrollTop = scrollKeep;
    this.renderCursor();
  }
  playerInv(P) {
    const sec = el('div', 'inv-section');
    sec.appendChild(el('h3', '', 'Inventaire'));
    const g = el('div', 'grid'); g.style.gridTemplateColumns = 'repeat(9, auto)';
    for (let i = 9; i < 36; i++) g.appendChild(this.slotEl(this.invRef(i)));
    sec.appendChild(g);
    const h = el('div', 'grid'); h.style.gridTemplateColumns = 'repeat(9, auto)'; h.style.marginTop = '8px';
    for (let i = 0; i < 9; i++) h.appendChild(this.slotEl(this.invRef(i)));
    sec.appendChild(h);
    P.appendChild(sec);
  }
  resultRef(s) {
    const size = s.size;
    const grid = s.grid.map((x) => (x ? x.id : 0));
    const r = matchRecipe(grid, size);
    const out = r ? new ItemStack(r.out, r.n) : null;
    return {
      result: true,
      get: () => out,
      set: () => {},
      take: () => {
        for (let i = 0; i < s.grid.length; i++) {
          const it = s.grid[i];
          if (!it) continue;
          const rem = it.def.key === 'milk_bucket' || it.def.key === 'water_bucket' || it.def.key === 'lava_bucket' ? new ItemStack(ITEM.bucket, 1) : null;
          it.count--;
          if (it.count <= 0) s.grid[i] = rem;
        }
        this.game.onCraft && this.game.onCraft(r);
      },
    };
  }
  renderCraftScreen(P, s) {
    const p = this.game.player;
    const top = el('div', 'flexrow');
    if (s.type === 'inventory') {
      // armure + aperçu
      const arm = el('div', 'grid');
      ['helmet', 'chest', 'legs', 'boots'].forEach((h, i) => arm.appendChild(this.slotEl(this.armorRef(i), { hint: h })));
      top.appendChild(arm);
      const prev = el('div', 'player-preview');
      top.appendChild(prev);
      top.appendChild(this.slotEl(this.objRef(p, 'offhand'), { hint: 'shield' }));
      requestAnimationFrame(() => { if (!playerPreview().attach(prev)) prev.innerHTML = `<div style="text-align:center;color:#ddd;font-size:18px">❤ ${Math.ceil(p.health)}/${p.maxHealth}<br>niv. ${p.xpLevel}</div>`; });
    }
    const craft = el('div');
    craft.appendChild(el('h3', '', s.type === 'crafting' ? 'Artisanat' : 'Artisanat'));
    const row = el('div', 'flexrow');
    const g = el('div', 'grid'); g.style.gridTemplateColumns = `repeat(${s.size}, auto)`;
    for (let i = 0; i < s.size * s.size; i++) g.appendChild(this.slotEl(this.arrRef(s.grid, i)));
    row.appendChild(g);
    row.appendChild(el('div', 'arrow'));
    row.appendChild(this.slotEl(this.resultRef(s), { cls: 'result' }));
    craft.appendChild(row);
    const rb = el('button', 'btn', this.showRecipes ? 'Masquer les recettes' : `<img src="${itemIcon(ITEM.book)}" class="btn-ico" alt="">Recettes`);
    rb.style.cssText = 'font-size:18px;min-height:30px;margin-top:6px;max-width:220px';
    rb.onclick = () => { this.showRecipes = !this.showRecipes; this.renderScreen(); };
    craft.appendChild(rb);
    top.appendChild(craft);
    const wrap = el('div', 'flexrow'); wrap.style.alignItems = 'flex-start';
    const main = el('div');
    main.appendChild(top);
    this.playerInv(main);
    wrap.appendChild(main);
    if (this.showRecipes) wrap.appendChild(this.recipeBook(s));
    P.appendChild(wrap);
  }
  recipeBook(s) {
    const p = this.game.player;
    const box = el('div');
    box.appendChild(el('h3', '', 'Livre de recettes'));
    const counts = new Map();
    for (const it of [...p.inventory, ...s.grid]) if (it) counts.set(it.id, (counts.get(it.id) || 0) + it.count);
    const list = craftableRecipes(counts, s.size);
    const seen = new Set();
    const grid = el('div', 'recipes');
    for (const r of list) {
      if (seen.has(r.out)) continue;
      seen.add(r.out);
      const d = el('div', 'slot');
      this.paintSlot(d, new ItemStack(r.out, r.n));
      d.title = ITEMS[r.out].name;
      d.addEventListener('mouseenter', () => this.showTooltip(new ItemStack(r.out, r.n)));
      d.addEventListener('mouseleave', () => $('#tooltip').classList.add('hidden'));
      d.addEventListener('click', () => this.fillRecipe(s, r));
      grid.appendChild(d);
    }
    if (!list.length) box.appendChild(el('div', '', '<span style="font-size:18px">Aucune recette réalisable<br>avec vos objets.</span>'));
    box.appendChild(grid);
    return box;
  }
  fillRecipe(s, r) {
    const p = this.game.player;
    for (let i = 0; i < s.grid.length; i++) if (s.grid[i]) { p.addItem(s.grid[i]); s.grid[i] = null; }
    const take = (set) => {
      for (let i = 0; i < 36; i++) { const it = p.inventory[i]; if (it && set.has(it.id)) { it.count--; const one = new ItemStack(it.id, 1, it.damage); if (it.count <= 0) p.inventory[i] = null; return one; } }
      return null;
    };
    if (r.type === 'shaped') {
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const c = r.grid[y][x]; if (c !== ' ') s.grid[y * s.size + x] = take(r.keys[c]); }
    } else r.ings.forEach((set, i) => { s.grid[i] = take(set); });
    this.renderScreen(); this.hud.dirty = true;
  }
  renderChest(P, s) {
    P.appendChild(el('h3', '', escapeHtml(s.name)));
    const g = el('div', 'grid'); g.style.gridTemplateColumns = 'repeat(9, auto)';
    for (let i = 0; i < 27; i++) g.appendChild(this.slotEl(this.arrRef(s.be.items, i)));
    P.appendChild(g);
    this.playerInv(P);
  }
  renderFurnace(P, s) {
    const be = s.be;
    P.appendChild(el('h3', '', 'Fourneau'));
    const row = el('div', 'flexrow'); row.style.justifyContent = 'center';
    const col = el('div'); col.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:4px';
    col.appendChild(this.slotEl(this.objRef(be, 'input', (x) => SMELT.has(x.id))));
    const fl = el('div', 'flame', '🔥'); const fi = el('div', 'fl', '🔥'); fl.appendChild(fi); col.appendChild(fl);
    col.appendChild(this.slotEl(this.objRef(be, 'fuel', (x) => fuelValue(x.id) > 0)));
    row.appendChild(col);
    const ar = el('div', 'arrow'); const pr = el('div', 'prog'); ar.appendChild(pr); row.appendChild(ar);
    const out = this.objRef(be, 'output', () => false);
    const outRef = { result: true, get: () => be.output, set: (v) => { be.output = v; }, take: () => { const n = be.output.count; be.output = null; if (be.xp) { this.game.spawnXP(this.game.player.x, this.game.player.y + 1, this.game.player.z, Math.floor(be.xp)); be.xp = 0; } void n; } };
    void out;
    row.appendChild(this.slotEl(outRef, { cls: 'result' }));
    P.appendChild(row);
    this.furnaceEls = { fi, pr };
    this.updateFurnaceBars();
    this.playerInv(P);
  }
  updateFurnaceBars() {
    const s = this.screen, e = this.furnaceEls;
    if (!s || !e) return;
    const be = s.be;
    e.fi.style.height = (be.burnMax ? Math.round(be.burn / be.burnMax * 100) : 0) + '%';
    e.pr.style.width = Math.round((be.cook || 0) / 200 * 44) + 'px';
  }
  onFurnaceUpdate(be) {
    if (this.screen && this.screen.be === be && this.screen.type === 'furnace') {
      if (this.game.tickCount % 10 === 0) this.renderScreen(); else this.updateFurnaceBars();
    }
  }
  renderCreative(P, s) {
    const tabs = el('div', 'tabs');
    for (const [k, n] of CATS) {
      const t = el('div', 'tab' + (this.creativeTab === k ? ' on' : ''), n);
      t.onclick = () => { this.creativeTab = k; this.renderScreen(); };
      tabs.appendChild(t);
    }
    const inv = el('div', 'tab' + (this.creativeTab === 'inv' ? ' on' : ''), '🎒 Survie');
    inv.onclick = () => { this.creativeTab = 'inv'; this.renderScreen(); };
    tabs.appendChild(inv);
    P.appendChild(tabs);
    if (this.creativeTab === 'inv') {
      const p = this.game.player;
      const fake = { type: 'inventory', grid: p.craft, size: 2 };
      const box = el('div');
      this.renderCraftScreenInto(box, fake);
      P.appendChild(box);
      return;
    }
    if (this.creativeTab === 'search') {
      const inp = el('input', 'search'); inp.placeholder = 'Rechercher…'; inp.value = this.creativeSearch;
      inp.addEventListener('input', () => { this.creativeSearch = inp.value; this.renderCreativeGrid(P.querySelector('.creative-grid')); });
      inp.addEventListener('keydown', (e) => e.stopPropagation());
      P.appendChild(inp);
      setTimeout(() => inp.focus(), 0);
    }
    const grid = el('div', 'creative-grid');
    P.appendChild(grid);
    this.renderCreativeGrid(grid);
    const bottom = el('div', 'flexrow'); bottom.style.marginTop = '8px';
    const hb = el('div', 'grid'); hb.style.gridTemplateColumns = 'repeat(9, auto)';
    for (let i = 0; i < 9; i++) hb.appendChild(this.slotEl(this.invRef(i)));
    bottom.appendChild(hb);
    bottom.appendChild(this.slotEl({ trash: true, get: () => null, set: () => {} }, { cls: 'trash', hint: 'trash' }));
    P.appendChild(bottom);
  }
  renderCraftScreenInto(box, s) { this.renderCraftScreen(box, s); }
  renderCreativeGrid(grid) {
    grid.innerHTML = '';
    const q = this.creativeSearch.toLowerCase();
    for (const id of ALL_ITEM_IDS()) {
      const d = ITEMS[id];
      if (this.creativeTab === 'search') { if (q && !d.name.toLowerCase().includes(q) && !d.key.includes(q)) continue; }
      else if (d.cat !== this.creativeTab) continue;
      const ref = { creativeSource: true, id, get: () => new ItemStack(id, 1), set: () => {} };
      grid.appendChild(this.slotEl(ref));
    }
  }
}

export function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
export { el, $, BLOCKS };
