import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, PlayCircle, X } from 'lucide-react';
import { Portal } from '@/components/ui/Portal';
import { Button } from '@/components/ui/Button';

/**
 * A lightweight guided tour over the real app chrome — no dependency, just a
 * dimming overlay, a highlight ring around each `data-tour` target, and a
 * coachmark bubble. Steps target elements that are always mounted (the nav rail
 * and header), so the tour never has to juggle routes.
 */

interface TourStep {
  target: string; // data-tour attribute value
  title: string;
  body: string;
  final?: boolean;
}

const STEPS: TourStep[] = [
  {
    target: 'nav-send',
    title: 'Send',
    body: 'Pay anyone privately. Enter their public address (or meta-address) and an amount — Shade derives a fresh one-time address for the transfer.',
  },
  {
    target: 'nav-receive',
    title: 'Receive',
    body: 'Your meta-address lives here. Share it, publish it so people can pay you by your public address, and claim payments as they arrive.',
  },
  {
    target: 'nav-history',
    title: 'History',
    body: 'Every send and claim this browser made, with links to the block explorer.',
  },
  {
    target: 'nav-settings',
    title: 'Settings',
    body: 'Choose how you receive (pool or account), default the relayer, switch theme, and back up or reset your identity.',
  },
  {
    target: 'identity',
    title: 'Identities',
    body: 'The identity you’re acting as. Keep several — say, one personal and one for work — and switch or add more from here.',
  },
  {
    target: 'lock',
    title: 'Lock',
    body: 'Your identity auto-locks after 6 hours. Lock it yourself anytime — you’ll re-enter your passphrase to return.',
  },
  {
    target: 'theme',
    title: 'Light or dark',
    body: 'Flip the theme whenever you like. Your choice is remembered.',
  },
  {
    target: 'nav-demo',
    title: 'Have questions?',
    body: 'See the end-to-end demo! Walk through a full send → scan → claim with two example users — no funds, no wallet, just the flow.',
    final: true,
  },
];

interface TourContextValue {
  active: boolean;
  start: () => void;
  stop: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function TourProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [index, setIndex] = useState<number | null>(null);
  const active = index !== null;

  const start = useCallback(() => setIndex(0), []);
  const stop = useCallback(() => setIndex(null), []);

  const value = useMemo<TourContextValue>(() => ({ active, start, stop }), [active, start, stop]);

  return (
    <TourContext.Provider value={value}>
      {children}
      {active && (
        <TourOverlay
          step={STEPS[index!]}
          index={index!}
          total={STEPS.length}
          onBack={() => setIndex((i) => Math.max(0, (i ?? 0) - 1))}
          onNext={() => setIndex((i) => (i! + 1 < STEPS.length ? i! + 1 : null))}
          onSkip={stop}
          onFinish={() => {
            stop();
            navigate('/demo');
          }}
        />
      )}
    </TourContext.Provider>
  );
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function TourOverlay({
  step,
  index,
  total,
  onBack,
  onNext,
  onSkip,
  onFinish,
}: {
  step: TourStep;
  index: number;
  total: number;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  onFinish: () => void;
}) {
  const [rect, setRect] = useState<Rect | null>(null);

  // Nav targets live in the left rail, which below `lg` is a slide-in drawer.
  // Ask the shell to open it for those steps so the target is actually on-screen.
  const isNavStep = step.target.startsWith('nav-');
  const usesDrawer = isNavStep && typeof window !== 'undefined' && window.innerWidth < 1024;

  // Close the drawer once the tour ends, whatever step it ended on.
  useEffect(() => {
    return () => {
      window.dispatchEvent(new Event('shade:close-nav'));
    };
  }, []);

  useLayoutEffect(() => {
    window.dispatchEvent(new Event(usesDrawer ? 'shade:open-nav' : 'shade:close-nav'));

    const measure = () => {
      // The rail is mounted twice (desktop rail + mobile drawer); one copy is
      // always `display:none` and reports a zero-size rect. Pick the visible one.
      const els = document.querySelectorAll<HTMLElement>(`[data-tour="${step.target}"]`);
      const el = Array.from(els).find((e) => e.getClientRects().length > 0) ?? els[0] ?? null;
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    // The drawer slides in over ~200ms — keep re-measuring until it settles.
    const raf = requestAnimationFrame(measure);
    const settle = window.setTimeout(measure, 260);
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(settle);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step.target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip();
      if (e.key === 'ArrowRight' || e.key === 'Enter') (step.final ? onFinish : onNext)();
      if (e.key === 'ArrowLeft') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step.final, onFinish, onNext, onBack, onSkip]);

  // Place the bubble: to the right of left-rail targets, below header targets.
  const pad = 6;
  const bubbleWidth = Math.min(320, window.innerWidth - 24);
  // On phones there's no room beside a target, so pin the bubble to the bottom
  // centre — a common coachmark spot that can never overflow the viewport.
  const phone = window.innerWidth < 640;
  const centeredBottom: React.CSSProperties = {
    left: (window.innerWidth - bubbleWidth) / 2,
    bottom: 16,
  };
  const inRail = rect ? rect.left < 210 : true;
  const bubbleStyle: React.CSSProperties = phone
    ? centeredBottom
    : rect
      ? inRail
        ? { top: Math.min(rect.top, window.innerHeight - 240), left: rect.left + rect.width + 16 }
        : {
            top: rect.top + rect.height + 12,
            left: Math.min(Math.max(12, rect.left), window.innerWidth - bubbleWidth - 12),
          }
      : { top: 120, left: window.innerWidth / 2 - bubbleWidth / 2 };

  return (
    <Portal>
      {/* Click-catcher: clicking outside the coachmark skips (like most product
          tours). Transparent — the spotlight ring below carries the dimming. */}
      <div
        className={`fixed inset-0 z-[60] ${rect ? '' : 'bg-black/60'}`}
        onClick={onSkip}
      />

      {rect && (
        /* Spotlight: the ring's giant shadow dims everything EXCEPT the target,
           and the ring glides between targets as the step changes. */
        <div
          className="pointer-events-none fixed z-[61] rounded-[3px] ring-2 ring-copper-500 transition-all duration-300 ease-out motion-reduce:transition-none"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.62)',
          }}
        />
      )}

      <div
        className="fixed z-[62] w-[min(320px,calc(100vw-1.5rem))] border border-ink-600 bg-ink-850 p-4 shadow-2xl shadow-black/50 transition-all duration-300 ease-out motion-reduce:transition-none"
        style={bubbleStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          {/* Progress as the brand's squares: filled = seen, hollow = ahead. */}
          <div
            className="flex items-center gap-1.5"
            role="img"
            aria-label={`Step ${index + 1} of ${total}`}
          >
            {Array.from({ length: total }, (_, i) => (
              <span
                key={i}
                className={
                  i < index
                    ? 'size-1.5 bg-copper-600/50'
                    : i === index
                      ? 'size-1.5 bg-copper-500'
                      : 'size-1.5 border border-ink-600'
                }
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onSkip}
            className="text-ink-500 hover:text-ink-100"
            aria-label="Skip tutorial"
          >
            <X className="size-3.5" />
          </button>
        </div>
        <h3 className="text-sm font-semibold text-ink-50">{step.title}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-400">{step.body}</p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-ink-500 hover:text-ink-200"
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            {index > 0 && (
              <Button size="sm" variant="ghost" onClick={onBack}>
                Back
              </Button>
            )}
            {step.final ? (
              <Button size="sm" variant="primary" icon={<PlayCircle className="size-3.5" />} onClick={onFinish}>
                See the demo
              </Button>
            ) : (
              <Button size="sm" variant="primary" icon={<ArrowRight className="size-3.5" />} onClick={onNext}>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used inside <TourProvider>.');
  return ctx;
}
