// The learner's app shell: a sidebar with the simulation's sections, a top bar, and a main area
// that leads with a hero (a big headline, the character or product the moment is about, and the
// numbers that matter), view tabs and a progress strip. Used for the briefing, the workspace and
// the debrief so the whole simulation reads as one product.
import { useState } from 'react';
import { renderText } from '../engine/text.js';
import { Icon, Logo, sceneBackground } from './art.jsx';
import { Face } from './look.jsx';

const T = (def, s, v) => renderText(def, s || '', v);

export function Shell({ def, nav, active, onNav, top, sideCard, children, className = '', label = 'Simulation' }) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState({});
  const brand = def.look?.brand;
  return (
    <div className={`nx ${className}`} style={{ ...(brand ? { '--nx-accent': brand } : {}), background: shellBackground(def.look) }}>
      <aside className={`nx-side ${open ? 'open' : ''}`} aria-label={label}>
        <div className="nx-brand">
          <Logo def={def} look={def.look} size={36} />
          <div className="nx-brand-text"><strong>{T(def, '{{company}}')}</strong><span>{def.meta?.name?.split(':')[0] || 'Simulation'}</span></div>
          <button type="button" className="nx-side-close" aria-label="Close menu" onClick={() => setOpen(false)}><Icon name="arrowLeft" /></button>
        </div>
        <nav className="nx-nav">
          {nav.map((g, gi) => (
            <div key={gi} className="nx-nav-group">
              {g.label && <span className="nx-nav-label">{g.label}</span>}
              {g.items.map((it) => (
                <div key={it.id}>
                  <button type="button" className={`nx-nav-item ${active === it.id || (it.sub && it.sub.some((x) => x.id === active)) ? 'on' : ''} ${it.done ? 'done' : ''} ${it.className || ''}`} disabled={it.disabled} aria-current={active === it.id ? 'page' : undefined} aria-expanded={it.sub ? !!(expanded[it.id] ?? it.expanded) : undefined}
                    onClick={() => { if (it.sub) { setExpanded((e) => ({ ...e, [it.id]: !(e[it.id] ?? it.expanded) })); return; } setOpen(false); (it.onClick || (() => onNav?.(it.id)))(); }} title={it.title}>
                    <Icon name={it.icon || 'star'} size={18} />
                    <span className="grow">{it.label}</span>
                    {it.badge ? <span className="nx-badge">{it.badge}</span> : it.done ? <Icon name="check" size={14} className="nx-done" /> : it.sub ? <span className={`nx-caret ${(expanded[it.id] ?? it.expanded) ? 'open' : ''}`} aria-hidden="true">›</span> : null}
                  </button>
                  {it.sub && (expanded[it.id] ?? it.expanded) && (
                    <div className="nx-sub">
                      {it.sub.map((s) => <button key={s.id} type="button" className={`nx-sub-item ${active === s.id ? 'on' : ''}`} disabled={s.disabled} title={s.title} onClick={() => { setOpen(false); (s.onClick || (() => onNav?.(s.id)))(); }}><span className="nx-sub-dot" aria-hidden="true" />{s.label}{s.meta && <span className="nx-sub-meta">{s.meta}</span>}</button>)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </nav>
        {sideCard && <div className="nx-side-card">{sideCard}</div>}
      </aside>
      {open && <button type="button" className="nx-scrim" aria-label="Close menu" onClick={() => setOpen(false)} />}
      <div className="nx-main">
        <header className="nx-top">
          <button type="button" className="nx-menu" aria-label="Open menu" onClick={() => setOpen(true)}><Icon name="menu" /></button>
          {top}
        </header>
        <div className="nx-content">{children}</div>
      </div>
    </div>
  );
}

// The background behind every screen: the author's image or a scene, darkened so text reads.
export function shellBackground(look = {}) {
  const dim = Math.max(0.4, Math.min(0.96, look.bgDim ?? 0.84));
  const glow = 'radial-gradient(900px 500px at 70% -10%, color-mix(in srgb, var(--nx-accent) 16%, transparent), transparent 70%)';
  const shade = `linear-gradient(180deg, rgba(10,11,16,${dim - 0.06}), rgba(10,11,16,${dim}))`;
  if (look.bgMode === 'plain') return `${glow}, var(--bg)`;
  const img = look.sceneImage ? `url("${look.sceneImage}") center / cover no-repeat` : sceneBackground(look.scene || 'boardroom');
  return `${glow}, ${shade}, ${img}, var(--bg)`;
}

export function TopChip({ icon, children, className = '', onClick, title, tone }) {
  const Tag = onClick ? 'button' : 'span';
  const label = typeof children === 'string' ? children : undefined;
  return <Tag type={onClick ? 'button' : undefined} className={`nx-chip ${tone ? `tone-${tone}` : ''} ${className}`} onClick={onClick} title={title || label} aria-label={onClick ? label : undefined}>{icon && <Icon name={icon} size={16} />}{label ? <span className="nx-chip-text">{children}</span> : children}</Tag>;
}

export function Profile({ name, role, sub, onClick }) {
  return (
    <button type="button" className="nx-profile" onClick={onClick} disabled={!onClick}>
      <span className="nx-profile-face"><Face name="You" size={34} /></span>
      <span className="nx-profile-text"><strong>{name || 'You'}</strong><small>{sub || role}</small></span>
    </button>
  );
}

// A number card with an icon tile, like a dashboard metric.
export function StatCard({ icon, tone = 'accent', label, value, unit, delta, deltaLabel, sub, onClick, className = '', children }) {
  const Tag = onClick ? 'button' : 'div';
  const up = typeof delta === 'number' ? delta >= 0 : null;
  return (
    <Tag type={onClick ? 'button' : undefined} className={`nx-stat tone-${tone} ${className}`} onClick={onClick}>
      <span className="nx-stat-icon"><Icon name={icon} size={20} /></span>
      <span className="nx-stat-body">
        <span className="nx-stat-label">{label}</span>
        <span className="nx-stat-value">{value}{unit && <small> {unit}</small>}</span>
        {delta !== undefined && delta !== null && (typeof delta === 'number' && Math.round(delta) === 0
          ? <span className="nx-stat-delta nx-muted">No change{deltaLabel ? ` ${deltaLabel}` : ''}</span>
          : <span className={`nx-stat-delta ${up ? 'up' : 'down'}`}>{up ? '↑' : '↓'} {typeof delta === 'number' ? Math.abs(Math.round(delta)) : delta}{deltaLabel ? <span className="nx-muted"> {deltaLabel}</span> : null}</span>)}
        {sub && <span className="nx-stat-sub">{sub}</span>}
        {children}
      </span>
    </Tag>
  );
}

// The big stage: a character or product under a spotlight, with a giant word behind it.
export function HeroStage({ word, sub, children, plate, className = '' }) {
  return (
    <div className={`nx-stage ${className}`}>
      {word && <span className="nx-word" aria-hidden="true" style={{ '--len': Math.max(4, String(word).length) }}>{word}{sub && <small>{sub}</small>}</span>}
      <div className="nx-spot" aria-hidden="true" />
      <div className="nx-figure">{children}</div>
      <div className="nx-floor" aria-hidden="true" />
      {plate && <div className="nx-plate">{plate}</div>}
    </div>
  );
}

export function Ring({ value, size = 64, label }) {
  const r = size / 2 - 6;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value || 0));
  return (
    <svg className="nx-ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label || `${Math.round(v * 100)}%`}>
      <circle cx={size / 2} cy={size / 2} r={r} className="nx-ring-track" />
      <circle cx={size / 2} cy={size / 2} r={r} className="nx-ring-fill" strokeDasharray={`${c * v} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </svg>
  );
}

// The strip along the bottom: progress, the key count, status and the next step.
export function ProgressStrip({ progress, progressLabel, progressSub, bar, count, countLabel, status, statusTone = 'good', statusSub, action, className = '' }) {
  return (
    <div className={`nx-strip ${className}`}>
      <div className="nx-strip-cell nx-strip-progress">
        <Ring value={progress} size={60} label={progressLabel} />
        <div><span className="nx-muted small">{progressLabel}</span><strong className="nx-strip-big">{Math.round((progress || 0) * 100)}%</strong></div>
        {bar && <div className="nx-strip-bar"><span className="nx-muted small">{bar.label}</span><span className="nx-bar"><span style={{ width: `${Math.max(0, Math.min(1, bar.value)) * 100}%` }} /></span></div>}
        {progressSub && <span className="nx-muted small">{progressSub}</span>}
      </div>
      {count && <div className="nx-strip-cell"><span className="nx-strip-icon"><Icon name={count.icon || 'chart'} size={20} /></span><div><span className="nx-muted small">{countLabel}</span><strong className="nx-strip-mid">{count.value}</strong></div></div>}
      {status && <div className="nx-strip-cell"><span className={`nx-status-dot tone-${statusTone}`} aria-hidden="true" /><div><span className="nx-muted small">Status</span><strong className={`nx-status tone-${statusTone}`}>{status}</strong>{statusSub && <span className="nx-muted small">{statusSub}</span>}</div></div>}
      {action && <div className="nx-strip-cell nx-strip-action">{action}</div>}
    </div>
  );
}

export function ViewTabs({ tabs, value, onChange, right }) {
  return (
    <div className="nx-views" role="tablist">
      {tabs.map((t) => <button key={t.id} type="button" role="tab" aria-selected={value === t.id} className={`nx-view ${value === t.id ? 'on' : ''}`} onClick={() => onChange(t.id)}><Icon name={t.icon} size={16} />{t.label}{t.badge ? <span className="nx-badge">{t.badge}</span> : null}</button>)}
      {right && <span className="nx-views-right">{right}</span>}
    </div>
  );
}
