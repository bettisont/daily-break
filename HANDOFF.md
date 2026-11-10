# Daily Break - handoff

A daily pool game for the browser: a ladder of levels, the same for everyone
each day. Level 1 has one ball, level 2 two, and so on; you have three lives,
and your score is how far you get. One ranked run a day of about two to four
minutes (daily puzzles like the NYT Mini take a few minutes; that's the
target), with a shareable emoji result. Single file: `index.html` (no build, open it in a
browser).

## The game (as of 2026-11-10): the ladder

Level *i* (1-based) is a fresh seeded layout of *i* balls (`makeHole(seed, i - 1)`, up to `MAX_BALLS` = 15; numbers drawn from 1–15, 9–15 drawn as stripes), the same for everyone on the day, with the cue ball placed by the layout. About a third of the balls sit in clusters and some on the cushions; pockets are tight (corner capture 1.75 R, side 1.55 R). Hazards start at level 3 and ramp up (`hz` = level − 2, capped at 8): table tilt, rough felt, slick felt, brass bumpers and an occasional closed pocket. **The first shot of every level is always a real pot:** `makeHole` re-rolls (deterministically) until `openingPot` finds an unblocked, not-too-thin cut that a centre-ball hit at a sensible pace actually sinks in simulation (tilt and felt included) without scratching. **And the whole level must be clearable:** `clearable` plays it with a bot of perfect execution (each shot: the best 4 pots × stun/follow/draw × three paces, keeping the one with the best next pot via `leaveQ`) and must clear all N balls in N shots without a foul; otherwise the layout is re-rolled (up to 60 tries, falling back to the first with a good opener). Before this check, 20–65% of levels 4–10 were impossible to clear even with perfect play (frozen pairs on a rail, balls tucked behind others). Generation averages 3–36 ms per level (worst seen ~150 ms at level 12); results are cached (`holeCache`) and the next level is built in the background 1.5 s into the current one.

**Lives** (`LIVES` = 3): a shot that pots nothing, or a foul (no contact, scratch), costs a life; balls that drop on a foul stay down. Clear every ball to move up; clearing a level without losing a life wins one back (up to 3). At zero lives the run ends on the level you were playing (`endRun`). Within a level the cue ball stays where it stops, so position play matters. There is no shot limit and no ball order.

A shot (built for one thumb on a phone). The controls run in play order, top to bottom: target → aim → power → strike.

1. **Target.** Each shot starts aimed dead centre at the ball with the easiest pot (`lineUp` → `bestBall`). The target button (top left; Tab on desktop) steps through the balls in number order; tapping a ball on the table targets it too.
2. **Aim.** The full-width **aim strip** is swiped left/right like a scroll wheel: 0.04° per pixel when slow, gearing up to 6× when fast; a tap near either end nudges 0.1°. Its centre reads the offset from dead centre. Dragging anywhere on the table also turns the cue, relative to where you start and geared by how far your finger moves around the cue ball (0.08° per screen pixel), so your thumb never covers the line. Arrow keys: 0.1° (Shift: 1°).
3. **Guide**: the aim line, ghost ball and a long (330 px) object-ball line on every level. The object-ball line is pure geometry (no tilt or felt). The challenge comes from the timed release, more balls and position play.
5. **Spin.** The spin control is the same cue-ball face as the close-up, small, next to the target row: drag the gold spot up (follow) or down (draw), or tap where you want it; the further from the middle, the stronger (spot ±0.5 of the radius, continuous; snaps to centre). It's the same gold spot you aim for when you release. **Path hint** (`spinPaths`, `drawSpinPaths`): only while pulling back or dragging the spin spot, a fading white line shows the cue ball's first half second after it meets the first ball (`PATH_STEPS` = 120 physics steps), so a harder pull draws a longer line; a red X if it would scratch inside that window. No resting spot is shown: where it stops is for the player to judge.
6. **Pull back and release.** The tall cue on the right is the power and the trigger: drag down to load power (150 px = full; the table cue pulls back to match), let go to shoot, or push back to the top and let go to cancel (hold Space on desktop). While you hold, a close-up of the cue ball (bottom left of the table) shows the gold spot (your spin) and the cue tip wobbling over it (`tipPos`). When you let go is the timing challenge (`contact`): on the spot plays the shot exactly; off to the side pushes the line up to 3° the other way; high/low error changes the spin; out at the edge is a miscue (−4°, 35% power). `contactDiff` sets the spot size and the wobble, mostly from distance (cue ball to first ball, plus that ball's run on), plus spin, power and rough felt. On release the close-up zooms to the middle and plays the strike with a grade (Clean / Nearly / Off-centre / Miscue): the tip lands at `STRIKE_T` (0.34 s, with the click), the close-up fades out, and only then (`SHOOT_T`, 0.66 s) does the cue on the table strike and the balls roll, so the contact with the object ball is always in view (`zoom`, `drawContact`).

Scoring (the tiebreak under "level reached"; `PTS`, `resolveShot`, `finishHole`): every pot 100; bank +50; combo +50; each extra ball in one shot +50; consecutive potting shots build a streak multiplier ×1, ×1.5, ×2, ×2.5, ×3 (`streakMult`) that carries across levels and resets on a miss or foul. Clearing a level adds 100 per ball in it. The hint next to the spin ball shows what the next pot is worth and your lives; the header shows the level and hearts.

Feedback: pot sounds climb a pentatonic scale as the streak builds (`sfx.potNote`), with a bell from the second pot in a row; floats count down the balls left ("3 to go", "Level clear!") or name a Bank/Combo; losing a life plays a falling phrase with a 💔, and winning one back a rising chime; screen shake grows with the streak. When a shot will clear a level of 3+ balls (`release` simulates it first), the last ball gets slow motion (0.25×), a camera push-in and a darker vignette as it nears the pocket (`cine`, `cam`, `timeScale` in `frame`).

Juice (all procedural Web Audio, no files): sounds are panned left/right by where they happen (`atX`). Ball clacks have a woody body; cushions thud (with a rubbery bounce on hard hits) and puff chalk dust; hard ball hits freeze the frame for 30 ms (`hitStop`) with a small shake. A pot plays a leather "thunk" and the ball rolling down the return (`sfx.drop`), the pocket glows, the ball spirals in as it shrinks, a 45 ms hit-stop lands it, and the screen edges glow gold (`fx.glow`, stronger with the streak); streaks of 3+ add a bass swell (`sfx.boom`), and two or more balls in a shot call "Double!"/"Triple!" with a rising arpeggio. When spin takes hold off the object ball the table emits a `spin` event: a zip back for draw or a surge for follow, with gold arcs whirling round the cue ball (`spinFx`). The strike is a solid "thock" (a skid and a puff of chalk for a miscue); the pull-back cue creaks per 5% and thumps at full power; the spin spot clicks in pitch as it moves and snaps at centre. A low rolling rumble follows the total ball speed (`rollGain`). The points total counts up with ticks, and the streak multiplier pops when it rises. Vibration patterns differ for clean strikes, pots and miscues (Android only).

Pace (to keep a round near three minutes): once every ball is creeping (under 70, and at least 1.2 s into the shot) the table runs at 2×, and a tap on the table runs the rest at 4× (`ffwd`), but only once the shot has rolled for 0.8 s, so a tap meant for the close-up doesn't skip the action; the level banner lasts 1.5 s; after a level's stamp the next level starts by itself after about 2 s (the button skips the wait); at the end of a run the result card opens by itself. A bot with perfect aim and timing but no position play reaches level 4–5 in 12–15 shots (about 2 minutes with thinking time), so most players should land around levels 3–6 in two to four minutes.

Share card: `Daily Break #N 🎱`, `Level 6 · 18 balls`, and one emoji per level (🟢 clean clear, 🟡 cleared after losing a life, ❌ where the run ended). The result card also shows points and the best streak. Ranked results are stored under `dailybreak:ladder:<date>` (older keys are ignored).

Physics notes: fixed 1/240 s step, exact-contact ball collisions, tilt, felt friction, pocket rattle above `POT_MAX_SPEED`, spin applied at the cue ball's first contact, per-ball cushion count (`cush`) for banks. Deterministic, so a server could re-run shots to validate.

## Look and feel

Top-down retro room: plank floor, a patterned rug, walnut table with sage
felt, swaying plants, armchair, a spinning record player, a sleeping cat,
window light with rain shadows, cloud shadows, dust motes, vignette and
grain. UI in DM Sans + DM Mono, laid out to give the table as much height as possible:
one slim header row (title, level chip, hearts, one sound button cycling
all / effects only / off, and help; the course name shows in the level 1
banner instead), info bar (level, points and balls left, streak multiplier,
tilt), then the controls in play order: target button and aim strip, spin ball,
and the pull-back cue down the right.
Sound: clacks, cushions, pockets, rising pot notes for streaks, aim ticks, rain and vinyl
ambience, and an electric-piano loop.

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

- Playtest the difficulty: `LIVES` (3), the life refill rule, when hazards
  start (level 3) and the release wobble (`contactDiff`) are the main knobs.
- Daily streak and stats on the result card; a countdown to tomorrow's run.
- Replay of the best shot at the end of a run.
- Optional position target: drop a zone for the cue ball for a bonus.
- Leaderboard and friends with server-side shot replay.

## Hosting

Cloudflare Worker `daily-break` (static assets, `wrangler.jsonc`). Every push
to `main` deploys via `.github/workflows/deploy.yml` (needs the repo secret
`CLOUDFLARE_API_TOKEN`); it can also be run by hand from the Actions tab.
By hand: `mkdir -p dist && cp index.html dist/ && npx wrangler deploy`.
