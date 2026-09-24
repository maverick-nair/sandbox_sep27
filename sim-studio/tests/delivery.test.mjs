// Delivery, results, debrief, translation, decision health checks and the synthetic balance run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createIleadDefinition } from '../src/templates/ilead/index.js';
import { buildZip, readZip, scormManifest, playerHtml, buildScormPackage, scormAdapter } from '../src/delivery/scorm.js';
import { ltiToolConfig, validatePlatform, PLATFORM_PRESETS, testLaunchContext, agsScore } from '../src/delivery/lti.js';
import { summarise } from '../src/studio/results.js';
import { buildDebrief, resultRecord, translateDef } from '../src/learner/model.js';
import { playSynthetic } from '../src/engine/bots.js';
import { runBalanceAsync, syntheticSkill } from '../src/engine/balance.js';
import { validate } from '../src/engine/validate.js';
import { suggestFixes, applyAllSuggested } from '../src/templates/ilead/fixes.js';
import { collectTexts } from '../src/engine/text.js';
import { refKey } from '../src/templates/ilead/contextualize.js';
import { mixOf } from '../src/engine/decisions.js';
import { applyMix, convertType } from '../src/templates/ilead/decisions.js';

test('zip written in the browser reads back with valid checksums', () => {
  const bytes = buildZip([{ name: 'a.txt', data: 'hello' }, { name: 'dir/b.json', data: '{"x":1}' }, { name: 'bin', data: new Uint8Array([0, 1, 2, 255]) }]);
  const out = readZip(bytes);
  assert.equal(out['a.txt'].text, 'hello');
  assert.equal(out['dir/b.json'].text, '{"x":1}');
  assert.ok(Object.values(out).every((f) => f.ok));
});

test('SCORM package has a manifest, a self-contained player and the definition', async () => {
  const def = createIleadDefinition();
  def.delivery.passScore = 70;
  const bytes = await buildScormPackage(def, { simId: 'sim-1', version: 3, title: 'Test & "quotes"' }, { css: 'body{}', js: 'console.log("</script>")' });
  const files = readZip(bytes);
  assert.deepEqual(Object.keys(files).sort(), ['README.txt', 'imsmanifest.xml', 'index.html', 'simulation.json']);
  assert.match(files['imsmanifest.xml'].text, /<schemaversion>1\.2<\/schemaversion>/);
  assert.match(files['imsmanifest.xml'].text, /<adlcp:masteryscore>70<\/adlcp:masteryscore>/);
  assert.match(files['imsmanifest.xml'].text, /Test &amp; &quot;quotes&quot;/);
  assert.match(files['index.html'].text, /window\.__GK_PACKAGE__/);
  assert.ok(!/<\/script>"\)/.test(files['index.html'].text), 'inline script must not close early');
  assert.equal(JSON.parse(files['simulation.json'].text).meta.name, def.meta.name);
  assert.ok(scormManifest({ id: 'x y', title: 't', version: 1 }).includes('identifier="GK-xy-v1"'));
  assert.ok(playerHtml({ css: '', js: '' }, { title: '<b>', def: {} }).includes('&lt;b&gt;'));
});

test('SCORM adapter reports score and pass or fail', () => {
  const calls = [];
  const api = { LMSInitialize: () => 'true', LMSGetValue: () => 'Learner, A', LMSSetValue: (k, v) => calls.push([k, v]), LMSCommit: () => 'true', LMSFinish: () => calls.push(['finish']) };
  const a = scormAdapter(api, { passScore: 65 });
  assert.equal(a.learnerName(), 'A Learner');
  assert.equal(a.start({}), 'A Learner');
  a.finish({ score: 71.6 });
  assert.deepEqual(calls.find((c) => c[0] === 'cmi.core.score.raw'), ['cmi.core.score.raw', '72']);
  assert.deepEqual(calls.find((c) => c[0] === 'cmi.core.lesson_status' && c[1] !== 'incomplete'), ['cmi.core.lesson_status', 'passed']);
  assert.ok(calls.some((c) => c[0] === 'finish'));
  assert.equal(scormAdapter(null), null);
});

test('LTI configuration, platform validation and the score message', () => {
  const def = createIleadDefinition();
  const cfg = ltiToolConfig(def, { simId: 'sim-9', version: 2, toolUrl: 'https://tools.example.com/lti/' });
  assert.equal(cfg.target_link_uri, 'https://tools.example.com/lti/launch/sim-9');
  assert.equal(cfg.custom_fields.version, '2');
  const bad = validatePlatform({ name: '', issuer: 'http://insecure', clientId: '', deploymentId: '', authUrl: 'x', tokenUrl: '', jwksUrl: '' });
  assert.deepEqual(Object.keys(bad).sort(), ['authUrl', 'clientId', 'deploymentId', 'issuer', 'jwksUrl', 'name', 'tokenUrl']);
  const ok = { name: 'Moodle', clientId: 'abc', deploymentId: '1', ...PLATFORM_PRESETS.moodle('lms.example.edu') };
  assert.deepEqual(validatePlatform(ok), {});
  const ctx = testLaunchContext(ok, { name: 'Pat' });
  assert.equal(ctx.name, 'Pat');
  const msg = agsScore({ score: 80.4, tier: 'gold', conversions: 50, at: 0 }, ctx);
  assert.equal(msg.scoreGiven, 80);
  assert.equal(msg.activityProgress, 'Completed');
  assert.equal(msg.lineItem, ctx.lineItem);
});

test('a synthetic run makes a complete debrief and result record', () => {
  const def = createIleadDefinition();
  const run = playSynthetic(def, 4242, 0.6);
  const d = buildDebrief(def, run.state, { name: 'Sam' });
  assert.ok(d.overall.score >= 0 && d.overall.score <= 100);
  assert.ok(d.keyDecisions.length >= 3, 'key decisions are listed');
  assert.ok(d.story.length > 0 && d.strengths && d.improve && d.next.length > 0, 'story, strengths, growth and next steps');
  const rec = resultRecord(def, run.state, d, { name: 'Sam', cohortId: 'c1' });
  assert.equal(rec.completed, true);
  assert.equal(rec.name, 'Sam');
  assert.ok(Object.keys(rec.decisions).length >= 8);
  assert.ok(rec.achievements.includes('first-call'));
});

test('group report aggregates scores, criteria, concepts and decisions', () => {
  const def = createIleadDefinition();
  const recs = [0.1, 0.5, 0.9].map((sk, i) => {
    const run = playSynthetic(def, 700 + i, sk);
    return resultRecord(def, run.state, buildDebrief(def, run.state, {}), {});
  });
  const s = summarise(recs, def);
  assert.equal(s.n, 3);
  assert.equal(s.bins.reduce((t, b) => t + b.value, 0), 3);
  assert.ok(s.criteria.length > 0);
  assert.ok(s.decisions.find((x) => x.id === 'first-priority').n === 3);
  assert.ok(s.passRate >= 0 && s.passRate <= 100);
});

test('translations replace learner text and fall back to English', () => {
  const def = createIleadDefinition();
  const welcome = collectTexts(def).find((t) => t.ref.field === 'welcome');
  def.translations = { hi: { [refKey(welcome.ref)]: { text: 'नमस्ते {{ceo}}', source: welcome.text, status: 'reviewed' } } };
  def.delivery.languages = ['en', 'hi'];
  const hi = translateDef(def, 'hi');
  assert.equal(hi.story.welcome, 'नमस्ते {{ceo}}');
  assert.equal(hi.story.overview, def.story.overview);
  assert.equal(translateDef(def, 'en'), def);
  assert.equal(def.story.welcome, welcome.text, 'the source is not changed');
});

test('decision health checks each come with a working fix', () => {
  const def = createIleadDefinition();
  assert.deepEqual(validate(def).filter((i) => i.section === 'decisions' && i.severity !== 'info'), []);
  const p = (id) => def.decisions.points.find((x) => x.id === id);
  p('kent-checkin').week = 40;
  p('pipeline-stuck').options.forEach((o) => { o.correct = false; });
  p('beth-first-1to1').open.keyIdeas = [];
  p('derick-offer').requires = { flag: 'gone' };
  p('jack-bored').about = 'nobody';
  p('first-priority').situation = '';
  p('meeting-agenda').outcomes.mixed.feedback = '';
  def.scoring = { results: 0, leadership: 0, decisions: 0, recall: 0 };
  def.learning.reflections[0].week = 99;
  const issues = validate(def).filter((i) => i.section === 'decisions');
  const codes = new Set(issues.map((i) => i.code));
  for (const c of ['dp-outside', 'dp-multi-no-correct', 'dp-no-ideas', 'dp-bad-condition', 'dp-bad-person', 'dp-no-situation', 'dp-no-feedback', 'scoring-zero', 'reflection-outside']) assert.ok(codes.has(c), `missing ${c}`);
  const sugs = suggestFixes(def, issues);
  for (const i of issues) assert.ok(sugs[i.id]?.summary, `no suggestion for ${i.code}`);
  const fixed = applyAllSuggested(def, validate);
  assert.deepEqual(fixed.left.filter((i) => i.section === 'decisions').map((i) => i.code), []);
});

test('mix far from its target is flagged and the fix rebalances it', () => {
  const def = createIleadDefinition();
  def.decisions.mix.open = 60;
  const issue = validate(def).find((i) => i.code === 'dp-mix-off');
  assert.ok(issue);
  const r = applyAllSuggested(def, validate, ['warning']);
  const m = mixOf(r.def.decisions.points);
  assert.ok(Math.abs(m.open / m.total - 0.6) < 0.1, `open share ${m.open}/${m.total}`);
});

test('converting a style choice to open writes a model answer for the style the person needs', () => {
  const def = createIleadDefinition();
  const jack = def.decisions.points.find((x) => x.id === 'jack-bored');
  const open = convertType(jack, 'open', def);
  assert.equal(open.type, 'open');
  assert.ok(open.open.modelAnswer.length > 10);
  const back = convertType(open, 'single', def);
  assert.equal(back.type, 'single');
  assert.equal(back.options.length, jack.options.length);
  const locked = applyMix(def.decisions.points.map((x) => ({ ...x, lockType: true })), 90, def);
  assert.equal(mixOf(locked).open, mixOf(def.decisions.points).open, 'locked moments are never converted');
});

test('balance check plays a synthetic cohort with a realistic spread', async () => {
  const def = createIleadDefinition();
  const skills = Array.from({ length: 30 }, (_, i) => syntheticSkill(i, 30));
  assert.ok(skills[0] < 0.1 && skills.at(-1) > 0.8);
  const r = await runBalanceAsync(def, { runs: 4, learners: 24 });
  assert.equal(r.synthetic.n, 24);
  assert.ok(r.synthetic.p90 - r.synthetic.p10 > 20, 'scores spread out');
  assert.equal(r.bots.expert.trajectory.length, def.timeline.weeks);
  assert.ok(r.bots.expert.overall > r.bots.random.overall);
  assert.ok(Object.keys(r.synthetic.decisions).length >= 10);
});
