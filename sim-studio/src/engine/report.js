// Individual learner report, computed from a finished (or in-progress) run.
// Structure follows the legacy "Report New" sheet; scores are 0 to 10.
import { progress, teamAverages, styleById, styleDiff, weekOf, desiredStyle } from './engine.js';
import { renderText } from './text.js';
import { buildDevelopment } from './development.js';

// The report measures each competency "on a scale of 1-10" (Report New sheet).
const clamp10 = (v) => Math.max(1, Math.min(10, v));
const band3 = (v, lo, hi) => (v < lo ? 'Low' : v < hi ? 'Moderate' : 'High');

function bandFor(comp, score) {
  return comp.bands.find((b) => score >= b.min && score <= b.max) || comp.bands[comp.bands.length - 1];
}

export function computeReport(def, state) {
  const out = computeCore(def, state);
  out.dev = buildDevelopment(def, state, out);
  return out;
}

function computeCore(def, state) {
  const pr = progress(def, state);
  const start = state.start;
  const end = teamAverages(state);
  const intents = state.log.intents;
  const accuracy = intents.length ? intents.filter((i) => i.diff === 0).length / intents.length : 0;
  const scale = def.report.scoreScale || 3;

  const scores = {
    adapt: clamp10(accuracy * 10),
    upskill: clamp10(5 + (end.s - start.s) / scale),
    motivate: clamp10(5 + (end.m - start.m) / scale),
    enable: clamp10(5 + (end.p - start.p) / scale),
    results: clamp10(pr.achieved * 8),
  };
  const competencies = def.report.competencies
    .filter((c) => c.enabled)
    .map((c) => {
      const score = Math.round(scores[c.id] * 10) / 10;
      const b = bandFor(c, score);
      return { id: c.id, name: c.name, code: c.ontologyCode, score, band: b?.label, text: b?.text || '' };
    });

  const objectiveKey = pr.achieved >= 1 ? 'high' : pr.achieved >= 0.7 ? 'medium' : 'low';
  const accuracyKey = band3(accuracy, 0.4, 0.7).toLowerCase();

  // Style use: proportion of intents, and accuracy = correct uses / times the style was needed.
  const styles = def.leadership.styles.map((s) => {
    const used = intents.filter((i) => i.style === s.id);
    const needed = intents.filter((i) => i.desired === s.id);
    const correct = used.filter((i) => i.desired === s.id);
    const proportion = intents.length ? used.length / intents.length : 0;
    const adaptability = needed.length ? correct.length / needed.length : used.length ? 0 : 1;
    const use = needed.length ? band3(used.length / needed.length, 0.5, 0.9) : used.length ? 'High' : 'Low';
    const acc = used.length ? band3(correct.length / used.length, 0.4, 0.7) : 'High';
    const key = `${use}Use${acc}Accuracy`;
    const text = def.report.styleInsights[s.id]?.[key] || '';
    const accuracy = used.length ? correct.length / used.length : null;
    return { id: s.id, name: s.name, proportion, adaptability, accuracy, used: used.length, needed: needed.length, correct: correct.length, use, acc, key, text: renderText(def, text, { style: s.name }) };
  });
  const dominant = [...styles].sort((a, b) => b.used - a.used)[0];

  // Actions summary: share of positive responses per action.
  const actions = def.actions.map((a) => {
    const entries = state.log.actions.filter((e) => e.actionId === a.id);
    const results = entries.flatMap((e) => e.results);
    const positive = results.length ? results.filter((r) => r.mm === 0).length / results.length : 0;
    const key = !entries.length ? 'NoImpact' : positive >= 0.75 ? 'HighPositive' : positive >= 0.5 ? 'LowPositive' : positive >= 0.25 ? 'LowNegative' : 'HighNegative';
    return { id: a.id, name: a.name, count: entries.length, positive, key, text: def.report.actionInsights[a.id]?.bands[key] || '' };
  });

  // Consistency, as the iLead model document defines it: for each team member, the dominant
  // intent (the style set with them most often at the start of the week) against the dominant
  // style (the style most used with them through Meet the team, Meet face to face, Set goals,
  // Coach member and Give feedback), and the dominant desired style (the one their skill and
  // morale called for most often). Deviation is the style difference (0 to 2) averaged over the
  // team members who have both.
  const dominantOf = (list) => {
    const counts = {};
    for (const x of list) if (x) counts[x] = (counts[x] || 0) + 1;
    const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    return best ? best[0] : null;
  };
  const byActor = {};
  for (const i of intents) {
    const b = (byActor[i.actorId] ||= { intents: [], desired: [], actual: [] });
    b.intents.push(i.style);
    b.desired.push(i.desired);
  }
  for (const e of state.log.actions.filter((x) => x.style)) {
    const ids = e.results.length ? e.results.map((r) => r.actorId) : e.targets;
    for (const id of new Set(ids)) (byActor[id] ||= { intents: [], desired: [], actual: [] }).actual.push(e.style);
  }
  const perPerson = Object.entries(byActor).map(([id, b]) => ({ id, name: state.actors[id]?.name, intent: dominantOf(b.intents), desired: dominantOf(b.desired), actual: dominantOf(b.actual) }));
  const meanDiff = (a, b) => {
    const xs = perPerson.filter((p) => p[a] && p[b]).map((p) => styleDiff(def, p[a], p[b]));
    return xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : null;
  };
  const avgDiff = meanDiff('desired', 'intent');
  const intentVsActual = meanDiff('intent', 'actual');
  const desiredVsActual = meanDiff('desired', 'actual');
  const mismatchKey = (v) => (v === null ? 'NoMismatch' : v < 0.5 ? 'LowMismatch' : v < 1 ? 'ModerateMismatch' : 'HighMismatch');
  const pctOf = (v) => (v === null ? null : Math.round((v / 2) * 1000) / 10); // style distance 0 to 2 as a deviation percentage

  // Impact of each action, in the legacy five levels.
  const impactOf = (pos, n) => (!n ? 'No' : pos >= 0.75 ? 'High' : pos >= 0.5 ? 'Moderate' : pos >= 0.25 ? 'Low' : 'Very low');

  // Distribution: how often each action touched each person, and how well it landed.
  const people = Object.values(state.actors).filter((a) => a.status !== 'pool');
  const distribution = people.map((a) => {
    const cells = Object.fromEntries(def.actions.filter((x) => x.enabled).map((x) => {
      const res = state.log.actions.filter((e) => e.actionId === x.id).flatMap((e) => e.results).filter((r) => r.actorId === a.id);
      const pos = res.length ? res.filter((r) => r.mm === 0).length / res.length : 0;
      return [x.id, { n: res.length, impact: impactOf(pos, res.length) }];
    }));
    const total = Object.values(cells).reduce((t, c) => t + c.n, 0);
    const pos = Object.values(cells).reduce((t, c) => t + (c.impact === 'High' ? 3 : c.impact === 'Moderate' ? 2 : c.impact === 'Low' ? 1 : 0) * c.n, 0);
    return { id: a.id, name: a.name, cells, total, score: total ? pos / total : 0, left: a.status === 'left' };
  }).sort((x, y) => y.score - x.score || y.total - x.total);

  // Management style: where the learner's time went, by who was a top, average or bottom performer
  // that week. The model document says top and bottom 25%; the group report sheet says top and
  // bottom three. For iLead's team of 10 both give three people.
  const time = { top: 0, average: 0, bottom: 0 };
  for (const e of state.log.actions) {
    const ranked = people.filter((a) => a.weekStart?.[e.week - 1]).sort((x, y) => y.weekStart[e.week - 1].p - x.weekStart[e.week - 1].p).map((a) => a.id);
    for (const r of e.results) {
      const k = ranked.indexOf(r.actorId);
      if (k < 0) continue;
      const q = Math.max(1, Math.round(ranked.length * 0.25));
      time[k < q ? 'top' : k >= ranked.length - q ? 'bottom' : 'average'] += e.dayCost || 1;
    }
  }

  // Conversions week by week, for the sales funnel view.
  const weeks = def.timeline.weeks;
  const perWeek = Array.from({ length: weeks }, () => 0);
  for (const d of state.funnel.daily) perWeek[Math.min(weeks - 1, weekOf(def, d.day) - 1)] += d.conversions;
  let run = 0;
  const cumulative = perWeek.map((v) => Math.round((run += v) * 10) / 10);

  return {
    progress: pr,
    revenueTarget: pr.target * (def.funnel.valuePerConversion || 0),
    accuracy,
    start,
    end,
    objective: { key: objectiveKey, text: def.report.objective[objectiveKey] || '' },
    adaptability: { key: accuracyKey, text: def.report.adaptability[accuracyKey] || '' },
    competencies,
    styles,
    dominant: dominant?.used ? styleById(def, dominant.id)?.name : null,
    actions: actions.map((a) => ({ ...a, impact: impactOf(a.positive, a.count) })),
    distribution,
    time,
    cumulative,
    completion: Math.min(1, state.day / (def.timeline.weeks * def.timeline.daysPerWeek)),
    consistencyByPerson: perPerson,
    consistencyPct: { desiredVsActual: pctOf(desiredVsActual), intentVsActual: pctOf(intentVsActual), desiredVsIntent: pctOf(avgDiff) },
    consistency: [
      { id: 'desired-vs-actual', name: 'Desired vs actual', value: desiredVsActual, key: mismatchKey(desiredVsActual), text: def.report.consistency['desired-vs-actual']?.bands[mismatchKey(desiredVsActual)] || '' },
      { id: 'desired-vs-intent', name: 'Desired vs intended', value: avgDiff, key: mismatchKey(avgDiff), text: def.report.consistency['desired-vs-intent']?.bands[mismatchKey(avgDiff)] || '' },
      { id: 'intent-vs-actual', name: 'Intended vs actual', value: intentVsActual, key: mismatchKey(intentVsActual), text: def.report.consistency['intent-vs-actual']?.bands[mismatchKey(intentVsActual)] || '' },
    ],
  };
}
