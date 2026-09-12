export * from './featureCards.js';
export * from './traces.js';
export * from './models.js';
export * from './personas.js';
export * from './events.js';
export * from './badges.js';
export * from './pipeline.js';
export * from './uxPatterns.js';
export * from './incident.js';
export * from './dossier.js';

// Bump when card, trace, component or persona ids change so in-progress drafts are reset safely.
export const CONTENT_VERSION = 2;

export const LEVELS = [
  { id: 1, title: 'Opportunity Triage', module: 'AI foundations and when not to use AI', skill: 'Choosing where AI belongs', meters: ['commercial', 'governance'] },
  { id: 2, title: 'Architecture Bench', module: 'RAG, context engineering and the AI PRD', skill: 'Designing to a cost, latency and quality envelope', meters: ['reliability', 'commercial'] },
  { id: 3, title: 'Eval Lab', module: 'Evals, reliability and hallucination management', skill: 'Building evals and setting a ship threshold', meters: ['reliability'] },
  { id: 4, title: 'Margin Room', module: 'AI unit economics and model portfolio', skill: 'Routing and pricing for margin', meters: ['commercial'] },
  { id: 5, title: 'The Gauntlet', module: 'Governance and getting to yes', skill: 'Winning approvals with evidence', meters: ['governance', 'stakeholder'] },
  { id: 6, title: 'Trust Studio', module: 'AI UX, human-in-the-loop and trust', skill: 'Placing oversight where risk lives', meters: ['reliability', 'commercial'] },
  { id: 7, title: 'Incident', module: 'Reliability under pressure', skill: 'Sequencing response and communicating honestly', meters: ['reliability', 'stakeholder', 'governance'] },
  { id: 8, title: 'Launch Day and Board Pitch', module: 'Capstone', skill: 'Defending the whole decision chain', meters: ['commercial', 'reliability', 'governance', 'stakeholder'] },
];

export const METER_LABELS = {
  commercial: 'Commercial',
  reliability: 'Reliability',
  governance: 'Governance',
  stakeholder: 'Stakeholder',
};

export const INITIAL_CURRENCIES = { compute: 100, hours: 400, capital: 50 };
export const INITIAL_METERS = { commercial: 50, reliability: 50, governance: 50, stakeholder: 50 };
