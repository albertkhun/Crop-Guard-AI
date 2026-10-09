// The ONLY place the client talks to the network, and only to the Express server (never to FastAPI).
import { getDeviceId } from '../utils/device.js';

const BASE = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(code, message, status = 0) {
    super(message);
    this.code = code;
    this.status = status;
  }
  /** Worth offering a "Try again" button (server/AI asleep or unreachable, or rate limited). */
  get retryable() {
    return ['ai_service_unavailable', 'network_error', 'timeout', 'rate_limited'].includes(this.code) || this.status >= 500;
  }
}

async function request(path, { method = 'GET', body, json, timeoutMs = 20_000, signal } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs);
  signal?.addEventListener('abort', () => ctrl.abort(signal.reason), { once: true });
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      body: json ? JSON.stringify(json) : body,
      headers: { 'X-Device-Id': getDeviceId(), ...(json ? { 'Content-Type': 'application/json' } : {}) },
      signal: ctrl.signal,
    });
  } catch (e) {
    if (signal?.aborted) throw e; // caller cancelled on purpose
    if (e?.name === 'TimeoutError' || e?.name === 'AbortError') {
      throw new ApiError('timeout', 'This is taking longer than expected. The server may still be waking up. Please try again.');
    }
    throw new ApiError('network_error', "Can't reach the server. Check your internet connection and try again.");
  } finally {
    clearTimeout(timer);
  }
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(err?.code || 'http_error', err?.message || `Request failed (${res.status}).`, res.status);
  }
  return data;
}

export const api = {
  baseUrl: BASE,
  /** Pings the AI service through Express. Also wakes a sleeping AI Space. Never throws. */
  async aiHealth() {
    try {
      const j = await request('/api/health/ai', { timeoutMs: 15_000 });
      return j.status === 'up' ? 'up' : 'waking';
    } catch {
      return 'waking'; // Express itself (free tier) may be asleep too
    }
  },
  classes: () => request('/api/classes').then((j) => j.classes),
  createScan(form, { signal } = {}) {
    // 2 AI attempts x 45 s + upload, so allow up to ~2 minutes before giving up.
    return request('/api/scans', { method: 'POST', body: form, timeoutMs: 130_000, signal });
  },
  listScans: ({ before, limit = 20 } = {}) =>
    request(`/api/scans?limit=${limit}${before ? `&before=${before}` : ''}`),
  getScan: (id) => request(`/api/scans/${encodeURIComponent(id)}`),
  sendFeedback: (id, { correct, trueClass }) =>
    request(`/api/scans/${encodeURIComponent(id)}/feedback`, {
      method: 'POST',
      json: { correct, ...(trueClass ? { true_class: trueClass } : {}) },
    }),
};
