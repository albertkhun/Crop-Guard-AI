import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { toTrainingRow } from '../src/services/feedbackExport.js';
import { LOW_RESPONSE, OK_RESPONSE } from './helpers.js';

const base = { _id: 'abc', createdAt: new Date('2026-10-08'), owner: 'device:secret', imageRef: { url: 'https://img/x.jpg' }, location: { lat: 24.8, lon: 93.9, district: 'Imphal West' } };

describe('feedback export', () => {
  it('confirmed: label = the prediction', () => {
    const r = toTrainingRow({ ...base, aiResponse: OK_RESPONSE, feedback: { correct: true } });
    assert.equal(r.label, 'blast'); assert.equal(r.label_kind, 'confirmed'); assert.equal(r.confidence, 0.93);
  });
  it('corrected: label = the class the user chose', () => {
    const r = toTrainingRow({ ...base, aiResponse: OK_RESPONSE, feedback: { correct: false, trueClass: 'hispa' } });
    assert.equal(r.label, 'hispa'); assert.equal(r.label_kind, 'corrected'); assert.equal(r.predicted_class, 'blast');
  });
  it('rejected: wrong, true label unknown', () => {
    const r = toTrainingRow({ ...base, aiResponse: OK_RESPONSE, feedback: { correct: false, trueClass: null } });
    assert.equal(r.label, null); assert.equal(r.label_kind, 'rejected');
  });
  it('low-confidence scan with a user label is exported; "correct" on it is not', () => {
    assert.equal(toTrainingRow({ ...base, aiResponse: LOW_RESPONSE, feedback: { correct: false, trueClass: 'brown_spot' } }).label, 'brown_spot');
    assert.equal(toTrainingRow({ ...base, aiResponse: LOW_RESPONSE, feedback: { correct: true } }), null);
  });
  it('skips scans without feedback', () => {
    assert.equal(toTrainingRow({ ...base, aiResponse: OK_RESPONSE, feedback: null }), null);
  });
  it('never leaks the device id or GPS coordinates', () => {
    const s = JSON.stringify(toTrainingRow({ ...base, aiResponse: OK_RESPONSE, feedback: { correct: true } }));
    assert.ok(!s.includes('device:') && !s.includes('93.9') && !s.includes('lat'));
    assert.ok(s.includes('Imphal West'));
  });
});
