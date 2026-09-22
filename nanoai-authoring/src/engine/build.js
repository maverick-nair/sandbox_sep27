// Turns a blueprint into scenarios, reusing what already exists. Shared by the automatic build after the
// brief and by "Adjust plan" in the Scenarios stage.
import { getSkill } from '../content/ontology.js';
import { generateScenario, switchResponseType, generationMode } from './generator.js';

export async function buildScenarios({ asm, update, onProgress }) {
  const rows = asm.blueprint?.rows || [];
  const total = rows.length;
  let scenarios = (asm.scenarios || []).filter((s) => rows.some((r) => r.id === s.blueprintRowId));
  let working = { ...asm, scenarios };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const name = getSkill(row.skillId)?.name || row.skillId;
    const have = scenarios.find((s) => s.blueprintRowId === row.id);
    if (have) {
      if (have.responseType !== row.responseType) {
        onProgress?.({ i, total, status: `${name}: switching to ${row.responseType}` });
        const sw = await switchResponseType(have, working, row.responseType);
        scenarios = scenarios.map((s) => (s.id === have.id ? sw : s)); working = { ...working, scenarios };
      }
      continue;
    }
    onProgress?.({ i, total, status: `${name}: writing the situation` });
    const sc = await generateScenario(row, working, i, { onStatus: (st) => onProgress?.({ i, total, status: `${name}: ${st.toLowerCase()}` }) });
    scenarios = [...scenarios, sc]; working = { ...working, scenarios };
    update?.((a) => ({ ...a, scenarios }), { undoable: false });
  }
  const ordered = rows.map((r) => scenarios.find((s) => s.blueprintRowId === r.id)).filter(Boolean);
  update?.((a) => ({ ...a, scenarios: ordered, generation: { at: Date.now(), mode: generationMode(), count: ordered.length } }), { action: 'scenarios.generated', after: { count: ordered.length, mode: generationMode() } });
  return ordered;
}

// True when the blueprint has rows without a scenario, or scenarios whose row or type changed.
export function planIsStale(asm) {
  const rows = asm.blueprint?.rows || [];
  const scs = asm.scenarios || [];
  if (!rows.length) return false;
  return rows.some((r) => !scs.some((s) => s.blueprintRowId === r.id && s.responseType === r.responseType)) || scs.some((s) => !rows.some((r) => r.id === s.blueprintRowId));
}
