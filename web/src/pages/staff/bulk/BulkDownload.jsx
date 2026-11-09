import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Download, FileArchive, FileSpreadsheet, FileText, Layers, QrCode, RefreshCw, Users, X } from 'lucide-react';
import { Button, Spinner, cx } from '../../../components/ui.jsx';
import { EmptyState, Panel } from '../adminKit.jsx';
import { formatBytes, formatDuration } from './parse.js';
import { downloadBlob, today } from './libs.js';
import { Alert, MetaRow, ProgressBar, Segmented, errorMessage, fmt, plural, useBeforeUnload } from './common.jsx';
import { formatTime } from '../shared.jsx';

const FORMATS = [
  { id: 'zip', icon: FileArchive, title: 'ZIP of PNG passes', text: 'One ticket image per attendee, ready to email or share on WhatsApp.' },
  { id: 'pdf', icon: FileText, title: 'Printable PDF', text: 'A4 sheets for printing: 8 badges to cut out, or one pass per page.' },
  { id: 'xlsx', icon: FileSpreadsheet, title: 'Excel list', text: 'Codes, contacts and pass links to filter, share or mail-merge.' },
];
const SHORT = { zip: 'ZIP', pdf: 'PDF', xlsx: 'Excel' };
const LAYOUTS = [
  { id: 'grid', label: '8 per page' },
  { id: 'single', label: '1 per page' },
];

export default function BulkDownload({ call, online, toast, batches, preset, eventName }) {
  const [source, setSource] = useState('all');
  const [batchId, setBatchId] = useState('');
  const [layout, setLayout] = useState('grid');
  const [includeToken, setIncludeToken] = useState(false);
  const [data, setData] = useState({ key: null, items: null, loading: false, error: '' });
  const [reload, setReload] = useState(0);
  const [estimate, setEstimate] = useState({ key: null, bytes: null });
  const [job, setJob] = useState(null);
  const [flash, setFlash] = useState(false);
  const ctrlRef = useRef(null);
  useBeforeUnload(!!job);

  useEffect(() => {
    if (!preset?.batchId) return undefined;
    setSource('batch');
    setBatchId(preset.batchId);
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1600);
    return () => clearTimeout(t);
  }, [preset]);

  useEffect(() => {
    if (source === 'batch' && !batchId && batches?.length) setBatchId(batches.find((b) => b.created > 0)?.batchId || batches[0].batchId);
  }, [source, batchId, batches]);

  const key = source === 'all' ? 'all' : batchId ? `batch:${batchId}` : null;

  useEffect(() => {
    if (!key) { setData({ key: null, items: null, loading: false, error: '' }); return undefined; }
    const ctrl = new AbortController();
    setData((d) => ({ key, items: d.key === key ? d.items : null, loading: true, error: '' }));
    call('/admin/passes', { method: 'POST', body: source === 'all' ? { all: true } : { batchId }, signal: ctrl.signal })
      .then((res) => setData({ key, items: res.items || [], loading: false, error: '' }))
      .catch((e) => { if (e.name !== 'AbortError') setData({ key, items: null, loading: false, error: errorMessage(e, 'Could not load passes.') }); });
    return () => ctrl.abort();
  }, [call, key, source, batchId, reload]);

  const items = data.key === key ? data.items : null;
  const count = items?.length || 0;
  const loading = data.loading && data.key === key;

  // Size estimate for ZIP: render a couple of sample tickets.
  const estKey = items?.length ? `${key}:${items.length}` : null;
  useEffect(() => {
    if (!estKey || estimate.key === estKey) return undefined;
    let alive = true;
    import('./generators.js')
      .then((g) => g.estimateZipBytes(items, { eventName }))
      .then((bytes) => { if (alive) setEstimate({ key: estKey, bytes }); })
      .catch(() => { if (alive) setEstimate({ key: estKey, bytes: null }); });
    return () => { alive = false; };
  }, [estKey, estimate.key, items, eventName]);

  async function generate(format) {
    if (!items?.length) return;
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    const started = performance.now();
    setJob({ format, phase: 'prepare', done: 0, total: items.length, started, renderStarted: null });
    const onProgress = ({ phase, done, total }) => setJob((j) => j && ({
      ...j, phase, done, total, renderStarted: j.renderStarted ?? performance.now(),
    }));
    const tag = source === 'all' ? 'all' : batchId;
    try {
      const g = await import('./generators.js');
      let blob; let name;
      if (format === 'zip') {
        blob = await g.generateZip(items, { eventName, signal: ctrl.signal, onProgress });
        name = `TeckFluenceX-passes-${tag}-${today()}.zip`;
      } else if (format === 'pdf') {
        blob = await g.generatePdf(items, { layout, eventName, signal: ctrl.signal, onProgress });
        name = `TeckFluenceX-passes-${tag}-${layout === 'grid' ? 'badges' : 'pages'}-${today()}.pdf`;
      } else {
        blob = await g.generateXlsx(items, { includeToken, signal: ctrl.signal, onProgress });
        name = `TeckFluenceX-attendees-${tag}-${today()}.xlsx`;
      }
      downloadBlob(blob, name);
      toast('success', 'Download ready', `${name} · ${formatBytes(blob.size)} · ${formatDuration(performance.now() - started)}`);
    } catch (e) {
      if (e?.name === 'AbortError') toast('info', 'Generation cancelled');
      else toast('error', 'Could not generate the file', errorMessage(e));
    } finally {
      ctrlRef.current = null;
      setJob(null);
    }
  }

  const selectedBatch = batches?.find((b) => b.batchId === batchId);
  const pdfPages = layout === 'single' ? count : Math.ceil(count / 8);
  const zipSize = estimate.key === estKey ? estimate.bytes : undefined;

  const metaFor = (id) => {
    if (id === 'zip') {
      return [
        ['Files', count ? `${fmt(count)} PNG` : '—'],
        ['Estimated size', !count ? '—' : zipSize === undefined ? 'Estimating…' : zipSize ? `≈ ${formatBytes(zipSize)}` : 'Unknown'],
      ];
    }
    if (id === 'pdf') {
      return [
        ['Pages', count ? `${fmt(pdfPages)} A4` : '—'],
        ['Per page', layout === 'grid' ? '8 badges' : '1 pass'],
      ];
    }
    return [
      ['Rows', count ? fmt(count) : '—'],
      ['Columns', includeToken ? 'Contacts, link, token' : 'Contacts & pass link'],
    ];
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 xl:gap-5">
      <Panel className={cx('lg:col-span-12 transition-shadow', flash && 'outline-2 outline-brand-500 shadow-lg shadow-brand-600/10')}
        icon={QrCode} title="Download QR passes" description="Files are generated on this device. Pick who to include, then a format below.">
        <fieldset disabled={!!job} className="flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4 min-w-0">
          <Segmented label="Attendees" value={source} onChange={setSource} className="shrink-0" options={[
            { id: 'all', label: 'All attendees', icon: Users },
            { id: 'batch', label: 'Upload batch', icon: Layers, disabled: !batches?.length && source !== 'batch' },
          ]} />
          {source === 'batch' ? (
            <select value={batchId} onChange={(e) => setBatchId(e.target.value)} aria-label="Upload batch"
              className="min-w-0 w-full lg:max-w-xl h-10 rounded-lg bg-white px-3 ring-1 ring-slate-200 outline-none focus:ring-2 focus:ring-brand-500 text-sm">
              {!batchId && <option value="">Choose a batch…</option>}
              {batchId && !selectedBatch && <option value={batchId}>{batchId}</option>}
              {(batches || []).map((b) => (
                <option key={b.batchId} value={b.batchId}>
                  {b.fileName || b.batchId} · {formatTime(b.createdAt)} · {fmt(b.created)} created
                </option>
              ))}
            </select>
          ) : (
            <p className="text-sm text-ink-500">Everyone registered, sorted by name{!batches?.length && ' · no uploads yet'}.</p>
          )}
          <div className="lg:ml-auto shrink-0" aria-live="polite">
            {loading ? (
              <span className="inline-flex items-center gap-2 h-10 px-3 rounded-lg bg-slate-50 text-sm text-ink-500"><Spinner className="size-4" />Loading passes…</span>
            ) : items ? (
              <span className={cx('inline-flex items-center gap-2 h-10 pl-3 pr-1.5 rounded-lg text-sm ring-1',
                count ? 'bg-success-50 ring-success-500/20 text-ink-700' : 'bg-slate-50 ring-slate-200 text-ink-500')}>
                <CheckCircle2 className={cx('size-4', count ? 'text-success-600' : 'text-ink-400')} />
                <span><b className="tabular-nums text-ink-900">{fmt(count)}</b> {count === 1 ? 'pass' : 'passes'} ready</span>
                <button type="button" onClick={() => setReload((r) => r + 1)} className="rounded-md p-1.5 text-ink-400 hover:bg-white hover:text-ink-700" aria-label="Reload passes">
                  <RefreshCw className="size-3.5" />
                </button>
              </span>
            ) : null}
          </div>
        </fieldset>
        {data.error && data.key === key && !loading && (
          <div className="mt-4">
            <Alert action={<Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => setReload((r) => r + 1)}>Retry</Button>}>
              {online ? data.error : 'You are offline. Passes are loaded from the server.'}
            </Alert>
          </div>
        )}
      </Panel>

      {items && count === 0 ? (
        <Panel className="lg:col-span-12">
          <EmptyState icon={QrCode} title="No attendees here yet">
            {source === 'all' ? 'Register attendees or upload a spreadsheet first.' : 'This batch has no registered attendees.'}
          </EmptyState>
        </Panel>
      ) : (
        FORMATS.map((f) => {
          const mine = job?.format === f.id;
          return (
            <Panel key={f.id} className={cx('lg:col-span-4 transition', mine && 'outline-2 outline-brand-500', job && !mine && 'opacity-60')}
              icon={f.icon} title={f.title} description={f.text} bodyClassName="p-5 flex flex-col gap-4">
              <dl className="divide-y divide-slate-100 -my-2">
                {metaFor(f.id).map(([k, v]) => <MetaRow key={k} label={k}>{v}</MetaRow>)}
              </dl>
              <fieldset disabled={!!job} className="min-w-0">
                {f.id === 'pdf' && (
                  <div className="flex items-center gap-3">
                    <Segmented full label="PDF layout" value={layout} onChange={setLayout}
                      options={LAYOUTS.map((l) => ({ ...l, icon: undefined }))} />
                    <LayoutPreview kind={layout} />
                  </div>
                )}
                {f.id === 'xlsx' && (
                  <label className="flex items-start gap-3 rounded-lg bg-slate-50 p-3 cursor-pointer hover:bg-slate-100/70">
                    <input type="checkbox" checked={includeToken} onChange={(e) => setIncludeToken(e.target.checked)} className="mt-0.5 size-4 accent-brand-600" />
                    <span>
                      <span className="block text-sm font-semibold">Include QR token column</span>
                      <span className="block text-xs text-ink-500">Signed QR text for re-printing elsewhere. Keep the file confidential.</span>
                    </span>
                  </label>
                )}
                {f.id === 'zip' && (
                  <p className="rounded-lg bg-slate-50 p-3 text-xs text-ink-500">
                    Files are named <span className="font-mono text-ink-700">CODE_Full-Name.png</span> so they sort and search easily.
                  </p>
                )}
              </fieldset>
              <div className="mt-auto pt-1">
                {mine ? (
                  <JobProgress job={job} format={f.id} onCancel={() => ctrlRef.current?.abort()} />
                ) : (
                  <Button icon={Download} className="w-full" variant={f.id === 'zip' ? 'primary' : 'secondary'}
                    disabled={!count || loading || !!job} onClick={() => generate(f.id)}>
                    {count ? `Generate ${SHORT[f.id]} · ${plural(count, 'pass', 'passes')}` : `Generate ${SHORT[f.id]}`}
                  </Button>
                )}
              </div>
            </Panel>
          );
        })
      )}
    </div>
  );
}

function LayoutPreview({ kind }) {
  return (
    <span className="w-8 h-11 shrink-0 rounded-md ring-1 ring-slate-300 bg-white p-1 grid gap-0.5" aria-hidden
      style={{ gridTemplateColumns: kind === 'grid' ? '1fr 1fr' : '1fr', gridTemplateRows: kind === 'grid' ? 'repeat(4,1fr)' : '1fr' }}>
      {Array.from({ length: kind === 'grid' ? 8 : 1 }, (_, i) => <span key={i} className="rounded-[2px] bg-brand-200" />)}
    </span>
  );
}

function JobProgress({ job, format, onCancel }) {
  const { phase, done, total, renderStarted } = job;
  const elapsed = renderStarted ? performance.now() - renderStarted : 0;
  const eta = phase === 'render' && done > 0 && done < total ? (elapsed / done) * (total - done) : null;
  const label = phase === 'prepare' ? 'Preparing…'
    : phase === 'pack' ? (format === 'zip' ? 'Packing ZIP…' : format === 'pdf' ? 'Saving PDF…' : 'Saving workbook…')
      : `Generating ${fmt(done)} / ${fmt(total)}`;
  const pct = phase === 'prepare' || !total ? 0 : Math.round((done / total) * 100);
  return (
    <div className="rounded-xl ring-1 ring-brand-200 bg-brand-50/60 p-3.5 animate-fade-up" aria-live="polite">
      <div className="flex items-center gap-2.5 mb-2.5">
        <Spinner className="size-4" />
        <p className="flex-1 min-w-0 text-sm font-semibold tabular-nums truncate">{label}</p>
        <span className="text-sm font-bold tabular-nums text-brand-700">{pct.toLocaleString()}%</span>
      </div>
      <ProgressBar value={phase === 'prepare' ? 0 : done} max={total} label="Generation progress" indeterminate={phase === 'prepare'} />
      <div className="mt-2.5 flex items-center justify-between gap-2">
        <p className="text-xs text-ink-500 truncate">{eta != null ? `About ${formatDuration(eta)} left` : phase === 'pack' ? 'Almost done' : 'Loading tools…'} · keep this tab open</p>
        <Button variant="ghost" size="sm" icon={X} onClick={onCancel} className="h-8 shrink-0">Cancel</Button>
      </div>
    </div>
  );
}
