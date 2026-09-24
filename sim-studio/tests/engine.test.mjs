import test from 'node:test';
import assert from 'node:assert/strict';
import { createIleadDefinition } from '../src/templates/ilead/index.js';
import {
  createRun, setWeeklyStyles, takeAction, proceed, desiredStyle, styleDiff, teamIds, progress, stageEfficiency,
} from '../src/engine/engine.js';
import { playBot } from '../src/engine/bots.js';
import { runBalance } from '../src/engine/balance.js';
import { validate } from '../src/engine/validate.js';
import { computeReport } from '../src/engine/report.js';
import { renderText, contextBoundItems } from '../src/engine/text.js';
import { rescaleTimeline, applyDifficulty, setEntity } from '../src/engine/authoring.js';

const def = createIleadDefinition();

test('template migrates the whole legacy workbook', () => {
  assert.equal(def.actors.length, 20);
  assert.equal(def.actors.filter((a) => a.pool === 'team').length, 10);
  assert.equal(def.actions.length, 13);
  assert.equal(def.events.length, 15);
  assert.equal(def.triggers.length, 9);
  assert.equal(def.stages.length, 5);
  for (const a of def.actors) for (const st of def.stages) assert.ok(a.stats[st.id], `${a.name} has stats for ${st.id}`);
});

test('style mapping follows the model document, not the Con - Leadership Style sheet', () => {
  assert.equal(desiredStyle(def, 30, 20), 'directing');
  assert.equal(desiredStyle(def, 30, 80), 'guiding');
  assert.equal(desiredStyle(def, 80, 30), 'partnering');
  assert.equal(desiredStyle(def, 80, 80), 'entrusting');
  assert.equal(styleDiff(def, 'directing', 'entrusting'), 2);
  assert.equal(styleDiff(def, 'directing', 'guiding'), 1);
  assert.equal(styleDiff(def, 'partnering', 'partnering'), 0);
});

test('funnel follows output = input x ratio x (avg performance + buffer) / 100', () => {
  const run = createRun(def, { seed: 5 });
  // Sales lead starts with Kent (49) and Beth (45): (47 + 20) / 100.
  assert.ok(Math.abs(stageEfficiency(def, run, 'lead') - 0.67) < 1e-9);
});

test('a correct weekly style never hurts; setting all styles is required', () => {
  const run = createRun(def, { seed: 11 });
  assert.equal(setWeeklyStyles(def, run, {}).ok, false);
  const styles = Object.fromEntries(teamIds(run).map((id) => [id, desiredStyle(def, run.actors[id].s, run.actors[id].m)]));
  const before = Object.fromEntries(teamIds(run).map((id) => [id, run.actors[id].m]));
  assert.equal(setWeeklyStyles(def, run, styles).ok, true);
  for (const id of teamIds(run)) assert.ok(run.actors[id].m >= before[id], `${id} morale did not drop`);
  assert.equal(run.phase, 'day');
});

test('actions cost days, respect cooldowns and the one-per-stage rule', () => {
  const run = createRun(def, { seed: 3 });
  setWeeklyStyles(def, run, Object.fromEntries(teamIds(run).map((id) => [id, 'directing'])));
  const r = takeAction(def, run, { actionId: 'meet-team', optionId: 'directing', targets: [] });
  assert.equal(r.ok, true);
  assert.equal(run.day, 1);
  assert.equal(takeAction(def, run, { actionId: 'meet-team', optionId: 'guiding', targets: [] }).ok, false, 'meet the team is on a 10 day cooldown');
  assert.equal(takeAction(def, run, { actionId: 'fire', optionId: def.actions.find((a) => a.id === 'fire').options[0].id, targets: ['ruth-ether'] }).ok, true);
  assert.equal(takeAction(def, run, { actionId: 'fire', optionId: def.actions.find((a) => a.id === 'fire').options[0].id, targets: ['mandy-lobert'] }).ok, false, 'last person in Conversion cannot be fired');
});

test('reward: the top performer resents a reward given to someone else', () => {
  const run = createRun(def, { seed: 9 });
  setWeeklyStyles(def, run, Object.fromEntries(teamIds(run).map((id) => [id, 'directing'])));
  const r = takeAction(def, run, { actionId: 'reward', optionId: def.actions.find((a) => a.id === 'reward').options[0].id, targets: ['kent-goldberg'] });
  assert.equal(r.ok, true);
  const top = r.entry.results.find((x) => x.actorId === 'jack-holt');
  assert.ok(top && top.mm === 1 && top.delta.p < 0);
});

test('runs are reproducible from a seed', () => {
  const a = playBot(def, 'random', 42);
  const b = playBot(def, 'random', 42);
  assert.equal(a.conversions, b.conversions);
  assert.equal(a.state.phase, 'ended');
});

test('balance: adapting beats guessing, and the default target is reachable', () => {
  const res = runBalance(def, { runs: 6 });
  assert.ok(res.bots.expert.p50 >= 1.1, `expert p50 ${res.bots.expert.p50}`);
  assert.ok(res.bots.random.p50 < 0.7, `random p50 ${res.bots.random.p50}`);
  assert.ok(res.bots.expert.p50 - res.bots.oneStyle.p50 > 0.4);
});

test('validator surfaces the legacy content gaps', () => {
  const issues = validate(def);
  const titles = issues.map((i) => i.title).join('\n');
  assert.match(titles, /Missing copy: Style insight/);
  assert.match(titles, /Firing has no cost/);
  assert.match(titles, /is not scheduled/);
  assert.equal(issues.filter((i) => i.severity === 'error' && !/Missing copy/.test(i.title)).length, 0, titles);
});

test('context tokens re-skin the story; industry change flags situation-bound copy', () => {
  let d = setEntity(def, 'company', 'Northwind Health');
  assert.match(renderText(d, d.story.welcome), /Northwind Health/);
  assert.doesNotMatch(renderText(d, d.story.welcome), /Innov8/);
  assert.ok(contextBoundItems(d).some((i) => i.label.includes('Tragic accident')));
  d.context.industry = 'Healthcare';
  assert.ok(validate(d).some((i) => /still describe/.test(i.title)));
});

test('pronoun tokens follow the actor', () => {
  const text = def.triggers.find((t) => t.id === 'lack-of-training').text;
  assert.match(renderText(def, text, { actor: 'Beth', pronoun: 'she' }), /She blames/);
  assert.match(renderText(def, text, { actor: 'Sam', pronoun: 'they' }), /They blames|They blame/);
});

test('shorter sessions compress the calendar and keep difficulty', () => {
  const d = rescaleTimeline(def, 6);
  assert.equal(d.timeline.weeks, 6);
  assert.equal(d.funnel.weeklyInflow.length, 6);
  assert.ok(d.events.filter((e) => e.enabled).every((e) => e.week <= 6));
  assert.equal(validate(d).filter((i) => i.severity === 'error' && !/Missing copy/.test(i.title)).length, 0);
  const res = runBalance(d, { runs: 4, bots: ['expert', 'random'] });
  assert.ok(res.bots.expert.p50 > 1 && res.bots.random.p50 < 0.8, JSON.stringify([res.bots.expert.p50, res.bots.random.p50]));
});

test('difficulty presets move target and randomness together', () => {
  const hard = applyDifficulty(def, 'challenging');
  assert.equal(hard.funnel.target, Math.round(45 * 1.15));
  const back = applyDifficulty(hard, 'standard');
  assert.equal(back.funnel.target, 45);
});

test('report produces scores for every competency', () => {
  const r = playBot(def, 'expert', 7);
  const rep = computeReport(def, r.state);
  assert.equal(rep.competencies.length, 5);
  assert.ok(rep.competencies.every((c) => c.score >= 0 && c.score <= 10 && c.text));
  assert.equal(rep.objective.key, 'high');
});
