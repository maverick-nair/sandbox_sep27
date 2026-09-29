import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIleadDefinition, migrateDefinition } from '../src/templates/ilead/index.js';
import { playBot } from '../src/engine/bots.js';
import { computeReport } from '../src/engine/report.js';
import { compactReport, aggregate, groupInsights, syntheticBenchmark, bandIndex, mismatchKey, idealProgression } from '../src/engine/group.js';
import { USER_SECTIONS, GROUP_SECTIONS } from '../src/templates/ilead/report-defaults.js';

const def = createIleadDefinition();

test('learner report carries the legacy user report sections', () => {
  const r = computeReport(def, playBot(def, 'expert', 3).state);
  assert.ok(r.revenueTarget > 0);
  assert.equal(r.consistency[0].id, 'desired-vs-actual');
  for (const k of ['desiredVsActual', 'intentVsActual', 'desiredVsIntent']) assert.ok(k in r.consistencyPct);
  assert.ok(r.distribution.length >= 8, 'a row per team member');
  assert.ok(r.actions.every((a) => ['High', 'Moderate', 'Low', 'Very low', 'No'].includes(a.impact)));
  assert.ok(r.styles.every((s) => s.accuracy === null || (s.accuracy >= 0 && s.accuracy <= 1)));
  const t = r.time.top + r.time.average + r.time.bottom;
  assert.ok(t > 0);
  assert.equal(r.cumulative.length, def.timeline.weeks);
});

test('every report section is on by default and old definitions gain the group report', () => {
  for (const k of Object.keys(USER_SECTIONS)) assert.equal(def.report.sections[k], true, k);
  for (const k of Object.keys(GROUP_SECTIONS)) assert.equal(def.report.group.sections[k], true, k);
  const old = createIleadDefinition();
  delete old.report.group;
  delete old.report.sections.distribution;
  old.report.sections.takeaways = false;
  migrateDefinition(old);
  assert.ok(old.report.group.questions.length >= 5);
  assert.equal(old.report.sections.distribution, true);
  assert.equal(old.report.sections.takeaways, false, 'author choices are kept');
});

test('group report copy has no missing strings, typos from the legacy sheet or em dashes', () => {
  const s = JSON.stringify(def.report);
  assert.ok(!/NO STRING|STYLENAME|NUMBER_REPLACEMENT|prociency|reect|acheived/.test(s));
  assert.ok(!/—/.test(s));
});

test('compact report and group aggregation', async () => {
  const rps = await syntheticBenchmark(def, 6, { seed: 11 });
  assert.equal(rps.length, 6);
  const one = compactReport(def, playBot(def, 'expert', 5).state);
  assert.ok(JSON.stringify(one).length < 2000, 'small enough for shared storage');
  const g = aggregate(def, rps);
  assert.equal(g.n, 6);
  for (const c of g.comps) assert.ok(Math.abs(c.dist.reduce((t, x) => t + x, 0) - 100) < 0.5, c.id);
  assert.ok(Math.abs(g.completion.reduce((t, x) => t + x.value, 0) - 100) < 0.5);
  assert.ok(Math.abs(g.time.top + g.time.average + g.time.bottom - 1) < 1e-6);
  assert.ok(Math.abs(g.styles.reduce((t, s) => t + s.proportion, 0) - 1) < 1e-6);
  const ins = groupInsights(def, g);
  assert.ok(Object.values(ins.comps).every((t) => t.length > 20));
  assert.ok(ins.preference.includes(g.topStyle.name));
  assert.deepEqual(aggregate(def, []), { n: 0 });
});

test('bands and mismatch thresholds match the learner report', () => {
  assert.deepEqual([0, 2, 2.1, 4, 6, 8, 8.1, 10].map(bandIndex), [0, 0, 1, 1, 2, 3, 4, 4]);
  assert.deepEqual([null, 10, 30, 60].map(mismatchKey), ['NoMismatch', 'LowMismatch', 'ModerateMismatch', 'HighMismatch']);
  const ideal = idealProgression(def);
  assert.equal(ideal.length, def.timeline.weeks);
  assert.ok(ideal.at(-1) >= def.funnel.target * 0.8);
});
