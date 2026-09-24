'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../server/engine');
const { load, validateMission } = require('../server/content');

test('content: all missions validate and path ends with the boss', () => {
  const k = load();
  assert.ok(k.missions.length >= 8);
  assert.equal(k.path.at(-1).id, 'agentic');
  for (const n of k.path.filter(x => x.type === 'chest')) assert.ok(n.needs.length >= 1);
});

test('content: validator rejects dashes and missing fields', () => {
  const k = load(); const m = JSON.parse(JSON.stringify(k.missions[0]));
  m.setup = 'Bad — dash'; m.facts.pop();
  const errs = validateMission(m, k.game.SKILLS);
  assert.ok(errs.some(e => e.includes('dashes'))); assert.ok(errs.some(e => e.includes('3 facts')));
});

test('dayKey uses the learner time zone', () => {
  const t = Date.parse('2026-09-25T02:00:00+05:30');
  assert.equal(E.dayKey(t, 'Asia/Kolkata'), '2026-09-25');
  assert.equal(E.dayKey(t, 'UTC'), '2026-09-24');
  assert.equal(E.dayKey(t, 'Not/AZone'), '2026-09-24');
});

test('streak counts consecutive days and shields bridge one gap', () => {
  const now = Date.parse('2026-09-24T12:00:00Z');
  assert.equal(E.streakInfo(['2026-09-22', '2026-09-23', '2026-09-24'], 'UTC', now).n, 3);
  const days = ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-20', '2026-09-21', '2026-09-23', '2026-09-24'];
  const s = E.streakInfo(days, 'UTC', now); assert.equal(s.n, 4); assert.equal(s.shields, 0);
  assert.equal(E.streakInfo(['2026-09-23'], 'UTC', now).n, 1, 'yesterday still counts until today ends');
});

test('rating weights difficulty, uses best attempt, and ramps to 3 missions', () => {
  const k = load(); const T = k.game.TIERS;
  const one = E.rating([{ mission_id: 'promise', score: 90 }], T, k.byId); assert.equal(one.value, 30);
  const grind = E.rating([{ mission_id: 'promise', score: 90 }, { mission_id: 'promise', score: 60 }, { mission_id: 'promise', score: 90 }], T, k.byId);
  assert.equal(grind.value, one.value, 'repeats do not raise the rating');
  const three = E.rating([{ mission_id: 'promise', score: 80 }, { mission_id: 'evalgate', score: 80 }, { mission_id: 'agentic', score: 80 }], T, k.byId);
  assert.equal(three.value, Math.round((80 + 80 + 96) / 3 * 10) / 10);
});

test('improvement is first-to-best gain on replayed missions', () => {
  assert.equal(E.improvement([{ mission_id: 'a', score: 50, created_at: 1 }, { mission_id: 'a', score: 80, created_at: 2 }, { mission_id: 'b', score: 70, created_at: 3 }]), 30);
  assert.equal(E.improvement([{ mission_id: 'a', score: 50, created_at: 1 }]), null);
});

test('anti-gaming: keyword lists and repeats are detected, real sentences are not', () => {
  assert.equal(E.isStuffed(['pilot metric eval consent human manager risk threshold evidence data']), true);
  assert.equal(E.isStuffed(['Why two weeks?', 'Why two weeks?']), true);
  assert.equal(E.isStuffed(['What is the client trying to achieve?', 'I suggest a three week pilot with 200 new RMs, measured on ramp time.']), false);
});

test('over-promise detection respects negation', () => {
  assert.equal(E.isOverpromise('Yes, we guarantee it works every time.'), true);
  assert.equal(E.isOverpromise("I can't promise 98%, and we won't guarantee that."), false);
});

test('scoring: stuffing caps rubric, walk-out caps below pass, stars follow thresholds', () => {
  const k = load(); const m = k.byId.promise; const R = k.game.rules;
  const good = { criteria: { c1: { score: 4 }, c2: { score: 4 }, c3: { score: 4 }, c4: { score: 4 } } };
  const base = { turns: [{ role: 'learner', text: 'What does Meridian want to achieve?' }, { role: 'learner', text: 'Why is the deadline two weeks?' }], revealed: ['f1', 'f2', 'f3'], walkout: false, rationale: 'A pilot protects the renewal and tests the languages.' };
  const ok = E.scoreAttempt(base, m, { pts: 25 }, good, R); assert.equal(ok.score, 100); assert.equal(ok.stars, 3);
  const walk = E.scoreAttempt({ ...base, walkout: true }, m, { pts: 25 }, good, R); assert.equal(walk.score, R.PASS - 1); assert.equal(walk.stars, 0);
  const stuffed = E.scoreAttempt({ ...base, turns: [{ role: 'learner', text: 'pilot metric eval consent human risk evidence data' }] }, m, { pts: 25 }, good, R);
  assert.ok(stuffed.score < R.PASS, 'keyword stuffing cannot pass even if the assessor was fooled');
  assert.equal(E.starsFor(84, 3, 70), 1); assert.equal(E.starsFor(85, 1, 70), 2); assert.equal(E.starsFor(92, 2, 70), 2); assert.equal(E.starsFor(92, 3, 70), 3);
});

test('scripted persona reveals facts only for questions', () => {
  const k = load(); const m = k.byId.promise;
  const st = { revealed: [], learnerTurns: 1, turns: [], flags: [], evidenceUsed: [] };
  assert.deepEqual(E.scriptedPersona(st, m, 'We can ship it, no problem.', null).revealed, []);
  assert.deepEqual(E.scriptedPersona(st, m, 'Why the two weeks? Is there a renewal date?', null).revealed, ['f3']);
});
