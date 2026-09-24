// Regression tests for the QA report findings (docs/QA_REPORT.md). Each test names its finding.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createIleadDefinition } from '../src/templates/ilead/index.js';
import { readBrief, mergeGenieBrief } from '../src/templates/ilead/brief.js';
import { applyBriefSpecifics, likelyPronoun } from '../src/templates/ilead/brief-apply.js';
import { proposeContext, applyProposals, locationPack, suggestOfferingName } from '../src/templates/ilead/contextualize.js';
import { validate, schemaProblems } from '../src/engine/validate.js';
import { renderText } from '../src/engine/text.js';
import { mergeSims, compactVersions } from '../src/studio/store.js';

const base = createIleadDefinition().context.profile;
const read = (instructions, extra = {}) => readBrief({ instructions, outcomes: [], chips: [], outcomeText: '', constraints: '', ...extra }, base);
const tailor = (profile) => {
  const def = createIleadDefinition();
  const p = { ...base, ...profile };
  return applyProposals(def, proposeContext(def, p), p);
};

test('QA-01 old versions are compacted so storage does not fill up', () => {
  const versions = Array.from({ length: 9 }, (_, i) => ({ version: i + 1, note: `v${i + 1}`, at: i, def: { big: 'x'.repeat(10) } }));
  const out = compactVersions(versions, 5);
  assert.equal(out.length, 9, 'history stays complete');
  assert.equal(out.filter((v) => v.def).length, 5, 'only the newest five keep a full copy');
  assert.ok(out[0].trimmed && !out[0].def);
  assert.ok(out.at(-1).def);
});

test('QA-02 an unnamed product never leaves a gap in the text', () => {
  const r = read('For team leads at Solaris Energy, a solar installer in Lagos selling rooftop systems to households.');
  assert.ok(r.missing.includes('offeringName'), 'the product name is asked');
  assert.equal(r.suggestions.offeringName, 'Solaris Plus', 'with a suggestion drafted from the organization');
  const def = tailor({ ...r.profile, offeringName: '' });
  const product = def.context.entities.find((e) => e.key === 'product').value;
  assert.ok(product.trim(), 'a blank name is replaced by a suggested one');
  assert.doesNotMatch(renderText(def, def.story.welcome), /launched \.|selling \.|  /);
  def.context.entities.find((e) => e.key === 'product').value = '';
  assert.match(renderText(def, 'We sell {{product}}.'), /\[.+\]/, 'an empty field shows as a visible placeholder');
  assert.ok(validate(def).some((i) => i.severity === 'error' && /empty/.test(i.title)), 'and blocks publishing');
  assert.equal(suggestOfferingName({ orgName: '', offeringType: 'service' }), 'Nova Assist');
});

test('QA-03 the team location is read from how the brief is phrased', () => {
  const two = read('Sales managers at Meridian Bank in India who sell loans to clients in Germany.');
  assert.equal(two.profile.country, 'IN', 'clients in Germany do not move the team');
  const ga = read('Team leads at Peach Insurance in Atlanta, Georgia selling policies to families.');
  assert.equal(ga.profile.country, 'US');
  assert.equal(ga.profile.city, 'Atlanta');
  assert.notEqual(read('Our CEO David wants a simulation for sales managers at Brightpath Technologies.').profile.city, 'David');
  const florence = read('Florence, our L&D head, needs this for team leads at Aurelia Pharma.');
  assert.notEqual(florence.profile.city, 'Florence');
  assert.ok(florence.missing.includes('country'), 'no location means a question, not a guess');
  const both = read('Managers in India and Germany.');
  assert.ok(both.missing.includes('country'), 'two team locations: ask');
  assert.ok(both.suggestions.country.length >= 2);
  assert.equal(read('Team leads in Georgia at Peach Bank.').missing.includes('country'), true, 'Georgia alone is ambiguous');
  assert.equal(read('Managers in Austin, TX at Lone Star Bank').profile.country, 'US');
});

test('QA-05 imports are checked against the whole definition shape', () => {
  assert.deepEqual(schemaProblems(createIleadDefinition()), []);
  const bad = schemaProblems({ schema: 1, meta: { templateId: 'ilead' }, stages: [] });
  assert.ok(bad.length > 5);
  assert.ok(bad.some((m) => /timeline/.test(m)));
  assert.deepEqual(schemaProblems('nope'), ['This is not a JSON object.']);
});

test('QA-06 a missing organization is asked, never filled with a sample', () => {
  const r = read('A simulation for branch managers selling home loans to families in Mumbai.');
  assert.equal(r.profile.orgName, '');
  assert.ok(r.missing.includes('orgName'));
  assert.equal(r.suggestions.orgName, 'Meridian Bank', 'the sample is only a suggestion');
});

test('QA-07 specific instructions are used or reported, never dropped', () => {
  const r = read('For Meridian Bank in Mumbai. 8 weeks. Target 60 conversions. Our stages are Prospect, Pitch, Paperwork, Approval, Payout. Team of 8 with names Ravi and Sita. Include an RBI audit event in week 3. Average loan fee INR 25000.');
  const by = Object.fromEntries(r.specifics.map((s) => [s.id, s]));
  assert.equal(r.settings.weeks, 8);
  assert.equal(r.settings.target, 60);
  assert.deepEqual(by.stages.value, ['Prospect', 'Pitch', 'Paperwork', 'Approval', 'Payout']);
  assert.equal(by.teamSize.used, false);
  assert.match(by.teamSize.reason, /10 people/);
  assert.deepEqual(by.names.value, ['Ravi', 'Sita']);
  assert.equal(by['event:rbi audit'].value.week, 3);
  assert.equal(r.settings.dealValue, 25000);
  assert.equal(r.settings.currency, 'INR');
  const def = tailor({ ...r.profile, depth: 'deep' });
  applyBriefSpecifics(def, r.specifics);
  assert.deepEqual(def.stages.map((s) => s.name), ['Prospect', 'Pitch', 'Paperwork', 'Approval', 'Payout']);
  const team = def.actors.filter((a) => a.pool === 'team');
  const ravi = team.find((a) => a.name.startsWith('Ravi'));
  const sita = team.find((a) => a.name.startsWith('Sita'));
  assert.ok(ravi && sita);
  assert.equal(ravi.pronoun, 'he');
  assert.equal(sita.pronoun, 'she');
  assert.ok(def.events.some((e) => e.name === 'RBI audit' && e.week === 3 && e.enabled));
  assert.equal(def.funnel.valuePerConversion, 25000);
  assert.equal(likelyPronoun('Wanjiru'), 'she');
});

test('QA-09 the health check catches blanks, duplicates and implausible numbers', () => {
  const baseline = new Set(validate(createIleadDefinition()).map((i) => i.title));
  const probes = {
    company: (d) => { d.context.entities.find((e) => e.key === 'company').value = ''; },
    stageName: (d) => { d.stages[1].name = ''; },
    dupStage: (d) => { d.stages[1].name = d.stages[0].name; },
    actorName: (d) => { d.actors[0].name = ''; },
    dupActor: (d) => { d.actors[1].name = d.actors[0].name; },
    eventText: (d) => { d.events.find((e) => e.enabled).text = ''; },
    welcome: (d) => { d.story.welcome = ''; },
    actionsOff: (d) => { d.actions.forEach((a) => { a.enabled = false; }); },
    target1: (d) => { d.funnel.target = 1; },
    value0: (d) => { d.funnel.valuePerConversion = 0; },
  };
  for (const [name, f] of Object.entries(probes)) {
    const d = createIleadDefinition();
    f(d);
    const fresh = validate(d).filter((i) => !baseline.has(i.title));
    assert.ok(fresh.length, `${name} is flagged`);
    if (!['target1', 'value0'].includes(name)) assert.ok(fresh.some((i) => i.severity === 'error'), `${name} blocks publishing`);
  }
});

test('QA-10 the reader copes with ordinary writing', () => {
  assert.equal(read('Meridian Bank wants a leadership simulation for branch managers in Mumbai.').profile.orgName, 'Meridian Bank');
  assert.equal(read('For Meridian Bank in Mumbai. 60 minutes.').profile.orgName, 'Meridian Bank');
  const lower = read('for team leads at acme logistics in dubai');
  assert.equal(lower.profile.orgName, 'Acme Logistics');
  assert.equal(lower.profile.city, 'Dubai');
  assert.equal(read('Our CEO David wants a simulation for sales managers at Brightpath Technologies.').profile.orgName, 'Brightpath Technologies');
  assert.equal(read('Our CEO David wants a simulation for sales managers at Brightpath Technologies.').profile.industry, 'it');
  assert.equal(read('Managers @ Meridian Bank (Mumbai) & "fun"!!!').profile.orgName, 'Meridian Bank');
  assert.equal(read('Run it for team leads before Christmas at Ironclad Industries.').profile.orgName, 'Ironclad Industries');
  const hindi = read('मुंबई में मेरिडियन बैंक के बिक्री प्रबंधकों के लिए');
  assert.equal(hindi.profile.city, 'Mumbai');
  assert.equal(hindi.profile.industry, 'banking');
  assert.ok(hindi.notes.some((n) => n.kind === 'language'));
});

test('QA-11 negation and contradictions', () => {
  assert.equal(read("Managers at Meridian Bank in Mumbai. Please don't let them fire anyone.").settings.noFiring, true);
  assert.equal(read('Managers at Meridian Bank in Mumbai. Exclude the firing action.').settings.noFiring, true);
  assert.equal(read('Managers at Meridian Bank in Mumbai. Firing is part of the job.').settings.noFiring, false);
  assert.equal(read('Managers at Meridian Bank in Mumbai. The tone should not be formal, keep it casual.').settings.formal, false);
  assert.equal(read('Managers at Meridian Bank in Mumbai. Keep the tone formal.').settings.formal, true);
  const len = read('A 45-minute session, but make it the full 90 minutes for managers at Meridian Bank in Mumbai.');
  assert.ok(len.conflicts.some((c) => c.key === 'length' && c.options.length === 2));
  const buyers = read('Managers at Meridian Bank in Mumbai selling to consumers and businesses equally.');
  assert.ok(buyers.conflicts.some((c) => c.key === 'customerType'));
  const settled = mergeGenieBrief(buyers, { customerType: 'b2c' }, base);
  assert.ok(!settled.conflicts.some((c) => c.key === 'customerType'), 'Genie can settle a contradiction');
});

test('QA-16 two tabs merge instead of overwriting each other', () => {
  const a = { id: 'a', touchedAt: 10, def: { n: 'A old' } };
  const b = { id: 'b', touchedAt: 10, def: { n: 'B' } };
  const aNew = { ...a, touchedAt: 20, def: { n: 'A renamed in the other tab' } };
  const merged = mergeSims([a, b], [aNew, b], { since: 15 });
  assert.equal(merged.find((s) => s.id === 'a').def.n, 'A renamed in the other tab');
  const c = { id: 'c', touchedAt: 30, def: {} };
  assert.ok(mergeSims([a, b, c], [a, b], { since: 15 }).some((s) => s.id === 'c'), 'a simulation created here is kept');
  assert.ok(!mergeSims([a, b], [a, b, c], { deleted: new Set(['c']), since: 15 }).some((s) => s.id === 'c'), 'one deleted here stays deleted');
  assert.ok(!mergeSims([a, b], [b], { since: 15 }).some((s) => s.id === 'a'), 'one deleted in the other tab stays deleted');
});

test('QA-20 top markets get country names, not a regional mix', () => {
  const ke = locationPack({ ...base, country: 'KE' });
  assert.equal(ke.namesFrom, 'country');
  assert.ok(ke.names.he.length >= 15 && ke.names.she.length >= 6);
  assert.ok(!ke.names.he.some((n) => /Chinedu|Kwame|Tendai/.test(n)), 'no Nigerian, Ghanaian or Zimbabwean names for Kenya');
  const ng = locationPack({ ...base, country: 'NG' });
  assert.doesNotMatch(ng.ceo, /Chipo|Moyo/);
  assert.equal(locationPack({ ...base, country: 'GE' }).namesFrom, 'country');
  assert.equal(locationPack({ ...base, country: 'IS' }).namesFrom, 'region', 'others still use the regional style');
});

test('QA-21 and QA-27 industry wording and answers for industries without a pack', () => {
  const bank = tailor({ industry: 'banking', offeringType: 'product', customerType: 'b2c', orgName: 'Meridian Bank', offeringName: 'HomeFirst', country: 'IN', city: 'Mumbai', letterVariant: 0 });
  assert.doesNotMatch(bank.story.welcome, /relatively small banking company/);
  assert.match(bank.story.welcome, /fast-growing bank/);
  const solar = tailor({ industry: 'other', customIndustry: 'Solar energy', orgName: 'Solaris', offeringName: 'SunRoof', customCompetitor: 'SunGrid Power', customPortfolio: 'battery storage, EV chargers', customSetback: 'A key panel supplier goes out of business', country: 'NG', city: 'Lagos' });
  const ent = Object.fromEntries(solar.context.entities.map((e) => [e.key, e.value]));
  assert.equal(ent.competitor, 'SunGrid Power');
  assert.equal(ent.product_2, 'battery storage');
  assert.equal(ent.product_3, 'EV chargers');
  assert.ok(solar.events.some((e) => /panel supplier goes out of business/.test(e.text)));
  assert.match(solar.story.welcome, /growing solar energy business/);
});

test('QA-22 the brief is not part of the definition', () => {
  const def = createIleadDefinition();
  assert.equal(def.meta.brief, undefined);
});
