import { useState } from 'react';
import { Inbox, Radio, ShieldCheck } from 'lucide-react';
import type { Payment } from 'stellar-shade';
import { stealthClient } from '@/lib/shade';
import { NETWORK } from '@/config/network';
import { toUserMessage } from '@/lib/errors';
import { assetLabel, formatAmount, timeAgo, truncate } from '@/lib/format';
import { useServiceHealth } from '@/lib/useServiceHealth';
import { useWallet } from '@/wallet/WalletProvider';
import { useStealthKeys } from '@/stealth/StealthKeysProvider';
import type { useScan } from '@/stealth/useScan';
import { useSession } from '@/store/session';
import { Button } from '@/components/ui/Button';
import { EmptyState, Skeleton, TxResult } from '@/components/ui/Status';

type ScanApi = ReturnType<typeof useScan>;

export function ClaimList({ scan }: { scan: ScanApi }) {
  const { address, signTransaction } = useWallet();
  const { keys } = useStealthKeys();
  const addTx = useSession((s) => s.addTx);
  const updateTx = useSession((s) => s.updateTx);

  const health = useServiceHealth();
  const [claiming, setClaiming] = useState<string | null>(null);
  const [relayerOptIn, setRelayerOptIn] = useState(true);
  const [result, setResult] = useState<
    { status: 'success' | 'error'; message: string; txHash?: string } | null
  >(null);

  // A credit-gated relayer needs a prepaid funding account and a signed
  // proof-of-control that this demo doesn't carry, so relaying is simply not
  // available against one — better to say so than to fail at claim time.
  const relayerAvailable = health.relayer === 'ok' && !health.relayerRequiresCredit;
  const useRelayer = relayerOptIn && relayerAvailable;

  const available = scan.payments.filter((p) => !scan.claimed.has(p.stealthAddress));

  const handleClaim = async (payment: Payment) => {
    if (!keys || !address) return;
    setClaiming(payment.stealthAddress);
    setResult(null);

    const txId = addTx({
      kind: 'claim',
      status: 'pending',
      amount: payment.amount,
      asset: assetLabel(payment),
      stealthAddress: payment.stealthAddress,
      counterparty: address,
    });

    try {
      const receipt = await stealthClient.claim(payment, address, {
        keys,
        signTransaction,
        // Pool claims need a fee payer; with a wallet signer the SDK wants the
        // fee payer's PUBLIC key here and delegates signing back to us.
        feePayerAddress: address,
        ...(useRelayer ? { relay: NETWORK.relayerUrl } : {}),
      });

      updateTx(txId, { status: 'success', txHash: receipt.txHash });
      setResult({
        status: 'success',
        message: `Claimed ${formatAmount(receipt.amount)} ${assetLabel(payment)} to your account.`,
        txHash: receipt.txHash,
      });
      scan.markClaimed(payment.stealthAddress);
    } catch (err) {
      const message = toUserMessage(err);
      updateTx(txId, { status: 'error', error: message });
      setResult({ status: 'error', message });
    } finally {
      setClaiming(null);
    }
  };

  if (scan.cold && scan.payments.length === 0) {
    return (
      <div className="space-y-px">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-[68px]" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {result && (
        <div className="p-5 pb-0">
          <TxResult
            status={result.status}
            message={result.message}
            txHash={result.txHash}
            onDismiss={() => setResult(null)}
          />
        </div>
      )}

      {scan.error && (
        <div className="border-b border-signal-bad/30 bg-signal-bad/5 px-5 py-3 text-[13px] text-signal-bad">
          {scan.error}
        </div>
      )}

      {available.length === 0 ? (
        <EmptyState
          icon={<Inbox className="size-6" />}
          title="Nothing waiting"
          description="Payments sent to your meta-address will appear here once the ledger closes. Share your meta-address or publish it to get started."
        />
      ) : (
        <ul className="divide-y divide-ink-700">
          {available.map((payment) => {
            const busy = claiming === payment.stealthAddress;
            return (
              <li
                key={`${payment.stealthAddress}:${payment.token}`}
                className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-ink-800/40"
              >
                <ShieldCheck className="size-4 shrink-0 text-copper-500" />
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-sm font-medium text-ink-50">
                    {formatAmount(payment.amount)}{' '}
                    <span className="text-ink-400">{assetLabel(payment)}</span>
                  </div>
                  <div className="mt-0.5 truncate font-mono text-xs text-ink-500">
                    at {truncate(payment.stealthAddress, 8, 6)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="primary"
                  loading={busy}
                  disabled={claiming !== null && !busy}
                  onClick={() => handleClaim(payment)}
                >
                  Claim
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-700 px-5 py-3">
        <label
          className={`flex items-center gap-2 text-xs ${
            relayerAvailable ? 'cursor-pointer text-ink-400' : 'cursor-not-allowed text-ink-600'
          }`}
          title={
            health.relayerRequiresCredit
              ? 'This relayer requires prepaid credit, which this demo does not have.'
              : health.relayer === 'ok'
                ? 'Submit via the relayer instead of paying the fee directly.'
                : 'The relayer is unreachable.'
          }
        >
          <input
            type="checkbox"
            checked={useRelayer}
            disabled={!relayerAvailable}
            onChange={(e) => setRelayerOptIn(e.target.checked)}
            className="size-3.5 accent-[#c8763c]"
          />
          <Radio className="size-3" />
          Submit through relayer
          <span className="text-ink-600">
            {health.relayerRequiresCredit
              ? '— unavailable, relayer is credit-gated'
              : health.relayer === 'down'
                ? '— unavailable, relayer unreachable'
                : '— hides your IP and fee-payer link'}
          </span>
        </label>
        <span className="font-mono text-[10px] text-ink-600">
          {scan.loading
            ? 'scanning…'
            : scan.lastSyncedAt
              ? `synced ${timeAgo(scan.lastSyncedAt)}`
              : 'not scanned'}
        </span>
      </div>
    </div>
  );
}
