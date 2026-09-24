// Decision moments: interaction types, evaluation, consequences, branching, delayed effects,
// the 70:30 mix, open-response evaluation and the final score.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createIleadDefinition } from '../src/templates/ilead/index.js';
import { createRun, setWeeklyStyles, proceed, teamIds, desiredStyle } from '../src/engine/engine.js';
import { initDecisions, dueDecisions, resolveDecision, afterTime, mixOf, evaluateDecision, conditionMet, recallItem, answerRecall, checkAchievements, overallScore, say, textVars, INTERACTION_TYPES } from '../src/engine/decisions.js';
import { evaluateOpen, parseGenieEval, openEvalPrompt } from '../src/engine/nlp.js';
import { convertType, applyMix } from '../src/templates/ilead/decisions.js';
import { playBot, playSynthetic } from '../src/engine/bots.js';
import { computeReport } from '../src/engine/report.js';
import { unknownTokens, collectTexts } from '../src/engine/text.js';
import { rescaleTimeline } from '../src/engine/authoring.js';

const def = () => createIleadDefinition();
const run = (d) => { const s = createRun(d, { seed: 7 }); initDecisions(d, s); return s; };
const dp = (d, id) => d.decisions.points.find((p) => p.id === id);
const styleAll = (d, s) => setWeeklyStyles(d, s, Object.fromEntries(teamIds(s).map((id) => [id, desiredStyle(d, s.actors[id].s, s.actors[id].m)])));

test('the template ships every interaction type at about 70:30', () => {
  const d = def();
  const types = new Set(d.decisions.points.map((p) => p.type));
  for (const t of Object.keys(INTERACTION_TYPES)) assert.ok(types.has(t), `has ${t}`);
  const mix = mixOf(d.decisions.points);
  assert.ok(Math.abs(mix.openShare - 0.3) <= 0.05, `open share ${mix.openShare}`);
  assert.equal(d.decisions.mix.open, 30);
});

test('all decision text uses only real fields', () => {
  const d = def();
  for (const t of collectTexts(d).filter((x) => x.section === 'decisions')) assert.deepEqual(unknownTokens(d, t.text), [], t.label);
});

test('moments arrive on their day and expire at the end of the week', () => {
  const d = def();
  const s = run(d);
  assert.deepEqual(dueDecisions(d, s).map((p) => p.id), ['first-priority']);
  styleAll(d, s);
  proceed(d, s); proceed(d, s);
  assert.ok(dueDecisions(d, s).some((p) => p.id === 'kent-checkin'));
  while (s.phase !== 'weekStart') { proceed(d, s); afterTime(d, s); }
  assert.equal(s.dx.answered['first-priority'].expired, true, 'an unanswered moment resolves as no response');
  assert.ok(s.log.feed.some((f) => /no reply/i.test(f.title)));
});

test('single choice with styles is judged against what the person needs now', () => {
  const d = def();
  const s = run(d);
  const k = dp(d, 'kent-checkin');
  const need = desiredStyle(d, s.actors['kent-goldberg'].s, s.actors['kent-goldberg'].m);
  const right = evaluateDecision(d, s, k, { optionId: need });
  const wrong = evaluateDecision(d, s, k, { optionId: 'entrusting' });
  assert.equal(right.band, 'strong');
  assert.equal(wrong.band, 'weak');
  const before = s.actors['kent-goldberg'].m;
  const entry = resolveDecision(d, s, k, { optionId: need });
  assert.ok(s.actors['kent-goldberg'].m > before, 'consequences reach the person');
  assert.ok(entry.effects.some((e) => /morale/.test(e.label)));
  assert.match(entry.feedback, /Directing/);
});

test('multiple select, ranking and scenario score and branch', () => {
  const d = def();
  const s = run(d);
  const multi = dp(d, 'pipeline-stuck');
  assert.equal(evaluateDecision(d, s, multi, { optionIds: ['coach-qualifiers', 'move-strong', 'lead-quality'] }).score, 100);
  assert.ok(evaluateDecision(d, s, multi, { optionIds: ['more-calls', 'name-shame'] }).score < 40);
  const rank = dp(d, 'meeting-agenda');
  assert.equal(evaluateDecision(d, s, rank, { order: ['wins', 'blockers', 'training', 'board'] }).score, 100);
  assert.ok(evaluateDecision(d, s, rank, { order: ['board', 'training', 'blockers', 'wins'] }).score < 40);
  // Backing the finder of the lead opens a later branch; the other branch closes.
  resolveDecision(d, s, dp(d, 'lead-dispute'), { optionId: 'first' });
  assert.ok(conditionMet(dp(d, 'derick-offer').requires, s.dx));
  assert.ok(!conditionMet(dp(d, 'team-momentum').requires, s.dx));
  assert.equal(s.dx.delayed.length, 1, 'and sets a consequence for later');
});

test('delayed consequences land weeks later', () => {
  const d = def();
  const s = run(d);
  resolveDecision(d, s, dp(d, 'first-priority'), { optionId: 'new-targets' });
  const trust = s.dx.kpis.trust;
  let guard = 0;
  while (!s.dx.landed.length && guard++ < 200) { if (s.phase === 'weekStart') styleAll(d, s); else proceed(d, s); afterTime(d, s); }
  assert.equal(s.dx.landed[0].title, 'Stand-up fatigue');
  assert.ok(s.dx.kpis.trust < trust);
});

test('variants change the context of later moments', () => {
  const d = def();
  const s = run(d);
  const ceo = dp(d, 'ceo-update');
  const plain = say(d, s, ceo, ceo.situation);
  s.dx.flags['fixed-bottleneck'] = true;
  const { situationText } = { situationText: (x) => x };
  assert.ok(plain.includes('conversions'));
  assert.match(say(d, s, ceo, ceo.variants[0].text), /Qualify is moving better/);
});

test('open responses are evaluated against criteria and key ideas', () => {
  const d = def();
  const s = run(d);
  const p = dp(d, 'peter-feedback');
  const vars = textVars(d, s, p);
  const strong = evaluateOpen(d, p, say(d, s, p, p.open.modelAnswer), { vars, state: s });
  const weak = evaluateOpen(d, p, 'Work harder.', { vars, state: s });
  const harsh = evaluateOpen(d, p, 'Your work is pathetic and lazy. This is your last chance or you are fired, it is your fault.', { vars, state: s });
  assert.ok(strong.score >= 70, `model answer ${strong.score}`);
  assert.ok(weak.score <= 35);
  assert.equal(harsh.criteria.find((c) => c.id === 'judgment').score, 0);
  assert.equal(strong.criteria.length, 6);
  assert.ok(strong.ideas.every((i) => i.met));
  assert.match(weak.feedback, /short/);
  // Genie's judgement replaces the built-in one when it answers in shape.
  const g = parseGenieEval(d, p, { criteria: strong.criteria.map((c) => ({ id: c.id, score: 40, note: 'n' })), feedback: 'ok' }, strong);
  assert.equal(g.score, 40);
  assert.equal(g.by, 'genie');
  assert.equal(parseGenieEval(d, p, { nonsense: true }, strong), strong);
  assert.match(openEvalPrompt(d, p, 'hi', vars), /Criteria/);
});

test('interaction types convert both ways and the mix is configurable', () => {
  const d = def();
  const open = convertType(dp(d, 'first-priority'), 'open');
  assert.equal(open.type, 'open');
  assert.ok(open.open.keyIdeas.length && open.outcomes.strong);
  const back = convertType(open, 'scenario');
  assert.equal(back.options.length, 4);
  const beth = convertType(dp(d, 'beth-first-1to1'), 'multi');
  assert.equal(beth.type, 'multi');
  assert.ok(beth.options.some((o) => o.correct));
  for (const pct of [0, 30, 50, 80]) {
    const mix = mixOf(applyMix(d.decisions.points, pct));
    assert.ok(Math.abs(mix.open - Math.round((mix.total * pct) / 100)) <= 1, `${pct}%: ${mix.open} of ${mix.total}`);
  }
});

test('retrieval practice, achievements and the final score', () => {
  const d = def();
  const s = run(d);
  styleAll(d, s);
  const item = recallItem(d, s);
  assert.ok(item.q && item.options.length === 4);
  assert.equal(answerRecall(d, s, item, item.answer), true);
  resolveDecision(d, s, dp(d, 'first-priority'), { optionId: 'one-to-ones' });
  assert.deepEqual(checkAchievements(d, s).includes('first-call'), true);
  const o = overallScore(d, s, computeReport(d, s).competencies);
  assert.ok(o.score >= 0 && o.score <= 100 && o.tier);
});

test('decisions move the outcome: adaptive beats guessing beats silence', () => {
  const d = def();
  const avg = (id) => [1, 2, 3].map((k) => playBot(d, id, 300 + k)).reduce((t, r) => t + r.overall, 0) / 3;
  const expert = avg('expert'); const random = avg('random'); const passive = avg('passive');
  assert.ok(expert > random + 25 && random > passive, `${expert} ${random} ${passive}`);
  const low = playSynthetic(d, 9, 0.1).overall; const high = playSynthetic(d, 9, 0.9).overall;
  assert.ok(high > low + 20);
});

test('shorter sessions move decision moments with the calendar', () => {
  const d = rescaleTimeline(def(), 6);
  assert.ok(d.decisions.points.every((p) => p.week >= 1 && p.week <= 6));
  assert.ok(d.learning.reflections.every((r) => r.week <= 6));
});
