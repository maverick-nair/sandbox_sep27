// Text utilities shared by planning, quality gate and generation. No UI, no IO.
let counter = 0;
export function uid(prefix = 'id') {
  counter += 1;
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export function words(text = '') { return (text.match(/[A-Za-z0-9'’]+/g) || []); }
export function wordCount(text = '') { return words(text).length; }
export function sentenceCount(text = '') { const n = (text.match(/[.!?]+(\s|$)/g) || []).length; return Math.max(1, n); }

function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const stripped = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = stripped.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

// Flesch Kincaid grade level. Used for the reading level soft warning (grade 10 max).
export function readingGrade(text = '') {
  const ws = words(text);
  if (ws.length < 10) return 0;
  const syl = ws.reduce((a, w) => a + syllables(w), 0);
  const grade = 0.39 * (ws.length / sentenceCount(text)) + 11.8 * (syl / ws.length) - 15.59;
  return Math.round(grade * 10) / 10;
}

const STOP = new Set('the a an and or but of to in on at for with by from as is are was were be been it its this that these those you your they their he she we our i me my not no yes if then than so do does did have has had will would can could should may might about into over under after before while when where who what which how'.split(' '));
export function shingles(text = '', n = 3) {
  const toks = words(text).map((w) => w.toLowerCase()).filter((w) => !STOP.has(w));
  const out = new Set();
  for (let i = 0; i + n <= toks.length; i++) out.add(toks.slice(i, i + n).join(' '));
  return out;
}
export function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  let inter = 0;
  for (const s of a) if (b.has(s)) inter += 1;
  return inter / (a.size + b.size - inter);
}
// Near duplicate score between two scenarios' situation text, 0 to 1.
export function similarity(textA, textB) {
  const a = shingles(textA, 2), b = shingles(textB, 2);
  return jaccard(a, b);
}

export function normalize(text = '') { return text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }

// Levenshtein distance, used for the transcript correction edit distance cap in preview.
export function editDistance(a = '', b = '') {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
export function roundUpTo(v, step) { return Math.ceil(v / step) * step; }
export function truncate(text = '', n = 120) { return text.length > n ? `${text.slice(0, n - 1).trim()}…` : text; }
