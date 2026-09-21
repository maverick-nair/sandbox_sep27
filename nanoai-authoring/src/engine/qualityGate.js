// Quality gate (PRD 9.1 Step 6). Runs continuously. Hard failures block publish; soft warnings carry a fix.
// Every message speaks in outcomes the author can act on, never in formulas.
import { RULES } from '../content/rules.js';
import { getSkill, SKILLS, indicatorById } from '../content/ontology.js';
import { observationsFor, modelAnswerInCapUnits, estimateScenarioMinutes } from './duration.js';
import { similarity, readingGrade, wordCount, normalize } from './text.js';
import { biasScreen } from './bias.js';

function issue(rule, severity, message, fix, extra = {}) { return { id: `${rule}:${extra.scenarioId || extra.skillId || 'all'}:${extra.detail || ''}`, rule, severity, message, fix, ...extra }; }

export function scenarioLabel(sc, index) { return sc.title || `Scenario ${index + 1}`; }

export function runQualityGate(assessment) {
  const out = [];
  const scenarios = assessment.scenarios || [];
  const skills = assessment.skills || [];
  const skillIds = skills.map((s) => s.id);

  // Skills count
  if (skillIds.length < RULES.skills.min) out.push(issue('skills', 'hard', `Choose at least ${RULES.skills.min} Skills. An assessment with fewer cannot separate strengths from gaps.`, 'Add a Skill in step 2.', { step: 2 }));
  if (skillIds.length > RULES.skills.max) out.push(issue('skills', 'hard', `Choose at most ${RULES.skills.max} Skills so the assessment stays short form.`, 'Remove a Skill in step 2.', { step: 2 }));

  if (scenarios.length < RULES.scenarios.totalMin) out.push(issue('total', 'hard', `Add scenarios to reach at least ${RULES.scenarios.totalMin}.`, 'Return to the blueprint and add a scenario.', { step: 3 }));
  if (scenarios.length > RULES.scenarios.totalMax) out.push(issue('total', 'hard', `Reduce to ${RULES.scenarios.totalMax} scenarios or fewer.`, 'Return to the blueprint and remove a scenario.', { step: 3 }));

  // Per Skill coverage
  for (const skillId of skillIds) {
    const name = getSkill(skillId)?.name || skills.find((s) => s.id === skillId)?.clientLabel || skillId;
    const mine = scenarios.filter((s) => s.skillId === skillId);
    const obs = mine.reduce((a, s) => a + observationsFor(s), 0);
    if (mine.length < RULES.scenarios.perSkillMin) out.push(issue('scenariosPerSkill', 'hard', `Add one more scenario for ${name} so its score is dependable.`, `Add a ${name} scenario in the blueprint.`, { skillId, step: 3 }));
    else if (mine.length === RULES.scenarios.perSkillMin) out.push(issue('scenariosPerSkill', 'soft', `${name} rests on 2 scenarios. A third makes the score steadier.`, `Add a ${name} scenario in the blueprint.`, { skillId, step: 3 }));
    if (obs < RULES.observations.perSkillMin) out.push(issue('observationsPerSkill', 'hard', `${name} needs ${RULES.observations.perSkillMin - obs} more scored observation${RULES.observations.perSkillMin - obs === 1 ? '' : 's'} before its score can be published.`, 'Add a scenario, a scoring question or an MCQ question for this Skill.', { skillId, step: 3 }));
    else if (obs < RULES.observations.perSkillRecommended) out.push(issue('observationsPerSkill', 'soft', `${name} has ${obs} observations. 12 or more gives a High confidence score.`, 'Add a scenario or a question for this Skill.', { skillId, step: 3 }));
    const open = mine.filter((s) => s.responseType !== 'MCQ').length;
    if (mine.length && open === 0) {
      if (mine.length < 3 || obs < 8) out.push(issue('mcqOnly', 'hard', `${name} is measured only by MCQ. It needs at least 8 questions across 3 scenarios, or one Audio or Text scenario.`, 'Switch one scenario to Audio or Text.', { skillId, step: 3 }));
      else out.push(issue('mcqOnly', 'soft', `${name} is measured only by MCQ. One Audio or Text scenario would show judgment in the participant's own words.`, 'Switch one scenario to Audio or Text.', { skillId, step: 3 }));
    }
  }

  // Per scenario checks
  let total = 0;
  scenarios.forEach((sc, i) => {
    const label = scenarioLabel(sc, i);
    const ctx = { scenarioId: sc.id, step: 4 };
    const skill = getSkill(sc.skillId);
    const minutes = sc.recommendedMinutes || estimateScenarioMinutes(sc);
    total += minutes;
    if (minutes > RULES.time.scenarioMax) out.push(issue('duration', 'hard', `${label} is estimated at ${minutes} minutes, above the 15 minute limit for one scenario.`, 'Shorten the situation, simplify the media or switch to MCQ.', ctx));

    if (!sc.approved) out.push(issue('approval', 'hard', `${label} is not yet approved.`, 'Review the scenario and mark it approved.', ctx));
    if (sc.pendingConfirmation) out.push(issue('pending', 'hard', `${label} has changed scoring questions waiting for your confirmation.`, 'Confirm or edit the changed scoring questions.', ctx));

    const sitWords = wordCount(sc.situation || '');
    if (sitWords && (sitWords < RULES.situation.wordsMin || sitWords > RULES.situation.wordsMax)) out.push(issue('situationLength', 'soft', `${label}'s situation is ${sitWords} words. Situations read best between ${RULES.situation.wordsMin} and ${RULES.situation.wordsMax}.`, 'Edit or regenerate the situation.', ctx));
    if (wordCount(sc.contextHeader || '') > RULES.situation.contextHeaderWordsMax) out.push(issue('contextHeader', 'soft', `${label}'s context header is longer than 30 words.`, 'Trim the header to role, people and what just happened.', ctx));

    const analysisText = [...(sc.analysis?.keyFacts || []), ...(sc.analysis?.constraints || []), ...(sc.analysis?.stakeholders || []), ...(sc.analysis?.idealMustAddress || []), ...(sc.analysis?.mediaShows || [])].join(' ');

    if (sc.responseType === 'MCQ') {
      const qs = sc.mcq || [];
      if (qs.length < RULES.mcq.questionsMin) out.push(issue('mcqCount', 'hard', `${label} has no MCQ question.`, 'Generate or write at least one question.', ctx));
      if (qs.length > RULES.mcq.questionsMax) out.push(issue('mcqCount', 'hard', `${label} has ${qs.length} MCQ questions. The limit is 3 per scenario.`, 'Remove a question or split the scenario.', ctx));
      qs.forEach((q, qi) => {
        const d = { ...ctx, detail: q.id };
        if (q.options.length > RULES.mcq.optionsMax) out.push(issue('mcqOptions', 'hard', `${label}, question ${qi + 1} has ${q.options.length} options. The limit is 4.`, 'Remove an option.', d));
        if (q.options.length < RULES.mcq.optionsMin) out.push(issue('mcqOptions', 'hard', `${label}, question ${qi + 1} needs at least 2 options.`, 'Add an option.', d));
        if (q.options.some((o) => !o.rationale || !o.rationale.trim())) out.push(issue('mcqRationale', 'hard', `${label}, question ${qi + 1} has an option without a rationale.`, 'Write one sentence on why the option earns its value.', d));
        const keys = q.options.map((o) => Number(o.key));
        if (!keys.some((k) => k >= RULES.mcq.highKey) || !keys.some((k) => k <= RULES.mcq.lowKey)) out.push(issue('mcqDiscrimination', 'hard', `${label}, question ${qi + 1} cannot tell strong from weak choices. It needs one clearly effective option and one clearly weak option.`, 'Regenerate an option or adjust the values.', d));
        if (new Set(keys).size < keys.length) out.push(issue('mcqClose', 'soft', `${label}, question ${qi + 1} has two options with the same value, so choosing between them tells us nothing.`, 'Make one option clearly stronger or weaker.', d));
        const top = [...keys].sort((a, b) => b - a);
        if (top.length >= 2 && top[0] - top[1] === 0) { /* covered above */ } else if (top.length >= 3 && top[0] - top[2] <= 1) out.push(issue('mcqClose', 'soft', `${label}, question ${qi + 1} has three options valued within one point of each other.`, 'Spread the values so the question separates levels.', { ...d, detail: `${q.id}-spread` }));
        for (const o of q.options) { const ind = o.indicatorId ? indicatorById(o.indicatorId) : null; if (ind && ind.skillId !== sc.skillId) out.push(issue('purity', 'hard', `${label}, question ${qi + 1} has an option mapped to a different Skill (${getSkill(ind.skillId)?.name}).`, 'Map the option to the scenario\'s Skill or move the scenario.', { ...d, detail: o.id })); }
        q.options.forEach((o, oi) => { const w = wordCount(o.text || ''); if (w && (w < RULES.mcq.optionWordsMin || w > RULES.mcq.optionWordsMax)) out.push(issue('optionLength', 'soft', `${label}, question ${qi + 1}, option ${String.fromCharCode(65 + oi)} is ${w} words. Options read best at 15 to 40 words.`, 'Edit the option.', { ...d, detail: o.id })); });
      });
    } else {
      const qs = sc.scoringQuestions || [];
      if (qs.length < RULES.scoringQuestions.min || qs.length > RULES.scoringQuestions.max) out.push(issue('sqCount', 'hard', `${label} has ${qs.length} scoring question${qs.length === 1 ? '' : 's'}. Audio and Text scenarios need 4 or 5.`, 'Generate or write scoring questions from the contextual analysis.', ctx));
      if (!sc.analysis?.modelAnswer || !sc.analysis.modelAnswer.trim()) out.push(issue('modelAnswer', 'hard', `${label} has no model answer, so the response cap cannot be sized.`, 'Write or regenerate the model answer.', ctx));
      qs.forEach((q, qi) => {
        const d = { ...ctx, detail: q.id };
        if (!q.indicatorId) out.push(issue('sqIndicator', 'hard', `${label}, scoring question ${qi + 1} is not tied to a behavior of ${skill?.name || 'the Skill'}.`, 'Pick the behavior it observes.', d));
        else { const ind = indicatorById(q.indicatorId); if (ind && ind.skillId !== sc.skillId) out.push(issue('purity', 'hard', `${label}, scoring question ${qi + 1} is tied to a behavior from a different Skill (${getSkill(ind.skillId)?.name}).`, 'Tie the question to this scenario\'s Skill.', d)); }
        const anchors = q.anchors || {};
        const missing = ['L0', 'L1', 'L2', 'L3'].filter((l) => !anchors[l] || !anchors[l].trim());
        if (missing.length) out.push(issue('sqAnchors', 'hard', `${label}, scoring question ${qi + 1} is missing what a ${missing.map((l) => ({ L0: 'weak', L1: 'developing', L2: 'strong', L3: 'exemplary' })[l]).join(', ')} answer contains.`, 'Fill in every level.', d));
        else {
          const norm = ['L0', 'L1', 'L2', 'L3'].map((l) => normalize(anchors[l]));
          if (new Set(norm).size < 4) out.push(issue('sqAnchorsDistinct', 'hard', `${label}, scoring question ${qi + 1} has two levels that read the same.`, 'Make each level describe different content.', d));
        }
        if (!q.traceTo || !q.traceTo.length) {
          const overlap = analysisText && q.text ? similarity(q.text, analysisText) : 0;
          if (overlap < 0.02) out.push(issue('sqTrace', 'hard', `${label}, scoring question ${qi + 1} does not trace to the contextual analysis.`, 'Link the question to a fact, constraint or element of the ideal response.', d));
        }
      });
      for (let a = 0; a < qs.length; a++) for (let b = a + 1; b < qs.length; b++) {
        if ((qs[a].indicatorId && qs[a].indicatorId === qs[b].indicatorId && similarity(qs[a].text, qs[b].text) > 0.3) || similarity(qs[a].text, qs[b].text) > 0.6) out.push(issue('sqDuplicate', 'soft', `${label}, scoring questions ${a + 1} and ${b + 1} read as the same behavior.`, 'Regenerate one so each question tests a distinct element.', { ...ctx, detail: `${qs[a].id}-${qs[b].id}` }));
      }
      // Response cap
      const ma = modelAnswerInCapUnits(sc.responseType, sc.analysis?.modelAnswer || '');
      if (sc.responseType === 'Audio') {
        const cap = sc.cap?.audioSeconds || 0;
        if (cap > RULES.caps.audioMaxSeconds) out.push(issue('cap', 'hard', `${label}'s recording limit is above 2 minutes.`, 'Set the limit to 2 minutes or less.', ctx));
        if (cap < RULES.caps.audioMinSeconds) out.push(issue('cap', 'hard', `${label}'s recording limit is too short for any full answer.`, 'Set at least 30 seconds.', ctx));
        if (ma && cap < ma) out.push(issue('capShort', 'hard', `${label}'s recording limit is shorter than the model answer takes to say (${ma} seconds).`, `Set at least ${Math.ceil(ma / 15) * 15} seconds.`, ctx));
        else if (ma && cap > ma * 2 && cap > RULES.caps.audioMinSeconds) out.push(issue('capLong', 'soft', `${label}'s recording limit is more than double the model answer.`, 'A tighter limit keeps the assessment short.', ctx));
      }
      if (sc.responseType === 'Text') {
        const cap = sc.cap?.textChars || 0;
        if (cap < RULES.caps.textMinChars || cap > RULES.caps.textMaxChars) out.push(issue('cap', 'hard', `${label}'s character limit is outside 1,000 to 2,000.`, 'Set a limit between 1,000 and 2,000 characters.', ctx));
        if (ma && cap < ma) out.push(issue('capShort', 'hard', `${label}'s character limit is shorter than the model answer (${ma} characters).`, `Set at least ${Math.ceil(ma / 50) * 50} characters.`, ctx));
        else if (ma && cap > ma * 2) out.push(issue('capLong', 'soft', `${label}'s character limit is more than double the model answer.`, 'A tighter limit keeps the assessment short.', ctx));
      }
      // Calibration
      if (assessment.config?.expectedParticipants > RULES.calibration.maxParticipantsBeforeCalibration && sc.calibration !== 'complete') out.push(issue('calibration', 'hard', `${label} would reach more than 50 participants before its AI scoring is calibrated.`, 'Keep the first wave under 50 participants or complete calibration first.', { ...ctx, step: 7 }));
      else if (sc.calibration !== 'complete') out.push(issue('calibration', 'soft', `${label}: AI scoring calibration is pending. The first 30 responses will be scored by two calibrators before AI scoring activates.`, 'No action now.', ctx));
    }

    // Skill purity in the situation text: mentions of another Skill's name
    for (const other of SKILLS) {
      if (other.id === sc.skillId || !skillIds.includes(other.id)) continue;
      if (new RegExp(`\\b${other.name.split(' ')[0].toLowerCase()}`, 'i').test(sc.situation || '') && other.name.split(' ')[0].length > 5) { out.push(issue('purityText', 'soft', `${label}'s situation mentions ${other.name}, another Skill in this assessment.`, 'Keep the situation focused on one Skill.', { ...ctx, detail: other.id })); break; }
    }

    // Duplicates
    for (let j = 0; j < i; j++) {
      const sim = similarity(sc.situation || '', scenarios[j].situation || '');
      if (sim > RULES.similarityThreshold) out.push(issue('duplicate', 'hard', `${label} reads as a near duplicate of ${scenarioLabel(scenarios[j], j)}.`, 'Regenerate one with a different situation.', { ...ctx, detail: scenarios[j].id }));
    }

    // Bias and reading level
    const bias = biasScreen(`${sc.contextHeader || ''} ${sc.situation || ''} ${sc.prompt || ''} ${(sc.mcq || []).flatMap((q) => [q.text, ...q.options.map((o) => o.text)]).join(' ')}`, sc.allowedTerms || []);
    for (const b of bias) out.push(issue('bias', 'hard', `${label}: ${b.message}`, b.fix, { ...ctx, detail: b.term }));
    const grade = readingGrade(sc.situation || '');
    if (grade > RULES.readingGradeMax) out.push(issue('readingLevel', 'soft', `${label} reads at grade ${grade}. Aim for grade 10 or below.`, 'Shorten sentences and swap long words.', ctx));

    // Media
    if (sc.media) {
      const m = sc.media;
      if (m.type === 'image' && !m.alt) out.push(issue('mediaAlt', 'hard', `${label}'s image has no alt text.`, 'Describe what the image shows and what a participant must take from it.', ctx));
      if ((m.type === 'chart' || m.type === 'table') && !m.alt && !m.data) out.push(issue('mediaAlt', 'hard', `${label}'s ${m.type} has no data table alternative.`, 'Add the numbers behind it.', ctx));
      if ((m.type === 'audio' || m.type === 'video') && !m.transcript) out.push(issue('mediaTranscript', 'hard', `${label}'s ${m.type} clip has no transcript.`, 'Add a transcript.', ctx));
      if (m.type === 'image' && m.bytes > RULES.media.imageMaxBytes) out.push(issue('mediaSize', 'hard', `${label}'s image is above 2 MB.`, 'Upload a smaller file.', ctx));
      if (m.type === 'chart' && ((m.data?.series?.length || 0) > RULES.media.chartMaxSeries || (m.data?.points?.length || 0) > RULES.media.chartMaxPoints)) out.push(issue('mediaSize', 'hard', `${label}'s chart has too many series or points to read on a phone.`, 'Keep to 2 series and 8 points.', ctx));
      if (m.type === 'table' && ((m.data?.rows?.length || 0) > RULES.media.tableMaxRows || (m.data?.columns?.length || 0) > RULES.media.tableMaxCols)) out.push(issue('mediaSize', 'hard', `${label}'s table is larger than 6 rows by 5 columns.`, 'Trim the table to what the answer needs.', ctx));
      if (m.type === 'document' && wordCount(m.text || '') > RULES.media.docExtractWordsMax) out.push(issue('mediaSize', 'hard', `${label}'s document extract is longer than 150 words.`, 'Trim the extract.', ctx));
      if (!(sc.analysis?.mediaShows || []).length) out.push(issue('mediaAnalysis', 'hard', `${label}'s media is not read by the contextual analysis, so no scoring question can depend on it.`, 'Re-run the analysis or remove the media.', ctx));
      if (!(m.referencedInSituation || /chart|table|graph|figure|image|screenshot|email|message|report|dashboard|attached|below|shows|data/i.test(sc.situation || ''))) out.push(issue('mediaReference', 'soft', `${label}'s situation does not point the participant to the media.`, 'Mention the media in the situation text.', ctx));
    }
  });

  if (total > RULES.time.totalHard) out.push(issue('totalDuration', 'hard', `The assessment is estimated at ${total} minutes, above the ${RULES.time.totalHard} minute limit.`, 'Convert a scenario to MCQ or remove one.', { step: 3 }));
  else if (total > RULES.time.totalWarn) out.push(issue('totalDuration', 'soft', `The assessment is estimated at ${total} minutes. Completion rates fall above ${RULES.time.totalWarn}.`, 'Convert a scenario to MCQ or tighten a cap.', { step: 3 }));
  else if (total > RULES.time.totalTarget) out.push(issue('totalDuration', 'soft', `The assessment is estimated at ${total} minutes, a little above the ${RULES.time.totalTarget} minute target.`, 'Optional: tighten a cap or simplify media.', { step: 3 }));

  // Flags for KNOLSKAPE review are informational
  for (const sc of scenarios) if (sc.flaggedForReview) out.push(issue('flagged', 'soft', `${scenarioLabel(sc, scenarios.indexOf(sc))} is flagged for KNOLSKAPE review.`, 'Publishing sends it to the review queue.', { scenarioId: sc.id, step: 4 }));

  const hard = out.filter((i) => i.severity === 'hard');
  const soft = out.filter((i) => i.severity === 'soft');
  return { issues: out, hard, soft, canPublish: hard.length === 0, totalMinutes: total };
}

export function issuesForScenario(gate, scenarioId) { return gate.issues.filter((i) => i.scenarioId === scenarioId); }
