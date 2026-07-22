import { useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Position a portaled dropdown from its trigger's rect.
 *
 * Header menus that used plain `absolute right-0 top-full` mispositioned on the
 * first open: the sticky, `backdrop-filter`ed header becomes the containing
 * block for `position: fixed`/absolute descendants, so a narrow anchor could
 * resolve the menu's left edge off-screen until a later re-render corrected it.
 *
 * This mirrors HelpTip: measure the anchor in a layout effect, clamp to the
 * viewport, and hand back `fixed` coords for a `<Portal>`ed menu. Returns `null`
 * until measured so callers render nothing (no first-paint flash).
 */
export function useAnchoredMenu(
  anchorRef: RefObject<HTMLElement | null>,
  open: boolean,
  opts?: { width?: number; gap?: number; align?: 'left' | 'right' },
): { top: number; left: number } | null {
  const width = opts?.width ?? 260;
  const gap = opts?.gap ?? 6;
  const align = opts?.align ?? 'right';
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }

    const place = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      // Right-aligned menus pin their right edge to the anchor's; left-aligned
      // ones pin their left edge. Either way, clamp inside the viewport.
      const raw = align === 'right' ? r.right - width : r.left;
      const left = Math.min(Math.max(8, raw), window.innerWidth - width - 8);
      setCoords({ top: r.bottom + gap, left });
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [anchorRef, open, width, gap, align]);

  return coords;
}
