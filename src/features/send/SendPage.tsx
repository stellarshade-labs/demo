import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AtSign, BookmarkPlus, Check, KeyRound, Loader2, Send, ShieldQuestion, TriangleAlert, UserX, X } from 'lucide-react';
import { stealthClient, DEFAULT_METHOD } from '@/lib/shade';
import { toUserMessage } from '@/lib/errors';
import { looksLikeMetaAddress, looksLikeStellarAddress, truncateMeta } from '@/lib/format';
import { parsePayParams, modeForRecipient } from '@/lib/paylink';
import { useWallet } from '@/wallet/WalletProvider';
import { useSession } from '@/store/session';
import type { ReceiveMethod } from '@/identity/identityStore';
import { Panel, Well } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { HelpTip } from '@/components/ui/HelpTip';
import { Tabs } from '@/components/ui/Tabs';
import { Notice, TxResult } from '@/components/ui/Status';
import { useContacts, contactKindFor, type Contact } from '@/contacts/contactsStore';
import { ContactPicker } from '@/contacts/ContactPicker';
import { useRecipientResolver, type SendMode } from './useRecipientResolver';

function isTokenAsset(asset: string): boolean {
  const a = asset.trim();
  return a !== '' && a.toUpperCase() !== 'XLM' && a.toLowerCase() !== 'native';
}

export function SendPage() {
  const { address, status, signTransaction, networkMismatch } = useWallet();
  const sendMode = useSession((s) => s.sendMode);
  const setSendMode = useSession((s) => s.setSendMode);
  const addTx = useSession((s) => s.addTx);
  const updateTx = useSession((s) => s.updateTx);

  const contacts = useContacts((s) => s.contacts);
  const addContact = useContacts((s) => s.addContact);

  const [searchParams, setSearchParams] = useSearchParams();

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [asset, setAsset] = useState('');
  const [methodOverride, setMethodOverride] = useState<ReceiveMethod | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const [result, setResult] = useState<
    { status: 'success' | 'error'; message: string; txHash?: string } | null
  >(null);

  // Pay-link prefill: apply `?to=…&amount=…&asset=…` once on mount, then strip
  // the params so a later refresh doesn't re-lock the form or fight edits.
  const prefillApplied = useRef(false);
  useEffect(() => {
    if (prefillApplied.current) return;
    prefillApplied.current = true;
    const params = parsePayParams(searchParams);
    if (!params) return;
    setSendMode(modeForRecipient(params.to));
    setRecipient(params.to);
    if (params.amount) setAmount(params.amount);
    if (params.asset) setAsset(params.asset);
    // A pay-link can carry the recipient's method (a meta-address has no
    // on-chain entry to resolve it from), so honour it as the override.
    setMethodOverride(params.method ?? null);
    setPrefilled(true);
    setSearchParams({}, { replace: true });
    // Run once on mount only; deliberately ignore later param/setter changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resolution = useRecipientResolver(recipient, sendMode);
  const connected = status === 'connected' && Boolean(address);

  const trimmedRecipient = recipient.trim();
  const recipientValidAddress =
    looksLikeStellarAddress(trimmedRecipient) || looksLikeMetaAddress(trimmedRecipient);
  const alreadySaved = contacts.some((c) => c.address === trimmedRecipient);
  const canSaveRecipient = recipientValidAddress && !alreadySaved;

  const handlePickContact = (contact: Contact) => {
    setSendMode(contact.kind);
    setRecipient(contact.address);
    setMethodOverride(null);
    setResult(null);
  };

  const handleSaveRecipient = () => {
    const label = window.prompt('Save this recipient as…', '');
    if (label === null) return;
    addContact({
      label: label.trim(),
      address: trimmedRecipient,
      kind: contactKindFor(trimmedRecipient),
    });
  };

  const parsedAmount = Number.parseFloat(amount);
  const amountValid = Number.isFinite(parsedAmount) && parsedAmount > 0;
  const token = isTokenAsset(asset);
  const assetCode = token ? asset.trim() : 'XLM';

  // The receiver chose the method; the sender only overrides when the account
  // method would cost them the 1.5 XLM account-funding (token case).
  const resolvedMethod: ReceiveMethod =
    resolution.state === 'resolved' ? resolution.method : DEFAULT_METHOD;
  const effectiveMethod: ReceiveMethod = methodOverride ?? resolvedMethod;

  const accountTokenWarning =
    resolution.state === 'resolved' && effectiveMethod === 'account' && token;
  // The account method funds a classic native payment; the SDK enforces > 1 XLM.
  const accountNativeTooLow =
    resolution.state === 'resolved' && effectiveMethod === 'account' && !token && parsedAmount <= 1;

  const canSubmit =
    connected &&
    resolution.state === 'resolved' &&
    amountValid &&
    !accountNativeTooLow &&
    !submitting &&
    !networkMismatch;

  const resetForm = () => {
    setRecipient('');
    setAmount('');
    setAsset('');
    setMethodOverride(null);
  };

  const handleModeChange = (mode: SendMode) => {
    setSendMode(mode);
    resetForm();
    setResult(null);
    setPrefilled(false);
  };

  const handleSend = async (method: ReceiveMethod = effectiveMethod) => {
    if (resolution.state !== 'resolved' || !address) return;

    setSubmitting(true);
    setResult(null);

    const txId = addTx({
      kind: 'send',
      status: 'pending',
      amount: parsedAmount,
      asset: assetCode,
      counterparty: recipient.trim(),
    });

    try {
      const receipt = await stealthClient.send(
        resolution.metaAddress,
        parsedAmount,
        // With an external signer the SDK expects the sender's PUBLIC key where
        // a secret would otherwise go.
        address,
        {
          method,
          ...(token ? { asset: assetCode } : {}),
          signTransaction,
        },
      );

      updateTx(txId, {
        status: 'success',
        txHash: receipt.txHash,
        stealthAddress: receipt.stealthAddress,
      });
      setResult({
        status: 'success',
        message: `Sent ${parsedAmount} ${assetCode} to a one-time stealth address via ${method}.`,
        txHash: receipt.txHash,
      });
      resetForm();
    } catch (err) {
      const message = toUserMessage(err);
      updateTx(txId, { status: 'error', error: message });
      setResult({ status: 'error', message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-ink-50 sm:text-xl">Send privately</h1>
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

          <div className="space-y-5 p-5" data-tour="send-form">
            {prefilled && (
              <div className="flex items-center justify-between gap-3 border border-copper-500/40 bg-copper-500/5 px-3 py-2 text-[13px] text-copper-300">
                <span>Prefilled from a payment link.</span>
                <button
                  type="button"
                  onClick={() => setPrefilled(false)}
                  className="shrink-0 text-copper-400/70 hover:text-copper-300"
                  aria-label="Dismiss"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="label-eyebrow">
                  {sendMode === 'public' ? 'Recipient account' : 'Recipient meta-address'}
                </span>
                <div className="flex items-center gap-2">
                  {canSaveRecipient && (
                    <button
                      type="button"
                      onClick={handleSaveRecipient}
                      className="flex h-8 items-center gap-1.5 border border-ink-700 bg-ink-850 px-2.5 text-[13px] text-ink-300 transition-colors hover:border-ink-600 hover:text-ink-100"
                    >
                      <BookmarkPlus className="size-3.5 text-copper-400" />
                      Save
                    </button>
                  )}
                  <ContactPicker onPick={handlePickContact} />
                </div>
              </div>

              {sendMode === 'public' ? (
                <Field
                  label="Recipient account"
                  id="send-recipient"
                  placeholder="GABC…"
                  mono
                  autoComplete="off"
                  spellCheck={false}
                  value={recipient}
                  onChange={(e) => {
                    setRecipient(e.target.value);
                    setMethodOverride(null);
                  }}
                  error={resolution.state === 'invalid' ? resolution.message : null}
                  hint="We look up the meta-address this account published on-chain."
                  className="[&>label]:sr-only"
                />
              ) : (
                <Field
                  label="Recipient meta-address"
                  id="send-recipient"
                  placeholder="shade:stellar:…"
                  mono
                  autoComplete="off"
                  spellCheck={false}
                  value={recipient}
                  onChange={(e) => {
                    setRecipient(e.target.value);
                    setMethodOverride(null);
                  }}
                  error={resolution.state === 'invalid' ? resolution.message : null}
                  hint="Shared with you directly by the recipient — no lookup needed. Delivers via pool unless you opened a pay-link."
                  className="[&>label]:sr-only"
                />
              )}
            </div>

            <ResolutionStatus resolution={resolution} mode={sendMode} method={effectiveMethod} />

            {resolution.state === 'resolved' && (
              <div>
                <div className="mb-2 flex items-center gap-1.5">
                  <span className="label-eyebrow">Delivery method</span>
                  <HelpTip label="Delivery method">
                    How the funds reach the recipient. This starts from their preference, but you
                    can change it.
                    <br />
                    <br />
                    <strong>Pool:</strong> value sits in the stealth-pool contract until they claim —
                    private, any asset, cheapest.
                    <br />
                    <strong>Account:</strong> a one-time classic account is funded for them — native
                    XLM only, and sending a token this way costs you ~1.5 XLM.
                  </HelpTip>
                </div>
                <MethodPicker value={effectiveMethod} onChange={(m) => setMethodOverride(m)} />
                <p className="mt-1.5 text-xs text-ink-500">
                  Starts from the recipient&apos;s preference — change it if you need to.
                </p>
              </div>
            )}

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
              adornment={<span className="font-mono text-xs text-ink-400">{assetCode}</span>}
              hint={
                accountNativeTooLow
                  ? undefined
                  : 'Leave the asset below empty for native XLM.'
              }
              error={accountNativeTooLow ? 'The account method requires more than 1 XLM.' : null}
            />

            <Field
              label="Asset (optional)"
              placeholder="XLM  ·  or  USDC:GA…"
              mono
              autoComplete="off"
              spellCheck={false}
              value={asset}
              onChange={(e) => setAsset(e.target.value)}
              hint="Format CODE:ISSUER for a token. Empty means native XLM."
            />

            {!connected && <Notice tone="info">Connect a wallet to send.</Notice>}

            {connected && accountTokenWarning ? (
              <AccountTokenWarning
                asset={assetCode}
                submitting={submitting}
                onUsePool={() => setMethodOverride('pool')}
                onProceed={() => void handleSend('account')}
              />
            ) : (
              <Button
                variant="primary"
                className="w-full"
                disabled={!canSubmit}
                loading={submitting}
                icon={<Send className="size-4" />}
                onClick={() => void handleSend()}
              >
                {submitting ? 'Confirm in your wallet…' : 'Send'}
              </Button>
            )}

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
            <Step n={3} label="Deliver">
              {effectiveMethod === 'account'
                ? 'Fund a one-time classic Stellar account for the recipient.'
                : 'Deposit the funds into the pool contract against that stealth address.'}
            </Step>
            <Step n={4} label="Scan">
              The recipient's view key detects the payment. Nobody else can tell it was for them.
            </Step>
          </ol>
        </Panel>

        <Panel eyebrow="Delivery" title={effectiveMethod === 'account' ? 'Account method' : 'Pool method'}>
          <p className="text-[13px] leading-relaxed text-ink-400">
            {effectiveMethod === 'account'
              ? 'Direct delivery: a fresh classic Stellar account is created and funded for this payment. Native XLM only, and account funding is paid by you.'
              : 'Value is held by the Soroban stealth-pool contract until claimed, so no new Stellar account has to be created and funded per payment.'}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-ink-500">
            Starts from the recipient&apos;s preference (pool when unknown), but you can change it on
            the form.
          </p>
        </Panel>
      </aside>
    </div>
  );
}

function MethodPicker({
  value,
  onChange,
}: {
  value: ReceiveMethod;
  onChange: (value: ReceiveMethod) => void;
}) {
  const options: { value: ReceiveMethod; label: string }[] = [
    { value: 'pool', label: 'Pool' },
    { value: 'account', label: 'Account' },
  ];
  return (
    <div className="inline-flex border border-ink-700">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center px-3 py-1.5 text-[13px] font-medium transition-colors ${
              active ? 'bg-copper-500 text-onaccent' : 'text-ink-400 hover:text-ink-100'
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function AccountTokenWarning({
  asset,
  onUsePool,
  onProceed,
  submitting,
}: {
  asset: string;
  onUsePool: () => void;
  onProceed: () => void;
  submitting: boolean;
}) {
  return (
    <div className="border border-signal-wait/40 bg-signal-wait/5 p-4">
      <div className="flex items-start gap-2.5 text-[13px] leading-relaxed text-signal-wait">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" />
        <div>
          <strong className="font-semibold">This recipient receives to an account.</strong> Sending{' '}
          <span className="font-mono">{asset}</span> this way draws{' '}
          <strong>~1.5 XLM</strong> from your balance to fund their one-time stealth account. That
          XLM is spent — it is <strong>not</strong> returned to you.
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={onUsePool} disabled={submitting}>
          Send via pool instead
        </Button>
        <Button variant="secondary" loading={submitting} onClick={onProceed}>
          Continue with account (~1.5 XLM)
        </Button>
      </div>
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
  method,
}: {
  resolution: ReturnType<typeof useRecipientResolver>;
  mode: SendMode;
  method: ReceiveMethod;
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
            <span className="ml-2 font-mono text-[11px] text-ink-400">via {method}</span>
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
            publish theirs — or switch to the Meta-address tab if they sent you one directly.
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
