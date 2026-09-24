// Reads an author's brief (instructions, intended outcome, constraints) and infers everything
// the simulation needs. Every inferred field carries its source so the author can see what came
// from their words, what was inferred, and what still needs an answer.
//
// Two readers share one output shape:
//   readBrief()        built-in rules, instant, works everywhere
//   briefPrompt() and  Genie (hosted AI) for richer understanding; its answer is merged over
//   mergeGenieBrief()  the rules so nothing is lost if Genie leaves a field out.

import { INDUSTRIES } from './context-packs.js';
import { COUNTRIES, findCountry } from './world.js';
import { suggestProfile, industryPack } from './contextualize.js';

export const OUTCOMES = [
  { id: 'adapt', label: 'Adapt their leadership style to each person' },
  { id: 'motivate', label: 'Motivate and energize the team' },
  { id: 'upskill', label: 'Develop people through coaching and training' },
  { id: 'enable', label: 'Create conditions for high performance' },
  { id: 'results', label: 'Drive the team to its targets' },
];

export const CONSTRAINT_CHIPS = [
  { id: 'noFiring', label: 'No firing in the simulation' },
  { id: 'formal', label: 'Formal tone' },
  { id: 'localNames', label: 'Local names for the team' },
  { id: 'short', label: 'Fits in 45 minutes' },
];

export const AUDIENCES = ['First-time managers', 'Team leads', 'Mid-level managers', 'Sales managers', 'Graduate hires'];

export const EXAMPLE_BRIEFS = [
  {
    label: 'Bank in Mumbai',
    instructions: 'A 60-minute simulation for first-time sales managers at Meridian Bank in Mumbai. Their teams sell home loans to consumers through branches, and new managers struggle to coach low performers without losing their best people.',
    outcomeText: 'Managers should read each person and switch between directing and coaching.',
    constraints: 'Keep the tone formal. Use Indian names.',
  },
  {
    label: 'IT services in London',
    instructions: 'For mid-level managers at Brightpath, an IT services firm in London selling managed cloud services to enterprise clients. We want them to practise leading a mixed team through a tough quarter.',
    outcomeText: 'Adapt style, motivate the team and still hit the number.',
    constraints: 'No firing please. 90 minutes.',
  },
  {
    label: 'Pharma in Nairobi',
    instructions: 'Zonal managers at Aurelia Pharma in Nairobi lead medical reps who promote a diabetes medicine to doctors. Build a challenging version for experienced managers.',
    outcomeText: 'Develop reps through coaching and recognise good work at the right time.',
    constraints: '',
  },
];

const INDUSTRY_WORDS = {
  elevators: /\b(elevators?|escalators?|lifts?)\b/gi,
  banking: /\b(bank(s|ing)?|loans?|mortgages?|credit cards?|lending|fintech|wealth|deposits?|branch(es)?)\b/gi,
  insurance: /\b(insur(ance|er|ers)?|polic(y|ies)|claims?|underwrit\w*|premiums?)\b/gi,
  medtech: /\b(medical devices?|medtech|hospitals?|diagnostics?|monitors?|healthcare|clinical equipment)\b/gi,
  pharma: /\b(pharma\w*|drugs?|medicines?|prescri\w*|doctors?|medical reps?|HCPs?)\b/gi,
  it: /\b(software|saas|IT services|cloud|tech(nology)?|platforms?|digital|managed services?|data)\b/gi,
  manufacturing: /\b(manufactur\w*|factor(y|ies)|industrial|machin\w*|equipment|automotive|plants?)\b/gi,
  telecom: /\b(telecom\w*|broadband|mobile network|5G|fib(re|er)|connectivity|operators?)\b/gi,
};
const SERVICE_WORDS = /\b(services?|advisory|consult\w*|managed|subscriptions?|maintenance|support plans?|programmes?|programs?|contracts?)\b/gi;
const PRODUCT_WORDS = /\b(products?|devices?|loans?|cards?|medicines?|drugs?|machines?|equipment|plans?|platforms?|monitors?)\b/gi;
const B2C_WORDS = /\b(consumers?|retail|households?|individuals?|families|B2C|walk-in|shoppers?|patients?)\b/gi;
const B2B_WORDS = /\b(business(es)?|enterprises?|B2B|companies|corporate|clients?|hospitals?|clinics?|SMEs?|distributors?|doctors?)\b/gi;
const ORG_WORDS = /\b(Bank|Insurance|Assurance|Pharma|Labs?|Technologies|Tech|Telecom|Group|Ltd|Limited|Inc|Health|Medical|Systems|Industries|Motors|Solutions|Networks|Partners|Capital|Holdings|Corp|Company)\b/;
const NOT_ORG = /\b(Managers?|Leaders?|Leads?|Teams?|Heads?|Directors?|Reps?|First-time|Sales|Graduates?|Minutes?|English)\b/;
const DEMONYMS = {
  indian: 'IN', kenyan: 'KE', british: 'GB', american: 'US', emirati: 'AE', german: 'DE', japanese: 'JP', brazilian: 'BR', mexican: 'MX',
  nigerian: 'NG', 'south african': 'ZA', australian: 'AU', singaporean: 'SG', french: 'FR', canadian: 'CA', saudi: 'SA', spanish: 'ES',
  italian: 'IT', chinese: 'CN', indonesian: 'ID', filipino: 'PH', egyptian: 'EG', dutch: 'NL', swedish: 'SE', polish: 'PL', turkish: 'TR',
  korean: 'KR', vietnamese: 'VN', thai: 'TH', malaysian: 'MY', pakistani: 'PK', bangladeshi: 'BD', ghanaian: 'GH', irish: 'IE',
};
const CITY_STOP = new Set(['Nice', 'Mary', 'Laura', 'Bar', 'Kara', 'Bo', 'Victoria', 'Hamilton', 'Liberta', 'Neves', 'Seria', 'Manta', 'Salto', 'Mosta', 'Laura', 'Mars', 'Santa Ana', 'San Miguel', 'Valencia', 'León']);

const count = (re, text) => (text.match(re) || []).length;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function findLocation(text) {
  const byName = Object.values(COUNTRIES)
    .filter((c) => new RegExp(`\\b${esc(c.name)}\\b`, 'i').test(text))
    .sort((a, b) => b.name.length - a.name.length)[0];
  let cityHit = null;
  for (const c of Object.values(COUNTRIES)) {
    for (const city of c.cities) {
      if (city.length < 4 || CITY_STOP.has(city)) continue;
      if (new RegExp(`\\b${esc(city)}\\b`).test(text) && (!byName || byName.code === c.code)) {
        if (!cityHit || city.length > cityHit.city.length) cityHit = { code: c.code, city };
      }
    }
  }
  if (cityHit) return { country: cityHit.code, city: cityHit.city, countryFrom: byName ? 'brief' : 'inferred' };
  if (byName) return { country: byName.code, city: '', countryFrom: 'brief' };
  const lower = text.toLowerCase();
  const dem = Object.entries(DEMONYMS).find(([d]) => new RegExp(`\\b${d}\\b`).test(lower));
  if (dem) return { country: dem[1], city: '', countryFrom: 'inferred' };
  return null;
}

function findOrg(text) {
  const quoted = [...text.matchAll(/["“]([^"”]{2,40})["”]/g)].map((m) => m[1].trim());
  const cands = [...text.matchAll(/\b(?:at|for|called|named|with|join(?:ing)?)\s+((?:[A-Z][\w&'.-]*)(?:\s+(?:[A-Z][\w&'.-]*|of|and|&))*)/g)].map((m) => m[1].trim().replace(/\s+(of|and|&)$/, ''));
  const places = new Set(Object.values(COUNTRIES).flatMap((c) => [c.name, ...c.cities]));
  const ok = [...quoted, ...cands].filter((c) => !places.has(c) && !NOT_ORG.test(c) && !/^(A|An|The|Our|Their)$/.test(c));
  return ok.find((c) => ORG_WORDS.test(c)) || ok[0] || '';
}

function findOffering(text, org) {
  const quoted = [...text.matchAll(/["“]([^"”]{2,40})["”]/g)].map((m) => m[1].trim()).filter((q) => q !== org);
  if (quoted.length) return quoted[0];
  const m = text.match(/\b(?:product|service|solution|platform|plan|loan|card|medicine|device)\s+(?:called|named)\s+([A-Z][\w-]*(?:\s+[A-Z0-9][\w-]*)*)/);
  return m ? m[1] : '';
}

function findCategory(text, industry) {
  const pack = INDUSTRIES[industry];
  const known = [pack?.product?.category, pack?.service?.category, 'home loan', 'personal loan', 'credit card', 'car loan', 'life insurance', 'health insurance', 'managed cloud service', 'cloud platform', 'diabetes medicine', 'cardiac monitor', 'broadband plan', 'managed network service'].filter(Boolean);
  const lower = text.toLowerCase();
  return known.sort((a, b) => b.length - a.length).find((k) => lower.includes(k.toLowerCase().replace(/s$/, ''))) || '';
}

// base: the template's default profile. Returns { profile, settings, sources, missing }.
export function readBrief(brief, base) {
  const text = [brief.instructions, brief.outcomeText, brief.constraints].filter(Boolean).join('\n');
  const sources = {};
  const set = (obj, key, value, source) => { obj[key] = value; sources[key] = source; };
  let profile = { ...base, customIndustry: '' };

  // Industry
  const scores = Object.entries(INDUSTRY_WORDS).map(([id, re]) => [id, count(re, text)]).sort((a, b) => b[1] - a[1]);
  const industry = scores[0][1] > 0 ? scores[0][0] : null;
  profile = suggestProfile({ ...profile, industry: industry || 'other' }, 'industry', { ...base, orgName: '', offeringName: '' });
  if (!industry) Object.assign(profile, { orgName: '', offeringName: '', offeringCategory: '' });
  sources.industry = industry ? 'brief' : 'default';
  for (const k of ['orgName', 'offeringName', 'offeringCategory', 'learnerRole', 'customerType']) sources[k] = 'suggested';

  // What is sold, to whom
  const svc = count(SERVICE_WORDS, text);
  const prd = count(PRODUCT_WORDS, text);
  if (svc || prd) {
    const type = svc > prd ? 'service' : 'product';
    if (type !== profile.offeringType) profile = suggestProfile({ ...profile, offeringType: type }, 'offeringType', profile);
    sources.offeringType = 'brief';
  } else sources.offeringType = 'suggested';
  const b2c = count(B2C_WORDS, text);
  const b2b = count(B2B_WORDS, text);
  if (b2c || b2b) set(profile, 'customerType', b2c > b2b ? 'b2c' : 'b2b', 'brief');

  // Names
  const org = findOrg(text);
  if (org) set(profile, 'orgName', org, 'brief');
  const offering = findOffering(text, org);
  if (offering) set(profile, 'offeringName', offering, 'brief');
  const cat = industry ? findCategory(text, industry) : '';
  if (cat) set(profile, 'offeringCategory', cat, 'brief');

  // Location
  const loc = findLocation(text);
  if (loc) {
    set(profile, 'country', loc.country, loc.countryFrom);
    if (loc.city) set(profile, 'city', loc.city, 'brief');
    else set(profile, 'city', COUNTRIES[loc.country].cities[0], 'suggested');
  } else {
    sources.country = 'default';
    sources.city = 'default';
  }

  // Settings
  const lower = text.toLowerCase();
  const settings = { audience: [], length: 'long', difficulty: 'standard', outcomes: [...(brief.outcomes || [])], noFiring: false, formal: false, localNames: false };
  const AUD_RE = { 'First-time managers': /first[- ]time/, 'Team leads': /team lead(er)?s?\b/, 'Mid-level managers': /mid[- ]level|middle manag/, 'Sales managers': /sales manag/, 'Graduate hires': /graduate/ };
  settings.audience = AUDIENCES.filter((a) => AUD_RE[a].test(lower));
  if (!settings.audience.length && /\bmanagers?\b/.test(lower)) settings.audience = ['Mid-level managers'];
  sources.audience = settings.audience.length ? 'brief' : 'default';
  if (!settings.audience.length) settings.audience = ['First-time managers'];
  const mins = lower.match(/(\d{2,3})\s*-?\s*(?:min|minute)/);
  const chips = new Set(brief.chips || []);
  if (chips.has('short')) { settings.length = 'short'; sources.length = 'brief'; } else if (mins) {
    const n = Number(mins[1]);
    settings.length = n <= 50 ? 'short' : n <= 75 ? 'medium' : 'long';
    sources.length = 'brief';
  } else if (/\b(an|one) hour\b/.test(lower)) { settings.length = 'medium'; sources.length = 'brief'; } else sources.length = 'default';
  if (/\b(challenging version|challenging|difficult|hard mode|experienced|senior)\b/.test(lower)) { settings.difficulty = 'challenging'; sources.difficulty = 'brief'; } else if (/\b(gentle|easy|beginners?|introductory|guided)\b/.test(lower)) { settings.difficulty = 'guided'; sources.difficulty = 'brief'; } else sources.difficulty = 'default';
  const outcomeWords = { upskill: /coach|develop|train|upskill|mentor/, motivate: /motivat|morale|energi|engag|recognis|recogniz/, adapt: /adapt|situational|style|flex|switch/, results: /result|target|revenue|quota|number|goal/, enable: /environment|enabl|high perform/ };
  for (const [id, re] of Object.entries(outcomeWords)) if (re.test(lower) && !settings.outcomes.includes(id)) settings.outcomes.push(id);
  sources.outcomes = settings.outcomes.length ? 'brief' : 'default';
  if (!settings.outcomes.length) settings.outcomes = ['adapt'];
  settings.noFiring = chips.has('noFiring') || /\b(no|without|avoid|don'?t (?:want|include))\s+(?:any\s+)?(fir\w*|termination|layoffs?|dismissals?)/.test(lower);
  settings.formal = chips.has('formal') || /\bformal\b/.test(lower);
  settings.localNames = chips.has('localNames') || /\b(local|indian|arabic|african|japanese|chinese|german|spanish) names\b/.test(lower) || (loc ? loc.country !== 'US' : false);

  // What cannot be inferred reliably: ask.
  const missing = [];
  if (!industry) missing.push('industry');
  if (!org) missing.push('orgName');
  if (!loc) missing.push('country');
  return { profile, settings, sources, missing, by: 'rules' };
}

export function briefPrompt(brief) {
  const industries = Object.entries(INDUSTRIES).map(([id, p]) => `${id} (${p.label})`).join(', ');
  return [
    'An author wants a leadership simulation (iLead: the learner leads an under-performing sales team and must adapt their style to each person).',
    'Read their brief and fill in the fields below. Only fill a field if the brief states it or it can reasonably be inferred; otherwise use null and list the field in "unknown".',
    '',
    `Brief: ${brief.instructions || ''}`,
    brief.outcomeText ? `Intended outcome: ${brief.outcomeText}` : '',
    (brief.outcomes || []).length ? `Outcomes picked: ${brief.outcomes.join(', ')}` : '',
    brief.constraints || (brief.chips || []).length ? `Constraints and preferences: ${[brief.constraints, ...(brief.chips || [])].filter(Boolean).join('; ')}` : '',
    '',
    `Industry must be one of: ${industries}, or "other" with customIndustry set.`,
    'Reply with only a JSON object: {"orgName": string|null, "industry": string|null, "customIndustry": string|null, "offeringType": "product"|"service"|null, "offeringName": string|null, "offeringCategory": string|null, "customerType": "b2b"|"b2c"|null, "country": string|null (country name), "city": string|null, "learnerRole": string|null, "audience": string[], "sessionMinutes": number|null, "difficulty": "guided"|"standard"|"challenging"|null, "outcomes": ("adapt"|"motivate"|"upskill"|"enable"|"results")[], "noFiring": boolean, "formalTone": boolean, "localNames": boolean, "unknown": string[]}',
  ].filter(Boolean).join('\n');
}

// Genie's reading wins where it gave a value; the rules fill the rest.
export function mergeGenieBrief(rules, g, base) {
  if (!g || typeof g !== 'object') return rules;
  const out = { ...rules, profile: { ...rules.profile }, settings: { ...rules.settings }, sources: { ...rules.sources }, by: 'genie' };
  const P = out.profile;
  const took = (k, v) => { if (v !== null && v !== undefined && v !== '') { P[k] = v; out.sources[k] = 'brief'; return true; } return false; };
  if (g.industry && (INDUSTRIES[g.industry] || g.industry === 'other')) {
    if (g.industry !== P.industry) Object.assign(P, suggestProfile({ ...P, industry: g.industry }, 'industry', { ...P, orgName: '', offeringName: '' }));
    out.sources.industry = 'brief';
    if (g.industry === 'other') took('customIndustry', g.customIndustry);
  }
  if (g.offeringType === 'product' || g.offeringType === 'service') took('offeringType', g.offeringType);
  if (g.customerType === 'b2b' || g.customerType === 'b2c') took('customerType', g.customerType);
  took('orgName', g.orgName);
  took('offeringName', g.offeringName);
  took('offeringCategory', g.offeringCategory);
  took('learnerRole', g.learnerRole);
  if (g.country) {
    const code = findCountry(g.country);
    if (code) { P.country = code; out.sources.country = 'brief'; }
    else { Object.assign(P, { country: 'custom', customCountry: String(g.country), customRegion: P.customRegion || 'anglo', customCurrency: P.customCurrency || 'USD' }); out.sources.country = 'brief'; }
  }
  if (g.city) took('city', g.city);
  else if (out.sources.country === 'brief' && P.country !== 'custom' && !COUNTRIES[P.country]?.cities.includes(P.city)) { P.city = COUNTRIES[P.country].cities[0]; out.sources.city = 'suggested'; }
  const S = out.settings;
  if (Array.isArray(g.audience) && g.audience.length) { S.audience = g.audience.map(String); out.sources.audience = 'brief'; }
  if (Number(g.sessionMinutes) > 0) { const n = Number(g.sessionMinutes); S.length = n <= 50 ? 'short' : n <= 75 ? 'medium' : 'long'; out.sources.length = 'brief'; }
  if (['guided', 'standard', 'challenging'].includes(g.difficulty)) { S.difficulty = g.difficulty; out.sources.difficulty = 'brief'; }
  if (Array.isArray(g.outcomes) && g.outcomes.length) { S.outcomes = g.outcomes.filter((o) => ['adapt', 'motivate', 'upskill', 'enable', 'results'].includes(o)); out.sources.outcomes = 'brief'; }
  S.noFiring = rules.settings.noFiring || !!g.noFiring;
  S.formal = rules.settings.formal || !!g.formalTone;
  S.localNames = rules.settings.localNames || !!g.localNames;
  const unknown = new Set((g.unknown || []).map(String));
  out.missing = ['industry', 'orgName', 'country'].filter((k) => (k === 'industry' ? out.sources.industry !== 'brief' : k === 'orgName' ? !P.orgName || unknown.has('orgName') && out.sources.orgName !== 'brief' : out.sources.country !== 'brief' && out.sources.country !== 'inferred'));
  if (!industryPack(P)) out.missing.push('industry');
  return out;
}
