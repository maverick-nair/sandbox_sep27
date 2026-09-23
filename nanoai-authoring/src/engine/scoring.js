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

export function scoreMcq(scenario, selections) {
  return (scenario.mcq || []).map((q) => {
    const opt = q.options.find((o) => o.id === selections?.[q.id]);
    return { questionId: q.id, optionId: opt?.id || null, key: opt?.key ?? null, score: opt ? observationScoreFromKey(opt.key) : 0, rationale: opt?.rationale || '', unscored: !opt };
  });
}
