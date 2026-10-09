export default function StatusChip({ tone = 'good', children }) {
  return <span className={`chip chip--${tone}`}><i aria-hidden="true" />{children}</span>;
}
