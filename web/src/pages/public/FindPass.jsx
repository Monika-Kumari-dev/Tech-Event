import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Phone, Search, SearchX, ShieldCheck } from 'lucide-react';
import { Button, Card } from '../../components/ui.jsx';
import { api, ApiError } from '../../lib/api.js';
import { passStore } from '../../lib/passStore.js';
import { PublicLayout, PageTitle, TextField, Alert, OfflineBanner, useOnline, validators } from './shared.jsx';

const FIELDS = ['email', 'phone'];

export default function FindPass() {
  const navigate = useNavigate();
  const online = useOnline();
  const [values, setValues] = useState({ email: '', phone: '' });
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // 'notfound' | 'offline' | { error }
  const busyRef = useRef(false);
  const refs = { email: useRef(null), phone: useRef(null) };

  function onChange(e) {
    const { name, value } = e.target;
    setValues((s) => ({ ...s, [name]: value }));
    if (result === 'notfound') setResult(null);
    if (touched[name]) setErrors((s) => ({ ...s, [name]: validators[name](value) }));
  }

  function onBlur(e) {
    const { name, value } = e.target;
    setTouched((s) => ({ ...s, [name]: true }));
    if (value || touched[name]) setErrors((s) => ({ ...s, [name]: validators[name](value) }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (busyRef.current) return;
    setResult(null);
    const next = Object.fromEntries(FIELDS.map((f) => [f, validators[f](values[f])]));
    setErrors(next);
    setTouched({ email: true, phone: true });
    const firstBad = FIELDS.find((f) => next[f]);
    if (firstBad) {
      refs[firstBad].current?.focus();
      return;
    }
    if (navigator.onLine === false) {
      setResult('offline');
      return;
    }

    busyRef.current = true;
    setLoading(true);
    try {
      const res = await api('/pass/lookup', {
        method: 'POST',
        body: { email: values.email.trim().toLowerCase(), phone: values.phone.trim() },
      });
      passStore.set(res);
      navigate(`/pass/${res.user.id}`, { replace: true, state: { pass: res } });
    } catch (err) {
      const status = err instanceof ApiError ? err.status : -1;
      if (status === 404) setResult('notfound');
      else if (status === 0) setResult('offline');
      else setResult({ error: err.message || 'Something went wrong. Please try again.' });
    } finally {
      busyRef.current = false;
      setLoading(false);
    }
  }

  return (
    <PublicLayout back="/">
      <PageTitle
        eyebrow="Find my pass"
        title="Load your QR pass"
        subtitle="Enter the email and mobile number you registered with. Both need to match."
      />

      {(!online || result === 'offline') && <OfflineBanner what="Finding your pass" />}

      <Card className="p-5 sm:p-6 animate-fade-up [animation-delay:60ms]">
        <form noValidate onSubmit={onSubmit} className="space-y-5" aria-busy={loading}>
          <TextField
            label="Email"
            name="email"
            ref={refs.email}
            icon={Mail}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="you@example.com"
            enterKeyHint="next"
            value={values.email}
            onChange={onChange}
            onBlur={onBlur}
            error={errors.email || undefined}
          />
          <TextField
            label="Mobile number"
            name="phone"
            ref={refs.phone}
            icon={Phone}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="98765 43210"
            enterKeyHint="search"
            value={values.phone}
            onChange={onChange}
            onBlur={onBlur}
            error={errors.phone || undefined}
          />

          {result === 'notfound' && (
            <Alert tone="warn" icon={SearchX} title="No registration matches those details">
              Check for typos — the email and mobile number must both match what you registered with. New here?{' '}
              <Link to="/register" className="font-semibold underline underline-offset-2">Register now</Link>.
            </Alert>
          )}
          {result?.error && <Alert title="Couldn't look up your pass">{result.error}</Alert>}

          <Button type="submit" size="lg" icon={Search} loading={loading} className="w-full">
            {loading ? 'Searching…' : 'Find my pass'}
          </Button>

          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-500">
            <ShieldCheck className="size-3.5" /> Your pass will be saved on this device for offline use.
          </p>
        </form>
      </Card>

      <p className="mt-6 text-center text-sm text-ink-600">
        Not registered yet?{' '}
        <Link to="/register" className="font-semibold text-brand-700 hover:underline underline-offset-2">Register now</Link>
      </p>
    </PublicLayout>
  );
}
