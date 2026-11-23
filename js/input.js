// input.js: pointer and keyboard input: table drag (toWorld), the aim strip, the spin ball, the pull-back cue,
// keys, the sound and help buttons, and resize (the canvas size and view).
// Relies on everything above (state.js, audio.js, game.js, ui.js); render.js at run time.

/* ----- input ----- */

let view = { s: 1, ox: 0, oy: 0, dpr: 1, cw: 1, ch: 1 };
function toWorld(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left - view.ox) / view.s, y: (e.clientY - r.top - view.oy) / view.s };
}
// On the table: tap a ball to target it, or drag anywhere to turn the cue. The drag is relative and
// geared down, so your thumb can stay well away from the line it's adjusting.
let drag = null;
stage.addEventListener('pointerdown', e => {
  ensureAudio();
  finishTally();   // a tap finishes a running tally (and still aims, targets or hurries the balls as usual)
  if (phase === 'moving') { if (movingT > 0.8 && !(cine && cine.hold > 0)) ffwd = true; return; }   // tap to hurry the balls along
  if (phase === 'replay') { replay.T = replay.endT; return; }   // tap to skip the replay
  if (phase !== 'aim') return;
  const p = toWorld(e), c = table.cue;
  drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, a: Math.atan2(p.y - c.y, p.x - c.x) };
  try { stage.setPointerCapture(e.pointerId); } catch {}
});
stage.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id || phase !== 'aim') return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
  drag.moved = true;
  const p = toWorld(e), c = table.cue, a = Math.atan2(p.y - c.y, p.x - c.x);
  let da = a - drag.a; da = Math.atan2(Math.sin(da), Math.cos(da));
  drag.a = a;
  // turn by how far the finger moved around the cue ball (0.08° per screen pixel), not by the angle it swept,
  // so it feels the same however near or far from the cue ball your thumb is
  const d = Math.hypot(p.x - c.x, p.y - c.y);
  if (d > R * 2) turnAim(da * d * view.s * 0.08 * Math.PI / 180);
});
stage.addEventListener('pointerup', e => {
  if (!drag || e.pointerId !== drag.id) return;
  const moved = drag.moved; drag = null;
  if (moved || phase !== 'aim') return;
  const p = toWorld(e);
  let bi = -1, bd = R * 3;   // generous, so a thumb can pick a ball
  table.balls.forEach((b, k) => { if (!b.potted) { const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < bd) { bd = d; bi = k; } } });
  const g = gimmes.find(o => o.bi === bi);
  if (g) { tapIn(g); return; }
  if (bi >= 0) { focusBall(bi); ls('dailybreak:tappedBall', '1'); }
});
stage.addEventListener('pointercancel', () => { drag = null; });

// The aim strip: swipe left or right like a scroll wheel. Slow swipes are very fine (AIM_FINE, 0.01° a pixel, so
// a thumb can place a long pot exactly); faster swipes gear up smoothly to AIM_GEAR_MAX× for big turns. A tap near
// either end nudges AIM_NUDGE. When the thumb lifts, the pixel or two a finger rolls as it comes off the glass is
// undone, so the aim stays where it was set. (Was 0.04° a pixel and 0.1° a tap until 15 Nov 2026: too coarse for
// long pots.)
// 23 Nov 2026, three fixes at the 0.01°-0.05° scale long pots need (a lit window can be 0.03° wide):
// - Gearing reads the speed over the last GEAR_MS (50 ms) of the drag, from the path between events, not one event's
//   pixels over its gap (with an 8 ms floor). The same 100 px swipe at 250 px/s turned 2.13° with events every 8 ms
//   but 1.99° with 2/14 ms jitter; now the same physical swipe turns the same however the events come.
// - A tap is a press that didn't move, except perhaps in the lift-off moment. It used to be anything under 4 px and
//   350 ms, with the nudge added on top of what the drag had already turned, so a deliberate 3 px drag (+0.03°) came
//   out +0.01° or +0.05° depending on the half of the strip. A tap now takes back anything it turned and nudges
//   exactly AIM_NUDGE; a drag turns exactly by its gearing and never also nudges.
// - Lift-off undo only takes back movement that starts in the last LIFT_MS (25 ms) before lift-off, at most LIFT_PX in
//   all, and only when the finger had been still for LIFT_STILL_MS (80 ms) before it. That is what rolling off looks
//   like: you settle on the line, hold, lift, and a pixel or two arrives in the same instant. A fine nudge made after a
//   pause takes longer than 25 ms, so it now stays (it was undone: two 2 px nudges gave 0.02°, not 0.04°); and
//   movement still going when you lift is part of the drag, so it stays too.
const AIM_FINE = 0.01, AIM_GEAR_MAX = 24, AIM_NUDGE = 0.02, GEAR_MS = 50, LIFT_MS = 25, LIFT_STILL_MS = 80, LIFT_PX = 3;
const aimGear = speed => AIM_FINE * Math.min(AIM_GEAR_MAX, 1 + (Math.max(0, speed - 120) / 120) ** 1.5);
const stripEl = $('strip');
let stripDrag = null;
// how far along its path (total pixels moved) the drag was at time t: straight lines between events, still before
// the first one kept
function stripPathAt(h, t) {
  for (let i = h.length - 1; i > 0; i--) {
    const a = h[i - 1], b = h[i];
    if (t >= a.t) return t >= b.t ? b.path : a.path + (b.path - a.path) * (t - a.t) / (b.t - a.t);
  }
  return h[0].path;
}
stripEl.addEventListener('pointerdown', e => {
  e.preventDefault(); ensureAudio();
  if (phase !== 'aim') return;
  // hist: the press and the moves since (trimmed to the last 200 ms and the one before); turned: everything this
  // press has turned the aim, so a tap can take it back
  stripDrag = { id: e.pointerId, x: e.clientX, x0: e.clientX, t0: e.timeStamp, moved: 0, turned: 0, hist: [{ t: e.timeStamp, path: 0, dx: 0, da: 0 }] };
  try { stripEl.setPointerCapture(e.pointerId); } catch {}
});
stripEl.addEventListener('pointermove', e => {
  const d = stripDrag;
  if (!d || e.pointerId !== d.id) return;
  const dx = e.clientX - d.x, h = d.hist, now = Math.max(e.timeStamp, h[h.length - 1].t);
  if (!dx) return;
  d.x = e.clientX; d.moved += Math.abs(dx);
  const m = { t: now, path: d.moved, dx, da: 0 };
  h.push(m);
  m.da = dx * aimGear((d.moved - stripPathAt(h, now - GEAR_MS)) * 1000 / GEAR_MS) * Math.PI / 180;
  while (h.length > 2 && now - h[1].t > 200) h.shift();
  d.turned += m.da; stripOff += dx; turnAim(m.da);
});
const endStrip = e => {
  const d = stripDrag;
  if (!d || e.pointerId !== d.id) return;
  stripDrag = null;
  if (e.type !== 'pointerup') return;
  // the lift-off tail: the moves in the last LIFT_MS (hist[0] is the press, or a move over 200 ms old: never in it)
  const h = d.hist, tail = h.filter(m => m.dx && e.timeStamp - m.t <= LIFT_MS), px = tail.reduce((a, m) => a + Math.abs(m.dx), 0);
  if (d.moved === px && px <= LIFT_PX && e.timeStamp - d.t0 < 350) {   // a tap: take back any roll, nudge exactly AIM_NUDGE
    const r = stripEl.getBoundingClientRect(), side = e.clientX - (r.left + r.width / 2);
    if (d.turned) { stripOff -= d.x - d.x0; turnAim(-d.turned); }
    if (Math.abs(side) > r.width * 0.2) { stripOff += Math.sign(side) * 6; turnAim(Math.sign(side) * AIM_NUDGE * Math.PI / 180); }
    return;
  }
  const before = h[h.length - 1 - tail.length];
  if (tail.length && px <= LIFT_PX && tail[0].t - before.t >= LIFT_STILL_MS) {
    stripOff -= tail.reduce((a, m) => a + m.dx, 0); turnAim(-tail.reduce((a, m) => a + m.da, 0));
  }
};
stripEl.addEventListener('pointerup', endStrip);
stripEl.addEventListener('pointercancel', endStrip);

// Spin: tap the little cue ball to cycle Stun, Follow, Draw.
function cycleSpin() {
  if (phase !== 'aim' || hold) return;
  const i = SPIN_SPOTS.findIndex(([y]) => spinKind(spinFor(y)) === spinKind(aim.spin));
  setSpot(SPIN_SPOTS[(i + 1) % SPIN_SPOTS.length][0]);
}
// Spin: drag the gold spot up (follow) or down (draw), left or right for side; a tap puts it where you tapped. The cue ball's
// path shows on the table while you drag, so you can see what the spin does.
const spinEl = $('spinBall'), spinFaceEl = $('spinFace');
let spinDrag = null;
const faceY = e => { const r = spinFaceEl.getBoundingClientRect(); return (e.clientY - (r.top + r.height / 2)) / (r.height / 2 - 7); };
const faceX = e => { const r = spinFaceEl.getBoundingClientRect(); return (e.clientX - (r.left + r.width / 2)) / (r.width / 2 - 7); };
spinEl.addEventListener('pointerdown', e => {
  e.preventDefault(); ensureAudio();
  if (phase !== 'aim' || hold) return;
  if (spinDemo) stopSpinDemo();
  ls('dailybreak:spinDemo', '1');
  spinDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: aim.spotX, y0: aim.spotY, moved: false, tapX: faceX(e), tapY: faceY(e) };
  try { spinEl.setPointerCapture(e.pointerId); } catch {}
  updateUI();
});
spinEl.addEventListener('pointermove', e => {
  const d = spinDrag;
  if (!d || d.id !== e.pointerId) return;
  const dx = e.clientX - d.x, dy = e.clientY - d.y;
  if (!d.moved && Math.hypot(dx, dy) < 4) return;
  d.moved = true;
  const before = strikeName(aim.spin) + sideName(aim.side);
  setSpot(d.y0 + dy / 90, true, d.x0 + dx / 90);
  if (strikeName(aim.spin) + sideName(aim.side) !== before) { sfx.click(); buzz(6); }
  const notch = Math.round(aim.spotY * 10);
  if (notch !== d.notch) { d.notch = notch; sfx.notch(900 - aim.spotY * 700); if (!notch) { tone(520, 0.04, 0.05, 'sine', 1, 0, 0); buzz(8); } }
});
const endSpin = e => {
  const d = spinDrag;
  if (!d || d.id !== e.pointerId) return;
  spinDrag = null;
  if (!d.moved && e.type === 'pointerup' && Math.hypot(d.tapX, d.tapY) < 1.1) setSpot(d.tapY, false, d.tapX);
  else updateUI();
};
spinEl.addEventListener('pointerup', endSpin);
spinEl.addEventListener('pointercancel', endSpin);

// The pull-back cue: put your thumb anywhere on it and drag down; the further you pull, the harder
// the shot (150 px is full power). While you hold, the cue tip wobbles over the cue ball in the
// close-up: let go when it's on the gold spot. Push back up to the top and let go to cancel.
const pullEl = $('pull'), PULL_PX = 150, MIN_PULL = 0.04;
let hold = null;
function startHold(id, y0, p0 = 0) {
  if (phase !== 'aim' || hold) return;
  finishTally();
  hold = { id, y0, kb: id == null };
  power = p0; swayT = Math.random() * 30;
  track('pull');
  if (!ls('dailybreak:pulled')) { ls('dailybreak:pulled', '1'); demoHand(false); }
  buzz(6); updateUI();
}
pullEl.addEventListener('pointerdown', e => {
  e.preventDefault(); ensureAudio();
  startHold(e.pointerId, e.clientY);
  if (hold) try { pullEl.setPointerCapture(e.pointerId); } catch {}
});
pullEl.addEventListener('pointermove', e => {
  if (!hold || hold.id !== e.pointerId) return;
  const was = power < MIN_PULL;
  setPower(clamp((e.clientY - hold.y0) / PULL_PX, 0, 1));
  if (was !== power < MIN_PULL) updateUI();
});
const endPull = e => { if (hold && hold.id === e.pointerId) letGo(e.type === 'pointerup'); };
pullEl.addEventListener('pointerup', endPull);
pullEl.addEventListener('pointercancel', endPull);
function letGo(fire) {
  const h = hold; hold = null;
  if (!h) return;
  if (!fire || power < MIN_PULL || phase !== 'aim') { power = lastPower; updateUI(); return; }
  release();
}

const actBtn = $('act');
actBtn.addEventListener('pointerdown', e => { e.preventDefault(); if (actBtn.classList.contains('show')) act(); });
addEventListener('keyup', e => { if (e.code === 'Space' && hold?.kb) { e.preventDefault(); letGo(true); } });
addEventListener('keydown', e => {
  if ($('overlay').classList.contains('show')) return;
  const deg = (e.shiftKey ? 1 : AIM_NUDGE) * Math.PI / 180;
  if (e.code === 'Space' || e.key === 'Enter') {
    e.preventDefault();
    if (e.repeat) return;
    if (phase === 'aim' && e.code === 'Space') startHold(null, 0, lastPower);   // hold Space, let go to shoot
    else if (actBtn.classList.contains('show')) act();
  }
  else if (hold?.kb && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); setPower(power + (e.key === 'ArrowDown' ? 0.05 : -0.05)); }
  else if (phase !== 'aim') return;
  else if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); if (!hold) setSpot(aim.spotY, false, aim.spotX + (e.key === 'ArrowRight' ? 0.1 : -0.1)); }
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const s = e.key === 'ArrowRight' ? 1 : -1; stripOff += s * 6; turnAim(s * deg); }
  else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); if (!hold) setSpot(aim.spotY + (e.key === 'ArrowUp' ? -0.1 : 0.1)); }
  else if (e.key === 's') cycleSpin();
  else if (e.key === 'p' && round?.trick) { finishTally(); showShotLog(); }   // the Points breakdown
  else if (e.key === 'Tab' || e.key === 'n') { e.preventDefault(); nextBall(); }
  else if (e.key === '+' || e.key === '=' || e.key === ']') { lastPower = power = clamp(lastPower + 0.05, 0.05, 1); updateUI(); }
  else if (e.key === '-' || e.key === '[') { lastPower = power = clamp(lastPower - 0.05, 0.05, 1); updateUI(); }
});
function setSoundBtns() {
  const st = muted ? 'off' : musicOn ? 'all' : 'fx';
  $('snd').textContent = { all: '🔊', fx: '🔉', off: '🔇' }[st];
  $('snd').title = { all: 'Sound: music and effects', fx: 'Sound: effects only', off: 'Sound: off' }[st];
}
$('snd').onclick = () => {
  if (!muted && musicOn) musicOn = false; else if (!muted) muted = true; else { muted = false; musicOn = true; }
  ls('dailybreak:muted', muted ? '1' : '0'); ls('dailybreak:music', musicOn ? '1' : '0');
  setSoundBtns(); ensureAudio();
  master?.gain.setTargetAtTime(muted ? 0 : 0.9, audio.currentTime, 0.05);
  musicBus?.gain.setTargetAtTime(musicOn ? 1 : 0, audio.currentTime, 0.4);
  if (musicOn && !muted) playChord();
  setTimeout(syncAudio, 300);   // suspend once the fade to silence is done (or resume, though ensureAudio already has)
};
$('help').onclick = () => { ensureAudio(); showHelp(); };
setSoundBtns();

function resize() {
  // (the timed trial draws at up to 1.5x: 44% fewer pixels a frame than 2x, still sharp on a phone; 23 Nov, phones
  // got hot. Par keeps 2x.)
  const r = stage.getBoundingClientRect(), dpr = Math.min(trickOn(todayKey()) ? 1.5 : 2, window.devicePixelRatio || 1);
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
  const s = Math.min(r.width / (W + 2 * RAIL + 16), r.height / (H + 2 * RAIL + 12));
  view = { s, dpr, cw: r.width, ch: r.height, ox: r.width / 2 - W / 2 * s, oy: r.height / 2 - H / 2 * s };
}
addEventListener('resize', resize);
// the controls can change height after load (fonts, labels), so watch the table area itself too
if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);


