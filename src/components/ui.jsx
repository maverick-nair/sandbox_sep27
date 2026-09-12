import React from 'react';

export function Panel({ title, subtitle, right, className = '', children }) {
  return (
    <section className={`rounded-lg border border-zinc-800 bg-zinc-900/70 ${className}`}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 border-b border-zinc-800 px-4 py-2.5">
          <div>
            {title && <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-zinc-500">{subtitle}</p>}
          </div>
          {right}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Button({ variant = 'primary', size = 'md', className = '', disabled, ...rest }) {
  const base = 'inline-flex items-center justify-center rounded font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-40';
  const sizes = { sm: 'px-2.5 py-1 text-xs', md: 'px-3.5 py-2 text-sm', lg: 'px-5 py-2.5 text-base' };
  const variants = {
    primary: 'bg-amber-500 text-zinc-950 hover:bg-amber-400',
    secondary: 'border border-zinc-700 bg-zinc-800 text-zinc-100 hover:bg-zinc-700',
    ghost: 'text-zinc-300 hover:bg-zinc-800',
    danger: 'bg-sky-600 text-white hover:bg-sky-500',
  };
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} disabled={disabled} {...rest} />;
}

export function Gauge({ label, value, unit = '', target, targetLabel, good, max = 100, format }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const tone = good === undefined ? 'bg-zinc-400' : good ? 'bg-amber-400' : 'bg-sky-500';
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-wider text-zinc-400">{label}</span>
        <span className={`font-mono text-lg ${good === false ? 'text-sky-300' : 'text-zinc-100'}`}>{format ? format(value) : value}{unit}</span>
      </div>
      <div className="mt-2 h-1.5 w-full rounded bg-zinc-800">
        <div className={`h-1.5 rounded ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      {target !== undefined && <div className="mt-1 text-[11px] text-zinc-500">Target {targetLabel || `${target}${unit}`}</div>}
    </div>
  );
}

export function Meter({ label, value, delta }) {
  const tone = value >= 70 ? 'bg-amber-400' : value >= 45 ? 'bg-zinc-400' : 'bg-sky-500';
  return (
    <div className="min-w-[120px]">
      <div className="flex items-baseline justify-between text-[11px]">
        <span className="uppercase tracking-wider text-zinc-400">{label}</span>
        <span className="font-mono text-zinc-200">{value}{delta ? <span className={delta > 0 ? 'ml-1 text-amber-300' : 'ml-1 text-sky-300'}>{delta > 0 ? '+' : ''}{delta}</span> : null}</span>
      </div>
      <div className="mt-1 h-1.5 rounded bg-zinc-800"><div className={`h-1.5 rounded ${tone}`} style={{ width: `${value}%` }} /></div>
    </div>
  );
}

export function Tag({ tone = 'zinc', children }) {
  const tones = {
    zinc: 'border-zinc-700 text-zinc-300',
    amber: 'border-amber-500/50 text-amber-300',
    sky: 'border-sky-500/50 text-sky-300',
    green: 'border-emerald-500/50 text-emerald-300',
  };
  return <span className={`inline-block rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${tones[tone]}`}>{children}</span>;
}

export function Notice({ tone = 'zinc', children }) {
  const tones = { zinc: 'border-zinc-700 bg-zinc-800/60 text-zinc-300', amber: 'border-amber-500/40 bg-amber-500/10 text-amber-200', sky: 'border-sky-500/40 bg-sky-500/10 text-sky-200' };
  return <div className={`rounded border px-3 py-2 text-sm ${tones[tone]}`}>{children}</div>;
}

export function Field({ label, hint, children }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs uppercase tracking-wider text-zinc-400">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-zinc-500">{hint}</span>}
    </label>
  );
}

export const inputClass = 'w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-amber-400 focus:outline-none';

export function wordCount(text) {
  return (text || '').trim().split(/\s+/).filter(Boolean).length;
}

export function StatRow({ items }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="rounded border border-zinc-800 bg-zinc-950/60 px-3 py-2">
          <dt className="text-[10px] uppercase tracking-wider text-zinc-500">{it.label}</dt>
          <dd className="font-mono text-base text-zinc-100">{it.value}</dd>
        </div>
      ))}
    </dl>
  );
}
