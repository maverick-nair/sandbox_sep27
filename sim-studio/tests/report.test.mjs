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

test('development report: levels, evidence, strengths, priorities and a plan from the authored content', async () => {
  const { buildDevelopment, levelOf } = await import('../src/engine/development.js');
  const s = playBot(def, 'random', 3).state;
  const r = computeReport(def, s);
  const dev = r.dev;
  assert.equal(dev.comps.length, def.report.competencies.filter((c) => c.enabled).length);
  for (const c of dev.comps) {
    assert.equal(c.levelIndex, levelOf(c.score));
    assert.ok(c.looksLike && c.keep && c.workOn && c.plan.on70 && c.plan.social20 && c.plan.formal10 && c.reflect, c.id);
    assert.ok(c.evidence.length >= 1, c.id);
    if (c.levelIndex < 4) assert.ok(c.nextLevel?.looksLike, `${c.id} shows the next level`);
  }
  assert.equal(dev.priorities.length, 2);
  assert.ok(dev.priorities.every((p) => !dev.strengths.includes(p)));
  assert.ok(dev.summary.length > 80);
  // the author's words are what learners see
  const own = createIleadDefinition();
  const c0 = dev.priorities[0];
  own.report.development.competencies[c0.id].levels[['Novice', 'Emerging', 'Competent', 'Proficient', 'Role Model'][c0.levelIndex]].workOn = 'Our own words for {{company}}.';
  const d2 = buildDevelopment(own, s, computeReport(own, s));
  assert.equal(d2.priorities.find((p) => p.id === c0.id)?.workOn, 'Our own words for Innov8 Elevators.');
});

test('Genie narrative is accepted only in the right shape, without em dashes', async () => {
  const { readNarrative, narrativePrompt } = await import('../src/engine/development.js');
  const r = computeReport(def, playBot(def, 'expert', 3).state);
  const dev = r.dev;
  assert.ok(narrativePrompt(def, dev, r).includes('Return JSON only'));
  assert.equal(readNarrative(dev, 'not json'), null);
  assert.equal(readNarrative(dev, { summary: 'short' }), null);
  const ok = readNarrative(dev, { summary: 'You led a strong quarter — the team grew in skill and morale, and you beat the target by a clear margin.', strengths: [{ id: dev.strengths[0]?.id, text: 'Good.' }, { id: 'made-up', text: 'x' }], priorities: [], observed: { adapt: 'You adapted.', nope: 'x' } });
  assert.ok(ok && !ok.summary.includes('—'));
  assert.ok(ok.strengths.every((x) => dev.strengths.some((c) => c.id === x.id)));
  assert.deepEqual(Object.keys(ok.observed), ['adapt']);
});

test('development content: complete, editable per level, upgraded without losing author text', async () => {
  const { defaultDevelopment, upgradeDevelopment, LEVELS } = await import('../src/templates/ilead/development.js');
  const d = defaultDevelopment();
  assert.equal(d.scale.length, 5);
  for (const c of Object.values(d.competencies)) for (const l of LEVELS) for (const k of ['looksLike', 'keep', 'workOn', 'on70', 'social20', 'formal10', 'reflect']) assert.ok(c.levels[l][k], `${l} ${k}`);
  assert.ok(!/—/.test(JSON.stringify(d)));
  const report = { development: { purpose: 'Mine', competencies: { upskill: { levels: { Novice: { keep: 'Mine too' } } } } } };
  upgradeDevelopment(report);
  assert.equal(report.development.purpose, 'Mine');
  assert.equal(report.development.competencies.upskill.levels.Novice.keep, 'Mine too');
  assert.ok(report.development.competencies.upskill.levels.Novice.looksLike);
  assert.ok(report.development.competencies.motivate);
});
