// state.js: the browser side starts here. DOM helpers ($, ls, buzz), the canvas and its context, timing and
// scoring constants (PTS, HOLES, par helpers) and the shared game state (round, hole, table, phase, aim, fx, ...).
// Relies on core.js.

/* =================== browser =================== */

const $ = id => document.getElementById(id);
const canvas = $('c'), stage = $('stage');
let ctx = canvas.getContext('2d');   // let: the scenery cache points it at its own canvases while it paints them
const lerp = (a, b, k) => a + (b - a) * k;
function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } }
function buzz(ms) { try { navigator.vibrate?.(ms); } catch {} }
// The table plays at 0.75x so there's time to watch the balls; outcomes are unchanged.
const PLAY = 0.75;
// The first shot's lesson in the close-up: how long the tip rests where they hit, glides to the gold spot, and holds.
const TEACH_REST = 2.0, TEACH_GLIDE = 1.3, TEACH_HOLD = 1.8, TEACH_T = TEACH_REST + TEACH_GLIDE + TEACH_HOLD;
// ...and the aim lesson before it: the line that would miss, then the aim strip swiping it onto the pocket.
const AIM_REST = 2.0, AIM_GLIDE = 1.8, AIM_HOLD = 1.5, AIM_T = AIM_REST + AIM_GLIDE + AIM_HOLD;
// The spin demo on hole 2 (loops until the player touches the spin ball) and the one-time scratch rescue.
const SPIN_LOOP = 6.4, SPIN_REST = 2.0, SPIN_GLIDE = 1.3, SPIN_HOLD = 1.6, SPIN_T = SPIN_REST + SPIN_GLIDE + SPIN_HOLD;
const firstShotEver = () => !ls('dailybreak:firstShot') && round?.level === 0;
const STRIKE_T = 0.34, SHOOT_T = 0.66, TICK = 0.25 * Math.PI / 180;
const TILT_ARROWS = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
// Points (a tiebreak, sent with the result): every pot is 100, banks and combos add 50, extra balls in one
// shot add 50, and consecutive potting shots build a streak multiplier. Finishing a hole adds 100 per ball in it.
const PTS = { pot: 100, bank: 50, combo: 50, multi: 50, level: 100 };
// ---- par (golf) scoring ----
// A round is six holes of 1, 2, 3, 3, 3, 3 balls. Every shot is a stroke, a foul adds a penalty stroke, and par
// is the number of balls (+1 from hole 3). A hole ends when it's cleared, or you pick up at par + 3. A ball
// sitting near an open pocket on a clear, straight line is a gimme: tap it to tap in, for one stroke.
const HOLES = 6;
const parKey = seed => 'dailybreak:par:' + seed;
const parOf = (i, seed = round?.seed) => ballsFor(seed, i) + (i >= 2 ? 1 : 0);
const capOf = i => parOf(i) + 3;
const toPar = n => n === 0 ? 'E' : n > 0 ? `+${n}` : `−${-n}`;
const cardEmoji = d => d < 0 ? '🟦' : d === 0 ? '🟩' : d === 1 ? '🟨' : '🟥';
const holeWord = d => d <= -2 ? 'Eagle!' : d === -1 ? 'Birdie!' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? 'Double bogey' : `${toPar(d)}`;
const holeColor = d => d < 0 ? '#3b5ea6' : d === 0 ? '#2f6b4f' : d === 1 ? '#9a7a2a' : '#b8553f';
const parTotal = () => (round.cards || []).reduce((a, c) => a + c.strokes - c.par, 0);
let gimmes = [];
const streakMult = n => n < 1 ? 1 : Math.min(3, 1 + 0.5 * (n - 1));
// ---- trick scoring (being tried, 22 Nov 2026) ----
// Points replace par: a pot is 100, each trick element on the shot adds 200 (an extra ball in one shot, a bank, a kick,
// a combination, a tunnel), the first pot into the golden pocket doubles the shot, and the whole shot is multiplied
// by the streak (potting shots in a row, carried across holes, x1 up to x3). Clearing a hole adds 300 per ball.
// Strokes are only the hole's budget (par + 3, as before). Tap-ins are off. Why: flair went unrewarded, too many
// players tied on par, and the trick replays are the best part. It's tried behind ?trick first (an unranked round
// that sends and saves nothing); RULES.TRICK_SCORE_FROM switches the daily round over once that date is set.
const TRICK_PTS = { pot: 100, part: 200, clear: 300 };
const trickFlag = new URLSearchParams(location.search).has('trick');
// a daily seed from the switch date on, a practice course once today is past it, or anything under ?trick
const trickOn = seed => trickFlag || (!!RULES.TRICK_SCORE_FROM && (isDailySeed(seed) ? seed : todayKey()) >= RULES.TRICK_SCORE_FROM);
// what each element adds: 200, except Quick (a shot taken within QUICK_S seconds of the aim starting), 100
const partPts = k => k === 'Quick' ? 100 : TRICK_PTS.part;
const QUICK_S = 5;
const fmtPts = n => Math.round(n).toLocaleString('en-US');

let round = null, hole = null, table = null, phase = 'lining', strokes = 0, acc = 0;
let aim = { bi: -1, angle: -Math.PI / 2, spotY: 0, spin: 0, spotX: 0, side: 0 }, power = 0.4, strike = null, strokeStart = null;
let hs = null, shotLog = [];
// this hole's golden pocket takes a stroke off the hole, once (holeBonus)
let holeBonus = 0, goldUsed = false;
// trick scoring: this shot's trick elements as they drop (tshot), this hole's points and tricks (thole)
let tshot = null, thole = { pts: 0, tricks: [] };
// trick scoring: this hole's moving targets, their clock (physics time while the balls roll), and how long this aim
// has run (for Quick)
let targets = [], tgtClock = 0, shotClock0 = 0, aimClock = 0, ptsHold = false;
let marks = [], trails = [], curTrail = null, stamp = null, banner = null;
let ffwd = false, movingT = 0, cine = null, cam = { k: 1, x: W / 2, y: H / 2 }, timeScale = 1;
// Animation: a ball on the lip gets slow motion and a heartbeat (lip),
// trick shots get an instant replay (shotRec, replay), the cue follows through (follow), hard contacts flash
// (fx.flashes), potted balls fly to a tray down the right-hand edge (trayFly), and the cat reacts (catStartle).
let shotSteps = 0, trayDone = [], lip = null, lipTried = new Set(), shotRec = null, replay = null, replayed = false, follow = null, trayFly = [], catStartle = 0;
const fx = { particles: [], rings: [], floats: [], sinks: [], confetti: [], flashes: [], shake: 0, glow: 0 };
let hitStop = 0, spinFx = null, shownPts = 0, swayT = 0;


