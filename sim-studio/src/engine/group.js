// The group report: a compact copy of each learner's report is kept with their result, and the
// group report aggregates those copies. The benchmark is either everyone who has played the
// simulation or, until enough people have, synthetic learners of mixed ability.
import { computeReport } from './report.js';
import { playSynthetic, playBot } from './bots.js';
import { renderText } from './text.js';

const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;

// What a result record keeps from the learner's report. Small, so thousands fit in shared storage.
export function compactReport(def, state, report = computeReport(def, state)) {
  return {
    comps: Object.fromEntries(report.competencies.map((c) => [c.id, c.score])),
    adapt: r3(report.accuracy),
    styles: Object.fromEntries(report.styles.map((s) => [s.id, { u: s.used, n: s.needed, c: s.correct }])),
    cons: report.consistencyPct,
    actions: Object.fromEntries(report.actions.filter((a) => a.count).map((a) => [a.id, { n: a.count, p: r3(a.positive) }])),
    time: report.time,
    cum: report.cumulative,
    done: r3(report.completion),
    rev: Math.round(report.progress.revenue),
    conv: r1(report.progress.conversions),
    ach: r3(report.progress.achieved),
    smp: { s: { s: r1(report.start.s), m: r1(report.start.m), p: r1(report.start.p) }, e: { s: r1(report.end.s), m: r1(report.end.m), p: r1(report.end.p) } },
  };
}

const avg = (xs) => (xs.length ? xs.reduce((t, x) => t + x, 0) / xs.length : null);
export const LEVELS = ['Novice', 'Emerging', 'Competent', 'Proficient', 'Role Model'];
// Bands are 0-2, 2-4, 4-6, 6-8, 8-10; a score on a boundary belongs to the lower band, as in the
// learner's report.
export const bandIndex = (score) => (score <= 2 ? 0 : score <= 4 ? 1 : score <= 6 ? 2 : score <= 8 ? 3 : 4);
const band3 = (v, lo, hi) => (v < lo ? 'Low' : v < hi ? 'Moderate' : 'High');
export const mismatchKey = (pct) => (pct === null || pct === undefined ? 'NoMismatch' : pct < 25 ? 'LowMismatch' : pct < 50 ? 'ModerateMismatch' : 'HighMismatch');
export const impactOf = (pos, n) => (!n ? 'No' : pos >= 0.75 ? 'High' : pos >= 0.5 ? 'Moderate' : pos >= 0.25 ? 'Low' : 'Very low');

// Aggregates compact reports. Records without one (made before the group report existed) only
// count towards the totals.
export function aggregate(def, rps) {
  const list = rps.filter(Boolean);
  const n = list.length;
  if (!n) return { n: 0 };
  const comps = def.report.competencies.filter((c) => c.enabled).map((c) => {
    const xs = list.map((r) => r.comps?.[c.id]).filter((v) => v !== undefined);
    const dist = [0, 0, 0, 0, 0];
    for (const x of xs) dist[bandIndex(x)] += 1;
    return { id: c.id, name: c.name, score: xs.length ? r1(avg(xs)) : null, dist: dist.map((v) => (xs.length ? r1((v / xs.length) * 100) : 0)) };
  });
  const buckets = [
    { label: 'Up to 50%', test: (v) => v <= 0.5 },
    { label: '50% to 80%', test: (v) => v > 0.5 && v <= 0.8 },
    { label: '80% to 99%', test: (v) => v > 0.8 && v < 1 },
    { label: 'All of it', test: (v) => v >= 1 },
  ].map((b) => ({ label: b.label, value: r1((list.filter((r) => b.test(r.done ?? 1)).length / n) * 100) }));

  const styles = def.leadership.styles.map((s) => {
    const used = list.reduce((t, r) => t + (r.styles?.[s.id]?.u || 0), 0);
    const needed = list.reduce((t, r) => t + (r.styles?.[s.id]?.n || 0), 0);
    const correct = list.reduce((t, r) => t + (r.styles?.[s.id]?.c || 0), 0);
    const all = list.reduce((t, r) => t + Object.values(r.styles || {}).reduce((a, x) => a + (x.u || 0), 0), 0);
    const preferredBy = list.filter((r) => { const e = Object.entries(r.styles || {}).sort((a, b) => b[1].u - a[1].u)[0]; return e && e[0] === s.id && e[1].u > 0; }).length;
    const use = needed ? band3(used / needed, 0.5, 0.9) : used ? 'High' : 'Low';
    const acc = used ? band3(correct / used, 0.4, 0.7) : 'High';
    return { id: s.id, name: s.name, proportion: all ? used / all : 0, accuracy: used ? correct / used : null, preferredBy: preferredBy / n, key: `${use}Use${acc}Accuracy` };
  });
  const top = [...styles].sort((a, b) => b.proportion - a.proportion)[0];

  const cons = Object.fromEntries(['desiredVsActual', 'intentVsActual', 'desiredVsIntent'].map((k) => {
    const xs = list.map((r) => r.cons?.[k]).filter((v) => v !== null && v !== undefined);
    return [k, xs.length ? r1(avg(xs)) : null];
  }));

  const weeks = def.timeline.weeks;
  const cumulative = Array.from({ length: weeks }, (_, w) => r1(avg(list.map((r) => r.cum?.[w] ?? r.cum?.at(-1) ?? 0)) || 0));

  const actions = def.actions.filter((a) => a.enabled).map((a) => {
    const rs = list.map((r) => r.actions?.[a.id]).filter(Boolean);
    const count = rs.reduce((t, x) => t + x.n, 0);
    const pos = count ? rs.reduce((t, x) => t + x.p * x.n, 0) / count : 0;
    return { id: a.id, name: a.name, count, perLearner: r1(count / n), impact: impactOf(pos, count) };
  });

  const t = list.reduce((acc, r) => ({ top: acc.top + (r.time?.top || 0), average: acc.average + (r.time?.average || 0), bottom: acc.bottom + (r.time?.bottom || 0) }), { top: 0, average: 0, bottom: 0 });
  const tTotal = t.top + t.average + t.bottom || 1;
  const smpEnd = { s: r1(avg(list.map((r) => r.smp?.e.s ?? 0))), m: r1(avg(list.map((r) => r.smp?.e.m ?? 0))), p: r1(avg(list.map((r) => r.smp?.e.p ?? 0))) };
  const smpStart = { s: r1(avg(list.map((r) => r.smp?.s.s ?? 0))), m: r1(avg(list.map((r) => r.smp?.s.m ?? 0))), p: r1(avg(list.map((r) => r.smp?.s.p ?? 0))) };

  return {
    n,
    comps,
    completion: buckets,
    finished: list.filter((r) => (r.done ?? 1) >= 1).length / n,
    maxRevenue: Math.max(...list.map((r) => r.rev || 0)),
    avgRevenue: Math.round(avg(list.map((r) => r.rev || 0))),
    avgConversions: r1(avg(list.map((r) => r.conv || 0))),
    overAchievers: list.filter((r) => (r.ach || 0) > 1).length / n,
    smpStart, smpEnd,
    adapt: avg(list.map((r) => r.adapt || 0)),
    styles, topStyle: top?.proportion ? top : null,
    cons,
    cumulative,
    actions,
    time: { top: t.top / tTotal, average: t.average / tTotal, bottom: t.bottom / tTotal, total: t.top + t.average + t.bottom },
  };
}

// The words for the group's results, chosen by band from the authored group report copy.
export function groupInsights(def, g) {
  const G = def.report.group || {};
  const T = (text, vars) => renderText(def, text || '', vars);
  return {
    comps: Object.fromEntries((g.comps || []).map((c) => [c.id, c.score === null ? '' : T(G.competencies?.[c.id]?.bands?.[LEVELS[bandIndex(c.score)]])])),
    styles: Object.fromEntries((g.styles || []).map((s) => [s.id, T(G.styleInsights?.[s.id]?.[s.key], { style: s.name })])),
    preference: g.topStyle ? T(G.preference?.[g.topStyle.id], { style: g.topStyle.name }) : '',
    cons: Object.fromEntries([['desiredVsActual', 'desired-vs-actual'], ['intentVsActual', 'intent-vs-actual'], ['desiredVsIntent', 'desired-vs-intent']].map(([k, id]) => [k, T(G.consistency?.[id]?.bands?.[mismatchKey(g.cons?.[k])])])),
  };
}

// The best progression the simulation allows, for the sales funnel: an expert bot's quarter.
export function idealProgression(def, seed = 7) {
  try {
    const run = playBot(def, 'expert', seed);
    return computeReport(def, run.state).cumulative;
  } catch {
    return Array.from({ length: def.timeline.weeks }, (_, i) => r1((def.funnel.target * (i + 1)) / def.timeline.weeks));
  }
}

// Synthetic learners of mixed ability, as a benchmark before enough real people have played.
// Yields to the page between runs so the interface stays responsive.
export async function syntheticBenchmark(def, n = 30, { seed = 4242, onProgress } = {}) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const skill = 0.08 + (((i * 37) % 85) / 100);
    const run = playSynthetic(def, seed + i * 101, skill);
    out.push(compactReport(def, run.state));
    onProgress?.((i + 1) / n);
    if (i % 3 === 2) await new Promise((r) => setTimeout(r, 0));
  }
  return out;
}
