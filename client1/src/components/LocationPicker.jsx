import { useState } from 'react';
import {
  DISTRICTS,
  describeLocation,
  getPosition,
  gpsErrorMessage,
  saveDistrict,
} from '../utils/location.js';

const NONE = '__none__';

function LocationIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export default function LocationPicker({
  value,
  onChange,
  disabled,
  geo,
}) {
  const [busy, setBusy] = useState(false);
  const [gpsError, setGpsError] = useState(null);

  async function useGps() {
    setBusy(true);
    setGpsError(null);

    try {
      const pos = await getPosition(geo);

      onChange({
        mode: 'gps',
        ...pos,
        district: value.district,
      });
    } catch (e) {
      setGpsError(gpsErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function pickDistrict(e) {
    const v = e.target.value;

    setGpsError(null);

    if (v === NONE) {
      return onChange({
        mode: 'none',
        district: value.district,
      });
    }

    saveDistrict(v);

    onChange({
      mode: 'district',
      district: v,
    });
  }

  return (
    <details
      className="loumi-weather-context"
      open={false}
    >
      <summary>
        <span className="loumi-weather-context__title">
          <LocationIcon />
          Weather context
        </span>

        <span className="loumi-weather-context__value">
          {describeLocation(value)}
        </span>
      </summary>

      <div className="loumi-weather-context__body">
        <p>
          Location helps provide local weather context for your crop.
        </p>

        <button
          type="button"
          className="btn"
          onClick={useGps}
          disabled={disabled || busy}
        >
          <LocationIcon />
          {busy ? 'Finding location…' : 'Use my GPS location'}
        </button>

        <label
          htmlFor="district"
          className="label"
        >
          Or choose your district
        </label>

        <select
          id="district"
          value={
            value.mode === 'district'
              ? value.district
              : value.mode === 'none'
                ? NONE
                : ''
          }
          onChange={pickDistrict}
          disabled={disabled}
        >
          {value.mode === 'gps' && (
            <option value="" disabled>
              GPS location in use
            </option>
          )}

          {DISTRICTS.map((d) => (
            <option
              key={d.name}
              value={d.name}
            >
              {d.name}
            </option>
          ))}

          <option value={NONE}>
            Don't use location
          </option>
        </select>

        {gpsError && (
          <p className="error" role="alert">
            {gpsError}
          </p>
        )}
      </div>
    </details>
  );
}