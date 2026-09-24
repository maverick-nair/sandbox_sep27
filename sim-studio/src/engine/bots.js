// Bot players for the balance check. They let an author see, before any learner plays,
// whether the target is reachable for a skilled leader and out of reach for a careless one.

import {
  createRun, setWeeklyStyles, takeAction, proceed, actionAvailability, availableIds, teamIds,
  desiredStyle, styleDiff, mismatchDistribution, membersInStage, progress, weekOf,
} from './engine.js';
import { createRng } from './rng.js';

const expectedOutcome = (option, dist) =>
  dist.reduce(
    (acc, d) => {
      const imp = option.outcomes[String(d.mm)]?.impact || { s: 0, m: 0, p: 0 };
      return { s: acc.s + d.p * imp.s, m: acc.m + d.p * imp.m, p: acc.p + d.p * imp.p };
    },
    { s: 0, m: 0, p: 0 },
  );

// How much a change for this person matters: performance moves the funnel, weighted by how thin
// their stage is; skill and morale matter because they shape future performance.
function value(state, id, d) {
  const a = state.actors[id];
  const cover = membersInStage(state, a.stage, { availableOnly: true }).length || 1;
  return d.p / cover + 0.35 * (d.s + d.m);
}

function candidates(def, state) {
  const out = [];
  const ids = availableIds(state);
  for (const action of def.actions) {
    for (const option of action.options) {
      if (!actionAvailability(def, state, action, option).ok) continue;
      const add = (targets, score, extra = {}) => out.push({ req: { actionId: action.id, optionId: option.id, targets, ...extra }, score, days: option.dayCost });
      switch (action.mechanic) {
        case 'styleChoice': {
          if (action.scope === 'team') {
            const score = ids.reduce((t, id) => {
              const a = state.actors[id];
              return t + value(state, id, expectedOutcome(option, mismatchDistribution(def, styleDiff(def, option.style, desiredStyle(def, a.s, a.m)))));
            }, 0);
            add([], score);
          } else {
            for (const id of ids) {
              const a = state.actors[id];
              const e = expectedOutcome(option, mismatchDistribution(def, styleDiff(def, option.style, desiredStyle(def, a.s, a.m))));
              // Low performers gain the most room; nudge the bot to spread attention.
              add([id], value(state, id, e) * (1 + (100 - a.p) / 200));
            }
          }
          break;
        }
        case 'weeklyStyleCheck': {
          const score = ids.reduce((t, id) => {
            const set = state.weeklyStyles[id];
            if (!set) return t;
            return t + value(state, id, expectedOutcome(option, mismatchDistribution(def, styleDiff(def, set, state.desiredAtWeekStart[id]))));
          }, 0);
          add([], score);
          break;
        }
        case 'training': {
          const scored = ids
            .map((id) => {
              const set = state.weeklyStyles[id];
              const diff = set ? styleDiff(def, set, state.desiredAtWeekStart[id]) : 2;
              const e = expectedOutcome(option, def.randomness.training[diff]);
              // Training takes the person out of the funnel, so it costs their current output.
              const away = (state.actors[id].p / 20) * (option.unavailableDays || 1);
              return { id, score: value(state, id, e) + 0.4 * e.s - away };
            })
            .filter((x) => x.score > 0 && state.actors[x.id].s < def.leadership.highThreshold)
            .sort((x, y) => y.score - x.score)
            .slice(0, action.maxTargets || 1);
          if (scored.length) add(scored.map((x) => x.id), scored.reduce((t, x) => t + x.score, 0));
          break;
        }
        case 'performanceTrend': {
          if (option.polarity !== 'praise') break;
          const rising = ids
            .filter((id) => {
              const a = state.actors[id];
              const past = a.history[Math.max(0, state.day - (action.lookbackDays || 10))] ?? a.p;
              return a.p >= past;
            })
            .sort((x, y) => state.actors[y].p - state.actors[x].p)
            .slice(0, action.maxTargets || 1);
          if (rising.length) add(rising, rising.reduce((t, id) => t + value(state, id, option.outcomes['0'].impact), 0));
          break;
        }
        case 'reward': {
          const top = [...ids].sort((x, y) => state.actors[y].p - state.actors[x].p)[0];
          if (top) add([top], value(state, top, option.outcomes['0'].impact));
          break;
        }
        default:
          break;
      }
    }
  }
  return out;
}

// One-off restructuring at the start: swap people into stages that suit them better.
function expertRestructure(def, state) {
  const reassign = def.actions.find((a) => a.mechanic === 'roleChange' && a.enabled);
  const swap = reassign?.options.find((o) => o.mode === 'swap');
  if (!swap) return false;
  const ids = teamIds(state);
  let best = null;
  for (const x of ids) {
    for (const y of ids) {
      if (x >= y) continue;
      const A = state.actors[x];
      const B = state.actors[y];
      if (A.stage === B.stage) continue;
      const bx = def.actors.find((d) => d.id === x).stats;
      const by = def.actors.find((d) => d.id === y).stats;
      const gain = bx[B.stage].p + by[A.stage].p - A.p - B.p;
      if (gain > 25 && (!best || gain > best.gain)) best = { x, y, gain };
    }
  }
  if (!best) return false;
  return takeAction(def, state, { actionId: reassign.id, optionId: swap.id, targets: [best.x, best.y] }).ok;
}

export const BOTS = {
  expert: {
    name: 'Adaptive leader',
    description: 'Reads every team member correctly each week and picks the action with the best expected payoff. The upper bound a skilled learner can reach.',
    weekly: (def, state) => Object.fromEntries(teamIds(state).map((id) => [id, desiredStyle(def, state.actors[id].s, state.actors[id].m)])),
    day: (def, state, rng, memo) => {
      if (weekOf(def, state.day) <= 2 && (memo.swaps || 0) < 2 && expertRestructure(def, state)) {
        memo.swaps = (memo.swaps || 0) + 1;
        return;
      }
      const best = candidates(def, state).sort((a, b) => b.score / b.days - a.score / a.days)[0];
      if (best && best.score > 0.5 && takeAction(def, state, best.req).ok) return;
      proceed(def, state);
    },
  },
  oneStyle: {
    name: 'One-style leader',
    description: 'Uses Directing with everyone, every week, and stays busy with one-to-one actions. Tests whether a single habit can win.',
    weekly: (def, state) => Object.fromEntries(teamIds(state).map((id) => [id, def.leadership.styles[0].id])),
    day: (def, state, rng) => {
      const style = def.leadership.styles[0].id;
      const pool = def.actions.filter((a) => a.enabled && a.mechanic === 'styleChoice' && a.scope === 'individual');
      const action = rng.pick(pool);
      const option = action?.options.find((o) => o.style === style);
      const ids = availableIds(state);
      if (action && option && ids.length && takeAction(def, state, { actionId: action.id, optionId: option.id, targets: [rng.pick(ids)] }).ok) return;
      proceed(def, state);
    },
  },
  random: {
    name: 'Guessing leader',
    description: 'Picks styles and actions at random. If this bot comes close to target, the simulation does not reward good leadership.',
    weekly: (def, state, rng) => Object.fromEntries(teamIds(state).map((id) => [id, rng.pick(def.leadership.styles).id])),
    day: (def, state, rng) => {
      if (rng.chance(0.3)) return void proceed(def, state);
      const pool = def.actions.filter((a) => a.enabled && ['styleChoice', 'weeklyStyleCheck', 'performanceTrend', 'reward', 'training'].includes(a.mechanic));
      const action = rng.pick(pool);
      const option = action && rng.pick(action.options);
      const ids = availableIds(state);
      if (!action || !option || !ids.length) return void proceed(def, state);
      const n = action.scope === 'team' ? 0 : Math.min(ids.length, rng.int(1, action.maxTargets || 1));
      const targets = [...ids].sort(() => rng.next() - 0.5).slice(0, n);
      if (!takeAction(def, state, { actionId: action.id, optionId: option.id, targets }).ok) proceed(def, state);
    },
  },
  passive: {
    name: 'Hands-off leader',
    description: 'Sets styles at random and never takes an action. Shows what the team does on its own.',
    weekly: (def, state, rng) => Object.fromEntries(teamIds(state).map((id) => [id, rng.pick(def.leadership.styles).id])),
    day: (def, state) => proceed(def, state),
  },
};

export function playBot(def, botId, seed) {
  const bot = BOTS[botId];
  const state = createRun(def, { seed });
  const rng = createRng(seed * 7919 + 17);
  const memo = {};
  let guard = 0;
  while (state.phase !== 'ended' && guard++ < 5000) {
    if (state.phase === 'weekStart') setWeeklyStyles(def, state, bot.weekly(def, state, rng));
    else bot.day(def, state, rng, memo);
  }
  const pr = progress(def, state);
  const intents = state.log.intents;
  return {
    botId,
    seed,
    conversions: pr.conversions,
    achieved: pr.achieved,
    accuracy: intents.length ? intents.filter((i) => i.diff === 0).length / intents.length : 0,
    actions: state.log.actions.length,
    leavers: Object.values(state.actors).filter((a) => a.status === 'left').length,
    state,
  };
}
