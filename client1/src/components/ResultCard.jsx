import ConfidenceBar from './ConfidenceBar.jsx';
import FeedbackButton from './FeedbackButton.jsx';
import WeatherInsight from './WeatherInsight.jsx';
import { HEALTHY_KEY } from '../utils/classes.js';
import { pct } from '../utils/format.js';

const SECTIONS = [
  ['immediate_actions', 'What to do now', true],
  ['organic_options', 'Organic / non-chemical options', false],
  ['preventive', 'Prevention', false],
];

function List({ items }) {
  return <ul>{items.map((t, i) => <li key={i}>{t}</li>)}</ul>;
}

function Advice({ advice }) {
  return (
    <section className="card" aria-label="Advice">
      <h3>Advice</h3>
      <p>{advice.severity_guide}</p>
      {SECTIONS.map(([k, title, open]) => advice[k]?.length > 0 && (
        <details key={k} open={open}><summary>{title}</summary><List items={advice[k]} /></details>
      ))}
      <details><summary>Recovery timeline</summary><p>{advice.recovery_timeline}</p></details>
      <details><summary>When to ask an expert</summary><p>Get advice from an agriculture officer if {advice.consult_expert_if}</p></details>
    </section>
  );
}

function Candidates({ top3, title, skipFirst }) {
  const rows = skipFirst ? top3.slice(1) : top3;
  if (!rows.length) return null;
  return (
    <section className="card" aria-label={title}>
      <h3>{title}</h3>
      <ol className="cands">
        {rows.map((t) => {
          const moved = Math.abs(t.adjusted_prob - t.raw_prob) >= 0.005;
          return (
            <li key={t.class_key}>
              <span>{t.display_name}</span>
              <span className="muted">
                {pct(t.raw_prob)}{moved && <> · after weather context {pct(t.adjusted_prob)}</>}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export default function ResultCard({ scan, onRetake, onFeedbackSaved }) {
  const ai = scan.aiResponse;
  const hasLocation = Boolean(scan.location?.lat !== undefined && scan.location?.lat !== null);
  const img = scan.imageRef?.url;
  const healthy = ai.prediction?.class_key === HEALTHY_KEY;

  return (
    <article className="result" aria-label="Scan result">
      {img && <img className="thumb" src={img} alt="Your uploaded leaf" loading="lazy" />}
      {scan.warnings?.includes('image_not_saved') && (
        <p className="banner banner--wait" role="status">Your photo couldn't be saved to your history, but the result below is valid.</p>
      )}

      {ai.status === 'ok' && (
        <>
          <header className={`verdict ${healthy ? 'verdict--good' : 'verdict--bad'}`}>
            <p className="eyebrow">{healthy ? 'Looks healthy' : 'Likely diagnosis'}</p>
            <h2>{ai.prediction.display_name}</h2>
            <ConfidenceBar value={ai.prediction.confidence} />
          </header>
          <Candidates top3={ai.top3} title="Other possibilities" skipFirst />
          <Advice advice={ai.advice} />
          <aside className="callout callout--safety" role="note"><strong>Safety note.</strong> {ai.advice.safety_note}</aside>
        </>
      )}

      {ai.status === 'low_confidence' && (
        <>
          <header className="verdict verdict--warn">
            <p className="eyebrow">Not sure yet</p>
            <h2>We can't give a confident answer from this photo</h2>
            <p>{ai.retake_hint}</p>
            <button type="button" className="btn btn--primary" onClick={onRetake}>Upload another photo</button>
          </header>
          <Candidates top3={ai.top3} title="Possible matches (not a diagnosis)" />
        </>
      )}

      {ai.status === 'unclear_image' && (
        <header className="verdict verdict--warn">
          <p className="eyebrow">Photo unclear</p>
          <h2>We couldn't recognise a clear rice leaf</h2>
          <p>{ai.retake_hint}</p>
          <button type="button" className="btn btn--primary" onClick={onRetake}>Upload another photo</button>
        </header>
      )}

      {ai.status !== 'unclear_image' && <WeatherInsight weather={ai.weather} hasLocation={hasLocation} />}
      <FeedbackButton scan={scan} onSaved={onFeedbackSaved} />
      <p className="muted small">Model version {ai.model_version}. PaddyGuard gives guidance from a photo; it is not a substitute for an expert.</p>
    </article>
  );
}
