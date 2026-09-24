import { useEffect, useId, useRef, useState } from 'react';
import { findTokens, knownTokenKeys, renderText, RUNTIME_TOKENS } from '../engine/text.js';

// tip: a short explanation shown on hover and keyboard focus. tipAlign: 'center' | 'start' | 'end'.
export function Button({ variant = '', size = '', className = '', tip, tipAlign = 'center', ...props }) {
  const id = useId();
  const btn = <button type="button" className={`btn ${variant} ${size} ${className}`} aria-describedby={tip ? id : undefined} {...props} />;
  if (!tip) return btn;
  return <Tip id={id} text={tip} align={tipAlign}>{btn}</Tip>;
}

export function Tip({ text, children, align = 'center', id }) {
  const auto = useId();
  return (
    <span className={`tip-wrap tip-${align}`}>
      {children}
      <span role="tooltip" id={id || auto} className="tip-bubble">{text}</span>
    </span>
  );
}

export function Field({ label, hint, children, id }) {
  return (
    <div className="field">
      {label && <label htmlFor={id}>{label}</label>}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function TextInput({ label, hint, value, onChange, id, ...rest }) {
  const auto = useId();
  const fid = id || auto;
  return (
    <Field label={label} hint={hint} id={fid}>
      <input id={fid} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value)} {...rest} />
    </Field>
  );
}

export function NumberInput({ value, onChange, min, max, step = 1, className = 'num-input', id, ...rest }) {
  const [draft, setDraft] = useState(String(value ?? ''));
  useEffect(() => setDraft(String(value ?? '')), [value]);
  const commit = (v) => {
    const n = Number(v);
    if (v === '' || Number.isNaN(n)) return setDraft(String(value ?? ''));
    const c = Math.max(min ?? -Infinity, Math.min(max ?? Infinity, n));
    onChange(c);
    setDraft(String(c));
  };
  return (
    <input
      id={id}
      className={`input ${className}`}
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => e.key === 'Enter' && commit(e.currentTarget.value)}
      {...rest}
    />
  );
}

export function Switch({ checked, onChange, label, id }) {
  const auto = useId();
  return (
    <label className="switch" htmlFor={id || auto}>
      <input id={id || auto} type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} />
      {label && <span>{label}</span>}
    </label>
  );
}

export function Seg({ value, options, onChange, label }) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Pill({ tone = '', children, title }) {
  return <span className={`pill ${tone}`} title={title}>{children}</span>;
}

export function StylePill({ def, styleId, children }) {
  const s = def.leadership.styles.find((x) => x.id === styleId);
  if (!s) return <span className="pill">No style</span>;
  return (
    <span className="style-pill" style={{ '--c': s.color }}>
      <span className="dot" />
      {children || s.name}
    </span>
  );
}

export function Callout({ tone = '', icon = 'i', children }) {
  return (
    <div className={`callout ${tone}`}>
      <span className="ic" aria-hidden="true">{icon}</span>
      <div className="grow">{children}</div>
    </div>
  );
}

export function Stat({ label, value, color }) {
  return (
    <div className="stat" title={`${label} ${Math.round(value)}`}>
      <span>{label[0]}</span>
      <div className="bar"><span style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} /></div>
      <b>{Math.round(value)}</b>
    </div>
  );
}

export function SMP({ s, m, p }) {
  return (
    <div className="stack" style={{ '--gap': '3px' }}>
      <Stat label="Skill" value={s} color="var(--style-entrusting)" />
      <Stat label="Morale" value={m} color="var(--style-guiding)" />
      <Stat label="Performance" value={p} color="var(--good)" />
    </div>
  );
}

// Shows authored text with {{tokens}} as chips, so authors see what the runtime will fill in.
export function TokenText({ def, text, highlight = [] }) {
  const known = knownTokenKeys(def);
  const parts = String(text || '').split(/(\{\{\s*[A-Za-z_][A-Za-z0-9_]*\s*\}\})/g);
  return (
    <span style={{ whiteSpace: 'pre-wrap' }}>
      {parts.map((part, i) => {
        const m = part.match(/^\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}$/);
        if (m) {
          const key = m[1];
          const ent = def.context.entities.find((e) => e.key === key);
          const pronoun = ['he', 'him', 'his', 'himself'].includes(key.toLowerCase());
          const cls = !known.has(key) ? 'token unknown' : pronoun ? 'token pronoun' : 'token';
          const label = ent ? ent.value : pronoun ? key.toLowerCase() === 'he' ? 'he/she' : key.toLowerCase() === 'him' ? 'him/her' : key.toLowerCase() === 'his' ? 'his/her' : 'himself/herself' : RUNTIME_TOKENS[key] ? key.replace('_', ' ') : key;
          return <span key={i} className={cls} title={ent ? `${ent.label} (context field)` : RUNTIME_TOKENS[key.toLowerCase()] || 'Unknown field'}>{label}</span>;
        }
        if (!highlight.length) return <span key={i}>{part}</span>;
        const re = new RegExp(`(${highlight.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
        return part.split(re).map((seg, j) => (j % 2 ? <mark key={`${i}-${j}`} className="mark">{seg}</mark> : <span key={`${i}-${j}`}>{seg}</span>));
      })}
    </span>
  );
}

// Text area with a field inserter and a rendered preview under it.
export function TokenArea({ def, label, hint, value, onChange, rows = 4, tokens = 'context', preview = true, id }) {
  const auto = useId();
  const fid = id || auto;
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const insert = (key) => {
    const el = ref.current;
    const v = value || '';
    const at = el ? el.selectionStart : v.length;
    const next = `${v.slice(0, at)}{{${key}}}${v.slice(el ? el.selectionEnd : at)}`;
    onChange(next);
    setOpen(false);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = at + key.length + 4;
      el.setSelectionRange(pos, pos);
    });
  };
  const runtime = tokens === 'actor' ? ['actor', 'stage', 'he', 'his', 'him'] : tokens === 'report' ? ['style', 'dominant_style', 'weeks'] : [];
  const hasTokens = findTokens(value).length > 0;
  return (
    <div className="field">
      <div className="row spread">
        {label ? <label htmlFor={fid}>{label}</label> : <span />}
        <div style={{ position: 'relative' }}>
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)} aria-expanded={open}>Insert field</Button>
          {open && (
            <div className="card tight" style={{ position: 'absolute', right: 0, top: '110%', zIndex: 10, width: 260, boxShadow: 'var(--shadow)' }}>
              <div className="stack" style={{ '--gap': '4px' }}>
                {runtime.length > 0 && <span className="eyebrow">From the run</span>}
                {runtime.map((k) => (
                  <button key={k} type="button" className="rail-item" onClick={() => insert(k)}>
                    <span className="token">{k}</span><span className="small muted">{RUNTIME_TOKENS[k]}</span>
                  </button>
                ))}
                <span className="eyebrow">Context</span>
                {def.context.entities.map((e) => (
                  <button key={e.key} type="button" className="rail-item" onClick={() => insert(e.key)}>
                    <span className="token">{e.value}</span><span className="small muted">{e.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      <textarea id={fid} ref={ref} className="textarea" rows={rows} value={value || ''} onChange={(e) => onChange(e.target.value)} />
      {preview && hasTokens && (
        <div className="small ink2" style={{ padding: '6px 2px 0' }}>
          <span className="eyebrow" style={{ marginRight: 6 }}>Reads as</span>
          {renderText(def, value, { actor: 'Beth Killiney', pronoun: 'she', stage: def.stages[0]?.name, style: def.leadership.styles[0].name, dominant_style: def.leadership.styles[0].name })}
        </div>
      )}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Drawer({ title, subtitle, onClose, children, wide, actions }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="drawer-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className={`drawer ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <div className="drawer-head">
          <div className="grow">
            <h2>{title}</h2>
            {subtitle && <div className="small muted">{subtitle}</div>}
          </div>
          {actions}
          <Button variant="ghost" className="icon-btn" onClick={onClose} aria-label="Close">Close</Button>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </div>
  );
}

export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-label={title}>
        <div className="row spread" style={{ marginBottom: 12 }}>
          <h2>{title}</h2>
          <Button variant="ghost" size="sm" onClick={onClose}>Close</Button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function SectionHead({ title, children, actions, eyebrow }) {
  return (
    <div className="section-head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function ImpactInputs({ value, onChange }) {
  return (
    <div className="row nowrap" style={{ '--gap': '4px' }}>
      {['s', 'm', 'p'].map((k) => (
        <label key={k} className="row nowrap small muted" style={{ '--gap': '3px' }}>
          {k.toUpperCase()}
          <NumberInput className="xs" value={value[k]} min={-50} max={50} onChange={(v) => onChange({ ...value, [k]: v })} aria-label={{ s: 'Skill', m: 'Morale', p: 'Performance' }[k]} />
        </label>
      ))}
    </div>
  );
}

export function impactText(i) {
  const parts = [];
  const f = (v) => (v > 0 ? `+${v}` : `${v}`);
  if (i.s) parts.push(`skill ${f(i.s)}`);
  if (i.m) parts.push(`morale ${f(i.m)}`);
  if (i.p) parts.push(`performance ${f(i.p)}`);
  return parts.length ? parts.join(', ') : 'no change';
}

export function Toast({ message, onDone }) {
  useEffect(() => {
    if (!message) return undefined;
    const t = setTimeout(onDone, 2400);
    return () => clearTimeout(t);
  }, [message, onDone]);
  if (!message) return null;
  return <div className="toast" role="status">{message}</div>;
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
