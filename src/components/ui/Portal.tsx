import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Render children into `document.body`.
 *
 * Overlays must escape the app chrome. The header carries `backdrop-blur`, and a
 * non-`none` `backdrop-filter` makes an element the containing block for its
 * `position: fixed` descendants — so a `fixed inset-0` overlay rendered inside
 * the header sizes itself to the 56px header instead of the viewport, pushing
 * its own content off-screen. Portaling to the body removes that ancestor from
 * the chain entirely.
 */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;
  return createPortal(children, document.body);
}
