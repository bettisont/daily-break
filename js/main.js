// main.js: the frame loop (frame) and startup: size the canvas, start today's round (or a ?seed= practice run),
// show the intro on a first visit and start the loop. Loads last: its top-level lines run once everything is defined.

/* ----- loop ----- */

// Frame pacing (16 Nov 2026: phones were getting hot). Every frame repaints the whole screen several times over
// (room, table, clouds, lamp, vignette, grain), and a 120 Hz phone was doing it 120 times a second even with
// nothing happening. Now: at most 60 a second while anything moves or a finger is down, 30 while the table just sits
// there (only the slow room animations: clouds, plants, record, grain), and 15 behind the blurred card (the blur is
// redone on every frame drawn under it). The physics steps a fixed DT however often frames come, so no outcome changes.
let lastInput = 0;
addEventListener('pointerdown', () => { lastInput = performance.now(); }, { capture: true, passive: true });
addEventListener('pointermove', () => { lastInput = performance.now(); }, { capture: true, passive: true });
addEventListener('keydown', () => { lastInput = performance.now(); }, { capture: true, passive: true });
function busy(now) {
  return phase !== 'aim' && phase !== 'over' || hold || drag || demo || spinDemo || cine || lip || zoom
    || now - lastInput < 1500 || fx.shake > 0.05 || fx.glow > 0 || banner || (stamp && stamp.t < 0.5) || trayFly.length
    || fx.particles.length || fx.rings.length || fx.floats.length || fx.sinks.length || fx.confetti.length || fx.flashes.length
    || table?.pk.some(p => p.glow > 0 || p.wobble > 0) || streakGlowBusy() || Math.abs(cam.k - 1) > 2e-4 || (hs && shownPts !== hs.points);
}
// The timed trial (23 Nov: phones got hot; you're touching the screen nearly all the time, so it was 60 fps for the
// whole run): 60 only for real motion (balls rolling, the strike and its close-up, pulling the cue, the camera, bursts
// and sparks), 40 while you just aim or something small animates, and the tally (a page overlay that animates by
// itself) holds nothing up. Par keeps the old pacing.
function trialFps(now) {
  if (phase === 'moving' || phase === 'strike' || hold || zoom || cine || lip || banner || Math.abs(cam.k - 1) > 2e-4 || fx.shake > 0.05
    || fx.particles.length || fx.rings.length || fx.sinks.length || fx.flashes.length || trayFly.length) return 60;
  if (busy(now)) return 40;
  return $('overlay').classList.contains('show') ? 15 : 30;
}
function frame(now) {
  requestAnimationFrame(frame);
  const fps = round?.trick ? trialFps(now) : busy(now) ? 60 : $('overlay').classList.contains('show') ? 15 : 30, active = fps > 30;
  // (4 ms of slack for rAF jitter: on a 120 Hz screen 60 fps is every other frame, at 60 Hz 30 fps is every other)
  if (frame.drawn != null && now - frame.drawn < 1000 / fps - 4) return;
  frame.drawn = now;
  const t = now / 1000, dt = Math.min(active ? 0.05 : 0.1, t - (frame.last ?? t));
  frame.last = t;
  if (hold) {
    const d = contactDiff(), was = tipOnSpot(d);
    swayT += dt;
    if (!was && tipOnSpot(d)) { tone(1046, 0.03, 0.02, 'sine', 1, 0, 0); buzz(3); }
    const inCore = tipInCore(d); if (inCore && !frame.core) { tone(1568, 0.03, 0.025, 'sine', 1, 0, 0); buzz(4); } frame.core = inCore;
  }
  if (phase === 'strike') {
    const was = strike.t;
    strike.t += dt;
    if (strike.lesson) aimLesson(was, strike.t);
    if (strike.spinLesson) spinLesson(was, strike.t);
    // the close-up's tip lands: the click and buzz go with it
    if (was < STRIKE_T && strike.t >= STRIKE_T) {
      const q = zoom?.teach?.quality || zoom?.ct.quality;   // the first shot's lesson sounds like where they really hit
      if (q === 'miscue') { sfx.miscue(); buzz([20, 30, 20]); }
      else if (q === 'perfect') { sfx.thock(strike.power); sfx.chime(); tone(2637, 0.4, 0.05, 'sine', 1, 0.08, 0.6); tone(3136, 0.5, 0.04, 'sine', 1, 0.15, 0.6); buzz([18, 30, 18, 30, 30]); }
      else { sfx.thock(strike.power); buzz(q === 'clean' ? [14, 25, 8] : 10); if (q === 'clean') tone(1318.5, 0.2, 0.05, 'sine', 1, 0, 0.4); }
    }
    // then, once the close-up has gone, the cue on the table strikes and the balls roll
    if (strike.t >= strike.end) {
      table.shoot(strike.angle, strike.power, strike.spin, strike.side);
      const q = zoom?.ct.quality, c0 = table.cue, fy = c0.y - 50 < 30 ? c0.y + 50 : c0.y - 50;
      if (q === 'perfect') {
        table.shot.perfect = true;
        [1318.5, 1568].forEach((f, k) => tone(f, 0.3, 0.03, 'sine', 1, k * 0.06, 0.6));   // a soft two-note lift
        sparkle(c0.x, c0.y, '#ffd76a', 18, 130); ring(c0.x, c0.y, '255,215,106', 50, 0.6); if (!round.trick) float(c0.x, fy, 'Perfect strike!', '#b88a2e', 22); fx.glow = Math.max(fx.glow, 0.35); }
      else if (q === 'clean') { sparkle(c0.x, c0.y, '#e2b13c', 8, 110); if (!round.trick) float(c0.x, fy, 'Clean strike', '#7a6a3a', 18); }
      else if (q === 'miscue') { fx.shake = 5; float(c0.x, fy, 'Miscue!', '#b8553f', 22); for (let k = 0; k < 14; k++) { const a = Math.random() * TAU, v = 40 + Math.random() * 90; fx.particles.push({ x: c0.x, y: c0.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.6 + Math.random() * 0.4, color: '#8fb4e8', r: 1.5 + Math.random() * 2.5 }); } }
      else if (q) float(c0.x, fy, zoom.ct.off ? `Off-centre: pushed ${zoom.ct.off < 0 ? 'left' : 'right'}` : 'Off-centre', q === 'near' ? '#7a6a3a' : '#b8553f', 18);
      sfx.clack(strike.power * 1600);
      const c = table.cue;
      for (let k = 0; k < 8; k++) fx.particles.push({ x: c.x - Math.cos(strike.angle) * R, y: c.y - Math.sin(strike.angle) * R, vx: (Math.random() - 0.5) * 80, vy: (Math.random() - 0.5) * 80, life: 0.5, color: '#7fa0d8', r: 1.5 });
      acc = 0; movingT = 0; phase = 'moving'; shotClock0 = tgtClock; updateUI();
      shotRec = []; shotSteps = 0; replayed = false; lip = null; lipTried = new Set();
      follow = { x: c.x, y: c.y, angle: strike.angle, power: strike.power, t: 0 };
      cam.k += 0.03 + 0.04 * strike.power;   // a small push in on the strike, which eases back
    }
  }
  // Slow motion and a push-in as the rack's last ball heads for the pocket.
  let slow = false, tk = 1, tx = W / 2, ty = H / 2;
  if (cine) {
    const b = table.balls.find(o => o.n === cine.n), p = table.pk[cine.pocket], px = clamp(p.x, 0, W), py = clamp(p.y, 0, H);
    if (cine.hold > 0) { cine.hold -= dt; slow = true; tk = 1.35; tx = px; ty = py; }
    else if (b && !b.potted && (b.vx || b.vy) && Math.hypot(b.x - p.x, b.y - p.y) < 230) { slow = true; tk = 1.3; tx = (b.x + px) / 2; ty = (b.y + py) / 2; }
  }
  // A ball on the lip: one slow, close call near a pocket gets slow motion, a push-in and a heartbeat,
  // then "It dropped!" or "So close!". The outcome is known first by playing the rest of the shot out, so it only
  // happens when it really is close (it drops, or stops within a ball and a half of the pocket).
  if (phase === 'moving' && !cine) {
    if (!lip) for (const b of table.balls) {
      const sp = Math.hypot(b.vx, b.vy);
      if (b.potted || sp < 20 || sp > 330) continue;
      table.pk.forEach((p, i) => {
        const key = b.n + ':' + i;
        if (lip || lipTried.has(key) || !table.openPocket(i)) return;
        const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy);
        if (d > p.cap + R * 2.6 || dx * b.vx + dy * b.vy <= 0) return;
        lipTried.add(key);
        const sim = cloneTable(table), sb = sim.balls[table.balls.indexOf(b)];
        for (let n = 0; n < 4000 && sim.moving(); n++) sim.step();
        const drops = sb.potted && sim.shot.pots.some(q => q.ball === sb && q.pocket === i);
        if (drops || (!sb.potted && Math.hypot(sb.x - p.x, sb.y - p.y) < p.cap + R * 1.5)) lip = { n: b.n, i, drops, t: 0, beat: 0 };
      });
    }
    if (lip) {
      const b = table.balls.find(o => o.n === lip.n), p = table.pk[lip.i];
      lip.t += dt; lip.beat -= dt;
      if (lip.beat <= 0) { lip.beat = 0.5; tone(58, 0.16, 0.3, 'sine', 0.6, 0, 0); tone(52, 0.14, 0.22, 'sine', 0.6, 0.13, 0); buzz(12); }
      const done = b.potted || (!b.vx && !b.vy) || lip.t > 5;
      if (done) {
        const fy = clamp(p.y + (p.y < H / 2 ? 80 : -80), 60, H - 60), fxp = clamp(p.x, 100, W - 100);
        if (b.potted) { if (!round.trick) float(fxp, fy, 'It dropped!', '#2f6b4f', 28, 2); if (!round.trick) confettiBurst(60); fx.glow = 1; buzz([20, 30, 40]); }
        else { if (!round.trick) float(fxp, fy, 'So close!', '#b8553f', 26, 2); tone(330, 0.5, 0.06, 'triangle', 0.6, 0, 0.3); p.wobble = 1; fx.shake = 3; catStartle = 1; }
        lip = null;
      } else { slow = true; tk = 1.5; tx = (b.x + clamp(p.x, 0, W)) / 2; ty = (b.y + clamp(p.y, 0, H)) / 2; }
    }
  }
  // Fast-forward the dead time: a tap on the table (once the shot has rolled for 0.8 s) plays the rest at
  // 3×, and once everything is just creeping (under 35, after 2 s) it runs at 1.6× by itself. Otherwise the
  // table plays at PLAY (0.75×). Never during the slow-motion finish.
  if (phase === 'moving') movingT += dt;
  const creeping = phase === 'moving' && movingT > 2 && table.live().every(b => Math.hypot(b.vx, b.vy) < 35);
  const want = slow ? 0.25 : phase === 'replay' ? 0.45 : phase !== 'moving' ? 1 : ffwd ? 3 : creeping ? 1.6 : PLAY;
  timeScale = want > timeScale ? want : lerp(timeScale, want, Math.min(1, dt * 10));
  const ck = Math.min(1, dt * 5);
  cam.k = lerp(cam.k, tk, ck); cam.x = lerp(cam.x, tx, ck); cam.y = lerp(cam.y, ty, ck);
  if (phase === 'moving') {
    if (hitStop > 0) hitStop -= dt;   // a blink of freeze on big moments
    else { acc += dt * timeScale; while (acc >= DT) { table.step(); tgtStep(); acc -= DT; shotSteps++; } }
    const c = table.cue, last = curTrail?.pts[curTrail.pts.length - 1];
    if (curTrail && !c.potted && last && Math.hypot(c.x - last[0], c.y - last[1]) > 14) curTrail.pts.push([c.x, c.y]);
    if (shotRec && shotRec.length < 3000) shotRec.push([shotSteps * DT, c.uN ? NaN : c.x, c.y, c.potted ? 1 : 0, ...table.balls.flatMap(b => [b.uN ? NaN : b.x, b.y, b.potted ? 1 : 0])]);
    if (!table.moving() && !(cine && cine.hold > 0)) resolveShot();
  }
  if (rollGain && audio.state === 'running') {
    const v = phase === 'moving' && table ? Math.min(1, table.live().reduce((a, b) => a + Math.hypot(b.vx, b.vy), 0) / 2600) : 0;
    if (v !== frame.roll) {   // (only when it changes: not a new automation event every frame while all is still)
      frame.roll = v;
      rollGain.gain.setTargetAtTime(v * 0.11, audio.currentTime, 0.05);
      rollFilter.frequency.setTargetAtTime(180 + v * 320, audio.currentTime, 0.05);
    }
  }
  // the points total counts up rather than jumping
  if (hs && shownPts !== hs.points && !ptsHold) {
    const d = hs.points - shownPts;
    shownPts = Math.abs(d) < 3 ? hs.points : shownPts + Math.ceil(Math.abs(d) * Math.min(1, dt * 8)) * Math.sign(d);
    const el = document.getElementById('ptsVal');
    if (el) el.textContent = shownPts.toLocaleString();
    if (Math.abs(d) > 2 && audio && audio.currentTime - lastTick > 0.05) { lastTick = audio.currentTime; tone(1500 + Math.random() * 200, 0.012, 0.012, 'sine', 1, 0, 0); }
  }
  // the replay plays the recorded shot at about half speed, then the shot is scored as usual
  if (phase === 'replay') {
    replay.T += dt * replay.speed;
    if (replay.T >= replay.endT) { replay = null; replayed = true; phase = 'moving'; resolveShot(); }
  }
  // trick scoring: targets slide at the table's pace between shots (tgtStep moves them on physics time while the balls
  // roll), and the run's clock counts down only while you aim: not while the balls roll, the score tallies, the next
  // table deals in (its banner) or a card is open. At zero you get one last shot (lastShot).
  if (phase !== 'moving' && phase !== 'replay') tgtClock += dt * PLAY;
  if (round?.trick && !round.done && !lastShot && phase === 'aim' && !banner && !tally && !$('overlay').classList.contains('show')) {
    const was = trialLeft;
    trialLeft = Math.max(0, trialLeft - dt);
    if (trialLeft > 0 && trialLeft <= 10 && Math.ceil(was) !== Math.ceil(trialLeft)) sfx.clockTick(trialLeft);
    if (trialLeft <= 0) { lastShot = true; sfx.lastShot(); buzz([30, 40, 30]); }
  }
  if (round?.trick) updateClock();
  if (follow) follow.t += dt;
  tickDemo(dt); tickSpinDemo(dt);
  // a drawing error must never stop the game: log it and carry on with the next frame
  try { draw(t, dt); } catch (e) { console.error(e); }
}

resize();
// old ?seed= links open a practice run (counted), or today's game once practice is used up
const seedParam = new URLSearchParams(location.search).get('seed');
const firstVisit = !ls('dailybreak:seenHelp');
// ?trick: try trick scoring on today's course (or ?seed=) as an unranked round that uses no practice and saves nothing
if (trickFlag) newRound(seedParam || todayKey(), false);
else if (seedParam && practiceLeft() > 0) { usePractice(); newRound(seedParam, false); } else { newRound(todayKey(), true); track('open'); track(firstVisit ? 'opennew' : 'openback'); }
// the first time the page is hidden before today's first shot: how long they'd been here and on which screen
// (some come back and play later; this is one event per device per day)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'hidden' || !round || ls(`dailybreak:ev:${round.seed}:shot`)) return;
  const where = $('overlay').classList.contains('show') ? 'intro' : ls(`dailybreak:ev:${round.seed}:pull`) ? 'pulled' : 'table';
  track('left', { secs: Math.min(86400, Math.round(performance.now() / 1000)), where });
});
if (!ls('dailybreak:seenHelp') && !$('overlay').classList.contains('show')) showIntro();
requestAnimationFrame(frame);
