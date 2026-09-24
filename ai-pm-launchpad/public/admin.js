'use strict';
(function () {
const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let CFG, ME, cohorts = [], sel = null, learners = [], cal = null, queue = [], review = null, usage = [], err = '';
async function api(path, opts = {}) {
  const res = await fetch(path, { method: opts.method || 'GET', headers: { 'content-type': 'application/json', 'x-launchpad': '1' }, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let data = null; try { data = await res.json(); } catch {}
  if (!res.ok) { const e = new Error((data && data.error) || 'Request failed.'); e.status = res.status; throw e; }
  return data;
}
let tt; function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 4000); }
const skillShort = { discover: 'Disc', uncertainty: 'Unc', evals: 'Evals', rai: 'RAI', economics: 'Econ', influence: 'Infl' };

function loginView() {
  return `<div class="auth"><h1>Facilitator sign-in</h1>${err ? `<div class="err" role="alert">${esc(err)}</div>` : ''}
  <form class="panel stack" id="login"><div class="field"><label for="e">Email</label><input id="e" name="email" type="email" autocomplete="email" required></div>
  <div class="field"><label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" required></div><button class="btn go big">Sign in</button></form></div>`;
}
function mainView() {
  const c = cohorts.find(x => x.id === sel);
  return `<div class="stack" style="margin-bottom:16px"><span class="label gold">Facilitator dashboard</span><h1>Cohorts, progress and scoring quality</h1></div>
  ${!CFG.claude ? '<div class="notice"><span class="chip warn">Backup mode</span><span><b>ANTHROPIC_API_KEY is not set.</b> Learners get scripted stakeholders and a backup rubric.</span></div>' : ''}
  <div class="admin-grid">
    <section class="panel stack"><div class="row between"><span class="label">Cohorts</span></div>
      <form id="new-cohort" class="row"><label for="cname" class="sr-only">New cohort name</label><input id="cname" class="plain" style="min-height:0;flex:1" placeholder="New cohort name, for example Meridian Bank PMs Oct 2026" required><button class="btn go">Create</button></form>
      <div class="table-wrap"><table><thead><tr><th scope="col">Cohort</th><th scope="col">Invite code</th><th scope="col" class="r">Learners</th><th scope="col">Status</th><th scope="col"></th></tr></thead><tbody>
      ${cohorts.map(x => `<tr class="${x.id === sel ? 'you' : ''}"><td>${esc(x.name)}</td><td class="mono">${esc(x.code)}</td><td class="r">${x.learners}</td><td>${x.active ? '<span class="chip good">Open</span>' : '<span class="chip">Closed</span>'}</td><td style="white-space:normal"><button class="btn ghost" data-a="open" data-id="${x.id}">View</button><button class="btn ghost" data-a="toggle" data-id="${x.id}" data-active="${x.active ? 0 : 1}">${x.active ? 'Close' : 'Reopen'}</button></td></tr>`).join('') || '<tr><td colspan="5" class="muted">No cohorts yet. Create one and share its invite code.</td></tr>'}
      </tbody></table></div></section>
    <section class="panel stack"><span class="label">Scoring calibration · Claude vs human</span>
      ${cal ? `<div class="kpi"><div><span class="label">Reviewed</span><b>${cal.attemptsReviewed}</b></div><div><span class="label">Exact match</span><b>${cal.exact ?? '-'}${cal.exact != null ? '%' : ''}</b></div><div><span class="label">Within 1 point</span><b>${cal.withinOne ?? '-'}${cal.withinOne != null ? '%' : ''}</b></div><div><span class="label">Weighted kappa</span><b>${cal.weightedKappa ?? '-'}</b></div></div>
      <p class="muted" style="font-size:13px">Target: weighted kappa of ${cal.target} or more on at least 30 reviewed conversations before scores are used for any formal decision. ${cal.weightedKappa != null && cal.weightedKappa >= cal.target && cal.attemptsReviewed >= 30 ? '<b style="color:var(--good)">Target met.</b>' : '<b style="color:var(--warn)">Not yet validated.</b>'}</p>` : ''}
      <span class="label">Review queue (blind: Claude's scores are hidden until you submit)</span>
      ${queue.length ? queue.map(q => `<div class="row between" style="border-bottom:1px solid var(--line);padding:6px 0"><span>${esc(q.title)} · ${esc(q.name)} · ${new Date(q.created_at).toLocaleDateString()}</span><button class="btn" data-a="review" data-id="${q.id}">Score</button></div>`).join('') : '<p class="muted" style="font-size:14px">No conversations waiting. About 1 in 5 Claude-scored attempts is sampled for review.</p>'}
    </section>
  </div>
  ${review ? reviewView() : ''}
  ${c ? `<section class="panel stack" style="margin-top:18px"><div class="row between"><div><span class="label">Learners · ${esc(c.name)}</span></div><a class="btn" href="/api/admin/cohorts/${c.id}/export.csv">Export CSV</a></div>
    <div class="table-wrap"><table><thead><tr><th scope="col">Learner</th><th scope="col">Level</th><th scope="col" class="r">XP</th><th scope="col" class="r">Passed</th><th scope="col" class="r">Rating</th>${Object.keys(CFG.skills).map(k => `<th scope="col" class="r" title="${esc(CFG.skills[k].name)}">${skillShort[k]}</th>`).join('')}<th scope="col">Last active</th></tr></thead><tbody>
    ${learners.map(l => `<tr><td>${esc(l.name)}${l.demo ? ' <span class="chip">Sample</span>' : ''}<div class="muted" style="font-size:12px">${esc(l.email)}</div></td><td>${esc(l.level)}</td><td class="r num">${l.xp}</td><td class="r num">${l.passed}/${CFG.missions.length}</td><td class="r num">${l.rating}</td>${Object.keys(CFG.skills).map(k => `<td class="r num">${l.skills[k] ?? '-'}</td>`).join('')}<td class="muted">${l.lastActive ? new Date(l.lastActive).toLocaleDateString() : 'Not started'}</td></tr>`).join('') || `<tr><td colspan="12" class="muted">No learners yet. Share the invite code ${esc(c.code)}.</td></tr>`}
    </tbody></table></div></section>` : ''}
  ${ME.user.role === 'admin' ? `<div class="admin-grid" style="margin-top:18px">
    <section class="panel stack"><span class="label">Add a facilitator</span>
      <form id="new-fac" class="stack"><div class="field"><label for="fn">Name</label><input id="fn" name="name" class="plain" style="min-height:0" required></div><div class="field"><label for="fe">Email</label><input id="fe" name="email" type="email" class="plain" style="min-height:0" required></div><div class="field"><label for="fp">Temporary password (12+ characters)</label><input id="fp" name="password" type="password" class="plain" style="min-height:0" minlength="12" required></div><button class="btn">Add facilitator</button></form></section>
    <section class="panel stack"><span class="label">Claude usage (last 30 days)</span>
      ${usage.length ? `<div class="table-wrap"><table><thead><tr><th scope="col">Day (UTC)</th><th scope="col" class="r">Calls</th><th scope="col" class="r">Tokens</th><th scope="col" class="r">Learners</th></tr></thead><tbody>${usage.map(u => `<tr><td>${esc(u.day)}</td><td class="r num">${u.calls}</td><td class="r num">${u.tokens.toLocaleString()}</td><td class="r num">${u.users}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">No Claude calls yet.</p>'}
      <button class="btn ghost" data-a="purge" style="justify-self:start;color:var(--red)">Remove all sample learners</button></section></div>` : ''}`;
}
function reviewView() {
  const r = review, done = r.submitted;
  return `<section class="panel stack" style="margin-top:18px"><div class="row between"><span class="label gold">Blind review · ${esc(r.mission.title)}</span><button class="btn ghost" data-a="close-review">Close</button></div>
  <div class="admin-grid"><div class="transcript">${r.transcript ? r.transcript.turns.filter(t => t.role === 'persona' || t.role === 'learner').map(t => `<div class="msg ${t.role}" style="max-width:100%"><span class="who-line">${t.role === 'persona' ? 'Stakeholder' : 'Learner'}</span>${esc(t.text)}</div>`).join('') + `<div class="panel" style="background:var(--panel-2)"><b>Decision:</b> ${esc(r.mission.options.find(o => o.id === r.decision)?.label)}<br><b>Rationale:</b> ${esc(r.transcript.rationale)}</div>` : '<p class="muted">Transcript removed by the retention policy.</p>'}</div>
  <form id="review-form" class="stack">${r.mission.rubric.map(c => { const ai = r.criteria.find(x => x.id === c.id); return `<div class="score-row"><div><b style="color:var(--ink)">${esc(c.name)}</b><div class="muted" style="font-size:12px">${esc(c.good)}</div>${done ? `<div style="font-size:12px">Claude scored <b>${ai.score}</b>${ai.evidence && ai.evidence !== 'none' ? `: "${esc(ai.evidence)}"` : ''}</div>` : ''}</div><label class="sr-only" for="s-${c.id}">Score for ${esc(c.name)}</label><select id="s-${c.id}" name="${c.id}" ${done ? 'disabled' : ''} required><option value="">-</option>${[0, 1, 2, 3, 4].map(v => `<option value="${v}">${v}</option>`).join('')}</select></div>`; }).join('')}
  <label for="rnote" class="label">Note (optional)</label><textarea id="rnote" name="note" class="plain" ${done ? 'disabled' : ''}></textarea>
  ${done ? '<p class="muted">Submitted. Claude\'s scores are shown above for comparison.</p>' : '<button class="btn go">Submit my scores</button>'}</form></div></section>`;
}
function render() { $('me').innerHTML = ME ? `<span class="muted" style="font-size:13px">${esc(ME.user.email)}</span> <a class="btn ghost" href="/">Learner view</a> <button class="btn ghost" data-a="logout">Sign out</button>` : ''; $('app').innerHTML = ME ? mainView() : loginView(); }
async function refresh() {
  const [c, k, q] = await Promise.all([api('/api/admin/cohorts'), api('/api/admin/calibration'), api('/api/admin/review-queue')]);
  cohorts = c; cal = k; queue = q; if (sel == null && cohorts[0]) sel = cohorts[0].id;
  learners = sel ? await api(`/api/admin/cohorts/${sel}/learners`) : [];
  if (ME.user.role === 'admin') usage = await api('/api/admin/usage');
  render();
}
async function boot() {
  try {
    CFG = await api('/api/config');
    try { ME = await api('/api/me'); } catch (e) { if (e.status === 401) { ME = null; render(); return; } throw e; }
    if (!['admin', 'facilitator'].includes(ME.user.role)) { $('app').innerHTML = '<div class="err" role="alert">This area is for facilitators. <a href="/">Go to the learner app</a>.</div>'; return; }
    await refresh(); $('app').focus();
  } catch (e) { $('app').innerHTML = `<div class="err" role="alert">${esc(e.message)}</div>`; }
}
document.addEventListener('submit', async e => {
  e.preventDefault(); const f = new FormData(e.target);
  try {
    if (e.target.id === 'login') { await api('/api/auth/login', { method: 'POST', body: { email: f.get('email'), password: f.get('password') } }); err = ''; await boot(); }
    if (e.target.id === 'new-cohort') { const c = await api('/api/admin/cohorts', { method: 'POST', body: { name: $('cname').value } }); sel = c.id; toast(`Cohort created. Invite code: ${c.code}`); await refresh(); }
    if (e.target.id === 'new-fac') { await api('/api/admin/users', { method: 'POST', body: { name: f.get('name'), email: f.get('email'), password: f.get('password') } }); toast('Facilitator added.'); e.target.reset(); }
    if (e.target.id === 'review-form') { const scores = {}; for (const c of review.mission.rubric) scores[c.id] = Number(f.get(c.id)); const r = await api(`/api/admin/attempts/${review.id}/review`, { method: 'POST', body: { scores, note: f.get('note') } }); review.submitted = true; cal = r.calibration; queue = await api('/api/admin/review-queue'); render(); toast('Review saved.'); }
  } catch (x) { if (e.target.id === 'login') { err = x.message; render(); } else toast(x.message); }
});
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
  try {
    if (a === 'open') { sel = Number(b.dataset.id); learners = await api(`/api/admin/cohorts/${sel}/learners`); render(); }
    if (a === 'toggle') { await api(`/api/admin/cohorts/${b.dataset.id}`, { method: 'PATCH', body: { active: b.dataset.active === '1' } }); await refresh(); }
    if (a === 'review') { review = await api(`/api/admin/attempts/${b.dataset.id}`); render(); document.querySelector('#review-form select')?.focus(); }
    if (a === 'close-review') { review = null; render(); }
    if (a === 'purge') { if (b.dataset.confirm !== '1') { b.dataset.confirm = '1'; b.textContent = 'Click again to remove all sample learners'; return; } const r = await api('/api/admin/purge-demo', { method: 'POST' }); toast(`Removed ${r.removed} sample learners.`); await refresh(); }
    if (a === 'logout') { await api('/api/auth/logout', { method: 'POST' }); location.replace('/admin'); }
  } catch (x) { toast(x.message); }
});
boot();
})();
