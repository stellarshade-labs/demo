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

  useLayoutEffect(() => {
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
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
  const bubbleWidth = 320;
  const inRail = rect ? rect.left < 210 : true;
  const bubbleStyle: React.CSSProperties = rect
    ? inRail
      ? { top: Math.min(rect.top, window.innerHeight - 240), left: rect.left + rect.width + 16 }
      : {
          top: rect.top + rect.height + 12,
          left: Math.min(Math.max(12, rect.left), window.innerWidth - bubbleWidth - 12),
        }
    : { top: 120, left: window.innerWidth / 2 - bubbleWidth / 2 };

  return (
    <Portal>
      {/* Dim everything; clicking the dim skips (like most product tours). */}
      <div className="fixed inset-0 z-[60] bg-black/60" onClick={onSkip} />

      {rect && (
        <div
          className="pointer-events-none fixed z-[61] rounded-[3px] ring-2 ring-copper-500"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.0)',
          }}
        />
      )}

      <div
        className="fixed z-[62] w-[320px] border border-ink-600 bg-ink-850 p-4 shadow-2xl shadow-black/50"
        style={bubbleStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-copper-400">
            Step {index + 1} of {total}
          </span>
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
