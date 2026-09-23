// Bias and sensitivity screen (PRD 9.1 Step 6, 15.3 rule 8). Deterministic term lists.
const PROTECTED = [
  { re: /\b(his|her) (wife|husband)\b/i, term: 'marital', message: 'references a marital status', fix: 'Remove the reference unless the Skill requires it.' },
  { re: /\b(pregnan(t|cy)|maternity leave|paternity leave)\b/i, term: 'pregnancy', message: 'references pregnancy or parental leave', fix: 'Remove the reference unless the Skill requires it.' },
  { re: /\b(muslim|hindu|christian|jewish|sikh|buddhist|catholic|religio(n|us))\b/i, term: 'religion', message: 'references religion', fix: 'Remove the reference unless the Skill requires it.' },
  { re: /\b(disab(led|ility)|wheelchair|blind|deaf|autis(m|tic))\b/i, term: 'disability', message: 'references a disability', fix: 'Remove the reference unless the Skill requires it.' },
  { re: /\b(too old|too young|elderly|old timer|millennial|boomer|gen z)\b/i, term: 'age', message: 'references age in a stereotyped way', fix: 'Describe the behavior, not the generation.' },
  { re: /\b(gay|lesbian|transgender|homosexual)\b/i, term: 'orientation', message: 'references sexual orientation or gender identity', fix: 'Remove the reference unless the Skill requires it.' },
  { re: /\b(ethnic|racial|caste|dalit|brahmin|black people|white people|asian people)\b/i, term: 'ethnicity', message: 'references ethnicity, race or caste', fix: 'Remove the reference unless the Skill requires it.' },
  { re: /\b(immigrant|foreigner|expat|native speaker|accent)\b/i, term: 'nationality', message: 'references nationality or accent', fix: 'Remove the reference unless the Skill requires it.' },
  { re: /\b(diagnosed with|diagnosis of|depression|anxiety disorder|cancer|hiv|on medication)\b/i, term: 'health', message: 'references a health condition', fix: 'Remove the reference unless the Skill requires it.' },
];
const STEREOTYPES = [
  { re: /\b(the girls in|the ladies in|the boys in) (the office|finance|hr|reception|admin)\b/i, term: 'gendered-role', message: 'uses a gendered label for a team', fix: 'Name the team by function.' },
  { re: /\b(emotional|hysterical|bossy|aggressive) (woman|female|lady)\b/i, term: 'gendered-trait', message: 'attaches a stereotyped trait to gender', fix: 'Describe the behavior without gender.' },
  { re: /\b(lazy|slow|cheap|stingy|hot headed) (indian|chinese|american|african|arab|mexican|european)\b/i, term: 'ethnic-trait', message: 'attaches a trait to a nationality or ethnicity', fix: 'Remove the reference.' },
  { re: /\b(hitting a home run|touch base|ballpark|slam dunk|hail mary|monday morning quarterback)\b/i, term: 'idiom', message: 'uses a culturally specific idiom without localization', fix: 'Say it plainly.' },
];

export function biasScreen(text = '', allowedTerms = []) {
  const findings = [];
  const allow = new Set(allowedTerms.map((t) => t.toLowerCase()));
  for (const p of [...PROTECTED, ...STEREOTYPES]) {
    const m = text.match(p.re);
    if (m && !allow.has(p.term) && !allow.has(m[0].toLowerCase())) findings.push({ term: p.term, matched: m[0], message: `${p.message} ("${m[0]}").`, fix: p.fix });
  }
  return findings;
}

// Balanced name lists used by the sample library so scenarios draw on varied, neutral names.
export const NAMES = ['Priya', 'Daniel', 'Aisha', 'Rohan', 'Mei', 'Tomas', 'Fatima', 'Arjun', 'Grace', 'Kwame', 'Elena', 'Sanjay', 'Noor', 'Lucas', 'Ananya', 'Omar', 'Hana', 'Vikram', 'Sofia', 'Ibrahim'];
export function pickNames(seed, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(NAMES[(seed * 7 + i * 3) % NAMES.length]);
  return out;
}
