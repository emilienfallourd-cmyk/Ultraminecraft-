// Interaction joueur-monde : visée, minage, pose, utilisation d'objets, combat, fourneaux
import * as THREE from 'three';
import { BLOCKS, BLOCK as K, B_SOLID, B_FLUID, getSelectionBoxes, getBoxes, FACING_FACE } from '../blocks/blocks.js';
import { ITEMS, ITEM, ItemStack, breakTicks, canHarvestBlock, maxStack } from '../items/items.js';
import { SMELT, fuelValue } from '../items/recipes.js';
import { raycast, rayBox } from '../entity/physics.js';
import { tileIndex } from '../gfx/textures.js';
import { GAMEMODE, DAY_LENGTH } from '../constants.js';
import { OPP6 } from '../world/redstone.js';
import { vibrate } from '../touch.js';

const DIR = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const FACE_TO_FACING = { 0: 3, 1: 1, 4: 0, 5: 2 }; // face horizontale -> facing
const SOIL = new Set([K.grass_block, K.dirt, K.podzol, K.coarse_dirt, K.farmland, K.mud, K.moss_block, K.mycelium, K.snowy_grass_block]);

export class Interaction {
  constructor(game) {
    this.game = game;
    this.target = null;
    this.targetEntity = null;
    this.mining = null;
    this.placeCooldown = 0;
    this.attackHeld = false;
    this.useHeld = false;
    this.creativeBreakCd = 0;
    // contour de sélection
    const mat = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthTest: true });
    this.outline = new THREE.LineSegments(new THREE.BufferGeometry(), mat);
    this.outline.visible = false;
    this.outline.frustumCulled = false;
    this.outline.renderOrder = 5;
    game.pipeline.entityScene.add(this.outline);
    // fissures
    const crackMat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `precision highp sampler2DArray; uniform sampler2DArray uAlbedo; uniform float uTile; varying vec2 vUv;
        void main(){ float a = texture(uAlbedo, vec3(vUv, uTile)).a; if (a < 0.3) discard; gl_FragColor = vec4(vec3(0.35), 1.0); }`,
      uniforms: { uAlbedo: game.pipeline.U.uAlbedo, uTile: { value: 0 } },
      transparent: true, blending: THREE.CustomBlending, blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1.004, 1.004, 1.004), crackMat);
    this.crack.visible = false;
    this.crack.renderOrder = 6;
    game.pipeline.entityScene.add(this.crack);
    this.lastOutlineKey = '';
  }

  get player() { return this.game.player; }
  get world() { return this.game.world; }

  // ---------------------------------------------------------- ENTRÉES
  pollTickInput() {
    const inp = this.game.input, p = this.player, ui = this.game.ui;
    const blocked = ui.isScreenOpen() || this.game.paused || p.dead || p.sleeping;
    const I = p.input;
    if (blocked) { I.strafe = 0; I.forward = 0; I.jump = false; I.sneak = false; I.sprint = false; I.doubleJump = false; I.jumpPressed = false; return; }
    I.strafe = (inp.down('KeyD') ? 1 : 0) - (inp.down('KeyA') ? 1 : 0) + inp.move.x + inp.padMove.x;
    I.forward = (inp.down('KeyW') ? 1 : 0) - (inp.down('KeyS') ? 1 : 0) + inp.move.y + inp.padMove.y;
    I.strafe = Math.max(-1, Math.min(1, I.strafe)); I.forward = Math.max(-1, Math.min(1, I.forward));
    I.jump = inp.down('Space');
    I.sneak = inp.down('ShiftLeft') || inp.down('ShiftRight');
    if ((inp.down('ControlLeft') || inp.virtual.has('Sprint') || this.sprintLatch) && I.forward > 0) I.sprint = true;
    else if (I.forward <= 0) I.sprint = false;
    if (I.forward <= 0) this.sprintLatch = false;
    I.doubleJump = this.doubleJumpLatch || false; this.doubleJumpLatch = false;
    I.jumpPressed = this.jumpLatch || false; this.jumpLatch = false;
    this.attackHeld = !!(inp.buttons & 1) || inp.virtual.has('TouchAttack');
    this.useHeld = !!(inp.buttons & 4) || inp.virtual.has('TouchUse');
  }

  handleFrameInput() {
    const g = this.game, inp = g.input, p = this.player;
    if (inp.doubleSpace) this.doubleJumpLatch = true;
    if (inp.wasPressed('Space')) this.jumpLatch = true;
    if (inp.doubleW) this.sprintLatch = true;
    for (let i = 1; i <= 9; i++) if (inp.wasPressed('Digit' + i)) { p.selected = i - 1; g.ui.onHotbarChange(); }
    if (inp.wheel) { p.selected = ((p.selected + inp.wheel) % 9 + 9) % 9; g.ui.onHotbarChange(); }
    if (p.dead) return;
    if (inp.wasPressed('KeyQ')) this.dropHeld(inp.down('ControlLeft'));
    if (inp.wasPressed('KeyF')) { const t = p.offhand; p.offhand = p.held; p.held = t; g.ui.refresh(); }
    if (inp.wasPressed('F5')) g.thirdPerson = (g.thirdPerson + 1) % 3;
    g.zoom = inp.down('KeyC');
    // toucher : viser exactement sous le doigt avant d'agir
    if (inp.touchAim && inp.clicks.length) this.updateTarget();
    for (const b of inp.clicks) {
      if (b === 0) this.onAttackClick();
      else if (b === 2) this.onUseClick();
      else if (b === 1) this.pickBlock();
      else if (b === 3) this.onTouchTap();
    }
    if (inp.wasPressed('TouchAttack')) this.onAttackClick();
    if (inp.wasPressed('TouchUse')) this.onUseClick();
  }

  // ------------------------------------------------------------ VISÉE
  updateTarget() {
    const g = this.game, p = this.player, cam = g.pipeline.camera;
    if (p.dead || p.spectator || g.ui.isScreenOpen()) { this.target = null; this.targetEntity = null; this.outline.visible = false; this.crack.visible = false; return; }
    const reach = p.creative ? 5 : 4.5;
    const ex = p.x, ey = p.y + (g.eyeSmooth ?? p.eyeHeight), ez = p.z;
    let ld = p.lookDir();
    // écran tactile, visée « au doigt » (comme Minecraft) : on vise ce qui est sous le doigt
    const inp = g.input;
    if (inp.touch && !inp.locked && !inp.padActive && g.settings.touchAim !== 'cross') {
      if (!inp.touchAim) { this.target = null; this.targetEntity = null; this.outline.visible = false; this.crack.visible = false; return; }
      ld = this.screenRay(inp.touchAim.x, inp.touchAim.y);
    }
    this.target = raycast(this.world, ex, ey, ez, ld[0], ld[1], ld[2], reach, { selection: getSelectionBoxes });
    // entités
    this.targetEntity = null;
    let best = this.target ? this.target.dist : (p.creative ? 5 : 3);
    best = Math.min(best, p.creative ? 5 : 3);
    for (const e of g.entities.near(ex, ey, ez, 8)) {
      if (!e.hittable || e.dead || e.removed) continue;
      const parts = e.hitBoxes ? e.hitBoxes() : [[e.x - e.w / 2, e.y, e.z - e.w / 2, e.x + e.w / 2, e.y + e.h, e.z + e.w / 2]];
      for (const b of parts) {
        const r = rayBox(ex, ey, ez, ld[0], ld[1], ld[2], b[0] - 0.05, b[1] - 0.05, b[2] - 0.05, b[3] + 0.05, b[4] + 0.05, b[5] + 0.05);
        if (r && r.t < best) { best = r.t; this.targetEntity = e; }
      }
    }
    if (this.targetEntity) this.target = null;
    // contour
    const t = this.target;
    if (t && g.settings.showHud !== false) {
      const key = t.x + ',' + t.y + ',' + t.z + ',' + t.id + ',' + this.world.getMeta(t.x, t.y, t.z);
      if (key !== this.lastOutlineKey) {
        this.lastOutlineKey = key;
        const boxes = getSelectionBoxes(t.id, this.world.getMeta(t.x, t.y, t.z), this.world, t.x, t.y, t.z) || [[0, 0, 0, 1, 1, 1]];
        const pts = [];
        const e = 0.002;
        for (const b of boxes) {
          const [x0, y0, z0, x1, y1, z1] = [b[0] - e, b[1] - e, b[2] - e, b[3] + e, b[4] + e, b[5] + e];
          const c = [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]];
          for (const [a, bb] of [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) pts.push(...c[a], ...c[bb]);
        }
        this.outline.geometry.dispose();
        this.outline.geometry = new THREE.BufferGeometry();
        this.outline.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
      }
      this.outline.position.set(t.x, t.y, t.z);
      this.outline.visible = true;
    } else { this.outline.visible = false; this.lastOutlineKey = ''; }
    // fissures
    const m = this.mining;
    if (m && m.progress > 0 && t && t.x === m.x && t.y === m.y && t.z === m.z) {
      this.crack.visible = true;
      this.crack.position.set(m.x + 0.5, m.y + 0.5, m.z + 0.5);
      this.crack.material.uniforms.uTile.value = tileIndex('destroy_stage_' + Math.min(9, Math.floor(m.progress * 10)));
    } else this.crack.visible = false;
  }

  // direction du rayon passant par un point de l'écran
  screenRay(x, y) {
    const cam = this.game.pipeline.camera;
    cam.updateMatrixWorld();
    const v = this._ray || (this._ray = new THREE.Vector3());
    v.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1, 0.5).unproject(cam).sub(cam.position).normalize();
    return [v.x, v.y, v.z];
  }

  // toucher court sur l'écran : frapper la créature visée, sinon poser / utiliser
  onTouchTap() {
    const p = this.player, e = this.targetEntity;
    if (p.dead || p.spectator) return;
    if (e) {
      if (e.interact && e.interact(p, p.held)) { this.game.hand.swing(); this.placeCooldown = 4; return; }
      this.onAttackClick();
      return;
    }
    this.onUseClick();
  }
  // l'objet tenu s'utilise en maintenant (manger, arc, trident)
  wantsHoldUse() {
    const p = this.player, h = p.held;
    if (!h) return false;
    const d = h.def;
    if (this.target && d.isBlock) return false;
    return !!((d.food && (p.food < 20 || d.food.always || p.creative)) || d.use === 'bow' || d.use === 'trident');
  }

  // ------------------------------------------------------------ ATTAQUE
  onAttackClick() {
    const g = this.game, p = this.player;
    if (this.target && !this.targetEntity && this.target.id === K.note_block) g.playNoteBlock(this.target.x, this.target.y, this.target.z);
    p.swinging = true; p.swing = 0;
    g.hand.swing();
    if (this.targetEntity) { this.attack(this.targetEntity); return; }
    if (this.target && p.creative) { this.creativeBreak(); this.creativeBreakCd = 5; }
  }

  attack(e) {
    const g = this.game, p = this.player;
    const held = p.held;
    const def = held ? held.def : null;
    let dmg = def && def.damage ? def.damage : 1;
    const atkSpeed = def && def.atkSpeed ? def.atkSpeed : 4;
    const period = 20 / atkSpeed;
    const charge = Math.min(1, (p.attackTicks + 0.5) / period);
    dmg *= 0.2 + charge * charge * 0.8;
    if (p.effects.strength) dmg += 3 * (p.effects.strength.amp + 1);
    if (p.effects.weakness) dmg -= 4;
    const crit = charge > 0.9 && p.fallDistance > 0 && !p.onGround && !p.climbing && !p.inWater && !p.sprinting;
    if (crit) { dmg *= 1.5; for (let i = 0; i < 10; i++) g.particles.crit(e.x + (Math.random() - 0.5), e.y + e.h * 0.6, e.z + (Math.random() - 0.5)); }
    p.attackTicks = 0;
    // renvoi des boules de feu
    if (e.kind === 'fireball' && e.type === 'projectile') {
      const ld = p.lookDir();
      e.vx = ld[0] * 1.2; e.vy = ld[1] * 1.2; e.vz = ld[2] * 1.2; e.accel = [ld[0] * 0.1, ld[1] * 0.1, ld[2] * 0.1]; e.shooter = p;
      return;
    }
    const hit = e.damage(Math.max(0, dmg), { type: 'player', attacker: p, crit });
    if (hit) {
      const kb = (p.sprinting && charge > 0.9 ? 0.9 : 0.4);
      e.knockback(e.x - p.x, e.z - p.z, kb);
      if (p.sprinting) p.sprinting = false;
      g.audio.play(crit ? 'attack_crit' : charge > 0.9 ? 'attack_strong' : 'attack_weak', e.x, e.y, e.z);
      if (def && def.tool) p.damageHeld(def.tool === 'sword' ? 1 : 2);
      p.addExhaustion(0.1);
      g.vibration(e.x, e.y, e.z, 1, p);
    }
  }

  // ------------------------------------------------------------- MINAGE
  creativeBreak() {
    const t = this.target;
    if (!t) return;
    const held = this.player.held;
    if (held && held.def.tool === 'sword') return;
    if (BLOCKS[t.id].hardness < 0 && t.id !== K.end_portal_frame) return;
    this.game.breakBlock(t.x, t.y, t.z, false);
    this.game.vibration(t.x + 0.5, t.y + 0.5, t.z + 0.5, 1, this.player);
    if (this.game.input.touch) vibrate(15);
  }

  tick() {
    const g = this.game, p = this.player;
    if (this.placeCooldown > 0) this.placeCooldown--;
    if (this.creativeBreakCd > 0) this.creativeBreakCd--;
    if (g.ui.isScreenOpen() || p.dead) { this.mining = null; this.stopUsing(false); return; }
    // minage maintenu
    if (this.attackHeld && this.target && !this.targetEntity) {
      if (p.creative) { if (this.creativeBreakCd === 0 && !(this.target.id === K.note_block && !p.sneaking)) { this.creativeBreak(); this.creativeBreakCd = 5; } }
      else if (!p.spectator) this.mineTick();
      p.swinging = true;
      if (g.tickCount % 4 === 0) g.hand.swing();
    } else if (!this.attackHeld) this.mining = null;
    // utilisation maintenue
    if (this.useHeld) {
      if (p.using) this.continueUsing();
      else if (this.placeCooldown === 0 && this.useHoldRepeat) this.onUseClick(true);
    } else if (p.using) this.stopUsing(true);
    else this.useHoldRepeat = false;
  }

  mineTick() {
    const g = this.game, p = this.player, t = this.target, w = this.world;
    if (!this.mining || this.mining.x !== t.x || this.mining.y !== t.y || this.mining.z !== t.z || this.mining.id !== t.id) {
      this.mining = { x: t.x, y: t.y, z: t.z, id: t.id, progress: 0, ticks: 0 };
    }
    const m = this.mining;
    const def = BLOCKS[t.id];
    const ticks = breakTicks(def, p.held, p.onGround || p.flying, p.eyeInWater, p.effects);
    if (!isFinite(ticks)) return;
    m.ticks++;
    m.progress = ticks === 0 ? 1 : Math.min(1, m.progress + 1 / ticks);
    if (m.ticks % 4 === 1) { g.audio.playBlock(t.id, 'hit', t.x + 0.5, t.y + 0.5, t.z + 0.5); g.particles.blockHit(t.x, t.y, t.z, t.face, t.id); }
    if (m.progress >= 1) {
      const held = p.held;
      const harvest = canHarvestBlock(def, held);
      g.breakBlock(t.x, t.y, t.z, harvest, false, held);
      if (held && held.def.tool && def.hardness > 0) p.damageHeld(1);
      p.addExhaustion(0.005);
      g.vibration(t.x + 0.5, t.y + 0.5, t.z + 0.5, 1, p);
      if (g.input.touch) vibrate(15);
      this.mining = null;
      if (g.onBlockMined) g.onBlockMined(t.id);
    }
  }

  // ------------------------------------------------------- UTILISATION
  onUseClick(repeat = false) {
    const g = this.game, p = this.player, w = this.world;
    if (p.dead || p.spectator || p.using) return;
    const held = p.held;
    const def = held ? held.def : null;
    const sneaking = p.sneaking;
    this.useHoldRepeat = true;
    // entité visée
    if (!repeat && this.targetEntity && this.targetEntity.interact) {
      if (this.targetEntity.interact(p, held)) { g.hand.swing(); this.placeCooldown = 4; return; }
    }
    const t = this.target;
    // interaction avec le bloc
    if (t && !repeat && (!sneaking || !held)) {
      if (this.interactBlock(t, held)) { g.hand.swing(); this.placeCooldown = 4; this.useHoldRepeat = false; return; }
    }
    if (!held) return;
    // objets utilisables
    if (def.food && (p.food < 20 || def.food.always || p.creative)) { this.startUsing({ eat: true, ticks: def.key === 'dried_kelp' ? 16 : 32 }); return; }
    if (def.use === 'bow') {
      if (p.creative || p.countItem(ITEM.arrow) > 0) this.startUsing({ bow: true });
      return;
    }
    if (def.use === 'trident') { this.startUsing({ trident: true }); return; }
    if (def.use === 'throw') {
      if (repeat && this.placeCooldown > 0) return;
      const ld = p.lookDir();
      g.shoot(def.projectile, p, p.x, p.y + p.eyeHeight - 0.1, p.z, ld, 1.5);
      g.audio.play('throw', p.x, p.y, p.z);
      p.consumeHeld(1);
      g.hand.swing();
      this.placeCooldown = 4;
      return;
    }
    if (def.armor) { this.equipArmor(); return; }
    if (def.use === 'spawn_egg' && t) {
      const d = DIR[t.face] || [0, 1, 0];
      g.spawnMob(def.mob, t.x + 0.5 + d[0], t.y + (d[1] > 0 ? 1 : d[1] < 0 ? -2 : 0), t.z + 0.5 + d[2], { yaw: p.yaw + Math.PI });
      if (!p.creative) p.consumeHeld(1);
      g.hand.swing();
      this.placeCooldown = 4;
      return;
    }
    if (def.use === 'bucket') { this.useBucket(def); return; }
    if (def.use === 'ender_eye') { this.useEnderEye(t); return; }
    if (!t) return;
    if (def.use === 'ignite') { this.ignite(t, def); return; }
    if (def.use === 'bonemeal') {
      if (g.logic.boneMeal(w, t.x, t.y, t.z)) { p.consumeHeld(1); for (let i = 0; i < 8; i++) g.particles.sparkle(t.x + Math.random(), t.y + 0.5 + Math.random() * 0.5, t.z + Math.random(), 0.4, 1, 0.4); g.hand.swing(); }
      this.placeCooldown = 4;
      return;
    }
    if (def.tool === 'hoe' && (t.id === K.grass_block || t.id === K.dirt || t.id === K.dirt_path || t.id === K.coarse_dirt) && t.face !== 3 && w.getBlock(t.x, t.y + 1, t.z) === 0) {
      w.setBlock(t.x, t.y, t.z, t.id === K.coarse_dirt ? K.dirt : K.farmland, 0);
      g.audio.playBlock(K.dirt, 'place', t.x + 0.5, t.y + 1, t.z + 0.5);
      if (t.id === K.grass_block && Math.random() < 0.1) g.dropItem(new ItemStack(ITEM.wheat_seeds, 1), t.x + 0.5, t.y + 1.2, t.z + 0.5);
      p.damageHeld(1); g.hand.swing(); this.placeCooldown = 4;
      return;
    }
    if (def.tool === 'shovel' && t.id === K.grass_block && w.getBlock(t.x, t.y + 1, t.z) === 0) {
      w.setBlock(t.x, t.y, t.z, K.dirt_path); g.audio.playBlock(K.grass_block, 'place', t.x + 0.5, t.y + 1, t.z + 0.5); p.damageHeld(1); g.hand.swing(); this.placeCooldown = 4; return;
    }
    if (def.tool === 'shears' && t.id === K.pumpkin) {
      const f = FACE_TO_FACING[t.face] ?? 0;
      w.setBlock(t.x, t.y, t.z, K.carved_pumpkin, f);
      g.dropItem(new ItemStack(ITEM.wheat_seeds, 4), t.x + 0.5, t.y + 1, t.z + 0.5);
      p.damageHeld(1); g.hand.swing(); this.placeCooldown = 4; return;
    }
    if (def.plant) { this.placePlant(t, def); return; }
    if (def.isBlock) this.placeBlock(t, held);
  }

  startUsing(u) {
    const p = this.player;
    p.using = u; p.useTicks = 0;
  }
  continueUsing() {
    const g = this.game, p = this.player, u = p.using;
    p.useTicks++;
    if (u.eat) {
      if (p.useTicks % 4 === 0) { g.audio.play('eat', p.x, p.y, p.z); const h = p.held; if (h) g.particles.burst(p.x + p.lookDir()[0] * 0.5, p.y + 1.4, p.z + p.lookDir()[2] * 0.5, 0xc89060, 2); }
      if (p.useTicks >= u.ticks) {
        const h = p.held;
        if (h && h.def.food) {
          p.eat(h.def);
          g.audio.play('burp', p.x, p.y, p.z);
          if (h.def.key === 'milk_bucket' || h.def.key === 'mushroom_stew') { if (!p.creative) p.held = new ItemStack(h.def.key === 'milk_bucket' ? ITEM.bucket : ITEM.bowl, 1); }
          else p.consumeHeld(1);
          g.ui.refresh();
        }
        p.using = null;
      }
    }
  }
  stopUsing(release) {
    const g = this.game, p = this.player, u = p.using;
    if (!u) return;
    if (release && u.bow) {
      const charge = Math.min(1, (p.useTicks / 20) ** 2 + (p.useTicks / 20) * 2) / 3 * 1;
      const f = Math.min(1, ((p.useTicks / 20) ** 2 + (p.useTicks / 20) * 2) / 3);
      if (f >= 0.1) {
        const ld = p.lookDir();
        const a = g.shoot('arrow', p, p.x, p.y + p.eyeHeight - 0.1, p.z, ld, f * 3);
        a.crit = f >= 1;
        g.audio.play('bow', p.x, p.y, p.z);
        if (!p.creative) { p.removeItem(ITEM.arrow, 1); }
        p.damageHeld(1);
      }
      void charge;
    }
    if (release && u.trident && p.useTicks >= 10) {
      const ld = p.lookDir();
      const tr = g.shoot('trident', p, p.x, p.y + p.eyeHeight - 0.1, p.z, ld, 2.5);
      tr.pickup = false;
      g.audio.play('throw', p.x, p.y, p.z);
    }
    p.using = null; p.useTicks = 0;
  }

  equipArmor() {
    const p = this.player, h = p.held;
    const slot = h.def.armor.slot;
    const old = p.armor[slot];
    p.armor[slot] = h;
    p.held = old;
    this.game.audio.play('equip', p.x, p.y, p.z);
    this.game.ui.refresh();
    this.placeCooldown = 4;
  }

  useBucket(def) {
    const g = this.game, p = this.player, w = this.world;
    const ld = p.lookDir();
    const reach = p.creative ? 5 : 4.5;
    if (!def.fluid && def.key === 'bucket') {
      const h = raycast(w, p.x, p.y + p.eyeHeight, p.z, ld[0], ld[1], ld[2], reach, { selection: getSelectionBoxes, fluids: true, sourceOnly: true });
      if (!h || !h.fluid) return;
      const filled = h.id === K.water ? ITEM.water_bucket : ITEM.lava_bucket;
      w.setBlock(h.x, h.y, h.z, 0);
      g.audio.play(h.id === K.water ? 'bucket_fill' : 'bucket_fill_lava', h.x, h.y, h.z);
      if (!p.creative) {
        if (p.held.count === 1) p.held = new ItemStack(filled, 1);
        else { p.held.count--; if (p.addItem(new ItemStack(filled, 1)) > 0) g.dropItem(new ItemStack(filled, 1), p.x, p.y + 1, p.z); }
      }
      g.ui.refresh(); g.hand.swing(); this.placeCooldown = 5;
      return;
    }
    const t = this.target;
    if (!t) return;
    const tdef = BLOCKS[t.id];
    let x = t.x, y = t.y, z = t.z;
    if (!tdef.replaceable || tdef.fluid) { const d = DIR[t.face]; x += d[0]; y += d[1]; z += d[2]; }
    const cur = w.getBlock(x, y, z);
    if (cur && !BLOCKS[cur].replaceable) return;
    const fid = def.fluid === 'water' ? K.water : K.lava;
    if (fid === K.water && g.dim === 1) {
      g.audio.play('fizz', x, y, z); for (let i = 0; i < 10; i++) g.particles.smoke(x + Math.random(), y + Math.random(), z + Math.random(), 0.8, 0.9);
    } else {
      if (cur && !BLOCKS[cur].fluid) g.breakBlock(x, y, z, true, true);
      w.setBlock(x, y, z, fid, 0);
      g.audio.play(fid === K.water ? 'bucket_empty' : 'bucket_empty_lava', x, y, z);
    }
    if (!p.creative) p.held = new ItemStack(ITEM.bucket, 1);
    g.ui.refresh(); g.hand.swing(); this.placeCooldown = 5;
  }

  ignite(t, def) {
    const g = this.game, p = this.player, w = this.world;
    g.hand.swing(); this.placeCooldown = 4;
    if (t.id === K.tnt) { w.setBlock(t.x, t.y, t.z, 0); g.primeTnt(t.x, t.y, t.z); }
    else if (t.id === K.campfire) { /* déjà allumé */ }
    else {
      const d = DIR[t.face];
      const x = t.x + d[0], y = t.y + d[1], z = t.z + d[2];
      if (w.getBlock(x, y, z) !== 0) return;
      if (!g.portals.tryLight(x, y, z)) {
        const below = w.getBlock(x, y - 1, z);
        w.setBlock(x, y, z, below === K.soul_sand || below === K.soul_soil ? K.soul_fire : K.fire);
        w.schedule(x, y, z, 30);
      }
      g.audio.play('ignite', x + 0.5, y + 0.5, z + 0.5);
    }
    if (def.key === 'fire_charge') p.consumeHeld(1); else p.damageHeld(1);
  }

  useEnderEye(t) {
    const g = this.game, p = this.player, w = this.world;
    if (t && t.id === K.end_portal_frame) {
      const m = w.getMeta(t.x, t.y, t.z);
      if (m & 4) return;
      w.setMeta(t.x, t.y, t.z, m | 4);
      p.consumeHeld(1);
      g.audio.play('eye_place', t.x, t.y, t.z);
      for (let i = 0; i < 10; i++) g.particles.sparkle(t.x + Math.random(), t.y + 1, t.z + Math.random(), 0.4, 1, 0.6);
      g.portals.checkEndPortal(t.x, t.y, t.z);
      this.placeCooldown = 4;
      return;
    }
    // lancer l'œil vers le fort
    if (g.dim !== 0) return;
    const sh = g.portals.nearestStronghold(p.x, p.z);
    if (!sh) return;
    g.portals.throwEye(p, sh);
    p.consumeHeld(1);
    this.placeCooldown = 10;
  }

  // ---------------------------------------------------------------- POSE
  placementPos(t) {
    const def = BLOCKS[t.id];
    if (def.replaceable && !def.fluid && t.id !== K.snow) return [t.x, t.y, t.z];
    if (t.id === K.snow && this.world.getMeta(t.x, t.y, t.z) === 0) return [t.x, t.y, t.z];
    const d = DIR[t.face];
    return [t.x + d[0], t.y + d[1], t.z + d[2]];
  }
  canPlaceAt(x, y, z, id, meta) {
    const w = this.world;
    if (y < 0 || y >= 128) return false;
    const cur = w.getBlock(x, y, z);
    if (cur && !BLOCKS[cur].replaceable) return false;
    // collision avec des entités
    const boxes = getBoxes(id, meta, w, x, y, z);
    if (boxes) {
      for (const e of [this.player, ...this.game.entities.list]) {
        if (e.removed || e.dead || e.type === 'item' || e.type === 'xp' || e.type === 'projectile' || e.type === 'lightning') continue;
        if (e === this.player && (this.player.spectator)) continue;
        const hw = e.w / 2;
        for (const b of boxes) {
          if (e.x + hw > x + b[0] + 0.001 && e.x - hw < x + b[3] - 0.001 && e.y + e.h > y + b[1] + 0.001 && e.y < y + b[4] - 0.001 && e.z + hw > z + b[2] + 0.001 && e.z - hw < z + b[5] - 0.001) return false;
        }
      }
    }
    return true;
  }

  lookFacing() {
    // direction horizontale du regard → facing (0 sud, 1 ouest, 2 nord, 3 est)
    const ld = this.player.lookDir();
    if (Math.abs(ld[0]) > Math.abs(ld[2])) return ld[0] > 0 ? 3 : 1;
    return ld[2] > 0 ? 0 : 2;
  }

  // direction du regard sur 6 axes (0 haut, 1 bas, 2+facing)
  lookDir6() {
    const ld = this.player.lookDir();
    if (ld[1] > 0.72) return 0;
    if (ld[1] < -0.72) return 1;
    return 2 + this.lookFacing();
  }

  placeBlock(t, held) {
    const g = this.game, p = this.player, w = this.world;
    let [x, y, z] = this.placementPos(t);
    const id = held.def.block;
    const def = BLOCKS[id];
    let meta = 0;
    const hitY = t.hit ? t.hit[1] - Math.floor(t.hit[1]) : 0.5;
    // dalles empilées
    if (def.model === 'slab' && t.id === id && ((t.face === 2 && (w.getMeta(t.x, t.y, t.z) & 3) === 0) || (t.face === 3 && (w.getMeta(t.x, t.y, t.z) & 3) === 1))) {
      w.setBlock(t.x, t.y, t.z, id, 2); this.afterPlace(t.x, t.y, t.z, id); return;
    }
    if (def.model === 'slab' && w.getBlock(x, y, z) === id && (w.getMeta(x, y, z) & 3) !== 2) { w.setBlock(x, y, z, id, 2); this.afterPlace(x, y, z, id); return; }
    const lf = this.lookFacing();
    if (def.axis) meta = t.face <= 1 ? 1 : t.face >= 4 ? 2 : 0;
    if (def.facing) {
      if (def.model === 'stairs') { meta = lf; if (t.face === 3 || (t.face !== 2 && hitY > 0.5)) meta |= 4; }
      else if (def.model === 'ladder') { if (t.face < 2 || t.face > 3) meta = FACE_TO_FACING[t.face]; else return; }
      else meta = (lf + 2) % 4; // face vers le joueur
    }
    if (def.model === 'slab') meta = t.face === 3 || (t.face !== 2 && hitY > 0.5) ? 1 : 0;
    if (def.model === 'torch') {
      if (t.face === 2) meta = 0;
      else if (t.face === 3) return;
      else meta = 1 + FACE_TO_FACING[t.face];
    }
    // redstone : leviers et boutons (sol, mur, plafond), répéteurs, observateurs, pistons
    if (def.rs === 'lever' || def.rs === 'button') {
      if (t.face === 2) meta = lf;
      else if (t.face === 3) meta = (2 << 2) | lf;
      else meta = (1 << 2) | FACE_TO_FACING[t.face];
    }
    if (def.rs === 'repeater') meta = lf;
    if (def.rs === 'observer') meta = this.lookDir6();
    if (def.mech === 'piston') meta = OPP6[this.lookDir6()];
    if (def.key.endsWith('_leaves')) meta = 1; // persistantes
    if (def.key === 'snow' && w.getBlock(x, y, z) === K.snow) { const m = w.getMeta(x, y, z); if (m < 7) { w.setBlock(x, y, z, K.snow, m + 1); this.afterPlace(x, y, z, id); } return; }
    if (!this.canPlaceAt(x, y, z, id, meta)) return;
    if (def.support && !g.logic.supported(w, x, y, z, id, meta)) return;
    if (def.key === 'lily_pad') return;
    // blocs de deux cases
    if (def.key === 'oak_door') {
      if (!this.canPlaceAt(x, y + 1, z, id, meta | 8) || !B_SOLID[w.getBlock(x, y - 1, z)]) return;
      w.setBlock(x, y + 1, z, id, meta | 8, { notify: false }); w.setBlock(x, y, z, id, meta);
      this.afterPlace(x, y, z, id); return;
    }
    if (def.key === 'red_bed') {
      const f = lf;
      const [vx, vz] = [[0, 1], [-1, 0], [0, -1], [1, 0]][f];
      if (!this.canPlaceAt(x + vx, y, z + vz, id, f | 8)) return;
      w.setBlock(x + vx, y, z + vz, id, f | 8, { notify: false }); w.setBlock(x, y, z, id, f);
      this.afterPlace(x, y, z, id); return;
    }
    if (def.tall) {
      if (w.getBlock(x, y + 1, z) !== 0) return;
      w.setBlock(x, y, z, id, 0); w.setBlock(x, y + 1, z, K[def.key + '_top'], 0);
      this.afterPlace(x, y, z, id); return;
    }
    if (def.key === 'cactus' || def.key === 'sugar_cane' || def.key === 'bamboo') { if (!g.logic.supported(w, x, y, z, id, 0)) return; }
    // crâne de wither : invocation du Wither
    w.setBlock(x, y, z, id, meta);
    if (def.interact === 'chest' && def.key === 'chest') w.setBlockEntity(x, y, z, { type: 'chest', items: new Array(27).fill(null) });
    if (def.key === 'barrel') w.setBlockEntity(x, y, z, { type: 'chest', items: new Array(27).fill(null) });
    if (def.key === 'furnace') w.setBlockEntity(x, y, z, { type: 'furnace', input: null, fuel: null, output: null, burn: 0, burnMax: 0, cook: 0 });
    if (id === K.wither_skeleton_skull) g.portals.checkWitherSummon(x, y, z);
    if (id === K.carved_pumpkin) g.portals.checkGolemSummon(x, y, z);
    this.afterPlace(x, y, z, id);
  }

  afterPlace(x, y, z, id) {
    const g = this.game, p = this.player;
    g.audio.playBlock(id, 'place', x + 0.5, y + 0.5, z + 0.5);
    p.consumeHeld(1);
    g.hand.swing();
    this.placeCooldown = 4;
    g.vibration(x + 0.5, y + 0.5, z + 0.5, 1, p);
  }

  placePlant(t, def) {
    const g = this.game, w = this.world, p = this.player;
    const plant = def.plant;
    const pid = K[plant];
    if (pid === undefined) return;
    if (plant === 'kelp') {
      const [x, y, z] = this.placementPos(t);
      if (w.getBlock(x, y, z) === K.water && g.logic.supported(w, x, y, z, pid, 0)) { w.setBlock(x, y, z, pid); this.afterPlace(x, y, z, pid); }
      return;
    }
    if (t.face !== 2) return;
    const x = t.x, y = t.y + 1, z = t.z;
    if (w.getBlock(x, y, z) !== 0) return;
    if (!g.logic.supported(w, x, y, z, pid, 0)) return;
    w.setBlock(x, y, z, pid, 0);
    this.afterPlace(x, y, z, pid);
  }

  pickBlock() {
    const p = this.player, t = this.target;
    if (!t) return;
    const def = BLOCKS[t.id];
    let itemId = def.item ? t.id : def.tallTop ? K[def.tallTop] : def.crop ? ITEM[def.crop.seed] : t.id === K.lit_furnace ? K.furnace : t.id === K.snowy_grass_block ? K.grass_block : null;
    if (itemId === null && typeof def.drops === 'string' && ITEM[def.drops] !== undefined) itemId = ITEM[def.drops];
    if (t.id === K.piston_head) { const m = this.world.getMeta(t.x, t.y, t.z); itemId = m & 8 ? K.sticky_piston : K.piston; }
    if (itemId === null || itemId === undefined) return;
    for (let i = 0; i < 9; i++) if (p.inventory[i] && p.inventory[i].id === itemId) { p.selected = i; this.game.ui.onHotbarChange(); return; }
    if (p.creative) {
      let slot = p.inventory.findIndex((s, i) => i < 9 && !s);
      if (slot < 0) slot = p.selected;
      p.inventory[slot] = new ItemStack(itemId, 1);
      p.selected = slot;
      this.game.ui.refresh(); this.game.ui.onHotbarChange();
    }
  }

  dropHeld(all) {
    const p = this.player, h = p.held;
    if (!h) return;
    const n = all ? h.count : 1;
    const s = new ItemStack(h.id, n, h.damage);
    h.count -= n;
    if (h.count <= 0) p.held = null;
    const ld = p.lookDir();
    this.game.dropItem(s, p.x, p.y + p.eyeHeight - 0.3, p.z, ld);
    this.game.hand.swing();
    this.game.ui.refresh();
  }

  // ------------------------------------------------------ BLOCS INTERACTIFS
  interactBlock(t, held) {
    const g = this.game, p = this.player, w = this.world;
    const def = BLOCKS[t.id];
    const x = t.x, y = t.y, z = t.z;
    switch (def.interact) {
      case 'crafting': g.ui.openCrafting(); return true;
      case 'chest': {
        let be = w.getBlockEntity(x, y, z);
        if (!be) { be = { type: 'chest', items: new Array(27).fill(null) }; w.setBlockEntity(x, y, z, be); }
        g.ui.openChest(be, x, y, z, def.name);
        g.audio.play('chest_open', x, y, z);
        return true;
      }
      case 'furnace': {
        let be = w.getBlockEntity(x, y, z);
        if (!be) { be = { type: 'furnace', input: null, fuel: null, output: null, burn: 0, burnMax: 0, cook: 0 }; w.setBlockEntity(x, y, z, be); }
        g.ui.openFurnace(be, x, y, z);
        return true;
      }
      case 'door': {
        const m = w.getMeta(x, y, z);
        const by = (m & 8) ? y - 1 : y;
        const bm = w.getMeta(x, by, z) ^ 4;
        w.setBlock(x, by, z, t.id, bm, { notify: false });
        w.setBlock(x, by + 1, z, t.id, bm | 8, { notify: false });
        g.audio.play(bm & 4 ? 'door_open' : 'door_close', x, y, z);
        return true;
      }
      case 'bed': return this.useBed(x, y, z);
      case 'tnt':
        if (held && (held.id === ITEM.flint_and_steel || held.id === ITEM.fire_charge)) { w.setBlock(x, y, z, 0); g.primeTnt(x, y, z); if (held.id === ITEM.flint_and_steel) p.damageHeld(1); else p.consumeHeld(1); return true; }
        return false;
      case 'bell': g.audio.play('bell', x, y, z); return true;
      case 'note': {
        if (p.sneaking && held && held.def.isBlock) return false;
        w.setMeta(x, y, z, (w.getMeta(x, y, z) + 1) % 25);
        g.playNoteBlock(x, y, z, true);
        return true;
      }
      case 'jukebox': {
        let be = w.getBlockEntity(x, y, z);
        if (be && be.disc != null) {
          // éjecter le disque
          g.dropItem(new ItemStack(be.disc, 1), x + 0.5, y + 1.1, z + 0.5);
          g.audio.stopJukebox(x, y, z);
          be.disc = null; w.setBlockEntity(x, y, z, be);
          return true;
        }
        if (held && held.def.disc) {
          be = be || { type: 'jukebox', disc: null };
          be.disc = held.id; w.setBlockEntity(x, y, z, be);
          if (!p.creative) p.consumeHeld(1);
          g.audio.playJukebox(held.def.key, x, y, z);
          g.ui.hud.action('En cours de lecture : ' + held.def.name.replace('Disque de musique : ', ''));
          return true;
        }
        return false;
      }
      case 'eye': return false;
      case 'lever': case 'button': case 'repeater': case 'daylight':
        return g.logic.redstone.use(x, y, z, t.id);
    }
    if (t.id === K.sweet_berry_bush && w.getMeta(x, y, z) >= 2) {
      g.dropItem(new ItemStack(ITEM.sweet_berries, 1 + Math.floor(Math.random() * 2)), x + 0.5, y + 0.5, z + 0.5);
      w.setMeta(x, y, z, 1); return true;
    }
    if (t.id === K.cake) return false;
    return false;
  }

  useBed(x, y, z) {
    const g = this.game, p = this.player, w = this.world;
    if (g.dim !== 0) { // le lit explose dans le Nether et l'End !
      g.breakBlock(x, y, z, false);
      g.explode(x + 0.5, y + 0.5, z + 0.5, 5, { fire: true });
      return true;
    }
    p.spawnPoint = [x + 0.5, y + 1, z + 0.5];
    if (!g.isNight() && g.weather.thunder < 0.5) { g.ui.toast('Vous ne pouvez dormir que la nuit ou pendant un orage. Point d\'apparition défini.'); return true; }
    const monsters = g.entities.list.filter((e) => e.hostile && !e.dead && Math.abs(e.x - x) < 8 && Math.abs(e.y - y) < 5 && Math.abs(e.z - z) < 8);
    if (monsters.length) { g.ui.toast('Vous ne pouvez pas dormir, des monstres rôdent à proximité.'); return true; }
    p.sleeping = true; p.bedPos = [x, y, z];
    p.setPos(x + 0.5, y + 0.56, z + 0.5);
    g.ui.toast('Bonne nuit…');
    return true;
  }

  // ------------------------------------------------------------ FOURNEAUX
  furnaceTick(be, x, y, z, key) {
    const g = this.game, w = this.world;
    const recipe = be.input ? SMELT.get(be.input.id ?? be.input[0]) : null;
    const inp = be.input ? ItemStack.from(be.input) : null;
    if (inp) be.input = inp;
    if (be.output) be.output = ItemStack.from(be.output);
    if (be.fuel) be.fuel = ItemStack.from(be.fuel);
    const canOut = recipe && (!be.output || (be.output.id === recipe.out && be.output.count < maxStack(recipe.out)));
    if (be.burn > 0) be.burn--;
    if (be.burn <= 0 && canOut && be.fuel) {
      const fv = fuelValue(be.fuel.id);
      if (fv > 0) {
        be.burn = be.burnMax = fv;
        if (be.fuel.id === ITEM.lava_bucket) be.fuel = new ItemStack(ITEM.bucket, 1);
        else { be.fuel.count--; if (be.fuel.count <= 0) be.fuel = null; }
      }
    }
    if (be.burn > 0 && canOut) {
      be.cook++;
      if (be.cook >= 200) {
        be.cook = 0;
        be.input.count--; if (be.input.count <= 0) be.input = null;
        if (be.output) be.output.count++; else be.output = new ItemStack(recipe.out, 1);
        be.xp = (be.xp || 0) + recipe.xp;
      }
    } else if (be.cook > 0) be.cook = Math.max(0, be.cook - 2);
    // bloc allumé / éteint
    const id = w.getBlock(x, y, z);
    const lit = be.burn > 0;
    if (lit && id === K.furnace) w.setBlock(x, y, z, K.lit_furnace, w.getMeta(x, y, z), { keepEntity: true, notify: false });
    if (!lit && id === K.lit_furnace) w.setBlock(x, y, z, K.furnace, w.getMeta(x, y, z), { keepEntity: true, notify: false });
    w.setBlockEntity(x, y, z, be);
    if (!lit && !canOut) g.activeFurnaces.delete(key);
    if (lit && Math.random() < 0.1) g.particles.flame(x + 0.5 + (Math.random() - 0.5) * 0.4, y + 0.3, z + 0.5);
    g.ui.onFurnaceUpdate && g.ui.onFurnaceUpdate(be);
  }

  // -------------------------------------------------- SCULK (vibrations)
  sculkVibration(x, y, z, src) {
    const g = this.game, w = this.world;
    if (g.dim !== 0 || y > 40) return;
    const bx = Math.floor(x), by = Math.floor(y), bz = Math.floor(z);
    for (let dx = -8; dx <= 8; dx += 1) for (let dz = -8; dz <= 8; dz += 1) for (let dy = -4; dy <= 4; dy++) {
      if (Math.abs(dx) + Math.abs(dz) > 10) continue;
      const id = w.getBlock(bx + dx, by + dy, bz + dz);
      if (id === K.sculk_sensor) {
        for (let i = 0; i < 3; i++) g.particles.soul(bx + dx + 0.5, by + dy + 0.8, bz + dz + 0.5);
        if (Math.random() < 0.15) g.audio.play('sculk_click', bx + dx, by + dy, bz + dz);
      } else if (id === K.sculk_shrieker && src && src.type === 'player') {
        g.portals.shriek(bx + dx, by + dy, bz + dz);
        return;
      }
    }
  }
}

export { FACING_FACE, DAY_LENGTH, GAMEMODE, B_FLUID, SOIL };
