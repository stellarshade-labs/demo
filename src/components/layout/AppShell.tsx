import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Check,
  ChevronDown,
  Dice5,
  History,
  Inbox,
  KeyRound,
  Lock,
  Plus,
  Send,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { NETWORK } from '@/config/network';
import { useServiceHealth } from '@/lib/useServiceHealth';
import { useWallet } from '@/wallet/WalletProvider';
import { useIdentity } from '@/identity/IdentityProvider';
import type { IdentitySource } from '@/identity/identityCrypto';
import type { PublicIdentity } from '@/identity/identityStore';
import { AddIdentityModal } from '@/features/onboarding/AddIdentityModal';
import { truncateMeta } from '@/lib/format';
import { ConnectButton } from '@/components/wallet/ConnectButton';
import { StatusDot } from '@/components/ui/Status';
import { ThemeToggle } from '@/theme/ThemeToggle';
import { ShadeMark } from './ShadeMark';

const NAV = [
  { to: '/send', label: 'Send', Icon: Send, tour: 'nav-send' },
  { to: '/receive', label: 'Receive', Icon: Inbox, tour: 'nav-receive' },
  { to: '/history', label: 'History', Icon: History, tour: 'nav-history' },
  { to: '/settings', label: 'Settings', Icon: Settings, tour: 'nav-settings' },
  { to: '/demo', label: 'Demo', Icon: Sparkles, tour: 'nav-demo' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const health = useServiceHealth();
  const { networkMismatch } = useWallet();
  const { lock } = useIdentity();

  return (
    <div className="flex min-h-screen bg-ink-950">
      {/* Left rail — persistent, never collapses into a hamburger on desktop. */}
      <aside className="sticky top-0 flex h-screen w-[188px] shrink-0 flex-col border-r border-ink-700 bg-ink-950 max-lg:w-[60px]">
        <div className="flex h-14 items-center gap-2.5 border-b border-ink-700 px-4">
          <ShadeMark className="size-5 shrink-0 text-copper-500" />
          <span className="text-[15px] font-bold tracking-tight text-ink-50 max-lg:hidden">
            Shade
          </span>
        </div>

        <nav className="flex flex-col py-3">
          {NAV.map(({ to, label, Icon, tour }) => (
            <NavLink
              key={to}
              to={to}
              data-tour={tour}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium transition-colors max-lg:justify-center ${
                  isActive
                    ? 'text-ink-50 before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:bg-copper-500'
                    : 'text-ink-400 hover:text-ink-100'
                }`
              }
            >
              <Icon className="size-4 shrink-0" />
              <span className="max-lg:hidden">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t border-ink-700 p-4 max-lg:hidden">
          <div className="label-eyebrow mb-2.5">Services</div>
          <ServiceRow
            name="Relayer"
            state={health.relayer}
            href={NETWORK.relayerUrl}
          />
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
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-ink-700 bg-ink-950/95 px-6 backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <NetworkBadge />
            <span className="truncate font-mono text-xs text-ink-500 max-md:hidden">
              {NETWORK.contractId}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <IdentitySwitcher />
            <ThemeToggle />
            <button
              type="button"
              onClick={lock}
              data-tour="lock"
              aria-label="Lock identity"
              title="Lock identity"
              className="inline-flex size-8 items-center justify-center rounded-[3px] border border-ink-600 text-ink-300 transition-colors hover:border-ink-400 hover:text-ink-50"
            >
              <Lock className="size-4" />
            </button>
            <ConnectButton />
          </div>
        </header>

        {networkMismatch && (
          <div className="border-b border-signal-wait/30 bg-signal-wait/5 px-6 py-2.5 text-[13px] text-signal-wait">
            Your wallet is on a different network than this app ({NETWORK.label}). Switch networks
            in your wallet before sending.
          </div>
        )}

        <main className="mx-auto w-full max-w-[1180px] flex-1 px-6 py-8">{children}</main>

        <footer className="border-t border-ink-700 px-6 py-4 text-xs text-ink-600">
          Demo build against Shade on {NETWORK.label}. The protocol's cryptography is pending
          external audit — do not use it with real value.
        </footer>
      </div>
    </div>
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
          className="absolute right-0 top-full z-40 mt-1.5 w-64 border border-ink-700 bg-ink-900 py-1 shadow-lg"
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

export function NetworkBadge() {
  return (
    <span
      className={`inline-flex items-center gap-1.5 border px-2 py-1 text-[11px] font-semibold uppercase tracking-wider ${
        NETWORK.isTestnet
          ? 'border-copper-600/40 bg-copper-600/10 text-copper-300'
          : 'border-signal-ok/40 bg-signal-ok/10 text-signal-ok'
      }`}
    >
      <StatusDot state={NETWORK.isTestnet ? 'wait' : 'ok'} />
      {NETWORK.label}
    </span>
  );
}
