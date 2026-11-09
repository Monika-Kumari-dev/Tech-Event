// Hand-rolled responsive SVG bar chart of check-ins per hour (last 12 hours, local time).
import { useEffect, useMemo, useRef, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { fmt, hourLabel } from './common.jsx';
import { toMs } from '../shared.jsx';

const HOUR = 3_600_000;
const HEIGHT = 260;
const PAD = { top: 22, right: 8, bottom: 30, left: 40 };

/** Buckets the API's hourly rows into the last `hours` local hours (oldest → current). */
export function useHourlyBuckets(hourly, hours = 12) {
  return useMemo(() => {
    const map = new Map();
    for (const h of hourly || []) {
      const ms = toMs(h.hour);
      if (ms == null) continue;
      const k = Math.floor(ms / HOUR);
      map.set(k, (map.get(k) || 0) + (h.count || 0));
    }
    const cur = Math.floor(Date.now() / HOUR);
    return Array.from({ length: hours }, (_, i) => {
      const k = cur - (hours - 1) + i;
      return { k, start: k * HOUR, count: map.get(k) || 0, current: i === hours - 1 };
    });
  }, [hourly, hours]);
}

function niceTicks(max) {
  if (max <= 4) return [0, 1, 2, 3, 4];
  const raw = max / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const m = raw / p;
  const step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
  const top = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

function compact(n) {
  return n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k` : String(n);
}

/** Bar path with rounded top corners only. */
function barPath(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

export default function HourlyChart({ buckets }) {
  const wrap = useRef(null);
  const [width, setWidth] = useState(720);
  const [hover, setHover] = useState(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const max = Math.max(0, ...buckets.map((b) => b.count));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const total = buckets.reduce((a, b) => a + b.count, 0);

  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const band = plotW / buckets.length;
  const barW = Math.min(44, band * 0.62);
  const every = band < 52 ? 2 : 1;
  const y = (v) => PAD.top + plotH - (v / top) * plotH;
  const hb = hover != null ? buckets[hover] : null;

  return (
    <div ref={wrap} className="relative w-full" style={{ height: HEIGHT }}>
      <svg width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} role="img"
        aria-label={`Check-ins per hour, last ${buckets.length} hours: ${fmt(total)} total`} className="block overflow-visible"
        onMouseLeave={() => setHover(null)}>
        {/* gridlines + y ticks */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)}
              className={t === 0 ? 'stroke-slate-300' : 'stroke-slate-100'} strokeWidth="1" shapeRendering="crispEdges" />
            <text x={PAD.left - 10} y={y(t)} dy="0.32em" textAnchor="end" className="fill-ink-400 text-[11px] tabular-nums">{compact(t)}</text>
          </g>
        ))}

        {buckets.map((b, i) => {
          const cx = PAD.left + band * i + band / 2;
          const h = b.count ? Math.max(3, (b.count / top) * plotH) : 0;
          const active = hover === i;
          const label = hourLabel(b.start);
          return (
            <g key={b.k} tabIndex={0} role="button" className="outline-none group"
              aria-label={`${label} to ${hourLabel(b.start + HOUR)}: ${fmt(b.count)} check-ins`}
              onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)}>
              {/* hover / current-hour band */}
              <rect x={PAD.left + band * i + 2} y={PAD.top - 6} width={band - 4} height={plotH + 6} rx="8"
                className={active ? 'fill-brand-50' : b.current ? 'fill-slate-50' : 'fill-transparent'} />
              {h > 0 && (
                <path d={barPath(cx - barW / 2, y(0) - h, barW, h, 6)}
                  className={active || b.current ? 'fill-brand-600' : 'fill-brand-500'}
                  style={{ transition: 'd 0.5s ease' }} />
              )}
              {b.count > 0 && (
                <text x={cx} y={y(0) - h - 7} textAnchor="middle" className="fill-ink-700 text-[11px] font-semibold tabular-nums">{fmt(b.count)}</text>
              )}
              {(i % every === (buckets.length - 1) % every) && (
                <text x={cx} y={HEIGHT - 9} textAnchor="middle"
                  className={b.current ? 'fill-brand-700 text-[11px] font-bold' : 'fill-ink-400 text-[11px]'}>
                  {label}
                </text>
              )}
              <rect x={PAD.left + band * i} y={0} width={band} height={HEIGHT} fill="transparent" />
              <rect x={cx - barW / 2 - 3} y={PAD.top - 4} width={barW + 6} height={plotH + 8} rx="10" fill="none"
                className="stroke-brand-500 opacity-0 group-focus-visible:opacity-100" strokeWidth="2" />
            </g>
          );
        })}
      </svg>

      {hb && (
        <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg bg-ink-900 px-2.5 py-1.5 text-xs text-white shadow-lg whitespace-nowrap"
          style={{
            left: Math.min(width - 70, Math.max(70, PAD.left + band * hover + band / 2)),
            top: Math.max(40, y(hb.count) - (hb.count ? 26 : 8)),
          }}>
          <p className="font-medium text-white/70">{hourLabel(hb.start)} – {hourLabel(hb.start + HOUR)}{hb.current ? ' (now)' : ''}</p>
          <p className="font-bold tabular-nums">{fmt(hb.count)} check-in{hb.count === 1 ? '' : 's'}</p>
        </div>
      )}

      {total === 0 && (
        <div className="pointer-events-none absolute inset-x-0 grid place-items-center" style={{ top: PAD.top, height: plotH }}>
          <div className="flex items-center gap-3 rounded-xl bg-white/90 px-4 py-3 ring-1 ring-slate-900/5 shadow-sm">
            <span className="grid place-items-center size-9 rounded-xl bg-slate-100 text-ink-400"><BarChart3 className="size-4" /></span>
            <div className="text-left">
              <p className="text-sm font-semibold text-ink-900">No check-ins in this window</p>
              <p className="text-xs text-ink-500">Bars appear as gates sync their scans.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
