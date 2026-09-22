import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../src/content/rules.js';
import { SKILLS, getSkill } from '../src/content/ontology.js';
import { SEEDS } from '../src/content/seeds.js';
import { planBlueprint, setRowType, addRow, removeRow, applyReductionOrder, recompute } from '../src/engine/blueprint.js';
import { estimateScenarioMinutes, recommendCap, observationsFor } from '../src/engine/duration.js';
import { runQualityGate } from '../src/engine/qualityGate.js';
import { scriptedScenario, parseSubstitution, buildContext } from '../src/engine/generator.js';
import { detectPII, anonymize } from '../src/engine/pii.js';
import { biasScreen } from '../src/engine/bias.js';
import { proposeSkills, mapClientSkill, searchSkills } from '../src/engine/mapping.js';
import { skillScore, overallScore, aggregate, observationScoreFromKey, observationScoreFromLevel, confidenceFor } from '../src/engine/scoring.js';
import { similarity, readingGrade, wordCount } from '../src/engine/text.js';
import { bandFor } from '../src/content/rules.js';

function build(skillIds, approve = true, opts = {}) {
  const asm = { intent: { audience: 'first line managers', purpose: 'baseline', terminology: opts.terminology || '' }, skills: skillIds.map((id) => ({ id })), scenarios: [], config: { expectedParticipants: 30 } };
  asm.blueprint = planBlueprint(skillIds);
  asm.blueprint.rows.forEach((r, i) => { asm.scenarios.push({ ...scriptedScenario(r, asm, i), approved: approve }); });
  return asm;
}

test('ontology: every Skill has effective and ineffective indicators and four levels', () => {
  for (const s of SKILLS) {
    assert.ok(s.indicators.filter((i) => i.effective).length >= 4, s.id);
    assert.ok(s.indicators.some((i) => !i.effective), s.id);
    for (const l of ['L0', 'L1', 'L2', 'L3']) assert.ok(s.levels[l], `${s.id} ${l}`);
  }
});

test('seeds: three per Skill, situations 120 to 250 words, MCQ options 15 to 40 words with all four levels', () => {
  for (const s of SKILLS) assert.equal(SEEDS.filter((x) => x.skillId === s.id).length, 3, s.id);
  for (const seed of SEEDS) {
    const w = wordCount(seed.situation);
    assert.ok(w >= 120 && w <= 250, `${seed.title}: ${w} words`);
    assert.ok(seed.ideal.length >= 4, seed.title);
    for (const q of seed.mcq) {
      assert.deepEqual([...q.options.map((o) => o.level)].sort(), ['L0', 'L1', 'L2', 'L3'], seed.title);
      for (const o of q.options) { const n = wordCount(o.text); assert.ok(n >= 15 && n <= 40, `${seed.title}: option ${n} words`); }
    }
    for (const el of seed.ideal) assert.ok(getSkill(seed.skillId).indicators.some((i) => i.id === el.indicator), `${seed.title} ${el.indicator}`);
  }
});

test('blueprint: 3 to 5 Skills always yield 6 to 12 scenarios, 2+ per Skill, 8+ observations, one open response per Skill', () => {
  for (const ids of [['SK-COACH', 'SK-FEEDBK', 'SK-PRIOR'], ['SK-PRIOR', 'SK-DATADEC', 'SK-RISK', 'SK-COMM'], ['SK-COACH', 'SK-FEEDBK', 'SK-PRIOR', 'SK-DATADEC', 'SK-RISK']]) {
    const bp = planBlueprint(ids);
    assert.ok(bp.rows.length >= RULES.scenarios.totalMin && bp.rows.length <= RULES.scenarios.totalMax, `${ids.length} skills: ${bp.rows.length} rows`);
    for (const id of ids) {
      const p = bp.perSkill[id];
      assert.ok(p.scenarios >= 2, `${id} scenarios ${p.scenarios}`);
      assert.ok(p.observations >= 8, `${id} observations ${p.observations}`);
      assert.ok(p.open >= 1, `${id} open ${p.open}`);
    }
    assert.ok(bp.totalMinutes <= RULES.time.totalHard, `${bp.totalMinutes} min`);
  }
});

test('blueprint: reduction order simplifies media, converts to MCQ, drops, then simplifies complexity, and records every change', () => {
  const bp = planBlueprint(['SK-COACH', 'SK-FEEDBK', 'SK-PRIOR', 'SK-DATADEC']);
  const kinds = bp.changes.map((c) => c.kind);
  const firstConvert = kinds.indexOf('convert'), lastMedia = kinds.lastIndexOf('media'), firstSimplify = kinds.indexOf('simplify');
  if (firstConvert >= 0 && lastMedia >= 0) assert.ok(lastMedia < firstConvert, 'media before convert');
  if (firstSimplify >= 0 && firstConvert >= 0) assert.ok(firstConvert < firstSimplify, 'convert before simplify');
  for (const c of bp.changes) assert.ok(c.text.length > 10);
  // Over target plans are reduced; a plan already under target is untouched.
  const small = recompute({ rows: planBlueprint(['SK-COACH', 'SK-FEEDBK', 'SK-PRIOR']).rows.slice(0, 6), changes: [] });
  assert.equal(applyReductionOrder(small, 200).changes.length, 0);
});

test('blueprint: switching response type recomputes observations and time live; add and remove respect limits', () => {
  let bp = planBlueprint(['SK-COACH', 'SK-FEEDBK', 'SK-PRIOR']);
  const row = bp.rows.find((r) => r.responseType !== 'MCQ');
  const before = bp.perSkill[row.skillId].observations;
  bp = setRowType(bp, row.id, 'MCQ');
  assert.equal(bp.perSkill[row.skillId].observations, before - RULES.scoringQuestions.default + 2);
  let r = addRow(bp, 'SK-COACH'); assert.ok(!r.error); bp = r.bp;
  while (bp.rows.length < RULES.scenarios.totalMax) { r = addRow(bp, 'SK-FEEDBK'); bp = r.bp; }
  assert.ok(addRow(bp, 'SK-PRIOR').error, 'blocked above 12');
  const coachRows = bp.rows.filter((x) => x.skillId === 'SK-COACH');
  let res = removeRow(bp, coachRows[0].id); bp = res.bp; res = removeRow(bp, coachRows[1].id); bp = res.bp;
  assert.ok(removeRow(bp, coachRows[2].id).error, 'blocked below 2 per Skill');
});

test('duration: scenario estimates stay within 5 to 15 minutes and caps within range and never shorter than the model answer', () => {
  const asm = build(['SK-COACH', 'SK-FEEDBK', 'SK-PRIOR']);
  for (const sc of asm.scenarios) {
    assert.ok(sc.recommendedMinutes >= 5 && sc.recommendedMinutes <= 15, `${sc.title} ${sc.recommendedMinutes}`);
    if (sc.responseType === 'Text') { assert.ok(sc.cap.textChars >= 1000 && sc.cap.textChars <= 2000); assert.ok(sc.cap.textChars >= sc.analysis.modelAnswer.length); }
    if (sc.responseType === 'Audio') { assert.ok(sc.cap.audioSeconds >= 30 && sc.cap.audioSeconds <= 120); }
  }
  assert.deepEqual(recommendCap('Text', 'x'.repeat(1900)), { textChars: 2000 });
  assert.deepEqual(recommendCap('Audio', 'word '.repeat(400)), { audioSeconds: 120 });
  assert.deepEqual(recommendCap('MCQ', 'anything'), {});
});

test('generator: scripted scenarios carry 4 or 5 scoring questions with indicators, four distinct anchors, a model answer, and MCQ keys that discriminate', () => {
  const asm = build(SKILLS.slice(0, 5).map((s) => s.id), true, { terminology: 'Helios Works, Helios Assist' });
  assert.ok(asm.scenarios.some((s) => s.situation.includes('Helios Works')), 'client terminology used');
  for (const sc of asm.scenarios) {
    assert.ok(!/\{p[123]\}|\{company\}|\{product\}/.test(sc.situation + sc.contextHeader + sc.prompt), 'placeholders filled');
    if (sc.responseType === 'MCQ') {
      assert.ok(sc.mcq.length >= 1 && sc.mcq.length <= 3);
      for (const q of sc.mcq) { assert.ok(q.options.length <= 4); assert.ok(q.options.some((o) => o.key >= 4) && q.options.some((o) => o.key <= 2)); for (const o of q.options) assert.ok(o.rationale && o.indicatorId); }
    } else {
      assert.ok(sc.scoringQuestions.length >= 4 && sc.scoringQuestions.length <= 5);
      assert.ok(sc.analysis.modelAnswer.length > 200);
      for (const q of sc.scoringQuestions) { assert.ok(q.indicatorId); assert.equal(new Set(Object.values(q.anchors).map((a) => a.toLowerCase())).size, 4); assert.ok(q.traceTo.length); }
    }
    assert.ok(sc.source?.text, 'every generated element shows its source');
  }
});

test('quality gate: a well formed approved assessment has no hard blocks', () => {
  const asm = build(['SK-COACH', 'SK-FEEDBK', 'SK-PRIOR']);
  const gate = runQualityGate(asm);
  assert.deepEqual(gate.hard.map((h) => h.rule), [], gate.hard.map((h) => h.message).join('\n'));
  assert.ok(gate.canPublish);
});

// One failing fixture per hard rule (PRD acceptance criteria). Each block message must name the fix.
const fixtures = {
  scenariosPerSkill: (a) => ({ ...a, scenarios: a.scenarios.filter((s, i) => !(s.skillId === 'SK-COACH' && i > 0)) }),
  observationsPerSkill: (a) => ({ ...a, scenarios: a.scenarios.map((s) => (s.skillId === 'SK-PRIOR' && s.responseType === 'MCQ' ? { ...s, mcq: s.mcq.slice(0, 1) } : s)) }),
  sqCount: (a) => mut(a, (s) => s.responseType !== 'MCQ', (s) => ({ ...s, scoringQuestions: s.scoringQuestions.slice(0, 3) })),
  sqIndicator: (a) => mut(a, (s) => s.responseType !== 'MCQ', (s) => ({ ...s, scoringQuestions: s.scoringQuestions.map((q, i) => (i === 0 ? { ...q, indicatorId: null } : q)) })),
  sqAnchors: (a) => mut(a, (s) => s.responseType !== 'MCQ', (s) => ({ ...s, scoringQuestions: s.scoringQuestions.map((q, i) => (i === 0 ? { ...q, anchors: { ...q.anchors, L2: '' } } : q)) })),
  sqAnchorsDistinct: (a) => mut(a, (s) => s.responseType !== 'MCQ', (s) => ({ ...s, scoringQuestions: s.scoringQuestions.map((q, i) => (i === 0 ? { ...q, anchors: { ...q.anchors, L2: q.anchors.L1 } } : q)) })),
  sqTrace: (a) => mut(a, (s) => s.responseType !== 'MCQ', (s) => ({ ...s, scoringQuestions: s.scoringQuestions.map((q, i) => (i === 0 ? { ...q, traceTo: [], text: 'Did the response mention the weather in Antarctica?' } : q)) })),
  modelAnswer: (a) => mut(a, (s) => s.responseType !== 'MCQ', (s) => ({ ...s, analysis: { ...s.analysis, modelAnswer: '' } })),
  mcqOptions: (a) => mut(a, (s) => s.responseType === 'MCQ', (s) => ({ ...s, mcq: s.mcq.map((q, i) => (i === 0 ? { ...q, options: [...q.options, { ...q.options[0], id: 'x' }] } : q)) })),
  mcqCount: (a) => mut(a, (s) => s.responseType === 'MCQ', (s) => ({ ...s, mcq: [...s.mcq, ...s.mcq, ...s.mcq, ...s.mcq].map((q, i) => ({ ...q, id: `q${i}` })) })),
  mcqRationale: (a) => mut(a, (s) => s.responseType === 'MCQ', (s) => ({ ...s, mcq: s.mcq.map((q, i) => (i === 0 ? { ...q, options: q.options.map((o, j) => (j === 0 ? { ...o, rationale: '' } : o)) } : q)) })),
  mcqDiscrimination: (a) => mut(a, (s) => s.responseType === 'MCQ', (s) => ({ ...s, mcq: s.mcq.map((q, i) => (i === 0 ? { ...q, options: q.options.map((o) => ({ ...o, key: 3 })) } : q)) })),
  cap: (a) => mut(a, (s) => s.responseType === 'Text', (s) => ({ ...s, cap: { textChars: 900 } })),
  capShort: (a) => mut(a, (s) => s.responseType === 'Text', (s) => ({ ...s, cap: { textChars: 1000 }, analysis: { ...s.analysis, modelAnswer: 'x'.repeat(1500) } })),
  purity: (a) => mut(a, (s) => s.responseType !== 'MCQ', (s) => ({ ...s, scoringQuestions: s.scoringQuestions.map((q, i) => (i === 0 ? { ...q, indicatorId: 'PRIOR-E1' } : q)) })),
  duplicate: (a) => ({ ...a, scenarios: a.scenarios.map((s, i) => (i === 1 ? { ...s, situation: a.scenarios[0].situation } : s)) }),
  bias: (a) => mut(a, () => true, (s) => ({ ...s, situation: `${s.situation} The team lead, who is pregnant, disagrees.` })),
  duration: (a) => mut(a, () => true, (s) => ({ ...s, recommendedMinutes: 16 })),
  totalDuration: (a) => ({ ...a, scenarios: a.scenarios.map((s) => ({ ...s, recommendedMinutes: 15 })) }),
  mediaAlt: (a) => mut(a, () => true, (s) => ({ ...s, media: { type: 'image', src: 'data:', bytes: 1000, alt: '' }, analysis: { ...s.analysis, mediaShows: ['x'] } })),
  mediaAnalysis: (a) => mut(a, () => true, (s) => ({ ...s, media: { type: 'image', src: 'data:', bytes: 1000, alt: 'A chart' }, analysis: { ...s.analysis, mediaShows: [] } })),
  mediaSize: (a) => mut(a, () => true, (s) => ({ ...s, media: { type: 'image', src: 'data:', bytes: 3 * 1024 * 1024, alt: 'A chart' }, analysis: { ...s.analysis, mediaShows: ['x'] } })),
  approval: (a) => mut(a, () => true, (s) => ({ ...s, approved: false })),
  pending: (a) => mut(a, () => true, (s) => ({ ...s, pendingConfirmation: { before: {}, changed: [] } })),
  calibration: (a) => ({ ...a, config: { expectedParticipants: 200 } }),
  skills: (a) => ({ ...a, skills: a.skills.slice(0, 2) }),
  total: (a) => ({ ...a, scenarios: a.scenarios.slice(0, 5) }),
  mcqOnly: (a) => ({ ...a, scenarios: a.scenarios.map((s) => (s.skillId === 'SK-PRIOR' ? { ...s, responseType: 'MCQ', scoringQuestions: [], mcq: s.mcq?.length ? s.mcq : [{ id: 'q', text: 'Q', options: [{ id: 'a', text: 'a', key: 5, rationale: 'r', indicatorId: 'PRIOR-E1' }, { id: 'b', text: 'b', key: 1, rationale: 'r', indicatorId: 'PRIOR-E1' }] }] } : s)) }),
};
function mut(a, pick, fn) { let done = false; return { ...a, scenarios: a.scenarios.map((s) => { if (!done && pick(s)) { done = true; return fn(s); } return s; }) }; }

for (const [rule, fx] of Object.entries(fixtures)) {
  test(`quality gate blocks publish on: ${rule}`, () => {
    const asm = fx(build(['SK-COACH', 'SK-FEEDBK', 'SK-PRIOR']));
    const gate = runQualityGate(asm);
    const hit = gate.hard.find((h) => h.rule === rule);
    assert.ok(hit, `expected hard block ${rule}; got ${gate.hard.map((h) => h.rule).join(',')}`);
    assert.ok(hit.fix && hit.fix.length > 5, 'block message names the fix');
    assert.equal(gate.canPublish, false);
  });
}

test('quality gate: soft warnings for exactly 2 scenarios and 8 to 11 observations, never hard', () => {
  const asm = build(['SK-COACH', 'SK-FEEDBK', 'SK-PRIOR']);
  const gate = runQualityGate(asm);
  const coach = gate.issues.filter((i) => i.skillId === 'SK-COACH');
  assert.ok(coach.every((i) => i.severity === 'soft'));
});

test('PII: detects emails, phones, ids and names, exempts scenario characters, redacts SPII entirely, keeps stable placeholders', () => {
  const text = 'Customer Ravi Kumar (ravi.kumar@example.com, +91 98765 43210) complained. Employee EMP-48213 was diagnosed with depression. PAN ABCDE1234F. Priya said the team was late. Later Ravi Kumar called again.';
  const f = detectPII(text, { allowNames: ['Priya'] });
  const types = new Set(f.map((x) => x.type));
  for (const t of ['EMAIL', 'PHONE', 'EMPLOYEE_ID', 'HEALTH', 'PAN', 'NAME']) assert.ok(types.has(t), t);
  const out = anonymize(text, f);
  assert.ok(!out.text.includes('ravi.kumar@'));
  assert.ok(!out.text.includes('depression'));
  assert.ok(out.text.includes('[Redacted]'));
  assert.ok(out.text.includes('Priya'));
  assert.equal((out.text.match(/\[Person\]/g) || []).length, 2, 'same person gets the same placeholder');
});

test('bias screen: flags protected characteristics and stereotypes, not ordinary operational words', () => {
  assert.ok(biasScreen('The candidate is pregnant and slow.').length > 0);
  assert.ok(biasScreen('The girls in reception handle the post.').length > 0);
  assert.equal(biasScreen('The engineer diagnosed and fixed the payment outage and the elderly customer waited.').filter((b) => b.term === 'health').length, 0);
});

test('mapping: proposes 3 to 5 Skills with confidence and maps a client Skill name to the nearest ontology Skill', () => {
  const p = proposeSkills('Managers need to coach their reports, give feedback after customer calls and prioritize competing requests under deadline pressure.');
  assert.ok(p.proposed.length >= 3 && p.proposed.length <= 5);
  const ids = p.proposed.map((x) => x.id);
  assert.ok(ids.includes('SK-COACH') && ids.includes('SK-FEEDBK') && ids.includes('SK-PRIOR'));
  assert.ok(p.proposed.every((x) => ['High', 'Medium', 'Low'].includes(x.confidence)));
  const m = mapClientSkill('Delegating and empowerment');
  assert.equal(m.primary.id, 'SK-DELEG');
  assert.ok(mapClientSkill('Quantum basket weaving').gap);
  assert.ok(searchSkills('saying no').some((r) => r.id === 'SK-PRIOR'));
});

test('scoring: formulas match PRD section 13 to one decimal', () => {
  assert.equal(observationScoreFromLevel(3), 1); assert.equal(observationScoreFromLevel(0), 0);
  assert.equal(observationScoreFromKey(5), 1); assert.equal(observationScoreFromKey(1), 0); assert.equal(observationScoreFromKey(3), 0.5);
  assert.equal(skillScore([{ score: 1 }, { score: 1 }]), 10);
  assert.equal(skillScore([{ score: 0 }, { score: 0 }]), 1);
  assert.equal(skillScore([{ score: 2 / 3 }, { score: 1 / 3 }, { score: 1 }, { score: 0.5 }]), 6.6);
  assert.equal(overallScore([{ score: 8, observations: 12 }, { score: 5, observations: 8 }]), 6.8);
  const agg = aggregate({ A: Array(12).fill({ score: 1 }), B: Array(8).fill({ score: 0.5 }) });
  assert.equal(agg.skills[0].confidence, 'High'); assert.equal(agg.skills[1].confidence, 'Medium');
  assert.equal(agg.skills[0].weightShare, 60);
  assert.equal(bandFor(7.4).name, 'Proficient'); assert.equal(bandFor(6.9).name, 'Competent'); assert.equal(bandFor(1).name, 'Novice'); assert.equal(bandFor(9).name, 'Role Model');
  assert.equal(confidenceFor({ observations: 12, integrityFlag: true }), 'Low');
  assert.equal(confidenceFor({ observations: 12, thirdPass: true }), 'Medium');
});

test('text: similarity flags near duplicates and not distinct situations; reading grade is computed', () => {
  const a = SEEDS[0].situation, b = SEEDS[1].situation;
  assert.ok(similarity(a, a) > 0.9);
  assert.ok(similarity(a, b) < RULES.similarityThreshold);
  assert.ok(readingGrade(a) > 5);
});

test('regeneration: plain instructions of the form "about X, not Y" parse into substitutions', () => {
  assert.deepEqual(parseSubstitution('make this about a distributor, not a retailer'), { from: 'retailer', to: 'distributor' });
  assert.deepEqual(parseSubstitution('replace Northwind with Acme'), { from: 'Northwind', to: 'Acme' });
  assert.equal(parseSubstitution('make it more dramatic'), null);
});

test('context: client terminology drives company and product names, neutral otherwise', () => {
  assert.equal(buildContext({ intent: { terminology: 'Helios Works, Helios Assist' } }).company, 'Helios Works');
  assert.equal(buildContext({ intent: { terminology: '' } }).company, 'your company');
});

import { shuffledOrder, fixedOrder, violations, hashSeed } from '../src/engine/form.js';
test('form order: shuffled per participant, stable per seed, Skills interleaved, no three audio in a row', () => {
  const asm = build(['SK-COACH', 'SK-FEEDBK', 'SK-PRIOR', 'SK-DATADEC']);
  const a = shuffledOrder(asm.scenarios, 'attempt-1'), b = shuffledOrder(asm.scenarios, 'attempt-2'), a2 = shuffledOrder(asm.scenarios, 'attempt-1');
  assert.deepEqual(a.map((s) => s.id), a2.map((s) => s.id), 'same seed, same order');
  assert.notDeepEqual(a.map((s) => s.id), b.map((s) => s.id), 'different participants, different order');
  assert.equal(a.length, asm.scenarios.length);
  assert.equal(new Set(a.map((s) => s.id)).size, asm.scenarios.length);
  for (let seed = 0; seed < 50; seed++) assert.deepEqual(violations(shuffledOrder(asm.scenarios, seed)), [], `seed ${seed}`);
  assert.deepEqual(violations(fixedOrder(asm.scenarios)), []);
  assert.notEqual(hashSeed('a'), hashSeed('b'));
});

import { icc1, computeAgreement, practiceResponses, parseResponses, emptyCalibration } from '../src/engine/calibration.js';
import { snapshot, undo, pushHistory, isEmptyDraft, newAssessment, HISTORY_LIMIT } from '../src/engine/store.js';
import { scriptedAnalysisFromText } from '../src/engine/generator.js';

test('calibration: ICC(1) agrees for identical raters, falls for noise, and gates activation on both thresholds', () => {
  assert.equal(icc1([[0, 0], [1, 1], [2, 2], [3, 3], [1, 1]]), 1);
  assert.ok(icc1([[0, 3], [3, 0], [1, 2], [2, 1], [0, 3]]) < 0.3);
  assert.equal(icc1([[1, 1]]), null, 'too few pairs');
  const asm = build(['SK-COACH', 'SK-FEEDBK', 'SK-PRIOR']);
  const sc = asm.scenarios.find((s) => s.responseType !== 'MCQ');
  const cal = emptyCalibration();
  cal.responses = practiceResponses(sc);
  assert.equal(cal.responses.length, 30);
  let agg = computeAgreement(sc, cal);
  assert.equal(agg.canActivate, false);
  assert.ok(agg.blockers.some((b) => /need both calibrators/.test(b)));
  // Two calibrators and the AI all agree with the expected level of each practice response.
  cal.responses = cal.responses.map((r) => { const lv = {}; for (const q of sc.scoringQuestions) lv[q.id] = r.expected; return { ...r, ratings: { A: lv, B: lv }, ai: lv }; });
  agg = computeAgreement(sc, cal);
  assert.equal(agg.canActivate, true);
  assert.ok(agg.perQuestion.every((p) => p.humanHuman === 1 && p.aiHuman === 1));
  // AI systematically off by two levels on one question blocks activation for that question only.
  const q0 = sc.scoringQuestions[0].id;
  cal.responses = cal.responses.map((r) => ({ ...r, ai: { ...r.ai, [q0]: (r.expected + 2) % 4 } }));
  agg = computeAgreement(sc, cal);
  assert.equal(agg.canActivate, false);
  assert.ok(agg.perQuestion[0].aiHuman < 0.75 && agg.perQuestion[1].aiHuman === 1);
  assert.equal(parseResponses('1. I would first ask the person what is going on.\n\n2. Tell them to fix it.\n\nshort').length, 2, 'numbered paragraphs split; fragments under 20 characters are dropped');
});

test('store: snapshots exclude document bodies, history is capped, undo keeps documents, empty drafts are detected', () => {
  let a = newAssessment();
  assert.ok(isEmptyDraft(a));
  a = { ...a, intent: { ...a.intent, audience: 'Store managers', documents: [{ id: 'd1', text: 'x'.repeat(50000), anonymizedText: 'x'.repeat(50000), confirmed: true }] } };
  assert.ok(!isEmptyDraft(a));
  assert.ok(snapshot(a).length < 5000, 'document bodies are not in the snapshot');
  for (let i = 0; i < 40; i++) a = pushHistory({ ...a, intent: { ...a.intent, audience: `Audience ${i}` } }, snapshot(a));
  assert.equal(a.history.length, HISTORY_LIMIT);
  const u = undo(a);
  assert.equal(u.intent.documents.length, 1, 'undo keeps the documents');
  assert.equal(u.intent.audience, 'Audience 38');
});

test('scripted re-analysis reads facts, constraints and stakeholders from the edited situation', () => {
  const asm = build(['SK-COACH', 'SK-FEEDBK', 'SK-PRIOR']);
  const sc = asm.scenarios.find((s) => s.responseType !== 'MCQ');
  const edited = { ...sc, situation: 'You manage a store. Ravi says his delivery is two weeks late and a refund was promised. The policy says refunds above 50 need head office approval within two days. Two staff are absent and the weekend rota is unfilled. You have twenty minutes before the evening rush.' };
  const a = scriptedAnalysisFromText(edited, getSkill(sc.skillId));
  assert.ok(a.keyFacts.some((f) => /two weeks late|refund/.test(f)));
  assert.ok(a.constraints.some((c) => /approval|within two days/.test(c)));
  assert.ok(a.stakeholders.includes('Ravi'));
  assert.equal(a.mode, 'scripted-text');
});

test('PII: common first names are caught without a cue word; mapping no longer fires on "delivery"', () => {
  const f = detectPII('Priya Sharma from the Mumbai store called about order 4471.');
  assert.ok(f.some((x) => x.type === 'NAME' && x.value === 'Priya Sharma'));
  const p = proposeSkills('Store managers coach new colleagues, give feedback and handle late deliveries.');
  assert.ok(!p.proposed.slice(0, 2).some((x) => x.id === 'SK-PLAN' && x.confidence === 'High'));
});
