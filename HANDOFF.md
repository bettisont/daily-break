# Daily Break - handoff

A daily pool game for the browser, built on the daily-golf model: the same
seeded nine-hole course for everyone each day, one ranked round, a shareable
emoji scorecard. Single file: `index.html` (no build, open it in a browser).

## The game (as of 2026-11-09)

Each table is a "hole": sink the **target ball** (gold ring) into the
**flagged pocket** in as few shots as possible, scored against par.

A shot has two gauges:

1. **Accuracy.** Tap or drag on the table to aim (a crosshair with distance in
   inches). The red line sways around the aim; press **Lock the line**. The
   locked offset is the aim error (shown as Pure / A touch left / Pulled
   right!).
2. **Power.** Press **Swing**: a needle fills the bar towards the **PIN**,
   the power the aimed shot needs (`pinFor`). Press **Stop** at the pin.
   Past it is the hatched OVER zone: a ball arriving faster than
   `POT_MAX_SPEED` rattles out of the pocket.

Hazards, all seeded per hole and harder on later holes: blocker balls,
brass bumpers, closed pockets, worn **rough** felt (slows the ball, doubles
the aim sway), **slick** felt (low friction), and table **tilt** (constant
acceleration, the equivalent of wind). The pin ignores tilt and felt, as wind
does in golf.

Penalties: scratching the cue ball means +1 and replaying from where you
were; sinking the target in the wrong pocket means +1 and it is respotted.
Other balls can be knocked in freely. A hole is picked up at par + 3.

Par comes from a perfect-execution bot (`solveHole`: direct pot if
possible, else a positional shot, else a fan of shots), plus 1, plus 1 more
for strong tilt or a crowded table with no direct pot. Hole 1 is solved at
load and the rest in the background. Over 25 sample courses: holes 1-2 are
mostly par 2-3, the middle par 3-4, the end par 4-5, and solving a course
takes about 1 s in total.

The ranked round is saved in localStorage per date; `?seed=xyz` or the
Random course button gives practice rounds.

## Look and feel

Top-down retro room: plank floor, a patterned rug, a walnut table with
sage felt, plants that sway, an armchair, a record player that spins while
the music is on, a sleeping cat (breathing, the odd tail flick), window light
with rain shadows, drifting cloud shadows, dust motes, a vignette and film
grain. UI: DM Sans + DM Mono, scorecard strip, an info bar (hole/par, target
ball and distance, shot number and lie, tilt), the power meter and one big
action button.

Shot feedback: rolling 3D balls, cue strike animation with chalk puff,
numbered shot markers with dotted trails, balls sinking into pockets, a flag
that pops, rattle-outs, stamped results (BIRDIE, PAR, ...) and confetti.
Sound: layered clacks/cushions/pockets, a lock click and meter ticks, rain
plus vinyl crackle, and a lazy electric-piano loop (music button).

## Code layout

- Top half of the script, no DOM: seeded RNG, `makeHole`, the `Table`
  physics (fixed 1/240 s step with exact-contact ball collisions, tilt,
  felt patches, pocket rattle), `trace`, `pinFor`, and the par solver.
  Deterministic, so a server could re-run shots to validate scores.
- Bottom half: audio, hole and round flow (`act`, `stopPower`,
  `resolveShot`, `finishHole`), UI, input and the canvas renderer (room,
  table, balls, effects).
- Tuning: sway (`swayAmp`, `sway`), power fill time `FILL_T`, `PIN_AT`,
  `POT_MAX_SPEED`, hole generation odds in `makeHole`, and the par extras in
  `parFor`.

## Next ideas

- Playtest the difficulty: sway size and speed, meter speed, how often holes
  need a positional shot.
- Spin (top/back/side) as an optional third input.
- Leaderboard and friends with server-side shot replay.
- A page per day for search traffic; monetisation as in the original plan
  (cosmetic cues, felts and rooms; no ads during play).
