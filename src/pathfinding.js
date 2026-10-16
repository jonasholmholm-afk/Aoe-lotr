const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [-1, 1, 1.414], [1, -1, 1.414], [-1, -1, 1.414]];

const _buf = new Map();
function buffers(n) {
  let b = _buf.get(n);
  if (!b) { b = { g: new Float32Array(n * n), parent: new Int32Array(n * n), closed: new Uint8Array(n * n), f: new Float32Array(n * n), stamp: new Uint32Array(n * n), gen: 0, heap: new Int32Array(n * n * 2) }; _buf.set(n, b); }
  return b;
}

/**
 * A* on the tile grid. Returns array of {x,y} tile-centre waypoints (excluding start), or null.
 * goal is accepted when within `accept` tiles (Chebyshev) of (tx,ty) — lets us path to blocked targets.
 */
export function findPath(map, sx, sy, tx, ty, accept = 0, maxIter = 3500) {
  const n = map.n;
  sx |= 0; sy |= 0; tx |= 0; ty |= 0;
  if (!map.inBounds(sx, sy)) return null;
  if (!map.isPassable(sx, sy)) {
    const f = nearestFree(map, sx, sy, 3);
    if (!f) return null;
    sx = f.x; sy = f.y;
  }
  if (Math.max(Math.abs(sx - tx), Math.abs(sy - ty)) <= accept) return [];
  const B = buffers(n);
  const g = B.g, parent = B.parent, closed = B.closed, f = B.f, stamp = B.stamp, heap = B.heap, gen = ++B.gen;
  const passable = map.terrain, blocked = map.blocked;
  const PASS = [1, 1, 0, 1, 1, 0];
  const isPass = (i) => PASS[passable[i]] && !blocked[i];
  const si = sy * n + sx;
  stamp[si] = gen; g[si] = 0; parent[si] = -1; closed[si] = 0;
  const h0 = heur(sx, sy, tx, ty);
  f[si] = h0;
  // binary heap of node indices keyed by f[]
  let hs = 0;
  const push = (i) => { let k = hs++; heap[k] = i; while (k > 0) { const p = (k - 1) >> 1; if (f[heap[p]] <= f[heap[k]]) break; const t = heap[p]; heap[p] = heap[k]; heap[k] = t; k = p; } };
  const pop = () => { const top = heap[0]; const last = heap[--hs]; if (hs > 0) { heap[0] = last; let k = 0; for (;;) { const l = k * 2 + 1, r = l + 1; let m = k; if (l < hs && f[heap[l]] < f[heap[m]]) m = l; if (r < hs && f[heap[r]] < f[heap[m]]) m = r; if (m === k) break; const t = heap[m]; heap[m] = heap[k]; heap[k] = t; k = m; } } return top; };
  push(si);
  let best = si, bestH = h0, iter = 0;
  while (hs > 0) {
    const cur = pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % n, cy = (cur - cx) / n;
    if (Math.max(Math.abs(cx - tx), Math.abs(cy - ty)) <= accept) return reconstruct(parent, cur, n, si);
    const hh = heur(cx, cy, tx, ty);
    if (hh < bestH) { bestH = hh; best = cur; }
    if (++iter > maxIter) break;
    const gc = g[cur];
    for (let d = 0; d < 8; d++) {
      const nx = cx + DIRS[d][0], ny = cy + DIRS[d][1];
      if (nx < 0 || ny < 0 || nx >= n || ny >= n) continue;
      const ni = ny * n + nx;
      if (!isPass(ni)) continue;
      if (stamp[ni] !== gen) { stamp[ni] = gen; g[ni] = Infinity; parent[ni] = -1; closed[ni] = 0; }
      if (closed[ni]) continue;
      if (d >= 4) { if (!isPass(cy * n + cx + DIRS[d][0]) || !isPass((cy + DIRS[d][1]) * n + cx)) continue; }
      const cost = DIRS[d][2] * (passable[ni] === 3 ? 1.6 : 1);
      const ng = gc + cost;
      if (ng < g[ni]) { g[ni] = ng; parent[ni] = cur; f[ni] = ng + heur(nx, ny, tx, ty) * 1.001; push(ni); }
    }
  }
  if (best !== si) return reconstruct(parent, best, n, si);
  return null;
}
function heur(x, y, tx, ty) { const dx = Math.abs(x - tx), dy = Math.abs(y - ty); return Math.max(dx, dy) + 0.414 * Math.min(dx, dy); }

function reconstruct(parent, cur, n, si) {
  const out = [];
  while (cur !== si && cur >= 0) { out.push({ x: (cur % n) + 0.5, y: Math.floor(cur / n) + 0.5 }); cur = parent[cur]; }
  out.reverse();
  return smooth(out);
}
function smooth(path) {
  if (path.length < 3) return path;
  const out = [path[0]];
  for (let i = 1; i < path.length - 1; i++) {
    const a = out[out.length - 1], b = path[i], c = path[i + 1];
    const d1x = Math.sign(b.x - a.x), d1y = Math.sign(b.y - a.y), d2x = Math.sign(c.x - b.x), d2y = Math.sign(c.y - b.y);
    if (d1x !== d2x || d1y !== d2y) out.push(b);
  }
  out.push(path[path.length - 1]);
  return out;
}

export function nearestFree(map, x, y, r = 4, pred = null) {
  for (let d = 0; d <= r; d++) {
    for (let dy = -d; dy <= d; dy++) for (let dx = -d; dx <= d; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue;
      const nx = x + dx, ny = y + dy;
      if (map.isPassable(nx, ny) && (!pred || pred(nx, ny))) return { x: nx, y: ny };
    }
  }
  return null;
}
