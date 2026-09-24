// Text tokens. Authors write {{company}} or {{actor}} once; the runtime fills them in.
// Pronoun tokens follow the actor's pronoun set, so one string serves every actor.

export const PRONOUNS = {
  he: { he: 'he', him: 'him', his: 'his', himself: 'himself' },
  she: { he: 'she', him: 'her', his: 'her', himself: 'herself' },
  they: { he: 'they', him: 'them', his: 'their', himself: 'themselves' },
};

// Runtime tokens the engine fills from the live run (not from the context dictionary).
export const RUNTIME_TOKENS = {
  actor: 'Team member name',
  stage: "Team member's current stage",
  skill: 'Skill value (assessments)',
  morale: 'Morale value (assessments)',
  performance: 'Performance value (assessments)',
  top_performer: 'Top performer name',
  style: 'Leadership style name',
  dominant_style: "Learner's dominant style",
  weeks: 'Number of weeks',
  he: 'Pronoun (he / she / they)',
  him: 'Pronoun (him / her / them)',
  his: 'Pronoun (his / her / their)',
  himself: 'Pronoun (himself / herself / themselves)',
};

const TOKEN_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export function findTokens(text = '') {
  return [...String(text).matchAll(TOKEN_RE)].map((m) => m[1]);
}

export function knownTokenKeys(def) {
  const keys = new Set(Object.keys(RUNTIME_TOKENS));
  for (const k of Object.keys(RUNTIME_TOKENS)) keys.add(k.charAt(0).toUpperCase() + k.slice(1));
  for (const e of def.context.entities) keys.add(e.key);
  return keys;
}

export function unknownTokens(def, text) {
  const known = knownTokenKeys(def);
  return findTokens(text).filter((t) => !known.has(t));
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

// vars: { actor, stage, style, ... } plus `pronoun` ('he' | 'she' | 'they').
export function renderText(def, text, vars = {}) {
  if (!text) return '';
  const entities = Object.fromEntries(def.context.entities.map((e) => [e.key, e.value]));
  const set = PRONOUNS[vars.pronoun] || PRONOUNS.they;
  return String(text).replace(TOKEN_RE, (whole, key) => {
    const lower = key.toLowerCase();
    const upper = key.charAt(0) === key.charAt(0).toUpperCase() && key.charAt(0) !== key.charAt(0).toLowerCase();
    if (set[lower] !== undefined) {
      let word = set[lower];
      // "they's" reads badly; the legacy copy only uses "he's" in one line.
      return upper ? capitalize(word) : word;
    }
    if (vars[key] !== undefined) return String(vars[key]);
    if (vars[lower] !== undefined) return upper ? capitalize(String(vars[lower])) : String(vars[lower]);
    if (entities[key] !== undefined) {
      // Never leave a gap in the sentence: an empty field shows as a visible placeholder,
      // and the health check lists it.
      if (String(entities[key]).trim()) return entities[key];
      const e = def.context.entities.find((x) => x.key === key);
      return `[${e?.label || key}]`;
    }
    if (key === 'weeks') return String(def.timeline.weeks);
    return whole;
  });
}

// Every editable string in a definition, with a path so the Studio can jump to it.
export function collectTexts(def) {
  const out = [];
  const add = (section, label, text, ref) => out.push({ section, label, text: text || '', ref });
  add('story', 'Welcome letter', def.story.welcome, { field: 'welcome' });
  add('story', 'Product brief', def.story.overview, { field: 'overview' });
  add('story', 'Target message', def.story.target, { field: 'target' });
  def.story.briefing.forEach((p, i) => add('story', `Briefing paragraph ${i + 1}`, p, { field: 'briefing', index: i }));
  def.story.walkthrough.forEach((w, i) => add('story', `Tour step: ${w.title}`, w.text, { field: 'walkthrough', index: i }));
  def.stages.forEach((s) => add('funnel', `Stage: ${s.name}`, s.description, { stageId: s.id }));
  def.actors.forEach((a) => add('team', `Profile: ${a.name}`, a.bio, { actorId: a.id }));
  def.actions.forEach((a) => {
    add('actions', `${a.name}: description`, a.description, { actionId: a.id });
    a.options.forEach((o) => {
      if (o.text) add('actions', `${a.name}: option`, o.text, { actionId: a.id, optionId: o.id });
      Object.entries(o.outcomes).forEach(([k, oc]) =>
        oc.messages.forEach((m, i) => add('actions', `${a.name}: ${o.label || 'response'} (${k})`, m, { actionId: a.id, optionId: o.id, outcome: k, index: i })),
      );
    });
  });
  def.events.forEach((e) => add('events', `Event: ${e.name}`, e.text, { eventId: e.id }));
  def.triggers.forEach((t) => add('events', `Trigger: ${t.name}`, t.text, { triggerId: t.id }));
  def.report.competencies.forEach((c) => c.bands.forEach((b) => add('report', `${c.name}: ${b.label}`, b.text, { competencyId: c.id, band: b.label })));
  Object.entries(def.report.objective).forEach(([k, v]) => add('report', `Objective insight: ${k}`, v, { objective: k }));
  Object.entries(def.report.styleInsights).forEach(([styleId, grid]) =>
    Object.entries(grid).forEach(([k, v]) => add('report', `Style insight: ${styleId} ${k}`, v, { styleId, cell: k })),
  );
  return out;
}

// Items that describe the original industry's world. Swapping names is not enough for these.
export function contextBoundItems(def) {
  const terms = (def.context.boundTerms || []).filter(Boolean).map((t) => t.toLowerCase());
  if (!terms.length) return [];
  return collectTexts(def)
    .filter((t) => {
      const lower = t.text.toLowerCase();
      return terms.some((term) => lower.includes(term));
    })
    .map((t) => ({ ...t, terms: terms.filter((term) => t.text.toLowerCase().includes(term)) }));
}
