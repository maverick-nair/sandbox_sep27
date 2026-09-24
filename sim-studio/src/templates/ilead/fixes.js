// Suggested fixes for every health check. Each suggestion is a ready answer the author can apply
// as it is, or change first: a one-line summary, the values it will write (editable fields,
// pre-filled with the best draft we can make from the simulation itself), and apply().
//
// Suggestion shape:
//   { summary, note?, fields: [{ key, label, type, value, options?, rows?, min?, max? }], apply(def, values), genie? }
//   type: 'text' | 'textarea' | 'number' | 'select' | 'toggle' | 'checklist'
//   genie: { field, prompt(values) } lets the Studio offer "Rewrite with Genie" for a text field.
import { createIleadDefinition } from './index.js';
import { proposeContext, locationPack, suggestOfferingName } from './contextualize.js';
import { draftBio } from './insights.js';
import { desiredStyle } from '../../engine/engine.js';
import { collectTexts, findTokens, knownTokenKeys } from '../../engine/text.js';
import { OUTCOME_LABELS, outcomeLabel } from '../../engine/validate.js';
import { setTextAt } from '../../engine/authoring.js';
import { refKey } from './contextualize.js';

let original = null;
const orig = () => (original ||= createIleadDefinition());

export { OUTCOME_LABELS, outcomeLabel };

// Drafted learner-facing responses, written for the mechanic, the option and the outcome.
// Tokens are filled at run time: {{actor}} is the team member, {{he}}/{{his}}/{{him}} follow their pronouns.
export function draftResponse(action, option, outcome) {
  const what = (option?.label || action.name).toLowerCase();
  const m = action.mechanic;
  if (m === 'performanceTrend') {
    const praise = /congrat|appreciat|thank|prais/i.test(option?.label || '');
    if (praise) return outcome === '0'
      ? '{{actor}} is delighted by your note. {{He}} has been working hard to lift {{his}} numbers and it feels good to be noticed.'
      : '{{actor}} is surprised by your congratulations. {{His}} results have been slipping, and the praise feels hollow to {{him}} and to the rest of the team.';
    return outcome === '0'
      ? '{{actor}} takes your warning seriously. {{He}} knows {{his}} numbers have been slipping and promises to turn things around.'
      : '{{actor}} is confused by your warning. {{His}} numbers have been improving, and {{he}} feels {{his}} effort has gone unnoticed.';
  }
  if (m === 'reward') return outcome === '0'
    ? '{{actor}} is pleased to be recognised in front of the team. {{He}} is keen to keep up the good work.'
    : 'The team notices that {{top_performer}} was passed over. Some of them wonder what it takes to be recognised here.';
  if (m === 'training') return {
    0: '{{actor}} comes back from the {{what}} full of ideas and puts them to work straight away.',
    1: '{{actor}} found parts of the {{what}} useful, but some of it was not what {{he}} needed right now.',
    2: '{{actor}} did not get much from the {{what}}. {{He}} would rather have spent the time with customers.',
  }[outcome].replace('{{what}}', what);
  if (m === 'roleChange') return {
    0: '{{actor}} settles quickly into {{his}} new role in {{stage}} and seems to enjoy the change.',
    1: '{{actor}} takes the move in {{his}} stride. It is too early to say whether it suits {{him}}.',
    2: '{{actor}} struggles in {{his}} new role in {{stage}} and misses the work {{he}} knew.',
  }[outcome];
  if (m === 'fire') return 'The team is shaken by the news. People are quieter than usual and wonder who might be next.';
  // Style choices: the meeting, email, goal setting, coaching, feedback and team activities.
  return {
    0: `{{actor}} responds well to the ${what} approach. {{He}} leaves with a clear next step and more confidence.`,
    1: `{{actor}} goes along with the ${what} approach, but it is not quite what {{he}} needed. It helps a little.`,
    2: `The ${what} approach does not land with {{actor}}. {{He}} seems frustrated, and it shows in {{his}} work.`,
  }[outcome];
}

const levenshtein = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
};

const entityLabel = (def, key) => def.context.entities.find((e) => e.key === key)?.label || key;
const textAt = (def, ref) => collectTexts(def).find((t) => refKey(t.ref) === refKey(ref))?.text ?? '';
const styleName = (def, id) => def.leadership.styles.find((s) => s.id === id)?.name || id;
const team = (def) => def.actors.filter((a) => a.pool === 'team');

// Builds every suggestion for a list of issues. Shared drafts (a fresh tailoring of the current
// profile) are computed once.
export function suggestFixes(def, issues) {
  let tailored;
  const draft = () => {
    if (tailored) return tailored;
    const profile = { ...(def.context.profile || {}), depth: 'deep' };
    const byTarget = new Map();
    try { for (const p of proposeContext(def, profile)) byTarget.set(p.id, p.after); } catch { /* no profile */ }
    tailored = { profile, byTarget, loc: (() => { try { return locationPack(profile); } catch { return null; } })() };
    return tailored;
  };
  const out = {};
  for (const i of issues) {
    try { out[i.id] = suggest(def, i, draft); } catch { out[i.id] = null; }
  }
  return out;
}

function suggest(def, issue, draft) {
  const d = issue.data || {};
  const weeks = def.timeline.weeks;
  const dpw = def.timeline.daysPerWeek;
  const o = orig();
  switch (issue.code) {
    case 'stage-empty': {
      const st = def.stages.find((s) => s.id === d.stageId);
      // Take someone from the most crowded stage, preferring the person who suits the empty stage best.
      const counts = Object.fromEntries(def.stages.map((s) => [s.id, team(def).filter((a) => a.startStage === s.id).length]));
      const movable = team(def).filter((a) => counts[a.startStage] > 1).sort((a, b) => (counts[b.startStage] - counts[a.startStage]) || ((b.stats[d.stageId]?.p ?? 0) - (a.stats[d.stageId]?.p ?? 0)));
      const pick = movable[0] || team(def)[0];
      if (!pick) return null;
      return {
        summary: `Move ${pick.name} to ${st.name}`,
        note: 'They start the simulation in this stage, with the skill and morale they already have for it.',
        fields: [{ key: 'actorId', label: `Who starts in ${st.name}`, type: 'select', value: pick.id, options: (movable.length ? movable : team(def)).map((a) => ({ value: a.id, label: `${a.name} (now in ${def.stages.find((s) => s.id === a.startStage)?.name})` })) }],
        apply: (x, v) => { const a = x.actors.find((y) => y.id === v.actorId); if (a) a.startStage = d.stageId; },
      };
    }
    case 'conversion-range': {
      const st = def.stages.find((s) => s.id === d.stageId);
      const was = o.stages.find((s) => s.id === d.stageId)?.conversion ?? 0.3;
      return {
        summary: `Set ${st.name} to pass on ${Math.round(was * 100)}% of its work`,
        fields: [{ key: 'pct', label: 'Share passed to the next stage (%)', type: 'number', value: Math.round(was * 100), min: 1, max: 100 }],
        apply: (x, v) => { x.stages.find((s) => s.id === d.stageId).conversion = Math.max(1, Math.min(100, Number(v.pct))) / 100; },
      };
    }
    case 'styles-combos':
      return {
        summary: 'Restore the standard mapping: Directing, Guiding, Partnering, Entrusting',
        note: 'Style names and colours you changed are kept; only the skill and morale each style answers to is reset.',
        fields: [],
        apply: (x) => { x.leadership.styles.forEach((s, i) => { const src = o.leadership.styles.find((y) => y.id === s.id) || o.leadership.styles[i]; if (src) { s.skill = src.skill; s.morale = src.morale; } }); },
      };
    case 'no-target':
    case 'target-implausible': {
      const t = def.meta.baseTarget || o.funnel.target;
      return {
        summary: `Set the target to ${t} conversions`,
        note: 'This is the number the template is designed around for this length. The balance check can confirm it or suggest a better one.',
        fields: [{ key: 'target', label: 'Target (conversions)', type: 'number', value: t, min: 1, max: 5000 }],
        apply: (x, v) => { x.funnel.target = Math.max(1, Math.round(Number(v.target))); },
      };
    }
    case 'inflow-length':
      return {
        summary: `Give each of the ${weeks} weeks a lead inflow`,
        note: 'Missing weeks repeat the last week; extra weeks are dropped.',
        fields: [],
        apply: (x) => { x.funnel.weeklyInflow = Array.from({ length: weeks }, (_, i) => x.funnel.weeklyInflow[i] ?? x.funnel.weeklyInflow.at(-1) ?? 200); },
      };
    case 'team-over-max':
      return {
        summary: `Allow a team of up to ${d.size + 2}`,
        note: 'Leaves room for the learner to hire two people.',
        fields: [{ key: 'max', label: 'Maximum team size', type: 'number', value: d.size + 2, min: d.size, max: 30 }],
        apply: (x, v) => { x.team.maxSize = Math.max(d.size, Math.round(Number(v.max))); },
      };
    case 'few-styles': {
      const needs = new Set(d.needs);
      const missing = def.leadership.styles.filter((s) => !needs.has(s.id));
      const byNeed = {};
      for (const a of team(def)) { const n = desiredStyle(def, a.stats[a.startStage].s, a.stats[a.startStage].m); (byNeed[n] ||= []).push(a); }
      const crowded = Object.values(byNeed).sort((a, b) => b.length - a.length)[0] || [];
      const who = crowded[crowded.length - 1] || team(def)[0];
      const style = missing[0];
      if (!who || !style) return null;
      const high = def.leadership.highThreshold || 70;
      const level = (lvl) => (lvl === 'high' ? high + 10 : Math.max(10, high - 30));
      return {
        summary: `Make ${who.name} someone who needs ${style.name}`,
        note: `Adjusts their starting skill and morale so the team needs ${needs.size + 1} different styles. Their profile is rewritten to match.`,
        fields: [
          { key: 'actorId', label: 'Team member', type: 'select', value: who.id, options: team(def).map((a) => ({ value: a.id, label: `${a.name} (needs ${styleName(def, desiredStyle(def, a.stats[a.startStage].s, a.stats[a.startStage].m))})` })) },
          { key: 'style', label: 'Style they should need', type: 'select', value: style.id, options: missing.map((s) => ({ value: s.id, label: s.name })) },
          { key: 'bio', label: 'Rewrite their profile to match', type: 'toggle', value: true },
        ],
        apply: (x, v) => {
          const a = x.actors.find((y) => y.id === v.actorId);
          const s = x.leadership.styles.find((y) => y.id === v.style);
          if (!a || !s) return;
          a.stats[a.startStage] = { ...a.stats[a.startStage], s: level(s.skill), m: level(s.morale) };
          if (v.bio) a.bio = draftBio(a, high);
        },
      };
    }
    case 'hire-empty-pool': {
      const pool = o.actors.filter((a) => a.pool === 'hire');
      return {
        summary: pool.length ? `Add the template's ${pool.length} candidates` : 'Switch off Hire member',
        fields: [{ key: 'how', label: 'Fix', type: 'select', value: pool.length ? 'restore' : 'off', options: [...(pool.length ? [{ value: 'restore', label: `Add the template's ${pool.length} candidates` }] : []), { value: 'off', label: 'Switch off Hire member' }] }],
        apply: (x, v) => {
          if (v.how === 'restore') { const have = new Set(x.actors.map((a) => a.id)); x.actors.push(...pool.filter((a) => !have.has(a.id)).map((a) => JSON.parse(JSON.stringify(a)))); }
          else x.actions.filter((a) => a.mechanic === 'hire').forEach((a) => { a.enabled = false; });
        },
      };
    }
    case 'option-no-style': {
      const a = def.actions.find((y) => y.id === d.actionId);
      const opt = a.options.find((y) => y.id === d.optionId);
      const guess = def.leadership.styles.find((s) => new RegExp(s.name, 'i').test(`${opt.label} ${opt.text || ''}`)) || def.leadership.styles[0];
      return {
        summary: `Judge "${opt.label}" as ${guess.name}`,
        fields: [{ key: 'style', label: 'This option is', type: 'select', value: guess.id, options: def.leadership.styles.map((s) => ({ value: s.id, label: s.name })) }],
        apply: (x, v) => { x.actions.find((y) => y.id === d.actionId).options.find((y) => y.id === d.optionId).style = v.style; },
      };
    }
    case 'cooldown-too-long': {
      const days = Math.max(dpw, Math.floor((weeks * dpw) / 3));
      return {
        summary: `Allow it again after ${days} days`,
        note: 'About three times in a run, so learners can try it more than once.',
        fields: [{ key: 'days', label: 'Days before it can be used again', type: 'number', value: days, min: 0, max: weeks * dpw - 1 }],
        apply: (x, v) => { x.actions.find((y) => y.id === d.actionId).options.find((y) => y.id === d.optionId).cooldownDays = Math.max(0, Math.round(Number(v.days))); },
      };
    }
    case 'daycost-too-long':
      return {
        summary: `Make it take ${Math.min(3, dpw)} days`,
        fields: [{ key: 'days', label: 'Days it takes', type: 'number', value: Math.min(3, dpw), min: 1, max: dpw }],
        apply: (x, v) => { x.actions.find((y) => y.id === d.actionId).options.find((y) => y.id === d.optionId).dayCost = Math.max(1, Math.min(dpw, Math.round(Number(v.days)))); },
      };
    case 'missing-response': {
      const a = def.actions.find((y) => y.id === d.actionId);
      const opt = a.options.find((y) => y.id === d.optionId);
      const label = outcomeLabel(a.mechanic, d.outcome);
      const text = draftResponse(a, opt, d.outcome);
      return {
        summary: `Add a response for "${label}"`,
        note: `Shown when the learner uses ${a.name}${a.options.length > 1 ? ` (${opt.label})` : ''} and the result is "${label.toLowerCase()}". {{actor}} and {{he}} are filled in for each person.`,
        fields: [{ key: 'text', label: 'Response the learner sees', type: 'textarea', value: text, rows: 3 }],
        apply: (x, v) => {
          const o2 = x.actions.find((y) => y.id === d.actionId).options.find((y) => y.id === d.optionId);
          o2.outcomes[d.outcome] ||= { messages: [], impact: { s: 0, m: 0, p: 0 } };
          if (String(v.text).trim()) o2.outcomes[d.outcome].messages.push(String(v.text).trim());
        },
        genie: { field: 'text', prompt: (v) => `Rewrite this response for a leadership simulation. It is shown when a sales team leader uses "${a.name}${a.options.length > 1 ? ` (${opt.label})` : ''}" with a team member and the result is "${label}". Keep the tokens {{actor}}, {{he}}, {{his}}, {{him}} exactly as written. Plain English, no em dashes, one or two sentences. Draft: ${v.text}` },
      };
    }
    case 'fire-no-cost':
      return {
        summary: 'When someone is fired, the rest of the team loses 3 morale and 2 performance',
        fields: [
          { key: 'm', label: 'Morale change for the rest of the team', type: 'number', value: -3, min: -20, max: 0 },
          { key: 'p', label: 'Performance change', type: 'number', value: -2, min: -20, max: 0 },
        ],
        apply: (x, v) => { x.actions.find((y) => y.id === d.actionId).options[0].outcomes['1'].impact = { s: 0, m: Math.min(0, Number(v.m)), p: Math.min(0, Number(v.p)) }; },
      };
    case 'wrong-style-helps': {
      const mixed = d.outcome === '1';
      const def0 = mixed ? { s: 0, m: -2, p: -1 } : { s: -1, m: -4, p: -3 };
      return {
        summary: `Make the ${mixed ? '"partly fits"' : '"wrong style"'} result cost a little: morale ${def0.m}, performance ${def0.p}`,
        note: 'A wrong read should never help more than doing nothing, or learners stop adapting.',
        fields: [
          { key: 's', label: 'Skill', type: 'number', value: def0.s, min: -20, max: 0 },
          { key: 'm', label: 'Morale', type: 'number', value: def0.m, min: -20, max: 0 },
          { key: 'p', label: 'Performance', type: 'number', value: def0.p, min: -20, max: 0 },
        ],
        apply: (x, v) => { x.actions.find((y) => y.id === d.actionId).options.find((y) => y.id === d.optionId).outcomes[d.outcome].impact = { s: Math.min(0, Number(v.s)), m: Math.min(0, Number(v.m)), p: Math.min(0, Number(v.p)) }; },
      };
    }
    case 'event-unscheduled': {
      const w = Math.ceil(weeks / 2);
      return {
        summary: `Schedule it in week ${w}`,
        note: 'Optional. Leave it in the library if you do not need it.',
        fields: [{ key: 'week', label: 'Week', type: 'number', value: w, min: 1, max: weeks }],
        apply: (x, v) => { const e = x.events.find((y) => y.id === d.eventId); e.week = Math.max(1, Math.min(weeks, Math.round(Number(v.week)))); e.day ||= 1; e.enabled = true; },
      };
    }
    case 'event-outside': {
      const e = def.events.find((y) => y.id === d.eventId);
      const w = Math.max(1, Math.min(weeks, e.week));
      return {
        summary: `Move it to week ${w}`,
        fields: [{ key: 'week', label: 'Week', type: 'number', value: w, min: 1, max: weeks }],
        apply: (x, v) => { x.events.find((y) => y.id === d.eventId).week = Math.max(1, Math.min(weeks, Math.round(Number(v.week)))); },
      };
    }
    case 'event-bad-day':
      return {
        summary: `Move it to day ${dpw}`,
        fields: [{ key: 'day', label: 'Day of the week', type: 'number', value: dpw, min: 1, max: dpw }],
        apply: (x, v) => { x.events.find((y) => y.id === d.eventId).day = Math.max(1, Math.min(dpw, Math.round(Number(v.day)))); },
      };
    case 'trigger-never':
    case 'trigger-some-after': {
      const t = def.triggers.find((y) => y.id === d.triggerId);
      const last = Math.max(...t.windows.map((w) => w.week));
      const squeeze = issue.code === 'trigger-never';
      return {
        summary: squeeze ? `Spread its check points across the ${weeks} weeks` : `Drop the ${t.windows.filter((w) => w.week > weeks).length} check points after week ${weeks}`,
        fields: [],
        apply: (x) => {
          const tr = x.triggers.find((y) => y.id === d.triggerId);
          if (squeeze) tr.windows = tr.windows.map((w) => ({ ...w, week: Math.max(1, Math.round((w.week * weeks) / last)) }));
          else tr.windows = tr.windows.filter((w) => w.week <= weeks);
        },
      };
    }
    case 'legacy-marker': {
      const text = textAt(def, d.ref);
      const cleaned = text
        .replace(/PLACEHOLDER_ACTOR_NAME/g, '{{actor}}').replace(/PLACEHOLDER_[A-Z_]+/g, '')
        .replace(/NO STRING AVAILABLE\.?/gi, '').replace(/\s{2,}/g, ' ').trim();
      return {
        summary: 'Replace the placeholder with learner-facing text',
        fields: [{ key: 'text', label: 'Text', type: 'textarea', value: cleaned || 'Write the text learners should see here.', rows: 3 }],
        apply: (x, v) => setTextAt(x, d.ref, String(v.text)),
      };
    }
    case 'unknown-token': {
      const text = textAt(def, d.ref);
      const known = [...knownTokenKeys(def)];
      let fixed = text;
      const swaps = [];
      for (const tk of d.tokens) {
        const best = known.map((k) => [k, levenshtein(tk.toLowerCase(), k.toLowerCase())]).sort((a, b) => a[1] - b[1])[0];
        const to = best && best[1] <= Math.max(2, Math.floor(tk.length / 3)) ? `{{${best[0]}}}` : entityLabel(def, tk).replace(/_/g, ' ');
        swaps.push(`{{${tk}}} with ${to}`);
        fixed = fixed.split(new RegExp(`\\{\\{\\s*${tk}\\s*\\}\\}`, 'g')).join(to);
      }
      return {
        summary: `Replace ${swaps.join(', ')}`,
        fields: [{ key: 'text', label: 'Text', type: 'textarea', value: fixed, rows: 3 }],
        apply: (x, v) => setTextAt(x, d.ref, String(v.text)),
      };
    }
    case 'industry-bound': {
      const terms = (def.context.boundTerms || []).filter(Boolean);
      const p = def.context.profile || {};
      const guess = { elevator: p.offeringCategory || 'product', 'high-rise': 'customer site', microprocessor: 'technology', 'tablet PC': 'device' };
      const items = collectTexts(def).filter((t) => terms.some((term) => t.text.toLowerCase().includes(term.toLowerCase())));
      return {
        summary: `Swap old-industry words in ${items.length} item${items.length === 1 ? '' : 's'}`,
        note: 'A quick first pass. Leave a box empty to keep that word. Genie can rewrite these more naturally from the rewrite list in Story.',
        fields: terms.map((term) => ({ key: term, label: `Replace "${term}" with`, type: 'text', value: guess[term] ?? '' })),
        apply: (x, v) => {
          for (const it of collectTexts(x)) {
            let t = it.text;
            for (const term of terms) {
              const to = String(v[term] ?? '').trim();
              if (!to) continue;
              t = t.replace(new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), (m) => (m[0] === m[0].toUpperCase() ? to.charAt(0).toUpperCase() + to.slice(1) : to));
            }
            if (t !== it.text) setTextAt(x, it.ref, t);
          }
          const left = terms.filter((term) => !String(v[term] ?? '').trim());
          x.context.boundTerms = left;
        },
      };
    }
    case 'assumptions': {
      const ack = new Set(def.meta.acknowledged || []);
      const open = (def.meta.assumptions || []).filter((a) => !ack.has(a.id));
      return {
        summary: `Accept the ${open.length} migration assumption${open.length === 1 ? '' : 's'} as they are`,
        note: 'Untick any you want to question; they stay on the Overview page.',
        fields: [{ key: 'ids', label: 'Accept', type: 'checklist', value: open.map((a) => a.id), options: open.map((a) => ({ value: a.id, label: a.text })) }],
        apply: (x, v) => { x.meta.acknowledged = [...new Set([...(x.meta.acknowledged || []), ...(v.ids || [])])]; },
      };
    }
    case 'industry-empty': {
      const t = draft();
      const value = t.byTarget.get('industry') || def.context.originalIndustry || 'Sales';
      return {
        summary: `Use "${value}"`,
        fields: [{ key: 'value', label: 'Industry', type: 'text', value }],
        apply: (x, v) => { x.context.industry = String(v.value).trim(); },
      };
    }
    case 'entity-empty': {
      const t = draft();
      const p = t.profile;
      const fromProfile = { company: p.orgName, product: p.offeringName || suggestOfferingName(p), learner_role: p.learnerRole, city: p.city || t.loc?.cities?.[0], ceo: t.loc?.ceo };
      const value = fromProfile[d.key] || t.byTarget.get(`entity:${d.key}`) || o.context.entities.find((e) => e.key === d.key)?.value || '';
      return {
        summary: value ? `Use "${value}"` : `Fill in ${entityLabel(def, d.key)}`,
        fields: [{ key: 'value', label: entityLabel(def, d.key), type: 'text', value }],
        apply: (x, v) => { const e = x.context.entities.find((y) => y.key === d.key); if (e) e.value = String(v.value).trim(); },
      };
    }
    case 'stage-no-name':
    case 'stage-dup': {
      const t = draft();
      const target = issue.code === 'stage-no-name' ? def.stages.find((s) => s.id === d.stageId) : def.stages.filter((s) => s.name.trim().toLowerCase() === String(d.name).trim().toLowerCase())[1];
      if (!target) return null;
      const taken = new Set(def.stages.filter((s) => s !== target).map((s) => s.name.trim().toLowerCase()));
      const cands = [t.byTarget.get(`stage:${target.id}:name`), o.stages.find((s) => s.id === target.id)?.name, `Stage ${def.stages.indexOf(target) + 1}`].filter(Boolean);
      const value = cands.find((c) => !taken.has(c.toLowerCase())) || `${cands[0]} 2`;
      return {
        summary: `Call stage ${def.stages.indexOf(target) + 1} "${value}"`,
        fields: [{ key: 'name', label: `Name of stage ${def.stages.indexOf(target) + 1}`, type: 'text', value }],
        apply: (x, v) => { x.stages.find((s) => s.id === target.id).name = String(v.name).trim(); },
      };
    }
    case 'actor-no-name':
    case 'actor-dup': {
      const t = draft();
      const people = def.actors.filter((a) => a.pool === 'team' || a.pool === 'hire');
      const target = issue.code === 'actor-no-name' ? people.find((a) => a.id === d.actorId) : people.filter((a) => a.name.trim().toLowerCase() === String(d.name).trim().toLowerCase())[1];
      if (!target) return null;
      const used = new Set(def.actors.map((a) => a.name.trim().toLowerCase()));
      const pool = (t.loc?.names?.[target.pronoun] || [...(t.loc?.names?.she || []), ...(t.loc?.names?.he || [])]).concat(o.actors.map((a) => a.name));
      const value = pool.find((n) => !used.has(n.toLowerCase())) || `${target.name || 'Team member'} 2`;
      return {
        summary: `Rename ${target.name ? `the second ${target.name}` : 'them'} to ${value}`,
        note: `This is the person in ${def.stages.find((s) => s.id === target.startStage)?.name || 'the hiring pool'}${target.experience ? ` with ${target.experience}` : ''}.`,
        fields: [{ key: 'name', label: 'Name', type: 'text', value }],
        apply: (x, v) => {
          const a = x.actors.find((y) => y.id === target.id);
          const old = a.name;
          a.name = String(v.name).trim();
          if (old) a.bio = String(a.bio || '').split(old.split(' ')[0]).join(a.name.split(' ')[0]);
        },
      };
    }
    case 'story-empty': {
      const t = draft();
      const value = t.byTarget.get(`story:${d.field}`) || o.story[d.field] || '';
      return {
        summary: d.field === 'welcome' ? 'Use the drafted welcome letter' : 'Use the drafted product brief',
        note: 'Drafted for your organization and industry. Edit it here or later.',
        fields: [{ key: 'text', label: d.field === 'welcome' ? 'Welcome letter' : 'Product brief', type: 'textarea', value, rows: 8 }],
        apply: (x, v) => { x.story[d.field] = String(v.text); },
      };
    }
    case 'event-no-title':
    case 'event-no-text': {
      const t = draft();
      const field = issue.code === 'event-no-title' ? 'name' : 'text';
      const e = def.events.find((y) => y.id === d.eventId);
      const value = t.byTarget.get(`event:${d.eventId}:${field}`) || o.events.find((y) => y.id === d.eventId)?.[field] || (field === 'name' ? `Week ${e.week} event` : 'Something unexpected happens this week, and the team feels the pressure.');
      return {
        summary: field === 'name' ? `Title it "${value}"` : 'Use the drafted event text',
        fields: [{ key: 'value', label: field === 'name' ? 'Event title' : 'What learners read', type: field === 'name' ? 'text' : 'textarea', value, rows: 3 }],
        apply: (x, v) => { x.events.find((y) => y.id === d.eventId)[field] = String(v.value); },
      };
    }
    case 'actions-all-off':
    case 'no-style-action': {
      const ids = o.actions.filter((a) => a.enabled && (issue.code === 'actions-all-off' ? a.mechanic !== 'fire' : a.mechanic === 'styleChoice')).map((a) => a.id);
      return {
        summary: issue.code === 'actions-all-off' ? `Switch on the template's ${ids.length} standard actions` : 'Switch on the leadership style actions',
        note: issue.code === 'actions-all-off' ? 'Firing stays off; switch it on in Actions if you want it.' : undefined,
        fields: [{ key: 'ids', label: 'Switch on', type: 'checklist', value: ids, options: ids.map((id) => ({ value: id, label: def.actions.find((a) => a.id === id)?.name || id })) }],
        apply: (x, v) => { for (const a of x.actions) if ((v.ids || []).includes(a.id)) a.enabled = true; },
      };
    }
    case 'action-no-name': {
      const value = o.actions.find((a) => a.id === d.actionId)?.name || 'Action';
      return {
        summary: `Call it "${value}"`,
        fields: [{ key: 'name', label: 'Action name', type: 'text', value }],
        apply: (x, v) => { x.actions.find((a) => a.id === d.actionId).name = String(v.name).trim(); },
      };
    }
    case 'value-zero': {
      const t = draft();
      const value = t.byTarget.get('funnel:valuePerConversion') || o.funnel.valuePerConversion;
      return {
        summary: `Set each conversion to ${def.funnel.currency} ${Number(value).toLocaleString('en')}`,
        fields: [{ key: 'value', label: `Value per conversion (${def.funnel.currency})`, type: 'number', value, min: 1 }],
        apply: (x, v) => { x.funnel.valuePerConversion = Math.max(1, Number(v.value)); },
      };
    }
    default:
      return issue.fix ? { summary: issue.fix.label, fields: [], apply: (x) => issue.fix.patch(x) } : null;
  }
}

// Applies suggestions as they are, on a copy. Fixing one thing can reveal the next (switching
// actions back on shows their missing responses), so it repeats until nothing more can be fixed.
export function applyAllSuggested(def, validate, severities = ['error', 'warning'], passes = 4) {
  let x = JSON.parse(JSON.stringify(def));
  let applied = 0;
  for (let n = 0; n < passes; n++) {
    const list = validate(x).filter((i) => severities.includes(i.severity));
    const sugs = suggestFixes(x, list);
    const next = JSON.parse(JSON.stringify(x));
    let round = 0;
    for (const i of list) {
      const sg = sugs[i.id];
      if (!sg) continue;
      try { sg.apply(next, Object.fromEntries(sg.fields.map((f) => [f.key, f.value]))); round += 1; } catch { /* skip one that no longer applies */ }
    }
    if (!round || JSON.stringify(next) === JSON.stringify(x)) break;
    x = next;
    applied += round;
  }
  return { def: x, applied, left: validate(x).filter((i) => severities.includes(i.severity)) };
}

export { findTokens };
