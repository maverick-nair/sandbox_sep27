// iLead runtime. Pure functions over a serializable run state, driven by a Simulation Definition.
// Rules follow the iLead Model Document, sections 5 to 7.
//
// Time: the run has `weeks` weeks of `daysPerWeek` days. At the start of each week the learner sets
// an intended leadership style for every team member (the "leadership action"). During the week,
// general actions cost days. Every elapsed day runs the sales funnel once.

import { createRng } from './rng.js';
import { renderText } from './text.js';

export const OUTCOME_LABELS = { 0: 'Positive', 1: 'Mixed', 2: 'Negative' };
export const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));
const round1 = (v) => Math.round(v * 10) / 10;

// ---------- leadership model ----------

export function styleById(def, id) {
  return def.leadership.styles.find((s) => s.id === id);
}

// The style a person needs right now, from their skill and morale (Model doc 5: Low/Low = Directing, ...).
export function desiredStyle(def, s, m) {
  const hi = def.leadership.highThreshold;
  const skill = s >= hi ? 'high' : 'low';
  const morale = m >= hi ? 'high' : 'low';
  return def.leadership.styles.find((x) => x.skill === skill && x.morale === morale)?.id;
}

// Style difference: 0 when both skill and morale reads are right, 1 when one is, 2 when neither is.
export function styleDiff(def, a, b) {
  const A = styleById(def, a);
  const B = styleById(def, b);
  if (!A || !B) return 2;
  return (A.skill !== B.skill ? 1 : 0) + (A.morale !== B.morale ? 1 : 0);
}

// Mismatch type: the style difference, softened by chance ("60% randomness").
export function mismatchDistribution(def, diff) {
  if (diff === 0) return [{ mm: 0, p: 1 }];
  const c = def.randomness.mismatchChance;
  return [{ mm: diff, p: c }, { mm: 0, p: 1 - c }];
}

function drawMismatch(dist, rng) {
  let r = rng.next();
  for (const d of dist) {
    if (r < d.p) return d.mm;
    r -= d.p;
  }
  return dist[dist.length - 1].mm;
}

// ---------- run state ----------

export function totalDays(def) {
  return def.timeline.weeks * def.timeline.daysPerWeek;
}
export function weekOf(def, day) {
  return Math.floor(day / def.timeline.daysPerWeek) + 1;
}
export function dayOfWeek(def, day) {
  return (day % def.timeline.daysPerWeek) + 1;
}
export function daysLeftInWeek(def, state) {
  return def.timeline.daysPerWeek - (state.day % def.timeline.daysPerWeek);
}

export function createRun(def, { seed = Date.now() % 2147483647 } = {}) {
  const actors = {};
  for (const a of def.actors) {
    const st = a.stats[a.startStage] || { s: 50, m: 50, p: 50 };
    actors[a.id] = {
      id: a.id,
      name: a.name,
      pronoun: a.pronoun,
      stage: a.startStage,
      s: st.s,
      m: st.m,
      p: st.p,
      status: a.pool === 'team' ? 'team' : 'pool',
      unavailableUntil: -1,
      unavailableReason: '',
      stageSince: 0,
      lastReassignDay: -999,
      lastTrainedDay: -999,
      lastPraiseDay: -999,
      assessed: null,
      history: [],
      weekStart: [],
    };
  }
  const state = {
    seed,
    rngState: seed,
    day: 0,
    phase: 'weekStart',
    actors,
    weeklyStyles: {},
    desiredAtWeekStart: {},
    cooldowns: {},
    triggerCounts: {},
    funnel: { conversions: 0, stageTotals: def.stages.map(() => 0), daily: [] },
    log: { intents: [], actions: [], feed: [] },
    start: null,
  };
  snapshotWeek(def, state);
  state.start = teamAverages(state);
  feed(state, { kind: 'story', title: 'Welcome', text: renderText(def, def.story.welcome), tone: 'info' });
  return state;
}

function withRng(state, fn) {
  const rng = createRng(1);
  rng.state = state.rngState;
  const out = fn(rng);
  state.rngState = rng.state;
  return out;
}

export function teamIds(state) {
  return Object.values(state.actors).filter((a) => a.status === 'team').map((a) => a.id);
}
export function isAvailable(state, id) {
  const a = state.actors[id];
  return a && a.status === 'team' && state.day >= a.unavailableUntil;
}
export function availableIds(state) {
  return teamIds(state).filter((id) => isAvailable(state, id));
}
export function membersInStage(state, stage, { availableOnly = false } = {}) {
  return (availableOnly ? availableIds(state) : teamIds(state)).filter((id) => state.actors[id].stage === stage);
}

export function teamAverages(state) {
  const ids = teamIds(state);
  const n = ids.length || 1;
  const sum = (k) => ids.reduce((t, id) => t + state.actors[id][k], 0);
  return { s: sum('s') / n, m: sum('m') / n, p: sum('p') / n };
}

function snapshotWeek(def, state) {
  for (const a of Object.values(state.actors)) a.weekStart.push({ s: a.s, m: a.m, p: a.p, stage: a.stage });
}

function feed(state, item) {
  state.log.feed.push({ day: state.day, ...item });
}

function pickMessage(option, mm, rng) {
  const order = { 0: ['0', '1', '2'], 1: ['1', '2', '0'], 2: ['2', '1', '0'] }[mm];
  for (const k of order) {
    const msgs = option.outcomes[k]?.messages || [];
    if (msgs.length) return msgs[Math.floor(rng.next() * msgs.length)];
  }
  return '';
}

function applyImpact(def, state, id, impact, rng, factor = 1) {
  const a = state.actors[id];
  const r = def.randomness;
  const k = () => rng.between(r.impactMin, r.impactMax) * factor;
  const delta = { s: round1(impact.s * k()), m: round1(impact.m * k()), p: round1(impact.p * k()) };
  a.s = clamp(a.s + delta.s);
  a.m = clamp(a.m + delta.m);
  a.p = clamp(a.p + delta.p);
  return delta;
}

// ---------- week start: the leadership action ----------

export function setWeeklyStyles(def, state, styles) {
  if (state.phase !== 'weekStart') return { ok: false, error: 'Styles are set at the start of a week.' };
  const ids = teamIds(state);
  const missing = ids.filter((id) => !styles[id]);
  if (missing.length) return { ok: false, error: `Set a style for ${missing.map((id) => state.actors[id].name).join(', ')}.` };
  const week = weekOf(def, state.day);
  withRng(state, (rng) => {
    for (const id of ids) {
      const a = state.actors[id];
      const desired = desiredStyle(def, a.s, a.m);
      const diff = styleDiff(def, styles[id], desired);
      const mm = drawMismatch(mismatchDistribution(def, diff), rng);
      const delta = applyImpact(def, state, id, def.leadership.weeklyImpact[mm], rng);
      state.desiredAtWeekStart[id] = desired;
      state.log.intents.push({ week, day: state.day, actorId: id, style: styles[id], desired, diff, mm, delta });
    }
  });
  state.weeklyStyles = { ...styles };
  state.phase = 'day';
  dayStart(def, state);
  return { ok: true };
}

// ---------- general actions ----------

function cooldownKey(action, option) {
  return action.cooldownScope === 'option' || action.mechanic === 'weeklyStyleCheck' ? `${action.id}:${option.id}` : action.id;
}

export function actionAvailability(def, state, action, option) {
  if (state.phase !== 'day') return { ok: false, reason: 'Set leadership styles first' };
  if (!action.enabled) return { ok: false, reason: 'Switched off' };
  if (option.dayCost > daysLeftInWeek(def, state)) return { ok: false, reason: 'Not enough days left this week' };
  const until = state.cooldowns[cooldownKey(action, option)];
  if (until !== undefined && state.day < until) return { ok: false, reason: `Available again in ${until - state.day} day(s)` };
  if (action.mechanic === 'hire') {
    if (teamIds(state).length >= def.team.maxSize) return { ok: false, reason: 'Team is at maximum size' };
    if (!Object.values(state.actors).some((a) => a.status === 'pool')) return { ok: false, reason: 'No candidates left' };
  }
  return { ok: true };
}

// request: { actionId, optionId, targets: [actorId], stage?: stageId, candidate?: actorId }
export function takeAction(def, state, request) {
  const action = def.actions.find((a) => a.id === request.actionId);
  const option = action?.options.find((o) => o.id === request.optionId) || action?.options[0];
  if (!action || !option) return { ok: false, error: 'Unknown action.' };
  const avail = actionAvailability(def, state, action, option);
  if (!avail.ok) return { ok: false, error: avail.reason };
  const targets = (request.targets || []).filter((id) => isAvailable(state, id));
  const err = checkTargets(def, state, action, option, targets, request);
  if (err) return { ok: false, error: err };

  const week = weekOf(def, state.day);
  const entry = { day: state.day, week, actionId: action.id, optionId: option.id, style: option.style || null, targets: [...targets], results: [], teamMessage: '' };
  withRng(state, (rng) => MECHANICS[action.mechanic](def, state, action, option, targets, request, rng, entry));
  state.log.actions.push(entry);
  if (option.cooldownDays) state.cooldowns[cooldownKey(action, option)] = state.day + option.cooldownDays;
  for (const r of entry.results) {
    if (r.message) {
      feed(state, {
        kind: 'response',
        title: `${state.actors[r.actorId]?.name || 'Team'} on ${action.name.toLowerCase()}`,
        text: r.message,
        actorId: r.actorId,
        tone: r.mm === 0 ? 'good' : r.mm === 1 ? 'mixed' : 'bad',
      });
    }
  }
  if (entry.teamMessage) feed(state, { kind: 'response', title: action.name, text: entry.teamMessage, tone: entry.teamTone });
  advance(def, state, Math.max(1, option.dayCost));
  return { ok: true, entry };
}

function checkTargets(def, state, action, option, targets, request) {
  const m = action.mechanic;
  if (action.scope === 'team') return null;
  if (m === 'hire') {
    if (!request.candidate || state.actors[request.candidate]?.status !== 'pool') return 'Pick a candidate to hire.';
    if (!request.stage) return 'Pick the stage the new hire joins.';
    return null;
  }
  if (m === 'roleChange') {
    if (option.mode === 'swap') return targets.length === 2 ? null : 'Pick two team members to swap.';
    if (targets.length !== 1 || !request.stage) return 'Pick one team member and a new stage.';
    const a = state.actors[targets[0]];
    if (a.stage === request.stage) return `${a.name} already works in that stage.`;
    if (membersInStage(state, a.stage).length <= 1) return `${a.name} is the only person in their stage.`;
    return null;
  }
  if (!targets.length) return 'Pick at least one team member.';
  const max = action.maxTargets || 1;
  if (targets.length > max) return `Pick up to ${max} team members.`;
  if (m === 'fire' && membersInStage(state, state.actors[targets[0]].stage).length <= 1) return 'At least one member must stay in each stage.';
  return null;
}

function respond(def, state, entry, option, id, mm, rng, factor = 1, impactOverride) {
  const impact = impactOverride || option.outcomes[String(mm)]?.impact || { s: 0, m: 0, p: 0 };
  const delta = applyImpact(def, state, id, impact, rng, factor);
  const a = state.actors[id];
  const message = renderText(def, pickMessage(option, mm, rng), {
    actor: a.name, pronoun: a.pronoun, stage: stageName(def, a.stage),
  });
  entry.results.push({ actorId: id, mm, delta, message });
}

function teamRespond(def, state, entry, option, mmById, rng) {
  const counts = [0, 0, 0];
  for (const [id, mm] of Object.entries(mmById)) {
    counts[mm] += 1;
    const delta = applyImpact(def, state, id, option.outcomes[String(mm)].impact, rng);
    entry.results.push({ actorId: id, mm, delta, message: '' });
  }
  const overall = counts.indexOf(Math.max(...counts));
  entry.teamMessage = renderText(def, pickMessage(option, overall, rng));
  entry.teamTone = overall === 0 ? 'good' : overall === 1 ? 'mixed' : 'bad';
}

export function stageName(def, id) {
  return def.stages.find((s) => s.id === id)?.name || id;
}

function pAt(actor, day) {
  for (let i = Math.min(day, actor.history.length - 1); i >= 0; i--) if (actor.history[i] !== undefined) return actor.history[i];
  const first = actor.history.find((v) => v !== undefined);
  return first ?? actor.p;
}

const MECHANICS = {
  // Options map to styles. Compare the option's style with what each person needs now.
  styleChoice(def, state, action, option, targets, req, rng, entry) {
    const ids = action.scope === 'team' ? availableIds(state) : targets;
    const mmById = {};
    for (const id of ids) {
      const a = state.actors[id];
      const diff = styleDiff(def, option.style, desiredStyle(def, a.s, a.m));
      mmById[id] = drawMismatch(mismatchDistribution(def, diff), rng);
    }
    if (action.scope === 'team') teamRespond(def, state, entry, option, mmById, rng);
    else for (const id of ids) respond(def, state, entry, option, id, mmById[id], rng);
  },

  // Team lunch and team building: judged against the style set with each person this week.
  weeklyStyleCheck(def, state, action, option, targets, req, rng, entry) {
    const mmById = {};
    for (const id of availableIds(state)) {
      const set = state.weeklyStyles[id];
      if (!set) continue;
      const diff = styleDiff(def, set, state.desiredAtWeekStart[id]);
      mmById[id] = drawMismatch(mismatchDistribution(def, diff), rng);
    }
    teamRespond(def, state, entry, option, mmById, rng);
  },

  // Emails: judged on the performance trend over the lookback window.
  performanceTrend(def, state, action, option, targets, req, rng, entry) {
    for (const id of targets) {
      const a = state.actors[id];
      const delta = a.p - pAt(a, state.day - (action.lookbackDays || 10));
      const improving = delta >= 0;
      const mm = option.polarity === 'praise' ? (improving ? 0 : 1) : improving ? 1 : 0;
      if (option.polarity === 'praise') a.lastPraiseDay = state.day;
      respond(def, state, entry, option, id, mm, rng);
    }
  },

  // Reassign or swap: stats come from the person's profile for the new stage, plus or minus a buffer.
  roleChange(def, state, action, option, targets, req, rng, entry) {
    const moves = option.mode === 'swap'
      ? [[targets[0], state.actors[targets[1]].stage], [targets[1], state.actors[targets[0]].stage]]
      : [[targets[0], req.stage]];
    for (const [id, stage] of moves) {
      const a = state.actors[id];
      const base = def.actors.find((x) => x.id === id).stats[stage];
      const b = def.randomness.statBuffer;
      const before = { s: a.s, m: a.m, p: a.p };
      a.s = clamp(base.s + rng.between(-b, b));
      a.m = clamp(base.m + rng.between(-b, b));
      a.p = clamp(base.p + rng.between(-b, b));
      a.stage = stage;
      a.stageSince = state.day;
      a.lastReassignDay = state.day;
      const mm = base.p >= before.p + 5 ? 0 : base.p > before.p - 5 ? 1 : 2;
      const delta = { s: round1(a.s - before.s), m: round1(a.m - before.m), p: round1(a.p - before.p) };
      const message = renderText(def, pickMessage(option, mm, rng), { actor: a.name, pronoun: a.pronoun, stage: stageName(def, stage) });
      entry.results.push({ actorId: id, mm, delta, message });
    }
  },

  // Training: judged against this week's intended style, with the probability table from Model doc 7.
  training(def, state, action, option, targets, req, rng, entry) {
    for (const id of targets) {
      const a = state.actors[id];
      const diff = state.weeklyStyles[id] ? styleDiff(def, state.weeklyStyles[id], state.desiredAtWeekStart[id]) : 2;
      const mm = drawMismatch(def.randomness.training[diff], rng);
      respond(def, state, entry, option, id, mm, rng);
      a.lastTrainedDay = state.day;
      a.unavailableUntil = state.day + (option.unavailableDays || 1);
      a.unavailableReason = 'Training';
    }
  },

  hire(def, state, action, option, targets, req, rng, entry) {
    const a = state.actors[req.candidate];
    const base = def.actors.find((x) => x.id === a.id).stats[req.stage];
    Object.assign(a, { status: 'team', stage: req.stage, s: base.s, m: base.m, p: base.p, stageSince: state.day });
    a.history = [];
    const message = renderText(def, pickMessage(option, 0, rng), { actor: a.name, pronoun: a.pronoun, stage: stageName(def, req.stage) });
    entry.targets = [a.id];
    entry.results.push({ actorId: a.id, mm: 0, delta: { s: 0, m: 0, p: 0 }, message });
  },

  // Everyone else reacts with mismatch type 1 (Model doc 7).
  fire(def, state, action, option, targets, req, rng, entry) {
    const gone = state.actors[targets[0]];
    gone.status = 'fired';
    for (const id of availableIds(state)) {
      const delta = applyImpact(def, state, id, option.outcomes['1'].impact, rng);
      entry.results.push({ actorId: id, mm: 1, delta, message: '' });
    }
    entry.teamMessage = renderText(def, pickMessage(option, 2, rng), { actor: gone.name, pronoun: gone.pronoun });
    entry.teamTone = 'mixed';
  },

  // Information only: estimates for every stage, within the stat buffer.
  assess(def, state, action, option, targets, req, rng, entry) {
    const a = state.actors[targets[0]];
    const base = def.actors.find((x) => x.id === a.id).stats;
    const b = def.randomness.statBuffer;
    a.assessed = Object.fromEntries(
      def.stages.map((st) => [st.id, {
        s: Math.round(clamp(base[st.id].s + rng.between(-b, b))),
        m: Math.round(clamp(base[st.id].m + rng.between(-b, b))),
        p: Math.round(clamp(base[st.id].p + rng.between(-b, b))),
      }]),
    );
    const focus = req.stage && a.assessed[req.stage] ? req.stage : a.stage;
    const est = a.assessed[focus];
    const message = renderText(def, pickMessage(option, 0, rng), {
      actor: a.name, pronoun: a.pronoun, stage: stageName(def, focus), skill: est.s, morale: est.m, performance: est.p,
    });
    entry.results.push({ actorId: a.id, mm: 0, delta: { s: 0, m: 0, p: 0 }, message });
  },

  // Reward: positive for the person rewarded; if they are not the top performer, the top performer resents it.
  reward(def, state, action, option, targets, req, rng, entry) {
    const id = targets[0];
    const top = availableIds(state).sort((x, y) => state.actors[y].p - state.actors[x].p)[0];
    respond(def, state, entry, option, id, 0, rng);
    state.actors[id].lastPraiseDay = state.day;
    if (top && top !== id) respond(def, state, entry, option, top, 1, rng);
  },
};

export const MECHANIC_INFO = {
  styleChoice: {
    name: 'Style choice',
    summary: 'Each option is written in one leadership style. The response is positive when the option matches the style the person needs now (from their skill and morale), and gets worse the further off it is.',
  },
  weeklyStyleCheck: {
    name: 'Team energiser',
    summary: 'Works well for the people whose weekly leadership style was right, and backfires for those whose style was wrong.',
  },
  performanceTrend: {
    name: 'Recognition by trend',
    summary: 'Compares performance now with performance a set number of days ago. Praise lands when performance is rising; a warning lands when it is falling.',
  },
  roleChange: {
    name: 'Role change',
    summary: 'Moves people between stages. Their skill, morale and performance come from their profile for the new stage, plus or minus the stat buffer.',
  },
  training: {
    name: 'Training',
    summary: 'Improves skill when this week\'s leadership style was right. The person is away while training.',
  },
  hire: { name: 'Hire', summary: 'Brings a candidate from the hiring pool into a stage, with the values from their profile.' },
  fire: { name: 'Fire', summary: 'Removes a person. Everyone else reacts with the Mixed outcome.' },
  assess: { name: 'Assess', summary: 'Shows estimated skill, morale and performance for every stage. No impact on the team.' },
  reward: { name: 'Reward', summary: 'Positive for the person rewarded. If they are not the top performer, the top performer reacts with the Mixed outcome.' },
};

export function proceed(def, state) {
  if (state.phase !== 'day') return { ok: false, error: 'Set leadership styles first.' };
  advance(def, state, 1);
  return { ok: true };
}

// ---------- time, funnel, events ----------

function advance(def, state, days) {
  for (let i = 0; i < days; i++) {
    runFunnelDay(def, state);
    for (const id of teamIds(state)) state.actors[id].history[state.day] = state.actors[id].p;
    state.day += 1;
    if (state.day >= totalDays(def)) {
      state.phase = 'ended';
      feed(state, { kind: 'story', title: 'Simulation complete', text: 'Your report is ready.', tone: 'info' });
      return;
    }
    if (state.day % def.timeline.daysPerWeek === 0) {
      state.phase = 'weekStart';
      snapshotWeek(def, state);
      return;
    }
    dayStart(def, state);
  }
}

// Model doc 6: output = input x conversion ratio x (average stage performance + buffer) / 100.
export function stageEfficiency(def, state, stageId) {
  const ids = membersInStage(state, stageId, { availableOnly: true });
  const avg = ids.length ? ids.reduce((t, id) => t + state.actors[id].p, 0) / ids.length : 0;
  const eff = (avg + def.funnel.buffer) / 100;
  return def.funnel.capEfficiency ? Math.min(1, eff) : eff;
}

function runFunnelDay(def, state) {
  const week = weekOf(def, state.day);
  const inflow = (def.funnel.weeklyInflow[week - 1] ?? def.funnel.weeklyInflow.at(-1) ?? 0) / def.timeline.daysPerWeek;
  let flow = inflow;
  const stageOut = def.stages.map((st, i) => {
    flow = flow * st.conversion * stageEfficiency(def, state, st.id);
    state.funnel.stageTotals[i] += flow;
    return flow;
  });
  state.funnel.conversions += flow;
  state.funnel.daily.push({ day: state.day, inflow, stageOut, conversions: flow });
}

function dayStart(def, state) {
  const week = weekOf(def, state.day);
  const dow = dayOfWeek(def, state.day);
  withRng(state, (rng) => {
    for (const ev of def.events) {
      if (!ev.enabled || ev.week !== week || ev.day !== dow) continue;
      applyEvent(def, state, ev, rng);
    }
    for (const tr of def.triggers) {
      if (!tr.enabled || !tr.windows.some((w) => w.week === week && w.day === dow)) continue;
      if ((state.triggerCounts[tr.id] || 0) >= tr.maxOccurrences) continue;
      const id = findTriggerActor(def, state, tr);
      if (!id) continue;
      state.triggerCounts[tr.id] = (state.triggerCounts[tr.id] || 0) + 1;
      applyTrigger(def, state, tr, id, rng);
    }
  });
}

// General events hit harder when the week's leadership style was wrong (Model doc 5).
function eventFactor(def, state, id) {
  const set = state.weeklyStyles[id];
  if (!set) return 1;
  const diff = styleDiff(def, set, state.desiredAtWeekStart[id]);
  return def.randomness.eventStyleFactor?.[diff] ?? 1;
}

function applyEvent(def, state, ev, rng) {
  const ids = availableIds(state);
  if (!ids.length) return;
  let who = null;
  if (ev.target === 'actor') {
    who = rng.pick(ids);
    applyImpact(def, state, who, ev.impact, rng, eventFactor(def, state, who));
  } else {
    for (const id of ids) applyImpact(def, state, id, ev.impact, rng, eventFactor(def, state, id));
  }
  const a = who ? state.actors[who] : null;
  feed(state, {
    kind: 'event',
    title: ev.name,
    text: renderText(def, ev.text, a ? { actor: a.name, pronoun: a.pronoun, stage: stageName(def, a.stage) } : {}),
    actorId: who,
    tone: ev.impact.m + ev.impact.p + ev.impact.s < 0 ? 'bad' : 'info',
  });
}

export const TRIGGER_KINDS = {
  perfAbove: { label: 'Performance is above a level', params: ['threshold', 'needsCover'] },
  perfBelow: { label: 'Performance is below a level', params: ['threshold'] },
  perfDeclining: { label: 'Performance has been falling', params: ['weeks', 'minDrop'] },
  highPerfNoRecognition: { label: 'High performer not recognised', params: ['threshold', 'weeks'] },
  sameRole: { label: 'Same stage for too long', params: ['weeks'] },
  reassignedNotTrained: { label: 'Reassigned without training', params: ['withinDays'] },
};

export function findTriggerActor(def, state, tr) {
  const r = tr.rule;
  const ids = availableIds(state);
  const A = (id) => state.actors[id];
  const dpw = def.timeline.daysPerWeek;
  const week = weekOf(def, state.day);
  const byP = (desc) => (x, y) => (desc ? A(y).p - A(x).p : A(x).p - A(y).p);
  switch (r.kind) {
    case 'perfAbove':
      return ids
        .filter((id) => A(id).p > r.threshold)
        .filter((id) => !r.needsCover || membersInStage(state, A(id).stage, { availableOnly: true }).length > 1)
        .sort(byP(true))[0];
    case 'perfBelow':
      return ids.filter((id) => A(id).p < r.threshold).sort(byP(false))[0];
    case 'perfDeclining': {
      if (week <= r.weeks) return undefined;
      const drop = (id) => (A(id).weekStart[week - 1 - r.weeks]?.p ?? A(id).p) - A(id).p;
      return ids.filter((id) => A(id).stageSince <= state.day - r.weeks * dpw && drop(id) >= r.minDrop).sort((x, y) => drop(y) - drop(x))[0];
    }
    case 'highPerfNoRecognition': {
      if (week <= r.weeks) return undefined;
      return ids
        .filter((id) => {
          const snaps = A(id).weekStart.slice(week - r.weeks, week);
          return snaps.length === r.weeks && snaps.every((sn) => sn.p > r.threshold) && A(id).lastPraiseDay < state.day - r.weeks * dpw;
        })
        .sort(byP(true))[0];
    }
    case 'sameRole':
      return ids.filter((id) => state.day - A(id).stageSince >= r.weeks * dpw).sort((x, y) => A(x).stageSince - A(y).stageSince)[0];
    case 'reassignedNotTrained':
      return ids.find((id) => A(id).lastReassignDay >= state.day - r.withinDays && A(id).lastTrainedDay < A(id).lastReassignDay);
    default:
      return undefined;
  }
}

function applyTrigger(def, state, tr, id, rng) {
  const a = state.actors[id];
  applyImpact(def, state, id, tr.impact, rng);
  if (tr.effect.unavailableDays) {
    a.unavailableUntil = state.day + tr.effect.unavailableDays;
    a.unavailableReason = tr.name;
  }
  if (tr.effect.leaves) a.status = 'left';
  feed(state, {
    kind: 'trigger',
    title: tr.name,
    text: renderText(def, tr.text, { actor: a.name, pronoun: a.pronoun, stage: stageName(def, a.stage) }),
    actorId: id,
    tone: tr.effect.leaves || tr.impact.m + tr.impact.p + tr.impact.s < 0 ? 'bad' : 'mixed',
  });
}

export function progress(def, state) {
  const conversions = state.funnel.conversions;
  return {
    conversions,
    revenue: conversions * def.funnel.valuePerConversion,
    target: def.funnel.target,
    achieved: def.funnel.target ? conversions / def.funnel.target : 0,
  };
}
