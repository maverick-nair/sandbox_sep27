// Browser smoke test of the whole authoring flow in scripted mode. Requires `npm i -D playwright` and a
// running `npm run preview`. Run: node scripts/e2e-flow.mjs
import { chromium } from 'playwright';
const base = 'http://localhost:4174/';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 950 }, permissions: ['microphone'] });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
const shot = async (n) => page.screenshot({ path: `${process.env.SHOT_DIR || '.'}/shot-${n}.png`, fullPage: false });
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  await shot('01-home');
  await page.getByRole('button', { name: 'New assessment' }).first().click();
  await page.getByLabel('Target role or audience').fill('First line managers in retail stores, 12 to 24 months in role');
  await page.getByRole('button', { name: 'Role readiness' }).click();
  await page.getByLabel('Situations').fill('Managers coach new team members through their first projects, give feedback after customer calls, delegate the weekly stock review, and decide which of five head office requests to do first when a colleague is out sick. They read the weekly sales dashboard to spot a store falling behind.');
  await page.getByLabel('Client terminology').fill('Northwind Retail, Store Connect');
  await shot('02-intent');
  await page.getByRole('button', { name: 'Continue to Skills' }).click();
  await page.waitForSelector('text=Confirm the Skills');
  await page.waitForTimeout(500);
  await shot('03-skills');
  const skillCount = await page.locator('li.card h3').count();
  console.log('skills proposed', skillCount);
  for (const cb of await page.locator('input[type=checkbox]').all()) { if (!(await cb.isChecked())) await cb.check(); }
  await page.getByRole('button', { name: 'Generate blueprint' }).click();
  await page.waitForSelector('text=Blueprint and time plan');
  await shot('04-blueprint');
  const rows = await page.locator('tbody tr').count();
  console.log('blueprint rows (incl skill headers)', rows);
  await page.getByRole('button', { name: 'Generate scenarios' }).click();
  await page.waitForSelector('text=What the participant sees', { timeout: 30000 });
  await shot('05-review');
  // Inline edit the situation to trigger re-analysis.
  await page.getByRole('button', { name: 'Edit situation' }).click();
  const ta = page.locator('textarea[aria-label="situation"]');
  const cur = await ta.inputValue();
  await ta.fill(cur + ' The regional director has also asked for an update by Friday.');
  await ta.press('Control+Enter');
  await page.waitForSelector('text=Confirm changes', { timeout: 10000 });
  await shot('06-pending');
  await page.getByRole('button', { name: 'Confirm changes' }).click();
  // Switch response type on this scenario and back.
  const typeButtons = page.locator('button[aria-pressed]').filter({ hasText: /^(Audio|Text|MCQ)$/ });
  const pressed = await page.locator('button[aria-pressed="true"]').filter({ hasText: /^(Audio|Text|MCQ)$/ }).first().textContent();
  console.log('current type', pressed);
  await typeButtons.filter({ hasText: pressed === 'MCQ' ? 'Text' : 'MCQ' }).click();
  await page.waitForTimeout(800);
  await shot('07-switched');
  // Regenerate with instruction (scripted substitution)
  await page.getByRole('button', { name: 'Regenerate scenario' }).click();
  await page.locator('textarea').last().fill('make this about a distributor, not a store');
  await page.getByRole('dialog').getByRole('button', { name: 'Regenerate', exact: true }).click();
  await page.waitForTimeout(800);
  // Approve all scenarios by iterating
  const n = await page.locator('aside ol li button').count();
  console.log('scenario count', n);
  for (let i = 0; i < n; i++) {
    await page.locator('aside ol li button').nth(i).click();
    await page.waitForTimeout(150);
    const btn = page.getByRole('button', { name: /^Mark approved/ }).first();
    if (await btn.count()) { await btn.click(); await page.waitForTimeout(200); }
  }
  await shot('08-approved');
  const approvedBadge = await page.locator('aside .card').first().textContent();
  console.log('approved badge', approvedBadge);
  // Preview
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.waitForSelector('text=Preview as a participant');
  await page.getByRole('button', { name: 'Start with a short practice' }).click();
  await page.getByRole('radio').first().click();
  await page.getByRole('button', { name: 'Begin the first situation' }).click();
  await page.waitForTimeout(300);
  await shot('09-scenario');
  // Answer every scenario
  for (let i = 0; i < 14; i++) {
    const done = await page.locator('text=That is every scenario').count();
    if (done) break;
    const ta2 = page.locator('textarea[aria-label="Your answer"]');
    const radios = page.getByRole('radio');
    const switchBtn = page.getByText('I cannot record: switch to text');
    if (await switchBtn.count()) { await switchBtn.click(); }
    if (await page.locator('textarea[aria-label="Your answer"]').count()) {
      await ta2.fill('I would first ask the person for their own view of what is holding things back and listen carefully before offering mine. Then I would name the specific behavior I observed and the effect it has had on the director and on the two colleagues who are waiting on the shared table. We would agree a concrete next step that they own, showing the current draft to the director by Thursday, and I would offer to join the first walkthrough without taking over. We would review on Friday how it went and what to change.');
      await page.getByRole('button', { name: 'Submit answer' }).click();
    } else if (await radios.count()) {
      const groups = await page.getByRole('radiogroup').count();
      for (let g = 0; g < groups; g++) await page.getByRole('radiogroup').nth(g).getByRole('radio').first().click();
      await page.getByRole('button', { name: 'Submit', exact: true }).click();
    }
    await page.waitForTimeout(150);
  }
  await page.getByRole('button', { name: /Show my report/ }).click();
  await page.waitForSelector('text=Your NanoAI result', { timeout: 15000 });
  await shot('10-report');
  const overall = await page.locator('.text-4xl').first().textContent();
  console.log('overall', overall);
  // Gate
  await page.getByRole('button', { name: 'Quality gate', exact: true }).first().click();
  await page.waitForSelector('h1:has-text("Quality gate")');
  await shot('11-gate');
  const gateText = await page.locator('p.text-sm').filter({ hasText: /block publish|Everything that must pass/ }).first().textContent();
  console.log('gate:', gateText);
  await page.getByRole('button', { name: 'Configure and publish', exact: true }).click();
  await page.waitForSelector('h1:has-text("Configure and publish")');
  await page.getByPlaceholder('Store manager readiness, Q4').fill('Store manager readiness Q4');
  await page.getByPlaceholder('Store manager readiness, Q4').blur();
  await shot('12-publish');
  const pub = page.getByRole('button', { name: /Publish version 1/ });
  console.log('publish enabled', await pub.isEnabled());
  if (await pub.isEnabled()) { await pub.click(); await page.getByRole('button', { name: 'Publish', exact: true }).click(); await page.waitForTimeout(500); await shot('13-published'); console.log('header', await page.locator('header').textContent()); }
  await page.getByRole('button', { name: 'Assessments' }).click();
  await page.waitForTimeout(300);
  await shot('14-home-after');
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.waitForTimeout(300);
  await shot('15-settings');
  // mobile preview of sample
  await page.getByRole('button', { name: 'Assessments' }).click();
  await page.getByRole('button', { name: 'Open sample' }).click();
  await page.waitForTimeout(400);
  await shot('16-sample');
} catch (e) { errors.push(`script: ${e.message}`); await shot('99-error'); }
console.log('ERRORS', JSON.stringify(errors, null, 2));
await browser.close();
