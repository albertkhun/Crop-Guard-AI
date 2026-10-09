import data from '../data/districts.json';

export const DISTRICTS = data.districts;
export const DEFAULT_DISTRICT = data.default;
const KEY = 'pg.district';

export function loadSavedDistrict(storage = globalThis.localStorage) {
  try {
    const v = storage?.getItem(KEY);
    return DISTRICTS.some((d) => d.name === v) ? v : null;
  } catch {
    return null;
  }
}

export function saveDistrict(name, storage = globalThis.localStorage) {
  try { storage?.setItem(KEY, name); } catch { /* private mode: ignore */ }
}

/** location state -> form fields for the server. mode: 'district' | 'gps' | 'none' */
export function locationFields(loc) {
  if (loc.mode === 'gps' && Number.isFinite(loc.lat) && Number.isFinite(loc.lon)) return { lat: loc.lat, lon: loc.lon };
  if (loc.mode === 'district') {
    const d = DISTRICTS.find((x) => x.name === loc.district);
    if (d) return { lat: d.lat, lon: d.lon, district: d.name };
  }
  return {};
}

export function describeLocation(loc) {
  if (loc.mode === 'gps') return `Using your GPS location (${loc.lat.toFixed(3)}, ${loc.lon.toFixed(3)})`;
  if (loc.mode === 'district') return `Weather for ${loc.district}, Manipur`;
  return 'No location: weather context will be skipped';
}

export function gpsErrorMessage(err) {
  switch (err?.code) {
    case 1: return 'Location permission was denied. Please choose your district instead.';
    case 2: return "Couldn't determine your location. Please choose your district instead.";
    case 3: return 'Finding your location took too long. Please choose your district instead.';
    default: return "Location isn't available on this device. Please choose your district instead.";
  }
}

export function getPosition(geo = globalThis.navigator?.geolocation) {
  return new Promise((resolve, reject) => {
    if (!geo) return reject({ code: 0 });
    geo.getCurrentPosition(
      (p) => resolve({ lat: Math.round(p.coords.latitude * 1e4) / 1e4, lon: Math.round(p.coords.longitude * 1e4) / 1e4 }),
      reject,
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 10 * 60_000 },
    );
  });
}

/** '' -> undefined (optional). Returns {value, error}. */
export function parseCropAge(text) {
  const t = String(text ?? '').trim();
  if (!t) return { value: undefined, error: null };
  if (!/^\d+$/.test(t) || Number(t) > 400) return { value: undefined, error: 'Enter whole days between 0 and 400, or leave it blank.' };
  return { value: Number(t), error: null };
}
