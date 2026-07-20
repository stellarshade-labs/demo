import { useState } from 'react';
import { ChevronDown, LogOut, Wallet } from 'lucide-react';
import { useWallet } from '@/wallet/WalletProvider';
import { truncate } from '@/lib/format';
import { explorerAccountUrl } from '@/config/network';
import { Button } from '@/components/ui/Button';
import { CopyButton } from '@/components/ui/CopyField';
import { Portal } from '@/components/ui/Portal';
import { WalletModal } from './WalletModal';

export function ConnectButton() {
  const { status, address, connector, disconnect } = useWallet();
  const [modalOpen, setModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  if (status === 'reconnecting') {
    return (
      <div className="flex h-8 items-center gap-2 px-3 text-[13px] text-ink-400">
        <span className="size-1.5 animate-shade-pulse rounded-full bg-signal-wait" />
        Reconnecting…
      </div>
    );
  }

  if (status !== 'connected' || !address) {
    return (
      <>
        <Button
          variant="primary"
          size="sm"
          icon={<Wallet className="size-3.5" />}
          loading={status === 'connecting'}
          onClick={() => setModalOpen(true)}
        >
          Connect wallet
        </Button>
        <WalletModal open={modalOpen} onClose={() => setModalOpen(false)} />
      </>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        className="flex h-8 items-center gap-2 border border-ink-700 bg-ink-850 px-2.5 text-[13px] transition-colors hover:border-ink-600"
      >
        {connector && <connector.Icon className="size-3.5 text-copper-400" />}
        <span className="font-mono tracking-tight text-ink-100">{truncate(address)}</span>
        <ChevronDown className="size-3.5 text-ink-500" />
      </button>

      {menuOpen && (
        <>
          {/* Portaled, or the header's backdrop-filter clamps it to the 56px
              header and clicking anywhere below it fails to dismiss the menu. */}
          <Portal>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          </Portal>
          <div className="absolute right-0 z-20 mt-1.5 w-72 border border-ink-700 bg-ink-850 shadow-xl shadow-black/40">
            <div className="border-b border-ink-700 px-4 py-3">
              <div className="label-eyebrow mb-1.5">{connector?.name ?? 'Wallet'}</div>
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-xs text-ink-300">{address}</span>
                <CopyButton value={address} />
              </div>
              <a
                href={explorerAccountUrl(address)}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-block text-xs text-ink-400 underline decoration-ink-600 underline-offset-2 hover:text-copper-400"
              >
                View on stellar.expert
              </a>
            </div>
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false);
                void disconnect();
              }}
              className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] text-ink-300 transition-colors hover:bg-ink-800 hover:text-signal-bad"
            >
              <LogOut className="size-3.5" />
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}
