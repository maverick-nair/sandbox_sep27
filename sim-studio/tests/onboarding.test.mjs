// Learner onboarding: defaults, migration, texts (tokens, translation, editing) and health checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createIleadDefinition, migrateDefinition } from '../src/templates/ilead/index.js';
import { defaultOnboarding, CHAPTER_KINDS } from '../src/templates/ilead/onboarding.js';
import { validate } from '../src/engine/validate.js';
import { suggestFixes, applyAllSuggested } from '../src/templates/ilead/fixes.js';
import { collectTexts, unknownTokens, renderText } from '../src/engine/text.js';
import { setTextAt } from '../src/engine/authoring.js';
import { translateDef } from '../src/learner/model.js';
import { refKey } from '../src/templates/ilead/contextualize.js';

test('every new simulation has a seven-part briefing before play', () => {
  const def = createIleadDefinition();
  assert.equal(def.onboarding.enabled, true);
  assert.deepEqual(def.onboarding.chapters.map((c) => c.kind), ['welcome', 'company', 'product', 'targets', 'team', 'model', 'howto']);
  for (const c of def.onboarding.chapters) assert.ok(CHAPTER_KINDS[c.kind]);
  assert.equal(validate(def).filter((i) => i.section === 'onboarding').length, 0);
});

test('older simulations get the briefing when loaded', () => {
  const def = createIleadDefinition();
  delete def.onboarding;
  migrateDefinition(def);
  assert.equal(def.onboarding.chapters.length, 7);
});

test('a briefing saved before welcome, product and targets gains them, in place', async () => {
  const { upgradeOnboarding } = await import('../src/templates/ilead/onboarding.js');
  const ob = { chapters: [{ id: 'company', kind: 'company' }, { id: 'mission', kind: 'mission' }, { id: 'values', kind: 'custom' }, { id: 'team', kind: 'team' }] };
  upgradeOnboarding(ob);
  assert.deepEqual(ob.chapters.map((c) => c.kind), ['company', 'mission', 'product', 'targets', 'custom', 'team']);
});

test('onboarding texts use known fields, follow tailoring and can be translated and edited', () => {
  const def = createIleadDefinition();
  const texts = collectTexts(def).filter((t) => t.section === 'onboarding');
  assert.ok(texts.length >= 10);
  for (const t of texts) assert.deepEqual(unknownTokens(def, t.text), [], t.label);
  def.context.entities.find((e) => e.key === 'company').value = 'Meridian Bank';
  assert.equal(renderText(def, def.onboarding.chapters.find((c) => c.kind === 'company').title), 'Welcome to Meridian Bank');
  const fact = texts.find((t) => t.ref.field === 'fact');
  setTextAt(def, fact.ref, 'Home loans');
  assert.equal(def.onboarding.chapters.find((c) => c.kind === 'company').facts[0].value, 'Home loans');
  const title = texts.find((t) => t.ref.chapterId === 'targets' && t.ref.field === 'title');
  def.translations = { es: { [refKey(title.ref)]: { text: 'Tu misión', source: title.text, status: 'reviewed' } } };
  assert.equal(translateDef(def, 'es').onboarding.chapters.find((c) => c.id === 'targets').title, 'Tu misión');
});

test('onboarding health checks each have a fix that clears them', () => {
  const def = createIleadDefinition();
  def.onboarding.chapters.push({ id: 'values', kind: 'custom', enabled: true, title: '', lead: '', body: '' });
  def.onboarding.chapters.find((c) => c.kind === 'company').facts.push({ label: 'Customers', value: '' });
  def.onboarding.teamToMeet = 50;
  const issues = validate(def).filter((i) => i.section === 'onboarding');
  const codes = new Set(issues.map((i) => i.code));
  for (const c of ['ob-no-title', 'ob-custom-empty', 'ob-fact-empty', 'ob-team-too-many']) assert.ok(codes.has(c), `missing ${c}`);
  const sugs = suggestFixes(def, issues);
  for (const i of issues) assert.ok(sugs[i.id]?.summary, i.code);
  const r = applyAllSuggested(def, validate);
  assert.deepEqual(r.left.filter((i) => i.section === 'onboarding').map((i) => i.code), []);

  const off = createIleadDefinition();
  off.onboarding.enabled = false;
  assert.ok(validate(off).some((i) => i.code === 'ob-off'));
  const back = applyAllSuggested(off, validate, ['warning']);
  assert.equal(back.def.onboarding.enabled, true);
  assert.equal(defaultOnboarding().chapters.length, 7);
});
