// Calibration workflow (PRD 13.3, FR-A13). Before AI scoring activates for an open response scenario,
// 30 responses are scored by two calibrated human scorers and by the AI. Activation requires AI to human
// agreement of 0.75 or above per scoring question and human to human agreement of 0.70 or above.
// Agreement is the intraclass correlation ICC(1) for two raters (one way random effects).
import { RULES } from '../content/rules.js';

export function icc1(pairs) {
  // pairs: array of [a, b] ratings for the same targets
  const n = pairs.filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (n.length < 3) return null;
  const k = 2;
  const grand = n.reduce((s, p) => s + p[0] + p[1], 0) / (n.length * k);
  const msb = n.reduce((s, p) => { const m = (p[0] + p[1]) / k; return s + k * (m - grand) ** 2; }, 0) / (n.length - 1);
  const msw = n.reduce((s, p) => { const m = (p[0] + p[1]) / k; return s + (p[0] - m) ** 2 + (p[1] - m) ** 2; }, 0) / (n.length * (k - 1));
  if (msb + (k - 1) * msw === 0) return 1;
  const icc = (msb - msw) / (msb + (k - 1) * msw);
  return Math.max(-1, Math.min(1, Math.round(icc * 1000) / 1000));
}

export function emptyCalibration() { return { responses: [], calibrators: ['Calibrator A', 'Calibrator B'], status: 'pending', agreement: null, activatedAt: null, pausedReason: null }; }

// responses: [{ id, text, ratings: { A: { [qid]: level }, B: { [qid]: level } }, ai: { [qid]: level } }]
export function computeAgreement(scenario, cal) {
  const qs = scenario.scoringQuestions || [];
  const perQuestion = qs.map((q) => {
    const hh = [], ah = [];
    for (const r of cal.responses) {
      const a = r.ratings?.A?.[q.id], b = r.ratings?.B?.[q.id], ai = r.ai?.[q.id];
      if (Number.isFinite(a) && Number.isFinite(b)) { hh.push([a, b]); if (Number.isFinite(ai)) ah.push([ai, (a + b) / 2]); }
    }
    return { questionId: q.id, text: q.text, rated: hh.length, humanHuman: icc1(hh), aiHuman: icc1(ah) };
  });
  const rated = cal.responses.filter((r) => qs.every((q) => Number.isFinite(r.ratings?.A?.[q.id]) && Number.isFinite(r.ratings?.B?.[q.id]))).length;
  const aiScored = cal.responses.filter((r) => qs.every((q) => Number.isFinite(r.ai?.[q.id]))).length;
  const enough = rated >= RULES.calibration.responses;
  const hhOk = perQuestion.every((p) => p.humanHuman != null && p.humanHuman >= RULES.calibration.humanHumanIcc);
  const ahOk = perQuestion.every((p) => p.aiHuman != null && p.aiHuman >= RULES.calibration.aiHumanIcc);
  const blockers = [];
  if (!enough) blockers.push(`${RULES.calibration.responses - rated} more response${RULES.calibration.responses - rated === 1 ? '' : 's'} need both calibrators' levels`);
  if (aiScored < cal.responses.length) blockers.push(`${cal.responses.length - aiScored} response${cal.responses.length - aiScored === 1 ? '' : 's'} not yet scored by the AI`);
  for (const p of perQuestion) {
    if (p.humanHuman != null && p.humanHuman < RULES.calibration.humanHumanIcc) blockers.push(`Calibrators disagree on "${p.text.slice(0, 60)}" (agreement ${p.humanHuman}). Revisit the anchors.`);
    if (p.aiHuman != null && p.aiHuman < RULES.calibration.aiHumanIcc) blockers.push(`AI disagrees with calibrators on "${p.text.slice(0, 60)}" (agreement ${p.aiHuman}). Revise the question or anchors.`);
  }
  return { perQuestion, rated, aiScored, total: cal.responses.length, canActivate: enough && hhOk && ahOk, blockers };
}

export function calibrationStatus(scenario, cal) {
  if (!cal || scenario.responseType === 'MCQ') return scenario.responseType === 'MCQ' ? 'not_applicable' : 'pending';
  if (cal.status === 'complete') return 'complete';
  if (cal.status === 'paused') return 'paused';
  if (cal.responses.length) return 'in_progress';
  return 'pending';
}

// Practice set: 30 varied responses derived from the model answer and weak patterns, so calibrators can
// rehearse the workflow before real responses arrive. Marked as practice in the record.
export function practiceResponses(scenario, n = RULES.calibration.responses) {
  const model = scenario.analysis?.modelAnswer || '';
  const sentences = model.split(/(?<=[.!?])\s+/).filter(Boolean);
  const weak = scenario.analysis?.weakPatterns || [];
  const ideal = (scenario.analysis?.idealMustAddress || []).map((e) => e.text || e);
  const out = [];
  for (let i = 0; i < n; i++) {
    const level = i % 4; // spread across L0 to L3
    let text;
    if (level === 3) text = sentences.join(' ');
    else if (level === 2) text = sentences.filter((_, j) => j % 3 !== (i % 3)).join(' ');
    else if (level === 1) text = `${sentences[0] || ''} ${weak[i % Math.max(1, weak.length)] || ''} I think that would be the right thing to do here.`.trim();
    else text = `${weak[i % Math.max(1, weak.length)] || 'I would wait and see how things develop.'} I would not want to make it worse, so I would probably leave it for now and mention it if it comes up again.`;
    out.push({ id: `pr_${i}`, text, practice: true, expected: level, ratings: {}, ai: {} });
  }
  return out;
}

export function parseResponses(text) {
  return text.split(/\n\s*\n|\n(?=\d+[.)]\s)/).map((t) => t.replace(/^\d+[.)]\s*/, '').trim()).filter((t) => t.length >= 20).map((t, i) => ({ id: `r_${Date.now().toString(36)}_${i}`, text: t, ratings: {}, ai: {} }));
}
