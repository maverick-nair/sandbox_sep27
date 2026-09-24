import { useEffect, useId, useRef, useState } from 'react';
import { findTokens, knownTokenKeys, renderText, RUNTIME_TOKENS } from '../engine/text.js';

// tip: a short explanation shown on hover and keyboard focus. tipAlign: 'center' | 'start' | 'end'.
export function Button({ variant = '', size = '', className = '', tip, tipAlign = 'center', ...props }) {
  const id = useId();
  const btn = <button type="button" className={`btn ${variant} ${size} ${className}`} aria-describedby={tip ? id : undefined} {...props} />;
  if (!tip) return btn;
  return <Tip id={id} text={tip} align={tipAlign}>{btn}</Tip>;
}

// Hover or keyboard focus shows the tip. On touch screens an info button next to the control
// shows it on tap. The bubble is nudged back inside the viewport on narrow screens.
export function Tip({ text, children, align = 'center', id }) {
  const auto = useId();
  const wrap = useRef(null);
  const bubble = useRef(null);
  const [open, setOpen] = useState(false);
  const fit = () => {
    const b = bubble.current;
    if (!b) return;
    b.style.setProperty('--tip-dx', '0px');
    const r = b.getBoundingClientRect();
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const dx = r.left < 8 ? 8 - r.left : r.right > vw - 8 ? vw - 8 - r.right : 0;
    b.style.setProperty('--tip-dx', `${Math.round(dx)}px`);
  };
  useEffect(() => {
    if (!open) return undefined;
    fit();
    const close = (e) => { if (!wrap.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  return (
    <span ref={wrap} className={`tip-wrap tip-${align} ${open ? 'tip-open' : ''}`} onMouseEnter={fit} onFocus={fit}>
      {children}
      <button type="button" className="tip-info" aria-label="What does this do?" aria-expanded={open} onClick={() => setOpen((o) => !o)}>i</button>
      <span ref={bubble} role="tooltip" id={id || auto} className="tip-bubble">{text}</span>
    </span>
  );
}

// Accessible search list (replaces <datalist>, which Firefox for Android and iOS Safari handle poorly).
export function Combobox({ id, value, options, onChange, onCommit, label, max = 8 }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = `${id}-list`;
  const q = String(value || '').trim().toLowerCase();
  const matches = q ? options.filter((o) => o.toLowerCase().startsWith(q)).concat(options.filter((o) => !o.toLowerCase().startsWith(q) && o.toLowerCase().includes(q))).slice(0, max) : [];
  const exact = matches.length === 1 && matches[0].toLowerCase() === q;
  const show = open && matches.length > 0 && !exact;
  const pick = (o) => { onChange(o); setOpen(false); };
  return (
    <div className="combo">
      <input
        id={id}
        className="input"
        role="combobox"
        aria-label={label}
        aria-expanded={show}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={show ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setOpen(false); onCommit?.(); }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && matches.length) { e.preventDefault(); setOpen(true); setActive((a) => Math.min(matches.length - 1, a + 1)); }
          else if (e.key === 'ArrowUp' && matches.length) { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          else if (e.key === 'Enter') { e.preventDefault(); if (show && matches[active]) pick(matches[active]); else { setOpen(false); onCommit?.(); } }
          else if (e.key === 'Escape' && show) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
        }}
      />
      {show && (
        <ul id={listId} role="listbox" className="combo-list" aria-label={`${label} suggestions`}>
          {matches.map((o, i) => (
            <li key={o} id={`${listId}-${i}`} role="option" aria-selected={i === active} className={i === active ? 'on' : ''} onMouseDown={(e) => { e.preventDefault(); pick(o); }}>{o}</li>
          ))}
        </ul>
      )}
    </div>
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

// Dialog focus: move focus to the heading on open, keep Tab inside, return focus on close.
function useDialogFocus(onClose) {
  const box = useRef(null);
  const head = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement;
    head.current?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { closeRef.current(); return; }
      if (e.key !== 'Tab' || !box.current) return;
      const items = [...box.current.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items.at(-1);
      if (e.shiftKey && (document.activeElement === first || document.activeElement === head.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      else if (!box.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
    };
  }, []);
  return { box, head };
}

export function Drawer({ title, subtitle, onClose, children, wide, actions }) {
  const { box, head } = useDialogFocus(onClose);
  const hid = useId();
  return (
    <div className="drawer-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside ref={box} className={`drawer ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={hid}>
        <div className="drawer-head">
          <div className="grow">
            <h2 id={hid} ref={head} tabIndex={-1} style={{ outline: 'none' }}>{title}</h2>
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
  const { box, head } = useDialogFocus(onClose);
  const hid = useId();
  return (
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={box} className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={hid}>
        <div className="row spread" style={{ marginBottom: 12 }}>
          <h2 id={hid} ref={head} tabIndex={-1} style={{ outline: 'none' }}>{title}</h2>
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
