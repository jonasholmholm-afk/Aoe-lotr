// =====================================================================
//  Renderer: isometric terrain chunks, entities, fog, particles, minimap
// =====================================================================
import { TW, TH, HW, HH, clamp, lerp, makeCanvas, RNG, Noise, shade, rgba, mixHex, dist } from './util.js';
import { T } from './map.js';
import { unitSprite, treeSprite, treeStyle, nodeSprite, buildingSprite, rubbleSprite, S, BSCALE, UNIT_W, UNIT_H, UNIT_ANCHOR_Y, TREE_W, TREE_H, TREE_ANCHOR_Y, NODE_W, NODE_H, NODE_ANCHOR_Y, WALK_FRAMES, ATTACK_FRAMES } from './sprites.js';
import { FACTIONS, BUILDING_ROLES } from './data.js';

const CH = 8;                                  // chunk size in tiles
const COL = {
  grassElf: ['#5f9a45', '#6fae50', '#86b85a', '#4e8a3c'],
  grassMid: ['#5c8f44', '#689a48', '#74a04c', '#4f7f3a'],
  grassBlight: ['#6a6e42', '#777048', '#5c5f3a', '#7c7650'],
  dirt: ['#8a7048', '#937a50', '#7a6240'], dirtBlight: ['#564a3e', '#62544a', '#4a4036'],
  forestElf: '#4a7a36', forestMid: '#3f6a30', forestBlight: '#3a3a2c',
  waterDeep: '#1f4f72', water: '#2e6f94', shallow: '#5f9cb0', shallowBlight: '#4f6f70', waterBlight: '#263a44',
  rock: ['#7c7c78', '#8e8e88', '#67675f'], rockBlight: ['#4e4a46', '#5a5650', '#3e3a36'],
};

export class Renderer {
  constructor(canvas, game) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.game = game; this.map = game.map; this.n = game.map.n;
    this.cam = { x: 0, y: 0, zoom: 1 };
    this.minZoom = 0.55; this.maxZoom = 2.2;
    this.chunks = new Map();
    this.noise = new Noise(game.seed + 99);
    this.particles = [];
    this.time = 0;
    this.fogCanvas = makeCanvas(this.n * 2, this.n * 2); this.fogCtx = this.fogCanvas.getContext('2d');
    this.waterPattern = this.makeWaterPattern();
    this.minimapBase = null; this.minimapT = 0;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.resize();
    this.ambientT = 0;
    this.flashes = [];     // minimap pings {x,y,t}
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.W = w; this.H = h;
    this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
  }
  // ----- camera -----
  worldToScreen(x, y) { const z = this.cam.zoom; return { sx: ((x - y) - (this.cam.x - this.cam.y)) * HW * z + this.W / 2, sy: ((x + y) - (this.cam.x + this.cam.y)) * HH * z + this.H / 2 }; }
  screenToWorld(sx, sy) {
    const z = this.cam.zoom;
    const a = (sx - this.W / 2) / (HW * z) + (this.cam.x - this.cam.y), b = (sy - this.H / 2) / (HH * z) + (this.cam.x + this.cam.y);
    return { x: (a + b) / 2, y: (b - a) / 2 };
  }
  clampCam() { const m = 4; this.cam.x = clamp(this.cam.x, -m, this.n + m); this.cam.y = clamp(this.cam.y, -m, this.n + m); this.cam.zoom = clamp(this.cam.zoom, this.minZoom, this.maxZoom); }
  centerOn(x, y) { this.cam.x = x; this.cam.y = y; this.clampCam(); }

  // ------------------------------------------------------------------
  //  Terrain chunks
  // ------------------------------------------------------------------
  tileColor(x, y) {
    const m = this.map, i = m.idx(x, y), t = m.terrain[i], b = m.biome[i], v = m.variant[i];
    const nz = this.noise.fbm(x / 9, y / 9, 2) * 0.5 + 0.5;
    const pick = (arr) => arr[Math.min(arr.length - 1, (nz * arr.length) | 0)];
    let base;
    if (t === T.GRASS || t === T.FOREST) {
      const g = b < 0.5 ? mixHex(pick(COL.grassElf), pick(COL.grassMid), b * 2) : mixHex(pick(COL.grassMid), pick(COL.grassBlight), (b - 0.5) * 2);
      base = g;
      if (t === T.FOREST) base = mixHex(g, b < 0.5 ? COL.forestElf : COL.forestBlight, 0.6);
    } else if (t === T.DIRT) base = b < 0.55 ? pick(COL.dirt) : mixHex(pick(COL.dirt), pick(COL.dirtBlight), (b - 0.55) * 2.2);
    else if (t === T.WATER) base = mixHex(COL.water, COL.waterBlight, Math.max(0, b - 0.5) * 1.6);
    else if (t === T.SHALLOW) base = mixHex(COL.shallow, COL.shallowBlight, Math.max(0, b - 0.5) * 1.6);
    else base = b < 0.55 ? pick(COL.rock) : pick(COL.rockBlight);
    // gentle light variance (large-scale) + tiny per-tile grain
    return shade(base, (nz - 0.5) * 0.22 + ((v % 7) - 3) * 0.006);
  }
  getChunk(cx, cy) {
    const scale = this.cam.zoom > 1.35 ? 2 : 1;
    const key = cx + ',' + cy + ',' + scale;
    let c = this.chunks.get(key);
    if (!c) { c = this.renderChunk(cx, cy, scale); this.chunks.set(key, c); }
    return c;
  }
  invalidateChunkAt(tx, ty) { for (const k of [...this.chunks.keys()]) { const [cx, cy] = k.split(',').map(Number); if (cx === (tx / CH) | 0 && cy === (ty / CH) | 0) this.chunks.delete(k); } this.minimapBase = null; }
  renderChunk(cx, cy, scale) {
    const x0 = cx * CH, y0 = cy * CH;
    const w = 2 * CH * HW, h = 2 * CH * HH + 40;        // extra for rock height
    const cv = makeCanvas(w * scale, h * scale); const ctx = cv.getContext('2d');
    ctx.scale(scale, scale);
    // local origin: tile (x0,y0) top corner at (w/2, 30)
    const ox = w / 2, oy = 30;
    const P = (x, y) => [ox + (x - x0 - (y - y0)) * HW, oy + (x - x0 + y - y0) * HH];
    const m = this.map, rng = new RNG(cx * 1000 + cy + this.game.seed);
    const waterPath = new Path2D(); let hasWater = false;
    const diamond = (ctxOrPath, x, y, grow = 0) => { const [ax, ay] = P(x, y); ctxOrPath.moveTo(ax, ay - grow); ctxOrPath.lineTo(ax + HW + grow, ay + HH); ctxOrPath.lineTo(ax, ay + TH + grow); ctxOrPath.lineTo(ax - HW - grow, ay + HH); ctxOrPath.closePath(); };
    // pass 1: base ground (grass everywhere so blur layers blend)
    for (let y = y0; y < y0 + CH; y++) for (let x = x0; x < x0 + CH; x++) {
      if (!m.inBounds(x, y)) continue;
      const t = m.terrain[m.idx(x, y)];
      ctx.beginPath(); diamond(ctx, x, y, 0.6);
      ctx.fillStyle = (t === T.GRASS || t === T.FOREST || t === T.ROCK || t === T.DIRT) ? this.tileColor(x, y) : this.tileColor(x, y);
      if (t === T.ROCK) ctx.fillStyle = this.grassLike(x, y);
      ctx.fill();
    }
    // pass 2: soft overlays (dirt, forest floor) via blur
    const ov = makeCanvas(w, h); const octx = ov.getContext('2d');
    let anyOv = false;
    for (let y = y0 - 1; y < y0 + CH + 1; y++) for (let x = x0 - 1; x < x0 + CH + 1; x++) {
      if (!m.inBounds(x, y)) continue;
      const t = m.terrain[m.idx(x, y)];
      if (t === T.DIRT || t === T.FOREST) { anyOv = true; octx.beginPath(); diamond(octx, x, y, 2); octx.fillStyle = this.tileColor(x, y); octx.fill(); }
    }
    if (anyOv) { ctx.save(); ctx.filter = 'blur(5px)'; ctx.drawImage(ov, 0, 0); ctx.restore(); }
    // pass 3: water (soft shores)
    const wv = makeCanvas(w, h); const wctx = wv.getContext('2d');
    for (let y = y0 - 1; y < y0 + CH + 1; y++) for (let x = x0 - 1; x < x0 + CH + 1; x++) {
      if (!m.inBounds(x, y)) continue;
      const t = m.terrain[m.idx(x, y)];
      if (t === T.WATER || t === T.SHALLOW) { hasWater = true; wctx.beginPath(); diamond(wctx, x, y, 1.5); wctx.fillStyle = this.tileColor(x, y); wctx.fill(); if (x >= x0 && y >= y0 && x < x0 + CH && y < y0 + CH) diamond(waterPath, x, y, 1); }
    }
    if (hasWater) {
      // sandy rim then water
      ctx.save(); ctx.filter = 'blur(6px)'; ctx.globalAlpha = 0.7; ctx.drawImage(this.tinted(wv, '#c9b98a'), 0, 0); ctx.restore();
      ctx.save(); ctx.filter = 'blur(2.5px)'; ctx.drawImage(wv, 0, 0); ctx.restore();
      // deep centres
      for (let y = y0; y < y0 + CH; y++) for (let x = x0; x < x0 + CH; x++) {
        if (!m.inBounds(x, y) || m.terrain[m.idx(x, y)] !== T.WATER) continue;
        let deep = true; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (m.terrainAt(x + dx, y + dy) !== T.WATER) deep = false;
        if (deep) { const [ax, ay] = P(x, y); ctx.fillStyle = rgba('#163d5c', 0.45); ctx.beginPath(); ctx.ellipse(ax, ay + HH, HW * 0.9, HH * 0.9, 0, 0, 7); ctx.fill(); }
      }
    }
    // pass 4: ground detail (tufts, flowers, pebbles, ash)
    for (let y = y0; y < y0 + CH; y++) for (let x = x0; x < x0 + CH; x++) {
      if (!m.inBounds(x, y)) continue;
      const i = m.idx(x, y), t = m.terrain[i], b = m.biome[i];
      const [ax, ay] = P(x, y); const cxp = ax, cyp = ay + HH;
      if (t === T.GRASS) {
        const n = 3 + ((m.variant[i] % 4));
        for (let k = 0; k < n; k++) {
          const px = cxp + (rng.next() - 0.5) * HW * 1.4, py = cyp + (rng.next() - 0.5) * HH * 1.4;
          if (b < 0.45) { // lush tufts and flowers
            ctx.strokeStyle = rgba(rng.next() < 0.5 ? '#9ad66a' : '#3f7a2e', 0.55); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 1.5, py - 4); ctx.moveTo(px + 1, py); ctx.lineTo(px + 2.5, py - 3.5); ctx.stroke();
            if (rng.next() < 0.18) { ctx.fillStyle = ['#f6e58d', '#e8a0c8', '#cfe8ff', '#fff'][rng.int(0, 3)]; ctx.beginPath(); ctx.arc(px, py - 1, 1.3, 0, 7); ctx.fill(); }
          } else if (b < 0.65) {
            ctx.strokeStyle = rgba('#3f6a2e', 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - 1, py - 3.5); ctx.moveTo(px + 1, py); ctx.lineTo(px + 2, py - 3); ctx.stroke();
          } else { // ash, bones, cracks
            if (rng.next() < 0.5) { ctx.fillStyle = rgba('#2a2620', 0.5); ctx.beginPath(); ctx.arc(px, py, 1.5 + rng.next() * 1.5, 0, 7); ctx.fill(); }
            else { ctx.strokeStyle = rgba('#2a2620', 0.45); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 4 - rng.next() * 8, py + 2 - rng.next() * 4); ctx.stroke(); }
            if (rng.next() < 0.04) { ctx.fillStyle = '#d8ccb0'; ctx.beginPath(); ctx.ellipse(px, py, 2.2, 1.2, 0.4, 0, 7); ctx.fill(); }
          }
        }
      } else if (t === T.DIRT) {
        for (let k = 0; k < 3; k++) { const px = cxp + (rng.next() - 0.5) * HW * 1.2, py = cyp + (rng.next() - 0.5) * HH * 1.2; ctx.fillStyle = rgba(rng.next() < 0.5 ? '#5a4a30' : '#b0a080', 0.45); ctx.beginPath(); ctx.ellipse(px, py, 1.6, 1, 0, 0, 7); ctx.fill(); }
      } else if (t === T.ROCK) this.drawRock(ctx, cxp, cyp, b, rng);
    }
    cv.waterPath = waterPath; cv.hasWater = hasWater; cv.scale = scale; cv.ox = ox; cv.oy = oy;
    return cv;
  }
  grassLike(x, y) { const m = this.map, b = m.biome[m.idx(x, y)]; return b < 0.5 ? '#5f9a45' : mixHex('#5c8f44', '#5a5f3a', (b - 0.5) * 2); }
  tinted(src, color) { const c = makeCanvas(src.width, src.height); const x = c.getContext('2d'); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height); return c; }
  drawRock(ctx, cx, cy, b, rng) {
    const cols = b < 0.55 ? COL.rock : COL.rockBlight;
    const n = 2 + rng.int(0, 2);
    for (let k = 0; k < n; k++) {
      const px = cx + (rng.next() - 0.5) * HW * 0.9, py = cy + (rng.next() - 0.5) * HH * 0.8, w = 9 + rng.next() * 10, h = 10 + rng.next() * 14;
      const g = ctx.createLinearGradient(px - w, py - h, px + w, py); g.addColorStop(0, shade(cols[1], 0.3)); g.addColorStop(0.5, cols[0]); g.addColorStop(1, shade(cols[2], -0.3));
      ctx.beginPath(); ctx.moveTo(px - w, py + 3); ctx.lineTo(px - w * 0.7, py - h * 0.6); ctx.lineTo(px - w * 0.1, py - h); ctx.lineTo(px + w * 0.6, py - h * 0.8); ctx.lineTo(px + w, py); ctx.lineTo(px + w * 0.5, py + 5); ctx.closePath();
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(20,20,20,0.6)'; ctx.lineWidth = 0.8; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.moveTo(px - w * 0.6, py - h * 0.55); ctx.lineTo(px - w * 0.1, py - h * 0.9); ctx.stroke();
    }
    if (b < 0.6 && rng.next() < 0.5) { ctx.fillStyle = rgba('#6fae50', 0.6); ctx.beginPath(); ctx.ellipse(cx + 6, cy + 4, 5, 2.5, 0, 0, 7); ctx.fill(); }
  }
  makeWaterPattern() {
    const c = makeCanvas(128, 64); const x = c.getContext('2d');
    const rng = new RNG(5);
    for (let i = 0; i < 26; i++) { const px = rng.next() * 128, py = rng.next() * 64, len = 8 + rng.next() * 18; x.strokeStyle = rgba('#dff3ff', 0.18 + rng.next() * 0.2); x.lineWidth = 1 + rng.next(); x.lineCap = 'round'; x.beginPath(); x.moveTo(px, py); x.lineTo(px + len, py + len * 0.1); x.stroke(); }
    return c;
  }

  // ------------------------------------------------------------------
  //  Main draw
  // ------------------------------------------------------------------
  draw(dt, ui) {
    this.time += dt;
    // adaptive resolution: drop device pixel ratio if frames are slow
    this.frameAcc = (this.frameAcc || 0) + dt; this.frameN = (this.frameN || 0) + 1;
    if (this.frameAcc > 4) { const avg = this.frameAcc / this.frameN; if (avg > 0.045 && this.dpr > 1) { this.dpr = Math.max(1, this.dpr - 0.35); this.resize(); } else if (avg < 0.02 && this.dpr < Math.min(2, window.devicePixelRatio || 1)) { this.dpr = Math.min(2, window.devicePixelRatio || 1, this.dpr + 0.25); this.resize(); } this.frameAcc = 0; this.frameN = 0; }
    const ctx = this.ctx, g = this.game, z = this.cam.zoom;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = '#0a1a12'; ctx.fillRect(0, 0, this.W, this.H);
    // visible world bounds (in tiles, generous)
    const c0 = this.screenToWorld(0, 0), c1 = this.screenToWorld(this.W, 0), c2 = this.screenToWorld(0, this.H), c3 = this.screenToWorld(this.W, this.H);
    const minX = Math.min(c0.x, c1.x, c2.x, c3.x) - 3, maxX = Math.max(c0.x, c1.x, c2.x, c3.x) + 3, minY = Math.min(c0.y, c1.y, c2.y, c3.y) - 3, maxY = Math.max(c0.y, c1.y, c2.y, c3.y) + 6;
    this.view = { minX, maxX, minY, maxY };
    // ---- terrain chunks ----
    const chunkMinX = Math.max(0, (minX / CH) | 0), chunkMaxX = Math.min(Math.ceil(this.n / CH) - 1, (maxX / CH) | 0), chunkMinY = Math.max(0, (minY / CH) | 0), chunkMaxY = Math.min(Math.ceil(this.n / CH) - 1, (maxY / CH) | 0);
    ctx.imageSmoothingEnabled = true;
    const waterChunks = [];
    for (let cy = chunkMinY; cy <= chunkMaxY; cy++) for (let cx = chunkMinX; cx <= chunkMaxX; cx++) {
      const ch = this.getChunk(cx, cy);
      const { sx, sy } = this.worldToScreen(cx * CH, cy * CH);
      const dw = ch.width / ch.scale * z, dh = ch.height / ch.scale * z;
      ctx.drawImage(ch, sx - ch.ox * z, sy - ch.oy * z, dw, dh);
      if (ch.hasWater) waterChunks.push({ ch, sx, sy });
    }
    // water shimmer
    if (waterChunks.length) {
      ctx.save();
      const pat = ctx.createPattern(this.waterPattern, 'repeat');
      for (const { ch, sx, sy } of waterChunks) {
        ctx.save(); ctx.translate(sx - ch.ox * z, sy - ch.oy * z); ctx.scale(z, z); ctx.clip(ch.waterPath);
        ctx.globalAlpha = 0.55; ctx.fillStyle = pat; ctx.save(); ctx.translate((this.time * 9) % 128, Math.sin(this.time * 0.7) * 3); ctx.fillRect(-200, -200, 1400, 1000); ctx.restore(); ctx.restore();
      }
      ctx.restore();
    }
    // ---- decals (rubble) ----
    for (const d of g.decals) { if (d.x < minX || d.x > maxX || d.y < minY || d.y > maxY) continue; const sp = rubbleSprite(d.size, d.variant); const { sx, sy } = this.worldToScreen(d.x, d.y); ctx.globalAlpha = clamp(1 - (d.t - 90) / 30, 0, 1) * 0.95; ctx.drawImage(sp, sx - sp.width / BSCALE / 2 * z, sy - (d.size * HH + 30) * z, sp.width / BSCALE * z, sp.height / BSCALE * z); }
    ctx.globalAlpha = 1;
    // ---- collect drawables ----
    const list = [];
    for (const nd of g.nodes) { if (nd.dead || nd.x < minX || nd.x > maxX || nd.y < minY || nd.y > maxY) continue; if (!g.isExplored(nd.x, nd.y) || (nd.nodeKind === 'tree' && !g.isExplored(nd.x - 1, nd.y - 1))) continue; list.push({ k: nd.x + nd.y, e: nd }); }
    for (const b of g.buildings) { if (b.dead) continue; if (b.x + b.size < minX || b.x - b.size > maxX || b.y + b.size < minY || b.y - b.size > maxY) continue; if (!this.buildingSeen(b)) continue; list.push({ k: b.tx + b.ty + b.size, e: b }); }
    for (const u of g.units) { if (u.x < minX || u.x > maxX || u.y < minY || u.y > maxY) continue; if (u.owner !== 0 && !g.isVisible(u.x, u.y)) continue; list.push({ k: u.x + u.y + (u.dead ? -0.3 : 0), e: u }); }
    list.sort((a, b) => a.k - b.k);
    // ---- ghost footprint, selection rings & shadows (ground layer) ----
    if (ui.ghost) this.drawGhostFootprint(ui.ghost);
    for (const { e } of list) {
      if (e.kind === 'unit' && !e.dead) {
        const { sx, sy } = this.worldToScreen(e.x, e.y);
        if (e.selected) { ctx.strokeStyle = e.owner === 0 ? 'rgba(120,255,140,0.95)' : 'rgba(255,90,70,0.95)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(sx, sy, (e.radius + 0.25) * HW * z, (e.radius + 0.25) * HH * z, 0, 0, 7); ctx.stroke(); }
        ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(sx, sy + 1, (e.radius + 0.15) * HW * z * (e.def.sprite.kind === 'giant' ? 1.3 : 1), (e.radius + 0.15) * HH * z, 0, 0, 7); ctx.fill();
      } else if (e.kind === 'building' && e.selected) this.drawFootprintOutline(e.tx, e.ty, e.size, e.owner === 0 ? 'rgba(120,255,140,0.9)' : 'rgba(255,90,70,0.9)');
    }
    // ---- entities ----
    for (const { e } of list) {
      if (e.kind === 'node') this.drawNode(e);
      else if (e.kind === 'building') this.drawBuilding(e);
      else this.drawUnit(e);
    }
    // ---- projectiles ----
    for (const pr of g.projectiles) this.drawProjectile(pr);
    // ---- particles ----
    this.updateParticles(dt);
    this.drawParticles();
    // ---- rally point for selected building ----
    if (ui.selectedBuilding && ui.selectedBuilding.rally) { const r = ui.selectedBuilding.rally; const { sx, sy } = this.worldToScreen(r.x, r.y); const { sx: bx, sy: by } = this.worldToScreen(ui.selectedBuilding.x, ui.selectedBuilding.y); ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(217,184,87,0.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx, by - 10 * z); ctx.lineTo(sx, sy); ctx.stroke(); ctx.setLineDash([]); ctx.strokeStyle = '#6b4a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx, sy - 18 * z); ctx.stroke(); ctx.fillStyle = '#d9b857'; ctx.beginPath(); ctx.moveTo(sx, sy - 18 * z); ctx.lineTo(sx + 11 * z, sy - 14 * z); ctx.lineTo(sx, sy - 10 * z); ctx.fill(); }
    // ---- ghost building ----
    if (ui.ghost) this.drawGhost(ui.ghost);
    // ---- move marker ----
    if (ui.marker && ui.marker.t < 0.6) { const mk = ui.marker; const { sx, sy } = this.worldToScreen(mk.x, mk.y); const k = mk.t / 0.6; ctx.strokeStyle = mk.attack ? `rgba(255,80,60,${1 - k})` : `rgba(120,255,140,${1 - k})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(sx, sy, (0.5 + k) * HW * z * 0.7, (0.5 + k) * HH * z * 0.7, 0, 0, 7); ctx.stroke(); }
    // ---- fog ----
    this.drawFog();
    // ---- health bars (above fog so they stay readable) ----
    for (const { e } of list) this.drawHealth(e);
    // ---- drag box ----
    if (ui.dragBox) { const b = ui.dragBox; ctx.strokeStyle = 'rgba(120,255,140,0.9)'; ctx.fillStyle = 'rgba(120,255,140,0.12)'; ctx.lineWidth = 1.5; const x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1); ctx.fillRect(x, y, Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0)); ctx.strokeRect(x, y, Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0)); }
    // ambient particles
    this.ambient(dt);
  }
  buildingSeen(b) {
    if (b.owner === 0) return true;
    // enemy buildings remain visible once explored (AoE style)
    for (let y = 0; y < b.size; y++) for (let x = 0; x < b.size; x++) if (this.game.isExplored(b.tx + x, b.ty + y)) return true;
    return false;
  }
  // ------------------------------------------------------------------
  drawNode(nd) {
    const ctx = this.ctx, z = this.cam.zoom;
    const { sx, sy } = this.worldToScreen(nd.x, nd.y);
    if (nd.nodeKind === 'tree') {
      const sp = treeSprite(treeStyle(nd.biome), nd.variant);
      const sway = Math.sin(this.time * 1.3 + nd.variant) * 0.6 * z;
      ctx.drawImage(sp, sx - TREE_W / 2 * z + sway, sy - TREE_ANCHOR_Y * z, TREE_W * z, TREE_H * z);
    } else {
      const sp = nodeSprite(nd.nodeKind, nd.variant);
      ctx.drawImage(sp, sx - NODE_W / 2 * z, sy - NODE_ANCHOR_Y * z, NODE_W * z, NODE_H * z);
    }
  }
  drawBuilding(b) {
    const ctx = this.ctx, z = this.cam.zoom;
    const { sx, sy } = this.worldToScreen(b.x, b.y);
    const sp = buildingSprite(b.faction, b.role, b.complete ? 1 : b.progress, b.variant);
    const w = sp.width / BSCALE, h = sp.height / BSCALE;
    const visible = this.game.isVisible(b.x, b.y);
    if (!visible && b.owner !== 0) ctx.globalAlpha = 0.85;
    ctx.drawImage(sp, sx - w / 2 * z, sy - (h - b.size * HH - 8) * z, w * z, h * z);
    ctx.globalAlpha = 1;
    // damage smoke
    if (b.complete && b.hp < b.maxHp * 0.5 && visible && Math.random() < dt60(0.25)) this.spawn('smoke', b.x + (Math.random() - 0.5) * b.size * 0.6, b.y + (Math.random() - 0.5) * b.size * 0.6, 1.2 + Math.random());
    if (b.complete && b.hp < b.maxHp * 0.25 && visible && Math.random() < dt60(0.2)) this.spawn('fire', b.x + (Math.random() - 0.5) * b.size * 0.6, b.y + (Math.random() - 0.5) * b.size * 0.6, 0.6);
    // production indicator
    if (b.owner === 0 && b.queue.length && b.complete && !b.selected) { const q = b.queue[0]; const k = q.t / q.total; const bw = 34 * z; const py = sy - Math.min((h - b.size * HH - 8) * z, (b.size * TH + 70) * z) - 6 * z; ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(sx - bw / 2, py, bw, 4 * z); ctx.fillStyle = '#d9b857'; ctx.fillRect(sx - bw / 2, py, bw * k, 4 * z); }
  }
  drawUnit(u) {
    const ctx = this.ctx, z = this.cam.zoom;
    const { sx, sy } = this.worldToScreen(u.x, u.y);
    // facing -> screen
    const dsx = u.fx - u.fy, dsy = u.fx + u.fy;
    const view = dsy >= -0.05 ? 'f' : 'b', flip = dsx < 0;
    let anim = u.anim, frame = 0;
    if (u.dead) anim = 'idle';
    else if (anim === 'walk') frame = Math.floor(u.animT * 6) % WALK_FRAMES;
    else if (anim === 'attack') { const k = u.animT / 0.55; frame = k < 1 ? Math.floor(k * ATTACK_FRAMES) : 0; if (k >= 1) anim = 'idle'; }
    else if (anim === 'gather') frame = Math.floor(u.animT * 1.8 * ATTACK_FRAMES) % ATTACK_FRAMES;
    else anim = 'idle';
    const sp = unitSprite(u.def, view, flip, anim, frame);
    const w = sp.width / S, h = sp.height / S;
    const big = sp.width / S / UNIT_W;
    const anchor = h - 6 * big;
    const bob = anim === 'idle' && !u.dead ? Math.sin(this.time * 2 + u.id) * 0.4 * z : 0;
    ctx.save();
    if (u.dead) {
      const k = Math.min(1, u.deathT / 0.35);
      ctx.translate(sx, sy); ctx.rotate((flip ? -1 : 1) * k * 1.35); ctx.globalAlpha = clamp(1 - (u.deathT - 1.2) / 1.8, 0, 1);
      ctx.drawImage(sp, -w / 2 * z, -anchor * z, w * z, h * z);
    } else {
      // carried resource
      ctx.drawImage(sp, sx - w / 2 * z, sy - anchor * z + bob, w * z, h * z);
      if (u.carry && u.carry.amount > 2) this.drawCarry(u, sx, sy, flip, z);
      if (u.def.hero) { ctx.globalCompositeOperation = 'lighter'; const gr = ctx.createRadialGradient(sx, sy - 12 * z, 0, sx, sy - 12 * z, 22 * z); gr.addColorStop(0, 'rgba(255,230,150,0.18)'); gr.addColorStop(1, 'rgba(255,230,150,0)'); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, sy - 12 * z, 22 * z, 0, 7); ctx.fill(); }
    }
    ctx.restore();
  }
  drawCarry(u, sx, sy, flip, z) {
    const ctx = this.ctx; const dir = flip ? -1 : 1; const x = sx - dir * 5 * z, y = sy - 14 * z;
    ctx.save(); ctx.translate(x, y); ctx.scale(z, z);
    switch (u.carry.res) {
      case 'wood': ctx.fillStyle = '#7a5a38'; ctx.strokeStyle = '#2a1a0a'; ctx.lineWidth = 0.6; for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.roundRect(-5, -2 + i * 2.6, 10, 2.4, 1.2); ctx.fill(); ctx.stroke(); } break;
      case 'food': ctx.fillStyle = '#c8b070'; ctx.beginPath(); ctx.ellipse(0, 0, 4, 3, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#d43a4a'; ctx.beginPath(); ctx.arc(-1.5, -1.5, 1.2, 0, 7); ctx.arc(1.5, -1, 1.2, 0, 7); ctx.fill(); break;
      case 'gold': ctx.fillStyle = '#8a7a66'; ctx.beginPath(); ctx.ellipse(0, 0, 4, 3, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#f0c030'; ctx.beginPath(); ctx.arc(-1.5, -1, 1.3, 0, 7); ctx.arc(1.5, -0.5, 1.3, 0, 7); ctx.arc(0, -2.2, 1.1, 0, 7); ctx.fill(); break;
      case 'stone': ctx.fillStyle = '#8d8f8a'; ctx.strokeStyle = '#333'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-4, 2); ctx.lineTo(-3, -3); ctx.lineTo(2, -3.5); ctx.lineTo(4, 1); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
    }
    ctx.restore();
  }
  drawHealth(e) {
    const ctx = this.ctx, z = this.cam.zoom, g = this.game;
    if (e.kind === 'node') return;
    if (e.kind === 'unit') {
      if (e.dead) return;
      const st = g.stats(e); const show = e.selected || (e.hp < st.maxHp && g.time - e.lastHitT < 6);
      if (!show) return;
      const { sx, sy } = this.worldToScreen(e.x, e.y);
      const k = e.def.sprite.kind; const hgt = (k === 'giant' ? 46 : k === 'mounted' ? 30 : k === 'beast' ? 20 : 25) * (e.def.sprite.scale || 1);
      this.bar(sx, sy - hgt * z - 5 * z, 20 * z * (k === 'giant' ? 1.5 : k === 'mounted' ? 1.2 : 1), e.hp / st.maxHp, e.owner);
    } else {
      const show = e.selected || (e.hp < e.maxHp && e.complete && g.time - e.lastHitT < 8) || !e.complete;
      if (!show || !this.game.isExplored(e.x, e.y)) return;
      const { sx, sy } = this.worldToScreen(e.x, e.y);
      const sp = buildingSprite(e.faction, e.role, 1, e.variant); const top = (sp.height / BSCALE - e.size * HH - 8) * z;
      const by = sy - Math.min(top, (e.size * TH + 70) * z) - 6 * z;
      if (!e.complete) this.bar(sx, by, 40 * z, e.progress, e.owner, '#d9b857');
      else this.bar(sx, by, 40 * z, e.hp / e.maxHp, e.owner);
    }
  }
  bar(x, y, w, k, owner, col) {
    const ctx = this.ctx; const h = Math.max(3, 4 * this.cam.zoom);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x - w / 2 - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = col || (k > 0.6 ? '#5fcf4a' : k > 0.3 ? '#e0b030' : '#d84030'); ctx.fillRect(x - w / 2, y, w * clamp(k, 0, 1), h);
  }
  drawProjectile(pr) {
    const ctx = this.ctx, z = this.cam.zoom;
    const { sx, sy } = this.worldToScreen(pr.x, pr.y);
    const y = sy - pr.z * TH * z;
    // direction
    const t = pr.target; const { sx: tx, sy: ty } = this.worldToScreen(t.x, t.y);
    const ang = Math.atan2(ty - pr.z * TH * z * 0.3 - y, tx - sx) + (pr.t / pr.dur < 0.5 ? -0.4 : 0.4);
    ctx.save(); ctx.translate(sx, y); ctx.rotate(ang); ctx.scale(z, z);
    ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(5, 0); ctx.stroke();
    ctx.fillStyle = '#cfd8d8'; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(4, -1.5); ctx.lineTo(4, 1.5); ctx.fill();
    ctx.fillStyle = pr.owner === 0 ? '#9ad66a' : '#e05040'; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(-5, -1.8); ctx.lineTo(-3.5, 0); ctx.lineTo(-5, 1.8); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(sx, sy, 3 * z, 1.5 * z, 0, 0, 7); ctx.fill();
  }
  drawFootprintOutline(tx, ty, s, color) {
    const ctx = this.ctx; const a = this.worldToScreen(tx, ty), b = this.worldToScreen(tx + s, ty), c = this.worldToScreen(tx + s, ty + s), d = this.worldToScreen(tx, ty + s);
    ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.lineTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy); ctx.closePath(); ctx.stroke();
  }
  drawGhostFootprint(gh) {
    const ctx = this.ctx, s = BUILDING_ROLES[gh.role].size, g = this.game;
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const tx = gh.tx + x, ty = gh.ty + y; const ok = g.map.inBounds(tx, ty) && g.canPlace(g.players[0], gh.role, tx, ty) || g.canPlace(g.players[0], gh.role, gh.tx, gh.ty);
      const a = this.worldToScreen(tx, ty), b = this.worldToScreen(tx + 1, ty), c = this.worldToScreen(tx + 1, ty + 1), d = this.worldToScreen(tx, ty + 1);
      ctx.fillStyle = gh.valid ? 'rgba(120,255,140,0.35)' : 'rgba(255,80,60,0.4)'; ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.lineTo(c.sx, c.sy); ctx.lineTo(d.sx, d.sy); ctx.closePath(); ctx.fill(); void ok;
    }
    this.drawFootprintOutline(gh.tx, gh.ty, s, gh.valid ? 'rgba(120,255,140,0.9)' : 'rgba(255,80,60,0.9)');
  }
  drawGhost(gh) {
    const ctx = this.ctx, z = this.cam.zoom, s = BUILDING_ROLES[gh.role].size;
    const sp = buildingSprite(this.game.players[0].faction, gh.role, 1, 0);
    const w = sp.width / BSCALE, h = sp.height / BSCALE;
    const { sx, sy } = this.worldToScreen(gh.tx + s / 2, gh.ty + s / 2);
    ctx.globalAlpha = 0.6; ctx.drawImage(sp, sx - w / 2 * z, sy - (h - s * HH - 8) * z, w * z, h * z); ctx.globalAlpha = 1;
  }
  // ------------------------------------------------------------------
  drawFog() {
    const g = this.game, ctx = this.ctx, n = this.n, z = this.cam.zoom;
    if (g.fogDirty) {
      g.fogDirty = false;
      const fc = this.fogCtx, img = fc.createImageData(n * 2, n * 2), d = img.data;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const f = g.fog[y * n + x]; const a = f === 2 ? 0 : f === 1 ? 120 : 255;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) { const i = ((y * 2 + dy) * n * 2 + x * 2 + dx) * 4; d[i] = 6; d[i + 1] = 10; d[i + 2] = 8; d[i + 3] = a; }
      }
      fc.putImageData(img, 0, 0);
    }
    // draw fog canvas in iso space; smoothing gives soft edges
    const o = this.worldToScreen(0, 0);
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.translate(o.sx, o.sy);
    ctx.transform(HW * z / 2, HH * z / 2, -HW * z / 2, HH * z / 2, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(this.fogCanvas, 0, 0);
    // outside map: darken
    ctx.fillStyle = 'rgba(6,10,8,1)';
    const big = n * 4;
    ctx.fillRect(-big, -big, big * 2 + n * 2, big); ctx.fillRect(-big, n * 2, big * 2 + n * 2, big); ctx.fillRect(-big, -big, big, big * 3); ctx.fillRect(n * 2, -big, big, big * 3);
    ctx.restore();
  }
  // ------------------------------------------------------------------
  //  Particles
  // ------------------------------------------------------------------
  spawn(type, x, y, z = 0.5, n = 1) {
    for (let i = 0; i < n; i++) {
      const p = { type, x, y, z, vx: 0, vy: 0, vz: 0, life: 1, t: 0, size: 2, color: '#fff' };
      switch (type) {
        case 'blood': p.vx = (Math.random() - 0.5) * 1.6; p.vy = (Math.random() - 0.5) * 1.6; p.vz = 1.5 + Math.random() * 2; p.life = 0.5; p.color = '#9a1e1e'; p.size = 1.5 + Math.random() * 1.5; p.z = 0.8; break;
        case 'dust': p.vx = (Math.random() - 0.5) * 1.2; p.vy = (Math.random() - 0.5) * 1.2; p.vz = 0.6 + Math.random(); p.life = 0.8; p.color = 'rgba(200,180,140,0.6)'; p.size = 2 + Math.random() * 3; break;
        case 'leaf': p.vx = (Math.random() - 0.5) * 1.5; p.vy = (Math.random() - 0.5) * 1.5; p.vz = -0.2; p.life = 1.6; p.color = Math.random() < 0.5 ? '#d9b857' : '#8cc060'; p.size = 1.6; p.z = 1.6 + Math.random(); break;
        case 'spark': p.vx = (Math.random() - 0.5) * 3; p.vy = (Math.random() - 0.5) * 3; p.vz = 1 + Math.random() * 2; p.life = 0.35; p.color = '#ffd060'; p.size = 1.2; p.z = 1; break;
        case 'smoke': p.vx = 0.15; p.vy = -0.15; p.vz = 0.7 + Math.random() * 0.4; p.life = 2.2; p.color = 'rgba(60,55,50,0.5)'; p.size = 4 + Math.random() * 4; break;
        case 'fire': p.vx = 0; p.vy = 0; p.vz = 1.2; p.life = 0.6; p.color = Math.random() < 0.5 ? '#ff9030' : '#ffd060'; p.size = 2.5 + Math.random() * 2; break;
        case 'collapse': p.vx = (Math.random() - 0.5) * 3; p.vy = (Math.random() - 0.5) * 3; p.vz = 0.5 + Math.random() * 1.5; p.life = 1.6; p.color = 'rgba(120,100,80,0.7)'; p.size = 4 + Math.random() * 6; break;
        case 'mote': p.vx = (Math.random() - 0.5) * 0.2; p.vy = (Math.random() - 0.5) * 0.2; p.vz = 0.15; p.life = 4; p.color = '#fff6c8'; p.size = 1; p.z = 0.5 + Math.random() * 1.5; break;
        case 'ember': p.vx = (Math.random() - 0.5) * 0.3; p.vy = (Math.random() - 0.5) * 0.3; p.vz = 0.5 + Math.random() * 0.3; p.life = 2.5; p.color = '#ff7a30'; p.size = 1.2; p.z = 0.3; break;
        case 'fall': p.vx = (Math.random() - 0.5) * 0.6; p.vy = (Math.random() - 0.5) * 0.6; p.vz = -0.35; p.life = 3; p.color = Math.random() < 0.6 ? '#d9b857' : '#f0d98a'; p.size = 1.6; p.z = 2.4; break;
      }
      this.particles.push(p);
      if (this.particles.length > 500) this.particles.shift();
    }
  }
  updateParticles(dt) {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i]; p.t += dt;
      if (p.t >= p.life) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.type === 'blood' || p.type === 'spark' || p.type === 'collapse') { p.vz -= 6 * dt; if (p.z < 0) { p.z = 0; p.vz = 0; p.vx *= 0.5; p.vy *= 0.5; } }
      if (p.type === 'leaf' || p.type === 'fall') { p.x += Math.sin(p.t * 5 + p.size) * dt * 0.6; if (p.z < 0) p.t = p.life; }
      if (p.type === 'smoke') { p.size += dt * 3; }
    }
  }
  drawParticles() {
    const ctx = this.ctx, z = this.cam.zoom, v = this.view;
    for (const p of this.particles) {
      if (p.x < v.minX || p.x > v.maxX || p.y < v.minY || p.y > v.maxY) continue;
      const { sx, sy } = this.worldToScreen(p.x, p.y); const k = 1 - p.t / p.life;
      ctx.globalAlpha = p.type === 'smoke' || p.type === 'collapse' ? k * 0.6 : (p.type === 'mote' || p.type === 'ember' ? Math.sin(k * Math.PI) : k);
      ctx.fillStyle = p.color;
      if (p.type === 'mote' || p.type === 'ember') { ctx.shadowColor = p.color; ctx.shadowBlur = 6; }
      ctx.beginPath(); ctx.arc(sx, sy - p.z * TH * z, p.size * z * (p.type === 'fire' ? k : 1), 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }
  ambient(dt) {
    this.ambientT -= dt;
    if (this.ambientT > 0) return;
    this.ambientT = 0.12;
    const v = this.view, g = this.game, m = this.map;
    // a few random visible tiles: motes near mallorn glades, embers in blight, falling leaves from trees
    for (let i = 0; i < 2; i++) {
      const x = lerp(Math.max(0, v.minX), Math.min(this.n - 1, v.maxX), Math.random()), y = lerp(Math.max(0, v.minY), Math.min(this.n - 1, v.maxY - 3), Math.random());
      if (!m.inBounds(x | 0, y | 0) || !g.isVisible(x, y)) continue;
      const b = m.biome[m.idx(x | 0, y | 0)], t = m.terrain[m.idx(x | 0, y | 0)];
      if (t === T.FOREST && b < 0.33 && Math.random() < 0.6) this.spawn('fall', x, y);
      else if (b < 0.3 && Math.random() < 0.4) this.spawn('mote', x, y);
      else if (b > 0.7 && Math.random() < 0.35) this.spawn('ember', x, y);
    }
  }
  handleFx(e) {
    switch (e.fx) {
      case 'blood': this.spawn('blood', e.x, e.y, 0.8, 5); break;
      case 'dust': this.spawn('dust', e.x, e.y, 0.3, 3); break;
      case 'leaf': this.spawn('leaf', e.x, e.y, 1.8, 3); break;
      case 'spark': this.spawn('spark', e.x, e.y, 1, 4); break;
      case 'death': this.spawn('dust', e.x, e.y, 0.2, 4); break;
      case 'collapse': this.spawn('collapse', e.x, e.y, 0.5, 14 + e.size * 4); break;
    }
  }
  // ------------------------------------------------------------------
  //  Minimap
  // ------------------------------------------------------------------
  drawMinimap(mm, dt) {
    const g = this.game, n = this.n, ctx = mm.getContext('2d'), W = mm.width, H = mm.height;
    this.minimapT -= dt; if (this.minimapT > 0) return; this.minimapT = 0.25;
    if (!this.minimapBase) {
      const c = makeCanvas(n, n); const x = c.getContext('2d'); const img = x.createImageData(n, n); const d = img.data; const m = this.map;
      for (let y = 0; y < n; y++) for (let xx = 0; xx < n; xx++) {
        const i = m.idx(xx, y), t = m.terrain[i], b = m.biome[i]; let col;
        if (t === T.WATER) col = [40, 90, 140]; else if (t === T.SHALLOW) col = [90, 140, 170]; else if (t === T.ROCK) col = [110, 110, 105]; else if (t === T.DIRT) col = [130, 105, 70]; else if (t === T.FOREST) col = b < 0.5 ? [70, 110, 50] : [55, 60, 45]; else col = b < 0.5 ? [95, 150, 70] : [90, 95, 60];
        const o = i * 4; d[o] = col[0]; d[o + 1] = col[1]; d[o + 2] = col[2]; d[o + 3] = 255;
      }
      x.putImageData(img, 0, 0); this.minimapBase = c;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#05080a'; ctx.fillRect(0, 0, W, H);
    // iso transform: map diamond fits W x H
    const sx = W / (2 * n), sy = H / (2 * n);
    ctx.setTransform(sx, sy, -sx, sy, W / 2, 0);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(this.minimapBase, 0, 0);
    // resources
    for (const nd of g.nodes) { if (nd.dead || nd.nodeKind === 'tree' || nd.nodeKind === 'carcass' || !g.isExplored(nd.x, nd.y)) continue; ctx.fillStyle = nd.nodeKind === 'gold' ? '#ffd040' : nd.nodeKind === 'stone' ? '#c8c8c8' : '#e04070'; ctx.fillRect(nd.tx, nd.ty, 1, 1); }
    // buildings
    for (const b of g.buildings) { if (b.dead || !this.buildingSeen(b)) continue; ctx.fillStyle = FACTIONS[b.faction].minimap; ctx.fillRect(b.tx, b.ty, b.size, b.size); }
    // units
    for (const u of g.units) { if (u.dead || u.owner === -1) continue; if (u.owner !== 0 && !g.isVisible(u.x, u.y)) continue; ctx.fillStyle = FACTIONS[g.players[u.owner].faction].minimap; ctx.fillRect(u.x - 0.6, u.y - 0.6, 1.3, 1.3); }
    // fog
    ctx.save(); ctx.scale(0.5, 0.5); ctx.imageSmoothingEnabled = true; ctx.drawImage(this.fogCanvas, 0, 0); ctx.restore();
    // pings
    for (const f of this.flashes) { f.t += 0.25; const k = f.t / 2.5; ctx.strokeStyle = `rgba(255,60,40,${1 - k})`; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(f.x, f.y, 2 + k * 6, 0, 7); ctx.stroke(); }
    this.flashes = this.flashes.filter(f => f.t < 2.5);
    // camera viewport
    const c0 = this.screenToWorld(0, 0), c1 = this.screenToWorld(this.W, 0), c2 = this.screenToWorld(this.W, this.H), c3 = this.screenToWorld(0, this.H);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(c0.x, c0.y); ctx.lineTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.lineTo(c3.x, c3.y); ctx.closePath(); ctx.stroke();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  minimapToWorld(mm, px, py) {
    const n = this.n, W = mm.clientWidth, H = mm.clientHeight; const sx = W / (2 * n), sy = H / (2 * n);
    // invert: X = sx*x - sx*y + W/2 ; Y = sy*x + sy*y
    const a = (px - W / 2) / sx, b = py / sy; return { x: (a + b) / 2, y: (b - a) / 2 };
  }
  ping(x, y) { this.flashes.push({ x, y, t: 0 }); }
}
function dt60(p) { return p / 60 * 4; }
