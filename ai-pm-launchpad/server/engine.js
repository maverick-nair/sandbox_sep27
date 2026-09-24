'use strict';
// Game rules. Everything that affects a score, XP, a badge or a rank is computed here, on the server.
const DAY = 86400000;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function dayKey(t, tz) {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t)); }
  catch { return new Date(t).toISOString().slice(0, 10); }
}
function validTz(tz) { if (typeof tz !== 'string' || !tz || tz.length > 64) return false; try { new Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; } }
function weekIndex(t) { return Math.floor((t / DAY + 3) / 7); }
function prevDay(key) { const d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); }

function starsFor(score, facts, pass) { if (score < pass) return 0; if (score >= 90 && facts === 3) return 3; if (score >= 85) return 2; return 1; }
function levelOf(levels, xp) { let L = levels[0]; for (const l of levels) if (xp >= l.xp) L = l; return L; }
function nextLevel(levels, xp) { return levels.find(l => l.xp > xp) || null; }

function streakInfo(days, tz, now = Date.now()) {
  const set = new Set(days); const shields = Math.min(2, Math.floor(set.size / 5));
  let n = 0, used = 0, k = dayKey(now, tz);
  const today = set.has(k); if (!today) k = prevDay(k);
  for (let g = 0; g < 400; g++) {
    if (set.has(k)) { n++; k = prevDay(k); continue; }
    if (n > 0 && used < shields && set.has(prevDay(k))) { used++; k = prevDay(k); continue; }
    break;
  }
  return { n, shields: shields - used, today };
}

function rating(attempts, tiers, byId) {
  const best = {};
  for (const a of attempts) { const m = byId[a.mission_id]; if (!m) continue; const v = Math.min(100, a.score * tiers[m.tier].mult); best[a.mission_id] = Math.max(best[a.mission_id] ?? 0, v); }
  const vals = Object.values(best); if (!vals.length) return { value: 0, n: 0 };
  const mean = vals.reduce((x, y) => x + y, 0) / vals.length;
  return { value: Math.round(mean * Math.min(1, vals.length / 3) * 10) / 10, n: vals.length };
}
function improvement(attempts) {
  const by = {}; for (const a of [...attempts].sort((x, y) => x.created_at - y.created_at)) (by[a.mission_id] ??= []).push(a.score);
  const d = Object.values(by).filter(xs => xs.length > 1).map(xs => Math.max(...xs) - xs[0]);
  return d.length ? Math.round(d.reduce((x, y) => x + y, 0) / d.length * 10) / 10 : null;
}
function skillRatings(attempts, skills) {
  const out = {};
  for (const k of Object.keys(skills)) {
    const per = {};
    for (const a of attempts) { const s = typeof a.skills === 'string' ? JSON.parse(a.skills) : a.skills; const v = s?.[k]; if (v == null) continue; per[a.mission_id] = Math.max(per[a.mission_id] ?? 0, v); }
    const vals = Object.values(per); out[k] = vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
  }
  return out;
}
function profLevel(r) { if (r == null) return 'Not yet assessed'; if (r < 1.5) return 'L1 Foundation'; if (r < 2.5) return 'L2 Practitioner'; if (r < 3.3) return 'L3 Advanced'; return 'L4 Expert'; }

// ---------- Anti-gaming ----------
const CAREFUL = ['pilot', 'phase', 'stage', 'metric', 'measure', 'eval', 'test', 'consent', 'anonym', 'human', 'manager', 'approve', 'risk', 'trade-off', 'tradeoff', 'threshold', 'evidence', 'data', 'limit', 'fair', 'review', 'cache', 'route'];
const OVER = ['guarantee', 'definitely', '100%', '98%', 'always', 'every time', 'no problem', 'sure, go', 'yes, go ahead', 'of course', 'absolutely', 'just do it', 'we can ship', 'ship it', 'start this week', 'take them all', 'no approvals', 'fully autonomous'];
const hasAny = (t, kws) => kws.some(k => t.includes(k));
function isStuffed(texts) {
  const all = texts.join(' ').toLowerCase(); const words = all.split(/\s+/).filter(Boolean);
  const hits = words.filter(w => CAREFUL.some(k => w.includes(k))).length;
  const repeats = texts.length - new Set(texts.map(x => x.trim().toLowerCase())).size;
  const avgSentence = words.length / Math.max(1, (all.match(/[.!?]/g) || []).length);
  return (words.length > 0 && hits / words.length > 0.3) || repeats >= 1 || avgSentence > 45;
}
function isOverpromise(text) {
  const t = text.toLowerCase(); const neg = /\b(cannot|can't|won't|will not|not promise|don't|do not|never)\b/.test(t);
  return hasAny(t, OVER) && !neg;
}

// ---------- Scripted engine (used when Claude is unavailable) ----------
const VOICE_BANK = {
  discover: ['Something is behind this request. What do they really need?', "You haven't asked why yet.", 'Who are the actual users here?'],
  uncertainty: ["Say what you know, what you don't, and when you will.", "A number you can't defend is a promise you'll break.", 'Name the limit before they find it.'],
  evals: ['How was this measured, and on whose data?', 'A demo is not evidence.', "Ask what 'accurate' means here."],
  rai: ['Who could be harmed if this goes wrong?', 'Consent covers a purpose. Is this that purpose?', 'Where does a human stay in the loop?'],
  economics: ['What does each successful outcome actually cost?', 'Follow the tokens.', 'Which users drive the cost?'],
  influence: ['Give them something concrete they can say yes to.', 'Scope, metric, owner, date.', 'Offer a path, not just a no.']
};
function scriptedPersona(state, m, text, moment) {
  const t = text.toLowerCase(); const revealed = []; const flags = [];
  if (t.includes('?')) {
    // Reveal the unrevealed fact whose keywords the question matches best.
    const scored = m.facts.filter(f => !state.revealed.includes(f.id)).map(f => ({ f, n: f.kw.filter(k => t.includes(k)).length })).filter(x => x.n > 0).sort((a, b) => b.n - a.n);
    if (scored[0]) revealed.push(scored[0].f.id);
  }
  const over = isOverpromise(text), careful = CAREFUL.filter(k => t.includes(k)).length, q = (t.match(/\?/g) || []).length, cited = /evidence:/.test(t);
  if (over) flags.push('overpromise'); if (q) flags.push('good_question'); if (careful >= 2) flags.push('clear_tradeoff');
  let reply;
  if (revealed.length) reply = 'Fair question. ' + m.facts.find(x => x.id === revealed[0]).text + " Does that change what you'd recommend?";
  else if (over) reply = "That's exactly what I wanted to hear. So I can go ahead and say yes to all of it?";
  else if (careful >= 2 || cited) reply = "Okay, that's more concrete than I expected. What would you need from me to make that happen, and how fast?";
  else if (q) reply = "I'm not sure that's the right question. What do you actually need to know before we decide?";
  else reply = "I hear you, but I need something I can act on. What's your recommendation?";
  if (moment) reply += ' ' + moment;
  const missing = m.facts.find(f => !state.revealed.includes(f.id) && !revealed.includes(f.id));
  const vskill = over ? 'uncertainty' : missing ? 'discover' : m.rubric[2].skill;
  return {
    reply, revealed, flags,
    trust: over ? 2 : (careful >= 2 || cited ? 6 : (q ? 3 : -4)), clarity: careful >= 2 || cited ? 7 : (over ? 3 : -3), risk: over ? -9 : (careful >= 1 ? 5 : 0),
    voice: { skill: vskill, line: over ? 'Careful. You just committed before checking the facts.' : VOICE_BANK[vskill][state.learnerTurns % 3] }
  };
}
function scriptedAssess(state, m, decision, rationale) {
  const turns = state.turns.filter(x => x.role === 'learner').map(x => x.text);
  const learner = (turns.join(' ') + ' ' + rationale).toLowerCase();
  const q = turns.filter(x => x.includes('?')).length, careful = CAREFUL.filter(k => learner.includes(k)).length;
  const over = state.flags.includes('overpromise'), found = state.revealed.length, dpts = decision.pts;
  const criteria = {};
  for (const c of m.rubric) {
    let sc;
    if (c.skill === 'discover') sc = clamp(Math.round(found * 1.1 + (q >= 3 ? 1 : 0)), 0, 4);
    else if (c.skill === 'rai') sc = clamp((careful >= 3 ? 2 : 1) + (dpts >= 25 ? 1 : 0) + (over ? -1 : 1), 0, 4);
    else if (c.skill === 'uncertainty') sc = clamp((over ? 1 : 3) + (/limit|not /.test(learner) ? 1 : 0) - (dpts < 10 ? 1 : 0), 0, 4);
    else if (c.skill === 'evals') sc = clamp((/eval|test|agreement/.test(learner) ? 2 : 1) + (found >= 2 ? 1 : 0) + (dpts >= 25 ? 1 : 0), 0, 4);
    else if (c.skill === 'economics') sc = clamp((/cost|₹|value|outcome/.test(learner) ? 2 : 1) + (found >= 2 ? 1 : 0) + (dpts >= 25 ? 1 : 0), 0, 4);
    else sc = clamp((dpts >= 25 ? 2 : 1) + (careful >= 2 ? 1 : 0) + (rationale.length > 80 ? 1 : 0) + (state.evidenceUsed.length >= 1 ? 1 : 0), 0, 4);
    criteria[c.id] = { score: sc, evidence: 'none', feedback: sc >= 3 ? 'Solid evidence of this behaviour.' : 'Show this more explicitly in the conversation.' };
  }
  return {
    criteria,
    strengths: [found >= 2 ? 'You uncovered most of the hidden facts.' : 'You kept the conversation moving.', dpts >= 25 ? 'Your final decision balanced value and risk.' : 'You made a clear decision.'],
    gaps: [over ? 'You over-promised before checking the facts.' : 'Ask more open questions early.', dpts < 25 ? 'Your decision left a major risk unmanaged.' : 'Tie your plan to a measurable outcome.'],
    rewrite: null, next: found < 3 ? 'Replay and aim to uncover all three hidden facts before proposing.' : 'Try Expert mode without inner voices.'
  };
}

// ---------- Scoring ----------
function scoreAttempt(state, m, decision, assessment, rules) {
  const stuffed = isStuffed([...state.turns.filter(t => t.role === 'learner').map(t => t.text), state.rationale || '']);
  const crit = m.rubric.map(c => {
    const x = assessment.criteria[c.id] || {};
    let s = clamp(Math.round(Number(x.score) || 0), 0, 4);
    if (stuffed) s = Math.min(s, 1);
    return { id: c.id, score: s, evidence: String(x.evidence || 'none').slice(0, 300), feedback: stuffed ? 'Write to the stakeholder in full sentences; keyword lists and repeated messages score low.' : String(x.feedback || '').slice(0, 300) };
  });
  const rubricPct = crit.reduce((a, c) => a + c.score, 0) / (4 * m.rubric.length);
  let score = Math.round(rubricPct * 60 + decision.pts + (state.revealed.length / m.facts.length) * 15);
  if (state.walkout) score = Math.min(score, rules.PASS - 1);
  const skills = {}; for (const c of m.rubric) skills[c.skill] = Math.max(skills[c.skill] ?? 0, crit.find(x => x.id === c.id).score);
  return { score, crit, skills, stuffed, stars: starsFor(score, state.revealed.length, rules.PASS) };
}

module.exports = { DAY, clamp, dayKey, validTz, weekIndex, starsFor, levelOf, nextLevel, streakInfo, rating, improvement, skillRatings, profLevel, isStuffed, isOverpromise, scriptedPersona, scriptedAssess, scoreAttempt, VOICE_BANK };
