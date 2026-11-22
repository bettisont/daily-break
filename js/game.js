// game.js: table events (onEvent, sparkle/float/ring effects), round and hole flow (newRound, startHole, lineUp,
// gimmes, aim/spin/power setters), the strike (contactDiff, contact, release, replay), scoring (resolveShot,
// scorePots, finishHole, endRound), the final card and sharing text, saved runs, tracking (track, sendResult) and
// today's rank.
// Relies on core.js, physics.js, state.js and audio.js; calls into ui.js and render.js at run time.

/* ----- events from the table ----- */

function sparkle(x, y, color, n, speed = 120) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, v = speed * (0.3 + Math.random());
    fx.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + Math.random() * 0.5, color, r: 1.5 + Math.random() * 2 });
  }
}
function float(x, y, text, color, size = 20, life = 1.4) { fx.floats.push({ x, y, text, color, size, life, max: life }); }
function ring(x, y, color, grow = 50, life = 0.6, r = R) { fx.rings.push({ x, y, r, grow, life, max: life, color }); }

// What happened when in the live shot (the cue ball's cushions, a potted ball's cushions, which ball hit which, the
// tunnel, the pots), so the replay can name each part of a trick shot as it happens.
function noteMoment(type, e) {
  const t = shotSteps * DT;
  if (type === 'hit') moments.push({ t, k: 'hit', a: e.a, b: e.b, x: e.x, y: e.y });
  // (only the contacts that count as a cushion for banks and kicks: not a touch in a pocket's jaws)
  else if (type === 'cushion' && e.ball && (e.ball.cush || 0) > moments.filter(m => m.k === 'cush' && m.ball === e.ball).length) moments.push({ t, k: 'cush', ball: e.ball, x: e.x, y: e.y });
  else if (type === 'tunnelIn') moments.push({ t, k: 'tun', ball: e.ball, x: e.x, y: e.y });
  else if (type === 'pot') moments.push({ t, k: 'pot', ball: e.ball, x: e.x, y: e.y });
}
function onEvent(type, e) {
  if (shotRec && phase === 'moving') noteMoment(type, e);
  if (type === 'hit') {
    if (audio && audio.currentTime - lastHit > 0.015) { lastHit = audio.currentTime; atX(e.x, () => sfx.clack(e.speed)); }
    if (e.speed > 500) ring(e.x, e.y, '255,250,235', 18, 0.35, 4);
    if (e.speed > 250) fx.flashes.push({ x: e.x, y: e.y, r: 10 + Math.min(40, e.speed / 45), life: 0.2 });
    if (e.speed > 1000) catStartle = 1;
    // a hard hit freezes the frame for a blink and gives a little kick
    if (e.speed > 900) { hitStop = Math.max(hitStop, 0.03); fx.shake = Math.max(fx.shake, 2 + e.speed / 700); sparkle(e.x, e.y, '#fbf8f0', 5, 90); }
  } else if (type === 'cushion') {
    atX(e.x, () => sfx.cushion(e.speed));
    // a puff of chalk dust off the cloth
    if (e.speed > 350) for (let i = 0; i < 4 + e.speed / 300; i++) { const a = Math.random() * TAU, v = 30 + Math.random() * 50; fx.particles.push({ x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.3, color: 'rgba(225,238,228,.8)', r: 1.5 + Math.random() * 2 }); }
  } else if (type === 'spin') {
    const kind = e.spin > 0 ? 'follow' : 'draw', amt = clamp(Math.abs(e.spin) * e.speed / 900, 0.3, 1);
    atX(e.x, () => sfx.spin(kind, amt)); buzz(kind === 'draw' ? [6, 30, 6] : 8);
    spinFx = { t: 0, kind, amt };
  }
  else if (type === 'cat') { catFlash = 1; noise(0.12, 0.08, 500); buzz(10); }
  else if (type === 'bumper') { sfx.bumper(); e.o.flash = 1; ring(e.o.x, e.o.y, '230,190,100', 34, 0.5, e.o.r); }
  else if (type === 'gate') atX(e.x, () => sfx.gate(e.speed));
  else if (type === 'tunnelIn') {
    // it drops into the pipe: shrinks and swirls into the mouth, and a rumble travels underneath to the far end
    const m = tunMouths(hole).find(q => Math.hypot(q.x - e.x, q.y - e.y) < 1), b = e.ball;
    if (m) m.flash = 1;
    ensureSpin(b);
    fx.sinks.push({ x: e.fromX, y: e.fromY, tx: e.x, ty: e.y, b: { n: b.n, spot: b.spot, pole: b.pole }, t: 0 });
    atX(e.x, () => sfx.tunnel(e.speed)); sfx.tunnelRoll(e.x, e.toX, e.dur / Math.max(0.3, timeScale)); buzz(12);
  } else if (type === 'tunnelOut') {
    // it pops out with a hop, a thunk and a puff of dust
    const m = tunMouths(hole).find(q => Math.hypot(q.x - e.x, q.y - e.y) < 1);
    if (m) m.flash = 1;
    tunPop.set(e.ball, 0);
    atX(e.x, () => sfx.tunnelOut(e.speed)); buzz([6, 20, 6]);
    const ex = tunExit(m || { x: e.x, y: e.y, nx: 0, ny: 0 });
    ring(ex.x, ex.y, '240,190,120', 40, 0.45, R);
    for (let k = 0; k < 14; k++) { const a = Math.random() * TAU, v = 50 + Math.random() * 90; fx.particles.push({ x: ex.x + Math.cos(a) * R * 0.6, y: ex.y + Math.sin(a) * R * 0.6, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.45 + Math.random() * 0.3, color: k % 2 ? 'rgba(225,238,228,.8)' : 'rgba(214,160,110,.85)', r: 1.5 + Math.random() * 2.5 }); }
  }
  else if (type === 'rattle') { sfx.rattle(); float(e.x, e.y - 30, 'Rattled out', '#b8553f', 18); fx.shake = 4; }
  else if (type === 'pot') {
    const p = table.pk[e.pocket], b = e.ball, tx = clamp(p.x, 0, W), ty = clamp(p.y, 0, H);
    ensureSpin(b);
    fx.sinks.push({ x: e.x, y: e.y, tx, ty, b: { n: b.n, spot: b.spot, pole: b.pole }, t: 0 });
    ring(tx, ty, '255,250,235', 46, 0.6);
    p.glow = 1;   // the pocket lights up for a moment
    atX(tx, () => sfx.drop());
    hitStop = Math.max(hitStop, 0.045);
    if (b.isCue) { sfx.pot(); buzz(10); return; }
    trayFly.push({ b: { n: b.n, spot: b.spot, pole: b.pole }, wx: tx, wy: ty, t: -0.35 });
    // the event fires before the ball is marked potted, so it still counts as on the table here
    const s = table.shot, bank = (b.cush || 0) > 0, combo = ptsMode() ? !!b.by && !b.by.isCue : !!s?.firstHit && s.firstHit !== b;
    const k = (hs?.streak || 0) + shotLog.length;   // pots in a row, counting this one's place
    shotLog.push({ n: b.n, bank, combo });
    const left = table.balls.filter(o => !o.potted && o !== b).length;
    atX(tx, () => sfx.potNote(k, k >= 1)); buzz([18, 40, 12]);
    if (k >= 2) sfx.boom(k);
    if (shotLog.length >= 2) { sfx.multi(shotLog.length); float(W / 2, H * 0.22, shotLog.length === 2 ? 'Double!' : shotLog.length === 3 ? 'Triple!' : `${shotLog.length} in one!`, '#c4472f', 26, 1.4); }
    fx.glow = Math.min(1, 0.35 + k * 0.15);
    const fy = clamp(ty, 60, H - 60) + (ty < H / 2 ? 40 : -40), fxp = clamp(tx, 60, W - 60);
    const tags = [bank && 'Bank', combo && 'Combo'].filter(Boolean).join(' · ');
    ring(tx, ty, '201,154,58', 90, 1, 20); sparkle(tx, ty, '#e2b13c', 18 + k * 6, 160 + k * 20);
    float(fxp, fy, tags ? tags + '!' : left ? `${left} to go` : 'Level clear!', left ? '#b88a2e' : '#2f6b4f', 18 + Math.min(6, k * 1.5));
    if (k >= 2) fx.shake = Math.min(9, 2 + k * 1.5);
    if (cine && b.n === cine.n) { cine.hold = 0.9; ring(tx, ty, '226,177,60', 160, 1.3, 24); sparkle(tx, ty, '#e2b13c', 50, 260); }
  }
}

/* ----- round / hole flow ----- */

function newRound(seed, ranked) {
  round = { seed, ranked, level: 0, potted: 0, bestStreak: 0, done: false, cards: [] };
  hs = { points: 0, streak: 0 }; shownPts = 0;
  $('course').textContent = `${courseName(seed)} · ${isDailySeed(seed) && ranked ? dayLabel(seed) : 'practice'}`;
  const saved = ranked ? ls(parKey(seed)) : null;
  if (!saved && resumeRun()) return;
  startHole(0);
  if (!saved) return;
  // today's round is already in: show its card (a record that won't parse just leaves a fresh round on screen)
  let rec = null;
  try { rec = JSON.parse(saved); } catch (e) { console.error('saved round', e); }
  if (!rec || !Array.isArray(rec.cards)) return;
  Object.assign(round, rec, { done: true }); hs.points = round.points; renderCard9(); updateUI(); showFinal(true);
}

// A new hole: a fresh seeded layout.
function startHole(i) {
  round.level = i;
  if (i === 2) track('level3');
  hole = makeHole(round.seed, i);
  table = new Table(hole, onEvent);
  trayFly = []; trayDone = [];
  strokes = 0; holeBonus = 0; goldUsed = false; holeRaw = 0; holeTricks = 0; trickShow = null;
  // a cat hole: the cat hops up from its cushion onto the felt as the hole starts
  catAnim = table.cat ? { from: { x: DECOR.cat.x, y: DECOR.cat.y, rot: -0.3, sc: 1 }, to: { x: table.cat.x, y: table.cat.y, rot: table.cat.rot, sc: CAT_SC }, t: -0.9 } : null;
  marks = []; trails = []; curTrail = null; stamp = null; strike = null; cine = null; timeScale = 1;
  fx.sinks = []; fx.confetti = [];
  lineUp();
  setTimeout(() => makeHole(round.seed, i + 1), 1500);   // build the next hole while this one plays
  const n = hole.balls.length, life = featureName(hole) ? 2.3 : hole.shape ? 1.9 : 1.5;
  banner = { title: `Hole ${i + 1}`, sub: `${hole.shape ? `${hole.shape.name} table · ` : ''}${featureName(hole) ? `${featureName(hole)} · ` : ''}${hole.gold != null ? 'golden pocket · ' : ''}${n} ball${n === 1 ? '' : 's'} · par ${parOf(i)}`, life, max: life };
  // a tunnel hole: point out the two openings, once the hole has had a moment on screen
  if (hole.tunnel) { const h = hole, { a, b } = h.tunnel; setTimeout(() => { if (hole !== h || phase !== 'aim') return; for (const m of [a, b]) { const e = tunExit(m); float(clamp(e.x + m.nx * 50, 70, W - 70), clamp(e.y + m.ny * 50, 30, H - 30), 'Tunnel', '#2f6b4f', 17, 2.6); } }, 1900); }
  saveRun();
  // hole 3 tip, until the player has tapped a ball once
  if (i === 2 && !ls('dailybreak:tappedBall')) { const h = hole; setTimeout(() => { if (hole === h && phase === 'aim') float(W / 2, H * 0.62, 'Tap a ball to target it', '#2f6b4f', 20, 2.6); }, 1700); }
  renderCard9(); updateUI();
}

// Each shot starts lined up dead centre on the ball with the easiest pot, with the spin back on Stun, no side
// (16 Nov: it used to carry over from the last shot, so a draw left set by accident spoiled the next one).
function lineUp() {
  aim.spotY = 0; aim.spin = 0; aim.spotX = 0; aim.side = 0;
  phase = 'aim'; gimmes = findGimmes(); focusBall(bestBall(), true);
  if (firstShotEver() && strokes === 0) startOffTarget();
  startUnpotted();
  updateUI();
}
// A shot never starts with a pot already lined up. If the starting aim (dead centre on the ball with the easiest
// pot) would light a pocket's ring, turn it the smallest amount (0.5° steps, up to 10° either way) that still hits
// that ball first but doesn't pot anything the guide would show (the same rule as the guide: guideShownPots).
const guidePots = angle => GUIDE_PACES.some(pw => guideShownPots(table, angle, pw, aim.spin, aim.side).length > 0);
function startUnpotted() {
  if (!guidePots(aim.angle)) return;
  const target = table.balls[aim.bi], a0 = aim.angle, c = table.cue;
  for (let k = 1; k <= 20; k++) for (const sg of [1, -1]) {
    const a = a0 + sg * k * 0.5 * Math.PI / 180, h = trace(table, c.x, c.y, Math.cos(a), Math.sin(a));
    if (h.ball === target && !guidePots(a)) { aim.angle = a; return; }
  }
}
// A new player's first shot starts 3.5° off the best pot line (still on the ball), so the aim lesson has a miss to fix.
function startOffTarget() {
  const l = allLines(table).filter(x => x.bi === aim.bi && !x.blocked).sort((a, b) => b.q - a.q)[0];
  if (!l) return;
  const side = Math.sign(Math.atan2(Math.sin(aim.angle - l.angle), Math.cos(aim.angle - l.angle))) || 1;
  for (const deg of [3.5, 2.5, 1.8]) {
    const a = l.angle + side * deg * Math.PI / 180, hit = trace(table, table.cue.x, table.cue.y, Math.cos(a), Math.sin(a));
    if (hit.ball === table.balls[aim.bi]) { aim.angle = a; return; }
  }
}
// Gimmes: a ball within two ball widths of an open pocket, with a clear, nearly straight line from the cue ball.
function findGimmes() {
  const out = [];
  table.balls.forEach((b, bi) => {
    if (b.potted) return;
    for (let i = 0; i < 6; i++) {
      const p = table.pk[i], l = potLine(table, bi, i);
      if (i === hole.gold && !goldUsed) continue;   // no tapping in to the golden pocket
      if (l && !l.blocked && l.cos > 0.9 && Math.hypot(b.x - p.x, b.y - p.y) < p.cap + 2 * R) { out.push({ bi, pocket: i }); break; }
    }
  });
  return out;
}
function tapIn(g) {
  if (phase !== 'aim') return;
  const b = table.balls[g.bi];
  ensureAudio();
  shotLog = []; strokes++; strokeStart = { x: table.cue.x, y: table.cue.y };
  for (const o of table.balls) { o.cush = 0; o.by = null; o.tunShot = false; }
  table.shot = { pots: [], scratch: false, rattles: 0, cushions: 0, firstHit: b, spin: 0, spinUsed: true };
  sfx.thock(0.15);
  float(clamp(b.x, 60, W - 60), clamp(b.y - 44, 40, H - 40), 'Tap-in', '#2f6b4f', 18);
  table.pot(b, g.pocket);
  resolveShot();
}
function bestBall() {
  const ls = allLines(table).filter(l => !l.blocked).sort((a, b) => b.q - a.q);
  if (ls.length) return ls[0].bi;
  let bi = -1, bd = Infinity;
  table.balls.forEach((b, k) => { if (!b.potted) { const d = Math.hypot(b.x - table.cue.x, b.y - table.cue.y); if (d < bd) { bd = d; bi = k; } } });
  return bi;
}
function focusBall(bi, quiet) {
  if (bi < 0) return;
  const b = table.balls[bi], c = table.cue;
  aim.bi = bi; aim.angle = Math.atan2(b.y - c.y, b.x - c.x);
  if (!quiet) { tone(1175, 0.06, 0.05, 'sine', 1, 0, 0.3); buzz(6); }
  updateUI();
}
// Tab (or n) on a keyboard steps through the balls in number order; on a phone you tap the ball.
function nextBall() {
  if (phase !== 'aim') return;
  const order = table.balls.map((_, k) => k).filter(k => !table.balls[k].potted).sort((a, b) => table.balls[a].n - table.balls[b].n);
  focusBall(order[(order.indexOf(aim.bi) + 1) % order.length]);
}
// Fine aim: the dial, arrow keys or dragging on the felt all come through here.
let lastTick = 0;
function setAngle(a) {
  if (phase !== 'aim') return;
  const before = Math.round(aim.angle / TICK);
  aim.angle = Math.atan2(Math.sin(a), Math.cos(a));
  if (Math.round(aim.angle / TICK) !== before && audio && audio.currentTime - lastTick > 0.03) { lastTick = audio.currentTime; sfx.tick(); buzz(2); }
  updateAimUI();
}
const turnAim = da => setAngle(aim.angle + da);
// The aim offset from dead centre on the focused ball, in degrees (+ is right of centre, from behind the cue ball).
function aimOffset() {
  // measured from the ball the line actually hits (not the one first targeted), so it never reads 115°
  const c = table.cue, hit = trace(table, c.x, c.y, Math.cos(aim.angle), Math.sin(aim.angle)), b = hit.ball || table.balls[aim.bi];
  if (!b || b.potted) return 0;
  const d = aim.angle - Math.atan2(b.y - c.y, b.x - c.x);
  return Math.atan2(Math.sin(d), Math.cos(d)) * 180 / Math.PI;
}

// Where you hit the cue ball (height on its face, -1 top … +1 bottom) sets the spin: high follows, low draws.
// Left or right of centre (16 Nov) puts side on it: the cue ball comes off cushions bent that way (Table.english).
const spinFor = y => clamp(-y * 1.4, -0.95, 0.95);
const sideFor = x => clamp(x * 1.4, -0.95, 0.95);
function strikeName(spin) {
  return spin >= 0.2 ? 'Follow' : spin > -0.2 ? 'Stun' : 'Draw';
}
const sideName = side => side >= 0.2 ? 'right' : side <= -0.2 ? 'left' : '';
// The spot stays within half the ball's radius of centre, and snaps to the centre line on each axis.
function setSpot(y, quiet, x = aim.spotX) {
  if (phase !== 'aim') return;
  x = Math.abs(x) < 0.06 ? 0 : x; y = Math.abs(y) < 0.06 ? 0 : y;
  const m = Math.hypot(x, y); if (m > 0.5) { x *= 0.5 / m; y *= 0.5 / m; }
  aim.spotY = y; aim.spin = spinFor(y); aim.spotX = x; aim.side = sideFor(x);
  spinTouched = true;
  if (!quiet) { sfx.click(); buzz(5); }
  updateUI();
}
const PACE = [[0.2, 'Soft'], [0.4, 'Medium'], [0.6, 'Firm'], [0.8, 'Hard'], [1.01, 'Smash']];
const paceName = p => PACE.find(([v]) => p < v)[1];
let lastPower = 0.4;
function setPower(p) {
  if (phase !== 'aim') return;
  const before = Math.round(power * 20);
  power = clamp(p, 0, 1);
  if (Math.round(power * 20) !== before && audio && audio.currentTime - lastTick > 0.03) { lastTick = audio.currentTime; sfx.creak(power); if (power > 0.04) buzz(2); }
  if (power >= 1 && before < 20) { sfx.maxed(); buzz(18); }
  updateMeter();
}

function act() {
  ensureAudio();
  if (phase === 'holed') startHole(round.level + 1);
  else if (phase === 'over') showFinal(!!round.done);
  updateUI();
}

// How hard is it to strike this one cleanly? Before 17 Nov (RULES.SHOT_READ_FROM) mostly distance: the cue ball's run
// to the first ball and that ball's run on towards the cushion. Spin and a hard hit make it harder; so does rough
// felt under the cue ball. From 17 Nov it reads the shot actually lined up (readShot): how far the cue ball travels
// to the object ball, how far the potted ball then travels to its pocket, how thin the cut is, and whether it's a
// bank, a kick or a combination. Players asked for tricky shots to feel tricky, not just long ones.
// (This only shapes the strike, never the course: holes are generated without it.)
function contactDiff() {
  const lie = lieAt(hole, table.cue.x, table.cue.y), extra = Math.abs(aim.spin) * 0.12 + Math.abs(aim.side) * 0.12 + power * 0.1 + (lie === 'rough' ? 0.1 : 0);
  if (!round || !ruleOn(round.seed, RULES.SHOT_READ_FROM)) {
    const g = shotGeom();
    return clamp(0.05 + 0.75 * clamp((g.d1 + 0.6 * g.d2 - 150) / 1000, 0, 1) + extra, 0, 1);
  }
  return clamp(trickiness(readShot()) + extra, 0, 1);
}
// the old reading: straight along the aim to the first ball, and that ball's run to the cushion
function shotGeom() {
  const c = table.cue, dx = Math.cos(aim.angle), dy = Math.sin(aim.angle), hit = trace(table, c.x, c.y, dx, dy);
  let d1 = Math.min(hit.t, 1100), d2 = 0, cut = 0;
  if (hit.ball) {
    const gx = c.x + dx * hit.t, gy = c.y + dy * hit.t, nx = (hit.ball.x - gx) / (2 * R), ny = (hit.ball.y - gy) / (2 * R);
    d2 = Math.min(trace(table, hit.ball.x, hit.ball.y, nx, ny, hit.ball).t, 1000);
    cut = Math.acos(clamp(dx * nx + dy * ny, -1, 1));
  }
  return { d1, d2, cut, kick: 0, bank: 0, combo: false, pots: false };
}
// The weights (17 Nov). Distance still matters most; a thin cut, each cushion (the object ball's bank or the cue
// ball's kick, up to two) and a combination (the potted ball isn't the one the cue ball hits) each add on top.
// Tuned on every aim of 17-22 Nov's holes (old -> new, average): straight pots 0.20 -> 0.18, cuts over 60° 0.31 ->
// 0.46, banks 0.25 -> 0.50, combinations 0.18 -> 0.55, kicks 0.14 -> 0.58.
const TRICK = { BASE: 0.02, DIST: 0.48, CUT: 0.26, CUSHION: 0.09, COMBO: 0.08 };
function trickiness(r) {
  const dist = clamp((r.d1 + 0.7 * r.d2 - 150) / 1300, 0, 1), cutK = clamp((r.cut * 180 / Math.PI - 15) / 55, 0, 1);
  return TRICK.BASE + TRICK.DIST * dist + TRICK.CUT * cutK ** 1.3 + TRICK.CUSHION * Math.min(r.bank + r.kick, 2) + (r.combo ? TRICK.COMBO : 0);
}
// What happens if this aim is struck perfectly? A quick simulation at the first of a few paces where a ball drops
// (pace barely changes what kind of shot it is, and a fixed set keeps the spot from jumping as they pull). If nothing
// drops at any of them, the old straight-line reading. Cached per aim, spin and table.
const READ_PACES = [0.45, 0.3, 0.6, 0.2, 0.75, 0.9];
const readMemo = { key: null, r: null };
function readShot() {
  const key = `${round.level}|${strokes}|${aim.angle.toFixed(4)}|${aim.spin.toFixed(2)}|${aim.side.toFixed(2)}|${table.cue.x.toFixed(1)},${table.cue.y.toFixed(1)}`;
  if (readMemo.key === key && readMemo.of === table) return readMemo.r;
  let r = null;
  for (const pw of READ_PACES) if ((r = readAt(pw))) break;
  readMemo.key = key; readMemo.of = table; readMemo.r = r || shotGeom();
  return readMemo.r;
}
function readAt(pw) {
  const s = cloneTable(table), all = [s.cue, ...s.balls], run = all.map(() => 0);
  s.shoot(aim.angle, pw, aim.spin, aim.side);
  let d1 = 0, cut = 0;
  for (let n = 0; n < 2400 && s.moving(); n++) {
    const px = all.map(b => b.x), py = all.map(b => b.y), cvx = s.cue.vx, cvy = s.cue.vy, had = s.shot.firstHit;
    s.step();
    // (a tunnel moves a ball across the table in one step: that jump isn't rolling)
    all.forEach((b, i) => { const m = Math.hypot(b.x - px[i], b.y - py[i]); if (m < 60) run[i] += m; });
    const fh = s.shot.firstHit;
    if (!had && fh) {
      d1 = run[0];
      const u = Math.hypot(cvx, cvy), v = Math.hypot(fh.vx, fh.vy);
      cut = u && v ? Math.acos(clamp((cvx * fh.vx + cvy * fh.vy) / (u * v), -1, 1)) : 0;
    }
    if (s.shot.scratch) return null;
    const q = s.shot.pots[0];
    if (q) return { d1, d2: run[all.indexOf(q.ball)], cut, kick: s.shot.kickWalls || 0, bank: guideWalls(s, q.ball, q.pocket), combo: q.ball !== fh, pots: true };
  }
  return null;
}
// the close-up's label: how long, and what makes it tricky
function shotWord(d) {
  const len = d < 0.3 ? 'Short shot' : d < 0.6 ? 'Medium shot' : 'Long shot · shaky';
  if (!round || !ruleOn(round.seed, RULES.SHOT_READ_FROM)) return len;
  const r = readShot(), base = d < 0.3 ? 'Easy' : d < 0.6 ? 'Tricky' : 'Shaky';
  const kind = r.combo ? 'combination' : r.kick ? 'kick shot' : r.bank ? 'bank shot' : r.cut > 50 * Math.PI / 180 ? 'thin cut' : null;
  return kind ? `${base} ${kind}` : len;
}
// The gold spot is where you chose to hit the cue ball; it shrinks and the tip gets shakier as the shot gets harder.
// A harder strike as the round goes on (the aiming guide is generous): from hole 3 the gold spot shrinks, the
// tip wobbles wider and faster, and an off-centre hit pushes the ball further off line. strikeK ramps 0 → 1 over
// holes 3-5 (0 on holes 1-2).
const strikeK = () => round ? clamp((round.level - 1) / 3, 0, 1) : 0;
const spotR = d => lerp(0.22, 0.09, d) * (1 - SPOT_SHRINK * strikeK());
const SPOT_SHRINK = 0.15, WOBBLE_GROW = 0.12, WOBBLE_FAST = 0.15, PUSH_MAX = 3, PUSH_EXTRA = 2;
function tipPos(d) {
  const k = strikeK(), A = lerp(0.16, 0.55, d) * (1 + WOBBLE_GROW * k), w = lerp(1.0, 2.5, d) * (1 + WOBBLE_FAST * k), t = swayT * w;
  let x = aim.spotX + A * (0.65 * Math.sin(t) + 0.35 * Math.sin(2.3 * t + 1.1));
  let y = aim.spotY + A * (0.6 * Math.sin(0.83 * t + 2) + 0.4 * Math.sin(1.9 * t + 0.4));
  const m = Math.hypot(x, y);
  if (m > 0.85) { x *= 0.85 / m; y *= 0.85 / m; }
  return { x, y };
}
const tipOnSpot = d => { const p = tipPos(d); return Math.hypot(p.x - aim.spotX, p.y - aim.spotY) <= spotR(d); };
const tipInCore = d => { const p = tipPos(d); return Math.hypot(p.x - aim.spotX, p.y - aim.spotY) <= spotR(d) * PERFECT_CORE; };
// Where the tip lands decides the shot. On the spot: exactly as aimed. Off to one side pushes the
// cue ball off line (up to 3°, which costs more the further it has to travel); too high or low
// changes the spin; right out at the edge is a miscue.
// The spot has a perfect core (PERFECT_CORE of its radius): only a tip there plays exactly as aimed ('perfect'). Since 15 Nov the rest of the spot ('clean') plays exactly as aimed too (it used to push up to
// GOOD_PUSH degrees, and players couldn't see why a Clean missed); 'near' still starts its push from GOOD_PUSH.
const PERFECT_CORE = 0.4, GOOD_PUSH = 0.15;
// The Perfect edge: for that shot every pocket takes balls 12% further from its centre and lets them in 15% faster.
const PERFECT_POCKET = 1.12, PERFECT_POCKET_PACE = 1.15;
function contact(d) {
  const tip = tipPos(d), r = spotR(d), ex = tip.x - aim.spotX, ey = tip.y - aim.spotY, dist = Math.hypot(ex, ey), side = aim.side;
  if (dist <= r * PERFECT_CORE) return { tip, quality: 'perfect', off: 0, spin: aim.spin, side, power };
  if (dist <= r) return { tip, quality: 'clean', off: 0, spin: aim.spin, side, power };   // a Clean goes exactly where you aimed (15 Nov)
  const over = dist - r;
  // (measured from the spot, so a spot set out to one side for side spin isn't itself a miscue)
  if (Math.abs(ex) > 0.6 || Math.hypot(tip.x, tip.y) > 0.8 || over > 0.45) return { tip, quality: 'miscue', off: -Math.sign(ex || 1) * 4 * Math.PI / 180, spin: 0, side: 0, power: power * 0.35 };
  const pmax = PUSH_MAX + PUSH_EXTRA * strikeK(), base = GOOD_PUSH * Math.abs(ex) / dist;
  const off = -clamp(ex / dist * over * 6 * pmax / PUSH_MAX + Math.sign(ex) * base, -pmax, pmax) * Math.PI / 180;
  const spin = lerp(aim.spin, spinFor(tip.y), clamp(over * 2.5, 0, 1)), sd = lerp(aim.side, sideFor(tip.x), clamp(over * 2.5, 0, 1));
  return { tip, quality: over < r ? 'near' : 'off', off, spin, side: sd, power };
}

// The skew shown after an off-centre strike: the aimed line, and the line it really took, swung across over 0.25 s
// as the balls start rolling (the close-up of the strike covers the table until then) (the cue ball's line barely moves; the object ball's line, which magnifies it, visibly does).
let skew = null;
function skewGeom(angle) {
  const c = table.cue, dx = Math.cos(angle), dy = Math.sin(angle), h = trace(table, c.x, c.y, dx, dy);
  const g = { cx: c.x, cy: c.y, gx: c.x + dx * h.t, gy: c.y + dy * h.t, ball: null };
  if (!h.ball || !isFinite(h.t)) return g;
  const b = h.ball, ux = (b.x - g.gx) / (2 * R), uy = (b.y - g.gy) / (2 * R), h2 = trace(table, b.x, b.y, ux, uy, b), pk = pocketAlong(b.x, b.y, ux, uy, h2.t);
  const len = pk ? Math.max(0, pk.s - table.pk[pk.i].cap) : Math.min(isFinite(h2.t) ? h2.t : 300, 300);
  return Object.assign(g, { ball: b, bx: b.x, by: b.y, ux, uy, len });
}
function drawSkew(dt) {
  if (!skew) return;
  if (phase !== 'strike' && phase !== 'moving') { skew = null; return; }
  if (phase === 'strike' || zoom) return;   // the strike's close-up covers the table: show it as the balls start rolling
  skew.age += dt;
  const k = clamp(skew.age / 0.25, 0, 1), e = k * k * (3 - 2 * k), fade = 1 - clamp((skew.age - 1.1) / 0.3, 0, 1);
  if (fade <= 0) { skew = null; return; }
  const A = skew.from, B = skew.to, L = (a, b) => a + (b - a) * e;
  ctx.save(); ctx.lineCap = 'round';
  // the aimed line, faint, for comparison
  if (A.ball) { ctx.setLineDash([4, 8]); ctx.strokeStyle = `rgba(251,248,240,${0.35 * fade})`; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(A.bx, A.by); ctx.lineTo(A.bx + A.ux * A.len, A.by + A.uy * A.len); ctx.stroke(); ctx.setLineDash([]); }
  // the line it really took, swinging over from the aim: gold if it still drops, amber if it now misses
  const col = skew.pots ? '255,226,150' : '240,160,90';
  if (A.ball && B.ball === A.ball) {
    const ux = L(A.ux, B.ux), uy = L(A.uy, B.uy), n = Math.hypot(ux, uy) || 1, len = L(A.len, B.len);
    ctx.strokeStyle = `rgba(${col},${0.95 * fade})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(A.bx + ux / n * (R + 3), A.by + uy / n * (R + 3)); ctx.lineTo(A.bx + ux / n * len, A.by + uy / n * len); ctx.stroke();
  } else if (B.ball) {
    ctx.strokeStyle = `rgba(${col},${0.95 * e * fade})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(B.bx + B.ux * (R + 3), B.by + B.uy * (R + 3)); ctx.lineTo(B.bx + B.ux * B.len, B.by + B.uy * B.len); ctx.stroke();
  }
  ctx.restore();
  // a Clean strike that no longer drops says why (the other grades already say they pushed it)
  if (k >= 1 && !skew.said && skew.q === 'clean' && !skew.pots) {
    skew.said = true;
    const p = B.ball ? { x: B.bx + B.ux * Math.min(B.len, 120), y: B.by + B.uy * Math.min(B.len, 120) } : { x: B.gx, y: B.gy };
    float(clamp(p.x, 70, W - 70), clamp(p.y - 30, 40, H - 40), `Clean, but pushed ${skew.off > 0 ? 'right' : 'left'}`, '#b8553f', 16, 1.6);
  }
}
function release() {
  const c = table.cue, d = contactDiff(), first = !ls('dailybreak:firstShot');
  const real = contact(d), ct = first ? { tip: { x: aim.spotX, y: aim.spotY }, quality: 'clean', off: 0, spin: aim.spin, side: aim.side, power } : real;
  const teach = first && real.quality !== 'clean' && real.quality !== 'perfect' ? { tip: real.tip, quality: real.quality } : null;
  let angle = aim.angle + ct.off;
  const own = angle;
  if (first) {
    // the player's first shot ever drops: if their aim and pace wouldn't pot the ball they're aimed at, use the
    // nearest pot line for it (however far off they were; then any other ball's) and the nearest pace that does
    ls('dailybreak:firstShot', '1');
    const target = table.balls[aim.bi], pots = (a, pw) => { const s = simulate(table, a, pw, ct.spin, null, ct.side); return !s.shot.scratch && s.balls[aim.bi].potted; };
    if (target && !target.potted && !pots(angle, ct.power)) {
      const turn = a => Math.abs(Math.atan2(Math.sin(a - angle), Math.cos(a - angle)));
      const lines = allLines(table).filter(l => !l.blocked).sort((x, y) => (x.bi !== aim.bi) - (y.bi !== aim.bi) || turn(x.angle) - turn(y.angle));
      const paces = [ct.power, 0.3, 0.34, 0.26, 0.38, 0.22, 0.42, 0.18].sort((x, y) => Math.abs(x - ct.power) - Math.abs(y - ct.power));
      const potsAny = (a, pw, bi) => { const s = simulate(table, a, pw, ct.spin, null, ct.side); return !s.shot.scratch && s.balls[bi].potted; };
      found: for (const pw of paces) if (pots(angle, pw)) { ct.power = pw; break found; }
      else if (pw === paces[paces.length - 1]) for (const l of lines) for (const p2 of paces) if (potsAny(l.angle, p2, l.bi)) { angle = l.angle; ct.power = p2; aim.bi = l.bi; break found; }
    }
  }
  lastPower = power;
  const rescue = first ? null : scratchRescue(angle, ct);
  if (rescue) { ls('dailybreak:scratchSaved', '1'); ct.spin = spinFor(rescue.toY); }
  // Will this shot clear the rack? Then the last ball gets the slow-motion treatment.
  const sim = simulate(table, angle, ct.power, ct.spin, null, ct.side), sp = sim.shot.pots;
  cine = (round.level >= 2 && !sim.remaining() || replayKinds(sim.shot).length) && !sim.shot.scratch && sp.length ? { n: sp[sp.length - 1].ball.n, pocket: sp[sp.length - 1].pocket, hold: 0 } : null;
  strike = { angle, power: ct.power, spin: ct.spin, side: ct.side, t: 0, end: teach ? SHOOT_T + TEACH_T : SHOOT_T };
  // an off-centre strike (Clean included) pushes the line a little: show it bending from the aim to where it really goes
  skew = !first && Math.abs(angle - aim.angle) > 0.02 * Math.PI / 180 ? { from: skewGeom(aim.angle), to: skewGeom(angle), off: (angle - aim.angle) * 180 / Math.PI, q: ct.quality, pots: sp.length > 0, age: 0, said: false } : null;
  zoom = { t: 0, ct, d, from: contactPanel(), teach, end: strike.end };
  if (rescue) {
    strike.spinLesson = rescue;
    strike.t = zoom.t = -SPIN_T;
    aim.spotY = rescue.fromY; aim.spin = spinFor(rescue.fromY);
    $('spinFace').insertAdjacentHTML('beforeend', '<div id="spinHand">👆</div>');
  }
  // first shot, and their line wouldn't have potted it: show the aim strip putting it right before the strike
  if (first && Math.abs(Math.atan2(Math.sin(angle - own), Math.cos(angle - own))) > 0.2 * Math.PI / 180) {
    strike.lesson = { from: own, to: angle, strip: stripOff };
    strike.t = zoom.t = -AIM_T;
    aim.angle = own;
    $('strip').insertAdjacentHTML('beforeend', '<div id="aimHand">👆</div>');
  }
  shotLog = [];
  strokes++;
  strokeStart = { x: c.x, y: c.y };
  marks.push({ x: c.x, y: c.y, n: strokes });
  curTrail = { pts: [[c.x, c.y]] }; trails.push(curTrail);
  phase = 'strike';
  renderCard9(); updateUI();
}

// Trick shot: replay it first. Every frame of the shot was recorded with its physics time, so the
// replay runs on that clock at one steady pace (however the live shot was slowed or sped up), blends between
// recorded frames, rolls the balls as they move and sinks them into their pockets. It runs from the strike to
// 0.7 s after the last pot, at 45% speed or faster to keep it under ~5.5 s. A tap skips it.
function startReplay(kinds) {
  const frames = shotRec, nb = table.balls.length;
  let lastT = 0;
  for (let f = 1; f < frames.length; f++) for (let k = 0; k <= nb; k++) if (frames[f][3 + k * 3] && !frames[f - 1][3 + k * 3]) lastT = frames[f][0];
  const endT = Math.min(frames[frames.length - 1][0], lastT + 0.7);
  const proxies = [table.cue, ...table.balls].map(b => ({ n: b.n, isCue: b.isCue, spot: [0, 0, 1], pole: [0, 1, 0], vx: 0, vy: 0 }));
  replay = { frames, T: 0, idx: 0, endT, speed: Math.max(0.45, endT / 5.5), kinds, proxies, sunk: new Set(), marks: trickMoments(table.shot), said: 0 };
  phase = 'replay'; updateUI();
  tone(660, 0.12, 0.05, 'sine', 1.5, 0, 0.4);
}
// The parts of a trick shot, in the order they happened, each with where: the cue ball's cushions before its first
// ball (kick), a potted ball's cushions before it drops (bank), the hit that knocked a potted ball in when that wasn't
// the cue ball's first ball (combo, or cannon off the cue ball), and the tunnel.
function trickMoments(s) {
  if (!s || !s.firstHit) return [];
  const out = [], pots = new Set(s.pots.map(p => p.ball)), potT = new Map(), hitSeen = new Set(), banks = new Map();
  for (const m of moments) if (m.k === 'pot' && !potT.has(m.ball)) potT.set(m.ball, m.t);
  const firstT = moments.find(m => m.k === 'hit' && (m.a.isCue || m.b.isCue))?.t ?? Infinity;
  let kicks = 0;
  for (const m of moments) {
    if (m.k === 'cush' && m.ball.isCue && m.t < firstT && kicks < 3) out.push({ t: m.t, kind: 'kick', label: ++kicks > 1 ? `Kick ${kicks}` : 'Kick', x: m.x, y: m.y });
    else if (m.k === 'cush' && pots.has(m.ball) && m.t < (potT.get(m.ball) ?? Infinity)) {
      const n = (banks.get(m.ball) || 0) + 1; banks.set(m.ball, n);
      if (n <= 3) out.push({ t: m.t, kind: 'bank', label: n > 1 ? `Bank ${n}` : 'Bank', x: m.x, y: m.y });
    } else if (m.k === 'tun' && (m.ball.isCue ? m.t < firstT : pots.has(m.ball))) out.push({ t: m.t, kind: 'tunnel', label: 'Tunnel', x: m.x, y: m.y });
    else if (m.k === 'hit') for (const [x, y] of [[m.a, m.b], [m.b, m.a]]) {
      if (x.isCue || !pots.has(x) || hitSeen.has(x)) continue;
      hitSeen.add(x);
      if (x.by === y && !y.isCue) out.push({ t: m.t, kind: 'combo', label: 'Combo', x: m.x, y: m.y });
      else if (x.by === y && y.isCue && x !== s.firstHit) out.push({ t: m.t, kind: 'cannon', label: 'Cannon', x: m.x, y: m.y });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}
const TRICK_COLORS = { kick: '#3b5ea6', bank: '#b88a2e', combo: '#c4472f', cannon: '#6a4b8c', tunnel: '#2f6b4f', multi: '#dc7a30', gold: '#b88a2e' };
function drawReplay(dt) {
  const fr = replay.frames;
  // each part of the trick gets its own sound and a label where it happened, as the replay reaches it
  for (const mk of replay.marks) if (!mk.done && replay.T >= mk.t) {
    mk.done = true;
    sfx.trick(mk.kind, replay.said++);
    float(clamp(mk.x, 70, W - 70), clamp(mk.y + (mk.y < H / 2 ? 42 : -42), 30, H - 30), mk.label + '!', TRICK_COLORS[mk.kind], 19 + Math.min(6, replay.said * 1.5), 1.2);
    ring(mk.x, mk.y, '226,177,60', 44, 0.55, R); sparkle(mk.x, mk.y, '#e2b13c', 10, 120); buzz(8);
  }
  while (replay.idx < fr.length - 2 && fr[replay.idx + 1][0] <= replay.T) replay.idx++;
  const a = fr[replay.idx], b = fr[Math.min(fr.length - 1, replay.idx + 1)], u = b[0] > a[0] ? clamp((replay.T - a[0]) / (b[0] - a[0]), 0, 1) : 0;
  replay.proxies.forEach((pb, k) => {
    const o = 1 + k * 3;
    if (a[o + 2]) {
      // it dropped during the shot: send it spiralling into the nearest pocket, once (a ball potted on an earlier
      // shot is down from the first frame, with no position here: nothing to show)
      if (pb.x === undefined) replay.sunk.add(k);
      if (!replay.sunk.has(k)) {
        replay.sunk.add(k);
        const pk = table.pk.reduce((m, q) => Math.hypot(q.x - pb.x, q.y - pb.y) < Math.hypot(m.x - pb.x, m.y - pb.y) ? q : m);
        fx.sinks.push({ x: pb.x, y: pb.y, tx: clamp(pk.x, 0, W), ty: clamp(pk.y, 0, H), b: { n: pb.n, spot: pb.spot, pole: pb.pole }, t: 0 });
        atX(pk.x, () => sfx.drop());
      }
      return;
    }
    if (isNaN(a[o]) || isNaN(b[o])) return;   // in a tunnel
    pb.x = lerp(a[o], b[o], u); pb.y = lerp(a[o + 1], b[o + 1], u);
    updateSpin(pb, dt);
    drawBall(pb, pb.x, pb.y);
  });
}
// Par: a miss just costs its stroke; a foul adds a penalty stroke. Clear the balls to finish the hole, or pick
// up once you reach par + 3. A trick shot is replayed first (startReplay), then scored.
function resolveShot() {
  if (!replayed && shotRec && shotRec.length > 20 && replayKinds(table.shot).length) { startReplay(replayKinds(table.shot)); return; }
  shotRec = null;
  catAfterShot();
  const s = table.shot, c = table.cue;
  track('shot');
  const say = (t, y, col = '#b8553f', size = 18) => float(clamp(c.x, 80, W - 80), clamp(y, 40, H - 40), t, col, size, 1.8);
  const foul = !s.firstHit ? (s.catHit ? 'Only hit the cat' : 'No contact') : s.scratch ? 'Scratch' : null;
  round.potted += shotLog.length;
  if (foul) {
    strokes++;   // the penalty stroke
    if (s.scratch) table.respot(table.cue, strokeStart.x, strokeStart.y);
    say(`${foul} · +1 stroke`, table.cue.y + 44); sfx.penalty(); buzz([30, 60, 30]); fx.shake = 5;
    hs.streak = 0;
  } else if (!shotLog.length) { say(hs.streak >= 2 ? 'Streak over' : 'Miss', table.cue.y + 44, '#7a6a3a'); sfx.click(); hs.streak = 0; }
  const gold = !foul && s.pots.length && hole.gold != null && !goldUsed && s.pots.some(p => p.pocket === hole.gold);
  if (!foul && shotLog.length) scorePots(gold);
  if (gold) {
    // par: a stroke off the hole; points: it's one of the shot's tricks (scorePots)
    goldUsed = true; if (!ptsMode()) holeBonus++;
    const p = table.pk[hole.gold], px = clamp(p.x, 90, W - 90), py = clamp(p.y + (p.y < H / 2 ? 70 : -70), 50, H - 50);
    if (!ptsMode()) float(px, py, 'Golden pocket! −1 stroke', '#b88a2e', 22, 2.2);
    sparkle(p.x, p.y, '#e2b13c', 30, 170); ring(p.x, p.y, '226,177,60', 70, 0.9, p.cap);
    sfx.chime(); buzz([15, 40, 15]); fx.glow = 1;
  }
  table.shot = null; curTrail = null; cine = null; shotLog = []; ffwd = false;
  if (!table.remaining()) finishHole(false);
  else if (strokes >= capOf(round.level)) finishHole(true);
  else { lineUp(); saveRun(); }
  renderCard9(); updateUI();
}
// a shot that potted something: streak, points and the floats
function scorePots(gold) {
  hs.streak++; round.bestStreak = Math.max(round.bestStreak, hs.streak);
  setTimeout(() => { const el = $('iLie').querySelector('b'); if (el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } }, 0);
  if (ptsMode()) {
    // points: 100 a ball, times 1 + everything tricky about the shot; the hole's multiplier comes at the end
    const tricks = shotTricks(table.shot, gold), m = 1 + tricks.reduce((a, t) => a + t.add, 0), n = shotLog.length, gain = POT_PTS * n * m;
    holeRaw += gain;
    if (tricks.length) {
      holeTricks++;
      round.tricks = [...(round.tricks || []), { names: tricks.map(t => t.name), gain }];
      startTrickShow(tricks, n, m, gain);
    } else float(W / 2, H * 0.3, `+${fmtPts(gain)}`, '#b88a2e', 24, 1.4);
    return;
  }
  let base = PTS.multi * (shotLog.length - 1);
  for (const p of shotLog) base += PTS.pot + (p.bank ? PTS.bank : 0) + (p.combo ? PTS.combo : 0);
  const mult = streakMult(hs.streak), gain = Math.round(base * mult);
  hs.points += gain;
  float(W / 2, H * 0.3, `+${gain}${mult > 1 ? `  ×${mult}` : ''}`, '#b88a2e', 24 + Math.min(14, hs.streak * 3), 1.6);
  if (hs.streak >= 2) float(W / 2, H * 0.3 + 46, `${hs.streak} in a row 🔥`, '#c4472f', 18, 1.6);
}
// Trick shots: a pot on a shot without a foul that's a double or triple (two or three balls), a kick (the cue ball
// hit a cushion before its first ball), a bank (the potted ball hit a cushion first), a combination (a single pot
// of a ball the cue ball didn't hit first) or a pot through a tunnel. Each gets an instant replay.
// From RULES.POINTS_FROM: what made a clean potting shot tricky, each with what it adds to the shot's multiplier
// (see the points note in state.js). `gold`: it was the hole's first pot into the golden pocket.
function shotTricks(s, gold) {
  if (!s || s.scratch || !s.firstHit || !s.pots.length) return [];
  const t = [], pots = s.pots.filter(p => !p.ball.isCue), rails = (n, w) => n > 1 ? `${n}-rail ${w}` : w[0].toUpperCase() + w.slice(1);
  if (!pots.length) return [];
  const kick = Math.min(3, s.kickCush || 0), bank = Math.min(3, Math.max(...pots.map(p => p.ball.cush || 0)));
  if (kick) t.push({ name: rails(kick, 'kick'), add: kick, kind: 'kick' });
  if (bank) t.push({ name: rails(bank, 'bank'), add: bank, kind: 'bank' });
  if (pots.some(p => p.ball.by && !p.ball.by.isCue)) t.push({ name: 'Combo', add: 1, kind: 'combo' });
  else if (pots.some(p => p.ball !== s.firstHit && p.ball.by?.isCue)) t.push({ name: 'Cannon', add: 1, kind: 'cannon' });
  if (s.cueTunnel || pots.some(p => p.ball.tunShot)) t.push({ name: 'Tunnel', add: 1, kind: 'tunnel' });
  if (pots.length >= 2) t.push({ name: pots.length === 2 ? 'Double' : pots.length === 3 ? 'Triple' : `${pots.length} in one`, add: pots.length - 1, kind: 'multi' });
  if (gold) t.push({ name: 'Golden pocket', add: 1, kind: 'gold' });
  return t;
}
// which shots get the instant replay, and the names on it
const replayKinds = s => ptsMode() ? shotTricks(s, false).map(t => t.name) : trickKinds(s);
// The trick-shot callout (drawn by drawTrickShow): a title, then each trick lands as a chip with its own rising note
// while the multiplier climbs, then the points slam in. The bigger the multiplier, the bigger the finish.
const TRICK_STEP = 0.32, TRICK_LEAD = 0.35;
function startTrickShow(tricks, n, m, gain) {
  const slamAt = TRICK_LEAD + tricks.length * TRICK_STEP;
  trickShow = { t: 0, chips: tricks.map(c => ({ ...c, at: 0 })), n, m, gain, slamAt, dur: slamAt + 2, fired: 0, slammed: false, shown: 1 };
  sfx.trickStart(); buzz(10);
}
const trickTitle = m => m >= 6 ? 'Unreal!' : m >= 5 ? 'Incredible!' : m >= 4 ? 'Superb!' : m >= 3 ? 'Great shot!' : 'Trick shot!';
function tickTrickShow(dt) {
  const ts = trickShow;
  if (!ts) return;
  ts.t += dt;
  while (ts.fired < ts.chips.length && ts.t >= TRICK_LEAD + ts.fired * TRICK_STEP) {
    const c = ts.chips[ts.fired];
    c.at = ts.t; ts.shown += c.add; ts.fired++;
    sfx.trickChip(ts.fired - 1); buzz(12); fx.shake = Math.max(fx.shake, 2 + ts.fired);
  }
  if (!ts.slammed && ts.t >= ts.slamAt) {
    ts.slammed = true;
    sfx.trickSlam(ts.m); buzz([20, 30, 40]); fx.shake = Math.min(9, 4 + ts.m); fx.glow = 1;
    sparkle(W / 2, H * 0.2, '#e2b13c', 20 + ts.m * 8, 200 + ts.m * 30);
    if (ts.m >= 4) confettiBurst(Math.min(140, 30 * ts.m));
  }
  if (ts.t >= ts.dur) trickShow = null;
}
function trickKinds(s) {
  if (!s || s.scratch || !s.firstHit || !s.pots.length) return [];
  const k = [];
  if (s.pots.length >= 2) k.push(s.pots.length >= 3 ? 'Triple' : 'Double');
  if (s.kick) k.push('Kick');
  if (s.pots.some(p => (p.ball.cush || 0) > 0)) k.push('Bank');
  if (s.pots.length === 1 && s.pots[0].ball !== s.firstHit) k.push('Combo');
  if (s.tunnels) k.push('Tunnel');
  return k;
}
function finishHole(picked) {
  if (round.level === 0) track('clear1');
  const forLevel = round.level, par = parOf(forLevel), n = picked ? capOf(forLevel) : Math.max(1, strokes - holeBonus), d = n - par;
  const card = { strokes: n, par, picked, gold: goldUsed };
  let sub = `Hole ${forLevel + 1} · ${n} stroke${n === 1 ? '' : 's'} · par ${par}`;
  if (ptsMode()) {
    // the hole's points (and 100 a ball for clearing it), times how few strokes it took
    const raw = holeRaw + (picked ? 0 : CLEAR_PTS * hole.balls.length), mult = holeMult(d);
    Object.assign(card, { pts: Math.round(raw * mult), raw, mult, tricks: holeTricks });
    hs.points += card.pts;
    sub = `${n} stroke${n === 1 ? '' : 's'} · ${fmtPts(raw)} ${multTxt(mult)} = ${fmtPts(card.pts)}`;
  } else hs.points += picked ? 0 : PTS.level * hole.balls.length;
  round.cards.push(card);
  holeRaw = 0; holeTricks = 0;
  phase = 'holed'; gimmes = [];
  if (forLevel + 1 < HOLES) saveRun(forLevel + 1);
  // (after a trick-shot callout has had its moment)
  const wait = trickShow ? Math.max(0, trickShow.dur - trickShow.t - 0.6) * 1000 : 0;
  setTimeout(() => {
    if (round.level !== forLevel || phase !== 'holed') return;
    stamp = { text: picked ? 'Picked up' : holeWord(d), sub, color: holeColor(d), t: 0 };
    sfx.stamp(); fx.shake = 6; buzz(25); sfx.holed(d <= 0);
    if (d < 0) confettiBurst(Math.min(140, 60 + forLevel * 15));
    renderCard9(); updateUI();
  }, 450 + wait);
  setTimeout(() => {
    if (round.level !== forLevel || phase !== 'holed') return;
    if (forLevel + 1 >= HOLES) endRound(); else act();
  }, 450 + wait + (ptsMode() ? 2100 : 1700));
}
function endRound() {
  track('finish');
  try { localStorage.removeItem(runKey()); } catch {}
  round.done = true; round.points = hs.points; phase = 'over';
  if (round.ranked) { ls(parKey(round.seed), JSON.stringify({ cards: round.cards, potted: round.potted, points: round.points, bestStreak: round.bestStreak, ...(ptsMode() ? { mode: 'pts', tricks: round.tricks || [] } : {}) })); sendResult(); }
  const tot = parTotal(), strokesAll = round.cards.reduce((a, c) => a + c.strokes, 0);
  stamp = ptsMode() ? { text: 'Round over', sub: `${fmtPts(round.points)} points · ${strokesAll} strokes`, color: '#b88a2e', t: 0 }
    : { text: 'Round over', sub: `${toPar(tot)} · ${strokesAll} strokes`, color: holeColor(Math.sign(tot) * Math.min(2, Math.abs(tot))), t: 0 };
  sfx.stamp(); fx.shake = 6;
  setTimeout(() => { if (phase === 'over') showFinal(false); }, 2300);
}
function shareText(r = round) {
  if (ptsMode(r.seed)) {
    const pts = r.cards.reduce((a, c) => a + (c.pts || 0), 0), nt = (r.tricks || []).length;
    return `Daily Break ${isDailySeed(r.seed) ? dayLabel(r.seed) : 'practice'} 🎱 ${fmtPts(pts)} points\n${r.cards.map(c => cardEmoji(c.strokes - c.par)).join('')}${nt ? `\n✨ ${nt} trick shot${nt === 1 ? '' : 's'}` : ''}\n${gameUrl()}`;
  }
  const tot = r.cards.reduce((a, c) => a + c.strokes - c.par, 0);
  return `Daily Break ${isDailySeed(r.seed) ? dayLabel(r.seed) : 'practice'} ⛳ ${toPar(tot)}\n${r.cards.map(c => cardEmoji(c.strokes - c.par)).join('')}\n${gameUrl()}`;
}
function showFinal(already) {
  if (ptsMode()) return showFinalPts(already);
  const tot = parTotal(), strokesAll = round.cards.reduce((a, c) => a + c.strokes, 0), parAll = round.cards.reduce((a, c) => a + c.par, 0);
  const cell = c => `<td style="color:${holeColor(c.strokes - c.par)};font-weight:700">${c.strokes}${c.picked ? '*' : ''}</td>`;
  $('card').innerHTML = `
    <div class="k mono">${round.ranked ? courseName(round.seed) : 'Practice · not ranked'}</div>
    <h2>${already ? "Today's round is in" : 'Round over'}</h2>
    <div class="k mono">score</div>
    <div class="big">${toPar(tot)}</div>
    <div class="k mono">${strokesAll} strokes · par ${parAll}${round.bestStreak > 1 ? ` · best streak ${round.bestStreak}` : ''}</div>
    <table class="card-par mono"><tr><th>Hole</th>${round.cards.map((c, k) => `<th>${k + 1}</th>`).join('')}</tr>
      <tr><th>Par</th>${round.cards.map(c => `<td>${c.par}</td>`).join('')}</tr>
      <tr><th>You</th>${round.cards.map(cell).join('')}</tr></table>
    <div style="font-size:26px;letter-spacing:4px;margin:10px 0 4px">${round.cards.map(c => cardEmoji(c.strokes - c.par)).join('')}</div>
    <div class="k mono">🟦 under par · 🟩 par · 🟨 one over · 🟥 two or more${round.cards.some(c => c.picked) ? ' · * picked up' : ''}</div>
    <div id="rank" hidden></div>
    <div id="share">${shareText()}</div>
    <div class="row">
      <button class="btn primary" data-copy>${canNativeShare() ? 'Share' : 'Copy'} result</button>
      ${practiceLeft() > 0 ? '<button class="btn" data-random>Practice course</button>' : ''}
      ${!round.ranked ? `<button class="btn" data-daily>Today's round</button>` : ''}
    </div>
    <div class="k mono" style="margin-top:8px">${practiceLeft() > 0 ? `${practiceLeft()} practice round${practiceLeft() === 1 ? '' : 's'} left today` : 'No practice rounds left today'}</div>
    ${statsHtml()}
    <div class="k mono" id="nextIn" style="margin-top:10px"></div>
    ${feedbackLink()}`;
  tickNext(); clearInterval(tickNext.t); tickNext.t = setInterval(tickNext, 1000);
  if (round.ranked) loadRank();
  $('overlay').classList.add('show');
  phase = 'over'; updateUI();
}

// The result card on a points day: the points, then strokes against par and each hole's multiplier, and the trick
// shots (the best one named).
function showFinalPts(already) {
  const strokesAll = round.cards.reduce((a, c) => a + c.strokes, 0), parAll = round.cards.reduce((a, c) => a + c.par, 0);
  const tricks = round.tricks || [], best = tricks.reduce((m, t) => !m || t.gain > m.gain ? t : m, null);
  const cell = c => `<td style="color:${holeColor(c.strokes - c.par)};font-weight:700">${c.strokes}${c.picked ? '*' : ''}</td>`;
  $('card').innerHTML = `
    <div class="k mono">${round.ranked ? courseName(round.seed) : 'Practice · not ranked'}</div>
    <h2>${already ? "Today's round is in" : 'Round over'}</h2>
    <div class="k mono">points</div>
    <div class="big">${fmtPts(round.points)}</div>
    <div class="k mono">${strokesAll} strokes · par ${parAll}${tricks.length ? ` · ✨ ${tricks.length} trick shot${tricks.length === 1 ? '' : 's'}` : ''}</div>
    <table class="card-par pts mono"><tr><th>Hole</th>${round.cards.map((c, k) => `<th>${k + 1}</th>`).join('')}</tr>
      <tr><th>Par</th>${round.cards.map(c => `<td>${c.par}</td>`).join('')}</tr>
      <tr><th>You</th>${round.cards.map(cell).join('')}</tr>
      <tr><th>×</th>${round.cards.map(c => `<td>${+(c.mult ?? 1).toFixed(2)}</td>`).join('')}</tr>
      <tr><th>Pts</th>${round.cards.map(c => `<td style="font-weight:700">${fmtPts(c.pts || 0)}</td>`).join('')}</tr></table>
    ${best ? `<div class="k mono" style="margin-top:6px">Best shot: <b>${best.names.join(' + ')}</b> · +${fmtPts(best.gain)}</div>` : ''}
    <div style="font-size:26px;letter-spacing:4px;margin:10px 0 4px">${round.cards.map(c => cardEmoji(c.strokes - c.par)).join('')}</div>
    <div class="k mono">🟦 under par · 🟩 par · 🟨 one over · 🟥 two or more${round.cards.some(c => c.picked) ? ' · * picked up' : ''}</div>
    <div id="rank" hidden></div>
    <div id="share">${shareText()}</div>
    <div class="row">
      <button class="btn primary" data-copy>${canNativeShare() ? 'Share' : 'Copy'} result</button>
      ${practiceLeft() > 0 ? '<button class="btn" data-random>Practice course</button>' : ''}
      ${!round.ranked ? `<button class="btn" data-daily>Today's round</button>` : ''}
    </div>
    <div class="k mono" style="margin-top:8px">${practiceLeft() > 0 ? `${practiceLeft()} practice round${practiceLeft() === 1 ? '' : 's'} left today` : 'No practice rounds left today'}</div>
    ${statsHtml()}
    <div class="k mono" id="nextIn" style="margin-top:10px"></div>
    ${feedbackLink()}`;
  tickNext(); clearInterval(tickNext.t); tickNext.t = setInterval(tickNext, 1000);
  if (round.ranked) loadRank();
  $('overlay').classList.add('show');
  phase = 'over'; updateUI();
}

// A ranked round in progress is saved after every shot and between holes (the cards so far, strokes on this hole
// and where every ball is), so closing or reloading the page carries on from the same spot.
const runKey = () => 'dailybreak:run:' + round.seed;
function saveRun(nextLevel) {
  if (!round.ranked || !isDailySeed(round.seed) || round.done || ls(parKey(round.seed))) return;
  const fresh = nextLevel != null;
  ls(runKey(), JSON.stringify({
    par: true, level: fresh ? nextLevel : round.level, cards: round.cards, potted: round.potted, bestStreak: round.bestStreak,
    points: hs.points, streak: hs.streak, strokes: fresh ? 0 : strokes, bonus: fresh ? 0 : holeBonus, gold: !fresh && goldUsed,
    raw: fresh ? 0 : holeRaw, holeTricks: fresh ? 0 : holeTricks, tricks: round.tricks || [],
    cue: fresh ? null : [table.cue.x, table.cue.y], balls: fresh ? null : table.balls.map(b => [b.x, b.y, b.potted ? 1 : 0]),
  }));
}
function resumeRun() {
  if (!round.ranked || !isDailySeed(round.seed)) return false;
  let r; try { r = JSON.parse(ls(runKey())); } catch {}
  if (!r || !Number.isInteger(r.level) || !r.par) return false;   // (a lives-ladder run from before 12 Nov has no par flag)
  Object.assign(round, { cards: r.cards || [], potted: r.potted || 0, bestStreak: r.bestStreak || 0, tricks: r.tricks || [] });
  hs.points = shownPts = r.points || 0; hs.streak = r.streak || 0;
  startHole(r.level);
  if (r.balls && r.balls.length === table.balls.length) {
    r.balls.forEach(([x, y, p], k) => Object.assign(table.balls[k], { x, y, potted: !!p }));
    if (r.cue) { table.cue.x = r.cue[0]; table.cue.y = r.cue[1]; }
    strokes = r.strokes || 0; holeBonus = r.bonus || 0; goldUsed = !!r.gold; holeRaw = r.raw || 0; holeTricks = r.holeTricks || 0;
    lineUp();
    saveRun();   // startHole saved a fresh layout; put the real one back so a second reload can't reset the balls
  }
  banner = { title: `Hole ${r.level + 1}`, sub: `Carrying on · ${table.remaining()} ball${table.remaining() === 1 ? '' : 's'} left · ${ptsMode() ? `${fmtPts(hs.points)} points` : toPar(parTotal())}`, life: 1.8, max: 1.8 };
  renderCard9(); updateUI();
  return true;
}

// The drop-off funnel: one anonymous signal per step, at most once per device per day, ranked rounds on
// the live site only (open → first shot → cleared hole 1 → reached hole 3 → finished).
// ?me=1 marks this browser as the developer's (?me=0 undoes it): no funnel events or results from it
const meParam = new URLSearchParams(location.search).get('me');
if (meParam === '1') ls('dailybreak:me', '1');
if (meParam === '0') { try { localStorage.removeItem('dailybreak:me'); } catch {} }
const isMe = () => ls('dailybreak:me') === '1';
function track(step, extra) {
  if (location.hostname !== 'dailybreak.app' || isMe() || !round?.ranked || !isDailySeed(round.seed) || round.done && step !== 'finish') return;
  const key = `dailybreak:ev:${round.seed}:${step}`;
  if (ls(key)) return;
  ls(key, '1');
  const body = JSON.stringify({ day: round.seed, step, ...extra });
  try { if (navigator.sendBeacon?.('/api/event', new Blob([body], { type: 'application/json' }))) return; } catch {}
  fetch('/api/event', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => {});
}
// One anonymous result per ranked day (day, score, strokes, points; no IDs), from the live site only, so local
// tests and previews don't count.
function sendResult() {
  if (location.hostname !== 'dailybreak.app' || !isDailySeed(round.seed)) return;
  if (isMe()) { loadRank(); return; }
  const strokesAll = round.cards.reduce((a, c) => a + c.strokes, 0);
  const body = JSON.stringify(ptsMode() ? { day: round.seed, mode: 'pts', score: Math.round(round.points || 0), strokes: strokesAll, tricks: (round.tricks || []).length }
    : { day: round.seed, mode: 'par', score: parTotal(), strokes: strokesAll, points: Math.round(round.points || 0) });
  const r = round;
  fetch('/api/result', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true })
    .then(res => res.ok ? res.json() : null).then(t => { if (t && round === r) { r.tally = t; fillRank(); } }).catch(() => {});
}
// "Better than X% of today's players", from the server's count of players at each score today.
const tallyOn = () => location.hostname === 'dailybreak.app' && round.ranked && isDailySeed(round.seed);
function fillRank() {
  const el = $('rank'), t = round.tally;
  if (!el || !t || !t.players || !t.scores) return;
  // count the players who scored worse (par: higher is worse; points: lower is)
  const pts = ptsMode(), me = pts ? Math.round(round.points || 0) : parTotal(), others = t.players - 1;
  const worse = Object.entries(t.scores).reduce((a, [sc, n]) => a + ((pts ? +sc < me : +sc > me) ? n : 0), 0), same = (t.scores[me] || 0) - 1;
  const line = others <= 0 ? "You're the first to finish today's round" : worse === others ? (same > 0 ? 'Joint best today so far 🏆' : 'Best round today so far 🏆') : `Better than ${Math.round(100 * worse / others)}% of today's players`;
  el.innerHTML = `<b>${line}</b>`; el.hidden = false;   // no player count shown (Tim, 11 Nov)
}
function loadRank() {
  if (!tallyOn()) return;
  if (round.tally) return fillRank();
  const r = round;
  fetch('/api/day?day=' + r.seed + '&mode=' + (ptsMode() ? 'pts' : 'par')).then(res => res.ok ? res.json() : null).then(t => { if (t && round === r) { r.tally = t; fillRank(); } }).catch(() => {});
}
function confettiBurst(n) {
  const cols = ['#c4472f', '#e2b13c', '#3d8758', '#3b5ea6', '#f4efe2', '#dc7a30'];
  for (let i = 0; i < n; i++) fx.confetti.push({ x: Math.random() * W, y: -30 - Math.random() * H * 0.4, vx: (Math.random() - 0.5) * 40, vy: 110 + Math.random() * 90, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 8, w: 6 + Math.random() * 6, h: 4 + Math.random() * 4, c: cols[i % cols.length], life: 5 });
}

