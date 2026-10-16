// =====================================================================
//  Entry point: menu, controller (selection & commands), game loop
// =====================================================================
import { Game } from './game.js';
import { AI } from './ai.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { Audio } from './audio.js';
import { STR, t, tn, lang, setLang } from './i18n.js';
import { drawFactionEmblem, clearCache, treeSprite, unitSprite, buildingSprite } from './sprites.js';
import { UNITS, BUILDING_ROLES, FACTIONS, AGES, TECHS } from './data.js';
import { fmtTime, dist, clamp, HW, HH, TH } from './util.js';
import { T } from './map.js';

const $ = (s) => document.querySelector(s);
const audio = new Audio();
let app = null;
const settings = { faction: 'elves', difficulty: 'normal', mapSize: 'medium', speed: Number(localStorage.getItem('rsl_speed') || 1) };

// ---------------------------------------------------------------------
//  Controller: owns selection, interaction modes and command dispatch
// ---------------------------------------------------------------------
class Controller {
  constructor(game, renderer, ui) {
    this.game = game; this.r = renderer; this.ui = ui;
    this.selection = []; this.mode = 'normal'; this.ghost = null; this.dragBox = null; this.marker = null;
    this.panStart = null; this.pinchZoom0 = 1; this.paused = false;
    this.selectedBuilding = null;
  }
  get p() { return this.game.players[0]; }
  // ----- selection helpers -----
  select(list) {
    for (const e of this.selection) e.selected = false;
    this.selection = list.filter(e => !e.dead);
    for (const e of this.selection) e.selected = true;
    this.selectedBuilding = this.selection.length === 1 && this.selection[0].kind === 'building' && this.selection[0].owner === 0 ? this.selection[0] : null;
    this.ui.resetMenu(); this.ui.refreshT = 0;
    if (this.mode !== 'box' && this.mode !== 'place') this.mode = 'normal';
    if (this.selection.length) audio.play('select');
  }
  pruneSelection() { if (this.selection.some(e => e.dead)) this.select(this.selection.filter(e => !e.dead)); }
  ownUnitsSelected() { return this.selection.filter(e => e.kind === 'unit' && e.owner === 0); }
  // ----- picking (front-most sprite first) -----
  pick(sx, sy) {
    const g = this.game, r = this.r, z = r.cam.zoom;
    const cands = [];
    for (const u of g.units) {
      if (u.dead) continue; if (u.owner !== 0 && !g.isVisible(u.x, u.y)) continue;
      const { sx: ux, sy: uy } = r.worldToScreen(u.x, u.y);
      const big = u.def.sprite.kind === 'giant' ? 1.6 : u.def.sprite.kind === 'mounted' ? 1.25 : 1;
      const hw = 13 * z * big, top = uy - 28 * z * big, bot = uy + 5 * z;
      if (sx >= ux - hw && sx <= ux + hw && sy >= top && sy <= bot) cands.push({ e: u, k: u.x + u.y + 0.5, d: Math.hypot(sx - ux, sy - (uy - 12 * z)) });
    }
    for (const b of g.buildings) {
      if (b.dead || !r.buildingSeen(b)) continue;
      const { sx: bx, sy: by } = r.worldToScreen(b.x, b.y);
      const h = (b.size * TH + (b.role === 'tc' ? 110 : b.role === 'tower' ? 80 : 55)) * z;
      // footprint diamond test
      const w = r.screenToWorld(sx, sy); const inFoot = w.x >= b.tx && w.x < b.tx + b.size && w.y >= b.ty && w.y < b.ty + b.size;
      if (inFoot || (Math.abs(sx - bx) < b.size * HW * z * 0.55 && sy < by && sy > by - h)) cands.push({ e: b, k: b.tx + b.ty + b.size, d: Math.hypot(sx - bx, sy - by) });
    }
    const w = r.screenToWorld(sx, sy);
    for (const nd of g.nodes) {
      if (nd.dead || !g.isExplored(nd.x, nd.y)) continue;
      if (Math.abs(nd.x - w.x) > 3 || Math.abs(nd.y - w.y) > 3) continue;
      const { sx: nx, sy: ny } = r.worldToScreen(nd.x, nd.y);
      const hit = nd.nodeKind === 'tree' ? (Math.abs(sx - nx) < 15 * z && sy < ny + 4 * z && sy > ny - 58 * z) : (Math.abs(sx - nx) < 20 * z && sy < ny + 6 * z && sy > ny - 22 * z);
      if (hit) cands.push({ e: nd, k: nd.x + nd.y, d: Math.hypot(sx - nx, sy - ny) });
    }
    if (!cands.length) { const e = g.entityAtTile(Math.floor(w.x), Math.floor(w.y)); if (e && (e.kind === 'node' ? g.isExplored(e.x, e.y) : r.buildingSeen(e))) return e; return null; }
    // prefer units slightly, then front-most (largest depth key), then nearest
    cands.sort((a, b) => (b.e.kind === 'unit') - (a.e.kind === 'unit') || b.k - a.k || a.d - b.d);
    return cands[0].e;
  }
  // ----- input callbacks -----
  onPressStart(sx, sy) { audio.init(); }
  onTap(sx, sy, dbl, button) {
    if (this.paused) return;
    const g = this.game, w = this.r.screenToWorld(sx, sy);
    if (this.mode === 'place') { this.moveGhost(w.x, w.y); return; }
    if (this.mode === 'attackmove') { this.attackMoveTo(w.x, w.y); this.mode = 'normal'; this.ui.resetMenu(); return; }
    if (this.mode === 'rally') { if (this.selectedBuilding) { g.cmdSetRally(this.selectedBuilding, w.x, w.y); audio.play('click'); } this.mode = 'normal'; this.ui.resetMenu(); return; }
    const e = this.pick(sx, sy);
    const own = this.ownUnitsSelected();
    if (button === 2 && own.length) { this.commandAt(e, w); return; }
    if (e && e.kind === 'unit' && e.owner === 0) {
      if (dbl) { const same = g.ownUnits(0, u => u.def.id === e.def.id && this.onScreen(u)); this.select(same); return; }
      this.select([e]); return;
    }
    if (e && e.kind === 'building' && e.owner === 0) {
      if (own.length && e.role === 'farm' && e.complete && own.some(u => u.isVillager)) { g.cmdGather(own.filter(u => u.isVillager), e); this.setMarker(w.x, w.y); return; }
      if (own.length && !e.complete && own.some(u => u.isVillager)) { g.cmdBuild(own.filter(u => u.isVillager), e); this.setMarker(w.x, w.y); return; }
      this.select([e]); return;
    }
    if (own.length) { this.commandAt(e, w); return; }
    if (e) { this.select([e]); return; }
    if (this.selection.length) this.select([]);
  }
  commandAt(e, w) {
    const g = this.game, own = this.ownUnitsSelected();
    if (e && e.kind === 'unit' && e.owner !== 0) {
      if (e.owner === -1 && !e.def.hostile && !e.def.aggressive) { const v = own.filter(u => u.isVillager); if (v.length) { g.cmdGather(v, e); if (v.length < own.length) g.cmdAttack(own.filter(u => !u.isVillager), e); } else g.cmdAttack(own, e); }
      else g.cmdAttack(own, e);
      this.setMarker(e.x, e.y, true); return;
    }
    if (e && e.kind === 'building' && e.owner !== 0 && e.owner !== -1) { g.cmdAttack(own, e); this.setMarker(e.x, e.y, true); return; }
    if (e && e.kind === 'node') {
      const v = own.filter(u => u.isVillager);
      if (v.length) { g.cmdGather(v, e); if (v.length < own.length) g.cmdMove(own.filter(u => !u.isVillager), w.x, w.y); }
      else g.cmdMove(own, w.x, w.y);
      this.setMarker(e.x, e.y); return;
    }
    if (!g.map.isWalkableTerrain(w.x | 0, w.y | 0) && g.map.inBounds(w.x | 0, w.y | 0)) { /* water/rock: move adjacent */ }
    g.cmdMove(own, w.x, w.y); this.setMarker(w.x, w.y);
  }
  attackMoveTo(x, y) { const own = this.ownUnitsSelected(); if (own.length) { this.game.cmdAttackMove(own, x, y); this.setMarker(x, y, true); } }
  onLongPress(sx, sy) {
    if (this.paused) return;
    const w = this.r.screenToWorld(sx, sy);
    if (this.mode === 'place') return;
    const own = this.ownUnitsSelected();
    if (own.some(u => u.isMilitary)) { this.attackMoveTo(w.x, w.y); if (navigator.vibrate) navigator.vibrate(15); return; }
    if (this.selectedBuilding) { this.game.cmdSetRally(this.selectedBuilding, w.x, w.y); audio.play('click'); if (navigator.vibrate) navigator.vibrate(15); return; }
    const e = this.pick(sx, sy);
    if (e && e.kind === 'unit' && e.owner === 0) { this.select(this.game.ownUnits(0, u => u.def.id === e.def.id && this.onScreen(u))); if (navigator.vibrate) navigator.vibrate(15); }
  }
  onLongDrag() {} onLongRelease() {}
  onScreen(u) { const { sx, sy } = this.r.worldToScreen(u.x, u.y); return sx > -20 && sx < this.r.W + 20 && sy > -20 && sy < this.r.H + 20; }
  onDragStart(sx, sy, button) {
    if (this.paused) return;
    if (this.mode === 'place') { this.dragGhost = true; return; }
    if (this.mode === 'box' || button === 2) { this.dragBox = { x0: sx, y0: sy, x1: sx, y1: sy }; return; }
    this.panStart = { x: sx, y: sy, cx: this.r.cam.x, cy: this.r.cam.y };
  }
  onDragMove(sx, sy) {
    if (this.paused) return;
    if (this.mode === 'place' && this.dragGhost) { const w = this.r.screenToWorld(sx, sy); this.moveGhost(w.x, w.y); return; }
    if (this.dragBox) { this.dragBox.x1 = sx; this.dragBox.y1 = sy; return; }
    if (this.panStart) {
      const z = this.r.cam.zoom; const dx = (sx - this.panStart.x) / (HW * z), dy = (sy - this.panStart.y) / (HH * z);
      // screen delta -> world delta (inverse iso)
      this.r.cam.x = this.panStart.cx - (dx + dy) / 2; this.r.cam.y = this.panStart.cy - (dy - dx) / 2; this.r.clampCam();
    }
  }
  onDragEnd(sx, sy) {
    if (this.dragBox) {
      const b = this.dragBox; this.dragBox = null;
      const x0 = Math.min(b.x0, b.x1), x1 = Math.max(b.x0, b.x1), y0 = Math.min(b.y0, b.y1), y1 = Math.max(b.y0, b.y1);
      const units = this.game.ownUnits(0, u => { const { sx, sy } = this.r.worldToScreen(u.x, u.y); return sx >= x0 && sx <= x1 && sy - 12 * this.r.cam.zoom >= y0 - 10 && sy <= y1 + 10; });
      const mil = units.filter(u => u.isMilitary);
      if (units.length) this.select(mil.length && units.some(u => u.isVillager) && mil.length >= 1 ? mil : units);
      if (this.mode === 'box') { this.mode = 'normal'; this.ui.resetMenu(); }
    }
    this.panStart = null; this.dragGhost = false;
  }
  onPinchStart(cx, cy) { this.pinchZoom0 = this.r.cam.zoom; this.pinchW = this.r.screenToWorld(cx, cy); this.panStart = null; }
  onPinch(scale, cx, cy) {
    const r = this.r; r.cam.zoom = clamp(this.pinchZoom0 * scale, r.minZoom, r.maxZoom);
    // keep world point under fingers
    const now = r.screenToWorld(cx, cy); r.cam.x += this.pinchW.x - now.x; r.cam.y += this.pinchW.y - now.y; r.clampCam();
  }
  onPinchEnd() {}
  onWheel(sx, sy, dy) { const r = this.r; const before = r.screenToWorld(sx, sy); r.cam.zoom = clamp(r.cam.zoom * (dy > 0 ? 0.88 : 1.14), r.minZoom, r.maxZoom); const after = r.screenToWorld(sx, sy); r.cam.x += before.x - after.x; r.cam.y += before.y - after.y; r.clampCam(); }
  onKey(e) {
    if (!app || this.paused && e.key !== 'Escape') return;
    const r = this.r;
    switch (e.key) {
      case 'Escape': if (this.mode !== 'normal') this.cancelMode(); else if (this.paused) resume(); else pause(); break;
      case 'ArrowLeft': case 'a': r.cam.x -= 1; r.cam.y += 1; r.clampCam(); break;
      case 'ArrowRight': case 'd': r.cam.x += 1; r.cam.y -= 1; r.clampCam(); break;
      case 'ArrowUp': case 'w': r.cam.x -= 1; r.cam.y -= 1; r.clampCam(); break;
      case 'ArrowDown': case 's': r.cam.x += 1; r.cam.y += 1; r.clampCam(); break;
      case 'h': this.selectTC(); break;
      case '.': this.selectIdleVillager(); break;
      case 'b': if (this.ownUnitsSelected().some(u => u.isVillager)) { this.ui.menu = 'build'; this.ui.sig = ''; } break;
      case 'q': if (this.ownUnitsSelected().some(u => u.isMilitary)) this.setMode('attackmove'); break;
      case 'Delete': this.deleteSelected(); break;
      case ' ': if (this.lastAlert) r.centerOn(this.lastAlert.x, this.lastAlert.y); break;
    }
  }
  onMinimap(px, py) { const w = this.r.minimapToWorld($('#minimap'), px, py); this.r.centerOn(w.x, w.y); }
  // ----- modes -----
  setMode(m) { this.mode = this.mode === m ? 'normal' : m; this.ui.sig = ''; audio.play('click'); }
  toggleBoxMode() { this.setMode('box'); }
  cancelMode() { this.mode = 'normal'; this.ghost = null; this.ui.hidePlaceBar(); this.ui.resetMenu(); }
  beginPlacement(role) {
    const p = this.p; if (BUILDING_ROLES[role].age > p.age) { this.ui.message(t('needAge'), 'warn'); audio.play('error'); return; }
    if (!this.game.canAfford(p, this.game.buildingCost(p, role))) { this.ui.message(t('notEnough'), 'warn'); audio.play('error'); return; }
    this.mode = 'place'; const c = this.r.screenToWorld(this.r.W / 2, this.r.H / 2 - 60); this.ghost = { role, tx: 0, ty: 0, valid: false }; this.moveGhost(c.x, c.y); this.ui.showPlaceBar(role); audio.play('click');
    $('#place-bar').style.bottom = ($('#bottom').offsetHeight + 10) + 'px';
  }
  moveGhost(x, y) { const gh = this.ghost; if (!gh) return; const s = BUILDING_ROLES[gh.role].size; gh.tx = Math.round(x - s / 2); gh.ty = Math.round(y - s / 2); gh.valid = this.game.canPlace(this.p, gh.role, gh.tx, gh.ty); $('#place-ok').classList.toggle('ghost', !gh.valid); }
  confirmPlacement() {
    const gh = this.ghost; if (!gh) return;
    if (!gh.valid) { this.ui.message(t('cannotPlace'), 'warn'); audio.play('error'); return; }
    const builders = this.ownUnitsSelected().filter(u => u.isVillager);
    const b = this.game.placeBuilding(this.p, gh.role, gh.tx, gh.ty, builders);
    if (b) { this.cancelMode(); if (this.p.res.wood >= this.game.buildingCost(this.p, gh.role).wood && (gh.role === 'house' || gh.role === 'farm')) { /* allow quick repeat */ } }
  }
  // ----- commands from UI -----
  stopSelected() { this.game.cmdStop(this.ownUnitsSelected()); audio.play('click'); }
  deleteSelected() { for (const e of this.selection) if (e.owner === 0) this.game.cmdDelete(e); this.select([]); }
  train(b, id) { if (!this.game.cmdTrain(b, id)) audio.play('error'); this.ui.refreshT = 0; }
  cancelQueue(b, id) { const i = b.queue.findIndex(q => q.id === id); if (i >= 0) { this.game.cmdCancelQueue(b, i); audio.play('click'); this.ui.refreshT = 0; } }
  research(b, id) { if (!this.game.cmdResearch(b, id)) audio.play('error'); this.ui.refreshT = 0; }
  ageUp(b) { if (!this.game.cmdAgeUp(b)) audio.play('error'); this.ui.refreshT = 0; }
  selectIdleVillager() {
    const idle = this.game.ownUnits(0, u => u.isVillager && u.state === 'idle');
    if (!idle.length) { this.ui.message(t('noIdle')); return; }
    this.idleIdx = ((this.idleIdx || 0) + 1) % idle.length; const u = idle[this.idleIdx]; this.select([u]); this.r.centerOn(u.x, u.y);
  }
  selectTC() { const tc = this.game.ownBuildings(0, 'tc')[0]; if (tc) { if (this.selection[0] === tc) this.r.centerOn(tc.x, tc.y); this.select([tc]); this.r.centerOn(tc.x, tc.y); } }
  selectArmy() { const a = this.game.ownUnits(0, u => u.isMilitary && u.def.cls !== 'scout'); if (!a.length) { this.ui.message(t('noArmy')); return; } this.select(a); const u = a[0]; if (this.selection.length && !this.onScreen(u)) this.r.centerOn(u.x, u.y); }
  setMarker(x, y, attack = false) { this.marker = { x, y, t: 0, attack }; }
  pause() { pause(); }
}

// ---------------------------------------------------------------------
//  App lifecycle
// ---------------------------------------------------------------------
function startGame() {
  $('#menu').classList.add('hidden'); $('#hud').classList.remove('hidden'); $('#endscreen').classList.add('hidden');
  clearCache();
  const game = new Game({ playerFaction: settings.faction, difficulty: settings.difficulty, mapSize: settings.mapSize });
  const canvas = $('#game');
  const renderer = new Renderer(canvas, game);
  const ui = new UI({ game, mode: 'normal', selection: [] });
  const ctrl = new Controller(game, renderer, ui); ui.ctrl = ctrl;
  const input = new Input(canvas, ctrl);
  const ai = new AI(game, 1);
  const tc = game.ownBuildings(0, 'tc')[0]; renderer.centerOn(tc.x, tc.y + 1.5);
  renderer.cam.zoom = window.innerWidth < 500 ? 0.95 : 1.1;
  app = { game, renderer, ui, ctrl, input, ai, last: performance.now(), acc: 0, running: true, raf: 0 };
  audio.init(); audio.startAmbient(settings.faction);
  // pre-warm a few sprites
  for (const id of [FACTIONS[settings.faction].villager, FACTIONS[settings.faction].scout]) unitSprite(UNITS[id], 'f', false, 'idle', 0);
  window.onresize = () => renderer.resize();
  ctrl.select([tc]);
  loop(performance.now());
}
const FIXED = 1 / 30;
function loop(now) {
  if (!app) return;
  app.raf = requestAnimationFrame(loop);
  let dt = Math.min(0.1, (now - app.last) / 1000); app.last = now;
  const { game, renderer, ui, ctrl, ai } = app;
  if (!ctrl.paused && !game.over) {
    app.acc += dt * settings.speed;
    let steps = 0;
    while (app.acc >= FIXED && steps < 4) { game.update(FIXED); ai.update(FIXED); app.acc -= FIXED; steps++; }
    if (steps === 4) app.acc = 0;
  }
  processEvents();
  if (ctrl.marker) ctrl.marker.t += dt;
  ctrl.pruneSelection();
  renderer.draw(dt, { ghost: ctrl.ghost, dragBox: ctrl.dragBox, marker: ctrl.marker, selectedBuilding: ctrl.selectedBuilding });
  renderer.drawMinimap($('#minimap'), dt);
  ui.update(dt);
}
function processEvents() {
  const { game, renderer, ui, ctrl } = app;
  const ev = game.events; game.events = [];
  for (const e of ev) {
    switch (e.type) {
      case 'sound': { if (e.owner !== undefined && e.owner !== 0 && e.x === undefined) break; let vol = 1; if (e.x !== undefined) { const { sx, sy } = renderer.worldToScreen(e.x, e.y); const off = Math.max(0, Math.hypot(sx - renderer.W / 2, sy - renderer.H / 2) - Math.max(renderer.W, renderer.H) * 0.5); vol = clamp(1 - off / 600, 0, 1); if (!game.isVisible(e.x, e.y)) vol *= 0.2; } if (vol > 0.05) audio.play(e.name, vol); break; }
      case 'fx': if (game.isVisible(e.x, e.y)) renderer.handleFx(e); break;
      case 'msg': if (e.owner === 0) { ui.message(e.key ? t(e.key) : tn(e.text), e.warn ? 'warn' : ''); if (e.warn) audio.play('error'); } break;
      case 'buildingDone': if (e.b.owner === 0) { ui.message(`${tn(e.b.name)} ${t('buildingDone')}`, 'good'); audio.play('done'); } break;
      case 'buildingLost': if (e.owner === 0) { ui.message(`${tn(e.b.name)} ${lang === 'da' ? 'er ødelagt!' : 'has been destroyed!'}`, 'warn'); renderer.ping(e.b.x, e.b.y); } break;
      case 'attacked': if (e.owner === 0) { ui.message(t('underAttack'), 'warn'); audio.play('horn'); renderer.ping(e.x, e.y); ctrl.lastAlert = { x: e.x, y: e.y }; } break;
      case 'age': if (e.owner === 0) { ui.message(`${t('ageReached')} ${t('age' + e.age)}!`, 'good'); audio.play('age'); } else { ui.message(`${t('enemyAge')} ${t('age' + e.age)}`, ''); } break;
      case 'tech': if (e.owner === 0) { ui.message(`${tn(TECHS[e.id].name)} ${t('researched')}`, 'good'); audio.play('tech'); } break;
      case 'unitReady': if (e.owner === 0 && e.u.def.cls !== 'villager') audio.play('done'); break;
      case 'terrain': renderer.invalidateChunkAt(e.tx, e.ty); break;
      case 'gameOver': endGame(e.winner === 0); break;
    }
  }
}
function pause() { if (!app) return; app.ctrl.paused = true; $('#pause').classList.remove('hidden'); $('#btn-speed').textContent = STR[lang].speedLabel(settings.speed); $('#btn-sound').textContent = STR[lang].soundLabel(audio.enabled); $('#pause-stats').innerHTML = statsHtml(); }
function resume() { if (!app) return; app.ctrl.paused = false; $('#pause').classList.add('hidden'); app.last = performance.now(); }
function statsHtml() {
  const p = app.game.players[0], e = app.game.players[1];
  const row = (k, a, b) => `<div>${k}</div><div><b>${a}</b> / ${b}</div>`;
  return `<div></div><div><b>${lang === 'da' ? 'Dig' : 'You'}</b> / ${lang === 'da' ? 'Fjende' : 'Enemy'}</div>` + row(t('time'), fmtTime(app.game.time), '') + row(t('units'), app.game.ownUnits(0).length, app.game.ownUnits(1).length) + row(t('kills'), p.stats.kills, e.stats.kills) + row(t('lost'), p.stats.lost, e.stats.lost) + row(t('razed'), p.stats.razed, e.stats.razed) + row(t('gathered'), p.stats.gathered, e.stats.gathered) + row(lang === 'da' ? 'Tidsalder' : 'Age', t('ageShort' + p.age), t('ageShort' + e.age));
}
function endGame(won) {
  $('#end-title').textContent = won ? t('victory') : t('defeat');
  $('#end-text').textContent = won ? t('victoryText') : t('defeatText');
  $('#end-stats').innerHTML = statsHtml();
  $('#endscreen').classList.remove('hidden');
  audio.play(won ? 'victory' : 'defeat');
}
function quitToMenu() {
  if (app) { cancelAnimationFrame(app.raf); audio.stopAmbient(); app = null; }
  $('#hud').classList.add('hidden'); $('#pause').classList.add('hidden'); $('#endscreen').classList.add('hidden'); $('#menu').classList.remove('hidden');
  document.documentElement.removeAttribute('data-faction');
  startMenuBg();
}

// ---------------------------------------------------------------------
//  Menu
// ---------------------------------------------------------------------
function applyLang() {
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el => { const k = el.getAttribute('data-i18n'); el.textContent = t(k); });
  $('#btn-lang').textContent = lang === 'da' ? 'English' : 'Dansk';
  $('#help-body').innerHTML = t('help');
}
function initMenu() {
  applyLang();
  document.querySelectorAll('.faction-emblem').forEach(c => drawFactionEmblem(c, c.closest('.faction-card').dataset.faction));
  document.querySelectorAll('.faction-card').forEach(card => card.onclick = () => { document.querySelectorAll('.faction-card').forEach(c => c.classList.remove('selected')); card.classList.add('selected'); settings.faction = card.dataset.faction; audio.init(); audio.play('select'); });
  for (const [id, key] of [['#difficulty', 'difficulty'], ['#mapsize', 'mapSize']]) document.querySelectorAll(id + ' button').forEach(b => b.onclick = () => { document.querySelectorAll(id + ' button').forEach(x => x.classList.remove('selected')); b.classList.add('selected'); settings[key] = b.dataset.v; audio.init(); audio.play('click'); });
  $('#btn-start').onclick = () => { audio.init(); audio.play('horn'); stopMenuBg(); startGame(); };
  $('#btn-help').onclick = () => { $('#help').classList.remove('hidden'); };
  $('#btn-help-close').onclick = () => { $('#help').classList.add('hidden'); };
  $('#btn-lang').onclick = () => { setLang(lang === 'da' ? 'en' : 'da'); applyLang(); };
  $('#btn-resume').onclick = resume;
  $('#btn-speed').onclick = () => { settings.speed = settings.speed >= 2 ? 1 : settings.speed === 1 ? 1.5 : 2; localStorage.setItem('rsl_speed', settings.speed); $('#btn-speed').textContent = STR[lang].speedLabel(settings.speed); };
  $('#btn-sound').onclick = () => { audio.setEnabled(!audio.enabled); $('#btn-sound').textContent = STR[lang].soundLabel(audio.enabled); };
  $('#btn-restart').onclick = () => { quitToMenu(); stopMenuBg(); startGame(); };
  $('#btn-quit').onclick = quitToMenu;
  $('#btn-end-menu').onclick = quitToMenu;
  document.addEventListener('visibilitychange', () => { if (document.hidden && app && !app.ctrl.paused && !app.game.over) pause(); });
  startMenuBg();
}
// animated menu background: drifting isometric forest with motes
let menuAnim = null;
function startMenuBg() {
  const c = $('#menu-bg'); const ctx = c.getContext('2d');
  const resize = () => { c.width = c.clientWidth * Math.min(2, devicePixelRatio); c.height = c.clientHeight * Math.min(2, devicePixelRatio); };
  resize(); window.addEventListener('resize', resize);
  const trees = []; for (let i = 0; i < 40; i++) trees.push({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.8, style: i % 3 === 0 ? 'oak' : (Math.random() < 0.55 ? 'mallorn' : 'blight'), v: i });
  trees.sort((a, b) => a.y - b.y);
  const motes = []; for (let i = 0; i < 60; i++) motes.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.5 + 0.5, v: 0.02 + Math.random() * 0.04, p: Math.random() * 7 });
  let t0 = performance.now();
  const frame = (now) => {
    menuAnim = requestAnimationFrame(frame);
    const tt = (now - t0) / 1000; const W = c.width, H = c.height, k = W / 800;
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#07130b'); g.addColorStop(0.55, '#0e2416'); g.addColorStop(1, '#2a1a12');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // moon glow
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; const mg = ctx.createRadialGradient(W * 0.75, H * 0.18, 0, W * 0.75, H * 0.18, W * 0.35); mg.addColorStop(0, 'rgba(200,230,255,0.22)'); mg.addColorStop(1, 'rgba(200,230,255,0)'); ctx.fillStyle = mg; ctx.fillRect(0, 0, W, H); ctx.restore();
    for (const tr of trees) {
      const sp = treeSprite(tr.style, tr.v); const sc = tr.s * k * 1.4; const x = ((tr.x + tt * 0.004 * tr.s) % 1.2 - 0.1) * W, y = tr.y * H;
      ctx.globalAlpha = 0.35 + tr.y * 0.6; ctx.drawImage(sp, x - 36 * sc, y - 86 * sc, 72 * sc, 96 * sc);
    }
    ctx.globalAlpha = 1;
    for (const m of motes) { const x = ((m.x + Math.sin(tt * 0.3 + m.p) * 0.02) % 1) * W, y = ((m.y - tt * m.v * 0.1) % 1 + 1) % 1 * H; ctx.fillStyle = `rgba(255,240,180,${0.3 + 0.5 * Math.sin(tt * 2 + m.p) ** 2})`; ctx.beginPath(); ctx.arc(x, y, m.r * k, 0, 7); ctx.fill(); }
    ctx.fillStyle = 'rgba(4,8,5,0.35)'; ctx.fillRect(0, 0, W, H);
  };
  if (menuAnim) cancelAnimationFrame(menuAnim);
  menuAnim = requestAnimationFrame(frame);
}
function stopMenuBg() { if (menuAnim) cancelAnimationFrame(menuAnim); menuAnim = null; }

initMenu();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
window.__app = () => app;
