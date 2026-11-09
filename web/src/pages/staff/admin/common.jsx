// Small building blocks shared by the Admin tabs (formatting, entry table, copy button, error block, segmented control).
import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Copy, RefreshCw, UserCheck } from 'lucide-react';
import { Avatar, Badge, Button, cx } from '../../../components/ui.jsx';
import { EmptyState } from '../adminKit.jsx';
import { Skeleton, formatTime, timeAgo, toMs, useNow } from '../shared.jsx';

export function fmt(n) {
  return Number(n || 0).toLocaleString();
}

export function pct(part, total) {
  return total ? Math.round((part / total) * 1000) / 10 : 0;
}

/** "9 AM" style hour label. */
export function hourLabel(ms) {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true });
}

export function formatDate(t) {
  const ms = toMs(t);
  if (!ms) return '—';
  return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Seconds-precision "updated" text for the live indicator. */
export function agoShort(ms, now) {
  if (!ms) return '';
  const s = Math.max(0, Math.round((now - ms) / 1000));
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  return `${Math.floor(m / 60)} h ago`;
}

/** Thin horizontal progress bar (value in %). */
export function Bar({ value, tone = 'success', label }) {
  const v = Math.max(0, Math.min(100, value));
  const tones = { success: 'bg-success-500', brand: 'bg-brand-500', neutral: 'bg-slate-400', warn: 'bg-warn-500' };
  return (
    <div className="h-2 rounded-full bg-slate-100 overflow-hidden" role="progressbar" aria-valuenow={v} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className={cx('h-full rounded-full transition-[width] duration-700', tones[tone])} style={{ width: `${v}%` }} />
    </div>
  );
}

export function ErrorBlock({ message, onRetry }) {
  return (
    <div className="h-full min-h-40 grid place-items-center text-center py-8" role="alert">
      <div>
        <span className="mx-auto grid place-items-center size-11 rounded-2xl bg-danger-50 text-danger-600 mb-3">
          <AlertTriangle className="size-5" />
        </span>
        <p className="text-sm font-semibold text-danger-600">{message}</p>
        {onRetry && <Button variant="secondary" size="sm" className="mt-3" icon={RefreshCw} onClick={onRetry}>Retry</Button>}
      </div>
    </div>
  );
}

export function CopyButton({ value, label = 'Copy' }) {
  const [done, setDone] = useState(false);
  const t = useRef(null);
  useEffect(() => () => clearTimeout(t.current), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      clearTimeout(t.current);
      t.current = setTimeout(() => setDone(false), 1500);
    } catch { /* clipboard unavailable */ }
  }
  return (
    <button type="button" onClick={copy} aria-label={`${label} ${value}`} title={done ? 'Copied' : label}
      className={cx('grid place-items-center size-7 rounded-md shrink-0 transition focus-visible:outline-2 focus-visible:outline-brand-500',
        done ? 'text-success-600 bg-success-50' : 'text-ink-400 hover:text-ink-700 hover:bg-slate-100')}>
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
    </button>
  );
}

/** Pill-style segmented control (radiogroup). options: [{ id, label, count? }] */
export function Segmented({ value, onChange, options, label, className }) {
  function onKey(e) {
    const i = options.findIndex((o) => o.id === value);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const n = options[(i + (e.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length];
      onChange(n.id);
      e.currentTarget.querySelector(`[data-id="${n.id}"]`)?.focus();
    }
  }
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKey}
      className={cx('flex sm:inline-flex rounded-xl bg-slate-100 p-1 gap-0.5', className)}>
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button key={o.id} data-id={o.id} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => onChange(o.id)}
            className={cx('h-9 flex-1 sm:flex-none justify-center px-2 sm:px-3 rounded-lg text-[13px] sm:text-sm font-semibold whitespace-nowrap inline-flex items-center gap-1.5 sm:gap-2 transition',
              on ? 'bg-white text-ink-900 shadow-sm ring-1 ring-slate-900/5' : 'text-ink-500 hover:text-ink-900')}>
            {o.short ? <><span className="sm:hidden">{o.short}</span><span className="hidden sm:inline">{o.label}</span></> : o.label}
            {o.count != null && (
              <span className={cx('rounded-md px-1.5 text-xs tabular-nums', on ? 'bg-brand-50 text-brand-700' : 'bg-slate-200/70 text-ink-500')}>
                {fmt(o.count)}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

const th = 'px-4 first:pl-5 last:pr-5 h-10 text-left text-[11px] font-semibold uppercase tracking-wider text-ink-400 whitespace-nowrap';
const td = 'px-4 first:pl-5 last:pr-5 py-3 align-middle';

/** Table of check-ins: attendee, code, gate, staff, time. Collapses to a list below md. */
export function EntriesTable({ items, loading, rows = 10, compact = false }) {
  const codeCol = compact ? 'hidden' : 'hidden md:table-cell';
  const now = useNow();
  if (loading) {
    return (
      <div className="divide-y divide-slate-100">
        {Array.from({ length: Math.min(rows, 6) }, (_, i) => (
          <div key={i} className="flex items-center gap-3 px-5 py-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-3.5 w-40" />
            <Skeleton className="ml-auto h-3 w-16" />
          </div>
        ))}
      </div>
    );
  }
  if (!items.length) {
    return (
      <EmptyState icon={UserCheck} title="No check-ins yet">
        Entries appear here as soon as gate phones scan passes and sync.
      </EmptyState>
    );
  }
  return (
    <table className="w-full table-fixed text-sm">
      <thead className="bg-slate-50/80 border-b border-slate-100">
        <tr>
          <th className={cx(th, 'w-auto')}>Attendee</th>
          <th className={cx(th, codeCol, 'w-[8rem]')}>Code</th>
          <th className={cx(th, 'hidden lg:table-cell', compact ? 'w-[34%]' : 'w-[24%]')}>Gate</th>
          <th className={cx(th, compact ? 'hidden' : 'hidden 2xl:table-cell', 'w-[14%]')}>Staff</th>
          <th className={cx(th, 'w-[7rem] text-right')}>Time</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {items.slice(0, rows).map((c) => (
          <tr key={c.id} className="hover:bg-slate-50/70">
            <td className={td}>
              <div className="flex items-center gap-3 min-w-0">
                <Avatar name={c.user?.fullName || '?'} size="size-8 shrink-0 text-[11px]" />
                <div className="min-w-0">
                  <p className="font-semibold text-ink-900 truncate flex items-center gap-2" title={c.user?.fullName}>
                    <span className="truncate">{c.user?.fullName || 'Unknown attendee'}</span>
                    {c.duplicate && <Badge tone="warn" className="shrink-0">Duplicate</Badge>}
                  </p>
                  {compact ? (
                    <p className="text-xs text-ink-500 truncate"><span className="font-mono">{c.user?.code}</span> · by {c.verifiedBy || '—'}<span className="lg:hidden"> · {c.deviceName || 'Device'}</span></p>
                  ) : (
                    <>
                      <p className="text-xs text-ink-500 truncate md:hidden">
                        <span className="font-mono">{c.user?.code}</span> · {c.deviceName || 'Device'} · {c.verifiedBy}
                      </p>
                      <p className="text-xs text-ink-500 truncate hidden md:block lg:hidden">{c.deviceName || 'Device'} · {c.verifiedBy}</p>
                      <p className="text-xs text-ink-500 truncate hidden lg:block 2xl:hidden">by {c.verifiedBy || '—'}</p>
                    </>
                  )}
                </div>
              </div>
            </td>
            <td className={cx(td, codeCol)}><span className="font-mono text-xs text-ink-700">{c.user?.code || '—'}</span></td>
            <td className={cx(td, 'hidden lg:table-cell')}><span className="block truncate text-ink-700" title={c.deviceName}>{c.deviceName || 'Unnamed device'}</span></td>
            <td className={cx(td, compact ? 'hidden' : 'hidden 2xl:table-cell')}><span className="block truncate text-ink-600" title={c.verifiedBy}>{c.verifiedBy || '—'}</span></td>
            <td className={cx(td, 'text-right whitespace-nowrap')}>
              <span className="block text-ink-900 tabular-nums font-medium">{formatTime(c.scannedAt)}</span>
              <span className="block text-xs text-ink-400 tabular-nums">{timeAgo(c.scannedAt, now)}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const tableTh = th;
export const tableTd = td;
