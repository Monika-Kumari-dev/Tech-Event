// Draws the pass as a shareable PNG ticket (event, QR, name, code, photo).
import { loadSrc } from '../../lib/image.js';

const W = 900;
const H = 1480;
const C = {
  brand600: '#c92127',
  brand900: '#102642',
  brand200: '#f8d88d',
  ink900: '#0f172a',
  ink500: '#64748b',
  slate200: '#e2e8f0',
  bg: '#f1f5f9',
  success: '#10b981',
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

const font = (weight, size, family = 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif') =>
  `${weight} ${size}px ${family}`;
const mono = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

/**
 * @param {{ qrCanvas: HTMLCanvasElement, user: object, eventName: string }} opts
 * @returns {Promise<Blob>}
 */
export async function renderTicketPng({ qrCanvas, user, eventName }) {
  if (!qrCanvas) throw new Error('QR not ready');
  if (document.fonts?.ready) await document.fonts.ready.catch(() => {});

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Backdrop
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, W, H);

  // Ticket body
  const tx = 50, ty = 50, tw = W - 100, th = H - 100, r = 48;
  ctx.save();
  ctx.shadowColor = 'rgba(15,23,42,0.12)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 12;
  roundRect(ctx, tx, ty, tw, th, r);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();

  // Header band
  const headH = 220;
  ctx.save();
  roundRect(ctx, tx, ty, tw, th, r);
  ctx.clip();
  const g = ctx.createLinearGradient(tx, ty, tx + tw, ty + headH);
  g.addColorStop(0, C.brand600);
  g.addColorStop(1, C.brand900);
  ctx.fillStyle = g;
  ctx.fillRect(tx, ty, tw, headH);
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.arc(tx + tw - 40, ty + 10, 150, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = C.brand200;
  ctx.font = font(600, 24);
  ctx.fillText('ENTRY PASS', tx + 56, ty + 82);
  ctx.fillStyle = '#ffffff';
  ctx.font = font(800, 52);
  ctx.fillText(fitText(ctx, eventName || 'Namma Honda Habba', tw - 112), tx + 56, ty + 152);

  // Perforation notches
  ctx.fillStyle = C.bg;
  ctx.beginPath(); ctx.arc(tx, ty + headH, 26, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(tx + tw, ty + headH, 26, 0, Math.PI * 2); ctx.fill();

  // QR
  const qrSize = 620;
  const qx = (W - qrSize) / 2;
  const qy = ty + headH + 60;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(qx - 30, qy - 30, qrSize + 60, qrSize + 60); // quiet zone
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrCanvas, qx, qy, qrSize, qrSize);
  ctx.imageSmoothingEnabled = true;

  // Code
  ctx.textAlign = 'center';
  ctx.fillStyle = C.ink900;
  ctx.font = font(700, 54, mono);
  ctx.fillText(user.code || '', W / 2, qy + qrSize + 100);
  ctx.fillStyle = C.ink500;
  ctx.font = font(500, 24);
  ctx.fillText('Show this code if the QR can’t be scanned', W / 2, qy + qrSize + 145);
  ctx.textAlign = 'left';

  // Dashed divider
  const dy = qy + qrSize + 195;
  ctx.strokeStyle = C.slate200;
  ctx.lineWidth = 4;
  ctx.setLineDash([16, 12]);
  ctx.beginPath(); ctx.moveTo(tx + 56, dy); ctx.lineTo(tx + tw - 56, dy); ctx.stroke();
  ctx.setLineDash([]);

  // Attendee row
  const ay = dy + 50;
  const av = 120;
  const ax = tx + 56;
  ctx.save();
  ctx.beginPath();
  ctx.arc(ax + av / 2, ay + av / 2, av / 2, 0, Math.PI * 2);
  ctx.clip();
  let drewPhoto = false;
  if (user.photo) {
    try {
      const img = await loadSrc(user.photo);
      ctx.drawImage(img, ax, ay, av, av);
      drewPhoto = true;
    } catch { /* fall back to initials */ }
  }
  if (!drewPhoto) {
    ctx.fillStyle = '#e0e7ff';
    ctx.fillRect(ax, ay, av, av);
    ctx.fillStyle = '#4338ca';
    ctx.font = font(700, 46);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const initials = (user.fullName || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();
    ctx.fillText(initials, ax + av / 2, ay + av / 2 + 2);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();

  const nx = ax + av + 32;
  const nMax = tx + tw - 56 - nx;
  ctx.fillStyle = '#94a3b8';
  ctx.font = font(600, 22);
  ctx.fillText('ATTENDEE', nx, ay + 34);
  ctx.fillStyle = C.ink900;
  ctx.font = font(700, 44);
  ctx.fillText(fitText(ctx, user.fullName || '', nMax), nx, ay + 84);
  if (user.organization) {
    ctx.fillStyle = C.ink500;
    ctx.font = font(500, 28);
    ctx.fillText(fitText(ctx, user.organization, nMax), nx, ay + 122);
  }

  ctx.fillStyle = C.ink500;
  ctx.font = font(600, 22);
  ctx.fillText(`Family pass: ${1 + (user.adults?.length || 0) + (user.kids?.length || 0)} guests · ${(user.adults?.length || 0)} additional adults · ${(user.kids?.length || 0)} kids`, tx + 56, ty + th - 85);
  ctx.font = font(500, 20);
  ctx.fillText('Service provider: TechfluenceX', tx + 56, ty + th - 45);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), 'image/png');
  });
}
