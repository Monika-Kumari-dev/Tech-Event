// Building blocks shared by the public (attendee) pages.
import { useEffect, useId, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { WifiOff, AlertCircle, LogIn, LayoutDashboard, Menu, X } from 'lucide-react';
import { Logo, Input, cx } from '../../components/ui.jsx';

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

const NAV = [
  { to: '/', label: 'Home', end: true },
  { to: '/#how', label: 'How it works', hash: 'how' },
  { to: '/find-pass', label: 'Find my pass' },
];

function useStaff() {
  try { return JSON.parse(localStorage.getItem('qrp.staff'))?.staff || null; } catch { return null; }
}

function useSavedPassId() {
  try { return JSON.parse(localStorage.getItem('qrp.pass'))?.user?.id || null; } catch { return null; }
}

/** Site header: logo · nav · Login / Register (hamburger menu on phones). */
export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const staff = useStaff();
  const passId = useSavedPassId();

  useEffect(() => setOpen(false), [location.pathname, location.hash]);

  const links = passId ? [...NAV, { to: `/pass/${passId}`, label: 'My pass' }] : NAV;

  const isActive = (l) => {
    if (l.hash) return location.pathname === '/' && location.hash === `#${l.hash}`;
    if (l.end) return location.pathname === l.to && !location.hash;
    return location.pathname.startsWith(l.to);
  };

  function go(e, l) {
    if (!l.hash) return;
    e.preventDefault();
    if (location.pathname === '/') {
      document.getElementById(l.hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.history.replaceState(null, '', `/#${l.hash}`);
      setOpen(false);
    } else {
      navigate(`/#${l.hash}`);
    }
  }

  const staffLink = staff
    ? { to: staff.role === 'admin' ? '/admin' : '/verify', label: staff.role === 'admin' ? 'Dashboard' : 'Verifier', icon: LayoutDashboard }
    : { to: '/staff/login', label: 'Login', icon: LogIn };

  return (
    <header className="no-print sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-md pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Logo className="shrink-0" />

        <nav aria-label="Main" className="hidden md:flex items-center gap-1 mx-auto">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={(e) => go(e, l)}
              aria-current={isActive(l) ? 'page' : undefined}
              className={cx(
                'rounded-lg px-3.5 py-2 text-sm font-semibold transition',
                isActive(l) ? 'text-brand-700 bg-brand-50' : 'text-ink-600 hover:text-ink-900 hover:bg-slate-100',
              )}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto md:ml-0 flex items-center gap-2">
          <Link
            to={staffLink.to}
            className="hidden sm:inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-ink-700 ring-1 ring-slate-200 bg-white hover:bg-slate-50 transition"
          >
            <staffLink.icon className="size-4" /> {staffLink.label}
          </Link>
          <Link
            to="/register"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-sm shadow-brand-600/30 hover:bg-brand-700 transition active:scale-[0.98]"
          >
            Register
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            className="md:hidden grid size-10 place-items-center rounded-xl text-ink-700 hover:bg-slate-100 transition"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div id="mobile-nav" className="md:hidden border-t border-slate-200/70 bg-white animate-fade-up">
          <nav aria-label="Mobile" className="mx-auto max-w-7xl px-4 py-3 flex flex-col gap-1">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                onClick={(e) => go(e, l)}
                className={cx(
                  'rounded-xl px-3 py-3 text-base font-semibold transition',
                  isActive(l) ? 'text-brand-700 bg-brand-50' : 'text-ink-700 hover:bg-slate-100',
                )}
              >
                {l.label}
              </Link>
            ))}
            <Link
              to={staffLink.to}
              className="mt-2 flex items-center justify-center gap-2 h-12 rounded-xl text-base font-semibold text-ink-800 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              <staffLink.icon className="size-4" /> {staff ? staffLink.label : 'Staff login'}
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="no-print border-t border-slate-200 bg-white/60">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-ink-500 sm:flex-row sm:px-6 lg:px-8">
        <p>© {new Date().getFullYear()} Teck Fluence X · Fast, offline-ready event entry</p>
        <nav aria-label="Footer" className="flex items-center gap-1">
          <Link to="/register" className="rounded-md px-2 py-1 hover:text-brand-700 hover:bg-slate-100 transition">Register</Link>
          <Link to="/find-pass" className="rounded-md px-2 py-1 hover:text-brand-700 hover:bg-slate-100 transition">Find my pass</Link>
          <Link to="/staff/login" className="rounded-md px-2 py-1 hover:text-brand-700 hover:bg-slate-100 transition">Staff login</Link>
        </nav>
      </div>
    </footer>
  );
}

/** Page chrome: site header, soft brand glow, content column, footer. (`back`/`right` kept for compatibility.) */
// eslint-disable-next-line no-unused-vars
export function PublicLayout({ children, back, right, wide = false, className }) {
  return (
    <div className="relative min-h-dvh overflow-x-hidden flex flex-col">
      <div
        aria-hidden
        className="no-print pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(60%_60%_at_50%_0%,var(--color-brand-100),transparent)] opacity-80"
      />
      <SiteHeader />
      <main
        className={cx(
          'w-full flex-1 mx-auto px-4 pb-[calc(2.5rem+env(safe-area-inset-bottom))] pt-6 sm:pt-10',
          wide ? 'max-w-7xl sm:px-6 lg:px-8' : 'max-w-md',
          className,
        )}
      >
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

export function PageTitle({ eyebrow, title, subtitle }) {
  return (
    <div className="mb-6 animate-fade-up">
      {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">{eyebrow}</p>}
      <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-ink-900">{title}</h1>
      {subtitle && <p className="mt-2 text-ink-600 leading-relaxed">{subtitle}</p>}
    </div>
  );
}

/** Accessible text field with inline error (announced via aria-live). */
export function TextField({ label, optional, hint, error, icon, id: idProp, className, ...inputProps }) {
  const autoId = useId();
  const id = idProp || autoId;
  const msgId = `${id}-msg`;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-ink-700">
        <span>{label}</span>
        {optional && <span className="text-xs font-normal text-ink-400">Optional</span>}
      </label>
      <Input
        id={id}
        icon={icon}
        error={error}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? msgId : undefined}
        className="h-12! text-base"
        {...inputProps}
      />
      <div id={msgId} aria-live="polite" className="min-h-0">
        {error ? (
          <p className="mt-1.5 flex items-start gap-1.5 text-[13px] text-danger-600 animate-fade-up">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
            <span>{error}</span>
          </p>
        ) : hint ? (
          <p className="mt-1.5 text-[13px] text-ink-500">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

const alertTones = {
  danger: 'bg-danger-50 text-danger-600 ring-danger-500/20',
  warn: 'bg-warn-50 text-warn-600 ring-warn-500/25',
  brand: 'bg-brand-50 text-brand-700 ring-brand-500/20',
  success: 'bg-success-50 text-success-600 ring-success-500/20',
};

export function Alert({ tone = 'danger', icon: Icon = AlertCircle, title, children, className }) {
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-2xl p-4 ring-1 animate-fade-up', alertTones[tone], className)}>
      <Icon className="mt-0.5 size-5 shrink-0" />
      <div className="text-sm leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5 opacity-90' : ''}>{children}</div>}
      </div>
    </div>
  );
}

export function OfflineBanner({ what = 'This step' }) {
  return (
    <Alert tone="warn" icon={WifiOff} title="You're offline" className="mb-5">
      {what} needs an internet connection. Connect to Wi-Fi or mobile data and try again — your details stay on this screen.
    </Alert>
  );
}

// Simple, forgiving validators shared by Register + FindPass.
export const validators = {
  fullName(v) {
    const s = v.trim();
    if (!s) return 'Please enter your full name.';
    if (s.length < 2) return 'That name looks too short.';
    if (s.length > 80) return 'Please keep your name under 80 characters.';
    return '';
  },
  phone(v) {
    const s = v.trim();
    if (!s) return 'Please enter your mobile number.';
    if (/[^\d\s()+-]/.test(s)) return 'Use digits only (spaces, + and - are fine).';
    const digits = s.replace(/\D/g, '');
    if (digits.length < 10) return 'Mobile number should have at least 10 digits.';
    if (digits.length > 15) return 'That number has too many digits.';
    return '';
  },
  email(v) {
    const s = v.trim();
    if (!s) return 'Please enter your email address.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return 'Enter a valid email, like name@example.com.';
    return '';
  },
  organization(v) {
    return v.trim().length > 100 ? 'Please keep this under 100 characters.' : '';
  },
};
