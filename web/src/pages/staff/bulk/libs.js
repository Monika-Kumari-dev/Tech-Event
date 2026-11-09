// Heavy libraries are only fetched when the Bulk tab needs them (separate chunks).
// A failed load (e.g. offline) clears the cache so the next attempt retries.
import { sheetToGrid } from './parse.js';

const cache = {};
function once(key, loader) {
  if (!cache[key]) cache[key] = loader().catch((e) => { delete cache[key]; throw new Error(`Could not load ${key}. Check your connection and try again.`, { cause: e }); });
  return cache[key];
}

export const loadXlsx = () => once('spreadsheet tools', () => import('xlsx'));
export const loadJsZip = () => once('ZIP tools', () => import('jszip').then((m) => m.default || m));
export const loadJsPdf = () => once('PDF tools', () => import('jspdf').then((m) => m.jsPDF || m.default));
export const loadQrcode = () => once('QR tools', () => import('qrcode').then((m) => m.default || m));

/** Saves a Blob via a temporary object URL, revoked shortly after. */
export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function downloadXlsx(aoa, fileName, { sheetName = 'Sheet1', widths } = {}) {
  const XLSX = await loadXlsx();
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  if (widths) ws['!cols'] = widths.map((wch) => ({ wch }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), fileName);
}

/** Reads the first sheet of an .xlsx/.xls/.csv File into a grid. */
export async function readSpreadsheet(file) {
  const XLSX = await loadXlsx();
  const buf = await file.arrayBuffer();
  const isCsv = /\.csv$/i.test(file.name) || file.type === 'text/csv';
  let wb;
  try {
    // raw for CSV keeps "0987…" and "+91 …" as typed instead of coercing to numbers
    wb = XLSX.read(buf, { type: 'array', dense: true, raw: isCsv, cellDates: true, codepage: 65001 });
  } catch {
    throw new Error('This file could not be read. Save it as .xlsx or .csv and try again.');
  }
  const sheetName = wb.SheetNames[0];
  if (!sheetName) throw new Error('This workbook has no sheets.');
  return { sheetName, sheetCount: wb.SheetNames.length, ...sheetToGrid(XLSX, wb.Sheets[sheetName]) };
}

export const today = () => new Date().toISOString().slice(0, 10);
