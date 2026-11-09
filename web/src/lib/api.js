// Shared API client. See /CONTRACT.md for every endpoint and shape.
const STAFF_KEY = 'qrp.staff';

export class ApiError extends Error {
  constructor(message, status, field) {
    super(message);
    this.status = status;
    this.field = field;
  }
}

export const staffSession = {
  get() {
    try { return JSON.parse(localStorage.getItem(STAFF_KEY)) || null; } catch { return null; }
  },
  set(session) {
    try { localStorage.setItem(STAFF_KEY, JSON.stringify(session)); } catch { /* ignore */ }
  },
  clear() {
    try { localStorage.removeItem(STAFF_KEY); } catch { /* ignore */ }
  },
};

/**
 * api('/register', { method: 'POST', body: {...} })
 * - prefixes /api, JSON encodes body, attaches staff token if `auth: true`
 * - throws ApiError (status 0 = network/offline)
 */
export async function api(path, { method = 'GET', body, auth = false, raw = false, signal } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const s = staffSession.get();
    if (s?.token) headers.Authorization = `Bearer ${s.token}`;
  }
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new ApiError('You appear to be offline. Check your connection and try again.', 0);
  }
  if (raw) {
    if (!res.ok) throw new ApiError(`Request failed (${res.status})`, res.status);
    return res;
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error || `Request failed (${res.status})`, res.status, data.field);
  return data;
}
