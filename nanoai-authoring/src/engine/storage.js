// Persistence. IndexedDB (hundreds of MB) with a localStorage fallback and a one time migration from the
// earlier localStorage key. Saves are debounced and quota errors are surfaced instead of swallowed.
const DB = 'nanoai-authoring', STORE = 'kv', KEY = 'workspace';
const LEGACY = 'nanoai.authoring.workspace.v1';

function openDb() {
  // Some embedded or private contexts never answer an open request; give up after a few seconds and fall back.
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('indexeddb timeout')), 2500);
    const done = (fn) => (v) => { clearTimeout(timer); fn(v); };
    try {
      if (typeof indexedDB === 'undefined') return done(reject)(new Error('no indexeddb'));
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => done(resolve)(req.result);
      req.onerror = () => done(reject)(req.error || new Error('indexeddb error'));
      req.onblocked = () => done(reject)(new Error('indexeddb blocked'));
    } catch (e) { done(reject)(e); }
  });
}
function idbGet(db, key) { return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readonly'); const r = tx.objectStore(STORE).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
function idbSet(db, key, value) { return new Promise((res, rej) => { const tx = db.transaction(STORE, 'readwrite'); tx.objectStore(STORE).put(value, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error || new Error('aborted')); }); }

let dbPromise = null;
let dbUnavailable = false; // a timeout or denial means this context has no database; stop retrying
function db() {
  if (dbUnavailable) return Promise.reject(new Error('indexeddb unavailable'));
  if (!dbPromise) dbPromise = openDb().catch((e) => { dbPromise = null; if (/timeout|denied|blocked|no indexeddb/i.test(String(e?.message || e))) dbUnavailable = true; throw e; });
  return dbPromise;
}

export async function loadPersisted() {
  try {
    const d = await db();
    const v = await idbGet(d, KEY);
    if (v) return { workspace: v, backend: 'indexeddb' };
    const legacy = localStorage.getItem(LEGACY);
    if (legacy) { const ws = JSON.parse(legacy); await idbSet(d, KEY, ws); localStorage.removeItem(LEGACY); return { workspace: ws, backend: 'indexeddb', migrated: true }; }
    return { workspace: null, backend: 'indexeddb' };
  } catch {
    try { const raw = localStorage.getItem(LEGACY); return { workspace: raw ? JSON.parse(raw) : null, backend: 'localstorage' }; } catch { return { workspace: null, backend: 'memory' }; }
  }
}

let timer = null; let pending = null; let listeners = [];
export function onSaveStatus(fn) { listeners.push(fn); return () => { listeners = listeners.filter((l) => l !== fn); }; }
function emit(s) { for (const l of listeners) l(s); }

export function savePersisted(ws) {
  pending = ws;
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const value = pending; pending = null;
    try { const d = await db(); await idbSet(d, KEY, value); emit({ ok: true, at: Date.now(), bytes: approxBytes(value) }); }
    catch (e) {
      try { localStorage.setItem(LEGACY, JSON.stringify(value)); emit({ ok: true, at: Date.now(), fallback: true, bytes: approxBytes(value) }); }
      catch (e2) { emit({ ok: false, at: Date.now(), reason: /quota/i.test(String(e2?.name || e2)) ? 'quota' : /SecurityError|denied/i.test(String(e2?.name || e2)) ? 'unavailable' : String(e2?.message || e2) }); }
    }
  }, 300);
}
export function flushSave() { if (pending && timer) { clearTimeout(timer); const v = pending; pending = null; return db().then((d) => idbSet(d, KEY, v)).catch(() => {}); } return Promise.resolve(); }

export function approxBytes(v) { try { return JSON.stringify(v).length; } catch { return 0; } }
export async function storageEstimate() { try { const e = await navigator.storage?.estimate?.(); return e ? { usage: e.usage, quota: e.quota } : null; } catch { return null; } }

// Small UI state that should survive a reload: open assessment and route.
const UI_KEY = 'nanoai.authoring.ui';
export function loadUiState() { try { return JSON.parse(localStorage.getItem(UI_KEY) || '{}'); } catch { return {}; } }
export function saveUiState(s) { try { localStorage.setItem(UI_KEY, JSON.stringify(s)); } catch {} }

// Cross tab sync: the last writer wins and other tabs reload the workspace.
export function tabChannel() { try { return new BroadcastChannel('nanoai-authoring'); } catch { return null; } }
