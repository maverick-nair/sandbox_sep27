// Short form duration planning (PRD 13.9) and response cap recommendation (PRD 9.1 Step 4).
import { RULES } from '../content/rules.js';
import { wordCount, clamp, roundUpTo } from './text.js';

const READ_WPM = 180; // reading speed for situation and media text
const SPEAK_WPM = 140; // speaking speed used to size the audio cap from the model answer
const TYPE_CPM = 180; // typing speed in characters per minute for text answers
const DEPTH_MINUTES = { Low: 1, Medium: 2, High: 3 };

export function mediaWords(media) {
  if (!media) return 0;
  switch (media.type) {
    case 'chart': return 40 + (media.data?.points?.length || 0) * (media.data?.series?.length || 1) * 2;
    case 'table': return (media.data?.rows?.length || 0) * (media.data?.columns?.length || 0) * 3 + 20;
    case 'image': return 30;
    case 'document': return wordCount(media.text || '');
    default: return 20;
  }
}

// Estimate for a planned row before the scenario exists. Deterministic from the plan.
export function estimatePlannedMinutes(row) {
  const base = { Audio: 6, Text: 8, MCQ: 5 }[row.responseType] || 6;
  const depth = { Low: 0, Medium: 1, High: 2 }[row.difficulty] || 0;
  const media = row.plannedMedia ? 1 : 0;
  const mcq = row.responseType === 'MCQ' ? Math.max(0, (row.plannedQuestions || 2) - 2) : 0;
  return clamp(base + depth + media + mcq, RULES.time.scenarioMin, RULES.time.scenarioMax);
}

// Estimate for a generated scenario: reading load, analysis depth, response type, model answer size.
export function estimateScenarioMinutes(sc) {
  const readWords = wordCount(sc.contextHeader || '') + wordCount(sc.situation || '') + wordCount(sc.prompt || '') + mediaWords(sc.media);
  const reading = readWords / READ_WPM;
  const depth = DEPTH_MINUTES[sc.difficulty] || 2;
  let responding = 0;
  if (sc.responseType === 'Audio') responding = ((sc.cap?.audioSeconds || RULES.caps.audioMaxSeconds) / 60) + 1.5;
  else if (sc.responseType === 'Text') responding = ((sc.cap?.textChars || RULES.caps.textMinChars) / TYPE_CPM) * 0.8 + 1;
  else responding = Math.max(1, (sc.mcq?.length || 1)) * 1.25 + 0.5;
  const modelDepth = sc.responseType === 'MCQ' ? 0 : Math.min(2, wordCount(sc.analysis?.modelAnswer || '') / 150);
  const raw = reading + depth + responding + modelDepth;
  return clamp(Math.round(raw), RULES.time.scenarioMin, RULES.time.scenarioMax);
}

// Cap sized from the model answer. Audio in seconds, text in characters. Always within range.
export function recommendCap(responseType, modelAnswer = '') {
  if (responseType === 'Audio') {
    const secs = (wordCount(modelAnswer) / SPEAK_WPM) * 60 * 1.3;
    return { audioSeconds: clamp(roundUpTo(Math.max(secs, RULES.caps.audioMinSeconds), 15), RULES.caps.audioMinSeconds, RULES.caps.audioMaxSeconds) };
  }
  if (responseType === 'Text') {
    const chars = modelAnswer.length * 1.25;
    return { textChars: clamp(roundUpTo(Math.max(chars, RULES.caps.textMinChars), 50), RULES.caps.textMinChars, RULES.caps.textMaxChars) };
  }
  return {};
}

// Length of the model answer expressed in the cap's unit, for the "cap shorter than model answer" checks.
export function modelAnswerInCapUnits(responseType, modelAnswer = '') {
  if (responseType === 'Audio') return Math.round((wordCount(modelAnswer) / SPEAK_WPM) * 60);
  if (responseType === 'Text') return modelAnswer.length;
  return 0;
}

export function observationsFor(sc) {
  if (!sc) return 0;
  if (sc.responseType === 'MCQ') return sc.mcq ? sc.mcq.length : (sc.plannedQuestions || 2);
  return sc.scoringQuestions ? sc.scoringQuestions.length : (sc.plannedQuestions || RULES.scoringQuestions.default);
}

export function formatMinutes(m) { return `${Math.round(m)} min`; }
export function formatSeconds(s) { const m = Math.floor(s / 60), r = s % 60; return m ? `${m}:${String(r).padStart(2, '0')} min` : `${r} s`; }
