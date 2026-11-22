// render.js: everything drawn on the canvas: sprites and patterns, the 3D rolling balls, the room, the cat,
// obstacles and tunnels, the table and felt, spin paths, the aim and the guide (guideSim, guideShownPots,
// guideWalls, drawGuide), gimmes, the contact close-up, cue, tray, stamp, banner, the scenery cache and draw().
// Relies on everything above.

/* ----- sprites & patterns ----- */

function glowSprite(size, stops) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  return c;
}
const SOFT_SHADOW = glowSprite(128, [[0, 'rgba(40,25,10,.55)'], [0.55, 'rgba(40,25,10,.25)'], [1, 'rgba(40,25,10,0)']]);
const CLOUD = glowSprite(256, [[0, 'rgba(50,40,30,.10)'], [0.6, 'rgba(50,40,30,.05)'], [1, 'rgba(50,40,30,0)']]);
const LAMP = glowSprite(256, [[0, 'rgba(255,238,200,.22)'], [0.55, 'rgba(255,238,200,.08)'], [1, 'rgba(255,238,200,0)']]);
const CLOUD_BUF = document.createElement('canvas');   // the cloud shadows, drawn small (see draw())
const VIGNETTE_BUF = document.createElement('canvas');   // the vignette, painted once per screen size (see draw())
const MOTE = glowSprite(16, [[0, 'rgba(255,248,225,.9)'], [1, 'rgba(255,248,225,0)']]);
function noisePattern(size, alpha) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (Math.random() - 0.5) * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = alpha; }
  g.putImageData(img, 0, 0);
  return ctx.createPattern(c, 'repeat');
}
const FELT_NOISE = noisePattern(96, 22), GRAIN = noisePattern(160, 16);
const hash01 = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/* ----- 3D rolling balls ----- */

function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function rotV(v, kx, ky, c, s) {
  const kv = kx * v[0] + ky * v[1];
  return [v[0] * c + ky * v[2] * s + kx * kv * (1 - c), v[1] * c - kx * v[2] * s + ky * kv * (1 - c), v[2] * c + (kx * v[1] - ky * v[0]) * s];
}
function ensureSpin(b) {
  if (b.spot) return;
  const a = b.n * 2.1 + 0.5;
  b.spot = norm([0.3 * Math.cos(a), 0.3 * Math.sin(a), 1]);
  b.pole = norm([b.spot[1], -b.spot[0], 0]);
}
function updateSpin(b, dt) {
  ensureSpin(b);
  if (b._px === undefined) { b._px = b.x; b._py = b.y; }
  const dx = b.x - b._px, dy = b.y - b._py, d = Math.hypot(dx, dy);
  b._px = b.x; b._py = b.y;
  if (d > 0.01 && d < 300) {
    const th = d / R, c = Math.cos(th), s = Math.sin(th), kx = -dy / d, ky = dx / d;
    b.spot = norm(rotV(b.spot, kx, ky, c, s)); b.pole = norm(rotV(b.pole, kx, ky, c, s));
  } else if (!b.vx && !b.vy && b.n > 0 && b.spot[2] < 0.9) {
    const kx0 = b.spot[1], ky0 = -b.spot[0], l = Math.hypot(kx0, ky0);
    if (l > 1e-4) {
      const th = Math.min(Math.acos(clamp(b.spot[2], -1, 1)) - 0.45, dt * 2.5);
      if (th > 0) { const c = Math.cos(th), s = Math.sin(th); b.spot = norm(rotV(b.spot, kx0 / l, ky0 / l, c, s)); b.pole = norm(rotV(b.pole, kx0 / l, ky0 / l, c, s)); }
    }
  }
}
function stripeCap(x, y, r, p, sg) {
  const q = [p[0] * sg, p[1] * sg, p[2] * sg], A = 0.95, ca = Math.cos(A), sa = Math.sin(A);
  if (q[2] < -sa) return;
  const u = norm(cross(q, Math.abs(q[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0])), v = cross(q, u);
  ctx.beginPath();
  for (let k = 0; k <= 36; k++) {
    const f = k / 36 * TAU, c = Math.cos(f), s = Math.sin(f);
    let px = q[0] * ca + sa * (u[0] * c + v[0] * s), py = q[1] * ca + sa * (u[1] * c + v[1] * s);
    const pz = q[2] * ca + sa * (u[2] * c + v[2] * s);
    if (pz < 0) { const l = Math.hypot(px, py) || 1; px /= l; py /= l; }
    k ? ctx.lineTo(x + px * r, y + py * r) : ctx.moveTo(x + px * r, y + py * r);
  }
  ctx.fill();
}
function drawBall(b, x, y, sc = 1, alpha = 1) {
  if (!isFinite(x) || !isFinite(y) || !isFinite(sc)) return;   // never let a bad position stop the frame
  ensureSpin(b);
  const r = R * sc;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(SOFT_SHADOW, x - r * 1.25 + 3, y - r * 1.15 + 5, r * 2.5, r * 2.4);
  ctx.save();
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
  ctx.fillStyle = COLORS[b.n]; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  if (b.n >= 9) { ctx.fillStyle = '#f4efe2'; stripeCap(x, y, r, b.pole, 1); stripeCap(x, y, r, b.pole, -1); }
  const [sx, sy, sz] = b.spot;
  if (sz > 0) {
    ctx.save();
    ctx.translate(x + sx * r, y + sy * r); ctx.rotate(Math.atan2(sy, sx)); ctx.scale(Math.max(0.06, sz), 1);
    ctx.fillStyle = b.n === 0 ? '#c4472f' : '#f4efe2';
    ctx.beginPath(); ctx.arc(0, 0, b.n === 0 ? r * 0.16 : r * 0.5, 0, TAU); ctx.fill();
    ctx.restore();
    if (b.n > 0 && sz > 0.35) {
      ctx.globalAlpha = alpha * Math.min(1, (sz - 0.35) * 3);
      ctx.fillStyle = '#24221f'; ctx.font = `500 ${r * 0.72 * (0.7 + 0.3 * sz)}px 'DM Mono', monospace`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.n, x + sx * r, y + sy * r + 0.5);
      ctx.globalAlpha = alpha;
    }
  }
  const g = ctx.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x, y, r * 1.05);
  g.addColorStop(0, 'rgba(255,255,250,.75)'); g.addColorStop(0.22, 'rgba(255,255,250,.1)');
  g.addColorStop(0.65, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(40,25,10,.35)');
  ctx.fillStyle = g; ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  ctx.restore();
  ctx.strokeStyle = 'rgba(40,30,20,.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
  ctx.restore();
}

/* ----- the room ----- */

const PLANKS = ['#d8c29b', '#d2b98f', '#dcc8a4', '#cdb287', '#d5bd95'];
const DECOR = {
  plants: [[-RAIL - 75, -RAIL - 45, 64, 1], [W + RAIL + 72, H * 0.36, 54, 2], [-RAIL - 62, H + RAIL + 34, 58, 3], [W + RAIL + 66, H + RAIL + 56, 68, 4], [-RAIL - 210, H * 0.18, 70, 5]],
  chair: { x: -RAIL - 120, y: H * 0.56 },
  record: { x: W + RAIL + 92, y: -RAIL + 20 },
  cat: { x: W + RAIL + 62, y: H * 0.74 },
  window: { x: -RAIL - 330, y: H * 0.05 },
};
const motes = Array.from({ length: 28 }, (_, i) => ({ x: hash01(i) * (W + 200) - 100, y: hash01(i + 40) * (H + 200) - 100, p: hash01(i + 80) * TAU, s: 0.4 + hash01(i + 120) }));
const clouds = Array.from({ length: 3 }, (_, i) => ({ x: hash01(i + 7) * 1400 - 700, y: hash01(i + 9) * 1400 - 200, r: 500 + hash01(i + 11) * 400, v: 7 + hash01(i + 13) * 6 }));
let recordAngle = 0, recordSpeed = 0;

function drawFloor(x0, y0, x1, y1) {
  const PW = 58;
  for (let k = Math.floor(x0 / PW) - 1; k * PW < x1; k++) {
    const x = k * PW;
    ctx.fillStyle = PLANKS[Math.floor(hash01(k) * PLANKS.length)]; ctx.fillRect(x, y0, PW, y1 - y0);
    ctx.fillStyle = 'rgba(120,85,50,.08)';
    for (let g = 0; g < 3; g++) ctx.fillRect(x + 8 + hash01(k * 3 + g) * (PW - 16), y0, 1, y1 - y0);
    ctx.fillStyle = 'rgba(90,60,30,.2)'; ctx.fillRect(x, y0, 1.5, y1 - y0);
    const L = 340, off = hash01(k + 50) * L;
    for (let y = Math.floor((y0 - off) / L) * L + off; y < y1; y += L) ctx.fillRect(x, y, PW, 1.5);
  }
}
function drawWindowLight(t) {
  const w = DECOR.window, pts = [[w.x, w.y], [w.x + 230, w.y + 60], [w.x + 230, w.y + 360], [w.x, w.y + 300]];
  ctx.save();
  ctx.beginPath(); pts.forEach(([x, y], k) => k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
  ctx.fillStyle = 'rgba(255,246,220,.22)'; ctx.fill(); ctx.clip();
  ctx.strokeStyle = 'rgba(120,90,60,.16)'; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.moveTo(w.x + 115, w.y); ctx.lineTo(w.x + 115, w.y + 400); ctx.moveTo(w.x - 20, w.y + 180); ctx.lineTo(w.x + 260, w.y + 240); ctx.stroke();
  ctx.fillStyle = 'rgba(120,100,80,.12)';
  for (let k = 0; k < 26; k++) {
    const x = w.x + hash01(k) * 240, sp = 30 + hash01(k + 3) * 40, y = w.y - 20 + ((t * sp + hash01(k + 6) * 400) % 420);
    ctx.beginPath(); ctx.ellipse(x, y, 1.6, 5 + hash01(k + 9) * 4, 0.25, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
function drawRug() {
  const x = -RAIL - 80, y = -RAIL - 70, w = W + 2 * RAIL + 160, h = H + 2 * RAIL + 140;
  ctx.strokeStyle = '#e9dcc0'; ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let fx2 = x + 14; fx2 < x + w - 10; fx2 += 9) { ctx.moveTo(fx2, y + 4); ctx.lineTo(fx2, y - 12); ctx.moveTo(fx2, y + h - 4); ctx.lineTo(fx2, y + h + 12); }
  ctx.stroke();
  for (const [col, inset] of [['#b65e3f', 0], ['#efe4ca', 14], ['#4e7a72', 24], ['#efe4ca', 40], ['#c99a43', 48], ['#e6d8bb', 56]]) {
    ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(x + inset, y + inset, w - 2 * inset, h - 2 * inset, Math.max(6, 30 - inset * 0.4)); ctx.fill();
  }
  ctx.fillStyle = '#b65e3f';
  for (let k = 0; k < 14; k++) {
    const yy = y + 90 + k * (h - 180) / 13;
    for (const xx of [x + 68, x + w - 68]) { ctx.beginPath(); ctx.moveTo(xx, yy - 9); ctx.lineTo(xx + 6, yy); ctx.lineTo(xx, yy + 9); ctx.lineTo(xx - 6, yy); ctx.fill(); }
  }
}
function drawPlant([x, y, r, seed], t) {
  ctx.drawImage(SOFT_SHADOW, x - r * 1.1 + 10, y - r * 1.1 + 14, r * 2.3, r * 2.3);
  ctx.fillStyle = '#b4623f'; ctx.beginPath(); ctx.arc(x, y, r * 0.5, 0, TAU); ctx.fill();
  ctx.fillStyle = '#8c4a2f'; ctx.beginPath(); ctx.arc(x, y, r * 0.42, 0, TAU); ctx.fill();
  const greens = ['#5f8a5a', '#4a7449', '#7aa36e', '#567f50'];
  const n = 12;
  for (let k = 0; k < n; k++) {
    const a = k / n * TAU + hash01(seed * 10 + k) * 0.5 + Math.sin(t * 0.7 + k + seed) * 0.05, len = r * (0.7 + 0.35 * hash01(seed * 20 + k));
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = greens[(k + seed) % greens.length];
    ctx.beginPath(); ctx.ellipse(len * 0.55, 0, len * 0.55, r * 0.17, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(230,240,200,.35)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(len * 0.95, 0); ctx.stroke();
    ctx.restore();
  }
  ctx.fillStyle = '#3f6340'; ctx.beginPath(); ctx.arc(x, y, r * 0.16, 0, TAU); ctx.fill();
}
function drawChair() {
  const { x, y } = DECOR.chair;
  ctx.drawImage(SOFT_SHADOW, x - 80, y - 70, 180, 170);
  ctx.save(); ctx.translate(x, y); ctx.rotate(0.12);
  ctx.fillStyle = '#c99a43'; ctx.beginPath(); ctx.roundRect(-62, -58, 124, 116, 22); ctx.fill();
  ctx.fillStyle = '#b5862f'; ctx.beginPath(); ctx.roundRect(-62, -58, 32, 116, 16); ctx.fill();
  ctx.beginPath(); ctx.roundRect(-62, -58, 124, 24, 12); ctx.fill(); ctx.beginPath(); ctx.roundRect(-62, 34, 124, 24, 12); ctx.fill();
  ctx.fillStyle = '#d8ad58'; ctx.beginPath(); ctx.roundRect(-26, -30, 80, 60, 12); ctx.fill();
  ctx.strokeStyle = 'rgba(120,80,30,.35)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(14, -28); ctx.lineTo(14, 28); ctx.stroke();
  ctx.restore();
}
function drawRecord(dt) { drawRecordBase(); drawRecordTop(dt); }
// the turntable's plinth, platter and grooves (still: cached with the room) ...
function drawRecordBase() {
  const { x, y } = DECOR.record;
  ctx.drawImage(SOFT_SHADOW, x - 80, y - 70, 175, 165);
  ctx.fillStyle = '#7d5538'; ctx.beginPath(); ctx.roundRect(x - 66, y - 58, 132, 116, 8); ctx.fill();
  ctx.fillStyle = '#e9dcc0'; ctx.beginPath(); ctx.roundRect(x - 58, y - 50, 116, 100, 6); ctx.fill();
  ctx.fillStyle = '#2b2622'; ctx.beginPath(); ctx.arc(x - 8, y, 44, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = 1;
  for (let rr = 18; rr < 44; rr += 4) { ctx.beginPath(); ctx.arc(x - 8, y, rr, 0, TAU); ctx.stroke(); }
}
// ... and the label and shine turning on it, with the tone arm over them (drawn every frame)
function drawRecordTop(dt) {
  const { x, y } = DECOR.record;
  recordSpeed = lerp(recordSpeed, musicOn && !muted ? 3.5 : 0, Math.min(1, dt * 1.5));
  recordAngle += recordSpeed * dt;
  ctx.save(); ctx.translate(x - 8, y); ctx.rotate(recordAngle);
  ctx.fillStyle = '#c4472f'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.fill();
  ctx.fillStyle = '#efe4ca'; ctx.fillRect(-1.5, -12, 3, 8);
  ctx.strokeStyle = 'rgba(255,255,255,.18)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 32, -0.4, 0.3); ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = '#9aa0a0'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x + 46, y - 36); ctx.lineTo(x + 40, y + 6); ctx.lineTo(x + 18, y + 24); ctx.stroke();
  ctx.fillStyle = '#6f7575'; ctx.beginPath(); ctx.arc(x + 46, y - 36, 6, 0, TAU); ctx.fill();
}
// The cat. Normally it sleeps by the table; on a cat hole it naps on the felt instead. drawCatBody draws it
// anywhere: rot turns it, sc scales it, awake opens its eyes.
function drawCat(t) {
  if (table?.cat || catAnim) return;
  const { x, y } = DECOR.cat;
  // it wakes for loud hits and fast balls, and watches them roll
  const busy = catStartle > 0.05 || !!table && table.live().some(b => Math.hypot(b.vx, b.vy) > 400);
  drawCatBody(x, y, -0.3, 1, t, busy, busy ? catLook(x, y, -0.3, 1) : 0, catStartle);
}
// the angle (relative to the cat) to turn its head towards the nearest rolling ball, up to 0.8 rad either way
function catLook(x, y, rot, sc) {
  if (!table) return 0;
  const hx = x + (Math.cos(rot) * 24 - Math.sin(rot) * 8) * sc, hy = y + (Math.sin(rot) * 24 + Math.cos(rot) * 8) * sc;
  let best = null, bd = 700;
  for (const b of table.live()) { if (!b.vx && !b.vy) continue; const d = Math.hypot(b.x - hx, b.y - hy); if (d < bd) { bd = d; best = b; } }
  if (!best) return 0;
  const a = Math.atan2(best.y - hy, best.x - hx) - rot;
  return clamp(Math.atan2(Math.sin(a), Math.cos(a)), -0.8, 0.8);
}
function drawCatBody(x, y, rot, sc, t, awake, look = 0, startle = 0) {
  const br = 1 + Math.sin(t * 1.6) * 0.025;
  y -= 7 * startle * sc;   // a flinch: up off its cushion for a moment
  const flick = Math.max(0, Math.sin(t * 0.45)) ** 12;
  ctx.drawImage(SOFT_SHADOW, x - 50 * sc, y - 38 * sc, 106 * sc, 86 * sc);
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(sc, sc);
  ctx.strokeStyle = '#d98f45'; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-26, 10);
  const ta = 0.6 + flick * Math.sin(t * 14) * 0.5;
  ctx.quadraticCurveTo(-40, 34, -8 + Math.cos(ta) * 10, 34 + Math.sin(ta) * 6); ctx.stroke();
  ctx.scale(br, br);
  ctx.fillStyle = '#e0a35a'; ctx.beginPath(); ctx.ellipse(0, 0, 34, 25, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(160,90,40,.45)'; ctx.lineWidth = 3;
  for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.arc(-4, 0, 18 + k * 3, -1.2 + k * 0.1, -0.5 + k * 0.1); ctx.stroke(); }
  // the head turns on its neck, and the ears go flat when it's startled
  ctx.save(); ctx.translate(24, 8); ctx.rotate(look); ctx.translate(-24, -8);
  const ear = 6 * startle;
  ctx.fillStyle = '#e0a35a'; ctx.beginPath(); ctx.arc(24, 8, 14, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.moveTo(28, -4); ctx.lineTo(36 + ear * 0.5, -10 + ear); ctx.lineTo(36, 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(18, -2); ctx.lineTo(18 - ear * 0.5, -12 + ear); ctx.lineTo(28, -5); ctx.fill();
  ctx.strokeStyle = '#7a4a28'; ctx.lineWidth = 1.5;
  if (awake) {
    ctx.fillStyle = '#9bbf4a'; ctx.beginPath(); ctx.ellipse(21, 9, 3.2, 2.6, 0, 0, TAU); ctx.ellipse(30, 9, 3.2, 2.6, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#24221f'; ctx.beginPath(); ctx.ellipse(21.5, 9, 1, 2.3, 0, 0, TAU); ctx.ellipse(30.5, 9, 1, 2.3, 0, 0, TAU); ctx.fill();
  } else { ctx.beginPath(); ctx.arc(22, 10, 3, 0.2, 2.6); ctx.moveTo(31, 9); ctx.arc(29, 10, 3, 0.2, 2.6); ctx.stroke(); }
  ctx.restore();
  ctx.restore();
}
// The cat on the felt: a big soft obstacle (CAT_R, CAT_E). Its eyes open when a ball rolls near. Hit it and,
// once the balls stop, it hops somewhere else, choosing a spot that blocks your best pot if it can (seeded, so
// everyone's cat does the same for the same shot). The second hit, or one hard knock, and it's had enough: it
// jumps down to its cushion by the table for the rest of the hole.
let catAnim = null, catFlash = 0;
const CAT_SC = 0.85;
function drawTableCat(t, dt) {
  catFlash = Math.max(0, catFlash - dt * 3);
  if (catAnim) {
    catAnim.t += dt;
    const k = clamp(catAnim.t / 0.7, 0, 1), e = k * k * (3 - 2 * k), hop = Math.sin(k * Math.PI), f = catAnim.from, to = catAnim.to;
    drawCatBody(lerp(f.x, to.x, e), lerp(f.y, to.y, e) - hop * 70, lerp(f.rot, to.rot, e), lerp(f.sc, to.sc, e) * (1 + hop * 0.3), t, true);
    if (k >= 1) catAnim = null;
    return;
  }
  const c = table?.cat;
  if (!c) return;
  const near = table.live().some(b => (b.vx || b.vy) && Math.hypot(b.x - c.x, b.y - c.y) < 230);
  drawCatBody(c.x, c.y, c.rot, CAT_SC * (1 + catFlash * 0.1), t, near || catFlash > 0 || catStartle > 0.05, near ? catLook(c.x, c.y, c.rot, CAT_SC) : 0, catStartle);
}
function meow() { tone(560, 0.18, 0.05, 'triangle', 1.45, 0, 0.3); tone(810, 0.3, 0.045, 'triangle', 0.62, 0.14, 0.3); }
function catSpotFree(t, x, y) {
  return (t.hole.shape ? freeIn(t.hole.shape, x, y, CAT_R + 4) : x > CAT_R + 4 && x < W - CAT_R - 4 && y > CAT_R + 4 && y < H - CAT_R - 4) &&
    t.live().every(o => Math.hypot(o.x - x, o.y - y) > CAT_R + R + 10) &&
    t.hole.bumpers.every(o => Math.hypot(o.x - x, o.y - y) > o.r + CAT_R + 10) &&
    t.pk.every(p => Math.hypot(p.x - x, p.y - y) > p.cap + CAT_R + R) &&
    !t.hole.patches.some(p => inPatch(p, x, y));
}
function catAfterShot() {
  const c = table.cat, hit = table.shot?.catHit;
  if (!c || !hit) return;
  c.hits = (c.hits || 0) + 1;
  const from = { x: c.x, y: c.y, rot: c.rot, sc: CAT_SC }, say = (txt, col) => float(clamp(c.x, 90, W - 90), clamp(c.y - 55, 40, H - 40), txt, col, 19, 1.8);
  meow();
  if (c.hits >= 2 || hit > 900) {
    say("The cat's had enough", '#b8553f');
    table.cat = null; table.bumps = table.hole.bumpers;
    catAnim = { from, to: { x: DECOR.cat.x, y: DECOR.cat.y, rot: -0.3, sc: 1 }, t: 0 };
    return;
  }
  // somewhere free, ideally in the way of the best pot from where the cue ball is now (but never blocking them all)
  const rr = rngFor(`${round.seed}:cat:${round.level}:${strokes}`), x0 = c.x, y0 = c.y;
  c.x = -999; c.y = -999;
  const best = allLines(table).filter(l => !l.blocked).sort((a, b) => b.q - a.q)[0];
  let pick = null;
  for (let k = 0; k < 400 && !(pick && pick.blocks); k++) {
    const x = 60 + rr() * (W - 120), y = 60 + rr() * (H - 120);
    if (Math.hypot(x - x0, y - y0) < 90 || !catSpotFree(table, x, y)) continue;
    c.x = x; c.y = y;
    const open = allLines(table).filter(l => !l.blocked), blocks = !!best && open.length > 0 && !open.some(l => l.bi === best.bi && l.pocket === best.pocket);
    if (open.length && (!pick || blocks)) pick = { x, y, blocks };
  }
  if (!pick) { c.x = x0; c.y = y0; return; }
  c.x = pick.x; c.y = pick.y; c.rot = rr() * TAU;
  say(pick.blocks ? 'Mrrp! The cat moved into your way' : 'Mrrp!', '#b88a2e');
  catAnim = { from, to: { x: c.x, y: c.y, rot: c.rot, sc: CAT_SC }, t: 0 };
}

/* ----- obstacles ----- */

// The one-way gate: a walnut flap on a hinge, the arc it swings through and arrows showing the way through.
function drawObstacle(o, t) {
  const plank = (ax, ay, bx, by) => {
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(40,25,10,.3)'; ctx.lineWidth = BAR_T * 2 + 2; ctx.beginPath(); ctx.moveTo(ax + 3, ay + 5); ctx.lineTo(bx + 3, by + 5); ctx.stroke();
    ctx.strokeStyle = '#7d5538'; ctx.lineWidth = BAR_T * 2; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,225,190,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax, ay - 2); ctx.lineTo(bx, by - 2); ctx.stroke();
  };
  if (o.type === 'gate') {
    const [[ax, ay, bx, by, side]] = obstBars(table), sa = o.a0 + o.dir * 0;
    // the arc it swings through, and big arrows painted on the felt showing the way through
    const nx = -o.dir * Math.sin(sa), ny = o.dir * Math.cos(sa);
    ctx.setLineDash([4, 7]); ctx.strokeStyle = 'rgba(255,255,240,.3)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(o.x, o.y, o.len, Math.min(sa, sa + o.dir * GATE_MAX), Math.max(sa, sa + o.dir * GATE_MAX)); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(255,250,225,.75)'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const f of [0.35, 0.75]) {
      const cx = o.x + Math.cos(sa) * o.len * f - nx * 22, cy = o.y + Math.sin(sa) * o.len * f - ny * 22;
      ctx.beginPath(); ctx.moveTo(cx - nx * 12 - Math.cos(sa) * 10, cy - ny * 12 - Math.sin(sa) * 10); ctx.lineTo(cx, cy); ctx.lineTo(cx - nx * 12 + Math.cos(sa) * 10, cy - ny * 12 + Math.sin(sa) * 10); ctx.stroke();
    }
    plank(ax, ay, bx, by);
    ctx.fillStyle = '#3a2618'; ctx.beginPath(); ctx.arc(o.x, o.y, 8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#c99a43'; ctx.beginPath(); ctx.arc(o.x, o.y, 4, 0, TAU); ctx.fill();
  }
}

// A tunnel: two openings cut into facing cushions, drawn as dark slots running back into the rail with a cream
// liner, and a soft shadow on the felt in front. Aiming in, the far opening glows where the ball will come back in.
const tunPop = new Map();   // balls popping out of a tunnel: how far through the hop
let tunAimLit = 0;          // the aim goes into the tunnel this frame (the far end glows)
function drawTunnel(tn, t, dt) {
  tunAimLit = lerp(tunAimLit, tunAimWant ? 1 : 0, Math.min(1, dt * 8));
  const depth = RAIL - 6, w = TUN_HALF;
  [tn.a, tn.b].forEach((m, k) => {
    m.flash = Math.max(0, (m.flash || 0) - dt * 2.5);
    ctx.save(); ctx.translate(m.x, m.y); ctx.rotate(Math.atan2(m.ny, m.nx));
    // local frame: +x is into the felt, -x back into the cushion and rail; y runs along the cushion
    if (tunAimLit > 0.02 && k === 1 - tunAimFrom) {
      const gl = ctx.createRadialGradient(R, 0, 4, R, 0, 60); gl.addColorStop(0, `rgba(255,214,140,${0.55 * tunAimLit})`); gl.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(R, 0, 60, 0, TAU); ctx.fill();
    }
    // the shadow it casts on the felt just in front
    const sh = ctx.createLinearGradient(0, 0, 14, 0); sh.addColorStop(0, 'rgba(15,25,18,.4)'); sh.addColorStop(1, 'rgba(15,25,18,0)');
    ctx.fillStyle = sh; ctx.fillRect(0, -w, 14, 2 * w);
    // the cream liner, then the dark slot running back under the rail
    // flared: wider where it meets the felt (the mouth catches angled shots), narrowing back into the rail
    const slot = (grow, fw) => { ctx.beginPath(); ctx.moveTo(2, -fw - grow); ctx.quadraticCurveTo(-8, -w - grow, -14, -w - grow); ctx.lineTo(-depth - grow + 6, -w - grow); ctx.quadraticCurveTo(-depth - grow, -w - grow, -depth - grow, -w - grow + 6);
      ctx.lineTo(-depth - grow, w + grow - 6); ctx.quadraticCurveTo(-depth - grow, w + grow, -depth - grow + 6, w + grow); ctx.lineTo(-14, w + grow); ctx.quadraticCurveTo(-8, w + grow, 2, fw + grow); ctx.closePath(); };
    ctx.fillStyle = '#efe8d6'; slot(3, w + R * 0.8); ctx.fill();
    const g = ctx.createLinearGradient(0, 0, -depth, 0); g.addColorStop(0, '#2b3530'); g.addColorStop(0.45, '#0f1411'); g.addColorStop(1, '#050706');
    ctx.fillStyle = g; slot(0, w + R * 0.8); ctx.fill();
    // a little light on the far wall of the slot
    ctx.strokeStyle = 'rgba(239,232,214,.25)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-depth + 4, -w + 4); ctx.lineTo(-depth + 4, w - 4); ctx.stroke();
    // chevrons on the rail either side: this way in
    ctx.strokeStyle = 'rgba(239,232,214,.55)'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
    for (const sy of [-1, 1]) { const y0 = sy * (w + R * 0.8 + 12); ctx.beginPath(); ctx.moveTo(-10, y0 - 5); ctx.lineTo(-16, y0); ctx.lineTo(-10, y0 + 5); ctx.stroke(); }
    if (m.flash > 0) { ctx.fillStyle = `rgba(255,214,140,${0.5 * m.flash})`; ctx.beginPath(); ctx.roundRect(-depth, -w, depth, 2 * w, [6, 0, 0, 6]); ctx.fill(); }
    ctx.restore();
  });
}
// a ball that has just come out of a tunnel hops: up and a touch bigger, then down with a small bounce
function drawLiveBall(b) {
  const k = tunPop.get(b);
  if (k == null) { drawBall(b, b.x, b.y); return; }
  const hop = Math.sin(Math.min(1, k) * Math.PI) * 14 * (1 - k * 0.5) + (k > 1 && k < 1.4 ? Math.sin((k - 1) / 0.4 * Math.PI) * 3 : 0), sc = 1 + hop / 60;
  ctx.globalAlpha = 0.5; ctx.drawImage(SOFT_SHADOW, b.x - R * 1.2 + 2, b.y - R * 1.2 + 5, R * 2.4, R * 2.4); ctx.globalAlpha = 1;
  drawBall(b, b.x, b.y - hop, sc);
}

/* ----- the table ----- */

const polyPath = (pts, move = true) => { pts.forEach(([x, y], k) => k || !move ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); };
// the felt of a shaped table: its outline, minus any islands (fill or clip with 'evenodd')
function feltPath(sh) { ctx.beginPath(); polyPath(sh.outer); for (const isl of sh.islands) polyPath(isl); }
// A shaped table: a walnut rail, the green cushion and the felt follow its outline; islands are walnut blocks
// edged with cushion.
function drawShapedTable(sh) {
  ctx.save(); ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(50,30,12,.45)'; ctx.shadowBlur = 36 * view.s * view.dpr; ctx.shadowOffsetY = 16 * view.s * view.dpr;
  ctx.beginPath(); polyPath(sh.outer); ctx.fillStyle = '#6e4a30'; ctx.fill(); ctx.strokeStyle = '#6e4a30'; ctx.lineWidth = RAIL * 2; ctx.stroke();
  ctx.restore();
  const wood = ctx.createLinearGradient(-RAIL, -RAIL, W + RAIL, H + RAIL);
  wood.addColorStop(0, '#8e6141'); wood.addColorStop(1, '#6f4a31');
  ctx.save(); ctx.lineJoin = 'round';
  ctx.beginPath(); polyPath(sh.outer);
  ctx.strokeStyle = 'rgba(255,225,190,.22)'; ctx.lineWidth = RAIL * 2 - 4; ctx.stroke();
  ctx.strokeStyle = wood; ctx.lineWidth = RAIL * 2 - 9; ctx.stroke();
  ctx.strokeStyle = '#4f7f68'; ctx.lineWidth = 24; ctx.stroke();   // the cushion
  feltPath(sh);
  const felt = ctx.createRadialGradient(W / 2, H * 0.45, 40, W / 2, H / 2, H * 0.65);
  felt.addColorStop(0, '#7aa98e'); felt.addColorStop(1, '#5f8f76');
  ctx.fillStyle = felt; ctx.fill('evenodd');
  ctx.fillStyle = FELT_NOISE; ctx.fill('evenodd');
  ctx.strokeStyle = 'rgba(30,50,35,.25)'; ctx.lineWidth = 3; ctx.stroke();
  for (const isl of sh.islands) {
    // a raised walnut block, like a piece of the rail: it casts a shadow on the felt, has a dark cushion round it,
    // a bevelled top with grain, and cream sights like the outer rail, so it reads as a wall, not a mat
    ctx.save();
    ctx.shadowColor = 'rgba(25,15,6,.55)'; ctx.shadowBlur = 22 * view.s * view.dpr; ctx.shadowOffsetY = 12 * view.s * view.dpr;
    ctx.beginPath(); polyPath(isl); ctx.strokeStyle = '#2f5242'; ctx.lineWidth = 24; ctx.stroke();   // its cushion, on the felt side
    ctx.restore();
    ctx.strokeStyle = 'rgba(200,230,210,.35)'; ctx.lineWidth = 2;   // the cushion's lit lip
    ctx.save(); ctx.beginPath(); polyPath(isl.map(([x, y]) => { const cx = isl.reduce((a, q) => a + q[0], 0) / isl.length, cy = isl.reduce((a, q) => a + q[1], 0) / isl.length, d = Math.hypot(x - cx, y - cy) || 1; return [x + (x - cx) / d * 11, y + (y - cy) / d * 11]; })); ctx.stroke(); ctx.restore();
    ctx.beginPath(); polyPath(isl);
    const top = ctx.createLinearGradient(0, 0, W * 0.3, H * 0.3);
    top.addColorStop(0, '#9a6b48'); top.addColorStop(1, '#6a452d');
    ctx.fillStyle = top; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.strokeStyle = 'rgba(60,35,18,.28)'; ctx.lineWidth = 1.5;   // grain
    for (let k = -40; k < 40; k++) { ctx.beginPath(); ctx.moveTo(-50, k * 9 + H / 2); ctx.bezierCurveTo(W * 0.3, k * 9 + H / 2 + 6, W * 0.6, k * 9 + H / 2 - 6, W + 50, k * 9 + H / 2 + 2); ctx.stroke(); }
    ctx.beginPath(); polyPath(isl); ctx.strokeStyle = 'rgba(30,15,5,.45)'; ctx.lineWidth = 14; ctx.stroke();      // bevel: shade inside the edge
    ctx.beginPath(); polyPath(isl); ctx.strokeStyle = 'rgba(255,230,195,.35)'; ctx.lineWidth = 4; ctx.stroke();   // and a lit top edge
    ctx.restore();
    // cream diamond sights at the middle of each side, like the outer rail's
    ctx.fillStyle = '#f1e3c4';
    isl.forEach(([ax, ay], k) => {
      const [bx, by] = isl[(k + 1) % isl.length], mx = (ax + bx) / 2, my = (ay + by) / 2, cx = isl.reduce((a, q) => a + q[0], 0) / isl.length, cy = isl.reduce((a, q) => a + q[1], 0) / isl.length;
      const d = Math.hypot(cx - mx, cy - my) || 1, x = mx + (cx - mx) / d * 9, y = my + (cy - my) / d * 9;
      ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 3, y); ctx.closePath(); ctx.fill();
    });
  }
  ctx.restore();
}

function drawTable(t, dt) { drawTableBase(); drawTableLive(t, dt); }
// Felt markings (sand bunkers, slope arrows) are drawn under the pockets; the slope arrows drift, so on a tilted hole
// they're drawn every frame, pockets and all, and the cached table is just rail and felt.
const feltMoves = h => !!h.tilt.mag;   // sand ('rough') patches are the only kind left, and they're still
// the rail and felt, and the felt's markings and pockets when they're still: what the scenery cache holds
function drawTableBase() {
  const sh = hole.shape;
  if (sh) drawShapedTable(sh);
  else {
    ctx.save();
    ctx.shadowColor = 'rgba(50,30,12,.45)'; ctx.shadowBlur = 36 * view.s * view.dpr; ctx.shadowOffsetY = 16 * view.s * view.dpr;
    ctx.fillStyle = '#6e4a30'; ctx.beginPath(); ctx.roundRect(-RAIL, -RAIL, W + 2 * RAIL, H + 2 * RAIL, 26); ctx.fill();
    ctx.restore();
    const wood = ctx.createLinearGradient(-RAIL, -RAIL, W + RAIL, H + RAIL);
    wood.addColorStop(0, '#8e6141'); wood.addColorStop(1, '#6f4a31');
    ctx.fillStyle = wood; ctx.beginPath(); ctx.roundRect(-RAIL, -RAIL, W + 2 * RAIL, H + 2 * RAIL, 26); ctx.fill();
    ctx.strokeStyle = 'rgba(255,225,190,.22)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(-RAIL + 4, -RAIL + 4, W + 2 * RAIL - 8, H + 2 * RAIL - 8, 22); ctx.stroke();
    ctx.fillStyle = '#efe4ca';
    const dia = (x, y) => { ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 3, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 3, y); ctx.fill(); };
    for (let i = 1; i < 8; i++) if (i !== 4) for (const x of [-RAIL / 2 - 2, W + RAIL / 2 + 2]) dia(x, H * i / 8);
    for (let i = 1; i < 4; i++) for (const y of [-RAIL / 2 - 2, H + RAIL / 2 + 2]) dia(W * i / 4, y);
    ctx.fillStyle = '#4f7f68'; ctx.fillRect(-12, -12, W + 24, H + 24);
    const felt = ctx.createRadialGradient(W / 2, H * 0.45, 40, W / 2, H / 2, H * 0.65);
    felt.addColorStop(0, '#7aa98e'); felt.addColorStop(1, '#5f8f76');
    ctx.fillStyle = felt; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = FELT_NOISE; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(30,50,35,.25)'; ctx.lineWidth = 3; ctx.strokeRect(1.5, 1.5, W - 3, H - 3);
  }
  if (!feltMoves(hole)) drawFelt(0);
}
// the felt's markings, clipped to the table's shape, and the pockets over them
function drawFelt(t) {
  const sh = hole.shape;
  ctx.save();
  if (sh) { feltPath(sh); ctx.clip('evenodd'); }
  for (const p of hole.patches) {
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
    ctx.beginPath(); ctx.ellipse(0, 0, p.rx, p.ry, 0, 0, TAU);
    if (p.type === 'rough') {
      ctx.fillStyle = '#c9b88c'; ctx.fill(); ctx.strokeStyle = '#b3a173'; ctx.lineWidth = 3; ctx.stroke(); ctx.clip();
      ctx.fillStyle = 'rgba(140,115,70,.35)';
      for (let k = 0; k < 70; k++) { const a = hash01(p.seed + k) * TAU, rr = Math.sqrt(hash01(p.seed + k + 99)); ctx.fillRect(Math.cos(a) * rr * p.rx, Math.sin(a) * rr * p.ry, 2, 2); }
      ctx.strokeStyle = 'rgba(255,250,230,.25)'; ctx.lineWidth = 1.2;
      for (let k = -6; k <= 6; k++) { ctx.beginPath(); ctx.arc(0, p.ry * 3, p.ry * 3 + k * 9, Math.PI * 1.35, Math.PI * 1.65); ctx.stroke(); }
    } else {
      ctx.fillStyle = 'rgba(160,212,214,.55)'; ctx.fill(); ctx.strokeStyle = 'rgba(120,185,190,.8)'; ctx.lineWidth = 2; ctx.stroke(); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 5;
      const sh = (t * 30) % 60;
      for (let k = -8; k < 8; k++) { ctx.beginPath(); ctx.moveTo(-p.rx + k * 60 + sh, -p.ry); ctx.lineTo(-p.rx + k * 60 + sh + p.ry, p.ry); ctx.stroke(); }
    }
    ctx.restore();
  }
  if (hole.tilt.mag) {
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
    const a = hole.tilt.dir * Math.PI / 4, sp = 90, off = (t * hole.tilt.mag * 0.8) % sp;
    ctx.translate(W / 2, H / 2); ctx.rotate(a);
    ctx.strokeStyle = `rgba(255,255,240,${0.05 + hole.tilt.mag / 900})`; ctx.lineWidth = 3; ctx.lineCap = 'round';
    for (let gx = -700; gx < 700; gx += sp) for (let gy = -700; gy < 700; gy += sp) {
      const x = gx + off + (Math.abs(gy / sp) % 2) * sp / 2;
      ctx.beginPath(); ctx.moveTo(x - 7, gy - 9); ctx.lineTo(x + 3, gy); ctx.lineTo(x - 7, gy + 9); ctx.stroke();
    }
    ctx.restore();
  }
  if (!sh) { ctx.strokeStyle = 'rgba(255,255,240,.18)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, H * 0.75); ctx.lineTo(W, H * 0.75); ctx.stroke(); }
  ctx.restore();   // end of the felt clip
  table.pk.forEach((p, i) => {
    const pr = Math.min(p.cap, R * 1.75) * 0.95;
    ctx.fillStyle = '#3a2618'; ctx.beginPath(); ctx.arc(p.x, p.y, pr + 6, 0, TAU); ctx.fill();
    if (!table.openPocket(i)) {
      ctx.fillStyle = '#9a6c48'; ctx.beginPath(); ctx.arc(p.x, p.y, pr, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#5e3c26'; ctx.lineWidth = 3; const k = R * 0.6;
      ctx.beginPath(); ctx.moveTo(p.x - k, p.y - k); ctx.lineTo(p.x + k, p.y + k); ctx.moveTo(p.x + k, p.y - k); ctx.lineTo(p.x - k, p.y + k); ctx.stroke();
    } else {
      const g = ctx.createRadialGradient(p.x, p.y, pr * 0.15, p.x, p.y, pr);
      g.addColorStop(0, '#0d0906'); g.addColorStop(1, '#2a1c12');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, pr, 0, TAU); ctx.fill();
    }
  });
}
// what's on the table that moves: the obstacle, tunnel mouths and bumpers (and the felt, when it moves)
function drawTableLive(t, dt) {
  if (feltMoves(hole)) drawFelt(t);
  if (hole.obst) drawObstacle(hole.obst, t);
  if (hole.tunnel) drawTunnel(hole.tunnel, t, dt);
  for (const o of hole.bumpers) {
    o.flash = Math.max(0, (o.flash || 0) - dt * 3);
    ctx.drawImage(SOFT_SHADOW, o.x - o.r * 1.3 + 3, o.y - o.r * 1.3 + 6, o.r * 2.6, o.r * 2.6);
    const g = ctx.createRadialGradient(o.x - o.r * 0.35, o.y - o.r * 0.4, 1, o.x, o.y, o.r);
    g.addColorStop(0, '#f6e7bd'); g.addColorStop(1, '#a8803f');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(o.x, o.y, o.r * (1 + o.flash * 0.1), 0, TAU); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = `rgba(110,75,30,${0.6 + 0.4 * o.flash})`; ctx.stroke();
    ctx.fillStyle = 'rgba(110,75,30,.5)'; ctx.beginPath(); ctx.arc(o.x, o.y, o.r * 0.35, 0, TAU); ctx.fill();
  }
}

function arrowTo(a, b, col) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(a.x + Math.cos(ang) * (R + 3), a.y + Math.sin(ang) * (R + 3)); ctx.lineTo(b.x, b.y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(b.x, b.y);
  ctx.lineTo(b.x - Math.cos(ang - 0.45) * 13, b.y - Math.sin(ang - 0.45) * 13);
  ctx.lineTo(b.x - Math.cos(ang + 0.45) * 13, b.y - Math.sin(ang + 0.45) * 13); ctx.fill();
}
// Spin colours: on the felt (paths) and on the cue-ball face (labels).
const spinKind = s => s > 0.2 ? 0 : s < -0.2 ? 2 : 1;

// Where the cue ball goes after it meets the first ball, for a given spin: simulate the shot and keep its path.
// The cue ball's first half second after it meets the first ball (or less, if it drops in a pocket).
// Time, not distance, so a harder hit draws a longer line.
const PATH_STEPS = 120;
function cuePath(angle, pw, spin, side = 0) {
  const s = cloneTable(table); s.shoot(angle, pw, spin, side);
  const pts = []; let hitAt = -1, lx = s.cue.x, ly = s.cue.y;
  for (let n = 0; n < 9000 && s.moving(); n++) {
    s.step();
    if (s.cue.potted) break;
    const jump = Math.hypot(s.cue.x - lx, s.cue.y - ly) > 4 * R; lx = s.cue.x; ly = s.cue.y;
    if (s.cue.uN) continue;
    if (jump && hitAt >= 0) pts.push(gapPt(s.cue.x, s.cue.y));
    if (hitAt < 0 && s.shot.firstHit) { hitAt = n; pts.push([s.cue.x, s.cue.y]); }
    else if (hitAt >= 0) { if (n % 3 === 0) pts.push([s.cue.x, s.cue.y]); if (n - hitAt >= PATH_STEPS) break; }
  }
  const scratch = s.cue.potted && hitAt >= 0;
  if (hitAt >= 0 && !s.cue.potted) pts.push([s.cue.x, s.cue.y]);
  return { pts: hitAt >= 0 ? pts : [], scratch };
}
let spinCache = { key: '', paths: [] };
function spinPaths() {
  const pw = hold ? power : lastPower, key = `${aim.angle.toFixed(5)}|${pw.toFixed(3)}|${aim.spin.toFixed(3)}|${aim.side.toFixed(3)}|${strokes}|${hole.i}`;
  if (key !== spinCache.key) {
    const main = { name: strikeName(aim.spin), spin: aim.spin, main: true, ...cuePath(aim.angle, pw, aim.spin, aim.side) };
    spinCache = { key, paths: [main] };
  }
  return spinCache.paths;
}
// Shown only while you're pulling back or dragging the spin spot: a dotted line that fades out.
function drawSpinPaths() {
  const pulling = hold && power >= MIN_PULL, showing = spinDemo || (phase === 'strike' && strike.spinLesson && strike.t < 0);
  const p = pulling || spinDrag || showing ? spinPaths()[0] : null;
  // a scratch ahead while pulling back: the spin ball pulses (and, the first three times, the table says so)
  const sc = !!(pulling && p?.scratch);
  if (sc !== scratchAhead) { scratchAhead = sc; spinPulse(); }
  const key = `${hole.i}|${strokes}`;
  if (sc && scratchSaid !== key) {
    scratchSaid = key;
    const n = +(ls('dailybreak:scratchTips') || 0);
    if (n < 3) { ls('dailybreak:scratchTips', String(n + 1)); const c = table.cue; float(clamp(c.x, 110, W - 110), clamp(c.y + 50, 40, H - 40), 'Scratch ahead: try spin', '#b8553f', 18, 2.2); }
  }
  if (spinDemo?.say) {
    const c = table.cue, y = c.y + (c.y > H - 120 ? -56 : 56);
    let fs = 21; ctx.font = `700 ${fs}px 'DM Sans', sans-serif`;
    while (ctx.measureText(spinDemo.say).width > W - 40 && fs > 15) { fs--; ctx.font = `700 ${fs}px 'DM Sans', sans-serif`; }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(spinDemo.say).width + 24, x = clamp(c.x, tw / 2 + 6, W - tw / 2 - 6);
    ctx.fillStyle = 'rgba(47,107,79,.94)'; ctx.beginPath(); ctx.roundRect(x - tw / 2, y - fs * 0.95, tw, fs * 1.9, fs * 0.95); ctx.fill();
    ctx.fillStyle = '#fbf8f0'; ctx.fillText(spinDemo.say, x, y + 1);
  }
  if (!p || p.pts.length < 2) return;
  ctx.save(); ctx.lineCap = 'round';
  const n = p.pts.length, rgb = showing ? '226,177,60' : '251,248,240';
  for (let k = 1; k < n; k++) {
    ctx.strokeStyle = `rgba(${rgb},${0.95 * (1 - k / n) + 0.05})`; ctx.lineWidth = showing ? 6 : 4;
    if (p.pts[k].gap) continue;
    ctx.beginPath(); ctx.moveTo(p.pts[k - 1][0], p.pts[k - 1][1]); ctx.lineTo(p.pts[k][0], p.pts[k][1]); ctx.stroke();
  }
  if (p.scratch) {
    const [ex, ey] = p.pts[n - 1], k = 9;
    ctx.strokeStyle = '#e0573d'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(ex - k, ey - k); ctx.lineTo(ex + k, ey + k); ctx.moveTo(ex + k, ey - k); ctx.lineTo(ex - k, ey + k); ctx.stroke();
  }
  ctx.restore();
}

// Labels are sized in screen pixels so they stay readable however small the table is drawn.
const spx = n => n / (view.s * cam.k);
let placed = [];
// Place a label near (x, y): try above, below, then to the sides, and take the first spot that
// covers no ball and no label already placed this frame (or the least-bad one).
function tag(x, y, text, bg, fg, size = 11, below = false) {
  size = spx(size);
  ctx.font = `700 ${size}px 'DM Mono', monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const tw = ctx.measureText(text).width + size * 1.1, h = size * 1.8, gy = R + 4 + h / 2, gx = R + 6 + tw / 2;
  const cands = below ? [[0, gy], [0, -gy], [gx, 0], [-gx, 0]] : [[0, -gy], [0, gy], [gx, 0], [-gx, 0], [gx * 0.8, -gy], [-gx * 0.8, -gy], [gx * 0.8, gy], [-gx * 0.8, gy]];
  const balls = [table.cue, ...table.balls].filter(o => !o.potted);
  let best = null;
  for (const [ox, oy] of cands) {
    const cx = clamp(x + ox, tw / 2 - RAIL, W + RAIL - tw / 2), cy = clamp(y + oy, h / 2 - RAIL, H + RAIL - h / 2);
    const l = cx - tw / 2, r = cx + tw / 2, t = cy - h / 2, btm = cy + h / 2;
    let bad = 0;
    for (const o of balls) { const nx = clamp(o.x, l, r), ny = clamp(o.y, t, btm); if (Math.hypot(o.x - nx, o.y - ny) < R) bad += 2; }
    for (const p of placed) if (l < p.r && r > p.l && t < p.b && btm > p.t) bad += 3;
    if (!best || bad < best.bad) best = { bad, cx, cy, l, r, t, b: btm };
    if (!bad) break;
  }
  placed.push(best);
  ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(best.l, best.t, tw, h, h / 2); ctx.fill();
  ctx.fillStyle = fg; ctx.fillText(text, best.cx, best.cy + 0.5);
}
// Aiming: the line to the first thing the cue ball meets and a ghost ball where it touches, the object
// ball's line (drawGuide) and, while you pull back or set spin, the cue ball's path after contact.
let tunAimWant = false, tunAimFrom = 0;
function drawAim(t) {
  tunAimWant = false;
  if (phase !== 'aim' && !(phase === 'strike' && strike.t < 0)) { guideLock.on = false; return; }
  const c = table.cue, dx = Math.cos(aim.angle), dy = Math.sin(aim.angle);
  const fb = table.balls[aim.bi];
  drawSpinPaths();
  if (fb && !fb.potted) {
    ctx.save(); ctx.setLineDash([5, 5]); ctx.lineDashOffset = t * 12; ctx.strokeStyle = '#e2b13c'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(fb.x, fb.y, R + 7, 0, TAU); ctx.stroke(); ctx.restore();
  }
  drawGuide(c, dx, dy, trace(table, c.x, c.y, dx, dy), t);
}
// The guide (simplified 15 Nov 2026): straight lines only, the cue ball to the first thing it
// meets and the object ball on from there. A line stops at a pocket's edge, and the pocket gets a slowly turning
// white ring when your shot (your spin, struck perfectly, at some pace) really drops the object ball into the pocket the
// line goes into (simulated; the line may come off one cushion first). Kicks and combinations aren't drawn. The golden pocket keeps its own gold glow. It never shows where the balls stop.
// the open pocket a ball's centre would drop into along (ux, uy) before travelling maxT (plus the pocket's reach)
function pocketAlong(px, py, ux, uy, maxT) {
  let best = null;
  table.pk.forEach((p, i) => {
    if (!table.openPocket(i)) return;
    const s = (p.x - px) * ux + (p.y - py) * uy;
    if (s < 0 || s > maxT + p.cap + R) return;
    if (Math.abs((p.x - px) * uy - (p.y - py) * ux) < p.cap * 0.85 && (!best || s < best.s)) best = { i, s };
  });
  return best;
}
const guideSim = { key: null, pks: [], potsInto: new Set(), memo: new Map(), memoOf: null, memoAt: '' };   // potsInto: pockets the followed ball drops into at some pace
// How many cushions a ball came off, as the guide counts them: every contact, except touches in the jaws of the
// pocket it then dropped into (a pot that brushes the jaw is still a straight pot; a ball that comes back out of
// a corner did come off a cushion).
const jawOf = (t, pk, x, y) => Math.hypot(x - t.pk[pk].x, y - t.pk[pk].y) < t.pk[pk].cap + 2.5 * R;
const guideWalls = (t, b, dropPk) => (b.wallPts || []).filter(([x, y]) => dropPk == null || !jawOf(t, dropPk, x, y)).length;
// while a ball is still rolling: jaw touches count once it has left that pocket's jaws
const rollingWalls = (t, b) => (b.wallPts || []).filter(([x, y]) => { const i = t.pk.findIndex((_, k) => jawOf(t, k, x, y)); return i < 0 || !jawOf(t, i, b.x, b.y); }).length;
// The ring lights for pots the lines show: the cue ball straight to its first ball (GUIDE_KICK cushions), and the
// potted ball off at most GUIDE_CUSH cushions.
const GUIDE_A = 0.55;   // how strong the guide's lines are (1 was the old, bolder look)
const GUIDE_KICK = 0, GUIDE_CUSH = 1, GUIDE_PACES = [0.15, 0.25, 0.35, 0.45, 0.55, 0.65, 0.75, 0.85, 0.95];
// The pockets the guide would light for one shot on table t (a perfect strike at pace pw with this spin): only
// pots of the ball the line follows (the first ball the cue ball meets), with the cue ball straight to it and the
// potted ball off at most GUIDE_CUSH cushions, and no scratch. startUnpotted uses it (guidePots); it's the same
// rule as shownPots in drawGuide, which can call this instead.
function guideShownPots(t, angle, pw, spin, side = 0) {
  const s = simulate(t, angle, pw, spin, null, side), b = s.shot.firstHit;
  if (s.shot.scratch || !b || (s.shot.kickWalls || 0) > GUIDE_KICK) return [];
  return s.shot.pots.filter(q => q.ball === b && guideWalls(s, q.ball, q.pocket) <= GUIDE_CUSH).map(q => q.pocket);
}
// a path point where the line jumps (the ball came out of a tunnel): move there without drawing
const gapPt = (x, y) => Object.assign([x, y], { gap: true });
const guideLock = { on: false, at: -9, fired: false };   // the aim on a pot, and when it last flared
function drawGuide(c, dx, dy, hit, t) {
  // kept subtle (GUIDE_A scales every line): a hint on the cloth, not the brightest thing on the table
  const dash = (ax, ay, bx, by, a) => { ctx.save(); ctx.setLineDash([5, 8]); ctx.strokeStyle = `rgba(251,248,240,${a * GUIDE_A})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.restore(); };
  const ghost = (x, y, a) => { ctx.strokeStyle = `rgba(251,248,240,${a * GUIDE_A})`; ctx.lineWidth = 1.25; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke(); };
  const solid = (ax, ay, bx, by, a0, a1, w = 2) => {
    const g = ctx.createLinearGradient(ax, ay, bx, by); g.addColorStop(0, `rgba(251,248,240,${a0 * GUIDE_A})`); g.addColorStop(1, `rgba(251,248,240,${a1 * GUIDE_A})`);
    ctx.strokeStyle = g; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  };
  // "it's in": a bold white ring round the pocket's edge, turning slowly (the same for every pocket, golden or not)
  const ringRadius = p => p.cap + 10;
  const ringPocket = i => {
    const p = table.pk[i], fl = guideLock.fired ? (1 - clamp((t - guideLock.at) / 0.6, 0, 1)) ** 2 : 0, k = 0.6 + 0.15 * Math.sin(t * 4) + 0.4 * fl, rr = ringRadius(p) + 8 * fl;
    ctx.save();
    ctx.strokeStyle = 'rgba(40,30,20,.2)'; ctx.lineWidth = 5.5; ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, TAU); ctx.stroke();
    ctx.strokeStyle = `rgba(255,253,245,${k})`; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.setLineDash([rr * 0.55, rr * 0.3]); ctx.lineDashOffset = -t * 18;
    ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, TAU); ctx.stroke();
    ctx.restore();
  };
  // how far along a line from (px, py) the ball reaches the edge of that pocket's ring
  const toRim = (px, py, ux, uy, pk) => {
    const p = table.pk[pk.i], perp = Math.abs((p.x - px) * uy - (p.y - py) * ux), rr = ringRadius(p);
    return Math.max(0, pk.s - Math.sqrt(Math.max(0, rr * rr - perp * perp)));
  };
  // The simple guide: the cue ball's line to the first thing it meets, a ghost ball there, and the object ball's
  // straight line, to the pocket's ring when it heads into one, or a short fading stub when it doesn't. No bounce,
  // kick or combination lines: the ring says when the shot really goes in (simulated), the rest is judgement.
  const ex = c.x + dx * hit.t, ey = c.y + dy * hit.t;
  // The ring, for a perfect strike with the spin you've set, played out in full (tilt and sand included): if the
  // followed ball drops at any pace (GUIDE_PACES), that pocket can light (see finishGuide). It doesn't depend on how hard you pull:
  // the guide shows where the shot goes, assuming the right pace; judging the pace is up to you.
  const sp = aim.spin, sd = aim.side;
  // Only pots of the ball the line follows (the first ball the cue ball meets) count. A second ball knocked in by
  // it, or by the cue ball, isn't on any line, so it never lights anything (it used to flicker rings round pockets
  // the line didn't go near while you aimed).
  // Each pace's sim stops as soon as its answer is settled (guidePotsAt), and the answers for the last few hundred aims
  // on this table are kept, so working the aim back and forth over the same spot doesn't simulate it again.
  const key = `${aim.angle}:${strokes}:${round.level}:${sp.toFixed(2)}:${sd.toFixed(2)}`;
  if (guideSim.key !== key) {
    // (kept only while the table is the same one with every ball where it was)
    const at = [table.cue, ...table.balls].map(b => b.potted ? '-' : `${b.x},${b.y}`).join(';') + `;${table.gp}`;
    if (guideSim.memoOf !== table || guideSim.memoAt !== at) { guideSim.memoOf = table; guideSim.memoAt = at; guideSim.memo = new Map(); }
    const mkey = `${aim.angle}:${sp}:${sd}`;   // the exact inputs the sims see
    let pots = guideSim.memo.get(mkey);
    if (!pots) {
      pots = new Set();
      for (const pw of GUIDE_PACES) for (const i of guidePotsAt(table, aim.angle, pw, sp, GUIDE_KICK, GUIDE_CUSH, sd)) pots.add(i);
      if (guideSim.memo.size >= 400) guideSim.memo.delete(guideSim.memo.keys().next().value);
      guideSim.memo.set(mkey, pots);
    }
    guideSim.key = key; guideSim.potsInto = pots;
  }
  // The ring and the bright line are one signal, decided once the line is drawn (finishGuide, below): they light
  // only when the pocket the line goes into is one the ball really drops into at some pace.
  guideSim.pks = [];
  // On target: the object ball's line into a pocket that really pots lights up warm and bright with a soft glow, and a
  // shimmer runs along it towards the pocket. The moment it locks on, it flares (wider, brighter) and ticks.
  const lockK = clamp((t - guideLock.at) / 0.6, 0, 1), flare = guideLock.fired ? (1 - lockK) ** 2 : 0;
  const onTargetPath = segs => {
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(255,210,120,1)'; ctx.shadowBlur = (14 + 22 * flare) * view.s * view.dpr;
    ctx.strokeStyle = `rgba(255,246,222,${0.9 + 0.1 * flare})`; ctx.lineWidth = 3.5 + 4 * flare;
    for (let n = 0; n < 2; n++) { ctx.beginPath(); for (const [ax, ay, bx, by] of segs) { ctx.moveTo(ax, ay); ctx.lineTo(bx, by); } ctx.stroke(); }
    ctx.shadowBlur = 0;
    // the shimmer: one bright band travelling the whole path towards the pocket
    const lens = segs.map(([ax, ay, bx, by]) => Math.hypot(bx - ax, by - ay)), total = lens.reduce((x, y) => x + y, 0) || 1, at = ((t * 0.55) % 1) * total;
    let start = 0;
    segs.forEach(([ax, ay, bx, by], n) => {
      const L = lens[n] || 1, ph = (at - start) / L; start += L;
      if (ph < -0.15 * total / L || ph > 1 + 0.08 * total / L) return;
      const g = ctx.createLinearGradient(ax, ay, bx, by), w0 = 0.12 * total / L, w1 = 0.06 * total / L, st = (o, c) => g.addColorStop(clamp(o, 0, 1), c);
      st(0, 'rgba(255,255,255,0)'); st(ph - w0, 'rgba(255,255,255,0)'); st(ph, 'rgba(255,255,255,.95)'); st(ph + w1, 'rgba(255,255,255,0)'); st(1, 'rgba(255,255,255,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    });
    ctx.restore();
  };
  // from (sx, sy): the dashed line to the first thing it meets, a ghost ball there, and the object ball's straight line
  const cueLeg = (sx, sy, h, off) => {
    if (!isFinite(h.t)) return;
    const gx = sx + dx * h.t, gy = sy + dy * h.t;
    dash(sx + dx * off, sy + dy * off, gx, gy, 0.85);
    if (!h.ball) { ghost(gx, gy, 0.45); return; }
    ghost(gx, gy, 0.85);
    const ball = h.ball;
    objLine(ball.x, ball.y, (ball.x - gx) / (2 * R), (ball.y - gy) / (2 * R), ball, R + 3);
  };
  // The object ball's line from (px, py): to the pocket it drops into (a ringed pocket it passes counts, even where
  // the straight line only clips the pocket's mouth), or into a tunnel and on out of the far end, or a short fading stub.
  // The object ball's path as segments [ax, ay, bx, by, leg], ending in a pocket (pk) or not. Drawn after, so a pot
  // lights the whole path up, not just its last leg.
  const objPath = (px, py, ux, uy, skip, from, depth, leg, segs) => {
    const h = trace(table, px, py, ux, uy, skip);
    let pk = null;
    for (const i of guideSim.potsInto) {
      const p = table.pk[i], sAt = (p.x - px) * ux + (p.y - py) * uy, perp = Math.abs((p.x - px) * uy - (p.y - py) * ux);
      if (sAt > 0 && perp < p.cap + R && sAt <= h.t + p.cap + R && (!pk || sAt < pk.s)) pk = { i, s: sAt };
    }
    pk = pk || pocketAlong(px, py, ux, uy, h.t);
    if (pk) { const e = toRim(px, py, ux, uy, pk); segs.push([px + ux * from, py + uy * from, px + ux * e, py + uy * e, leg]); return pk.i; }
    if (!isFinite(h.t)) return null;
    const x = px + ux * h.t, y = py + uy * h.t;
    segs.push([px + ux * from, py + uy * from, x, y, leg]);
    if (h.tunnel != null && depth < 1) {
      tunAimWant = true; tunAimFrom = h.tunnel;
      const o = tunExit(tunMouths(hole)[1 - h.tunnel]);
      return objPath(o.x, o.y, ux, uy, skip, 0, depth + 1, leg, segs);
    }
    // a full line to the first thing it meets; off a cushion (or bumper) it carries on for one more leg, then stops
    if (leg > 0 || h.ball || h.tunnel != null) return null;
    let nx = h.nx, ny = h.ny;
    if (h.bumper) { const d = Math.hypot(x - h.bumper.x, y - h.bumper.y) || 1; nx = (x - h.bumper.x) / d; ny = (y - h.bumper.y) / d; }
    if (nx == null || table.pk.some(p => Math.hypot(p.x - x, p.y - y) < p.cap + R * 2.5)) return null;   // a bar, or a pocket's jaws
    // off the cushion as the physics does it: the speed into it drops to e of itself, the speed along it is kept
    const k = ux * nx + uy * ny, e = h.bumper ? (h.bumper.cat ? CAT_E : BUMPER_E) : CUSHION_E;
    const rx = ux - (1 + e) * k * nx, ry = uy - (1 + e) * k * ny, rl = Math.hypot(rx, ry) || 1;
    return objPath(x + nx * 0.5, y + ny * 0.5, rx / rl, ry / rl, skip, 0, depth, leg + 1, segs);
  };
  const objLine = (px, py, ux, uy, skip, from) => {
    const segs = [], end = objPath(px, py, ux, uy, skip, from, 0, 0, segs);
    if (end != null && guideSim.potsInto.has(end)) { guideSim.pks = [end]; onTargetPath(segs); return; }
    // The line points into a pocket the ball doesn't actually drop into (it clips the jaws, or a bank comes off the
    // cushion a little differently): fade it out short of the pocket, so it never looks like it goes in unlit.
    if (end != null && segs.length) {
      const [ax, ay, bx, by] = segs[segs.length - 1], L = Math.hypot(bx - ax, by - ay), k = Math.max(0, L - 2.5 * R) / (L || 1);
      segs[segs.length - 1] = [ax, ay, ax + (bx - ax) * k, ay + (by - ay) * k, segs[segs.length - 1][4], true];
    }
    for (const [ax, ay, bx, by, leg, fade] of segs) { const a = leg ? 0.65 : 0.9; solid(ax, ay, bx, by, a, fade ? 0 : a); }
  };
  // after the lines: ring the pocket the lit line goes into, and flare when the aim first lands on a pot (at most
  // once a second, so a quick sweep across several pots sets off one burst, not a string of them; no sound)
  const finishGuide = () => {
    if (!guideSim.pks.length) guideLock.on = false;
    else if (!guideLock.on) {
      guideLock.on = true;
      if (t - guideLock.at > 1) {
        guideLock.at = t; guideLock.fired = true;
        for (const i of guideSim.pks) { const p = table.pk[i], x = clamp(p.x, 0, W), y = clamp(p.y, 0, H); sparkle(x, y, '#ffe6a8', 12, 110); ring(x, y, '255,230,170', 34, 0.45, p.cap); }
      }
    }
    guideSim.pks.forEach(ringPocket);
  };
  if (hit.tunnel != null) {
    // into a tunnel: the line stops at the mouth, the far end glows, and the line carries on out of it on the same
    // heading (the ball always leaves the far mouth heading the way it went in)
    dash(c.x + dx * R, c.y + dy * R, ex, ey, 0.85);
    tunAimWant = true; tunAimFrom = hit.tunnel;
    const { x: sx, y: sy } = tunExit(tunMouths(hole)[1 - hit.tunnel]), h2 = trace(table, sx, sy, dx, dy);
    if (h2.tunnel == null) cueLeg(sx, sy, h2, 0);
    else dash(sx, sy, sx + dx * h2.t, sy + dy * h2.t, 0.85);
  } else cueLeg(c.x, c.y, hit, R);
  finishGuide();
}
// Gimmes glow green with a "Tap in" label; tapping one pots it for a stroke.
function drawGimmes(t) {
  for (const g of gimmes) {
    const b = table.balls[g.bi];
    if (!b || b.potted) continue;
    const k = (t * 1.2) % 1;
    ctx.strokeStyle = `rgba(120,210,140,${0.9 * (1 - k)})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(b.x, b.y, R + 4 + k * 14, 0, TAU); ctx.stroke();
    ctx.font = "700 16px 'DM Sans', sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const txt = 'Tap in ⛳', tw = ctx.measureText(txt).width + 18, lx = clamp(b.x, tw / 2 + 4, W - tw / 2 - 4), ly = b.y - R - 22 < 16 ? b.y + R + 22 : b.y - R - 22;
    ctx.fillStyle = 'rgba(47,107,79,.94)'; ctx.beginPath(); ctx.roundRect(lx - tw / 2, ly - 13, tw, 26, 13); ctx.fill();
    ctx.fillStyle = '#f4efe2'; ctx.fillText(txt, lx, ly + 0.5);
  }
}
// Labels drawn above the balls (none at the moment; kept for the placement pass).
function drawAimLabels() { placed = []; }

let spinTouched = false, zoom = null;

// The close-up of the cue ball. While you hold the cue back it sits in the bottom-left corner of the
// table with the gold spot (where you chose to hit) and the wobbling tip. When you let go it zooms to
// the middle and plays the strike: the tip comes in and hits where it was, and the contact is graded.
function contactPanel() { const { cw, ch } = view, Rb = clamp(cw * 0.17, 54, 84); return { x: Rb + 10, y: ch - Rb - 26, R: Rb }; }
function drawFace(x, y, Rb, d, tip, flash, quality) {
  const rb = Rb * 0.82, r = spotR(d);
  ctx.save(); ctx.translate(x, y);
  ctx.shadowColor = 'rgba(40,25,10,.4)'; ctx.shadowBlur = 18 * view.dpr; ctx.shadowOffsetY = 6 * view.dpr;
  ctx.fillStyle = '#2f3a31'; ctx.beginPath(); ctx.arc(0, 0, Rb, 0, TAU); ctx.fill();
  ctx.shadowColor = 'transparent';
  const face = ctx.createRadialGradient(-rb * 0.35, -rb * 0.4, rb * 0.1, 0, 0, rb);
  face.addColorStop(0, '#fffdf7'); face.addColorStop(1, '#d8cdb4');
  ctx.fillStyle = face; ctx.beginPath(); ctx.arc(0, 0, rb, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(60,45,25,.15)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-rb, 0); ctx.lineTo(rb, 0); ctx.moveTo(0, -rb); ctx.lineTo(0, rb); ctx.stroke();
  // the miscue zone round the edge
  ctx.strokeStyle = 'rgba(184,85,63,.3)'; ctx.lineWidth = rb * 0.14; ctx.beginPath(); ctx.arc(0, 0, rb * 0.92, 0, TAU); ctx.stroke();
  // the gold spot
  const on = Math.hypot(tip.x - aim.spotX, tip.y - aim.spotY) <= r;
  ctx.fillStyle = on ? 'rgba(226,177,60,.75)' : 'rgba(226,177,60,.35)'; ctx.strokeStyle = '#b88a2e'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(aim.spotX * rb, aim.spotY * rb, r * rb, 0, TAU); ctx.fill(); ctx.stroke();
  // the perfect core: a bright bullseye
  const core = Math.hypot(tip.x - aim.spotX, tip.y - aim.spotY) <= r * PERFECT_CORE;
  ctx.fillStyle = core ? '#fff3c4' : 'rgba(255,243,196,.75)'; ctx.strokeStyle = '#b88a2e'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(aim.spotX * rb, aim.spotY * rb, r * rb * PERFECT_CORE, 0, TAU); ctx.fill(); ctx.stroke();
  // the tip, seen end-on
  const tr = rb * 0.13 * (tip.s || 1);
  ctx.globalAlpha = tip.a ?? 1;
  ctx.fillStyle = 'rgba(40,25,10,.22)'; ctx.beginPath(); ctx.arc(tip.x * rb + 3, tip.y * rb + 4, tr * 1.1, 0, TAU); ctx.fill();
  ctx.fillStyle = '#fbf8f0'; ctx.beginPath(); ctx.arc(tip.x * rb, tip.y * rb, tr * 1.25, 0, TAU); ctx.fill();
  ctx.fillStyle = '#3b5ea6'; ctx.beginPath(); ctx.arc(tip.x * rb, tip.y * rb, tr, 0, TAU); ctx.fill();
  if (on && !quality) { ctx.strokeStyle = '#e2b13c'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(tip.x * rb, tip.y * rb, tr * 1.6, 0, TAU); ctx.stroke(); }
  ctx.globalAlpha = 1;
  if (flash > 0) {
    const col = quality === 'perfect' ? '255,226,120' : quality === 'clean' ? '226,177,60' : quality === 'miscue' ? '184,85,63' : '251,248,240';
    ctx.strokeStyle = `rgba(${col},${flash})`; ctx.lineWidth = 6 * flash;
    ctx.beginPath(); ctx.arc(tip.x * rb, tip.y * rb, tr * (1.4 + (1 - flash) * 3), 0, TAU); ctx.stroke();
  }
  ctx.restore();
}
function drawContact(dt) {
  if (hold && power >= MIN_PULL && phase === 'aim') {
    const p = contactPanel(), d = contactDiff();
    drawFace(p.x, p.y, p.R, d, tipPos(d), 0, null);
    const word = shotWord(d);
    ctx.font = "700 10px 'DM Mono', monospace"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const txt = word.toUpperCase(), tw = ctx.measureText(txt).width + 14;
    ctx.fillStyle = 'rgba(45,58,48,.9)'; ctx.beginPath(); ctx.roundRect(p.x - tw / 2, p.y + p.R + 4, tw, 18, 9); ctx.fill();
    ctx.fillStyle = d < 0.3 ? '#a9d8a0' : d < 0.6 ? '#e2c46c' : '#ffb08a'; ctx.fillText(txt, p.x, p.y + p.R + 13.5);
    return;
  }
  if (!zoom) return;
  zoom.t += dt;
  if (zoom.t < 0) return;   // the aim lesson plays first
  const z = zoom, { cw, ch } = view, T = z.t, END = z.end || SHOOT_T;
  if (T > END) { zoom = null; return; }
  const k = 1 - (1 - Math.min(1, T / 0.16)) ** 3, out = clamp((T - (END - 0.2)) / 0.2, 0, 1);
  const big = Math.min(cw, ch) * 0.3, x = lerp(z.from.x, cw / 2, k), y = lerp(z.from.y, ch * 0.42, k), Rb = lerp(z.from.R, big, k) * (1 - out * 0.3);
  // the tip comes in from the viewer: large and faint, then small and solid on contact
  const hitK = clamp((T - 0.16) / (STRIKE_T - 0.16), 0, 1);
  // the first shot's lesson: the tip lands where they really hit, then glides onto the gold spot
  const L = z.teach, since = T - STRIKE_T, glide = L ? clamp((since - TEACH_REST) / TEACH_GLIDE, 0, 1) : 1, ease = glide * glide * (3 - 2 * glide);
  const tx = L ? lerp(L.tip.x, z.ct.tip.x, ease) : z.ct.tip.x, ty = L ? lerp(L.tip.y, z.ct.tip.y, ease) : z.ct.tip.y;
  const q = L && glide < 1 ? L.quality : z.ct.quality;
  if (L && glide >= 1 && !z.chimed) { z.chimed = true; sfx.chime(); buzz([10, 30, 10]); }
  const tip = { x: tx, y: ty, s: lerp(2.4, 1, hitK), a: lerp(0.3, 1, hitK) * (1 - out) };
  const flash = T >= STRIKE_T ? Math.max(0, 1 - (T - STRIKE_T) / 0.4) : 0, flash2 = L && glide >= 1 ? Math.max(0, 1 - (since - TEACH_REST - TEACH_GLIDE) / 0.4) : 0;
  ctx.save(); ctx.globalAlpha = 1 - out;
  ctx.fillStyle = `rgba(30,24,16,${0.35 * k})`; ctx.fillRect(0, 0, cw, ch);
  drawFace(x, y, Rb, z.d, tip, Math.max(flash, flash2), T >= STRIKE_T ? q : null);
  if (L && since > TEACH_REST) {
    // a ring where they actually hit, so the gap to the spot stays visible
    const rb = Rb * 0.82;
    ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(224,87,61,.85)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x + L.tip.x * rb, y + L.tip.y * rb, rb * 0.09, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  }
  if (T >= STRIKE_T) {
    const txt = L && since > TEACH_REST && glide < 1 ? 'AIM FOR THE GOLD SPOT' : q === 'perfect' ? 'PERFECT' : q === 'clean' ? 'CLEAN' : q === 'miscue' ? 'MISCUE' : q === 'near' ? 'NEARLY' : 'OFF-CENTRE';
    const big2 = txt.length > 12 ? 0.17 : 0.3;
    ctx.font = `800 ${Math.round(Rb * big2)}px 'DM Sans', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = txt.startsWith('AIM') ? '#e2b13c' : q === 'perfect' ? '#ffd76a' : q === 'clean' ? '#e2b13c' : q === 'miscue' ? '#e0573d' : '#fbf8f0';
    ctx.fillText(txt, x, y + Rb + Rb * 0.28);
    if (L && glide < 1) {
      const sub = since < TEACH_REST ? 'Your tip landed here' : 'Let go when the tip is on it';
      ctx.font = `600 ${Math.round(Rb * 0.13)}px 'DM Sans', sans-serif`; ctx.fillStyle = '#fbf8f0';
      ctx.fillText(sub, x, y + Rb + Rb * 0.56);
    }
  }
  ctx.restore();
}

function drawCue(angle, pull, sk, at = table.cue, through = 0) {
  const c = at, gap = (6 + pull * 80) * (1 - sk) ** 2, tip = R + 2 + gap - through, len = 420;
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(angle);
  const stick = (ox, oy) => { ctx.beginPath(); ctx.moveTo(-tip + ox, -3 + oy); ctx.lineTo(-tip - len + ox, -6.5 + oy); ctx.lineTo(-tip - len + ox, 6.5 + oy); ctx.lineTo(-tip + ox, 3 + oy); ctx.closePath(); };
  ctx.fillStyle = 'rgba(40,25,10,.22)'; stick(8, 12); ctx.fill();
  const g = ctx.createLinearGradient(-tip, 0, -tip - len, 0);
  g.addColorStop(0, '#f1e3c4'); g.addColorStop(0.58, '#d6a86e'); g.addColorStop(0.6, '#3b2418'); g.addColorStop(0.75, '#c4472f'); g.addColorStop(0.77, '#2a180f'); g.addColorStop(1, '#2a180f');
  ctx.fillStyle = g; stick(0, 0); ctx.fill();
  ctx.fillStyle = '#fbf8f0'; ctx.fillRect(-tip - 8, -3.1, 7, 6.2);
  ctx.fillStyle = '#3b5ea6'; ctx.fillRect(-tip - 1.5, -2.9, 2, 5.8);
  ctx.restore();
}

// The tray: a slot down the right-hand edge for each ball on this hole. A potted ball flies there
// from its pocket once it has dropped, and lands with a click.
function drawTray(dt, S, OX, OY) {
  const n = table.balls.length, gap = 25, r = 10, x = view.cw - 15, y0 = view.ch / 2 - (n - 1) * gap / 2;
  // a resumed hole: balls already down go straight into the tray
  const flying = trayFly.length, potted = table.balls.filter(b => b.potted).length;
  for (const b of table.balls) if (b.potted && trayDone.length + flying < potted && !trayDone.some(o => o.n === b.n) && !trayFly.some(f => f.b.n === b.n)) trayDone.push(b);
  ctx.fillStyle = 'rgba(43,30,20,.55)'; ctx.beginPath(); ctx.roundRect(x - r - 4, y0 - r - 4, 2 * r + 8, (n - 1) * gap + 2 * r + 8, r + 4); ctx.fill();
  for (let k = 0; k < n; k++) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.arc(x, y0 + k * gap, r - 1, 0, TAU); ctx.fill(); }
  trayDone.forEach((b, k) => drawBall(b, x, y0 + k * gap, r / R));
  for (const f of trayFly) {
    f.t += dt / 0.55;
    if (f.t <= 0) continue;
    const k = Math.min(1, f.t), e = 1 - (1 - k) ** 3, slot = trayDone.length, tx = x, ty = y0 + slot * gap;
    const fx0 = OX + f.wx * S, fy0 = OY + f.wy * S;
    drawBall(f.b, lerp(fx0, tx, e), lerp(fy0, ty, e) - Math.sin(k * Math.PI) * 40, lerp(S, r / R, e) * (1 + Math.sin(k * Math.PI) * 0.3));
    if (f.t >= 1 && !f.landed) { f.landed = true; trayDone.push(f.b); tone(1400 + slot * 120, 0.04, 0.05, 'sine', 1, 0, 0.2); buzz(6); }
  }
  trayFly = trayFly.filter(f => !f.landed);
}
function drawStamp(dt) {
  if (!stamp) return;
  stamp.t += dt;
  const k = Math.min(1, stamp.t / 0.35), e = 1 + 1.7 * (1 - k) ** 3, a = Math.min(1, stamp.t * 4);
  ctx.save(); ctx.translate(W / 2, H * 0.42); ctx.rotate(-0.12); ctx.scale(e, e); ctx.globalAlpha = a;
  const text = stamp.text.toUpperCase();
  let size = 46; ctx.font = `800 ${size}px 'DM Sans', sans-serif`;
  while (ctx.measureText(text).width > W * 0.72 && size > 24) { size -= 2; ctx.font = `800 ${size}px 'DM Sans', sans-serif`; }
  const tw = ctx.measureText(text).width + 50;
  ctx.fillStyle = 'rgba(251,248,240,.92)'; ctx.beginPath(); ctx.roundRect(-tw / 2, -46, tw, 92, 14); ctx.fill();
  ctx.strokeStyle = stamp.color; ctx.lineWidth = 5; ctx.stroke();
  ctx.lineWidth = 1.5; ctx.beginPath(); ctx.roundRect(-tw / 2 + 7, -39, tw - 14, 78, 9); ctx.stroke();
  ctx.fillStyle = stamp.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, -6);
  ctx.font = "500 14px 'DM Mono', monospace"; ctx.fillText(stamp.sub.toUpperCase(), 0, 26);
  ctx.restore();
}

function drawBanner(dt) {
  if (!banner) return;
  banner.life -= dt;
  const a = Math.min(1, banner.life * 2, (banner.max - banner.life) * 4);
  ctx.save(); ctx.globalAlpha = Math.max(0, a);
  ctx.fillStyle = 'rgba(251,248,240,.93)'; ctx.strokeStyle = 'rgba(120,100,70,.35)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(W * 0.08, H * 0.42 - 54, W * 0.84, 108, 16); ctx.fill(); ctx.stroke();
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#2d3a30';
  ctx.font = "800 40px 'DM Sans', sans-serif"; ctx.fillText(banner.title, W / 2, H * 0.42 - 12);
  ctx.font = "500 14px 'DM Mono', monospace"; ctx.fillStyle = '#6d7568'; ctx.fillText(banner.sub.toUpperCase(), W / 2, H * 0.42 + 26);
  ctx.restore();
  if (banner.life <= 0) banner = null;
}
/* ----- the scenery cache ----- */
// Most of the picture is still for a whole hole: the floor, rug, chair and turntable, and the table's rail and felt.
// Repainting them was most of a frame (~8 ms on a software canvas), so they're painted once into two canvases at
// device resolution and copied in each frame: `room` (opaque: floor, rug, chair, the turntable's plinth) and
// `table` (transparent: rail, felt with its drop shadow, and the felt's markings and pockets when they're still).
// Two layers because the cat sleeps between them, under the edge of the table's shadow. The window light is drawn
// over `room` though it's under the rug in the direct order: its patch of floor is clear of the rug and chair.
// They're keyed on the view (resize() makes a new one; the canvas size too) and the hole. While the camera pushes
// in (cam.k > 1, the slow-motion finish) everything is drawn directly, as before: a stretched copy would look soft
// just when you're watching closely, and it's only a second or two. Shake just offsets the copy, by whole device
// pixels, into SHAKE_PAD of margin painted round the screen.
const SHAKE_PAD = 8;   // css px: more than half the biggest shake (fx.shake ≤ 9)
const scenery = { room: document.createElement('canvas'), table: document.createElement('canvas'), view: null, w: 0, h: 0, hole: null };
function paintLayer(c, paint) {
  const { s, dpr, ox, oy } = view, P = Math.ceil(SHAKE_PAD * dpr);
  c.width = canvas.width + 2 * P; c.height = canvas.height + 2 * P;   // (also clears it)
  const keep = ctx;
  ctx = c.getContext('2d');
  try { ctx.setTransform(s * dpr, 0, 0, s * dpr, ox * dpr + P, oy * dpr + P); paint(P); } finally { ctx = keep; }
}
function sceneryReady() {
  if (scenery.view !== view || scenery.w !== canvas.width || scenery.h !== canvas.height) {
    const { s, dpr, cw, ch, ox, oy } = view;
    paintLayer(scenery.room, P => {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#d8c29b'; ctx.fillRect(0, 0, scenery.room.width, scenery.room.height); ctx.restore();
      const m = P / dpr;
      drawFloor(-(ox + m) / s - 20, -(oy + m) / s - 20, (cw + m - ox) / s + 20, (ch + m - oy) / s + 20);
      drawRug(); drawChair(); drawRecordBase();
    });
    Object.assign(scenery, { view, w: canvas.width, h: canvas.height, hole: null });
  }
  if (scenery.hole !== hole) { paintLayer(scenery.table, drawTableBase); scenery.hole = hole; }
}

function draw(t, dt) {
  const { s, dpr, cw, ch, ox, oy } = view;
  fx.shake = Math.max(0, fx.shake - dt * 25);
  const sx = (Math.random() - 0.5) * fx.shake, sy = (Math.random() - 0.5) * fx.shake;
  // the camera can push in on a point (cam.x, cam.y) for the slow-motion finish
  const S = s * cam.k, OX = ox + cam.x * s * (1 - cam.k), OY = oy + cam.y * s * (1 - cam.k);
  const x0 = -OX / S - 20, y0 = -OY / S - 20, x1 = (cw - OX) / S + 20, y1 = (ch - OY) / S + 20;
  if (Math.abs(cam.k - 1) < 2e-4) {   // (it eases back to 1 but never quite lands: 2e-4 is under 0.2 px at the edges)
    sceneryReady();
    const P = Math.ceil(SHAKE_PAD * dpr), bx = Math.round(sx * dpr) - P, by = Math.round(sy * dpr) - P, world = () => ctx.setTransform(S * dpr, 0, 0, S * dpr, (OX + sx) * dpr, (OY + sy) * dpr);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(scenery.room, bx, by);
    world();
    drawWindowLight(t);
    drawRecordTop(dt);
    drawCat(t);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(scenery.table, bx, by);
    world();
    drawTableLive(t, dt);
  } else {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#d8c29b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(S * dpr, 0, 0, S * dpr, (OX + sx) * dpr, (OY + sy) * dpr);
    drawFloor(x0, y0, x1, y1);
    drawWindowLight(t);
    drawRug();
    drawChair();
    drawRecord(dt);
    drawCat(t);
    drawTable(t, dt);
  }
  drawTableCat(t, dt);
  drawTargets(t);

  // (the dotted trail of where the cue ball has been is no longer drawn: it cluttered the table; `trails` still records it)
  for (const m of marks) {
    ctx.fillStyle = '#fbf8f0'; ctx.strokeStyle = '#2d3a30'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(m.x, m.y, 9, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2d3a30'; ctx.font = "500 11px 'DM Mono', monospace"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(m.n, m.x, m.y + 0.5);
  }

  drawAim(t);
  drawSkew(dt);

  for (const b of table.live()) updateSpin(b, dt);
  // potted balls swirl down into the pocket as they shrink
  for (const sk of fx.sinks) {
    sk.t += dt / 0.36;
    const k = Math.min(1, sk.t) ** 1.6, a = k * 2.6, dx = (sk.x - sk.tx) * (1 - k), dy = (sk.y - sk.ty) * (1 - k);
    drawBall(sk.b, sk.tx + dx * Math.cos(a) - dy * Math.sin(a), sk.ty + dx * Math.sin(a) + dy * Math.cos(a), 1 - 0.6 * k, 1 - k * k);
  }
  if (hole.gold != null && !goldUsed && phase !== 'holed') {
    const p = table.pk[hole.gold], k = 0.65 + 0.35 * Math.sin(t * 3.2);
    const g = ctx.createRadialGradient(p.x, p.y, p.cap * 0.6, p.x, p.y, p.cap * 2.3);
    g.addColorStop(0, `rgba(255,200,70,${0.6 * k})`); g.addColorStop(1, 'rgba(255,200,70,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.cap * 2.3, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(226,177,60,${0.7 + 0.3 * k})`; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(p.x, p.y, p.cap + 3, 0, TAU); ctx.stroke();
  }
  for (const p of table.pk) if (p.glow > 0) {
    p.glow = Math.max(0, p.glow - dt * 1.8);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.cap * 2.4);
    g.addColorStop(0, `rgba(255,214,120,${0.55 * p.glow})`); g.addColorStop(1, 'rgba(255,214,120,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, p.cap * 2.4, 0, TAU); ctx.fill();
  }
  // spin taking hold: gold arcs whirl round the cue ball (back for draw, forward for follow)
  if (spinFx && !table.cue.potted) {
    spinFx.t += dt;
    const k = spinFx.t / 0.7, c = table.cue, dir = spinFx.kind === 'draw' ? -1 : 1;
    if (k >= 1) spinFx = null;
    else {
      ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(dir * spinFx.t * 14);
      ctx.strokeStyle = `rgba(226,177,60,${0.85 * (1 - k)})`; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (let i = 0; i < 2; i++) { ctx.beginPath(); ctx.arc(0, 0, R + 6 + k * 10, i * Math.PI, i * Math.PI + 1.3); ctx.stroke(); }
      ctx.restore();
    }
  }
  fx.sinks = fx.sinks.filter(sk => sk.t < 1);
  if (phase === 'replay') drawReplay(dt);
  else {
    for (const [b, k] of tunPop) { const n = k + dt / 0.38; if (n > 1.4) tunPop.delete(b); else tunPop.set(b, n); }
    for (const b of table.balls) if (!b.potted && !b.uN) drawLiveBall(b);
    if (!table.cue.potted && !table.cue.uN) drawLiveBall(table.cue);
  }
  // the cue drives on through where the cue ball was, then eases back and fades
  if (follow && follow.t < 0.5) {
    const k = follow.t / 0.5, push = follow.power * 70 * Math.sin(Math.min(1, k * 1.6) * Math.PI / 2) * (1 - k * 0.4);
    ctx.globalAlpha = 1 - k ** 2; drawCue(follow.angle, 0, 1, follow, push); ctx.globalAlpha = 1;
  } else follow = null;
  // a bright flash where balls meet, sized by how hard
  ctx.globalCompositeOperation = 'lighter';
  for (const f of fx.flashes) {
    f.life -= dt; const k = Math.max(0, f.life / 0.2);
    const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
    g.addColorStop(0, `rgba(255,250,230,${0.8 * k})`); g.addColorStop(1, 'rgba(255,250,230,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.x, f.y, f.r, 0, TAU); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  fx.flashes = fx.flashes.filter(f => f.life > 0);
  // a pocket's jaws shiver after a ball stops on the lip
  for (const p of table.pk) if (p.wobble > 0) {
    p.wobble = Math.max(0, p.wobble - dt * 1.5);
    ctx.strokeStyle = `rgba(184,85,63,${0.8 * p.wobble})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(p.x + Math.sin(t * 60) * 3 * p.wobble, p.y, p.cap + 4, 0, TAU); ctx.stroke();
  }
  if (phase === 'replay') {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = "700 15px 'DM Mono', monospace"; ctx.fillStyle = 'rgba(251,248,240,.9)';
    ctx.fillText('● REPLAY · tap to skip', W / 2, 26);
    ctx.font = "800 30px 'DM Sans', sans-serif"; ctx.fillStyle = '#e2b13c';
    ctx.fillText(replay.kinds.join(' + '), W / 2, 62);
  }
  if (phase === 'aim') drawCue(aim.angle, demo ? demoPull(demo.t).p : power, 0);
  drawAimLabels();
  if (phase === 'aim' && !hold) drawGimmes(t);
  if (phase === 'strike') drawCue(strike.t < 0 ? aim.angle : strike.angle, strike.power, clamp((strike.t - (strike.end - 0.1)) / 0.1, 0, 1));

  for (const g of fx.rings) {
    g.life -= dt;
    const k = Math.max(0, g.life / g.max);
    ctx.strokeStyle = `rgba(${g.color},${k * 0.7})`; ctx.lineWidth = 1.5 + 2.5 * k;
    ctx.beginPath(); ctx.arc(g.x, g.y, g.r + g.grow * (1 - k), 0, TAU); ctx.stroke();
  }
  fx.rings = fx.rings.filter(g => g.life > 0);
  for (const p of fx.particles) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.93; p.vy *= 0.93; p.life -= dt;
    ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.color; ctx.fillRect(p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
  }
  fx.particles = fx.particles.filter(p => p.life > 0);
  ctx.globalAlpha = 1;

  for (const pl of DECOR.plants) drawPlant(pl, t);

  for (const c of fx.confetti) {
    c.life -= dt; c.y += c.vy * dt; c.x += c.vx * dt + Math.sin(c.y * 0.03 + c.rot) * 0.8; c.rot += c.vr * dt;
    ctx.globalAlpha = Math.min(1, c.life); ctx.fillStyle = c.c;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.rot); ctx.scale(1, Math.cos(c.rot * 1.7)); ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h); ctx.restore();
  }
  fx.confetti = fx.confetti.filter(c => c.life > 0 && c.y < H + 60);
  ctx.globalAlpha = 1;

  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of fx.floats) {
    f.life -= dt; f.y -= 22 * dt;
    const k = f.life / f.max, pop = k > 0.85 ? 1 + (k - 0.85) * 2 : 1;
    ctx.globalAlpha = Math.min(1, k * 2.5);
    ctx.font = `700 ${f.size * pop}px 'DM Sans', sans-serif`;
    const tw = ctx.measureText(f.text).width;
    ctx.fillStyle = 'rgba(251,248,240,.92)'; ctx.beginPath(); ctx.roundRect(f.x - tw / 2 - 10, f.y - f.size * 0.7, tw + 20, f.size * 1.4, f.size * 0.7); ctx.fill();
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y + 1);
  }
  fx.floats = fx.floats.filter(f => f.life > 0);
  ctx.globalAlpha = 1;

  drawBanner(dt);
  drawStamp(dt);

  // cloud shadows: three huge, very soft sprites, each stretched over most of the screen, which cost more than the
  // rest of the room put together. They're drawn into a canvas at a quarter of the resolution and that is stretched
  // over the screen once: the same soft shapes for a third of the work.
  const cb = CLOUD_BUF, cq = 4;
  if (cb.width !== Math.ceil(canvas.width / cq) || cb.height !== Math.ceil(canvas.height / cq)) { cb.width = Math.ceil(canvas.width / cq); cb.height = Math.ceil(canvas.height / cq); }
  const cg = cb.getContext('2d');
  cg.setTransform(1, 0, 0, 1, 0, 0); cg.clearRect(0, 0, cb.width, cb.height);
  cg.setTransform(S * dpr / cq, 0, 0, S * dpr / cq, (OX + sx) * dpr / cq, (OY + sy) * dpr / cq);
  for (const c of clouds) {
    c.x += c.v * dt; if (c.x - c.r > x1 + 400) c.x = x0 - c.r - 200;
    cg.drawImage(CLOUD, c.x - c.r, c.y - c.r, c.r * 2, c.r * 2);
  }
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(cb, 0, 0, cb.width * cq, cb.height * cq); ctx.restore();
  ctx.globalCompositeOperation = 'lighter';
  for (const m of motes) {
    const mx = m.x + Math.sin(t * 0.13 * m.s + m.p) * 40, my = m.y + Math.cos(t * 0.1 * m.s + m.p) * 30 - (t * 4 * m.s) % 60;
    ctx.globalAlpha = 0.25 + 0.35 * Math.sin(t * m.s + m.p) ** 2;
    ctx.drawImage(MOTE, mx - 4, my - 4, 8, 8);
  }
  ctx.globalAlpha = 1;
  ctx.drawImage(LAMP, W / 2 - H * 0.75, H / 2 - H * 0.75, H * 1.5, H * 1.5);
  drawLampWarmth(t, dt);
  ctx.globalCompositeOperation = 'source-over';

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawContact(dt);
  catStartle = Math.max(0, catStartle - dt * 1.2);
  if (table) drawTray(dt, S, OX, OY);
  // a warm golden glow round the edges on pots, stronger as a streak builds
  if (fx.glow > 0) {
    fx.glow = Math.max(0, fx.glow - dt * 1.4);
    const gg = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.7);
    gg.addColorStop(0, 'rgba(255,200,90,0)'); gg.addColorStop(1, `rgba(255,190,80,${0.35 * fx.glow})`);
    ctx.fillStyle = gg; ctx.fillRect(0, 0, cw, ch);
  }
  // the vignette: a full-screen radial gradient was being rasterised every frame, so it's painted once per size at a
  // quarter of the resolution (it's only a soft shade) and stretched over; its strength is the copy's alpha
  const vb = VIGNETTE_BUF;
  if (vb.cw !== cw || vb.ch !== ch) {
    vb.cw = cw; vb.ch = ch; vb.width = Math.ceil(cw / 4); vb.height = Math.ceil(ch / 4);
    const vc = vb.getContext('2d'), vg = vc.createRadialGradient(vb.width / 2, vb.height / 2, Math.min(vb.width, vb.height) * 0.35, vb.width / 2, vb.height / 2, Math.max(vb.width, vb.height) * 0.75);
    vg.addColorStop(0, 'rgba(60,40,20,0)'); vg.addColorStop(1, 'rgba(40,25,10,1)');
    vc.fillStyle = vg; vc.fillRect(0, 0, vb.width, vb.height);
  }
  ctx.globalAlpha = 0.28 + clamp((PLAY - timeScale) / PLAY, 0, 1) * 0.45;
  ctx.drawImage(vb, 0, 0, cw, ch); ctx.globalAlpha = 1;
  // film grain: hop the noise tile to a new random offset ~12 times a second, so it shimmers in place
  // (sliding it steadily made it read as diagonal rain)
  const gf = Math.floor(t * 12), gx = hash01(gf) * 160, gy = hash01(gf + 0.5) * 160;
  ctx.save(); ctx.translate(gx, gy); ctx.fillStyle = GRAIN; ctx.fillRect(-160, -160, cw + 320, ch + 320); ctx.restore();
}


// Trick scoring: the streak warms the lamp over the table (22 Nov; it replaced a glow round the screen's edges, which
// looked ugly). Nothing at x1; each step after that adds a warmer, brighter pool of light, and at x3 it flickers like
// a flame. A miss or foul drops it back quickly. One extra sprite drawn as light: no new gradients per frame.
const WARM_LAMP = glowSprite(256, [[0, 'rgba(255,170,70,.34)'], [0.5, 'rgba(255,150,60,.14)'], [1, 'rgba(255,140,50,0)']]);
let streakLvl = 0;
const streakTarget = () => round?.trick && hs ? (streakMult(hs.streak) - 1) * 2 : 0;   // 0 at x1 ... 4 at x3
const streakGlowBusy = () => Math.abs(streakLvl - streakTarget()) > 0.01 || streakLvl > 3.5;
function drawLampWarmth(t, dt) {
  const want = streakTarget();
  streakLvl = want > streakLvl ? Math.min(want, streakLvl + dt * 3) : Math.max(want, streakLvl - dt * 8);
  if (streakLvl < 0.01) return;
  // kept to the table and gentle at its strongest (22 Nov: the first version lit the whole room and was too much at x3)
  const flicker = streakLvl > 3.5 ? 0.92 + 0.05 * Math.sin(t * 11) + 0.03 * Math.sin(t * 23 + 1) : 1;
  ctx.globalAlpha = 0.45 * Math.min(1, streakLvl / 4) * flicker;
  const r = H * 0.5;
  ctx.drawImage(WARM_LAMP, W / 2 - r, H / 2 - r, r * 2, r * 2);
  ctx.globalAlpha = 1;
}
// Trick scoring's moving targets: a faint track, and a gold ring sliding along it. In the replay they follow the
// replay's clock, and one that was hit on this shot vanishes at the moment it was crossed.
function drawTargets(t) {
  if (!targets.length) return;
  const clock = phase === 'replay' && replay ? shotClock0 + replay.T : tgtClock;
  ctx.save();
  for (const o of targets) {
    if (o.hit && !(phase === 'replay' && o.hitClock != null && o.hitClock > clock && o.hitClock >= shotClock0)) continue;
    ctx.strokeStyle = 'rgba(251,248,240,.22)'; ctx.lineWidth = 2; ctx.setLineDash([3, 9]); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(o.ax, o.ay); ctx.lineTo(o.bx, o.by); ctx.stroke(); ctx.setLineDash([]);
    const p = tgtPos(o, clock), k = 0.75 + 0.25 * Math.sin(t * 4);
    ctx.fillStyle = `rgba(255,214,110,${0.14 + 0.08 * k})`; ctx.beginPath(); ctx.arc(p.x, p.y, TGT_R, 0, TAU); ctx.fill();
    ctx.strokeStyle = `rgba(226,177,60,${0.75 + 0.25 * k})`; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(p.x, p.y, TGT_R, 0, TAU); ctx.stroke();
    ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x, p.y, TGT_R * 0.45, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(226,177,60,.9)'; ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
