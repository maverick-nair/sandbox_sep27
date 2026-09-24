// Reads an author's brief (instructions, intended outcome, constraints) and infers everything
// the simulation needs. Every inferred field carries its source so the author can see what came
// from their words, what was inferred, and what still needs an answer.
//
// Two readers share one output shape:
//   readBrief()        built-in rules, instant, works everywhere (English)
//   briefPrompt() and  Genie (hosted AI) for richer understanding and any language; its answer
//   mergeGenieBrief()  is merged over the rules so nothing is lost if Genie leaves a field out.
//
// Output: { profile, settings, sources, missing, conflicts, specifics, suggestions, notes, by }
//   missing     questions to ask: industry, orgName, country, offeringName
//   conflicts   the brief says two different things; ask which one ({ key, question, options })
//   specifics   concrete instructions (weeks, target, stages, names, events, deal value), each
//               marked used or not used with the reason, so nothing is dropped silently
//   suggestions values to offer on a question (never applied until the author picks them)

import { INDUSTRIES } from './context-packs.js';
import { COUNTRIES, COUNTRY_ALIASES, CURRENCIES, findCountry } from './world.js';
import { suggestProfile, industryPack, suggestOfferingName } from './contextualize.js';

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
  insurance: /\b(insur(ance|er|ers)?|assurance|polic(y|ies)|claims?|underwrit\w*|premiums?)\b/gi,
  medtech: /\b(medical devices?|medtech|hospitals?|diagnostics?|monitors?|healthcare|clinical equipment)\b/gi,
  pharma: /\b(pharma\w*|drugs?|medicines?|prescri\w*|doctors?|medical reps?|HCPs?)\b/gi,
  it: /\b(software|saas|IT services|cloud|tech(nology)?|technologies|infotech|platforms?|digital|managed services?|data)\b/gi,
  manufacturing: /\b(manufactur\w*|factor(y|ies)|industrial|industries|engineering|machin\w*|equipment|automotive|plants?)\b/gi,
  telecom: /\b(telecom\w*|broadband|mobile network|5G|fib(re|er)|connectivity|operators?)\b/gi,
};
const SERVICE_WORDS = /\b(services?|advisory|consult\w*|managed|subscriptions?|maintenance|support plans?|programmes?|programs?|contracts?)\b/gi;
const PRODUCT_WORDS = /\b(products?|devices?|loans?|cards?|medicines?|drugs?|machines?|equipment|plans?|platforms?|monitors?)\b/gi;
const B2C_WORDS = /\b(consumers?|retail|households?|individuals?|families|B2C|walk-in|shoppers?|patients?)\b/gi;
const B2B_WORDS = /\b(business(es)?|enterprises?|B2B|companies|corporate|clients?|hospitals?|clinics?|SMEs?|distributors?|doctors?)\b/gi;
const ORG_SUFFIX = 'Bank|Banking|Insurance|Assurance|Pharma|Pharmaceuticals|Labs?|Technologies|Technology|Tech|Telecom|Group|Ltd|Limited|Inc|Health|Healthcare|Medical|Systems|Industries|Motors|Solutions|Networks|Partners|Capital|Holdings|Corp|Corporation|Company|Co|Hotels?|Resorts|Logistics|Energy|Power|Foods|Retail|Airlines|Airways|Finance|Financial|Securities|Ventures|Enterprises|Services|Software|Digital|Media|Brands|Electronics|Engineering|Manufacturing|Steel|Cement|Chemicals|Mobility|Mart|Stores';
const ORG_RE = new RegExp(`\\b(?:${ORG_SUFFIX})\\.?$`);
const NOT_ORG = /^(?:Managers?|Leaders?|Leads?|Teams?|Heads?|Directors?|Reps?|First-time|Sales|Graduates?|Minutes?|English|Please|Christmas|Easter|Diwali|Eid|Ramadan|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|Q[1-4]|CEO|CFO|COO|CTO|HR|L&D|IT|AI|Genie|Our|Their|The|A|An|This|That|We|I|You|They)$/;
const TITLES = /\b(?:CEO|CFO|COO|CTO|MD|VP|head|manager|director|named|called|Mr|Mrs|Ms|Dr|colleague|rep|leader)\.?\s*$/i;
const DEMONYMS = {
  indian: 'IN', kenyan: 'KE', british: 'GB', american: 'US', emirati: 'AE', german: 'DE', japanese: 'JP', brazilian: 'BR', mexican: 'MX',
  nigerian: 'NG', 'south african': 'ZA', australian: 'AU', singaporean: 'SG', french: 'FR', canadian: 'CA', saudi: 'SA', spanish: 'ES',
  italian: 'IT', chinese: 'CN', indonesian: 'ID', filipino: 'PH', egyptian: 'EG', dutch: 'NL', swedish: 'SE', polish: 'PL', turkish: 'TR',
  korean: 'KR', vietnamese: 'VN', thai: 'TH', malaysian: 'MY', pakistani: 'PK', bangladeshi: 'BD', ghanaian: 'GH', irish: 'IE',
};
const US_STATES = ['Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California', 'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia', 'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa', 'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland', 'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri', 'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey', 'New Mexico', 'North Carolina', 'North Dakota', 'Ohio', 'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina', 'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont', 'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming'];
const US_STATE_CODES = /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/;
// Words that are also city names; only read as a city with a clear location phrase around them.
const CITY_STOP = new Set(['Mary', 'Laura', 'Bar', 'Kara', 'Bo', 'Liberta', 'Neves', 'Seria', 'Manta', 'Salto', 'Mosta', 'Mars', 'Santa Ana', 'San Miguel', 'León', 'David', 'Victoria']);
// A few words of Hindi, so a Hindi brief is not a blank page for the rules. Genie reads any language.
const HINDI = [['मुंबई', 'Mumbai'], ['दिल्ली', 'Delhi'], ['बेंगलुरु', 'Bengaluru'], ['बैंगलोर', 'Bengaluru'], ['चेन्नई', 'Chennai'], ['कोलकाता', 'Kolkata'], ['हैदराबाद', 'Hyderabad'], ['पुणे', 'Pune'], ['बैंक', 'bank'], ['बीमा', 'insurance'], ['फार्मा', 'pharma'], ['दवा', 'medicine'], ['ऋण', 'loan'], ['लोन', 'loan'], ['बिक्री प्रबंधक', 'sales managers'], ['प्रबंधक', 'managers'], ['भारत', 'India']];

const count = (re, text) => (text.match(re) || []).length;
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const tidy = (s) => String(s || '').trim().replace(/['’]s$/, '').replace(/[\s.,;:!?)\]"”']+$/, '').replace(/^[\s("“']+/, '');
const titleCase = (s) => s.replace(/\b\p{L}/gu, (c) => c.toUpperCase());

// Where each place mention sits: the team's location, or where the customers are.
const TEAM_BEFORE = /(?:\b(?:in|based in|based out of|out of|located in|team in|teams in|office in|offices in|across|from|near|around)\s+|\()$/i;
const CLIENT_BEFORE = /\b(?:clients?|customers?|buyers?|patients?|accounts?|markets?|partners?|distributors?)\s+(?:in|from|across)\s+$|\b(?:sell(?:s|ing)?|export(?:s|ing)?|ship(?:s|ping)?|expand(?:s|ing)?)\b(?:\s+[\w-]+){0,5}\s+(?:to|into|in)\s+$/i;
// Lists carry the role of their first item: "in India and Germany", "clients in Ghana and Kenya".
const TEAM_LIST = /\b(?:in|based in|across|out of)\s+\p{Lu}\p{L}+(?:\s+\p{Lu}\p{L}+)?\s*(?:,|and|or|&)\s*$/u;
const CLIENT_LIST = /\b(?:clients?|customers?|buyers?|patients?|accounts?|markets?|partners?|distributors?)\s+(?:in|from|across)\s+\p{Lu}\p{L}+(?:\s+\p{Lu}\p{L}+)?\s*(?:,|and|or|&)\s*$/u;
function placeWeight(text, index, length) {
  const before = text.slice(Math.max(0, index - 60), index);
  const after = text.slice(index + length, index + length + 30);
  if (CLIENT_LIST.test(before)) return { w: 0.3, role: 'client' };
  if (TEAM_LIST.test(before) && !CLIENT_BEFORE.test(before.replace(/\p{Lu}\p{L}+(?:\s+\p{Lu}\p{L}+)?\s*(?:,|and|or|&)\s*$/u, ''))) return { w: 1, role: 'team' };
  if (CLIENT_BEFORE.test(before) || /^\s+(?:clients?|customers?|buyers?|market)\b/i.test(after)) return { w: 0.3, role: 'client' };
  if (TEAM_BEFORE.test(before) || /^[\s-]+based\b/i.test(after)) return { w: 1, role: 'team' };
  return { w: 0.6, role: 'mention' };
}

function findLocation(text) {
  const cands = [];
  let ambiguous = null;
  const covered = []; // text ranges already read as part of "City, State"
  // "Atlanta, Georgia" or "Austin, TX": a US state after a city.
  const stateRe = new RegExp(`\\b([A-Z][\\p{L}.'-]+(?:\\s+[A-Z][\\p{L}.'-]+)?),\\s*(${US_STATES.join('|')})\\b`, 'gu');
  for (const m of text.matchAll(stateRe)) {
    const { w } = placeWeight(text, m.index, m[1].length);
    cands.push({ country: 'US', city: m[1], w: w + 0.4, role: 'team' });
    covered.push([m.index, m.index + m[0].length]);
  }
  const codeHit = text.match(new RegExp(`\\b([A-Z][\\p{L}.'-]+(?:\\s+[A-Z][\\p{L}.'-]+)?)${US_STATE_CODES.source}`, 'u'));
  if (codeHit) { cands.push({ country: 'US', city: codeHit[1], w: 1.2, role: 'team' }); covered.push([codeHit.index, codeHit.index + codeHit[0].length]); }
  const inCovered = (i) => covered.some(([a, b]) => i >= a && i < b);

  // Countries by name or everyday alias.
  const names = [...Object.values(COUNTRIES).map((c) => [c.name, c.code]), ...Object.entries(COUNTRY_ALIASES).filter(([a]) => a.length > 3 && !a.startsWith('the ')).map(([a, c]) => [a, c])];
  for (const [name, code] of names) {
    for (const m of text.matchAll(new RegExp(`\\b${esc(name)}\\b`, 'gi'))) {
      if (inCovered(m.index)) continue;
      if (name === 'Georgia' || (name.length <= 5 && m[0] !== m[0].replace(/^\p{Ll}/u, (c) => c.toUpperCase()))) {
        // "Georgia" alone could be the country or the US state; short lowercase words are not names.
        if (name === 'Georgia') ambiguous = { options: [{ label: 'Georgia, United States', country: 'US', city: 'Atlanta' }, { label: 'Georgia (the country)', country: 'GE', city: 'Tbilisi' }] };
        else continue;
      }
      const { w, role } = placeWeight(text, m.index, m[0].length);
      cands.push({ country: code, city: '', w, role });
    }
  }
  // US states on their own ("in Texas").
  for (const st of US_STATES) {
    if (st === 'Georgia') continue;
    for (const m of text.matchAll(new RegExp(`\\b${esc(st)}\\b`, 'g'))) {
      if (inCovered(m.index)) continue;
      const { w, role } = placeWeight(text, m.index, st.length);
      if (role !== 'mention') cands.push({ country: 'US', city: '', w, role, state: st });
    }
  }
  // Cities need a location phrase ("in Lagos", "based in Pune", "(Mumbai)", "Pune-based") or a
  // country right after them, so "our CEO David" or "Florence, our L&D head" are not places.
  for (const c of Object.values(COUNTRIES)) {
    for (const city of c.cities) {
      if (city.length < 4) continue;
      for (const m of text.matchAll(new RegExp(`(?<![\\p{L}])${esc(city)}(?![\\p{L}])`, 'giu'))) {
        if (inCovered(m.index)) continue;
        const before = text.slice(Math.max(0, m.index - 60), m.index);
        const after = text.slice(m.index + m[0].length, m.index + m[0].length + 40);
        const lower = m[0] !== city;
        const withCountry = new RegExp(`^,?\\s*(?:${esc(c.name)})\\b`, 'i').test(after);
        const { w, role } = placeWeight(text, m.index, m[0].length);
        if (TITLES.test(before)) continue;
        if (role === 'mention' && !withCountry) continue;
        if (CITY_STOP.has(city) && !withCountry) continue;
        if (lower && role === 'mention') continue;
        cands.push({ country: c.code, city, w: w + (withCountry ? 0.4 : 0.2), role: withCountry ? 'team' : role });
      }
    }
  }
  // Demonyms: "Indian names" point to India; "German clients" to where customers are.
  const lower = text.toLowerCase();
  for (const [d, code] of Object.entries(DEMONYMS)) {
    const m = lower.match(new RegExp(`\\b${d}\\b(\\s+\\w+)?`));
    if (!m) continue;
    const next = (m[1] || '').trim();
    const w = /^(clients?|customers?|buyers?|market|markets|partners?)$/.test(next) ? 0.2 : /^names?$/.test(next) ? 0.5 : 0.4;
    cands.push({ country: code, city: '', w, role: w === 0.2 ? 'client' : 'demonym' });
  }
  if (!cands.length) return ambiguous ? { country: ambiguous.options[1].country, city: '', countryFrom: 'inferred', ambiguous } : null;

  const byCountry = new Map();
  for (const c of cands) {
    const e = byCountry.get(c.country) || { country: c.country, w: 0, team: 0, city: '', cityW: 0, cityRole: '' };
    e.w += c.w;
    if (c.role === 'team') e.team += c.w;
    if (c.city && c.w > e.cityW) { e.city = c.city; e.cityW = c.w; e.cityRole = c.role; }
    byCountry.set(c.country, e);
  }
  const ranked = [...byCountry.values()].sort((a, b) => b.team - a.team || b.w - a.w);
  const top = ranked[0];
  const second = ranked[1];
  // Two places that both read like where the team is: ask rather than guess.
  if (!ambiguous && second && second.team >= 0.6 && second.team >= top.team * 0.6) {
    ambiguous = { options: ranked.slice(0, 3).filter((r) => r.team >= 0.6).map((r) => ({ label: `${r.city ? `${r.city}, ` : ''}${COUNTRIES[r.country].name}`, country: r.country, city: r.city || COUNTRIES[r.country].cities[0] })) };
  }
  if (ambiguous?.options?.some((o) => o.country === 'US') && top.country === 'US' && byCountry.get('US')?.city) ambiguous = null; // "Atlanta, Georgia" settles it
  const clear = !ambiguous && top.team >= 1;
  const cityFromBrief = !!top.city && top.cityRole !== 'client';
  return { country: top.country, city: cityFromBrief ? top.city : '', countryFrom: clear ? 'brief' : 'inferred', cityFrom: cityFromBrief ? 'brief' : 'suggested', ambiguous };
}

function findOrg(text) {
  const places = new Set(Object.values(COUNTRIES).flatMap((c) => [c.name, ...c.cities]).concat(US_STATES));
  const cleanOk = (c) => {
    const t = tidy(c).replace(/\s+(?:of|and|&|in|at|for)$/i, '');
    if (!t || t.length < 2 || t.length > 48) return '';
    const words = t.split(/\s+/);
    if (places.has(t) || words.every((w) => places.has(w) || NOT_ORG.test(w))) return '';
    if (NOT_ORG.test(words[0]) && !ORG_RE.test(t)) return '';
    return t;
  };
  const seq = "(?:[A-Z0-9][\\p{L}\\p{N}&'.-]*)(?:\\s+(?:[A-Z0-9][\\p{L}\\p{N}&'.-]*|of|and|&))*";
  const found = [];
  // After "at", "for", "called" and similar, in any letter case ("For Meridian Bank").
  for (const m of text.matchAll(new RegExp(`\\b(?:[Aa]t|[Ff]or|[Cc]alled|[Nn]amed|[Ww]ith|[Jj]oin(?:ing)?|[Ff]rom|[Bb]y|@)\\s+(?:[Tt]he\\s+)?(${seq})`, 'gu'))) {
    const t = cleanOk(m[1]);
    if (t) found.push({ t, score: ORG_RE.test(t) ? 3 : 2 });
  }
  if (/^@|\s@\s/.test(text)) for (const m of text.matchAll(new RegExp(`@\\s*(${seq})`, 'gu'))) { const t = cleanOk(m[1]); if (t) found.push({ t, score: 3 }); }
  // Anywhere, including the start of a sentence, when it ends like an organization ("Meridian Bank wants...").
  for (const m of text.matchAll(new RegExp(`(${seq})`, 'gu'))) {
    const words = tidy(m[1]).split(/\s+/);
    // Drop leading sentence words that are not part of the name ("Run it", "Our").
    while (words.length > 1 && (NOT_ORG.test(words[0]) || /^(?:For|At|In|With|By|From|Called|Named|Join|Joining|Run|Build|Make|Create|Please|Dear|Hi|Hello)$/.test(words[0]))) words.shift();
    const t = cleanOk(words.join(' '));
    if (t && ORG_RE.test(t) && t.split(/\s+/).length >= 2) found.push({ t, score: 3 });
  }
  // Quoted names, only when they look like names ("Brightpath", not "fun").
  for (const m of text.matchAll(/["“]([^"”]{2,40})["”]/g)) {
    const t = cleanOk(m[1]);
    if (t && /^\p{Lu}/u.test(t) && !/^\p{Ll}+$/u.test(t)) found.push({ t, score: ORG_RE.test(t) ? 3 : 1.5 });
  }
  // All lowercase: "at acme logistics in dubai".
  for (const m of text.matchAll(new RegExp(`\\b(?:at|for|called|named|join)\\s+((?:[a-z][\\w&'-]*\\s+){0,3}?(?:${ORG_SUFFIX.toLowerCase()}))\\b`, 'g'))) {
    const t = cleanOk(titleCase(m[1]));
    if (t) found.push({ t, score: 1 });
  }
  found.sort((a, b) => b.score - a.score || b.t.length - a.t.length);
  return found[0]?.t || '';
}

function findOffering(text, org) {
  const quoted = [...text.matchAll(/["“]([^"”]{2,40})["”]/g)].map((m) => tidy(m[1])).filter((q) => q && q !== org && /^\p{Lu}/u.test(q));
  if (quoted.length) return quoted[0];
  const m = text.match(/\b(?:product|service|solution|platform|plan|loan|card|medicine|device|policy|app)\s+(?:called|named)\s+([A-Z][\w-]*(?:\s+[A-Z0-9][\w-]*)*)/);
  return m ? tidy(m[1]) : '';
}

function findCategory(text, industry) {
  const pack = INDUSTRIES[industry];
  const known = [pack?.product?.category, pack?.service?.category, 'home loan', 'personal loan', 'credit card', 'car loan', 'life insurance', 'health insurance', 'managed cloud service', 'cloud platform', 'diabetes medicine', 'cardiac monitor', 'broadband plan', 'managed network service'].filter(Boolean);
  const lower = text.toLowerCase();
  return known.sort((a, b) => b.length - a.length).find((k) => lower.includes(k.toLowerCase().replace(/s$/, ''))) || '';
}

// ---------- constraints, negation and contradictions ----------

const FIRE = "(?:fir(?:e|es|ed|ing)\\b|terminat\\w*|lay[- ]?offs?|dismiss\\w*|sack(?:s|ed|ing)?\\b|let (?:people|anyone|someone|them|staff) go)";
const NEG = "(?:no|without|avoid|exclude|excluding|remove|disable|drop|skip|turn off|switch off|don'?t|do not|never|can'?t|cannot|shouldn'?t|should not|mustn'?t|must not|not allowed to|no one gets)";
const NO_FIRING = new RegExp(`\\b${NEG}\\b[^.!?\\n]{0,40}?${FIRE}`, 'i');
const FORMAL_NEG = /\b(?:not|non|less|un)[- ]?(?:too\s+|so\s+|very\s+|be\s+)?formal\b|\binformal\b|\bcasual\b|\brelaxed\b|\bconversational\b|\bfriendly tone\b/i;

function minuteMentions(lower) {
  const out = [];
  for (const m of lower.matchAll(/(\d{2,3})\s*-?\s*(?:min|mins|minute|minutes)\b/g)) out.push({ n: Number(m[1]), at: m.index });
  for (const m of lower.matchAll(/\b(?:an|one) hour and a half\b|\b(?:1\.5|one and a half) hours?\b/g)) out.push({ n: 90, at: m.index });
  for (const m of lower.matchAll(/\b(?:an|one) hour\b(?! and a half)/g)) out.push({ n: 60, at: m.index });
  for (const m of lower.matchAll(/\b(?:two|2) hours?\b/g)) out.push({ n: 120, at: m.index });
  return out.sort((a, b) => a.at - b.at);
}
const lengthFor = (n) => (n <= 50 ? 'short' : n <= 75 ? 'medium' : 'long');
const LENGTH_LABEL = { short: '45 minutes', medium: '60 minutes', long: '90 minutes' };

// ---------- concrete instructions ----------

const CURRENCY_SIGNS = { $: 'USD', '£': 'GBP', '€': 'EUR', '₹': 'INR', '¥': 'JPY', 'rs': 'INR', 'rs.': 'INR' };
const MULT = { k: 1e3, thousand: 1e3, m: 1e6, million: 1e6, lakh: 1e5, lakhs: 1e5, crore: 1e7, crores: 1e7 };
const STAGE_COUNT = 5;
const TEAM_SIZE = 10;

function findSpecifics(text) {
  const out = [];
  const add = (id, label, text2, used, reason, value) => out.push({ id, label, text: text2, used, reason, value });

  const wk = text.match(/\b(\d{1,2})\s*(?:simulated\s+|-)?weeks?\b/i);
  if (wk) {
    const n = Number(wk[1]);
    if (n >= 3 && n <= 20) add('weeks', 'Simulated weeks', `${n} weeks`, true, '', n);
    else add('weeks', 'Simulated weeks', `${n} weeks`, false, 'Simulations run between 3 and 20 simulated weeks.');
  }

  const tg = text.match(/\btarget(?:\s+(?:of|is|at|=|:|should be))?\s*(?:of\s+)?(\d{1,4})\b/i) || text.match(/\b(\d{1,4})\s+(?:conversions|sales|deals|loans|policies|contracts|closures)\b[^.]{0,20}\btarget\b/i);
  if (tg) {
    const n = Number(tg[1]);
    if (n >= 5 && n <= 2000) add('target', 'Target', `${n} conversions`, true, '', n);
    else add('target', 'Target', `${n}`, false, 'A target needs to be at least 5 conversions.');
  }

  const sg = text.match(/\bstages?\s*(?:are|is|:|would be|should be|=|called|named)\s*:?\s*([^.\n]+)/i);
  if (sg) {
    const names = sg[1].split(/\s*(?:,|→|->|>|\/|;|\bthen\b|\band\b)\s*/i).map((x) => tidy(x)).filter((x) => x && x.length <= 40).map((x) => x.charAt(0).toUpperCase() + x.slice(1));
    if (names.length === STAGE_COUNT) add('stages', 'Stage names', names.join(', '), true, '', names);
    else if (names.length > 1) add('stages', 'Stage names', names.join(', '), false, `iLead has ${STAGE_COUNT} stages and your brief lists ${names.length}. Rename the stages on the Story step.`);
  }

  const ts = text.match(/\bteam of (\d{1,2})\b/i) || text.match(/\b(\d{1,2})[- ](?:person|people|member|strong)\s+team\b/i);
  if (ts) {
    const n = Number(ts[1]);
    if (n === TEAM_SIZE) add('teamSize', 'Team size', `${n} people`, true, '', n);
    else add('teamSize', 'Team size', `${n} people`, false, `iLead teams start with ${TEAM_SIZE} people so that every leadership style is needed. The team keeps ${TEAM_SIZE}.`);
  }

  const nm = text.match(/\bnames?\s*(?:like|such as|including|are|is|:|=|of)?\s*((?:\p{Lu}[\p{L}'-]+)(?:\s*(?:,|and|&)\s*\p{Lu}[\p{L}'-]+)*)/u);
  if (nm) {
    const people = nm[1].split(/\s*(?:,|\band\b|&)\s*/).map((x) => x.trim()).filter((x) => x && !NOT_ORG.test(x) && !DEMONYMS[x.toLowerCase()]);
    if (people.length) add('names', 'Team member names', people.join(', '), people.length <= TEAM_SIZE, people.length > TEAM_SIZE ? `The team has ${TEAM_SIZE} people.` : '', people.slice(0, TEAM_SIZE));
  }

  for (const m of text.matchAll(/\b(?:include|add|with|have|plus)\s+(?:an?\s+|the\s+|one\s+)?([\p{L}\d'&-]+(?:\s+[\p{L}\d'&-]+){0,4}?)\s+(?:event|incident|crisis|situation)\b([^.]*)/giu)) {
    const name = tidy(m[1]).replace(/^(?:surprise|unexpected)\s+/i, '');
    if (!name || /^(?:an?|the|one|some|any)$/i.test(name)) continue;
    const week = m[2].match(/\bweek\s+(\d{1,2})\b/i);
    add(`event:${name.toLowerCase()}`, 'Event', `${name.charAt(0).toUpperCase() + name.slice(1)}${week ? `, week ${week[1]}` : ''}`, true, '', { name: name.charAt(0).toUpperCase() + name.slice(1), week: week ? Number(week[1]) : null });
  }

  const cur = text.match(/\bcurrency\s*(?:is|:|=|of|in)?\s*([A-Z]{3})\b/);
  const dv = text.match(/\b(?:average|avg\.?|typical|each)?\s*(?:loan|deal|policy|contract|sale|order|ticket|case)?\s*(?:fee|value|size|revenue|worth|amount|price)\s*(?:of|is|:|=|at|around|about|per \w+)?\s*(?:([A-Z]{3})|([$£€₹¥]|Rs\.?))?\s?(\d[\d,.]*)\s*(k|m|lakhs?|crores?|thousand|million)?\b/i);
  if (dv) {
    const code = (dv[1] && CURRENCIES.includes(dv[1].toUpperCase()) ? dv[1].toUpperCase() : null) || CURRENCY_SIGNS[(dv[2] || '').toLowerCase()] || CURRENCY_SIGNS[dv[2] || ''] || (cur && CURRENCIES.includes(cur[1]) ? cur[1] : null);
    const n = Number(dv[3].replace(/,/g, '')) * (MULT[(dv[4] || '').toLowerCase()] || 1);
    if (n > 0) add('dealValue', 'Value per conversion', `${code ? `${code} ` : ''}${n.toLocaleString('en')}`, true, '', { value: n, currency: code });
  } else if (cur && CURRENCIES.includes(cur[1])) add('currency', 'Currency', cur[1], true, '', cur[1]);
  return out;
}

// base: the template's default profile.
export function readBrief(brief, base) {
  const raw = [brief.instructions, brief.outcomeText, brief.constraints].filter(Boolean).join('\n');
  const notes = [];
  let text = raw;
  // Scripts the rules cannot read: translate the handful of words they know, and say so.
  if (/[ऀ-ॿ]/.test(raw)) {
    for (const [hi, en] of HINDI) text = text.split(`${hi} में`).join(` in ${en} `).split(hi).join(` ${en} `);
    notes.push({ kind: 'language', text: 'Your brief is not in English. The built-in rules read only a few words of it; Genie reads any language in the hosted GenieKreator.' });
  } else if (/[^\u0000-ɏḀ-ỿ -⁯₠-⃏←-⇿\s\p{Emoji}]/u.test(raw.replace(/[“”‘’₹€£¥]/g, ''))) {
    notes.push({ kind: 'language', text: 'Parts of your brief are not in English. The built-in rules may miss them; Genie reads any language in the hosted GenieKreator.' });
  }
  const sources = {};
  const suggestions = {};
  const set = (obj, key, value, source) => { obj[key] = value; sources[key] = source; };
  let profile = { ...base, customIndustry: '' };

  // Industry
  const scores = Object.entries(INDUSTRY_WORDS).map(([id, re]) => [id, count(re, text)]).sort((a, b) => b[1] - a[1]);
  const industry = scores[0][1] > 0 ? scores[0][0] : null;
  profile = suggestProfile({ ...profile, industry: industry || 'other' }, 'industry', { ...base, orgName: '', offeringName: '' });
  if (!industry) Object.assign(profile, { offeringName: '', offeringCategory: '' });
  sources.industry = industry ? 'brief' : 'default';
  for (const k of ['offeringName', 'offeringCategory', 'learnerRole', 'customerType']) sources[k] = 'suggested';

  // What is sold, to whom
  const svc = count(SERVICE_WORDS, text);
  const prd = count(PRODUCT_WORDS, text);
  if (svc || prd) {
    const type = svc > prd ? 'service' : 'product';
    if (type !== profile.offeringType) profile = suggestProfile({ ...profile, offeringType: type }, 'offeringType', profile);
    sources.offeringType = 'brief';
  } else sources.offeringType = 'suggested';
  if (!industry) profile.offeringName = '';
  const b2c = count(B2C_WORDS, text);
  const b2b = count(B2B_WORDS, text);
  const conflicts = [];
  if (b2c || b2b) {
    set(profile, 'customerType', b2c > b2b ? 'b2c' : 'b2b', 'brief');
    // Both, in similar measure ("consumers and businesses equally"): ask which the simulation is about.
    if (b2c && b2b && Math.min(b2c, b2b) / Math.max(b2c, b2b) >= 0.5) {
      conflicts.push({ key: 'customerType', question: 'Your brief mentions both consumers and businesses. Who does the team mainly sell to?', options: [{ label: 'Consumers', profile: { customerType: 'b2c' } }, { label: 'Businesses', profile: { customerType: 'b2b' } }] });
      sources.customerType = 'inferred';
    }
  }

  // Names. A missing organization is asked, never filled with a sample name.
  const org = findOrg(text);
  const pack = industryPack(profile);
  if (org) set(profile, 'orgName', org, 'brief');
  else { profile.orgName = ''; sources.orgName = 'default'; if (pack.sampleOrg) suggestions.orgName = pack.sampleOrg; }
  const offering = findOffering(text, org);
  if (offering) set(profile, 'offeringName', offering, 'brief');
  const cat = industry ? findCategory(text, industry) : '';
  if (cat) set(profile, 'offeringCategory', cat, 'brief');
  if (!profile.offeringName) suggestions.offeringName = suggestOfferingName(profile);

  // Location
  const loc = findLocation(text);
  if (loc) {
    set(profile, 'country', loc.country, loc.countryFrom);
    if (loc.city) set(profile, 'city', loc.city, loc.cityFrom);
    else set(profile, 'city', COUNTRIES[loc.country].cities[0], 'suggested');
    if (loc.ambiguous) suggestions.country = loc.ambiguous.options;
  } else {
    sources.country = 'default';
    sources.city = 'default';
  }

  // Settings
  const lower = text.toLowerCase();
  const settings = { audience: [], length: 'long', difficulty: 'standard', outcomes: [...(brief.outcomes || [])], noFiring: false, formal: false, localNames: false, weeks: null, target: null, dealValue: null, currency: null };
  const AUD_RE = { 'First-time managers': /first[- ]time/, 'Team leads': /team lead(er)?s?\b/, 'Mid-level managers': /mid[- ]level|middle manag/, 'Sales managers': /sales manag/, 'Graduate hires': /graduate/ };
  settings.audience = AUDIENCES.filter((a) => AUD_RE[a].test(lower));
  if (!settings.audience.length && /\bmanagers?\b/.test(lower)) settings.audience = ['Mid-level managers'];
  sources.audience = settings.audience.length ? 'brief' : 'suggested';
  if (!settings.audience.length) settings.audience = ['First-time managers'];
  const chips = new Set(brief.chips || []);
  const mins = minuteMentions(lower);
  if (chips.has('short')) { settings.length = 'short'; sources.length = 'brief'; } else if (mins.length) {
    const lengths = [...new Set(mins.map((m) => lengthFor(m.n)))];
    settings.length = lengthFor(mins.at(-1).n); // a later mention usually corrects an earlier one
    sources.length = 'brief';
    if (lengths.length > 1) {
      conflicts.push({ key: 'length', question: `Your brief mentions ${lengths.map((l) => LENGTH_LABEL[l]).join(' and ')}. How long should the session be?`, options: lengths.map((l) => ({ label: LENGTH_LABEL[l], settings: { length: l } })) });
      sources.length = 'inferred';
    }
  } else sources.length = 'suggested';
  const hard = /\b(challenging version|challenging|difficult|hard mode|experienced|senior)\b/.test(lower);
  const easy = /\b(gentle|easy|beginners?|introductory|guided)\b/.test(lower);
  if (hard && easy) {
    conflicts.push({ key: 'difficulty', question: 'Your brief asks for both an easier and a harder version. Which should it be?', options: [{ label: 'Guided', settings: { difficulty: 'guided' } }, { label: 'Challenging', settings: { difficulty: 'challenging' } }] });
    settings.difficulty = 'standard'; sources.difficulty = 'inferred';
  } else if (hard) { settings.difficulty = 'challenging'; sources.difficulty = 'brief'; } else if (easy) { settings.difficulty = 'guided'; sources.difficulty = 'brief'; } else sources.difficulty = 'suggested';
  const outcomeWords = { upskill: /coach|develop|train|upskill|mentor/, motivate: /motivat|morale|energi|engag|recognis|recogniz/, adapt: /adapt|situational|style|flex|switch/, results: /result|target|revenue|quota|number|goal/, enable: /environment|enabl|high perform/ };
  for (const [id, re] of Object.entries(outcomeWords)) if (re.test(lower) && !settings.outcomes.includes(id)) settings.outcomes.push(id);
  sources.outcomes = settings.outcomes.length ? 'brief' : 'suggested';
  if (!settings.outcomes.length) settings.outcomes = ['adapt'];
  settings.noFiring = chips.has('noFiring') || NO_FIRING.test(text);
  if (settings.noFiring) sources.noFiring = 'brief';
  settings.formal = chips.has('formal') || (/\bformal\b/i.test(text) && !FORMAL_NEG.test(text));
  if (FORMAL_NEG.test(text) || settings.formal) sources.formal = 'brief';
  settings.localNames = chips.has('localNames') || /\b(local|indian|arabic|african|japanese|chinese|german|spanish|kenyan|nigerian|british|french|brazilian|mexican) names\b/.test(lower) || (loc ? loc.country !== 'US' : false);

  // Concrete instructions: apply what the template can take, report the rest.
  const specifics = findSpecifics(text);
  for (const sp of specifics.filter((x) => x.used)) {
    if (sp.id === 'weeks') { settings.weeks = sp.value; sources.weeks = 'brief'; }
    if (sp.id === 'target') { settings.target = sp.value; sources.target = 'brief'; }
    if (sp.id === 'dealValue') { settings.dealValue = sp.value.value; if (sp.value.currency) settings.currency = sp.value.currency; sources.dealValue = 'brief'; }
    if (sp.id === 'currency') { settings.currency = sp.value; sources.currency = 'brief'; }
  }

  // What cannot be inferred reliably: ask.
  const missing = [];
  if (!industry) missing.push('industry');
  if (!org) missing.push('orgName');
  if (!loc || loc.ambiguous) missing.push('country');
  if (!profile.offeringName) missing.push('offeringName');
  return { profile, settings, sources, missing, conflicts, specifics, suggestions, notes, by: 'rules' };
}

export function briefPrompt(brief) {
  const industries = Object.entries(INDUSTRIES).map(([id, p]) => `${id} (${p.label})`).join(', ');
  return [
    'An author wants a leadership simulation (iLead: the learner leads an under-performing sales team and must adapt their style to each person).',
    'Read their brief, which may be in any language, and fill in the fields below. Only fill a field if the brief states it or it can reasonably be inferred; otherwise use null and list the field in "unknown".',
    'country and city are where the learner\'s team works, not where its customers are. If the brief is unclear about that, use null and list "country" in "unknown".',
    'If the brief contradicts itself (for example two session lengths), put a short question for the author in "questions".',
    '',
    `Brief: ${brief.instructions || ''}`,
    brief.outcomeText ? `Intended outcome: ${brief.outcomeText}` : '',
    (brief.outcomes || []).length ? `Outcomes picked: ${brief.outcomes.join(', ')}` : '',
    brief.constraints || (brief.chips || []).length ? `Constraints and preferences: ${[brief.constraints, ...(brief.chips || [])].filter(Boolean).join('; ')}` : '',
    '',
    `Industry must be one of: ${industries}, or "other" with customIndustry set.`,
    'Reply with only a JSON object: {"orgName": string|null, "industry": string|null, "customIndustry": string|null, "offeringType": "product"|"service"|null, "offeringName": string|null, "offeringCategory": string|null, "customerType": "b2b"|"b2c"|null, "country": string|null (country name), "city": string|null, "learnerRole": string|null, "audience": string[], "sessionMinutes": number|null, "weeks": number|null, "target": number|null, "currency": string|null (ISO code), "dealValue": number|null, "stageNames": string[]|null, "teamSize": number|null, "teamNames": string[]|null, "events": {"name": string, "week": number|null}[], "difficulty": "guided"|"standard"|"challenging"|null, "outcomes": ("adapt"|"motivate"|"upskill"|"enable"|"results")[], "noFiring": boolean, "formalTone": boolean, "localNames": boolean, "questions": string[], "unknown": string[]}',
  ].filter(Boolean).join('\n');
}

// Genie's reading wins where it gave a value; the rules fill the rest.
export function mergeGenieBrief(rules, g, base) {
  if (!g || typeof g !== 'object') return rules;
  const out = { ...rules, profile: { ...rules.profile }, settings: { ...rules.settings }, sources: { ...rules.sources }, suggestions: { ...(rules.suggestions || {}) }, conflicts: [...(rules.conflicts || [])], specifics: [...(rules.specifics || [])], notes: (rules.notes || []).filter((n) => n.kind !== 'language'), by: 'genie' };
  const P = out.profile;
  const took = (k, v) => { if (v !== null && v !== undefined && v !== '') { P[k] = typeof v === 'string' ? tidy(v) : v; out.sources[k] = 'brief'; return true; } return false; };
  if (g.industry && (INDUSTRIES[g.industry] || g.industry === 'other')) {
    if (g.industry !== P.industry) Object.assign(P, suggestProfile({ ...P, industry: g.industry }, 'industry', { ...P, orgName: '', offeringName: '' }), { orgName: P.orgName });
    out.sources.industry = 'brief';
    if (g.industry === 'other') { took('customIndustry', g.customIndustry); if (!g.offeringName && out.sources.offeringName !== 'brief') P.offeringName = ''; }
  }
  if (g.offeringType === 'product' || g.offeringType === 'service') took('offeringType', g.offeringType);
  if (g.customerType === 'b2b' || g.customerType === 'b2c') { took('customerType', g.customerType); out.conflicts = out.conflicts.filter((c) => c.key !== 'customerType'); }
  took('orgName', g.orgName);
  took('offeringName', g.offeringName);
  took('offeringCategory', g.offeringCategory);
  took('learnerRole', g.learnerRole);
  const unknown = new Set((g.unknown || []).map(String));
  if (g.country) {
    const code = findCountry(g.country);
    if (code) { P.country = code; out.sources.country = 'brief'; }
    else { Object.assign(P, { country: 'custom', customCountry: String(g.country), customRegion: P.customRegion || 'anglo', customCurrency: P.customCurrency || 'USD' }); out.sources.country = 'brief'; }
    delete out.suggestions.country;
  } else if (unknown.has('country') && rules.sources.country !== 'brief') out.sources.country = 'default';
  if (g.city) { took('city', g.city); }
  else if (out.sources.country === 'brief' && P.country !== 'custom' && !COUNTRIES[P.country]?.cities.includes(P.city)) { P.city = COUNTRIES[P.country].cities[0]; out.sources.city = 'suggested'; }
  const S = out.settings;
  if (Array.isArray(g.audience) && g.audience.length) { S.audience = g.audience.map(String); out.sources.audience = 'brief'; }
  if (Number(g.sessionMinutes) > 0) { S.length = lengthFor(Number(g.sessionMinutes)); out.sources.length = 'brief'; out.conflicts = out.conflicts.filter((c) => c.key !== 'length'); }
  if (['guided', 'standard', 'challenging'].includes(g.difficulty)) { S.difficulty = g.difficulty; out.sources.difficulty = 'brief'; out.conflicts = out.conflicts.filter((c) => c.key !== 'difficulty'); }
  if (Array.isArray(g.outcomes) && g.outcomes.length) { S.outcomes = g.outcomes.filter((o) => ['adapt', 'motivate', 'upskill', 'enable', 'results'].includes(o)); out.sources.outcomes = 'brief'; }
  S.noFiring = rules.settings.noFiring || !!g.noFiring;
  S.formal = g.formalTone === false && rules.sources.formal === 'brief' ? rules.settings.formal : rules.settings.formal || !!g.formalTone;
  S.localNames = rules.settings.localNames || !!g.localNames;

  // Specifics from Genie replace the rules' reading of the same instruction.
  const spec = (id, label, textValue, used, reason, value) => { out.specifics = out.specifics.filter((x) => x.id !== id); out.specifics.push({ id, label, text: textValue, used, reason, value }); };
  const w = Number(g.weeks);
  if (w > 0) { if (w >= 3 && w <= 20) { S.weeks = w; out.sources.weeks = 'brief'; spec('weeks', 'Simulated weeks', `${w} weeks`, true, '', w); } else spec('weeks', 'Simulated weeks', `${w} weeks`, false, 'Simulations run between 3 and 20 simulated weeks.'); }
  const t = Number(g.target);
  if (t >= 5) { S.target = t; out.sources.target = 'brief'; spec('target', 'Target', `${t} conversions`, true, '', t); }
  if (Array.isArray(g.stageNames) && g.stageNames.length) {
    const names = g.stageNames.map((x) => tidy(String(x))).filter(Boolean);
    spec('stages', 'Stage names', names.join(', '), names.length === STAGE_COUNT, names.length === STAGE_COUNT ? '' : `iLead has ${STAGE_COUNT} stages and your brief lists ${names.length}. Rename the stages on the Story step.`, names.length === STAGE_COUNT ? names : undefined);
  }
  if (Number(g.teamSize) > 0) { const n = Number(g.teamSize); spec('teamSize', 'Team size', `${n} people`, n === TEAM_SIZE, n === TEAM_SIZE ? '' : `iLead teams start with ${TEAM_SIZE} people so that every leadership style is needed. The team keeps ${TEAM_SIZE}.`, n); }
  if (Array.isArray(g.teamNames) && g.teamNames.length) { const names = g.teamNames.map((x) => tidy(String(x))).filter(Boolean).slice(0, TEAM_SIZE); spec('names', 'Team member names', names.join(', '), true, '', names); }
  if (Array.isArray(g.events)) for (const e of g.events) { const name = tidy(String(e?.name || '')); if (name) spec(`event:${name.toLowerCase()}`, 'Event', `${name}${e.week ? `, week ${e.week}` : ''}`, true, '', { name: name.charAt(0).toUpperCase() + name.slice(1), week: Number(e.week) || null }); }
  if (Number(g.dealValue) > 0) { S.dealValue = Number(g.dealValue); out.sources.dealValue = 'brief'; if (g.currency && CURRENCIES.includes(String(g.currency).toUpperCase())) S.currency = String(g.currency).toUpperCase(); spec('dealValue', 'Value per conversion', `${S.currency ? `${S.currency} ` : ''}${S.dealValue.toLocaleString('en')}`, true, '', { value: S.dealValue, currency: S.currency }); }
  else if (g.currency && CURRENCIES.includes(String(g.currency).toUpperCase())) { S.currency = String(g.currency).toUpperCase(); out.sources.currency = 'brief'; }
  if (Array.isArray(g.questions)) for (const q of g.questions.slice(0, 2)) if (String(q).trim()) out.notes.push({ kind: 'question', text: String(q).trim() });

  if (!P.offeringName) out.suggestions.offeringName = suggestOfferingName(P);
  if (!P.orgName && industryPack(P).sampleOrg) out.suggestions.orgName = industryPack(P).sampleOrg;
  out.missing = [];
  if (out.sources.industry !== 'brief' || (P.industry === 'other' && !P.customIndustry?.trim())) out.missing.push('industry');
  if (!P.orgName || (unknown.has('orgName') && out.sources.orgName !== 'brief')) out.missing.push('orgName');
  if ((out.sources.country !== 'brief' && out.sources.country !== 'inferred') || out.suggestions.country) out.missing.push('country');
  if (!P.offeringName) out.missing.push('offeringName');
  return out;
}
