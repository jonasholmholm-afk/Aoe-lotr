// =====================================================================
//  Optional image assets.  Any PNG dropped into assets/art/ with a known
//  name replaces the procedurally drawn version; missing files fall back.
//  assets/art/manifest.json may hold per-image tuning: {key:{scale,dx,dy,keep}}
// =====================================================================
import { makeCanvas } from './util.js';

export const ART = { images: new Map(), tuning: {}, ready: false, version: 0 };

const BUILDING_KEYS = []; for (const f of ['elves', 'orcs']) for (const r of ['tc', 'house', 'lumber', 'mine', 'mill', 'farm', 'barracks', 'range', 'stable', 'smith', 'tower', 'siege', 'shrine']) BUILDING_KEYS.push(`b_${f}_${r}`);
const TREE_KEYS = []; for (const s of ['mallorn', 'oak', 'pine', 'blight']) for (let i = 1; i <= 4; i++) TREE_KEYS.push(`tree_${s}_${i}`);
const NODE_KEYS = ['node_gold', 'node_stone', 'node_berry', 'node_carcass'];
const TEX_KEYS = ['tex_grass_elf', 'tex_grass_mid', 'tex_grass_blight', 'tex_dirt', 'tex_forest_elf', 'tex_forest_blight', 'tex_water'];
const MISC_KEYS = ['menu_bg', 'icon_food', 'icon_wood', 'icon_gold', 'icon_stone', 'icon_pop'];
export const ALL_KEYS = [...BUILDING_KEYS, ...TREE_KEYS, ...NODE_KEYS, ...TEX_KEYS, ...MISC_KEYS];

export function loadArt(onProgress) {
  const base = 'assets/art/';
  const p = fetch(base + 'manifest.json').then(r => r.ok ? r.json() : {}).catch(() => ({})).then(m => { ART.tuning = m || {}; });
  // manifest.files lists which PNGs exist (avoids 40+ failed requests); without it every key is tried
  return p.then(() => {
    if (Array.isArray(ART.tuning.files)) return Promise.all(ART.tuning.files.map(f => loadOne(base + f, f.replace(/\.(png|webp)$/, ''))));
    return Promise.all(ALL_KEYS.map(key => loadOne(base + key + '.webp', key).then(() => ART.images.has(key) ? null : loadOne(base + key + '.png', key))));
  }).then(() => { ART.ready = true; ART.version++; onProgress && onProgress(); return ART; });
}
function loadOne(url, key) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => { try { ART.images.set(key, prepare(img, key)); } catch (e) { console.warn('asset prep failed', key, e); } resolve(); };
    img.onerror = () => resolve();
    img.src = url;
  });
}
// Convert an image to a canvas; remove a flat background colour (keyed from the corners) unless tuning says keep.
export function prepare(img, key) {
  const c = makeCanvas(img.naturalWidth, img.naturalHeight); const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const t = ART.tuning[key] || {};
  if (t.keep || key.startsWith('tex_') || key === 'menu_bg') return c;
  const W = c.width, H = c.height; const id = x.getImageData(0, 0, W, H); const d = id.data;
  // already transparent?
  let opaque = 0; for (const [cx, cy] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]) if (d[(cy * W + cx) * 4 + 3] > 250) opaque++;
  if (opaque < 3) return c;
  // key colour = median of corners
  const cs = [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]].map(([cx, cy]) => { const i = (cy * W + cx) * 4; return [d[i], d[i + 1], d[i + 2]]; });
  const kr = cs.reduce((s, v) => s + v[0], 0) / 4, kg = cs.reduce((s, v) => s + v[1], 0) / 4, kb = cs.reduce((s, v) => s + v[2], 0) / 4;
  const tol = t.tolerance ?? 70;
  // flood fill from the border so same-coloured interior pixels survive
  const seen = new Uint8Array(W * H); const stack = [];
  for (let i = 0; i < W; i++) { stack.push(i, (H - 1) * W + i); } for (let j = 0; j < H; j++) { stack.push(j * W, j * W + W - 1); }
  const close = (i) => { const o = i * 4; const dr = d[o] - kr, dg = d[o + 1] - kg, db = d[o + 2] - kb; return Math.sqrt(dr * dr + dg * dg + db * db); };
  while (stack.length) {
    const i = stack.pop(); if (seen[i]) continue; seen[i] = 1;
    const dist = close(i); if (dist > tol) continue;
    const o = i * 4; d[o + 3] = dist < tol * 0.6 ? 0 : Math.round(255 * (dist - tol * 0.6) / (tol * 0.4));
    const px = i % W, py = (i - px) / W;
    if (px > 0) stack.push(i - 1); if (px < W - 1) stack.push(i + 1); if (py > 0) stack.push(i - W); if (py < H - 1) stack.push(i + W);
  }
  // enclosed pockets of background (between branches etc.) are not reached by the flood fill: key them globally with a tighter tolerance
  const tol2 = t.innerTolerance ?? Math.min(tol, 60);
  for (let i = 0; i < W * H; i++) { if (seen[i]) continue; const dist = close(i); if (dist < tol2) { const o = i * 4; d[o + 3] = Math.min(d[o + 3], dist < tol2 * 0.6 ? 0 : Math.round(255 * (dist - tol2 * 0.6) / (tol2 * 0.4))); } }
  // despill: any remaining pixel that leans toward the key colour (anti-aliased fringes, gaps between leaves) has that cast removed
  const isMagenta = kr > 180 && kb > 180 && kg < 120;
  if (isMagenta) {
    for (let i = 0; i < W * H; i++) {
      const o = i * 4; if (d[o + 3] === 0) continue;
      const dist = close(i); if (dist > 150) continue;
      const m = (d[o] + d[o + 2]) / 2, g = d[o + 1]; if (m <= g + 20) continue;
      const k = 0.75 * (1 - dist / 150); const pull = (m - g) * k;
      d[o] = Math.max(0, Math.round(d[o] - pull)); d[o + 2] = Math.max(0, Math.round(d[o + 2] - pull));
      if (dist < 90) d[o + 3] = Math.min(d[o + 3], Math.round(255 * Math.min(1, (dist - tol2 * 0.6) / 60)));
    }
  }
  x.putImageData(id, 0, 0);
  // trim transparent margins
  let minX = W, minY = H, maxX = 0, maxY = 0;
  for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) if (d[(y * W + xx) * 4 + 3] > 8) { if (xx < minX) minX = xx; if (xx > maxX) maxX = xx; if (y < minY) minY = y; if (y > maxY) maxY = y; }
  if (maxX <= minX || maxY <= minY) return c;
  const out = makeCanvas(maxX - minX + 1, maxY - minY + 1); out.getContext('2d').drawImage(c, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}
export function art(key) { return ART.images.get(key) || null; }
export function artTuning(key) { return ART.tuning[key] || {}; }
