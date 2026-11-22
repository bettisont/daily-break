// ui.js: the HTML around the table: header and info bar (updateUI), spin ball, aim/spin lessons and demos,
// meter and aim strip, the intro/help/result cards, practice runs, day stats, sharing and feedback links.
// Relies on core.js, state.js, audio.js and game.js; render.js at run time.

/* ----- UI ----- */

// The header: the hole you're on, its par and your score (trick scoring: the hole and your points, which count up).
function renderCard9() {
  if (round.trick) { $('card9').innerHTML = `<div class="c cur lvl"><b>Hole ${Math.min(round.level + 1, HOLES)}/${HOLES}</b></div><button class="c score" id="ptsChip" title="How your points added up">Points <b id="ptsVal">${fmtPts(shownPts)}</b><i>ⓘ</i></button>`; return; }
  $('card9').innerHTML = `<div class="c cur lvl"><b>Hole ${Math.min(round.level + 1, HOLES)}/${HOLES}</b></div><div class="c">Par <b>${parOf(round.level)}</b></div><div class="c score">Score <b>${toPar(parTotal())}</b></div>`;
}
function updateUI() {
  if (!table) return;
  const left = table.remaining(), n = Math.max(0, Math.min(strokes, capOf(round.level)) - holeBonus);
  $('iHole').innerHTML = `Hole ${round.level + 1} · par ${parOf(round.level)}<b>${n} stroke${n === 1 ? '' : 's'}<small>${left} left</small></b>`;
  if (round.trick) {
    const cap = capOf(round.level), shots = Math.max(0, cap - strokes), m = streakMult(hs.streak);
    $('iHole').innerHTML = `Hole ${round.level + 1} · ${hole.balls.length} ball${hole.balls.length === 1 ? '' : 's'}<b>${shots} shot${shots === 1 ? '' : 's'} left<small>${left} left</small></b>`;
    updateStreakMeter(m);
  } else { $('iLie').innerHTML = `Score<b>${toPar(parTotal())}</b>`; $('iLie').classList.remove('max'); }
  $('iTilt').innerHTML = `Tilt<b>${hole.tilt.mag ? `${TILT_ARROWS[hole.tilt.dir]} ${Math.max(1, Math.round(hole.tilt.mag / 12))}°` : 'Flat'}</b>`;
  const b = $('act'), labels = {};   // no button: a cleared level moves on and the result card opens by themselves
  b.classList.toggle('show', !!labels[phase]); b.textContent = labels[phase] || '';
  const aiming = phase === 'aim';
  $('strip').classList.toggle('off', !aiming); $('rowB').classList.toggle('off', !aiming); $('pull').classList.toggle('off', !aiming && !hold);
  $('hint').innerHTML = phase === 'moving' ? 'Tap the table to speed up' : !aiming ? '' : hold ? (power < MIN_PULL ? 'Pull down · let go here to cancel' : 'Let go on the gold spot') :
    gimmes.length ? 'Tap the glowing ball<b>Tap in</b>' : round.trick ? `Shot<b>${strokes + 1}</b><small>of ${capOf(round.level)}</small>` : `Stroke<b>${strokes + 1}</b><small>pick up after ${capOf(round.level)}</small>`;
  updateMeter(); updateAimUI(); updateSpinBall();
}
// Trick scoring's streak meter (22 Nov): the multiplier, and a bar under it that fills and heats up from x1 to x3,
// with a flame from x2, pulsing at x3. Built once and updated, so its animations aren't restarted every update.
function updateStreakMeter(m) {
  const el = $('iLie');
  if (!$('smX')) el.innerHTML = 'Streak<b><span id="smX"></span></b><span class="smbar"><i id="smFill"></i></span>';
  $('smX').textContent = `×${m}${m >= 2 ? ' 🔥' : ''}`;
  $('smX').parentElement.classList.toggle('hot', m > 1);
  $('smFill').style.width = `${(m - 1) / 2 * 100}%`;
  el.classList.toggle('max', m >= 3);
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
  return phase === 'aim' && !hold && !spinDrag && round?.level === 1 && strokes === 0 && !ls('dailybreak:spinDemo') && !$('overlay').classList.contains('show') && !banner;
}
function startSpinDemo() {
  spinDemo = { t: 0, y0: aim.spotY };
  $('spinFace').insertAdjacentHTML('beforeend', '<div id="spinHand">👆</div>');
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
    el.insertAdjacentHTML('beforeend', '<div id="demoHand">👆</div><div id="demoTip">Drag the cue down, then let go</div>');
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
const canNativeShare = () => !!navigator.share && matchMedia('(pointer: coarse)').matches;
async function shareResult(b) {
  const text = shareText();
  if (canNativeShare()) { try { await navigator.share({ text }); } catch {} return; }
  try { await navigator.clipboard.writeText(text); b.textContent = 'Copied!'; }
  catch { b.textContent = 'Select the text to copy'; }
}
// trick scoring's intro and the scoring part of its help (22 Nov: the par wording was wrong for it)
const TRICK_INTRO = `
    <div class="k mono">Daily Break · daily pool</div>
    <h2>Six holes. Pot with style.</h2>
    <div class="howto">
      <p>🎱 Clear each hole within the shots you have. Every pot is 100 points.</p>
      <p>✨ Tricks add more: a bank, a combination, two in one, a moving target… The better the shot, the bigger the bang.</p>
      <p>🔥 Pot on shot after shot to build a streak up to ×3. It multiplies every shot; a miss resets it.</p>
      <p>👇 Pull the cue down and let go to shoot. Tap <b>?</b> any time for the full guide.</p>
    </div>
    <div class="row"><button class="btn primary" data-close>Let's play</button></div>`;
const TRICK_HELP = `
      <p>🎱 <b>Six holes, scored in points.</b> Each hole gives you a few shots (shown above the table): clear its balls before they run out. Every pot is <b>100</b>. A foul (a scratch, or hitting nothing) costs a shot and resets your streak, and anything it pots scores nothing.</p>
      <p>✨ <b>Tricks</b> add to a shot that pots. <b>+200</b> each: a <b>bank</b> (the ball comes off a cushion), a <b>combination</b> (potted by another ball), a <b>cannon</b> (the cue ball hits two balls before one drops), <b>two or three in one</b>, a pot through a <b>tunnel</b>, or a ball rolling through a moving <b>target</b> ring before anything drops. <b>+100</b>: a <b>kick</b> (the cue ball hits a cushion first) or a <b>quick</b> shot (taken while the gold ring round the cue ball is still running).</p>
      <p>🔥 <b>Streak:</b> every shot that pots raises it, ×1, ×1.5, ×2, ×2.5, up to ×3, from hole to hole, and it multiplies the whole shot. A miss or a foul resets it. From hole 2 the <b>golden pocket</b> doubles the first shot into it.</p>
      <p>ⓘ Tap <b>Points</b> at the top to see how each shot added up.</p>`;
function showIntro() {
  if (round?.trick) { $('card').innerHTML = TRICK_INTRO; $('overlay').classList.add('show'); return; }
  $('card').innerHTML = `
    <div class="k mono">Daily Break · daily pool</div>
    <h2>Six holes. Fewest shots wins.</h2>
    <div class="howto">
      <p>⛳ Pool scored like golf. Hole 1 has one ball, hole 2 two, then three a hole, with something in the way: ${featureKeys(todayKey()).includes('gate') ? 'sand, a gate or the cat' : featureKeys(todayKey()).includes('tunnel') ? 'sand, the cat or a tunnel' : 'sand or the cat'}. Pot into the glowing golden pocket for a stroke back.</p>
      <p>🎱 Every shot is a stroke. Clear each hole in as few as you can; par is shown on each one.</p>
      <p>👇 Pull the cue down and let go to shoot. Tap <b>?</b> any time for the full guide.</p>
    </div>
    <div class="row"><button class="btn primary" data-close>Let's play</button></div>`;
  $('overlay').classList.add('show');
}
function showHelp() {
  $('card').innerHTML = `
    <div class="k mono">How to play</div>
    <h2>${round?.trick ? 'Six holes. Pot with style.' : 'Six holes. Fewest shots wins.'}</h2>
    <div class="howto">
      ${round?.trick ? TRICK_HELP : ''}<p ${round?.trick ? 'hidden' : ''}>⛳ <b>Six holes, golf scoring.</b> Every shot is a stroke and a foul (scratch, or hitting nothing) adds one. Par is the number of balls, +1 from hole 3 (at most three balls a hole). Clear the balls to finish a hole, or you pick up at par + 3. A ball close to a pocket on a clear line glows green: tap it to tap in for one stroke. Lowest score wins.</p>
      <p>Each shot runs top to bottom through the controls:</p>
      <p>1 · <b>Target:</b> the cue starts lined up on the easiest ball. To go for a different ball, <b>tap it on the table</b>.</p>
      <p>2 · <b>Aim:</b> swipe the <b>aim strip</b> left or right; slow swipes are fine, fast swipes turn further. A tap near either end nudges a hair. You can also drag anywhere on the table to turn the cue. The dashed line shows where the cue ball goes and the solid line where the object ball goes; it lights up when the shot really goes in.</p>
      <p>3 · <b>Spin:</b> <b>drag the gold spot</b> on the little cue ball: up for <b>follow</b> (rolls on), middle for <b>stun</b> (stops), down for <b>draw</b> (comes back). It's the same spot you aim for when you shoot.</p>
      <p>4 · <b>Shoot:</b> pull the <b>cue</b> on the right down for power and <b>let go when the tip is on the gold spot</b>. Off-centre pushes the shot off line; long shots wobble more. Push it back up to cancel. While you pull, a line shows where the cue ball heads after contact.</p>
      ${round?.trick ? '' : '<p>🔥 Points break ties: each pot is 100, banks and combos add 50, and pots in a row build a streak up to ×3.</p>'}
      <p>⛰️ From hole 3 the table can <b>tilt</b>, and brass <b>bumpers</b> or a closed pocket can appear.</p>
      <p>🚧 From hole 3 every hole has one thing in the way of the obvious shots: a <b>sand bunker</b> (balls slow right down in sand), ${featureKeys(round?.seed).includes('gate') ? 'a <b>one-way gate</b> (it swings open for a ball going the way its arrows point, and is solid the other way), ' : ''}or <b>the cat</b> napping on the felt: it soaks up a hit, and if you hit it, it moves, often into your way. Hit it twice and it gives up and leaves.</p>${featureKeys(round?.seed).includes('tunnel') ? '<p>🕳️ Some holes have a <b>tunnel</b> instead: two openings in facing cushions, joined under the table. A ball that rolls into one comes back in through the other, heading the same way, a little slower. You never have to use it, but there is always a pot through it, and the aim line follows the ball through.</p>' : ''}${round?.trick ? '' : '<p>✨ From hole 2 one pocket is <b>golden</b>: your first pot into it takes a stroke off the hole. Trick shots (two in one, a bank, a combination or a kick) get an instant replay.</p>'}
      <p>🔷 From hole 3 the <b>table changes shape</b> from hole to hole: hexagon, octagon, L-shape, hourglass, oval, one with an island in the middle, or the classic.</p>
      <p>⏩ Tap the table while the balls are rolling to speed them up.</p>
      <p>📅 Everyone plays the same holes each day. One ranked round per day, plus up to 3 practice rounds on random courses.</p>
    </div>
    <div class="row"><button class="btn primary" data-close>Let's play</button></div>
    ${feedbackLink()}`;
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
  const days = new Set(), scores = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i), m = k && /^dailybreak:(ladder|par):(.+)$/.exec(k);
      if (!m || !isDailySeed(m[2])) continue;
      let r = null; try { r = JSON.parse(localStorage.getItem(k)); } catch {}
      if (!r || typeof r !== 'object') continue;
      days.add(m[2]);
      if (m[1] === 'par' && Array.isArray(r.cards) && !r.trick) scores.push(r.cards.reduce((a, c) => a + c.strokes - c.par, 0));
    }
  } catch {}
  let streak = 0; const d = new Date();
  if (!days.has(keyOf(d))) d.setDate(d.getDate() - 1);   // today not played yet: the streak runs to yesterday
  while (days.has(keyOf(d))) { streak++; d.setDate(d.getDate() - 1); }
  return { played: days.size, streak, best: scores.length ? Math.min(...scores) : null, avg: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null };
}
function statsHtml() {
  const st = dayStats();
  if (!st.played) return '';
  const cell = (v, k) => `<div><b>${v}</b><span>${k}</span></div>`, avg = st.avg == null ? '–' : (Math.abs(st.avg) < 0.05 ? 'E' : `${st.avg > 0 ? '+' : '−'}${Math.abs(st.avg).toFixed(1)}`);
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

