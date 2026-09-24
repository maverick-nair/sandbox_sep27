'use strict';
// Loads and validates mission content. Hidden facts, keyword lists, option points and outcomes
// never leave the server until the learner earns them.
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, 'content');

function validateMission(m, skills) {
  const errs = [];
  const need = (c, msg) => { if (!c) errs.push(`${m.id || '?'}: ${msg}`); };
  need(/^[a-z0-9]{2,30}$/.test(m.id || ''), 'id must be 2 to 30 lowercase letters or digits');
  need([1, 2, 3].includes(m.tier), 'tier must be 1, 2 or 3');
  for (const k of ['title', 'setup', 'objective', 'opening']) need(typeof m[k] === 'string' && m[k].length > 3, `${k} is required`);
  need(m.persona && m.persona.name && m.persona.role && m.persona.style && m.persona.initials, 'persona needs name, initials, role, style');
  need(Array.isArray(m.facts) && m.facts.length === 3, 'exactly 3 facts');
  (m.facts || []).forEach((f, i) => need(f.id === `f${i + 1}` && f.text && f.hint && f.short && Array.isArray(f.kw) && f.kw.length >= 3, `fact ${i + 1} needs id f${i + 1}, text, hint, short, kw[3+]`));
  need(Array.isArray(m.moments) && m.moments.length >= 1, 'at least 1 pressure moment');
  need(Array.isArray(m.rubric) && m.rubric.length === 4, 'exactly 4 rubric criteria');
  (m.rubric || []).forEach((c, i) => need(c.id === `c${i + 1}` && skills[c.skill] && c.name && c.good, `rubric ${i + 1} needs id c${i + 1}, a known skill, name, good`));
  need(Array.isArray(m.options) && m.options.length === 3, 'exactly 3 options');
  (m.options || []).forEach(o => need(['a', 'b', 'c'].includes(o.id) && o.label && Number.isInteger(o.pts) && o.pts >= 0 && o.pts <= 25 && o.outcome, `option ${o.id} needs label, pts 0 to 25, outcome`));
  need((m.options || []).some(o => o.pts === 25), 'one option must be worth 25 points');
  if (m.unlock) need(Number.isInteger(m.unlock.level) || Number.isInteger(m.unlock.passes), 'unlock needs level or passes');
  const text = JSON.stringify(m);
  need(!/[–—]/.test(text), 'no en or em dashes in content');
  return errs;
}

function load() {
  const game = JSON.parse(fs.readFileSync(path.join(DIR, 'game.json'), 'utf8'));
  const files = fs.readdirSync(path.join(DIR, 'missions')).filter(f => f.endsWith('.json')).sort();
  const missions = files.map(f => JSON.parse(fs.readFileSync(path.join(DIR, 'missions', f), 'utf8')));
  const errs = missions.flatMap(m => validateMission(m, game.SKILLS));
  const ids = missions.map(m => m.id);
  if (new Set(ids).size !== ids.length) errs.push('duplicate mission ids');
  if (errs.length) throw new Error('Mission content is invalid:\n' + errs.join('\n'));
  // Path order: core missions, a chest, advanced missions (two per chest), boss last.
  const order = { promise: 1, evalgate: 2, dataask: 3, margin: 4, hallucination: 5, ragfinetune: 6, biascomplaint: 7, agentic: 99 };
  missions.sort((a, b) => (a.tier - b.tier) || ((order[a.id] || 50) - (order[b.id] || 50)) || a.id.localeCompare(b.id));
  const byId = Object.fromEntries(missions.map(m => [m.id, m]));
  return { game, missions, byId, path: buildPath(missions) };
}

function buildPath(missions) {
  const out = []; let pending = [];
  missions.forEach((m, i) => {
    out.push({ type: 'mission', id: m.id }); pending.push(m.id);
    const last = i === missions.length - 1;
    if (!last && pending.length === 2 && missions[i + 1].tier !== 3) { out.push({ type: 'chest', id: 'chest' + (out.filter(n => n.type === 'chest').length + 1), needs: pending }); pending = []; }
    if (!last && missions[i + 1].tier === 3 && pending.length) { out.push({ type: 'chest', id: 'chest' + (out.filter(n => n.type === 'chest').length + 1), needs: pending }); pending = []; }
  });
  return out;
}

// What the browser may see before a run: nothing that gives away hidden facts or which option scores best.
function publicMission(m) {
  return {
    id: m.id, tier: m.tier, title: m.title, minutes: m.minutes, persona: m.persona, setup: m.setup, objective: m.objective,
    unlock: m.unlock || null, factCount: m.facts.length, momentCount: m.moments.length,
    rubric: m.rubric.map(c => ({ id: c.id, skill: c.skill, name: c.name }))
  };
}
module.exports = { load, validateMission, publicMission };
