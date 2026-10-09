import { pct } from '../utils/format.js';

export default function ConfidenceBar({ value, label = 'Image model confidence' }) {
  return (
    <div className="conf">
      <div className="conf__label"><span>{label}</span><strong>{pct(value)}</strong></div>
      <div className="conf__track" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
        <div className="conf__fill" style={{ width: `${Math.min(100, value * 100)}%` }} />
      </div>
    </div>
  );
}
