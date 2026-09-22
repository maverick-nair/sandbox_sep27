// Form ordering (PRD 10.1). Scenarios are independent, so each participant receives their own order:
// a seeded shuffle that still interleaves Skills (no two consecutive scenarios share a primary Skill)
// and alternates response types (no more than two Audio scenarios back to back). Fixed order per form
// remains available for parallel form comparisons.
function rng(seed) {
  let s = (typeof seed === 'number' ? seed : hashSeed(String(seed))) >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
export function hashSeed(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

function constrainedOrder(pool, pick) {
  const out = [];
  const rest = [...pool];
  while (rest.length) {
    const last = out[out.length - 1];
    const audioRun = out.length >= 2 && out[out.length - 1].responseType === 'Audio' && out[out.length - 2].responseType === 'Audio';
    let candidates = rest.filter((s) => (!last || s.skillId !== last.skillId) && !(audioRun && s.responseType === 'Audio'));
    if (!candidates.length) candidates = rest.filter((s) => !last || s.skillId !== last.skillId);
    if (!candidates.length) candidates = rest;
    const chosen = pick(candidates);
    out.push(chosen);
    rest.splice(rest.indexOf(chosen), 1);
  }
  return out;
}

// A greedy pass can corner itself on the last scenarios, so several derived attempts run and the first
// clean order wins; the order with the fewest violations is the fallback.
function bestOf(scenarios, attempts) {
  let best = null;
  for (let k = 0; k < attempts; k++) {
    const order = constrainedOrder(scenarios, pickFor(k));
    const v = violations(order).length;
    if (v === 0) return order;
    if (!best || v < best.v) best = { order, v };
  }
  return best.order;
  function pickFor(k) { return typeof attemptsPicker === 'function' ? attemptsPicker(k) : (c) => c[0]; }
}
let attemptsPicker = null;

// Fixed order: deterministic interleave from the authored order, rotating the start when needed.
export function fixedOrder(scenarios) {
  attemptsPicker = (k) => (c) => c[k % c.length];
  const out = bestOf(scenarios, Math.max(1, scenarios.length));
  attemptsPicker = null;
  return out;
}

// Shuffled order for one participant. The seed is the participant's attempt id in delivery, so the order
// is stable across sittings and different between participants sitting at the same time.
export function shuffledOrder(scenarios, seed) {
  const base = typeof seed === 'number' ? seed : hashSeed(String(seed));
  attemptsPicker = (k) => { const r = rng((base + k * 7919) >>> 0); return (c) => c[Math.floor(r() * c.length)]; };
  const out = bestOf(scenarios, 40);
  attemptsPicker = null;
  return out;
}

export function orderForm(scenarios, { mode = 'shuffled', seed = Date.now() } = {}) {
  return mode === 'fixed' ? fixedOrder(scenarios) : shuffledOrder(scenarios, seed);
}

export function violations(order) {
  const v = [];
  for (let i = 1; i < order.length; i++) if (order[i].skillId === order[i - 1].skillId) v.push(`same Skill at ${i} and ${i + 1}`);
  for (let i = 2; i < order.length; i++) if (order[i].responseType === 'Audio' && order[i - 1].responseType === 'Audio' && order[i - 2].responseType === 'Audio') v.push(`three Audio in a row at ${i + 1}`);
  return v;
}
