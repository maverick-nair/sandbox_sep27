// Scenario library. Used only to build the sample assessment and as deterministic test fixtures. The
// authoring path never draws on it: NanoAI drafts every scenario with the model (PRD 15.1), and a failed
// generation leaves a placeholder for the author to retry (PRD 15.5).
import { RULES, LEVEL_LABELS } from '../content/rules.js';
import { getSkill, effectiveIndicators } from '../content/ontology.js';
import { seedsForSkill } from '../content/seeds.js';
import { pickNames } from './bias.js';
import { recommendCap, estimateScenarioMinutes } from './duration.js';
import { PROMPT_VERSION } from './llm.js';
import { uid } from './text.js';
import { buildContext, mediaSummary, splitSentences } from './generator.js';

const KEY_FOR_LEVEL = { L3: 5, L2: 4, L1: 2, L0: 1 };
const LEVEL_ORDER = ['L0', 'L1', 'L2', 'L3'];
export function fillTemplate(text = '', ctx, names) {
  return text.replace(/\{company\}/g, ctx.company).replace(/\{product\}/g, ctx.product).replace(/\{p1\}/g, names[0]).replace(/\{p2\}/g, names[1]).replace(/\{p3\}/g, names[2])
    .replace(/^your company/i, 'Your company').replace(/\. your company/g, '. Your company');
}

function lowerFirst(s = '') { return s.charAt(0).toLowerCase() + s.slice(1); }
function questionFromIdeal(text) {
  const t = text.replace(/\.$/, '');
  if (/^Be /i.test(t)) return `Was the response ${lowerFirst(t.replace(/^Be /i, ''))}?`;
  if (/^Do not /i.test(t)) return `Did the response avoid the following: ${lowerFirst(t.replace(/^Do not /i, ''))}?`;
  return `Did the response ${lowerFirst(t)}?`;
}

// ---------- Scripted builders ----------
export function buildScoringQuestions(seed, skill, count, names, ctx) {
  const ideal = seed.ideal.slice(0, count);
  // A fifth question, when the plan asks for one, observes an effective indicator the seed did not cover.
  while (ideal.length < count) {
    const used = new Set(ideal.map((e) => e.indicator));
    const ind = effectiveIndicators(skill).find((x) => !used.has(x.id)) || effectiveIndicators(skill)[ideal.length % effectiveIndicators(skill).length];
    ideal.push({ text: `${ind.text.charAt(0).toUpperCase()}${ind.text.slice(1)}, using the specific facts of this situation`, indicator: ind.id, fact: ideal.length % seed.facts.length });
  }
  return ideal.map((el, i) => {
    const ind = skill.indicators.find((x) => x.id === el.indicator) || effectiveIndicators(skill)[i % effectiveIndicators(skill).length];
    const fact = fillTemplate(seed.facts[el.fact ?? i % seed.facts.length] || seed.facts[0], ctx, names);
    const stakeholder = fillTemplate(seed.stakeholders[i % seed.stakeholders.length] || 'the people involved', ctx, names);
    const elText = fillTemplate(el.text, ctx, names);
    return {
      id: uid('sq'), text: questionFromIdeal(elText), indicatorId: ind.id,
      anchors: {
        L0: `The answer does not ${lowerFirst(elText.replace(/^Be /, 'show being ').replace(/^Do not /, 'avoid: '))}.`,
        L1: `The answer touches on this in general terms, without using the specifics of the situation such as: ${lowerFirst(fact)}.`,
        L2: `The answer does this clearly and ties it to at least one specific fact from the situation, for example: ${lowerFirst(fact)}.`,
        L3: `The answer does this fully, uses the specific facts, shows the behavior "${ind.text}", and makes the consequence for ${stakeholder} explicit.`,
      },
      traceTo: [`ideal:${i}`, `fact:${el.fact ?? i % seed.facts.length}`],
      source: `Derived from the contextual analysis (ideal response element ${i + 1}); tied to ${skill.name} indicator ${ind.id}`,
    };
  });
}

function shuffleBy(arr, seedNum) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) { const j = (seedNum * 31 + i * 17) % (i + 1); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

export function buildMcq(seed, skill, count, names, ctx, seedNum = 0) {
  const eff = effectiveIndicators(skill);
  const ineff = skill.indicators.filter((i) => !i.effective);
  const questions = [];
  const src = seed.mcq || [];
  for (let k = 0; k < count; k++) {
    let q;
    if (k < src.length) q = { text: fillTemplate(src[k].q, ctx, names), options: src[k].options.map((o) => ({ text: fillTemplate(o.text, ctx, names), level: o.level })), source: `Generated from the ${skill.name} indicators and the contextual analysis` };
    else {
      // Extra question composed from the ideal elements and the weak answer patterns.
      const ideal = seed.ideal.map((e) => fillTemplate(e.text, ctx, names));
      const weak = seed.weak.map((w) => fillTemplate(w, ctx, names));
      q = { text: `Which single action would do most to move this situation forward?`, options: [
        { text: `${ideal[(k + 1) % ideal.length].replace(/\.$/, '')}, and check the effect with the people involved before the next step.`, level: 'L3' },
        { text: `${ideal[(k + 2) % ideal.length].replace(/\.$/, '')}, and leave the other elements of the situation for a later conversation.`, level: 'L2' },
        { text: `${weak[k % weak.length].replace(/\.$/, '')}, trusting that the situation will settle once the immediate pressure eases.`, level: 'L1' },
        { text: `${weak[(k + 1) % weak.length].replace(/\.$/, '')}, and treat the matter as closed unless someone raises it again.`, level: 'L0' },
      ], source: 'Composed from the ideal response elements and weak answer patterns; review recommended' };
    }
    const opts = shuffleBy(q.options, seedNum + k).map((o, oi) => {
      const indicator = o.level === 'L3' || o.level === 'L2' ? eff[(oi + k) % eff.length] : ineff[(oi + k) % Math.max(1, ineff.length)] || eff[0];
      return { id: uid('opt'), text: o.text, level: o.level, key: KEY_FOR_LEVEL[o.level], indicatorId: indicator.id, rationale: `${LEVEL_LABELS[o.level]} (${o.level}): ${skill.levels[o.level]}. ${o.level === 'L3' || o.level === 'L2' ? 'Shows' : 'Reflects'} the indicator "${indicator.text}".` };
    });
    questions.push({ id: uid('mq'), text: q.text, options: opts, source: q.source });
  }
  return questions;
}

function mediaFromSeed(seed, names, ctx) {
  if (!seed.media) return null;
  const m = JSON.parse(JSON.stringify(seed.media));
  m.title = fillTemplate(m.title, ctx, names); m.alt = fillTemplate(m.alt, ctx, names);
  if (m.data?.rows) m.data.rows = m.data.rows.map((r) => r.map((c) => fillTemplate(String(c), ctx, names)));
  m.referencedInSituation = true;
  m.source = 'Generated by the platform from the scenario\'s numbers';
  return m;
}

export function scriptedScenario(row, asm, index, { variant = 0 } = {}) {
  const skill = getSkill(row.skillId);
  const ctx = buildContext(asm);
  const seeds = seedsForSkill(row.skillId);
  const sameSkillIndex = (asm.blueprint?.rows || []).filter((r) => r.skillId === row.skillId).findIndex((r) => r.id === row.id);
  const seedIdx = Math.max(0, sameSkillIndex) % Math.max(1, seeds.length);
  const used = usedTitles(asm);
  const seed = seeds.find((s) => s.difficulty === row.difficulty && !used.has(s.title)) || seeds.find((s) => !used.has(s.title)) || seeds[seedIdx];
  const names = pickNames(index + variant * 5, 3);
  const isVariant = usedTitles(asm).has(seed.title) || variant > 0;
  const responseType = row.responseType;
  const situation = fillTemplate(seed.situation, ctx, names) + (isVariant ? ` ${fillTemplate('Since last quarter, {company} has also introduced a new approval step that slows every decision by a day.', ctx, names)}` : '');
  const sc = {
    id: uid('sc'), blueprintRowId: row.id, skillId: row.skillId, tag: seed.tag || row.tag, difficulty: seed.difficulty || row.difficulty, responseType,
    title: isVariant ? `${fillTemplate(seed.title, ctx, names)} (variant)` : fillTemplate(seed.title, ctx, names),
    contextHeader: fillTemplate(seed.header, ctx, names), situation,
    prompt: fillTemplate(responseType === 'MCQ' ? seed.mcqPrompt : seed.prompt, ctx, names),
    media: row.plannedMedia || seed.media ? mediaFromSeed(seed, names, ctx) : null,
    analysis: null, scoringQuestions: [], mcq: [], approved: false, flaggedForReview: false, calibration: responseType === 'MCQ' ? 'not_applicable' : 'pending',
    allowedTerms: names, version: 1, generatedBy: 'scripted', promptVersion: PROMPT_VERSION, modelVersion: 'scripted-library',
    source: row.seedSituation ? { kind: 'document', text: `Your document situation was noted (${row.seedSituation.source}). A library scenario was used; regenerate it to ground it in your documents.` } : { kind: 'indicators', text: `Generated from the ${skill.name} Skill indicators` },
    seedTitle: seed.title, pendingConfirmation: null,
  };
  if (isVariant) sc.source = { kind: 'variant', text: `Variant of a library scenario. Regenerate it or edit the situation so it is not a near duplicate.` };
  return analyzeScripted(sc, { seed, names, ctx, seedNum: index, plannedQuestions: row.plannedQuestions });
}

function usedTitles(asm) { return new Set((asm.scenarios || []).map((s) => s.seedTitle).filter(Boolean)); }

export function analyzeScripted(sc, { seed, names, ctx, seedNum = 0, plannedQuestions } = {}) {
  const skill = getSkill(sc.skillId);
  const fill = (t) => fillTemplate(t, ctx, names);
  const media = sc.media;
  const analysis = {
    keyFacts: seed.facts.map(fill), constraints: seed.constraints.map(fill), stakeholders: seed.stakeholders.map(fill),
    mediaShows: media ? mediaSummary(media) : [],
    idealMustAddress: seed.ideal.map((e) => ({ text: fill(e.text), indicatorId: e.indicator })),
    modelAnswer: fill(seed.modelAnswer), weakPatterns: seed.weak.map(fill),
    decisionAtStake: fill(seed.prompt),
    sources: [{ kind: 'indicators', text: `Generated from the ${skill.name} Skill indicators (${effectiveIndicators(skill).map((i) => i.id).join(', ')})` }, ...(media ? [{ kind: 'media', text: `Read from the ${media.type}: ${media.title || media.alt}` }] : [])],
  };
  const sqCount = sc.responseType !== 'MCQ' && plannedQuestions >= RULES.scoringQuestions.min && plannedQuestions <= RULES.scoringQuestions.max ? plannedQuestions : (seed.ideal.length >= 5 ? 5 : RULES.scoringQuestions.default);
  const out = { ...sc, analysis };
  if (sc.responseType === 'MCQ') { out.mcq = buildMcq(seed, skill, Math.min(RULES.mcq.questionsMax, plannedQuestions || sc.mcq?.length || 2), names, ctx, seedNum); out.scoringQuestions = []; out.cap = {}; }
  else { out.scoringQuestions = buildScoringQuestions(seed, skill, sqCount, names, ctx); out.mcq = []; out.cap = recommendCap(sc.responseType, analysis.modelAnswer); }
  out.recommendedMinutes = estimateScenarioMinutes(out);
  return out;
}

export function seedForScenario(sc) { return seedsForSkill(sc.skillId).find((s) => s.title === (sc.seedTitle || '').replace(' (variant)', '')) || seedsForSkill(sc.skillId)[0]; }

// Scripted reading of an edited situation: facts, constraints and stakeholders come from the author's text,
// so the analysis follows the edit even without a model. Scoring questions are kept from the instrument and
// re-traced to the new facts; the banner says so.
export function scriptedAnalysisFromText(sc, skill) {
  const sentences = splitSentences(sc.situation || '');
  const facts = sentences.filter((s) => /\d|"|'|percent|week|day|month|hour|minute|deadline|late|due|ago|since|already/i.test(s)).map((s) => s.replace(/\s+/g, ' ').trim()).slice(0, 6);
  const constraints = sentences.filter((s) => /\b(cannot|can't|must|only|within|before|no |not |never|limit|policy|approval|budget|deadline|has to|need to|needs)\b/i.test(s)).map((s) => s.trim()).slice(0, 4);
  const people = [...new Set((sc.situation.match(/\b[A-Z][a-z]{2,}\b/g) || []).filter((w) => !/^(You|Your|The|This|That|They|There|Then|When|What|After|Before|Two|Three|One|Head|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/.test(w)))].slice(0, 6);
  const roles = [...new Set((sc.situation.match(/\b(?:customer|client|team|colleague|manager|director|head office|regional manager|supervisor|staff|auditor|supplier|vendor|board|CFO|CEO|HR)\b/gi) || []).map((r) => r.toLowerCase()))].slice(0, 6);
  const stakeholders = [...people, ...roles].slice(0, 6);
  const ideal = (sc.analysis?.idealMustAddress || []).length ? sc.analysis.idealMustAddress : effectiveIndicators(skill).slice(0, 4).map((i) => ({ text: i.text, indicatorId: i.id }));
  return {
    keyFacts: facts.length ? facts : sentences.slice(0, 3), constraints, stakeholders,
    decisionAtStake: sc.prompt, mediaShows: sc.media ? mediaSummary(sc.media) : [],
    idealMustAddress: ideal, modelAnswer: sc.analysis?.modelAnswer || '', weakPatterns: sc.analysis?.weakPatterns || [],
    sources: [{ kind: 'text', text: 'Facts, constraints and stakeholders read from your edited situation (scripted mode). The scoring questions were kept and re-traced; review them against the new facts.' }, ...(sc.media ? [{ kind: 'media', text: `Read from the ${sc.media.type}: ${sc.media.title || sc.media.alt}` }] : [])],
    mode: 'scripted-text',
  };
}

// Re-run contextual analysis after the situation or media changed (FR-A7). Returns the scenario with
// new questions in pendingConfirmation and approval reset.

// Scripted regeneration: applies the instruction as a visible substitution and rotates library variants.
function scriptedRegenerate(sc, asm, { scope, targetId, optionId, instruction, sentenceIndex }) {
  const skill = getSkill(sc.skillId);
  const subst = parseSubstitution(instruction);
  const applyText = (t) => (subst ? t.replace(new RegExp(escapeRe(subst.from), 'gi'), subst.to) : t);
  if (scope === 'scenario' && /\b(shorter|shorten|trim|tighter)\b/i.test(instruction || '')) {
    const sentences = splitSentences(sc.situation);
    if (sentences.length > 6) { const keep = sentences.filter((_, i) => i !== sentences.length - 2 && i !== Math.floor(sentences.length / 2)); return { ok: true, scenario: { ...sc, situation: keep.join(' '), approved: false, version: (sc.version || 1) + 1 }, mode: 'scripted', note: 'Removed two sentences to shorten the situation. Re-check the facts the scoring questions rely on.' }; }
    return { ok: false, scenario: sc, mode: 'scripted', note: 'The situation is already at the minimum length for a scenario.' };
  }
  if (scope === 'scenario') {
    const seeds = seedsForSkill(sc.skillId);
    const used = usedTitles(asm);
    const alt = seeds.find((s) => s.title !== (sc.seedTitle || '').replace(' (variant)', '') && !used.has(s.title));
    const ctx = buildContext(asm);
    const names = pickNames((sc.version || 1) * 3 + 2, 3);
    if (alt && !subst) {
      const rebuilt = analyzeScripted({ ...sc, title: fillTemplate(alt.title, ctx, names), contextHeader: fillTemplate(alt.header, ctx, names), situation: fillTemplate(alt.situation, ctx, names), prompt: fillTemplate(sc.responseType === 'MCQ' ? alt.mcqPrompt : alt.prompt, ctx, names), media: alt.media ? mediaFromSeed(alt, names, ctx) : null, tag: alt.tag, difficulty: alt.difficulty, allowedTerms: names, seedTitle: alt.title, approved: false, version: (sc.version || 1) + 1, source: { kind: 'indicators', text: `Regenerated from the ${skill.name} library${instruction ? ` (instruction noted: "${instruction}")` : ''}` } }, { seed: alt, names, ctx, plannedQuestions: sc.mcq?.length || 2 });
      return { ok: true, scenario: rebuilt, mode: 'scripted' };
    }
    const next = { ...sc, situation: applyText(sc.situation), contextHeader: applyText(sc.contextHeader), prompt: applyText(sc.prompt), approved: false, version: (sc.version || 1) + 1 };
    return { ok: Boolean(subst), scenario: subst ? next : sc, mode: 'scripted', note: subst ? `Applied "${subst.from}" to "${subst.to}" across the scenario.` : 'Scripted mode can apply instructions of the form "make this about X, not Y" or "replace X with Y". Use AI regeneration for free form instructions.' };
  }
  if (scope === 'sentence') {
    const sentences = splitSentences(sc.situation);
    if (subst) { sentences[sentenceIndex] = applyText(sentences[sentenceIndex]); return { ok: true, scenario: { ...sc, situation: sentences.join(' '), approved: false }, mode: 'scripted', note: 'Applied the substitution to the sentence. Re-run the analysis if the facts changed.' }; }
    return { ok: false, scenario: sc, mode: 'scripted', note: 'Scripted mode can apply "replace X with Y" to a sentence. Edit the sentence inline or use AI regeneration.' };
  }
  if (scope === 'question') {
    const q = sc.scoringQuestions.find((x) => x.id === targetId);
    const seed = seedForScenario(sc);
    const usedInd = new Set(sc.scoringQuestions.filter((x) => x.id !== targetId).map((x) => x.indicatorId));
    const ind = effectiveIndicators(skill).find((i) => !usedInd.has(i.id)) || effectiveIndicators(skill)[0];
    const el = seed?.ideal.find((e) => e.indicator === ind.id);
    const ctx = buildContext(asm); const names = sc.allowedTerms?.length >= 3 ? sc.allowedTerms : pickNames(1, 3);
    const text = subst ? applyText(q.text) : el ? questionFromIdeal(fillTemplate(el.text, ctx, names)) : `Did the response ${lowerFirst(ind.text)}?`;
    const rebuilt = { ...q, text, indicatorId: ind.id, anchors: subst ? Object.fromEntries(Object.entries(q.anchors).map(([k, v]) => [k, applyText(v)])) : { L0: `The answer does not ${lowerFirst(ind.text)}.`, L1: `The answer gestures at this in general terms without using the specifics of the situation.`, L2: `The answer does this clearly with reference to at least one specific fact from the situation or media.`, L3: `The answer does this fully, ties it to the specific facts and makes the consequence for the people involved explicit, showing "${ind.text}".` }, source: `Regenerated${instruction ? ` with instruction "${instruction}"` : ''}; tied to ${skill.name} indicator ${ind.id}` };
    return { ok: true, scenario: { ...sc, approved: false, scoringQuestions: sc.scoringQuestions.map((x) => (x.id === targetId ? rebuilt : x)) }, mode: 'scripted' };
  }
  if (scope === 'mcqQuestion' || scope === 'option') {
    const q = sc.mcq.find((x) => x.id === targetId);
    if (!q) return { ok: false, scenario: sc, mode: 'scripted' };
    if (scope === 'option') {
      const opt = q.options.find((o) => o.id === optionId);
      const seed = seedForScenario(sc);
      const ctx = buildContext(asm); const names = sc.allowedTerms?.length >= 3 ? sc.allowedTerms : pickNames(1, 3);
      const pool = opt.level === 'L3' || opt.level === 'L2' ? (seed?.ideal || []).map((e) => `${fillTemplate(e.text, ctx, names)}, and follow through with the people involved.`) : (seed?.weak || []).map((w) => `${fillTemplate(w, ctx, names)}.`);
      const fresh = pool.find((t) => !q.options.some((o) => o.text === t)) || opt.text;
      const text = subst ? applyText(opt.text) : fresh;
      return { ok: true, scenario: { ...sc, approved: false, mcq: sc.mcq.map((x) => (x.id === targetId ? { ...x, options: x.options.map((o) => (o.id === optionId ? { ...o, text, rekeyed: { before: o.key, after: o.key } } : o)) } : x)) }, mode: 'scripted', note: 'Option regenerated from the library. Its value was kept; adjust it if the new text sits at a different level.' };
    }
    const seed = seedForScenario(sc);
    const ctx = buildContext(asm); const names = sc.allowedTerms?.length >= 3 ? sc.allowedTerms : pickNames(1, 3);
    const idx = sc.mcq.findIndex((x) => x.id === targetId);
    const rebuilt = buildMcq(seed, skill, idx + 1, names, ctx, (sc.version || 1) * 7)[idx];
    return { ok: true, scenario: { ...sc, approved: false, mcq: sc.mcq.map((x) => (x.id === targetId ? { ...rebuilt, id: x.id, text: subst ? applyText(rebuilt.text) : rebuilt.text } : x)) }, mode: 'scripted' };
  }
  return { ok: false, scenario: sc, mode: 'scripted' };
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// "make this about a distributor, not a retailer" or "replace retailer with distributor" or "X -> Y"
export function parseSubstitution(instruction = '') {
  let m = instruction.match(/about (?:a |an |the )?(.+?),\s*not (?:a |an |the )?(.+)$/i);
  if (m) return { from: m[2].trim().replace(/\.$/, ''), to: m[1].trim() };
  m = instruction.match(/replace (?:the )?(.+?) with (?:the )?(.+)$/i);
  if (m) return { from: m[1].trim(), to: m[2].trim().replace(/\.$/, '') };
  m = instruction.match(/change (?:the )?(.+?) to (?:the )?(.+)$/i);
  if (m) return { from: m[1].trim(), to: m[2].trim().replace(/\.$/, '') };
  m = instruction.match(/^(.+?)\s*(?:->|=>|to)\s*(.+)$/i);
  if (m && m[1].split(' ').length <= 3) return { from: m[1].trim(), to: m[2].trim() };
  return null;
}

// Re-key after an option or anchor edit (Step 4). The AI re-evaluates the level and value.
