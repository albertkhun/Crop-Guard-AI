import { useState } from 'react';
import { DISTRICTS, describeLocation, getPosition, gpsErrorMessage, saveDistrict } from '../utils/location.js';
import Icon from './Icon.jsx';

const NONE = '__none__';

export default function LocationPicker({ value, onChange, disabled, geo }) {
  const [busy, setBusy] = useState(false);
  const [gpsError, setGpsError] = useState(null);

  async function useGps() {
    setBusy(true);
    setGpsError(null);
    try {
      const pos = await getPosition(geo);
      onChange({ mode: 'gps', ...pos, district: value.district });
    } catch (e) {
      setGpsError(gpsErrorMessage(e)); // fall back to the dropdown, which is always visible
    } finally {
      setBusy(false);
    }
  }

  function pickDistrict(e) {
    const v = e.target.value;
    setGpsError(null);
    if (v === NONE) return onChange({ mode: 'none', district: value.district });
    saveDistrict(v);
    onChange({ mode: 'district', district: v });
  }

  return (
    <section aria-labelledby="loc-h" className="field-group">
      <h3 id="loc-h"><Icon name="pin" size={18} /> Location <span className="muted">(for weather context)</span></h3>
      <button type="button" className="btn btn--sm" onClick={useGps} disabled={disabled || busy}>
        <Icon name="pin" size={16} /> {busy ? 'Finding location…' : 'Use my GPS location'}
      </button>
      <label htmlFor="district" className="label">Or choose your district</label>
      <select id="district" value={value.mode === 'district' ? value.district : value.mode === 'none' ? NONE : ''} onChange={pickDistrict} disabled={disabled}>
        {value.mode === 'gps' && <option value="" disabled>GPS location in use</option>}
        {DISTRICTS.map((d) => <option key={d.name} value={d.name}>{d.name}</option>)}
        <option value={NONE}>Don't use location (skip weather)</option>
      </select>
      <p className="muted small" aria-live="polite">{describeLocation(value)}</p>
      {gpsError && <p className="error" role="alert">{gpsError}</p>}
    </section>
  );
}
