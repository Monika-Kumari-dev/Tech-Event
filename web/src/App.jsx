import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spinner } from './components/ui.jsx';

// Route-level code splitting: attendees never download the scanner/admin code and vice versa.
// The service worker precaches every chunk, so lazy routes still work offline.
const Landing = lazy(() => import('./pages/public/Landing.jsx'));
const Register = lazy(() => import('./pages/public/Register.jsx'));
const Pass = lazy(() => import('./pages/public/Pass.jsx'));
const FindPass = lazy(() => import('./pages/public/FindPass.jsx'));
const StaffLogin = lazy(() => import('./pages/staff/StaffLogin.jsx'));
const Verify = lazy(() => import('./pages/staff/Verify.jsx'));
const Admin = lazy(() => import('./pages/staff/Admin.jsx'));

function PageLoader() {
  return (
    <div className="min-h-dvh grid place-items-center">
      <Spinner className="size-7" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/register" element={<Register />} />
        <Route path="/pass/:id" element={<Pass />} />
        <Route path="/find-pass" element={<FindPass />} />
        <Route path="/staff/login" element={<StaffLogin />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
