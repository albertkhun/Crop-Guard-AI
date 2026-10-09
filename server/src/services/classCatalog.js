/** Class list comes from the AI service (never hard-coded here). Cached; stale copy served if AI is asleep. */
export function createClassCatalog(ai, ttlMs = 10 * 60_000) {
  let cache = null;
  let at = 0;
  let inflight = null;

  async function refresh() {
    const j = await ai.classes();
    cache = j.classes;
    at = Date.now();
    return cache;
  }

  return {
    /** -> [{class_key, display_name}] or null if never loaded and AI unreachable. */
    async get() {
      if (cache && Date.now() - at < ttlMs) return cache;
      inflight ??= refresh().catch(() => cache).finally(() => { inflight = null; });
      return inflight;
    },
  };
}
