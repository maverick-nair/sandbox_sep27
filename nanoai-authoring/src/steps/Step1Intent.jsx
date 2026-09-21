import React, { useState } from 'react';
import { Button, Panel, Field, Input, Textarea, Select, Badge, Source } from '../components/ui.jsx';
import { PURPOSES } from '../content/rules.js';
import { extractText, extractSituations, ACCEPTED } from '../engine/documents.js';
import { detectPII, anonymize, PII_LABELS } from '../engine/pii.js';
import { llmExtractIntent } from '../engine/generator.js';
import { llmAvailable } from '../engine/llm.js';
import { uid } from '../engine/text.js';

export default function Step1Intent({ asm, update, go, readOnly, toast }) {
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const intent = asm.intent;
  const set = (patch, action) => update((a) => ({ ...a, intent: { ...a.intent, ...patch } }), action ? { action, after: patch } : undefined);

  const onFiles = async (e) => {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    setBusy(true);
    for (const f of files) {
      try {
        const { text, truncated, type } = await extractText(f);
        const findings = detectPII(text);
        const doc = { id: uid('doc'), name: f.name, type, chars: text.length, truncated, text, piiFindings: findings.map((x) => ({ type: x.type, kind: x.kind })), piiSummary: summarize(findings), anonymizedText: findings.length ? anonymize(text, findings).text : text, confirmed: findings.length === 0, addedAt: Date.now() };
        update((a) => ({ ...a, intent: { ...a.intent, documents: [...a.intent.documents, doc], extracted: null } }), { action: 'document.uploaded', after: { name: f.name, chars: text.length, pii: doc.piiSummary } });
        toast(findings.length ? `${f.name}: ${findings.length} personal data item${findings.length === 1 ? '' : 's'} found. Confirm anonymization before generation.` : `${f.name} added`, findings.length ? 'info' : 'ok');
      } catch (err) { toast(`${f.name}: ${err.message}`, 'error'); }
    }
    setBusy(false); e.target.value = '';
  };

  const confirmDoc = (id) => update((a) => ({ ...a, intent: { ...a.intent, documents: a.intent.documents.map((d) => (d.id === id ? { ...d, confirmed: true } : d)) } }), { action: 'document.anonymization_confirmed', after: id });
  const removeDoc = (id) => update((a) => ({ ...a, intent: { ...a.intent, documents: a.intent.documents.filter((d) => d.id !== id), extracted: null } }), { action: 'document.removed', before: id });

  const analyze = async () => {
    setAnalyzing(true);
    const material = [intent.situationsText, ...intent.documents.filter((d) => d.confirmed).map((d) => `Document: ${d.name}\n${d.anonymizedText}`)].filter(Boolean).join('\n\n');
    let extracted = null;
    if (llmAvailable()) extracted = await llmExtractIntent(material);
    if (!extracted) {
      const parts = [];
      if (intent.situationsText.trim()) parts.push(extractSituations(intent.situationsText, 'your brief'));
      for (const d of intent.documents.filter((x) => x.confirmed)) parts.push(extractSituations(d.anonymizedText, d.name));
      extracted = { situations: parts.flatMap((p) => p.situations).slice(0, 12), roles: [...new Set(parts.flatMap((p) => p.roles))], terms: [...new Set(parts.flatMap((p) => p.terms))].slice(0, 12), decisions: parts.flatMap((p) => p.decisions).slice(0, 6), noUsableSituations: parts.length > 0 && parts.every((p) => p.situations.length === 0), mode: 'scripted' };
    } else extracted.mode = 'llm';
    set({ extracted }, 'intent.analyzed');
    setAnalyzing(false);
  };

  const unconfirmed = intent.documents.filter((d) => !d.confirmed);
  const canContinue = intent.audience.trim() && intent.purpose && unconfirmed.length === 0;
  const hasMaterial = intent.situationsText.trim() || intent.documents.some((d) => d.confirmed);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <div><h1 className="text-xl font-semibold">Describe what you want to assess</h1><p className="muted mt-1 text-sm">Four plain questions. Only the first two are required; everything else makes the scenarios more yours.</p></div>
        <Panel title="1. Who is being assessed?" subtitle="Role, level, function. The situations and the reading level follow from this.">
          <Input value={intent.audience} onChange={(e) => set({ audience: e.target.value })} onBlur={() => set({}, 'intent.audience')} placeholder="First line managers in retail stores, 12 to 24 months in role" disabled={readOnly} aria-label="Target role or audience" />
        </Panel>
        <Panel title="2. Why are you running it?" subtitle="This sets defaults for retest, report visibility and how the results are framed.">
          <div className="grid gap-2 sm:grid-cols-2">
            {PURPOSES.map((p) => <button key={p.id} disabled={readOnly} onClick={() => set({ purpose: p.id }, 'intent.purpose')} aria-pressed={intent.purpose === p.id} className={`rounded-lg border p-3 text-left transition-colors ${intent.purpose === p.id ? 'border-[var(--brand)] bg-[var(--brand-soft)]' : 'border-[var(--line)] hover:bg-slate-50'}`}><div className="text-sm font-medium">{p.label}</div><div className="muted text-xs">{p.hint}</div></button>)}
          </div>
        </Panel>
        <Panel title="3. What situations do they face?" subtitle="Describe them in your words, or upload SOPs, case notes, incident logs, frameworks, program outlines or call transcripts. Optional: without this the platform generates from role, industry and Skill indicators.">
          <Textarea value={intent.situationsText} onChange={(e) => set({ situationsText: e.target.value })} onBlur={() => set({}, 'intent.situations')} placeholder="Managers handle escalations from angry customers when a delivery is late, decide who covers a shift at short notice, and give feedback to team members after a mystery shopper visit..." disabled={readOnly} className="min-h-[120px]" aria-label="Situations" />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--line)] bg-white px-3.5 py-2 text-sm font-medium hover:bg-slate-50 ${readOnly || busy ? 'pointer-events-none opacity-50' : ''}`}>{busy ? 'Reading files' : 'Upload documents'}<input type="file" multiple accept={ACCEPTED} className="hidden" onChange={onFiles} disabled={readOnly || busy} /></label>
            <span className="faint text-xs">PDF, DOCX, PPTX, XLSX, TXT. Text is extracted in your browser and stays in this workspace. Never added to shared banks without your consent.</span>
          </div>
          {intent.documents.length > 0 && (
            <ul className="mt-3 space-y-2">
              {intent.documents.map((d) => (
                <li key={d.id} className={`rounded-lg border p-3 text-sm ${d.confirmed ? 'border-[var(--line)]' : 'border-[var(--warn)] bg-[var(--warn-soft)]/50'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2"><span className="font-medium">{d.name}</span><Badge>{d.type.toUpperCase()}</Badge><span className="faint text-xs">{d.chars.toLocaleString()} characters{d.truncated ? ', truncated' : ''}</span></div>
                    {!readOnly && <Button variant="ghost" size="sm" onClick={() => removeDoc(d.id)}>Remove</Button>}
                  </div>
                  {Object.keys(d.piiSummary || {}).length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs">Personal data detected: {Object.entries(d.piiSummary).map(([k, v]) => `${v} ${PII_LABELS[k] || k}`).join(', ')}. It will be replaced with typed placeholders such as [Person] before any generation. Sensitive personal data is redacted entirely. The original stays in this workspace only.</p>
                      {!d.confirmed && !readOnly && <Button size="sm" className="mt-2" onClick={() => confirmDoc(d.id)}>Confirm anonymization and use this document</Button>}
                      {d.confirmed && <Badge tone="ok" className="mt-2">Anonymization confirmed</Badge>}
                    </div>
                  )}
                  <details className="mt-1"><summary className="faint cursor-pointer text-xs">Preview what the platform will read</summary><pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-slate-50 p-2 text-xs">{d.anonymizedText.slice(0, 3000)}</pre></details>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="4. Any language of yours to use?" subtitle="Company, product, team and process names. The first capitalized term is used as the company name in scenarios, the second as a product. Optional: default is neutral business language.">
          <Input value={intent.terminology} onChange={(e) => set({ terminology: e.target.value })} onBlur={() => set({}, 'intent.terminology')} placeholder="Northwind Retail, Store Connect, Regional Huddle" disabled={readOnly} aria-label="Client terminology" />
        </Panel>
        <div className="flex items-center justify-between">
          <p className="muted text-sm">{!intent.audience.trim() ? 'Add who is being assessed to continue.' : unconfirmed.length ? `Confirm anonymization on ${unconfirmed.length} document${unconfirmed.length === 1 ? '' : 's'} to continue.` : 'Next: the platform proposes 3 to 5 Skills from your intent.'}</p>
          <Button size="lg" disabled={!canContinue} onClick={async () => { if (hasMaterial && !intent.extracted) await analyze(); go(2); }} busy={analyzing}>Continue to Skills</Button>
        </div>
      </div>
      <aside className="space-y-4">
        <Panel title="What the platform found" subtitle={hasMaterial ? 'Real situations, roles and terms extracted from your material. Scenarios are grounded in these.' : 'Add situations or documents and the platform extracts the real situations to build from.'} right={hasMaterial && !readOnly ? <Button size="sm" variant="secondary" onClick={analyze} busy={analyzing}>{intent.extracted ? 'Re-analyze' : 'Analyze material'}</Button> : null}>
          {!intent.extracted && <p className="faint text-sm">{hasMaterial ? 'Click Analyze material, or continue and it runs automatically.' : 'Nothing yet.'}</p>}
          {intent.extracted?.noUsableSituations && <div className="rounded-lg border border-[var(--warn)] bg-[var(--warn-soft)]/60 p-3 text-sm">The platform found no usable situations in this material{intent.extracted.summary ? ` (${intent.extracted.summary})` : ''}. It will generate from the role and the Skills instead. Below is what it did extract.</div>}
          {intent.extracted && !intent.extracted.noUsableSituations && (
            <div className="space-y-3 text-sm">
              <div><div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--ink-2)]">Situations <Badge>{intent.extracted.situations.length}</Badge></div><ul className="space-y-1.5">{intent.extracted.situations.slice(0, 8).map((s) => <li key={s.id} className="rounded bg-slate-50 p-2 text-xs"><div>{s.text.length > 220 ? `${s.text.slice(0, 220)}…` : s.text}</div><Source>From {s.source}</Source></li>)}</ul></div>
              {intent.extracted.roles?.length > 0 && <div><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ink-2)]">Roles</div><div className="flex flex-wrap gap-1">{intent.extracted.roles.map((r) => <span key={r} className="chip">{r}</span>)}</div></div>}
              {intent.extracted.terms?.length > 0 && <div><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[var(--ink-2)]">Terms</div><div className="flex flex-wrap gap-1">{intent.extracted.terms.map((r) => <span key={r} className="chip">{r}</span>)}</div></div>}
              <Source>{intent.extracted.mode === 'llm' ? 'Extracted by the AI from your material' : 'Extracted by pattern matching. Connect an API key in Settings for richer extraction.'}</Source>
            </div>
          )}
        </Panel>
        <Panel title="How this works" padding="p-4">
          <ol className="muted list-decimal space-y-1 pl-4 text-xs">
            <li>You describe intent or upload documents.</li><li>The platform proposes 3 to 5 Skills from the Skills Ontology.</li><li>It builds a blueprint with a time plan before writing anything.</li><li>You review one scenario at a time, with its scoring questions and limits.</li><li>You preview as a participant, pass the quality gate, and publish.</li>
          </ol>
        </Panel>
      </aside>
    </div>
  );
}

function summarize(findings) { const s = {}; for (const f of findings) s[f.type] = (s[f.type] || 0) + 1; return s; }
