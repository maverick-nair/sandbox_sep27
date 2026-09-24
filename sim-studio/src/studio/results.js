// Learner results: one record per completed run, used by the debrief leaderboard, cohort and
// group reports and LMS reporting. When the page runs inside claude.ai with the shared database,
// results are shared by everyone the simulation is shared with; otherwise they stay in this browser.
// Reflections are personal and never leave the learner's own browser.
import { useCallback, useEffect, useRef, useState } from 'react';

const KEY = 'gk-sim-results-v1';
const readLocal = () => { try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; } catch { return []; } };
const writeLocal = (list) => { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-2000))); return true; } catch { return false; } };
const shareable = (r) => { const { reflections, ...rest } = r; return rest; };

export function useResults() {
  const [local, setLocal] = useState(readLocal);
  const [shared, setShared] = useState(null); // null until the shared store answers
  const [backend, setBackend] = useState('browser');
  const db = useRef(null);

  useEffect(() => {
    let off = () => {};
    let live = true;
    const c = typeof window !== 'undefined' ? window.claude : undefined;
    if (!c?.use) return undefined;
    c.use('db').then((d) => {
      if (!live || !d) return;
      db.current = d;
      setBackend('shared');
      off = d.collection('results').limit(1000).onSnapshot(
        (snap) => setShared(snap.docs.map((x) => x.data()).filter(Boolean)),
        () => { setBackend('browser'); setShared(null); },
      );
    }).catch(() => {});
    return () => { live = false; off(); };
  }, []);

  const all = (() => {
    if (!shared) return local;
    const byId = new Map(shared.map((r) => [r.id, r]));
    for (const r of local) if (byId.has(r.id)) byId.set(r.id, { ...byId.get(r.id), reflections: r.reflections });
    return [...byId.values()];
  })();

  const add = useCallback(async (rec) => {
    setLocal((l) => { const n = [...l.filter((x) => x.id !== rec.id), rec]; writeLocal(n); return n; });
    if (db.current) {
      try { await db.current.collection('results').doc(rec.id).set(shareable(rec)); } catch { /* kept locally */ }
    }
  }, []);
  const remove = useCallback(async (ids) => {
    const set = new Set([].concat(ids));
    setLocal((l) => { const n = l.filter((x) => !set.has(x.id)); writeLocal(n); return n; });
    if (db.current) for (const id of set) { try { await db.current.collection('results').doc(id).delete(); } catch { /* ignore */ } }
  }, []);

  return { all, add, remove, backend, forSim: (simId) => all.filter((r) => r.simId === simId) };
}

// Aggregates for the group report.
export function summarise(results, def) {
  const done = results.filter((r) => r.completed !== false);
  const avg = (xs) => (xs.length ? Math.round(xs.reduce((t, x) => t + x, 0) / xs.length) : null);
  const bins = Array.from({ length: 10 }, (_, i) => ({ label: `${i * 10}`, value: 0 }));
  for (const r of done) bins[Math.min(9, Math.floor((r.score || 0) / 10))].value += 1;
  const criteria = {};
  for (const r of done) for (const [k, v] of Object.entries(r.criteria || {})) (criteria[k] ||= []).push(v);
  const concepts = {};
  for (const r of done) for (const [k, v] of Object.entries(r.concepts || {})) (concepts[k] ||= []).push(v);
  const decisions = (def?.decisions?.points || []).map((p) => {
    const answers = done.map((r) => r.decisions?.[p.id]).filter(Boolean);
    const counts = {};
    for (const a of answers) for (const c of String(a.choice || a.band).split(',')) if (c) counts[c] = (counts[c] || 0) + 1;
    return { id: p.id, title: p.title, type: p.type, n: answers.length, avg: avg(answers.map((a) => a.score)), bands: ['strong', 'mixed', 'weak'].map((b) => answers.filter((a) => a.band === b).length), counts };
  });
  return {
    n: done.length,
    avgScore: avg(done.map((r) => r.score)),
    passRate: done.length ? Math.round((done.filter((r) => (r.score || 0) >= (def?.delivery?.passScore ?? 65)).length / done.length) * 100) : null,
    avgAchieved: done.length ? done.reduce((t, r) => t + (r.achieved || 0), 0) / done.length : null,
    bins,
    criteria: Object.entries(criteria).map(([id, xs]) => ({ id, score: avg(xs) })),
    concepts: Object.entries(concepts).map(([id, xs]) => ({ id, score: avg(xs) })).sort((a, b) => a.score - b.score),
    decisions,
  };
}
