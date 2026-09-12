// Single serializable game state with an explicit level state machine.
import { INITIAL_CURRENCIES, INITIAL_METERS, LEVELS, shuffleDeck } from '../content/index.js';

export const STORAGE_KEY = 'launch-window-save-v1';
export const SETTINGS_KEY = 'launch-window-settings-v1';

export function initialState(seed = Date.now()) {
  const levelStatus = {};
  LEVELS.forEach((l) => (levelStatus[l.id] = l.id === 1 ? 'unlocked' : 'locked'));
  return {
    version: 1,
    seed,
    startedAt: null,
    phase: 'intro', // intro | playing | debrief
    learner: { name: '', cohort: '', mode: 'solo', roles: { pm: '', eng: '', gov: '' } },
    baseline: null, // { commercial, reliability, governance, stakeholder } from Module 0
    currentLevel: 1,
    levelStatus,
    currencies: { ...INITIAL_CURRENCIES },
    meters: { ...INITIAL_METERS },
    xp: 0,
    badges: [],
    streak: 0,
    liabilities: [], // { id, source, text }
    flags: {},
    levelResults: {},
    prd: {},
    personaMemory: { dana: [], marcus: [], priya: [], elena: [] },
    decisionLog: [],
    events: { deck: shuffleDeck(seed), drawn: {}, resolved: {} },
    llm: { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, errors: 0 },
    teamLog: [],
    levelDraft: {}, // per-level in-progress state for resume
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 1) return parsed;
  } catch (e) {
    console.warn('Could not load save', e);
  }
  return null;
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Could not save', e);
  }
}

export function loadSettings() {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    return {};
  }
}
export function saveSettings(s) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function applyDeltas(state, { meters = {}, currencies = {} }) {
  const m = { ...state.meters };
  Object.entries(meters).forEach(([k, v]) => (m[k] = clamp(Math.round((m[k] ?? 50) + v), 0, 100)));
  const c = { ...state.currencies };
  Object.entries(currencies).forEach(([k, v]) => (c[k] = Math.max(0, Math.round((c[k] ?? 0) + v))));
  return { ...state, meters: m, currencies: c };
}

export function reducer(state, action) {
  switch (action.type) {
    case 'START': {
      return { ...state, phase: 'playing', startedAt: Date.now(), learner: { ...state.learner, ...action.learner }, baseline: action.baseline ?? state.baseline };
    }
    case 'SET_BASELINE':
      return { ...state, baseline: action.baseline };
    case 'GOTO_LEVEL': {
      const status = state.levelStatus[action.level];
      if (status === 'locked') return state;
      return { ...state, currentLevel: action.level, phase: 'playing' };
    }
    case 'SAVE_DRAFT':
      return { ...state, levelDraft: { ...state.levelDraft, [action.level]: action.draft } };
    case 'SPEND': {
      return applyDeltas(state, { currencies: { [action.currency]: -action.amount } });
    }
    case 'APPLY_DELTAS':
      return applyDeltas(state, action);
    case 'LOG_DECISION': {
      const entry = { ts: Date.now(), level: state.currentLevel, ...action.entry };
      return { ...state, decisionLog: [...state.decisionLog, entry] };
    }
    case 'PERSONA_MEMORY': {
      const mem = state.personaMemory[action.persona] || [];
      return { ...state, personaMemory: { ...state.personaMemory, [action.persona]: [...mem, action.note].slice(-8) } };
    }
    case 'LLM_USAGE': {
      const u = state.llm;
      return { ...state, llm: { calls: u.calls + 1, inputTokens: u.inputTokens + (action.inputTokens || 0), outputTokens: u.outputTokens + (action.outputTokens || 0), costUsd: Math.round((u.costUsd + (action.costUsd || 0)) * 10000) / 10000, errors: u.errors + (action.error ? 1 : 0) } };
    }
    case 'DRAW_EVENT': {
      if (state.events.drawn[action.level]) return state;
      const remaining = state.events.deck.filter((id) => !Object.values(state.events.drawn).includes(id));
      const id = remaining[0];
      if (!id) return state;
      let next = { ...state, events: { ...state.events, drawn: { ...state.events.drawn, [action.level]: id } } };
      if (action.effects) next = applyDeltas(next, action.effects);
      return next;
    }
    case 'RESOLVE_EVENT': {
      let next = applyDeltas(state, action.effects || {});
      next = { ...next, events: { ...next.events, resolved: { ...next.events.resolved, [action.level]: action.optionId } } };
      return next;
    }
    case 'ADD_LIABILITY':
      if (state.liabilities.some((l) => l.id === action.liability.id)) return state;
      return { ...state, liabilities: [...state.liabilities, action.liability] };
    case 'TEAM_LOG':
      return { ...state, teamLog: [...state.teamLog, { ts: Date.now(), level: state.currentLevel, ...action.entry }] };
    case 'COMPLETE_LEVEL': {
      const { level, result } = action;
      let next = applyDeltas(state, { meters: result.meterDeltas || {}, currencies: result.currencyDeltas || {} });
      const levelStatus = { ...next.levelStatus, [level]: 'complete' };
      if (level < 8 && levelStatus[level + 1] === 'locked') levelStatus[level + 1] = 'unlocked';
      const badges = [...new Set([...next.badges, ...(result.badges || [])])];
      const drewLiability = (result.liabilities || []).length > 0;
      const streak = drewLiability ? 0 : next.streak + 1;
      const streakBonus = streak >= 2 ? 25 * (streak - 1) : 0;
      const liabilities = [...next.liabilities];
      (result.liabilities || []).forEach((l) => { if (!liabilities.some((x) => x.id === l.id)) liabilities.push(l); });
      const evidenceMultiplier = result.evidenceReferenced ? 1.25 : 1;
      const xpGain = Math.round((result.xp || 0) * evidenceMultiplier) + streakBonus;
      next = {
        ...next,
        levelStatus,
        badges,
        streak,
        liabilities,
        xp: next.xp + xpGain,
        flags: { ...next.flags, ...(result.flags || {}) },
        levelResults: { ...next.levelResults, [level]: { ...result, xpGain, streakBonus, completedAt: Date.now() } },
        prd: result.prdSection ? { ...next.prd, [result.prdSection.key]: result.prdSection.value } : next.prd,
        currentLevel: level,
        levelDraft: { ...next.levelDraft, [level]: undefined },
      };
      return next;
    }
    case 'OPEN_DEBRIEF':
      return { ...state, phase: 'debrief' };
    case 'IMPORT_STATE':
      return action.state;
    case 'RESET':
      return initialState();
    default:
      return state;
  }
}

export function levelUnlocked(state, level) {
  return state.levelStatus[level] !== 'locked';
}

// Judgment consistency: were decisions coherent across levels? 0 to 100.
export function judgmentConsistency(state) {
  const f = state.flags;
  const r = state.levelResults;
  let score = 70;
  const notes = [];
  if (f.highThreshold && f.skippedCitationLayer) { score -= 15; notes.push('Set a high ship threshold but skipped the citation layer that makes errors visible.'); }
  if (f.lowThreshold && f.shipped) { score -= 10; notes.push('Shipped on a low threshold without holding.'); }
  if (f.noApprovalOnAction && f.gotLegalYes) { score -= 15; notes.push('Committed to human oversight with Legal, then omitted the approval checkpoint on the action step.'); }
  if (f.marginHawk && f.overPromisedCFO) { score -= 10; notes.push('Achieved margin by routing, then over-promised a figure to the CFO.'); }
  if (f.killedBadIdea && !f.noApprovalOnAction && r[6]) { score += 10; notes.push('Treated refunds as a workflow problem in Level 1 and protected the action step in Level 6.'); }
  if (f.highThreshold && !f.skippedCitationLayer) { score += 10; notes.push('Reliability choices reinforced each other across Levels 2 and 3.'); }
  if (f.evidenceInGauntlet) { score += 10; notes.push('Brought earlier evidence into stakeholder conversations.'); }
  return { score: clamp(score, 0, 100), notes };
}
