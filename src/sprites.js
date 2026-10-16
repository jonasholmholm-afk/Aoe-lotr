// =====================================================================
//  Procedural sprite factory: units, mounts, giants, beasts, buildings,
//  trees, resource nodes and UI icons.  Everything is drawn once and
//  cached as offscreen canvases.
// =====================================================================
import { TW, TH, HW, HH, makeCanvas, shade, rgba, mixHex, RNG, clamp } from './util.js';
import { UNITS, BUILDING_ROLES } from './data.js';

export const S = 3;                       // supersampling factor for units
const cache = new Map();
export function cached(key, w, h, fn) {
  let c = cache.get(key);
  if (!c) {
    c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    fn(ctx, c);
    cache.set(key, c);
  }
  return c;
}
export function clearCache() { cache.clear(); }

// ---------------------------------------------------------------------
//  Small drawing helpers
// ---------------------------------------------------------------------
function ell(ctx, x, y, rx, ry, fill, stroke, lw = 0.8) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function rrect(ctx, x, y, w, h, r, fill, stroke, lw = 0.8) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function poly(ctx, pts, fill, stroke, lw = 0.8) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
function line(ctx, x1, y1, x2, y2, color, lw) {
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = lw; ctx.stroke();
}
function vgrad(ctx, x, y1, y2, c1, c2) { const g = ctx.createLinearGradient(x, y1, x, y2); g.addColorStop(0, c1); g.addColorStop(1, c2); return g; }
const OUT = 'rgba(20,14,10,0.85)';

// ---------------------------------------------------------------------
//  UNITS
// ---------------------------------------------------------------------
export const UNIT_W = 52, UNIT_H = 64;           // sprite canvas size at zoom 1 (before S)
export const UNIT_ANCHOR_Y = 58;                 // feet y inside canvas

/**
 * Get a unit sprite canvas.
 * view: 'f' front (towards camera) | 'b' back ; flip: facing right (mirror)
 * anim: 'idle'|'walk'|'attack'|'gather' ; frame index
 */
export function unitSprite(def, view, flip, anim, frame) {
  const key = `u|${def.id}|${view}|${flip ? 1 : 0}|${anim}|${frame}`;
  const sp = def.sprite;
  const big = sp.kind === 'giant' ? 1.6 : (sp.kind === 'mounted' || sp.kind === 'beast') ? 1.25 : (sp.scale || 1) > 1.2 ? 1.3 : 1;
  const w = UNIT_W * big, h = UNIT_H * big;
  return cached(key, w * S, h * S, (ctx) => {
    ctx.scale(S, S);
    ctx.translate(w / 2, h - 6 * big);
    if (flip) ctx.scale(-1, 1);
    const ph = animPhase(anim, frame);
    switch (sp.kind) {
      case 'humanoid': drawHumanoid(ctx, sp, view, ph, def); break;
      case 'mounted': drawMounted(ctx, sp, view, ph, def); break;
      case 'giant': drawGiant(ctx, sp, view, ph, def); break;
      case 'beast': drawBeast(ctx, sp, view, ph, def); break;
    }
  });
}
export const WALK_FRAMES = 6, ATTACK_FRAMES = 4;
function animPhase(anim, frame) {
  if (anim === 'walk') return { walk: frame / WALK_FRAMES, attack: null };
  if (anim === 'attack' || anim === 'gather') return { walk: 0, attack: frame / ATTACK_FRAMES, gather: anim === 'gather' };
  return { walk: 0, attack: null, idle: true };
}

// -------- humanoid rig --------
function drawHumanoid(ctx, p, view, ph, def, opts = {}) {
  const sc = (p.scale || 1) * (opts.scale || 1);
  const bulky = p.build === 'bulky', grot = p.build === 'grot';
  ctx.save();
  ctx.scale(sc, sc);
  if (opts.offsetY) ctx.translate(0, opts.offsetY);
  const front = view === 'f';
  const skin = p.skin, tunic = p.tunic, pants = p.pants;
  const bw = bulky ? 5.2 : grot ? 3.6 : 4.2;          // half body width
  const legLen = grot ? 6 : 8, torsoTop = grot ? -14 : -17, hip = -legLen - 1;
  const headR = grot ? 3.2 : bulky ? 3.4 : 3.1;
  const headY = torsoTop - headR - 0.5;
  // walk cycle
  const sw = Math.sin(ph.walk * Math.PI * 2);
  const legA = sw * 2.6, legB = -sw * 2.6;
  const bob = ph.walk ? Math.abs(Math.cos(ph.walk * Math.PI * 2)) * 0.8 : 0;
  // attack pose
  let armSwing = 0;        // 0 rest, 1 raised, -1 struck
  if (ph.attack !== null && ph.attack !== undefined) {
    const a = ph.attack;
    armSwing = a < 0.5 ? a * 2 : 1 - (a - 0.5) * 4;   // raise then strike
  }
  if (!opts.mounted) {
    // legs
    ctx.lineWidth = 2.4; ctx.strokeStyle = pants; ctx.lineCap = 'round';
    line(ctx, -2.2, hip, -2.2 + legA, 0, pants, bulky ? 3 : 2.4);
    line(ctx, 2.2, hip, 2.2 + legB, 0, pants, bulky ? 3 : 2.4);
    // boots
    ell(ctx, -2.2 + legA, 0, 1.8, 1, shade(pants, -0.35)); ell(ctx, 2.2 + legB, 0, 1.8, 1, shade(pants, -0.35));
  } else {
    // mounted rider: short legs along mount flank
    line(ctx, -1.5, hip, -4.5, hip + 5, pants, 2.4);
    ell(ctx, -4.6, hip + 5.3, 1.6, 1, shade(pants, -0.35));
  }
  ctx.translate(0, -bob);
  // cloak behind
  if (p.cloak) {
    const flutter = Math.sin((ph.walk || 0) * Math.PI * 2) * 1.2;
    ctx.beginPath(); ctx.moveTo(-bw + 0.5, torsoTop + 1); ctx.lineTo(bw - 0.5, torsoTop + 1);
    ctx.quadraticCurveTo(bw + 2 + flutter, hip + 2, bw - 1 + flutter, hip + 6);
    ctx.lineTo(-bw - 1 - flutter * 0.5, hip + 5); ctx.quadraticCurveTo(-bw - 2, hip + 1, -bw + 0.5, torsoTop + 1);
    ctx.fillStyle = vgrad(ctx, 0, torsoTop, hip + 6, shade(p.cloak, 0.1), shade(p.cloak, -0.4)); ctx.fill();
    ctx.strokeStyle = OUT; ctx.lineWidth = 0.6; ctx.stroke();
    if (p.cloakGold) { ctx.strokeStyle = '#d9b857'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-bw, hip + 4.5); ctx.lineTo(bw - 1, hip + 5.5); ctx.stroke(); }
  }
  // shield on back when back view
  if (p.shield && !front) drawShield(ctx, 0, torsoTop + 5, 3.3, p.shield, p, true);
  // weapon arm (behind body for back view when striking)
  const shoulderY = torsoTop + 1.8;
  const weaponHand = armPose(armSwing, p.weapon, ph, bw);
  if (!front) drawArmAndWeapon(ctx, p, bw, shoulderY, weaponHand, ph, armSwing, skin, false);
  // torso
  ctx.beginPath();
  ctx.moveTo(-bw, torsoTop + 1); ctx.quadraticCurveTo(-bw - 0.6, hip - 1, -bw + 1.2, hip + 1);
  ctx.lineTo(bw - 1.2, hip + 1); ctx.quadraticCurveTo(bw + 0.6, hip - 1, bw, torsoTop + 1);
  ctx.quadraticCurveTo(0, torsoTop - 0.8, -bw, torsoTop + 1); ctx.closePath();
  const tg = ctx.createLinearGradient(-bw, 0, bw, 0); tg.addColorStop(0, shade(tunic, 0.18)); tg.addColorStop(0.6, tunic); tg.addColorStop(1, shade(tunic, -0.35));
  ctx.fillStyle = tg; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.7; ctx.stroke();
  // cloth folds & highlight
  ctx.strokeStyle = rgba('#000', 0.18); ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-1.5, torsoTop + 3); ctx.quadraticCurveTo(-2.2, hip - 4, -1, hip - 1); ctx.moveTo(1.8, torsoTop + 4); ctx.quadraticCurveTo(2.6, hip - 4, 1.6, hip - 1); ctx.stroke();
  ctx.strokeStyle = rgba('#fff', 0.14); ctx.beginPath(); ctx.moveTo(-bw + 1.2, torsoTop + 2.5); ctx.lineTo(-bw + 1.6, hip - 2); ctx.stroke();
  // quiver on the back for archers
  if (p.weapon === 'bow') { ctx.save(); ctx.translate(front ? -bw + 0.5 : bw - 0.5, torsoTop + 3); ctx.rotate(front ? 0.5 : -0.5); rrect(ctx, -1.6, -3, 3.2, 10, 1.2, '#6b4a2a', OUT, 0.5); for (let i = -1; i <= 1; i++) line(ctx, i * 0.9, -3, i * 0.9 + 0.3, -7, '#d8c8a0', 0.6); for (let i = -1; i <= 1; i++) poly(ctx, [[i * 0.9 - 0.7, -6.3], [i * 0.9 + 0.3, -7.5], [i * 0.9 + 0.9, -6]], i % 2 ? '#e05040' : '#f0f0f0'); ctx.restore(); }
  // belt + buckle
  line(ctx, -bw + 0.8, hip - 1.2, bw - 0.8, hip - 1.2, shade(pants, -0.5), 1.3);
  rrect(ctx, -1, hip - 2, 2, 1.8, 0.4, def.faction === 'elves' ? '#d9b857' : '#8a8a8a', OUT, 0.3);
  // armor plate
  if (p.armorColor) {
    ctx.beginPath(); ctx.moveTo(-bw + 0.8, torsoTop + 2); ctx.lineTo(bw - 0.8, torsoTop + 2); ctx.lineTo(bw - 1.6, hip - 2); ctx.lineTo(-bw + 1.6, hip - 2); ctx.closePath();
    const ag = ctx.createLinearGradient(-bw, torsoTop, bw, hip); ag.addColorStop(0, shade(p.armorColor, 0.35)); ag.addColorStop(0.5, p.armorColor); ag.addColorStop(1, shade(p.armorColor, -0.4));
    ctx.fillStyle = ag; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.5; ctx.stroke();
    // pauldrons
    for (const sgn of [-1, 1]) ell(ctx, sgn * (bw - 0.3), torsoTop + 2.2, 2.2, 1.5, shade(p.armorColor, sgn < 0 ? 0.25 : -0.2), OUT, 0.5);
    if (def.faction === 'elves') { // leaf motif
      ctx.strokeStyle = rgba('#d9b857', 0.9); ctx.lineWidth = 0.5; ctx.beginPath(); ctx.moveTo(0, torsoTop + 3); ctx.lineTo(0, hip - 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, torsoTop + 4); ctx.quadraticCurveTo(2, torsoTop + 6, 0, torsoTop + 9); ctx.quadraticCurveTo(-2, torsoTop + 6, 0, torsoTop + 4); ctx.stroke();
    } else if (bulky) { // rivets
      ctx.fillStyle = '#9a9a9a'; for (const [rx, ry] of [[-2.5, torsoTop + 4], [2.5, torsoTop + 4], [-2.2, hip - 4], [2.2, hip - 4]]) { ctx.beginPath(); ctx.arc(rx, ry, 0.55, 0, 7); ctx.fill(); }
    }
  } else if (p.tattoo && front) {
    ctx.strokeStyle = p.tattoo; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-2, torsoTop + 3); ctx.quadraticCurveTo(0, torsoTop + 6, 2, torsoTop + 3); ctx.moveTo(-bw + 1, hip - 4); ctx.lineTo(-1, hip - 5.5); ctx.stroke();
  }
  // off arm (+shield)
  const offShoulderX = -bw + 0.6;
  const offHand = p.weapon === 'bow' ? [-(bw + 3.5), torsoTop + 5 - (armSwing ? 2 : 0)] : [-(bw + 2.2), hip - 2.5];
  line(ctx, offShoulderX, shoulderY, offHand[0], offHand[1], skin, bulky ? 2.6 : 2);
  if (p.shield && front) drawShield(ctx, offHand[0] - 0.5, offHand[1] - 1.5, 3.4, p.shield, p, false);
  // weapon arm in front
  if (front) drawArmAndWeapon(ctx, p, bw, shoulderY, weaponHand, ph, armSwing, skin, true);
  // head
  drawHead(ctx, p, headY, headR, front, def);
  ctx.restore();
}
function armPose(armSwing, weapon, ph, bw) {
  // returns hand position [x,y] relative to origin
  const base = weapon === 'bow' ? [bw + 1.5, -12] : weapon === 'tool' ? [bw + 2.5, -8] : [bw + 2.5, -10];
  if (!armSwing) return base;
  if (weapon === 'bow') return [bw + 2.5 - armSwing * 1.5, -13 + armSwing];
  // raise over head then strike down/forward
  return [bw + 1 + armSwing * -1 + (1 - armSwing) * 3.5, -10 - armSwing * 9 + (1 - armSwing) * 1];
}
function drawArmAndWeapon(ctx, p, bw, shoulderY, hand, ph, armSwing, skin, front) {
  const sx = bw - 0.6;
  line(ctx, sx, shoulderY, hand[0], hand[1], skin, p.build === 'bulky' ? 2.6 : 2);
  ell(ctx, hand[0], hand[1], 1.3, 1.3, skin);
  drawWeapon(ctx, p.weapon, hand[0], hand[1], armSwing, p, ph);
}
function drawWeapon(ctx, w, hx, hy, swing, p, ph) {
  const elf = p.skin === '#f2dcc4';
  const metal = elf ? '#cfd8d8' : '#8d8d8d', metalHi = elf ? '#ffffff' : '#c0c0c0', wood = '#6b4a2a';
  const ang = swing ? (-1.1 + (1 - swing) * 1.6) : -0.25;    // radians from vertical-up
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(ang);
  switch (w) {
    case 'spear': {
      line(ctx, 0, 8, 0, -16, wood, 1.1);
      poly(ctx, [[0, -22], [-1.6, -16.5], [0, -17.5], [1.6, -16.5]], metal, OUT, 0.4);
      if (elf) line(ctx, 0, -14.5, 0, -16, '#d9b857', 1.6);
      break; }
    case 'sword': line(ctx, 0, 2, 0, -4, wood, 1.4); line(ctx, -2.2, -4, 2.2, -4, '#d9b857', 1.2); poly(ctx, [[-1, -4], [1, -4], [0.6, -14], [0, -15.5], [-0.6, -14]], metal, OUT, 0.4); break;
    case 'twin': poly(ctx, [[-0.8, 0], [0.8, 0], [0.5, -11], [0, -12.5], [-0.5, -11]], metal, OUT, 0.4); ctx.rotate(0.8); poly(ctx, [[-0.8, 0], [0.8, 0], [0.5, -9], [0, -10.5], [-0.5, -9]], metal, OUT, 0.4); break;
    case 'axe': line(ctx, 0, 6, 0, -12, wood, 1.4); poly(ctx, [[0, -12.5], [5.5, -14.5], [6.5, -9], [5, -5.5], [0, -7.5]], '#6e6e72', OUT, 0.5); line(ctx, 5.6, -14, 6.4, -9.2, metalHi, 0.6); break;
    case 'cleaver': line(ctx, 0, 4, 0, -4, wood, 1.4); poly(ctx, [[-1.2, -4], [1.8, -4], [4.2, -14], [1.4, -15.5], [-1.2, -9]], '#7a7a74', OUT, 0.5); line(ctx, 1.6, -5, 3.8, -13.5, '#a8a8a0', 0.5); break;
    case 'club': line(ctx, 0, 4, 0, -6, wood, 1.8); ell(ctx, 0.5, -10, 3, 4.5, '#5a4030', OUT, 0.5); for (const [sx2, sy2] of [[-1.5, -12], [1.5, -8], [2, -13]]) line(ctx, sx2, sy2, sx2 * 1.6, sy2 - 1.5, '#aaa', 0.7); break;
    case 'tool': line(ctx, 0, 3, 0, -9, wood, 1.2); poly(ctx, [[0, -9.5], [3.5, -10.5], [3.8, -7.5], [0, -6.5]], '#8d8d8d', OUT, 0.4); break;
    case 'bow': {
      ctx.rotate(-ang + 0.1);
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.quadraticCurveTo(4.5, 0, 0, 10); ctx.strokeStyle = elf ? '#cfb07a' : wood; ctx.lineWidth = 1.3; ctx.stroke();
      const draw = ph && ph.attack !== null && ph.attack !== undefined && ph.attack < 0.6 ? Math.sin(ph.attack / 0.6 * Math.PI) * 3.5 : 0;
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(-draw, 0); ctx.lineTo(0, 10); ctx.strokeStyle = '#e8e8e8'; ctx.lineWidth = 0.5; ctx.stroke();
      if (draw > 0.5) { line(ctx, -draw, 0, 6, 0, '#d8c8a0', 0.7); poly(ctx, [[6, 0], [4.2, -1.2], [4.2, 1.2]], metal); }
      break; }
    case 'staff': line(ctx, 0, 6, 0, -14, wood, 1.4); ell(ctx, 0, -15, 1.6, 1.6, '#7fe0ff', '#fff', 0.5); break;
  }
  ctx.restore();
}
function drawShield(ctx, x, y, r, color, p, back) {
  const elf = p.skin === '#f2dcc4';
  if (elf) {
    // leaf shaped
    ctx.beginPath(); ctx.moveTo(x, y - r - 1); ctx.quadraticCurveTo(x + r + 0.5, y - 1, x, y + r + 1.5); ctx.quadraticCurveTo(x - r - 0.5, y - 1, x, y - r - 1); ctx.closePath();
    ctx.fillStyle = vgrad(ctx, 0, y - r, y + r, shade(color, 0.25), shade(color, -0.3)); ctx.fill(); ctx.strokeStyle = '#d9b857'; ctx.lineWidth = 0.8; ctx.stroke();
    line(ctx, x, y - r, x, y + r, '#d9b857', 0.5);
  } else {
    ctx.beginPath(); ctx.moveTo(x - r, y - r + 1); ctx.lineTo(x + r - 0.5, y - r - 0.5); ctx.lineTo(x + r, y + r - 1); ctx.lineTo(x - r + 0.8, y + r + 0.5); ctx.closePath();
    ctx.fillStyle = vgrad(ctx, 0, y - r, y + r, shade(color, 0.2), shade(color, -0.35)); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.fillStyle = '#9a9a9a'; ctx.beginPath(); ctx.arc(x, y, 0.9, 0, 7); ctx.fill();
    line(ctx, x - r + 1, y - 1, x + r - 1, y + 1, '#2a2a2a', 0.6);
  }
}
function drawHead(ctx, p, hy, r, front, def) {
  const skin = p.skin, elf = def.faction === 'elves', grot = p.build === 'grot';
  // neck
  line(ctx, 0, hy + r - 0.5, 0, hy + r + 2.5, shade(skin, -0.2), 2);
  // ears (elf / orc pointy)
  if (p.helmet !== 'hood' && p.helmet !== 'spiked' && p.helmet !== 'horned') {
    ctx.fillStyle = skin; ctx.strokeStyle = OUT; ctx.lineWidth = 0.5;
    poly(ctx, [[-r + 0.6, hy - 0.5], [-r - 2.6, hy - 1.8 - (elf ? 1.5 : 0)], [-r + 0.4, hy + 1.2]], skin, OUT, 0.5);
    poly(ctx, [[r - 0.6, hy - 0.5], [r + 2.6, hy - 1.8 - (elf ? 1.5 : 0)], [r - 0.4, hy + 1.2]], skin, OUT, 0.5);
  }
  // head
  const hg = ctx.createRadialGradient(-r * 0.4, hy - r * 0.4, r * 0.2, 0, hy, r * 1.2); hg.addColorStop(0, shade(skin, 0.18)); hg.addColorStop(1, shade(skin, -0.25));
  ell(ctx, 0, hy, r, r * 1.05, hg, OUT, 0.7);
  if (front) {
    // eyes
    ctx.fillStyle = grot || !elf ? '#f0d040' : '#2a3a5a';
    if (!elf) ctx.fillStyle = '#e8c040';
    ctx.beginPath(); ctx.arc(-1.1, hy - 0.3, elf ? 0.45 : 0.6, 0, 7); ctx.arc(1.1, hy - 0.3, elf ? 0.45 : 0.6, 0, 7); ctx.fill();
    if (!elf) { ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-1.1, hy - 0.3, 0.25, 0, 7); ctx.arc(1.1, hy - 0.3, 0.25, 0, 7); ctx.fill();
      // heavy brow, nose and a scar
      line(ctx, -2.2, hy - 1.3, -0.3, hy - 1.0, shade(skin, -0.5), 0.8); line(ctx, 0.3, hy - 1.0, 2.2, hy - 1.3, shade(skin, -0.5), 0.8);
      ell(ctx, 0, hy + 0.6, 0.9, 0.6, shade(skin, -0.25));
      if (!grot) line(ctx, 1.6, hy - 2.2, 2.4, hy + 0.4, '#5a2a2a', 0.5);
    } else { ctx.strokeStyle = shade(skin, -0.45); ctx.lineWidth = 0.45; ctx.beginPath(); ctx.moveTo(-1.8, hy - 1.2); ctx.lineTo(-0.5, hy - 1.4); ctx.moveTo(0.5, hy - 1.4); ctx.lineTo(1.8, hy - 1.2); ctx.moveTo(0, hy - 0.3); ctx.lineTo(0.3, hy + 0.8); ctx.stroke(); }
    // mouth / tusks
    if (!elf) {
      line(ctx, -1.4, hy + 1.6, 1.4, hy + 1.6, '#3a1a1a', 0.7);
      ctx.fillStyle = '#f0e8d0'; poly(ctx, [[-1.3, hy + 1.6], [-1.8, hy + 0.3], [-0.8, hy + 1.6]], '#f0e8d0'); poly(ctx, [[1.3, hy + 1.6], [1.8, hy + 0.3], [0.8, hy + 1.6]], '#f0e8d0');
    } else line(ctx, -0.7, hy + 1.6, 0.7, hy + 1.6, shade(skin, -0.45), 0.5);
  }
  // hair
  if (p.hair && p.helmet !== 'hood' && p.helmet !== 'spiked' && p.helmet !== 'horned' && p.helmet !== 'cap') {
    ctx.fillStyle = p.hair; ctx.beginPath();
    ctx.ellipse(0, hy - r * 0.55, r + 0.4, r * 0.75, 0, Math.PI, Math.PI * 2); ctx.fill();
    if (elf) { // long hair down the back/sides
      ctx.beginPath(); ctx.moveTo(-r - 0.4, hy - 0.5); ctx.lineTo(-r - 0.8, hy + 4); ctx.lineTo(-r + 1.2, hy + 2.5); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(r + 0.4, hy - 0.5); ctx.lineTo(r + 0.8, hy + 4); ctx.lineTo(r - 1.2, hy + 2.5); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = OUT; ctx.lineWidth = 0.5; ctx.beginPath(); ctx.ellipse(0, hy - r * 0.55, r + 0.4, r * 0.75, 0, Math.PI, Math.PI * 2); ctx.stroke();
  }
  // helmets
  const metal = elf ? '#c9d2d4' : '#5a5a5e';
  switch (p.helmet) {
    case 'leaf': {
      ctx.beginPath(); ctx.ellipse(0, hy - r * 0.35, r + 0.6, r * 0.95, 0, Math.PI, Math.PI * 2); ctx.closePath();
      ctx.fillStyle = vgrad(ctx, 0, hy - 2 * r, hy, shade(metal, 0.3), shade(metal, -0.2)); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.6; ctx.stroke();
      // leaf crest
      ctx.beginPath(); ctx.moveTo(0, hy - r - 0.5); ctx.quadraticCurveTo(2.2, hy - r - 3.5, 0.5, hy - r - 5.5); ctx.quadraticCurveTo(-1.5, hy - r - 3.5, 0, hy - r - 0.5); ctx.fillStyle = '#d9b857'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.4; ctx.stroke();
      line(ctx, -r - 0.5, hy - 0.5, -r - 0.5, hy + 1.5, metal, 1); line(ctx, r + 0.5, hy - 0.5, r + 0.5, hy + 1.5, metal, 1);
      break; }
    case 'hood': {
      ctx.beginPath(); ctx.moveTo(-r - 1.2, hy + 1.5); ctx.quadraticCurveTo(-r - 1, hy - r - 1, 0, hy - r - 2); ctx.quadraticCurveTo(r + 1, hy - r - 1, r + 1.2, hy + 1.5); ctx.quadraticCurveTo(0, hy + 3, -r - 1.2, hy + 1.5);
      const hc = p.cloak || p.tunic; ctx.fillStyle = vgrad(ctx, 0, hy - r - 2, hy + 2, shade(hc, 0.15), shade(hc, -0.35)); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.6; ctx.stroke();
      if (front) { ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(0, hy - 0.3, r - 0.6, r - 0.4, 0, 0, 7); ctx.fill(); ctx.fillStyle = elf ? '#dfe8ff' : '#f0d040'; ctx.beginPath(); ctx.arc(-1, hy - 0.2, 0.45, 0, 7); ctx.arc(1, hy - 0.2, 0.45, 0, 7); ctx.fill(); }
      break; }
    case 'cap': {
      ctx.beginPath(); ctx.ellipse(0, hy - r * 0.4, r + 0.5, r * 0.9, 0, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fillStyle = '#6b4a2a'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.6; ctx.stroke();
      line(ctx, -r - 0.5, hy - 0.5, r + 0.5, hy - 0.5, '#3a2a1a', 1);
      break; }
    case 'spiked': {
      ctx.beginPath(); ctx.ellipse(0, hy - r * 0.3, r + 0.7, r * 1.0, 0, Math.PI, Math.PI * 2); ctx.closePath();
      ctx.fillStyle = vgrad(ctx, 0, hy - 2 * r, hy, shade(metal, 0.3), shade(metal, -0.3)); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.6; ctx.stroke();
      for (const [sx, sy, a] of [[0, hy - r - 0.5, 0], [-r - 0.2, hy - r + 1.5, -0.7], [r + 0.2, hy - r + 1.5, 0.7]]) { ctx.save(); ctx.translate(sx, sy); ctx.rotate(a); poly(ctx, [[-0.9, 0], [0.9, 0], [0, -3.2]], '#8a8a8a', OUT, 0.4); ctx.restore(); }
      line(ctx, -r - 0.7, hy - 0.5, r + 0.7, hy - 0.5, '#3a3a3a', 0.8);
      break; }
    case 'horned': {
      ctx.beginPath(); ctx.ellipse(0, hy - r * 0.2, r + 0.9, r * 1.05, 0, Math.PI, Math.PI * 2); ctx.closePath();
      ctx.fillStyle = vgrad(ctx, 0, hy - 2 * r, hy, '#4a4a50', '#1e1e22'); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.6; ctx.stroke();
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * (r - 0.5), hy - r + 0.5); ctx.quadraticCurveTo(s * (r + 4), hy - r - 1, s * (r + 2.5), hy - r - 6); ctx.quadraticCurveTo(s * (r + 2), hy - r - 1, s * (r + 0.3), hy - r + 1.5); ctx.closePath(); ctx.fillStyle = '#e6dcc0'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.5; ctx.stroke(); }
      if (front) { ctx.fillStyle = '#ff5030'; ctx.beginPath(); ctx.arc(-1.1, hy - 0.3, 0.6, 0, 7); ctx.arc(1.1, hy - 0.3, 0.6, 0, 7); ctx.fill(); }
      break; }
    case 'antler': {
      ctx.strokeStyle = '#e8dcb8'; ctx.lineWidth = 0.9;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 1.5, hy - r); ctx.quadraticCurveTo(s * 3.5, hy - r - 3, s * 3, hy - r - 7); ctx.moveTo(s * 2.6, hy - r - 2.5); ctx.lineTo(s * 5, hy - r - 4.5); ctx.moveTo(s * 2.9, hy - r - 4.8); ctx.lineTo(s * 1.2, hy - r - 7); ctx.stroke(); }
      ctx.beginPath(); ctx.ellipse(0, hy - r * 0.45, r + 0.4, r * 0.6, 0, Math.PI, Math.PI * 2); ctx.closePath(); ctx.fillStyle = '#d9b857'; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.5; ctx.stroke();
      break; }
  }
  if (p.hero) { // subtle glow
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba('#ffe9a0', 0.12); ctx.beginPath(); ctx.arc(0, hy - 2, r + 6, 0, 7); ctx.fill(); ctx.restore();
  }
}

// -------- mounts --------
function drawMounted(ctx, p, view, ph, def) {
  const m = p.mount;
  drawMount(ctx, m, view, ph);
  const seatY = m === 'greatstag' ? -13 : m === 'boar' ? -8 : m === 'warg' ? -8.5 : -11;
  ctx.save(); ctx.translate(-1, seatY);
  drawHumanoid(ctx, p, view, ph, def, { mounted: true, scale: 0.86 });
  ctx.restore();
}
function drawMount(ctx, m, view, ph, riderless = false) {
  const sw = Math.sin((ph.walk || 0) * Math.PI * 2), cw = Math.cos((ph.walk || 0) * Math.PI * 2);
  const gallop = ph.walk ? Math.abs(cw) * 1.0 : 0;
  const cols = {
    horse: { body: '#7a4e2c', dark: '#4a2c15', mane: '#2a1a0c', hoof: '#2a2020' },
    stag: { body: '#b58a5a', dark: '#7a5a38', mane: '#5a3a20', hoof: '#2a2020' },
    greatstag: { body: '#e8e4d8', dark: '#a8a090', mane: '#c8c0b0', hoof: '#3a3a3a' },
    boar: { body: '#4a3328', dark: '#2a1a12', mane: '#1a100a', hoof: '#1a1010' },
    warg: { body: '#5a5a62', dark: '#2e2e34', mane: '#1e1e22', hoof: '#1a1a1a' },
  }[m];
  const long = m === 'greatstag' ? 11 : m === 'boar' ? 8.5 : 9.5, tall = m === 'greatstag' ? 5.5 : m === 'boar' ? 4.5 : m === 'warg' ? 4.2 : 5;
  const bodyY = -(m === 'boar' ? 6 : m === 'warg' ? 6.5 : m === 'greatstag' ? 10 : 8.5) - gallop * 0.5;
  // legs (4): back pair then front pair
  const legY0 = bodyY + tall - 1.5;
  const legs = [[-long + 2.5, sw * 2.5], [-long + 4.5, -sw * 2.2], [long - 4.5, -sw * 2.4], [long - 2.5, sw * 2.6]];
  ctx.lineCap = 'round';
  legs.forEach(([lx, off], i) => {
    const w = m === 'boar' ? 2.2 : m === 'warg' ? 2.3 : 1.9;
    line(ctx, lx, legY0, lx + off, 0, i % 2 ? cols.body : cols.dark, w);
    ell(ctx, lx + off, 0, 1.3, 0.8, cols.hoof);
  });
  // tail
  if (m === 'warg') { ctx.beginPath(); ctx.moveTo(-long + 1, bodyY); ctx.quadraticCurveTo(-long - 4, bodyY - 3, -long - 2.5, bodyY - 6); ctx.strokeStyle = cols.mane; ctx.lineWidth = 2.6; ctx.stroke(); }
  else if (m === 'boar') line(ctx, -long + 1, bodyY - 1, -long - 2, bodyY + 1, cols.mane, 1);
  else { ctx.beginPath(); ctx.moveTo(-long + 1, bodyY - 1); ctx.quadraticCurveTo(-long - 3, bodyY + 1 + sw, -long - 2.5, bodyY + 6); ctx.strokeStyle = cols.mane; ctx.lineWidth = 1.8; ctx.stroke(); }
  // body
  const bg = ctx.createLinearGradient(0, bodyY - tall, 0, bodyY + tall); bg.addColorStop(0, shade(cols.body, 0.2)); bg.addColorStop(1, shade(cols.body, -0.35));
  ctx.beginPath(); ctx.ellipse(0, bodyY, long, tall, 0, 0, 7); ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.8; ctx.stroke();
  if (m === 'boar') { // bristles
    ctx.strokeStyle = cols.mane; ctx.lineWidth = 0.8; for (let i = -5; i <= 5; i += 2) line(ctx, i, bodyY - tall + 0.5, i - 0.8, bodyY - tall - 2, cols.mane, 0.8);
  }
  if (m === 'warg') { ctx.fillStyle = cols.mane; ctx.beginPath(); ctx.ellipse(0, bodyY - tall + 1.2, long * 0.7, 1.6, 0, Math.PI, 7); ctx.fill(); }
  // saddle cloth with trim
  if (!riderless) { const sc = m === 'boar' || m === 'warg' ? '#5a1f1f' : (m === 'greatstag' ? '#c9a74a' : '#2f5d3a'); rrect(ctx, -4.5, bodyY - tall + 0.5, 8, tall + 2, 1.5, sc, OUT, 0.5); rrect(ctx, -3.5, bodyY - tall + 1.5, 6, tall, 1, null, m === 'boar' || m === 'warg' ? '#8a8a8a' : '#d9b857', 0.5); line(ctx, -4.5, bodyY + 1, -4.8, bodyY + 4, '#3a2a1a', 1); }
  // belly shading
  ell(ctx, 0, bodyY + tall * 0.55, long * 0.75, tall * 0.35, 'rgba(0,0,0,0.18)');
  // neck + head
  const nx = long - 1.5, ny = bodyY - tall + 1;
  const hx = long + (m === 'boar' ? 3.5 : 4.5), hy = m === 'boar' ? bodyY - 1 : m === 'warg' ? bodyY - 4.5 : bodyY - 8.5;
  ctx.beginPath(); ctx.moveTo(nx - 2, ny + 3); ctx.lineTo(hx - 1.5, hy + 1.5); ctx.lineTo(hx + 0.5, hy + 3.5); ctx.lineTo(nx + 1.5, ny + 5); ctx.closePath(); ctx.fillStyle = cols.body; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.7; ctx.stroke();
  if (m === 'horse' || m === 'stag' || m === 'greatstag') { ctx.strokeStyle = cols.mane; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(nx - 1.5, ny + 1.5); ctx.lineTo(hx - 2.2, hy + 0.5); ctx.stroke(); ctx.lineWidth = 0.7; for (let i = 0; i < 4; i++) { const t = i / 4; const x = nx - 1.5 + (hx - 2.2 - nx + 1.5) * t, y = ny + 1.5 + (hy + 0.5 - ny - 1.5) * t; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y + 2.5); ctx.stroke(); } }
  if (!riderless) { ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-1, bodyY - tall - 2); ctx.quadraticCurveTo(hx - 3, hy + 3, hx + 1, hy + 1.5); ctx.stroke(); }
  // head shape
  if (m === 'boar') {
    ell(ctx, hx, hy, 3.4, 2.6, cols.body, OUT, 0.7); ell(ctx, hx + 2.8, hy + 1, 1.3, 1, '#2a1a12');
    line(ctx, hx + 1.5, hy + 1.5, hx + 3.5, hy - 1.5, '#f0e8d0', 1); ctx.fillStyle = '#ff3a2a'; ctx.beginPath(); ctx.arc(hx + 1, hy - 0.5, 0.5, 0, 7); ctx.fill();
  } else if (m === 'warg') {
    ell(ctx, hx, hy, 3.6, 2.4, cols.body, OUT, 0.7); poly(ctx, [[hx + 1, hy + 0.5], [hx + 5.5, hy + 1.5], [hx + 1, hy + 2.2]], cols.dark, OUT, 0.5);
    poly(ctx, [[hx - 2, hy - 1.5], [hx - 1.5, hy - 4.5], [hx, hy - 1.8]], cols.body, OUT, 0.5); ctx.fillStyle = '#ffd040'; ctx.beginPath(); ctx.arc(hx + 0.5, hy - 0.5, 0.55, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff'; for (let i = 0; i < 3; i++) poly(ctx, [[hx + 2 + i, hy + 2], [hx + 2.4 + i, hy + 3.2], [hx + 2.8 + i, hy + 2]], '#fff');
  } else {
    ctx.beginPath(); ctx.moveTo(hx - 2.5, hy - 2); ctx.lineTo(hx + 3.5, hy + 1); ctx.lineTo(hx + 3, hy + 3.5); ctx.lineTo(hx - 2, hy + 3); ctx.closePath(); ctx.fillStyle = cols.body; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(hx - 0.5, hy, 0.6, 0, 7); ctx.fill();
    poly(ctx, [[hx - 2.5, hy - 1.5], [hx - 2.8, hy - 4.5], [hx - 1, hy - 2]], cols.body, OUT, 0.4);
    if (m === 'stag' || m === 'greatstag') {
      const big = m === 'greatstag' ? 1.5 : 1;
      ctx.strokeStyle = m === 'greatstag' ? '#f0e8d0' : '#d8c8a8'; ctx.lineWidth = 0.9 * big;
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(hx - 1.5 + s * 1.2, hy - 2); ctx.quadraticCurveTo(hx - 2 + s * 3 * big, hy - 6 * big, hx - 3 + s * 2.5 * big, hy - 9 * big); ctx.moveTo(hx - 1.5 + s * 2.2 * big, hy - 4.5 * big); ctx.lineTo(hx - 1 + s * 4.5 * big, hy - 6 * big); ctx.moveTo(hx - 2 + s * 2.5 * big, hy - 7 * big); ctx.lineTo(hx + s * 1.5 * big, hy - 9 * big); ctx.stroke(); }
      if (m === 'greatstag') { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba('#d0f0ff', 0.12); ctx.beginPath(); ctx.ellipse(0, bodyY, long + 4, tall + 5, 0, 0, 7); ctx.fill(); ctx.restore(); }
    }
  }
}

// -------- giants --------
function drawGiant(ctx, p, view, ph, def) {
  const sw = Math.sin((ph.walk || 0) * Math.PI * 2);
  const bob = ph.walk ? Math.abs(Math.cos(ph.walk * Math.PI * 2)) * 1.2 : 0;
  let swing = 0; if (ph.attack !== null && ph.attack !== undefined) swing = ph.attack < 0.5 ? ph.attack * 2 : 1 - (ph.attack - 0.5) * 4;
  const front = view === 'f';
  if (p.giant === 'troll') {
    const skin = '#6a7a5a', dark = '#3a4a30';
    // legs
    line(ctx, -5, -12, -6 + sw * 3, 0, dark, 5); line(ctx, 5, -12, 6 - sw * 3, 0, dark, 5);
    ell(ctx, -6 + sw * 3, 0.5, 3.2, 1.6, '#2a3020'); ell(ctx, 6 - sw * 3, 0.5, 3.2, 1.6, '#2a3020');
    ctx.save(); ctx.translate(0, -bob);
    // loincloth
    poly(ctx, [[-7, -13], [7, -13], [6, -6], [-6, -6]], '#4a3320', OUT, 0.7);
    // body
    const bg = ctx.createRadialGradient(-3, -24, 2, 0, -20, 16); bg.addColorStop(0, shade(skin, 0.25)); bg.addColorStop(1, shade(skin, -0.35));
    ctx.beginPath(); ctx.moveTo(-9, -14); ctx.quadraticCurveTo(-12, -24, -7, -31); ctx.lineTo(7, -31); ctx.quadraticCurveTo(12, -24, 9, -14); ctx.closePath(); ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.9; ctx.stroke();
    ell(ctx, 0, -19, 6.5, 5.5, rgba('#8a9a7a', 0.6)); // belly
    // arms: off arm hanging, weapon arm
    line(ctx, -8, -28, -12, -12, skin, 4.5); ell(ctx, -12.5, -11, 2.6, 2.2, dark);
    const hx = 10 + (1 - swing) * 3, hy = -18 - swing * 14;
    line(ctx, 8, -28, hx, hy, skin, 4.5); ell(ctx, hx, hy, 2.6, 2.2, dark);
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(swing ? -1.2 + (1 - swing) * 1.8 : -0.2);
    line(ctx, 0, 4, 0, -10, '#5a4030', 3); ell(ctx, 0.5, -15, 4.5, 7, '#6a4a30', OUT, 0.7);
    for (const [a, b] of [[-2, -18], [2.5, -12], [1, -20]]) line(ctx, a, b, a * 1.5, b - 2, '#bbb', 1);
    ctx.restore();
    // head
    const hg2 = ctx.createRadialGradient(-1.5, -35, 1, 0, -33, 6); hg2.addColorStop(0, shade(skin, 0.25)); hg2.addColorStop(1, shade(skin, -0.25));
    ell(ctx, 0, -33, 4.8, 4.2, hg2, OUT, 0.8);
    poly(ctx, [[-4.5, -33], [-7.5, -36], [-4, -31.5]], skin, OUT, 0.5); poly(ctx, [[4.5, -33], [7.5, -36], [4, -31.5]], skin, OUT, 0.5);
    // warts
    ctx.fillStyle = shade(skin, -0.35); for (const [wx, wy] of [[-2.5, -36], [3, -35.5], [1, -37.5], [-6, -20], [7, -24]]) { ctx.beginPath(); ctx.arc(wx, wy, 0.7, 0, 7); ctx.fill(); }
    if (front) {
      ctx.fillStyle = '#e8c040'; ctx.beginPath(); ctx.arc(-1.7, -33.8, 0.9, 0, 7); ctx.arc(1.7, -33.8, 0.9, 0, 7); ctx.fill(); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(-1.7, -33.8, 0.4, 0, 7); ctx.arc(1.7, -33.8, 0.4, 0, 7); ctx.fill();
      line(ctx, -3, -35.3, -0.6, -34.8, shade(skin, -0.5), 1); line(ctx, 0.6, -34.8, 3, -35.3, shade(skin, -0.5), 1);
      ell(ctx, 0, -32, 1.4, 1, shade(skin, -0.3));
      line(ctx, -2.8, -30.2, 2.8, -30.2, '#2a1a1a', 1);
      ctx.fillStyle = '#f0e8d0'; poly(ctx, [[-2.4, -30.4], [-3, -27.6], [-1.5, -30.4]], '#f0e8d0'); poly(ctx, [[2.4, -30.4], [3, -27.6], [1.5, -30.4]], '#f0e8d0');
    } else { line(ctx, -3, -36, 3, -36, shade(skin, -0.3), 1); }
    ell(ctx, 0, -17.5, 1, 0.8, shade(skin, -0.35));
    ctx.restore();
  } else { // treekin
    const bark = '#5a4632', barkD = '#2e2218', leaf = '#4f8f3a';
    // root legs
    for (const [lx, off] of [[-5, sw * 2], [5, -sw * 2], [0, sw]]) { line(ctx, lx * 0.6, -10, lx + off, 0, barkD, 3.2); line(ctx, lx + off, 0, lx + off + Math.sign(lx || 1) * 3, 1, barkD, 2); }
    ctx.save(); ctx.translate(0, -bob);
    const bg = ctx.createLinearGradient(-8, 0, 8, 0); bg.addColorStop(0, shade(bark, 0.25)); bg.addColorStop(0.5, bark); bg.addColorStop(1, shade(bark, -0.4));
    ctx.beginPath(); ctx.moveTo(-7, -10); ctx.quadraticCurveTo(-9, -22, -6, -32); ctx.lineTo(6, -32); ctx.quadraticCurveTo(9, -22, 7, -10); ctx.closePath(); ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.9; ctx.stroke();
    // bark lines
    ctx.strokeStyle = barkD; ctx.lineWidth = 0.7; for (const x of [-4, -1, 2.5, 5]) { ctx.beginPath(); ctx.moveTo(x, -12); ctx.quadraticCurveTo(x + 1, -20, x - 0.5, -30); ctx.stroke(); }
    // arms (branches)
    const hx = 11 + (1 - swing) * 2, hy = -22 - swing * 12;
    ctx.strokeStyle = bark; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(6, -27); ctx.quadraticCurveTo(10, -24, hx, hy); ctx.stroke();
    ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + 2, hy - 4); ctx.moveTo(hx, hy); ctx.lineTo(hx + 3.5, hy + 1); ctx.moveTo(hx, hy); ctx.lineTo(hx - 1, hy - 4.5); ctx.stroke();
    ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(-6, -27); ctx.quadraticCurveTo(-11, -22, -12, -14); ctx.stroke();
    ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-12, -14); ctx.lineTo(-14, -11); ctx.moveTo(-12, -14); ctx.lineTo(-10, -10); ctx.stroke();
    // face
    if (front) { ctx.fillStyle = '#9fe060'; ctx.shadowColor = '#9fe060'; ctx.shadowBlur = 4; ctx.beginPath(); ctx.arc(-2.2, -26, 0.9, 0, 7); ctx.arc(2.2, -26, 0.9, 0, 7); ctx.fill(); ctx.shadowBlur = 0; line(ctx, -1.5, -21, 1.5, -21.5, barkD, 1); }
    // canopy
    for (const [cx, cy, r, c] of [[-4, -35, 5, shade(leaf, -0.2)], [4, -36, 5.5, leaf], [0, -40, 5, shade(leaf, 0.15)], [-1, -34, 4, shade(leaf, 0.05)]]) { ell(ctx, cx, cy, r, r * 0.85, c, OUT, 0.5); }
    ctx.fillStyle = '#d9b857'; for (const [cx, cy] of [[-5, -33], [5, -38], [1, -43]]) { ctx.beginPath(); ctx.arc(cx, cy, 0.7, 0, 7); ctx.fill(); }
    ctx.restore();
  }
}

// -------- beasts --------
function drawBeast(ctx, p, view, ph, def) {
  const b = p.beast;
  if (b === 'deer') {
    const sw = Math.sin((ph.walk || 0) * Math.PI * 2);
    const body = '#b48a5a', dark = '#7a5a38';
    for (const [lx, off, c] of [[-5, sw * 2.2, dark], [-3.5, -sw * 2, body], [3.5, -sw * 2.2, dark], [5, sw * 2.4, body]]) { line(ctx, lx, -7, lx + off, 0, c, 1.4); }
    ell(ctx, 0, -9, 7, 3.6, vgrad(ctx, 0, -13, -5, shade(body, 0.2), shade(body, -0.3)), OUT, 0.7);
    ell(ctx, -1, -8, 3.5, 2, rgba('#f0e0c0', 0.6));
    ctx.beginPath(); ctx.moveTo(5, -11); ctx.lineTo(9, -17); ctx.lineTo(11, -16); ctx.lineTo(8, -9); ctx.closePath(); ctx.fillStyle = body; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.6; ctx.stroke();
    ell(ctx, 10.5, -17.5, 2.6, 1.8, body, OUT, 0.6); ctx.fillStyle = '#1a1a1a'; ctx.beginPath(); ctx.arc(10.8, -18, 0.5, 0, 7); ctx.fill();
    poly(ctx, [[8.5, -18.5], [7.5, -21.5], [9.5, -19.5]], body, OUT, 0.4);
    if (def.sprite.antlers !== false) { ctx.strokeStyle = '#d8c8a8'; ctx.lineWidth = 0.7; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(10 + s, -19.5); ctx.quadraticCurveTo(10 + s * 2.5, -23, 9 + s * 2, -26); ctx.moveTo(10 + s * 1.5, -22); ctx.lineTo(11 + s * 3, -24); ctx.stroke(); } }
    line(ctx, -7, -10, -9, -8, dark, 1.2);
  } else if (b === 'boar') {
    drawMount(ctx, 'boar', view, ph, true);
  } else if (b === 'spider') {
    const sw = Math.sin((ph.walk || 0) * Math.PI * 2);
    const body = '#1e1a22', hi = '#3a3040';
    ctx.strokeStyle = body; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const t = (i - 1.5) / 1.5, s = i % 2 ? sw : -sw;
      for (const side of [-1, 1]) {
        const ax = side * (4 + Math.abs(t) * 2), ay = -6 + t * 1.5;
        const kx = side * (9 + Math.abs(t) * 3) + s * side, ky = -12 + t * 2;
        const fx = side * (12 + Math.abs(t) * 2.5) + s * 1.5 * side, fy = 0 + t * 2;
        ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(kx, ky); ctx.lineTo(fx, fy); ctx.stroke();
      }
    }
    ell(ctx, -2, -7, 7, 5, vgrad(ctx, 0, -12, -2, hi, body), OUT, 0.8);
    ell(ctx, 6, -6, 3.5, 2.8, body, OUT, 0.7);
    ctx.fillStyle = '#ff3030'; for (const [ex, ey] of [[7, -7.5], [8.5, -6.8], [5.5, -7.8], [7.5, -5.8]]) { ctx.beginPath(); ctx.arc(ex, ey, 0.55, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#e0e0e0'; poly(ctx, [[8, -4.5], [9.5, -2.5], [8.8, -4.8]], '#ddd'); poly(ctx, [[6, -4.2], [5, -2.2], [6.6, -4.6]], '#ddd');
    ctx.strokeStyle = '#6a4a6a'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(-6, -8); ctx.lineTo(-2, -10); ctx.lineTo(2, -8); ctx.stroke();
  }
}

// ---------------------------------------------------------------------
//  TREES & RESOURCE NODES   (anchor: bottom-centre = tile centre)
// ---------------------------------------------------------------------
export const TREE_W = 72, TREE_H = 96, TREE_ANCHOR_Y = 86;
export const TREE_VARIANTS = 8;
export function treeSprite(style, variant) {
  const v = variant % TREE_VARIANTS;
  const key = `tree|${style}|${v}`;
  return cached(key, TREE_W * 1.5, TREE_H * 1.5, (ctx) => {
    ctx.scale(1.5, 1.5);
    ctx.translate(TREE_W / 2, TREE_ANCHOR_Y);
    const rng = new RNG(v * 977 + style.length * 31 + 5);
    drawTree(ctx, style, rng);
  });
}
export function treeStyle(biome, variant = 0) { return biome < 0.33 ? 'mallorn' : biome < 0.62 ? ((variant % 3 === 0) ? 'pine' : 'oak') : 'blight'; }

// leafy canopy: silhouette of blobs filled with many small shaded leaf clusters
function leafCanopy(ctx, blobs, pal, rng, opts = {}) {
  const [dark, mid, light, extra] = pal;
  const density = opts.density ?? 1;
  // dark silhouette
  ctx.fillStyle = dark;
  for (const [cx, cy, r] of blobs) { ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.9, 0, 0, 7); ctx.fill(); }
  // leaf clusters
  for (const [cx, cy, r] of blobs) {
    const n = Math.round(r * r * 0.22 * density);
    for (let i = 0; i < n; i++) {
      const a = rng.next() * Math.PI * 2, d = Math.sqrt(rng.next()) * r * 0.95;
      const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * 0.9;
      // lighting: top-left light
      const lit = clamp01(0.5 - (x - cx) / r * 0.35 - (y - cy) / r * 0.55 + rng.range(-0.15, 0.15));
      const col = lit > 0.72 ? light : lit > 0.35 ? mid : dark;
      ctx.fillStyle = extra && rng.next() < 0.12 ? extra : col;
      const lr = 1.6 + rng.next() * 1.8;
      ctx.beginPath(); ctx.ellipse(x, y, lr, lr * 0.75, rng.next() * 3, 0, 7); ctx.fill();
    }
  }
  // rim highlight on the lit edge
  ctx.strokeStyle = rgba(light, 0.35); ctx.lineWidth = 1.2;
  for (const [cx, cy, r] of blobs) { ctx.beginPath(); ctx.ellipse(cx - 1, cy - 1, r * 0.9, r * 0.8, 0, Math.PI * 1.05, Math.PI * 1.7); ctx.stroke(); }
  if (opts.specks) { ctx.fillStyle = opts.specks; for (let i = 0; i < 7; i++) { const [cx, cy, r] = blobs[rng.int(0, blobs.length - 1)]; const a = rng.next() * 7; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.6, 0.8, 0, 7); ctx.fill(); } }
}
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
function trunkShape(ctx, pts, color, dark, light) {
  // pts: polygon outline (bottom-left .. top .. bottom-right)
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath();
  const g = ctx.createLinearGradient(-5, 0, 5, 0); g.addColorStop(0, light); g.addColorStop(0.45, color); g.addColorStop(1, dark);
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(30,20,10,0.75)'; ctx.lineWidth = 0.7; ctx.stroke();
}
function drawTree(ctx, style, rng) {
  const sz = rng.range(0.85, 1.15), lean = rng.range(-2, 2);
  // ground shadow
  ctx.save(); ctx.globalCompositeOperation = 'destination-over'; ctx.restore();
  const shadowG = ctx.createRadialGradient(2, 1, 1, 2, 1, 11 * sz); shadowG.addColorStop(0, 'rgba(0,0,0,0.35)'); shadowG.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = shadowG; ctx.beginPath(); ctx.ellipse(2, 1, 11 * sz, 4.5 * sz, 0, 0, 7); ctx.fill();
  if (style === 'mallorn') {
    const trunk = '#cfc9bb', tD = '#8e887a', tL = '#f2eee4';
    // roots
    ctx.strokeStyle = tD; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (const [dx, dy] of [[-6, 1], [-3, 2.5], [4, 2], [7, 0.5]]) { ctx.beginPath(); ctx.moveTo(dx * 0.4, -3); ctx.quadraticCurveTo(dx * 0.8, 0, dx * sz, dy); ctx.stroke(); }
    trunkShape(ctx, [[-3.4 * sz, 0], [-2.4 * sz, -14 * sz], [-1.6 * sz + lean, -32 * sz], [1.6 * sz + lean, -32 * sz], [2.4 * sz, -14 * sz], [3.4 * sz, 0]], trunk, tD, tL);
    // bark marks
    ctx.strokeStyle = 'rgba(90,80,70,0.35)'; ctx.lineWidth = 0.6; for (let i = 0; i < 4; i++) { const y = -4 - i * 7 * sz; ctx.beginPath(); ctx.moveTo(-1.5 + (i % 2), y); ctx.quadraticCurveTo(0.5, y - 2, 1.5 - (i % 2), y - 4); ctx.stroke(); }
    // branches
    ctx.strokeStyle = trunk; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    for (const [bx, by, ex, ey] of [[-1, -24, -11, -34], [1, -27, 9, -37], [0, -30, -3, -41]]) { ctx.beginPath(); ctx.moveTo(bx * sz + lean * 0.7, by * sz); ctx.quadraticCurveTo((bx + ex) / 2 * sz + lean, (by + ey) / 2 * sz - 2, ex * sz + lean, ey * sz); ctx.stroke(); }
    const blobs = [[-10 + lean, -38, 9.5], [9 + lean, -40, 10], [0 + lean, -47, 10.5], [-4 + lean, -34, 7.5], [5 + lean, -33, 7.5], [0 + lean, -40, 9]].map(([x, y, r]) => [x * sz, y * sz, r * sz]);
    leafCanopy(ctx, blobs, ['#8a7626', '#d9b857', '#f5e6a0', '#a8b84a'], rng, { specks: 'rgba(255,250,220,0.95)' });
  } else if (style === 'oak') {
    const trunk = '#6a4a2e', tD = '#3a2814', tL = '#9a7a55';
    ctx.strokeStyle = tD; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
    for (const [dx, dy] of [[-6, 1], [-2, 2.5], [5, 2], [7, 0]]) { ctx.beginPath(); ctx.moveTo(dx * 0.4, -3); ctx.quadraticCurveTo(dx * 0.8, 0, dx * sz, dy); ctx.stroke(); }
    trunkShape(ctx, [[-4 * sz, 0], [-2.6 * sz, -12 * sz], [-2 * sz + lean, -23 * sz], [2 * sz + lean, -23 * sz], [2.6 * sz, -12 * sz], [4 * sz, 0]], trunk, tD, tL);
    ctx.strokeStyle = 'rgba(30,20,10,0.4)'; ctx.lineWidth = 0.7; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(-1.5 + i * 1.3, -2); ctx.quadraticCurveTo(-1 + i * 1.3, -10, -0.5 + i * 1.3 + lean * 0.5, -20); ctx.stroke(); }
    ctx.strokeStyle = trunk; ctx.lineWidth = 2; for (const [bx, by, ex, ey] of [[-1, -18, -9, -27], [1, -20, 8, -28]]) { ctx.beginPath(); ctx.moveTo(bx * sz + lean * 0.6, by * sz); ctx.quadraticCurveTo((bx + ex) / 2 * sz + lean, (by + ey) / 2 * sz, ex * sz + lean, ey * sz); ctx.stroke(); }
    const blobs = [[-9 + lean, -29, 9], [9 + lean, -30, 9], [0 + lean, -37, 10], [-3 + lean, -26, 7], [5 + lean, -25, 7], [0 + lean, -30, 8]].map(([x, y, r]) => [x * sz, y * sz, r * sz]);
    leafCanopy(ctx, blobs, ['#22451c', '#4f8a3a', '#9ccf63', '#6aa040'], rng);
  } else if (style === 'pine') {
    const trunk = '#5a3f2a', tD = '#2e1e10', tL = '#8a6a48';
    trunkShape(ctx, [[-2.6 * sz, 0], [-1.6 * sz, -20 * sz], [-0.8 * sz + lean, -44 * sz], [0.8 * sz + lean, -44 * sz], [1.6 * sz, -20 * sz], [2.6 * sz, 0]], trunk, tD, tL);
    const tiers = [[-10, 20, 16], [-22, 16, 14], [-33, 12, 12], [-42, 8, 10]];
    for (let t = 0; t < tiers.length; t++) {
      const [ty, hw, hh] = tiers[t]; const y = ty * sz, w = hw * sz, h = hh * sz, lx = lean * (t / 3);
      // jagged needle tier
      ctx.beginPath(); ctx.moveTo(lx, y - h);
      for (let k = 0; k <= 8; k++) { const f = k / 8; ctx.lineTo(lx + w * f, y - h + h * f + (k % 2 ? -2.5 : 0)); }
      for (let k = 8; k >= 0; k--) { const f = k / 8; ctx.lineTo(lx - w * f, y - h + h * f + (k % 2 ? -2.5 : 0)); }
      ctx.closePath();
      const g = ctx.createLinearGradient(lx - w, y, lx + w, y); g.addColorStop(0, '#6fa860'); g.addColorStop(0.45, '#2f6a40'); g.addColorStop(1, '#1b3a26');
      ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = 'rgba(10,30,15,0.7)'; ctx.lineWidth = 0.7; ctx.stroke();
      // needle strokes
      ctx.strokeStyle = 'rgba(160,220,140,0.35)'; ctx.lineWidth = 0.7;
      for (let k = 0; k < 10; k++) { const fx = lx + rng.range(-w * 0.8, w * 0.8), fy = y - rng.next() * h * 0.6; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + rng.range(-2, 2), fy + 3); ctx.stroke(); }
      // snow-free cones
      if (t === 1 && rng.next() < 0.6) { ctx.fillStyle = '#7a5a30'; ctx.beginPath(); ctx.ellipse(lx + w * 0.4, y - 2, 1.4, 2.4, 0.3, 0, 7); ctx.fill(); }
    }
  } else { // blight: dead twisted tree, sparse dark foliage, webs
    const trunk = '#3a2e2a', tD = '#1a1210', tL = '#5a4a44';
    ctx.strokeStyle = tD; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    for (const [dx, dy] of [[-6, 1], [-3, 2.5], [5, 2]]) { ctx.beginPath(); ctx.moveTo(dx * 0.3, -2); ctx.quadraticCurveTo(dx * 0.8, 0, dx * sz, dy); ctx.stroke(); }
    ctx.strokeStyle = trunk; ctx.lineWidth = 3.8 * sz;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-3 * sz, -14 * sz, 1 * sz + lean, -26 * sz); ctx.stroke();
    ctx.strokeStyle = tL; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-1.2, -1); ctx.quadraticCurveTo(-3.5 * sz, -13 * sz, 0 + lean, -24 * sz); ctx.stroke();
    ctx.strokeStyle = trunk; ctx.lineWidth = 1.9 * sz;
    ctx.beginPath(); ctx.moveTo(-1 * sz, -16 * sz); ctx.quadraticCurveTo(-8 * sz, -20 * sz, -10 * sz + lean, -30 * sz); ctx.moveTo(0.5 * sz, -22 * sz); ctx.quadraticCurveTo(7 * sz, -26 * sz, 9 * sz + lean, -34 * sz); ctx.moveTo(1 * sz + lean, -26 * sz); ctx.lineTo(-2 * sz + lean, -36 * sz); ctx.stroke();
    ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(-10 * sz + lean, -30 * sz); ctx.lineTo(-13 * sz + lean, -34 * sz); ctx.moveTo(-10 * sz + lean, -30 * sz); ctx.lineTo(-12 * sz + lean, -28 * sz); ctx.moveTo(9 * sz + lean, -34 * sz); ctx.lineTo(12 * sz + lean, -36 * sz); ctx.moveTo(9 * sz + lean, -34 * sz); ctx.lineTo(11 * sz + lean, -31 * sz); ctx.moveTo(-2 * sz + lean, -36 * sz); ctx.lineTo(1 * sz + lean, -41 * sz); ctx.stroke();
    const blobs = [[-9 + lean, -33, 5.5], [8 + lean, -36, 6], [-1 + lean, -39, 5.5]].map(([x, y, r]) => [x * sz, y * sz, r * sz]);
    leafCanopy(ctx, blobs, ['#1e1626', '#4a3a5a', '#7a6690', '#3a5a3a'], rng, { density: 0.8 });
    // cobwebs
    ctx.strokeStyle = 'rgba(220,220,235,0.35)'; ctx.lineWidth = 0.5;
    if (rng.next() < 0.7) { const ax = -10 * sz + lean, ay = -30 * sz, bx = 1 * sz + lean, by = -26 * sz; for (let k = 1; k < 4; k++) { const f = k / 4; ctx.beginPath(); ctx.moveTo(ax + (bx - ax) * f, ay + (by - ay) * f); ctx.quadraticCurveTo(ax + (bx - ax) * f, ay + (by - ay) * f + 4 * f + 2, ax + (bx - ax) * f * 0.6, ay + (by - ay) * f * 0.6 + 8); ctx.stroke(); } }
    ctx.fillStyle = '#d8ccb0'; ell(ctx, 4 * sz, -1, 1.6, 1, '#d8ccb0'); // bone at roots
  }
}

export const NODE_W = 64, NODE_H = 48, NODE_ANCHOR_Y = 40;
export function nodeSprite(kind, variant) {
  const key = `node|${kind}|${variant % 4}`;
  return cached(key, NODE_W * 1.5, NODE_H * 1.5, (ctx) => {
    ctx.scale(1.5, 1.5); ctx.translate(NODE_W / 2, NODE_ANCHOR_Y);
    const rng = new RNG(variant * 131 + 7);
    const sg = ctx.createRadialGradient(0, 0, 1, 0, 0, 15); sg.addColorStop(0, 'rgba(0,0,0,0.32)'); sg.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(0, 0, 15, 6.5, 0, 0, 7); ctx.fill();
    if (kind === 'gold' || kind === 'stone') {
      const base = kind === 'gold' ? '#8a7a66' : '#8d8f8a';
      const rocks = [[-7, -2, 9, 6], [6, -3, 8, 6], [0, -7, 8, 6], [-2, 1, 6, 4]];
      for (const [x, y, w, h] of rocks) {
        const g = ctx.createLinearGradient(x - w, y - h, x + w, y + h); g.addColorStop(0, shade(base, 0.35)); g.addColorStop(0.5, base); g.addColorStop(1, shade(base, -0.5));
        poly(ctx, [[x - w, y + h * 0.5], [x - w * 0.6, y - h], [x + w * 0.4, y - h * 1.1], [x + w, y + h * 0.3], [x + w * 0.5, y + h]], g, OUT, 0.7);
        // facets
        ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(x + w * 0.4, y - h * 1.1); ctx.lineTo(x + w * 0.1, y + h * 0.6); ctx.moveTo(x - w * 0.6, y - h); ctx.lineTo(x - w * 0.2, y + h * 0.1); ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.moveTo(x - w * 0.55, y - h * 0.9); ctx.lineTo(x + w * 0.3, y - h * 1.0); ctx.stroke();
      }
      if (kind === 'gold') {
        for (let i = 0; i < 7; i++) { const x = rng.range(-12, 12), y = rng.range(-10, 2); ctx.strokeStyle = '#e0b030'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.quadraticCurveTo(x, y - 2, x + 3, y + 1); ctx.stroke(); }
        for (let i = 0; i < 9; i++) { const x = rng.range(-12, 12), y = rng.range(-10, 2); poly(ctx, [[x, y - 1.8], [x + 1.8, y], [x, y + 1.6], [x - 1.7, y]], '#f5c832', '#7a5a10', 0.4); ctx.fillStyle = '#fff8d0'; ctx.fillRect(x - 0.5, y - 1, 0.9, 0.9); }
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; const gg = ctx.createRadialGradient(0, -4, 0, 0, -4, 16); gg.addColorStop(0, 'rgba(255,210,90,0.25)'); gg.addColorStop(1, 'rgba(255,210,90,0)'); ctx.fillStyle = gg; ctx.fillRect(-20, -20, 40, 30); ctx.restore();
      } else {
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 0.5; for (let i = 0; i < 6; i++) { const x = rng.range(-10, 10), y = rng.range(-8, 2); line(ctx, x, y, x + rng.range(-3, 3), y + rng.range(-2, 2), 'rgba(0,0,0,0.35)', 0.5); }
        ctx.fillStyle = 'rgba(120,170,80,0.5)'; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.ellipse(rng.range(-10, 8), rng.range(-9, -2), 3, 1.6, rng.next(), 0, 7); ctx.fill(); }
      }
    } else if (kind === 'berry') {
      leafCanopy(ctx, [[-7, -4, 7.5], [6, -5, 8], [0, -9, 7], [-1, -2, 6]], ['#1f4a1c', '#3f7a32', '#7fbf55', '#5a9a40'], rng, { density: 1.3 });
      for (let i = 0; i < 16; i++) { const x = rng.range(-12, 12), y = rng.range(-14, 1); ctx.fillStyle = rng.next() < 0.5 ? '#d43a4a' : '#5a3aa0'; ctx.beginPath(); ctx.arc(x, y, 1.2, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.beginPath(); ctx.arc(x - 0.35, y - 0.35, 0.4, 0, 7); ctx.fill(); }
    } else if (kind === 'carcass') {
      ell(ctx, 0, -2, 11, 4.5, '#8a5a3a', OUT, 0.7); ell(ctx, 9, -3, 3.5, 2.5, '#8a5a3a', OUT, 0.6);
      line(ctx, -6, 1, -8, 3, '#5a3a20', 1.4); line(ctx, 2, 1.5, 4, 3.5, '#5a3a20', 1.4);
      ell(ctx, -2, -1, 4, 2, 'rgba(160,30,30,.75)');
      ctx.fillStyle = 'rgba(120,20,20,0.5)'; ctx.beginPath(); ctx.ellipse(3, 3, 9, 3, 0, 0, 7); ctx.fill();
    }
  });
}

// ---------------------------------------------------------------------
//  BUILDINGS  (anchor: screen position of footprint centre)
// ---------------------------------------------------------------------
export const BSCALE = 1.5;
export function buildingSprite(faction, role, stage /* 0..1 construction, 1 complete */, variant = 0) {
  const def = BUILDING_ROLES[role];
  const s = def.size;
  const q = stage >= 1 ? 100 : Math.floor(stage * 10) * 10;        // quantise construction
  const key = `b|${faction}|${role}|${q}|${variant}`;
  const extra = role === 'tc' ? 150 : role === 'tower' ? 110 : role === 'shrine' ? 120 : 90;
  const w = s * TW + 40, h = s * TH + extra;
  return cached(key, w * BSCALE, h * BSCALE, (ctx) => {
    ctx.scale(BSCALE, BSCALE);
    ctx.translate(w / 2, h - s * HH - 8);    // origin at footprint centre; diamond bottom at +s*HH
    const P = (u, v, z = 0) => [(u - v) * HW, (u + v) * HH - s * HH - z];   // tile coords within footprint -> local px
    const rng = new RNG(variant * 53 + role.length);
    const ctxApi = { ctx, P, s, rng, faction, role };
    if (q < 100) drawConstruction(ctxApi, q / 100, () => drawBuilding(ctxApi));
    else drawBuilding(ctxApi);
  });
}

// --- iso primitives (coordinates in tile units within footprint; z in px up) ---
function isoDiamond(c, u0, v0, u1, v1, fill, stroke, z = 0) {
  const { ctx, P } = c;
  poly(ctx, [P(u0, v0, z), P(u1, v0, z), P(u1, v1, z), P(u0, v1, z)], fill, stroke, 0.8);
}
function isoBox(c, u0, v0, u1, v1, z0, z1, color, opts = {}) {
  const { ctx, P, rng } = c;
  const top = shade(color, opts.topLight ?? 0.22), left = shade(color, -0.08), right = shade(color, -0.4);
  const tex = opts.tex || (color === E.stone || color === O.rock || color === '#8a7a60' ? 'stone' : 'plank');
  const elf = c.faction === 'elves';
  const faces = [
    { pts: [P(u0, v1, z0), P(u1, v1, z0), P(u1, v1, z1), P(u0, v1, z1)], fill: opts.leftGrad ? vgrad(ctx, 0, P(u0, v1, z1)[1], P(u0, v1, z0)[1], shade(color, 0.05), shade(color, -0.3)) : left, a: [u0, v1], b: [u1, v1], dark: 0 },
    { pts: [P(u1, v0, z0), P(u1, v1, z0), P(u1, v1, z1), P(u1, v0, z1)], fill: opts.rightGrad ? vgrad(ctx, 0, P(u1, v0, z1)[1], P(u1, v0, z0)[1], shade(color, -0.25), shade(color, -0.55)) : right, a: [u1, v0], b: [u1, v1], dark: 1 },
  ];
  for (const f of faces) {
    poly(ctx, f.pts, f.fill, null);
    ctx.save(); ctx.beginPath(); ctx.moveTo(f.pts[0][0], f.pts[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(f.pts[i][0], f.pts[i][1]); ctx.closePath(); ctx.clip();
    const H = z1 - z0;
    if (tex === 'plank') {
      const step = elf ? 6 : 5;
      for (let z = z0 + step; z < z1; z += step) {
        const [ax, ay] = P(f.a[0], f.a[1], z), [bx, by] = P(f.b[0], f.b[1], z);
        line(ctx, ax, ay, bx, by, 'rgba(0,0,0,0.22)', 1); line(ctx, ax, ay + 1, bx, by + 1, 'rgba(255,255,255,0.12)', 0.7);
        if (!elf && rng.next() < 0.8) { ctx.fillStyle = 'rgba(30,30,30,0.7)'; const n = 2 + rng.int(0, 2); for (let k = 0; k < n; k++) { const t = (k + 0.5) / n + rng.range(-0.08, 0.08); ctx.beginPath(); ctx.arc(ax + (bx - ax) * t, ay + (by - ay) * t - 2.2, 0.7, 0, 7); ctx.fill(); } }
      }
      if (!elf) { // vertical board seams
        const n = Math.max(2, Math.round(Math.hypot(f.pts[1][0] - f.pts[0][0], f.pts[1][1] - f.pts[0][1]) / 9));
        for (let k = 1; k < n; k++) { const t = k / n + rng.range(-0.03, 0.03); const x = f.pts[0][0] + (f.pts[1][0] - f.pts[0][0]) * t, y = f.pts[0][1] + (f.pts[1][1] - f.pts[0][1]) * t; line(ctx, x, y, x, y - H, 'rgba(0,0,0,0.28)', 0.8); }
      } else { // elven: slim pale panels with a gold line
        const n = Math.max(2, Math.round(Math.hypot(f.pts[1][0] - f.pts[0][0], f.pts[1][1] - f.pts[0][1]) / 14));
        for (let k = 1; k < n; k++) { const t = k / n; const x = f.pts[0][0] + (f.pts[1][0] - f.pts[0][0]) * t, y = f.pts[0][1] + (f.pts[1][1] - f.pts[0][1]) * t; line(ctx, x, y, x, y - H, 'rgba(0,0,0,0.12)', 0.8); }
      }
    } else if (tex === 'stone') {
      const course = 6;
      let row = 0;
      for (let z = z0; z < z1; z += course, row++) {
        const [ax, ay] = P(f.a[0], f.a[1], z), [bx, by] = P(f.b[0], f.b[1], z);
        const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(len / 9)); const off = row % 2 ? 0.5 : 0;
        for (let k = 0; k < n + 1; k++) {
          const t0 = (k - off) / n, t1 = (k + 1 - off) / n; if (t1 <= 0 || t0 >= 1) continue;
          const x0 = ax + (bx - ax) * Math.max(0, t0), y0 = ay + (by - ay) * Math.max(0, t0), x1 = ax + (bx - ax) * Math.min(1, t1), y1 = ay + (by - ay) * Math.min(1, t1);
          ctx.fillStyle = `rgba(${rng.next() < 0.5 ? '255,255,255' : '0,0,0'},${0.05 + rng.next() * 0.08})`;
          ctx.beginPath(); ctx.moveTo(x0 + 0.6, y0 - 0.6); ctx.lineTo(x1 - 0.6, y1 - 0.6); ctx.lineTo(x1 - 0.6, y1 - course + 0.6); ctx.lineTo(x0 + 0.6, y0 - course + 0.6); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 0.7; ctx.stroke();
        }
      }
    }
    // base ambient occlusion + top-edge highlight
    const [ax0, ay0] = P(f.a[0], f.a[1], z0), [bx0, by0] = P(f.b[0], f.b[1], z0), [ax1, ay1] = P(f.a[0], f.a[1], z0 + 9), [bx1, by1] = P(f.b[0], f.b[1], z0 + 9);
    const g = ctx.createLinearGradient(0, ay0, 0, ay1); g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    poly(ctx, [[ax0, ay0], [bx0, by0], [bx1, by1], [ax1, ay1]], g, null);
    if (f.dark) { ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(-500, -500, 1000, 1000); }
    ctx.restore();
    ctx.strokeStyle = OUT; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(f.pts[0][0], f.pts[0][1]); for (let i = 1; i < 4; i++) ctx.lineTo(f.pts[i][0], f.pts[i][1]); ctx.closePath(); ctx.stroke();
  }
  // top
  if (!opts.noTop) poly(ctx, [P(u0, v0, z1), P(u1, v0, z1), P(u1, v1, z1), P(u0, v1, z1)], opts.topColor || top, OUT, 0.7);
}
// pitched roof over box footprint, ridge along u axis (ridge from (u0,vm) to (u1,vm))
function isoRoof(c, u0, v0, u1, v1, zBase, zRidge, color, alongU = true, overhang = 0.12) {
  const { ctx, P, rng } = c;
  const vm = (v0 + v1) / 2, um = (u0 + u1) / 2, o = overhang;
  const elf = c.faction === 'elves';
  const slopes = alongU ? [
    { pts: [P(u0 - o, v1 + o, zBase), P(u1 + o, v1 + o, zBase), P(u1 + o, vm, zRidge), P(u0 - o, vm, zRidge)], sh: -0.05, lit: true },
    { pts: [P(u0 - o, v0 - o, zBase), P(u1 + o, v0 - o, zBase), P(u1 + o, vm, zRidge), P(u0 - o, vm, zRidge)], sh: 0.25, lit: false },
  ] : [
    { pts: [P(u1 + o, v0 - o, zBase), P(u1 + o, v1 + o, zBase), P(um, v1 + o, zRidge), P(um, v0 - o, zRidge)], sh: -0.35, lit: false },
    { pts: [P(u0 - o, v0 - o, zBase), P(u0 - o, v1 + o, zBase), P(um, v1 + o, zRidge), P(um, v0 - o, zRidge)], sh: 0.2, lit: true },
  ];
  for (const s of slopes) {
    const [e0, e1, r1, r0] = s.pts;        // eave a, eave b, ridge b, ridge a
    poly(ctx, s.pts, vgrad(ctx, 0, r0[1], e0[1], shade(color, s.sh + 0.18), shade(color, s.sh - 0.1)), null);
    ctx.save(); ctx.beginPath(); ctx.moveTo(e0[0], e0[1]); ctx.lineTo(e1[0], e1[1]); ctx.lineTo(r1[0], r1[1]); ctx.lineTo(r0[0], r0[1]); ctx.closePath(); ctx.clip();
    const rows = Math.max(3, Math.round((e0[1] - r0[1]) / (elf ? 4.5 : 6)));
    for (let i = 0; i <= rows; i++) {
      const f = i / rows;
      const ax = e0[0] + (r0[0] - e0[0]) * f, ay = e0[1] + (r0[1] - e0[1]) * f, bx = e1[0] + (r1[0] - e1[0]) * f, by = e1[1] + (r1[1] - e1[1]) * f;
      if (elf) { // slate shingles: scalloped rows
        const len = Math.hypot(bx - ax, by - ay), n = Math.max(2, Math.round(len / 5)), off = (i % 2) * 0.5;
        ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = 0.8; ctx.beginPath();
        for (let k = 0; k <= n; k++) { const t = (k + off) / n; const x = ax + (bx - ax) * t, y = ay + (by - ay) * t; ctx.moveTo(x, y); ctx.arc(x, y - 1.5, 2.4, 0.2, Math.PI - 0.2); }
        ctx.stroke();
        line(ctx, ax, ay - 2.2, bx, by - 2.2, 'rgba(255,255,255,0.1)', 0.8);
      } else { // hide roof: seams, patches & stitches
        line(ctx, ax, ay, bx, by, 'rgba(0,0,0,0.22)', 1.2);
        if (rng.next() < 0.5) { const t = rng.next(); const x = ax + (bx - ax) * t, y = ay + (by - ay) * t; ctx.fillStyle = `rgba(${rng.next() < 0.5 ? '0,0,0' : '255,255,255'},0.1)`; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 7, y + 2); ctx.lineTo(x + 6, y - 5); ctx.lineTo(x - 1, y - 6); ctx.closePath(); ctx.fill(); ctx.strokeStyle = 'rgba(230,220,200,0.45)'; ctx.lineWidth = 0.6; ctx.setLineDash([1.2, 1.5]); ctx.stroke(); ctx.setLineDash([]); }
      }
    }
    // eave shadow (under the overhang) and slope darkening on the far side
    const g = ctx.createLinearGradient(0, e0[1] - 6, 0, e0[1]); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
    poly(ctx, [[e0[0], e0[1] - 6], [e1[0], e1[1] - 6], e1, e0], g, null);
    if (!s.lit) { ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(-500, -500, 1000, 1000); }
    ctx.restore();
    poly(ctx, s.pts, null, OUT, 0.8);
    if (elf) line(ctx, e0[0], e0[1], e1[0], e1[1], E.gold, 1.1);
  }
  // ridge beam
  const ra = alongU ? P(u0 - o, vm, zRidge) : P(um, v0 - o, zRidge), rb = alongU ? P(u1 + o, vm, zRidge) : P(um, v1 + o, zRidge);
  line(ctx, ra[0], ra[1], rb[0], rb[1], shade(color, 0.5), 1.6); line(ctx, ra[0], ra[1] + 1.2, rb[0], rb[1] + 1.2, 'rgba(0,0,0,0.3)', 0.8);
  if (!elf) { for (let k = 0; k < 3; k++) { const t = (k + 0.5) / 3; spike(c, ra[0] + (rb[0] - ra[0]) * t, ra[1] + (rb[1] - ra[1]) * t, 4, O.bone); } }
}
function cylinder(c, u, v, r, z0, z1, color, topColor, bark = false) {
  const { ctx, P } = c;
  const [cx, cy0] = P(u, v, z0), [, cy1] = P(u, v, z1);
  const rx = r * HW * 1.0, ry = r * HH * 1.0;
  ctx.beginPath(); ctx.moveTo(cx - rx, cy1); ctx.lineTo(cx - rx, cy0); ctx.ellipse(cx, cy0, rx, ry, 0, Math.PI, 0, true); ctx.lineTo(cx + rx, cy1); ctx.closePath();
  const g = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0); g.addColorStop(0, shade(color, -0.1)); g.addColorStop(0.35, shade(color, 0.2)); g.addColorStop(1, shade(color, -0.5));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.7; ctx.stroke();
  if (bark || r >= 0.25) { // bark grooves
    ctx.save(); ctx.beginPath(); ctx.moveTo(cx - rx, cy1); ctx.lineTo(cx - rx, cy0); ctx.ellipse(cx, cy0, rx, ry, 0, Math.PI, 0, true); ctx.lineTo(cx + rx, cy1); ctx.closePath(); ctx.clip();
    ctx.strokeStyle = 'rgba(40,30,20,0.22)'; ctx.lineWidth = 1.1; const rng = c.rng;
    for (let i = 0; i < 7; i++) { const x = cx - rx + (i + 0.5) / 7 * 2 * rx + (rng.next() - 0.5) * 3; ctx.beginPath(); ctx.moveTo(x, cy0 + ry); ctx.bezierCurveTo(x + (rng.next() - 0.5) * 6, cy0 - (cy0 - cy1) * 0.33, x + (rng.next() - 0.5) * 6, cy0 - (cy0 - cy1) * 0.66, x + (rng.next() - 0.5) * 4, cy1); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - rx * 0.45, cy0 + ry * 0.6); ctx.lineTo(cx - rx * 0.4, cy1 + 2); ctx.stroke();
    ctx.restore();
  }
  ell(ctx, cx, cy1, rx, ry, topColor || shade(color, 0.3), OUT, 0.7);
}
function cone(c, u, v, r, z0, z1, color) {
  const { ctx, P } = c;
  const [cx, cy0] = P(u, v, z0), [, cy1] = P(u, v, z1);
  const rx = r * HW, ry = r * HH;
  ctx.beginPath(); ctx.moveTo(cx - rx, cy0); ctx.ellipse(cx, cy0, rx, ry, 0, Math.PI, 0, true); ctx.lineTo(cx, cy1); ctx.closePath();
  const g = ctx.createLinearGradient(cx - rx, 0, cx + rx, 0); g.addColorStop(0, shade(color, -0.1)); g.addColorStop(0.4, shade(color, 0.25)); g.addColorStop(1, shade(color, -0.5));
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  for (let i = 0; i < 14; i++) { const t = (i + 0.5) / 14; const bx = cx - rx + 2 * rx * t, by = cy0 + Math.sin(Math.PI * t) * ry * 0.95; line(ctx, cx + (bx - cx) * 0.1, cy1 + (by - cy1) * 0.1, bx, by, i % 2 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.12)', 0.9); }
  ctx.restore(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.7; ctx.stroke();
}
// climbing ivy with leaves along a quadratic curve
function ivy(c, x0, y0, cx, cy, x1, y1, col = '#4f8f3a') {
  const { ctx, rng } = c;
  ctx.strokeStyle = shade(col, -0.35); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(cx, cy, x1, y1); ctx.stroke();
  for (let i = 0; i < 10; i++) { const t = (i + 0.5) / 10, mt = 1 - t; const x = mt * mt * x0 + 2 * mt * t * cx + t * t * x1, y = mt * mt * y0 + 2 * mt * t * cy + t * t * y1; ctx.fillStyle = i % 3 ? col : shade(col, 0.3); ctx.beginPath(); ctx.ellipse(x + rng.range(-1.5, 1.5), y + rng.range(-1, 1), 2, 1.3, rng.next() * 3, 0, 7); ctx.fill(); }
}
function canopy(c, u, v, z, r, colors, rng) {
  const { ctx, P } = c;
  const [cx, cy] = P(u, v, z);
  // soft dark underside
  ell(ctx, cx, cy + r * 0.45, r * 1.25, r * 0.55, 'rgba(20,30,10,0.35)');
  const blobs = [[-0.6, 0.1, 0.75], [0.6, 0.0, 0.8], [0, -0.5, 0.85], [-0.2, 0.35, 0.6], [0.3, 0.3, 0.6]].map(([bx, by, br]) => [cx + bx * r, cy + by * r * 0.8, br * r]);
  const [mid, dark, light] = colors;
  leafCanopy(ctx, blobs, [shade(dark, -0.15), mid, light, mixHex(mid, '#ffffff', 0.15)], rng, { density: 0.9, specks: colors === E.leaf ? 'rgba(255,250,220,0.95)' : null });
}
function banner(c, x, y, h, color, pole = '#3a2a1a') {
  const { ctx } = c;
  line(ctx, x, y, x, y - h, pole, 1.4);
  ctx.beginPath(); ctx.moveTo(x, y - h); ctx.lineTo(x + 7, y - h + 1.5); ctx.lineTo(x + 5, y - h + 6); ctx.lineTo(x + 7.5, y - h + 11); ctx.lineTo(x, y - h + 9); ctx.closePath();
  ctx.fillStyle = vgrad(ctx, 0, y - h, y - h + 11, shade(color, 0.2), shade(color, -0.3)); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.6; ctx.stroke();
}
function torch(c, x, y, h = 10, col = '#ffa030') {
  const { ctx } = c;
  line(ctx, x, y, x, y - h, '#3a2a1a', 1.4);
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(x, y - h - 2, 0, x, y - h - 2, 9); g.addColorStop(0, rgba(col, 0.55)); g.addColorStop(1, rgba(col, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y - h - 2, 9, 0, 7); ctx.fill(); ctx.restore();
  ell(ctx, x, y - h - 2, 1.8, 2.8, '#ffb040'); ell(ctx, x, y - h - 2.5, 0.9, 1.6, '#fff0b0');
}
function lantern(c, x, y, col = '#bfe8ff') {
  const { ctx } = c;
  ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(x, y, 0, x, y, 8); g.addColorStop(0, rgba(col, 0.5)); g.addColorStop(1, rgba(col, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill(); ctx.restore();
  rrect(ctx, x - 1.5, y - 2, 3, 4, 1, '#f0f8ff', '#a0a890', 0.5);
}
function skull(c, x, y, r = 2.2) {
  const { ctx } = c;
  ell(ctx, x, y, r, r * 0.95, '#e6dcc0', OUT, 0.5);
  rrect(ctx, x - r * 0.65, y + r * 0.4, r * 1.3, r * 0.7, 0.5, '#d6ccb0', OUT, 0.4);
  ctx.fillStyle = '#1a1010'; ctx.beginPath(); ctx.arc(x - r * 0.4, y - r * 0.1, r * 0.3, 0, 7); ctx.arc(x + r * 0.4, y - r * 0.1, r * 0.3, 0, 7); ctx.fill();
}
function spike(c, x, y, h, col = '#6b4a2a') { const { ctx } = c; poly(ctx, [[x - 1.3, y], [x + 1.3, y], [x, y - h]], col, OUT, 0.5); }
function fence(c, u0, v0, u1, v1, color, h = 7, step = 0.5, spiked = false) {
  const { ctx, P } = c;
  const len = Math.hypot(u1 - u0, v1 - v0), n = Math.max(1, Math.round(len / step));
  const [ax, ay] = P(u0, v0, h), [bx, by] = P(u1, v1, h);
  line(ctx, ax, ay, bx, by, shade(color, -0.1), 1.6);
  for (let i = 0; i <= n; i++) {
    const u = u0 + (u1 - u0) * i / n, v = v0 + (v1 - v0) * i / n;
    const [x, y] = P(u, v, 0);
    line(ctx, x, y, x, y - h - (spiked ? 3 : 1), color, 1.6);
    if (spiked) spike(c, x, y - h - 2, 3, color);
  }
}
function roots(c, u, v, r, color) {
  const { ctx, P } = c; const [cx, cy] = P(u, v, 0);
  ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + 0.3; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.25); ctx.quadraticCurveTo(cx + Math.cos(a) * r * 1.0, cy + Math.sin(a) * r * 0.5 + 2, cx + Math.cos(a + 0.3) * r * 1.5, cy + Math.sin(a + 0.3) * r * 0.75 + 1); ctx.stroke(); }
}
function dirtPatch(c, color = '#5a4a32', inset = 0.08) {
  const { s } = c; isoDiamond(c, inset, inset, s - inset, s - inset, color, 'rgba(0,0,0,0.25)');
}
function logsPile(c, x, y, n = 3) {
  const { ctx } = c;
  for (let i = 0; i < n; i++) { const lx = x + (i % 2) * 3 - 1.5, ly = y - Math.floor(i / 2) * 3.2; rrect(ctx, lx - 8, ly - 1.7, 16, 3.4, 1.7, '#7a5a38', OUT, 0.5); ell(ctx, lx + 8, ly, 1.7, 1.7, '#c9a877', OUT, 0.4); }
}

// tapered trunk with bark texture; r0 bottom radius, r1 top radius (tile units)
function trunk(c, u, v, r0, r1, z0, z1, color) {
  const { ctx, P, rng } = c;
  const [cx, cy0] = P(u, v, z0), [, cy1] = P(u, v, z1);
  const rx0 = r0 * HW, ry0 = r0 * HH, rx1 = r1 * HW, ry1 = r1 * HH;
  ctx.beginPath(); ctx.moveTo(cx - rx1, cy1); ctx.bezierCurveTo(cx - rx1, cy1 + (cy0 - cy1) * 0.5, cx - rx0 * 0.85, cy0 - 8, cx - rx0, cy0);
  ctx.ellipse(cx, cy0, rx0, ry0, 0, Math.PI, 0, true); ctx.bezierCurveTo(cx + rx0 * 0.85, cy0 - 8, cx + rx1, cy1 + (cy0 - cy1) * 0.5, cx + rx1, cy1); ctx.closePath();
  const g = ctx.createLinearGradient(cx - rx0, 0, cx + rx0, 0); g.addColorStop(0, shade(color, -0.15)); g.addColorStop(0.3, shade(color, 0.22)); g.addColorStop(0.6, color); g.addColorStop(1, shade(color, -0.5));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.save(); ctx.clip();
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 9; i++) {
    const t = (i + 0.5) / 9; const xb = cx - rx0 + t * 2 * rx0, xt = cx - rx1 + t * 2 * rx1;
    ctx.strokeStyle = i % 3 === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(40,30,20,0.25)';
    ctx.beginPath(); ctx.moveTo(xb, cy0 + ry0); ctx.bezierCurveTo(xb + (rng.next() - 0.5) * 8, cy0 - (cy0 - cy1) * 0.3, xt + (rng.next() - 0.5) * 8, cy0 - (cy0 - cy1) * 0.7, xt, cy1); ctx.stroke();
  }
  // knots
  for (let i = 0; i < 3; i++) { const kx = cx + (rng.next() - 0.5) * rx0 * 1.2, ky = cy1 + (cy0 - cy1) * rng.range(0.2, 0.8); ell(ctx, kx, ky, 2.2, 3, 'rgba(60,45,30,0.35)', 'rgba(40,30,20,0.4)', 0.6); }
  ctx.restore();
  ell(ctx, cx, cy1, rx1, ry1, shade(color, 0.3), OUT, 0.7);
}
// tapered branch from (x0,y0) to (x1,y1)
function branch(ctx, x0, y0, x1, y1, w0, w1, color) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + 5;
  ctx.beginPath(); ctx.moveTo(x0 + nx * w0, y0 + ny * w0); ctx.quadraticCurveTo(mx + nx * (w0 + w1) / 2, my + ny * (w0 + w1) / 2, x1 + nx * w1, y1 + ny * w1);
  ctx.lineTo(x1 - nx * w1, y1 - ny * w1); ctx.quadraticCurveTo(mx - nx * (w0 + w1) / 2, my - ny * (w0 + w1) / 2, x0 - nx * w0, y0 - ny * w0); ctx.closePath();
  const g = ctx.createLinearGradient(x0 + nx * w0, y0 + ny * w0, x0 - nx * w0, y0 - ny * w0); g.addColorStop(0, shade(color, 0.2)); g.addColorStop(1, shade(color, -0.45));
  ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.7; ctx.stroke();
}
// --- construction scaffolding ---
function drawConstruction(c, p, drawFull) {
  const { ctx, P, s } = c;
  dirtPatch(c, c.faction === 'elves' ? '#6a5a3a' : '#3a2a1e');
  // partial building: clip bottom p fraction of the height
  const top = P(s / 2, s / 2, 0)[1] - (s * TH + 120);
  const full = P(s / 2, s / 2, 0)[1] + s * HH;
  const cut = full - (full - top) * p * 0.95;
  ctx.save(); ctx.beginPath(); ctx.rect(-400, cut, 800, 800); ctx.clip();
  drawFull();
  ctx.restore();
  // scaffold poles at footprint corners
  const poleH = 14 + p * 20;
  const wood = c.faction === 'elves' ? '#b89a70' : '#5a4030';
  for (const [u, v] of [[0.1, 0.1], [s - 0.1, 0.1], [0.1, s - 0.1], [s - 0.1, s - 0.1]]) { const [x, y] = P(u, v, 0); line(ctx, x, y, x, y - poleH, wood, 1.5); }
  const [a, b] = [P(0.1, s - 0.1, poleH - 4), P(s - 0.1, s - 0.1, poleH - 4)]; line(ctx, a[0], a[1], b[0], b[1], wood, 1.2);
  const [d, e] = [P(s - 0.1, 0.1, poleH - 4), P(s - 0.1, s - 0.1, poleH - 4)]; line(ctx, d[0], d[1], e[0], e[1], wood, 1.2);
  // materials pile
  const [mx, my] = P(s * 0.3, s * 0.75, 0); logsPile(c, mx, my - 3, 2);
}

// --- main dispatcher ---
function drawBuilding(c) {
  const fn = c.faction === 'elves' ? ELF[c.role] : ORC[c.role];
  fn(c);
}

// ======================== WOOD ELVES ========================
const E = { wood: '#d8d0bc', woodD: '#9a9080', roof: '#3f7f5a', roofD: '#2a5a3e', gold: '#d9b857', leaf: ['#d9b857', '#8a9a3a', '#f3dc8c'], leafG: ['#5f9f45', '#2f5d3a', '#a8d080'], trunk: '#c8c2b4', stone: '#9ea8a0' };
const ELF = {
  tc(c) {
    const { ctx, P, s, rng } = c;
    isoDiamond(c, 0.05, 0.05, s - 0.05, s - 0.05, '#6f8f52', 'rgba(0,0,0,0.2)');
    roots(c, 2, 2, 40, '#a09a8c');
    // flower ring
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; const [x, y] = P(2 + Math.cos(a) * 1.7, 2 + Math.sin(a) * 1.7, 0); ctx.fillStyle = i % 2 ? '#f0e0a0' : '#c8e0ff'; ctx.beginPath(); ctx.arc(x, y, 1.1, 0, 7); ctx.fill(); }
    // curved hall around the trunk
    isoBox(c, 0.6, 1.2, 3.4, 2.8, 0, 22, E.wood, { leftGrad: true, rightGrad: true, noTop: true });
    // hall roof (green shingles)
    isoRoof(c, 0.6, 1.2, 3.4, 2.8, 22, 38, E.roof, true, 0.2);
    // windows / lanterns along the near wall
    for (let i = 0; i < 4; i++) { const [x, y] = P(1 + i * 0.7, 2.8, 12); rrect(ctx, x - 1.5, y - 3, 3, 5, 1.5, '#ffe9a0', '#7a6a40', 0.5); }
    for (let i = 0; i < 3; i++) { const [x, y] = P(3.4, 1.5 + i * 0.6, 12); rrect(ctx, x - 1.3, y - 3, 2.6, 5, 1.3, '#ffe9a0', '#7a6a40', 0.5); }
    ivy(c, ...P(0.7, 2.8, 2), ...P(0.9, 2.8, 14), ...P(1.3, 2.8, 20)); ivy(c, ...P(3.4, 1.3, 0), ...P(3.4, 1.6, 12), ...P(3.4, 2.0, 21));
    // doorway with golden arch
    const [dx, dy] = P(2, 2.8, 0); ctx.beginPath(); ctx.moveTo(dx - 4, dy); ctx.lineTo(dx - 4, dy - 9); ctx.quadraticCurveTo(dx, dy - 15, dx + 4, dy - 9); ctx.lineTo(dx + 4, dy); ctx.closePath(); ctx.fillStyle = '#2a2a24'; ctx.fill(); ctx.strokeStyle = E.gold; ctx.lineWidth = 1.2; ctx.stroke();
    // great mallorn trunk through the roof (tapered, with bark and root flare)
    trunk(c, 2, 2, 0.62, 0.42, 20, 88, E.trunk);
    // branches with flets (platforms)
    for (const [u, v, z, len] of [[1.1, 1.3, 70, 1], [3.0, 1.2, 78, 1], [1.4, 2.9, 62, 1]]) {
      const [x0, y0] = P(2, 2, z - 6), [x1, y1] = P(u, v, z); branch(ctx, x0, y0, x1, y1, 7, 3, E.trunk);
      // flet platform house
      const [fx, fy] = P(u, v, z); rrect(ctx, fx - 9, fy - 2, 18, 3, 1, E.woodD, OUT, 0.5);
      poly(ctx, [[fx - 7, fy - 2], [fx + 7, fy - 2], [fx + 7, fy - 9], [fx - 7, fy - 9]], E.wood, OUT, 0.5);
      poly(ctx, [[fx - 9, fy - 9], [fx + 9, fy - 9], [fx, fy - 16]], E.roof, OUT, 0.6);
      lantern(c, fx, fy - 5, '#ffe9a0');
    }
    canopy(c, 2, 2, 100, 42, E.leaf, rng);
    canopy(c, 1.2, 1.3, 86, 20, E.leaf, rng); canopy(c, 3.0, 1.2, 92, 20, E.leaf, rng);
    // glow motes
    ctx.fillStyle = 'rgba(255,250,210,.9)'; for (let i = 0; i < 10; i++) { const [x, y] = P(2 + rng.range(-1.5, 1.5), 2 + rng.range(-1.5, 1.5), rng.range(70, 125)); ctx.beginPath(); ctx.arc(x, y, 1, 0, 7); ctx.fill(); }
    banner(c, ...P(0.5, 3.5, 0), 26, '#2f5d3a', E.woodD); banner(c, ...P(3.5, 3.5, 0), 26, '#2f5d3a', E.woodD);
  },
  house(c) {
    const { ctx, P, s, rng } = c;
    isoDiamond(c, 0.1, 0.1, s - 0.1, s - 0.1, '#6f8f52', 'rgba(0,0,0,0.15)');
    trunk(c, 1, 1, 0.32, 0.22, 0, 30, E.trunk);
    const [fx, fy] = P(1, 1, 30);
    rrect(ctx, fx - 14, fy - 2, 28, 3.5, 1.5, E.woodD, OUT, 0.6);
    // small round house on the platform
    poly(ctx, [[fx - 11, fy - 2], [fx + 11, fy - 2], [fx + 10, fy - 14], [fx - 10, fy - 14]], vgrad(ctx, 0, fy - 14, fy, shade(E.wood, 0.1), shade(E.wood, -0.25)), OUT, 0.6);
    rrect(ctx, fx - 1.5, fy - 11, 3, 6, 1.5, '#ffe9a0', '#7a6a40', 0.5); rrect(ctx, fx - 7, fy - 11, 2.4, 3, 1, '#ffe9a0', '#7a6a40', 0.4); rrect(ctx, fx + 4.6, fy - 11, 2.4, 3, 1, '#ffe9a0', '#7a6a40', 0.4);
    ctx.beginPath(); ctx.moveTo(fx - 14, fy - 14); ctx.quadraticCurveTo(fx - 4, fy - 26, fx, fy - 30); ctx.quadraticCurveTo(fx + 4, fy - 26, fx + 14, fy - 14); ctx.closePath(); ctx.fillStyle = vgrad(ctx, 0, fy - 30, fy - 14, shade(E.roof, 0.3), E.roofD); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.7; ctx.stroke();
    line(ctx, fx - 14, fy - 14, fx + 14, fy - 14, E.gold, 0.8);
    canopy(c, 1, 1, 52, 17, E.leafG, rng);
    // ladder / rope
    const [lx, ly] = P(1.6, 1.6, 0); line(ctx, lx, ly, fx + 6, fy - 1, '#8a7a5a', 0.8);
  },
  lumber(c) {
    const { ctx, P, s } = c;
    dirtPatch(c, '#7a6a48');
    cylinder(c, 1.2, 0.8, 0.5, 0, 14, '#8a7a60', '#b8a888');
    // hollow opening
    const [hx, hy] = P(1.2, 1.3, 2); ctx.beginPath(); ctx.ellipse(hx, hy - 4, 5, 6, 0, 0, 7); ctx.fillStyle = '#2a2018'; ctx.fill();
    const [lx, ly] = P(0.6, 1.6, 0); logsPile(c, lx, ly - 2, 4);
    const [ax, ay] = P(1.7, 1.7, 0); line(ctx, ax, ay, ax + 3, ay - 9, '#6b4a2a', 1.3); poly(ctx, [[ax + 3, ay - 9], [ax + 7, ay - 11], [ax + 7, ay - 7]], '#cfd8d8', OUT, 0.5);
    canopy(c, 1.2, 0.8, 26, 13, E.leafG, c.rng);
  },
  mine(c) {
    const { ctx, P, s } = c;
    dirtPatch(c, '#7a6a58');
    // rocky mound with crystal mouth
    const [mx, my] = P(1, 0.9, 0);
    poly(ctx, [[mx - 26, my + 4], [mx - 18, my - 14], [mx - 4, my - 22], [mx + 12, my - 18], [mx + 24, my - 6], [mx + 22, my + 6]], vgrad(ctx, 0, my - 22, my + 6, '#b0b8b0', '#6a706a'), OUT, 0.8);
    ctx.beginPath(); ctx.moveTo(mx - 7, my + 5); ctx.lineTo(mx - 7, my - 6); ctx.quadraticCurveTo(mx, my - 13, mx + 7, my - 6); ctx.lineTo(mx + 7, my + 5); ctx.closePath(); ctx.fillStyle = '#1a1a1a'; ctx.fill(); ctx.strokeStyle = E.wood; ctx.lineWidth = 1.5; ctx.stroke();
    // crystals
    for (const [cx, cy, h, col] of [[mx - 14, my - 8, 9, '#8fe0ff'], [mx + 15, my - 10, 8, '#c0a0ff'], [mx + 4, my - 19, 7, '#8fe0ff'], [mx - 20, my + 1, 6, '#c0a0ff']]) { poly(ctx, [[cx - 2.5, cy], [cx + 2.5, cy], [cx + 0.5, cy - h]], col, 'rgba(255,255,255,.6)', 0.5); ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = rgba(col, 0.25); ctx.beginPath(); ctx.arc(cx, cy - h / 2, 7, 0, 7); ctx.fill(); ctx.restore(); }
    const [kx, ky] = P(1.7, 1.6, 0); rrect(ctx, kx - 6, ky - 6, 12, 5, 1, '#8a7a60', OUT, 0.5); ctx.fillStyle = '#f0c030'; for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(kx - 4 + i * 2, ky - 7, 1.2, 0, 7); ctx.fill(); }
  },
  mill(c) {
    const { ctx, P, s } = c;
    isoDiamond(c, 0.1, 0.1, s - 0.1, s - 0.1, '#7f9a52', 'rgba(0,0,0,0.15)');
    isoBox(c, 0.4, 0.5, 1.6, 1.6, 0, 16, E.wood, { leftGrad: true, rightGrad: true, noTop: true });
    cone(c, 1, 1.05, 0.9, 16, 36, E.roof);
    // elven windmill sails (slender leaf sails)
    const [vx, vy] = P(1.6, 1.0, 26); ctx.save(); ctx.translate(vx + 3, vy - 4);
    for (let i = 0; i < 4; i++) { ctx.rotate(Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(6, -8, 0, -18); ctx.quadraticCurveTo(-3, -8, 0, 0); ctx.fillStyle = rgba('#f3e8c0', 0.9); ctx.fill(); ctx.strokeStyle = E.gold; ctx.lineWidth = 0.6; ctx.stroke(); }
    ctx.restore(); ctx.fillStyle = E.gold; ctx.beginPath(); ctx.arc(vx + 3, vy - 4, 1.6, 0, 7); ctx.fill();
    const [bx, by] = P(0.5, 1.7, 0); for (let i = 0; i < 3; i++) { rrect(ctx, bx - 8 + i * 6, by - 6, 5, 5, 1.5, '#c9a877', OUT, 0.5); ctx.fillStyle = i % 2 ? '#d43a4a' : '#f0d060'; ctx.beginPath(); ctx.arc(bx - 5.5 + i * 6, by - 7, 2, 0, 7); ctx.fill(); }
    rrect(ctx, ...P(1, 1.6, 10).map((v, i) => v - (i ? 3 : 1.5)), 3, 5, 1.5, '#ffe9a0', '#7a6a40', 0.5);
  },
  farm(c) {
    const { ctx, P, s, rng } = c;
    isoDiamond(c, 0.05, 0.05, s - 0.05, s - 0.05, '#6a5a3a', 'rgba(0,0,0,0.25)');
    // rows of glowing plants along u
    for (let r = 0; r < 6; r++) {
      const v = 0.3 + r * 0.46;
      const [ax, ay] = P(0.2, v, 0), [bx, by] = P(s - 0.2, v, 0); line(ctx, ax, ay, bx, by, '#4a3a22', 2.2);
      for (let k = 0; k < 7; k++) { const u = 0.35 + k * 0.38; const [x, y] = P(u, v, 0); ell(ctx, x, y - 2, 2.2, 1.6, rng.next() < 0.5 ? '#6fb04a' : '#8fc860'); ctx.fillStyle = rng.next() < 0.4 ? '#f0e0a0' : '#e06080'; ctx.beginPath(); ctx.arc(x, y - 3.5, 0.9, 0, 7); ctx.fill(); }
    }
    fence(c, 0.05, 0.05, s - 0.05, 0.05, '#c9bfa5', 4, 0.6); fence(c, 0.05, 0.05, 0.05, s - 0.05, '#c9bfa5', 4, 0.6);
  },
  barracks(c) {
    const { ctx, P, s, rng } = c;
    isoDiamond(c, 0.05, 0.05, s - 0.05, s - 0.05, '#6f8f52', 'rgba(0,0,0,0.2)');
    isoBox(c, 0.3, 0.6, 2.7, 2.4, 0, 20, E.wood, { leftGrad: true, rightGrad: true, noTop: true });
    isoRoof(c, 0.3, 0.6, 2.7, 2.4, 20, 40, E.roof, true, 0.18);
    // gold trim + windows
    for (let i = 0; i < 4; i++) { const [x, y] = P(0.6 + i * 0.6, 2.4, 10); rrect(ctx, x - 1.4, y - 3, 2.8, 5, 1.4, '#ffe9a0', '#7a6a40', 0.5); }
    const [dx, dy] = P(1.5, 2.4, 0); ctx.beginPath(); ctx.moveTo(dx - 3.5, dy); ctx.lineTo(dx - 3.5, dy - 8); ctx.quadraticCurveTo(dx, dy - 13, dx + 3.5, dy - 8); ctx.lineTo(dx + 3.5, dy); ctx.fillStyle = '#2a2a24'; ctx.fill(); ctx.strokeStyle = E.gold; ctx.lineWidth = 1; ctx.stroke();
    ivy(c, ...P(0.35, 2.4, 2), ...P(0.5, 2.4, 12), ...P(0.9, 2.4, 19));
    // spear rack & training post
    const [rx, ry] = P(2.6, 2.7, 0); for (let i = 0; i < 4; i++) { line(ctx, rx + i * 2.5 - 4, ry, rx + i * 2.5 - 3, ry - 16, '#8a6a40', 0.9); poly(ctx, [[rx + i * 2.5 - 3, ry - 16], [rx + i * 2.5 - 4, ry - 18.5], [rx + i * 2.5 - 2, ry - 18.5]], '#cfd8d8'); }
    const [px, py] = P(0.4, 2.7, 0); line(ctx, px, py, px, py - 12, '#8a6a40', 2.2); ell(ctx, px, py - 9, 3, 3, '#b89a70', OUT, 0.5);
    banner(c, ...P(2.8, 0.4, 0), 30, '#2f5d3a', E.woodD);
    canopy(c, 0.3, 0.3, 30, 13, E.leafG, rng);
  },
  range(c) {
    const { ctx, P, s, rng } = c;
    isoDiamond(c, 0.05, 0.05, s - 0.05, s - 0.05, '#6f8f52', 'rgba(0,0,0,0.2)');
    isoBox(c, 0.3, 0.3, 1.7, 1.7, 0, 16, E.wood, { leftGrad: true, rightGrad: true, noTop: true });
    isoRoof(c, 0.3, 0.3, 1.7, 1.7, 16, 32, E.roof, false, 0.15);
    // raised archer platform
    const [px, py] = P(1.0, 1.0, 32); rrect(ctx, px - 10, py - 1, 20, 2.5, 1, E.woodD, OUT, 0.5); line(ctx, px - 9, py - 1, px - 9, py - 6, E.woodD, 0.8); line(ctx, px + 9, py - 1, px + 9, py - 6, E.woodD, 0.8); line(ctx, px - 9, py - 6, px + 9, py - 6, E.woodD, 0.8);
    // targets
    for (const [u, v] of [[2.5, 1.0], [2.5, 2.0]]) { const [x, y] = P(u, v, 0); line(ctx, x, y, x, y - 12, '#8a6a40', 1.5); ell(ctx, x, y - 13, 5, 5, '#f0e8d0', OUT, 0.5); ell(ctx, x, y - 13, 3.3, 3.3, '#c84e3c'); ell(ctx, x, y - 13, 1.6, 1.6, '#f0e8d0'); ctx.fillStyle = '#2a2a2a'; ctx.beginPath(); ctx.arc(x, y - 13, 0.7, 0, 7); ctx.fill(); line(ctx, x - 1, y - 12, x - 6, y - 9, '#d8c8a0', 0.8); }
    // hay bale
    const [hx, hy] = P(1.2, 2.6, 0); ell(ctx, hx, hy - 3, 6, 3.5, '#d8c070', OUT, 0.5);
    const [dx, dy] = P(1.0, 1.7, 0); rrect(ctx, dx - 3, dy - 9, 6, 9, 2, '#2a2a24', E.gold, 0.8);
    canopy(c, 2.6, 0.3, 28, 12, E.leafG, rng);
  },
  stable(c) {
    const { ctx, P, s, rng } = c;
    isoDiamond(c, 0.05, 0.05, s - 0.05, s - 0.05, '#7a9a52', 'rgba(0,0,0,0.2)');
    fence(c, 0.1, 0.1, 2.9, 0.1, '#c9bfa5', 6, 0.5); fence(c, 0.1, 0.1, 0.1, 2.9, '#c9bfa5', 6, 0.5); fence(c, 2.9, 0.1, 2.9, 1.5, '#c9bfa5', 6, 0.5); fence(c, 0.1, 2.9, 1.3, 2.9, '#c9bfa5', 6, 0.5);
    isoBox(c, 0.4, 1.6, 1.6, 2.7, 0, 14, E.wood, { leftGrad: true, rightGrad: true, noTop: true });
    isoRoof(c, 0.4, 1.6, 1.6, 2.7, 14, 26, E.roof, true, 0.15);
    // stag in the yard
    const [sx, sy] = P(2.1, 1.1, 0); ctx.save(); ctx.translate(sx, sy); ctx.scale(0.9, 0.9); drawMount(ctx, 'stag', 'f', { walk: 0 }, true); ctx.restore();
    const [tx, ty] = P(2.3, 2.3, 0); rrect(ctx, tx - 7, ty - 4, 14, 4, 1, '#8a7a60', OUT, 0.5); rrect(ctx, tx - 6, ty - 5, 12, 2, 1, '#6fb04a');
    canopy(c, 2.7, 2.7, 34, 15, E.leafG, rng); cylinder(c, 2.7, 2.7, 0.14, 0, 20, E.trunk);
  },
  smith(c) {
    const { ctx, P, s, rng } = c;
    isoDiamond(c, 0.05, 0.05, s - 0.05, s - 0.05, '#6f8f52', 'rgba(0,0,0,0.2)');
    isoBox(c, 0.3, 0.5, 2.2, 2.5, 0, 18, E.stone, { leftGrad: true, rightGrad: true, noTop: true });
    isoRoof(c, 0.3, 0.5, 2.2, 2.5, 18, 34, E.roofD, true, 0.15);
    // star-forge chimney with pale blue smoke glow
    cylinder(c, 0.7, 0.9, 0.22, 30, 48, E.stone);
    const [cx, cy] = P(0.7, 0.9, 48); for (let i = 0; i < 4; i++) ell(ctx, cx + i * 2 - 1, cy - 4 - i * 5, 3 + i, 2.5 + i * 0.7, rgba('#dfe8ff', 0.35 - i * 0.07));
    // open front with anvil and glowing hearth
    const [dx, dy] = P(1.3, 2.5, 0); rrect(ctx, dx - 7, dy - 13, 14, 13, 2, '#1e1e22');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(dx, dy - 5, 0, dx, dy - 5, 10); g.addColorStop(0, 'rgba(160,220,255,.7)'); g.addColorStop(1, 'rgba(160,220,255,0)'); ctx.fillStyle = g; ctx.fillRect(dx - 12, dy - 16, 24, 18); ctx.restore();
    const [ax, ay] = P(2.5, 2.2, 0); rrect(ctx, ax - 4, ay - 7, 8, 3, 1, '#6a6a70', OUT, 0.5); rrect(ctx, ax - 2, ay - 4, 4, 4, 0, '#4a4a50', OUT, 0.5); poly(ctx, [[ax + 4, ay - 6], [ax + 7, ay - 6.5], [ax + 4, ay - 4.5]], '#6a6a70', OUT, 0.4);
    lantern(c, ...P(0.3, 2.5, 14), '#bfe8ff');
  },
  tower(c) {
    const { ctx, P, s, rng } = c;
    isoDiamond(c, 0.05, 0.05, s - 0.05, s - 0.05, '#6f8f52', 'rgba(0,0,0,0.2)');
    trunk(c, 0.5, 0.5, 0.34, 0.22, 0, 60, E.trunk);
    const [px, py] = P(0.5, 0.5, 60); rrect(ctx, px - 13, py - 2, 26, 3.5, 1.5, E.woodD, OUT, 0.6);
    poly(ctx, [[px - 11, py - 2], [px + 11, py - 2], [px + 11, py - 9], [px - 11, py - 9]], E.wood, OUT, 0.6);
    for (let i = -8; i <= 8; i += 4) rrect(ctx, px + i - 1, py - 8, 2, 3, 0.5, '#2a2a24');
    poly(ctx, [[px - 14, py - 9], [px + 14, py - 9], [px, py - 24]], vgrad(ctx, 0, py - 24, py - 9, shade(E.roof, 0.3), E.roofD), OUT, 0.7);
    lantern(c, px, py - 5, '#ffe9a0');
    canopy(c, 0.5, 0.5, 78, 16, E.leafG, rng);
    // rope ladder
    const [lx, ly] = P(0.9, 0.9, 0); line(ctx, lx, ly, px + 8, py, '#8a7a5a', 0.8);
  },
  siege(c) {
    const { ctx, P, s, rng } = c;
    isoDiamond(c, 0.05, 0.05, s - 0.05, s - 0.05, '#5f8f52', 'rgba(0,0,0,0.2)');
    // ring of standing stones with runes
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; const u = 1.5 + Math.cos(a) * 1.15, v = 1.5 + Math.sin(a) * 1.15; const [x, y] = P(u, v, 0); const h = 14 + (i % 3) * 4; poly(ctx, [[x - 3, y], [x + 3, y + 0.5], [x + 2.5, y - h], [x - 2.5, y - h + 2]], vgrad(ctx, 0, y - h, y, '#b8c0b8', '#5a6a5a'), OUT, 0.7); ctx.fillStyle = '#9fe0a0'; ctx.fillRect(x - 0.5, y - h + 4, 1, 4); }
    // central awakening tree-kin (sapling with glowing eyes)
    const [cx, cy] = P(1.5, 1.5, 0); ctx.save(); ctx.translate(cx, cy); ctx.scale(0.8, 0.8); drawGiant(ctx, { giant: 'treekin' }, 'f', { walk: 0 }, {}); ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(cx, cy - 10, 0, cx, cy - 10, 30); g.addColorStop(0, 'rgba(120,240,140,.25)'); g.addColorStop(1, 'rgba(120,240,140,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy - 10, 30, 0, 7); ctx.fill(); ctx.restore();
  },
  shrine(c) {
    const { ctx, P, s, rng } = c;
    isoDiamond(c, 0.05, 0.05, s - 0.05, s - 0.05, '#5f8f52', 'rgba(0,0,0,0.2)');
    roots(c, 1.5, 1.5, 36, '#9a8a6a');
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2 + 0.6; const [x, y] = P(1.5 + Math.cos(a) * 1.25, 1.5 + Math.sin(a) * 1.25, 0); poly(ctx, [[x - 2.5, y], [x + 2.5, y], [x + 2, y - 12], [x - 2, y - 11]], '#aab0a8', OUT, 0.6); }
    trunk(c, 1.5, 1.5, 0.58, 0.4, 0, 46, '#8a7a60');
    // face in the oak
    const [fx, fy] = P(1.5, 1.95, 22); ctx.fillStyle = '#9fe060'; ctx.shadowColor = '#9fe060'; ctx.shadowBlur = 6; ctx.beginPath(); ctx.arc(fx - 4, fy, 1.4, 0, 7); ctx.arc(fx + 4, fy, 1.4, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    ctx.strokeStyle = '#3a2e22'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(fx - 4, fy + 7); ctx.quadraticCurveTo(fx, fy + 10, fx + 4, fy + 7); ctx.stroke();
    for (const [u, v, z] of [[1.0, 1.2, 40], [2.0, 1.1, 44], [1.6, 2.0, 36]]) { const [x0, y0] = P(1.5, 1.5, z - 4), [x1, y1] = P(u, v, z + 8); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2, y1 + 3, x1, y1); ctx.strokeStyle = '#8a7a60'; ctx.lineWidth = 4; ctx.stroke(); }
    canopy(c, 1.5, 1.5, 62, 34, E.leaf, rng);
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; const [gx, gy] = P(1.5, 1.5, 55); const g = ctx.createRadialGradient(gx, gy, 0, gx, gy, 45); g.addColorStop(0, 'rgba(255,240,170,.3)'); g.addColorStop(1, 'rgba(255,240,170,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gx, gy, 45, 0, 7); ctx.fill(); ctx.restore();
    ctx.fillStyle = 'rgba(255,250,210,.95)'; for (let i = 0; i < 12; i++) { const [x, y] = P(1.5 + rng.range(-1.3, 1.3), 1.5 + rng.range(-1.3, 1.3), rng.range(10, 70)); ctx.beginPath(); ctx.arc(x, y, 1, 0, 7); ctx.fill(); }
  },
};

// ======================== ORCS ========================
const O = { wood: '#4a3220', woodD: '#2a1a10', iron: '#555558', bone: '#d9cfb0', red: '#8a1f1f', hide: '#6a4a3a', mud: '#3a2a1e', rock: '#5a5452' };
const ORC = {
  tc(c) {
    const { ctx, P, s, rng } = c;
    isoDiamond(c, 0.05, 0.05, s - 0.05, s - 0.05, O.mud, 'rgba(0,0,0,0.3)');
    // palisade around
    fence(c, 0.1, 0.1, 3.9, 0.1, O.wood, 16, 0.3, true); fence(c, 0.1, 0.1, 0.1, 3.9, O.wood, 16, 0.3, true);
    fence(c, 3.9, 0.1, 3.9, 1.3, O.wood, 16, 0.3, true); fence(c, 3.9, 2.7, 3.9, 3.9, O.wood, 16, 0.3, true);
    fence(c, 0.1, 3.9, 1.3, 3.9, O.wood, 16, 0.3, true); fence(c, 2.7, 3.9, 3.9, 3.9, O.wood, 16, 0.3, true);
    // main keep: crude iron-banded box with hide roof
    isoBox(c, 0.9, 0.9, 3.1, 3.1, 0, 34, O.wood, { leftGrad: true, rightGrad: true, noTop: true });
    // iron bands
    for (const z of [10, 24]) { const [a, b] = [P(0.9, 3.1, z), P(3.1, 3.1, z)]; line(ctx, a[0], a[1], b[0], b[1], O.iron, 1.6); const [d, e] = [P(3.1, 0.9, z), P(3.1, 3.1, z)]; line(ctx, d[0], d[1], e[0], e[1], shade(O.iron, -0.3), 1.6); }
    isoRoof(c, 0.9, 0.9, 3.1, 3.1, 34, 60, O.hide, true, 0.25);
    // giant horned skull on the ridge
    const [sx, sy] = P(2, 2, 62); ctx.save(); ctx.translate(sx, sy); ctx.scale(2.6, 2.6); skull(c, 0, -3, 3); ctx.restore();
    ctx.strokeStyle = O.bone; ctx.lineWidth = 2.2; for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx + d * 7, sy - 12); ctx.quadraticCurveTo(sx + d * 18, sy - 18, sx + d * 14, sy - 32); ctx.stroke(); }
    // gate
    const [gx, gy] = P(2, 3.1, 0); rrect(ctx, gx - 6, gy - 16, 12, 16, 1, '#1a1210', O.iron, 1.2); for (let i = 0; i < 3; i++) spike(c, gx - 4 + i * 4, gy - 16, 5, O.iron);
    // torches & banners
    torch(c, ...P(1.3, 3.3, 0), 14); torch(c, ...P(2.7, 3.3, 0), 14); torch(c, ...P(3.3, 1.5, 0), 14);
    banner(c, ...P(0.4, 3.6, 0), 36, O.red, O.woodD); banner(c, ...P(3.6, 3.6, 0), 36, '#1e1e22', O.woodD);
    // skull pile and spikes with skulls
    for (const [u, v] of [[0.5, 2.0], [3.5, 0.7], [0.7, 0.6]]) { const [x, y] = P(u, v, 0); line(ctx, x, y, x, y - 18, O.wood, 1.4); skull(c, x, y - 20, 2.4); }
    const [px, py] = P(3.3, 2.8, 0); for (let i = 0; i < 5; i++) skull(c, px - 4 + (i % 3) * 4, py - 2 - Math.floor(i / 3) * 3.5, 2);
  },
  house(c) {
    const { ctx, P, s, rng } = c;
    isoDiamond(c, 0.1, 0.1, s - 0.1, s - 0.1, O.mud, 'rgba(0,0,0,0.25)');
    // round hide dome
    const [cx, cy] = P(1, 1, 0);
    ctx.beginPath(); ctx.moveTo(cx - 20, cy); ctx.quadraticCurveTo(cx - 20, cy - 26, cx, cy - 28); ctx.quadraticCurveTo(cx + 20, cy - 26, cx + 20, cy); ctx.closePath();
    const g = ctx.createRadialGradient(cx - 6, cy - 20, 2, cx, cy - 12, 24); g.addColorStop(0, shade(O.hide, 0.25)); g.addColorStop(1, shade(O.hide, -0.5)); ctx.fillStyle = g; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.8; ctx.stroke();
    // stitching
    ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(cx - 8, cy - 25); ctx.quadraticCurveTo(cx - 10, cy - 12, cx - 12, cy); ctx.moveTo(cx + 6, cy - 26); ctx.quadraticCurveTo(cx + 10, cy - 14, cx + 11, cy); ctx.stroke();
    for (let i = 0; i < 5; i++) { ctx.fillStyle = O.bone; ctx.fillRect(cx - 9 + i * 0.5 - 0.3, cy - 22 + i * 4.5, 1.2, 0.7); }
    // door & skull
    rrect(ctx, cx - 4, cy - 10, 8, 10, 3, '#1a1210', O.woodD, 0.8);
    skull(c, cx, cy - 30, 2.6); spike(c, cx, cy - 32, 5, O.wood);
    const [tx, ty] = P(1.7, 1.7, 0); torch(c, tx, ty, 9);
  },
  lumber(c) {
    const { ctx, P, s } = c;
    dirtPatch(c, O.mud);
    const [lx, ly] = P(0.7, 1.4, 0); logsPile(c, lx, ly - 2, 5);
    const [sx, sy] = P(1.4, 0.8, 0); cylinder(c, 1.4, 0.8, 0.3, 0, 9, '#5a3f28', '#8a6a48');
    // big choppa stuck in the stump
    line(ctx, sx + 2, sy - 9, sx + 8, sy - 22, '#3a2a1a', 1.6); poly(ctx, [[sx + 8, sy - 22], [sx + 14, sy - 24], [sx + 13, sy - 17], [sx + 9, sy - 18]], '#7a7a74', OUT, 0.6);
    // lean-to of hides
    const [hx, hy] = P(1.6, 1.6, 0); poly(ctx, [[hx - 10, hy], [hx + 8, hy + 2], [hx + 8, hy - 14], [hx - 10, hy - 10]], O.hide, OUT, 0.7); line(ctx, hx - 10, hy, hx - 10, hy - 10, O.wood, 1.4); line(ctx, hx + 8, hy + 2, hx + 8, hy - 14, O.wood, 1.4);
    skull(c, hx + 8, hy - 16, 2);
  },
  mine(c) {
    const { ctx, P, s } = c;
    dirtPatch(c, '#2e2620');
    const [mx, my] = P(1, 0.9, 0);
    poly(ctx, [[mx - 26, my + 4], [mx - 18, my - 12], [mx - 2, my - 20], [mx + 14, my - 16], [mx + 24, my - 4], [mx + 22, my + 6]], vgrad(ctx, 0, my - 20, my + 6, '#6a6058', '#3a342e'), OUT, 0.8);
    // timber frame mine shaft
    rrect(ctx, mx - 8, my - 12, 16, 17, 1, '#0e0a08'); line(ctx, mx - 8, my + 5, mx - 8, my - 12, O.wood, 2.2); line(ctx, mx + 8, my + 5, mx + 8, my - 12, O.wood, 2.2); line(ctx, mx - 10, my - 12, mx + 10, my - 12, O.wood, 2.6);
    // rail cart with gold
    const [kx, ky] = P(1.7, 1.6, 0); rrect(ctx, kx - 7, ky - 7, 14, 6, 1, O.iron, OUT, 0.6); ell(ctx, kx - 4, ky, 1.8, 1.8, '#2a2a2a'); ell(ctx, kx + 4, ky, 1.8, 1.8, '#2a2a2a'); ctx.fillStyle = '#f0c030'; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(kx - 5 + i * 2, ky - 8, 1.3, 0, 7); ctx.fill(); }
    for (let i = 0; i < 4; i++) skull(c, mx - 22 + i * 3.5, my + 3 - (i % 2) * 2, 1.7);
    torch(c, mx - 12, my + 2, 10);
  },
  mill(c) {
    const { ctx, P, s } = c;
    dirtPatch(c, O.mud);
    // hide canopy on poles
    for (const [u, v] of [[0.2, 0.2], [1.8, 0.2], [0.2, 1.8], [1.8, 1.8]]) { const [x, y] = P(u, v, 0); line(ctx, x, y, x, y - 24, O.wood, 1.6); }
    poly(ctx, [P(0.1, 0.1, 24), P(1.9, 0.1, 22), P(1.9, 1.9, 24), P(0.1, 1.9, 22)], vgrad(ctx, 0, P(1, 0, 24)[1], P(1, 2, 22)[1], shade(O.hide, 0.2), shade(O.hide, -0.3)), OUT, 0.8);
    // loot: sacks, barrels, meat
    const [bx, by] = P(0.9, 1.1, 0);
    rrect(ctx, bx - 14, by - 8, 7, 9, 2, '#8a6a40', OUT, 0.6); rrect(ctx, bx - 6, by - 10, 7, 11, 2, '#5a3a20', OUT, 0.6); ell(ctx, bx + 6, by - 4, 5, 4.5, '#b89a60', OUT, 0.6); ell(ctx, bx + 2, by - 10, 4, 3.5, '#b89a60', OUT, 0.6);
    ell(ctx, bx + 12, by - 3, 5, 3, '#9a3a30', OUT, 0.6); line(ctx, bx + 15, by - 5, bx + 19, by - 8, O.bone, 1.4);
    ctx.fillStyle = '#f0c030'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(bx - 10 + i * 2.5, by - 9.5, 1.1, 0, 7); ctx.fill(); }
    skull(c, bx - 16, by - 10, 1.8);
  },
  farm(c) {
    const { ctx, P, s, rng } = c;
    isoDiamond(c, 0.05, 0.05, s - 0.05, s - 0.05, '#3a2a1e', 'rgba(0,0,0,0.3)');
    // muddy puddles
    for (let i = 0; i < 4; i++) { const [x, y] = P(rng.range(0.4, 2.6), rng.range(0.4, 2.6), 0); ell(ctx, x, y, 6, 2.5, '#2a2018'); }
    // squigs (red bouncing blobs)
    for (let i = 0; i < 6; i++) { const [x, y] = P(rng.range(0.4, 2.6), rng.range(0.4, 2.6), 0); ell(ctx, x, y - 3, 3.2, 3, vgrad(ctx, 0, y - 6, y, '#e04a3a', '#7a1a10'), OUT, 0.6); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - 1, y - 4, 0.8, 0, 7); ctx.fill(); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(x - 0.8, y - 4, 0.4, 0, 7); ctx.fill(); ctx.fillStyle = '#f0e8d0'; poly(ctx, [[x - 1.5, y - 1.5], [x - 1, y - 0.2], [x - 0.5, y - 1.5]], '#f0e8d0'); poly(ctx, [[x + 0.5, y - 1.5], [x + 1, y - 0.2], [x + 1.5, y - 1.5]], '#f0e8d0'); }
    fence(c, 0.05, 0.05, s - 0.05, 0.05, O.wood, 6, 0.4, true); fence(c, 0.05, 0.05, 0.05, s - 0.05, O.wood, 6, 0.4, true);
    fence(c, s - 0.05, 0.05, s - 0.05, s - 0.05, O.wood, 6, 0.4); fence(c, 0.05, s - 0.05, s - 0.05, s - 0.05, O.wood, 6, 0.4);
  },
  barracks(c) {
    const { ctx, P, s, rng } = c;
    dirtPatch(c, O.mud);
    // fighting pit: sunken ring with spikes
    const [cx, cy] = P(1.5, 1.5, 0); ell(ctx, cx, cy, 34, 17, '#1e1610', OUT, 1); ell(ctx, cx, cy + 1, 26, 12, '#2e2218');
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; spike(c, cx + Math.cos(a) * 34, cy + Math.sin(a) * 17, 7, O.wood); }
    // hut with weapon racks
    isoBox(c, 0.2, 0.2, 1.3, 1.2, 0, 16, O.wood, { leftGrad: true, rightGrad: true, noTop: true });
    isoRoof(c, 0.2, 0.2, 1.3, 1.2, 16, 28, O.hide, true, 0.2);
    const [rx, ry] = P(2.6, 2.7, 0); for (let i = 0; i < 4; i++) { line(ctx, rx + i * 2.6 - 4, ry, rx + i * 2.6 - 3, ry - 14, '#5a4030', 1); poly(ctx, [[rx + i * 2.6 - 3, ry - 14], [rx + i * 2.6 - 1, ry - 20], [rx + i * 2.6 - 4.5, ry - 17]], '#7a7a74', OUT, 0.5); }
    banner(c, ...P(2.8, 0.3, 0), 30, O.red, O.woodD);
    torch(c, ...P(0.3, 2.7, 0), 12); skull(c, ...P(1.3, 1.2, 30), 2.4);
    // blood splatter
    ctx.fillStyle = 'rgba(120,20,20,.6)'; for (let i = 0; i < 5; i++) ell(ctx, cx + rng.range(-20, 20), cy + rng.range(-8, 8), 2.5, 1.2, 'rgba(120,20,20,.6)');
  },
  range(c) {
    const { ctx, P, s, rng } = c;
    dirtPatch(c, O.mud);
    // lean-to shack
    isoBox(c, 0.3, 0.3, 1.8, 1.7, 0, 14, O.wood, { leftGrad: true, rightGrad: true, noTop: true });
    poly(ctx, [P(0.15, 0.15, 14), P(1.95, 0.15, 26), P(1.95, 1.85, 26), P(0.15, 1.85, 14)], vgrad(ctx, 0, P(1, 0, 26)[1], P(1, 2, 14)[1], shade(O.hide, 0.2), shade(O.hide, -0.3)), OUT, 0.8);
    // target dummies (captured elf effigies)
    for (const [u, v] of [[2.5, 1.0], [2.5, 2.0]]) { const [x, y] = P(u, v, 0); line(ctx, x, y, x, y - 14, '#5a4030', 1.5); line(ctx, x - 5, y - 10, x + 5, y - 10, '#5a4030', 1.3); ell(ctx, x, y - 8, 3.5, 4, '#b89a60', OUT, 0.5); ell(ctx, x, y - 14, 2.2, 2.2, '#b89a60', OUT, 0.5); for (let i = 0; i < 3; i++) line(ctx, x - 3 + i * 3, y - 7 + i, x - 7 + i * 3, y - 11 + i, '#d8c8a0', 0.8); }
    const [qx, qy] = P(1.3, 2.6, 0); rrect(ctx, qx - 5, qy - 8, 10, 8, 1, '#5a3a20', OUT, 0.6); for (let i = 0; i < 5; i++) line(ctx, qx - 3 + i * 1.5, qy - 8, qx - 4 + i * 1.5, qy - 15, '#d8c8a0', 0.7);
    torch(c, ...P(0.3, 2.7, 0), 11); skull(c, ...P(1.9, 0.2, 26), 2);
  },
  stable(c) {
    const { ctx, P, s, rng } = c;
    dirtPatch(c, '#2e2218');
    fence(c, 0.1, 0.1, 2.9, 0.1, O.wood, 7, 0.4, true); fence(c, 0.1, 0.1, 0.1, 2.9, O.wood, 7, 0.4, true); fence(c, 2.9, 0.1, 2.9, 1.4, O.wood, 7, 0.4); fence(c, 0.1, 2.9, 1.3, 2.9, O.wood, 7, 0.4);
    isoBox(c, 0.4, 1.7, 1.5, 2.7, 0, 12, O.wood, { leftGrad: true, rightGrad: true, noTop: true });
    isoRoof(c, 0.4, 1.7, 1.5, 2.7, 12, 22, O.hide, true, 0.15);
    const [bx, by] = P(2.0, 1.1, 0); ctx.save(); ctx.translate(bx, by); ctx.scale(0.95, 0.95); drawMount(ctx, 'boar', 'f', { walk: 0 }, true); ctx.restore();
    const [tx, ty] = P(2.3, 2.3, 0); rrect(ctx, tx - 7, ty - 4, 14, 4, 1, '#3a2a1a', OUT, 0.5); ell(ctx, tx, ty - 4, 6, 1.5, '#5a3a30');
    skull(c, ...P(1.5, 2.7, 24), 2.2); torch(c, ...P(2.8, 2.8, 0), 11);
  },
  smith(c) {
    const { ctx, P, s, rng } = c;
    dirtPatch(c, '#2a2018');
    isoBox(c, 0.3, 0.5, 2.2, 2.5, 0, 18, O.rock, { leftGrad: true, rightGrad: true, noTop: true });
    isoRoof(c, 0.3, 0.5, 2.2, 2.5, 18, 32, '#2e2a2a', true, 0.15);
    cylinder(c, 0.7, 0.9, 0.24, 28, 50, O.rock);
    const [cx, cy] = P(0.7, 0.9, 50); for (let i = 0; i < 4; i++) ell(ctx, cx + i * 2.5 - 1, cy - 4 - i * 5, 3.5 + i * 1.2, 2.8 + i * 0.8, rgba('#1a1a1a', 0.45 - i * 0.08));
    const [dx, dy] = P(1.3, 2.5, 0); rrect(ctx, dx - 8, dy - 14, 16, 14, 1, '#120c08');
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(dx, dy - 5, 0, dx, dy - 5, 12); g.addColorStop(0, 'rgba(255,140,40,.85)'); g.addColorStop(1, 'rgba(255,140,40,0)'); ctx.fillStyle = g; ctx.fillRect(dx - 14, dy - 18, 28, 20); ctx.restore();
    const [ax, ay] = P(2.5, 2.2, 0); rrect(ctx, ax - 5, ay - 8, 10, 3.5, 1, '#3a3a40', OUT, 0.6); rrect(ctx, ax - 2.5, ay - 4.5, 5, 4.5, 0, '#2a2a30', OUT, 0.5); poly(ctx, [[ax + 5, ay - 7], [ax + 9, ay - 7.5], [ax + 5, ay - 5]], '#3a3a40', OUT, 0.4);
    // chains and skull
    ctx.strokeStyle = '#6a6a70'; ctx.lineWidth = 0.9; ctx.setLineDash([1.5, 1.2]); const [k1x, k1y] = P(0.3, 2.5, 16); ctx.beginPath(); ctx.moveTo(k1x, k1y); ctx.quadraticCurveTo(k1x + 6, k1y + 6, k1x + 12, k1y + 2); ctx.stroke(); ctx.setLineDash([]);
    skull(c, ...P(2.2, 0.5, 34), 2.6); torch(c, ...P(2.6, 2.7, 0), 10);
  },
  tower(c) {
    const { ctx, P, s, rng } = c;
    dirtPatch(c, O.mud, 0.05);
    const [bx, by] = P(0.5, 0.5, 0);
    // tapered timber tower
    poly(ctx, [[bx - 15, by + 2], [bx + 15, by + 2], [bx + 10, by - 50], [bx - 10, by - 50]], vgrad(ctx, 0, by - 50, by, shade(O.wood, 0.15), shade(O.wood, -0.35)), OUT, 0.9);
    ctx.strokeStyle = O.woodD; ctx.lineWidth = 0.8; for (let i = 0; i < 6; i++) { const y = by - 6 - i * 8, w = 15 - i * 0.9; line(ctx, bx - w, y, bx + w, y - 1, O.woodD, 0.8); }
    line(ctx, bx - 13, by - 10, bx + 13, by - 42, '#3a2a1a', 1.2); line(ctx, bx + 13, by - 10, bx - 13, by - 42, '#3a2a1a', 1.2);
    // platform
    rrect(ctx, bx - 14, by - 52, 28, 4, 1, O.woodD, OUT, 0.6);
    for (let i = -12; i <= 12; i += 6) { line(ctx, bx + i, by - 52, bx + i, by - 60, O.wood, 1.6); spike(c, bx + i, by - 60, 3, O.wood); }
    line(ctx, bx - 12, by - 57, bx + 12, by - 57, O.wood, 1.2);
    poly(ctx, [[bx - 16, by - 60], [bx + 16, by - 60], [bx + 2, by - 74], [bx - 4, by - 74]], O.hide, OUT, 0.7);
    for (let i = 0; i < 3; i++) skull(c, bx - 8 + i * 8, by - 48, 2);
    torch(c, bx + 14, by - 54, 8); torch(c, bx - 14, by - 54, 8);
    banner(c, bx, by - 72, 16, O.red, O.woodD);
  },
  siege(c) {
    const { ctx, P, s, rng } = c;
    dirtPatch(c, '#2a2420');
    const [cx, cy] = P(1.5, 1.2, 0);
    // rocky cave
    poly(ctx, [[cx - 40, cy + 14], [cx - 34, cy - 10], [cx - 18, cy - 28], [cx + 4, cy - 34], [cx + 24, cy - 26], [cx + 38, cy - 6], [cx + 36, cy + 14]], vgrad(ctx, 0, cy - 34, cy + 14, '#6a625a', '#2e2a26'), OUT, 1);
    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 0.8; for (let i = 0; i < 6; i++) { line(ctx, cx + rng.range(-30, 30), cy + rng.range(-25, 5), cx + rng.range(-30, 30), cy + rng.range(-25, 5), 'rgba(0,0,0,.35)', 0.8); }
    ctx.beginPath(); ctx.moveTo(cx - 14, cy + 14); ctx.quadraticCurveTo(cx - 16, cy - 10, cx, cy - 16); ctx.quadraticCurveTo(cx + 16, cy - 10, cx + 14, cy + 14); ctx.closePath(); ctx.fillStyle = '#0a0806'; ctx.fill();
    // bones, chains
    for (let i = 0; i < 5; i++) skull(c, cx - 30 + i * 5, cy + 12 - (i % 2) * 2.5, 2); line(ctx, cx + 20, cy + 8, cx + 30, cy + 11, O.bone, 1.6); line(ctx, cx + 24, cy + 2, cx + 33, cy + 6, O.bone, 1.4);
    ctx.strokeStyle = '#6a6a70'; ctx.lineWidth = 1; ctx.setLineDash([2, 1.5]); ctx.beginPath(); ctx.moveTo(cx - 14, cy - 2); ctx.quadraticCurveTo(cx - 8, cy + 8, cx + 2, cy + 6); ctx.stroke(); ctx.setLineDash([]);
    // glowing eyes in the dark
    ctx.fillStyle = '#ffd040'; ctx.beginPath(); ctx.arc(cx - 3, cy - 4, 1.2, 0, 7); ctx.arc(cx + 3, cy - 4, 1.2, 0, 7); ctx.fill();
    torch(c, cx - 22, cy + 10, 12); torch(c, cx + 22, cy + 10, 12);
  },
  shrine(c) {
    const { ctx, P, s, rng } = c;
    dirtPatch(c, '#2a2018');
    // fire pit ring
    const [cx, cy] = P(1.5, 1.5, 0);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; const x = cx + Math.cos(a) * 30, y = cy + Math.sin(a) * 15; line(ctx, x, y, x, y - 10, O.wood, 1.6); if (i % 2) skull(c, x, y - 12, 1.8); else torch(c, x, y, 10); }
    // great idol of Gork: crude wood/iron giant face
    isoBox(c, 1.0, 1.0, 2.0, 2.0, 0, 14, O.rock, { leftGrad: true, rightGrad: true });
    const [ix, iy] = P(1.5, 1.5, 14);
    poly(ctx, [[ix - 18, iy], [ix + 18, iy], [ix + 14, iy - 48], [ix - 14, iy - 48]], vgrad(ctx, 0, iy - 48, iy, '#5a4a30', '#2a1e14'), OUT, 1);
    // face
    ell(ctx, ix - 7, iy - 34, 4.5, 3.5, '#120c08'); ell(ctx, ix + 7, iy - 34, 4.5, 3.5, '#120c08');
    ctx.fillStyle = '#ff4020'; ctx.shadowColor = '#ff6030'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(ix - 7, iy - 34, 2, 0, 7); ctx.arc(ix + 7, iy - 34, 2, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    rrect(ctx, ix - 12, iy - 22, 24, 9, 2, '#120c08', OUT, 0.8); ctx.fillStyle = O.bone; for (let i = 0; i < 6; i++) poly(ctx, [[ix - 10 + i * 4, iy - 22], [ix - 8 + i * 4, iy - 22], [ix - 9 + i * 4, iy - 17]], O.bone);
    for (const d of [-1, 1]) { ctx.beginPath(); ctx.moveTo(ix + d * 12, iy - 46); ctx.quadraticCurveTo(ix + d * 24, iy - 52, ix + d * 20, iy - 68); ctx.strokeStyle = O.bone; ctx.lineWidth = 3; ctx.stroke(); }
    // iron plates
    ctx.fillStyle = O.iron; for (const [px, py] of [[ix - 10, iy - 10], [ix + 6, iy - 8], [ix - 2, iy - 44]]) { rrect(ctx, px, py, 6, 5, 0.5, O.iron, OUT, 0.5); }
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; const g = ctx.createRadialGradient(ix, iy - 20, 0, ix, iy - 20, 44); g.addColorStop(0, 'rgba(255,100,40,.22)'); g.addColorStop(1, 'rgba(255,100,40,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ix, iy - 20, 44, 0, 7); ctx.fill(); ctx.restore();
    banner(c, ...P(0.3, 2.8, 0), 30, O.red, O.woodD); banner(c, ...P(2.8, 2.8, 0), 30, '#1e1e22', O.woodD);
  },
};

// ---------------------------------------------------------------------
//  Rubble (destroyed building) and misc
// ---------------------------------------------------------------------
export function rubbleSprite(size, variant) {
  return cached(`rubble|${size}|${variant % 3}`, (size * TW + 20) * BSCALE, (size * TH + 40) * BSCALE, (ctx) => {
    ctx.scale(BSCALE, BSCALE); ctx.translate(size * HW + 10, size * HH + 30);
    const rng = new RNG(variant * 17 + 3);
    poly(ctx, [[0, -size * HH], [size * HW, 0], [0, size * HH], [-size * HW, 0]], 'rgba(40,30,20,.55)');
    for (let i = 0; i < size * 6; i++) { const x = rng.range(-size * HW * 0.7, size * HW * 0.7), y = rng.range(-size * HH * 0.6, size * HH * 0.6); poly(ctx, [[x - 4, y + 2], [x + 3, y + 3], [x + 4, y - 3], [x - 2, y - 5]], rng.next() < 0.5 ? '#5a4a3a' : '#7a7068', OUT, 0.5); }
    for (let i = 0; i < 3; i++) ell(ctx, rng.range(-20, 20), rng.range(-14, -6) - i * 6, 6 + i * 2, 4 + i, rgba('#444', 0.3 - i * 0.08));
  });
}

// ---------------------------------------------------------------------
//  UI ICONS (drawn into a given canvas, size px)
// ---------------------------------------------------------------------
export function drawIcon(canvas, kind, extra) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.save(); ctx.translate(w / 2, h / 2); ctx.scale(w / 24, h / 24); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  switch (kind) {
    case 'food': ell(ctx, -1, 1, 7, 5.5, vgrad(ctx, 0, -5, 6, '#e07a4a', '#8a3a20'), OUT, 0.8); line(ctx, 5, -2, 9, -6, '#f0e8d0', 2.4); ell(ctx, 9.5, -6.5, 1.6, 1.6, '#f0e8d0'); break;
    case 'wood': rrect(ctx, -9, -3, 18, 7, 3.5, vgrad(ctx, 0, -3, 4, '#9a7048', '#5a3a20'), OUT, 0.8); ell(ctx, 9, 0.5, 2.6, 3.5, '#d8b888', OUT, 0.6); ell(ctx, 9, 0.5, 1.2, 1.6, '#a88858'); break;
    case 'gold': for (const [x, y] of [[-4, 3], [3, 3], [-0.5, -2]]) { ell(ctx, x, y + 1.5, 5, 2, '#9a7a20'); ell(ctx, x, y, 5, 2, vgrad(ctx, 0, y - 2, y + 2, '#ffe070', '#c09020'), '#6a4a10', 0.6); } break;
    case 'stone': poly(ctx, [[-9, 5], [-6, -4], [1, -7], [8, -3], [9, 5]], vgrad(ctx, 0, -7, 5, '#b0b4b0', '#5a5e5a'), OUT, 0.8); line(ctx, -2, -4, 2, 3, 'rgba(0,0,0,.3)', 0.7); break;
    case 'pop': ell(ctx, 0, -5, 3.2, 3.2, '#e8d8c0', OUT, 0.7); poly(ctx, [[-6, 8], [-5, -1], [5, -1], [6, 8]], '#8fbf5a', OUT, 0.7); break;
    case 'stop': poly(ctx, [[-4, -9], [4, -9], [9, -4], [9, 4], [4, 9], [-4, 9], [-9, 4], [-9, -4]], '#c84e3c', '#4a1a12', 1); line(ctx, -4, -4, 4, 4, '#fff', 2); line(ctx, 4, -4, -4, 4, '#fff', 2); break;
    case 'attackmove': line(ctx, -8, 8, 6, -6, '#cfd8d8', 2.4); line(ctx, 8, 8, -6, -6, '#cfd8d8', 2.4); line(ctx, -8, 8, 6, -6, '#444', 0.6); line(ctx, 8, 8, -6, -6, '#444', 0.6); poly(ctx, [[6, -6], [9, -9], [8, -5]], '#d9b857'); poly(ctx, [[-6, -6], [-9, -9], [-8, -5]], '#d9b857'); break;
    case 'rally': line(ctx, -5, 9, -5, -9, '#8a6a40', 1.8); poly(ctx, [[-5, -9], [8, -6], [-5, -2]], '#d9b857', OUT, 0.7); break;
    case 'delete': skull({ ctx }, 0, -1, 6); line(ctx, -7, 7, 7, -7, '#c84e3c', 2); break;
    case 'back': poly(ctx, [[-8, 0], [0, -8], [0, -3], [8, -3], [8, 3], [0, 3], [0, 8]], '#d9b857', OUT, 0.8); break;
    case 'box': ctx.setLineDash([3, 2]); rrect(ctx, -8, -8, 16, 16, 2, null, '#f0e6cc', 1.5); ctx.setLineDash([]); ell(ctx, 3, 3, 2.5, 2.5, '#8fbf5a', OUT, 0.6); ell(ctx, -3, -2, 2.5, 2.5, '#8fbf5a', OUT, 0.6); break;
    case 'idle': ell(ctx, -2, -4, 4, 4, '#f2dcc4', OUT, 0.7); poly(ctx, [[-8, 10], [-7, 1], [3, 1], [4, 10]], '#6d9b4b', OUT, 0.7); ctx.fillStyle = '#fff'; ctx.font = 'bold 7px sans-serif'; ctx.fillText('z', 4, -6); ctx.font = 'bold 5px sans-serif'; ctx.fillText('z', 8, -9); break;
    case 'army': ctx.beginPath(); ctx.moveTo(-8, 2); ctx.quadraticCurveTo(-8, -9, 0, -9); ctx.quadraticCurveTo(8, -9, 8, 2); ctx.lineTo(8, 5); ctx.lineTo(-8, 5); ctx.closePath(); ctx.fillStyle = vgrad(ctx, 0, -9, 5, '#d8dede', '#6a7272'); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 0.8; ctx.stroke(); rrect(ctx, -2, -2, 4, 9, 1, '#2a2a2a'); line(ctx, -8, 1, 8, 1, '#d9b857', 1); break;
    case 'tc': poly(ctx, [[0, -10], [9, -5], [9, 4], [0, 9], [-9, 4], [-9, -5]], '#d8d0bc', OUT, 0.8); poly(ctx, [[0, -10], [9, -5], [0, 0], [-9, -5]], '#3f7f5a', OUT, 0.6); rrect(ctx, -2, 2, 4, 6, 1, '#2a2a24'); break;
    case 'age': ctx.fillStyle = '#d9b857'; ctx.font = 'bold 13px Georgia,serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(extra || 'II', 0, 1); poly(ctx, [[-10, -9], [10, -9], [8, -7], [-8, -7]], '#d9b857'); poly(ctx, [[-10, 9], [10, 9], [8, 7], [-8, 7]], '#d9b857'); break;
    case 'tech': ell(ctx, 0, -1, 7, 7, vgrad(ctx, 0, -8, 6, '#9fd0ff', '#2a5a8a'), OUT, 0.8); ctx.fillStyle = '#fff'; for (const [x, y] of [[-2, -3], [3, 0], [-1, 3]]) { ctx.beginPath(); ctx.arc(x, y, 1, 0, 7); ctx.fill(); } break;
    case 'gather': line(ctx, -6, 8, 4, -6, '#6b4a2a', 2); poly(ctx, [[4, -6], [9, -8], [9, -3]], '#8d8d8d', OUT, 0.5); break;
    case 'build': line(ctx, -6, 8, 3, -3, '#6b4a2a', 2); rrect(ctx, 0, -9, 10, 6, 1, '#8d8d8d', OUT, 0.6); break;
  }
  ctx.restore();
}
// draw a unit portrait into a canvas
export function drawUnitPortrait(canvas, def) {
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
  const sp = unitSprite(def, 'f', false, 'idle', 0);
  const scale = canvas.height / (sp.height / S) * (def.sprite.kind === 'giant' ? 1.1 : def.sprite.kind === 'mounted' ? 1.25 : 1.35);
  const dw = sp.width / S * scale, dh = sp.height / S * scale;
  ctx.drawImage(sp, canvas.width / 2 - dw / 2, canvas.height - dh + canvas.height * 0.05, dw, dh);
}
export function drawBuildingPortrait(canvas, faction, role) {
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height);
  const sp = buildingSprite(faction, role, 1, 0);
  const scale = Math.min(canvas.width / (sp.width / BSCALE), canvas.height / (sp.height / BSCALE)) * 1.05;
  const dw = sp.width / BSCALE * scale, dh = sp.height / BSCALE * scale;
  ctx.drawImage(sp, canvas.width / 2 - dw / 2, canvas.height / 2 - dh / 2, dw, dh);
}
export function drawTechIcon(canvas, techId) { drawIcon(canvas, 'tech'); }
export function drawFactionEmblem(canvas, faction) {
  const ctx = canvas.getContext('2d'); const w = canvas.width; ctx.clearRect(0, 0, w, w);
  ctx.save(); ctx.translate(w / 2, w / 2); ctx.scale(w / 120, w / 120);
  if (faction === 'elves') {
    const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 55); g.addColorStop(0, '#2f5d3a'); g.addColorStop(1, '#0e2214');
    ell(ctx, 0, 0, 52, 52, g, '#d9b857', 3);
    // leaf
    ctx.beginPath(); ctx.moveTo(0, -40); ctx.quadraticCurveTo(34, -10, 0, 38); ctx.quadraticCurveTo(-34, -10, 0, -40); ctx.closePath();
    ctx.fillStyle = vgrad(ctx, 0, -40, 38, '#a8d070', '#3f7f3a'); ctx.fill(); ctx.strokeStyle = '#d9b857'; ctx.lineWidth = 2; ctx.stroke();
    line(ctx, 0, -36, 0, 36, '#d9b857', 1.5); for (let i = -3; i <= 3; i++) line(ctx, 0, i * 9, 14 * Math.sign(i || 1) * (i % 2 ? 1 : -1), i * 9 - 8, '#d9b857', 1);
    // antlers
    ctx.strokeStyle = '#f0e8d0'; ctx.lineWidth = 2.5; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 20, -14); ctx.quadraticCurveTo(s * 40, -20, s * 36, -44); ctx.moveTo(s * 30, -26); ctx.lineTo(s * 44, -32); ctx.stroke(); }
  } else {
    const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 55); g.addColorStop(0, '#6a1a12'); g.addColorStop(1, '#1a0806');
    ell(ctx, 0, 0, 52, 52, g, '#c9743a', 3);
    ctx.save(); ctx.scale(5, 5); skull({ ctx }, 0, -1, 5); ctx.restore();
    ctx.strokeStyle = '#e6dcc0'; ctx.lineWidth = 4; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 18, -20); ctx.quadraticCurveTo(s * 42, -24, s * 34, -48); ctx.stroke(); }
    line(ctx, -30, 30, 30, -30, '#8a1f1f', 5); line(ctx, 30, 30, -30, -30, '#8a1f1f', 5);
    line(ctx, -30, 30, 30, -30, '#cfd8d8', 2); line(ctx, 30, 30, -30, -30, '#cfd8d8', 2);
  }
  ctx.restore();
}
