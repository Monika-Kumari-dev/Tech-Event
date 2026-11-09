// Admin "Check-ins" tab: KPI strip, devices table, recent check-ins and duplicate scans side by side.
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy as CopyIcon, ListChecks, MonitorSmartphone, UserCheck } from 'lucide-react';
import { Avatar, Badge, cx } from '../../../components/ui.jsx';
import { EmptyState, Panel, StatTile } from '../adminKit.jsx';
import { Skeleton, formatTime, timeAgo, toMs, useNow } from '../shared.jsx';
import { Bar, EntriesTable, ErrorBlock, fmt, tableTd, tableTh } from './common.jsx';

const STALE_MS = 5 * 60 * 1000;

export default function Checkins({ stats, call }) {
  const now = useNow();
  const [dups, setDups] = useState(null);
  const [dupError, setDupError] = useState('');

  const loadDups = useCallback(() => {
    call('/admin/duplicates')
      .then((d) => { setDups(d.items || []); setDupError(''); })
      .catch((e) => setDupError(e.message || 'Could not load duplicates.'));
  }, [call]);

  useEffect(() => {
    loadDups();
    const t = setInterval(() => { if (document.visibilityState === 'visible') loadDups(); }, 15_000);
    return () => clearInterval(t);
  }, [loadDups]);

  const devices = [...(stats?.devices || [])].sort((a, b) => (b.count || 0) - (a.count || 0));
  const maxCount = Math.max(1, ...devices.map((d) => d.count || 0));
  const totalScans = devices.reduce((a, d) => a + (d.count || 0), 0);
  const activeGates = devices.filter((d) => { const l = toMs(d.lastSyncAt); return l && now - l <= STALE_MS; }).length;

  return (
    <div className="grid gap-4 xl:gap-5 grid-cols-1 sm:grid-cols-3 xl:grid-cols-12 animate-fade-up">
      {!stats ? (
        [0, 1, 2].map((i) => <Skeleton key={i} className="xl:col-span-4 h-[132px] rounded-2xl" />)
      ) : (
        <>
          <div className="xl:col-span-4">
            <StatTile label="Total check-ins" icon={UserCheck} tone="success" value={fmt(stats.checkedIn)}
              sub={<span className="tabular-nums">{fmt(totalScans)} scans synced from gates</span>} />
          </div>
          <div className="xl:col-span-4">
            <StatTile label="Duplicate scans" icon={AlertTriangle} tone={stats.duplicates ? 'warn' : 'neutral'} value={fmt(stats.duplicates)}
              sub={stats.duplicates ? 'Repeat scans of an already-used pass' : 'No pass has been used twice'} />
          </div>
          <div className="xl:col-span-4">
            <StatTile label="Active gates" icon={MonitorSmartphone} value={<>{fmt(activeGates)} <span className="text-lg font-semibold text-ink-400">/ {fmt(devices.length)}</span></>}
              sub="Synced in the last 5 minutes" />
          </div>
        </>
      )}

      <div className="sm:col-span-3 xl:col-span-12">
        <Panel title="Devices" description="Every gate phone that has synced scans" icon={MonitorSmartphone} bodyClassName="p-0"
          actions={stats && <Badge className="tabular-nums">{fmt(devices.length)} device{devices.length === 1 ? '' : 's'}</Badge>}>
          {!stats ? (
            <div className="p-5 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11" />)}</div>
          ) : devices.length === 0 ? (
            <EmptyState icon={MonitorSmartphone} title="No devices have synced yet">Gate phones appear here after their first sync.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] table-fixed text-sm">
                <thead className="bg-slate-50/80 border-b border-slate-100">
                  <tr>
                    <th className={cx(tableTh, 'w-[24%]')}>Gate</th>
                    <th className={cx(tableTh, 'w-[24%]')}>Device ID</th>
                    <th className={tableTh}>Check-ins</th>
                    <th className={cx(tableTh, 'w-[11rem] text-right')}>Last sync</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {devices.map((d) => {
                    const last = toMs(d.lastSyncAt);
                    const stale = !last || now - last > STALE_MS;
                    return (
                      <tr key={d.deviceId} className="hover:bg-slate-50/70">
                        <td className={tableTd}>
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="grid place-items-center size-8 rounded-lg bg-slate-100 text-ink-600 shrink-0"><MonitorSmartphone className="size-4" /></span>
                            <span className="font-semibold text-ink-900 truncate" title={d.deviceName}>{d.deviceName || 'Unnamed device'}</span>
                          </div>
                        </td>
                        <td className={tableTd}><span className="block font-mono text-xs text-ink-500 truncate" title={d.deviceId}>{d.deviceId}</span></td>
                        <td className={tableTd}>
                          <div className="flex items-center gap-3">
                            <div className="flex-1"><Bar value={((d.count || 0) / maxCount) * 100} tone="brand" label={`${d.deviceName} check-ins`} /></div>
                            <span className="w-14 text-right font-semibold tabular-nums text-ink-900">{fmt(d.count)}</span>
                          </div>
                        </td>
                        <td className={cx(tableTd, 'text-right whitespace-nowrap')}>
                          <span className={cx('inline-flex items-center gap-1.5', stale ? 'text-warn-600 font-semibold' : 'text-ink-600')} title={formatTime(d.lastSyncAt)}>
                            {stale ? <AlertTriangle className="size-3.5" /> : <span className="size-2 rounded-full bg-success-500" />}
                            {timeAgo(d.lastSyncAt, now)}{stale && ' · stale'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>

      <div className="sm:col-span-3 xl:col-span-6">
        <Panel title="Recent check-ins" description="Latest admissions across all gates" icon={ListChecks} bodyClassName="p-0">
          <EntriesTable items={stats?.recent || []} loading={!stats} rows={20} compact />
        </Panel>
      </div>

      <div className="sm:col-span-3 xl:col-span-6">
        <Panel title="Duplicate scans" description="First entry vs repeat scan" icon={CopyIcon} bodyClassName="p-0"
          actions={dups && <Badge tone={dups.length ? 'warn' : 'neutral'} className="tabular-nums">{fmt(dups.length)}</Badge>}>
          {dupError ? (
            <ErrorBlock message={dupError} onRetry={loadDups} />
          ) : !dups ? (
            <div className="p-5 space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-20" />)}</div>
          ) : dups.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No duplicates">Nobody has been admitted twice.</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {dups.map(({ checkin, user, firstCheckin }) => (
                <li key={checkin.id} className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <Avatar src={user?.photo} name={user?.fullName} size="size-8 shrink-0 text-[11px]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink-900 truncate" title={user?.fullName}>{user?.fullName || 'Unknown attendee'}</p>
                      <p className="text-xs font-mono text-ink-500">{user?.code}</p>
                    </div>
                  </div>
                  <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-lg bg-slate-50 ring-1 ring-slate-100 px-3 py-2 min-w-0">
                      <p className="font-semibold text-ink-500">First entry</p>
                      <p className="text-ink-900 tabular-nums truncate">{formatTime(firstCheckin?.scannedAt)} · {firstCheckin?.deviceName || '—'}</p>
                    </div>
                    <div className="rounded-lg bg-warn-50 ring-1 ring-warn-500/20 px-3 py-2 min-w-0">
                      <p className="font-semibold text-warn-600">Repeat scan</p>
                      <p className="text-ink-900 tabular-nums truncate">{formatTime(checkin.scannedAt)} · {checkin.deviceName || '—'}</p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
