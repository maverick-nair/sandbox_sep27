import React, { useMemo, useState } from 'react';
import { useGame } from '../engine/GameContext.jsx';
import { FEATURE_CARDS, BOARD_ZONES, FLIP_COST_HOURS, DISCOVERY_BUDGET_FLIPS } from '../content/index.js';
import { DnDProvider, Draggable, DropZone, Requirements } from '../components/dnd.jsx';
import { Panel, Button, Tag, Notice } from '../components/ui.jsx';
import { LevelHeader, LevelResult, TeamInputs, teamPenalty } from '../components/Shell.jsx';

export function scoreTriage({ placements, flipped }) {
  let accuracy = 0;
  let notAiCorrect = 0;
  let notAiWrong = 0;
  const feedback = [];
  FEATURE_CARDS.forEach((card) => {
    const zone = BOARD_ZONES.find((z) => z.id === placements[card.id]);
    if (!zone) return;
    const exact = zone.suitability === card.key.suitability && (zone.value === null || zone.value === card.key.value);
    if (exact) accuracy += 1;
    else if (zone.suitability === card.key.suitability || (zone.value && zone.value === card.key.value)) accuracy += 0.5;
    if (zone.id === 'not-ai') { if (card.key.suitability === 'not_ai') notAiCorrect += 1; else notAiWrong += 1; }
    if (!exact) feedback.push(`${card.title}: expert key says ${describeKey(card.key)}. ${card.whyKey}`);
  });
  const placedCount = Object.keys(placements).length;
  const accuracyPct = placedCount ? (accuracy / FEATURE_CARDS.length) * 100 : 0;
  const overFlips = Math.max(0, flipped.length - DISCOVERY_BUDGET_FLIPS);
  const discoveryPenalty = overFlips * 4;
  const notAiBonus = notAiCorrect * 5 - notAiWrong * 4;
  const score = Math.max(0, Math.min(100, Math.round(accuracyPct - discoveryPenalty + notAiBonus)));
  const scope = FEATURE_CARDS.filter((c) => placements[c.id] === 'hi-hi').map((c) => c.title);
  const badges = [];
  if (notAiCorrect >= 2 && notAiWrong === 0) badges.push('killed_bad_idea');
  if (flipped.length >= 3 && flipped.length <= DISCOVERY_BUDGET_FLIPS && accuracyPct >= 75) badges.push('discovery_disciplined');
  if (overFlips > 0) feedback.unshift(`You flipped ${flipped.length} cards. Discovery beyond ${DISCOVERY_BUDGET_FLIPS} cost ${discoveryPenalty} points: a PM funds enough discovery to decide, not to be certain.`);
  if (flipped.length === 0) feedback.unshift('You placed every card without discovery. Two or three flips on the ambiguous cards would have paid for themselves.');
  if (scope.length === 0) feedback.unshift('No cards in the build-first quadrant. Helios Assist has no scope. The CEO commitment stands regardless.');
  if (scope.length > 4) feedback.unshift(`${scope.length} items in scope for one quarter is too many. Two or three focused use cases ship; six do not.`);
  const refundsInScope = placements['auto-approve-refunds'] === 'hi-hi';
  return {
    score,
    xp: Math.round(score * 1.2),
    badges,
    feedback: feedback.slice(0, 6),
    meterDeltas: { commercial: Math.round((score - 50) / 5), governance: refundsInScope ? -6 : notAiCorrect >= 2 ? 4 : 0 },
    currencyDeltas: {},
    flags: { killedBadIdea: notAiCorrect >= 2 && notAiWrong === 0, refundsInScope, scopeCount: scope.length },
    prdSection: { key: 'scope', value: scope.length ? `Helios Assist Q3 scope: ${scope.join('; ')}.` : 'No scope selected in triage.' },
    detail: { placements, flipped, accuracyPct: Math.round(accuracyPct), notAiCorrect, notAiWrong },
  };
}

function describeKey(key) {
  if (key.suitability === 'not_ai') return 'not an AI problem';
  return `${key.value} value, ${key.suitability} AI suitability`;
}

export default function Level1Triage() {
  const { state, spend, log, complete, saveDraft } = useGame();
  const done = state.levelStatus[1] === 'complete';
  // Completed sprints replay from the stored result; in-progress ones from the draft.
  const draft = (done ? state.levelResults[1]?.detail : state.levelDraft[1]) || {};
  const [placements, setPlacements] = useState(draft.placements || {});
  const [flipped, setFlipped] = useState(draft.flipped || []);
  const [result, setResult] = useState(null);

  const unplaced = useMemo(() => FEATURE_CARDS.filter((c) => !placements[c.id]), [placements]);

  const onDrop = (cardId, zoneId) => {
    if (result) return;
    const next = { ...placements };
    if (zoneId === 'tray') delete next[cardId]; else next[cardId] = zoneId;
    setPlacements(next);
    saveDraft(1, { placements: next, flipped });
  };

  const flip = (cardId) => {
    if (flipped.includes(cardId) || result) return;
    if (state.currencies.hours < FLIP_COST_HOURS) return;
    spend('hours', FLIP_COST_HOURS);
    const next = [...flipped, cardId];
    setFlipped(next);
    saveDraft(1, { placements, flipped: next });
    log({ type: 'discovery', summary: `Funded discovery on "${FEATURE_CARDS.find((c) => c.id === cardId).title}"`, cost: `${FLIP_COST_HOURS} hours` });
  };

  const submit = () => {
    const r = scoreTriage({ placements, flipped });
    const penalty = teamPenalty(state, 1);
    if (penalty) r.meterDeltas.stakeholder = (r.meterDeltas.stakeholder || 0) - penalty;
    setResult(r);
    log({ type: 'level-submit', summary: `Triage submitted: ${r.detail.accuracyPct}% placement accuracy, ${flipped.length} flips, scope of ${r.flags.scopeCount}`, score: r.score });
    complete(1, r);
  };

  const finalResult = result || (done ? state.levelResults[1] : null);

  return (
    <div>
      <LevelHeader level={1} />
      <Notice>
        Twelve requests landed in your inbox from sales, customers and executives. Place each on the board by value to customer and AI suitability. Flip a card to fund discovery ({FLIP_COST_HOURS} Team Hours each). The top-right quadrant becomes the candidate scope for Helios Assist.
      </Notice>
      <div className="mt-4">
        <TeamInputs level={1} inputs={[
          { id: 'eng-1', roles: ['eng'], text: 'Engineering Partner note: retrieval over documentation is a two sprint build. Anything needing a trained model on our own labels is a two quarter build.' },
          { id: 'gov-1', roles: ['gov'], text: 'Governance Liaison note: any request that makes a decision about an individual (refunds, HR, pricing) carries a higher regulatory tier. Flag it before it enters scope.' },
        ]} />
      </div>
      <DnDProvider onDrop={onDrop}>
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <DropZone id="tray" label="Unplaced requests tray" className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="mb-2 flex items-center justify-between"><span className="text-xs uppercase tracking-wider text-zinc-400">Inbox</span><span className="font-mono text-xs text-zinc-400">{unplaced.length} left</span></div>
            <div className="space-y-2">
              {unplaced.map((c) => <Card key={c.id} card={c} flipped={flipped.includes(c.id)} onFlip={() => flip(c.id)} disabled={Boolean(finalResult)} canAfford={state.currencies.hours >= FLIP_COST_HOURS} />)}
              {unplaced.length === 0 && <p className="text-sm text-zinc-400">All requests placed. Review, then submit.</p>}
            </div>
          </DropZone>
          <div className="flex gap-2">
            <div className="flex w-5 shrink-0 flex-col items-center justify-between py-6 text-[10px] uppercase tracking-wider text-zinc-400" aria-hidden><span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>High value</span><span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>Low value</span></div>
          <div className="flex-1">
            <div className="grid grid-cols-2 gap-3">
              {['hi-lo', 'hi-hi', 'lo-lo', 'lo-hi'].map((zid) => {
                const z = BOARD_ZONES.find((b) => b.id === zid);
                const cards = FEATURE_CARDS.filter((c) => placements[c.id] === zid);
                return (
                  <DropZone key={zid} id={zid} label={z.label} className={`min-h-[190px] rounded-lg border p-3 ${zid === 'hi-hi' ? 'border-amber-500/40 bg-amber-500/5' : 'border-zinc-800 bg-zinc-900/40'}`}>
                    <div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium text-zinc-200">{z.label}</span><Tag tone={zid === 'hi-hi' ? 'amber' : 'zinc'}>{z.short}</Tag></div>
                    <div className="space-y-2">{cards.map((c) => <Card key={c.id} card={c} compact flipped={flipped.includes(c.id)} onFlip={() => flip(c.id)} disabled={Boolean(finalResult)} canAfford={state.currencies.hours >= FLIP_COST_HOURS} />)}</div>
                  </DropZone>
                );
              })}
            </div>
            <div className="mt-1 flex justify-between px-1 text-[10px] uppercase tracking-wider text-zinc-400"><span>Low AI suitability</span><span>High AI suitability</span></div>
            <DropZone id="not-ai" label="Not an AI problem" className="mt-3 min-h-[110px] rounded-lg border border-sky-500/40 bg-sky-500/5 p-3">
              <div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium text-sky-200">Not an AI problem</span><Tag tone="sky">Solve with rules or workflow</Tag></div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{FEATURE_CARDS.filter((c) => placements[c.id] === 'not-ai').map((c) => <Card key={c.id} card={c} compact flipped={flipped.includes(c.id)} onFlip={() => flip(c.id)} disabled={Boolean(finalResult)} canAfford={state.currencies.hours >= FLIP_COST_HOURS} />)}</div>
            </DropZone>
          </div>
          </div>
        </div>
      </DnDProvider>
      <p className="mt-2 text-xs text-zinc-400">Drag a card, or click or tap it to select and then click or tap a zone. Keyboard: Enter selects, Tab to a zone, Enter places. Escape cancels.</p>
      {!finalResult && (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-4">
          <Requirements items={[{ label: `${Object.keys(placements).length} of ${FEATURE_CARDS.length} requests placed`, done: Object.keys(placements).length === FEATURE_CARDS.length }, { label: `${flipped.length} discovery flips funded (optional, ${DISCOVERY_BUDGET_FLIPS} before penalty)`, done: true }]} />
          <Button disabled={Object.keys(placements).length < FEATURE_CARDS.length} onClick={submit}>Submit triage</Button>
        </div>
      )}
      {finalResult && <LevelResult level={1} result={finalResult} replay={done && !result} onContinue={() => window.dispatchEvent(new CustomEvent('lw:next'))} />}
    </div>
  );
}

function Card({ card, flipped, onFlip, compact, disabled, canAfford }) {
  return (
    <Draggable id={card.id} label={card.title} disabled={disabled} className={`rounded border border-zinc-700 bg-zinc-950 p-2.5 hover:border-zinc-500 ${compact ? 'text-xs' : 'text-sm'}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium text-zinc-100">{card.title}</div>
          <div className="text-[11px] text-zinc-400">{card.source}</div>
        </div>
        {!flipped && !disabled && <button type="button" onClick={(e) => { e.stopPropagation(); onFlip(); }} disabled={!canAfford} className="shrink-0 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:border-amber-400 disabled:opacity-40" aria-label={`Flip ${card.title} for ${FLIP_COST_HOURS} hours`}>Flip {FLIP_COST_HOURS}h</button>}
      </div>
      {!compact && <p className="mt-1 text-xs text-zinc-400">{card.pitch}</p>}
      {flipped && (
        <dl className="mt-2 space-y-0.5 border-t border-zinc-800 pt-2 text-[11px] text-zinc-300">
          <div><dt className="inline text-zinc-400">Data: </dt><dd className="inline">{card.hidden.data}</dd></div>
          <div><dt className="inline text-zinc-400">Error tolerance: </dt><dd className="inline">{card.hidden.errorTolerance}</dd></div>
          <div><dt className="inline text-zinc-400">Regulatory: </dt><dd className="inline">{card.hidden.regulatory}</dd></div>
        </dl>
      )}
    </Draggable>
  );
}
