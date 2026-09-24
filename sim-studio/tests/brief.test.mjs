import test from 'node:test';
import assert from 'node:assert/strict';
import { createIleadDefinition } from '../src/templates/ilead/index.js';
import { readBrief, mergeGenieBrief, EXAMPLE_BRIEFS, briefPrompt } from '../src/templates/ilead/brief.js';
import { draftStyleInsight, isMissing } from '../src/templates/ilead/insights.js';

const base = createIleadDefinition().context.profile;
const read = (b) => readBrief({ outcomes: [], chips: [], outcomeText: '', constraints: '', ...b }, base);

test('a full brief is understood without questions', () => {
  const r = read(EXAMPLE_BRIEFS[0]);
  assert.deepEqual(r.missing, []);
  assert.equal(r.profile.orgName, 'Meridian Bank');
  assert.equal(r.profile.industry, 'banking');
  assert.equal(r.profile.customerType, 'b2c');
  assert.equal(r.profile.country, 'IN');
  assert.equal(r.profile.city, 'Mumbai');
  assert.equal(r.settings.length, 'medium');
  assert.ok(r.settings.audience.includes('First-time managers'));
  assert.ok(r.settings.formal && r.settings.localNames);
  assert.equal(r.sources.orgName, 'brief');
});

test('service, business buyers, constraints and difficulty are read from the words', () => {
  const r = read(EXAMPLE_BRIEFS[1]);
  assert.equal(r.profile.offeringType, 'service');
  assert.equal(r.profile.customerType, 'b2b');
  assert.equal(r.settings.noFiring, true);
  assert.equal(r.settings.length, 'long');
  assert.equal(r.settings.difficulty, 'standard', '"tough quarter" is not a difficulty request');
  assert.equal(read(EXAMPLE_BRIEFS[2]).settings.difficulty, 'challenging');
});

test('only what cannot be inferred is asked', () => {
  const vague = read({ instructions: 'Something for our managers.' });
  assert.deepEqual(vague.missing.sort(), ['country', 'industry', 'offeringName', 'orgName']);
  const solar = read({ instructions: 'For team leads at Solaris Energy, a solar installer in Lagos selling rooftop systems to households.' });
  assert.deepEqual(solar.missing, ['industry', 'offeringName'], 'an unknown industry has no sample product, so its name is asked');
  assert.equal(solar.profile.country, 'NG');
  assert.equal(solar.profile.offeringName, '', 'no elevator sample names leak into an unknown industry');
});

test('a city implies its country', () => {
  const r = read({ instructions: 'Insurance agents in Nairobi selling life cover to families, at Evergreen Assurance.' });
  assert.equal(r.profile.country, 'KE');
  assert.equal(r.profile.city, 'Nairobi');
  assert.equal(r.profile.industry, 'insurance');
});

test("Genie's reading fills gaps and wins where it answered", () => {
  const rules = read({ instructions: 'Something for our managers.' });
  const merged = mergeGenieBrief(rules, { orgName: 'Helios Solar', industry: 'other', customIndustry: 'Solar energy', offeringType: 'product', offeringName: 'Helios Home', customerType: 'b2c', country: 'Nigeria', city: 'Abuja', sessionMinutes: 45, outcomes: ['motivate'], unknown: [] }, base);
  assert.equal(merged.profile.orgName, 'Helios Solar');
  assert.equal(merged.profile.country, 'NG');
  assert.equal(merged.profile.city, 'Abuja');
  assert.equal(merged.settings.length, 'short');
  assert.deepEqual(merged.missing, []);
  const fictional = mergeGenieBrief(rules, { country: 'Aldoria', industry: 'banking', orgName: 'X Bank' }, base);
  assert.equal(fictional.profile.country, 'custom');
  assert.match(briefPrompt({ instructions: 'hi' }), /JSON object/);
});

test('missing report insights are drafted for every style', () => {
  const def = createIleadDefinition();
  for (const s of ['directing', 'guiding', 'partnering', 'entrusting']) assert.ok(!isMissing(def.report.styleInsights[s].LowUseHighAccuracy), s);
  assert.match(draftStyleInsight('entrusting', 'Low', 'High'), /right call/);
});
