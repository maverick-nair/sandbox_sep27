// Report layout and the group report's words. The group report copy comes from the legacy
// "Group Report New" sheet (typos fixed, the missing Low use, High accuracy insights drafted).
import group from './group-report.json' with { type: 'json' };

export const USER_SECTIONS = {
  summary: 'At a glance',
  competencies: 'Competencies',
  objective: 'Objectives',
  adaptability: 'Overall leadership adaptability',
  styles: 'Leadership styles summary',
  consistency: 'Consistency in styles',
  actions: 'Summary of actions',
  distribution: 'Distribution of actions across the team',
  foodForThought: 'Food for thought',
  takeaways: 'Key takeaways',
};

export const GROUP_SECTIONS = {
  competencies: 'Competency proficiency levels',
  distribution: 'Percentage distribution',
  completion: 'Completion rate',
  business: 'Business achievement',
  smp: 'Skill, morale and performance',
  adaptability: 'Leadership style adaptability',
  preferences: 'Leadership style preferences',
  quadrant: 'Leadership styles distribution',
  consistency: 'Leadership styles consistency',
  funnel: 'Sales funnel',
  actions: 'Actions',
  time: 'Management style',
  questions: 'Key takeaways',
};

const on = (keys) => Object.fromEntries(Object.keys(keys).map((k) => [k, true]));

export function defaultGroupReport() {
  return { ...JSON.parse(JSON.stringify(group)), sections: on(GROUP_SECTIONS), benchmark: 'auto' };
}

// Fills whatever an older definition is missing, keeping everything the author wrote.
export function upgradeReport(report) {
  report.sections = { ...on(USER_SECTIONS), ...(report.sections || {}) };
  const g = defaultGroupReport();
  if (!report.group) { report.group = g; return report; }
  const r = report.group;
  r.sections = { ...g.sections, ...(r.sections || {}) };
  r.intro = { ...g.intro, ...(r.intro || {}) };
  r.notes = { ...g.notes, ...(r.notes || {}) };
  for (const k of ['cover', 'aboutReport', 'competencies', 'styleDescriptions', 'styleInsights', 'preference', 'consistency', 'questions', 'benchmark']) if (r[k] === undefined) r[k] = g[k];
  return report;
}
