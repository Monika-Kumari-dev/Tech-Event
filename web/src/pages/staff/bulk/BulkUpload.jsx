import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Copy, Download, FileSpreadsheet, FileWarning, ListChecks, Pause, Play,
  QrCode, RefreshCw, Rows3, Send, Settings2, Upload, UserCheck, UserPlus, Users, X, XCircle,
} from 'lucide-react';
import { Badge, Button, Spinner, cx } from '../../../components/ui.jsx';
import { EmptyState, Panel, StatTile } from '../adminKit.jsx';
import {
  CHUNK_SIZE, FIELDS, MAX_ROWS, TEMPLATE_HEADERS, TEMPLATE_ROWS, analyzeGrid, buildErrorReport, colLetter,
  extractRows, formatBytes, missingFields, summarize, toChunks, validateRows,
} from './parse.js';
import { downloadXlsx, readSpreadsheet, today } from './libs.js';
import { Alert, ProgressBar, Segmented, errorMessage, fmt, plural, useBeforeUnload } from './common.jsx';

const ACCEPT = '.xlsx,.xls,.csv';
const MAX_BYTES = 15 * 1024 * 1024;
const PAGE = 50;
// Grid spans inside the upload section (2 cols on phones/tablets, 12 from lg).
const FULL = 'col-span-2 lg:col-span-12';

export async function downloadTemplate(toast) {
  try {
    await downloadXlsx([TEMPLATE_HEADERS, ...TEMPLATE_ROWS], 'TeckFluenceX-attendees-template.xlsx', { sheetName: 'Attendees', widths: [26, 18, 32, 28] });
    toast('success', 'Template downloaded', 'Fill it in, then drop it here.');
  } catch (e) {
    toast('error', 'Could not create the template', errorMessage(e));
  }
}

/** Upload stage for the step guide: 'empty' | 'review' | 'uploading' | 'done'. */
function stageOf(upload, grid) {
  if (upload) return upload.status === 'done' || upload.status === 'cancelled' ? 'done' : 'uploading';
  return grid ? 'review' : 'empty';
}

export default function BulkUpload({ call, online, toast, onUploaded, onDownloadBatch, onStageChange }) {
  const [file, setFile] = useState(null); // { name, size }
  const [grid, setGrid] = useState(null); // { aoa, firstRow, sheetName, sheetCount }
  const [mapping, setMapping] = useState(null);
  const [showMapping, setShowMapping] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [upload, setUpload] = useState(null);
  const cancelRef = useRef(false);
  const pauseRef = useRef(false);
  const runRef = useRef({ chunks: [], batchId: null, created: [], skipped: [], failed: [] });

  const analysis = useMemo(() => (grid ? analyzeGrid(grid.aoa) : null), [grid]);
  const missing = mapping ? missingFields(mapping) : [];
  const rows = useMemo(() => {
    if (!grid || !analysis || !mapping || missingFields(mapping).length) return [];
    return validateRows(extractRows(grid.aoa, analysis.headerIndex, mapping, grid.firstRow));
  }, [grid, analysis, mapping]);
  const counts = useMemo(() => summarize(rows), [rows]);
  const busy = upload?.status === 'running';
  useBeforeUnload(busy);

  const stage = stageOf(upload, grid);
  useEffect(() => { onStageChange?.(stage); }, [stage, onStageChange]);

  const filtered = useMemo(() => {
    if (filter === 'ready') return rows.filter((r) => r.status === 'ready');
    if (filter === 'errors') return rows.filter((r) => r.status === 'error');
    if (filter === 'duplicates') return rows.filter((r) => r.status === 'duplicate');
    return rows;
  }, [rows, filter]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));
  useEffect(() => { setPage(1); }, [filter, rows]);

  function reset() {
    setFile(null); setGrid(null); setMapping(null); setShowMapping(false); setParseError(''); setUpload(null); setFilter('all');
  }

  async function onFile(f) {
    if (!f) return;
    if (!/\.(xlsx|xls|csv)$/i.test(f.name)) { setParseError(`“${f.name}” is not a spreadsheet. Use .xlsx, .xls or .csv.`); return; }
    if (f.size > MAX_BYTES) { setParseError(`This file is ${formatBytes(f.size)}. The limit is ${formatBytes(MAX_BYTES)}.`); return; }
    setParsing(true); setParseError(''); setUpload(null);
    try {
      const g = await readSpreadsheet(f);
      const a = analyzeGrid(g.aoa);
      if (a.headerIndex === -1) throw new Error('The first sheet is empty.');
      if (a.dataRowCount === 0) throw new Error('No attendee rows found below the header row.');
      if (a.dataRowCount > MAX_ROWS) throw new Error(`This file has ${fmt(a.dataRowCount)} rows. Split it into files of up to ${fmt(MAX_ROWS)} rows.`);
      setFile({ name: f.name, size: f.size });
      setGrid(g);
      setMapping(a.mapping);
      setShowMapping(a.missing.length > 0);
      setFilter('all');
    } catch (e) {
      setParseError(errorMessage(e, 'This file could not be read.'));
    } finally {
      setParsing(false);
    }
  }

  async function start() {
    const chunks = toChunks(rows, CHUNK_SIZE);
    runRef.current = { chunks, batchId: null, created: [], skipped: [], failed: [] };
    setUpload({
      status: 'running', next: 0, chunks: chunks.length, total: chunks.reduce((a, c) => a + c.length, 0),
      sent: 0, created: 0, skipped: 0, failed: 0, batchId: null, error: '',
    });
    await run(0);
  }

  async function run(from) {
    cancelRef.current = false;
    pauseRef.current = false;
    const R = runRef.current;
    setUpload((u) => ({ ...u, status: 'running', error: '', pausing: false, cancelling: false }));
    for (let i = from; i < R.chunks.length; i++) {
      if (cancelRef.current) { finish('cancelled', i); return; }
      if (pauseRef.current) {
        setUpload((u) => ({ ...u, status: 'paused', next: i, pausing: false }));
        toast('info', 'Upload paused', 'Rows already sent are safe. Resume when you are ready.');
        return;
      }
      try {
        const res = await call('/admin/users/bulk', {
          method: 'POST',
          body: { ...(R.batchId ? { batchId: R.batchId } : {}), fileName: file.name, rows: R.chunks[i] },
        });
        if (res.batchId) R.batchId = res.batchId;
        for (const c of res.created || []) R.created.push({ row: c.row, id: c.user?.id, code: c.user?.code });
        R.skipped.push(...(res.skipped || []));
        R.failed.push(...(res.failed || []));
        setUpload((u) => ({
          ...u, next: i + 1, sent: u.sent + R.chunks[i].length, batchId: R.batchId,
          created: R.created.length, skipped: R.skipped.length, failed: R.failed.length,
        }));
      } catch (e) {
        const msg = errorMessage(e, 'Upload failed.');
        setUpload((u) => ({ ...u, status: 'error', next: i, error: msg, pausing: false }));
        toast('error', 'Upload paused', msg);
        return;
      }
    }
    finish('done', R.chunks.length);
  }

  function finish(status, next) {
    const R = runRef.current;
    setUpload((u) => ({ ...u, status, next }));
    if (R.created.length) {
      toast('success', `${plural(R.created.length, 'attendee')} registered`, R.batchId ? `Batch ${R.batchId}` : undefined);
    } else if (status === 'done') {
      toast('warn', 'No new attendees', 'Every row was already registered or rejected.');
    }
    if (status === 'cancelled') toast('info', 'Upload stopped', 'Rows that were not sent are listed in the error report.');
    if (R.batchId) onUploaded?.(R.batchId);
  }

  async function downloadReport() {
    const R = runRef.current;
    const unsent = new Set();
    if (upload && upload.status !== 'done') for (const c of R.chunks.slice(upload.next)) for (const r of c) unsent.add(r.row);
    const aoa = buildErrorReport(analysis.headers, rows, { skipped: R.skipped, failed: R.failed, unsent });
    if (aoa.length <= 1) { toast('info', 'Nothing to report', 'Every row was registered.'); return; }
    try {
      await downloadXlsx(aoa, `TeckFluenceX-error-report-${R.batchId || today()}.xlsx`, {
        sheetName: 'Issues', widths: [6, ...analysis.headers.map(() => 22), 18, 48],
      });
      toast('success', 'Error report downloaded', plural(aoa.length - 1, 'row'));
    } catch (e) {
      toast('error', 'Could not create the report', errorMessage(e));
    }
  }

  // ---------- render ----------
  let body;
  if (upload) {
    body = (
      <UploadProgress upload={upload} counts={counts} fileName={file?.name} online={online}
        onPause={() => { pauseRef.current = true; setUpload((u) => ({ ...u, pausing: true })); }}
        onCancel={() => { cancelRef.current = true; setUpload((u) => ({ ...u, cancelling: true })); }}
        onResume={() => run(upload.next)} onStop={() => finish('cancelled', upload.next)}
        onReport={downloadReport} onPasses={() => onDownloadBatch(upload.batchId)} onNew={reset} />
    );
  } else if (!grid) {
    body = (
      <>
        <Panel className="col-span-2 lg:col-span-7 xl:col-span-8" icon={Upload} title="Upload attendee spreadsheet"
          description="Register many attendees at once from an Excel or CSV file." bodyClassName="p-5 flex flex-col gap-3">
          <DropZone onFile={onFile} parsing={parsing} />
          {parseError && <Alert>{parseError}</Alert>}
        </Panel>
        <TemplateTips className="col-span-2 lg:col-span-5 xl:col-span-4" onTemplate={() => downloadTemplate(toast)} />
      </>
    );
  } else {
    const leftOut = counts.error + counts.duplicate;
    const from = filtered.length ? (page - 1) * PAGE + 1 : 0;
    const to = Math.min(page * PAGE, filtered.length);
    const filterOptions = [
      { id: 'all', label: 'All', n: counts.total },
      { id: 'ready', label: 'Ready', n: counts.ready, tone: 'success' },
      { id: 'errors', label: 'Errors', n: counts.error, tone: 'danger' },
      { id: 'duplicates', label: 'Duplicates', n: counts.duplicate, tone: 'warn' },
    ];
    body = (
      <>
        <FileBar className={FULL} file={file} grid={grid} rowCount={analysis.dataRowCount} parsing={parsing}
          onRemove={reset} onReplace={onFile} onMapping={() => setShowMapping((s) => !s)} mappingOpen={showMapping} />
        {parseError && <div className={FULL}><Alert>{parseError}</Alert></div>}
        {(showMapping || missing.length > 0) && (
          <MappingEditor className={FULL} headers={analysis.headers} sample={grid.aoa[analysis.headerIndex + 1] || []} mapping={mapping}
            onChange={setMapping} missing={missing} onClose={missing.length ? undefined : () => setShowMapping(false)} />
        )}
        {missing.length === 0 && (
          <>
            <KpiTile label="Total rows" value={counts.total} icon={Rows3} tone="neutral" sub={`From sheet “${grid.sheetName}”`}
              active={filter === 'all'} onClick={() => setFilter('all')} />
            <KpiTile label="Ready" value={counts.ready} icon={CheckCircle2} tone="success" sub="Will be registered"
              active={filter === 'ready'} onClick={() => setFilter('ready')} />
            <KpiTile label="Errors" value={counts.error} icon={XCircle} tone="danger" sub={counts.error ? 'Left out · see reasons below' : 'No invalid rows'}
              active={filter === 'errors'} onClick={() => setFilter('errors')} />
            <KpiTile label="Duplicates in file" value={counts.duplicate} icon={Copy} tone="warn" sub={counts.duplicate ? 'First occurrence is kept' : 'No repeated rows'}
              active={filter === 'duplicates'} onClick={() => setFilter('duplicates')} />

            <Panel className={FULL} icon={ListChecks} title="Review rows" bodyClassName="p-0 flex flex-col"
              description={leftOut ? `${plural(counts.ready, 'row')} ready · ${plural(leftOut, 'row')} will be left out` : `All ${plural(counts.total, 'row')} passed validation`}
              actions={<div className="hidden md:block"><Segmented options={filterOptions} value={filter} onChange={setFilter} label="Filter rows" /></div>}>
              <div className="md:hidden px-4 pt-3">
                <Segmented options={filterOptions} value={filter} onChange={setFilter} label="Filter rows" />
              </div>
              <PreviewTable rows={filtered.slice((page - 1) * PAGE, page * PAGE)} filter={filter} />
              {filtered.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-t border-slate-100 text-sm">
                  <p className="text-ink-500 tabular-nums">
                    Showing <b className="text-ink-900">{fmt(from)}–{fmt(to)}</b> of <b className="text-ink-900">{fmt(filtered.length)}</b>
                  </p>
                  {pages > 1 && (
                    <div className="flex items-center gap-2">
                      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft className="size-4" /></Button>
                      <span className="tabular-nums text-ink-600 min-w-20 text-center">Page <b className="text-ink-900">{fmt(page)}</b> of {fmt(pages)}</span>
                      <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight className="size-4" /></Button>
                    </div>
                  )}
                </div>
              )}
              <div className="sticky bottom-0 z-20 mt-auto flex flex-col-reverse sm:flex-row sm:items-center gap-3 px-5 py-3.5 border-t border-slate-200 bg-white/95 backdrop-blur rounded-b-2xl">
                <p className="text-xs text-ink-500 sm:mr-auto">
                  {online
                    ? <>Sent in batches of {fmt(CHUNK_SIZE)}. Emails or mobiles that are already registered are skipped.</>
                    : <span className="text-danger-600 font-semibold">You are offline. Reconnect to register attendees.</span>}
                </p>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={reset} className="flex-1 sm:flex-none">Cancel</Button>
                  <Button icon={UserPlus} disabled={!counts.ready || !online} onClick={start} className="flex-[2] sm:flex-none">
                    Register {plural(counts.ready, 'attendee')}
                  </Button>
                </div>
              </div>
            </Panel>
          </>
        )}
      </>
    );
  }

  return <div className="grid grid-cols-2 lg:grid-cols-12 gap-4 xl:gap-5">{body}</div>;
}

function KpiTile({ active, ...props }) {
  return (
    <div className="col-span-1 lg:col-span-3 min-w-0">
      <StatTile {...props} value={fmt(props.value)}
        className={cx('max-sm:p-4', active && 'outline-2 outline-brand-500 outline-offset-0')} />
    </div>
  );
}

function TemplateTips({ className, onTemplate }) {
  const tips = [
    `Up to ${fmt(MAX_ROWS)} rows per file is fine`,
    'Duplicates are skipped automatically',
    'Only the first sheet is read; blank rows are ignored',
  ];
  return (
    <Panel className={className} icon={FileSpreadsheet} title="Template & tips" description="Start from our template for the cleanest import."
      bodyClassName="p-5 flex flex-col gap-5">
      <Button variant="secondary" icon={Download} onClick={onTemplate} className="w-full">Download template (.xlsx)</Button>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-2">Required columns</p>
        <div className="flex flex-wrap gap-1.5">
          {FIELDS.map((f) => (
            <span key={f.key} className={cx('inline-flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-semibold',
              f.required ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-200' : 'bg-white text-ink-500 border border-dashed border-slate-300')}>
              {f.label}{f.required ? <span className="text-danger-600">*</span> : <span className="font-normal">(optional)</span>}
            </span>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-400 mb-2">Accepted formats</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {['.xlsx', '.xls', '.csv'].map((x) => (
            <span key={x} className="inline-flex items-center h-7 px-2.5 rounded-lg bg-slate-100 text-xs font-mono font-semibold text-ink-700">{x}</span>
          ))}
          <span className="text-xs text-ink-500 ml-1">up to {formatBytes(MAX_BYTES)}</span>
        </div>
      </div>
      <ul className="mt-auto space-y-2 pt-4 border-t border-slate-100">
        {tips.map((t) => (
          <li key={t} className="flex gap-2 text-sm text-ink-600">
            <CheckCircle2 className="size-4 text-success-500 shrink-0 mt-0.5" />{t}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function DropZone({ onFile, parsing }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  return (
    <div
      role="button" tabIndex={0} aria-label="Choose a spreadsheet to upload"
      onClick={() => !parsing && input.current?.click()}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !parsing) { e.preventDefault(); input.current?.click(); } }}
      onDragEnter={(e) => { e.preventDefault(); depth.current++; setOver(true); }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
      onDragLeave={() => { depth.current = Math.max(0, depth.current - 1); if (!depth.current) setOver(false); }}
      onDrop={(e) => { e.preventDefault(); depth.current = 0; setOver(false); if (!parsing) onFile(e.dataTransfer.files?.[0]); }}
      className={cx('flex-1 min-h-64 lg:min-h-80 grid place-items-center rounded-xl border-2 border-dashed px-4 py-10 text-center cursor-pointer transition outline-none',
        'focus-visible:ring-2 focus-visible:ring-brand-500',
        over ? 'border-brand-500 bg-brand-50' : 'border-slate-200 bg-slate-50/50 hover:border-brand-200 hover:bg-brand-50/30')}
    >
      <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1}
        onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      {parsing ? (
        <div className="flex flex-col items-center gap-3"><Spinner className="size-8" /><p className="font-semibold">Reading spreadsheet…</p></div>
      ) : (
        <div className="flex flex-col items-center">
          <span className={cx('size-16 rounded-2xl grid place-items-center transition shadow-sm', over ? 'bg-brand-600 text-white' : 'bg-white text-brand-600 ring-1 ring-slate-900/5')}>
            <Upload className="size-7" />
          </span>
          <p className="mt-4 text-base font-semibold text-ink-900">
            {over ? 'Drop to read the file' : 'Drag & drop your spreadsheet here'}
          </p>
          <p className="text-sm text-ink-500 mt-1">or</p>
          <span className="mt-3 inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand-600 text-white text-sm font-semibold shadow-sm shadow-brand-600/30">
            <FileSpreadsheet className="size-4" />Browse files
          </span>
          <p className="text-xs text-ink-500 mt-4">.xlsx, .xls or .csv · up to {formatBytes(MAX_BYTES)} · {fmt(MAX_ROWS)} rows max</p>
        </div>
      )}
    </div>
  );
}

function FileBar({ className, file, grid, rowCount, parsing, onRemove, onReplace, onMapping, mappingOpen }) {
  const input = useRef(null);
  const meta = [
    ['Size', formatBytes(file.size)],
    ['Sheet', `“${grid.sheetName}”${grid.sheetCount > 1 ? ` (+${fmt(grid.sheetCount - 1)} ignored)` : ''}`],
    ['Rows', fmt(rowCount)],
  ];
  return (
    <Panel className={className} bodyClassName="p-4 sm:px-5">
      <div className="flex flex-wrap lg:flex-nowrap items-center gap-x-4 gap-y-3">
        <span className="size-11 rounded-xl bg-success-50 text-success-600 grid place-items-center shrink-0"><FileSpreadsheet className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink-900 truncate" title={file.name}>{file.name}</p>
          <p className="text-xs text-success-600 font-medium flex items-center gap-1"><CheckCircle2 className="size-3.5" />Parsed successfully</p>
        </div>
        <dl className="order-last lg:order-none w-full lg:w-auto flex flex-wrap gap-x-6 gap-y-1 lg:px-6 lg:border-x border-slate-100">
          {meta.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{k}</dt>
              <dd className="text-sm font-semibold text-ink-900 tabular-nums truncate max-w-56">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center gap-2 shrink-0">
          <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1}
            onChange={(e) => { onReplace(e.target.files?.[0]); e.target.value = ''; }} />
          <Button variant={mappingOpen ? 'secondary' : 'ghost'} size="sm" icon={Settings2} onClick={onMapping} aria-expanded={mappingOpen}>
            <span className="hidden sm:inline">Columns</span>
          </Button>
          <Button variant="secondary" size="sm" icon={RefreshCw} loading={parsing} onClick={() => input.current?.click()}>Replace</Button>
          <Button variant="ghost" size="sm" icon={X} onClick={onRemove} className="text-danger-600 hover:bg-danger-50">Remove</Button>
        </div>
      </div>
    </Panel>
  );
}

function MappingEditor({ className, headers, sample, mapping, onChange, missing, onClose }) {
  return (
    <Panel className={className} icon={Settings2} title="Column mapping" description="Match each field to a column in your file."
      actions={onClose && <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close column mapping"><X className="size-4" /></Button>}>
      {missing.length > 0 && (
        <div className="mb-4"><Alert tone="warn">
          We couldn’t find {missing.map((k) => FIELDS.find((f) => f.key === k).label).join(', ')} in the header row. Pick the matching column below.
        </Alert></div>
      )}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {FIELDS.map((f) => {
          const idx = mapping[f.key] ?? -1;
          const bad = f.required && idx < 0;
          return (
            <label key={f.key} className="block min-w-0">
              <span className="block text-sm font-medium text-ink-700 mb-1.5">
                {f.label} {f.required ? <span className="text-danger-600">*</span> : <span className="text-ink-400 font-normal">(optional)</span>}
              </span>
              <select value={idx} onChange={(e) => onChange({ ...mapping, [f.key]: Number(e.target.value) })}
                className={cx('w-full h-10 rounded-lg bg-white px-3 ring-1 outline-none focus:ring-2 focus:ring-brand-500 text-sm', bad ? 'ring-danger-500' : 'ring-slate-200')}>
                <option value={-1}>{f.required ? 'Choose a column…' : 'Not in file'}</option>
                {headers.map((h, i) => <option key={i} value={i}>{colLetter(i)} · {h}</option>)}
              </select>
              <span className="block text-xs text-ink-500 mt-1 truncate">
                {idx >= 0 ? <>e.g. {String(sample[idx] ?? '') || <em>empty</em>}</> : ' '}
              </span>
            </label>
          );
        })}
      </div>
    </Panel>
  );
}

function StatusPill({ r }) {
  if (r.status === 'ready') return <Badge tone="success"><CheckCircle2 className="size-3.5" />Ready</Badge>;
  if (r.status === 'duplicate') return <Badge tone="warn"><Copy className="size-3.5" />Duplicate</Badge>;
  return <Badge tone="danger"><XCircle className="size-3.5" />Error</Badge>;
}

const dash = <span className="text-ink-400">—</span>;

function PreviewTable({ rows, filter }) {
  if (!rows.length) {
    const ok = filter === 'errors' || filter === 'duplicates';
    return (
      <div className="px-5">
        <EmptyState icon={ok ? CheckCircle2 : Users} title={ok ? 'No problems found' : 'No rows in this view'}>
          {ok ? `No ${filter === 'errors' ? 'invalid' : 'duplicate'} rows in this file.` : 'Try another filter.'}
        </EmptyState>
      </div>
    );
  }
  return (
    <>
      {/* desktop table */}
      <div className="hidden md:block max-h-[min(600px,62vh)] overflow-auto">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-16" /><col className="w-[16%]" /><col className="w-[13%]" /><col className="w-[20%]" />
            <col className="w-[13%]" /><col className="w-28" /><col />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur text-left text-[11px] font-semibold uppercase tracking-wide text-ink-500 shadow-[inset_0_-1px_0_rgb(226_232_240)]">
            <tr>
              <th className="pl-5 pr-2 py-2.5 font-semibold">Row</th>
              <th className="px-3 py-2.5 font-semibold">Name</th>
              <th className="px-3 py-2.5 font-semibold">Mobile</th>
              <th className="px-3 py-2.5 font-semibold">Email</th>
              <th className="px-3 py-2.5 font-semibold">Organization</th>
              <th className="px-3 py-2.5 font-semibold">Status</th>
              <th className="pl-3 pr-5 py-2.5 font-semibold">Issue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.row} className={cx('align-top transition-colors hover:bg-slate-50/80',
                r.status === 'error' && 'bg-danger-50/40', r.status === 'duplicate' && 'bg-warn-50/50')}>
                <td className="pl-5 pr-2 py-2.5 text-xs text-ink-400 tabular-nums leading-6">{fmt(r.row)}</td>
                <td className="px-3 py-2.5 font-semibold text-ink-900 truncate leading-6" title={r.fullName}>
                  {r.fullName || <span className="text-ink-400 font-normal italic">no name</span>}
                </td>
                <td className="px-3 py-2.5 text-ink-700 tabular-nums truncate leading-6">{r.phone || dash}</td>
                <td className="px-3 py-2.5 text-ink-700 truncate leading-6" title={r.email}>{r.email || dash}</td>
                <td className="px-3 py-2.5 text-ink-500 truncate leading-6" title={r.organization}>{r.organization || dash}</td>
                <td className="px-3 py-2.5"><StatusPill r={r} /></td>
                <td className={cx('pl-3 pr-5 py-2.5 text-xs leading-6', r.status === 'error' ? 'text-danger-600 font-medium' : 'text-warn-600 font-medium')}>
                  {r.reason || ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* mobile cards */}
      <ul className="md:hidden divide-y divide-slate-100 mt-3 border-t border-slate-100">
        {rows.map((r) => (
          <li key={r.row} className={cx('px-4 py-3', r.status === 'error' && 'bg-danger-50/40', r.status === 'duplicate' && 'bg-warn-50/50')}>
            <div className="flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-sm truncate">{r.fullName || <span className="text-ink-400 font-normal italic">no name</span>}</p>
                <p className="text-xs text-ink-500 truncate tabular-nums">{r.phone || '—'} · {r.email || '—'}</p>
                {r.organization && <p className="text-xs text-ink-400 truncate">{r.organization}</p>}
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <StatusPill r={r} />
                <span className="text-[11px] text-ink-400 tabular-nums">Row {fmt(r.row)}</span>
              </div>
            </div>
            {r.reason && <p className={cx('text-xs mt-1.5 font-medium', r.status === 'error' ? 'text-danger-600' : 'text-warn-600')}>{r.reason}</p>}
          </li>
        ))}
      </ul>
    </>
  );
}

function UploadProgress({ upload, counts, fileName, online, onPause, onCancel, onResume, onStop, onReport, onPasses, onNew }) {
  const { status } = upload;
  const finished = status === 'done' || status === 'cancelled';
  const clientIssues = counts.error + counts.duplicate;
  const issues = clientIssues + upload.skipped + upload.failed + (finished ? upload.total - upload.sent : 0);
  const pct = upload.total ? Math.round((upload.sent / upload.total) * 100) : 0;

  if (!finished) {
    const running = status === 'running';
    const title = running
      ? (upload.cancelling ? 'Stopping after this batch…' : upload.pausing ? 'Pausing after this batch…' : 'Registering attendees…')
      : status === 'paused' ? 'Upload paused' : 'Upload interrupted';
    return (
      <Panel className={cx(FULL, 'animate-fade-up')} icon={running ? Send : status === 'paused' ? Pause : FileWarning} title={title}
        description={<>{fileName}{upload.batchId && <> · batch <span className="font-mono">{upload.batchId}</span></>}</>}
        actions={running ? (
          <>
            <Button variant="secondary" size="sm" icon={Pause} onClick={onPause} disabled={upload.pausing || upload.cancelling}>
              <span className="hidden sm:inline">Pause</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={upload.cancelling} className="text-danger-600 hover:bg-danger-50">Cancel</Button>
          </>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={onStop}>Stop here</Button>
            <Button size="sm" icon={status === 'paused' ? Play : RefreshCw} onClick={onResume} disabled={!online}>Resume</Button>
          </>
        )}
        bodyClassName="p-5 sm:p-6 space-y-5">
        <div>
          <div className="flex items-end justify-between gap-4 mb-3">
            <div className="flex items-baseline gap-3">
              <span className="text-4xl font-extrabold tracking-tight tabular-nums text-ink-900">{pct.toLocaleString()}%</span>
              {running && !upload.pausing && !upload.cancelling && <Spinner className="size-4" />}
            </div>
            <p className="text-sm text-ink-500 tabular-nums text-right">
              <b className="text-ink-900">{fmt(upload.sent)}</b> of {fmt(upload.total)} rows sent
              <span className="hidden sm:inline"> · batch {fmt(Math.min(upload.next + (running ? 1 : 0), upload.chunks || 1))} of {fmt(upload.chunks || 1)}</span>
            </p>
          </div>
          <ProgressBar size="lg" value={upload.sent} max={upload.total} label="Upload progress" tone={running ? 'brand' : 'warn'} />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatTile className="max-sm:p-4" label="Sent" value={fmt(upload.sent)} icon={Send} tone="brand" sub={`of ${fmt(upload.total)}`} />
          <StatTile className="max-sm:p-4" label="Created" value={fmt(upload.created)} icon={UserPlus} tone="success" sub="New attendees" />
          <StatTile className="max-sm:p-4" label="Already registered" value={fmt(upload.skipped)} icon={UserCheck} tone="warn" sub="Skipped" />
          <StatTile className="max-sm:p-4" label="Failed" value={fmt(upload.failed)} icon={XCircle} tone="danger" sub="Rejected by server" />
        </div>
        {status === 'error' && (
          <Alert>{online ? upload.error : 'You are offline. Reconnect, then resume. Rows already sent are safe.'}</Alert>
        )}
        {status === 'paused' && (
          <Alert tone="info">Paused. Rows already sent are saved; resume to send the remaining {plural(upload.total - upload.sent, 'row')}.</Alert>
        )}
      </Panel>
    );
  }

  const ok = upload.created > 0;
  return (
    <Panel className={cx(FULL, 'animate-fade-up overflow-hidden')} bodyClassName="p-0">
      <div className={cx('px-5 py-6 sm:px-6 flex flex-col lg:flex-row lg:items-center gap-5 border-b',
        ok ? 'bg-gradient-to-r from-success-50 to-white border-success-500/15' : 'bg-slate-50 border-slate-100')}>
        <div className="flex items-center gap-4 min-w-0 flex-1">
          <span className={cx('size-14 rounded-2xl grid place-items-center shrink-0 animate-pop shadow-sm',
            ok ? 'bg-success-500 text-white shadow-success-500/30' : 'bg-slate-200 text-ink-600')}>
            {ok ? <CheckCircle2 className="size-7" /> : <AlertTriangle className="size-7" />}
          </span>
          <div className="min-w-0">
            <p className="text-xl font-bold text-ink-900">
              {status === 'cancelled' ? 'Upload stopped' : ok ? `${plural(upload.created, 'attendee')} registered` : 'Upload complete'}
            </p>
            <p className="text-sm text-ink-600 truncate">
              {fileName}{upload.batchId && <> · batch <span className="font-mono font-semibold">{upload.batchId}</span></>}
            </p>
            {status === 'cancelled' && upload.total > upload.sent && (
              <p className="text-sm text-warn-600 mt-0.5">{plural(upload.total - upload.sent, 'row was', 'rows were')} not sent.</p>
            )}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 shrink-0">
          {ok && upload.batchId && <Button icon={QrCode} onClick={onPasses}>Download QR passes for this batch</Button>}
          {issues > 0 && <Button variant="secondary" icon={FileWarning} onClick={onReport}>Error report (.xlsx)</Button>}
          <Button variant="ghost" icon={Upload} onClick={onNew}>Upload another file</Button>
        </div>
      </div>
      <div className="grid sm:grid-cols-3 gap-4 p-5 sm:p-6">
        <StatTile label="Created" value={fmt(upload.created)} icon={UserPlus} tone="success" sub="New passes issued" />
        <StatTile label="Already registered" value={fmt(upload.skipped)} icon={UserCheck} tone="warn" sub="Existing email or mobile" />
        <StatTile label="Failed" value={fmt(upload.failed + clientIssues)} icon={XCircle} tone="danger"
          sub={clientIssues ? `${fmt(clientIssues)} caught before upload` : 'Rejected by server'} />
      </div>
    </Panel>
  );
}
