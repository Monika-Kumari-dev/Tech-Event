// Admin "Overview" tab: KPI row, hourly chart + gates, latest entries + arrival progress. Fills a 12-column grid at xl.
import { AlertTriangle, ArrowRight, BarChart3, Clock3, ListChecks, MonitorSmartphone, PieChart, UserCheck, Users } from 'lucide-react';
import { Badge, cx } from '../../../components/ui.jsx';
import { EmptyState, Panel, StatTile } from '../adminKit.jsx';
import { Skeleton, timeAgo, toMs, useNow } from '../shared.jsx';
import ArrivalDonut from './ArrivalDonut.jsx';
import HourlyChart, { useHourlyBuckets } from './HourlyChart.jsx';
import { Bar, EntriesTable, fmt, pct } from './common.jsx';

const GRID = 'grid gap-4 xl:gap-5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-12';
const TILE = 'xl:col-span-3';
const WIDE = 'sm:col-span-2 xl:col-span-8';
const SIDE = 'sm:col-span-2 xl:col-span-4';

export default function Overview({ stats, onGoto }) {
  const buckets = useHourlyBuckets(stats?.hourly);
  if (!stats) return <OverviewSkeleton />;

  const total = stats.totalUsers || 0;
  const checkedPct = pct(stats.checkedIn, total);
  const pendingPct = pct(stats.pending, total);
  const todayPct = pct(stats.registrationsToday, total);
  const windowTotal = buckets.reduce((a, b) => a + b.count, 0);
  const recent = (stats.recent || []).slice(0, 10);

  return (
    <div className={cx(GRID, 'animate-fade-up')}>
      <div className={TILE}>
        <StatTile label="Checked in" icon={UserCheck} tone="success"
          value={<>{fmt(stats.checkedIn)} <span className="text-lg font-semibold text-ink-400">/ {fmt(total)}</span></>}
          sub={<span className="inline-flex items-center gap-2"><Badge tone="success" className="tabular-nums">{checkedPct}%</Badge> of registered attendees</span>}
          footer={<Bar value={checkedPct} label="Check-in progress" />} />
      </div>
      <div className={TILE}>
        <StatTile label="Registered" icon={Users} value={fmt(total)}
          sub={<span className="tabular-nums"><span className="font-semibold text-brand-700">+{fmt(stats.registrationsToday)}</span> today</span>}
          footer={<Bar value={todayPct} tone="brand" label="Share registered today" />} />
      </div>
      <div className={TILE}>
        <StatTile label="Not arrived yet" icon={Clock3} tone="neutral" value={fmt(stats.pending)}
          sub={<span className="tabular-nums">{pendingPct}% still expected</span>}
          footer={<Bar value={pendingPct} tone="neutral" label="Share not arrived" />} />
      </div>
      <div className={TILE}>
        <StatTile label="Duplicate scans" icon={AlertTriangle} tone={stats.duplicates ? 'warn' : 'neutral'} value={fmt(stats.duplicates)}
          onClick={() => onGoto('checkins')}
          className={stats.duplicates ? 'ring-warn-500/30' : undefined}
          sub={stats.duplicates ? 'Passes scanned more than once' : 'No pass used twice'}
          footer={<span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-700">Review check-ins <ArrowRight className="size-3.5" /></span>} />
      </div>

      <div className={WIDE}>
        <Panel title="Check-ins per hour" description="Last 12 hours · local time" icon={BarChart3}
          actions={<Badge tone={windowTotal ? 'brand' : 'neutral'} className="tabular-nums">{fmt(windowTotal)} in last 12h</Badge>}>
          <HourlyChart buckets={buckets} />
        </Panel>
      </div>
      <div className={SIDE}>
        <Panel title="Gates / devices" description="Scans per gate phone" icon={MonitorSmartphone} bodyClassName="p-0 relative min-h-64"
          actions={<Badge className="tabular-nums">{fmt(stats.devices?.length || 0)} active</Badge>}>
          <div className="xl:absolute xl:inset-0 xl:overflow-y-auto">
            <DeviceList devices={stats.devices || []} />
          </div>
        </Panel>
      </div>

      <div className={WIDE}>
        <Panel title="Latest entries" description={recent.length ? `Most recent ${fmt(recent.length)} admissions` : 'Newest admissions first'} icon={ListChecks}
          bodyClassName="p-0"
          actions={<button type="button" onClick={() => onGoto('checkins')} className="text-sm font-semibold text-brand-700 hover:text-brand-600 inline-flex items-center gap-1 rounded-md px-1">
            View all <ArrowRight className="size-4" /></button>}>
          <EntriesTable items={recent} rows={10} />
        </Panel>
      </div>
      <div className={SIDE}>
        <Panel title="Arrival progress" description="Checked in vs registered" icon={PieChart} bodyClassName="p-5 flex flex-col justify-center gap-6">
          <div className="grid place-items-center">
            <ArrivalDonut checkedIn={stats.checkedIn || 0} total={total} />
          </div>
          <dl className="divide-y divide-slate-100 rounded-xl ring-1 ring-slate-100">
            <Legend dot="bg-success-500" label="Checked in" value={stats.checkedIn} />
            <Legend dot="bg-slate-300" label="Not arrived" value={stats.pending} />
            <Legend dot="bg-warn-500" label="Duplicates" value={stats.duplicates} />
            <Legend dot="bg-brand-500" label="Registered today" value={stats.registrationsToday} />
          </dl>
        </Panel>
      </div>
    </div>
  );
}

function Legend({ dot, label, value }) {
  return (
    <div className="flex items-center gap-3 px-3.5 h-10 text-sm">
      <span className={cx('size-2.5 rounded-full shrink-0', dot)} aria-hidden="true" />
      <dt className="text-ink-600 flex-1 truncate">{label}</dt>
      <dd className="font-semibold tabular-nums text-ink-900">{fmt(value)}</dd>
    </div>
  );
}

function DeviceList({ devices }) {
  const now = useNow();
  if (!devices.length) {
    return (
      <EmptyState icon={MonitorSmartphone} title="No gates synced yet">
        Gate phones show up here after their first sync.
      </EmptyState>
    );
  }
  const sorted = [...devices].sort((a, b) => (b.count || 0) - (a.count || 0));
  const max = Math.max(1, ...sorted.map((d) => d.count || 0));
  return (
    <ul className="divide-y divide-slate-100">
      {sorted.map((d) => {
        const last = toMs(d.lastSyncAt);
        const stale = !last || now - last > 5 * 60 * 1000;
        return (
          <li key={d.deviceId} className="px-5 py-3">
            <div className="flex items-center gap-3">
              <span className="grid place-items-center size-9 rounded-xl bg-slate-100 text-ink-600 shrink-0"><MonitorSmartphone className="size-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink-900 truncate" title={d.deviceName}>{d.deviceName || 'Unnamed device'}</p>
                <p className={cx('text-xs inline-flex items-center gap-1.5', stale ? 'text-warn-600' : 'text-ink-500')}>
                  <span className={cx('size-1.5 rounded-full', stale ? 'bg-warn-500' : 'bg-success-500')} />
                  Synced {timeAgo(d.lastSyncAt, now)}
                </p>
              </div>
              <span className="text-lg font-bold tabular-nums text-ink-900">{fmt(d.count)}</span>
            </div>
            <div className="mt-2 pl-12"><Bar value={((d.count || 0) / max) * 100} tone="brand" label={`${d.deviceName} share`} /></div>
          </li>
        );
      })}
    </ul>
  );
}

function OverviewSkeleton() {
  return (
    <div className={GRID} aria-busy="true" aria-label="Loading overview">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className={cx(TILE, 'rounded-2xl bg-white ring-1 ring-slate-900/[0.06] p-5 h-[156px]')}>
          <div className="flex justify-between"><Skeleton className="h-4 w-24" /><Skeleton className="size-9 rounded-xl" /></div>
          <Skeleton className="mt-3 h-8 w-28" />
          <Skeleton className="mt-2 h-3 w-36" />
          <Skeleton className="mt-5 h-2 w-full rounded-full" />
        </div>
      ))}
      <PanelSkel className={WIDE} h="h-[260px]" />
      <PanelSkel className={SIDE} h="h-[260px]" />
      <PanelSkel className={WIDE} h="h-[380px]" />
      <PanelSkel className={SIDE} h="h-[380px]" />
    </div>
  );
}

function PanelSkel({ className, h }) {
  return (
    <div className={cx(className, 'rounded-2xl bg-white ring-1 ring-slate-900/[0.06]')}>
      <div className="flex items-center gap-3 px-5 pt-4 pb-3 border-b border-slate-100">
        <Skeleton className="size-8 rounded-lg" /><div className="space-y-1.5"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-24" /></div>
      </div>
      <div className="p-5"><Skeleton className={cx('w-full rounded-xl', h)} /></div>
    </div>
  );
}
