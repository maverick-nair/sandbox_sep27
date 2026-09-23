import React, { useMemo, useState } from 'react';
import { Button, Panel, Badge, Textarea, Select } from '../components/ui.jsx';
import { RULES, LEVEL_LABELS } from '../content/rules.js';
import { getSkill } from '../content/ontology.js';
import { useWorkspace } from '../engine/WorkspaceContext.jsx';
import { emptyCalibration, computeAgreement, calibrationStatus, practiceResponses, parseResponses } from '../engine/calibration.js';
import { scorePreviewResponse } from '../engine/generator.js';
import { detectPII, anonymize } from '../engine/pii.js';

// Calibration (PRD 13.3, FR-A13): for each open response scenario, 30 responses are scored by two
// calibrators and by the AI. Agreement is computed per scoring question and AI scoring activates only when
// both thresholds hold. Responses arrive from delivery in the platform; here they can also be pasted.
export default function Calibration({ asm, update, toast }) {
  const { role, ws } = useWorkspace();
  const canRate = role === 'calibrator' || role === 'admin';
  const open = (asm.scenarios || []).filter((s) => s.responseType !== 'MCQ');
  const [selId, setSelId] = useState(open[0]?.id);
  const sc = open.find((s) => s.id === selId) || open[0];
  const cal = asm.calibration?.[sc?.id] || emptyCalibration();
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState('');
  const agreement = useMemo(() => (sc ? computeAgreement(sc, cal) : null), [sc, cal]);

  if (!sc) return <div className="card p-6 text-sm muted">This assessment has no Audio or Text scenarios, so there is nothing to calibrate. MCQ is scored from the key.</div>;
  const setCal = (mut, action, meta = {}) => update((a) => ({ ...a, calibration: { ...(a.calibration || {}), [sc.id]: typeof mut === 'function' ? mut(a.calibration?.[sc.id] || emptyCalibration()) : mut } }), { action, allowPublished: true, undoable: false, ...meta });

  const addResponses = (list) => { if (!list.length) return toast('No responses found. One response per paragraph, at least 20 characters.', 'error'); setCal((c) => ({ ...c, status: c.status === 'pending' ? 'in_progress' : c.status, responses: [...c.responses, ...list.map((r) => { const f = detectPII(r.text, { allowNames: sc.allowedTerms || [] }); return { ...r, text: f.length ? anonymize(r.text, f).text : r.text, redactions: f.length }; })] }), 'calibration.responses_added', { after: list.length }); };
  const scoreAi = async () => {
    setBusy('AI scoring');
    let responses = cal.responses;
    for (let i = 0; i < responses.length; i++) {
      if (sc.scoringQuestions.every((q) => Number.isFinite(responses[i].ai?.[q.id]))) continue;
      const scored = await scorePreviewResponse(sc, responses[i].text);
      if (!scored.ok) { toast(scored.note, 'error'); break; }
      const ai = {}; scored.results.forEach((r) => { ai[r.questionId] = r.level; });
      responses = responses.map((r, j) => (j === i ? { ...r, ai } : r));
      setBusy(`AI scoring ${i + 1} of ${responses.length}`);
    }
    setCal((c) => ({ ...c, responses }), 'calibration.ai_scored', { after: responses.length });
    setBusy('');
  };
  const rate = (rid, who, qid, level) => setCal((c) => ({ ...c, status: 'in_progress', responses: c.responses.map((r) => (r.id === rid ? { ...r, ratings: { ...r.ratings, [who]: { ...(r.ratings?.[who] || {}), [qid]: (level === '' ? undefined : Number(level)) } } } : r)) }), 'calibration.level_entered', { after: { rid, who, qid, level } });
  const activate = () => {
    setCal((c) => ({ ...c, status: 'complete', agreement, activatedAt: Date.now(), activatedBy: ws.author }), 'calibration.activated', { after: { scenario: sc.id, agreement: agreement.perQuestion.map((p) => [p.aiHuman, p.humanHuman]) } });
    update((a) => ({ ...a, scenarios: a.scenarios.map((s) => (s.id === sc.id ? { ...s, calibration: 'complete' } : s)), versions: (a.versions || []).map((v) => ({ ...v, scenarios: v.scenarios.map((s) => (s.id === sc.id ? { ...s, calibration: 'complete' } : s)) })) }), { action: 'scenario.ai_scoring_activated', after: sc.id, allowPublished: true, undoable: false });
    toast(`AI scoring activated for "${sc.title}".`, 'ok');
  };
  const pause = () => { setCal((c) => ({ ...c, status: 'paused', pausedReason: 'Paused by calibrator' }), 'calibration.paused'); update((a) => ({ ...a, scenarios: a.scenarios.map((s) => (s.id === sc.id ? { ...s, calibration: 'pending' } : s)) }), { action: 'scenario.ai_scoring_paused', allowPublished: true, undoable: false }); };
  const status = calibrationStatus(sc, cal);
  const tone = { complete: 'ok', in_progress: 'warn', paused: 'block', pending: 'neutral' }[status];

  return (
    <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
      <aside aria-label="Open response scenarios" className="space-y-2">
        <div className="card p-3 text-sm"><div className="font-semibold">Open response scenarios</div><p className="faint mt-0.5 text-xs">Each needs {RULES.calibration.responses} responses scored by two calibrators and the AI. Activation: AI to human agreement {RULES.calibration.aiHumanIcc} or above per question, human to human {RULES.calibration.humanHumanIcc} or above.</p></div>
        <ol className="space-y-1">{open.map((s) => { const c = asm.calibration?.[s.id]; const st = calibrationStatus(s, c); return <li key={s.id}><button onClick={() => setSelId(s.id)} aria-current={s.id === sc.id} className={`w-full rounded-lg border p-2 text-left text-xs ${s.id === sc.id ? 'border-[var(--brand)] bg-[var(--brand-soft)]' : 'border-[var(--line)] bg-white hover:bg-slate-50'}`}><div className="flex items-center justify-between gap-1"><span className="font-medium">{s.title}</span><Badge tone={{ complete: 'ok', in_progress: 'warn', paused: 'block', pending: 'neutral' }[st]}>{st.replace('_', ' ')}</Badge></div><div className="faint mt-0.5">{getSkill(s.skillId)?.name} · {s.responseType} · {c?.responses.length || 0}/{RULES.calibration.responses} responses</div></button></li>; })}</ol>
        {!canRate && <div className="rounded-lg border border-[var(--warn)] bg-[var(--warn-soft)]/60 p-2 text-xs">Your role is {role}. Entering levels and activating AI scoring needs the Calibrator role (Settings). KNOLSKAPE's assessment team calibrates in MVP.</div>}
      </aside>
      <div className="space-y-4">
        <div className="card p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div><div className="flex items-center gap-2"><h2 className="text-base font-semibold">{sc.title}</h2><Badge tone={tone}>{status.replace('_', ' ')}</Badge></div><p className="muted text-xs">{getSkill(sc.skillId)?.name} · {sc.scoringQuestions.length} scoring questions · {cal.responses.length} of {RULES.calibration.responses} responses{cal.activatedAt ? ` · activated ${new Date(cal.activatedAt).toLocaleDateString()} by ${cal.activatedBy}` : ''}</p></div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="secondary" onClick={scoreAi} busy={Boolean(busy)} disabled={!cal.responses.length}>Score with AI</Button>
              {status === 'complete' ? <Button size="sm" variant="danger" onClick={pause} disabled={!canRate}>Pause AI scoring</Button> : <Button size="sm" variant="success" onClick={activate} disabled={!canRate || !agreement.canActivate}>Activate AI scoring</Button>}
            </div>
          </div>
          {busy && <p className="pulse mt-2 text-xs">{busy}</p>}
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {agreement.perQuestion.map((p, i) => <div key={p.questionId} className="rounded-lg border border-[var(--line)] p-2 text-xs"><div className="truncate font-medium" title={p.text}>Q{i + 1}. {p.text}</div><div className="mt-1 flex justify-between"><span className="faint">Humans</span><span className={p.humanHuman == null ? 'faint' : p.humanHuman >= RULES.calibration.humanHumanIcc ? 'text-[var(--ok)]' : 'text-[var(--block)]'}>{p.humanHuman ?? '–'}</span></div><div className="flex justify-between"><span className="faint">AI vs humans</span><span className={p.aiHuman == null ? 'faint' : p.aiHuman >= RULES.calibration.aiHumanIcc ? 'text-[var(--ok)]' : 'text-[var(--block)]'}>{p.aiHuman ?? '–'}</span></div><div className="faint">{p.rated} rated</div></div>)}
          </div>
          {agreement.blockers.length > 0 && status !== 'complete' && <ul className="mt-3 space-y-1 text-xs">{agreement.blockers.map((b, i) => <li key={i} className="flex gap-2"><span className="text-[var(--warn)]">•</span>{b}</li>)}</ul>}
          {agreement.canActivate && status !== 'complete' && <p className="mt-3 text-sm text-[var(--ok)]">Both thresholds hold on every question. AI scoring can be activated.</p>}
        </div>
        <Panel title="Responses" subtitle="From delivery, the first 30 participant responses arrive here anonymized. Until then, paste responses (one per paragraph) or load a practice set to rehearse the workflow." padding="p-4" right={<div className="flex gap-1.5"><Button size="sm" variant="secondary" onClick={() => addResponses(practiceResponses(sc))} disabled={cal.responses.length >= 60}>Load 30 practice responses</Button></div>}>
          <div className="flex flex-col gap-2 sm:flex-row"><Textarea value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Paste responses here, one per paragraph. Personal data is anonymized on import." className="min-h-[70px] flex-1" /><Button variant="secondary" onClick={() => { addResponses(parseResponses(paste)); setPaste(''); }} disabled={!paste.trim()}>Add</Button></div>
          {cal.responses.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="border-b border-[var(--line)] text-left"><th className="px-2 py-1.5">Response</th>{sc.scoringQuestions.map((q, i) => <th key={q.id} className="px-2 py-1.5" title={q.text}>Q{i + 1}<div className="faint font-normal">A · B · AI</div></th>)}<th className="px-2 py-1.5"><span className="sr-only">Remove</span></th></tr></thead>
                <tbody>{cal.responses.map((r, ri) => <tr key={r.id} className="border-t border-[var(--line)] align-top"><td className="max-w-md px-2 py-1.5"><details><summary className="cursor-pointer">{ri + 1}. {r.text.slice(0, 90)}{r.text.length > 90 ? '…' : ''}{r.practice && <Badge className="ml-1">practice</Badge>}{r.redactions > 0 && <Badge tone="brand" className="ml-1">{r.redactions} anonymized</Badge>}</summary><p className="muted mt-1 whitespace-pre-wrap">{r.text}</p></details></td>
                  {sc.scoringQuestions.map((q) => <td key={q.id} className="whitespace-nowrap px-2 py-1"><div className="flex items-center gap-1">{['A', 'B'].map((who) => <Select key={who} value={r.ratings?.[who]?.[q.id] ?? ''} onChange={(e) => rate(r.id, who, q.id, e.target.value)} disabled={!canRate || status === 'complete'} className="w-12 px-1 py-0.5 text-xs" aria-label={`Calibrator ${who} level`}><option value="">–</option>{[0, 1, 2, 3].map((l) => <option key={l} value={l}>{l}</option>)}</Select>)}<span className={`inline-flex h-6 w-7 items-center justify-center rounded ${Number.isFinite(r.ai?.[q.id]) ? 'bg-[var(--brand-soft)] text-[var(--brand)]' : 'bg-slate-100 faint'}`} title="AI level">{Number.isFinite(r.ai?.[q.id]) ? r.ai[q.id] : '–'}</span></div></td>)}
                  <td className="px-2 py-1.5">{canRate && status !== 'complete' && <button className="faint hover:text-[var(--block)]" onClick={() => setCal((c) => ({ ...c, responses: c.responses.filter((x) => x.id !== r.id) }), 'calibration.response_removed')} aria-label="Remove response">×</button>}</td></tr>)}</tbody>
              </table>
              <p className="faint mt-2 text-xs">Levels: 0 {LEVEL_LABELS.L0}, 1 {LEVEL_LABELS.L1}, 2 {LEVEL_LABELS.L2}, 3 {LEVEL_LABELS.L3}. Anchors are on the scenario's review screen. In delivery, agreement is refreshed monthly with a 2 percent human sample and AI scoring pauses under 0.70.</p>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
