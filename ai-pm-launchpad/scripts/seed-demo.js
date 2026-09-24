'use strict';
// Adds a clearly labelled demo cohort with 12 sample learners. Remove them from the facilitator dashboard before a real cohort.
process.env.ADMIN_EMAIL = process.env.ADMIN_EMAIL || '';
const { createApp } = require('../server/app');
const E = require('../server/engine');
const app = createApp({ quiet: true });
const { db, K } = app;
const now = Date.now(); let seed = 7; const rnd = () => (seed = seed * 16807 % 2147483647) / 2147483647;
let cohort = db.get("SELECT * FROM cohorts WHERE code = 'LP-DEMO0001'");
if (!cohort) { db.run("INSERT INTO cohorts (name, code, active, created_at) VALUES ('Demo cohort', 'LP-DEMO0001', 1, ?)", now); cohort = db.get("SELECT * FROM cohorts WHERE code = 'LP-DEMO0001'"); }
const aliases = ['Swift Heron', 'Calm Otter', 'Bold Lynx', 'Keen Kestrel', 'Bright Orca', 'Nimble Ibex', 'Steady Wren', 'Quiet Fox', 'Clear Crane', 'Curious Falcon', 'Bold Wren', 'Keen Otter'];
const teams = Object.keys(K.game.SQUADS);
aliases.forEach((alias, i) => {
  const email = `sample${i + 1}@demo.invalid`; if (db.get('SELECT id FROM users WHERE email = ?', email)) return;
  const uid = db.run('INSERT INTO users (cohort_id, email, name, role, team, visibility, alias, onboarded, demo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?)', cohort.id, email, 'Sample learner ' + (i + 1), 'learner', teams[i % 4], 'alias', alias, now).lastInsertRowid;
  const skill = 0.45 + rnd() * 0.45; const n = 1 + Math.floor(rnd() * 4);
  for (let j = 0; j < n; j++) {
    const m = K.missions[j]; const tries = 1 + Math.floor(rnd() * 3); const base = Math.round(40 + skill * 55 + rnd() * 10 - 5);
    for (let t = 0; t < tries; t++) {
      const score = Math.min(98, base + t * Math.round(4 + rnd() * 10)); const at = now - Math.round(rnd() * 40 * E.DAY);
      const skills = {}; for (const c of m.rubric) skills[c.skill] = Math.max(0, Math.min(4, Math.round(score / 25 + rnd() - 0.5)));
      db.run(`INSERT INTO attempts (user_id, mission_id, score, stars, facts, evidence, mode, predicted, decision, over, walkout, skills, criteria, assessment, xp, scored_by, day, created_at) VALUES (?, ?, ?, ?, 2, 0, 'guided', 70, 'b', 0, 0, ?, '[]', '{}', ?, 'scripted', ?, ?)`, uid, m.id, score, E.starsFor(score, 2, 70), JSON.stringify(skills), score, E.dayKey(at, 'UTC'), at);
      db.run('INSERT INTO xp_events (user_id, amount, reason, day, at) VALUES (?, ?, ?, ?, ?)', uid, score, 'Sample', E.dayKey(at, 'UTC'), at);
    }
  }
});
console.log('Demo cohort ready. Invite code: LP-DEMO0001');
app.close();
