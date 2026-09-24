// Every health check comes with a suggested fix, and applying the suggestions clears the issues.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createIleadDefinition } from '../src/templates/ilead/index.js';
import { validate } from '../src/engine/validate.js';
import { suggestFixes, applyAllSuggested, draftResponse } from '../src/templates/ilead/fixes.js';
import { unknownTokens } from '../src/engine/text.js';

const PROBES = {
  'empty company': (d) => { d.context.entities.find((e) => e.key === 'company').value = ''; },
  'empty industry': (d) => { d.context.industry = ''; },
  'empty product': (d) => { d.context.entities.find((e) => e.key === 'product').value = ''; },
  'stage without a name': (d) => { d.stages[1].name = ''; },
  'duplicate stage names': (d) => { d.stages[1].name = d.stages[0].name; },
  'person without a name': (d) => { d.actors[0].name = ''; },
  'duplicate people': (d) => { d.actors[1].name = d.actors[0].name; },
  'empty event text': (d) => { d.events.find((e) => e.enabled).text = ''; },
  'empty event title': (d) => { d.events.find((e) => e.enabled).name = ''; },
  'empty welcome letter': (d) => { d.story.welcome = ''; },
  'empty product brief': (d) => { d.story.overview = ''; },
  'all actions off': (d) => { d.actions.forEach((a) => { a.enabled = false; }); },
  'no style actions': (d) => { d.actions.filter((a) => a.mechanic === 'styleChoice').forEach((a) => { a.enabled = false; }); },
  'target of 1': (d) => { d.funnel.target = 1; },
  'no target': (d) => { d.funnel.target = 0; },
  'value of 0': (d) => { d.funnel.valuePerConversion = 0; },
  'empty stage': (d) => { d.actors.filter((a) => a.pool === 'team' && a.startStage === 'qualify').forEach((a) => { a.startStage = 'lead'; }); },
  'conversion 0': (d) => { d.stages[0].conversion = 0; },
  'unknown field': (d) => { d.story.overview += ' Ask about {{prodct}}.'; },
  'shorter calendar': (d) => { d.timeline.weeks = 6; },
  'team needs one style': (d) => { d.actors.filter((a) => a.pool === 'team').forEach((a) => { a.stats[a.startStage].s = 20; a.stats[a.startStage].m = 20; }); },
  'industry changed': (d) => { d.context.industry = 'Banking'; },
  'team over the maximum': (d) => { d.team.maxSize = 5; },
  'hire pool empty': (d) => { d.actors = d.actors.filter((a) => a.pool !== 'hire'); },
  'option with no style': (d) => { delete d.actions.find((a) => a.mechanic === 'styleChoice').options[0].style; },
  'wait longer than the run': (d) => { d.actions[0].options[0].cooldownDays = 999; },
  'action longer than a week': (d) => { d.actions[0].options[0].dayCost = 9; },
  'wrong style helps': (d) => { d.actions.find((a) => a.mechanic === 'styleChoice').options[0].outcomes['2'].impact = { s: 3, m: 3, p: 3 }; },
  'event after the last week': (d) => { d.events.find((e) => e.enabled).week = 40; },
  'event on day 9': (d) => { d.events.find((e) => e.enabled).day = 9; },
};

test('every issue on every probe has a suggested fix', () => {
  for (const [name, f] of Object.entries(PROBES)) {
    const d = createIleadDefinition();
    f(d);
    const issues = validate(d);
    const s = suggestFixes(d, issues);
    const without = issues.filter((i) => !s[i.id]).map((i) => i.title);
    assert.deepEqual(without, [], `${name}: ${without.join('; ')}`);
    for (const i of issues) assert.ok(s[i.id].summary && Array.isArray(s[i.id].fields), `${name}: ${i.title} has a summary and fields`);
  }
});

test('applying the suggestions as they are clears errors and warnings', () => {
  for (const [name, f] of Object.entries(PROBES)) {
    const d = createIleadDefinition();
    f(d);
    const r = applyAllSuggested(d, validate);
    assert.deepEqual(r.left.map((i) => i.title), [], `${name} leaves issues`);
  }
});

test('the migrated template itself can be made clean with its suggestions', () => {
  const r = applyAllSuggested(createIleadDefinition(), validate);
  assert.equal(r.left.length, 0);
  assert.ok(r.applied >= 3);
});

test('an edited suggestion is applied exactly as the author changed it', () => {
  const d = createIleadDefinition();
  const issue = validate(d).find((i) => i.code === 'missing-response');
  const sg = suggestFixes(d, [issue])[issue.id];
  sg.apply(d, { text: 'My own words for {{actor}}.' });
  const o = d.actions.find((a) => a.id === issue.data.actionId).options.find((x) => x.id === issue.data.optionId);
  assert.deepEqual(o.outcomes[issue.data.outcome].messages, ['My own words for {{actor}}.']);
  assert.ok(!validate(d).some((i) => i.id === issue.id && i.title === issue.title));
});

test('drafted responses use only real fields', () => {
  const d = createIleadDefinition();
  for (const a of d.actions) for (const o of a.options) for (const k of ['0', '1', '2']) {
    const t = draftResponse(a, o, k);
    if (t) assert.deepEqual(unknownTokens(d, t), [], `${a.name} ${o.label} ${k}: ${t}`);
  }
});
