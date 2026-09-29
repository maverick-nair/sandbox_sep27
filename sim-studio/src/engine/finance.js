// The business side of the quarter. Conversions bring revenue; revenue less the cost of what was
// sold is gross profit; gross profit less the team's cost and what the leader spent on actions
// (training, rewards, hiring, team events) is operating profit. The author chooses which of
// revenue and operating profit is the target the board sets, so leadership choices carry
// financial trade-offs as well as human ones.

export const METRICS = {
  revenue: { label: 'Revenue', short: 'Revenue', note: 'Sales revenue from every conversion.' },
  profit: { label: 'Operating profit', short: 'Profit', note: 'Gross profit less the team’s cost and what you spend on actions.' },
};

export const DEFAULT_ACTION_COSTS = { 'meet-team': 500, energise: 3000, email: 0, reassign: 0, training: 5000, hire: 10000, fire: 6000, 'face-to-face': 0, assess: 0, reward: 2500, 'set-goals': 0, coach: 0, feedback: 0 };

export function defaultBusiness() {
  return { metric: 'revenue', grossMargin: 0.4, weeklyCostPerPerson: 3000, actionCosts: { ...DEFAULT_ACTION_COSTS }, profitTarget: null, showProfit: true };
}

export function businessOf(def) {
  const b = { ...defaultBusiness(), ...(def.business || {}) };
  b.actionCosts = { ...DEFAULT_ACTION_COSTS, ...(def.business?.actionCosts || {}) };
  return b;
}

const teamSize = (def) => def.actors.filter((a) => a.pool === 'team').length;
export const revenueTarget = (def) => def.funnel.target * (def.funnel.valuePerConversion || 0);

// A profit target the team can reach by hitting the conversions target while spending sensibly:
// gross profit at target, less the full quarter's team cost, less a spending allowance of 8% of
// gross profit. Rounded to a clean number.
export function suggestedProfitTarget(def) {
  const b = businessOf(def);
  const gp = revenueTarget(def) * b.grossMargin;
  const team = teamSize(def) * b.weeklyCostPerPerson * def.timeline.weeks;
  const raw = gp - team - gp * 0.08;
  const step = raw > 1e6 ? 50000 : 10000;
  return Math.max(step, Math.round(raw / step) * step);
}

export const profitTarget = (def) => businessOf(def).profitTarget ?? suggestedProfitTarget(def);

// What one use of an action costs: per person for actions aimed at people, once for team actions.
export function actionCost(def, action, targets = []) {
  const c = businessOf(def).actionCosts[action.id] || 0;
  if (!c) return 0;
  return action.scope === 'team' || action.mechanic === 'hire' ? c : c * Math.max(1, targets.length);
}

export function financeOf(def, state) {
  const b = businessOf(def);
  const revenue = state.funnel.conversions * (def.funnel.valuePerConversion || 0);
  const grossProfit = revenue * b.grossMargin;
  const team = state.finance?.team ?? 0;
  const actions = state.finance?.actions ?? 0;
  const operatingProfit = grossProfit - team - actions;
  return { revenue, grossProfit, teamCost: team, actionSpend: actions, costs: team + actions, operatingProfit, margin: revenue > 0 ? operatingProfit / revenue : null, byAction: state.finance?.byAction || {} };
}

// The headline target, whichever metric the author chose.
export function targetMetric(def, state) {
  const b = businessOf(def);
  const f = financeOf(def, state);
  const m = b.metric === 'profit' ? { id: 'profit', value: f.operatingProfit, target: profitTarget(def) } : { id: 'revenue', value: f.revenue, target: revenueTarget(def) };
  // Revenue achievement is conversions against the conversions target, exactly (so a change of
  // currency or deal value never moves a score).
  const achieved = m.id === 'revenue' ? (def.funnel.target ? state.funnel.conversions / def.funnel.target : 0) : m.target > 0 ? Math.max(0, m.value) / m.target : 0;
  return { ...m, ...METRICS[m.id], achieved, finance: f };
}
