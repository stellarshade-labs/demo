import { Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';

/**
 * Single-tap light/dark switch for the header. Shows the icon of the theme you
 * would switch *to*, which is the convention users expect from a toggle.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolved, toggle } = useTheme();
  const goingTo = resolved === 'dark' ? 'light' : 'dark';

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${goingTo} theme`}
      title={`Switch to ${goingTo} theme`}
      data-tour="theme"
      className="inline-flex size-8 items-center justify-center rounded-[3px] border border-ink-600 text-ink-300 transition-colors hover:border-ink-400 hover:text-ink-50"
    >
      {resolved === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      <span className={className} />
    </button>
  );
}
