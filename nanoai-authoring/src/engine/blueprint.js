// Blueprint and duration planner (PRD 9.1 Step 3, 13.1, 13.9). Deterministic rules engine.
import { RULES, DIFFICULTIES } from '../content/rules.js';
import { getSkill, SITUATION_TAGS } from '../content/ontology.js';
import { estimatePlannedMinutes } from './duration.js';
import { uid } from './text.js';

const OPEN_TYPES = ['Audio', 'Text'];

function openTypeFor(skill, index) {
  if (skill.voice) return index % 2 === 0 ? 'Audio' : 'Text';
  return index % 2 === 0 ? 'Text' : 'Audio';
}

// Default response type plan per Skill: open Skills get two open and one MCQ, MCQ Skills get two MCQ
// and one open. At least one open response per Skill always (PRD 9.2).
function typePlan(skill, count) {
  const out = [];
  for (let i = 0; i < count; i++) {
    if (skill.affinity === 'mcq') out.push(i === count - 1 ? openTypeFor(skill, 0) : 'MCQ');
    else out.push(i === 2 ? 'MCQ' : openTypeFor(skill, i));
  }
  return out;
}

export function rowObservations(row) {
  return row.responseType === 'MCQ' ? (row.plannedQuestions || 2) : (row.plannedQuestions || RULES.scoringQuestions.default);
}

export function makeRow(skillId, responseType, difficulty, tag, extra = {}) {
  const row = { id: uid('bp'), skillId, responseType, difficulty, tag, plannedMedia: false, plannedQuestions: responseType === 'MCQ' ? (extra.plannedQuestions || 2) : RULES.scoringQuestions.default, seedSituation: null, ...extra };
  row.estMinutes = estimatePlannedMinutes(row);
  return row;
}

// Initial plan: recommended 3 scenarios per Skill, trimmed to 12 total when 5 Skills are chosen.
export function planBlueprint(skillIds, { seeds = [], purpose = 'baseline' } = {}) {
  const changes = [];
  const skills = skillIds.map(getSkill).filter(Boolean);
  let perSkill = skills.map(() => RULES.scenarios.perSkillRecommended);
  let total = perSkill.reduce((a, b) => a + b, 0);
  let k = 0;
  while (total > RULES.scenarios.totalMax) { perSkill[k % skills.length] = Math.max(RULES.scenarios.perSkillMin, perSkill[k % skills.length] - 1); total = perSkill.reduce((a, b) => a + b, 0); k++; }
  if (skills.length && total > RULES.scenarios.totalMax) changes.push({ kind: 'trim', text: `Trimmed to ${RULES.scenarios.totalMax} scenarios so the assessment stays short form.` });

  const rows = [];
  let seedIdx = 0;
  skills.forEach((skill, si) => {
    const count = perSkill[si];
    const types = typePlan(skill, count);
    for (let i = 0; i < count; i++) {
      const difficulty = DIFFICULTIES[(i + si) % DIFFICULTIES.length];
      const tag = skill.tags[i % skill.tags.length] || SITUATION_TAGS[(si + i) % SITUATION_TAGS.length].id;
      const seed = seeds.length ? seeds[seedIdx++ % seeds.length] : null;
      const plannedQuestions = types[i] === 'MCQ' ? (skill.affinity === 'mcq' ? 3 : 2) : RULES.scoringQuestions.default;
      // Data Skills carry a chart or table; other Skills carry media on the high difficulty scenario only.
      const plannedMedia = skill.id === 'SK-DATADEC' || skill.id === 'SK-COMM' ? i < 2 : difficulty === 'High';
      rows.push(makeRow(skill.id, types[i], difficulty, tag, { plannedQuestions, plannedMedia, seedSituation: seed ? { id: seed.id, text: seed.text, source: seed.source } : null }));
    }
  });
  // Every Skill must reach 8 observations by construction: raise MCQ question counts, then open up MCQ rows.
  skills.forEach((skill) => {
    const mine = () => rows.filter((r) => r.skillId === skill.id);
    const obs = () => mine().reduce((a, r) => a + rowObservations(r), 0);
    for (const r of mine()) { if (obs() >= RULES.observations.perSkillMin) break; if (r.responseType === 'MCQ' && r.plannedQuestions < RULES.mcq.questionsMax) r.plannedQuestions = RULES.mcq.questionsMax; }
    for (const r of mine()) { if (obs() >= RULES.observations.perSkillMin) break; if (r.responseType === 'MCQ') { r.responseType = openTypeFor(skill, 1); r.plannedQuestions = RULES.scoringQuestions.default; } }
    for (const r of mine()) r.estMinutes = estimatePlannedMinutes(r);
  });
  const bp = { rows, changes, purpose };
  return applyReductionOrder(recompute(bp));
}

export function recompute(bp) {
  const rows = bp.rows.map((r) => ({ ...r, estMinutes: r.estMinutesOverride || estimatePlannedMinutes(r) }));
  const perSkill = {};
  for (const r of rows) {
    const p = (perSkill[r.skillId] ||= { scenarios: 0, observations: 0, open: 0, mcq: 0, minutes: 0, tags: new Set(), difficulties: new Set() });
    p.scenarios += 1; p.observations += rowObservations(r); p.minutes += r.estMinutes;
    if (r.responseType === 'MCQ') p.mcq += 1; else p.open += 1;
    p.tags.add(r.tag); p.difficulties.add(r.difficulty);
  }
  const totalMinutes = rows.reduce((a, r) => a + r.estMinutes, 0);
  const tagCoverage = new Set(rows.map((r) => r.tag));
  return { ...bp, rows, perSkill: Object.fromEntries(Object.entries(perSkill).map(([k, v]) => [k, { ...v, tags: [...v.tags], difficulties: [...v.difficulties] }])), totalMinutes, tagCoverage: [...tagCoverage] };
}

function skillKeepsMinimum(bp, skillId, { dropRowId, convertRowId } = {}) {
  let obs = 0, count = 0, open = 0;
  for (const r of bp.rows.filter((x) => x.skillId === skillId)) {
    if (r.id === dropRowId) continue;
    count += 1;
    if (r.id === convertRowId) { obs += 3; continue; }
    obs += rowObservations(r);
    if (r.responseType !== 'MCQ') open += 1;
  }
  const openAfterDrop = bp.rows.filter((x) => x.skillId === skillId && x.id !== dropRowId && x.id !== convertRowId && x.responseType !== 'MCQ').length;
  return { ok: obs >= RULES.observations.perSkillMin && count >= RULES.scenarios.perSkillMin && (convertRowId ? openAfterDrop >= 1 : true), obs, count, open };
}

// Reduction order when the time plan is over target: simplify media, then convert the lowest value
// open response scenario on a well covered Skill to MCQ, then drop a scenario on a Skill that keeps
// 8 observations without it. Every change is recorded so the author sees what moved.
export function applyReductionOrder(bpIn, target = RULES.time.totalTarget) {
  let bp = recompute(bpIn);
  const changes = [...(bp.changes || [])];
  let guard = 0;
  while (bp.totalMinutes > target && guard++ < 40) {
    // 1. Simplify media on the row where it is least essential (non data Skills, lowest difficulty first).
    const mediaRow = bp.rows.filter((r) => r.plannedMedia && !['SK-DATADEC', 'SK-COMM'].includes(r.skillId)).sort((a, b) => DIFFICULTIES.indexOf(a.difficulty) - DIFFICULTIES.indexOf(b.difficulty))[0]
      || bp.rows.filter((r) => r.plannedMedia).slice(-1)[0];
    if (mediaRow) {
      bp = recompute({ ...bp, rows: bp.rows.map((r) => (r.id === mediaRow.id ? { ...r, plannedMedia: false } : r)) });
      changes.push({ kind: 'media', rowId: mediaRow.id, skillId: mediaRow.skillId, text: `Removed planned media from a ${getSkill(mediaRow.skillId)?.name} scenario to save reading time.` });
      continue;
    }
    // 2. Convert lowest value open response scenario on a well covered Skill to MCQ (3 questions).
    const candidates = bp.rows.filter((r) => r.responseType !== 'MCQ').map((r) => ({ r, keep: skillKeepsMinimum(bp, r.skillId, { convertRowId: r.id }) })).filter((c) => c.keep.ok)
      .sort((a, b) => (b.keep.obs - a.keep.obs) || (DIFFICULTIES.indexOf(a.r.difficulty) - DIFFICULTIES.indexOf(b.r.difficulty)));
    if (candidates.length) {
      const { r } = candidates[0];
      bp = recompute({ ...bp, rows: bp.rows.map((x) => (x.id === r.id ? { ...x, responseType: 'MCQ', plannedQuestions: 3 } : x)) });
      changes.push({ kind: 'convert', rowId: r.id, skillId: r.skillId, text: `Changed a ${getSkill(r.skillId)?.name} scenario from ${r.responseType} to MCQ (3 questions). The Skill still has ${bp.perSkill[r.skillId].observations} observations.` });
      continue;
    }
    // 3. Drop a scenario on a Skill that keeps 8 observations and 2 scenarios without it.
    const drops = bp.rows.map((r) => ({ r, keep: skillKeepsMinimum(bp, r.skillId, { dropRowId: r.id }) })).filter((c) => c.keep.ok && bp.rows.length - 1 >= RULES.scenarios.totalMin)
      .sort((a, b) => (b.keep.obs - a.keep.obs) || (a.r.responseType === 'MCQ' ? -1 : 1));
    if (drops.length) {
      const { r } = drops[0];
      bp = recompute({ ...bp, rows: bp.rows.filter((x) => x.id !== r.id) });
      changes.push({ kind: 'drop', rowId: r.id, skillId: r.skillId, text: `Removed one ${getSkill(r.skillId)?.name} scenario (${r.responseType}). The Skill keeps ${bp.perSkill[r.skillId].observations} observations across ${bp.perSkill[r.skillId].scenarios} scenarios.` });
      continue;
    }
    // 4. Reduce complexity: step the longest High or Medium scenario down one difficulty level (PRD 13.9
    //    lets the planner adjust complexity as well as count and mix). Keeps at least two difficulty levels.
    const complex = bp.rows.filter((r) => r.difficulty === 'High').sort((a, b) => b.estMinutes - a.estMinutes);
    if (complex.length > 1) {
      const r = complex[0];
      const nd = 'Medium';
      bp = recompute({ ...bp, rows: bp.rows.map((x) => (x.id === r.id ? { ...x, difficulty: nd } : x)) });
      changes.push({ kind: 'simplify', rowId: r.id, skillId: r.skillId, text: `Simplified a ${getSkill(r.skillId)?.name} scenario from ${r.difficulty} to ${nd} difficulty to shorten it.` });
      continue;
    }
    break;
  }
  return { ...bp, changes };
}

// Author edits: change response type, add a scenario for a Skill, remove a scenario. All recompute live.
export function setRowType(bp, rowId, responseType) {
  return recompute({ ...bp, rows: bp.rows.map((r) => (r.id === rowId ? { ...r, responseType, plannedQuestions: responseType === 'MCQ' ? (r.responseType === 'MCQ' ? r.plannedQuestions : 2) : RULES.scoringQuestions.default } : r)) });
}
export function setRowQuestions(bp, rowId, n) {
  return recompute({ ...bp, rows: bp.rows.map((r) => (r.id === rowId ? { ...r, plannedQuestions: Math.max(1, Math.min(r.responseType === 'MCQ' ? RULES.mcq.questionsMax : RULES.scoringQuestions.max, n)) } : r)) });
}
export function toggleRowMedia(bp, rowId) {
  return recompute({ ...bp, rows: bp.rows.map((r) => (r.id === rowId ? { ...r, plannedMedia: !r.plannedMedia } : r)) });
}
export function addRow(bp, skillId) {
  if (bp.rows.length >= RULES.scenarios.totalMax) return { bp, error: `The assessment already has ${RULES.scenarios.totalMax} scenarios, the short form maximum.` };
  const skill = getSkill(skillId);
  const existing = bp.rows.filter((r) => r.skillId === skillId);
  const hasOpen = existing.some((r) => r.responseType !== 'MCQ');
  const type = !hasOpen ? openTypeFor(skill, 0) : (existing.filter((r) => r.responseType === 'MCQ').length < existing.length / 2 ? 'MCQ' : openTypeFor(skill, existing.length));
  const difficulty = DIFFICULTIES.find((d) => !existing.some((r) => r.difficulty === d)) || 'Medium';
  const tag = skill.tags.find((t) => !existing.some((r) => r.tag === t)) || skill.tags[0];
  return { bp: recompute({ ...bp, rows: [...bp.rows, makeRow(skillId, type, difficulty, tag, { plannedQuestions: type === 'MCQ' ? 2 : RULES.scoringQuestions.default })] }) };
}
export function removeRow(bp, rowId) {
  const row = bp.rows.find((r) => r.id === rowId);
  if (!row) return { bp };
  if (bp.rows.length <= RULES.scenarios.totalMin) return { bp, error: `An assessment needs at least ${RULES.scenarios.totalMin} scenarios.` };
  const keep = skillKeepsMinimum(bp, row.skillId, { dropRowId: rowId });
  if (keep.count < RULES.scenarios.perSkillMin) return { bp, error: `${getSkill(row.skillId)?.name} needs at least 2 scenarios so its score is dependable.` };
  return { bp: recompute({ ...bp, rows: bp.rows.filter((r) => r.id !== rowId) }) };
}

// Blueprint level findings shown in the grid before generation, in outcome language.
export function blueprintFindings(bp) {
  const out = [];
  for (const [skillId, p] of Object.entries(bp.perSkill || {})) {
    const name = getSkill(skillId)?.name || skillId;
    if (p.scenarios < RULES.scenarios.perSkillMin) out.push({ severity: 'hard', skillId, text: `Add one more scenario for ${name} so its score is dependable.` });
    else if (p.scenarios === RULES.scenarios.perSkillMin) out.push({ severity: 'soft', skillId, text: `${name} has 2 scenarios. A third makes the score steadier.` });
    if (p.observations < RULES.observations.perSkillMin) out.push({ severity: 'hard', skillId, text: `${name} needs ${RULES.observations.perSkillMin - p.observations} more scored observation${RULES.observations.perSkillMin - p.observations === 1 ? '' : 's'}. Add a scenario or add MCQ questions.` });
    else if (p.observations < RULES.observations.perSkillRecommended) out.push({ severity: 'soft', skillId, text: `${name} has ${p.observations} observations. 12 or more gives a High confidence score.` });
    if (p.open === 0) {
      if (p.mcq < 3 || p.observations < 8) out.push({ severity: 'hard', skillId, text: `${name} is measured only by MCQ. It needs at least 8 questions across 3 scenarios, or one Audio or Text scenario.` });
      else out.push({ severity: 'soft', skillId, text: `${name} is measured only by MCQ. One Audio or Text scenario would show judgment in the participant's own words.` });
    }
  }
  if (bp.rows.length < RULES.scenarios.totalMin) out.push({ severity: 'hard', text: `Add scenarios to reach at least ${RULES.scenarios.totalMin}.` });
  if (bp.rows.length > RULES.scenarios.totalMax) out.push({ severity: 'hard', text: `Reduce to ${RULES.scenarios.totalMax} scenarios or fewer.` });
  if (bp.totalMinutes > RULES.time.totalHard) out.push({ severity: 'hard', text: `The time plan is ${bp.totalMinutes} minutes, above the ${RULES.time.totalHard} minute limit. Convert a scenario to MCQ or remove one.` });
  else if (bp.totalMinutes > RULES.time.totalWarn) out.push({ severity: 'soft', text: `The time plan is ${bp.totalMinutes} minutes. Participants complete more reliably under ${RULES.time.totalTarget}.` });
  else if (bp.totalMinutes > RULES.time.totalTarget) out.push({ severity: 'soft', text: `The time plan is ${bp.totalMinutes} minutes, a little above the ${RULES.time.totalTarget} minute target.` });
  const diffs = new Set(bp.rows.map((r) => r.difficulty));
  if (bp.rows.length && diffs.size < 2) out.push({ severity: 'soft', text: 'All scenarios have the same difficulty. Mix difficulty so the assessment separates strong from developing participants.' });
  return out;
}
