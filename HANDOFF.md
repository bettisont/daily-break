# Daily Break - handoff

A daily pool game for the browser on the daily-golf model: the same seeded
nine-hole course for everyone each day, one ranked round, golf scoring and a
shareable emoji scorecard. Single file: `index.html` (no build, open it in a
browser).

## The game (as of 2026-11-10): aim it yourself, pot in order

Each hole is a seeded rack (3, 3, 4, 4, 5, 5, 6, 6, 7 balls; about a third in clusters, some on the cushions; tight pockets: corner capture 1.75 R, side 1.55 R) with a shot limit of rack size + 3 (`shotLimit`). Hazards per hole: table tilt, rough felt, slick felt, brass bumpers and an occasional closed pocket. Every rack is generated so the opening shot has at least one clean pot (`makeHole` re-rolls deterministically).

A shot (built for one thumb on a phone). The controls run in play order, top to bottom: target → aim → power → strike.

1. **Target.** Each shot starts aimed dead centre at the lowest-numbered ball (`lineUp` → `focusBall`). The target button (top left; Tab on desktop) steps through the balls in number order and shows "then N"; tapping a ball on the table targets it too.
2. **Aim.** The full-width **aim strip** is swiped left/right like a scroll wheel: 0.04° per pixel when slow, gearing up to 6× when fast; a tap near either end nudges 0.1°. Its centre reads the offset from dead centre. Dragging anywhere on the table also turns the cue, relative to where you start and geared by how far your finger moves around the cue ball (0.08° per screen pixel), so your thumb never covers the line. Arrow keys: 0.1° (Shift: 1°).
3. **Guide fades** (`aidLevel`): holes 1–3 show the aim line, ghost ball and a 200 px object-ball line; holes 4–6 a 70 px object-ball line; holes 7–9 only the aim line and ghost ball. The object-ball line is pure geometry (no tilt or felt).
4. **Order is a choice, not a rule.** Any ball can be targeted; the tag over the target reads "IN ORDER +200" (gold) or "OUT OF ORDER +100", with the streak multiplier applied (`potValue`), and the hint next to the spin ball repeats it. The lowest ball carries a "N: 2×" tag when it isn't the target. The ball that comes after the target (`thenBall`: lowest left once the target drops) gets a dotted ring and a THEN tag, and the clicker shows "Target N / then M".
5. **Spin and position.** A small cue ball in the controls cycles Stun → Follow → Draw on tap (S or ↑/↓ on desktop); the dot shows where the tip will hit. `spinPaths` simulates the shot and draws the cue ball's path after contact to where it stops (ghost ball + label, or a red X for a scratch) for the chosen spin only. Labels are sized in screen pixels (`spx`) and placed to avoid balls and each other (`tag`).
6. **Pull back and release.** The tall cue on the right is the power and the trigger: drag down to load power (150 px = full; the table cue pulls back to match), let go to shoot, or push back to the top and let go to cancel (hold Space on desktop). While you hold, a close-up of the cue ball (bottom left of the table) shows the gold spot (your spin) and the cue tip wobbling over it (`tipPos`). When you let go is the timing challenge (`contact`): on the spot plays the shot exactly; off to the side pushes the line up to 3° the other way; high/low error changes the spin; out at the edge is a miscue (−4°, 35% power). `contactDiff` sets the spot size and the wobble, mostly from distance (cue ball to first ball, plus that ball's run on), plus spin, power and rough felt. On release the close-up zooms to the middle and plays the strike with a grade (Clean / Nearly / Off-centre / Miscue) before the balls move (`zoom`, `drawContact`).

Scoring (`PTS`, `resolveShot`, `finishHole`): every pot 100; the lowest ball on the table (rotation order) +100; bank +50; combo +50; each extra ball in one shot +50. Consecutive potting shots build a streak multiplier ×1, ×1.5, ×2, ×2.5, ×3 (`streakMult`). A miss ends the streak; a foul (no contact, scratch) costs 50 and ends it. Wrong order is legal, just worth less. Clearing the rack: +50 per spare shot, **Run out** (no misses or fouls) +300, **Perfect rack** (run out, all in order) +300 more. Running out of shots ends the hole with what you have.

Feedback: pot sounds climb a pentatonic scale as the streak builds (`sfx.potNote`), with a bell on in-order pots; floats name the pot (In order, Bank, Combo); screen shake grows with the streak. When a shot will clear the rack (`shoot` simulates it first), the last ball gets slow motion (0.25×), a camera push-in and a darker vignette as it nears the pocket (`cine`, `cam`, `timeScale` in `frame`).

Share card: one emoji per hole (✨ perfect rack, 🔥 run out, 🟩 cleared, 🟥 out of shots) and total points. Ranked results are stored under `dailybreak:pts:<date>`.

Physics notes: fixed 1/240 s step, exact-contact ball collisions, tilt, felt friction, pocket rattle above `POT_MAX_SPEED`, spin applied at the cue ball's first contact, per-ball cushion count (`cush`) for banks. Deterministic, so a server could re-run shots to validate.

## Look and feel

Top-down retro room: plank floor, a patterned rug, walnut table with sage
felt, swaying plants, armchair, a spinning record player, a sleeping cat,
window light with rain shadows, cloud shadows, dust motes, vignette and
grain. UI in DM Sans + DM Mono: scorecard strip (points and result per hole),
info bar (hole points and balls left, shot count and streak multiplier,
tilt), then the controls in play order: target button and aim strip, spin ball,
and the pull-back cue down the right.
Sound: clacks, cushions, pockets, rising pot notes for streaks, aim ticks, rain and vinyl
ambience, and an electric-piano loop.

## Code layout

- Top half of the script, no DOM: seeded RNG, `makeHole`, `Table`
  physics, `trace`, `potLine`/`allLines` (used to guarantee an opening pot)
  and `simulate`.
- Bottom half: audio, events (`onEvent` scores each pot as it drops),
  round/hole flow (`lineUp`, `focusBall`, `nextBall`, `setAngle`, `setSpot`,
  `setPower`, `shoot`, `resolveShot`, `finishHole`), UI, input (table drag,
  aim strip, spin ball, pull-back cue, keys) and the canvas renderer
  (`drawAim`, `drawAimLabels`).

## Next ideas

- Playtest the difficulty: `SHOT_SPARE` (3), the aim-strip gearing (0.04°/px)
  and the guide levels are the main knobs. A bot with perfect geometric aim
  and a fixed medium pace cleared about half the racks.
- Replay of the best shot at the end of each hole.
- Optional position target: drop a zone for the cue ball for a bonus.
- Leaderboard and friends with server-side shot replay.
