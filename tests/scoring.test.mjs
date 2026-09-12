import test from 'node:test';
import assert from 'node:assert/strict';
import { computePnL, PASS_CONDITION } from '../src/content/models.js';
import { computeGauges, TARGET_ENVELOPE } from '../src/content/pipeline.js';
import { thresholdTradeoff } from '../src/content/traces.js';
import { computeSeverity } from '../src/content/incident.js';
import { scriptedPersonaReply, PERSONAS } from '../src/content/personas.js';
import { FEATURE_CARDS } from '../src/content/featureCards.js';
import { shuffleDeck, EVENT_DECK } from '../src/content/events.js';

test('a routed portfolio meets the margin and adoption floors while all-frontier does not', () => {
  const good = computePnL({ routing: { faq: 'cached', lookup: 'mid', reasoning: 'frontier', code: 'mid', summary: 'small', hr: 'frontier' }, pricingModel: 'seat', pricePoint: 15 });
  assert.ok(good.grossMargin >= PASS_CONDITION.grossMargin, `margin ${good.grossMargin}`);
  assert.ok(good.adoption >= PASS_CONDITION.adoption, `adoption ${good.adoption}`);
  const frontier = computePnL({ routing: Object.fromEntries(['faq', 'lookup', 'reasoning', 'code', 'summary', 'hr'].map((k) => [k, 'frontier'])), pricingModel: 'seat', pricePoint: 15 });
  assert.ok(frontier.grossMargin < PASS_CONDITION.grossMargin);
});

test('all-small routing fails on adoption because query types fall under their quality need', () => {
  const small = computePnL({ routing: Object.fromEntries(['faq', 'lookup', 'reasoning', 'code', 'summary', 'hr'].map((k) => [k, 'small'])), pricingModel: 'seat', pricePoint: 8 });
  assert.ok(small.adoption < PASS_CONDITION.adoption);
});

test('mid-tier with retrieval, reranker, citations and guardrail meets the CTO envelope', () => {
  const g = computeGauges(['user_prompt', 'system_prompt', 'embedding_model', 'retrieval_index', 'reranker', 'mid_model', 'guardrail_filter', 'citation_layer']);
  assert.ok(g.meets, JSON.stringify(g));
  assert.ok(g.cost <= TARGET_ENVELOPE.costPer1k);
});

test('fine-tune everything trap maximizes quality but blows the cost target', () => {
  const g = computeGauges(['user_prompt', 'system_prompt', 'embedding_model', 'retrieval_index', 'frontier_model', 'fine_tuned_adapter', 'citation_layer']);
  assert.ok(g.quality >= 95);
  assert.ok(g.cost > TARGET_ENVELOPE.costPer1k);
  assert.ok(!g.meets);
});

test('threshold trade-off grows with the threshold', () => {
  assert.equal(thresholdTradeoff(71).hours, 0);
  assert.ok(thresholdTradeoff(90).weeks > thresholdTradeoff(80).weeks);
});

test('incident severity is seeded by earlier shortcuts', () => {
  assert.equal(computeSeverity({}).severity, 1);
  assert.equal(computeSeverity({ skippedCitationLayer: true, lowThreshold: true, overPromisedCFO: true }).severity, 4);
});

test('scripted CISO grants a signature only when all concerns are addressed', () => {
  const dana = PERSONAS.dana;
  let r = scriptedPersonaReply(dana, 'We will enforce tenant scoped access control and zero retention with the provider.', []);
  assert.equal(r.granted, false);
  r = scriptedPersonaReply(dana, 'We run a red team before launch and keep audit logging for 90 days.', r.addressed);
  assert.equal(r.granted, true);
});

test('content is consistent: 12 feature cards, 15 events, deterministic shuffle', () => {
  assert.equal(FEATURE_CARDS.length, 12);
  assert.equal(EVENT_DECK.length, 15);
  assert.deepEqual(shuffleDeck(42), shuffleDeck(42));
  assert.equal(new Set(shuffleDeck(7)).size, 15);
});
