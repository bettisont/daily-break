# Daily Break - handoff

A daily pool game for the browser: the same three seeded racks for everyone
each day, one ranked round of about three minutes (daily puzzles like the NYT
Mini take a few minutes; that's the target), points scoring and a shareable
emoji scorecard. Single file: `index.html` (no build, open it in a
browser).

## The game (as of 2026-11-10): aim it yourself, pot in order

A round is three seeded racks (`HOLES` = 3; 3, 4 and 5 balls; about a third in clusters, some on the cushions; tight pockets: corner capture 1.75 R, side 1.55 R) with a shot limit of rack size + 3 (`shotLimit`). Hazards ramp by rack (`HAZARD` = 1, 4, 7 on the old nine-rack scale): table tilt, rough felt, slick felt, brass bumpers and an occasional closed pocket. Every rack is generated so the opening shot has at least one clean pot (`makeHole` re-rolls deterministically).

A shot (built for one thumb on a phone). The controls run in play order, top to bottom: target → aim → power → strike.

1. **Target.** Each shot starts aimed dead centre at the lowest-numbered ball (`lineUp` → `focusBall`). The target button (top left; Tab on desktop) steps through the balls in number order and shows "then N"; tapping a ball on the table targets it too.
2. **Aim.** The full-width **aim strip** is swiped left/right like a scroll wheel: 0.04° per pixel when slow, gearing up to 6× when fast; a tap near either end nudges 0.1°. Its centre reads the offset from dead centre. Dragging anywhere on the table also turns the cue, relative to where you start and geared by how far your finger moves around the cue ball (0.08° per screen pixel), so your thumb never covers the line. Arrow keys: 0.1° (Shift: 1°).
3. **Guide fades** (`aidLevel`): rack 1 shows the aim line, ghost ball and a 200 px object-ball line; rack 2 a 70 px object-ball line; rack 3 only the aim line and ghost ball. The object-ball line is pure geometry (no tilt or felt).
4. **Order is a choice, not a rule.** Any ball can be targeted; the tag over the target reads "IN ORDER +200" (gold) or "OUT OF ORDER +100", with the streak multiplier applied (`potValue`), and the hint next to the spin ball repeats it. The lowest ball carries a "N: 2×" tag when it isn't the target. The ball that comes after the target (`thenBall`: lowest left once the target drops) gets a dotted ring and a THEN tag, and the clicker shows "Target N / then M".
5. **Spin.** The spin control is the same cue-ball face as the close-up, small, next to the target row: drag the gold spot up (follow) or down (draw), or tap where you want it; the further from the middle, the stronger (spot ±0.5 of the radius, continuous; snaps to centre). It's the same gold spot you aim for when you release. **Path hint** (`spinPaths`, `drawSpinPaths`): only while pulling back or dragging the spin spot, a fading white line shows the cue ball's first half second after it meets the first ball (`PATH_STEPS` = 120 physics steps), so a harder pull draws a longer line; a red X if it would scratch inside that window. No resting spot is shown: where it stops is for the player to judge.
6. **Pull back and release.** The tall cue on the right is the power and the trigger: drag down to load power (150 px = full; the table cue pulls back to match), let go to shoot, or push back to the top and let go to cancel (hold Space on desktop). While you hold, a close-up of the cue ball (bottom left of the table) shows the gold spot (your spin) and the cue tip wobbling over it (`tipPos`). When you let go is the timing challenge (`contact`): on the spot plays the shot exactly; off to the side pushes the line up to 3° the other way; high/low error changes the spin; out at the edge is a miscue (−4°, 35% power). `contactDiff` sets the spot size and the wobble, mostly from distance (cue ball to first ball, plus that ball's run on), plus spin, power and rough felt. On release the close-up zooms to the middle and plays the strike with a grade (Clean / Nearly / Off-centre / Miscue): the tip lands at `STRIKE_T` (0.34 s, with the click), the close-up fades out, and only then (`SHOOT_T`, 0.66 s) does the cue on the table strike and the balls roll, so the contact with the object ball is always in view (`zoom`, `drawContact`).

Scoring (`PTS`, `resolveShot`, `finishHole`): every pot 100; the lowest ball on the table (rotation order) +100; bank +50; combo +50; each extra ball in one shot +50. Consecutive potting shots build a streak multiplier ×1, ×1.5, ×2, ×2.5, ×3 (`streakMult`). A miss ends the streak; a foul (no contact, scratch) costs 50 and ends it. Wrong order is legal, just worth less. Clearing the rack: +50 per spare shot, **Run out** (no misses or fouls) +300, **Perfect rack** (run out, all in order) +300 more. Running out of shots ends the hole with what you have.

Feedback: pot sounds climb a pentatonic scale as the streak builds (`sfx.potNote`), with a bell on in-order pots; floats name the pot (In order, Bank, Combo); screen shake grows with the streak. When a shot will clear the final rack (`release` simulates it first), the last ball gets slow motion (0.25×), a camera push-in and a darker vignette as it nears the pocket (`cine`, `cam`, `timeScale` in `frame`).

Juice (all procedural Web Audio, no files): sounds are panned left/right by where they happen (`atX`). Ball clacks have a woody body; cushions thud (with a rubbery bounce on hard hits) and puff chalk dust; hard ball hits freeze the frame for 30 ms (`hitStop`) with a small shake. A pot plays a leather "thunk" and the ball rolling down the return (`sfx.drop`), the pocket glows, the ball spirals in as it shrinks, a 45 ms hit-stop lands it, and the screen edges glow gold (`fx.glow`, stronger with the streak); streaks of 3+ add a bass swell (`sfx.boom`), and two or more balls in a shot call "Double!"/"Triple!" with a rising arpeggio. When spin takes hold off the object ball the table emits a `spin` event: a zip back for draw or a surge for follow, with gold arcs whirling round the cue ball (`spinFx`). The strike is a solid "thock" (a skid and a puff of chalk for a miscue); the pull-back cue creaks per 5% and thumps at full power; the spin spot clicks in pitch as it moves and snaps at centre. A low rolling rumble follows the total ball speed (`rollGain`). The points total counts up with ticks, and the streak multiplier pops when it rises. Vibration patterns differ for clean strikes, pots and miscues (Android only).

Pace (to keep a round near three minutes): once every ball is creeping (under 70, and at least 1.2 s into the shot) the table runs at 2×, and a tap on the table runs the rest at 4× (`ffwd`), but only once the shot has rolled for 0.8 s, so a tap meant for the close-up doesn't skip the action; slow motion is kept for the final clear only; the rack banner lasts 1.5 s; after a rack's stamp the next rack starts by itself after about 2 s (the button skips the wait). A bot that releases on the spot finishes a round in about 45 s of ball time over ~17 shots, so a real player should land around 2.5–3.5 minutes.

Share card: one emoji per rack (✨ perfect rack, 🔥 run out, 🟩 cleared, 🟥 out of shots) and total points. Ranked results are stored under `dailybreak:pts3:<date>` (the old nine-rack key is ignored).

Physics notes: fixed 1/240 s step, exact-contact ball collisions, tilt, felt friction, pocket rattle above `POT_MAX_SPEED`, spin applied at the cue ball's first contact, per-ball cushion count (`cush`) for banks. Deterministic, so a server could re-run shots to validate.

## Look and feel

Top-down retro room: plank floor, a patterned rug, walnut table with sage
felt, swaying plants, armchair, a spinning record player, a sleeping cat,
window light with rain shadows, cloud shadows, dust motes, vignette and
grain. UI in DM Sans + DM Mono, laid out to give the table as much height as possible:
one slim header row (title, three rack chips with points/result, one sound
button cycling all / effects only / off, and help; the course name shows in the
rack 1 banner instead), info bar (hole points and balls left, shot count and streak multiplier,
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
