import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import mongoose from 'mongoose';
import { Scan } from '../src/models/Scan.js';
import { CLASSES, DEVICE, DEVICE_B, JPEG, LOW_RESPONSE, OK_RESPONSE, PNG, asDevice, jget, jpost, memoryStorage, postScan, startApp, stubAi, testConfig } from './helpers.js';

const URI = process.env.TEST_MONGODB_URI;
const skip = URI ? false : 'TEST_MONGODB_URI not set (point it at any MongoDB-compatible server)';

describe('Express API (real Mongoose, stubbed AI + storage)', { skip }, () => {
  let ai, app, storage, aiMode;
  const respond = (call) => {
    if (call.url === '/classes') return { json: CLASSES };
    if (aiMode === 'down') return { status: 503, json: {} };
    if (aiMode === 'low') return { json: LOW_RESPONSE };
    if (aiMode === 'bad_image') return { status: 415, json: { detail: { code: 'unsupported_file', message: 'Only JPEG and PNG images are accepted.' } } };
    return { json: OK_RESPONSE };
  };

  before(async () => {
    await mongoose.connect(URI, { dbName: `paddyguard_test_${Date.now()}`, serverSelectionTimeoutMS: 5000 });
    ai = await stubAi(respond);
    storage = memoryStorage();
    app = await startApp({ aiUrl: ai.url, storage });
  });
  after(async () => {
    await app?.close(); await ai?.close();
    await mongoose.connection.dropDatabase().catch(() => {});
    await mongoose.disconnect();
  });
  const reset = () => { aiMode = 'ok'; ai.calls.length = 0; storage.saved.clear(); storage.removed.length = 0; };

  describe('POST /api/scans', () => {
    it('stores image, calls AI, persists the full contract, returns 201', async () => {
      reset();
      const r = await postScan(app.url, { fields: { lat: 25.57, lon: 91.88, district: 'East Khasi Hills', crop_age_days: 45 } });
      assert.equal(r.status, 201);
      assert.deepEqual(r.body.aiResponse, OK_RESPONSE);
      assert.deepEqual(r.body.imageRef, { provider: 'memory', url: 'https://img.test/img1', publicId: 'img1' });
      assert.deepEqual(r.body.location, { lat: 25.57, lon: 91.88, district: 'East Khasi Hills' });
      assert.equal(r.body.cropAgeDays, 45); assert.equal(r.body.feedback, null); assert.deepEqual(r.body.warnings, []);
      assert.ok(r.body.id && r.body.createdAt && !('owner' in r.body) && !('_id' in r.body));
      const row = await Scan.findById(r.body.id).lean();
      assert.deepEqual(row.aiResponse, OK_RESPONSE); // verbatim in MongoDB
      // forwarded fields reached the AI service with the secret
      const c = ai.calls.find((x) => x.url === '/predict');
      assert.equal(c.headers['x-internal-key'], 'secret-key');
      assert.ok(c.body.includes('name="lat"') && c.body.includes('name="crop_age_days"'));
    });

    it('accepts PNG, and a scan with no location', async () => {
      reset();
      const r = await postScan(app.url, { file: PNG, filename: 'a.png', type: 'image/png' });
      assert.equal(r.status, 201); assert.equal(r.body.location, null);
    });

    it('stores low_confidence results (no prediction/advice) as-is', async () => {
      reset(); aiMode = 'low';
      const r = await postScan(app.url);
      assert.equal(r.status, 201); assert.equal(r.body.aiResponse.status, 'low_confidence'); assert.equal(r.body.aiResponse.prediction, null);
    });

    it('does not trust the declared mimetype: text posing as .jpg is rejected before any upload or AI call', async () => {
      reset();
      const r = await postScan(app.url, { file: Buffer.from('<html>not an image</html>'), filename: 'evil.jpg', type: 'image/jpeg' });
      assert.equal(r.status, 415); assert.equal(r.body.error.code, 'unsupported_file');
      assert.equal(ai.calls.length, 0); assert.equal(storage.saved.size, 0);
    });

    for (const [name, opts, status, code] of [
      ['missing image', { file: null }, 400, 'image_required'],
      ['wrong field name', { field: 'photo' }, 400, 'bad_field'],
      ['GIF declared', { type: 'image/gif', filename: 'a.gif' }, 415, 'unsupported_file'],
      ['lat without lon', { fields: { lat: 25 } }, 400, 'bad_location'],
      ['lat out of range', { fields: { lat: 125, lon: 91 } }, 400, 'bad_location'],
      ['non-numeric lat', { fields: { lat: 'abc', lon: 91 } }, 400, 'bad_field'],
      ['crop age out of range', { fields: { crop_age_days: 9999 } }, 400, 'bad_field'],
      ['crop age not integer', { fields: { crop_age_days: 1.5 } }, 400, 'bad_field'],
    ]) {
      it(`rejects ${name} with ${status} ${code}`, async () => {
        reset();
        const r = await postScan(app.url, opts);
        assert.equal(r.status, status); assert.equal(r.body.error.code, code);
        assert.equal(ai.calls.length, 0);
      });
    }

    it('rejects oversize uploads with 413', async () => {
      reset();
      const big = Buffer.concat([JPEG, Buffer.alloc(10 * 1024 * 1024)]);
      const r = await postScan(app.url, { file: big });
      assert.equal(r.status, 413); assert.equal(r.body.error.code, 'file_too_large');
    });

    it('blank lat/lon strings (form defaults) are treated as absent', async () => {
      reset();
      const r = await postScan(app.url, { fields: { lat: '', lon: '', district: '  Ri-Bhoi ' } });
      assert.equal(r.status, 201); assert.deepEqual(r.body.location, { district: 'Ri-Bhoi' });
    });

    it('relays AI validation errors with the AI status/code and cleans up the uploaded image', async () => {
      reset(); aiMode = 'bad_image';
      const r = await postScan(app.url);
      assert.equal(r.status, 415); assert.equal(r.body.error.code, 'unsupported_file');
      assert.equal(storage.saved.size, 0); assert.equal(storage.removed.length, 1);
    });

    it('returns a clear 503 + Retry-After when the AI service is asleep, saving nothing', async () => {
      reset(); aiMode = 'down';
      const before = await Scan.countDocuments();
      const r = await postScan(app.url);
      assert.equal(r.status, 503); assert.equal(r.body.error.code, 'ai_service_unavailable');
      assert.match(r.body.error.message, /waking up/); assert.equal(r.headers.get('retry-after'), '30');
      assert.equal(ai.calls.filter((c) => c.url === '/predict').length, 2); // exactly one retry
      assert.equal(await Scan.countDocuments(), before);
      assert.equal(storage.saved.size, 0);
    });

    it('still returns the diagnosis if image storage fails (warning, imageRef null)', async () => {
      reset();
      const failing = await startApp({ aiUrl: ai.url, storage: memoryStorage({ failSave: true }) });
      const r = await postScan(failing.url);
      await failing.close();
      assert.equal(r.status, 201); assert.equal(r.body.imageRef, null); assert.deepEqual(r.body.warnings, ['image_not_saved']);
      assert.equal(r.body.aiResponse.status, 'ok');
    });

    it('rate limits scan uploads (429)', async () => {
      reset();
      const limited = await startApp({ aiUrl: ai.url, config: testConfig({ AI_SERVICE_URL: ai.url, RATE_LIMIT_SCANS: '2' }) });
      const codes = [];
      for (let i = 0; i < 3; i++) codes.push((await postScan(limited.url)).status);
      await limited.close();
      assert.deepEqual(codes, [201, 201, 429]);
    });
  });

  describe('GET /api/scans', () => {
    it('paginates newest-first with a cursor and no duplicates', async () => {
      await Scan.deleteMany({});
      reset();
      const ids = [];
      for (let i = 0; i < 5; i++) ids.push((await postScan(app.url)).body.id);
      const seen = [];
      let before = '';
      for (let guard = 0; guard < 5; guard++) {
        const r = await jget(`${app.url}/api/scans?limit=2${before}`);
        assert.equal(r.status, 200);
        seen.push(...r.body.items.map((x) => x.id));
        if (!r.body.nextBefore) break;
        before = `&before=${r.body.nextBefore}`;
      }
      assert.deepEqual(seen, [...ids].reverse());
    });
    it('rejects a bad cursor and clamps absurd limits', async () => {
      assert.equal((await jget(`${app.url}/api/scans?before=zzz`)).body.error.code, 'invalid_id');
      assert.equal((await jget(`${app.url}/api/scans?limit=100000`)).status, 200);
    });
  });

  describe('GET /api/scans/:id', () => {
    it('returns a scan, 400 for malformed ids, 404 for unknown ids', async () => {
      reset();
      const { body } = await postScan(app.url);
      const ok = await jget(`${app.url}/api/scans/${body.id}`);
      assert.equal(ok.status, 200); assert.deepEqual(ok.body.aiResponse, OK_RESPONSE);
      assert.equal((await jget(`${app.url}/api/scans/not-an-id`)).body.error.code, 'invalid_id');
      assert.equal((await jget(`${app.url}/api/scans/${'a'.repeat(24)}`)).status, 404);
    });
  });

  describe('POST /api/scans/:id/feedback', () => {
    let id;
    before(async () => { reset(); id = (await postScan(app.url)).body.id; });

    it('records "correct"', async () => {
      const r = await jpost(`${app.url}/api/scans/${id}/feedback`, { correct: true });
      assert.equal(r.status, 200); assert.equal(r.body.feedback.correct, true); assert.equal(r.body.feedback.trueClass, null);
    });
    it('records "incorrect" with a true class validated against the AI class list; last write wins', async () => {
      const r = await jpost(`${app.url}/api/scans/${id}/feedback`, { correct: false, true_class: 'brown_spot' });
      assert.equal(r.status, 200); assert.equal(r.body.feedback.correct, false); assert.equal(r.body.feedback.trueClass, 'brown_spot');
      assert.equal((await jget(`${app.url}/api/scans/${id}`)).body.feedback.trueClass, 'brown_spot');
    });
    it('accepts "incorrect" without a class', async () => {
      assert.equal((await jpost(`${app.url}/api/scans/${id}/feedback`, { correct: false })).status, 200);
    });
    for (const [name, body, code] of [
      ['unknown class', { correct: false, true_class: 'rust' }, 'unknown_class'],
      ['true_class with correct=true', { correct: true, true_class: 'blast' }, 'bad_field'],
      ['non-boolean correct', { correct: 'yes' }, 'bad_field'],
      ['missing correct', {}, 'bad_field'],
      ['malformed class key', { correct: false, true_class: 'Rice Blast!' }, 'bad_field'],
    ]) {
      it(`rejects ${name}`, async () => {
        const r = await jpost(`${app.url}/api/scans/${id}/feedback`, body);
        assert.equal(r.status, 400); assert.equal(r.body.error.code, code);
      });
    }
    it('404 for unknown scan, 400 for malformed JSON', async () => {
      assert.equal((await jpost(`${app.url}/api/scans/${'b'.repeat(24)}/feedback`, { correct: true })).status, 404);
      const r = await jget(`${app.url}/api/scans/${id}/feedback`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
      assert.equal(r.status, 400); assert.equal(r.body.error.code, 'invalid_json');
    });
  });

  describe('per-device isolation (privacy)', () => {
    it('rejects scan routes without a valid X-Device-Id, but health stays open', async () => {
      reset();
      for (const h of [{}, { 'x-device-id': 'not-a-uuid' }, { 'x-device-id': '123' }]) {
        const r = await fetch(`${app.url}/api/scans`, { headers: h });
        assert.equal(r.status, 400); assert.equal((await r.json()).error.code, 'device_id_required');
      }
      const post = await postScan(app.url, { headers: { 'x-device-id': 'nope' } });
      assert.equal(post.status, 400); assert.equal(ai.calls.length, 0); assert.equal(storage.saved.size, 0);
      assert.equal((await fetch(`${app.url}/api/health`)).status, 200); // no id needed
    });

    it("a device never sees, fetches, or rates another device's scans", async () => {
      reset();
      await Scan.deleteMany({});
      const mine = (await postScan(app.url)).body;
      const theirs = (await postScan(app.url, { headers: asDevice(DEVICE_B) })).body;
      const listA = await jget(`${app.url}/api/scans`);
      const listB = await jget(`${app.url}/api/scans`, { headers: asDevice(DEVICE_B) });
      assert.deepEqual(listA.body.items.map((x) => x.id), [mine.id]);
      assert.deepEqual(listB.body.items.map((x) => x.id), [theirs.id]);
      assert.equal((await jget(`${app.url}/api/scans/${theirs.id}`)).status, 404);          // read
      assert.equal((await jpost(`${app.url}/api/scans/${theirs.id}/feedback`, { correct: true })).status, 404); // write
      assert.equal((await jget(`${app.url}/api/scans/${theirs.id}`, { headers: asDevice(DEVICE_B) })).status, 200);
      const row = await Scan.findById(mine.id).lean();
      assert.equal(row.owner, `device:${DEVICE}`);
      assert.ok(!('owner' in mine)); // internal id is never returned to clients
    });

    it('device id is case-insensitive and cursor pagination stays inside the device', async () => {
      reset(); await Scan.deleteMany({});
      for (let i = 0; i < 3; i++) await postScan(app.url);
      await postScan(app.url, { headers: asDevice(DEVICE_B) });
      const up = { 'x-device-id': DEVICE.toUpperCase() };
      const p1 = await jget(`${app.url}/api/scans?limit=2`, { headers: up });
      const p2 = await jget(`${app.url}/api/scans?limit=2&before=${p1.body.nextBefore}`, { headers: up });
      assert.equal(p1.body.items.length + p2.body.items.length, 3);
      assert.equal(p2.body.nextBefore, null);
    });
  });

  describe('meta + security', () => {
    it('health endpoints and class list', async () => {
      reset();
      const h = await jget(`${app.url}/api/health`);
      assert.deepEqual(h.body, { status: 'ok', db: 'up', storage: 'memory' });
      assert.equal((await jget(`${app.url}/api/health/ai`)).status, 200);
      assert.deepEqual((await jget(`${app.url}/api/classes`)).body.classes, CLASSES.classes);
    });
    it('CORS: allows only the configured client origin', async () => {
      const pre = await fetch(`${app.url}/api/scans`, { method: 'OPTIONS', headers: { Origin: 'http://localhost:5173', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'x-device-id' } });
      assert.match(pre.headers.get('access-control-allow-headers'), /X-Device-Id/i);
      const good = await jget(`${app.url}/api/health`, { headers: { Origin: 'http://localhost:5173' } });
      const evil = await jget(`${app.url}/api/health`, { headers: { Origin: 'https://evil.example' } });
      assert.equal(good.headers.get('access-control-allow-origin'), 'http://localhost:5173');
      assert.equal(evil.headers.get('access-control-allow-origin'), null);
    });
    it('unknown routes return JSON 404; internal key never appears in any response', async () => {
      const r = await jget(`${app.url}/api/nope`);
      assert.equal(r.status, 404); assert.equal(r.body.error.code, 'not_found');
      reset(); aiMode = 'down';
      const leak = JSON.stringify((await postScan(app.url)).body);
      assert.ok(!leak.includes('secret-key'));
    });
  });
});
