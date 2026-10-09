import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

const nice = (key) => key.replace(/_/g, ' ');

/**
 * ok             -> "Was this correct?" Yes / No (+ optional real class)
 * low_confidence -> "Do you know what it was?" (+ real class)
 * unclear_image  -> nothing to rate
 */
export default function FeedbackButton({ scan, onSaved, classLoader = api.classes, send = api.sendFeedback }) {
  const status = scan.aiResponse.status;
  const [asking, setAsking] = useState(status === 'low_confidence');
  const [editing, setEditing] = useState(false);
  const [classes, setClasses] = useState(null); // null = not loaded yet
  const [trueClass, setTrueClass] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const picking = asking || editing;
  useEffect(() => {
    if (!picking || classes !== null) return undefined;
    let alive = true;
    classLoader().then((c) => alive && setClasses(c)).catch(() => alive && setClasses([])); // can still submit without a class
    return () => { alive = false; };
  }, [picking, classes, classLoader]);

  if (status === 'unclear_image') return null;

  async function submit(correct, tc) {
    setBusy(true);
    setError(null);
    try {
      const updated = await send(scan.id, { correct, trueClass: tc || undefined });
      onSaved?.(updated);
      setAsking(false);
      setEditing(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const fb = scan.feedback;
  if (fb && !editing) {
    const name = fb.trueClass ? classes?.find((c) => c.class_key === fb.trueClass)?.display_name || nice(fb.trueClass) : null;
    return (
      <section className="card card--quiet" aria-label="Your feedback">
        <p role="status">
          Thanks for your feedback: {fb.correct ? 'you marked this as correct' : `you marked this as not correct${name ? ` (actually: ${name})` : ''}`}.{' '}
          <button type="button" className="link" onClick={() => setEditing(true)}>Change</button>
        </p>
      </section>
    );
  }

  return (
    <section className="card" aria-label="Feedback">
      <h3>{status === 'ok' ? 'Was this correct?' : 'Do you know what it was?'}</h3>
      {status === 'ok' && !picking && (
        <div className="row">
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => submit(true)}>👍 Yes, correct</button>
          <button type="button" className="btn" disabled={busy} onClick={() => setAsking(true)}>👎 No</button>
        </div>
      )}
      {picking && (
        <div>
          <label htmlFor="true-class" className="label">What was it actually? (optional)</label>
          <select id="true-class" value={trueClass} onChange={(e) => setTrueClass(e.target.value)} disabled={busy}>
            <option value="">I'm not sure</option>
            {(classes ?? []).map((c) => <option key={c.class_key} value={c.class_key}>{c.display_name}</option>)}
          </select>
          <div className="row">
            <button type="button" className="btn btn--primary" disabled={busy} onClick={() => submit(false, trueClass)}>
              {busy ? 'Sending…' : 'Send feedback'}
            </button>
            {(status === 'ok' || editing) && (
              <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => { setAsking(false); setEditing(false); }}>Cancel</button>
            )}
          </div>
        </div>
      )}
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}
