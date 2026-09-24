// Authoring helpers: the operations behind the Quick start wizard and the Studio's bulk controls.
// Each one changes several low-level values together so authors never have to keep them in sync.

export const SESSION_LENGTHS = [
  { id: 'short', label: '45 minutes', weeks: 6, note: '6 simulated weeks' },
  { id: 'medium', label: '60 minutes', weeks: 8, note: '8 simulated weeks' },
  { id: 'long', label: '90 minutes', weeks: 12, note: '12 simulated weeks, the legacy default' },
];

export const DIFFICULTY = {
  guided: { label: 'Guided', note: 'Wrong styles are forgiven more often; target is 15% lower.', mismatchChance: 0.45, targetFactor: 0.85, impactMin: 0.9, impactMax: 1.1 },
  standard: { label: 'Standard', note: 'The legacy iLead settings.', mismatchChance: 0.6, targetFactor: 1, impactMin: 0.8, impactMax: 1.2 },
  challenging: { label: 'Challenging', note: 'Wrong styles land more often; target is 15% higher; outcomes vary more.', mismatchChance: 0.75, targetFactor: 1.15, impactMin: 0.7, impactMax: 1.3 },
};

import { clone } from './clone.js';
export { clone };

// Compress or stretch the calendar: events, trigger windows and lead inflow move together,
// and the target scales with the number of leads so difficulty stays about the same.
export function rescaleTimeline(def, weeks) {
  const d = clone(def);
  const old = d.timeline.weeks;
  if (weeks === old) return d;
  const map = (w) => Math.max(1, Math.min(weeks, Math.round((w * weeks) / old)));
  for (const e of d.events) if (e.week > 0) e.week = map(e.week);
  for (const p of d.decisions?.points || []) p.week = map(p.week);
  for (const r of d.learning?.reflections || []) r.week = map(r.week);
  for (const t of d.triggers) {
    const seen = new Set();
    t.windows = t.windows
      .map((w) => ({ ...w, week: map(w.week) }))
      .filter((w) => {
        const k = `${w.week}:${w.day}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    if (t.rule.weeks) t.rule.weeks = Math.max(1, Math.round((t.rule.weeks * weeks) / old));
  }
  const src = d.funnel.weeklyInflow;
  const oldSum = src.reduce((a, b) => a + b, 0);
  d.funnel.weeklyInflow = Array.from({ length: weeks }, (_, i) => src[Math.min(src.length - 1, Math.floor((i * src.length) / weeks))]);
  const newSum = d.funnel.weeklyInflow.reduce((a, b) => a + b, 0);
  d.funnel.target = Math.max(1, Math.round((d.funnel.target * newSum) / oldSum));
  if (d.meta.baseTarget) d.meta.baseTarget = Math.max(1, Math.round((d.meta.baseTarget * newSum) / oldSum));
  d.timeline.weeks = weeks;
  return d;
}

export function applyDifficulty(def, level) {
  const d = clone(def);
  const p = DIFFICULTY[level];
  if (!p) return d;
  const base = d.meta.baseTarget ?? d.funnel.target / (DIFFICULTY[d.meta.difficulty]?.targetFactor || 1);
  d.meta.baseTarget = Math.round(base);
  d.funnel.target = Math.max(1, Math.round(base * p.targetFactor));
  d.randomness.mismatchChance = p.mismatchChance;
  d.randomness.impactMin = p.impactMin;
  d.randomness.impactMax = p.impactMax;
  d.meta.difficulty = level;
  return d;
}

export function setEntity(def, key, value) {
  const d = clone(def);
  const e = d.context.entities.find((x) => x.key === key);
  if (e) e.value = value;
  return d;
}

// The starting team as the diagnostic grid a learner has to read.
export function styleMix(def, desiredStyleFn) {
  const mix = Object.fromEntries(def.leadership.styles.map((s) => [s.id, 0]));
  for (const a of def.actors.filter((x) => x.pool === 'team')) {
    const st = a.stats[a.startStage];
    mix[desiredStyleFn(def, st.s, st.m)] += 1;
  }
  return mix;
}

let counter = 0;
export function newId(prefix) {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}${counter}`;
}

// Writes a string back to the place collectTexts() found it (used by the rewrite list).
export function setTextAt(def, ref, value) {
  if (ref.field === 'briefing') def.story.briefing[ref.index] = value;
  else if (ref.field === 'walkthrough') def.story.walkthrough[ref.index].text = value;
  else if (ref.dpId) {
    const p = def.decisions.points.find((x) => x.id === ref.dpId);
    if (ref.optionId) p.options.find((o) => o.id === ref.optionId)[ref.field] = value;
    else if (ref.band) { p.outcomes[ref.band] ||= {}; p.outcomes[ref.band][ref.field] = value; }
    else if (ref.field === 'variant') p.variants[ref.index].text = value;
    else if (ref.field === 'modelAnswer') p.open.modelAnswer = value;
    else p[ref.field] = value;
  } else if (ref.field) def.story[ref.field] = value;
  else if (ref.stageId) def.stages.find((s) => s.id === ref.stageId).description = value;
  else if (ref.actorId) def.actors.find((a) => a.id === ref.actorId).bio = value;
  else if (ref.eventId) def.events.find((e) => e.id === ref.eventId).text = value;
  else if (ref.triggerId) def.triggers.find((t) => t.id === ref.triggerId).text = value;
  else if (ref.actionId) {
    const a = def.actions.find((x) => x.id === ref.actionId);
    if (!ref.optionId) a.description = value;
    else {
      const o = a.options.find((x) => x.id === ref.optionId);
      if (ref.outcome !== undefined) o.outcomes[ref.outcome].messages[ref.index] = value;
      else o.text = value;
    }
  } else if (ref.competencyId) def.report.competencies.find((c) => c.id === ref.competencyId).bands.find((b) => b.label === ref.band).text = value;
  else if (ref.objective) def.report.objective[ref.objective] = value;
  else if (ref.styleId) def.report.styleInsights[ref.styleId][ref.cell] = value;
}
