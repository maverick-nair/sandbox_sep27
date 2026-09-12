// Level 8: Launch dossier template and outcome narratives.
export const DOSSIER_SLOTS = [
  { id: 'scope', label: 'Scope', source: 'Level 1', prdKey: 'scope' },
  { id: 'architecture', label: 'Architecture', source: 'Level 2', prdKey: 'technical' },
  { id: 'evals', label: 'Eval results', source: 'Level 3', prdKey: 'evals' },
  { id: 'margin', label: 'Margin model', source: 'Level 4', prdKey: 'margin' },
  { id: 'governance', label: 'Governance sign-offs', source: 'Level 5', prdKey: 'governance' },
  { id: 'trust', label: 'Trust design', source: 'Level 6', prdKey: 'trust' },
  { id: 'postmortem', label: 'Incident postmortem', source: 'Level 7', prdKey: 'postmortem' },
];

export const BOARD_QUESTIONS = {
  commercial: [
    'Your adoption forecast assumes customers change how they find answers. What evidence from the quarter says they will?',
    'If the vendor raises prices 30 percent next year, what happens to your margin and what do you do about it?',
    'Which pricing decision would you reverse if adoption comes in at half your forecast?',
  ],
  reliability: [
    'Your eval pass rate is a number on a slide. What failure mode is it blind to?',
    'Walk me through the incident. What was the earliest decision that made it more likely?',
    'What would have to be true for you to roll this back on launch day?',
  ],
  governance: [
    'You classified this as limited risk. Which scope change would move it to high risk, and how would you know it happened?',
    'Who in this company can stop the feature, and how long does that take?',
    'What did you commit to Legal and Security that has not yet been built?',
  ],
  stakeholder: [
    'Which stakeholder did you spend the least time with, and what do they believe about this launch?',
    'You made commitments to get signatures. Name one you are least confident you can keep.',
    'The CEO promised this publicly. What did you tell them when the date moved?',
  ],
};

export const OUTCOMES = [
  { id: 'full', label: 'Full launch', minAvg: 70, minEach: 55, narrative: 'One quarter later: Helios Assist is live for all 2,400 customers. Adoption tracked the forecast within a few points, the incident postmortem became the template for the company, and the CFO quotes your kill criterion in board packs as an example of discipline. The team is scoping the second use case.' },
  { id: 'limited', label: 'Limited launch', minAvg: 58, minEach: 40, narrative: 'One quarter later: Helios Assist launched to a controlled cohort of 400 customers. The board asked for one more quarter of eval data before general availability. The margin holds, but Sales is restless and the CEO has stopped mentioning the feature in public.' },
  { id: 'delayed', label: 'Delayed launch', minAvg: 45, minEach: 25, narrative: 'One quarter later: the launch slipped a quarter. Governance sign-offs came late and the incident consumed the last sprint. The feature still exists, the team still believes in it, and you have a much better PRD than you did. The CEO has publicly re-dated the commitment.' },
  { id: 'cancelled', label: 'Cancelled', minAvg: 0, minEach: 0, narrative: 'One quarter later: Helios Assist was cancelled after the board review. The reasons were not technical. Margin, trust and governance gaps compounded, and no one could say with confidence what the feature would cost or what it would do when it was wrong. The learning is real, the launch was not.' },
];
