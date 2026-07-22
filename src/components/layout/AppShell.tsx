import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Dice5,
  History,
  Inbox,
  KeyRound,
  Lock,
  Menu,
  Plus,
  Send,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Wallet,
  X,
} from 'lucide-react';
import { NETWORK } from '@/config/network';
import { useServiceHealth } from '@/lib/useServiceHealth';
import { useWallet } from '@/wallet/WalletProvider';
import { useIdentity } from '@/identity/IdentityProvider';
import { useSession } from '@/store/session';
import type { IdentitySource } from '@/identity/identityCrypto';
import type { PublicIdentity } from '@/identity/identityStore';
import { AddIdentityModal } from '@/features/onboarding/AddIdentityModal';
import { truncateMeta } from '@/lib/format';
import { ConnectButton } from '@/components/wallet/ConnectButton';
import { Portal } from '@/components/ui/Portal';
import { StatusDot } from '@/components/ui/Status';
import { ThemeToggle } from '@/theme/ThemeToggle';
import { ShadeMark } from './ShadeMark';
import { useScanContext } from '@/stealth/ScanProvider';

const NAV = [
  { to: '/send', label: 'Send', Icon: Send, tour: 'nav-send' },
  { to: '/receive', label: 'Receive', Icon: Inbox, tour: 'nav-receive' },
  { to: '/history', label: 'History', Icon: History, tour: 'nav-history' },
  { to: '/settings', label: 'Settings', Icon: Settings, tour: 'nav-settings' },
  { to: '/demo', label: 'Demo', Icon: Sparkles, tour: 'nav-demo' },
];

export function AppShell({ children, sendOnly = false }: { children: ReactNode; sendOnly?: boolean }) {
  const health = useServiceHealth();
  const { networkMismatch } = useWallet();
  const { lock } = useIdentity();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  // The drawer is a navigation surface: any route change means it has done its
  // job and should get out of the way.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);

  // While the mobile drawer is open, lock the page behind it and let Escape close
  // it — the same overlay conventions the modals use.
  useEffect(() => {
    if (!navOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setNavOpen(false);
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [navOpen]);

  // The guided tour highlights nav items that live inside the drawer on mobile;
  // let it pop the drawer open (and shut) for those steps.
  useEffect(() => {
    const open = () => setNavOpen(true);
    const close = () => setNavOpen(false);
    window.addEventListener('shade:open-nav', open);
    window.addEventListener('shade:close-nav', close);
    return () => {
      window.removeEventListener('shade:open-nav', open);
      window.removeEventListener('shade:close-nav', close);
    };
  }, []);

  return (
    <div className="flex min-h-screen bg-ink-950">
      {/* Desktop rail — persistent from lg up; below that it becomes the drawer. */}
      <aside className="hidden w-[188px] shrink-0 border-r border-ink-700 bg-ink-950 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <RailContent health={health} sendOnly={sendOnly} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-clip">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b border-ink-700 bg-ink-950/95 px-4 backdrop-blur sm:gap-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setNavOpen(true)}
              aria-label="Open menu"
              aria-expanded={navOpen}
              aria-controls="mobile-nav"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-[3px] border border-ink-600 text-ink-300 transition-colors hover:border-ink-400 hover:text-ink-50 lg:hidden"
            >
              <Menu className="size-4" />
            </button>
            <span className="truncate font-mono text-xs text-ink-500 max-md:hidden">
              {NETWORK.contractId}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            {/* Identity chrome only makes sense with a vault. In send-only mode
                there's none, so hide the switcher and lock button. */}
            {!sendOnly && <IdentitySwitcher />}
            <ThemeToggle />
            {!sendOnly && (
              <button
                type="button"
                onClick={lock}
                data-tour="lock"
                aria-label="Lock identity"
                title="Lock identity"
                className="inline-flex size-9 items-center justify-center rounded-[3px] border border-ink-600 text-ink-300 transition-colors hover:border-ink-400 hover:text-ink-50 sm:size-8"
              >
                <Lock className="size-4" />
              </button>
            )}
            <ConnectButton />
          </div>
        </header>

        {networkMismatch && (
          <div className="border-b border-signal-wait/30 bg-signal-wait/5 px-4 py-2.5 text-[13px] text-signal-wait sm:px-6">
            Your wallet is on a different network than this app ({NETWORK.label}). Switch networks
            in your wallet before sending.
          </div>
        )}

        <main
          key={location.pathname}
          className="animate-shade-rise mx-auto w-full max-w-[1180px] flex-1 px-4 py-6 sm:px-6 sm:py-8"
        >
          {children}
        </main>

        <footer className="border-t border-ink-700 px-4 py-4 text-xs text-ink-600 sm:px-6">
          Demo build against Shade on {NETWORK.label}. The protocol's cryptography is pending
          external audit, so do not use it with real value.
        </footer>
      </div>

      {/* Mobile nav drawer — portaled to the body so the header's backdrop-blur
          can't clamp its fixed positioning. Hidden entirely at lg. */}
      <Portal>
        <div id="mobile-nav" className="lg:hidden">
          <div
            onClick={() => setNavOpen(false)}
            className={`fixed inset-0 z-40 bg-ink-950/80 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none ${
              navOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          />
          <aside
            className={`fixed inset-y-0 left-0 z-50 flex w-64 max-w-[80vw] flex-col border-r border-ink-700 bg-ink-950 transition-transform duration-200 ease-out motion-reduce:transition-none ${
              navOpen ? 'translate-x-0' : '-translate-x-full'
            }`}
          >
            <RailContent
              health={health}
              sendOnly={sendOnly}
              onNavigate={() => setNavOpen(false)}
              onClose={() => setNavOpen(false)}
            />
          </aside>
        </div>
      </Portal>
    </div>
  );
}

/**
 * The rail's contents — logo, primary nav, and service health — shared by the
 * persistent desktop rail and the mobile drawer. `useServiceHealth` stays in the
 * shell and is passed in so the two mounted copies don't each start a poll.
 */
function RailContent({
  health,
  sendOnly = false,
  onNavigate,
  onClose,
}: {
  health: ReturnType<typeof useServiceHealth>;
  sendOnly?: boolean;
  onNavigate?: () => void;
  onClose?: () => void;
}) {
  // Send-only mode has no vault (and no scan engine), so only Send is reachable.
  const nav = sendOnly ? NAV.filter((item) => item.to === '/send') : NAV;
  return (
    <>
      <div className="flex h-14 items-center gap-2.5 border-b border-ink-700 px-4">
        <Link
          to="/"
          onClick={onNavigate}
          aria-label="Shade home"
          className="flex items-center gap-2.5 rounded-[3px] outline-none focus-visible:ring-2 focus-visible:ring-copper-500"
        >
          {/* The mark breathes while the scan engine is combing ledgers. There's
              no scan engine (or ScanProvider) in send-only, so show it static. */}
          {sendOnly ? (
            <ShadeMark className="size-5 shrink-0 text-copper-500" />
          ) : (
            <ScanningMark />
          )}
          <span className="text-[15px] font-bold tracking-tight text-ink-50">Shade</span>
        </Link>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="ml-auto inline-flex size-8 items-center justify-center rounded-[3px] text-ink-400 transition-colors hover:text-ink-50"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <nav className="flex flex-col py-3">
        {nav.map(({ to, label, Icon, tour }) => (
          <NavLink
            key={to}
            to={to}
            data-tour={tour}
            onClick={onNavigate}
            className={({ isActive }) =>
              `relative flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium transition-colors ${
                isActive
                  ? 'bg-ink-900 text-ink-50 before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:bg-copper-500'
                  : 'text-ink-400 hover:bg-ink-900/60 hover:text-ink-100'
              }`
            }
          >
            <Icon className="size-4 shrink-0" />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto border-t border-ink-700 p-4">
        {sendOnly && <SendOnlyCta onNavigate={onNavigate} />}
        <div className="label-eyebrow mb-2.5">Services</div>
        <ServiceRow name="Relayer" state={health.relayer} href={NETWORK.relayerUrl} />
        <ServiceRow
          name="Indexer"
          state={health.indexer}
          href={NETWORK.indexerUrl}
          detail={
            health.indexerLagSeconds !== null
              ? `${Math.round(health.indexerLagSeconds)}s lag`
              : undefined
          }
        />
      </div>
    </>
  );
}

/** The logo mark, pulsing while the scan engine combs ledgers. Only mounted when
 *  a ScanProvider is present, so `useScanContext` is always safe here. */
function ScanningMark() {
  const scan = useScanContext();
  return (
    <ShadeMark
      className={`size-5 shrink-0 text-copper-500 ${scan.loading ? 'animate-shade-pulse' : ''}`}
    />
  );
}

/**
 * Send-only escape hatch: a quiet prompt to create an identity, which flips
 * `sendOnly` off and drops the user back into normal onboarding.
 */
function SendOnlyCta({ onNavigate }: { onNavigate?: () => void }) {
  const setSendOnly = useSession((s) => s.setSendOnly);
  return (
    <button
      type="button"
      onClick={() => {
        onNavigate?.();
        setSendOnly(false);
      }}
      className="mb-4 flex w-full items-start gap-2.5 rounded-[3px] border border-ink-700 bg-ink-900 p-3 text-left text-ink-300 transition-colors hover:border-copper-500/60 hover:text-ink-100"
    >
      <KeyRound className="mt-0.5 size-4 shrink-0 text-copper-400" />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink-100">Create an identity</span>
        <span className="mt-0.5 block text-[11px] leading-relaxed text-ink-500">
          to receive private payments
        </span>
      </span>
    </button>
  );
}

const SOURCE_ICON: Record<IdentitySource, typeof Wallet> = {
  wallet: Wallet,
  mnemonic: KeyRound,
  random: Dice5,
};

function identityName(identity: PublicIdentity): string {
  return identity.label?.trim() || truncateMeta(identity.metaAddress);
}

/**
 * Compact header control showing the active identity, with a dropdown to switch
 * between the vault's identities, add a new one, or jump to Settings → Identities.
 */
function IdentitySwitcher() {
  const { identities, activeId, switchIdentity } = useIdentity();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const active = identities.find((i) => i.id === activeId) ?? null;
  if (!active) return null;

  const ActiveIcon = SOURCE_ICON[active.source];

  return (
    <div ref={ref} className="relative" data-tour="identity">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch identity"
        className="inline-flex h-8 items-center gap-1.5 rounded-[3px] border border-ink-600 px-2 text-ink-200 transition-colors hover:border-ink-400 hover:text-ink-50"
      >
        <ActiveIcon className="size-3.5 shrink-0 text-copper-400" />
        <span className="max-w-[120px] truncate font-mono text-xs max-md:hidden">
          {identityName(active)}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-ink-500" />
      </button>

      {open && (
        <div
          role="menu"
          className="animate-shade-rise absolute right-0 top-full z-40 mt-1.5 w-64 max-w-[calc(100vw-1.5rem)] border border-ink-700 bg-ink-900 py-1 shadow-lg"
        >
          <div className="label-eyebrow px-3 py-1.5">Identities</div>
          <div className="max-h-64 overflow-y-auto">
            {identities.map((i) => {
              const Icon = SOURCE_ICON[i.source];
              const isActive = i.id === activeId;
              return (
                <button
                  key={i.id}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    switchIdentity(i.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-ink-850"
                >
                  <Icon className="size-3.5 shrink-0 text-copper-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink-100">
                      {i.label?.trim() || 'Unnamed identity'}
                    </span>
                    <span className="block truncate font-mono text-[11px] text-ink-500">
                      {truncateMeta(i.metaAddress)}
                    </span>
                  </span>
                  {isActive && <Check className="size-3.5 shrink-0 text-copper-400" />}
                </button>
              );
            })}
          </div>

          <div className="mt-1 border-t border-ink-700 pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                setAdding(true);
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-ink-200 transition-colors hover:bg-ink-850"
            >
              <Plus className="size-3.5 shrink-0 text-copper-400" />
              Add identity
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                navigate('/settings');
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-ink-400 transition-colors hover:bg-ink-850 hover:text-ink-100"
            >
              <SlidersHorizontal className="size-3.5 shrink-0" />
              Manage in Settings
            </button>
          </div>
        </div>
      )}

      <AddIdentityModal open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function ServiceRow({
  name,
  state,
  href,
  detail,
}: {
  name: string;
  state: 'checking' | 'ok' | 'down';
  href: string;
  detail?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-2 py-1 text-xs text-ink-400 transition-colors hover:text-ink-100"
      title={href}
    >
      <StatusDot state={state === 'checking' ? 'wait' : state === 'ok' ? 'ok' : 'bad'} />
      <span className="flex-1">{name}</span>
      {detail && <span className="font-mono text-[10px] text-ink-600">{detail}</span>}
      <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover:opacity-100" />
    </a>
  );
}
