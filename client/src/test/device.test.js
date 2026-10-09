import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from '../api/client.js';
import { getDeviceId } from '../utils/device.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

describe('device id', () => {
  it('is a valid v4 UUID, created once and then stable', () => {
    const a = getDeviceId();
    expect(a).toMatch(UUID);
    expect(getDeviceId()).toBe(a);
    expect(localStorage.getItem('pg.deviceId')).toBe(a);
  });
  it('survives a broken localStorage (private mode) with a stable in-memory id', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    const a = getDeviceId(broken);
    expect(a).toMatch(UUID);
    expect(getDeviceId(broken)).toBe(a);
  });
  it('is sent as X-Device-Id on every API request, including JSON ones', async () => {
    const f = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', f);
    await api.listScans();
    await api.sendFeedback('abc', { correct: true });
    await api.createScan(new FormData());
    for (const [, init] of f.mock.calls) expect(init.headers['X-Device-Id']).toBe(getDeviceId());
    expect(f.mock.calls[1][1].headers['Content-Type']).toBe('application/json');
    expect(f.mock.calls[2][1].headers['Content-Type']).toBeUndefined(); // let the browser set the multipart boundary
  });
});
