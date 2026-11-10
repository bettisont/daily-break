// Serves the game from dailybreak.app. Any other host (the old workers.dev address,
// www.dailybreak.app) gets a permanent redirect to the same path on dailybreak.app.
// POST /api/result records one anonymous ranked result (day, level, balls, points) in
// Workers Analytics Engine, dataset daily_break_results; .github/workflows/results.yml reads it.
const HOST = 'dailybreak.app';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

async function recordResult(request, env) {
  let r;
  try { r = await request.json(); } catch { return new Response('bad json', { status: 400 }); }
  if (!r || !DAY.test(r.day) || !int(r.level, 1, 99) || !int(r.potted, 0, 2000) || !int(r.points, 0, 10_000_000)) {
    return new Response('bad result', { status: 400 });
  }
  // only today or yesterday in some time zone (players' local dates straddle UTC)
  const ms = Date.parse(r.day + 'T12:00:00Z') - Date.now();
  if (!(ms > -2.5 * 864e5 && ms < 1.5 * 864e5)) return new Response('wrong day', { status: 400 });
  env.RESULTS?.writeDataPoint({ indexes: [r.day], blobs: [r.day], doubles: [r.level, r.potted, r.points] });
  return new Response(null, { status: 204 });
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
    return env.ASSETS.fetch(request);
  },
};
