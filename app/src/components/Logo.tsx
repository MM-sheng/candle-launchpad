/** Minimal wick + flame mark. Inherits currentColor for the wick, accent for the flame. */
export function Logo({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21v-7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 14c-2.6 0-4-1.9-4-4 0-2.4 2.2-3.6 2.6-6 .1-.5.7-.6 1 -.2C13.4 6.2 16 7.6 16 10c0 2.1-1.4 4-4 4z" fill="var(--accent)" />
    </svg>
  );
}
