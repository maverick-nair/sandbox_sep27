// PII and SPII shield for author uploads (PRD 15.2 rule 7, FR-A1). Deterministic pattern detection
// running in the browser; nothing leaves the workspace before the author confirms anonymization.
// Participant response scoring is out of the authoring scope, but the same module is reused by the
// preview so authors see how placeholders look.
const PATTERNS = [
  { type: 'EMAIL', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, placeholder: '[Email]' },
  { type: 'PHONE', re: /(?<![\d-])\+?\d[\d\s().-]{8,18}\d\b/g, placeholder: '[Phone]', minDigits: 10, maxDigits: 15, notDate: true },
  { type: 'AADHAAR', re: /\b\d{4}\s\d{4}\s\d{4}\b/g, placeholder: '[ID]' },
  { type: 'PAN', re: /\b[A-Z]{5}\d{4}[A-Z]\b/g, placeholder: '[ID]' },
  { type: 'SSN', re: /\b\d{3}-\d{2}-\d{4}\b/g, placeholder: '[ID]' },
  { type: 'CARD', re: /\b(?:\d[ -]?){13,16}\b/g, placeholder: '[Card]' },
  { type: 'EMPLOYEE_ID', re: /\b(?:EMP|EID|ID)[-: ]?\d{4,8}\b/gi, placeholder: '[Employee ID]' },
  { type: 'ADDRESS', re: /\b\d{1,5}\s(?:[A-Z][a-z]+\s){1,3}(?:Street|St|Road|Rd|Avenue|Ave|Lane|Ln|Drive|Dr|Nagar|Marg)\b\.?/g, placeholder: '[Address]' },
  { type: 'DOB', re: /\b(?:DOB|Date of Birth|born)[:\s]+\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b/gi, placeholder: '[Date of birth]' },
  { type: 'URL_PERSONAL', re: /https?:\/\/(?:www\.)?linkedin\.com\/in\/[A-Za-z0-9_-]+/g, placeholder: '[Profile link]' },
];
// SPII: always redacted entirely, never a detailed placeholder.
const SPII = [
  { type: 'HEALTH', re: /\b(?:diagnosed with|suffers from|on medication for|medical leave for|mental health condition|depression|anxiety disorder|cancer|diabetes|hiv positive)\b[^.]{0,60}/gi },
  { type: 'RELIGION', re: /\b(?:is|are|being)\s(?:a\s)?(?:muslim|hindu|christian|jewish|sikh|buddhist|catholic|atheist)\b/gi },
  { type: 'ORIENTATION', re: /\b(?:is|are|being)\s(?:gay|lesbian|transgender|bisexual)\b/gi },
  { type: 'UNION', re: /\b(?:union member|member of the union|trade union representative)\b/gi },
  { type: 'CRIMINAL', re: /\b(?:criminal record|convicted of|arrested for)\b[^.]{0,40}/gi },
  { type: 'FINANCIAL', re: /\b(?:salary of|earns|ctc of|bank account(?: number)?)\s?[:\s]*[₹$€£]?\s?[\d,]{4,}\b/gi },
];
const HONORIFIC_NAME = /\b(?:Mr|Mrs|Ms|Dr|Prof|Shri|Smt)\.?\s+[A-Z][a-z]+(?:\s[A-Z][a-z]+)?/g;
const FULL_NAME = /\b[A-Z][a-z]{2,}(?:\s[A-Z][a-z]{2,}){1,3}\b/g;
const NAME_EDGE = new Set(['Customer', 'Employee', 'Client', 'Manager', 'Contact', 'Later', 'Then', 'Dear', 'Regards', 'Thanks', 'Hello', 'Hi', 'The', 'Our', 'Your', 'When', 'After', 'Before', 'Meanwhile', 'Today', 'Yesterday', 'Colleague', 'Agent', 'Caller', 'Patient', 'From', 'With', 'Named', 'Analyst', 'Director', 'Supervisor', 'Team', 'Lead', 'Officer', 'Nurse', 'Driver', 'Rep', 'Signed', 'Sincerely', 'Cc', 'To', 'Re', 'Subject', 'Note', 'Update', 'Summary']);
const NAME_STOP = new Set(['New Delhi', 'United States', 'Customer Service', 'Account Manager', 'Regional Sales', 'Sales Manager', 'Product Manager', 'Human Resources', 'Head Office', 'Standard Operating', 'Operating Procedure', 'Next Steps', 'Case Notes', 'Incident Log', 'Key Facts', 'Team Lead', 'Project Manager', 'Business Unit', 'North Region', 'South Region', 'East Region', 'West Region', 'Quarter One', 'Quarter Two', 'Monday Morning', 'Friday Afternoon', 'Annual Review', 'Service Level', 'Level Agreement']);

function digits(s) { return (s.match(/\d/g) || []).length; }

// Returns findings with spans. allowNames: scenario character names (exempt, PRD 15.2 rule 3).
export function detectPII(text = '', { allowNames = [] } = {}) {
  const findings = [];
  const allow = new Set(allowNames.map((n) => n.toLowerCase()));
  const taken = [];
  const overlaps = (s, e) => taken.some(([a, b]) => s < b && e > a);
  const push = (f) => { if (!overlaps(f.start, f.end)) { taken.push([f.start, f.end]); findings.push(f); } };
  for (const p of SPII) for (const m of text.matchAll(p.re)) push({ kind: 'SPII', type: p.type, start: m.index, end: m.index + m[0].length, value: m[0], placeholder: '[Redacted]' });
  for (const p of PATTERNS) for (const m of text.matchAll(p.re)) {
    if (p.minDigits && digits(m[0]) < p.minDigits) continue;
    if (p.maxDigits && digits(m[0]) > p.maxDigits) continue;
    if (p.notDate && /\d{4}-\d{2}-\d{2}|\d{2}[./]\d{2}[./]\d{4}/.test(m[0])) continue;
    if (p.type === 'CARD' && digits(m[0]) < 13) continue;
    push({ kind: 'PII', type: p.type, start: m.index, end: m.index + m[0].length, value: m[0], placeholder: p.placeholder });
  }
  for (const m of text.matchAll(HONORIFIC_NAME)) { if (!allow.has(m[0].replace(/^(Mr|Mrs|Ms|Dr|Prof|Shri|Smt)\.?\s+/, '').toLowerCase())) push({ kind: 'PII', type: 'NAME', start: m.index, end: m.index + m[0].length, value: m[0], placeholder: '[Person]' }); }
  for (const m of text.matchAll(FULL_NAME)) {
    // Trim role words and sentence openers from the edges of the capitalized run, keeping the name core.
    let words = m[0].split(' '); let start = m.index; let cueWord = null;
    while (words.length > 2 && NAME_EDGE.has(words[0])) { cueWord = words[0]; start += words[0].length + 1; words = words.slice(1); }
    while (words.length > 2 && NAME_EDGE.has(words[words.length - 1])) words = words.slice(0, -1);
    if (words.length < 2 || words.length > 3) continue;
    const value = words.join(' ');
    if (NAME_STOP.has(value) || NAME_EDGE.has(words[0]) || allow.has(value.toLowerCase()) || allow.has(words[0].toLowerCase())) continue;
    // Only flag when a cue suggests a real person, to keep false positives low on titles and headings.
    const before = text.slice(Math.max(0, start - 40), start);
    const after = text.slice(start + value.length, start + value.length + 14);
    if (cueWord || /(?:employee|customer|client|manager|contact|from|by|with|to|named|colleague|agent|rep|caller|patient|ms|mr|dear|regards|thanks|signed|later|then)[\s,:-]*$/i.test(before) || /^\s*(?:\(|<|wrote|said|called|emailed|reported|complained|asked|told)/.test(after)) push({ kind: 'PII', type: 'NAME', start, end: start + value.length, value, placeholder: '[Person]' });
  }
  findings.sort((a, b) => a.start - b.start);
  return findings;
}

// Anonymize with typed placeholders that preserve role. The same value gets the same numbered placeholder.
export function anonymize(text = '', findings = detectPII(text)) {
  const map = new Map();
  const counts = {};
  let out = '';
  let cursor = 0;
  const redactions = [];
  for (const f of findings) {
    out += text.slice(cursor, f.start);
    let ph;
    if (f.kind === 'SPII') ph = '[Redacted]';
    else {
      const key = `${f.type}:${f.value.toLowerCase()}`;
      if (!map.has(key)) { counts[f.type] = (counts[f.type] || 0) + 1; map.set(key, f.placeholder.replace(']', counts[f.type] > 1 ? ` ${counts[f.type]}]` : ']')); }
      ph = map.get(key);
    }
    redactions.push({ type: f.type, kind: f.kind, placeholder: ph, original: f.value });
    out += ph;
    cursor = f.end;
  }
  out += text.slice(cursor);
  return { text: out, redactions, summary: summarize(findings) };
}

export function summarize(findings) {
  const s = {};
  for (const f of findings) s[f.type] = (s[f.type] || 0) + 1;
  return s;
}

export const PII_LABELS = { EMAIL: 'email addresses', PHONE: 'phone numbers', AADHAAR: 'ID numbers', PAN: 'ID numbers', SSN: 'ID numbers', CARD: 'card numbers', EMPLOYEE_ID: 'employee IDs', ADDRESS: 'addresses', DOB: 'dates of birth', URL_PERSONAL: 'profile links', NAME: 'personal names', HEALTH: 'health details', RELIGION: 'religion', ORIENTATION: 'orientation or identity', UNION: 'union membership', CRIMINAL: 'criminal history', FINANCIAL: 'salary or bank details' };
