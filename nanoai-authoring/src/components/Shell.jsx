import React from 'react';
import { Button, Badge, Kbd } from './ui.jsx';
import { useWorkspace } from '../engine/WorkspaceContext.jsx';
import { llmAvailable, loadSettings, DEFAULT_MODEL } from '../engine/llm.js';

export default function Shell({ children, sub }) {
  const { ws, route, setRoute, goHome, current, undo, redo, canUndo, canRedo } = useWorkspace();
  const ai = llmAvailable();
  return (
    <div className="flex min-h-full flex-col">
      <header className="no-print sticky top-0 z-40 border-b border-[var(--line)] bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5">
          <div className="flex items-center gap-3">
            <button onClick={goHome} className="flex items-center gap-2 rounded-lg px-1 py-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]" aria-label="NanoAI Authoring home">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--brand)] text-xs font-bold text-white">N</span>
              <span className="text-sm font-semibold">NanoAI <span className="muted font-normal">Authoring</span></span>
            </button>
            <span className="faint hidden text-xs sm:inline">GenieKreator · Evaluate</span>
            <Badge tone={ai ? 'ok' : 'neutral'} title={ai ? `AI generation with ${loadSettings().model || DEFAULT_MODEL}` : 'No API key: scripted library mode'}>{ai ? 'AI assisted' : 'Scripted mode'}</Badge>
          </div>
          <div className="flex items-center gap-1.5">
            {route === 'author' && current && (
              <>
                <Button variant="ghost" size="sm" onClick={undo} disabled={!canUndo} title="Undo (whole session)">Undo</Button>
                <Button variant="ghost" size="sm" onClick={redo} disabled={!canRedo} title="Redo">Redo</Button>
                <span className="mx-1 h-5 w-px bg-[var(--line)]" />
              </>
            )}
            <Button variant={route === 'home' ? 'secondary' : 'ghost'} size="sm" onClick={goHome}>Assessments</Button>
            <Button variant={route === 'settings' ? 'secondary' : 'ghost'} size="sm" onClick={() => setRoute('settings')}>Settings</Button>
          </div>
        </div>
        {sub && <div className="border-t border-[var(--line)] bg-white"><div className="mx-auto max-w-7xl px-4 py-2">{sub}</div></div>}
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      <footer className="no-print faint mx-auto w-full max-w-7xl px-4 py-4 text-[11px]">Workspace: {ws.name}. Autosaved in this browser after every change. <Kbd>Ctrl</Kbd>+<Kbd>Enter</Kbd> commits an inline edit, <Kbd>Esc</Kbd> cancels.</footer>
    </div>
  );
}
