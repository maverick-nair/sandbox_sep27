'use strict';
// SQLite storage (Node's built-in node:sqlite). One file, easy to back up.
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

function open(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS cohorts (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, code TEXT NOT NULL UNIQUE,
      active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, cohort_id INTEGER REFERENCES cohorts(id) ON DELETE SET NULL,
      email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'learner',
      pass_hash TEXT, team TEXT NOT NULL DEFAULT 'evaluate', visibility TEXT NOT NULL DEFAULT 'alias',
      mode TEXT NOT NULL DEFAULT 'guided', alias TEXT NOT NULL, tz TEXT NOT NULL DEFAULT 'UTC',
      onboarded INTEGER NOT NULL DEFAULT 0, demo INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS runs (
      id TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mission_id TEXT NOT NULL, mode TEXT NOT NULL, state TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
      started_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS attempts (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      mission_id TEXT NOT NULL, run_id TEXT, score INTEGER NOT NULL, stars INTEGER NOT NULL,
      facts INTEGER NOT NULL, evidence INTEGER NOT NULL, mode TEXT NOT NULL, predicted INTEGER,
      decision TEXT NOT NULL, over INTEGER NOT NULL, walkout INTEGER NOT NULL,
      skills TEXT NOT NULL, criteria TEXT NOT NULL, assessment TEXT NOT NULL, transcript TEXT,
      xp INTEGER NOT NULL, scored_by TEXT NOT NULL, review_sample INTEGER NOT NULL DEFAULT 0,
      day TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS attempts_user ON attempts(user_id, mission_id);
    CREATE TABLE IF NOT EXISTS xp_events (
      id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL, reason TEXT NOT NULL, day TEXT NOT NULL, at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS badges (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, badge_id TEXT NOT NULL, at INTEGER NOT NULL,
      PRIMARY KEY (user_id, badge_id));
    CREATE TABLE IF NOT EXISTS sparks (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, day TEXT NOT NULL, score INTEGER NOT NULL,
      xp INTEGER NOT NULL, text TEXT, feedback TEXT, better TEXT, skill TEXT, at INTEGER NOT NULL,
      PRIMARY KEY (user_id, day));
    CREATE TABLE IF NOT EXISTS chests (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, chest_id TEXT NOT NULL, xp INTEGER NOT NULL,
      note TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (user_id, chest_id));
    CREATE TABLE IF NOT EXISTS challenges (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, week INTEGER NOT NULL,
      PRIMARY KEY (user_id, week));
    CREATE TABLE IF NOT EXISTS reviews (
      attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
      reviewer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      scores TEXT NOT NULL, note TEXT, at INTEGER NOT NULL, PRIMARY KEY (attempt_id, reviewer_id));
    CREATE TABLE IF NOT EXISTS usage (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, day TEXT NOT NULL, tokens INTEGER NOT NULL,
      calls INTEGER NOT NULL, PRIMARY KEY (user_id, day));
    CREATE TABLE IF NOT EXISTS audit (
      id INTEGER PRIMARY KEY, actor_id INTEGER, action TEXT NOT NULL, detail TEXT, at INTEGER NOT NULL);
  `);
  const q = (sql) => db.prepare(sql);
  return {
    raw: db,
    get: (sql, ...p) => q(sql).get(...p),
    all: (sql, ...p) => q(sql).all(...p),
    run: (sql, ...p) => q(sql).run(...p),
    tx(fn) { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } },
    close: () => db.close()
  };
}
module.exports = { open };
