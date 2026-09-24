// Hyper-contextualization for iLead.
// Layer 1: the author describes their organization (the profile).
// Layer 2: this module proposes concrete changes derived from it, each with a reason
// ("because: India", "because: Banking", "because: a service sold to businesses").
// The author reviews and accepts. Nothing here touches timing, impacts or pass-on rates.

import { INDUSTRIES, OTHER_INDUSTRY, LOCATIONS, STAGE_SETS, GENERIC_EVENTS, LEGACY_EVENT_ARCHETYPE, OFFERING } from './context-packs.js';
import { COUNTRIES, REGIONS, TIER_FACTOR, fxFor } from './world.js';
import { COUNTRY_NAMES } from './names.js';
import { createIleadDefinition } from './index.js';
import { collectTexts, findTokens } from '../../engine/text.js';
import { setTextAt } from '../../engine/authoring.js';

export const AREAS = {
  organization: { label: 'Organization and names', order: 1 },
  money: { label: 'Currency and deal value', order: 2 },
  funnel: { label: 'Sales stages', order: 3 },
  story: { label: 'Welcome letter and product brief', order: 4 },
  events: { label: 'Industry and local events', order: 5 },
  people: { label: 'Team members', order: 6 },
  genie: { label: 'Rewritten by Genie', order: 7 },
};

const LEGACY_COUNTRY = 'US';
let original = null;
const templateOriginal = () => (original ||= createIleadDefinition());

export function industryPack(profile) {
  if (profile.industry === 'other') {
    const custom = profile.customIndustry?.trim();
    return { ...OTHER_INDUSTRY, label: custom || 'Other', noun: custom?.toLowerCase() || OTHER_INDUSTRY.noun, orgPhrase: custom ? `a growing ${custom.toLowerCase()} business` : 'a growing business', generic: true };
  }
  return INDUSTRIES[profile.industry] || OTHER_INDUSTRY;
}
// Any country resolves to a location profile. The eight hand-written packs refine the
// generated one; a fictitious country uses the naming style and currency the author picks.
export function locationPack(profile) {
  if (profile.country === 'custom') {
    const currency = profile.customCurrency || 'USD';
    return fromCountry({
      code: 'custom', name: profile.customCountry?.trim() || 'Your country', region: REGIONS[profile.customRegion] ? profile.customRegion : 'anglo',
      currency, fx: fxFor(currency), tier: 1, cities: [],
    }, true);
  }
  const c = COUNTRIES[profile.country] || COUNTRIES[LEGACY_COUNTRY];
  const pack = LOCATIONS[c.code];
  const base = fromCountry(c);
  return pack ? { ...base, ...pack, cities: c.cities, region: c.region, namesFrom: 'country' } : base;
}

function fromCountry(c, fictitious = false) {
  const r = REGIONS[c.region];
  // Country pools for the most-picked markets; the regional style for the rest.
  const own = COUNTRY_NAMES[c.code];
  const names = own || { she: r.she, he: r.he };
  const anchor = c.cities[0] || c.name;
  return {
    code: c.code,
    label: c.name,
    fictitious,
    region: c.region,
    currency: c.currency,
    fx: c.fx,
    dealFactor: TIER_FACTOR[c.tier] ?? 1,
    cities: c.cities,
    destination: r.destination,
    ceo: names.she[5],
    board: names.he[14],
    lunch: r.lunch,
    institutions: { 'China Bank': `${anchor} Commercial Bank`, 'Manchester Business School': `${anchor} School of Business` },
    names,
    namesFrom: own ? 'country' : 'region',
  };
}

// A plausible name for what the team sells when the brief does not give one. Shown as Suggested.
export function suggestOfferingName(profile) {
  const brand = String(profile.orgName || '').trim().split(/\s+/)[0]?.replace(/[^\p{L}\p{N}-]/gu, '') || 'Nova';
  return `${brand} ${profile.offeringType === 'service' ? 'Assist' : 'Plus'}`;
}

// Unique names from a pool; when it runs out, combine given and family names from the same pool.
function nameFrom(pool, used) {
  const free = pool.find((n) => !used.has(n));
  if (free) return free;
  const parts = pool.map((n) => n.split(' '));
  for (const a of parts) for (const b of parts) {
    const n = `${a[0]} ${b.slice(1).join(' ') || b[0]}`;
    if (!used.has(n)) return n;
  }
  return `${pool[0]} ${used.size}`;
}

// Suggestions used to pre-fill the profile when industry, offering or country changes.
// A field is only replaced while it still holds a sample value, so typed names survive.
export function suggestProfile(next, changed, prev = next) {
  const pack = industryPack(next);
  const oldPack = industryPack(prev);
  const loc = locationPack(next);
  const oldLoc = locationPack(prev);
  const off = pack[next.offeringType] || pack.product;
  const samples = (p) => new Set([p.sampleOrg, p.product?.name, p.service?.name, p.product?.category, p.service?.category, p.learnerRole?.product, p.learnerRole?.service, ''].filter((x) => x !== undefined));
  const oldSamples = samples(oldPack);
  const out = { ...next };
  const maybe = (key, value) => { if (value !== undefined && (oldSamples.has(prev[key]) || !prev[key])) out[key] = value; };
  if (changed === 'industry' || changed === 'offeringType') {
    if (changed === 'industry' && pack.sampleOrg) maybe('orgName', pack.sampleOrg);
    maybe('offeringName', off.name || undefined);
    maybe('offeringCategory', off.category);
    maybe('learnerRole', pack.learnerRole[next.offeringType]);
    out.customerType = off.customer;
  }
  if (changed === 'country' && (oldLoc.cities.includes(prev.city) || !prev.city)) out.city = loc.cities[0] || '';
  return out;
}

// ---------- reading and writing targets ----------

function read(def, t) {
  switch (t.kind) {
    case 'entity': return def.context.entities.find((e) => e.key === t.key)?.value ?? '';
    case 'industry': return def.context.industry;
    case 'funnel': return def.funnel[t.field];
    case 'stage': return def.stages.find((s) => s.id === t.id)?.[t.field] ?? '';
    case 'story': return def.story[t.field];
    case 'event': return def.events.find((e) => e.id === t.id)?.[t.field] ?? '';
    case 'actor': return def.actors.find((a) => a.id === t.id)?.[t.field] ?? '';
    case 'ref': return collectTexts(def).find((x) => refKey(x.ref) === refKey(t.ref))?.text ?? '';
    default: return '';
  }
}

export function writeTarget(def, t, value) {
  return write(def, t, value);
}

function write(def, t, value) {
  switch (t.kind) {
    case 'entity': {
      const e = def.context.entities.find((x) => x.key === t.key);
      if (e) e.value = value;
      else def.context.entities.push({ key: t.key, label: t.key, value, hint: '' });
      break;
    }
    case 'industry': def.context.industry = value; break;
    case 'funnel': def.funnel[t.field] = value; break;
    case 'stage': { const s = def.stages.find((x) => x.id === t.id); if (s) s[t.field] = value; break; }
    case 'story': def.story[t.field] = value; break;
    case 'event': { const e = def.events.find((x) => x.id === t.id); if (e) e[t.field] = value; break; }
    case 'actor': { const a = def.actors.find((x) => x.id === t.id); if (a) a[t.field] = value; break; }
    case 'ref': setTextAt(def, t.ref, value); break;
    default: break;
  }
}

export const refKey = (ref) => JSON.stringify(ref);
export const targetKey = (t) => (t.kind === 'ref' ? `ref:${refKey(t.ref)}` : [t.kind, t.key, t.id, t.field].filter(Boolean).join(':'));

// ---------- proposals ----------

function niceRound(v) {
  if (v <= 0) return 0;
  const mag = 10 ** Math.max(0, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / mag) * mag;
}

// How the letter describes the organization, per industry ("a young, fast-growing bank").
const orgPhrase = (pack) => pack.orgPhrase || `a growing ${pack.noun} business`;

const LETTER_OPENINGS = [
  (pack, plural) => `As you know, {{company}} is ${orgPhrase(pack)} with a vision to ${pack.vision}. We have three ${plural} in our portfolio: {{product_2}}, {{product_3}} and the recently launched {{product}}.`,
  (pack, plural) => `{{company}} has one ambition: to ${pack.vision}. Our ${plural} {{product_2}} and {{product_3}} built our name, and {{product}} is the launch that will define our year.`,
  (pack, plural) => `You are joining ${orgPhrase(pack)} that intends to ${pack.vision}. Alongside {{product_2}} and {{product_3}}, we have just launched {{product}}, and it is where our growth must come from.`,
];

function welcomeLetter(pack, offeringType, variant = 0) {
  const plural = OFFERING[offeringType].plural;
  if (variant % LETTER_OPENINGS.length) {
    const opening = LETTER_OPENINGS[variant % LETTER_OPENINGS.length](pack, plural);
    return `Welcome to {{company}}!\n\n${opening}\n\nYou will lead the team selling {{product}}. The team has lost its way under its previous leader, and the board is counting on you to turn it around this quarter.\n\nThe details of {{product}} and how you will be assessed are attached.\n\nWith every good wish,\n{{ceo}}\nCEO, {{company}}`;
  }
  return `Welcome on board {{company}}!\n\nAs you know, {{company}} is ${orgPhrase(pack)} with a vision to ${pack.vision}. We have three ${plural} in our portfolio: {{product_2}}, {{product_3}} and the recently launched {{product}}.\n\nYour role will be to lead the team selling {{product}}. Your predecessor could not inspire the team and left it struggling. Our board trusts that your leadership experience will turn the team around.\n\nInformation on {{product}} and the parameters on which you will be assessed are attached.\n\nGood luck!\n{{ceo}}\nCEO, {{company}}`;
}

// Returns proposals: { id, area, label, target, before, after, because[], status }.
// status 'edited' means the author changed this after it was last generated; it starts unticked.
export function proposeContext(def, profile) {
  const depth = profile.depth || 'standard';
  const pack = industryPack(profile);
  const loc = locationPack(profile);
  const off = profile.offeringType === 'service' ? 'service' : 'product';
  const cust = profile.customerType === 'b2c' ? 'b2c' : 'b2b';
  const offPack = pack[off] || pack.product;
  const orig = templateOriginal();
  const isLegacyShape = pack.legacy && off === 'product' && cust === 'b2b';
  const tag = {
    industry: pack.label,
    location: profile.city?.trim() ? `${profile.city.trim()}, ${loc.label}` : loc.label,
    offering: `${off === 'service' ? 'Service' : 'Product'} for ${cust === 'b2c' ? 'consumers' : 'businesses'}`,
    org: 'Your organization',
  };
  const out = [];
  const add = (area, label, target, after, because) => {
    if (after === undefined || after === null) return;
    // A blank context field would leave gaps in every sentence that uses it.
    if (target.kind === 'entity' && !String(after).trim()) return;
    const before = read(def, target);
    if (String(before) === String(after)) return;
    const id = targetKey(target);
    const generated = def.context.generated?.[id];
    const originalValue = read(orig, target);
    const touched = generated !== undefined ? String(before) !== String(generated) : String(before) !== String(originalValue);
    out.push({ id, area, label, target, before, after, because, status: touched ? 'edited' : 'new' });
  };

  // Organization and names: always.
  add('organization', 'Company', { kind: 'entity', key: 'company' }, profile.orgName, [tag.org]);
  add('organization', 'Product the team sells', { kind: 'entity', key: 'product' }, profile.offeringName?.trim() || suggestOfferingName(profile), [tag.org]);
  add('organization', 'What the product is', { kind: 'entity', key: 'category' }, profile.offeringCategory, [tag.org, tag.offering]);
  add('organization', "Learner's role", { kind: 'entity', key: 'learner_role' }, profile.learnerRole, [tag.org]);
  add('organization', 'Industry', { kind: 'industry' }, pack.label, [tag.industry]);
  const portfolio = String(profile.customPortfolio || '').split(/\s*(?:,|;|\band\b)\s*/).map((x) => x.trim()).filter(Boolean);
  add('organization', 'Other product 1', { kind: 'entity', key: 'product_2' }, portfolio[0] || offPack.portfolio[0], [portfolio[0] ? tag.org : tag.industry]);
  add('organization', 'Other product 2', { kind: 'entity', key: 'product_3' }, portfolio[1] || offPack.portfolio[1], [portfolio[1] ? tag.org : tag.industry]);
  add('organization', 'Main competitor', { kind: 'entity', key: 'competitor' }, profile.customCompetitor?.trim() || pack.competitor, [profile.customCompetitor?.trim() ? tag.org : tag.industry]);
  add('organization', 'Previous employer of a team member', { kind: 'entity', key: 'rival' }, pack.rival, [tag.industry]);
  add('organization', 'Home city', { kind: 'entity', key: 'city' }, profile.city?.trim() || loc.cities[0] || loc.label, [tag.location]);
  add('organization', 'Dream conference destination', { kind: 'entity', key: 'destination' }, loc.destination, [tag.location]);
  add('organization', 'Letter signatory', { kind: 'entity', key: 'ceo' }, loc.ceo, [tag.location]);
  add('organization', 'Board member in the news', { kind: 'entity', key: 'board_member' }, loc.board, [tag.location]);
  add('organization', 'Team lunch venue', { kind: 'entity', key: 'lunch_venue' }, loc.lunch, [tag.location]);

  // Money: always.
  const usd = pack.valueUSD[off] * (cust === 'b2c' && offPack.customer === 'b2b' ? 0.2 : cust === 'b2b' && offPack.customer === 'b2c' ? 4 : 1);
  add('money', 'Currency', { kind: 'funnel', field: 'currency' }, loc.currency, [tag.location]);
  add('money', 'Value per conversion', { kind: 'funnel', field: 'valuePerConversion' }, niceRound(usd * loc.fx * loc.dealFactor), [tag.industry, tag.offering, tag.location]);

  if (depth !== 'light') {
    // Stages: industry override, else the set for who buys and what is sold. Legacy shape keeps legacy stages.
    const set = isLegacyShape ? orig.stages.map((s) => [s.name, s.description]) : pack.stages?.[`${cust}-${off}`] || STAGE_SETS[`${cust}-${off}`];
    const why = pack.stages?.[`${cust}-${off}`] ? [tag.industry, tag.offering] : [tag.offering];
    def.stages.forEach((st, i) => {
      if (!set[i]) return;
      add('funnel', `Stage ${i + 1} name`, { kind: 'stage', id: st.id, field: 'name' }, set[i][0], why);
      add('funnel', `Stage ${i + 1} description`, { kind: 'stage', id: st.id, field: 'description' }, set[i][1], why);
    });

    // Story.
    const letterVariant = profile.letterVariant || 0;
    add('story', 'Welcome letter', { kind: 'story', field: 'welcome' }, isLegacyShape && !letterVariant ? orig.story.welcome : welcomeLetter(pack, off, letterVariant), [tag.industry, tag.offering]);
    add('story', 'Product brief', { kind: 'story', field: 'overview' }, pack.legacy && off === 'product' ? orig.story.overview : offPack.brief, [tag.industry, tag.offering]);

    // Events: industry version of each archetype; legacy industry restores the originals.
    for (const [eventId, archetype] of Object.entries(LEGACY_EVENT_ARCHETYPE)) {
      const ev = def.events.find((e) => e.id === eventId);
      if (!ev) continue;
      const setback = archetype === 'crisis' && profile.industry === 'other' && profile.customSetback?.trim().replace(/[.\s]+$/, '');
      const src = setback
        ? { name: 'Market setback', text: `This week brings a setback: ${setback.charAt(0).toLowerCase()}${setback.slice(1)}. Customers hesitate and the team finds it hard to close.` }
        : pack.legacy ? orig.events.find((e) => e.id === eventId) : pack.events?.[archetype] || GENERIC_EVENTS[archetype];
      if (!src) continue;
      const why = setback ? [tag.org] : pack.legacy || pack.events?.[archetype] ? [tag.industry] : ['Any industry'];
      add('events', `${ev.name}: title`, { kind: 'event', id: eventId, field: 'name' }, src.name, why);
      add('events', `${ev.name}: text`, { kind: 'event', id: eventId, field: 'text' }, src.text, why);
    }
  }

  if (depth !== 'light') {
    // People. Standard: skills and profiles use the new stage names. Deep: local names and institutions too.
    const stageNames = isLegacyShape ? null : (pack.stages?.[`${cust}-${off}`] || STAGE_SETS[`${cust}-${off}`]).map((x) => x[0]);
    const legacyTerms = [['Lead Generation', 0], ['Lead Qualification', 1], ['Proposal Design', 2], ['Negotiation', 3], ['Sales Conversion', 4]];
    const localized = depth === 'deep' && (profile.country !== LEGACY_COUNTRY || (profile.namesVariant || 0) > 0);
    const rot = (list) => { const k = ((profile.namesVariant || 0) * 5) % list.length; return [...list.slice(k), ...list.slice(0, k)]; };
    const pools = { he: rot(loc.names.he), she: rot(loc.names.she), they: rot([...loc.names.she, ...loc.names.he]) };
    const used = new Set([loc.ceo, loc.board]);
    def.actors.forEach((a, i) => {
      const o = orig.actors.find((x) => x.id === a.id);
      let name = o?.name || a.name;
      if (localized) {
        const pool = pools[a.pronoun] || pools.they;
        name = nameFrom(pool, used);
      }
      used.add(name);
      const why = localized ? [tag.location, tag.offering] : [tag.offering];
      if (depth === 'deep') add('people', `${o?.name || a.name}: name`, { kind: 'actor', id: a.id, field: 'name' }, name, [tag.location]);
      const swap = (text) => {
        let t = String(text || '');
        if (o && localized) {
          t = t.split(o.name).join(name);
          t = t.replace(new RegExp(`\\b${o.name.split(' ')[0]}\\b`, 'g'), name.split(' ')[0]);
        }
        if (localized) for (const [from, to] of Object.entries(loc.institutions)) t = t.split(from).join(to);
        if (!isLegacyShape) t = t.replace(/\bgo-to guy\b/g, 'go-to person').replace(/\bis a Finance Major\b/g, 'has a finance degree');
        if (stageNames) {
          for (const [term, idx] of legacyTerms) t = t.split(term).join(stageNames[idx]);
          t = t.replace(/\bconversion team\b/g, `${stageNames[4].toLowerCase()} team`).replace(/\bNegotiation department\b/g, `${stageNames[3]} team`);
        }
        return t;
      };
      const shown = depth === 'deep' ? name : a.name;
      add('people', `${shown}: domain skills`, { kind: 'actor', id: a.id, field: 'domain' }, swap(o ? o.domain : a.domain), [tag.offering]);
      add('people', `${shown}: profile`, { kind: 'actor', id: a.id, field: 'bio' }, swap(o ? o.bio : a.bio), why);
      if (localized) add('people', `${shown}: experience`, { kind: 'actor', id: a.id, field: 'experience' }, swap(o ? o.experience : a.experience), [tag.location]);
    });
  }

  return out.sort((a, b) => AREAS[a.area].order - AREAS[b.area].order);
}

// Applies accepted proposals and records what was generated, so a later re-run can tell
// which values the author has since edited by hand.
export function applyProposals(def, proposals, profile) {
  def.context.generated = { ...(def.context.generated || {}) };
  for (const p of proposals) {
    write(def, p.target, p.after);
    def.context.generated[p.id] = p.after;
  }
  if (profile) def.context.profile = { ...profile };
  return def;
}

// ---------- Genie (hosted AI) ----------

export const GENIE_SCOPES = {
  flagged: 'Items still tied to the original storyline',
  story: 'Story, stages and every event',
  people: 'Team member profiles',
  responses: 'Responses to the learner\'s actions',
};

export function genieItems(def, scope, flagged) {
  const all = collectTexts(def).filter((t) => t.text && t.text.trim());
  if (scope === 'flagged') return flagged;
  if (scope === 'story') return all.filter((t) => ['story', 'funnel', 'events'].includes(t.section) && t.ref.field !== 'briefing' && t.ref.field !== 'walkthrough');
  if (scope === 'people') return all.filter((t) => t.section === 'team');
  if (scope === 'responses') return all.filter((t) => t.section === 'actions' && t.ref.outcome !== undefined).slice(0, 60);
  return [];
}

export function geniePrompt(def, profile, items, note) {
  const pack = industryPack(profile);
  const loc = locationPack(profile);
  const names = Object.fromEntries(def.context.entities.map((e) => [e.key, e.value]));
  const payload = items.map((t, i) => ({ id: String(i), where: t.label, text: t.text }));
  return [
    'You are adapting a leadership simulation called iLead to a new organization. The learner leads an under-performing team and must adapt their leadership style to each person.',
    'Rewrite each item so it fits the organization below and reads as if written for it.',
    'Rules:',
    '- Keep every {{token}} exactly as written, including pronoun tokens like {{he}} and {{his}}. They are filled in later. Do not replace a token with the name it stands for and do not invent new tokens.',
    '- Keep what the item does in the simulation: the same kind of situation, the same direction (good news stays good, bad news stays bad), the same speaker and point of view.',
    '- Keep roughly the same length (within 20%).',
    '- Use realistic details for the industry, what is sold, the customers and the location. Plain English. No em dashes.',
    '',
    `Organization: ${profile.orgName} (${names.company ? `shown as {{company}}` : ''})`,
    `Industry: ${pack.label}${profile.industry === 'other' && profile.customIndustry ? ` (${profile.customIndustry})` : ''}`,
    `Sells: ${profile.offeringType === 'service' ? 'a service' : 'a product'}, ${profile.offeringName} (a ${profile.offeringCategory}), to ${profile.customerType === 'b2c' ? 'consumers' : 'businesses'}`,
    `Location: ${profile.city?.trim() || loc.cities[0] || loc.label}${profile.city && !loc.cities.includes(profile.city) ? ' (a city the author chose; it may be fictitious)' : ''}, ${loc.label}${loc.fictitious ? ' (a fictitious country; invent consistent local details)' : ''}`,
    `Learner's role: ${profile.learnerRole}`,
    `Context fields available: ${Object.entries(names).map(([k, v]) => `{{${k}}} = ${v}`).join('; ')}`,
    note?.trim() ? `Author's notes: ${note.trim()}` : '',
    '',
    'Items (JSON):',
    JSON.stringify(payload),
    '',
    'Reply with only a JSON array with one {"id": string, "text": string} object per item, same ids, same order.',
  ].filter((l) => l !== '').join('\n');
}

// Turns Genie's reply into proposals. Drops answers that lost or invented tokens.
export function genieProposals(def, items, reply) {
  const byId = new Map((Array.isArray(reply) ? reply : []).map((r) => [String(r?.id), String(r?.text ?? '')]));
  const known = new Set(def.context.entities.map((e) => e.key));
  const out = [];
  items.forEach((t, i) => {
    const after = byId.get(String(i));
    if (!after || !after.trim() || after === t.text) return;
    const before = new Set(findTokens(t.text));
    const tokens = findTokens(after);
    const invented = tokens.filter((k) => !before.has(k) && !known.has(k));
    const lost = [...before].filter((k) => !tokens.includes(k) && !['he', 'He', 'his', 'His', 'him', 'Him'].includes(k));
    out.push({
      id: `ref:${refKey(t.ref)}`,
      area: 'genie',
      label: t.label,
      target: { kind: 'ref', ref: t.ref },
      before: t.text,
      after,
      because: ['Genie'],
      status: invented.length || lost.length ? 'check' : 'new',
      note: invented.length ? `Uses unknown fields: ${invented.join(', ')}` : lost.length ? `Dropped fields: ${lost.join(', ')}` : '',
    });
  });
  return out;
}
