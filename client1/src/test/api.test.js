import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api } from '../api/client.js';

const respond = (status, body) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('only ever talks to the Express base URL (never FastAPI directly)', async () => {
    const f = respond(200, { items: [], nextBefore: null });
    vi.stubGlobal('fetch', f);
    await api.listScans();
    await api.classes().catch(() => {});
    for (const [url] of f.mock.calls) expect(url.startsWith(api.baseUrl + '/api/')).toBe(true);
    expect(api.baseUrl).not.toMatch(/:8000|:7860/);
  });

  it('maps server error JSON to ApiError with code, message, status', async () => {
    vi.stubGlobal('fetch', respond(503, { error: { code: 'ai_service_unavailable', message: 'The AI service is waking up.' } }));
    const e = await api.createScan(new FormData()).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect([e.code, e.message, e.status, e.retryable]).toEqual(['ai_service_unavailable', 'The AI service is waking up.', 503, true]);
  });

  it('validation errors are not retryable', async () => {
    vi.stubGlobal('fetch', respond(415, { error: { code: 'unsupported_file', message: 'Only JPEG and PNG.' } }));
    const e = await api.createScan(new FormData()).catch((x) => x);
    expect(e.retryable).toBe(false);
  });

  it('network failure and timeout become friendly, retryable errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    let e = await api.getScan('abc').catch((x) => x);
    expect([e.code, e.retryable]).toEqual(['network_error', true]);
    expect(e.message).toMatch(/internet connection/i);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('t', 'TimeoutError')));
    e = await api.getScan('abc').catch((x) => x);
    expect(e.code).toBe('timeout');
  });

  it('non-JSON error bodies still produce a usable message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>Bad gateway</html>', { status: 502 })));
    const e = await api.getScan('abc').catch((x) => x);
    expect(e.message).toMatch(/Request failed \(502\)/);
  });

  it('aiHealth: "up" / "waking" and never throws', async () => {
    vi.stubGlobal('fetch', respond(200, { status: 'up' }));
    expect(await api.aiHealth()).toBe('up');
    vi.stubGlobal('fetch', respond(200, { status: 'unreachable' }));
    expect(await api.aiHealth()).toBe('waking');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('down')));
    expect(await api.aiHealth()).toBe('waking');
  });

  it('feedback sends snake_case true_class only when provided', async () => {
    const f = respond(200, {});
    vi.stubGlobal('fetch', f);
    await api.sendFeedback('abc', { correct: false, trueClass: 'hispa' });
    await api.sendFeedback('abc', { correct: true });
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ correct: false, true_class: 'hispa' });
    expect(JSON.parse(f.mock.calls[1][1].body)).toEqual({ correct: true });
  });

  it('pagination cursor is passed through', async () => {
    const f = respond(200, { items: [], nextBefore: null });
    vi.stubGlobal('fetch', f);
    await api.listScans({ before: 'abc123', limit: 5 });
    expect(f.mock.calls[0][0]).toMatch(/limit=5&before=abc123$/);
  });
});
