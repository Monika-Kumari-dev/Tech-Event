// Admin dashboard shell: auth guard, live stats polling, navigation, top bar, and tab mounting.
// Tab bodies live in ./admin/* (Bulk lives in ./bulk/* and is lazy-loaded, kept mounted once opened).
import { Suspense, lazy, useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { BarChart3, Download, FileSpreadsheet, ScanLine, ShieldPlus, UserCheck, UserPlus, Users, XCircle } from 'lucide-react';
import { api, ApiError, staffSession } from '../../lib/api.js';
import { Button, Spinner } from '../../components/ui.jsx';
import { useOnline } from './shared.jsx';
import { AdminContent } from './adminKit.jsx';
import { MobileHeader, MobilePageHeader, Sidebar, TopBar } from './admin/Shell.jsx';
import Overview from './admin/Overview.jsx';
import Attendees from './admin/Attendees.jsx';
import Checkins from './admin/Checkins.jsx';
import StaffTab from './admin/StaffTab.jsx';

const GROUPS = [
  { label: 'Event', items: [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'attendees', label: 'Attendees', icon: Users },
    { id: 'checkins', label: 'Check-ins', icon: UserCheck },
  ] },
  { label: 'Manage', items: [
    { id: 'bulk', label: 'Bulk upload', icon: FileSpreadsheet },
    { id: 'staff', label: 'Staff', icon: ShieldPlus },
  ] },
];
const TABS = GROUPS.flatMap((g) => g.items);
const TAB_IDS = new Set(TABS.map((t) => t.id));
// Bulk tools (and their spreadsheet/ZIP/PDF libraries) load only when the tab is opened.
const BulkTab = lazy(() => import('./bulk/BulkTab.jsx'));

export default function Admin() {
  const session = staffSession.get();
  if (!session?.token) return <Navigate to="/staff/login" replace />;
  if (session.staff?.role !== 'admin') return <Navigate to="/verify" replace />;
  return <Dashboard session={session} />;
}

/** Wraps api() for admin calls: 401 → re-login, 403 → verifier screen. */
function useAdminApi() {
  const navigate = useNavigate();
  return useCallback(async (path, opts = {}) => {
    try {
      return await api(path, { auth: true, ...opts });
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { staffSession.clear(); navigate('/staff/login', { replace: true }); }
      if (e instanceof ApiError && e.status === 403) navigate('/verify', { replace: true });
      throw e;
    }
  }, [navigate]);
}

/** Downloads the attendee CSV export. */
function useCsvExport(call) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const exportCsv = useCallback(async () => {
    setExporting(true);
    setExportError('');
    try {
      const res = await call('/admin/export.csv', { raw: true });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qrpass-attendees-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) {
      setExportError(e.message || 'Export failed.');
    } finally {
      setExporting(false);
    }
  }, [call]);
  return { exportCsv, exporting, exportError };
}

function Dashboard({ session }) {
  const navigate = useNavigate();
  const online = useOnline();
  const call = useAdminApi();
  const [tab, setTab] = useState(() => {
    try {
      const t = sessionStorage.getItem('qrp.adminTab');
      return TAB_IDS.has(t) ? t : 'overview';
    } catch { return 'overview'; }
  });
  const [stats, setStats] = useState(null);
  const [statsError, setStatsError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [staffFocus, setStaffFocus] = useState(0);
  const [bulkOpened, setBulkOpened] = useState(false); // keep Bulk mounted once opened so uploads/exports survive tab switches
  if (tab === 'bulk' && !bulkOpened) setBulkOpened(true);
  const { exportCsv, exporting, exportError } = useCsvExport(call);

  useEffect(() => { try { sessionStorage.setItem('qrp.adminTab', tab); } catch { /* ignore */ } }, [tab]);

  const loadStats = useCallback(async () => {
    setRefreshing(true);
    try {
      const s = await call('/admin/stats');
      setStats(s);
      setStatsError('');
      setUpdatedAt(Date.now());
    } catch (e) {
      setStatsError(e.message || 'Could not load stats.');
    } finally {
      setRefreshing(false);
    }
  }, [call]);

  useEffect(() => {
    loadStats();
    const t = setInterval(() => { if (document.visibilityState === 'visible') loadStats(); }, 15_000);
    return () => clearInterval(t);
  }, [loadStats]);

  function signOut() {
    staffSession.clear();
    navigate('/staff/login', { replace: true });
  }

  function goTab(id) {
    setTab(id);
    window.scrollTo({ top: 0 });
  }

  const badges = {
    attendees: stats && { value: stats.totalUsers },
    checkins: stats && (stats.duplicates > 0 ? { value: stats.duplicates, tone: 'warn' } : { value: stats.checkedIn }),
  };

  const action = {
    overview: <Button size="sm" icon={FileSpreadsheet} onClick={() => goTab('bulk')}>Upload Excel</Button>,
    attendees: <Button size="sm" icon={Download} loading={exporting} onClick={exportCsv}>Export CSV</Button>,
    checkins: <Button size="sm" icon={ScanLine} to="/verify">Open verifier</Button>,
    staff: <Button size="sm" icon={UserPlus} onClick={() => setStaffFocus((n) => n + 1)}>Add staff</Button>,
  }[tab];

  const title = TABS.find((t) => t.id === tab)?.label;
  const headerProps = { title, online, updatedAt, statsError, refreshing, onRefresh: loadStats, action };

  return (
    <div className="min-h-dvh bg-slate-50">
      <Sidebar groups={GROUPS} tab={tab} onTab={goTab} badges={badges} staff={session.staff} onSignOut={signOut} />

      <div className="lg:pl-64 2xl:pl-72 min-w-0">
        <MobileHeader tabs={TABS} tab={tab} onTab={goTab} badges={badges} onSignOut={signOut} />
        <TopBar {...headerProps} subtitle="Teck Fluence X · Admin" />

        <main>
          <AdminContent>
            <MobilePageHeader {...headerProps} />

            {statsError && (
              <div role="alert" className="mb-4 xl:mb-5 flex items-center gap-3 rounded-2xl bg-danger-50 ring-1 ring-danger-500/30 p-3.5 text-sm">
                <XCircle className="size-5 text-danger-600 shrink-0" />
                <p className="flex-1 text-ink-700">{online ? statsError : 'You are offline. The dashboard needs an internet connection.'}</p>
                <Button size="sm" variant="secondary" onClick={loadStats}>Retry</Button>
              </div>
            )}

            {tab === 'overview' && <Overview stats={stats} onGoto={goTab} />}
            {tab === 'attendees' && (
              <Attendees call={call} stats={stats} onChanged={loadStats} exportCsv={exportCsv} exporting={exporting} exportError={exportError} />
            )}
            {tab === 'checkins' && <Checkins stats={stats} call={call} />}
            {tab === 'staff' && <StaffTab call={call} focusSignal={staffFocus} />}
            {bulkOpened && (
              <div hidden={tab !== 'bulk'}>
                <Suspense fallback={<div className="flex justify-center py-16"><Spinner /></div>}>
                  <BulkTab call={call} online={online} onChanged={loadStats} />
                </Suspense>
              </div>
            )}
          </AdminContent>
        </main>
      </div>
    </div>
  );
}
