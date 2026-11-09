import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import {
  Download, Printer, Share2, Check, Sun, WifiOff, CheckCircle2, Search, Trash2, PartyPopper, Ticket, Building2,
} from 'lucide-react';
import { Button, Card, Badge, Avatar, cx } from '../../components/ui.jsx';
import { api } from '../../lib/api.js';
import { passStore, eventStore } from '../../lib/passStore.js';
import { PublicLayout, Alert } from './shared.jsx';
import { renderTicketPng } from './ticketImage.js';

function useQrSize() {
  const calc = () => {
    if (typeof window === 'undefined') return 260;
    // Card has ~2.5rem horizontal chrome + page gutter; keep a healthy minimum for scanners.
    return Math.round(Math.max(240, Math.min(320, window.innerWidth - 112)));
  };
  const [size, setSize] = useState(calc);
  useEffect(() => {
    const onResize = () => setSize(calc());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

function useEventName() {
  const [name, setName] = useState(() => eventStore.get() || 'Teck Fluence X');
  useEffect(() => {
    const ctrl = new AbortController();
    api('/public-key', { signal: ctrl.signal })
      .then((d) => {
        if (d?.eventName) {
          setName(d.eventName);
          eventStore.set(d.eventName);
        }
      })
      .catch(() => { /* offline — cached/fallback name is fine */ });
    return () => ctrl.abort();
  }, []);
  return name;
}

function formatDate(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return null;
  }
}

function NotOnDevice() {
  return (
    <PublicLayout back="/">
      <Card className="p-6 text-center animate-fade-up sm:p-8">
        <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
          <Ticket className="size-8" />
        </div>
        <h1 className="mt-5 text-xl font-bold tracking-tight text-ink-900">This pass isn't saved on this device</h1>
        <p className="mt-2 text-ink-600 leading-relaxed">
          For your privacy, passes are only stored on the phone used to register. Look it up with your email and mobile number to load it here.
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <Button to="/find-pass" size="lg" icon={Search}>Find my pass</Button>
          <Button to="/register" variant="secondary" size="lg">Register instead</Button>
        </div>
      </Card>
    </PublicLayout>
  );
}

export default function Pass() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const pass = useMemo(() => {
    const stored = passStore.get();
    if (stored?.user?.id === id) return stored;
    const fromNav = location.state?.pass;
    if (fromNav?.user?.id === id) return fromNav;
    return null;
  }, [id, location.state]);

  const justRegistered = !!location.state?.justRegistered;
  const eventName = useEventName();
  const qrSize = useQrSize();
  const canvasWrapRef = useRef(null);
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  if (!pass) return <NotOnDevice />;
  const { user, qrToken } = pass;
  const checkedIn = !!user.checkedIn;
  const cancelled = user.status === 'cancelled';
  const fileName = `${(user.code || 'qr-pass').toLowerCase()}.png`;

  async function makePng() {
    const qrCanvas = canvasWrapRef.current?.querySelector('canvas');
    return renderTicketPng({ qrCanvas, user, eventName });
  }

  async function onDownload() {
    setBusy('download');
    try {
      const blob = await makePng();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      setToast('Pass image saved');
    } catch {
      setToast('Could not create the image — take a screenshot instead');
    } finally {
      setBusy('');
    }
  }

  async function onShare() {
    setBusy('share');
    const url = window.location.href;
    try {
      if (navigator.share) {
        // Prefer sharing the pass image itself (e.g. to WhatsApp / Files) when supported.
        try {
          const blob = await makePng();
          const file = new File([blob], fileName, { type: 'image/png' });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: `${eventName} pass`, text: `${user.fullName} · ${user.code}` });
            return;
          }
        } catch (e) {
          if (e?.name === 'AbortError') return;
        }
        await navigator.share({ title: `${eventName} pass`, text: `My QR pass · ${user.code}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setToast('Link copied');
    } catch (e) {
      if (e?.name !== 'AbortError') setToast('Sharing is not available on this device');
    } finally {
      setBusy('');
    }
  }

  function onRemove() {
    passStore.clear();
    navigate('/', { replace: true });
  }

  return (
    <PublicLayout back="/">
      {justRegistered && (
        <Alert tone="success" icon={PartyPopper} title="You're registered!" className="no-print mb-5">
          Your pass is saved on this phone. Show the QR code at the entrance.
        </Alert>
      )}

      {/* Ticket */}
      <article
        aria-label={`Entry pass for ${user.fullName}`}
        className="relative mx-auto overflow-hidden rounded-[1.75rem] bg-white shadow-[var(--shadow-card)] ring-1 ring-slate-900/5 animate-fade-up print:shadow-none print:ring-slate-300 [print-color-adjust:exact] [-webkit-print-color-adjust:exact]"
      >
        <header className="relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 px-6 pt-5 pb-6 text-white">
          <div aria-hidden className="absolute -right-10 -top-12 size-40 rounded-full bg-white/10" />
          <div aria-hidden className="absolute -right-2 top-10 size-20 rounded-full bg-white/5" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-200">Entry pass</p>
          <h1 className="relative mt-1 text-xl font-extrabold leading-tight tracking-tight">{eventName}</h1>
          <div className="relative mt-3">
            {cancelled ? (
              <Badge tone="danger">Cancelled</Badge>
            ) : checkedIn ? (
              <Badge tone="success"><CheckCircle2 className="size-3.5" /> Checked in</Badge>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-xs font-semibold text-white ring-1 ring-white/20">
                <span className="size-1.5 rounded-full bg-success-500" /> Valid for entry
              </span>
            )}
          </div>
        </header>

        {/* Perforation */}
        <div aria-hidden className="relative h-0">
          <div className="absolute -left-3.5 -top-3.5 size-7 rounded-full bg-slate-50 ring-1 ring-inset ring-slate-900/5 print:bg-white" />
          <div className="absolute -right-3.5 -top-3.5 size-7 rounded-full bg-slate-50 ring-1 ring-inset ring-slate-900/5 print:bg-white" />
        </div>

        <div className="px-5 pt-6 pb-5">
          <div className="mx-auto w-fit rounded-2xl bg-white p-4 ring-1 ring-slate-200 animate-pop">
            <QRCodeSVG
              value={qrToken}
              size={qrSize}
              level="M"
              marginSize={2}
              bgColor="#ffffff"
              fgColor="#0f172a"
              title={`QR code for ${user.fullName}`}
              className={cx('block', cancelled && 'opacity-30')}
            />
          </div>
          <p className="mt-3 text-center font-mono text-xl font-bold tracking-[0.12em] text-ink-900 select-all">{user.code}</p>
          <p className="text-center text-xs text-ink-500">Show this code if the QR can't be scanned</p>
        </div>

        <div className="mx-5 border-t-2 border-dashed border-slate-200" />

        <div className="flex items-center gap-4 px-5 py-5">
          <Avatar src={user.photo} name={user.fullName} size="size-14" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-400">Attendee</p>
            <p className="truncate text-lg font-bold leading-tight text-ink-900">{user.fullName}</p>
            {user.organization && (
              <p className="mt-0.5 flex items-center gap-1 truncate text-sm text-ink-600">
                <Building2 className="size-3.5 shrink-0" /> {user.organization}
              </p>
            )}
          </div>
        </div>

        {checkedIn && user.checkedInAt && (
          <div className="flex items-center gap-2 border-t border-slate-100 bg-success-50 px-5 py-3 text-sm text-success-600">
            <CheckCircle2 className="size-4" /> Checked in {formatDate(user.checkedInAt)}
          </div>
        )}
      </article>

      {/* Actions */}
      <div className="no-print mt-5 grid grid-cols-3 gap-2.5 animate-fade-up [animation-delay:80ms]">
        {[
          { key: 'download', label: 'Save image', icon: Download, onClick: onDownload },
          { key: 'print', label: 'Print', icon: Printer, onClick: () => window.print() },
          { key: 'share', label: 'Share', icon: Share2, onClick: onShare },
        ].map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={a.onClick}
            disabled={!!busy}
            className="flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-2xl bg-white text-sm font-semibold text-ink-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-brand-700 active:scale-[0.97] disabled:opacity-60"
          >
            <a.icon className={cx('size-5', busy === a.key && 'animate-pulse')} />
            {a.label}
          </button>
        ))}
      </div>

      {/* Tips */}
      <section aria-label="Entry tips" className="no-print mt-6 space-y-3 animate-fade-up [animation-delay:140ms]">
        <div className="flex gap-3 rounded-2xl bg-warn-50 p-4 ring-1 ring-warn-500/20">
          <Sun className="mt-0.5 size-5 shrink-0 text-warn-600" />
          <div className="text-sm">
            <p className="font-semibold text-ink-900">Increase screen brightness at entry</p>
            <p className="mt-0.5 text-ink-600">A bright screen scans fastest — keep the QR flat and steady.</p>
          </div>
        </div>
        <div className="flex gap-3 rounded-2xl bg-brand-50 p-4 ring-1 ring-brand-500/15">
          <WifiOff className="mt-0.5 size-5 shrink-0 text-brand-600" />
          <div className="text-sm">
            <p className="font-semibold text-ink-900">Works without internet — save a screenshot</p>
            <p className="mt-0.5 text-ink-600">This pass is stored on your phone. A screenshot or saved image works just as well.</p>
          </div>
        </div>
      </section>

      <div className="no-print mt-8 text-center">
        {confirmRemove ? (
          <div className="inline-flex flex-col items-center gap-3 animate-fade-up">
            <p className="text-sm text-ink-600">Remove this pass from this device? You can find it again later.</p>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setConfirmRemove(false)}>Keep it</Button>
              <Button variant="danger" size="sm" icon={Trash2} onClick={onRemove}>Remove</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1 text-sm">
            <Link to="/find-pass" className="rounded-md px-2 py-1 font-medium text-ink-600 hover:text-brand-700">
              Not your pass? Find yours
            </Link>
            <button type="button" onClick={() => setConfirmRemove(true)} className="rounded-md px-2 py-1 text-ink-400 hover:text-danger-600">
              Remove from this device
            </button>
          </div>
        )}
      </div>

      {/* Offscreen high-res QR for PNG export */}
      <div ref={canvasWrapRef} aria-hidden className="pointer-events-none fixed -left-[9999px] top-0 opacity-0">
        <QRCodeCanvas value={qrToken} size={720} level="M" marginSize={0} bgColor="#ffffff" fgColor="#0f172a" />
      </div>

      {/* Toast */}
      <div aria-live="polite" className="no-print pointer-events-none fixed inset-x-0 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-30 flex justify-center px-4">
        {toast && (
          <div className="inline-flex items-center gap-2 rounded-full bg-ink-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg animate-pop">
            <Check className="size-4 text-success-500" /> {toast}
          </div>
        )}
      </div>
    </PublicLayout>
  );
}
