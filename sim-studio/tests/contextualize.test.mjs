import test from 'node:test';
import assert from 'node:assert/strict';
import { createIleadDefinition } from '../src/templates/ilead/index.js';
import { proposeContext, applyProposals, suggestProfile, genieProposals } from '../src/templates/ilead/contextualize.js';
import { contextBoundItems, renderText, collectTexts } from '../src/engine/text.js';
import { validate } from '../src/engine/validate.js';
import { runBalance } from '../src/engine/balance.js';
import { INDUSTRIES, LOCATIONS } from '../src/templates/ilead/context-packs.js';

const base = () => createIleadDefinition();
const profileFor = (industry, country, extra = {}) => {
  const def = base();
  let p = suggestProfile({ ...def.context.profile, industry }, 'industry', def.context.profile);
  p = suggestProfile({ ...p, country }, 'country', p);
  return { ...p, ...extra };
};
const tailor = (profile) => {
  const def = base();
  applyProposals(def, proposeContext(def, profile), profile);
  return def;
};

test('the legacy profile proposes nothing on the legacy template', () => {
  const def = base();
  assert.equal(proposeContext(def, { ...def.context.profile, depth: 'deep' }).length, 0);
});

test('suggestions follow industry and country but keep typed names', () => {
  const def = base();
  const p = suggestProfile({ ...def.context.profile, industry: 'banking' }, 'industry', def.context.profile);
  assert.equal(p.orgName, 'Meridian Bank');
  assert.equal(p.customerType, 'b2c');
  const typed = suggestProfile({ ...def.context.profile, orgName: 'Acme Bank', industry: 'banking' }, 'industry', { ...def.context.profile, orgName: 'Acme Bank' });
  assert.equal(typed.orgName, 'Acme Bank');
  const city = suggestProfile({ ...p, country: 'IN' }, 'country', p);
  assert.equal(city.city, 'Mumbai');
});

test('standard depth removes every trace of the elevator storyline, for every industry and country', () => {
  for (const industry of Object.keys(INDUSTRIES).filter((k) => k !== 'elevators')) {
    for (const country of Object.keys(LOCATIONS)) {
      const p = profileFor(industry, country, { depth: 'standard' });
      const def = tailor(p);
      assert.deepEqual(contextBoundItems(def).map((i) => i.label), [], `${industry} ${country}`);
      const errors = validate(def).filter((i) => i.severity === 'error' && !/Style insight/.test(i.title));
      assert.deepEqual(errors.map((e) => e.title), [], `${industry} ${country}`);
    }
  }
});

test('location drives currency, city, destination and deal value', () => {
  const def = tailor(profileFor('banking', 'IN', { depth: 'standard' }));
  assert.equal(def.funnel.currency, 'INR');
  assert.match(renderText(def, def.events.find((e) => e.id === 'tragic-accident').text), /Mumbai/);
  assert.match(renderText(def, def.events.find((e) => e.id === 'sales-conference-announcement').text), /Maldives/);
  assert.ok(def.funnel.valuePerConversion > 50000);
});

test('offering and customers drive the sales stages', () => {
  const service = tailor(profileFor('it', 'GB', { offeringType: 'service', customerType: 'b2b', depth: 'standard' }));
  assert.equal(service.stages[2].name, 'Solution design');
  const loans = tailor(profileFor('banking', 'US', { depth: 'standard' }));
  assert.equal(loans.stages[4].name, 'Disbursal');
  const pharma = tailor(profileFor('pharma', 'IN', { depth: 'standard' }));
  assert.equal(pharma.stages[0].name, 'Territory mapping');
});

test('deep depth gives local names, keeps pronouns and rewrites profiles consistently', () => {
  const def = tailor(profileFor('manufacturing', 'JP', { depth: 'deep' }));
  const names = def.actors.map((a) => a.name);
  assert.equal(new Set(names).size, names.length, 'names are unique');
  const beth = def.actors.find((a) => a.id === 'beth-killiney');
  assert.equal(beth.pronoun, 'she');
  assert.ok(LOCATIONS.JP.names.she.includes(beth.name));
  const justin = def.actors.find((a) => a.id === 'justin-keel');
  assert.match(justin.bio, new RegExp(justin.name.split(' ')[0]));
  assert.doesNotMatch(collectTexts(def).map((t) => t.text).join(' '), /Manchester Business School|China Bank/);
});

test('re-tailoring protects edits made by hand', () => {
  const p = profileFor('telecom', 'AU', { depth: 'standard' });
  const def = tailor(p);
  def.context.entities.find((e) => e.key === 'competitor').value = 'Our own rival';
  const again = proposeContext(def, { ...p, country: 'SG', city: 'Singapore' });
  assert.equal(again.find((x) => x.id === 'entity:competitor').status, 'edited', 'hand edit is flagged, so it starts unticked');
  assert.equal(again.find((x) => x.id === 'entity:city').status, 'new', 'generated values stay ticked');
  assert.equal(proposeContext(def, p).filter((x) => x.status === 'new').length, 0, 'same profile proposes nothing new');
});

test('tailoring changes words only: balance is unchanged', () => {
  const def = tailor(profileFor('insurance', 'AE', { depth: 'deep' }));
  const a = runBalance(base(), { runs: 3, bots: ['expert', 'random'] });
  const b = runBalance(def, { runs: 3, bots: ['expert', 'random'] });
  assert.equal(a.bots.expert.p50, b.bots.expert.p50);
  assert.equal(a.bots.random.p50, b.bots.random.p50);
});

test('Genie replies become reviewable proposals and bad token use is flagged', () => {
  const def = base();
  const items = contextBoundItems(def).slice(0, 2);
  const reply = [{ id: '0', text: `${items[0].text} Rewritten.` }, { id: '1', text: 'A new {{mystery}} arrives.' }];
  const props = genieProposals(def, items, reply);
  assert.equal(props.length, 2);
  assert.equal(props[0].status, 'new');
  assert.equal(props[1].status, 'check');
});
