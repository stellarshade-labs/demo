import { useCallback, useEffect, useState } from 'react';
import { Check, Copy } from 'lucide-react';

/** Copy-to-clipboard with a brief confirmation, used for every address. */
export function useCopy(value: string) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [value]);

  return { copied, copy };
}

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const { copied, copy } = useCopy(value);
  return (
    <button
      type="button"
      onClick={copy}
      title={copied ? 'Copied' : `Copy ${label ?? 'value'}`}
      className="inline-flex items-center gap-1.5 text-ink-400 transition-colors hover:text-copper-400"
    >
      {copied ? <Check className="size-3.5 text-signal-ok" /> : <Copy className="size-3.5" />}
      {label && <span className="text-xs">{copied ? 'Copied' : label}</span>}
    </button>
  );
}

/** A read-only monospace value with a copy affordance — the app's address slug. */
export function CopyField({
  value,
  display,
  className = '',
}: {
  value: string;
  display?: string;
  className?: string;
}) {
  const { copied, copy } = useCopy(value);
  return (
    <button
      type="button"
      onClick={copy}
      title="Click to copy"
      className={`group flex w-full items-center justify-between gap-3 border border-ink-700 bg-ink-900 px-3 py-2.5 text-left transition-colors hover:border-ink-600 ${className}`}
    >
      <span className="min-w-0 truncate font-mono text-[13px] tracking-tight text-ink-100">
        {display ?? value}
      </span>
      {copied ? (
        <Check className="size-3.5 shrink-0 text-signal-ok" />
      ) : (
        <Copy className="size-3.5 shrink-0 text-ink-500 transition-colors group-hover:text-copper-400" />
      )}
    </button>
  );
}
