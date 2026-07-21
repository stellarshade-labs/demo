import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  Dice5,
  Download,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Lock,
  ShieldCheck,
  Upload,
  Wallet,
} from 'lucide-react';
import { useWallet } from '@/wallet/WalletProvider';
import { useIdentity } from '@/identity/IdentityProvider';
import { downloadBackup } from '@/identity/backup';
import { truncateMeta } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { CopyField } from '@/components/ui/CopyField';
import { Notice } from '@/components/ui/Status';
import { WalletModal } from '@/components/wallet/WalletModal';
import { BackdropSquares } from '@/components/ui/BackdropSquares';
import { ShadeMark } from '@/components/layout/ShadeMark';
import { ThemeToggle } from '@/theme/ThemeToggle';

type Step = 'welcome' | 'create' | 'passphrase' | 'backup' | 'publish';

const STEPS: Step[] = ['welcome', 'create', 'passphrase', 'backup', 'publish'];
const MIN_PASSPHRASE = 8;

// Mobile wallets deep-link away from the browser mid-onboarding; iOS may reload
// the page on return, wiping React state. Persisting our position lets the user
// resume at the create step instead of the welcome screen. Later steps depend on
// the in-memory draft (secret keys we never persist), so 'create' is as far as a
// reload can restore.
const RESUME_KEY = 'shade:onboarding-resume';
const MODE_KEY = 'shade:onboarding-mode';

export function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const identity = useIdentity();
  const [step, setStep] = useState<Step>(() =>
    sessionStorage.getItem(RESUME_KEY) ? 'create' : 'welcome',
  );
  const [passphrase, setPassphrase] = useState('');
  const [publishPref, setPublishPref] = useState(false);
  const [finishing, setFinishing] = useState(false);
  // A restored identity (mnemonic the user already has) doesn't need the backup
  // step — they're not seeing a new phrase, so we skip straight to publish.
  const [imported, setImported] = useState(false);

  useEffect(() => {
    if (step === 'welcome') {
      sessionStorage.removeItem(RESUME_KEY);
    } else {
      sessionStorage.setItem(RESUME_KEY, '1');
    }
  }, [step]);

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto bg-ink-950">
      <BackdropSquares />
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="relative mx-auto flex min-h-full w-full max-w-lg flex-col justify-center px-5 py-16">
        <div className="mb-8 flex items-center gap-2.5">
          <ShadeMark className="size-6 text-copper-500" />
          <span className="text-lg font-bold tracking-tight text-ink-50">Shade</span>
        </div>

        {/* Progress stays mounted on every step (empty on welcome) so entering
            step 2 doesn't shift the layout; each segment fills with a scaleX
            sweep instead of a color snap. */}
        <div className="mb-6 flex gap-1.5" aria-hidden>
          {STEPS.slice(1).map((s) => {
            const idx = STEPS.indexOf(s);
            const cur = STEPS.indexOf(step);
            const filled = step !== 'welcome' && idx <= cur;
            return (
              <span key={s} className="h-0.5 flex-1 overflow-hidden rounded-full bg-ink-700">
                <span
                  className={`block h-full w-full origin-left bg-copper-500 transition-transform duration-500 ease-out motion-reduce:transition-none ${
                    filled ? 'scale-x-100' : 'scale-x-0'
                  }`}
                />
              </span>
            );
          })}
        </div>

        <div key={step} className="animate-shade-rise">
        {step === 'welcome' && <WelcomeStep onNext={() => setStep('create')} />}

        {step === 'create' && (
          <CreateStep
            identity={identity}
            onCreated={(wasImported) => {
              setImported(wasImported);
              setStep('passphrase');
            }}
          />
        )}

        {step === 'passphrase' && (
          <PassphraseStep
            onBack={() => {
              identity.discardDraft();
              setStep('create');
            }}
            onSet={(value) => {
              setPassphrase(value);
              // Restored identities skip the backup step — nothing new to save.
              setStep(imported ? 'publish' : 'backup');
            }}
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
            onFinish={async () => {
              setFinishing(true);
              try {
                await identity.finalize(passphrase, publishPref);
                sessionStorage.removeItem(RESUME_KEY);
                onComplete();
              } finally {
                setFinishing(false);
              }
            }}
          />
        )}
        </div>
      </div>
    </div>
  );
}

// --- Step 1: welcome --------------------------------------------------------

function WelcomeStep({ onNext }: { onNext: () => void }) {
  return (
    <div>
      {/* The mark assembles itself: the shadow square slides into its offset —
          the same beat the landing plays when a payment is claimed. */}
      <svg width="76" height="76" viewBox="0 0 20 20" className="mb-7" aria-hidden="true">
        <rect x="2.5" y="2.5" width="10" height="10" className="fill-copper-500" />
        <rect
          x="7.5"
          y="7.5"
          width="10"
          height="10"
          fill="none"
          strokeWidth="1.2"
          className="animate-shade-assemble stroke-copper-500"
        />
      </svg>
      <h1 className="text-2xl font-bold tracking-tight text-ink-50">Welcome to Shade</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-300">
        Shade lets people pay you privately. Payments land at fresh one-time addresses that nobody
        can link back to you — only you can find and claim them.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-ink-400">
        First, create your identity. This is the key that lets you receive and spend. You can build
        it from a wallet, a recovery phrase, or at random.
      </p>
      <Button variant="primary" className="mt-8 w-full" icon={<ArrowRight className="size-4" />} onClick={onNext}>
        Create my identity
      </Button>
    </div>
  );
}

// --- Step 2: create ---------------------------------------------------------

export type IdentityApi = ReturnType<typeof useIdentity>;

export function CreateStep({
  identity,
  onCreated,
}: {
  identity: IdentityApi;
  /** `imported` is true only when restoring a phrase the user already had. */
  onCreated: (imported: boolean) => void;
}) {
  const [mode, setMode] = useState<'choose' | 'wallet' | 'mnemonic' | 'import'>(() =>
    sessionStorage.getItem(MODE_KEY) === 'wallet' ? 'wallet' : 'choose',
  );

  useEffect(() => {
    // Only the wallet path deep-links away (and risks a reload); the other
    // modes never leave the page, so 'wallet' is the only mode worth resuming.
    if (mode === 'wallet') {
      sessionStorage.setItem(MODE_KEY, 'wallet');
    } else {
      sessionStorage.removeItem(MODE_KEY);
    }
  }, [mode]);

  if (mode === 'wallet') {
    return <WalletCreate identity={identity} onBack={() => setMode('choose')} onCreated={onCreated} />;
  }
  if (mode === 'mnemonic') {
    return <MnemonicCreate identity={identity} onBack={() => setMode('choose')} onCreated={onCreated} />;
  }
  if (mode === 'import') {
    return <ImportBackup identity={identity} onBack={() => setMode('choose')} onCreated={onCreated} />;
  }

  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight text-ink-50">Create your identity</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
        Pick how to generate your keys. All three produce the same kind of identity — the difference
        is only how it's created and backed up.
      </p>

      <div className="mt-6 space-y-3">
        <OptionCard
          icon={<Wallet className="size-4.5" />}
          title="Connect a wallet"
          description="Derive your identity from a wallet signature. Deterministic — the same wallet always recreates it."
          onClick={() => setMode('wallet')}
        />
        <OptionCard
          icon={<KeyRound className="size-4.5" />}
          title="Recovery phrase"
          description="Generate a 12-word phrase, or restore one you already have. Portable to any device."
          onClick={() => setMode('mnemonic')}
        />
        <OptionCard
          icon={<Dice5 className="size-4.5" />}
          title="Random"
          description="Generate fresh random keys. Back them up with the download file — there's no phrase to memorize."
          loading={identity.creating}
          onClick={async () => {
            if (await identity.createRandom()) onCreated(false);
          }}
        />
      </div>

      <button
        type="button"
        onClick={() => setMode('import')}
        className="mt-4 w-full text-center text-[13px] text-ink-400 underline decoration-ink-600 underline-offset-2 hover:text-copper-400"
      >
        Already have a backup file? Recover an identity
      </button>

      {identity.error && (
        <div className="mt-4">
          <Notice tone="warn">{identity.error}</Notice>
        </div>
      )}
    </div>
  );
}

function OptionCard({
  icon,
  title,
  description,
  onClick,
  loading,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className="group flex w-full items-start gap-3.5 border border-ink-700 bg-ink-850 p-4 text-left transition-colors hover:border-copper-500/60 hover:bg-ink-800 disabled:opacity-60"
    >
      <span className="mt-0.5 text-copper-400">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink-50">{title}</span>
        <span className="mt-1 block text-[13px] leading-relaxed text-ink-400">{description}</span>
      </span>
      <ArrowRight className="mt-1 size-4 shrink-0 text-ink-600 transition-colors group-hover:text-copper-400" />
    </button>
  );
}

function WalletCreate({
  identity,
  onBack,
  onCreated,
}: {
  identity: IdentityApi;
  onBack: () => void;
  onCreated: (imported: boolean) => void;
}) {
  const { status, address, canDeriveKeys, connector } = useWallet();
  const [modalOpen, setModalOpen] = useState(false);
  const connected = status === 'connected' && Boolean(address);

  return (
    <div>
      <BackLink onClick={onBack} />
      <h2 className="text-xl font-bold tracking-tight text-ink-50">Connect a wallet</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
        Your identity is derived from a single signature. It never leaves your device, and the same
        wallet recreates the same identity anywhere.
      </p>

      <div className="mt-6 space-y-4">
        {!connected ? (
          <Button variant="primary" className="w-full" icon={<Wallet className="size-4" />} onClick={() => setModalOpen(true)}>
            Connect wallet
          </Button>
        ) : !canDeriveKeys ? (
          <Notice tone="warn">
            {connector?.name ?? 'This wallet'} can't sign messages, so an identity can't be derived
            from it. Use a recovery phrase or random instead, or connect Freighter.
          </Notice>
        ) : (
          <>
            <div className="flex items-center gap-2 border border-ink-700 bg-ink-900 px-3 py-2.5 text-[13px] text-ink-300">
              <Check className="size-3.5 text-signal-ok" />
              Connected — signing derives your identity.
            </div>
            <Button
              variant="primary"
              className="w-full"
              loading={identity.creating}
              icon={<ShieldCheck className="size-4" />}
              onClick={async () => {
                if (await identity.createFromWallet()) onCreated(false);
              }}
            >
              Sign to derive identity
            </Button>
          </>
        )}

        {identity.error && <Notice tone="warn">{identity.error}</Notice>}
      </div>

      <WalletModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}

function MnemonicCreate({
  identity,
  onBack,
  onCreated,
}: {
  identity: IdentityApi;
  onBack: () => void;
  onCreated: (imported: boolean) => void;
}) {
  const [restoring, setRestoring] = useState(false);
  const [phrase, setPhrase] = useState('');

  return (
    <div>
      <BackLink onClick={onBack} />
      <h2 className="text-xl font-bold tracking-tight text-ink-50">Recovery phrase</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
        Generate a fresh phrase, or restore an identity from one you already have.
      </p>

      <div className="mt-6 space-y-4">
        {!restoring ? (
          <>
            <Button
              variant="primary"
              className="w-full"
              loading={identity.creating}
              icon={<KeyRound className="size-4" />}
              onClick={async () => {
                if (await identity.createFromMnemonic()) onCreated(false);
              }}
            >
              Generate a new phrase
            </Button>
            <button
              type="button"
              onClick={() => setRestoring(true)}
              className="w-full text-center text-[13px] text-ink-400 underline decoration-ink-600 underline-offset-2 hover:text-copper-400"
            >
              I already have a recovery phrase
            </button>
          </>
        ) : (
          <>
            <Field
              label="Recovery phrase"
              placeholder="word1 word2 word3 …"
              mono
              autoComplete="off"
              spellCheck={false}
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              hint="Enter the 12 or 24 words in order, separated by spaces."
            />
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setRestoring(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                loading={identity.creating}
                disabled={phrase.trim().split(/\s+/).length < 12}
                onClick={async () => {
                  if (await identity.createFromMnemonic(phrase)) onCreated(true);
                }}
              >
                Restore identity
              </Button>
            </div>
          </>
        )}

        {identity.error && <Notice tone="warn">{identity.error}</Notice>}
      </div>
    </div>
  );
}

function ImportBackup({
  identity,
  onBack,
  onCreated,
}: {
  identity: IdentityApi;
  onBack: () => void;
  onCreated: (imported: boolean) => void;
}) {
  const [json, setJson] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);

  const submit = async (raw: string) => {
    if (await identity.createFromBackup(raw)) onCreated(true);
  };

  return (
    <div>
      <BackLink onClick={onBack} />
      <h2 className="text-xl font-bold tracking-tight text-ink-50">Recover from a backup</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
        Import the JSON backup file Shade exported. This restores any identity — including a random
        one, which has no recovery phrase to type.
      </p>

      <div className="mt-6 space-y-4">
        <label className="flex cursor-pointer items-center justify-center gap-2 border border-dashed border-ink-600 bg-ink-900 px-4 py-6 text-[13px] text-ink-300 transition-colors hover:border-copper-500/60 hover:text-ink-100">
          <Upload className="size-4" />
          {fileName ?? 'Choose backup file (.json)'}
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setFileName(file.name);
              const text = await file.text();
              setJson(text);
              await submit(text);
            }}
          />
        </label>

        <div className="text-center text-xs text-ink-600">or paste its contents</div>

        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          placeholder='{ "app": "Shade", "stealthKeys": { … } }'
          spellCheck={false}
          className="h-24 w-full resize-none border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-xs text-ink-100 placeholder:text-ink-600 focus:border-copper-500 focus:outline-none"
        />

        <Button
          variant="primary"
          className="w-full"
          loading={identity.creating}
          disabled={!json.trim()}
          icon={<ArrowRight className="size-4" />}
          onClick={() => void submit(json)}
        >
          Recover identity
        </Button>

        {identity.error && <Notice tone="warn">{identity.error}</Notice>}
      </div>
    </div>
  );
}

// --- Step 3: passphrase -----------------------------------------------------

function PassphraseStep({ onBack, onSet }: { onBack: () => void; onSet: (value: string) => void }) {
  const [value, setValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);

  const tooShort = value.length > 0 && value.length < MIN_PASSPHRASE;
  const mismatch = confirm.length > 0 && confirm !== value;
  const valid = value.length >= MIN_PASSPHRASE && confirm === value;

  return (
    <div>
      <BackLink onClick={onBack} />
      <h2 className="text-xl font-bold tracking-tight text-ink-50">Set a passphrase</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
        This encrypts your identity in this browser. You'll re-enter it after your auto-lock window
        (adjustable in Settings). It can't be recovered — if you forget it, restore from your backup
        instead.
      </p>

      <div className="mt-6 space-y-4">
        <Field
          label="Passphrase"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={tooShort ? `At least ${MIN_PASSPHRASE} characters.` : null}
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
        <Field
          label="Confirm passphrase"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? "Passphrases don't match." : null}
        />
        <Button
          variant="primary"
          className="w-full"
          disabled={!valid}
          icon={<ArrowRight className="size-4" />}
          onClick={() => onSet(value)}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}

// --- Step 4: backup ---------------------------------------------------------

export function BackupStep({ identity, onNext }: { identity: IdentityApi; onNext: () => void }) {
  const secret = identity.revealSecret();
  const [downloaded, setDownloaded] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [phraseHidden, setPhraseHidden] = useState(false);
  // The confirmation quiz sits after backup: mnemonic identities re-enter a few
  // words by position; random/wallet identities tick a "saved it" box.
  const [confirming, setConfirming] = useState(false);

  if (!secret) return null;

  const words = secret.mnemonic ? secret.mnemonic.trim().split(/\s+/) : null;

  // Confirmation phase: prove the phrase was written down (or acknowledge).
  if (confirming) {
    return (
      <BackupConfirm
        words={words}
        onBack={() => setConfirming(false)}
        onConfirmed={onNext}
      />
    );
  }

  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight text-ink-50">Back up your identity</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
        This is the only copy of your keys that leaves the app. Anyone with it can spend your funds,
        and there's no recovery if you lose it. Store it somewhere safe.
      </p>

      <div className="mt-6 space-y-4">
        {words && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="label-eyebrow">Recovery phrase</div>
              <button
                type="button"
                onClick={() => setPhraseHidden((h) => !h)}
                className="flex items-center gap-1.5 text-[11px] text-ink-400 hover:text-copper-400"
              >
                {phraseHidden ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
                {phraseHidden ? 'Show' : 'Hide'}
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {words.map((word, i) => (
                <div
                  key={i}
                  style={{ animationDelay: `${i * 35}ms` }}
                  className="animate-shade-rise flex items-center gap-1.5 border border-ink-700 bg-ink-900 px-2.5 py-1.5"
                >
                  <span className="font-mono text-[10px] text-ink-600">{i + 1}</span>
                  <span className="font-mono text-[13px] text-ink-100">
                    {phraseHidden ? '•'.repeat(Math.max(4, word.length)) : word}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="label-eyebrow mb-2">Meta-address</div>
          <CopyField value={secret.stealthKeys.metaAddress} display={truncateMeta(secret.stealthKeys.metaAddress)} />
        </div>

        <button
          type="button"
          onClick={() => setShowKeys((s) => !s)}
          className="flex items-center gap-1.5 text-[13px] text-ink-400 hover:text-copper-400"
        >
          {showKeys ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          {showKeys ? 'Hide raw keys' : 'Show raw keys'}
        </button>
        {showKeys && (
          <div className="space-y-2">
            <KeyRow label="Spend private key" value={secret.stealthKeys.spendPrivKey} />
            <KeyRow label="View private key" value={secret.stealthKeys.viewPrivKey} />
            {secret.payout.secret && <KeyRow label="Payout secret" value={secret.payout.secret} />}
          </div>
        )}

        <Button
          variant={downloaded ? 'secondary' : 'primary'}
          className="w-full"
          icon={downloaded ? <Check className="size-4" /> : <Download className="size-4" />}
          onClick={() => {
            downloadBackup(secret);
            setDownloaded(true);
          }}
        >
          {downloaded ? 'Downloaded — download again' : 'Download backup file'}
        </Button>

        <Button
          variant="primary"
          className="w-full"
          disabled={!downloaded}
          icon={<ArrowRight className="size-4" />}
          onClick={() => setConfirming(true)}
        >
          I've saved my backup
        </Button>
      </div>
    </div>
  );
}

/** Pick `count` distinct 0-based indices in [0, len). */
function pickPositions(len: number, count: number): number[] {
  const n = Math.min(count, len);
  const chosen = new Set<number>();
  while (chosen.size < n) chosen.add(Math.floor(Math.random() * len));
  return [...chosen].sort((a, b) => a - b);
}

/**
 * Backup confirmation. For mnemonic identities we quiz the user on 2–3 random
 * words (by position) to prove the phrase was actually recorded. For random /
 * wallet identities there's no phrase to quiz, so a required acknowledgement
 * checkbox stands in. The phrase can be re-shown before confirming.
 */
function BackupConfirm({
  words,
  onBack,
  onConfirmed,
}: {
  words: string[] | null;
  onBack: () => void;
  onConfirmed: () => void;
}) {
  // Quiz 3 positions for 24-word phrases, 2 for 12-word (or whatever's shorter).
  const [positions] = useState(() =>
    words ? pickPositions(words.length, words.length > 12 ? 3 : 2) : [],
  );
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [acked, setAcked] = useState(false);
  const [checked, setChecked] = useState(false);

  if (!words) {
    // No phrase → acknowledgement checkbox for random/wallet identities.
    return (
      <div>
        <BackLink onClick={onBack} />
        <h2 className="text-xl font-bold tracking-tight text-ink-50">Confirm your backup</h2>
        <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
          There's no phrase to memorise for this identity — your backup file is the only copy of the
          keys. Make sure you've stored it somewhere safe before continuing.
        </p>

        <label className="mt-6 flex cursor-pointer items-start gap-3 border border-ink-700 bg-ink-900 p-4 text-left transition-colors hover:border-ink-600">
          <input
            type="checkbox"
            checked={acked}
            onChange={(e) => setAcked(e.target.checked)}
            className="mt-0.5 size-4 accent-[#c8763c]"
          />
          <span className="text-[13px] leading-relaxed text-ink-200">
            I've securely saved my backup file. I understand it can't be recovered if I lose it.
          </span>
        </label>

        <Button
          variant="primary"
          className="mt-6 w-full"
          disabled={!acked}
          icon={<ArrowRight className="size-4" />}
          onClick={onConfirmed}
        >
          Confirm & continue
        </Button>
      </div>
    );
  }

  const allCorrect = positions.every(
    (p) => (answers[p] ?? '').trim().toLowerCase() === words[p].toLowerCase(),
  );

  return (
    <div>
      <BackLink onClick={onBack} />
      <h2 className="text-xl font-bold tracking-tight text-ink-50">Confirm your phrase</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
        Enter the following words from your recovery phrase to confirm you've written it down. Go
        back if you need to see it again.
      </p>

      <div className="mt-6 space-y-4">
        {positions.map((p) => (
          <Field
            key={p}
            label={`Word #${p + 1}`}
            mono
            autoComplete="off"
            spellCheck={false}
            value={answers[p] ?? ''}
            onChange={(e) => setAnswers((prev) => ({ ...prev, [p]: e.target.value }))}
            error={
              checked && (answers[p] ?? '').trim().toLowerCase() !== words[p].toLowerCase()
                ? 'Does not match.'
                : null
            }
          />
        ))}

        <Button
          variant="primary"
          className="w-full"
          icon={<ArrowRight className="size-4" />}
          onClick={() => {
            setChecked(true);
            if (allCorrect) onConfirmed();
          }}
        >
          Confirm phrase
        </Button>
      </div>
    </div>
  );
}

function KeyRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="mb-1 text-[11px] text-ink-500">{label}</div>
      <CopyField value={value} display={value} className="!text-[11px]" />
    </div>
  );
}

// --- Step 5: publish --------------------------------------------------------

export function PublishStep({
  value,
  onChange,
  onFinish,
  finishing,
  finishLabel = 'Finish setup',
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  onFinish: () => void;
  finishing: boolean;
  finishLabel?: string;
}) {
  return (
    <div>
      <h2 className="text-xl font-bold tracking-tight text-ink-50">Make yourself reachable?</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-400">
        Choose how senders find you. You can change this anytime in Settings.
      </p>

      <div className="mt-6 space-y-3">
        <ChoiceCard
          selected={value}
          icon={<Globe className="size-4.5" />}
          title="Publish my address"
          description="Anyone can pay you just by knowing your public address — we publish your meta-address on-chain so they can look it up. Convenient, but it's public that this account uses Shade."
          onClick={() => onChange(true)}
        />
        <ChoiceCard
          selected={!value}
          icon={<Lock className="size-4.5" />}
          title="Keep it private"
          description="Nothing is published. You share your meta-address yourself with each sender. More private, but more effort. You can publish later whenever you want."
          onClick={() => onChange(false)}
        />
      </div>

      <Button
        variant="primary"
        className="mt-8 w-full"
        loading={finishing}
        icon={<ArrowRight className="size-4" />}
        onClick={onFinish}
      >
        {finishLabel}
      </Button>
    </div>
  );
}

function ChoiceCard({
  selected,
  icon,
  title,
  description,
  onClick,
}: {
  selected: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-start gap-3.5 border p-4 text-left transition-colors ${
        selected
          ? 'border-copper-500 bg-copper-500/5'
          : 'border-ink-700 bg-ink-850 hover:border-ink-600'
      }`}
    >
      <span className={`mt-0.5 ${selected ? 'text-copper-400' : 'text-ink-400'}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink-50">{title}</span>
        <span className="mt-1 block text-[13px] leading-relaxed text-ink-400">{description}</span>
      </span>
      <span
        className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
          selected ? 'border-copper-500 bg-copper-500 text-onaccent' : 'border-ink-600'
        }`}
      >
        {selected && <Check className="size-3" />}
      </span>
    </button>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-4 text-[13px] text-ink-400 transition-colors hover:text-copper-400"
    >
      ← Back
    </button>
  );
}
