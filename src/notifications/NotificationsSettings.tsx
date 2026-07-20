import { useEffect, useState } from 'react';
import { Bell, Download, Radio, ShieldAlert, Timer } from 'lucide-react';
import { useServiceHealth } from '@/lib/useServiceHealth';
import { useIdentity } from '@/identity/IdentityProvider';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Toggle } from '@/components/ui/Toggle';
import { HelpTip } from '@/components/ui/HelpTip';
import { Notice } from '@/components/ui/Status';
import { useNotifyStore } from './notifyStore';
import { canAutoClaim } from './AutoClaimHost';

/**
 * Settings section for browser notifications, opt-in auto-claim, and installing
 * Shade as an app. Exported for the orchestrator to mount at the Settings
 * insertion point. See notifyStore for the persisted shape, NotificationHost /
 * AutoClaimHost for the runtime behaviour.
 */

/** The `beforeinstallprompt` event isn't in the TS DOM lib yet. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type PermissionState = NotificationPermission | 'unsupported';

function currentPermission(): PermissionState {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export function NotificationsSettings() {
  const { payoutSecret } = useIdentity();
  const health = useServiceHealth();

  const notificationsEnabled = useNotifyStore((s) => s.notificationsEnabled);
  const setNotificationsEnabled = useNotifyStore((s) => s.setNotificationsEnabled);
  const autoClaim = useNotifyStore((s) => s.autoClaim);
  const setAutoClaimEnabled = useNotifyStore((s) => s.setAutoClaimEnabled);
  const setAutoClaimDelay = useNotifyStore((s) => s.setAutoClaimDelay);

  const [permission, setPermission] = useState<PermissionState>(currentPermission);
  const [confirmingAuto, setConfirmingAuto] = useState(false);

  const relayerAvailable = health.relayer === 'ok' && !health.relayerRequiresCredit;
  const eligible = canAutoClaim(payoutSecret, relayerAvailable);

  // --- Install prompt ---------------------------------------------------------
  // Captured from the `beforeinstallprompt` event; null when the app is already
  // installed or the browser doesn't support programmatic install.
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallEvent(null);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    // Already running as an installed PWA?
    if (window.matchMedia?.('(display-mode: standalone)').matches) setInstalled(true);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!installEvent) return;
    await installEvent.prompt();
    const { outcome } = await installEvent.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    // The event is single-use; drop it either way.
    setInstallEvent(null);
  };

  // --- Notifications ----------------------------------------------------------
  const handleNotificationsToggle = async (next: boolean) => {
    if (!next) {
      setNotificationsEnabled(false);
      return;
    }
    if (typeof Notification === 'undefined') {
      setPermission('unsupported');
      return;
    }
    // Enabling requires permission; ask if we haven't been granted/denied yet.
    let state = Notification.permission;
    if (state === 'default') {
      state = await Notification.requestPermission();
      setPermission(state);
    }
    // Only flip the preference on when we can actually deliver.
    setNotificationsEnabled(state === 'granted');
  };

  // --- Auto-claim -------------------------------------------------------------
  const handleAutoToggle = (next: boolean) => {
    if (next) {
      // Enabling is gated behind the mandatory privacy warning + confirm.
      setConfirmingAuto(true);
      return;
    }
    setAutoClaimEnabled(false);
    setConfirmingAuto(false);
  };

  const confirmAuto = () => {
    setAutoClaimEnabled(true);
    setConfirmingAuto(false);
  };

  const delayInvalid = autoClaim.minMinutes > autoClaim.maxMinutes;

  return (
    <Panel eyebrow="Alerts" title="Notifications & auto-claim">
      <div className="space-y-5">
        {/* Notifications ----------------------------------------------------- */}
        <SettingRow
          label="Notify me of new payments"
          help={
            <>
              Show a browser notification when a new payment is detected while a Shade tab is open.
              Requires notification permission. Note: this can't wake a fully-closed app — no browser
              reliably runs background scans once every tab is closed.
            </>
          }
        >
          <Toggle
            label="Notify me of new payments"
            checked={notificationsEnabled && permission === 'granted'}
            disabled={permission === 'unsupported' || permission === 'denied'}
            onChange={(v) => void handleNotificationsToggle(v)}
          />
        </SettingRow>

        <p className="flex items-center gap-1.5 text-xs text-ink-500">
          <Bell className="size-3" />
          {permission === 'unsupported'
            ? 'This browser does not support notifications.'
            : permission === 'granted'
              ? 'Permission granted.'
              : permission === 'denied'
                ? 'Permission blocked — enable notifications for this site in your browser settings.'
                : 'Permission not yet requested.'}
        </p>

        {/* Auto-claim -------------------------------------------------------- */}
        <div className="border-t border-ink-700 pt-5">
          <SettingRow
            label="Auto-claim new payments"
            help={
              <>
                Automatically claim each new payment after a random delay, with no clicking. Runs
                only when it can claim without a wallet popup — with your payout secret, or through
                the relayer. Applies to pool payments only; account-method payments are claimed
                manually. Off by default: auto-claiming is a privacy trade-off (see the warning).
              </>
            }
          >
            <Toggle
              label="Auto-claim new payments"
              checked={autoClaim.enabled}
              disabled={!eligible}
              onChange={handleAutoToggle}
            />
          </SettingRow>

          <p className="mt-2 text-xs text-ink-500">
            Applies to pool payments only; account-method payments are claimed manually on Receive.
          </p>

          {!eligible && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-500">
              <Radio className="mt-0.5 size-3 shrink-0" />
              Unavailable for this identity: it claims through your wallet, which can't sign
              unattended, and the relayer (which could sponsor the claim) isn't available right now.
            </p>
          )}

          {/* Mandatory privacy warning + explicit confirm. */}
          {confirmingAuto && (
            <div className="mt-3">
              <Notice tone="warn">
                <p className="flex items-center gap-1.5 font-medium text-signal-wait">
                  <ShieldAlert className="size-3.5" />
                  Auto-claim reduces the privacy Shade gives you.
                </p>
                <p className="mt-1.5 text-ink-300">
                  Claiming moves funds from a one-time stealth address into your payout account, so
                  every auto-claimed payment becomes linked to that one account on-chain. Auto-claim
                  does this for you, continuously — the more you claim, the more of your incoming
                  activity an observer can attribute to you.
                </p>
                <p className="mt-1.5 text-ink-300">
                  The random delay decorrelates the claim time from the payment's arrival, which
                  defeats timing correlation, but claiming is still a deanonymizing step. Using the
                  relayer is recommended: it also hides your IP and the fee-payer link.
                  {relayerAvailable
                    ? ' The relayer is available and will be used.'
                    : payoutSecret
                      ? ' The relayer is unavailable, so claims will pay their own fee from your payout secret (this exposes your IP and fee-payer).'
                      : ''}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setConfirmingAuto(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" variant="danger" onClick={confirmAuto}>
                    I understand — enable auto-claim
                  </Button>
                </div>
              </Notice>
            </div>
          )}

          {/* Delay window. */}
          {autoClaim.enabled && (
            <div className="mt-4 border border-ink-700 bg-ink-900 px-4 py-3">
              <div className="flex items-center gap-1.5">
                <Timer className="size-3.5 text-copper-400" />
                <span className="text-[13px] text-ink-100">Random claim delay</span>
                <HelpTip label="Random claim delay">
                  Each payment is claimed after a delay picked uniformly at random from this window.
                  A wider window makes it harder for an observer to link a claim back to the payment
                  by timing.
                </HelpTip>
              </div>
              <div className="mt-3 flex items-end gap-3">
                <MinutesInput
                  label="Min"
                  value={autoClaim.minMinutes}
                  onChange={(minMinutes) => setAutoClaimDelay({ minMinutes })}
                />
                <span className="pb-2 text-ink-600">–</span>
                <MinutesInput
                  label="Max"
                  value={autoClaim.maxMinutes}
                  onChange={(maxMinutes) => setAutoClaimDelay({ maxMinutes })}
                />
                <span className="pb-2 text-xs text-ink-500">minutes</span>
              </div>
              {delayInvalid && (
                <p className="mt-2 text-xs text-signal-bad">
                  Minimum must be less than or equal to maximum.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Install ----------------------------------------------------------- */}
        <div className="border-t border-ink-700 pt-5">
          <SettingRow
            label="Install app"
            help={
              <>
                Install Shade as a standalone app on this device for a dedicated window and quicker
                access. Installing does not enable background scanning — the app still scans when
                it's open.
              </>
            }
          >
            {installed ? (
              <span className="text-[13px] text-ink-500">Installed</span>
            ) : installEvent ? (
              <Button
                size="sm"
                variant="secondary"
                icon={<Download className="size-3.5" />}
                onClick={() => void handleInstall()}
              >
                Install app
              </Button>
            ) : (
              <span className="text-[13px] text-ink-500">Not available</span>
            )}
          </SettingRow>
        </div>
      </div>
    </Panel>
  );
}

/** A label + help + control row, mirroring the Settings page's own rows. */
function SettingRow({
  label,
  help,
  children,
}: {
  label: string;
  help: React.ReactNode;
  children: React.ReactNode;
}) {
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

/** A small numeric minutes input (kept local; the shared Field is full-width). */
function MinutesInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label-eyebrow">{label}</span>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const n = Number.parseInt(e.target.value, 10);
          onChange(Number.isFinite(n) && n >= 0 ? n : 0);
        }}
        className="h-9 w-20 border border-ink-700 bg-ink-900 px-2 text-sm text-ink-50 focus:border-copper-500 focus:outline-none"
      />
    </label>
  );
}
