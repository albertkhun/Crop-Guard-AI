import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

/**
 * Pings the AI service (via Express) on load and every few seconds until it answers.
 * 'checking' -> 'up' | 'waking'. Pinging also wakes a sleeping Hugging Face Space.
 */
export function useWakeUp({ intervalMs = 6000, maxChecks = 25, check = api.aiHealth } = {}) {
  const [state, setState] = useState('checking');
  useEffect(() => {
    let cancelled = false;
    let timer;
    let n = 0;
    const run = async () => {
      const s = await check();
      if (cancelled) return;
      setState(s);
      n += 1;
      if (s !== 'up' && n < maxChecks) timer = setTimeout(run, intervalMs);
    };
    run();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [check, intervalMs, maxChecks]);
  return state;
}
