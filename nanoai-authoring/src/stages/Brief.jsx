import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Panel, Input, Badge, Confidence, Source, Modal, Progress } from '../components/ui.jsx';
import { PURPOSES, RULES, purposeById } from '../content/rules.js';
import { Select } from '../components/ui.jsx';
import { getSkill, SKILLS } from '../content/ontology.js';
import { extractText, ACCEPTED } from '../engine/documents.js';
import { detectPII, anonymize, PII_LABELS } from '../engine/pii.js';
import { llmExtractIntent, llmRankSkills } from '../engine/generator.js';
import { proposeSkills, mapClientSkill, searchSkills } from '../engine/mapping.js';
import { planBlueprint } from '../engine/blueprint.js';
import { buildScenarios } from '../engine/build.js';
import { uid } from '../engine/text.js';

const Mic = ({ live }) => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill={live ? 'currentColor' : 'none'} /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" /></svg>;
const Up = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" /></svg>;

function intentText(asm) { const i = asm.intent; return [i.audience, i.situationsText, i.terminology, ...(i.extracted?.situations || []).map((s) => s.text), ...(i.extracted?.roles || []), ...(i.extracted?.terms || []), ...(i.documents || []).filter((d) => d.confirmed).map((d) => d.anonymizedText.slice(0, 8000))].filter(Boolean).join('\n'); }
function summarizePii(findings) { const s = {}; for (const f of findings) s[f.type] = (s[f.type] || 0) + 1; return s; }

// Dictation into the brief. Browser speech recognition where available; the author sees words appear
// as they speak and can edit them like typed text.
function useDictation(onText) {
  const [live, setLive] = useState(false);
  const [supported] = useState(() => typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  const recRef = useRef(null); const baseRef = useRef('');
  const [error, setError] = useState('');
  const start = (current) => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return;
    setError('');
    const r = new SR(); r.continuous = true; r.interimResults = true; r.lang = 'en-US';
    baseRef.current = current ? `${current.trim()} ` : '';
    r.onresult = (e) => { let t = ''; for (const res of e.results) t += res[0].transcript + ' '; onText(baseRef.current + t.trim()); };
    r.onend = () => setLive(false);
    r.onerror = (e) => { setLive(false); setError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Microphone access was blocked. Allow it in the browser, or type or upload instead.' : e.error === 'network' ? 'Speech recognition needs a network connection.' : 'Dictation stopped. Type or upload instead.'); };
    try { r.start(); recRef.current = r; setLive(true); } catch { setError('Dictation could not start in this browser. Type or upload instead.'); }
  };
  const stop = () => { try { recRef.current?.stop(); } catch {} setLive(false); };
  useEffect(() => () => { try { recRef.current?.stop(); } catch {} }, []);
  return { live, supported, start, stop, error };
}

export default function Brief({ asm, update, go, readOnly, toast }) {
  const intent = asm.intent;
  // Live typing and dictation update without an undo step; the blur or action commit records one.
  const set = (patch, action) => update((a) => ({ ...a, intent: { ...a.intent, ...patch } }), action ? { action, after: patch } : { undoable: false });
  const briefPii = useMemo(() => detectPII(intent.situationsText || ''), [intent.situationsText]);
  const anonymizeBrief = () => { const out = anonymize(intent.situationsText, briefPii); set({ situationsText: out.text }, 'intent.brief_anonymized'); toast(`Replaced ${briefPii.length} personal detail${briefPii.length === 1 ? '' : 's'} with placeholders.`, 'ok'); };
  const [busy, setBusy] = useState('');
  const [build, setBuild] = useState(null);
  const [query, setQuery] = useState('');
  const [clientName, setClientName] = useState('');
  const [mapping, setMapping] = useState(null);
  const [swapFor, setSwapFor] = useState(null);
  const [confirmedLow, setConfirmedLow] = useState({});
  const [more, setMore] = useState(Boolean(intent.terminology));
  useEffect(() => { if (intent.terminology && !more) setMore(true); }, [intent.terminology]); // eslint-disable-line
  const dictation = useDictation((t) => set({ situationsText: t }));
  const dictationError = dictation.error;
  const text = useMemo(() => intentText(asm), [asm.intent]);

  // Prefill every field from what the document says: audience from roles, purpose from cue words, company and
  // product names from repeated proper nouns, and the brief itself from the extracted situations.
  const prefillFrom = (extracted, docName) => {
    if (!extracted) return [];
    const filled = [];
    const patch = {};
    const cur = intent;
    if (!cur.audience.trim()) { const aud = extracted.audience || (extracted.roles?.length ? extracted.roles[0].replace(/^\w/, (c) => c.toUpperCase()) + (extracted.roles.length > 1 ? 's' : '') : ''); if (aud) { patch.audience = aud; filled.push('audience'); } }
    const text = `${extracted.summary || ''} ${(extracted.situations || []).map((s) => s.text).join(' ')} ${(extracted.decisions || []).join(' ')}`.toLowerCase();
    if (!cur.purposeTouched) {
      const guess = extracted.purpose || (/onboard|new hire|first 90|induction/.test(text) ? 'onboarding' : /promot|readiness|new role|step up/.test(text) ? 'readiness' : /retest|after the program|post.?program|follow.?up/.test(text) ? 'retest' : /compliance|audit|regulat/.test(text) ? 'function' : /manager|team lead|supervisor/.test(text) ? 'manager' : /sop|case note|incident|complaint/.test(text) ? 'client' : null);
      if (guess && guess !== cur.purpose) { patch.purpose = guess; filled.push('purpose'); }
    }
    if (!cur.terminology.trim() && extracted.terms?.length) { patch.terminology = extracted.terms.slice(0, 2).join(', '); filled.push('company and product names'); }
    if (!cur.situationsText.trim() && extracted.situations?.length) { patch.situationsText = extracted.situations.slice(0, 4).map((s) => s.text).join('\n\n'); filled.push('brief'); }
    if (filled.length) { update((a) => ({ ...a, intent: { ...a.intent, ...patch, prefilled: { from: docName, fields: filled, at: Date.now() } } }), { action: 'intent.prefilled', after: { from: docName, fields: filled } }); }
    return filled;
  };

  const onFiles = async (files) => {
    if (!files.length) return;
    setBusy('Reading your files');
    for (const f of files) {
      try {
        const { text: t, truncated, type } = await extractText(f);
        const findings = detectPII(t);
        const doc = { id: uid('doc'), name: f.name, type, chars: t.length, truncated, text: t, piiFindings: findings.map((x) => ({ type: x.type, kind: x.kind })), piiSummary: summarizePii(findings), anonymizedText: findings.length ? anonymize(t, findings).text : t, confirmed: findings.length === 0, addedAt: Date.now() };
        update((a) => ({ ...a, intent: { ...a.intent, documents: [...a.intent.documents, doc], extracted: null } }), { action: 'document.uploaded', after: { name: f.name, chars: t.length, pii: doc.piiSummary } });
        if (findings.length) toast(`${f.name}: personal data found. Confirm anonymization below before building.`);
        else {
          // Clean document: read it now, fill the fields it answers, and propose the Skills straight away.
          {
            setBusy(`Reading ${f.name} and filling in the brief`);
            const extracted = await llmExtractIntent(`${intent.situationsText}\n\nDocument: ${f.name}\n${doc.anonymizedText}`);
            if (!extracted) toast(`${f.name} added, but the AI could not read it just now. Use "Read documents again" to retry.`, 'error');
            else {
              set({ extracted }, 'intent.analyzed');
              const filled = prefillFrom(extracted, f.name);
              toast(filled.length ? `Filled in ${filled.join(', ')} from ${f.name}. Check and adjust.` : `${f.name} added. No usable situations found in it.`, filled.length ? 'ok' : 'info');
              if ((filled.includes('audience') || intent.audience.trim()) && !asm.skills.length) setTimeout(() => proposeRef.current?.(), 50);
            }
          }
        }
      } catch (err) { toast(`${f.name}: ${err.message}`, 'error'); }
    }
    setBusy('');
  };
  const proposeRef = useRef(null);
  const confirmDoc = async (id) => {
    update((a) => ({ ...a, intent: { ...a.intent, documents: a.intent.documents.map((d) => (d.id === id ? { ...d, confirmed: true } : d)) } }), { action: 'document.anonymization_confirmed', after: id });
    const doc = intent.documents.find((d) => d.id === id);
    if (!doc) return;
    setBusy(`Reading ${doc.name} and filling in the brief`);
    const extracted = await llmExtractIntent(doc.anonymizedText);
    if (!extracted) { toast('The AI could not read the document just now. Use "Read documents again" to retry.', 'error'); setBusy(''); return; }
    set({ extracted }, 'intent.analyzed');
    const filled = prefillFrom(extracted, doc.name);
    if (filled.length) toast(`Filled in ${filled.join(', ')} from ${doc.name}. Check and adjust.`, 'ok');
    setBusy('');
    if ((filled.includes('audience') || intent.audience.trim()) && !asm.skills.length) setTimeout(() => proposeRef.current?.(), 50);
  };
  const removeDoc = (id) => update((a) => ({ ...a, intent: { ...a.intent, documents: a.intent.documents.filter((d) => d.id !== id), extracted: null } }), { action: 'document.removed', before: id });

  const analyze = async () => {
    const material = [intent.situationsText, ...intent.documents.filter((d) => d.confirmed).map((d) => `Document: ${d.name}\n${d.anonymizedText}`)].filter(Boolean).join('\n\n');
    if (!material.trim()) return null;
    const extracted = await llmExtractIntent(material);
    if (!extracted) return null;
    set({ extracted }, 'intent.analyzed');
    return extracted;
  };

  const propose = async () => {
    if (!asm.intent.audience.trim()) return;
    setBusy('Reading your brief and matching it to the Skills Ontology');
    await analyze();
    // Ontology retrieval narrows the candidates; the model ranks them and explains each choice.
    const local = proposeSkills(intentText({ ...asm, intent: { ...intent } }) + '\n' + text);
    const ranked = await llmRankSkills(text, local.ranked.slice(0, 10));
    if (!ranked) { setBusy(''); toast('The AI could not rank the Skills just now. Try again, or add Skills by hand on the right.', 'error'); return; }
    const proposed = ranked.map((r) => ({ id: r.id, confidence: r.confidence, evidence: r.evidence, source: `AI mapped from your brief: ${r.evidence[0] || ''}` }));
    update((a) => ({ ...a, skills: proposed, skillsConfirmed: false, blueprint: null, scenarios: [] }), { action: 'skills.proposed', after: proposed.map((p) => `${p.id}:${p.confidence}`) });
    setBusy('');
  };

  useEffect(() => { proposeRef.current = propose; });
  const Prefilled = ({ field }) => (intent.prefilled?.fields?.includes(field) ? <Badge tone="brand" title={`Filled from ${intent.prefilled.from}`}>From your document</Badge> : null);
  const add = (id, extra = {}) => {
    if (asm.skills.some((s) => s.id === id)) return toast(`${getSkill(id).name} is already in the assessment.`);
    if (asm.skills.length >= RULES.skills.max) return toast(`An assessment holds at most ${RULES.skills.max} Skills so it stays short form. Remove one first.`, 'error');
    update((a) => ({ ...a, skills: [...a.skills, { id, confidence: 'High', evidence: [], source: 'Chosen by you', ...extra }], skillsConfirmed: false, blueprint: null, scenarios: [] }), { action: 'skill.added', after: { id, ...extra } });
  };
  const remove = (id) => update((a) => ({ ...a, skills: a.skills.filter((s) => s.id !== id), skillsConfirmed: false, blueprint: null, scenarios: [] }), { action: 'skill.removed', before: id });
  const swap = (fromId, toId) => { update((a) => ({ ...a, skills: a.skills.map((s) => (s.id === fromId ? { id: toId, confidence: 'High', evidence: [], source: `Swapped from ${getSkill(fromId).name}` } : s)), skillsConfirmed: false, blueprint: null, scenarios: [] }), { action: 'skill.swapped', before: fromId, after: toId }); setSwapFor(null); };

  // Build: plan the blueprint and generate every scenario, then land the author on the Scenarios stage.
  const buildNow = async () => {
    update({ skillsConfirmed: true }, { action: 'skills.confirmed', after: asm.skills.map((s) => s.id) });
    const seeds = intent.extracted?.situations || [];
    const bp = asm.blueprint || planBlueprint(asm.skills.map((s) => s.id), { seeds, purpose: intent.purpose });
    update((a) => ({ ...a, blueprint: bp, skillsConfirmed: true, config: { ...a.config, name: a.config.name.trim() || `${PURPOSES.find((x) => x.id === a.intent.purpose)?.label || 'Assessment'}: ${a.intent.audience.trim().slice(0, 60)}` } }), { action: 'blueprint.planned' });
    setBuild({ i: 0, total: bp.rows.length, status: 'Planning scenarios, response types and time' });
    await buildScenarios({ asm: { ...asm, blueprint: bp, skillsConfirmed: true }, update, onProgress: setBuild });
    setBuild(null);
    toast(`${bp.rows.length} scenarios ready to review.`, 'ok');
    go(2);
  };

  const n = asm.skills.length;
  const unconfirmed = intent.documents.filter((d) => !d.confirmed);
  const hasMaterial = intent.situationsText.trim() || intent.documents.some((d) => d.confirmed);
  const lowUnconfirmed = asm.skills.filter((s) => s.confidence === 'Low' && !confirmedLow[s.id]);
  const needAudience = !intent.audience.trim();
  const blockReason = needAudience ? 'Add who is being assessed.' : briefPii.length ? 'Anonymize the personal data in your brief.' : unconfirmed.length ? `Confirm anonymization on ${unconfirmed.length} document${unconfirmed.length === 1 ? '' : 's'}.` : n === 0 ? '' : n < RULES.skills.min ? `Choose at least ${RULES.skills.min} Skills: fewer cannot separate strengths from gaps.` : n > RULES.skills.max ? `Choose at most ${RULES.skills.max} Skills so the assessment stays short form.` : lowUnconfirmed.length ? `Confirm the ${lowUnconfirmed.length} Low confidence mapping${lowUnconfirmed.length === 1 ? '' : 's'}.` : '';
  const results = useMemo(() => searchSkills(query).filter((r) => !asm.skills.some((s) => s.id === r.id)).slice(0, 6), [query, asm.skills]);
  const alreadyBuilt = asm.scenarios?.length > 0 && asm.skillsConfirmed;

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        {/* Capture */}
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold">What do you want to assess?</h2>
            <div className="flex items-center gap-1.5">
              {dictation.supported ? <button disabled={readOnly} onClick={() => (dictation.live ? dictation.stop() : dictation.start(intent.situationsText))} aria-pressed={dictation.live} className={`pill ${dictation.live ? 'mic-live' : ''}`}><Mic live={dictation.live} />{dictation.live ? 'Listening, tap to stop' : 'Speak'}</button> : <span className="pill opacity-60" title="Dictation uses the browser's speech recognition, available in Chrome, Edge and Safari. In other browsers, type or upload.">Speak needs Chrome, Edge or Safari</span>}
              <label className={`pill cursor-pointer ${readOnly ? 'pointer-events-none opacity-50' : ''}`}><Up />Upload brief<input type="file" multiple accept={ACCEPTED} className="hidden" onChange={(e) => { onFiles([...(e.target.files || [])]); e.target.value = ''; }} disabled={readOnly} /></label>
            </div>
          </div>
          <p className="muted mt-0.5 text-xs">Describe the situations people face, in your words. Or drop in SOPs, case notes, incident logs, a programme outline or a call transcript: the platform fills in the brief, audience, purpose and names from it. One line is enough to start.</p>
          {intent.prefilled && <p className="mt-1 text-xs"><Badge tone="brand">Filled from {intent.prefilled.from}</Badge> <span className="muted">{intent.prefilled.fields.join(', ')}. Everything is editable.</span></p>}
          {dictationError && <p className="mt-1 text-xs text-[var(--block)]">{dictationError}</p>}
          <div className={`mt-3 rounded-xl border ${dictation.live ? 'border-[var(--brand)] ring-2 ring-[var(--brand-ring)]' : 'border-[var(--line)]'} bg-white`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFiles([...e.dataTransfer.files]); }}>
            <textarea value={intent.situationsText} onChange={(e) => set({ situationsText: e.target.value })} onBlur={() => set({}, 'intent.situations')} disabled={readOnly} rows={5} aria-label="Brief" placeholder={dictation.live ? 'Listening. Start talking about the situations your people face.' : 'Store managers handle escalations when a delivery is late, decide who covers a shift at short notice, and give feedback after a mystery shopper visit...'} className="w-full resize-none rounded-xl border-0 bg-transparent p-4 text-[15px] leading-relaxed focus:outline-none" />
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line)] px-3 py-2">
              {intent.documents.map((d) => <span key={d.id} className={`chip ${d.confirmed ? '' : 'border-[var(--warn)] bg-[var(--warn-soft)]'}`}>{d.name}<span className="faint">{d.type.toUpperCase()}</span>{!readOnly && <button className="faint hover:text-[var(--block)]" onClick={() => removeDoc(d.id)} aria-label={`Remove ${d.name}`}>×</button>}</span>)}
              <span className="faint ml-auto text-[11px]">{busy || 'PDF, DOCX, PPTX, XLSX, TXT, or drag files here. Text stays in your workspace.'}</span>
            </div>
          </div>
          {briefPii.length > 0 && <div className="mt-3 rounded-xl border border-[var(--warn)] bg-[var(--warn-soft)]/50 p-3 text-sm"><div className="font-medium">Personal data in your brief</div><p className="muted mt-0.5 text-xs">{Object.entries(summarizePii(briefPii)).map(([k, v]) => `${v} ${PII_LABELS[k] || k}`).join(', ')}. Real names and details must not reach the model or the scenarios. Replace them with placeholders such as [Person]; character names are invented for you.</p>{!readOnly && <Button size="sm" className="mt-2" onClick={anonymizeBrief}>Anonymize the brief</Button>}</div>}
          {unconfirmed.length > 0 && <ul className="mt-3 space-y-2">{unconfirmed.map((d) => <li key={d.id} className="rounded-xl border border-[var(--warn)] bg-[var(--warn-soft)]/50 p-3 text-sm"><div className="font-medium">{d.name}: personal data found</div><p className="muted mt-0.5 text-xs">{Object.entries(d.piiSummary).map(([k, v]) => `${v} ${PII_LABELS[k] || k}`).join(', ')}. Replaced with placeholders such as [Person] before anything is generated; sensitive details are removed entirely. The original stays here only.</p><details className="mt-1"><summary className="faint cursor-pointer text-xs">See what the platform will read</summary><pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-white p-2 text-xs">{d.anonymizedText.slice(0, 2000)}</pre></details><Button size="sm" className="mt-2" onClick={() => confirmDoc(d.id)}>Confirm anonymization</Button></li>)}</ul>}

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-1 flex items-center gap-2 text-sm font-medium">Who is being assessed? <span className="text-xs font-normal text-[var(--block)]">required</span><Prefilled field="audience" /></span><Input value={intent.audience} onChange={(e) => set({ audience: e.target.value })} onBlur={() => set({}, 'intent.audience')} placeholder="Store managers, 1 to 2 years in role" disabled={readOnly} /></label>
            <label className="block"><span className="mb-1 flex items-center gap-2 text-sm font-medium">Why are you running it? <Prefilled field="purpose" /></span><Select value={intent.purpose} onChange={(e) => { const p = purposeById(e.target.value); update((a) => ({ ...a, intent: { ...a.intent, purpose: p.id, purposeTouched: true }, config: a.config.purposeDefaultsFor && a.config.purposeDefaultsFor !== p.id || !a.config.purposeDefaultsFor ? { ...a.config, ...p.defaults, purposeDefaultsFor: p.id } : a.config }), { action: 'intent.purpose', after: p.id }); }} disabled={readOnly} aria-describedby="purpose-hint">{['Programmes', 'Talent', 'Organisation', 'Other'].map((g) => <optgroup key={g} label={g}>{PURPOSES.filter((p) => p.group === g).map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</optgroup>)}</Select><span id="purpose-hint" className="faint mt-1 block text-xs">{purposeById(intent.purpose).hint}. Sets retake, sittings and report visibility defaults; change them at publish.</span></label>
          </div>
          <button className="mt-3 text-xs text-[var(--brand)]" onClick={() => setMore(!more)}>{more ? 'Fewer options' : 'More options: your company and product names'}</button>
          {more && <label className="mt-2 block"><span className="faint mb-1 flex items-center gap-2 text-xs"><Prefilled field="company and product names" />Names to use in scenarios. The first becomes the company, the second a product. Comma separated.</span><Input value={intent.terminology} onChange={(e) => set({ terminology: e.target.value })} onBlur={() => set({}, 'intent.terminology')} placeholder="Northwind Retail, Store Connect" disabled={readOnly} /></label>}
          {n === 0 && <div className="mt-4 flex items-center justify-between gap-3"><p className={`text-sm ${needAudience || unconfirmed.length ? 'muted' : 'muted'}`}>{needAudience ? 'Add who is being assessed, then we propose the Skills.' : briefPii.length ? 'Anonymize the personal data in your brief first.' : unconfirmed.length ? 'Confirm anonymization, then we propose the Skills.' : 'Next: the platform proposes 3 to 5 Skills from your brief.'}</p><Button size="lg" disabled={needAudience || unconfirmed.length > 0 || briefPii.length > 0 || readOnly} busy={Boolean(busy)} onClick={propose}>Propose Skills</Button></div>}
        </section>

        {/* Skills */}
        {n > 0 && (
          <section className="card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h2 className="text-[15px] font-semibold">Skills to measure <span className="faint font-normal">({n} of 3 to 5)</span></h2><p className="muted mt-0.5 text-xs">Proposed from your brief. Remove, swap, or add your own on the right. Each Skill is scored on the behaviors shown.</p></div>
              {!readOnly && <Button variant="secondary" size="sm" onClick={propose} busy={Boolean(busy)}>Propose again</Button>}
            </div>
            <ul className="mt-3 grid gap-3 md:grid-cols-2">
              {asm.skills.map((entry) => { const s = getSkill(entry.id); if (!s) return null; return (
                <li key={entry.id} className="rounded-xl border border-[var(--line)] p-3.5">
                  <div className="flex items-start justify-between gap-2">
                    <div><div className="flex flex-wrap items-center gap-1.5"><span className="font-semibold">{entry.clientLabel && entry.clientLabel !== s.name ? entry.clientLabel : s.name}</span><Confidence level={entry.confidence} />{!s.hasProducts && <Badge tone="warn" title="This Skill has no products yet; the need is flagged to KNOLSKAPE.">Gap</Badge>}</div>{entry.clientLabel && entry.clientLabel !== s.name && <div className="faint text-xs">mapped to {s.name}</div>}<p className="muted mt-1 text-xs">{s.definition}</p></div>
                    {!readOnly && <div className="flex shrink-0 gap-0.5"><Button variant="ghost" size="sm" onClick={() => setSwapFor(entry.id)}>Swap</Button><Button variant="ghost" size="sm" onClick={() => remove(entry.id)} aria-label={`Remove ${s.name}`}>×</Button></div>}
                  </div>
                  <details className="mt-2"><summary className="cursor-pointer text-xs text-[var(--brand)]">Behaviors scored</summary><ul className="mt-1.5 space-y-1 text-xs">{s.indicators.filter((i) => i.effective).map((i) => <li key={i.id} className="flex gap-1.5"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-[var(--ok)]" />{i.text}</li>)}</ul></details>
                  <div className="mt-1.5"><Source>{entry.source}</Source></div>
                  {entry.confidence === 'Low' && !readOnly && <label className="mt-2 flex items-center gap-2 rounded-lg border border-[var(--warn)] bg-[var(--warn-soft)]/50 p-2 text-xs"><input type="checkbox" checked={Boolean(confirmedLow[entry.id])} onChange={(e) => setConfirmedLow({ ...confirmedLow, [entry.id]: e.target.checked })} />Your brief did not clearly point here. I confirm this is the Skill to measure.</label>}
                </li>); })}
            </ul>
            {build && <div className="mt-4 rounded-xl bg-[var(--brand-soft)] p-4"><div className="flex items-center justify-between text-sm"><span className="pulse font-medium">{build.status}</span><span className="muted">{Math.min(build.i + 1, build.total)} of {build.total}</span></div><div className="mt-2"><Progress value={build.i + 1} max={build.total} /></div><p className="faint mt-2 text-xs">The AI writes each situation, then reads it to derive the scoring questions and limits.</p></div>}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className={`text-sm ${blockReason ? 'text-[var(--block)]' : 'muted'}`}>{blockReason || (alreadyBuilt ? 'Scenarios already exist for these Skills.' : `${n} Skills. Next: the platform plans the scenarios, response types and time, writes them all, and you review.`)}</p>
              {alreadyBuilt && !readOnly ? <Button size="lg" onClick={() => go(2)}>Go to scenarios</Button> : <Button size="lg" disabled={Boolean(blockReason) || readOnly} busy={Boolean(build)} onClick={buildNow}>Build my assessment</Button>}
            </div>
          </section>
        )}
      </div>

      <aside aria-label="Skill tools and findings" className="space-y-4">
        {n > 0 && !readOnly && (
          <Panel title="Add a Skill" padding="p-4">
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search in plain words: delegation, numbers, saying no" aria-label="Search Skills" />
            {query.trim() && <ul className="mt-2 space-y-1">{results.map((r) => <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] p-2 text-sm"><div><div className="font-medium">{r.name}</div><div className="faint text-xs">{r.domain}</div></div><Button size="sm" variant="secondary" onClick={() => { add(r.id); setQuery(''); }}>Add</Button></li>)}{results.length === 0 && <li className="faint text-xs">No match. Try mapping your own name below.</li>}</ul>}
            <div className="mt-4 border-t border-[var(--line)] pt-3"><div className="mb-1 text-xs font-medium">Use your own Skill name</div><div className="flex gap-2"><Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Ownership mindset" aria-label="Client Skill name" /><Button variant="secondary" onClick={() => clientName.trim() && setMapping(mapClientSkill(clientName.trim()))}>Map</Button></div>
              {mapping && <div className="mt-2 space-y-1.5 text-sm">{mapping.gap && <p className="rounded-lg border border-[var(--warn)] bg-[var(--warn-soft)]/60 p-2 text-xs">Nothing matches "{mapping.clientLabel}" closely. Pick the nearest or request a new Skill; the gap is logged for KNOLSKAPE.</p>}{mapping.nearest.map((m, i) => <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] p-2"><div><div className="font-medium">{m.name}{i === 0 && <span className="faint ml-1 text-xs">nearest</span>}</div><Confidence level={m.confidence} /></div><Button size="sm" variant="secondary" onClick={() => { add(m.id, { clientLabel: mapping.clientLabel, confidence: m.confidence, source: `Your Skill "${mapping.clientLabel}" mapped to ${m.name}` }); setMapping(null); setClientName(''); }}>Use</Button></div>)}{mapping.gap && <Button size="sm" variant="ghost" onClick={() => { update((a) => a, { action: 'ontology.gap_requested', after: mapping.clientLabel }); toast(`"${mapping.clientLabel}" logged as an ontology gap.`); }}>Request a new Skill</Button>}</div>}
            </div>
          </Panel>
        )}
        <Panel title={intent.extracted ? 'What we found in your brief' : 'How this works'} padding="p-4" right={!readOnly && hasMaterial ? <Button size="sm" variant="ghost" onClick={async () => { setBusy('Reading your material'); const e = await analyze(); setBusy(''); if (!e) toast('The AI could not read the material just now. Try again.', 'error'); else { const filled = prefillFrom(e, 'your material'); toast(filled.length ? `Filled in ${filled.join(', ')}.` : 'Read again.', 'ok'); } }}>Read documents again</Button> : null}>
          {!intent.extracted && <ol className="muted list-decimal space-y-1.5 pl-4 text-xs"><li>Speak, upload or type what people face at work.</li><li>We propose 3 to 5 Skills from the Skills Ontology. You confirm.</li><li>We plan and write every scenario with its scoring questions and limits.</li><li>You review, preview as a participant, and publish.</li></ol>}
          {intent.extracted?.noUsableSituations && <p className="rounded-lg border border-[var(--warn)] bg-[var(--warn-soft)]/60 p-2 text-xs">No usable situations in this material{intent.extracted.summary ? ` (${intent.extracted.summary})` : ''}. Scenarios will be generated from the role and the Skills instead.</p>}
          {intent.extracted && !intent.extracted.noUsableSituations && <div className="space-y-2 text-xs"><div className="flex items-center gap-2 font-semibold uppercase tracking-wide text-[var(--ink-2)]">Situations <Badge>{intent.extracted.situations.length}</Badge></div><ul className="space-y-1.5">{intent.extracted.situations.slice(0, 5).map((s) => <li key={s.id} className="rounded-lg bg-slate-50 p-2">{s.text.length > 160 ? `${s.text.slice(0, 160)}…` : s.text}<div className="mt-0.5"><Source>From {s.source}</Source></div></li>)}</ul>{intent.extracted.terms?.length > 0 && <div className="flex flex-wrap gap-1">{intent.extracted.terms.slice(0, 8).map((t) => <span key={t} className="chip">{t}</span>)}</div>}<Source>Extracted by the AI from your material</Source></div>}
        </Panel>
      </aside>
      <Modal open={Boolean(swapFor)} title={`Swap ${getSkill(swapFor)?.name || ''} for`} onClose={() => setSwapFor(null)}>
        <ul className="max-h-80 space-y-1 overflow-auto">{SKILLS.filter((s) => !asm.skills.some((x) => x.id === s.id)).map((s) => <li key={s.id}><button onClick={() => swap(swapFor, s.id)} className="w-full rounded-lg border border-[var(--line)] p-2 text-left text-sm hover:bg-slate-50"><div className="font-medium">{s.name} <span className="faint text-xs">{s.domain}</span></div><div className="muted text-xs">{s.definition}</div></button></li>)}</ul>
      </Modal>
    </div>
  );
}
