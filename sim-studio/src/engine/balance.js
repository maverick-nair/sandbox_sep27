// Balance check: many seeded playthroughs per bot, summarised into a verdict an author can act on.
import { BOTS, playBot } from './bots.js';

const quantile = (xs, q) => {
  const s = [...xs].sort((a, b) => a - b);
  if (!s.length) return 0;
  const i = (s.length - 1) * q;
  const lo = Math.floor(i);
  return s[lo] + (s[Math.ceil(i)] - s[lo]) * (i - lo);
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

export function summarise(def, results) {
  const bots = {};
  for (const id of Object.keys(BOTS)) {
    const rs = results.filter((r) => r.botId === id);
    if (!rs.length) continue;
    const ach = rs.map((r) => r.achieved);
    bots[id] = {
      id,
      name: BOTS[id].name,
      description: BOTS[id].description,
      runs: rs.length,
      p10: quantile(ach, 0.1),
      p50: quantile(ach, 0.5),
      p90: quantile(ach, 0.9),
      hitRate: rs.filter((r) => r.achieved >= 1).length / rs.length,
      conversions: mean(rs.map((r) => r.conversions)),
      accuracy: mean(rs.map((r) => r.accuracy)),
      leavers: mean(rs.map((r) => r.leavers)),
      samples: ach,
    };
  }
  return { bots, ...verdict(def, bots) };
}

function verdict(def, bots) {
  const e = bots.expert;
  const worst = Math.max(bots.random?.p50 ?? 0, bots.oneStyle?.p50 ?? 0, bots.passive?.p50 ?? 0);
  const findings = [];
  let status = 'balanced';
  const target = def.funnel.target;
  // The adaptive bot sees true skill and morale; learners have to infer them. Aim the target at
  // roughly 75% of what the bot reaches so a strong learner can still hit it.
  const suggestedTarget = e ? Math.max(1, Math.round((e.p50 * target) / 1.3)) : target;
  if (e && e.p50 < 1.1) {
    status = 'too-hard';
    findings.push({
      tone: 'bad',
      text: `A leader who reads every team member correctly reaches only ${pct(e.p50)} of target in a typical run. Learners, who have to infer what each person needs, will rarely hit it.`,
      fix: { kind: 'target', value: suggestedTarget, label: `Set target to ${suggestedTarget} conversions` },
    });
  } else if (e && e.p50 > 1.7) {
    status = 'too-easy';
    findings.push({
      tone: 'mixed',
      text: `A skilled leader reaches ${pct(e.p50)} of target. The goal is too easy to create pressure.`,
      fix: { kind: 'target', value: suggestedTarget, label: `Raise target to ${suggestedTarget} conversions` },
    });
  }
  if (e && worst >= 0.8 * e.p50) {
    status = status === 'balanced' ? 'no-skill' : status;
    findings.push({
      tone: 'bad',
      text: `Guessing or using one style gets ${pct(worst)} of target, close to the skilled leader's ${pct(e.p50)}. Adapting your style is not paying off enough.`,
      fix: { kind: 'mismatch', value: Math.min(0.9, def.randomness.mismatchChance + 0.15), label: 'Make wrong styles land more often' },
    });
  } else if (e && e.p50 - worst < 0.25) {
    findings.push({ tone: 'mixed', text: `The gap between the skilled leader and the others is ${pct(e.p50 - worst)} of target. A gap of 25% or more makes the learning point clearer.` });
  }
  if (e && status === 'balanced') {
    findings.push({ tone: 'good', text: `A skilled leader typically reaches ${pct(e.p50)} of target and hits it in ${pct(e.hitRate)} of runs. Weaker approaches stay at ${pct(worst)} or below.` });
  }
  return { status, findings, suggestedTarget };
}

export const pct = (v) => `${Math.round(v * 100)}%`;

export function runBalance(def, { runs = 20, bots = Object.keys(BOTS), seed = 1000 } = {}) {
  const results = [];
  for (const b of bots) for (let i = 0; i < runs; i++) results.push(stripState(playBot(def, b, seed + i)));
  return summarise(def, results);
}

// Same as runBalance, but yields to the browser between runs and reports progress.
export async function runBalanceAsync(def, { runs = 20, bots = Object.keys(BOTS), seed = 1000 } = {}, onProgress) {
  const results = [];
  const total = runs * bots.length;
  for (const b of bots) {
    for (let i = 0; i < runs; i++) {
      results.push(stripState(playBot(def, b, seed + i)));
      if (results.length % 4 === 0) {
        onProgress?.(results.length / total);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }
  onProgress?.(1);
  return summarise(def, results);
}

function stripState(r) {
  const { state, ...rest } = r;
  return rest;
}
