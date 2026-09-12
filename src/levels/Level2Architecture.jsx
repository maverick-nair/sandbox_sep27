import React, { useEffect, useMemo, useState } from 'react';
import { useGame } from '../engine/GameContext.jsx';
import { COMPONENTS, TARGET_ENVELOPE, computeGauges } from '../content/index.js';
import { DnDProvider, Draggable, DropZone } from '../components/dnd.jsx';
import { Panel, Button, Tag, Notice, Gauge } from '../components/ui.jsx';
import { LevelHeader, LevelResult, TeamInputs, teamPenalty } from '../components/Shell.jsx';

const SLOT_COUNT = 9;

export function scoreArchitecture({ placed }) {
  const g = computeGauges(placed);
  const has = (id) => placed.includes(id);
  const feedback = [];
  let score = 0;
  score += g.cost <= TARGET_ENVELOPE.costPer1k ? 30 : Math.max(0, Math.round(30 * (TARGET_ENVELOPE.costPer1k / g.cost)));
  score += g.latency <= TARGET_ENVELOPE.p95Seconds ? 25 : Math.max(0, Math.round(25 * (TARGET_ENVELOPE.p95Seconds / g.latency)));
  score += g.quality >= TARGET_ENVELOPE.quality ? 30 : Math.max(0, Math.round(30 * (g.quality / TARGET_ENVELOPE.quality)));
  if (has('citation_layer')) score += 5; else feedback.push('No citation layer. It costs 0.02 per 1k and makes every wrong answer checkable. Its absence raises the severity of the Sprint 7 incident.');
  if (has('guardrail_filter')) score += 5; else feedback.push('No guardrail filter. The CISO will ask about prompt injection in Sprint 5.');
  if (has('retrieval_index') && has('embedding_model')) score += 5; else feedback.push('Without retrieval plus an embedding model the assistant answers from memory. That is where hallucinated renewal terms come from.');
  if (has('fine_tuned_adapter')) feedback.push('Fine-tuned adapter: quality is up, but the 250,000 fixed cost and six week delay follow you into Sprint 4 as an 18,000 monthly line.');
  if (has('human_review')) feedback.push('Human review on every query makes p95 latency unusable. Reserve it for high stakes actions in Sprint 6.');
  if (g.models.length !== 1) feedback.push('The pipeline needs exactly one generation model. Routing across models is a Sprint 4 decision.');
  if (g.cost > TARGET_ENVELOPE.costPer1k) feedback.push(`Cost ${g.cost} per 1k is above the ${TARGET_ENVELOPE.costPer1k} target. A mid-tier model with retrieval and a cache meets the envelope.`);
  if (g.latency > TARGET_ENVELOPE.p95Seconds) feedback.push(`p95 ${g.latency}s is above the ${TARGET_ENVELOPE.p95Seconds}s target.`);
  if (g.quality < TARGET_ENVELOPE.quality) feedback.push(`Quality ${g.quality} is below ${TARGET_ENVELOPE.quality}. Retrieval with an embedding model adds 10 points for 0.05 per 1k.`);
  score = Math.min(100, score);
  const badges = g.meets ? ['envelope_engineer'] : [];
  const desc = placed.filter(Boolean).map((id) => COMPONENTS.find((c) => c.id === id)?.label).join(' > ');
  return {
    score,
    xp: Math.round(score * 1.2),
    badges,
    feedback: feedback.slice(0, 6),
    meterDeltas: { reliability: Math.round((score - 50) / 4) + (has('citation_layer') ? 3 : -3) + (has('guardrail_filter') ? 2 : 0), commercial: g.cost <= TARGET_ENVELOPE.costPer1k ? 4 : -4 },
    currencyDeltas: { compute: has('fine_tuned_adapter') ? -25 : -5, hours: has('fine_tuned_adapter') ? -60 : -20 },
    flags: { skippedCitationLayer: !has('citation_layer'), fineTuneTrap: has('fine_tuned_adapter'), noGuardrail: !has('guardrail_filter'), envelopeMet: g.meets },
    prdSection: { key: 'technical', value: `Technical requirements: pipeline ${desc}. Cost ${g.cost} per 1k queries (target under ${TARGET_ENVELOPE.costPer1k}), p95 ${g.latency}s (target under ${TARGET_ENVELOPE.p95Seconds}s), expected quality ${g.quality} (target above ${TARGET_ENVELOPE.quality}). Envelope ${g.meets ? 'met' : 'not met'}.` },
    detail: { ...g, placed },
  };
}

export default function Level2Architecture() {
  const { state, log, complete, saveDraft } = useGame();
  const draft = state.levelDraft[2] || {};
  const [placed, setPlaced] = useState(draft.placed || ['user_prompt', ...Array(SLOT_COUNT - 1).fill(null)]);
  const [result, setResult] = useState(null);
  const done = state.levelStatus[2] === 'complete';
  const finalResult = result || (done ? state.levelResults[2] : null);
  useEffect(() => { saveDraft(2, { placed }); }, [placed]); // eslint-disable-line
  const gauges = useMemo(() => computeGauges(placed), [placed]);
  const palette = COMPONENTS.filter((c) => !c.required && !placed.includes(c.id));

  const onDrop = (itemId, zoneId) => {
    if (finalResult) return;
    if (zoneId === 'palette') { setPlaced(placed.map((p) => (p === itemId ? null : p))); return; }
    const idx = Number(zoneId.replace('slot-', ''));
    if (Number.isNaN(idx) || idx === 0) return;
    const next = placed.map((p) => (p === itemId ? null : p));
    next[idx] = itemId;
    setPlaced(next);
  };

  const submit = () => {
    const r = scoreArchitecture({ placed });
    const penalty = teamPenalty(state, 2);
    if (penalty) r.meterDeltas.stakeholder = (r.meterDeltas.stakeholder || 0) - penalty;
    setResult(r);
    log({ type: 'level-submit', summary: `Architecture: ${r.detail.cost}/1k, ${r.detail.latency}s, quality ${r.detail.quality}, envelope ${r.detail.meets ? 'met' : 'missed'}${r.flags.fineTuneTrap ? ', fine-tune adapter chosen' : ''}`, score: r.score });
    complete(2, r);
  };

  return (
    <div>
      <LevelHeader level={2} />
      <Notice>The CTO has set the envelope for Helios Assist: under {TARGET_ENVELOPE.costPer1k} USD per 1,000 queries, under {TARGET_ENVELOPE.p95Seconds} seconds p95, expected quality above {TARGET_ENVELOPE.quality}. Drag components into the pipeline in order. Gauges follow a published formula. Multiple valid designs exist.</Notice>
      <div className="mt-4">
        <TeamInputs level={2} inputs={[
          { id: 'eng-2', roles: ['eng'], text: 'Engineering Partner: retrieval without an embedding model is a keyword index and earns nothing. The cache pays for itself on FAQ traffic. Fine-tuning needs six weeks we do not have.' },
          { id: 'gov-2', roles: ['gov'], text: 'Governance Liaison: a guardrail filter and citation layer are the two components Legal and Security will ask about by name.' },
        ]} />
      </div>
      <DnDProvider onDrop={onDrop}>
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <DropZone id="palette" label="Component palette" className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="mb-2 text-xs uppercase tracking-wider text-zinc-400">Component palette</div>
            <div className="space-y-1.5">
              {palette.map((c) => (
                <Draggable key={c.id} id={c.id} label={c.label} disabled={Boolean(finalResult)} className="rounded border border-zinc-700 bg-zinc-950 p-2 text-xs">
                  <div className="flex items-center justify-between"><span className="font-medium text-zinc-100">{c.label}</span><Tag>{c.kind}</Tag></div>
                  <div className="mt-0.5 font-mono text-[10px] text-zinc-500">{c.cost.toFixed(2)}/1k | {c.latency}s | q{c.quality > 0 ? '+' : ''}{c.quality}{c.multiplier ? ' | x0.7 cost and latency' : ''}</div>
                  <div className="text-[11px] text-zinc-400">{c.desc}</div>
                </Draggable>
              ))}
            </div>
          </DropZone>
          <div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="mb-2 text-xs uppercase tracking-wider text-zinc-400">Pipeline canvas (request flows left to right)</div>
              <div className="flex flex-wrap items-stretch gap-2">
                {placed.map((id, i) => {
                  const c = id ? COMPONENTS.find((x) => x.id === id) : null;
                  return (
                    <React.Fragment key={i}>
                      <DropZone id={`slot-${i}`} label={`Pipeline slot ${i + 1}${c ? `, holds ${c.label}` : ', empty'}`} className={`flex min-h-[84px] w-[132px] items-center justify-center rounded border p-2 text-center text-xs ${c ? 'border-amber-500/40 bg-amber-500/5' : 'border-dashed border-zinc-700'}`}>
                        {c ? (i === 0 ? <span className="text-zinc-200">{c.label}</span> : <Draggable id={c.id} label={c.label} disabled={Boolean(finalResult)} className="w-full rounded bg-zinc-950 p-1.5 text-zinc-100">{c.label}</Draggable>) : <span className="text-zinc-600">Slot {i + 1}</span>}
                      </DropZone>
                      {i < placed.length - 1 && <span className="self-center text-zinc-600" aria-hidden>&gt;</span>}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Gauge label="Cost per 1k queries" value={gauges.cost} unit=" USD" max={1.5} good={gauges.cost <= TARGET_ENVELOPE.costPer1k} target={TARGET_ENVELOPE.costPer1k} targetLabel={`under ${TARGET_ENVELOPE.costPer1k} USD`} format={(v) => v.toFixed(2)} />
              <Gauge label="p95 latency" value={Math.min(gauges.latency, 99)} unit=" s" max={6} good={gauges.latency <= TARGET_ENVELOPE.p95Seconds} target={TARGET_ENVELOPE.p95Seconds} targetLabel={`under ${TARGET_ENVELOPE.p95Seconds} s`} format={(v) => (gauges.latency > 99 ? '>99' : v.toFixed(2))} />
              <Gauge label="Expected quality" value={gauges.quality} max={100} good={gauges.quality >= TARGET_ENVELOPE.quality} target={TARGET_ENVELOPE.quality} targetLabel={`above ${TARGET_ENVELOPE.quality}`} />
            </div>
            <Panel title="Formula" className="mt-3">
              <p className="text-xs text-zinc-400">Cost and latency are the sum of component values, multiplied by 0.7 if a response cache is present. Quality is the model base plus component bonuses, capped at 100. The retrieval index earns its bonus only with an embedding model; the reranker only with a retrieval index. The fine-tuned adapter adds 0.10 per 1k of amortized fixed cost.</p>
              {gauges.notes.length > 0 && <ul className="mt-2 space-y-1 text-xs text-sky-300">{gauges.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
            </Panel>
          </div>
        </div>
      </DnDProvider>
      <p className="mt-2 text-xs text-zinc-500">Keyboard: Enter selects a component, Tab to a slot, Enter places it. Placing a component in the palette removes it from the pipeline.</p>
      {!finalResult && (
        <div className="mt-4 flex items-center justify-end gap-3">
          <span className="text-xs text-zinc-500">{gauges.meets ? 'Envelope met.' : 'Envelope not met. You can still submit; the score and the PRD will say so.'}</span>
          <Button disabled={gauges.models.length === 0} onClick={submit}>Commit the architecture</Button>
        </div>
      )}
      {finalResult && <LevelResult level={2} result={finalResult} onContinue={() => window.dispatchEvent(new CustomEvent('lw:next'))} />}
    </div>
  );
}
