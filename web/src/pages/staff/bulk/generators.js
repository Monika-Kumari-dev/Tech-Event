// Bulk pass generators: ZIP of PNG tickets, printable PDF, Excel list.
// All run on the main thread in small slices so the UI keeps painting; each takes an AbortSignal.
import { loadJsPdf, loadJsZip, loadQrcode, loadXlsx } from './libs.js';
import { safeName } from './parse.js';

export const BRAND = 'Teck Fluence X';
const YIELD_EVERY = 25;
const tick = () => new Promise((r) => setTimeout(r));
const abortError = () => new DOMException('Cancelled', 'AbortError');
const check = (signal) => { if (signal?.aborted) throw abortError(); };

const C = {
  brand600: '#4f46e5', brand900: '#1e1b4b', brand200: '#c7d2fe', brand100: '#e0e7ff', brand700: '#4338ca',
  ink900: '#0f172a', ink500: '#64748b', ink400: '#94a3b8', slate200: '#e2e8f0', bg: '#f1f5f9',
};
const SANS = 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const font = (w, s, f = SANS) => `${w} ${s}px ${f}`;

const initials = (name) => (name || '?').split(/\s+/).filter(Boolean).map((p) => p[0]).slice(0, 2).join('').toUpperCase() || '?';

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Draws QR modules with whole-pixel cells (crisp, no smoothing) centered in a box. */
function drawQr(ctx, modules, bx, by, box) {
  const n = modules.size;
  const cell = Math.max(1, Math.floor(box / n));
  const real = cell * n;
  const ox = Math.round(bx + (box - real) / 2);
  const oy = Math.round(by + (box - real) / 2);
  const path = new Path2D();
  const d = modules.data;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) if (d[r * n + c]) path.rect(ox + c * cell, oy + r * cell, cell, cell);
  }
  ctx.fillStyle = '#000';
  ctx.fill(path);
}

// ---------- compact PNG encoder ----------
// Canvas toBlob() favours speed over size (~150 KB per ticket). Re-encoding the opaque pixels as RGB
// with the browser's native zlib (CompressionStream) gives ~55 KB at similar speed: 5,000 passes ≈ 270 MB, not 750 MB.
let CRC_TABLE;
function crc32(parts) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const p of parts) for (let i = 0; i < p.length; i++) c = CRC_TABLE[(c ^ p[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const head = new Uint8Array(8);
  const dv = new DataView(head.buffer);
  dv.setUint32(0, data.length);
  const t = new TextEncoder().encode(type);
  head.set(t, 4);
  const tail = new Uint8Array(4);
  new DataView(tail.buffer).setUint32(0, crc32([t, data]));
  return [head, data, tail];
}

const canNativeDeflate = typeof CompressionStream !== 'undefined';

async function encodePng(canvas, ctx) {
  if (!canNativeDeflate) {
    return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png'));
  }
  const w = canvas.width;
  const h = canvas.height;
  const px = ctx.getImageData(0, 0, w, h).data;
  const raw = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0, si = 0, di = 0; y < h; y++) {
    raw[di++] = 0; // filter: none (smallest for this flat artwork)
    for (let x = 0; x < w; x++, si += 4) { raw[di++] = px[si]; raw[di++] = px[si + 1]; raw[di++] = px[si + 2]; }
  }
  const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit, truecolor RGB
  return new Blob([
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    ...pngChunk('IHDR', ihdr), ...pngChunk('IDAT', z), ...pngChunk('IEND', new Uint8Array(0)),
  ], { type: 'image/png' });
}

// ---------- PNG ticket (same layout as public/ticketImage.js, scaled to 600px wide) ----------
const BASE_W = 900;
const BASE_H = 1480;
const W = 600;
const S = W / BASE_W;
const H = Math.round(BASE_H * S);
const T = { tx: 50, ty: 50, tw: BASE_W - 100, th: BASE_H - 100, r: 48, headH: 220, qr: 620 };
T.qy = T.ty + T.headH + 60;
T.dy = T.qy + T.qr + 195;
T.ay = T.dy + 50;

function buildTemplate(eventName) {
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.setTransform(S, 0, 0, S, 0, 0);
  const { tx, ty, tw, th, r, headH, qy, dy } = T;

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, BASE_W, BASE_H);
  ctx.save();
  ctx.shadowColor = 'rgba(15,23,42,0.12)';
  ctx.shadowBlur = 40 * S;
  ctx.shadowOffsetY = 12 * S;
  roundRect(ctx, tx, ty, tw, th, r);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundRect(ctx, tx, ty, tw, th, r);
  ctx.clip();
  // Horizontal gradient: identical pixel rows compress far better in PNG (≈ 3× smaller files).
  const g = ctx.createLinearGradient(tx, 0, tx + tw, 0);
  g.addColorStop(0, C.brand600);
  g.addColorStop(1, C.brand900);
  ctx.fillStyle = g;
  ctx.fillRect(tx, ty, tw, headH);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath(); ctx.arc(tx + tw - 40, ty + 10, 150, 0, Math.PI * 2); ctx.fill();
  ctx.restore();

  const showEvent = eventName && eventName.trim().toLowerCase() !== BRAND.toLowerCase();
  ctx.fillStyle = C.brand200;
  ctx.font = font(600, 24);
  ctx.fillText('ENTRY PASS', tx + 56, ty + (showEvent ? 70 : 82));
  ctx.fillStyle = '#fff';
  ctx.font = font(800, 56);
  ctx.fillText(BRAND, tx + 56, ty + (showEvent ? 138 : 152));
  if (showEvent) {
    ctx.fillStyle = C.brand200;
    ctx.font = font(500, 28);
    ctx.fillText(fitText(ctx, eventName, tw - 112), tx + 56, ty + 184);
  }

  ctx.fillStyle = C.bg;
  ctx.beginPath(); ctx.arc(tx, ty + headH, 26, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(tx + tw, ty + headH, 26, 0, Math.PI * 2); ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = C.ink500;
  ctx.font = font(500, 24);
  ctx.fillText('Show this code if the QR can’t be scanned', BASE_W / 2, qy + T.qr + 145);
  ctx.textAlign = 'left';

  ctx.strokeStyle = C.slate200;
  ctx.lineWidth = 4;
  ctx.setLineDash([16, 12]);
  ctx.beginPath(); ctx.moveTo(tx + 56, dy); ctx.lineTo(tx + tw - 56, dy); ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = C.ink400;
  ctx.font = font(600, 22);
  ctx.fillText('ATTENDEE', tx + 56 + 120 + 32, T.ay + 34);
  return cv;
}

/** Returns render(user, qrToken) → Promise<Blob> reusing one canvas + a pre-drawn template. */
export async function createTicketRenderer({ eventName } = {}) {
  const QRCode = await loadQrcode();
  if (document.fonts?.ready) await document.fonts.ready.catch(() => {});
  const tpl = buildTemplate(eventName);
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: canNativeDeflate });

  return async function render(user, token) {
    const modules = QRCode.create(token, { errorCorrectionLevel: 'M' }).modules;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(tpl, 0, 0);
    drawQr(ctx, modules, ((BASE_W - T.qr) / 2) * S, T.qy * S, T.qr * S);

    ctx.setTransform(S, 0, 0, S, 0, 0);
    const { tx, tw, qy, ay } = T;
    ctx.textAlign = 'center';
    ctx.fillStyle = C.ink900;
    ctx.font = font(700, 54, MONO);
    ctx.fillText(user.code || '', BASE_W / 2, qy + T.qr + 100);
    ctx.textAlign = 'left';

    const av = 120;
    const ax = tx + 56;
    ctx.fillStyle = C.brand100;
    ctx.beginPath(); ctx.arc(ax + av / 2, ay + av / 2, av / 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.brand700;
    ctx.font = font(700, 46);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(initials(user.fullName), ax + av / 2, ay + av / 2 + 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    const nx = ax + av + 32;
    const nMax = tx + tw - 56 - nx;
    ctx.fillStyle = C.ink900;
    ctx.font = font(700, 44);
    ctx.fillText(fitText(ctx, user.fullName || '', nMax), nx, ay + 84);
    if (user.organization) {
      ctx.fillStyle = C.ink500;
      ctx.font = font(500, 28);
      ctx.fillText(fitText(ctx, user.organization, nMax), nx, ay + 122);
    }
    return encodePng(cv, ctx);
  };
}

export const passFileName = (user) => `${safeName(user.code, 20)}_${safeName(user.fullName)}.png`;

/** Renders one sample ticket to estimate the ZIP size. */
export async function estimateZipBytes(items, { eventName } = {}) {
  if (!items.length) return 0;
  const render = await createTicketRenderer({ eventName });
  const sample = items.slice(0, 3);
  let total = 0;
  for (const it of sample) total += (await render(it.user, it.qrToken)).size;
  const avg = total / sample.length;
  return Math.round(items.length * (avg + 120) + 22); // + local/central headers per entry
}

/**
 * onProgress({ phase: 'render'|'pack', done, total })
 */
export async function generateZip(items, { eventName, signal, onProgress }) {
  const [JSZip, render] = await Promise.all([loadJsZip(), createTicketRenderer({ eventName })]);
  const zip = new JSZip();
  const used = new Set();
  const total = items.length;
  for (let i = 0; i < total; i++) {
    check(signal);
    const { user, qrToken } = items[i];
    let name = passFileName(user);
    for (let k = 2; used.has(name); k++) name = passFileName(user).replace(/\.png$/, `-${k}.png`);
    used.add(name);
    zip.file(name, await render(user, qrToken), { binary: true });
    if ((i + 1) % YIELD_EVERY === 0 || i === total - 1) {
      onProgress?.({ phase: 'render', done: i + 1, total });
      await tick();
    }
  }
  check(signal);
  const parts = [];
  await new Promise((resolve, reject) => {
    // PNGs are already compressed: STORE is much faster and barely larger.
    const h = zip.generateInternalStream({ type: 'uint8array', compression: 'STORE', streamFiles: true });
    let last = 0;
    const onAbort = () => { h.pause(); reject(abortError()); };
    signal?.addEventListener('abort', onAbort, { once: true });
    h.on('data', (chunk, meta) => {
      parts.push(chunk);
      const now = performance.now();
      if (now - last > 120) { last = now; onProgress?.({ phase: 'pack', done: Math.round((meta.percent / 100) * total), total }); }
    })
      .on('error', (e) => { signal?.removeEventListener('abort', onAbort); reject(e); })
      .on('end', () => { signal?.removeEventListener('abort', onAbort); resolve(); })
      .resume();
  });
  onProgress?.({ phase: 'pack', done: total, total });
  return new Blob(parts, { type: 'application/zip' });
}

// ---------- PDF ----------
function qrDataUrl(QRCode, token, canvas) {
  const modules = QRCode.create(token, { errorCorrectionLevel: 'M' }).modules;
  const cell = 6;
  const px = modules.size * cell;
  canvas.width = px; canvas.height = px;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, px, px);
  drawQr(ctx, modules, 0, 0, px);
  return canvas.toDataURL('image/png');
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function clip(doc, text, maxW) {
  if (doc.getTextWidth(text) <= maxW) return text;
  let t = text;
  while (t.length > 1 && doc.getTextWidth(`${t}...`) > maxW) t = t.slice(0, -1);
  return `${t}...`;
}

function drawSinglePass(doc, { user, qr }, eventName) {
  const x = 30, y = 24, w = 150, h = 249;
  doc.setDrawColor(...hex(C.slate200));
  doc.setLineWidth(0.4);
  doc.roundedRect(x, y, w, h, 6, 6, 'S');
  doc.setFillColor(...hex(C.brand600));
  doc.roundedRect(x, y, w, 42, 6, 6, 'F');
  doc.rect(x, y + 30, w, 12, 'F');
  doc.setTextColor(...hex(C.brand200));
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('ENTRY PASS', x + 10, y + 13);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.text(BRAND, x + 10, y + 26);
  if (eventName && eventName.toLowerCase() !== BRAND.toLowerCase()) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(...hex(C.brand200));
    doc.text(clip(doc, eventName, w - 20), x + 10, y + 35);
  }
  const q = 112;
  doc.addImage(qr, 'PNG', (210 - q) / 2, y + 54, q, q, undefined, 'FAST');
  doc.setTextColor(...hex(C.ink900));
  doc.setFont('courier', 'bold');
  doc.setFontSize(24);
  doc.text(user.code || '', 105, y + 182, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...hex(C.ink500));
  doc.text("Show this code if the QR can't be scanned", 105, y + 189, { align: 'center' });
  doc.setLineDashPattern([2, 1.5], 0);
  doc.line(x + 10, y + 198, x + w - 10, y + 198);
  doc.setLineDashPattern([], 0);
  doc.setFontSize(8);
  doc.setTextColor(...hex(C.ink400));
  doc.setFont('helvetica', 'bold');
  doc.text('ATTENDEE', x + 10, y + 210);
  doc.setTextColor(...hex(C.ink900));
  doc.setFontSize(20);
  doc.text(clip(doc, user.fullName || '', w - 20), x + 10, y + 220);
  if (user.organization) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(...hex(C.ink500));
    doc.text(clip(doc, user.organization, w - 20), x + 10, y + 228);
  }
}

const GRID = { cols: 2, rows: 4, m: 10 };
GRID.cw = (210 - GRID.m * 2) / GRID.cols;
GRID.ch = (297 - GRID.m * 2) / GRID.rows;

function drawCutLines(doc) {
  const { m, cw, ch, cols, rows } = GRID;
  doc.setDrawColor(...hex(C.slate200));
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([1.5, 1.5], 0);
  for (let c = 0; c <= cols; c++) doc.line(m + c * cw, m - 4, m + c * cw, 297 - m + 4);
  for (let r = 0; r <= rows; r++) doc.line(m - 4, m + r * ch, 210 - m + 4, m + r * ch);
  doc.setLineDashPattern([], 0);
}

function drawGridPass(doc, { user, qr }, slot) {
  const { m, cw, ch, cols } = GRID;
  const x = m + (slot % cols) * cw;
  const y = m + Math.floor(slot / cols) * ch;
  doc.setFillColor(...hex(C.brand600));
  doc.roundedRect(x + 4, y + 4, cw - 8, 11, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(BRAND.toUpperCase(), x + 7, y + 11.4);
  doc.setTextColor(...hex(C.brand200));
  doc.setFontSize(6.5);
  doc.text('ENTRY PASS', x + cw - 7, y + 11.2, { align: 'right' });

  const q = 46;
  doc.addImage(qr, 'PNG', x + 4, y + 18.5, q, q, undefined, 'FAST');
  const tx = x + 4 + q + 3;
  const tw = x + cw - 5 - tx;
  doc.setTextColor(...hex(C.ink400));
  doc.setFontSize(6);
  doc.text('ATTENDEE', tx, y + 24);
  doc.setTextColor(...hex(C.ink900));
  doc.setFontSize(11.5);
  let ty = y + 29.5;
  const nameLines = doc.splitTextToSize(user.fullName || '', tw).slice(0, 3);
  for (const l of nameLines) { doc.text(l, tx, ty); ty += 4.8; }
  if (user.organization) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...hex(C.ink500));
    for (const l of doc.splitTextToSize(user.organization, tw).slice(0, 2)) { doc.text(l, tx, ty + 0.5); ty += 3.8; }
  }
  doc.setTextColor(...hex(C.ink900));
  doc.setFont('courier', 'bold');
  doc.setFontSize(10.5);
  doc.text(clip(doc, user.code || '', tw), tx, y + 18.5 + q - 1.5);
}

export async function generatePdf(items, { layout = 'grid', eventName, signal, onProgress }) {
  const [JsPDF, QRCode] = await Promise.all([loadJsPdf(), loadQrcode()]);
  const doc = new JsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
  doc.setProperties({ title: `${BRAND} passes`, creator: BRAND });
  const qrCanvas = document.createElement('canvas');
  const per = layout === 'single' ? 1 : GRID.cols * GRID.rows;
  const total = items.length;
  for (let i = 0; i < total; i++) {
    check(signal);
    const slot = i % per;
    if (i > 0 && slot === 0) doc.addPage();
    const it = { user: items[i].user, qr: qrDataUrl(QRCode, items[i].qrToken, qrCanvas) };
    if (layout === 'single') drawSinglePass(doc, it, eventName);
    else {
      if (slot === 0) drawCutLines(doc);
      drawGridPass(doc, it, slot);
    }
    if ((i + 1) % YIELD_EVERY === 0 || i === total - 1) {
      onProgress?.({ phase: 'render', done: i + 1, total });
      await tick();
    }
  }
  check(signal);
  onProgress?.({ phase: 'pack', done: total, total });
  await tick();
  return doc.output('blob');
}

// ---------- Excel ----------
export async function generateXlsx(items, { includeToken, signal, onProgress }) {
  const XLSX = await loadXlsx();
  const head = ['Code', 'Full Name', 'Email', 'Phone', 'Organization', 'Status', 'Checked In', 'Batch', 'Registered At', 'Pass Link'];
  if (includeToken) head.push('QR Token');
  const aoa = [head];
  const origin = location.origin;
  const total = items.length;
  for (let i = 0; i < total; i++) {
    check(signal);
    const { user: u, qrToken } = items[i];
    const row = [
      u.code || '', u.fullName || '', u.email || '', u.phone || '', u.organization || '',
      u.status || 'active', u.checkedIn ? 'Yes' : 'No', u.batchId || (u.source === 'self' ? 'Self-registered' : ''),
      u.createdAt ? new Date(u.createdAt) : '', `${origin}/pass/${u.id}`,
    ];
    if (includeToken) row.push(qrToken || '');
    aoa.push(row);
    if ((i + 1) % 500 === 0) { onProgress?.({ phase: 'render', done: i + 1, total }); await tick(); }
  }
  onProgress?.({ phase: 'pack', done: total, total });
  await tick();
  const ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: 'yyyy-mm-dd hh:mm' });
  ws['!cols'] = [12, 26, 30, 16, 26, 10, 11, 18, 18, 46, ...(includeToken ? [80] : [])].map((wch) => ({ wch }));
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: head.length - 1 } }) };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Passes');
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array', compression: true });
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
