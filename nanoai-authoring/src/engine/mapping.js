// Skill mapper (PRD 9.1 Step 2, 12.2). Keyword and alias retrieval over the frozen ontology with a
// confidence shown as High, Medium or Low. The LLM re-ranker in generator.js can refine the order.
import { SKILLS, getSkill } from '../content/ontology.js';
import { normalize } from './text.js';

function tokens(text) { return normalize(text).split(' ').filter((t) => t.length > 2); }

export function scoreSkill(skill, text) {
  const norm = ` ${normalize(text)} `;
  const toks = new Set(tokens(text));
  let score = 0;
  const hits = [];
  if (norm.includes(` ${normalize(skill.name)} `)) { score += 6; hits.push(skill.name); }
  for (const a of skill.aliases) if (norm.includes(` ${normalize(a)} `)) { score += 4; hits.push(a); }
  for (const k of skill.keywords) {
    const nk = normalize(k);
    if (nk.includes(' ') ? norm.includes(` ${nk} `) : toks.has(nk) || [...toks].some((t) => t.startsWith(nk) && nk.length > 4)) { score += 2; hits.push(k); }
  }
  return { score, hits: [...new Set(hits)] };
}

export function confidenceFor(score, best) {
  if (score >= 4 && score >= best * 0.5) return 'High';
  if (score >= 2) return 'Medium';
  return 'Low';
}

// Propose 3 to 5 Skills from intent text. Returns ranked candidates with confidence and evidence.
export function proposeSkills(intentText, { min = 3, max = 5 } = {}) {
  const scored = SKILLS.map((s) => ({ skill: s, ...scoreSkill(s, intentText) })).sort((a, b) => b.score - a.score);
  const best = scored[0]?.score || 0;
  const ranked = scored.map((x) => ({ id: x.skill.id, confidence: best > 0 ? confidenceFor(x.score, best) : 'Low', evidence: x.hits, score: x.score }));
  let proposed = ranked.filter((r) => r.score > 0).slice(0, max);
  if (proposed.length < min) {
    // Pad with common leadership defaults so the author always has a starting set to swap.
    const defaults = ['SK-PROBS', 'SK-STAKE', 'SK-PRIOR', 'SK-FEEDBK', 'SK-CUST'];
    for (const d of defaults) { if (proposed.length >= min) break; if (!proposed.some((p) => p.id === d)) proposed.push({ id: d, confidence: 'Low', evidence: [], score: 0, defaulted: true }); }
  }
  return { proposed, alternatives: ranked.filter((r) => !proposed.some((p) => p.id === r.id)).slice(0, 6), ranked };
}

// Map a client's own Skill name to the nearest ontology Skill and show the mapping.
export function mapClientSkill(clientName) {
  const scored = SKILLS.map((s) => ({ skill: s, ...scoreSkill(s, clientName) }));
  // Also try fuzzy token overlap with the name and aliases.
  for (const x of scored) {
    const toks = new Set(tokens(clientName));
    const own = new Set([...tokens(x.skill.name), ...x.skill.aliases.flatMap(tokens), ...tokens(x.skill.definition)]);
    let overlap = 0; for (const t of toks) if (own.has(t)) overlap += 1;
    x.score += overlap * 1.2;
  }
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0]?.score || 0;
  const nearest = scored.slice(0, 3).map((x) => ({ id: x.skill.id, name: x.skill.name, confidence: best > 0 ? confidenceFor(x.score, best) : 'Low', score: x.score }));
  return { clientLabel: clientName, primary: nearest[0], nearest, gap: best < 3 };
}

export function searchSkills(query) {
  if (!query.trim()) return SKILLS.map((s) => ({ id: s.id, name: s.name, domain: s.domain }));
  return SKILLS.map((s) => ({ s, ...scoreSkill(s, query) })).map((x) => { const toks = tokens(query); const own = normalize(`${x.s.name} ${x.s.aliases.join(' ')} ${x.s.definition} ${x.s.domain} ${x.s.macro}`); return { ...x, score: x.score + toks.filter((t) => own.includes(t)).length }; }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).map((x) => ({ id: x.s.id, name: x.s.name, domain: x.s.domain }));
}

export function skillDisplayName(entry) { return entry.clientLabel && entry.clientLabel !== getSkill(entry.id)?.name ? `${entry.clientLabel} (${getSkill(entry.id)?.name})` : getSkill(entry.id)?.name || entry.id; }
