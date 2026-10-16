// =====================================================================
//  Core simulation
// =====================================================================
import { GameMap, T, MAP_SIZES } from './map.js';
import { findPath, nearestFree } from './pathfinding.js';
import { Unit, Building, Node, Projectile } from './entities.js';
import { UNITS, BUILDING_ROLES, FACTIONS, TECHS, AGES, START_RES, POP_MAX, RES, NODES, defaultMods, BUILD_RATE, BUILD_MENU } from './data.js';
import { clamp, dist, RNG } from './util.js';

const CELL = 2;

export class Game {
  constructor(opts) {
    this.opts = opts;
    this.seed = opts.seed || ((Math.random() * 1e9) | 0);
    this.rng = new RNG(this.seed);
    this.map = new GameMap(MAP_SIZES[opts.mapSize] || 80, this.seed);
    this.time = 0; this.speed = 1;
    this.entities = new Map();
    this.units = []; this.buildings = []; this.nodes = []; this.projectiles = []; this.decals = [];
    this.events = [];
    this.pathQueue = [];
    this.over = null;               // {winner}
    this.fogT = 0; this.gridT = 0;
    this.players = [
      this.makePlayer(0, opts.playerFaction, false),
      this.makePlayer(1, opts.playerFaction === 'elves' ? 'orcs' : 'elves', true, opts.difficulty),
    ];
    this.n = this.map.n;
    this.fog = new Uint8Array(this.n * this.n);       // 0 unexplored, 1 explored, 2 visible (player 0)
    this.visCount = new Uint16Array(this.n * this.n);
    this.grid = new Map();
    this.initWorld();
    this.updateFog(true);
  }
  makePlayer(idx, faction, isAI, difficulty) {
    const diff = difficulty || 'normal';
    const gatherMul = isAI ? ({ easy: 0.75, normal: 1.0, hard: 1.25 })[diff] : 1;
    return {
      idx, faction, f: FACTIONS[faction], isAI, difficulty: diff,
      res: { ...START_RES }, age: 1, techs: new Set(), upgraded: {}, mods: defaultMods(),
      gatherMul, pop: 0, popCap: 0, stats: { gathered: 0, kills: 0, lost: 0, razed: 0, trained: 0 },
      ageUpInProgress: false, lastAttackedAlert: -99, heroAlive: false,
    };
  }
  // ------------------------------------------------------------------
  initWorld() {
    const m = this.map;
    for (const nd of m.nodes) {
      const node = new Node(nd.kind, nd.tx, nd.ty, nd.amount, nd.variant, m.biome[m.idx(nd.tx, nd.ty)]);
      this.addNode(node);
    }
    for (const a of m.animals) {
      const u = new Unit(a.type, -1, a.x, a.y);
      u.state = 'wander'; this.addUnit(u);
    }
    for (const p of this.players) {
      const b = m.bases[p.faction];
      const tc = new Building('tc', p.idx, p.faction, b.x - 2, b.y - 2);
      this.finishBuilding(tc, true);
      // starting villagers + scout
      const spots = [[b.x - 3, b.y + 2.5], [b.x - 1, b.y + 3], [b.x + 1.5, b.y + 3], [b.x + 3.5, b.y - 1]];
      for (let i = 0; i < 3; i++) this.addUnit(new Unit(p.f.villager, p.idx, spots[i][0], spots[i][1]));
      this.addUnit(new Unit(p.f.scout, p.idx, spots[3][0], spots[3][1]));
    }
    this.recountPop();
  }
  addUnit(u) { this.entities.set(u.id, u); this.units.push(u); return u; }
  addNode(nd) { this.entities.set(nd.id, nd); this.nodes.push(nd); if (nd.nodeKind !== 'carcass') this.map.setBlocked(nd.tx, nd.ty, 1, nd.id); return nd; }
  addBuilding(b) {
    this.entities.set(b.id, b); this.buildings.push(b);
    if (!b.def.walkable) for (let y = 0; y < b.size; y++) for (let x = 0; x < b.size; x++) this.map.setBlocked(b.tx + x, b.ty + y, 1, b.id);
    else for (let y = 0; y < b.size; y++) for (let x = 0; x < b.size; x++) { const i = this.map.idx(b.tx + x, b.ty + y); this.map.occupant[i] = b.id; }
    return b;
  }
  finishBuilding(b, instant = false) {
    if (!this.entities.has(b.id)) this.addBuilding(b);
    b.complete = true; b.progress = 1; b.hp = b.maxHp;
    if (!instant) { this.emit({ type: 'buildingDone', b }); }
    this.recountPop();
  }
  emit(e) { e.time = this.time; this.events.push(e); }

  // ------------------------------------------------------------------
  //  Stats with modifiers
  // ------------------------------------------------------------------
  stats(u) {
    const d = u.def, p = u.owner >= 0 ? this.players[u.owner] : null;
    const s = { atk: d.atk, armor: d.armor, parmor: d.parmor, range: d.range, speed: d.speed, los: d.los, maxHp: d.hp, rof: d.rof };
    if (!p) return s;
    const m = p.mods, c = d.cls;
    if (c === 'villager') { s.maxHp += m.villagerHp; s.armor += m.villagerArmor; s.parmor += m.villagerArmor; s.speed *= m.villagerSpeed; }
    if (c === 'infantry' || c === 'cavalry' || c === 'hero' && d.range === 0 || c === 'siege' || c === 'scout') s.atk += m.meleeAtk;
    if (c === 'archer' || c === 'cavalry_archer' || (c === 'hero' && d.range > 0)) { s.atk += m.rangedAtk; s.range += m.range + (p.f.bonuses.archerRange || 0); }
    if (c === 'infantry') { s.armor += m.infArmor; s.parmor += m.infArmor; s.speed *= m.infSpeed; }
    if (c === 'cavalry' || c === 'cavalry_archer' || c === 'scout') { s.armor += m.cavArmor; s.parmor += m.cavArmor; }
    if (c === 'archer') { s.armor += m.archArmor; s.parmor += m.archArmor; }
    return s;
  }
  unitCost(p, defId) {
    const d = UNITS[defId]; const cost = { ...d.cost };
    if (d.cls === 'infantry' && p.f.bonuses.infantryCost) for (const k in cost) cost[k] = Math.round(cost[k] * p.f.bonuses.infantryCost);
    return cost;
  }
  buildingCost(p, role) {
    const cost = { ...BUILDING_ROLES[role].cost };
    if (role === 'house' && p.f.bonuses.houseCost) cost.wood = p.f.bonuses.houseCost;
    return cost;
  }
  canAfford(p, cost) { for (const k in cost) if ((p.res[k] || 0) < cost[k]) return false; return true; }
  pay(p, cost) { for (const k in cost) p.res[k] -= cost[k]; }
  refund(p, cost) { for (const k in cost) p.res[k] += cost[k]; }
  recountPop() {
    for (const p of this.players) {
      let pop = 0, cap = 0;
      for (const u of this.units) if (u.owner === p.idx && !u.dead) pop += u.def.pop;
      for (const b of this.buildings) if (b.owner === p.idx && !b.dead) { cap += b.pop; for (const q of b.queue) if (q.type === 'unit') pop += UNITS[q.id].pop; }
      p.pop = pop; p.popCap = Math.min(POP_MAX, cap);
    }
  }

  // ------------------------------------------------------------------
  //  Spatial grid
  // ------------------------------------------------------------------
  rebuildGrid() {
    this.grid.clear();
    for (const u of this.units) {
      if (u.dead) continue;
      const k = ((u.x / CELL) | 0) * 4096 + ((u.y / CELL) | 0);
      let a = this.grid.get(k); if (!a) { a = []; this.grid.set(k, a); } a.push(u);
    }
  }
  unitsNear(x, y, r, pred) {
    const out = [], c0x = ((x - r) / CELL) | 0, c1x = ((x + r) / CELL) | 0, c0y = ((y - r) / CELL) | 0, c1y = ((y + r) / CELL) | 0;
    for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) {
      const a = this.grid.get(cx * 4096 + cy); if (!a) continue;
      for (const u of a) { if (u.dead) continue; const d = dist(x, y, u.x, u.y); if (d <= r + u.radius && (!pred || pred(u))) out.push(u); }
    }
    return out;
  }
  nearestEnemy(x, y, r, owner, opts = {}) {
    let best = null, bd = Infinity;
    for (const u of this.unitsNear(x, y, r)) {
      if (u.owner === owner || u.owner === -1 && !opts.animals) continue;
      if (u.owner === -1 && !(u.def.hostile || u.def.aggressive && u.state === 'attack')) continue;
      if (opts.noVillagers && u.isVillager) continue;
      const d = dist(x, y, u.x, u.y) - u.radius; if (d < bd) { bd = d; best = u; }
    }
    if (!best || opts.includeBuildings) {
      for (const b of this.buildings) {
        if (b.dead || b.owner === owner || b.owner === -1) continue;
        const d = this.distToBuilding(x, y, b); if (d <= r && d + (best ? 2 : 0) < bd) { bd = d; best = b; }
      }
    }
    return best;
  }
  distToBuilding(x, y, b) {
    const dx = Math.max(b.tx - x, 0, x - (b.tx + b.size)), dy = Math.max(b.ty - y, 0, y - (b.ty + b.size));
    return Math.hypot(dx, dy);
  }
  distTo(u, t) {
    if (t.kind === 'building') return this.distToBuilding(u.x, u.y, t);
    return Math.max(0, dist(u.x, u.y, t.x, t.y) - (t.radius || 0.4));
  }
  entityAtTile(tx, ty) { const id = this.map.inBounds(tx, ty) ? this.map.occupant[this.map.idx(tx, ty)] : 0; return id ? this.entities.get(id) : null; }
  nearestNode(x, y, kind, maxR = 8, excludeFull = true) {
    let best = null, bd = Infinity;
    for (const nd of this.nodes) {
      if (nd.dead || nd.nodeKind !== kind || nd.amount <= 0) continue;
      const d = dist(x, y, nd.x, nd.y); if (d > maxR) continue;
      const score = d + (excludeFull ? nd.gatherers * 0.8 : 0);
      if (score < bd) { bd = score; best = nd; }
    }
    return best;
  }
  nearestDropoff(owner, x, y, res) {
    let best = null, bd = Infinity;
    for (const b of this.buildings) {
      if (b.dead || b.owner !== owner || !b.complete || !b.def.dropoff || !b.def.dropoff.includes(res)) continue;
      const d = this.distToBuilding(x, y, b); if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  ownBuildings(owner, role) { return this.buildings.filter(b => b.owner === owner && !b.dead && (!role || b.role === role)); }
  ownUnits(owner, pred) { return this.units.filter(u => u.owner === owner && !u.dead && (!pred || pred(u))); }

  // ------------------------------------------------------------------
  //  Placement
  // ------------------------------------------------------------------
  canPlace(p, role, tx, ty) {
    const def = BUILDING_ROLES[role]; const s = def.size, m = this.map;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const cx = tx + x, cy = ty + y;
      if (!m.inBounds(cx, cy)) return false;
      const t = m.terrain[m.idx(cx, cy)];
      if (t !== T.GRASS && t !== T.DIRT && t !== T.FOREST) return false;
      if (m.blocked[m.idx(cx, cy)] || m.occupant[m.idx(cx, cy)]) return false;
    }
    // units standing inside (own units get nudged; enemy blocks)
    for (const u of this.unitsNear(tx + s / 2, ty + s / 2, s)) {
      if (u.x >= tx && u.x < tx + s && u.y >= ty && u.y < ty + s) { if (u.owner !== p.idx) return false; }
    }
    // fog: must be explored (human player)
    if (!p.isAI) { for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) if (this.fog[m.idx(tx + x, ty + y)] === 0) return false; }
    return true;
  }
  placeBuilding(p, role, tx, ty, builders = []) {
    const def = BUILDING_ROLES[role];
    if (def.age > p.age) { this.emit({ type: 'msg', key: 'needAge', owner: p.idx }); return null; }
    if (!this.canPlace(p, role, tx, ty)) { this.emit({ type: 'msg', key: 'cannotPlace', owner: p.idx, warn: true }); return null; }
    const cost = this.buildingCost(p, role);
    if (!this.canAfford(p, cost)) { this.emit({ type: 'msg', key: 'notEnough', owner: p.idx, warn: true }); return null; }
    this.pay(p, cost);
    const b = new Building(role, p.idx, p.faction, tx, ty);
    this.addBuilding(b);
    // nudge own units out
    for (const u of this.unitsNear(b.x, b.y, b.size)) if (u.x >= tx && u.x < tx + b.size && u.y >= ty && u.y < ty + b.size && !def.walkable) { const f = nearestFree(this.map, u.x | 0, u.y | 0, 4); if (f) { u.x = f.x + 0.5; u.y = f.y + 0.5; } }
    for (const u of builders) this.cmdBuild([u], b);
    this.emit({ type: 'sound', name: 'place', x: b.x, y: b.y, owner: p.idx });
    return b;
  }

  // ------------------------------------------------------------------
  //  Commands
  // ------------------------------------------------------------------
  clearTask(u) {
    if (u.gatherNode && u.gatherNode.kind === 'node') u.gatherNode.gatherers = Math.max(0, u.gatherNode.gatherers - 1);
    if (u.buildTarget) u.buildTarget.builders = Math.max(0, u.buildTarget.builders - 1);
    u.gatherNode = null; u.buildTarget = null; u.target = null; u.attackMove = null; u.path = null; u.needPath = false; u.resumeTask = null;
  }
  setMoveTarget(u, x, y, accept = 0) {
    u.tx = clamp(x, 0.3, this.n - 0.3); u.ty = clamp(y, 0.3, this.n - 0.3); u.pathAccept = accept; u.needPath = true; u.path = null; u.stuckT = 0; u.pathFail = 0;
  }
  // repath only when no path, or the (moving) target drifted away from where we were heading
  needsRepath(u, t, drift = 1.2) {
    if (!u.path && !u.needPath) return true;
    if (u.repathT > 0 || t.kind !== 'unit') return false;
    return dist(t.x, t.y, u.tx, u.ty) > drift;
  }
  cmdMove(units, x, y, formation = true) {
    const n = units.length;
    units.forEach((u, i) => {
      if (u.dead || u.owner === -1 && !u.def.flee) return;
      this.clearTask(u); u.state = 'move';
      let ox = 0, oy = 0;
      if (formation && n > 1) { const ring = Math.ceil((Math.sqrt(n) - 1) / 2); const k = i; const r = Math.ceil(Math.sqrt(k + 1)) - 1; const a = (k * 2.399); ox = Math.cos(a) * r * 0.75; oy = Math.sin(a) * r * 0.75; void ring; }
      this.setMoveTarget(u, x + ox, y + oy, 0);
    });
    this.emit({ type: 'sound', name: 'move', owner: units[0]?.owner });
  }
  cmdAttackMove(units, x, y) {
    for (const u of units) { if (u.dead || !u.isMilitary) { if (!u.dead) { this.clearTask(u); u.state = 'move'; this.setMoveTarget(u, x, y); } continue; } this.clearTask(u); u.state = 'move'; u.attackMove = { x, y }; this.setMoveTarget(u, x, y); }
    this.emit({ type: 'sound', name: 'attack', owner: units[0]?.owner });
  }
  cmdAttack(units, target) {
    for (const u of units) {
      if (u.dead || target.dead) continue;
      if (u.isVillager && target.kind === 'unit' && target.owner === -1 && target.def.food) { this.cmdHunt(u, target); continue; }
      this.clearTask(u); u.state = 'attack'; u.target = target; u.repathT = 0;
    }
    this.emit({ type: 'sound', name: 'attack', owner: units[0]?.owner });
  }
  cmdHunt(u, animal) { this.clearTask(u); u.state = 'attack'; u.target = animal; u.hunting = true; u.huntT = 0; }
  cmdGather(units, node) {
    for (const u of units) {
      if (u.dead || !u.isVillager) continue;
      if (node.kind === 'unit') { this.cmdHunt(u, node); continue; }
      this.clearTask(u);
      // if carrying another resource type, drop it first
      if (u.carry && u.carry.amount > 0 && u.carry.res !== (node.kind === 'node' ? node.res : 'food')) { u.gatherNode = node; node.gatherers = (node.gatherers || 0) + 1; u.state = 'return'; continue; }
      u.gatherNode = node; if (node.kind === 'node') node.gatherers++; u.state = 'gather'; u.repathT = 0;
    }
    this.emit({ type: 'sound', name: 'move', owner: units[0]?.owner });
  }
  cmdBuild(units, b) {
    for (const u of units) { if (u.dead || !u.isVillager || b.complete || b.dead) continue; this.clearTask(u); u.buildTarget = b; b.builders++; u.state = 'build'; u.repathT = 0; }
    this.emit({ type: 'sound', name: 'move', owner: units[0]?.owner });
  }
  cmdStop(units) { for (const u of units) { if (u.dead) continue; this.clearTask(u); u.state = 'idle'; u.anim = 'idle'; } }
  cmdTrain(b, defId) {
    const p = this.players[b.owner];
    let id = p.upgraded[defId] || defId;
    const d = UNITS[id];
    if (!b.complete || b.dead) return false;
    if (d.unique && (p.heroAlive || b.queue.some(q => q.id === id))) return false;
    if (b.queue.length >= 8) return false;
    const cost = this.unitCost(p, id);
    if (!this.canAfford(p, cost)) { this.emit({ type: 'msg', key: 'notEnough', owner: b.owner, warn: true }); return false; }
    if (p.pop + d.pop > p.popCap) { this.emit({ type: 'msg', key: p.popCap >= POP_MAX ? 'popCap' : 'needHouse', owner: b.owner, warn: true }); return false; }
    this.pay(p, cost); b.queue.push({ type: 'unit', id, t: 0, total: d.time, cost });
    this.recountPop(); this.emit({ type: 'sound', name: 'click', owner: b.owner });
    return true;
  }
  cmdResearch(b, techId) {
    const p = this.players[b.owner], t = TECHS[techId];
    if (!b.complete || p.techs.has(techId) || b.queue.some(q => q.id === techId) || t.age > p.age) return false;
    if (t.req && !p.techs.has(t.req)) return false;
    if (this.buildings.some(o => o !== b && o.owner === b.owner && o.queue.some(q => q.id === techId))) return false;
    if (!this.canAfford(p, t.cost)) { this.emit({ type: 'msg', key: 'notEnough', owner: b.owner, warn: true }); return false; }
    this.pay(p, t.cost); b.queue.push({ type: 'tech', id: techId, t: 0, total: t.time, cost: t.cost });
    this.emit({ type: 'sound', name: 'click', owner: b.owner });
    return true;
  }
  ageRequirementMet(p) {
    if (p.age >= 3) return false;
    const need = AGES[p.age].req;      // AGES index = next age -1
    const count = this.buildings.filter(b => b.owner === p.idx && !b.dead && b.complete && b.def.age === p.age && !['house', 'farm', 'tc'].includes(b.role)).length;
    return count >= need;
  }
  cmdAgeUp(b) {
    const p = this.players[b.owner];
    if (p.age >= 3 || p.ageUpInProgress || !b.complete) return false;
    if (!this.ageRequirementMet(p)) { this.emit({ type: 'msg', text: { da: `Kræver ${AGES[p.age].req} bygninger fra denne tidsalder`, en: `Requires ${AGES[p.age].req} buildings from this age` }, owner: b.owner, warn: true }); return false; }
    const a = AGES[p.age];
    if (!this.canAfford(p, a.cost)) { this.emit({ type: 'msg', key: 'notEnough', owner: b.owner, warn: true }); return false; }
    this.pay(p, a.cost); p.ageUpInProgress = true;
    b.queue.push({ type: 'age', id: 'age' + (p.age + 1), t: 0, total: a.time, cost: a.cost });
    this.emit({ type: 'sound', name: 'click', owner: b.owner });
    return true;
  }
  cmdCancelQueue(b, i) {
    const q = b.queue[i]; if (!q) return;
    const p = this.players[b.owner]; this.refund(p, q.cost); if (q.type === 'age') p.ageUpInProgress = false;
    b.queue.splice(i, 1); this.recountPop();
  }
  cmdSetRally(b, x, y) { b.rally = { x, y }; const e = this.entityAtTile(x | 0, y | 0); if (e && (e.kind === 'node' || e.kind === 'building' && e.role === 'farm' && e.owner === b.owner)) b.rally.target = e; }
  cmdDelete(e) {
    if (e.kind === 'unit') this.killUnit(e, null);
    else if (e.kind === 'building') { if (!e.complete) this.refund(this.players[e.owner], this.buildingCost(this.players[e.owner], e.role)); this.destroyBuilding(e, null); }
  }

  // ------------------------------------------------------------------
  //  Update
  // ------------------------------------------------------------------
  update(dt) {
    if (this.over) return;
    this.time += dt;
    this.rebuildGrid();
    this.processPaths();
    for (const b of this.buildings) if (!b.dead) this.updateBuilding(b, dt);
    for (const u of this.units) if (!u.dead) this.updateUnit(u, dt); else u.deathT += dt;
    this.separate(dt);
    for (const pr of this.projectiles) this.updateProjectile(pr, dt);
    // cleanup
    if (this.units.some(u => u.dead && u.deathT > 3)) { this.units = this.units.filter(u => { if (u.dead && u.deathT > 3) { this.entities.delete(u.id); return false; } return true; }); }
    if (this.projectiles.some(p => p.dead)) this.projectiles = this.projectiles.filter(p => !p.dead);
    if (this.buildings.some(b => b.dead)) this.buildings = this.buildings.filter(b => !b.dead);
    if (this.nodes.some(n => n.dead)) this.nodes = this.nodes.filter(n => !n.dead);
    for (const d of this.decals) d.t += dt; if (this.decals.length > 40) this.decals.shift();
    this.fogT += dt; if (this.fogT > 0.3) { this.fogT = 0; this.updateFog(); }
    this.checkVictory();
  }

  // ------------- paths -------------
  processPaths() {
    let budget = 12;
    const N = this.units.length; if (!N) return;
    this.pathRR = (this.pathRR || 0) % N;
    for (let k = 0; k < N && budget > 0; k++) {
      const u = this.units[(this.pathRR + k) % N];
      if (u.dead || !u.needPath) continue;
      u.needPath = false; budget--; this.pathRR = (this.pathRR + k + 1) % N;
      const far = Math.abs(u.x - u.tx) + Math.abs(u.y - u.ty) > 40;
      const p = findPath(this.map, u.x, u.y, u.tx, u.ty, u.pathAccept || 0, far ? 6000 : 3000);
      if (p && p.length) { u.path = p; u.pathIdx = 0; }
      else if (p && p.length === 0) { u.path = []; u.pathIdx = 0; }
      else { u.path = []; u.pathIdx = 0; u.pathFail = (u.pathFail || 0) + 1; if (u.pathFail >= 2) this.unreachable(u); }
    }
  }
  unreachable(u) {
    u.pathFail = 0;
    if (u.state === 'gather' && u.gatherNode) { if (u.gatherNode.kind === 'node') u.gatherNode.gatherers = Math.max(0, u.gatherNode.gatherers - 1); u.gatherNode = null; u.state = u.carry && u.carry.amount > 0 ? 'return' : 'idle'; }
    else if (u.state === 'attack') { u.target = null; if (!u.attackMove) u.state = 'idle'; else { u.state = 'move'; this.setMoveTarget(u, u.attackMove.x, u.attackMove.y); } }
    else if (u.state === 'build') { if (u.buildTarget) u.buildTarget.builders = Math.max(0, u.buildTarget.builders - 1); u.buildTarget = null; u.state = 'idle'; }
    else if (u.state === 'return') { u.state = 'idle'; u.dropoff = null; }
    else { this.arrive(u); }
    u.anim = 'idle';
  }
  arrive(u) {
    if (u.state === 'move') { if (u.attackMove) { u.attackMove = null; } u.state = 'idle'; u.anim = 'idle'; if (u.resumeTask) { const r = u.resumeTask; u.resumeTask = null; if (r.type === 'gather' && r.node && !r.node.dead) this.cmdGather([u], r.node); } }
  }
  // move along path; returns true if reached destination
  followPath(u, dt, speed) {
    if (u.path === null) { if (!u.needPath) u.needPath = true; return false; }
    if (u.pathIdx < u.path.length) {
      // stuck detection while following waypoints: no progress -> new path
      if (u.lastPX !== undefined && Math.abs(u.x - u.lastPX) + Math.abs(u.y - u.lastPY) < speed * dt * 0.15) { u.stuckT += dt; if (u.stuckT > 1.5) { u.stuckT = 0; u.path = null; u.needPath = true; u.lastPX = undefined; return false; } } else u.stuckT = 0;
      u.lastPX = u.x; u.lastPY = u.y;
      const wp = u.path[u.pathIdx];
      const d = dist(u.x, u.y, wp.x, wp.y);
      const step = speed * this.map.speedFactor(u.x, u.y) * dt;
      if (d <= step) { u.x = wp.x; u.y = wp.y; u.pathIdx++; }
      else {
        const ox = u.x, oy = u.y;
        this.stepTo(u, wp.x, wp.y, step);
        if (!this.map.isPassable(u.x | 0, u.y | 0)) { u.x = ox; u.y = oy; u.needPath = true; u.path = null; }
      }
      return false;
    }
    // final approach to exact target
    u.lastPX = undefined;
    const d = dist(u.x, u.y, u.tx, u.ty);
    if (u.pathAccept > 0 || d < 0.25) return true;
    const ox = u.x, oy = u.y;
    this.stepTo(u, u.tx, u.ty, Math.min(d, speed * dt));
    if (!this.map.isPassable(u.x | 0, u.y | 0)) { u.x = ox; u.y = oy; return true; }
    return dist(u.x, u.y, u.tx, u.ty) < 0.25;
  }
  stepTo(u, x, y, step) {
    const dx = x - u.x, dy = y - u.y, d = Math.hypot(dx, dy) || 1;
    u.x += dx / d * step; u.y += dy / d * step; u.fx = dx / d; u.fy = dy / d; u.anim = 'walk'; u.animT += step * 1.6;
  }
  pathToEntity(u, t, accept = 1) {
    if (t.kind === 'building' && t.def.walkable) { this.setMoveTarget(u, t.x, t.y, 0); return; }
    if (t.kind === 'building') {
      const cx = clamp(u.x, t.tx + 0.5, t.tx + t.size - 0.5), cy = clamp(u.y, t.ty + 0.5, t.ty + t.size - 0.5);
      this.setMoveTarget(u, cx, cy, accept);
    } else if (t.kind === 'node') this.setMoveTarget(u, t.x, t.y, accept);
    else this.setMoveTarget(u, t.x, t.y, 0);
  }

  // ------------- units -------------
  updateUnit(u, dt) {
    const st = this.stats(u);
    u.cooldown -= dt;
    if (u.def.regen && u.hp < st.maxHp) u.hp = Math.min(st.maxHp, u.hp + u.def.regen * dt);
    if (u.owner === -1) return this.updateAnimal(u, dt, st);
    // auto-acquire for military idle / attack-move
    u.scanT -= dt;
    if (u.scanT <= 0 && u.isMilitary && (u.state === 'idle' || u.attackMove)) {
      u.scanT = 0.45;
      const e = this.nearestEnemy(u.x, u.y, Math.max(st.los, st.range + 1), u.owner, { includeBuildings: !!u.attackMove, animals: false });
      if (e) { u.target = e; u.state = 'attack'; u.anim = 'idle'; u.path = null; }
    }
    switch (u.state) {
      case 'idle': u.anim = 'idle'; u.animT += dt; break;
      case 'move': {
        if (this.followPath(u, dt, st.speed)) { this.arrive(u); }
        break; }
      case 'attack': this.updateAttack(u, dt, st); break;
      case 'gather': this.updateGather(u, dt, st); break;
      case 'return': this.updateReturn(u, dt, st); break;
      case 'build': this.updateBuild(u, dt, st); break;
      case 'flee': { u.fleeT -= dt; if (this.followPath(u, dt, st.speed * 1.1) || u.fleeT <= 0) { u.state = 'idle'; u.anim = 'idle'; } break; }
    }
  }
  updateAttack(u, dt, st) {
    const t = u.target;
    if (!t || t.dead || (t.kind === 'unit' && t.hp <= 0)) {
      // hunting: find carcass where the animal died
      if (u.hunting && t && t.carcass && !t.carcass.dead) { u.hunting = false; this.cmdGather([u], t.carcass); return; }
      u.hunting = false; u.target = null;
      if (u.attackMove) { u.state = 'move'; this.setMoveTarget(u, u.attackMove.x, u.attackMove.y); return; }
      // retarget nearby
      if (u.isMilitary) { const e = this.nearestEnemy(u.x, u.y, st.los, u.owner, { includeBuildings: true }); if (e) { u.target = e; return; } }
      u.state = 'idle'; u.anim = 'idle'; return;
    }
    const range = st.range > 0 ? st.range : 0.25;
    const d = this.distTo(u, t);
    if (u.hunting) { u.huntT = (u.huntT || 0) + dt; if (u.huntT > 40) { u.hunting = false; u.target = null; u.state = 'idle'; return; } }
    if (d <= range + 0.05) {
      u.path = null; u.needPath = false;
      // face target
      const dx = t.x - u.x, dy = t.y - u.y, L = Math.hypot(dx, dy) || 1; u.fx = dx / L; u.fy = dy / L;
      u.anim = 'attack';
      if (u.cooldown <= 0) {
        u.cooldown = st.rof; u.animT = 0;
        if (st.range > 0) {
          const pr = new Projectile(u.x, u.y, t, this.calcDamage(u, st, t, true), u.owner, { z0: 1.2, bonusCls: null }); pr.shooter = u;
          this.projectiles.push(pr); this.emit({ type: 'sound', name: 'arrow', x: u.x, y: u.y });
        } else {
          this.applyDamage(t, this.calcDamage(u, st, t, false), u);
          this.emit({ type: 'sound', name: t.kind === 'building' ? 'hitWood' : 'hit', x: u.x, y: u.y });
          this.emit({ type: 'fx', fx: t.kind === 'building' ? 'dust' : 'blood', x: t.x + (t.kind === 'building' ? 0 : -u.fx * 0.2), y: t.y - (t.kind === 'building' ? 0 : u.fy * 0.2) });
        }
      } else u.animT += dt;
    } else {
      u.repathT -= dt;
      if (this.needsRepath(u, t, 1.0)) { u.repathT = 0.5; this.pathToEntity(u, t, st.range > 0 ? Math.max(1, Math.floor(st.range)) : 1); }
      const arrived = this.followPath(u, dt, st.speed);
      if (arrived && d > range + 0.05) { // path ended but still out of range: nudge straight
        this.stepTo(u, t.x, t.y, Math.min(st.speed * dt, d - range));
        if (!this.map.isPassable(u.x | 0, u.y | 0)) { u.repathT = 0; }
      }
    }
  }
  calcDamage(u, st, t, pierce) {
    const d = u.def;
    let atk = st.atk;
    if (t.kind === 'unit') { atk += d.bonus[t.def.cls] || 0; const tst = this.stats(t); atk -= pierce ? tst.parmor : tst.armor; }
    else { atk += d.bonus.building || 0; atk -= pierce ? t.def.parmor : t.def.armor; if (pierce && !(d.bonus.building)) atk = Math.min(atk, Math.max(1, st.atk * 0.5)); }
    return Math.max(1, atk);
  }
  applyDamage(t, dmg, attacker) {
    if (t.dead) return;
    t.hp -= dmg; t.lastHitT = this.time; t.lastAttacker = attacker;
    if (t.owner >= 0) {
      const p = this.players[t.owner];
      if (this.time - p.lastAttackedAlert > 25 && attacker && attacker.owner !== t.owner) { p.lastAttackedAlert = this.time; this.emit({ type: 'attacked', owner: t.owner, x: t.x, y: t.y }); }
    }
    if (t.kind === 'unit') {
      if (t.owner >= 0 && attacker && attacker.kind === 'unit' && attacker.def) {
        if (t.isVillager && t.state !== 'flee' && attacker.owner !== t.owner) this.villagerFlee(t, attacker);
        else if (t.isMilitary && (t.state === 'idle' || t.state === 'move' && !t.attackMove && dist(t.x, t.y, t.tx, t.ty) < 2)) { t.state = 'attack'; t.target = attacker; }
        else if (t.isMilitary && t.state === 'attack' && t.target && t.target.kind === 'building' && attacker.kind === 'unit') { t.target = attacker; }
      }
      else if (t.owner >= 0 && attacker && attacker.kind === 'building' && t.isVillager && t.state !== 'flee') this.villagerFlee(t, attacker);
      if (t.owner === -1 && attacker && attacker.kind === 'unit' && attacker.def) this.animalHit(t, attacker);
      if (t.hp <= 0) this.killUnit(t, attacker);
    } else if (t.hp <= 0) this.destroyBuilding(t, attacker);
  }
  villagerFlee(v, attacker) {
    const tc = this.ownBuildings(v.owner, 'tc')[0] || this.ownBuildings(v.owner, 'tower')[0];
    v.resumeTask = v.gatherNode ? { type: 'gather', node: v.gatherNode } : null;
    this.clearTask(v); v.state = 'flee'; v.fleeT = 9;
    if (tc) this.pathToEntity(v, tc, 2);
    else { const dx = v.x - attacker.x, dy = v.y - attacker.y, L = Math.hypot(dx, dy) || 1; this.setMoveTarget(v, v.x + dx / L * 6, v.y + dy / L * 6); }
  }
  killUnit(u, attacker) {
    if (u.dead) return;
    u.dead = true; u.deathT = 0; u.hp = 0; u.selected = false;
    this.clearTask(u);
    if (u.owner >= 0) { this.players[u.owner].stats.lost++; if (u.def.unique) this.players[u.owner].heroAlive = false; }
    if (attacker && attacker.owner >= 0 && attacker.owner !== u.owner) this.players[attacker.owner].stats.kills++;
    if (u.owner === -1 && u.def.food) {
      const nd = new Node('carcass', u.x | 0, u.y | 0, u.def.food, 1, 0.5); nd.x = u.x; nd.y = u.y; this.addNode(nd); u.carcass = nd;
      // any hunters attacking this animal switch to gathering
      for (const h of this.units) if (h.target === u && h.hunting) { h.hunting = false; this.cmdGather([h], nd); }
    }
    this.emit({ type: 'sound', name: u.def.cls === 'animal' ? 'animalDie' : 'die', x: u.x, y: u.y });
    this.emit({ type: 'fx', fx: 'death', x: u.x, y: u.y });
    this.recountPop();
  }
  destroyBuilding(b, attacker) {
    if (b.dead) return;
    b.dead = true; b.selected = false; b.hp = 0;
    for (let y = 0; y < b.size; y++) for (let x = 0; x < b.size; x++) { this.map.setBlocked(b.tx + x, b.ty + y, 0); }
    for (const q of b.queue) if (q.type === 'age') this.players[b.owner].ageUpInProgress = false;
    for (const u of this.units) { if (u.buildTarget === b) { u.buildTarget = null; u.state = 'idle'; } if (u.gatherNode === b) { u.gatherNode = null; u.state = u.carry && u.carry.amount > 0 ? 'return' : 'idle'; } if (u.target === b) u.target = null; }
    if (attacker && attacker.owner >= 0 && attacker.owner !== b.owner) { this.players[attacker.owner].stats.razed++; this.emit({ type: 'sound', name: 'collapse', x: b.x, y: b.y }); this.emit({ type: 'fx', fx: 'collapse', x: b.x, y: b.y, size: b.size }); this.decals.push({ x: b.x, y: b.y, size: b.size, t: 0, variant: b.variant }); }
    this.emit({ type: 'buildingLost', b, owner: b.owner });
    this.recountPop();
  }
  animalHit(a, attacker) {
    if (a.def.aggressive || a.def.hostile) { a.state = 'attack'; a.target = attacker; }
    else if (a.def.flee) { a.state = 'flee'; a.fleeT = 2; const dx = a.x - attacker.x, dy = a.y - attacker.y, L = Math.hypot(dx, dy) || 1; this.setMoveTarget(a, a.x + dx / L * 3, a.y + dy / L * 3); }
  }
  updateAnimal(u, dt, st) {
    const d = u.def;
    if (u.state === 'attack') {
      const t = u.target;
      if (!t || t.dead || dist(u.x, u.y, u.homeX, u.homeY) > (d.hostile ? 14 : 10)) { u.target = null; u.state = 'move'; this.setMoveTarget(u, u.homeX, u.homeY); return; }
      const dd = this.distTo(u, t);
      if (dd <= 0.3) { u.anim = 'attack'; u.fx = Math.sign(t.x - u.x) || 1; u.fy = Math.sign(t.y - u.y); if (u.cooldown <= 0) { u.cooldown = st.rof; u.animT = 0; this.applyDamage(t, Math.max(1, st.atk - this.stats(t).armor), u); this.emit({ type: 'sound', name: 'hit', x: u.x, y: u.y }); this.emit({ type: 'fx', fx: 'blood', x: t.x, y: t.y }); } else u.animT += dt; }
      else { u.repathT -= dt; if (this.needsRepath(u, t, 1.0)) { u.repathT = 0.5; this.pathToEntity(u, t, 0); } this.followPath(u, dt, st.speed); }
      return;
    }
    if (u.state === 'flee') { u.fleeT -= dt; if (this.followPath(u, dt, st.speed) || u.fleeT <= 0) { u.state = 'wander'; u.anim = 'idle'; } return; }
    if (u.state === 'move') { if (this.followPath(u, dt, st.speed * 0.6)) { u.state = 'wander'; u.anim = 'idle'; } return; }
    // wander
    u.anim = 'idle'; u.animT += dt; u.wanderT -= dt;
    if (d.hostile || d.aggressive) {
      u.scanT -= dt;
      if (u.scanT <= 0) { u.scanT = 0.6; if (d.hostile) { const e = this.nearestEnemy(u.x, u.y, st.los, -1, { noVillagers: false }); if (e && e.kind === 'unit') { u.state = 'attack'; u.target = e; } } }
    }
    if (d.flee && u.wanderT < 1.5) { // deer: flee from approaching units
      const near = this.unitsNear(u.x, u.y, 1.6, o => o.owner >= 0 && o.anim === 'walk');
      if (near.length) { const o = near[0]; u.state = 'flee'; u.fleeT = 1.6; const dx = u.x - o.x, dy = u.y - o.y, L = Math.hypot(dx, dy) || 1; this.setMoveTarget(u, u.x + dx / L * 2.5, u.y + dy / L * 2.5); return; }
    }
    if (u.wanderT <= 0) { u.wanderT = 3 + this.rng.next() * 6; const a = this.rng.next() * Math.PI * 2, r = 1 + this.rng.next() * 2.5; const nx = clamp(u.homeX + Math.cos(a) * r, 1, this.n - 2), ny = clamp(u.homeY + Math.sin(a) * r, 1, this.n - 2); if (this.map.isPassable(nx | 0, ny | 0)) { u.state = 'move'; this.setMoveTarget(u, nx, ny); } }
  }

  // ------------- gathering -------------
  resOf(target) { return target.kind === 'node' ? target.res : 'food'; }
  gatherKind(target) { return target.kind === 'node' ? target.nodeKind : 'farm'; }
  updateGather(u, dt, st) {
    const p = this.players[u.owner];
    let nd = u.gatherNode;
    if (!nd || nd.dead || (nd.kind === 'node' ? nd.amount <= 0 : (!nd.complete || nd.farmFood <= 0 && !this.tryReseed(nd)))) {
      // find replacement
      const kind = nd ? this.gatherKind(nd) : null;
      if (nd && nd.kind === 'node') nd.gatherers = Math.max(0, nd.gatherers - 1);
      u.gatherNode = null;
      const alt = kind && kind !== 'farm' ? this.nearestNode(nd.x, nd.y, kind, 7) : null;
      if (alt) { u.gatherNode = alt; alt.gatherers++; u.repathT = 0; }
      else if (u.carry && u.carry.amount > 0) { u.state = 'return'; }
      else { u.state = 'idle'; u.anim = 'idle'; }
      return;
    }
    const res = this.resOf(nd);
    if (u.carry && u.carry.res !== res && u.carry.amount > 0) { u.state = 'return'; return; }
    const cap = p.mods.carry;
    if (u.carry && u.carry.amount >= cap) { u.state = 'return'; return; }
    const d = nd.kind === 'node' ? Math.max(Math.abs(u.x - nd.x), Math.abs(u.y - nd.y)) : dist(u.x, u.y, nd.x, nd.y);
    const reach = nd.kind === 'node' ? 1.25 : 1.1;
    if (d <= reach) {
      u.path = null; u.needPath = false;
      u.anim = 'gather'; u.animT += dt; const dx = nd.x - u.x, dy = nd.y - u.y, L = Math.hypot(dx, dy) || 1; u.fx = dx / L; u.fy = dy / L;
      const kind = this.gatherKind(nd);
      let rate = p.mods.gather[kind] * p.gatherMul * (p.f.bonuses.gather?.[kind] || 1);
      if (!u.carry || u.carry.res !== res) u.carry = { res, amount: 0 };
      let amt = rate * dt;
      if (nd.kind === 'node') { amt = Math.min(amt, nd.amount); nd.amount -= amt; if (nd.amount <= 0.01) this.depleteNode(nd); }
      else { amt = Math.min(amt, nd.farmFood); nd.farmFood -= amt; }
      u.carry.amount += amt;
      if (u.cooldown <= 0) { u.cooldown = 1.4; this.emit({ type: 'sound', name: kind === 'tree' ? 'chop' : (kind === 'gold' || kind === 'stone') ? 'mine' : 'gather', x: u.x, y: u.y }); if (kind === 'tree') this.emit({ type: 'fx', fx: 'leaf', x: nd.x, y: nd.y }); }
    } else {
      if (!u.path && !u.needPath) this.pathToEntity(u, nd, nd.kind === 'node' ? 1 : 0);
      if (this.followPath(u, dt, st.speed) && d > reach) { this.stepTo(u, nd.x, nd.y, Math.min(st.speed * dt, d - reach + 0.05)); }
    }
  }
  depleteNode(nd) {
    nd.dead = true; nd.amount = 0;
    this.map.setBlocked(nd.tx, nd.ty, 0);
    if (nd.nodeKind === 'tree') { const i = this.map.idx(nd.tx, nd.ty); if (this.map.terrain[i] === T.FOREST) this.map.terrain[i] = T.GRASS; this.emit({ type: 'terrain', tx: nd.tx, ty: nd.ty }); }
    this.entities.delete(nd.id);
  }
  tryReseed(farm) {
    const p = this.players[farm.owner];
    if (p.res.wood >= 60) { p.res.wood -= 60; farm.farmFood = farm.def.farm; if (!p.isAI) this.emit({ type: 'msg', key: 'farmReseed', owner: p.idx }); return true; }
    if (!p.isAI) this.emit({ type: 'msg', key: 'farmExhausted', owner: p.idx, warn: true });
    this.destroyBuilding(farm, null); return false;
  }
  updateReturn(u, dt, st) {
    if (!u.carry || u.carry.amount <= 0) { u.state = u.gatherNode ? 'gather' : 'idle'; return; }
    const res = u.carry.res;
    const dp = this.nearestDropoff(u.owner, u.x, u.y, res);
    if (!dp) { u.state = 'idle'; u.anim = 'idle'; return; }
    if (u.dropoff !== dp) { u.dropoff = dp; this.pathToEntity(u, dp, 1); }
    const d = this.distToBuilding(u.x, u.y, dp);
    if (d <= 0.6) {
      const p = this.players[u.owner]; const amt = Math.round(u.carry.amount);
      p.res[res] += amt; p.stats.gathered += amt; u.carry = null; u.dropoff = null; u.path = null;
      this.emit({ type: 'sound', name: 'deposit', x: u.x, y: u.y });
      if (u.gatherNode && !u.gatherNode.dead) { u.state = 'gather'; u.repathT = 0; } else { u.state = 'idle'; u.anim = 'idle'; }
    } else { if (!u.path && !u.needPath) this.pathToEntity(u, dp, 1); if (this.followPath(u, dt, st.speed) && d > 0.6) this.stepTo(u, dp.x, dp.y, Math.min(st.speed * dt, d - 0.5)); }
  }
  // ------------- building -------------
  updateBuild(u, dt, st) {
    const b = u.buildTarget;
    if (!b || b.dead || b.complete) {
      if (b && b.complete && b.role === 'farm' && b.owner === u.owner) { u.buildTarget = null; this.cmdGather([u], b); return; }
      u.buildTarget = null;
      // look for another unfinished building nearby
      const nb = this.buildings.find(o => o.owner === u.owner && !o.dead && !o.complete && this.distToBuilding(u.x, u.y, o) < 6);
      if (nb) { this.cmdBuild([u], nb); return; }
      u.state = 'idle'; u.anim = 'idle'; return;
    }
    const d = this.distToBuilding(u.x, u.y, b);
    if (d <= 0.7) {
      u.path = null; u.needPath = false; u.anim = 'gather'; u.animT += dt;
      const dx = b.x - u.x, dy = b.y - u.y, L = Math.hypot(dx, dy) || 1; u.fx = dx / L; u.fy = dy / L;
      const eff = b.builders <= 1 ? 1 : Math.pow(0.85, b.builders - 1);
      b.progress += dt / b.def.time * BUILD_RATE * eff;
      b.hp = Math.min(b.maxHp, b.hp + b.maxHp * dt / b.def.time * eff * 0.9);
      if (u.cooldown <= 0) { u.cooldown = 1.2; this.emit({ type: 'sound', name: 'hammer', x: u.x, y: u.y }); this.emit({ type: 'fx', fx: 'dust', x: b.x + (this.rng.next() - 0.5) * b.size, y: b.y + (this.rng.next() - 0.5) * b.size }); }
      if (b.progress >= 1) this.finishBuilding(b);
    } else { if (!u.path && !u.needPath) this.pathToEntity(u, b, 1); if (this.followPath(u, dt, st.speed) && d > 0.7) this.stepTo(u, b.x, b.y, Math.min(st.speed * dt, d - 0.6)); }
  }
  // ------------- buildings -------------
  updateBuilding(b, dt) {
    if (!b.complete) return;
    const p = this.players[b.owner];
    // production queue
    if (b.queue.length) {
      const q = b.queue[0]; q.t += dt;
      if (q.t >= q.total) {
        b.queue.shift();
        if (q.type === 'unit') this.spawnUnit(b, q.id);
        else if (q.type === 'tech') this.applyTech(p, q.id);
        else if (q.type === 'age') { p.age++; p.ageUpInProgress = false; this.emit({ type: 'age', owner: p.idx, age: p.age }); }
        this.recountPop();
      }
    }
    // defensive fire
    if (b.def.atk) {
      b.cooldown -= dt;
      if (b.cooldown <= 0) {
        b.cooldown = 0.3;
        const e = this.nearestEnemy(b.x, b.y, b.def.range + b.size / 2, b.owner, { animals: false });
        if (e && e.kind === 'unit') {
          b.cooldown = b.def.rof;
          const dmg = Math.max(1, b.def.atk + (p.mods.rangedAtk > 0 ? 1 : 0) - this.stats(e).parmor);
          const pr = new Projectile(b.x, b.y, e, dmg, b.owner, { z0: b.role === 'tower' ? 2.4 : 2.0, speed: 10 }); pr.shooter = b; this.projectiles.push(pr);
          this.emit({ type: 'sound', name: 'arrow', x: b.x, y: b.y });
        }
      }
    }
  }
  spawnUnit(b, defId) {
    const p = this.players[b.owner];
    const id = p.upgraded[defId] || defId;
    const d = UNITS[id];
    // spawn tile: near rally side, else bottom edge
    const rx = b.rally ? b.rally.x : b.x, ry = b.rally ? b.rally.y + 3 : b.y + b.size;
    let best = null, bd = Infinity;
    for (let y = b.ty - 1; y <= b.ty + b.size; y++) for (let x = b.tx - 1; x <= b.tx + b.size; x++) {
      if (x >= b.tx && x < b.tx + b.size && y >= b.ty && y < b.ty + b.size) continue;
      if (!this.map.isPassable(x, y)) continue;
      const dd = dist(x + 0.5, y + 0.5, rx, ry); if (dd < bd) { bd = dd; best = { x, y }; }
    }
    if (!best) best = nearestFree(this.map, b.tx, b.ty + b.size, 5) || { x: b.tx, y: b.ty + b.size };
    const u = new Unit(id, b.owner, best.x + 0.5, best.y + 0.5);
    u.hp = this.stats(u).maxHp;
    this.addUnit(u); p.stats.trained++;
    if (d.unique) p.heroAlive = true;
    if (b.rally) {
      if (b.rally.target && !b.rally.target.dead && u.isVillager) this.cmdGather([u], b.rally.target);
      else { u.state = 'move'; this.setMoveTarget(u, b.rally.x + (this.rng.next() - 0.5), b.rally.y + (this.rng.next() - 0.5)); }
    }
    this.emit({ type: 'unitReady', u, owner: b.owner });
    return u;
  }
  applyTech(p, id) {
    const t = TECHS[id]; p.techs.add(id);
    if (t.apply) t.apply(p.mods);
    if (t.upgrade) {
      const [from, to] = t.upgrade; p.upgraded[from] = to;
      for (const u of this.units) if (u.owner === p.idx && !u.dead && u.def.id === from) { const ratio = u.hp / this.stats(u).maxHp; u.def = UNITS[to]; u.hp = ratio * this.stats(u).maxHp; }
    }
    // retro-apply hp bonuses
    this.emit({ type: 'tech', owner: p.idx, id });
  }
  // ------------- projectiles -------------
  updateProjectile(pr, dt) {
    pr.t += dt;
    const t = pr.target;
    const k = Math.min(1, pr.t / pr.dur);
    const tx = t.x, ty = t.y;
    pr.x = pr.sx + (tx - pr.sx) * k; pr.y = pr.sy + (ty - pr.sy) * k;
    pr.z = 0.9 * (1 - k) + 0.6 * k + Math.sin(k * Math.PI) * pr.arc;
    if (k >= 1) {
      pr.dead = true;
      if (!t.dead && t.kind === 'unit' && t.anim === 'walk' && !pr.fromBuilding && this.rng.next() < 0.18) { this.emit({ type: 'fx', fx: 'arrowMiss', x: t.x + (this.rng.next() - 0.5) * 1.2, y: t.y + (this.rng.next() - 0.5) * 1.2, owner: pr.owner }); return; }
      if (!t.dead) {
        this.applyDamage(t, pr.dmg, pr.shooter && !pr.shooter.dead ? pr.shooter : null);
        this.emit({ type: 'fx', fx: t.kind === 'building' ? 'spark' : 'blood', x: t.x, y: t.y });
        this.emit({ type: 'sound', name: 'arrowHit', x: t.x, y: t.y });
      }
    }
  }
  // ------------- separation -------------
  separate(dt) {
    for (const [, cell] of this.grid) {
      for (let i = 0; i < cell.length; i++) {
        const a = cell[i];
        for (let j = i + 1; j < cell.length; j++) {
          const b = cell[j];
          const dx = b.x - a.x, dy = b.y - a.y; const d2 = dx * dx + dy * dy; const min = a.radius + b.radius;
          if (d2 < min * min && d2 > 1e-6) {
            const d = Math.sqrt(d2), push = (min - d) * 0.5;
            const nx = dx / d, ny = dy / d;
            const am = a.anim === 'walk' ? 0.35 : 1, bm = b.anim === 'walk' ? 0.35 : 1;
            const ax = a.x - nx * push * am, ay = a.y - ny * push * am, bx = b.x + nx * push * bm, by = b.y + ny * push * bm;
            if (this.map.isPassable(ax | 0, ay | 0)) { a.x = ax; a.y = ay; }
            if (this.map.isPassable(bx | 0, by | 0)) { b.x = bx; b.y = by; }
          }
        }
      }
    }
    // also handle neighbours across cell borders cheaply: skipped (CELL=2 > 2*radius)
  }
  // ------------- fog -------------
  updateFog(initial = false) {
    const n = this.n, fog = this.fog;
    for (let i = 0; i < fog.length; i++) if (fog[i] === 2) fog[i] = 1;
    const reveal = (x, y, r) => {
      const x0 = Math.max(0, (x - r) | 0), x1 = Math.min(n - 1, (x + r) | 0), y0 = Math.max(0, (y - r) | 0), y1 = Math.min(n - 1, (y + r) | 0), r2 = r * r;
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) { const dx = xx + 0.5 - x, dy = yy + 0.5 - y; if (dx * dx + dy * dy <= r2) fog[yy * n + xx] = 2; }
    };
    for (const u of this.units) if (u.owner === 0 && !u.dead) reveal(u.x, u.y, this.stats(u).los);
    for (const b of this.buildings) if (b.owner === 0 && !b.dead) reveal(b.x, b.y, b.def.los + b.size / 2);
    // end-game help: when the enemy is down to its last few buildings, mark them as explored so they can be found
    const enemyLeft = this.buildings.filter(b => b.owner === 1 && !b.dead && b.role !== 'farm');
    if (enemyLeft.length > 0 && enemyLeft.length <= 3 && this.time > 300) for (const b of enemyLeft) for (let y = 0; y < b.size; y++) for (let x = 0; x < b.size; x++) { const i = this.map.idx(b.tx + x, b.ty + y); if (fog[i] === 0) fog[i] = 1; }
    this.fogDirty = true;
  }
  isVisible(x, y) { const i = this.map.idx(x | 0, y | 0); return this.fog[i] === 2; }
  isExplored(x, y) { const i = this.map.idx(x | 0, y | 0); return this.fog[i] >= 1; }
  // ------------------------------------------------------------------
  //  Save / load
  // ------------------------------------------------------------------
  serialize() {
    const bIndex = new Map(); this.buildings.forEach((b, i) => bIndex.set(b, i));
    const ref = (t) => { if (!t || t.dead) return null; if (t.kind === 'node') return { n: [t.tx, t.ty] }; if (t.kind === 'building') return { b: bIndex.get(t) }; return null; };
    const rle = (arr) => { const out = []; let v = arr[0], c = 0; for (const x of arr) { if (x === v) c++; else { out.push(v, c); v = x; c = 1; } } out.push(v, c); return out; };
    return {
      v: 1, seed: this.seed, opts: this.opts, time: this.time,
      players: this.players.map(p => ({ res: p.res, age: p.age, techs: [...p.techs], stats: p.stats, heroAlive: p.heroAlive, ageUpInProgress: p.ageUpInProgress, lastAttackedAlert: p.lastAttackedAlert })),
      nodes: this.nodes.filter(n => !n.dead).map(n => [n.nodeKind, n.tx, n.ty, Math.round(n.amount), n.variant, +n.x.toFixed(2), +n.y.toFixed(2)]),
      buildings: this.buildings.filter(b => !b.dead).map(b => ({ role: b.role, o: b.owner, tx: b.tx, ty: b.ty, hp: Math.round(b.hp), prog: +b.progress.toFixed(3), complete: b.complete, queue: b.queue.map(q => ({ ...q })), rally: b.rally ? { x: b.rally.x, y: b.rally.y, target: ref(b.rally.target) } : null, farmFood: Math.round(b.farmFood), variant: b.variant })),
      units: this.units.filter(u => !u.dead).map(u => ({ d: u.def.id, o: u.owner, x: +u.x.toFixed(2), y: +u.y.toFixed(2), hp: Math.round(u.hp), st: u.state, tx: +u.tx.toFixed(2), ty: +u.ty.toFixed(2), g: ref(u.gatherNode), b: u.buildTarget ? ref(u.buildTarget) : null, am: u.attackMove, carry: u.carry, hx: +u.homeX.toFixed(1), hy: +u.homeY.toFixed(1), fx: +u.fx.toFixed(2), fy: +u.fy.toFixed(2) })),
      fog: rle(this.fog), decals: this.decals.map(d => ({ x: d.x, y: d.y, size: d.size, t: d.t, variant: d.variant })),
    };
  }
  static load(data) {
    const g = new Game({ ...data.opts, seed: data.seed });
    // wipe generated world
    g.entities.clear(); g.units = []; g.buildings = []; g.nodes = []; g.projectiles = [];
    g.map.blocked.fill(0); g.map.occupant.fill(0);
    g.time = data.time;
    data.players.forEach((sp, i) => { const p = g.players[i]; p.res = { ...sp.res }; p.age = sp.age; p.stats = { ...sp.stats }; p.heroAlive = sp.heroAlive; p.ageUpInProgress = sp.ageUpInProgress; p.lastAttackedAlert = sp.lastAttackedAlert ?? -99; p.techs = new Set(); p.mods = defaultMods(); for (const id of sp.techs) { const t = TECHS[id]; if (!t) continue; p.techs.add(id); if (t.apply) t.apply(p.mods); if (t.upgrade) p.upgraded[t.upgrade[0]] = t.upgrade[1]; } });
    for (const [kind, tx, ty, amount, variant, x, y] of data.nodes) { const nd = new Node(kind, tx, ty, amount, variant, g.map.biome[g.map.idx(tx, ty)]); if (kind === 'carcass') { nd.x = x; nd.y = y; } g.addNode(nd); }
    // forest tiles without a tree become grass
    for (let i = 0; i < g.map.terrain.length; i++) if (g.map.terrain[i] === T.FOREST && !g.map.blocked[i]) g.map.terrain[i] = T.GRASS;
    const bs = [];
    for (const sb of data.buildings) { const b = new Building(sb.role, sb.o, g.players[sb.o].faction, sb.tx, sb.ty); b.hp = sb.hp; b.progress = sb.prog; b.complete = sb.complete; b.queue = sb.queue.map(q => ({ ...q })); b.farmFood = sb.farmFood; b.variant = sb.variant; g.addBuilding(b); bs.push(b); }
    const deref = (r) => { if (!r) return null; if (r.n) { const e = g.entityAtTile(r.n[0], r.n[1]); if (e && e.kind === 'node') return e; return g.nodes.find(n => n.tx === r.n[0] && n.ty === r.n[1]) || null; } if (r.b !== undefined) return bs[r.b] || null; return null; };
    data.buildings.forEach((sb, i) => { if (sb.rally) bs[i].rally = { x: sb.rally.x, y: sb.rally.y, target: deref(sb.rally.target) || undefined }; });
    for (const su of data.units) {
      if (!UNITS[su.d]) continue;
      const u = new Unit(su.d, su.o, su.x, su.y); u.hp = su.hp; u.homeX = su.hx; u.homeY = su.hy; u.fx = su.fx; u.fy = su.fy; u.carry = su.carry || null;
      g.addUnit(u);
      if (su.o === -1) { u.state = 'wander'; continue; }
      const gn = deref(su.g), bt = deref(su.b);
      if ((su.st === 'gather' || su.st === 'return') && gn) { u.gatherNode = gn; if (gn.kind === 'node') gn.gatherers++; u.state = su.st; }
      else if (su.st === 'build' && bt && !bt.complete) { u.buildTarget = bt; bt.builders++; u.state = 'build'; }
      else if (su.st === 'move' || su.st === 'attack' || su.st === 'flee') { u.state = 'move'; u.attackMove = su.am || null; g.setMoveTarget(u, su.am ? su.am.x : su.tx, su.am ? su.am.y : su.ty); }
      else if (u.carry && u.carry.amount > 0) u.state = 'return';
      else u.state = 'idle';
    }
    // fog
    const f = data.fog; let k = 0; for (let i = 0; i < f.length; i += 2) { const v = f[i], c = f[i + 1]; for (let j = 0; j < c && k < g.fog.length; j++) g.fog[k++] = v; }
    g.decals = (data.decals || []).map(d => ({ ...d }));
    g.recountPop(); g.updateFog(); g.fogDirty = true;
    return g;
  }
  // ------------- victory -------------
  checkVictory() {
    for (const p of this.players) {
      const alive = this.buildings.some(b => b.owner === p.idx && !b.dead && b.role !== 'farm');
      if (!alive) { this.over = { winner: 1 - p.idx, loser: p.idx }; this.emit({ type: 'gameOver', winner: 1 - p.idx }); return; }
    }
  }
}
