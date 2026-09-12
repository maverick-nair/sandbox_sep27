// Level 6: Trust Studio content.
export const FLOW_STEPS = [
  { id: 'query', label: 'Query', risk: 'low', desc: 'User types a question.' },
  { id: 'retrieval', label: 'Retrieval', risk: 'low', desc: 'System fetches documents the user can access.' },
  { id: 'answer', label: 'Answer', risk: 'medium', desc: 'Model produces a grounded answer.' },
  { id: 'action', label: 'Action', risk: 'high', desc: 'Assistant executes a follow-up such as opening a ticket or approving a refund.' },
];

export const UX_TILES = [
  { id: 'confidence', label: 'Confidence indicator', friction: 1, trust: 3, best: ['answer'], desc: 'Shows how sure the system is.' },
  { id: 'citations', label: 'Inline citations', friction: 1, trust: 5, best: ['answer'], desc: 'Every claim links to its source passage.' },
  { id: 'show_work', label: 'Show your work expansion', friction: 1, trust: 3, best: ['answer', 'retrieval'], desc: 'Reveals retrieved passages and reasoning on demand.' },
  { id: 'undo', label: 'Undo', friction: 1, trust: 4, best: ['action'], desc: 'Reverse an action within a window.' },
  { id: 'approval', label: 'Human approval checkpoint', friction: 5, trust: 8, best: ['action'], overengineeringOn: ['query', 'retrieval'], desc: 'A person confirms before the action executes.' },
  { id: 'feedback', label: 'Feedback thumbs', friction: 0, trust: 2, best: ['answer'], desc: 'Collects signal for the eval set.' },
  { id: 'escalation', label: 'Escalation to human', friction: 2, trust: 5, best: ['answer', 'action'], desc: 'Hand off to a person at any point.' },
  { id: 'disclosure', label: 'Disclosure banner', friction: 1, trust: 3, best: ['query'], desc: 'Tells users they are talking to an AI. A transparency obligation.' },
  { id: 'rate_limiter', label: 'Rate limiter', friction: 3, trust: 2, best: ['query'], desc: 'Caps abusive or runaway usage.' },
  { id: 'sensitive_redirect', label: 'Sensitive-topic redirect', friction: 2, trust: 4, best: ['query', 'answer'], desc: 'Routes HR or legal questions to a safe path.' },
];

export const REQUIRED = [
  { step: 'action', tile: 'approval', reason: 'Auto-approving refunds without a human checkpoint is negligence.' },
  { step: 'answer', tile: 'citations', reason: 'Citations make errors visible and recoverable.' },
  { step: 'query', tile: 'disclosure', reason: 'Transparency obligation from Level 5.' },
];

export const SYNTHETIC_USERS = [
  { name: 'Ana, support lead', trait: 'Impatient. Hates extra clicks. Values speed above all.' },
  { name: 'Tomas, compliance officer', trait: 'Wants to see sources and a way to escalate. Distrusts anything without a paper trail.' },
  { name: 'Grace, new admin', trait: 'Learning the product. Appreciates explanation and confidence cues.' },
  { name: 'Ravi, finance analyst', trait: 'Cares about actions being reversible. Was burned by an automation once.' },
  { name: 'Mei, power user', trait: 'Uses the product 6 hours a day. Friction compounds for her.' },
];
