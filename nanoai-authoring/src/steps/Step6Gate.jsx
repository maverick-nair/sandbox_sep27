import React from 'react';
import { Button, Panel, Badge, Severity, Stat } from '../components/ui.jsx';
import { RULES } from '../content/rules.js';
import { getSkill } from '../content/ontology.js';
import { observationsFor } from '../engine/duration.js';

const GROUPS = [
  { id: 'coverage', label: 'Coverage per Skill', rules: ['skills', 'total', 'scenariosPerSkill', 'observationsPerSkill', 'mcqOnly'] },
  { id: 'instrument', label: 'Scoring questions and MCQ keys', rules: ['sqCount', 'modelAnswer', 'sqIndicator', 'sqAnchors', 'sqAnchorsDistinct', 'sqTrace', 'sqDuplicate', 'mcqCount', 'mcqOptions', 'mcqRationale', 'mcqDiscrimination', 'mcqClose', 'optionLength'] },
  { id: 'limits', label: 'Response limits and duration', rules: ['cap', 'capShort', 'capLong', 'duration', 'totalDuration'] },
  { id: 'purity', label: 'Skill purity and duplicates', rules: ['purity', 'purityText', 'duplicate'] },
  { id: 'fairness', label: 'Bias, sensitivity and readability', rules: ['bias', 'readingLevel', 'situationLength', 'contextHeader'] },
  { id: 'media', label: 'Media', rules: ['mediaAlt', 'mediaTranscript', 'mediaSize', 'mediaAnalysis', 'mediaReference'] },
  { id: 'approval', label: 'Author approval and calibration', rules: ['approval', 'pending', 'calibration', 'flagged'] },
];

// Issues link to the stage that fixes them: a scenario opens in Scenarios, coverage opens the plan, Skills open the Brief.
export function goToIssue(go, issue) { if (issue.scenarioId) go(2, { scenarioId: issue.scenarioId }); else if (issue.step === 2) go(1); else go(2, { plan: true }); }

// Rows that repeat per scenario (approval, calibration) read better as one line with a count.
export function collapse(items) {
  const out = []; const seen = {};
  for (const i of items) {
    if (i.rule === 'approval' || i.rule === 'calibration') {
      const k = `${i.rule}:${i.severity}`;
      if (!seen[k]) { seen[k] = { ...i, count: 0, ids: [] }; out.push(seen[k]); }
      seen[k].count += 1; seen[k].ids.push(i.scenarioId);
      seen[k].message = i.rule === 'approval' ? `${seen[k].count} scenario${seen[k].count === 1 ? ' is' : 's are'} not yet approved.` : i.severity === 'hard' ? `${seen[k].count} open response scenario${seen[k].count === 1 ? '' : 's'} would reach more than 50 participants before AI scoring is calibrated.` : `AI scoring calibration is pending on ${seen[k].count} open response scenario${seen[k].count === 1 ? '' : 's'}.`;
      seen[k].fix = i.rule === 'approval' ? 'Open each scenario and mark it approved.' : i.severity === 'hard' ? 'Run calibration from the sidebar, or keep the first wave under 50.' : 'The first 30 responses are scored by two calibrators before AI scoring activates. Run calibration from the sidebar when responses arrive.';
    } else out.push(i);
  }
  return out;
}

export function GateGroups({ asm, gate, go }) {
  const scenarios = asm.scenarios || [];
  const byId = Object.fromEntries(scenarios.map((s, i) => [s.id, { s, i }]));
  return (
    <div className="space-y-4">
      <div className="card overflow-hidden">
        <table className="w-full text-sm"><thead><tr className="border-b border-[var(--line)] text-left text-xs uppercase tracking-wide text-[var(--ink-2)]"><th className="px-4 py-2">Skill</th><th className="px-2 py-2">Scenarios</th><th className="px-2 py-2">Observations</th><th className="px-2 py-2">Open response</th><th className="px-2 py-2">Confidence a participant can reach</th></tr></thead>
          <tbody>{asm.skills.map((k) => { const mine = scenarios.filter((s) => s.skillId === k.id); const obs = mine.reduce((a, s) => a + observationsFor(s), 0); const open = mine.filter((s) => s.responseType !== 'MCQ').length; return <tr key={k.id} className="border-t border-[var(--line)]"><td className="px-4 py-2 font-medium">{k.clientLabel || getSkill(k.id)?.name}</td><td className="px-2 py-2"><Badge tone={mine.length >= 3 ? 'ok' : mine.length >= 2 ? 'warn' : 'block'}>{mine.length}</Badge></td><td className="px-2 py-2"><Badge tone={obs >= 12 ? 'ok' : obs >= 8 ? 'warn' : 'block'}>{obs}</Badge></td><td className="px-2 py-2">{open} of {mine.length}</td><td className="px-2 py-2 muted text-xs">{obs >= 12 ? 'High, when scorer passes agree and no integrity flags' : obs >= 8 ? 'Medium at most: fewer than 12 observations' : 'Not publishable: under 8 observations'}</td></tr>; })}</tbody></table>
      </div>
      {GROUPS.map((g) => { const items = collapse(gate.issues.filter((i) => g.rules.includes(i.rule))); if (!items.length) return null; return (
        <div key={g.id} className="card overflow-hidden">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2"><span className="text-sm font-semibold">{g.label}</span><div className="flex gap-1">{items.filter((i) => i.severity === 'hard').length > 0 && <Badge tone="block">{items.filter((i) => i.severity === 'hard').length} block</Badge>}{items.filter((i) => i.severity === 'soft').length > 0 && <Badge tone="warn">{items.filter((i) => i.severity === 'soft').length} suggest</Badge>}</div></div>
          <ul className="divide-y divide-[var(--line)]">{items.map((i) => <li key={i.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5 text-sm"><div className="flex items-start gap-2"><Severity severity={i.severity} /><div><div>{i.message}</div><div className="muted text-xs">{i.fix}</div></div></div><Button size="sm" variant="secondary" onClick={() => goToIssue(go, i)}>{i.scenarioId ? `Open scenario ${byId[i.scenarioId]?.i + 1}` : i.step === 2 ? 'Open brief' : 'Open plan'}</Button></li>)}</ul>
        </div>); })}
      {gate.issues.length === 0 && <p className="text-sm text-[var(--ok)]">Every check passes.</p>}
    </div>
  );
}

export default function Step6Gate({ asm, gate, go }) {
  const scenarios = asm.scenarios || [];
  const byId = Object.fromEntries(scenarios.map((s, i) => [s.id, { s, i }]));
  const goTo = (issue) => goToIssue(go, issue);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Blocks publish" value={gate.hard.length} tone={gate.hard.length ? 'block' : 'ok'} sub={gate.hard.length ? 'Fix these to publish' : 'Nothing blocks publish'} />
        <Stat label="Suggestions" value={gate.soft.length} tone={gate.soft.length ? 'warn' : 'ok'} />
        <Stat label="Estimated total" value={`${gate.totalMinutes} min`} tone={gate.totalMinutes > RULES.time.totalHard ? 'block' : gate.totalMinutes > RULES.time.totalWarn ? 'warn' : undefined} sub={`Target ${RULES.time.totalTarget}, limit ${RULES.time.totalHard}`} />
        <Stat label="Approved" value={`${scenarios.filter((s) => s.approved).length}/${scenarios.length}`} tone={scenarios.every((s) => s.approved) ? 'ok' : undefined} />
      </div>
      <Panel title="Per Skill" padding="p-0">
        <table className="w-full text-sm"><thead><tr className="border-b border-[var(--line)] text-left text-xs uppercase tracking-wide text-[var(--ink-2)]"><th className="px-4 py-2">Skill</th><th className="px-2 py-2">Scenarios</th><th className="px-2 py-2">Observations</th><th className="px-2 py-2">Open response</th><th className="px-2 py-2">Confidence a participant can reach</th></tr></thead>
          <tbody>{asm.skills.map((k) => { const mine = scenarios.filter((s) => s.skillId === k.id); const obs = mine.reduce((a, s) => a + observationsFor(s), 0); const open = mine.filter((s) => s.responseType !== 'MCQ').length; return <tr key={k.id} className="border-t border-[var(--line)]"><td className="px-4 py-2 font-medium">{k.clientLabel || getSkill(k.id)?.name}</td><td className="px-2 py-2"><Badge tone={mine.length >= 3 ? 'ok' : mine.length >= 2 ? 'warn' : 'block'}>{mine.length}</Badge></td><td className="px-2 py-2"><Badge tone={obs >= 12 ? 'ok' : obs >= 8 ? 'warn' : 'block'}>{obs}</Badge></td><td className="px-2 py-2">{open} of {mine.length}</td><td className="px-2 py-2 muted text-xs">{obs >= 12 ? 'High, when scorer passes agree and no integrity flags' : obs >= 8 ? 'Medium at most: fewer than 12 observations' : 'Not publishable: under 8 observations'}</td></tr>; })}</tbody></table>
      </Panel>
      {GROUPS.map((g) => { const items = gate.issues.filter((i) => g.rules.includes(i.rule)); return (
        <Panel key={g.id} title={g.label} right={<div className="flex gap-1">{items.filter((i) => i.severity === 'hard').length > 0 && <Badge tone="block">{items.filter((i) => i.severity === 'hard').length} block</Badge>}{items.filter((i) => i.severity === 'soft').length > 0 && <Badge tone="warn">{items.filter((i) => i.severity === 'soft').length} suggest</Badge>}{items.length === 0 && <Badge tone="ok">Passes</Badge>}</div>} padding="p-0">
          {items.length === 0 ? <p className="muted p-4 text-sm">No issues.</p> : <ul className="divide-y divide-[var(--line)]">{items.map((i) => <li key={i.id} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2.5 text-sm"><div className="flex items-start gap-2"><Severity severity={i.severity} /><div><div>{i.message}</div><div className="muted text-xs">{i.fix}</div></div></div><Button size="sm" variant="secondary" onClick={() => goTo(i)}>{i.scenarioId ? `Open scenario ${byId[i.scenarioId]?.i + 1}` : `Go to step ${i.step || 3}`}</Button></li>)}</ul>}
        </Panel>
      ); })}
      <div className="flex items-center justify-between gap-3">
        <p className={`text-sm ${gate.canPublish ? 'text-[var(--ok)]' : 'text-[var(--block)]'}`}>{gate.canPublish ? 'Everything that must pass has passed. Configure and publish when ready.' : `${gate.hard.length} item${gate.hard.length === 1 ? '' : 's'} block publish. The publish button stays disabled until they are fixed.`}</p>
        <div className="flex gap-2"><Button variant="secondary" onClick={() => go(5)}>Back</Button><Button size="lg" onClick={() => go(7)}>Configure and publish</Button></div>
      </div>
    </div>
  );
}
