import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { ApiError } from '../../../lib/api.js';
import { cx } from '../../../components/ui.jsx';

export const fmt = (n) => Number(n || 0).toLocaleString();
export const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

export function errorMessage(e, fallback = 'Something went wrong.') {
  if (e instanceof ApiError) {
    if (e.status === 0) return 'You are offline. Reconnect and try again.';
    if (e.status === 401) return 'Your session expired. Please sign in again.';
    if (e.status === 403) return 'Only admins can do this.';
    if (e.status === 404) return 'This feature is not available on the server yet.';
    if (e.status === 413) return 'The request was too large for the server.';
    return e.message || fallback;
  }
  return e?.message || fallback;
}

// ---------- toasts ----------
export function useToasts() {
  const [items, setItems] = useState([]);
  const timers = useRef(new Map());
  const dismiss = useCallback((id) => {
    setItems((t) => t.filter((x) => x.id !== id));
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
  }, []);
  const push = useCallback((tone, title, text) => {
    const id = Math.random().toString(36).slice(2);
    setItems((t) => [...t.slice(-3), { id, tone, title, text }]);
    timers.current.set(id, setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4500));
  }, [dismiss]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  return { items, push, dismiss };
}

const toastStyle = {
  success: { icon: CheckCircle2, cls: 'text-success-600' },
  error: { icon: XCircle, cls: 'text-danger-600' },
  warn: { icon: AlertTriangle, cls: 'text-warn-600' },
  info: { icon: Info, cls: 'text-brand-600' },
};

export function Toasts({ items, onDismiss }) {
  return (
    <div className="fixed z-50 inset-x-3 bottom-3 sm:inset-x-auto sm:right-5 sm:bottom-5 sm:w-96 flex flex-col gap-2 pointer-events-none" aria-live="polite" role="status">
      {items.map((t) => {
        const s = toastStyle[t.tone] || toastStyle.info;
        return (
          <div key={t.id} className="pointer-events-auto animate-pop flex items-start gap-3 rounded-2xl bg-white p-3.5 shadow-lg ring-1 ring-slate-900/10">
            <s.icon className={cx('size-5 shrink-0 mt-0.5', s.cls)} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{t.title}</p>
              {t.text && <p className="text-xs text-ink-500 mt-0.5 break-words">{t.text}</p>}
            </div>
            <button type="button" onClick={() => onDismiss(t.id)} className="shrink-0 rounded-lg p-1 text-ink-400 hover:bg-slate-100" aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ---------- layout bits ----------
export function ProgressBar({ value, max, tone = 'brand', label, indeterminate, size = 'md' }) {
  const pct = max ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cx('rounded-full bg-slate-100 overflow-hidden', size === 'lg' ? 'h-3.5' : size === 'sm' ? 'h-1.5' : 'h-2.5')}
      role="progressbar" aria-label={label}
      aria-valuemin={0} aria-valuemax={max || 100} aria-valuenow={indeterminate ? undefined : value}>
      <div className={cx('h-full rounded-full transition-[width] duration-300',
        tone === 'success' ? 'bg-success-500' : tone === 'warn' ? 'bg-warn-500' : 'bg-brand-600', indeterminate && 'animate-pulse w-1/3')}
        style={indeterminate ? undefined : { width: `${pct}%` }} />
    </div>
  );
}

const countTones = {
  neutral: 'bg-slate-200/70 text-ink-600',
  success: 'bg-success-50 text-success-600',
  warn: 'bg-warn-50 text-warn-600',
  danger: 'bg-danger-50 text-danger-600',
};

/** Segmented control (radio group). options: [{ id, label, icon?, n?, tone?, disabled? }] */
export function Segmented({ options, value, onChange, label, className, full }) {
  return (
    <div className={cx('flex rounded-xl bg-slate-100 p-1 gap-0.5 max-w-full overflow-x-auto', full ? 'w-full' : 'w-fit', className)}
      role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button key={o.id} type="button" role="radio" aria-checked={active} disabled={o.disabled} onClick={() => onChange(o.id)}
            className={cx('h-8 px-3 rounded-lg text-[13px] font-semibold whitespace-nowrap transition inline-flex items-center justify-center gap-1.5 disabled:opacity-50',
              full && 'flex-1',
              active ? 'bg-white text-ink-900 shadow-sm ring-1 ring-slate-900/5' : 'text-ink-500 hover:text-ink-900')}>
            {o.icon && <o.icon className="size-4" />}
            {o.label}
            {o.n != null && (
              <span className={cx('tabular-nums text-[11px] leading-4 rounded-full px-1.5', o.n ? countTones[o.tone || 'neutral'] : countTones.neutral)}>{fmt(o.n)}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Small label/value pair used in card metadata lists. */
export function MetaRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <dt className="text-ink-500">{label}</dt>
      <dd className="font-semibold text-ink-900 tabular-nums text-right truncate">{children}</dd>
    </div>
  );
}

export function Alert({ tone = 'danger', children, action }) {
  const map = {
    danger: ['bg-danger-50 ring-danger-500/30', XCircle, 'text-danger-600'],
    warn: ['bg-warn-50 ring-warn-500/30', AlertTriangle, 'text-warn-600'],
    info: ['bg-brand-50 ring-brand-200', Info, 'text-brand-600'],
  };
  const [cls, Icon, ic] = map[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('flex items-start gap-3 rounded-2xl ring-1 p-3.5 text-sm', cls)}>
      <Icon className={cx('size-5 shrink-0', ic)} />
      <div className="flex-1 text-ink-700 min-w-0">{children}</div>
      {action}
    </div>
  );
}

/** Warn before closing the tab while a long job runs. */
export function useBeforeUnload(active) {
  useEffect(() => {
    if (!active) return undefined;
    const h = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [active]);
}
