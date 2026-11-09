import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, Phone, Mail, Building2, Camera, X, ImagePlus, Lock, ArrowRight } from 'lucide-react';
import { Button, Card, Spinner } from '../../components/ui.jsx';
import { api, ApiError } from '../../lib/api.js';
import { passStore } from '../../lib/passStore.js';
import { compressImage } from '../../lib/image.js';
import { PublicLayout, PageTitle, TextField, Alert, OfflineBanner, useOnline, validators } from './shared.jsx';

const FIELDS = ['fullName', 'phone', 'email', 'organization'];
const empty = { fullName: '', phone: '', email: '', organization: '' };

function PhotoPicker({ photo, onChange, error, setError }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      onChange(await compressImage(file, { maxSize: 256, quality: 0.8 }));
    } catch (err) {
      setError(err.message || 'Could not use that photo. Try another one.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between text-sm font-medium text-ink-700">
        <span id="photo-label">Photo</span>
        <span className="text-xs font-normal text-ink-400">Optional</span>
      </div>
      <div className="flex items-center gap-4 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
        <div className="relative shrink-0">
          {photo ? (
            <img src={photo} alt="Your photo preview" className="size-20 rounded-2xl object-cover ring-2 ring-white shadow-sm animate-pop" />
          ) : (
            <div className="grid size-20 place-items-center rounded-2xl bg-white text-ink-400 ring-1 ring-dashed ring-slate-300">
              {busy ? <Spinner /> : <User className="size-8" />}
            </div>
          )}
          {photo && (
            <button
              type="button"
              onClick={() => onChange(null)}
              aria-label="Remove photo"
              className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-ink-900 text-white shadow ring-2 ring-white transition hover:bg-danger-600"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-snug text-ink-600">
            Helps staff confirm it's really you at the entrance.
          </p>
          <input
            ref={inputRef}
            id="photo"
            type="file"
            accept="image/*"
            capture="user"
            onChange={handleFile}
            aria-labelledby="photo-label"
            className="sr-only"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon={photo ? ImagePlus : Camera}
            loading={busy}
            onClick={() => inputRef.current?.click()}
            className="mt-2"
          >
            {photo ? 'Change photo' : 'Add a photo'}
          </Button>
        </div>
      </div>
      <div aria-live="polite">
        {error && <p className="mt-1.5 text-[13px] text-danger-600">{error}</p>}
      </div>
    </div>
  );
}

export default function Register() {
  const navigate = useNavigate();
  const online = useOnline();
  const [values, setValues] = useState(empty);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [photo, setPhoto] = useState(null);
  const [photoError, setPhotoError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState(null); // { tone, title, text }
  const submittingRef = useRef(false);
  const refs = { fullName: useRef(null), phone: useRef(null), email: useRef(null), organization: useRef(null) };

  const validate = (name, v) => validators[name](v ?? values[name]);

  function onChange(e) {
    const { name, value } = e.target;
    setValues((s) => ({ ...s, [name]: value }));
    // Once a field has been touched, re-validate live so errors clear as the user fixes them.
    if (touched[name]) setErrors((s) => ({ ...s, [name]: validate(name, value) }));
  }

  function onBlur(e) {
    const { name, value } = e.target;
    setTouched((s) => ({ ...s, [name]: true }));
    setErrors((s) => ({ ...s, [name]: value || touched[name] || s[name] ? validate(name, value) : '' }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (submittingRef.current) return;
    setFormError(null);

    const next = Object.fromEntries(FIELDS.map((f) => [f, validate(f)]));
    setErrors(next);
    setTouched(Object.fromEntries(FIELDS.map((f) => [f, true])));
    const firstBad = FIELDS.find((f) => next[f]);
    if (firstBad) {
      refs[firstBad].current?.focus();
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setFormError({ offline: true });
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const body = {
        fullName: values.fullName.trim().replace(/\s+/g, ' '),
        phone: values.phone.trim(),
        email: values.email.trim().toLowerCase(),
        ...(values.organization.trim() ? { organization: values.organization.trim() } : {}),
        ...(photo ? { photo } : {}),
      };
      const res = await api('/register', { method: 'POST', body });
      passStore.set(res);
      navigate(`/pass/${res.user.id}`, { replace: true, state: { justRegistered: true, pass: res } });
    } catch (err) {
      const status = err instanceof ApiError ? err.status : -1;
      if (status === 0) {
        setFormError({ offline: true });
      } else if (status === 409 && (err.field === 'email' || err.field === 'phone')) {
        const label = err.field === 'email' ? 'email' : 'mobile number';
        setErrors((s) => ({
          ...s,
          [err.field]: (
            <>
              This {label} is already registered —{' '}
              <Link to="/find-pass" className="font-semibold underline underline-offset-2">find your pass instead</Link>.
            </>
          ),
        }));
        refs[err.field].current?.focus();
      } else if (status === 400 && err.field && FIELDS.includes(err.field)) {
        setErrors((s) => ({ ...s, [err.field]: err.message }));
        refs[err.field].current?.focus();
      } else if (status === 413) {
        setPhotoError('That photo is too large. Try a different one or skip it.');
      } else {
        setFormError({ title: 'Registration failed', text: err.message || 'Something went wrong. Please try again.' });
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  const fieldProps = (name) => ({
    name,
    ref: refs[name],
    value: values[name],
    onChange,
    onBlur,
    error: errors[name] || undefined,
  });

  return (
    <PublicLayout back="/">
      <PageTitle
        eyebrow="Registration"
        title="Get your entry pass"
        subtitle="Fill in your details. Your QR pass appears right after — keep it on your phone for event day."
      />

      {(!online || formError?.offline) && <OfflineBanner what="Registration" />}

      <Card className="p-5 sm:p-6 animate-fade-up [animation-delay:60ms]">
        <form noValidate onSubmit={onSubmit} className="space-y-5" aria-busy={submitting}>
          <TextField
            label="Full name"
            icon={User}
            type="text"
            autoComplete="name"
            autoCapitalize="words"
            placeholder="As on your ID"
            enterKeyHint="next"
            {...fieldProps('fullName')}
          />
          <TextField
            label="Mobile number"
            icon={Phone}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="98765 43210"
            enterKeyHint="next"
            {...fieldProps('phone')}
          />
          <TextField
            label="Email"
            icon={Mail}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="you@example.com"
            hint="We'll use this with your mobile number to find your pass later."
            enterKeyHint="next"
            {...fieldProps('email')}
          />
          <TextField
            label="Organization"
            optional
            icon={Building2}
            type="text"
            autoComplete="organization"
            placeholder="Company, college or group"
            enterKeyHint="done"
            {...fieldProps('organization')}
          />

          <PhotoPicker photo={photo} onChange={setPhoto} error={photoError} setError={setPhotoError} />

          {formError && !formError.offline && (
            <Alert title={formError.title}>{formError.text}</Alert>
          )}

          <Button type="submit" size="lg" loading={submitting} className="w-full">
            {submitting ? 'Creating your pass…' : (<>Get my QR pass <ArrowRight className="size-4" /></>)}
          </Button>

          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-ink-500">
            <Lock className="size-3.5" /> Your details are only used to verify you at this event.
          </p>
        </form>
      </Card>

      <p className="mt-6 text-center text-sm text-ink-600">
        Already registered?{' '}
        <Link to="/find-pass" className="font-semibold text-brand-700 hover:underline underline-offset-2">Find my pass</Link>
      </p>
    </PublicLayout>
  );
}
