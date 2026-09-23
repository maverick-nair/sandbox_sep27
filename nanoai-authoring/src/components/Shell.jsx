import React, { useEffect, useRef, useState } from 'react';
import { Button, Badge, Modal, Tooltip } from './ui.jsx';
import { useWorkspace } from '../engine/WorkspaceContext.jsx';
import Settings from '../screens/Settings.jsx';
import Help from '../screens/Help.jsx';

export const Icon = ({ d, size = 18 }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={d} /></svg>;
export const I = {
  home: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  cloud: 'M7 18a4 4 0 0 1-.5-8 6 6 0 0 1 11.6 1.5A3.5 3.5 0 0 1 17.5 18z',
  user: 'M20 21a8 8 0 1 0-16 0M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  search: 'M21 21l-4.3-4.3M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0z',
  back: 'M19 12H5m7-7l-7 7 7 7',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14.2 3H9.8l-.4 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.2l-2 1.5 2 3.4 2.3-1a7 7 0 0 0 2 1.2l.4 2.7h4.4l.4-2.7a7 7 0 0 0 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  help: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
  menu: 'M4 7h16M4 12h16M4 17h16',
  plus: 'M12 5v14M5 12h14',
  star: 'M12 3l2.6 5.6 6 .7-4.5 4.1 1.3 6L12 16.4 6.6 19.4l1.3-6L3.4 9.3l6-.7z',
  template: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  check: 'M20 6L9 17l-5-5',
};

export const STAGES = [
  { id: 'brief', label: 'Brief', hint: 'Tell us about it' },
  { id: 'scenarios', label: 'Scenarios', hint: 'Review and approve' },
  { id: 'preview', label: 'Preview', hint: 'Try it as a participant' },
  { id: 'publish', label: 'Publish', hint: 'Check and go live' },
];

export function Logo({ onClick }) {
  return <button onClick={onClick} className="flex items-center gap-2 rounded-lg px-1" aria-label="GenieKreator home"><span className="logo-mark" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12a7 7 0 1 0 7-7" /><path d="M12 12h7" /></svg></span><span className="flex items-baseline gap-1"><span className="logo-word text-xl">Genie</span><span className="text-sm font-semibold text-[var(--brand)]">Kreator</span></span></button>;
}

// The GenieKreator frame: full width header (search, home, save state, profile) and, inside an
// assessment, a sidebar with the stages, calibration and quick actions. Settings and help are dialogs, not pages.
export default function Shell({ children, crumbs = [], title, subtitle, actions, stage, onStage, stageStatus, onCalibration, sidebar = false, back }) {
  const { ws, route, setRoute, goHome, createAssessment, current, openAssessment, saveStatus, panel, openPanel, closePanel, role } = useWorkspace();
  const [q, setQ] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);
  const sample = ws.assessments.find((a) => a.sample);
  const results = q.trim() ? ws.assessments.filter((a) => (a.config.name || 'Untitled').toLowerCase().includes(q.toLowerCase())).slice(0, 6) : [];
  const nav = (fn) => () => { setDrawer(false); setMenu(false); fn(); };
  useEffect(() => { if (!menu) return; const onDoc = (e) => { if (!menuRef.current?.contains(e.target)) setMenu(false); }; const onKey = (e) => e.key === 'Escape' && setMenu(false); document.addEventListener('mousedown', onDoc); document.addEventListener('keydown', onKey); return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); }; }, [menu]);

  const sideNav = (
    <nav aria-label="Assessment navigation" className="flex flex-1 flex-col gap-6 overflow-auto">
      {current && (
        <div>
          <div className="faint mb-2 flex items-center justify-between px-3 text-[11px] font-semibold uppercase tracking-[0.12em]"><span>Stages</span><span aria-label={`${stageStatus?.filter(Boolean).length || 0} of ${STAGES.length} complete`}>{stageStatus?.filter(Boolean).length || 0}/{STAGES.length}</span></div>
          <ol className="space-y-0.5">{STAGES.map((s, i) => { const n = i + 1; const done = stageStatus?.[i]; const isCurrent = route === 'author' && stage === n; return (
            <li key={s.id}><button className="side-item" aria-current={isCurrent ? 'step' : undefined} onClick={nav(() => onStage?.(n))} disabled={!onStage}>
              <span className={`dot ${done && !isCurrent ? 'done' : ''}`} aria-hidden="true">{done && !isCurrent ? '✓' : n}</span>
              <span className="leading-tight"><span className="block">{s.label}{done && !isCurrent && <span className="sr-only"> (complete)</span>}</span><span className="faint block text-[11px] font-normal">{s.hint}</span></span>
            </button></li>); })}
          {onCalibration && current.scenarios?.some((s) => s.responseType !== 'MCQ') && <li><button className="side-item mt-1" aria-current={route === 'calibration' ? 'page' : undefined} onClick={nav(onCalibration)}><span className="dot" aria-hidden="true">◎</span><span className="leading-tight"><span className="block">Calibration</span><span className="faint block text-[11px] font-normal">Activate AI scoring</span></span></button></li>}
          </ol>
        </div>
      )}
      <div>
        <div className="faint mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em]">Quick actions</div>
        <button className="side-item" onClick={nav(goHome)}><Icon d={I.home} size={16} />All your products</button>
        <button className="side-item" onClick={nav(() => createAssessment())}><Icon d={I.plus} size={16} />New assessment</button>
        <button className="side-item" onClick={nav(() => setRoute('templates'))}><Icon d={I.template} size={16} />Templates</button>
        {sample && <button className="side-item" onClick={nav(() => openAssessment(sample.id))}><Icon d={I.star} size={16} />Sample assessment</button>}
        <button className="side-item" onClick={nav(() => openPanel('settings'))}><Icon d={I.gear} size={16} />Workspace settings</button>
        <button className="side-item" onClick={nav(() => openPanel('help'))}><Icon d={I.help} size={16} />Help and support</button>
      </div>
    </nav>
  );

  return (
    <div className="flex min-h-full flex-col">
      <a href="#main" className="skip-link">Skip to main content</a>
      <header className="no-print sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--panel)]/95 backdrop-blur">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 md:px-6">
          <div className="flex items-center gap-2">
            {sidebar && <span className="md:hidden"><Tooltip label="Open assessment menu" hint="Stages, calibration and quick actions" align="start"><button onClick={() => setDrawer(true)} aria-label="Open assessment menu" aria-expanded={drawer} className="icon-btn"><Icon d={I.menu} /></button></Tooltip></span>}
            <Logo onClick={goHome} />
            <span className="faint hidden text-xs sm:inline">NanoAI</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden w-64 md:block lg:w-80">
              <label htmlFor="product-search" className="sr-only">Search products</label>
              <span className="pointer-events-none absolute left-3 top-2.5 text-[var(--ink-3)]"><Icon d={I.search} size={16} /></span>
              <input id="product-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products..." className="w-full rounded-full border border-[var(--line)] bg-[var(--card)] py-2 pl-9 pr-3 text-sm" role="combobox" aria-autocomplete="list" aria-controls="product-search-results" aria-expanded={results.length > 0} />
              {results.length > 0 && <ul id="product-search-results" role="listbox" aria-label="Matching products" className="card absolute z-50 mt-1 w-full overflow-hidden shadow-lg">{results.map((a) => <li key={a.id} role="option" aria-selected="false"><button className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-[var(--card-3)]" onClick={() => { openAssessment(a.id); setQ(''); }}><span>{a.config.name || 'Untitled assessment'}</span><Badge tone={a.status === 'published' ? 'ok' : 'neutral'}>{a.status}</Badge></button></li>)}</ul>}
            </div>
            <Tooltip label="Home" hint="Back to All your products"><button className="icon-btn" onClick={goHome} aria-label="Home"><Icon d={I.home} size={16} /></button></Tooltip>
            <Tooltip label={saveStatus?.ok === false ? 'Not saved' : 'All changes saved'} hint={saveStatus?.ok === false ? (saveStatus.reason === 'quota' ? 'Browser storage is full. Export your workspace from Workspace settings.' : saveStatus.reason === 'unavailable' ? 'This window does not allow saving. Export your workspace from Workspace settings to keep a copy.' : 'Your latest change could not be saved. Keep this tab open and try again.') : 'Your work saves automatically as you go'} align="end"><span className="icon-btn" role="status" aria-live="polite" tabIndex={0} style={{ color: saveStatus?.ok === false ? 'var(--block)' : 'var(--ok)' }}><Icon d={I.cloud} size={16} /><span className="sr-only">{saveStatus?.ok === false ? (saveStatus.reason === 'quota' ? 'Storage full, work not saved. Export your workspace.' : 'Not saved') : 'All changes saved'}</span></span></Tooltip>
            <div className="relative" ref={menuRef}>
              <Tooltip label="Account menu" hint="Workspace settings, help and your role" align="end" off={menu}><button className="icon-btn" onClick={() => setMenu(!menu)} aria-label="Account menu" aria-haspopup="menu" aria-expanded={menu}><Icon d={I.user} size={16} /></button></Tooltip>
              {menu && (
                <div role="menu" aria-label="Account" className="card absolute right-0 z-50 mt-1 w-64 overflow-hidden p-1 shadow-lg">
                  <div className="px-3 py-2 text-sm"><div className="font-semibold">{ws.author || 'Author'}</div><div className="faint text-xs">{ws.name} · {role}</div></div>
                  <button role="menuitem" className="side-item" onClick={nav(() => openPanel('settings'))}><Icon d={I.gear} size={16} />Workspace settings</button>
                  <button role="menuitem" className="side-item" onClick={nav(() => openPanel('help'))}><Icon d={I.help} size={16} />Help and support</button>
                  <button role="menuitem" className="side-item" onClick={nav(() => setRoute('templates'))}><Icon d={I.template} size={16} />Templates</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <div className="flex flex-1">
        {sidebar && (
          <>
            {drawer && <div className="fixed inset-0 z-40 bg-black/70 md:hidden" onClick={() => setDrawer(false)} aria-hidden="true" />}
            <aside aria-label="Assessment sidebar" className={`no-print ${drawer ? 'fixed inset-y-0 left-0 z-50 flex w-72 shadow-2xl' : 'sticky top-[57px] hidden md:flex'} h-[calc(100vh-57px)] w-64 shrink-0 flex-col border-r border-[var(--line)] bg-[var(--panel)] px-4 py-5`}>
              {drawer && <button className="mb-3 self-end text-sm text-[var(--ink-2)] underline" onClick={() => setDrawer(false)}>Close menu</button>}
              {sideNav}
            </aside>
          </>
        )}
        <main id="main" tabIndex={-1} className={`min-w-0 flex-1 ${sidebar ? '' : 'grid-bg'}`}>
          <div className={`mx-auto w-full ${sidebar ? 'px-4 py-5 md:px-6' : 'max-w-6xl px-4 py-6 md:px-8'}`}>
            {(back || crumbs.length > 0 || title) && (
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  {back && <button onClick={back.onClick} className="mb-2 inline-flex min-h-[32px] items-center gap-1.5 rounded-full border border-[var(--line)] bg-[var(--card)] px-3 text-sm text-[var(--ink-2)] hover:text-[var(--ink)]"><Icon d={I.back} size={14} />{back.label || 'Back'}</button>}
                  {crumbs.length > 0 && <nav aria-label="Breadcrumb" className="faint mb-1 text-xs"><ol className="flex flex-wrap items-center gap-1.5">{crumbs.map((c, i) => <li key={i} className="flex items-center gap-1.5">{i > 0 && <span aria-hidden="true">/</span>}{c.onClick ? <button className="underline-offset-2 hover:text-[var(--ink)] hover:underline" onClick={c.onClick}>{c.label}</button> : <span aria-current={i === crumbs.length - 1 ? 'page' : undefined} className={i === crumbs.length - 1 ? 'font-medium text-[var(--ink)]' : ''}>{c.label}</span>}</li>)}</ol></nav>}
                  {title && <h1 className="text-xl font-semibold">{title}</h1>}
                  {subtitle && <p className="muted mt-0.5 max-w-3xl text-sm">{subtitle}</p>}
                </div>
                {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
              </div>
            )}
            {children}
          </div>
        </main>
      </div>
      <Modal open={panel === 'settings'} title="Workspace settings" onClose={closePanel} wide><Settings /></Modal>
      <Modal open={panel === 'help'} title="Help and support" onClose={closePanel} wide><Help /></Modal>
    </div>
  );
}
