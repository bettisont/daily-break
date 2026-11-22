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

function onEvent(type, e) {
  if (type === 'hit') {
    if (tshot && (e.a === table.cue || e.b === table.cue)) trickCueHit(e.a === table.cue ? e.b : e.a, e.x, e.y);
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
    tshot?.tun.add(b);   // trick scoring: this ball (or the cue ball) went through, so a pot can be a Tunnel
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
    const s = table.shot, bank = (b.cush || 0) > 0, combo = !!s?.firstHit && s.firstHit !== b;
    const k = (hs?.streak || 0) + shotLog.length;   // pots in a row, counting this one's place
    shotLog.push({ n: b.n, bank, combo });
    const left = table.balls.filter(o => !o.potted && o !== b).length;
    atX(tx, () => sfx.potNote(k, k >= 1)); buzz([18, 40, 12]);
    if (k >= 2) sfx.boom(k);
    if (tshot) trickDrop(b, e.pocket, tx, ty);
    if (!tshot && shotLog.length >= 2) { sfx.multi(shotLog.length); float(W / 2, H * 0.22, shotLog.length === 2 ? 'Double!' : shotLog.length === 3 ? 'Triple!' : `${shotLog.length} in one!`, '#c4472f', 26, 1.4); }
    fx.glow = Math.min(1, 0.35 + k * 0.15);
    const fy = clamp(ty, 60, H - 60) + (ty < H / 2 ? 40 : -40), fxp = clamp(tx, 60, W - 60);
    const tags = [bank && 'Bank', combo && 'Combo'].filter(Boolean).join(' · ');
    ring(tx, ty, '201,154,58', 90, 1, 20); sparkle(tx, ty, '#e2b13c', 18 + k * 6, 160 + k * 20);
    if (!tshot) float(fxp, fy, tags ? tags + '!' : left ? `${left} to go` : 'Level clear!', left ? '#b88a2e' : '#2f6b4f', 18 + Math.min(6, k * 1.5));
    if (k >= 2) fx.shake = Math.min(9, 2 + k * 1.5);
    if (cine && b.n === cine.n) { cine.hold = 0.9; ring(tx, ty, '226,177,60', 160, 1.3, 24); sparkle(tx, ty, '#e2b13c', 50, 260); }
  }
}

// Trick scoring: the moment a ball drops, work out which trick elements it adds and burst them out of the pocket,
// so a bank feels like a bank while the balls are still rolling. Every element shown here is what the shot scores
// (scoreTrick), unless the shot turns out to be a foul. Returns how many bursts it showed.
// One trick element: counted for the shot (scoreTrick adds them up and the tally shows each one). Nothing is written
// on the table as it happens (22 Nov playtest: the little pop-ups were too much); instead the pot or contact gets a
// bang that grows with how good the shot is so far (trickBang).
function trickPart(kind) { tshot.parts.push(kind); tshot.has[kind] = true; }
// how good is this shot so far: one for each trick element and each ball after the first, two for the golden pocket
const shotQ = t => t.parts.length + (t.gold ? 2 : 0);
function trickBang(x, y, q, kind) {
  const k = Math.min(q, 6);
  if (k <= 0) return;
  hitStop = Math.max(hitStop, 0.05 + 0.02 * k);
  fx.shake = Math.max(fx.shake, 3 + k * 1.6);
  fx.flashes.push({ x, y, r: 40 + k * 22, life: 0.18 + 0.04 * k });
  ring(x, y, '255,236,170', 90 + k * 45, 0.5 + 0.08 * k, 18);
  if (k >= 2) ring(x, y, '255,170,70', 150 + k * 50, 0.8 + 0.08 * k, 24);
  sparkle(x, y, '#ffe08a', 20 + k * 22, 200 + k * 70);
  sparkle(x, y, '#ff9a3c', 8 + k * 10, 140 + k * 60);
  fx.glow = Math.max(fx.glow, Math.min(1, 0.25 + 0.15 * k));
  sfx.bang(k); if (kind) sfx.trick(kind, tshot?.balls || 1);
  buzz(k >= 3 ? [30, 30, 40, 30, 50] : [20, 30, 25]);
}
function trickDrop(b, pocket, tx, ty) {
  const s = table.shot, t = tshot, got = [];
  t.balls++;
  if (t.balls >= 2) got.push('Extra');
  if ((b.cush || 0) > 0) got.push('Bank');
  if (s.kick && !t.has.Kick) got.push('Kick');
  if (s.firstHit && s.firstHit !== b && !t.has.Combo) got.push('Combo');
  if (!t.has.Tunnel && (t.tun.has(b) || t.tun.has(table.cue))) got.push('Tunnel');
  if (t.cueHits.size >= 2 && !t.has.Cannon) got.push('Cannon');
  if (t.quick && !t.has.Quick) got.push('Quick');
  // targets crossed before anything dropped count now that something has
  for (const o of t.tgt) if (!o.hit) { o.hit = true; o.hitClock = o.pendClock; got.push('Target'); }
  got.forEach(trickPart);
  const gold = pocket === hole.gold && !goldUsed && !t.gold;
  if (gold) { t.gold = true; sfx.chime(); }
  trickBang(tx, ty, shotQ(t), got.find(k => k !== 'Quick'));
  return got.length + (gold ? 1 : 0);
}
// Cannon: the cue ball touches a second object ball. Once something has dropped it bangs right there; before that,
// trickDrop picks it up at the first pot.
function trickCueHit(o, x, y) {
  const t = tshot;
  t.cueHits.add(o);
  if (t.cueHits.size >= 2 && t.balls > 0 && !t.has.Cannon) { trickPart('Cannon'); trickBang(x, y, shotQ(t), 'Cannon'); }
}

// Targets (trick scoring, 22 Nov): touch-free gold rings, one from hole 2 and two from hole 4, each sliding to and
// fro on its own straight track. Any ball rolling through one on a shot that pots scores it (+200, like a trick
// element) and it's gone. They come from their own seeded random numbers, never the hole's, so courses don't change
// and everyone gets the same targets. They move on tgtClock: physics time while the balls roll (so slow motion and
// fast-forward stay in step), the table's PLAY pace otherwise.
const TGT_R = 2 * R;
function makeTargets(seed, i, h, pk) {
  const n = i >= 3 ? 2 : i >= 1 ? 1 : 0, rnd = rngFor(`${seed}:targets:${i}`), out = [], m = TGT_R + 10;
  const onFelt = (x, y) => (h.shape ? freeIn(h.shape, x, y, m) : x > m && x < W - m && y > m && y < H - m) && pk.every(p => Math.hypot(p.x - x, p.y - y) > 100);
  for (let k = 0; k < n; k++) for (let tries = 0; tries < 300; tries++) {
    const ax = rnd() * W, ay = rnd() * H, a = rnd() * TAU, len = 150 + rnd() * 170, bx = ax + Math.cos(a) * len, by = ay + Math.sin(a) * len;
    let ok = true;
    for (let q = 0; q <= 12 && ok; q++) ok = onFelt(lerp(ax, bx, q / 12), lerp(ay, by, q / 12));
    if (!ok || out.some(o => Math.hypot((o.ax + o.bx) / 2 - (ax + bx) / 2, (o.ay + o.by) / 2 - (ay + by) / 2) < 220)) continue;
    out.push({ ax, ay, bx, by, period: 4 + rnd() * 2, phase: rnd(), hit: false });
    break;
  }
  return out;
}
const tgtPos = (o, clock) => { const u = 0.5 - 0.5 * Math.cos(TAU * (clock / o.period + o.phase)); return { x: lerp(o.ax, o.bx, u), y: lerp(o.ay, o.by, u) }; };
// after every physics step while the balls roll: has a rolling ball crossed a target?
function tgtStep() {
  tgtClock += DT;
  if (!tshot || !targets.length) return;
  for (const o of targets) {
    if (o.hit || tshot.tgt.includes(o)) continue;
    const p = tgtPos(o, tgtClock);
    const b = [table.cue, ...table.balls].find(b => !b.potted && !b.uN && (b.vx || b.vy) && Math.hypot(b.x - p.x, b.y - p.y) < TGT_R);
    if (!b) continue;
    tshot.tgt.push(o); o.pendClock = tgtClock;
    if (tshot.balls > 0) { o.hit = true; o.hitClock = tgtClock; trickPart('Target'); trickBang(p.x, p.y, shotQ(tshot), 'Target'); }
    else { sfx.trick('Target'); ring(p.x, p.y, '255,215,106', 60, 0.6, TGT_R); sparkle(p.x, p.y, '#ffe08a', 12, 120); }   // it counts once something drops
  }
}

/* ----- round / hole flow ----- */

function newRound(seed, ranked) {
  if (trickFlag) ranked = false;   // the ?trick trial never counts as anyone's daily round
  round = { seed, ranked, trick: trickOn(seed), level: 0, potted: 0, bestStreak: 0, done: false, cards: [] };
  hs = { points: 0, streak: 0 }; shownPts = 0;
  $('course').textContent = `${courseName(seed)} · ${isDailySeed(seed) && ranked ? dayLabel(seed) : 'practice'}`;
  tshot = null; thole = { pts: 0, tricks: [] }; endTally(); round.shotLog = [];
  const saved = ranked ? ls(parKey(seed)) : null;
  if (!saved && resumeRun()) return;
  startHole(0);
  if (!saved) return;
  // today's round is already in: show its card (a record that won't parse just leaves a fresh round on screen)
  let rec = null;
  try { rec = JSON.parse(saved); } catch (e) { console.error('saved round', e); }
  if (!rec || !Array.isArray(rec.cards) || !!rec.trick !== round.trick) return;
  Object.assign(round, rec, { done: true }); hs.points = round.points; renderCard9(); updateUI(); showFinal(true);
}

// A new hole: a fresh seeded layout.
function startHole(i) {
  round.level = i;
  if (i === 2) track('level3');
  hole = makeHole(round.seed, i);
  table = new Table(hole, onEvent);
  trayFly = []; trayDone = [];
  strokes = 0; holeBonus = 0; goldUsed = false; tshot = null; thole = { pts: 0, tricks: [] };
  targets = round.trick ? makeTargets(round.seed, i, hole, table.pk) : []; tgtClock = 0;
  // a cat hole: the cat hops up from its cushion onto the felt as the hole starts
  catAnim = table.cat ? { from: { x: DECOR.cat.x, y: DECOR.cat.y, rot: -0.3, sc: 1 }, to: { x: table.cat.x, y: table.cat.y, rot: table.cat.rot, sc: CAT_SC }, t: -0.9 } : null;
  marks = []; trails = []; curTrail = null; stamp = null; strike = null; cine = null; timeScale = 1;
  fx.sinks = []; fx.confetti = [];
  lineUp();
  setTimeout(() => makeHole(round.seed, i + 1), 1500);   // build the next hole while this one plays
  const n = hole.balls.length, life = featureName(hole) ? 2.3 : hole.shape ? 1.9 : 1.5;
  banner = { title: `Hole ${i + 1}`, sub: `${hole.shape ? `${hole.shape.name} table · ` : ''}${featureName(hole) ? `${featureName(hole)} · ` : ''}${hole.gold != null ? 'golden pocket · ' : ''}${n} ball${n === 1 ? '' : 's'} · ${round.trick ? `${capOf(i)} shots` : `par ${parOf(i)}`}`, life, max: life };
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
  phase = 'aim'; gimmes = findGimmes(); focusBall(bestBall(), true); aimClock = 0;
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
  if (round.trick) return out;   // trick scoring: every ball has to be shot
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
  for (const o of table.balls) o.cush = 0;
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
  cine = (round.level >= 2 && !sim.remaining() || trickKinds(sim.shot).length) && !sim.shot.scratch && sp.length ? { n: sp[sp.length - 1].ball.n, pocket: sp[sp.length - 1].pocket, hold: 0 } : null;
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
  // Quick: let go within QUICK_S of the aim starting (never while a lesson is showing: aimClock is pushed past it then)
  tshot = round.trick ? { parts: [], has: {}, balls: 0, tun: new Set(), cueHits: new Set(), tgt: [], gold: false, quick: !first && aimClock <= QUICK_S } : null;
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
  replay = { frames, T: 0, idx: 0, endT, speed: Math.max(0.45, endT / 5.5), kinds, proxies, sunk: new Set() };
  phase = 'replay'; updateUI();
  tone(660, 0.12, 0.05, 'sine', 1.5, 0, 0.4);
}
function drawReplay(dt) {
  const fr = replay.frames;
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
  if (!replayed && shotRec && shotRec.length > 20 && trickKinds(table.shot).length) { startReplay(trickKinds(table.shot)); return; }
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
    if (tshot && (tshot.parts.length || tshot.gold)) say("Tricks don't count on a foul", table.cue.y + 84, '#7a6a3a', 16);
    if (tshot) for (const o of tshot.tgt) o.hit = false;   // a target crossed on a foul comes back
    breakStreak();
  } else if (!shotLog.length) { say(hs.streak >= 2 ? 'Streak over' : 'Miss', table.cue.y + 44, '#7a6a3a'); sfx.click(); breakStreak(); }
  if (!foul && shotLog.length) round.trick ? scoreTrick() : scorePots();
  else if (!foul && tshot?.tgt.length) say('Targets only count on a shot that pots', table.cue.y + 84, '#7a6a3a', 16);
  if (!round.trick && !foul && s.pots.length && hole.gold != null && !goldUsed && s.pots.some(p => p.pocket === hole.gold)) {
    goldUsed = true; holeBonus++;
    const p = table.pk[hole.gold], px = clamp(p.x, 90, W - 90), py = clamp(p.y + (p.y < H / 2 ? 70 : -70), 50, H - 50);
    float(px, py, 'Golden pocket! −1 stroke', '#b88a2e', 22, 2.2); sparkle(p.x, p.y, '#e2b13c', 30, 170); ring(p.x, p.y, '226,177,60', 70, 0.9, p.cap);
    sfx.chime(); buzz([15, 40, 15]); fx.glow = 1;
  }
  table.shot = null; curTrail = null; cine = null; shotLog = []; ffwd = false; tshot = null;
  if (!table.remaining()) finishHole(false);
  else if (strokes >= capOf(round.level)) finishHole(true);
  else { lineUp(); saveRun(); }
  renderCard9(); updateUI();
}
// a shot that potted something: streak, points and the floats
function scorePots() {
  hs.streak++; round.bestStreak = Math.max(round.bestStreak, hs.streak);
  setTimeout(() => { const el = $('iLie').querySelector('b'); if (el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } }, 0);
  let base = PTS.multi * (shotLog.length - 1);
  for (const p of shotLog) base += PTS.pot + (p.bank ? PTS.bank : 0) + (p.combo ? PTS.combo : 0);
  const mult = streakMult(hs.streak), gain = Math.round(base * mult);
  hs.points += gain;
  float(W / 2, H * 0.3, `+${gain}${mult > 1 ? `  ×${mult}` : ''}`, '#b88a2e', 24 + Math.min(14, hs.streak * 3), 1.6);
  if (hs.streak >= 2) float(W / 2, H * 0.3 + 46, `${hs.streak} in a row 🔥`, '#c4472f', 18, 1.6);
}
// a miss or a foul ends the streak; under trick scoring the edge glow fizzles out with it
function breakStreak() {
  if (round.trick && hs.streak >= 2) { sfx.fizzle(); crackStreakMeter(); }
  hs.streak = 0;
}
// Trick scoring: a shot that potted something, with no foul. 100 a pot, 200 for each trick element seen as the balls
// dropped (trickDrop), doubled by the golden pocket, times the streak. The breakdown floats up once the replay is done.
function scoreTrick() {
  const t = tshot || { parts: [], gold: false };
  hs.streak++; round.bestStreak = Math.max(round.bestStreak, hs.streak);
  const pots = shotLog.length, mult = streakMult(hs.streak), gold = t.gold ? 2 : 1;
  const gain = Math.round((TRICK_PTS.pot * pots + t.parts.reduce((a, k) => a + partPts(k), 0)) * gold * mult);
  hs.points += gain; thole.pts += gain; thole.tricks.push(...t.parts);
  if (t.gold) goldUsed = true;
  const n = k => t.parts.filter(p => p === k).length, items = [], ex = n('Extra');
  if (ex) items.push([ex === 1 ? 'Double' : ex === 2 ? 'Triple' : `${ex + 1} in one`, TRICK_PTS.part * ex, `${ex + 1} balls in one shot`]);
  for (const k of ['Bank', 'Kick', 'Combo', 'Tunnel', 'Cannon', 'Target', 'Quick']) if (n(k)) items.push([`${k}${n(k) > 1 ? ` ×${n(k)}` : ''}`, partPts(k) * n(k), TRICK_WHY[k]]);
  const muls = [...(t.gold ? [['Golden', 2, 'into the golden pocket']] : []), ...(mult > 1 ? [['Streak', mult, `${hs.streak} potting shots in a row`]] : [])];
  showTally([pots === 1 ? 'Pot' : `${pots} pots`, TRICK_PTS.pot * pots, pots === 1 ? '1 ball potted' : `${pots} balls potted`], items, muls, gain);
}
// what each element is for, in the breakdown behind the Points chip
const TRICK_WHY = { Bank: 'the ball came off a cushion', Kick: 'the cue ball hit a cushion first', Combo: 'potted by another ball', Tunnel: 'through the tunnel', Cannon: 'the cue ball hit two balls', Target: 'through a moving target', Quick: `shot in under ${QUICK_S} seconds` };
// The shot's tally (22 Nov, shaped by the playtests: show the multiplier working on the shot, but keep the table
// clear: only numbers). After the replay the base (100 a pot) comes up mid-table; each trick element's flat points
// ("+200") come in one at a time and fly into it as the number rolls up; each multiplier (the golden pocket's x2, then
// the streak, pulled down out of the streak meter) is applied last, onto the whole; and the shot's score flies into the header's Points, which only then counts up (ptsHold). What each
// number was for is kept (logShot) and shown when the Points chip is tapped (showShotLog).
let tally = null;
function rollNum(el, from, to, ms, pre = '') {
  const t0 = performance.now();
  const step = now => { const k = Math.min(1, (now - t0) / ms), e = 1 - (1 - k) ** 3; el.textContent = pre + fmtPts(from + (to - from) * e); if (k < 1 && el.isConnected) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
function endTally() {
  if (!tally) return;
  tally.timers.forEach(clearTimeout); tally.el.remove(); tally = null;
  document.querySelectorAll('.tchip').forEach(c => c.remove());
  ptsHold = false;
  const el = $('ptsVal');
  if (el) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
}
function showTally([baseLabel, base, baseWhy], items, muls, gain) {
  endTally();
  logShot([baseLabel, base, baseWhy], items, muls, gain);
  const st = $('stage').getBoundingClientRect(), cx = st.left + st.width / 2, cy = st.top + st.height * 0.3;
  const el = document.createElement('div');
  el.id = 'tally'; el.style.left = cx + 'px'; el.style.top = cy + 'px';
  el.innerHTML = `<div class="tn">${fmtPts(base)}</div><div class="tl">${baseLabel}</div>`;
  document.body.appendChild(el);
  ptsHold = true;
  const n = el.querySelector('.tn'), tl = el.querySelector('.tl'), timers = [];
  tally = { el, timers };
  const at = (ms, f) => timers.push(setTimeout(f, ms));
  const pop = cls => { n.classList.remove('pop', 'smash'); void n.offsetWidth; n.classList.add(cls); };
  tone(660, 0.1, 0.05, 'triangle', 1.5, 0, 0.3);
  let t = 750, now = base;
  const gap = items.length > 4 ? 650 : 820;
  // each trick element: "+200 BANK" appears under the number, then flies up into it (one word says what it's for:
  // 22 Nov playtest, the numbers alone didn't say why; full sentences were too much)
  const addIn = (pts, label, cls, i, after) => {
    const it = document.createElement('div');
    at(t, () => { tl.classList.add('gone'); it.className = `ti ${cls}`; it.innerHTML = `+${fmtPts(pts)} <small>${label}</small>`; el.appendChild(it); tone(784 * Math.pow(2, i / 7), 0.08, 0.04, 'triangle', 1, 0, 0.3); });
    at(t + gap - 300, () => it.classList.add('in'));
    at(t + gap - 120, () => { it.remove(); after(); pop('pop'); tone(1046.5 * Math.pow(2, i / 7), 0.12, 0.05, 'sine', 1, 0, 0.4); buzz(8); });
    t += gap;
  };
  items.forEach(([label, pts], i) => addIn(pts, label, '', i, () => { rollNum(n, now, now + pts, 200); now += pts; }));
  // each multiplier pulls down onto the number and smashes into it
  muls.forEach(([label, m], i) => {
    const chip = document.createElement('div');
    t += 200;
    at(t, () => {
      const src = label === 'Streak' && $('iLie') ? $('iLie').getBoundingClientRect() : { left: cx - 40, top: st.top - 40, width: 80, height: 30 };
      chip.className = `tchip ${label === 'Streak' ? 'streak' : 'gold'}`; chip.innerHTML = `×${m}<small>${label}</small>`;
      chip.style.left = src.left + src.width / 2 + 'px'; chip.style.top = src.top + src.height / 2 + 'px';
      document.body.appendChild(chip);
    });
    at(t + 380, () => {
      const nr = n.getBoundingClientRect(), r0 = chip.getBoundingClientRect();
      chip.classList.add('drop');
      chip.style.transform = `translate(-50%,-50%) translate(${nr.left + nr.width / 2 - (r0.left + r0.width / 2)}px, ${nr.top + nr.height / 2 - (r0.top + r0.height / 2)}px)`;
      tone(300, 0.45, 0.04, 'sine', 3, 0, 0.3);   // a rising whoosh as it pulls down
    });
    at(t + 830, () => {
      chip.classList.add('smash');
      setTimeout(() => chip.remove(), 260);
      const to = i === muls.length - 1 ? gain : now * m;
      rollNum(n, now, to, 340); now = to; pop('smash');
      if (label === 'Streak') n.classList.add('hot');
      sfx.boom(Math.round(m * 2)); sfx.bang(Math.min(6, 2 + Math.round(m * 1.2)));
      fx.shake = Math.max(fx.shake, 5 + m * 2); hitStop = Math.max(hitStop, 0.06);
      sparkle(W / 2, H * 0.3, '#ffe08a', 40, 320); sparkle(W / 2, H * 0.3, '#ff9a3c', 20, 240); ring(W / 2, H * 0.3, '255,214,110', 200, 0.7, 30);
      buzz([25, 30, 40]);
    });
    t += 1200;
  });
  const total = gain;
  // then the shot's score flies into the header's Points
  at(t + 450, () => {
    const dst = $('ptsVal'), a = n.getBoundingClientRect(), b = dst ? dst.getBoundingClientRect() : a;
    n.textContent = `+${fmtPts(total)}`;
    n.style.transition = 'transform .55s cubic-bezier(.5,0,.8,.4), opacity .55s';
    n.style.transform = `translate(${b.left + b.width / 2 - (a.left + a.width / 2)}px, ${b.top + b.height / 2 - (a.top + a.height / 2)}px) scale(.35)`;
    n.style.opacity = 0.7;
  });
  at(t + 1000, () => {
    endTally(); sfx.chime(); buzz(10);
    // once per device: say where the explanation is
    if (!ls('dailybreak:shotLogTip')) { ls('dailybreak:shotLogTip', '1'); $('ptsChip')?.classList.add('tip'); float(W / 2, H * 0.2, 'Tap Points to see how it added up', '#2f6b4f', 18, 3); }
  });
}
// Every scored shot this round, newest first, for the breakdown behind the Points chip.
function logShot([baseLabel, base, baseWhy], items, muls, gain) {
  const lines = [[baseWhy, fmtPts(base)], ...items.map(([label, pts, why]) => [`${label} <small>${why}</small>`, `+${fmtPts(pts)}`])];
  for (const [label, m, why] of muls) lines.push([`${label} <small>${why}</small>`, `×${m}`]);
  const sum = [base, ...items.map(x => x[1])].map(fmtPts).join(' + '), shot = `${muls.length && items.length ? `(${sum})` : sum}${muls.map(([, m]) => ` × ${m}`).join('')}`;
  (round.shotLog ||= []).unshift({ hole: round.level + 1, shot: strokes, lines, eq: lines.length > 1 ? `${shot} = ${fmtPts(gain)}` : '', total: gain });
  round.shotLog.length = Math.min(round.shotLog.length, 30);
}
function showShotLog() {
  const log = round.shotLog || [];
  $('card').innerHTML = `
    <div class="k mono">How your points added up</div>
    <h2>${log.length ? 'Your shots' : 'No points yet'}</h2>
    ${log.length ? '' : '<p class="k">Pot a ball: each shot that scores is explained here.</p>'}
    <div class="shotlog">${log.map((r, k) => `
      <div class="sl${k ? '' : ' last'}">
        <div class="slh mono">Hole ${r.hole} · shot ${r.shot}${k ? '' : ' · last shot'}<b>+${fmtPts(r.total)}</b></div>
        ${r.lines.map(([a, b]) => `<div class="sll"><span>${a}</span><b>${b}</b></div>`).join('')}
        ${r.eq ? `<div class="sle mono">${r.eq}</div>` : ''}
      </div>`).join('')}</div>
    <div class="row"><button class="btn primary" data-close>Back to the table</button></div>`;
  $('overlay').classList.add('show');
}
// Trick shots: a pot on a shot without a foul that's a double or triple (two or three balls), a kick (the cue ball
// hit a cushion before its first ball), a bank (the potted ball hit a cushion first), a combination (a single pot
// of a ball the cue ball didn't hit first) or a pot through a tunnel. Each gets an instant replay.
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
  const tr = round.trick, th = thole;
  if (tr) round.cards.push({ strokes: Math.min(strokes, capOf(forLevel)), par, picked, gold: goldUsed, pts: th.pts, tricks: th.tricks });   // (no points for clearing: 22 Nov playtest)
  else {
    round.cards.push({ strokes: n, par, picked, gold: goldUsed });
    hs.points += picked ? 0 : PTS.level * hole.balls.length;
  }
  phase = 'holed'; gimmes = [];
  if (forLevel + 1 < HOLES) saveRun(forLevel + 1);
  if (tr) {
    // Trick scoring (22 Nov playtest): no stamp ("Trick clear!", "Cleared"): the tally already shows the points and
    // the stamp got in its way. Out of shots just says so. The next hole waits for the tally.
    if (picked) float(W / 2, H * 0.45, 'Out of shots', '#7a6a3a', 22, 1.8);
    sfx.holed(!picked);
    if (!picked && th.tricks.length) confettiBurst(Math.min(140, 60 + forLevel * 15));
    const go = () => {
      if (round.level !== forLevel || phase !== 'holed') return;
      if (tally) return setTimeout(go, 200);
      if (forLevel + 1 >= HOLES) endRound(); else act();
    };
    setTimeout(go, picked ? 1500 : 700);
    return;
  }
  setTimeout(() => {
    if (round.level !== forLevel || phase !== 'holed') return;
    const good = d <= 0, party = d < 0;
    stamp = { text: picked ? 'Picked up' : holeWord(d), sub: `Hole ${forLevel + 1} · ${n} stroke${n === 1 ? '' : 's'} · par ${par}`, color: holeColor(d), t: 0 };
    sfx.stamp(); fx.shake = 6; buzz(25); sfx.holed(good);
    if (party) confettiBurst(Math.min(140, 60 + forLevel * 15));
    renderCard9(); updateUI();
  }, 450);
  setTimeout(() => {
    if (round.level !== forLevel || phase !== 'holed') return;
    if (forLevel + 1 >= HOLES) endRound(); else act();
  }, 450 + 1700);
}
function endRound() {
  track('finish');
  try { localStorage.removeItem(runKey()); } catch {}
  round.done = true; round.points = hs.points; phase = 'over';
  if (round.ranked) { ls(parKey(round.seed), JSON.stringify({ cards: round.cards, potted: round.potted, points: round.points, bestStreak: round.bestStreak, ...(round.trick ? { trick: true } : {}) })); sendResult(); }
  const tot = parTotal(), strokesAll = round.cards.reduce((a, c) => a + c.strokes, 0);
  if (round.trick) { setTimeout(() => { if (phase === 'over') showFinal(false); }, 600); return; }   // straight to the card
  stamp = { text: 'Round over', sub: `${toPar(tot)} · ${strokesAll} strokes`, color: holeColor(Math.sign(tot) * Math.min(2, Math.abs(tot))), t: 0 };
  sfx.stamp(); fx.shake = 6;
  setTimeout(() => { if (phase === 'over') showFinal(false); }, 2300);
}
// Trick scoring's share text: the points and the rank line.
// (22 Nov playtest: a line of emoji per hole was too much; now just the points and how you did against everyone)
function trickShareText(r) {
  const rank = trickRankLine(r);
  return `Daily Break ${isDailySeed(r.seed) && r.ranked !== false ? dayLabel(r.seed) : 'practice'} 🎱 ${fmtPts(r.points || 0)} points${rank ? `\n${rank}` : ''}\n${gameUrl()}`;
}
// how you did against today's players, from the server's tally (null until it has come back)
function trickRankLine(r) {
  const t = r.tally;
  if (!t || !t.players || !t.scores) return null;
  const me = Math.floor((r.points || 0) / TRICK_BUCKET) * TRICK_BUCKET, others = t.players - 1;
  const worse = Object.entries(t.scores).reduce((a, [sc, n]) => a + (+sc < me ? n : 0), 0), same = (t.scores[me] || 0) - 1;
  if (others <= 0) return 'First to finish today';
  if (worse === others) return `${same > 0 ? 'Joint best' : 'Best'} of ${t.players.toLocaleString('en-US')} players today 🏆`;
  return `Beat ${Math.round(100 * worse / others)}% of ${t.players.toLocaleString('en-US')} players today`;
}
function shareText(r = round) {
  if (r.trick) return trickShareText(r);
  const tot = r.cards.reduce((a, c) => a + c.strokes - c.par, 0);
  return `Daily Break ${isDailySeed(r.seed) ? dayLabel(r.seed) : 'practice'} ⛳ ${toPar(tot)}\n${r.cards.map(c => cardEmoji(c.strokes - c.par)).join('')}\n${gameUrl()}`;
}
// 950, 1.5k, 12k: hole points fit six columns on a phone
const shortPts = n => n < 1000 ? String(Math.round(n)) : `${(n / 1000).toFixed(n < 10000 ? 1 : 0).replace(/\.0$/, '')}k`;
// Trick scoring's result card: points, best streak, and per hole its points and trick emoji.
function trickFinalHtml(already) {
  const strokesAll = round.cards.reduce((a, c) => a + c.strokes, 0), nTricks = round.cards.reduce((a, c) => a + (c.tricks || []).length, 0);
  return `
    <div class="k mono">${round.ranked ? courseName(round.seed) : trickFlag ? 'Trick scoring trial · not ranked' : 'Practice · not ranked'}</div>
    <h2>${already ? "Today's round is in" : 'Round over'}</h2>
    <div class="k mono">points</div>
    <div class="big">${fmtPts(round.points || 0)}</div>
    <div class="k mono">${nTricks} trick${nTricks === 1 ? '' : 's'} · ${strokesAll} shots${round.bestStreak > 1 ? ` · best streak ×${streakMult(round.bestStreak)}` : ''}</div>
    <table class="card-par card-trick mono"><tr><th>Hole</th>${round.cards.map((c, k) => `<th>${k + 1}</th>`).join('')}</tr>
      <tr><th>Pts</th>${round.cards.map(c => `<td style="font-weight:700;color:${c.picked ? '#b8553f' : 'inherit'}">${shortPts(c.pts || 0)}${c.picked ? '*' : ''}</td>`).join('')}</tr></table>
    ${round.cards.some(c => c.picked) ? '<div class="k mono">* picked up</div>' : ''}`;
}
function showFinal(already) {
  if (round.trick) {
    $('card').innerHTML = `${trickFinalHtml(already)}
    <div id="rank" hidden></div>
    <div id="share">${shareText()}</div>
    <div class="row">
      <button class="btn primary" data-copy>${canNativeShare() ? 'Share' : 'Copy'} result</button>
      ${practiceLeft() > 0 ? '<button class="btn" data-random>Practice course</button>' : ''}
      ${!round.ranked && !trickFlag ? `<button class="btn" data-daily>Today's round</button>` : ''}
    </div>
    ${statsHtml()}
    <div class="k mono" id="nextIn" style="margin-top:10px"></div>
    ${feedbackLink()}`;
    tickNext(); clearInterval(tickNext.t); tickNext.t = setInterval(tickNext, 1000);
    if (round.ranked) loadRank();
    $('overlay').classList.add('show');
    phase = 'over'; updateUI();
    return;
  }
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

// A ranked round in progress is saved after every shot and between holes (the cards so far, strokes on this hole
// and where every ball is), so closing or reloading the page carries on from the same spot.
const runKey = () => 'dailybreak:run:' + round.seed;
function saveRun(nextLevel) {
  if (!round.ranked || !isDailySeed(round.seed) || round.done || ls(parKey(round.seed))) return;
  const fresh = nextLevel != null;
  ls(runKey(), JSON.stringify({
    par: true, trick: round.trick, hole: fresh ? { pts: 0, tricks: [] } : thole, tg: fresh ? null : targets.map(o => o.hit ? 1 : 0), level: fresh ? nextLevel : round.level, cards: round.cards, potted: round.potted, bestStreak: round.bestStreak,
    points: hs.points, streak: hs.streak, strokes: fresh ? 0 : strokes, bonus: fresh ? 0 : holeBonus, gold: !fresh && goldUsed,
    cue: fresh ? null : [table.cue.x, table.cue.y], balls: fresh ? null : table.balls.map(b => [b.x, b.y, b.potted ? 1 : 0]),
  }));
}
function resumeRun() {
  if (!round.ranked || !isDailySeed(round.seed)) return false;
  let r; try { r = JSON.parse(ls(runKey())); } catch {}
  if (!r || !Number.isInteger(r.level) || !r.par) return false;   // (a lives-ladder run from before 12 Nov has no par flag)
  if (!!r.trick !== round.trick) return false;   // scored the other way (the switch came mid-round): start afresh
  Object.assign(round, { cards: r.cards || [], potted: r.potted || 0, bestStreak: r.bestStreak || 0 });
  hs.points = shownPts = r.points || 0; hs.streak = r.streak || 0;
  startHole(r.level);
  if (r.balls && r.balls.length === table.balls.length) {
    r.balls.forEach(([x, y, p], k) => Object.assign(table.balls[k], { x, y, potted: !!p }));
    if (r.cue) { table.cue.x = r.cue[0]; table.cue.y = r.cue[1]; }
    strokes = r.strokes || 0; holeBonus = r.bonus || 0; goldUsed = !!r.gold;
    if (round.trick && r.hole) thole = { pts: r.hole.pts || 0, tricks: r.hole.tricks || [] };
    if (round.trick && Array.isArray(r.tg)) r.tg.forEach((v, k) => { if (targets[k]) targets[k].hit = !!v; });
    lineUp();
    saveRun();   // startHole saved a fresh layout; put the real one back so a second reload can't reset the balls
  }
  banner = { title: `Hole ${r.level + 1}`, sub: `Carrying on · ${table.remaining()} ball${table.remaining() === 1 ? '' : 's'} left · ${toPar(parTotal())}`, life: 1.8, max: 1.8 };
  if (round.trick) banner.sub = `Carrying on · ${table.remaining()} ball${table.remaining() === 1 ? '' : 's'} left · ${fmtPts(hs.points)} pts`;
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
  const body = round.trick ? JSON.stringify({ day: round.seed, mode: 'trick', points: Math.round(round.points || 0), strokes: round.cards.reduce((a, c) => a + c.strokes, 0) })
    : JSON.stringify({ day: round.seed, mode: 'par', score: parTotal(), strokes: round.cards.reduce((a, c) => a + c.strokes, 0), points: Math.round(round.points || 0) });
  const r = round;
  fetch('/api/result', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true })
    .then(res => res.ok ? res.json() : null).then(t => { if (t && round === r) { r.tally = t; fillRank(); } }).catch(() => {});
}
// "Better than X% of today's players", from the server's count of players at each score today.
const TRICK_BUCKET = 50;   // keep in step with src/worker.js
const tallyOn = () => location.hostname === 'dailybreak.app' && round.ranked && isDailySeed(round.seed);
function fillRank() {
  const el = $('rank'), t = round.tally;
  if (!el || !t || !t.players || !t.scores) return;
  // par: lower is better. Trick scoring: higher is better, counted in buckets of TRICK_BUCKET points (the worker's).
  const others = t.players - 1, me = round.trick ? Math.floor((round.points || 0) / TRICK_BUCKET) * TRICK_BUCKET : parTotal();
  const worse = Object.entries(t.scores).reduce((a, [sc, n]) => a + ((round.trick ? +sc < me : +sc > me) ? n : 0), 0), same = (t.scores[me] || 0) - 1;
  if (round.trick) {   // the rank line, with the player count, and the share text picks it up too
    el.innerHTML = `<b>${trickRankLine(round)}</b>`; el.hidden = false;
    if ($('share')) $('share').textContent = shareText();
    return;
  }
  const line = others <= 0 ? "You're the first to finish today's round" : worse === others ? (same > 0 ? 'Joint best today so far 🏆' : 'Best round today so far 🏆') : `Better than ${Math.round(100 * worse / others)}% of today's players`;
  el.innerHTML = `<b>${line}</b>`; el.hidden = false;   // no player count shown (Tim, 11 Nov)
}
function loadRank() {
  if (!tallyOn()) return;
  if (round.tally) return fillRank();
  const r = round;
  fetch('/api/day?day=' + r.seed + '&mode=' + (r.trick ? 'trick' : 'par')).then(res => res.ok ? res.json() : null).then(t => { if (t && round === r) { r.tally = t; fillRank(); } }).catch(() => {});
}
function confettiBurst(n) {
  const cols = ['#c4472f', '#e2b13c', '#3d8758', '#3b5ea6', '#f4efe2', '#dc7a30'];
  for (let i = 0; i < n; i++) fx.confetti.push({ x: Math.random() * W, y: -30 - Math.random() * H * 0.4, vx: (Math.random() - 0.5) * 40, vy: 110 + Math.random() * 90, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 8, w: 6 + Math.random() * 6, h: 4 + Math.random() * 4, c: cols[i % cols.length], life: 5 });
}

