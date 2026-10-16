// Usage: node tools/process-art.mjs <key> <raw-image-path> [maxWidth]
// Removes the flat background, trims, resizes and writes assets/art/<key>.webp, then updates manifest.json.
import pw from '/opt/node-tools/node_modules/playwright/index.js'; const { chromium } = pw;
import fs from 'fs'; import path from 'path';
const [key, raw, maxW] = process.argv.slice(2);
if (!key || !raw) { console.error('usage: node tools/process-art.mjs <key> <raw-image> [maxWidth]'); process.exit(1); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const defaults = { tc: 1024, shrine: 900, barracks: 900, range: 900, stable: 900, smith: 900, siege: 900, farm: 900, house: 640, lumber: 640, mine: 640, mill: 640, tower: 520 };
let target = Number(maxW) || 0;
if (!target) { const role = key.split('_')[2]; target = key.startsWith('b_') ? (defaults[role] || 800) : key.startsWith('tree_') ? 420 : key.startsWith('node_') ? 420 : key.startsWith('tex_') ? 512 : key.startsWith('icon_') ? 128 : 1536; }
const keep = key.startsWith('tex_') || key === 'menu_bg';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto('http://localhost:8123/index.html');
const b64 = fs.readFileSync(raw).toString('base64');
const ext = raw.toLowerCase().endsWith('.webp') ? 'webp' : raw.toLowerCase().endsWith('.jpg') || raw.toLowerCase().endsWith('.jpeg') ? 'jpeg' : 'png';
const result = await page.evaluate(async ({ b64, ext, key, target, keep }) => {
  const { prepare, ART } = await import('./src/assets.js');
  const r = await fetch('assets/art/manifest.json'); ART.tuning = r.ok ? await r.json() : {};
  const img = new Image(); img.src = `data:image/${ext};base64,${b64}`; await img.decode();
  const c = keep ? (() => { const cc = document.createElement('canvas'); cc.width = img.naturalWidth; cc.height = img.naturalHeight; cc.getContext('2d').drawImage(img, 0, 0); return cc; })() : prepare(img, key);
  const sc = Math.min(1, target / Math.max(c.width, c.height));
  const o = document.createElement('canvas'); o.width = Math.round(c.width * sc); o.height = Math.round(c.height * sc);
  const x = o.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, o.width, o.height);
  return { data: o.toDataURL('image/webp', 0.88), w: o.width, h: o.height, srcW: img.naturalWidth, srcH: img.naturalHeight };
}, { b64, ext, key, target, keep });
await browser.close();
const outPath = path.join(root, 'assets/art', key + '.webp');
fs.writeFileSync(outPath, Buffer.from(result.data.split(',')[1], 'base64'));
const mp = path.join(root, 'assets/art/manifest.json'); const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
m.files = (m.files || []).filter(f => !f.startsWith(key + '.')); m.files.push(key + '.webp'); m.files.sort();
if (!m[key]) m[key] = { scale: 1 }; m[key].keep = true;
fs.writeFileSync(mp, JSON.stringify(m, null, 2));
console.log(`${key}: ${result.srcW}x${result.srcH} -> ${result.w}x${result.h}, ${(fs.statSync(outPath).size / 1024).toFixed(0)} KB`);
