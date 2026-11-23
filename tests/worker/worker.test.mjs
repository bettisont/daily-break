// Checks src/worker.js with fake Cloudflare bindings. Run: node tests/worker/worker.test.mjs
// The worker imports 'cloudflare:workers', which Node can't load, so a temp copy swaps that import for a stub.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../src/worker.js'), 'utf8');
const stubbed = src.replace(/^import \{ DurableObject \} from 'cloudflare:workers';$/m, 'class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }');
if (stubbed === src) { console.error('FAIL could not stub the cloudflare:workers import'); process.exit(1); }
const dir = mkdtempSync(join(tmpdir(), 'worker-test-'));
const file = join(dir, 'worker.mjs');
writeFileSync(file, stubbed);
const { default: worker } = await import(pathToFileURL(file).href);
rmSync(dir, { recursive: true, force: true });

const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
// a limiter that allows `max` calls per key, or always answers `forced` once force() is called
function fakeLimiter(max) {
  const seen = {}; let forced;
  return {
    async limit({ key }) { if (forced !== undefined) return { success: forced }; seen[key] = (seen[key] || 0) + 1; return { success: seen[key] <= max }; },
    force(v) { forced = v; },
  };
}
function fakeEnv({ limiters = true } = {}) {
  const levels = {}, scores = {}, tricks = {};
  const days = {
    async tally(d) { const l = levels[d] || {}; return { players: sum(l), levels: l }; },
    async add(d, lv) { const l = (levels[d] ||= {}); l[lv] = (l[lv] || 0) + 1; return { players: sum(l), levels: l }; },
    async tallyPar(d) { const s = scores[d] || {}; return { players: sum(s), scores: s }; },
    async addPar(d, sc) { const s = (scores[d] ||= {}); s[sc] = (s[sc] || 0) + 1; return { players: sum(s), scores: s }; },
    async tallyTrial(d) { const s = tricks[d] || {}; return { players: sum(s), scores: s }; },
    async addTrial(d, b) { const s = (tricks[d] ||= {}); s[b] = (s[b] || 0) + 1; return { players: sum(s), scores: s }; },
  };
  const points = { RESULTS: [], EVENTS: [] };
  const env = {
    ASSETS: { fetch: async () => new Response('asset', { status: 200 }) },
    DAYS: { idFromName: n => n, get: () => days },
    RESULTS: { writeDataPoint: p => points.RESULTS.push(p) },
    EVENTS: { writeDataPoint: p => points.EVENTS.push(p) },
    points,
  };
  if (limiters) { env.RESULT_LIMIT = fakeLimiter(5); env.EVENT_LIMIT = fakeLimiter(30); }
  return env;
}

const today = new Date().toISOString().slice(0, 10);
const post = (path, body, ip = '203.0.113.7') => new Request('https://dailybreak.app' + path, {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});
const par = { day: today, mode: 'par', score: -2, strokes: 30, points: 1200 };

let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log('ok  ', name); } catch (e) { failed++; console.log('FAIL', name, '-', e.message); }
}
const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };

await check('valid par result -> 200 with tally', async () => {
  const env = fakeEnv();
  const r = await worker.fetch(post('/api/result', par), env);
  eq(r.status, 200, 'status');
  eq(await r.json(), { players: 1, scores: { '-2': 1 } }, 'body');
  eq(env.points.RESULTS.length, 1, 'data points');
});
await check('valid trial result -> 200, counted in its 100-point bucket', async () => {
  const env = fakeEnv();
  let r = await worker.fetch(post('/api/result', { day: today, mode: 'trial', points: 38470, tables: 7 }), env);
  eq([r.status, await r.json()], [200, { players: 1, scores: { 38400: 1 } }], 'first');
  r = await worker.fetch(post('/api/result', { day: today, mode: 'trial', points: 38400, tables: 6 }), env);
  eq(await r.json(), { players: 2, scores: { 38400: 2 } }, 'same bucket');
  eq(env.points.RESULTS[0].blobs, [today, 'trial'], 'blobs');
  eq(env.points.RESULTS[0].doubles, [38470, 7], 'doubles');
  r = await worker.fetch(new Request(`https://dailybreak.app/api/day?day=${today}&mode=trial`), env);
  eq(await r.json(), { players: 2, scores: { 38400: 2 } }, 'tally');
  r = await worker.fetch(new Request(`https://dailybreak.app/api/day?day=${today}&mode=par`), env);
  eq(await r.json(), { players: 0, scores: {} }, 'par tally untouched');
});
await check('trial result out of range -> 400', async () => {
  const env = fakeEnv({ limiters: false });
  for (const bad of [{ points: 2000001, tables: 10 }, { points: -1, tables: 1 }, { points: 1.5, tables: 1 }, { points: 100, tables: 1001 }, { points: 100 }]) {
    const r = await worker.fetch(post('/api/result', { day: today, mode: 'trial', ...bad }), env);
    eq([r.status, await r.json()], [400, { error: 'bad result' }], JSON.stringify(bad));
  }
  eq(env.points.RESULTS.length, 0, 'nothing written');
});
await check('valid lives result -> 200 with tally', async () => {
  const r = await worker.fetch(post('/api/result', { day: today, level: 3, potted: 12, points: 900 }), fakeEnv());
  eq(r.status, 200, 'status');
  eq(await r.json(), { players: 1, levels: { 3: 1 } }, 'body');
});
await check('6th result in a burst -> 429 slow down, not counted', async () => {
  const env = fakeEnv();
  for (let i = 0; i < 5; i++) eq((await worker.fetch(post('/api/result', par), env)).status, 200, `result ${i + 1}`);
  const r = await worker.fetch(post('/api/result', par), env);
  eq(r.status, 429, 'status');
  eq(await r.json(), { error: 'slow down' }, 'body');
  eq(env.points.RESULTS.length, 5, 'data points');
  eq(await (await worker.fetch(post('/api/result', par, '198.51.100.9'), env)).json(), { players: 6, scores: { '-2': 6 } }, 'other IP still allowed');
});
await check('limiter forced to say no -> 429', async () => {
  const env = fakeEnv(); env.RESULT_LIMIT.force(false);
  eq((await worker.fetch(post('/api/result', par), env)).status, 429, 'status');
});
await check('missing limiter bindings -> still 200 / 204', async () => {
  const env = fakeEnv({ limiters: false });
  for (let i = 0; i < 10; i++) eq((await worker.fetch(post('/api/result', par), env)).status, 200, `result ${i + 1}`);
  eq((await worker.fetch(post('/api/event', { day: today, step: 'open' }), env)).status, 204, 'event');
});
await check('limiter that throws -> allowed', async () => {
  const env = fakeEnv(); env.RESULT_LIMIT.limit = async () => { throw new Error('boom'); };
  eq((await worker.fetch(post('/api/result', par), env)).status, 200, 'status');
});
await check('bad body -> 400', async () => {
  const env = fakeEnv();
  let r = await worker.fetch(post('/api/result', '{nope'), env);
  eq([r.status, await r.json()], [400, { error: 'bad json' }], 'bad json');
  r = await worker.fetch(post('/api/result', { day: today, mode: 'par', score: 999, strokes: 1, points: 1 }), env);
  eq([r.status, await r.json()], [400, { error: 'bad result' }], 'bad result');
  r = await worker.fetch(post('/api/result', { day: '2001-01-01', level: 1, potted: 0, points: 0 }), env);
  eq([r.status, await r.json()], [400, { error: 'wrong day' }], 'wrong day');
  r = await worker.fetch(post('/api/event', { day: today, step: 'nope' }), env);
  eq([r.status, await r.text()], [400, 'bad event'], 'bad event');
});
await check('event -> 204, 31st in a burst -> 429 with no body', async () => {
  const env = fakeEnv();
  for (let i = 0; i < 30; i++) eq((await worker.fetch(post('/api/event', { day: today, step: 'shot' }), env)).status, 204, `event ${i + 1}`);
  const r = await worker.fetch(post('/api/event', { day: today, step: 'shot' }), env);
  eq([r.status, await r.text()], [429, ''], '31st');
  eq(env.points.EVENTS.length, 30, 'data points');
});
await check("'left' event -> 204", async () => {
  const env = fakeEnv();
  eq((await worker.fetch(post('/api/event', { day: today, step: 'left', secs: 12, where: 'intro' }), env)).status, 204, 'status');
  eq(env.points.EVENTS[0].blobs, [today, 'left', 'intro'], 'blobs');
});
await check('GET on POST endpoints -> 405', async () => {
  const r = await worker.fetch(new Request('https://dailybreak.app/api/result'), fakeEnv());
  eq([r.status, r.headers.get('allow')], [405, 'POST'], 'status');
});
await check('GET /api/day works', async () => {
  const env = fakeEnv();
  await worker.fetch(post('/api/result', par), env);
  let r = await worker.fetch(new Request(`https://dailybreak.app/api/day?day=${today}&mode=par`), env);
  eq([r.status, await r.json()], [200, { players: 1, scores: { '-2': 1 } }], 'par');
  r = await worker.fetch(new Request(`https://dailybreak.app/api/day?day=${today}`), env);
  eq([r.status, await r.json()], [200, { players: 0, levels: {} }], 'lives');
  r = await worker.fetch(new Request('https://dailybreak.app/api/day?day=junk'), env);
  eq(r.status, 400, 'bad day');
});
await check('other host -> 301 to dailybreak.app', async () => {
  const r = await worker.fetch(new Request('https://daily-break.example.workers.dev/some/path?x=1'), fakeEnv());
  eq([r.status, r.headers.get('location')], [301, 'https://dailybreak.app/some/path?x=1'], 'redirect');
});
await check('other paths -> assets', async () => {
  const r = await worker.fetch(new Request('https://dailybreak.app/'), fakeEnv());
  eq(await r.text(), 'asset', 'body');
});

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
