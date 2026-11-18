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
// either end nudges AIM_NUDGE. When the thumb lifts, the last few pixels of drift (a finger rolls as it comes off the
// glass) are undone, so the aim stays where it was set. (Was 0.04° a pixel and 0.1° a tap until 15 Nov 2026: too
// coarse for long pots.)
const AIM_FINE = 0.01, AIM_GEAR_MAX = 24, AIM_NUDGE = 0.02, LIFT_MS = 60, LIFT_PX = 3;
const aimGear = speed => AIM_FINE * Math.min(AIM_GEAR_MAX, 1 + (Math.max(0, speed - 120) / 120) ** 1.5);
const stripEl = $('strip');
let stripDrag = null;
stripEl.addEventListener('pointerdown', e => {
  e.preventDefault(); ensureAudio();
  if (phase !== 'aim') return;
  stripDrag = { id: e.pointerId, x: e.clientX, t: e.timeStamp, t0: e.timeStamp, moved: 0, recent: [] };
  try { stripEl.setPointerCapture(e.pointerId); } catch {}
});
stripEl.addEventListener('pointermove', e => {
  const d = stripDrag;
  if (!d || e.pointerId !== d.id) return;
  const dx = e.clientX - d.x, speed = Math.abs(dx) / Math.max(0.008, (e.timeStamp - d.t) / 1000);
  const da = dx * aimGear(speed) * Math.PI / 180;
  d.x = e.clientX; d.t = e.timeStamp; d.moved += Math.abs(dx);
  d.recent.push({ t: e.timeStamp, dx, da }); while (d.recent.length && e.timeStamp - d.recent[0].t > LIFT_MS) d.recent.shift();
  stripOff += dx; turnAim(da);
});
const endStrip = e => {
  const d = stripDrag;
  if (!d || e.pointerId !== d.id) return;
  stripDrag = null;
  if (e.type === 'pointerup' && d.moved < 4 && e.timeStamp - d.t0 < 350) {
    const r = stripEl.getBoundingClientRect(), side = e.clientX - (r.left + r.width / 2);
    if (Math.abs(side) > r.width * 0.2) { stripOff += Math.sign(side) * 6; turnAim(Math.sign(side) * AIM_NUDGE * Math.PI / 180); }
    return;
  }
  // lift-off drift: a few pixels in the moment before the thumb came up are the finger rolling off, not a turn
  const tail = d.recent.filter(m => e.timeStamp - m.t <= LIFT_MS), px = tail.reduce((a, m) => a + Math.abs(m.dx), 0);
  if (e.type === 'pointerup' && tail.length && px <= LIFT_PX && d.moved > px) {
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
// prototype: P cycles P1 (close-up by the white ball) -> P2 (by the object ball) -> off (reloads; the hole carries on
// from where it was saved)
$('proto').classList.toggle('off', !PROTO);
$('proto').textContent = PROTO ? 'P' + PROTO_MODE : 'P';
$('proto').title = ['Prototype off (the live game)', 'Prototype 1: close-up by the white ball', 'Prototype 2: close-up by the object ball'][PROTO_MODE] + ' · tap to change';
$('proto').onclick = () => { ls('dailybreak:proto', String((PROTO_MODE + 1) % 3)); location.reload(); };
setSoundBtns();

function resize() {
  const r = stage.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
  const s = Math.min(r.width / (W + 2 * RAIL + 16), r.height / (H + 2 * RAIL + 12));
  view = { s, dpr, cw: r.width, ch: r.height, ox: r.width / 2 - W / 2 * s, oy: r.height / 2 - H / 2 * s };
}
addEventListener('resize', resize);
// the controls can change height after load (fonts, labels), so watch the table area itself too
if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);


