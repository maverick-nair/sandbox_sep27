import { useCallback, useEffect, useRef, useState } from 'react';
import { TEMPLATES } from '../templates/registry.js';

// Prototype persistence: the browser's local storage. Production stores definitions and versions
// in GenieKreator's backend; the record shape here is the one the API would carry.
const KEY = 'gk-sim-studio-v1';

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function write(sims) {
  try {
    localStorage.setItem(KEY, JSON.stringify(sims));
  } catch {
    /* storage full or blocked: the session keeps working in memory */
  }
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
    balance: null,
    ...extra,
  };
}

function seed() {
  const def = TEMPLATES.ilead.create();
  def.meta.name = 'iLead: Sales Elevator (migrated)';
  const rec = newSimRecord(def);
  rec.status = 'published';
  rec.versions = [{ version: 1, note: 'Migrated from the legacy Sales Elevator International workbook', at: rec.createdAt, def: structuredClone(def) }];
  return [rec];
}

export function useSims() {
  const [sims, setSims] = useState(() => {
    const stored = read();
    if (!Array.isArray(stored) || !stored.length) return seed();
    return stored
      .filter((s) => s.def?.schema === 1 && TEMPLATES[s.def.meta?.templateId])
      .map((s) => ({ ...s, def: TEMPLATES[s.def.meta.templateId].migrate(s.def) }));
  });
  const timer = useRef(null);
  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => write(sims), 250);
    return () => clearTimeout(timer.current);
  }, [sims]);

  const create = useCallback((def) => {
    const rec = newSimRecord(def);
    setSims((s) => [rec, ...s]);
    return rec.id;
  }, []);

  // mutator receives a draft copy of the definition and may change it in place.
  const update = useCallback((id, mutator) => {
    setSims((list) =>
      list.map((s) => {
        if (s.id !== id) return s;
        const def = structuredClone(s.def);
        const out = mutator(def);
        return { ...s, def: out && typeof out === 'object' && out.schema ? out : def, updatedAt: Date.now() };
      }),
    );
  }, []);

  const patchRecord = useCallback((id, patch) => {
    setSims((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const remove = useCallback((id) => setSims((list) => list.filter((s) => s.id !== id)), []);

  const duplicate = useCallback((id) => {
    let newId = null;
    setSims((list) => {
      const src = list.find((s) => s.id === id);
      if (!src) return list;
      const def = structuredClone(src.def);
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
        return { ...s, status: 'published', versions: [...s.versions, { version, note, at: Date.now(), def: structuredClone(s.def) }], publishedAt: Date.now() };
      }),
    );
  }, []);

  const restore = useCallback((id, version) => {
    setSims((list) =>
      list.map((s) => {
        if (s.id !== id) return s;
        const v = s.versions.find((x) => x.version === version);
        return v ? { ...s, def: structuredClone(v.def), updatedAt: Date.now() } : s;
      }),
    );
  }, []);

  const reset = useCallback(() => setSims(seed()), []);

  return { sims, create, update, patchRecord, remove, duplicate, publish, restore, reset };
}
