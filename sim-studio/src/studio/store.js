import { useCallback, useEffect, useRef, useState } from 'react';
import { TEMPLATES } from '../templates/registry.js';
import { clone } from '../engine/clone.js';
import { schemaProblems } from '../engine/validate.js';

// Prototype persistence: the browser's local storage. Production stores definitions and versions
// in GenieKreator's backend, one record per simulation with version checks; the record shape here
// is the one the API would carry.
export const KEY = 'gk-sim-studio-v1';
export const FLOW_KEY = 'gk-sim-studio-flow-v1';

// Only the newest published versions keep a full copy of the definition. Older ones keep their
// number, note and date, so history stays readable without filling the browser's storage.
export const RESTORABLE_VERSIONS = 5;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// Returns null when saved, or a plain message when the browser refused the write.
function write(sims) {
  try {
    localStorage.setItem(KEY, JSON.stringify(sims));
    return null;
  } catch (e) {
    const full = e?.name === 'QuotaExceededError' || /quota|exceeded|full/i.test(String(e?.message));
    return full ? 'This browser has run out of space for simulations.' : 'This browser is blocking saves (private mode or storage switched off).';
  }
}

export function compactVersions(versions, keep = RESTORABLE_VERSIONS) {
  return versions.map((v, i) => (i < versions.length - keep && v.def ? { version: v.version, note: v.note, at: v.at, trimmed: true } : v));
}

export function newSimRecord(def, extra = {}) {
  const now = Date.now();
  return {
    id: `sim-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    def,
    status: 'draft',
    versions: [],
    createdAt: now,
    updatedAt: now,
    touchedAt: now,
    balance: null,
    ...extra,
  };
}

function seed() {
  const def = TEMPLATES.ilead.create();
  def.meta.name = 'iLead: Sales Elevator (migrated)';
  const rec = newSimRecord(def);
  rec.status = 'published';
  rec.versions = [{ version: 1, note: 'Migrated from the legacy Sales Elevator International workbook', at: rec.createdAt, def: clone(def) }];
  return [rec];
}

function load(list) {
  return list
    .filter((s) => s?.def?.schema === 1 && TEMPLATES[s.def.meta?.templateId])
    .map((s) => {
      // Older drafts kept the author's brief inside the definition; it now lives on the record only.
      const brief = s.brief ?? s.def.meta?.brief ?? null;
      const def = TEMPLATES[s.def.meta.templateId].migrate(s.def);
      delete def.meta.brief;
      const problems = schemaProblems(def);
      if (problems.length) { console.warn('Skipped a stored simulation that is not complete', s.id, problems); return null; }
      const versions = (s.versions || []).map((v) => (v.def?.meta?.brief ? { ...v, def: (() => { const d = clone(v.def); delete d.meta.brief; return d; })() } : v));
      return { ...s, brief, def, versions, touchedAt: s.touchedAt || s.updatedAt };
    })
    .filter(Boolean);
}

const stamp = (rec) => rec.touchedAt || rec.updatedAt || 0;

// Merges what another tab saved with what this tab holds. The newer copy of each simulation wins;
// simulations deleted here stay deleted, and ones deleted there stay deleted unless changed here since.
export function mergeSims(local, stored, { deleted = new Set(), since = 0 } = {}) {
  const byId = new Map(stored.map((s) => [s.id, s]));
  const out = [];
  const seen = new Set();
  for (const s of local) {
    seen.add(s.id);
    const other = byId.get(s.id);
    if (!other) {
      if (stamp(s) > since) out.push(s); // new or changed here; otherwise the other tab deleted it
      continue;
    }
    out.push(stamp(other) > stamp(s) ? other : s);
  }
  for (const s of stored) if (!seen.has(s.id) && !deleted.has(s.id)) out.push(s);
  return out;
}

export function useSims() {
  const [sims, setSims] = useState(() => {
    const stored = read();
    if (!Array.isArray(stored) || !stored.length) return seed();
    const list = load(stored);
    return list.length ? list : seed();
  });
  // saved | saving | error. The header shows this instead of a fixed "Saved" label.
  const [save, setSave] = useState({ state: 'saved', error: '', at: Date.now() });
  const [synced, setSynced] = useState(''); // message when another tab's changes were merged in
  const latest = useRef(sims);
  const pending = useRef(false);
  const deleted = useRef(new Set());
  const lastSync = useRef(Date.now());
  const fromOtherTab = useRef(false);
  latest.current = sims;

  const flush = useCallback(() => {
    if (!pending.current) return;
    pending.current = false;
    let list = latest.current;
    // Merge with anything another tab saved since we last looked, so neither overwrites the other.
    const stored = read();
    if (Array.isArray(stored)) {
      const merged = mergeSims(list, load(stored), { deleted: deleted.current, since: lastSync.current });
      if (merged.length !== list.length || merged.some((s, i) => s !== list[i])) {
        list = merged;
        fromOtherTab.current = true;
        setSims(merged);
      }
    }
    let error = write(list);
    if (error) {
      // Out of space: keep full copies of fewer old versions and try once more.
      const compact = list.map((s) => ({ ...s, versions: compactVersions(s.versions, 2) }));
      if (!write(compact)) {
        error = null;
        fromOtherTab.current = true;
        setSims(compact);
      }
    }
    lastSync.current = Date.now();
    setSave(error ? { state: 'error', error, at: Date.now() } : { state: 'saved', error: '', at: Date.now() });
  }, []);

  const timer = useRef(null);
  useEffect(() => {
    if (fromOtherTab.current) { fromOtherTab.current = false; return undefined; }
    pending.current = true;
    setSave((s) => (s.state === 'error' ? s : { ...s, state: 'saving' }));
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, 250);
    return () => clearTimeout(timer.current);
  }, [sims, flush]);

  // Never lose the last edit when the tab closes or goes to the background.
  useEffect(() => {
    const onHide = () => flush();
    const onVis = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVis);
    return () => { window.removeEventListener('pagehide', onHide); document.removeEventListener('visibilitychange', onVis); };
  }, [flush]);

  // Another tab saved: merge its changes in rather than overwrite them on our next save.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== KEY || !e.newValue) return;
      try {
        const stored = load(JSON.parse(e.newValue));
        const merged = mergeSims(latest.current, stored, { deleted: deleted.current, since: lastSync.current });
        lastSync.current = Date.now();
        fromOtherTab.current = true;
        setSims(merged);
        setSynced('Changes from another tab were merged in.');
      } catch { /* ignore a malformed write */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const touch = (s, patch) => ({ ...s, ...patch, touchedAt: Date.now() });

  const create = useCallback((def, extra = {}) => {
    const rec = newSimRecord(def, extra);
    setSims((s) => [rec, ...s]);
    return rec.id;
  }, []);

  // mutator receives a draft copy of the definition and may change it in place.
  const update = useCallback((id, mutator) => {
    setSims((list) =>
      list.map((s) => {
        if (s.id !== id) return s;
        const def = clone(s.def);
        const out = mutator(def);
        return touch(s, { def: out && typeof out === 'object' && out.schema ? out : def, updatedAt: Date.now() });
      }),
    );
  }, []);

  // Replaces the whole definition (undo, import).
  const replace = useCallback((id, def) => {
    setSims((list) => list.map((s) => (s.id === id ? touch(s, { def, updatedAt: Date.now() }) : s)));
  }, []);

  const patchRecord = useCallback((id, patch) => {
    setSims((list) => list.map((s) => (s.id === id ? touch(s, patch) : s)));
  }, []);

  const remove = useCallback((id) => {
    deleted.current.add(id);
    setSims((list) => list.filter((s) => s.id !== id));
  }, []);

  const duplicate = useCallback((id) => {
    let newId = null;
    setSims((list) => {
      const src = list.find((s) => s.id === id);
      if (!src) return list;
      const def = clone(src.def);
      def.meta.name = `${def.meta.name} (copy)`;
      const rec = newSimRecord(def);
      newId = rec.id;
      return [rec, ...list];
    });
    return newId;
  }, []);

  const publish = useCallback((id, note) => {
    setSims((list) =>
      list.map((s) => {
        if (s.id !== id) return s;
        const version = (s.versions.at(-1)?.version || 0) + 1;
        const versions = compactVersions([...s.versions, { version, note, at: Date.now(), def: clone(s.def) }]);
        return touch(s, { status: 'published', versions, publishedAt: Date.now() });
      }),
    );
  }, []);

  const restore = useCallback((id, version) => {
    setSims((list) =>
      list.map((s) => {
        if (s.id !== id) return s;
        const v = s.versions.find((x) => x.version === version);
        return v?.def ? touch(s, { def: clone(v.def), updatedAt: Date.now() }) : s;
      }),
    );
  }, []);

  const reset = useCallback(() => {
    for (const s of latest.current) deleted.current.add(s.id);
    setSims(seed());
  }, []);

  const retrySave = useCallback(() => { pending.current = true; flush(); }, [flush]);
  const clearSynced = useCallback(() => setSynced(''), []);

  return { sims, save, synced, clearSynced, retrySave, create, update, replace, patchRecord, remove, duplicate, publish, restore, reset };
}

// ---------- the creation flow's own autosave (QA-04) ----------

export function readFlowDraft() {
  try {
    const raw = localStorage.getItem(FLOW_KEY);
    const d = raw ? JSON.parse(raw) : null;
    return d && d.v === 1 ? d : null;
  } catch {
    return null;
  }
}
export function writeFlowDraft(state) {
  try {
    localStorage.setItem(FLOW_KEY, JSON.stringify({ v: 1, at: Date.now(), ...state }));
    return true;
  } catch {
    return false;
  }
}
export function clearFlowDraft() {
  try { localStorage.removeItem(FLOW_KEY); } catch { /* nothing to clear */ }
}

// Everything, for the "Download a backup" action when saving fails or the app hits an error.
export function backupText(sims) {
  return JSON.stringify({ exportedAt: new Date().toISOString(), app: 'GenieKreator Sim Studio', simulations: sims ?? read() ?? [] }, null, 2);
}
export function downloadText(name, text) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}
