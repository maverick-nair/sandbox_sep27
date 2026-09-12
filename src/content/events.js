// Event deck. One card is drawn per level from Level 3 onward.
// effects apply immediately; a micro-decision, when present, offers two options with their own effects.

export const EVENT_DECK = [
  { id: 'competitor-launch', title: 'Competitor launches an AI assistant', text: 'A competitor announces a documentation assistant with citations. Three of your top accounts ask when yours ships.', effects: { meters: { commercial: -3 }, currencies: { capital: 4 } },
    decision: { prompt: 'Sales wants a public date today.', options: [
      { id: 'commit', label: 'Commit to a public date', effects: { currencies: { capital: 6 }, meters: { stakeholder: 3, reliability: -4 } }, note: 'Goodwill now, pressure later.' },
      { id: 'hold', label: 'Hold the date, share the eval plan instead', effects: { meters: { reliability: 2, stakeholder: -1 } }, note: 'Less exciting, more defensible.' },
    ] } },
  { id: 'model-deprecation', title: 'Model deprecation notice', text: 'The vendor will retire the mid-tier model version you benchmarked in 90 days.', effects: { currencies: { hours: -20 } },
    decision: { prompt: 'Engineering asks how to handle it.', options: [
      { id: 'abstraction', label: 'Add a model abstraction layer now', effects: { currencies: { hours: -30 }, meters: { reliability: 4 } }, note: 'Costs hours, removes vendor lock-in.' },
      { id: 'later', label: 'Migrate after launch', effects: { meters: { reliability: -3 } }, note: 'Saves hours, adds a known risk.' },
    ] } },
  { id: 'dsar', title: 'Data subject access request', text: 'An EU user asks what personal data the assistant processed about them. Legal needs an answer in 30 days.', effects: { meters: { governance: -2 }, currencies: { hours: -15 } } },
  { id: 'viral-review', title: 'Viral positive review', text: 'A customer admin posts a glowing thread about your beta. Inbound demo requests double.', effects: { meters: { commercial: 4, stakeholder: 2 }, currencies: { capital: 5 } } },
  { id: 'engineer-resigns', title: 'Senior engineer resigns', text: 'Your retrieval engineer gives notice. Two weeks of knowledge transfer at best.', effects: { currencies: { hours: -40 } },
    decision: { prompt: 'How do you cover the gap?', options: [
      { id: 'contractor', label: 'Hire a contractor', effects: { currencies: { compute: -8 }, meters: { reliability: 1 } }, note: 'Spends budget, keeps pace.' },
      { id: 'descope', label: 'Descope the reranker', effects: { meters: { reliability: -2, commercial: -1 } }, note: 'Keeps budget, lowers quality.' },
    ] } },
  { id: 'regulator-paper', title: 'Regulator consultation paper', text: 'A regulator publishes draft guidance on AI transparency for enterprise software. Comments due in six weeks.', effects: { meters: { governance: 2 } },
    decision: { prompt: 'Legal asks whether to respond.', options: [
      { id: 'respond', label: 'Submit a response with Legal', effects: { currencies: { hours: -10 }, meters: { governance: 4, stakeholder: 2 } }, note: 'Shapes the rule, costs time.' },
      { id: 'monitor', label: 'Monitor only', effects: {}, note: 'No cost, no influence.' },
    ] } },
  { id: 'vendor-outage', title: 'Provider outage', text: 'Your model provider has a 3 hour outage. Your staging environment shows no fallback path.', effects: { meters: { reliability: -3 } },
    decision: { prompt: 'Add a fallback?', options: [
      { id: 'fallback', label: 'Add a second provider fallback', effects: { currencies: { hours: -25, compute: -5 }, meters: { reliability: 5 } }, note: 'Resilience costs hours and budget.' },
      { id: 'accept', label: 'Accept the dependency', effects: { meters: { reliability: -1 } }, note: 'Cheap now.' },
    ] } },
  { id: 'budget-freeze', title: 'Quarterly budget freeze', text: 'Finance freezes discretionary spend for four weeks. Vendor evaluations pause.', effects: { currencies: { compute: -10 } } },
  { id: 'exec-demo', title: 'CEO wants a live demo', text: 'The CEO wants to demo Helios Assist to a prospect on Thursday.', effects: {},
    decision: { prompt: 'What do you show?', options: [
      { id: 'live', label: 'Live demo on production data', effects: { meters: { stakeholder: 4, reliability: -3 } }, note: 'Impressive if it works.' },
      { id: 'scripted', label: 'Scripted demo on a golden set', effects: { meters: { stakeholder: 2, reliability: 1 } }, note: 'Safe and honest about scope.' },
    ] } },
  { id: 'customer-council', title: 'Customer advisory council', text: 'Twelve customer admins volunteer to test the beta and give structured feedback.', effects: { meters: { commercial: 2, stakeholder: 2 }, currencies: { hours: -10 } } },
  { id: 'prompt-injection-blog', title: 'Prompt injection disclosure', text: 'A researcher publishes an injection attack against a competitor product using poisoned documents.', effects: { meters: { governance: -2 } },
    decision: { prompt: 'Security asks for a response.', options: [
      { id: 'test', label: 'Run the attack against your pipeline this sprint', effects: { currencies: { hours: -20 }, meters: { reliability: 3, governance: 3 } }, note: 'Find it before a customer does.' },
      { id: 'later', label: 'Schedule for after launch', effects: { meters: { governance: -2 } }, note: 'Known gap, deferred.' },
    ] } },
  { id: 'pricing-pushback', title: 'Procurement pushback', text: 'Two large accounts refuse any per-usage pricing. They want predictability.', effects: { meters: { commercial: -2 } } },
  { id: 'hallucination-screenshot', title: 'Beta hallucination screenshot', text: 'A beta user posts a screenshot of a confidently wrong answer in your community forum.', effects: { meters: { reliability: -3, stakeholder: -2 } } },
  { id: 'partner-offer', title: 'Cloud partner credit offer', text: 'Your cloud provider offers 20,000 in inference credits if you publish a joint case study.', effects: { currencies: { compute: 15 } },
    decision: { prompt: 'Accept the credits?', options: [
      { id: 'accept', label: 'Accept and commit to the case study', effects: { currencies: { compute: 10 }, meters: { governance: -1 } }, note: 'Budget relief, a public commitment.' },
      { id: 'decline', label: 'Decline', effects: {}, note: 'Independence intact.' },
    ] } },
  { id: 'analyst-briefing', title: 'Analyst briefing request', text: 'An industry analyst wants a briefing on your AI roadmap next week.', effects: { currencies: { capital: 3 }, meters: { stakeholder: 1 } } },
];

export function shuffleDeck(seed = Date.now()) {
  // Deterministic Fisher-Yates using a small LCG so a saved game replays the same deck.
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const ids = EVENT_DECK.map((e) => e.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}
