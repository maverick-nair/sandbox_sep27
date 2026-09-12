import React, { useState } from 'react';
import { useGame } from '../engine/GameContext.jsx';
import { LEVELS, METER_LABELS, EVENT_DECK } from '../content/index.js';
import { Meter, Button, Tag, Panel, Notice } from './ui.jsx';
import { judgmentConsistency } from '../engine/state.js';

export function TopBar({ onOpenFacilitator, onOpenPRD }) {
  const { state } = useGame();
  const c = state.currencies;
  return (
    <header className="no-print sticky top-0 z-30 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-x-6 gap-y-2 px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold tracking-widest text-zinc-950">KNOLSKAPE</span>
          <span className="font-mono text-sm tracking-widest text-zinc-100">LAUNCH WINDOW</span>
          <span className="hidden text-xs text-zinc-400 sm:inline">Helios Works, Q3</span>
        </div>
        <div className="flex items-center gap-4 font-mono text-xs">
          <Currency label="Compute" value={c.compute} unit="cr" help="Compute Credits: budget for inference, evals and vendor spend. Spent by architecture and margin decisions and some events." />
          <Currency label="Team hours" value={c.hours} unit="h" help="Team Hours: engineering and data science capacity. Spent on discovery flips, eval tuning, UX tiles and incident response." />
          <Currency label="Political capital" value={c.capital} unit="pc" help="Political Capital: stakeholder goodwill. Spent on long negotiations (turns after five) and pushing decisions through, earned by keeping commitments." />
          <span className="text-zinc-400" title="Experience points. Multiplied by 1.25 when a decision cites evidence from an earlier sprint. Streak bonus for consecutive strong sprints.">XP <span className="text-amber-300">{state.xp}</span></span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={onOpenPRD}>Living PRD</Button>
          <Button size="sm" variant="ghost" onClick={onOpenFacilitator}>Facilitator</Button>
        </div>
      </div>
      <div className="mx-auto flex max-w-[1500px] flex-wrap gap-4 px-4 pb-2">
        {Object.entries(state.meters).map(([k, v]) => <div key={k} title={METER_HELP[k]} tabIndex={0} aria-label={`${METER_LABELS[k]} ${v} of 100. ${METER_HELP[k]}`}><Meter label={METER_LABELS[k]} value={v} /></div>)}
        <span className="self-end text-[11px] text-zinc-400">Hover or focus a meter or currency for what moves it.</span>
      </div>
    </header>
  );
}

const METER_HELP = {
  commercial: 'Commercial readiness: adoption forecast, gross margin per feature, pricing fit. Moved by Sprints 1, 2, 4, 6 and 7.',
  reliability: 'Reliability readiness: eval pass rate, incident count, hallucination exposure. Moved by Sprints 2, 3, 6 and 7.',
  governance: 'Governance readiness: regulatory gates, documentation, risk sign-offs. Moved by Sprints 1, 4, 5, 6 and 7.',
  stakeholder: 'Stakeholder readiness: approvals won, trust per persona, commitments honored. Moved by Sprints 3, 5, 7 and 8.',
};

function Currency({ label, value, unit, help }) {
  const low = value < 15;
  return (
    <span className="flex items-baseline gap-1" title={help} tabIndex={0} aria-label={`${label} ${value} ${unit}. ${help}`}>
      <span className="text-zinc-400">{label}</span>
      <span className={low ? 'text-sky-300' : 'text-zinc-100'}>{value}</span>
      <span className="text-zinc-400">{unit}</span>
    </span>
  );
}

export function LevelNav() {
  const { state, dispatch } = useGame();
  return (
    <nav aria-label="Sprints" className="no-print flex flex-wrap gap-1.5">
      {LEVELS.map((l) => {
        const status = state.levelStatus[l.id];
        const active = state.phase === 'playing' && state.currentLevel === l.id;
        const cls = status === 'locked' ? 'border-zinc-800 text-zinc-500' : status === 'complete' ? 'border-amber-500/40 text-amber-200' : 'border-zinc-600 text-zinc-200';
        return (
          <button key={l.id} disabled={status === 'locked'} onClick={() => dispatch({ type: 'GOTO_LEVEL', level: l.id })}
            className={`rounded border px-2.5 py-1 text-xs ${cls} ${active ? 'bg-zinc-800' : 'bg-zinc-950'} disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400`}
            aria-current={active ? 'step' : undefined}>
            <span className="font-mono">S{l.id}</span> <span className="hidden md:inline">{l.title}</span>
          </button>
        );
      })}
    </nav>
  );
}

export function PRDPanel({ open, onClose }) {
  const { state } = useGame();
  if (!open) return null;
  const sections = [
    ['scope', 'Scope'], ['technical', 'Technical requirements'], ['evals', 'Eval results'], ['margin', 'Margin model'],
    ['governance', 'Governance sign-offs'], ['trust', 'Trust design'], ['postmortem', 'Incident postmortem'],
  ];
  return (
    <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-md overflow-y-auto border-l border-zinc-800 bg-zinc-950 p-5 shadow-2xl" aria-label="Living PRD">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-mono text-sm tracking-widest text-amber-300">HELIOS ASSIST PRD</h2>
        <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
      </div>
      <p className="mb-4 text-xs text-zinc-400">Builds up level by level. Attach sections as evidence in stakeholder conversations.</p>
      <div className="space-y-3">
        {sections.map(([k, label]) => (
          <div key={k} className="rounded border border-zinc-800 p-3">
            <div className="mb-1 flex items-center justify-between"><span className="text-xs uppercase tracking-wider text-zinc-400">{label}</span>{state.prd[k] ? <Tag tone="amber">Complete</Tag> : <Tag>Pending</Tag>}</div>
            <p className="whitespace-pre-wrap text-sm text-zinc-200">{state.prd[k] || 'Not yet written.'}</p>
          </div>
        ))}
      </div>
    </aside>
  );
}

export function LevelHeader({ level }) {
  const meta = LEVELS.find((l) => l.id === level);
  return (
    <div className="mb-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
        <span className="font-mono text-amber-300">SPRINT {level} OF 8</span>
        <span>Module: {meta.module}</span>
        <span>Skill: {meta.skill}</span>
        <span>Meters: {meta.meters.map((m) => METER_LABELS[m]).join(', ')}</span>
      </div>
      <h1 className="mt-1 text-2xl font-semibold text-zinc-50">{meta.title}</h1>
      {level !== 5 && <p className="mt-2 rounded border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 xl:hidden">This sprint uses a canvas designed for a 1280 pixel wide screen. Keyboard placement works at any width; the chat sprints have a simplified narrow view.</p>}
    </div>
  );
}

// Event card drawn at the start of each level from Level 3 onward.
export function EventCard({ level }) {
  const { state, dispatch, log } = useGame();
  const [dismissed, setDismissed] = useState(false);
  const drawnId = state.events.drawn[level];
  const alreadyComplete = state.levelStatus[level] === 'complete';
  // One event is injected automatically on first entry to Sprints 3 to 8.
  React.useEffect(() => {
    if (level < 3 || drawnId || alreadyComplete) return;
    const remaining = state.events.deck.filter((id) => !Object.values(state.events.drawn).includes(id));
    const ev = EVENT_DECK.find((e) => e.id === remaining[0]);
    dispatch({ type: 'DRAW_EVENT', level, effects: ev?.effects });
    if (ev) log({ type: 'event', summary: `Event drawn: ${ev.title}`, detail: ev.text });
  }, [level, drawnId, alreadyComplete]); // eslint-disable-line
  if (level < 3 || !drawnId) return null;
  const ev = EVENT_DECK.find((e) => e.id === drawnId);
  if (!ev) return null;
  const resolved = state.events.resolved[level];
  if (dismissed && (!ev.decision || resolved)) return null;
  return (
    <Panel title="Event" subtitle={ev.title} className="mb-4 border-sky-500/30" right={<Tag tone="sky">Random event</Tag>}>
      <p className="text-sm text-zinc-200">{ev.text}</p>
      <p className="mt-1 text-xs text-zinc-400">Effects applied: {describeEffects(ev.effects)}</p>
      {ev.decision && !resolved && (
        <div className="mt-3">
          <p className="mb-2 text-sm text-zinc-300">{ev.decision.prompt}</p>
          <div className="flex flex-wrap gap-2">
            {ev.decision.options.map((o) => (
              <Button key={o.id} size="sm" variant="secondary" onClick={() => {
                dispatch({ type: 'RESOLVE_EVENT', level, optionId: o.id, effects: o.effects });
                log({ type: 'event-decision', summary: `${ev.title}: ${o.label}`, detail: o.note });
              }} title={o.note}>{o.label}</Button>
            ))}
          </div>
        </div>
      )}
      {(resolved || !ev.decision) && (
        <div className="mt-3 flex items-center justify-between">
          {resolved && <span className="text-xs text-zinc-400">You chose: {ev.decision.options.find((o) => o.id === resolved)?.label}</span>}
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>Dismiss</Button>
        </div>
      )}
    </Panel>
  );
}

export function describeEffects(effects = {}) {
  const parts = [];
  Object.entries(effects.meters || {}).forEach(([k, v]) => parts.push(`${METER_LABELS[k]} ${v > 0 ? '+' : ''}${v}`));
  Object.entries(effects.currencies || {}).forEach(([k, v]) => parts.push(`${k} ${v > 0 ? '+' : ''}${v}`));
  return parts.length ? parts.join(', ') : 'none';
}

// Shown after a level is scored. Feedback names the stronger move rather than saying "wrong".
export function LevelResult({ level, result, onContinue, replay }) {
  const ref = React.useRef(null);
  React.useEffect(() => { if (!replay) ref.current?.focus(); }, [replay]);
  return (
    <div ref={ref} tabIndex={-1} aria-live="polite" role="region" aria-label={`Sprint ${level} scored ${result.score} out of 100`} className="focus:outline-none">
    {replay && <p className="mt-4 text-xs text-zinc-400">You are reviewing a completed sprint. The board shows your final placements and cannot be changed.</p>}
    <Panel title={`Sprint ${level} scored`} className="mt-4 border-amber-500/40">
      <div className="grid gap-4 md:grid-cols-3">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-400">Level score</div>
          <div className="font-mono text-4xl text-amber-300">{result.score}<span className="text-lg text-zinc-400">/100</span></div>
          <div className="mt-1 text-xs text-zinc-400">XP +{result.xpGain ?? result.xp}{result.streakBonus ? ` (includes streak bonus ${result.streakBonus})` : ''}{result.evidenceReferenced ? ', evidence multiplier applied' : ''}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-400">Meter changes</div>
          <ul className="mt-1 text-sm text-zinc-200">{Object.entries(result.meterDeltas || {}).map(([k, v]) => <li key={k}>{METER_LABELS[k]} {v > 0 ? '+' : ''}{v}</li>)}</ul>
          {result.badges?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{result.badges.map((b) => <Tag key={b} tone="amber">{b.replace(/_/g, ' ')}</Tag>)}</div>}
          {result.liabilities?.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{result.liabilities.map((l) => <Tag key={l.id} tone="sky">Liability: {l.text}</Tag>)}</div>}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-400">Feedback</div>
          <ul className="mt-1 space-y-1 text-sm text-zinc-300">{(result.feedback || []).map((f, i) => <li key={i}>{f}</li>)}</ul>
        </div>
      </div>
      <div className="mt-4 flex justify-end"><Button onClick={onContinue}>{level === 8 ? 'Open debrief' : 'Continue to next sprint'}</Button></div>
    </Panel>
    </div>
  );
}

// Team mode: role inputs must be acknowledged or a reason logged before the AI PM submits.
export function TeamInputs({ level, inputs, onReady }) {
  const { state, dispatch } = useGame();
  const [acks, setAcks] = useState({});
  const [reasons, setReasons] = useState({});
  if (state.learner.mode !== 'team') return null;
  const roles = state.learner.roles;
  const relevant = inputs.filter((i) => i.roles.includes('eng') || i.roles.includes('gov'));
  const recorded = state.teamLog.some((t) => t.level === level);
  const [activeRole, setActiveRole] = useState('eng');
  const roleName = { eng: `Engineering Partner (${roles.eng || 'unnamed'})`, gov: `Governance Liaison (${roles.gov || 'unnamed'})`, pm: `AI PM (${roles.pm || 'unnamed'})` };
  const visible = activeRole === 'pm' ? relevant : relevant.filter((i) => i.roles.includes(activeRole));
  return (
    <Panel title="Team inputs" subtitle="Pass-and-play. Hand the screen to each role in turn; only that role's panel is shown. The AI PM records the inputs and submits." className="mb-4">
      <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Active role">
        {['eng', 'gov', 'pm'].map((r) => <button key={r} role="tab" aria-selected={activeRole === r} onClick={() => setActiveRole(r)} className={`rounded border px-3 py-1 text-xs ${activeRole === r ? 'border-amber-400 text-amber-200' : 'border-zinc-700 text-zinc-400'}`}>{roleName[r]}</button>)}
        <span className="self-center text-xs text-zinc-400">{activeRole === 'pm' ? 'AI PM view: all inputs, record and submit.' : 'Read your panel, then hand over to the next role.'}</span>
      </div>
      <div className="space-y-3">
        {visible.map((i) => (
          <div key={i.id} className="rounded border border-zinc-800 p-3">
            <div className="text-xs uppercase tracking-wider text-zinc-400">{i.roles.includes('eng') ? `Engineering Partner (${roles.eng || 'unnamed'})` : `Governance Liaison (${roles.gov || 'unnamed'})`}</div>
            <p className="mt-1 text-sm text-zinc-200">{i.text}</p>
            {activeRole === 'pm' && (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(acks[i.id])} onChange={(e) => setAcks({ ...acks, [i.id]: e.target.checked })} /> Input considered by the AI PM</label>
                {!acks[i.id] && <input className="flex-1 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm" placeholder="Or log a reason for setting it aside" value={reasons[i.id] || ''} onChange={(e) => setReasons({ ...reasons, [i.id]: e.target.value })} aria-label={`Reason for setting aside ${i.id}`} />}
              </div>
            )}
          </div>
        ))}
      </div>
      {activeRole === 'pm' && <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-zinc-400">Ignoring a role without a logged reason costs 3 Stakeholder.</span>
        <Button size="sm" variant="secondary" disabled={recorded} onClick={() => {
          relevant.forEach((i) => dispatch({ type: 'TEAM_LOG', entry: { input: i.id, considered: Boolean(acks[i.id]), reason: reasons[i.id] || '' } }));
          onReady?.();
        }}>{recorded ? 'Team inputs recorded' : 'Record team inputs'}</Button>
      </div>}
    </Panel>
  );
}

// Team mode: Stakeholder penalty for role inputs ignored without a logged reason (or never recorded).
export function teamPenalty(state, level, inputCount = 2) {
  if (state.learner.mode !== 'team') return 0;
  const entries = state.teamLog.filter((t) => t.level === level);
  if (entries.length === 0) return 3 * inputCount;
  return 3 * entries.filter((t) => !t.considered && !(t.reason || '').trim()).length;
}

export function SkillsRadar({ meters, consistency, size = 220 }) {
  const axes = [...Object.keys(meters), 'judgment'];
  const values = [...Object.values(meters), consistency];
  const labels = { ...METER_LABELS, judgment: 'Judgment' };
  const cx = size / 2, cy = size / 2, r = size / 2 - 44;
  const pt = (i, v) => { const a = (Math.PI * 2 * i) / axes.length - Math.PI / 2; return [cx + Math.cos(a) * r * (v / 100), cy + Math.sin(a) * r * (v / 100)]; };
  const poly = values.map((v, i) => pt(i, v).join(',')).join(' ');
  return (
    <svg width={size} height={size} role="img" aria-label={`Skills radar: ${axes.map((a, i) => `${labels[a]} ${values[i]}`).join(', ')}`}>
      {[25, 50, 75, 100].map((g) => <polygon key={g} points={axes.map((_, i) => pt(i, g).join(',')).join(' ')} fill="none" stroke="#3f3f46" strokeWidth="1" />)}
      {axes.map((_, i) => { const [x, y] = pt(i, 100); return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#3f3f46" />; })}
      <polygon points={poly} fill="rgba(245,158,11,0.25)" stroke="#f59e0b" strokeWidth="2" />
      {axes.map((a, i) => { const [x, y] = pt(i, 130); return <text key={a} x={x} y={y} fontSize="10" fill="#a1a1aa" textAnchor="middle" dominantBaseline="middle">{labels[a]}</text>; })}
    </svg>
  );
}

export function useConsistency() {
  const { state } = useGame();
  return judgmentConsistency(state);
}

export { Notice };
