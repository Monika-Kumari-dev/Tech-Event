// SVG donut of checked-in vs registered.
import { cx } from '../../../components/ui.jsx';
import { fmt } from './common.jsx';

export default function ArrivalDonut({ checkedIn, total, size = 188, stroke = 18 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = total ? Math.min(1, checkedIn / total) : 0;
  const p = total ? Math.round(ratio * 1000) / 10 : 0;
  // Keep a visible sliver for tiny non-zero values.
  const dash = checkedIn > 0 ? Math.max(c * ratio, 4) : 0;
  return (
    <div className="relative mx-auto" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img"
        aria-label={`${fmt(checkedIn)} of ${fmt(total)} checked in (${p}%)`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-slate-100" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round"
          className={cx('stroke-success-500', 'transition-[stroke-dasharray] duration-700')}
          strokeDasharray={`${dash} ${c}`} />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <p className="text-3xl font-extrabold tracking-tight tabular-nums text-ink-900">{p}%</p>
          <p className="text-xs font-medium text-ink-500 mt-0.5">checked in</p>
          <p className="text-xs text-ink-400 tabular-nums mt-1">{fmt(checkedIn)} / {fmt(total)}</p>
        </div>
      </div>
    </div>
  );
}
