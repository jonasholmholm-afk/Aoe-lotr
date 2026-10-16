// =====================================================================
//  HUD: resources, selection panel, command grid, messages, placement bar
// =====================================================================
import { t, tn, lang } from './i18n.js';
import { UNITS, BUILDING_ROLES, TECHS, AGES, BUILD_MENU, RES, FACTIONS } from './data.js';
import { drawIcon, drawUnitPortrait, drawBuildingPortrait, drawTechIcon } from './sprites.js';
import { fmtTime } from './util.js';

const $ = (s) => document.querySelector(s);
const RES_ICON = { food: 'food', wood: 'wood', gold: 'gold', stone: 'stone' };

export class UI {
  constructor(ctrl) {
    this.ctrl = ctrl; this.game = ctrl.game;
    this.hud = $('#hud'); this.grid = $('#cmd-grid'); this.msgBox = $('#messages');
    this.refreshT = 0; this.sig = ''; this.buttons = new Map(); this.menu = 'root';
    for (const r of RES) drawIcon($(`#res-${r} canvas`), RES_ICON[r]);
    drawIcon($('#res-pop canvas'), 'pop');
    drawIcon($('#btn-idle canvas'), 'idle'); drawIcon($('#btn-tc canvas'), 'tc'); drawIcon($('#btn-army canvas'), 'army'); drawIcon($('#btn-box canvas'), 'box');
    $('#btn-idle').onclick = () => this.ctrl.selectIdleVillager();
    $('#btn-tc').onclick = () => this.ctrl.selectTC();
    $('#btn-army').onclick = () => this.ctrl.selectArmy();
    $('#btn-box').onclick = () => this.ctrl.toggleBoxMode();
    $('#btn-menu').onclick = () => this.ctrl.pause();
    $('#place-ok').onclick = () => this.ctrl.confirmPlacement();
    $('#place-cancel').onclick = () => this.ctrl.cancelMode();
    const mm = $('#minimap');
    const mmHandler = (e) => { e.preventDefault(); const r = mm.getBoundingClientRect(); this.ctrl.onMinimap(e.clientX - r.left, e.clientY - r.top); };
    mm.addEventListener('pointerdown', mmHandler); mm.addEventListener('pointermove', e => { if (e.buttons) mmHandler(e); });
    this.placeBar = $('#place-bar');
    document.documentElement.setAttribute('data-faction', this.game.players[0].faction);
  }
  update(dt) {
    this.refreshT -= dt;
    if (this.refreshT <= 0) { this.refreshT = 0.2; this.refreshTop(); this.refreshSelection(); }
    $('#btn-box').classList.toggle('on', this.ctrl.mode === 'box');
  }
  refreshTop() {
    const p = this.game.players[0];
    for (const r of RES) { const el = $(`#res-${r}`); el.querySelector('span').textContent = Math.floor(p.res[r]); }
    const pop = $('#res-pop'); pop.querySelector('span').textContent = `${p.pop}/${p.popCap}`; pop.classList.toggle('popfull', p.pop >= p.popCap);
    $('#age-label').textContent = t('ageShort' + p.age); $('#age-name').textContent = t('age' + p.age);
    $('#clock').textContent = fmtTime(this.game.time);
    const idle = this.game.ownUnits(0, u => u.isVillager && u.state === 'idle').length;
    const ic = $('#idle-count'); ic.textContent = idle; ic.classList.toggle('zero', idle === 0);
  }
  // ------------------------------------------------------------------
  refreshSelection() {
    const sel = this.ctrl.selection, g = this.game, p = g.players[0];
    const sig = sel.map(e => e.id).join(',') + '|' + this.menu + '|' + p.age + '|' + [...p.techs].join(',') + '|' + this.ctrl.mode + '|' + lang;
    const first = sel[0];
    // text info (every refresh)
    const nameEl = $('#sel-name'), statsEl = $('#sel-stats'), hp = $('#sel-hpbar div');
    if (!first) { nameEl.textContent = ''; statsEl.textContent = ''; hp.style.width = '0'; $('#sel-portrait').getContext('2d').clearRect(0, 0, 72, 72); }
    else if (first.kind === 'unit') {
      const st = g.stats(first);
      const mixed = sel.some(e => e.kind !== 'unit' || e.def !== first.def);
      nameEl.textContent = (mixed ? t('units') : tn(first.def.name)) + (sel.length > 1 ? ` ×${sel.length}` : '');
      const lines = [];
      lines.push(`${t('hp')} ${Math.ceil(first.hp)}/${st.maxHp}  ${t('armor')} ${st.armor}/${st.parmor}`);
      if (st.atk) lines.push(`${t('atk')} ${st.atk}${st.range ? `  ${t('range')} ${st.range}` : ''}`);
      let stateTxt = t(first.state === 'gather' ? 'gathering' : first.state === 'return' ? 'returning' : first.state === 'build' ? 'building' : first.state === 'attack' ? 'attacking' : first.state === 'move' ? 'moving' : 'idle');
      if (first.carry && first.carry.amount >= 1) stateTxt += ` · ${t('carrying')} ${Math.floor(first.carry.amount)} ${t(first.carry.res)}`;
      if (first.owner === 0) lines.push(stateTxt);
      else if (first.owner === -1 && first.def.food) lines.push(`${t('food')} ${first.def.food}`);
      statsEl.textContent = lines.join('\n');
      hp.style.width = (first.hp / st.maxHp * 100) + '%';
    } else if (first.kind === 'building') {
      nameEl.textContent = tn(first.name);
      const lines = [`${t('hp')} ${Math.ceil(first.hp)}/${first.maxHp}  ${t('armor')} ${first.def.armor}/${first.def.parmor}`];
      if (!first.complete) lines.push(`${t('constructing')} ${Math.floor(first.progress * 100)}%`);
      else if (first.role === 'farm') lines.push(`${t('food')} ${Math.floor(first.farmFood)}`);
      if (first.queue.length) { const q = first.queue[0]; const nm = q.type === 'unit' ? tn(UNITS[q.id].name) : q.type === 'tech' ? tn(TECHS[q.id].name) : t('age' + (p.age + 1)); lines.push(`${nm} ${Math.floor(q.t / q.total * 100)}%${first.queue.length > 1 ? ` (+${first.queue.length - 1})` : ''}`); }
      if (first.def.atk) lines.push(`${t('atk')} ${first.def.atk}  ${t('range')} ${first.def.range}`);
      statsEl.textContent = lines.join('\n');
      hp.style.width = (first.hp / first.maxHp * 100) + '%';
    } else if (first.kind === 'node') {
      nameEl.textContent = tn(first.constructor.name === 'Node' ? { da: ({ tree: 'Skov', berry: 'Bærbuske', gold: 'Guldåre', stone: 'Stenbrud', carcass: 'Bytte' })[first.nodeKind], en: ({ tree: 'Forest', berry: 'Berry Bushes', gold: 'Gold Vein', stone: 'Stone Outcrop', carcass: 'Carcass' })[first.nodeKind] } : '');
      statsEl.textContent = `${t(first.res)} ${Math.floor(first.amount)}`; hp.style.width = '0';
    }
    // progress on queue buttons (every refresh)
    if (first && first.kind === 'building' && first.owner === 0) {
      for (const [key, btn] of this.buttons) {
        const qCount = first.queue.filter(q => q.id === key).length;
        const qEl = btn.querySelector('.q'); if (qEl) qEl.textContent = qCount > 1 ? qCount : (qCount === 1 ? '•' : '');
        const pr = btn.querySelector('.prog'); if (pr) { const q0 = first.queue[0]; pr.style.width = q0 && q0.id === key ? (q0.t / q0.total * 100) + '%' : '0'; }
        const cost = btn._cost; if (cost) btn.classList.toggle('disabled', !g.canAfford(p, cost));
      }
    } else if (first && first.kind === 'unit') {
      for (const [key, btn] of this.buttons) { const cost = btn._cost; if (cost) btn.classList.toggle('disabled', !g.canAfford(p, cost) || (btn._age && btn._age > p.age)); }
    }
    if (sig === this.sig) return;
    this.sig = sig;
    // portrait
    const pc = $('#sel-portrait');
    if (first && first.kind === 'unit') drawUnitPortrait(pc, first.def);
    else if (first && first.kind === 'building') drawBuildingPortrait(pc, first.faction, first.role);
    else if (first && first.kind === 'node') { const c = pc.getContext('2d'); c.clearRect(0, 0, 72, 72); drawIcon(pc, first.res === 'wood' ? 'wood' : first.res === 'food' ? 'food' : first.res); }
    this.buildGrid(sel);
  }
  // ------------------------------------------------------------------
  buildGrid(sel) {
    const g = this.game, p = g.players[0], grid = this.grid;
    grid.innerHTML = ''; this.buttons.clear();
    const first = sel[0];
    if (!first) return;
    const ownUnits = sel.filter(e => e.kind === 'unit' && e.owner === 0);
    if (ownUnits.length) {
      const villagers = ownUnits.filter(u => u.isVillager), military = ownUnits.filter(u => u.isMilitary);
      if (this.menu === 'build' && villagers.length) {
        this.addBtn('back', t('back'), 'back', () => { this.menu = 'root'; this.refreshSelection(); }, { cls: 'back' });
        for (const role of BUILD_MENU) {
          const def = BUILDING_ROLES[role]; const skin = p.f.buildings[role];
          const cost = g.buildingCost(p, role);
          const b = this.addBtn('b_' + role, tn(skin.name), null, () => this.ctrl.beginPlacement(role), { cost, age: def.age, building: role });
          if (def.age > p.age) { b.classList.add('disabled'); b.querySelector('.lbl').textContent = `${t('ageShort' + def.age)} · ${tn(skin.name)}`; }
        }
      } else {
        if (villagers.length) this.addBtn('build', t('build'), 'build', () => { this.menu = 'build'; this.refreshSelection(); });
        if (military.length) this.addBtn('am', t('attackMove'), 'attackmove', () => this.ctrl.setMode('attackmove'), { active: this.ctrl.mode === 'attackmove' });
        this.addBtn('stop', t('stop'), 'stop', () => this.ctrl.stopSelected());
        this.addBtn('del', t('deleteU'), 'delete', () => this.ctrl.deleteSelected(), { cls: 'danger' });
      }
      return;
    }
    if (first.kind === 'building' && first.owner === 0) {
      const b = first;
      if (!b.complete) { this.addBtn('del', t('cancel'), 'delete', () => this.ctrl.deleteSelected(), { cls: 'danger' }); return; }
      const trains = b.role === 'tc' ? [p.f.villager] : (b.skin.trains || []);
      for (const id of trains) {
        const realId = p.upgraded[id] || id; const d = UNITS[realId];
        if (d.unique && p.heroAlive) continue;
        this.addBtn(realId, tn(d.name), null, () => this.ctrl.train(b, realId), { cost: g.unitCost(p, realId), unit: realId, queue: true, long: () => this.ctrl.cancelQueue(b, realId) });
      }
      const techs = [...(b.skin.techs || []), ...(b.role === 'tc' ? p.f.tcTechs : []), ...(b.role === 'lumber' ? p.f.lumberTechs : []), ...(b.role === 'mill' ? p.f.millTechs : []), ...(b.role === 'mine' ? p.f.mineTechs : [])];
      for (const id of techs) {
        const tech = TECHS[id]; if (p.techs.has(id)) continue; if (tech.req && !p.techs.has(tech.req)) continue;
        const btn = this.addBtn(id, tn(tech.name), 'tech', () => this.ctrl.research(b, id), { cost: tech.cost, queue: true, title: tn(tech.desc), age: tech.age });
        if (tech.age > p.age) { btn.classList.add('disabled'); btn.querySelector('.lbl').textContent = `${t('ageShort' + tech.age)} · ${tn(tech.name)}`; }
      }
      if (b.role === 'tc' && p.age < 3) {
        const a = AGES[p.age];
        this.addBtn('age' + (p.age + 1), `${t('advanceAge')} ${t('ageShort' + (p.age + 1))}`, 'age', () => this.ctrl.ageUp(b), { cost: a.cost, queue: true, iconExtra: t('ageShort' + (p.age + 1)) });
      }
      if (b.skin.trains || b.role === 'tc') this.addBtn('rally', t('rally'), 'rally', () => this.ctrl.setMode('rally'), { active: this.ctrl.mode === 'rally' });
      this.addBtn('del', t('deleteU'), 'delete', () => this.ctrl.deleteSelected(), { cls: 'danger' });
    }
  }
  addBtn(key, label, icon, onClick, opts = {}) {
    const btn = document.createElement('button'); btn.className = 'cmd' + (opts.cls ? ' ' + opts.cls : '') + (opts.active ? ' active' : '');
    const c = document.createElement('canvas'); c.width = 80; c.height = 80; btn.appendChild(c);
    if (opts.unit) drawUnitPortrait(c, UNITS[opts.unit]);
    else if (opts.building) drawBuildingPortrait(c, this.game.players[0].faction, opts.building);
    else if (icon) drawIcon(c, icon, opts.iconExtra);
    const lbl = document.createElement('div'); lbl.className = 'lbl'; lbl.textContent = label; btn.appendChild(lbl);
    if (opts.cost) {
      const cost = document.createElement('div'); cost.className = 'cost';
      const p = this.game.players[0];
      cost.innerHTML = Object.entries(opts.cost).filter(([, v]) => v > 0).map(([k, v]) => `<i class="${p.res[k] < v ? 'no' : ''}">${v}${{ food: 'M', wood: 'T', gold: 'G', stone: 'S' }[k]}</i>`).join('');
      if (lang === 'en') cost.innerHTML = Object.entries(opts.cost).filter(([, v]) => v > 0).map(([k, v]) => `<i class="${p.res[k] < v ? 'no' : ''}">${v}${{ food: 'F', wood: 'W', gold: 'G', stone: 'S' }[k]}</i>`).join('');
      btn.appendChild(cost); btn._cost = opts.cost;
    }
    if (opts.age) btn._age = opts.age;
    if (opts.queue) { const q = document.createElement('div'); q.className = 'q'; btn.appendChild(q); const pr = document.createElement('div'); pr.className = 'prog'; btn.appendChild(pr); }
    if (opts.title) btn.title = opts.title;
    let longT = null, fired = false;
    btn.addEventListener('pointerdown', e => { e.stopPropagation(); fired = false; if (opts.long) longT = setTimeout(() => { fired = true; opts.long(); }, 450); });
    btn.addEventListener('pointerup', e => { e.stopPropagation(); clearTimeout(longT); if (!fired) onClick(); });
    btn.addEventListener('pointerleave', () => clearTimeout(longT));
    btn.addEventListener('contextmenu', e => { e.preventDefault(); if (opts.long) opts.long(); });
    this.grid.appendChild(btn); this.buttons.set(key, btn);
    return btn;
  }
  // ------------------------------------------------------------------
  message(text, kind = '') {
    const el = document.createElement('div'); el.className = 'msg ' + kind; el.textContent = text; this.msgBox.appendChild(el);
    while (this.msgBox.children.length > 4) this.msgBox.firstChild.remove();
    setTimeout(() => el.classList.add('fade'), 4500); setTimeout(() => el.remove(), 5200);
  }
  showPlaceBar(role) { this.placeBar.classList.remove('hidden'); $('#place-name').textContent = tn(this.game.players[0].f.buildings[role].name); }
  hidePlaceBar() { this.placeBar.classList.add('hidden'); }
  resetMenu() { this.menu = 'root'; this.sig = ''; }
}
