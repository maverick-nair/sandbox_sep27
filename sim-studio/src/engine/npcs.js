import { renderText } from './text.js';

// Senders that are not people (dashboards, group channels, news) get an icon, not a portrait.
export const SYSTEM_SENDERS = ['Sales dashboard', 'Team meeting', 'Team chat', 'Business news', 'Consequence'];

// Everyone who speaks to the learner and is not on the team: the CEO, anyone a moment names by a
// context field (for example a board member), and named senders an author wrote into a moment.
// Each can have a photo the author uploads in Look and feel.
export function npcsOf(def) {
  const look = def.look || {};
  const photos = look.photos || {};
  const pron = look.pronouns || {};
  const out = [];
  const add = (id, name, role, pronoun) => { if (name && !out.some((x) => x.name === name)) out.push({ id, name, role, pronoun: pron[id] || pronoun || 'they', photo: photos[id] || (id === 'ceo' ? look.ceoPhoto : undefined) }); };
  add('ceo', renderText(def, '{{ceo}}'), `CEO, ${renderText(def, '{{company}}')}`, look.ceoPronoun || 'he');
  for (const p of def.decisions?.points || []) {
    const f = p.from || {};
    if (f.entity && f.entity !== 'ceo') add(`entity:${f.entity}`, renderText(def, `{{${f.entity}}}`), renderText(def, f.role || ''), 'they');
    else if (f.name && !SYSTEM_SENDERS.includes(renderText(def, f.name))) add(`name:${f.name}`, renderText(def, f.name), renderText(def, f.role || ''), 'they');
  }
  return out;
}

