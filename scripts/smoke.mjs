#!/usr/bin/env node
/**
 * End-to-end smoke test for a RUNNING PaddyGuard stack (local, compose, or deployed). Node >= 20, no dependencies.
 *
 *   node scripts/smoke.mjs <API_BASE_URL> [--origin <client-url>] [--image <file.jpg>] [--wait <seconds>]
 *
 *   node scripts/smoke.mjs http://localhost:4000
 *   node scripts/smoke.mjs https://paddyguard-api.onrender.com --origin https://paddyguard.vercel.app
 *
 * Creates ONE real scan (it will appear in the database for a throw-away device id) and exercises every route.
 * Exit code 0 = all checks passed, 1 = at least one failed.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const BASE = (args.find((a) => /^https?:\/\//.test(a)) || '').replace(/\/$/, '');
if (!BASE) { console.error('Usage: node scripts/smoke.mjs <API_BASE_URL> [--origin URL] [--image FILE] [--wait SECONDS]'); process.exit(2); }
const ORIGIN = flag('--origin');
const WAIT_S = Number(flag('--wait', 180));
const IMAGE = flag('--image', new URL('../server/test/fixtures/leaf.jpg', import.meta.url).pathname);

const A = randomUUID();
const B = randomUUID();
const green = (s) => `\x1b[32m${s}\x1b[0m`, red = (s) => `\x1b[31m${s}\x1b[0m`, yellow = (s) => `\x1b[33m${s}\x1b[0m`, dim = (s) => `\x1b[2m${s}\x1b[0m`;
let failed = 0;
const warnings = [];

async function check(name, fn) {
  const t0 = Date.now();
  try {
    const note = await fn();
    console.log(`${green('PASS')} ${name}${note ? dim(`  ${note}`) : ''} ${dim(`(${((Date.now() - t0) / 1000).toFixed(1)}s)`)}`);
  } catch (e) {
    failed += 1;
    console.log(`${red('FAIL')} ${name}\n     ${red(e.message)}`);
  }
}
const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
const warn = (msg) => { warnings.push(msg); console.log(`${yellow('WARN')} ${msg}`); };

async function http(path, { device = A, headers = {}, ...init } = {}) {
  const h = { ...(device ? { 'X-Device-Id': device } : {}), ...headers };
  const res = await fetch(BASE + path, { ...init, headers: h, signal: AbortSignal.timeout(150_000) });
  let body = null;
  try { body = await res.clone().json(); } catch { /* not json */ }
  return { res, status: res.status, body };
}

let scan;
const bytes = await fs.readFile(IMAGE).catch(() => { console.error(`Cannot read image ${IMAGE}`); process.exit(2); });
const form = (buf = bytes, name = 'leaf.jpg', type = 'image/jpeg', extra = {}) => {
  const fd = new FormData();
  fd.append('image', new File([buf], name, { type }));
  for (const [k, v] of Object.entries(extra)) fd.append(k, String(v));
  return fd;
};

console.log(`\nPaddyGuard smoke test -> ${BASE}\n`);

await check('server is up and database connected', async () => {
  const { status, body } = await http('/api/health', { device: null });
  ok(status === 200, `GET /api/health returned ${status}`);
  ok(body.db === 'up', `database is "${body.db}"`);
  return `storage=${body.storage}`;
});

await check('AI service is awake (waits through a cold start)', async () => {
  const t0 = Date.now();
  let last = '';
  while ((Date.now() - t0) / 1000 < WAIT_S) {
    const { body } = await http('/api/health/ai', { device: null });
    last = body?.status;
    if (last === 'up') return `model=${body.model_version}${body.mock_ai ? ' (MOCK_AI)' : ''}`;
    process.stdout.write(dim('     still waking up...\r'));
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error(`AI service still "${last}" after ${WAIT_S}s. Check INTERNAL_KEY / AI_SERVICE_URL and the Space logs.`);
});

await check('class list comes from the AI service', async () => {
  const { status, body } = await http('/api/classes', { device: null });
  ok(status === 200 && body.classes?.length >= 2, `status ${status}`);
  ok(body.classes.every((c) => c.class_key && c.display_name), 'classes need class_key + display_name');
  return `${body.classes.length} classes`;
});

await check('scan: upload -> model -> storage -> database (201)', async () => {
  const r = await http('/api/scans', { method: 'POST', body: form(bytes, 'leaf.jpg', 'image/jpeg', { lat: 24.817, lon: 93.937, district: 'Imphal West', crop_age_days: 45 }) });
  ok(r.status === 201, `POST /api/scans returned ${r.status}: ${JSON.stringify(r.body?.error ?? r.body)?.slice(0, 200)}`);
  scan = r.body;
  const a = scan.aiResponse;
  ok(['ok', 'low_confidence', 'unclear_image'].includes(a.status), `bad status ${a.status}`);
  ok(typeof a.model_version === 'string' && Array.isArray(a.top3), 'response does not match the contract');
  ok(a.status !== 'ok' || (a.prediction && a.advice), 'ok status without prediction/advice');
  ok(a.status === 'ok' || (a.prediction === null && a.advice === null), 'non-ok status must have no prediction/advice');
  return `${a.status}${a.prediction ? ` -> ${a.prediction.display_name} ${(a.prediction.confidence * 100).toFixed(1)}%` : ''}`;
});

await check('image was stored and is publicly viewable (Cloudinary / storage works)', async () => {
  ok(!scan.warnings?.includes('image_not_saved'), 'server reports image_not_saved: check CLOUDINARY_* settings and Cloudinary logs');
  ok(scan.imageRef?.url, 'scan has no imageRef.url');
  const r = await fetch(scan.imageRef.url, { signal: AbortSignal.timeout(20_000) });
  ok(r.ok, `GET ${scan.imageRef.url} returned ${r.status}`);
  ok(/^image\//.test(r.headers.get('content-type') || ''), `content-type is ${r.headers.get('content-type')}`);
  return scan.imageRef.provider;
});

await check('weather context (informational)', async () => {
  const w = scan.aiResponse.weather;
  if (scan.aiResponse.status === 'unclear_image') return 'skipped (unclear image has no weather)';
  if (!w) { warn('weather is null: Open-Meteo unreachable from the AI service? (scans still work without it)'); return 'null'; }
  ok(/trainable fusion is future work/.test(w.context_note), 'context note lost the rule-based label');
  return `past 7d humidity>90% = ${w.features.past_7d.hours_humidity_gt90} h`;
});

await check('read back: GET /api/scans/:id matches what was stored', async () => {
  const { status, body } = await http(`/api/scans/${scan.id}`);
  ok(status === 200, `status ${status}`);
  ok(JSON.stringify(body.aiResponse) === JSON.stringify(scan.aiResponse), 'stored aiResponse differs from the one returned');
});

await check('history lists the new scan', async () => {
  const { status, body } = await http('/api/scans?limit=5');
  ok(status === 200 && body.items.some((s) => s.id === scan.id), 'new scan missing from history');
});

await check("privacy: another device cannot read, list or rate this scan", async () => {
  ok((await http(`/api/scans/${scan.id}`, { device: B })).status === 404, "device B could fetch device A's scan");
  const list = await http('/api/scans', { device: B });
  ok(list.status === 200 && !list.body.items.some((s) => s.id === scan.id), "device B's history contains A's scan");
  const fb = await http(`/api/scans/${scan.id}/feedback`, { device: B, method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"correct":true}' });
  ok(fb.status === 404, `device B could rate A's scan (status ${fb.status})`);
  ok((await http('/api/scans', { device: null })).status === 400, 'request without X-Device-Id was not rejected');
});

await check('feedback is saved', async () => {
  const classes = (await http('/api/classes', { device: null })).body.classes;
  const payload = scan.aiResponse.status === 'ok' ? { correct: true } : { correct: false, true_class: classes[0].class_key };
  const r = await http(`/api/scans/${scan.id}/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
  ok(r.status === 200 && r.body.feedback?.correct === payload.correct, `status ${r.status}: ${JSON.stringify(r.body?.error ?? '')}`);
  const bad = await http(`/api/scans/${scan.id}/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"correct":false,"true_class":"not_a_real_class"}' });
  ok(bad.status === 400, `unknown class was not rejected (status ${bad.status})`);
});

await check('bad uploads are rejected cleanly (text posing as a JPEG -> 415)', async () => {
  const r = await http('/api/scans', { method: 'POST', body: form(Buffer.from('<html>not an image</html>'), 'evil.jpg') });
  ok(r.status === 415, `status ${r.status}`);
});

if (ORIGIN) {
  await check(`CORS: ${ORIGIN} is allowed, other origins are not`, async () => {
    const pre = (origin) => fetch(`${BASE}/api/scans`, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-device-id' } });
    const good = await pre(ORIGIN);
    ok(good.headers.get('access-control-allow-origin') === ORIGIN, `allow-origin is "${good.headers.get('access-control-allow-origin')}" (set CLIENT_ORIGIN on the server to exactly ${ORIGIN}, no trailing slash)`);
    ok(/x-device-id/i.test(good.headers.get('access-control-allow-headers') || ''), 'X-Device-Id header is not allowed by CORS');
    const evil = await pre('https://evil.example');
    ok(!evil.headers.get('access-control-allow-origin'), 'an unknown origin was allowed');
  });
} else {
  warn('CORS not checked: pass --origin <your client URL> when testing a deployment');
}

console.log(`\n${failed ? red(`${failed} check(s) FAILED`) : green('All checks passed')}${warnings.length ? yellow(`, ${warnings.length} warning(s)`) : ''}\n`);
process.exit(failed ? 1 : 0);
