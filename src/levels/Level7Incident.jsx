import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '../engine/GameContext.jsx';
import { INCIDENT_SECONDS, ALERT, WAVES, computeSeverity, METER_LABELS } from '../content/index.js';
import { Panel, Button, Tag, Notice, inputClass } from '../components/ui.jsx';
import { LevelHeader, LevelResult, TeamInputs, teamPenalty, EventCard } from '../components/Shell.jsx';
import { judge, judgeAverage, llmAvailable } from '../engine/llm.js';

const ALL_CARDS = WAVES.flatMap((w) => w.cards.map((c) => ({ ...c, wave: w.id })));

export function scoreIncident({ taken, comms, judgeResult, severity, liabilities, secondsLeft }) {
  const feedback = [];
  const cards = taken.map((id) => ALL_CARDS.find((c) => c.id === id)).filter(Boolean);
  const good = cards.filter((c) => c.good);
  const bad = cards.filter((c) => !c.good);
  // Sequence: good cards should be taken in non-decreasing order value.
  let sequenceErrors = 0;
  for (let i = 1; i < good.length; i++) if (good[i].order < good[i - 1].order) sequenceErrors += 1;
  const sequenceCorrect = sequenceErrors === 0 && good.length >= 5;
  let score = good.length * 9 - bad.length * 12 - sequenceErrors * 6;
  if (taken.includes('kill') && severity < 4) feedback.push('Killing the feature at this severity destroyed the value along with the harm. A rollback to the golden set release fixes the class of error while keeping the feature alive.');
  if (taken.includes('kill') && severity >= 4) { score += 8; feedback.push('At this severity, killing the feature was defensible. The shortcuts that got you here are the real postmortem.'); }
  if (!taken.includes('rollback') && !taken.includes('kill')) feedback.push('Neither rolled back nor killed. The wrong answer kept shipping while you communicated about it.');
  if (!taken.includes('notify')) feedback.push('Affected customers were not notified. If it surfaces later, trust is gone for all 2,400 accounts.');
  if (taken.includes('notify') && !taken.includes('pull_logs')) feedback.push('You notified customers before pulling the logs. Evidence before narrative: you do not yet know how many customers received the wrong answer.');
  if (sequenceErrors) feedback.push(`${sequenceErrors} sequencing error(s). Roll back, restrict, pull logs, brief Legal and the CEO, then notify customers.`);
  const comm = judgeResult ? judgeAverage(judgeResult.scores) : 5;
  score += comm * 4;
  if (judgeResult?.rationale) feedback.push(`Judge on the customer communication: ${judgeResult.rationale}`);
  if (secondsLeft <= 0) feedback.push('The clock ran out. Whatever was undecided at six minutes stayed undecided in front of the customer.');
  const severityPenalty = (severity - 1) * 4 + liabilities.length * 3;
  score -= severityPenalty;
  if (severityPenalty) feedback.unshift(`Severity ${severity} of 5 and ${liabilities.length} liability card(s) cost ${severityPenalty} points before you made a single decision. That is the price of earlier shortcuts.`);
  score = Math.max(0, Math.min(100, Math.round(score)));
  const honestPostmortem = comm >= 7;
  const badges = [];
  if (honestPostmortem) badges.push('honest_postmortem');
  if (sequenceCorrect && bad.length === 0) badges.push('calm_under_fire');
  // Recalculate meters: card effects, scaled for severity.
  const meterDeltas = { commercial: 0, reliability: 0, governance: 0, stakeholder: 0 };
  cards.forEach((c) => Object.entries(c.effects).forEach(([k, v]) => { meterDeltas[k] += v < 0 ? Math.round(v * (1 + severity * 0.2)) : v; }));
  meterDeltas.stakeholder -= (severity - 1) * 3 + liabilities.length * 3;
  meterDeltas.reliability -= (severity - 1) * 2;
  meterDeltas.commercial -= severity >= 3 ? 4 : 1;
  if (honestPostmortem) meterDeltas.stakeholder += 4;
  return {
    score,
    xp: Math.round(score * 1.4),
    badges,
    feedback: feedback.slice(0, 7),
    evidenceReferenced: Boolean(judgeResult?.flags?.references_evidence),
    meterDeltas,
    currencyDeltas: { capital: taken.includes('brief_ceo') ? 3 : -5, hours: -30 },
    flags: { honestPostmortem, postmortemJudged: Boolean(judgeResult && !judgeResult.fallback), sequenceCorrect, incidentSeverity: severity, killedFeature: taken.includes('kill') },
    prdSection: { key: 'postmortem', value: `Incident postmortem: severity ${severity}/5 (${liabilities.length} liability cards). Actions taken in order: ${cards.map((c) => c.label).join(' > ') || 'none'}. Customer communication: "${comms}"` },
    detail: { taken, comms, judgeResult, severity, sequenceErrors, secondsLeft },
  };
}

export default function Level7Incident() {
  const { state, log, complete, saveDraft } = useGame();
  const draft = state.levelDraft[7] || {};
  const [started, setStarted] = useState(draft.started || false);
  const [deadline, setDeadline] = useState(draft.deadline || null);
  const [now, setNow] = useState(Date.now());
  const [taken, setTaken] = useState(draft.taken || []);
  const [comms, setComms] = useState(draft.comms || '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const submittedRef = useRef(false);
  const done = state.levelStatus[7] === 'complete';
  const finalResult = result || (done ? state.levelResults[7] : null);
  const { severity, reasons } = computeSeverity(state.flags);
  const effectiveSeverity = Math.min(5, severity + (state.liabilities.length ? 1 : 0));

  useEffect(() => { saveDraft(7, { started, deadline, taken, comms }); }, [started, deadline, taken, comms]); // eslint-disable-line
  useEffect(() => {
    if (!started || finalResult) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [started, finalResult]);
  const secondsLeft = deadline ? Math.max(0, Math.round((deadline - now) / 1000)) : INCIDENT_SECONDS;
  useEffect(() => { if (started && secondsLeft <= 0 && !finalResult && !submittedRef.current) submit(); }, [secondsLeft]); // eslint-disable-line

  const start = () => { setStarted(true); setDeadline(Date.now() + INCIDENT_SECONDS * 1000); log({ type: 'incident', summary: `Incident acknowledged. Severity ${effectiveSeverity}/5`, detail: reasons.join(' ') }); };
  const waveVisible = (waveId) => waveId === 1 || WAVES.find((w) => w.id === waveId - 1).cards.some((c) => taken.includes(c.id));
  const take = (card) => {
    if (finalResult || taken.includes(card.id)) return;
    const excludedBy = ALL_CARDS.filter((c) => taken.includes(c.id) && (c.excludes?.includes(card.id) || card.excludes?.includes(c.id)));
    if (excludedBy.length) return;
    setTaken([...taken, card.id]);
    log({ type: 'incident-decision', summary: `${card.label} (${secondsLeft}s left)` });
  };
  const sentences = (comms.match(/[^.!?]+[.!?]+/g) || []).length;

  const submit = async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setBusy(true);
    const judgeResult = comms.trim().length > 20 ? await judge({
      task: 'Score a four sentence customer communication sent after an AI assistant gave a Tier 1 customer a false contract renewal statement (claimed a 30 percent uplift that does not exist).',
      dimensions: [
        { id: 'honesty', desc: 'States plainly that the assistant gave incorrect information, without euphemism.' },
        { id: 'specificity', desc: 'Says exactly what was wrong and what is true.' },
        { id: 'no_blame', desc: 'Does not shift blame to the vendor, the model, the customer or a third party.' },
        { id: 'remediation', desc: 'Names a concrete remediation and when the customer will hear next.' },
      ],
      text: comms,
      context: `Actions taken: ${taken.join(', ') || 'none'}.`,
    }) : { ok: false, scores: { honesty: 2, specificity: 2, no_blame: 5, remediation: 2 }, rationale: 'No communication was drafted before the clock ran out.', flags: {}, fallback: false };
    const r = scoreIncident({ taken, comms, judgeResult, severity: effectiveSeverity, liabilities: state.liabilities, secondsLeft });
    if (judgeResult.fallback) r.feedback.push('Judge unavailable for the communication. A neutral score was applied and the call was logged.');
    const penalty = teamPenalty(state, 7);
    if (penalty) r.meterDeltas.stakeholder = (r.meterDeltas.stakeholder || 0) - penalty;
    setResult(r);
    log({ type: 'level-submit', summary: `Incident closed: ${taken.length} actions, severity ${effectiveSeverity}`, score: r.score, judge: judgeResult, text: comms });
    complete(7, r);
    setBusy(false);
  };

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  return (
    <div>
      <LevelHeader level={7} />
      <EventCard level={7} />
      {!started && !finalResult && (
        <Panel title="Incoming alert" className="border-sky-500/50">
          <p className="text-base text-zinc-100">{ALERT}</p>
          <p className="mt-2 text-sm text-zinc-400">Six minutes on the clock once you acknowledge. Decision cards arrive in waves. Some exclude each other. Some are right only in a specific order. A four sentence customer communication is required.</p>
          <div className="mt-3">
            <TeamInputs level={7} inputs={[
              { id: 'eng-7', roles: ['eng'], text: 'Engineering Partner: the last golden set release is 40 minutes from deployable. Rolling back does not lose data.' },
              { id: 'gov-7', roles: ['gov'], text: 'Governance Liaison: a false contractual statement to a customer is a Legal matter before it is a PR matter. Brief Legal before anything goes external.' },
            ]} />
          </div>
          <div className="mt-3 flex justify-end"><Button variant="danger" onClick={start}>Acknowledge alert and start the clock</Button></div>
        </Panel>
      )}
      {(started || finalResult) && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-sky-500/40 bg-sky-500/5 p-3">
            <div>
              <div className="text-xs uppercase tracking-wider text-sky-300">Incident clock</div>
              <div className={`font-mono text-4xl ${secondsLeft < 60 ? 'text-sky-300' : 'text-zinc-100'}`} aria-live="off">{finalResult ? '00:00' : `${mm}:${ss}`}</div>
            </div>
            <div className="max-w-xl">
              <div className="flex items-center gap-2"><Tag tone="sky">Severity {effectiveSeverity}/5</Tag>{state.liabilities.map((l) => <Tag key={l.id} tone="sky">Liability: {l.text}</Tag>)}</div>
              <ul className="mt-1 text-xs text-zinc-400">{reasons.map((r, i) => <li key={i}>{r}</li>)}{reasons.length === 0 && <li>No earlier shortcuts detected. Base severity.</li>}</ul>
            </div>
          </div>
          <Notice tone="sky">{ALERT}</Notice>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {WAVES.map((w) => (
              <Panel key={w.id} title={`Wave ${w.id}: ${w.title}`} className={waveVisible(w.id) ? '' : 'opacity-40'}>
                {!waveVisible(w.id) && <p className="text-xs text-zinc-500">Unlocks after a decision in the previous wave.</p>}
                {waveVisible(w.id) && (
                  <div className="space-y-2">
                    {w.cards.map((c) => {
                      const isTaken = taken.includes(c.id);
                      const excluded = !isTaken && ALL_CARDS.some((o) => taken.includes(o.id) && (o.excludes?.includes(c.id) || c.excludes?.includes(o.id)));
                      return (
                        <button key={c.id} disabled={Boolean(finalResult) || isTaken || excluded} onClick={() => take(c)} className={`w-full rounded border p-2.5 text-left text-xs ${isTaken ? 'border-amber-400 bg-amber-500/10' : excluded ? 'border-zinc-800 opacity-40' : 'border-zinc-700 bg-zinc-950 hover:border-zinc-500'} focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400`}>
                          <div className="flex items-center justify-between"><span className="font-medium text-zinc-100">{c.label}</span>{isTaken && <Tag tone="amber">#{taken.indexOf(c.id) + 1}</Tag>}{excluded && <Tag>Excluded</Tag>}</div>
                          <p className="mt-0.5 text-zinc-400">{c.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </Panel>
            ))}
          </div>
          <Panel title="Customer communication" subtitle="Four sentences to the affected customer. Judged for honesty, specificity, absence of blame-shifting and a concrete remediation." className="mt-4">
            <textarea className={`${inputClass} min-h-[110px]`} disabled={Boolean(finalResult)} value={comms} onChange={(e) => setComms(e.target.value)} placeholder="Sentence 1: what happened. Sentence 2: what is true. Sentence 3: what we are doing. Sentence 4: when you will hear from us." />
            <div className="mt-1 flex justify-between text-xs text-zinc-500"><span>{sentences} sentences (4 required)</span><span>{llmAvailable() ? 'LLM judge active' : 'No API key: neutral judge score will be applied'}</span></div>
          </Panel>
          {!finalResult && <div className="mt-4 flex justify-end"><Button disabled={busy || taken.length === 0 || sentences < 4} onClick={submit}>{busy ? 'Scoring...' : 'Close the incident'}</Button></div>}
        </>
      )}
      {finalResult && (
        <>
          <Panel title="Meters recalculated" className="mt-4">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{Object.entries(finalResult.meterDeltas).map(([k, v]) => <div key={k} className="rounded border border-zinc-800 p-2"><div className="text-[10px] uppercase tracking-wider text-zinc-500">{METER_LABELS[k]}</div><div className={`font-mono text-xl ${v >= 0 ? 'text-amber-300' : 'text-sky-300'}`}>{v > 0 ? '+' : ''}{v}</div></div>)}</div>
          </Panel>
          <LevelResult level={7} result={finalResult} onContinue={() => window.dispatchEvent(new CustomEvent('lw:next'))} />
        </>
      )}
    </div>
  );
}
