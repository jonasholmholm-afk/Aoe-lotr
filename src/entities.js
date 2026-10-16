import { UNITS, BUILDING_ROLES, FACTIONS, NODES } from './data.js';
import { nextId } from './util.js';

export class Unit {
  constructor(defId, owner, x, y) {
    this.id = nextId(); this.kind = 'unit';
    this.def = UNITS[defId]; this.owner = owner;
    this.x = x; this.y = y; this.hp = this.def.hp; this.maxHp = this.def.hp;
    this.state = 'idle'; this.anim = 'idle'; this.animT = Math.random() * 10;
    this.target = null; this.tx = x; this.ty = y;
    this.path = null; this.pathIdx = 0; this.needPath = false; this.repathT = 0; this.stuckT = 0;
    this.carry = null;            // {res, amount}
    this.gatherNode = null;       // Node or farm Building
    this.buildTarget = null;
    this.cooldown = 0; this.scanT = Math.random() * 0.5;
    this.fx = 1; this.fy = 0;     // facing (world dir)
    this.attackMove = null;       // {x,y} destination when attack-moving
    this.dead = false; this.deathT = 0;
    this.lastHitT = -99; this.lastAttacker = null;
    this.homeX = x; this.homeY = y; this.wanderT = Math.random() * 4;
    this.fleeT = 0; this.selected = false;
    this.resumeTask = null;
  }
  get radius() { return this.def.radius; }
  get isMilitary() { const c = this.def.cls; return c !== 'villager' && c !== 'animal'; }
  get isVillager() { return this.def.cls === 'villager'; }
}

export class Building {
  constructor(role, owner, faction, tx, ty) {
    this.id = nextId(); this.kind = 'building';
    this.role = role; this.owner = owner; this.faction = faction;
    this.def = BUILDING_ROLES[role];
    this.skin = FACTIONS[faction].buildings[role];
    this.tx = tx; this.ty = ty; this.size = this.def.size;
    this.x = tx + this.size / 2; this.y = ty + this.size / 2;
    this.maxHp = this.def.hp; this.hp = Math.max(1, this.maxHp * 0.1);
    this.progress = 0; this.complete = false; this.builders = 0;
    this.queue = [];              // {type:'unit'|'tech'|'age', id, t, total}
    this.rally = null;
    this.farmFood = this.def.farm || 0;
    this.cooldown = 0; this.variant = (tx * 7 + ty * 13) % 97;
    this.dead = false; this.selected = false; this.lastHitT = -99;
  }
  get name() { return this.skin.name; }
  get pop() { return this.complete ? (this.role === 'house' && this.faction === 'orcs' ? FACTIONS.orcs.bonuses.housePop : (this.def.pop || 0)) : 0; }
}

export class Node {
  constructor(kind, tx, ty, amount, variant, biome) {
    this.id = nextId(); this.kind = 'node';
    this.nodeKind = kind; this.tx = tx; this.ty = ty; this.x = tx + 0.5; this.y = ty + 0.5;
    this.amount = amount; this.variant = variant; this.biome = biome;
    this.res = NODES[kind].res; this.dead = false; this.gatherers = 0;
  }
}

export class Projectile {
  constructor(sx, sy, target, dmg, owner, opts = {}) {
    this.x = sx; this.y = sy; this.z = opts.z0 ?? 0.9; this.target = target; this.dmg = dmg; this.owner = owner;
    this.speed = opts.speed || 9; this.t = 0;
    const d = Math.hypot(target.x - sx, target.y - sy); this.dur = Math.max(0.12, d / this.speed);
    this.sx = sx; this.sy = sy; this.arc = Math.min(1.8, d * 0.22); this.dead = false;
    this.pierce = true; this.bonusCls = opts.bonusCls || null; this.siege = opts.siege || false; this.style = opts.style || 'arrow';
  }
}
