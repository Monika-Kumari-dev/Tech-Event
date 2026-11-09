// Horizontal 3-step guide for the Bulk tab. `current` is 1, 2 or 3.
import { Check, ChevronRight, Download, QrCode, Upload } from 'lucide-react';
import { cx } from '../../../components/ui.jsx';

const STEPS = [
  { n: 1, icon: Download, short: 'Template', title: 'Download template', text: 'Excel sheet with the right columns' },
  { n: 2, icon: Upload, short: 'Upload', title: 'Upload & review', text: 'Check rows, fix errors, register' },
  { n: 3, icon: QrCode, short: 'Passes', title: 'Download QR passes', text: 'ZIP, printable PDF or Excel' },
];

export default function StepGuide({ current, onTemplate, onJump }) {
  const actions = {
    1: { label: 'Get template', onClick: onTemplate },
    3: { label: 'Go to downloads', onClick: onJump },
  };
  return (
    <nav aria-label="Bulk registration steps"
      className="bg-white rounded-2xl ring-1 ring-slate-900/[0.06] shadow-[0_1px_2px_rgb(15_23_42/0.04)] p-2">
      <ol className="grid grid-cols-3 gap-1 sm:gap-2">
        {STEPS.map((s, i) => {
          const done = s.n < current;
          const active = s.n === current;
          const a = actions[s.n];
          return (
            <li key={s.n} className="relative min-w-0 flex">
              <div aria-current={active ? 'step' : undefined}
                className={cx('flex-1 min-w-0 flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-3 rounded-xl px-2 py-2.5 sm:px-4 sm:py-3 text-center sm:text-left transition-colors',
                  active ? 'bg-brand-50 ring-1 ring-brand-200' : 'hover:bg-slate-50')}>
                <span className={cx('grid place-items-center size-9 rounded-full shrink-0 text-sm font-bold tabular-nums transition',
                  done ? 'bg-success-500 text-white' : active ? 'bg-brand-600 text-white shadow-sm shadow-brand-600/30' : 'bg-slate-100 text-ink-500')}>
                  {done ? <Check className="size-4" strokeWidth={3} /> : s.n.toLocaleString()}
                </span>
                <div className="min-w-0 w-full sm:w-auto sm:flex-1">
                  <p className={cx('text-[13px] sm:text-sm font-semibold leading-5 truncate', active ? 'text-brand-700' : done ? 'text-ink-900' : 'text-ink-600')}>
                    <span className="sm:hidden">{s.short}</span><span className="hidden sm:inline">{s.title}</span>
                  </p>
                  <p className="hidden md:block text-xs text-ink-500 truncate">{done ? 'Done' : s.text}</p>
                </div>
                {a && (
                  <button type="button" onClick={a.onClick}
                    className={cx('hidden lg:inline-flex shrink-0 items-center h-8 px-3 rounded-lg text-xs font-semibold transition',
                      active ? 'bg-white text-brand-700 ring-1 ring-brand-200 hover:bg-brand-50' : 'text-ink-600 hover:bg-slate-100')}>
                    {a.label}
                  </button>
                )}
              </div>
              {i < STEPS.length - 1 && (
                <ChevronRight aria-hidden className="hidden sm:block absolute -right-[13px] top-1/2 -translate-y-1/2 size-4 text-slate-300 z-10" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
