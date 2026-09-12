import React, { useEffect, useMemo, useState } from 'react';
import { useGame } from '../engine/GameContext.jsx';
import { FLOW_STEPS, UX_TILES, REQUIRED, SYNTHETIC_USERS } from '../content/index.js';
import { DnDProvider, Draggable, DropZone } from '../components/dnd.jsx';
import { Panel, Button, Tag, Notice, Gauge } from '../components/ui.jsx';
import { LevelHeader, LevelResult, TeamInputs, teamPenalty, EventCard } from '../components/Shell.jsx';
import { chat, stripFences, llmAvailable } from '../engine/llm.js';

export function evaluateDesign(placements) {
  // placements: { tileId: stepId }
  let friction = 0;
  let trust = 0;
  let misplaced = 0;
  let overEngineered = false;
  Object.entries(placements).forEach(([tileId, stepId]) => {
    const tile = UX_TILES.find((t) => t.id === tileId);
    if (!tile) return;
    friction += tile.friction;
    if (tile.best.includes(stepId)) trust += tile.trust; else { trust += Math.round(tile.trust / 3); misplaced += 1; }
    if (tile.overengineeringOn?.includes(stepId)) overEngineered = true;
  });
  const adoptionDelta = -Math.round(friction * 1.5);
  const incidentReduction = Math.min(60, trust * 2);
  return { friction, trust, misplaced, overEngineered, adoptionDelta, incidentReduction };
}

export function scoreTrust({ placements, reactions }) {
  const ev = evaluateDesign(placements);
  const feedback = [];
  let score = 40 + Math.min(30, ev.trust) - Math.min(20, ev.friction * 2) - ev.misplaced * 3;
  REQUIRED.forEach((req) => {
    if (placements[req.tile] === req.step) score += 10;
    else feedback.push(`${UX_TILES.find((t) => t.id === req.tile).label} is missing from the ${FLOW_STEPS.find((s) => s.id === req.step).label} step. ${req.reason}`);
  });
  if (ev.overEngineered) { score -= 10; feedback.push('Human approval on a low-risk step (query or retrieval) is over-engineering: friction with no risk reduction. Move it to the action step.'); }
  if (ev.friction > 12) feedback.push(`Total friction ${ev.friction} cuts the adoption forecast by ${Math.abs(ev.adoptionDelta)} points. Every tile should earn its place.`);
  if (ev.misplaced) feedback.push(`${ev.misplaced} tile(s) sit on steps where they add little. Citations belong on the answer, undo on the action, disclosure at the query.`);
  const noApprovalOnAction = placements.approval !== 'action';
  score = Math.max(0, Math.min(100, Math.round(score)));
  const badges = !noApprovalOnAction && !ev.overEngineered && placements.citations === 'answer' ? ['trust_architect'] : [];
  const desc = FLOW_STEPS.map((s) => `${s.label}: ${Object.entries(placements).filter(([, st]) => st === s.id).map(([t]) => UX_TILES.find((x) => x.id === t).label).join(', ') || 'none'}`).join('; ');
  return {
    score,
    xp: Math.round(score * 1.2),
    badges,
    feedback: feedback.slice(0, 6),
    meterDeltas: { reliability: Math.round(ev.incidentReduction / 6) - (noApprovalOnAction ? 6 : 0), commercial: Math.round(ev.adoptionDelta / 3), governance: placements.disclosure === 'query' ? 3 : -2 },
    currencyDeltas: { hours: -Object.keys(placements).length * 3 },
    flags: { noApprovalOnAction, overEngineered: ev.overEngineered, trustScore: ev.trust, frictionScore: ev.friction },
    prdSection: { key: 'trust', value: `Trust design: ${desc}. Friction ${ev.friction} (adoption forecast ${ev.adoptionDelta} points), trust ${ev.trust} (incident probability reduced ${ev.incidentReduction}%). Synthetic user test: ${reactions.map((r) => `${r.name}: ${r.verdict}`).join('; ')}.` },
    detail: { ...ev, placements, reactions },
  };
}

function templatedReactions(placements) {
  const ev = evaluateDesign(placements);
  return SYNTHETIC_USERS.map((u, i) => {
    let verdict = 'neutral';
    let text = '';
    if (i === 0 || i === 4) { verdict = ev.friction > 10 ? 'frustrated' : 'satisfied'; text = ev.friction > 10 ? 'Too many confirmations between me and the answer. I would go back to searching the docs myself.' : 'Fast enough that I would actually use it instead of the docs.'; }
    if (i === 1) { verdict = placements.citations === 'answer' && placements.escalation ? 'satisfied' : 'wary'; text = placements.citations === 'answer' ? 'I can see the source for each claim, which is what I need for an audit.' : 'I cannot tell where an answer came from. I would not rely on it for anything I have to sign.'; }
    if (i === 2) { verdict = placements.confidence || placements.show_work ? 'satisfied' : 'unsure'; text = placements.confidence || placements.show_work ? 'The confidence cue and the show your work panel helped me learn what it is good at.' : 'I could not tell when to trust it, so I double checked everything.'; }
    if (i === 3) { verdict = placements.approval === 'action' || placements.undo === 'action' ? 'satisfied' : 'alarmed'; text = placements.approval === 'action' || placements.undo === 'action' ? 'Actions ask before they run and I can undo them. That is the bar.' : 'It can take an action on my behalf with no confirmation and no undo. I have been burned by that before.'; }
    return { name: u.name, verdict, text };
  });
}

export default function Level6TrustStudio() {
  const { state, log, complete, saveDraft } = useGame();
  const draft = state.levelDraft[6] || {};
  const [placements, setPlacements] = useState(draft.placements || {});
  const [reactions, setReactions] = useState(draft.reactions || null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const done = state.levelStatus[6] === 'complete';
  const finalResult = result || (done ? state.levelResults[6] : null);
  useEffect(() => { saveDraft(6, { placements, reactions }); }, [placements, reactions]); // eslint-disable-line
  const ev = useMemo(() => evaluateDesign(placements), [placements]);
  const baseAdoption = state.flags.adoption ?? 35;

  const onDrop = (tileId, zoneId) => {
    if (finalResult) return;
    const next = { ...placements };
    if (zoneId === 'palette') delete next[tileId]; else next[tileId] = zoneId;
    setPlacements(next); setReactions(null);
  };

  const runUserTest = async () => {
    setBusy(true);
    let out = null;
    if (llmAvailable()) {
      const design = FLOW_STEPS.map((s) => `${s.label} (${s.risk} risk): ${Object.entries(placements).filter(([, st]) => st === s.id).map(([t]) => UX_TILES.find((x) => x.id === t).label).join(', ') || 'no patterns'}`).join('\n');
      const res = await chat({
        system: 'You simulate five enterprise software users reacting to an AI assistant user flow. React only to design choices that are actually present or absent in the design given. Return only JSON: {"reactions":[{"name":"...","verdict":"one word","text":"one or two sentences in first person"}]}. No code fences.',
        messages: [{ role: 'user', content: `Users:\n${SYNTHETIC_USERS.map((u) => `${u.name}: ${u.trait}`).join('\n')}\n\nFlow design:\n${design}\n\nThe action step can open tickets and approve refunds under 500 USD.` }],
        maxTokens: 700,
      });
      if (res.ok) {
        try { const parsed = JSON.parse(stripFences(res.text)); if (Array.isArray(parsed.reactions) && parsed.reactions.length) out = parsed.reactions.slice(0, 5).map((r, i) => ({ name: r.name || SYNTHETIC_USERS[i].name, verdict: String(r.verdict || 'neutral'), text: String(r.text || '') })); } catch (e) { console.warn('user test parse failed', e); }
      }
    }
    const fallback = !out;
    if (!out) out = templatedReactions(placements);
    setReactions(out.map((r) => ({ ...r, fallback })));
    log({ type: 'user-test', summary: `Synthetic user test run (${fallback ? 'templated' : 'LLM'})`, detail: out.map((r) => `${r.name}: ${r.verdict}`).join('; ') });
    setBusy(false);
  };

  const submit = () => {
    const r = scoreTrust({ placements, reactions });
    const penalty = teamPenalty(state, 6);
    if (penalty) r.meterDeltas.stakeholder = (r.meterDeltas.stakeholder || 0) - penalty;
    setResult(r);
    log({ type: 'level-submit', summary: `Trust Studio: trust ${ev.trust}, friction ${ev.friction}, approval on action ${placements.approval === 'action' ? 'yes' : 'no'}`, score: r.score });
    complete(6, r);
  };

  return (
    <div>
      <LevelHeader level={6} />
      <EventCard level={6} />
      <Notice>Place UX pattern tiles on the Helios Assist journey. Each tile has a friction cost (lowers the adoption forecast) and a trust benefit (lowers incident probability in Sprint 7). Friction belongs where the risk is. The action step can open tickets and approve refunds under 500 USD.</Notice>
      <div className="mt-4">
        <TeamInputs level={6} inputs={[
          { id: 'eng-6', roles: ['eng'], text: 'Engineering Partner: undo on actions is a two day build. Human approval checkpoints need a queue and an owner; do not scatter them.' },
          { id: 'gov-6', roles: ['gov'], text: 'Governance Liaison: you told Legal in Sprint 5 that users would be told they are talking to an AI and could escalate to a human. Both are tiles.' },
        ]} />
      </div>
      <DnDProvider onDrop={onDrop}>
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <DropZone id="palette" label="Pattern tiles" className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="mb-2 text-xs uppercase tracking-wider text-zinc-400">Pattern tiles</div>
            <div className="space-y-1.5">
              {UX_TILES.filter((t) => !placements[t.id]).map((t) => <TileCard key={t.id} tile={t} disabled={Boolean(finalResult)} />)}
              {UX_TILES.every((t) => placements[t.id]) && <p className="text-xs text-zinc-500">Every tile placed. Not every tile needs to be.</p>}
            </div>
          </DropZone>
          <div>
            <div className="grid gap-2 md:grid-cols-4">
              {FLOW_STEPS.map((s) => (
                <DropZone key={s.id} id={s.id} label={`${s.label} step`} className={`min-h-[220px] rounded-lg border p-3 ${s.risk === 'high' ? 'border-sky-500/40 bg-sky-500/5' : s.risk === 'medium' ? 'border-zinc-600 bg-zinc-900/40' : 'border-zinc-800 bg-zinc-900/30'}`}>
                  <div className="flex items-center justify-between"><span className="text-sm font-medium text-zinc-100">{s.label}</span><Tag tone={s.risk === 'high' ? 'sky' : 'zinc'}>{s.risk} risk</Tag></div>
                  <p className="mt-0.5 text-[11px] text-zinc-500">{s.desc}</p>
                  <div className="mt-2 space-y-1.5">{UX_TILES.filter((t) => placements[t.id] === s.id).map((t) => <TileCard key={t.id} tile={t} compact disabled={Boolean(finalResult)} />)}</div>
                </DropZone>
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Gauge label="Friction" value={ev.friction} max={20} good={ev.friction <= 10} />
              <Gauge label="Trust" value={ev.trust} max={40} good={ev.trust >= 20} />
              <Gauge label="Adoption forecast" value={Math.max(0, baseAdoption + ev.adoptionDelta)} unit="%" max={100} good={baseAdoption + ev.adoptionDelta >= 30} target={30} targetLabel="above 30%" />
            </div>
            <p className="mt-1 text-xs text-zinc-500">Incident probability in Sprint 7 reduced by {ev.incidentReduction}%. Adoption forecast starts from your Sprint 4 figure ({baseAdoption}%).</p>
          </div>
        </div>
      </DnDProvider>
      <p className="mt-2 text-xs text-zinc-500">Keyboard: Enter selects a tile, Tab to a step, Enter places it. Drop a tile on the palette to remove it.</p>
      <Panel title="Simulated user test" subtitle="Five synthetic users react to your actual design choices." className="mt-4" right={!finalResult && <Button size="sm" variant="secondary" disabled={busy || Object.keys(placements).length === 0} onClick={runUserTest}>{busy ? 'Running...' : reactions ? 'Run again' : 'Run user test'}</Button>}>
        {!reactions && <p className="text-sm text-zinc-500">Run the test before submitting. {llmAvailable() ? 'Reactions are generated live and constrained to your design.' : 'No API key: templated reactions constrained to your design will be used.'}</p>}
        {reactions && <ul className="grid gap-2 md:grid-cols-5">{reactions.map((r, i) => <li key={i} className="rounded border border-zinc-800 bg-zinc-950/60 p-2.5 text-xs"><div className="flex items-center justify-between"><span className="font-medium text-zinc-100">{r.name}</span><Tag tone={/satisf|positive|reliev|confident|happy/i.test(r.verdict) ? 'amber' : 'sky'}>{r.verdict}</Tag></div><p className="mt-1 text-zinc-300">{r.text}</p></li>)}</ul>}
        {reactions?.[0]?.fallback && <p className="mt-2 text-xs text-zinc-500">Templated reactions were used because the live call was unavailable.</p>}
      </Panel>
      {!finalResult && <div className="mt-4 flex justify-end"><Button disabled={!reactions || busy} onClick={submit}>Commit the trust design</Button></div>}
      {finalResult && <LevelResult level={6} result={finalResult} onContinue={() => window.dispatchEvent(new CustomEvent('lw:next'))} />}
    </div>
  );
}

function TileCard({ tile, compact, disabled }) {
  return (
    <Draggable id={tile.id} label={tile.label} disabled={disabled} className={`rounded border border-zinc-700 bg-zinc-950 ${compact ? 'p-1.5 text-[11px]' : 'p-2 text-xs'}`}>
      <div className="flex items-center justify-between gap-2"><span className="font-medium text-zinc-100">{tile.label}</span><span className="font-mono text-[10px] text-zinc-500">f{tile.friction} t{tile.trust}</span></div>
      {!compact && <p className="mt-0.5 text-[11px] text-zinc-400">{tile.desc}</p>}
    </Draggable>
  );
}
