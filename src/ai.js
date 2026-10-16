// =====================================================================
//  AI opponent: economy management, build order, army, attack/defence
// =====================================================================
import { UNITS, BUILDING_ROLES, TECHS, AGES, POP_MAX } from './data.js';
import { dist, clamp } from './util.js';

const DIFF = {
  easy:   { thinkEvery: 1.6, vill: [11, 16, 20], attackAt: 16, armyCap: 28, techs: 0.4, towers: 0, lateMin: 16, trainChance: 0.55 },
  normal: { thinkEvery: 1.0, vill: [15, 24, 30], attackAt: 11, armyCap: 42, techs: 0.75, towers: 1, lateMin: 12, trainChance: 0.85 },
  hard:   { thinkEvery: 0.7, vill: [17, 27, 34], attackAt: 9, armyCap: 60, techs: 1.0, towers: 2, lateMin: 9, trainChance: 1.0 },
};

export class AI {
  constructor(game, idx) {
    this.g = game; this.idx = idx; this.p = game.players[idx];
    this.cfg = DIFF[this.p.difficulty] || DIFF.normal;
    this.t = 0; this.thinkT = 1.5; this.rebalanceT = 12; this.attackT = 0; this.scoutT = 2;
    this.attacking = false; this.attackStartCount = 0; this.attackTarget = null;
    this.enemy = 1 - idx;
    const tc = game.ownBuildings(idx, 'tc')[0];
    this.base = tc ? { x: tc.x, y: tc.y } : game.map.bases[this.p.faction];
    const eb = game.map.bases[game.players[this.enemy].faction];
    const dx = eb.x - this.base.x, dy = eb.y - this.base.y, L = Math.hypot(dx, dy) || 1;
    this.toEnemy = { x: dx / L, y: dy / L };
    this.rally = { x: this.base.x + this.toEnemy.x * 6, y: this.base.y + this.toEnemy.y * 6 };
    this.lastHouseT = -99; this.lastBuildT = -99; this.farmFail = 0;
  }
  update(dt) {
    this.t += dt; this.thinkT -= dt; this.rebalanceT -= dt; this.scoutT -= dt;
    if (this.thinkT <= 0) { this.thinkT = this.cfg.thinkEvery; this.think(); }
    if (this.rebalanceT <= 0) { this.rebalanceT = 10; this.rebalance(); }
  }
  // ------------------------------------------------------------------
  think() {
    const g = this.g, p = this.p;
    if (g.over) return;
    const tc = g.ownBuildings(this.idx, 'tc')[0];
    const villagers = g.ownUnits(this.idx, u => u.isVillager);
    const army = g.ownUnits(this.idx, u => u.isMilitary && u.def.cls !== 'scout');
    this.villagers = villagers; this.army = army; this.tc = tc;
    this.counts = this.countGatherers(villagers);
    // make sure construction sites have builders
    for (const b of g.buildings) {
      if (b.owner !== this.idx || b.dead || b.complete) continue;
      const have = g.units.filter(u => u.buildTarget === b && !u.dead).length; b.builders = have;
      if (have === 0) { const bs = this.pickBuilders({ x: b.x, y: b.y }, b.size >= 3 ? 2 : 1); if (bs.length) g.cmdBuild(bs, b); }
    }
    // assign idle villagers
    for (const v of villagers) if (v.state === 'idle') this.assignVillager(v);
    // training villagers
    const target = this.cfg.vill[p.age - 1];
    if (tc && villagers.length + this.queued(tc, 'unit') < target && tc.queue.length < 2) g.cmdTrain(tc, p.f.villager);
    // age up
    this.considerAge(tc);
    // buildings
    this.considerBuildings(tc, villagers);
    // research
    this.considerTechs();
    // military production
    this.considerArmy(army);
    // tactics
    this.considerCombat(army);
    // scout
    if (this.scoutT <= 0) { this.scoutT = 25; const sc = g.ownUnits(this.idx, u => u.def.cls === 'scout')[0]; if (sc && sc.state === 'idle') { const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 20; g.cmdMove([sc], clamp(this.base.x + Math.cos(a) * r, 2, g.n - 3), clamp(this.base.y + Math.sin(a) * r, 2, g.n - 3)); } }
  }
  queued(b, type) { return b.queue.filter(q => q.type === type).length; }
  countGatherers(villagers) {
    const c = { food: 0, wood: 0, gold: 0, stone: 0, build: 0, idle: 0 };
    for (const v of villagers) {
      if (v.state === 'build') c.build++;
      else if (v.state === 'idle' || v.state === 'flee') c.idle++;
      else if (v.hunting) c.food++;
      else if (v.gatherNode) c[v.gatherNode.kind === 'node' ? v.gatherNode.res : 'food']++;
      else if (v.carry) c[v.carry.res]++;
    }
    return c;
  }
  targetShares() {
    const p = this.p, age = p.age;
    let s = age === 1 ? { food: 0.52, wood: 0.43, gold: 0.05, stone: 0 } : age === 2 ? { food: 0.42, wood: 0.30, gold: 0.23, stone: 0.05 } : { food: 0.40, wood: 0.25, gold: 0.28, stone: 0.07 };
    s = { ...s };
    if (this.villagers.length < 7) { s.gold = 0; s.stone = 0; s.food = 0.55; s.wood = 0.45; }
    if (p.res.food < 120) { s.food += 0.1; s.wood -= 0.05; s.gold -= 0.05; }
    if (this.savingForAge) { s.food += 0.12; s.wood -= 0.12; }
    const farms = this.g.ownBuildings(this.idx, 'farm').length; s.wood += farms * 0.012; s.gold -= farms * 0.006;
    if (p.res.wood < 80) { s.wood += 0.1; s.food -= 0.05; s.gold -= 0.05; }
    if (p.res.gold > 450) { s.food += s.gold * 0.6; s.wood += s.gold * 0.4; s.gold = 0; }
    if (p.res.wood > 600) { s.food += s.wood * 0.6; s.wood *= 0.4; }
    if (p.res.stone > 250) { s.stone = 0; }
    // normalise
    let tot = 0; for (const k in s) { s[k] = Math.max(0, s[k]); tot += s[k]; }
    for (const k in s) s[k] /= tot;
    return s;
  }
  mostNeeded() {
    const s = this.targetShares(), c = this.counts, n = Math.max(1, this.villagers.length - c.build);
    let best = 'food', bd = -Infinity;
    for (const k of ['food', 'wood', 'gold', 'stone']) { if (s[k] <= 0) continue; const deficit = s[k] * n - c[k]; if (deficit > bd) { bd = deficit; best = k; } }
    return best;
  }
  assignVillager(v) {
    const g = this.g;
    // unfinished buildings first
    const site = g.buildings.find(b => b.owner === this.idx && !b.dead && !b.complete && b.builders < (b.size >= 3 ? 2 : 1));
    if (site) { g.cmdBuild([v], site); this.counts.build++; return; }
    const res = this.mostNeeded();
    if (this.sendToResource(v, res)) { this.counts[res]++; return; }
    for (const alt of ['wood', 'food', 'gold', 'stone']) if (alt !== res && this.sendToResource(v, alt)) { this.counts[alt]++; return; }
  }
  sendToResource(v, res) {
    const g = this.g, base = this.base;
    if (res === 'food') {
      // free farm?
      const farm = g.buildings.find(b => b.owner === this.idx && !b.dead && b.complete && b.role === 'farm' && !g.units.some(u => u.gatherNode === b && !u.dead));
      if (farm) { g.cmdGather([v], farm); return true; }
      const berry = g.nearestNode(base.x, base.y, 'berry', 18);
      if (berry && berry.gatherers < 4) { g.cmdGather([v], berry); return true; }
      const carc = g.nearestNode(base.x, base.y, 'carcass', 16);
      if (carc) { g.cmdGather([v], carc); return true; }
      // hunt deer
      const deer = g.units.find(u => u.owner === -1 && !u.dead && u.def.id === 'deer' && dist(u.x, u.y, base.x, base.y) < 14);
      if (deer && this.counts.food < 6) { g.cmdHunt(v, deer); return true; }
      const berry2 = g.nearestNode(base.x, base.y, 'berry', 30, false);
      if (berry2) { g.cmdGather([v], berry2); return true; }
      return false;
    }
    if (res === 'wood') {
      const camp = g.ownBuildings(this.idx, 'lumber').filter(b => b.complete)[0];
      const from = camp || this.tc || { x: base.x, y: base.y };
      const tree = g.nearestNode(from.x, from.y, 'tree', camp ? 7 : 16) || g.nearestNode(base.x, base.y, 'tree', 40, false);
      if (tree) { g.cmdGather([v], tree); return true; }
      return false;
    }
    const nd = g.nearestNode(base.x, base.y, res, 26) || g.nearestNode(base.x, base.y, res, 60, false);
    if (nd) { g.cmdGather([v], nd); return true; }
    return false;
  }
  rebalance() {
    if (!this.villagers || this.g.over) return;
    const s = this.targetShares(), c = this.counts, n = Math.max(1, this.villagers.length - c.build);
    let over = null, under = null, od = 0, ud = 0;
    for (const k of ['food', 'wood', 'gold', 'stone']) { const d = c[k] - s[k] * n; if (d > od) { od = d; over = k; } if (-d > ud) { ud = -d; under = k; } }
    if (over && under && od >= 1.5 && ud >= 1.5) {
      const v = this.villagers.find(u => (u.state === 'gather' || u.state === 'return') && u.gatherNode && (u.gatherNode.kind === 'node' ? u.gatherNode.res : 'food') === over && (!u.carry || u.carry.amount < 4));
      if (v) this.sendToResource(v, under);
    }
  }
  // ------------------------------------------------------------------
  considerAge(tc) {
    const g = this.g, p = this.p;
    if (!tc || p.age >= 3 || p.ageUpInProgress) return;
    const need = AGES[p.age];
    const villOk = this.villagers.length >= (p.age === 1 ? this.cfg.vill[0] - 3 : this.cfg.vill[1] - 4);
    if (villOk && g.ageRequirementMet(p) && g.canAfford(p, need.cost)) g.cmdAgeUp(tc);
  }
  considerBuildings(tc, villagers) {
    const g = this.g, p = this.p;
    if (!tc && villagers.length === 0) return;
    const sites = g.buildings.filter(b => b.owner === this.idx && !b.dead && !b.complete);
    if (sites.length >= 2) return;
    if (this.t - this.lastBuildT < 2.5) return;
    const has = role => g.ownBuildings(this.idx, role).length;
    const c = this.counts;
    const want = [];
    // houses
    if (p.popCap < POP_MAX && p.popCap - p.pop <= 3 + Math.floor(p.age) && !sites.some(b => b.role === 'house')) { const back = { x: this.base.x - this.toEnemy.x * 5 + (Math.random() - 0.5) * 6, y: this.base.y - this.toEnemy.y * 5 + (Math.random() - 0.5) * 6 }; want.push({ role: 'house', near: back, r: 14, prio: 10 }); }
    // economy camps
    if (c.wood >= 3 && !has('lumber')) { const tree = this.woodCenter(); if (tree) want.push({ role: 'lumber', near: tree, r: 4, prio: 9 }); }
    const berry = g.nearestNode(this.base.x, this.base.y, 'berry', 18);
    if (berry && c.food >= 2 && !g.ownBuildings(this.idx, 'mill').some(m => dist(m.x, m.y, berry.x, berry.y) < 6)) want.push({ role: 'mill', near: berry, r: 4, prio: 8 });
    const gold = g.nearestNode(this.base.x, this.base.y, 'gold', 26);
    if (gold && (c.gold >= 2 || p.age >= 2) && !g.ownBuildings(this.idx, 'mine').some(m => dist(m.x, m.y, gold.x, gold.y) < 6)) want.push({ role: 'mine', near: gold, r: 4, prio: 7 });
    const stone = g.nearestNode(this.base.x, this.base.y, 'stone', 26);
    if (stone && p.age >= 2 && c.stone >= 1 && !g.ownBuildings(this.idx, 'mine').some(m => dist(m.x, m.y, stone.x, stone.y) < 6)) want.push({ role: 'mine', near: stone, r: 4, prio: 5 });
    // farms: when berries are gone or late
    const farms = has('farm');
    const berriesLeft = g.nodes.filter(n => !n.dead && n.nodeKind === 'berry' && dist(n.x, n.y, this.base.x, this.base.y) < 18).length;
    const farmTarget = p.age === 1 ? (berriesLeft < 3 ? 5 : 0) : p.age === 2 ? 8 : 11;
    if (farms < farmTarget && p.res.wood >= 60 + (p.age === 1 ? 60 : 0) && !sites.some(b => b.role === 'farm')) { const mill = g.ownBuildings(this.idx, 'mill').filter(b => b.complete)[0]; want.push({ role: 'farm', near: mill || tc || this.base, r: 7, prio: 6 }); }
    // military
    if (villagers.length >= 8 && !has('barracks')) want.push({ role: 'barracks', near: this.rally, r: 6, prio: 8 });
    if (p.age >= 2) {
      if (!has('range') && (this.p.faction === 'elves' || has('stable'))) want.push({ role: 'range', near: this.rally, r: 6, prio: 7 });
      if (!has('stable') && (this.p.faction === 'orcs' || has('range'))) want.push({ role: 'stable', near: this.rally, r: 6, prio: 6 });
      if (!has('smith') && villagers.length >= 16) want.push({ role: 'smith', near: this.base, r: 8, prio: 5 });
      if (has('tower') < this.cfg.towers && p.res.stone >= 100 && villagers.length >= 16) want.push({ role: 'tower', near: this.rally, r: 4, prio: 4 });
      if (has('barracks') < 2 && villagers.length >= 20 && p.res.wood > 400) want.push({ role: 'barracks', near: this.rally, r: 7, prio: 3 });
    }
    if (p.age >= 3) {
      if (!has('siege')) want.push({ role: 'siege', near: this.base, r: 8, prio: 6 });
      if (!has('shrine') && p.res.gold > 300) want.push({ role: 'shrine', near: this.base, r: 8, prio: 4 });
      if (has('range') + has('stable') < 3 && p.res.wood > 500) want.push({ role: this.p.faction === 'elves' ? 'range' : 'stable', near: this.rally, r: 7, prio: 3 });
    }
    want.sort((a, b) => b.prio - a.prio);
    for (const w of want) {
      if (BUILDING_ROLES[w.role].age > p.age) continue;
      const cost = g.buildingCost(p, w.role);
      if (!g.canAfford(p, cost)) { if (w.prio >= 8) return; continue; }   // save for important ones
      const spot = this.findSpot(w.role, w.near.x, w.near.y, w.r);
      if (!spot) continue;
      const builders = this.pickBuilders(spot, w.role === 'tc' || w.role === 'barracks' || w.role === 'range' || w.role === 'stable' ? 2 : 1);
      if (!builders.length) return;
      const b = g.placeBuilding(p, w.role, spot.x, spot.y, builders);
      if (b) { this.lastBuildT = this.t; return; }
    }
  }
  woodCenter() {
    let sx = 0, sy = 0, n = 0;
    for (const v of this.villagers) if (v.gatherNode && v.gatherNode.kind === 'node' && v.gatherNode.res === 'wood') { sx += v.gatherNode.x; sy += v.gatherNode.y; n++; }
    return n ? { x: sx / n, y: sy / n } : null;
  }
  findSpot(role, nx, ny, r) {
    const g = this.g, p = this.p, s = BUILDING_ROLES[role].size;
    const cands = [];
    const cx = Math.round(nx - s / 2), cy = Math.round(ny - s / 2);
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const tx = cx + dx, ty = cy + dy;
      if (!g.canPlace(p, role, tx, ty)) continue;
      if (role !== 'farm' && !this.hasGap(tx, ty, s)) continue;
      // keep away from TC footprint a bit
      if (this.tc && role !== 'farm') { const d = g.distToBuilding(tx + s / 2, ty + s / 2, this.tc); if (d < 1.5) continue; }
      cands.push({ x: tx, y: ty, d: dist(tx + s / 2, ty + s / 2, nx, ny) + Math.random() * 1.5 });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => a.d - b.d);
    return cands[0];
  }
  hasGap(tx, ty, s) {
    const g = this.g; let free = 0, tot = 0;
    for (let y = ty - 1; y <= ty + s; y++) for (let x = tx - 1; x <= tx + s; x++) {
      if (x >= tx && x < tx + s && y >= ty && y < ty + s) continue; tot++;
      if (g.map.isPassable(x, y)) free++;
      else { const e = g.entityAtTile(x, y); if (e && e.kind === 'building' && e.role !== 'farm') return false; }
    }
    return free / tot >= 0.55;
  }
  pickBuilders(spot, n) {
    const vs = this.villagers.filter(v => v.state !== 'build' && !v.hunting);
    vs.sort((a, b) => { const pa = a.state === 'idle' ? -50 : (a.gatherNode && a.gatherNode.res === 'wood' ? -5 : 0), pb = b.state === 'idle' ? -50 : (b.gatherNode && b.gatherNode.res === 'wood' ? -5 : 0); return (dist(a.x, a.y, spot.x, spot.y) + pa) - (dist(b.x, b.y, spot.x, spot.y) + pb); });
    return vs.slice(0, n);
  }
  // ------------------------------------------------------------------
  considerTechs() {
    const g = this.g, p = this.p;
    if (Math.random() > this.cfg.techs) return;
    const order = ['loom', 'double_axe', 'orchard', 'forging', 'fletching', 'scale_mail', 'gold_mining', 'barding', 'archer_armor', 'wheelbarrow', 'iron_casting', 'bodkin', 'chain_mail', p.faction === 'elves' ? 'elf_elite_arch' : 'orc_elite_inf', p.faction === 'elves' ? 'elf_elite_inf' : 'orc_elite_arch', p.faction === 'elves' ? 'starlight_arrows' : 'waaagh', 'stone_mining'];
    for (const id of order) {
      const t = TECHS[id]; if (!t || p.techs.has(id) || t.age > p.age) continue;
      if (t.req && !p.techs.has(t.req)) continue;
      // keep a reserve for age-up / army
      const reserve = this.savingForAge ? AGES[p.age].cost.food + 100 : (p.age < 3 && !p.ageUpInProgress ? 250 : 120);
      if (p.res.food - (t.cost.food || 0) < reserve || p.res.gold - (t.cost.gold || 0) < 80) continue;
      const b = this.buildingForTech(id); if (!b || b.queue.length) continue;
      if (g.cmdResearch(b, id)) return;
    }
  }
  buildingForTech(id) {
    const f = this.p.f, g = this.g;
    const roles = [];
    if (f.tcTechs.includes(id)) roles.push('tc'); if (f.lumberTechs.includes(id)) roles.push('lumber'); if (f.millTechs.includes(id)) roles.push('mill'); if (f.mineTechs.includes(id)) roles.push('mine');
    for (const role in f.buildings) if (f.buildings[role].techs && f.buildings[role].techs.includes(id)) roles.push(role);
    for (const r of roles) { const b = g.ownBuildings(this.idx, r).find(b => b.complete && !b.queue.length); if (b) return b; }
    return null;
  }
  considerArmy(army) {
    const g = this.g, p = this.p;
    if (army.length >= this.cfg.armyCap) return;
    if (Math.random() > this.cfg.trainChance) return;
    const prods = g.buildings.filter(b => b.owner === this.idx && !b.dead && b.complete && b.skin.trains && b.role !== 'tc' && b.queue.length < 2);
    // keep food reserve while villagers still needed / age-up pending
    const villShort = this.villagers.length < this.cfg.vill[p.age - 1] - 2;
    const saving = p.age < 3 && !p.ageUpInProgress && this.villagers.length >= this.cfg.vill[p.age - 1] - 4 && g.ageRequirementMet(p);
    this.savingForAge = saving;
    const reserveFood = (villShort ? 100 : 0) + (saving ? AGES[p.age].cost.food : 0);
    const reserveGold = saving ? (AGES[p.age].cost.gold || 0) : 0;
    const underThreat = this.threatCount > 0;
    for (const b of prods) {
      const options = b.skin.trains.filter(id => { const d = UNITS[p.upgraded[id] || id]; if (d.cls === 'scout') return false; if (d.unique && (p.heroAlive || b.queue.length)) return false; return this.unitAgeOk(id); });
      if (!options.length) continue;
      // weighting: prefer counters to what enemy has
      const enemyArmy = g.ownUnits(this.enemy, u => u.isMilitary);
      const cav = enemyArmy.filter(u => u.def.cls === 'cavalry' || u.def.cls === 'cavalry_archer').length, arch = enemyArmy.filter(u => u.def.cls === 'archer').length, inf = enemyArmy.filter(u => u.def.cls === 'infantry').length;
      const weights = options.map(id => { const d = UNITS[id]; let w = 1; if (d.cls === 'infantry' && d.bonus.cavalry) w += cav * 0.4; if (d.cls === 'cavalry') w += arch * 0.4; if (d.cls === 'archer') w += inf * 0.3; if (d.cls === 'siege') w = p.age >= 3 && army.length > 10 ? 1.5 : 0.3; if (d.cls === 'hero') w = 2.5; if (d.elite) w += 0.5; return w; });
      let tot = weights.reduce((a, b) => a + b, 0), r = Math.random() * tot, pick = options[0];
      for (let i = 0; i < options.length; i++) { r -= weights[i]; if (r <= 0) { pick = options[i]; break; } }
      const cost = g.unitCost(p, p.upgraded[pick] || pick);
      if (!underThreat && p.res.food - (cost.food || 0) < reserveFood) continue;
      if (!underThreat && p.res.gold - (cost.gold || 0) < reserveGold) continue;
      if (!g.canAfford(p, cost)) continue;
      if (p.pop + UNITS[pick].pop > p.popCap) continue;
      g.cmdTrain(b, pick);
      if (!b.rally) g.cmdSetRally(b, this.rally.x + (Math.random() - 0.5) * 3, this.rally.y + (Math.random() - 0.5) * 3);
    }
  }
  unitAgeOk(id) {
    const d = UNITS[id], p = this.p;
    // age gating by role: infantry basic age1, others by building age; elite/hero age3
    if (d.cls === 'siege' || d.cls === 'hero' || id === 'black_orc' || id === 'glade_rider') return p.age >= 3;
    if (id === 'wardancer') return p.age >= 2;
    return true;
  }
  // ------------------------------------------------------------------
  considerCombat(army) {
    const g = this.g, p = this.p;
    this.attackT -= this.cfg.thinkEvery;
    // threat detection near own buildings
    const myB = g.ownBuildings(this.idx);
    let threat = null, threatCount = 0;
    for (const u of g.units) {
      if (u.dead || u.owner !== this.enemy || !u.isMilitary && !u.isVillager) continue;
      for (const b of myB) if (g.distToBuilding(u.x, u.y, b) < 10) { threatCount++; if (!threat || u.isMilitary) threat = u; break; }
    }
    this.threatCount = threatCount;
    if (threat && (threatCount >= 2 || !this.attacking)) {
      const defenders = army.filter(u => !this.attacking || dist(u.x, u.y, this.base.x, this.base.y) < 30);
      if (defenders.length && this.attackT <= 0) { this.attackT = 4; g.cmdAttackMove(defenders, threat.x, threat.y); if (threatCount >= 4) { this.attacking = false; } }
      return;
    }
    const minutes = this.t / 60;
    const threshold = minutes > this.cfg.lateMin ? Math.max(5, this.cfg.attackAt - 4) : this.cfg.attackAt;
    if (!this.attacking) {
      if (army.length >= threshold) { this.attacking = true; this.attackStartCount = army.length; this.attackT = 0; }
      else if (this.attackT <= 0) { // gather idle army at rally
        this.attackT = 6;
        const idle = army.filter(u => u.state === 'idle' && dist(u.x, u.y, this.rally.x, this.rally.y) > 4);
        if (idle.length) g.cmdMove(idle, this.rally.x, this.rally.y);
      }
      return;
    }
    // attacking
    if (army.length < Math.max(3, this.attackStartCount * 0.35)) { this.attacking = false; g.cmdMove(army, this.rally.x, this.rally.y); this.attackT = 20; return; }
    if (this.attackT <= 0) {
      this.attackT = 7;
      const cx = army.reduce((s, u) => s + u.x, 0) / army.length, cy = army.reduce((s, u) => s + u.y, 0) / army.length;
      const targets = g.buildings.filter(b => b.owner === this.enemy && !b.dead);
      if (!targets.length) return;
      const prio = b => (b.role === 'tower' ? -3 : b.role === 'tc' ? 2 : b.role === 'farm' ? 4 : b.role === 'house' ? 1 : 0);
      targets.sort((a, b) => (dist(a.x, a.y, cx, cy) + prio(a) * 3) - (dist(b.x, b.y, cx, cy) + prio(b) * 3));
      const t = targets[0];
      // stragglers regroup; main body attacks
      const far = army.filter(u => dist(u.x, u.y, cx, cy) > 9), near = army.filter(u => dist(u.x, u.y, cx, cy) <= 9);
      if (near.length) g.cmdAttackMove(near, t.x, t.y);
      if (far.length) g.cmdAttackMove(far, cx, cy);
    }
  }
}
