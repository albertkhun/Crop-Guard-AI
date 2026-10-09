import { HttpError } from '../utils/httpError.js';

const RETRIABLE_STATUS = new Set([502, 503, 504]); // what proxies return while a sleeping Space is booting
const VALID_STATUS = new Set(['ok', 'low_confidence', 'unclear_image']);

/** Marks failures worth ONE retry: network error, timeout, or a gateway-style 5xx. */
class Transient extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

const unavailable = () =>
  new HttpError(503, 'ai_service_unavailable',
    'The AI service is waking up or temporarily unreachable. Please wait about a minute and try again.', { retryAfter: 30 });

/** Shape check so a broken/mismatched AI service can never write garbage into MongoDB. */
export function assertPredictContract(j) {
  const bad = () => new HttpError(502, 'ai_bad_response', 'The AI service returned an unexpected response.');
  if (!j || typeof j !== 'object' || !VALID_STATUS.has(j.status) || typeof j.model_version !== 'string' || !Array.isArray(j.top3)) throw bad();
  if (j.status === 'ok' && (!j.prediction || typeof j.prediction.class_key !== 'string' || !j.advice)) throw bad();
  if (j.status !== 'ok' && j.prediction) throw bad();
  return j;
}

export function createAiClient(cfg, fetchImpl = globalThis.fetch) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function attempt(method, path, { buildBody, timeoutMs = cfg.timeoutMs } = {}) {
    let res;
    let text;
    try {
      res = await fetchImpl(cfg.url + path, {
        method,
        headers: { 'X-Internal-Key': cfg.key },
        body: buildBody ? buildBody() : undefined, // rebuilt per attempt so retries get a fresh body
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (RETRIABLE_STATUS.has(res.status)) {
        await res.body?.cancel?.().catch(() => {});
        throw new Transient(`http_${res.status}`);
      }
      text = await res.text();
    } catch (e) {
      if (e instanceof Transient) throw e;
      throw new Transient(e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : 'network');
    }

    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }

    if (res.ok) {
      if (json === null) throw new HttpError(502, 'ai_bad_response', 'The AI service returned an unreadable response.');
      return json;
    }
    if (res.status === 401 || res.status === 403) {
      console.error('[ai] AI service rejected our X-Internal-Key. Check AI_INTERNAL_KEY on both services.');
      throw new HttpError(500, 'ai_auth_failed', 'The server could not authenticate with the AI service.');
    }
    if (res.status >= 400 && res.status < 500) {
      // Validation problems (bad image, bad coordinates...) are the caller's: relay them unchanged, never retry.
      const d = json?.detail;
      throw new HttpError(res.status, d?.code || 'ai_rejected', d?.message || 'The AI service rejected the request.');
    }
    console.error('[ai] unexpected status', res.status, text?.slice(0, 200));
    throw new HttpError(502, 'ai_error', 'The AI service hit an error while processing the image.');
  }

  async function withRetry(fn) {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof Transient)) throw e;
      console.warn(`[ai] attempt 1 failed (${e.reason}); retrying once in ${cfg.retryDelayMs}ms`);
      await sleep(cfg.retryDelayMs);
      try {
        return await fn();
      } catch (e2) {
        if (e2 instanceof Transient) {
          console.error(`[ai] attempt 2 failed (${e2.reason})`);
          throw unavailable();
        }
        throw e2;
      }
    }
  }

  return {
    async predict({ buffer, mimetype, filename, lat, lon, cropAgeDays, mockScenario }) {
      const buildBody = () => {
        const fd = new FormData();
        fd.append('image', new Blob([buffer], { type: mimetype }), filename || 'leaf.jpg');
        if (lat !== undefined && lon !== undefined) { fd.append('lat', String(lat)); fd.append('lon', String(lon)); }
        if (cropAgeDays !== undefined) fd.append('crop_age_days', String(cropAgeDays));
        if (mockScenario) fd.append('mock_scenario', mockScenario);
        return fd;
      };
      const json = await withRetry(() => attempt('POST', '/predict', { buildBody }));
      return assertPredictContract(json);
    },

    async classes() {
      return withRetry(() => attempt('GET', '/classes', { timeoutMs: cfg.healthTimeoutMs }));
    },

    /** Single quick attempt. Also serves as the "wake up" ping for a sleeping Space. */
    async health() {
      try {
        const res = await fetchImpl(`${cfg.url}/health`, { signal: AbortSignal.timeout(cfg.healthTimeoutMs) });
        if (!res.ok) return { status: 'unreachable' };
        const j = await res.json();
        return { status: 'up', model_version: j.model_version, mock_ai: j.mock_ai };
      } catch {
        return { status: 'unreachable' };
      }
    },
  };
}
