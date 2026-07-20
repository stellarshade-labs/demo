import { useState } from 'react';
import { AtSign, Check, KeyRound, Loader2, Send, ShieldQuestion, UserX } from 'lucide-react';
import { stealthClient, DELIVERY_METHOD } from '@/lib/shade';
import { toUserMessage } from '@/lib/errors';
import { truncateMeta } from '@/lib/format';
import { useWallet } from '@/wallet/WalletProvider';
import { useSession } from '@/store/session';
import { Panel, Well } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Tabs } from '@/components/ui/Tabs';
import { Notice, TxResult } from '@/components/ui/Status';
import { useRecipientResolver, type SendMode } from './useRecipientResolver';

export function SendPage() {
  const { address, status, signTransaction, networkMismatch } = useWallet();
  const sendMode = useSession((s) => s.sendMode);
  const setSendMode = useSession((s) => s.setSendMode);
  const addTx = useSession((s) => s.addTx);
  const updateTx = useSession((s) => s.updateTx);

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<
    { status: 'success' | 'error'; message: string; txHash?: string } | null
  >(null);

  const resolution = useRecipientResolver(recipient, sendMode);
  const connected = status === 'connected' && Boolean(address);

  const parsedAmount = Number.parseFloat(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const canSubmit =
    connected && resolution.state === 'resolved' && amountValid && !submitting && !networkMismatch;

  const handleModeChange = (mode: SendMode) => {
    setSendMode(mode);
    setRecipient('');
    setResult(null);
  };

  const handleSend = async () => {
    if (resolution.state !== 'resolved' || !address) return;

    setSubmitting(true);
    setResult(null);

    const txId = addTx({
      kind: 'send',
      status: 'pending',
      amount: parsedAmount,
      asset: 'XLM',
      counterparty: recipient.trim(),
    });

    try {
      // Both tabs land here identically — the public tab has simply resolved
      // the typed G-address into the meta-address the recipient published.
      const receipt = await stealthClient.send(
        resolution.metaAddress,
        parsedAmount,
        // With an external signer the SDK expects the sender's PUBLIC key where
        // a secret would otherwise go.
        address,
        { method: DELIVERY_METHOD, signTransaction },
      );

      updateTx(txId, {
        status: 'success',
        txHash: receipt.txHash,
        stealthAddress: receipt.stealthAddress,
      });
      setResult({
        status: 'success',
        message: `Sent ${parsedAmount} XLM to a one-time stealth address.`,
        txHash: receipt.txHash,
      });
      setAmount('');
      setRecipient('');
    } catch (err) {
      const message = toUserMessage(err);
      updateTx(txId, { status: 'error', error: message });
      setResult({ status: 'error', message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink-50">Send privately</h1>
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-400">
            Funds go to a fresh one-time address derived for this transfer. Nothing on-chain links
            it back to the recipient's account.
          </p>
        </div>

        <Panel bodyClassName="">
          <Tabs<SendMode>
            value={sendMode}
            onChange={handleModeChange}
            items={[
              { value: 'public', label: 'Public address', icon: <AtSign className="size-3.5" /> },
              { value: 'meta', label: 'Meta-address', icon: <KeyRound className="size-3.5" /> },
            ]}
          />

          <div className="space-y-5 p-5">
            {sendMode === 'public' ? (
              <Field
                label="Recipient account"
                placeholder="GABC…"
                mono
                autoComplete="off"
                spellCheck={false}
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                error={resolution.state === 'invalid' ? resolution.message : null}
                hint="We look up the meta-address this account published on-chain."
              />
            ) : (
              <Field
                label="Recipient meta-address"
                placeholder="shade:stellar:…"
                mono
                autoComplete="off"
                spellCheck={false}
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                error={resolution.state === 'invalid' ? resolution.message : null}
                hint="Shared with you directly by the recipient — no lookup needed."
              />
            )}

            <ResolutionStatus resolution={resolution} mode={sendMode} />

            <Field
              label="Amount"
              placeholder="0.00"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.0000001"
              mono
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              adornment={<span className="font-mono text-xs text-ink-400">XLM</span>}
              hint="Native XLM, routed through the Shade pool contract."
            />

            {!connected && (
              <Notice tone="info">Connect a wallet to send.</Notice>
            )}

            <Button
              variant="primary"
              className="w-full"
              disabled={!canSubmit}
              loading={submitting}
              icon={<Send className="size-4" />}
              onClick={handleSend}
            >
              {submitting ? 'Confirm in your wallet…' : 'Send'}
            </Button>

            {result && (
              <TxResult
                status={result.status}
                message={result.message}
                txHash={result.txHash}
                onDismiss={() => setResult(null)}
              />
            )}
          </div>
        </Panel>
      </div>

      <aside className="space-y-5">
        <Panel eyebrow="How it works" title="This transfer">
          <ol className="space-y-4 text-[13px] leading-relaxed text-ink-300">
            <Step n={1} label="Resolve">
              {sendMode === 'public'
                ? "Read the recipient's published meta-address from their account."
                : 'Use the meta-address you were given directly.'}
            </Step>
            <Step n={2} label="Derive">
              Generate a random ephemeral key and combine it with the meta-address to compute a
              one-time stealth address only the recipient can spend from.
            </Step>
            <Step n={3} label="Deposit">
              Send the funds into the pool contract against that stealth address, publishing the
              ephemeral key so the recipient can find it.
            </Step>
            <Step n={4} label="Scan">
              The recipient's view key detects the payment. Nobody else can tell it was for them.
            </Step>
          </ol>
        </Panel>

        <Panel eyebrow="Delivery" title="Pool method">
          <p className="text-[13px] leading-relaxed text-ink-400">
            Value is held by the Soroban stealth-pool contract until claimed, so no new Stellar
            account has to be created and funded per payment.
          </p>
        </Panel>
      </aside>
    </div>
  );
}

function Step({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="mt-px flex size-5 shrink-0 items-center justify-center border border-ink-600 font-mono text-[10px] text-ink-400">
        {n}
      </span>
      <div>
        <span className="font-medium text-ink-100">{label}. </span>
        {children}
      </div>
    </li>
  );
}

function ResolutionStatus({
  resolution,
  mode,
}: {
  resolution: ReturnType<typeof useRecipientResolver>;
  mode: SendMode;
}) {
  if (resolution.state === 'idle' || resolution.state === 'invalid') return null;

  if (resolution.state === 'resolving') {
    return (
      <Well className="flex items-center gap-2.5 text-[13px] text-ink-400">
        <Loader2 className="size-3.5 animate-spin text-copper-400" />
        Looking up published meta-address…
      </Well>
    );
  }

  if (resolution.state === 'resolved') {
    return (
      <Well className="flex items-start gap-2.5">
        <Check className="mt-0.5 size-3.5 shrink-0 text-signal-ok" />
        <div className="min-w-0 text-[13px]">
          <div className="text-ink-100">
            {mode === 'public' ? 'Recipient is registered' : 'Meta-address accepted'}
          </div>
          <div className="mt-0.5 truncate font-mono text-xs text-ink-400">
            {truncateMeta(resolution.metaAddress)}
          </div>
        </div>
      </Well>
    );
  }

  if (resolution.state === 'no-account') {
    return (
      <Notice>
        This account doesn't exist on this network yet. It needs to be funded before it can receive
        anything.
      </Notice>
    );
  }

  if (resolution.state === 'unregistered') {
    return (
      <Notice>
        <div className="flex items-start gap-2">
          <UserX className="mt-0.5 size-3.5 shrink-0" />
          <div>
            <strong className="font-semibold">Not registered with Shade.</strong> This account has
            not published a meta-address, so a stealth address can't be derived for it. Ask them to
            open Receive and publish theirs — or switch to the Meta-address tab if they sent you one
            directly.
          </div>
        </div>
      </Notice>
    );
  }

  return (
    <Notice>
      <div className="flex items-start gap-2">
        <ShieldQuestion className="mt-0.5 size-3.5 shrink-0" />
        <span>{resolution.message}</span>
      </div>
    </Notice>
  );
}
