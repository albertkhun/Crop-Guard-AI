import Bar from './Bar.jsx';
import ConfidenceRing from './ConfidenceRing.jsx';
import FeedbackButton from './FeedbackButton.jsx';
import Icon from './Icon.jsx';
import StatusChip from './StatusChip.jsx';
import WeatherInsight from './WeatherInsight.jsx';
import { formatDate, pct } from '../utils/format.js';
import { summarize } from '../utils/scan.js';
import { tidy, tidyList } from '../utils/text.js';

const RETAKE_TIPS = [
  ['search', 'Get closer', 'Take a close-up of the affected leaf.'],
  ['refresh', 'Show the underside', 'If possible, include the underside of the leaf.'],
  ['leaf', 'Show the whole plant', 'Include a wider shot so the overall condition is visible.'],
  ['sun', 'Use good lighting', 'Avoid dark, blurry or overexposed photos.'],
];

/** One advice card. Opens/closes with the keyboard; the first card starts open. */
function AdviceCard({ icon, tone, title, open, children }) {
  return (
    <details className={`advice advice--${tone}`} open={open}>
      <summary>
        <span className="advice__icon"><Icon name={icon} size={20} /></span>
        <span className="advice__title">{title}</span>
        <Icon name="down" size={18} className="advice__chev" />
      </summary>
      <div className="advice__body">{children}</div>
    </details>
  );
}

const List = ({ items }) => <ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>;

function Advice({ advice, healthy }) {
  const now = tidyList(advice.immediate_actions);
  const organic = tidyList(advice.organic_options);
  const prevent = tidyList(advice.preventive);
  const recovery = healthy ? '' : tidy(advice.recovery_timeline);
  const expert = tidy(advice.consult_expert_if);
  return (
    <section className="panel" aria-label="Advice">
      <h2>{healthy ? 'Recommended care' : 'Recommended action'}</h2>
      <p className="muted">{healthy ? 'Keep up regular observation and good crop care.' : 'Follow these steps to protect the crop and limit the spread.'}</p>
      <div className="advice-grid">
        {now.length > 0 && <AdviceCard icon={healthy ? 'eye' : 'alert'} tone={healthy ? 'good' : 'warn'} title={healthy ? 'Keep monitoring' : 'What to do now'} open><List items={now} /></AdviceCard>}
        {organic.length > 0 && <AdviceCard icon="leaf" tone="good" title="Organic options"><List items={organic} /></AdviceCard>}
        {prevent.length > 0 && <AdviceCard icon="shield" tone="good" title="Prevention"><List items={prevent} /></AdviceCard>}
        {(recovery || expert) && (
          <AdviceCard icon="book" tone="info" title={healthy ? 'When to check again' : 'Recovery and expert help'}>
            {recovery && <p><strong>Recovery timeline.</strong> {recovery}</p>}
            {expert && <p>Get advice from an agriculture officer if {expert}</p>}
          </AdviceCard>
        )}
      </div>
    </section>
  );
}

function Candidates({ top3, title, skipFirst, tone = 'good' }) {
  const rows = skipFirst ? top3.slice(1) : top3;
  if (!rows.length) return null;
  return (
    <section className="panel" aria-label={title}>
      <h2>{title}</h2>
      <ol className="cands">
        {rows.map((t) => {
          const moved = Math.abs(t.adjusted_prob - t.raw_prob) >= 0.005;
          return (
            <li key={t.class_key}>
              <span className="cands__name">{t.display_name}</span>
              <Bar value={t.raw_prob} tone={tone} />
              <span className="muted cands__val">
                {pct(t.raw_prob)}{moved && <> · after weather context {pct(t.adjusted_prob)}</>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Details({ scan }) {
  const rows = [
    ['calendar', 'Analysed', formatDate(scan.createdAt)],
    scan.location?.district && ['pin', 'District', scan.location.district],
    scan.cropAgeDays !== null && scan.cropAgeDays !== undefined && ['leaf', 'Crop age', `${scan.cropAgeDays} days`],
    ['info', 'Model version', scan.aiResponse.model_version],
  ].filter(Boolean);
  return (
    <section className="panel" aria-label="Analysis information">
      <h2>Analysis information</h2>
      <dl className="facts">
        {rows.map(([icon, k, v]) => (
          <div key={k}><dt><Icon name={icon} size={16} /> {k}</dt><dd>{v}</dd></div>
        ))}
      </dl>
    </section>
  );
}

function ConfidenceHelp() {
  return (
    <details className="panel faq">
      <summary><Icon name="info" size={20} /> How confident is this result? <Icon name="down" size={18} className="advice__chev" /></summary>
      <p className="muted">
        The score is the image model's own probability for its top answer, based on the photo only. Weather context
        never changes it. A high score is not a guarantee, so check with an agriculture officer before treating.
      </p>
    </details>
  );
}

function RetakePanel({ hint, onRetake }) {
  return (
    <section className="panel" aria-label="Help us get a better result">
      <h2>Help us get a better result</h2>
      <p>{hint}</p>
      <div className="tips">
        {RETAKE_TIPS.map(([icon, t, d]) => (
          <div key={t} className="tip"><span className="tip__icon"><Icon name={icon} size={20} /></span><div><strong>{t}</strong><p className="muted small">{d}</p></div></div>
        ))}
      </div>
      <div className="row">
        <button type="button" className="btn btn--primary btn--big" onClick={onRetake}><Icon name="camera" size={20} /> Upload another photo</button>
      </div>
    </section>
  );
}

export default function ResultCard({ scan, onRetake, onFeedbackSaved }) {
  const ai = scan.aiResponse;
  const s = summarize(scan);
  const hasLocation = Boolean(scan.location?.lat !== undefined && scan.location?.lat !== null);
  const img = scan.imageRef?.url;
  const healthy = s.kind === 'healthy';

  return (
    <article className="result" aria-label="Scan result">
      {scan.warnings?.includes('image_not_saved') && (
        <p className="notice notice--warn result__full" role="status"><Icon name="alert" size={20} /> Your photo couldn't be saved to your history, but the result below is valid.</p>
      )}

      {img && <div className="result__img"><img className="thumb" src={img} alt="Your uploaded leaf" loading="lazy" /></div>}
      <div className="result__info"><Details scan={scan} /></div>

      <div className="result__main">
        {ai.status === 'ok' && (
          <>
            <header className={`verdict verdict--${s.tone}`}>
              <div className="verdict__text">
                <p className="eyebrow">{healthy ? 'Health status' : 'Detected condition'}</p>
                <h2>{ai.prediction.display_name}</h2>
                <StatusChip tone={s.tone}>{s.chip}</StatusChip>
              </div>
              <ConfidenceRing value={ai.prediction.confidence} tone={s.tone} />
              <div className={`banner banner--${s.tone}`}>
                <Icon name={healthy ? 'leaf' : 'alert'} size={22} />
                <div>
                  <strong>{healthy ? 'No obvious signs of disease' : 'Check how widespread it is'}</strong>
                  <p>{tidy(ai.advice.severity_guide)}</p>
                </div>
              </div>
            </header>
            <Candidates top3={ai.top3} title="Other possibilities" skipFirst />
            <Advice advice={ai.advice} healthy={healthy} />
            <aside className="notice notice--info" role="note"><Icon name="info" size={20} /><p><strong>Safety note.</strong> {ai.advice.safety_note}</p></aside>
          </>
        )}

        {ai.status === 'low_confidence' && (
          <>
            <header className="verdict verdict--warn">
              <div className="verdict__text">
                <p className="eyebrow">Analysis result</p>
                <h2>More information needed</h2>
                <p>We can't give a confident answer from this photo.</p>
              </div>
              {s.confidence !== null && <ConfidenceRing value={s.confidence} tone="warn" caption="Top match" />}
              <p className="banner banner--warn"><Icon name="alert" size={22} /><span>Below the reliable diagnosis threshold. This is not a diagnosis.</span></p>
            </header>
            <RetakePanel hint={ai.retake_hint} onRetake={onRetake} />
            <Candidates top3={ai.top3} title="Possible matches (not a diagnosis)" tone="warn" />
          </>
        )}

        {ai.status === 'unclear_image' && (
          <>
            <header className="verdict verdict--warn">
              <div className="verdict__text">
                <p className="eyebrow">Photo unclear</p>
                <h2>We couldn't recognise a clear rice leaf</h2>
              </div>
            </header>
            <RetakePanel hint={ai.retake_hint} onRetake={onRetake} />
          </>
        )}

        {ai.status !== 'unclear_image' && <WeatherInsight weather={ai.weather} hasLocation={hasLocation} />}
        <FeedbackButton scan={scan} onSaved={onFeedbackSaved} />
        {ai.status !== 'unclear_image' && <ConfidenceHelp />}
        <p className="muted small">PaddyGuard gives guidance from a photo; it is not a substitute for an expert.</p>
      </div>
    </article>
  );
}
