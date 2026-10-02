// Commandes de discussion façon Minecraft
import { ITEM, ITEMS, ItemStack, maxStack } from '../items/items.js';
import { MOB_DEFS } from '../entity/mobs.js';
import { DAY_LENGTH, HEIGHT } from '../constants.js';
import { strongholdPositions } from '../world/gen/structures.js';
import { BLOCKS } from '../blocks/blocks.js';

const GM = { survival: 0, s: 0, 0: 0, survie: 0, creative: 1, c: 1, 1: 1, creatif: 1, 'créatif': 1, spectator: 3, sp: 3, 3: 3, spectateur: 3 };
const ERR = (m) => `<span style="color:#ff5555">${m}</span>`;
const OK = (m) => `<span style="color:#aaaaaa">${m}</span>`;

function coord(v, base) {
  if (v === undefined) return base;
  if (v.startsWith('~')) return base + (parseFloat(v.slice(1)) || 0);
  return parseFloat(v);
}

export function runCommand(game, line) {
  const [cmd, ...a] = line.trim().split(/\s+/);
  const p = game.player;
  switch ((cmd || '').toLowerCase()) {
    case 'help': case '?':
      return OK('Commandes : /gamemode, /tp, /time, /weather, /give, /summon, /kill, /effect, /xp, /dimension, /locate, /seed, /spawnpoint, /difficulty, /clear, /heal, /boss, /fly, /day, /night, /musique');
    case 'gamemode': case 'gm': {
      const m = GM[(a[0] || '').toLowerCase()];
      if (m === undefined) return ERR('Usage : /gamemode survival|creative|spectator');
      p.setGamemode(m);
      game.ui.refresh();
      return OK('Mode de jeu : ' + ['Survie', 'Créatif', '', 'Spectateur'][m]);
    }
    case 'tp': case 'teleport': {
      if (a.length < 3) return ERR('Usage : /tp x y z');
      const x = coord(a[0], p.x), y = coord(a[1], p.y), z = coord(a[2], p.z);
      if ([x, y, z].some(isNaN)) return ERR('Coordonnées invalides');
      p.setPos(x, y, z); p.vx = p.vy = p.vz = 0; p.fallDistance = 0;
      return OK(`Téléporté en ${x.toFixed(1)} ${y.toFixed(1)} ${z.toFixed(1)}`);
    }
    case 'time': {
      if (a[0] === 'set') {
        const v = { day: 1000, jour: 1000, noon: 6000, midi: 6000, night: 13000, nuit: 13000, midnight: 18000, minuit: 18000, sunrise: 23000, sunset: 12000 }[a[1]] ?? parseInt(a[1], 10);
        if (isNaN(v)) return ERR('Usage : /time set day|night|noon|midnight|<n>');
        game.time = Math.floor(game.time / DAY_LENGTH) * DAY_LENGTH + v;
        return OK('Heure définie : ' + v);
      }
      if (a[0] === 'add') { game.time += parseInt(a[1], 10) || 0; return OK('Temps avancé'); }
      return OK('Heure : ' + Math.floor(game.time % DAY_LENGTH) + ' (jour ' + (Math.floor(game.time / DAY_LENGTH) + 1) + ')');
    }
    case 'day': case 'jour': game.time = Math.floor(game.time / DAY_LENGTH) * DAY_LENGTH + 1000; return OK('Il fait jour');
    case 'night': case 'nuit': game.time = Math.floor(game.time / DAY_LENGTH) * DAY_LENGTH + 13000; return OK('Il fait nuit');
    case 'weather': case 'meteo': case 'météo': {
      const W = game.weather;
      const t = (a[0] || '').toLowerCase();
      if (t === 'clear' || t === 'clair') { W.targetRain = 0; W.targetThunder = 0; W.timer = 12000 + Math.random() * 24000; }
      else if (t === 'rain' || t === 'pluie') { W.targetRain = 1; W.targetThunder = 0; W.timer = 6000; }
      else if (t === 'thunder' || t === 'orage') { W.targetRain = 1; W.targetThunder = 1; W.timer = 6000; }
      else return ERR('Usage : /weather clear|rain|thunder');
      return OK('Météo : ' + t);
    }
    case 'give': {
      const key = (a[0] || '').replace('minecraft:', '');
      const id = ITEM[key];
      if (id === undefined) {
        const fuzzy = Object.keys(ITEM).filter((k) => k.includes(key)).slice(0, 12);
        return ERR('Objet inconnu : ' + key + (fuzzy.length ? '. Suggestions : ' + fuzzy.join(', ') : ''));
      }
      let n = Math.max(1, Math.min(64 * 36, parseInt(a[1], 10) || 1));
      while (n > 0) { const k = Math.min(n, maxStack(id)); const left = p.addItem(new ItemStack(id, k)); if (left > 0) { game.dropItem(new ItemStack(id, left), p.x, p.y + 1, p.z); } n -= k; }
      return OK(`Donné ${a[1] || 1} × ${ITEMS[id].name}`);
    }
    case 'summon': {
      const t = (a[0] || '').replace('minecraft:', '');
      if (!MOB_DEFS[t]) return ERR('Créature inconnue. Exemples : ' + Object.keys(MOB_DEFS).slice(0, 30).join(', '));
      const ld = p.lookDir();
      const x = coord(a[1], p.x + ld[0] * 3), y = coord(a[2], p.y), z = coord(a[3], p.z + ld[2] * 3);
      const m = game.spawnMob(t, x, t === 'ender_dragon' ? y + 10 : y, z, { persistent: true });
      return m ? OK('Invoqué : ' + MOB_DEFS[t].name) : ERR('Impossible');
    }
    case 'boss': {
      const t = { dragon: 'ender_dragon', wither: 'wither', warden: 'warden' }[(a[0] || '').toLowerCase()];
      if (!t) return ERR('Usage : /boss dragon|wither|warden');
      const ld = p.lookDir();
      game.spawnMob(t, p.x + ld[0] * 8, p.y + (t === 'ender_dragon' ? 15 : 0), p.z + ld[2] * 8, { emerging: t === 'warden' });
      return OK('Boss invoqué : ' + MOB_DEFS[t].name);
    }
    case 'kill': {
      if (a[0] === '@e') { let n = 0; for (const e of game.entities.list) if (e.mobType && !e.dead) { e.damage(1e6, { type: 'kill' }); n++; } return OK(n + ' entités tuées'); }
      p.invulnerable = false; p.damage(1e6, { type: 'kill' }); if (p.creative || p.spectator) p.setGamemode(p.gamemode);
      return OK('Aïe.');
    }
    case 'music': case 'musique': {
      const au = game.audio;
      if (!au.ready) return ERR('Le son n\'est pas encore activé : cliquez dans le jeu');
      if ((a[0] || '').toLowerCase() === 'stop') { au.stopAllSongs(); au.musicTimer = 600; return OK('Musique arrêtée'); }
      if (au.bgSong) au.stopSong(au.bgSong, 1);
      au.musicTimer = 0; au.bgSong = null;
      au.playMusic(game.dim);
      return OK('Musique lancée (volume dans Options → Musique). /musique stop pour arrêter');
    }
    case 'heal': p.health = p.maxHealth; p.food = 20; p.saturation = 5; p.fire = 0; p.air = 300; return OK('Soigné');
    case 'clear': p.inventory.fill(null); game.ui.refresh(); return OK('Inventaire vidé');
    case 'effect': {
      const n = (a[0] || '').toLowerCase();
      const known = ['speed', 'slowness', 'haste', 'strength', 'jump_boost', 'regeneration', 'resistance', 'fire_resistance', 'water_breathing', 'invisibility', 'night_vision', 'poison', 'wither', 'levitation', 'slow_falling', 'darkness', 'blindness'];
      if (n === 'clear') { p.effects = {}; return OK('Effets retirés'); }
      if (!known.includes(n)) return ERR('Effets : ' + known.join(', ') + ', clear');
      p.addEffect(n, (parseInt(a[1], 10) || 30) * 20, parseInt(a[2], 10) || 0);
      return OK('Effet appliqué : ' + n);
    }
    case 'xp': p.addXP(parseInt(a[0], 10) || 10); return OK('Expérience ajoutée');
    case 'seed': case 'graine': return OK('Graine : ' + game.meta.seed);
    case 'spawnpoint': p.spawnPoint = [p.x, p.y, p.z]; return OK('Point d\'apparition défini');
    case 'difficulty': { const d = parseInt(a[0], 10); if (isNaN(d) || d < 0 || d > 3) return ERR('Usage : /difficulty 0-3'); game.settings.difficulty = d; return OK('Difficulté : ' + d); }
    case 'fly': if (!p.creative) return ERR('Vol réservé au mode créatif'); p.flying = !p.flying; return OK(p.flying ? 'Vol activé' : 'Vol désactivé');
    case 'dimension': case 'dim': case 'execute': {
      const d = { overworld: 0, surface: 0, nether: 1, end: 2, the_end: 2 }[(a[a.length - 1] || '').replace('minecraft:', '').toLowerCase()];
      if (d === undefined) return ERR('Usage : /dimension overworld|nether|end');
      if (d === game.dim) return OK('Déjà dans cette dimension');
      const pos = d === 2 ? [100.5, 52, 0.5] : d === 1 ? [p.x / 8, 70, p.z / 8] : [p.x * 8, 80, p.z * 8];
      game.portals.arrival = d === 2 ? { kind: 'end' } : null;
      game.enterDimension(d, d === 0 && game.dim === 2 ? null : pos).then(() => {
        if (d !== 2) { const w = game.world; const x = Math.floor(p.x), z = Math.floor(p.z); for (let y = HEIGHT - 2; y > 1; y--) if (BLOCKS[w.getBlock(x, y - 1, z)].solid && !BLOCKS[w.getBlock(x, y, z)].solid && !BLOCKS[w.getBlock(x, y + 1, z)].solid && (d !== 1 || y < 120)) { p.setPos(x + 0.5, y, z + 0.5); break; } }
      });
      return OK('Changement de dimension…');
    }
    case 'locate': {
      const t = (a[0] || '').toLowerCase();
      if (t === 'stronghold' || t === 'fort') {
        const s = game.portals.nearestStronghold(p.x, p.z);
        return OK(`Fort le plus proche : ${s[0]} ~ ${s[2]} (${Math.round(Math.hypot(s[0] - p.x, s[2] - p.z))} blocs)`);
      }
      const gen = game.gen.local;
      if ((t === 'village' || t === 'ancient_city' || t === 'cite_antique') && game.dim === 0) {
        const plans = [];
        const R = t === 'village' ? 320 : 512;
        const rx0 = Math.floor(p.x / R), rz0 = Math.floor(p.z / R);
        for (let r = 0; r <= 4; r++) for (let rx = rx0 - r; rx <= rx0 + r; rx++) for (let rz = rz0 - r; rz <= rz0 + r; rz++) {
          let plan = null;
          if (t === 'village') { gen.planCache = gen.planCache || new Map(); plan = gen.planCache.get('v' + rx + ',' + rz); if (plan === undefined) { try { plan = villagePlanPublic(gen, rx, rz); } catch (e) { plan = null; } } if (plan) plans.push([plan.cx, plan.cz]); }
          else { plan = ancientPlanPublic(gen, rx, rz); if (plan) plans.push([plan.x, plan.z]); }
        }
        if (!plans.length) return ERR('Aucune structure trouvée à proximité');
        plans.sort((u, v) => Math.hypot(u[0] - p.x, u[1] - p.z) - Math.hypot(v[0] - p.x, v[1] - p.z));
        const [x, z] = plans[0];
        return OK(`${t === 'village' ? 'Village' : 'Cité antique'} le plus proche : ${x} ~ ${z} (${Math.round(Math.hypot(x - p.x, z - p.z))} blocs)`);
      }
      if ((t === 'fortress' || t === 'forteresse' || t === 'bastion') && game.dim === 1) {
        let best = null;
        for (let rx = Math.floor(p.x / 288) - 3; rx <= Math.floor(p.x / 288) + 3; rx++) for (let rz = Math.floor(p.z / 288) - 3; rz <= Math.floor(p.z / 288) + 3; rz++) {
          const plan = fortressPlanPublic(gen, rx, rz);
          if (plan && (t === 'bastion' ? plan.kind === 'bastion' : plan.kind === 'fortress')) { const d = Math.hypot(plan.x - p.x, plan.z - p.z); if (!best || d < best[2]) best = [plan.x, plan.z, d]; }
        }
        return best ? OK(`Structure : ${best[0]} ~ ${best[1]} (${Math.round(best[2])} blocs)`) : ERR('Aucune trouvée');
      }
      if (t === 'end_city' && game.dim === 2) return OK('Les cités de l\'End se trouvent sur les îles extérieures (à plus de 850 blocs du centre).');
      const extra = { outpost: [_outpostPlan, 320, 'Avant-poste de pillards'], avant_poste: [_outpostPlan, 320, 'Avant-poste de pillards'], temple: [_jungleTemplePlan, 256, 'Temple de la jungle'], jungle_temple: [_jungleTemplePlan, 256, 'Temple de la jungle'], mineshaft: [_mineshaftPlan, 160, 'Mine abandonnée'], mine: [_mineshaftPlan, 160, 'Mine abandonnée'], monument: [_monumentPlan, 512, 'Monument océanique'] }[t];
      if (extra && game.dim === 0) {
        const [fn, R, label] = extra;
        let best = null;
        const rx0 = Math.floor(p.x / R), rz0 = Math.floor(p.z / R), span = R >= 500 ? 4 : 6;
        for (let rx = rx0 - span; rx <= rx0 + span; rx++) for (let rz = rz0 - span; rz <= rz0 + span; rz++) {
          const plan = fn(gen, rx, rz);
          if (plan) { const d = Math.hypot(plan.x - p.x, plan.z - p.z); if (!best || d < best[2]) best = [plan.x, plan.z, d, plan.y]; }
        }
        if (!best) return ERR('Aucune structure trouvée à proximité');
        return OK(`${label} le plus proche : ${best[0]} ~ ${best[1]} (${Math.round(best[2])} blocs)`);
      }
      return ERR('Usage : /locate village|stronghold|ancient_city|outpost|temple|mineshaft|monument (surface), fortress|bastion (Nether)');
    }
    default: return ERR('Commande inconnue. Tapez /help');
  }
}

import { _villagePlan as villagePlanPublic, _ancientPlan as ancientPlanPublic, _fortressPlan as fortressPlanPublic, _outpostPlan, _jungleTemplePlan, _mineshaftPlan, _monumentPlan } from '../world/gen/structures.js';
export { strongholdPositions };
