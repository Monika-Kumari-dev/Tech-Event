// Offline-first sync for verifier devices.
//  - downloadSnapshot(): pull every attendee + first check-ins + public key into IndexedDB
//  - pushCheckins():     upload pending local check-ins in batches of 200
//  - syncNow():          push, then refresh the snapshot (single-flight)
//  - startAutoSync():    run on 'online', focus/visibility and every 60s while online
import { useSyncExternalStore } from 'react';
import { api, ApiError, staffSession } from './api.js';
import { db, getDeviceId, getMeta, importSnapshot, setMeta } from './offlineDb.js';

const BATCH = 200;
const FULL_SNAPSHOT_EVERY = 10 * 60 * 1000; // photos are heavy: full refresh at most every 10 min on auto sync

// ---------- tiny status store ----------
let status = { state: 'idle', lastError: null, needsLogin: false, phase: null, progress: null };
const listeners = new Set();

function setStatus(patch) {
  status = { ...status, ...patch };
  listeners.forEach((l) => l());
}

export function getSyncStatus() {
  return status;
}

export function subscribeSync(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** { state: 'idle'|'syncing'|'error', lastError, needsLogin, phase, progress } */
export function useSyncStatus() {
  return useSyncExternalStore(subscribeSync, getSyncStatus, getSyncStatus);
}

function handleError(e) {
  if (e instanceof ApiError && e.status === 401) {
    setStatus({ state: 'error', needsLogin: true, lastError: 'Your session expired. Sign in again to sync — scanning still works.' });
  } else if (e instanceof ApiError && e.status === 0) {
    setStatus({ state: 'error', lastError: 'No connection to the server.' });
  } else {
    setStatus({ state: 'error', lastError: e?.message || 'Sync failed.' });
  }
}

// ---------- snapshot ----------
async function fetchJsonWithProgress(path, onProgress) {
  const res = await api(path, { auth: true, raw: true });
  const total = Number(res.headers.get('content-length')) || 0;
  if (!res.body || !onProgress) return res.json();
  const reader = res.body.getReader();
  const chunks = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    onProgress({ received, total });
  }
  const buf = new Uint8Array(received);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }
  return JSON.parse(new TextDecoder().decode(buf));
}

/**
 * Download the full attendee list. Throws on failure (callers show UI).
 * @param {{photos?: boolean, onProgress?: (p:{phase:string, received?:number, total?:number}) => void}} opts
 */
export async function downloadSnapshot({ photos = true, onProgress } = {}) {
  const report = (p) => {
    setStatus({ phase: p.phase, progress: p });
    onProgress?.(p);
  };
  report({ phase: 'downloading', received: 0, total: 0 });
  const data = await fetchJsonWithProgress(
    photos ? '/sync/snapshot?photos=1' : '/sync/snapshot',
    (p) => report({ phase: 'downloading', ...p }),
  );
  report({ phase: 'saving', count: data.users?.length || 0 });
  const result = await importSnapshot(data, { withPhotos: photos });
  if (photos) await setMeta('lastFullSnapshotAt', Date.now());
  report({ phase: 'done', count: result.users });
  setStatus({ phase: null, progress: null });
  return result;
}

// ---------- push ----------
export async function pushCheckins() {
  const pending = await db.checkins.where('status').equals('pending').sortBy('scannedAt');
  if (!pending.length) return { accepted: 0, duplicates: 0, rejected: 0 };

  const [deviceId, deviceName] = await Promise.all([getDeviceId(), getMeta('deviceName', '')]);
  const totals = { accepted: 0, duplicates: 0, rejected: 0 };

  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const res = await api('/sync/checkins', {
      method: 'POST',
      auth: true,
      body: {
        deviceId,
        deviceName,
        checkins: batch.map((c) => ({ id: c.id, userId: c.userId, scannedAt: c.scannedAt, verifiedBy: c.verifiedBy })),
      },
    });
    // Server lists every stored id in `accepted`, including the ones it flagged as duplicates,
    // so check `duplicates` first.
    const accepted = new Set(res.accepted || []);
    const dups = new Map((res.duplicates || []).map((d) => [d.id, d]));
    const rejected = new Map((res.rejected || []).map((r) => [r.id, r.reason]));
    const now = Date.now();

    await db.transaction('rw', db.checkins, async () => {
      for (const c of batch) {
        if (dups.has(c.id)) {
          await db.checkins.update(c.id, { status: 'duplicate', syncedAt: now, error: null, firstCheckin: dups.get(c.id).firstCheckin || null });
          totals.duplicates++;
        } else if (accepted.has(c.id)) {
          await db.checkins.update(c.id, { status: 'synced', syncedAt: now, error: null });
          totals.accepted++;
        } else {
          // Rejected (e.g. unknown user). Keep it pending so nothing is lost; surface the error.
          const reason = rejected.get(c.id);
          await db.checkins.update(c.id, { error: reason ? `Server rejected: ${reason}` : 'Not accepted by server — will retry', lastTriedAt: now });
          totals.rejected++;
        }
      }
    });
  }
  return totals;
}

// ---------- orchestration ----------
let inFlight = null;

/**
 * Push pending check-ins, then refresh the snapshot.
 * @param {{full?: boolean}} opts full=true forces a snapshot with photos.
 */
export function syncNow({ full = false } = {}) {
  if (inFlight) return inFlight;
  if (!staffSession.get()?.token) {
    setStatus({ state: 'error', needsLogin: true, lastError: 'Sign in to sync.' });
    return Promise.resolve(false);
  }
  inFlight = (async () => {
    setStatus({ state: 'syncing', lastError: null });
    try {
      await pushCheckins();
      const lastFull = await getMeta('lastFullSnapshotAt', 0);
      const photos = full || !lastFull || Date.now() - lastFull > FULL_SNAPSHOT_EVERY;
      await downloadSnapshot({ photos });
      await setMeta('lastSyncAt', Date.now());
      setStatus({ state: 'idle', lastError: null, needsLogin: false, phase: null, progress: null });
      return true;
    } catch (e) {
      setStatus({ phase: null, progress: null });
      handleError(e);
      return false;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/** Called after a fresh login so the next sync is allowed again. */
export function clearSyncError() {
  setStatus({ state: 'idle', lastError: null, needsLogin: false });
}

let autoRefs = 0;
let teardown = null;

/** Start background sync. Ref-counted; returns a stop function. */
export function startAutoSync() {
  autoRefs++;
  if (autoRefs === 1) {
    const run = () => {
      if (navigator.onLine && !status.needsLogin) syncNow();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') run(); };
    window.addEventListener('online', run);
    window.addEventListener('focus', run);
    document.addEventListener('visibilitychange', onVisible);
    const timer = setInterval(run, 60_000);
    run();
    teardown = () => {
      window.removeEventListener('online', run);
      window.removeEventListener('focus', run);
      document.removeEventListener('visibilitychange', onVisible);
      clearInterval(timer);
    };
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    autoRefs--;
    if (autoRefs === 0 && teardown) { teardown(); teardown = null; }
  };
}
