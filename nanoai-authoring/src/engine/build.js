// Turns a blueprint into scenarios, reusing what already exists. The build runs in the background, a couple of
// scenarios at a time, and each finished scenario lands in the assessment straight away so the author can start
// reviewing while the rest are written. Every write merges into the latest state, so edits made to earlier
// scenarios during the build are never overwritten.
import { useEffect, useState } from 'react';
import { getSkill } from '../content/ontology.js';
import { generateScenario, switchResponseType, currentModelVersion } from './generator.js';

const CONCURRENCY = 2;
const active = new Map(); // assessmentId -> { promise, progress }
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

export function buildProgress(assessmentId) { return active.get(assessmentId)?.progress || null; }
export function isBuilding(assessmentId) { return active.has(assessmentId); }

// React hook: the live progress of the background build for one assessment, or null when idle.
export function useBuildProgress(assessmentId) {
  const [, tick] = useState(0);
  useEffect(() => { const fn = () => tick((n) => n + 1); listeners.add(fn); return () => listeners.delete(fn); }, []);
  return buildProgress(assessmentId);
}

// Rows of the plan that have no scenario yet, or whose scenario has the wrong response type.
export function missingRows(asm) {
  const rows = asm.blueprint?.rows || [];
  const scs = asm.scenarios || [];
  return rows.filter((r) => !scs.some((s) => s.blueprintRowId === r.id && s.responseType === r.responseType));
}

// Start (or join) the background build for this assessment. `update` must accept { assessmentId }.
export function buildScenarios({ asm, update, onProgress }) {
  const running = active.get(asm.id);
  if (running) return running.promise;
  const rows = asm.blueprint?.rows || [];
  const total = rows.length;
  const entry = { progress: { done: rows.length - missingRows(asm).length, total, status: 'Planning scenarios, response types and time', writing: [] } };
  const setProgress = (patch) => { entry.progress = { ...entry.progress, ...patch }; onProgress?.(entry.progress); emit(); };
  const meta = { undoable: false, assessmentId: asm.id, allowPublished: false };
  // Drop scenarios whose row left the plan, keeping everything else the author has.
  update?.((a) => ({ ...a, scenarios: (a.scenarios || []).filter((s) => rows.some((r) => r.id === s.blueprintRowId)) }), meta);

  let working = { ...asm, scenarios: (asm.scenarios || []).filter((s) => rows.some((r) => r.id === s.blueprintRowId)) };
  const queue = rows.map((row, i) => ({ row, i })).filter(({ row }) => !working.scenarios.some((s) => s.blueprintRowId === row.id && s.responseType === row.responseType));
  const place = (sc) => {
    working = { ...working, scenarios: [...working.scenarios.filter((s) => s.blueprintRowId !== sc.blueprintRowId), sc] };
    update?.((a) => {
      const others = (a.scenarios || []).filter((s) => s.blueprintRowId !== sc.blueprintRowId);
      const merged = [...others, sc];
      return { ...a, scenarios: rows.map((r) => merged.find((s) => s.blueprintRowId === r.id)).filter(Boolean) };
    }, meta);
  };

  const worker = async () => {
    while (queue.length) {
      const { row, i } = queue.shift();
      const name = getSkill(row.skillId)?.name || row.skillId;
      setProgress({ writing: [...entry.progress.writing, i], status: `Writing scenario ${i + 1}: ${name}` });
      const have = working.scenarios.find((s) => s.blueprintRowId === row.id);
      let sc;
      if (have) {
        const sw = await switchResponseType(have, working, row.responseType);
        sc = sw.ok ? sw.scenario : { ...have, responseType: row.responseType, scoringQuestions: [], mcq: [], analysisStale: true, approved: false, generationError: sw.note };
      } else {
        sc = await generateScenario(row, working, i, { onStatus: (st) => setProgress({ status: `Scenario ${i + 1}, ${name}: ${st.toLowerCase()}` }) });
      }
      place(sc);
      setProgress({ done: entry.progress.done + 1, writing: entry.progress.writing.filter((x) => x !== i) });
    }
  };

  entry.promise = (async () => {
    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, Math.max(1, queue.length)) }, worker));
      const failed = working.scenarios.filter((s) => s.generationError).length;
      update?.((a) => ({ ...a, generation: { at: Date.now(), model: currentModelVersion(), count: rows.length, failed } }), { ...meta, action: 'scenarios.generated', after: { count: rows.length, failed, model: currentModelVersion() } });
      return working.scenarios;
    } finally {
      active.delete(asm.id); emit(); onProgress?.(null);
    }
  })();
  active.set(asm.id, entry); emit();
  return entry.promise;
}

// True when the blueprint has rows without a scenario, or scenarios whose row or type changed.
export function planIsStale(asm) {
  const rows = asm.blueprint?.rows || [];
  const scs = asm.scenarios || [];
  if (!rows.length) return false;
  return missingRows(asm).length > 0 || scs.some((s) => !rows.some((r) => r.id === s.blueprintRowId));
}
