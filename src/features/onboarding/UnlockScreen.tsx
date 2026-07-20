import { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { useIdentity } from '@/identity/IdentityProvider';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Notice } from '@/components/ui/Status';
import { ShadeMark } from '@/components/layout/ShadeMark';
import { ThemeToggle } from '@/theme/ThemeToggle';

/**
 * Shown when an identity exists in this browser but the 6h session has lapsed.
 * The passphrase re-derives the wrap key and reopens the sealed identity.
 */
export function UnlockScreen() {
  const { unlock, unlocking, error, reset, source } = useIdentity();
  const [passphrase, setPassphrase] = useState('');
  const [show, setShow] = useState(false);

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
          Your identity is locked. Enter your passphrase to unlock it. It stays unlocked for 6 hours
          of use.
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void unlock(passphrase);
          }}
        >
          <Field
            label="Passphrase"
            type={show ? 'text' : 'password'}
            autoComplete="current-password"
            autoFocus
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
            variant="primary"
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
