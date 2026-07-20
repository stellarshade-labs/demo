import type { InputHTMLAttributes, ReactNode } from 'react';

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  /** Rendered inside the input on the right, e.g. an asset code or a paste button. */
  adornment?: ReactNode;
  mono?: boolean;
}

export function Field({
  label,
  hint,
  error,
  adornment,
  mono = false,
  className = '',
  id,
  ...rest
}: FieldProps) {
  const inputId = id ?? `field-${label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className={className}>
      <label htmlFor={inputId} className="label-eyebrow mb-2 block">
        {label}
      </label>
      <div
        className={`flex items-center border bg-ink-900 transition-colors ${
          error ? 'border-signal-bad/60' : 'border-ink-700 focus-within:border-copper-500'
        }`}
      >
        <input
          {...rest}
          id={inputId}
          className={`h-11 w-full flex-1 bg-transparent px-3 text-sm text-ink-50 placeholder:text-ink-600 focus:outline-none ${
            mono ? 'font-mono tracking-tight' : ''
          }`}
        />
        {adornment && <div className="shrink-0 pr-2">{adornment}</div>}
      </div>
      {error ? (
        <p className="mt-2 text-xs text-signal-bad">{error}</p>
      ) : hint ? (
        <p className="mt-2 text-xs leading-relaxed text-ink-400">{hint}</p>
      ) : null}
    </div>
  );
}
