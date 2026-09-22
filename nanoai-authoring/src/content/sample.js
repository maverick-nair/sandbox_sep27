// The sample assessment authors can explore before creating one (PRD 17: empty states teach by example).
import { newAssessment, publish } from '../engine/store.js';
import { planBlueprint, setRowType } from '../engine/blueprint.js';
import { scriptedScenario } from '../engine/generator.js';
import { PROMPT_VERSION } from '../engine/llm.js';

export function buildSampleAssessment() {
  const skillIds = ['SK-COACH', 'SK-FEEDBK', 'SK-DELEG', 'SK-PRIOR'];
  let asm = newAssessment({
    sample: true, stage: 4, skillsConfirmed: true,
    intent: { audience: 'First line managers in a retail and distribution business, 12 to 24 months in role', situationsText: 'Managers run daily stand ups, hand over projects to team members, give feedback after customer calls and juggle head office requests with store operations.', purpose: 'readiness', terminology: 'Northwind Retail, Store Connect', documents: [], extracted: null, language: 'en' },
    skills: skillIds.map((id) => ({ id, confidence: 'High', evidence: ['sample'], source: 'Proposed from the intent' })),
    config: { name: 'Sample: First line manager readiness', audienceVisibility: 'invited', languages: ['en'], participantLanguages: ['en', 'hi'], windowStart: '', windowEnd: '', sittings: 2, sittingWindowDays: 7, retakeDays: 30, parallelFormOnRetake: true, reportVisibility: { participant: true, manager: true, org: true }, exportCsv: true, exportPdf: true, expectedParticipants: 40, scenarioOrder: 'shuffled' },
  });
  asm.blueprint = planBlueprint(skillIds, { purpose: 'readiness' });
  // The sample shows all three response types: make the first Coaching and Giving Feedback scenarios Audio.
  for (const id of ['SK-COACH', 'SK-FEEDBK']) { const row = asm.blueprint.rows.find((r) => r.skillId === id); if (row && row.responseType !== 'Audio') asm.blueprint = setRowType(asm.blueprint, row.id, 'Audio'); }
  // scriptedScenario avoids used seeds by looking at asm.scenarios; build sequentially so titles stay unique.
  const scenarios = [];
  asm.blueprint.rows.forEach((row, i) => { scenarios.push({ ...scriptedScenario(row, { ...asm, scenarios }, i), approved: true }); });
  asm.scenarios = scenarios;
  asm = publish(asm, { modelVersion: 'scripted-library', promptVersion: PROMPT_VERSION, reviewRequired: false });
  asm.versions[0].reviewStatus = 'published';
  return asm;
}
