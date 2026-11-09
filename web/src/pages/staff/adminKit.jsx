// Shared layout primitives for every Admin tab (Overview, Attendees, Check-ins, Staff, Bulk).
// Layout rules (keep all tabs consistent):
// - Content is fluid: it fills the space next to the sidebar (no centered max-w-6xl column).
//   The shell wraps tabs in <AdminContent>, which uses px-4 sm:px-6 xl:px-8 and caps at 1680px.
// - Tabs lay out with CSS grid: `grid gap-4 xl:gap-5` and 12 columns on xl (`xl:grid-cols-12`), using col-span to fill rows
//   completely — no half-empty rows, no ragged edges. Cards in a row share equal height (grid stretches; Panel is h-full).
// - Every section is a <Panel> with a consistent header (title, optional description, optional actions on the right).
// - Numbers use tabular-nums. Icons are lucide, size-4 in buttons, size-5 in tiles.
import { cx } from '../../components/ui.jsx';

export function AdminContent({ className, children }) {
  return <div className={cx('w-full max-w-[1680px] mx-auto px-4 sm:px-6 xl:px-8 py-5 sm:py-6', className)}>{children}</div>;
}

/** Section card with a standard header. `bodyClassName` controls padding (default p-5); pass "p-0" for edge-to-edge tables. */
export function Panel({ title, description, actions, icon: Icon, className, bodyClassName, children, ...props }) {
  return (
    <section
      className={cx('h-full min-w-0 flex flex-col bg-white rounded-2xl ring-1 ring-slate-900/[0.06] shadow-[0_1px_2px_rgb(15_23_42/0.04)]', className)}
      {...props}
    >
      {(title || actions) && (
        <header className="flex items-start gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
          {Icon && (
            <span className="mt-0.5 grid place-items-center size-8 rounded-lg bg-brand-50 text-brand-600 shrink-0">
              <Icon className="size-4" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            {title && <h2 className="text-[15px] font-bold text-ink-900 leading-6 truncate">{title}</h2>}
            {description && <p className="text-xs text-ink-500 mt-0.5">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </header>
      )}
      <div className={cx('flex-1 min-h-0', bodyClassName ?? 'p-5')}>{children}</div>
    </section>
  );
}

const tileTones = {
  brand: 'bg-brand-50 text-brand-600',
  success: 'bg-success-50 text-success-600',
  warn: 'bg-warn-50 text-warn-600',
  danger: 'bg-danger-50 text-danger-600',
  neutral: 'bg-slate-100 text-ink-600',
};

/** KPI tile: label, big value, optional sub-line / footer (e.g. progress bar). */
export function StatTile({ label, value, sub, icon: Icon, tone = 'brand', footer, onClick, className }) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cx(
        'h-full w-full text-left flex flex-col bg-white rounded-2xl ring-1 ring-slate-900/[0.06] shadow-[0_1px_2px_rgb(15_23_42/0.04)] p-5',
        onClick && 'transition hover:ring-brand-200 hover:shadow-md',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink-500">{label}</span>
        {Icon && (
          <span className={cx('grid place-items-center size-9 rounded-xl shrink-0', tileTones[tone])}>
            <Icon className="size-5" />
          </span>
        )}
      </div>
      <div className="mt-3 text-3xl font-extrabold tracking-tight tabular-nums text-ink-900">{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-500">{sub}</div>}
      {footer && <div className="mt-auto pt-4">{footer}</div>}
    </Comp>
  );
}

/** Empty state block for inside panels. */
export function EmptyState({ icon: Icon, title, children, action }) {
  return (
    <div className="h-full min-h-40 grid place-items-center text-center py-8">
      <div className="max-w-xs">
        {Icon && (
          <span className="mx-auto grid place-items-center size-11 rounded-2xl bg-slate-100 text-ink-400 mb-3">
            <Icon className="size-5" />
          </span>
        )}
        <p className="font-semibold text-ink-900">{title}</p>
        {children && <p className="text-sm text-ink-500 mt-1">{children}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}
