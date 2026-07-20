/**
 * Wordmark. Two offset squares — the second is the "shadow" the protocol is
 * named for: same shape, no fill, slightly displaced.
 */
export function ShadeMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <rect x="2.5" y="2.5" width="10" height="10" fill="currentColor" />
      <rect
        x="7.5"
        y="7.5"
        width="10"
        height="10"
        stroke="currentColor"
        strokeWidth="1.4"
        opacity="0.55"
      />
    </svg>
  );
}
