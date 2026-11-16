# Daily Break - changelog

Newest first. One entry per dated change: what changed, why, and the key numbers. How things work now is in
`HANDOFF.md`; this is the history, including things that were tried and taken out (most are still in the git
history under the commit named).

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
