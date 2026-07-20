import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  Dice5,
  Download,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  Lock,
  Pencil,
  Plus,
  Sun,
  Trash2,
  Wallet,
} from 'lucide-react';
import { useIdentity } from '@/identity/IdentityProvider';
import {
  useIdentityStore,
  type AutoLockMinutes,
  type PublicIdentity,
  type ReceiveMethod,
} from '@/identity/identityStore';
import type { IdentitySource } from '@/identity/identityCrypto';
import { usePublish } from '@/identity/usePublish';
import { downloadBackup } from '@/identity/backup';
import { AddIdentityModal } from '@/features/onboarding/AddIdentityModal';
import { useTheme, type ThemePreference } from '@/theme/ThemeProvider';
import { useTour } from '@/features/tutorial/TourProvider';
import { ContactsSettings } from '@/contacts/ContactsSettings';
import { NotificationsSettings } from '@/notifications/NotificationsSettings';
import { truncateMeta } from '@/lib/format';
import { buildViewExport } from '@/lib/viewExport';
import { isWebAuthnAvailable, isPlatformAuthenticatorAvailable } from '@/lib/webauthn';
import { toUserMessage } from '@/lib/errors';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Toggle } from '@/components/ui/Toggle';
import { HelpTip } from '@/components/ui/HelpTip';
import { CopyField } from '@/components/ui/CopyField';
import { QRCode } from '@/components/ui/QRCode';
import { Notice, TxResult } from '@/components/ui/Status';

const MIN_PASSPHRASE = 8;

const AUTO_LOCK_OPTIONS: { value: AutoLockMinutes; label: string }[] = [
  { value: -1, label: 'Instant' },
  { value: 15, label: '15m' },
  { value: 60, label: '1h' },
  { value: 360, label: '6h' },
  { value: 1440, label: '24h' },
  { value: 0, label: 'Never' },
];

const SOURCE_ICON: Record<IdentitySource, typeof Wallet> = {
  wallet: Wallet,
  mnemonic: KeyRound,
  random: Dice5,
};

const SOURCE_LABEL: Record<IdentitySource, string> = {
  wallet: 'Wallet',
  mnemonic: 'Phrase',
  random: 'Random',
};

export function SettingsPage() {
  const identity = useIdentity();
  const settings = useIdentityStore((s) => s.settings);
  const setSettings = useIdentityStore((s) => s.setSettings);
  const { preference, setPreference } = useTheme();
  const tour = useTour();
  const pub = usePublish();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight text-ink-50">Settings</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-400">
          How you receive, how claims are submitted, and how your identity is stored on this device.
        </p>
      </div>

      {/* Receiving ---------------------------------------------------------- */}
      <Panel eyebrow="Receiving" title="How people pay you">
        <div className="space-y-5">
          <Row
            label="Default receive method"
            help={
              <>
                You choose how funds reach you — senders don't. Shade passes this method
                automatically when someone pays your published address.
                <br />
                <br />
                <strong>Pool:</strong> value sits in the Soroban contract until you claim. Private,
                any asset, cheapest for senders.
                <br />
                <strong>Account:</strong> a one-time classic account is funded for you. Native XLM
                only, and sending a <em>token</em> this way costs the sender ~1.5 XLM.
              </>
            }
          >
            <MethodSegment
              value={settings.receiveMethod}
              onChange={(method) => setSettings({ receiveMethod: method })}
            />
          </Row>

          {pub.publishState === 'published' && (
            <div className="border border-ink-700 bg-ink-900 px-4 py-3 text-[13px] text-ink-400">
              Your address is published. Push the method change on-chain so senders see it:
              <div className="mt-2">
                <Button
                  size="sm"
                  variant="secondary"
                  loading={pub.busy}
                  disabled={!pub.canManage}
                  onClick={() => void pub.updateMethod(settings.receiveMethod)}
                >
                  Update published method
                </Button>
              </div>
            </div>
          )}

          <Row
            label="Publish my address"
            help={
              <>
                Publishing writes your meta-address on-chain so anyone can pay you by your public
                address. Convenient, but it's publicly visible that this account uses Shade. Keep it
                off for more privacy and share your meta-address yourself.
              </>
            }
          >
            <Toggle
              label="Publish my address"
              checked={pub.publishState === 'published'}
              disabled={!pub.canManage || pub.busy}
              onChange={(next) => (next ? void pub.publish() : void pub.unpublish())}
            />
          </Row>

          {!pub.canManage && (
            <Notice tone="info">
              {pub.source === 'wallet'
                ? 'Connect your wallet to change publishing.'
                : 'Your payout account needs a little XLM before it can publish.'}
            </Notice>
          )}

          {pub.result && (
            <TxResult
              status={pub.result.status}
              message={pub.result.message}
              txHash={pub.result.txHash}
              onDismiss={() => pub.setResult(null)}
            />
          )}
        </div>
      </Panel>

      {/* Claims & scanning -------------------------------------------------- */}
      <Panel eyebrow="Privacy" title="Claims & scanning">
        <div className="space-y-5">
          <Row
            label="Use relayer by default"
            help={
              <>
                Submit claims through the privacy relayer instead of paying the fee yourself. It
                hides your IP and the fee-payer link, and for wallet-free identities it sponsors the
                fee entirely. Falls back automatically if the relayer is unavailable.
              </>
            }
          >
            <Toggle
              label="Use relayer by default"
              checked={settings.useRelayerByDefault}
              onChange={(v) => setSettings({ useRelayerByDefault: v })}
            />
          </Row>

          <Row
            label="Auto-scan on open"
            help="Scan for incoming stealth payments as soon as you open Receive. Turn off to scan only when you press Scan."
          >
            <Toggle
              label="Auto-scan on open"
              checked={settings.autoScanOnOpen}
              onChange={(v) => setSettings({ autoScanOnOpen: v })}
            />
          </Row>
        </div>
      </Panel>

      {/* Appearance --------------------------------------------------------- */}
      <Panel eyebrow="Appearance" title="Theme & help">
        <div className="space-y-5">
          <Row label="Color theme" help="Follow your system, or force light or dark.">
            <ThemeSegment value={preference} onChange={setPreference} />
          </Row>
          <Row label="Tutorial" help="Replay the guided walkthrough of the app's controls.">
            <Button size="sm" variant="secondary" onClick={tour.start}>
              Replay tour
            </Button>
          </Row>
        </div>
      </Panel>

      {/* Identities --------------------------------------------------------- */}
      <Panel eyebrow="Identities" title="Your identities">
        <IdentitiesSettings identity={identity} />
      </Panel>

      {/* Insertion points for sibling agents' settings sections. */}
      <ContactsSettings />
      <NotificationsSettings />

      {/* Backup & security -------------------------------------------------- */}
      <Panel eyebrow="Security" title="Backup & identity">
        <BackupControls identity={identity} />
      </Panel>

      {/* Auto-lock ---------------------------------------------------------- */}
      <Panel eyebrow="Security" title="Locking & passkey">
        <div className="space-y-5">
          <Row
            label="Auto-lock"
            help={
              <>
                How long your vault stays unlocked between uses before the passphrase (or passkey) is
                asked again. The window slides forward while you're active.
                <br />
                <br />
                <strong>Instant</strong> keeps your identity in memory only — nothing resumable is
                stored, so closing or reloading the tab re-locks it immediately (most private).
                <br />
                <strong>Never</strong> keeps it unlocked in this browser indefinitely — convenient,
                but anyone with access to this device's storage could open it. Use a short window on
                shared machines.
              </>
            }
          >
            <AutoLockSegment
              value={settings.autoLockMinutes}
              onChange={(v) => setSettings({ autoLockMinutes: v })}
            />
          </Row>

          <div className="border-t border-ink-700 pt-5">
            <PasskeySettings identity={identity} />
          </div>

          <div className="border-t border-ink-700 pt-5">
            <ChangePassphrase identity={identity} />
          </div>
        </div>
      </Panel>

      {/* View-only export --------------------------------------------------- */}
      <Panel eyebrow="Sharing" title="View-only export">
        <ViewExportControls identity={identity} />
      </Panel>
    </div>
  );
}

function AutoLockSegment({
  value,
  onChange,
}: {
  value: AutoLockMinutes;
  onChange: (value: AutoLockMinutes) => void;
}) {
  // Own implementation (not the string-keyed <Segment>) since the values here
  // are a numeric union.
  return (
    <div className="inline-flex border border-ink-700">
      {AUTO_LOCK_OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center px-2.5 py-1.5 text-[13px] font-medium transition-colors ${
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

/**
 * Passkey enrollment. Capability detection is layered: WebAuthn API presence
 * (sync) gates whether we show anything; a platform-authenticator probe gates
 * the enroll button; and PRF support is only truly confirmed by the ceremony, so
 * enrollment failures surface a graceful message and never break passphrase use.
 */
function PasskeySettings({ identity }: { identity: ReturnType<typeof useIdentity> }) {
  const passkey = useIdentityStore((s) => s.passkey);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!isWebAuthnAvailable()) {
      setAvailable(false);
      return;
    }
    void isPlatformAuthenticatorAvailable().then((ok) => {
      if (!cancelled) setAvailable(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const enroll = async () => {
    setBusy(true);
    setError(null);
    try {
      await identity.enrollPasskey();
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  };

  // WebAuthn entirely absent → hide the feature, passphrase still works.
  if (available === false && !passkey) {
    return (
      <Row
        label="Passkey unlock"
        help="Unlock without typing your passphrase using a device passkey (Face ID, Touch ID, Windows Hello…). Not available in this browser."
      >
        <span className="text-[13px] text-ink-600">Unavailable here</span>
      </Row>
    );
  }

  return (
    <div className="space-y-3">
      <Row
        label="Passkey unlock"
        help={
          <>
            Enroll a passkey (Face ID, Touch ID, Windows Hello, or a security key) to unlock this
            vault with a tap instead of your passphrase. Your wrap key is sealed under the passkey's
            PRF secret — nothing secret is stored in the clear, and the passphrase always keeps
            working as a fallback.
          </>
        }
      >
        {passkey ? (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 border border-signal-ok/40 bg-signal-ok/5 px-2 py-1 text-[11px] font-medium text-signal-ok">
              <Fingerprint className="size-3" />
              Enrolled
            </span>
            <Button size="sm" variant="secondary" onClick={identity.removePasskey}>
              Remove
            </Button>
          </div>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            loading={busy}
            disabled={available === null}
            icon={<Fingerprint className="size-3.5" />}
            onClick={() => void enroll()}
          >
            Enroll passkey
          </Button>
        )}
      </Row>
      {error && <Notice tone="warn">{error}</Notice>}
    </div>
  );
}

/** Change the vault passphrase without a reset (current + new + confirm). */
function ChangePassphrase({ identity }: { identity: ReturnType<typeof useIdentity> }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const tooShort = next.length > 0 && next.length < MIN_PASSPHRASE;
  const mismatch = confirm.length > 0 && confirm !== next;
  const valid = current.length > 0 && next.length >= MIN_PASSPHRASE && confirm === next;

  const clearAll = () => {
    setCurrent('');
    setNext('');
    setConfirm('');
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    setDone(false);
    try {
      const ok = await identity.changePassphrase(current, next);
      if (ok) {
        setDone(true);
        clearAll();
      } else {
        setError('Current passphrase is incorrect.');
      }
    } catch (err) {
      setError(toUserMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void submit();
      }}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-sm text-ink-100">Change passphrase</span>
        <HelpTip label="Change passphrase">
          Re-encrypts your whole vault under a new passphrase. Your current passphrase is required.
          Any enrolled passkey is removed and must be re-enrolled afterwards.
        </HelpTip>
      </div>
      <Field
        label="Current passphrase"
        type="password"
        autoComplete="current-password"
        value={current}
        onChange={(e) => {
          setCurrent(e.target.value);
          setError(null);
          setDone(false);
        }}
      />
      <Field
        label="New passphrase"
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
        error={tooShort ? `At least ${MIN_PASSPHRASE} characters.` : null}
      />
      <Field
        label="Confirm new passphrase"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={mismatch ? "Passphrases don't match." : null}
      />
      {error && <Notice tone="warn">{error}</Notice>}
      {done && (
        <div className="border border-signal-ok/40 bg-signal-ok/5 px-3 py-2 text-[13px] text-signal-ok">
          Passphrase changed.
        </div>
      )}
      <Button type="submit" size="sm" variant="secondary" loading={busy} disabled={!valid}>
        Update passphrase
      </Button>
    </form>
  );
}

/**
 * View-only export for the ACTIVE identity. Produces a `shade:view:` string that
 * carries the view key + public spend key — enough to WATCH incoming payments,
 * never to spend them. The spend private key is never included.
 */
function ViewExportControls({ identity }: { identity: ReturnType<typeof useIdentity> }) {
  const [revealed, setRevealed] = useState(false);
  const secret = identity.revealSecret();

  const exportString = secret
    ? buildViewExport({
        metaAddress: secret.stealthKeys.metaAddress,
        viewPrivKey: secret.stealthKeys.viewPrivKey,
        viewPubKey: secret.stealthKeys.viewPubKey,
        spendPubKey: secret.stealthKeys.spendPubKey,
      })
    : null;

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-ink-400">
        Share a view-only key for your active identity. It lets another device (or a trusted person)
        watch your incoming payments without any ability to spend them — the spend key never leaves
        this browser. Open it in{' '}
        <Link
          to="/view"
          className="text-copper-400 underline decoration-copper-500/40 underline-offset-2 hover:decoration-copper-500"
        >
          watch-only mode
        </Link>
        .
      </p>

      {!secret ? (
        <Notice tone="info">Unlock your identity to generate a view-only key.</Notice>
      ) : !revealed ? (
        <Button
          size="sm"
          variant="secondary"
          icon={<Eye className="size-3.5" />}
          onClick={() => setRevealed(true)}
        >
          Show view-only key
        </Button>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
            <QRCode value={exportString!} size={148} />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="label-eyebrow">View key</div>
              <CopyField value={exportString!} className="!text-[11px]" />
              <p className="text-[11px] leading-relaxed text-ink-500">
                Safe to share for watching only. It cannot spend or claim funds.
              </p>
              <Button size="sm" variant="ghost" onClick={() => setRevealed(false)}>
                Hide
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function IdentitiesSettings({ identity }: { identity: ReturnType<typeof useIdentity> }) {
  const { identities, activeId, switchIdentity, removeIdentity, renameIdentity } = identity;
  const [adding, setAdding] = useState(false);

  return (
    <div className="space-y-4">
      <p className="text-[13px] leading-relaxed text-ink-400">
        All of these are unlocked by your one passphrase. Switch which one you're using, rename them,
        or add another.
      </p>

      <div className="divide-y divide-ink-700 border border-ink-700">
        {identities.map((item) => (
          <IdentityRow
            key={item.id}
            item={item}
            active={item.id === activeId}
            canRemove={identities.length > 1}
            onSwitch={() => switchIdentity(item.id)}
            onRename={(label) => void renameIdentity(item.id, label)}
            onRemove={() => {
              if (
                window.confirm(
                  'Remove this identity from the vault? You can restore it from its backup. This cannot be undone.',
                )
              ) {
                void removeIdentity(item.id);
              }
            }}
          />
        ))}
      </div>

      <Button
        size="sm"
        variant="secondary"
        icon={<Plus className="size-3.5" />}
        onClick={() => setAdding(true)}
      >
        Add identity
      </Button>

      <AddIdentityModal open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function IdentityRow({
  item,
  active,
  canRemove,
  onSwitch,
  onRename,
  onRemove,
}: {
  item: PublicIdentity;
  active: boolean;
  canRemove: boolean;
  onSwitch: () => void;
  onRename: (label: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftLabel, setDraftLabel] = useState(item.label ?? '');
  const Icon = SOURCE_ICON[item.source];

  const commit = () => {
    onRename(draftLabel);
    setEditing(false);
  };

  return (
    <div className="flex items-start gap-3 p-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-copper-400" />
      <div className="min-w-0 flex-1">
        {editing ? (
          <Field
            label="Name"
            autoFocus
            value={draftLabel}
            placeholder="e.g. Personal, Work"
            onChange={(e) => setDraftLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') {
                setDraftLabel(item.label ?? '');
                setEditing(false);
              }
            }}
          />
        ) : (
          <div className="flex items-center gap-2">
            <span className="truncate text-sm text-ink-100">
              {item.label?.trim() || 'Unnamed identity'}
            </span>
            {active && (
              <span className="inline-flex items-center gap-1 border border-copper-500/40 bg-copper-500/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-copper-300">
                <Check className="size-2.5" />
                Active
              </span>
            )}
            <span className="border border-ink-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
              {SOURCE_LABEL[item.source]}
            </span>
          </div>
        )}
        <div className="mt-1 truncate font-mono text-[11px] text-ink-500">
          {truncateMeta(item.metaAddress)}
        </div>

        {editing && (
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" onClick={commit}>
              Save
            </Button>
          </div>
        )}
      </div>

      {!editing && (
        <div className="flex shrink-0 items-center gap-1">
          {!active && (
            <Button size="sm" variant="secondary" onClick={onSwitch}>
              Switch
            </Button>
          )}
          <button
            type="button"
            aria-label="Rename identity"
            title="Rename"
            onClick={() => {
              setDraftLabel(item.label ?? '');
              setEditing(true);
            }}
            className="inline-flex size-7 items-center justify-center rounded-[3px] border border-ink-700 text-ink-400 transition-colors hover:border-ink-500 hover:text-ink-100"
          >
            <Pencil className="size-3.5" />
          </button>
          {canRemove && (
            <button
              type="button"
              aria-label="Remove identity"
              title="Remove"
              onClick={onRemove}
              className="inline-flex size-7 items-center justify-center rounded-[3px] border border-ink-700 text-ink-400 transition-colors hover:border-signal-bad/50 hover:text-signal-bad"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function BackupControls({ identity }: { identity: ReturnType<typeof useIdentity> }) {
  const [revealed, setRevealed] = useState(false);
  const secret = identity.revealSecret();

  return (
    <div className="space-y-5">
      <Row
        label="Backup"
        help="Re-download your identity backup, or reveal your keys to copy them. Anyone with these can spend your funds — handle with care."
      >
        <Button
          size="sm"
          variant="secondary"
          icon={<Download className="size-3.5" />}
          disabled={!secret}
          onClick={() => secret && downloadBackup(secret)}
        >
          Download backup
        </Button>
      </Row>

      {secret && (
        <div>
          <button
            type="button"
            onClick={() => setRevealed((r) => !r)}
            className="flex items-center gap-1.5 text-[13px] text-ink-400 hover:text-copper-400"
          >
            {revealed ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {revealed ? 'Hide secrets' : 'Reveal secrets'}
          </button>
          {revealed && (
            <div className="mt-3 space-y-2">
              {secret.mnemonic && <Secret label="Recovery phrase" value={secret.mnemonic} />}
              <Secret label="Spend private key" value={secret.stealthKeys.spendPrivKey} />
              <Secret label="View private key" value={secret.stealthKeys.viewPrivKey} />
              {secret.payout.secret && <Secret label="Payout secret" value={secret.payout.secret} />}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-ink-700 pt-5">
        <Button
          size="sm"
          variant="secondary"
          icon={<Lock className="size-3.5" />}
          onClick={identity.lock}
        >
          Lock now
        </Button>
        <Button
          size="sm"
          variant="danger"
          icon={<Trash2 className="size-3.5" />}
          onClick={() => {
            if (
              window.confirm(
                'Delete this identity from this browser? You can restore it from your backup. This cannot be undone.',
              )
            ) {
              identity.reset();
            }
          }}
        >
          Delete identity
        </Button>
      </div>
    </div>
  );
}

function Secret({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-ink-500">{label}</div>
      <CopyField value={value} display={value} className="!text-[11px]" />
    </div>
  );
}

function Row({ label, help, children }: { label: string; help: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0 flex items-center gap-1.5">
        <span className="text-sm text-ink-100">{label}</span>
        <HelpTip label={label}>{help}</HelpTip>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function MethodSegment({
  value,
  onChange,
}: {
  value: ReceiveMethod;
  onChange: (value: ReceiveMethod) => void;
}) {
  return (
    <Segment
      options={[
        { value: 'pool', label: 'Pool' },
        { value: 'account', label: 'Account' },
      ]}
      value={value}
      onChange={onChange}
    />
  );
}

function ThemeSegment({
  value,
  onChange,
}: {
  value: ThemePreference;
  onChange: (value: ThemePreference) => void;
}) {
  return (
    <Segment
      options={[
        { value: 'system', label: 'System' },
        { value: 'light', label: 'Light', icon: <Sun className="size-3" /> },
        { value: 'dark', label: 'Dark' },
      ]}
      value={value}
      onChange={onChange}
    />
  );
}

function Segment<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="inline-flex border border-ink-700">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium transition-colors ${
              active ? 'bg-copper-500 text-onaccent' : 'text-ink-400 hover:text-ink-100'
            }`}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
