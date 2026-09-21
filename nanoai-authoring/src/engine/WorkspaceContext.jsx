import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { loadWorkspace, saveWorkspace, newAssessment, upsertAssessment, audit, snapshot, pushHistory, undo as undoAsm, redo as redoAsm } from './store.js';
import { onUsage } from './llm.js';
import { buildSampleAssessment } from '../content/sample.js';

const Ctx = createContext(null);

export function WorkspaceProvider({ children }) {
  const [ws, setWs] = useState(() => {
    const w = loadWorkspace();
    if (!w.assessments.some((a) => a.sample)) w.assessments.push(buildSampleAssessment());
    return w;
  });
  const [currentId, setCurrentId] = useState(null);
  const [route, setRoute] = useState('home');
  const [toasts, setToasts] = useState([]);
  const wsRef = useRef(ws);
  wsRef.current = ws;

  useEffect(() => { saveWorkspace(ws); }, [ws]);

  useEffect(() => {
    onUsage(({ inputTokens, outputTokens, costUsd, error }) => {
      setWs((w) => ({ ...w, usage: { inputTokens: w.usage.inputTokens + inputTokens, outputTokens: w.usage.outputTokens + outputTokens, costUsd: w.usage.costUsd + costUsd, calls: w.usage.calls + 1, errors: w.usage.errors + (error ? 1 : 0) } }));
    });
  }, []);

  const toast = useCallback((text, tone = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const current = useMemo(() => ws.assessments.find((a) => a.id === currentId) || null, [ws, currentId]);

  // update(mutator, { action, before, after, undoable })
  const update = useCallback((mutator, meta = {}) => {
    setWs((w) => {
      const asm = w.assessments.find((a) => a.id === (meta.assessmentId || currentId));
      if (!asm) return w;
      const prevSnap = snapshot(asm);
      let next = typeof mutator === 'function' ? mutator(asm) : { ...asm, ...mutator };
      if (!next) return w;
      next = { ...next, updatedAt: Date.now() };
      if (meta.undoable !== false && snapshot(next) !== prevSnap) next = pushHistory(next, prevSnap);
      let w2 = upsertAssessment(w, next);
      if (meta.action) w2 = audit(w2, { assessmentId: asm.id, action: meta.action, before: meta.before, after: meta.after });
      return w2;
    });
  }, [currentId]);

  const createAssessment = useCallback((partial) => {
    const asm = newAssessment(partial);
    setWs((w) => audit(upsertAssessment(w, asm), { assessmentId: asm.id, action: 'assessment.created' }));
    setCurrentId(asm.id); setRoute('author');
    return asm;
  }, []);
  const openAssessment = useCallback((id) => { setCurrentId(id); setRoute('author'); }, []);
  const deleteAssessment = useCallback((id) => { setWs((w) => audit({ ...w, assessments: w.assessments.filter((a) => a.id !== id) }, { assessmentId: id, action: 'assessment.deleted' })); if (currentId === id) { setCurrentId(null); setRoute('home'); } }, [currentId]);
  const duplicateAssessment = useCallback((id) => {
    const src = wsRef.current.assessments.find((a) => a.id === id);
    if (!src) return;
    const copy = newAssessment({ intent: JSON.parse(JSON.stringify(src.intent)), skills: JSON.parse(JSON.stringify(src.skills)), skillsConfirmed: src.skillsConfirmed, blueprint: JSON.parse(JSON.stringify(src.blueprint)), scenarios: JSON.parse(JSON.stringify(src.scenarios)).map((s) => ({ ...s, approved: false, calibration: s.responseType === 'MCQ' ? 'not_applicable' : 'pending' })), config: { ...JSON.parse(JSON.stringify(src.config)), name: `${src.config.name || 'Assessment'} (copy)` }, step: src.scenarios?.length ? 4 : 1 });
    setWs((w) => audit(upsertAssessment(w, copy), { assessmentId: copy.id, action: 'assessment.duplicated', before: id }));
    setCurrentId(copy.id); setRoute('author');
  }, []);

  const undo = useCallback(() => update((a) => undoAsm(a), { undoable: false, action: 'undo' }), [update]);
  const redo = useCallback(() => update((a) => redoAsm(a), { undoable: false, action: 'redo' }), [update]);

  const value = { ws, setWs, current, currentId, route, setRoute, update, createAssessment, openAssessment, deleteAssessment, duplicateAssessment, undo, redo, canUndo: Boolean(current?.history?.length), canRedo: Boolean(current?.future?.length), toast, toasts, goHome: () => { setRoute('home'); } };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() { return useContext(Ctx); }
