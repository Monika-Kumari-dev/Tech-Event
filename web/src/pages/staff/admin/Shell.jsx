// Admin shell chrome: fixed sidebar (desktop), sticky top bar (desktop), compact header + pill tabs (mobile).
import { LogOut, RefreshCw, ScanLine } from 'lucide-react';
import { Avatar, Button, Logo, cx } from '../../../components/ui.jsx';
import { OnlinePill, useNow } from '../shared.jsx';
import { agoShort, fmt } from './common.jsx';

const focusRing = 'outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2';

function NavBadge({ badge, active }) {
  if (!badge || badge.value == null) return null;
  return (
    <span className={cx('ml-auto min-w-6 h-5 px-1.5 rounded-md text-[11px] font-bold tabular-nums grid place-items-center',
      badge.tone === 'warn' ? 'bg-warn-50 text-warn-600 ring-1 ring-warn-500/30'
        : active ? 'bg-white text-brand-700 ring-1 ring-brand-200' : 'bg-slate-100 text-ink-500')}>
      {fmt(badge.value)}
    </span>
  );
}

export function Sidebar({ groups, tab, onTab, badges, staff, onSignOut }) {
  return (
    <aside className="hidden lg:flex fixed inset-y-0 left-0 z-30 w-64 2xl:w-72 flex-col bg-white border-r border-slate-200">
      <div className="h-16 flex items-center px-5 border-b border-slate-100 shrink-0">
        <Logo />
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-5 space-y-6" aria-label="Dashboard sections">
        {groups.map((g) => (
          <div key={g.label}>
            <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-400">{g.label}</p>
            <ul className="space-y-0.5">
              {g.items.map((t) => {
                const active = tab === t.id;
                return (
                  <li key={t.id}>
                    <button type="button" onClick={() => onTab(t.id)} aria-current={active ? 'page' : undefined}
                      className={cx('relative w-full flex items-center gap-3 h-10 px-3 rounded-lg text-sm font-semibold transition', focusRing,
                        active ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-slate-100 hover:text-ink-900')}>
                      {active && <span className="absolute -left-3 top-2 bottom-2 w-1 rounded-r-full bg-brand-600" aria-hidden="true" />}
                      <t.icon className={cx('size-4.5 shrink-0', active ? 'text-brand-600' : 'text-ink-400')} />
                      <span className="truncate">{t.label}</span>
                      <NavBadge badge={badges[t.id]} active={active} />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="p-3 border-t border-slate-100 space-y-3 shrink-0">
        <Button to="/verify" variant="secondary" size="sm" className="w-full h-10" icon={ScanLine}>Open verifier</Button>
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 ring-1 ring-slate-100 p-2.5">
          <Avatar name={staff?.name || staff?.username} size="size-9 shrink-0 text-xs" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-900 truncate" title={staff?.name}>{staff?.name || staff?.username}</p>
            <p className="text-xs text-ink-500 truncate capitalize">{staff?.role || 'admin'} · {staff?.username}</p>
          </div>
          <button type="button" onClick={onSignOut} aria-label="Sign out" title="Sign out"
            className={cx('grid place-items-center size-8 rounded-lg text-ink-500 hover:bg-white hover:text-danger-600 hover:ring-1 hover:ring-slate-200 transition', focusRing)}>
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

export function LiveIndicator({ updatedAt, error, refreshing }) {
  const now = useNow(1000);
  const stale = updatedAt && now - updatedAt > 45_000;
  const tone = error ? 'bg-danger-500' : !updatedAt || stale ? 'bg-warn-500' : 'bg-success-500';
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium text-ink-500 whitespace-nowrap tabular-nums" aria-live="polite">
      <span className="relative flex size-2">
        {!error && updatedAt && !stale && <span className={cx('absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping', tone)} />}
        <span className={cx('relative inline-flex size-2 rounded-full', tone)} />
      </span>
      {refreshing && !updatedAt ? 'Loading live data…' : error ? 'Update failed' : updatedAt ? `Updated ${agoShort(updatedAt, now)}` : 'Connecting…'}
    </span>
  );
}

function RefreshButton({ onRefresh, refreshing, className }) {
  return (
    <button type="button" onClick={onRefresh} disabled={refreshing} aria-label="Refresh data" title="Refresh"
      className={cx('grid place-items-center size-9 rounded-lg bg-white ring-1 ring-slate-200 text-ink-600 hover:bg-slate-50 hover:text-ink-900 transition disabled:opacity-60', focusRing, className)}>
      <RefreshCw className={cx('size-4', refreshing && 'animate-spin')} />
    </button>
  );
}

export function TopBar({ title, subtitle, online, updatedAt, statsError, refreshing, onRefresh, action }) {
  return (
    <header className="hidden lg:flex sticky top-0 z-20 h-16 items-center gap-4 border-b border-slate-200 bg-white/85 backdrop-blur-md supports-[backdrop-filter]:bg-white/70">
      <div className="w-full max-w-[1680px] mx-auto px-6 xl:px-8 flex items-center gap-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-400 truncate">{subtitle}</p>
          <h1 className="text-lg font-bold text-ink-900 leading-6 truncate">{title}</h1>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <LiveIndicator updatedAt={updatedAt} error={statsError} refreshing={refreshing} />
          <span className="h-5 w-px bg-slate-200" aria-hidden="true" />
          <OnlinePill online={online} />
          <RefreshButton onRefresh={onRefresh} refreshing={refreshing} />
          {action && <span className="pl-1">{action}</span>}
        </div>
      </div>
    </header>
  );
}

export function MobileHeader({ tabs, tab, onTab, badges, onSignOut }) {
  return (
    <header className="lg:hidden sticky top-0 z-20 bg-white/95 backdrop-blur border-b border-slate-200">
      <div className="flex items-center gap-2 px-4 h-14">
        <Logo />
        <div className="ml-auto flex items-center gap-1">
          <Button to="/verify" variant="ghost" size="sm" icon={ScanLine} aria-label="Open verifier">Scan</Button>
          <Button variant="ghost" size="sm" onClick={onSignOut} aria-label="Sign out"><LogOut className="size-4" /></Button>
        </div>
      </div>
      <nav className="flex gap-1.5 overflow-x-auto px-3 pb-2 [scrollbar-width:none]" aria-label="Dashboard sections">
        {tabs.map((t) => {
          const active = tab === t.id;
          const b = badges[t.id];
          return (
            <button key={t.id} type="button" onClick={() => onTab(t.id)} aria-current={active ? 'page' : undefined}
              className={cx('shrink-0 flex items-center gap-1.5 h-9 px-3 rounded-full text-sm font-semibold transition', focusRing,
                active ? 'bg-ink-900 text-white' : 'text-ink-600 bg-slate-100')}>
              <t.icon className="size-4" /> {t.label}
              {b?.value != null && b.tone === 'warn' && (
                <span className="ml-0.5 rounded-full bg-warn-500 text-white text-[10px] font-bold px-1.5 tabular-nums">{fmt(b.value)}</span>
              )}
            </button>
          );
        })}
      </nav>
    </header>
  );
}

/** Mobile/tablet page header (the desktop top bar is hidden below lg). */
export function MobilePageHeader({ title, online, updatedAt, statsError, refreshing, onRefresh, action }) {
  return (
    <div className="lg:hidden flex items-center gap-3 mb-4">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-ink-900 truncate">{title}</h1>
        <LiveIndicator updatedAt={updatedAt} error={statsError} refreshing={refreshing} />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <span className="hidden sm:block"><OnlinePill online={online} /></span>
        <RefreshButton onRefresh={onRefresh} refreshing={refreshing} />
        {action && <span className="shrink-0 whitespace-nowrap [&>*]:whitespace-nowrap">{action}</span>}
      </div>
    </div>
  );
}
