# Daily Break - handoff

**From 12 Nov 2026 the daily game is par (golf) scoring on shaped tables: see "Par scoring" and "Table shapes" near the end. The ladder with lives described first still runs for earlier days.**

A daily pool game for the browser: a ladder of levels, the same for everyone
each day. Level 1 has one ball, level 2 two, and so on; you have four lives,
and your score is how far you get. One ranked run a day of about two to four
minutes (daily puzzles like the NYT Mini take a few minutes; that's the
target), with a shareable emoji result. Single file: `index.html` (no build, open it in a
browser).

## The game (as of 2026-11-10): the ladder

Level *i* (1-based) is a fresh seeded layout of *i* balls (`makeHole(seed, i - 1)`, up to `MAX_BALLS` = 15; numbers drawn from 1–15, 9–15 drawn as stripes), the same for everyone on the day, with the cue ball placed by the layout. About a third of the balls sit in clusters and some on the cushions; pockets are tight (corner capture 1.75 R, side 1.55 R). Hazards start at level 3 and ramp up (`hz` = level − 2, capped at 8): table tilt, rough felt, slick felt, brass bumpers and an occasional closed pocket. **The first shot of every level is always a real pot:** `makeHole` re-rolls (deterministically) until `openingPot` finds an unblocked, not-too-thin cut that a centre-ball hit at a sensible pace actually sinks in simulation (tilt and felt included) without scratching. **And the whole level must be clearable:** `clearable` plays it with a bot of perfect execution (each shot: the best 4 pots × stun/follow/draw × three paces, keeping the one with the best next pot via `leaveQ`) and must clear all N balls in N shots without a foul; otherwise the layout is re-rolled (up to 60 tries, falling back to the first with a good opener). Before this check, 20–65% of levels 4–10 were impossible to clear even with perfect play (frozen pairs on a rail, balls tucked behind others). Generation averages 3–36 ms per level (worst seen ~150 ms at level 12); results are cached (`holeCache`) and the next level is built in the background 1.5 s into the current one.

**Lives** (`LIVES` = 4, raised from 3 on 10 Nov 2026): a shot that pots nothing, or a foul (no contact, scratch), costs a life; balls that drop on a foul stay down. Clear every ball to move up; clearing a level without losing a life wins one back (up to 4). At zero lives the run ends on the level you were playing (`endRun`). Within a level the cue ball stays where it stops, so position play matters. There is no shot limit and no ball order.

A shot (built for one thumb on a phone). The controls run in play order, top to bottom: target → aim → power → strike.

1. **Target.** Each shot starts aimed dead centre at the ball with the easiest pot (`lineUp` → `bestBall`). Tapping a ball on the table targets it (generous radius, 3 R; a one-off tip on level 2 until the player has done it); Tab or n on a keyboard steps through the balls in number order. The on-screen target button was removed on 10 Nov 2026.
2. **Aim.** The full-width **aim strip** is swiped left/right like a scroll wheel: 0.04° per pixel when slow, gearing up to 6× when fast; a tap near either end nudges 0.1°. Its centre reads the offset from dead centre. Dragging anywhere on the table also turns the cue, relative to where you start and geared by how far your finger moves around the cue ball (0.08° per screen pixel), so your thumb never covers the line. Arrow keys: 0.1° (Shift: 1°).
3. **Guide**: the aim line, ghost ball and a long (330 px) object-ball line on every level. The object-ball line is pure geometry (no tilt or felt). The challenge comes from the timed release, more balls and position play.
5. **Spin.** The spin control is the same cue-ball face as the close-up, 106 px (92 px on narrow phones), under the full-width aim strip: drag the gold spot up (follow) or down (draw), or tap where you want it; the further from the middle, the stronger (spot ±0.5 of the radius, continuous; snaps to centre). It's the same gold spot you aim for when you release. **Path hint** (`spinPaths`, `drawSpinPaths`): only while pulling back or dragging the spin spot, a fading white line shows the cue ball's first half second after it meets the first ball (`PATH_STEPS` = 120 physics steps), so a harder pull draws a longer line; a red X if it would scratch inside that window. No resting spot is shown: where it stops is for the player to judge.
6. **Pull back and release.** The tall cue on the right is the power and the trigger: drag down to load power (150 px = full; the table cue pulls back to match), let go to shoot, or push back to the top and let go to cancel (hold Space on desktop). While you hold, a close-up of the cue ball (bottom left of the table) shows the gold spot (your spin) and the cue tip wobbling over it (`tipPos`). When you let go is the timing challenge (`contact`): on the spot plays the shot exactly; off to the side pushes the line up to 3° the other way; high/low error changes the spin; out at the edge is a miscue (−4°, 35% power). `contactDiff` sets the spot size and the wobble, mostly from distance (cue ball to first ball, plus that ball's run on), plus spin, power and rough felt. On release the close-up zooms to the middle and plays the strike with a grade (Clean / Nearly / Off-centre / Miscue): the tip lands at `STRIKE_T` (0.34 s, with the click), the close-up fades out, and only then (`SHOOT_T`, 0.66 s) does the cue on the table strike and the balls roll, so the contact with the object ball is always in view (`zoom`, `drawContact`).

Scoring (the tiebreak under "level reached"; `PTS`, `resolveShot`, `finishHole`): every pot 100; bank +50; combo +50; each extra ball in one shot +50; consecutive potting shots build a streak multiplier ×1, ×1.5, ×2, ×2.5, ×3 (`streakMult`) that carries across levels and resets on a miss or foul. Clearing a level adds 100 per ball in it. The hint next to the spin ball shows what the next pot is worth and your lives; the header shows the level and hearts.

Feedback: pot sounds climb a pentatonic scale as the streak builds (`sfx.potNote`), with a bell from the second pot in a row; floats count down the balls left ("3 to go", "Level clear!") or name a Bank/Combo; losing a life plays a falling phrase with a 💔, and winning one back a rising chime; screen shake grows with the streak. When a shot will clear a level of 3+ balls (`release` simulates it first), the last ball gets slow motion (0.25×), a camera push-in and a darker vignette as it nears the pocket (`cine`, `cam`, `timeScale` in `frame`).

Juice (all procedural Web Audio, no files): sounds are panned left/right by where they happen (`atX`). Ball clacks have a woody body; cushions thud (with a rubbery bounce on hard hits) and puff chalk dust; hard ball hits freeze the frame for 30 ms (`hitStop`) with a small shake. A pot plays a leather "thunk" and the ball rolling down the return (`sfx.drop`), the pocket glows, the ball spirals in as it shrinks, a 45 ms hit-stop lands it, and the screen edges glow gold (`fx.glow`, stronger with the streak); streaks of 3+ add a bass swell (`sfx.boom`), and two or more balls in a shot call "Double!"/"Triple!" with a rising arpeggio. When spin takes hold off the object ball the table emits a `spin` event: a zip back for draw or a surge for follow, with gold arcs whirling round the cue ball (`spinFx`). The strike is a solid "thock" (a skid and a puff of chalk for a miscue); the pull-back cue creaks per 5% and thumps at full power; the spin spot clicks in pitch as it moves and snaps at centre. A low rolling rumble follows the total ball speed (`rollGain`). The points total counts up with ticks, and the streak multiplier pops when it rises. Vibration patterns differ for clean strikes, pots and miscues (Android only).

Pace (to keep a round near three minutes): once every ball is creeping (under 70, and at least 1.2 s into the shot) the table runs at 2×, and a tap on the table runs the rest at 4× (`ffwd`), but only once the shot has rolled for 0.8 s, so a tap meant for the close-up doesn't skip the action; the level banner lasts 1.5 s; after a level's stamp the next level starts by itself after about 2 s (no button); at the end of a run the result card opens by itself. A bot with perfect aim and timing but no position play reaches level 4–5 in 12–15 shots (about 2 minutes with thinking time), so most players should land around levels 3–6 in two to four minutes.

Share card: `Daily Break 11 Nov 🎱` (the date), `Level 6 · 18 balls`, and one emoji per level (🟢 clean clear, 🟡 cleared after losing a life, ❌ where the run ended). The result card also shows points and the best streak. Ranked results are stored under `dailybreak:ladder:<date>` (older keys are ignored).

Physics notes: fixed 1/240 s step, exact-contact ball collisions, tilt, felt friction, pocket rattle above `POT_MAX_SPEED`, spin applied at the cue ball's first contact, per-ball cushion count (`cush`) for banks. Deterministic, so a server could re-run shots to validate.

## Look and feel

Top-down retro room: plank floor, a patterned rug, walnut table with sage
felt, swaying plants, armchair, a spinning record player, a sleeping cat,
window light with rain shadows, cloud shadows, dust motes, vignette and
grain. UI in DM Sans + DM Mono, laid out to give the table as much height as possible:
one slim header row (title, level chip, hearts, one sound button cycling
all / effects only / off, and help; the course name shows in the level 1
banner instead), info bar (level, points and balls left, streak multiplier,
tilt), then the controls in play order: the full-width aim strip, the spin ball with its name and the next pot's value stacked beside it,
and the pull-back cue down the right.
Sound: clacks, cushions, pockets, rising pot notes for streaks, aim ticks and an electric-piano loop.
The rain-and-vinyl hiss under everything was removed on 10 Nov 2026 (it read as background noise).

## Code layout

- Top half of the script, no DOM: seeded RNG, `makeHole`, `Table`
  physics, `trace`, `potLine`/`allLines` (used to guarantee an opening pot)
  and `simulate`.
- Bottom half: audio, events (`onEvent` scores each pot as it drops),
  run/level flow (`newRound`, `startHole`, `lineUp`, `bestBall`, `nextBall`, `setAngle`, `setSpot`,
  `setPower`, `shoot`, `resolveShot`, `finishHole`), UI, input (table drag,
  aim strip, spin ball, pull-back cue, keys) and the canvas renderer
  (`drawAim`, `drawAimLabels`).

## Next ideas

- Playtest the difficulty: `LIVES` (4), the life refill rule, when hazards
  start (level 3) and the release wobble (`contactDiff`) are the main knobs.
- Daily streak and stats on the result card; a countdown to tomorrow's run.
- Replay of the best shot at the end of a run.
- Optional position target: drop a zone for the cue ball for a bonus.
- Leaderboard and friends with server-side shot replay.

## Hosting

Live at https://dailybreak.app (bought 10 Nov 2026 through Cloudflare Registrar). Cloudflare Worker `daily-break` (static assets, `wrangler.jsonc`) with custom domains `dailybreak.app` and `www.dailybreak.app`; `src/worker.js` redirects every other host (www, the old daily-break.timbuilds.workers.dev) to dailybreak.app. Every push
to `main` deploys via `.github/workflows/deploy.yml` (needs the repo secret
`CLOUDFLARE_API_TOKEN`); it can also be run by hand from the Actions tab.
By hand: `mkdir -p dist && cp index.html static/* dist/ && npx wrangler deploy`.

`static/` holds the link-preview card (`og.png`, 1200×630), app icons and
`manifest.webmanifest` (Add to Home Screen opens it standalone). The meta tags
and `SITE_URL` in `index.html` use https://dailybreak.app/;
change them together with `HOST` in `src/worker.js` if the domain ever changes. The share button uses the
phone's share sheet (`navigator.share`) and falls back to copying; the shared
text ends with the game's URL (with `?seed=` for non-daily courses).

Analytics: Cloudflare Web Analytics, off until `CF_ANALYTICS_TOKEN` in the
`<head>` is filled in (dashboard › Analytics & Logs › Web Analytics › Add a
site › dailybreak.app). It's cookieless: daily visits and
page views, not individual returning players.

Audio on iPhone: Web Audio is unlocked on the first touchend/click (iOS doesn't
count pointerdown) and resumed when the tab comes back. The ring/silent switch
mutes it. Vibration is Android-only; iOS ignores `navigator.vibrate`.

## Launch polish (10 Nov 2026)

- Days are named by date, not numbered: "Daily Break 11 Nov" in the share text and header (`dayLabel`, en-GB short date). (Briefly numbered from launch as #1, #2…; dropped 11 Nov 2026.)
- Level 1 is a free warm-up: a miss or foul there costs no life (`resolveShot`).
- First visit shows a three-line intro (`showIntro`); the full guide stays behind **?** (`showHelp`).
- The result card shows the player's own stats from localStorage (`ladderStats`: days played, day
  streak, best and average level; nothing leaves the device), a live countdown to the next ladder
  at local midnight (`tickNext`) and a "Send feedback" mailto link, hidden while `FEEDBACK_EMAIL` is empty: set it to
  hello@dailybreak.app once Cloudflare Email Routing forwards that address to a real inbox.

## Results (how far people get)

At the end of a ranked daily run on dailybreak.app, `sendResult` posts one anonymous note
(`{day, level, potted, points}`, no IDs) to `/api/result`. `src/worker.js` validates it (day within
about a day of now, whole numbers in range) and writes it to Workers Analytics Engine, dataset
`daily_break_results` (blob1 = day, double1 = level, double2 = balls, double3 = points; kept 3
months). To read it: Actions › **Results** › Run workflow; the table (players, average/median/most
common/best level per day, plus where runs ended on the latest day) appears on the run's summary
page (`tools/results.py`). The token needs Account › Account Analytics › Read for that. Anyone can
post to the endpoint, so treat the numbers as a guide, not a leaderboard.

## Today's rank and the near miss (11 Nov 2026)

- `src/worker.js` keeps a per-day count of players at each level in the `DayCounts` Durable Object
  (SQLite-backed, one instance named "all"; key `d:<day>` → `{ level: count }`, nothing else).
  `POST /api/result` adds to it and replies with the tally; `GET /api/day?day=` returns it.
- The result card shows "Better than X% of today's players" (no player count on purpose) (`fillRank`,
  `loadRank`: X = players on a lower level ÷ everyone else), or "Best run today so far 🏆" /
  "You're the first to finish today's game". Only on dailybreak.app, ranked daily runs.
- Near miss (`nearMiss`, from this device's history; the run end stores `left`, balls left on the
  table): new personal best › one ball off the next level › equal to your best › one level off it.

Link preview card (11 Nov 2026): `static/og.png` is a flat illustration (wordmark, "Your daily frame.", a table corner with a ball lined up on the pocket), drawn in `tools/og-card.html` and
rendered at 1200×630 with headless Chromium. `og:image` carries a `?v=` number so WhatsApp and others
fetch the new picture; bump it when the card changes.

Wording (11 Nov 2026): players never see the word "ladder" (it reads as a ranking table in the UK); it's "a new pool game every day", "Your daily frame." (tagline), "Next game in…". Code names (`dailybreak:ladder:` keys, `ladderStats`) are unchanged so saved results keep working.

Sharing (11 Nov 2026): the share text is always today's ranked result (`todaysResult`: the
current ranked round, or today's saved `dailybreak:ladder:<date>`), titled with the date
("Daily Break 11 Nov 🎱"), and the link is always the plain site (no `?seed=`), so friends land in
today's real game. A practice card says "Practice · not ranked" and offers "Share today's result";
if today's ranked run isn't done, it offers "Play today's game" instead of a share button.

Practice limit (11 Nov 2026): 3 practice runs a day in total (`PRACTICE_PER_DAY`, counted on the device
under `dailybreak:practice:<date>`). "Practice run" replays today's levels unranked; "Random table"
is a fresh random seed. The result card shows how many are left; at 0 the buttons go and an old
`?seed=` link opens today's game instead.

Drop-off funnel (11 Nov 2026): `track(step)` sends one anonymous `{day, step}` to `POST /api/event` for
each of open → shot (first shot) → clear1 (cleared level 1) → level3 (reached level 3) → finish, at most
once per device per day (`dailybreak:ev:<day>:<step>`), ranked daily runs on dailybreak.app only.
The Worker writes them to Analytics Engine dataset `daily_break_events` (blob1 day, blob2 step); the
Results report shows them as a funnel table with percentages of "Opened".

Who leaves before the first shot (13 Nov 2026): on load, `open` is followed by `opennew` (no
`dailybreak:seenHelp` yet, so they get the intro) or `openback`. The first time the page is hidden before
today's first shot, `track('left', {secs, where})` sends the seconds since load and the screen (`intro` card
open, `table` with the cue untouched, or `pulled` the cue but no shot); the Worker stores them as blob3 and
double2. One per device per day, and some come back and play later, so treat it as "went away", not "quit".
The report shows new/returning under Opened and a "Left before the first shot" table (screen, time buckets,
median). Your own devices: open `dailybreak.app/?me=1` once on each (`dailybreak:me`; `?me=0` undoes it) and
they send no funnel events or results (the card still shows the rank, from `loadRank`).

Saved runs (11 Nov 2026): a ranked run in progress is saved to `dailybreak:run:<date>` after every shot
and at the start of every level (`saveRun`: level, lives, balls potted, results, points, streak, misses,
cue and ball positions; after a clear it saves the start of the next level). `resumeRun` restores it
on load ("Carrying on · N balls left"), so reloading can't restart a bad run and an interrupted player
keeps their progress. The save is removed when the run ends and never written for practice or once
today's result exists.

## Pace (11 Nov 2026)

- The table plays at 0.75× (`PLAY`) so there's time to watch the balls; outcomes are unchanged. The
  automatic speed-up waits until everything is under 35 after 2 s and runs at 1.6×, and a tap fast-forwards
  at 3× (was 1×, then 2× after 1.2 s under 70, and 4× on a tap).
- The cue-ball close-up (the timing challenge) stays in the bottom-left corner while you pull back. Putting
  it in the middle of the screen, then at whichever height was clearest of the shot lines, was tried on this
  branch and held back for now (it's in the history).
- A daily weather system (damp, sunny, draughty, stormy, cold) was built and tried on this branch on 11 Nov
  2026 and taken out again: it changed how balls rolled but not what you were trying to do on each level.
  It's in the branch history (commits "Daily weather…" and "Stronger weather…") if it's ever wanted.

## Teaching spin (11 Nov 2026)

Playtest feedback: a player got the hang of the pull but didn't notice spin. Two nudges, both at the moment
spin helps (`spinPulse`):

- Level 3, until the player has used spin (any spot off centre, remembered as `dailybreak:usedSpin`): the spin
  ball pulses gold and the table shows "Spin: drag the gold spot / Down brings the cue ball back · up follows
  through" 1.7 s in.
- Whenever the pull-back path hint shows a scratch (the red X), the spin ball pulses while it's shown; the
  first three times ever (`dailybreak:scratchTips`) the table also says "Scratch ahead: try spin".

## Table shapes (from 12 Nov 2026)

`SHAPES_ON` switches them on (set it false to go back to the classic table only). Levels 3 and
up are played on a table shape dealt for the day like a shuffled deck (`shapeFor`: classic plus six shapes, all
seven before any repeat, never the same twice running), the same for everyone, from `SHAPES_FROM`. Levels
1–2, older days and classic levels run exactly the old rectangle code (layouts checked identical).

Shapes (`SHAPES`, built by `mkShape`; each fits the 500 × 1000 box and has six pockets): ⬡ Hexagon (a
pocket at each corner), ⯃ Octagon (pockets on the four diagonals plus two sides), ⌐ L-shape, ⧗ Hourglass
(two chambers joined by a waist half the table's width; pockets on the two waist points), ⬭ Oval (pockets round the rim) and ⊡ Island (a classic
table with a walnut block in the middle; from 14 Nov it's drawn as a raised block, with a drop shadow, a dark
cushion, a bevelled grained top and cream sights, because players read the flat version as a mat, not a wall).

- Physics: a shaped table's cushions are segments (`sh.segs`, with normals into the felt). A ball overlapping
  one is pushed off its nearest point and bounces off that normal (`Table.step`), which also rounds corners.
- Aiming: `trace` casts against the cushions (`rayCushion`), so the aim line, ghost ball and path hint follow
  them; `pocketAim` uses a point just inside each pocket's mouth; `pathBlocked` also counts inward corners
  and islands.
- Generation: balls are placed only where they fit on the felt (`freeIn`), rail balls go along any cushion,
  and the usual opening-pot and clearable checks apply. In testing (40 levels per shape, levels 3–10) every
  level had a real opening pot and was clearable; no ball left the felt in 1,440 random shots.
  Generation averages 11–31 ms per level except the hourglass (~70 ms, worst ~430 ms; its waist was widened
  from 160 to 250 px because the narrow one rejected about 14 layouts per level, now about 5).
- Drawing: `drawShapedTable` draws the walnut rail, cushion and felt round the outline; everything on the
  felt is clipped to it (`feltPath`). The level banner names the table, and the help explains it. Not on the share card (by choice).

Ideas next: portals or bridges linking two parts of a table (the aim line would need to follow the ball
through), and tuning which shapes appear at which levels.

## Par scoring (the daily game from 12 Nov 2026)

From `PAR_FROM` (2026-11-12) the daily game is six holes scored like golf, with no lives (`PAR_ON`,
`parSeed`: days before that, and practice on them, keep the lives ladder above, so saved runs and results
from those days still work; random practice courses are par). Hole i has i + 1 balls. Every shot is a
stroke; a foul (scratch, no contact) adds a penalty stroke and balls that drop on it stay down. Par is the
number of balls, +1 from hole 3 (`parOf`: 1, 2, 4, 5, 6, 7 = 25). A hole ends when it's cleared, or you pick
up at par + 3 (`capOf`), which scores par + 3. Table shapes apply from hole 3.

- Gimmes (`findGimmes`, `tapIn`): a ball within two ball widths of an open pocket with a clear, nearly
  straight line from the cue ball (cut cos > 0.9) glows green with a "Tap in ⛳" label. Tapping it pots it for
  one stroke; the cue ball doesn't move. Tapping any other ball still targets it.
- Flow: `resolveParShot`, `finishParHole` (stamp: Eagle / Birdie / Par / Bogey / Double bogey / Picked up),
  `endParRound`, `showParFinal` (scorecard, 🟦🟩🟨🟥 per hole, share text "Daily Break 12 Nov ⛳ +2", rank
  line, practice button, countdown). Points and the streak still count, as a tiebreak.
- Header: hole n/6, par, score to par; info bar: strokes on this hole and score. Intro and help explain par.
- Saving: a ranked round in progress is saved to `dailybreak:run:<date>` (with `par: true`, the cards so far,
  strokes on the current hole and ball positions) after every shot and between holes; reloading carries on.
  The finished round is stored as `dailybreak:par:<date>` (cards, potted, points, best streak), so it can't be
  replayed and reopening shows "Today's round is in".
- Server: `sendResult` posts `{day, mode: 'par', score, strokes, points}`; the worker validates it (score
  −30..60, strokes 0..200), writes it to Analytics Engine with blob2 = 'par' (double1 score, double2 strokes,
  double3 points) and counts players per score in `DayCounts` (`p:<day>`); `GET /api/day?day=&mode=par`
  returns `{players, scores}` and the card says "Better than X% of today's players" (lower is better). The
  Results report has a par table (`par_report`) and keeps the level table for lives days.
- Not done: the device stats (days played, streak, best) and the near-miss line aren't on the par card yet.

## Obstacles (prototype, 11 Nov 2026; off in the live game)

`OBSTACLES_ON` is false; the test build turns it on. On par days, holes 3–6 each get at most one obstacle,
dealt for the day like the shapes (`obstFor`: water, windmill, gate and one hole with none, shuffled), placed
before the balls from their own random stream (`seed:obstacle:i`), so holes without one are unchanged. They
work with every table shape.

- 💧 Water hazard (`inPond`): a pond with a stony edge. A ball whose centre reaches the water splashes, is put
  back just outside where it went in, and costs a penalty stroke (`shot.splashes`); pots in the same shot
  still count, and it doesn't stack with a foul's penalty. Pot lines across the pond count as blocked.
- ✣ Windmill: two crossed bars (`BAR_T` half-thickness) that turn at `WM_W` (1.5 rad/s) only while balls are
  rolling, so it's still while you aim and the path hint stays exact. It sweeps balls it meets, resting ones
  included. A dashed circle shows its reach and an arrow its direction.
- ⇥ One-way gate: a hinged flap (`Table.gp`, how far open, up to `GATE_MAX`). A ball pushing from the open side
  swings it open and carries on (a small knock, then a gentle drag); from the other side it's a wall. It swings
  shut behind (`GATE_BACK`), never into a ball. Painted arrows show the way through; the aim line passes
  through it from the open side and stops at it from the solid side (`rayBar`).
- `obstBars` gives the bars' current positions to the physics, `trace`, `pathBlocked` and `respot`.
- Testing: 48 holes per obstacle (holes 3–6 on classic, hexagon, L-shape and oval) all had the obstacle,
  a real opening pot and were clearable; in 1,152 random shots no ball left the table, rested in water or
  stuck in a bar. Generation averages 11–21 ms per hole (worst ~160 ms).

## First shot (12 Nov 2026)

About half the phones that open the game never take a shot. Three changes aimed at the first shot:

- Funnel: two new steps, `intro` (closed the intro card, first visit only) and `pull` (touched the pull cue),
  between `open` and `shot`; the worker accepts them and the Results report shows them, so it's clear whether
  people leave at the card or at the gesture.
- Demo (`demoHand`, `tickDemo`, `demoPull`): until the player has ever touched the pull cue
  (`dailybreak:pulled`), on hole/level 1 a hand drags the cue control down and lets go on a 3.3 s loop, the
  control's stick and the cue on the table pulling back in step, with a tip "Drag the cue down, then let go".
  It stops the moment they touch the cue.
- First shot ever (`dailybreak:firstShot`, in `release`): a clean strike whatever the timing, and if the
  player's aim and pace wouldn't pot the ball they're aimed at, the nearest pot line (however far off they were) and the nearest
  pace that does are used. In testing, pulls of 13%, 20%, 40% and 87% all dropped the ball.
- The first shot also teaches the timing: if their real contact wasn't clean, the close-up shows the tip where it
  really landed with that grade ("Off-centre · Your tip landed here"), leaves a dashed red ring there, glides
  the tip onto the gold spot ("Aim for the gold spot · Let go when the tip is on it"), then flashes "Clean" before
  the shot plays (`zoom.teach`, `TEACH_*`; the strike waits `strike.end`). A
  clean first strike just says "Clean".
- And the aim: a new player's first shot starts 3.5° off the best pot line, still on the ball (`startOffTarget`).
  If they shoot without lining it up, an aim lesson plays before the timing one (`strike.lesson`, `aimLesson`,
  `AIM_*`; `strike.t` runs from −`AIM_T` to 0; the aim lesson takes about 5.3 s and the timing lesson about 5.1 s, slowed twice on 12 Nov so there is time to read them; the pull-cue hand demo loops every 3.3 s, `DEMO_T`): "This line misses", then a hand swipes the aim strip while the
  guide line turns onto the pot ("Swipe the aim strip to line it up"), then "Lined up!". Players who line it up
  themselves skip it.

## Spread-out racks and the aim reading (12 Nov 2026)

- From `SPREAD_FROM` (2026-11-13), and on practice courses, `buildHole` no longer places balls in touching
  clusters: every ball keeps a gap of 1.6 R (about a ball's width) from the others (rail balls still sit on
  cushions). Days before keep their clusters, so their layouts and saved rounds are unchanged. In testing (40
  holes, 13–20 Nov) the smallest gap was 28 px (was 2 px), every hole kept a real opening pot and was
  clearable, and generation got faster (9 ms average). A "bomb" to break up a cluster was suggested as an
  alternative; it could be an obstacle later.
- `aimOffset` (the aim strip's reading) is measured from the ball the line actually hits, not the ball first
  targeted, so it no longer shows readings like "115.2° right" when the line has swung onto another ball.
- Who sees it: it's per browser (localStorage), so everyone who has played before also sees it once after it
  launches (decided on 12 Nov: existing players should get the tutorial too). A new device, browser, private
  window or cleared site data shows it again.

## Teaching spin (12 Nov 2026, replaces the hole 3 spin tip)

- Hole 2 demo (`spinDemo`, `tickSpinDemo`): on the first shot of hole/level 2, until the player first touches the
  spin ball (`dailybreak:spinDemo`), the cue ball's path after contact is drawn in gold while a hand drags the
  gold spot down (draw: "Down is draw: the white ball comes back"), up (follow: "Up is follow: the white ball
  rolls on") and back, on a 6.4 s loop. Pulling back pauses it and restores the player's own spin.
- Scratch rescue (`scratchRescue`, `spinLesson`, `SPIN_*`): the first time ever a real shot (one that hits a
  ball) would scratch, after the first shot, the strike waits: "The white ball goes in", a hand drags the spot
  to a spin that keeps the cue ball out without changing what gets potted ("Draw it back with spin"), then
  "Spin keeps it out!", and the shot plays with that spin. Once ever (`dailybreak:scratchSaved`).
- The level/hole 3 spin tip and its pulse are gone; the spin ball still pulses when the pull-back path shows a
  scratch. The "Tap a ball to target it" tip moved from level/hole 2 to 3 so it doesn't clash with the demo.

## Short round with a feature on every hole (test, 14 Nov 2026; `SHORT_ON` is off in the live game)

Feedback: the round is too long, and it needs obstacles. The quick-shot prototype was scrapped the same day (its
three commits are reverted, so it's in the history). With `SHORT_ON` true, par days from `SHORT_FROM` (and
practice courses) change like this; other days and the live game are untouched (with it off, every hole and
shot is identical to before, checked on five days × six holes):
- At most `SHORT_MAX` (3) balls a table (`ballsFor`): holes have 1, 2, 3, 3, 3, 3 balls. Par is still the
  number of balls, +1 from hole 3 (`parOf` now takes the seed): 1, 2, 4, 4, 4, 4 = 19. Still six holes.
- Holes 3–6 each get one feature, dealt for the day from `FEATURE_KEYS` (windmill, gate, sand, cat; all four
  every day, shuffled; `obstFor`). No water: players found it annoying. The random rough/slick felt patches are
  off on these days; tilt, bumpers and closed pockets still appear.
- Placement (`placeFeature`, after the balls; 14 Nov): every feature goes where it gets in the way. Candidate
  spots lie on both legs (cue ball → ghost ball, object ball → pocket) of the 8 best open pots, at 35/50/65%
  along, and each is scored by the pots it affects weighted by `q`: sand by the legs crossing its ellipse
  (85–110 across, 48–62 along, lying across the leg; never over a pocket mouth or under the cue ball), the
  windmill by legs passing through its sweep, the cat and the gate (flap tried across the leg both ways and
  ±0.6 rad) by pots they block outright, which must leave at least one open. Every spot keeps clear of balls,
  pockets and bumpers. Share of the 4 best opening pots each one gets in the way of (15 days): sand 93%,
  windmill 69%, gate 62%, cat 60%. When the windmill and gate were dropped at random they managed 29% and 10%.
  `openingPot` and `clearable` try a harder pace (0.7 / 0.75) on sand holes.
- The cat (`placeFeature`, `Table.cat`, `Table.bumps`): it naps where it blocks the most good pots (as many
  as it can while leaving one open) as a big soft bumper (`CAT_R` 30, restitution `CAT_E` 0.3). `Table.bumps` is the hole's
  bumpers plus the cat, and physics, `trace`, `pathBlocked` and `respot` use it. Its eyes open when a ball
  rolls within 230 px. After a shot that hit it (`shot.catHit`, `catAfterShot`), it meows and hops to a new
  spot (seeded by day, hole and stroke), choosing one that blocks your best pot from the new cue position if it
  can while leaving at least one open ("Mrrp! The cat moved into your way"). A second hit, or one over 900,
  and it jumps down to its cushion by the table for the rest of the hole ("The cat's had enough"). Hitting only
  the cat is a foul like hitting only a bumper ("Only hit the cat"). It hops up from its cushion as the hole
  starts (`catAnim`; `drawCat` hides the room cat while it's on the table). Not saved mid-hole: a reload puts
  it back where it started.
- Intro and help text mention the three-ball cap and the features when it's on.
- Testing (15 days, 60 feature holes): every hole had its feature, a real opening pot, and was clearable;
  generation 11 ms on average, 40 ms at worst. 280 random shots on cat holes (85 hit the cat):
  no ball ended inside the cat, no NaN.
- Golden pocket (14 Nov; `goldHole`, holes 2–6): one pocket glows gold (`pickGold`, seeded by day and hole):
  never the pocket of the easiest pot, and one that some open pot goes into where possible (58% of holes in
  testing; the rest need a bank, combo or position). The first pot into it, on a shot without a foul, takes a
  stroke off the hole (`holeBonus`; "Golden pocket! −1 stroke") and the glow goes. No tap-in gimmes into it.
- Trick shots (14 Nov; `trickKinds`, any hole on a short round): a pot on a shot without a foul that's a
  Double/Triple (two or three balls), a Kick (the cue ball hit a cushion before its first ball: `shot.kick`,
  from `cue.cush` when `firstHit` is set), a Bank (a potted ball hit a cushion first; touches in a pocket's jaws
  don't count on a short round, so brushing the jaw isn't a bank) or a Combo (a single pot of a ball the cue
  ball didn't hit first). Each earns ⭐ ("Bank + Double! ⭐") with confetti and the slow-motion finish (the
  pre-shot simulation spots it); the first on a hole also takes a stroke off. Stars per hole go on the
  scorecard and the share text ("⭐×2 trick shots"). Of 335 ordinary direct pots, 3 were flagged (as banks).
  A trick-shot hole (a layout with a lined-up double on hole 6) was tried the same day and dropped: too easy,
  and trick shots should count on every hole.
- Generous guide (14 Nov; `generous`, `drawGuide`, short rounds only): the idea is less squinting at a line
  and more imagining the shot. The cue ball's line carries on once off a cushion or bumper to the next ball
  (kicks), and the object ball's line goes to the pocket, or once off a cushion (banks), or to the next ball,
  whose line it also shows (combinations). The lines are geometry only (`bounceOff` bounces off the cushion
  normal that `trace` now returns the way the physics does: the speed into the cushion drops to `CUSHION_E`
  (0.78; bumpers 0.9, the cat 0.3) and the speed along it is kept, so balls come off flatter than a mirror;
  bars stop the line, and so do pocket jaws, within 2.5 ball radii of a pocket, where the knuckles make a
  bounce unpredictable). Checked against the real cue ball path on the classic, hexagon, octagon and L tables
  (204 shots, cue ball alone, no tilt): 151 within 3° (a mirror was off by a median 6°), 52 stop at the jaws,
  1 off by 10° (an inside corner of the L). A pocket glows green when a clean centre-ball hit on this
  line really pots into it at a soft, medium or firm pace (`guideSim`: three `simulate` runs, redone only when
  the aim moves, tilt and sand included). That's simulated because the geometric "heading into a pocket"
  test was right only ~70% of the time at any tolerance. Nothing shows where balls stop.
- Harder strike (14 Nov; `strikeK`, short rounds only): with a generous guide the skill moves to the strike.
  From hole 3 `strikeK` ramps 0 → 1 over holes 3–5 and the gold spot shrinks (`SPOT_SHRINK` 15%), the tip
  wobbles wider (`WOBBLE_GROW` 12%) and faster (`WOBBLE_FAST` 15%), and an off-centre hit pushes up to 5°
  instead of 3° (`PUSH_EXTRA`). Measured on holes 3–6 over 12 days (best pot, medium pace): letting go at a
  random moment is clean 28% of the time (was 39%); waiting for the tip to reach the spot and letting go 0.2 s
  later, 71–83% (was 84–88%); an off-centre hit's average push 0.5–0.9° (was 0.3–0.4°). A first try at 25% /
  25% / 30% left the timed player at 48% on hole 6, too harsh. An aim snap (settling onto pot lines within
  0.35°) was tried the same day and removed: with the glow it made aiming too easy.
- Animation (14 Nov; short rounds only, all gated on `generous()`):
  - Ball on the lip (`lip`, in `frame`): when an object ball rolls slowly (20–330) towards an open pocket from
    within 2.6 ball radii, the rest of the shot is played out on a copy (once per ball and pocket per shot). If
    it drops, or stops within 1.5 radii of the pocket, the table goes to slow motion with a push-in and a
    heartbeat until it settles: "It dropped!" (confetti) or "So close!" (a groan, the jaws shiver: `p.wobble`,
    and the cat flinches). It came up once in ~100 auto-played shots.
  - Instant replay (`shotRec`, `startReplay`, `drawReplay`, phase `'replay'`): every frame of a shot is recorded
    with its physics time (`shotSteps` × `DT`). A trick shot (`trickKinds`) is replayed on that clock at one
    steady pace (45%, faster if needed to stay under ~5.5 s), blending between frames, rolling copies of the
    balls (`updateSpin` on proxies) and sinking them into their pockets, up to 0.7 s after the last pot; the
    edges darken like slow motion and the live trail is hidden. Titled "REPLAY · tap to skip" and the
    trick's name; the shot is scored after it (`replayed` stops it replaying twice). A tap skips it. (A first
    version stepped through recorded frames, so it sped up and slowed down with the live shot and looked off.)
  - Follow-through (`follow`, `drawCue(..., at, through)`): after the strike the cue drives on through where
    the cue ball was (up to 70 px at full power), eases back and fades over 0.5 s; the camera pushes in a
    little on the strike. Balls meeting harder than 250 flash, sized by speed (`fx.flashes`).
  - Ball tray (`drawTray`, `trayFly`, `trayDone`): a slot per ball down the right-hand edge; a potted ball
    flies there from its pocket once it has dropped and lands with a rising click. A resumed hole fills it.
  - The cat (`catLook`, `catStartle`): its head turns towards the nearest rolling ball (room cat when a ball
    is fast or it's startled; table cat when a ball is near), and hard hits or a ball stopping on the lip
    make it flinch with its ears flat.
  - Table slides between holes were tried and removed the same day (the playtester didn't like them).
- Windmill while aiming (short rounds): it keeps turning during aim and strike at its in-play speed
  (`WM_W` × `PLAY`, 1.1 rad/s), so it reads as alive and shots can be timed through a gap; the aim line, glow and
  path hint follow it. It waits while any ball rests inside its sweep, so it never turns into a resting ball.
- Freeze fix (14 Nov): a trick shot on a hole where a ball had been potted on an earlier shot made the replay
  sink that ball from a position it never had (NaN); the canvas threw and the frame loop died, freezing the game
  mid slow-motion. The replay now only sinks balls that drop during the shot, `drawBall` skips non-finite
  positions, and `frame` wraps `draw` in try/catch so a drawing error can never stop the loop again (this
  safety net is on for every round, not just short ones). 9 auto-played rounds afterwards: no errors.
- Carrying on after a reload (14 Nov): a playtester thought a table restarted; it was the test page being
  republished mid-game, which reloads it, and the round carrying on from its save (with the since-removed
  slide-in). Note: a reload mid-shot drops that shot (the save is made when a shot is scored), and the cat goes
  back to where it started the hole.
- Card strokes are `max(1, strokes − holeBonus)`; `holeBonus`, `goldUsed` and `trickDone` are saved with a
  run in progress (with `holeStars`).
- To go live: set `SHORT_ON` true and `SHORT_FROM` to the first day it should apply (a future day, so nobody's
  saved run changes mid-round). Open questions: seven holes instead of six (`HOLES`), and par on feature holes.
