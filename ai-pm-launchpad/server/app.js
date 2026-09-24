'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { load, publicMission } = require('./content');
const E = require('./engine');
const A = require('./auth');
const C = require('./claude');
const { open } = require('./db');

const PUBLIC = path.join(__dirname, '..', 'public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

function createApp(opts = {}) {
  const cfg = {
    dataFile: opts.dataFile || process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'launchpad.db'),
    publicUrl: opts.publicUrl || process.env.PUBLIC_URL || '',
    tokenBudget: Number(process.env.DAILY_TOKEN_BUDGET || 600000),
    retentionDays: Number(process.env.RETENTION_DAYS || 365),
    reviewRate: Number(process.env.REVIEW_SAMPLE_RATE || 0.2),
    lrs: process.env.LRS_ENDPOINT || '', lrsAuth: process.env.LRS_AUTH || ''
  };
  const secure = cfg.publicUrl.startsWith('https://');
  const db = open(cfg.dataFile);
  const K = load();
  const G = K.game, R = G.rules;
  const log = (...a) => { if (!opts.quiet) console.log(new Date().toISOString(), ...a); };

  // Bootstrap the first admin from the environment.
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
    const email = process.env.ADMIN_EMAIL.toLowerCase();
    if (!db.get('SELECT id FROM users WHERE email = ?', email)) {
      db.run('INSERT INTO users (email, name, role, pass_hash, alias, onboarded, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)', email, 'Administrator', 'admin', A.hashPassword(process.env.ADMIN_PASSWORD), 'Admin', Date.now());
      log('Created admin account for', email);
    }
  }

  // ---------- helpers ----------
  const json = (res, status, obj, headers = {}) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers }); res.end(JSON.stringify(obj)); };
  const fail = (res, status, message, code) => json(res, status, { error: message, code: code || undefined });
  const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(s => s.trim().split('=')).filter(x => x[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
  async function body(req, limit = 16384) {
    let size = 0; const chunks = [];
    for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error('Request too large'), { status: 413 }); chunks.push(c); }
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
  }
  const buckets = new Map();
  function limited(key, max, windowMs) {
    const now = Date.now(); const b = buckets.get(key) || { n: 0, reset: now + windowMs };
    if (now > b.reset) { b.n = 0; b.reset = now + windowMs; }
    b.n++; buckets.set(key, b); return b.n > max;
  }
  const str = (v, max) => String(v ?? '').trim().slice(0, max);
  const audit = (actor, action, detail) => db.run('INSERT INTO audit (actor_id, action, detail, at) VALUES (?, ?, ?, ?)', actor || null, action, detail ? JSON.stringify(detail) : null, Date.now());
  function makeAlias() {
    const a = ['Swift', 'Curious', 'Steady', 'Bold', 'Clear', 'Bright', 'Calm', 'Keen', 'Nimble', 'Quiet'], b = ['Falcon', 'Heron', 'Otter', 'Lynx', 'Kestrel', 'Orca', 'Ibex', 'Wren', 'Fox', 'Crane'];
    return a[crypto.randomInt(a.length)] + ' ' + b[crypto.randomInt(b.length)];
  }

  // ---------- derived progress ----------
  const attemptsOf = uid => db.all('SELECT * FROM attempts WHERE user_id = ? ORDER BY created_at', uid);
  const xpOf = uid => db.get('SELECT COALESCE(SUM(amount),0) AS x FROM xp_events WHERE user_id = ?', uid).x;
  const passedIds = atts => [...new Set(atts.filter(a => a.score >= R.PASS).map(a => a.mission_id))];
  const bestOf = (atts, mid) => { const xs = atts.filter(a => a.mission_id === mid); return xs.length ? Math.max(...xs.map(a => a.score)) : null; };
  const starsOf = (atts, mid) => atts.filter(a => a.mission_id === mid).reduce((m, a) => Math.max(m, a.stars), 0);
  function unlocked(m, atts, xp) {
    if (!m.unlock) return true;
    if (m.unlock.level) return E.levelOf(G.LEVELS, xp).n >= m.unlock.level;
    if (m.unlock.passes) return passedIds(atts).length >= m.unlock.passes;
    return true;
  }
  function challengeFor(now = Date.now()) {
    const pool = K.missions.filter(m => m.tier < 3); const w = E.weekIndex(now); const m = pool[w % pool.length];
    return { week: w, missionId: m.id, target: 75, text: `Score 75+ on ${m.title}` };
  }
  function sparkFor(day) { let h = 0; for (const ch of day) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return G.SPARKS[h % G.SPARKS.length]; }
  function practiceDays(uid) {
    return [...db.all('SELECT DISTINCT day FROM attempts WHERE user_id = ?', uid).map(r => r.day), ...db.all('SELECT day FROM sparks WHERE user_id = ?', uid).map(r => r.day)];
  }
  function profile(u) {
    const atts = attemptsOf(u.id), xp = xpOf(u.id), today = E.dayKey(Date.now(), u.tz);
    const L = E.levelOf(G.LEVELS, xp), N = E.nextLevel(G.LEVELS, xp), ch = challengeFor();
    const sp = sparkFor(today), spDone = db.get('SELECT * FROM sparks WHERE user_id = ? AND day = ?', u.id, today);
    const chestsOpened = new Set(db.all('SELECT chest_id FROM chests WHERE user_id = ?', u.id).map(r => r.chest_id));
    const passed = passedIds(atts);
    return {
      user: { name: u.name, email: u.email, alias: u.alias, team: u.team, visibility: u.visibility, mode: u.mode, tz: u.tz, onboarded: !!u.onboarded, role: u.role },
      xp, level: L, next: N, xpToday: db.get('SELECT COALESCE(SUM(amount),0) AS x FROM xp_events WHERE user_id = ? AND day = ?', u.id, today).x,
      streak: E.streakInfo(practiceDays(u.id), u.tz),
      badges: db.all('SELECT badge_id FROM badges WHERE user_id = ?', u.id).map(r => r.badge_id),
      missions: Object.fromEntries(K.missions.map(m => [m.id, { best: bestOf(atts, m.id), stars: starsOf(atts, m.id), passed: passed.includes(m.id), unlocked: unlocked(m, atts, xp), attempts: atts.filter(a => a.mission_id === m.id).length }])),
      chests: Object.fromEntries(K.path.filter(n => n.type === 'chest').map(n => [n.id, { opened: chestsOpened.has(n.id), ready: n.needs.every(x => passed.includes(x)) }])),
      skills: E.skillRatings(atts, G.SKILLS),
      rating: E.rating(atts, G.TIERS, K.byId),
      challenge: { ...ch, done: !!db.get('SELECT 1 AS x FROM challenges WHERE user_id = ? AND week = ?', u.id, ch.week) },
      spark: { who: sp.who, line: sp.line, skill: sp.skill, done: !!spDone, result: spDone ? { score: spDone.score, xp: spDone.xp, feedback: spDone.feedback, better: spDone.better } : null },
      history: atts.slice(-30).reverse().map(a => ({ id: a.id, missionId: a.mission_id, score: a.score, stars: a.stars, facts: a.facts, mode: a.mode, xp: a.xp, at: a.created_at }))
    };
  }
  function config() {
    return { skills: G.SKILLS, skillColor: G.SKILL_COLOR, tiers: G.TIERS, badges: G.BADGES, levels: G.LEVELS, squads: G.SQUADS, rules: R, path: K.path, missions: K.missions.map(publicMission), claude: C.enabled(), sso: A.oidcEnabled() };
  }

  // ---------- runs ----------
  const loadRun = (id, uid) => { const r = db.get('SELECT * FROM runs WHERE id = ? AND user_id = ?', id, uid); if (r) r.state = JSON.parse(r.state); return r; };
  const saveRun = r => db.run('UPDATE runs SET state = ?, status = ? WHERE id = ?', JSON.stringify(r.state), r.status, r.id);
  function runView(r) {
    const m = K.byId[r.mission_id], st = r.state;
    const canDecide = st.learnerTurns >= R.MIN_TURNS || st.walkout || st.learnerTurns >= R.MAX_TURNS;
    return {
      id: r.id, missionId: m.id, mode: r.mode, status: r.status, turns: st.turns, meters: st.meters, delta: st.delta || null,
      learnerTurns: st.learnerTurns, maxTurns: R.MAX_TURNS, minTurns: R.MIN_TURNS, walkout: st.walkout, evidenceUsed: st.evidenceUsed,
      facts: m.facts.map(f => st.revealed.includes(f.id) ? { id: f.id, found: true, short: f.short, text: f.text } : { id: f.id, found: false, hint: r.mode === 'guided' ? f.hint : null }),
      options: canDecide ? m.options.map(o => ({ id: o.id, label: o.label })) : null, claude: C.enabled()
    };
  }
  function budgetOk(uid) {
    const row = db.get('SELECT tokens FROM usage WHERE user_id = ? AND day = ?', uid, E.dayKey(Date.now(), 'UTC'));
    return !row || row.tokens < cfg.tokenBudget;
  }
  function addUsage(uid, tokens) {
    const day = E.dayKey(Date.now(), 'UTC');
    db.run('INSERT INTO usage (user_id, day, tokens, calls) VALUES (?, ?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET tokens = tokens + excluded.tokens, calls = calls + 1', uid, day, tokens);
  }
  async function claudeOr(uid, fn, fallback) {
    if (!C.enabled()) return { value: fallback(), scripted: true, reason: 'disabled' };
    if (!budgetOk(uid)) return { value: fallback(), scripted: true, reason: 'budget' };
    try { const out = await fn(); addUsage(uid, out.tokens || 0); return { value: out, scripted: false }; }
    catch (e) { log('claude fallback', e.reason || e.message); return { value: fallback(), scripted: true, reason: e.reason || 'error' }; }
  }

  function award(uid, amount, reason, tz) { if (amount > 0) db.run('INSERT INTO xp_events (user_id, amount, reason, day, at) VALUES (?, ?, ?, ?, ?)', uid, amount, reason, E.dayKey(Date.now(), tz), Date.now()); }

  async function sendXapi(u, m, attempt) {
    if (!cfg.lrs) return;
    const stmt = { actor: { objectType: 'Agent', name: u.name, mbox: 'mailto:' + u.email }, verb: { id: attempt.score >= R.PASS ? 'http://adlnet.gov/expapi/verbs/passed' : 'http://adlnet.gov/expapi/verbs/failed', display: { 'en-US': attempt.score >= R.PASS ? 'passed' : 'failed' } }, object: { id: (cfg.publicUrl || 'https://launchpad.local') + '/missions/' + m.id, definition: { name: { 'en-US': m.title } } }, result: { score: { scaled: attempt.score / 100, raw: attempt.score, min: 0, max: 100 }, success: attempt.score >= R.PASS, completion: true }, timestamp: new Date().toISOString() };
    try { await fetch(cfg.lrs.replace(/\/$/, '') + '/statements', { method: 'POST', headers: { 'content-type': 'application/json', 'x-experience-api-version': '1.0.3', ...(cfg.lrsAuth ? { authorization: cfg.lrsAuth } : {}) }, body: JSON.stringify(stmt) }); }
    catch (e) { log('xAPI send failed', e.message); }
  }

  // ---------- league ----------
  function league(u, q) {
    const tab = ['overall', 'improved', 'mission', 'skill', 'squads'].includes(q.tab) ? q.tab : 'overall';
    const period = ['week', 'month', 'all'].includes(q.period) ? q.period : 'week';
    const since = period === 'all' ? 0 : Date.now() - (period === 'week' ? 7 : 30) * E.DAY;
    const members = u.cohort_id ? db.all("SELECT * FROM users WHERE cohort_id = ? AND role = 'learner'", u.cohort_id) : [u];
    const atts = db.all(`SELECT a.* FROM attempts a JOIN users x ON x.id = a.user_id WHERE ${u.cohort_id ? 'x.cohort_id = ?' : 'x.id = ?'} AND a.created_at >= ?`, u.cohort_id || u.id, since);
    const by = {}; for (const a of atts) (by[a.user_id] ??= []).push(a);
    const visible = members.filter(x => x.id === u.id || x.visibility !== 'private');
    const label = x => x.visibility === 'name' ? x.name : x.alias;
    let rows = [];
    if (tab === 'squads') {
      const sq = {};
      for (const x of members) { if (x.visibility === 'private') continue; const a = by[x.id]; if (!a?.length) continue; (sq[x.team] ??= []).push(E.rating(a, G.TIERS, K.byId).value); }
      rows = Object.entries(sq).map(([t, vs]) => ({ name: G.SQUADS[t] || t, team: t, value: Math.round(vs.reduce((a, b) => a + b, 0) / vs.length * 10) / 10, detail: vs.length + ' active', you: t === u.team }));
    } else {
      for (const x of visible) {
        const a = by[x.id] || []; if (!a.length) continue; let value, detail, tie = 0;
        if (tab === 'overall') { const r = E.rating(a, G.TIERS, K.byId); value = r.value; detail = r.n + ' missions'; }
        else if (tab === 'improved') { value = E.improvement(a); detail = 'points gained'; if (value == null) continue; }
        else if (tab === 'mission') { const xs = a.filter(y => y.mission_id === q.mission); if (!xs.length) continue; value = Math.max(...xs.map(y => y.score)); detail = xs.length + ' attempt' + (xs.length > 1 ? 's' : ''); tie = xs.length; }
        else { const r = E.skillRatings(a, G.SKILLS)[q.skill]; if (r == null) continue; value = Math.round(r * 100) / 100; detail = E.profLevel(r); }
        rows.push({ name: label(x), team: x.team, value, detail, you: x.id === u.id, sample: !!x.demo, tie });
      }
    }
    rows.sort((a, b) => (b.value - a.value) || ((a.tie || 0) - (b.tie || 0)));
    rows.forEach((r, i) => { r.rank = i + 1; delete r.tie; });
    return { tab, period, rows };
  }

  // ---------- admin ----------
  function qwk(pairs, k = 5) {
    if (pairs.length < 2) return null;
    const O = Array.from({ length: k }, () => Array(k).fill(0)); const ha = Array(k).fill(0), hb = Array(k).fill(0);
    for (const [a, b] of pairs) { O[a][b]++; ha[a]++; hb[b]++; }
    const n = pairs.length; let num = 0, den = 0;
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) { const w = ((i - j) ** 2) / ((k - 1) ** 2); num += w * O[i][j]; den += w * ha[i] * hb[j] / n; }
    return den === 0 ? 1 : Math.round((1 - num / den) * 100) / 100;
  }
  function calibration() {
    const rows = db.all("SELECT a.id, a.criteria, r.scores FROM reviews r JOIN attempts a ON a.id = r.attempt_id WHERE a.scored_by = 'claude'");
    const pairs = []; let exact = 0, within = 0;
    for (const r of rows) { const ai = JSON.parse(r.criteria), hu = JSON.parse(r.scores); for (const c of ai) { const h = hu[c.id]; if (!Number.isInteger(h)) continue; pairs.push([c.score, h]); if (c.score === h) exact++; if (Math.abs(c.score - h) <= 1) within++; } }
    return { attemptsReviewed: rows.length, criteriaCompared: pairs.length, exact: pairs.length ? Math.round(exact / pairs.length * 100) : null, withinOne: pairs.length ? Math.round(within / pairs.length * 100) : null, weightedKappa: qwk(pairs), target: 0.75 };
  }
  function cohortLearners(cid) {
    return db.all("SELECT * FROM users WHERE cohort_id = ? AND role = 'learner' ORDER BY name", cid).map(x => {
      const atts = attemptsOf(x.id), xp = xpOf(x.id), sk = E.skillRatings(atts, G.SKILLS);
      return { id: x.id, name: x.name, email: x.email, team: x.team, demo: !!x.demo, xp, level: E.levelOf(G.LEVELS, xp).name, passed: passedIds(atts).length, attempts: atts.length, rating: E.rating(atts, G.TIERS, K.byId).value, skills: Object.fromEntries(Object.entries(sk).map(([k, v]) => [k, v == null ? null : Math.round(v * 100) / 100])), lastActive: atts.length ? atts[atts.length - 1].created_at : null };
    });
  }
  const csvCell = v => { const s = v == null ? '' : String(v); const safe = /^[=+\-@\t\r]/.test(s) ? "'" + s : s; return /[",\n]/.test(safe) ? '"' + safe.replace(/"/g, '""') + '"' : safe; };

  // ---------- retention ----------
  function housekeeping() {
    const cutoff = Date.now() - cfg.retentionDays * E.DAY;
    db.run('UPDATE attempts SET transcript = NULL WHERE created_at < ? AND transcript IS NOT NULL', cutoff);
    db.run("DELETE FROM runs WHERE started_at < ?", Date.now() - 7 * E.DAY);
    db.run('DELETE FROM sessions WHERE expires_at < ?', Date.now());
  }
  housekeeping();
  const hk = setInterval(housekeeping, 6 * 3600000); hk.unref();

  // ---------- routes ----------
  async function api(req, res, url, user, token) {
    const p = url.pathname, m = req.method;
    const needUser = () => { if (!user) throw Object.assign(new Error('Please sign in.'), { status: 401 }); return user; };
    const needStaff = () => { needUser(); if (!['admin', 'facilitator'].includes(user.role)) throw Object.assign(new Error('Facilitator access only.'), { status: 403 }); return user; };
    const ip = req.socket.remoteAddress || 'ip';

    if (p === '/api/config' && m === 'GET') return json(res, 200, config());
    if (p === '/api/auth/join' && m === 'POST') {
      if (limited('join:' + ip, 20, 900000)) return fail(res, 429, 'Too many attempts. Try again in 15 minutes.');
      const b = await body(req); const code = str(b.code, 40).toUpperCase(), name = str(b.name, 80), email = str(b.email, 160).toLowerCase(), pw = String(b.password || '');
      const cohort = db.get('SELECT * FROM cohorts WHERE code = ? AND active = 1', code);
      if (!cohort) return fail(res, 400, 'That cohort code was not recognised. Check it with your facilitator.');
      if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 400, 'Enter your name and a valid work email.');
      if (pw.length < 10) return fail(res, 400, 'Choose a password of at least 10 characters.');
      if (db.get('SELECT id FROM users WHERE email = ?', email)) return fail(res, 409, 'An account with this email already exists. Sign in instead.');
      const r = db.run('INSERT INTO users (cohort_id, email, name, role, pass_hash, alias, tz, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', cohort.id, email, name, 'learner', A.hashPassword(pw), makeAlias(), E.validTz(b.tz) ? b.tz : 'UTC', Date.now());
      audit(r.lastInsertRowid, 'join', { cohort: cohort.id });
      return json(res, 200, { ok: true }, { 'set-cookie': A.cookie(A.createSession(db, r.lastInsertRowid), secure) });
    }
    if (p === '/api/auth/login' && m === 'POST') {
      const b = await body(req); const email = str(b.email, 160).toLowerCase();
      if (limited('login:' + ip + ':' + email, 10, 900000)) return fail(res, 429, 'Too many sign-in attempts. Try again in 15 minutes.');
      const u = db.get('SELECT * FROM users WHERE email = ?', email);
      if (!u || !A.checkPassword(String(b.password || ''), u.pass_hash)) return fail(res, 401, 'Email or password is incorrect.');
      return json(res, 200, { ok: true, role: u.role }, { 'set-cookie': A.cookie(A.createSession(db, u.id), secure) });
    }
    if (p === '/api/auth/logout' && m === 'POST') { A.destroySession(db, token); return json(res, 200, { ok: true }, { 'set-cookie': A.cookie('', secure, 0) }); }

    // Everything below needs a signed-in user.
    const u = needUser();
    if (p === '/api/me' && m === 'GET') return json(res, 200, profile(u));
    if (p === '/api/me' && m === 'PATCH') {
      const b = await body(req); const set = [];
      if (b.team && G.SQUADS[b.team]) set.push(['team', b.team]);
      if (['alias', 'name', 'private'].includes(b.visibility)) set.push(['visibility', b.visibility]);
      if (['guided', 'expert'].includes(b.mode)) set.push(['mode', b.mode]);
      if (b.tz && E.validTz(b.tz)) set.push(['tz', b.tz]);
      if (b.onboarded === true) set.push(['onboarded', 1]);
      for (const [k, v] of set) db.run(`UPDATE users SET ${k} = ? WHERE id = ?`, v, u.id);
      return json(res, 200, profile(db.get('SELECT * FROM users WHERE id = ?', u.id)));
    }
    if (p === '/api/me/export' && m === 'GET') {
      const out = { user: { name: u.name, email: u.email, alias: u.alias, team: u.team, created: u.created_at }, attempts: attemptsOf(u.id).map(a => ({ ...a, skills: JSON.parse(a.skills), criteria: JSON.parse(a.criteria), assessment: JSON.parse(a.assessment), transcript: a.transcript ? JSON.parse(a.transcript) : null })), sparks: db.all('SELECT * FROM sparks WHERE user_id = ?', u.id), badges: db.all('SELECT * FROM badges WHERE user_id = ?', u.id), xp: db.all('SELECT * FROM xp_events WHERE user_id = ?', u.id) };
      return json(res, 200, out, { 'content-disposition': 'attachment; filename="launchpad-my-data.json"' });
    }
    if (p === '/api/me' && m === 'DELETE') {
      const b = await body(req); if (b.confirm !== 'DELETE') return fail(res, 400, 'Type DELETE to confirm.');
      audit(null, 'self_delete', { user: u.id }); db.run('DELETE FROM users WHERE id = ?', u.id);
      return json(res, 200, { ok: true }, { 'set-cookie': A.cookie('', secure, 0) });
    }
    if (p === '/api/league' && m === 'GET') return json(res, 200, league(u, Object.fromEntries(url.searchParams)));

    if (p === '/api/runs' && m === 'POST') {
      const b = await body(req); const mi = K.byId[b.missionId]; if (!mi) return fail(res, 404, 'Mission not found.');
      const atts = attemptsOf(u.id); if (!unlocked(mi, atts, xpOf(u.id))) return fail(res, 403, 'This mission is still locked.');
      const mode = ['guided', 'expert'].includes(b.mode) ? b.mode : u.mode;
      const turns = [{ role: 'persona', text: mi.opening }]; if (mode === 'guided') turns.push({ role: 'voice', skill: 'discover', text: E.VOICE_BANK.discover[0] });
      const id = crypto.randomUUID();
      const state = { turns, meters: { trust: 50, clarity: 40, risk: 50 }, revealed: [], evidenceUsed: [], flags: [], learnerTurns: 0, walkout: false, escalated: false, scriptedTurns: 0 };
      db.run("UPDATE runs SET status = 'abandoned' WHERE user_id = ? AND status = 'active'", u.id);
      db.run('INSERT INTO runs (id, user_id, mission_id, mode, state, status, started_at) VALUES (?, ?, ?, ?, ?, ?, ?)', id, u.id, mi.id, mode, JSON.stringify(state), 'active', Date.now());
      return json(res, 200, runView(loadRun(id, u.id)));
    }
    let mm;
    if ((mm = p.match(/^\/api\/runs\/([\w-]{36})\/turns$/)) && m === 'POST') {
      if (limited('turn:' + u.id, 30, 60000)) return fail(res, 429, 'You are sending messages very quickly. Wait a moment and try again.');
      const r = loadRun(mm[1], u.id); if (!r || r.status !== 'active') return fail(res, 404, 'This conversation has ended.');
      const st = r.state, mi = K.byId[r.mission_id];
      if (st.walkout || st.learnerTurns >= R.MAX_TURNS) return fail(res, 409, 'No messages left. Make your decision.');
      const b = await body(req); const text = str(b.text, 1200); if (text.length < 2) return fail(res, 400, 'Write a message first.');
      st.turns.push({ role: 'learner', text }); st.learnerTurns++;
      const moment = mi.moments.find(x => x.after === st.learnerTurns)?.text || null;
      const out = await claudeOr(u.id, () => C.persona(st, mi, G.SKILLS, moment).then(x => ({ ...x.turn, tokens: x.tokens })), () => E.scriptedPersona(st, mi, text, moment));
      const t = out.value; if (out.scripted) st.scriptedTurns++;
      if (moment) st.turns.push({ role: 'stamp', text: 'Pressure!', sub: mi.persona.name.split(' ')[0] + ' raises the stakes' });
      st.turns.push({ role: 'persona', text: t.reply });
      for (const id of t.revealed) { st.revealed.push(id); st.turns.push({ role: 'found', text: 'Evidence unlocked: ' + mi.facts.find(f => f.id === id).short }); }
      const before = { ...st.meters };
      st.meters.trust = E.clamp(st.meters.trust + t.trust * 2, 0, 100); st.meters.clarity = E.clamp(st.meters.clarity + t.clarity * 2, 0, 100); st.meters.risk = E.clamp(st.meters.risk + t.risk * 2, 0, 100);
      st.delta = { trust: st.meters.trust - before.trust, clarity: st.meters.clarity - before.clarity, risk: st.meters.risk - before.risk };
      if (E.isOverpromise(text) && !t.flags.includes('overpromise')) t.flags.push('overpromise');
      st.flags.push(...t.flags);
      if (r.mode === 'guided' && t.voice) st.turns.push({ role: 'voice', skill: t.voice.skill, text: t.voice.line });
      if (st.meters.risk <= 0 && !st.escalated) { st.escalated = true; st.turns.push({ role: 'stamp', text: 'Escalation', sub: 'Legal has flagged your commitments' }); }
      if (st.meters.trust <= 5) { st.walkout = true; st.turns.push({ role: 'stamp', text: 'Walk-out', sub: mi.persona.name.split(' ')[0] + ' has ended the meeting' }); }
      saveRun(r);
      return json(res, 200, { ...runView(r), revealedNow: t.revealed.length, scripted: out.scripted, reason: out.reason || null });
    }
    if ((mm = p.match(/^\/api\/runs\/([\w-]{36})\/evidence$/)) && m === 'POST') {
      const r = loadRun(mm[1], u.id); if (!r || r.status !== 'active') return fail(res, 404, 'This conversation has ended.');
      const b = await body(req); const f = K.byId[r.mission_id].facts.find(x => x.id === b.factId);
      if (!f || !r.state.revealed.includes(f.id)) return fail(res, 400, 'You can only present evidence you have uncovered.');
      if (!r.state.evidenceUsed.includes(f.id)) r.state.evidenceUsed.push(f.id); saveRun(r);
      return json(res, 200, { tag: `(Evidence: ${f.short}) `, view: runView(r) });
    }
    if ((mm = p.match(/^\/api\/runs\/([\w-]{36})\/decision$/)) && m === 'POST') {
      const r = loadRun(mm[1], u.id); if (!r || r.status !== 'active') return fail(res, 404, 'This conversation has ended.');
      const st = r.state, mi = K.byId[r.mission_id];
      if (!(st.learnerTurns >= R.MIN_TURNS || st.walkout)) return fail(res, 409, `Send at least ${R.MIN_TURNS} messages before deciding.`);
      const b = await body(req); const decision = mi.options.find(o => o.id === b.optionId);
      const rationale = str(b.rationale, 1500), predicted = E.clamp(Math.round(Number(b.predicted) || 0), 0, 100);
      if (!decision) return fail(res, 400, 'Choose a decision first.');
      if (rationale.length < 20) return fail(res, 400, 'Add a sentence or two on why. The assessor scores your reasoning too.');
      st.rationale = rationale;
      r.status = 'assessing'; saveRun(r);
      const out = await claudeOr(u.id, () => C.assess(st, mi, decision, rationale).then(x => ({ ...x.assessment, tokens: x.tokens })), () => E.scriptedAssess(st, mi, decision, rationale));
      const assessment = out.value; delete assessment.tokens;
      const sc = E.scoreAttempt(st, mi, decision, assessment, R);
      const atts = attemptsOf(u.id), xpBefore = xpOf(u.id), prevBest = bestOf(atts, mi.id), prevStars = starsOf(atts, mi.id);
      const oldLevel = E.levelOf(G.LEVELS, xpBefore).n, oldUnlocked = K.missions.filter(x => unlocked(x, atts, xpBefore)).map(x => x.id);
      const mult = G.TIERS[mi.tier].mult, xp = [];
      if (prevBest == null) xp.push(['Mission score x' + mult, Math.round(sc.score * mult)]);
      else { xp.push(['Replay completed', 10]); if (sc.score > prevBest) xp.push(['Beat your best by ' + (sc.score - prevBest), Math.round((sc.score - prevBest) * 2 * mult)]); }
      if (sc.stars > prevStars) xp.push([`New star${sc.stars - prevStars > 1 ? 's' : ''} (${sc.stars} of 3)`, (sc.stars - prevStars) * 25]);
      const has = new Set(db.all('SELECT badge_id FROM badges WHERE user_id = ?', u.id).map(x => x.badge_id)); const earned = [];
      const give = id => { if (!has.has(id) && !earned.includes(id)) earned.push(id); };
      const over = st.flags.includes('overpromise'), scoredBy = out.scripted ? 'scripted' : 'claude';
      const after = [...atts, { mission_id: mi.id, score: sc.score }];
      give('first');
      if (st.revealed.length === mi.facts.length) give('questions');
      if (sc.score >= R.PASS && !over) give('straight');
      if (sc.score >= R.PASS && ['dataask', 'agentic', 'biascomplaint'].includes(mi.id) && decision.pts >= 25) give('redline');
      if (prevBest != null && sc.score - Math.min(...atts.filter(x => x.mission_id === mi.id).map(x => x.score)) >= 15) give('comeback');
      if (Math.abs(predicted - sc.score) <= 10) give('calibrated');
      if (sc.score >= R.PASS && r.mode === 'expert') give('unassisted');
      const core = K.missions.filter(x => x.tier === 1).map(x => x.id);
      if (core.every(id => passedIds(after).includes(id))) give('core');
      if (mi.tier === 3 && sc.score >= R.PASS) give('boardroom');
      if (st.evidenceUsed.length >= 2) give('evidence');
      if (sc.stars === 3) give('threestar');
      const ch = challengeFor(); let chDone = false;
      if (ch.missionId === mi.id && sc.score >= ch.target && !db.get('SELECT 1 AS x FROM challenges WHERE user_id = ? AND week = ?', u.id, ch.week)) chDone = true;
      const day = E.dayKey(Date.now(), u.tz);
      const days = new Set([...practiceDays(u.id), day]);
      if (E.streakInfo([...days], u.tz).n >= 3) give('streak3');
      for (const bd of earned) xp.push(['Badge: ' + G.BADGES.find(x => x.id === bd).name, R.BADGE_XP]);
      if (chDone) xp.push(['Weekly challenge', R.CHALLENGE_XP]);
      const gained = xp.reduce((a, [, v]) => a + v, 0);
      const sample = scoredBy === 'claude' && Math.random() < cfg.reviewRate ? 1 : 0;
      const attemptId = db.tx(() => {
        const ins = db.run(`INSERT INTO attempts (user_id, mission_id, run_id, score, stars, facts, evidence, mode, predicted, decision, over, walkout, skills, criteria, assessment, transcript, xp, scored_by, review_sample, day, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, u.id, mi.id, r.id, sc.score, sc.stars, st.revealed.length, st.evidenceUsed.length, r.mode, predicted, decision.id, over ? 1 : 0, st.walkout ? 1 : 0,
          JSON.stringify(sc.skills), JSON.stringify(sc.crit), JSON.stringify({ strengths: assessment.strengths, gaps: assessment.gaps, rewrite: assessment.rewrite, next: assessment.next, stuffed: sc.stuffed }), JSON.stringify({ turns: st.turns, rationale }), gained, scoredBy, sample, day, Date.now());
        for (const [why, amt] of xp) award(u.id, amt, why, u.tz);
        for (const bd of earned) db.run('INSERT OR IGNORE INTO badges (user_id, badge_id, at) VALUES (?, ?, ?)', u.id, bd, Date.now());
        if (chDone) db.run('INSERT OR IGNORE INTO challenges (user_id, week) VALUES (?, ?)', u.id, ch.week);
        r.status = 'done'; saveRun(r);
        return ins.lastInsertRowid;
      });
      const atts2 = attemptsOf(u.id), xpAfter = xpOf(u.id);
      sendXapi(u, mi, { score: sc.score });
      const oldSkills = E.skillRatings(atts, G.SKILLS), newSkills = E.skillRatings(atts2, G.SKILLS);
      return json(res, 200, {
        attemptId, missionId: mi.id, score: sc.score, stars: sc.stars, prevBest, predicted, facts: st.revealed.length, walkout: st.walkout,
        parts: { rubric: Math.round(sc.crit.reduce((a, c) => a + c.score, 0) / 16 * 60), decision: decision.pts, facts: Math.round(st.revealed.length / 3 * 15) },
        decision: { label: decision.label, outcome: decision.outcome },
        criteria: sc.crit, strengths: assessment.strengths, gaps: assessment.gaps, rewrite: assessment.rewrite, next: assessment.next,
        xp, gained, earned, levelUp: E.levelOf(G.LEVELS, xpAfter).n > oldLevel, level: E.levelOf(G.LEVELS, xpAfter),
        unlocks: K.missions.filter(x => unlocked(x, atts2, xpAfter) && !oldUnlocked.includes(x.id)).map(x => x.title),
        skills: Object.keys(G.SKILLS).filter(k => mi.rubric.some(c => c.skill === k)).map(k => ({ skill: k, before: oldSkills[k], after: newSkills[k], level: E.profLevel(newSkills[k]) })),
        scoredBy, note: out.scripted ? (out.reason === 'budget' ? "You have reached today's AI usage limit, so the backup rubric scored this attempt." : C.enabled() ? 'Claude could not assess this attempt, so the backup rubric scored it.' : 'Scored by the backup rubric because Claude is not configured on this server.') : null
      });
    }
    if (p === '/api/spark' && m === 'POST') {
      const day = E.dayKey(Date.now(), u.tz); if (db.get('SELECT 1 AS x FROM sparks WHERE user_id = ? AND day = ?', u.id, day)) return fail(res, 409, "You have done today's spark. A new one arrives tomorrow.");
      const b = await body(req); const text = str(b.text, 800); if (text.length < 15) return fail(res, 400, 'Write a full reply, at least a sentence.');
      const sp = sparkFor(day);
      const out = await claudeOr(u.id, () => C.spark(sp, text).then(x => ({ ...x.result, tokens: x.tokens })), () => {
        const t = text.toLowerCase(); const c = E.isStuffed([text]) ? 0 : ['pilot', 'metric', 'eval', 'test', 'consent', 'human', 'risk', 'evidence', 'data', 'review', 'share'].filter(k => t.includes(k)).length;
        return { score: E.clamp(3 + c + (t.includes('?') ? 1 : 0) - (E.isOverpromise(text) ? 4 : 0), 0, 10), feedback: E.isOverpromise(text) ? "This commits to something you can't yet back up." : 'Backup check: specifics noted. Claude gives richer feedback when it is configured.', better: '' };
      });
      const r = out.value; const xp = r.score * 3;
      db.tx(() => { db.run('INSERT INTO sparks (user_id, day, score, xp, text, feedback, better, skill, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', u.id, day, r.score, xp, text, r.feedback, r.better, sp.skill, Date.now()); award(u.id, xp, 'Daily spark', u.tz); });
      return json(res, 200, { score: r.score, xp, feedback: r.feedback, better: r.better, scripted: out.scripted });
    }
    if ((mm = p.match(/^\/api\/chests\/(chest\d+)$/)) && m === 'POST') {
      const node = K.path.find(n => n.id === mm[1]); if (!node) return fail(res, 404, 'Chest not found.');
      if (db.get('SELECT 1 AS x FROM chests WHERE user_id = ? AND chest_id = ?', u.id, node.id)) return fail(res, 409, 'Already opened.');
      if (!node.needs.every(x => passedIds(attemptsOf(u.id)).includes(x))) return fail(res, 403, 'Pass the missions before this chest to open it.');
      const amount = 25 + crypto.randomInt(36), note = G.FIELD_NOTES[crypto.randomInt(G.FIELD_NOTES.length)];
      db.tx(() => { db.run('INSERT INTO chests (user_id, chest_id, xp, note, at) VALUES (?, ?, ?, ?, ?)', u.id, node.id, amount, note, Date.now()); award(u.id, amount, 'Chest', u.tz); });
      return json(res, 200, { amount, note });
    }

    // ---------- facilitator ----------
    if (p.startsWith('/api/admin/')) {
      const s = needStaff();
      if (p === '/api/admin/cohorts' && m === 'GET') return json(res, 200, db.all("SELECT c.*, (SELECT COUNT(*) FROM users u WHERE u.cohort_id = c.id AND u.role = 'learner') AS learners FROM cohorts c ORDER BY c.created_at DESC"));
      if (p === '/api/admin/cohorts' && m === 'POST') {
        const b = await body(req); const name = str(b.name, 80); if (!name) return fail(res, 400, 'Name the cohort.');
        const code = 'LP-' + crypto.randomBytes(4).toString('hex').toUpperCase();
        const r = db.run('INSERT INTO cohorts (name, code, active, created_at) VALUES (?, ?, 1, ?)', name, code, Date.now()); audit(s.id, 'cohort_create', { id: r.lastInsertRowid });
        return json(res, 200, { id: r.lastInsertRowid, name, code });
      }
      if ((mm = p.match(/^\/api\/admin\/cohorts\/(\d+)$/)) && m === 'PATCH') { const b = await body(req); db.run('UPDATE cohorts SET active = ? WHERE id = ?', b.active ? 1 : 0, Number(mm[1])); audit(s.id, 'cohort_active', { id: mm[1], active: !!b.active }); return json(res, 200, { ok: true }); }
      if ((mm = p.match(/^\/api\/admin\/cohorts\/(\d+)\/learners$/)) && m === 'GET') return json(res, 200, cohortLearners(Number(mm[1])));
      if ((mm = p.match(/^\/api\/admin\/cohorts\/(\d+)\/export\.csv$/)) && m === 'GET') {
        const ls = cohortLearners(Number(mm[1])); const sk = Object.keys(G.SKILLS);
        const lines = [['name', 'email', 'squad', 'xp', 'level', 'missions_passed', 'attempts', 'readiness_rating', ...sk.map(k => 'skill_' + k), 'last_active'].join(',')];
        for (const l of ls) lines.push([l.name, l.email, G.SQUADS[l.team], l.xp, l.level, l.passed, l.attempts, l.rating, ...sk.map(k => l.skills[k]), l.lastActive ? new Date(l.lastActive).toISOString() : ''].map(csvCell).join(','));
        audit(s.id, 'export_csv', { cohort: mm[1] });
        res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="cohort-${mm[1]}.csv"`, 'cache-control': 'no-store' }); return res.end(lines.join('\n'));
      }
      if (p === '/api/admin/review-queue' && m === 'GET') {
        const rows = db.all(`SELECT a.id, a.mission_id, a.score, a.created_at, u.name FROM attempts a JOIN users u ON u.id = a.user_id WHERE a.review_sample = 1 AND a.transcript IS NOT NULL AND NOT EXISTS (SELECT 1 FROM reviews r WHERE r.attempt_id = a.id AND r.reviewer_id = ?) ORDER BY a.created_at DESC LIMIT 50`, s.id);
        return json(res, 200, rows.map(r => ({ ...r, title: K.byId[r.mission_id]?.title })));
      }
      if ((mm = p.match(/^\/api\/admin\/attempts\/(\d+)$/)) && m === 'GET') {
        const a = db.get('SELECT * FROM attempts WHERE id = ?', Number(mm[1])); if (!a) return fail(res, 404, 'Not found.');
        const mi = K.byId[a.mission_id];
        return json(res, 200, { id: a.id, mission: { id: mi.id, title: mi.title, rubric: mi.rubric, options: mi.options.map(o => ({ id: o.id, label: o.label, pts: o.pts })) }, score: a.score, decision: a.decision, criteria: JSON.parse(a.criteria), transcript: a.transcript ? JSON.parse(a.transcript) : null, scoredBy: a.scored_by });
      }
      if ((mm = p.match(/^\/api\/admin\/attempts\/(\d+)\/review$/)) && m === 'POST') {
        const a = db.get('SELECT * FROM attempts WHERE id = ?', Number(mm[1])); if (!a) return fail(res, 404, 'Not found.');
        const b = await body(req); const mi = K.byId[a.mission_id]; const scores = {};
        for (const c of mi.rubric) { const v = Number(b.scores?.[c.id]); if (!Number.isInteger(v) || v < 0 || v > 4) return fail(res, 400, 'Score every criterion from 0 to 4.'); scores[c.id] = v; }
        db.run('INSERT OR REPLACE INTO reviews (attempt_id, reviewer_id, scores, note, at) VALUES (?, ?, ?, ?, ?)', a.id, s.id, JSON.stringify(scores), str(b.note, 500), Date.now());
        audit(s.id, 'review', { attempt: a.id });
        return json(res, 200, { ok: true, calibration: calibration() });
      }
      if (p === '/api/admin/calibration' && m === 'GET') return json(res, 200, calibration());
      if (p === '/api/admin/users' && m === 'POST') {
        if (s.role !== 'admin') return fail(res, 403, 'Only administrators can add facilitators.');
        const b = await body(req); const email = str(b.email, 160).toLowerCase(), name = str(b.name, 80), pw = String(b.password || '');
        if (!name || !email.includes('@') || pw.length < 12) return fail(res, 400, 'Give a name, email and a password of at least 12 characters.');
        if (db.get('SELECT id FROM users WHERE email = ?', email)) return fail(res, 409, 'That email already has an account.');
        const r = db.run('INSERT INTO users (email, name, role, pass_hash, alias, onboarded, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)', email, name, 'facilitator', A.hashPassword(pw), 'Facilitator', Date.now());
        audit(s.id, 'facilitator_create', { id: r.lastInsertRowid }); return json(res, 200, { id: r.lastInsertRowid });
      }
      if (p === '/api/admin/purge-demo' && m === 'POST') {
        if (s.role !== 'admin') return fail(res, 403, 'Only administrators can remove sample data.');
        const n = db.run('DELETE FROM users WHERE demo = 1').changes; audit(s.id, 'purge_demo', { removed: n }); return json(res, 200, { removed: n });
      }
      if (p === '/api/admin/usage' && m === 'GET') return json(res, 200, db.all('SELECT day, SUM(tokens) AS tokens, SUM(calls) AS calls, COUNT(DISTINCT user_id) AS users FROM usage GROUP BY day ORDER BY day DESC LIMIT 30'));
    }
    return fail(res, 404, 'Not found.');
  }

  function securityHeaders(res) {
    res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('x-content-type-options', 'nosniff'); res.setHeader('referrer-policy', 'same-origin');
    res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()'); res.setHeader('x-frame-options', 'DENY');
    if (secure) res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
  }
  function serveStatic(res, file) {
    const f = path.normalize(path.join(PUBLIC, file)); if (!f.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
    fs.readFile(f, (err, data) => {
      if (err) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('Not found'); }
      res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': path.extname(f) === '.html' ? 'no-cache' : 'public, max-age=300' }); res.end(data);
    });
  }

  const server = http.createServer(async (req, res) => {
    securityHeaders(res);
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname === '/healthz') { db.get('SELECT 1 AS ok'); return json(res, 200, { ok: true, claude: C.enabled() }); }
      if (url.pathname === '/api/auth/oidc/start' && req.method === 'GET') {
        if (!A.oidcEnabled()) return fail(res, 404, 'Single sign-on is not configured.');
        const code = str(url.searchParams.get('cohort'), 40).toUpperCase();
        if (code && !db.get('SELECT 1 AS x FROM cohorts WHERE code = ? AND active = 1', code)) return fail(res, 400, 'That cohort code was not recognised.');
        res.writeHead(302, { location: await A.oidcStart(code) }); return res.end();
      }
      if (url.pathname === '/api/auth/oidc/callback' && req.method === 'GET') {
        try {
          const who = await A.oidcCallback(Object.fromEntries(url.searchParams));
          let uRow = db.get('SELECT * FROM users WHERE email = ?', who.email);
          if (!uRow) {
            const cohort = who.cohort ? db.get('SELECT * FROM cohorts WHERE code = ? AND active = 1', who.cohort) : null;
            if (!cohort) { res.writeHead(302, { location: '/?error=' + encodeURIComponent('First sign-in needs your cohort code. Enter it, then choose single sign-on.') }); return res.end(); }
            const r = db.run('INSERT INTO users (cohort_id, email, name, role, alias, created_at) VALUES (?, ?, ?, ?, ?, ?)', cohort.id, who.email, who.name, 'learner', makeAlias(), Date.now());
            uRow = db.get('SELECT * FROM users WHERE id = ?', r.lastInsertRowid); audit(uRow.id, 'join_sso', { cohort: cohort.id });
          }
          res.writeHead(302, { location: uRow.role === 'learner' ? '/' : '/admin', 'set-cookie': A.cookie(A.createSession(db, uRow.id), secure) }); return res.end();
        } catch (e) { log('oidc error', e.message); res.writeHead(302, { location: '/?error=' + encodeURIComponent('Single sign-on failed: ' + e.message) }); return res.end(); }
      }
      if (url.pathname.startsWith('/api/')) {
        // CSRF defence: state-changing calls must carry a custom header, which other sites cannot send without CORS.
        if (req.method !== 'GET' && req.headers['x-launchpad'] !== '1') return fail(res, 403, 'Missing request header.');
        const token = cookies(req).lp_session; const user = A.sessionUser(db, token);
        return await api(req, res, url, user, token);
      }
      if (url.pathname === '/' || url.pathname === '/index.html') return serveStatic(res, 'index.html');
      if (url.pathname === '/admin' || url.pathname === '/admin/') return serveStatic(res, 'admin.html');
      return serveStatic(res, url.pathname.slice(1));
    } catch (e) {
      const status = e.status || 500; if (status >= 500) log('error', e.stack || e.message);
      if (!res.headersSent) fail(res, status, status >= 500 ? 'Something went wrong on our side. Please try again.' : e.message);
    }
  });
  return { server, db, K, close: () => { clearInterval(hk); server.close(); db.close(); } };
}
module.exports = { createApp };
