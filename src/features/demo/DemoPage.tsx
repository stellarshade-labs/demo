import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Eye, EyeOff, Radio, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { Panel, Well } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Status';

/**
 * A self-contained, no-network walkthrough of the full flow. Everything here is
 * simulated with canned data so a first-timer can watch a payment go from send
 * to claim without funds, a wallet, or a testnet round-trip.
 *
 * The page runs two views side by side: the participants' story on the left,
 * and "what the chain sees" on the right — the point of the protocol is the gap
 * between the two.
 */

const ALICE_ADDR = 'GDKX…LR2T';
const BOB_ACCT = 'GBOB…K4QX';
const BOB_META = 'shade:stellar:9f3ac2…d41b';
const STEALTH_ADDR = 'GBQY7Z3K…X29A';
const SEND_TX = 'a1b2c3d4e5f6…';
const CLAIM_TX = 'f6e5d4c3b2a1…';

type Stage = 0 | 1 | 2 | 3;

export function DemoPage() {
  const [stage, setStage] = useState<Stage>(0);
  const [working, setWorking] = useState(false);

  const advance = (to: Stage) => {
    setWorking(true);
    setTimeout(() => {
      setWorking(false);
      setStage(to);
    }, 900);
  };

  return (
    <div className="mx-auto max-w-5xl">
      <div className="max-w-2xl">
        <Link
          to="/send"
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-400 hover:text-copper-400"
        >
          <ArrowLeft className="size-3.5" />
          Back to the app
        </Link>
        <h1 className="mt-3 flex items-center gap-2 text-xl font-bold tracking-tight text-ink-50">
          <Sparkles className="size-5 text-copper-400" />
          End-to-end demo
        </h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-400">
          Watch a private payment travel from <strong className="text-ink-200">Alice</strong> to{' '}
          <strong className="text-ink-200">Bob</strong>, and watch what the rest of the world sees
          while it happens. Nothing here touches the network.
        </p>
        <div className="mt-4">
          <Notice tone="info">This is a simulation. No real funds, wallet, or transactions.</Notice>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {/* Step 1 — send */}
          <DemoStep
            n={1}
            active={stage === 0}
            done={stage > 0}
            icon={<Send className="size-4" />}
            title="Alice pays Bob"
            caption="Alice only needs Bob's meta-address. Shade generates a fresh one-time address that nobody can link back to Bob."
          >
            <Well className="mb-4 text-[13px] text-ink-300">
              Bob's meta-address: <span className="font-mono text-ink-100">{BOB_META}</span>
            </Well>
            {stage === 0 ? (
              <Button
                variant="primary"
                loading={working}
                icon={<Send className="size-4" />}
                onClick={() => advance(1)}
              >
                Send 25 XLM to Bob
              </Button>
            ) : (
              <div className="animate-shade-rise space-y-2 text-[13px]">
                <ResultLine>
                  Derived one-time stealth address{' '}
                  <span className="font-mono text-ink-100">{STEALTH_ADDR}</span>
                </ResultLine>
                <ResultLine>
                  Deposited 25 XLM · tx <span className="font-mono text-ink-100">{SEND_TX}</span>
                </ResultLine>
              </div>
            )}
          </DemoStep>

          {/* Step 2 — scan */}
          <DemoStep
            n={2}
            active={stage === 1}
            done={stage > 1}
            icon={<Eye className="size-4" />}
            title="Bob scans"
            caption="Bob's view key quietly recognizes the payment among all on-chain activity. Only he can tell it was meant for him."
          >
            {stage < 1 ? (
              <p className="text-[13px] text-ink-500">Waiting for Alice to send…</p>
            ) : stage === 1 ? (
              <div className="space-y-3">
                {working && (
                  <div className="relative overflow-hidden border border-ink-700 bg-ink-900 px-3 py-2 font-mono text-[11px] tracking-wider text-ink-400 animate-shade-sheen">
                    VIEW KEY · SCANNING LEDGER…
                  </div>
                )}
                <Button
                  variant="primary"
                  loading={working}
                  icon={<Radio className="size-4" />}
                  onClick={() => advance(2)}
                >
                  Scan for incoming payments
                </Button>
              </div>
            ) : (
              <div className="animate-shade-rise space-y-2 text-[13px]">
                <div className="inline-flex items-center gap-2 border border-signal-ok/40 bg-signal-ok/5 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-signal-ok">
                  1 payment detected
                </div>
                <ResultLine>
                  Matched <span className="font-mono text-ink-100">25 XLM</span> at{' '}
                  <span className="font-mono text-ink-100">{STEALTH_ADDR}</span>. Only Bob's key
                  makes this match
                </ResultLine>
              </div>
            )}
          </DemoStep>

          {/* Step 3 — claim */}
          <DemoStep
            n={3}
            active={stage === 2}
            done={stage > 2}
            icon={<ShieldCheck className="size-4" />}
            title="Bob claims"
            caption="Bob sweeps the funds to his own account. With the relayer, he doesn't even need a wallet or a fee."
            last
          >
            {stage < 2 ? (
              <p className="text-[13px] text-ink-500">Waiting for Bob to scan…</p>
            ) : stage === 2 ? (
              <Button
                variant="primary"
                loading={working}
                icon={<ShieldCheck className="size-4" />}
                onClick={() => advance(3)}
              >
                Claim 25 XLM
              </Button>
            ) : (
              <div className="animate-shade-rise space-y-2 text-[13px]">
                <ResultLine>
                  Claimed 25 XLM to <span className="font-mono text-ink-100">{BOB_ACCT}</span> · tx{' '}
                  <span className="font-mono text-ink-100">{CLAIM_TX}</span>
                </ResultLine>
                <p className="text-ink-400">
                  Done. On-chain, nothing connects Alice's payment to Bob's account. That link only
                  ever existed inside Bob's keys.
                </p>
              </div>
            )}
          </DemoStep>

          {stage === 3 && (
            <div className="animate-shade-rise flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setStage(0)}>
                Run it again
              </Button>
              <Link to="/receive">
                <Button variant="primary">Try it for real</Button>
              </Link>
            </div>
          )}
        </div>

        <ObserverPanel stage={stage} />
      </div>
    </div>
  );
}

/**
 * The other half of the demo: the public ledger as any third party sees it.
 * Each participant action lands here as a row — and the rows never mention Bob.
 */
function ObserverPanel({ stage }: { stage: Stage }) {
  return (
    <aside className="lg:sticky lg:top-20 lg:self-start">
      <Panel eyebrow="Observer view" title="What the chain sees">
        <p className="mb-4 text-[13px] leading-relaxed text-ink-400">
          The public ledger, as anyone sees it.
        </p>

        <div className="space-y-1.5 font-mono text-[11px] leading-relaxed">
          {/* Ambient traffic, so the payment lands among strangers. */}
          <LedgerRow dim>payment · GQTX…M4A2 → GDLW…R7NC · 112.4 XLM</LedgerRow>
          <LedgerRow dim>create_account · GS4K…PW2B · 41.0 XLM</LedgerRow>

          {stage >= 1 && (
            <LedgerRow highlight>
              payment · {ALICE_ADDR} → <span className="text-copper-300">{STEALTH_ADDR}</span> · 25
              XLM
            </LedgerRow>
          )}

          <LedgerRow dim>path_payment · GB2N…QD8F → GXCV…L2WM · 9.3 XLM</LedgerRow>

          {stage >= 3 && (
            <LedgerRow highlight>
              claim · pool → <span className="text-copper-300">{BOB_ACCT}</span> · 25 XLM
            </LedgerRow>
          )}
        </div>

        <div className="mt-4 space-y-2.5 border-t border-ink-700 pt-3 text-[12.5px] leading-relaxed text-ink-400">
          {stage === 0 && <p>Nothing yet. Alice hasn't sent.</p>}
          {stage >= 1 && (
            <ObserverNote>
              Alice paid <span className="font-mono">{STEALTH_ADDR}</span>, an address that has
              never appeared before and never will again. Nothing points at Bob.
            </ObserverNote>
          )}
          {stage >= 2 && (
            <ObserverNote muted>
              Bob just scanned, and the chain saw <em>nothing</em>. Scanning happens locally, with
              his view key.
            </ObserverNote>
          )}
          {stage >= 3 && (
            <ObserverNote>
              A pool payout reached <span className="font-mono">{BOB_ACCT}</span>. No visible tie to
              Alice's deposit.
            </ObserverNote>
          )}
          {stage === 3 && (
            <p className="pt-1 text-[12.5px] font-medium text-ink-200">
              Two rows, unlinkable. The connection only exists in Bob's keys.
            </p>
          )}
        </div>
      </Panel>
    </aside>
  );
}

function LedgerRow({
  children,
  dim,
  highlight,
}: {
  children: React.ReactNode;
  dim?: boolean;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? 'animate-shade-rise border border-copper-600/40 bg-copper-500/5 px-2 py-1 text-ink-200'
          : dim
            ? 'truncate px-2 py-1 text-ink-600'
            : 'truncate px-2 py-1 text-ink-400'
      }
    >
      {children}
    </div>
  );
}

function ObserverNote({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div className="animate-shade-rise flex items-start gap-2">
      {muted ? (
        <EyeOff className="mt-0.5 size-3.5 shrink-0 text-ink-500" />
      ) : (
        <Eye className="mt-0.5 size-3.5 shrink-0 text-copper-400" />
      )}
      <p className={muted ? 'text-ink-500' : undefined}>{children}</p>
    </div>
  );
}

function DemoStep({
  n,
  active,
  done,
  icon,
  title,
  caption,
  children,
  last,
}: {
  n: number;
  active: boolean;
  done: boolean;
  icon: React.ReactNode;
  title: string;
  caption: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className="relative pl-12">
      {!last && <span className="absolute left-[15px] top-8 h-full w-px bg-ink-700" />}
      <span
        className={`absolute left-0 top-0 flex size-8 items-center justify-center rounded-full border ${
          done
            ? 'border-signal-ok/50 bg-signal-ok/10 text-signal-ok'
            : active
              ? 'border-copper-500 bg-copper-500/10 text-copper-400'
              : 'border-ink-700 bg-ink-850 text-ink-500'
        }`}
      >
        {done ? <Check className="size-4" /> : icon}
      </span>

      <Panel
        className={active ? 'border-copper-500/40' : done ? '' : 'opacity-70'}
        eyebrow={`Step ${n}`}
        title={title}
      >
        <p className="mb-4 text-[13px] leading-relaxed text-ink-400">{caption}</p>
        {children}
      </Panel>
    </div>
  );
}

function ResultLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-ink-300">
      <Check className="mt-0.5 size-3.5 shrink-0 text-signal-ok" />
      <span>{children}</span>
    </div>
  );
}
