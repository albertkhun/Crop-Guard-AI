// Runs Express -> REAL FastAPI (real model unless it runs with MOCK_AI). Start FastAPI first, then:
//   RUN_INTEGRATION=1 AI_SERVICE_URL=http://localhost:8000 AI_INTERNAL_KEY=dev-secret TEST_MONGODB_URI=... npm run test:integration
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { after, before, describe, it } from 'node:test';
import mongoose from 'mongoose';
import { jget, jpost, memoryStorage, postScan, startApp, testConfig } from './helpers.js';

const skip = process.env.RUN_INTEGRATION && process.env.TEST_MONGODB_URI ? false : 'set RUN_INTEGRATION=1, AI_SERVICE_URL, AI_INTERNAL_KEY, TEST_MONGODB_URI';

describe('Express <-> real FastAPI', { skip }, () => {
  let app;
  let leaf;
  before(async () => {
    await mongoose.connect(process.env.TEST_MONGODB_URI, { dbName: `paddyguard_it_${Date.now()}` });
    leaf = await fs.readFile(new URL('./fixtures/leaf.jpg', import.meta.url));
    app = await startApp({ storage: memoryStorage(), config: testConfig({
      AI_SERVICE_URL: process.env.AI_SERVICE_URL, AI_INTERNAL_KEY: process.env.AI_INTERNAL_KEY, AI_TIMEOUT_MS: '30000' }) });
  });
  after(async () => { await app?.close(); await mongoose.connection.dropDatabase().catch(() => {}); await mongoose.disconnect(); });

  it('AI health + class list come from the real service', async () => {
    assert.equal((await jget(`${app.url}/api/health/ai`)).body.status, 'up');
    const c = (await jget(`${app.url}/api/classes`)).body.classes;
    assert.equal(c.length, 10); assert.equal(c.at(-1).class_key, 'tungro');
  });

  it('a real image goes through the real model and is stored with the exact contract', async () => {
    const r = await postScan(app.url, { file: leaf, fields: { lat: 25.57, lon: 91.88, crop_age_days: 40 } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const a = r.body.aiResponse;
    assert.ok(['ok', 'low_confidence', 'unclear_image'].includes(a.status));
    assert.ok(typeof a.model_version === 'string' && Array.isArray(a.top3));
    if (a.status === 'ok') { assert.ok(a.prediction.confidence >= 0.85); assert.ok(a.advice.safety_note); }
    else assert.equal(a.prediction, null);
    const again = await jget(`${app.url}/api/scans/${r.body.id}`);
    assert.deepEqual(again.body.aiResponse, a);
  });

  it('real AI-side validation errors are relayed (too-small image)', async () => {
    const tiny = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64');
    const r = await postScan(app.url, { file: tiny });
    assert.ok([415, 422, 400].includes(r.status), `got ${r.status}`);
    assert.ok(r.body.error.code);
  });

  it('feedback validates true_class against the real class list', async () => {
    const { body } = await postScan(app.url, { file: leaf });
    assert.equal((await jpost(`${app.url}/api/scans/${body.id}/feedback`, { correct: false, true_class: 'hispa' })).status, 200);
    assert.equal((await jpost(`${app.url}/api/scans/${body.id}/feedback`, { correct: false, true_class: 'rust' })).body.error.code, 'unknown_class');
  });
});
