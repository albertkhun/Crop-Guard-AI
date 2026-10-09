import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { api } from '../api/client.js';
import { formatDate, pct } from '../utils/format.js';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'healthy', label: 'Healthy' },
  { key: 'disease', label: 'Disease Detected' },
  { key: 'high', label: 'High Severity' },
  { key: 'recent', label: 'Recent' },
];

function getTitle(ai) {
  if (ai.status === 'ok') {
    return ai.prediction?.display_name || 'Analysis complete';
  }

  if (ai.status === 'low_confidence') {
    return 'More information needed';
  }

  return 'Photo unclear';
}

function isHealthy(ai) {
  return (
    ai.status === 'ok' &&
    ai.prediction?.class_key === 'healthy'
  );
}

function isDisease(ai) {
  return (
    ai.status === 'ok' &&
    !isHealthy(ai)
  );
}

function getSeverity(ai) {
  if (!isDisease(ai)) return 'healthy';

  const confidence = ai.prediction?.confidence ?? 0;

  if (confidence >= 0.9) return 'high';
  if (confidence >= 0.75) return 'moderate';

  return 'low';
}

function getStatus(ai) {
  if (isHealthy(ai)) {
    return {
      label: 'Healthy',
      className: 'history-status--healthy',
    };
  }

  if (ai.status === 'low_confidence') {
    return {
      label: 'Low confidence',
      className: 'history-status--moderate',
    };
  }

  if (ai.status === 'unclear_image') {
    return {
      label: 'Unclear image',
      className: 'history-status--bad',
    };
  }

  if (getSeverity(ai) === 'high') {
    return {
      label: 'High Risk',
      className: 'history-status--bad',
    };
  }

  return {
    label: 'Moderate Risk',
    className: 'history-status--moderate',
  };
}

function AnalysisRow({ scan }) {
  const ai = scan.aiResponse;
  const status = getStatus(ai);
  const confidence =
    ai.status === 'ok'
      ? ai.prediction?.confidence
      : ai.top3?.[0]?.raw_prob;

  return (
    <Link
      to={`/scan/${scan.id}`}
      state={{ scan }}
      className="analysis-row"
    >
      <div className="analysis-image">
        {scan.imageRef?.url ? (
          <img
            src={scan.imageRef.url}
            alt=""
            loading="lazy"
          />
        ) : (
          <span aria-hidden="true">🌾</span>
        )}
      </div>

      <div className="analysis-crop">
        <strong>
          {getTitle(ai)}
        </strong>

        {scan.location?.district && (
          <span className="muted small">
            {scan.location.district}
          </span>
        )}
      </div>

      <div className="analysis-diagnosis">
        {ai.status === 'ok'
          ? ai.prediction?.display_name
          : getTitle(ai)}
      </div>

      <div className="analysis-confidence">
        {confidence !== undefined ? (
          <>
            <strong>{pct(confidence)}</strong>

            <span className="confidence-track">
              <span
                className="confidence-fill"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(0, confidence * 100)
                  )}%`,
                }}
              />
            </span>
          </>
        ) : (
          <span className="muted">—</span>
        )}
      </div>

      <div>
        <span
          className={`history-status ${status.className}`}
        >
          <span className="status-dot" />
          {status.label}
        </span>
      </div>

      <div className="analysis-date">
        {formatDate(scan.createdAt)}
      </div>

      <div className="analysis-action">
        <span aria-hidden="true">›</span>
      </div>
    </Link>
  );
}

function MobileAnalysisCard({ scan }) {
  const ai = scan.aiResponse;
  const status = getStatus(ai);

  const confidence =
    ai.status === 'ok'
      ? ai.prediction?.confidence
      : ai.top3?.[0]?.raw_prob;

  return (
    <Link
      to={`/scan/${scan.id}`}
      state={{ scan }}
      className="mobile-analysis-card"
    >
      <div className="mobile-analysis-image">
        {scan.imageRef?.url ? (
          <img
            src={scan.imageRef.url}
            alt=""
            loading="lazy"
          />
        ) : (
          <span aria-hidden="true">🌾</span>
        )}
      </div>

      <div className="mobile-analysis-main">
        <div className="mobile-analysis-heading">
          <div>
            <strong>{getTitle(ai)}</strong>

            <span className="mobile-diagnosis">
              {ai.status === 'ok'
                ? ai.prediction?.display_name
                : getTitle(ai)}
            </span>
          </div>

          <span
            className={`history-status ${status.className}`}
          >
            <span className="status-dot" />
            {status.label}
          </span>
        </div>

        <div className="mobile-analysis-meta">
          {confidence !== undefined && (
            <span>
              {pct(confidence)} confidence
            </span>
          )}

          <span>
            {formatDate(scan.createdAt)}
          </span>
        </div>

        <span className="mobile-analysis-arrow">
          ›
        </span>
      </div>
    </Link>
  );
}

export default function HistoryPage() {
  const [items, setItems] = useState([]);
  const [next, setNext] = useState(null);

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const load = useCallback(async (before) => {
    if (before) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    setError(null);

    try {
      const page = await api.listScans({ before });

      setItems((current) =>
        before
          ? [...current, ...page.items]
          : page.items
      );

      setNext(page.nextBefore);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filteredItems = useMemo(() => {
    let result = [...items];

    const query = search.trim().toLowerCase();

    if (query) {
      result = result.filter((scan) => {
        const ai = scan.aiResponse;

        const text = [
          getTitle(ai),
          ai.prediction?.display_name,
          scan.location?.district,
          formatDate(scan.createdAt),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return text.includes(query);
      });
    }

    if (filter === 'healthy') {
      result = result.filter((scan) =>
        isHealthy(scan.aiResponse)
      );
    }

    if (filter === 'disease') {
      result = result.filter((scan) =>
        isDisease(scan.aiResponse)
      );
    }

    if (filter === 'high') {
      result = result.filter((scan) =>
        getSeverity(scan.aiResponse) === 'high'
      );
    }

    if (filter === 'recent') {
      result.sort(
        (a, b) =>
          new Date(b.createdAt) -
          new Date(a.createdAt)
      );
    }

    return result;
  }, [items, search, filter]);

  const healthyCount = items.filter((scan) =>
    isHealthy(scan.aiResponse)
  ).length;

  const diseaseCount = items.filter((scan) =>
    isDisease(scan.aiResponse)
  ).length;

  return (
    <section className="history-page">
      <header className="history-header">
        <div>
          <h1>Analysis History</h1>
          <p>
            Review your previous crop analyses.
          </p>
        </div>

        <div className="history-search">
          <span aria-hidden="true">⌕</span>

          <input
            type="search"
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            placeholder="Search analyses by crop name, disease or date..."
            aria-label="Search analyses"
          />
        </div>
      </header>

      <div
        className="history-filters"
        role="tablist"
        aria-label="Analysis filters"
      >
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={
              filter === item.key
                ? 'history-filter active'
                : 'history-filter'
            }
            onClick={() => setFilter(item.key)}
            role="tab"
            aria-selected={filter === item.key}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="history-stats">
        <div className="history-stat">
          <div className="history-stat__icon">
            ▣
          </div>

          <div>
            <strong>{items.length}</strong>
            <span>Total analyses</span>
          </div>
        </div>

        <div className="history-stat">
          <div className="history-stat__icon history-stat__icon--green">
            ✓
          </div>

          <div>
            <strong>{healthyCount}</strong>
            <span>Healthy</span>
          </div>
        </div>

        <div className="history-stat">
          <div className="history-stat__icon history-stat__icon--red">
            !
          </div>

          <div>
            <strong>{diseaseCount}</strong>
            <span>Disease detected</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-box" role="alert">
          <p>{error.message}</p>

          <button
            type="button"
            className="btn"
            onClick={() =>
              load(
                next && items.length
                  ? next
                  : undefined
              )
            }
          >
            Try again
          </button>
        </div>
      )}

      {loading && (
        <div
          className="history-loading"
          role="status"
        >
          <span
            className="spinner"
            aria-hidden="true"
          />
          Loading your analyses…
        </div>
      )}

      {!loading &&
        !error &&
        filteredItems.length === 0 && (
          <div className="history-empty">
            <div className="history-empty__icon">
              🌱
            </div>

            <h2>
              {search || filter !== 'all'
                ? 'No matching analyses'
                : 'No analyses yet'}
            </h2>

            <p className="muted">
              {search || filter !== 'all'
                ? 'Try another search or filter.'
                : 'Upload a leaf photo to create your first analysis.'}
            </p>

            {!search && filter === 'all' && (
              <Link
                to="/"
                className="btn btn--primary"
              >
                Scan your first leaf
              </Link>
            )}
          </div>
        )}

      {!loading &&
        filteredItems.length > 0 && (
          <>
            {/* Desktop */}
            <div className="analysis-table">
              <div className="analysis-table__header">
                <span>Image</span>
                <span>Crop</span>
                <span>Diagnosis</span>
                <span>Confidence</span>
                <span>Status</span>
                <span>Date</span>
                <span>Actions</span>
              </div>

              {filteredItems.map((scan) => (
                <AnalysisRow
                  key={scan.id}
                  scan={scan}
                />
              ))}

              <div className="analysis-table__footer">
                <span className="muted">
                  Showing {filteredItems.length}
                  {next ? '+' : ''} analyses
                </span>
              </div>
            </div>

            {/* Mobile */}
            <div className="mobile-analysis-list">
              {filteredItems.map((scan) => (
                <MobileAnalysisCard
                  key={scan.id}
                  scan={scan}
                />
              ))}
            </div>
          </>
        )}

      {!loading && next && (
        <div className="history-more">
          <button
            type="button"
            className="btn"
            disabled={loadingMore}
            onClick={() => load(next)}
          >
            {loadingMore
              ? 'Loading…'
              : 'Load more analyses'}
          </button>
        </div>
      )}
    </section>
  );
}