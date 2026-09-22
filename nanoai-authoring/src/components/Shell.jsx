import React, { useState } from 'react';
import { Button, Badge } from './ui.jsx';
import { useWorkspace } from '../engine/WorkspaceContext.jsx';
import { llmAvailable, loadSettings, DEFAULT_MODEL } from '../engine/llm.js';

const Icon = ({ d, size = 16 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
const I = {
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',
  plus: 'M12 5v14M5 12h14',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  star: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.3 6L12 16.4 6.6 19.4l1.3-6L3.4 9.3l6-.7z',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  search: 'M21 21l-4.3-4.3M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0z',
  undo: 'M3 7v6h6M3 13a9 9 0 1 0 3-7.7L3 7',
  redo: 'M21 7v6h-6M21 13a9 9 0 1 1-3-7.7L21 7',
};

export const STAGES = [
  { id: 'brief', label: 'Brief', hint: 'Tell us about it' },
  { id: 'scenarios', label: 'Scenarios', hint: 'Review and approve' },
  { id: 'preview', label: 'Preview', hint: 'Try it as a participant' },
  { id: 'publish', label: 'Publish', hint: 'Check and go live' },
];

export default function Shell({ children, crumbs = [], title, subtitle, actions, stage, onStage, stageStatus }) {
  const { ws, route, setRoute, goHome, createAssessment, current, undo, redo, canUndo, canRedo, openAssessment } = useWorkspace();
  const [q, setQ] = useState('');
  const ai = llmAvailable();
  const sample = ws.assessments.find((a) => a.sample);
  const results = q.trim() ? ws.assessments.filter((a) => (a.config.name || 'Untitled').toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];
  return (
    <div className="flex min-h-full">
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-[var(--line)] bg-white px-4 py-5 md:flex">
        <button onClick={goHome} className="flex items-center gap-2.5 px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]" aria-label="NanoAI Authoring home">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand)] text-sm font-bold text-white">N</span>
          <span className="text-left leading-tight"><span className="block text-[15px] font-semibold">NanoAI</span><span className="faint block text-[11px]">Authoring · GenieKreator</span></span>
        </button>
        <nav className="mt-7 flex flex-1 flex-col gap-6 overflow-auto">
          <div>
            <div className="faint mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.12em]">Menu</div>
            <button className="side-item" aria-current={route === 'home' ? 'page' : undefined} onClick={goHome}><Icon d={I.grid} />Dashboard</button>
            <button className="side-item" onClick={() => createAssessment()}><Icon d={I.plus} />New assessment</button>
            {sample && <button className="side-item" aria-current={route === 'author' && current?.sample ? 'page' : undefined} onClick={() => openAssessment(sample.id)}><Icon d={I.star} />Sample assessment</button>}
          </div>
          {route === 'author' && current && (
            <div>
              <div className="faint mb-2 flex items-center justify-between px-3 text-[10px] font-semibold uppercase tracking-[0.12em]"><span>Stages</span><span>{stageStatus?.filter(Boolean).length || 0}/{STAGES.length}</span></div>
              {STAGES.map((s, i) => { const n = i + 1; const done = stageStatus?.[i]; return (
                <button key={s.id} className="side-item" aria-current={stage === n ? 'step' : undefined} onClick={() => onStage?.(n)} disabled={!onStage}>
                  <span className={`dot ${done && stage !== n ? 'done' : ''}`}>{done && stage !== n ? '✓' : n}</span>
                  <span className="leading-tight"><span className="block">{s.label}</span><span className="faint block text-[11px] font-normal">{s.hint}</span></span>
                </button>); })}
            </div>
          )}
          <div>
            <div className="faint mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.12em]">General</div>
            <button className="side-item" aria-current={route === 'settings' ? 'page' : undefined} onClick={() => setRoute('settings')}><Icon d={I.gear} />Settings</button>
            <button className="side-item" aria-current={route === 'help' ? 'page' : undefined} onClick={() => setRoute('help')}><Icon d={I.help} />Help and support</button>
          </div>
        </nav>
        <div className={`mt-4 rounded-xl p-3.5 text-white ${ai ? 'bg-[#1f2a37]' : 'bg-gradient-to-br from-[#2b1b12] to-[#4a2a14]'}`}>
          <div className="flex items-center gap-2 text-sm font-semibold"><span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[var(--brand)] text-[11px]">+</span>{ai ? 'AI assisted' : 'Scripted mode'}</div>
          <p className="mt-1 text-[11px] text-white/75">{ai ? `Drafting with ${loadSettings().model || DEFAULT_MODEL}.` : 'Add an API key to draft scenarios from your own documents.'}</p>
          {!ai && <button onClick={() => setRoute('settings')} className="mt-2.5 w-full rounded-lg bg-[var(--brand)] py-1.5 text-xs font-semibold hover:bg-[var(--brand-2)]">Connect AI</button>}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--paper)]/90 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-3 md:px-6">
            <div className="flex items-center gap-2 md:hidden"><button onClick={goHome} className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--brand)] text-sm font-bold text-white">N</button><Badge tone={ai ? 'ok' : 'neutral'}>{ai ? 'AI' : 'Scripted'}</Badge></div>
            <div className="relative hidden w-full max-w-md md:block">
              <span className="pointer-events-none absolute left-3 top-2.5 text-[var(--ink-3)]"><Icon d={I.search} /></span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search assessments" aria-label="Search assessments" className="w-full rounded-full border border-transparent bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:border-[var(--brand)] focus:outline-none focus:ring-2 focus:ring-[var(--brand-ring)]" />
              {results.length > 0 && <ul className="card absolute z-50 mt-1 w-full overflow-hidden shadow-lg">{results.map((a) => <li key={a.id}><button className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { openAssessment(a.id); setQ(''); }}><span>{a.config.name || 'Untitled assessment'}</span><Badge tone={a.status === 'published' ? 'ok' : 'neutral'}>{a.status}</Badge></button></li>)}</ul>}
            </div>
            <div className="flex items-center gap-1.5">
              {route === 'author' && current && <><Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo} title="Undo" aria-label="Undo"><Icon d={I.undo} /></Button><Button variant="ghost" size="sm" onClick={redo} disabled={!canRedo} title="Redo" aria-label="Redo"><Icon d={I.redo} /></Button></>}
              <div className="ml-1 hidden items-center gap-2 rounded-full bg-white px-2 py-1 pr-3 shadow-sm sm:flex"><span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[var(--brand-soft)] text-xs font-semibold text-[var(--brand)]">{(ws.author || 'A').slice(0, 1).toUpperCase()}</span><span className="text-xs font-medium">{ws.author || 'Author'}</span></div>
            </div>
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-5 md:px-6">
          {(crumbs.length > 0 || title) && (
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                {crumbs.length > 0 && <nav aria-label="Breadcrumb" className="faint mb-1 flex flex-wrap items-center gap-1.5 text-xs">{crumbs.map((c, i) => <React.Fragment key={i}>{i > 0 && <span>/</span>}{c.onClick ? <button className="hover:text-[var(--ink)]" onClick={c.onClick}>{c.label}</button> : <span className={i === crumbs.length - 1 ? 'font-medium text-[var(--ink)]' : ''}>{c.label}</span>}</React.Fragment>)}</nav>}
                {title && <h1 className="text-xl font-semibold">{title}</h1>}
                {subtitle && <p className="muted mt-0.5 max-w-3xl text-sm">{subtitle}</p>}
              </div>
              {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
