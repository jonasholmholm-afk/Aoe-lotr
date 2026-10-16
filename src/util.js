// ---------- Isometric constants ----------
export const TW = 64;           // tile width in px (zoom 1)
export const TH = 32;           // tile height in px
export const HW = TW / 2, HH = TH / 2;

export function worldToScreen(x, y) {
  return { sx: (x - y) * HW, sy: (x + y) * HH };
}
export function screenToWorld(sx, sy) {
  return { x: (sx / HW + sy / HH) / 2, y: (sy / HH - sx / HW) / 2 };
}

// ---------- math ----------
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);
export const dist2 = (ax, ay, bx, by) => (bx - ax) * (bx - ax) + (by - ay) * (by - ay);
export const smoothstep = (t) => t * t * (3 - 2 * t);
export function angleToDir8(ang) {
  // ang in radians, returns 0..7 (screen-space angle)
  let a = Math.round(ang / (Math.PI / 4));
  return ((a % 8) + 8) % 8;
}
export function fmtTime(s) {
  s = Math.floor(s);
  const m = Math.floor(s / 60), r = s % 60;
  return (m < 10 ? '0' : '') + m + ':' + (r < 10 ? '0' : '') + r;
}

// ---------- RNG (mulberry32) ----------
export class RNG {
  constructor(seed) { this.s = (seed >>> 0) || 0x9e3779b9; }
  next() {
    let t = (this.s += 0x6D2B79F5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + (b - a) * this.next(); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
}

// ---------- Value noise / FBM ----------
export class Noise {
  constructor(seed) {
    const rng = new RNG(seed);
    this.perm = new Uint8Array(512);
    const p = [];
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
    this.grad = new Float32Array(256 * 2);
    for (let i = 0; i < 256; i++) { const a = rng.next() * Math.PI * 2; this.grad[i * 2] = Math.cos(a); this.grad[i * 2 + 1] = Math.sin(a); }
  }
  // 2D gradient noise in [-1,1]
  get(x, y) {
    const X = Math.floor(x), Y = Math.floor(y);
    const fx = x - X, fy = y - Y;
    const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const p = this.perm, g = this.grad;
    const h = (ix, iy) => p[(p[ix & 255] + (iy & 255)) & 511];
    const d = (hh, dx, dy) => g[hh * 2] * dx + g[hh * 2 + 1] * dy;
    const n00 = d(h(X, Y), fx, fy), n10 = d(h(X + 1, Y), fx - 1, fy);
    const n01 = d(h(X, Y + 1), fx, fy - 1), n11 = d(h(X + 1, Y + 1), fx - 1, fy - 1);
    const nx0 = n00 + (n10 - n00) * u, nx1 = n01 + (n11 - n01) * u;
    return (nx0 + (nx1 - nx0) * v) * 1.4;
  }
  fbm(x, y, oct = 4, lac = 2, gain = 0.5) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += this.get(x * f, y * f) * a; n += a; a *= gain; f *= lac; }
    return s / n;
  }
}

// ---------- Binary heap ----------
export class MinHeap {
  constructor(scoreFn) { this.a = []; this.f = scoreFn; }
  get size() { return this.a.length; }
  push(v) {
    const a = this.a; a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f(a[p]) <= this.f(a[i])) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0; const n = a.length;
      for (;;) {
        let l = i * 2 + 1, r = l + 1, m = i;
        if (l < n && this.f(a[l]) < this.f(a[m])) m = l;
        if (r < n && this.f(a[r]) < this.f(a[m])) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

// ---------- colors ----------
export function shade(hex, amt) {
  // hex '#rrggbb', amt -1..1
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}
export function rgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
export function mix(h1, h2, t) {
  const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
  const r = ((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t;
  const g = ((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t;
  const bl = (a & 255) + ((b & 255) - (a & 255)) * t;
  return `rgb(${r | 0},${g | 0},${bl | 0})`;
}
export function mixHex(h1, h2, t) {
  const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
  const r = Math.round(((a >> 16) & 255) + (((b >> 16) & 255) - ((a >> 16) & 255)) * t);
  const g = Math.round(((a >> 8) & 255) + (((b >> 8) & 255) - ((a >> 8) & 255)) * t);
  const bl = Math.round((a & 255) + ((b & 255) - (a & 255)) * t);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + bl).toString(16).slice(1);
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}

let _id = 1;
export const nextId = () => _id++;
