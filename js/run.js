// run.js: the run, a roguelike prototype (open with ?run, or ?run=<name> for a named seed). Endless holes on a
// 'run-' seed (ballsFor ramps to four and five balls after hole 6), a bank of spare strokes, and a card to pick
// after every hole. Each hole moves the bank by par minus your strokes: under par earns strokes back, over par
// spends them. Below zero and the run is over; the score is how far you got.
// Nothing here touches a daily or practice course: run seeds only, unranked, never saved, tracked or sent.
// Relies on everything before it; game.js, render.js, ui.js and main.js call runHas, runSpot, runWobble, runSpare,
// runAfterShot, runHoleDone, runBetween and runFinal at run time.

const RUN_START = 3;   // spare strokes you start with
// The cards. stack: can be picked again (and counts each copy). now: what it does the moment it's picked.
const RUN_CARDS = [
  { key: 'spare', emoji: '⛳', name: 'Spare strokes', text: '+2 spare strokes, right now.', stack: true, now: r => { r.bank += 2; } },
  { key: 'steady', emoji: '🎯', name: 'Steady hand', text: 'The gold spot grows 25% and the tip wobbles less.', stack: true },
  { key: 'wide', emoji: '🕳️', name: 'Wide pockets', text: 'Every shot gets the Perfect-strike pockets: wider, and harder to rattle out of.' },
  { key: 'trick', emoji: '🎪', name: 'Showman', text: 'Your first trick shot each hole takes a stroke off: a bank, kick, combo, double or tunnel pot.', stack: true },
  { key: 'streak', emoji: '🔥', name: 'Hot streak', text: 'Every third pot in a row earns a spare stroke.' },
  { key: 'golden', emoji: '✨', name: 'Golden touch', text: 'The golden pocket pays every time you pot into it, not just once.' },
  { key: 'catnip', emoji: '🐈', name: 'Catnip', text: 'The cat leaves after a single hit.' },
  { key: 'sight', emoji: '🔭', name: 'Long sight', text: 'The aim line follows the object ball off two cushions, not one.' },
  { key: 'tapin', emoji: '👆', name: 'Tap-in pro', text: 'Tap-ins from twice as far away, at a wider angle.' },
  { key: 'wind', emoji: '💨', name: 'Second wind', text: 'The first time you run out of strokes, carry on with none spare.' },
  { key: 'heavy', emoji: '⚠️', name: 'Heavy cue', curse: true, text: '+4 spare strokes now, but the gold spot is 20% smaller for the rest of the run.', stack: true, now: r => { r.bank += 4; } },
];
const runCard = k => RUN_CARDS.find(c => c.key === k);
const runCount = k => round?.run ? round.run.cards.filter(c => c === k).length : 0;
const runHas = k => runCount(k) > 0;
const runSpot = () => (1 + 0.25 * runCount('steady')) * 0.8 ** runCount('heavy');
const runWobble = () => 0.85 ** runCount('steady');
// spare strokes right now: the bank, less whatever this hole has gone over par so far
function runSpare() {
  const r = round.run;
  return r.settled ? r.bank : r.bank - Math.max(0, strokes - holeBonus - parOf(round.level));
}

function startRun(seed) {
  if (!isRunSeed(seed)) seed = 'run-' + seed;
  $('overlay').classList.remove('show');
  newRound(seed, false);
  round.run = { bank: RUN_START, cards: [], settled: false, tricks: 0, windUsed: false };
  $('course').textContent = `${courseName(seed)} · run`;
  renderCard9(); updateUI();
  const best = +ls('dailybreak:runbest:' + seed) || 0;
  $('card').innerHTML = `
    <div class="k mono">Daily Break · run</div>
    <h2>How far can you get?</h2>
    <div class="howto">
      <p>♾️ The holes keep coming, and they get harder: more balls, stranger tables, a shakier cue.</p>
      <p>⛳ You start with <b>${RUN_START} spare strokes</b>. Going over par spends them; under par (or the golden pocket) wins them back. Run out and the run's over.</p>
      <p>🃏 After every hole, pick one of three cards to help you go further.</p>
      ${best ? `<p>🏆 Your best on this run: hole ${best}.</p>` : ''}
    </div>
    <div class="row"><button class="btn primary" data-runclose>Start</button></div>`;
  $('overlay').classList.add('show');
}

// after every foul-free shot: the cards that pay out on what just happened
function runAfterShot(s) {
  const r = round.run, c = table.cue, say = (t, col = '#b88a2e') => float(W / 2, H * 0.38, t, col, 22, 2);
  if (r.tricks < runCount('trick') && trickKinds(s).length) {
    r.tricks++; holeBonus++;
    say('🎪 Showman: −1 stroke'); sfx.chime(); sparkle(c.x, c.y, '#e2b13c', 24, 160);
  }
  if (runHas('streak') && shotLog.length && hs.streak > 0 && hs.streak % 3 === 0) {
    r.bank++;
    say('🔥 Hot streak: +1 spare', '#c4472f'); sfx.chime();
  }
}
// a hole is done (cleared or picked up): settle the bank
function runHoleDone(d) {
  const r = round.run;
  r.bank -= d; r.settled = true;
  if (r.bank < 0 && runHas('wind') && !r.windUsed) {
    r.windUsed = true; r.bank = 0;
    setTimeout(() => float(W / 2, H * 0.62, '💨 Second wind!', '#2f6b4f', 26, 2.2), 600);
  }
}
// between holes: out of strokes ends the run, otherwise deal three cards
function runBetween() {
  const r = round.run;
  if (r.bank < 0) return runOver();
  const owned = new Set(r.cards), pool = RUN_CARDS.filter(c => c.stack || !owned.has(c.key));
  const offer = shuffle(rngFor(`${round.seed}:cards:${round.level}`), pool).slice(0, 3);
  $('card').innerHTML = `
    <div class="k mono">Hole ${round.level + 1} done · ${r.bank} spare stroke${r.bank === 1 ? '' : 's'}</div>
    <h2>Pick a card</h2>
    <div class="runcards">${offer.map(c => `
      <button class="runcard${c.curse ? ' curse' : ''}" data-pick="${c.key}">
        <span class="e">${c.emoji}</span><b>${c.name}${runCount(c.key) ? ` <small>×${runCount(c.key) + 1}</small>` : ''}</b><span>${c.text}</span>
      </button>`).join('')}
    </div>
    ${r.cards.length ? `<div class="k mono" style="margin-top:10px">Your build: ${r.cards.map(k => runCard(k).emoji).join(' ')}</div>` : ''}`;
  $('overlay').classList.add('show');
  sfx.chime();
}
function runPick(key) {
  const r = round.run, c = runCard(key);
  if (!c || phase !== 'holed') return;
  r.cards.push(key); c.now?.(r);
  r.settled = false; r.tricks = 0;
  $('overlay').classList.remove('show');
  startHole(round.level + 1);
  float(W / 2, H * 0.45, `${c.emoji} ${c.name}`, '#b88a2e', 24, 1.8);
}
function runOver() {
  const r = round.run, reached = round.cards.length, key = 'dailybreak:runbest:' + round.seed;
  r.best = +ls(key) || 0; r.newBest = reached > r.best;
  if (r.newBest) ls(key, String(reached));
  round.done = true; phase = 'over'; gimmes = [];
  stamp = { text: 'Run over', sub: `You reached hole ${reached}`, color: '#b8553f', t: 0 };
  sfx.stamp(); fx.shake = 6;
  setTimeout(() => { if (phase === 'over') showFinal(false); }, 2300);
}
function runShare() {
  const r = round.run, reached = round.cards.length;
  return `Daily Break run ${isDailySeed(round.seed.slice(4)) ? dayLabel(round.seed.slice(4)) : ''} 🃏 hole ${reached}\n${round.cards.map(c => cardEmoji(c.strokes - c.par)).join('')}\n${r.cards.map(k => runCard(k).emoji).join('')}\n${gameUrl()}`;
}
function runFinal() {
  const r = round.run, reached = round.cards.length;
  $('card').innerHTML = `
    <div class="k mono">${courseName(round.seed)} · run</div>
    <h2>${r.newBest ? 'New best run!' : 'Run over'}</h2>
    <div class="k mono">you reached</div>
    <div class="big">Hole ${reached}</div>
    <div class="k mono">${round.potted} balls potted${round.bestStreak > 1 ? ` · best streak ${round.bestStreak}` : ''}${r.best && !r.newBest ? ` · best ${r.best}` : ''}</div>
    <div style="font-size:22px;letter-spacing:3px;margin:10px 0 4px;word-break:break-all">${round.cards.map(c => cardEmoji(c.strokes - c.par)).join('')}</div>
    ${r.cards.length ? `<div class="k mono">Your build</div><div style="font-size:22px;letter-spacing:3px;margin:4px 0">${r.cards.map(k => `<span title="${runCard(k).name}">${runCard(k).emoji}</span>`).join('')}</div>` : ''}
    <div id="share">${runShare()}</div>
    <div class="row">
      <button class="btn primary" data-runagain>Run again</button>
      <button class="btn" data-runnew>Random run</button>
      <button class="btn" data-daily>Today's round</button>
    </div>`;
  $('overlay').classList.add('show');
  phase = 'over'; updateUI();
}

$('card').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if ('pick' in b.dataset) { ensureAudio(); runPick(b.dataset.pick); }
  else if ('runclose' in b.dataset) { ensureAudio(); sfx.click(); ls('dailybreak:seenHelp', '1'); $('overlay').classList.remove('show'); }
  else if ('runagain' in b.dataset) startRun(round.seed);
  else if ('runnew' in b.dataset) startRun('run-' + Math.random().toString(36).slice(2, 8));
});

// the card picker's look
document.head.insertAdjacentHTML('beforeend', `<style>
  .runcards { display: grid; gap: 10px; margin-top: 12px; }
  .runcard { display: grid; grid-template-columns: 44px 1fr; grid-template-rows: auto auto; column-gap: 10px; text-align: left; padding: 12px 14px; border-radius: 14px; border: 1.5px solid rgba(184,138,46,.45); background: rgba(255,250,235,.92); color: #2b2620; font: inherit; cursor: pointer; transition: transform .12s, box-shadow .12s; }
  .runcard:hover, .runcard:focus-visible { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(60,40,10,.18); }
  .runcard .e { grid-row: 1 / 3; font-size: 30px; align-self: center; text-align: center; }
  .runcard b { font-size: 16px; } .runcard b small { color: #b88a2e; }
  .runcard span:last-child { font-size: 13px; opacity: .8; line-height: 1.35; }
  .runcard.curse { border-color: rgba(184,85,63,.55); background: rgba(250,232,226,.92); }
</style>`);
