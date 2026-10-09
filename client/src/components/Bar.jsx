/** Decorative horizontal bar; the number next to it carries the meaning, so it is hidden from screen readers. */
export default function Bar({ value, tone = 'good' }) {
  return (
    <span className={`bar bar--${tone}`} aria-hidden="true">
      <i style={{ width: `${Math.max(2, Math.min(100, (value ?? 0) * 100))}%` }} />
    </span>
  );
}
