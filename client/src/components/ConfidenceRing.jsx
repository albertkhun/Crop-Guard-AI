import { pct } from '../utils/format.js';

/** Circular score. `value` is 0..1 and is the RAW image-model probability (never weather-adjusted). */
export default function ConfidenceRing({ value, tone = 'good', caption = 'Model confidence', size = 128 }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value ?? 0));
  return (
    <div
      className={`ring ring--${tone}`}
      style={{ width: size, height: size }}
      role="meter"
      aria-label="Image model confidence"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
    >
      <svg viewBox="0 0 120 120" aria-hidden="true" focusable="false">
        <circle className="ring__bg" cx="60" cy="60" r={r} />
        <circle className="ring__fg" cx="60" cy="60" r={r} strokeDasharray={`${c * v} ${c}`} transform="rotate(-90 60 60)" />
      </svg>
      <div className="ring__text"><strong>{pct(v)}</strong><span>{caption}</span></div>
    </div>
  );
}
