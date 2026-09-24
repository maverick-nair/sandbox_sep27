// Applies the concrete instructions found in a brief (stage names, team names, requested events)
// to a draft definition. Used by the creation flow after tailoring and before the author's edits,
// so anything the author changes by hand still wins.
import { REGIONS } from './world.js';
import { COUNTRY_NAMES } from './names.js';
import { LOCATIONS } from './context-packs.js';

// Given names we know the usual pronoun for, from every name pool.
let known = null;
function givenNames() {
  if (known) return known;
  known = { she: new Set(), he: new Set() };
  const pools = [...Object.values(REGIONS), ...Object.values(COUNTRY_NAMES), ...Object.values(LOCATIONS).map((l) => l.names)];
  for (const p of pools) for (const k of ['she', 'he']) for (const n of p[k] || []) for (const part of n.split(/\s+/)) known[k].add(part.toLowerCase());
  return known;
}
export function likelyPronoun(name) {
  const g = givenNames();
  const first = String(name).trim().split(/\s+/)[0].toLowerCase();
  const she = g.she.has(first);
  const he = g.he.has(first);
  return she && !he ? 'she' : he && !she ? 'he' : null;
}

export function briefEventId(name) {
  return `brief-${String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'event'}`;
}

// Returns a list of what was applied, for the review step.
export function applyBriefSpecifics(def, specifics = []) {
  const applied = [];
  for (const sp of specifics.filter((x) => x.used)) {
    if (sp.id === 'stages' && Array.isArray(sp.value) && sp.value.length === def.stages.length) {
      const renames = def.stages.map((st, i) => [st.name, sp.value[i]]).filter(([a, b]) => a && a !== b);
      def.stages.forEach((st, i) => { st.name = sp.value[i]; });
      // Profiles and events mention stages by name ("wants to move to the Disbursal role").
      const swap = (t) => renames.reduce((acc, [a, b]) => acc.split(a).join(b), String(t || ''));
      for (const a of def.actors) { a.bio = swap(a.bio); a.domain = swap(a.domain); }
      for (const e of def.events) e.text = swap(e.text);
      applied.push(sp.id);
    }
    if (sp.id === 'names' && Array.isArray(sp.value)) {
      const team = def.actors.filter((a) => a.pool === 'team');
      const taken = new Set();
      for (const raw of sp.value) {
        const name = String(raw).trim();
        if (!name) continue;
        const pronoun = likelyPronoun(name);
        const target = team.find((a) => !taken.has(a.id) && (!pronoun || a.pronoun === pronoun)) || team.find((a) => !taken.has(a.id));
        if (!target) break;
        taken.add(target.id);
        const old = target.name;
        // A given name alone keeps the family name already chosen for the location: "Ravi Verma".
        const full = name.includes(' ') ? name : [name, ...old.split(/\s+/).slice(1)].join(' ');
        const oldFirst = old.split(/\s+/)[0];
        target.name = full;
        target.bio = String(target.bio || '').split(old).join(full).replace(new RegExp(`\\b${oldFirst}\\b`, 'g'), full.split(/\s+/)[0]);
      }
      applied.push(sp.id);
    }
    if (sp.id.startsWith('event:') && sp.value?.name) {
      const weeks = def.timeline.weeks;
      const id = briefEventId(sp.value.name);
      if (def.events.some((e) => e.id === id)) continue;
      const week = Math.max(1, Math.min(weeks, sp.value.week || Math.ceil(weeks / 2)));
      def.events.push({
        id,
        name: sp.value.name,
        text: `${sp.value.name} is under way at {{company}} this week. The team has to make time for it alongside their targets, and focus slips.`,
        week,
        day: 1,
        impact: { s: 0, m: -3, p: -3 },
        target: 'team',
        enabled: true,
        fromBrief: true,
      });
      applied.push(sp.id);
    }
    if (sp.id === 'dealValue' && sp.value?.value > 0) {
      def.funnel.valuePerConversion = sp.value.value;
      if (sp.value.currency) def.funnel.currency = sp.value.currency;
      applied.push(sp.id);
    }
    if (sp.id === 'currency' && sp.value) { def.funnel.currency = sp.value; applied.push(sp.id); }
  }
  return applied;
}
