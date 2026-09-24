// Small SVG chart kit for the balance check and the learner debrief. Thin marks, one axis,
// recessive grid, a legend for two or more series plus direct end labels, and a hover layer on
// every chart. Colours come from the --series-* tokens (validated for colour vision deficiency).
import { useId, useMemo, useRef, useState } from 'react';

export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];

const niceMax = (v) => {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  const n = v / mag;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * mag;
};
const fmt = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}K` : Number.isInteger(v) ? String(v) : v.toFixed(1));

export function Legend({ items }) {
  if (items.length < 2) return null;
  return (
    <div className="chart-legend" role="list">
      {items.map((it) => (
        <span key={it.label} className="chart-legend-item" role="listitem">
          <span className="chart-key" style={{ background: it.color, ...(it.dashed ? { background: 'none', borderTop: `2px dashed ${it.color}`, height: 0 } : {}) }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

// series: [{ label, color, values: number[] }], x labels; reference: { label, value } (horizontal line)
export function LineChart({ series, xLabels, reference, height = 220, yLabel, format = fmt, title }) {
  const w = 640;
  const pad = { l: 44, r: 90, t: 12, b: 28 };
  const ref = useRef(null);
  const [hover, setHover] = useState(null);
  const max = niceMax(Math.max(reference?.value || 0, ...series.flatMap((s) => s.values)) * 1.05);
  const n = Math.max(...series.map((s) => s.values.length), 1);
  const X = (i) => pad.l + (n === 1 ? 0 : (i / (n - 1)) * (w - pad.l - pad.r));
  const Y = (v) => pad.t + (1 - v / max) * (height - pad.t - pad.b);
  const ticks = [0, max / 4, max / 2, (3 * max) / 4, max];
  const onMove = (e) => {
    const r = ref.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * w;
    const i = Math.round(((x - pad.l) / (w - pad.l - pad.r)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  // End labels, nudged apart only when they would overlap.
  const ends = series.map((s) => ({ s, y: Y(s.values.at(-1) ?? 0) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
  return (
    <figure className="chart" aria-label={title}>
      <Legend items={[...series.map((s) => ({ label: s.label, color: s.color })), ...(reference ? [{ label: reference.label, color: 'var(--ink)', dashed: true }] : [])]} />
      <div className="chart-box">
        <svg ref={ref} viewBox={`0 0 ${w} ${height}`} role="img" aria-label={title} onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ width: '100%', height: 'auto', display: 'block' }}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={w - pad.r} y1={Y(t)} y2={Y(t)} className="chart-grid" />
              <text x={pad.l - 6} y={Y(t) + 4} textAnchor="end" className="chart-tick">{format(t)}</text>
            </g>
          ))}
          {xLabels.map((l, i) => (n <= 12 || i % Math.ceil(n / 12) === 0) && <text key={i} x={X(i)} y={height - 8} textAnchor="middle" className="chart-tick">{l}</text>)}
          {yLabel && <text x={4} y={pad.t + 2} className="chart-tick" dominantBaseline="hanging">{yLabel}</text>}
          {reference && (
            <g>
              <line x1={pad.l} x2={w - pad.r} y1={Y(reference.value)} y2={Y(reference.value)} stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.7" />
            </g>
          )}
          {series.map((s) => (
            <polyline key={s.label} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={s.values.map((v, i) => `${X(i)},${Y(v)}`).join(' ')} />
          ))}
          {series.map((s) => s.values.length > 0 && <circle key={`${s.label}-end`} cx={X(s.values.length - 1)} cy={Y(s.values.at(-1))} r="4" fill={s.color} stroke="var(--surface)" strokeWidth="2" />)}
          {ends.map(({ s, y }) => <text key={`${s.label}-lbl`} x={X(s.values.length - 1) + 8} y={y + 4} className="chart-label">{s.label}</text>)}
          {reference && <text x={w - pad.r + 8} y={Y(reference.value) + 4} className="chart-label muted">{reference.label}</text>}
          {hover !== null && (
            <g>
              <line x1={X(hover)} x2={X(hover)} y1={pad.t} y2={height - pad.b} stroke="var(--line-strong)" strokeWidth="1" />
              {series.map((s) => s.values[hover] !== undefined && <circle key={s.label} cx={X(hover)} cy={Y(s.values[hover])} r="4.5" fill={s.color} stroke="var(--surface)" strokeWidth="2" />)}
            </g>
          )}
        </svg>
        {hover !== null && (
          <div className="chart-tip" style={{ left: `${(X(hover) / w) * 100}%` }}>
            <strong>{xLabels[hover]}</strong>
            {series.map((s) => s.values[hover] !== undefined && <span key={s.label}><i style={{ background: s.color }} />{s.label}: {format(s.values[hover])}</span>)}
            {reference && <span><i style={{ background: 'var(--ink)' }} />{reference.label}: {format(reference.value)}</span>}
          </div>
        )}
      </div>
    </figure>
  );
}

// bins: [{ label, value, highlight? }] as columns; marker: index of "you".
export function Histogram({ bins, height = 150, title, valueLabel = 'runs', marker, markerLabel = 'You' }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...bins.map((b) => b.value));
  const w = 640;
  const pad = { l: 8, r: 8, t: 18, b: 26 };
  const bw = (w - pad.l - pad.r) / bins.length;
  const bar = Math.min(24, bw - 4);
  const H = height - pad.t - pad.b;
  return (
    <figure className="chart" aria-label={title}>
      <div className="chart-box">
        <svg viewBox={`0 0 ${w} ${height}`} role="img" aria-label={title} style={{ width: '100%', height: 'auto', display: 'block' }} onMouseLeave={() => setHover(null)}>
          <line x1={pad.l} x2={w - pad.r} y1={pad.t + H} y2={pad.t + H} className="chart-grid" />
          {bins.map((b, i) => {
            const h = (b.value / max) * H;
            const x = pad.l + i * bw + (bw - bar) / 2;
            return (
              <g key={i} onMouseEnter={() => setHover(i)}>
                <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H} fill="transparent" />
                {b.value > 0 && <path d={`M${x},${pad.t + H} v${-Math.max(0, h - 4)} q0,-4 4,-4 h${bar - 8} q4,0 4,4 v${Math.max(0, h - 4)} z`} fill={b.highlight ? 'var(--series-2)' : 'var(--series-1)'} opacity={hover === null || hover === i ? 1 : 0.55} />}
                {(i % Math.ceil(bins.length / 10) === 0 || i === bins.length - 1) && <text x={pad.l + i * bw + bw / 2} y={height - 8} textAnchor="middle" className="chart-tick">{b.label}</text>}
              </g>
            );
          })}
          {marker !== undefined && marker !== null && (
            <g>
              <line x1={pad.l + marker * bw + bw / 2} x2={pad.l + marker * bw + bw / 2} y1={pad.t - 4} y2={pad.t + H} stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="4 3" />
              <text x={pad.l + marker * bw + bw / 2} y={pad.t - 6} textAnchor="middle" className="chart-label">{markerLabel}</text>
            </g>
          )}
        </svg>
        {hover !== null && <div className="chart-tip" style={{ left: `${((pad.l + hover * bw + bw / 2) / w) * 100}%` }}><strong>{bins[hover].label}</strong><span>{bins[hover].value} {valueLabel}</span></div>}
      </div>
    </figure>
  );
}

// Horizontal bars: rows [{ label, value (0 to max), note?, color? }]
export function BarList({ rows, max = 100, format = (v) => String(Math.round(v)), title }) {
  const [hover, setHover] = useState(null);
  return (
    <div className="barlist" role="list" aria-label={title}>
      {rows.map((r, i) => (
        <div key={r.label} className="barlist-row" role="listitem" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} title={r.note || undefined}>
          <span className="barlist-label">{r.label}</span>
          <span className="barlist-track"><span className="barlist-fill" style={{ width: `${Math.max(1, Math.min(100, (r.value / max) * 100))}%`, background: r.color || 'var(--series-1)', opacity: hover === null || hover === i ? 1 : 0.6 }} /></span>
          <span className="barlist-value num">{format(r.value)}</span>
          {hover === i && r.note && <span className="barlist-note">{r.note}</span>}
        </div>
      ))}
    </div>
  );
}

// Dots on a 0 to 100 line, one row per group: rows [{ label, color, points: [{ value, label }] }]
export function DotStrip({ rows, title, max = 100, markers = [] }) {
  const [hover, setHover] = useState(null);
  const uid = useId();
  const w = 640;
  const pad = { l: 150, r: 20 };
  const X = (v) => pad.l + (Math.min(v, max) / max) * (w - pad.l - pad.r);
  const rowH = 30;
  const h = rows.length * rowH + 24;
  const jitter = useMemo(() => rows.map((r) => r.points.map((_, i) => ((i * 37) % 11) / 11 - 0.5)), [rows]);
  return (
    <figure className="chart" aria-label={title}>
      <Legend items={rows.map((r) => ({ label: r.label, color: r.color }))} />
      <div className="chart-box">
        <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={title} style={{ width: '100%', height: 'auto', display: 'block' }} onMouseLeave={() => setHover(null)}>
          {[0, 25, 50, 75, 100].filter((t) => t <= max).map((t) => (
            <g key={t}><line x1={X(t)} x2={X(t)} y1={4} y2={h - 20} className="chart-grid" /><text x={X(t)} y={h - 6} textAnchor="middle" className="chart-tick">{t}</text></g>
          ))}
          {markers.map((m) => <g key={m.label}><line x1={X(m.value)} x2={X(m.value)} y1={0} y2={h - 20} stroke="var(--ink)" strokeDasharray="4 3" strokeWidth="1.5" opacity="0.7" /><text x={X(m.value) + 4} y={10} className="chart-label muted">{m.label}</text></g>)}
          {rows.map((r, ri) => (
            <g key={`${uid}-${r.label}`}>
              <text x={pad.l - 10} y={ri * rowH + rowH / 2 + 8} textAnchor="end" className="chart-label">{r.label}</text>
              {r.points.map((p, pi) => (
                <circle key={pi} cx={X(p.value)} cy={ri * rowH + rowH / 2 + 4 + jitter[ri][pi] * 10} r={hover && hover.r === ri && hover.p === pi ? 6 : 4.5} fill={r.color} stroke="var(--surface)" strokeWidth="2" opacity={0.85} onMouseEnter={() => setHover({ r: ri, p: pi })} />
              ))}
            </g>
          ))}
        </svg>
        {hover && <div className="chart-tip" style={{ left: `${(X(rows[hover.r].points[hover.p].value) / w) * 100}%`, top: `${((hover.r * rowH) / h) * 100}%` }}><strong>{rows[hover.r].label}</strong><span>{rows[hover.r].points[hover.p].label || Math.round(rows[hover.r].points[hover.p].value)}</span></div>}
      </div>
    </figure>
  );
}

// A ring for a single headline number (0 to 100).
export function Ring({ value, size = 120, label, sub }) {
  const r = size / 2 - 8;
  const c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={`${label}: ${Math.round(value)}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--accent)" strokeWidth="8" strokeLinecap="round" strokeDasharray={`${(Math.max(0, Math.min(100, value)) / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} className="ring-fill" />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="ring-value">{Math.round(value)}</text>
      </svg>
      {label && <div className="ring-label">{label}</div>}
      {sub && <div className="small muted">{sub}</div>}
    </div>
  );
}
