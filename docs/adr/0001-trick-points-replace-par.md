# 1. Trick points replace par (on trial)

Date: 22 Nov 2026. Status: accepted for a trial behind `?trick`; goes live once `RULES.TRICK_SCORE_FROM` has a date.

## Context

Rounds are scored like golf: strokes to par. Skill only shows as fewer strokes, and a lot of players tie on par.
The trick-shot replays are the highlight of a round, but they're worth nothing. On 14 Nov trick shots briefly took a
stroke back, and a playtest round went -9, so that was dropped.

## Decision

The ranked score becomes points, and strokes are only the hole's budget (par + 3).
- A pot is 100. Each trick element adds +200 and they stack: an extra ball in one shot, a bank, a kick, a combination,
  a tunnel, a cannon (the cue ball touches two object balls) or a moving target crossed. A Quick shot (released
  within 5 s) adds +100. Targets and Quick only count on a shot that pots.
- The streak multiplier (x1 to x3, +0.5 for each potting shot in a row, carried across holes) multiplies every shot.
  A shot that pots nothing, or a foul, resets it. This is what stops farming: a set-up shot throws the streak away.
- The first pot into the golden pocket doubles that shot.
- Clearing a hole scores nothing extra (a 300-a-ball bonus was tried and dropped): multipliers always come last.
- A foul costs a stroke and resets the streak; balls it pots stay down but score 0.
- Tap-ins are removed.
- Rank: a separate `trick` mode on the server, in buckets of 50 points, higher is better.
- Moving targets are touch-free and come from their own seeded numbers, so no course changes. Solid moving obstacles
  were left for later: they'd change the physics and hole generation.
- No onboarding card and no help change: the live bursts, the breakdown, the streak meter and the warming lamp teach
  it.

## Consequences

- Scores no longer read as golf. The share card shows points and trick emoji instead of coloured squares.
- Days before the switch keep par, including their `?seed=` links. A run saved under the other scoring is not resumed.
- The point values are a first guess. Tune them in the `?trick` trial before choosing a date.
