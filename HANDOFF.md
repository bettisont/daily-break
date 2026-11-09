# Daily Break - handoff

A daily pool roguelike for the browser, aiming to copy the model of
http://dailyholes.com: same seeded content for everyone each day, one ranked
attempt, shareable emoji result, monetised by ads plus a subscription.

## Status (2026-11-09)

Single-file prototype: index.html (no build, open in a browser). Published
as a claude.ai artifact for playtesting.

Second pass (feel and presentation):
- Portrait table (500 x 1000) with side pockets on the long edges; the cue
  ball starts near the bottom and racks spawn in the top two-thirds. Ball
  radius went from 13 to 15 so numbers read on phones.
- Calm night lakeside background on its own canvas: drifting sky colours,
  twinkling stars, moon and its reflection on the water, fireflies, bokeh,
  swaying grass. Static when prefers-reduced-motion is set.
- Shot feel: balls visibly roll (3D number and stripe rotation), motion
  trails, cue-stick strike animation, power ring round the cue ball, balls
  sink into pockets with a ripple, combo call-outs (Double!, Bank shot!),
  a score counter that ticks up, petals when a table is cleared, phone vibration.
- Sound: layered clack/cushion/pot sounds through a soft echo, pentatonic
  chimes that grow with the mult, and an optional ambient pad + bell music
  loop (music button, on by default once you interact).
- First visit shows a How to play card (also on the ? button).
- Core loop (fifth pass): plan, then timing. You no longer aim. Each turn
  you tap up to 3 balls (4 with the Long Plan relic) in the order you want
  to pot them. shotFor() picks the best pocket, exact aim and power for each.
  previewPlan() replays the plan on a cloned table with perfect timing and
  draws each shot path plus where the cue ball stops; coloured rings show
  how easy each remaining ball is from there (hw = timing half-width).
  Then each shot gets a timing meter: a needle ping-pongs across the bar,
  and tapping inside the zone plays the exact shot (inner 35% = Perfect, +1
  mult). Outside the zone the aim is pushed/pulled and it misses. Each shot
  in a run is 15% faster. A miss or scratch ends the turn and you keep what
  you scored; potting every called ball (plans of 2+) doubles the mult.
  4 turns per table. Ball-ball collisions now rewind to the exact contact
  time, so perfect-timing shots pot about 96% of the time (measured).
- Relics changed with the loop: Long Sight -> Steady Hand (zones 40% wider),
  Power Break -> Long Plan (+1 ball per plan). Ids kept as 'sight'/'power'
  so old saved results still render. Boss Blindfold -> Jitters (needle
  much faster).

The pure game logic is unchanged apart from table geometry, so the balance
numbers below are from the old landscape table and need re-running.

## Where Daily Holes' model came from (research done 2026-11-09)

- Game: a free daily 9-hole golf course built from the date, one ranked
  round a day, older days playable as practice that doesn't count, the server
  re-runs every shot before accepting a score (anti-cheat),
  friends/leagues/head-to-head challenges, streaks for signed-in players, a
  page per day (/courses/YYYY-MM-DD) and guide pages that bring in search
  traffic. Solo developer in Finland, launched about 29 Aug 2026.
- Money:
  - Google AdSense on the web and AdMob in the iPhone app, never shown during
    play.
  - "Club" subscription at EUR 4.99/month or EUR 39/year: 2 replays a day,
    unlimited practice, cosmetic balls and shot trails, music, no ads.
  - Paid replays at EUR 0.89 each or 3 for EUR 1.99. These count on the
    ranked board, which is pay-to-win: we chose not to copy that and would keep
    paid attempts on a separate board or practice-only.
  - Stripe for payments and an IAB TCF cookie-consent banner.
- Revenue estimate (my guess, no data): about EUR 2-5k/month at 10k daily
  players. It is probably at the low end of that, a few hundred to a couple
  of thousand a month. To get real numbers, count entries on its daily
  leaderboard.

## Game design as built

- A run is 9 tables in sets of three: Opener, Main, Boss. The date seeds
  every table layout, ball rack, boss and shop offer, so all players see the
  same ones.
- 6 shots per table to reach the target (TARGETS). Clearing the table
  before reaching it brings a new rack. Running out of shots short of the
  target ends the run.
- Score per shot is chips x mult:
  - Chips are 10 plus the ball number x 10.
  - Mult goes up by 1 per extra pot in the same shot, per banked pot and per
    bomb blast.
  - Pink balls double that shot's mult.
  - Potting the cue ball scores 0 for that shot.
- Special balls: gold (coins), mult (x2), bomb (blows up on impact and
  scatters nearby balls).
- Shop after each table: coins come from clearing, unused shots and gold
  balls. 3 seeded offers plus a reroll (2 coins, rising). 18 relics, max 6
  held.
- Bosses (3 of 6 per run): smaller pockets, no friction, no aim line, dead
  cushions, two closed pockets, heavy object balls.
- Feel: score pop-ups, screen shake, particles and synthesised sound
  effects. The aim line is short by default (the Long Sight relic gives the
  full line).
- The ranked run is saved in localStorage per date. Practice runs use
  ?seed=xyz or the random button.
- Results share as one emoji per table: green square cleared, crown boss
  cleared, skull failed, plus the relics held.

## Code layout

- The top half of the script is pure logic with no DOM: seeded RNG
  (mulberry32 + FNV), makeLayout, makeRack, shotScore, the Table class
  (physics at a fixed 1/240 s step, so it is deterministic and can later be
  re-run on a server), shopOffers.
- The bottom half, after the "browser" comment, handles rendering, input,
  sound and the overlays.
- Tuning constants are at the top: TARGETS, BASE_SHOTS, friction,
  restitution, MAX_SPEED.

## Balance notes

Targets: 500, 900, 1200, 1700, 2200, 2700, 3400, 4200, 5200. Tuned with a
headless bot (greedy planner, Gaussian timing error, buys the cheapest
relics), 80 runs each:

- Sharp timing (sd 0.035 of a sweep): cleared table 3 96%, table 6 71%,
  all 9 21%.
- Casual timing (sd 0.055): table 3 69%, table 6 35%, all 9 4%.

Per-table scores over 4 turns with no relics: casual median about 2,200,
sharp about 3,400. Re-run the bot after changing shotFor, the timing zone
sizes or the scoring.

## Next ideas

- Spin on the cue ball, more ball types and bosses, relic synergies.
- Resume a half-played run.
- A server that re-runs shots to validate scores, plus a daily leaderboard
  and friends.
- Monetisation: a subscription (practice runs, cosmetic cues/balls/felts,
  no ads), ads only between tables, a page per day for search traffic.
