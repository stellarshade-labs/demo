import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-copper-500 text-onaccent font-semibold hover:bg-copper-400 active:bg-copper-600 disabled:bg-ink-700 disabled:text-ink-400',
  secondary:
    'border border-ink-600 text-ink-100 hover:border-ink-400 hover:bg-ink-800 disabled:text-ink-400 disabled:hover:border-ink-600 disabled:hover:bg-transparent',
  ghost:
    'text-ink-300 hover:text-ink-50 hover:bg-ink-800 disabled:text-ink-600 disabled:hover:bg-transparent',
  danger:
    'border border-signal-bad/50 text-signal-bad hover:bg-signal-bad/10 disabled:opacity-50',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  loading = false,
  icon,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-[3px] transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}
