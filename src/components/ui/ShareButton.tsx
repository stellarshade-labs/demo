import { Share2 } from 'lucide-react';
import { Button } from './Button';

/**
 * Native Web Share affordance for a link. Only renders where the browser
 * supports `navigator.share` — elsewhere the adjacent CopyField covers copying.
 */
export function ShareButton({
  value,
  title,
  text,
  className = '',
}: {
  value: string;
  title?: string;
  text?: string;
  className?: string;
}) {
  const supported = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  if (!supported) return null;

  const handleShare = async () => {
    try {
      await navigator.share({ title, text, url: value });
    } catch (err) {
      // The user dismissing the share sheet rejects with AbortError — not an
      // error worth surfacing. Anything else is swallowed too; sharing is a
      // convenience, and copying still works.
      if ((err as { name?: string } | null)?.name === 'AbortError') return;
    }
  };

  return (
    <Button
      variant="secondary"
      size="sm"
      icon={<Share2 className="size-3.5" />}
      onClick={() => void handleShare()}
      className={className}
    >
      Share
    </Button>
  );
}
