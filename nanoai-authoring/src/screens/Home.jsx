import React, { useState } from 'react';
import { Button, Badge } from '../components/ui.jsx';
import { Icon, I } from '../components/Shell.jsx';
import { useWorkspace } from '../engine/WorkspaceContext.jsx';
import { runQualityGate } from '../engine/qualityGate.js';
import { getSkill } from '../content/ontology.js';
import { RULES, purposeById } from '../content/rules.js';

// The 4E product lines. NanoAI lives under Evaluate; the other lines are listed so the landing reads as
// GenieKreator, and they open in their own products.
const LINES = [
  { id: 'evaluate', label: 'Evaluate', products: ['NanoAI', 'Conversation AI', 'PitchPerfect AI'] },
  { id: 'educate', label: 'Educate', products: ['AI Microlearn', 'Interactive Learn'] },
  { id: 'experience', label: 'Experience', products: ['Simulations', 'AI RolePlay'] },
  { id: 'enable', label: 'Enable', products: ['AI Koach'] },
];

export function progressOf(a) {
  if (a.status === 'published') return 100;
  const scen = a.scenarios?.length || 0;
  if (!a.skillsConfirmed) return a.intent.audience ? 10 : 0;
  if (!scen) return 25;
  const approved = a.scenarios.filter((s) => s.approved).length / scen;
  return Math.min(95, Math.round(25 + approved * 55 + (a.previewed ? 10 : 0)));
}

export default function Home() {
  const { ws, createAssessment, openAssessment, deleteAssessment, duplicateAssessment, setRoute, toast } = useWorkspace();
  const [line, setLine] = useState('evaluate');
  const [q, setQ] = useState('');
  const [menuFor, setMenuFor] = useState(null);
  const list = ws.assessments.filter((a) => !a.sample).sort((a, b) => b.updatedAt - a.updatedAt).filter((a) => !q.trim() || (a.config.name || 'Untitled').toLowerCase().includes(q.toLowerCase()));
  const sample = ws.assessments.find((a) => a.sample);
  const active = LINES.find((l) => l.id === line);
  return (
    <div className="space-y-8">
      <h1 className="sr-only">GenieKreator: Evaluate products</h1>
      <div role="tablist" aria-label="Product lines" className="mx-auto flex w-fit flex-wrap gap-1 rounded-xl bg-[#e6edf7] p-1">
        {LINES.map((l) => <button key={l.id} role="tab" id={`tab-${l.id}`} aria-selected={line === l.id} aria-controls={`panel-${l.id}`} tabIndex={line === l.id ? 0 : -1} className="tab" onClick={() => setLine(l.id)} onKeyDown={(e) => { const i = LINES.findIndex((x) => x.id === line); if (e.key === 'ArrowRight') setLine(LINES[(i + 1) % LINES.length].id); if (e.key === 'ArrowLeft') setLine(LINES[(i + LINES.length - 1) % LINES.length].id); }}><Icon d={I.check} size={14} />{l.label}</button>)}
      </div>
      <section id={`panel-${line}`} role="tabpanel" aria-labelledby={`tab-${line}`}>
        {line === 'evaluate' ? (
          <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
            <button className="hero-card" onClick={() => createAssessment()}>
              <div className="hero-art" aria-hidden="true"><svg width="120" height="80" viewBox="0 0 120 80" fill="none"><rect x="10" y="14" width="100" height="56" rx="8" fill="#fff" stroke="#1b5fc7" strokeWidth="2" /><rect x="22" y="28" width="52" height="6" rx="3" fill="#1b5fc7" /><rect x="22" y="42" width="76" height="6" rx="3" fill="#9dc0ee" /><rect x="22" y="54" width="40" height="6" rx="3" fill="#9dc0ee" /><circle cx="94" cy="30" r="8" fill="#0f8f8a" /></svg></div>
              <div className="flex items-start justify-between gap-2 p-4"><div><div className="text-sm font-semibold">Create New Assessment</div><p className="muted mt-0.5 text-xs">Speak, upload a brief or type a few lines and NanoAI builds a Skills assessment tailored to your people.</p></div><span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-white" aria-hidden="true">→</span></div>
            </button>
            <button className="hero-card" onClick={() => setRoute('templates')}>
              <div className="hero-art" aria-hidden="true"><svg width="120" height="80" viewBox="0 0 120 80" fill="none"><rect x="12" y="12" width="42" height="26" rx="6" fill="#fff" stroke="#1b5fc7" strokeWidth="2" /><rect x="66" y="12" width="42" height="26" rx="6" fill="#fff" stroke="#1b5fc7" strokeWidth="2" /><rect x="12" y="44" width="42" height="26" rx="6" fill="#fff" stroke="#1b5fc7" strokeWidth="2" /><rect x="66" y="44" width="42" height="26" rx="6" fill="#0f8f8a" /></svg></div>
              <div className="flex items-start justify-between gap-2 p-4"><div><div className="text-sm font-semibold">Use a Template</div><p className="muted mt-0.5 text-xs">Choose from professionally designed NanoAI templates for common enterprise scenarios.</p></div><span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--brand)] text-white" aria-hidden="true">→</span></div>
            </button>
          </div>
        ) : (
          <div className="card mx-auto max-w-3xl p-6 text-center"><h2 className="text-base font-semibold">{active.label}</h2><p className="muted mt-1 text-sm">{active.products.join(', ')} open in their own GenieKreator products. NanoAI is part of Evaluate.</p><Button className="mt-3" variant="secondary" onClick={() => setLine('evaluate')}>Back to Evaluate</Button></div>
        )}
      </section>

      <section aria-labelledby="products-heading">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="products-heading" className="text-sm font-semibold text-[var(--brand-2)]">All Your Products</h2>
          <div className="relative w-64"><label htmlFor="list-search" className="sr-only">Search your products</label><span className="pointer-events-none absolute left-3 top-2.5 text-[var(--ink-3)]"><Icon d={I.search} size={14} /></span><input id="list-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products..." className="w-full rounded-full border border-[var(--line)] bg-white py-1.5 pl-8 pr-3 text-sm" /></div>
        </div>
        <ul className="space-y-3">
          {sample && !q && <ProductRow a={sample} onOpen={() => openAssessment(sample.id)} onDuplicate={() => duplicateAssessment(sample.id)} sample />}
          {list.map((a) => <ProductRow key={a.id} a={a} onOpen={() => openAssessment(a.id)} onDuplicate={() => duplicateAssessment(a.id)} onDelete={() => { if (confirm(`Delete "${a.config.name || 'Untitled assessment'}"? Published versions in this workspace are removed too.`)) deleteAssessment(a.id); }} menuOpen={menuFor === a.id} setMenu={(v) => setMenuFor(v ? a.id : null)} />)}
          {list.length === 0 && q && <li className="card p-6 text-center text-sm muted">No products match "{q}".</li>}
          {list.length === 0 && !q && <li className="card p-6 text-center text-sm muted">Nothing of your own yet. Create an assessment above or start from a template. A first one takes under an hour.</li>}
        </ul>
      </section>
    </div>
  );
}

function ProductRow({ a, onOpen, onDuplicate, onDelete, sample, menuOpen, setMenu }) {
  const pct = progressOf(a);
  const gate = a.scenarios?.length ? runQualityGate(a) : null;
  const status = a.status === 'published' ? 'Published' : pct > 0 ? 'In Progress' : 'Draft';
  const name = a.config.name || 'Untitled assessment';
  return (
    <li className="card border-l-4 border-l-[var(--brand)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-sm font-semibold">{name}</h3>
            <div className="flex items-center gap-2" aria-label={`${pct} percent complete`}><div className="progress w-32" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${name} progress`}><div style={{ width: `${pct}%` }} /></div><span className="text-xs font-medium text-[var(--brand-2)]">{pct}%</span><span className="faint text-xs">{status}</span></div>
          </div>
          <p className="muted mt-1 text-xs">{a.intent.audience || 'Audience not set'} · {a.skills.length ? a.skills.map((s) => s.clientLabel || getSkill(s.id)?.name).join(', ') : 'Skills not chosen'} · {purposeById(a.intent.purpose).label}</p>
          <p className="faint mt-2 text-[11px]">Created {new Date(a.createdAt).toLocaleDateString()} · Updated {new Date(a.updatedAt).toLocaleDateString()} · {a.publishedAt ? `Published ${new Date(a.publishedAt).toLocaleDateString()}` : 'Not Published'}{gate && !gate.canPublish ? ` · ${gate.hard.length} to fix` : ''}{gate ? ` · ${gate.totalMinutes} min` : ''}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone="brand">NanoAI</Badge>
          {sample && <Badge>Sample</Badge>}
          <button className="icon-btn" onClick={onOpen} aria-label={`Open ${name}`} title="Open"><Icon d={I.back} size={14} /></button>
          {sample ? <Button size="sm" variant="secondary" onClick={onDuplicate}>Use as starting point</Button> : (
            <div className="relative">
              <button className="icon-btn" aria-label={`More actions for ${name}`} aria-haspopup="menu" aria-expanded={Boolean(menuOpen)} onClick={() => setMenu(!menuOpen)}>···</button>
              {menuOpen && <div role="menu" aria-label={`Actions for ${name}`} className="card absolute right-0 z-30 mt-1 w-44 p-1 shadow-lg"><button role="menuitem" className="side-item" onClick={() => { setMenu(false); onDuplicate(); }}>Duplicate</button><button role="menuitem" className="side-item text-[var(--block)]" onClick={() => { setMenu(false); onDelete(); }}>Delete</button></div>}
            </div>
          )}
        </div>
      </div>
    </li>
  );
}
