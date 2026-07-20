import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { ArrowUpRight, History, Inbox, Send } from 'lucide-react';
import { NETWORK } from '@/config/network';
import { useServiceHealth } from '@/lib/useServiceHealth';
import { useWallet } from '@/wallet/WalletProvider';
import { ConnectButton } from '@/components/wallet/ConnectButton';
import { StatusDot } from '@/components/ui/Status';
import { ShadeMark } from './ShadeMark';

const NAV = [
  { to: '/send', label: 'Send', Icon: Send },
  { to: '/receive', label: 'Receive', Icon: Inbox },
  { to: '/history', label: 'History', Icon: History },
];

export function AppShell({ children }: { children: ReactNode }) {
  const health = useServiceHealth();
  const { networkMismatch } = useWallet();

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
          {NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
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
          <ConnectButton />
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
