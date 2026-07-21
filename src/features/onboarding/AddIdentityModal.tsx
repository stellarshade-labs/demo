import { useState } from 'react';
import { X } from 'lucide-react';
import { useIdentity } from '@/identity/IdentityProvider';
import { Portal } from '@/components/ui/Portal';
import { CreateStep, BackupStep, PublishStep } from './OnboardingFlow';

/**
 * Add another identity to the already-unlocked vault. Reuses the onboarding
 * create/backup/publish steps but SKIPS the passphrase — the vault is open, so
 * the new identity is sealed under the same key already held in memory.
 */

type Step = 'create' | 'backup' | 'publish';

const STEPS: Step[] = ['create', 'backup', 'publish'];

export function AddIdentityModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const identity = useIdentity();
  const [step, setStep] = useState<Step>('create');
  const [publishPref, setPublishPref] = useState(false);
  const [finishing, setFinishing] = useState(false);

  if (!open) return null;

  const close = () => {
    identity.discardDraft();
    setStep('create');
    setPublishPref(false);
    onClose();
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-950/80 backdrop-blur-sm">
        <div className="mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-5 py-16">
          <div className="relative border border-ink-700 bg-ink-950 p-6">
            <button
              type="button"
              onClick={close}
              aria-label="Close"
              className="absolute right-4 top-4 text-ink-500 transition-colors hover:text-ink-100"
            >
              <X className="size-4" />
            </button>

            <div className="mb-5">
              <div className="label-eyebrow">Add identity</div>
              <h2 className="mt-0.5 text-lg font-bold tracking-tight text-ink-50">
                Create another identity
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-400">
                It joins this vault under the same passphrase, so no new passphrase needed.
              </p>
            </div>

            <div className="mb-6 flex gap-1.5">
              {STEPS.map((s) => {
                const idx = STEPS.indexOf(s);
                const cur = STEPS.indexOf(step);
                return (
                  <span
                    key={s}
                    className={`h-0.5 flex-1 rounded-full transition-colors ${
                      idx <= cur ? 'bg-copper-500' : 'bg-ink-700'
                    }`}
                  />
                );
              })}
            </div>

            {step === 'create' && (
              <CreateStep
                identity={identity}
                // A restored phrase needs no backup step — skip straight to publish.
                onCreated={(imported) => setStep(imported ? 'publish' : 'backup')}
              />
            )}

            {step === 'backup' && (
              <BackupStep identity={identity} onNext={() => setStep('publish')} />
            )}

            {step === 'publish' && (
              <PublishStep
                value={publishPref}
                onChange={setPublishPref}
                finishing={finishing}
                finishLabel="Add identity"
                onFinish={async () => {
                  setFinishing(true);
                  try {
                    await identity.finalizeAddition(publishPref);
                    close();
                  } finally {
                    setFinishing(false);
                  }
                }}
              />
            )}
          </div>
        </div>
      </div>
    </Portal>
  );
}
