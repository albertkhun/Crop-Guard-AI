import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import Bar from '../components/Bar.jsx';
import Icon from '../components/Icon.jsx';
import StatusChip from '../components/StatusChip.jsx';
import { formatDay, greeting, pct } from '../utils/format.js';
import { summarize, tally } from '../utils/scan.js';

const LIMIT = 50;

function Stat({ tone, icon, value, label }) {
  return (
    <div className={`stat stat--${tone}`}>
      <span className="stat__icon"><Icon name={icon} size={22} /></span>
      <div><strong>{value}</strong><span>{label}</span></div>
    </div>
  );
}

export default function HomePage() {
  const [page, setPage] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try { setPage(await api.listScans({ limit: LIMIT })); } catch (e) { setError(e); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const items = page?.items ?? [];
  const t = tally(items);
  const more = page?.nextBefore ? '+' : '';
  const num = (n) => (page ? `${n}${more}` : '–'); // counts come from loaded scans, so "+" marks a lower bound

  return (
    <div className="page">
      <header className="page__head">
        <h1>{greeting()} <span aria-hidden="true">👋</span></h1>
        <p className="muted">Let's keep your paddy healthy.</p>
      </header>

      <section className="hero" aria-labelledby="hero-h">
        <div className="hero__text">
          <span className="tag">AI crop health</span>
          <h2 id="hero-h">Check your crop health</h2>
          <p>Upload a photo of a paddy leaf and let AI look for possible diseases.</p>
          <Link to="/detect" className="btn btn--invert btn--big"><Icon name="camera" size={20} /> Analyse a leaf <Icon name="forward" size={18} /></Link>
        </div>
        <svg className="hero__art" viewBox="0 0 320 240" aria-hidden="true" focusable="false">
          <path d="M60 230C40 130 110 40 250 20c10 120-50 200-190 210z" fill="currentColor" opacity=".16" />
          <path d="M120 232C110 160 160 90 290 80c-4 90-60 150-170 152z" fill="currentColor" opacity=".24" />
          <path d="M70 226C130 150 190 100 250 28" stroke="currentColor" strokeWidth="3" fill="none" opacity=".35" strokeLinecap="round" />
        </svg>
      </section>

      <section aria-labelledby="act-h">
        <h2 id="act-h" className="section-title">Your activity</h2>
        <div className="stats">
          <Stat tone="sky" icon="layers" value={num(t.total)} label="Analyses" />
          <Stat tone="good" icon="leaf" value={num(t.healthy)} label="Healthy" />
          <Stat tone="bad" icon="alert" value={num(t.disease)} label="Detected" />
        </div>
      </section>

      <section aria-labelledby="qa-h">
        <h2 id="qa-h" className="section-title">Quick actions</h2>
        <div className="actions">
          <Link to="/detect" className="action action--good">
            <span className="action__icon"><Icon name="camera" size={24} /></span>
            <div><strong>Disease detection</strong><p>Find possible leaf diseases from a photo.</p></div>
            <Icon name="forward" size={18} />
          </Link>
          <Link to="/history" className="action action--sky">
            <span className="action__icon"><Icon name="clock" size={24} /></span>
            <div><strong>Analysis history</strong><p>Review your earlier scans and results.</p></div>
            <Icon name="forward" size={18} />
          </Link>
        </div>
      </section>

      <section aria-labelledby="rec-h">
        <div className="section-row">
          <h2 id="rec-h" className="section-title">Recent analyses</h2>
          {items.length > 0 && <Link to="/history" className="link">View all</Link>}
        </div>
        {error && (
          <div className="notice notice--bad" role="alert">
            <Icon name="alert" size={22} />
            <div><p>{error.message}</p><button type="button" className="btn btn--sm" onClick={load}>Try again</button></div>
          </div>
        )}
        {!error && !page && <p className="muted" role="status"><span className="spinner" aria-hidden="true" /> Loading…</p>}
        {page && items.length === 0 && (
          <div className="panel empty"><p>No scans yet.</p><Link to="/detect" className="btn btn--primary">Scan your first leaf</Link></div>
        )}
        {items.length > 0 && (
          <ul className="recent">
            {items.slice(0, 3).map((scan) => {
              const s = summarize(scan);
              return (
                <li key={scan.id}>
                  <Link to={`/scan/${scan.id}`} state={{ scan }} className="recent__card">
                    {scan.imageRef?.url ? <img src={scan.imageRef.url} alt="" loading="lazy" /> : <span className="thumb-ph" aria-hidden="true"><Icon name="leaf" size={22} /></span>}
                    <div className="recent__main">
                      <strong>{s.title}</strong>
                      <span className="muted small">{s.confidence !== null ? `${pct(s.confidence)} confidence · ` : ''}{formatDay(scan.createdAt)}</span>
                      {s.confidence !== null && <Bar value={s.confidence} tone={s.tone} />}
                      <StatusChip tone={s.tone}>{s.chip}</StatusChip>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
