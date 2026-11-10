# Daily Break - handoff

A daily pool game for the browser on the daily-golf model: the same seeded
nine-hole course for everyone each day, one ranked round, golf scoring and a
shareable emoji scorecard. Single file: `index.html` (no build, open it in a
browser).

## The game (as of 2026-11-09): call your shot

Each hole is a small seeded rack (2, 2, 3, 3, 3, 4, 4, 5, 5 balls). Clear
it in as few shots as possible, against par. Hazards per hole: table tilt,
worn rough felt, slick felt, brass bumpers and an occasional closed pocket.

A shot:

1. **Call it.** The easiest pot is called to start. Tap another ball to
   call it (its easiest pocket is picked) or tap a pocket to send the called
   ball there; the flag moves to the called pocket. Green dots mark other
   balls with a clean pot on; coloured dots by the pockets show how hard
   each pot is for the called ball.
2. **Pick a shot type** from the chip row, like choosing a club: Soft,
   Stun, Follow, Draw, Power (`SHOTS`: object-ball arrival speed and cue-ball
   spin). Nothing is pre-selected and there is no suggestion: the player has
   to choose (the action button reads "Pick a shot" until they do). Every
   type is simulated for the called line (`playCall`, which nudges the line
   a hair to allow for tilt and felt), so the chosen chip shows the cue
   ball's dotted path and finishing spot, and "risky" if it may not drop.
3. **Difficulty.** Every call is rated Easy / Fair / Tricky / Hard / Very
   hard (`shotDifficulty`: cut angle, distance, blockers, lie, tilt, and the
   shot type: Draw and Power are harder). It shows by the ball, in the info
   bar and on the pocket dots. Difficulty sets the timing: the line swings
   faster (`swingPeriod` × 1.05 → 0.6) with a thinner gold band (`perfA`
   6.8% → 2.4% of the sweep), and the power needle is quicker (`fillT`
   1.5 → 0.95 s) with a thinner band (`perfP` 4.2% → 1.6%). Calibrated so
   most tables have an Easy or Fair route but typical shots are Fair–Hard.
4. **Lock the line.** A line swings like a pendulum inside a cone from the
   cue ball to a bullseye at the contact point (drawn `CONE_VIS` = 3× wider
   than the real error, ±`swingAmp` ≈ 3°). Tap inside the gold band for zero
   error.
5. **Power.** Swing, then Stop in the gold band at the pin; the pin is the
   chosen type's power. Perfect line + perfect power plays exactly the
   previewed shot.

Rules: fouls are +1 (no contact, not hitting the called ball first, or a
scratch, which also puts the cue ball back where it was). Other balls that
drop are a bonus. A hole is picked up at par + 4.

Physics notes: fixed 1/240 s step, exact-contact ball collisions, tilt,
felt friction, pocket rattle above `POT_MAX_SPEED`, and spin applied at the
cue ball's first contact (follow carries through, draw comes back). Resting
balls are skipped, so simulation is cheap.

Par: a bot clears the rack by always taking `bestCall` with perfect
execution; par is its strokes + 1, clamped to rack size + 1 … + 3
(`parFor`). Hole 1 is solved at load, the rest in the background (about
0.08 s each). With perfect taps on every suggested call, a test round
cleared every rack one under par.

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
