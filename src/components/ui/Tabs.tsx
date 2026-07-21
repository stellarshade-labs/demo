import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

/**
 * Segmented control with an underline marker rather than a filled pill —
 * quieter, and it keeps the panel's flat geometry. The marker is a single
 * element that slides between tabs instead of teleporting.
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
  const listRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    const measure = () => {
      const el = listRef.current?.querySelector<HTMLElement>(`[data-tab="${value}"]`);
      if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    // Font swaps and container resizes both move tab edges.
    const ro = new ResizeObserver(measure);
    if (listRef.current) ro.observe(listRef.current);
    document.fonts?.ready.then(measure).catch(() => {});
    return () => ro.disconnect();
  }, [value]);

  return (
    <div ref={listRef} role="tablist" className="relative flex border-b border-ink-700">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            data-tab={item.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(item.value)}
            className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium transition-colors ${
              active ? 'text-ink-50' : 'text-ink-400 hover:text-ink-100'
            }`}
          >
            {item.icon}
            {item.label}
          </button>
        );
      })}
      {bar && (
        <span
          aria-hidden
          className="absolute -bottom-px h-0.5 bg-copper-500 transition-all duration-300 ease-out motion-reduce:transition-none"
          style={{ left: bar.left, width: bar.width }}
        />
      )}
    </div>
  );
}
