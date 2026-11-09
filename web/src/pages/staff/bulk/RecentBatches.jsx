import { Download, FileSpreadsheet, History, RefreshCw } from 'lucide-react';
import { Badge, Button, cx } from '../../../components/ui.jsx';
import { EmptyState, Panel } from '../adminKit.jsx';
import { Skeleton, formatTime, timeAgo, useNow } from '../shared.jsx';
import { fmt } from './common.jsx';

function Count({ n, tone }) {
  if (!n) return <span className="text-sm text-ink-400 tabular-nums">0</span>;
  return <Badge tone={tone} className="tabular-nums">{fmt(n)}</Badge>;
}

export default function RecentBatches({ batches, loading, error, onReload, onDownload, highlight }) {
  const now = useNow();
  let body;
  if (error && !batches) {
    body = (
      <EmptyState icon={History} title="Could not load batches"
        action={<Button variant="secondary" size="sm" icon={RefreshCw} onClick={onReload}>Retry</Button>}>
        <span className="text-danger-600">{error}</span>
      </EmptyState>
    );
  } else if (!batches) {
    body = <div className="p-5 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>;
  } else if (batches.length === 0) {
    body = (
      <EmptyState icon={History} title="No uploads yet">
        Batches appear here after you register attendees from a spreadsheet.
      </EmptyState>
    );
  } else {
    body = (
      <>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-500 border-b border-slate-100">
              <tr>
                <th className="pl-5 pr-3 py-2.5 font-semibold">File</th>
                <th className="px-3 py-2.5 font-semibold">Batch ID</th>
                <th className="px-3 py-2.5 font-semibold">Uploaded by</th>
                <th className="px-3 py-2.5 font-semibold">When</th>
                <th className="px-3 py-2.5 font-semibold text-right">Created</th>
                <th className="px-3 py-2.5 font-semibold text-right">Skipped</th>
                <th className="px-3 py-2.5 font-semibold text-right">Failed</th>
                <th className="pl-3 pr-5 py-2.5 font-semibold text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {batches.map((b) => (
                <tr key={b.batchId} className={cx('transition-colors', highlight === b.batchId ? 'bg-brand-50/70' : 'hover:bg-slate-50/80')}>
                  <td className="pl-5 pr-3 py-3 max-w-72">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="size-8 rounded-lg bg-success-50 text-success-600 grid place-items-center shrink-0"><FileSpreadsheet className="size-4" /></span>
                      <span className="font-semibold text-ink-900 truncate" title={b.fileName}>{b.fileName || 'Untitled upload'}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3"><span className="font-mono text-xs text-ink-600 bg-slate-100 rounded-md px-1.5 py-0.5 whitespace-nowrap">{b.batchId}</span></td>
                  <td className="px-3 py-3 text-ink-600 whitespace-nowrap">{b.createdBy || '—'}</td>
                  <td className="px-3 py-3 text-ink-600 whitespace-nowrap" title={formatTime(b.createdAt)}>{timeAgo(b.createdAt, now)}</td>
                  <td className="px-3 py-3 text-right"><Count n={b.created} tone="success" /></td>
                  <td className="px-3 py-3 text-right"><Count n={b.skipped} tone="warn" /></td>
                  <td className="px-3 py-3 text-right"><Count n={b.failed} tone="danger" /></td>
                  <td className="pl-3 pr-5 py-3 text-right">
                    <Button variant="secondary" size="sm" icon={Download} disabled={!b.created} onClick={() => onDownload(b.batchId)} className="whitespace-nowrap">
                      Download passes
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="md:hidden divide-y divide-slate-100">
          {batches.map((b) => (
            <li key={b.batchId} className={cx('px-4 py-3.5', highlight === b.batchId && 'bg-brand-50/70')}>
              <div className="flex items-start gap-3">
                <span className="size-9 rounded-lg bg-success-50 text-success-600 grid place-items-center shrink-0"><FileSpreadsheet className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate" title={b.fileName}>{b.fileName || 'Untitled upload'}</p>
                  <p className="text-xs text-ink-500 truncate">
                    <span className="font-mono">{b.batchId}</span> · <span title={formatTime(b.createdAt)}>{timeAgo(b.createdAt, now)}</span>
                    {b.createdBy && <> · {b.createdBy}</>}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <Badge tone="success" className="tabular-nums">{fmt(b.created)} created</Badge>
                    {b.skipped > 0 && <Badge tone="warn" className="tabular-nums">{fmt(b.skipped)} skipped</Badge>}
                    {b.failed > 0 && <Badge tone="danger" className="tabular-nums">{fmt(b.failed)} failed</Badge>}
                  </div>
                </div>
              </div>
              <Button variant="secondary" size="sm" icon={Download} disabled={!b.created} onClick={() => onDownload(b.batchId)} className="mt-3 w-full">
                Download passes
              </Button>
            </li>
          ))}
        </ul>
      </>
    );
  }

  return (
    <Panel icon={History} title="Recent batches" description="Every spreadsheet upload, newest first." bodyClassName="p-0"
      actions={(
        <Button variant="ghost" size="sm" onClick={onReload} disabled={loading} aria-label="Refresh batches">
          <RefreshCw className={cx('size-4', loading && 'animate-spin')} /><span className="hidden sm:inline">Refresh</span>
        </Button>
      )}>
      {body}
    </Panel>
  );
}
