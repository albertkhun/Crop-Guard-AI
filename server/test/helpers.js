import http from 'node:http';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { createAiClient } from '../src/services/aiClient.js';
import { createClassCatalog } from '../src/services/classCatalog.js';

export const DEVICE = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
export const DEVICE_B = 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e';
export const asDevice = (id = DEVICE) => ({ 'x-device-id': id });

export const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(64, 1)]);
export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);

const advice = {
  severity_guide: 's', immediate_actions: ['a'], organic_options: [], preventive: ['p'],
  recovery_timeline: 't', consult_expert_if: 'c', safety_note: 'confirm with your local agriculture officer',
};
export const OK_RESPONSE = {
  status: 'ok',
  prediction: { class_key: 'blast', display_name: 'Rice Blast', confidence: 0.93 },
  top3: [{ class_key: 'blast', display_name: 'Rice Blast', raw_prob: 0.93, adjusted_prob: 0.93 }],
  retake_hint: null, advice, weather: null, model_version: 'test-v1',
};
export const LOW_RESPONSE = { ...OK_RESPONSE, status: 'low_confidence', prediction: null, advice: null, retake_hint: 'Take a closer photo.' };
export const CLASSES = { classes: [{ class_key: 'blast', display_name: 'Rice Blast' }, { class_key: 'brown_spot', display_name: 'Brown Spot' }, { class_key: 'normal', display_name: 'Healthy' }], model_version: 'test-v1' };

export function testConfig(over = {}) {
  return loadConfig({
    MONGODB_URI: 'mongodb://unused', AI_SERVICE_URL: 'http://127.0.0.1:1', AI_INTERNAL_KEY: 'secret-key',
    STORAGE_DRIVER: 'local', CLIENT_ORIGIN: 'http://localhost:5173',
    RATE_LIMIT_SCANS: '1000', AI_RETRY_DELAY_MS: '10', AI_TIMEOUT_MS: '400', AI_HEALTH_TIMEOUT_MS: '400', ...over,
  });
}

export function memoryStorage({ failSave = false } = {}) {
  const saved = new Map();
  const removed = [];
  return {
    name: 'memory', saved, removed,
    async save(buf) {
      if (failSave) throw new Error('cloud storage down');
      const id = `img${saved.size + removed.length + 1}`;
      saved.set(id, buf);
      return { provider: 'memory', url: `https://img.test/${id}`, publicId: id };
    },
    async remove(ref) { removed.push(ref.publicId); saved.delete(ref.publicId); },
  };
}

export async function listen(server, host = '127.0.0.1') {
  await new Promise((r) => server.listen(0, host, r));
  return `http://${host}:${server.address().port}`;
}

/** A programmable fake AI service. `behavior(req, body) -> {status, json?, hang?}` */
export async function stubAi(behavior) {
  const calls = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const call = { method: req.method, url: req.url, headers: req.headers, body: body.toString('latin1') };
      calls.push(call);
      const out = behavior(call, calls.length);
      if (out.hang) return; // never answer -> client timeout
      res.writeHead(out.status ?? 200, { 'content-type': 'application/json' });
      res.end(out.raw ?? JSON.stringify(out.json ?? {}));
    });
  });
  const url = await listen(server);
  return { url, calls, close: () => { server.closeAllConnections?.(); return new Promise((r) => server.close(r)); } };
}

export async function startApp({ aiUrl, storage = memoryStorage(), config } = {}) {
  const cfg = config ?? testConfig({ AI_SERVICE_URL: aiUrl });
  const ai = createAiClient(cfg.ai);
  const catalog = createClassCatalog(ai);
  const server = http.createServer(createApp({ config: cfg, storage, ai, catalog }));
  const url = await listen(server);
  return { url, storage, config: cfg, close: () => { server.closeAllConnections?.(); return new Promise((r) => server.close(r)); } };
}

export async function postScan(base, { file = JPEG, filename = 'leaf.jpg', type = 'image/jpeg', fields = {}, field = 'image', headers = {} } = {}) {
  const fd = new FormData();
  if (file) fd.append(field, new File([file], filename, { type }));
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  const res = await fetch(`${base}/api/scans`, { method: 'POST', body: fd, headers: { ...asDevice(), ...headers } });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
}

export async function jget(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...asDevice(), ...init.headers } });
  return { status: res.status, headers: res.headers, body: await res.json().catch(() => null) };
}
export const jpost = (url, body, headers = {}) => jget(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
