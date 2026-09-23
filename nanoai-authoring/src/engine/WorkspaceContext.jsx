import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { emptyWorkspace, newAssessment, upsertAssessment, audit, snapshot, contentKey, pushHistory, undo as undoAsm, redo as redoAsm, isEmptyDraft, SCHEMA_VERSION } from './store.js';
import { loadPersisted, savePersisted, onSaveStatus, loadUiState, saveUiState, tabChannel, flushSave } from './storage.js';
import { onUsage } from './llm.js';
import { buildSampleAssessment } from '../content/sample.js';
import { getSkill } from '../content/ontology.js';

const Ctx = createContext(null);

function migrateLoaded(ws) {
  // store.js migrate() is applied through loadWorkspace semantics; here we normalise minimal shape.
  const base = { ...emptyWorkspace(), ...ws };
  if (!base.assessments.some((a) => a.sample)) base.assessments.push(buildSampleAssessment());
  return base;
}

export function WorkspaceProvider({ children }) {
  const [ws, setWs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [backend, setBackend] = useState('indexeddb');
  const [saveStatus, setSaveStatus] = useState({ ok: true });
  const [currentId, setCurrentId] = useState(null);
  const [route, setRoute] = useState('home');
  const [toasts, setToasts] = useState([]);
  const [panel, setPanel] = useState(null); // 'settings' | 'help' | null, shown as a dialog over any page
  const wsRef = useRef(null); wsRef.current = ws;
  const channel = useRef(null);
  const tabId = useRef(Math.random().toString(36).slice(2));

  // Load from IndexedDB (migrating any earlier localStorage workspace), then restore the open assessment.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { workspace, backend: b } = await loadPersisted();
      if (!alive) return;
      const { loadWorkspaceFrom } = await import('./store.js');
      const loaded = migrateLoaded(loadWorkspaceFrom(workspace));
      setBackend(b); setWs(loaded);
      const ui = loadUiState();
      if (ui.currentId && loaded.assessments.some((a) => a.id === ui.currentId) && (ui.route === 'author' || ui.route === 'calibration')) { setCurrentId(ui.currentId); setRoute(ui.route); }
      else if (ui.route === 'templates') setRoute('templates');
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => { if (ws) { savePersisted(ws); channel.current?.postMessage({ from: tabId.current, at: Date.now() }); } }, [ws]);
  useEffect(() => onSaveStatus(setSaveStatus), []);
  // Only persist UI state once the stored one has been read, or the initial render would overwrite it.
  useEffect(() => { if (!loading) saveUiState({ currentId, route }); }, [currentId, route, loading]);
  useEffect(() => { const flush = () => flushSave(); window.addEventListener('beforeunload', flush); return () => window.removeEventListener('beforeunload', flush); }, []);

  // Other tabs: reload the workspace when another tab saved.
  useEffect(() => {
    channel.current = tabChannel();
    if (!channel.current) return;
    channel.current.onmessage = async (e) => {
      if (e.data?.from === tabId.current) return;
      const { workspace } = await loadPersisted();
      if (workspace) { const { loadWorkspaceFrom } = await import('./store.js'); setWs(migrateLoaded(loadWorkspaceFrom(workspace))); toast('Updated from another tab.'); }
    };
    return () => channel.current?.close();
  }, []); // eslint-disable-line

  useEffect(() => {
    onUsage(({ inputTokens, outputTokens, error }) => {
      setWs((w) => (w ? { ...w, usage: { inputTokens: w.usage.inputTokens + inputTokens, outputTokens: w.usage.outputTokens + outputTokens, calls: w.usage.calls + 1, errors: w.usage.errors + (error ? 1 : 0) } } : w));
    });
  }, []);

  const toast = useCallback((text, tone = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-2), { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4500);
  }, []);

  const current = useMemo(() => ws?.assessments.find((a) => a.id === currentId) || null, [ws, currentId]);

  // update(mutator, { action, before, after, undoable, allowPublished, assessmentId })
  // A published assessment refuses content changes unless the caller says it is starting a new version.
  const update = useCallback((mutator, meta = {}) => {
    let refused = false;
    setWs((w) => {
      if (!w) return w;
      const asm = w.assessments.find((a) => a.id === (meta.assessmentId || currentId));
      if (!asm) return w;
      const prevSnap = snapshot(asm);
      let next = typeof mutator === 'function' ? mutator(asm) : { ...asm, ...mutator };
      if (!next) return w;
      if (asm.status === 'published' && !meta.allowPublished && contentKey(next) !== contentKey(asm)) { refused = true; return w; }
      next = { ...next, updatedAt: Date.now() };
      if (meta.undoable !== false && snapshot(next) !== prevSnap) next = pushHistory(next, prevSnap);
      let w2 = upsertAssessment(w, next);
      if (meta.action) w2 = audit(w2, { assessmentId: asm.id, action: meta.action, before: meta.before, after: meta.after });
      return w2;
    });
    if (refused) toast('This version is published and cannot be changed. Use "Edit as new version".', 'error');
  }, [currentId, toast]);

  // Leaving an assessment that was never touched removes it so the dashboard does not fill with blanks.
  const leave = useCallback(() => {
    setWs((w) => (w && currentId ? { ...w, assessments: w.assessments.filter((a) => !(a.id === currentId && isEmptyDraft(a))) } : w));
  }, [currentId]);
  const goHome = useCallback(() => { leave(); setRoute('home'); }, [leave]);
  const goRoute = useCallback((r) => { if (r !== 'author' && r !== 'calibration') leave(); setRoute(r); }, [leave]);

  const createAssessment = useCallback((partial) => {
    // Reuse an existing untouched draft rather than creating another.
    const blank = wsRef.current?.assessments.find((a) => isEmptyDraft(a));
    if (blank && !partial) { setCurrentId(blank.id); setRoute('author'); return blank; }
    const asm = newAssessment(partial);
    setWs((w) => audit(upsertAssessment(w, asm), { assessmentId: asm.id, action: 'assessment.created' }));
    setCurrentId(asm.id); setRoute('author');
    return asm;
  }, []);
  const openAssessment = useCallback((id, r = 'author') => { leave(); setCurrentId(id); setRoute(r); }, [leave]);
  // Start from a template: brief, audience, purpose and Skills prefilled; the author confirms and builds.
  const createFromTemplate = useCallback((tpl) => {
    const asm = newAssessment({ intent: { audience: tpl.audience, situationsText: tpl.brief, purpose: tpl.purpose, terminology: '', documents: [], extracted: null, language: 'en', fromTemplate: tpl.id }, skills: tpl.skills.map((id) => ({ id, confidence: 'High', evidence: [], source: `From the "${tpl.name}" template` })), config: { ...newAssessment().config, name: tpl.name } });
    setWs((w) => audit(upsertAssessment(w, asm), { assessmentId: asm.id, action: 'assessment.created_from_template', after: tpl.id }));
    setCurrentId(asm.id); setRoute('author');
    return asm;
  }, []);
  const deleteAssessment = useCallback((id) => { setWs((w) => audit({ ...w, assessments: w.assessments.filter((a) => a.id !== id) }, { assessmentId: id, action: 'assessment.deleted' })); if (currentId === id) { setCurrentId(null); setRoute('home'); } }, [currentId]);
  const duplicateAssessment = useCallback((id) => {
    const src = wsRef.current.assessments.find((a) => a.id === id);
    if (!src) return;
    const copy = newAssessment({ intent: JSON.parse(JSON.stringify(src.intent)), skills: JSON.parse(JSON.stringify(src.skills)), skillsConfirmed: src.skillsConfirmed, blueprint: JSON.parse(JSON.stringify(src.blueprint)), scenarios: JSON.parse(JSON.stringify(src.scenarios)).map((s) => ({ ...s, approved: false, calibration: s.responseType === 'MCQ' ? 'not_applicable' : 'pending' })), config: { ...JSON.parse(JSON.stringify(src.config)), name: `${src.config.name || 'Assessment'} (copy)` }, stage: src.scenarios?.length ? 2 : 1 });
    setWs((w) => audit(upsertAssessment(w, copy), { assessmentId: copy.id, action: 'assessment.duplicated', before: id }));
    setCurrentId(copy.id); setRoute('author');
  }, []);

  const undo = useCallback(() => update((a) => undoAsm(a), { undoable: false, action: 'undo' }), [update]);
  const redo = useCallback(() => update((a) => redoAsm(a), { undoable: false, action: 'redo' }), [update]);

  const value = { ws, setWs, loading, backend, saveStatus, current, currentId, route, setRoute: goRoute, update, createAssessment, openAssessment, createFromTemplate, panel, openPanel: setPanel, closePanel: () => setPanel(null), deleteAssessment, duplicateAssessment, undo, redo, canUndo: Boolean(current?.history?.length), canRedo: Boolean(current?.future?.length), toast, toasts, goHome, role: ws?.role || 'author', schemaVersion: SCHEMA_VERSION };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() { return useContext(Ctx); }
