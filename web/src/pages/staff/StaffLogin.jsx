import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertCircle, ArrowLeft, ArrowRight, BarChart3, CheckCircle2, Eye, EyeOff, KeyRound, LayoutDashboard, Lock, LogOut,
  MonitorSmartphone, RefreshCw, ScanLine, User, WifiOff,
} from 'lucide-react';
import { api, ApiError, staffSession } from '../../lib/api.js';
import { getMeta, setMeta } from '../../lib/offlineDb.js';
import { clearSyncError } from '../../lib/sync.js';
import { Avatar, Badge, Button, Input, Logo, cx } from '../../components/ui.jsx';
import { useOnline } from './shared.jsx';

const SUGGESTIONS = ['Gate 1', 'Gate 2', 'Main entrance', 'VIP desk'];

const FEATURES = [
  { icon: ScanLine, title: 'Scan at any gate, even offline', text: 'Passes are verified on the device — no signal needed.' },
  { icon: RefreshCw, title: 'Auto-sync when back online', text: 'Check-ins upload automatically; duplicates are flagged.' },
  { icon: BarChart3, title: 'Live dashboard & bulk QR', text: 'Track arrivals and generate thousands of passes at once.' },
];

export default function StaffLogin() {
  const [session, setSession] = useState(() => staffSession.get());
  const signedIn = !!session?.token;

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] bg-white">
      <BrandPanel />

      <div className="relative flex min-h-dvh flex-col">
        {/* top bar */}
        <header className="flex h-16 items-center justify-between gap-3 px-4 sm:px-8 pt-[env(safe-area-inset-top)]">
          <Logo className="lg:invisible" />
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-ink-600 hover:text-ink-900 hover:bg-slate-100 transition"
          >
            <ArrowLeft className="size-4" /> Back to website
          </Link>
        </header>

        <main className="flex flex-1 items-center justify-center px-4 py-8 sm:px-8">
          <div className="w-full max-w-[26rem] animate-fade-up">
            <Steps current={signedIn ? 2 : 1} />
            {signedIn ? (
              <DeviceStep session={session} onSwitch={() => { staffSession.clear(); setSession(null); }} />
            ) : (
              <LoginStep onDone={setSession} />
            )}
          </div>
        </main>

        <footer className="px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-8 text-center lg:text-left text-xs text-ink-400">
          © {new Date().getFullYear()} Teck Fluence X · Staff access only
        </footer>
      </div>
    </div>
  );
}

/* ───────────── Left brand panel (desktop) ───────────── */

function BrandPanel() {
  return (
    <aside className="relative hidden lg:flex flex-col overflow-hidden bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 text-white p-10 xl:p-14">
      {/* decorative grid + glows */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(rgb(255_255_255/.5)_1px,transparent_1px),linear-gradient(90deg,rgb(255_255_255/.5)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_at_30%_20%,black,transparent_70%)]"
      />
      <div aria-hidden className="absolute -top-32 -right-24 size-96 rounded-full bg-brand-500/40 blur-3xl" />
      <div aria-hidden className="absolute -bottom-40 -left-24 size-[28rem] rounded-full bg-indigo-400/20 blur-3xl" />

      <Link to="/" className="relative inline-flex items-center gap-2.5 font-extrabold tracking-tight text-lg">
        <span className="grid size-9 place-items-center rounded-xl bg-white/15 ring-1 ring-white/25">
          <img src="/favicon.svg" alt="" className="size-6" />
        </span>
        Teck Fluence X
      </Link>

      <div className="relative my-auto max-w-lg py-10">
        <Badge className="bg-white/15 text-white ring-1 ring-white/20">Staff portal</Badge>
        <h2 className="mt-5 text-4xl xl:text-5xl font-extrabold leading-[1.08] tracking-tight">
          Fast, reliable entry.
          <span className="block text-brand-200">Even without internet.</span>
        </h2>
        <p className="mt-4 text-base text-white/75 leading-relaxed">
          Sign in to verify attendee passes at the gate or manage registrations, check-ins and bulk QR passes.
        </p>

        <ul className="mt-8 space-y-4">
          {FEATURES.map((f) => (
            <li key={f.title} className="flex gap-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/15">
                <f.icon className="size-5" />
              </span>
              <div>
                <p className="font-semibold">{f.title}</p>
                <p className="text-sm text-white/65">{f.text}</p>
              </div>
            </li>
          ))}
        </ul>

        <ScanPreview />
      </div>

      <p className="relative text-sm text-white/55">Trusted entry for Teck Fluence X events</p>
    </aside>
  );
}

function ScanPreview() {
  return (
    <div className="mt-10 max-w-sm rounded-2xl bg-white/95 p-4 text-ink-900 shadow-2xl shadow-brand-900/40 ring-1 ring-white/40 rotate-[-1.5deg]">
      <div className="flex items-center gap-3">
        <Avatar name="Aarav Mehta" size="size-11" />
        <div className="min-w-0 flex-1">
          <p className="font-bold truncate">Aarav Mehta</p>
          <p className="font-mono text-xs text-ink-500">TFX-7K3Q9X · Gate 1</p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-success-50 px-2.5 py-1 text-xs font-bold text-success-600">
          <CheckCircle2 className="size-3.5" /> Verified
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs text-ink-500">
        <span className="inline-flex items-center gap-1.5"><WifiOff className="size-3.5" /> Offline · saved on device</span>
        <span className="font-semibold text-ink-700">Synced later</span>
      </div>
    </div>
  );
}

/* ───────────── Step indicator ───────────── */

function Steps({ current }) {
  const steps = ['Sign in', 'Set up device'];
  return (
    <ol className="mb-8 flex items-center gap-3 text-xs font-semibold" aria-label="Sign-in steps">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="flex items-center gap-3 flex-1 last:flex-none" aria-current={active ? 'step' : undefined}>
            <span className="flex items-center gap-2 shrink-0">
              <span
                className={cx(
                  'grid size-6 place-items-center rounded-full text-[11px] transition',
                  done && 'bg-success-500 text-white',
                  active && 'bg-brand-600 text-white ring-4 ring-brand-100',
                  !done && !active && 'bg-slate-100 text-ink-400',
                )}
              >
                {done ? <CheckCircle2 className="size-4" /> : n}
              </span>
              <span className={active ? 'text-ink-900' : 'text-ink-400'}>{label}</span>
            </span>
            {n < steps.length && <span className={cx('h-px flex-1', done ? 'bg-success-500' : 'bg-slate-200')} />}
          </li>
        );
      })}
    </ol>
  );
}

/* ───────────── Step 1: sign in ───────────── */

function LoginStep({ onDone }) {
  const online = useOnline();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [errField, setErrField] = useState(null);
  const [loading, setLoading] = useState(false);
  const userRef = useRef(null);
  const pwRef = useRef(null);

  useEffect(() => { userRef.current?.focus(); }, []);

  async function submit(e) {
    e.preventDefault();
    if (!username.trim()) { setError('Enter your username.'); setErrField('username'); userRef.current?.focus(); return; }
    if (!password) { setError('Enter your password.'); setErrField('password'); pwRef.current?.focus(); return; }
    setLoading(true);
    setError('');
    setErrField(null);
    try {
      const res = await api('/staff/login', { method: 'POST', body: { username: username.trim(), password } });
      staffSession.set({ token: res.token, staff: res.staff, at: Date.now() });
      clearSyncError();
      onDone(staffSession.get());
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) setError('No internet connection. Signing in needs to reach the server once.');
      else if (err instanceof ApiError && err.status === 429) setError('Too many attempts. Please wait a minute and try again.');
      else if (err instanceof ApiError && (err.status === 401 || err.status === 400)) {
        setError('Incorrect username or password.');
        setErrField('password');
        setPassword('');
        pwRef.current?.focus();
      } else setError(err.message || 'Could not sign in. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight text-ink-900">Welcome back</h1>
      <p className="mt-2 text-ink-500">Sign in with the staff account your event admin gave you.</p>

      {!online && (
        <div role="alert" className="mt-6 flex gap-3 rounded-2xl bg-ink-900 text-white p-4 text-sm">
          <WifiOff className="size-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">You're offline</p>
            <p className="text-white/75 mt-0.5">Signing in needs internet once. After that, scanning works without a connection.</p>
          </div>
        </div>
      )}

      <form onSubmit={submit} className="mt-8 space-y-5" noValidate>
        <div>
          <label htmlFor="username" className="block text-sm font-semibold text-ink-700 mb-1.5">Username</label>
          <Input
            ref={userRef} id="username" icon={User} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            value={username} onChange={(e) => { setUsername(e.target.value); if (errField === 'username') { setError(''); setErrField(null); } }}
            placeholder="e.g. gate1" error={errField === 'username'} aria-invalid={errField === 'username' || undefined}
            className="h-12 text-base sm:text-sm"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-semibold text-ink-700 mb-1.5">Password</label>
          <div className="relative">
            <Input
              ref={pwRef} id="password" icon={KeyRound} type={showPw ? 'text' : 'password'} autoComplete="current-password"
              value={password} onChange={(e) => { setPassword(e.target.value); if (errField === 'password') { setError(''); setErrField(null); } }}
              placeholder="Enter your password" error={errField === 'password'} aria-invalid={errField === 'password' || undefined}
              className="h-12 pr-12 text-base sm:text-sm"
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? 'Hide password' : 'Show password'}
              aria-pressed={showPw}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 grid size-9 place-items-center rounded-lg text-ink-400 hover:text-ink-700 hover:bg-slate-100 transition"
            >
              {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        <div aria-live="polite">
          {error && (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger-600 bg-danger-50 ring-1 ring-danger-500/20 rounded-xl px-3.5 py-3">
              <AlertCircle className="size-4 shrink-0 mt-0.5" /> {error}
            </p>
          )}
        </div>

        <Button type="submit" size="lg" className="w-full h-12" loading={loading} disabled={!online}>
          {loading ? 'Signing in…' : <>Sign in <ArrowRight className="size-4" /></>}
        </Button>
      </form>

      <div className="mt-8 rounded-2xl bg-slate-50 ring-1 ring-slate-200/70 p-4 text-sm text-ink-600 flex gap-3">
        <Lock className="size-4 shrink-0 mt-0.5 text-ink-400" />
        <p>
          No account? Ask your event admin to add you under <span className="font-semibold text-ink-800">Admin → Staff</span>.
          Sessions stay active for 24 hours, so scanning keeps working offline.
        </p>
      </div>
    </>
  );
}

/* ───────────── Step 2: device setup ───────────── */

function DeviceStep({ session, onSwitch }) {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const isAdmin = session.staff?.role === 'admin';
  const displayName = session.staff?.name || session.staff?.username;

  useEffect(() => {
    getMeta('deviceName', '').then((n) => { setName(n || ''); setLoaded(true); });
  }, []);

  async function startVerifying(e) {
    e?.preventDefault();
    const n = name.trim();
    if (!n) {
      setError('Give this device a name so check-ins can be traced, e.g. "Gate 1".');
      return;
    }
    await setMeta('deviceName', n.slice(0, 40));
    navigate('/verify', { replace: true });
  }

  async function openDashboard() {
    // The dashboard doesn't need a device name; save one only if it was typed.
    if (name.trim()) await setMeta('deviceName', name.trim().slice(0, 40));
    navigate('/admin', { replace: true });
  }

  return (
    <>
      <div className="flex items-center gap-3 rounded-2xl bg-slate-50 ring-1 ring-slate-200/70 p-3.5">
        <Avatar name={displayName} size="size-11" />
        <div className="min-w-0 flex-1">
          <p className="text-xs text-ink-500">Signed in as</p>
          <p className="font-bold text-ink-900 truncate">{displayName}</p>
        </div>
        <Badge tone={isAdmin ? 'brand' : 'neutral'}>{isAdmin ? 'Admin' : 'Verifier'}</Badge>
      </div>

      <h1 className="mt-8 text-3xl font-extrabold tracking-tight text-ink-900">
        {isAdmin ? 'Where to next?' : 'Set up this device'}
      </h1>
      <p className="mt-2 text-ink-500">
        {isAdmin
          ? 'Open the dashboard, or name this device to scan passes at a gate.'
          : 'Name this phone so every check-in shows which gate it came from.'}
      </p>

      {isAdmin && (
        <button
          type="button"
          onClick={openDashboard}
          className="group mt-8 w-full flex items-center gap-4 rounded-2xl bg-white p-4 text-left ring-1 ring-slate-200 shadow-sm transition hover:ring-brand-300 hover:shadow-md"
        >
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-600 text-white shadow-sm shadow-brand-600/30">
            <LayoutDashboard className="size-5" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block font-bold text-ink-900">Open admin dashboard</span>
            <span className="block text-sm text-ink-500">Attendees, check-ins, bulk upload & QR passes</span>
          </span>
          <ArrowRight className="size-5 text-ink-400 transition group-hover:translate-x-0.5 group-hover:text-brand-600" />
        </button>
      )}

      {isAdmin && (
        <div className="my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-ink-400">
          <span className="h-px flex-1 bg-slate-200" /> or scan at a gate <span className="h-px flex-1 bg-slate-200" />
        </div>
      )}

      <form onSubmit={startVerifying} className={cx('space-y-4', !isAdmin && 'mt-8')}>
        <div>
          <label htmlFor="device" className="block text-sm font-semibold text-ink-700 mb-1.5">Device name</label>
          <Input
            id="device" icon={MonitorSmartphone} value={name} disabled={!loaded} maxLength={40}
            onChange={(e) => { setName(e.target.value); setError(''); }} placeholder="e.g. Gate 1"
            error={!!error} className="h-12 text-base sm:text-sm"
          />
          {error
            ? <p role="alert" className="mt-1.5 text-xs text-danger-600">{error}</p>
            : <p className="mt-1.5 text-xs text-ink-500">Shown next to every check-in from this device.</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s} type="button" onClick={() => { setName(s); setError(''); }}
              className={cx(
                'h-8 px-3 rounded-full text-xs font-semibold transition ring-1',
                name === s ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-white text-ink-600 ring-slate-200 hover:bg-slate-50',
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <Button type="submit" size="lg" variant={isAdmin ? 'secondary' : 'primary'} className="w-full h-12" icon={ScanLine}>
          Start verifying
        </Button>
      </form>

      <button
        type="button" onClick={onSwitch}
        className="mt-6 mx-auto flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-900"
      >
        <LogOut className="size-4" /> Use a different account
      </button>
    </>
  );
}
