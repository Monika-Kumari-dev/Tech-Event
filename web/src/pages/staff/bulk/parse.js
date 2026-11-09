// Pure helpers for bulk attendee import: header mapping, cell normalization, validation
// and error-report rows. No DOM, no React, no library imports, so it runs in Node tests too.
// Rules mirror server/src/lib/validate.js.

export const MAX_ROWS = 10_000;
export const CHUNK_SIZE = 500;

export const FIELDS = [
  { key: 'fullName', label: 'Full Name', required: true, aliases: ['name', 'full name', 'fullname', 'attendee', 'attendee name', 'participant', 'participant name'] },
  { key: 'phone', label: 'Mobile', required: true, aliases: ['mobile', 'phone', 'phone number', 'contact', 'mobile number', 'contact number', 'mobile no', 'phone no', 'whatsapp'] },
  { key: 'email', label: 'Email', required: true, aliases: ['email', 'e-mail', 'mail', 'email address', 'e-mail address', 'email id'] },
  { key: 'organization', label: 'Organization', required: false, aliases: ['organization', 'organisation', 'company', 'org', 'institution', 'college'] },
];

export const TEMPLATE_HEADERS = ['Full Name', 'Mobile', 'Email', 'Organization'];
export const TEMPLATE_ROWS = [
  ['Aarav Sharma', '9876543210', 'aarav.sharma@example.com', 'Northwind Labs'],
  ['Meera Iyer', '+91 98450 12345', 'meera.iyer@example.org', 'Contoso Analytics'],
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SCI_RE = /^[+-]?\d+(\.\d+)?e[+-]?\d+$/i;

/** "  E-Mail Address: " -> "e-mailaddress" (case, spaces, underscores and punctuation-insensitive). */
export function normHeader(h) {
  return String(h ?? '').toLowerCase().replace(/[\s_.:*#()]+/g, '');
}

/** Converts any spreadsheet cell to a trimmed string without scientific notation for whole numbers. */
export function cellToString(v) {
  if (v == null) return '';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) return '';
    if (Number.isInteger(v)) return v.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 0 });
    return String(v);
  }
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  return String(v).trim();
}

const isBlankRow = (cells) => !cells || cells.every((c) => cellToString(c) === '');

/**
 * Maps header cells to fields. Each header column is used at most once.
 * @returns {{ mapping: Record<string, number>, missing: string[] }}  index -1 = not found
 */
export function detectColumns(headers) {
  const norm = (headers || []).map(normHeader);
  const used = new Set();
  const mapping = {};
  for (const f of FIELDS) {
    const aliases = f.aliases.map(normHeader);
    let idx = -1;
    for (const a of aliases) {
      idx = norm.findIndex((h, i) => h === a && !used.has(i));
      if (idx !== -1) break;
    }
    if (idx !== -1) used.add(idx);
    mapping[f.key] = idx;
  }
  return { mapping, missing: missingFields(mapping) };
}

export function missingFields(mapping) {
  return FIELDS.filter((f) => f.required && !(mapping?.[f.key] >= 0)).map((f) => f.key);
}

/** First row (within the first 10 non-blank rows) that maps ≥ 2 fields; otherwise the first non-blank row. */
export function findHeaderRow(aoa) {
  let first = -1;
  let seen = 0;
  for (let i = 0; i < aoa.length && seen < 10; i++) {
    if (isBlankRow(aoa[i])) continue;
    if (first === -1) first = i;
    seen++;
    const { mapping } = detectColumns(aoa[i]);
    if (Object.values(mapping).filter((x) => x >= 0).length >= 2) return i;
  }
  return first;
}

/**
 * Turns a sheet (SheetJS passed in, so this stays library-free) into a grid plus the
 * 1-based spreadsheet row number of grid[0].
 */
export function sheetToGrid(XLSX, ws) {
  if (!ws || !ws['!ref']) return { aoa: [], firstRow: 1 };
  const range = XLSX.utils.decode_range(ws['!ref']);
  const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '', blankrows: true });
  return { aoa, firstRow: range.s.r + 1 };
}

/**
 * Prepares a parsed grid: finds header row, column mapping.
 * @returns {{ headers: string[], headerIndex: number, mapping, missing, dataRowCount: number }}
 */
export function analyzeGrid(aoa) {
  const headerIndex = findHeaderRow(aoa);
  if (headerIndex === -1) return { headers: [], headerIndex: -1, mapping: {}, missing: FIELDS.filter((f) => f.required).map((f) => f.key), dataRowCount: 0 };
  const headers = (aoa[headerIndex] || []).map((h, i) => cellToString(h) || `Column ${colLetter(i)}`);
  const { mapping, missing } = detectColumns(aoa[headerIndex]);
  let dataRowCount = 0;
  for (let i = headerIndex + 1; i < aoa.length; i++) if (!isBlankRow(aoa[i])) dataRowCount++;
  return { headers, headerIndex, mapping, missing, dataRowCount };
}

export function colLetter(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

/**
 * Extracts mapped data rows, skipping blanks.
 * @param firstRow 1-based spreadsheet row number of aoa[0]
 * @returns {Array<{ row: number, raw: string[], fullName: string, phone: string, email: string, organization: string, phoneRaw: any }>}
 */
export function extractRows(aoa, headerIndex, mapping, firstRow = 1) {
  const out = [];
  const get = (cells, key) => (mapping[key] >= 0 ? cells[mapping[key]] : '');
  for (let i = headerIndex + 1; i < aoa.length; i++) {
    const cells = aoa[i];
    if (isBlankRow(cells)) continue;
    out.push({
      row: firstRow + i,
      raw: cells.map(cellToString),
      fullName: cellToString(get(cells, 'fullName')),
      phone: cellToString(get(cells, 'phone')),
      email: cellToString(get(cells, 'email')),
      organization: cellToString(get(cells, 'organization')),
    });
  }
  return out;
}

/** Validates one row. Returns { errors: string[], clean: { fullName, phone, email, organization } }. */
export function validateRow(r) {
  const errors = [];
  const fullName = r.fullName.trim().replace(/\s+/g, ' ');
  if (!fullName) errors.push('Name is missing');
  else if (fullName.length < 2 || fullName.length > 80) errors.push('Name must be 2–80 characters');

  const email = r.email.trim().toLowerCase();
  if (!email) errors.push('Email is missing');
  else if (email.length > 254 || !EMAIL_RE.test(email)) errors.push('Email is not valid');

  let phone = '';
  if (!r.phone) errors.push('Mobile is missing');
  else if (SCI_RE.test(r.phone.replace(/\s/g, ''))) errors.push('Mobile is in scientific notation (format the column as Text and re-export)');
  else {
    phone = r.phone.replace(/\D/g, '');
    if (phone.length < 10 || phone.length > 15) errors.push(`Mobile must have 10–15 digits (has ${phone.length})`);
  }

  const organization = r.organization.trim();
  if (organization.length > 100) errors.push('Organization must be at most 100 characters');

  return { errors, clean: { fullName, phone, email, organization } };
}

/**
 * Validates every row and flags in-file duplicates (first occurrence wins).
 * status: 'ready' | 'error' | 'duplicate'
 */
export function validateRows(rows) {
  const byEmail = new Map();
  const byPhone = new Map();
  return rows.map((r) => {
    const { errors, clean } = validateRow(r);
    if (errors.length) return { ...r, status: 'error', reason: errors.join('; '), clean };
    const dupOf = byEmail.get(clean.email) ?? byPhone.get(clean.phone);
    if (dupOf != null) {
      const what = byEmail.has(clean.email) ? 'email' : 'mobile';
      return { ...r, status: 'duplicate', reason: `Same ${what} as row ${dupOf}`, clean };
    }
    byEmail.set(clean.email, r.row);
    byPhone.set(clean.phone, r.row);
    return { ...r, status: 'ready', reason: '', clean };
  });
}

export function summarize(rows) {
  const s = { total: rows.length, ready: 0, error: 0, duplicate: 0 };
  for (const r of rows) s[r.status]++;
  return s;
}

/** Ready rows as API payloads, split into chunks. */
export function toChunks(rows, size = CHUNK_SIZE) {
  const payload = rows.filter((r) => r.status === 'ready').map((r) => ({ row: r.row, ...r.clean }));
  const chunks = [];
  for (let i = 0; i < payload.length; i += size) chunks.push(payload.slice(i, i + size));
  return chunks;
}

/**
 * Builds the error report grid: Row, <original columns>, Status, Reason.
 * @param server { skipped: [{row, error}], failed: [{row, error}], unsent: Set<row> }
 */
export function buildErrorReport(headers, rows, server = {}) {
  const issues = new Map();
  for (const s of server.skipped || []) issues.set(s.row, ['Already registered', s.error || 'Already registered']);
  for (const f of server.failed || []) issues.set(f.row, ['Failed', f.error || 'Rejected by server']);
  const unsent = server.unsent || new Set();
  const out = [['Row', ...headers, 'Status', 'Reason']];
  for (const r of rows) {
    let status = null;
    let reason = '';
    if (r.status === 'error') { status = 'Invalid'; reason = r.reason; }
    else if (r.status === 'duplicate') { status = 'Duplicate in file'; reason = r.reason; }
    else if (issues.has(r.row)) [status, reason] = issues.get(r.row);
    else if (unsent.has(r.row)) { status = 'Not sent'; reason = 'Upload was stopped before this row was sent'; }
    if (!status) continue;
    const cells = headers.map((_, i) => r.raw[i] ?? '');
    out.push([r.row, ...cells, status, reason]);
  }
  return out;
}

/** Safe file-name segment: keeps letters (any script) and digits, joins words with "-". */
export function safeName(s, max = 60) {
  return String(s || '')
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ')
    .trim()
    .split(/\s+/)
    .join('-')
    .slice(0, max) || 'attendee';
}

export function formatBytes(n) {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${v.toLocaleString(undefined, { maximumFractionDigits: v >= 100 || i === 0 ? 0 : 1 })} ${u[i]}`;
}

export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${String(s % 60).padStart(2, '0')}s`;
}
