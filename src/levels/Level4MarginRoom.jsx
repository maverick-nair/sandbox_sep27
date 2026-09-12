import React, { useEffect, useMemo, useState } from 'react';
import { useGame } from '../engine/GameContext.jsx';
import { QUERY_TYPES, MODEL_TIERS, PRICING_MODELS, PASS_CONDITION, VENDOR_EVENT, computePnL, effectiveQuality, effectivePricePer1k } from '../content/index.js';
import { DnDProvider, Draggable, DropZone } from '../components/dnd.jsx';
import { Panel, Button, Tag, Notice, Gauge, inputClass, wordCount, StatRow } from '../components/ui.jsx';
import { LevelHeader, LevelResult, TeamInputs, EventCard } from '../components/Shell.jsx';
import { judge, judgeAverage, llmAvailable } from '../engine/llm.js';

export function scoreMargin({ routing, pricingModel, pricePoint, pnl, vendorChoice, judgeResult, fineTuneTrap }) {
  const feedback = [];
  let score = 0;
  const marginPass = pnl.grossMargin >= PASS_CONDITION.grossMargin;
  const adoptionPass = pnl.adoption >= PASS_CONDITION.adoption;
  score += marginPass ? 40 : Math.max(0, Math.round((pnl.grossMargin / PASS_CONDITION.grossMargin) * 40));
  score += adoptionPass ? 25 : Math.max(0, Math.round((pnl.adoption / PASS_CONDITION.adoption) * 25));
  // Routing discipline: complex queries on capable tiers, simple ones on cheap tiers, sensitive to human or frontier.
  const frontierShare = QUERY_TYPES.filter((q) => routing[q.id] === 'frontier').reduce((a, q) => a + q.share, 0);
  const cheapSimple = ['faq', 'summary', 'lookup'].filter((id) => ['small', 'cached', 'mid'].includes(routing[id])).length;
  let routingScore = cheapSimple * 5;
  if (routing.hr === 'human' || routing.hr === 'frontier') routingScore += 5; else feedback.push('Sensitive HR queries on a cheap tier without a human path. Governance will surface this in Sprint 5, and it is the kind of answer that ends up on LinkedIn in Sprint 7.');
  if (frontierShare > 0.5) feedback.push(`${Math.round(frontierShare * 100)}% of traffic on the frontier model. Routing, not pricing, is the margin lever: FAQ and summarization do not need it.`);
  score += Math.min(20, routingScore);
  // Vendor event: reasoning scored by judge; hedging earns a deterministic bonus.
  const reasoning = judgeResult ? judgeAverage(judgeResult.scores) : 5;
  score += Math.round(reasoning * 1.0);
  if (vendorChoice === 'hedge') score += 5;
  if (vendorChoice === 'reroute') feedback.push('Re-routing on an announcement rather than a contract is a bet on the market. A hedge (pilot slice plus negotiation) captures most of the upside with none of the exposure.');
  if (!marginPass) feedback.push(`Gross margin ${pnl.grossMargin}% is below the ${PASS_CONDITION.grossMargin}% floor. Move FAQ and summarization to the small or cached tier before touching price.`);
  if (!adoptionPass) feedback.push(`Adoption forecast ${pnl.adoption}% is under the ${PASS_CONDITION.adoption}% floor. Price is suppressing uptake or quality on complex queries is too low.`);
  if (fineTuneTrap) feedback.push('The fine-tuned adapter from Sprint 2 adds 18,000 a month of hosting and maintenance to the cost line.');
  if (judgeResult?.rationale) feedback.push(`Judge: ${judgeResult.rationale}`);
  const badges = [];
  if (marginPass && adoptionPass && frontierShare <= 0.25) badges.push('margin_hawk');
  score = Math.min(100, score);
  return {
    score,
    xp: Math.round(score * 1.3),
    badges,
    feedback: feedback.slice(0, 6),
    evidenceReferenced: Boolean(judgeResult?.flags?.references_evidence),
    meterDeltas: { commercial: Math.round((score - 50) / 3), governance: routing.hr === 'human' ? 2 : routing.hr === 'frontier' ? 0 : -4 },
    currencyDeltas: { compute: marginPass ? 0 : -10 },
    flags: { marginHawk: badges.includes('margin_hawk'), grossMargin: pnl.grossMargin, adoption: pnl.adoption, hrUnprotected: !(routing.hr === 'human' || routing.hr === 'frontier'), vendorChoice },
    prdSection: { key: 'margin', value: `Margin model: gross margin ${pnl.grossMargin}% at ${pnl.adoption}% adoption. Pricing: ${PRICING_MODELS.find((p) => p.id === pricingModel).label} at ${pricePoint} ${PRICING_MODELS.find((p) => p.id === pricingModel).unit}. Monthly revenue ${pnl.revenue.toLocaleString()} USD against inference cost ${pnl.cost.toLocaleString()} USD. Routing: ${QUERY_TYPES.map((q) => `${q.label} to ${MODEL_TIERS.find((t) => t.id === routing[q.id])?.label}`).join('; ')}. Vendor price cut response: ${vendorChoice}.` },
    detail: { pnl, routing, pricingModel, pricePoint, vendorChoice, judgeResult },
  };
}

export default function Level4MarginRoom() {
  const { state, log, complete, saveDraft } = useGame();
  const draft = state.levelDraft[4] || {};
  const [routing, setRouting] = useState(draft.routing || {});
  const [pricingModel, setPricingModel] = useState(draft.pricingModel || 'seat');
  const [pricePoint, setPricePoint] = useState(draft.pricePoint ?? 8);
  const [vendorChoice, setVendorChoice] = useState(draft.vendorChoice || null);
  const [vendorReason, setVendorReason] = useState(draft.vendorReason || '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const done = state.levelStatus[4] === 'complete';
  const finalResult = result || (done ? state.levelResults[4] : null);
  const fineTuneTrap = Boolean(state.flags.fineTuneTrap);

  useEffect(() => { saveDraft(4, { routing, pricingModel, pricePoint, vendorChoice, vendorReason }); }, [routing, pricingModel, pricePoint, vendorChoice, vendorReason]); // eslint-disable-line

  const pnl = useMemo(() => computePnL({ routing, pricingModel, pricePoint, fineTuneTrap }), [routing, pricingModel, pricePoint, fineTuneTrap]);
  const routedCount = Object.keys(routing).length;
  const eventUnlocked = routedCount >= 3; // midway injection
  const pm = PRICING_MODELS.find((p) => p.id === pricingModel);

  const onDrop = (queryId, tierId) => {
    if (finalResult) return;
    const next = { ...routing };
    if (tierId === 'unrouted') delete next[queryId]; else next[queryId] = tierId;
    setRouting(next);
  };

  const submit = async () => {
    setBusy(true);
    const judgeResult = await judge({
      task: `A vendor announced a 40 percent price cut on the mid-tier model effective next quarter. The learner chose to "${VENDOR_EVENT.options.find((o) => o.id === vendorChoice).label}". Score the reasoning, not whether the market call is right.`,
      dimensions: [
        { id: 'evidence', desc: 'Uses the margin sheet numbers, current routing or contract timing as evidence.' },
        { id: 'risk', desc: 'Names what could go wrong with the chosen option and how it is bounded.' },
        { id: 'reversibility', desc: 'Considers whether the decision can be reversed cheaply.' },
      ],
      text: vendorReason,
      context: `Current gross margin ${pnl.grossMargin}%, adoption ${pnl.adoption}%, routing ${JSON.stringify(routing)}. Contract with current vendor runs to quarter end.`,
    });
    const r = scoreMargin({ routing, pricingModel, pricePoint, pnl, vendorChoice, judgeResult, fineTuneTrap });
    if (judgeResult.fallback) r.feedback.push('Judge unavailable for the vendor reasoning. A neutral score was applied and the call was logged.');
    if (state.learner.mode === 'team') {
      const ignored = state.teamLog.filter((t) => t.level === 4 && !t.considered && !t.reason).length;
      if (ignored) r.meterDeltas.stakeholder = -3 * ignored;
    }
    setResult(r);
    log({ type: 'level-submit', summary: `Margin Room: ${pnl.grossMargin}% margin, ${pnl.adoption}% adoption, ${pm.label} at ${pricePoint}, vendor: ${vendorChoice}`, score: r.score, judge: judgeResult, text: vendorReason });
    complete(4, r);
    setBusy(false);
  };

  return (
    <div>
      <LevelHeader level={4} />
      <EventCard level={4} />
      <Notice>Route each query type to a model tier, pick a pricing model, and watch the P&L. Pass condition: gross margin above {PASS_CONDITION.grossMargin}% with adoption forecast above {PASS_CONDITION.adoption}%. {fineTuneTrap && <span className="text-sky-300">Consequence from Sprint 2: the fine-tuned adapter costs 18,000 a month to host.</span>}</Notice>
      <div className="mt-4">
        <TeamInputs level={4} inputs={[
          { id: 'eng-4', roles: ['eng'], text: 'Engineering Partner: the cached small tier answers about 60 percent of FAQ traffic from cache. It falls apart on multi-step reasoning.' },
          { id: 'gov-4', roles: ['gov'], text: 'Governance Liaison: HR queries need a human path or the most capable, guarded model. Cost is not the only axis for that 5 percent of traffic.' },
        ]} />
      </div>
      <DnDProvider onDrop={onDrop}>
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
          <DropZone id="unrouted" label="Unrouted query types" className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="mb-2 text-xs uppercase tracking-wider text-zinc-400">Query types (share of volume)</div>
            <div className="space-y-2">
              {QUERY_TYPES.filter((q) => !routing[q.id]).map((q) => <QueryChip key={q.id} q={q} disabled={Boolean(finalResult)} />)}
              {QUERY_TYPES.every((q) => routing[q.id]) && <p className="text-sm text-zinc-500">All traffic routed.</p>}
            </div>
          </DropZone>
          <div className="space-y-2">
            {MODEL_TIERS.map((t) => (
              <DropZone key={t.id} id={t.id} label={t.label} className={`rounded-lg border p-3 ${t.human ? 'border-sky-500/30 bg-sky-500/5' : 'border-zinc-800 bg-zinc-900/40'}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium text-zinc-100">{t.label}</span>
                  <span className="font-mono text-[11px] text-zinc-400">{`${t.pricePer1k.toFixed(2)} per 1k`} | {t.human ? '~1h' : `${t.latencyMs} ms`} | quality {t.quality}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {QUERY_TYPES.filter((q) => routing[q.id] === t.id).map((q) => <QueryChip key={q.id} q={q} tier={t} compact disabled={Boolean(finalResult)} />)}
                </div>
              </DropZone>
            ))}
          </div>
        </div>
      </DnDProvider>
      <p className="mt-2 text-xs text-zinc-500">Keyboard: Enter selects a query type, Tab to a tier, Enter routes it. Price shown is per 1,000 queries at complexity 1; it scales with complexity.</p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel title="Pricing model">
          <div className="flex flex-wrap gap-2">
            {PRICING_MODELS.map((p) => <button key={p.id} disabled={Boolean(finalResult)} onClick={() => { setPricingModel(p.id); setPricePoint(p.default); }} className={`rounded border px-3 py-1.5 text-xs ${pricingModel === p.id ? 'border-amber-400 text-amber-200' : 'border-zinc-700 text-zinc-400'}`}>{p.label}</button>)}
          </div>
          <label className="mt-4 block">
            <span className="text-xs uppercase tracking-wider text-zinc-400">Price point: <span className="font-mono text-amber-300">{pricePoint}</span> {pm.unit}</span>
            <input type="range" min={pm.min} max={pm.max} step={pm.step} value={pricePoint} disabled={Boolean(finalResult)} onChange={(e) => setPricePoint(Number(e.target.value))} className="mt-2 w-full" />
          </label>
        </Panel>
        <Panel title="Live P&L" subtitle="Monthly, at forecast adoption">
          <div className="grid grid-cols-2 gap-3">
            <Gauge label="Gross margin" value={pnl.grossMargin} unit="%" max={100} good={pnl.grossMargin >= PASS_CONDITION.grossMargin} target={PASS_CONDITION.grossMargin} targetLabel={`above ${PASS_CONDITION.grossMargin}%`} />
            <Gauge label="Adoption forecast" value={pnl.adoption} unit="%" max={100} good={pnl.adoption >= PASS_CONDITION.adoption} target={PASS_CONDITION.adoption} targetLabel={`above ${PASS_CONDITION.adoption}%`} />
          </div>
          <div className="mt-3"><StatRow items={[{ label: 'Revenue', value: pnl.revenue.toLocaleString() }, { label: 'Inference cost', value: pnl.cost.toLocaleString() }, { label: 'Blended quality', value: pnl.weightedQuality }, { label: 'Traffic under quality need', value: `${pnl.unmetShare}%` }]} /></div>
          {pnl.sensitiveUnprotected && <p className="mt-2 text-xs text-sky-300">Sensitive HR traffic is on a cheap tier with no human path.</p>}
        </Panel>
      </div>

      {eventUnlocked && (
        <Panel title={VENDOR_EVENT.title} className="mt-4 border-sky-500/30" right={<Tag tone="sky">Mid-level event</Tag>}>
          <p className="text-sm text-zinc-200">{VENDOR_EVENT.text}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {VENDOR_EVENT.options.map((o) => <button key={o.id} disabled={Boolean(finalResult)} onClick={() => setVendorChoice(o.id)} title={o.note} className={`rounded border px-3 py-1.5 text-xs ${vendorChoice === o.id ? 'border-amber-400 text-amber-200' : 'border-zinc-700 text-zinc-400'}`}>{o.label}</button>)}
          </div>
          <textarea className={`${inputClass} mt-3 min-h-[90px]`} disabled={Boolean(finalResult)} value={vendorReason} onChange={(e) => setVendorReason(e.target.value)} placeholder="Why this option? Reference your margin, your routing and the contract timing. At least 40 words." />
          <div className="mt-1 flex justify-between text-xs text-zinc-500"><span>{wordCount(vendorReason)} words (40 required)</span><span>{llmAvailable() ? 'LLM judge active' : 'No API key: neutral judge score will be applied'}</span></div>
        </Panel>
      )}

      {!finalResult && (
        <div className="mt-4 flex items-center justify-end gap-3">
          <span className="text-xs text-zinc-500">{routedCount}/{QUERY_TYPES.length} routed{!pnl.routedAll ? '' : pnl.grossMargin >= PASS_CONDITION.grossMargin && pnl.adoption >= PASS_CONDITION.adoption ? '. Pass condition met.' : '. Pass condition not met: you can still submit, and the score will reflect it.'}</span>
          <Button disabled={busy || !pnl.routedAll || !vendorChoice || wordCount(vendorReason) < 40} onClick={submit}>{busy ? 'Scoring...' : 'Lock the margin model'}</Button>
        </div>
      )}
      {finalResult && <LevelResult level={4} result={finalResult} onContinue={() => window.dispatchEvent(new CustomEvent('lw:next'))} />}
    </div>
  );
}

function QueryChip({ q, tier, compact, disabled }) {
  return (
    <Draggable id={q.id} label={q.label} disabled={disabled} className={`rounded border border-zinc-700 bg-zinc-950 ${compact ? 'px-2 py-1 text-[11px]' : 'p-2.5 text-xs'}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium text-zinc-100">{q.label}{q.sensitive && <span className="ml-1 text-sky-300">(sensitive)</span>}</span>
        <span className="font-mono text-zinc-500">{Math.round(q.share * 100)}% | cx {q.complexity}</span>
      </div>
      {!compact && <p className="mt-1 text-zinc-400">{q.note} Needs quality {q.minQuality}.</p>}
      {tier && <div className="mt-0.5 font-mono text-[10px] text-zinc-500">quality {effectiveQuality(tier, q)}{effectiveQuality(tier, q) < q.minQuality ? ' (below need)' : ''} | {effectivePricePer1k(tier, q).toFixed(2)}/1k</div>}
    </Draggable>
  );
}
