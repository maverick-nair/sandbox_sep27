import React from 'react';
import { Button, Badge, EmptyState, Stat } from '../components/ui.jsx';
import { useWorkspace } from '../engine/WorkspaceContext.jsx';
import { runQualityGate } from '../engine/qualityGate.js';
import { getSkill } from '../content/ontology.js';
import { RULES } from '../content/rules.js';

const STAGE_LABELS = ['Brief', 'Scenarios', 'Preview', 'Publish'];

export default function Home() {
  const { ws, createAssessment, openAssessment, deleteAssessment, duplicateAssessment } = useWorkspace();
  const sample = ws.assessments.find((a) => a.sample);
  const mine = ws.assessments.filter((a) => !a.sample).sort((a, b) => b.updatedAt - a.updatedAt);
  const published = ws.assessments.filter((a) => a.status === 'published' && !a.sample).length;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="muted mt-0.5 max-w-2xl text-sm">Speak, upload or type a brief and the platform builds a scenario based Skills assessment for you to review.</p>
        </div>
        <Button size="lg" onClick={() => createAssessment()}>+ New assessment</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Drafts" value={mine.filter((a) => a.status === 'draft').length} />
        <Stat label="Published" value={published} sub={published < RULES.review.mandatoryFirstN ? `First ${RULES.review.mandatoryFirstN} go to KNOLSKAPE review` : 'Review optional from here'} />
        <Stat label="AI usage" value={`$${ws.usage.costUsd.toFixed(2)}`} sub={`${ws.usage.calls} calls, ${ws.usage.errors} errors`} />
      </div>
      {sample && (
        <section className="card flex flex-wrap items-center justify-between gap-3 border-[var(--brand)]/30 bg-[var(--brand-soft)]/40 p-4">
          <div>
            <div className="flex items-center gap-2"><h2 className="text-sm font-semibold">Explore the sample first</h2><Badge tone="brand">Sample</Badge></div>
            <p className="muted mt-0.5 text-sm">{sample.config.name}: {sample.skills.map((s) => getSkill(s.id)?.name).join(', ')}. {sample.scenarios.length} scenarios, published. Open it to see what a finished assessment looks like, or copy it as a starting point.</p>
          </div>
          <div className="flex gap-2"><Button variant="secondary" onClick={() => openAssessment(sample.id)}>Open sample</Button><Button variant="secondary" onClick={() => duplicateAssessment(sample.id)}>Use as starting point</Button></div>
        </section>
      )}
      {mine.length === 0 ? <EmptyState title="No assessments yet" text="Start from a brief, a document, or the sample. A first assessment takes under an hour; the platform keeps the rigor and you keep control of the content." action={<Button onClick={() => createAssessment()}>Create your first assessment</Button>} /> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {mine.map((a) => <AssessmentCard key={a.id} a={a} onOpen={() => openAssessment(a.id)} onDelete={() => { if (confirm(`Delete "${a.config.name || 'Untitled assessment'}"? Published versions are removed from this workspace too.`)) deleteAssessment(a.id); }} onDuplicate={() => duplicateAssessment(a.id)} />)}
        </ul>
      )}
    </div>
  );
}

function AssessmentCard({ a, onOpen, onDelete, onDuplicate }) {
  const gate = a.scenarios?.length ? runQualityGate(a) : null;
  const approved = a.scenarios?.filter((s) => s.approved).length || 0;
  return (
    <li className="card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{a.config.name || 'Untitled assessment'}</h3>
          <p className="muted text-xs">{a.intent.audience || 'Audience not set'} · {a.skills.length ? a.skills.map((s) => s.clientLabel || getSkill(s.id)?.name).join(', ') : 'Skills not chosen'}</p>
        </div>
        {a.status === 'published' ? <Badge tone="ok">Published v{a.currentVersion}</Badge> : <Badge>Draft{a.currentVersion ? ` (v${a.currentVersion} live)` : ''}</Badge>}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge tone="neutral">Stage {a.stage || 1}: {STAGE_LABELS[(a.stage || 1) - 1]}</Badge>
        {a.scenarios?.length > 0 && <Badge tone="neutral">{approved}/{a.scenarios.length} approved</Badge>}
        {gate && <Badge tone={gate.canPublish ? 'ok' : 'block'}>{gate.canPublish ? 'Ready to publish' : `${gate.hard.length} to fix`}</Badge>}
        {gate && <Badge tone={gate.totalMinutes > RULES.time.totalWarn ? 'warn' : 'neutral'}>{gate.totalMinutes} min</Badge>}
      </div>
      <div className="flex items-center justify-between">
        <span className="faint text-xs">Updated {new Date(a.updatedAt).toLocaleString()}</span>
        <div className="flex gap-1"><Button variant="ghost" size="sm" onClick={onDuplicate}>Duplicate</Button><Button variant="ghost" size="sm" onClick={onDelete}>Delete</Button><Button size="sm" onClick={onOpen}>Open</Button></div>
      </div>
    </li>
  );
}
