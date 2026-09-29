import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIleadDefinition, migrateDefinition } from '../src/templates/ilead/index.js';
import { playBot } from '../src/engine/bots.js';
import { progress, createRun, takeAction, setWeeklyStyles } from '../src/engine/engine.js';
import { businessOf, suggestedProfitTarget, actionCost, financeOf, revenueTarget } from '../src/engine/finance.js';
import { validate } from '../src/engine/validate.js';
import { applyAllSuggested } from '../src/templates/ilead/fixes.js';

test('revenue is the default target and scores exactly as conversions against target', () => {
  const def = createIleadDefinition();
  assert.equal(businessOf(def).metric, 'revenue');
  const s = playBot(def, 'expert', 3).state;
  const p = progress(def, s);
  assert.equal(p.metric.id, 'revenue');
  assert.equal(p.achieved, s.funnel.conversions / def.funnel.target);
  assert.equal(p.metric.target, revenueTarget(def));
});

test('operating profit counts gross margin, team cost and action spend', () => {
  const def = createIleadDefinition();
  def.business = { ...businessOf(def), metric: 'profit' };
  const s = playBot(def, 'expert', 3).state;
  const f = financeOf(def, s);
  const team = def.actors.filter((a) => a.pool === 'team').length;
  assert.ok(Math.abs(f.teamCost - team * businessOf(def).weeklyCostPerPerson * def.timeline.weeks) < team * businessOf(def).weeklyCostPerPerson, 'about a quarter of team cost');
  assert.ok(f.actionSpend > 0, 'the expert spends on actions');
  assert.ok(Math.abs(f.operatingProfit - (f.revenue * 0.4 - f.teamCost - f.actionSpend)) < 1e-6);
  const p = progress(def, s);
  assert.equal(p.metric.id, 'profit');
  assert.ok(Math.abs(p.achieved - f.operatingProfit / suggestedProfitTarget(def)) < 1e-9);
});

test('actions cost per person, team actions once', () => {
  const def = createIleadDefinition();
  const training = def.actions.find((a) => a.id === 'training');
  const energise = def.actions.find((a) => a.id === 'energise');
  assert.equal(actionCost(def, training, ['a', 'b']), 2 * businessOf(def).actionCosts.training);
  assert.equal(actionCost(def, energise, []), businessOf(def).actionCosts.energise);
  const s = createRun(def, { seed: 5 });
  setWeeklyStyles(def, s, Object.fromEntries(Object.values(s.actors).filter((a) => a.status === 'team').map((a) => [a.id, 'directing'])));
  const before = financeOf(def, s).actionSpend;
  const r = takeAction(def, s, { actionId: 'energise', optionId: energise.options[0].id, targets: [] });
  assert.ok(r.ok, r.error);
  assert.equal(financeOf(def, s).actionSpend - before, businessOf(def).actionCosts.energise);
});

test('older simulations gain the business model; health checks catch impossible profit targets', () => {
  const old = createIleadDefinition();
  delete old.business;
  migrateDefinition(old);
  assert.equal(old.business.metric, 'revenue');
  const def = createIleadDefinition();
  def.business = { ...businessOf(def), metric: 'profit', profitTarget: 1e9 };
  assert.ok(validate(def).some((i) => i.code === 'biz-profit-high'));
  def.business.grossMargin = 0;
  assert.ok(validate(def).some((i) => i.code === 'biz-margin'));
  const fixed = applyAllSuggested(def, validate).def;
  assert.ok(!validate(fixed).some((i) => i.code.startsWith('biz-')));
});
