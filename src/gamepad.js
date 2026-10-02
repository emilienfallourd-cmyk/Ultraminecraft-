// Manette (API Gamepad, disposition standard Xbox / PlayStation) :
// en jeu  — stick gauche : se déplacer, stick droit : regarder, A : sauter, B : s'accroupir,
//           RT : casser / attaquer, LT : utiliser / poser, LB / RB : barre d'objets, Y : inventaire,
//           X : lâcher, L3 : courir, R3 : choisir le bloc visé, croix haut : vue, croix bas : main secondaire,
//           Menu : pause, Affichage : discussion
// menus   — curseur virtuel (stick gauche), croix : aller à l'élément voisin, A : clic, X : clic droit,
//           B : retour, Y : fermer l'inventaire, stick droit : défiler, croix gauche / droite : régler un curseur
const DEAD = 0.18;
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, MENU: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const FOCUSABLE = '.slot, .btn, button, .tab, .world, input, .recipe, .ctab, [data-pad]';

const dz = (v) => { const a = Math.abs(v); if (a < DEAD) return 0; return Math.sign(v) * Math.pow((a - DEAD) / (1 - DEAD), 1.6); };

export class GamepadInput {
  constructor(input) {
    this.input = input;
    this.index = -1;
    this.prev = [];
    this.active = false;       // la manette est l'entrée utilisée en ce moment
    this.cx = innerWidth / 2; this.cy = innerHeight / 2;
    this.hoverChain = [];
    this.repeat = {};          // répétition des directions de la croix
    this.cursor = document.createElement('div');
    this.cursor.id = 'padCursor';
    this.cursor.className = 'hidden';
    document.body.appendChild(this.cursor);
    this.onConnect = null;
    addEventListener('gamepadconnected', (e) => {
      if (this.index < 0) this.index = e.gamepad.index;
      if (this.onConnect) this.onConnect(true, e.gamepad.id);
    });
    addEventListener('gamepaddisconnected', (e) => {
      if (e.gamepad.index === this.index) { this.index = -1; this.setActive(false); this.releaseAll(); }
      if (this.onConnect) this.onConnect(false, e.gamepad.id);
    });
    // retour au clavier / à la souris
    const back = () => { if (this.active) this.setActive(false); };
    addEventListener('mousemove', (e) => { if (e.isTrusted && (Math.abs(e.movementX) + Math.abs(e.movementY) > 2)) back(); });
    addEventListener('keydown', (e) => { if (e.isTrusted) back(); });
  }

  setActive(on) {
    if (this.active === on) return;
    this.active = on;
    this.input.padActive = on;
    document.body.classList.toggle('pad', on);
    if (!on) { this.cursor.classList.add('hidden'); this.setHover(null); }
  }

  pad() {
    const list = navigator.getGamepads ? navigator.getGamepads() : [];
    if (!list) return null;
    let g = this.index >= 0 ? list[this.index] : null;
    if (!g) for (const p of list) if (p && p.connected) { g = p; this.index = p.index; break; }
    return g && g.connected ? g : null;
  }

  rumble(strong = 0.5, ms = 120) {
    const g = this.pad();
    if (!g || !this.active) return;
    try { g.vibrationActuator && g.vibrationActuator.playEffect && g.vibrationActuator.playEffect('dual-rumble', { duration: ms, strongMagnitude: strong, weakMagnitude: strong * 0.6 }); } catch (e) { /* non pris en charge */ }
  }

  releaseAll() {
    const v = this.input.virtual;
    for (const k of ['Space', 'ShiftLeft', 'TouchAttack', 'TouchUse', 'KeyC']) v.delete(k);
    this.input.padMove.x = 0; this.input.padMove.y = 0;
  }

  // appelée à chaque image ; mode 'game' (en jeu) ou 'ui' (menus, inventaire…)
  update(dt, game) {
    const g = this.pad();
    if (!g) return;
    const b = g.buttons.map((x) => (typeof x === 'object' ? x.pressed || x.value > 0.4 : x > 0.4));
    const ax = g.axes;
    const any = b.some((x) => x) || ax.some((v) => Math.abs(v) > 0.35);
    if (any && !this.active) this.setActive(true);
    const prev = this.prev;
    const hit = (i) => b[i] && !prev[i];
    this.prev = b;
    if (!this.active) return;
    const inp = this.input;
    const ui = game && game.ui;
    const playing = game && game.running && !game.demo && !game.paused && !game.loading && ui && !ui.isScreenOpen() && !(game.player && game.player.dead);
    if (playing) { this.cursor.classList.add('hidden'); this.setHover(null); this.gameInput(dt, game, b, ax, hit); }
    else { this.releaseAll(); this.uiInput(dt, game, b, ax, hit); }
  }

  gameInput(dt, game, b, ax, hit) {
    const inp = this.input, v = inp.virtual;
    inp.padMove.x = dz(ax[0] || 0); inp.padMove.y = -dz(ax[1] || 0);
    // regard : vitesse en radians par seconde convertie en « pixels » de souris
    const rate = 3.4;
    inp.mouseDX += dz(ax[2] || 0) * rate * dt / 0.0022;
    inp.mouseDY += dz(ax[3] || 0) * rate * 0.8 * dt / 0.0022;
    const hold = (i, code) => { if (b[i]) { if (!v.has(code)) { v.add(code); inp.pressed.add(code); this.edge(code); } } else v.delete(code); };
    hold(BTN.A, 'Space');
    hold(BTN.B, 'ShiftLeft');
    hold(BTN.RT, 'TouchAttack');
    hold(BTN.LT, 'TouchUse');
    if (hit(BTN.LB) || hit(BTN.LEFT)) inp.wheel -= 1;
    if (hit(BTN.RB) || hit(BTN.RIGHT)) inp.wheel += 1;
    if (hit(BTN.X)) inp.pressed.add('KeyQ');
    if (hit(BTN.UP)) inp.pressed.add('F5');
    if (hit(BTN.DOWN)) inp.pressed.add('KeyF');
    if (hit(BTN.R3)) inp.clicks.push(1);
    if (hit(BTN.L3) && game.interact) game.interact.sprintLatch = true;
    if (hit(BTN.Y)) this.key('KeyE');
    if (hit(BTN.MENU)) this.key('Escape');
    if (hit(BTN.VIEW)) this.key('KeyT');
  }
  edge(code) {
    const inp = this.input;
    if (code === 'Space') { const now = performance.now(); if (now - inp.lastSpace < 300) inp.doubleSpace = true; inp.lastSpace = now; }
  }
  key(code) { this.input.pressed.add(code); if (this.input.onKey) this.input.onKey(code, null); }

  // ------------------------------------------------------------ MENUS
  uiInput(dt, game, b, ax, hit) {
    this.cursor.classList.remove('hidden');
    const sp = 900 * Math.min(1.5, Math.max(innerWidth, innerHeight) / 1280);
    const mx = dz(ax[0] || 0), my = dz(ax[1] || 0);
    if (mx || my) this.moveTo(this.cx + mx * sp * dt, this.cy + my * sp * dt);
    // défilement
    const sy = dz(ax[3] || 0);
    if (sy) { const s = this.scrollable(this.under()); if (s) s.scrollTop += sy * 900 * dt; }
    // croix : sauter à l'élément voisin (ou régler un curseur)
    const now = performance.now();
    const dirs = [[BTN.UP, 0, -1], [BTN.DOWN, 0, 1], [BTN.LEFT, -1, 0], [BTN.RIGHT, 1, 0]];
    for (const [i, dx, dy] of dirs) {
      if (!b[i]) { delete this.repeat[i]; continue; }
      const r = this.repeat[i];
      if (r && now < r) continue;
      this.repeat[i] = now + (r ? 110 : 380);
      const el = this.under();
      if (dx && el && el.tagName === 'INPUT' && el.type === 'range') { this.stepRange(el, dx); continue; }
      this.jump(dx, dy);
    }
    if (hit(BTN.A)) this.click(0);
    if (hit(BTN.X)) this.click(2);
    if (hit(BTN.B)) {
      const ae = document.activeElement;
      if (ae && ae.tagName === 'INPUT' && ae.type === 'text') ae.blur();
      else if (game && game.ui && game.ui.chatOpen) game.ui.closeChat();
      else this.key('Escape');
    }
    if (hit(BTN.Y)) this.key('KeyE');
    if (hit(BTN.MENU) && game && game.running && !game.demo) this.key('Escape');
    if (hit(BTN.LB) || hit(BTN.RB)) this.cycleTabs(hit(BTN.RB) ? 1 : -1);
  }

  under() {
    const e = document.elementFromPoint(this.cx, this.cy);
    return e && e !== this.cursor ? e : null;
  }
  moveTo(x, y) {
    this.cx = Math.max(0, Math.min(innerWidth - 1, x)); this.cy = Math.max(0, Math.min(innerHeight - 1, y));
    this.cursor.style.transform = `translate(${this.cx}px, ${this.cy}px)`;
    const target = this.under();
    this.setHover(target);
    dispatchEvent(new MouseEvent('mousemove', { clientX: this.cx, clientY: this.cy, bubbles: true }));
  }
  setHover(target) {
    const chain = [];
    for (let e = target; e && e !== document.documentElement; e = e.parentElement) chain.push(e);
    const old = this.hoverChain;
    for (const e of old) if (!chain.includes(e)) { e.classList && e.classList.remove('pad-hover'); e.dispatchEvent(new MouseEvent('mouseleave', { clientX: this.cx, clientY: this.cy })); }
    for (let i = chain.length - 1; i >= 0; i--) { const e = chain[i]; if (!old.includes(e)) e.dispatchEvent(new MouseEvent('mouseenter', { clientX: this.cx, clientY: this.cy })); }
    const f = target && target.closest ? target.closest(FOCUSABLE) : null;
    for (const e of chain) if (e === f) e.classList.add('pad-hover');
    this.hoverChain = chain;
  }
  click(button) {
    const t = this.under();
    if (!t) return;
    const o = { clientX: this.cx, clientY: this.cy, button, buttons: 1 << (button === 2 ? 1 : 0), bubbles: true, cancelable: true };
    t.dispatchEvent(new MouseEvent('mousedown', o));
    t.dispatchEvent(new MouseEvent('mouseup', o));
    if (button === 0) {
      const f = t.closest('input, select, textarea');
      if (f && f.type !== 'range') f.focus();
      t.dispatchEvent(new MouseEvent('click', o));
    } else t.dispatchEvent(new MouseEvent('contextmenu', o));
  }
  stepRange(el, d) {
    const step = +el.step || 1;
    const v = Math.max(+el.min, Math.min(+el.max, +el.value + d * step * (step < 5 ? 2 : 1)));
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  scrollable(e) {
    for (; e && e !== document.body; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && e.scrollHeight > e.clientHeight) return e;
    }
    return null;
  }
  visibleTargets() {
    const out = [];
    for (const e of document.querySelectorAll(FOCUSABLE)) {
      if (e.disabled || e === this.cursor) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) continue;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      if (!top || (top !== e && !e.contains(top) && !top.contains(e))) continue;
      out.push({ e, cx, cy });
    }
    return out;
  }
  // va vers l'élément le plus proche dans la direction demandée
  jump(dx, dy) {
    let best = null, bs = Infinity;
    const cur = this.under();
    const curF = cur && cur.closest ? cur.closest(FOCUSABLE) : null;
    for (const t of this.visibleTargets()) {
      if (t.e === curF) continue;
      const vx = t.cx - this.cx, vy = t.cy - this.cy;
      const along = vx * dx + vy * dy;
      if (along < 6) continue;
      const across = Math.abs(vx * dy) + Math.abs(vy * dx);
      const s = along + across * 2.2;
      if (s < bs) { bs = s; best = t; }
    }
    if (best) this.moveTo(best.cx, best.cy);
  }
  cycleTabs(d) {
    const tabs = [...document.querySelectorAll('.tab')].filter((t) => t.getBoundingClientRect().width > 0);
    if (!tabs.length) return;
    let i = tabs.findIndex((t) => t.classList.contains('on'));
    i = (i + d + tabs.length) % tabs.length;
    tabs[i].dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
}
