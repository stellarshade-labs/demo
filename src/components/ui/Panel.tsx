import type { ReactNode } from 'react';

/**
 * The single surface primitive. Square corners, hairline border, a header rail
 * with a small-caps eyebrow — the same shape everywhere so the app reads as one
 * instrument rather than a stack of cards.
 */
export function Panel({
  eyebrow,
  title,
  action,
  children,
  className = '',
  bodyClassName = 'p-5',
}: {
  eyebrow?: string;
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section
      className={`border border-ink-700 bg-ink-850 rounded-[--radius-panel] ${className}`}
    >
      {(eyebrow || title || action) && (
        <header className="flex items-center justify-between gap-4 border-b border-ink-700 px-5 py-3">
          <div className="min-w-0">
            {eyebrow && <div className="label-eyebrow">{eyebrow}</div>}
            {title && (
              <h2 className="mt-0.5 truncate text-[15px] font-semibold text-ink-50">{title}</h2>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </header>
      )}
      <div className={bodyClassName}>{children}</div>
    </section>
  );
}

/** A sunken well for secondary content inside a panel. */
export function Well({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`border border-ink-700 bg-ink-900 px-4 py-3 ${className}`}>{children}</div>
  );
}
