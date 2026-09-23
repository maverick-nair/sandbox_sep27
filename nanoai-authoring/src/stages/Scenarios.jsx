import React, { useEffect, useState } from 'react';
import { Button, Badge, Modal, Progress, Select } from '../components/ui.jsx';
import { RULES } from '../content/rules.js';
import { getSkill } from '../content/ontology.js';
import { planBlueprint, applyReductionOrder } from '../engine/blueprint.js';
import { buildScenarios, planIsStale } from '../engine/build.js';
import { observationsFor } from '../engine/duration.js';
import { llmAvailable } from '../engine/llm.js';
import { useWorkspace } from '../engine/WorkspaceContext.jsx';
import Step3Blueprint from '../steps/Step3Blueprint.jsx';
import Step4Review from '../steps/Step4Review.jsx';

// The Scenarios stage: a compact plan strip on top (scenarios, coverage, time, order) with "Adjust plan"
// opening the blueprint, and the scenario review below. If the author arrives with no scenarios yet, the
// plan is built and every scenario generated here so they never see an empty page.
export default function Scenarios(props) {
  const { asm, update, go, gate, readOnly, toast, focus, setFocus } = props;
  const [planOpen, setPlanOpen] = useState(Boolean(focus?.plan));
  const [build, setBuild] = useState(null);
  const [focusId, setFocusId] = useState(focus?.scenarioId || null);
  const { openPanel } = useWorkspace();
  const ai = llmAvailable();
  useEffect(() => { if (focus) { setPlanOpen(Boolean(focus.plan)); setFocusId(focus.scenarioId || null); setFocus(null); } }, [focus]); // eslint-disable-line

  const runBuild = async (a) => {
    setBuild({ i: 0, total: a.blueprint.rows.length, status: 'Planning' });
    await buildScenarios({ asm: a, update, onProgress: setBuild });
    setBuild(null);
  };
  useEffect(() => {
    if (readOnly || build || !ai) return;
    if (!asm.blueprint) { const bp = planBlueprint(asm.skills.map((s) => s.id), { seeds: asm.intent.extracted?.situations || [], purpose: asm.intent.purpose }); update((a) => ({ ...a, blueprint: bp }), { action: 'blueprint.planned' }); runBuild({ ...asm, blueprint: bp }); }
    else if (!asm.scenarios?.length) runBuild(asm);
  }, []); // eslint-disable-line

  const scenarios = asm.scenarios || [];
  const approved = scenarios.filter((s) => s.approved).length;
  const stale = planIsStale(asm);
  const total = gate.totalMinutes;
  const tone = total > RULES.time.totalHard ? 'text-[var(--block)]' : total > RULES.time.totalWarn ? 'text-[var(--warn)]' : '';
  const order = asm.config.scenarioOrder || 'shuffled';
  const setOrder = (v) => update((a) => ({ ...a, config: { ...a.config, scenarioOrder: v } }), { action: 'config.scenario_order', before: order, after: v });

  if (!scenarios.length && !ai) return (
    <div className="card mx-auto max-w-xl p-8 text-center"><h2 className="text-base font-semibold">Connect AI to build the scenarios</h2><p className="muted mt-1 text-sm">NanoAI drafts every scenario with the model. Connect it and the build starts here.</p><Button className="mt-3" onClick={() => openPanel('settings')}>Connect AI</Button></div>
  );
  if (build || !scenarios.length) return (
    <div className="card mx-auto max-w-xl p-8 text-center">
      <div className="mx-auto mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]"><span className="pulse text-lg">+</span></div>
      <h2 className="text-base font-semibold">Building your assessment</h2>
      <p className="muted mt-1 text-sm">{build?.status || 'Planning scenarios, response types and time'}</p>
      {build && <div className="mt-4"><Progress value={build.i + 1} max={build.total} /><p className="faint mt-1 text-xs">{Math.min(build.i + 1, build.total)} of {build.total} scenarios</p></div>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
        <Stat label="Scenarios" value={scenarios.length} sub={`${approved} approved`} />
        <Stat label="Skills" value={asm.skills.length} sub={asm.skills.every((k) => scenarios.filter((s) => s.skillId === k.id).reduce((a, s) => a + observationsFor(s), 0) >= RULES.observations.perSkillMin) ? 'all dependable' : 'one needs more'} tone={asm.skills.every((k) => scenarios.filter((s) => s.skillId === k.id).reduce((a, s) => a + observationsFor(s), 0) >= RULES.observations.perSkillMin) ? '' : 'text-[var(--block)]'} />
        <Stat label="Estimated time" value={`${total} min`} sub={`target ${RULES.time.totalTarget}, limit ${RULES.time.totalHard}`} tone={tone} />
        <div className="flex items-center gap-2"><span className="faint text-[11px] uppercase tracking-wider">Order</span><Select value={order} onChange={(e) => setOrder(e.target.value)} disabled={readOnly} className="w-auto py-1 text-xs" aria-label="Scenario order"><option value="shuffled">Shuffled per participant</option><option value="fixed">Fixed for everyone</option></Select></div>
        <div className="ml-auto flex items-center gap-2">
          {stale && <Badge tone="warn">Plan changed</Badge>}
          {!readOnly && total > RULES.time.totalTarget && <Button size="sm" variant="secondary" title="Applies the reduction order (media, convert to MCQ, drop, simplify) until the plan meets the target, then updates the scenarios" onClick={async () => { const scale = asm.blueprint.totalMinutes / Math.max(1, total); const target = Math.floor(RULES.time.totalTarget * scale); const bp = applyReductionOrder({ ...asm.blueprint, changes: [] }, target); if (bp.rows.length === asm.blueprint.rows.length && bp.totalMinutes === asm.blueprint.totalMinutes) return toast('Nothing more can be trimmed without dropping a Skill below 8 observations. Remove a Skill in the brief or tighten caps.', 'error'); update((a) => ({ ...a, blueprint: bp }), { action: 'blueprint.shortened', after: bp.changes.map((c) => c.kind) }); await runBuild({ ...asm, blueprint: bp }); toast(`Shortened: ${bp.changes.map((c) => c.text).join(' ')}`, 'ok'); }}>Make it shorter</Button>}
          <Button size="sm" variant="secondary" onClick={() => setPlanOpen(true)}>Adjust plan</Button>
        </div>
      </div>
      <Step4Review {...props} go={(n, opts) => (n === 3 ? setPlanOpen(true) : n === 5 ? go(3, opts) : go(n, opts))} focusScenarioId={focusId} setFocusScenarioId={setFocusId} />
      <Modal open={planOpen} title="Adjust the plan" onClose={() => setPlanOpen(false)} wide>
        <Step3Blueprint {...props} embedded onDone={async (changed) => { setPlanOpen(false); if (changed) { await runBuild(asm); toast('Scenarios updated to match the plan.', 'ok'); } }} />
      </Modal>
    </div>
  );
}

function Stat({ label, value, sub, tone = '' }) { return <div><div className="faint text-[11px] uppercase tracking-wider">{label}</div><div className={`text-lg font-semibold leading-tight ${tone}`}>{value}</div>{sub && <div className="faint text-[11px]">{sub}</div>}</div>; }
