import { RNG, Noise, clamp } from './util.js';
import { NODES } from './data.js';

export const T = { GRASS: 0, FOREST: 1, WATER: 2, SHALLOW: 3, DIRT: 4, ROCK: 5 };
export const PASSABLE = [true, true, false, true, true, false];
export const MAP_SIZES = { small: 64, medium: 80, large: 100 };

export class GameMap {
  constructor(size, seed) {
    this.n = size;
    this.seed = seed;
    const nn = size * size;
    this.terrain = new Uint8Array(nn);
    this.biome = new Float32Array(nn);     // 0 = elven glade, 1 = orc blight
    this.blocked = new Uint8Array(nn);     // static+dynamic blockers (trees, mines, buildings)
    this.occupant = new Int32Array(nn).fill(0); // entity id occupying tile (buildings/resource nodes)
    this.variant = new Uint8Array(nn);     // decoration variant per tile
    this.nodes = [];
    this.animals = [];
    this.bases = {};
    this.generate();
  }
  idx(x, y) { return y * this.n + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.n && y < this.n; }
  terrainAt(x, y) { return this.inBounds(x, y) ? this.terrain[this.idx(x, y)] : T.WATER; }
  isPassable(x, y) {
    if (!this.inBounds(x, y)) return false;
    const i = this.idx(x, y);
    return PASSABLE[this.terrain[i]] && !this.blocked[i];
  }
  isWalkableTerrain(x, y) { return this.inBounds(x, y) && PASSABLE[this.terrain[this.idx(x, y)]]; }
  speedFactor(x, y) { return this.terrainAt(x | 0, y | 0) === T.SHALLOW ? 0.6 : 1; }
  setBlocked(x, y, v, id = 0) { if (this.inBounds(x, y)) { const i = this.idx(x, y); this.blocked[i] = v ? 1 : 0; this.occupant[i] = v ? id : 0; } }

  // ------------------------------------------------------------------
  generate() {
    const n = this.n, rng = new RNG(this.seed), noise = new Noise(this.seed ^ 0x5bd1e995), noise2 = new Noise(this.seed * 7 + 3);
    const elfBase = { x: Math.round(n * 0.2), y: Math.round(n * 0.2) };
    const orcBase = { x: Math.round(n * 0.8), y: Math.round(n * 0.8) };
    this.bases = { elves: elfBase, orcs: orcBase };
    const dB = (x, y, b) => Math.hypot(x - b.x, y - b.y);

    // biome gradient along main diagonal, perturbed
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      let t = (x + y) / (2 * n);
      t = (t - 0.5) * 1.6 + 0.5 + noise.fbm(x / 14, y / 14, 3) * 0.28;
      this.biome[this.idx(x, y)] = clamp(t, 0, 1);
      this.variant[this.idx(x, y)] = Math.floor(rng.next() * 256);
    }

    // river along anti-diagonal through center with noise-based meander
    const center = n / 2, riverW = n >= 90 ? 2.6 : 2.1;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const u = (x - y) / Math.SQRT2;                 // along river
      const v = (x + y - n) / Math.SQRT2;             // across river
      const meander = noise2.fbm(u / 11 + 10, 0.5, 2) * 6;
      const d = Math.abs(v - meander);
      const i = this.idx(x, y);
      if (d < riverW) this.terrain[i] = T.WATER;
      else if (d < riverW + 1.2 && rng.next() < 0.7) this.terrain[i] = T.SHALLOW;
    }
    // fords: 3 crossings spaced along river
    const fordCount = 3;
    for (let f = 0; f < fordCount; f++) {
      const u = (f + 0.5) / fordCount * n * Math.SQRT2 - n / Math.SQRT2 + rng.range(-4, 4);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const uu = (x - y) / Math.SQRT2;
        if (Math.abs(uu - u) < 2.2) { const i = this.idx(x, y); if (this.terrain[i] === T.WATER) this.terrain[i] = T.SHALLOW; }
      }
    }
    // lakes
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = this.idx(x, y);
      if (this.terrain[i] !== T.GRASS) continue;
      const l = noise2.fbm(x / 9 + 50, y / 9 + 50, 3);
      if (l > 0.48 && dB(x, y, elfBase) > 11 && dB(x, y, orcBase) > 11) this.terrain[i] = T.WATER;
      else if (l > 0.42 && dB(x, y, elfBase) > 11 && dB(x, y, orcBase) > 11) this.terrain[i] = T.SHALLOW;
    }
    // rocks / cliffs
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = this.idx(x, y);
      if (this.terrain[i] !== T.GRASS) continue;
      const r = noise.fbm(x / 7 + 200, y / 7 + 200, 3);
      if (r > 0.45 && dB(x, y, elfBase) > 9 && dB(x, y, orcBase) > 9) this.terrain[i] = T.ROCK;
    }
    // map border: rocks in corners for a natural frame
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const edge = Math.min(x, y, n - 1 - x, n - 1 - y);
      if (edge < 2 && this.terrain[this.idx(x, y)] === T.GRASS && rng.next() < 0.75 - edge * 0.3) this.terrain[this.idx(x, y)] = T.ROCK;
    }

    // forests
    const forest = new Uint8Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = this.idx(x, y);
      if (this.terrain[i] !== T.GRASS) continue;
      const fz = noise.fbm(x / 8 + 400, y / 8 + 400, 3);
      const nearBase = Math.min(dB(x, y, elfBase), dB(x, y, orcBase));
      if (fz > 0.22 && nearBase > 7) forest[i] = 1;
    }
    // guaranteed forest blobs near each base
    for (const b of [elfBase, orcBase]) {
      for (let k = 0; k < 2; k++) {
        const a = rng.range(0, Math.PI * 2), d = rng.range(8, 10.5);
        const cx = Math.round(b.x + Math.cos(a) * d), cy = Math.round(b.y + Math.sin(a) * d);
        for (let y = cy - 4; y <= cy + 4; y++) for (let x = cx - 4; x <= cx + 4; x++) {
          if (!this.inBounds(x, y)) continue;
          const i = this.idx(x, y);
          if (this.terrain[i] === T.GRASS && Math.hypot(x - cx, y - cy) + noise.get(x / 2, y / 2) * 1.5 < 3.6 && dB(x, y, b) > 6.5) forest[i] = 1;
        }
      }
    }
    // clear base zones
    for (const b of [elfBase, orcBase]) {
      for (let y = b.y - 7; y <= b.y + 7; y++) for (let x = b.x - 7; x <= b.x + 7; x++) {
        if (!this.inBounds(x, y) || dB(x, y, b) > 7) continue;
        const i = this.idx(x, y); this.terrain[i] = T.GRASS; forest[i] = 0;
      }
    }
    // place trees from forest mask
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = this.idx(x, y);
      if (forest[i]) {
        this.terrain[i] = T.FOREST;
        this.addNode('tree', x, y, rng);
      }
    }

    // resources near bases
    const placeCluster = (kind, cx, cy, count, b) => {
      let placed = 0, tries = 0;
      const spots = [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [2, 0], [0, 2], [-2, 0], [0, -2]];
      for (const [dx, dy] of spots) {
        if (placed >= count) break;
        const x = cx + dx, y = cy + dy;
        if (this.inBounds(x, y) && this.terrain[this.idx(x, y)] === T.GRASS && !this.blocked[this.idx(x, y)] && (!b || dB(x, y, b) > 4.5)) { this.addNode(kind, x, y, rng); placed++; }
        tries++;
      }
      return placed;
    };
    const findSpot = (b, dmin, dmax, otherBase) => {
      for (let t = 0; t < 200; t++) {
        const a = rng.range(0, Math.PI * 2), d = rng.range(dmin, dmax);
        const x = Math.round(b.x + Math.cos(a) * d), y = Math.round(b.y + Math.sin(a) * d);
        if (!this.inBounds(x, y) || x < 3 || y < 3 || x > n - 4 || y > n - 4) continue;
        if (this.terrain[this.idx(x, y)] !== T.GRASS || this.blocked[this.idx(x, y)]) continue;
        if (otherBase && dB(x, y, otherBase) < dB(x, y, b)) continue;
        // require mostly clear 3x3
        let ok = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (this.inBounds(x + dx, y + dy) && this.terrain[this.idx(x + dx, y + dy)] === T.GRASS && !this.blocked[this.idx(x + dx, y + dy)]) ok++;
        if (ok >= 7) return { x, y };
      }
      return null;
    };
    const bases = [[elfBase, orcBase], [orcBase, elfBase]];
    for (const [b, other] of bases) {
      let s;
      if ((s = findSpot(b, 7.5, 10, other))) placeCluster('gold', s.x, s.y, 5, b);
      if ((s = findSpot(b, 13, 17, other))) placeCluster('gold', s.x, s.y, 4, b);
      if ((s = findSpot(b, 9, 12.5, other))) placeCluster('stone', s.x, s.y, 4, b);
      if ((s = findSpot(b, 5.5, 7.5, other))) placeCluster('berry', s.x, s.y, 6, b);
      if ((s = findSpot(b, 8, 11, other))) for (let k = 0; k < 4; k++) this.animals.push({ type: 'deer', x: s.x + rng.range(-1.2, 1.2), y: s.y + rng.range(-1.2, 1.2) });
      if ((s = findSpot(b, 10, 13, other))) this.animals.push({ type: 'boar', x: s.x + 0.5, y: s.y + 0.5 });
      if ((s = findSpot(b, 11, 14, other))) this.animals.push({ type: 'boar', x: s.x + 0.5, y: s.y + 0.5 });
    }
    // mid-map resources
    const mid = { x: center, y: center };
    for (let k = 0; k < 3; k++) { const s = findSpot(mid, 4, n * 0.3); if (s) placeCluster('gold', s.x, s.y, 5); }
    for (let k = 0; k < 2; k++) { const s = findSpot(mid, 4, n * 0.3); if (s) placeCluster('stone', s.x, s.y, 4); }
    for (let k = 0; k < 2; k++) { const s = findSpot(mid, 6, n * 0.3); if (s) placeCluster('berry', s.x, s.y, 5); }
    for (let k = 0; k < 2; k++) { const s = findSpot(mid, 6, n * 0.3); if (s) for (let j = 0; j < 3; j++) this.animals.push({ type: 'deer', x: s.x + rng.range(-1, 1), y: s.y + rng.range(-1, 1) }); }
    // spiders lurk at forest edges in the darker half
    let spiders = 0;
    for (let t = 0; t < 400 && spiders < 4; t++) {
      const x = rng.int(3, n - 4), y = rng.int(3, n - 4);
      const i = this.idx(x, y);
      if (this.terrain[i] !== T.GRASS || this.blocked[i]) continue;
      if (this.biome[i] < 0.45) continue;
      if (dB(x, y, elfBase) < 16 || dB(x, y, orcBase) < 16) continue;
      let nearForest = false;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (this.terrainAt(x + dx, y + dy) === T.FOREST) nearForest = true;
      if (!nearForest) continue;
      this.animals.push({ type: 'spider', x: x + 0.5, y: y + 0.5 }); spiders++;
    }

    // connectivity: carve a path if bases are disconnected
    if (!this.connected(elfBase, orcBase)) this.carvePath(elfBase, orcBase);

    // dirt paths from each base toward the center ford
    for (const b of [elfBase, orcBase]) this.wornPath(b, mid, rng);
  }

  addNode(kind, x, y, rng) {
    const i = this.idx(x, y);
    if (this.blocked[i]) return;
    const amount = kind === 'tree' ? (this.biome[i] < 0.35 ? 125 : 100) : NODES[kind].amount;
    this.nodes.push({ kind, tx: x, ty: y, amount, variant: Math.floor(rng.next() * 1000) });
    this.blocked[i] = 1;
  }

  connected(a, b) {
    const n = this.n, seen = new Uint8Array(n * n), q = [a.x, a.y];
    seen[this.idx(a.x, a.y)] = 1;
    while (q.length) {
      const y = q.pop(), x = q.pop();
      if (Math.abs(x - b.x) <= 1 && Math.abs(y - b.y) <= 1) return true;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!this.inBounds(nx, ny)) continue;
        const i = this.idx(nx, ny);
        if (seen[i] || !PASSABLE[this.terrain[i]] || this.blocked[i]) continue;
        seen[i] = 1; q.push(nx, ny);
      }
    }
    return false;
  }
  carvePath(a, b) {
    let x = a.x, y = a.y;
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    for (let s = 0; s <= steps; s++) {
      const px = Math.round(a.x + (b.x - a.x) * s / steps), py = Math.round(a.y + (b.y - a.y) * s / steps);
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) {
        const cx = px + dx, cy = py + dy;
        if (!this.inBounds(cx, cy)) continue;
        const i = this.idx(cx, cy);
        if (this.terrain[i] === T.WATER) this.terrain[i] = T.SHALLOW;
        if (this.terrain[i] === T.ROCK) this.terrain[i] = T.DIRT;
        if (this.blocked[i]) { this.blocked[i] = 0; this.nodes = this.nodes.filter(nd => !(nd.tx === cx && nd.ty === cy)); if (this.terrain[i] === T.FOREST) this.terrain[i] = T.GRASS; }
      }
    }
  }
  wornPath(a, b, rng) {
    const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    for (let s = 3; s <= steps * 0.75; s++) {
      const wob = Math.sin(s * 0.35) * 1.2;
      const px = Math.round(a.x + (b.x - a.x) * s / steps + wob), py = Math.round(a.y + (b.y - a.y) * s / steps - wob);
      for (const [dx, dy] of [[0, 0], [1, 0]]) {
        const cx = px + dx, cy = py + dy;
        if (!this.inBounds(cx, cy)) continue;
        const i = this.idx(cx, cy);
        if (this.terrain[i] === T.GRASS && !this.blocked[i] && rng.next() < 0.85) this.terrain[i] = T.DIRT;
      }
    }
  }
}
