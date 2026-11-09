import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  AlertTriangle, Ban, Check, CheckCheck, ChevronDown, Clock, CloudDownload, History, Keyboard,
  LayoutDashboard, LogOut, MonitorSmartphone, RefreshCw, SearchX, ShieldCheck, Users, Volume2, VolumeX, X, XCircle,
} from 'lucide-react';
import { staffSession } from '../../lib/api.js';
import { db, findUserByCode, findUserById, firstCheckinFor, getAllMeta, recordCheckin, setMeta } from '../../lib/offlineDb.js';
import { looksLikeToken, reasonText, verifyPass } from '../../lib/passVerify.js';
import { startAutoSync, syncNow, useSyncStatus } from '../../lib/sync.js';
import { Avatar, Badge, Button, Card, Input, cx } from '../../components/ui.jsx';
import Scanner from './Scanner.jsx';
import { OnlinePill, feedback, formatTime, timeAgo, unlockAudio, useNow, useOnline } from './shared.jsx';

const SOUND_KEY = 'qrp.sound';
const readSound = () => { try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; } };

export default function Verify() {
  const session = staffSession.get();
  if (!session?.token) return <Navigate to="/staff/login" replace />;
  return <VerifyScreen session={session} />;
}

function VerifyScreen({ session }) {
  const navigate = useNavigate();
  const online = useOnline();
  const sync = useSyncStatus();
  const now = useNow(20_000);

  const meta = useLiveQuery(getAllMeta, []);
  const userCount = useLiveQuery(() => db.users.count(), [], 0);
  const pendingCount = useLiveQuery(() => db.checkins.where('status').equals('pending').count(), [], 0);
  const recent = useLiveQuery(
    () => db.checkins.orderBy('scannedAt').reverse().filter((c) => c.source === 'local').limit(20).toArray(),
    [],
    [],
  );

  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [panel, setPanel] = useState(null); // 'manual' | 'recent' | 'device'
  const [sound, setSound] = useState(readSound);
  const [announce, setAnnounce] = useState('');

  const metaRef = useRef(meta);
  useEffect(() => { metaRef.current = meta; }, [meta]);
  const busyRef = useRef(false);
  const lastScan = useRef({ text: '', t: 0 });

  useEffect(() => startAutoSync(), []);

  const hasSnapshot = !!meta?.lastSnapshotAt;
  const staffName = session.staff?.username || session.staff?.name || '';

  // ---------- evaluation ----------
  const classify = useCallback(async (user, token) => {
    if (!user) {
      const first = await firstCheckinFor(token.sub);
      if (first) return { kind: 'already', person: { id: token.sub, fullName: token.name, code: token.code }, first };
      return { kind: 'unlisted', person: { id: token.sub, fullName: token.name, code: token.code } };
    }
    if (user.status === 'cancelled') return { kind: 'cancelled', person: user };
    const first = await firstCheckinFor(user.id);
    if (first) return { kind: 'already', person: user, first };
    if (user.checkedIn) return { kind: 'already', person: user, first: { scannedAt: user.checkedInAt } };
    return { kind: 'valid', person: user };
  }, []);

  const evaluateToken = useCallback(async (text) => {
    const v = await verifyPass(text, metaRef.current?.publicKey);
    if (!v.ok) return { kind: 'invalid', reason: v.reason };
    const user = (await findUserById(v.payload.sub)) || (await findUserByCode(v.payload.code));
    return classify(user, v.payload);
  }, [classify]);

  const show = useCallback((r) => {
    setResult(r);
    const tone = r.kind === 'valid' || r.kind === 'unlisted' ? 'success' : r.kind === 'already' ? 'warn' : 'error';
    feedback(tone, { sound: readSound() });
    setAnnounce(`${KINDS[r.kind].title}. ${r.person?.fullName || ''}`);
  }, []);

  const handleScan = useCallback(async (text) => {
    if (busyRef.current) return;
    const t = Date.now();
    if (text === lastScan.current.text && t - lastScan.current.t < 3000) return;
    lastScan.current = { text, t };
    busyRef.current = true;
    try {
      show(await evaluateToken(text));
    } catch {
      show({ kind: 'invalid', reason: 'malformed' });
    }
  }, [evaluateToken, show]);

  const handleManual = useCallback(async (raw) => {
    const text = raw.trim();
    if (!text) return;
    busyRef.current = true;
    setPanel(null);
    if (looksLikeToken(text)) {
      show(await evaluateToken(text));
      return;
    }
    let code = text.toUpperCase().replace(/\s+/g, '');
    // Accept "TFX-7K3Q9X", "tfx7k3q9x" or just "7K3Q9X" (legacy QRP- codes still work).
    if (!/^(TFX|QRP)-/.test(code)) code = `TFX-${code.replace(/^(TFX|QRP)-?/, '')}`;
    const user = await findUserByCode(code);
    if (!user) show({ kind: 'notfound', code });
    else show({ ...(await classify(user, null)), manual: true });
  }, [classify, evaluateToken, show]);

  const close = useCallback(() => {
    setResult(null);
    busyRef.current = false;
    lastScan.current.t = Date.now(); // the same QR still in view won't fire again for 3s
  }, []);

  const confirm = useCallback(async () => {
    if (!result?.person) return;
    setBusy(true);
    try {
      await recordCheckin({ userId: result.person.id, verifiedBy: staffName, user: result.person });
      feedback('success', { sound: false });
      setToast({ name: result.person.fullName, reentry: result.kind === 'already' });
      setAnnounce(`Checked in ${result.person.fullName}`);
      close();
      if (navigator.onLine) setTimeout(() => syncNow(), 400);
    } finally {
      setBusy(false);
    }
  }, [result, staffName, close]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  function toggleSound() {
    const next = !sound;
    setSound(next);
    try { localStorage.setItem(SOUND_KEY, next ? 'on' : 'off'); } catch { /* ignore */ }
    if (next) { unlockAudio(); feedback('success'); }
  }

  function signOut() {
    staffSession.clear();
    navigate('/staff/login', { replace: true });
  }

  const syncing = sync.state === 'syncing';

  return (
    <div className="min-h-dvh flex flex-col bg-slate-100" onPointerDown={unlockAudio}>
      <div className="sr-only" role="status" aria-live="assertive">{announce}</div>

      {/* ---------- top bar ---------- */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto max-w-lg px-4 py-2.5">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPanel('device')}
              className="min-w-0 flex-1 flex items-center gap-2 text-left rounded-xl -ml-1.5 px-1.5 py-1 hover:bg-slate-100 active:bg-slate-200">
              <span className="size-9 shrink-0 rounded-xl bg-brand-600 text-white grid place-items-center">
                <MonitorSmartphone className="size-5" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1 font-extrabold text-ink-900 leading-tight truncate">
                  {meta?.deviceName || 'Unnamed device'} <ChevronDown className="size-4 text-ink-400 shrink-0" />
                </span>
                <span className="block text-xs text-ink-500 truncate">{meta?.eventName || 'Teck Fluence X'} · {staffName}</span>
              </span>
            </button>
            <OnlinePill online={online} />
          </div>

          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className={cx(
              'inline-flex items-center gap-1 rounded-lg px-2 h-8 font-bold',
              pendingCount > 0 ? 'bg-warn-50 text-warn-600 ring-1 ring-warn-500/30' : 'bg-slate-100 text-ink-600',
            )}>
              <Clock className="size-3.5" /> {pendingCount} pending
            </span>
            <span className="inline-flex items-center gap-1 rounded-lg px-2 h-8 bg-slate-100 text-ink-600 font-semibold">
              <Users className="size-3.5" /> {userCount.toLocaleString()}
            </span>
            <span className="min-w-0 flex-1 truncate text-ink-500" title={meta?.lastSyncAt ? new Date(meta.lastSyncAt).toLocaleString() : ''}>
              {syncing ? 'Syncing…' : `Synced ${timeAgo(meta?.lastSyncAt, now)}`}
            </span>
            <Button size="sm" variant="secondary" className="shrink-0 h-8"
              onClick={() => syncNow({ full: true })} disabled={!online || syncing}
              aria-label="Sync now">
              <RefreshCw className={cx('size-4', syncing && 'animate-spin')} />
              Sync
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-lg px-4 pt-3 pb-32 space-y-3">
        {sync.needsLogin && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl bg-warn-50 ring-1 ring-warn-500/40 p-3.5">
            <AlertTriangle className="size-5 text-warn-600 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-bold text-ink-900">Sign in again to sync</p>
              <p className="text-ink-600">Your session expired. Scanning keeps working; {pendingCount} check-in{pendingCount === 1 ? '' : 's'} will stay on this phone until you sign in.</p>
            </div>
            <Button size="sm" onClick={signOut}>Sign in</Button>
          </div>
        )}
        {!sync.needsLogin && sync.state === 'error' && online && (
          <div role="alert" className="flex items-center gap-3 rounded-2xl bg-white ring-1 ring-danger-500/30 p-3 text-sm">
            <XCircle className="size-5 text-danger-600 shrink-0" />
            <p className="flex-1 text-ink-700">{sync.lastError}</p>
            <Button size="sm" variant="ghost" onClick={() => syncNow()}>Retry</Button>
          </div>
        )}

        {meta === undefined ? (
          <div className="aspect-square w-full rounded-[1.75rem] bg-slate-200 animate-pulse" />
        ) : !hasSnapshot ? (
          <SetupCard online={online} sync={sync} />
        ) : (
          <>
            <Scanner onScan={handleScan} paused={!!result || !!panel} />
            <Button variant="secondary" size="lg" icon={Keyboard} className="w-full h-14" onClick={() => setPanel('manual')}>
              Enter pass code manually
            </Button>
            {now - meta.lastSnapshotAt > 30 * 60 * 1000 && (
              <p className="text-center text-xs text-ink-500">
                Attendee list downloaded {timeAgo(meta.lastSnapshotAt, now)}. New registrations will show as “not in downloaded list”.
              </p>
            )}
          </>
        )}
      </main>

      {/* ---------- bottom bar ---------- */}
      {hasSnapshot && (
        <nav className="fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto max-w-lg px-4 py-2.5">
            <button type="button" onClick={() => setPanel('recent')}
              className="w-full h-14 flex items-center gap-3 rounded-2xl px-4 bg-slate-100 hover:bg-slate-200 active:scale-[0.99] transition">
              <History className="size-5 text-ink-700" />
              <span className="font-bold text-ink-900">Recent check-ins</span>
              <span className="ml-auto flex items-center gap-2 text-sm text-ink-500">
                {recent[0] ? <span className="truncate max-w-[9rem]">{recent[0].name || recent[0].code}</span> : 'None yet'}
                <Badge tone="brand">{recent.length}</Badge>
              </span>
            </button>
          </div>
        </nav>
      )}

      {toast && (
        <div className="fixed top-3 inset-x-0 z-[70] flex justify-center px-4 pointer-events-none pt-[env(safe-area-inset-top)]">
          <div className="animate-pop flex items-center gap-2 rounded-2xl bg-success-600 text-white px-4 py-3 shadow-lg shadow-success-600/30 font-bold">
            <CheckCheck className="size-5" />
            {toast.reentry ? 'Re-entry recorded' : 'Checked in'} · <span className="truncate max-w-[12rem]">{toast.name}</span>
          </div>
        </div>
      )}

      {result && <ResultSheet result={result} onClose={close} onConfirm={confirm} busy={busy} userCount={userCount} />}
      {panel === 'manual' && <ManualEntry onClose={() => setPanel(null)} onSubmit={handleManual} />}
      {panel === 'recent' && <RecentDrawer items={recent} onClose={() => setPanel(null)} now={now} />}
      {panel === 'device' && (
        <DeviceSheet
          meta={meta} session={session} sound={sound} pendingCount={pendingCount}
          onToggleSound={toggleSound} onSignOut={signOut} onClose={() => setPanel(null)}
          onAdmin={() => navigate('/admin')}
        />
      )}
    </div>
  );
}

// ---------- setup ----------
function SetupCard({ online, sync }) {
  const p = sync.progress;
  const syncing = sync.state === 'syncing';
  let pct = null;
  let label = 'Needed so this phone can verify passes with no internet.';
  if (syncing && p?.phase === 'downloading') {
    pct = p.total ? Math.min(100, Math.round((p.received / p.total) * 100)) : null;
    label = `Downloading… ${(p.received / 1048576).toFixed(1)} MB${p.total ? ` of ${(p.total / 1048576).toFixed(1)} MB` : ''}`;
  } else if (syncing && p?.phase === 'saving') {
    pct = 100;
    label = `Saving ${p.count?.toLocaleString() || ''} attendees to this phone…`;
  } else if (syncing) {
    label = 'Connecting…';
  }

  return (
    <Card className="p-6 text-center animate-fade-up">
      <div className="mx-auto mb-4 size-16 rounded-2xl bg-brand-50 text-brand-600 grid place-items-center">
        <CloudDownload className={cx('size-8', syncing && 'animate-pulse')} />
      </div>
      <h2 className="text-xl font-extrabold tracking-tight">Download attendee list</h2>
      <p className="text-sm text-ink-500 mt-1" aria-live="polite">{label}</p>

      {syncing && (
        <div className="mt-5 h-2.5 rounded-full bg-slate-100 overflow-hidden" role="progressbar"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? undefined}>
          <div className={cx('h-full rounded-full bg-brand-600 transition-[width] duration-300', pct == null && 'w-1/3 animate-pulse')}
            style={pct != null ? { width: `${Math.max(4, pct)}%` } : undefined} />
        </div>
      )}

      {!online && (
        <p className="mt-4 rounded-xl bg-ink-900 text-white text-sm px-3 py-2.5">
          You're offline. Connect to the internet once to download the list — after that, scanning works offline.
        </p>
      )}
      {sync.state === 'error' && online && !sync.needsLogin && (
        <p role="alert" className="mt-4 rounded-xl bg-danger-50 text-danger-600 text-sm px-3 py-2.5">{sync.lastError}</p>
      )}

      {!syncing && (
        <Button size="lg" className="w-full mt-5" icon={CloudDownload} disabled={!online} onClick={() => syncNow({ full: true })}>
          {sync.state === 'error' ? 'Try again' : 'Download now'}
        </Button>
      )}
    </Card>
  );
}

// ---------- result sheet ----------
const KINDS = {
  valid: { title: 'Valid pass', icon: Check, bg: 'bg-success-600', fg: 'text-white' },
  unlisted: { title: 'Valid pass', icon: ShieldCheck, bg: 'bg-brand-700', fg: 'text-white' },
  already: { title: 'Already checked in', icon: AlertTriangle, bg: 'bg-warn-500', fg: 'text-ink-900' },
  cancelled: { title: 'Pass cancelled', icon: Ban, bg: 'bg-danger-600', fg: 'text-white' },
  invalid: { title: 'Invalid pass', icon: XCircle, bg: 'bg-danger-600', fg: 'text-white' },
  notfound: { title: 'Code not found', icon: SearchX, bg: 'bg-danger-600', fg: 'text-white' },
};

function ResultSheet({ result, onClose, onConfirm, busy, userCount }) {
  const k = KINDS[result.kind];
  const Icon = k.icon;
  const p = result.person;
  const primaryRef = useRef(null);

  useEffect(() => {
    primaryRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  let subtitle = null;
  if (result.kind === 'valid') subtitle = 'Not checked in yet';
  if (result.kind === 'unlisted') subtitle = 'Signature verified · not in downloaded list (registered recently)';
  if (result.kind === 'already') subtitle = 'This person has already entered';
  if (result.kind === 'cancelled') subtitle = 'Do not admit. Send to the help desk.';
  if (result.kind === 'invalid') subtitle = reasonText[result.reason] || 'This QR code could not be verified.';
  if (result.kind === 'notfound') subtitle = `No attendee with code ${result.code} among ${userCount.toLocaleString()} downloaded. Check the code or sync.`;

  const canAdmit = result.kind === 'valid' || result.kind === 'unlisted';

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="result-title"
      className={cx('fixed inset-0 z-50 flex flex-col', k.bg, k.fg)}>
      <div className="flex-1 flex flex-col items-center justify-center px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-6 text-center">
        <div className="animate-pop size-24 rounded-full bg-white/20 ring-4 ring-white/30 grid place-items-center">
          <Icon className="size-14" strokeWidth={3} />
        </div>
        <h2 id="result-title" className="mt-4 text-3xl font-black tracking-tight">{k.title}</h2>
        <p className="mt-1.5 max-w-sm text-base font-medium opacity-90">{subtitle}</p>
        {result.manual && <span className="mt-2 text-xs font-bold uppercase tracking-wider opacity-75">Entered by code — check photo ID</span>}
      </div>

      <div className="animate-fade-up bg-white text-ink-900 rounded-t-[2rem] px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl">
        <div className="mx-auto max-w-lg">
          {p && (
            <div className="flex items-center gap-4">
              <Avatar src={p.photo} name={p.fullName} size="size-20 shrink-0" />
              <div className="min-w-0">
                <p className="text-xl font-extrabold leading-tight break-words">{p.fullName || 'Unknown name'}</p>
                <p className="font-mono text-base font-bold text-ink-700 mt-0.5">{p.code}</p>
                {!!(p.adults?.length || p.kids?.length) && <div className="mt-2 text-sm text-ink-700"><p className="font-bold">Family: {1 + (p.adults?.length || 0) + (p.kids?.length || 0)} guests</p>{p.adults?.map((m, i) => <p key={`a${i}`}>{m.name} ({m.relationship})</p>)}{p.kids?.map((m, i) => <p key={`k${i}`}>{m.name} (child)</p>)}</div>}
                {p.organization && <p className="text-sm text-ink-500 truncate">{p.organization}</p>}
              </div>
            </div>
          )}

          {result.kind === 'already' && result.first && (
            <div className="mt-4 rounded-2xl bg-warn-50 ring-1 ring-warn-500/30 p-3.5 text-sm">
              <p className="font-bold text-ink-900">
                First entry {formatTime(result.first.scannedAt)}{' '}
                <span className="font-medium text-ink-600">({timeAgo(result.first.scannedAt)})</span>
              </p>
              <p className="text-ink-600 mt-0.5">
                {result.first.deviceName ? `at ${result.first.deviceName}` : 'at another device'}
                {result.first.verifiedBy ? ` · by ${result.first.verifiedBy}` : ''}
                {result.first.source === 'local' ? ' · this phone' : ''}
              </p>
            </div>
          )}

          <div className="mt-5 grid gap-2.5">
            {canAdmit && (
              <>
                <Button ref={primaryRef} variant="success" className="h-16 text-lg rounded-2xl" icon={Check} loading={busy} onClick={onConfirm}>
                  Confirm entry
                </Button>
                <Button variant="secondary" className="h-13 rounded-2xl" onClick={onClose}>Cancel</Button>
              </>
            )}
            {result.kind === 'already' && (
              <>
                <DarkButton ref={primaryRef} onClick={onClose}>Dismiss</DarkButton>
                <Button variant="secondary" className="h-13 rounded-2xl" loading={busy} onClick={onConfirm}>
                  Allow re-entry anyway
                </Button>
              </>
            )}
            {!canAdmit && result.kind !== 'already' && (
              <DarkButton ref={primaryRef} onClick={onClose}>Scan next</DarkButton>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DarkButton({ children, ...props }) {
  return (
    <button type="button" {...props}
      className="h-16 w-full rounded-2xl bg-ink-900 text-white text-lg font-semibold hover:bg-ink-700 active:scale-[0.98] transition select-none">
      {children}
    </button>
  );
}

// ---------- sheets ----------
function Sheet({ title, onClose, children, labelId }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-end" role="dialog" aria-modal="true" aria-labelledby={labelId}>
      <button type="button" aria-label="Close" className="absolute inset-0 bg-ink-900/50 animate-[fade-up_0.2s_ease-out]" onClick={onClose} />
      <div className="relative animate-fade-up bg-white rounded-t-[2rem] shadow-2xl max-h-[85dvh] flex flex-col pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-slate-300" />
        <div className="flex items-center justify-between px-5 pt-3 pb-2">
          <h2 id={labelId} className="text-lg font-extrabold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close"
            className="size-10 -mr-2 rounded-full grid place-items-center text-ink-500 hover:bg-slate-100">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto overscroll-contain px-5 pb-5">{children}</div>
      </div>
    </div>
  );
}

function ManualEntry({ onClose, onSubmit }) {
  const [value, setValue] = useState('');
  return (
    <Sheet title="Enter pass code" onClose={onClose} labelId="manual-title">
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(value); }} className="space-y-3">
        <p className="text-sm text-ink-500">Type the code printed under the QR, e.g. <span className="font-mono font-bold text-ink-700">TFX-7K3Q9X</span>.</p>
        <Input autoFocus value={value} onChange={(e) => setValue(e.target.value.toUpperCase())}
          placeholder="TFX-XXXXXX" autoCapitalize="characters" autoCorrect="off" autoComplete="off" spellCheck={false}
          inputMode="text" aria-label="Pass code"
          className="h-16 text-2xl font-mono font-bold tracking-widest text-center" />
        <Button type="submit" size="lg" className="w-full h-14" disabled={value.trim().length < 4}>Look up</Button>
      </form>
    </Sheet>
  );
}

const STATUS_ICON = {
  pending: { icon: Clock, cls: 'text-warn-600 bg-warn-50', label: 'Waiting to sync' },
  synced: { icon: CheckCheck, cls: 'text-success-600 bg-success-50', label: 'Synced' },
  duplicate: { icon: AlertTriangle, cls: 'text-danger-600 bg-danger-50', label: 'Duplicate — already checked in elsewhere' },
};

function RecentDrawer({ items, onClose, now }) {
  return (
    <Sheet title="Recent check-ins" onClose={onClose} labelId="recent-title">
      <div className="flex gap-3 text-xs text-ink-500 mb-3">
        {Object.entries(STATUS_ICON).map(([k, s]) => (
          <span key={k} className="inline-flex items-center gap-1"><s.icon className={cx('size-3.5', s.cls.split(' ')[0])} />{k}</span>
        ))}
      </div>
      {items.length === 0 ? (
        <div className="py-10 text-center">
          <History className="size-10 mx-auto text-ink-400" />
          <p className="mt-2 font-semibold">No check-ins on this phone yet</p>
          <p className="text-sm text-ink-500">Confirmed entries will appear here.</p>
        </div>
      ) : (
        <ul className="divide-y divide-slate-100">
          {items.map((c) => {
            const s = STATUS_ICON[c.status] || STATUS_ICON.pending;
            return (
              <li key={c.id} className="flex items-center gap-3 py-3">
                <Avatar name={c.name || c.code} size="size-10 shrink-0 text-sm" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold truncate">{c.name || 'Unknown'}</p>
                  <p className="text-xs text-ink-500 truncate">
                    <span className="font-mono">{c.code}</span> · {formatTime(c.scannedAt)} · {timeAgo(c.scannedAt, now)}
                  </p>
                  {c.status === 'duplicate' && c.firstCheckin && (
                    <p className="text-xs text-danger-600 truncate">First at {c.firstCheckin.deviceName || 'another device'}, {formatTime(c.firstCheckin.scannedAt)}</p>
                  )}
                  {c.status === 'pending' && c.error && <p className="text-xs text-warn-600 truncate">{c.error}</p>}
                </div>
                <span title={s.label} aria-label={s.label} className={cx('size-9 rounded-full grid place-items-center shrink-0', s.cls)}>
                  <s.icon className="size-4.5" />
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Sheet>
  );
}

function DeviceSheet({ meta, session, sound, pendingCount, onToggleSound, onSignOut, onClose, onAdmin }) {
  const [name, setName] = useState(meta?.deviceName || '');
  const [saved, setSaved] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const isAdmin = session.staff?.role === 'admin';

  async function save(e) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    await setMeta('deviceName', n.slice(0, 40));
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <Sheet title="This device" onClose={onClose} labelId="device-title">
      <form onSubmit={save} className="flex gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} aria-label="Device name" placeholder="Gate 1" />
        <Button type="submit" variant={saved ? 'success' : 'primary'} className="shrink-0" disabled={!name.trim()}>
          {saved ? 'Saved' : 'Rename'}
        </Button>
      </form>

      <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-ink-500 text-xs">Signed in</dt><dd className="font-semibold truncate">{session.staff?.name || session.staff?.username}</dd></div>
        <div className="rounded-xl bg-slate-50 p-3"><dt className="text-ink-500 text-xs">List downloaded</dt><dd className="font-semibold">{timeAgo(meta?.lastSnapshotAt)}</dd></div>
        <div className="col-span-2 rounded-xl bg-slate-50 p-3"><dt className="text-ink-500 text-xs">Device ID</dt><dd className="font-mono text-xs truncate">{meta?.deviceId || '—'}</dd></div>
      </dl>

      <div className="mt-4 grid gap-2">
        <Button variant="secondary" size="lg" icon={sound ? Volume2 : VolumeX} onClick={onToggleSound} aria-pressed={sound}>
          Sounds {sound ? 'on' : 'off'}
        </Button>
        {isAdmin && <Button variant="secondary" size="lg" icon={LayoutDashboard} onClick={onAdmin}>Admin dashboard</Button>}
        {!confirmOut ? (
          <Button variant="ghost" size="lg" icon={LogOut} className="text-danger-600" onClick={() => (pendingCount ? setConfirmOut(true) : onSignOut())}>
            Sign out
          </Button>
        ) : (
          <div className="rounded-2xl bg-warn-50 ring-1 ring-warn-500/30 p-3.5 text-sm">
            <p className="font-semibold text-ink-900">{pendingCount} check-in{pendingCount === 1 ? ' is' : 's are'} not synced yet.</p>
            <p className="text-ink-600 mt-0.5">They stay safely on this phone and upload after the next sign-in.</p>
            <div className="mt-3 flex gap-2">
              <Button variant="danger" size="sm" onClick={onSignOut}>Sign out anyway</Button>
              <Button variant="secondary" size="sm" onClick={() => setConfirmOut(false)}>Keep me signed in</Button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}
