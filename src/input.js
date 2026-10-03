// Entrées : clavier, souris (pointer lock), molette, commandes tactiles et manette
import { GamepadInput } from './gamepad.js';
import { TouchControls } from './touch.js';

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
    this.touchAim = null;       // point visé au doigt (écran tactile)
    this.virtual = new Set();   // boutons virtuels tactiles
    this.lastSpace = 0;
    this.doubleSpace = false;
    this.lastW = 0;
    this.doubleW = false;
    this.onKey = null;          // callback (code, event) pour l'interface
    this.padMove = { x: 0, y: 0 }; // stick gauche de la manette
    this.padActive = false;
    this.pad = new GamepadInput(this);

    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'Tab', 'F1', 'F3', 'F5', 'Quote', 'Slash'].includes(e.code)) e.preventDefault();
      // Ctrl sert à courir : bloquer les raccourcis du navigateur qui peuvent l'être (Ctrl+D, Ctrl+S…)
      if (e.ctrlKey && !this.uiOpen && e.code !== 'ControlLeft' && e.code !== 'ControlRight') e.preventDefault();
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
    this.avgMove = 0;
    this.skipMoves = 0;
    addEventListener('mousemove', (e) => {
      if (this.locked || (this.dragLook && (this.buttons & 1) === 0 && e.buttons & 4)) {
        const dx = e.movementX || 0, dy = e.movementY || 0;
        if (this.skipMoves > 0) { this.skipMoves--; return; }
        // Chrome envoie parfois sous verrouillage un déplacement énorme et faux
        // (demi-tour soudain de la caméra) : on écarte ces valeurs aberrantes
        const mag = Math.abs(dx) + Math.abs(dy);
        if (mag > 200 && mag > this.avgMove * 5 + 80) return;
        this.avgMove = this.avgMove * 0.75 + mag * 0.25;
        this.mouseDX += dx; this.mouseDY += dy;
      }
    });
    addEventListener('wheel', (e) => {
      // Ctrl (courir) + molette = zoom du navigateur : bloqué pendant la partie
      if (e.ctrlKey || !this.uiOpen) e.preventDefault();
      if (!this.uiOpen) this.wheel += Math.sign(e.deltaY);
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.locked) { this.skipMoves = 2; this.avgMove = 0; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    document.addEventListener('pointerlockerror', () => {
      // repli : regard au glisser si le verrouillage est refusé (iframe)
      this.dragLook = true;
      if (this.onLockChange) this.onLockChange(false, true);
    });
  }

  requestLock() {
    if (this.touch || this.padActive || !this.canvas.requestPointerLock) return;
    const c = this.canvas;
    const plain = () => {
      try {
        const p = c.requestPointerLock();
        if (p && p.catch) p.catch(() => { this.dragLook = true; });
      } catch (e) { this.dragLook = true; }
    };
    // mouvements bruts de la souris (sans accélération du système) quand c'est possible
    try {
      const p = c.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch((err) => { if (err && err.name === 'NotSupportedError') plain(); else this.dragLook = true; });
    } catch (e) { plain(); }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.keys.has(code) || this.virtual.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  endFrame() {
    this.pressed.clear(); this.clicks = []; this.wheel = 0; this.mouseDX = 0; this.mouseDY = 0;
    this.doubleSpace = false; this.doubleW = false;
    // la visée d'un toucher court reste valable jusqu'à ce que le clic soit traité
    if (this.aimRelease) { this.aimRelease = false; this.touchAim = null; }
  }

  // ------------------------------------------------- CONTRÔLES TACTILES
  setupTouch(root, opts) {
    this.touch = true;
    root.classList.add('touch');
    this.touchCtl = new TouchControls(this, root, opts);
  }
}
