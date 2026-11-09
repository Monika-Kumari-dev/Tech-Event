// Camera viewfinder built on html5-qrcode with a custom animated frame overlay.
import { useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Flashlight, FlashlightOff, Lock, RefreshCw } from 'lucide-react';
import { Button, cx } from '../../components/ui.jsx';

const SCANNING = 2;
const PAUSED = 3;
let seq = 0;

/**
 * @param {{ onScan:(text:string)=>void, paused:boolean }} props
 */
export default function Scanner({ onScan, paused }) {
  const hostRef = useRef(null);
  const scannerRef = useRef(null);
  const onScanRef = useRef(onScan);
  const pausedRef = useRef(paused);
  useEffect(() => {
    onScanRef.current = onScan;
    pausedRef.current = paused;
  });
  const [state, setState] = useState('starting'); // starting | running | denied | nocamera | insecure | error
  const [errorMsg, setErrorMsg] = useState('');
  const [torch, setTorch] = useState({ supported: false, on: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setState('insecure');
      return;
    }
    // A fresh element per mount avoids StrictMode / restart races inside html5-qrcode.
    const el = document.createElement('div');
    el.id = `qr-reader-${++seq}`;
    el.className = 'size-full';
    host.appendChild(el);

    let cancelled = false;
    let scanner = null;
    setState('starting');

    // Loaded lazily so public pages don't ship the decoder.
    const started = import('html5-qrcode').then(({ Html5Qrcode, Html5QrcodeSupportedFormats }) => {
      if (cancelled) return;
      scanner = new Html5Qrcode(el.id, {
        verbose: false,
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        useBarCodeDetectorIfSupported: true,
      });
      scannerRef.current = scanner;
      return scanner.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          aspectRatio: 1,
          qrbox: (w, h) => {
            const s = Math.max(120, Math.floor(Math.min(w, h) * 0.7));
            return { width: s, height: s };
          },
        },
        (text) => { if (!pausedRef.current) onScanRef.current?.(text); },
        () => {},
      );
    });

    started
      .then(() => {
        if (cancelled || !scanner) return;
        setState('running');
        try {
          const t = scanner.getRunningTrackCameraCapabilities().torchFeature();
          setTorch({ supported: t.isSupported(), on: false });
        } catch {
          setTorch({ supported: false, on: false });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = String(err?.message || err || '');
        if (/NotAllowed|Permission|denied/i.test(msg)) setState('denied');
        else if (/NotFound|Requested device not found|OverconstrainedError/i.test(msg)) setState('nocamera');
        else { setState('error'); setErrorMsg(msg); }
      });

    return () => {
      cancelled = true;
      scannerRef.current = null;
      started
        .then(() => {
          if (!scanner) return;
          const st = scanner.getState();
          if (st === SCANNING || st === PAUSED) return scanner.stop();
        })
        .catch(() => {})
        .finally(() => {
          try { scanner?.clear(); } catch { /* already cleared */ }
          el.remove();
        });
    };
  }, [attempt]);

  // Freeze the video while a result is shown.
  useEffect(() => {
    const s = scannerRef.current;
    if (!s || state !== 'running') return;
    try {
      const st = s.getState();
      if (paused && st === SCANNING) s.pause(true);
      else if (!paused && st === PAUSED) s.resume();
    } catch { /* ignore transient state errors */ }
  }, [paused, state]);

  async function toggleTorch() {
    const s = scannerRef.current;
    if (!s) return;
    try {
      const t = s.getRunningTrackCameraCapabilities().torchFeature();
      await t.apply(!torch.on);
      setTorch({ supported: true, on: !torch.on });
    } catch {
      setTorch({ supported: false, on: false });
    }
  }

  const running = state === 'running';

  return (
    <div className="relative aspect-square w-full overflow-hidden rounded-[1.75rem] bg-ink-900 shadow-[var(--shadow-card)] ring-1 ring-slate-900/10">
      <div
        ref={hostRef}
        className={cx(
          'absolute inset-0',
          '[&_video]:size-full! [&_video]:object-cover [&_#qr-shaded-region]:hidden [&_img]:hidden',
          !running && 'opacity-0',
        )}
      />

      {running && <Frame paused={paused} />}

      {running && torch.supported && (
        <button type="button" onClick={toggleTorch} aria-pressed={torch.on}
          aria-label={torch.on ? 'Turn flashlight off' : 'Turn flashlight on'}
          className={cx(
            'absolute right-3 top-3 size-12 rounded-full grid place-items-center backdrop-blur transition active:scale-95',
            torch.on ? 'bg-warn-500 text-ink-900' : 'bg-black/45 text-white',
          )}>
          {torch.on ? <Flashlight className="size-5" /> : <FlashlightOff className="size-5" />}
        </button>
      )}

      {state === 'starting' && (
        <Overlay icon={Camera} title="Starting camera…" pulse>
          Allow camera access when your browser asks.
        </Overlay>
      )}
      {state === 'denied' && (
        <Overlay icon={CameraOff} title="Camera access is blocked">
          <ol className="text-left list-decimal pl-5 space-y-1 mt-1">
            <li>Tap the lock / <b>aA</b> icon in the address bar.</li>
            <li>Set <b>Camera</b> to <b>Allow</b>.</li>
            <li>Come back and tap Try again.</li>
          </ol>
          <Retry onClick={() => setAttempt((a) => a + 1)} />
          <p className="mt-3 text-white/60">You can still enter pass codes by hand below.</p>
        </Overlay>
      )}
      {state === 'nocamera' && (
        <Overlay icon={CameraOff} title="No camera found">
          Use a phone with a rear camera, or enter pass codes by hand below.
          <Retry onClick={() => setAttempt((a) => a + 1)} />
        </Overlay>
      )}
      {state === 'insecure' && (
        <Overlay icon={Lock} title="Camera needs a secure connection">
          Open this app over <b>https://</b> (or localhost) to use the camera. Manual code entry still works.
        </Overlay>
      )}
      {state === 'error' && (
        <Overlay icon={CameraOff} title="Camera could not start">
          {errorMsg ? <span className="block text-white/60 text-xs mb-1 break-words">{errorMsg.slice(0, 140)}</span> : null}
          Close other apps using the camera and try again.
          <Retry onClick={() => setAttempt((a) => a + 1)} />
        </Overlay>
      )}
    </div>
  );
}

function Frame({ paused }) {
  const corner = 'absolute size-10 border-white border-[5px]';
  return (
    <div className="pointer-events-none absolute inset-0 grid place-items-center">
      <div className="relative w-[70%] aspect-square rounded-3xl shadow-[0_0_0_100vmax_rgb(15_23_42/0.55)]">
        <span className={cx(corner, 'left-0 top-0 border-r-0 border-b-0 rounded-tl-3xl')} />
        <span className={cx(corner, 'right-0 top-0 border-l-0 border-b-0 rounded-tr-3xl')} />
        <span className={cx(corner, 'left-0 bottom-0 border-r-0 border-t-0 rounded-bl-3xl')} />
        <span className={cx(corner, 'right-0 bottom-0 border-l-0 border-t-0 rounded-br-3xl')} />
        {!paused && (
          <span className="qrp-scanline absolute inset-x-4 h-0.5 rounded-full bg-brand-200 shadow-[0_0_14px_3px_rgb(129_140_248/0.8)]" />
        )}
      </div>
      <p className="absolute bottom-4 inset-x-0 text-center text-sm font-semibold text-white drop-shadow">
        {paused ? 'Paused' : 'Point at the QR pass'}
      </p>
      <style>{`
        @keyframes qrp-scan { 0%,100% { top: 8%; } 50% { top: 92%; } }
        .qrp-scanline { animation: qrp-scan 2.4s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .qrp-scanline { animation: none; top: 50%; } }
      `}</style>
    </div>
  );
}

function Overlay({ icon: Icon, title, children, pulse }) {
  return (
    <div className="absolute inset-0 grid place-items-center p-6 text-center text-white">
      <div className="max-w-xs">
        <div className={cx('mx-auto mb-3 size-14 rounded-2xl bg-white/10 grid place-items-center', pulse && 'animate-pulse')}>
          <Icon className="size-7" />
        </div>
        <p className="font-bold text-lg">{title}</p>
        <div className="mt-1 text-sm text-white/80">{children}</div>
      </div>
    </div>
  );
}

function Retry({ onClick }) {
  return (
    <Button variant="secondary" size="sm" icon={RefreshCw} className="mt-4" onClick={onClick}>
      Try again
    </Button>
  );
}
