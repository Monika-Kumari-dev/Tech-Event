// Small helpers shared by the staff screens.
import { useEffect, useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { cx } from '../../components/ui.jsx';

export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** Re-render every `ms` so relative times stay fresh. */
export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function toMs(t) {
  if (t == null) return null;
  if (typeof t === 'number') return t;
  const n = Date.parse(t);
  return Number.isNaN(n) ? null : n;
}

export function timeAgo(t, now = Date.now()) {
  const ms = toMs(t);
  if (!ms) return 'never';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} d ago`;
}

export function formatTime(t) {
  const ms = toMs(t);
  if (!ms) return '—';
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return sameDay ? time : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`;
}

export function OnlinePill({ online, className }) {
  return (
    <span
      role="status"
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 h-7 text-xs font-bold',
        online ? 'bg-success-50 text-success-600 ring-1 ring-success-500/30' : 'bg-ink-900 text-white',
        className,
      )}
    >
      {online ? <Wifi className="size-3.5" /> : <WifiOff className="size-3.5" />}
      {online ? 'Online' : 'Offline'}
    </span>
  );
}

export function Skeleton({ className }) {
  return <div className={cx('animate-pulse rounded-lg bg-slate-200/80', className)} />;
}

// ---------- feedback: haptics + tones ----------
let audioCtx;
function ctx() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

/** Call from a user gesture once so iOS allows later beeps. */
export function unlockAudio() {
  ctx();
}

function tone(freqs, dur = 0.12, type = 'sine') {
  const ac = ctx();
  if (!ac) return;
  let t = ac.currentTime;
  for (const f of freqs) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.25, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    t += dur * 0.9;
  }
}

export function feedback(kind, { sound = true } = {}) {
  const pattern = { success: [60], warn: [80, 60, 80], error: [200, 80, 200] }[kind] || [40];
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
  if (!sound) return;
  if (kind === 'success') tone([880, 1320], 0.11);
  else if (kind === 'warn') tone([660, 660], 0.12, 'triangle');
  else tone([220, 180], 0.2, 'square');
}
