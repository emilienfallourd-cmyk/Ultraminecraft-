// Commandes tactiles façon Minecraft (édition Bedrock) :
// - pad de déplacement à gauche (il se recentre sous le pouce ; poussé à fond vers l'avant = courir)
// - pad caméra à droite (glisser = tourner, maintenir au bord = tourner en continu) ; glisser ailleurs tourne aussi
// - toucher l'écran = poser / utiliser, appui long = casser / attaquer, au doigt ou au viseur central (réglage)
// - seulement trois boutons : sauter, s'accroupir, pause ; l'inventaire est au bout de la barre d'objets
const HOLD_MS = 300;    // délai de l'appui long (comme Bedrock)
const TAP_MOVE = 14;    // déplacement maximal d'un toucher (px)
const LOOK_GAIN = 2.2;  // pixels tactiles -> pixels souris

export class TouchControls {
  constructor(input, root, { handlers = {}, settings = {}, game = null } = {}) {
    this.inp = input; this.root = root; this.h = handlers; this.s = settings; this.game = game;
    const q = (s) => root.querySelector(s);
    this.box = q('#touch');
    this.mv = { id: null, el: q('#tMove'), knob: q('#tMove .tknob'), cx: 0, cy: 0 };
    this.lk = { id: null, el: q('#tLook'), knob: q('#tLook .tknob'), cx: 0, cy: 0, x: 0, y: 0, ex: 0, ey: 0 };
    this.ring = q('#tHold');
    this.world = new Map();
    this.sneakOn = false;
    root.addEventListener('touchstart', (e) => this.start(e), { passive: false });
    addEventListener('touchmove', (e) => this.moveT(e), { passive: false });
    addEventListener('touchend', (e) => this.end(e));
    addEventListener('touchcancel', (e) => this.end(e));
    this.button('#tJump', () => {
      const i = this.inp, now = performance.now();
      i.virtual.add('Space'); i.pressed.add('Space');
      if (now - i.lastSpace < 300) i.doubleSpace = true;
      i.lastSpace = now;
    }, () => this.inp.virtual.delete('Space'));
    this.button('#tSneak', (el) => {
      const p = this.game && this.game.player;
      if (p && (p.flying || p.inWater)) { this.inp.virtual.add('ShiftLeft'); el.dataset.hold = '1'; return; }
      this.sneakOn = !this.sneakOn;
      el.classList.toggle('on', this.sneakOn);
      if (this.sneakOn) this.inp.virtual.add('ShiftLeft'); else this.inp.virtual.delete('ShiftLeft');
    }, (el) => { if (el.dataset.hold) { delete el.dataset.hold; if (!this.sneakOn) this.inp.virtual.delete('ShiftLeft'); } });
    this.button('#tPause', () => this.h.Escape && this.h.Escape());
  }

  get fingerAim() { return this.s.touchAim !== 'cross'; }
  scale() { return parseFloat(this.box.style.getPropertyValue('--ts')) || 1; }

  button(sel, down, up) {
    const el = this.root.querySelector(sel);
    if (!el) return;
    el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); el.classList.add('down'); down(el); }, { passive: false });
    const rel = (e) => { e.preventDefault(); el.classList.remove('down'); if (up) up(el); };
    el.addEventListener('touchend', rel, { passive: false });
    el.addEventListener('touchcancel', rel, { passive: false });
  }

  // le toucher appartient-il à l'interface (barre d'objets, menus, inventaire…) ?
  isUi(t) { return !!(t && t.closest && t.closest('#hotbar, #tMore, .tbtn, #screen, #menu, #chat, #toasts')); }

  start(e) {
    if (this.inp.uiOpen) return;
    for (const t of e.changedTouches) {
      const target = t.target;
      if (this.isUi(target)) continue;
      const inMove = target.closest && target.closest('#tMove');
      const inLook = target.closest && target.closest('#tLook');
      if (this.mv.id === null && (inMove || (t.clientX < innerWidth * 0.36 && t.clientY > innerHeight * 0.4 && !inLook))) { this.startMove(t, !inMove); continue; }
      if (inLook && this.lk.id === null) { this.startLook(t); continue; }
      this.startWorld(t);
    }
    e.preventDefault();
  }

  // ---------------------------------------------------------- DÉPLACEMENT
  startMove(t, recenter) {
    const m = this.mv;
    m.id = t.identifier;
    const r = m.el.getBoundingClientRect();
    if (recenter) {
      // la base vient sous le pouce (tout en restant à l'écran)
      const half = r.width / 2;
      const x = Math.max(half + 6, Math.min(innerWidth * 0.45, t.clientX)), y = Math.max(innerHeight * 0.3, Math.min(innerHeight - half - 6, t.clientY));
      m.el.style.left = (x - half) + 'px'; m.el.style.top = (y - half) + 'px'; m.el.style.bottom = 'auto';
      m.cx = x; m.cy = y;
    } else { m.cx = r.left + r.width / 2; m.cy = r.top + r.height / 2; }
    m.el.classList.add('active');
    this.dragMove(t);
  }
  dragMove(t) {
    const m = this.mv, R = (m.el.offsetWidth / 2) * 0.72;
    let dx = t.clientX - m.cx, dy = t.clientY - m.cy;
    const l = Math.hypot(dx, dy);
    if (l > R) { dx *= R / l; dy *= R / l; }
    m.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const i = this.inp;
    i.move.x = dx / R; i.move.y = -dy / R;
    // à fond vers l'avant : courir (comme Bedrock)
    const sprint = l > R * 0.95 && i.move.y > 0.7;
    if (sprint) i.virtual.add('Sprint'); else i.virtual.delete('Sprint');
    m.el.classList.toggle('sprint', sprint);
  }
  endMove() {
    const m = this.mv, i = this.inp;
    m.id = null; i.move.x = 0; i.move.y = 0; i.virtual.delete('Sprint');
    m.knob.style.transform = '';
    m.el.style.left = m.el.style.top = m.el.style.bottom = '';
    m.el.classList.remove('active', 'sprint');
  }

  // --------------------------------------------------------------- CAMÉRA
  startLook(t) {
    const l = this.lk, r = l.el.getBoundingClientRect();
    l.id = t.identifier; l.cx = r.left + r.width / 2; l.cy = r.top + r.height / 2; l.x = t.clientX; l.y = t.clientY;
    l.el.classList.add('active');
    this.placeLookKnob(t);
  }
  placeLookKnob(t) {
    const l = this.lk, R = (l.el.offsetWidth / 2) * 0.72;
    let dx = t.clientX - l.cx, dy = t.clientY - l.cy;
    const d = Math.hypot(dx, dy);
    if (d > R) { dx *= R / d; dy *= R / d; }
    l.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    // au-delà de 80 % du rayon, la caméra continue de tourner
    const k = Math.max(0, (Math.min(d, R * 1.3) / R - 0.8) / 0.5);
    l.ex = d > 0 ? (dx / d) * k : 0; l.ey = d > 0 ? (dy / d) * k : 0;
  }
  endLook() {
    const l = this.lk;
    l.id = null; l.ex = 0; l.ey = 0; l.knob.style.transform = ''; l.el.classList.remove('active');
  }

  // ---------------------------------------------- MONDE : POSER / CASSER
  startWorld(t) {
    const w = { id: t.identifier, x: t.clientX, y: t.clientY, x0: t.clientX, y0: t.clientY, moved: 0, mode: 'pending', t0: performance.now() };
    this.world.set(t.identifier, w);
    // le premier doigt posé sur le monde vise (en mode « au doigt »)
    if (this.fingerAim && !this.aimId) { this.aimId = w.id; this.inp.touchAim = { x: w.x, y: w.y }; }
    if (this.aimId === w.id || !this.fingerAim) this.showRing(w.x, w.y);
    w.timer = setTimeout(() => this.beginHold(w), HOLD_MS);
  }
  beginHold(w) {
    if (w.mode !== 'pending' || !this.world.has(w.id)) return;
    if (this.fingerAim && this.aimId !== w.id) return;
    w.mode = 'hold';
    this.hideRing();
    const i = this.inp, it = this.game && this.game.interact;
    if (it && it.wantsHoldUse && it.wantsHoldUse()) { w.use = true; i.virtual.add('TouchUse'); i.pressed.add('TouchUse'); }
    else { i.buttons |= 1; i.clicks.push(0); }
    vibrate(8);
  }
  dragWorld(w, t) {
    const dx = t.clientX - w.x, dy = t.clientY - w.y;
    w.x = t.clientX; w.y = t.clientY;
    w.moved = Math.hypot(w.x - w.x0, w.y - w.y0);
    if (w.mode === 'pending' && w.moved > TAP_MOVE) {
      // c'est un glissement : on regarde
      w.mode = 'look';
      clearTimeout(w.timer);
      this.hideRing();
      if (this.aimId === w.id) { this.aimId = null; this.inp.touchAim = null; }
    }
    if (w.mode !== 'pending') { this.inp.mouseDX += dx * LOOK_GAIN; this.inp.mouseDY += dy * LOOK_GAIN; }
    if (w.mode === 'hold' && this.aimId === w.id) this.inp.touchAim = { x: w.x, y: w.y };
  }
  endWorld(w) {
    clearTimeout(w.timer);
    this.world.delete(w.id);
    const i = this.inp;
    if (w.mode === 'pending' && (!this.fingerAim || this.aimId === w.id)) {
      // toucher court : poser / utiliser / frapper, à l'endroit visé
      i.clicks.push(3);
      if (this.aimId === w.id) { i.aimRelease = true; this.aimId = null; }
    } else if (w.mode === 'hold') {
      if (w.use) i.virtual.delete('TouchUse'); else i.buttons &= ~1;
      if (this.aimId === w.id) { this.aimId = null; i.touchAim = null; }
    } else if (this.aimId === w.id) { this.aimId = null; i.touchAim = null; }
    this.hideRing();
  }

  showRing(x, y) {
    const r = this.ring;
    if (!r) return;
    r.style.left = x + 'px'; r.style.top = y + 'px';
    r.classList.remove('go'); r.style.display = 'block';
    void r.offsetWidth; // relance l'animation
    r.classList.add('go');
  }
  hideRing() { if (this.ring) { this.ring.style.display = 'none'; this.ring.classList.remove('go'); } }

  moveT(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this.mv.id) { this.dragMove(t); continue; }
      if (t.identifier === this.lk.id) {
        const l = this.lk;
        this.inp.mouseDX += (t.clientX - l.x) * LOOK_GAIN; this.inp.mouseDY += (t.clientY - l.y) * LOOK_GAIN;
        l.x = t.clientX; l.y = t.clientY;
        this.placeLookKnob(t);
        continue;
      }
      const w = this.world.get(t.identifier);
      if (w) this.dragWorld(w, t);
    }
    if (!this.inp.uiOpen) e.preventDefault();
  }
  end(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === this.mv.id) this.endMove();
      else if (t.identifier === this.lk.id) this.endLook();
      else { const w = this.world.get(t.identifier); if (w) this.endWorld(w); }
    }
  }

  // relâche tout (ouverture d'un menu…)
  reset() {
    if (this.mv.id !== null) this.endMove();
    if (this.lk.id !== null) this.endLook();
    for (const w of [...this.world.values()]) { clearTimeout(w.timer); this.world.delete(w.id); }
    const i = this.inp;
    i.buttons &= ~1; i.virtual.delete('TouchUse'); i.touchAim = null; this.aimId = null;
    this.hideRing();
  }

  // chaque image : rotation continue quand le doigt est au bord du pad caméra
  update(dt) {
    if (this.inp.uiOpen) { if (this.mv.id !== null || this.world.size || this.lk.id !== null) this.reset(); return; }
    const l = this.lk;
    if (l.id !== null && (l.ex || l.ey)) {
      const rate = 2.6; // radians par seconde
      this.inp.mouseDX += l.ex * rate * dt / 0.0022;
      this.inp.mouseDY += l.ey * rate * 0.7 * dt / 0.0022;
    }
  }
}

export function vibrate(ms) { try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* non pris en charge */ } }
