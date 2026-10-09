import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import Icon from '../components/Icon.jsx';
import ResultCard from '../components/ResultCard.jsx';
import StatusChip from '../components/StatusChip.jsx';
import { summarize } from '../utils/scan.js';

export default function ScanPage() {
  const { id } = useParams();
  const { state, key } = useLocation();
  const navigate = useNavigate();
  const fromRoute = state?.scan?.id === id ? state.scan : null; // freshly created scan: no refetch needed
  const [scan, setScan] = useState(fromRoute);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (fromRoute) { setScan(fromRoute); return undefined; }
    let alive = true;
    setScan(null);
    setError(null);
    api.getScan(id).then((s) => alive && setScan(s)).catch((e) => alive && setError(e));
    return () => { alive = false; };
  }, [id, fromRoute, attempt]);

  const back = () => (key !== 'default' ? navigate(-1) : navigate('/history'));
  const s = scan ? summarize(scan) : null;

  return (
    <div className="page">
      <header className="page__head page__head--split">
        <div className="titlebar">
          <button type="button" className="iconbtn" onClick={back} aria-label="Go back"><Icon name="back" size={20} /></button>
          <h1>Analysis result</h1>
        </div>
        {s && <StatusChip tone={s.tone === 'warn' ? 'warn' : 'good'}>{s.tone === 'warn' ? 'More information needed' : 'Analysis completed'}</StatusChip>}
      </header>

      {error && (
        <div className="notice notice--bad" role="alert">
          <Icon name="alert" size={22} />
          <div>
            <p>{error.status === 404 ? "We couldn't find that scan." : error.message}</p>
            <div className="row">
              {error.retryable && <button type="button" className="btn btn--sm" onClick={() => setAttempt((n) => n + 1)}>Try again</button>}
              <Link className="btn btn--sm" to="/history">Back to history</Link>
            </div>
          </div>
        </div>
      )}
      {!error && !scan && <p className="center" role="status"><span className="spinner" aria-hidden="true" /> Loading scan…</p>}
      {scan && (
        <ResultCard
          scan={scan}
          onRetake={() => navigate('/detect')}
          onFeedbackSaved={(updated) => setScan((cur) => ({ ...cur, feedback: updated.feedback }))}
        />
      )}
    </div>
  );
}
