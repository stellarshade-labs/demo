import { useCallback, useEffect, useState } from 'react';
import { Fingerprint, Globe, Lock, RefreshCw, Trash2 } from 'lucide-react';
import { NETWORK } from '@/config/network';
import { toUserMessage } from '@/lib/errors';
import {
  publishMetaAddress,
  resolveMetaAddress,
  unpublishMetaAddress,
} from '@/lib/metaRegistry';
import { useWallet } from '@/wallet/WalletProvider';
import { useStealthKeys } from '@/stealth/StealthKeysProvider';
import { useScan } from '@/stealth/useScan';
import { useSession } from '@/store/session';
import { Panel, Well } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { CopyField } from '@/components/ui/CopyField';
import { EmptyState, TxResult } from '@/components/ui/Status';
import { ClaimList } from './ClaimList';

type PublishState = 'unknown' | 'published' | 'not-published';

export function ReceivePage() {
  const { address, status, signTransaction, canDeriveKeys, connector } = useWallet();
  const { keys, unlocked, unlocking, error: keyError, unlock } = useStealthKeys();
  const addTx = useSession((s) => s.addTx);
  const updateTx = useSession((s) => s.updateTx);

  const scan = useScan(address, keys);

  const [publishState, setPublishState] = useState<PublishState>('unknown');
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState<
    { status: 'success' | 'error'; message: string; txHash?: string } | null
  >(null);

  const connected = status === 'connected' && Boolean(address);

  const refreshPublishState = useCallback(async () => {
    if (!address) return;
    try {
      const outcome = await resolveMetaAddress(address);
      setPublishState(outcome.status === 'found' ? 'published' : 'not-published');
    } catch {
      setPublishState('unknown');
    }
  }, [address]);

  useEffect(() => {
    void refreshPublishState();
  }, [refreshPublishState]);

  const handlePublish = async () => {
    if (!address || !keys) return;
    setPublishing(true);
    setResult(null);

    const txId = addTx({ kind: 'publish', status: 'pending', counterparty: address });
    try {
      const { txHash } = await publishMetaAddress(address, keys.metaAddress, signTransaction);
      updateTx(txId, { status: 'success', txHash });
      setResult({
        status: 'success',
        message: 'Meta-address published. Senders can now reach you by your public address.',
        txHash,
      });
      setPublishState('published');
    } catch (err) {
      const message = toUserMessage(err);
      updateTx(txId, { status: 'error', error: message });
      setResult({ status: 'error', message });
    } finally {
      setPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    if (!address) return;
    setPublishing(true);
    setResult(null);

    const txId = addTx({ kind: 'unpublish', status: 'pending', counterparty: address });
    try {
      const { txHash } = await unpublishMetaAddress(address, signTransaction);
      updateTx(txId, { status: 'success', txHash });
      setResult({
        status: 'success',
        message: 'Meta-address removed. Your 0.5 XLM reserve is released.',
        txHash,
      });
      setPublishState('not-published');
    } catch (err) {
      const message = toUserMessage(err);
      updateTx(txId, { status: 'error', error: message });
      setResult({ status: 'error', message });
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink-50">Receive</h1>
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-400">
            Your stealth keys are derived from a wallet signature and held only in this tab. They
            are never written to disk.
          </p>
        </div>

        {!connected ? (
          <Panel>
            <EmptyState
              icon={<Lock className="size-6" />}
              title="Connect a wallet"
              description="Your stealth identity is derived from your wallet, so there is nothing to show until one is connected."
            />
          </Panel>
        ) : !canDeriveKeys ? (
          <Panel>
            <EmptyState
              icon={<Lock className="size-6" />}
              title={`${connector?.name ?? 'This wallet'} can't sign messages`}
              description="Stealth keys are derived from a signed message. Reconnect with Freighter to receive payments — sending works on any wallet."
            />
          </Panel>
        ) : !unlocked ? (
          <Panel>
            <EmptyState
              icon={<Fingerprint className="size-6" />}
              title="Unlock your stealth identity"
              description="Sign one message to derive your spend and view keys. The same signature always produces the same identity, on any device."
              action={
                <Button variant="primary" loading={unlocking} onClick={() => void unlock()}>
                  Sign to unlock
                </Button>
              }
            />
            {keyError && (
              <div className="border-t border-signal-bad/30 bg-signal-bad/5 px-5 py-3 text-[13px] text-signal-bad">
                {keyError}
              </div>
            )}
          </Panel>
        ) : (
          <>
            <Panel
              eyebrow="Your identity"
              title="Meta-address"
              action={
                <span
                  className={`inline-flex items-center gap-1.5 border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                    publishState === 'published'
                      ? 'border-signal-ok/40 bg-signal-ok/10 text-signal-ok'
                      : 'border-ink-600 text-ink-400'
                  }`}
                >
                  {publishState === 'published' ? 'On-chain' : 'Private'}
                </span>
              }
            >
              <p className="mb-3 text-[13px] leading-relaxed text-ink-400">
                Share this with anyone who wants to pay you. It reveals nothing about the payments
                you receive.
              </p>
              <CopyField value={keys!.metaAddress} />

              <div className="mt-5 border-t border-ink-700 pt-5">
                <div className="label-eyebrow mb-2">Reachable by public address</div>
                <p className="mb-3 text-[13px] leading-relaxed text-ink-400">
                  Publishing writes your meta-address to a data entry on your own account, so
                  senders can just type{' '}
                  <span className="font-mono text-ink-300">{address?.slice(0, 6)}…</span> instead of
                  the long string above. It locks 0.5 XLM as account reserve, refunded if you
                  remove it.
                </p>

                {publishState === 'published' ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <Well className="flex-1 text-[13px] text-signal-ok">
                      Published under{' '}
                      <span className="font-mono">{NETWORK.metaDataKey}</span>
                    </Well>
                    <Button
                      variant="danger"
                      size="sm"
                      loading={publishing}
                      icon={<Trash2 className="size-3.5" />}
                      onClick={handleUnpublish}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <Button
                    variant="primary"
                    loading={publishing}
                    icon={<Globe className="size-4" />}
                    onClick={handlePublish}
                  >
                    Publish meta-address
                  </Button>
                )}

                {result && (
                  <div className="mt-4">
                    <TxResult
                      status={result.status}
                      message={result.message}
                      txHash={result.txHash}
                      onDismiss={() => setResult(null)}
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
                  Rescan
                </Button>
              }
              bodyClassName=""
            >
              <ClaimList scan={scan} />
            </Panel>
          </>
        )}
      </div>

      <aside className="space-y-5">
        <Panel eyebrow="Key handling" title="What's stored where">
          <dl className="space-y-3.5 text-[13px]">
            <StorageRow label="Spend & view keys" value="Memory only" tone="strong" />
            <StorageRow label="Public address" value="localStorage" />
            <StorageRow label="Sent transactions" value="localStorage" />
            <StorageRow label="Detected payments" value="Encrypted (AES-GCM)" tone="strong" />
          </dl>
          <p className="mt-4 border-t border-ink-700 pt-4 text-xs leading-relaxed text-ink-500">
            Detected payments link a one-time address to your identity, so they are sealed with a
            key derived from your view key. Disconnecting wipes the cache.
          </p>
        </Panel>

        {unlocked && (
          <Panel eyebrow="Derivation" title="Deterministic">
            <p className="text-[13px] leading-relaxed text-ink-400">
              Your identity comes from a signature over a fixed message, so connecting the same
              wallet on any browser recreates the same meta-address. There is no seed phrase to back
              up.
            </p>
          </Panel>
        )}
      </aside>
    </div>
  );
}

function StorageRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'strong';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-400">{label}</dt>
      <dd className={tone === 'strong' ? 'font-medium text-copper-300' : 'text-ink-300'}>
        {value}
      </dd>
    </div>
  );
}
