// Serves the game from dailybreak.app. Any other host (the old workers.dev address,
// www.dailybreak.app) gets a permanent redirect to the same path on dailybreak.app.
//
// POST /api/result  one anonymous ranked result: {day, level, potted, points} for a lives day, or
//                   {day, mode: 'par', score, strokes, points} for a par (golf) day, or {day, mode: 'trial', points,
//                   tables} for a timed-trial day (points 0..2000000, counted in buckets of 100). It goes to Workers
//                   Analytics Engine (dataset daily_break_results, read by .github/workflows/results.yml)
//                   and is counted in the DayCounts Durable Object. Replies with that day's tally.
// POST /api/event   one anonymous funnel step {day, step} (open, opennew/openback, intro, pull, shot, clear1, level3,
//                   finish), sent at most once per device per day; Analytics Engine dataset daily_break_events.
//                   'left' (page hidden before the first shot) adds {secs, where: intro|table|pulled}. Practice runs
//                   of the timed game send 'pstart' (first shot) and 'pfinish' {points}, once a run, no IDs.
// GET  /api/day?day=YYYY-MM-DD   that day's tally: { players, levels: { "<level>": count } },
//                   so the result card can say "better than X% of today's players". With &mode=par:
//                   { players, scores: { "<score to par>": count } }. With &mode=trial: { players, scores:
//                   { "<points, rounded down to 100>": count } }.
// POST /api/card?points=N&day=YYYY-MM-DD|practice  a timed run's share card for link previews (23 Nov): the body is
//                   the PNG the game drew, exactly 1200x630 and at most 300 KB (checked from its header). Kept in the
//                   ShareCards Durable Object for 30 days, with nothing about who sent it. Replies {id}.
// GET  /r/<id>      a tiny page whose link preview (og:image) is that card; a person opening it goes on to the
//                   game. GET /r/<id>.png is the card itself. An unknown or expired id redirects to the game.
// Rate limits (Workers Rate Limiting, keyed on the client IP, which is never logged or stored here):
//                   /api/result 5 per minute (else 429 {error: 'slow down'}), /api/event 30 per minute (else
//                   429, no body); /api/card 5 per minute. A real player sends one result and ~10 events a day. If the binding is
//                   missing (local dev) or fails, the request is allowed.
import { DurableObject } from 'cloudflare:workers';

const HOST = 'dailybreak.app';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
// the day a player's local calendar can be on right now (time zones straddle UTC)
const dayIsCurrent = d => { const ms = Date.parse(d + 'T12:00:00Z') - Date.now(); return ms > -2.5 * 864e5 && ms < 1.5 * 864e5; };
// the timed trial (22-23 Nov 2026): points are counted in buckets so a day's tally stays small (keep in step with
// js/game.js). The multiplier has no cap, so the points limit is generous; it only stops nonsense.
const TRIAL_BUCKET = 100, TRIAL_MAX = 2_000_000;
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
  // timed-trial days: a count of players per bucket of TRIAL_BUCKET points, under its own key
  async tallyTrial(day) {
    const scores = (await this.ctx.storage.get('r:' + day)) || {};
    return { players: Object.values(scores).reduce((a, b) => a + b, 0), scores };
  }
  async addTrial(day, bucket) {
    const key = 'r:' + day, scores = (await this.ctx.storage.get(key)) || {};
    scores[bucket] = (scores[bucket] || 0) + 1;
    await this.ctx.storage.put(key, scores);
    return { players: Object.values(scores).reduce((a, b) => a + b, 0), scores };
  }
}
// Share cards (23 Nov): the images behind /r/<id> link previews. Meta ('m:' + id: when, points, day) and the image
// ('i:' + id) are kept apart so the daily clean-up (alarm) reads only the small records. 30 days, then gone.
const CARD_DAYS = 30, CARD_MAX = 300_000, CARD_W = 1200, CARD_H = 630;
export class ShareCards extends DurableObject {
  async put(id, img, meta) {
    await this.ctx.storage.put({ ['i:' + id]: img, ['m:' + id]: { ...meta, at: Date.now() } });
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + 864e5);
  }
  async meta(id) {
    const m = await this.ctx.storage.get('m:' + id);
    return m && Date.now() - m.at < CARD_DAYS * 864e5 ? m : null;
  }
  async image(id) { return (await this.meta(id)) ? this.ctx.storage.get('i:' + id) : null; }
  async alarm() {
    const old = [], cut = Date.now() - CARD_DAYS * 864e5;
    for (const [k, m] of await this.ctx.storage.list({ prefix: 'm:' })) if (m.at < cut) old.push(k, 'i:' + k.slice(2));
    for (let i = 0; i < old.length; i += 128) await this.ctx.storage.delete(old.slice(i, i + 128));
    if ((await this.ctx.storage.list({ prefix: 'm:', limit: 1 })).size) await this.ctx.storage.setAlarm(Date.now() + 864e5);
  }
}
const cards = env => env.CARDS.get(env.CARDS.idFromName('cards'));
function newCardId() {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', b = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(b, x => abc[x % abc.length]).join('');
}
// a real PNG of exactly the card's size: the signature, then the IHDR chunk's width and height
function isCardPng(buf) {
  const b = new Uint8Array(buf), sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (b.length < 33 || sig.some((v, i) => b[i] !== v)) return false;
  const dv = new DataView(buf);
  return String.fromCharCode(...b.slice(12, 16)) === 'IHDR' && dv.getUint32(16) === CARD_W && dv.getUint32(20) === CARD_H;
}
async function saveCard(request, env, url) {
  const points = Number(url.searchParams.get('points')), day = url.searchParams.get('day') || '';
  if (!int(points, 0, TRIAL_MAX) || !(day === 'practice' || (DAY.test(day) && dayIsCurrent(day)))) return json({ error: 'bad card' }, 400);
  if (Number(request.headers.get('content-length') || 0) > CARD_MAX) return json({ error: 'too big' }, 413);
  const buf = await request.arrayBuffer();
  if (buf.byteLength > CARD_MAX) return json({ error: 'too big' }, 413);
  if (!isCardPng(buf)) return json({ error: 'not a card' }, 400);
  const id = newCardId();
  await cards(env).put(id, buf, { points, day });
  return json({ id });
}
const esc = s => String(s).replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
async function cardPage(env, id) {
  const m = await cards(env).meta(id);
  if (!m) return Response.redirect('https://' + HOST + '/', 302);
  const pts = m.points.toLocaleString('en-US'), title = `${pts} points on Daily Break`, img = `https://${HOST}/r/${id}.png`;
  const desc = 'A new two-minute pool run every day, the same tables for everyone. Can you beat it?';
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta property="og:type" content="website"><meta property="og:site_name" content="Daily Break">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="https://${HOST}/r/${id}"><meta property="og:image" content="${img}">
<meta property="og:image:type" content="image/png"><meta property="og:image:width" content="${CARD_W}"><meta property="og:image:height" content="${CARD_H}">
<meta property="og:image:alt" content="${esc(title)}"><meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0;url=/"></head><body style="background:#120f24"><script>location.replace('/')</script></body></html>`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}
const STEPS = new Set(['open', 'opennew', 'openback', 'intro', 'pull', 'shot', 'clear1', 'level3', 'finish', 'left', 'pstart', 'pfinish']);   // (pstart/pfinish: practice runs of the timed game, 23 Nov)
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
  // 'pfinish' (a practice run finished) also carries its points
  if (e.step === 'pfinish') {
    if (!int(e.points, 0, TRIAL_MAX)) return new Response('bad event', { status: 400 });
    env.EVENTS?.writeDataPoint({ indexes: [e.day], blobs: [e.day, e.step], doubles: [1, e.points] });
    return new Response(null, { status: 204 });
  }
  env.EVENTS?.writeDataPoint({ indexes: [e.day], blobs: [e.day, e.step], doubles: [1] });
  return new Response(null, { status: 204 });
}
// true unless the limiter positively says this client is over its limit
async function allowed(limiter, request) {
  if (!limiter) return true;
  try { return (await limiter.limit({ key: request.headers.get('cf-connecting-ip') || 'none' })).success !== false; } catch { return true; }
}
const counter = env => env.DAYS.get(env.DAYS.idFromName('all'));

async function recordResult(request, env) {
  let r;
  try { r = await request.json(); } catch { return json({ error: 'bad json' }, 400); }
  if (r && r.mode === 'trial') {
    if (!DAY.test(r.day) || !int(r.points, 0, TRIAL_MAX) || !int(r.tables, 0, 1000)) return json({ error: 'bad result' }, 400);
    if (!dayIsCurrent(r.day)) return json({ error: 'wrong day' }, 400);
    env.RESULTS?.writeDataPoint({ indexes: [r.day], blobs: [r.day, 'trial'], doubles: [r.points, r.tables] });
    return json(await counter(env).addTrial(r.day, Math.floor(r.points / TRIAL_BUCKET) * TRIAL_BUCKET));
  }
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
      if (!(await allowed(env.RESULT_LIMIT, request))) return json({ error: 'slow down' }, 429);
      return recordResult(request, env);
    }
    if (url.pathname === '/api/event') {
      if (request.method !== 'POST') return new Response('POST only', { status: 405, headers: { allow: 'POST' } });
      if (!(await allowed(env.EVENT_LIMIT, request))) return new Response(null, { status: 429 });
      return recordEvent(request, env);
    }
    if (url.pathname === '/api/card') {
      if (request.method !== 'POST') return new Response('POST only', { status: 405, headers: { allow: 'POST' } });
      if (!(await allowed(env.CARD_LIMIT, request))) return json({ error: 'slow down' }, 429);
      return saveCard(request, env, url);
    }
    const share = url.pathname.match(/^\/r\/([A-Za-z0-9]{10})(\.png)?$/);
    if (share) {
      if (!share[2]) return cardPage(env, share[1]);
      const img = await cards(env).image(share[1]);
      if (!img) return new Response('not found', { status: 404 });
      return new Response(img, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=2592000, immutable' } });
    }
    if (url.pathname === '/api/day') {
      const day = url.searchParams.get('day') || '';
      if (!DAY.test(day) || !dayIsCurrent(day)) return json({ error: 'bad day' }, 400);
      const mode = url.searchParams.get('mode');
      return json(mode === 'par' ? await counter(env).tallyPar(day) : mode === 'trial' ? await counter(env).tallyTrial(day) : await counter(env).tally(day));
    }
    return env.ASSETS.fetch(request);
  },
};
