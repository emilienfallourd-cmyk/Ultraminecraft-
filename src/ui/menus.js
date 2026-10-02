// Menus : écran titre, mondes, création, options, pause, mort, aide
import { hashString } from '../util/noise.js';
import { MOB_DEFS } from '../entity/mobs.js';

const $ = (s) => document.querySelector(s);
const SPLASHES = [
  'Maintenant en 3D réaliste !', 'Avec du lancer de rayons !', 'Ne creusez pas tout droit vers le bas !', 'Attention aux creepers !',
  'Fait avec Three.js !', '100 % procédural !', 'Des boss épiques !', 'Le Warden vous écoute…', 'Le Nether est brûlant !',
  'L\'End n\'est que le début !', 'Plus réaliste que jamais !', 'Aussi sur mobile !', 'Eau à réflexions en temps réel !',
  'Rayons de soleil volumétriques !', 'Trois dimensions !', 'Des villages à explorer !', 'Ombres dynamiques !', 'Bonjour la France !',
];
// Modes graphiques. Les modes « Mobile » et « Manette / TV » ajustent aussi la résolution dynamique,
// la limite d'images, la taille de l'interface et le nombre de tronçons maillés par image.
const PRESET_BASE = { dynRes: 0, fpsCap: 0, uiScale: 1, chunkBudget: 7 };
const PRESETS = [
  { name: 'Mobile éco', desc: 'téléphones modestes, batterie', shadows: 0, ssr: false, volumetric: false, bloom: false, clouds: false, renderScale: 0.55, renderDistance: 3, particles: 0, dynRes: 30, fpsCap: 30, uiScale: 1.1, chunkBudget: 3 },
  { name: 'Mobile', desc: 'la plupart des téléphones', shadows: 0, ssr: false, volumetric: false, bloom: true, clouds: false, renderScale: 0.7, renderDistance: 4, particles: 1, dynRes: 45, fpsCap: 0, uiScale: 1.1, chunkBudget: 4 },
  { name: 'Mobile+', desc: 'tablettes et téléphones récents', shadows: 1, ssr: false, volumetric: false, bloom: true, clouds: true, renderScale: 0.75, renderDistance: 5, particles: 1, dynRes: 50, fpsCap: 0, uiScale: 1.05, chunkBudget: 5 },
  { name: 'Rapide', desc: 'petits PC', shadows: 0, ssr: false, volumetric: false, bloom: false, clouds: false, renderScale: 0.7, renderDistance: 5, particles: 1 },
  { name: 'Équilibré', desc: 'PC portables', shadows: 1, ssr: false, volumetric: false, bloom: true, clouds: true, renderScale: 0.85, renderDistance: 6, particles: 1 },
  { name: 'Manette / TV', desc: 'jeu au canapé, interface agrandie, 60 i/s stables', shadows: 1, ssr: true, volumetric: true, bloom: true, clouds: true, renderScale: 1, renderDistance: 8, particles: 2, dynRes: 60, fpsCap: 60, uiScale: 1.4, chunkBudget: 6 },
  { name: 'Réaliste', desc: 'PC de jeu', shadows: 1, ssr: true, volumetric: true, bloom: true, clouds: true, renderScale: 1, renderDistance: 8, particles: 2 },
  { name: 'Ultra (RT)', desc: 'cartes graphiques puissantes', shadows: 2, ssr: true, volumetric: true, bloom: true, clouds: true, renderScale: 1, renderDistance: 12, particles: 2 },
];
for (const p of PRESETS) for (const [k, v] of Object.entries(PRESET_BASE)) if (p[k] === undefined) p[k] = v;
export function presetIndex(s) { return PRESETS.findIndex((p) => Object.keys(p).every((k) => k === 'name' || k === 'desc' || s[k] === p[k])); }
export function presetByName(n) { return PRESETS.find((p) => p.name === n); }
export { PRESETS };

export class Menus {
  constructor(ui) { this.ui = ui; this.open = null; this.stack = []; }
  get game() { return this.ui.game; }
  set(name, html, bg = 'menu-bg') {
    this.open = name;
    $('#menu').innerHTML = `<div class="${bg}"></div><div class="menu-box">${html}</div>`;
    this.ui.setUiOpen && this.ui.setUiOpen();
    if (this.game && this.game.input) { this.ui.ignoreUnlock = true; this.game.input.exitLock(); }
    const first = $('#menu .btn');
    if (first && !('ontouchstart' in window)) first.focus({ preventScroll: true });
  }
  on(id, fn) { const e = document.getElementById(id); if (e) e.addEventListener('click', (ev) => { this.game && this.game.audio.play('click'); fn(ev); }); }
  close() { this.open = null; $('#menu').innerHTML = ''; this.ui.setUiOpen && this.ui.setUiOpen(); }
  back() {
    const g = this.game;
    if (this.open === 'pause') this.resume();
    else if (this.open === 'options' || this.open === 'help') { if (this.returnTo) this.returnTo(); else this.title(); }
    else if (this.open === 'worlds' || this.open === 'create') this.title();
    void g;
  }
  frame() {}

  // ------------------------------------------------------------ TITRE
  title() {
    this.returnTo = null;
    const splash = SPLASHES[Math.floor(Math.random() * SPLASHES.length)];
    this.set('title', `
      <div class="logo">ULTRA<br><b>MINECRAFT</b></div>
      <div class="splash">${splash}</div>
      <button class="btn" id="mSolo">Solo</button>
      <button class="btn" id="mQuick">Nouvelle partie rapide</button>
      <div class="btn-row"><button class="btn" id="mOpt">Options…</button><button class="btn" id="mHelp">Commandes</button></div>
      <div class="footer"><span>UltraMinecraft · rendu réaliste Three.js</span><span>Projet de fans, non affilié à Mojang</span></div>`);
    this.on('mSolo', () => this.worlds());
    this.on('mQuick', () => this.ui.app.createWorld({ name: 'Monde ' + new Date().toLocaleDateString('fr-FR'), seed: String(Math.floor(Math.random() * 1e9)), gamemode: 0 }));
    this.on('mOpt', () => { this.returnTo = () => this.title(); this.options(); });
    this.on('mHelp', () => { this.returnTo = () => this.title(); this.help(); });
  }

  // ----------------------------------------------------------- MONDES
  async worlds() {
    const list = (await this.ui.app.store.listWorlds()).sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
    let sel = list[0] ? list[0].id : null;
    const modes = ['Survie', 'Créatif', '', 'Spectateur'];
    this.set('worlds', `
      <div class="menu-title">Sélectionner un monde</div>
      <div class="world-list" id="wl">${list.length ? '' : '<div class="world"><div class="d">Aucun monde. Créez-en un !</div></div>'}</div>
      <div class="btn-row"><button class="btn" id="wPlay" ${list.length ? '' : 'disabled'}>Jouer</button><button class="btn" id="wNew">Créer un monde</button></div>
      <div class="btn-row"><button class="btn" id="wDel" ${list.length ? '' : 'disabled'}>Supprimer</button><button class="btn" id="wBack">Retour</button></div>`, 'menu-bg dark');
    const wl = $('#wl');
    for (const w of list) {
      const d = document.createElement('div');
      d.className = 'world' + (w.id === sel ? ' sel' : '');
      const date = w.lastPlayed ? new Date(w.lastPlayed).toLocaleString('fr-FR') : '—';
      d.innerHTML = `<div class="n">${escape(w.name)}</div><div class="d">${modes[w.gamemode || 0]}${w.hardcore ? ' (Extrême)' : ''} · graine ${escape(w.seed)} · ${date}</div>`;
      d.onclick = () => { sel = w.id; wl.querySelectorAll('.world').forEach((x) => x.classList.remove('sel')); d.classList.add('sel'); };
      d.ondblclick = () => this.ui.app.playWorld(w);
      wl.appendChild(d);
    }
    this.on('wPlay', () => { const w = list.find((x) => x.id === sel); if (w) this.ui.app.playWorld(w); });
    this.on('wNew', () => this.create());
    // suppression en deux temps (les boîtes de dialogue natives peuvent être bloquées)
    let armed = null;
    this.on('wDel', async () => {
      const w = list.find((x) => x.id === sel), b = $('#wDel');
      if (!w) return;
      if (armed !== w.id) { armed = w.id; b.textContent = 'Confirmer la suppression ?'; setTimeout(() => { if (armed === w.id && b.isConnected) { armed = null; b.textContent = 'Supprimer'; } }, 4000); return; }
      await this.ui.app.store.deleteWorld(w.id); this.worlds();
    });
    this.on('wBack', () => this.title());
  }

  create() {
    let mode = 0;
    const modes = ['Survie', 'Créatif', 'Extrême'];
    const descs = ['Récoltez des ressources, fabriquez, survivez.', 'Ressources illimitées, vol libre, invulnérable.', 'Comme la Survie, mais une seule vie !'];
    this.set('create', `
      <div class="menu-title">Créer un nouveau monde</div>
      <label class="field"><span class="flabel">Nom du monde</span><input type="text" id="cName" value="Nouveau monde" maxlength="40"></label>
      <label class="field"><span class="flabel">Graine (laisser vide pour aléatoire)</span><input type="text" id="cSeed" placeholder="ex : 12345 ou un mot" maxlength="40"></label>
      <button class="btn" id="cMode">Mode de jeu : Survie</button>
      <div class="field" id="cDesc" style="text-align:center">${descs[0]}</div>
      <div class="btn-row"><button class="btn" id="cGo">Créer le monde</button><button class="btn" id="cBack">Annuler</button></div>`, 'menu-bg dark');
    for (const id of ['cName', 'cSeed']) $('#' + id).addEventListener('keydown', (e) => e.stopPropagation());
    this.on('cMode', () => { mode = (mode + 1) % 3; $('#cMode').textContent = 'Mode de jeu : ' + modes[mode]; $('#cDesc').textContent = descs[mode]; });
    this.on('cGo', () => {
      const name = $('#cName').value.trim() || 'Nouveau monde';
      const seed = $('#cSeed').value.trim() || String(Math.floor(Math.random() * 1e9));
      this.ui.app.createWorld({ name, seed, gamemode: mode === 1 ? 1 : 0, hardcore: mode === 2 });
    });
    this.on('cBack', () => this.worlds());
  }

  // ----------------------------------------------------------- OPTIONS
  options() {
    const s = this.ui.app.settings;
    const onoff = (v) => (v ? 'Oui' : 'Non');
    const shadowN = ['Désactivées', 'Normales', 'Ultra'];
    const partN = ['Minimales', 'Réduites', 'Toutes'];
    const diffN = ['Paisible', 'Facile', 'Normale', 'Difficile'];
    const preset = presetIndex(s);
    const touch = this.game && this.game.input && this.game.input.touch;
    const dynN = (v) => (v ? 'cible ' + v + ' i/s' : 'Non');
    this.set('options', `
      <div class="menu-title">Options</div>
      <div class="opt-grid">
        <button class="btn" id="oPreset" title="${preset >= 0 ? PRESETS[preset].desc : ''}">Mode graphique : ${preset >= 0 ? PRESETS[preset].name : 'Personnalisé'}</button>
        <div class="field preset-desc">${preset >= 0 ? 'Idéal pour : ' + PRESETS[preset].desc : 'Réglages personnalisés'}</div>
        <button class="btn" id="oDyn">Résolution dynamique : ${dynN(s.dynRes)}</button>
        <button class="btn" id="oCap">Limite d'images : ${s.fpsCap ? s.fpsCap + ' i/s' : 'Aucune'}</button>
        <label class="field"><span class="flabel">Taille de l'interface : <span id="vUi">${Math.round((s.uiScale || 1) * 100)}</span> %</span><input type="range" id="oUi" min="70" max="160" step="5" value="${Math.round((s.uiScale || 1) * 100)}"></label>
        ${touch ? `<label class="field"><span class="flabel">Taille des commandes tactiles : <span id="vTs">${Math.round((s.touchScale || 1) * 100)}</span> %</span><input type="range" id="oTs" min="70" max="160" step="5" value="${Math.round((s.touchScale || 1) * 100)}"></label>` : ''}
        <label class="field"><span class="flabel">Distance de rendu : <span id="vRd">${s.renderDistance}</span> chunks</span><input type="range" id="oRd" min="2" max="16" value="${s.renderDistance}"></label>
        <button class="btn" id="oShadows">Ombres : ${shadowN[s.shadows]}</button>
        <button class="btn" id="oSSR">Réflexions (lancer de rayons) : ${onoff(s.ssr)}</button>
        <button class="btn" id="oVol">Rayons volumétriques : ${onoff(s.volumetric)}</button>
        <button class="btn" id="oBloom">Halo lumineux : ${onoff(s.bloom)}</button>
        <button class="btn" id="oClouds">Nuages volumétriques : ${onoff(s.clouds)}</button>
        <button class="btn" id="oPart">Particules : ${partN[s.particles]}</button>
        <label class="field"><span class="flabel">Échelle de rendu : <span id="vRs">${Math.round(s.renderScale * 100)}</span> %</span><input type="range" id="oRs" min="40" max="100" step="5" value="${Math.round(s.renderScale * 100)}"></label>
        <label class="field"><span class="flabel">Champ de vision : <span id="vFov">${s.fov}</span></span><input type="range" id="oFov" min="50" max="110" value="${s.fov}"></label>
        <label class="field"><span class="flabel">Sensibilité : <span id="vSens">${Math.round(s.sensitivity * 100)}</span> %</span><input type="range" id="oSens" min="20" max="250" value="${Math.round(s.sensitivity * 100)}"></label>
        <label class="field"><span class="flabel">Luminosité : <span id="vBr">${Math.round(s.brightness * 100)}</span> %</span><input type="range" id="oBr" min="50" max="200" value="${Math.round(s.brightness * 100)}"></label>
        <label class="field"><span class="flabel">Volume général : <span id="vVol">${Math.round(s.volume * 100)}</span> %</span><input type="range" id="oVolm" min="0" max="100" value="${Math.round(s.volume * 100)}"></label>
        <label class="field"><span class="flabel">Musique : <span id="vMus">${Math.round(s.musicVolume * 100)}</span> %</span><input type="range" id="oMus" min="0" max="100" value="${Math.round(s.musicVolume * 100)}"></label>
        <button class="btn" id="oBob">Balancement de la vue : ${onoff(s.viewBob)}</button>
        <button class="btn" id="oDiff">Difficulté : ${diffN[s.difficulty]}</button>
        <button class="btn" id="oMobs">Créatures : ${onoff(s.mobs)}</button>
        <button class="btn" id="oKeep">Garder l'inventaire : ${onoff(s.keepInventory)}</button>
        <button class="btn" id="oInv">Inverser la souris : ${onoff(s.invertY)}</button>
        <button class="btn" id="oAdv">Infobulles avancées : ${onoff(s.advancedTooltips)}</button>
      </div>
      <button class="btn" id="oDone">Terminé</button>`, this.game && this.game.running && !this.game.demo ? 'menu-bg dark' : 'menu-bg');
    const save = () => { this.ui.app.saveSettings(); this.ui.app.applySettings(); };
    const re = () => { save(); this.options(); };
    this.on('oPreset', () => { const i = (preset + 1) % PRESETS.length; const { name, desc, ...vals } = PRESETS[i]; Object.assign(s, vals); re(); });
    this.on('oDyn', () => { const L = [0, 30, 45, 60]; s.dynRes = L[(L.indexOf(s.dynRes || 0) + 1) % L.length]; re(); });
    this.on('oCap', () => { const L = [0, 30, 60]; s.fpsCap = L[(L.indexOf(s.fpsCap || 0) + 1) % L.length]; re(); });
    this.on('oShadows', () => { s.shadows = (s.shadows + 1) % 3; re(); });
    this.on('oSSR', () => { s.ssr = !s.ssr; re(); });
    this.on('oVol', () => { s.volumetric = !s.volumetric; re(); });
    this.on('oBloom', () => { s.bloom = !s.bloom; re(); });
    this.on('oClouds', () => { s.clouds = !s.clouds; re(); });
    this.on('oPart', () => { s.particles = (s.particles + 1) % 3; re(); });
    this.on('oBob', () => { s.viewBob = !s.viewBob; re(); });
    this.on('oDiff', () => { s.difficulty = (s.difficulty + 1) % 4; re(); });
    this.on('oMobs', () => { s.mobs = !s.mobs; re(); });
    this.on('oKeep', () => { s.keepInventory = !s.keepInventory; re(); });
    this.on('oInv', () => { s.invertY = !s.invertY; re(); });
    this.on('oAdv', () => { s.advancedTooltips = !s.advancedTooltips; re(); });
    const slider = (id, vid, fn, fmt = (v) => v) => { const e = $('#' + id); e.addEventListener('input', () => { const v = +e.value; fn(v); $('#' + vid).textContent = fmt(v); save(); }); };
    slider('oRd', 'vRd', (v) => { s.renderDistance = v; });
    slider('oRs', 'vRs', (v) => { s.renderScale = v / 100; });
    slider('oFov', 'vFov', (v) => { s.fov = v; });
    slider('oSens', 'vSens', (v) => { s.sensitivity = v / 100; });
    slider('oBr', 'vBr', (v) => { s.brightness = v / 100; });
    slider('oVolm', 'vVol', (v) => { s.volume = v / 100; });
    slider('oMus', 'vMus', (v) => { s.musicVolume = v / 100; });
    slider('oUi', 'vUi', (v) => { s.uiScale = v / 100; });
    if (touch) slider('oTs', 'vTs', (v) => { s.touchScale = v / 100; });
    this.on('oDone', () => { if (this.returnTo) this.returnTo(); else this.title(); });
  }

  help() {
    this.set('help', `
      <div class="menu-title">Commandes</div>
      <div class="help">
        <b>Clavier / souris</b><br>
        <kbd>ZQSD</kbd>/<kbd>WASD</kbd> se déplacer · <kbd>Espace</kbd> sauter (double : voler en créatif) · <kbd>Maj</kbd> s'accroupir · <kbd>Ctrl</kbd> ou double <kbd>W</kbd> courir<br>
        <kbd>Clic gauche</kbd> miner / attaquer · <kbd>Clic droit</kbd> poser / utiliser · <kbd>Clic molette</kbd> choisir le bloc visé<br>
        <kbd>1-9</kbd> / molette barre d'action · <kbd>E</kbd> inventaire · <kbd>Q</kbd> jeter · <kbd>F</kbd> main secondaire<br>
        <kbd>T</kbd> discussion · <kbd>/</kbd> commande · <kbd>F1</kbd> masquer l'ATH · <kbd>F2</kbd> capture · <kbd>F3</kbd> débogage · <kbd>F5</kbd> vue · <kbd>C</kbd> zoom · <kbd>Échap</kbd> pause<br><br>
        <b>Tactile</b> : posez le pouce n'importe où dans la moitié gauche pour faire apparaître le joystick (à fond vers l'avant : courir, bouton » : course continue),
        glisser à droite pour regarder, toucher pour poser/utiliser, appui long pour miner/attaquer.<br>
        <b>Manette</b> : stick gauche se déplacer · stick droit regarder · <kbd>A</kbd> sauter (double : voler) · <kbd>B</kbd> s'accroupir · <kbd>RT</kbd> miner / attaquer ·
        <kbd>LT</kbd> poser / utiliser · <kbd>LB</kbd>/<kbd>RB</kbd> barre d'action · <kbd>Y</kbd> inventaire · <kbd>X</kbd> jeter · <kbd>L3</kbd> courir · <kbd>R3</kbd> choisir le bloc visé ·
        croix ↑ vue · croix ↓ main secondaire · <kbd>Menu</kbd> pause. Dans les menus : stick gauche = curseur, croix = élément suivant, <kbd>A</kbd> clic, <kbd>X</kbd> clic droit, <kbd>B</kbd> retour, <kbd>LB</kbd>/<kbd>RB</kbd> onglets.<br>
        Modes graphiques conseillés : <b>Mobile éco / Mobile / Mobile+</b> sur téléphone et tablette, <b>Manette / TV</b> pour jouer au canapé.<br><br>
        <b>Redstone</b> : la poudre (posée avec de la redstone) transporte le courant sur 15 blocs. Sources : levier, boutons, plaques de pression, torche de redstone,
        bloc de redstone, capteur de lumière du jour, observateur. Mécanismes : lampe, piston (pousse 12 blocs), piston collant (tire), porte, TNT, bloc musical, cloche.
        Le répéteur (clic droit : retard de 1 à 4) relance le signal à 15 et l'oriente ; la torche inverse le signal du bloc qui la porte.
        Un bloc plein touché par un levier, un bouton ou un répéteur alimente ses voisins.<br><br>
        <b>Commandes</b> : /gamemode survival|creative|spectator · /tp x y z · /time set day|night · /weather clear|rain|thunder ·
        /give &lt;objet&gt; [n] · /summon &lt;créature&gt; · /dimension overworld|nether|end · /locate village|outpost|temple|mineshaft|monument|stronghold|ancient_city (Nether : fortress|bastion) ·
        /effect &lt;effet&gt; · /xp n · /kill · /heal · /seed · /spawnpoint · /difficulty n · /clear · /boss dragon|wither|warden · /musique [stop]<br><br>
        <b>Musique</b> : la musique d'ambiance se lance seule (volume dans Options → Musique) ou avec /musique.
        <b>Juke-box</b> (8 planches + 1 diamant) : clic droit avec un disque pour l'écouter, encore un clic droit pour le reprendre.
        Les disques se trouvent dans les coffres des donjons, mines, temples et cités antiques, ou quand un squelette tue un creeper.
        <b>Bloc musical</b> (8 planches + 1 redstone) : clic droit pour changer la note (25 notes), clic gauche pour la jouer ;
        l'instrument dépend du bloc en dessous (bois : contrebasse, pierre : grosse caisse, sable : caisse claire, verre : charleston, or : cloche,
        argile : flûte, laine : guitare, os : xylophone, fer : vibraphone, foin : banjo, glowstone : piano électrique, émeraude : 8 bits, citrouille : didgeridoo, autre : harpe).<br><br>
        <b>Objectif</b> : survivre, construire un portail du Nether (obsidienne 4×5 + briquet), trouver des blazes, fabriquer des yeux de l'Ender,
        localiser le fort et vaincre le Dragon de l'Ender. Osez ensuite invoquer le Wither… ou réveiller le Warden dans les abîmes.
      </div>
      <button class="btn" id="hBack">Retour</button>`, this.game && this.game.running && !this.game.demo ? 'menu-bg dark' : 'menu-bg');
    this.on('hBack', () => { if (this.returnTo) this.returnTo(); else this.title(); });
  }

  // ------------------------------------------------------------- PAUSE
  pause() {
    const g = this.game;
    if (!g || !g.running || g.demo) return;
    g.paused = true;
    this.returnTo = () => this.pause();
    this.set('pause', `
      <div class="menu-title">Menu du jeu</div>
      <button class="btn" id="pResume">Reprendre la partie</button>
      <div class="btn-row"><button class="btn" id="pOpt">Options…</button><button class="btn" id="pHelp">Commandes</button></div>
      <button class="btn" id="pSave">Sauvegarder</button>
      <button class="btn" id="pQuit">Sauvegarder et quitter vers le titre</button>`, 'menu-bg dark');
    this.on('pResume', () => this.resume());
    this.on('pOpt', () => this.options());
    this.on('pHelp', () => this.help());
    this.on('pSave', async () => { await g.saveGame(); this.ui.toast('Partie sauvegardée'); });
    this.on('pQuit', () => this.ui.app.quitToTitle());
  }
  resume() {
    const g = this.game;
    this.close();
    if (g) { g.paused = false; if (!g.input.touch) g.input.requestLock(); }
  }

  death(src, score) {
    const g = this.game;
    const name = src && src.attacker ? (src.attacker.def ? src.attacker.def.name : src.attacker.mobType ? (MOB_DEFS[src.attacker.mobType] || {}).name : null) : null;
    const causes = {
      fall: 'est tombé de trop haut', lava: 'a essayé de nager dans la lave', fire: 'a brûlé vif', drown: 's\'est noyé', starve: 'est mort de faim',
      void: 'est tombé hors du monde', explosion: name ? `a été soufflé par ${name}` : 'a explosé', mob: `a été tué par ${name || 'une créature'}`,
      arrow: `a été abattu par ${name || 'une flèche'}`, magic: 'a été tué par magie', wither: 's\'est desséché', cactus: 'a été piqué à mort',
      sonic: 'a été anéanti par un cri sonique', fly_into_wall: 'a expérimenté l\'énergie cinétique', fireball: `a été carbonisé par ${name || 'une boule de feu'}`,
      lightning: 'a été foudroyé', thrown: `a été tué par ${name || 'un projectile'}`, kill: 's\'est retiré du monde', player: 'a été tué',
    };
    const hard = g.player.hardcore;
    this.set('death', `
      <div class="death-title">Vous êtes mort !</div>
      <div class="menu-title" style="font-size:24px">Joueur ${causes[src && src.type] || 'est mort'}</div>
      <div class="menu-title" style="font-size:22px">Score : <span style="color:#ffff55">${score}</span></div>
      ${hard ? '<button class="btn" id="dSpec">Observer le monde</button>' : '<button class="btn" id="dRespawn">Réapparaître</button>'}
      <button class="btn" id="dTitle">Écran titre</button>`, 'death-bg');
    this.on('dRespawn', async () => { this.close(); await g.respawn(); if (!g.input.touch) g.input.requestLock(); });
    this.on('dSpec', async () => { this.close(); await g.respawn(); g.player.setGamemode(3); if (!g.input.touch) g.input.requestLock(); });
    this.on('dTitle', () => this.ui.app.quitToTitle());
  }
}
function escape(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]); }
export { hashString };
