// Level 4: Margin Room content. Prices are per 1,000 queries of the given complexity.
// Facilitators can change the price tables here without touching game logic.

export const QUERY_TYPES = [
  { id: 'faq', label: 'Simple FAQ', share: 0.35, complexity: 1, minQuality: 60, note: 'Short factual questions with a single retrieval hit.' },
  { id: 'lookup', label: 'Document lookup', share: 0.25, complexity: 2, minQuality: 70, note: 'Find and quote a passage across the knowledge base.' },
  { id: 'reasoning', label: 'Multi-step reasoning', share: 0.10, complexity: 4, minQuality: 82, note: 'Combine several documents and reason about edge cases.' },
  { id: 'code', label: 'Code generation', share: 0.08, complexity: 4, minQuality: 80, note: 'Write API snippets for integrators.' },
  { id: 'summary', label: 'Summarization', share: 0.20, complexity: 2, minQuality: 68, note: 'Condense long threads or release notes.' },
  { id: 'hr', label: 'Sensitive HR query', share: 0.02, complexity: 3, minQuality: 85, sensitive: true, note: 'Questions that touch personal or policy data. Governance expects a human path.' },
];

export const MODEL_TIERS = [
  { id: 'frontier', label: 'Frontier (large)', pricePer1k: 30.0, latencyMs: 2600, quality: 92 },
  { id: 'mid', label: 'Mid-tier', pricePer1k: 8.0, latencyMs: 1300, quality: 84 },
  { id: 'small', label: 'Small', pricePer1k: 1.5, latencyMs: 500, quality: 68 },
  { id: 'cached', label: 'Cached small + retrieval', pricePer1k: 0.6, latencyMs: 350, quality: 62 },
  { id: 'human', label: 'Route to human desk', pricePer1k: 400.0, latencyMs: 3600000, quality: 97, human: true },
];

// Complexity multiplier on price and quality penalty when a tier is under-powered.
export function effectiveQuality(tier, query) {
  // Quality drops 6 points per complexity level above what the tier comfortably handles.
  const comfort = { frontier: 4, mid: 3, small: 2, cached: 1, human: 4 }[tier.id];
  const penalty = Math.max(0, query.complexity - comfort) * 6;
  return Math.max(30, tier.quality - penalty);
}

export function effectivePricePer1k(tier, query) {
  if (tier.human) return tier.pricePer1k;
  return tier.pricePer1k * (0.6 + 0.4 * query.complexity);
}

export const PRICING_MODELS = [
  { id: 'seat', label: 'Per seat add-on', unit: 'USD per seat per month', min: 2, max: 40, step: 1, default: 8 },
  { id: 'usage', label: 'Per usage', unit: 'USD per 1,000 queries', min: 5, max: 80, step: 1, default: 20 },
  { id: 'outcome', label: 'Outcome-based', unit: 'USD per resolved question', min: 0.01, max: 0.2, step: 0.01, default: 0.05 },
  { id: 'bundle', label: 'Bundled into existing plan', unit: 'USD uplift on existing plan per seat per month', min: 0, max: 15, step: 0.5, default: 3 },
];

export const MARKET = {
  customers: 2400,
  seatsPerCustomer: 40,
  queriesPerSeatPerMonth: 400,
  resolvedShare: 0.55,
  existingPlanPricePerSeat: 45,
};

export const PASS_CONDITION = { grossMargin: 55, adoption: 30 };

export const VENDOR_EVENT = {
  title: 'Vendor announcement',
  text: 'The mid-tier model vendor announces a 40 percent price cut effective next quarter. Your current contract runs to quarter end.',
  options: [
    { id: 'reroute', label: 'Re-route to mid-tier now', note: 'Assume the cut, move traffic today.' },
    { id: 'wait', label: 'Wait for the cut to land', note: 'Keep the current routing until the new price is live.' },
    { id: 'hedge', label: 'Hedge', note: 'Move a pilot slice now, hold the rest, negotiate an early effective date.' },
  ],
};

// Compute the P&L for a routing and pricing configuration.
export function computePnL({ routing, pricingModel, pricePoint, fineTuneTrap }) {
  const totalSeats = MARKET.customers * MARKET.seatsPerCustomer;
  const queriesPerMonth = totalSeats * MARKET.queriesPerSeatPerMonth;

  let weightedQuality = 0;
  let costPerMonth = 0;
  let humanShare = 0;
  let unmetShare = 0; // traffic whose tier quality is below what the query type needs
  let sensitiveUnprotected = false;
  QUERY_TYPES.forEach((q) => {
    const tierId = routing[q.id];
    const tier = MODEL_TIERS.find((t) => t.id === tierId);
    const volume = queriesPerMonth * q.share;
    if (!tier) {
      weightedQuality += 0;
      return;
    }
    const quality = effectiveQuality(tier, q);
    weightedQuality += quality * q.share;
    if (quality < q.minQuality) unmetShare += q.share;
    costPerMonth += (volume / 1000) * effectivePricePer1k(tier, q);
    if (tier.human) humanShare += q.share;
    if (q.sensitive && !tier.human && tier.id !== 'frontier') sensitiveUnprotected = true;
  });

  // Adoption forecast: quality raises it, price lowers it, human routing slows it.
  const qualityFactor = Math.max(0, (weightedQuality - 50) / 40); // 0 at 50 quality, 1 at 90
  const pm = PRICING_MODELS.find((p) => p.id === pricingModel);
  const priceNorm = pm ? (pricePoint - pm.min) / (pm.max - pm.min) : 0.5;
  let adoption = 0.15 + 0.6 * qualityFactor - 0.3 * priceNorm;
  if (pricingModel === 'bundle') adoption += 0.2;
  if (pricingModel === 'outcome') adoption += 0.05;
  adoption -= humanShare * 0.4;
  adoption -= unmetShare * 0.6; // users churn from query types the tier cannot handle
  adoption = Math.max(0.02, Math.min(0.85, adoption));

  const adoptingSeats = totalSeats * adoption;
  const adoptingQueries = adoptingSeats * MARKET.queriesPerSeatPerMonth;
  let revenue = 0;
  if (pricingModel === 'seat') revenue = adoptingSeats * pricePoint;
  if (pricingModel === 'usage') revenue = (adoptingQueries / 1000) * pricePoint;
  if (pricingModel === 'outcome') revenue = adoptingQueries * MARKET.resolvedShare * pricePoint;
  if (pricingModel === 'bundle') revenue = adoptingSeats * pricePoint;

  const cost = costPerMonth * adoption + (fineTuneTrap ? 18000 : 0); // adapter hosting and maintenance is fixed
  const grossMargin = revenue > 0 ? ((revenue - cost) / revenue) * 100 : -100;
  const routedAll = QUERY_TYPES.every((q) => routing[q.id]);
  return {
    weightedQuality: Math.round(weightedQuality),
    adoption: Math.round(adoption * 100),
    revenue: Math.round(revenue),
    cost: Math.round(cost),
    grossMargin: Math.round(grossMargin * 10) / 10,
    humanShare: Math.round(humanShare * 100),
    unmetShare: Math.round(unmetShare * 100),
    sensitiveUnprotected,
    routedAll,
  };
}
