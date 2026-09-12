import React, { useEffect, useRef, useState } from 'react';
import { useGame } from '../engine/GameContext.jsx';
import { PERSONAS, PERSONA_ORDER, SIGNATURE_MARKER, MAX_TURNS, FREE_TURNS, CAPITAL_PER_EXTRA_TURN, scriptedPersonaReply } from '../content/index.js';
import { Panel, Button, Tag, Notice, inputClass } from '../components/ui.jsx';
import { LevelHeader, LevelResult, TeamInputs, teamPenalty, EventCard } from '../components/Shell.jsx';
import { chat, judge, judgeAverage, llmAvailable } from '../engine/llm.js';

const DOCS = [
  { id: 'scope', label: 'PRD: Scope', key: 'scope' },
  { id: 'technical', label: 'PRD: Technical requirements', key: 'technical' },
  { id: 'evals', label: 'Eval summary (Sprint 3)', key: 'evals' },
  { id: 'margin', label: 'Margin sheet (Sprint 4)', key: 'margin' },
];

export function scoreGauntlet({ conversations }) {
  const feedback = [];
  const badges = [];
  const liabilities = [];
  let signatures = 0;
  let judgeTotal = 0;
  let evidenceUsed = false;
  PERSONA_ORDER.forEach((pid) => {
    const c = conversations[pid];
    if (!c) return;
    if (c.granted) signatures += 1;
    const avg = c.judge ? judgeAverage(c.judge.scores) : 5;
    judgeTotal += avg;
    if (c.attached?.length) evidenceUsed = true;
    if (c.judge?.flags?.over_promised || c.overPromised) {
      liabilities.push({ id: `overpromise-${pid}`, source: 'Sprint 5', text: `Over-promised to ${PERSONAS[pid].name}` });
      feedback.push(`${PERSONAS[pid].name}: you committed to something you cannot yet evidence. It is now a liability card for Sprint 7.`);
    }
    if (!c.granted) feedback.push(`${PERSONAS[pid].name} did not sign. Unaddressed: ${PERSONAS[pid].concerns.filter((k) => !(c.addressed || []).includes(k.id)).map((k) => k.label.toLowerCase()).join(', ') || 'specificity of commitments'}.`);
    if (c.judge?.rationale) feedback.push(`${PERSONAS[pid].name} judge: ${c.judge.rationale}`);
  });
  const judgeAvg = judgeTotal / 3;
  const score = Math.min(100, Math.round(signatures * 20 + judgeAvg * 3 + (evidenceUsed ? 10 : 0)));
  if (conversations.priya?.granted) badges.push('got_legal_to_yes');
  if (conversations.dana?.granted) badges.push('security_partner');
  if (conversations.marcus?.granted && !liabilities.some((l) => l.id === 'overpromise-marcus')) badges.push('cfo_credible');
  if (evidenceUsed) badges.push('evidence_led'); else feedback.unshift('You attached no documents. Personas respond to evidence, and the judge rewards it. The PRD panel was built for this.');
  return {
    score,
    xp: Math.round(score * 1.5),
    badges,
    liabilities,
    feedback: feedback.slice(0, 7),
    evidenceReferenced: evidenceUsed,
    meterDeltas: { governance: signatures * 4 - (3 - signatures) * 4, stakeholder: Math.round(judgeAvg * 2 - 6) + signatures * 2 },
    currencyDeltas: {},
    flags: { signatures, gotLegalYes: Boolean(conversations.priya?.granted), overPromisedCFO: liabilities.some((l) => l.id === 'overpromise-marcus'), evidenceInGauntlet: evidenceUsed },
    prdSection: { key: 'governance', value: `Governance sign-offs: ${PERSONA_ORDER.map((p) => `${PERSONAS[p].name} (${PERSONAS[p].role}): ${conversations[p]?.granted ? 'SIGNED' : 'NOT SIGNED'}`).join('; ')}. Commitments made: ${PERSONA_ORDER.flatMap((p) => conversations[p]?.commitments || []).join('; ') || 'none recorded'}.` },
    detail: { conversations },
  };
}

export default function Level5Gauntlet() {
  const { state, log, complete, saveDraft, spend, remember } = useGame();
  const draft = state.levelDraft[5] || {};
  const [active, setActive] = useState(draft.active || 'dana');
  const [conversations, setConversations] = useState(draft.conversations || {});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const done = state.levelStatus[5] === 'complete';
  const finalResult = result || (done ? state.levelResults[5] : null);

  useEffect(() => { saveDraft(5, { active, conversations }); }, [active, conversations]); // eslint-disable-line

  const allClosed = PERSONA_ORDER.every((p) => conversations[p]?.closed);

  const submit = () => {
    const r = scoreGauntlet({ conversations });
    const penalty = teamPenalty(state, 5);
    if (penalty) r.meterDeltas.stakeholder = (r.meterDeltas.stakeholder || 0) - penalty;
    setResult(r);
    log({ type: 'level-submit', summary: `Gauntlet: ${r.flags.signatures}/3 signatures`, score: r.score });
    complete(5, r);
  };

  return (
    <div>
      <LevelHeader level={5} />
      <EventCard level={5} />
      <Notice>Three signatures unlock launch. Each conversation is capped at {MAX_TURNS} turns; turns after {FREE_TURNS} cost {CAPITAL_PER_EXTRA_TURN} Political Capital each. Attach evidence from your PRD: personas respond to numbers and controls, not assertions. {!llmAvailable() && <span className="text-sky-300">No API key configured: personas run in scripted mode and the judge applies neutral scores. Add a key in the Facilitator panel for live conversations.</span>}</Notice>
      <div className="mt-4">
        <TeamInputs level={5} inputs={[
          { id: 'gov-5', roles: ['gov'], text: 'Governance Liaison: documentation Q&A is limited risk under the EU AI Act with transparency obligations. The moment it acts on a person (refunds, HR) it moves tiers. Say that to Legal before she asks.' },
          { id: 'eng-5', roles: ['eng'], text: 'Engineering Partner: we can enforce tenant-scoped retrieval at the index level and log every prompt and output for 90 days. Do not promise zero hallucination.' },
        ]} />
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {PERSONA_ORDER.map((pid) => {
          const p = PERSONAS[pid];
          const c = conversations[pid];
          return (
            <button key={pid} onClick={() => setActive(pid)} className={`flex items-center gap-2 rounded border px-3 py-1.5 text-xs ${active === pid ? 'border-amber-400 text-amber-200' : 'border-zinc-700 text-zinc-400'}`}>
              <span className="grid h-6 w-6 place-items-center rounded-full bg-zinc-800 font-mono text-[10px] text-zinc-200">{p.avatar}</span>
              <span>{p.name}</span>
              {c?.granted ? <Tag tone="amber">Signed</Tag> : c?.closed ? <Tag tone="sky">Declined</Tag> : <Tag>{c?.turns || 0}/{MAX_TURNS}</Tag>}
            </button>
          );
        })}
      </div>
      <Conversation
        key={active}
        persona={PERSONAS[active]}
        convo={conversations[active]}
        disabled={Boolean(finalResult)}
        prd={state.prd}
        capital={state.currencies.capital}
        memory={state.personaMemory[active]}
        flags={state.flags}
        onUpdate={(c) => setConversations((prev) => ({ ...prev, [active]: c }))}
        onSpend={(n) => spend('capital', n)}
        onLog={log}
        onRemember={(note) => remember(active, note)}
        setBusy={setBusy}
      />
      {!finalResult && (
        <div className="mt-4 flex items-center justify-end gap-3">
          <span className="text-xs text-zinc-500">{PERSONA_ORDER.filter((p) => conversations[p]?.granted).length}/3 signatures. Close all three conversations to submit.</span>
          <Button disabled={busy || !allClosed} onClick={submit}>Submit the gauntlet</Button>
        </div>
      )}
      {finalResult && <LevelResult level={5} result={finalResult} onContinue={() => window.dispatchEvent(new CustomEvent('lw:next'))} />}
    </div>
  );
}

function Conversation({ persona, convo, disabled, prd, capital, memory, flags, onUpdate, onSpend, onLog, onRemember, setBusy }) {
  const c = convo || { messages: [{ role: 'assistant', text: persona.opening }], turns: 0, addressed: [], attached: [], granted: false, closed: false, commitments: [] };
  const [input, setInput] = useState('');
  const [attach, setAttach] = useState([]);
  const [waiting, setWaiting] = useState(false);
  const endRef = useRef(null);
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }); }, [c.messages.length]);

  const nextTurn = c.turns + 1;
  const extraCost = nextTurn > FREE_TURNS ? CAPITAL_PER_EXTRA_TURN : 0;
  const canSend = !disabled && !c.closed && !waiting && input.trim().length > 0 && c.turns < MAX_TURNS && capital >= extraCost;

  const send = async () => {
    if (!canSend) return;
    setWaiting(true); setBusy(true);
    if (extraCost) onSpend(extraCost);
    const attachedDocs = attach.filter((a) => prd[DOCS.find((d) => d.id === a).key]);
    const attachmentText = attachedDocs.map((a) => `[Attached ${DOCS.find((d) => d.id === a).label}]\n${prd[DOCS.find((d) => d.id === a).key]}`).join('\n\n');
    const learnerText = input.trim();
    const userContent = attachmentText ? `${learnerText}\n\n${attachmentText}` : learnerText;
    const messages = [...c.messages, { role: 'user', text: learnerText, attached: attachedDocs }];
    let replyText = '';
    let granted = false;
    let addressed = c.addressed;
    if (llmAvailable()) {
      const memoryNote = memory?.length ? `\n\nWhat you remember about this PM from earlier: ${memory.join(' | ')}` : '';
      const flagNote = flags.lowThreshold ? '\nYou have heard the eval ship threshold was set below 80 percent. Probe it if relevant.' : '';
      const apiMessages = messages.map((m, i) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.role === 'user' && i === messages.length - 1 ? userContent : m.text }));
      // First message in the API must be from the user; prepend a framing message.
      apiMessages.unshift({ role: 'user', content: '(The PM enters the room.)' });
      const res = await chat({ system: persona.systemPrompt + memoryNote + flagNote, messages: apiMessages, maxTokens: 400 });
      if (res.ok) {
        replyText = res.text;
        granted = replyText.includes(SIGNATURE_MARKER);
        replyText = replyText.replace(SIGNATURE_MARKER, '').trim();
        const scripted = scriptedPersonaReply(persona, learnerText, addressed);
        addressed = scripted.addressed;
      } else {
        const scripted = scriptedPersonaReply(persona, learnerText, addressed);
        replyText = scripted.reply.replace(SIGNATURE_MARKER, '').trim() + ' (Live persona unavailable, scripted response shown.)';
        granted = scripted.granted; addressed = scripted.addressed;
      }
    } else {
      const scripted = scriptedPersonaReply(persona, learnerText, addressed);
      replyText = scripted.reply.replace(SIGNATURE_MARKER, '').trim();
      granted = scripted.granted; addressed = scripted.addressed;
    }
    const overPromised = /zero risk|never hallucinate|cannot hallucinate|100 percent|100%|guarantee/i.test(learnerText);
    const next = {
      ...c,
      messages: [...messages, { role: 'assistant', text: replyText }],
      turns: nextTurn,
      addressed,
      attached: [...new Set([...c.attached, ...attachedDocs])],
      granted: c.granted || granted,
      closed: c.granted || granted || nextTurn >= MAX_TURNS,
      overPromised: c.overPromised || overPromised,
      commitments: [...c.commitments, ...(learnerText.match(/(we will|I will|I commit|we commit)[^.]*\./gi) || [])].slice(0, 6),
    };
    onLog({ type: 'persona-turn', summary: `${persona.name} turn ${nextTurn}: ${learnerText.slice(0, 90)}`, attached: attachedDocs, cost: extraCost ? `${extraCost} capital` : undefined });
    if (next.closed) await judgeAndRemember(next, nextTurn);
    onUpdate(next);
    setInput(''); setAttach([]);
    setWaiting(false); setBusy(false);
  };

  const judgeAndRemember = async (next, turnCount) => {
    {
      setBusy(true);
      const judgeResult = await judge({
        task: `The learner (an AI PM) tried to win a sign-off from ${persona.name}, ${persona.role}. Score the learner's side of the conversation.`,
        dimensions: [
          { id: 'evidence', desc: 'Used numbers, documents or specific controls rather than assertions.' },
          { id: 'specificity', desc: 'Commitments were concrete: named mechanisms, owners, thresholds or dates.' },
          { id: 'pushback', desc: 'Handled objections directly instead of deflecting or repeating.' },
          { id: 'realism', desc: 'Did not over-promise. 10 means every commitment is deliverable; low scores mean promises like zero risk or guaranteed accuracy.' },
        ],
        text: next.messages.filter((m) => m.role === 'user').map((m, i) => `Turn ${i + 1}: ${m.text}`).join('\n'),
        context: `Persona concerns: ${persona.concerns.map((k) => k.label).join(', ')}. Documents attached: ${next.attached.join(', ') || 'none'}. Outcome: ${next.granted ? 'signature granted' : 'no signature'}.`,
      });
      next.judge = judgeResult;
      const summary = `${next.granted ? 'Signed off' : 'Declined'} after ${turnCount} turns. PM committed to: ${next.commitments.slice(0, 3).join(' ') || 'nothing specific'}${next.overPromised ? '. PM over-promised (zero risk or guarantee language).' : ''}`;
      onRemember(summary);
      onLog({ type: 'persona-judge', summary: `${persona.name}: ${next.granted ? 'signature' : 'declined'}`, judge: judgeResult, score: Math.round(judgeAverage(judgeResult.scores) * 10) });
    }
  };

  const endWithoutSignature = async () => {
    setWaiting(true);
    const next = { ...c, closed: true };
    await judgeAndRemember(next, c.turns);
    onUpdate(next);
    setWaiting(false); setBusy(false);
  };

  return (
    <Panel title={`${persona.name}, ${persona.role}`} subtitle={persona.brief} right={c.granted ? <Tag tone="amber">Signature granted</Tag> : c.closed ? <Tag tone="sky">Conversation closed</Tag> : <Tag>Turn {c.turns}/{MAX_TURNS}</Tag>}>
      <div className="max-h-[380px] space-y-3 overflow-y-auto pr-1" role="log" aria-live="polite">
        {c.messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${m.role === 'user' ? 'bg-amber-500/15 text-amber-50' : 'bg-zinc-800 text-zinc-100'}`}>
              {m.text}
              {m.attached?.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{m.attached.map((a) => <Tag key={a} tone="amber">{DOCS.find((d) => d.id === a).label}</Tag>)}</div>}
            </div>
          </div>
        ))}
        {waiting && <div className="text-xs text-zinc-500">{persona.name} is thinking...</div>}
        <div ref={endRef} />
      </div>
      {!c.closed && !disabled && (
        <div className="mt-3 border-t border-zinc-800 pt-3">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-zinc-500">Bring a document:</span>
            {DOCS.map((d) => {
              const available = Boolean(prd[d.key]);
              const on = attach.includes(d.id);
              return <button key={d.id} disabled={!available} onClick={() => setAttach(on ? attach.filter((a) => a !== d.id) : [...attach, d.id])} aria-pressed={on} title={available ? 'Attach to your next message' : 'Not yet written in your PRD'} className={`rounded border px-2 py-0.5 ${on ? 'border-amber-400 text-amber-200' : 'border-zinc-700 text-zinc-400'} disabled:opacity-40`}>{d.label}</button>;
            })}
          </div>
          <div className="flex gap-2">
            <textarea className={`${inputClass} min-h-[70px]`} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }} placeholder={`Reply to ${persona.name.split(' ')[0]}. Be specific.`} aria-label={`Message to ${persona.name}`} />
            <div className="flex flex-col justify-between">
              <Button disabled={!canSend} onClick={send}>Send</Button>
              <span className="mt-1 text-[10px] text-zinc-500">{extraCost ? `Costs ${extraCost} capital` : 'Free turn'}</span>
            </div>
          </div>
          {capital < extraCost && <p className="mt-1 text-xs text-sky-300">Not enough Political Capital for another turn. Close the conversation or move on.</p>}
          <div className="mt-2 flex justify-end"><Button size="sm" variant="ghost" disabled={waiting} onClick={endWithoutSignature}>End conversation without signature</Button></div>
        </div>
      )}
      {c.judge && <p className="mt-3 text-xs text-zinc-400">Judge: {c.judge.rationale} {c.judge.fallback && '(neutral fallback applied)'}</p>}
    </Panel>
  );
}
