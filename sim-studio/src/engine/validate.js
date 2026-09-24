// Health check. Turns the rules an iLead developer used to know by heart into plain messages
// with a place to go and, where it is safe, a one-click fix.
import { collectTexts, unknownTokens, contextBoundItems } from './text.js';
import { desiredStyle } from './engine.js';

// What each outcome of a mechanic means, in the author's words.
export const OUTCOME_LABELS = {
  styleChoice: { 0: 'Style fits', 1: 'Partly fits', 2: 'Wrong style' },
  weeklyStyleCheck: { 0: 'Style fits', 1: 'Partly fits', 2: 'Wrong style' },
  training: { 0: 'Well timed', 1: 'Partly useful', 2: 'Badly timed' },
  performanceTrend: { 0: 'Matches the trend', 1: 'Against the trend', 2: 'Against the trend' },
  roleChange: { 0: 'Better fit', 1: 'Similar fit', 2: 'Worse fit' },
  reward: { 0: 'Person rewarded', 1: 'Top performer passed over', 2: 'Not deserved' },
  fire: { 0: 'Fired', 1: 'Rest of the team reacts', 2: 'Rest of the team reacts' },
  hire: { 0: 'Announcement' },
  assess: { 0: 'Result' },
};
export const outcomeLabel = (mechanic, k) => OUTCOME_LABELS[mechanic]?.[k] || { 0: 'Positive', 1: 'Mixed', 2: 'Negative' }[k];

const LEGACY_MARKERS = [/NO STRING AVAILABLE/i, /PLACEHOLDER_[A-Z_]+/, /_REPLACEMENT\b/];

export function validate(def) {
  const issues = [];
  const add = (severity, section, title, detail, extra = {}) => issues.push({ id: `${section}:${title}:${issues.length}`, severity, section, title, detail, ...extra });
  const weeks = def.timeline.weeks;
  const team = def.actors.filter((a) => a.pool === 'team');

  // Structure
  for (const st of def.stages) {
    if (!team.some((a) => a.startStage === st.id)) add('error', 'team', `No one starts in ${st.name}`, 'Every stage needs at least one person on day one, or the funnel stops at that stage.', { ref: { stageId: st.id }, code: 'stage-empty', data: { stageId: st.id } });
    if (!(st.conversion > 0 && st.conversion <= 1)) add('error', 'funnel', `${st.name} conversion must be between 1% and 100%`, `It is ${Math.round(st.conversion * 100)}%.`, { ref: { stageId: st.id }, code: 'conversion-range', data: { stageId: st.id } });
  }
  const combos = new Set(def.leadership.styles.map((s) => `${s.skill}/${s.morale}`));
  if (combos.size !== 4) add('error', 'leadership', 'Styles must cover all four skill and morale combinations', 'Each style maps to one combination of low or high skill and low or high morale.', { code: 'styles-combos' });
  if (!(def.funnel.target > 0)) add('error', 'funnel', 'Set a target', 'The learner needs a conversion target to aim for.', { code: 'no-target' });
  if (def.funnel.weeklyInflow.length !== weeks) {
    add('warning', 'funnel', 'Lead inflow does not match the duration', `There are ${def.funnel.weeklyInflow.length} weekly values for a ${weeks}-week simulation.`, {
      code: 'inflow-length',
      fix: { label: 'Match inflow to duration', patch: (d) => { d.funnel.weeklyInflow = Array.from({ length: weeks }, (_, i) => d.funnel.weeklyInflow[i] ?? d.funnel.weeklyInflow.at(-1) ?? 200); } },
    });
  }
  if (team.length > def.team.maxSize) add('error', 'team', 'Starting team is larger than the maximum team size', `${team.length} people start; the maximum is ${def.team.maxSize}.`, { code: 'team-over-max', data: { size: team.length } });

  // Learning design: the starting team should need more than one style.
  const needs = new Set(team.map((a) => desiredStyle(def, a.stats[a.startStage].s, a.stats[a.startStage].m)));
  if (needs.size < 3) {
    add('warning', 'team', `The starting team needs only ${needs.size} leadership style${needs.size === 1 ? '' : 's'}`, 'Learners can do well without adapting. Aim for people in at least three of the four skill and morale quadrants.', { code: 'few-styles', data: { needs: [...needs] } });
  }

  // Actions
  const hireOn = def.actions.some((a) => a.enabled && a.mechanic === 'hire');
  if (hireOn && !def.actors.some((a) => a.pool === 'hire')) add('warning', 'actions', 'Hiring is on but the hiring pool is empty', 'Add candidates in Team, or switch off Hire member.', { code: 'hire-empty-pool' });
  const totalDays = weeks * def.timeline.daysPerWeek;
  for (const a of def.actions.filter((x) => x.enabled)) {
    for (const o of a.options) {
      if (a.mechanic === 'styleChoice' && !o.style) add('error', 'actions', `${a.name}: an option has no style`, 'Style choice actions judge the learner by the style of the option they pick.', { ref: { actionId: a.id }, code: 'option-no-style', data: { actionId: a.id, optionId: o.id } });
      if (o.cooldownDays >= totalDays) add('warning', 'actions', `${a.name}: can only be used once`, `The ${o.cooldownDays}-day wait is longer than the ${totalDays}-day simulation.`, { ref: { actionId: a.id }, code: 'cooldown-too-long', data: { actionId: a.id, optionId: o.id } });
      if (o.dayCost > def.timeline.daysPerWeek) add('error', 'actions', `${a.name}: takes longer than a week`, 'Actions must fit inside one week.', { ref: { actionId: a.id }, code: 'daycost-too-long', data: { actionId: a.id, optionId: o.id } });
      const needMessages = a.mechanic !== 'fire' && a.mechanic !== 'hire' && a.mechanic !== 'assess' ? (a.mechanic === 'reward' ? ['0', '1'] : ['0', '1', '2']) : [];
      for (const k of needMessages) {
        if (a.mechanic === 'performanceTrend' && k === '2') continue;
        if (a.mechanic === 'roleChange' && k === '1') continue;
        if (!o.outcomes[k]?.messages.length) {
          const label = outcomeLabel(a.mechanic, k);
          add('warning', 'actions', `${a.name}${a.options.length > 1 ? ` (${o.label})` : ''}: no response for "${label}"`, 'Learners who get this result see the nearest response that has text instead, which may not make sense.', { ref: { actionId: a.id, optionId: o.id }, code: 'missing-response', data: { actionId: a.id, optionId: o.id, outcome: k } });
        }
      }
    }
    if (a.mechanic === 'fire') {
      const i = a.options[0].outcomes['1'].impact;
      if (i.s >= 0 && i.m >= 0 && i.p >= 0) {
        add('warning', 'actions', 'Firing has no cost for the rest of the team', 'The model says everyone else reacts negatively, but the Mixed impact is zero. Learners can fire people without consequence.', {
          ref: { actionId: a.id },
          code: 'fire-no-cost',
          data: { actionId: a.id },
          fix: { label: 'Use a small negative reaction (-3 morale, -2 performance)', patch: (d) => { d.actions.find((x) => x.id === a.id).options[0].outcomes['1'].impact = { s: 0, m: -3, p: -2 }; } },
        });
      }
    }
    for (const k of ['1', '2']) {
      for (const o of a.options) {
        const i = o.outcomes[k]?.impact;
        if (a.mechanic === 'styleChoice' && i && i.s + i.m + i.p > 0) add('warning', 'actions', `${a.name}: a wrong style still helps`, `The ${k === '1' ? 'Mixed' : 'Negative'} outcome adds to skill, morale and performance.`, { ref: { actionId: a.id, optionId: o.id }, code: 'wrong-style-helps', data: { actionId: a.id, optionId: o.id, outcome: k } });
      }
    }
  }

  // Events
  for (const e of def.events) {
    if (!e.enabled) {
      if (e.week < 1) add('info', 'events', `${e.name} is not scheduled`, 'It is in the library but switched off. Schedule it on the timeline to use it.', { ref: { eventId: e.id }, code: 'event-unscheduled', data: { eventId: e.id } });
      continue;
    }
    if (e.week < 1 || e.week > weeks) add('error', 'events', `${e.name} is outside the simulation`, `It is set for week ${e.week}; the simulation has ${weeks} weeks.`, { ref: { eventId: e.id }, code: 'event-outside', data: { eventId: e.id } });
    if (e.day > def.timeline.daysPerWeek) add('error', 'events', `${e.name} falls on a day that does not exist`, `Day ${e.day} of a ${def.timeline.daysPerWeek}-day week.`, { ref: { eventId: e.id }, code: 'event-bad-day', data: { eventId: e.id } });
  }
  for (const t of def.triggers.filter((x) => x.enabled)) {
    const inside = t.windows.filter((w) => w.week <= weeks);
    if (!inside.length) add('warning', 'events', `${t.name} can never happen`, 'All of its check points are after the last week.', { ref: { triggerId: t.id }, code: 'trigger-never', data: { triggerId: t.id } });
    else if (inside.length < t.windows.length) add('info', 'events', `${t.name}: some check points are after the last week`, `${t.windows.length - inside.length} of ${t.windows.length} are ignored.`, { ref: { triggerId: t.id }, code: 'trigger-some-after', data: { triggerId: t.id } });
  }

  // Blanks and duplicates: the mistakes quick editing and AI rewrites produce most often.
  // Blanks are errors, so they block publishing.
  if (!String(def.context.industry ?? '').trim()) add('warning', 'story', 'Industry is empty', 'The industry names the world the simulation is set in and tells the health check which wording still belongs to the original storyline.', { ref: { field: 'context' }, code: 'industry-empty' });
  const REQUIRED_FIELDS = ['company', 'product', 'learner_role', 'ceo', 'city'];
  for (const e of def.context.entities) {
    if (!String(e.value ?? '').trim()) add(REQUIRED_FIELDS.includes(e.key) ? 'error' : 'warning', 'story', `${e.label || e.key} is empty`, 'Every sentence that uses this field would show a gap. Fill it in under Story and context.', { ref: { field: 'context', key: e.key }, code: 'entity-empty', data: { key: e.key } });
  }
  const dupes = (list, label) => {
    const seen = new Map();
    for (const x of list) {
      const k = String(x.name ?? '').trim().toLowerCase();
      if (!k) continue;
      seen.set(k, [...(seen.get(k) || []), x]);
    }
    return [...seen.values()].filter((g) => g.length > 1).map((g) => ({ name: g[0].name, count: g.length, label, first: g[0] }));
  };
  def.stages.forEach((st, i) => { if (!st.name?.trim()) add('error', 'funnel', `Stage ${i + 1} has no name`, 'Learners see stage names on every screen.', { ref: { stageId: st.id }, code: 'stage-no-name', data: { stageId: st.id } }); });
  for (const d of dupes(def.stages, 'stages')) add('error', 'funnel', `Two stages are called ${d.name}`, 'Learners cannot tell the stages apart. Give each stage its own name.', { ref: { stageId: d.first.id }, code: 'stage-dup', data: { name: d.name } });
  const people = def.actors.filter((a) => a.pool === 'team' || a.pool === 'hire');
  people.forEach((a) => { if (!a.name?.trim()) add('error', 'team', 'A team member has no name', 'Give every person a name; it appears in events, responses and the report.', { ref: { actorId: a.id }, code: 'actor-no-name', data: { actorId: a.id } }); });
  for (const d of dupes(people, 'people')) add('error', 'team', `${d.count} people are called ${d.name}`, 'Learners cannot tell them apart in events and responses. Give each person a different name.', { ref: { actorId: d.first.id }, code: 'actor-dup', data: { name: d.name } });
  const blank = (v) => !String(v ?? '').trim();
  if (blank(def.story.welcome)) add('error', 'story', 'The welcome letter is empty', 'It is the first thing learners read.', { ref: { field: 'welcome' }, code: 'story-empty', data: { field: 'welcome' } });
  if (blank(def.story.overview)) add('error', 'story', 'The product brief is empty', 'Learners read it before the first week.', { ref: { field: 'overview' }, code: 'story-empty', data: { field: 'overview' } });
  for (const e of def.events.filter((x) => x.enabled)) {
    if (blank(e.name)) add('error', 'events', 'An event has no title', `The event in week ${e.week} needs a title.`, { ref: { eventId: e.id }, code: 'event-no-title', data: { eventId: e.id } });
    if (blank(e.text)) add('error', 'events', `${e.name || 'An event'} has no text`, 'Learners would see an empty message.', { ref: { eventId: e.id }, code: 'event-no-text', data: { eventId: e.id } });
  }
  const enabledActions = def.actions.filter((a) => a.enabled);
  if (!enabledActions.length) add('error', 'actions', 'Every action is switched off', 'Learners would have nothing to do. Switch on at least the leadership actions.', { code: 'actions-all-off' });
  else if (!enabledActions.some((a) => a.mechanic === 'styleChoice')) add('error', 'actions', 'No leadership style action is switched on', 'The simulation measures leadership style through these actions. Switch on at least one.', { code: 'no-style-action' });
  for (const a of enabledActions) if (blank(a.name)) add('error', 'actions', 'An action has no name', 'Learners pick actions by name.', { ref: { actionId: a.id }, code: 'action-no-name', data: { actionId: a.id } });

  // Decision moments
  const dx = def.decisions;
  if (dx) {
    const pts = (dx.points || []).filter((p) => p.enabled !== false);
    const dpw = def.timeline.daysPerWeek;
    const ids = new Set((dx.points || []).map((p) => p.id));
    const flags = new Set();
    for (const p of dx.points || []) {
      for (const o of p.options || []) for (const f of o.consequences?.flags || []) flags.add(f);
      for (const oc of Object.values(p.outcomes || {})) for (const f of oc?.consequences?.flags || []) flags.add(f);
    }
    const peopleIds = new Set(def.actors.filter((a) => a.pool === 'team').map((a) => a.id));
    const name = (p) => String(p.title || 'A moment').replace(/\{\{\s*actor2?\s*\}\}/g, (m) => def.actors.find((a) => a.id === (m.includes('2') ? p.about2 : p.about))?.name || 'someone');
    const refOf = (p) => ({ dpId: p.id });
    if (!pts.length) add('info', 'decisions', 'No decision moments are switched on', 'Learners would only run the team. Decision moments are where they meet situations and are scored on their judgement.', { code: 'dp-none' });
    for (const p of pts) {
      const n = `"${name(p)}"`;
      if (p.week < 1 || p.week > weeks) add('error', 'decisions', `${n} is outside the simulation`, `It is set for week ${p.week}; the simulation has ${weeks} weeks.`, { ref: refOf(p), code: 'dp-outside', data: { dpId: p.id } });
      else if (p.day < 1 || p.day > dpw) add('error', 'decisions', `${n} falls on a day that does not exist`, `Day ${p.day} of a ${dpw}-day week.`, { ref: refOf(p), code: 'dp-outside', data: { dpId: p.id } });
      if (blank(p.situation) && !(p.variants || []).length) add('error', 'decisions', `${n} has no situation`, 'Learners would get a message with nothing in it.', { ref: refOf(p), code: 'dp-no-situation', data: { dpId: p.id } });
      if (blank(p.prompt)) add('warning', 'decisions', `${n} does not ask the learner anything`, 'Add the question the learner answers, e.g. "How do you reply?"', { ref: refOf(p), code: 'dp-no-prompt', data: { dpId: p.id } });
      if (p.type !== 'open' && (p.options || []).filter((o) => !blank(o.text)).length < 2) add('error', 'decisions', `${n} needs at least two options`, 'A choice needs something to choose between.', { ref: refOf(p), code: 'dp-few-options', data: { dpId: p.id } });
      if (p.type === 'multi' && (p.options || []).length && !(p.options || []).some((o) => o.correct)) add('error', 'decisions', `${n}: no option is marked right`, 'Multiple select is scored on the right options a learner picks. With none marked, every answer scores zero.', { ref: refOf(p), code: 'dp-multi-no-correct', data: { dpId: p.id } });
      if (p.type === 'open' && !(p.open?.keyIdeas || []).length) add('warning', 'decisions', `${n}: no key ideas to look for`, 'The evaluator scores open answers partly on the key ideas they cover. Without any, scores lean on general writing signals.', { ref: refOf(p), code: 'dp-no-ideas', data: { dpId: p.id } });
      const byBand = p.type !== 'single' && p.type !== 'scenario' || (p.options || []).some((o) => o.style);
      if (byBand && ['strong', 'mixed', 'weak'].some((b) => blank(p.outcomes?.[b]?.feedback))) add('warning', 'decisions', `${n}: coaching notes are missing`, 'Learners see a coach\'s note after each decision. Some bands have none, so they would see no feedback.', { ref: refOf(p), code: 'dp-no-feedback', data: { dpId: p.id } });
      const conds = [].concat(p.requires || [], ...(p.variants || []).map((v) => v.when || []));
      for (const c of conds) {
        const broken = (c.decision && !ids.has(c.decision)) || (c.flag && !flags.has(c.flag)) || (c.notFlag && !flags.has(c.notFlag)) || ((c.kpiBelow || c.kpiAbove) && !(dx.kpis || []).some((k) => k.id === (c.kpiBelow || c.kpiAbove).id));
        if (broken) { add('error', 'decisions', `${n} depends on something that no longer exists`, `Its condition refers to ${c.decision ? 'a deleted moment' : c.flag || c.notFlag ? `"${c.flag || c.notFlag}", which no choice sets any more` : 'a deleted KPI'}. It would ${c === p.requires ? 'never appear' : 'never use that variant'}.`, { ref: refOf(p), code: 'dp-bad-condition', data: { dpId: p.id } }); break; }
      }
      const who = [p.from?.actor, p.about, p.about2].filter(Boolean);
      if (who.some((id) => !peopleIds.has(id))) add('error', 'decisions', `${n} is about someone who is not on the team`, 'The person was removed or moved to the hiring pool. Choose someone on the starting team.', { ref: refOf(p), code: 'dp-bad-person', data: { dpId: p.id } });
    }
    const slots = new Map();
    for (const p of pts) if (!slots.has(p.slot || p.id)) slots.set(p.slot || p.id, p);
    const total = slots.size;
    const open = [...slots.values()].filter((p) => p.type === 'open').length;
    const target = dx.mix?.open ?? 30;
    const want = Math.round((total * target) / 100);
    if (total >= 3 && Math.abs(open - want) >= 1 && Math.abs(open / total - target / 100) > 0.12) add('warning', 'decisions', `The interaction mix is ${Math.round((open / total) * 100)}% open, the target is ${target}%`, `${open} of ${total} moments ask for an answer in the learner's own words; the target means about ${want}.`, { ref: { tab: 'moments' }, code: 'dp-mix-off', data: { open, want, total, target } });
    const w = def.scoring || {};
    if (Object.keys(w).length && !Object.values(w).some((v) => v > 0)) add('error', 'decisions', 'Every part of the final score is weighted zero', 'Learners would all score the same. Weight at least one part in Scoring and KPIs.', { ref: { tab: 'scoring' }, code: 'scoring-zero' });
    for (const r of def.learning?.reflections || []) if (def.learning.reflection !== false && (r.week < 1 || r.week > weeks)) add('warning', 'decisions', 'A reflection is set after the last week', `It is set for week ${r.week}; the simulation has ${weeks} weeks, so learners never see it.`, { ref: { tab: 'learning' }, code: 'reflection-outside', data: { id: r.id } });
  }

  // Numbers that are allowed but almost certainly a slip.
  if (def.funnel.target > 0 && def.meta.baseTarget > 0) {
    const ratio = def.funnel.target / def.meta.baseTarget;
    if (ratio < 0.2 || ratio > 5) add('warning', 'funnel', `A target of ${def.funnel.target} looks ${ratio < 1 ? 'too easy' : 'out of reach'}`, `The template is designed around about ${def.meta.baseTarget}. Run the balance check to see what a skilled leader reaches.`, { code: 'target-implausible' });
  } else if (def.funnel.target > 0 && def.funnel.target < 5) add('warning', 'funnel', `A target of ${def.funnel.target} looks too easy`, 'Run the balance check to see what a skilled leader reaches.', { code: 'target-implausible' });
  if (!(def.funnel.valuePerConversion > 0)) add('warning', 'funnel', 'Value per conversion is zero', 'Revenue on the dashboard and in the report would show as nothing.', { code: 'value-zero' });

  // Copy
  for (const t of collectTexts(def)) {
    if (LEGACY_MARKERS.some((re) => re.test(t.text))) add('error', t.section, `Missing copy: ${t.label}`, 'This text still holds a legacy placeholder. Write the learner-facing text.', { ref: t.ref, code: 'legacy-marker', data: { ref: t.ref } });
    const unknown = unknownTokens(def, t.text);
    if (unknown.length) add('error', t.section, `Unknown field in ${t.label}`, `{{${unknown.join('}}, {{')}}} is not a context field or a runtime field.`, { ref: t.ref, code: 'unknown-token', data: { ref: t.ref, tokens: unknown } });
  }
  if (String(def.context.industry ?? '').trim() && def.context.industry.trim().toLowerCase() !== def.context.originalIndustry.trim().toLowerCase()) {
    const bound = contextBoundItems(def);
    if (bound.length) add('warning', 'story', `${bound.length} item${bound.length === 1 ? '' : 's'} still describe the ${def.context.originalIndustry.toLowerCase()} world`, 'Names update automatically, but these situations need rewriting for the new industry. Open the rewrite list in Story.', { ref: { field: 'rewrite' }, code: 'industry-bound' });
  }

  // Assumptions carried from the migration
  const ack = new Set(def.meta.acknowledged || []);
  const open = (def.meta.assumptions || []).filter((a) => !ack.has(a.id));
  if (open.length) add('info', 'overview', `${open.length} migration assumption${open.length === 1 ? '' : 's'} to confirm`, 'Values the legacy documents did not specify. Review them on the Overview page.', { code: 'assumptions' });

  const order = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}

// Structural check for imported definitions: returns plain messages, empty when the shape is sound.
// The health check above assumes this shape, so imports must pass this first.
export function schemaProblems(def) {
  const out = [];
  const need = (cond, msg) => { if (!cond) out.push(msg); };
  const obj = (v) => v && typeof v === 'object' && !Array.isArray(v);
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const str = (v) => typeof v === 'string';
  const arr = (v, min = 0) => Array.isArray(v) && v.length >= min;
  if (!obj(def)) return ['This is not a JSON object.'];
  need(def.schema === 1, '"schema" must be 1.');
  need(obj(def.meta) && str(def.meta.templateId) && str(def.meta.name), '"meta" needs "templateId" and "name".');
  need(obj(def.context) && arr(def.context.entities) && def.context.entities.every((e) => obj(e) && str(e.key) && str(e.value ?? '')), '"context.entities" must be a list of { key, value }.');
  need(obj(def.context) && str(def.context.industry) && str(def.context.originalIndustry), '"context" needs "industry" and "originalIndustry".');
  need(obj(def.story) && str(def.story.welcome) && str(def.story.overview) && arr(def.story.briefing) && arr(def.story.walkthrough), '"story" needs "welcome", "overview", "briefing" and "walkthrough".');
  need(obj(def.timeline) && num(def.timeline.weeks) && def.timeline.weeks >= 1 && num(def.timeline.daysPerWeek), '"timeline" needs "weeks" and "daysPerWeek" as numbers.');
  need(obj(def.leadership) && arr(def.leadership.styles, 4), '"leadership.styles" must list the four styles.');
  need(arr(def.stages, 1) && def.stages.every((s) => obj(s) && str(s.id) && str(s.name) && num(s.conversion)), '"stages" must be a non-empty list of { id, name, conversion }.');
  need(obj(def.funnel) && arr(def.funnel.weeklyInflow) && num(def.funnel.target) && str(def.funnel.currency) && num(def.funnel.valuePerConversion), '"funnel" needs "weeklyInflow", "target", "currency" and "valuePerConversion".');
  need(obj(def.team) && num(def.team.maxSize), '"team.maxSize" must be a number.');
  const stageIds = new Set(arr(def.stages) ? def.stages.map((s) => s?.id) : []);
  need(arr(def.actors, 1) && def.actors.every((a) => obj(a) && str(a.id) && str(a.name) && str(a.pool) && obj(a.stats) && (a.pool !== 'team' || (stageIds.has(a.startStage) && obj(a.stats[a.startStage])))), '"actors" must be people with id, name, pool and stats for their starting stage.');
  need(arr(def.actions) && def.actions.every((a) => obj(a) && str(a.id) && str(a.mechanic) && arr(a.options, 1) && a.options.every((o) => obj(o) && obj(o.outcomes))), '"actions" must each have a mechanic and at least one option with outcomes.');
  need(arr(def.events) && def.events.every((e) => obj(e) && str(e.id) && num(e.week) && obj(e.impact)), '"events" must each have an id, a week and an impact.');
  need(arr(def.triggers) && def.triggers.every((t) => obj(t) && arr(t.windows)), '"triggers" must each have check points ("windows").');
  need(obj(def.randomness), '"randomness" is missing.');
  need(obj(def.report) && arr(def.report.competencies) && obj(def.report.objective) && obj(def.report.styleInsights), '"report" needs "competencies", "objective" and "styleInsights".');
  need(obj(def.delivery) && arr(def.delivery.languages), '"delivery.languages" is missing.');
  return out;
}

export function healthSummary(issues) {
  return {
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    infos: issues.filter((i) => i.severity === 'info').length,
  };
}
