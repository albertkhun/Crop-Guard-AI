import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { createAiClient } from '../src/services/aiClient.js';
import { HttpError } from '../src/utils/httpError.js';
import { JPEG, OK_RESPONSE, stubAi, testConfig } from './helpers.js';

const cfgFor = (url) => testConfig({ AI_SERVICE_URL: url }).ai;
const args = { buffer: JPEG, mimetype: 'image/jpeg', filename: 'leaf.jpg' };
const servers = [];
const make = async (behavior) => { const s = await stubAi(behavior); servers.push(s); return s; };
after(() => Promise.all(servers.map((s) => s.close())));

describe('aiClient.predict', () => {
  it('sends the shared secret and multipart fields, returns the contract', async () => {
    const s = await make(() => ({ json: OK_RESPONSE }));
    const out = await createAiClient(cfgFor(s.url)).predict({ ...args, lat: 25.57, lon: 91.88, cropAgeDays: 40 });
    assert.equal(out.status, 'ok');
    const c = s.calls[0];
    assert.equal(c.url, '/predict');
    assert.equal(c.headers['x-internal-key'], 'secret-key');
    for (const f of ['name="image"', 'name="lat"', 'name="lon"', 'name="crop_age_days"']) assert.ok(c.body.includes(f), f);
  });

  it('omits lat/lon when not given', async () => {
    const s = await make(() => ({ json: OK_RESPONSE }));
    await createAiClient(cfgFor(s.url)).predict(args);
    assert.ok(!s.calls[0].body.includes('name="lat"'));
  });

  it('retries ONCE on 503 (cold start) and then succeeds', async () => {
    const s = await make((_c, n) => (n === 1 ? { status: 503, json: {} } : { json: OK_RESPONSE }));
    const out = await createAiClient(cfgFor(s.url)).predict(args);
    assert.equal(out.status, 'ok');
    assert.equal(s.calls.length, 2);
    assert.ok(s.calls[1].body.includes('name="image"'), 'retry re-sends a fresh body');
  });

  it('gives a clear 503 after the single retry also fails', async () => {
    const s = await make(() => ({ status: 503, json: {} }));
    await assert.rejects(createAiClient(cfgFor(s.url)).predict(args), (e) => {
      assert.ok(e instanceof HttpError);
      assert.equal(e.status, 503); assert.equal(e.code, 'ai_service_unavailable'); assert.equal(e.extra.retryAfter, 30);
      assert.match(e.message, /waking up/);
      return true;
    });
    assert.equal(s.calls.length, 2);
  });

  it('treats a hung AI service as unavailable (timeout) after one retry', async () => {
    const s = await make(() => ({ hang: true }));
    await assert.rejects(createAiClient(cfgFor(s.url)).predict(args), (e) => e.code === 'ai_service_unavailable');
    assert.equal(s.calls.length, 2);
  });

  it('treats connection refused as unavailable', async () => {
    await assert.rejects(createAiClient(cfgFor('http://127.0.0.1:1')).predict(args), (e) => e.code === 'ai_service_unavailable');
  });

  it('relays 4xx validation errors unchanged and does NOT retry', async () => {
    const s = await make(() => ({ status: 422, json: { detail: { code: 'image_too_small', message: 'Image is too small.' } } }));
    await assert.rejects(createAiClient(cfgFor(s.url)).predict(args), (e) => e.status === 422 && e.code === 'image_too_small');
    assert.equal(s.calls.length, 1);
  });

  it('maps an AI 401 to a server-side misconfiguration, without leaking details', async () => {
    const s = await make(() => ({ status: 401, json: { detail: { code: 'unauthorized', message: 'Missing or invalid X-Internal-Key.' } } }));
    await assert.rejects(createAiClient(cfgFor(s.url)).predict(args), (e) => e.status === 500 && e.code === 'ai_auth_failed' && !/X-Internal-Key/.test(e.message));
    assert.equal(s.calls.length, 1);
  });

  it('rejects responses that violate the contract', async () => {
    for (const bad of [{ ...OK_RESPONSE, advice: null }, { ...OK_RESPONSE, status: 'weird' }, { ...OK_RESPONSE, status: 'low_confidence' }, { nope: 1 }]) {
      const s = await make(() => ({ json: bad }));
      await assert.rejects(createAiClient(cfgFor(s.url)).predict(args), (e) => e.status === 502 && e.code === 'ai_bad_response');
    }
  });
});

describe('aiClient.health', () => {
  it('reports up / unreachable without throwing', async () => {
    const s = await make(() => ({ json: { status: 'ok', model_version: 'v1', mock_ai: false } }));
    assert.deepEqual(await createAiClient(cfgFor(s.url)).health(), { status: 'up', model_version: 'v1', mock_ai: false });
    assert.deepEqual(await createAiClient(cfgFor('http://127.0.0.1:1')).health(), { status: 'unreachable' });
  });
});
