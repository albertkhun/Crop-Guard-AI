import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { loadConfig } from '../src/config.js';
import { createCloudinaryStorage } from '../src/storage/cloudinary.js';
import { createLocalStorage } from '../src/storage/localDisk.js';
import { createStorage } from '../src/storage/index.js';

const base = { MONGODB_URI: 'mongodb://x', AI_SERVICE_URL: 'http://ai:8000/', AI_INTERNAL_KEY: 'k' };

describe('config', () => {
  it('defaults to cloudinary and names every missing credential', () => {
    assert.throws(() => loadConfig({ ...base }), (e) => /CLOUDINARY_CLOUD_NAME/.test(e.message) && /CLOUDINARY_API_KEY/.test(e.message) && /CLOUDINARY_API_SECRET/.test(e.message));
  });
  it('accepts three separate vars', () => {
    const c = loadConfig({ ...base, CLOUDINARY_CLOUD_NAME: 'demo', CLOUDINARY_API_KEY: '123', CLOUDINARY_API_SECRET: 'sec' });
    assert.deepEqual([c.storage.driver, c.storage.cloudinary.cloudName, c.storage.cloudinary.apiKey], ['cloudinary', 'demo', '123']);
    assert.equal(c.ai.url, 'http://ai:8000'); // trailing slash trimmed
  });
  it('accepts CLOUDINARY_URL', () => {
    const c = loadConfig({ ...base, CLOUDINARY_URL: 'cloudinary://111:abc%2Fdef@mycloud' });
    assert.deepEqual([c.storage.cloudinary.cloudName, c.storage.cloudinary.apiKey, c.storage.cloudinary.apiSecret], ['mycloud', '111', 'abc/def']);
  });
  it('rejects a malformed CLOUDINARY_URL and unknown drivers', () => {
    assert.throws(() => loadConfig({ ...base, CLOUDINARY_URL: 'http://nope' }), /CLOUDINARY_URL is malformed/);
    assert.throws(() => loadConfig({ ...base, STORAGE_DRIVER: 's3' }), /STORAGE_DRIVER/);
  });
  it('requires secrets, and CLIENT_ORIGIN in production', () => {
    assert.throws(() => loadConfig({ STORAGE_DRIVER: 'local' }), /MONGODB_URI is required[\s\S]*AI_INTERNAL_KEY is required/);
    assert.throws(() => loadConfig({ ...base, STORAGE_DRIVER: 'local', NODE_ENV: 'production' }), /CLIENT_ORIGIN/);
  });
  it('supports a comma-separated origin list', () => {
    const c = loadConfig({ ...base, STORAGE_DRIVER: 'local', CLIENT_ORIGIN: 'https://a.app/, https://b.app' });
    assert.deepEqual(c.clientOrigins, ['https://a.app', 'https://b.app']);
  });
  it('local driver needs no Cloudinary vars', () => {
    assert.equal(loadConfig({ ...base, STORAGE_DRIVER: 'local' }).storage.cloudinary, null);
  });
});

describe('cloudinary storage (fake SDK)', () => {
  const cfg = { cloudName: 'demo', apiKey: '1', apiSecret: 's', folder: 'paddyguard/scans', maxEdge: 1600 };
  const fakeSdk = (fail = false) => {
    const s = { configured: null, uploads: [], destroyed: [] };
    s.config = (c) => { s.configured = c; };
    s.uploader = {
      upload_stream(opts, cb) {
        return { end(buf) { s.uploads.push({ opts, buf }); fail ? cb(new Error('401 invalid signature')) : cb(null, { secure_url: `https://res.cloudinary.com/demo/image/upload/${opts.folder}/${opts.public_id}.jpg`, public_id: `${opts.folder}/${opts.public_id}` }); } };
      },
      async destroy(id, o) { s.destroyed.push([id, o]); },
    };
    return s;
  };

  it('configures the SDK from config and uploads with a random id in the configured folder', async () => {
    const sdk = fakeSdk();
    const st = createCloudinaryStorage(cfg, sdk);
    assert.deepEqual(sdk.configured, { cloud_name: 'demo', api_key: '1', api_secret: 's', secure: true });
    const a = await st.save(Buffer.from('x'), { mimetype: 'image/jpeg' });
    const b = await st.save(Buffer.from('y'), { mimetype: 'image/jpeg' });
    assert.equal(a.provider, 'cloudinary'); assert.match(a.url, /^https:\/\/res\.cloudinary\.com\//);
    assert.match(a.publicId, /^paddyguard\/scans\/[0-9a-f-]{36}$/);
    assert.notEqual(a.publicId, b.publicId);
    const o = sdk.uploads[0].opts;
    assert.equal(o.resource_type, 'image'); assert.equal(o.overwrite, false);
    assert.deepEqual(o.transformation, [{ width: 1600, height: 1600, crop: 'limit' }]);
    assert.equal(sdk.uploads[0].buf.toString(), 'x');
  });
  it('propagates upload failures and removes by publicId', async () => {
    await assert.rejects(createCloudinaryStorage(cfg, fakeSdk(true)).save(Buffer.from('x'), {}), /invalid signature/);
    const sdk = fakeSdk();
    await createCloudinaryStorage(cfg, sdk).remove({ publicId: 'paddyguard/scans/abc' });
    assert.equal(sdk.destroyed[0][0], 'paddyguard/scans/abc');
  });
  it('createStorage picks the driver from config', () => {
    const c = loadConfig({ ...base, CLOUDINARY_CLOUD_NAME: 'd', CLOUDINARY_API_KEY: '1', CLOUDINARY_API_SECRET: 's' });
    assert.equal(createStorage(c).name, 'cloudinary');
    assert.equal(createStorage(loadConfig({ ...base, STORAGE_DRIVER: 'local' })).name, 'local');
  });
});

describe('local storage', () => {
  it('saves, returns a URL, removes, and refuses path traversal', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pg-'));
    const st = createLocalStorage({ dir, publicBaseUrl: 'http://localhost:4000' });
    const ref = await st.save(Buffer.from('abc'), { mimetype: 'image/png' });
    assert.match(ref.url, /^http:\/\/localhost:4000\/uploads\/[0-9a-f-]{36}\.png$/);
    assert.equal((await fs.readFile(path.join(dir, ref.publicId))).toString(), 'abc');
    const outside = path.join(path.dirname(dir), 'victim.txt');
    await fs.writeFile(outside, 'keep');
    await st.remove({ publicId: `../${path.basename(outside)}` });
    assert.equal((await fs.readFile(outside)).toString(), 'keep');
    await st.remove(ref);
    await assert.rejects(fs.access(path.join(dir, ref.publicId)));
  });
});
