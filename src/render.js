// =====================================================================
//  Renderer: isometric terrain chunks, entities, fog, particles, minimap
// =====================================================================
import { TW, TH, HW, HH, clamp, lerp, makeCanvas, RNG, Noise, shade, rgba, mixHex, dist } from './util.js';
import { T } from './map.js';
import { unitSprite, treeSprite, treeStyle, nodeSprite, buildingSprite, rubbleSprite, S, BSCALE, UNIT_W, UNIT_H, UNIT_ANCHOR_Y, TREE_W, TREE_H, TREE_ANCHOR_Y, NODE_W, NODE_H, NODE_ANCHOR_Y, WALK_FRAMES, ATTACK_FRAMES } from './sprites.js';
import { FACTIONS, BUILDING_ROLES } from './data.js';
import { LIGHTS } from './lights.js';

const CH = 8;                                  // chunk size in tiles
const COL = {
  grassElf: ['#6aa84c', '#78b857', '#8fc462', '#5a9644'],
  grassMid: ['#659a4a', '#70a44e', '#7cab52', '#588a40'],
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
    // rolling-hill lighting from a smooth height field (light from the top-left)
    const h = (xx, yy) => this.noise.fbm(xx / 7 + 31, yy / 7 + 17, 2);
    const slope = (h(x - 1, y - 1) - h(x + 1, y + 1)) * 0.9;
    return shade(base, (nz - 0.5) * 0.18 + slope * 0.22 + ((v % 7) - 3) * 0.004);
  }
  grassLike(x, y) { const m = this.map, b = m.biome[m.idx(x, y)]; return b < 0.5 ? mixHex('#5f9a45', '#5c8f44', b * 2) : mixHex('#5c8f44', '#6a6e42', (b - 0.5) * 2); }
  tinted(src, color) { const c = makeCanvas(src.width, src.height); const x = c.getContext('2d'); x.drawImage(src, 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height); return c; }
  getChunk(cx, cy) {
    const scale = this.cam.zoom > 1.35 ? 2 : 1;
    const key = cx + ',' + cy + ',' + scale;
    let c = this.chunks.get(key);
    if (!c) { c = this.renderChunk(cx, cy, scale); this.chunks.set(key, c); }
    return c;
  }
  invalidateChunkAt(tx, ty) { for (const k of [...this.chunks.keys()]) { const [cx, cy] = k.split(',').map(Number); if (Math.abs(cx - ((tx / CH) | 0)) <= 1 && Math.abs(cy - ((ty / CH) | 0)) <= 1) this.chunks.delete(k); } this.minimapBase = null; }
  // tileable luminance texture used as an overlay on all ground
  groundTexture() {
    if (this._gtex) return this._gtex;
    const c = makeCanvas(256, 256), x = c.getContext('2d'), rng = new RNG(77);
    x.fillStyle = 'rgb(128,128,128)'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) { const px = rng.next() * 256, py = rng.next() * 256; const l = 96 + rng.next() * 64; x.fillStyle = `rgba(${l},${l},${l},0.5)`; x.beginPath(); x.ellipse(px, py, 1 + rng.next() * 2.5, 0.6 + rng.next() * 1.2, rng.next() * 3, 0, 7); x.fill(); }
    for (let i = 0; i < 700; i++) { const px = rng.next() * 256, py = rng.next() * 256; const l = 110 + rng.next() * 60; x.strokeStyle = `rgba(${l},${l},${l},0.45)`; x.lineWidth = 1; x.beginPath(); x.moveTo(px, py); x.lineTo(px + rng.range(-2, 2), py - rng.range(2, 5)); x.stroke(); }
    // make it seamless by mirroring edges softly
    x.globalAlpha = 0.5; x.drawImage(c, -256, 0); x.drawImage(c, 256, 0); x.drawImage(c, 0, -256); x.drawImage(c, 0, 256); x.globalAlpha = 1;
    this._gtex = c; return c;
  }
  renderChunk(cx, cy, scale) {
    const x0 = cx * CH, y0 = cy * CH;
    const w = 2 * CH * HW, h = 2 * CH * HH + 40;
    const cv = makeCanvas(w * scale, h * scale); const ctx = cv.getContext('2d');
    ctx.scale(scale, scale);
    const ox = w / 2, oy = 30;
    const P = (x, y) => [ox + (x - x0 - (y - y0)) * HW, oy + (x - x0 + y - y0) * HH];
    const m = this.map, rng = new RNG(cx * 1000 + cy + this.game.seed), g = this.game;
    const waterPath = new Path2D(); let hasWater = false;
    const diamond = (ctxOrPath, x, y, grow = 0) => { const [ax, ay] = P(x, y); ctxOrPath.moveTo(ax, ay - grow); ctxOrPath.lineTo(ax + HW + grow, ay + HH); ctxOrPath.lineTo(ax, ay + TH + grow); ctxOrPath.lineTo(ax - HW - grow, ay + HH); ctxOrPath.closePath(); };
    const landLike = (t) => t === T.GRASS || t === T.FOREST || t === T.ROCK || t === T.DIRT;
    // ---- pass 1: smooth colour field (tiles drawn with overlap, then blurred) ----
    const base = makeCanvas(w, h); const bctx = base.getContext('2d');
    for (let y = y0 - 1; y < y0 + CH + 1; y++) for (let x = x0 - 1; x < x0 + CH + 1; x++) {
      if (!m.inBounds(x, y)) continue;
      const t = m.terrain[m.idx(x, y)];
      bctx.beginPath(); diamond(bctx, x, y, 1.5);
      bctx.fillStyle = this.tileColor(x, y);
      if (t === T.ROCK) bctx.fillStyle = shade(this.grassLike(x, y), -0.1);
      if (t === T.WATER || t === T.SHALLOW) bctx.fillStyle = mixHex(this.grassLike(x, y), '#c9b98a', 0.55);
      bctx.fill();
    }
    ctx.save(); ctx.filter = 'blur(3px)'; ctx.drawImage(base, 0, 0); ctx.restore();
    ctx.drawImage(base, 0, 0); ctx.save(); ctx.globalAlpha = 0.55; ctx.filter = 'blur(6px)'; ctx.drawImage(base, 0, 0); ctx.restore();
    // ---- pass 2: dirt / forest-floor overlays ----
    const ov = makeCanvas(w, h); const octx = ov.getContext('2d'); let anyOv = false;
    for (let y = y0 - 1; y < y0 + CH + 1; y++) for (let x = x0 - 1; x < x0 + CH + 1; x++) {
      if (!m.inBounds(x, y)) continue;
      const t = m.terrain[m.idx(x, y)];
      if (t === T.DIRT || t === T.FOREST) { anyOv = true; octx.beginPath(); diamond(octx, x, y, 2.5); octx.fillStyle = this.tileColor(x, y); octx.fill(); }
    }
    if (anyOv) { ctx.save(); ctx.filter = 'blur(6px)'; ctx.drawImage(ov, 0, 0); ctx.restore(); }
    // ---- pass 3: texture overlay (clipped to this chunk's tiles, pattern anchored in world space) ----
    const landPath = new Path2D();
    for (let y = y0; y < y0 + CH; y++) for (let x = x0; x < x0 + CH; x++) if (m.inBounds(x, y)) diamond(landPath, x, y, 0.5);
    ctx.save(); ctx.clip(landPath); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = 0.5; ctx.fillStyle = ctx.createPattern(this.groundTexture(), 'repeat');
    ctx.translate(ox - (x0 - y0) * HW, oy - (x0 + y0) * HH); ctx.fillRect(-(ox - (x0 - y0) * HW) - 10, -(oy - (x0 + y0) * HH) - 10, w + 20, h + 20); ctx.restore();
    // ---- pass 4: water ----
    const wv = makeCanvas(w, h); const wctx = wv.getContext('2d');
    for (let y = y0 - 1; y < y0 + CH + 1; y++) for (let x = x0 - 1; x < x0 + CH + 1; x++) {
      if (!m.inBounds(x, y)) continue;
      const t = m.terrain[m.idx(x, y)];
      if (t === T.WATER || t === T.SHALLOW) { hasWater = true; wctx.beginPath(); diamond(wctx, x, y, 1.5); wctx.fillStyle = this.tileColor(x, y); wctx.fill(); if (x >= x0 && y >= y0 && x < x0 + CH && y < y0 + CH) diamond(waterPath, x, y, 1); }
    }
    if (hasWater) {
      for (let y = y0 - 1; y < y0 + CH + 1; y++) for (let x = x0 - 1; x < x0 + CH + 1; x++) {
        if (!m.inBounds(x, y) || m.terrain[m.idx(x, y)] !== T.WATER) continue;
        let deep = true; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) if (m.terrainAt(x + dx, y + dy) !== T.WATER) deep = false;
        if (deep) { wctx.beginPath(); diamond(wctx, x, y, 0); wctx.fillStyle = COL.waterDeep; wctx.fill(); }
      }
      ctx.save(); ctx.filter = 'blur(7px)'; ctx.globalAlpha = 0.8; ctx.drawImage(this.tinted(wv, '#cdbd8e'), 0, 0); ctx.restore();
      // wet sand ring
      ctx.save(); ctx.filter = 'blur(3px)'; ctx.globalAlpha = 0.5; ctx.drawImage(this.tinted(wv, '#8a7a58'), 0, 0); ctx.restore();
      ctx.save(); ctx.filter = 'blur(5px)'; ctx.drawImage(wv, 0, 0); ctx.restore();
      ctx.save(); ctx.filter = 'blur(2px)'; ctx.globalAlpha = 0.8; ctx.drawImage(wv, 0, 0); ctx.restore();
      ctx.save(); ctx.filter = 'blur(1px)'; ctx.strokeStyle = 'rgba(230,245,255,0.4)'; ctx.lineWidth = 1.5;
      const land = (tt) => tt !== T.WATER && tt !== T.SHALLOW;
      for (let y = y0; y < y0 + CH; y++) for (let x = x0; x < x0 + CH; x++) {
        if (!m.inBounds(x, y)) continue; const t = m.terrain[m.idx(x, y)]; if (t !== T.WATER && t !== T.SHALLOW) continue;
        const [ax, ay] = P(x, y);
        if (land(m.terrainAt(x, y - 1))) { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + HW, ay + HH); ctx.stroke(); }
        if (land(m.terrainAt(x - 1, y))) { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax - HW, ay + HH); ctx.stroke(); }
        if (land(m.terrainAt(x + 1, y))) { ctx.beginPath(); ctx.moveTo(ax + HW, ay + HH); ctx.lineTo(ax, ay + TH); ctx.stroke(); }
        if (land(m.terrainAt(x, y + 1))) { ctx.beginPath(); ctx.moveTo(ax - HW, ay + HH); ctx.lineTo(ax, ay + TH); ctx.stroke(); }
      }
      ctx.restore();
      // lily pads / reeds on shallow tiles
      for (let y = y0; y < y0 + CH; y++) for (let x = x0; x < x0 + CH; x++) {
        if (!m.inBounds(x, y) || m.terrain[m.idx(x, y)] !== T.SHALLOW) continue;
        const b = m.biome[m.idx(x, y)]; const [ax, ay] = P(x, y);
        let shore = false; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (land(m.terrainAt(x + dx, y + dy))) shore = true;
        if (shore && rng.next() < 0.7) { for (let k = 0; k < 4; k++) { const px = ax + (rng.next() - 0.5) * HW * 1.2, py = ay + HH + (rng.next() - 0.5) * HH; line(ctx, px, py, px + rng.range(-1, 1), py - 7 - rng.next() * 6, b < 0.6 ? '#4f7a3a' : '#5a5a3a', 1.1); if (rng.next() < 0.5) { ctx.fillStyle = '#6b4a2a'; ctx.beginPath(); ctx.ellipse(px + 0.3, py - 10, 0.9, 2.2, 0, 0, 7); ctx.fill(); } } }
        if (b < 0.45 && rng.next() < 0.5) { for (let k = 0; k < 2; k++) { const px = ax + (rng.next() - 0.5) * HW, py = ay + HH + (rng.next() - 0.5) * HH; ctx.fillStyle = '#4f8f45'; ctx.beginPath(); ctx.ellipse(px, py, 3.2, 1.8, 0, 0.5, 6.2); ctx.lineTo(px, py); ctx.fill(); if (rng.next() < 0.4) { ctx.fillStyle = '#f0d0e8'; ctx.beginPath(); ctx.arc(px + 1, py - 1, 1, 0, 7); ctx.fill(); } } }
      }
    }
    // ---- pass 5: ambient occlusion under forests ----
    const ao = makeCanvas(w, h); const actx = ao.getContext('2d'); let anyAo = false;
    for (let y = y0 - 2; y < y0 + CH + 2; y++) for (let x = x0 - 2; x < x0 + CH + 2; x++) {
      if (!m.inBounds(x, y) || m.terrain[m.idx(x, y)] !== T.FOREST) continue;
      const e = g.entityAtTile(x, y); if (!e || e.kind !== 'node' || e.nodeKind !== 'tree') continue;
      anyAo = true; const [ax, ay] = P(x, y); actx.fillStyle = 'rgba(10,20,5,0.45)'; actx.beginPath(); actx.ellipse(ax, ay + HH + 2, HW * 0.7, HH * 0.7, 0, 0, 7); actx.fill();
    }
    if (anyAo) { ctx.save(); ctx.filter = 'blur(6px)'; ctx.drawImage(ao, 0, 0); ctx.restore(); }
    // ---- pass 6: ground props ----
    for (let y = y0; y < y0 + CH; y++) for (let x = x0; x < x0 + CH; x++) {
      if (!m.inBounds(x, y)) continue;
      const i = m.idx(x, y), t = m.terrain[i], b = m.biome[i];
      const [ax, ay] = P(x, y); const cxp = ax, cyp = ay + HH;
      const rp = () => [cxp + (rng.next() - 0.5) * HW * 1.5, cyp + (rng.next() - 0.5) * HH * 1.5];
      if (t === T.GRASS) {
        const n = 3 + (m.variant[i] % 4);
        for (let k = 0; k < n; k++) {
          const [px, py] = rp();
          if (b < 0.45) {
            tuft(ctx, px, py, rng, '#a8dc74', '#3f7a2e', 4.5);
            if (rng.next() < 0.22) flower(ctx, px + 2, py - 1, rng, ['#f6e58d', '#e8a0c8', '#cfe8ff', '#ffffff', '#f0b060'][rng.int(0, 4)]);
          } else if (b < 0.65) {
            tuft(ctx, px, py, rng, '#8ab860', '#3f6a2e', 4);
            if (rng.next() < 0.08) flower(ctx, px + 2, py - 1, rng, '#f0d060');
          } else {
            if (rng.next() < 0.5) tuft(ctx, px, py, rng, '#8a8a5a', '#4a4a30', 3.5);
            if (rng.next() < 0.3) { ctx.fillStyle = rgba('#2a2620', 0.28); ctx.beginPath(); ctx.ellipse(px, py, 1.2 + rng.next() * 1.4, 0.8 + rng.next() * 0.8, 0, 0, 7); ctx.fill(); }
            if (rng.next() < 0.3) { ctx.strokeStyle = rgba('#1a1612', 0.5); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 4 - rng.next() * 8, py + 2 - rng.next() * 4); ctx.lineTo(px + 6 - rng.next() * 12, py + 3 - rng.next() * 6); ctx.stroke(); }
          }
        }
        // rarer set pieces
        const r = rng.next();
        if (b < 0.4 && r < 0.018) mushroomRing(ctx, cxp, cyp, rng);
        else if (b < 0.4 && r < 0.07) { ctx.fillStyle = rgba('#2f6a2a', 0.35); ctx.beginPath(); ctx.ellipse(cxp + rng.range(-8, 8), cyp + rng.range(-4, 4), 10, 5, 0, 0, 7); ctx.fill(); for (let k = 0; k < 5; k++) { const [px, py] = rp(); clover(ctx, px, py); } }
        else if (b < 0.6 && r < 0.14) pebbles(ctx, cxp, cyp, rng, '#a8a89a');
        else if (b >= 0.6 && r < 0.07) bones(ctx, cxp, cyp, rng);
        else if (b >= 0.6 && r < 0.11) { ctx.fillStyle = rgba('#1a1a16', 0.55); ctx.beginPath(); ctx.ellipse(cxp + rng.range(-6, 6), cyp + rng.range(-3, 3), 9, 4, 0, 0, 7); ctx.fill(); ctx.fillStyle = rgba('#6a6a60', 0.35); ctx.beginPath(); ctx.ellipse(cxp - 2, cyp - 1, 5, 2, 0, 0, 7); ctx.fill(); }
        else if (b >= 0.6 && r < 0.15) { ctx.fillStyle = '#ff6a20'; ctx.shadowColor = '#ff8a30'; ctx.shadowBlur = 5; for (let k = 0; k < 3; k++) { const [px, py] = rp(); ctx.beginPath(); ctx.arc(px, py, 0.9, 0, 7); ctx.fill(); } ctx.shadowBlur = 0; }
        else if (r < 0.17) pebbles(ctx, cxp, cyp, rng, b < 0.5 ? '#b8b0a0' : '#6a645a');
      } else if (t === T.FOREST) {
        // leaf litter + ferns / roots
        for (let k = 0; k < 5; k++) { const [px, py] = rp(); ctx.fillStyle = b < 0.35 ? rgba(['#d9b857', '#e8c86a', '#b88a3a'][k % 3], 0.6) : b < 0.62 ? rgba(['#8a6a30', '#6a7a30', '#a08040'][k % 3], 0.55) : rgba('#2a2420', 0.6); ctx.beginPath(); ctx.ellipse(px, py, 2, 1, rng.next() * 3, 0, 7); ctx.fill(); }
        if (b < 0.62 && rng.next() < 0.35) fern(ctx, cxp + rng.range(-14, 14), cyp + rng.range(-6, 6), rng, b < 0.35 ? '#7fbf55' : '#4f8a3a');
        if (b >= 0.62 && rng.next() < 0.2) { ctx.strokeStyle = 'rgba(220,220,230,0.35)'; ctx.lineWidth = 0.6; const [px, py] = rp(); for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + rng.range(-8, 8), py + rng.range(-6, 6)); ctx.stroke(); } }
      } else if (t === T.DIRT) {
        for (let k = 0; k < 4; k++) { const [px, py] = rp(); ctx.fillStyle = rgba(rng.next() < 0.5 ? '#5a4a30' : '#b0a080', 0.5); ctx.beginPath(); ctx.ellipse(px, py, 1.6, 1, 0, 0, 7); ctx.fill(); }
        if (rng.next() < 0.3) { ctx.strokeStyle = 'rgba(60,45,25,0.35)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(cxp - 14, cyp + 4); ctx.quadraticCurveTo(cxp, cyp - 2, cxp + 16, cyp - 6); ctx.stroke(); }
        if (rng.next() < 0.25) tuft(ctx, cxp + rng.range(-12, 12), cyp + rng.range(-5, 5), rng, '#9aa860', '#5a6a30', 3.5);
      } else if (t === T.ROCK) this.drawRock(ctx, cxp, cyp, b, rng);
    }
    cv.waterPath = waterPath; cv.hasWater = hasWater; cv.scale = scale; cv.ox = ox; cv.oy = oy;
    return cv;
  }
  drawRock(ctx, cx, cy, b, rng) {
    const cols = b < 0.55 ? COL.rock : COL.rockBlight;
    const n = 2 + rng.int(0, 2);
    // ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(cx + 3, cy + 5, 20, 8, 0, 0, 7); ctx.fill();
    for (let k = 0; k < n; k++) {
      const px = cx + (rng.next() - 0.5) * HW * 0.9, py = cy + (rng.next() - 0.5) * HH * 0.8, w = 9 + rng.next() * 10, h = 10 + rng.next() * 14;
      const g = ctx.createLinearGradient(px - w, py - h, px + w, py); g.addColorStop(0, shade(cols[1], 0.35)); g.addColorStop(0.5, cols[0]); g.addColorStop(1, shade(cols[2], -0.35));
      ctx.beginPath(); ctx.moveTo(px - w, py + 3); ctx.lineTo(px - w * 0.7, py - h * 0.6); ctx.lineTo(px - w * 0.1, py - h); ctx.lineTo(px + w * 0.6, py - h * 0.8); ctx.lineTo(px + w, py); ctx.lineTo(px + w * 0.5, py + 5); ctx.closePath();
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(20,20,20,0.6)'; ctx.lineWidth = 0.8; ctx.stroke();
      // facet lines & highlight
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(px - w * 0.1, py - h); ctx.lineTo(px + w * 0.1, py + 3); ctx.moveTo(px + w * 0.6, py - h * 0.8); ctx.lineTo(px + w * 0.3, py + 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.moveTo(px - w * 0.6, py - h * 0.55); ctx.lineTo(px - w * 0.1, py - h * 0.9); ctx.stroke();
      // moss on the lit side (elven half) / lichen
      if (b < 0.6 && rng.next() < 0.7) { ctx.fillStyle = rgba('#7fbf55', 0.55); ctx.beginPath(); ctx.ellipse(px - w * 0.4, py - h * 0.5, w * 0.3, h * 0.18, -0.4, 0, 7); ctx.fill(); }
      else if (rng.next() < 0.5) { ctx.fillStyle = rgba('#b0a070', 0.35); ctx.beginPath(); ctx.arc(px + w * 0.2, py - h * 0.4, 2, 0, 7); ctx.fill(); }
    }
    if (b < 0.6 && rng.next() < 0.6) tuft(ctx, cx + 10, cy + 4, rng, '#8ab860', '#3f6a2e', 4);
  }
  makeWaterPattern() {
    const c = makeCanvas(128, 64); const x = c.getContext('2d');
    const rng = new RNG(5);
    for (let i = 0; i < 26; i++) { const px = rng.next() * 128, py = rng.next() * 64, len = 8 + rng.next() * 18; x.strokeStyle = rgba('#dff3ff', 0.18 + rng.next() * 0.2); x.lineWidth = 1 + rng.next(); x.lineCap = 'round'; x.beginPath(); x.moveTo(px, py); x.lineTo(px + len, py + len * 0.1); x.stroke(); }
    return c;
  }
  cloudPattern() {
    if (this._cloud) return this._cloud;
    const c = makeCanvas(512, 512), x = c.getContext('2d'), rng = new RNG(3);
    x.fillStyle = '#fff'; x.fillRect(0, 0, 512, 512);
    x.filter = 'blur(28px)';
    for (let i = 0; i < 9; i++) { x.fillStyle = 'rgba(0,0,0,0.75)'; const px = rng.next() * 512, py = rng.next() * 512, r = 60 + rng.next() * 80; for (const [dx, dy] of [[0, 0], [512, 0], [-512, 0], [0, 512], [0, -512]]) { x.beginPath(); x.ellipse(px + dx, py + dy, r * 1.4, r, rng.next(), 0, 7); x.fill(); } }
    x.filter = 'none';
    this._cloud = c; return c;
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
    const waterChunks = []; const drawn = new Set();
    for (let cy = chunkMinY; cy <= chunkMaxY; cy++) for (let cx = chunkMinX; cx <= chunkMaxX; cx++) {
      const ch = this.getChunk(cx, cy); drawn.add(cx + ',' + cy + ',' + ch.scale);
      const { sx, sy } = this.worldToScreen(cx * CH, cy * CH);
      const dw = ch.width / ch.scale * z, dh = ch.height / ch.scale * z;
      ctx.drawImage(ch, sx - ch.ox * z, sy - ch.oy * z, dw, dh);
      if (ch.hasWater) waterChunks.push({ ch, sx, sy });
    }
    // prefetch one neighbouring chunk per frame; evict old chunks to bound memory
    if (!this.prefetchT || this.time - this.prefetchT > 0.05) {
      this.prefetchT = this.time; const scale = this.cam.zoom > 1.35 ? 2 : 1; const maxC = Math.ceil(this.n / CH) - 1;
      outer: for (let r = 1; r <= 1; r++) for (let cy = chunkMinY - r; cy <= chunkMaxY + r; cy++) for (let cx = chunkMinX - r; cx <= chunkMaxX + r; cx++) {
        if (cx < 0 || cy < 0 || cx > maxC || cy > maxC) continue; if (!this.chunks.has(cx + ',' + cy + ',' + scale)) { this.getChunk(cx, cy); break outer; }
      }
    }
    if (this.chunks.size > 90) { for (const k of this.chunks.keys()) { if (this.chunks.size <= 70) break; if (!drawn.has(k)) this.chunks.delete(k); } }
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
    // ---- ground decals (blood, arrows) ----
    this.drawGroundDecals(dt);
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
        if (e.selected) {
          const col = e.owner === 0 ? '120,255,140' : '255,90,70'; const rx = (e.radius + 0.28) * HW * z, ry = (e.radius + 0.28) * HH * z;
          ctx.fillStyle = `rgba(${col},0.12)`; ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, 7); ctx.fill();
          ctx.strokeStyle = `rgba(${col},0.95)`; ctx.lineWidth = 1.6; ctx.setLineDash([6 * z, 4 * z]); ctx.lineDashOffset = -this.time * 20 * z; ctx.beginPath(); ctx.ellipse(sx, sy, rx, ry, 0, 0, 7); ctx.stroke(); ctx.setLineDash([]);
          ctx.strokeStyle = `rgba(${col},0.45)`; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(sx, sy, rx * 0.7, ry * 0.7, 0, 0, 7); ctx.stroke();
        }
        const sg = ctx.createRadialGradient(sx, sy + 1, 0, sx, sy + 1, (e.radius + 0.25) * HW * z); sg.addColorStop(0, 'rgba(0,0,0,0.38)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(sx, sy + 1, (e.radius + 0.25) * HW * z * (e.def.sprite.kind === 'giant' ? 1.3 : 1), (e.radius + 0.25) * HH * z, 0, 0, 7); ctx.fill();
      } else if (e.kind === 'building') {
        if (e.selected) this.drawFootprintOutline(e.tx, e.ty, e.size, e.owner === 0 ? 'rgba(120,255,140,0.9)' : 'rgba(255,90,70,0.9)');
        // soft contact shadow
        const { sx, sy } = this.worldToScreen(e.x, e.y); const sg = ctx.createRadialGradient(sx + 4 * z, sy + 2 * z, 0, sx + 4 * z, sy + 2 * z, e.size * HW * z * 0.75); sg.addColorStop(0, 'rgba(0,0,0,0.35)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(sx + 4 * z, sy + 2 * z, e.size * HW * z * 0.75, e.size * HH * z * 0.75, 0, 0, 7); ctx.fill();
      }
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
    // ---- atmosphere: cloud shadows, time of day, lights ----
    this.drawAtmosphere(dt);
    // ---- fog ----
    this.drawFog();
    // vignette
    const vg = ctx.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.45, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.8); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.26)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, this.W, this.H);
    // ---- health bars (above fog so they stay readable) ----
    for (const { e } of list) this.drawHealth(e);
    // ---- drag box ----
    if (ui.dragBox) { const b = ui.dragBox; ctx.strokeStyle = 'rgba(120,255,140,0.9)'; ctx.fillStyle = 'rgba(120,255,140,0.12)'; ctx.lineWidth = 1.5; const x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1); ctx.fillRect(x, y, Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0)); ctx.strokeRect(x, y, Math.abs(b.x1 - b.x0), Math.abs(b.y1 - b.y0)); }
    // ambient particles
    this.ambient(dt);
  }
  // time of day in [0,1): 0 dawn, 0.25 noon, 0.5 dusk, 0.75 midnight (cycle = 9 minutes, starts mid-morning)
  dayPhase() { return ((this.game.time / 540) + 0.15) % 1; }
  daylight() { const p = this.dayPhase(); return clamp(0.5 - 0.5 * Math.cos(p * Math.PI * 2) * -1, 0, 1); }   // 1 at noon, 0 at midnight
  drawAtmosphere(dt) {
    const ctx = this.ctx, z = this.cam.zoom;
    // drifting cloud shadows
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 0.11;
    const pat = ctx.createPattern(this.cloudPattern(), 'repeat'); ctx.fillStyle = pat;
    const o = this.worldToScreen(0, 0); ctx.translate(o.sx + this.time * 6 * z, o.sy + this.time * 2.5 * z); ctx.scale(z * 1.6, z * 1.6); ctx.fillRect(-4000, -4000, 8000, 8000);
    ctx.restore();
    // time of day tint
    const p = this.dayPhase(); const night = 0.5 - 0.5 * Math.cos(p * Math.PI * 2);            // 0 noon .. 1 midnight (p=0 is dawn? shift below)
    const d = Math.max(0, Math.cos((p - 0.25) * Math.PI * 2));                                   // 1 at noon
    const n = Math.max(0, -Math.cos((p - 0.25) * Math.PI * 2));                                  // 1 at midnight
    const warm = Math.max(0, 1 - Math.abs(p - 0.5) * 6) + Math.max(0, 1 - Math.abs(p - 0.0) * 6) * 0.7;   // dusk / dawn glow
    const r = 1 - n * 0.42 + warm * 0.05, gg = 1 - n * 0.4 - warm * 0.08, b = 1 - n * 0.22 - warm * 0.22;
    this.nightAmount = n;
    if (n > 0.02 || warm > 0.02) { ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = `rgb(${(r * 255) | 0},${(gg * 255) | 0},${(b * 255) | 0})`; ctx.fillRect(0, 0, this.W, this.H); ctx.restore(); }
    // lights from buildings (torches, lanterns, windows) — stronger at night
    const glow = 0.25 + n * 0.75;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const v = this.view, g = this.game;
    for (const bld of g.buildings) {
      if (bld.dead || !bld.complete || bld.x < v.minX || bld.x > v.maxX || bld.y < v.minY || bld.y > v.maxY) continue;
      if (!this.buildingSeen(bld) || !g.isVisible(bld.x, bld.y)) continue;
      const L = LIGHTS[bld.faction][bld.role]; if (!L) continue;
      for (const [u, vv, zz, col, rad] of L) {
        const { sx, sy } = this.worldToScreen(bld.tx + u, bld.ty + vv); const y = sy - zz * z;
        const flick = col === 'torch' ? 0.8 + 0.2 * Math.sin(this.time * 11 + bld.id + u * 7) * Math.sin(this.time * 7.3 + vv * 5) : 1;
        const c = col === 'torch' ? '255,150,60' : col === 'cold' ? '170,220,255' : col === 'green' ? '140,240,150' : col === 'ember' ? '255,90,30' : '255,220,150';
        const rr = rad * z * (1 + n * 0.6);
        const gr = ctx.createRadialGradient(sx, y, 0, sx, y, rr); gr.addColorStop(0, `rgba(${c},${0.45 * glow * flick})`); gr.addColorStop(0.4, `rgba(${c},${0.14 * glow * flick})`); gr.addColorStop(1, `rgba(${c},0)`);
        ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(sx, y, rr, 0, 7); ctx.fill();
      }
    }
    // hero glow & fireflies at night
    if (n > 0.3 && Math.random() < 0.35) { const x = lerp(Math.max(0, v.minX), Math.min(this.n - 1, v.maxX), Math.random()), y = lerp(Math.max(0, v.minY), Math.min(this.n - 1, v.maxY - 3), Math.random()); if (this.map.inBounds(x | 0, y | 0) && g.isVisible(x, y) && this.map.biome[this.map.idx(x | 0, y | 0)] < 0.6) this.spawn('firefly', x, y); }
    ctx.restore();
  }
  drawGroundDecals(dt) {
    const ctx = this.ctx, z = this.cam.zoom, v = this.view;
    if (!this.gdecals) this.gdecals = [];
    for (let i = this.gdecals.length - 1; i >= 0; i--) {
      const d = this.gdecals[i]; d.t += dt; if (d.t > d.life) { this.gdecals.splice(i, 1); continue; }
      if (d.x < v.minX || d.x > v.maxX || d.y < v.minY || d.y > v.maxY) continue;
      const { sx, sy } = this.worldToScreen(d.x, d.y); const a = Math.min(1, (d.life - d.t) / 8);
      if (d.type === 'blood') { ctx.fillStyle = `rgba(110,18,18,${0.55 * a})`; for (const [ox, oy, r] of d.blobs) { ctx.beginPath(); ctx.ellipse(sx + ox * z, sy + oy * z, r * z, r * 0.5 * z, 0, 0, 7); ctx.fill(); } }
      else if (d.type === 'arrow') { ctx.save(); ctx.translate(sx, sy); ctx.rotate(d.ang); ctx.scale(z, z); ctx.globalAlpha = a; ctx.strokeStyle = '#e8dcc0'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(7, -4); ctx.stroke(); ctx.fillStyle = d.col; ctx.beginPath(); ctx.moveTo(7, -4); ctx.lineTo(5, -4.5); ctx.lineTo(6, -2.5); ctx.fill(); ctx.restore(); }
    }
  }
  addGroundDecal(d) { if (!this.gdecals) this.gdecals = []; this.gdecals.push(d); if (this.gdecals.length > 160) this.gdecals.shift(); }
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
      const sp = treeSprite(treeStyle(nd.biome, nd.variant), nd.variant);
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
    if (b.owner === 0 && b.queue.length && b.complete && !b.selected) { const q = b.queue[0]; const k = q.t / q.total; const bw = 34 * z; const py = sy - (h - b.size * HH - 8 - spriteTop(sp) / BSCALE) * z - 8 * z; ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(sx - bw / 2, py, bw, 4 * z); ctx.fillStyle = '#d9b857'; ctx.fillRect(sx - bw / 2, py, bw * k, 4 * z); }
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
      const sp = buildingSprite(e.faction, e.role, 1, e.variant); const top = (sp.height / BSCALE - e.size * HH - 8 - spriteTop(sp) / BSCALE) * z;
      const by = sy - top - 8 * z;
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
        const f = g.fog[y * n + x]; const a = f === 2 ? 0 : f === 1 ? 105 : 255;
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
        case 'firefly': p.vx = (Math.random() - 0.5) * 0.4; p.vy = (Math.random() - 0.5) * 0.4; p.vz = 0.05; p.life = 3 + Math.random() * 3; p.color = '#d8ff80'; p.size = 1.1; p.z = 0.4 + Math.random(); break;
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
      if (p.type === 'firefly') { p.vx += (Math.random() - 0.5) * dt * 2; p.vy += (Math.random() - 0.5) * dt * 2; }
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
      if (p.type === 'mote' || p.type === 'ember' || p.type === 'firefly') { ctx.shadowColor = p.color; ctx.shadowBlur = 6; if (p.type === 'firefly') ctx.globalAlpha *= 0.5 + 0.5 * Math.sin(p.t * 6 + p.size * 10); }
      ctx.beginPath(); ctx.arc(sx, sy - p.z * TH * z, p.size * z * (p.type === 'fire' ? k : 1), 0, 7); ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1;
  }
  ambient(dt) {
    // birds: occasional flock crossing the screen
    this.birdT = (this.birdT || 8) - dt;
    if (this.birdT <= 0) { this.birdT = 14 + Math.random() * 20; const n = 3 + (Math.random() * 4 | 0); const y = this.H * (0.15 + Math.random() * 0.5), dir = Math.random() < 0.5 ? 1 : -1; this.birds = []; for (let i = 0; i < n; i++) this.birds.push({ x: dir > 0 ? -40 - i * 18 : this.W + 40 + i * 18, y: y + (i % 2) * 9 + i * 3, dir, ph: Math.random() * 7, sp: 55 + Math.random() * 20 }); }
    if (this.birds) {
      const ctx = this.ctx; ctx.strokeStyle = 'rgba(20,20,25,0.75)'; ctx.lineWidth = 1.3; ctx.lineCap = 'round'; let alive = false;
      for (const b of this.birds) { b.x += b.dir * b.sp * dt; b.y -= dt * 2; if (b.x > -60 && b.x < this.W + 60) alive = true; const f = Math.sin(this.time * 9 + b.ph) * 3; ctx.beginPath(); ctx.moveTo(b.x - 5, b.y - f); ctx.quadraticCurveTo(b.x - 2, b.y + 1, b.x, b.y); ctx.quadraticCurveTo(b.x + 2, b.y + 1, b.x + 5, b.y - f); ctx.stroke(); }
      if (!alive) this.birds = null;
    }
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
      case 'blood': this.spawn('blood', e.x, e.y, 0.8, 5); if (Math.random() < 0.5) { const blobs = []; for (let i = 0; i < 4; i++) blobs.push([(Math.random() - 0.5) * 14, (Math.random() - 0.5) * 7, 1.5 + Math.random() * 3]); this.addGroundDecal({ type: 'blood', x: e.x + (Math.random() - 0.5) * 0.4, y: e.y + (Math.random() - 0.5) * 0.4, t: 0, life: 40, blobs }); } break;
      case 'arrowMiss': this.addGroundDecal({ type: 'arrow', x: e.x, y: e.y, t: 0, life: 25, ang: Math.random() * Math.PI * 2, col: e.owner === 0 ? '#9ad66a' : '#e05040' }); break;
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
// first non-transparent row of a sprite canvas (cached on the canvas)
function spriteTop(sp) {
  if (sp._top !== undefined) return sp._top;
  try {
    const d = sp.getContext('2d').getImageData(0, 0, sp.width, sp.height).data;
    let top = 0; outer: for (let y = 0; y < sp.height; y += 2) { for (let x = 3; x < sp.width; x += 4) if (d[(y * sp.width + x) * 4 + 3] > 20) { top = y; break outer; } }
    sp._top = top;
  } catch (e) { sp._top = 0; }
  return sp._top;
}

// ---------------------------------------------------------------------
//  Ground prop helpers (used while baking terrain chunks)
// ---------------------------------------------------------------------
function line(ctx, x1, y1, x2, y2, color, lw) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke(); }
function tuft(ctx, px, py, rng, light, dark, h) {
  ctx.lineCap = 'round'; ctx.lineWidth = 1;
  for (let k = 0; k < 4; k++) { const a = (k - 1.5) * 0.45 + rng.range(-0.2, 0.2); ctx.strokeStyle = rgba(k % 2 ? light : dark, 0.7); ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo(px + Math.sin(a) * h * 0.5, py - h * 0.6, px + Math.sin(a) * h, py - h * (0.8 + rng.next() * 0.4)); ctx.stroke(); }
}
function flower(ctx, px, py, rng, col) {
  line(ctx, px, py, px, py - 3, '#4a7a30', 0.8);
  ctx.fillStyle = col; for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2; ctx.beginPath(); ctx.arc(px + Math.cos(a) * 1.3, py - 3.5 + Math.sin(a) * 1.3, 0.9, 0, 7); ctx.fill(); }
  ctx.fillStyle = '#f0c030'; ctx.beginPath(); ctx.arc(px, py - 3.5, 0.7, 0, 7); ctx.fill();
}
function clover(ctx, px, py) { ctx.fillStyle = rgba('#3f8f3a', 0.9); for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 - Math.PI / 2; ctx.beginPath(); ctx.arc(px + Math.cos(a) * 1.1, py + Math.sin(a) * 1.1, 1.1, 0, 7); ctx.fill(); } }
function mushroomRing(ctx, cx, cy, rng) {
  for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2; const px = cx + Math.cos(a) * 11, py = cy + Math.sin(a) * 5.5; line(ctx, px, py, px, py - 3, '#f0e8d0', 1.4); ctx.fillStyle = rng.next() < 0.5 ? '#d84a3a' : '#e8c070'; ctx.beginPath(); ctx.ellipse(px, py - 3.2, 2.4, 1.5, 0, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(px - 0.8, py - 3.8, 0.5, 0, 7); ctx.fill(); }
}
function pebbles(ctx, cx, cy, rng, col) {
  for (let k = 0; k < 5; k++) { const px = cx + rng.range(-12, 12), py = cy + rng.range(-5, 5), r = 1 + rng.next() * 1.6; ctx.fillStyle = rgba('#000', 0.25); ctx.beginPath(); ctx.ellipse(px + 0.5, py + 0.6, r, r * 0.6, 0, 0, 7); ctx.fill(); ctx.fillStyle = shade(col, rng.range(-0.2, 0.2)); ctx.beginPath(); ctx.ellipse(px, py, r, r * 0.65, 0, 0, 7); ctx.fill(); }
}
function bones(ctx, cx, cy, rng) {
  const px = cx + rng.range(-10, 10), py = cy + rng.range(-4, 4), a = rng.next() * 3;
  ctx.save(); ctx.translate(px, py); ctx.rotate(a);
  line(ctx, -5, 0, 5, 0, '#e6dcc0', 1.6); for (const s of [-1, 1]) { ctx.fillStyle = '#e6dcc0'; ctx.beginPath(); ctx.arc(s * 5.5, -0.9, 1.1, 0, 7); ctx.arc(s * 5.5, 0.9, 1.1, 0, 7); ctx.fill(); }
  ctx.restore();
  if (rng.next() < 0.5) { const sx = px + 6, sy = py - 2; ctx.fillStyle = '#e6dcc0'; ctx.beginPath(); ctx.arc(sx, sy, 2.4, 0, 7); ctx.fill(); ctx.fillStyle = '#1a1010'; ctx.beginPath(); ctx.arc(sx - 0.9, sy, 0.6, 0, 7); ctx.arc(sx + 0.9, sy, 0.6, 0, 7); ctx.fill(); }
}
function fern(ctx, px, py, rng, col) {
  ctx.strokeStyle = col; ctx.lineWidth = 0.9; ctx.lineCap = 'round';
  for (let k = 0; k < 5; k++) {
    const a = -Math.PI / 2 + (k - 2) * 0.55 + rng.range(-0.1, 0.1), L = 7 + rng.next() * 4;
    const ex = px + Math.cos(a) * L, ey = py + Math.sin(a) * L * 0.7;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(ex, ey); ctx.stroke();
    for (let j = 1; j < 5; j++) { const t = j / 5, bx = px + (ex - px) * t, by = py + (ey - py) * t, n = (1 - t) * 2.2; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a + 1.2) * n, by + Math.sin(a + 1.2) * n); ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a - 1.2) * n, by + Math.sin(a - 1.2) * n); ctx.stroke(); }
  }
}
