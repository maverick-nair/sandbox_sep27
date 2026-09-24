// Decision moments: the authored situations a learner meets inside the simulation (an email from
// the CEO, a chat with a team member, a meeting, a dashboard update). Each has an interaction type,
// is evaluated to a score from 0 to 100, lands in a band (strong, mixed, weak) and has consequences
// that change the run: people's skill, morale and performance, business KPIs, flags that branch
// later moments, and consequences that arrive weeks later.
//
// Everything here is pure and runs in the browser, in bots and in tests. Open responses are scored
// by nlp.js (built-in evaluator) or by Genie through the learner experience.
import { desiredStyle, styleDiff, teamIds, weekOf, dayOfWeek, teamAverages, progress, clamp } from './engine.js';
import { renderText } from './text.js';
import { evaluateOpen } from './nlp.js';

export const INTERACTION_TYPES = {
  single: { label: 'Single choice', family: 'structured', note: 'The learner picks one answer.' },
  multi: { label: 'Multiple select', family: 'structured', note: 'The learner picks every option that applies, up to a limit.' },
  rank: { label: 'Ranking', family: 'structured', note: 'The learner puts options in order of priority.' },
  scenario: { label: 'Scenario decision', family: 'structured', note: 'The learner chooses a course of action. Each has its own trade-offs.' },
  open: { label: 'Open response', family: 'open', note: 'The learner answers in their own words; the answer is evaluated against criteria.' },
};

export const CHANNELS = {
  email: { label: 'Email', verb: 'Reply' },
  chat: { label: 'Chat', verb: 'Reply' },
  meeting: { label: 'Meeting', verb: 'Say' },
  call: { label: 'Call', verb: 'Say' },
  dashboard: { label: 'Business update', verb: 'Decide' },
};

export const BANDS = [
  { id: 'strong', label: 'Strong', min: 70 },
  { id: 'mixed', label: 'Mixed', min: 40 },
  { id: 'weak', label: 'Weak', min: 0 },
];
export const bandOf = (score) => (BANDS.find((b) => score >= b.min) || BANDS.at(-1)).id;

export const DEFAULT_KPIS = [
  { id: 'trust', label: 'Team trust', start: 50, note: 'How much the team trusts your leadership.' },
  { id: 'ceo', label: 'CEO confidence', start: 55, note: 'How confident the CEO is in your plan.' },
];

// ---------- mix ----------

// Alternative branches (only one of them can appear) share a slot and count once.
export function slotsOf(points) {
  const slots = new Map();
  for (const p of points || []) if (p.enabled !== false && !slots.has(p.slot || p.id)) slots.set(p.slot || p.id, p);
  return [...slots.values()];
}
export function mixOf(points) {
  const slots = slotsOf(points);
  const open = slots.filter((p) => p.type === 'open').length;
  const total = slots.length;
  return { total, open, structured: total - open, openShare: total ? open / total : 0 };
}

// ---------- conditions and text ----------

export function conditionMet(cond, dx) {
  if (!cond) return true;
  if (Array.isArray(cond)) return cond.every((c) => conditionMet(c, dx));
  if (cond.flag) return !!dx.flags[cond.flag];
  if (cond.notFlag) return !dx.flags[cond.notFlag];
  if (cond.decision) {
    const a = dx.answered[cond.decision];
    if (!a) return false;
    const bands = [].concat(cond.band || []);
    return !bands.length || bands.includes(a.band);
  }
  if (cond.kpiBelow) return (dx.kpis[cond.kpiBelow.id] ?? 50) < cond.kpiBelow.value;
  if (cond.kpiAbove) return (dx.kpis[cond.kpiAbove.id] ?? 50) > cond.kpiAbove.value;
  return true;
}

export function describeCondition(def, cond) {
  if (!cond) return 'Always';
  if (Array.isArray(cond)) return cond.map((c) => describeCondition(def, c)).join(' and ');
  const dp = (id) => def.decisions?.points?.find((p) => p.id === id)?.title || id;
  if (cond.flag) return `After "${flagLabel(def, cond.flag)}"`;
  if (cond.notFlag) return `Unless "${flagLabel(def, cond.notFlag)}"`;
  if (cond.decision) return `If "${dp(cond.decision)}" was ${[].concat(cond.band || []).join(' or ') || 'answered'}`;
  if (cond.kpiBelow) return `If ${kpiLabel(def, cond.kpiBelow.id)} is below ${cond.kpiBelow.value}`;
  if (cond.kpiAbove) return `If ${kpiLabel(def, cond.kpiAbove.id)} is above ${cond.kpiAbove.value}`;
  return 'Always';
}
export const kpiLabel = (def, id) => def.decisions?.kpis?.find((k) => k.id === id)?.label || id;
// A flag is set by an option or outcome; its label is the text of what set it.
export function flagLabel(def, flag) {
  for (const p of def.decisions?.points || []) {
    for (const o of p.options || []) if (o.consequences?.flags?.includes(flag)) return `${p.title}: ${o.text.slice(0, 60)}`;
    for (const [b, oc] of Object.entries(p.outcomes || {})) if (oc?.consequences?.flags?.includes(flag)) return `${p.title}: ${b}`;
  }
  return flag;
}

function actorVars(def, state, id, suffix = '') {
  const a = id && state?.actors?.[id];
  const src = id && def.actors.find((x) => x.id === id);
  const name = a?.name || src?.name;
  if (!name) return {};
  const pron = a?.pronoun || src?.pronoun || 'they';
  const P = { he: { he: 'he', his: 'his', him: 'him' }, she: { he: 'she', his: 'her', him: 'her' }, they: { he: 'they', his: 'their', him: 'them' } }[pron];
  return suffix ? { [`actor${suffix}`]: name, [`he${suffix}`]: P.he, [`his${suffix}`]: P.his, [`him${suffix}`]: P.him } : { actor: name, pronoun: pron };
}

export function textVars(def, state, dp) {
  const pr = state ? progress(def, state) : { conversions: 0, target: def.funnel.target };
  const desired = dp?.about && state?.actors?.[dp.about] ? desiredStyle(def, state.actors[dp.about].s, state.actors[dp.about].m) : null;
  return {
    ...actorVars(def, state, dp?.about),
    ...actorVars(def, state, dp?.about2, '2'),
    conversions: Math.round(pr.conversions),
    target: pr.target,
    style: desired ? def.leadership.styles.find((s) => s.id === desired)?.name : undefined,
  };
}
export const say = (def, state, dp, text) => renderText(def, text || '', textVars(def, state, dp));

export function situationText(def, state, dp) {
  const v = (dp.variants || []).find((x) => conditionMet(x.when, state?.dx || emptyDx(def)));
  return say(def, state, dp, v ? v.text : dp.situation);
}

export function senderOf(def, state, dp) {
  const f = dp.from || {};
  if (f.actor) return { name: state?.actors?.[f.actor]?.name || def.actors.find((a) => a.id === f.actor)?.name || 'A team member', role: 'Your team', actorId: f.actor };
  if (f.entity) return { name: renderText(def, `{{${f.entity}}}`), role: f.role || (f.entity === 'ceo' ? `CEO, ${renderText(def, '{{company}}')}` : ''), entity: f.entity };
  return { name: renderText(def, f.name || 'Sales dashboard'), role: renderText(def, f.role || '') };
}

// ---------- run state ----------

export function emptyDx(def) {
  return {
    answered: {},
    flags: {},
    kpis: Object.fromEntries((def.decisions?.kpis || DEFAULT_KPIS).map((k) => [k.id, k.start])),
    kpiHistory: [],
    delayed: [],
    landed: [],
    recall: [],
    reflections: [],
    xp: 0,
    achievements: [],
    rewindsUsed: 0,
    lastWeek: 1,
  };
}
export function initDecisions(def, state) {
  state.dx = emptyDx(def);
  state.dx.kpiHistory.push({ week: 1, ...state.dx.kpis });
  return state;
}

export function pointsOf(def) {
  return (def.decisions?.points || []).filter((p) => p.enabled !== false);
}

// Moments that have arrived and are waiting for the learner.
export function dueDecisions(def, state) {
  const dx = state.dx;
  if (!dx || state.phase === 'ended') return [];
  const week = weekOf(def, state.day);
  const dow = dayOfWeek(def, state.day);
  return pointsOf(def).filter((p) => !dx.answered[p.id] && (p.week < week ? p.deadline === 'none' : p.week === week && (p.day || 1) <= (state.phase === 'weekStart' ? 1 : dow)) && conditionMet(p.requires, dx));
}
// Moments still to come this run (for the timeline).
export function upcomingDecisions(def, state) {
  const dx = state.dx;
  const week = weekOf(def, state.day);
  return pointsOf(def).filter((p) => !dx.answered[p.id] && p.week >= week && conditionMet(p.requires, dx));
}

// ---------- evaluation ----------

const optionsFor = (dp, dx) => (dp.options || []).filter((o) => conditionMet(o.requires, dx));

export function styleQuality(def, state, dp, styleId) {
  const a = state?.actors?.[dp.about];
  if (!a) return 50;
  const diff = styleDiff(def, styleId, desiredStyle(def, a.s, a.m));
  return [100, 55, 15][Math.min(2, diff)];
}

// answer: single/scenario { optionId }, multi { optionIds }, rank { order: [ids] }, open { text }
// Returns { score, band, reaction, feedback, consequences, detail }.
export function evaluateDecision(def, state, dp, answer, { openResult } = {}) {
  const outcome = (band) => dp.outcomes?.[band] || {};
  if (dp.type === 'single' || dp.type === 'scenario') {
    const o = (dp.options || []).find((x) => x.id === answer.optionId);
    if (!o) return null;
    const score = o.style ? styleQuality(def, state, dp, o.style) : o.quality ?? 50;
    const band = bandOf(score);
    const oc = outcome(band);
    return { score, band, reaction: o.reaction || oc.reaction, feedback: o.feedback || oc.feedback, consequences: mergeCons(o.consequences, o.style || !o.consequences ? oc.consequences : null), detail: { chosen: [o.id] } };
  }
  if (dp.type === 'multi') {
    const picked = new Set(answer.optionIds || []);
    const correct = new Set((dp.options || []).filter((o) => o.correct).map((o) => o.id));
    const hit = [...picked].filter((id) => correct.has(id)).length;
    const precision = picked.size ? hit / picked.size : 0;
    const recall = correct.size ? hit / correct.size : 0;
    const score = Math.round(precision + recall ? (200 * precision * recall) / (precision + recall) : 0);
    const band = bandOf(score);
    const oc = outcome(band);
    const cons = (dp.options || []).filter((o) => picked.has(o.id)).reduce((c, o) => mergeCons(c, o.consequences), oc.consequences);
    return { score, band, reaction: oc.reaction, feedback: oc.feedback, consequences: cons, detail: { chosen: [...picked], missed: [...correct].filter((id) => !picked.has(id)), wrong: [...picked].filter((id) => !correct.has(id)) } };
  }
  if (dp.type === 'rank') {
    const order = answer.order || [];
    const n = (dp.options || []).length;
    const pos = Object.fromEntries(order.map((id, i) => [id, i]));
    const dist = (dp.options || []).reduce((t, o) => t + Math.abs((pos[o.id] ?? n) - (o.rank ?? 0)), 0);
    const maxDist = Math.floor((n * n) / 2) || 1;
    const score = Math.round(100 * (1 - dist / maxDist));
    const band = bandOf(score);
    const oc = outcome(band);
    return { score, band, reaction: oc.reaction, feedback: oc.feedback, consequences: oc.consequences, detail: { chosen: order } };
  }
  if (dp.type === 'open') {
    const res = openResult || evaluateOpen(def, dp, answer.text || '', { vars: textVars(def, state, dp), state });
    const band = bandOf(res.score);
    const oc = outcome(band);
    return { score: res.score, band, reaction: oc.reaction, feedback: [res.feedback, oc.feedback].filter(Boolean).join(' '), consequences: oc.consequences, detail: { criteria: res.criteria, ideas: res.ideas, by: res.by, words: res.words } };
  }
  return null;
}

// ---------- consequences ----------

export function mergeCons(a, b) {
  if (!a) return b ? JSON.parse(JSON.stringify(b)) : {};
  if (!b) return JSON.parse(JSON.stringify(a));
  const add = (x = {}, y = {}) => ({ s: (x.s || 0) + (y.s || 0), m: (x.m || 0) + (y.m || 0), p: (x.p || 0) + (y.p || 0) });
  const kpis = { ...(a.kpis || {}) };
  for (const [k, v] of Object.entries(b.kpis || {})) kpis[k] = (kpis[k] || 0) + v;
  return {
    team: a.team || b.team ? add(a.team, b.team) : undefined,
    actor: a.actor || b.actor ? add(a.actor, b.actor) : undefined,
    actor2: a.actor2 || b.actor2 ? add(a.actor2, b.actor2) : undefined,
    kpis,
    flags: [...new Set([...(a.flags || []), ...(b.flags || [])])],
    delayed: [...(a.delayed || []), ...(b.delayed || [])],
  };
}

function shift(state, id, impact) {
  const a = state.actors[id];
  if (!a || a.status !== 'team' || !impact) return null;
  const before = { s: a.s, m: a.m, p: a.p };
  a.s = clamp(a.s + (impact.s || 0));
  a.m = clamp(a.m + (impact.m || 0));
  a.p = clamp(a.p + (impact.p || 0));
  return { s: a.s - before.s, m: a.m - before.m, p: a.p - before.p };
}

// Applies consequences and returns the visible effects: [{ label, delta, kind }].
export function applyConsequences(def, state, dp, cons, { source } = {}) {
  const dx = state.dx;
  const effects = [];
  if (!cons) return effects;
  if (cons.team) {
    const before = teamAverages(state);
    for (const id of teamIds(state)) shift(state, id, cons.team);
    const after = teamAverages(state);
    if (Math.round(after.m - before.m)) effects.push({ label: 'Team morale', delta: Math.round(after.m - before.m), kind: 'team' });
    if (Math.round(after.p - before.p)) effects.push({ label: 'Team performance', delta: Math.round(after.p - before.p), kind: 'team' });
    if (Math.round(after.s - before.s)) effects.push({ label: 'Team skill', delta: Math.round(after.s - before.s), kind: 'team' });
  }
  for (const [key, id] of [['actor', dp?.about], ['actor2', dp?.about2]]) {
    const d = cons[key] && id ? shift(state, id, cons[key]) : null;
    if (!d) continue;
    const name = state.actors[id].name.split(' ')[0];
    if (Math.round(d.m)) effects.push({ label: `${name}'s morale`, delta: Math.round(d.m), kind: 'person', actorId: id });
    if (Math.round(d.p)) effects.push({ label: `${name}'s performance`, delta: Math.round(d.p), kind: 'person', actorId: id });
    if (Math.round(d.s)) effects.push({ label: `${name}'s skill`, delta: Math.round(d.s), kind: 'person', actorId: id });
  }
  for (const [k, v] of Object.entries(cons.kpis || {})) {
    if (!v) continue;
    const before = dx.kpis[k] ?? 50;
    dx.kpis[k] = clamp(before + v);
    effects.push({ label: kpiLabel(def, k), delta: dx.kpis[k] - before, kind: 'kpi', kpi: k });
  }
  for (const f of cons.flags || []) dx.flags[f] = true;
  const dpw = def.timeline.daysPerWeek;
  for (const d of cons.delayed || []) {
    dx.delayed.push({ ...d, dueDay: state.day + Math.max(1, d.weeks || 1) * dpw, dpId: dp?.id, source: source || dp?.title });
  }
  return effects;
}

function pushFeed(state, item) {
  state.log.feed.push({ day: state.day, ...item });
}

// Records an answer, applies its consequences and returns the result for the learner.
export function resolveDecision(def, state, dp, answer, opts = {}) {
  const res = evaluateDecision(def, state, dp, answer, opts);
  if (!res) return null;
  const effects = applyConsequences(def, state, dp, res.consequences);
  const prev = state.dx.answered[dp.id];
  const entry = {
    id: dp.id, week: weekOf(def, state.day), day: state.day, type: dp.type, answer, score: res.score, band: res.band,
    effects, detail: res.detail, attempts: (prev?.attempts || 0) + 1, rewound: !!opts.rewound, expired: !!opts.expired,
    reaction: say(def, state, dp, res.reaction), feedback: say(def, state, dp, res.feedback),
  };
  state.dx.answered[dp.id] = entry;
  const lvl = dp.level || 1;
  state.dx.xp += opts.expired ? 0 : Math.round((res.score / 10) * lvl);
  const sender = senderOf(def, state, dp);
  if (entry.reaction) pushFeed(state, { kind: 'reply', title: opts.expired ? `${dp.title}: no reply from you` : `${sender.name} replied`, text: entry.reaction, dpId: dp.id, tone: res.band === 'strong' ? 'good' : res.band === 'weak' ? 'bad' : 'mixed', actorId: sender.actorId });
  return entry;
}

// Moments not answered by their deadline resolve with the author's "no response" outcome.
export function expireOverdue(def, state) {
  const week = weekOf(def, state.day);
  const out = [];
  for (const p of pointsOf(def)) {
    if (state.dx.answered[p.id] || p.deadline === 'none' || p.week >= week || !conditionMet(p.requires, state.dx)) continue;
    const nr = p.noResponse || { reaction: 'No reply came back from you, and the moment passed.', consequences: { kpis: { trust: -2 } } };
    const entry = {
      id: p.id, week: p.week, day: state.day, type: p.type, answer: null, score: 0, band: 'weak', expired: true, attempts: 0,
      effects: applyConsequences(def, state, p, nr.consequences), detail: {}, reaction: say(def, state, p, nr.reaction), feedback: say(def, state, p, nr.feedback || 'Not responding is a decision too. The situation moved on without you.'),
    };
    state.dx.answered[p.id] = entry;
    pushFeed(state, { kind: 'reply', title: `${p.title}: no reply from you`, text: entry.reaction, dpId: p.id, tone: 'bad' });
    out.push(entry);
  }
  return out;
}

// Consequences that were set in motion earlier and arrive now.
export function processDelayed(def, state) {
  const dx = state.dx;
  const landed = [];
  for (const d of dx.delayed) {
    if (d.done || d.dueDay > state.day) continue;
    d.done = true;
    const dp = def.decisions?.points?.find((p) => p.id === d.dpId);
    const effects = applyConsequences(def, state, dp, { team: d.team, actor: d.actor, actor2: d.actor2, kpis: d.kpis, flags: d.flags });
    const entry = { day: state.day, title: say(def, state, dp, d.title), text: say(def, state, dp, d.text), effects, source: d.source, dpId: d.dpId };
    dx.landed.push(entry);
    landed.push(entry);
    pushFeed(state, { kind: 'consequence', title: entry.title, text: entry.text, dpId: d.dpId, tone: effects.some((e) => e.delta < 0) ? 'bad' : 'good' });
  }
  return landed;
}

// Call after any action that moves time: lands delayed consequences, expires overdue moments
// and snapshots the KPIs at each new week.
export function afterTime(def, state) {
  if (!state.dx) return { landed: [], expired: [] };
  const landed = processDelayed(def, state);
  const week = Math.min(weekOf(def, state.day), def.timeline.weeks);
  let expired = [];
  if (week !== state.dx.lastWeek || state.phase === 'ended') {
    expired = expireOverdue(def, state);
    state.dx.kpiHistory.push({ week, ...state.dx.kpis });
    state.dx.lastWeek = week;
  }
  return { landed, expired };
}

// ---------- retrieval practice ----------

// Spaced retrieval: after each week, one question on a concept met earlier, favouring concepts
// practised longest ago and answered wrongly before.
export function recallItem(def, state, seedOffset = 0) {
  const styles = def.leadership.styles;
  const week = weekOf(def, state.day);
  const level = (v) => (v === 'high' ? 'high' : 'low');
  const pool = [];
  for (const s of styles) {
    pool.push({
      id: `style:${s.id}`, concept: 'match-style',
      q: `A team member has ${level(s.skill)} skill and ${level(s.morale)} morale. Which style fits them best?`,
      options: styles.map((x) => ({ id: x.id, text: x.name })), answer: s.id,
      explain: `${s.name}: ${s.definition}`,
    });
  }
  // Questions about the learner's own team, from what they have seen.
  for (const intent of state.log.intents.filter((i) => i.week === week - 1).slice(0, 10)) {
    const a = state.actors[intent.actorId];
    if (!a) continue;
    const d = styles.find((x) => x.id === intent.desired);
    pool.push({
      id: `team:${a.id}:${intent.week}`, concept: 'diagnose',
      q: `Last week, which style did ${a.name} need?`,
      options: styles.map((x) => ({ id: x.id, text: x.name })), answer: intent.desired,
      explain: `${a.name} had ${a.s >= def.leadership.highThreshold ? 'high' : 'low'} skill and ${a.m >= def.leadership.highThreshold ? 'high' : 'low'} morale, so ${d?.name} fitted best.`,
    });
  }
  for (const p of pointsOf(def)) {
    const ans = state.dx.answered[p.id];
    if (!ans || ans.expired) continue;
    for (const [i, r] of (p.recall || []).entries()) pool.push({ id: `dp:${p.id}:${i}`, concept: p.concept, ...r, q: say(def, state, p, r.q), explain: say(def, state, p, r.explain) });
  }
  if (!pool.length) return null;
  const history = state.dx.recall;
  const lastSeen = (id) => { const h = history.filter((x) => x.id === id); return h.length ? h.at(-1).week : -99; };
  const wrongBefore = (id) => history.some((x) => x.id === id && !x.correct);
  const ranked = pool.map((it, i) => ({ it, w: (week - lastSeen(it.id)) + (wrongBefore(it.id) ? 5 : 0) + ((i * 7 + seedOffset + week) % 5) * 0.1 })).sort((a, b) => b.w - a.w);
  return ranked[0].it;
}
export function answerRecall(def, state, item, optionId) {
  const correct = optionId === item.answer;
  state.dx.recall.push({ id: item.id, concept: item.concept, week: weekOf(def, state.day), correct });
  if (correct) state.dx.xp += 5;
  return correct;
}

export function addReflection(def, state, prompt, text) {
  state.dx.reflections.push({ week: weekOf(def, state.day), prompt, text: String(text || '').trim() });
  if (String(text || '').trim().split(/\s+/).length >= 8) state.dx.xp += 5;
}

// ---------- achievements ----------

export const ACHIEVEMENTS = [
  { id: 'first-call', label: 'First call', note: 'Answered your first moment.' },
  { id: 'read-the-room', label: 'Read the room', note: 'Chose the right style for at least 8 people in one week.' },
  { id: 'straight-talker', label: 'Straight talker', note: 'A strong written response in a difficult conversation.' },
  { id: 'comeback', label: 'Comeback', note: 'Rethought a decision and got a strong result.' },
  { id: 'sharp-recall', label: 'Sharp recall', note: 'Three recall questions right in a row.' },
  { id: 'reflective', label: 'Reflective leader', note: 'Completed every reflection.' },
  { id: 'on-target', label: 'On target', note: 'Reached the conversion target.' },
  { id: 'nobody-left', label: 'Nobody left behind', note: 'Finished without anyone quitting.' },
  { id: 'trusted', label: 'Trusted', note: 'Finished with team trust of 70 or more.' },
];

export function checkAchievements(def, state) {
  const dx = state.dx;
  const has = new Set(dx.achievements);
  const earned = [];
  const give = (id) => { if (!has.has(id)) { has.add(id); dx.achievements.push(id); dx.xp += 15; earned.push(id); } };
  const answered = Object.values(dx.answered).filter((a) => !a.expired);
  if (answered.length) give('first-call');
  const byWeek = {};
  for (const i of state.log.intents) (byWeek[i.week] ||= []).push(i);
  if (Object.values(byWeek).some((list) => list.filter((i) => i.diff === 0).length >= 8)) give('read-the-room');
  if (answered.some((a) => a.type === 'open' && a.band === 'strong' && (pointsOf(def).find((p) => p.id === a.id)?.level || 1) >= 2)) give('straight-talker');
  if (answered.some((a) => a.rewound && a.band === 'strong')) give('comeback');
  const r = dx.recall.map((x) => x.correct);
  for (let i = 2; i < r.length; i++) if (r[i] && r[i - 1] && r[i - 2]) { give('sharp-recall'); break; }
  if (state.phase === 'ended') {
    const due = (def.learning?.reflections || []).length;
    if (due && dx.reflections.filter((x) => x.text).length >= due) give('reflective');
    if (progress(def, state).achieved >= 1) give('on-target');
    if (!Object.values(state.actors).some((a) => a.status === 'left')) give('nobody-left');
    if ((dx.kpis.trust ?? 0) >= 70) give('trusted');
  }
  return earned;
}

// ---------- final scoring ----------

export const DEFAULT_SCORING = { results: 30, leadership: 30, decisions: 30, recall: 10 };
export const TIERS = [
  { id: 'gold', label: 'Gold', min: 80 },
  { id: 'silver', label: 'Silver', min: 65 },
  { id: 'bronze', label: 'Bronze', min: 50 },
  { id: 'practice', label: 'Keep practising', min: 0 },
];

export function overallScore(def, state, competencies) {
  const w = { ...DEFAULT_SCORING, ...(def.scoring || {}) };
  const pr = progress(def, state);
  const answered = Object.values(state.dx?.answered || {});
  const parts = {
    results: Math.round(Math.min(1, pr.achieved / 1.1) * 100),
    leadership: Math.round(((competencies || []).reduce((t, c) => t + c.score, 0) / Math.max(1, (competencies || []).length)) * 10),
    decisions: answered.length ? Math.round(answered.reduce((t, a) => t + a.score, 0) / answered.length) : 0,
    recall: state.dx?.recall.length ? Math.round((state.dx.recall.filter((x) => x.correct).length / state.dx.recall.length) * 100) : 0,
  };
  const active = Object.entries(w).filter(([k, v]) => v > 0 && (k !== 'decisions' || answered.length) && (k !== 'recall' || state.dx?.recall.length));
  const total = active.reduce((t, [, v]) => t + v, 0) || 1;
  const score = Math.round(active.reduce((t, [k, v]) => t + parts[k] * v, 0) / total);
  return { score, parts, weights: w, tier: TIERS.find((t) => score >= t.min) };
}
