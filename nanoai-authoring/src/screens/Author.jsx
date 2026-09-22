import React, { useEffect, useMemo, useState } from 'react';
import Shell, { STAGES } from '../components/Shell.jsx';
import { Badge, Button } from '../components/ui.jsx';
import { useWorkspace } from '../engine/WorkspaceContext.jsx';
import { runQualityGate } from '../engine/qualityGate.js';
import { RULES } from '../content/rules.js';
import Brief from '../stages/Brief.jsx';
import Scenarios from '../stages/Scenarios.jsx';
import Step5Preview from '../steps/Step5Preview.jsx';
import Publish from '../stages/Publish.jsx';
import Calibration from '../screens/Calibration.jsx';

// Four stages. Brief folds intent and Skills; Scenarios folds the blueprint and the review; Publish folds
// the quality gate and configuration. Estimated time to publish stays visible.
export function estimateToPublish(asm, gate) {
  const unapproved = (asm.scenarios || []).filter((s) => !s.approved).length;
  const planned = asm.blueprint?.rows.length || 10;
  const base = { 1: 30, 2: 5, 3: 5, 4: 2 }[asm.stage] || 10;
  const review = asm.stage <= 1 ? planned * 2.5 : unapproved * 2.5;
  const fixes = gate ? gate.hard.filter((h) => h.rule !== 'approval').length * 1.5 : 0;
  return Math.max(2, Math.round(base + review + fixes));
}

export default function Author() {
  const { current: asm, update, toast, goHome, route, setRoute } = useWorkspace();
  const [focus, setFocus] = useState(null); // { scenarioId, plan }
  const gate = useMemo(() => runQualityGate(asm), [asm]);
  const readOnly = asm.status === 'published';
  const stage = asm.stage || 1;

  const canGoFor = (a, n) => {
    if (n <= 1) return true;
    const skillsOk = a.skills.length >= RULES.skills.min && a.skills.length <= RULES.skills.max && a.skillsConfirmed;
    if (n === 2) return skillsOk;
    return skillsOk && Boolean(a.scenarios?.length);
  };
  const go = (n, opts = {}) => { if (route !== 'author') setRoute('author'); if (opts.scenarioId || opts.plan) setFocus({ scenarioId: opts.scenarioId, plan: opts.plan }); update((a) => (canGoFor(a, n) ? { ...a, stage: n } : a), { undoable: false, allowPublished: true }); window.scrollTo({ top: 0 }); };
  useEffect(() => { if (!canGoFor(asm, stage)) update({ stage: 1 }, { undoable: false }); }, []); // eslint-disable-line

  const stageStatus = [Boolean(asm.skillsConfirmed), (asm.scenarios?.length || 0) > 0 && asm.scenarios.every((s) => s.approved), Boolean(asm.previewed), asm.status === 'published'];

  const startNewVersion = () => {
    update((a) => ({ ...a, status: 'draft', stage: 2 }), { action: 'version.draft_started', before: `v${asm.currentVersion}`, after: `v${asm.currentVersion + 1} draft`, allowPublished: true });
    toast(`Editing a new version. Version ${asm.currentVersion} stays live for participants in flight.`);
  };

  const props = { asm, update, go, gate, readOnly, toast, focus, setFocus };
  const View = [Brief, Scenarios, Step5Preview, Publish][stage - 1] || Brief;
  const name = asm.config.name || 'Untitled assessment';
  const titles = {
    1: ['Tell us about the assessment', 'Speak, upload a brief or type. The platform proposes the Skills and builds everything else.'],
    2: ['Review the scenarios', 'One scenario at a time: the situation, what a good answer must cover, and how it is scored. Approve each one.'],
    3: ['Preview as a participant', 'The full experience with limits, countdown and a sample report. Order is shuffled per participant.'],
    4: ['Check and publish', 'The quality gate runs continuously. Fix anything that blocks, set the basics, and go live.'],
  };
  const actions = (
    <>
      {asm.scenarios?.length > 0 && <Badge tone={gate.canPublish ? 'ok' : gate.hard.length ? 'block' : 'neutral'}>{gate.canPublish ? 'Passes the quality gate' : `${gate.hard.length} item${gate.hard.length === 1 ? '' : 's'} to fix`}</Badge>}
      {readOnly ? <Badge tone="ok">Published v{asm.currentVersion}</Badge> : <span className="muted text-xs">About {estimateToPublish(asm, gate)} min to publish</span>}
      {readOnly && <Button size="sm" variant="secondary" onClick={startNewVersion}>Edit as new version</Button>}
      {!readOnly && stage === 2 && asm.scenarios?.length > 0 && <Button size="sm" onClick={() => go(3)}>Preview</Button>}
      {!readOnly && stage === 3 && <Button size="sm" onClick={() => go(4)}>Continue to publish</Button>}
    </>
  );
  if (route === 'calibration') return (
    <Shell stage={stage} onStage={go} stageStatus={stageStatus} onCalibration={() => setRoute('calibration')} crumbs={[{ label: 'Dashboard', onClick: goHome }, { label: name }, { label: 'Calibration' }]} title="Calibrate AI scoring" subtitle="Two calibrators score the first 30 responses to each open response scenario alongside the AI. When agreement holds, AI scoring activates for that scenario.">
      <Calibration asm={asm} update={update} toast={toast} />
    </Shell>
  );
  return (
    <Shell stage={stage} onStage={go} stageStatus={stageStatus} onCalibration={() => setRoute('calibration')} crumbs={[{ label: 'Dashboard', onClick: goHome }, { label: name }, { label: STAGES[stage - 1].label }]} title={titles[stage][0]} subtitle={titles[stage][1]} actions={actions}>
      <View {...props} />
    </Shell>
  );
}
