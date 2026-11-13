// Serves the game from dailybreak.app. Any other host (the old workers.dev address,
// www.dailybreak.app) gets a permanent redirect to the same path on dailybreak.app.
//
// POST /api/result  one anonymous ranked result: {day, level, potted, points} for a lives day, or
//                   {day, mode: 'par', score, strokes, points} for a par (golf) day. It goes to Workers
//                   Analytics Engine (dataset daily_break_results, read by .github/workflows/results.yml)
//                   and is counted in the DayCounts Durable Object. Replies with that day's tally.
// POST /api/event   one anonymous funnel step {day, step} (open, opennew/openback, intro, pull, shot, clear1, level3,
//                   finish), sent at most once per device per day; Analytics Engine dataset daily_break_events.
//                   'left' (page hidden before the first shot) adds {secs, where: intro|table|pulled}.
// GET  /api/day?day=YYYY-MM-DD   that day's tally: { players, levels: { "<level>": count } },
//                   so the result card can say "better than X% of today's players". With &mode=par:
//                   { players, scores: { "<score to par>": count } }.
import { DurableObject } from 'cloudflare:workers';

const HOST = 'dailybreak.app';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
// the day a player's local calendar can be on right now (time zones straddle UTC)
const dayIsCurrent = d => { const ms = Date.parse(d + 'T12:00:00Z') - Date.now(); return ms > -2.5 * 864e5 && ms < 1.5 * 864e5; };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

// One object for the whole game holds a count of players per level for each day (no IDs, nothing else).
export class DayCounts extends DurableObject {
  async tally(day) {
    const levels = (await this.ctx.storage.get('d:' + day)) || {};
    return { players: Object.values(levels).reduce((a, b) => a + b, 0), levels };
  }
  async add(day, level) {
    const key = 'd:' + day, levels = (await this.ctx.storage.get(key)) || {};
    levels[level] = (levels[level] || 0) + 1;
    await this.ctx.storage.put(key, levels);
    return { players: Object.values(levels).reduce((a, b) => a + b, 0), levels };
  }
  // par days: a count of players per score to par
  async tallyPar(day) {
    const scores = (await this.ctx.storage.get('p:' + day)) || {};
    return { players: Object.values(scores).reduce((a, b) => a + b, 0), scores };
  }
  async addPar(day, score) {
    const key = 'p:' + day, scores = (await this.ctx.storage.get(key)) || {};
    scores[score] = (scores[score] || 0) + 1;
    await this.ctx.storage.put(key, scores);
    return { players: Object.values(scores).reduce((a, b) => a + b, 0), scores };
  }
}
const STEPS = new Set(['open', 'opennew', 'openback', 'intro', 'pull', 'shot', 'clear1', 'level3', 'finish', 'left']);
const WHERE = new Set(['intro', 'table', 'pulled']);
async function recordEvent(request, env) {
  let e;
  try { e = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
  if (!e || !DAY.test(e.day) || !STEPS.has(e.step) || !dayIsCurrent(e.day)) return new Response('bad event', { status: 400 });
  // 'left' (page hidden before the first shot) also carries seconds on the page and the screen they were on
  if (e.step === 'left') {
    if (!int(e.secs, 0, 86400) || !WHERE.has(e.where)) return new Response('bad event', { status: 400 });
    env.EVENTS?.writeDataPoint({ indexes: [e.day], blobs: [e.day, e.step, e.where], doubles: [1, e.secs] });
    return new Response(null, { status: 204 });
  }
  env.EVENTS?.writeDataPoint({ indexes: [e.day], blobs: [e.day, e.step], doubles: [1] });
  return new Response(null, { status: 204 });
}
const counter = env => env.DAYS.get(env.DAYS.idFromName('all'));

async function recordResult(request, env) {
  let r;
  try { r = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (r && r.mode === 'par') {
    if (!DAY.test(r.day) || !int(r.score, -30, 60) || !int(r.strokes, 0, 200) || !int(r.points, 0, 10_000_000)) return json({ error: 'bad result' }, 400);
    if (!dayIsCurrent(r.day)) return json({ error: 'wrong day' }, 400);
    env.RESULTS?.writeDataPoint({ indexes: [r.day], blobs: [r.day, 'par'], doubles: [r.score, r.strokes, r.points] });
    return json(await counter(env).addPar(r.day, r.score));
  }
  if (!r || !DAY.test(r.day) || !int(r.level, 1, 99) || !int(r.potted, 0, 2000) || !int(r.points, 0, 10_000_000)) return json({ error: 'bad result' }, 400);
  if (!dayIsCurrent(r.day)) return json({ error: 'wrong day' }, 400);
  env.RESULTS?.writeDataPoint({ indexes: [r.day], blobs: [r.day], doubles: [r.level, r.potted, r.points] });
  return json(await counter(env).add(r.day, r.level));
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname !== HOST) {
      url.protocol = 'https:'; url.hostname = HOST; url.port = '';
      return Response.redirect(url.toString(), 301);
    }
    if (url.pathname === '/api/result') {
      if (request.method !== 'POST') return new Response('POST only', { status: 405, headers: { allow: 'POST' } });
      return recordResult(request, env);
    }
    if (url.pathname === '/api/event') {
      if (request.method !== 'POST') return new Response('POST only', { status: 405, headers: { allow: 'POST' } });
      return recordEvent(request, env);
    }
    if (url.pathname === '/api/day') {
      const day = url.searchParams.get('day') || '';
      if (!DAY.test(day) || !dayIsCurrent(day)) return json({ error: 'bad day' }, 400);
      return json(url.searchParams.get('mode') === 'par' ? await counter(env).tallyPar(day) : await counter(env).tally(day));
    }
    return env.ASSETS.fetch(request);
  },
};
