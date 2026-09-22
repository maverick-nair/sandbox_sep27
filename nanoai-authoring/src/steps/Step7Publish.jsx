import React, { useEffect, useState } from 'react';
import { Button, Panel, Field, Input, Select, Badge } from '../components/ui.jsx';
import { RULES, PURPOSES } from '../content/rules.js';
import { getSkill, ONTOLOGY_VERSION } from '../content/ontology.js';
import { publish as publishAsm, toCsv } from '../engine/store.js';
import { currentModelVersion } from '../engine/generator.js';
import { PROMPT_VERSION } from '../engine/llm.js';
import { useWorkspace } from '../engine/WorkspaceContext.jsx';
import { observationsFor } from '../engine/duration.js';

function download(name, text, type = 'application/json') { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }

export default function Step7Publish({ asm, update, go, gate, readOnly, toast, embedded }) {
  const { ws, setWs, role } = useWorkspace();
  const [confirming, setConfirming] = useState(false);
  const c = asm.config;
  useEffect(() => { if (!c.name.trim() && !readOnly && asm.intent.audience.trim()) { const p = PURPOSES.find((x) => x.id === asm.intent.purpose)?.label || 'Assessment'; update((a) => ({ ...a, config: { ...a.config, name: `${p}: ${a.intent.audience.trim().slice(0, 60)}` } }), { undoable: false }); } }, []); // eslint-disable-line
  const set = (patch, action) => update((a) => ({ ...a, config: { ...a.config, ...patch } }), { action: action || 'config.changed', after: patch });
  const setVis = (k, v) => set({ reportVisibility: { ...c.reportVisibility, [k]: v } }, 'config.report_visibility');
  const reviewRequired = ws.publishedCount < RULES.review.mandatoryFirstN;
  const nameMissing = !c.name.trim();
  const canPublish = gate.canPublish && !nameMissing && !readOnly;

  const doPublish = () => {
    const next = publishAsm(asm, { modelVersion: currentModelVersion(), promptVersion: PROMPT_VERSION, reviewRequired });
    update(() => next, { action: 'assessment.published', after: { version: next.currentVersion, ontology: ONTOLOGY_VERSION, model: currentModelVersion(), review: reviewRequired ? 'knolskape_review' : 'none' }, undoable: false });
    setWs((w) => ({ ...w, publishedCount: (w.publishedCount || 0) + 1 }));
    setConfirming(false);
    toast(`Published version ${next.currentVersion}. ${reviewRequired ? 'It goes to KNOLSKAPE review before participants can be invited.' : 'Participants can be invited now.'}`, 'ok');
  };

  const exportPackage = (v) => {
    const pkg = { product: 'NanoAI', kind: 'assessment-package', exportedAt: new Date().toISOString(), assessmentId: asm.id, version: v.version, ontologyVersion: v.ontologyVersion, modelVersion: v.modelVersion, promptVersion: v.promptVersion, reviewStatus: v.reviewStatus, config: v.config, skills: v.skills.map((s) => ({ ...s, ontology: getSkill(s.id) })), scenarios: v.scenarios, blueprint: v.blueprint };
    download(`nanoai-${(asm.config.name || 'assessment').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-v${v.version}.json`, JSON.stringify(pkg, null, 2));
  };
  const exportBlueprintCsv = () => download('nanoai-blueprint.csv', toCsv(asm.scenarios.map((s, i) => ({ order: i + 1, title: s.title, skill: getSkill(s.skillId)?.name, response_type: s.responseType, difficulty: s.difficulty, situation_tag: s.tag, observations: observationsFor(s), recommended_minutes: s.recommendedMinutes, cap: s.responseType === 'Audio' ? `${s.cap?.audioSeconds}s` : s.responseType === 'Text' ? `${s.cap?.textChars} chars` : '', approved: s.approved, calibration: s.calibration }))), 'text/csv');

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        {!embedded && <div><h1 className="text-xl font-semibold">Configure and publish</h1><p className="muted mt-1 text-sm">Minimal configuration. Publishing creates a versioned, immutable assessment. Edits after publish create a new version; participants in flight finish on theirs.</p></div>}
        <Panel title="Assessment" padding="p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name" required hint="shown to participants on the welcome screen" className="sm:col-span-2"><Input value={c.name} onChange={(e) => set({ name: e.target.value })} disabled={readOnly} placeholder="Store manager readiness, Q4" /></Field>
            <Field label="Audience visibility"><Select value={c.audienceVisibility} onChange={(e) => set({ audienceVisibility: e.target.value })} disabled={readOnly}><option value="invited">Invited participants only</option><option value="workspace">Anyone in the workspace with the link</option><option value="cohort">Assigned cohorts in GenieKreator</option></Select></Field>
            <Field label="Expected participants in the first wave" hint="over 50 needs calibration first for open response scenarios"><Input type="number" min={1} value={c.expectedParticipants} onChange={(e) => set({ expectedParticipants: Number(e.target.value) })} disabled={readOnly} /></Field>
            <Field label="Authoring language"><Select value="en" disabled><option value="en">English</option></Select></Field>
            <Field label="Participant languages" hint="speech to text and PII detection are calibrated per language"><div className="flex gap-3 pt-2 text-sm">{[['en', 'English'], ['hi', 'Hindi']].map(([code, label]) => <label key={code} className="flex items-center gap-1.5"><input type="checkbox" disabled={readOnly} checked={c.participantLanguages.includes(code)} onChange={(e) => set({ participantLanguages: e.target.checked ? [...c.participantLanguages, code] : c.participantLanguages.filter((x) => x !== code) })} />{label}</label>)}</div></Field>
            <Field label="Available from"><Input type="date" value={c.windowStart} onChange={(e) => set({ windowStart: e.target.value })} disabled={readOnly} /></Field>
            <Field label="Available until"><Input type="date" value={c.windowEnd} onChange={(e) => set({ windowEnd: e.target.value })} disabled={readOnly} /></Field>
          </div>
        </Panel>
        <Panel title="Sittings and retakes" padding="p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Sittings allowed"><Select value={c.sittings} onChange={(e) => set({ sittings: Number(e.target.value) })} disabled={readOnly}>{[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</Select></Field>
            <Field label="Within (days)"><Input type="number" min={1} max={30} value={c.sittingWindowDays} onChange={(e) => set({ sittingWindowDays: Number(e.target.value) })} disabled={readOnly} /></Field>
            <Field label="No retake within (days)"><Input type="number" min={0} max={365} value={c.retakeDays} onChange={(e) => set({ retakeDays: Number(e.target.value) })} disabled={readOnly} /></Field>
            <Field label="Scenario order"><Select value={c.scenarioOrder || 'shuffled'} onChange={(e) => set({ scenarioOrder: e.target.value }, 'config.scenario_order')} disabled={readOnly}><option value="shuffled">Shuffled per participant</option><option value="fixed">Fixed for everyone</option></Select></Field>
            <p className="muted text-xs sm:col-span-2">Scenarios are independent, so each participant gets their own order: no two people see the same scenario at the same time. Skills stay interleaved and no more than two audio scenarios run back to back. The order is seeded by the attempt, so it holds across sittings.</p>
            <label className="flex items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" checked={c.parallelFormOnRetake} onChange={(e) => set({ parallelFormOnRetake: e.target.checked })} disabled={readOnly} />Serve a parallel form on retake when one exists. Without one, the same form is served and prior exposure is flagged on the result.</label>
          </div>
        </Panel>
        <Panel title="Report visibility and export" padding="p-5">
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <label className="flex items-start gap-2"><input type="checkbox" checked disabled className="mt-1" /><span><strong>Participant</strong><span className="muted block text-xs">Full report with their own quoted, anonymized responses. Always on.</span></span></label>
            <label className="flex items-start gap-2"><input type="checkbox" checked={c.reportVisibility.manager} onChange={(e) => setVis('manager', e.target.checked)} disabled={readOnly} className="mt-1" /><span><strong>Manager</strong><span className="muted block text-xs">Scores, bands, strengths, development areas and team rollup. No transcripts or question level detail.</span></span></label>
            <label className="flex items-start gap-2"><input type="checkbox" checked={c.reportVisibility.org} onChange={(e) => setVis('org', e.target.checked)} disabled={readOnly} className="mt-1" /><span><strong>Organization</strong><span className="muted block text-xs">Cohort distributions, completion list, integrity flags, export. No cohort view under 5 participants.</span></span></label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={c.exportCsv} onChange={(e) => set({ exportCsv: e.target.checked })} disabled={readOnly} />CSV export of scores, bands and confidence</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={c.exportPdf} onChange={(e) => set({ exportPdf: e.target.checked })} disabled={readOnly} />PDF report download</label>
          </div>
        </Panel>
        <div className="flex items-center justify-between gap-3">
          <p className={`text-sm ${canPublish ? 'muted' : 'text-[var(--block)]'}`}>{readOnly ? `Version ${asm.currentVersion} is published. Use "Edit as new version" in the header to change it.` : nameMissing ? 'Give the assessment a name to publish.' : !gate.canPublish ? `${gate.hard.length} item${gate.hard.length === 1 ? '' : 's'} block publish.` : reviewRequired ? `This is one of the first ${RULES.review.mandatoryFirstN} assessments in this workspace, so it goes to KNOLSKAPE review after publish.` : 'Ready to publish.'}</p>
          <div className="flex gap-2"><Button variant="secondary" onClick={() => go(3)}>Preview</Button><Button size="lg" disabled={!canPublish} onClick={() => setConfirming(true)}>Publish version {(asm.currentVersion || 0) + 1}</Button></div>
        </div>
        {confirming && (
          <Panel tone="ok" title={`Publish version ${(asm.currentVersion || 0) + 1}?`} padding="p-4">
            <ul className="muted space-y-1 text-sm"><li>The version is immutable. Further edits create version {(asm.currentVersion || 0) + 2}.</li><li>Pinned: ontology {ONTOLOGY_VERSION}, model {currentModelVersion()}, prompts {PROMPT_VERSION}.</li><li>{asm.scenarios.filter((s) => s.responseType !== 'MCQ').length} open response scenarios start with AI scoring pending calibration: their first 30 responses are scored by two calibrators.</li>{asm.scenarios.some((s) => s.flaggedForReview) && <li>{asm.scenarios.filter((s) => s.flaggedForReview).length} scenario(s) flagged for KNOLSKAPE review go to the review queue.</li>}{reviewRequired && <li>Mandatory KNOLSKAPE review applies to the first {RULES.review.mandatoryFirstN} assessments per workspace.</li>}</ul>
            <div className="mt-3 flex gap-2"><Button onClick={doPublish}>Publish</Button><Button variant="secondary" onClick={() => setConfirming(false)}>Cancel</Button></div>
          </Panel>
        )}
      </div>
      <aside className="space-y-4">
        <Panel title="Summary" padding="p-4">
          <dl className="grid grid-cols-2 gap-y-1.5 text-sm"><dt className="muted">Skills</dt><dd>{asm.skills.length}</dd><dt className="muted">Scenarios</dt><dd>{asm.scenarios.length} ({asm.scenarios.filter((s) => s.responseType === 'Audio').length} audio, {asm.scenarios.filter((s) => s.responseType === 'Text').length} text, {asm.scenarios.filter((s) => s.responseType === 'MCQ').length} MCQ)</dd><dt className="muted">Observations</dt><dd>{asm.scenarios.reduce((a, s) => a + observationsFor(s), 0)}</dd><dt className="muted">Estimated time</dt><dd>{gate.totalMinutes} min</dd><dt className="muted">Purpose</dt><dd className="capitalize">{asm.intent.purpose}</dd><dt className="muted">Audience</dt><dd className="truncate" title={asm.intent.audience}>{asm.intent.audience || '–'}</dd></dl>
          <div className="mt-3 flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={exportBlueprintCsv}>Export scenario list (CSV)</Button></div>
        </Panel>
        <Panel title="Versions" subtitle="Each version pins ontology, model and prompt versions. Historical scores are never recomputed silently." padding="p-0">
          {asm.versions.length === 0 ? <p className="muted p-4 text-sm">Not yet published.</p> : <ul className="divide-y divide-[var(--line)]">{[...asm.versions].reverse().map((v) => <li key={v.version} className="p-3 text-sm"><div className="flex items-center justify-between"><span className="font-medium">Version {v.version}</span><Badge tone={v.reviewStatus === 'published' ? 'ok' : 'warn'}>{v.reviewStatus === 'published' ? 'Live' : 'KNOLSKAPE review'}</Badge></div><div className="muted text-xs">{new Date(v.publishedAt).toLocaleString()} · {v.scenarios.length} scenarios · {v.ontologyVersion} · {v.modelVersion}</div><div className="mt-1.5 flex gap-2"><Button size="sm" variant="ghost" onClick={() => exportPackage(v)}>Export package</Button>{v.reviewStatus !== 'published' && (role === 'reviewer' || role === 'admin' ? <Button size="sm" variant="ghost" onClick={() => update((a) => ({ ...a, versions: a.versions.map((x) => (x.version === v.version ? { ...x, reviewStatus: 'published', reviewedBy: ws.author, reviewedAt: Date.now() } : x)) }), { action: 'version.review_completed', after: v.version, allowPublished: true })}>Complete KNOLSKAPE review</Button> : <span className="faint text-xs">Awaiting a KNOLSKAPE reviewer</span>)}</div></li>)}</ul>}
        </Panel>
        <Panel title="What happens after publish" padding="p-4"><ul className="muted list-disc space-y-1 pl-4 text-xs"><li>Participants enter by deep link, SSO or magic link; no account creation.</li><li>Open response scenarios: 30 responses go to two calibrators; AI scoring activates at agreement 0.75 or above per scoring question.</li><li>A 5 percent sample of published scenarios and analyses is reviewed by KNOLSKAPE monthly.</li><li>Item statistics surface here after 30 completions (next release).</li></ul></Panel>
      </aside>
    </div>
  );
}
