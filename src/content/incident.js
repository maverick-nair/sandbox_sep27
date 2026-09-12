// Level 7: Incident content. Severity is seeded by earlier decisions.
export const INCIDENT_SECONDS = 360;

export const ALERT = 'Helios Assist told a Tier 1 customer that their contract auto-renews at a 30 percent uplift. It does not. The customer\'s procurement head has posted about it on LinkedIn.';

// Waves of decision cards. order: correct sequence index (lower first). excludes: mutually exclusive ids.
export const WAVES = [
  { id: 1, title: 'First five minutes', cards: [
    { id: 'rollback', label: 'Roll back to the last golden set release', order: 1, good: true, desc: 'Restores the version that passed regression tests.', effects: { reliability: 4 } },
    { id: 'kill', label: 'Kill the feature entirely', order: 1, good: false, excludes: ['rollback', 'restrict'], desc: 'Stops all harm and all value. Correct only if severity is critical.', effects: { commercial: -8, reliability: 3, stakeholder: -3 } },
    { id: 'restrict', label: 'Restrict to internal users', order: 2, good: true, desc: 'Keeps the feature alive for staff while you investigate.', effects: { commercial: -3, reliability: 3 } },
    { id: 'tweet', label: 'Reply publicly on LinkedIn now', order: 99, good: false, desc: 'Responding before facts are confirmed.', effects: { stakeholder: -5, governance: -2 } },
  ] },
  { id: 2, title: 'Internal comms', cards: [
    { id: 'brief_legal', label: 'Brief Legal', order: 3, good: true, desc: 'A false contractual statement has legal exposure.', effects: { governance: 4 } },
    { id: 'brief_ceo', label: 'Brief the CEO', order: 4, good: true, desc: 'The CEO should hear it from you before they read it.', effects: { stakeholder: 4 } },
    { id: 'blame_vendor', label: 'Tell the CEO it is a model provider issue', order: 99, good: false, desc: 'Shifts blame. The routing and threshold were your decisions.', effects: { stakeholder: -4, governance: -3 } },
    { id: 'pull_logs', label: 'Pull the audit logs for the conversation', order: 3, good: true, desc: 'Evidence before narrative.', effects: { governance: 2, reliability: 1 } },
  ] },
  { id: 3, title: 'Customer', cards: [
    { id: 'notify', label: 'Notify affected customers', order: 5, good: true, desc: 'Every customer who received a renewal answer this week.', effects: { stakeholder: 3, governance: 3 } },
    { id: 'quiet', label: 'Fix quietly, notify nobody', order: 99, good: false, desc: 'If it surfaces later, trust is gone.', effects: { stakeholder: -6, governance: -5 } },
    { id: 'credit', label: 'Offer a service credit to the Tier 1 account', order: 6, good: true, desc: 'Concrete remediation.', effects: { commercial: -2, stakeholder: 3 } },
    { id: 'golden_add', label: 'Add the failing trace to the golden set', order: 6, good: true, desc: 'Turn the incident into a regression test.', effects: { reliability: 4 } },
  ] },
];

export function computeSeverity(flags) {
  let severity = 1;
  const reasons = [];
  if (flags.skippedCitationLayer) { severity += 1; reasons.push('No citation layer: the customer had no way to check the claim.'); }
  if (flags.lowThreshold) { severity += 1; reasons.push('Ship threshold below 80 percent: this class of hallucination was known and accepted.'); }
  if (flags.overPromisedCFO) { severity += 1; reasons.push('Over-promised to the CFO: the margin commitment is now in the board pack.'); }
  if (flags.noApprovalOnAction) { severity += 1; reasons.push('No human approval on the action step: the wrong answer could have triggered a workflow.'); }
  if (flags.shippedDespiteHold) { severity += 1; reasons.push('Shipped against the eval evidence in Level 3.'); }
  return { severity: Math.min(5, severity), reasons };
}
