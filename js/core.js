// core.js: the rules and the holes, no DOM. RULES (the date switches), table constants, seeded RNG (mulberry32,
// rngFor), day and course names, table shapes (SHAPES, mkShape), features (gate, sand, cat, tunnel) and hole
// generation: makeHole, buildHole, placeFeature, clearable, openingPot, leaveQ.
// Loads first. Hole generation calls into physics.js (Table, simulate, potLine, ...), so holes are only built once
// that has loaded (main.js starts the round).

/* =================== core: racks and physics (no DOM) =================== */

// ---- RULES: the date switches ----
// Every daily course is built from its date, the same for everyone, so a change that alters layouts or play is
// switched on from a date and never reaches a day already played. A practice course (a seed that isn't a date)
// always gets the newest rules. Each line: the first day it applies, and what changed.
// Folded in and always on (their old branches are gone): par scoring and table shapes (12 Nov 2026), spread-out
// racks (13 Nov), the short round with a feature on holes 3-6 and a golden pocket (14 Nov). Old ?seed= dates
// before then open a par practice round as a short round, with that date's RULES switches still applied
// (e.g. ?seed=2026-11-12 still deals the gate and the old 1050 rattle speed).
const RULES = {
  FORGIVE_FROM: '2026-11-16',   // forgiving pockets: a ball rattles out only above POT_MAX_FORGIVING (1700, was 1050)
  NO_GATE_FROM: '2026-11-16',   // the one-way gate leaves the feature deck: holes 3-6 get sand and the cat
  TUNNELS_FROM: '2026-11-17',   // tunnels join the deck: sand, the cat and a tunnel
  SHOT_READ_FROM: '2026-11-17', // the strike's difficulty reads the whole shot: cut, banks, kicks, combinations
  NO_TILT_FROM: '2026-11-25',   // no more tilted tables (the aim lines are straight but tilted balls curve: lines lied)
  TRICK_SCORE_FROM: null,       // trick scoring replaces par (state.js, trickOn); null until the date is chosen. Try it with ?trick
};
const isDailySeed = s => /^\d{4}-\d{2}-\d{2}$/.test(s);
// is the rule that starts on day `from` on for this seed?
const ruleOn = (seed, from) => !isDailySeed(seed) || seed >= from;

const W = 500, H = 1000, RAIL = 40, R = 17, DT = 1 / 240, TAU = Math.PI * 2;
const MAX_SPEED = 2600, ROLL_DECEL = 240, LIN_DAMP = 0.32, STOP = 6;
const BALL_E = 0.95, BUMPER_E = 0.9, CUSHION_E = 0.78, POT_MAX_SPEED = 1050;
// Side spin (16 Nov, player shots only: generation never sets it): how hard it bends the cue ball off a cushion (as a
// share of the speed into it), how much is left after each cushion, and how it wears off as the ball rolls (per step:
// about half gone in two seconds).
const SIDE_K = 0.32, SIDE_KEEP = 0.55, SIDE_WEAR = 0.9986;
// From RULES.FORGIVE_FROM pockets are more forgiving: a ball only rattles out above POT_MAX_FORGIVING (a real
// smash), so far fewer good shots are lost to pace. Earlier days keep POT_MAX_SPEED.
const POT_MAX_FORGIVING = 1700;
const potMax = h => ruleOn(h.seed, RULES.FORGIVE_FROM) ? POT_MAX_FORGIVING : POT_MAX_SPEED;
// 0 is the cue ball; 1-8 solids, 9-15 stripes (a hole's balls are numbered from all fifteen).
const COLORS = ['#f4efe2', '#e2b13c', '#3b5ea6', '#c4472f', '#6a4b8c', '#dc7a30', '#3d8758', '#86372b', '#24221f', '#e2b13c', '#3b5ea6', '#c4472f', '#6a4b8c', '#dc7a30', '#3d8758', '#86372b'];
const POCKETS = [
  { x: 0, y: 0, cap: R * 1.75 }, { x: W, y: 0, cap: R * 1.75 },
  { x: -5, y: H / 2, cap: R * 1.55 }, { x: W + 5, y: H / 2, cap: R * 1.55 },
  { x: 0, y: H, cap: R * 1.75 }, { x: W, y: H, cap: R * 1.75 },
];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function mulberry32(a) {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 2166136261;
  for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
const rngFor = key => mulberry32(hashStr('daily-break:' + key));
function shuffle(rnd, arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// Days are named by date ("11 Nov"), not numbered.
function dayLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const NAME_A = ['Velvet', 'Brass', 'Juniper', 'Amber', 'Willow', 'Copper', 'Moss', 'Ivory', 'Saffron', 'Linden', 'Hazel', 'Marigold'];
const NAME_B = ['Room', 'Parlour', 'Hall', 'Lounge', 'Club', 'Den', 'House', 'Rooms'];
function courseName(seed) {
  const r = rngFor(seed + ':name');
  return `${NAME_A[Math.floor(r() * NAME_A.length)]} ${NAME_B[Math.floor(r() * NAME_B.length)]}`;
}

// Where a ball must travel to drop in pocket i (just inside the mouth).
function pocketAim(i, h) {
  if (h?.shape) return h.shape.pockets[i].aim;
  const p = POCKETS[i];
  return { x: p.x <= 0 ? R + 1 : p.x >= W ? W - R - 1 : p.x, y: p.y <= 0 ? R + 1 : p.y >= H ? H - R - 1 : p.y };
}

// ---- table shapes ----
// From hole 3, each hole is played on a table shape drawn for the day (the same for everyone): the classic
// rectangle or one of these. Every shape fits the same 500 x 1000 box and has six pockets.
const segDist0 = (px, py, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)); return Math.hypot(ax + dx * u - px, ay + dy * u - py); };
function inPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function mkShape(key, name, emoji, outer, pockets, islands = [], spawn = [W / 2, H * 0.8]) {
  const sh = { key, name, emoji, outer, islands, spawn, segs: [], reflex: [] };
  const inFelt = (x, y) => inPoly(outer, x, y) && !islands.some(p => inPoly(p, x, y));
  for (const poly of [outer, ...islands]) poly.forEach(([ax, ay], k) => {
    const [bx, by] = poly[(k + 1) % poly.length], l = Math.hypot(bx - ax, by - ay);
    let nx = -(by - ay) / l, ny = (bx - ax) / l;   // a normal; flip it to point into the felt
    if (!inFelt((ax + bx) / 2 + nx * 3, (ay + by) / 2 + ny * 3)) { nx = -nx; ny = -ny; }
    sh.segs.push({ ax, ay, bx, by, nx, ny, l2: l * l });
  });
  // corners that stick into the felt (the inside of the L, the hourglass waist) can block a pot
  for (const poly of [outer, ...islands]) poly.forEach(([x, y], k) => {
    const [px, py] = poly[(k + poly.length - 1) % poly.length], [qx, qy] = poly[(k + 1) % poly.length];
    if (!inFelt(x + (px + qx - 2 * x) * 0.01, y + (py + qy - 2 * y) * 0.01)) sh.reflex.push([x, y]);
  });
  sh.inFelt = inFelt;
  // where a ball's centre aims for each pocket: just inside the mouth, away from the cushions
  sh.pockets = pockets.map(([x, y, c]) => {
    let dx = 0, dy = 0;
    for (const g of sh.segs) if (segDist0(x, y, g.ax, g.ay, g.bx, g.by) < 8) { dx += g.nx; dy += g.ny; }
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    let ax = x, ay = y;
    for (let k = 0; k < 80 && !freeIn(sh, ax, ay, R + 1); k++) { ax += dx * 1.5; ay += dy * 1.5; }
    return { x, y, cap: R * c, aim: { x: ax, y: ay } };
  });
  sh.reflex = sh.reflex.filter(([x, y]) => !sh.pockets.some(p => Math.hypot(p.x - x, p.y - y) < 2));
  return sh;
}
// is a ball of radius rad at (x, y) wholly on the felt of shape sh?
function freeIn(sh, x, y, rad) {
  return sh.inFelt(x, y) && sh.segs.every(g => segDist0(x, y, g.ax, g.ay, g.bx, g.by) >= rad);
}
const ellipse = (n, cx, cy, rx, ry) => Array.from({ length: n }, (_, k) => { const a = k / n * TAU; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
const onEllipse = (deg, out = 4) => { const a = deg * Math.PI / 180, x = Math.cos(a), y = Math.sin(a), n = Math.hypot(x / 250, y / 500); return [250 + x * (250 + out * n * 250), 500 + y * (500 + out * n * 500), 1.6]; };
const SHAPES = [
  mkShape('hexagon', 'Hexagon', '⬡', [[250, 0], [500, 190], [500, 810], [250, 1000], [0, 810], [0, 190]],
    [[250, 0, 1.65], [500, 190, 1.65], [0, 190, 1.65], [500, 810, 1.65], [0, 810, 1.65], [250, 1000, 1.65]]),
  mkShape('octagon', 'Octagon', '⯃', [[100, 0], [400, 0], [500, 100], [500, 900], [400, 1000], [100, 1000], [0, 900], [0, 100]],
    [[46, 46, 1.75], [454, 46, 1.75], [-5, 500, 1.55], [505, 500, 1.55], [46, 954, 1.75], [454, 954, 1.75]]),
  mkShape('ell', 'L-shape', '⌐', [[0, 0], [500, 0], [500, 540], [260, 540], [260, 1000], [0, 1000]],
    [[0, 0, 1.75], [500, 0, 1.75], [-5, 520, 1.55], [500, 540, 1.75], [0, 1000, 1.75], [260, 1000, 1.75]], [], [130, 820]),
  mkShape('hourglass', 'Hourglass', '⧗', [[0, 0], [500, 0], [500, 410], [375, 500], [500, 590], [500, 1000], [0, 1000], [0, 590], [125, 500], [0, 410]],
    [[0, 0, 1.75], [500, 0, 1.75], [125, 500, 1.45], [375, 500, 1.45], [0, 1000, 1.75], [500, 1000, 1.75]]),
  mkShape('oval', 'Oval', '⬭', ellipse(56, 250, 500, 250, 500),
    [onEllipse(-90), onEllipse(-35), onEllipse(-145), onEllipse(35), onEllipse(145), onEllipse(90)]),
  mkShape('island', 'Island', '⊡', [[0, 0], [W, 0], [W, H], [0, H]],
    POCKETS.map(p => [p.x, p.y, p.cap / R]), [[[215, 410], [285, 410], [315, 440], [315, 560], [285, 590], [215, 590], [185, 560], [185, 440]]]),
];
const SHAPE_KEYS = ['classic', ...SHAPES.map(s => s.key)];
// The shape for hole i (0-based): classic for holes 1-2. From hole 3 the day's shapes are dealt like a shuffled
// deck (classic included), so you see all seven before any repeats, never twice running.
function shapeFor(seed, i) {
  if (i < 2) return null;
  const n = SHAPE_KEYS.length, c = Math.floor((i - 2) / n);
  const deck = c => shuffle(rngFor(`${seed}:shapes:${c}`), SHAPE_KEYS), cur = deck(c);
  if (c > 0 && cur[0] === deck(c - 1)[n - 1]) [cur[0], cur[1]] = [cur[1], cur[0]];
  return SHAPES.find(s => s.key === cur[(i - 2) % n]) || null;
}
const pocketsOf = h => h.shape ? h.shape.pockets : POCKETS;

// ---- features ----
// A round is six holes of at most SHORT_MAX balls (1, 2, 3, 3, 3, 3), and holes 3-6 each get one feature, dealt for
// the day from featureKeys (so one comes up twice), each placed where it gets in the way of the good pots
// (placeFeature): a sand bunker, the cat, a one-way gate (a hinged flap that swings open from one side and is
// solid from the other; until RULES.NO_GATE_FROM) or a tunnel (from RULES.TUNNELS_FROM). All of it runs in the
// deterministic physics.
const SHORT_MAX = 3;
const FEATURE_NAMES = { gate: 'One-way gate', sand: 'Sand bunker', cat: 'The cat', tunnel: 'Tunnel' };
const featureKeys = seed => ruleOn(seed, RULES.TUNNELS_FROM) ? ['sand', 'cat', 'tunnel'] : ruleOn(seed, RULES.NO_GATE_FROM) ? ['sand', 'cat'] : ['gate', 'sand', 'cat'];
const ballsFor = (seed, i) => Math.min(i + 1, SHORT_MAX);
// Holes 2 to 6 have a golden pocket (pot into it for a stroke back).
const goldHole = (seed, i) => i >= 1;
const featureName = h => h.feature ? FEATURE_NAMES[h.feature] : '';
const CAT_R = 30, CAT_E = 0.3;   // the cat on the felt: a big soft ball that soaks up most of a hit
const BAR_T = 6, GATE_MAX = 1.45, GATE_BACK = 2.2;   // the gate's flap: half-thickness, how far it opens, how fast it swings shut
// Tunnels (in the daily rotation from RULES.TUNNELS_FROM). Two openings built into facing cushions, joined under the table: a ball that rolls into one comes back in
// through the other, heading the same way (it wraps round, like going off one side of an arcade screen and on at the
// other), a little slower. They sit on the cushions, out of the way, as an optional route; placement always sets up
// a real pot through them.
const TUN_HALF = R * 2.4, TUN_KEEP = 0.92, TUN_T = 0.35;   // half the opening's width, pace kept, time under the table
const tunMouths = h => h.tunnel ? [h.tunnel.a, h.tunnel.b] : [];
// where a ball comes back onto the felt from mouth m: just off the cushion, in the middle of the opening
const tunExit = m => ({ x: m.x + m.nx * (R + 3), y: m.y + m.ny * (R + 3) });
// how far a ball centre at (x, y) is along mouth m's cushion (from its middle) and out from it into the felt
const tunLocal = (m, x, y) => ({ along: (x - m.x) * -m.ny + (y - m.y) * m.nx, out: (x - m.x) * m.nx + (y - m.y) * m.ny });
// The opening's mouth is flared: a ball coming in at an angle is caught up to R further along (sin of its angle off
// straight-on), so a diagonal shot gets a fair target. (vx, vy) is its heading, any length.
const tunReach = (m, vx, vy) => { const v = Math.hypot(vx, vy) || 1, c = Math.abs(vx * m.nx + vy * m.ny) / v; return TUN_HALF + R * Math.sqrt(Math.max(0, 1 - c * c)); };
// the straight cushions a tunnel can open in: the table's outer cushions long enough for one (the four sides of the
// classic table)
function tunRails(h) {
  if (!h.shape) return [{ ax: 0, ay: 0, bx: 0, by: H, nx: 1, ny: 0 }, { ax: W, ay: 0, bx: W, by: H, nx: -1, ny: 0 }, { ax: 0, ay: 0, bx: W, by: 0, nx: 0, ny: 1 }, { ax: 0, ay: H, bx: W, by: H, nx: 0, ny: -1 }];
  return h.shape.segs.slice(0, h.shape.outer.length).map(g => ({ ax: g.ax, ay: g.ay, bx: g.bx, by: g.by, nx: g.nx, ny: g.ny })).filter(g => Math.hypot(g.bx - g.ax, g.by - g.ay) > 4 * TUN_HALF + 60);
}
// The feature for hole i (0-based): none on holes 1-2, then the day's deck.
function obstFor(seed, i) {
  if (i < 2) return null;
  const ks = featureKeys(seed), deck = shuffle(rngFor(`${seed}:feature`), ks);
  // the oval has no straight facing cushions for a tunnel, so an oval tunnel hole takes the next feature in the deck
  const canTunnel = tunRails({ shape: shapeFor(seed, i) }).some((g, k, all) => all.some(o => g.nx * o.nx + g.ny * o.ny < -0.98));
  for (let k = 0; k < deck.length; k++) { const f = deck[(i - 2 + k) % deck.length]; if (f !== 'tunnel' || canTunnel) return f; }
  return null;
}
// The solid bars of a table's obstacle (the gate's flap) right now: [ax, ay, bx, by, solidSide]
function obstBars(t) {
  const o = t.hole.obst;
  if (!o) return [];
  if (o.type === 'gate') {
    const a = o.a0 + o.dir * t.gp, ex = o.x + Math.cos(a) * o.len, ey = o.y + Math.sin(a) * o.len;
    return [[o.x, o.y, ex, ey, { nx: -o.dir * Math.sin(a), ny: o.dir * Math.cos(a) }]];
  }
  return [];
}
function inPatch(p, x, y) {
  const c = Math.cos(-p.rot), s = Math.sin(-p.rot), dx = x - p.x, dy = y - p.y;
  const lx = dx * c - dy * s, ly = dx * s + dy * c;
  return (lx / p.rx) ** 2 + (ly / p.ry) ** 2 < 1;
}
function lieAt(hole, x, y) {
  for (const p of hole.patches) if (inPatch(p, x, y)) return p.type;
  return 'felt';
}

// Hole i (0-based) is a seeded layout of ballsFor(seed, i) balls, the same for everyone on the day.
// It's re-rolled (deterministically) until the opening shot really drops.
const holeCache = new Map();
function makeHole(seed, i) {
  const key = `${seed}:${i}`;
  if (holeCache.has(key)) return holeCache.get(key);
  const n = ballsFor(seed, i), needFeature = !!obstFor(seed, i);
  const done = h => {
    if (goldHole(seed, i) && h.gold == null) h.gold = pickGold(h, rngFor(`${seed}:gold:${i}`));
    holeCache.set(key, h); return h;
  };
  let h = null, fallback = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    h = buildHole(seed, i, attempt);
    if (h.balls.length !== n || needFeature && !h.feature || !openingPot(h)) continue;
    fallback = fallback || h;
    if (clearable(h)) return done(h);
  }
  return done(fallback || h);
}
// The golden pocket: never the pocket of the easiest pot, but (where it can) one that some open pot goes into.
function pickGold(h, rr) {
  const t = new Table(h), ls = allLines(t).filter(l => !l.blocked), top = [...ls].sort((a, b) => b.q - a.q)[0];
  const pks = [0, 1, 2, 3, 4, 5].filter(i => t.openPocket(i) && (!top || i !== top.pocket));
  const live = pks.filter(i => ls.some(l => l.pocket === i && l.q > 0.12)), pool = live.length ? live : pks;
  return pool.length ? pool[Math.floor(rr() * pool.length)] : null;
}
// Can the whole level be cleared? A bot with perfect execution plays it: each shot it tries the best
// few pots (stun, follow and draw at three paces), keeps the one that leaves the best next pot, and
// must clear every ball in as many shots as there are balls, with no fouls. This rules out layouts
// that only become impossible after the first pot (two balls frozen together on a rail, say).
function clearable(h) {
  let t = new Table(h);
  for (let shot = 0; shot < h.balls.length; shot++) {
    if (!t.remaining()) return true;
    const ls = allLines(t).filter(l => !l.blocked && l.cos > 0.45).sort((a, b) => b.q - a.q).slice(0, 4);
    let best = null;
    search: for (const l of ls) for (const pw of h.feature === 'sand' ? [0.4, 0.3, 0.55, 0.75] : [0.4, 0.3, 0.55]) for (const sp of [0, 0.6, -0.6]) {
      const s = simulate(t, l.angle, pw, sp), b = s.balls[l.bi];
      if (s.shot.scratch || s.shot.firstHit !== b || !s.shot.pots.some(p => p.ball === b)) continue;
      const v = s.remaining() ? leaveQ(s) : 9;
      if (!best || v > best.v) best = { v, s };
      if (v >= 0.45) break search;   // a comfortable next pot: good enough
    }
    if (!best || (best.v <= 0 && best.s.remaining())) return false;
    best.s.shot = null; t = best.s;
  }
  return !t.remaining();
}
// How good is the leave: the best clean, not-too-thin pot available from where everything stopped.
function leaveQ(t) {
  let q = 0;
  for (const l of allLines(t)) if (!l.blocked && l.cos > 0.45) q = Math.max(q, l.q);
  return q;
}
// The opening shot must be a real pot: an unblocked, not-too-thin cut that a centre-ball hit at a
// sensible pace actually sinks (tilt and felt included), without scratching.
function openingPot(h) {
  const t = new Table(h);
  const ls = allLines(t).filter(l => !l.blocked && l.cos > 0.55).sort((a, b) => b.q - a.q).slice(0, 4);
  for (const l of ls) for (const pw of h.feature === 'sand' ? [0.3, 0.42, 0.55, 0.7] : [0.3, 0.42, 0.55]) {
    const s = simulate(t, l.angle, pw, 0), b = s.balls[l.bi];
    if (!s.shot.scratch && s.shot.firstHit === b && s.shot.pots.some(p => p.ball === b)) return true;
  }
  return false;
}
function buildHole(seed, i, attempt) {
  const rnd = rngFor(`${seed}:level:${i}` + (attempt ? `:${attempt}` : ''));
  // hazards start at level 3 and ramp up from there
  const hz = clamp(i - 1, 0, 8), haz = p => hz > 0 && rnd() < p;
  const closed = haz(0.04 + hz * 0.04) ? [Math.floor(rnd() * 6)] : [];
  const placed = [], shape = shapeFor(seed, i), pks = shape ? shape.pockets : POCKETS;
  const ok = (x, y, rad, gap, pkGap = R * 3.2) => (shape ? freeIn(shape, x, y, rad + 6) : x > rad + 6 && x < W - rad - 6 && y > rad + 6 && y < H - rad - 6) &&
    placed.every(o => Math.hypot(o.x - x, o.y - y) > o.r + rad + gap) &&
    pks.every(p => Math.hypot(p.x - x, p.y - y) > rad + pkGap);
  const place = (gen, rad, gap, pkGap) => {
    for (let k = 0; k < 500; k++) {
      const [x, y] = gen();
      if (ok(x, y, rad, gap, pkGap)) { const o = { x, y, r: rad }; placed.push(o); return o; }
    }
    return null;
  };
  const kind = obstFor(seed, i);
  const cue = place(() => [70 + rnd() * (W - 140), H * 0.62 + rnd() * H * 0.32], R, R * 2) || (shape ? { x: shape.spawn[0], y: shape.spawn[1] } : { x: W / 2, y: H * 0.8 });
  const bumpers = [];
  const nBump = haz(0.08 + hz * 0.05) ? 1 + (hz > 5 && rnd() < 0.4 ? 1 : 0) : 0;
  for (let k = 0; k < nBump; k++) {
    const o = place(() => [100 + rnd() * (W - 200), 160 + rnd() * (H - 420)], 18 + rnd() * 10, R * 2.5);
    if (o) bumpers.push({ x: o.x, y: o.y, r: o.r });
  }
  const n = ballsFor(seed, i), nums = shuffle(rnd, Array.from({ length: 15 }, (_, k) => k + 1)), balls = [];
  for (let k = 0; k < n; k++) {
    // no ball starts touching or crowding another: a ball-width-ish gap between them all (rail balls sit on a cushion)
    const mode = rnd() < 0.22 ? 'rail' : 'open';
    const o = place(() => {
      if (mode === 'rail' && shape) { const g = shape.segs[Math.floor(rnd() * shape.segs.length)], u = 0.15 + rnd() * 0.7; return [g.ax + (g.bx - g.ax) * u + g.nx * (R + 8), g.ay + (g.by - g.ay) * u + g.ny * (R + 8)]; }
      if (mode === 'rail') { const side = Math.floor(rnd() * 3), u = rnd(); return side === 0 ? [R + 8, 60 + u * (H * 0.7)] : side === 1 ? [W - R - 8, 60 + u * (H * 0.7)] : [60 + u * (W - 120), R + 8]; }
      return [40 + rnd() * (W - 80), 40 + rnd() * (H * 0.72 - 40)];
    }, R, R * 1.6);
    if (o) balls.push({ x: o.x, y: o.y, n: nums[k] });
  }
  const patches = [];   // the sand bunker, if this hole gets one (placeFeature)
  let tilt = { x: 0, y: 0, mag: 0, dir: 0 };
  if (haz(0.1 + hz * 0.06)) {
    const dir = Math.floor(rnd() * 8), mag = 10 + rnd() * (6 + hz * 3), a = dir * Math.PI / 4;
    // From RULES.NO_TILT_FROM the table stays flat: the numbers are still drawn so everything else on the table is
    // dealt as before (23 Nov review: the guide draws straight lines but a tilt curves the balls, by up to 45° on thin
    // cuts, so on a tilted table the lines lied)
    if (!ruleOn(seed, RULES.NO_TILT_FROM)) tilt = { x: Math.cos(a) * mag, y: Math.sin(a) * mag, mag, dir };
  }
  // obst is the gate, set by placeFeature (the key stays in place so the layouts, and their hashes, don't change)
  const h = { i, seed, closed, cue: { x: cue.x, y: cue.y }, balls, bumpers, patches, tilt, shape, obst: null };
  if (kind) placeFeature(h, kind, rngFor(`${seed}:feature:${i}` + (attempt ? `:${attempt}` : '')));
  return h;
}
// The feature goes where it changes the hole, after the balls are down. Candidate spots lie on both legs (cue
// ball to ghost ball, object ball to pocket) of the 8 best open pots, and each is scored by the pots it gets in
// the way of, weighted by how good they are: sand by the legs that cross it, the cat and the gate by the pots they
// block outright. The cat and gate must leave at least one of those pots open. A tunnel is placed so there's a
// real pot through it. makeHole then checks there's a real opening pot and it can be cleared.
function placeFeature(h, kind, rr) {
  const t = new Table(h), pks = pocketsOf(h), c = t.cue;
  const good = allLines(t).filter(l => !l.blocked && l.cos > 0.5).sort((a, b) => b.q - a.q).slice(0, 8);
  if (!good.length) return;
  const legsOf = l => { const b = t.balls[l.bi], P = pocketAim(l.pocket, h); return [[c.x, c.y, l.ghost.x, l.ghost.y, l.d1], [b.x, b.y, P.x, P.y, l.d2]]; };
  const onFelt = (x, y, m) => h.shape ? freeIn(h.shape, x, y, m) : x > m && x < W - m && y > m && y < H - m;
  // room round a spot: on the felt, off the pockets and bumpers, and clear of every ball (reach: how far it extends)
  const clear = (x, y, reach) => onFelt(x, y, reach + 6) && pks.every(q => Math.hypot(q.x - x, q.y - y) > reach + R * 3) &&
    h.bumpers.every(o => Math.hypot(o.x - x, o.y - y) > o.r + reach + 8) && [c, ...t.balls].every(o => Math.hypot(o.x - x, o.y - y) > reach + R + 6);
  const blockedBy = extra => { const t2 = new Table({ ...h, ...extra }); return good.map(l => { const m = potLine(t2, l.bi, l.pocket); return !m || m.blocked; }); };
  const crossesSand = (p, [ax, ay, bx, by]) => { for (let u = 0.05; u <= 0.95; u += 0.05) if (inPatch(p, ax + (bx - ax) * u, ay + (by - ay) * u)) return true; return false; };
  let best = null;
  // Tunnels: a pair of facing cushions (normals opposite). For an exit spot on one and a pot, the heading is fixed
  // (from the exit to the ghost ball), and so is the entrance: where the cue ball, on that heading, meets the
  // facing cushion. Kept if every path is clear and the opening sits well away from the pockets. Preferred: pots that
  // are hard or blocked the normal way, so the tunnel is the clever route, not the only one.
  const tcands = [];
  const tunnelSearch = () => {
    const rails = tunRails(h);
    const direct = new Map(allLines(t).map(l => [l.bi + ':' + l.pocket, l]));
    const spotOK = (x, y, g) => pks.every(q => Math.hypot(q.x - x, q.y - y) > q.cap + TUN_HALF + 2 * R) &&
      Math.min(Math.hypot(x - g.ax, y - g.ay), Math.hypot(x - g.bx, y - g.by)) > TUN_HALF + 24;
    for (const ga of rails) for (const gb of rails) {
      if (ga === gb || ga.nx * gb.nx + ga.ny * gb.ny > -0.98) continue;
      const lb = Math.hypot(gb.bx - gb.ax, gb.by - gb.ay);
      for (let d = TUN_HALF + 30; d < lb - TUN_HALF - 30; d += 28) {
        const bx = gb.ax + (gb.bx - gb.ax) * d / lb, by = gb.ay + (gb.by - gb.ay) * d / lb;
        if (!spotOK(bx, by, gb)) continue;
        const B = { x: bx, y: by, nx: gb.nx, ny: gb.ny }, S = tunExit(B);
        t.balls.forEach((ball, bi) => { for (let pk = 0; pk < 6; pk++) {
          if (!t.openPocket(pk)) continue;
          const P = pocketAim(pk, h), d2 = Math.hypot(P.x - ball.x, P.y - ball.y);
          if (d2 < 60) continue;
          const vx = (P.x - ball.x) / d2, vy = (P.y - ball.y) / d2, gx = ball.x - vx * 2 * R, gy = ball.y - vy * 2 * R;
          const dl = Math.hypot(gx - S.x, gy - S.y);
          if (dl < 60) continue;
          const ux = (gx - S.x) / dl, uy = (gy - S.y) / dl, cos = ux * vx + uy * vy, into = ux * B.nx + uy * B.ny;
          if (cos < 0.72 || into < 0.3) continue;
          // the entrance: where the cue ball, heading (ux, uy), gets to R from the facing cushion
          const k = -(ux * ga.nx + uy * ga.ny), off = (c.x - ga.ax) * ga.nx + (c.y - ga.ay) * ga.ny;
          if (k < 0.3) continue;
          const tt = (off - R) / k, ax = c.x + ux * tt - ga.nx * R, ay = c.y + uy * tt - ga.ny * R;
          if (tt < 60) continue;
          const la = Math.hypot(ga.bx - ga.ax, ga.by - ga.ay), da = (ax - ga.ax) * (ga.bx - ga.ax) / la + (ay - ga.ay) * (ga.by - ga.ay) / la;
          if (da < TUN_HALF + 30 || da > la - TUN_HALF - 30 || !spotOK(ax, ay, ga)) continue;
          const extra = { tunnel: { a: { x: ax, y: ay, nx: ga.nx, ny: ga.ny }, b: B }, feature: 'tunnel' }, t2 = new Table({ ...h, ...extra });
          if (pathBlocked(t2, c.x, c.y, c.x + ux * (tt - 4), c.y + uy * (tt - 4)) ||
            pathBlocked(t2, S.x, S.y, gx, gy, t2.balls[bi]) || pathBlocked(t2, ball.x, ball.y, P.x, P.y, t2.balls[bi])) continue;
          const dl0 = direct.get(bi + ':' + pk), hard = !dl0 || dl0.blocked ? 1 : 1 - dl0.q;
          tcands.push({ extra, score: hard + cos * 0.3 + rr() * 0.001, angle: Math.atan2(uy, ux), ball: bi });
        } });
      }
    }
  };
  if (kind === 'tunnel') tunnelSearch();
  const consider = (extra, hits) => {
    const score = good.reduce((a, l, k) => a + (hits[k] ? l.q : 0), 0) + rr() * 0.001;
    if (score > 0.001 && (!best || score > best.score)) best = { extra, score };
  };
  for (const l of good) for (const [ax, ay, bx, by, len] of legsOf(l)) {
    if (len < 120) continue;
    const across = Math.atan2(by - ay, bx - ax) + Math.PI / 2;
    for (const u of [0.35, 0.5, 0.65]) {
      const x = ax + (bx - ax) * u, y = ay + (by - ay) * u;
      if (kind === 'sand') {
        const p = { type: 'rough', bunker: true, x, y, rx: 85 + rr() * 25, ry: 48 + rr() * 14, rot: across, seed: Math.floor(rr() * 1e6) };
        if (pks.some(q => Math.hypot(q.x - x, q.y - y) < p.rx + R * 2) || inPatch(p, c.x, c.y)) continue;
        consider({ patches: [...h.patches, p], feature: 'sand' }, good.map(m => legsOf(m).some(g => crossesSand(p, g))));
      } else if (kind === 'cat') {
        if (!clear(x, y, CAT_R)) continue;
        const extra = { cat: { x, y, r: CAT_R, cat: true, rot: rr() * TAU }, feature: 'cat' }, hits = blockedBy(extra);
        if (hits.every(Boolean)) continue;
        consider(extra, hits);
      } else if (kind === 'gate') {
        const len = 70 + rr() * 20;
        if (!clear(x, y, len + BAR_T)) continue;
        // the flap from its hinge at (x, y): try it lying across this leg either way, and a couple of other angles
        for (const a0 of [across, across + Math.PI, across + 0.6, across - 0.6]) {
          const extra = { obst: { type: 'gate', x, y, len, a0, dir: rr() < 0.5 ? 1 : -1 }, feature: 'gate' }, hits = blockedBy(extra);
          if (hits.every(Boolean)) continue;
          consider(extra, hits);
        }
      }
    }
  }
  if (kind === 'tunnel') {
    // the tunnel shot must really work: hit the entrance and the ball drops, without scratching
    tcands.sort((a, b) => b.score - a.score);
    for (const cd of tcands.slice(0, 8)) {
      const t2 = new Table({ ...h, ...cd.extra });
      const ok = [0.45, 0.6, 0.75].some(pw => { const s = simulate(t2, cd.angle, pw, 0), b = s.balls[cd.ball]; return !s.shot.scratch && s.shot.tunnels > 0 && s.shot.firstHit === b && s.shot.pots.some(p => p.ball === b); });
      if (ok) { Object.assign(h, cd.extra, { tunnelShot: { angle: cd.angle, ball: cd.ball } }); return; }
    }
    return;
  }
  if (best) Object.assign(h, best.extra);
}

