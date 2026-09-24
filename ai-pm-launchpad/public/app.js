'use strict';
/* AI PM Launchpad client. All scoring, XP and ranking happen on the server; this file only renders. */
(function () {
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let CFG = null, ME = null;
const S = { view: 'loading', sid: null, run: null, result: null, draft: '', rationale: '', decision: null, predicted: 65, busy: false, assessing: false, board: { tab: 'overall', period: 'week', mission: 'promise', skill: 'discover', data: null }, spark: { draft: '', busy: false, result: null }, chestNote: null, confirmDelete: false, authTab: 'join', authError: '', lastView: null };

/* ---------- API ---------- */
async function api(path, opts = {}) {
  const res = await fetch(path, { method: opts.method || 'GET', headers: { 'content-type': 'application/json', 'x-launchpad': '1' }, body: opts.body ? JSON.stringify(opts.body) : undefined, credentials: 'same-origin' });
  let data = null; try { data = await res.json(); } catch {}
  if (!res.ok) { const e = new Error((data && data.error) || 'Something went wrong. Please try again.'); e.status = res.status; throw e; }
  return data;
}
async function refreshMe() { ME = await api('/api/me'); }
const mission = id => CFG.missions.find(m => m.id === id);
const skillName = k => CFG.skills[k]?.name || k;

/* ---------- small UI helpers ---------- */
let toastTimer;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 4200); }
function announce(msg) { $('announce').textContent = ''; setTimeout(() => { $('announce').textContent = msg; }, 30); }
function burst(count = 90) {
  if (reduceMotion) return;
  const c = $('fx'), ctx = c.getContext('2d'); c.width = innerWidth; c.height = innerHeight;
  const cols = ['#FBD300', '#FF7103', '#0337D8', '#C2D02F', '#C12400', '#FFFFFF'];
  const ps = Array.from({ length: count }, () => ({ x: innerWidth / 2 + (Math.random() - .5) * 200, y: innerHeight * .35, vx: (Math.random() - .5) * 12, vy: -Math.random() * 12 - 4, r: 3 + Math.random() * 4, c: cols[Math.floor(Math.random() * cols.length)], a: Math.random() * 6 }));
  let f = 0;
  (function tick() { ctx.clearRect(0, 0, c.width, c.height); f++; for (const p of ps) { p.vy += .35; p.x += p.vx; p.y += p.vy; p.a += .2; ctx.fillStyle = p.c; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); ctx.restore(); } if (f < 110) requestAnimationFrame(tick); else ctx.clearRect(0, 0, c.width, c.height); })();
}
function countUp(el, to) { if (!el) return; if (reduceMotion) { el.textContent = to; return; } const t0 = performance.now(); (function step(t) { const k = Math.min(1, (t - t0) / 900); el.textContent = Math.round(to * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(step); })(t0); }
const starSvg = on => `<svg viewBox="0 0 24 24" aria-hidden="true"><path class="${on ? 'star-on' : 'star-off'}" d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"/></svg>`;
const starsHtml = (n, lg) => `<span class="stars ${lg ? 'lg' : ''}" role="img" aria-label="${n} of 3 stars">${[1, 2, 3].map(i => starSvg(i <= n)).join('')}</span>`;
const flame = () => `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#FF7103" d="M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-2.4 1.2-4 2.6-5.3.2 1.8 1 2.9 2.2 3.3C11 8.5 11.2 5 12 2z"/><path fill="#FBD300" d="M12 12.5c.6 1.7 2.2 2.4 2.2 4.4a2.2 2.2 0 0 1-4.4 0c0-1.3.9-2.4 2.2-4.4z"/></svg>`;
const shieldIcon = () => `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#5B86FF" d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z"/></svg>`;
const lockIcon = () => `<svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 10V7a5 5 0 0 1 10 0v3h1a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1zm2 0h6V7a3 3 0 0 0-6 0z"/></svg>`;
const chestIcon = open => `<svg width="30" height="30" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="${open ? 'M3 11h18v9H3zM4 6l16-2 .6 4L4.6 10z' : 'M3 10h18v10H3zM5 4h14a2 2 0 0 1 2 2v3H3V6a2 2 0 0 1 2-2z'}"/><rect x="10.5" y="11.5" width="3" height="4" rx="1" fill="#111827"/></svg>`;
const mood = t => t < 25 ? { name: 'Frustrated', c: '#FF5A3C' } : t < 45 ? { name: 'Wary', c: '#FFB020' } : t < 70 ? { name: 'Open', c: '#5B86FF' } : { name: 'Won over', c: '#3FCB7E' };
const profLevel = r => r == null ? 'Not yet assessed' : r < 1.5 ? 'L1 Foundation' : r < 2.5 ? 'L2 Practitioner' : r < 3.3 ? 'L3 Advanced' : 'L4 Expert';
const unlockText = m => m.unlock?.level ? `Reach level ${m.unlock.level}` : `Pass ${m.unlock.passes} missions`;
function modeNotice() {
  return CFG.claude ? '' : `<div class="notice"><span class="chip warn">Backup mode</span><span><b>Claude is not configured on this server.</b> Stakeholders use scripted replies and a backup rubric.</span></div>`;
}

/* ---------- render ---------- */
function renderMe() {
  const nav = $('nav'); nav.hidden = !(ME && ME.user.onboarded);
  if (!ME || !ME.user.onboarded) { $('me').innerHTML = ME ? `<button class="linkish" data-action="logout">Sign out</button>` : ''; return; }
  const L = ME.level, N = ME.next, pct = N ? (ME.xp - L.xp) / (N.xp - L.xp) * 100 : 100, st = ME.streak, goal = CFG.rules.DAILY_GOAL;
  $('me').innerHTML = `
    <span class="stat" title="${st.n}-day streak">${flame()}<span>${st.n}</span>${st.shields ? `<span class="hide-sm" style="display:inline-flex;align-items:center;gap:2px">${shieldIcon()}${st.shields}</span>` : ''}</span>
    <span class="stat" title="Today's goal: ${goal} XP"><span class="ring" style="--p:${Math.min(100, ME.xpToday / goal * 100)};width:22px;height:22px"><div style="width:14px;height:14px"></div></span><span>${Math.min(ME.xpToday, goal)}/${goal}</span></span>
    <span class="stat" title="${N ? (N.xp - ME.xp) + ' XP to ' + N.name : 'Top level'}"><span class="lvl-shield">${L.n}</span><span class="hide-sm">${ME.xp} XP</span><span class="xpbar"><i style="width:${pct}%"></i></span></span>`;
  for (const v of ['home', 'board', 'progress']) { const b = $('nav-' + v); if (S.view === v || (v === 'home' && ['brief', 'sim', 'result'].includes(S.view))) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }
}
const VIEWS = {};
function render() {
  renderMe();
  const app = $('app'); app.innerHTML = (VIEWS[S.view] || (() => ''))();
  if (S.view !== S.lastView) {
    S.lastView = S.view; const h = app.querySelector('h1');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); announce(h.textContent); }
    window.scrollTo(0, 0);
  }
}
function go(view) { S.view = view; render(); if (view === 'board') loadBoard(); }

/* ---------- auth ---------- */
VIEWS.auth = () => {
  const params = new URLSearchParams(location.search); const urlErr = params.get('error');
  const err = S.authError || urlErr || '';
  return `<div class="auth">
  <div class="onb-hero" style="padding-bottom:0"><span class="label gold">KNOLSKAPE Academy</span><h1>Welcome to AI PM Launchpad</h1><p>Practise the stakeholder conversations that make or break AI products.</p></div>
  <div class="seg" role="tablist" aria-label="Sign in or join" style="justify-self:center"><button role="tab" data-action="authtab" data-tab="join" aria-selected="${S.authTab === 'join'}">Join a cohort</button><button role="tab" data-action="authtab" data-tab="login" aria-selected="${S.authTab === 'login'}">Sign in</button></div>
  ${err ? `<div class="err" role="alert">${esc(err)}</div>` : ''}
  ${S.authTab === 'join' ? `<form class="panel stack" id="join-form" novalidate>
    <div class="field"><label for="j-code">Cohort code</label><input id="j-code" name="code" autocomplete="off" placeholder="LP-XXXXXXXX" required></div>
    ${CFG.sso ? `<button type="button" class="btn blue" data-action="sso">Continue with company sign-in</button><p class="muted" style="font-size:13px;text-align:center">or create a password</p>` : ''}
    <div class="field"><label for="j-name">Your name</label><input id="j-name" name="name" autocomplete="name" required></div>
    <div class="field"><label for="j-email">Work email</label><input id="j-email" name="email" type="email" autocomplete="email" required></div>
    <div class="field"><label for="j-pw">Password (at least 10 characters)</label><input id="j-pw" name="password" type="password" autocomplete="new-password" minlength="10" required></div>
    <button class="btn go big" type="submit">Join and start</button>
    <p class="muted" style="font-size:12px">We store your name, email and practice results to run the programme. Your facilitator can see your progress. You can export or delete your data at any time from your profile.</p>
  </form>` : `<form class="panel stack" id="login-form" novalidate>
    ${CFG.sso ? `<button type="button" class="btn blue" data-action="sso">Continue with company sign-in</button>` : ''}
    <div class="field"><label for="l-email">Email</label><input id="l-email" name="email" type="email" autocomplete="email" required></div>
    <div class="field"><label for="l-pw">Password</label><input id="l-pw" name="password" type="password" autocomplete="current-password" required></div>
    <button class="btn go big" type="submit">Sign in</button></form>`}
  </div>`;
};

/* ---------- onboarding ---------- */
const SQUAD_STYLE = { evaluate: { c: '#5B86FF', l: 'Ev', d: 'Measure what matters' }, educate: { c: '#FBD300', l: 'Ed', d: 'Build the foundations' }, experience: { c: '#FF7103', l: 'Ex', d: 'Learn by doing' }, enable: { c: '#C2D02F', l: 'En', d: 'Make it stick' } };
VIEWS.onboard = () => `<div class="onb">
  <section class="onb-hero"><span class="label gold">Season 1 · Launch Quarter</span>
    <h1>You just joined the GENIE team as an AI PM.</h1>
    <p>Sales wants promises. Engineering wants to ship. Clients want magic. The CEO wants agents. Your job is to get it right. Every conversation is a mission.</p></section>
  <div class="loop"><div><span class="label">01 Talk</span><b>Live conversations</b><span class="muted" style="font-size:14px">Stakeholders ${CFG.claude ? 'played by Claude ' : ''}react to every word.</span></div><div><span class="label">02 Decide</span><b>Real consequences</b><span class="muted" style="font-size:14px">Your call changes what happens next.</span></div><div><span class="label">03 Level up</span><b>Earn stars</b><span class="muted" style="font-size:14px">Get scored on real AI PM skills, then replay for 3 stars.</span></div></div>
  <form class="panel stack" id="onb-form" style="padding:22px">
    <div><span class="label">Step 1</span><h2>Choose your squad</h2><p class="muted" style="font-size:14px">Squads compete on average skill, so every member counts equally.</p></div>
    <div class="squads" role="radiogroup" aria-label="Squad">${Object.entries(CFG.squads).map(([k, v], i) => `<label class="crest" style="--sq:${SQUAD_STYLE[k].c}"><input type="radio" name="team" value="${k}" ${(ME.user.team === k || (!ME.user.team && i === 0)) ? 'checked' : ''}><span class="hex">${SQUAD_STYLE[k].l}</span><b>${esc(v)}</b><small>${SQUAD_STYLE[k].d}</small></label>`).join('')}</div>
    <div><span class="label">Step 2</span><h2>Pick your difficulty</h2></div>
    <div class="choice-grid">
      <label class="pick"><input type="radio" name="mode" value="guided" checked><span><b>Guided</b><small>Your inner voices (skills) whisper hints during conversations.</small></span></label>
      <label class="pick"><input type="radio" name="mode" value="expert"><span><b>Expert</b><small>No hints. Passing earns the Unassisted badge.</small></span></label></div>
    <div><span class="label">Step 3</span><h2>How you appear in the league</h2></div>
    <div class="choice-grid">
      <label class="pick"><input type="radio" name="vis" value="alias" checked><span><b>Codename</b><small>You play as "${esc(ME.user.alias)}".</small></span></label>
      <label class="pick"><input type="radio" name="vis" value="name"><span><b>My name</b><small>Visible to your cohort.</small></span></label>
      <label class="pick"><input type="radio" name="vis" value="private"><span><b>Private</b><small>Only you see your rank.</small></span></label></div>
    <div class="row"><button class="btn go big" type="submit">Start mission 1</button><span class="muted" style="font-size:14px">${esc(CFG.missions[0].title)} · about ${CFG.missions[0].minutes} minutes</span></div>
  </form></div>`;

/* ---------- home ---------- */
const X_POS = [50, 72, 50, 28];
VIEWS.home = () => {
  const P = CFG.path, ms = ME.missions, ch = ME.challenge;
  const nextId = (P.find(n => n.type === 'mission' && ms[n.id].unlocked && !ms[n.id].passed) || {}).id || null;
  const gap = 150, H = P.length * gap + 30;
  const pts = P.map((n, i) => ({ x: X_POS[i % X_POS.length], y: 60 + i * gap }));
  const seg = arr => arr.map((p, i) => i === 0 ? `M ${p.x} ${p.y}` : `C ${arr[i - 1].x} ${arr[i - 1].y + gap / 2}, ${p.x} ${p.y - gap / 2}, ${p.x} ${p.y}`).join(' ');
  const doneUpTo = P.reduce((k, n, i) => (n.type === 'mission' ? ms[n.id].passed : ME.chests[n.id].opened) ? i : k, -1);
  const nodes = P.map((n, i) => {
    const p = pts[i];
    if (n.type === 'chest') {
      const c = ME.chests[n.id];
      return `<div class="node chest ${c.opened ? 'opened' : c.ready ? 'ready' : 'locked'}" style="left:${p.x}%;top:${p.y}px">
        <button class="node-btn" data-action="chest" data-id="${n.id}" ${c.ready && !c.opened ? '' : 'aria-disabled="true"'} aria-label="${c.opened ? 'Chest opened' : c.ready ? 'Open reward chest' : 'Locked reward chest'}">${chestIcon(c.opened)}</button>
        <span class="s">${c.opened ? 'Opened' : c.ready ? 'Tap to open' : 'Reward chest'}</span></div>`;
    }
    const m = mission(n.id), st = ms[m.id], cur = m.id === nextId;
    const cls = ['node', m.tier === 3 ? 'boss' : '', st.unlocked ? 'open' : 'locked', st.passed ? 'done' : '', cur ? 'current' : ''].join(' ');
    return `<div class="${cls}" style="left:${p.x}%;top:${p.y}px">
      ${cur ? `<span class="start-tag">${st.best != null ? 'TRY AGAIN' : 'START'}</span>` : ''}
      <button class="node-btn" data-action="brief" data-sid="${m.id}" ${st.unlocked ? '' : 'aria-disabled="true"'} aria-label="${esc(m.title)}${st.unlocked ? '' : ', locked: ' + esc(unlockText(m))}">${st.unlocked ? `<span class="ini">${esc(m.persona.initials)}</span>` : lockIcon()}</button>
      <span class="t">${esc(m.title)}</span>
      <span class="s">${st.unlocked ? (st.best != null ? starsHtml(st.stars) : `${CFG.tiers[m.tier].label} · ${m.minutes} min`) : esc(unlockText(m))}</span></div>`;
  }).join('');
  const totalStars = CFG.missions.reduce((x, m) => x + ms[m.id].stars, 0), passed = CFG.missions.filter(m => ms[m.id].passed).length;
  return `${modeNotice()}
  <div class="home">
    <section>
      <div class="season"><span class="label gold">Season 1 · Launch Quarter</span><h1>Get GENIE's AI launches right.</h1>
        <p>${CFG.missions.length} stakeholders, ${CFG.missions.length} hard conversations. Pass each mission to move along the path; earn 3 stars by finding every hidden fact and scoring 90+.</p>
        <div class="row"><span class="chip gold num">${totalStars} / ${CFG.missions.length * 3} stars</span><span class="chip num">${passed} of ${CFG.missions.length} passed</span></div></div>
      ${S.chestNote ? `<div class="reward" style="margin-top:14px"><span class="chip gold num">+${S.chestNote.amount} XP</span><div><b>Field note unlocked</b><div style="font-size:14px">${esc(S.chestNote.note)}</div></div></div>` : ''}
      <div class="path" style="height:${H}px">
        <svg class="trail" viewBox="0 0 100 ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${seg(pts)}" fill="none" stroke="#26324D" stroke-width="10" stroke-linecap="round" vector-effect="non-scaling-stroke"/>${doneUpTo >= 0 ? `<path d="${seg(pts.slice(0, doneUpTo + 1))}" fill="none" stroke="#FBD300" stroke-width="10" stroke-linecap="round" vector-effect="non-scaling-stroke"/>` : ''}</svg>
        ${nodes}
      </div>
    </section>
    <aside class="side">${sideGoal()}${sideSpark()}
      <section class="panel stack"><div class="row between"><span class="label">Weekly challenge</span>${ch.done ? '<span class="chip good">Done</span>' : `<span class="chip gold">+${CFG.rules.CHALLENGE_XP} XP</span>`}</div>
        <h3>${esc(ch.text)}</h3><p class="muted" style="font-size:13px">Resets every Monday.</p>
        ${ch.done ? '' : `<button class="btn" data-action="brief" data-sid="${ch.missionId}" ${ms[ch.missionId].unlocked ? '' : 'disabled'}>Take the challenge</button>`}</section>
      <section class="panel stack"><div class="row between"><span class="label">Readiness rating</span><b class="num" style="color:var(--ink);font-size:22px">${ME.rating.value}</b></div>
        <p class="muted" style="font-size:13px">${ME.rating.n < 3 ? `Based on ${ME.rating.n} mission${ME.rating.n === 1 ? '' : 's'}. Complete 3 for a full-confidence rating.` : 'Your best score per mission, weighted by difficulty.'}</p>
        <button class="btn ghost" data-action="nav" data-view="board" style="justify-self:start">See the league</button></section>
    </aside>
  </div>`;
};
function sideGoal() {
  const t = ME.xpToday, st = ME.streak, goal = CFG.rules.DAILY_GOAL;
  return `<section class="panel goal"><div class="ring" style="--p:${Math.min(100, t / goal * 100)}"><div>${Math.min(t, goal)}<small>of ${goal} XP</small></div></div>
    <div class="stack" style="gap:4px"><span class="label">Daily goal</span><b style="color:var(--ink)">${t >= goal ? 'Goal reached. Nice work.' : st.today ? "Keep going to hit today's goal." : 'Practise today to keep your streak.'}</b>
    <span class="muted" style="font-size:13px;display:flex;align-items:center;gap:6px">${flame()} ${st.n}-day streak${st.shields ? ` · ${shieldIcon()} ${st.shields} shield${st.shields > 1 ? 's' : ''}` : ''}</span>
    <span class="muted" style="font-size:12px">A shield covers one missed day. Earn one for every 5 practice days, up to 2.</span></div></section>`;
}
function sideSpark() {
  const sp = ME.spark, R = S.spark.result || sp.result;
  return `<section class="panel spark stack"><div class="row between"><span class="label gold">Daily spark · 2 min</span><span class="chip">${esc(skillName(sp.skill))}</span></div>
    <p class="muted" style="font-size:13px">${esc(sp.who)} says:</p><p class="quote-line">"${esc(sp.line)}"</p>
    ${sp.done ? (R ? `<div class="stack" style="gap:6px"><div class="row"><span class="chip gold num">${R.score} / 10</span><span class="chip num">+${R.xp} XP</span></div><p style="font-size:14px">${esc(R.feedback)}</p>${R.better ? `<p class="muted" style="font-size:13px"><b style="color:var(--good)">Stronger:</b> ${esc(R.better)}</p>` : ''}</div>` : `<p class="muted" style="font-size:14px">Done for today. A new spark arrives tomorrow.</p>`)
      : `<label for="spark" class="label">Your reply</label><textarea id="spark" class="plain" maxlength="800" placeholder="Reply in one or two sentences…" ${S.spark.busy ? 'disabled' : ''}>${esc(S.spark.draft)}</textarea>
      <button class="btn go" data-action="spark" ${S.spark.busy ? 'disabled' : ''}>${S.spark.busy ? 'Scoring…' : 'Send reply · up to 30 XP'}</button>`}
  </section>`;
}

/* ---------- brief ---------- */
VIEWS.brief = () => {
  const m = mission(S.sid), st = ME.missions[m.id], mode = ME.user.mode;
  return `${modeNotice()}<button class="btn ghost" data-action="nav" data-view="home">Back to the path</button>
  <div class="brief" style="margin-top:10px">
    <section class="panel stack" style="padding:22px">
      <div class="row"><span class="chip ${m.tier === 3 ? 'gold' : m.tier === 2 ? 'blue' : ''}">${CFG.tiers[m.tier].label} mission</span><span class="muted">${m.minutes} min · ${CFG.rules.MAX_TURNS} messages · 3 hidden facts</span></div>
      <h1>${esc(m.title)}</h1>
      <div class="portrait"><span class="face">${esc(m.persona.initials)}</span><div><strong>${esc(m.persona.name)}</strong><small>${esc(m.persona.role)}</small></div></div>
      <p style="font-size:16px">${esc(m.setup)}</p>
      <div class="panel" style="background:var(--panel-2)"><span class="label gold">Your objective</span><p style="margin-top:4px">${esc(m.objective)}</p></div>
      <div class="stack" style="gap:8px"><span class="label">How to win</span>
        <div class="crit-mini"><span class="chip gold">1</span><span>Ask sharp questions to unlock 3 hidden facts. Present them as evidence to strengthen your case.</span></div>
        <div class="crit-mini"><span class="chip gold">2</span><span>Keep Trust above zero or ${esc(m.persona.name.split(' ')[0])} walks out. Watch for pressure moments.</span></div>
        <div class="crit-mini"><span class="chip gold">3</span><span>Make the call, explain why, and predict your score.</span></div></div>
    </section>
    <aside class="side">
      <section class="panel stack"><div class="row between"><span class="label">Stars</span>${starsHtml(st.stars)}</div>
        <div class="crit-mini">${starsHtml(1)}<span style="font-size:14px">Pass with ${CFG.rules.PASS}+</span></div>
        <div class="crit-mini">${starsHtml(2)}<span style="font-size:14px">Score 85+</span></div>
        <div class="crit-mini">${starsHtml(3)}<span style="font-size:14px">Score 90+ and find all 3 facts</span></div>
        ${st.best != null ? `<p class="muted" style="font-size:13px">Your best: <b class="num" style="color:var(--ink)">${st.best}</b>. Replays earn XP only when you beat it.</p>` : ''}</section>
      <section class="panel stack"><span class="label">Scored on</span>${m.rubric.map(c => `<div style="font-size:14px"><b style="color:var(--ink)">${esc(c.name)}</b><div style="font-size:12px;color:${CFG.skillColor[c.skill]}">${esc(skillName(c.skill))}</div></div>`).join('')}</section>
      <section class="panel stack"><span class="label">Difficulty</span>
        <div class="seg" role="group" aria-label="Difficulty"><button data-action="mode" data-mode="guided" aria-pressed="${mode === 'guided'}">Guided</button><button data-action="mode" data-mode="expert" aria-pressed="${mode === 'expert'}">Expert</button></div>
        <p class="muted" style="font-size:13px">${mode === 'guided' ? 'Your skills speak up with hints as you talk.' : 'No hints. Passing earns the Unassisted badge.'}</p>
        <button class="btn go big" data-action="start" data-sid="${m.id}" ${S.busy ? 'disabled' : ''}>${st.best != null ? 'Replay mission' : 'Start mission'}</button></section>
    </aside></div>`;
};

/* ---------- simulation ---------- */
function gauge(label, v, d, color, help) {
  return `<div class="gauge" title="${esc(help)}"><div class="lab"><span>${label}${d ? `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : ''}${d}</span>` : ''}</span><b>${Math.round(v)}</b></div><div class="gbar ${v <= 20 ? 'danger' : ''}" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(v)}"><i style="width:${v}%;background:${color}"></i></div></div>`;
}
VIEWS.sim = () => {
  const r = S.run, m = mission(r.missionId), first = m.persona.name.split(' ')[0];
  if (S.stage === 'decide') return viewDecide(r, m);
  const left = r.maxTurns - r.learnerTurns, canDecide = !!r.options, md = mood(r.meters.trust), d = r.delta || {};
  return `<div class="sim">
  <section class="panel chat" aria-label="Conversation with ${esc(m.persona.name)}">
    <div class="chat-head"><span class="face sm">${esc(m.persona.initials)}<span class="mood" style="background:${md.c}"></span></span>
      <div class="grow"><strong style="color:var(--ink)">${esc(m.persona.name)}</strong><div class="muted" style="font-size:12px">${esc(md.name)} · ${r.claude ? 'played by Claude' : 'scripted practice'}</div></div>
      <div class="pips" role="img" aria-label="${r.learnerTurns} of ${r.maxTurns} messages used">${Array.from({ length: r.maxTurns }, (_, i) => `<i class="${i < r.learnerTurns ? 'used' : ''}"></i>`).join('')}</div>
      <button class="btn ghost" data-action="quit">Leave</button></div>
    <h1 class="sr-only">${esc(m.title)}: conversation</h1>
    <div class="msgs" id="msgs" role="log" aria-label="Conversation messages" tabindex="0">${r.turns.map(t => {
      if (t.role === 'stamp') return `<div class="stamp">${esc(t.text)}<small>${esc(t.sub)}</small></div>`;
      if (t.role === 'found') return `<div class="found-toast">${esc(t.text)}</div>`;
      if (t.role === 'voice') return `<div class="voice" style="--vc:${CFG.skillColor[t.skill]}"><b>${esc(skillName(t.skill))}</b>${esc(t.text)}</div>`;
      return `<div class="msg ${t.role}"><span class="who-line">${t.role === 'persona' ? esc(first) : 'You'}</span>${esc(t.text)}</div>`; }).join('')}
      ${S.busy ? `<div class="typing" role="status">${esc(first)} is typing <i></i><i></i><i></i></div>` : ''}</div>
    <div class="composer">
      ${r.walkout ? `<p><b style="color:var(--red)">${esc(first)} walked out.</b> This attempt is capped below the pass mark. Make your decision, then replay.</p>`
        : left > 0 ? `<label for="composer" class="label">Your move</label><textarea id="composer" maxlength="1200" placeholder="Ask a question, name a limit, or propose a plan…" ${S.busy ? 'disabled' : ''}>${esc(S.draft)}</textarea>` : `<p><b>All ${r.maxTurns} messages used.</b> Time to make the call.</p>`}
      <div class="row between"><span class="muted" style="font-size:12px">${!r.walkout && left > 0 ? 'Ctrl+Enter to send' : ''}</span>
        <div class="row">${canDecide ? `<button class="btn ${r.walkout || left === 0 ? 'go' : ''}" data-action="to-decide">Make the call</button>` : `<span class="muted" style="font-size:13px">Decide after ${r.minTurns - r.learnerTurns} more</span>`}${left > 0 && !r.walkout ? `<button class="btn blue" data-action="send" ${S.busy ? 'disabled' : ''}>Send</button>` : ''}</div></div>
    </div>
  </section>
  <aside class="side">
    <section class="panel stack"><span class="label">Live read</span>
      ${gauge('Trust', r.meters.trust, d.trust, '#5B86FF', 'At zero the stakeholder walks out')}
      ${gauge('Clarity', r.meters.clarity, d.clarity, '#FF7103', 'How clear the way forward is')}
      ${gauge('Risk control', r.meters.risk, d.risk, '#3FCB7E', 'Falls when you over-promise or accept unsafe asks')}
    </section>
    <section class="panel stack"><div class="row between"><span class="label">Evidence locker</span><span class="chip ${r.facts.filter(f => f.found).length === 3 ? 'good' : ''} num">${r.facts.filter(f => f.found).length} / 3</span></div>
      <div class="evidence">${r.facts.map(f => f.found
        ? `<div class="ev found ${r.evidenceUsed.includes(f.id) ? 'used' : ''}"><div class="ev-top"><b>${esc(f.short)}</b>${r.walkout ? '' : `<button class="btn ghost" data-action="evidence" data-fid="${f.id}" style="padding:2px 4px">${r.evidenceUsed.includes(f.id) ? 'Cited' : 'Present'}</button>`}</div><span class="muted">${esc(f.text)}</span></div>`
        : `<div class="ev locked">Locked${f.hint ? ` · try asking about ${esc(f.hint)}` : ''}</div>`).join('')}</div>
      <p class="muted" style="font-size:12px">Present evidence to back up your point in your next message.</p></section>
  </aside></div>`;
};
function viewDecide(r, m) {
  return `<div class="brief">
  <section class="panel stack" style="padding:22px"><span class="label gold">Decision point · ${esc(m.title)}</span><h1>Make the call.</h1>
    <p class="muted">You found ${r.facts.filter(f => f.found).length} of 3 facts in ${r.learnerTurns} messages${r.walkout ? ', but the meeting ended early' : ''}.</p>
    <fieldset class="options" style="border:0;padding:0;margin:0"><legend class="label" style="margin-bottom:8px">Choose one</legend>
      ${r.options.map((o, i) => `<label class="option"><input type="radio" name="decision" value="${o.id}" ${S.decision === o.id ? 'checked' : ''}><span class="key">${'ABC'[i]}</span><span>${esc(o.label)}</span></label>`).join('')}</fieldset>
    <label for="rationale" class="label">Why? The assessor scores your reasoning</label>
    <textarea id="rationale" class="plain" maxlength="1500" placeholder="I chose this because…">${esc(S.rationale)}</textarea>
  </section>
  <aside class="side"><section class="panel stack"><span class="label">Predict your score</span>
    <p class="muted" style="font-size:14px">Land within 10 points to earn the Calibrated badge.</p>
    <label for="predict" class="row between"><span>My prediction</span><b class="num" id="predict-out" style="color:var(--gold);font-size:28px">${S.predicted}</b></label>
    <input id="predict" type="range" min="0" max="100" step="1" value="${S.predicted}">
    <button class="btn go big" data-action="submit" ${S.assessing ? 'disabled' : ''}>${S.assessing ? (r.claude ? 'Claude is reviewing your conversation…' : 'Scoring…') : 'Lock it in'}</button>
    ${S.assessing ? `<p class="muted" style="font-size:13px" role="status">${r.claude ? 'A careful review takes up to a minute.' : 'Scoring your attempt.'}</p>` : (r.walkout ? '' : `<button class="btn ghost" data-action="back-talk">Back to the conversation</button>`)}
  </section></aside></div>`;
}

/* ---------- result ---------- */
VIEWS.result = () => {
  const R = S.result, m = mission(R.missionId), sc = R.score, pass = sc >= CFG.rules.PASS, st = R.stars;
  const nextStar = st < 1 ? `Score ${CFG.rules.PASS}+ to earn your first star.` : st < 2 ? 'Score 85+ for the second star.' : st < 3 ? 'Find all 3 facts and score 90+ for the third star.' : 'Three stars. Try Expert mode next.';
  const rewards = [R.levelUp ? `Level up: ${R.level.name}` : null, ...R.earned.map(b => 'Badge: ' + (CFG.badges.find(x => x.id === b)?.name || b)), ...R.unlocks.map(u => 'Unlocked: ' + u)].filter(Boolean);
  const first = m.persona.name.split(' ')[0];
  return `${R.note ? `<div class="notice"><span class="chip warn">Note</span><span>${esc(R.note)}</span></div>` : ''}
  <section class="result-hero">
    <div style="text-align:center;display:grid;gap:8px;justify-items:center">${starsHtml(st, true)}<div class="bigscore"><span id="bigscore-n">${sc}</span><small>/100</small></div></div>
    <div class="stack"><span class="label gold">${esc(m.title)} · ${pass ? 'Mission passed' : 'Not passed yet'}${R.prevBest != null ? ` · previous best ${R.prevBest}` : ''}</span>
      <h1>${R.walkout ? `${esc(first)} walked out. Regroup and replay.` : pass ? (st === 3 ? 'Flawless. Three stars.' : sc >= 85 ? 'Strong performance.' : 'Passed. Now go for more stars.') : 'Close. Replay to pass.'}</h1>
      <p class="muted">Rubric ${R.parts.rubric}/60 · decision ${R.parts.decision}/25 · facts ${R.parts.facts}/15. You predicted ${R.predicted}: ${Math.abs(R.predicted - sc) <= 10 ? 'well calibrated.' : R.predicted > sc ? 'you rated yourself higher than the evidence.' : 'you did better than you thought.'}</p>
      <div class="row"><span class="chip gold num">+${R.gained} XP</span><span class="chip">${esc(nextStar)}</span></div></div>
  </section>
  ${rewards.length ? `<div class="row" style="margin-top:14px">${rewards.map((r, i) => `<div class="reward" style="animation-delay:${.2 + i * .15}s"><span class="medal" style="width:30px;height:34px;background:var(--gold);color:#111827">★</span><b>${esc(r)}</b></div>`).join('')}</div>` : ''}
  <div class="results">
    <div class="side">
      <section class="panel stack"><span class="label">What happened next</span><p><b style="color:var(--ink)">You chose:</b> ${esc(R.decision.label)}</p><p style="font-size:16px">${esc(R.decision.outcome)}</p></section>
      <section class="panel"><span class="label">Conversation AI assessment${R.scoredBy === 'claude' ? ' · by Claude' : ' · backup rubric'}</span>
        ${m.rubric.map((c, i) => { const x = R.criteria.find(k => k.id === c.id); return `<div class="crit" style="animation-delay:${.15 * i}s"><div class="crit-top"><b>${esc(c.name)}</b><span class="cpips" role="img" aria-label="${x.score} of 4">${[1, 2, 3, 4].map(j => `<i class="${j <= x.score ? 'on' : ''}"></i>`).join('')}</span></div>
          <span style="font-size:12px;color:${CFG.skillColor[c.skill]}">${esc(skillName(c.skill))} · ${x.score}/4</span>${x.feedback ? `<p style="font-size:14px">${esc(x.feedback)}</p>` : ''}${x.evidence && x.evidence !== 'none' ? `<p class="quote">"${esc(x.evidence)}"</p>` : ''}</div>`; }).join('')}</section>
      ${R.rewrite ? `<section class="panel rewrite"><span class="label">Say it better</span><div class="before"><b>You said:</b> ${esc(R.rewrite.original)}</div><div class="after"><b>Try:</b> ${esc(R.rewrite.improved)}</div></section>` : ''}
    </div>
    <aside class="side">
      <section class="panel stack"><button class="btn go big" data-action="start" data-sid="${m.id}">${st < 3 ? 'Replay for more stars' : 'Replay mission'}</button><button class="btn" data-action="nav" data-view="home">Back to the path</button></section>
      <section class="panel stack"><span class="label">Development insights</span>
        ${R.strengths.length ? `<div><b style="color:var(--good)">Strengths</b><ul class="list">${R.strengths.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        ${R.gaps.length ? `<div><b style="color:var(--red)">Work on</b><ul class="list">${R.gaps.map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        ${R.next ? `<div class="panel" style="background:var(--panel-2)"><span class="label gold">Next practice</span><p style="font-size:14px;margin-top:4px">${esc(R.next)}</p></div>` : ''}</section>
      <section class="panel stack"><span class="label">XP earned</span><div class="xp-list">${R.xp.map(([k, v]) => `<div><span>${esc(k)}</span><b>+${v}</b></div>`).join('')}<div class="total"><span>Total</span><b>+${R.gained}</b></div></div></section>
      <section class="panel stack"><span class="label">Skill progress</span>${R.skills.filter(s => s.after != null).map(s => { const up = s.before == null || s.after > s.before + .001; return `<div class="gauge"><div class="lab"><span style="color:${CFG.skillColor[s.skill]}">${esc(skillName(s.skill))}</span><span class="${up ? '' : 'muted'}" style="font-size:12px">${up ? 'Up · ' : ''}${esc(s.level)}</span></div><div class="gbar"><i style="width:${s.after / 4 * 100}%;background:${CFG.skillColor[s.skill]}"></i></div></div>`; }).join('')}</section>
    </aside>
  </div>`;
};

/* ---------- league ---------- */
async function loadBoard() {
  const b = S.board;
  try { b.data = await api(`/api/league?tab=${b.tab}&period=${b.period}&mission=${encodeURIComponent(b.mission)}&skill=${encodeURIComponent(b.skill)}`); if (S.view === 'board') render(); }
  catch (e) { toast(e.message); }
}
VIEWS.board = () => {
  const b = S.board, rows = b.data?.rows || [];
  const tabs = [['overall', 'Overall'], ['improved', 'Most improved'], ['mission', 'By mission'], ['skill', 'By skill'], ['squads', 'Squads']];
  const explain = { overall: 'Readiness rating: your best score on each mission, weighted for difficulty (Core x1.0, Advanced x1.1, Boss x1.2), averaged. Full weight after 3 missions. Retrying only helps if you do better.', improved: 'Average gain from first to best attempt on missions you replayed. Rewards learning, whatever your starting point.', mission: 'Best score on this mission. Ties go to whoever got there in fewer attempts.', skill: 'Skill rating 0 to 4: your best assessor score for this skill on each mission that tests it, averaged.', squads: 'Squads rank by the average rating of active members, so a small squad can beat a large one. Private learners are not counted.' }[b.tab];
  const you = rows.find(r => r.you);
  const podium = rows.length >= 3 ? `<div class="podium" aria-hidden="true">${[1, 0, 2].map(i => { const r = rows[i]; return `<div class="pod p${i + 1}"><span class="pr">${i + 1}</span><span class="nm">${esc(r.name)}${r.you ? ' <span class="chip gold">You</span>' : ''}</span><span class="vl">${r.value}</span></div>`; }).join('')}</div>` : '';
  const table = !b.data ? '<p class="muted">Loading…</p>' : rows.length ? `${podium}<div class="table-wrap"><table><caption class="sr-only">League standings</caption><thead><tr><th scope="col">Rank</th><th scope="col">${b.tab === 'squads' ? 'Squad' : 'Player'}</th>${b.tab === 'squads' ? '' : '<th scope="col">Squad</th>'}<th scope="col" class="r">Score</th><th scope="col">Detail</th></tr></thead><tbody>
    ${rows.map(r => `<tr class="${r.you ? 'you' : ''}"><td class="rank">${r.rank}</td><td>${esc(r.name)}${r.you ? ' <span class="chip gold">You</span>' : ''}${r.sample ? ' <span class="chip">Sample</span>' : ''}</td>${b.tab === 'squads' ? '' : `<td class="muted">${esc(CFG.squads[r.team] || '')}</td>`}<td class="r"><b>${r.value}</b></td><td class="muted">${esc(r.detail)}</td></tr>`).join('')}
  </tbody></table></div>` : `<p class="muted" style="padding:20px 0">No results in this view yet. ${b.tab === 'improved' ? 'Replay a mission to show improvement.' : 'Finish a mission to appear here.'}</p>`;
  return `<div class="stack" style="margin-bottom:14px"><span class="label gold">Season 1 league</span><h1>Ranked on skill and growth, not hours logged.</h1></div>
  <div class="board-layout"><section class="panel">
    <div class="board-controls"><div class="seg" role="tablist" aria-label="League view">${tabs.map(([k, l]) => `<button role="tab" data-action="btab" data-tab="${k}" aria-selected="${b.tab === k}">${l}</button>`).join('')}</div>
      <div class="row">${b.tab === 'mission' ? `<select id="b-mission" aria-label="Mission">${CFG.missions.map(m => `<option value="${m.id}" ${b.mission === m.id ? 'selected' : ''}>${esc(m.title)}</option>`).join('')}</select>` : ''}
        ${b.tab === 'skill' ? `<select id="b-skill" aria-label="Skill">${Object.entries(CFG.skills).map(([k, v]) => `<option value="${k}" ${b.skill === k ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}</select>` : ''}
        <select id="b-period" aria-label="Time period"><option value="week" ${b.period === 'week' ? 'selected' : ''}>This week</option><option value="month" ${b.period === 'month' ? 'selected' : ''}>Last 30 days</option><option value="all" ${b.period === 'all' ? 'selected' : ''}>All season</option></select></div></div>
    <p class="muted" style="font-size:13px;margin-bottom:12px">${esc(explain)}</p>
    ${table}
    ${you ? `<p style="margin-top:12px;font-size:14px">You are <b class="gold">#${you.rank}</b> of ${rows.length}${ME.user.visibility === 'private' ? ' (only you can see this)' : ''}.</p>` : ''}
  </section>
  <aside class="side">
    <section class="panel stack"><span class="label">Your visibility</span>
      ${[['alias', 'Codename', `Shown as "${ME.user.alias}"`], ['name', 'My name', 'Visible to your cohort'], ['private', 'Private', 'Only you see your rank']].map(([k, l, d]) => `<label class="pick"><input type="radio" name="bvis" value="${k}" ${ME.user.visibility === k ? 'checked' : ''}><span><b>${l}</b><small>${esc(d)}</small></span></label>`).join('')}</section>
    <section class="panel stack"><span class="label">Fair play</span><ul class="list" style="font-size:13px">
      <li>Scores are calculated on the server from your conversation, so they cannot be edited.</li>
      <li>Only assessed attempts count. Starting a mission earns nothing.</li>
      <li>Your best score per mission counts, so grinding does not help.</li>
      <li>Harder missions weigh more; full weight after 3 missions.</li>
      <li>Squads use averages, so size does not matter.</li></ul></section>
  </aside></div>`;
};

/* ---------- profile ---------- */
function radar(Rt) {
  const keys = Object.keys(CFG.skills), cx = 130, cy = 120, rad = 84;
  const pt = (i, v) => { const a = -Math.PI / 2 + i * 2 * Math.PI / keys.length; return [cx + Math.cos(a) * rad * v, cy + Math.sin(a) * rad * v]; };
  const ring = v => keys.map((_, i) => pt(i, v).join(',')).join(' ');
  const short = { discover: 'Discovery', uncertainty: 'Uncertainty', evals: 'Evals', rai: 'Resp. AI', economics: 'Economics', influence: 'Influence' };
  return `<svg class="radar" viewBox="0 0 260 240" width="100%" style="max-width:320px" role="img" aria-label="Skill radar: ${keys.map(k => short[k] + ' ' + profLevel(Rt[k])).join(', ')}">
    ${[.25, .5, .75, 1].map(v => `<polygon points="${ring(v)}" fill="none" stroke="#26324D" stroke-width="1"/>`).join('')}
    ${keys.map((_, i) => { const [x, y] = pt(i, 1); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#26324D"/>`; }).join('')}
    <polygon points="${keys.map((k, i) => pt(i, (Rt[k] ?? 0) / 4).join(',')).join(' ')}" fill="rgba(251,211,0,.25)" stroke="#FBD300" stroke-width="2"/>
    ${keys.map((k, i) => { const [x, y] = pt(i, 1.2); return `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" style="fill:${CFG.skillColor[k]}">${short[k] || k}</text>`; }).join('')}
  </svg>`;
}
VIEWS.progress = () => {
  const L = ME.level, N = ME.next, Rt = ME.skills, st = ME.streak, u = ME.user;
  return `<div class="row between" style="margin-bottom:16px"><div class="row" style="gap:14px"><span class="lvl-shield" style="width:56px;height:56px;font-size:22px">${L.n}</span><div><span class="label gold">${esc(u.alias)} · ${esc(CFG.squads[u.team])}</span><h1>${esc(L.name)}</h1></div></div><span class="muted num">${ME.xp} XP${N ? ` · ${N.xp - ME.xp} to ${esc(N.name)}` : ' · max level'}</span></div>
  <div class="profile">
    <div class="side">
      <section class="panel stack"><span class="label">Badges · ${ME.badges.length} of ${CFG.badges.length}</span><div class="badges">${CFG.badges.map(b => { const on = ME.badges.includes(b.id); return `<div class="badge ${on ? 'on' : ''}"><span class="medal" aria-hidden="true">${on ? '★' : '?'}</span><div><b>${esc(b.name)}</b>${on ? '' : '<span class="sr-only"> (not earned yet)</span>'}<small>${esc(b.how)}</small></div></div>`; }).join('')}</div></section>
      <section class="panel"><span class="label">Mission log</span><div>${ME.history.length ? ME.history.map(a => { const m = mission(a.missionId); return `<div class="hist-row"><div><b style="color:var(--ink)">${esc(m?.title || a.missionId)}</b><div class="muted" style="font-size:12px">${new Date(a.at).toLocaleString()} · ${a.mode === 'expert' ? 'Expert' : 'Guided'} · ${a.facts}/3 facts · +${a.xp} XP</div></div><span class="row" style="gap:6px">${starsHtml(a.stars)}<span class="chip ${a.score >= CFG.rules.PASS ? 'good' : 'warn'} num">${a.score}</span></span><button class="btn" data-action="brief" data-sid="${a.missionId}">Replay</button></div>`; }).join('') : '<p class="muted">No missions yet.</p>'}</div></section>
    </div>
    <aside class="side">
      <section class="panel stack" style="justify-items:center"><span class="label" style="justify-self:start">Skill radar</span>${radar(Rt)}
        <div class="stack" style="width:100%;gap:8px">${Object.entries(CFG.skills).map(([k, v]) => `<div class="row between" style="font-size:13px"><span style="color:${CFG.skillColor[k]}">${esc(v.name)} <span class="muted">${esc(v.code)}</span></span><span class="muted">${profLevel(Rt[k])}</span></div>`).join('')}</div></section>
      <section class="panel stack"><span class="label">Streak</span><p class="row" style="gap:8px">${flame()}<b class="num" style="font-size:22px;color:var(--ink)">${st.n}</b> days ${st.shields ? `· ${shieldIcon()} ${st.shields} shield${st.shields > 1 ? 's' : ''}` : ''}</p></section>
      <section class="panel stack"><span class="label">Settings</span>
        <label for="set-team" class="muted" style="font-size:13px">Squad</label><select id="set-team">${Object.entries(CFG.squads).map(([k, v]) => `<option value="${k}" ${u.team === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select>
        <div class="seg" role="group" aria-label="Default difficulty"><button data-action="mode" data-mode="guided" aria-pressed="${u.mode === 'guided'}">Guided</button><button data-action="mode" data-mode="expert" aria-pressed="${u.mode === 'expert'}">Expert</button></div>
        <p class="muted" style="font-size:13px">Signed in as ${esc(u.email)}</p>
        <div class="row"><a class="btn" href="/api/me/export" download>Download my data</a><button class="btn" data-action="logout">Sign out</button></div>
        ${S.confirmDelete ? `<div class="confirm"><b>Delete your account and all your data?</b><span style="font-size:13px">XP, stars, badges, conversations and history will be removed permanently and you will leave the league.</span><label for="del-confirm" style="font-size:13px">Type DELETE to confirm</label><input id="del-confirm" class="plain" style="min-height:0" autocomplete="off"><div class="row"><button class="btn" data-action="delete-yes" style="border-color:var(--red);color:var(--red)">Delete my account</button><button class="btn ghost" data-action="delete-no">Keep it</button></div></div>` : `<button class="btn ghost" data-action="delete" style="justify-self:start;color:var(--red)">Delete my account</button>`}
      </section>
    </aside>
  </div>`;
};

/* ---------- actions ---------- */
async function startRun(sid) {
  if (S.busy) return; S.busy = true;
  try { S.run = await api('/api/runs', { method: 'POST', body: { missionId: sid, mode: ME.user.mode } }); S.draft = ''; S.rationale = ''; S.decision = null; S.predicted = 65; S.stage = 'talk'; S.busy = false; go('sim'); setTimeout(() => $('composer')?.focus(), 50); }
  catch (e) { S.busy = false; toast(e.message); }
}
function scrollChat() { setTimeout(() => { const m = $('msgs'); if (m) m.scrollTop = m.scrollHeight; }, 30); }
async function sendTurn() {
  const text = (S.draft || '').trim(); if (!text || S.busy || !S.run) return;
  S.busy = true; S.run.turns.push({ role: 'learner', text }); S.draft = ''; render(); scrollChat();
  try {
    const v = await api(`/api/runs/${S.run.id}/turns`, { method: 'POST', body: { text } });
    S.run = v; S.busy = false; render(); scrollChat();
    const last = v.turns.filter(t => t.role === 'persona').slice(-1)[0]; if (last) announce(mission(v.missionId).persona.name.split(' ')[0] + ' says: ' + last.text);
    if (v.revealedNow) burst(40);
    if (v.walkout) announce('The stakeholder walked out. Make your decision.');
    if (v.scripted && v.reason === 'budget') toast("You have reached today's AI usage limit. Replies are scripted until tomorrow.");
    else if (v.scripted && CFG.claude) toast('Claude could not answer this turn, so a scripted reply was used.');
    if (!v.walkout) $('composer')?.focus();
  } catch (e) { S.busy = false; S.run.turns.pop(); S.draft = text; render(); toast(e.message); }
}
async function useEvidence(fid) {
  try { const r = await api(`/api/runs/${S.run.id}/evidence`, { method: 'POST', body: { factId: fid } }); S.run = r.view; if (!S.draft.includes(r.tag)) S.draft = r.tag + S.draft; render(); const c = $('composer'); if (c) { c.focus(); c.setSelectionRange(c.value.length, c.value.length); } }
  catch (e) { toast(e.message); }
}
async function submitDecision() {
  if (!S.decision) { toast('Choose a decision first.'); return; }
  if (S.rationale.trim().length < 20) { toast('Add a sentence or two on why. The assessor scores your reasoning too.'); $('rationale')?.focus(); return; }
  S.assessing = true; render();
  try {
    S.result = await api(`/api/runs/${S.run.id}/decision`, { method: 'POST', body: { optionId: S.decision, rationale: S.rationale, predicted: S.predicted } });
    S.assessing = false; S.run = null; await refreshMe(); go('result');
    countUp($('bigscore-n'), S.result.score); if (S.result.score >= CFG.rules.PASS) setTimeout(() => burst(S.result.stars >= 3 ? 160 : 100), 300);
  } catch (e) { S.assessing = false; render(); toast(e.message); }
}
async function openChest(id) {
  try { S.chestNote = await api('/api/chests/' + id, { method: 'POST' }); await refreshMe(); render(); burst(70); announce(`Chest opened: plus ${S.chestNote.amount} XP.`); }
  catch (e) { toast(e.message); }
}
async function submitSpark() {
  const text = S.spark.draft.trim(); if (text.length < 15) { toast('Write a full reply, at least a sentence.'); return; }
  S.spark.busy = true; render();
  try { S.spark.result = await api('/api/spark', { method: 'POST', body: { text } }); S.spark.busy = false; S.spark.draft = ''; await refreshMe(); render(); if (S.spark.result.score >= 7) burst(60); announce(`Spark scored ${S.spark.result.score} out of 10.`); }
  catch (e) { S.spark.busy = false; render(); toast(e.message); }
}
async function patchMe(body, msg) { try { ME = await api('/api/me', { method: 'PATCH', body }); render(); if (msg) toast(msg); if (S.view === 'board') loadBoard(); } catch (e) { toast(e.message); } }

document.addEventListener('click', e => {
  const b = e.target.closest('[data-action]'); if (!b || b.getAttribute('aria-disabled') === 'true' || b.disabled) return;
  const a = b.dataset.action;
  if (a === 'nav') { if (S.busy || S.assessing) return; S.run = null; S.chestNote = null; S.confirmDelete = false; go(b.dataset.view); }
  else if (a === 'brief') { S.sid = b.dataset.sid; S.chestNote = null; go('brief'); }
  else if (a === 'mode') patchMe({ mode: b.dataset.mode });
  else if (a === 'start') startRun(b.dataset.sid);
  else if (a === 'send') sendTurn();
  else if (a === 'evidence') useEvidence(b.dataset.fid);
  else if (a === 'to-decide') { S.stage = 'decide'; S.lastView = null; render(); }
  else if (a === 'back-talk') { S.stage = 'talk'; S.lastView = null; render(); scrollChat(); }
  else if (a === 'submit') submitDecision();
  else if (a === 'quit') { S.run = null; go('brief'); }
  else if (a === 'chest') openChest(b.dataset.id);
  else if (a === 'spark') submitSpark();
  else if (a === 'btab') { S.board.tab = b.dataset.tab; S.board.data = null; render(); loadBoard(); }
  else if (a === 'authtab') { S.authTab = b.dataset.tab; S.authError = ''; S.lastView = null; render(); }
  else if (a === 'sso') { const code = $('j-code')?.value.trim() || ''; location.href = '/api/auth/oidc/start' + (code ? '?cohort=' + encodeURIComponent(code) : ''); }
  else if (a === 'logout') api('/api/auth/logout', { method: 'POST' }).finally(() => location.replace('/'));
  else if (a === 'delete') { S.confirmDelete = true; render(); $('del-confirm')?.focus(); }
  else if (a === 'delete-no') { S.confirmDelete = false; render(); }
  else if (a === 'delete-yes') api('/api/me', { method: 'DELETE', body: { confirm: $('del-confirm').value.trim() } }).then(() => location.replace('/')).catch(err => toast(err.message));
});
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'composer') S.draft = t.value;
  if (t.id === 'rationale') S.rationale = t.value;
  if (t.id === 'spark') S.spark.draft = t.value;
  if (t.id === 'predict') { S.predicted = Number(t.value); $('predict-out').textContent = t.value; }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.name === 'decision') S.decision = t.value;
  if (t.id === 'b-period') { S.board.period = t.value; loadBoard(); }
  if (t.id === 'b-mission') { S.board.mission = t.value; loadBoard(); }
  if (t.id === 'b-skill') { S.board.skill = t.value; loadBoard(); }
  if (t.name === 'bvis') patchMe({ visibility: t.value }, t.value === 'private' ? 'You are now private. Only you see your rank.' : 'League visibility updated.');
  if (t.id === 'set-team') patchMe({ team: t.value }, 'Squad updated.');
});
document.addEventListener('keydown', e => { if (e.target.id === 'composer' && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); sendTurn(); } });
document.addEventListener('submit', async e => {
  e.preventDefault(); const f = new FormData(e.target); const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  try {
    if (e.target.id === 'join-form') { await api('/api/auth/join', { method: 'POST', body: { code: f.get('code'), name: f.get('name'), email: f.get('email'), password: f.get('password'), tz } }); await boot(); }
    else if (e.target.id === 'login-form') { const r = await api('/api/auth/login', { method: 'POST', body: { email: f.get('email'), password: f.get('password') } }); if (r.role !== 'learner') { location.href = '/admin'; return; } await boot(); }
    else if (e.target.id === 'onb-form') { ME = await api('/api/me', { method: 'PATCH', body: { team: f.get('team'), mode: f.get('mode'), visibility: f.get('vis'), onboarded: true, tz } }); S.sid = CFG.missions[0].id; go('brief'); }
  } catch (err) { S.authError = err.message; S.lastView = null; render(); const el = document.querySelector('.err'); if (el) el.focus?.(); }
});

async function boot() {
  try {
    CFG = CFG || await api('/api/config');
    try { await refreshMe(); } catch (e) { if (e.status === 401) { ME = null; S.view = 'auth'; render(); return; } throw e; }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (tz && tz !== ME.user.tz) ME = await api('/api/me', { method: 'PATCH', body: { tz } });
    if (ME.user.role !== 'learner' && !ME.user.onboarded) { location.href = '/admin'; return; }
    S.view = ME.user.onboarded ? 'home' : 'onboard'; S.lastView = null; render();
  } catch (e) { $('app').innerHTML = `<div class="err" role="alert">${esc(e.message)}</div>`; }
}
boot();
})();
