import React, { useEffect, useState } from 'react';
import { Button, Badge, Select, InlineText, Source, Modal, Textarea, Severity, Tooltip } from '../components/ui.jsx';
import { MediaView, MediaEditor } from '../components/Media.jsx';
import { RULES, LEVEL_LABELS, RESPONSE_TYPES } from '../content/rules.js';
import { getSkill, indicatorById } from '../content/ontology.js';
import { issuesForScenario, scenarioLabel } from '../engine/qualityGate.js';
import { reanalyze, regenerate, switchResponseType, rekeyOption, splitSentences, mediaSummary, retryAnalysis, generateScenario } from '../engine/generator.js';
import { estimateScenarioMinutes, modelAnswerInCapUnits, formatSeconds } from '../engine/duration.js';
import { wordCount, readingGrade, uid } from '../engine/text.js';

export default function Step4Review({ asm, update, go, gate, readOnly, focusScenarioId, setFocusScenarioId, toast }) {
  const scenarios = asm.scenarios || [];
  const [selId, setSelId] = useState(focusScenarioId || scenarios[0]?.id);
  useEffect(() => { if (focusScenarioId) { setSelId(focusScenarioId); setExpanded(true); setFocusScenarioId(null); } }, [focusScenarioId]); // eslint-disable-line
  useEffect(() => { if (!scenarios.some((s) => s.id === selId)) setSelId(scenarios[0]?.id); }, [scenarios, selId]);
  const sc = scenarios.find((s) => s.id === selId);
  const index = scenarios.findIndex((s) => s.id === selId);
  const [busy, setBusy] = useState('');
  const [regen, setRegen] = useState(null); // { scope, targetId, optionId, sentenceIndex, label }
  const [instruction, setInstruction] = useState('');
  const [mediaOpen, setMediaOpen] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [tab, setTab] = useState('settings');
  const [openLevels, setOpenLevels] = useState({});

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

  const switchType = async (type) => { setBusy(`Switching to ${type} and rebuilding the scoring instrument`); const res = await switchResponseType(sc, asm, type); if (res.ok) replaceScenario(res.scenario, 'scenario.response_type', { before: sc.responseType, after: type }); else toast(res.note, 'error'); setBusy(''); };
  const retry = async () => { setBusy(sc.situation ? 'Retrying the contextual analysis' : 'Retrying generation'); const row = asm.blueprint?.rows.find((r) => r.id === sc.blueprintRowId) || { id: sc.blueprintRowId, skillId: sc.skillId, responseType: sc.responseType, difficulty: sc.difficulty, tag: sc.tag, plannedQuestions: sc.responseType === 'MCQ' ? 2 : 4 }; const next = sc.situation ? await retryAnalysis(sc) : { ...(await generateScenario(row, asm, index)), id: sc.id }; replaceScenario(next, 'scenario.retry', { after: next.generationError ? 'failed' : 'ok' }); toast(next.generationError ? next.generationError : 'Done.', next.generationError ? 'error' : 'ok'); setBusy(''); };
  const setMinutes = (m) => setScenario({ recommendedMinutes: Math.max(RULES.time.scenarioMin, Math.min(RULES.time.scenarioMax, Number(m))), approved: false }, 'scenario.time', { before: sc.recommendedMinutes, after: m });
  const setCap = (cap) => setScenario({ cap, approved: false }, 'scenario.cap', { before: sc.cap, after: cap });

  const editQuestion = (qid, patch, action) => setScenario((s) => ({ ...s, approved: false, scoringQuestions: s.scoringQuestions.map((q) => (q.id === qid ? { ...q, ...patch } : q)) }), action, { after: patch });
  const editAnchor = (qid, level, value) => { const q = sc.scoringQuestions.find((x) => x.id === qid); const anchors = { ...q.anchors, [level]: value }; const norm = Object.values(anchors).map((a) => a.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()); const dup = new Set(norm).size < 4; editQuestion(qid, { anchors, rekeyed: { at: Date.now(), level, distinct: !dup } }, 'scoring_question.anchor_edited'); if (dup) toast('Two levels now read the same. Approval is blocked until each level describes different content.', 'error'); else toast(`Re-keyed: ${LEVEL_LABELS[level]} anchor updated, all four levels distinct.`); };
  const addQuestion = () => { if (sc.scoringQuestions.length >= RULES.scoringQuestions.max) return toast('Audio and Text scenarios have at most 5 scoring questions.', 'error'); const used = new Set(sc.scoringQuestions.map((q) => q.indicatorId)); const ind = skill.indicators.find((i) => i.effective && !used.has(i.id)) || skill.indicators[0]; setScenario((s) => ({ ...s, approved: false, scoringQuestions: [...s.scoringQuestions, { id: uid('sq'), text: `Did the response ${ind.text.charAt(0).toLowerCase()}${ind.text.slice(1)}?`, indicatorId: ind.id, anchors: { L0: `The answer does not ${ind.text.charAt(0).toLowerCase()}${ind.text.slice(1)}.`, L1: 'The answer gestures at this in general terms without using the specifics of the situation.', L2: 'The answer does this clearly with reference to at least one specific fact from the situation or media.', L3: 'The answer does this fully, ties it to the specific facts and makes the consequence for the people involved explicit.' }, traceTo: [], source: 'Added by you from a Skill indicator; link it to the analysis' }] }), 'scoring_question.added'); };
  const removeQuestion = (qid) => setScenario((s) => ({ ...s, approved: false, scoringQuestions: s.scoringQuestions.filter((q) => q.id !== qid) }), 'scoring_question.removed', { before: qid });

  const editOption = async (qid, oid, patch, rekey) => {
    setScenario((s) => ({ ...s, approved: false, mcq: s.mcq.map((q) => (q.id === qid ? { ...q, options: q.options.map((o) => (o.id === oid ? { ...o, ...patch } : o)) } : q)) }), 'mcq.option_edited', { after: patch });
    if (rekey) { setBusy('Re-keying the option'); const res = await rekeyOption({ ...sc, mcq: sc.mcq.map((q) => (q.id === qid ? { ...q, options: q.options.map((o) => (o.id === oid ? { ...o, ...patch } : o)) } : q)) }, qid, oid); if (res.ok) { replaceScenario(res.scenario, 'mcq.option_rekeyed'); const o = res.scenario.mcq.find((q) => q.id === qid).options.find((x) => x.id === oid); toast(o.rekeyed && o.rekeyed.before !== o.rekeyed.after ? `Re-keyed: value ${o.rekeyed.before} to ${o.rekeyed.after} (${o.level}).` : `Re-keyed: value ${o.key} unchanged (${o.level}).`); } else toast(res.note, 'error'); setBusy(''); }
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
    if (res.ok) { replaceScenario({ ...res.scenario, approved: false }, `regenerate.${scope}`, { after: instruction }); toast(res.note || `${regen.label} regenerated.`, 'ok'); } else toast(res.note || 'Nothing changed.', 'error');
    setBusy(''); setRegen(null); setInstruction('');
  };

  const approve = () => { if (hardIssues.length) return toast(`Fix ${hardIssues.length} item${hardIssues.length === 1 ? '' : 's'} before approving: ${hardIssues[0].message}`, 'error'); setScenario({ approved: true }, 'scenario.approved'); toast(`${scenarioLabel(sc, index)} approved.`, 'ok'); if (index < scenarios.length - 1) { setSelId(scenarios[index + 1].id); setExpanded(true); } };
  const capUnits = modelAnswerInCapUnits(sc.responseType, sc.analysis?.modelAnswer || '');
  const grade = readingGrade(sc.situation);
  const sentences = splitSentences(sc.situation);
  const visibleIssues = issues.filter((i) => i.rule !== 'approval');
  const openTab = (t) => { setTab(t); setTimeout(() => document.getElementById(`tools-tab-${t}`)?.focus(), 0); };

  // Scenarios grouped into sections by Skill, in the order the Skills were chosen (like pages in a form builder).
  const groups = asm.skills.map((k, gi) => ({ skill: k, n: gi + 1, items: scenarios.map((s, i) => ({ s, i })).filter(({ s }) => s.skillId === k.id) })).filter((g) => g.items.length);
  const orphans = scenarios.map((s, i) => ({ s, i })).filter(({ s }) => !asm.skills.some((k) => k.id === s.skillId));
  if (orphans.length) groups.push({ skill: { id: 'other', clientLabel: 'Other' }, n: groups.length + 1, items: orphans });

  const statusOf = (s) => { const h = issuesForScenario(gate, s.id).filter((x) => x.severity === 'hard' && x.rule !== 'approval').length; if (s.generationError) return { tone: 'block', text: 'Needs retry' }; if (s.approved) return { tone: 'ok', text: 'Approved' }; if (h) return { tone: 'block', text: `${h} to fix` }; return { tone: 'neutral', text: 'To review' }; };
  const qCount = (s) => (s.responseType === 'MCQ' ? s.mcq?.length || 0 : s.scoringQuestions?.length || 0);
  const select = (id) => { if (id === selId) { setExpanded(!expanded); return; } setSelId(id); setExpanded(true); setTimeout(() => document.getElementById(`scenario-card-${id}`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 30); };

  const TABS = [
    { id: 'settings', label: 'Settings' },
    { id: 'analysis', label: 'Analysis' },
    { id: 'checks', label: 'Checks', count: visibleIssues.length },
    { id: 'tools', label: 'Tools' },
  ];
  const onTabKey = (e) => { const i = TABS.findIndex((t) => t.id === tab); if (e.key === 'ArrowRight') openTab(TABS[(i + 1) % TABS.length].id); if (e.key === 'ArrowLeft') openTab(TABS[(i + TABS.length - 1) % TABS.length].id); };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4" aria-label="Scenario canvas" role="region">
        {groups.map((g) => (
          <section key={g.skill.id} className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3 sm:p-4" aria-labelledby={`group-${g.skill.id}`}>
            <div className="mb-3 flex items-center justify-between gap-2 px-1">
              <h2 id={`group-${g.skill.id}`} className="text-[15px] font-semibold">Skill {g.n}: <span className="font-normal text-[var(--ink-2)]">{g.skill.clientLabel || getSkill(g.skill.id)?.name}</span></h2>
              <span className="faint text-xs">{g.items.filter(({ s }) => s.approved).length} of {g.items.length} approved</span>
            </div>
            <ol className="space-y-2">
              {g.items.map(({ s, i }) => {
                const st = statusOf(s); const open = s.id === selId && expanded;
                if (!open) return (
                  <li key={s.id}>
                    <button data-scenario-row onClick={() => select(s.id)} aria-expanded="false" aria-controls={`scenario-card-${s.id}`} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${s.id === selId ? 'border-[var(--brand)]/60 bg-[var(--card)]' : 'border-[var(--line)] bg-[var(--card)] hover:border-[var(--line-2)] hover:bg-[var(--card-2)]'}`}>
                      <Caret open={false} />
                      <span className="tile !h-7 !w-7 text-[11px] font-semibold">S{i + 1}</span>
                      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{s.title || `Scenario ${i + 1}`}</span><span className="faint block truncate text-xs">{s.contextHeader || 'Not generated yet'}</span></span>
                      <span className="hidden items-center gap-2 sm:flex"><TypePill type={s.responseType} /><span className="faint text-xs">{s.recommendedMinutes} min</span><span className="faint text-xs">{qCount(s)} question{qCount(s) === 1 ? '' : 's'}</span></span>
                      <Badge tone={st.tone}>{st.text}</Badge>
                    </button>
                  </li>
                );
                return (
                  <li key={s.id} id={`scenario-card-${s.id}`} className="rounded-xl border border-[var(--brand)] bg-[var(--card)] shadow-[0_0_0_1px_var(--brand),0_10px_30px_rgba(61,220,111,.08)]">
                    <div className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] px-3 py-2.5">
                      <button onClick={() => setExpanded(false)} aria-expanded="true" aria-label={`Collapse scenario ${i + 1}`} className="icon-btn !h-7 !w-7"><Caret open /></button>
                      <span className="tile !h-7 !w-7 text-[11px] font-semibold">S{i + 1}</span>
                      <div className="min-w-0 flex-1 text-[15px] font-semibold"><InlineText readOnly={readOnly} value={sc.title} onCommit={(v) => setScenario({ title: v }, 'scenario.title', { after: v })} ariaLabel="scenario title" /></div>
                      <label className="flex items-center gap-1.5 text-xs"><span className="sr-only">Response type</span><Select disabled={readOnly || Boolean(busy)} value={sc.responseType} onChange={(e) => switchType(e.target.value)} className="w-auto py-1 text-xs" aria-label="Response type">{RESPONSE_TYPES.map((t) => <option key={t} value={t}>{t === 'MCQ' ? 'Multiple choice' : t === 'Audio' ? 'Audio answer' : 'Text answer'}</option>)}</Select></label>
                      <Badge tone={st.tone}>{st.text}</Badge>
                    </div>

                    <div className="space-y-4 p-4">
                      {busy && <div className="rounded-lg bg-[var(--brand-soft)] px-3 py-2 text-sm pulse" role="status">{busy}</div>}
                      {(sc.generationError || sc.analysisStale) && !busy && (
                        <section role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--block)]/40 bg-[var(--block-soft)] p-3">
                          <div><h3 className="text-sm font-semibold">{sc.situation ? 'The scoring instrument needs to be regenerated' : 'This scenario was not generated'}</h3><p className="muted mt-0.5 text-sm">{sc.generationError || 'The situation changed and the analysis could not be re-run.'}</p></div>
                          {!readOnly && <Button size="sm" onClick={retry}>{sc.situation ? 'Retry analysis' : 'Retry generation'}</Button>}
                        </section>
                      )}
                      {sc.pendingConfirmation && (
                        <section className="card border-[var(--warn)]/50 p-3">
                          <h3 className="text-sm font-semibold">The situation or media changed, so the analysis re-ran</h3>
                          <p className="muted text-xs">Confirm the changed scoring questions or keep the previous set.</p>
                          <ul className="mt-2 space-y-1 text-sm">{sc.pendingConfirmation.changed.map((c) => <li key={c.id} className="flex gap-2"><Badge tone={c.status === 'unchanged' || c.status === 'kept' ? 'neutral' : c.status === 'removed' ? 'block' : 'warn'}>{c.status}</Badge><span>{c.text}{c.status === 'changed' && c.previous && <span className="faint block text-xs">was: {c.previous}</span>}</span></li>)}</ul>
                          {sc.pendingConfirmation.before.cap && JSON.stringify(sc.pendingConfirmation.before.cap) !== JSON.stringify(sc.cap) && <p className="muted mt-2 text-xs">Recommended limit changed from {capText(sc.responseType, sc.pendingConfirmation.before.cap)} to {capText(sc.responseType, sc.cap)}.</p>}
                          <div className="mt-3 flex gap-2"><Button size="sm" onClick={confirmPending}>Confirm changes</Button><Button size="sm" variant="secondary" onClick={revertPending}>Keep previous questions</Button></div>
                        </section>
                      )}
                      {visibleIssues.some((x) => x.severity === 'hard') && <button onClick={() => openTab('checks')} className="w-full rounded-lg border border-[var(--block)]/40 bg-[var(--block-soft)] px-3 py-2 text-left text-sm"><span className="font-semibold text-[var(--block)]">{hardIssues.length} to fix before approving.</span> <span className="muted">{hardIssues[0]?.message} Open Checks for all of them.</span></button>}

                      <div>
                        <h3 className="mb-2 text-sm font-semibold">What the participant sees</h3>
                        <div className="space-y-2">
                          <FieldBox label="Context header" meta={`${wordCount(sc.contextHeader)} of 30 words`}><InlineText readOnly={readOnly} value={sc.contextHeader} onCommit={(v) => editSituation('contextHeader', v)} multiline className="text-sm font-medium" ariaLabel="context header" /></FieldBox>
                          <FieldBox label="Situation" meta={`${wordCount(sc.situation)} words · grade ${grade} reading level`}><InlineText readOnly={readOnly} value={sc.situation} onCommit={(v) => editSituation('situation', v)} multiline className="text-[15px] leading-relaxed" ariaLabel="situation" placeholder="Not generated yet. Retry generation above, or write the situation here and the analysis will run on it." /></FieldBox>
                          {sc.media && <FieldBox label="Media" meta={sc.media.source}><MediaView media={sc.media} compact /></FieldBox>}
                          <FieldBox label="Question to the participant"><InlineText readOnly={readOnly} value={sc.prompt} onCommit={(v) => setScenario({ prompt: v, approved: false }, 'scenario.prompt', { after: v })} className="text-sm font-medium" ariaLabel="prompt" /></FieldBox>
                        </div>
                      </div>

                      {sc.responseType !== 'MCQ' ? (
                        <div>
                          <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">How the answer is scored <span className="faint font-normal">({sc.scoringQuestions.length} scoring questions)</span></h3>{!readOnly && <button className="text-xs font-medium text-[var(--brand)]" onClick={addQuestion}>+ Add question</button>}</div>
                          <ol className="space-y-2">
                            {sc.scoringQuestions.map((q, qi) => { const ind = indicatorById(q.indicatorId); const lv = openLevels[q.id]; return (
                              <li key={q.id} className="rounded-lg border border-[var(--line)] bg-[var(--card-2)]">
                                <div className="flex items-start gap-2 p-2.5">
                                  <span className="faint mt-0.5 w-5 shrink-0 text-right text-xs">{qi + 1}</span>
                                  <div className="min-w-0 flex-1">
                                    <InlineText readOnly={readOnly} value={q.text} onCommit={(v) => editQuestion(q.id, { text: v }, 'scoring_question.text_edited')} className="text-sm" ariaLabel={`scoring question ${qi + 1}`} />
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs"><Select disabled={readOnly} value={q.indicatorId || ''} onChange={(e) => editQuestion(q.id, { indicatorId: e.target.value }, 'scoring_question.indicator')} className="w-auto max-w-full py-0.5 text-xs" aria-label={`Behavior observed by scoring question ${qi + 1}`}><option value="">Choose the behavior this observes</option>{skill.indicators.filter((x) => x.effective).map((x) => <option key={x.id} value={x.id}>{x.text}</option>)}</Select>{ind && ind.skillId !== sc.skillId && <Badge tone="block">Different Skill</Badge>}{q.rekeyed && <Badge tone={q.rekeyed.distinct ? 'ok' : 'block'}>{q.rekeyed.distinct ? 'Levels distinct' : 'Two levels read the same'}</Badge>}</div>
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <button className="pill !min-h-7 !px-2.5 !py-0.5 text-xs" aria-expanded={Boolean(lv)} onClick={() => setOpenLevels({ ...openLevels, [q.id]: !lv })}>Levels</button>
                                    {!readOnly && <IconAction label={`Regenerate scoring question ${qi + 1}`} onClick={() => setRegen({ scope: 'question', targetId: q.id, label: `scoring question ${qi + 1}` })} d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />}
                                    {!readOnly && <IconAction label={`Remove scoring question ${qi + 1}`} disabled={sc.scoringQuestions.length <= RULES.scoringQuestions.min} onClick={() => removeQuestion(q.id)} d="M6 6l12 12M18 6L6 18" />}
                                  </div>
                                </div>
                                {lv && <div className="grid gap-2 border-t border-[var(--line)] p-2.5 sm:grid-cols-2">{['L0', 'L1', 'L2', 'L3'].map((l) => <div key={l} className={`rounded-lg border p-2 text-xs ${l === 'L3' ? 'border-[var(--ok)]/40' : l === 'L0' ? 'border-[var(--block)]/30' : 'border-[var(--line)]'}`}><div className="mb-1 font-semibold">{LEVEL_LABELS[l]} <span className="faint font-normal">({l})</span></div><InlineText readOnly={readOnly} value={q.anchors?.[l]} onCommit={(v) => editAnchor(q.id, l, v)} multiline ariaLabel={`${LEVEL_LABELS[l]} anchor for scoring question ${qi + 1}`} placeholder="What does an answer at this level contain?" /></div>)}</div>}
                              </li>); })}
                          </ol>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-semibold">Questions and options <span className="faint font-normal">({sc.mcq.length} of up to 3)</span></h3>{!readOnly && <button className="text-xs font-medium text-[var(--brand)]" onClick={addMcqQuestion}>+ Add question</button>}</div>
                          {sc.mcq.map((q, qi) => (
                            <div key={q.id} className="rounded-lg border border-[var(--line)] bg-[var(--card-2)] p-2.5">
                              <div className="flex items-start gap-2"><span className="faint mt-0.5 text-xs">Q{qi + 1}</span><div className="min-w-0 flex-1"><InlineText readOnly={readOnly} value={q.text} onCommit={(v) => setScenario((x) => ({ ...x, approved: false, mcq: x.mcq.map((y) => (y.id === q.id ? { ...y, text: v } : y)) }), 'mcq.question_edited', { after: v })} className="text-sm font-medium" ariaLabel={`MCQ question ${qi + 1}`} /></div>{!readOnly && <><IconAction label={`Regenerate question ${qi + 1}`} onClick={() => setRegen({ scope: 'mcqQuestion', targetId: q.id, label: `question ${qi + 1}` })} d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" /><IconAction label={`Remove question ${qi + 1}`} onClick={() => removeMcqQuestion(q.id)} d="M6 6l12 12M18 6L6 18" /></>}</div>
                              <ol className="mt-2 space-y-1.5">
                                {q.options.map((o, oi) => (
                                  <li key={o.id} className="flex items-start gap-2 rounded-lg border border-[var(--line)] bg-[var(--card)] p-2">
                                    <span className="tile !h-6 !w-6 !rounded-md text-[11px] font-semibold">{String.fromCharCode(65 + oi)}</span>
                                    <div className="min-w-0 flex-1"><InlineText readOnly={readOnly} value={o.text} onCommit={(v) => editOption(q.id, o.id, { text: v }, true)} multiline className="text-sm" ariaLabel={`option ${String.fromCharCode(65 + oi)} of question ${qi + 1}`} />{o.rationale && <p className="faint mt-1 text-xs">{o.rationale}</p>}</div>
                                    <label className="flex shrink-0 items-center gap-1 text-xs"><span className="faint">Value</span><Select disabled={readOnly} value={o.key} onChange={(e) => setKey(q.id, o.id, e.target.value)} className="w-14 py-0.5 text-xs" aria-label={`Keyed value of option ${String.fromCharCode(65 + oi)}`}>{[1, 2, 3, 4, 5].map((k) => <option key={k} value={k}>{k}</option>)}</Select></label>
                                    {!readOnly && <IconAction label={`Regenerate option ${String.fromCharCode(65 + oi)}`} onClick={() => setRegen({ scope: 'option', targetId: q.id, optionId: o.id, label: `option ${String.fromCharCode(65 + oi)}` })} d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />}
                                    {!readOnly && <IconAction label={`Remove option ${String.fromCharCode(65 + oi)}`} disabled={q.options.length <= 2} onClick={() => removeOption(q.id, o.id)} d="M6 6l12 12M18 6L6 18" />}
                                  </li>
                                ))}
                              </ol>
                              {!readOnly && q.options.length < RULES.mcq.optionsMax && <button className="mt-2 text-xs font-medium text-[var(--brand)]" onClick={() => addOption(q.id)}>+ Add option</button>}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-3">
                        <div className="flex gap-2"><Button size="sm" variant="secondary" disabled={index === 0} onClick={() => select(scenarios[index - 1].id)}>Previous</Button><Button size="sm" variant="secondary" disabled={index === scenarios.length - 1} onClick={() => select(scenarios[index + 1].id)}>Next</Button></div>
                        {!readOnly && (sc.approved ? <Button size="sm" variant="secondary" onClick={() => setScenario({ approved: false }, 'scenario.unapproved')}>Unapprove</Button> : <Button variant="success" onClick={approve} disabled={Boolean(busy)}>Mark approved{index < scenarios.length - 1 ? ' and open next' : ''}</Button>)}
                        {index === scenarios.length - 1 && <Button onClick={() => go(5)}>Preview as participant</Button>}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>

      <aside aria-label="Scenario tools" className="card self-start overflow-hidden xl:sticky xl:top-[72px] xl:max-h-[calc(100vh-88px)] xl:overflow-auto">
        <div className="border-b border-[var(--line)] px-4 pt-3">
          <p className="faint text-[11px] uppercase tracking-wider">Scenario {index + 1}</p>
          <p className="truncate text-sm font-semibold">{sc.title}</p>
          <div role="tablist" aria-label="Scenario tools" className="mt-2 grid grid-cols-4" onKeyDown={onTabKey}>
            {TABS.map((t) => <button key={t.id} id={`tools-tab-${t.id}`} role="tab" aria-selected={tab === t.id} aria-controls={`tools-panel-${t.id}`} tabIndex={tab === t.id ? 0 : -1} onClick={() => setTab(t.id)} className={`flex items-center justify-center gap-1 whitespace-nowrap border-b-2 px-1 py-2 text-xs font-medium ${tab === t.id ? 'border-[var(--brand)] text-[var(--brand)]' : 'border-transparent text-[var(--ink-2)] hover:text-[var(--ink)]'}`}>{t.label}{t.count ? <span className="rounded-full bg-[var(--block-soft)] px-1.5 text-[10px] text-[var(--block)]" aria-label={`${t.count} items`}>{t.count}</span> : null}</button>)}
          </div>
        </div>
        <div role="tabpanel" id={`tools-panel-${tab}`} aria-labelledby={`tools-tab-${tab}`} className="p-4 text-sm">
          {tab === 'settings' && (
            <div className="space-y-4">
              <div><div className="faint mb-1 text-[11px] uppercase tracking-wider">Response type</div><div className="flex gap-1">{RESPONSE_TYPES.map((t) => <button key={t} disabled={readOnly || Boolean(busy)} onClick={() => t !== sc.responseType && switchType(t)} aria-pressed={sc.responseType === t} className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium ${sc.responseType === t ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]' : 'border-[var(--line)] hover:bg-[var(--card-3)]'}`}>{t}</button>)}</div><p className="faint mt-1 text-xs">{sc.responseType === 'Audio' ? 'Recorded answer, transcribed and scored on content.' : sc.responseType === 'Text' ? 'Typed answer with a live character count.' : 'Single select per question, no limit.'} Switching rebuilds how it is scored.</p></div>
              <div><div className="mb-1 flex items-center justify-between"><span className="faint text-[11px] uppercase tracking-wider">Recommended time</span><span className="font-mono text-sm">{sc.recommendedMinutes} min</span></div><input type="range" min={RULES.time.scenarioMin} max={RULES.time.scenarioMax} value={sc.recommendedMinutes} onChange={(e) => setMinutes(e.target.value)} disabled={readOnly} className="w-full" aria-label="Recommended time in minutes" /><p className="faint mt-1 text-xs">AI estimate {estimateScenarioMinutes(sc)} min. Shown as guidance, never a cutoff.</p></div>
              {sc.responseType === 'Audio' && <div><div className="mb-1 flex items-center justify-between"><span className="faint text-[11px] uppercase tracking-wider">Recording limit</span><span className="font-mono text-sm">{formatSeconds(sc.cap?.audioSeconds || 0)}</span></div><input type="range" min={RULES.caps.audioMinSeconds} max={RULES.caps.audioMaxSeconds} step={15} value={sc.cap?.audioSeconds || RULES.caps.audioMaxSeconds} onChange={(e) => setCap({ audioSeconds: Number(e.target.value) })} disabled={readOnly} className="w-full" aria-label="Audio limit in seconds" /><p className="faint mt-1 text-xs">The model answer takes about {capUnits} seconds to say. Up to 2 minutes.</p></div>}
              {sc.responseType === 'Text' && <div><div className="mb-1 flex items-center justify-between"><span className="faint text-[11px] uppercase tracking-wider">Character limit</span><span className="font-mono text-sm">{(sc.cap?.textChars || 0).toLocaleString()}</span></div><input type="range" min={RULES.caps.textMinChars} max={RULES.caps.textMaxChars} step={50} value={sc.cap?.textChars || RULES.caps.textMinChars} onChange={(e) => setCap({ textChars: Number(e.target.value) })} disabled={readOnly} className="w-full" aria-label="Text limit in characters" /><p className="faint mt-1 text-xs">The model answer is {capUnits.toLocaleString()} characters. Between 1,000 and 2,000.</p></div>}
              {sc.responseType === 'MCQ' && <p className="muted text-xs">Multiple choice answers give {sc.mcq.length} observation{sc.mcq.length === 1 ? '' : 's'}, scored from the key. No AI scores them.</p>}
              {sc.responseType !== 'MCQ' && <p className="rounded-lg bg-[var(--card-2)] p-2 text-xs"><span className="font-medium">AI scoring:</span> {sc.calibration === 'complete' ? 'calibrated.' : 'activates after calibration on the first 30 responses.'}</p>}
              <div className="border-t border-[var(--line)] pt-3"><div className="faint mb-1 text-[11px] uppercase tracking-wider">Skill being measured</div><div className="font-semibold">{skill.name}</div><p className="muted text-xs">{skill.definition}</p><div className="mt-2 flex flex-wrap gap-1">{skill.indicators.filter((x) => x.effective).map((x) => { const seen = sc.responseType === 'MCQ' ? sc.mcq.some((q) => q.options.some((o) => o.indicatorId === x.id)) : sc.scoringQuestions.some((q) => q.indicatorId === x.id); return <span key={x.id} className={`chip ${seen ? 'border-[var(--brand)] font-semibold text-[var(--brand)]' : 'border-dashed'}`} title={x.text}>{x.id}<span className="sr-only">{seen ? ' (observed)' : ' (not observed)'}</span></span>; })}</div><p className="faint mt-1 text-xs">Solid chips are behaviors this scenario observes.</p></div>
            </div>
          )}
          {tab === 'analysis' && (
            <div className="space-y-4">
              <p className="muted text-xs">What the AI read in the situation and media. The scoring is derived from this.</p>
              <AnalysisList label="Key facts" items={sc.analysis?.keyFacts} onChange={(items) => setScenario((x) => ({ ...x, analysis: { ...x.analysis, keyFacts: items } }), 'analysis.facts_edited')} readOnly={readOnly} />
              <AnalysisList label="Constraints" items={sc.analysis?.constraints} onChange={(items) => setScenario((x) => ({ ...x, analysis: { ...x.analysis, constraints: items } }), 'analysis.constraints_edited')} readOnly={readOnly} />
              <AnalysisList label="Stakeholders" items={sc.analysis?.stakeholders} onChange={(items) => setScenario((x) => ({ ...x, analysis: { ...x.analysis, stakeholders: items } }), 'analysis.stakeholders_edited')} readOnly={readOnly} />
              {sc.media && <AnalysisList label="What the media shows" items={sc.analysis?.mediaShows?.length ? sc.analysis.mediaShows : mediaSummary(sc.media)} readOnly />}
              <div><div className="faint mb-1 text-[11px] uppercase tracking-wider">A good answer must address</div><ol className="list-decimal space-y-1 pl-5">{(sc.analysis?.idealMustAddress || []).map((e, i) => <li key={i}>{e.text || e} {e.indicatorId && <span className="faint text-xs">({e.indicatorId})</span>}</li>)}</ol></div>
              {sc.responseType !== 'MCQ' && <div><div className="faint mb-1 text-[11px] uppercase tracking-wider">Model answer <span className="normal-case">({wordCount(sc.analysis?.modelAnswer || '')} words, sizes the limit)</span></div><InlineText readOnly={readOnly} value={sc.analysis?.modelAnswer} onCommit={(v) => setScenario((x) => ({ ...x, approved: false, analysis: { ...x.analysis, modelAnswer: v } }), 'analysis.model_answer_edited')} multiline className="text-sm" ariaLabel="model answer" /></div>}
              <div><div className="faint mb-1 text-[11px] uppercase tracking-wider">Typical weak answers</div><ul className="muted list-disc space-y-1 pl-5">{(sc.analysis?.weakPatterns || []).map((w, i) => <li key={i}>{w}</li>)}</ul></div>
              <div className="flex flex-col gap-1">{(sc.analysis?.sources || []).map((x, i) => <Source key={i}>{x.text}</Source>)}</div>
            </div>
          )}
          {tab === 'checks' && (
            <div className="space-y-2">
              {!visibleIssues.length && <p className="muted">Nothing to fix in this scenario.</p>}
              {visibleIssues.map((x) => <div key={x.id} className={`rounded-lg border p-2.5 text-xs ${x.severity === 'hard' ? 'border-[var(--block)]/40 bg-[var(--block-soft)]' : 'border-[var(--warn)]/40 bg-[var(--warn-soft)]'}`}><Severity severity={x.severity} /><p className="mt-1 font-medium">{x.message}</p><p className="muted">{x.fix}</p></div>)}
            </div>
          )}
          {tab === 'tools' && (
            <div className="space-y-2">
              {readOnly && <p className="muted text-xs">This version is published. Use "Edit as new version" to change it.</p>}
              <ToolCard disabled={readOnly} title="Regenerate scenario" text="Rewrite the whole scenario with a plain instruction." onClick={() => setRegen({ scope: 'scenario', label: 'the whole scenario' })} d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" />
              <ToolCard disabled={readOnly || !sc.situation} title="Rewrite one sentence" text="Change a single sentence of the situation." onClick={() => setRegen({ scope: 'sentence', sentenceIndex: 0, label: 'one sentence' })} d="M4 7h16M4 12h10M4 17h7" />
              <ToolCard disabled={readOnly} title={sc.media ? 'Replace or remove media' : 'Add media'} text="Chart, table, image or document extract." onClick={() => setMediaOpen(true)} d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
              <p className="faint pt-1 text-xs"><Source>{sc.source?.text}</Source></p>
            </div>
          )}
        </div>
      </aside>

      <Modal open={Boolean(regen)} title={`Regenerate ${regen?.label || ''}`} onClose={() => setRegen(null)} footer={<><Button variant="secondary" onClick={() => setRegen(null)}>Cancel</Button><Button onClick={runRegen} busy={Boolean(busy)}>Regenerate</Button></>}>
        {regen?.scope === 'sentence' && <div className="mb-3"><div className="faint mb-1 text-xs uppercase tracking-wider">Which sentence</div><Select value={regen.sentenceIndex} onChange={(e) => setRegen({ ...regen, sentenceIndex: Number(e.target.value) })} aria-label="Sentence to rewrite">{sentences.map((x, i) => <option key={i} value={i}>{x.slice(0, 90)}</option>)}</Select></div>}
        <Textarea value={instruction} onChange={(e) => setInstruction(e.target.value)} aria-label="Instruction for the AI" placeholder={'Plain instruction, for example: "make this about a distributor, not a retailer" or "raise the stakes: the client is the largest account".'} />
        <p className="faint mt-2 text-xs">The AI rewrites only what you asked for and re-runs the analysis where the facts change.</p>
      </Modal>
      <Modal open={mediaOpen} title="Scenario media" onClose={() => setMediaOpen(false)} wide>
        <MediaEditor media={sc.media} onChange={editMedia} onRemove={() => editMedia(null)} onClose={() => setMediaOpen(false)} />
      </Modal>
    </div>
  );
}

function Caret({ open }) { return <svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true" className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`} fill="currentColor"><path d="M8 5l10 7-10 7z" /></svg>; }
function TypePill({ type }) { const label = type === 'MCQ' ? 'Multiple choice' : type === 'Audio' ? 'Audio' : 'Text'; return <span className="rounded-md border border-[var(--line-2)] bg-[var(--card-2)] px-2 py-0.5 text-[11px] text-[var(--ink-2)]">{label}</span>; }
function FieldBox({ label, meta, children }) { return <div className="rounded-lg border border-[var(--line)] bg-[var(--card-2)] px-3 py-2"><div className="faint mb-0.5 flex flex-wrap items-baseline justify-between gap-x-2 text-[11px] uppercase tracking-wider"><span>{label}</span>{meta && <span className="normal-case">{meta}</span>}</div>{children}</div>; }
function IconAction({ label, onClick, d, disabled }) { return <Tooltip label={label}><button onClick={onClick} disabled={disabled} aria-label={label} className="icon-btn !h-7 !w-7 disabled:opacity-40"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg></button></Tooltip>; }
function ToolCard({ title, text, onClick, d, disabled }) { return <button onClick={onClick} disabled={disabled} className="flex w-full items-center gap-3 rounded-xl border border-[var(--line)] bg-[var(--card-2)] p-3 text-left transition-colors hover:border-[var(--brand)] disabled:cursor-not-allowed disabled:opacity-50"><span className="tile"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg></span><span><span className="block text-sm font-semibold">{title}</span><span className="faint block text-xs">{text}</span></span></button>; }

function capText(type, cap) { if (type === 'Audio') return formatSeconds(cap?.audioSeconds || 0); if (type === 'Text') return `${(cap?.textChars || 0).toLocaleString()} characters`; return 'none'; }

function AnalysisList({ label, items = [], onChange, readOnly }) {
  return (
    <div>
      <div className="faint mb-1 text-[11px] uppercase tracking-wider">{label}</div>
      <ul className="space-y-1">{items.map((it, i) => <li key={i} className="flex items-start gap-1.5 text-sm"><span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-[var(--ink-3)]" />{onChange && !readOnly ? <InlineText readOnly={readOnly} value={it} onCommit={(v) => onChange(v.trim() ? items.map((x, j) => (j === i ? v : x)) : items.filter((_, j) => j !== i))} multiline ariaLabel={label} /> : <span>{it}</span>}</li>)}</ul>
      {onChange && !readOnly && <button className="mt-1 text-xs text-[var(--brand)]" onClick={() => onChange([...items, 'New item'])}>Add</button>}
    </div>
  );
}
