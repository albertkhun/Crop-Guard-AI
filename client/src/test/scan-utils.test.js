import { describe, expect, it } from 'vitest';
import { formatDay } from '../utils/format.js';
import { summarize, tally } from '../utils/scan.js';
import { tidy, tidyList } from '../utils/text.js';
import low from './fixtures/scan_low.json';
import ok from './fixtures/scan_ok.json';
import unclear from './fixtures/scan_unclear.json';

describe('summarize (backend response -> display state)', () => {
  it('disease', () => expect(summarize(ok)).toMatchObject({ kind: 'disease', tone: 'bad', title: 'Rice Blast', chip: 'Disease detected', confidence: 0.93 }));
  it('healthy is decided by the model class key', () => {
    const h = structuredClone(ok);
    h.aiResponse.prediction = { class_key: 'normal', display_name: 'Healthy', confidence: 0.97 };
    expect(summarize(h)).toMatchObject({ kind: 'healthy', tone: 'good', chip: 'Healthy' });
  });
  it('low confidence keeps the RAW top-1 probability but is never a diagnosis', () => {
    expect(summarize(low)).toMatchObject({ kind: 'low', tone: 'warn', title: 'More information needed', confidence: 0.52 });
  });
  it('unclear image has no confidence', () => expect(summarize(unclear)).toMatchObject({ kind: 'unclear', confidence: null }));
  it('tally counts each kind once', () => expect(tally([ok, low, unclear])).toEqual({ total: 3, healthy: 0, disease: 1, retake: 2 }));
});

describe('tidy (hide developer placeholders only)', () => {
  it('strips bracketed TODO_VERIFY fragments but keeps real sentences', () => {
    expect(tidy('Use certified seed. [TODO_VERIFY: add ICAR guidance.]')).toBe('Use certified seed.');
    expect(tidy('Clean tools. [TODO_VERIFY]')).toBe('Clean tools.');
  });
  it('drops items that were only a placeholder', () => {
    expect(tidyList(['Real step.', '[TODO_VERIFY: organic options.]', undefined])).toEqual(['Real step.']);
  });
});

describe('formatDay', () => {
  const now = new Date(2026, 9, 10, 15, 0);
  it('says Today / Yesterday, otherwise a date', () => {
    expect(formatDay(new Date(2026, 9, 10, 8, 0).toISOString(), now)).toBe('Today');
    expect(formatDay(new Date(2026, 9, 9, 23, 0).toISOString(), now)).toBe('Yesterday');
    expect(formatDay(new Date(2026, 9, 1, 9, 0).toISOString(), now)).toMatch(/2026/);
  });
  it('is empty for an invalid date', () => expect(formatDay('nope', now)).toBe(''));
});
