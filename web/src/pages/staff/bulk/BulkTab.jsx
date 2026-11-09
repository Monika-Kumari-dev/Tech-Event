// Admin "Bulk" tab: spreadsheet registration, bulk QR pass export, upload history.
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../../lib/api.js';
import BulkUpload, { downloadTemplate } from './BulkUpload.jsx';
import StepGuide from './StepGuide.jsx';
import BulkDownload from './BulkDownload.jsx';
import RecentBatches from './RecentBatches.jsx';
import { Toasts, errorMessage, useToasts } from './common.jsx';

export default function BulkTab({ call, online, onChanged }) {
  const { items: toasts, push: toast, dismiss } = useToasts();
  const [batches, setBatches] = useState(null);
  const [batchesLoading, setBatchesLoading] = useState(false);
  const [batchesError, setBatchesError] = useState('');
  const [preset, setPreset] = useState(null);
  const [eventName, setEventName] = useState('');
  const [stage, setStage] = useState('empty');
  const downloadRef = useRef(null);

  const loadBatches = useCallback(async () => {
    setBatchesLoading(true);
    try {
      const res = await call('/admin/batches');
      setBatches(res.items || []);
      setBatchesError('');
    } catch (e) {
      setBatchesError(errorMessage(e, 'Could not load batches.'));
    } finally {
      setBatchesLoading(false);
    }
  }, [call]);

  useEffect(() => { loadBatches(); }, [loadBatches]);
  useEffect(() => {
    api('/public-key').then((k) => setEventName(k.eventName || '')).catch(() => {});
  }, []);

  const openDownload = useCallback((batchId) => {
    setPreset({ batchId, at: Date.now() });
    requestAnimationFrame(() => downloadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, []);

  const onUploaded = useCallback(() => { loadBatches(); onChanged?.(); }, [loadBatches, onChanged]);

  const current = stage === 'done' ? 3 : stage === 'empty' ? 1 : 2;
  const jumpToDownloads = useCallback(() => downloadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), []);

  // Layout: one column of full-width sections; each section lays out its own 12-column grid (see adminKit.jsx).
  return (
    <div className="grid grid-cols-1 gap-4 xl:gap-5 animate-fade-up">
      <StepGuide current={current} onTemplate={() => downloadTemplate(toast)} onJump={jumpToDownloads} />
      <BulkUpload call={call} online={online} toast={toast} onUploaded={onUploaded} onDownloadBatch={openDownload} onStageChange={setStage} />
      <div ref={downloadRef} className="scroll-mt-24 min-w-0">
        <BulkDownload call={call} online={online} toast={toast} batches={batches} preset={preset} eventName={eventName} />
      </div>
      <RecentBatches batches={batches} loading={batchesLoading} error={batchesError} onReload={loadBatches}
        onDownload={openDownload} highlight={preset?.batchId} />
      <Toasts items={toasts} onDismiss={dismiss} />
    </div>
  );
}
