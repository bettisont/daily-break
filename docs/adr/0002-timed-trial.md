# 2. The daily game becomes a two-minute timed trial (on trial)

Date: 23 Nov 2026. Status: accepted for a trial behind `?trick`; goes live once `RULES.TRICK_SCORE_FROM` has a date.
Builds on ADR 0001 (points replace par) and replaces its six holes with stroke budgets.

## Context

Trick scoring (ADR 0001) kept the six holes and a stroke budget per hole, which never quite fitted points: a budget
is a golf idea. Playtests asked for a timed element and for chains of good shots to pay more.

## Decision

- **The run.** 2 minutes of aiming time. The clock stops while the balls roll, the score tallies or the next table
  deals in, so no animation costs time. At zero you get one last shot.
- **The tables.** One seeded sequence per day, the same for everyone: table n is built like hole n (tables 1-6 are the
  old holes). Clear a table and the next comes. There's no shot limit and no skip.
- **Scoring.** As ADR 0001, with Quick dropped (the clock rewards speed). The multiplier is one meter with no cap: each
  potting shot adds 0.5, each trick 0.1 and the golden pocket 0.2, for the shots after it. A miss halves what's above
  x1; a foul resets it. Misses and fouls cost no time.
- **Runs.** One ranked run a day, unlimited practice runs, and a run resumes exactly after a reload.
- **Results.** Points, tables cleared, best multiplier and best shot. The share text has the points, the tables and
  "Beat N% of today's players", with no player count.
- **Rollout.** Replaces the six-hole trick mode behind `?trick`; the worker counts `mode: 'trial'` on its own.

## Consequences

- With no cap, the multiplier runs away for a strong player: a near-perfect bot reached x15.9 and about 300,000 points
  in 30 tables, while a sloppy one made about 58,000. Watch the spread in testing; a cap (x5) or a slower build may
  be needed.
- Tables past six are new layouts, not covered by the snapshot test (which still guards tables 1-6).
- The par game, its help and its records are untouched.
