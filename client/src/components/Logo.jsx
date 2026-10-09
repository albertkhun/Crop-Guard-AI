export default function Logo({ size = 40 }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <rect width="48" height="48" rx="13" fill="var(--brand)" />
      <path d="M14 20v-4a2 2 0 0 1 2-2h4M34 20v-4a2 2 0 0 0-2-2h-4M14 28v4a2 2 0 0 0 2 2h4M34 28v4a2 2 0 0 1-2 2h-4" fill="none" stroke="#7fe0b0" strokeWidth="2" strokeLinecap="round" />
      <path d="M24 33c-6-1-9-5-8-11 6 0 10 3 10 8M24 33c0-8 3-13 9-14 1 7-2 12-9 14z" fill="#dcf6e3" />
    </svg>
  );
}
