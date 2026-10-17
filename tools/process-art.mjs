// Usage: node tools/process-art.mjs <key> <raw-image-path> [maxWidth]
// Removes the flat background, trims, resizes and writes assets/art/<key>.webp, then updates manifest.json.
import pw from '/opt/node-tools/node_modules/playwright/index.js'; const { chromium } = pw;
import fs from 'fs'; import path from 'path';
const [key, raw, maxW] = process.argv.slice(2);
if (!key || !raw) { console.error('usage: node tools/process-art.mjs <key> <raw-image> [maxWidth]'); process.exit(1); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const defaults = { tc: 1024, shrine: 900, barracks: 900, range: 900, stable: 900, smith: 900, siege: 900, farm: 900, house: 640, lumber: 640, mine: 640, mill: 640, tower: 520 };
let target = Number(maxW) || 0;
if (!target) { const role = key.split('_')[2]; target = key.startsWith('b_') ? (defaults[role] || 800) : key.startsWith('tree_') ? 420 : key.startsWith('node_') ? 420 : key.startsWith('tex_') ? 768 : key.startsWith('icon_') ? 128 : 1536; }
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
  let c = keep ? (() => { const cc = document.createElement('canvas'); cc.width = img.naturalWidth; cc.height = img.naturalHeight; cc.getContext('2d').drawImage(img, 0, 0); return cc; })() : prepare(img, key);
  if (key.startsWith('tex_')) {
    // make tileable: offset by half, then cross-fade the seams with the original using soft masks
    const W = c.width, H = c.height, m = Math.round(W * 0.18);
    const off = document.createElement('canvas'); off.width = W; off.height = H; const ox = off.getContext('2d');
    for (const dx of [-W, 0, W]) for (const dy of [-H, 0, H]) ox.drawImage(c, dx + W / 2, dy + H / 2);
    // off now has the seams through the middle; paint the original back over the middle with feathered edges
    const o2 = document.createElement('canvas'); o2.width = W; o2.height = H; const x2 = o2.getContext('2d');
    x2.drawImage(off, 0, 0);
    const feather = document.createElement('canvas'); feather.width = W; feather.height = H; const fx = feather.getContext('2d');
    fx.drawImage(c, 0, 0); fx.globalCompositeOperation = 'destination-in';
    const g1 = fx.createLinearGradient(0, 0, W, 0); g1.addColorStop(0, 'rgba(0,0,0,0)'); g1.addColorStop(m / W, 'rgba(0,0,0,1)'); g1.addColorStop(1 - m / W, 'rgba(0,0,0,1)'); g1.addColorStop(1, 'rgba(0,0,0,0)');
    fx.fillStyle = g1; fx.fillRect(0, 0, W, H);
    const g2 = fx.createLinearGradient(0, 0, 0, H); g2.addColorStop(0, 'rgba(0,0,0,0)'); g2.addColorStop(m / H, 'rgba(0,0,0,1)'); g2.addColorStop(1 - m / H, 'rgba(0,0,0,1)'); g2.addColorStop(1, 'rgba(0,0,0,0)');
    fx.fillStyle = g2; fx.fillRect(0, 0, W, H);
    // the feathered original only covers the middle; the edges keep the half-offset copy whose seams are now in the middle (hidden under the original)
    x2.drawImage(feather, 0, 0);
    c = o2;
  }
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
