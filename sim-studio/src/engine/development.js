// The developmental view of a learner's run: overall profile, each competency's level with the
// evidence behind it, strengths to build on, the development priorities and a 70-20-10 plan,
// drawn from the author's development content. Also the prompt Genie uses to personalise the
// narrative, and the check its answer must pass.
import { LEVELS } from '../templates/ilead/development.js';
import { renderText } from './text.js';

export const levelOf = (score) => (score <= 2 ? 0 : score <= 4 ? 1 : score <= 6 ? 2 : score <= 8 ? 3 : 4);
const pct = (v) => `${Math.round(v * 100)}%`;
const r0 = (v) => Math.round(v);

function evidenceFor(def, state, report, id) {
  const count = (aid) => report.actions.find((a) => a.id === aid)?.count || 0;
  const impact = (aid) => report.actions.find((a) => a.id === aid)?.impact;
  const s = report.start, e = report.end;
  const pr = report.progress;
  const left = Object.values(state.actors).filter((a) => a.status === 'left').map((a) => a.name);
  const cur = def.funnel.currency === 'USD' ? '$' : `${def.funnel.currency || ''} `;
  const money = (v) => `${v < 0 ? '−' : ''}${cur}${Math.abs(r0(v)).toLocaleString('en')}`;
  switch (id) {
    case 'upskill': return [
      `Team skill moved from ${r0(s.s)} to ${r0(e.s)}.`,
      `You sent people for training ${count('training')} time${count('training') === 1 ? '' : 's'}${count('training') ? ` (impact: ${impact('training').toLowerCase()})` : ''} and coached ${count('coach')} time${count('coach') === 1 ? '' : 's'}.`,
    ];
    case 'motivate': return [
      `Team morale moved from ${r0(s.m)} to ${r0(e.m)}.`,
      `You rewarded people ${count('reward')} time${count('reward') === 1 ? '' : 's'}, energised the team ${count('energise')} time${count('energise') === 1 ? '' : 's'} and gave feedback ${count('feedback')} time${count('feedback') === 1 ? '' : 's'}.`,
      left.length ? `${left.join(', ')} left the team.` : 'Nobody left the team.',
    ];
    case 'enable': return [
      `Team performance moved from ${r0(s.p)} to ${r0(e.p)}.`,
      `You changed roles ${count('reassign')} time${count('reassign') === 1 ? '' : 's'} and set goals ${count('set-goals')} time${count('set-goals') === 1 ? '' : 's'}.`,
    ];
    case 'adapt': {
      const n = state.log.intents.length;
      const right = state.log.intents.filter((i) => i.diff === 0).length;
      return [
        `You chose the style a person needed in ${right} of ${n} weekly choices (${pct(report.accuracy)}).`,
        report.dominant ? `Your most used style was ${report.dominant}.` : 'You did not settle into one style.',
        report.consistencyPct?.desiredVsActual !== null && report.consistencyPct?.desiredVsActual !== undefined ? `The styles you used through your actions deviated ${report.consistencyPct.desiredVsActual}% from what people needed.` : null,
      ].filter(Boolean);
    }
    case 'results': return [
      `${pr.metric?.label || 'Result'}: ${money(pr.metric?.value ?? pr.revenue)} against a target of ${money(pr.metric?.target ?? report.revenueTarget)} (${pct(pr.achieved)}).`,
      `${pr.conversions.toFixed(1)} of ${pr.target} conversions${pr.finance ? `, operating profit ${money(pr.finance.operatingProfit)} after ${money(pr.finance.actionSpend)} spent on actions` : ''}.`,
    ];
    default: return [];
  }
}

export function buildDevelopment(def, state, report) {
  const D = def.report.development || {};
  const T = (t) => renderText(def, t || '');
  const scale = D.scale || [];
  const comps = report.competencies.map((c) => {
    const li = levelOf(c.score);
    const cd = D.competencies?.[c.id] || {};
    const lv = cd.levels?.[LEVELS[li]] || {};
    const next = li < 4 ? cd.levels?.[LEVELS[li + 1]] : null;
    return {
      id: c.id, name: c.name, score: c.score, levelIndex: li, level: scale[li]?.label || LEVELS[li], observed: c.text,
      definition: T(cd.definition), why: T(cd.why),
      looksLike: T(lv.looksLike), nextLevel: next ? { label: scale[li + 1]?.label || LEVELS[li + 1], looksLike: T(next.looksLike) } : null,
      keep: T(lv.keep), workOn: T(lv.workOn), plan: { on70: T(lv.on70), social20: T(lv.social20), formal10: T(lv.formal10) }, reflect: T(lv.reflect),
      products: (cd.products || []).map((p) => ({ ...p, text: T(p.text) })),
      evidence: evidenceFor(def, state, report, c.id),
    };
  });
  const byScore = [...comps].sort((a, b) => b.score - a.score);
  const strengths = byScore.filter((c) => c.score >= 4).slice(0, 2);
  const priorities = [...comps].sort((a, b) => a.score - b.score).filter((c) => !strengths.includes(c)).slice(0, 2);
  const overall = comps.length ? comps.reduce((t, c) => t + c.score, 0) / comps.length : 0;
  const oi = levelOf(overall);
  const pr = report.progress;
  const summary = [
    `Across the quarter you led at the ${(scale[oi]?.label || LEVELS[oi]).toLowerCase()} level overall (${overall.toFixed(1)} out of 10) and reached ${pct(pr.achieved)} of your ${pr.metric?.id === 'profit' ? 'profit' : 'revenue'} target.`,
    strengths.length ? `Your strongest area was ${strengths[0].name.toLowerCase()}${strengths[1] ? `, followed by ${strengths[1].name.toLowerCase()}` : ''}.` : 'No competency is yet a clear strength, which makes the development plan below the most useful part of this report.',
    priorities.length ? `The biggest opportunity is ${priorities[0].name.toLowerCase()}: ${priorities[0].workOn.charAt(0).toLowerCase()}${priorities[0].workOn.slice(1)}` : '',
  ].filter(Boolean).join(' ');
  return {
    overall: { score: Math.round(overall * 10) / 10, levelIndex: oi, level: scale[oi]?.label || LEVELS[oi], definition: scale[oi]?.definition || '' },
    scale, comps, strengths, priorities, summary,
    purpose: T(D.purpose), method: T(D.method),
    coaching: (D.coaching || []).map(T).filter(Boolean),
    idp: { horizon: D.idp?.horizon || 90, intro: T(D.idp?.intro) },
  };
}

// ---------- Genie ----------

export function narrativePrompt(def, dev, report) {
  const G = def.report.development?.guidance || '';
  const data = {
    role: renderText(def, '{{learner_role}}'), company: renderText(def, '{{company}}'),
    target: { metric: report.progress.metric?.label, achieved: pct(report.progress.achieved) },
    overall: dev.overall,
    competencies: dev.comps.map((c) => ({ id: c.id, name: c.name, score: c.score, level: c.level, evidence: c.evidence, standard: c.looksLike, workOn: c.workOn })),
    styles: report.styles.map((s) => ({ name: s.name, share: pct(s.proportion), accuracy: s.accuracy === null ? null : pct(s.accuracy) })),
  };
  return [
    'You are writing the personalised narrative of a leadership development report for a learner who has just finished a business simulation.',
    G,
    'Use only the facts in the data. Do not invent events. Do not use em dashes. Keep the standard content\'s meaning; make it specific to this learner.',
    'Return JSON only, in this shape: {"summary": "3 or 4 sentences", "strengths": [{"id": "competency id", "text": "1 or 2 sentences"}], "priorities": [{"id": "competency id", "text": "1 or 2 sentences"}], "observed": {"<competency id>": "1 or 2 sentences on what the learner did"}}.',
    `Strengths must use these ids: ${dev.strengths.map((c) => c.id).join(', ') || 'none'}. Priorities must use these ids: ${dev.priorities.map((c) => c.id).join(', ') || 'none'}.`,
    `Data: ${JSON.stringify(data)}`,
  ].filter(Boolean).join('\n\n');
}

// Accepts Genie's answer only if it has the right shape and ids and no em dashes; otherwise null.
export function readNarrative(dev, reply) {
  let v = reply;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { return null; } }
  if (!v || typeof v.summary !== 'string' || v.summary.length < 40) return null;
  const ids = new Set(dev.comps.map((c) => c.id));
  const clean = (t) => String(t || '').replace(/—/g, ',').trim();
  const list = (xs, allowed) => (Array.isArray(xs) ? xs.filter((x) => x && allowed.has(x.id) && typeof x.text === 'string').map((x) => ({ id: x.id, text: clean(x.text) })) : []);
  const observed = {};
  for (const [k, t] of Object.entries(v.observed || {})) if (ids.has(k) && typeof t === 'string') observed[k] = clean(t);
  return {
    summary: clean(v.summary),
    strengths: list(v.strengths, new Set(dev.strengths.map((c) => c.id))),
    priorities: list(v.priorities, new Set(dev.priorities.map((c) => c.id))),
    observed,
  };
}
