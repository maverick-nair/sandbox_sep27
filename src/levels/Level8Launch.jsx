import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../engine/GameContext.jsx';
import { DOSSIER_SLOTS, BOARD_QUESTIONS, OUTCOMES, PERSONAS, METER_LABELS } from '../content/index.js';
import { DnDProvider, Draggable, DropZone, Requirements } from '../components/dnd.jsx';
import { Panel, Button, Tag, Notice, inputClass, wordCount } from '../components/ui.jsx';
import { LevelHeader, LevelResult, TeamInputs, teamPenalty, EventCard } from '../components/Shell.jsx';
import { chat, judge, judgeAverage, llmAvailable } from '../engine/llm.js';

export function simulateOutcome(meters) {
  const vals = Object.values(meters);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const min = Math.min(...vals);
  return OUTCOMES.find((o) => avg >= o.minAvg && min >= o.minEach) || OUTCOMES[OUTCOMES.length - 1];
}

export function scoreLaunch({ dossier, prd, answers, judgeResult, meters, weakest }) {
  const feedback = [];
  const filled = DOSSIER_SLOTS.filter((s) => dossier[s.id]);
  const weak = filled.filter((s) => /not met|NOT SIGNED|No scope|none recorded|Decision: SHIP.*Incident risk estimate (2[5-9]|[3-9]\d)/.test(prd[s.prdKey] || ''));
  let dossierScore = Math.round((filled.length / DOSSIER_SLOTS.length) * 40) - weak.length * 4;
  DOSSIER_SLOTS.filter((s) => !dossier[s.id]).forEach((s) => feedback.push(`Dossier is missing ${s.label} (${s.source}). The board notices what is absent before what is present.`));
  weak.forEach((s) => feedback.push(`${s.label} is present but weak: ${(prd[s.prdKey] || '').slice(0, 90)}...`));
  const pitch = judgeResult ? judgeAverage(judgeResult.scores) : 5;
  const pitchScore = Math.round(pitch * 6);
  if (judgeResult?.rationale) feedback.push(`Board judge: ${judgeResult.rationale}`);
  const score = Math.max(0, Math.min(100, dossierScore + pitchScore));
  const projected = { ...meters };
  projected[weakest] = Math.max(0, Math.min(100, projected[weakest] + Math.round((pitch - 5) * 2)));
  const outcome = simulateOutcome(projected);
  const badges = outcome.id === 'full' ? ['full_launch'] : [];
  feedback.unshift(`Launch outcome: ${outcome.label}.`);
  return {
    score,
    xp: Math.round(score * 1.5),
    badges,
    feedback: feedback.slice(0, 7),
    evidenceReferenced: Boolean(judgeResult?.flags?.references_evidence),
    meterDeltas: { [weakest]: Math.round((pitch - 5) * 2), stakeholder: filled.length === DOSSIER_SLOTS.length ? 3 : -3 },
    currencyDeltas: {},
    flags: { outcome: outcome.id, dossierComplete: filled.length === DOSSIER_SLOTS.length },
    detail: { dossier, answers, replies: [], judgeResult, outcome: outcome.id, weakest, filled: filled.length, questions: BOARD_QUESTIONS[weakest] },
  };
}

function useSpeech(onText) {
  const recRef = useRef(null);
  const supported = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
  const [listening, setListening] = useState(false);
  const start = () => {
    if (!supported) return;
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new Rec(); rec.continuous = true; rec.interimResults = false; rec.lang = 'en-US';
    rec.onresult = (e) => { let t = ''; for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript + ' '; onText(t); };
    rec.onend = () => setListening(false);
    rec.start(); recRef.current = rec; setListening(true);
    setTimeout(() => rec.stop(), 180000); // 3 minute cap
  };
  const stop = () => recRef.current?.stop();
  return { supported: Boolean(supported), listening, start, stop };
}

export default function Level8Launch() {
  const { state, log, complete, saveDraft, remember } = useGame();
  const done = state.levelStatus[8] === 'complete';
  const draft = (done ? state.levelResults[8]?.detail : state.levelDraft[8]) || {};
  const [dossier, setDossier] = useState(draft.dossier || {});
  const [stage, setStage] = useState(draft.stage || 'dossier');
  const [answers, setAnswers] = useState(draft.answers || ['', '', '']);
  const [replies, setReplies] = useState(draft.replies || []);
  const [qIndex, setQIndex] = useState(draft.qIndex || 0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const finalResult = result || (done ? state.levelResults[8] : null);
  useEffect(() => { saveDraft(8, { dossier, stage, answers, replies, qIndex }); }, [dossier, stage, answers, replies, qIndex]); // eslint-disable-line

  const weakest = useMemo(() => Object.entries(state.meters).sort((a, b) => a[1] - b[1])[0][0], [state.meters]);
  const questions = BOARD_QUESTIONS[weakest];
  const available = DOSSIER_SLOTS.filter((s) => state.prd[s.prdKey] && !dossier[s.id]);
  const speech = useSpeech((t) => setAnswers((a) => a.map((x, i) => (i === qIndex ? (x + ' ' + t).trim() : x))));

  const onDrop = (artifactId, zoneId) => {
    if (finalResult) return;
    const next = { ...dossier };
    Object.keys(next).forEach((k) => { if (next[k] === artifactId) delete next[k]; });
    if (zoneId !== 'artifacts') next[zoneId] = artifactId;
    setDossier(next);
  };

  const elenaContext = () => {
    const mem = Object.entries(state.personaMemory).filter(([k, v]) => k !== 'elena' && v.length).map(([k, v]) => `${PERSONAS[k].name} (${PERSONAS[k].role}) notes: ${v.join(' | ')}`).join('\n');
    const doss = DOSSIER_SLOTS.map((s) => `${s.label}: ${dossier[s.id] ? state.prd[s.prdKey] : 'MISSING'}`).join('\n');
    return `Weakest readiness meter: ${METER_LABELS[weakest]} at ${state.meters[weakest]}.\nMeters: ${JSON.stringify(state.meters)}.\nLiabilities: ${state.liabilities.map((l) => l.text).join('; ') || 'none'}.\n\nDossier:\n${doss}\n\nStakeholder memory:\n${mem || 'none'}`;
  };

  const answerQuestion = async () => {
    setBusy(true);
    let reply = '';
    if (llmAvailable()) {
      const res = await chat({
        system: PERSONAS.elena.systemPrompt + '\n\nContext:\n' + elenaContext(),
        messages: [
          { role: 'user', content: '(The PM begins the pitch.)' },
          ...replies.flatMap((r, i) => [{ role: 'assistant', content: questions[i] }, { role: 'user', content: answers[i] }, { role: 'assistant', content: r }]),
          { role: 'assistant', content: questions[qIndex] },
          { role: 'user', content: answers[qIndex] },
        ].filter((m, i, arr) => !(i > 0 && arr[i - 1].role === m.role)),
        maxTokens: 220,
      });
      reply = res.ok ? res.text : '';
    }
    if (!reply) reply = qIndex < 2 ? 'Noted. Let me press on a different angle.' : 'Thank you. The board will deliberate.';
    const nextReplies = [...replies, reply];
    setReplies(nextReplies);
    log({ type: 'board-answer', summary: `Board question ${qIndex + 1} answered (${wordCount(answers[qIndex])} words)`, text: answers[qIndex] });
    if (qIndex < 2) setQIndex(qIndex + 1); else await finish(nextReplies);
    setBusy(false);
  };

  const finish = async () => {
    const judgeResult = await judge({
      task: `The learner pitched an AI feature launch to an independent board director. Their weakest readiness area was ${METER_LABELS[weakest]}. Score the three answers as a pitch.`,
      dimensions: [
        { id: 'structure', desc: 'Each answer has a clear claim, evidence and implication.' },
        { id: 'evidence', desc: 'Cites specific numbers or artifacts from the dossier and earlier sprints.' },
        { id: 'candour', desc: 'Acknowledges the weakness directly and says what would be done differently.' },
        { id: 'clarity', desc: 'Concise and free of jargon a board member would not follow.' },
      ],
      text: questions.map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${answers[i]}`).join('\n\n'),
      context: elenaContext(),
    });
    const r = scoreLaunch({ dossier, prd: state.prd, answers, judgeResult, meters: state.meters, weakest });
    r.detail.replies = replies;
    if (judgeResult.fallback) r.feedback.push('Judge unavailable for the pitch. A neutral score was applied and the call was logged.');
    const penalty = teamPenalty(state, 8);
    if (penalty) r.meterDeltas.stakeholder = (r.meterDeltas.stakeholder || 0) - penalty;
    remember('elena', `Board pitch scored ${r.score}. Outcome ${r.detail.outcome}.`);
    setResult(r);
    log({ type: 'level-submit', summary: `Launch: dossier ${r.detail.filled}/7, outcome ${r.detail.outcome}`, score: r.score, judge: judgeResult });
    complete(8, r);
  };

  const outcome = finalResult ? OUTCOMES.find((o) => o.id === finalResult.detail.outcome) : null;

  return (
    <div>
      <LevelHeader level={8} />
      <EventCard level={8} />
      <Notice>Assemble the launch dossier from the artifacts you built, then face Elena Vasquez, Independent Director. She asks three questions drawn from your weakest readiness meter: <span className="text-amber-300">{METER_LABELS[weakest]} ({state.meters[weakest]})</span>. The launch outcome is simulated from all four meters.</Notice>
      <div className="mt-4">
        <TeamInputs level={8} inputs={[
          { id: 'gov-8', roles: ['gov'], text: 'Governance Liaison: the dossier owner checks every slot. A weak artifact flagged by us is better than one flagged by the board.' },
          { id: 'eng-8', roles: ['eng'], text: 'Engineering Partner: if the board asks about the incident, lead with the regression test you added, not the rollback.' },
        ]} />
      </div>
      {state.personaMemory.marcus?.length > 0 && !finalResult && (
        <Panel title="Pre-read from the CFO" className="mb-4" right={<Tag>Persona memory</Tag>}>
          <p className="text-sm text-zinc-200">{PERSONAS.marcus.name} has circulated a note to the board: "In Sprint 5 the PM told me: {state.personaMemory.marcus[state.personaMemory.marcus.length - 1]} I will be listening for whether the numbers in the dossier match."</p>
          {state.flags.grossMargin !== undefined && <p className="mt-1 text-xs text-zinc-400">Your locked margin model says {state.flags.grossMargin}% gross margin at {state.flags.adoption}% adoption.</p>}
        </Panel>
      )}
      {stage === 'dossier' && !finalResult && (
        <DnDProvider onDrop={onDrop}>
          <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
            <DropZone id="artifacts" label="Completed artifacts" className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="mb-2 text-xs uppercase tracking-wider text-zinc-400">Completed artifacts</div>
              <div className="space-y-1.5">
                {available.map((s) => <ArtifactCard key={s.id} slot={s} text={state.prd[s.prdKey]} />)}
                {DOSSIER_SLOTS.filter((s) => !state.prd[s.prdKey]).map((s) => <div key={s.id} className="rounded border border-dashed border-zinc-800 p-2 text-xs text-zinc-500">{s.label}: never produced ({s.source})</div>)}
                {available.length === 0 && DOSSIER_SLOTS.every((s) => !state.prd[s.prdKey] || dossier[s.id]) && <p className="text-xs text-zinc-400">All available artifacts placed.</p>}
              </div>
            </DropZone>
            <div className="grid gap-2 md:grid-cols-2">
              {DOSSIER_SLOTS.map((s) => {
                const art = dossier[s.id] ? DOSSIER_SLOTS.find((x) => x.id === dossier[s.id]) : null;
                const wrong = art && art.id !== s.id;
                return (
                  <DropZone key={s.id} id={s.id} label={`Dossier slot: ${s.label}`} className={`min-h-[96px] rounded-lg border p-3 ${art ? (wrong ? 'border-sky-500/50 bg-sky-500/5' : 'border-amber-500/40 bg-amber-500/5') : 'border-dashed border-zinc-700'}`}>
                    <div className="flex items-center justify-between"><span className="text-sm font-medium text-zinc-100">{s.label}</span><Tag>{s.source}</Tag></div>
                    {art ? <ArtifactCard slot={art} text={state.prd[art.prdKey]} compact /> : <p className="mt-1 text-xs text-zinc-500">Empty. The board will flag it.</p>}
                    {wrong && <p className="mt-1 text-xs text-sky-300">This artifact belongs in a different slot.</p>}
                  </DropZone>
                );
              })}
            </div>
          </div>
          <p className="mt-2 text-xs text-zinc-400">Drag an artifact, or click or tap it and then click or tap a slot. Keyboard: Enter selects, Tab to a slot, Enter places.</p>
          <div className="mt-4 flex flex-wrap items-center justify-end gap-4">
            <Requirements items={[{ label: `${Object.keys(dossier).length}/${DOSSIER_SLOTS.length} dossier slots filled (missing slots are flagged by the board)`, done: Object.keys(dossier).length === DOSSIER_SLOTS.length }]} />
            <Button onClick={() => { setStage('pitch'); log({ type: 'dossier', summary: `Dossier assembled: ${Object.keys(dossier).length}/7 slots` }); }}>Enter the boardroom</Button>
          </div>
        </DnDProvider>
      )}
      {stage === 'pitch' && !finalResult && (
        <Panel title={`${PERSONAS.elena.name}, ${PERSONAS.elena.role}`} subtitle={PERSONAS.elena.brief}>
          <p className="text-sm text-zinc-300">{PERSONAS.elena.opening}</p>
          <div className="mt-4 space-y-4">
            {questions.slice(0, qIndex + 1).map((q, i) => (
              <div key={i} className="rounded border border-zinc-800 p-3">
                <div className="text-xs uppercase tracking-wider text-zinc-400">Question {i + 1} of 3</div>
                <p className="mt-1 text-sm text-zinc-100">{q}</p>
                {i < qIndex ? (
                  <><p className="mt-2 rounded bg-amber-500/10 p-2 text-sm text-amber-50">{answers[i]}</p>{replies[i] && <p className="mt-2 text-sm text-zinc-300">Elena: {replies[i]}</p>}</>
                ) : (
                  <>
                    <textarea className={`${inputClass} mt-2 min-h-[110px]`} value={answers[i]} onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} placeholder="Claim, evidence, implication. Reference the dossier." aria-label={`Answer to question ${i + 1}`} />
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                      <Requirements items={[{ label: `${wordCount(answers[i])}/40 words`, done: wordCount(answers[i]) >= 40 }, { label: llmAvailable() ? 'Elena responds live' : 'No API key: scripted acknowledgements', done: true }]} />
                      <div className="flex gap-2">
                        {speech.supported && <Button size="sm" variant="secondary" onClick={speech.listening ? speech.stop : speech.start}>{speech.listening ? 'Stop recording' : 'Speak (3 min cap)'}</Button>}
                        <Button size="sm" disabled={busy || wordCount(answers[i]) < 40} onClick={answerQuestion}>{busy ? 'Waiting...' : i < 2 ? 'Answer' : 'Answer and close the pitch'}</Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}
      {finalResult && outcome && (
        <>
          <Panel title="One quarter later" className="border-amber-500/40" right={<Tag tone={outcome.id === 'full' ? 'amber' : 'sky'}>{outcome.label}</Tag>}>
            <p className="text-sm text-zinc-100">{outcome.narrative}</p>
          </Panel>
          <Panel title="Your board pitch" className="mt-4" subtitle={`Questions drawn from your weakest meter: ${METER_LABELS[finalResult.detail.weakest]}`}>
            <ol className="space-y-3 text-sm">
              {(finalResult.detail.questions || questions).map((q, i) => <li key={i}><div className="text-zinc-300">{q}</div><div className="mt-1 rounded bg-amber-500/10 p-2 text-amber-50">{finalResult.detail.answers?.[i] || ''}</div>{finalResult.detail.replies?.[i] && <div className="mt-1 text-xs text-zinc-400">Elena: {finalResult.detail.replies[i]}</div>}</li>)}
            </ol>
            <p className="mt-2 text-xs text-zinc-400">Dossier: {finalResult.detail.filled}/{DOSSIER_SLOTS.length} slots filled.</p>
          </Panel>
          <LevelResult level={8} result={finalResult} replay={done && !result} onContinue={() => window.dispatchEvent(new CustomEvent('lw:next'))} />
        </>
      )}
    </div>
  );
}

function ArtifactCard({ slot, text, compact }) {
  return (
    <Draggable id={slot.id} label={`${slot.label} artifact`} className={`rounded border border-zinc-700 bg-zinc-950 ${compact ? 'mt-2 p-2 text-[11px]' : 'p-2 text-xs'}`}>
      <div className="font-medium text-zinc-100">{slot.label} <span className="text-zinc-400">({slot.source})</span></div>
      <p className={`mt-0.5 text-zinc-400 ${compact ? 'line-clamp-2' : 'line-clamp-3'}`}>{text}</p>
    </Draggable>
  );
}
