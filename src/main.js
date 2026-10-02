// Point d'entrée : paramètres, sauvegardes, écran titre avec monde de démonstration, lancement des parties
import { Game } from './game.js';
import { UI } from './ui/ui.js';
import { SaveStore } from './save.js';
import { hashString } from './util/noise.js';
import { presetByName } from './ui/menus.js';

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const DEFAULTS = {
  renderDistance: 8, shadows: 1, ssr: true, volumetric: true, bloom: true, clouds: true, renderScale: 1, particles: 2,
  fov: 75, sensitivity: 1, brightness: 1, volume: 0.8, musicVolume: 0.5, sfxVolume: 1, viewBob: true, difficulty: 2,
  mobs: true, keepInventory: false, invertY: false, advancedTooltips: false, chunkBudget: 7, showHud: true,
  dynRes: 0, fpsCap: 0, uiScale: 1, touchScale: 1,
};

// premier lancement sur mobile : mode graphique choisi selon la puissance de l'appareil
function mobilePreset() {
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 4;
  const big = Math.min(screen.width, screen.height) >= 700;
  if (cores <= 4 || mem <= 3) return 'Mobile éco';
  if (big && cores >= 8 && mem >= 6) return 'Mobile+';
  return 'Mobile';
}

function loadSettings() {
  let s = { ...DEFAULTS };
  if (isTouch) { const { name, desc, ...vals } = presetByName(mobilePreset()); Object.assign(s, vals); }
  try { const raw = localStorage.getItem('umc-settings'); if (raw) s = { ...s, ...JSON.parse(raw) }; } catch (e) { /* stockage indisponible */ }
  return s;
}

const App = {
  settings: loadSettings(),
  store: null, ui: null, game: null,
  saveSettings() { try { localStorage.setItem('umc-settings', JSON.stringify(this.settings)); } catch (e) { /* ignoré */ } },
  applySettings() {
    const g = this.game, s = this.settings;
    if (!g) return;
    if (g.pipeline.shadowQ !== s.shadows) { g.pipeline.setShadowQuality(s.shadows); g.pipeline.shadowQ = s.shadows; }
    g.pipeline.width = 0; g.pipeline.resize();
    g.audio.applyVolumes();
    g.particles.density = s.particles === 0 ? 0.4 : s.particles === 1 ? 0.7 : 1;
    g.particles.enabled = s.particles > 0 || true;
    g.input.invertY = s.invertY;
    document.documentElement.style.setProperty('--ui', String(s.uiScale || 1));
    const t = document.getElementById('touch');
    if (t) t.style.setProperty('--ts', String(s.touchScale || 1));
  },

  async boot() {
    const ui = this.ui = new UI(this);
    ui.showLoading('Chargement d\'UltraMinecraft…', 0.05);
    await new Promise((r) => setTimeout(r, 30));
    // WebGL2 requis
    const test = document.createElement('canvas').getContext('webgl2');
    if (!test) { ui.showLoading('Votre navigateur ne prend pas en charge WebGL 2 :('); return; }
    this.store = await new SaveStore().open();
    ui.showLoading('Génération des textures…', 0.2);
    await new Promise((r) => setTimeout(r, 30));
    let g;
    try {
      g = this.game = new Game(document.getElementById('game'), ui, this.settings, this.store);
    } catch (e) {
      console.error(e);
      ui.showLoading('Erreur d\'initialisation : ' + e.message);
      return;
    }
    g.pipeline.shadowQ = this.settings.shadows;
    ui.attach(g);
    this.applySettings();
    if (isTouch) {
      g.input.setupTouch(document.getElementById('app'), {
        KeyE: () => { if (ui.screen) ui.closeScreen(); else if (g.running && !g.demo) ui.openInventory(); },
        Escape: () => { if (ui.screen) ui.closeScreen(); else if (ui.menus.open === 'pause') ui.menus.resume(); else ui.menus.pause(); },
        KeyT: () => ui.openChat(''),
        F5: () => { g.thirdPerson = (g.thirdPerson + 1) % 3; },
      });
    }
    g.start();
    // monde de démonstration en arrière-plan du titre
    try { await this.startDemo(); } catch (e) { console.warn('Démo indisponible', e); }
    ui.hideLoading();
    ui.menus.title();
  },

  async startDemo() {
    const g = this.game;
    const seeds = [12345, 8675309, 424242, 2024, 31337];
    const seed = seeds[Math.floor(Math.random() * seeds.length)];
    const meta = { id: '__demo', seed: String(seed), seedNum: hashString(String(seed)), demo: true, time: 1500 + Math.random() * 6000 };
    g.demo = true;
    await g.startWorld(meta, false, true);
  },

  async stopCurrent() {
    const g = this.game;
    if (g.running && !g.demo) await g.saveGame();
    g.stopWorld();
  },

  async createWorld({ name, seed, gamemode, hardcore }) {
    const meta = { id: 'w' + Date.now().toString(36) + Math.floor(Math.random() * 1e4), name, seed, seedNum: hashString(seed), gamemode, hardcore: !!hardcore, created: Date.now(), lastPlayed: Date.now() };
    await this.store.saveWorld(meta);
    await this.playWorld(meta, true);
  },

  async playWorld(meta, isNew = false) {
    const ui = this.ui, g = this.game;
    ui.menus.close();
    ui.showLoading('Préparation du monde…', 0);
    await this.stopCurrent();
    g.demo = false;
    try {
      await g.startWorld(meta, isNew);
      await g.saveGame();
    } catch (e) {
      console.error(e);
      ui.hideLoading();
      ui.toast('Erreur : ' + e.message);
      ui.menus.title();
    }
  },

  async quitToTitle() {
    const ui = this.ui;
    ui.menus.close();
    ui.showLoading('Sauvegarde…');
    await this.stopCurrent();
    ui.leaveWorld();
    try { await this.startDemo(); } catch (e) { console.warn(e); }
    ui.hideLoading();
    ui.menus.title();
  },
};

window.App = App;
// Ctrl+W (courir + avancer) ferme l'onglet dans les navigateurs : demander confirmation
addEventListener('beforeunload', (e) => {
  const g = App.game;
  if (g && g.running && !g.demo) { g.saveGame(); e.preventDefault(); e.returnValue = ''; }
});
App.boot();
