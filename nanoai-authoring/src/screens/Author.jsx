import React, { useEffect, useMemo, useState } from 'react';
import Shell from '../components/Shell.jsx';
import { Steps, Badge, Button } from '../components/ui.jsx';
import { useWorkspace } from '../engine/WorkspaceContext.jsx';
import { runQualityGate } from '../engine/qualityGate.js';
import { RULES } from '../content/rules.js';
import Step1Intent from '../steps/Step1Intent.jsx';
import Step2Skills from '../steps/Step2Skills.jsx';
import Step3Blueprint from '../steps/Step3Blueprint.jsx';
import Step4Review from '../steps/Step4Review.jsx';
import Step5Preview from '../steps/Step5Preview.jsx';
import Step6Gate from '../steps/Step6Gate.jsx';
import Step7Publish from '../steps/Step7Publish.jsx';

export const STEPS = [
  { id: 'intent', label: 'Describe intent' },
  { id: 'skills', label: 'Confirm Skills' },
  { id: 'blueprint', label: 'Blueprint' },
  { id: 'review', label: 'Review scenarios' },
  { id: 'preview', label: 'Preview' },
  { id: 'gate', label: 'Quality gate' },
  { id: 'publish', label: 'Configure and publish' },
];

// Estimated minutes to publish, always visible (PRD 17). A heuristic on remaining work, not a promise.
export function estimateToPublish(asm, gate) {
  const unapproved = (asm.scenarios || []).filter((s) => !s.approved).length;
  const planned = asm.blueprint?.rows.length || 10;
  const base = { 1: 45, 2: 40, 3: 32, 4: 6, 5: 6, 6: 4, 7: 2 }[asm.step] || 10;
  const review = asm.step <= 3 ? planned * 2.5 : unapproved * 2.5;
  const fixes = gate ? gate.hard.filter((h) => h.rule !== 'approval').length * 1.5 : 0;
  return Math.max(2, Math.round(base + review + fixes));
}

export default function Author() {
  const { current: asm, update, toast } = useWorkspace();
  const [focusScenarioId, setFocusScenarioId] = useState(null);
  const gate = useMemo(() => runQualityGate(asm), [asm]);
  const readOnly = asm.status === 'published';

  const canGoFor = (a, n) => {
    if (n <= 2) return true;
    if (n === 3) return a.skills.length >= RULES.skills.min && a.skills.length <= RULES.skills.max && a.skillsConfirmed;
    if (n >= 4) return Boolean(a.scenarios?.length) && canGoFor(a, 3);
    return true;
  };
  const canGo = (n) => canGoFor(asm, n);
  // Navigation is checked against the latest state inside the updater, so a step change queued right
  // after another update (confirm Skills, then go) sees that update.
  const go = (n, opts = {}) => { if (opts.scenarioId) setFocusScenarioId(opts.scenarioId); update((a) => (canGoFor(a, n) ? { ...a, step: n } : a), { undoable: false }); window.scrollTo({ top: 0 }); };

  useEffect(() => { if (!canGo(asm.step)) update({ step: 1 }, { undoable: false }); }, []); // eslint-disable-line

  const startNewVersion = () => {
    update((a) => ({ ...a, status: 'draft', step: 4, scenarios: a.scenarios.map((s) => ({ ...s, approved: true })) }), { action: 'version.draft_started', before: `v${asm.currentVersion}`, after: `v${asm.currentVersion + 1} draft` });
    toast(`Editing a new version. Version ${asm.currentVersion} stays live for participants in flight.`);
  };

  const props = { asm, update, go, gate, readOnly, focusScenarioId, setFocusScenarioId, toast };
  const StepView = [Step1Intent, Step2Skills, Step3Blueprint, Step4Review, Step5Preview, Step6Gate, Step7Publish][asm.step - 1] || Step1Intent;

  const sub = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-3">
        <span className="max-w-[220px] truncate text-sm font-semibold">{asm.config.name || 'Untitled assessment'}</span>
        {readOnly ? <Badge tone="ok">Published v{asm.currentVersion}, read only</Badge> : asm.currentVersion ? <Badge>Draft of v{asm.currentVersion + 1}</Badge> : <Badge>Draft</Badge>}
        {asm.sample && <Badge tone="brand">Sample</Badge>}
      </div>
      <Steps steps={STEPS} current={asm.step} onGo={go} canGo={canGo} />
      <div className="flex items-center gap-2 text-xs">
        {asm.scenarios?.length > 0 && <Badge tone={gate.canPublish ? 'ok' : gate.hard.length ? 'block' : 'neutral'}>{gate.canPublish ? 'Passes the quality gate' : `${gate.hard.length} item${gate.hard.length === 1 ? '' : 's'} block publish`}</Badge>}
        {!readOnly && <span className="muted whitespace-nowrap">About {estimateToPublish(asm, gate)} min to publish</span>}
        {readOnly && <Button size="sm" variant="secondary" onClick={startNewVersion}>Edit as new version</Button>}
      </div>
    </div>
  );

  return <Shell sub={sub}><StepView {...props} /></Shell>;
}
