'use strict';
// End-to-end browser test with Playwright plus an axe-core accessibility audit of every screen.
// Runs the real server (scripted mode unless ANTHROPIC_API_KEY is set) on a temp database with the demo cohort.
const { execSync, spawn } = require('node:child_process');
const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
const { chromium } = require(execSync('npm root -g').toString().trim() + '/playwright');
const ROOT = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-e2e-'));
const env = { ...process.env, DATA_FILE: path.join(dir, 'e2e.db'), PORT: '18181', ADMIN_EMAIL: 'admin@knolskape.test', ADMIN_PASSWORD: 'admin-password-123', ANTHROPIC_API_KEY: process.env.E2E_ANTHROPIC_API_KEY || '' };
const out = []; const ok = (n, c, x = '') => out.push((c ? 'PASS ' : 'FAIL ') + n + (x ? ' :: ' + x : ''));
const axeSrc = fs.readFileSync(path.join(ROOT, 'node_modules/axe-core/axe.min.js'), 'utf8');
const shots = path.join(ROOT, 'tests', 'out'); fs.mkdirSync(shots, { recursive: true });

async function audit(p, name) {
  await p.evaluate(axeSrc);
  const r = await p.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa'] })).violations.map(v => ({ id: v.id, impact: v.impact, n: v.nodes.length, sample: v.nodes[0]?.target?.join(' ') })));
  const bad = r.filter(v => ['serious', 'critical'].includes(v.impact));
  ok(`a11y (${name}): no serious or critical WCAG 2.1 AA issues`, bad.length === 0, bad.map(v => `${v.id} x${v.n} @ ${v.sample}`).join('; '));
  return r;
}
(async () => {
  execSync('node --disable-warning=ExperimentalWarning scripts/seed-demo.js', { cwd: ROOT, env, stdio: 'ignore' });
  const srv = spawn('node', ['--disable-warning=ExperimentalWarning', 'server/index.js'], { cwd: ROOT, env, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
  const B = 'http://127.0.0.1:18181';
  const b = await chromium.launch();
  try {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage();
    const errors = []; p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_CERT|status of 40[01]/.test(m.text())) errors.push(m.text()); });
    await p.goto(B); await p.waitForSelector('#join-form'); await audit(p, 'join');
    await p.fill('#j-code', 'LP-DEMO0001'); await p.fill('#j-name', 'Asha PM'); await p.fill('#j-email', 'asha@client.com'); await p.fill('#j-pw', 'short'); await p.click('#join-form button[type=submit]');
    await p.waitForSelector('.err'); ok('join: weak password shows an error', (await p.textContent('.err')).includes('10 characters'));
    await p.fill('#j-code', 'LP-DEMO0001'); await p.fill('#j-name', 'Asha PM'); await p.fill('#j-email', 'asha@client.com'); await p.fill('#j-pw', 'a-long-password'); await p.click('#join-form button[type=submit]');
    await p.waitForSelector('#onb-form'); await audit(p, 'onboarding');
    await p.check('input[name=vis][value=name]'); await p.click('#onb-form button[type=submit]');
    await p.waitForSelector('[data-action=start]'); await audit(p, 'brief');
    ok('brief: focus moves to the heading', await p.evaluate(() => document.activeElement?.tagName === 'H1'));
    await p.click('[data-action=start]'); await p.waitForSelector('#composer');
    const msgs = ['Thanks Priya. What is Meridian actually trying to achieve, and how will they measure success?', 'Why two weeks specifically? Is there a renewal date behind the timeline?', 'Which languages do their RMs coach and sell in?', "I can't promise 98% or say it replaces managers. I propose a 3-week pilot with 200 new RMs in English and Hindi, managers in the loop, measured on ramp time."];
    for (let i = 0; i < msgs.length; i++) {
      if (i === 3) { const ev = await p.$('[data-action=evidence][data-fid=f3]'); if (ev) await ev.click(); }
      const pre = await p.inputValue('#composer'); await p.fill('#composer', pre + msgs[i]); await p.click('[data-action=send]');
      await p.waitForFunction(n => document.querySelectorAll('.msg.learner').length >= n && !document.querySelector('.typing'), i + 1, { timeout: 90000 });
    }
    await audit(p, 'conversation'); await p.screenshot({ path: path.join(shots, 'sim.png') });
    ok('conversation: facts unlocked through questions', (await p.textContent('.evidence')).includes('Renewal is in 6 weeks'));
    await p.click('[data-action=to-decide]'); await audit(p, 'decision');
    await p.check('input[name=decision][value=b]'); await p.fill('#rationale', 'A pilot on ramp time protects the renewal, tests Hindi quality early and keeps managers in the loop.');
    await p.click('[data-action=submit]'); await p.waitForSelector('#bigscore-n', { timeout: 120000 }); await p.waitForTimeout(1200);
    const score = Number(await p.textContent('#bigscore-n')); ok('result: server-scored attempt shown', score >= 70, 'score=' + score);
    await audit(p, 'result'); await p.screenshot({ path: path.join(shots, 'result.png') });
    await p.click('#nav-home'); await p.waitForSelector('.path'); await audit(p, 'path home'); await p.screenshot({ path: path.join(shots, 'home.png'), fullPage: true });
    await p.fill('#spark', 'I would not claim bias-free. We test for bias across learner groups each release and can share the results.'); await p.click('[data-action=spark]'); await p.waitForSelector('.spark .chip.gold.num', { timeout: 90000 });
    ok('spark: scored once for today', (await p.textContent('.spark')).includes('/ 10'));
    await p.click('#nav-board'); await p.waitForSelector('table'); await audit(p, 'league');
    const lg = await p.textContent('table'); ok('league: shows the sample cohort and you by name', lg.includes('Sample') && lg.includes('Asha PM'));
    await p.check('input[name=bvis][value=private]'); await p.waitForTimeout(400);
    await p.click('#nav-progress'); await p.waitForSelector('.radar'); await audit(p, 'profile');
    ok('no console or CSP errors during play', errors.length === 0, errors.join(' | '));
    for (const w of [360, 390]) {
      await p.setViewportSize({ width: w, height: 800 });
      for (const v of ['home', 'board', 'progress']) { await p.click('#nav-' + v); await p.waitForTimeout(250); const sw = await p.evaluate(() => document.documentElement.scrollWidth); ok(`mobile ${w}px ${v}: no sideways scroll`, sw <= w, 'scrollWidth=' + sw); }
    }
    // Facilitator
    const a = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
    await a.goto(B + '/admin'); await a.waitForSelector('#login'); await audit(a, 'facilitator sign-in');
    await a.fill('#e', 'admin@knolskape.test'); await a.fill('#p', 'admin-password-123'); await a.click('#login button');
    await a.waitForSelector('#new-cohort'); await a.fill('#cname', 'Meridian Bank PMs'); await a.click('#new-cohort button'); await a.waitForTimeout(500);
    ok('facilitator: cohort created with an invite code', /LP-[0-9A-F]{8}/.test(await a.textContent('table')));
    await a.evaluate(() => { const btns = [...document.querySelectorAll('[data-a=open]')]; btns[btns.length - 1].click(); }); await a.waitForTimeout(400);
    ok('facilitator: demo cohort learners listed', (await a.textContent('#app')).includes('Asha PM'));
    await audit(a, 'facilitator dashboard'); await a.screenshot({ path: path.join(shots, 'admin.png'), fullPage: true });
  } catch (e) { ok('e2e run completed', false, e.message.split('\n')[0]); }
  finally { await b.close(); srv.kill(); }
  console.log(out.join('\n')); const fails = out.filter(x => x.startsWith('FAIL')).length; console.log(`\n${out.length - fails} passed, ${fails} failed`); process.exit(fails ? 1 : 0);
})();
