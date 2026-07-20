import { useEffect, useState } from 'react';
import { ArrowUpRight, Globe, History, Inbox, Send, Trash2 } from 'lucide-react';
import type { IndexerAnnouncement } from 'stellar-shade';
import { indexerClient } from '@/lib/shade';
import { explorerTxUrl } from '@/config/network';
import { timeAgo, truncate } from '@/lib/format';
import { useSession, type TxRecord } from '@/store/session';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { EmptyState, Skeleton, StatusDot } from '@/components/ui/Status';

const KIND_META: Record<TxRecord['kind'], { label: string; Icon: typeof Send }> = {
  send: { label: 'Sent', Icon: Send },
  claim: { label: 'Claimed', Icon: Inbox },
  publish: { label: 'Published meta-address', Icon: Globe },
  unpublish: { label: 'Removed meta-address', Icon: Trash2 },
};

export function HistoryPage() {
  const transactions = useSession((s) => s.transactions);
  const clearTransactions = useSession((s) => s.clearTransactions);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-5">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink-50">Activity</h1>
          <p className="mt-1.5 max-w-xl text-[13px] leading-relaxed text-ink-400">
            Everything this browser has done. Kept locally — it survives a refresh but never leaves
            your machine.
          </p>
        </div>

        <Panel
          eyebrow="Local"
          title="Your transactions"
          bodyClassName=""
          action={
            transactions.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearTransactions}>
                Clear
              </Button>
            )
          }
        >
          {transactions.length === 0 ? (
            <EmptyState
              icon={<History className="size-6" />}
              title="No activity yet"
              description="Sends, claims, and meta-address publications will be listed here."
            />
          ) : (
            <ul className="divide-y divide-ink-700">
              {transactions.map((tx) => (
                <TxRow key={tx.id} tx={tx} />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <aside>
        <AnnouncementFeed />
      </aside>
    </div>
  );
}

function TxRow({ tx }: { tx: TxRecord }) {
  const { label, Icon } = KIND_META[tx.kind];
  const state = tx.status === 'success' ? 'ok' : tx.status === 'pending' ? 'wait' : 'bad';

  return (
    <li className="flex items-start gap-4 px-5 py-4">
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-500" />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium text-ink-100">{label}</span>
          {tx.amount !== undefined && (
            <span className="font-mono text-sm text-ink-50">
              {tx.amount} <span className="text-ink-400">{tx.asset ?? 'XLM'}</span>
            </span>
          )}
        </div>

        {tx.counterparty && tx.kind === 'send' && (
          <div className="mt-0.5 truncate font-mono text-xs text-ink-500">
            to {truncate(tx.counterparty, 10, 6)}
          </div>
        )}
        {tx.stealthAddress && (
          <div className="mt-0.5 truncate font-mono text-xs text-ink-600">
            via {truncate(tx.stealthAddress, 8, 6)}
          </div>
        )}
        {tx.error && <div className="mt-1 text-xs text-signal-bad">{tx.error}</div>}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ink-500">
          <StatusDot state={state} />
          {tx.status}
        </span>
        <span className="font-mono text-[10px] text-ink-600">{timeAgo(tx.createdAt)}</span>
        {tx.txHash && (
          <a
            href={explorerTxUrl(tx.txHash)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-0.5 font-mono text-[10px] text-ink-500 hover:text-copper-400"
          >
            {truncate(tx.txHash, 6, 4)}
            <ArrowUpRight className="size-2.5" />
          </a>
        )}
      </div>
    </li>
  );
}

/**
 * Network-wide announcement feed from the indexer. Every stealth deposit shows
 * up here, for everyone — which is the point: the anonymity set is public, but
 * only the holder of a view key can tell which entries are theirs.
 */
function AnnouncementFeed() {
  const [records, setRecords] = useState<IndexerAnnouncement[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const health = await indexerClient.health();
        const page = await indexerClient.getAnnouncements(
          health.startCursor ?? undefined,
          25,
        );
        if (!cancelled) setRecords(page.records.slice(-25).reverse());
      } catch {
        if (!cancelled) setError('Indexer unreachable.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Panel eyebrow="Network" title="Recent announcements" bodyClassName="">
      <p className="border-b border-ink-700 px-5 py-3 text-xs leading-relaxed text-ink-500">
        Every stealth deposit on this network. Indistinguishable from one another — that shared
        crowd is what makes any single payment private.
      </p>

      {error ? (
        <EmptyState title="Feed unavailable" description={error} />
      ) : records === null ? (
        <div className="space-y-px">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : records.length === 0 ? (
        <EmptyState title="No announcements yet" description="Be the first to send one." />
      ) : (
        <ul className="max-h-[420px] divide-y divide-ink-700 overflow-y-auto">
          {records.map((record) => (
            <li key={record.hash} className="flex items-center gap-3 px-5 py-2.5">
              <StatusDot state={record.successful ? 'ok' : 'bad'} />
              <a
                href={explorerTxUrl(record.hash)}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate font-mono text-xs text-ink-400 hover:text-copper-400"
              >
                {truncate(record.hash, 10, 6)}
              </a>
              <span className="shrink-0 font-mono text-[10px] text-ink-600">
                {timeAgo(record.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
