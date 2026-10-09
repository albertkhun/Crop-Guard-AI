import { describe, expect, it, vi } from 'vitest';
import districts from '../data/districts.json';
import { DEFAULT_DISTRICT, DISTRICTS, describeLocation, getPosition, gpsErrorMessage, loadSavedDistrict, locationFields, parseCropAge, saveDistrict } from '../utils/location.js';

describe('Manipur district data', () => {
  it('has 16 unique districts and Imphal West is the default', () => {
    expect(DISTRICTS).toHaveLength(16);
    expect(new Set(DISTRICTS.map((d) => d.name)).size).toBe(16);
    expect(DEFAULT_DISTRICT).toBe('Imphal West');
    expect(DISTRICTS.some((d) => d.name === DEFAULT_DISTRICT)).toBe(true);
  });
  it('all coordinates fall inside a bounding box around Manipur (sanity check, not a verification)', () => {
    for (const d of DISTRICTS) {
      expect(d.lat).toBeGreaterThan(23.8); expect(d.lat).toBeLessThan(25.7);
      expect(d.lon).toBeGreaterThan(93.0); expect(d.lon).toBeLessThan(94.8);
    }
  });
  it('is flagged TODO_VERIFY because coordinates are approximate', () => {
    expect(districts._meta.status).toBe('TODO_VERIFY');
  });
});

describe('locationFields', () => {
  it('district -> approximate centre + name', () => {
    expect(locationFields({ mode: 'district', district: 'Imphal West' })).toEqual({ lat: 24.817, lon: 93.937, district: 'Imphal West' });
  });
  it('gps -> only coordinates', () => {
    expect(locationFields({ mode: 'gps', lat: 24.8, lon: 93.9, district: 'Imphal West' })).toEqual({ lat: 24.8, lon: 93.9 });
  });
  it('none / unknown district / bad gps -> nothing sent', () => {
    expect(locationFields({ mode: 'none' })).toEqual({});
    expect(locationFields({ mode: 'district', district: 'Atlantis' })).toEqual({});
    expect(locationFields({ mode: 'gps', lat: NaN, lon: 1 })).toEqual({});
  });
  it('describes each mode', () => {
    expect(describeLocation({ mode: 'district', district: 'Thoubal' })).toMatch(/Thoubal, Manipur/);
    expect(describeLocation({ mode: 'gps', lat: 24.8, lon: 93.9 })).toMatch(/GPS/);
    expect(describeLocation({ mode: 'none' })).toMatch(/skipped/);
  });
});

describe('GPS', () => {
  it('rounds coordinates to ~10 m and resolves', async () => {
    const geo = { getCurrentPosition: (ok) => ok({ coords: { latitude: 24.81712345, longitude: 93.93698765 } }) };
    expect(await getPosition(geo)).toEqual({ lat: 24.8171, lon: 93.937 });
  });
  it('rejects when geolocation is missing or denied, with friendly messages that point to the dropdown', async () => {
    await expect(getPosition(null)).rejects.toEqual({ code: 0 });
    const denied = { getCurrentPosition: (_ok, err) => err({ code: 1 }) };
    await expect(getPosition(denied)).rejects.toEqual({ code: 1 });
    for (const code of [0, 1, 2, 3]) expect(gpsErrorMessage({ code })).toMatch(/choose your district/i);
  });
});

describe('saved district + crop age', () => {
  it('remembers a valid district and ignores junk or a broken storage', () => {
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    saveDistrict('Thoubal', storage);
    expect(loadSavedDistrict(storage)).toBe('Thoubal');
    mem.set('pg.district', 'Nowhere');
    expect(loadSavedDistrict(storage)).toBeNull();
    const broken = { getItem: vi.fn(() => { throw new Error('denied'); }), setItem: vi.fn(() => { throw new Error('denied'); }) };
    expect(loadSavedDistrict(broken)).toBeNull();
    expect(() => saveDistrict('Thoubal', broken)).not.toThrow();
  });
  it('parseCropAge', () => {
    expect(parseCropAge('')).toEqual({ value: undefined, error: null });
    expect(parseCropAge(' 45 ')).toEqual({ value: 45, error: null });
    for (const bad of ['-1', '1.5', 'abc', '401', '4 5']) expect(parseCropAge(bad).error).toBeTruthy();
  });
});
