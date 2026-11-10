# Daily Break - handoff

A daily pool game for the browser on the daily-golf model: the same seeded
nine-hole course for everyone each day, one ranked round, golf scoring and a
shareable emoji scorecard. Single file: `index.html` (no build, open it in a
browser).

## The game (as of 2026-11-09): call your shot

Each hole is a seeded rack (3, 3, 4, 4, 5, 5, 6, 6, 7 balls; about a third placed in clusters and some on the cushions; pockets are tight: corner capture 1.75 R, side 1.55 R). Clear
it in as few shots as possible, against par. Hazards per hole: table tilt,
worn rough felt, slick felt, brass bumpers and an occasional closed pocket.

A shot:

Every rack is generated so the opening shot has at least one clean pot
(`makeHole` re-rolls deterministically until it does).

1. **Call it.** Nothing is called for you: tap the ball you want (its
   easiest pocket is picked) and tap a pocket to send it there instead; the
   flag moves to the called pocket. Coloured dots by the pockets show how
   hard each pot is for the called ball.
2. **Choose the hit.** A close-up bubble pinned to the bottom-right corner
   shows the cue ball's face. Tap where to strike it: the height sets the
   spin (`spinFor`: high = follow, centre = stun, low = draw; taps snap to
   the vertical line because side spin isn't modelled) and the game names
   it (`strikeName`: Follow, Roll, Stun, Draw, Deep draw). The call is then
   simulated (`setSpot` → `playCall`, nudging the line a hair for tilt and
   felt), so the table shows the first ~170 px of the cue ball's path after contact (fading; no finishing spot),
   and "risky" if it may not drop. Pace is set by the power gauge: the pin is
   a normal pace (a bit more for draw). Nothing is pre-selected; the action
   button reads "Choose your hit" until you tap. Arrow keys nudge the hit.
3. **Difficulty.** Every call is rated Easy / Fair / Tricky / Hard / Very
   hard (`shotDifficulty`: cut angle, distance, blockers, lie, tilt, and the
   amount of spin). It shows by the ball, in the info
   bar and on the pocket dots. Harder shots get a smaller strike spot
   (`tipRadius` 0.24 → 0.09 of the ball's radius), a faster, wider cue-tip
   drift, a quicker power needle (`fillT` 1.5 → 0.95 s) and a thinner power
   band (`perfP` 4.2% → 1.6%). Calibrated so most tables have an Easy or
   Fair route but typical shots are Fair–Hard.
4. **Lock the tip.** The table shows only the planned line and ghost ball.
   In the bubble the cue tip drifts over the ball (`tipPos`, faster and
   wider on rough felt). The gold spot is the hit you chose. Tip on the spot
   gives an exact line and the chosen spin. Missing by less than one spot
   width costs 30% of the error; beyond that it costs in full. Off to the
   side squirts the cue ball off line (9° per unit of ball radius, scaled up
   for long shots, capped at 6°, opposite side to the hit); too high or low
   blends towards the spin actually hit. Pockets reject balls faster than
   `POT_MAX_SPEED` = 1050 (they rattle out).
5. **Power.** Swing, then Stop in the gold band at the pin; the pin is the
   chosen type's power. Perfect tip + perfect power plays exactly the
   previewed shot.

Rules: fouls are +1 (no contact, not hitting the called ball first, or a
scratch, which also puts the cue ball back where it was). Other balls that
drop are a bonus. A hole is picked up at par + 4.

Physics notes: fixed 1/240 s step, exact-contact ball collisions, tilt,
felt friction, pocket rattle above `POT_MAX_SPEED`, and spin applied at the
cue ball's first contact (follow carries through, draw comes back). Resting
balls are skipped, so simulation is cheap.

Par: a bot clears the rack by always taking `bestCall` with perfect
execution; par is its strokes, clamped to rack size … + 2 (`parFor`), so
one shot per ball is par. Hole 1 is solved at load, the rest in the background (about
0.08 s each). Playtest bots: perfect timing with naive planning lands around par;
"decent" timing (often just off the spot, power within ~2 band widths)
misses about 35% of shots and finishes about 2 over par per hole.

## Look and feel

Top-down retro room: plank floor, a patterned rug, walnut table with sage
felt, swaying plants, armchair, a spinning record player, a sleeping cat,
window light with rain shadows, cloud shadows, dust motes, vignette and
grain. UI in DM Sans + DM Mono: scorecard strip, info bar (hole/par, balls
left, shot and lie, tilt), chip row, the gauge and one big action button.
Sound: clacks, cushions, pockets, chimes for perfect taps, rain and vinyl
ambience, and an electric-piano loop.

## Code layout

- Top half of the script, no DOM: seeded RNG, `makeHole`, `Table`
  physics, `trace`, called-shot helpers (`potLine`, `allLines`, `safeLine`,
  `shotPower`, `simulate`, `clean`, `playCall`, `nextQ`, `bestCall`) and the
  par solver. Deterministic, so a server could re-run shots to validate.
- Bottom half: audio, events, round/hole flow (`lineUp`, `suggestCall`,
  `selectLine/Ball/Pocket/Type`, `lockLine`, `act`, `stopPower`,
  `resolveShot`, `finishHole`), UI, input and the canvas renderer.

## Next ideas

- Playtest the feel: swing speed, gold band sizes, whether the suggestion
  should be hidden on later holes or behind a "hint" button.
- English (side spin) as a sixth chip; banks and combos as callable shots.
- Leaderboard and friends with server-side shot replay.
