import { useState, type ReactNode } from 'react';
import { Download, Eye, EyeOff, Lock, Sun, Trash2 } from 'lucide-react';
import { useIdentity } from '@/identity/IdentityProvider';
import { useIdentityStore, type ReceiveMethod } from '@/identity/identityStore';
import { usePublish } from '@/identity/usePublish';
import { downloadBackup } from '@/identity/backup';
import { useTheme, type ThemePreference } from '@/theme/ThemeProvider';
import { useTour } from '@/features/tutorial/TourProvider';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { HelpTip } from '@/components/ui/HelpTip';
import { CopyField } from '@/components/ui/CopyField';
import { Notice, TxResult } from '@/components/ui/Status';

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

      {/* Backup & security -------------------------------------------------- */}
      <Panel eyebrow="Security" title="Backup & identity">
        <BackupControls identity={identity} />
      </Panel>
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
