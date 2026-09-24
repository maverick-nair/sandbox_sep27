// Evaluation of open (free-text) responses against evaluation criteria.
//
// Two evaluators share one result shape { score, criteria: [{ id, label, weight, score, note }],
// ideas: [{ label, met }], feedback, by, words }:
//   evaluateOpen()      built-in evaluator: deterministic, instant, works offline and in bots
//   openEvalPrompt() +  Genie reads the answer against the same criteria and key ideas;
//   parseGenieEval()    its judgement replaces the built-in scores when it answers well.
import { renderText } from './text.js';
import { desiredStyle } from './engine.js';

export const DEFAULT_CRITERIA = [
  { id: 'relevance', label: 'Relevance', description: 'Addresses this situation and the people in it, not a generic answer.', weight: 20 },
  { id: 'reasoning', label: 'Reasoning', description: 'Explains why, not only what: the thinking behind the choice is visible.', weight: 15 },
  { id: 'application', label: 'Application of concepts', description: 'Applies the right leadership approach for this person and moment.', weight: 25 },
  { id: 'completeness', label: 'Completeness', description: 'Covers the key points a strong answer would include.', weight: 15 },
  { id: 'judgment', label: 'Judgment', description: 'Balanced, respectful and aware of risks and trade-offs.', weight: 10 },
  { id: 'decision', label: 'Decision quality', description: 'Commits to a clear, specific next step.', weight: 15 },
];
export const CRITERIA_LIBRARY = Object.fromEntries(DEFAULT_CRITERIA.map((c) => [c.id, c]));

const STOP = new Set('the a an and or but if then of to in on for with at by from as is are was were be been being it its this that these those you your yours we our us they them their he him his she her i me my will would can could should shall may might must do does did have has had not no yes so very just also more most less than there here what which who whom when where why how all any each some such into over under about after before again'.split(' '));
const STYLE_WORDS = {
  directing: ['show you', 'step by step', 'step-by-step', 'walk you through', 'walk through', 'daily', 'each day', 'every day', 'each morning', 'sit with', 'sit down with', 'checklist', 'template', 'exactly', 'clear steps', 'together through', 'check in', 'check-in', 'demonstrate'],
  guiding: ['explain', 'why', 'suggest', 'idea', 'encourage', 'support', 'guidance', 'pointers', 'buy-in', 'what do you think', 'help you', 'coach'],
  partnering: ['what do you think', 'your view', 'your ideas', 'together', 'involve', 'how would you', 'agree', 'collaborat', 'decide together', 'listen', 'your input', 'work with you'],
  entrusting: ['trust you', 'your call', 'you decide', 'own', 'ownership', 'freedom', 'lead it', 'step back', 'independ', 'up to you', 'your way', 'run it'],
};
const OPPOSITE = { directing: 'entrusting', entrusting: 'directing', guiding: 'partnering', partnering: 'guiding' };
const REASONS = ['because', 'so that', 'which means', 'therefore', 'since', 'as a result', 'in order to', 'the reason', 'that way', 'this will', 'this means', 'so we', 'so you', 'so i', 'that is why', "that's why", 'to make sure', 'to help'];
const BALANCE = ['however', 'but', 'while', 'risk', 'consider', 'understand', 'listen', 'fair', 'both', 'trade-off', 'balance', 'concern', 'honest'];
const EMPATHY = ['how are you', 'how you feel', 'i understand', 'i hear', 'appreciate', 'thank you', 'thanks for', 'glad', 'i know it', 'support you'];
const HARSH = ['lazy', 'useless', 'stupid', 'incompetent', 'pathetic', 'idiot', 'last chance', "you're fired", 'you are fired', 'fire you', 'shut up', 'your fault', 'not my problem'];
const COMMIT = ['i will', "i'll", 'we will', "we'll", "let's", 'let us', 'next step', 'our plan', 'the plan', 'agree', 'by friday', 'by monday', 'this week', 'tomorrow', 'each morning', 'from today', 'starting'];
const SPECIFIC = /\b(\d+|monday|tuesday|wednesday|thursday|friday|tomorrow|today|next week|this week|end of (the )?(day|week|month)|minutes?|hours?|days?|weeks?)\b/gi;

const has = (text, term) => text.includes(term.toLowerCase());
const countAny = (text, list) => list.reduce((n, t) => n + (has(text, t) ? 1 : 0), 0);
const words = (text) => (text.toLowerCase().match(/[a-z\u00C0-\u024F']+/g) || []);
const clamp100 = (v) => Math.max(0, Math.min(100, Math.round(v)));

export function criteriaFor(dp) {
  const list = dp.open?.criteria?.length ? dp.open.criteria : DEFAULT_CRITERIA;
  return list.map((c) => ({ ...CRITERIA_LIBRARY[c.id], ...c, weight: Number(c.weight ?? CRITERIA_LIBRARY[c.id]?.weight ?? 10) }));
}

// vars: textVars for the moment (actor name, style, numbers); state: the run (for the person's current needs).
export function evaluateOpen(def, dp, rawText, { vars = {}, state } = {}) {
  const text = String(rawText || '').trim();
  const lower = ` ${text.toLowerCase().replace(/\s+/g, ' ')} `;
  const w = words(text);
  const minWords = dp.open?.minWords || 25;
  const render = (s) => renderText(def, s || '', vars).toLowerCase();
  const ideas = (dp.open?.keyIdeas || []).map((k) => ({ label: renderText(def, k.label, vars), met: (k.terms || []).some((t) => has(lower, render(t))) }));
  const coverage = ideas.length ? ideas.filter((i) => i.met).length / ideas.length : Math.min(1, w.length / (minWords * 2));

  const situation = `${render(dp.situation)} ${render(dp.prompt)}`;
  const keys = [...new Set(words(situation).filter((x) => x.length > 4 && !STOP.has(x)))];
  const overlap = keys.filter((k) => lower.includes(k.slice(0, Math.max(5, k.length - 2)))).length;
  const person = vars.actor ? has(lower, vars.actor.split(' ')[0]) : false;
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().split(/\s+/).length >= 3).length;

  let desired = null;
  const a = dp.about && state?.actors?.[dp.about];
  if (a) desired = desiredStyle(def, a.s, a.m);
  else if (dp.about) { const src = def.actors.find((x) => x.id === dp.about); if (src) desired = desiredStyle(def, src.stats[src.startStage].s, src.stats[src.startStage].m); }
  const styleFit = desired ? Math.max(0, Math.min(1, (countAny(lower, STYLE_WORDS[desired]) - 0.7 * countAny(lower, STYLE_WORDS[OPPOSITE[desired]])) / 2)) : null;

  const reasons = countAny(lower, REASONS);
  const harsh = countAny(lower, HARSH);
  const shouting = (text.match(/\b[A-Z]{4,}\b/g) || []).length >= 3;
  const commit = countAny(lower, COMMIT);
  const specific = (text.match(SPECIFIC) || []).length;
  const lengthFit = Math.min(1, w.length / minWords);

  const raw = {
    relevance: 35 * Math.min(1, overlap / 4) + 25 * (person || !vars.actor ? 1 : 0) + 40 * coverage,
    reasoning: 75 * Math.min(1, reasons / 2) + 25 * Math.min(1, sentences / 3),
    application: styleFit === null ? 100 * coverage : 55 * styleFit + 45 * coverage,
    completeness: 70 * coverage + 30 * lengthFit,
    judgment: Math.max(0, 55 + 7 * Math.min(4, countAny(lower, BALANCE)) + 8 * Math.min(2, countAny(lower, EMPATHY)) - 40 * harsh - (shouting ? 15 : 0)),
    decision: 65 * Math.min(1, commit / 2) + 35 * Math.min(1, specific / 2),
  };
  const criteria = criteriaFor(dp).map((c) => {
    let score = raw[c.id];
    if (score === undefined) score = c.terms?.length ? 100 * Math.min(1, countAny(lower, c.terms.map(render)) / Math.max(1, Math.ceil(c.terms.length / 2))) : 50 + 50 * coverage - 25;
    return { id: c.id, label: c.label, weight: c.weight, description: c.description, score: clamp100(score) };
  });
  const total = criteria.reduce((t, c) => t + c.weight, 0) || 1;
  let score = criteria.reduce((t, c) => t + c.score * c.weight, 0) / total;
  // Too short to judge, or empty: capped, and the learner is told why.
  if (w.length < Math.ceil(minWords * 0.5)) score = Math.min(score, 35);
  if (!w.length) score = 0;
  score = clamp100(score);
  for (const c of criteria) c.note = noteFor(c, { coverage, reasons, harsh, commit, specific, person, styleFit, desired, def });
  return { score, criteria, ideas, feedback: feedbackFor(criteria, ideas, w.length, minWords), by: 'rules', words: w.length };
}

function noteFor(c, x) {
  const strong = c.score >= 70;
  switch (c.id) {
    case 'relevance': return strong ? 'Speaks to this situation and person.' : x.person ? 'Stay closer to the specifics of the situation.' : 'Speak to the person by name and to what is actually happening.';
    case 'reasoning': return strong ? 'Your reasons are clear.' : 'Say why: link what you will do to the effect you expect.';
    case 'application': return strong ? 'The approach fits the person.' : x.desired ? `This person needs a more ${x.desired === 'directing' ? 'hands-on, step-by-step' : x.desired === 'guiding' ? 'explaining and encouraging' : x.desired === 'partnering' ? 'collaborative, involving' : 'trusting, hands-off'} approach.` : 'Apply the key ideas more directly.';
    case 'completeness': return strong ? 'Covers the key points.' : 'Some key points are missing.';
    case 'judgment': return x.harsh ? 'Some wording could damage trust.' : strong ? 'Balanced and respectful.' : 'Acknowledge the other person and the risks.';
    case 'decision': return strong ? 'A clear, specific next step.' : 'End with a concrete next step and when it happens.';
    default: return strong ? 'Meets this criterion well.' : 'Could be stronger on this.';
  }
}

function feedbackFor(criteria, ideas, n, minWords) {
  if (!n) return 'No response was given.';
  if (n < Math.ceil(minWords * 0.5)) return `That is a very short answer (${n} words). Say more about what you would do and why.`;
  const sorted = [...criteria].sort((a, b) => b.score - a.score);
  const best = sorted[0];
  const worst = sorted.at(-1);
  const missing = ideas.filter((i) => !i.met).slice(0, 2).map((i) => i.label.charAt(0).toLowerCase() + i.label.slice(1));
  const parts = [];
  if (best.score >= 65) parts.push(`Strongest on ${best.label.toLowerCase()}: ${best.note.charAt(0).toLowerCase()}${best.note.slice(1)}`);
  if (worst.score < 60) parts.push(`To improve ${worst.label.toLowerCase()}: ${worst.note.charAt(0).toLowerCase()}${worst.note.slice(1)}`);
  if (missing.length) parts.push(`A strong answer would also ${missing.join(' and ')}.`);
  return parts.join(' ');
}

// ---------- Genie ----------

export function openEvalPrompt(def, dp, text, vars) {
  const crit = criteriaFor(dp);
  const r = (s) => renderText(def, s || '', vars);
  return [
    'You are evaluating a learner\'s written response inside a leadership simulation. Be fair, specific and encouraging; judge the substance, not the grammar.',
    `Situation: ${r(dp.situation)}`,
    `Question: ${r(dp.prompt)}`,
    vars.style ? `The person involved currently needs a ${vars.style} leadership style (iLead model: Directing = low skill and low morale, Guiding = low skill and high morale, Partnering = high skill and low morale, Entrusting = high skill and high morale).` : '',
    `Key ideas a strong answer includes: ${(dp.open?.keyIdeas || []).map((k) => r(k.label)).join('; ') || 'use your judgement'}`,
    dp.open?.modelAnswer ? `Example of a strong answer: ${r(dp.open.modelAnswer)}` : '',
    `Criteria (score each 0 to 100): ${crit.map((c) => `${c.id} = ${c.label}: ${c.description}`).join(' | ')}`,
    '',
    `Learner's response: """${String(text).slice(0, 3000)}"""`,
    '',
    'Reply with only JSON: {"criteria": [{"id": string, "score": number, "note": string (one short sentence, second person)}], "ideas": [{"label": string, "met": boolean}], "feedback": string (two sentences at most, second person, name one strength and one improvement, no em dashes)}',
  ].filter(Boolean).join('\n');
}

export function parseGenieEval(def, dp, reply, fallback) {
  if (!reply || !Array.isArray(reply.criteria)) return fallback;
  const byId = new Map(reply.criteria.map((c) => [String(c.id), c]));
  const crit = criteriaFor(dp).map((c) => {
    const g = byId.get(c.id);
    const s = Number(g?.score);
    return { id: c.id, label: c.label, weight: c.weight, description: c.description, score: Number.isFinite(s) ? clamp100(s) : fallback.criteria.find((x) => x.id === c.id)?.score ?? 50, note: g?.note ? String(g.note) : fallback.criteria.find((x) => x.id === c.id)?.note };
  });
  const total = crit.reduce((t, c) => t + c.weight, 0) || 1;
  let score = clamp100(crit.reduce((t, c) => t + c.score * c.weight, 0) / total);
  if (fallback.words < Math.ceil((dp.open?.minWords || 25) * 0.5)) score = Math.min(score, 35);
  const ideas = Array.isArray(reply.ideas) && reply.ideas.length ? reply.ideas.map((i) => ({ label: String(i.label), met: !!i.met })) : fallback.ideas;
  return { score, criteria: crit, ideas, feedback: String(reply.feedback || fallback.feedback), by: 'genie', words: fallback.words };
}

// ---------- authoring help ----------

// Criteria suggested from what the moment is about.
export function suggestCriteria(dp) {
  const focus = {
    feedback: { application: 25, judgment: 20, decision: 20 },
    stakeholder: { completeness: 25, reasoning: 20, decision: 25, application: 10 },
    'match-style': { application: 30, relevance: 20 },
    conflict: { judgment: 25, reasoning: 20 },
  }[dp.concept] || {};
  return DEFAULT_CRITERIA.map((c) => ({ id: c.id, label: c.label, description: c.description, weight: focus[c.id] ?? c.weight }));
}

// Key ideas drafted from a model answer: one per sentence, with its distinctive words as terms.
export function draftKeyIdeas(modelAnswer) {
  return String(modelAnswer || '').split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.split(/\s+/).length >= 4).slice(0, 5).map((s) => {
    const terms = [...new Set(words(s).filter((x) => x.length > 4 && !STOP.has(x)))].slice(0, 4);
    return { label: s.replace(/[.!?]+$/, ''), terms };
  });
}
