# Daily Break - handoff

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
6. **Pull back and release.** The tall cue on the right is the power and the trigger: drag down to load power (150 px = full; the table cue pulls back to match), let go to shoot, or push back to the top and let go to cancel (hold Space on desktop). While you hold, a close-up of the cue ball (centred, at the height furthest from the shot) shows the gold spot (your spin) and the cue tip wobbling over it (`tipPos`). When you let go is the timing challenge (`contact`): on the spot plays the shot exactly; off to the side pushes the line up to 3° the other way; high/low error changes the spin; out at the edge is a miscue (−4°, 35% power). `contactDiff` sets the spot size and the wobble, mostly from distance (cue ball to first ball, plus that ball's run on), plus spin, power and rough felt. On release the close-up zooms to the middle and plays the strike with a grade (Clean / Nearly / Off-centre / Miscue): the tip lands at `STRIKE_T` (0.34 s, with the click), the close-up fades out, and only then (`SHOOT_T`, 0.66 s) does the cue on the table strike and the balls roll, so the contact with the object ball is always in view (`zoom`, `drawContact`).

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

Saved runs (11 Nov 2026): a ranked run in progress is saved to `dailybreak:run:<date>` after every shot
and at the start of every level (`saveRun`: level, lives, balls potted, results, points, streak, misses,
cue and ball positions; after a clear it saves the start of the next level). `resumeRun` restores it
on load ("Carrying on · N balls left"), so reloading can't restart a bad run and an interrupted player
keeps their progress. The save is removed when the run ends and never written for practice or once
today's result exists.

## Pace and the pull-back close-up (11 Nov 2026)

- The table plays at 0.75× (`PLAY`) so there's time to watch the balls; outcomes are unchanged. The
  automatic speed-up waits until everything is under 35 after 2 s and runs at 1.6×, and a tap fast-forwards
  at 3× (was 1×, then 2× after 1.2 s under 70, and 4× on a tap).
- While you pull back, the cue-ball close-up (the timing challenge: gold spot and wobbling tip) sits centred
  left to right, at whichever of three heights (top, middle, bottom of the table view) is furthest from the
  shot: the cue ball, aim line, object-ball line and spin path (`contactPanel`, `placePanel`, `shotPoints`).
  It picks a spot when it appears and only glides elsewhere if the path grows into it while you pull. Radius
  20% of the smaller side (64–110 px); pops in over 0.16 s; on release it grows from there into the strike.
  It used to sit bottom left; a fixed centre spot hid the spin path, and a camera that panned the cue ball to
  the centre was also tried and dropped.
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
table with a walnut block in the middle).

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
