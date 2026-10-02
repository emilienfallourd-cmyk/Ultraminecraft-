// Entrées : clavier, souris (pointer lock), molette, manette tactile pour mobile
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();    // appuis de ce frame (front montant)
    this.mouseDX = 0; this.mouseDY = 0;
    this.buttons = 0;            // état des boutons
    this.clicks = [];            // clics de ce frame
    this.wheel = 0;
    this.locked = false;
    this.enabled = true;
    this.uiOpen = false;
    this.touch = false;
    this.sensitivity = 1;
    this.invertY = false;
    this.dragLook = false;
    this.move = { x: 0, y: 0 }; // joystick tactile
    this.virtual = new Set();   // boutons virtuels tactiles
    this.lastSpace = 0;
    this.doubleSpace = false;
    this.lastW = 0;
    this.doubleW = false;
    this.onKey = null;          // callback (code, event) pour l'interface

    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab', 'F1', 'F3', 'F5', 'Quote', 'Slash'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) {
        this.pressed.add(e.code);
        const now = performance.now();
        if (e.code === 'Space') { if (now - this.lastSpace < 300) this.doubleSpace = true; this.lastSpace = now; }
        if (e.code === 'KeyW') { if (now - this.lastW < 300) this.doubleW = true; this.lastW = now; }
      }
      this.keys.add(e.code);
      if (this.onKey) this.onKey(e.code, e);
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('blur', () => { this.keys.clear(); this.buttons = 0; });
    canvas.addEventListener('mousedown', (e) => {
      if (this.uiOpen) return;
      if (!this.locked && !this.dragLook) { this.requestLock(); return; }
      this.buttons |= 1 << e.button;
      this.clicks.push(e.button);
      e.preventDefault();
    });
    addEventListener('mouseup', (e) => { this.buttons &= ~(1 << e.button); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (this.locked || (this.dragLook && (this.buttons & 1) === 0 && e.buttons & 4)) {
        this.mouseDX += e.movementX || 0; this.mouseDY += e.movementY || 0;
      }
    });
    addEventListener('wheel', (e) => { if (!this.uiOpen) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      // repli : regard au glisser si le verrouillage est refusé (iframe)
      this.dragLook = true;
      if (this.onLockChange) this.onLockChange(false, true);
    });
  }

  requestLock() {
    if (this.touch) return;
    try {
      const p = this.canvas.requestPointerLock && this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { this.dragLook = true; });
    } catch (e) { this.dragLook = true; }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.keys.has(code) || this.virtual.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  endFrame() {
    this.pressed.clear(); this.clicks = []; this.wheel = 0; this.mouseDX = 0; this.mouseDY = 0;
    this.doubleSpace = false; this.doubleW = false;
  }

  // ------------------------------------------------- CONTRÔLES TACTILES
  setupTouch(root, handlers) {
    this.touch = true;
    root.classList.add('touch');
    const stick = root.querySelector('#tStick'), knob = root.querySelector('#tKnob');
    let stickId = null, sx = 0, sy = 0;
    const lookTouches = new Map();
    const R = 55;
    stick.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0]; stickId = t.identifier;
      const r = stick.getBoundingClientRect(); sx = r.left + r.width / 2; sy = r.top + r.height / 2;
      e.preventDefault();
    }, { passive: false });
    const moveStick = (t) => {
      let dx = t.clientX - sx, dy = t.clientY - sy;
      const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.move.x = dx / R; this.move.y = -dy / R;
      if (this.move.y > 0.95 && !this.sprintLock) this.virtual.add('Sprint'); else if (this.move.y < 0.8) this.virtual.delete('Sprint');
    };
    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) moveStick(t);
        else if (lookTouches.has(t.identifier)) {
          const L = lookTouches.get(t.identifier);
          const dx = t.clientX - L.x, dy = t.clientY - L.y;
          this.mouseDX += dx * 2.2; this.mouseDY += dy * 2.2;
          L.moved += Math.abs(dx) + Math.abs(dy);
          L.x = t.clientX; L.y = t.clientY;
        }
      }
      if (!this.uiOpen) e.preventDefault();
    }, { passive: false });
    const endT = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) { stickId = null; this.move.x = 0; this.move.y = 0; knob.style.transform = ''; this.virtual.delete('Sprint'); }
        const L = lookTouches.get(t.identifier);
        if (L) {
          clearTimeout(L.timer);
          if (L.breaking) { this.buttons &= ~1; }
          else if (L.moved < 12 && performance.now() - L.t0 < 300) { this.clicks.push(2); } // tap = utiliser/poser
          lookTouches.delete(t.identifier);
        }
      }
    };
    addEventListener('touchend', endT); addEventListener('touchcancel', endT);
    this.canvas.addEventListener('touchstart', (e) => {
      if (this.uiOpen) return;
      for (const t of e.changedTouches) {
        const L = { x: t.clientX, y: t.clientY, moved: 0, t0: performance.now(), breaking: false };
        // appui long = casser / attaquer
        L.timer = setTimeout(() => { if (L.moved < 20) { L.breaking = true; this.buttons |= 1; this.clicks.push(0); } }, 280);
        lookTouches.set(t.identifier, L);
      }
      e.preventDefault();
    }, { passive: false });
    const btn = (id, code, hold = true) => {
      const el = root.querySelector(id);
      if (!el) return;
      el.addEventListener('touchstart', (e) => {
        e.preventDefault(); e.stopPropagation();
        if (hold) this.virtual.add(code);
        this.pressed.add(code);
        if (code === 'Space') { const now = performance.now(); if (now - this.lastSpace < 300) this.doubleSpace = true; this.lastSpace = now; }
        if (handlers && handlers[code]) handlers[code]();
      }, { passive: false });
      el.addEventListener('touchend', (e) => { e.preventDefault(); this.virtual.delete(code); }, { passive: false });
    };
    btn('#tJump', 'Space'); btn('#tSneak', 'ShiftLeft'); btn('#tInv', 'KeyE', false); btn('#tPause', 'Escape', false);
    btn('#tAttack', 'TouchAttack', true); btn('#tUse', 'TouchUse', true); btn('#tDrop', 'KeyQ', false); btn('#tChat', 'KeyT', false);
    btn('#tView', 'F5', false);
  }
}
