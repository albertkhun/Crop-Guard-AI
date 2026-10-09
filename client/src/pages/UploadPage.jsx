import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import Icon from '../components/Icon.jsx';
import ImagePicker from '../components/ImagePicker.jsx';
import LocationPicker from '../components/LocationPicker.jsx';
import { prepareForUpload } from '../utils/image.js';
import { DEFAULT_DISTRICT, loadSavedDistrict, locationFields, parseCropAge } from '../utils/location.js';

const HOW = [
  ['Upload a leaf photo', 'Take a clear photo or choose one from your device.'],
  ['AI looks at the leaf', 'The image model checks for visible signs of disease.'],
  ['Review the result', 'See the diagnosis and how confident the model is.'],
  ['Get practical advice', 'Read next steps, plus weather context for your district.'],
];
const TIPS = ['Use good lighting', 'Keep the affected leaf clearly visible', 'Avoid blurry images', 'Capture the whole affected area'];

// Real phases of the request, so the progress list never claims something that has not happened.
const STEPS = [['preparing', 'Preparing your photo'], ['analyzing', 'Analysing the leaf'], ['done', 'Result ready']];

function Progress({ phase }) {
  const at = STEPS.findIndex(([k]) => k === phase);
  return (
    <ol className="steps" aria-label="Progress">
      {STEPS.map(([k, label], i) => {
        const state = i < at ? 'done' : i === at ? 'active' : 'todo';
        return (
          <li key={k} data-state={state}>
            <span className="steps__dot" aria-hidden="true">{state === 'done' ? <Icon name="check" size={14} /> : state === 'active' ? <span className="spinner" /> : null}</span>
            {label}
          </li>
        );
      })}
    </ol>
  );
}

export default function UploadPage() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [location, setLocation] = useState(() => ({ mode: 'district', district: loadSavedDistrict() || DEFAULT_DISTRICT }));
  const [age, setAge] = useState('');
  const [phase, setPhase] = useState('idle'); // idle | preparing | analyzing
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const busy = phase !== 'idle';
  const crop = parseCropAge(age);
  const canSubmit = Boolean(file) && !busy && !crop.error;

  async function submit(e) {
    e?.preventDefault();
    if (!canSubmit) return;
    setPhase('preparing');
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
      setPhase('analyzing');
      const scan = await api.createScan(form, { signal: ctrl.signal });
      navigate(`/scan/${scan.id}`, { state: { scan } });
    } catch (err) {
      if (!ctrl.signal.aborted) setError(err);
    } finally {
      clearTimeout(slowTimer);
      setPhase('idle');
      setSlow(false);
    }
  }

  return (
    <form onSubmit={submit} className="page" aria-busy={busy}>
      <header className="page__head">
        <h1>Check your paddy crop</h1>
        <p className="muted">Upload a clear photo of one leaf and the AI will look for possible signs of disease.</p>
      </header>

      <div className="split">
        <div className="stack">
          <section className="panel">
            <ImagePicker file={file} onChange={setFile} disabled={busy} scanning={busy} />

            {busy && (
              <div className="analyzing">
                <h2>Analysing your crop…</h2>
                <Progress phase={phase} />
                {slow && (
                  <p className="notice notice--warn" role="status">
                    <span className="spinner" aria-hidden="true" />
                    <span>Still working. The AI service may be waking up, which can take up to a minute on the first scan. Please keep this page open.</span>
                  </p>
                )}
              </div>
            )}

            {error && (
              <div className="notice notice--bad" role="alert">
                <Icon name="alert" size={22} />
                <div>
                  <strong>{error.retryable ? "Couldn't finish the analysis" : 'Unable to use this image'}</strong>
                  <p>{error.message}</p>
                  {error.retryable && <button type="button" className="btn btn--sm btn--primary" onClick={submit}>Try again</button>}
                </div>
              </div>
            )}

            <div className="row">
              <button type="submit" className="btn btn--primary btn--big" disabled={!canSubmit}>
                {busy ? <><span className="spinner" aria-hidden="true" /> Analysing…</> : <><Icon name="layers" size={20} /> Analyse photo</>}
              </button>
              {busy && <button type="button" className="btn btn--big btn--ghost" onClick={() => abortRef.current?.abort()}>Cancel</button>}
            </div>
            {!file && !busy && <p className="muted small">Add a photo to continue.</p>}
          </section>

          <section className="panel" aria-labelledby="opt-h">
            <h2 id="opt-h">Optional details</h2>
            <p className="muted small">These help the weather context for your field. They never change the photo diagnosis.</p>
            <div className="cols2">
              <LocationPicker value={location} onChange={setLocation} disabled={busy} />
              <section className="field-group" aria-labelledby="age-h">
                <h3 id="age-h"><Icon name="calendar" size={18} /> Crop age <span className="muted">(optional)</span></h3>
                <label htmlFor="age" className="label">Days since sowing or transplanting</label>
                <input id="age" inputMode="numeric" pattern="[0-9]*" value={age} onChange={(e) => setAge(e.target.value)} disabled={busy} placeholder="e.g. 45" aria-invalid={Boolean(crop.error)} />
                {crop.error && <p className="error" role="alert">{crop.error}</p>}
              </section>
            </div>
          </section>
        </div>

        <aside className="stack">
          <section className="panel panel--tint" aria-labelledby="how-h">
            <h2 id="how-h">How it works</h2>
            <ol className="how">
              {HOW.map(([t, d], i) => (
                <li key={t}><span className="how__n">{i + 1}</span><div><strong>{t}</strong><p className="muted small">{d}</p></div></li>
              ))}
            </ol>
          </section>
          <section className="panel" aria-labelledby="tips-h">
            <h2 id="tips-h">For best results</h2>
            <ul className="ticks">{TIPS.map((t) => <li key={t}><Icon name="check" size={16} /> {t}</li>)}</ul>
            <p className="muted small">Supported formats: JPG, JPEG, PNG. Maximum size: 10 MB.</p>
          </section>
        </aside>
      </div>

      <p className="privacy muted small" data-testid="privacy-note">
        <Icon name="lock" size={16} />
        <span>
          Privacy: your photo, the district or GPS location you choose, and your feedback are stored so you can see your
          history and so the model can be improved. Only this device can open your scans. Choose "Don't use location" to
          keep your location out.
        </span>
      </p>
    </form>
  );
}
