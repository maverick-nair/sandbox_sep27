import React from 'react';
import { useGame } from '../engine/GameContext.jsx';
import { METER_LABELS, BADGES, OUTCOMES } from '../content/index.js';
import { Panel, Button, Tag, StatRow } from '../components/ui.jsx';
import { SkillsRadar } from '../components/Shell.jsx';
import { judgmentConsistency } from '../engine/state.js';
import { assessDecisions, reinforcementSkills } from '../engine/debrief.js';

export default function Debrief() {
  const { state, dispatch } = useGame();
  const consistency = judgmentConsistency(state);
  const { best, costliest } = assessDecisions(state);
  const reinforce = reinforcementSkills(state);
  const outcome = state.levelResults[8]?.detail?.outcome ? OUTCOMES.find((o) => o.id === state.levelResults[8].detail.outcome) : null;
  const avg = Math.round(Object.values(state.meters).reduce((a, b) => a + b, 0) / 4);
  const minutes = state.activeMinutes ?? (state.startedAt ? Math.round((Date.now() - state.startedAt) / 60000) : 0);
  const [confirmNew, setConfirmNew] = React.useState(false);

  return (
    <div className="print-page">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-mono text-xs tracking-[0.3em] text-amber-400">READINESS REPORT</div>
          <h1 className="mt-1 text-3xl font-semibold text-zinc-50">{state.learner.name || 'Learner'}</h1>
          <p className="text-sm text-zinc-400">{state.learner.cohort || 'KNOLSKAPE AI PM program'}. Completed {new Date(state.levelResults[8]?.completedAt || Date.now()).toLocaleDateString()}. Active play time about {minutes} minutes. Mode: {state.learner.mode}.</p>
        </div>
        <div className="no-print flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => { try { window.print(); } catch (e) { console.warn('Print blocked in this embed', e); } }}>Export as PDF</Button>
          <Button variant="ghost" onClick={() => dispatch({ type: 'GOTO_LEVEL', level: 8 })}>Back to Sprint 8</Button>
          {!confirmNew && <Button variant="ghost" onClick={() => setConfirmNew(true)}>Start a new quarter</Button>}
          {confirmNew && <><span className="text-xs text-zinc-300">This erases the saved game. Export it from the Facilitator view first if you need it.</span><Button size="sm" variant="danger" onClick={() => dispatch({ type: 'RESET' })}>Erase and start over</Button><Button size="sm" variant="ghost" onClick={() => setConfirmNew(false)}>Keep it</Button></>}
        </div>
      </div>

      {outcome && (
        <Panel title="Launch outcome" className="mb-4 border-amber-500/40" right={<Tag tone="amber">{outcome.label}</Tag>}>
          <p className="text-sm text-zinc-200">{outcome.narrative}</p>
        </Panel>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <Panel title="Readiness meters against Module 0 baseline" subtitle={state.baseline ? 'Baseline from the Module 0 assessment JSON.' : 'No baseline JSON was provided; the sandbox start value of 50 is shown as baseline.'}>
          <div className="space-y-3">
            {Object.entries(state.meters).map(([k, v]) => {
              const base = state.baseline?.[k] ?? 50;
              const delta = v - base;
              return (
                <div key={k}>
                  <div className="flex items-baseline justify-between text-sm"><span className="text-zinc-200">{METER_LABELS[k]}</span><span className="font-mono text-zinc-300">{base} to {v} <span className={delta >= 0 ? 'text-amber-300' : 'text-sky-300'}>({delta >= 0 ? '+' : ''}{delta})</span></span></div>
                  <div className="relative mt-1 h-3 rounded bg-zinc-800">
                    <div className="absolute left-0 top-0 h-3 rounded bg-zinc-600" style={{ width: `${base}%` }} title={`Baseline ${base}`} />
                    <div className="absolute left-0 top-0 h-3 rounded bg-amber-400/80" style={{ width: `${v}%` }} title={`Now ${v}`} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4"><StatRow items={[{ label: 'Readiness average', value: avg }, { label: 'Judgment consistency', value: consistency.score }, { label: 'XP', value: state.xp }, { label: 'Liability cards', value: state.liabilities.length }]} /></div>
        </Panel>
        <Panel title="Skills radar">
          <SkillsRadar meters={state.meters} consistency={consistency.score} size={250} />
          {consistency.notes.length > 0 && <ul className="mt-2 space-y-1 text-xs text-zinc-400">{consistency.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Three best decisions">
          <ol className="space-y-3">
            {best.map((d, i) => <li key={i} className="rounded border border-amber-500/30 bg-amber-500/5 p-3 text-sm"><div className="font-mono text-[11px] text-amber-300">SPRINT {d.level}</div><div className="text-zinc-100">{d.text}</div>{d.stronger && <div className="mt-1 text-xs text-zinc-400">Why it mattered: {d.stronger}</div>}</li>)}
            {best.length === 0 && <li className="text-sm text-zinc-400">No decisions crossed the bar for a highlight. The costliest list is where the learning is.</li>}
          </ol>
        </Panel>
        <Panel title="Three costliest decisions" subtitle="Each with what a stronger move would have been.">
          <ol className="space-y-3">
            {costliest.map((d, i) => <li key={i} className="rounded border border-sky-500/30 bg-sky-500/5 p-3 text-sm"><div className="font-mono text-[11px] text-sky-300">SPRINT {d.level}</div><div className="text-zinc-100">{d.text}</div><div className="mt-1 text-xs text-zinc-300">Stronger move: {d.stronger}</div></li>)}
            {costliest.length === 0 && <li className="text-sm text-zinc-400">No costly decisions recorded. Consistency across all eight sprints is rare; the radar shows where the remaining headroom is.</li>}
          </ol>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Two skills to carry into AI Koach reinforcement">
          <ol className="space-y-3">
            {reinforce.map((s, i) => <li key={i} className="rounded border border-zinc-800 p-3 text-sm"><div className="flex items-center justify-between"><span className="text-zinc-100">{s.skill}</span><Tag>{s.meter} {s.value}</Tag></div><p className="mt-1 text-xs text-zinc-400">{s.koach}</p></li>)}
          </ol>
        </Panel>
        <Panel title="Badges earned" subtitle="Each names the skill it certifies.">
          <ul className="space-y-2">
            {state.badges.map((b) => <li key={b} className="flex items-baseline justify-between gap-3 text-sm"><span className="text-amber-200">{BADGES[b]?.label || b}</span><span className="text-right text-xs text-zinc-400">{BADGES[b]?.skill}</span></li>)}
            {state.badges.length === 0 && <li className="text-sm text-zinc-400">No badges earned.</li>}
          </ul>
          {state.liabilities.length > 0 && <div className="mt-3"><div className="text-[11px] uppercase tracking-wider text-zinc-400">Liability cards drawn</div><ul className="mt-1 space-y-1 text-xs text-zinc-300">{state.liabilities.map((l) => <li key={l.id}>{l.source}: {l.text}</li>)}</ul></div>}
        </Panel>
      </div>

      <Panel title="Sprint scores" className="mt-4">
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => <div key={n} className="rounded border border-zinc-800 bg-zinc-950/60 p-2 text-center"><div className="font-mono text-[10px] text-zinc-400">S{n}</div><div className="font-mono text-lg text-zinc-100">{state.levelResults[n]?.score ?? '-'}</div></div>)}
        </div>
      </Panel>
      <p className="no-print mt-2 text-xs text-zinc-400">If Export as PDF does nothing, this page is running inside an embed that blocks printing. Open the sandbox in its own browser tab, or use the browser's own Print command.</p>
      <p className="mt-4 text-[11px] text-zinc-500">KNOLSKAPE AI PM Sandbox readiness report. Judge scores that used a neutral fallback are marked in the facilitator decision log.</p>
    </div>
  );
}
