import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Eye, Radio, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { Panel, Well } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Status';

/**
 * A self-contained, no-network walkthrough of the full flow. Everything here is
 * simulated with canned data so a first-timer can watch a payment go from send
 * to claim without funds, a wallet, or a testnet round-trip.
 */

const BOB_META = 'shade:stellar:9f3ac2…d41b';
const STEALTH_ADDR = 'GBQY7Z3K…STEALTH…X29A';
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
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
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
          <strong className="text-ink-200">Bob</strong> and back out again. Nothing here touches the
          network.
        </p>
      </div>

      <Notice tone="info">This is a simulation — no real funds, wallet, or transactions.</Notice>

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
          <Button variant="primary" loading={working} icon={<Send className="size-4" />} onClick={() => advance(1)}>
            Send 25 XLM to Bob
          </Button>
        ) : (
          <div className="space-y-2 text-[13px]">
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
          <Button variant="primary" loading={working} icon={<Radio className="size-4" />} onClick={() => advance(2)}>
            Scan for incoming payments
          </Button>
        ) : (
          <ResultLine>
            Detected <span className="font-mono text-ink-100">25 XLM</span> at{' '}
            <span className="font-mono text-ink-100">{STEALTH_ADDR}</span>
          </ResultLine>
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
          <Button variant="primary" loading={working} icon={<ShieldCheck className="size-4" />} onClick={() => advance(3)}>
            Claim 25 XLM
          </Button>
        ) : (
          <div className="space-y-2 text-[13px]">
            <ResultLine>
              Claimed 25 XLM · tx <span className="font-mono text-ink-100">{CLAIM_TX}</span>
            </ResultLine>
            <p className="text-ink-400">
              Done. On-chain, nothing connects Alice's payment to Bob's account — that link only ever
              existed inside Bob's keys.
            </p>
          </div>
        )}
      </DemoStep>

      {stage === 3 && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setStage(0)}>
            Run it again
          </Button>
          <Link to="/receive">
            <Button variant="primary">Try it for real</Button>
          </Link>
        </div>
      )}
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
