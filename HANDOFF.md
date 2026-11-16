# Daily Break - handoff

A daily pool game for the browser, live at https://dailybreak.app. Six holes, scored like golf, the same for
everyone each day; a round takes a few minutes and ends with a shareable emoji scorecard. Plain HTML, CSS and
classic scripts, no framework and no build step to play: open `index.html` in a browser.

This file is the current state, by topic. What changed when, and the experiments that were tried and dropped,
are in `docs/CHANGELOG.md`.

## The rule that matters most

Every daily course is generated from its date by simulating shots, so **any change to the physics or the hole
generator silently changes everyone's course, today's included**. Never change the layout or play of today or an
upcoming day. Gate the change behind a date in `RULES` (`js/core.js`) instead, set to a day nobody has started yet
(remember time zones ahead of UTC are already on tomorrow). `npm test` enforces this (see Tests and deploy).

## The game

- **Six holes** (`HOLES`). Hole i (0-based) has `ballsFor(seed, i)` = min(i + 1, `SHORT_MAX` 3) balls: 1, 2, 3, 3,
  3, 3. Ball numbers are drawn from 1-15 (9-15 drawn as stripes).
- **Par** (`parOf`) is the number of balls, +1 from hole 3: 1, 2, 4, 4, 4, 4 = 19. Every shot is a stroke; a foul
  (scratch, no contact, or only hitting the cat) adds a penalty stroke, and balls potted on a foul stay down. A hole
  ends when it's cleared, or you pick up at par + 3 (`capOf`), which scores par + 3. Card strokes are
  `max(1, strokes - holeBonus)` (the golden pocket's stroke back). There are no lives, no shot order, no calling.
- **Hole 1-2** are on the classic table with no feature. **From hole 3**: a table shape for the day, one feature
  (sand, the cat, a tunnel; see Holes), and hazards (tilt, bumpers, a closed pocket) can appear. **From hole 2** one
  pocket is golden.
- **Points** are only a tiebreak, sent with the result (`PTS`, `scorePots`): a pot 100, bank +50, combo +50, each
  extra ball in one shot +50; consecutive potting shots multiply by `streakMult` (x1, x1.5, x2, x2.5, x3); finishing
  a hole (not picking up) adds 100 per ball in it. A miss or foul resets the streak.
- **Gimmes / tap-ins** (`findGimmes`, `tapIn`): a ball within two ball widths of an open pocket's mouth, with a clear,
  nearly straight line from the cue ball (`potLine` cos > 0.9), glows green with "Tap in ⛳". Tapping it pots it for
  one stroke and the cue ball doesn't move. Never into an unused golden pocket.
- **Date switches** (`RULES` in `js/core.js`, checked with `ruleOn(seed, from)`; a practice seed, anything that isn't
  a `YYYY-MM-DD`, always gets the newest rules):
  - `FORGIVE_FROM` 2026-11-16: a ball rattles out of a pocket only above `POT_MAX_FORGIVING` 1700 (was
    `POT_MAX_SPEED` 1050; `potMax`). Measured on 36 holes at four firm paces: pots 160 -> 300, rattle-outs 217 -> 73.
  - `NO_GATE_FROM` 2026-11-16: the one-way gate leaves the feature deck (sand and the cat only).
  - `TUNNELS_FROM` 2026-11-17: the deck is sand, the cat and a tunnel (`featureKeys`).
  - Folded in and always on (the old branches are deleted): par scoring and table shapes (12 Nov), spread-out racks
    (13 Nov), the short round with features and golden pockets (14 Nov). So 12-13 Nov no longer regenerate as they
    were played, and an old `?seed=` date opens a par practice round.

## A shot

Built for one thumb on a phone. The controls run top to bottom in play order: aim strip, spin ball, then the pull
cue down the right.

1. **Target.** Each shot starts aimed dead centre at the ball with the easiest pot (`lineUp` -> `bestBall`, by
   `potLine` quality `q`). If that start would already light a pocket's ring, it's turned by the smallest 0.5° step
   (up to 10° either way) that still hits that ball and doesn't pot (`startUnpotted`, `guidePots`), so the player
   always has to aim. Tap a ball on the table to target it (radius 3 R); Tab or `n` steps through balls in number
   order. A "Tap a ball to target it" tip shows on hole 3 until the player has done it (`dailybreak:tappedBall`).
2. **Aim.** Swipe the full-width aim strip like a scroll wheel (`js/input.js`): `AIM_FINE` 0.01° per pixel on slow
   swipes, gearing up smoothly (`aimGear`, above 120 px/s) to `AIM_GEAR_MAX` 24x (0.24°/px) on fast ones. A tap near
   either end nudges `AIM_NUDGE` 0.02°; arrow keys 0.02° (Shift: 1°). When the thumb lifts, up to `LIFT_PX` 3 px of
   movement in the last `LIFT_MS` 60 ms is undone (the finger rolling off the glass). Why so fine: a 0.1° error can
   move a long object-ball line by a whole pocket; the old 0.04°/px and 0.1° taps couldn't place long pots. The
   readout (`aimOffset`) shows hundredths of a degree from dead centre on the ball the line actually hits (not the
   one first targeted, which once gave readings like 115°). Dragging anywhere on the table also turns the cue,
   relative and geared by how far the finger moves around the cue ball (0.08° per screen pixel), so the thumb
   never covers the line.
3. **Guide** (`drawGuide`, `js/render.js`). Kept subtle (`GUIDE_A` 0.55 scales every line):
   - the cue ball's dashed line to the first thing it meets, a ghost ball there;
   - the object ball's solid line in full to the first thing it meets; off a cushion or bumper it carries on for one
     more, fainter leg, bent as the physics bends it (speed into the cushion x `CUSHION_E`, speed along kept), then
     stops at the next cushion, ball or pocket. It stops at a pocket's jaws (within 2.5 R) or a bar. No kick, combo or
     two-cushion lines: those are left to the player.
   - **The ring and the glow are one signal.** `guideSim.potsInto` is the set of pockets the *first ball hit* really
     drops into, for a perfect strike with the player's spin, at any of `GUIDE_PACES` (0.15-0.95), with the cue ball
     straight to it (`GUIDE_KICK` 0), the ball off at most `GUIDE_CUSH` 1 cushion and no scratch. Only when the
     pocket the drawn line goes into is in that set does the line light up warm and bright with a travelling shimmer
     (`onTargetPath`) and that pocket alone get the slowly turning dashed white ring (`ringPocket`, cap + 10)
     (`finishGuide`). A line into a pocket the ball wouldn't drop into fades out 2.5 R short of it. Why: the ring and
     line used to be decided separately and rings flickered on pockets the line didn't go near (a second ball, an
     undrawn bank) while lines ran into side pockets without lighting.
   - The ring doesn't depend on how hard you pull: the guide assumes the right pace; judging pace is the player's
     job. It never shows where balls stop. The Perfect edge (below) isn't assumed.
   - The moment the aim lands on a pot (`guideLock`) the line and ring flare for 0.6 s with a few sparkles, at most
     once a second so a sweep sets off one burst. No sound.
   - Cushions are counted the guide's own way (`guideWalls`, from each ball's `wallPts`): every contact, except
     touches in the jaws of the pocket it then drops into (corner ricochets do count).
   - Speed: each pace is answered by `guidePotsAt` (`js/physics.js`), which returns exactly what `simulate` would
     but stops as soon as the answer can't change (a scratch, too many cushions, or a travel bound showing nothing
     can still reach a ball or pocket; the bound is only used with no tunnel and tilt weaker than friction). Answers
     for the last 400 aims on an unchanged table are memoised (`guideSim.memo`). `simulate` itself is untouched
     because the generator depends on it. `tests/run.js` (fastsim) checks the two agree.
   - Tunnels: aiming into an opening, the dashed line stops there, the far opening glows (`tunAimWant`, `tunAimLit`)
     and the line carries on out of it on the same heading (`cueLeg`), which is exact geometry. The object ball's
     line also follows a tunnel (`objPath`).
4. **Spin.** The spin ball (106 px, 92 px under 380 px wide) under the aim strip: drag the gold spot up (follow) or
   down (draw), or tap where you want it; spot clamps to ±0.5 of the radius and snaps to centre within 0.06
   (`setSpot`), spin = `spinFor` (-1.4 x height, capped ±0.95). Names: Follow / Stun / Draw (`strikeName`). Every shot starts back on Stun (`lineUp`, from
   16 Nov). Spin is
   applied at the cue ball's first contact (follow carries on, draw comes back). **Path hint** (`spinPaths`,
   `cuePath`, `drawSpinPaths`): only while pulling back or dragging the spot, a fading line shows the cue ball's
   first `PATH_STEPS` 120 physics steps (half a second) after it meets the first ball, so a harder pull draws a
   longer line; a red X if it scratches in that window, and the spin ball pulses.
5. **Pull and release** (`#pull`, `startHold`, `letGo`). Drag the tall cue down for power (`PULL_PX` 150 px = full;
   pace names Soft/Medium/Firm/Hard/Smash, `PACE`); push back above `MIN_PULL` 0.04 and let go to cancel; hold Space on
   desktop (arrows adjust power while held). While you hold, a close-up of the cue ball sits in the bottom-left
   (`contactPanel`, `drawContact`) with the gold spot and the tip wobbling over it (`tipPos`), labelled Short shot /
   Medium shot / Long shot · shaky. A tick sounds as the tip enters the spot, a higher one in the bullseye.
6. **Contact** (`contactDiff`, `contact`, `js/game.js`). Difficulty d, from 17 Nov (`RULES.SHOT_READ_FROM`):
   `readShot` simulates a perfect strike along the aim at the first of `READ_PACES` where a ball drops (cached per
   aim, spin and table) and `trickiness` scores it: distance (cue ball's run to the first ball + 0.7 x the potted
   ball's run to its pocket), the cut angle (free up to 15°, full at 70°), +0.09 per cushion (object-ball bank or
   cue-ball kick, up to two) and +0.08 for a combination (the potted ball isn't the one first hit); weights in
   `TRICK`. If nothing drops, the old straight-line reading (`shotGeom`). The close-up's label names it
   (`shotWord`: "Tricky bank shot", "Shaky combination", "Tricky thin cut"...). Before 17 Nov: mostly distance (cue
   ball to first ball, plus 0.6 x that ball's run to the cushion). Either way, plus spin, power and +0.1 on sand. The spot radius is `spotR` = lerp(0.22, 0.09, d);
   the wobble grows with d. Harder strike from hole 3: `strikeK` ramps 0 -> 1 over holes 3-5, shrinking the spot
   `SPOT_SHRINK` 15%, widening the wobble `WOBBLE_GROW` 12% and speeding it `WOBBLE_FAST` 15%, and raising the maximum
   push from `PUSH_MAX` 3° by `PUSH_EXTRA` 2°. Why: the guide makes aiming easy, so the skill sits in the strike. Grades:
   - **Perfect** (tip within `PERFECT_CORE` 0.4 of the spot's radius) and **Clean** (rest of the spot) both play
     exactly as aimed. (Clean used to push up to `GOOD_PUSH` 0.15°; players couldn't see why a Clean missed.)
   - **Nearly / Off-centre**: pushed off line the other way from the tip (starting from `GOOD_PUSH`, up to the max),
     and high/low error changes the spin.
   - **Miscue** (tip beyond 0.6 sideways or well off the spot): -4°, 35% power, no spin.
   - A Perfect strike's shot gets slightly kinder pockets (`table.shot.perfect`): capture radius x`PERFECT_POCKET` 1.12
     and rattle speed x`PERFECT_POCKET_PACE` 1.15 (568 -> 717 balls potted on the same test shots). Its feel is a
     small gold sparkle, "Perfect strike!" and a soft two-note lift (the flash, slow motion and trail were too much).
   - After an off-centre strike the object ball's line visibly swings from the aimed line to the real one, gold if
     it still drops and amber if not (`skew`, `skewGeom`, `drawSkew`).
   - Timing: on release the close-up zooms to the middle, the tip lands at `STRIKE_T` 0.34 s with the click and the
     grade, and only at `SHOOT_T` 0.66 s does the table cue strike, so contact with the object ball is always in view.
     The cue then follows through (`follow`).
7. **While the balls roll** (`frame`, `js/main.js`): the table plays at `PLAY` 0.75x; once everything is under 35
   after 2 s it runs at 1.6x; a tap on the table (after 0.8 s) fast-forwards at 3x (`ffwd`). Slow motion (0.25x) with
   a push-in for the last ball of a hole from hole 3, any trick shot (`cine`), and a ball on the lip (`lip`: an
   object ball rolling 20-330 towards an open pocket from within 2.6 R is played out on a copy; if it drops or stops
   within 1.5 R the table slows, a heartbeat plays, then "It dropped!" or "So close!").
8. **Trick shots** (`trickKinds`): a foul-free pot that's a Double/Triple, a Kick (cue ball off a cushion first), a
   Bank (potted ball off a cushion; jaw touches don't count), a Combo, or through a Tunnel gets an instant replay
   before it's scored (`shotRec`, `startReplay`, `drawReplay`: recorded physics time, one steady pace of at least
   45%, kept under ~5.5 s, up to 0.7 s after the last pot; tap to skip). No stars or strokes back: a stroke back made
   scores too low (a playtest went -9).

## Holes and generation (`js/core.js`)

- **Deterministic.** `rngFor(key)` = mulberry32 over an FNV hash of `'daily-break:' + key`. `makeHole(seed, i)` calls
  `buildHole(seed, i, attempt)` (stream `seed:level:i[:attempt]`) up to 60 times and keeps the first layout with the
  right ball count, its feature placed, a real opening pot (`openingPot`) and clearable (`clearable`); else the first
  with an opener. Results are cached (`holeCache`) and the next hole is built 1.5 s into the current one.
- **`openingPot`**: one of the 4 best unblocked pots (cos > 0.55) really drops in simulation with a centre-ball hit at
  0.3/0.42/0.55 power (0.7 too on sand), no scratch.
- **`clearable`**: a bot with perfect execution (best 4 pots x stun/follow/draw x three paces, 0.75 too on sand, keeping
  the best leave via `leaveQ`) must clear all N balls in N shots with no foul. Before this check, a fifth to two thirds
  of bigger racks were impossible even with perfect play.
- **Racks**: cue ball in the lower third; each ball 22% on a cushion, otherwise open; every ball keeps a 1.6 R gap from
  the others (no touching clusters: clusters made unfair layouts).
- **Hazards** from hole 3 (`hz` = i - 1): a closed pocket (p 0.04 + 0.04 hz), brass bumpers (`BUMPER_E` 0.9; p 0.08 +
  0.05 hz), tilt (p 0.1 + 0.06 hz, one of 8 directions, shown in the info bar).
- **Table shapes** (`SHAPES`, `mkShape`, `shapeFor`): from hole 3 each hole is dealt from classic + Hexagon, Octagon,
  L-shape, Hourglass (waist 250 px; 160 px rejected ~14 layouts a hole), Oval and Island (a raised walnut block, drawn
  with a shadow and bevel because a flat one read as a mat), like a shuffled deck: all seven before a repeat, never
  the same twice running. Each fits the 500 x 1000 box with six pockets. Cushions are segments (`sh.segs`) with
  normals into the felt; `trace` casts against them (`rayCushion`), `pocketAim` aims just inside each mouth, and
  `pathBlocked` counts inward corners (`sh.reflex`) and islands. Balls are placed only where they fit (`freeIn`).
- **Features** (`obstFor`, `placeFeature`): holes 3-6 each get one, dealt from `featureKeys(seed)` shuffled for the day
  (so one comes up twice). Each goes where it gets in the way: candidate spots on both legs (cue -> ghost, ball ->
  pocket) of the 8 best open pots at 35/50/65% along, scored by the pots it affects weighted by `q`.
  - **Sand** (a patch with `bunker: true`): an ellipse 85-110 across and 48-62 along, lying across a leg, never over a
    pocket or the cue ball. Balls in it slow hard (3.2x rolling friction, 1.6x damping). Gets in the way of 93% of
    the best opening pots in testing.
  - **The cat** (`CAT_R` 30, restitution `CAT_E` 0.3: soaks up a hit). Naps where it blocks the most good pots while
    leaving one open; `Table.bumps` is the bumpers plus the cat. Its eyes open when a ball rolls within 230 px and it
    turns its head (`catLook`). After a shot that hit it (`catAfterShot`), it meows and hops to a new seeded spot
    that blocks your best pot if it can (never all of them); a second hit, or one over 900, and it leaves for the rest
    of the hole. Not saved mid-hole: a reload puts it back.
  - **Tunnel** (from 17 Nov; `h.tunnel = { a, b }`, each the middle of an opening on a cushion line with its normal).
    Two openings in facing straight outer cushions (`tunRails`, normals opposite), joined under the table: a ball that
    rolls into one (`tunLocal`, within `tunReach`: `TUN_HALF` 2.4 R, plus up to R more for an angled approach, the
    flared mouth) is under for `TUN_T` 0.35 s, then comes back in at `tunExit` of the other on the same heading at
    `TUN_KEEP` 92% pace. `tunnelSearch` builds openings from pots (exit -> ghost ball heading, entrance where the cue ball
    meets the facing cushion on it), preferring pots that are hard or blocked the normal way, and keeps one only if
    the tunnel shot really pots in simulation (`h.tunnelShot`). The oval has no facing pair, so an oval tunnel hole
    takes the next feature in the deck. Why on the cushions: in the middle of the table they took over the hole.
  - **One-way gate** (dealt only up to 15 Nov; `BAR_T`, `GATE_MAX`, `GATE_BACK`, `Table.stepObstacle`, `obstBars`,
    `rayBar`): a hinged flap that swings open from one side and is solid from the other. Kept for old days.
  - The random rough/slick felt patches, water and the windmill are gone (water annoyed players; see the changelog).
- **Golden pocket** (`goldHole`, `pickGold`, holes 2-6): never the pocket of the easiest pot, and one some open pot goes
  into where possible. The first pot into it on a foul-free shot takes a stroke off the hole (`holeBonus`, `goldUsed`).
- `shapeOverride` / `obstacleOverride` force a shape or feature; nothing sets them now.

## Physics (`js/physics.js`)

`Table` steps at a fixed `DT` 1/240 s: exact-contact ball collisions (`BALL_E` 0.95), rolling friction (`ROLL_DECEL`
240 + `LIN_DAMP` 0.32 x speed, stop under `STOP` 6), tilt, sand, cushions (`CUSHION_E` 0.78), bumpers, the cat, the
gate, tunnels, pockets (capture `cap`: corner 1.75 R, side 1.55 R; rattle above `potMax`). It records per-ball cushion
counts (`cush`, used for banks; jaw touches excluded) and contact points (`wallPts`, for the guide), and per shot
`firstHit`, `kick`, `kickWalls`, `pots`, `scratch`, `tunnels`, `catHit`. `simulate` plays a shot out on a copy
(`cloneTable`); `potLine`/`allLines` give the geometric pots with a quality `q`. All deterministic, so a server could
replay shots to validate a score.

## Round flow, scoring and results (`js/game.js`, `js/ui.js`)

- `newRound` -> `startHole` (banner: hole, table, feature, golden pocket, balls, par) -> shots (`release` ->
  `frame` -> `resolveShot`) -> `finishHole` (stamp: Eagle / Birdie / Par / Bogey / Double bogey / Picked up; the next
  hole starts by itself ~2 s later) -> `endRound` -> `showFinal`.
- **Result card** (`showFinal`): score to par, strokes and par, best streak, the scorecard, 🟦🟩🟨🟥 per hole
  (`cardEmoji`: under / par / one over / two or more), the rank line, share button, practice button, practice left,
  device stats (`statsHtml`, `dayStats`: days played, day streak, best and average score; counts old
  `dailybreak:ladder:` days too), countdown to local midnight (`tickNext`), and a feedback link hidden while
  `FEEDBACK_EMAIL` is empty (set it to hello@dailybreak.app once Email Routing forwards it).
- **Share text** (`shareText`): `Daily Break 15 Nov ⛳ +2`, the emoji row, and the plain site URL (`gameUrl`, no
  `?seed=`, so friends land in today's game). Uses the phone's share sheet (`navigator.share`, coarse pointers only)
  or copies. Days are named by date (`dayLabel`, en-GB), never numbered. Players never see the word "ladder" (it
  reads as a ranking table in the UK).
- **Rank** (`loadRank`, `fillRank`): "Better than X% of today's players" (X = players with a worse score / everyone
  else; no player count on purpose), "Best round today so far 🏆", "Joint best…" or "You're the first to finish…".
  Only on dailybreak.app, ranked daily rounds.
- **Practice** (`startPractice`): 3 a day per device (`PRACTICE_PER_DAY`), each on a random seed (the "Practice course" button),
  unranked, labelled "Practice · not ranked". A `?seed=` link opens a practice round (uses one) or,
  with none left, today's game.
- **Saved data** (localStorage via `ls`; per browser, so a new device or cleared data shows tutorials again):
  - `dailybreak:par:<date>`: the finished ranked round (cards, potted, points, bestStreak). Its presence means
    "Today's round is in" and no replay.
  - `dailybreak:run:<date>`: a ranked round in progress (`saveRun` after every shot and between holes: level, cards,
    strokes, bonus, gold, points, streak, cue and ball positions; `par: true`). `resumeRun` carries on ("Carrying on
    · N balls left"); a saved hole whose ball count no longer matches starts fresh. A reload mid-shot drops that shot.
  - `dailybreak:ladder:<date>`: old lives-ladder results, only read by `dayStats`.
  - `dailybreak:practice:<date>`, `dailybreak:ev:<day>:<step>` (funnel dedupe), `dailybreak:me`.
  - Tutorial flags: `seenHelp`, `firstShot`, `pulled`, `spinDemo`, `scratchSaved`, `scratchTips`, `tappedBall`,
    `usedSpin` (written, no longer read). Sound: `muted`, `music`.

## Teaching (first visits)

About half the phones that open the game never shot, so the first shot is heavily helped:

- **Intro** (`showIntro`) on a first visit, three lines; the full guide is behind **?** (`showHelp`). Both adapt to the
  day's features.
- **Pull demo** (`demoHand`, `tickDemo`, `demoPull`, `DEMO_T` 3.3 s loop) on hole 1 until the player first touches the
  pull cue: a hand drags the cue down and lets go ("Drag the cue down, then let go").
- **First shot ever** (`dailybreak:firstShot`, in `release`): starts 3.5° off the best line (`startOffTarget`); always a
  clean strike; if their aim and pace wouldn't pot, the nearest pot line and pace that do are used. If they didn't
  line it up, an aim lesson plays first (`aimLesson`, `AIM_T` ~5.3 s: "This line misses", a hand swipes the strip,
  "Lined up!"); if their real contact wasn't clean, a timing lesson (`zoom.teach`, `TEACH_T` ~5.1 s: where the tip
  really landed, a glide onto the gold spot, "Clean").
- **Spin demo** (`spinDemo`, `tickSpinDemo`, `SPIN_LOOP` 6.4 s) on hole 2's first shot until the spin ball is touched:
  the path drawn in gold while a hand drags the spot to draw and follow.
- **Scratch rescue** (`scratchRescue`, `spinLesson`, `SPIN_T`): the first real shot ever that would scratch pauses, a
  hand drags the spot to a spin that keeps the cue ball out without changing what's potted, and plays it. Once.
- "Scratch ahead: try spin" the first three times the path hint shows a scratch (`dailybreak:scratchTips`).
- These are deliberately shown to existing players once too (decided 12 Nov).

## Look and audio

- Top-down retro room: plank floor, rug, armchair, swaying plants, a spinning record player, a sleeping cat (it moves
  onto the felt on cat holes), window light, cloud shadows, dust motes, vignette and film grain (hopping ~12 times a
  second; sliding read as rain). Walnut table, sage felt. UI in DM Sans + DM Mono. One slim header (title, hole/par/
  score chips via `renderCard9`, sound button cycling all / effects only / off, help), an info bar (strokes, score,
  tilt), then the controls. The canvas gets as much height as possible.
- Juice: pot sinks and pocket glow, gold edge glow growing with the streak, screen shake, 30-45 ms hit-stops,
  flashes on hard contacts (`fx.flashes`), chalk puffs, a tray down the right edge that potted balls fly into
  (`drawTray`, `trayFly`), confetti on under-par holes, a golden glow on the golden pocket.
- **Scenery cache** (`sceneryReady`, `paintLayer`): the still room (floor, rug, chair, turntable base) and table (rail,
  felt, still markings, pockets) are painted once per hole and view into two device-resolution canvases and copied
  each frame (repainting them was ~8 ms a frame on a software canvas). Two layers because the cat sleeps between them.
  While the camera pushes in (`cam.k` > 1) everything is drawn directly. Shake offsets the copy into `SHAKE_PAD`.
  Cloud shadows are drawn at quarter resolution (`CLOUD_BUF`). `frame` wraps `draw` in try/catch so a drawing error can
  never stop the loop (a replay NaN once froze the game).
- **Audio** (`js/audio.js`): all procedural Web Audio, no files; effects panned by table position (`atX`). Woody ball
  clacks, padded cushion thuds, a deep wooden clunk into the pocket (`sfx.drop`), pot notes climbing a pentatonic
  scale with the streak (`sfx.potNote`), tunnel drop/rumble/thunk (`sfx.tunnel`, `sfx.tunnelRoll`, `sfx.tunnelOut`),
  strike sounds per grade, a rolling rumble following total ball speed (`rollGain`), and an electric-piano loop
  (`epiano`, `playChord`). No background hiss. iPhone: unlocked on the first touchend/click/keydown (`unlockAudio`; iOS
  doesn't count pointerdown) and resumed when the tab returns; the silent switch mutes it. Vibration (`buzz`) is
  Android only.

## Code layout

`index.html` holds the CSS, the HTML and the meta tags, and loads the game as classic scripts in this order. They share
one global scope, so a top-level name in one file is visible in all; code that runs at load must only use earlier
files. Each file's header says what it holds and relies on.

| File | Holds |
|---|---|
| `js/core.js` | no DOM: `RULES`, constants, RNG, day/course names, shapes, features, hole generation |
| `js/physics.js` | no DOM: `Table`, `cloneTable`, ray casts (`trace`), `potLine`/`allLines`, `simulate`, `guidePotsAt` |
| `js/state.js` | DOM helpers (`$`, `ls`, `buzz`), canvas, timing and scoring constants, shared game state |
| `js/audio.js` | Web Audio effects and music |
| `js/game.js` | table events (`onEvent`), round/hole flow, aim/spin/power setters, strike, scoring, result card, saves, tracking, rank |
| `js/ui.js` | header and info bar, spin ball, lessons and demos, aim strip readout, intro/help cards, practice, stats, sharing |
| `js/input.js` | table drag, aim strip, spin ball, pull cue, keys, sound/help buttons, `resize` |
| `js/render.js` | the canvas: balls, room, cat, features, table, spin paths, guide, close-up, cue, tray, scenery cache, `draw` |
| `js/main.js` | `frame` and startup (today's round or `?seed=`, intro, funnel `open`) |

`tools/build.sh` copies `index.html`, `static/*` and `js/` into `dist/` (only that is published, so HANDOFF.md and
`.git` stay private) and stamps each script tag `?v=<first 10 hex of its sha256>`, so a phone never mixes a new page
with cached old scripts; it fails if a tag is left unstamped. `static/` has the link-preview card (`og.png`, 1200x630,
drawn in `tools/og-card.html`; bump the `?v=` on `og:image` when it changes), icons and `manifest.webmanifest`.

## Tests and deploy

`npm ci`, then `npm test` (Node 22; Playwright Chromium: `npx playwright install chromium`):

- `tests/worker/worker.test.mjs` (plain Node, fake bindings): valid par and lives results, rate limits (6th result in a
  burst -> 429, 31st event -> 429), missing or throwing limiters allow, bad bodies 400, `left` events, 405 on GET,
  `/api/day`, the host redirect, assets.
- `tests/run.js` builds `dist/` with `tools/build.sh`, serves it and runs in headless Chromium (`--only a,b` to pick):
  - **layouts**: every daily course from `LAYOUT_FROM` 2026-11-12 to `LAYOUT_TO` 2027-01-31 plus three practice seeds,
    each hole hashed and compared with `tests/layouts.json`. If a course from yesterday (UTC) on changed, it says so
    and tells you to gate the change behind a `*_FROM` date.
  - **guide**: sweeps the aim ±4° across every ball on `GUIDE_DAYS` (15, 17, 24 Nov); every lit pocket must be a real
    pot of the followed ball at some guide pace, and only one pocket lit.
  - **fastsim**: `guidePotsAt` gives exactly the full simulation's pockets (two days, three spins, ±5°).
  - **smoke**: a first visit: intro, "Let's play", one real pull-and-release shot, no page errors.
- `npm run test:update` rewrites `tests/layouts.json`. Only when a change is meant to alter layouts, and never for
  today or a day already played or about to be: gate behind a `RULES` date and extend the snapshot instead.
- CI: `.github/workflows/test.yml` runs on pull requests (and is callable); `deploy.yml` runs on pushes to `main` (or
  by hand), calls the tests and deploys only if they pass (`tools/build.sh && npx wrangler@4 deploy`, secret
  `CLOUDFLARE_API_TOKEN`). By hand: `tools/build.sh && npx wrangler deploy`.

## Server (`src/worker.js`, `wrangler.jsonc`)

Cloudflare Worker `daily-break`, static assets from `dist/`, worker first. Custom domains `dailybreak.app` and
`www.dailybreak.app`; any host other than `HOST` (www, the old workers.dev) gets a 301 to dailybreak.app. If the domain
changes, change `HOST`, `SITE_URL` (`js/ui.js`) and the meta tags together. Domain bought 10 Nov 2026 through
Cloudflare Registrar.

- `POST /api/result`: `{day, mode: 'par', score, strokes, points}` (score -30..60, strokes 0..200) -> Analytics Engine
  `daily_break_results` (blob1 day, blob2 'par', double1 score, double2 strokes, double3 points) and counted in
  `DayCounts` under `p:<day>`; replies `{players, scores}`. The old lives format `{day, level, potted, points}` is still
  accepted (key `d:<day>`, blob2 empty). The day must be within the window a local calendar can be on
  (`dayIsCurrent`: noon UTC of that day within -2.5 / +1.5 days of now).
- `POST /api/event`: `{day, step}` -> `daily_break_events` (blob1 day, blob2 step); `left` adds `{secs, where}` as
  blob3 and double2.
- `GET /api/day?day=&mode=par`: `{players, scores}` (without `mode`, the old level tally).
- **Rate limits** (Workers Rate Limiting, keyed on `cf-connecting-ip`, never stored): `RESULT_LIMIT` 5/min (429
  `{error: 'slow down'}`), `EVENT_LIMIT` 30/min (429, no body). A real player sends one result and ~10 events a day. A
  missing or failing limiter allows the request.
- **`DayCounts`**: one SQLite-backed Durable Object named "all", key -> `{ score: count }`, nothing else.
- Anyone can post, so treat the numbers as a guide, not a leaderboard.
- **Results report**: Actions > Results > Run workflow (`tools/results.py`; token needs Account Analytics Read). The
  summary has visits/referrers/devices from Web Analytics, the funnel, "Left before the first shot", the par table
  (`par_report`) and the level table for old days.

## Analytics and the funnel

- `track(step)` (`js/game.js`) sends one anonymous `{day, step}` per step per device per day (`dailybreak:ev:` keys),
  ranked daily rounds on dailybreak.app only: `open` (+ `opennew` / `openback`), `intro` (closed the intro, first
  visit), `pull` (touched the cue), `shot`, `clear1`, `level3` (reached hole 3), `finish`. `left`: the first time the
  page is hidden before today's first shot, with seconds since load and the screen (`intro`, `table`, `pulled`); some
  come back later, so read it as "went away", not "quit".
- `sendResult` posts the result at the end of a ranked round, from dailybreak.app only.
- `?me=1` marks a browser as the developer's (`dailybreak:me`; `?me=0` undoes it): no funnel events or results (the
  card still shows the rank).
- Cloudflare Web Analytics (cookieless) loads only once `CF_ANALYTICS_TOKEN` in `index.html` is filled in.

## Open questions and ideas

- Seven holes instead of six (`HOLES`); par on feature holes; which shapes and features appear on which holes.
- More mini-golf features (portals or bridges linking parts of a table); a "bomb" to break up clusters was suggested.
- Replay of the best shot at the end of a round; an optional position target for a bonus.
- A leaderboard with friends, validated by replaying shots on the server (the physics is deterministic).
- A near-miss line on the result card (the ladder had one; par doesn't).
