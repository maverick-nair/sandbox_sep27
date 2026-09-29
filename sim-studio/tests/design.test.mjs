import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createIleadDefinition, migrateDefinition } from '../src/templates/ilead/index.js';
import { DEFAULT_LEVELS, levelOf } from '../src/templates/ilead/look.js';
import { validate } from '../src/engine/validate.js';
import { applyAllSuggested } from '../src/templates/ilead/fixes.js';
import { artKindFor } from '../src/engine/art-kind.js';

const codes = (def) => validate(def).map((i) => i.code);

test('new definitions come with a look, game elements, goals and a session clock', () => {
  const def = createIleadDefinition();
  assert.ok(def.look.brand && def.look.scene && def.look.productArt);
  assert.equal(def.gamification.levels.length, DEFAULT_LEVELS.length);
  assert.ok(def.story.goals.length >= 1);
  assert.equal(def.timeline.timeLimit, 90);
  assert.equal(def.team.visibility, 'numbers');
});

test('older definitions gain the look and game layer without losing author choices', () => {
  const def = createIleadDefinition();
  delete def.look; delete def.gamification; delete def.timeline.timeLimit; delete def.story.goals;
  def.team.visibility = 'hidden';
  migrateDefinition(def);
  assert.ok(def.look.brand);
  assert.ok(def.gamification.levels.length);
  assert.equal(def.timeline.timeLimit, 90);
  assert.equal(def.team.visibility, 'hidden');
});

test('levels: current, next and progress', () => {
  const g = { levels: DEFAULT_LEVELS };
  assert.equal(levelOf(g, 0).index, 0);
  const mid = levelOf(g, 70);
  assert.equal(mid.index, 1);
  assert.ok(mid.progress > 0.4 && mid.progress < 0.6);
  const top = levelOf(g, 9999);
  assert.equal(top.index, DEFAULT_LEVELS.length - 1);
  assert.ok(!top.next);
  assert.equal(top.progress, 1);
});

test('game health checks and their fixes', () => {
  const def = createIleadDefinition();
  def.gamification.levels = [{ name: 'A', xp: 10 }, { name: 'B', xp: 5 }];
  def.timeline.timeLimit = 15;
  def.team.visibility = 'hidden';
  for (const a of def.actions) if (a.mechanic === 'assess') a.enabled = false;
  const c = codes(def);
  for (const k of ['game-levels', 'time-tight', 'hidden-no-assess']) assert.ok(c.includes(k), k);
  const after = codes(applyAllSuggested(def, validate).def);
  for (const k of ['game-levels', 'time-tight', 'hidden-no-assess']) assert.ok(!after.includes(k), `${k} fixed`);
});

test('product art follows what the organization sells', () => {
  assert.equal(typeof artKindFor('cloud accounting software'), 'string');
  assert.notEqual(artKindFor('solar panels for homes'), artKindFor('savings accounts and loans'));
});
