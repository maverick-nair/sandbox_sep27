import React, { useEffect, useState } from 'react';
import { Button, Panel, Badge, Select, Progress, Severity } from '../components/ui.jsx';
import { RULES, RESPONSE_TYPES, DIFFICULTIES } from '../content/rules.js';
import { getSkill, SITUATION_TAGS } from '../content/ontology.js';
import { planBlueprint, setRowType, setRowQuestions, toggleRowMedia, addRow, removeRow, blueprintFindings, rowObservations } from '../engine/blueprint.js';
import { generationMode } from '../engine/generator.js';
import { planIsStale } from '../engine/build.js';

const KIND_TEXT = { trim: 'Trimmed the plan', media: 'Removed planned media to save reading time', convert: 'Converted an open response scenario to MCQ (3 questions) where the Skill stays well covered', drop: 'Removed a scenario the Skill could spare', simplify: 'Reduced difficulty from High to Medium to shorten the scenario' };
function groupChanges(changes) {
  const by = {};
  for (const c of changes) { const g = (by[c.kind] ||= { kind: c.kind, skills: [], single: c.text }); if (c.skillId) g.skills.push(getSkill(c.skillId)?.name || c.skillId); }
  return Object.values(by).map((g) => g.skills.length <= 1 ? { kind: g.kind, text: g.single } : { kind: g.kind, text: `${KIND_TEXT[g.kind] || g.kind} on ${g.skills.length} scenarios (${[...new Set(g.skills)].join(', ')}).` });
}

export default function Step3Blueprint({ asm, update, go, readOnly, toast, embedded, onDone }) {
  const [gen] = useState(null);
  const skillIds = asm.skills.map((s) => s.id);
  const seeds = asm.intent.extracted?.situations || [];

  const plan = () => update((a) => ({ ...a, blueprint: planBlueprint(skillIds, { seeds, purpose: a.intent.purpose }) }), { action: 'blueprint.planned' });
  useEffect(() => { if (!asm.blueprint && !readOnly) plan(); }, []); // eslint-disable-line

  const bp = asm.blueprint;
  if (!bp) return <div className="card pulse p-8 text-sm">Planning the blueprint.</div>;
  const findings = blueprintFindings(bp);
  const hard = findings.filter((f) => f.severity === 'hard');
  const setBp = (next, action, meta) => update((a) => ({ ...a, blueprint: next }), { action, ...meta });

  const generate = () => onDone?.(true);

  const target = RULES.time.totalTarget;
  const tone = bp.totalMinutes > RULES.time.totalHard ? 'block' : bp.totalMinutes > RULES.time.totalWarn ? 'warn' : undefined;
  const hasScenarios = asm.scenarios?.length > 0;
  const stale = hasScenarios && planIsStale(asm);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="muted text-sm">Change any response type, add or remove scenarios, or switch media. Observations per Skill and total time update live; rules are enforced by construction.</p>
        {!readOnly && <Button variant="secondary" size="sm" onClick={() => { if (!hasScenarios || confirm('Re-plan from scratch? Scenarios for removed rows are dropped.')) plan(); }}>Re-plan</Button>}
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <div className="card p-4"><div className="faint text-[11px] uppercase tracking-wider">Scenarios</div><div className="text-2xl font-semibold">{bp.rows.length}</div><div className="muted text-xs">{RULES.scenarios.totalMin} to {RULES.scenarios.totalMax} allowed</div></div>
        <div className="card p-4"><div className="faint text-[11px] uppercase tracking-wider">Skills</div><div className="text-2xl font-semibold">{skillIds.length}</div><div className="muted text-xs">{Object.values(bp.perSkill).every((p) => p.observations >= RULES.observations.perSkillMin) ? 'All reach 8 observations' : 'A Skill is under 8 observations'}</div></div>
        <div className="card p-4 md:col-span-2"><div className="flex items-baseline justify-between"><div className="faint text-[11px] uppercase tracking-wider">Estimated time</div><div className={`text-2xl font-semibold ${tone === 'block' ? 'text-[var(--block)]' : tone === 'warn' ? 'text-[var(--warn)]' : ''}`}>{bp.totalMinutes} min</div></div><Progress value={bp.totalMinutes} max={RULES.time.totalHard} tone={tone} /><div className="muted mt-1 flex justify-between text-[11px]"><span>Target {target} min</span><span>Warning above {RULES.time.totalWarn}</span><span>Limit {RULES.time.totalHard}</span></div></div>
      </div>
      {bp.changes?.length > 0 && (
        <Panel title="What the planner changed to keep it short form" subtitle="Simplify media first, then convert an open response scenario to MCQ where the Skill stays well covered, then drop a scenario the Skill can spare, then reduce complexity. You can trade differently below." padding="p-4">
          <ul className="space-y-1 text-sm">{groupChanges(bp.changes).map((g, i) => <li key={i} className="flex gap-2"><Badge tone="neutral">{g.kind}</Badge><span>{g.text}</span></li>)}</ul>
        </Panel>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-[var(--line)] text-left text-xs uppercase tracking-wide text-[var(--ink-2)]"><th className="px-4 py-2">#</th><th className="px-2 py-2">Skill</th><th className="px-2 py-2">Response</th><th className="px-2 py-2">Questions</th><th className="px-2 py-2">Difficulty</th><th className="px-2 py-2">Situation</th><th className="px-2 py-2">Media</th><th className="px-2 py-2">Grounded in</th><th className="px-2 py-2 text-right">Time</th><th className="px-2 py-2"><span className="sr-only">Actions</span></th></tr></thead>
          <tbody>
            {skillIds.map((skillId) => {
              const rows = bp.rows.filter((r) => r.skillId === skillId);
              const p = bp.perSkill[skillId] || { scenarios: 0, observations: 0, minutes: 0 };
              const skill = getSkill(skillId);
              return (
                <React.Fragment key={skillId}>
                  <tr className="bg-slate-50"><td colSpan={10} className="px-4 py-2"><div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="font-semibold">{asm.skills.find((s) => s.id === skillId)?.clientLabel || skill.name}</span><Badge tone={p.scenarios >= 3 ? 'ok' : p.scenarios >= 2 ? 'warn' : 'block'}>{p.scenarios} scenarios</Badge><Badge tone={p.observations >= 12 ? 'ok' : p.observations >= 8 ? 'warn' : 'block'} title="Scored observations: one per scoring question for Audio and Text, one per MCQ question">{p.observations} observations</Badge><Badge>{p.minutes} min</Badge></div>{!readOnly && <Button size="sm" variant="ghost" onClick={() => { const r = addRow(bp, skillId); if (r.error) toast(r.error, 'error'); else setBp(r.bp, 'blueprint.row_added', { after: skillId }); }}>Add a scenario</Button>}</div></td></tr>
                  {rows.map((r) => {
                    const idx = bp.rows.findIndex((x) => x.id === r.id);
                    return (
                      <tr key={r.id} className="border-t border-[var(--line)]">
                        <td className="px-4 py-2 faint">{idx + 1}</td>
                        <td className="px-2 py-2">{skill.name}</td>
                        <td className="px-2 py-2"><Select disabled={readOnly} value={r.responseType} onChange={(e) => setBp(setRowType(bp, r.id, e.target.value), 'blueprint.response_type', { before: r.responseType, after: e.target.value })} className="w-28 py-1" aria-label="Response type">{RESPONSE_TYPES.map((t) => <option key={t}>{t}</option>)}</Select></td>
                        <td className="px-2 py-2">{r.responseType === 'MCQ' ? <Select disabled={readOnly} value={r.plannedQuestions} onChange={(e) => setBp(setRowQuestions(bp, r.id, Number(e.target.value)), 'blueprint.questions', { after: e.target.value })} className="w-20 py-1" aria-label="MCQ questions">{[1, 2, 3].map((n) => <option key={n} value={n}>{n} MCQ</option>)}</Select> : <span className="muted text-xs">{rowObservations(r)} scoring questions</span>}</td>
                        <td className="px-2 py-2"><Select disabled={readOnly} value={r.difficulty} onChange={(e) => setBp({ ...bp, rows: bp.rows.map((x) => (x.id === r.id ? { ...x, difficulty: e.target.value } : x)) }, 'blueprint.difficulty', { after: e.target.value }) || plan} className="w-24 py-1" aria-label="Difficulty">{DIFFICULTIES.map((d) => <option key={d}>{d}</option>)}</Select></td>
                        <td className="px-2 py-2"><Select disabled={readOnly} value={r.tag} onChange={(e) => setBp({ ...bp, rows: bp.rows.map((x) => (x.id === r.id ? { ...x, tag: e.target.value } : x)) }, 'blueprint.tag', { after: e.target.value })} className="w-40 py-1" aria-label="Situation tag">{SITUATION_TAGS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</Select></td>
                        <td className="px-2 py-2"><label className="inline-flex items-center gap-1 text-xs"><input type="checkbox" disabled={readOnly} checked={Boolean(r.plannedMedia)} onChange={() => setBp(toggleRowMedia(bp, r.id), 'blueprint.media', { after: !r.plannedMedia })} />chart or table</label></td>
                        <td className="max-w-[220px] px-2 py-2 text-xs">{r.seedSituation ? <span title={r.seedSituation.text}>{r.seedSituation.text.slice(0, 70)}… <span className="faint">({r.seedSituation.source})</span></span> : <span className="faint">Role and Skill indicators</span>}</td>
                        <td className="px-2 py-2 text-right font-mono">{r.estMinutes} min</td>
                        <td className="px-2 py-2 text-right">{!readOnly && <Button size="sm" variant="ghost" onClick={() => { const res = removeRow(bp, r.id); if (res.error) toast(res.error, 'error'); else setBp(res.bp, 'blueprint.row_removed', { before: r.id }); }} aria-label="Remove scenario">Remove</Button>}</td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Panel title="Coverage" padding="p-4">
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div><div className="faint text-[11px] uppercase">Situation tags covered</div><div className="mt-1 flex flex-wrap gap-1">{SITUATION_TAGS.map((t) => <span key={t.id} className={`chip ${bp.tagCoverage.includes(t.id) ? 'border-[var(--brand)] text-[var(--brand-2)] font-semibold' : 'border-dashed'}`}>{t.name}<span className="sr-only">{bp.tagCoverage.includes(t.id) ? ' (covered)' : ' (not covered)'}</span></span>)}</div></div>
            <div><div className="faint text-[11px] uppercase">Difficulty spread</div><div className="mt-1 flex gap-1">{DIFFICULTIES.map((d) => <span key={d} className="chip">{d}: {bp.rows.filter((r) => r.difficulty === d).length}</span>)}</div></div>
            <div><div className="faint text-[11px] uppercase">Response mix</div><div className="mt-1 flex gap-1">{RESPONSE_TYPES.map((t) => <span key={t} className="chip">{t}: {bp.rows.filter((r) => r.responseType === t).length}</span>)}</div></div>
          </div>
        </Panel>
        <Panel title="Quality bar" subtitle="Hard rules are enforced by construction. What remains is your call." padding="p-4">
          {findings.length === 0 ? <p className="text-sm text-[var(--ok)]">The plan meets every rule. Each Skill has 3 scenarios and 12 or more observations.</p> : <ul className="space-y-2 text-sm">{findings.map((f, i) => <li key={i} className="flex flex-col gap-1"><Severity severity={f.severity} /><span>{f.text}</span></li>)}</ul>}
        </Panel>
      </div>
      <div className="flex items-center justify-between gap-3">
        <p className={`text-sm ${hard.length ? 'text-[var(--block)]' : 'muted'}`}>{hard.length ? 'Fix the items above, or apply anyway and fix them in review.' : stale ? 'The plan changed. Apply it to update the scenarios; existing ones are kept where the plan did not change.' : 'The scenarios match this plan.'}</p>
        <div className="flex gap-2"><Button variant="secondary" onClick={() => onDone?.(false)}>Close</Button><Button onClick={generate} disabled={readOnly || !stale}>Apply plan and update scenarios</Button></div>
      </div>
    </div>
  );
}
