// Device-local storage for the attendee's own pass, so it renders fully offline.
const PASS_KEY = 'qrp.pass';
const EVENT_KEY = 'qrp.event';

export const passStore = {
  /** @returns {{ user: object, qrToken: string, savedAt?: number } | null} */
  get() {
    try {
      const v = JSON.parse(localStorage.getItem(PASS_KEY));
      return v && v.user && v.user.id && v.qrToken ? v : null;
    } catch {
      return null;
    }
  },
  set({ user, qrToken }) {
    try {
      localStorage.setItem(PASS_KEY, JSON.stringify({ user, qrToken, savedAt: Date.now() }));
    } catch { /* storage full or blocked — pass still shows for this session via navigation */ }
  },
  clear() {
    try { localStorage.removeItem(PASS_KEY); } catch { /* ignore */ }
  },
};

/** Cached event name so the ticket header renders offline. */
export const eventStore = {
  get() {
    try { return localStorage.getItem(EVENT_KEY) || null; } catch { return null; }
  },
  set(name) {
    try { if (name) localStorage.setItem(EVENT_KEY, name); } catch { /* ignore */ }
  },
};
