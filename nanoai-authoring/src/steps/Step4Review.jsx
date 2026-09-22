import React, { useEffect, useMemo, useState } from 'react';
import { Button, Panel, Badge, Select, InlineText, Source, Modal, Textarea, Severity, Input } from '../components/ui.jsx';
import { MediaView, MediaEditor } from '../components/Media.jsx';
import { RULES, LEVEL_LABELS, RESPONSE_TYPES } from '../content/rules.js';
import { getSkill, SITUATION_TAGS, indicatorById } from '../content/ontology.js';
import { issuesForScenario, scenarioLabel } from '../engine/qualityGate.js';
import { reanalyze, regenerate, switchResponseType, rekeyOption, splitSentences, mediaSummary } from '../engine/generator.js';
import { estimateScenarioMinutes, modelAnswerInCapUnits, formatSeconds } from '../engine/duration.js';
import { wordCount, readingGrade, uid } from '../engine/text.js';
import { llmAvailable } from '../engine/llm.js';

export default function Step4Review({ asm, update, go, gate, readOnly, focusScenarioId, setFocusScenarioId, toast }) {
  const scenarios = asm.scenarios || [];
  const [selId, setSelId] = useState(focusScenarioId || scenarios[0]?.id);
  useEffect(() => { if (focusScenarioId) { setSelId(focusScenarioId); setFocusScenarioId(null); } }, [focusScenarioId]); // eslint-disable-line
  useEffect(() => { if (!scenarios.some((s) => s.id === selId)) setSelId(scenarios[0]?.id); }, [scenarios, selId]);
  const sc = scenarios.find((s) => s.id === selId);
  const index = scenarios.findIndex((s) => s.id === selId);
  const [busy, setBusy] = useState('');
  const [regen, setRegen] = useState(null); // { scope, targetId, optionId, sentenceIndex, label }
  const [instruction, setInstruction] = useState('');
  const [mediaOpen, setMediaOpen] = useState(false);

  const setScenario = (mut, action, meta = {}) => update((a) => ({ ...a, scenarios: a.scenarios.map((s) => (s.id === sc.id ? (typeof mut === 'function' ? mut(s) : { ...s, ...mut }) : s)) }), { action, ...meta });
  const replaceScenario = (next, action, meta = {}) => update((a) => ({ ...a, scenarios: a.scenarios.map((s) => (s.id === next.id ? next : s)) }), { action, ...meta });

  if (!sc) return <div className="card p-8 text-sm">No scenarios yet. <Button variant="ghost" onClick={() => go(3)}>Adjust the plan</Button></div>;
  const skill = getSkill(sc.skillId);
  const issues = [...issuesForScenario(gate, sc.id), ...gate.issues.filter((i) => !i.scenarioId && i.skillId === sc.skillId)];
  const hardIssues = issues.filter((i) => i.severity === 'hard' && i.rule !== 'approval');
  const approvedCount = scenarios.filter((s) => s.approved).length;

  // Situation or media edits re-run the contextual analysis (FR-A7) and reset approval.
  const editSituation = async (field, value) => {
    const before = sc[field];
    if (value === before) return;
    setBusy('Re-running contextual analysis');
    const edited = { ...sc, [field]: value, approved: false };
    const next = await reanalyze(edited, asm);
    replaceScenario(next, `scenario.${field}_edited`, { before, after: value });
    setBusy('');
  };
  const editMedia = async (media) => {
    setBusy('Reading the media and re-running the analysis');
    const next = await reanalyze({ ...sc, media, approved: false }, asm);
    replaceScenario(next, media ? 'scenario.media_set' : 'scenario.media_removed', { before: sc.media?.type, after: media?.type });
    setBusy(''); setMediaOpen(false);
  };
  const confirmPending = () => setScenario({ pendingConfirmation: null }, 'scenario.changes_confirmed');
  const revertPending = () => { const b = sc.pendingConfirmation.before; setScenario({ scoringQuestions: b.scoringQuestions, mcq: b.mcq, cap: b.cap, recommendedMinutes: b.recommendedMinutes, pendingConfirmation: null, analysis: { ...sc.analysis, modelAnswer: b.modelAnswer ?? sc.analysis.modelAnswer } }, 'scenario.changes_reverted'); };

  const switchType = async (type) => { setBusy(`Switching to ${type} and rebuilding the scoring instrument`); const next = await switchResponseType(sc, asm, type); replaceScenario(next, 'scenario.response_type', { before: sc.responseType, after: type }); setBusy(''); };
  const setMinutes = (m) => setScenario({ recommendedMinutes: Math.max(RULES.time.scenarioMin, Math.min(RULES.time.scenarioMax, Number(m))), approved: false }, 'scenario.time', { before: sc.recommendedMinutes, after: m });
  const setCap = (cap) => setScenario({ cap, approved: false }, 'scenario.cap', { before: sc.cap, after: cap });

  const editQuestion = (qid, patch, action) => setScenario((s) => ({ ...s, approved: false, scoringQuestions: s.scoringQuestions.map((q) => (q.id === qid ? { ...q, ...patch } : q)) }), action, { after: patch });
  const editAnchor = (qid, level, value) => { const q = sc.scoringQuestions.find((x) => x.id === qid); const anchors = { ...q.anchors, [level]: value }; const norm = Object.values(anchors).map((a) => a.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()); const dup = new Set(norm).size < 4; editQuestion(qid, { anchors, rekeyed: { at: Date.now(), level, distinct: !dup } }, 'scoring_question.anchor_edited'); if (dup) toast('Two levels now read the same. Approval is blocked until each level describes different content.', 'error'); else toast(`Re-keyed: ${LEVEL_LABELS[level]} anchor updated, all four levels distinct.`); };
  const addQuestion = () => { if (sc.scoringQuestions.length >= RULES.scoringQuestions.max) return toast('Audio and Text scenarios have at most 5 scoring questions.', 'error'); const used = new Set(sc.scoringQuestions.map((q) => q.indicatorId)); const ind = skill.indicators.find((i) => i.effective && !used.has(i.id)) || skill.indicators[0]; setScenario((s) => ({ ...s, approved: false, scoringQuestions: [...s.scoringQuestions, { id: uid('sq'), text: `Did the response ${ind.text.charAt(0).toLowerCase()}${ind.text.slice(1)}?`, indicatorId: ind.id, anchors: { L0: `The answer does not ${ind.text.charAt(0).toLowerCase()}${ind.text.slice(1)}.`, L1: 'The answer gestures at this in general terms without using the specifics of the situation.', L2: 'The answer does this clearly with reference to at least one specific fact from the situation or media.', L3: 'The answer does this fully, ties it to the specific facts and makes the consequence for the people involved explicit.' }, traceTo: [], source: 'Added by you from a Skill indicator; link it to the analysis' }] }), 'scoring_question.added'); };
  const removeQuestion = (qid) => setScenario((s) => ({ ...s, approved: false, scoringQuestions: s.scoringQuestions.filter((q) => q.id !== qid) }), 'scoring_question.removed', { before: qid });

  const editOption = async (qid, oid, patch, rekey) => {
    setScenario((s) => ({ ...s, approved: false, mcq: s.mcq.map((q) => (q.id === qid ? { ...q, options: q.options.map((o) => (o.id === oid ? { ...o, ...patch } : o)) } : q)) }), 'mcq.option_edited', { after: patch });
    if (rekey) { setBusy('Re-keying the option'); const next = await rekeyOption({ ...sc, mcq: sc.mcq.map((q) => (q.id === qid ? { ...q, options: q.options.map((o) => (o.id === oid ? { ...o, ...patch } : o)) } : q)) }, qid, oid); replaceScenario(next, 'mcq.option_rekeyed'); const o = next.mcq.find((q) => q.id === qid).options.find((x) => x.id === oid); toast(o.rekeyed && o.rekeyed.before !== o.rekeyed.after ? `Re-keyed: value ${o.rekeyed.before} to ${o.rekeyed.after} (${o.level}).` : `Re-keyed: value ${o.key} unchanged (${o.level}).`); setBusy(''); }
  };
  const setKey = (qid, oid, key) => setScenario((s) => ({ ...s, approved: false, mcq: s.mcq.map((q) => (q.id === qid ? { ...q, options: q.options.map((o) => (o.id === oid ? { ...o, key: Number(key), level: { 5: 'L3', 4: 'L2', 3: 'L1', 2: 'L1', 1: 'L0' }[Number(key)] } : o)) } : q)) }), 'mcq.key_changed', { after: { oid, key } });
  const addMcqQuestion = () => { if (sc.mcq.length >= RULES.mcq.questionsMax) return toast('MCQ scenarios have at most 3 questions.', 'error'); setRegen({ scope: 'mcqQuestion', targetId: 'new', label: 'a new MCQ question' }); };
  const removeMcqQuestion = (qid) => { if (sc.mcq.length <= 1) return toast('An MCQ scenario needs at least one question.', 'error'); setScenario((s) => ({ ...s, approved: false, mcq: s.mcq.filter((q) => q.id !== qid) }), 'mcq.question_removed', { before: qid }); };
  const addOption = (qid) => setScenario((s) => ({ ...s, approved: false, mcq: s.mcq.map((q) => (q.id === qid && q.options.length < 4 ? { ...q, options: [...q.options, { id: uid('opt'), text: '', level: 'L1', key: 3, rationale: '', indicatorId: skill.indicators[0].id }] } : q)) }), 'mcq.option_added');
  const removeOption = (qid, oid) => setScenario((s) => ({ ...s, approved: false, mcq: s.mcq.map((q) => (q.id === qid ? { ...q, options: q.options.filter((o) => o.id !== oid) } : q)) }), 'mcq.option_removed', { before: oid });

  const runRegen = async () => {
    setBusy(`Regenerating ${regen.label}`);
    let target = sc;
    let scope = regen.scope;
    if (regen.targetId === 'new') { const seedQ = sc.mcq[0]; const q = { ...JSON.parse(JSON.stringify(seedQ)), id: uid('mq'), options: seedQ.options.map((o) => ({ ...o, id: uid('opt') })) }; target = { ...sc, mcq: [...sc.mcq, q] }; regen.targetId = q.id; }
    const res = await regenerate(target, asm, { scope, targetId: regen.targetId, optionId: regen.optionId, instruction, sentenceIndex: regen.sentenceIndex });
    if (res.ok) { replaceScenario({ ...res.scenario, approved: false }, `regenerate.${scope}`, { after: instruction }); toast(res.note || `${regen.label} regenerated${res.mode === 'scripted' ? ' from the library' : ''}.`, 'ok'); } else toast(res.note || 'Nothing changed.', 'error');
    setBusy(''); setRegen(null); setInstruction('');
  };

  const approve = () => { if (hardIssues.length) return toast(`Fix ${hardIssues.length} item${hardIssues.length === 1 ? '' : 's'} before approving: ${hardIssues[0].message}`, 'error'); setScenario({ approved: true }, 'scenario.approved'); toast(`${scenarioLabel(sc, index)} approved.`, 'ok'); if (index < scenarios.length - 1) setSelId(scenarios[index + 1].id); };
  const capUnits = modelAnswerInCapUnits(sc.responseType, sc.analysis?.modelAnswer || '');
  const grade = readingGrade(sc.situation);
  const sentences = useMemo(() => splitSentences(sc.situation), [sc.situation]);

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-3">
        <div className="card p-3"><div className="flex items-center justify-between text-sm"><span className="font-semibold">Scenarios</span><Badge tone={approvedCount === scenarios.length ? 'ok' : 'neutral'}>{approvedCount}/{scenarios.length} approved</Badge></div><p className="faint mt-1 text-xs">One per screen. Approve each to publish. Time: {gate.totalMinutes} min total.</p></div>
        <ol className="space-y-1">
          {scenarios.map((s, i) => { const iss = issuesForScenario(gate, s.id); const h = iss.filter((x) => x.severity === 'hard' && x.rule !== 'approval').length; return <li key={s.id}><button onClick={() => setSelId(s.id)} aria-current={s.id === selId} className={`w-full rounded-lg border p-2 text-left text-xs transition-colors ${s.id === selId ? 'border-[var(--brand)] bg-[var(--brand-soft)]' : 'border-[var(--line)] bg-white hover:bg-slate-50'}`}><div className="flex items-center justify-between gap-1"><span className="font-medium">{i + 1}. {s.title}</span>{s.approved ? <Badge tone="ok">✓</Badge> : h ? <Badge tone="block">{h}</Badge> : s.pendingConfirmation ? <Badge tone="warn">confirm</Badge> : <Badge>review</Badge>}</div><div className="muted mt-0.5 flex flex-wrap gap-1">{asm.skills.find((k) => k.id === s.skillId)?.clientLabel || getSkill(s.skillId)?.name} · {s.responseType} · {s.recommendedMinutes} min{s.flaggedForReview && <span className="text-[var(--warn)]">· flagged</span>}</div></button></li>; })}
        </ol>

      </aside>

      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2"><Badge tone="brand">{asm.skills.find((k) => k.id === sc.skillId)?.clientLabel || skill.name}</Badge><Badge>{SITUATION_TAGS.find((t) => t.id === sc.tag)?.name}</Badge><Badge>{sc.difficulty} difficulty</Badge>{sc.approved ? <Badge tone="ok">Approved</Badge> : <Badge>Not yet approved</Badge>}{sc.flaggedForReview && <Badge tone="warn">Flagged for KNOLSKAPE review</Badge>}<Badge title="Every generated element shows its source">{sc.generatedBy === 'llm' ? 'AI drafted' : 'Library drafted'}</Badge></div>
            <h1 className="mt-1 text-xl font-semibold"><InlineText readOnly={readOnly} value={sc.title} onCommit={(v) => setScenario({ title: v }, 'scenario.title', { after: v })} ariaLabel="scenario title" /></h1>
            <Source>{sc.source?.text}</Source>
          </div>
          {!readOnly && <div className="flex flex-wrap gap-1.5"><Button variant="secondary" size="sm" onClick={() => setRegen({ scope: 'scenario', label: 'the whole scenario' })}>Regenerate scenario</Button><Button variant="secondary" size="sm" onClick={() => setScenario({ flaggedForReview: !sc.flaggedForReview }, 'scenario.flag', { after: !sc.flaggedForReview })}>{sc.flaggedForReview ? 'Unflag' : 'Flag for KNOLSKAPE review'}</Button>{sc.approved ? <Button variant="secondary" size="sm" onClick={() => setScenario({ approved: false }, 'scenario.unapproved')}>Unapprove</Button> : <Button variant="success" size="sm" onClick={approve} disabled={Boolean(busy)}>Mark approved</Button>}</div>}
        </div>
        {busy && <div className="card pulse p-3 text-sm">{busy}</div>}
        {sc.pendingConfirmation && (
          <Panel tone="warn" title={sc.pendingConfirmation.mode === 'scripted' ? 'The situation changed: facts re-read, scoring questions kept' : 'The situation or media changed, so the analysis re-ran'} subtitle={sc.pendingConfirmation.mode === 'scripted' ? 'Scripted mode read the key facts, constraints and stakeholders from your new text. The scoring questions were kept and re-traced; check they still fit, or connect AI for a full re-derivation.' : 'Confirm the changed scoring questions or revert to the previous set.'} padding="p-4">
            <ul className="space-y-1 text-sm">{sc.pendingConfirmation.changed.map((c) => <li key={c.id} className="flex gap-2"><Badge tone={c.status === 'unchanged' || c.status === 'kept' ? 'neutral' : c.status === 'removed' ? 'block' : 'warn'}>{c.status}</Badge><span>{c.text}{c.status === 'changed' && c.previous && <span className="faint block text-xs">was: {c.previous}</span>}</span></li>)}</ul>
            {sc.pendingConfirmation.before.cap && JSON.stringify(sc.pendingConfirmation.before.cap) !== JSON.stringify(sc.cap) && <p className="muted mt-2 text-xs">Recommended limit changed from {capText(sc.responseType, sc.pendingConfirmation.before.cap)} to {capText(sc.responseType, sc.cap)}.</p>}
            <div className="mt-3 flex gap-2"><Button size="sm" onClick={confirmPending}>Confirm changes</Button><Button size="sm" variant="secondary" onClick={revertPending}>Keep previous questions</Button></div>
          </Panel>
        )}
        {issues.length > 0 && (
          <div className="flex flex-wrap gap-2">{issues.filter((i) => i.rule !== 'approval').map((i) => <div key={i.id} className={`flex items-start gap-2 rounded-lg border px-3 py-1.5 text-xs ${i.severity === 'hard' ? 'border-[var(--block)]/40 bg-[var(--block-soft)]/50' : 'border-[var(--warn)]/40 bg-[var(--warn-soft)]/50'}`}><Severity severity={i.severity} /><span><span className="font-medium">{i.message}</span> <span className="muted">{i.fix}</span></span></div>)}</div>
        )}

        <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
          <div className="space-y-4">
            <Panel title="What the participant sees" subtitle="Edit any text inline. Editing the situation re-runs the contextual analysis." padding="p-5">
              <div className="space-y-3">
                <div><div className="faint mb-1 text-[11px] uppercase tracking-wider">Context header <span className="normal-case">({wordCount(sc.contextHeader)} of 30 words)</span></div><InlineText readOnly={readOnly} value={sc.contextHeader} onCommit={(v) => editSituation('contextHeader', v)} multiline className="text-sm font-medium" ariaLabel="context header" /></div>
                <div><div className="faint mb-1 flex items-center justify-between text-[11px] uppercase tracking-wider"><span>Situation <span className="normal-case">({wordCount(sc.situation)} words, grade {grade} reading level)</span></span>{!readOnly && <button className="normal-case text-[var(--brand)]" onClick={() => setRegen({ scope: 'sentence', sentenceIndex: 0, label: 'one sentence' })}>Regenerate one sentence</button>}</div><InlineText readOnly={readOnly} value={sc.situation} onCommit={(v) => editSituation('situation', v)} multiline className="text-[15px] leading-relaxed" ariaLabel="situation" /></div>
                {sc.media && <div><div className="faint mb-1 text-[11px] uppercase tracking-wider">Media <span className="normal-case">· {sc.media.source}</span></div><MediaView media={sc.media} compact /></div>}
                <div><div className="faint mb-1 text-[11px] uppercase tracking-wider">Prompt</div><InlineText readOnly={readOnly} value={sc.prompt} onCommit={(v) => setScenario({ prompt: v, approved: false }, 'scenario.prompt', { after: v })} className="text-sm font-medium" ariaLabel="prompt" /></div>
                {!readOnly && <div className="flex flex-wrap gap-2 pt-1"><Button variant="secondary" size="sm" onClick={() => setMediaOpen(true)}>{sc.media ? 'Replace or remove media' : 'Add chart, table, image or extract'}</Button></div>}
              </div>
            </Panel>

            <Panel title="Contextual analysis" subtitle="What the AI read in the situation and the media. Scoring questions are derived from this." padding="p-5">
              <div className="grid gap-4 text-sm sm:grid-cols-2">
                <AnalysisList label="Key facts" items={sc.analysis?.keyFacts} onChange={(items) => setScenario((s) => ({ ...s, analysis: { ...s.analysis, keyFacts: items } }), 'analysis.facts_edited')} readOnly={readOnly} />
                <AnalysisList label="Constraints" items={sc.analysis?.constraints} onChange={(items) => setScenario((s) => ({ ...s, analysis: { ...s.analysis, constraints: items } }), 'analysis.constraints_edited')} readOnly={readOnly} />
                <AnalysisList label="Stakeholders" items={sc.analysis?.stakeholders} onChange={(items) => setScenario((s) => ({ ...s, analysis: { ...s.analysis, stakeholders: items } }), 'analysis.stakeholders_edited')} readOnly={readOnly} />
                {sc.media && <AnalysisList label="What the media shows" items={sc.analysis?.mediaShows?.length ? sc.analysis.mediaShows : mediaSummary(sc.media)} readOnly />}
                <div className="sm:col-span-2"><div className="faint mb-1 text-[11px] uppercase tracking-wider">An appropriate response must address</div><ol className="list-decimal space-y-1 pl-5">{(sc.analysis?.idealMustAddress || []).map((e, i) => <li key={i}>{e.text || e} {e.indicatorId && <span className="faint text-xs">({e.indicatorId})</span>}</li>)}</ol></div>
                {sc.responseType !== 'MCQ' && <div className="sm:col-span-2"><div className="faint mb-1 text-[11px] uppercase tracking-wider">Model answer <span className="normal-case">({wordCount(sc.analysis?.modelAnswer || '')} words · sizes the response limit)</span></div><InlineText readOnly={readOnly} value={sc.analysis?.modelAnswer} onCommit={(v) => setScenario((s) => ({ ...s, approved: false, analysis: { ...s.analysis, modelAnswer: v } }), 'analysis.model_answer_edited')} multiline className="text-sm" ariaLabel="model answer" /></div>}
                <div className="sm:col-span-2"><div className="faint mb-1 text-[11px] uppercase tracking-wider">Typical weak answers</div><ul className="list-disc space-y-1 pl-5 muted">{(sc.analysis?.weakPatterns || []).map((w, i) => <li key={i}>{w}</li>)}</ul></div>
              </div>
              <div className="mt-3 flex flex-wrap gap-3">{(sc.analysis?.sources || []).map((s, i) => <Source key={i}>{s.text}</Source>)}</div>
            </Panel>

            {sc.responseType !== 'MCQ' ? (
              <Panel title={`Scoring questions (${sc.scoringQuestions.length})`} subtitle="Each audio or text answer is assessed against these, one observation per question. Each is tied to a behavior of the Skill with plain language anchors." right={!readOnly && <Button size="sm" variant="ghost" onClick={addQuestion}>Add question</Button>} padding="p-0">
                <ol className="divide-y divide-[var(--line)]">
                  {sc.scoringQuestions.map((q, qi) => { const ind = indicatorById(q.indicatorId); return (
                    <li key={q.id} className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1"><div className="flex items-baseline gap-2"><span className="faint text-xs">{qi + 1}.</span><InlineText readOnly={readOnly} value={q.text} onCommit={(v) => editQuestion(q.id, { text: v }, 'scoring_question.text_edited')} className="text-sm font-medium" ariaLabel={`scoring question ${qi + 1}`} /></div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs"><span className="faint">Behavior:</span><Select disabled={readOnly} value={q.indicatorId || ''} onChange={(e) => editQuestion(q.id, { indicatorId: e.target.value }, 'scoring_question.indicator')} className="w-auto max-w-md py-0.5 text-xs" aria-label="Behavioral indicator"><option value="">Choose the behavior this observes</option>{skill.indicators.filter((i) => i.effective).map((i) => <option key={i.id} value={i.id}>{i.text}</option>)}</Select>{ind && ind.skillId !== sc.skillId && <Badge tone="block">Different Skill</Badge>}</div>
                        </div>
                        {!readOnly && <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setRegen({ scope: 'question', targetId: q.id, label: `scoring question ${qi + 1}` })}>Regenerate</Button><Button size="sm" variant="ghost" onClick={() => removeQuestion(q.id)} disabled={sc.scoringQuestions.length <= RULES.scoringQuestions.min}>Remove</Button></div>}
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">{['L0', 'L1', 'L2', 'L3'].map((l) => <div key={l} className={`rounded-lg border p-2 text-xs ${l === 'L3' ? 'border-[var(--ok)]/40 bg-[var(--ok-soft)]/40' : l === 'L0' ? 'border-[var(--block)]/30 bg-[var(--block-soft)]/30' : 'border-[var(--line)]'}`}><div className="mb-1 font-semibold">{LEVEL_LABELS[l]} <span className="faint font-normal">({l})</span></div><InlineText readOnly={readOnly} value={q.anchors?.[l]} onCommit={(v) => editAnchor(q.id, l, v)} multiline ariaLabel={`${LEVEL_LABELS[l]} anchor`} placeholder="What does an answer at this level contain?" /></div>)}</div>
                      <div className="mt-1.5 flex flex-wrap items-center gap-3"><Source>{q.source}</Source>{q.rekeyed && <Badge tone={q.rekeyed.distinct ? 'ok' : 'block'}>{q.rekeyed.distinct ? 'Re-keyed: levels distinct' : 'Re-key: two levels read the same'}</Badge>}</div>
                    </li>); })}
                </ol>
              </Panel>
            ) : (
              <Panel title={`Questions and options (${sc.mcq.length} of up to 3)`} subtitle="Up to 4 options, all plausible, each written to one proficiency level with a keyed value of 1 to 5 and a rationale that reads as a coaching note. Editing an option re-keys it." right={!readOnly && <Button size="sm" variant="ghost" onClick={addMcqQuestion}>Add question</Button>} padding="p-0">
                <ol className="divide-y divide-[var(--line)]">
                  {sc.mcq.map((q, qi) => (
                    <li key={q.id} className="p-4">
                      <div className="flex items-start justify-between gap-2"><div className="flex items-baseline gap-2"><span className="faint text-xs">Q{qi + 1}.</span><InlineText readOnly={readOnly} value={q.text} onCommit={(v) => setScenario((s) => ({ ...s, approved: false, mcq: s.mcq.map((x) => (x.id === q.id ? { ...x, text: v } : x)) }), 'mcq.question_edited', { after: v })} className="text-sm font-medium" ariaLabel={`MCQ question ${qi + 1}`} /></div>{!readOnly && <div className="flex gap-1"><Button size="sm" variant="ghost" onClick={() => setRegen({ scope: 'mcqQuestion', targetId: q.id, label: `question ${qi + 1}` })}>Regenerate</Button><Button size="sm" variant="ghost" onClick={() => removeMcqQuestion(q.id)}>Remove</Button></div>}</div>
                      <ol className="mt-2 space-y-2">
                        {q.options.map((o, oi) => (
                          <li key={o.id} className="rounded-lg border border-[var(--line)] p-2.5">
                            <div className="flex items-start gap-2"><span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold">{String.fromCharCode(65 + oi)}</span><div className="flex-1"><InlineText readOnly={readOnly} value={o.text} onCommit={(v) => editOption(q.id, o.id, { text: v }, true)} multiline className="text-sm" ariaLabel={`option ${String.fromCharCode(65 + oi)}`} /><div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs"><label className="flex items-center gap-1"><span className="faint">Value</span><Select disabled={readOnly} value={o.key} onChange={(e) => setKey(q.id, o.id, e.target.value)} className="w-16 py-0.5 text-xs" aria-label="Keyed value">{[1, 2, 3, 4, 5].map((k) => <option key={k} value={k}>{k}</option>)}</Select></label><Badge tone={o.key >= 4 ? 'ok' : o.key <= 2 ? 'block' : 'warn'}>{LEVEL_LABELS[o.level] || o.level}</Badge>{o.rekeyed && <Badge tone="brand">Re-keyed {o.rekeyed.before} to {o.rekeyed.after}</Badge>}{!readOnly && <button className="text-[var(--brand)]" onClick={() => setRegen({ scope: 'option', targetId: q.id, optionId: o.id, label: `option ${String.fromCharCode(65 + oi)}` })}>Regenerate option</button>}{!readOnly && q.options.length > 2 && <button className="muted" onClick={() => removeOption(q.id, o.id)}>Remove</button>}</div><div className="muted mt-1 text-xs"><span className="faint">Why: </span><InlineText readOnly={readOnly} value={o.rationale} onCommit={(v) => editOption(q.id, o.id, { rationale: v }, false)} multiline ariaLabel="rationale" placeholder="Why does this option earn its value? Name the behavior." /></div></div></div>
                          </li>
                        ))}
                      </ol>
                      <div className="mt-2 flex items-center justify-between"><Source>{q.source}</Source>{!readOnly && q.options.length < RULES.mcq.optionsMax && <Button size="sm" variant="ghost" onClick={() => addOption(q.id)}>Add option</Button>}</div>
                    </li>
                  ))}
                </ol>
              </Panel>
            )}
          </div>

          <aside className="space-y-4">
            <Panel title="Response and limits" subtitle="The AI recommended these from the complexity and the model answer. Adjust within range." padding="p-4">
              <div className="space-y-4 text-sm">
                <div><div className="faint mb-1 text-[11px] uppercase tracking-wider">Response type</div><div className="flex gap-1">{RESPONSE_TYPES.map((t) => <button key={t} disabled={readOnly || Boolean(busy)} onClick={() => t !== sc.responseType && switchType(t)} aria-pressed={sc.responseType === t} className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium ${sc.responseType === t ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]' : 'border-[var(--line)] hover:bg-slate-50'}`}>{t}</button>)}</div><p className="faint mt-1 text-xs">{sc.responseType === 'Audio' ? 'Recorded answer, transcribed and scored on content.' : sc.responseType === 'Text' ? 'Typed answer with a live character count.' : 'Single select per question, no cap.'} Switching rebuilds the scoring instrument and recomputes observations and time.</p></div>
                <div><div className="mb-1 flex items-center justify-between"><span className="faint text-[11px] uppercase tracking-wider">Recommended time</span><span className="font-mono text-sm">{sc.recommendedMinutes} min</span></div><input type="range" min={RULES.time.scenarioMin} max={RULES.time.scenarioMax} value={sc.recommendedMinutes} onChange={(e) => setMinutes(e.target.value)} disabled={readOnly} className="w-full" aria-label="Recommended time in minutes" /><p className="faint mt-1 text-xs">AI estimate {estimateScenarioMinutes(sc)} min from reading load, analysis depth, response type and model answer size. Shown to participants as guidance, never a cutoff.</p></div>
                {sc.responseType === 'Audio' && <div><div className="mb-1 flex items-center justify-between"><span className="faint text-[11px] uppercase tracking-wider">Recording limit</span><span className="font-mono text-sm">{formatSeconds(sc.cap?.audioSeconds || 0)}</span></div><input type="range" min={RULES.caps.audioMinSeconds} max={RULES.caps.audioMaxSeconds} step={15} value={sc.cap?.audioSeconds || RULES.caps.audioMaxSeconds} onChange={(e) => setCap({ audioSeconds: Number(e.target.value) })} disabled={readOnly} className="w-full" aria-label="Audio cap in seconds" /><p className="faint mt-1 text-xs">Model answer takes about {capUnits} seconds to say. Up to 2 minutes.</p></div>}
                {sc.responseType === 'Text' && <div><div className="mb-1 flex items-center justify-between"><span className="faint text-[11px] uppercase tracking-wider">Character limit</span><span className="font-mono text-sm">{(sc.cap?.textChars || 0).toLocaleString()}</span></div><input type="range" min={RULES.caps.textMinChars} max={RULES.caps.textMaxChars} step={50} value={sc.cap?.textChars || RULES.caps.textMinChars} onChange={(e) => setCap({ textChars: Number(e.target.value) })} disabled={readOnly} className="w-full" aria-label="Text cap in characters" /><p className="faint mt-1 text-xs">Model answer is {capUnits.toLocaleString()} characters. Between 1,000 and 2,000.</p></div>}
                {sc.responseType === 'MCQ' && <p className="muted text-xs">MCQ answers produce {sc.mcq.length} observation{sc.mcq.length === 1 ? '' : 's'}, scored from the key. No AI is involved in MCQ scoring.</p>}
                {sc.responseType !== 'MCQ' && <div className="rounded-lg bg-slate-50 p-2 text-xs"><span className="font-medium">AI scoring calibration:</span> {sc.calibration === 'complete' ? 'complete' : 'pending. Before AI scoring activates for this scenario, 30 responses are scored by two calibrators and AI to human agreement must reach 0.75 per question.'}</div>}
              </div>
            </Panel>
            <Panel title="Skill being measured" padding="p-4">
              <div className="text-sm"><div className="font-semibold">{skill.name}</div><p className="muted text-xs">{skill.definition}</p><div className="mt-2 flex flex-wrap gap-1">{skill.indicators.filter((i) => i.effective).map((i) => <span key={i.id} className={`chip ${sc.responseType === 'MCQ' ? sc.mcq.some((q) => q.options.some((o) => o.indicatorId === i.id)) : sc.scoringQuestions.some((q) => q.indicatorId === i.id) ? 'border-[var(--brand)] text-[var(--brand)]' : 'opacity-50'}`} title={i.text}>{i.id}</span>)}</div><p className="faint mt-1 text-xs">Highlighted behaviors are observed by this scenario.</p></div>
            </Panel>
          </aside>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[var(--line)] pt-4">
          <Button variant="secondary" disabled={index === 0} onClick={() => setSelId(scenarios[index - 1].id)}>Previous scenario</Button>
          <div className="flex items-center gap-2">{!readOnly && !sc.approved && <Button variant="success" onClick={approve} disabled={Boolean(busy)}>Mark approved{index < scenarios.length - 1 ? ' and next' : ''}</Button>}{index < scenarios.length - 1 ? <Button variant="secondary" onClick={() => setSelId(scenarios[index + 1].id)}>Next scenario</Button> : <Button onClick={() => go(5)}>Preview as participant</Button>}</div>
        </div>
      </div>

      <Modal open={Boolean(regen)} title={`Regenerate ${regen?.label || ''}`} onClose={() => setRegen(null)} footer={<><Button variant="secondary" onClick={() => setRegen(null)}>Cancel</Button><Button onClick={runRegen} busy={Boolean(busy)}>Regenerate</Button></>}>
        {!llmAvailable() && <div className="mb-3 flex flex-wrap gap-1.5">{(regen?.scope === 'scenario' ? [['Swap for another library scenario', ''], ['Make it shorter', 'make it shorter'], ['Replace a word', 'replace retailer with distributor']] : [['Swap from the library', ''], ['Replace a word', 'replace X with Y']]).map(([label, text]) => <button key={label} className="pill" onClick={() => setInstruction(text)}>{label}</button>)}</div>}
        {regen?.scope === 'sentence' && <div className="mb-3"><div className="faint mb-1 text-xs uppercase tracking-wider">Which sentence</div><Select value={regen.sentenceIndex} onChange={(e) => setRegen({ ...regen, sentenceIndex: Number(e.target.value) })}>{sentences.map((s, i) => <option key={i} value={i}>{s.slice(0, 90)}</option>)}</Select></div>}
        <Textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} placeholder={'Plain instruction, for example: "make this about a distributor, not a retailer" or "raise the stakes: the client is the largest account".'} />
        <p className="faint mt-2 text-xs">{llmAvailable() ? 'The AI rewrites only what you asked for and re-runs the analysis where the facts change. Undo is available.' : 'Scripted mode understands three things: leave the box empty to swap in another library scenario, "make it shorter", or "replace X with Y" (also "about X, not Y"). Anything else is noted but not applied. Connect AI in Settings for free form rewriting.'}</p>
      </Modal>
      <Modal open={mediaOpen} title="Scenario media" onClose={() => setMediaOpen(false)} wide>
        <MediaEditor media={sc.media} onChange={editMedia} onRemove={() => editMedia(null)} onClose={() => setMediaOpen(false)} />
      </Modal>
    </div>
  );
}

function capText(type, cap) { if (type === 'Audio') return formatSeconds(cap?.audioSeconds || 0); if (type === 'Text') return `${(cap?.textChars || 0).toLocaleString()} characters`; return 'none'; }

function AnalysisList({ label, items = [], onChange, readOnly }) {
  return (
    <div>
      <div className="faint mb-1 text-[11px] uppercase tracking-wider">{label}</div>
      <ul className="space-y-1">{items.map((it, i) => <li key={i} className="flex items-start gap-1.5 text-sm"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" />{onChange && !readOnly ? <InlineText readOnly={readOnly} value={it} onCommit={(v) => onChange(v.trim() ? items.map((x, j) => (j === i ? v : x)) : items.filter((_, j) => j !== i))} multiline ariaLabel={label} /> : <span>{it}</span>}</li>)}</ul>
      {onChange && !readOnly && <button className="mt-1 text-xs text-[var(--brand)]" onClick={() => onChange([...items, 'New item'])}>Add</button>}
    </div>
  );
}
