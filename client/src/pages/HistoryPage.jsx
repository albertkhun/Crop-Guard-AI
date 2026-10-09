import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import Bar from '../components/Bar.jsx';
import Icon from '../components/Icon.jsx';
import StatusChip from '../components/StatusChip.jsx';
import { formatDay, formatTime, pct } from '../utils/format.js';
import { FILTERS, summarize, tally } from '../utils/scan.js';

function Row({ scan }) {
  const s = summarize(scan);
  const fb = scan.feedback;
  return (
    <li>
      <Link to={`/scan/${scan.id}`} state={{ scan }} className="hrow">
        {scan.imageRef?.url ? <img src={scan.imageRef.url} alt="" loading="lazy" /> : <span className="thumb-ph" aria-hidden="true"><Icon name="leaf" size={22} /></span>}
        <span className="hrow__main">
          <strong>{s.title}</strong>
          <span className="muted small">
            {scan.location?.district || 'No location'}
            {fb && <> · <span title={fb.correct ? 'You marked this correct' : 'You marked this not correct'}>{fb.correct ? '✓ correct' : '✗ not correct'}</span></>}
          </span>
        </span>
        <span className="hrow__conf">
          {s.confidence !== null ? <><strong>{pct(s.confidence)}</strong><Bar value={s.confidence} tone={s.tone} /></> : <span className="muted">–</span>}
        </span>
        <span className="hrow__chip"><StatusChip tone={s.tone}>{s.chip}</StatusChip></span>
        <span className="hrow__date"><strong>{formatDay(scan.createdAt)}</strong><span className="muted small">{formatTime(scan.createdAt)}</span></span>
        <Icon name="right" size={18} className="hrow__go" />
      </Link>
    </li>
  );
}

function Stat({ tone, icon, value, label }) {
  return (
    <div className={`stat stat--${tone}`}>
      <span className="stat__icon"><Icon name={icon} size={22} /></span>
      <div><strong>{value}</strong><span>{label}</span></div>
    </div>
  );
}

export default function HistoryPage() {
  const [items, setItems] = useState([]);
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');

  const load = useCallback(async (before) => {
    setLoading(true);
    setError(null);
    try {
      const page = await api.listScans({ before });
      setItems((cur) => (before ? [...cur, ...page.items] : page.items));
      setNext(page.nextBefore);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const t = useMemo(() => tally(items), [items]);
  const shown = useMemo(() => {
    const keep = FILTERS.find(([k]) => k === filter)[2];
    const q = query.trim().toLowerCase();
    return items.filter((scan) => {
      const s = summarize(scan);
      if (!keep(s.kind)) return false;
      if (!q) return true;
      return [s.title, s.chip, scan.location?.district, formatDay(scan.createdAt)].some((v) => v?.toLowerCase().includes(q));
    });
  }, [items, filter, query]);
  const more = next ? '+' : '';

  return (
    <div className="page">
      <header className="page__head page__head--split">
        <div>
          <h1>Your scans</h1>
          <p className="muted">Review your previous crop analyses.</p>
        </div>
        <label className="search">
          <span className="sr-only">Search analyses</span>
          <Icon name="search" size={18} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by result, district or date…" />
        </label>
      </header>

      <div className="chips" role="group" aria-label="Filter analyses">
        {FILTERS.map(([k, label]) => (
          <button key={k} type="button" className="fchip" aria-pressed={filter === k} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>

      <div className="stats">
        <Stat tone="sky" icon="layers" value={`${t.total}${more}`} label="Total analyses" />
        <Stat tone="good" icon="leaf" value={`${t.healthy}${more}`} label="Healthy" />
        <Stat tone="bad" icon="alert" value={`${t.disease}${more}`} label="Disease detected" />
      </div>

      {error && (
        <div className="notice notice--bad" role="alert">
          <Icon name="alert" size={22} />
          <div>
            <p>{error.message}</p>
            <button type="button" className="btn btn--sm" onClick={() => load(next && items.length ? next : undefined)}>Try again</button>
          </div>
        </div>
      )}
      {!loading && !error && items.length === 0 && (
        <div className="panel empty"><p>No scans yet.</p><Link to="/detect" className="btn btn--primary">Scan your first leaf</Link></div>
      )}
      {items.length > 0 && shown.length === 0 && <div className="panel empty"><p>No analyses match your search or filter.</p></div>}

      {shown.length > 0 && (
        <div className="htable">
          <div className="hrow hrow--head" aria-hidden="true">
            <span>Image</span><span>Result</span><span>Confidence</span><span>Status</span><span>Date</span><span />
          </div>
          <ul className="hlist">{shown.map((s) => <Row key={s.id} scan={s} />)}</ul>
        </div>
      )}
      {loading && <p className="center" role="status"><span className="spinner" aria-hidden="true" /> Loading…</p>}
      <div className="row row--between">
        <p className="muted small">Showing {shown.length} of {items.length} loaded{next ? ' (more available)' : ''}</p>
        {!loading && next && <button type="button" className="btn" onClick={() => load(next)}>Load more</button>}
      </div>
    </div>
  );
}
