import React, { useState } from 'react';
import { useGame } from '../engine/GameContext.jsx';
import { Panel, Button, Field, inputClass, Notice } from '../components/ui.jsx';
import { LEVELS } from '../content/index.js';

export default function Intro({ onOpenFacilitator }) {
  const { state, dispatch } = useGame();
  const [name, setName] = useState(state.learner.name || '');
  const [cohort, setCohort] = useState(state.learner.cohort || '');
  const [mode, setMode] = useState(state.learner.mode || 'solo');
  const [roles, setRoles] = useState(state.learner.roles || { pm: '', eng: '', gov: '' });
  const [baselineText, setBaselineText] = useState(state.baseline ? JSON.stringify(state.baseline) : '');
  const [baselineError, setBaselineError] = useState('');
  const hasSave = Boolean(state.startedAt);

  const start = () => {
    let baseline = null;
    if (baselineText.trim()) {
      try {
        const parsed = JSON.parse(baselineText);
        const keys = ['commercial', 'reliability', 'governance', 'stakeholder'];
        if (!keys.every((k) => typeof parsed[k] === 'number')) throw new Error('Baseline needs numeric commercial, reliability, governance and stakeholder.');
        baseline = parsed;
      } catch (e) { setBaselineError(e.message); return; }
    }
    dispatch({ type: 'START', learner: { name, cohort, mode, roles: mode === 'team' ? roles : { pm: name, eng: '', gov: '' } }, baseline });
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="mb-8">
        <div className="font-mono text-xs tracking-[0.3em] text-amber-400">KNOLSKAPE AI PRODUCT MANAGEMENT PROGRAM</div>
        <h1 className="mt-2 text-5xl font-semibold tracking-tight text-zinc-50">LAUNCH WINDOW</h1>
        <p className="mt-3 max-w-2xl text-zinc-300">You have joined Helios Works, a B2B software company with 2,400 enterprise customers, as its first AI Product Manager. The CEO has told the market that "Helios Assist" ships this quarter. You have eight sprints, three budgets and four readiness meters. Every decision carries forward.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Panel title="The quarter" subtitle="Eight sprints. Each maps to a named AI PM skill.">
            <ol className="grid gap-2 sm:grid-cols-2">
              {LEVELS.map((l) => (
                <li key={l.id} className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
                  <div className="font-mono text-[11px] text-amber-300">SPRINT {l.id}</div>
                  <div className="text-sm font-medium text-zinc-100">{l.title}</div>
                  <div className="text-xs text-zinc-500">{l.skill}</div>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title="Currencies and meters">
            <div className="grid gap-3 text-sm text-zinc-300 sm:grid-cols-2">
              <div><span className="text-zinc-100">Compute Credits</span>: inference, evals and vendor spend.</div>
              <div><span className="text-zinc-100">Team Hours</span>: engineering and data science capacity.</div>
              <div><span className="text-zinc-100">Political Capital</span>: spent pushing decisions through, earned by keeping commitments.</div>
              <div><span className="text-zinc-100">Readiness Meters</span>: Commercial, Reliability, Governance, Stakeholder. They form your final score.</div>
            </div>
          </Panel>
        </div>
        <div className="space-y-4">
          {hasSave && (
            <Notice tone="amber">
              A saved game exists for {state.learner.name || 'this learner'} (Sprint {state.currentLevel}).
              <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => dispatch({ type: 'GOTO_LEVEL', level: state.currentLevel })}>Resume</Button><Button size="sm" variant="secondary" onClick={() => { if (confirm('Start over? The saved game will be erased.')) dispatch({ type: 'RESET' }); }}>Start over</Button></div>
            </Notice>
          )}
          <Panel title="Learner setup">
            <div className="space-y-3">
              <Field label="Name"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="Cohort"><input className={inputClass} value={cohort} onChange={(e) => setCohort(e.target.value)} placeholder="e.g. AI PM Core, Sep 2026" /></Field>
              <Field label="Mode" hint="Team mode is pass-and-play. Roles see different information panels; the AI PM submits.">
                <div className="flex gap-2">
                  {['solo', 'team'].map((m) => <button key={m} onClick={() => setMode(m)} className={`rounded border px-3 py-1.5 text-xs capitalize ${mode === m ? 'border-amber-400 text-amber-200' : 'border-zinc-700 text-zinc-400'}`}>{m}</button>)}
                </div>
              </Field>
              {mode === 'team' && (
                <div className="grid gap-2">
                  <Field label="AI PM (owns decisions)"><input className={inputClass} value={roles.pm} onChange={(e) => setRoles({ ...roles, pm: e.target.value })} /></Field>
                  <Field label="Engineering Partner (Sprints 2 and 3 inputs)"><input className={inputClass} value={roles.eng} onChange={(e) => setRoles({ ...roles, eng: e.target.value })} /></Field>
                  <Field label="Governance Liaison (Sprint 5 and dossier)"><input className={inputClass} value={roles.gov} onChange={(e) => setRoles({ ...roles, gov: e.target.value })} /></Field>
                </div>
              )}
              <Field label="Module 0 baseline (optional JSON)" hint='Example: {"commercial":42,"reliability":38,"governance":35,"stakeholder":50}'>
                <textarea className={`${inputClass} min-h-[60px] font-mono text-xs`} value={baselineText} onChange={(e) => { setBaselineText(e.target.value); setBaselineError(''); }} />
                {baselineError && <span className="text-xs text-sky-300">{baselineError}</span>}
              </Field>
              <Button className="w-full" size="lg" disabled={!name.trim()} onClick={start}>{hasSave ? 'Start a new quarter' : 'Enter the launch window'}</Button>
              <button onClick={onOpenFacilitator} className="w-full text-center text-xs text-zinc-500 hover:text-zinc-300">Facilitator settings (API key, model, cost counter)</button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
