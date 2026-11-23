// ui.js: the HTML around the table: header and info bar (updateUI), spin ball, aim/spin lessons and demos,
// meter and aim strip, the intro/help/result cards, practice runs, day stats, sharing and feedback links.
// Relies on core.js, state.js, audio.js and game.js; render.js at run time.

/* ----- UI ----- */

// Small line icons in place of emoji (23 Nov playtest: avoid the phone's own emoji where possible). Drawn in
// currentColor at the text's size (.ic in index.html).
const ICON = {
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  ball: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.5"/>',
  mult: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  pull: '<path d="M12 4v14M6 12l6 6 6-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  flag: '<path d="M6 21V4h11l-3 4 3 4H6"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  tilt: '<path d="M3 18L21 8M3 18h18"/>',
  barrier: '<rect x="3" y="8" width="18" height="6" rx="1"/><path d="M7 14v6M17 14v6"/>',
  tunnel: '<path d="M4 20v-8a8 8 0 0116 0v8M3 20h18"/>',
  spark: '<path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l2.5 2.5M15.5 15.5L18 18M18 6l-2.5 2.5M8.5 15.5L6 18"/>',
  shape: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/>',
  ffwd: '<path d="M3 6l8 6-8 6zM12 6l8 6-8 6z"/>',
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  sndAll: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9a4 4 0 010 6M19 6.5a8 8 0 010 11"/>',
  sndFx: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9a4 4 0 010 6"/>',
  sndOff: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 9.5l5 5M21.5 9.5l-5 5"/>',
};
const ic = name => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;

// The header: the hole you're on, its par and your score (trick scoring: the hole and your points, which count up).
function renderCard9() {
  if (round.trick) {
    // built once and updated in place, so the Points chip keeps its tip pulse and doesn't jump about (23 Nov sweep)
    // the timed trial: the clock where the hole was, and Points
    if (!$('ptsChip')) $('card9').innerHTML = `<div class="c cur clock" id="clockChip"><b id="clockVal"></b></div><button class="c score" id="ptsChip" title="How your points added up (P)"><span class="lab">Points</span> <b id="ptsVal"></b><i>ⓘ</i></button>`;
    updateClock();
    if (!ptsHold || !$('ptsVal').textContent) $('ptsVal').textContent = fmtPts(shownPts);
    return;
  }
  $('card9').innerHTML = `<div class="c cur lvl"><b>Hole ${Math.min(round.level + 1, HOLES)}/${HOLES}</b></div><div class="c">Par <b>${parOf(round.level)}</b></div><div class="c score">Score <b>${toPar(parTotal())}</b></div>`;
}
function updateUI() {
  if (!table) return;
  const left = table.remaining(), n = Math.max(0, Math.min(strokes, capOf(round.level)) - holeBonus);
  $('iHole').innerHTML = `Hole ${round.level + 1} · par ${parOf(round.level)}<b>${n} stroke${n === 1 ? '' : 's'}<small>${left} left</small></b>`;
  if (round.trick) {
    $('iHole').innerHTML = `Table ${round.level + 1}<b>${left} ball${left === 1 ? '' : 's'} left</b>`;
    if (!tally) meterShown = roundMult(hs.mult);   // (held while a tally applies the old one)
    updateStreakMeter(meterShown);
  } else { $('iLie').innerHTML = `Score<b>${toPar(parTotal())}</b>`; $('iLie').classList.remove('max'); $('iLie').style.removeProperty('--heat'); }
  // (tilted tables went on 25 Nov: the trial shows the tables cleared there instead)
  if (round.trick) $('iTilt').innerHTML = `Cleared<b>${round.cards.length}</b>`;
  else $('iTilt').innerHTML = `Tilt<b>${hole.tilt.mag ? `${TILT_ARROWS[hole.tilt.dir]} ${Math.max(1, Math.round(hole.tilt.mag / 12))}°` : 'Flat'}</b>`;
  const b = $('act'), labels = {};   // no button: a cleared level moves on and the result card opens by themselves
  b.classList.toggle('show', !!labels[phase]); b.textContent = labels[phase] || '';
  const aiming = phase === 'aim';
  $('strip').classList.toggle('off', !aiming); $('rowB').classList.toggle('off', !aiming); $('pull').classList.toggle('off', !aiming && !hold);
  $('hint').innerHTML = phase === 'moving' ? 'Tap the table to speed up' : !aiming ? '' : hold ? (power < MIN_PULL ? 'Pull down · let go here to cancel' : 'Let go on the gold spot') :
    gimmes.length ? 'Tap the glowing ball<b>Tap in</b>' : round.trick ? `Shot<b>${strokes + 1}</b>` : `Stroke<b>${strokes + 1}</b><small>pick up after ${capOf(round.level)}</small>`;
  updateMeter(); updateAimUI(); updateSpinBall();
}
// The timed trial's clock: m:ss of aiming time left, red for the last ten seconds, "Last shot" once it's out.
function updateClock() {
  const el = $('clockVal');
  if (!el) return;
  const txt = lastShot ? 'Last shot' : `${Math.floor(Math.ceil(trialLeft) / 60)}:${String(Math.ceil(trialLeft) % 60).padStart(2, '0')}`;
  if (el.textContent !== txt) el.textContent = txt;
  $('clockChip').classList.toggle('urgent', lastShot || trialLeft <= 10);
  // and a thin bar under the header that drains with it (23 Nov: the clock should be more obvious)
  const bar = $('clockBar');
  bar.hidden = false; bar.classList.toggle('urgent', lastShot || trialLeft <= 10);
  // (a transform, set only when it has moved a visible amount: restyling its width every frame kept the page busy)
  const k = Math.round(clamp(trialLeft / TRIAL_S, 0, 1) * 400) / 400;
  if (bar.k !== k) { bar.k = k; bar.firstChild.style.transform = `scaleX(${k})`; }
}
// Time call-outs (23 Nov playtest: say how long is left through the run, not only at the end): a big label drops
// in at 90, 60, 30 and 10 seconds and on the last shot, holds a moment and fades. Near the top of the
// table, just under the info bar, and never in the way of a tap (pointer-events: none).
const TIME_CALLS = { 90: '90 seconds', 60: '1 minute left', 30: '30 seconds', 10: '10 seconds!', 0: 'Last shot!' };
function timeCall(s) {
  document.getElementById('timeCall')?.remove();
  const el = document.createElement('div'), info = $('info'), r = info ? info.getBoundingClientRect() : null;
  el.id = 'timeCall'; el.className = s <= 10 ? 'urgent' : ''; el.textContent = TIME_CALLS[s];
  el.style.top = `${(r ? r.bottom : 90) + 22}px`;
  document.body.appendChild(el);
  sfx.timeCall(s); buzz(s <= 10 ? [20, 40, 20] : 15);
  setTimeout(() => el.remove(), 2000);
}
// Trick scoring's multiplier meter (22 Nov): the multiplier, and a bar under it that fills from x1 to x5; the whole
// cell heats up gradually on the way (--heat, index.html). Built once and updated, so its
// animations aren't restarted every update.
function updateStreakMeter(m) {
  const el = $('iLie');
  if (!$('smX')) el.innerHTML = 'Mult<b><span id="smX"></span></b><span class="smbar"><i id="smFill"></i></span>';   // (was "Streak" until 23 Nov)
  // the number counts to its new value in tenths rather than jumping (23 Nov playtest), and the cell heats up (--heat)
  const sx = $('smX');
  if (sx.to !== m) {
    const from = sx.val ?? m, t0 = performance.now(), ms = Math.min(500, 120 + Math.abs(m - from) * 250);
    sx.to = m;
    const show = v => { sx.val = v; sx.textContent = fmtMult(v); };
    const step = now => {
      if (sx.to !== m) return;   // a newer value took over
      const k = clamp((now - t0) / ms, 0, 1), e = 1 - (1 - k) ** 3;
      show(k < 1 ? Math.round((from + (m - from) * e) * 10) / 10 : m);
      if (k < 1) requestAnimationFrame(step);
    };
    if (from === m) show(m); else requestAnimationFrame(step);
  }
  el.style.setProperty('--heat', clamp((m - 1) / 4, 0, 1).toFixed(3));
  sx.parentElement.classList.toggle('hot', m > 1);
  $('smFill').style.width = `${Math.min(1, (m - 1) / 4) * 100}%`;   // (no cap on the multiplier; the bar is full at x5)
  el.classList.toggle('max', m >= 3);
}
// Why the multiplier just changed: small tags under the meter ("+0.5 pot · +0.1 bank · +0.2 golden", or "½ miss"),
// fading in and out on their own.
function showMultWhy(bits, down = false) {
  const el = $('iLie');
  el.querySelector('.mwhy')?.remove();
  const w = document.createElement('div');
  w.className = `mwhy${down ? ' down' : ''}`;
  w.innerHTML = bits.map(b => `<span>${b}</span>`).join('');
  el.appendChild(w);
  setTimeout(() => w.remove(), 2600);
}
// a cause landing in the meter: it pulses and glows for a moment
function meterGain() {
  const el = $('iLie');
  el.classList.remove('gain'); void el.offsetWidth; el.classList.add('gain');
}
// a reset: the meter shakes and flashes red as it drains
function crackStreakMeter() {
  const el = $('iLie');
  el.classList.remove('crack'); void el.offsetWidth; el.classList.add('crack');
  setTimeout(() => el.classList.remove('crack'), 700);
}
const SPIN_SPOTS = [[0, 'Stun', 'stops dead'], [-0.5, 'Follow', 'rolls on'], [0.5, 'Draw', 'comes back']];
function updateSpinBall() {
  const a = Math.abs(aim.spotY), name = strikeName(aim.spin), sd = sideName(aim.side);
  $('spinDot').style.top = `${50 + aim.spotY * 50}%`; $('spinDot').style.left = `${50 + aim.spotX * 50}%`;
  const what = name === 'Stun' ? 'stops dead' : `${a > 0.32 ? 'strong' : 'light'} · ${name === 'Follow' ? 'rolls on' : 'comes back'}`;
  $('spinTxt').innerHTML = `<b>${name}${sd ? ` · ${sd}` : ''}</b><small>${what}</small>${sd ? `<small>bends ${sd} off cushions</small>` : ''}${spinTouched ? '' : '<small>drag the gold spot</small>'}`;
  $('spinBall').classList.toggle('drag', !!spinDrag);
  spinPulse();
}
// The spin ball pulses whenever the pull-back path shows a scratch.
let scratchAhead = false, scratchSaid = '';
function spinPulse() {
  const on = phase === 'aim' && !spinDrag && scratchAhead;
  $('spinFace').classList.toggle('pulse', on);
}
// The first shot's aim lesson (strike.t runs from -AIM_T up to 0): the guide line shows where they aimed, a
// hand swipes the aim strip and the line turns onto the pocket, then the strike carries on as usual.
function aimLesson(was, now) {
  const L = strike.lesson, k = now + AIM_T, g = clamp((k - AIM_REST) / AIM_GLIDE, 0, 1), e = g * g * (3 - 2 * g);
  const turn = Math.atan2(Math.sin(L.to - L.from), Math.cos(L.to - L.from)), dir = Math.sign(turn) || 1;   // the short way round
  const at = (t0) => was + AIM_T < t0 && k >= t0;
  if (at(0.05)) { const hit = trace(table, table.cue.x, table.cue.y, Math.cos(L.from), Math.sin(L.from)); const b = hit.ball || table.balls[aim.bi]; float(clamp(b.x, 90, W - 90), clamp(b.y - 46, 40, H - 40), 'This line misses', '#b8553f', 18, 2.2); }
  if (at(AIM_REST)) float(W / 2, clamp(table.cue.y + 60, 60, H - 60), 'Swipe the aim strip to line it up', '#2f6b4f', 18, 3.4);
  if (at(AIM_REST + AIM_GLIDE)) { const b = table.balls[aim.bi]; float(clamp(b.x, 90, W - 90), clamp(b.y - 46, 40, H - 40), 'Lined up!', '#2f6b4f', 20, 2.0); sfx.chime(); }
  if (now < 0) {
    aim.angle = L.from + turn * e;
    stripOff = L.strip + dir * e * 140;
    const hand = $('aimHand'), w = $('strip').clientWidth || 300;
    if (hand) { hand.style.transform = `translateX(${w / 2 - 22 + dir * (e - 0.5) * w * 0.5}px)`; hand.style.opacity = g > 0 && g < 1 ? 1 : k < AIM_REST ? Math.min(1, k / 0.3) * 0.6 : Math.max(0, 1 - (k - AIM_REST - AIM_GLIDE) / 0.3); }
    if (Math.floor(e * 20) !== Math.floor(clamp((was + AIM_T - AIM_REST) / AIM_GLIDE, 0, 1) * 20)) sfx.notch?.(900 + e * 300);
    $('strip').classList.remove('off');   // keep the strip lit while it's being shown
    updateAimUI();
  } else if (was < 0) { aim.angle = L.to; $('aimHand')?.remove(); $('strip').classList.add('off'); updateAimUI(); }
}
// Hole 2, first shot, until the player first touches the spin ball: the cue ball's path after contact is drawn
// while a hand drags the gold spot down (draw: the path comes back) and up (follow: it rolls on), on a loop.
let spinDemo = null;
function spinDemoWanted() {
  if (round?.trick) return false;   // no spin demo under trick scoring (23 Nov playtest: annoying)
  return phase === 'aim' && !hold && !spinDrag && round?.level === 1 && strokes === 0 && !ls('dailybreak:spinDemo') && !$('overlay').classList.contains('show') && !banner;
}
function startSpinDemo() {
  spinDemo = { t: 0, y0: aim.spotY };
  $('spinFace').insertAdjacentHTML('beforeend', '<div id="spinHand"><i class="touch"></i></div>');
}
function stopSpinDemo() {
  if (!spinDemo) return;
  $('spinHand')?.remove();
  aim.spotY = spinDemo.y0; aim.spin = spinFor(aim.spotY); spinDemo = null; updateUI();
}
function tickSpinDemo(dt) {
  if (spinDemoWanted() !== !!spinDemo) spinDemoWanted() ? startSpinDemo() : stopSpinDemo();
  if (!spinDemo) return;
  spinDemo.t += dt;
  // stun, slide to draw, hold, slide to follow, hold, back to stun
  const k = spinDemo.t % SPIN_LOOP, seg = (a, b) => { const g = clamp((k - a) / (b - a), 0, 1); return g * g * (3 - 2 * g); };
  const y = k < 1.2 ? 0 : k < 2.2 ? 0.45 * seg(1.2, 2.2) : k < 3.4 ? 0.45 : k < 4.6 ? lerp(0.45, -0.45, seg(3.4, 4.6)) : k < 5.6 ? -0.45 : lerp(-0.45, 0, seg(5.6, 6.4));
  aim.spotY = y; aim.spin = spinFor(y);
  updateSpinBall();
  const hand = $('spinHand');
  if (hand) hand.style.top = `${50 + y * 50}%`;
  spinDemo.say = Math.abs(y) < 0.1 ? 'Drag the gold spot: watch where the white ball goes' : y > 0 ? 'Down is draw: the white ball comes back' : 'Up is follow: the white ball rolls on';
}
// The first time a shot would scratch (after the first shot), pause it: show the white ball going in, then a hand
// drags the gold spot to a spin that keeps it out, and the shot plays with that spin. Once ever.
function scratchRescue(angle, ct) {
  if (ls('dailybreak:scratchSaved') || !ls('dailybreak:firstShot')) return null;
  const base = simulate(table, angle, ct.power, ct.spin, null, ct.side);
  if (!base.shot.scratch || !base.shot.firstHit) return null;
  const potted = base.shot.pots.map(p => p.ball.n).sort().join();
  for (const y of [0.45, 0.25, 0, -0.25, -0.45]) {
    if (Math.abs(y - aim.spotY) < 0.1) continue;
    const s = simulate(table, angle, ct.power, spinFor(y), null, ct.side);
    if (!s.shot.scratch && s.shot.pots.map(p => p.ball.n).sort().join() === potted) return { fromY: aim.spotY, toY: y, at: [base.cue.x, base.cue.y] };
  }
  return null;
}
function spinLesson(was, now) {
  const L = strike.spinLesson, k = now + SPIN_T, g = clamp((k - SPIN_REST) / SPIN_GLIDE, 0, 1), e = g * g * (3 - 2 * g);
  const at = t0 => was + SPIN_T < t0 && k >= t0;
  if (at(0.05)) float(clamp(L.at[0], 100, W - 100), clamp(L.at[1] + (L.at[1] < H / 2 ? 50 : -50), 40, H - 40), 'The white ball goes in', '#b8553f', 18, 2.2);
  if (at(SPIN_REST)) float(W / 2, clamp(table.cue.y + 60, 60, H - 60), L.toY > 0.1 ? 'Draw it back with spin' : L.toY < -0.1 ? 'Follow through with spin' : 'Stun it dead with spin', '#2f6b4f', 18, 2.6);
  if (at(SPIN_REST + SPIN_GLIDE)) { float(clamp(L.at[0], 100, W - 100), clamp(L.at[1] + (L.at[1] < H / 2 ? 50 : -50), 40, H - 40), 'Spin keeps it out!', '#2f6b4f', 20, 2.0); sfx.chime(); }
  if (now < 0) {
    aim.spotY = lerp(L.fromY, L.toY, e); aim.spin = spinFor(aim.spotY);
    updateSpinBall();
    const hand = $('spinHand');
    if (hand) { hand.style.top = `${50 + aim.spotY * 50}%`; hand.style.opacity = k < SPIN_REST ? Math.min(1, k / 0.4) : Math.max(0.0, 1 - Math.max(0, k - SPIN_REST - SPIN_GLIDE) / 0.6); }
    $('rowB').classList.remove('off');   // keep the spin ball lit while it's being shown
  } else if (was < 0) { $('spinHand')?.remove(); $('rowB').classList.add('off'); updateSpinBall(); }
}
// First shot ever: a hand drags the pull cue down and lets go, on a loop, with the cue on the table pulling
// back in step, until the player touches the pull cue themselves.
const DEMO_T = 3.3, DK = DEMO_T / 2.2;   // DK stretches the loop's steps
let demo = null;
function demoHand(on) {
  const el = $('pull');
  if (on && !demo) {
    el.insertAdjacentHTML('beforeend', '<div id="demoHand"><i class="touch"></i></div><div id="demoTip">Drag the cue down, then let go</div>');
    el.classList.add('demo'); demo = { t: 0 };
  } else if (!on && demo) {
    $('demoHand')?.remove(); $('demoTip')?.remove(); el.classList.remove('demo'); demo = null; updateMeter();
  }
}
// how far the demo has pulled (0-1) at time t into its loop, and whether the hand is pressing
function demoPull(t) {
  const k = t % DEMO_T;
  if (k < 0.35 * DK) return { p: 0, down: k > 0.2 * DK };
  if (k < 1.25 * DK) return { p: 0.55 * (1 - (1 - (k - 0.35 * DK) / (0.9 * DK)) ** 2), down: true };
  if (k < 1.55 * DK) return { p: 0.55, down: true };
  return { p: 0, down: false };
}
function tickDemo(dt) {
  const want = phase === 'aim' && !hold && round?.level === 0 && !ls('dailybreak:pulled') && !$('overlay').classList.contains('show');
  if (want !== !!demo) demoHand(want);
  if (!demo) return;
  demo.t += dt;
  const { p, down } = demoPull(demo.t), h = $('pull').clientHeight || 120, k = demo.t % DEMO_T;
  const fade = k > 1.55 * DK ? Math.max(0, 1 - (k - 1.55 * DK) / (0.3 * DK)) : k < 0.2 * DK ? k / (0.2 * DK) : 1;
  const hand = $('demoHand');
  if (hand) { hand.style.transform = `translateY(${8 + p * (h - 60)}px) scale(${down ? 0.92 : 1.05})`; hand.style.opacity = fade; }
  // the stick and fill in the control move with the hand, as they do on a real pull
  $('pullCue').style.transform = `translateY(${10 + p * (h - 40)}px)`;
  $('pullFill').style.height = `${p * 100}%`;
}
// The pull-back cue: the stick slides down the track as power loads.
function updateMeter() {
  const el = $('pull'), h = el.clientHeight || 120, p = hold ? power : 0;
  $('pullCue').style.transform = `translateY(${10 + p * (h - 40)}px)`;
  $('pullFill').style.height = `${p * 100}%`;
  $('pullLab').innerHTML = hold && power >= MIN_PULL ? `${Math.round(power * 100)}%<br><small>${paceName(power)}</small>` : 'PULL<br>↓';
  el.classList.toggle('pulse', phase === 'aim' && !hold && strokes === 0 && round.level === 0);
}
let stripOff = 0;
function updateAimUI() {
  $('stripFace').style.backgroundPosition = `${stripOff}px 0`;
  const lesson = phase === 'strike' && strike?.t < 0, o = phase === 'aim' || lesson ? aimOffset() : 0, a = Math.abs(o);
  $('stripVal').innerHTML = phase !== 'aim' && !lesson ? 'Aim' : `${a < 0.005 ? 'Centre' : `${a.toFixed(2)}° ${o > 0 ? 'right' : 'left'}`}<small>swipe to aim</small>`;
}

// Today's finished ranked round (this one, or the one saved on this device), or null if it isn't done yet.
function todaysResult() {
  if (trickFlag) return round.done ? round : null;
  if (round.ranked && isDailySeed(round.seed) && round.done) return round;
  try { const r = JSON.parse(ls(parKey(todayKey()))); if (Array.isArray(r?.cards)) return { seed: todayKey(), ...r }; } catch {}
  return null;
}
// The link in the share text is always the plain site, so friends land in today's real game.
const SITE_URL = 'https://dailybreak.app/';   // keep in step with the meta tags and HOST in src/worker.js
function gameUrl() { return location.protocol.startsWith('http') ? location.origin + location.pathname : SITE_URL; }
// The timed run's share card (23 Nov): a 1080x1350 image in the night arcade look: the date, the score, badges for
// the best multiplier, tables and best shot, the multiplier strip as bars, the rank and the address. Drawn on a
// canvas once the result card is up (and again when the rank comes in), kept as a File for the share sheet.
const shareCard = { file: null, url: null };
async function prepShareCard() {
  if (!round?.trick || !round.done && phase !== 'over') return;
  try {
    await Promise.all(['400 120px Bungee', "700 40px 'Chakra Petch'"].map(f => document.fonts.load(f)));
    const c = drawShareCard(round), blob = await new Promise(res => c.toBlob(res, 'image/png'));
    if (!blob) return;
    if (shareCard.url) URL.revokeObjectURL(shareCard.url);
    shareCard.file = new File([blob], `daily-break-${round.seed}.png`, { type: 'image/png' });
    shareCard.url = URL.createObjectURL(blob);
  } catch (e) { console.error('share card', e); }
}
// "Copy image": the card onto the clipboard, to paste into any chat (23 Nov playtest). Where the browser can put an
// image there (Safari and Chrome can; the card is made beforehand, so the copy happens inside the tap).
const canCopyImage = () => !!(window.ClipboardItem && navigator.clipboard?.write);
async function copyShareCard(b) {
  const done = t => { b.textContent = t; setTimeout(() => { b.textContent = 'Copy image'; }, 1800); };
  try {
    const blob = shareCard.file || new Promise((res, rej) => prepShareCard().then(() => shareCard.file ? res(shareCard.file) : rej(new Error('no card'))));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    done('Copied!');
  } catch (e) { console.error('copy image', e); done('Couldn’t copy'); }
}
function saveShareCard(b) {
  if (!shareCard.url) { b.textContent = 'One moment…'; prepShareCard().then(() => { b.textContent = 'Save image'; if (shareCard.url) saveShareCard(b); }); return; }
  const a = document.createElement('a'); a.href = shareCard.url; a.download = shareCard.file.name; document.body.appendChild(a); a.click(); a.remove();
}
function drawShareCard(r) {
  const Wc = 1080, Hc = 1350, c = document.createElement('canvas'); c.width = Wc; c.height = Hc;
  const g = c.getContext('2d'), DISP = 'Bungee, sans-serif', LAB = "'Chakra Petch', monospace";
  const PINK = '#ff3d8b', CYAN = '#35e0e8', AMBER = '#ffc94a', PURPLE = '#7b5cff', INK = '#f4efff', HARD = '#05040c';
  g.fillStyle = '#120f24'; g.fillRect(0, 0, Wc, Hc);
  // a faint table: the felt's blue and its neon trim, framing the card
  g.fillStyle = '#16294a'; g.beginPath(); g.roundRect(70, 70, Wc - 140, Hc - 140, 48); g.fill();
  g.lineWidth = 8; g.strokeStyle = PINK; g.stroke();
  g.lineWidth = 4; g.strokeStyle = CYAN; g.beginPath(); g.roundRect(100, 100, Wc - 200, Hc - 200, 32); g.stroke();
  g.fillStyle = '#05040c'; for (const [x, y] of [[70, 70], [Wc - 70, 70], [70, Hc - 70], [Wc - 70, Hc - 70], [70, Hc / 2], [Wc - 70, Hc / 2]]) { g.beginPath(); g.arc(x, y, 34, 0, Math.PI * 2); g.fill(); g.lineWidth = 5; g.strokeStyle = PINK; g.stroke(); }
  const text = (s, x, y, font, col, align = 'center', shadow = 0) => {
    g.font = font; g.textAlign = align; g.textBaseline = 'alphabetic';
    if (shadow) { g.fillStyle = HARD; g.fillText(s, x + shadow, y + shadow); }
    g.fillStyle = col; g.fillText(s, x, y);
  };
  const fit = (s, font, size, maxW) => { g.font = `${font.replace('SZ', size)}`; while (g.measureText(s).width > maxW && size > 20) { size -= 4; g.font = font.replace('SZ', size); } return font.replace('SZ', size); };
  text('DAILY BREAK', Wc / 2, 230, `400 84px ${DISP}`, PINK, 'center', 6);
  text(isDailySeed(r.seed) ? dayLabel(r.seed).toUpperCase() : 'PRACTICE RUN', Wc / 2, 290, `700 40px ${LAB}`, CYAN);
  const pts = fmtPts(r.points || 0);
  text(pts, Wc / 2, 500, fit(pts, `400 SZpx ${DISP}`, 190, Wc - 260), AMBER, 'center', 10);
  text('POINTS', Wc / 2, 560, `700 38px ${LAB}`, INK);
  // badges: best multiplier, tables, best shot
  const best = r.bestShot, n = tablesCleared(r), badges = [['BEST', fmtMult(r.bestMult || 1), PINK, '#fff'], ['TABLES', String(n), PURPLE, '#fff'], ...(best ? [['BEST SHOT', fmtPts(best.pts), AMBER, '#120f24']] : [])];
  const bw = 250, gap = 26, bx0 = Wc / 2 - (badges.length * bw + (badges.length - 1) * gap) / 2;
  badges.forEach(([lab, val, bg, fg], k) => {
    const x = bx0 + k * (bw + gap), y = 620;
    g.fillStyle = HARD; g.beginPath(); g.roundRect(x + 8, y + 8, bw, 150, 26); g.fill();
    g.fillStyle = bg; g.beginPath(); g.roundRect(x, y, bw, 150, 26); g.fill();
    text(lab, x + bw / 2, y + 50, `700 30px ${LAB}`, fg);
    text(val, x + bw / 2, y + 122, fit(val, `400 SZpx ${DISP}`, 64, bw - 30), fg);
  });
  // the multiplier strip as bars, amber at x1 to pink at the top
  const log = Array.isArray(r.multLog) ? r.multLog : [], bars = multStrip(log, 30);
  if (bars) {
    const lv = [...bars].map(ch => STRIP_BARS.indexOf(ch)), x0 = 170, w = Wc - 340, bwid = Math.min(46, w / lv.length), bgap = bwid * 0.22, top = 860, h = 190;
    const sx = x0 + (w - lv.length * bwid) / 2;
    lv.forEach((l, k) => {
      const bh = 18 + (h - 18) * l / 7, x = sx + k * bwid, y = top + h - bh;
      g.fillStyle = l >= 6 ? PINK : l >= 3 ? '#ff7a5c' : AMBER; g.beginPath(); g.roundRect(x, y, bwid - bgap, bh, 6); g.fill();
    });
    text('MULTIPLIER, SHOT BY SHOT', Wc / 2, top + h + 50, `700 28px ${LAB}`, '#9d94c2');
  }
  const rank = trickRankLine(r);
  if (rank) text(rank.toUpperCase(), Wc / 2, 1175, fit(rank.toUpperCase(), `700 SZpx ${LAB}`, 44, Wc - 280), CYAN);
  text('DAILYBREAK.APP', Wc / 2, 1240, `400 40px ${DISP}`, INK);
  return c;
}
const canNativeShare = () => !!navigator.share && matchMedia('(pointer: coarse)').matches;
async function shareResult(b) {
  const text = shareText();
  if (canNativeShare()) {
    // the timed run: the image card goes with the text when the phone can share files (it's made beforehand, so the
    // share starts inside the tap: iOS refuses one that waits on anything)
    const file = round?.trick && shareCard.file;
    try { await navigator.share(file && navigator.canShare?.({ files: [file] }) ? { text, files: [file] } : { text }); } catch {}
    return;
  }
  try { await navigator.clipboard.writeText(text); b.textContent = 'Copied!'; }
  catch { b.textContent = 'Select the text to copy'; }
}
// trick scoring's intro and the scoring part of its help (22 Nov: the par wording was wrong for it)
const TRICK_INTRO = `
    <div class="k mono">Daily Break · daily pool</div>
    <h2>Two minutes. Pot with style.</h2>
    <div class="howto">
      <p>${ic('clock')}You have <b>2 minutes</b> of aiming time: the clock starts with your first shot and stops while the balls roll. Clear a table and the next one deals in.</p>
      <p>${ic('ball')}Every pot is 100 points. Tricks add more: a bank, a combination, two in one, a moving target, a long pot…</p>
      <p>${ic('mult')}Each pot raises your <b>multiplier</b>, and tricks raise it faster. A miss halves it; a foul resets it.</p>
      <p>${ic('pull')}Pull the cue down and let go to shoot. Tap <b>?</b> any time for the full guide.</p>
    </div>
    <div class="row"><button class="btn primary" data-close>Let's play</button></div>`;
const TRICK_HELP = `
      <p>${ic('clock')}<b>A two-minute run.</b> The clock (top left) starts with your first shot and counts only while you're aiming: it stops while the balls roll, the score adds up and the next table deals in. Clear a table and the next one comes: one ball, then two, then three, with new shapes and things in the way. When the clock runs out you get <b>one last shot</b>. Everyone plays the same tables each day.</p>
      <p>${ic('ball')}<b>Points:</b> every pot is <b>100</b>. <b>Tricks</b> add to a shot that pots: <b>+200</b> each for a <b>bank</b> (the ball comes off a cushion), a <b>combination</b> (potted by another ball), a <b>cannon</b> (the cue ball hits two balls before one drops), <b>two or three in one</b>, a pot through a <b>tunnel</b>, or a ball rolling through a moving <b>target</b> ring before anything drops; <b>+100</b> for a <b>kick</b> (the cue ball hits a cushion first). A <b>long pot</b>, from more than halfway down the table to its pocket, adds <b>+150</b> (it doesn't raise the multiplier). The first pot into a table's <b>golden pocket</b> doubles the shot.</p>
      <p>${ic('mult')}<b>Multiplier:</b> every shot that pots raises it, by 0.5, plus 0.1 for each trick and 0.2 for the golden pocket, with no limit, and the shot is then multiplied by the new value. A <b>miss halves</b> what you've built above ×1; a <b>foul</b> (a scratch, or hitting nothing) resets it to ×1 and scores nothing.</p>
      <p>${ic('info')}Tap <b>Points</b> at the top (or press P) to see how each shot added up.</p>`;
function showIntro() {
  if (round?.trick) { $('card').innerHTML = TRICK_INTRO; $('overlay').classList.add('show'); return; }
  $('card').innerHTML = `
    <div class="k mono">Daily Break · daily pool</div>
    <h2>Six holes. Fewest shots wins.</h2>
    <div class="howto">
      <p>${ic('flag')}Pool scored like golf. Hole 1 has one ball, hole 2 two, then three a hole, with something in the way: ${featureKeys(todayKey()).includes('gate') ? 'sand, a gate or the cat' : featureKeys(todayKey()).includes('tunnel') ? 'sand, the cat or a tunnel' : 'sand or the cat'}. Pot into the glowing golden pocket for a stroke back.</p>
      <p>${ic('ball')}Every shot is a stroke. Clear each hole in as few as you can; par is shown on each one.</p>
      <p>${ic('pull')}Pull the cue down and let go to shoot. Tap <b>?</b> any time for the full guide.</p>
    </div>
    <div class="row"><button class="btn primary" data-close>Let's play</button></div>`;
  $('overlay').classList.add('show');
}
function showHelp() {
  $('card').innerHTML = `
    <div class="k mono">How to play</div>
    <h2>${round?.trick ? 'Two minutes. Pot with style.' : 'Six holes. Fewest shots wins.'}</h2>
    <div class="howto">
      ${round?.trick ? TRICK_HELP : ''}<p ${round?.trick ? 'hidden' : ''}>${ic('flag')}<b>Six holes, golf scoring.</b> Every shot is a stroke and a foul (scratch, or hitting nothing) adds one. Par is the number of balls, +1 from hole 3 (at most three balls a hole). Clear the balls to finish a hole, or you pick up at par + 3. A ball close to a pocket on a clear line glows green: tap it to tap in for one stroke. Lowest score wins.</p>
      <p>Each shot runs top to bottom through the controls:</p>
      <p>1 · <b>Target:</b> the cue starts lined up on the easiest ball. To go for a different ball, <b>tap it on the table</b>.</p>
      <p>2 · <b>Aim:</b> swipe the <b>aim strip</b> left or right; slow swipes are fine, fast swipes turn further. A tap near either end nudges a hair. You can also drag anywhere on the table to turn the cue. The dashed line shows where the cue ball goes and the solid line where the object ball goes; it lights up when the shot really goes in.</p>
      <p>3 · <b>Spin:</b> <b>drag the gold spot</b> on the little cue ball: up for <b>follow</b> (rolls on), middle for <b>stun</b> (stops), down for <b>draw</b> (comes back). It's the same spot you aim for when you shoot.</p>
      <p>4 · <b>Shoot:</b> pull the <b>cue</b> on the right down for power and <b>let go when the tip is on the gold spot</b>. Off-centre pushes the shot off line; long shots wobble more. Push it back up to cancel. While you pull, a line shows where the cue ball heads after contact.</p>
      ${round?.trick ? '' : '<p>' + ic('star') + 'Points break ties: each pot is 100, banks and combos add 50, and pots in a row build a streak up to ×3.</p>'}
      <p>${ic('tilt')}From hole 3 the table can <b>tilt</b>, and brass <b>bumpers</b> or a closed pocket can appear.</p>
      <p>${ic('barrier')}From hole 3 every hole has one thing in the way of the obvious shots: a <b>sand bunker</b> (balls slow right down in sand), ${featureKeys(round?.seed).includes('gate') ? 'a <b>one-way gate</b> (it swings open for a ball going the way its arrows point, and is solid the other way), ' : ''}or <b>the cat</b> napping on the felt: it soaks up a hit, and if you hit it, it moves, often into your way. Hit it twice and it gives up and leaves.</p>${featureKeys(round?.seed).includes('tunnel') ? '<p>' + ic('tunnel') + 'Some holes have a <b>tunnel</b> instead: two openings in facing cushions, joined under the table. A ball that rolls into one comes back in through the other, heading the same way, a little slower. You never have to use it, but there is always a pot through it, and the aim line follows the ball through.</p>' : ''}${round?.trick ? '' : '<p>' + ic('spark') + 'From hole 2 one pocket is <b>golden</b>: your first pot into it takes a stroke off the hole. Trick shots (two in one, a bank, a combination or a kick) get an instant replay.</p>'}
      <p>${ic('shape')}From hole 3 the <b>table changes shape</b> from hole to hole: hexagon, octagon, L-shape, hourglass, oval, one with an island in the middle, or the classic.</p>
      <p>${ic('ffwd')}Tap the table while the balls are rolling to speed them up.</p>
      <p>${ic('cal')}Everyone plays the same holes each day. One ranked round per day, plus up to 3 practice rounds on random courses.</p>
    </div>
    <div class="row"><button class="btn primary" data-close>Let's play</button></div>
    ${feedbackLink()}`;
  // the timed trial talks about tables and runs, not holes and rounds
  if (round?.trick) {
    const howto = $('card').querySelector('.howto');
    howto.innerHTML = howto.innerHTML.replace(/From hole 3 every hole/g, 'From table 3 every table').replace(/From hole 3/g, 'From table 3').replace(/from hole to hole/g, 'from table to table')
      .replace('Everyone plays the same holes each day. One ranked round per day, plus up to 3 practice rounds on random courses.', 'Everyone plays the same tables each day. One ranked run a day, plus as many practice runs as you like.');
  }
  $('overlay').classList.add('show');
}
// trick scoring: the Points chip opens the breakdown of your shots
$('card9').addEventListener('click', e => {
  if (!round?.trick || !e.target.closest('#ptsChip')) return;
  ensureAudio(); sfx.click(); $('ptsChip').classList.remove('tip'); showShotLog();
});
$('card').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  ensureAudio(); sfx.click();
  if ('close' in b.dataset) { if (!ls('dailybreak:seenHelp')) track('intro'); ls('dailybreak:seenHelp', '1'); $('overlay').classList.remove('show'); if (phase === 'over') showFinal(!!round.done); }
  else if ('copy' in b.dataset) shareResult(b);
  else if ('saveimg' in b.dataset) saveShareCard(b);
  else if ('copyimg' in b.dataset) copyShareCard(b);
  else if ('trynew' in b.dataset) { $('overlay').classList.remove('show'); newRound(Math.random().toString(36).slice(2, 8), false); }   // ?trick: another course, no practice used
  else if ('random' in b.dataset) startPractice(Math.random().toString(36).slice(2, 8));   // a fresh random course
  else if ('daily' in b.dataset) { $('overlay').classList.remove('show'); newRound(todayKey(), true); }
});
function keyOf(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function todayKey() { return keyOf(new Date()); }
// Practice (a random course, unranked) is limited to 3 rounds a day, counted on this device.
const PRACTICE_PER_DAY = 3;
const practiceLeft = () => Math.max(0, PRACTICE_PER_DAY - (+ls('dailybreak:practice:' + todayKey()) || 0));
function usePractice() { ls('dailybreak:practice:' + todayKey(), String(PRACTICE_PER_DAY - practiceLeft() + 1)); }
function startPractice(seed) {
  if (practiceLeft() <= 0) return;
  usePractice(); $('overlay').classList.remove('show'); newRound(seed, false);
}
// Your ranked days, all kept on this device: how many and the day streak (counting the lives-ladder days saved
// under dailybreak:ladder:<date> before 12 Nov as well as par rounds), and the best and average par score.
function dayStats() {
  const days = new Set(), scores = [], pts = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i), m = k && /^dailybreak:(ladder|par):(.+)$/.exec(k);
      if (!m || !isDailySeed(m[2])) continue;
      let r = null; try { r = JSON.parse(localStorage.getItem(k)); } catch {}
      if (!r || typeof r !== 'object') continue;
      days.add(m[2]);
      if (m[1] === 'par' && Array.isArray(r.cards) && !r.trick) scores.push(r.cards.reduce((a, c) => a + c.strokes - c.par, 0));
      if (m[1] === 'par' && r.trick && Number.isFinite(r.points)) pts.push(r.points);   // trick-scoring days: points
    }
  } catch {}
  let streak = 0; const d = new Date();
  if (!days.has(keyOf(d))) d.setDate(d.getDate() - 1);   // today not played yet: the streak runs to yesterday
  while (days.has(keyOf(d))) { streak++; d.setDate(d.getDate() - 1); }
  return { played: days.size, streak, best: scores.length ? Math.min(...scores) : null, avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null,
    bestPts: pts.length ? Math.max(...pts) : null, avgPts: pts.length ? pts.reduce((a, b) => a + b, 0) / pts.length : null };
}
function statsHtml(trick = false) {
  const st = dayStats();
  if (!st.played) return '';
  const cell = (v, k) => `<div><b>${v}</b><span>${k}</span></div>`;
  // trick scoring: best and average points, never par numbers under a points total (23 Nov sweep)
  if (trick) return `<div class="stats">${cell(st.played, 'Played')}${cell(st.streak, 'Day streak')}${cell(st.bestPts == null ? '–' : shortPts(st.bestPts), 'Best')}${cell(st.avgPts == null ? '–' : shortPts(st.avgPts), 'Average')}</div>`;
  const avg = st.avg == null ? '–' : (Math.abs(st.avg) < 0.05 ? 'E' : `${st.avg > 0 ? '+' : '−'}${Math.abs(st.avg).toFixed(1)}`);
  return `<div class="stats">${cell(st.played, 'Played')}${cell(st.streak, 'Day streak')}${cell(st.best == null ? '–' : toPar(st.best), 'Best')}${cell(avg, 'Average')}</div>`;
}
// Countdown to the next daily game (local midnight).
function tickNext() {
  const el = $('nextIn');
  if (!el) { clearInterval(tickNext.t); return; }
  const now = new Date(), next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1), ms = next - now;
  const h = Math.floor(ms / 36e5), m = Math.floor(ms / 6e4) % 60, sec = Math.floor(ms / 1e3) % 60;
  el.textContent = `Next game in ${h ? `${h}h ${m}m` : `${m}m ${String(sec).padStart(2, '0')}s`}`;
}
const FEEDBACK_EMAIL = '';   // hidden until hello@dailybreak.app forwards somewhere (set it to show the link)
const feedbackLink = () => FEEDBACK_EMAIL ? `<div class="fbrow"><a href="${feedbackHref()}">Send feedback</a></div>` : '';
function feedbackHref() {
  const r = todaysResult(), body = r ? `\n\n---\n${shareText(r)}` : '';
  return `mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent('Daily Break feedback')}&body=${encodeURIComponent(body)}`;
}

