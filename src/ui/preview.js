// Aperçu 3D du joueur dans l'inventaire (il suit le curseur comme dans Minecraft)
// et silhouettes des emplacements vides (armure, bouclier, corbeille)
import * as THREE from 'three';
import { buildModel, MODELS } from '../entity/mobmodels.js';

let preview = null;

export class PlayerPreview {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'preview-canvas';
    this.renderer = null;
    this.mx = 0; this.my = 0;
  }
  init() {
    if (this.renderer) return true;
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch (e) { return false; }
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x6a6a7a, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(-1.5, 2.5, 3);
    this.scene.add(sun);
    const m = buildModel(MODELS.player());
    const mat = new THREE.MeshLambertMaterial({ map: m.tex, alphaTest: 0.1, side: THREE.DoubleSide });
    m.root.traverse((o) => { if (o.isMesh) o.material = mat; });
    this.model = m;
    this.scene.add(m.root);
    this.camera = new THREE.PerspectiveCamera(26, 104 / 140, 0.1, 50);
    this.camera.position.set(0, 1.05, 5.4);
    this.camera.lookAt(0, 1.0, 0);
    return true;
  }
  attach(box) {
    if (!this.init()) return false;
    box.innerHTML = '';
    box.appendChild(this.canvas);
    const w = box.clientWidth || 104, h = box.clientHeight || 140;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.box = box;
    this.render();
    return true;
  }
  look(clientX, clientY) {
    if (!this.box || !this.box.isConnected) return;
    const r = this.box.getBoundingClientRect();
    this.mx = clientX - (r.left + r.width / 2);
    this.my = clientY - (r.top + r.height * 0.28);
    this.render();
  }
  render() {
    if (!this.renderer || !this.box || !this.box.isConnected) return;
    const P = this.model.parts;
    // même logique que Minecraft : le corps et la tête se tournent vers le curseur
    const yaw = Math.atan(this.mx / 40), pitch = Math.atan(this.my / 40);
    this.model.root.rotation.set(0, Math.PI + yaw * 0.35, 0);
    if (P.head) { P.head.rotation.set(-pitch * 0.35, yaw * 0.35, 0); }
    for (const k of ['rightArm', 'leftArm', 'rightLeg', 'leftLeg']) if (P[k]) P[k].rotation.set(0, 0, 0);
    if (P.rightArm) P.rightArm.rotation.z = 0.06;
    if (P.leftArm) P.leftArm.rotation.z = -0.06;
    this.renderer.render(this.scene, this.camera);
  }
}

export function playerPreview() { if (!preview) preview = new PlayerPreview(); return preview; }

// ---------------------------------------------------------------- SILHOUETTES
const SIL = {
  helmet: ['', '', '', '....XXXXXXXX....', '...XOOOOOOOOX...', '...XO......OX...', '...XO......OX...', '...XO......OX...', '...XX......XX...'],
  chest: ['', '..XXX....XXX....', '..XOOX..XOOX....', '..XOOOXXOOOX....', '...XOOOOOOX.....', '...XOOOOOOX.....', '...XOOOOOOX.....', '...XOOOOOOX.....', '...XOOOOOOX.....', '...XOOOOOOX.....', '...XXXXXXXX.....'],
  legs: ['', '', '...XXXXXXXXX....', '...XOOOOOOOX....', '...XOOOOOOOX....', '...XOOX.XOOX....', '...XOOX.XOOX....', '...XOOX.XOOX....', '...XOOX.XOOX....', '...XOOX.XOOX....', '...XXXX.XXXX....'],
  boots: ['', '', '', '', '', '', '', '...XXX...XXX....', '...XOX...XOX....', '...XOX...XOX....', '..XXOX...XOXX...', '..XOOX...XOOX...', '..XXXX...XXXX...'],
  shield: ['', '...XXXXXXXXX....', '...XOOOOOOOX....', '...XOOOOOOOX....', '...XOOOOOOOX....', '...XOOOOOOOX....', '...XOOOOOOOX....', '...XOOOOOOOX....', '....XOOOOOX.....', '.....XOOOX......', '......XXX.......'],
  trash: ['', '.....XXXXX......', '...XXXXXXXXX....', '...XOOOOOOOX....', '....XOXOXOX.....', '....XOXOXOX.....', '....XOXOXOX.....', '....XOXOXOX.....', '....XOXOXOX.....', '....XOOOOOX.....', '....XXXXXXX.....'],
};
const silCache = {};
export function hintIcon(name) {
  if (silCache[name]) return silCache[name];
  const rows = SIL[name];
  if (!rows) return null;
  const c = document.createElement('canvas'); c.width = 16; c.height = 16;
  const x = c.getContext('2d');
  rows.forEach((r, j) => [...r].forEach((ch, i) => {
    if (ch === 'X') { x.fillStyle = '#6f6f6f'; x.fillRect(i, j + 2, 1, 1); }
    else if (ch === 'O') { x.fillStyle = '#7d7d7d'; x.fillRect(i, j + 2, 1, 1); }
  }));
  return (silCache[name] = c.toDataURL());
}
