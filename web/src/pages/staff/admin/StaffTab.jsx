// Admin "Staff" tab: staff accounts table (8 cols) + add-staff form (4 cols) at xl.
import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyRound, ScanLine, ShieldCheck, ShieldPlus, UserPlus, Users } from 'lucide-react';
import { Avatar, Badge, Button, Field, Input, cx } from '../../../components/ui.jsx';
import { EmptyState, Panel } from '../adminKit.jsx';
import { Skeleton } from '../shared.jsx';
import { ErrorBlock, fmt, formatDate, tableTd, tableTh } from './common.jsx';

const ROLES = [
  { id: 'verifier', label: 'Verifier', hint: 'Scan at gates', icon: ScanLine },
  { id: 'admin', label: 'Admin', hint: 'Full dashboard', icon: ShieldCheck },
];

export default function StaffTab({ call, focusSignal }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ username: '', name: '', password: '', role: 'verifier' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState({});
  const [created, setCreated] = useState('');
  const formRef = useRef(null);
  const nameRef = useRef(null);

  const load = useCallback(() => {
    call('/admin/staff')
      .then((d) => { setItems(d.items || []); setError(''); })
      .catch((e) => setError(e.message || 'Could not load staff.'));
  }, [call]);
  useEffect(() => { load(); }, [load]);

  // Top-bar "Add staff" focuses the form.
  useEffect(() => {
    if (!focusSignal) return;
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    nameRef.current?.focus({ preventScroll: true });
  }, [focusSignal]);

  const set = (k) => (e) => { setForm((f) => ({ ...f, [k]: e.target.value })); setFormError({}); setCreated(''); };

  async function submit(e) {
    e.preventDefault();
    const errs = {};
    if (!/^[a-z0-9._-]{3,32}$/i.test(form.username.trim())) errs.username = '3–32 letters, numbers, dot, dash or underscore.';
    if (!form.name.trim()) errs.name = 'Enter a display name.';
    if (form.password.length < 6) errs.password = 'At least 6 characters.';
    if (Object.keys(errs).length) { setFormError(errs); return; }
    setSaving(true);
    try {
      const res = await call('/admin/staff', { method: 'POST', body: { ...form, username: form.username.trim(), name: form.name.trim() } });
      setCreated(res.staff?.username || form.username);
      setForm({ username: '', name: '', password: '', role: 'verifier' });
      load();
    } catch (err) {
      setFormError({ [err.field || 'general']: err.message || 'Could not create account.' });
    } finally {
      setSaving(false);
    }
  }

  const admins = items?.filter((s) => s.role === 'admin').length || 0;

  return (
    <div className="grid gap-4 xl:gap-5 grid-cols-1 xl:grid-cols-12 animate-fade-up">
      <div className="xl:col-span-8">
        <Panel title="Staff accounts" description="People who can sign in to scan or manage the event" icon={Users} bodyClassName="p-0 flex flex-col"
          actions={items && (
            <div className="flex items-center gap-2">
              <Badge tone="brand" className="tabular-nums">{fmt(admins)} admin{admins === 1 ? '' : 's'}</Badge>
              <Badge className="tabular-nums">{fmt(items.length - admins)} verifier{items.length - admins === 1 ? '' : 's'}</Badge>
            </div>
          )}>
          {error ? (
            <ErrorBlock message={error} onRetry={load} />
          ) : !items ? (
            <div className="p-5 space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-11" />)}</div>
          ) : items.length === 0 ? (
            <EmptyState icon={ShieldPlus} title="No staff accounts">Create the first gate account with the form.</EmptyState>
          ) : (
            <table className="w-full table-fixed text-sm">
              <thead className="bg-slate-50/80 border-b border-slate-100">
                <tr>
                  <th className={tableTh}>Name</th>
                  <th className={cx(tableTh, 'hidden sm:table-cell w-[28%]')}>Username</th>
                  <th className={cx(tableTh, 'w-[7rem]')}>Role</th>
                  <th className={cx(tableTh, 'hidden md:table-cell w-[9rem] text-right')}>Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((s) => (
                  <tr key={s.id || s.username} className="hover:bg-slate-50/70">
                    <td className={tableTd}>
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={s.name || s.username} size="size-8 shrink-0 text-[11px]" />
                        <div className="min-w-0">
                          <p className="font-semibold text-ink-900 truncate" title={s.name}>{s.name || s.username}</p>
                          <p className="text-xs font-mono text-ink-500 truncate sm:hidden">{s.username}</p>
                        </div>
                      </div>
                    </td>
                    <td className={cx(tableTd, 'hidden sm:table-cell')}><span className="block font-mono text-xs text-ink-700 truncate" title={s.username}>{s.username}</span></td>
                    <td className={tableTd}><Badge tone={s.role === 'admin' ? 'brand' : 'neutral'}>{s.role === 'admin' ? 'Admin' : 'Verifier'}</Badge></td>
                    <td className={cx(tableTd, 'hidden md:table-cell text-right text-ink-600 tabular-nums whitespace-nowrap')}>{formatDate(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="mt-auto grid sm:grid-cols-2 gap-3 p-5 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl">
            {ROLES.map((r) => (
              <div key={r.id} className="flex items-start gap-3">
                <span className="grid place-items-center size-8 rounded-lg bg-white ring-1 ring-slate-200 text-ink-600 shrink-0"><r.icon className="size-4" /></span>
                <div className="text-xs text-ink-500">
                  <p className="text-sm font-semibold text-ink-900">{r.label}</p>
                  {r.id === 'admin' ? 'Sees this dashboard: stats, attendees, bulk tools and staff.' : 'Uses the offline scanner at a gate. No dashboard access.'}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <div className="xl:col-span-4" ref={formRef}>
        <Panel title="Add staff" description="Create a login for a gate or an organiser" icon={UserPlus}>
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Display name" htmlFor="s-name" error={formError.name}>
              <Input ref={nameRef} id="s-name" value={form.name} onChange={set('name')} placeholder="Priya (Gate 2)" error={formError.name} />
            </Field>
            <Field label="Username" htmlFor="s-user" error={formError.username}>
              <Input id="s-user" value={form.username} onChange={set('username')} autoCapitalize="none" autoComplete="off" placeholder="gate2" error={formError.username} />
            </Field>
            <Field label="Password" htmlFor="s-pass" error={formError.password}>
              <Input id="s-pass" icon={KeyRound} type="password" value={form.password} onChange={set('password')} autoComplete="new-password" placeholder="At least 6 characters" error={formError.password} />
            </Field>
            <div>
              <span className="block text-sm font-medium text-ink-700 mb-1.5">Role</span>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Role">
                {ROLES.map((r) => (
                  <button key={r.id} type="button" role="radio" aria-checked={form.role === r.id} onClick={() => setForm((f) => ({ ...f, role: r.id }))}
                    className={cx('rounded-xl p-3 text-left ring-1 transition flex items-start gap-2.5',
                      form.role === r.id ? 'ring-2 ring-brand-500 bg-brand-50' : 'ring-slate-200 hover:bg-slate-50')}>
                    <r.icon className={cx('size-4 mt-0.5 shrink-0', form.role === r.id ? 'text-brand-600' : 'text-ink-400')} />
                    <span>
                      <span className="block text-sm font-semibold text-ink-900">{r.label}</span>
                      <span className="block text-xs text-ink-500">{r.hint}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            {formError.general && <p role="alert" className="text-sm text-danger-600">{formError.general}</p>}
            {created && <p role="status" className="text-sm text-success-600 bg-success-50 rounded-xl px-3 py-2">Account “{created}” created.</p>}
            <Button type="submit" className="w-full" icon={UserPlus} loading={saving}>Create account</Button>
          </form>
        </Panel>
      </div>
    </div>
  );
}
