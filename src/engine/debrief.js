// Derives the personal debrief from game state: best and costliest decisions, reinforcement skills.
import { METER_LABELS, PASS_CONDITION } from '../content/index.js';

const SKILL_FOR_METER = {
  commercial: { skill: 'AI unit economics and routing for margin', koach: 'Practice building a margin model before a pricing conversation, and defend it against a vendor price change.' },
  reliability: { skill: 'Evals, thresholds and failure taxonomies', koach: 'Practice classifying model failures and writing a ship or hold call that cites trace evidence.' },
  governance: { skill: 'Risk classification and human oversight design', koach: 'Practice classifying an AI use case under the EU AI Act and naming the oversight mechanism before Legal asks.' },
  stakeholder: { skill: 'Winning approvals with evidence and honest commitments', koach: 'Practice a CFO conversation where every commitment has a number and a kill criterion.' },
};

export function assessDecisions(state) {
  const f = state.flags;
  const r = state.levelResults;
  const items = [];
  const add = (level, strong, text, stronger, impact) => items.push({ level, strong, text, stronger, impact });

  if (r[1]) {
    add(1, f.killedBadIdea, f.killedBadIdea ? 'Sent the rule-based requests (refund approval, SLA alerts) to "Not an AI problem".' : 'Placed rule-based requests on the AI board.', 'Refund approvals and SLA alerts are documented rule sets. Naming them as workflow problems saves a quarter of model risk.', 6);
    if (f.refundsInScope) add(1, false, 'Put auto-approve refunds into the build-first scope.', 'A rules engine with an audit trail. The model adds fraud exposure without adding capability.', 8);
    if (r[1].detail?.flipped?.length > 6) add(1, false, `Funded ${r[1].detail.flipped.length} discovery flips.`, 'Flip the three ambiguous cards (churn, contracts, pricing) and place the rest on the pitch alone.', 3);
  }
  if (r[2]) {
    add(2, !f.skippedCitationLayer, f.skippedCitationLayer ? 'Shipped the pipeline without a citation layer.' : 'Included a citation layer in the pipeline.', 'Citations cost 0.02 per 1k and make every hallucination visible to the user. The Sprint 7 incident was less severe for learners who had them.', 7);
    if (f.fineTuneTrap) add(2, false, 'Chose the fine-tuned adapter.', 'Retrieval plus a mid-tier model met the envelope with no fixed cost and no six week delay. Fine-tuning is a later optimization, not a first quarter bet.', 8);
    if (r[2].detail?.meets) add(2, true, `Met the CTO envelope at ${r[2].detail.cost} per 1k, ${r[2].detail.latency}s p95, quality ${r[2].detail.quality}.`, '', 5);
  }
  if (r[3]) {
    add(3, f.highThreshold, `Set the ship threshold at ${f.threshold}%.`, f.highThreshold ? '' : 'A threshold of 85 to 92 with a citation layer. Below 80 the known hallucination class ships to customers.', f.lowThreshold ? 9 : 5);
    if (f.shippedDespiteHold) add(3, false, 'Decided to ship on a threshold below 75.', 'Hold, or raise the bar. The traces you classified showed data leaks and a contract hallucination.', 9);
    if ((r[3].detail?.accuracy ?? 0) >= 85) add(3, true, `Classified failures with ${r[3].detail.accuracy}% accuracy.`, '', 4);
  }
  if (r[4]) {
    add(4, f.marginHawk, f.marginHawk ? `Reached ${f.grossMargin}% gross margin through routing with the frontier model on a quarter of traffic or less.` : `Locked a margin model at ${f.grossMargin ?? '?'}% margin and ${f.adoption ?? '?'}% adoption.`, f.marginHawk ? '' : `Move FAQ and summarization to the small or cached tier before touching price. Target above ${PASS_CONDITION.grossMargin}% margin with adoption above ${PASS_CONDITION.adoption}%.`, 7);
    if (f.hrUnprotected) add(4, false, 'Routed sensitive HR queries to a cheap tier with no human path.', 'Route HR to the human desk or the guarded frontier tier. Two percent of traffic is where the governance risk lives.', 6);
    if (f.vendorChoice === 'hedge') add(4, true, 'Hedged the vendor price cut with a pilot slice and a negotiation.', '', 4);
  }
  if (r[5]) {
    add(5, f.signatures === 3, `Won ${f.signatures} of 3 signatures.`, f.signatures === 3 ? '' : 'Attach the eval summary and margin sheet before the persona asks. Answer each hidden concern with a mechanism, an owner and a date.', 7);
    if (f.overPromisedCFO) add(5, false, 'Over-promised to the CFO to get the signature.', 'A number you can evidence plus a kill criterion. The CFO signs for discipline, not optimism.', 8);
    if (f.evidenceInGauntlet) add(5, true, 'Brought PRD evidence into stakeholder conversations.', '', 5);
  }
  if (r[6]) {
    add(6, !f.noApprovalOnAction, f.noApprovalOnAction ? 'Left the action step without a human approval checkpoint.' : 'Placed a human approval checkpoint on the action step.', 'Friction belongs where the risk is. A checkpoint on the action step and citations on the answer step cover most of the incident surface.', 8);
    if (f.overEngineered) add(6, false, 'Placed human approval on low-risk steps.', 'Approval on query or retrieval adds friction without reducing risk. Move it to the action step.', 4);
  }
  if (r[7]) {
    if (f.postmortemJudged) add(7, Boolean(f.honestPostmortem), f.honestPostmortem ? 'Wrote an honest, specific customer communication with a remediation.' : 'Customer communication scored below the honesty bar.', 'Say what happened, what you know, what you are doing and when they will hear again. No blame, no hedging.', 6);
    add(7, Boolean(f.sequenceCorrect), f.sequenceCorrect ? 'Sequenced the incident response correctly: roll back, restrict, brief, notify.' : 'Incident response sequence had missteps.', 'Roll back to the golden set first, restrict exposure, pull logs, brief Legal and the CEO, then notify customers with facts.', 7);
  }
  if (r[8]) add(8, (r[8].score || 0) >= 70, `Launch dossier and board pitch scored ${r[8].score}.`, 'Bring every artifact, and answer the board on your weakest meter with what you would do differently, not what went well.', 6);

  const best = items.filter((i) => i.strong).sort((a, b) => b.impact - a.impact).slice(0, 3);
  const costliest = items.filter((i) => !i.strong).sort((a, b) => b.impact - a.impact).slice(0, 3);
  return { best, costliest, all: items };
}

export function reinforcementSkills(state) {
  const sorted = Object.entries(state.meters).sort((a, b) => a[1] - b[1]).slice(0, 2);
  return sorted.map(([k, v]) => ({ meter: METER_LABELS[k], value: v, ...SKILL_FOR_METER[k] }));
}
