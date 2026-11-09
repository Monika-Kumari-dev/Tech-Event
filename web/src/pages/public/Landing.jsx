import { useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowRight, ClipboardList, QrCode, ScanLine, ShieldCheck, WifiOff, Search, ChevronRight } from 'lucide-react';
import { Button, Avatar, Badge } from '../../components/ui.jsx';
import { passStore } from '../../lib/passStore.js';
import { PublicLayout } from './shared.jsx';

const steps = [
  { icon: ClipboardList, title: 'Register', text: 'Fill a short form with your name, mobile and email. Takes under a minute.' },
  { icon: QrCode, title: 'Get your QR', text: 'Your personal pass appears instantly and is saved on this device.' },
  { icon: ScanLine, title: 'Show it at entry', text: 'Staff scan your QR at the gate — it works even without internet.' },
];

function SavedPassCard({ pass }) {
  const { user } = pass;
  return (
    <Link
      to={`/pass/${user.id}`}
      className="group mb-8 flex items-center gap-4 rounded-[var(--radius-card)] bg-gradient-to-br from-brand-600 to-brand-900 p-4 sm:p-5 text-white shadow-lg shadow-brand-900/20 ring-1 ring-white/10 animate-fade-up transition hover:shadow-xl hover:shadow-brand-900/30"
    >
      <Avatar src={user.photo} name={user.fullName} size="size-12" />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium uppercase tracking-wider text-brand-200">Your pass is ready</p>
        <p className="truncate text-lg font-bold leading-tight">{user.fullName}</p>
        <p className="font-mono text-sm text-brand-100/90">{user.code}</p>
      </div>
      <span className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-white px-3.5 text-sm font-semibold text-brand-700 transition group-hover:bg-brand-50">
        <QrCode className="size-4" />
        <span className="hidden min-[400px]:inline">Open my pass</span>
        <span className="min-[400px]:hidden">Open</span>
      </span>
    </Link>
  );
}

/** Decorative ticket preview for the hero. */
function TicketPreview() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[19rem] select-none">
      <div className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-brand-200/70 via-brand-100/40 to-transparent blur-2xl" />
      <div className="rotate-[-3deg] overflow-hidden rounded-[1.75rem] bg-white shadow-[var(--shadow-card)] ring-1 ring-slate-900/5 transition duration-500 hover:rotate-0">
        <div className="bg-gradient-to-br from-brand-600 to-brand-900 px-5 py-4 text-white">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-200">Entry pass</p>
          <p className="mt-0.5 font-bold">Teck Fluence X</p>
        </div>
        <div className="relative">
          <div className="absolute -left-3 top-1/2 size-6 -translate-y-1/2 rounded-full bg-slate-50" />
          <div className="absolute -right-3 top-1/2 size-6 -translate-y-1/2 rounded-full bg-slate-50" />
          <div className="mx-5 border-t-2 border-dashed border-slate-200" />
        </div>
        <div className="grid place-items-center px-6 pt-5 pb-4">
          <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-100">
            <QRCodeSVG value="Teck Fluence X — register once, walk in." size={168} level="M" fgColor="#0f172a" />
          </div>
        </div>
        <div className="flex items-center gap-3 border-t border-slate-100 px-5 py-4">
          <div className="grid size-10 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">AK</div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink-900">Your name here</p>
            <p className="font-mono text-xs text-ink-500">TFX-XXXXXX</p>
          </div>
          <Badge tone="success">Valid</Badge>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const saved = useMemo(() => passStore.get(), []);
  const { hash } = useLocation();

  // Header "How it works" link → /#how: scroll there after the page renders.
  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [hash]);

  return (
    <PublicLayout wide>
      {saved && (
        <div className="mx-auto max-w-2xl">
          <SavedPassCard pass={saved} />
        </div>
      )}

      {/* Hero */}
      <section className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:py-10">
        <div className="text-center lg:text-left animate-fade-up">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 shadow-sm">
            <ShieldCheck className="size-3.5" /> Secure, signed entry passes
          </span>
          <h1 className="mt-5 text-[2.5rem] leading-[1.05] font-extrabold tracking-tight text-ink-900 sm:text-5xl lg:text-6xl">
            Register once.{' '}
            <span className="bg-gradient-to-r from-brand-600 to-brand-500 bg-clip-text text-transparent">
              Walk in with your QR&nbsp;pass.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-lg text-lg leading-relaxed text-ink-600 lg:mx-0">
            Sign up in under a minute and get a personal pass on your phone. No printing, no queues at a help desk.
          </p>

          <div className="mx-auto mt-8 flex max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center lg:justify-start">
            {saved ? (
              <Button to={`/pass/${saved.user.id}`} size="lg" icon={QrCode} className="sm:min-w-48">
                Open my pass
              </Button>
            ) : (
              <Button to="/register" size="lg" className="sm:min-w-48">
                Register now <ArrowRight className="size-4" />
              </Button>
            )}
            <Button to={saved ? '/register' : '/find-pass'} variant="secondary" size="lg" icon={saved ? ClipboardList : Search}>
              {saved ? 'Register someone else' : 'Already registered? Find my pass'}
            </Button>
          </div>

          <ul className="mt-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm text-ink-500 lg:justify-start">
            <li className="inline-flex items-center gap-1.5"><WifiOff className="size-4 text-brand-500" /> Works offline at entry</li>
            <li className="inline-flex items-center gap-1.5"><ShieldCheck className="size-4 text-brand-500" /> Tamper-proof QR</li>
          </ul>
        </div>

        <div className="animate-fade-up [animation-delay:120ms]">
          <TicketPreview />
        </div>
      </section>

      {/* How it works */}
      <section aria-labelledby="how" className="mt-16 sm:mt-24">
        <h2 id="how" className="scroll-mt-28 text-center text-sm font-semibold uppercase tracking-wider text-brand-600">How it works</h2>
        <p className="mt-2 text-center text-2xl font-bold tracking-tight text-ink-900 sm:text-3xl">Three steps to the door</p>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {steps.map((s, i) => (
            <li
              key={s.title}
              style={{ animationDelay: `${150 + i * 80}ms` }}
              className="relative rounded-[var(--radius-card)] bg-white p-5 shadow-[var(--shadow-card)] ring-1 ring-slate-900/5 animate-fade-up"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                  <s.icon className="size-5" />
                </span>
                <span className="text-xs font-bold text-ink-400">STEP {i + 1}</span>
              </div>
              <h3 className="mt-4 font-bold text-ink-900">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-600">{s.text}</p>
              {i < steps.length - 1 && (
                <ChevronRight aria-hidden className="absolute -right-3.5 top-1/2 hidden size-5 -translate-y-1/2 text-brand-200 sm:block" />
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* Closing CTA */}
      {!saved && (
        <section className="mt-12 rounded-[var(--radius-card)] bg-gradient-to-br from-brand-600 to-brand-900 px-6 py-8 text-center text-white shadow-lg shadow-brand-900/20 sm:mt-16 sm:py-10">
          <p className="text-xl font-bold sm:text-2xl">Ready when you are</p>
          <p className="mt-1.5 text-brand-100">Get your pass now and skip the line on event day.</p>
          <Link
            to="/register"
            className="mt-6 inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 font-semibold text-brand-700 shadow-sm transition hover:bg-brand-50 active:scale-[0.98]"
          >
            Register now <ArrowRight className="size-4" />
          </Link>
        </section>
      )}

    </PublicLayout>
  );
}
