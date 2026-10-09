import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import ImagePicker from '../components/ImagePicker.jsx';
import LocationPicker from '../components/LocationPicker.jsx';
import { prepareForUpload } from '../utils/image.js';
import { DEFAULT_DISTRICT, loadSavedDistrict, locationFields, parseCropAge } from '../utils/location.js';

export default function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [location, setLocation] = useState(() => ({ mode: 'district', district: loadSavedDistrict() || DEFAULT_DISTRICT }));
  const [age, setAge] = useState('');
  const [busy, setBusy] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const crop = parseCropAge(age);
  const canSubmit = Boolean(file) && !busy && !crop.error;

  async function submit(e) {
    e?.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setSlow(false);
    const slowTimer = setTimeout(() => setSlow(true), 6000); // show the cold-start message if it takes a while
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const prepared = await prepareForUpload(file);
      const form = new FormData();
      form.append('image', prepared, prepared.name);
      for (const [k, v] of Object.entries(locationFields(location))) form.append(k, String(v));
      if (crop.value !== undefined) form.append('crop_age_days', String(crop.value));
      const scan = await api.createScan(form, { signal: ctrl.signal });
      navigate(`/scan/${scan.id}`, { state: { scan } });
    } catch (err) {
      if (!ctrl.signal.aborted) setError(err);
    } finally {
      clearTimeout(slowTimer);
      setBusy(false);
      setSlow(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack" aria-busy={busy}>
      <h1>Check your paddy leaf</h1>
      <ImagePicker file={file} onChange={setFile} disabled={busy} />
      <LocationPicker value={location} onChange={setLocation} disabled={busy} />

      <section className="card" aria-labelledby="age-h">
        <h2 id="age-h">3. Crop age <span className="muted">(optional)</span></h2>
        <label htmlFor="age" className="label">Days since sowing or transplanting</label>
        <input id="age" inputMode="numeric" pattern="[0-9]*" value={age} onChange={(e) => setAge(e.target.value)} disabled={busy} placeholder="e.g. 45" aria-invalid={Boolean(crop.error)} />
        {crop.error && <p className="error" role="alert">{crop.error}</p>}
      </section>

      {error && (
        <div className="error-box" role="alert">
          <p>{error.message}</p>
          {error.retryable && <button type="button" className="btn" onClick={submit}>Try again</button>}
        </div>
      )}

      {busy && slow && (
        <p className="banner banner--wait" role="status">
          <span className="spinner" aria-hidden="true" /> Still working. The AI service may be waking up, which can take up to a minute on the first scan. Please keep this page open.
        </p>
      )}

      <div className="row">
        <button type="submit" className="btn btn--primary btn--big" disabled={!canSubmit}>
          {busy ? <><span className="spinner" aria-hidden="true" /> Analysing…</> : 'Analyse photo'}
        </button>
        {busy && <button type="button" className="btn btn--ghost" onClick={() => abortRef.current?.abort()}>Cancel</button>}
      </div>
      {!file && <p className="muted">Add a photo to continue.</p>}
      <p className="muted small" data-testid="privacy-note">
        Privacy: your photo, the district or GPS location you choose, and your feedback are stored so you can see your
        history and so the model can be improved. Only this device can open your scans. Choose "Don't use location" to
        keep your location out.
      </p>
    </form>
  );
}
