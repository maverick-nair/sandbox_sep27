// Product rules from the NanoAI PRD. The author never sees these as formulas; the
// engine enforces them and the UI speaks in outcomes.
export const RULES = {
  skills: { min: 3, max: 5 },
  scenarios: { totalMin: 6, totalMax: 12, perSkillMin: 2, perSkillRecommended: 3 },
  observations: { perSkillMin: 8, perSkillRecommended: 12 },
  scoringQuestions: { min: 4, max: 5, default: 4 },
  mcq: { questionsMin: 1, questionsMax: 3, optionsMax: 4, optionsMin: 2, keyMin: 1, keyMax: 5, highKey: 4, lowKey: 2, optionWordsMin: 15, optionWordsMax: 40 },
  caps: { audioMaxSeconds: 120, audioMinSeconds: 30, textMinChars: 1000, textMaxChars: 2000 },
  time: { scenarioMin: 5, scenarioMax: 15, totalTarget: 60, totalWarn: 75, totalHard: 90 },
  situation: { wordsMin: 120, wordsMax: 250, contextHeaderWordsMax: 30 },
  media: { imageMaxBytes: 2 * 1024 * 1024, chartMaxSeries: 2, chartMaxPoints: 8, tableMaxRows: 6, tableMaxCols: 5, docExtractWordsMax: 150 },
  readingGradeMax: 10,
  similarityThreshold: 0.6,
  calibration: { maxParticipantsBeforeCalibration: 50, responses: 30, aiHumanIcc: 0.75, humanHumanIcc: 0.7 },
  review: { mandatoryFirstN: 3 },
  publish: { defaultSittings: 2, defaultSittingWindowDays: 7, defaultRetakeDays: 30 },
};

export const RESPONSE_TYPES = ['Audio', 'Text', 'MCQ'];
export const DIFFICULTIES = ['Low', 'Medium', 'High'];
export const PURPOSES = [
  { id: 'baseline', label: 'Program baseline', hint: 'Before a program, with a retest 6 to 12 weeks after' },
  { id: 'retest', label: 'Retest', hint: 'Parallel form after a program' },
  { id: 'readiness', label: 'Role readiness', hint: 'New role, promotion readiness, role change' },
  { id: 'function', label: 'Function evaluation', hint: 'HR led, annual or semi annual' },
];

export const BANDS = [
  { name: 'Novice', min: 1.0, max: 2.9, meaning: 'Responses rarely show the effective behaviors; MCQ choices favor ineffective options' },
  { name: 'Emerging', min: 3.0, max: 4.9, meaning: 'Effective behaviors appear inconsistently; recognizes the right move in some situations' },
  { name: 'Competent', min: 5.0, max: 6.9, meaning: 'Reliably shows effective behaviors in familiar situations' },
  { name: 'Proficient', min: 7.0, max: 8.9, meaning: 'Shows effective behaviors across situations and distinguishes strong from plausible but weaker actions' },
  { name: 'Role Model', min: 9.0, max: 10.0, meaning: 'Consistently exemplary responses with the reasoning to match' },
];

export function bandFor(score) {
  for (const b of BANDS) if (score <= b.max + 0.049) return b;
  return BANDS[BANDS.length - 1];
}

export const LEVEL_LABELS = { L0: 'Weak', L1: 'Developing', L2: 'Strong', L3: 'Exemplary' };
