// Jeu : boucle principale, ticks, dimensions, temps, météo, caméra, rendu
import * as THREE from 'three';
import { HEIGHT, DIM, GAMEMODE, DAY_LENGTH, TICK_DT } from './constants.js';
import { BLOCKS, BLOCK as K, B_SOLID } from './blocks/blocks.js';
import { ITEMS, ITEM, ItemStack } from './items/items.js';
import { Pipeline } from './gfx/pipeline.js';
import { computeEnvironment } from './gfx/environment.js';
import { Particles } from './gfx/particles.js';
import { World, ckey } from './world/world.js';
import { GenManager } from './world/genManager.js';
import { decorateOverworld } from './world/gen/features.js';
import { decorateNether } from './world/gen/nether.js';
import { decorateEnd } from './world/gen/end.js';
import { BlockLogic } from './world/blockLogic.js';
import { Player } from './entity/player.js';
import { EntityManager } from './entity/manager.js';
import { setPipeline } from './entity/models.js';
import { ItemEntity, XPOrb, FallingBlock, PrimedTNT, Projectile, EndCrystal, Lightning } from './entity/objects.js';
import { createMob, naturalSpawn, PlayerModel, MOB_DEFS } from './entity/mobs.js';
import { Interaction } from './game/interact.js';
import { explode } from './game/explosion.js';
import { Portals } from './game/portals.js';
import { DragonFight } from './entity/bosses.js';
import { Hand } from './gfx/hand.js';
import { Audio } from './audio/audio.js';
import { Input } from './input.js';

export class Game {
  constructor(canvas, ui, settings, store) {
    this.canvas = canvas;
    this.ui = ui;
    this.settings = settings;
    this.store = store;
    this.blockDefs = BLOCKS;
    this.pipeline = new Pipeline(canvas, settings);
    setPipeline(this.pipeline);
    this.input = new Input(canvas);
    this.audio = new Audio(settings);
    this.particles = new Particles(this.pipeline, this);
    this.entities = new EntityManager(this);
    this.logic = new BlockLogic(this);
    this.interact = new Interaction(this);
    this.portals = new Portals(this);
    this.hand = new Hand(this);
    this.env = {};
    this.time = 1000;
    this.weather = { rain: 0, thunder: 0, targetRain: 0, targetThunder: 0, timer: 12000 + Math.random() * 24000, flash: 0 };
    this.running = false;
    this.paused = false;
    this.acc = 0;
    this.tickCount = 0;
    this.frameTime = 0;
    this.fps = 0; this.fpsAcc = 0; this.fpsN = 0;
    this.thirdPerson = 0;
    this.exposure = 1;
    this.world = null;
    this.dim = 0;
    this.meta = null;
    this.player = null;
    this.bossBars = new Map();
    this.camShake = 0;
    this.lastSave = 0;
    this.activeFurnaces = new Set();
    this.loading = false;
    this.dragon = null;
    this.mobDefs = MOB_DEFS;
    this.demo = false;
    window.addEventListener('resize', () => this.pipeline.resize());
  }

  // ------------------------------------------------------------ MONDES
  async startWorld(meta, isNew, demo = false) {
    this.meta = meta;
    this.seed = meta.seedNum;
    this.time = meta.time ?? 1000;
    this.weather.rain = this.weather.targetRain = demo ? 0 : (meta.rain || 0);
    this.weather.thunder = this.weather.targetThunder = 0;
    this.player = new Player(this);
    if (!this.playerModel) { this.playerModel = new PlayerModel(this); this.pipeline.entityScene.add(this.playerModel.root); }
    this.playerModel.root.visible = false;
    let dim = 0;
    if (meta.player) { this.player.fromJSON(meta.player); dim = meta.player.dim || 0; }
    else this.player.setGamemode(meta.gamemode || 0);
    if (meta.hardcore) this.player.hardcore = true;
    this.dragonKilled = !!meta.dragonKilled;
    this.demo = demo;
    await this.enterDimension(dim, meta.player ? [this.player.x, this.player.y, this.player.z] : null, isNew);
    this.running = true;
    this.paused = false;
    if (demo) { this.demoYaw = Math.random() * Math.PI * 2; this.demoH = null; this.ui.hideLoading(); return; }
    this.ui.onWorldStarted();
    if (isNew) this.giveStarterKit();
  }

  stopWorld() {
    this.running = false;
    this.paused = false;
    if (this.world) { if (!this.demo) this.saveAllChunks(); this.world.dispose(); this.world = null; }
    if (this.gen) { this.gen.dispose(); this.gen = null; }
    this.entities.clear();
    this.particles.clear();
    this.bossBars.clear();
    this.breathClouds = [];
    this.activeFurnaces.clear();
    this.dragon = null; this.dragonFight = null;
    this.thirdPerson = 0;
  }

  onChunkLit(c) {
    if (this.demo) { c.blockEntities.forEach((be, i) => { if (be.type === 'spawnMarker') c.blockEntities.delete(i); }); return; }
    for (const [i, be] of [...c.blockEntities]) {
      if (be.type !== 'spawnMarker') continue;
      c.blockEntities.delete(i);
      const x = c.cx * 16 + (i & 15) + 0.5, y = i >> 8, z = c.cz * 16 + ((i >> 4) & 15) + 0.5;
      const m = this.spawnMob(be.mob, x, y, z, { persistent: true, home: [x, y, z] });
      if (m) m.persistent = true;
    }
  }

  giveStarterKit() {
    const p = this.player;
    if (p.creative) {
      const kit = ['diamond_pickaxe', 'diamond_sword', 'oak_log', 'stone_bricks', 'glass', 'torch', 'water_bucket', 'tnt', 'flint_and_steel'];
      kit.forEach((k, i) => { p.inventory[i] = new ItemStack(k, ITEMS[ITEM[k]].stack === 1 ? 1 : 64); });
    }
    this.ui.refresh();
  }

  makeWorld(dim) {
    const gm = new GenManager(dim, this.seed);
    this.gen = gm;
    const pipe = this.pipeline;
    const decorate = dim === 0 ? (w, c) => decorateOverworld(w, c, gm.local) : dim === 1 ? (w, c) => decorateNether(w, c, gm.local) : (w, c) => decorateEnd(w, c, gm.local);
    const w = new World({
      dim, seed: this.seed, hasSky: dim === 0, generator: gm, logic: this.logic, decorate,
      sink: (c, sy, res) => pipe.setSection(c.sections[sy], res, c.cx * 16, sy * 16, c.cz * 16),
      unsink: (c) => { for (const s of c.sections) pipe.clearSection(s); },
      loadSaved: (cx, cz) => (this.meta.demo ? null : this.store.getChunk(cx, cz, 16 * 16 * HEIGHT)),
      saveChunk: this.meta.demo ? null : (c) => this.store.putChunk(this.meta.id, dim, c),
      onLit: (c) => this.onChunkLit(c),
    });
    return w;
  }

  async enterDimension(dim, pos, isNew) {
    this.loading = true;
    if (!this.demo) this.ui.showLoading('Génération du terrain…');
    if (this.world) { if (!this.demo) this.saveAllChunks(); this.world.dispose(); if (this.gen) this.gen.dispose(); }
    await this.store.flush();
    this.entities.clear();
    this.particles.clear();
    this.bossBars.clear();
    this.dragon = null;
    this.dim = dim;
    await this.store.preload(this.meta.id, dim);
    this.world = this.makeWorld(dim);
    const p = this.player;
    if (!pos) {
      if (dim === 0) pos = p.spawnPoint || this.meta.spawn || this.gen.local.findSpawn();
      else pos = this.gen.local.findSpawn();
    }
    p.setPos(pos[0], pos[1], pos[2]);
    p.vx = p.vy = p.vz = 0;
    const R = this.settings.renderDistance;
    this.world.setCenter(Math.floor(p.x) >> 4, Math.floor(p.z) >> 4, Math.min(R, 4));
    // attendre la génération autour du joueur
    const t0 = performance.now();
    await new Promise((resolve) => {
      const step = () => {
        this.world.update(40);
        // prêt quand les tronçons autour du joueur sont éclairés et maillés
        const pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4;
        let ready = true;
        for (let dx = -1; dx <= 1 && ready; dx++) for (let dz = -1; dz <= 1 && ready; dz++) {
          const c = this.world.getChunk(pcx + dx, pcz + dz);
          if (!c || c.state < 3 || !c.meshedOnce || c.sections.some((s) => s.dirty)) ready = false;
        }
        const prog = Math.min(1, (this.world.stats.lit) / 25);
        if (!this.demo) this.ui.showLoading('Génération du terrain…', prog);
        if (ready || performance.now() - t0 > 30000) resolve(); else setTimeout(step, 0);
      };
      step();
    });
    this.world.setCenter(Math.floor(p.x) >> 4, Math.floor(p.z) >> 4, R);
    // position de départ sûre
    if (this.pendingSafeSpawn !== false) this.ensureSafePosition(p, dim, isNew);
    if (dim === 2) this.dragon = new DragonFight(this);
    this.portals.onArrive(dim);
    this.loading = false;
    if (!this.demo) this.ui.hideLoading();
    this.audio.setDimension(dim);
  }

  ensureSafePosition(p, dim, isNew) {
    const w = this.world;
    const x = Math.floor(p.x), z = Math.floor(p.z);
    let y = Math.floor(p.y);
    const free = (yy) => !B_SOLID[w.getBlock(x, yy, z)] && !B_SOLID[w.getBlock(x, yy + 1, z)] && !BLOCKS[w.getBlock(x, yy, z)].fluid;
    if (dim === 0 && (isNew || !free(y))) {
      // colonne proche dont le sommet est un vrai sol (pas un arbre ni de l'eau)
      const ground = (xx, zz) => {
        const sy = w.getSurfaceY(xx, zz);
        if (sy < 1) return -1;
        const b = BLOCKS[w.getBlock(xx, sy, zz)];
        if (b.fluid || /leaves|log|wood/.test(b.key)) return -1;
        return sy;
      };
      let bx = x, bz = z, by = ground(x, z);
      for (let r = 1; r <= 24 && by < 0; r++) {
        for (let i = -r; i <= r && by < 0; i++) {
          for (const [cx, cz] of [[x + i, z - r], [x + i, z + r], [x - r, z + i], [x + r, z + i]]) {
            const gy = ground(cx, cz);
            if (gy >= 0) { bx = cx; bz = cz; by = gy; break; }
          }
        }
      }
      y = by >= 0 ? by + 1 : Math.max(w.getSurfaceY(x, z) + 1, 70);
      p.setPos(bx + 0.5, y, bz + 0.5);
      if (isNew) { this.meta.spawn = [bx + 0.5, y, bz + 0.5]; }
    } else if (!free(y)) {
      for (let yy = y; yy < HEIGHT - 2; yy++) if (free(yy) && B_SOLID[w.getBlock(x, yy - 1, z)]) { p.setPos(x + 0.5, yy, z + 0.5); return; }
    }
  }

  saveAllChunks() {
    if (!this.world) return;
    for (const c of this.world.chunks.values()) if (c.modified) { this.store.putChunk(this.meta.id, this.dim, c); c.modified = false; }
  }

  async saveGame() {
    if (!this.meta || !this.player) return;
    this.saveAllChunks();
    this.meta.time = this.time;
    this.meta.rain = this.weather.targetRain;
    this.meta.player = { ...this.player.toJSON(), dim: this.dim };
    this.meta.lastPlayed = Date.now();
    this.meta.dragonKilled = this.dragonKilled;
    await this.store.saveWorld(this.meta);
    await this.store.flush();
  }

  // ----------------------------------------------------------- AIDES
  skyFactor() { return this.dim === 0 ? Math.max(0.2, this.env.daylight ?? 1) * (1 - this.weather.rain * 0.3) : 0; }
  isNight() { const t = this.time % DAY_LENGTH; return t > 12542 && t < 23460; }

  breakBlock(x, y, z, drops = true, silent = false, tool = null) {
    const w = this.world;
    const id = w.getBlock(x, y, z);
    if (!id) return;
    const def = BLOCKS[id];
    const meta = w.getMeta(x, y, z);
    // conteneurs
    const be = w.getBlockEntity(x, y, z);
    if (be && be.items && drops) for (const it of be.items) if (it) this.dropItem(ItemStack.from(it), x + 0.5, y + 0.5, z + 0.5);
    if (be && be.type === 'furnace' && drops) for (const k of ['input', 'fuel', 'output']) if (be[k]) this.dropItem(ItemStack.from(be[k]), x + 0.5, y + 0.5, z + 0.5);
    w.setBlock(x, y, z, def.waterlogged ? K.water : 0, 0);
    // moitiés liées
    if (def.key === 'oak_door') { const oy = (meta & 8) ? y - 1 : y + 1; if (w.getBlock(x, oy, z) === id) w.setBlock(x, oy, z, 0); }
    if (def.tall && w.getBlock(x, y + 1, z) === K[def.key + '_top']) w.setBlock(x, y + 1, z, 0);
    if (def.tallTop && w.getBlock(x, y - 1, z) === K[def.tallTop]) { w.setBlock(x, y - 1, z, 0); if (drops) this.spawnDrops(BLOCKS[K[def.tallTop]], 0, x, y - 1, z, tool); drops = false; }
    if (def.key === 'red_bed') {
      const FV = [[0, 1], [-1, 0], [0, -1], [1, 0]][meta & 3]; const s = (meta & 8) ? -1 : 1;
      if (w.getBlock(x + FV[0] * s, y, z + FV[1] * s) === id) w.setBlock(x + FV[0] * s, y, z + FV[1] * s, 0);
    }
    if (!silent) { this.particles.blockBreak(x, y, z, id); this.audio.playBlock(id, 'break', x + 0.5, y + 0.5, z + 0.5); }
    if (drops) this.spawnDrops(def, meta, x, y, z, tool);
  }

  spawnDrops(def, meta, x, y, z, tool) {
    const rng = { next: Math.random, chance: (p) => Math.random() < p, range: (a, b) => a + Math.floor(Math.random() * (b - a + 1)), int: (n) => Math.floor(Math.random() * n) };
    let d = def.drops;
    let list = [];
    if (d === undefined) { if (def.item) list.push([def.key, 1]); }
    else if (d === null) list = [];
    else if (typeof d === 'string') list.push([d, 1]);
    else if (typeof d === 'function') {
      for (const e of d(rng, tool && tool.def ? tool.def.tool : null, meta) || []) list.push(Array.isArray(e) ? [e[0], e[1] ?? 1] : [e, 1]);
    } else if (Array.isArray(d)) for (const e of d) list.push([e[0], e[2] ? rng.range(e[1], e[2]) : e[1]]);
    if (def.crop && meta >= def.crop.stages - 1) {
      list = [[def.crop.product, def.key === 'wheat' ? 1 : 2 + rng.int(3)]];
      if (def.key === 'wheat') list.push(['wheat_seeds', 1 + rng.int(3)]);
    } else if (def.crop) list = [[def.crop.seed, 1]];
    if (def.key === 'sweet_berry_bush') list = meta >= 2 ? [['sweet_berries', 1 + rng.int(meta)]] : [];
    for (const [k, n] of list) if (n > 0 && ITEM[k] !== undefined) this.dropItem(new ItemStack(ITEM[k], n), x + 0.5, y + 0.4, z + 0.5);
    if (def.xp) this.spawnXP(x + 0.5, y + 0.5, z + 0.5, Math.floor(Math.random() * (def.xp + 1)));
  }

  dropItem(stack, x, y, z, throwDir = null, delay = 10) {
    if (!stack || stack.count <= 0) return null;
    const e = new ItemEntity(this, stack, x, y, z);
    if (throwDir) { e.vx = throwDir[0] * 0.3; e.vy = throwDir[1] * 0.3 + 0.1; e.vz = throwDir[2] * 0.3; e.pickupDelay = 40; }
    else { e.vx = (Math.random() - 0.5) * 0.2; e.vy = 0.2; e.vz = (Math.random() - 0.5) * 0.2; e.pickupDelay = delay; }
    this.entities.add(e);
    return e;
  }
  spawnXP(x, y, z, total) {
    while (total > 0) {
      const v = total >= 37 ? 37 : total >= 17 ? 17 : total >= 7 ? 7 : total >= 3 ? 3 : 1;
      total -= v;
      this.entities.add(new XPOrb(this, v, x, y, z));
    }
  }
  spawnFallingBlock(x, y, z, id, meta) { this.entities.add(new FallingBlock(this, id, meta, x, y, z)); }
  primeTnt(x, y, z, fuse = 80) { this.entities.add(new PrimedTNT(this, x, y, z, fuse)); }
  spawnMob(type, x, y, z, opts = {}) {
    const m = createMob(this, type, opts);
    if (!m) return null;
    m.setPos(x, y, z);
    m.yaw = opts.yaw ?? Math.random() * Math.PI * 2;
    this.entities.add(m);
    return m;
  }
  shoot(kind, shooter, x, y, z, dir, speed, opts = {}) {
    const p = new Projectile(this, kind, shooter, x, y, z, dir[0] * speed, dir[1] * speed, dir[2] * speed);
    Object.assign(p, opts);
    this.entities.add(p);
    return p;
  }
  explode(x, y, z, power, opts = {}) { explode(this, x, y, z, power, opts); }
  lightning(x, z) {
    const y = this.world.getSurfaceY(Math.floor(x), Math.floor(z)) + 1;
    this.entities.add(new Lightning(this, x, y, z));
    this.weather.flash = 1;
    setTimeout(() => this.audio.play('thunder', x, y, z), 200 + Math.random() * 1500);
  }
  spawnBreathCloud(x, y, z) {
    this.breathClouds = this.breathClouds || [];
    this.breathClouds.push({ x, y, z, ticks: 200 });
  }
  spawnCrystal(x, y, z) { const c = new EndCrystal(this, x, y, z); this.entities.add(c); return c; }
  chorusTeleport(p) {
    for (let i = 0; i < 16; i++) {
      const x = p.x + (Math.random() - 0.5) * 16, z = p.z + (Math.random() - 0.5) * 16;
      const y = Math.min(HEIGHT - 2, Math.max(1, p.y + Math.floor((Math.random() - 0.5) * 16)));
      for (let yy = y; yy > 0; yy--) {
        if (B_SOLID[this.world.getBlock(Math.floor(x), yy - 1, Math.floor(z))] && !B_SOLID[this.world.getBlock(Math.floor(x), yy, Math.floor(z))] && !B_SOLID[this.world.getBlock(Math.floor(x), yy + 1, Math.floor(z))]) {
          this.particles.portal(p.x, p.y + 1, p.z, 20);
          p.setPos(Math.floor(x) + 0.5, yy, Math.floor(z) + 0.5);
          this.audio.play('teleport', p.x, p.y, p.z);
          return;
        }
      }
    }
  }

  // --------------------------------------------------------------- BOUCLE
  start() {
    let last = performance.now();
    const loop = (now) => {
      requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      try { this.frame(dt, now); } catch (e) { console.error(e); if (!this.errShown) { this.errShown = true; this.ui.toast('Erreur : ' + e.message); } }
    };
    requestAnimationFrame(loop);
  }

  frame(dt, now) {
    this.fpsAcc += dt; this.fpsN++;
    if (this.fpsAcc > 0.5) { this.fps = Math.round(this.fpsN / this.fpsAcc); this.fpsAcc = 0; this.fpsN = 0; }
    const inp = this.input;
    if (!this.running || !this.world) { this.ui.menuFrame && this.ui.menuFrame(dt); inp.endFrame(); return; }
    if (this.demo) { this.demoFrame(dt); inp.endFrame(); return; }
    const p = this.player;
    const playing = !this.paused && !this.loading && !this.ui.isScreenOpen();
    // regard
    if (playing && !p.dead && !p.sleeping) {
      const sens = 0.0022 * this.settings.sensitivity;
      p.yaw -= inp.mouseDX * sens;
      p.pitch -= inp.mouseDY * sens * (this.settings.invertY ? -1 : 1);
      p.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, p.pitch));
    }
    if (playing) this.interact.handleFrameInput(dt);
    // ticks fixes
    if (!this.paused && !this.loading) {
      this.acc += dt;
      let n = 0;
      while (this.acc >= TICK_DT && n < 5) { this.tick(); this.acc -= TICK_DT; n++; }
      if (n === 5) this.acc = 0;
    }
    const alpha = this.acc / TICK_DT;
    // chargement des chunks
    const pcx = Math.floor(p.x) >> 4, pcz = Math.floor(p.z) >> 4;
    this.world.setCenter(pcx, pcz, this.settings.renderDistance, Math.max(0, Math.min(7, Math.floor(p.y) >> 4)));
    this.world.update(this.settings.chunkBudget || 7);
    this.updateCamera(alpha, dt);
    this.interact.updateTarget();
    this.entities.render(alpha, this.pipeline.camera);
    this.updatePlayerModel(alpha);
    this.particles.update(this.paused ? 0 : dt);
    this.ambientParticles(dt);
    this.updateEnvironment(dt, alpha);
    this.hand.update(dt, alpha);
    this.pipeline.render({
      dim: this.dim, shadowLight: this.env.shadowLight, shadowCenter: new THREE.Vector3(p.x, p.y + 1, p.z),
      showHand: this.thirdPerson === 0 && !p.spectator && this.settings.showHud !== false,
    });
    this.ui.update(dt);
    this.audio.update(this, dt);
    inp.endFrame();
    // sauvegarde automatique
    if (now - this.lastSave > 45000) { this.lastSave = now; this.saveGame(); }
  }

  demoFrame(dt) {
    const p = this.player, cam = this.pipeline.camera;
    this.demoYaw += dt * 0.04;
    this.time += dt * 20;
    const w = this.world;
    w.setCenter(Math.floor(p.x) >> 4, Math.floor(p.z) >> 4, Math.min(6, this.settings.renderDistance), 4);
    w.update(10);
    // hauteur : au-dessus des arbres et collines environnants, lissée
    let ground = 62;
    for (let dx = -9; dx <= 9; dx += 3) for (let dz = -9; dz <= 9; dz += 3) ground = Math.max(ground, w.getSurfaceY(Math.floor(p.x) + dx, Math.floor(p.z) + dz));
    const target = ground + 7;
    this.demoH = this.demoH == null ? target : this.demoH + (target - this.demoH) * Math.min(1, dt * 0.8);
    cam.position.set(p.x, this.demoH, p.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(-0.12, this.demoYaw, 0);
    cam.fov = 75; cam.far = 600; cam.updateProjectionMatrix();
    this.particles.update(dt);
    this.updateEnvironment(dt, 0);
    this.pipeline.finalU.uExposure.value = 1.0;
    this.pipeline.render({ dim: this.dim, shadowLight: this.env.shadowLight, shadowCenter: cam.position.clone(), showHand: false });
  }

  tick() {
    const p = this.player, w = this.world;
    this.tickCount++;
    this.time += 1;
    if (p.sleeping) { this.time += 99; if (this.time % DAY_LENGTH < 1000 || this.time % DAY_LENGTH > 23000) this.wakeUp(true); }
    this.tickWeather();
    this.interact.pollTickInput();
    if (!p.dead) {
      p.tick();
      this.interact.tick();
      this.portals.tickPlayer(p);
    } else { p.deathTime++; }
    w.runTicks();
    w.randomTicks(Math.floor(p.x), Math.floor(p.z), 4, 3);
    this.entities.tick();
    this.tickFurnaces();
    this.tickSpawners();
    if (this.tickCount % 20 === 0) naturalSpawn(this);
    if (this.dragon) this.dragon.tick();
    this.tickBreath();
    // déchets et vide
    if (this.tickCount % 100 === 0) this.ui.refresh();
  }

  wakeUp(morning) {
    const p = this.player;
    p.sleeping = false;
    p.h = 1.8;
    if (morning) { this.time = Math.ceil(this.time / DAY_LENGTH) * DAY_LENGTH + 0; this.weather.targetRain = 0; this.weather.targetThunder = 0; this.weather.rain = 0; this.weather.thunder = 0; this.ui.toast('Bonjour ! Vous avez dormi jusqu\'au matin.'); }
    if (p.bedPos) p.setPos(p.bedPos[0] + 0.5, p.bedPos[1] + 0.6, p.bedPos[2] + 0.5);
  }

  tickWeather() {
    const W = this.weather;
    if (this.dim !== 0) { W.rain = 0; W.thunder = 0; return; }
    W.timer--;
    if (W.timer <= 0) {
      if (W.targetRain > 0) { W.targetRain = 0; W.targetThunder = 0; W.timer = 12000 + Math.random() * 168000; }
      else { W.targetRain = 1; W.targetThunder = Math.random() < 0.25 ? 1 : 0; W.timer = 12000 + Math.random() * 12000; }
    }
    W.rain += Math.sign(W.targetRain - W.rain) * Math.min(0.01, Math.abs(W.targetRain - W.rain));
    W.thunder += Math.sign(W.targetThunder - W.thunder) * Math.min(0.01, Math.abs(W.targetThunder - W.thunder));
    if (W.flash > 0) W.flash = Math.max(0, W.flash - 0.15);
    if (W.thunder > 0.5 && Math.random() < 1 / 1600) {
      const p = this.player;
      this.lightning(p.x + (Math.random() - 0.5) * 120, p.z + (Math.random() - 0.5) * 120);
    }
  }

  tickFurnaces() {
    for (const key of [...this.activeFurnaces]) {
      const [x, y, z] = key.split(',').map(Number);
      const be = this.world.getBlockEntity(x, y, z);
      if (!be || be.type !== 'furnace') { this.activeFurnaces.delete(key); continue; }
      this.interact.furnaceTick(be, x, y, z, key);
    }
  }

  tickSpawners() {
    if (this.tickCount % 20 !== 0) return;
    const p = this.player;
    for (const c of this.world.chunks.values()) {
      if (!c.blockEntities.size) continue;
      for (const [i, be] of c.blockEntities) {
        if (be.type !== 'spawner') continue;
        const x = c.cx * 16 + (i & 15), y = i >> 8, z = c.cz * 16 + ((i >> 4) & 15);
        if (Math.hypot(p.x - x, p.y - y, p.z - z) > 16) continue;
        be.delay = (be.delay ?? 200) - 20;
        if (Math.random() < 0.3) this.particles.flame(x + Math.random(), y + Math.random(), z + Math.random());
        if (be.delay > 0) continue;
        be.delay = 200 + Math.floor(Math.random() * 600);
        const near = this.entities.list.filter((e) => e.mobType === be.mob && Math.abs(e.x - x) < 8 && Math.abs(e.z - z) < 8).length;
        if (near >= 6) continue;
        for (let n = 0; n < 4; n++) {
          const sx = x + Math.floor((Math.random() - 0.5) * 8) + 0.5, sz = z + Math.floor((Math.random() - 0.5) * 8) + 0.5, sy = y + Math.floor(Math.random() * 3) - 1;
          if (B_SOLID[this.world.getBlock(Math.floor(sx), sy, Math.floor(sz))] || B_SOLID[this.world.getBlock(Math.floor(sx), sy + 1, Math.floor(sz))]) continue;
          if (!B_SOLID[this.world.getBlock(Math.floor(sx), sy - 1, Math.floor(sz))]) continue;
          this.spawnMob(be.mob, sx, sy, sz);
          this.particles.bigSmoke(sx, sy + 0.5, sz);
        }
      }
    }
  }

  tickBreath() {
    if (!this.breathClouds) return;
    const p = this.player;
    for (const c of this.breathClouds) {
      c.ticks--;
      this.particles.breath(c.x, c.y, c.z, 2);
      if (Math.hypot(p.x - c.x, p.z - c.z) < 3 && Math.abs(p.y - c.y) < 2 && this.tickCount % 10 === 0) p.damage(3, { type: 'magic' });
    }
    this.breathClouds = this.breathClouds.filter((c) => c.ticks > 0);
  }

  ambientParticles(dt) {
    if (this.paused || !this.settings.particles) return;
    const p = this.player, w = this.world;
    const px = Math.floor(p.x), py = Math.floor(p.y), pz = Math.floor(p.z);
    // particules d'ambiance autour du joueur (torches, lave, portails, gouttes)
    for (let i = 0; i < 60; i++) {
      const x = px + Math.floor((Math.random() - 0.5) * 24), y = py + Math.floor((Math.random() - 0.5) * 16), z = pz + Math.floor((Math.random() - 0.5) * 24);
      const id = w.getBlock(x, y, z);
      if (!id) continue;
      if (id === K.torch || id === K.soul_torch) {
        const m = w.getMeta(x, y, z) & 7;
        let ox = 0.5, oy = 0.7, oz = 0.5;
        if (m) { const f = [[0, 1], [-1, 0], [0, -1], [1, 0]][(m - 1) & 3]; ox -= f[0] * 0.27; oz -= f[1] * 0.27; oy = 0.92; }
        if (Math.random() < 0.5) this.particles.torch(x + ox, y + oy, z + oz, id === K.soul_torch);
      } else if (id === K.lava && w.getBlock(x, y + 1, z) === 0 && Math.random() < 0.02) this.particles.lavaPop(x + Math.random(), y + 1, z + Math.random());
      else if (id === K.nether_portal && Math.random() < 0.3) this.particles.portal(x + 0.5, y + 0.5, z + 0.5, 1);
      else if (id === K.campfire && Math.random() < 0.2) this.particles.bigSmoke(x + 0.5, y + 0.8, z + 0.5);
      else if (id === K.cherry_leaves && w.getBlock(x, y - 1, z) === 0 && Math.random() < 0.05) this.particles.petal(x + Math.random(), y - 0.1, z + Math.random());
      else if ((id === K.fire || id === K.soul_fire) && Math.random() < 0.4) this.particles.smoke(x + Math.random(), y + 0.8, z + Math.random(), 0.6);
      else if (id === K.sculk_catalyst && Math.random() < 0.05) this.particles.soul(x + 0.5, y + 1.1, z + 0.5);
      else if (id === K.end_rod && Math.random() < 0.2) this.particles.sparkle(x + 0.5, y + 0.8, z + 0.5, 1, 1, 1);
      else if (B_SOLID[id] && w.getBlock(x, y - 1, z) === 0 && Math.random() < 0.004) {
        const above = w.getBlock(x, y + 1, z);
        if (above === K.water) this.particles.drip(x + Math.random(), y - 0.05, z + Math.random(), false);
        else if (above === K.lava) this.particles.drip(x + Math.random(), y - 0.05, z + Math.random(), true);
      }
    }
    // pluie / neige
    const W = this.weather;
    if (this.dim === 0 && W.rain > 0.05) {
      const n = Math.floor(W.rain * 120 * dt * 20 * (this.settings.particles === 2 ? 1 : 0.5));
      for (let i = 0; i < n; i++) {
        const x = p.x + (Math.random() - 0.5) * 36, z = p.z + (Math.random() - 0.5) * 36;
        const top = w.getHeight(Math.floor(x), Math.floor(z));
        const y = Math.max(top, p.y + 12 + Math.random() * 8);
        if (top > p.y + 20) continue;
        const bio = w.getBiome(Math.floor(x), Math.floor(z));
        const b = this.ui.biomes[bio];
        if (b && b.dry) continue;
        const snow = b && (b.snow || (top > 105));
        this.particles.rain(x, y, z, snow);
      }
    }
  }

  // ---------------------------------------------------------- CAMÉRA
  updateCamera(alpha, dt) {
    const p = this.player, cam = this.pipeline.camera;
    const [x, y, z] = p.lerp(alpha);
    const eye = p.sleeping ? 0.3 : p.eyeHeight;
    this.eyeSmooth = this.eyeSmooth === undefined ? eye : this.eyeSmooth + (eye - this.eyeSmooth) * Math.min(1, dt * 12);
    let cy = y + this.eyeSmooth;
    let bobX = 0, bobY = 0, roll = 0;
    if (this.settings.viewBob && this.thirdPerson === 0 && !p.flying) {
      const wd = p.pwalkDist + (p.walkDist - p.pwalkDist) * alpha;
      const b = p.pbob + (p.bob - p.pbob) * alpha;
      bobX = Math.sin(wd * Math.PI * 0.6) * b * 0.5;
      bobY = -Math.abs(Math.cos(wd * Math.PI * 0.6) * b);
      roll = Math.sin(wd * Math.PI * 0.6) * b * 0.05;
    }
    // secousse de dégâts
    if (p.hurtTime > 0) roll += Math.sin((p.hurtTime - alpha) / 10 * Math.PI) * 0.12;
    if (this.camShake > 0) { this.camShake = Math.max(0, this.camShake - dt * 2); bobX += (Math.random() - 0.5) * this.camShake * 0.3; bobY += (Math.random() - 0.5) * this.camShake * 0.3; }
    cam.rotation.order = 'YXZ';
    const yaw = p.yaw, pitch = p.pitch;
    cam.rotation.set(pitch, yaw, roll);
    const right = [Math.cos(yaw), -Math.sin(yaw)];
    cam.position.set(x + right[0] * bobX, cy + bobY, z + right[1] * bobX);
    if (this.thirdPerson) {
      const d = this.thirdPerson === 1 ? 4 : -4;
      const ld = p.lookDir();
      let dist = Math.abs(d);
      // éviter de traverser les murs
      for (let t = 0.3; t <= dist; t += 0.2) {
        const tx = cam.position.x - ld[0] * t * Math.sign(d), ty = cam.position.y - ld[1] * t * Math.sign(d), tz = cam.position.z - ld[2] * t * Math.sign(d);
        if (B_SOLID[this.world.getBlock(Math.floor(tx), Math.floor(ty), Math.floor(tz))]) { dist = Math.max(0.3, t - 0.3); break; }
      }
      cam.position.set(cam.position.x - ld[0] * dist * Math.sign(d), cam.position.y - ld[1] * dist * Math.sign(d), cam.position.z - ld[2] * dist * Math.sign(d));
      if (d < 0) cam.rotation.set(-pitch, yaw + Math.PI, 0);
    }
    // FOV dynamique
    let fov = this.settings.fov;
    if (p.sprinting) fov *= 1.12;
    if (p.flying && p.sprinting) fov *= 1.05;
    if (p.using && p.using.bow) fov *= 1 - Math.min(1, p.useTicks / 20) * 0.15;
    if (this.zoom) fov = 18;
    this.fovSmooth = this.fovSmooth === undefined ? fov : this.fovSmooth + (fov - this.fovSmooth) * Math.min(1, dt * 10);
    cam.fov = this.fovSmooth;
    cam.far = Math.max(200, this.settings.renderDistance * 16 * 1.6 + 64);
    cam.updateProjectionMatrix();
    this.pipeline.handCamera.fov = 70; this.pipeline.handCamera.updateProjectionMatrix();
    this.particles.setScale(this.pipeline.height, cam.fov);
  }

  updatePlayerModel(alpha) {
    const pm = this.playerModel;
    pm.root.visible = this.thirdPerson !== 0 && !this.player.spectator;
    if (pm.root.visible) pm.update(this.player, alpha);
  }

  // ------------------------------------------------------- ENVIRONNEMENT
  updateEnvironment(dt, alpha) {
    const P = this.pipeline, U = P.U, W = this.weather;
    const t = this.time + alpha;
    computeEnvironment(t, this.dim, W.rain, W.thunder, W.flash, this.env);
    const e = this.env;
    U.uTime.value = performance.now() / 1000 % 10000;
    U.uSunDir.value.set(e.lightDir[0], e.lightDir[1], e.lightDir[2]).normalize();
    U.uSunColor.value.set(...e.sunColor);
    U.uSkyAmbient.value.set(...e.ambient);
    U.uMinLight.value = e.minLight;
    U.uWet.value = this.dim === 0 ? W.rain : 0;
    U.uDim.value = this.dim;
    U.uFlicker.value = Math.sin(U.uTime.value * 9.3) * 0.5 + Math.sin(U.uTime.value * 23.1) * 0.5;
    U.uCloudCover.value = 0.25 + W.rain * 0.7;
    U.uWind.value.set(U.uTime.value * 0.004, U.uTime.value * 0.0015);
    U.uWindStrength.value = 1 + W.rain * 1.5 + W.thunder;
    P.skyU.uSun.value.set(...e.sun); P.skyU.uMoon.value.set(...e.moon);
    P.skyU.uStars.value = e.stars; P.skyU.uRain.value = W.rain; P.skyU.uMoonPhase.value = e.moonPhase;
    P.skyU.uClouds.value = this.settings.clouds ? 1 : 0;
    P.lutU.uSun.value.set(...e.sun); P.lutU.uMoon.value.set(...e.moon); P.lutU.uRain.value = W.rain;
    P.lutU.uSunIntensity.value = e.sunIntensity || 22;
    const C = P.compU;
    const R = this.settings.renderDistance * 16;
    C.uFogDist.value = R;
    C.uFogDensity.value = this.dim === 1 ? 0.035 : this.dim === 2 ? 0.006 : 0.0016;
    C.uFogColor.value.set(...e.fog);
    const p = this.player;
    C.uUnderwater.value = p.eyeInWater ? 1 : 0;
    C.uUnderLava.value = p.eyeInLava ? 1 : 0;
    const bio = this.world.getBiome(Math.floor(p.x), Math.floor(p.z));
    const b = this.ui.biomes[bio];
    if (b) C.uWaterColor.value.set(b.water[0] / 255 * 0.5, b.water[1] / 255 * 0.7, b.water[2] / 255 * 0.8);
    C.uBlindness.value = p.effects.blindness || p.effects.darkness ? 1 : 0;
    // exposition automatique (adaptation de l'œil)
    const l = this.world.getLight(Math.floor(p.x), Math.floor(p.y + p.eyeHeight), Math.floor(p.z));
    const sky = (l >> 4) / 15, blk = (l & 15) / 15;
    const lum = Math.max(sky * sky * (this.dim === 0 ? Math.max(0.05, e.daylight) : 0.25), blk * blk * 0.5, 0.02);
    const target = Math.min(3.0, Math.max(0.75, 0.55 / Math.pow(lum, 0.55))) * (e.exposureBias || 1) * (this.settings.brightness || 1);
    this.exposure += (target - this.exposure) * Math.min(1, dt * 1.2);
    const F = P.finalU;
    F.uExposure.value = this.exposure * 0.95;
    F.uUnderwater.value = p.eyeInWater ? 1 : 0;
    F.uHurt.value = Math.max(0, p.hurtTime / 10) * 0.6 + (p.health <= 4 && !p.creative ? 0.25 + 0.1 * Math.sin(U.uTime.value * 4) : 0);
    F.uPortal.value = Math.min(1, (p.portalTicks || 0) / 60);
    F.uDarkness.value = p.effects.darkness ? 0.5 + 0.5 * Math.sin(U.uTime.value * 2) * 0.5 : 0;
    F.uFreeze.value = p.freeze || 0;
  }

  // -------------------------------------------------------- ÉVÉNEMENTS
  onPlayerDeath(src) {
    const p = this.player;
    this.ui.showDeath(src, p.score);
    if (!p.creative && !this.settings.keepInventory) {
      for (let i = 0; i < 36; i++) if (p.inventory[i]) { this.dropItem(p.inventory[i], p.x, p.y + 1, p.z); p.inventory[i] = null; }
      for (let i = 0; i < 4; i++) if (p.armor[i]) { this.dropItem(p.armor[i], p.x, p.y + 1, p.z); p.armor[i] = null; }
      if (p.offhand) { this.dropItem(p.offhand, p.x, p.y + 1, p.z); p.offhand = null; }
      this.spawnXP(p.x, p.y + 1, p.z, Math.min(100, p.xpLevel * 7));
      p.xpLevel = 0; p.xpProgress = 0;
    }
  }
  async respawn() {
    const p = this.player;
    if (this.dim !== 0) {
      p.respawn([0, 0, 0]);
      await this.enterDimension(0, p.spawnPoint || this.meta.spawn);
    } else {
      const sp = p.spawnPoint || this.meta.spawn || this.gen.local.findSpawn();
      p.respawn(sp);
      this.ensureSafePosition(p, 0, false);
    }
    this.ui.refresh();
  }
  onPlayerHurt(amount, src) {
    this.camShake = Math.min(1, this.camShake + amount * 0.05);
    if (src && src.attacker && src.attacker.x !== undefined) {
      const dx = this.player.x - src.attacker.x, dz = this.player.z - src.attacker.z;
      this.player.knockback(dx, dz, src.knock ?? 0.4);
    }
  }
  onTotem(p) { this.ui.toast('Le totem d\'immortalité vous a sauvé !'); for (let i = 0; i < 40; i++) this.particles.sparkle(p.x + (Math.random() - 0.5) * 2, p.y + Math.random() * 2, p.z + (Math.random() - 0.5) * 2, 0.9, 0.9, 0.2); this.audio.play('totem'); }
  onPlayerStep(p) {
    // vibrations pour le Warden / capteurs sculk
    this.vibration(p.x, p.y, p.z, p.sneaking ? 0 : 1, p);
  }
  vibration(x, y, z, strength, src) {
    if (!strength) return;
    for (const e of this.entities.list) if (e.onVibration && !e.dead) e.onVibration(x, y, z, strength, src);
    this.interact.sculkVibration(x, y, z, src);
  }
}
