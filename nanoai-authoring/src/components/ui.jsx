import React, { useEffect, useRef, useState } from 'react';

export function Button({ variant = 'primary', size = 'md', className = '', disabled, busy, children, ...rest }) {
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-50';
  const sizes = { sm: 'px-2.5 py-1 text-xs', md: 'px-3.5 py-2 text-sm', lg: 'px-5 py-2.5 text-base' };
  const variants = {
    primary: 'bg-[var(--brand)] text-[var(--on-brand)] hover:bg-[var(--brand-2)]',
    secondary: 'border border-[var(--line)] bg-[var(--card)] text-[var(--ink)] hover:bg-[var(--card-3)]',
    ghost: 'text-[var(--ink-2)] hover:bg-[var(--card-3)]',
    danger: 'border border-[var(--block)] text-[var(--block)] bg-[var(--card)] hover:bg-[var(--block-soft)]',
    success: 'bg-[var(--ok)] text-[var(--on-brand)] hover:brightness-95',
  };
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} disabled={disabled || busy} {...rest}>{busy && <Spinner size={14} />}{children}</button>;
}

export function Spinner({ size = 16 }) { return <span className="pulse inline-block rounded-full border-2 border-current border-t-transparent" style={{ width: size, height: size, animation: 'spin .8s linear infinite' }} aria-hidden="true" />; }

export function Panel({ title, subtitle, right, children, className = '', tone, padding = 'p-5', as: H = 'h2' }) {
  const tones = { warn: 'border-[var(--warn)]/40', block: 'border-[var(--block)]/40', ok: 'border-[var(--ok)]/40' };
  return (
    <section className={`card ${tones[tone] || ''} ${className}`}>
      {(title || right) && (
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-3">
          <div>{title && <H className="text-sm font-semibold">{title}</H>}{subtitle && <p className="muted mt-0.5 text-xs">{subtitle}</p>}</div>
          {right}
        </div>
      )}
      <div className={padding}>{children}</div>
    </section>
  );
}

export function Field({ label, hint, required, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 flex items-baseline gap-2 text-sm font-medium">{label}{required && <span className="text-xs font-normal text-[var(--block)]">required</span>}{!required && hint && <span className="faint text-xs font-normal">{hint}</span>}</span>
      {children}
      {required && hint && <span className="faint mt-1 block text-xs">{hint}</span>}
    </label>
  );
}
const inputCls = 'w-full rounded-lg border border-[var(--line)] bg-[var(--card)] px-3 py-2 text-sm focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]/20';
export function Input({ className = '', ...props }) { return <input className={`${inputCls} ${className}`} {...props} />; }
export function Textarea({ className = '', ...props }) { return <textarea className={`${inputCls} min-h-[90px] ${className}`} {...props} />; }
export function Select({ children, className = '', ...rest }) { return <select className={`${inputCls} ${className}`} {...rest}>{children}</select>; }

export function Badge({ tone = 'neutral', children, className = '', title }) {
  const tones = { neutral: 'bg-[var(--card-2)] text-[var(--ink-2)]', brand: 'bg-[var(--brand-soft)] text-[var(--brand)]', ok: 'bg-[var(--ok-soft)] text-[var(--ok)]', warn: 'bg-[var(--warn-soft)] text-[var(--warn)]', block: 'bg-[var(--block-soft)] text-[var(--block)]', dark: 'bg-[var(--card-3)] text-[var(--ink)] border border-[var(--line-2)]' };
  return <span title={title} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${tones[tone]} ${className}`}>{children}</span>;
}
export function Confidence({ level }) { const tone = level === 'High' ? 'ok' : level === 'Medium' ? 'warn' : 'block'; return <Badge tone={tone} title={`Mapping confidence ${level}`}>{level} confidence</Badge>; }
export function Severity({ severity }) { return severity === 'hard' ? <Badge tone="block">Blocks publish</Badge> : <Badge tone="warn">Suggestion</Badge>; }
export function Source({ children }) { return <span className="faint inline-flex items-center gap-1 text-[11px]"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 6v4m0 4h.01" /></svg>{children}</span>; }

export function Modal({ open, title, onClose, children, footer, wide }) {
  const ref = useRef(null); const opener = useRef(null);
  // Focus moves into the dialog on open and returns to the opener on close; Tab cycles inside (2.1.2, 2.4.3).
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const el = ref.current; el?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); }
      if (e.key === 'Tab' && el) { const f = [...el.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')]; if (!f.length) return; const first = f[0], last = f[f.length - 1]; if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); opener.current?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`card max-h-[90vh] w-full ${wide ? 'max-w-6xl' : 'max-w-lg'} overflow-auto`}>
        <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3"><h2 className="text-sm font-semibold">{title}</h2><Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">Close</Button></div>
        <div className="p-5">{children}</div>
        {footer && <footer className="flex justify-end gap-2 border-t border-[var(--line)] px-5 py-3">{footer}</footer>}
      </div>
    </div>
  );
}

export function Toasts({ toasts }) {
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2" role="status" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`card pointer-events-auto px-4 py-2 text-sm shadow-lg ${t.tone === 'error' ? 'border-[var(--block)]' : t.tone === 'ok' ? 'border-[var(--ok)]' : ''}`}>{t.text}</div>)}
    </div>
  );
}

// Inline editable text. Commits on blur or Ctrl+Enter; Escape reverts.
export function InlineText({ value, onCommit, multiline = false, className = '', placeholder = 'Click to edit', as = 'div', ariaLabel, readOnly = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const ref = useRef(null);
  useEffect(() => { if (!editing) setDraft(value || ''); }, [value, editing]);
  useEffect(() => { if (editing && ref.current) { ref.current.focus(); const el = ref.current; if (el.setSelectionRange) el.setSelectionRange(el.value.length, el.value.length); } }, [editing]);
  const commit = () => { setEditing(false); if ((draft || '') !== (value || '')) onCommit?.(draft); };
  if (editing) {
    const common = { ref, value: draft, onChange: (e) => setDraft(e.target.value), onBlur: commit, 'aria-label': ariaLabel, onKeyDown: (e) => { if (e.key === 'Escape') { setDraft(value || ''); setEditing(false); } if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || !multiline)) { e.preventDefault(); commit(); } }, className: `${inputCls} ${className}` };
    return multiline ? <textarea {...common} rows={Math.max(3, Math.min(14, Math.ceil((draft.length || 40) / 90)))} /> : <input {...common} />;
  }
  const Tag = as;
  if (readOnly) return <Tag className={`${className} ${!value ? 'faint italic' : ''}`}>{value || placeholder}</Tag>;
  return <Tag tabIndex={0} role="button" aria-label={ariaLabel ? `Edit ${ariaLabel}` : 'Edit text'} className={`inline-edit ${className} ${!value ? 'faint italic' : ''}`} onClick={() => setEditing(true)} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setEditing(true))}>{value || placeholder}</Tag>;
}

export function Steps({ steps, current, onGo, canGo }) {
  return (
    <ol className="flex flex-wrap items-center gap-1 text-xs" aria-label="Authoring steps">
      {steps.map((s, i) => {
        const n = i + 1; const active = n === current; const done = n < current; const enabled = canGo ? canGo(n) : true;
        return (
          <li key={s.id} className="flex items-center">
            <button disabled={!enabled} onClick={() => onGo(n)} aria-current={active ? 'step' : undefined} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${active ? 'bg-[var(--brand)] text-[var(--on-brand)]' : done ? 'bg-[var(--ok-soft)] text-[var(--ok)] hover:brightness-95' : 'text-[var(--ink-2)] hover:bg-[var(--card-3)]'}`}>
              <span className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold ${active ? 'bg-white/20' : done ? 'bg-[var(--ok)] text-[var(--on-brand)]' : 'bg-[var(--card-3)]'}`}>{done ? '✓' : n}</span>{s.label}
            </button>
            {i < steps.length - 1 && <span className="faint mx-0.5">›</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function EmptyState({ title, text, action }) { return <div className="card flex flex-col items-center gap-2 p-10 text-center"><h2 className="text-base font-semibold">{title}</h2><p className="muted max-w-md text-sm">{text}</p>{action}</div>; }
export function Stat({ label, value, sub, tone }) { const c = tone === 'block' ? 'text-[var(--block)]' : tone === 'warn' ? 'text-[var(--warn)]' : tone === 'ok' ? 'text-[var(--ok)]' : ''; return <div className="card px-4 py-3"><div className="faint text-[11px] uppercase tracking-wider">{label}</div><div className={`text-xl font-semibold ${c}`}>{value}</div>{sub && <div className="muted text-xs">{sub}</div>}</div>; }
export function Kbd({ children }) { return <kbd className="rounded border border-[var(--line)] bg-[var(--card-2)] px-1 text-[10px]">{children}</kbd>; }
export function Progress({ value, max = 100, tone }) { const pct = Math.max(0, Math.min(100, (value / max) * 100)); const c = tone === 'block' ? 'bg-[var(--block)]' : tone === 'warn' ? 'bg-[var(--warn)]' : 'bg-[var(--brand)]'; return <div className="h-1.5 w-full rounded bg-[var(--card-3)]"><div className={`h-1.5 rounded ${c}`} style={{ width: `${pct}%` }} /></div>; }

// Tooltip for icon controls (WCAG 2.2 SC 1.4.13): shows on hover and keyboard focus, stays while the pointer is
// over it, closes on Escape, blur or pointer leave. `label` repeats the control's accessible name; `hint` is
// extra help announced through aria-describedby. `align` keeps the bubble inside the viewport at the edges.
export function Tooltip({ label, hint, align = 'center', off = false, children }) {
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const timer = React.useRef(null);
  const show = () => { clearTimeout(timer.current); setOpen(true); };
  const hide = () => { clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), 120); };
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const child = React.Children.only(children);
  const pos = align === 'end' ? 'right-0' : align === 'start' ? 'left-0' : 'left-1/2 -translate-x-1/2';
  return (
    <span className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={() => setOpen(false)}>
      {hint ? React.cloneElement(child, { 'aria-describedby': `${id}-hint` }) : child}
      <span role="tooltip" id={id} className={`tooltip ${pos} ${open && !off ? '' : 'hidden'}`} onMouseEnter={show} onMouseLeave={hide}>
        <span className="block font-semibold" aria-hidden="true">{label}</span>
        {hint && <span id={`${id}-hint`} className="block opacity-90">{hint}</span>}
      </span>
    </span>
  );
}
