import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';
import { Portal } from './Portal';

/**
 * A small `?` affordance that reveals an explanation on hover, focus, or tap.
 *
 * The bubble is portalled to the body and positioned from the trigger's rect,
 * so it escapes panel `overflow`/`backdrop-filter` ancestors (same reasoning as
 * WalletModal — see Portal). Opens on hover for mouse users and on click for
 * touch; closes on leave, blur, Escape, or an outside click.
 */
export function HelpTip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = 260;
    // Prefer anchoring the bubble's left edge to the icon, clamped to viewport.
    const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
    setCoords({ top: r.bottom + 8, left });
  }, []);

  const show = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    place();
    setOpen(true);
  }, [place]);

  const hide = useCallback((delay = 0) => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), delay);
  }, []);

  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !bubbleRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onScroll = () => setOpen(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        className="-m-2 p-2 inline-flex size-4 items-center justify-center align-middle text-ink-500 transition-colors hover:text-copper-400 focus-visible:text-copper-400"
        onMouseEnter={show}
        onMouseLeave={() => hide(120)}
        onFocus={show}
        onBlur={() => hide(0)}
        onClick={(e) => {
          e.preventDefault();
          open ? setOpen(false) : show();
        }}
      >
        <HelpCircle className="size-3.5" />
      </button>

      {open && coords && (
        <Portal>
          <div
            ref={bubbleRef}
            role="tooltip"
            onMouseEnter={show}
            onMouseLeave={() => hide(120)}
            style={{ position: 'fixed', top: coords.top, left: coords.left, width: 260 }}
            className="z-50 border border-ink-600 bg-ink-850 px-3 py-2.5 text-[12px] leading-relaxed text-ink-300 shadow-lg shadow-black/30"
          >
            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
              {label}
            </div>
            {children}
          </div>
        </Portal>
      )}
    </>
  );
}
