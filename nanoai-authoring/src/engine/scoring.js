// Deterministic aggregation (PRD 13.4 to 13.7). Used by the preview's sample report so the author sees
// how scoring questions assess an answer. Observation scoring of real participants is delivery scope.
import { bandFor } from '../content/rules.js';

export function observationScoreFromLevel(level) { return Math.max(0, Math.min(3, level)) / 3; }
export function observationScoreFromKey(key) { return (Math.max(1, Math.min(5, key)) - 1) / 4; }

// SkillScore = 1 + 9 * (sum w_i s_i / sum w_i), one decimal.
export function skillScore(observations) {
  const w = observations.reduce((a, o) => a + (o.weight ?? 1), 0);
  if (!w) return null;
  const s = observations.reduce((a, o) => a + (o.weight ?? 1) * o.score, 0) / w;
  return Math.round((1 + 9 * s) * 10) / 10;
}

// Overall = mean of Skill scores weighted by observation count.
export function overallScore(skillResults) {
  const valid = skillResults.filter((r) => r.score != null);
  const w = valid.reduce((a, r) => a + r.observations, 0);
  if (!w) return null;
  return Math.round((valid.reduce((a, r) => a + r.score * r.observations, 0) / w) * 10) / 10;
}

export function confidenceFor({ observations, thirdPass = false, integrityFlag = false, unscored = false }) {
  if (integrityFlag || unscored) return 'Low';
  if (observations >= 12 && !thirdPass) return 'High';
  return 'Medium';
}

export function aggregate(observationsBySkill) {
  const skills = Object.entries(observationsBySkill).map(([skillId, obs]) => {
    const score = skillScore(obs);
    const conf = confidenceFor({ observations: obs.length, thirdPass: obs.some((o) => o.thirdPass), integrityFlag: obs.some((o) => o.integrityFlag), unscored: obs.some((o) => o.unscored) });
    return { skillId, score, band: score != null ? bandFor(score).name : null, observations: obs.length, confidence: conf, weight: obs.length };
  });
  const overall = overallScore(skills);
  const totalObs = skills.reduce((a, s) => a + s.observations, 0);
  return { skills: skills.map((s) => ({ ...s, weightShare: totalObs ? Math.round((s.observations / totalObs) * 100) : 0 })), overall, overallBand: overall != null ? bandFor(overall).name : null };
}

// Scripted contextual scoring for preview only: level per scoring question from keyword coverage of the
// anchors and the ideal element, with a quoted passage. The real scorer is a two pass LLM in delivery.
export function scriptedScore(scenario, responseText) {
  const text = (responseText || '').toLowerCase();
  const sentences = (responseText || '').split(/(?<=[.!?])\s+/).filter(Boolean);
  const results = [];
  for (const q of scenario.scoringQuestions || []) {
    const terms = [...new Set(`${q.text} ${q.anchors?.L3 || ''} ${q.anchors?.L2 || ''}`.toLowerCase().match(/[a-z]{5,}/g) || [])].filter((t) => !['response', 'answer', 'would', 'their', 'should', 'about', 'which', 'there', 'these', 'those', 'specific', 'situation', 'participant'].includes(t));
    const hits = terms.filter((t) => text.includes(t));
    const coverage = terms.length ? hits.length / terms.length : 0;
    const level = text.trim().length < 150 ? 0 : coverage >= 0.45 ? 3 : coverage >= 0.3 ? 2 : coverage >= 0.15 ? 1 : 0;
    const quoteSentence = sentences.find((s) => hits.some((h) => s.toLowerCase().includes(h))) || sentences[0] || '';
    const quote = quoteSentence.split(' ').slice(0, 30).join(' ');
    results.push({ questionId: q.id, level, score: observationScoreFromLevel(level), quote, confidence: Math.min(0.95, 0.55 + coverage), matched: hits.slice(0, 4) });
  }
  return results;
}

export function scoreMcq(scenario, selections) {
  return (scenario.mcq || []).map((q) => {
    const opt = q.options.find((o) => o.id === selections?.[q.id]);
    return { questionId: q.id, optionId: opt?.id || null, key: opt?.key ?? null, score: opt ? observationScoreFromKey(opt.key) : 0, rationale: opt?.rationale || '', unscored: !opt };
  });
}
