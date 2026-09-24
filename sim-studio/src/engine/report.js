// Individual learner report, computed from a finished (or in-progress) run.
// Structure follows the legacy "Report New" sheet; scores are 0 to 10.
import { progress, teamAverages, styleById, styleDiff } from './engine.js';
import { renderText } from './text.js';

const clamp10 = (v) => Math.max(0, Math.min(10, v));
const band3 = (v, lo, hi) => (v < lo ? 'Low' : v < hi ? 'Moderate' : 'High');

function bandFor(comp, score) {
  return comp.bands.find((b) => score >= b.min && score <= b.max) || comp.bands[comp.bands.length - 1];
}

export function computeReport(def, state) {
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
    return { id: s.id, name: s.name, proportion, adaptability, used: used.length, needed: needed.length, key, text: renderText(def, text, { style: s.name }) };
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

  // Consistency: desired vs intended style, per week, as the average style difference.
  const avgDiff = intents.length ? intents.reduce((t, i) => t + i.diff, 0) / intents.length : null;
  const styledActions = state.log.actions.filter((e) => e.style).flatMap((e) =>
    (e.targets.length ? e.targets : e.results.map((r) => r.actorId)).map((id) => {
      const intent = intents.filter((i) => i.actorId === id && i.week === e.week).at(-1);
      return intent ? styleDiff(def, e.style, intent.style) : null;
    }),
  ).filter((d) => d !== null);
  const intentVsActual = styledActions.length ? styledActions.reduce((a, b) => a + b, 0) / styledActions.length : null;
  const mismatchKey = (v) => (v === null ? 'NoMismatch' : v < 0.5 ? 'LowMismatch' : v < 1 ? 'ModerateMismatch' : 'HighMismatch');

  return {
    progress: pr,
    accuracy,
    start,
    end,
    objective: { key: objectiveKey, text: def.report.objective[objectiveKey] || '' },
    adaptability: { key: accuracyKey, text: def.report.adaptability[accuracyKey] || '' },
    competencies,
    styles,
    dominant: dominant?.used ? styleById(def, dominant.id)?.name : null,
    actions,
    consistency: [
      { id: 'desired-vs-intent', name: 'Desired vs intended', value: avgDiff, key: mismatchKey(avgDiff), text: def.report.consistency['desired-vs-intent']?.bands[mismatchKey(avgDiff)] || '' },
      { id: 'intent-vs-actual', name: 'Intended vs actual', value: intentVsActual, key: mismatchKey(intentVsActual), text: def.report.consistency['intent-vs-actual']?.bands[mismatchKey(intentVsActual)] || '' },
    ],
  };
}
