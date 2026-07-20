import type { ReactNode } from 'react';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

/**
 * Segmented control with an underline marker rather than a filled pill —
 * quieter, and it keeps the panel's flat geometry.
 */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="tablist" className="flex border-b border-ink-700">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(item.value)}
            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-[13px] font-medium transition-colors ${
              active
                ? 'border-copper-500 text-ink-50'
                : 'border-transparent text-ink-400 hover:text-ink-100'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
