import React, { useEffect, useState } from 'react';
import { Button, Panel, Badge, Select, Progress, Severity } from '../components/ui.jsx';
import { RULES, RESPONSE_TYPES, DIFFICULTIES } from '../content/rules.js';
import { getSkill, SITUATION_TAGS } from '../content/ontology.js';
import { planBlueprint, setRowType, setRowQuestions, toggleRowMedia, addRow, removeRow, blueprintFindings, rowObservations } from '../engine/blueprint.js';
import { generateScenario, switchResponseType, generationMode } from '../engine/generator.js';

const KIND_TEXT = { trim: 'Trimmed the plan', media: 'Removed planned media to save reading time', convert: 'Converted an open response scenario to MCQ (3 questions) where the Skill stays well covered', drop: 'Removed a scenario the Skill could spare', simplify: 'Reduced difficulty from High to Medium to shorten the scenario' };
function groupChanges(changes) {
  const by = {};
  for (const c of changes) { const g = (by[c.kind] ||= { kind: c.kind, skills: [], single: c.text }); if (c.skillId) g.skills.push(getSkill(c.skillId)?.name || c.skillId); }
  return Object.values(by).map((g) => g.skills.length <= 1 ? { kind: g.kind, text: g.single } : { kind: g.kind, text: `${KIND_TEXT[g.kind] || g.kind} on ${g.skills.length} scenarios (${[...new Set(g.skills)].join(', ')}).` });
}

export default function Step3Blueprint({ asm, update, go, readOnly, toast }) {
  const [gen, setGen] = useState(null); // { i, total, status }
  const skillIds = asm.skills.map((s) => s.id);
  const seeds = asm.intent.extracted?.situations || [];

  const plan = () => update((a) => ({ ...a, blueprint: planBlueprint(skillIds, { seeds, purpose: a.intent.purpose }) }), { action: 'blueprint.planned' });
  useEffect(() => { if (!asm.blueprint && !readOnly) plan(); }, []); // eslint-disable-line

  const bp = asm.blueprint;
  if (!bp) return <div className="card pulse p-8 text-sm">Planning the blueprint.</div>;
  const findings = blueprintFindings(bp);
  const hard = findings.filter((f) => f.severity === 'hard');
  const setBp = (next, action, meta) => update((a) => ({ ...a, blueprint: next }), { action, ...meta });

  const generate = async () => {
    const existing = asm.scenarios || [];
    const rows = bp.rows;
    const total = rows.length;
    setGen({ i: 0, total, status: 'Starting' });
    let scenarios = existing.filter((s) => rows.some((r) => r.id === s.blueprintRowId));
    let working = { ...asm, scenarios };
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const have = scenarios.find((s) => s.blueprintRowId === row.id);
      if (have) {
        if (have.responseType !== row.responseType) { setGen({ i, total, status: `Switching ${getSkill(row.skillId)?.name} scenario to ${row.responseType}` }); const sw = await switchResponseType(have, working, row.responseType); scenarios = scenarios.map((s) => (s.id === have.id ? sw : s)); working = { ...working, scenarios }; }
        continue;
      }
      setGen({ i, total, status: `${getSkill(row.skillId)?.name}: drafting` });
      const sc = await generateScenario(row, working, i, { onStatus: (st) => setGen({ i, total, status: `${getSkill(row.skillId)?.name}: ${st}` }) });
      scenarios = [...scenarios, sc]; working = { ...working, scenarios };
      update((a) => ({ ...a, scenarios }), { undoable: false });
    }
    // Order by blueprint rows so the review runs Skill by Skill.
    const ordered = rows.map((r) => scenarios.find((s) => s.blueprintRowId === r.id)).filter(Boolean);
    update((a) => ({ ...a, scenarios: ordered }), { action: 'scenarios.generated', after: { count: ordered.length, mode: generationMode() } });
    setGen(null);
    toast(`${ordered.length} scenarios ready to review.`, 'ok');
    go(4);
  };

  const target = RULES.time.totalTarget;
  const tone = bp.totalMinutes > RULES.time.totalHard ? 'block' : bp.totalMinutes > RULES.time.totalWarn ? 'warn' : undefined;
  const hasScenarios = asm.scenarios?.length > 0;
  const stale = hasScenarios && (bp.rows.some((r) => !asm.scenarios.some((s) => s.blueprintRowId === r.id && s.responseType === r.responseType)) || asm.scenarios.some((s) => !bp.rows.some((r) => r.id === s.blueprintRowId)));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-xl font-semibold">Blueprint and time plan</h1><p className="muted mt-1 text-sm">The plan comes before the scenarios. Change any response type, ask for more scenarios on a Skill, or reduce the total. Observations per Skill and total time update live.</p></div>
        {!readOnly && <Button variant="secondary" onClick={() => { if (!hasScenarios || confirm('Re-plan from scratch? Generated scenarios for removed rows are dropped.')) plan(); }}>Re-plan</Button>}
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
          <thead><tr className="border-b border-[var(--line)] text-left text-xs uppercase tracking-wide text-[var(--ink-2)]"><th className="px-4 py-2">#</th><th className="px-2 py-2">Skill</th><th className="px-2 py-2">Response</th><th className="px-2 py-2">Questions</th><th className="px-2 py-2">Difficulty</th><th className="px-2 py-2">Situation</th><th className="px-2 py-2">Media</th><th className="px-2 py-2">Grounded in</th><th className="px-2 py-2 text-right">Time</th><th className="px-2 py-2" /></tr></thead>
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
            <div><div className="faint text-[11px] uppercase">Situation tags covered</div><div className="mt-1 flex flex-wrap gap-1">{SITUATION_TAGS.map((t) => <span key={t.id} className={`chip ${bp.tagCoverage.includes(t.id) ? 'border-[var(--brand)] text-[var(--brand)]' : 'opacity-40'}`}>{t.name}</span>)}</div></div>
            <div><div className="faint text-[11px] uppercase">Difficulty spread</div><div className="mt-1 flex gap-1">{DIFFICULTIES.map((d) => <span key={d} className="chip">{d}: {bp.rows.filter((r) => r.difficulty === d).length}</span>)}</div></div>
            <div><div className="faint text-[11px] uppercase">Response mix</div><div className="mt-1 flex gap-1">{RESPONSE_TYPES.map((t) => <span key={t} className="chip">{t}: {bp.rows.filter((r) => r.responseType === t).length}</span>)}</div></div>
          </div>
        </Panel>
        <Panel title="Quality bar" subtitle="Hard rules are enforced by construction. What remains is your call." padding="p-4">
          {findings.length === 0 ? <p className="text-sm text-[var(--ok)]">The plan meets every rule. Each Skill has 3 scenarios and 12 or more observations.</p> : <ul className="space-y-2 text-sm">{findings.map((f, i) => <li key={i} className="flex flex-col gap-1"><Severity severity={f.severity} /><span>{f.text}</span></li>)}</ul>}
        </Panel>
      </div>
      {gen && <div className="card p-4"><div className="flex items-center justify-between text-sm"><span className="pulse">{gen.status}</span><span className="muted">{gen.i + 1} of {gen.total}</span></div><Progress value={gen.i + 1} max={gen.total} /><p className="faint mt-2 text-xs">{generationMode() === 'llm' ? 'The AI writes each situation, then reads it to produce the contextual analysis, scoring questions and limits.' : 'Scripted mode: drafting from the scenario library. Connect an API key in Settings for scenarios grounded in your documents.'}</p></div>}
      <div className="flex items-center justify-between gap-3">
        <p className={`text-sm ${hard.length ? 'text-[var(--block)]' : 'muted'}`}>{hard.length ? 'Fix the items that block publish above, or generate anyway and fix them in review.' : hasScenarios && !stale ? 'Scenarios already exist for this plan. Continue to review, or change the plan and regenerate.' : 'Next: scenarios, contextual analyses and scoring questions are generated against this plan.'}</p>
        <div className="flex gap-2"><Button variant="secondary" onClick={() => go(2)}>Back</Button>{hasScenarios && !stale ? <Button size="lg" onClick={() => go(4)}>Review scenarios</Button> : <Button size="lg" onClick={generate} busy={Boolean(gen)} disabled={readOnly}>{hasScenarios ? 'Update scenarios to match the plan' : 'Generate scenarios'}</Button>}</div>
      </div>
    </div>
  );
}
