// Browser verification of the authoring flow. Requires `npm i -D playwright`, `npm run preview` on port 4174
// and the stand-in GenieKreator AI gateway `node scripts/mock-anthropic.mjs 8787` (set MOCK_PORT to use another port).
// Run: node scripts/e2e-verify.mjs
// Expects a brief.txt fixture in the working directory (any text with a name, an email and a phone number).
import { chromium } from 'playwright';
const base = 'http://localhost:4174/';
const mode = 'llm';
const mockPort = process.env.MOCK_PORT || '8787';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 960 }, permissions: ['microphone'] });
await ctx.addInitScript((port) => { window.GENIE_AI = { gateway: `http://localhost:${port}` }; }, mockPort);
const page = await ctx.newPage();
const errors = []; const results = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 160)}`); });
const check = (name, ok, extra = '') => { results.push(`${ok ? 'PASS' : 'FAIL'} ${name} ${extra}`); };
const shot = (n) => page.screenshot({ path: `${mode}-${n}.png` });
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=All Your Products');
  // Empty draft cleanup
  await page.getByRole('button', { name: /Create New Assessment/ }).click(); await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Home', exact: true }).click(); await page.waitForTimeout(200);
  await page.getByRole('button', { name: /Create New Assessment/ }).click(); await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Home', exact: true }).click(); await page.waitForTimeout(300);
  check('no empty drafts left behind', (await page.locator('li.card', { hasText: 'Untitled' }).count()) === 0, `untitled=${await page.locator('li.card', { hasText: 'Untitled' }).count()}`);
  // Brief with typed PII
  await page.getByRole('button', { name: /Create New Assessment/ }).click(); await page.waitForTimeout(200);
  const brief = page.getByRole('textbox', { name: 'Brief' });
  await brief.fill('Store managers coach new colleagues and handle late deliveries. Priya Sharma (98200 12345) complained last week.');
  await page.waitForTimeout(200);
  check('typed brief PII banner', (await page.locator('text=Personal data in your brief').count()) > 0);
  await page.getByPlaceholder('Store managers, 1 to 2 years in role').fill('Store managers');
  check('propose blocked until anonymized', !(await page.getByRole('button', { name: 'Propose Skills' }).isEnabled()));
  await page.getByRole('button', { name: 'Anonymize the brief' }).click(); await page.waitForTimeout(200);
  const v = await brief.inputValue();
  check('brief anonymized', /\[Person\]/.test(v) && !/Priya/.test(v), v.slice(0, 80));
  await page.locator('input[type=file]').first().setInputFiles('brief.txt'); await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Confirm anonymization' }).click();
  await page.waitForSelector('text=Skills to measure', { timeout: 20000 });
  check('skills proposed automatically after document confirm', true); await page.waitForTimeout(300);
  for (const cb of await page.locator('input[type=checkbox]').all()) { if (!(await cb.isChecked())) await cb.check(); }
  await page.getByRole('button', { name: 'Build my assessment' }).click();
  await page.waitForSelector('text=What the participant sees', { timeout: 90000 }); await page.waitForTimeout(400);
  await shot('scenarios');
  const total = await page.locator('text=Estimated time').locator('..').textContent();
  results.push(`INFO plan strip: ${total.replace(/\s+/g, ' ').slice(0, 120)}`);
  const situation = await page.locator('.inline-edit').nth(2).textContent();
  results.push(`INFO first situation starts: ${situation.slice(0, 100)}`);
  if (mode === 'llm') check('scenario grounded in uploaded notes (mock)', /Ravi|refund|delivery/.test(situation));
  // Reload restores the open assessment
  await page.reload({ waitUntil: 'networkidle' }); await page.waitForTimeout(500);
  check('reload restores open assessment', (await page.locator('text=What the participant sees').count()) > 0);
  // Edit situation: analysis follows the edit
  await page.getByRole('button', { name: 'Edit situation' }).click();
  const ta = page.locator('textarea[aria-label="situation"]');
  await ta.fill('You manage a store. Ravi says his delivery is two weeks late and a refund was promised but never came. Two staff are absent and the weekend rota is unfilled, and head office wants complaints handled locally. Refunds above fifty need head office approval within two days, and the last two approvals took a week each. Other customers are waiting and the evening rush starts in twenty minutes. You have to decide what to say to Ravi and what to do about the refund and the rota, knowing the regional manager reads every escalation. The team is stretched and the courier, not your staff, caused the delay. Ravi does not care whose fault it is and wants an answer now.');
  await ta.press('Control+Enter');
  await page.waitForSelector('text=Confirm changes', { timeout: 15000 });
  const facts = await page.locator('div.faint:has-text("Key facts")').locator('..').textContent();
  check('analysis follows the edited text', /refund|two weeks late|approval/i.test(facts), facts.slice(0, 100));
  const bannerTitle = await page.locator('section.card h3').filter({ hasText: /situation changed|analysis re-ran/ }).first().textContent();
  results.push(`INFO banner: ${bannerTitle}`);
  await shot('reanalysis');
  await page.getByRole('button', { name: 'Confirm changes' }).click();
  // Undo history is small after typing
  // Approve all and publish
  const n = await page.locator('aside[aria-label="Scenario list"] ol li button').count();
  for (let i = 0; i < n; i++) { await page.locator('aside[aria-label="Scenario list"] ol li button').nth(i).click(); await page.waitForTimeout(100); const b = page.getByRole('button', { name: /^Mark approved/ }).first(); if (await b.count()) { await b.click(); await page.waitForTimeout(120); } }
  await page.locator('aside button.side-item:has-text("Publish")').click(); await page.waitForTimeout(400);
  await shot('publish');
  const gateRows = await page.locator('text=not yet approved').count();
  check('approval rows collapsed', gateRows <= 1);
  check('no demo review button', (await page.locator('text=(demo)').count()) === 0);
  const ep = page.locator('input[type=number]').first(); await ep.fill('120'); await ep.blur(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Show details' }).click().catch(() => {});
  await page.waitForTimeout(200);
  const calRows = await page.locator('text=would reach more than 50 participants').count();
  check('calibration block collapsed to one row', calRows === 1, `rows=${calRows}`);
  await ep.fill('30'); await ep.blur(); await page.waitForTimeout(300);
  const pub = page.getByRole('button', { name: /Publish version 1/ });
  check('publish enabled', await pub.isEnabled());
  await pub.click(); await page.getByRole('button', { name: 'Publish', exact: true }).click(); await page.waitForTimeout(400);
  // Published: inline edit refused
  await page.locator('aside button.side-item:has-text("Scenarios")').click(); await page.waitForTimeout(300);
  check('published: no inline edit affordance', (await page.getByRole('button', { name: 'Edit situation' }).count()) === 0);
  check('published: no approve or regenerate buttons', (await page.getByRole('button', { name: 'Regenerate scenario' }).count()) === 0);
  // Calibration flow as calibrator
  await page.getByRole('button', { name: 'Account menu' }).click(); await page.getByRole('menuitem', { name: 'Workspace settings' }).click(); await page.waitForTimeout(300);
  await page.getByRole('dialog').locator('select').filter({ hasText: 'Calibrator' }).selectOption('calibrator'); await page.waitForTimeout(200);
  await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click(); await page.waitForTimeout(200);
  await page.locator('aside button.side-item:has-text("Calibration")').click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Load 30 practice responses' }).click(); await page.waitForTimeout(300);
  await page.getByRole('button', { name: 'Score with AI' }).click(); await page.waitForTimeout(mode === 'llm' ? 8000 : 1500);
  // Enter ratings equal to expected levels for both calibrators (practice responses cycle 0..3)
  const rows = await page.locator('tbody tr').count();
  for (let r = 0; r < rows; r++) { const selects = page.locator('tbody tr').nth(r).locator('select'); const cnt = await selects.count(); for (let k = 0; k < cnt; k++) await selects.nth(k).selectOption(String(r % 4)); }
  await page.waitForTimeout(400);
  await shot('calibration');
  const humans = await page.locator('text=Humans').locator('..').allTextContents();
  results.push(`INFO agreement cells: ${humans.slice(0, 2).join(' | ')}`);
  const act = page.getByRole('button', { name: 'Activate AI scoring', exact: true });
  results.push(`INFO activate enabled: ${await act.isEnabled()}`);
  if (await act.isEnabled()) { await act.click(); await page.waitForTimeout(300); check('calibration activated', (await page.locator('text=complete').count()) > 0); }
  // Mobile drawer
  await page.setViewportSize({ width: 390, height: 844 }); await page.waitForTimeout(200);
  await page.getByRole('button', { name: 'Open assessment menu' }).click(); await page.waitForTimeout(200);
  check('mobile drawer shows settings', await page.getByRole('button', { name: 'Workspace settings' }).isVisible());
  await shot('mobile-drawer');
} catch (e) { errors.push(`script: ${e.message}`); await shot('99-error'); }
console.log(results.join('\n'));
console.log('ERRORS', JSON.stringify([...new Set(errors)], null, 2));
await browser.close();
