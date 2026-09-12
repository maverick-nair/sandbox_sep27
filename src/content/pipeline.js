// Level 2: Architecture Bench content. Gauges follow a published formula:
//   cost per 1k = sum(component cost) * cache multiplier (+ adapter fixed cost amortized)
//   p95 latency = sum(component latency) * cache multiplier
//   quality = model base + sum(component quality bonuses), capped at 100. Retrieval bonus needs an embedding model.

export const TARGET_ENVELOPE = { costPer1k: 0.40, p95Seconds: 3.0, quality: 80 };

export const COMPONENTS = [
  { id: 'user_prompt', label: 'User prompt', kind: 'input', cost: 0, latency: 0, quality: 0, required: true, desc: 'The learner question. Always present.' },
  { id: 'system_prompt', label: 'System prompt', kind: 'context', cost: 0.02, latency: 0.05, quality: 3, desc: 'Role, scope and refusal rules for the model.' },
  { id: 'retrieval_index', label: 'Retrieval index', kind: 'retrieval', cost: 0.03, latency: 0.3, quality: 10, needs: 'embedding_model', desc: 'Vector search over documentation. Needs an embedding model to earn its quality bonus.' },
  { id: 'embedding_model', label: 'Embedding model', kind: 'retrieval', cost: 0.02, latency: 0.1, quality: 0, desc: 'Turns queries and chunks into vectors.' },
  { id: 'reranker', label: 'Reranker', kind: 'retrieval', cost: 0.04, latency: 0.4, quality: 4, needs: 'retrieval_index', desc: 'Re-orders retrieved chunks for relevance.' },
  { id: 'frontier_model', label: 'Frontier model (large)', kind: 'model', cost: 0.60, latency: 2.4, quality: 85, desc: 'Highest raw quality, highest cost.' },
  { id: 'mid_model', label: 'Mid-tier model', kind: 'model', cost: 0.20, latency: 1.2, quality: 70, desc: 'Balanced cost and quality.' },
  { id: 'small_model', label: 'Small model', kind: 'model', cost: 0.05, latency: 0.6, quality: 55, desc: 'Cheap and fast. Struggles with reasoning.' },
  { id: 'response_cache', label: 'Response cache', kind: 'infra', cost: 0.01, latency: 0, quality: 0, multiplier: 0.7, desc: 'Serves repeat questions. Cuts cost and latency by 30 percent.' },
  { id: 'guardrail_filter', label: 'Guardrail filter', kind: 'safety', cost: 0.03, latency: 0.2, quality: 2, desc: 'Blocks injection patterns and sensitive topics.' },
  { id: 'citation_layer', label: 'Citation layer', kind: 'trust', cost: 0.02, latency: 0.1, quality: 3, desc: 'Attaches source passages to every answer. Makes errors visible.' },
  { id: 'human_review', label: 'Human review step', kind: 'oversight', cost: 2.0, latency: 1800, quality: 5, desc: 'A person checks every answer. Right for high stakes actions, wrong for every query.' },
  { id: 'fine_tuned_adapter', label: 'Fine-tuned adapter', kind: 'model', cost: 0.15, latency: 0.2, quality: 8, fixedCost: 250000, delayWeeks: 6, desc: 'Trains an adapter on your data. Adds six weeks and a large fixed cost.' },
];

export function computeGauges(placed) {
  const ids = placed.filter(Boolean);
  const has = (id) => ids.includes(id);
  const models = ids.filter((id) => COMPONENTS.find((c) => c.id === id)?.kind === 'model' && id !== 'fine_tuned_adapter');
  let cost = 0;
  let latency = 0;
  let quality = 0;
  let multiplier = 1;
  const notes = [];
  if (models.length === 0) notes.push('No generation model placed. Quality is zero until one is added.');
  if (models.length > 1) notes.push('Two generation models in series double cost. Pick one, or use routing in Level 4.');
  ids.forEach((id) => {
    const c = COMPONENTS.find((x) => x.id === id);
    if (!c) return;
    if (c.kind === 'model' && id !== 'fine_tuned_adapter') quality += c.quality;
    else if (c.needs && !has(c.needs)) {
      notes.push(`${c.label} adds nothing without ${COMPONENTS.find((x) => x.id === c.needs).label}.`);
    } else quality += c.quality;
    cost += c.cost;
    latency += c.latency;
    if (c.multiplier) multiplier = c.multiplier;
  });
  if (has('fine_tuned_adapter') && models.length === 0) quality = 0;
  cost *= multiplier;
  latency *= multiplier;
  if (has('fine_tuned_adapter')) {
    cost += 0.10; // amortized fixed cost
    notes.push('Fine-tuned adapter adds 250,000 fixed cost (0.10 per 1k amortized) and a six week delay.');
  }
  if (has('human_review')) notes.push('Human review on every query: p95 latency is now measured in minutes.');
  quality = Math.min(100, quality);
  const meets = cost <= TARGET_ENVELOPE.costPer1k && latency <= TARGET_ENVELOPE.p95Seconds && quality >= TARGET_ENVELOPE.quality && models.length === 1;
  return { cost: Math.round(cost * 100) / 100, latency: Math.round(latency * 100) / 100, quality: Math.round(quality), meets, notes, models };
}
