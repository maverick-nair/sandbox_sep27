import React, { useEffect, useMemo, useState } from 'react';
import { useGame } from '../engine/GameContext.jsx';
import { TRACES, ERROR_BUCKETS, GOLDEN_SET_SIZE, GOLDEN_COVERAGE_TARGET, CURRENT_PASS_RATE, THRESHOLD_MIN, THRESHOLD_MAX, thresholdTradeoff, CEO_MESSAGES } from '../content/index.js';
import { DnDProvider, Draggable, DropZone, Requirements } from '../components/dnd.jsx';
import { Panel, Button, Tag, Notice, Gauge, inputClass, wordCount } from '../components/ui.jsx';
import { LevelHeader, LevelResult, TeamInputs, teamPenalty, EventCard } from '../components/Shell.jsx';
import { judge, judgeAverage, llmAvailable } from '../engine/llm.js';

export function scoreEvalLab({ classifications, golden, threshold, decision, justification = '', judgeResult, seconds }) {
  const feedback = [];
  // Task 1: classification accuracy with a speed bonus above a 70 percent accuracy floor.
  let correct = 0;
  TRACES.forEach((t) => { if (classifications[t.id] === t.truth) correct += 1; });
  const accuracy = (correct / TRACES.length) * 100;
  let speedBonus = 0;
  if (accuracy >= 70 && seconds < 480) speedBonus = Math.round(Math.max(0, (480 - seconds) / 48));
  const misses = TRACES.filter((t) => classifications[t.id] !== t.truth);
  if (misses.length) feedback.push(`Classification: ${correct}/20. Missed for example ${misses[0].id} (${ERROR_BUCKETS.find((b) => b.id === misses[0].truth).label}): "${misses[0].answer.slice(0, 70)}..."`);

  // Task 2: golden set coverage of failure types.
  const coveredTypes = new Set(golden.map((id) => TRACES.find((t) => t.id === id).truth).filter((tr) => tr !== 'correct'));
  const coverage = GOLDEN_COVERAGE_TARGET.filter((t) => coveredTypes.has(t)).length / GOLDEN_COVERAGE_TARGET.length;
  const correctInGolden = golden.filter((id) => TRACES.find((t) => t.id === id).truth === 'correct').length;
  let goldenScore = coverage * 80;
  if (correctInGolden >= 1 && correctInGolden <= 3) goldenScore += 20; // a regression set needs some known-good anchors
  else if (correctInGolden === 0) feedback.push('Golden set has no correct traces. A regression set needs known-good anchors to detect regressions in behavior that currently works.');
  else feedback.push(`Golden set has ${correctInGolden} correct traces and thin failure coverage. Regression tests earn their keep on failure modes.`);
  const missingTypes = GOLDEN_COVERAGE_TARGET.filter((t) => !coveredTypes.has(t));
  if (missingTypes.length) feedback.push(`Golden set does not cover: ${missingTypes.map((m) => ERROR_BUCKETS.find((b) => b.id === m).label).join(', ')}. Every failure type you found should have at least one regression test.`);

  // Task 3: threshold. Reward a defensible range; penalize extremes.
  const tt = thresholdTradeoff(threshold);
  let thresholdScore;
  if (threshold >= 85 && threshold <= 93) thresholdScore = 100;
  else if (threshold >= 80 && threshold < 85) thresholdScore = 80;
  else if (threshold > 93) thresholdScore = 70;
  else if (threshold >= 72) thresholdScore = 55;
  else thresholdScore = 30;
  if (threshold < 80) feedback.push(`Threshold ${threshold}%: two data leaks and four hallucinations in a 20 trace sample means one in five answers is wrong. Below 80 the incident in Sprint 7 is a matter of time.`);
  if (threshold > 93) feedback.push(`Threshold ${threshold}%: ${tt.weeks} weeks of slip and ${tt.hours} hours. The CEO will ask what the last four points bought. A stronger move: 88 to 92 plus a citation layer that makes the remaining errors visible.`);

  // Task 4: decision and justification (LLM judged, neutral fallback).
  const evidenceBased = judgeResult ? judgeAverage(judgeResult.scores) : 5;
  const decisionScore = evidenceBased * 10;
  const heldOrHighThreshold = decision === 'hold' || threshold >= 85;
  if (decision === 'ship' && threshold < 80) feedback.push('Shipping on a threshold below 80 with the traces you classified is a decision the evidence does not support. Hold, or raise the bar.');
  if (judgeResult?.rationale) feedback.push(`Judge: ${judgeResult.rationale}`);

  const score = Math.round(accuracy * 0.3 + goldenScore * 0.25 + thresholdScore * 0.25 + decisionScore * 0.2 + speedBonus);
  const badges = [];
  if (accuracy >= 85) badges.push('taxonomist');
  if (threshold >= 85 && threshold <= 93 && evidenceBased >= 6) badges.push('threshold_setter');
  const lowThreshold = threshold < 80;
  return {
    score: Math.min(100, score),
    xp: Math.round(Math.min(100, score) * 1.3),
    badges,
    feedback: feedback.slice(0, 6),
    evidenceReferenced: Boolean(judgeResult?.flags?.references_evidence),
    meterDeltas: { reliability: Math.round((thresholdScore - 50) / 4 + (accuracy - 60) / 8), stakeholder: tt.weeks > 4 ? -3 : tt.weeks === 0 ? 2 : 0 },
    currencyDeltas: { hours: -tt.hours },
    flags: { lowThreshold, highThreshold: threshold >= 85, shipped: decision === 'ship', shippedDespiteHold: decision === 'ship' && threshold < 75, threshold, slipWeeks: tt.weeks },
    prdSection: { key: 'evals', value: `Eval summary: ${correct}/20 traces classified correctly against the taxonomy. Golden set of ${golden.length} covering ${coveredTypes.size} failure types. Ship threshold ${threshold}% pass rate (current ${CURRENT_PASS_RATE}%), implying ${tt.weeks} weeks to reach and ${tt.hours} Team Hours. Decision: ${decision.toUpperCase()}. Incident risk estimate ${tt.incidentRisk}%.` },
    detail: { accuracy: Math.round(accuracy), goldenScore: Math.round(goldenScore), thresholdScore, decisionScore: Math.round(decisionScore), speedBonus, judgeResult, heldOrHighThreshold, classifications, golden, threshold, decision, justification },
  };
}

export default function Level3EvalLab() {
  const { state, log, complete, saveDraft } = useGame();
  const done = state.levelStatus[3] === 'complete';
  const draft = (done ? state.levelResults[3]?.detail : state.levelDraft[3]) || {};
  const [task, setTask] = useState(draft.task || 1);
  const [classifications, setClassifications] = useState(draft.classifications || {});
  const [golden, setGolden] = useState(draft.golden || []);
  const [threshold, setThreshold] = useState(draft.threshold || 80);
  const [decision, setDecision] = useState(draft.decision || 'ship');
  const [justification, setJustification] = useState(draft.justification || '');
  const [startedAt] = useState(draft.startedAt || Date.now());
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const finalResult = result || (done ? state.levelResults[3] : null);

  useEffect(() => { saveDraft(3, { task, classifications, golden, threshold, decision, justification, startedAt }); }, [task, classifications, golden, threshold, decision, justification]); // eslint-disable-line

  const unclassified = useMemo(() => TRACES.filter((t) => !classifications[t.id]), [classifications]);
  const onDrop = (traceId, zoneId) => {
    if (finalResult) return;
    const next = { ...classifications };
    if (zoneId === 'tray') delete next[traceId]; else next[traceId] = zoneId;
    setClassifications(next);
  };
  const toggleStar = (id) => {
    if (golden.includes(id)) setGolden(golden.filter((g) => g !== id));
    else if (golden.length < GOLDEN_SET_SIZE) setGolden([...golden, id]);
  };
  const tt = thresholdTradeoff(threshold);
  const ceo = CEO_MESSAGES.find((m) => tt.weeks <= m.maxWeeks) || CEO_MESSAGES[CEO_MESSAGES.length - 1];

  const submit = async () => {
    setBusy(true);
    const seconds = Math.round((Date.now() - startedAt) / 1000);
    const context = TRACES.map((t) => `${t.id} [${ERROR_BUCKETS.find((b) => b.id === t.truth).label}] Q: ${t.question} A: ${t.answer}`).join('\n');
    const judgeResult = await judge({
      task: `The learner decided to ${decision.toUpperCase()} an AI assistant at a ${threshold}% eval pass rate threshold (current pass rate ${CURRENT_PASS_RATE}%). Score their justification.`,
      dimensions: [
        { id: 'evidence', desc: 'References specific traces, failure types or numbers from the eval rather than opinion.' },
        { id: 'tradeoff', desc: 'Names the trade-off between ship date, cost and reliability explicitly.' },
        { id: 'coherence', desc: 'The decision follows from the evidence cited.' },
      ],
      text: justification,
      context,
    });
    const r = scoreEvalLab({ classifications, golden, threshold, decision, justification, judgeResult, seconds });
    if (judgeResult.fallback) r.feedback.push('Judge unavailable for the justification. A neutral score was applied and the call was logged.');
    const penalty = teamPenalty(state, 3);
    if (penalty) r.meterDeltas.stakeholder = (r.meterDeltas.stakeholder || 0) - penalty;
    setResult(r);
    log({ type: 'level-submit', summary: `Eval Lab: ${r.detail.accuracy}% classification, threshold ${threshold}%, ${decision.toUpperCase()}`, score: r.score, judge: judgeResult, text: justification });
    complete(3, r);
    setBusy(false);
  };

  return (
    <div>
      <LevelHeader level={3} />
      <EventCard level={3} />
      <Notice>Twenty traces from the Helios Assist staging build. Classify each into the error taxonomy, pick the eight that become regression tests, set the ship threshold, then decide: ship or hold. Current pass rate on the full 200 trace set is {CURRENT_PASS_RATE}%.</Notice>
      <div className="mt-4">
        <TeamInputs level={3} inputs={[
          { id: 'eng-3', roles: ['eng'], text: 'Engineering Partner: each point of pass rate above 71 costs about 6 Team Hours of retrieval tuning and prompt work. Above 93 we are chasing noise.' },
          { id: 'gov-3', roles: ['gov'], text: 'Governance Liaison: two of the twenty traces leak customer names. Any threshold that tolerates data leaks is a governance finding, not a reliability trade-off.' },
        ]} />
      </div>
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Eval Lab tasks">
        {[1, 2, 3, 4].map((n) => {
          const complete = [Object.keys(classifications).length === TRACES.length, golden.length === GOLDEN_SET_SIZE, true, wordCount(justification) >= 100][n - 1];
          return <button key={n} role="tab" aria-selected={task === n} onClick={() => setTask(n)} className={`rounded border px-3 py-1 text-xs ${task === n ? 'border-amber-400 text-amber-200' : complete ? 'border-amber-500/40 text-zinc-300' : 'border-zinc-700 text-zinc-400'}`}><span aria-hidden className="mr-1 font-mono">{complete ? '[x]' : '[ ]'}</span>Task {n}: {['Classify traces', 'Build golden set', 'Set threshold', 'Ship or hold'][n - 1]}</button>;
        })}
      </div>

      {task === 1 && (
        <DnDProvider onDrop={onDrop}>
          <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
            <DropZone id="tray" label="Unclassified traces" className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
              <div className="mb-2 flex items-center justify-between"><span className="text-xs uppercase tracking-wider text-zinc-400">Trace inspector</span><span className="font-mono text-xs text-zinc-400">{unclassified.length} unclassified</span></div>
              <div className="grid gap-2 md:grid-cols-2">
                {unclassified.map((t) => <TraceCard key={t.id} trace={t} expanded={expanded === t.id} onToggle={() => setExpanded(expanded === t.id ? null : t.id)} disabled={Boolean(finalResult)} />)}
                {unclassified.length === 0 && <p className="text-sm text-zinc-400">All traces classified. Move to Task 2.</p>}
              </div>
            </DropZone>
            <div className="space-y-2">
              {ERROR_BUCKETS.map((b) => {
                const items = TRACES.filter((t) => classifications[t.id] === b.id);
                return (
                  <DropZone key={b.id} id={b.id} label={b.label} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-2.5">
                    <div className="flex items-center justify-between"><span className="text-xs font-medium text-zinc-200">{b.label}</span><span className="font-mono text-xs text-zinc-400">{items.length}</span></div>
                    <p className="text-[11px] text-zinc-400">{b.hint}</p>
                    <div className="mt-1 flex flex-wrap gap-1">{items.map((t) => <Draggable key={t.id} id={t.id} label={`Trace ${t.id}`} disabled={Boolean(finalResult)} className="rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300">{t.id}</Draggable>)}</div>
                  </DropZone>
                );
              })}
            </div>
          </div>
          <p className="mt-2 text-xs text-zinc-400">Drag a trace, or click or tap it and then click or tap a bucket. Keyboard: Enter selects, Tab to a bucket, Enter places. Speed bonus applies above 70 percent accuracy.</p>
        </DnDProvider>
      )}

      {task === 2 && (
        <Panel title="Golden set" subtitle={`Star the ${GOLDEN_SET_SIZE} traces that become regression tests. Scored on coverage of failure types.`} right={<span className="font-mono text-xs text-amber-300">{golden.length}/{GOLDEN_SET_SIZE}</span>}>
          <div className="grid gap-2 md:grid-cols-2">
            {TRACES.map((t) => (
              <button key={t.id} disabled={Boolean(finalResult)} onClick={() => toggleStar(t.id)} aria-pressed={golden.includes(t.id)} className={`rounded border p-2.5 text-left text-xs ${golden.includes(t.id) ? 'border-amber-400 bg-amber-500/10' : 'border-zinc-800 bg-zinc-950'} focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400`}>
                <div className="flex items-center justify-between"><span className="font-mono text-zinc-400">{t.id}</span><span className="text-zinc-400">Your label: {classifications[t.id] ? ERROR_BUCKETS.find((b) => b.id === classifications[t.id]).label : 'none'}</span></div>
                <div className="mt-1 text-zinc-200">{t.question}</div>
                <div className="mt-0.5 text-zinc-400">{t.answer}</div>
              </button>
            ))}
          </div>
        </Panel>
      )}

      {task === 3 && (
        <Panel title="Ship threshold" subtitle="Higher threshold means a later ship date and more Team Hours. The trade-off updates live.">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-zinc-400">Required pass rate: <span className="font-mono text-amber-300">{threshold}%</span></span>
            <input type="range" min={THRESHOLD_MIN} max={THRESHOLD_MAX} value={threshold} disabled={Boolean(finalResult)} onChange={(e) => setThreshold(Number(e.target.value))} className="mt-2 w-full" aria-valuetext={`${threshold} percent`} />
          </label>
          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            <Gauge label="Weeks to reach" value={tt.weeks} max={12} good={tt.weeks <= 6} format={(v) => v.toFixed(1)} />
            <Gauge label="Team hours" value={tt.hours} max={200} good={tt.hours <= state.currencies.hours} />
            <Gauge label="Incident risk in Sprint 7" value={tt.incidentRisk} unit="%" max={50} good={tt.incidentRisk <= 20} />
            <Gauge label="Points above current" value={tt.gap} max={30} />
          </div>
          <div className="mt-4 rounded border border-sky-500/30 bg-sky-500/5 p-3 text-sm text-sky-100">{ceo.text}</div>
          <p className="mt-2 text-xs text-zinc-400">Formula: hours = 6 per point above {CURRENT_PASS_RATE}; weeks = 0.35 per point; incident risk = 100 minus 0.95 times threshold.</p>
        </Panel>
      )}

      {task === 4 && (
        <Panel title="Ship or hold" subtitle="A 100 word justification is required. The judge scores evidence use, not confidence.">
          <div className="flex gap-2">
            {['ship', 'hold'].map((d) => <button key={d} disabled={Boolean(finalResult)} onClick={() => setDecision(d)} className={`rounded border px-4 py-2 text-sm uppercase tracking-wider ${decision === d ? 'border-amber-400 text-amber-200' : 'border-zinc-700 text-zinc-400'}`}>{d}</button>)}
          </div>
          <textarea className={`${inputClass} mt-3 min-h-[140px]`} disabled={Boolean(finalResult)} value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Reference the traces. Which failure types did you find, how many, what does the threshold buy, and why does the decision follow?" />
          <div className="mt-1 flex items-center justify-between text-xs text-zinc-400"><span>{wordCount(justification)} words (100 required)</span><span>{llmAvailable() ? 'LLM judge active' : 'No API key: neutral judge score will be applied'}</span></div>
          {!finalResult && (
            <div className="mt-4 flex flex-wrap items-center justify-end gap-4">
              <Requirements items={[{ label: `Task 1: ${Object.keys(classifications).length}/${TRACES.length} traces classified`, done: Object.keys(classifications).length === TRACES.length }, { label: `Task 2: ${golden.length}/${GOLDEN_SET_SIZE} traces starred`, done: golden.length === GOLDEN_SET_SIZE }, { label: `Task 3: threshold set (${threshold}%)`, done: true }, { label: `Task 4: ${wordCount(justification)}/100 words`, done: wordCount(justification) >= 100 }]} />
              <Button disabled={busy || Object.keys(classifications).length < TRACES.length || golden.length < GOLDEN_SET_SIZE || wordCount(justification) < 100} onClick={submit}>{busy ? 'Scoring...' : 'Submit eval decision'}</Button>
            </div>
          )}
        </Panel>
      )}

      {finalResult && <LevelResult level={3} result={finalResult} replay={done && !result} onContinue={() => window.dispatchEvent(new CustomEvent('lw:next'))} />}
    </div>
  );
}

function TraceCard({ trace, expanded, onToggle, disabled }) {
  return (
    <Draggable id={trace.id} label={`Trace ${trace.id}: ${trace.question}`} disabled={disabled} className="rounded border border-zinc-700 bg-zinc-950 p-2.5 text-xs">
      <div className="flex items-center justify-between"><span className="font-mono text-zinc-400">{trace.id}</span><button type="button" onClick={(e) => { e.stopPropagation(); onToggle(); }} className="text-[11px] text-amber-300 hover:underline">{expanded ? 'Hide context' : 'Inspect'}</button></div>
      <div className="mt-1 text-zinc-100"><span className="text-zinc-400">Q: </span>{trace.question}</div>
      <div className="mt-1 text-zinc-300"><span className="text-zinc-400">A: </span>{trace.answer}</div>
      <div className="mt-1 text-zinc-400">Citation: {trace.citation || 'none'}</div>
      {expanded && <div className="mt-2 rounded border border-zinc-800 bg-zinc-900 p-2 text-zinc-300"><span className="text-zinc-400">Retrieved context: </span>{trace.context}</div>}
    </Draggable>
  );
}
