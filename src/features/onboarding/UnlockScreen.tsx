import { useEffect, useState } from 'react';
import { Eye, EyeOff, Fingerprint, Lock } from 'lucide-react';
import { useIdentity } from '@/identity/IdentityProvider';
import { useIdentityStore } from '@/identity/identityStore';
import { isWebAuthnAvailable } from '@/lib/webauthn';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Status';
import { ShadeMark } from '@/components/layout/ShadeMark';
import { ThemeToggle } from '@/theme/ThemeToggle';

/**
 * Shown when an identity exists in this browser but the unlock session lapsed.
 * The passphrase re-derives the wrap key and reopens the sealed vault. If a
 * passkey is enrolled AND WebAuthn is present, an alternative one-tap unlock is
 * offered — but the passphrase path is ALWAYS available so the user can never be
 * locked out by a missing/failing authenticator.
 */
export function UnlockScreen() {
  const { unlock, unlockWithPasskey, unlocking, error, reset, source } = useIdentity();
  const passkey = useIdentityStore((s) => s.passkey);
  const [passphrase, setPassphrase] = useState('');
  const [show, setShow] = useState(false);
  const [webAuthnReady, setWebAuthnReady] = useState(false);

  // Capability detection is synchronous here (API presence). PRF itself is only
  // confirmed during the ceremony, so a failed passkey unlock just surfaces an
  // error and leaves the passphrase form usable.
  useEffect(() => {
    setWebAuthnReady(isWebAuthnAvailable());
  }, []);

  const passkeyEnabled = Boolean(passkey) && webAuthnReady;

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-ink-950">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="mx-auto flex min-h-full w-full max-w-sm flex-col justify-center px-5 py-16">
        <div className="mb-8 flex items-center gap-2.5">
          <ShadeMark className="size-6 text-copper-500" />
          <span className="text-lg font-bold tracking-tight text-ink-50">Shade</span>
        </div>

        <div className="mb-4 flex size-10 items-center justify-center border border-ink-700 bg-ink-850 text-copper-400">
          <Lock className="size-4.5" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-ink-50">Welcome back</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
          Your identity is locked. {passkeyEnabled ? 'Unlock with your passkey, or enter your ' : 'Enter your '}
          passphrase to unlock it.
        </p>

        {passkeyEnabled && (
          <div className="mt-6">
            <Button
              variant="primary"
              className="w-full"
              loading={unlocking}
              icon={<Fingerprint className="size-4" />}
              onClick={() => void unlockWithPasskey()}
            >
              Unlock with passkey
            </Button>
            <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-ink-600">
              <span className="h-px flex-1 bg-ink-700" />
              or passphrase
              <span className="h-px flex-1 bg-ink-700" />
            </div>
          </div>
        )}

        <form
          className={`space-y-4 ${passkeyEnabled ? '' : 'mt-6'}`}
          onSubmit={(e) => {
            e.preventDefault();
            void unlock(passphrase);
          }}
        >
          <Field
            label="Passphrase"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            autoFocus={!passkeyEnabled}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            adornment={
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="text-ink-500 hover:text-ink-200"
                aria-label={show ? 'Hide passphrase' : 'Show passphrase'}
              >
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            }
          />
          {error && <Notice tone="warn">{error}</Notice>}
          <Button
            type="submit"
            variant={passkeyEnabled ? 'secondary' : 'primary'}
            className="w-full"
            loading={unlocking}
            disabled={!passphrase}
          >
            Unlock
          </Button>
        </form>

        <div className="mt-8 border-t border-ink-700 pt-5">
          <p className="text-xs leading-relaxed text-ink-500">
            Forgot your passphrase? It can't be recovered. You can reset this browser and restore
            your identity from your backup {source === 'wallet' ? 'wallet' : 'phrase or backup file'}.
          </p>
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  'Reset this browser? Your encrypted identity will be removed here. You can restore it from your backup. This cannot be undone.',
                )
              ) {
                reset();
              }
            }}
            className="mt-2 text-xs text-signal-bad underline decoration-signal-bad/40 underline-offset-2 hover:decoration-signal-bad"
          >
            Reset & start over
          </button>
        </div>
      </div>
    </div>
  );
}
