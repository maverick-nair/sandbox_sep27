// Building blocks for the learner and group reports. Plain SVG and CSS so a report can be saved
// as one standalone HTML file that looks the same as it does on screen.
export const LEVEL_TONES = ['novice', 'emerging', 'competent', 'proficient', 'rolemodel'];
export const LEVEL_SHORT = ['N', 'E', 'C', 'P', 'R'];
export const IMPACTS = [['High', 'high'], ['Moderate', 'moderate'], ['Low', 'low'], ['Very low', 'verylow'], ['No', 'none']];
export const impactTone = (i) => (IMPACTS.find(([k]) => k === i) || IMPACTS[4])[1];
export const pct = (v, d = 0) => (v === null || v === undefined ? 'n/a' : `${(v * 100).toFixed(d)}%`);
export const bandIndex = (score) => (score <= 2 ? 0 : score <= 4 ? 1 : score <= 6 ? 2 : score <= 8 ? 3 : 4);

export function Section({ n, id, title, intro, children, className = '' }) {
  return (
    <section className={`rp-section ${className}`} id={id ? `rp-${id}` : undefined} aria-labelledby={id ? `rp-h-${id}` : undefined}>
      <header className="rp-section-head">
        {n !== undefined && <span className="rp-num">#{n}</span>}
        <h2 id={id ? `rp-h-${id}` : undefined}>{title}</h2>
      </header>
      {intro && (Array.isArray(intro) ? intro.map((p, i) => <p key={i} className="rp-intro">{p}</p>) : <p className="rp-intro">{intro}</p>)}
      {children}
    </section>
  );
}

export function Defs({ items }) {
  return <dl className="rp-defs">{items.filter((x) => x[1]).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

export function Note({ items, title = 'For discussion' }) {
  const list = [].concat(items || []).filter(Boolean);
  if (!list.length) return null;
  return (
    <aside className="rp-note">
      <strong className="rp-note-title">{title}</strong>
      {list.length === 1 ? <p>{list[0]}</p> : <ul>{list.map((t, i) => <li key={i}>{t}</li>)}</ul>}
    </aside>
  );
}

export function LevelScale({ bands }) {
  return (
    <div className="rp-scale" role="img" aria-label={`Proficiency scale: ${bands.map((b) => `${b.label} ${b.min} to ${b.max}`).join(', ')}`}>
      {bands.map((b, i) => (
        <div key={b.label} className={`rp-scale-step lv-${LEVEL_TONES[i]}`}>
          <span className="rp-scale-dot">{LEVEL_SHORT[i]}</span>
          <span className="rp-scale-label">{b.label}</span>
          <span className="rp-scale-range">{b.min} to {b.max}</span>
        </div>
      ))}
    </div>
  );
}

export function LevelChip({ index, label }) {
  return <span className={`rp-chip lv-${LEVEL_TONES[index]}`}>{label}</span>;
}

// A 0 to 10 score dial.
export function ScoreDial({ score, index, size = 76 }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(10, score)) / 10;
  return (
    <svg className={`rp-dial lv-${LEVEL_TONES[index]}`} width={size} height={size} viewBox="0 0 76 76" role="img" aria-label={`${score} out of 10`}>
      <circle cx="38" cy="38" r={r} className="rp-dial-track" />
      <circle cx="38" cy="38" r={r} className="rp-dial-fill" strokeDasharray={`${c * v} ${c}`} transform="rotate(-90 38 38)" />
      <text x="38" y="44" textAnchor="middle" className="rp-dial-text">{Number.isInteger(score) ? score : score.toFixed(1)}</text>
    </svg>
  );
}

export function Donut({ value, size = 150, label, tone = 'accent', sub }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <figure className="rp-donut">
      <svg width={size} height={size} viewBox="0 0 140 140" role="img" aria-label={`${label || ''} ${pct(value, 1)}`}>
        <circle cx="70" cy="70" r={r} className="rp-donut-track" />
        <circle cx="70" cy="70" r={r} className={`rp-donut-fill tone-${tone}`} strokeDasharray={`${c * v} ${c}`} transform="rotate(-90 70 70)" />
        <text x="70" y="77" textAnchor="middle" className="rp-donut-text">{pct(value, v >= 1 || v === 0 ? 0 : 1)}</text>
      </svg>
      {label && <figcaption><strong>{label}</strong>{sub && <span className="rp-muted"> {sub}</span>}</figcaption>}
    </figure>
  );
}

// Actual against target on one track, with the target marked.
export function TargetBar({ actual, target, format, actualLabel = 'Achieved', targetLabel = 'Target' }) {
  const max = Math.max(actual, target) * 1.08 || 1;
  const a = (actual / max) * 100;
  const t = (target / max) * 100;
  return (
    <div className="rp-target" role="img" aria-label={`${actualLabel} ${format(actual)} against ${targetLabel.toLowerCase()} ${format(target)}`}>
      <div className="rp-target-labels">
        <span style={{ left: `${Math.min(a, 88)}%` }} className="rp-target-actual"><span className="rp-muted">{actualLabel}</span><strong>{format(actual)}</strong></span>
      </div>
      <div className="rp-target-track">
        <span className={`rp-target-fill ${actual >= target ? 'met' : ''}`} style={{ width: `${a}%` }} />
        <span className="rp-target-mark" style={{ left: `${t}%` }} />
      </div>
      <div className="rp-target-labels below">
        <span style={{ left: `${Math.min(t, 88)}%` }}><span className="rp-muted">{targetLabel}</span><strong>{format(target)}</strong></span>
      </div>
    </div>
  );
}

// Pairs of horizontal bars (for example initial and final), on a 0 to 100 scale.
export function PairBars({ rows, labels = ['Initial', 'Final'], tones = ['base', 'accent'] }) {
  return (
    <div className="rp-pairs">
      <div className="rp-legend">{labels.map((l, i) => <span key={l}><i className={`rp-key tone-${tones[i]}`} />{l}</span>)}</div>
      {rows.map((r) => (
        <div key={r.label} className="rp-pair">
          <span className="rp-pair-label">{r.label}</span>
          {r.values.map((v, i) => (
            <div key={i} className="rp-pair-row">
              <span className="rp-pair-track"><span className={`rp-pair-fill tone-${tones[i]}`} style={{ width: `${Math.max(0, Math.min(100, v))}%` }} /></span>
              <span className="rp-pair-val">{Math.round(v)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// Vertical bars in groups, one colour per series; values labelled.
export function GroupedBars({ groups, series, max, format = (v) => Math.round(v), height = 180, label }) {
  const top = max || Math.max(1, ...groups.flatMap((g) => g.values)) * 1.15;
  return (
    <figure className="rp-gbars">
      <div className="rp-legend">{series.map((s) => <span key={s.label}><i className={`rp-key tone-${s.tone}`} />{s.label}</span>)}</div>
      <div className="rp-gbars-plot" style={{ height }} role="img" aria-label={label}>
        {groups.map((g) => (
          <div key={g.label} className="rp-gbars-group">
            <div className="rp-gbars-bars">
              {g.values.map((v, i) => (
                <div key={i} className="rp-gbar-col">
                  <span className="rp-gbar-val">{format(v)}</span>
                  <span className={`rp-gbar tone-${series[i].tone}`} style={{ height: `${Math.max(1, (v / top) * 100)}%` }} />
                </div>
              ))}
            </div>
            <span className="rp-gbars-label">{g.label}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}

// A 0 to 100% deviation between two styles, as a gauge between the two labels.
export function Deviation({ from, to, value, bench }) {
  const v = value === null || value === undefined ? null : Math.max(0, Math.min(100, value));
  return (
    <div className="rp-dev" role="img" aria-label={`${from} against ${to}: ${v === null ? 'no measurable action' : `${v}% deviation`}${bench !== undefined && bench !== null ? `, benchmark ${bench}%` : ''}`}>
      <span className="rp-dev-end">{from}</span>
      <div className="rp-dev-track">
        <span className="rp-dev-grad" />
        {v !== null && <span className="rp-dev-mark" style={{ left: `${v}%` }}><span className="rp-dev-val">{v}%</span></span>}
        {bench !== undefined && bench !== null && <span className="rp-dev-bench" style={{ left: `${bench}%` }} title={`Benchmark ${bench}%`} />}
      </div>
      <span className="rp-dev-end">{to}</span>
    </div>
  );
}

// The skill and morale grid: each style sits in its quadrant.
export function StyleGrid({ styles, render }) {
  const place = (s) => `${s.skill === 'high' ? 'top' : 'bottom'}-${s.morale === 'high' ? 'right' : 'left'}`;
  const order = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  const sorted = order.map((p) => styles.find((s) => place(s) === p)).filter(Boolean);
  return (
    <div className="rp-grid4">
      <span className="rp-axis top">High skill</span>
      <span className="rp-axis left">Low morale</span>
      <span className="rp-axis right">High morale</span>
      <span className="rp-axis bottom">Low skill</span>
      <div className="rp-grid4-cells">{sorted.map((s) => <div key={s.id} className={`rp-cell ${place(s)}`}>{render(s)}</div>)}</div>
    </div>
  );
}

export function Meter({ value, color, label }) {
  const v = value === null || value === undefined ? null : Math.max(0, Math.min(1, value));
  return (
    <div className="rp-meter">
      <span className="rp-meter-label">{label}</span>
      <span className="rp-meter-track"><span className="rp-meter-fill" style={{ width: `${(v || 0) * 100}%`, background: color }} /></span>
      <strong className="rp-meter-val">{v === null ? 'n/a' : pct(v)}</strong>
    </div>
  );
}

export function ImpactLegend() {
  return <div className="rp-legend">{IMPACTS.map(([k, t]) => <span key={k}><i className={`rp-key im-${t}`} />{k} impact</span>)}</div>;
}

export function ImpactChip({ impact }) {
  return <span className={`rp-impact im-${impactTone(impact)}`}>{impact}</span>;
}

// Lines over the weeks. One y-axis, labelled end points.
export function Lines({ series, weeks, height = 220, yLabel = 'Conversions' }) {
  const W = 640, H = height, L = 40, R = 44, T = 14, B = 28;
  const max = Math.max(1, ...series.flatMap((s) => s.values)) * 1.1;
  const x = (i) => L + ((W - L - R) * i) / Math.max(1, weeks - 1);
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  return (
    <figure className="rp-lines">
      <div className="rp-legend">{series.map((s) => <span key={s.label}><i className={`rp-key tone-${s.tone} ${s.dash ? 'dash' : ''}`} />{s.label}</span>)}</div>
      <div className="rp-lines-scroll"><svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${yLabel} by week: ${series.map((s) => `${s.label} ends at ${s.values.at(-1)}`).join('; ')}`}>
        {ticks.map((t) => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="rp-gridline" /><text x={L - 6} y={y(t) + 4} textAnchor="end" className="rp-tick">{t}</text></g>)}
        {Array.from({ length: weeks }, (_, i) => (weeks <= 12 || i % 2 === 0) && <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="rp-tick">W{i + 1}</text>)}
        {series.map((s) => (
          <g key={s.label} className={`rp-series tone-${s.tone}`}>
            <polyline points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')} className={`rp-line ${s.dash ? 'dash' : ''}`} />
            {s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3.5" className="rp-pt"><title>{`${s.label}, week ${i + 1}: ${v}`}</title></circle>)}
          </g>
        ))}
        {endLabels(series.map((s) => ({ label: s.values.at(-1), y: y(s.values.at(-1)) + 4 }))).map((e, i) => <text key={i} x={W - R + 8} y={e.y} className="rp-endlabel">{e.label}</text>)}
      </svg></div>
    </figure>
  );
}

// End-of-line labels, nudged apart so close values stay readable.
function endLabels(items, gap = 14) {
  const sorted = items.map((it, i) => ({ ...it, i })).sort((a, b) => a.y - b.y);
  for (let k = 1; k < sorted.length; k++) if (sorted[k].y - sorted[k - 1].y < gap) sorted[k].y = sorted[k - 1].y + gap;
  return sorted.sort((a, b) => a.i - b.i);
}

// Share of time as a donut with a legend.
export function Split({ parts }) {
  const r = 54, c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div className="rp-split">
      <svg width="150" height="150" viewBox="0 0 140 140" role="img" aria-label={parts.map((p) => `${p.label} ${pct(p.value, 1)}`).join(', ')}>
        <circle cx="70" cy="70" r={r} className="rp-donut-track" />
        {parts.map((p) => {
          const len = c * p.value;
          const el = <circle key={p.label} cx="70" cy="70" r={r} className={`rp-split-seg tone-${p.tone}`} strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-off} transform="rotate(-90 70 70)" />;
          off += len;
          return el;
        })}
      </svg>
      <ul className="rp-split-legend">{parts.map((p) => <li key={p.label}><i className={`rp-key tone-${p.tone}`} /><span>{p.label}</span><strong>{pct(p.value, 1)}</strong>{p.note && <span className="rp-muted small">{p.note}</span>}</li>)}</ul>
    </div>
  );
}

export function Columns({ rows, format = (v) => `${v}%`, height = 170, label }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="rp-cols" style={{ height }} role="img" aria-label={label || rows.map((r) => `${r.label} ${format(r.value)}`).join(', ')}>
      {rows.map((r) => (
        <div key={r.label} className="rp-col">
          <span className="rp-col-val">{format(r.value)}</span>
          <span className={`rp-col-bar ${r.tone ? `tone-${r.tone}` : ''}`} style={{ height: `${Math.max(1, (r.value / max) * 100)}%` }} />
          <span className="rp-col-label">{r.label}</span>
        </div>
      ))}
    </div>
  );
}

export function Tile({ label, value, sub, tone }) {
  return <div className={`rp-tile ${tone ? `tone-${tone}` : ''}`}><span className="rp-tile-label">{label}</span><strong className="rp-tile-value">{value}</strong>{sub && <span className="rp-tile-sub">{sub}</span>}</div>;
}
