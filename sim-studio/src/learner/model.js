// Learner experience model: everything the player screens derive from the run, kept pure so it
// can be tested without a browser.
import { weekOf, dayOfWeek, teamIds, teamAverages, progress, desiredStyle, stageName, totalDays } from '../engine/engine.js';
import { dueDecisions, pointsOf, senderOf, situationText, say, overallScore, ACHIEVEMENTS, kpiLabel, conditionMet } from '../engine/decisions.js';
import { computeReport } from '../engine/report.js';
import { collectTexts, renderText } from '../engine/text.js';
import { setTextAt } from '../engine/authoring.js';
import { clone } from '../engine/clone.js';

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const dayName = (def, day) => DAY_NAMES[(dayOfWeek(def, day) - 1) % 7];
export const refKey = (ref) => JSON.stringify(ref);

// Content in the learner's language: translations are applied to a copy of the definition.
export function translateDef(def, lang) {
  const t = def.translations?.[lang];
  if (!lang || !t || lang === (def.delivery?.defaultLanguage || 'en')) return def;
  const d = clone(def);
  for (const item of collectTexts(def)) {
    const e = t[refKey(item.ref)];
    const v = typeof e === 'string' ? e : e?.text;
    if (v && String(v).trim()) { try { setTextAt(d, item.ref, v); } catch { /* text no longer exists */ } }
  }
  return d;
}

// Deterministic shuffle per run and moment, so options never sit in authored order and
// reloading the page keeps the same order.
export function shuffled(list, seed, key) {
  let h = seed >>> 0;
  for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    h = (h * 1103515245 + 12345) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
// A ranking never starts in the right order.
export function rankStart(dp, seed) {
  const order = shuffled(dp.options, seed, `${dp.id}:rank`).map((o) => o.id);
  const correct = [...dp.options].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)).map((o) => o.id);
  if (order.join() === correct.join() && order.length > 1) [order[0], order[1]] = [order[1], order[0]];
  return order;
}

const PALETTE = ['#2a78d6', '#eb6834', '#1baf7a', '#b98a00', '#d55181', '#008300', '#4a3aa7', '#e34948'];
export function avatarColor(name) {
  let h = 0;
  for (const ch of String(name)) h = (h * 17 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
export const initials = (name) => String(name || '?').split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

// What a leader could plausibly read from the outside: performance is visible, morale shows
// through behaviour. Author x-ray shows the true numbers.
export function moodOf(m) {
  if (m >= 75) return { label: 'Energised', tone: 'good' };
  if (m >= 55) return { label: 'Steady', tone: '' };
  if (m >= 35) return { label: 'Flat', tone: 'warn' };
  return { label: 'Frustrated', tone: 'bad' };
}
export function trendOf(def, state, id) {
  const a = state.actors[id];
  const w = weekOf(def, state.day);
  const prev = a.weekStart[Math.max(0, w - 2)]?.p ?? a.p;
  const d = a.p - prev;
  return d > 3 ? 'up' : d < -3 ? 'down' : 'flat';
}

// The inbox: moments waiting for the learner first, then everything else, newest first.
export function inboxOf(def, state) {
  const due = dueDecisions(def, state).map((p) => ({ key: `dp:${p.id}`, kind: 'moment', dp: p, pending: true, sender: senderOf(def, state, p), title: say(def, state, p, p.title), preview: situationText(def, state, p), channel: p.channel, day: state.day }));
  const answered = pointsOf(def).filter((p) => state.dx.answered[p.id]).map((p) => {
    const a = state.dx.answered[p.id];
    return { key: `dp:${p.id}`, kind: 'moment', dp: p, pending: false, answer: a, sender: senderOf(def, state, p), title: say(def, state, p, p.title), preview: a.reaction || situationText(def, state, p), channel: p.channel, day: a.day, band: a.band };
  });
  const feed = state.log.feed.map((f, i) => ({ ...f, key: `feed:${i}` })).filter((f) => f.kind !== 'reply').map((f) => {
    const actor = f.actorId ? state.actors[f.actorId] : null;
    const sender = f.kind === 'event' ? { name: 'Business news', role: renderText(def, '{{company}}') } : f.kind === 'consequence' ? { name: 'Consequence', role: 'Something you set in motion' } : f.kind === 'story' ? { name: renderText(def, '{{ceo}}'), role: `CEO, ${renderText(def, '{{company}}')}` } : actor ? { name: actor.name, role: stageName(def, actor.stage), actorId: actor.id } : { name: f.title, role: '' };
    return { key: f.key, kind: f.kind, sender, title: f.title, preview: f.text, text: f.text, tone: f.tone, day: f.day, channel: f.kind === 'event' ? 'news' : 'chat' };
  });
  return [...due, ...[...answered, ...feed].sort((a, b) => b.day - a.day)];
}

export function signalsFor(def, state, id) {
  const lines = state.log.feed.filter((f) => f.actorId === id).slice(-2).map((f) => f.text);
  const a = state.actors[id];
  const assessed = a.assessed?.[a.stage];
  return { lines, assessed, mood: moodOf(a.m), trend: trendOf(def, state, id) };
}

export function weekSummary(def, state, week) {
  const dpw = def.timeline.daysPerWeek;
  const from = (week - 1) * dpw;
  const to = week * dpw;
  const daily = state.funnel.daily.filter((d) => d.day >= from && d.day < to);
  const conversions = daily.reduce((t, d) => t + d.conversions, 0);
  const kStart = state.dx.kpiHistory.find((k) => k.week === week) || state.dx.kpiHistory[0];
  const kEnd = state.dx.kpiHistory.find((k) => k.week === week + 1) || state.dx.kpis;
  const kpis = (def.decisions?.kpis || []).map((k) => ({ id: k.id, label: k.label, value: kEnd[k.id], delta: (kEnd[k.id] ?? 0) - (kStart[k.id] ?? 0) }));
  const moments = pointsOf(def).filter((p) => state.dx.answered[p.id]?.week === week || (state.dx.answered[p.id]?.expired && p.week === week)).map((p) => ({ dp: p, title: say(def, state, p, p.title), ...state.dx.answered[p.id] }));
  const landed = state.dx.landed.filter((l) => l.day >= from && l.day <= to);
  const movers = teamIds(state).map((id) => {
    const a = state.actors[id];
    const start = a.weekStart[week - 1]?.p ?? a.p;
    return { id, name: a.name, delta: Math.round(a.p - start), p: Math.round(a.p) };
  }).sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta)).slice(0, 3);
  const left = Object.values(state.actors).filter((a) => a.status === 'left');
  const quits = state.log.feed.filter((f) => f.kind === 'trigger' && f.day >= from && f.day < to && left.some((a) => a.id === f.actorId));
  return { week, conversions, total: progress(def, state), kpis, moments, landed, movers, quits, team: teamAverages(state) };
}

// ---------- the debrief ----------

const NEXT_STEPS = {
  'match-style': { product: 'AI Microlearn', text: 'A five-minute refresher on the four leadership styles and the signals that tell them apart.' },
  diagnose: { product: 'AI Microlearn', text: 'Short practice on reading skill and morale from what people say and do.' },
  feedback: { product: 'AI RolePlay', text: 'Rehearse a difficult feedback conversation with an AI colleague who reacts like a real person.' },
  stakeholder: { product: 'AI Koach', text: 'Plan your next update to your own manager with a coach who asks the hard questions.' },
  conflict: { product: 'AI RolePlay', text: 'Practise settling a dispute between two team members fairly.' },
  prioritise: { product: 'AI Koach', text: 'Work through your real team\'s bottleneck and agree the one change that matters most.' },
  recognise: { product: 'AI Microlearn', text: 'Quick lessons on recognising good work at the right moment.' },
  delegate: { product: 'AI Koach', text: 'Decide what to hand over to your most experienced people, and how.' },
};

export function buildDebrief(def, state, identity = {}) {
  const report = computeReport(def, state);
  const overall = overallScore(def, state, report.competencies);
  const pr = progress(def, state);
  const answered = pointsOf(def).map((p) => ({ p, a: state.dx.answered[p.id] })).filter((x) => x.a);
  const concepts = def.decisions?.concepts || {};

  const chosenText = (p, a) => {
    if (a.expired) return 'You did not respond in time.';
    if (p.type === 'open') return `"${String(a.answer?.text || '').slice(0, 180)}${String(a.answer?.text || '').length > 180 ? '…' : ''}"`;
    const ids = a.answer?.optionIds || a.answer?.order || (a.answer?.optionId ? [a.answer.optionId] : []);
    const opts = ids.map((id) => p.options?.find((o) => o.id === id)).filter(Boolean).map((o) => say(def, state, p, o.text));
    return p.type === 'rank' ? `Your order: ${opts.join(' → ')}` : opts.join('; ');
  };
  const keyDecisions = answered
    .map(({ p, a }) => ({ id: p.id, week: a.week, title: say(def, state, p, p.title), type: p.type, band: a.band, score: a.score, chose: chosenText(p, a), reaction: a.reaction, feedback: a.feedback, effects: a.effects || [], weight: (p.level || 1) * 10 + (a.effects || []).reduce((t, e) => t + Math.abs(e.delta), 0) }))
    .sort((x, y) => x.week - y.week);

  const byConcept = {};
  for (const { p, a } of answered) if (p.concept) (byConcept[p.concept] ||= []).push(a.score);
  for (const r of state.dx.recall) if (r.concept) (byConcept[r.concept] ||= []).push(r.correct ? 100 : 0);
  const conceptScores = Object.entries(byConcept).map(([id, xs]) => ({ id, label: concepts[id]?.label || id, score: Math.round(xs.reduce((t, x) => t + x, 0) / xs.length), n: xs.length })).sort((x, y) => x.score - y.score);

  const open = answered.filter(({ a }) => a.type === 'open' && !a.expired);
  const critTotals = {};
  for (const { a } of open) for (const c of a.detail?.criteria || []) (critTotals[c.id] ||= { label: c.label, xs: [] }).xs.push(c.score);
  const criteria = Object.entries(critTotals).map(([id, c]) => ({ id, label: c.label, score: Math.round(c.xs.reduce((t, x) => t + x, 0) / c.xs.length) }));
  const best = [...open].sort((x, y) => y.a.score - x.a.score)[0];

  const comps = report.competencies;
  const strengths = [
    ...comps.filter((c) => c.score >= 7).map((c) => ({ label: c.name, text: `You scored ${c.score} out of 10.` })),
    ...conceptScores.filter((c) => c.score >= 75).map((c) => ({ label: c.label, text: `Strong in ${c.n} moment${c.n === 1 ? '' : 's'}.` })),
  ].slice(0, 4);
  const improve = [
    ...conceptScores.filter((c) => c.score < 60).map((c) => ({ id: c.id, label: c.label, text: `Averaged ${c.score} across ${c.n} moment${c.n === 1 ? '' : 's'}.` })),
    ...comps.filter((c) => c.score < 5).map((c) => ({ label: c.name, text: `You scored ${c.score} out of 10.` })),
  ].slice(0, 4);
  const reinforce = conceptScores.filter((c) => c.score < 70).slice(0, 3);
  const next = [
    ...reinforce.map((c) => ({ ...(NEXT_STEPS[c.id] || { product: 'AI Microlearn', text: `A refresher on ${c.label.toLowerCase()}.` }), concept: c.label })),
    { product: 'Simulations', text: overall.score >= 80 ? 'Replay on Challenging: wrong styles land more often and the target is higher.' : 'Replay with what you learned. Your first three moments are where the quarter was won or lost.' },
  ];

  // What happened: decisions and the consequences that followed, in order.
  const story = [
    ...keyDecisions.map((k) => ({ week: k.week, kind: 'decision', title: k.title, text: k.reaction, band: k.band })),
    ...state.dx.landed.map((l) => ({ week: weekOf(def, l.day), kind: 'consequence', title: l.title, text: l.text })),
    ...state.log.feed.filter((f) => f.kind === 'trigger').map((f) => ({ week: weekOf(def, f.day), kind: 'team', title: f.title, text: f.text })),
  ].sort((x, y) => x.week - y.week);

  const weeks = def.timeline.weeks;
  const cumulative = [];
  let sum = 0;
  for (let w = 1; w <= weeks; w++) {
    sum += state.funnel.daily.filter((d) => weekOf(def, d.day) === w).reduce((t, d) => t + d.conversions, 0);
    cumulative.push(Math.round(sum * 10) / 10);
  }
  const kpiStart = state.dx.kpiHistory[0] || {};
  const kpis = (def.decisions?.kpis || []).map((k) => ({ id: k.id, label: k.label, start: kpiStart[k.id] ?? k.start, end: state.dx.kpis[k.id] }));
  const team = { start: state.start, end: teamAverages(state) };
  const left = Object.values(state.actors).filter((a) => a.status === 'left').map((a) => a.name);

  const headline = pr.achieved >= 1
    ? `You hit ${Math.round(pr.achieved * 100)}% of target${team.end.m >= team.start.m ? ', and the team is stronger than you found it.' : ', but the team paid for it.'}`
    : pr.achieved >= 0.75 ? `You reached ${Math.round(pr.achieved * 100)}% of target. Close: a few moments decided the gap.`
      : `You reached ${Math.round(pr.achieved * 100)}% of target. The quarter got away from you, and the debrief shows where.`;

  return {
    identity, headline, overall, progress: pr, report, competencies: comps, styles: report.styles, keyDecisions, story, criteria, best: best ? { title: say(def, state, best.p, best.p.title), text: best.a.answer?.text, score: best.a.score } : null,
    conceptScores, strengths, improve, reinforce, next, cumulative, kpis, team, left,
    achievements: ACHIEVEMENTS.map((x) => ({ ...x, earned: state.dx.achievements.includes(x.id) })),
    xp: state.dx.xp, reflections: state.dx.reflections, recall: state.dx.recall,
    transfer: def.learning?.transfer || [],
  };
}

// The record kept for results, cohorts, leaderboards and LMS reporting.
export function resultRecord(def, state, debrief, meta = {}) {
  return {
    id: `res-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    at: Date.now(),
    ...meta,
    score: debrief.overall.score,
    tier: debrief.overall.tier.id,
    parts: debrief.overall.parts,
    achieved: debrief.progress.achieved,
    conversions: Math.round(debrief.progress.conversions * 10) / 10,
    xp: debrief.xp,
    achievements: debrief.achievements.filter((a) => a.earned).map((a) => a.id),
    competencies: Object.fromEntries(debrief.competencies.map((c) => [c.id, c.score])),
    criteria: Object.fromEntries(debrief.criteria.map((c) => [c.id, c.score])),
    decisions: Object.fromEntries(Object.values(state.dx.answered).map((a) => [a.id, { band: a.band, score: a.score, choice: a.answer?.optionId || (a.answer?.optionIds || a.answer?.order || []).join(',') || (a.answer?.text ? 'text' : '') }])),
    concepts: Object.fromEntries(debrief.conceptScores.map((c) => [c.id, c.score])),
    kpis: { ...state.dx.kpis },
    completed: state.phase === 'ended',
  };
}

export { kpiLabel, conditionMet, totalDays, desiredStyle };
