import React, { useEffect, useMemo, useState } from 'react';
import { Button, Panel, Input, Badge, Confidence, Source, Modal } from '../components/ui.jsx';
import { RULES } from '../content/rules.js';
import { getSkill, SKILLS, SITUATION_TAGS } from '../content/ontology.js';
import { proposeSkills, mapClientSkill, searchSkills } from '../engine/mapping.js';
import { llmRankSkills } from '../engine/generator.js';

function intentText(asm) { const i = asm.intent; return [i.audience, i.situationsText, i.terminology, ...(i.extracted?.situations || []).map((s) => s.text), ...(i.extracted?.roles || []), ...(i.extracted?.terms || []), ...(i.documents || []).filter((d) => d.confirmed).map((d) => d.anonymizedText.slice(0, 8000))].filter(Boolean).join('\n'); }

export default function Step2Skills({ asm, update, go, readOnly, toast }) {
  const [busy, setBusy] = useState(false);
  const [alts, setAlts] = useState([]);
  const [query, setQuery] = useState('');
  const [clientName, setClientName] = useState('');
  const [mapping, setMapping] = useState(null);
  const [swapFor, setSwapFor] = useState(null);
  const [confirmedLow, setConfirmedLow] = useState({});
  const text = useMemo(() => intentText(asm), [asm.intent]);

  const propose = async () => {
    setBusy(true);
    const local = proposeSkills(text);
    let proposed = local.proposed.map((p) => ({ id: p.id, confidence: p.confidence, evidence: p.evidence, source: p.defaulted ? 'Default suggestion: no matching signal in your intent' : `Matched on: ${p.evidence.slice(0, 4).join(', ')}` }));
    const ranked = await llmRankSkills(text, local.ranked.slice(0, 10));
    if (ranked) proposed = ranked.map((r) => ({ id: r.id, confidence: r.confidence, evidence: r.evidence, source: `AI mapped from your intent: ${r.evidence[0] || ''}` }));
    setAlts(local.alternatives);
    update((a) => ({ ...a, skills: proposed, skillsConfirmed: false, blueprint: null, scenarios: [] }), { action: 'skills.proposed', after: proposed.map((p) => `${p.id}:${p.confidence}`) });
    setBusy(false);
  };
  useEffect(() => { if (!asm.skills.length && !readOnly) propose(); else setAlts(proposeSkills(text).alternatives); }, []); // eslint-disable-line

  const add = (id, extra = {}) => {
    if (asm.skills.some((s) => s.id === id)) return toast(`${getSkill(id).name} is already in the assessment.`);
    if (asm.skills.length >= RULES.skills.max) return toast(`An assessment holds at most ${RULES.skills.max} Skills so it stays short form. Remove one first.`, 'error');
    update((a) => ({ ...a, skills: [...a.skills, { id, confidence: 'High', evidence: [], source: 'Chosen by you', ...extra }], skillsConfirmed: false, blueprint: null, scenarios: [] }), { action: 'skill.added', after: { id, ...extra } });
  };
  const remove = (id) => update((a) => ({ ...a, skills: a.skills.filter((s) => s.id !== id), skillsConfirmed: false, blueprint: null, scenarios: [] }), { action: 'skill.removed', before: id });
  const swap = (fromId, toId) => { update((a) => ({ ...a, skills: a.skills.map((s) => (s.id === fromId ? { id: toId, confidence: 'High', evidence: [], source: `Swapped from ${getSkill(fromId).name}` } : s)), skillsConfirmed: false, blueprint: null, scenarios: [] }), { action: 'skill.swapped', before: fromId, after: toId }); setSwapFor(null); };

  const n = asm.skills.length;
  const lowUnconfirmed = asm.skills.filter((s) => s.confidence === 'Low' && !confirmedLow[s.id]);
  const blockReason = n < RULES.skills.min ? `Choose at least ${RULES.skills.min} Skills: fewer cannot separate strengths from gaps.` : n > RULES.skills.max ? `Choose at most ${RULES.skills.max} Skills so the assessment stays short form.` : lowUnconfirmed.length ? `Confirm the ${lowUnconfirmed.length} Low confidence mapping${lowUnconfirmed.length === 1 ? '' : 's'} before the blueprint is generated.` : '';
  const results = useMemo(() => searchSkills(query).filter((r) => !asm.skills.some((s) => s.id === r.id)).slice(0, 8), [query, asm.skills]);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h1 className="text-xl font-semibold">Confirm the Skills</h1><p className="muted mt-1 text-sm">The platform read your intent and proposed atomic Skills from the Skills Ontology. Accept, swap, search, or map your own Skill names. 3 to 5 Skills.</p></div>
          {!readOnly && <Button variant="secondary" onClick={propose} busy={busy}>Propose again</Button>}
        </div>
        {busy && <div className="card pulse p-6 text-sm">Reading your intent and matching it to the ontology.</div>}
        <ul className="space-y-3">
          {asm.skills.map((entry) => {
            const s = getSkill(entry.id);
            if (!s) return null;
            return (
              <li key={entry.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><h3 className="text-base font-semibold">{entry.clientLabel && entry.clientLabel !== s.name ? <>{entry.clientLabel} <span className="muted font-normal">mapped to {s.name}</span></> : s.name}</h3><Confidence level={entry.confidence} />{!s.hasProducts && <Badge tone="warn" title="This Skill has no products yet. Assessing it is allowed; the need is flagged to KNOLSKAPE.">Ontology gap</Badge>}<Badge>{s.domain} · {s.macro}</Badge></div>
                    <p className="muted mt-1 text-sm">{s.definition}</p>
                    <div className="mt-1"><Source>{entry.source}</Source></div>
                  </div>
                  {!readOnly && <div className="flex gap-1"><Button variant="ghost" size="sm" onClick={() => setSwapFor(entry.id)}>Swap</Button><Button variant="ghost" size="sm" onClick={() => remove(entry.id)}>Remove</Button></div>}
                </div>
                <details className="mt-2"><summary className="cursor-pointer text-xs font-medium text-[var(--brand)]">Behaviors this Skill is scored on</summary>
                  <div className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                    <div><div className="mb-1 font-semibold text-[var(--ok)]">Effective</div><ul className="space-y-1">{s.indicators.filter((i) => i.effective).map((i) => <li key={i.id} className="rounded bg-[var(--ok-soft)]/60 p-1.5">{i.text}</li>)}</ul></div>
                    <div><div className="mb-1 font-semibold text-[var(--block)]">Ineffective</div><ul className="space-y-1">{s.indicators.filter((i) => !i.effective).map((i) => <li key={i.id} className="rounded bg-[var(--block-soft)]/60 p-1.5">{i.text}</li>)}</ul></div>
                  </div>
                  <div className="muted mt-2 text-xs">Fits situations: {s.tags.map((t) => SITUATION_TAGS.find((x) => x.id === t)?.name).join(', ')}. Default response: {s.affinity === 'mcq' ? 'MCQ with one open response scenario' : s.voice ? 'Audio and Text' : 'Text and Audio'}.</div>
                </details>
                {entry.confidence === 'Low' && !readOnly && <label className="mt-3 flex items-center gap-2 rounded-lg border border-[var(--warn)] bg-[var(--warn-soft)]/50 p-2 text-sm"><input type="checkbox" checked={Boolean(confirmedLow[entry.id])} onChange={(e) => setConfirmedLow({ ...confirmedLow, [entry.id]: e.target.checked })} />The intent did not clearly point to this Skill. I confirm it is the one to measure.</label>}
              </li>
            );
          })}
        </ul>
        {n === 0 && !busy && <div className="card p-6 text-sm muted">No Skills yet. Search the ontology or map your own Skill names on the right.</div>}
        <div className="flex items-center justify-between gap-4">
          <p className={`text-sm ${blockReason ? 'text-[var(--block)]' : 'muted'}`}>{blockReason || `${n} Skills. Next: the platform plans scenarios, response types and time before writing anything.`}</p>
          <div className="flex gap-2"><Button variant="secondary" onClick={() => go(1)}>Back</Button><Button size="lg" disabled={Boolean(blockReason) || readOnly && !asm.skillsConfirmed} onClick={() => { update({ skillsConfirmed: true }, { action: 'skills.confirmed', after: asm.skills.map((s) => s.id) }); go(3); }}>Generate blueprint</Button></div>
        </div>
      </div>
      <aside className="space-y-4">
        {!readOnly && (
          <>
            <Panel title="Search the ontology" subtitle="Plain words work: delegation, customers, numbers, saying no.">
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Skills" aria-label="Search Skills" />
              <ul className="mt-2 space-y-1">{results.map((r) => <li key={r.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] p-2 text-sm"><div><div className="font-medium">{r.name}</div><div className="faint text-xs">{r.domain}</div></div><Button size="sm" variant="secondary" onClick={() => add(r.id)}>Add</Button></li>)}</ul>
            </Panel>
            <Panel title="Map your own Skill name" subtitle="Type a client Skill name. The platform maps it to the nearest ontology Skill and shows the mapping. Your label is kept for display.">
              <div className="flex gap-2"><Input value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Ownership mindset" aria-label="Client Skill name" /><Button variant="secondary" onClick={() => clientName.trim() && setMapping(mapClientSkill(clientName.trim()))}>Map</Button></div>
              {mapping && (
                <div className="mt-3 space-y-2 text-sm">
                  {mapping.gap && <p className="rounded-lg border border-[var(--warn)] bg-[var(--warn-soft)]/60 p-2 text-xs">No ontology Skill matches "{mapping.clientLabel}" above Low confidence. Pick the nearest below or request a new Skill; the request is logged as an ontology gap and the assessment proceeds on your chosen mapping.</p>}
                  {mapping.nearest.map((m, i) => <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border border-[var(--line)] p-2"><div><div className="font-medium">{m.name}{i === 0 && <span className="faint ml-1 text-xs">nearest</span>}</div><div className="mt-0.5"><Confidence level={m.confidence} /></div></div><Button size="sm" variant="secondary" onClick={() => { add(m.id, { clientLabel: mapping.clientLabel, confidence: m.confidence, source: `Your Skill "${mapping.clientLabel}" mapped to ${m.name}` }); setMapping(null); setClientName(''); }}>Use</Button></div>)}
                  {mapping.gap && <Button size="sm" variant="ghost" onClick={() => { update((a) => a, { action: 'ontology.gap_requested', after: mapping.clientLabel }); toast(`"${mapping.clientLabel}" logged as an ontology gap for KNOLSKAPE.`); }}>Request a new Skill</Button>}
                </div>
              )}
            </Panel>
            {alts.length > 0 && <Panel title="Also suggested" subtitle="Other Skills your intent touched on."><ul className="space-y-1">{alts.filter((a) => !asm.skills.some((s) => s.id === a.id)).slice(0, 5).map((a) => <li key={a.id} className="flex items-center justify-between gap-2 text-sm"><span>{getSkill(a.id)?.name} <Confidence level={a.confidence} /></span><Button size="sm" variant="ghost" onClick={() => add(a.id)}>Add</Button></li>)}</ul></Panel>}
          </>
        )}
      </aside>
      <Modal open={Boolean(swapFor)} title={`Swap ${getSkill(swapFor)?.name || ''} for`} onClose={() => setSwapFor(null)}>
        <ul className="max-h-80 space-y-1 overflow-auto">{SKILLS.filter((s) => !asm.skills.some((x) => x.id === s.id)).map((s) => <li key={s.id}><button onClick={() => swap(swapFor, s.id)} className="w-full rounded-lg border border-[var(--line)] p-2 text-left text-sm hover:bg-slate-50"><div className="font-medium">{s.name} <span className="faint text-xs">{s.domain}</span></div><div className="muted text-xs">{s.definition}</div></button></li>)}</ul>
      </Modal>
    </div>
  );
}
