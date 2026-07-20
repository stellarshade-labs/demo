import { useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Download, Globe, History, Inbox, Search, Send, Trash2 } from 'lucide-react';
import type { IndexerAnnouncement } from 'stellar-shade';
import { indexerClient } from '@/lib/shade';
import { explorerTxUrl } from '@/config/network';
import { timeAgo, truncate } from '@/lib/format';
import { useSession, type TxKind, type TxRecord, type TxStatus } from '@/store/session';
import { Panel } from '@/components/ui/Panel';
import { Button } from '@/components/ui/Button';
import { EmptyState, Skeleton, StatusDot } from '@/components/ui/Status';

const KIND_META: Record<TxRecord['kind'], { label: string; Icon: typeof Send }> = {
  send: { label: 'Sent', Icon: Send },
  claim: { label: 'Claimed', Icon: Inbox },
  publish: { label: 'Published meta-address', Icon: Globe },
  unpublish: { label: 'Removed meta-address', Icon: Trash2 },
};

const KIND_FILTERS: { value: TxKind | 'all'; label: string }[] = [
  { value: 'all', label: 'All kinds' },
  { value: 'send', label: 'Sent' },
  { value: 'claim', label: 'Claimed' },
  { value: 'publish', label: 'Published' },
  { value: 'unpublish', label: 'Removed' },
];

const STATUS_FILTERS: { value: TxStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Any status' },
  { value: 'success', label: 'Success' },
  { value: 'pending', label: 'Pending' },
  { value: 'error', label: 'Error' },
];

/** RFC-4180 field escaping: wrap in quotes and double any embedded quotes. */
function csvCell(value: string | number | undefined): string {
  const s = value === undefined ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

/** Build a CSV blob from the given rows and trigger a download. */
function exportCsv(rows: TxRecord[]): void {
  const header = [
    'id',
    'kind',
    'status',
    'created_at',
    'amount',
    'asset',
    'counterparty',
    'stealth_address',
    'tx_hash',
    'error',
  ];
  const lines = [header.join(',')];
  for (const tx of rows) {
    lines.push(
      [
        csvCell(tx.id),
        csvCell(tx.kind),
        csvCell(tx.status),
        csvCell(new Date(tx.createdAt).toISOString()),
        csvCell(tx.amount),
        csvCell(tx.asset),
        csvCell(tx.counterparty),
        csvCell(tx.stealthAddress),
        csvCell(tx.txHash),
        csvCell(tx.error),
      ].join(','),
    );
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `shade-transactions-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function HistoryPage() {
  const transactions = useSession((s) => s.transactions);
  const clearTransactions = useSession((s) => s.clearTransactions);

  const [kind, setKind] = useState<TxKind | 'all'>('all');
  const [status, setStatus] = useState<TxStatus | 'all'>('all');
  const [query, setQuery] = useState('');

  // Apply the active filters. The text search matches the counterparty address,
  // the stealth address, and the tx hash — the fields a user would recognise.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (kind !== 'all' && tx.kind !== kind) return false;
      if (status !== 'all' && tx.status !== status) return false;
      if (q) {
        const haystack = [tx.counterparty, tx.stealthAddress, tx.txHash]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, kind, status, query]);

  const hasFilter = kind !== 'all' || status !== 'all' || query.trim() !== '';

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
              <div className="flex items-center gap-1">
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Download className="size-3.5" />}
                  disabled={filtered.length === 0}
                  onClick={() => exportCsv(filtered)}
                  title={hasFilter ? 'Export the filtered rows' : 'Export all transactions'}
                >
                  {hasFilter ? `Export ${filtered.length}` : 'Export CSV'}
                </Button>
                <Button variant="ghost" size="sm" onClick={clearTransactions}>
                  Clear
                </Button>
              </div>
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
            <>
              <div className="flex flex-wrap items-center gap-2 border-b border-ink-700 px-5 py-3">
                <div className="relative flex-1 min-w-[160px]">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-500" />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search address or tx hash"
                    className="h-9 w-full border border-ink-700 bg-ink-900 pl-8 pr-3 text-[13px] text-ink-50 placeholder:text-ink-600 focus:border-copper-500 focus:outline-none"
                  />
                </div>
                <FilterSelect
                  value={kind}
                  onChange={(v) => setKind(v as TxKind | 'all')}
                  options={KIND_FILTERS}
                />
                <FilterSelect
                  value={status}
                  onChange={(v) => setStatus(v as TxStatus | 'all')}
                  options={STATUS_FILTERS}
                />
              </div>

              {filtered.length === 0 ? (
                <EmptyState
                  icon={<Search className="size-6" />}
                  title="No matches"
                  description="No transactions match the current filters."
                />
              ) : (
                <ul className="divide-y divide-ink-700">
                  {filtered.map((tx) => (
                    <TxRow key={tx.id} tx={tx} />
                  ))}
                </ul>
              )}
            </>
          )}
        </Panel>
      </div>

      <aside>
        <AnnouncementFeed />
      </aside>
    </div>
  );
}

/** A compact native select styled to match the app's controls. */
function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 border border-ink-700 bg-ink-900 px-2 text-[13px] text-ink-100 focus:border-copper-500 focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
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
