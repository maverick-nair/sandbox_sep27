// Health check. Turns the rules an iLead developer used to know by heart into plain messages
// with a place to go and, where it is safe, a one-click fix.
import { collectTexts, unknownTokens, contextBoundItems } from './text.js';
import { desiredStyle } from './engine.js';

const LEGACY_MARKERS = [/NO STRING AVAILABLE/i, /PLACEHOLDER_[A-Z_]+/, /_REPLACEMENT\b/];

export function validate(def) {
  const issues = [];
  const add = (severity, section, title, detail, extra = {}) => issues.push({ id: `${section}:${title}:${issues.length}`, severity, section, title, detail, ...extra });
  const weeks = def.timeline.weeks;
  const team = def.actors.filter((a) => a.pool === 'team');

  // Structure
  for (const st of def.stages) {
    if (!team.some((a) => a.startStage === st.id)) add('error', 'team', `No one starts in ${st.name}`, 'Every stage needs at least one person on day one, or the funnel stops at that stage.', { ref: { stageId: st.id } });
    if (!(st.conversion > 0 && st.conversion <= 1)) add('error', 'funnel', `${st.name} conversion must be between 1% and 100%`, `It is ${Math.round(st.conversion * 100)}%.`, { ref: { stageId: st.id } });
  }
  const combos = new Set(def.leadership.styles.map((s) => `${s.skill}/${s.morale}`));
  if (combos.size !== 4) add('error', 'leadership', 'Styles must cover all four skill and morale combinations', 'Each style maps to one combination of low or high skill and low or high morale.');
  if (!(def.funnel.target > 0)) add('error', 'funnel', 'Set a target', 'The learner needs a conversion target to aim for.');
  if (def.funnel.weeklyInflow.length !== weeks) {
    add('warning', 'funnel', 'Lead inflow does not match the duration', `There are ${def.funnel.weeklyInflow.length} weekly values for a ${weeks}-week simulation.`, {
      fix: { label: 'Match inflow to duration', patch: (d) => { d.funnel.weeklyInflow = Array.from({ length: weeks }, (_, i) => d.funnel.weeklyInflow[i] ?? d.funnel.weeklyInflow.at(-1) ?? 200); } },
    });
  }
  if (team.length > def.team.maxSize) add('error', 'team', 'Starting team is larger than the maximum team size', `${team.length} people start; the maximum is ${def.team.maxSize}.`);

  // Learning design: the starting team should need more than one style.
  const needs = new Set(team.map((a) => desiredStyle(def, a.stats[a.startStage].s, a.stats[a.startStage].m)));
  if (needs.size < 3) {
    add('warning', 'team', `The starting team needs only ${needs.size} leadership style${needs.size === 1 ? '' : 's'}`, 'Learners can do well without adapting. Aim for people in at least three of the four skill and morale quadrants.');
  }

  // Actions
  const hireOn = def.actions.some((a) => a.enabled && a.mechanic === 'hire');
  if (hireOn && !def.actors.some((a) => a.pool === 'hire')) add('warning', 'actions', 'Hiring is on but the hiring pool is empty', 'Add candidates in Team, or switch off Hire member.');
  const totalDays = weeks * def.timeline.daysPerWeek;
  for (const a of def.actions.filter((x) => x.enabled)) {
    for (const o of a.options) {
      if (a.mechanic === 'styleChoice' && !o.style) add('error', 'actions', `${a.name}: an option has no style`, 'Style choice actions judge the learner by the style of the option they pick.', { ref: { actionId: a.id } });
      if (o.cooldownDays >= totalDays) add('warning', 'actions', `${a.name}: can only be used once`, `The ${o.cooldownDays}-day wait is longer than the ${totalDays}-day simulation.`, { ref: { actionId: a.id } });
      if (o.dayCost > def.timeline.daysPerWeek) add('error', 'actions', `${a.name}: takes longer than a week`, 'Actions must fit inside one week.', { ref: { actionId: a.id } });
      const needMessages = a.mechanic !== 'fire' && a.mechanic !== 'hire' && a.mechanic !== 'assess' ? (a.mechanic === 'reward' ? ['0', '1'] : ['0', '1', '2']) : [];
      for (const k of needMessages) {
        if (a.mechanic === 'performanceTrend' && k === '2') continue;
        if (a.mechanic === 'roleChange' && k === '1') continue;
        if (!o.outcomes[k]?.messages.length) {
          const label = { 0: 'Positive', 1: 'Mixed', 2: 'Negative' }[k];
          add('warning', 'actions', `${a.name}${a.options.length > 1 ? ` (${o.label})` : ''}: no ${label} response`, 'The learner will see the nearest response that has copy instead.', { ref: { actionId: a.id, optionId: o.id } });
        }
      }
    }
    if (a.mechanic === 'fire') {
      const i = a.options[0].outcomes['1'].impact;
      if (i.s >= 0 && i.m >= 0 && i.p >= 0) {
        add('warning', 'actions', 'Firing has no cost for the rest of the team', 'The model says everyone else reacts negatively, but the Mixed impact is zero. Learners can fire people without consequence.', {
          ref: { actionId: a.id },
          fix: { label: 'Use a small negative reaction (-3 morale, -2 performance)', patch: (d) => { d.actions.find((x) => x.id === a.id).options[0].outcomes['1'].impact = { s: 0, m: -3, p: -2 }; } },
        });
      }
    }
    for (const k of ['1', '2']) {
      for (const o of a.options) {
        const i = o.outcomes[k]?.impact;
        if (a.mechanic === 'styleChoice' && i && i.s + i.m + i.p > 0) add('warning', 'actions', `${a.name}: a wrong style still helps`, `The ${k === '1' ? 'Mixed' : 'Negative'} outcome adds to skill, morale and performance.`, { ref: { actionId: a.id, optionId: o.id } });
      }
    }
  }

  // Events
  for (const e of def.events) {
    if (!e.enabled) {
      if (e.week < 1) add('info', 'events', `${e.name} is not scheduled`, 'It is in the library but switched off. Schedule it on the timeline to use it.', { ref: { eventId: e.id } });
      continue;
    }
    if (e.week < 1 || e.week > weeks) add('error', 'events', `${e.name} is outside the simulation`, `It is set for week ${e.week}; the simulation has ${weeks} weeks.`, { ref: { eventId: e.id } });
    if (e.day > def.timeline.daysPerWeek) add('error', 'events', `${e.name} falls on a day that does not exist`, `Day ${e.day} of a ${def.timeline.daysPerWeek}-day week.`, { ref: { eventId: e.id } });
  }
  for (const t of def.triggers.filter((x) => x.enabled)) {
    const inside = t.windows.filter((w) => w.week <= weeks);
    if (!inside.length) add('warning', 'events', `${t.name} can never happen`, 'All of its check points are after the last week.', { ref: { triggerId: t.id } });
    else if (inside.length < t.windows.length) add('info', 'events', `${t.name}: some check points are after the last week`, `${t.windows.length - inside.length} of ${t.windows.length} are ignored.`, { ref: { triggerId: t.id } });
  }

  // Copy
  for (const t of collectTexts(def)) {
    if (LEGACY_MARKERS.some((re) => re.test(t.text))) add('error', t.section, `Missing copy: ${t.label}`, 'This text still holds a legacy placeholder. Write the learner-facing text.', { ref: t.ref });
    const unknown = unknownTokens(def, t.text);
    if (unknown.length) add('error', t.section, `Unknown field in ${t.label}`, `{{${unknown.join('}}, {{')}}} is not a context field or a runtime field.`, { ref: t.ref });
  }
  if (def.context.industry.trim().toLowerCase() !== def.context.originalIndustry.trim().toLowerCase()) {
    const bound = contextBoundItems(def);
    if (bound.length) add('warning', 'story', `${bound.length} item${bound.length === 1 ? '' : 's'} still describe the ${def.context.originalIndustry.toLowerCase()} world`, 'Names update automatically, but these situations need rewriting for the new industry. Open the rewrite list in Story.', { ref: { field: 'rewrite' } });
  }

  // Assumptions carried from the migration
  const ack = new Set(def.meta.acknowledged || []);
  const open = (def.meta.assumptions || []).filter((a) => !ack.has(a.id));
  if (open.length) add('info', 'overview', `${open.length} migration assumption${open.length === 1 ? '' : 's'} to confirm`, 'Values the legacy documents did not specify. Review them on the Overview page.');

  const order = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function healthSummary(issues) {
  return {
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    infos: issues.filter((i) => i.severity === 'info').length,
  };
}
