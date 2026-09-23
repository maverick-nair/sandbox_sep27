// WCAG 2.2 AA scan with axe-core over every screen and dialog, while exercising template and document prefill.
// Requires `npm i -D playwright axe-core`, `npm run preview` on port 4174 and `node scripts/mock-anthropic.mjs 8787`
// (set MOCK_PORT to use another port). Run: node scripts/a11y-scan.mjs
import { chromium } from 'playwright';
import fs from 'fs';
import { createRequire } from 'module';
const axe = fs.readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const base = 'http://localhost:4174/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, permissions: ['microphone'] });
await ctx.addInitScript((port) => { window.GENIE_AI = { gateway: `http://localhost:${port}` }; }, process.env.MOCK_PORT || '8787');
const page = await ctx.newPage();
const errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
const report = {};
async function scan(name) {
  await page.addScriptTag({ content: axe });
  const r = await page.evaluate(async () => { const res = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }); return res.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, tags: v.tags.filter((t) => /wcag/.test(t)), nodes: v.nodes.slice(0, 3).map((n) => ({ target: n.target.join(' '), html: n.html.slice(0, 140), summary: n.failureSummary?.slice(0, 200) })) })); });
  report[name] = r;
  await page.screenshot({ path: `gk-${name}.png` });
  console.log(`${name}: ${r.length} violation types`, r.map((v) => `${v.id}(${v.nodes.length})`).join(', '));
}
try {
  await page.goto(base, { waitUntil: 'networkidle' }); await page.waitForSelector('#products-heading');
  await scan('home');
  await page.getByRole('tab', { name: 'Educate' }).click(); await page.waitForTimeout(150); await scan('home-educate');
  await page.getByRole('tab', { name: 'Evaluate' }).click();
  await page.getByRole('button', { name: /Use a Template/ }).click(); await page.waitForTimeout(200); await scan('templates');
  await page.getByRole('button', { name: 'Use the Sales negotiation drill template' }).click(); await page.waitForTimeout(300);
  await scan('brief-template');
  const skills = await page.locator('section.card').nth(1).textContent();
  console.log('template prefilled skills present:', /Negotiation/.test(skills), '| name:', await page.locator('nav[aria-label=Breadcrumb]').textContent());
  await page.getByRole('button', { name: 'All your products' }).first().click(); await page.waitForTimeout(200);
  // New assessment via hero card, then upload a clean document to test prefill
  await page.getByRole('button', { name: /Create New Assessment/ }).click(); await page.waitForTimeout(200);
  fs.writeFileSync('clean-brief.txt', 'Programme outline for Northwind Retail store managers.\n\nStore managers at Northwind Retail handle escalations from customers when a delivery from Store Connect is late, and must decide whether to refund locally or escalate to head office while the queue builds and two colleagues are absent.\n\nStore managers delegate the weekly stock count to junior colleagues and often take it back after the first error, which leaves the count late and the team frustrated for a second week running.\n\nThis programme prepares store managers for promotion readiness conversations, so the assessment should show who is ready to step up into an area manager role.\n\nStore managers read the weekly Store Connect dashboard to spot a store falling behind on sales and decide which of several head office requests to complete first when the deadline is Friday.');
  await page.locator('input[type=file]').first().setInputFiles('clean-brief.txt');
  await page.waitForTimeout(1500);
  const confirmBtn = page.getByRole('button', { name: 'Confirm anonymization' }); if (await confirmBtn.count()) { console.log('NOTE: document went through PII confirmation'); await confirmBtn.click(); await page.waitForTimeout(1200); }
  const audience = await page.getByPlaceholder('Store managers, 1 to 2 years in role').inputValue();
  const purpose = await page.locator('select').first().inputValue();
  const brief = await page.getByRole('textbox', { name: 'Brief' }).inputValue();
  const terms = await page.getByPlaceholder('Northwind Retail, Store Connect').inputValue().catch(() => '(hidden)');
  const skillsNow = await page.locator('text=Skills to measure').count();
  console.log('PREFILL audience:', JSON.stringify(audience), '| purpose:', purpose, '| brief chars:', brief.length, '| terms:', terms, '| skills proposed:', skillsNow > 0);
  await scan('brief-prefilled');
  for (const cb of await page.locator('input[type=checkbox]').all()) { if (!(await cb.isChecked())) await cb.check(); }
  await page.getByRole('button', { name: 'Build my assessment' }).click();
  await page.waitForSelector('text=What the participant sees', { timeout: 90000 }); await page.waitForTimeout(400);
  await scan('scenarios');
  await page.getByRole('button', { name: 'Adjust plan' }).click(); await page.waitForTimeout(200); await scan('plan-dialog');
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).first().click();
  await page.getByRole('button', { name: 'Regenerate scenario' }).click(); await page.waitForTimeout(200); await scan('regen-dialog');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await page.locator('aside button.side-item:has-text("Preview")').click(); await page.waitForTimeout(300); await scan('preview-welcome');
  await page.getByRole('button', { name: 'Start with a short practice' }).click(); await page.getByRole('radio').first().click(); await page.getByRole('button', { name: 'Begin the first situation' }).click(); await page.waitForTimeout(300); await scan('preview-scenario');
  await page.locator('aside button.side-item:has-text("Publish")').click(); await page.waitForTimeout(300); await scan('publish');
  await page.getByRole('button', { name: 'Show details' }).click().catch(() => {}); await page.waitForTimeout(200); await scan('publish-details');
  await page.locator('aside button.side-item:has-text("Calibration")').click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Load 30 practice responses' }).click(); await page.waitForTimeout(300); await scan('calibration');
  await page.getByRole('button', { name: 'Account menu' }).click(); await page.waitForTimeout(150); await scan('account-menu');
  await page.getByRole('menuitem', { name: 'Workspace settings' }).click(); await page.waitForTimeout(300); await scan('settings-dialog');
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Account menu' }).click(); await page.getByRole('menuitem', { name: 'Help and support' }).click(); await page.waitForTimeout(200); await scan('help-dialog');
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Open assessment menu' }).click(); await page.waitForTimeout(200); await scan('mobile-drawer');
} catch (e) { errors.push(`script: ${e.message}`); await page.screenshot({ path: 'gk-99-error.png' }); }
fs.writeFileSync('a11y-report.json', JSON.stringify(report, null, 2));
const all = Object.values(report).flat();
console.log('TOTAL violation types across pages:', all.length);
const byId = {}; for (const v of all) byId[v.id] = (byId[v.id] || 0) + v.nodes.length; console.log(byId);
console.log('ERRORS', JSON.stringify([...new Set(errors)]));
await browser.close();
