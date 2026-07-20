import { Dice5, Globe, KeyRound, RefreshCw, Trash2, Wallet } from 'lucide-react';
import { NETWORK } from '@/config/network';
import { truncate } from '@/lib/format';
import { useIdentity } from '@/identity/IdentityProvider';
import { useIdentityStore } from '@/identity/identityStore';
import { usePublish } from '@/identity/usePublish';
import { useScan } from '@/stealth/useScan';
import { Panel, Well } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { CopyField } from '@/components/ui/CopyField';
import { Notice, TxResult } from '@/components/ui/Status';
import { ClaimList } from './ClaimList';

const SOURCE_META = {
  wallet: { Icon: Wallet, label: 'Wallet-derived' },
  mnemonic: { Icon: KeyRound, label: 'Recovery phrase' },
  random: { Icon: Dice5, label: 'Random' },
} as const;

export function ReceivePage() {
  const { keys, metaAddress, payoutAddress, payoutSecret, source } = useIdentity();
  const settings = useIdentityStore((s) => s.settings);
  const pub = usePublish();

  const scan = useScan(payoutAddress, keys, { auto: settings.autoScanOnOpen });

  const sourceMeta = source ? SOURCE_META[source] : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink-50">Receive</h1>
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-400">
            Share your meta-address, or publish it so anyone can pay you by your public address.
            Payments land at one-time addresses only you can find.
          </p>
        </div>

        <Panel
          eyebrow="Your identity"
          title="Meta-address"
          action={
            <span
              className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                pub.publishState === 'published'
                  ? 'border-signal-ok/40 bg-signal-ok/10 text-signal-ok'
                  : 'border-ink-600 text-ink-400'
              }`}
            >
              {pub.publishState === 'published' ? 'On-chain' : 'Private'}
            </span>
          }
        >
          <p className="mb-3 text-[13px] leading-relaxed text-ink-400">
            Share this with anyone who wants to pay you. It reveals nothing about the payments you
            receive.
          </p>
          <div data-tour="meta-address">
            <CopyField value={metaAddress ?? ''} />
          </div>

          <div className="mt-5 border-t border-ink-700 pt-5" data-tour="publish">
            <div className="label-eyebrow mb-2">Reachable by public address</div>
            <p className="mb-3 text-[13px] leading-relaxed text-ink-400">
              Publishing writes your meta-address (and preferred method,{' '}
              <span className="font-mono">{settings.receiveMethod}</span>) to your account so senders
              can just type{' '}
              <span className="font-mono text-ink-300">{payoutAddress?.slice(0, 6)}…</span>. It locks
              0.5 XLM as reserve, refunded if you remove it.
            </p>

            {!pub.canManage && (
              <div className="mb-3">
                <Notice tone="info">
                  {source === 'wallet'
                    ? 'Connect your wallet to publish or manage your address.'
                    : 'Your payout account needs a little XLM before you can publish. Fund it, then come back.'}
                </Notice>
              </div>
            )}

            {pub.publishState === 'published' ? (
              <div className="flex flex-wrap items-center gap-3">
                <Well className="flex-1 text-[13px] text-signal-ok">
                  Published under <span className="font-mono">{NETWORK.metaDataKey}</span>
                </Well>
                <Button
                  variant="danger"
                  size="sm"
                  disabled={!pub.canManage}
                  loading={pub.busy}
                  icon={<Trash2 className="size-3.5" />}
                  onClick={() => void pub.unpublish()}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <Button
                variant="primary"
                disabled={!pub.canManage}
                loading={pub.busy}
                icon={<Globe className="size-4" />}
                onClick={() => void pub.publish()}
              >
                Publish meta-address
              </Button>
            )}

            {pub.result && (
              <div className="mt-4">
                <TxResult
                  status={pub.result.status}
                  message={pub.result.message}
                  txHash={pub.result.txHash}
                  onDismiss={() => pub.setResult(null)}
                />
              </div>
            )}
          </div>
        </Panel>

        <Panel
          eyebrow="Incoming"
          title="Detected payments"
          action={
            <Button
              variant="ghost"
              size="sm"
              loading={scan.loading}
              icon={<RefreshCw className="size-3.5" />}
              onClick={() => void scan.scan()}
            >
              {settings.autoScanOnOpen ? 'Rescan' : 'Scan'}
            </Button>
          }
          bodyClassName=""
        >
          <div data-tour="scan">
            <ClaimList scan={scan} />
          </div>
        </Panel>
      </div>

      <aside className="space-y-5">
        <Panel eyebrow="Identity" title="This identity">
          <dl className="space-y-3.5 text-[13px]">
            <InfoRow label="Source">
              <span className="inline-flex items-center gap-1.5 text-ink-100">
                {sourceMeta && <sourceMeta.Icon className="size-3.5 text-copper-400" />}
                {sourceMeta?.label ?? '—'}
              </span>
            </InfoRow>
            <InfoRow label="Payout account">
              <span className="font-mono text-ink-300">{truncate(payoutAddress, 6, 4)}</span>
            </InfoRow>
            <InfoRow label="Spend & view keys">
              <span className="font-medium text-copper-300">Encrypted at rest</span>
            </InfoRow>
            <InfoRow label="Detected payments">
              <span className="font-medium text-copper-300">Encrypted (AES-GCM)</span>
            </InfoRow>
          </dl>
          <p className="mt-4 border-t border-ink-700 pt-4 text-xs leading-relaxed text-ink-500">
            Your identity is sealed with your passphrase and unlocked here for 6 hours of use. Lock
            it anytime from the header.
          </p>
        </Panel>

        {payoutSecret && (
          <Panel eyebrow="Claiming" title="No wallet needed">
            <p className="text-[13px] leading-relaxed text-ink-400">
              This identity claims to a payout account derived from your keys. When the relayer is
              available it sponsors the fee, so you can receive without connecting a wallet at all.
            </p>
          </Panel>
        )}
      </aside>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-400">{label}</dt>
      <dd className="min-w-0 truncate text-right">{children}</dd>
    </div>
  );
}
