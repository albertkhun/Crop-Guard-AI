// Turns a scan DTO from the Express API into display state. Every value here is read from the
// backend response; nothing is invented. (The backend has no severity score, so none is shown.)
import { HEALTHY_KEY } from './classes.js';

/** @returns {{kind:'healthy'|'disease'|'low'|'unclear', tone:'good'|'bad'|'warn', title:string, chip:string, confidence:number|null}} */
export function summarize(scan) {
  const ai = scan.aiResponse;
  if (ai.status === 'ok') {
    const healthy = ai.prediction.class_key === HEALTHY_KEY;
    return {
      kind: healthy ? 'healthy' : 'disease',
      tone: healthy ? 'good' : 'bad',
      title: ai.prediction.display_name,
      chip: healthy ? 'Healthy' : 'Disease detected',
      confidence: ai.prediction.confidence,
    };
  }
  if (ai.status === 'low_confidence') {
    // No diagnosis exists here; the raw top-1 probability is shown only as "below threshold".
    return { kind: 'low', tone: 'warn', title: 'More information needed', chip: 'Retake photo', confidence: ai.top3?.[0]?.raw_prob ?? null };
  }
  return { kind: 'unclear', tone: 'warn', title: 'Photo unclear', chip: 'Retake photo', confidence: null };
}

/** Counts for the stat cards, from whatever scans have been loaded. */
export function tally(items) {
  const t = { total: items.length, healthy: 0, disease: 0, retake: 0 };
  for (const s of items) {
    const k = summarize(s).kind;
    if (k === 'healthy') t.healthy += 1;
    else if (k === 'disease') t.disease += 1;
    else t.retake += 1;
  }
  return t;
}

export const FILTERS = [
  ['all', 'All', () => true],
  ['healthy', 'Healthy', (k) => k === 'healthy'],
  ['disease', 'Disease detected', (k) => k === 'disease'],
  ['retake', 'Needs a new photo', (k) => k === 'low' || k === 'unclear'],
];
