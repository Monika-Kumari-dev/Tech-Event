// Shared UI kit. Pages should build on these so the app looks consistent.
import { Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

export function cx(...c) {
  return c.filter(Boolean).join(' ');
}

const variants = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm shadow-brand-600/30',
  secondary: 'bg-white text-ink-900 ring-1 ring-slate-200 hover:bg-slate-50',
  ghost: 'text-ink-700 hover:bg-slate-100',
  success: 'bg-success-600 text-white hover:bg-success-500',
  danger: 'bg-danger-600 text-white hover:bg-danger-500',
};
const sizes = {
  sm: 'h-9 px-3 text-sm rounded-lg',
  md: 'h-11 px-4 text-sm rounded-xl',
  lg: 'h-13 px-6 text-base rounded-xl',
};

export function Button({ variant = 'primary', size = 'md', loading, icon: Icon, className, children, to, ...props }) {
  const cls = cx(
    'inline-flex items-center justify-center gap-2 font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none select-none',
    variants[variant], sizes[size], className,
  );
  const content = (
    <>
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className="size-4" /> : null}
      {children}
    </>
  );
  if (to) return <Link to={to} className={cls} {...props}>{content}</Link>;
  return <button className={cls} disabled={loading || props.disabled} {...props}>{content}</button>;
}

export function Card({ className, children, ...props }) {
  return (
    <div className={cx('bg-white rounded-[var(--radius-card)] shadow-[var(--shadow-card)] ring-1 ring-slate-900/5', className)} {...props}>
      {children}
    </div>
  );
}

export function Field({ label, hint, error, children, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="block text-sm font-medium text-ink-700 mb-1.5">{label}</span>
      {children}
      {error ? (
        <span className="block text-xs text-danger-600 mt-1.5">{error}</span>
      ) : hint ? (
        <span className="block text-xs text-ink-500 mt-1.5">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({ error, icon: Icon, className, ...props }) {
  return (
    <div className="relative">
      {Icon && <Icon className="size-4 text-ink-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />}
      <input
        className={cx(
          'w-full h-11 rounded-xl bg-white text-ink-900 placeholder:text-ink-400 ring-1 transition outline-none',
          'focus:ring-2 focus:ring-brand-500',
          Icon ? 'pl-10 pr-3.5' : 'px-3.5',
          error ? 'ring-danger-500' : 'ring-slate-200',
          className,
        )}
        {...props}
      />
    </div>
  );
}

const badgeTones = {
  neutral: 'bg-slate-100 text-ink-700',
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-success-50 text-success-600',
  warn: 'bg-warn-50 text-warn-600',
  danger: 'bg-danger-50 text-danger-600',
};
export function Badge({ tone = 'neutral', className, children }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', badgeTones[tone], className)}>
      {children}
    </span>
  );
}

export function Spinner({ className }) {
  return <Loader2 className={cx('size-5 animate-spin text-brand-600', className)} />;
}

export function Logo({ className }) {
  return (
    <Link to="/" className={cx('inline-flex items-center gap-2 font-extrabold tracking-tight text-ink-900', className)}>
      <span className="flex flex-col leading-tight"><span className="text-[10px] uppercase tracking-[.2em] text-brand-600">Honda · Client event</span><span className="font-serif text-lg">Namma Honda Habba</span></span>
    </Link>
  );
}

export function Avatar({ src, name, size = 'size-12' }) {
  const initials = (name || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  return src ? (
    <img src={src} alt={name} className={cx(size, 'rounded-full object-cover ring-2 ring-white')} />
  ) : (
    <div className={cx(size, 'rounded-full bg-brand-100 text-brand-700 font-bold grid place-items-center ring-2 ring-white')}>
      {initials}
    </div>
  );
}
