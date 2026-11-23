# Daily Break - changelog

Newest first. One entry per dated change: what changed, why, and the key numbers. How things work now is in
`HANDOFF.md`; this is the history, including things that were tried and taken out (most are still in the git
history under the commit named).

## 23 Nov 2026 (afternoon): the timed run goes live as the daily game

- **No golden flashes in the timed run** (playtest, after going live: annoying): the tally's landing is just a punch
  (no gold glow, bloom or sparkles), the Mult meter pulses a soft pink instead of gold, and the golden glow round the
  screen's edges on pots is off.
- **No flashing in the tally at all** (playtest: "still flashing"): the full-screen white flash on x3+ is gone (the
  shake stays), and the Mult meter doesn't flash its background; its number just grows for a moment.
- **One share button: Copy result** (playtest): the timed run's result card copies the text and its link (whose
  preview is the card) on every device; the share sheet with the image, Copy image and Save image are off the card.
- **No share-text box on the timed run's result card** (playtest: "why does it show that little link?"): the score
  and badges say it all; the text is still what Share/Copy sends, and the box only appears if copying fails.
- **A shorter share text** (playtest: it looked messy in WhatsApp, where the block-character strip wrapped onto two
  lines): "Daily Break · 23 Nov / 29,485 points / Beat 73% of today's players / link". The best multiplier, strip,
  tables and best shot are on the image card and the link preview, which do the rest.
- **Link previews with your card** (playtest: the image should show when you just share the link): the game draws
  a landscape 1200x630 copy of the card (`drawPreviewCard`) and uploads it once a run (`uploadPreview`, POST
  /api/card, only on dailybreak.app); the share text then links to dailybreak.app/r/<id>, a tiny page whose og:image
  is that card (chat apps show it; a person opening it goes on to the game). The worker keeps cards in a new
  ShareCards Durable Object (migration v2) for 30 days (a daily alarm clears older ones), takes only PNGs of exactly
  1200x630 up to 300 KB, 5 uploads a minute per IP (`CARD_LIMIT`), and stores nothing about the sender. Chosen over
  drawing cards on the server (no image library or paid plan needed); the known risk is that someone could upload
  any 1200x630 picture and get a dailybreak.app/r/ link that previews it, limited by the checks, the rate limit and
  the expiry.
- **Copy image** on the result card (`copyShareCard`), where the browser can put an image on the clipboard: the
  share card, to paste into any chat.
- **A new share** (`trickShareText`, `multStrip`; the image card `shareCard` / `drawShareCard` in ui.js): the text
  is "DAILY BREAK · 23 NOV / 48,210 points · 7 tables / best ×6.3 · best shot 9,400 / a multiplier strip / rank /
  link", the strip a bar per shot (block characters, not emoji, scaled to the run's own peak, at least x3; squeezed
  to 24 bars). Every shot's multiplier is kept (`round.multLog`, saved with the run and the result). On phones a
  1080x1350 image card in the night look goes with the text in the share sheet (made when the card shows and again
  when the rank comes in, so the share starts inside the tap, which iOS needs); elsewhere a "Save image" button
  downloads it. The trial test checks the strip is in the share.
- **The clock starts with the run's first shot** (`round.started`, saved with the run), not when the first table
  appears: it used to run while you were still reading the table.
- `RULES.TRICK_SCORE_FROM` = 2026-11-23: from today the daily game is the timed run, for everyone, ranked
  (`mode: 'trial'` results). Switched on mid-day on purpose (the owner's call: the new mode is the way forward and
  the player count was small), against the usual day-ahead rule. Anyone who had played par today gets a fresh timed
  run; a par round in progress restarts as a timed run; today's par results stay in today's par tally.
- `RULES.NO_TILT_FROM` brought forward from 25 Nov to 23 Nov with it (the timed run's info bar doesn't show a tilt, so
  tilted tables would have been hidden): the layouts of 23 and 24 Nov changed in the snapshot, nothing else.

## 23 Nov 2026: the timed trial replaces the six holes (behind ?trick)

Decided in a second grilling session (ADR 0002). Still nothing changes for players: `TRICK_SCORE_FROM` is `null`.
- **A two-minute run** (`TRIAL_S`) of aiming time through an endless seeded sequence of tables, the same for everyone
  each day (`makeHole(seed, n)`, so tables 1-6 are the old holes). The clock stops while the balls roll, the score
  tallies and the next table deals in; at zero, one last shot. No shot limits, no skipping, and misses and fouls cost
  no time.
- **One multiplier meter, no cap** (`hs.mult`): each potting shot adds 0.5, each trick 0.1, the golden pocket 0.2; a
  miss halves the part above x1, a foul resets it. It replaces the x1-x3 pot streak. (Later the same day, after a
  playtest: a shot raises the multiplier first and is then multiplied by the new value, so the first pot of a run
  scores x1.5; the tally shows the causes flying into the meter, then the new value slamming in.)
- **Quick is gone** (the clock rewards speed), with its ring.
- **Screen**: the clock in the header (red with ticks for the last 10 s, then "Last shot"), "Table 5 · 3 balls left",
  the meter full at x5; "Time's up" card with points, tables cleared, best multiplier and best shot; share "Daily Break
  23 Nov ⏱️ 38,470 points · 7 tables / Beat 73% of today's players" (no player count). Unlimited practice runs.
- **Worker**: `mode: 'trial'` ({points, tables}), 100-point buckets under `r:<day>`; the six-hole `trick` mode is
  gone (it was never live).
- **Test**: `tests/run.js trial` plays a short real run and checks every shot against the rules.
- Seen in bot runs: with no cap a near-perfect player reaches x15 and about 300,000 points; a sloppy one about 58,000.
- Same day, after a playtest: the clock is bigger, with a bar under the header that drains with it (red and pulsing in
  the last 10 s); "Streak" is now "Mult" on screen; and the trial has its own soundtrack (`arcadeTick`, `arcadeStep`):
  an upbeat chiptune loop in A minor whose tempo rises with the multiplier (112 bpm at x1 to 132 at x5) and again in
  the last 30 and 10 s, with layers coming in as the multiplier builds (hats, then 16ths, an arpeggio from x2, a snare
  from x3). It replaces the electric-piano chords under the trial only, and stops when the run ends.
- **Cooler phones** (playtest: the phone got hot). Measured on a fixed benchmark (5 s aiming with a finger moving, then
  a 5 s tally, 390x844 at 2x): the page was over 100% busy (about 22 ms of work a frame at 44-50 fps), now about 40%
  aiming and 45% in a tally. Under the trial only: 60 fps only for real motion (rolling, the strike, pulling the cue,
  bursts), 40 while you aim, and the tally no longer holds the frame rate up (`trialFps`); no film grain or drifting
  cloud shadows (two full-screen layers a frame); the canvas at up to 1.5x instead of 2x (44% fewer pixels, still
  sharp on a phone). For everyone: the x3 meter glow is still instead of looping, and the clock bar moves by a
  transform about 10 times a second instead of being restyled every frame.
- **Long pots score +150** (playtest: a flat bonus for long shots): once a shot, when a potted ball started at least
  600 (60% of the table's length) from the pocket it went into (`LONG_D`, `t.long`). Points only, like a flat trick
  bonus under the shot's multiplier, but it doesn't raise the multiplier. In the tally as "+150 LONG"; the trial test
  checks it.
- **Big moments**: from x3 the multiplier landing shakes the screen and flashes white for a frame; a shot worth 1,000+
  / 2,500+ / 6,000+ slams in NICE / HUGE / INSANE under the tally for about a second, with a hit sound.
- **A punchier result card**: the score bigger (64px, counting up), and badges for the best multiplier, tables
  cleared and best shot popping in after it.
- **The trial plays at night** (playtest: make the look match the pace and the new lettering; options 1-3 of the
  proposal). The room after dark: painted as by day, then darkened in the scenery cache, least round the table; the
  cat and turntable are still shapes (the cat's eyes catch the light when it wakes); plants are silhouettes; no window
  light; the warm lamp at 45%. The table in flat neon (`TABLE_NIGHT`): a dark rail with a pink line, cyan cushion line
  and sights, blue felt, pink-ringed pockets; targets lime instead of sky blue. The HUD as arcade panels: dark
  colours (the CSS variables redefined under `body.trial`), 2px borders and hard offset shadows, no blur or glow,
  three accents (cyan, pink, amber); the banner, floats, tally, chips, call-outs and cards to match. Nothing a frame
  more than by day: the darkening is cached, the neon is flat strokes. The par game keeps the daytime room.
- **The tally quicker again and higher up**: `TALLY_PACE` 0.45 (about 1.9 s for a pot, a bank and the multiplier),
  and it sits in the clearest band of the table's top quarter (`tallyBand`, 10-26% down) instead of anywhere to 62%.
- **A snare that builds with the multiplier**: under the clap from x2.5, ghost notes from x3, a 16th-note roll into
  every fourth bar from x3.5 and every second bar from x4.5 (`arcSnare`).
- **No phone emoji where it can be helped**: line icons (`ICON`, `ic()` in ui.js) in the intro and help, and for the
  sound button; a touch dot instead of the pointing hand in the demos; no ⏱️ in the trial's share text, no 🏆 on the
  rank line, no ⛳ on "Tap in". The par game's share card keeps its ⛳ and coloured squares (they're the card).
- **No fire emoji** anywhere (the Mult meter, the help, the par game's "N in a row"); the help uses 📈 and 🏅.
- **Fix: the tip on the strike dial sped up or slowed down while the cue was pulled.** Its sway phase was time x rate,
  and the rate rises with the pull (the pull is part of the shot's difficulty), so the whole phase jumped: up to 6x
  its speed for a moment. The phase now moves on by rate x dt each frame (`swayRate`).
- **A quicker, smaller tally** (playtest: it was in the way of the next shot): every step at 0.6 of its old timing
  (`TALLY_PACE`; a pot with a bank and the multiplier about 2.5 s instead of 4.2), the number about 25% smaller, the
  chips to match. **The Mult meter heats up gradually** (`--heat`, x1 to x5): a warm tint fills the cell, the number
  grows up to 30% and goes from amber to red, the bar thickens, and the number counts to a new value in tenths.
- **Arcade lettering** (playtest: the fonts should feel more exciting): under the trial only (`body.trial`), Bungee for
  the clock, points, info values, tally, chips, call-outs, banner and result card, and Chakra Petch for the small
  labels. The par game keeps DM Sans and DM Mono.
- **Playtest follow-ups**: no warm lamp over the table or glow on the meter as the multiplier builds (the 🔥 stays);
  the soundtrack follows only the multiplier, not the clock, and speeds up with it again (112 bpm at x1, +6 a step,
  136 from x5; the open hat moved from the last 30 s to x4, and the last 10 s no longer open everything up); time
  call-outs at 90, 60, 30 and 10 s and on the last shot; and in the tally the multiplier drops out of the meter into
  the score before it's applied, the reverse of its causes flying up into the meter.
- **The soundtrack reworked** (playtest: the chiptune was "a bit cringey"): a dark synthwave groove in A minor, after
  the vertical layering in Tetris Effect, Lumines and Rez. A steady 120 bpm (no more tempo rises, key changes, swing
  or square-wave hook); a rolling 16th bass and a wide pad that pump under the kick; a low-pass over the synths that
  opens as the multiplier builds (the run gets brighter, not faster); an arpeggio from x1.5, a clap from x2, a sparse
  lead from x3; the drums drop out for a bar when the multiplier falls and come back on the downbeat. Mixed about
  1.5 dB above the old one (it is denser; the bus is at 0.55).
- **The soundtrack got a tune** (playtest: "slightly boring"): an eight-bar song with a chiptune hook (A over
  Am-F-C-G, an answering B over F-G-Em-Am; `ARC_HOOK`), a syncopated bass (`ARC_BASS`), swing on the off-beat 16ths,
  off-beat chord stabs from x2, a drum fill into every fourth bar and a crash each phrase, the hook an octave up from x4
  and in the last 10 s, and a rising sweep when the multiplier goes up (falling when it drops).
- **No tilted tables from 25 Nov** (`RULES.NO_TILT_FROM`; asked for after the aim review): the guide draws straight
  lines, and a tilt curved the balls up to 45° off them on thin cuts. The tilt's random numbers are still drawn, so
  everything else on a table is dealt as before; 56 future courses (and two practice seeds) changed in the snapshot,
  nothing on or before 24 Nov. The trial's third info cell shows tables cleared instead of the tilt.
- **A kiss shows** (`kissAt`; playtest: a line into a pocket stayed dark because, with the spin set, the white came back
  into the object ball, and nothing showed it while aiming): when a line into a pocket isn't lit, one sim at your pace
  checks whether the cue ball meets that ball again; if so its path to there is drawn faintly with a small red cross.
  (A version that labelled every reason a line wasn't lit was tried first and taken out the same day.)
- **Aim guide review** (a subagent measured it: the object-ball line was already exact on flat tables, 0.000° over
  13,685 samples). Fixed: the guide's cost while fine-aiming (sims only near a pocket, nearest pace first, spread
  over frames: median 3.4 -> 0.5 ms a frame, p95 8.5 -> 4.5); the ring flickering across gaps between guide paces
  (in-between paces); a pot lighting that a Perfect strike would miss (it must drop both ways now); jaw pots staying
  dark; banks off shaped-table corners drawn up to 99° out; bumper and cat legs 2-3° out (now from a sim at your pace);
  a lit ring not saying at what pace (green bands on the pull cue, taken out again after a playtest); side spin invisible in the half-second hint and
  late scratches unmarked; a mis-hit giving more spin than the spin ball allows; the slow-motion finish mispredicting
  Perfect strikes; the aim tick out of step with the readout; a cheaper lit line.
- **A longer song** (playtest: the loop was repetitive): `ARC_SONG` is eight 4-bar sections (about a minute at
  112 bpm), each with its own chords, hook, bass and drum feel (an intro groove, two hooks, a bouncing riff over
  Dm-Am-E-Am, a half-time section with long notes, a breakdown with no kick and a soft pad, the hook an octave up), and
  each time round it moves to a new key (`ARC_KEYS`), with small seeded variations in the hats.
- **Why the multiplier moved**: the meter holds the old multiplier while a tally applies it (`meterShown`). Once the
  shot's points have landed, each cause of the rise ("+0.5 POT", "+0.1 BANK", "+0.2 GOLDEN"; `multWhy`) pops up where the
  tally was and flies into the Mult meter, which ticks up as each lands, with a climbing note and a pulse (`meterGain`).
  A first version only faded small tags in under the meter; the playtest wanted it clearer and more satisfying. A
  miss still shows a quiet "½ miss" tag ("foul: reset" for a foul; `showMultWhy`).
- **Frame pacing against a running deadline** (`frame` in `js/main.js`; affects par too). The old rule (draw once
  1000/fps - 4 ms had passed) made 40 fps every other frame on a 60 Hz screen, so 30. Now each drawn frame moves a
  deadline (`frame.next`) on by one interval, with 2 ms of slack, re-measured from the last frame when the target
  changes and restarted after a stall. Headless Chromium at 60 Hz, target 40: 30.0 draws/s before, 40.1 after (16.7
  and 33 ms gaps); 60, 30 and 15 unchanged.
- **Aim strip gestures** (`js/input.js`), at the 0.01°-0.05° scale long pots need. A deliberate 3 px drag was taken
  for a tap and nudged on top (+0.01° or +0.05° instead of +0.03°): a tap is now only a press that didn't move (bar a
  lift-off roll) and nudges exactly 0.02°. Lift-off undo took back fine nudges made after a pause (0.02° instead of
  0.04°): it now only removes up to 3 px that start in the last 25 ms after the finger was still for 80 ms. Gearing
  read one event's speed, so the same 100 px swipe at 250 px/s turned 2.13° or 1.99° with jittery events: it now reads
  the speed over the last 50 ms of the path (2.03-2.04° whatever the timing).

## 22 Nov 2026: trick scoring, on trial behind ?trick

Nothing changes for players yet: `RULES.TRICK_SCORE_FROM` is `null`, so every daily round is still par. `?trick`
plays today's course (or `?seed=`) as an unranked round with the new scoring. It uses no practice round and saves,
sends and tracks nothing. Decided in a grilling session (ADR 0001). Why: flair went unrewarded, too many players tied
on par, and the trick replays are the best moment of a round.
- **Points replace par** (`scoreTrick`, `trickDrop`, `TRICK_PTS` in `js/state.js`). A pot is 100. Each trick element
  adds 200, and they stack: an extra ball in one shot, a bank (per banked ball), a combination (a potted ball the cue
  ball didn't hit first, once a shot) and a tunnel; a kick adds 100 (it was 200 until the second tidy-up below). The first pot into the golden pocket doubles the shot. The
  whole shot is then multiplied by the streak: x1, x1.5, x2, x2.5, x3 for potting shots in a row, carried across holes.
  A miss or a foul resets it. (Clearing a hole first added 300 per ball; dropped the same day, see below.)
- **Strokes are only a budget.** You pick up at par + 3, as before. A foul still costs a stroke, and the balls it pots
  stay down but score 0. There's no stroke back from the golden pocket (it doubles instead) and no tap-ins.
- **At the pot, a bang, not words** (`trickBang`). The pocket (or the contact, for a cannon or a target) gets a
  flash, rings, sparks, a shake, a freeze-frame and a boom that grow with how good the shot is so far (`shotQ`). No
  text pops up on the table. A first version burst a label per trick ("Bank! +200"); the playtest found them too much.
  The header shows points (counting up) and the info bar shows shots left and the streak.
- **The tally** (`showTally`, after the replay). The base (100 a pot) comes up mid-table. Each trick element's flat
  points then come in one by one, labelled ("+200 Bank"), and fly into it as the number rolls up, leaving a line
  underneath of what was added. Each multiplier then drops onto the number and smashes into it: the golden pocket's
  x2, then the streak, which pulls down out of the streak meter. Finally the shot's score flies into the header's
  Points, which only then counts up (`ptsHold`). Asked for in the playtests: the multiplier was already working on
  each shot, but you couldn't see it. A version that explained every step on the table ("Bank: the ball came off a
  cushion", a running record, the whole sum) had too much text on screen, and numbers alone didn't say why. So each
  number on the table gets one word ("100 POT", "+200 BANK", "x2.5 STREAK", "+900 CLEARED"), and tapping the Points chip (ⓘ) opens the breakdown of the round's shots, newest first (`logShot`,
  `showShotLog`): each line with what it was for (`TRICK_WHY`) and the sum. After the first tally, a one-off tip
  points to it.
- **Multipliers land slot-machine style** (`spinTo`): "x2.5 STREAK" slams in beside the number (the streak meter
  flashes, to show where it comes from), the digits spin like reels and stop left to right on the new total with a
  clunk, and the chip melts in. Golden x2 first, then the streak, always after the tricks. It replaced a chip that
  pulled down out of the streak meter and smashed into the number, which wasn't liked.
- **Tidied after a playtest**: the slot machine takes ~1.1 s a multiplier (was ~2.2 s). Cannon only counts contacts
  before anything drops (the white wandering into a ball after the pot had counted). One sound per moment: at a pot,
  the drop and its note, plus `sfx.bang` on a trick shot (no per-kind sound, boom or golden chime); in the tally, a tick
  as each trick lands, quiet reel ticks and a clunk per multiplier, no chime at the end. No confetti under trick
  scoring.
- **Second tidy-up**: no "Perfect strike!", "Clean strike", "Miss", "Streak over", "It dropped!", "So close!" or
  target and foul notes on the table under trick scoring; only text that explains something going wrong stays
  (scratch, miscue, pushed off line, rattled out, out of shots). Targets, like Cannon, only count when crossed
  before anything drops. Kick halved to +100 (`partPts`). The multiplier lands with a bright rising chime
  (`sfx.ding`, higher for a bigger multiplier) and a golden bloom behind the number; the thud and the shake went.
  The intro and help describe trick scoring when it's on (`TRICK_INTRO`, `TRICK_HELP`).
- **Fixes from a full UX sweep (23 Nov)**, after a subagent played 9 bot rounds and checked every shot against the
  formula (all matched):
  - The tally sits in the clearest band of the table (`tallyBand`), scales down on small phones, and puts the number
    and its multiplier chip in one centred row. It's quicker: about 2 s for a plain pot, 4 to 5 s for a big shot. A
    tap on the table or a pull of the cue finishes it at once (`finishTally`): shooting through it used to show the
    old streak landing while the new miss cracked the meter.
  - The Quick clock waits for the tally (it had been eating the 5 s), and the hole-2 spin demo no longer blocks it.
  - Frame pacing is back to 30 fps idle and 15 behind a card: unhit targets and the x3 lamp flicker had held it at
    about 55.
  - Bugs: the rolling number dipped below its start on its first frame (`rollNum` clamps now); the 320 px header
    overlapped (Points label hidden below 370 px, steady chip width); the trick result card showed par stats (now
    points); a resumed round lost its breakdown (`shotLog` is saved); under `?trick` the card offers "New course",
    which spends no practice round.
  - Rules made consistent: the cue ball through a tunnel only counts before anything drops; crossing a target is a
    quiet tick (the reward comes at the pot); no bang when the cue ball is already down.
  - Off the table under trick scoring: the cat's lines, the tunnel labels after the first time, and "+1 stroke" (a
    foul "costs a shot"). The info bar reads "4 shots left · 3 balls". Targets are sky blue, kept off sand,
    bumpers and the cat.
  - Sound: the bang has no low boom of its own (three thumps at once before); the hole jingle waits for the tally;
    the tally's steps climb the pot notes' scale; the multiplier dings use tuned roots, so golden x2 then streak
    x2.5 no longer clash. `P` opens the breakdown.
- **No aim or spin lessons** under trick scoring (playtest: annoying): the first shot no longer starts off target with
  "This line misses" and the aim-strip hand, and hole 2 has no looping spin demo. Par keeps both for new players.
- **No replays** under trick scoring: they held up the tally, which already shows what the shot did (playtest: "annoying").
  The live slow-motion push-in on a trick or the last ball stays. Par days keep their replays.
- **No hole stamps** under trick scoring ("Trick clear!", "Cleared", "Round over"): they got in the way of the
  tally. A picked-up hole just says "Out of shots". The next hole waits for the tally to land.
- **No points for clearing the table** (it was 300 a ball, shown as a flat step after the multipliers). Playtest: a
  clear isn't a trick, and a multiplier should always come last. Now it does: base, then tricks, then multipliers.
- **The streak shows** as a meter under the multiplier in the info bar (`updateStreakMeter`). It fills and heats up,
  shows a flame from x2, pulses at x3, and shakes red as it drains on a reset. The lamp over the table also warms
  (`drawLampWarmth`: one extra light sprite) and flickers at x3. An edge glow round the screen was tried first and
  dropped the same day as ugly.
- **More to score** (second grilling round):
  - **Cannon** (+200): the cue ball touches two or more object balls (the `hit` event now says which balls).
  - **Moving targets** (+200 each): gold rings sliding to and fro on straight tracks (`makeTargets`, `tgtStep`,
    `drawTargets`), one from hole 2 and two from hole 4. Any rolling ball crossing one on a shot that pots scores it
    and it vanishes. They're placed from their own seeded numbers (`<seed>:targets:<i>`), so courses don't change,
    and move on physics time while the balls roll. A crossing on a foul doesn't count, and the target comes back.
  - **Quick** (+100): the shot is released within 5 s of the aim starting (`aimClock`, `QUICK_S`) and pots. A gold
    ring round the cue ball drains as the time runs out and flashes for the last 1.5 s (`drawQuickRing`; a bar across
    the top of the pull cue went unnoticed). It's off while a lesson shows. Players asked for a timed element; a
    shot clock with a penalty was turned down.
- **Result and share**: the result card shows the points, the number of tricks, shots and best streak, each hole's
  points, and the rank line. The share text is just the points and "Beat 73% of 412 players today" (`trickRankLine`;
  the share box fills it in when the tally comes back). A trick-emoji line per hole was tried and dropped as too busy.
- **Worker**: `mode: 'trick'` results (`points` 0-100,000, `strokes` 0-200) are written as blob2 `'trick'` and
  counted in 50-point buckets under `t:<day>`; `/api/day?mode=trick` returns them. `tools/results.py` reports them and
  keeps them out of the old lives table.
- No change to physics, generation or RNG: all course snapshots are unchanged.

## 16 Nov 2026 (late): battery and heat

- **Frame pacing** (`busy` in `js/main.js`). Phones got hot and drained: the loop repainted the whole screen
  (room and table copies, clouds, lamp, vignette, grain) on every display frame, 120 a second on 120 Hz phones, even
  with nothing happening. Now 60 max while anything moves, animates or is touched (and 1.5 s after), 30 while idle,
  15 behind the blurred results/intro card (the backdrop blur is redone for every frame drawn under it).
- **Audio suspended when off or hidden** (`syncAudio` in `js/audio.js`). The AudioContext ran all the time, rolling
  rumble noise loop and echo included, even with the sound off. `tone`/`noise` do nothing while muted so nothing
  queues up on the stopped clock. The rumble's gain is only re-targeted when it changes.
- **Vignette cached** (`VIGNETTE_BUF`): painted once per screen size at quarter resolution instead of a full-screen
  radial gradient every frame. Looks the same. No physics or generation touched: all course snapshots unchanged.

## 16 Nov 2026 (evening): sidespin

- **Side on the cue ball** (`aim.spotX`/`aim.side`, `sideFor` in `js/game.js`; `Table.english` and `SIDE_K` 0.32,
  `SIDE_KEEP` 0.55, `SIDE_WEAR` 0.9986 in `js/physics.js`/`js/core.js`). Drag the gold spot left or right as well as
  up and down. The cue ball comes off cushions bent towards the side it was struck on: a straight shot into a cushion
  at half pace with full side comes back about 17° off. It never comes off a cushion faster than it went in (keeps the
  guide's early-exit bound valid). The strike reads side like spin: +0.12 x |side| difficulty, a near or off hit
  drifts it towards where the tip landed, a miscue loses it. The guide, spin path and readShot all use it. Generation
  never sets side: all course snapshots unchanged; fastsim now also checks two side settings (4200 aims).

## 16 Nov 2026: spin resets after every shot

- **Each shot starts on Stun** (`lineUp` in `js/game.js` sets `aim.spotY` and `aim.spin` back to 0). Before, the spin
  ball kept whatever the last shot used, so a draw or follow left set by accident carried into the next shot. UI
  state only: generation, physics and every course snapshot unchanged, so it ships straight away rather than behind a
  date in `RULES`.

## 15 Nov 2026 (evening): the strike reads the whole shot (from 17 Nov)

- **Strike difficulty follows how tricky the shot is, not just how long** (`RULES.SHOT_READ_FROM` 2026-11-17;
  `readShot`, `trickiness`, `shotWord` in `js/game.js`). A quick perfect-strike simulation along the aim finds the shot
  being played: the cue ball's run to the object ball, the potted ball's run to its pocket, the cut angle, any bank
  (object ball) or kick (cue ball) off a cushion, and whether it's a combination. Before, the object ball's run was
  measured to the cushion and none of the rest counted. Average d over every aim on 17-22 Nov: straight pots 0.20 ->
  0.18, cuts over 60° 0.31 -> 0.46, banks 0.25 -> 0.50, combinations 0.18 -> 0.55, kicks 0.14 -> 0.58. The close-up's
  label says why ("Tricky bank shot", "Shaky combination", "Tricky thin cut"). It never touches generation: all
  course snapshots unchanged. Gated so 15 and 16 Nov stay comparable for everyone who's played them.

## 15 Nov 2026 (afternoon cleanup)

- **Code split into `js/*.js`**: the one inline script cut verbatim, in order, into core, physics, state, audio, game,
  ui, input, render, main (classic scripts, one global scope). Pure move: the concatenation equals the old script byte
  for byte. `tools/build.sh` stamps each script tag with `?v=<sha256 prefix>` so a deploy never mixes a new page with
  cached old scripts.
- **Unreachable modes retired, date switches gathered into `RULES`**: removed the lives ladder (lives, hearts, its
  flow, save, share text, card and rank by level), the non-short par variant (6-ball holes, clusters, rough and slick
  felt), the old guide branch, water and the windmill, and the trick-star code. Par, shapes, spread racks and the
  short round are folded in as always on; `FORGIVE_FROM`, `NO_GATE_FROM`, `TUNNELS_FROM` remain, with `ruleOn`.
  Courses from 14 Nov on unchanged; 12 and 13 Nov regenerate differently (they were non-short). Old `?seed=` dates open
  a par practice round. The result card gained the device stats (old ladder days counted too). A corrupt saved round
  is now logged rather than silently swallowed.
- **Tests and a CI gate**: `tests/run.js` (layout snapshots of every daily course to 31 Jan 2027, guide lit-pocket
  check, first-visit smoke) and `tests/worker/worker.test.mjs`; `.github/workflows/test.yml` on pull requests;
  `deploy.yml` now `needs: test`. Why: a physics or generator change silently changes everyone's course.
- **Worker rate limits**: `RESULT_LIMIT` 5/min and `EVENT_LIMIT` 30/min per client IP (never stored), so a script
  can't stuff the tally or datasets; a missing or failing limiter allows the request.
- **Faster guide**: `guidePotsAt` stops each pace's simulation once its answer can't change (scratch, too many
  cushions, or a travel bound), and recent aims are memoised. Same lit pockets as full sims over 20,790 aims; guide cost
  per moving frame roughly halved to a fifth. `simulate` untouched so layouts don't move. A `fastsim` test checks it.
- **Scenery cache**: room and table painted once per hole and view into two canvases instead of every frame (~8 ms a
  frame on a software canvas); cloud shadows drawn at quarter resolution (at most 4/255 off).
- **Finer aim**: 0.01° a pixel on slow swipes (was 0.04°), gearing up to the same top speed; taps and arrow keys
  0.02° (was 0.1°); lift-off drift undone; readout in hundredths. Why: too coarse to place a long pot.
- **Guide ring and glow as one signal** (`guideSim.potsInto`, `finishGuide`): both light only when the ball the line
  follows really drops into the pocket the line goes into; a line into a pocket it would miss fades 2.5 R short. Before,
  rings flickered on pockets the line didn't go near (14+ flickers on a hole) and side-pocket lines ran in unlit; a
  sweep of 15 Nov's holes afterwards found 0 rings without a lit line.

## 15 Nov 2026 (release, PRs #36-37)

- **Tunnels join the daily game from 17 Nov** (`TUNNELS_FROM`): holes 3-6 dealt from sand, the cat and a tunnel; an oval
  hole dealt a tunnel takes the next feature. 16 Nov stays sand and cat (players ahead of UTC were already on it).
  17-30 Nov: 56 feature holes (20 sand, 22 cat, 14 tunnel), all with an opener, clearable, every tunnel shot pots.
  The `?tunnels` test course was dropped.
- **Tunnel development, same day** (test course only until then): first two brick-rimmed mouths in the felt, then
  putting-green cups (copper pipe ends dropped on feedback), with a sink/rumble/pop trip; then moved **into facing
  cushions** because in the middle of the table they took over the hole; then wider, flared openings (`TUN_HALF` 1.5 R
  -> 2.4 R, plus up to R for angled entries): target width straight on 81 px, at 30/45/60° 73/52/37 px (60/41/27 with
  the wider opening alone); random shots going through 110 -> 247 of 1,020.
- **No one-way gate from 16 Nov** (`NO_GATE_FROM`): holes 3-6 get sand and the cat.
- **Forgiving pockets from 16 Nov** (`FORGIVE_FROM`): rattle-out above 1700 (was 1050). On 36 holes at four firm
  paces: pots 160 -> 300, rattle-outs 217 -> 73.
- **Simpler, fainter guide** (live on every day): straight lines only (the bounce, kick and combination lines and
  simulated object paths were removed after feedback that the lines went all over the place), every line scaled by
  `GUIDE_A` 0.55 and thinner, softer ring. Later the same day the object ball's line went back to full length and one
  more leg off a cushion (`GUIDE_CUSH` 1, cue ball still straight: `GUIDE_KICK` 0), and a line into a ringed pocket
  glows with a shimmer; a lock-on flare fires at most once a second (a half-second wait and a tick sound were tried
  and dropped). The cue ball's dotted trail is no longer drawn (clutter).
- **Strike changes**: a Clean strike plays exactly as aimed (it pushed up to 0.15° and players couldn't see why it
  missed); an off-centre strike shows its skewed line (`drawSkew`). **Perfect strike edge**: pockets 12% wider and
  15% more forgiving of pace for that shot (568 -> 717 pots on the same test shots); its flash, slow motion and gold
  trail were toned down the same evening.
- **Pocket sound**: `sfx.drop` became a deep wooden clunk and a short roll.

## 14 Nov 2026

- **Short round goes live, brought forward to the 14 Nov game** (~17:30 UTC, on request; first merged ~16:45 for 15 Nov):
  rounds already finished that day kept the old format, so 14 Nov results mix the two. Released without the windmill
  (deck: gate, sand, cat) and without trick stars (replay only). Checked 15-28 Nov: 84 holes, every feature placed,
  10 ms average generation, 108 ms worst.
- **Short round test** (feedback: rounds too long, needs obstacles): at most 3 balls a table (par 1, 2, 4, 4, 4, 4 =
  19), a feature on holes 3-6 placed where it gets in the way (sand 93%, windmill 69%, gate 62%, cat 60% of the best
  opening pots; at random the windmill and gate managed 29% and 10%). Water dropped (players found it annoying). The
  random rough/slick patches were off on these days.
- **The cat** as a feature: a soft bumper (`CAT_R` 30, `CAT_E` 0.3) that moves into your way after a hit and leaves after
  two. 280 random shots on cat holes: no ball inside it, no NaN.
- **Golden pocket** on holes 2-6: first pot into it takes a stroke off (an open pot goes into it on 58% of holes).
- **Trick shots** (double, kick, bank, combo) got stars and, briefly, a stroke back; the stroke back made scores too low
  (a playtest round went -9), so stars only, then (at release) no stars at all, just the replay. A dedicated
  trick-shot hole was tried and dropped (too easy).
- **Generous guide** with bounce, kick and combination lines from geometry, then from simulation where geometry
  failed, capped at one cushion; the pocket ring added, decided by simulation because the geometric "heading into a
  pocket" test was right only ~70% of the time. Evening fixes: the line drawn at a pace that really pots, cushions
  counted the guide's own way (corner ricochets count), only the drawn pocket ringed (aims with 2+ rings 143 -> 10 of
  1,546). A ring that followed the pull ("softer/harder"), a ring at the last shot's pace, an allowance for a slightly
  off strike and an aim snap were all tried and dropped.
- **Harder strike from hole 3** (`strikeK`, spot -15%, wobble +12% wider / +15% faster, push up to 5°): a random release
  is clean 28% (was 39%), a timed one 71-83%. A first try at 25%/25%/30% was too harsh (48% on hole 6).
- **Strike grades**: a Perfect bullseye (`PERFECT_CORE` 0.4); Clean pushes up to 0.15° (0.5° was too punishing: 27% on
  long pots).
- **Never start lined up** (`startUnpotted`): 90 holes checked, 13 nudged, 1.5° at most.
- **Animation**: ball on the lip, instant replay, follow-through, contact flashes, ball tray, cat reactions. Table slides
  between holes were tried and removed (the playtester didn't like them).
- **Freeze fix**: a replay sinking a ball potted on an earlier shot produced NaN and killed the frame loop; the replay
  now only sinks balls that dropped during the shot, `drawBall` skips non-finite positions, and `frame` wraps `draw` in
  try/catch.
- **Raised island**: drawn as a raised walnut block (players read the flat version as a mat, not a wall).
- **Quick-shot prototype** (`?quick`: one drag to aim and shoot, a sweeping power meter) built late on 13 Nov and
  reverted at 01:04 on 14 Nov.

## 13 Nov 2026

- **Spread-out racks from 13 Nov**: no touching clusters, every ball 1.6 R from the others; smallest gap 28 px (was
  2 px), still openers and clearable, generation faster (9 ms). (Now always on.)
- **"Left before the first shot"** funnel event (`left`, with seconds and screen) and `opennew`/`openback`; `?me=1` to
  exclude the developer's devices.

## 12 Nov 2026

- **Par (golf) scoring becomes the daily game**: six holes, hole i had i + 1 balls, par = balls (+1 from hole 3, 25 in
  all), pick up at par + 3, gimmes, scorecard and ⛳ share text, par tally on the server (`p:<day>`). Lives days kept
  working until the 15 Nov cleanup.
- **Table shapes from hole 3**: classic plus hexagon, octagon, L-shape, hourglass, oval and island, dealt like a deck.
  40 levels per shape tested: all had an opener and were clearable, no ball left the felt in 1,440 random shots. The
  hourglass waist widened 160 -> 250 px (rejections ~14 -> ~5 per level).
- **First shot** (about half of phones never took one): `intro` and `pull` funnel steps, the pull-cue hand demo, a
  guaranteed first pot, the timing lesson and the aim lesson (slowed twice so there was time to read them). Shown once
  to existing players too, by decision.
- **Teaching spin**: the hole 2 spin demo and the one-time scratch rescue replaced the 11 Nov hole 3 spin tip.
- `aimOffset` measured from the ball the line actually hits.

## 11 Nov 2026

- **Today's rank**: `DayCounts` Durable Object and "Better than X% of today's players" (no player count on purpose); a
  near-miss line from the device's history (ladder only; gone with it).
- **Wording**: players never see "ladder" (reads as a ranking table in the UK); tagline "Your daily frame."; days named
  by date ("Daily Break 11 Nov"), dropping the #1, #2 numbering used since launch.
- **New link preview card** (`tools/og-card.html` -> `static/og.png`).
- **Sharing**: share text titled with the date and the plain site link. On the ladder it was always today's ranked
  result, even from a practice card; par cards share the round shown.
- **Practice limit**: 3 a day per device.
- **Drop-off funnel**: open -> shot -> clear1 -> level3 -> finish, once per device per day, in the Results report;
  Results also gained Web Analytics visits, referrers and devices.
- **Saved runs**: a ranked run in progress survives a reload.
- **Pace**: table at 0.75x; auto speed-up 1.6x under 35 after 2 s; tap 3x (was 2x after 1.2 s under 70, 4x on a tap).
- Tried and taken out: a **daily weather** system (damp, sunny, draughty, stormy, cold; it changed how balls rolled
  but not what you were trying to do: commits "Daily weather…" and "Stronger weather…"), and moving the timing
  close-up to the centre or out of the shot's way (kept bottom-left).
- **Obstacles prototype** (water, windmill, one-way gate; off in the live game): 48 holes per obstacle all openers and
  clearable. The gate later shipped (14-15 Nov); water and the windmill never did.
- Teaching spin, first version: a hole 3 tip until spin is used, and a nudge when a scratch is ahead.

## 10 Nov 2026

- **Launch** on dailybreak.app (domain bought through Cloudflare Registrar; www and workers.dev redirect). Deploy on
  push to `main` via GitHub Actions.
- The **ladder with lives**: level n had n balls, every level guaranteed a real opening pot and clearable by a
  perfect-execution bot (before that check, 20-65% of levels 4-10 were impossible); lives raised from 3 to 4; level 1
  a free warm-up.
- Controls for one thumb: pull back to shoot with a timed release and strike close-up, drag the gold spot for spin,
  the full-width aim strip (the target button was removed: tap a ball instead).
- Launch polish: three-line intro, device stats, day streak and countdown on the card, a hidden feedback link.
- Anonymous ranked results to Analytics Engine and the Results workflow.
- The rain-and-vinyl background hiss removed (it read as noise); film grain hops instead of sliding (read as rain).

## 9 Nov 2026

- Repo repurposed from a gym tracker into the Daily Break prototype; a day of rapid control and scoring experiments
  (slingshot, swing meters, call-your-shot) leading to the 10 Nov design.
