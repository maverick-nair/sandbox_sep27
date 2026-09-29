// Browser smoke test for the standalone build: serves dist-web/index.html in
// Chromium with tests/mock-platform.js in place of the Firebase adapter, then
// walks sign up, email confirmation, invitations and roles, sign in and out,
// password reset and change, the idle sign-out, and the owner, PM and designer
// flows end to end. It also checks that every interface keeps the same page
// margins at desktop, tablet and phone widths. Screenshots go to $DTH_TMP (or
// the OS temp dir).
//   npm run build && node tests/ui.smoke.js
const path = require("path");
const fs = require("fs");
const os = require("os");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");

const ROOT = path.join(__dirname, "..");
const OUT = fs.mkdtempSync(path.join(process.env.DTH_TMP || os.tmpdir(), "dth-ui-"));
const html = fs.readFileSync(path.join(ROOT, "dist-web/index.html"), "utf8");
const mock = fs.readFileSync(path.join(__dirname, "mock-platform.js"), "utf8");
const jszip = fs.readFileSync(require.resolve("jszip/dist/jszip.min.js"), "utf8");
const config = `window.DTH_CONFIG = ${JSON.stringify({ firebase: {}, ownerEmail: "manu.nair@knolskape.com", allowedDomain: "knolskape.com" })};`;
const js = (body) => (r) => r.fulfill({ contentType: "application/javascript", body });

const OWNER = "manu.nair@knolskape.com";
const PW = "Design#Hub2026";

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route("https://app.test/**", (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === "/platform.js") return js(mock)(r);
    if (u.pathname === "/firebase-config.js") return js(config)(r);
    return r.fulfill({ contentType: "text/html", body: html });
  });
  await ctx.route("https://www.gstatic.com/firebasejs/**", js(""));
  await ctx.route("https://cdnjs.cloudflare.com/**", js(jszip));
  if (!process.env.FONTS) await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  global.PAGE = page;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const shot = async (n) => {
    const junk = await page.evaluate(() => (document.body.innerText.match(/\b(null|undefined|NaN)\b/) || [])[0]);
    if (junk) errors.push(`"${junk}" shown on screen in ${n}`);
    await page.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true });
  };
  const tab = (name) => page.getByRole("tab", { name }).click();
  const expectText = (t, timeout = 4000) => page.getByText(t).first().waitFor({ timeout });
  const fail = (m) => { throw new Error(m + (errors.length ? "; page errors: " + errors.join(" / ") : "")); };
  let n = 0;
  const open = async (app) => { await page.goto(`https://app.test/?r=${n++}#${app}`); await page.waitForSelector("main:not(:has(.skeleton))"); };
  // Switch person without the sign-in form (the form itself is covered below)
  const as = async (email, app) => {
    await page.evaluate((e) => { localStorage.removeItem("mockcur"); localStorage.removeItem("dth-keep"); sessionStorage.setItem("mockcur", e); }, email);
    await open(app);
  };
  const signUp = async (app, name, email, pw = PW) => {
    await page.evaluate(() => { sessionStorage.removeItem("mockcur"); localStorage.removeItem("mockcur"); });
    await open(app);
    await page.getByRole("button", { name: "Create your account" }).click();
    await page.fill("#a-name", name); await page.fill("#a-email", email); await page.fill("#a-pw", pw); await page.fill("#a-pw2", pw);
    await page.click("#signup-submit");
    await expectText("Check your inbox");
    await page.evaluate((e) => window.__verifyEmail(e), email);
    await page.click("#verify-done");
  };
  const signOutViaMenu = async () => { await page.locator(".acct-btn").click(); await page.getByRole("menuitem", { name: "Sign out" }).click(); };
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  // Page margins: every top-level block in main shares one left and right edge
  const margins = () => page.evaluate(() => {
    const main = document.getElementById("main");
    const kids = [...main.children].filter((el) => el.offsetParent && el.getBoundingClientRect().width > 0);
    const r = main.getBoundingClientRect();
    return { left: [...new Set(kids.map((k) => Math.round(k.getBoundingClientRect().left - r.left)))], right: [...new Set(kids.map((k) => Math.round(r.right - k.getBoundingClientRect().right)))] };
  });
  await page.goto("https://app.test/?r=boot");
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });

  // ---------------------------------------------------------- sign up and verify
  await open("owner");
  await expectText("Sign in to Owner Dashboard");
  await shot("00-signin");
  await page.getByRole("button", { name: "Create your account" }).click();
  await page.fill("#a-name", "Manu Nair");
  await page.fill("#a-email", "manu@gmail.com");
  await page.fill("#a-pw", PW); await page.fill("#a-pw2", PW);
  await page.click("#signup-submit");
  await expectText("Use your official @knolskape.com email.");
  await page.fill("#a-email", OWNER);
  await page.fill("#a-pw", "short1"); await page.fill("#a-pw2", "short1");
  await page.click("#signup-submit");
  await expectText("Choose a stronger password");
  await page.fill("#a-pw", PW); await page.fill("#a-pw2", PW + "x");
  await page.click("#signup-submit");
  await expectText("The two passwords don't match.");
  await page.fill("#a-pw2", PW);
  await shot("00a-signup");
  await page.click("#signup-submit");
  await expectText("Check your inbox");
  await page.click("#verify-done");
  await expectText("Not confirmed yet");
  await page.evaluate((e) => window.__verifyEmail(e), OWNER);
  await page.click("#verify-done");
  await page.locator(".app-id b", { hasText: "Owner Dashboard" }).waitFor();
  const conf = await page.evaluate(() => JSON.parse(localStorage.getItem("mockdb"))["config/main"]);
  if (!conf || conf.lines.length !== 4 || !conf.lines[1].products.includes("AI Microlearn")) fail("starter lists not written: " + JSON.stringify(conf));

  // ---------------------------------------------------------- invitations with a role dropdown
  await tab(/People & access/);
  await page.locator(".link-row").first().waitFor();
  if ((await page.locator(".link-row").count()) !== 3) fail("expected three links");
  await page.fill("#add-email", "friend@gmail.com");
  await page.selectOption("#add-name", "Pragati");
  await page.getByRole("button", { name: "Invite", exact: true }).click();
  await expectText("Only official @knolskape.com emails can be invited.");
  for (const [email, role, name] of [["pragati@knolskape.com", "designer", "Pragati"], ["swathi@knolskape.com", "designer", "Swathi"], ["raghav@knolskape.com", "pm", "Raghav"]]) {
    await page.fill("#add-email", email);
    await page.selectOption("#add-role", role);
    await page.selectOption("#add-name", name);
    await page.getByRole("button", { name: "Invite", exact: true }).click();
    await expectText(`${email} is invited.`);
  }
  await expectText("Product manager \"Raghav\"");
  await shot("01-owner-people");

  // ---------------------------------------------------------- sign out with unsaved changes
  await page.fill("#add-email", "half-typed@knolskape.com");
  await signOutViaMenu();
  await expectText("Sign out with unsaved changes?");
  await page.getByRole("button", { name: "Stay signed in" }).click();
  await signOutViaMenu();
  await page.getByRole("button", { name: "Sign out anyway" }).click();
  await expectText("You're signed out. Nothing you typed was kept on this device.");
  const sess = await page.evaluate(() => JSON.parse(localStorage.getItem("mockdb"))["sessions/u_manunair"]);
  if (!sess || !sess.lastSignOut || !sess.lastSignIn) fail("sign in and out not recorded: " + JSON.stringify(sess));

  // ---------------------------------------------------------- wrong password, reset, keep me signed in
  await page.fill("#a-email", OWNER); await page.fill("#a-pw", "Wrong#Password1");
  await page.click("#signin-submit");
  await expectText("That email and password don't match.");
  if (await page.inputValue("#a-pw")) fail("password field kept after a failed sign in");
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.fill("#a-email", "nobody@knolskape.com");
  await page.click("#reset-submit");
  await expectText("If an account exists for nobody@knolskape.com, a reset link is on its way.");
  await shot("00b-reset");
  await page.getByRole("button", { name: "Back to sign in" }).click();
  await page.fill("#a-email", OWNER); await page.fill("#a-pw", PW);
  await page.check("#keep");
  await page.click("#signin-submit");
  await page.locator(".app-id b", { hasText: "Owner Dashboard" }).waitFor();
  if (await page.evaluate(() => localStorage.getItem("dth-keep")) !== "1") fail("keep me signed in not stored");
  if (await page.evaluate(() => localStorage.getItem("mockcur")) !== OWNER) fail("kept session not in local storage");
  await open("owner");
  await page.locator(".app-id b", { hasText: "Owner Dashboard" }).waitFor();
  await signOutViaMenu();
  await expectText("You're signed out.");
  if (await page.evaluate(() => localStorage.getItem("dth-keep") || localStorage.getItem("mockcur"))) fail("sign out left the session on the device");

  // ---------------------------------------------------------- invitees join into their own interface
  await signUp("designer", "Pragati S", "pragati@knolskape.com");
  await page.locator(".app-id b", { hasText: "Designer Tracker" }).waitFor();
  await expectText("You're all caught up");
  await signUp("designer", "Swathi R", "swathi@knolskape.com");
  await page.locator(".app-id b", { hasText: "Designer Tracker" }).waitFor();
  await signUp("pm", "Raghav K", "raghav@knolskape.com");
  await page.locator(".app-id b", { hasText: "Task Creation" }).waitFor();
  const db0 = await page.evaluate(() => JSON.parse(localStorage.getItem("mockdb")));
  if (db0["members/u_raghav"].role !== "pm" || db0["members/u_raghav"].name !== "Raghav") fail("PM member not created from invite");
  if (Object.keys(db0).some((k) => k.startsWith("invites/"))) fail("invitations not used up");
  // Wrong interface is refused
  await open("owner");
  await expectText("Owner Dashboard is for the owner");
  await as("pragati@knolskape.com", "pm");
  await expectText("Task Creation is for product managers");

  // Not invited: request access, owner approves, later removes
  await signUp("pm", "Arun M", "arun@knolskape.com");
  await expectText("Request access");
  await page.selectOption("#join-role", "pm");
  await page.selectOption("#join-name", "Arun");
  await page.getByRole("button", { name: "Request access" }).click();
  await expectText("Waiting for approval");
  await as(OWNER, "owner");
  await tab(/People & access/);
  await page.getByRole("button", { name: "Approve" }).first().click();
  await expectText("can now use Task Creation");
  // Role dropdown in Members: Swathi to PM and back
  await page.selectOption("#role-u_swathi", "pm");
  await expectText("Access updated");
  if (await page.evaluate(() => JSON.parse(localStorage.getItem("mockdb"))["members/u_swathi"].role) !== "pm") fail("role change not saved");
  await page.selectOption("#role-u_swathi", "designer");
  await page.waitForTimeout(300);
  await page.selectOption("#rname-u_swathi", "Swathi");
  await page.waitForTimeout(300);
  await expectText("Role changed");
  const row = page.locator("tr", { hasText: "arun@knolskape.com" });
  await row.getByRole("button", { name: "Remove access" }).click();
  await row.getByRole("button", { name: "Remove", exact: true }).click();
  await expectText("Access removed");
  await shot("01a-owner-members");
  await as("arun@knolskape.com", "pm");
  await expectText("Request access");

  // Account settings: change password, then sign in with it
  await as("raghav@knolskape.com", "pm");
  await page.locator(".acct-btn").click();
  await page.getByRole("menuitem", { name: "Account settings" }).click();
  await page.fill("#acc-cur", "Not#MyPassword1"); await page.fill("#acc-new", "New#Password2026"); await page.fill("#acc-new2", "New#Password2026");
  await page.locator("form.modal").getByRole("button", { name: "Save" }).click();
  await expectText("Your current password isn't right.");
  await page.fill("#acc-cur", PW);
  await page.locator("form.modal").getByRole("button", { name: "Save" }).click();
  await page.locator("form.modal").getByText("Saved.").waitFor();
  await page.keyboard.press("Escape");
  await signOutViaMenu();
  await page.fill("#a-email", "raghav@knolskape.com"); await page.fill("#a-pw", "New#Password2026");
  await page.click("#signin-submit");
  await page.locator(".app-id b", { hasText: "Task Creation" }).waitFor();

  const today = await page.evaluate(() => window.DTHMetrics.todayIso());
  const plus = (k) => page.evaluate(([t, k]) => window.DTHMetrics.addDays(t, k), [today, k]);

  // ---------------------------------------------------------- PM builds a request
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expectText("Choose the 4E line.");
  await page.selectOption("#r-line", "Evaluate");
  await page.selectOption("#r-product", "Nano AI");
  await page.fill("#r-project", "project 1");
  await page.getByRole("button", { name: "Project 1 (rename)", exact: true }).click();
  await expectText("Existing project. Lead PM: Raghav");
  if (await page.getByText("Designer availability").count()) fail("PM form still shows designer availability");
  if (await page.locator(".subtask select").count() !== 1) fail("PM subtask should only have the type dropdown");
  await page.fill("#r-title", "Assessment builder revamp");
  const st = page.locator(".subtask");
  const fillSub = async (i, type, detail, s0, e0, hrs) => {
    const b = st.nth(i);
    await b.locator("select").nth(0).selectOption(type);
    await b.locator('textarea[id^="st-det-"]').fill(detail);
    await b.locator('input[type="date"]').nth(0).fill(s0);
    await b.locator('input[type="date"]').nth(1).fill(e0);
    await b.locator('input[id^="st-eff-"]').fill(String(hrs));
    await page.waitForTimeout(420);
  };
  await fillSub(0, "Feature design", "Question editor with drag to reorder, empty and error states", await plus(0), await plus(4), 14);
  await page.getByRole("button", { name: "Add subtask" }).click();
  await fillSub(1, "UX research", "Five interviews with assessment admins", await plus(5), await plus(9), 10);
  await page.getByRole("button", { name: "Add subtask" }).click();
  await fillSub(2, "Product demo video", "Product demo videos for the builder", await plus(1), await plus(8), 24);
  await st.nth(2).locator('input[id^="st-qty-"]').fill("4");
  await page.waitForTimeout(420);
  await st.nth(2).locator('textarea[id^="st-titles-"]').fill("Intro to the builder\nSetting up questions");
  await expectText("(4 videos)");
  await shot("02-pm-form");
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expectText("Sent to the owner for approval");
  await expectText("Awaiting approval");
  await shot("03-pm-requests");

  await as("pragati@knolskape.com", "designer");
  await expectText("You're all caught up");

  // ---------------------------------------------------------- owner approves with a split batch
  await as(OWNER, "owner");
  await tab(/Task funnel/);
  await expectText("Assessment builder revamp");
  await shot("04-owner-funnel");
  await page.getByRole("button", { name: /Approve and create 3 tasks/ }).click();
  await expectText("Assign a designer.");
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expectText("Split share");
  const des = page.locator("article.req select");
  for (const [i, nm] of [[0, "Pragati"], [1, "Swathi"], [2, "Pragati"], [3, "Swathi"]]) await des.nth(i).selectOption(nm);
  await page.getByRole("button", { name: /Approve and create 4 tasks/ }).click();
  await expectText("Approved. 4 tasks added to the Tracker");

  // Second request goes back with changes, PM resubmits, new project added on approval
  await as("raghav@knolskape.com", "pm");
  await page.selectOption("#r-line", "Enable");
  await page.selectOption("#r-product", "AI Koach");
  await page.fill("#r-project", "Coach Nudges Pilot");
  await page.waitForTimeout(420);
  await expectText("It joins the project list when the owner approves");
  await page.fill("#r-title", "Coach nudges");
  await fillSub(0, "Wireframes", "Nudge cards on the home screen", await plus(2), await plus(6), 8);
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expectText("Sent to the owner for approval");
  await as(OWNER, "owner");
  await tab(/Task funnel/);
  await page.getByRole("button", { name: "Request changes" }).click();
  await expectText("Tell the PM what to change.");
  await page.locator("article.req textarea").fill("Split the wireframes into mobile and desktop");
  await page.getByRole("button", { name: "Request changes" }).click();
  await expectText("Sent back to the PM");
  await as("raghav@knolskape.com", "pm");
  await tab(/My requests/);
  await expectText("Split the wireframes into mobile and desktop");
  await page.getByRole("button", { name: "Edit and resubmit" }).click();
  await expectText("Owner's note:");
  await page.getByRole("button", { name: "Resubmit for approval" }).click();
  await expectText("Sent to the owner for approval");
  await as(OWNER, "owner");
  await tab(/Task funnel/);
  await expectText("Approving adds it to Lists & 4E with lead PM Raghav");
  await page.locator("article.req select").nth(0).selectOption("Pragati");
  await page.getByRole("button", { name: /Approve and create 1 task/ }).click();
  await expectText("added to projects");
  const projects = await page.evaluate(() => JSON.parse(localStorage.getItem("mockdb"))["config/main"].projects);
  if (!projects.some((p) => p.name === "Coach Nudges Pilot" && p.lead === "Raghav")) fail("new project not added: " + JSON.stringify(projects));

  // ---------------------------------------------------------- designer updates and batch checklist
  await as("pragati@knolskape.com", "designer");
  await expectText("Question editor with drag to reorder, empty and error states");
  if (await page.getByText("Five interviews with assessment admins").count()) fail("designer sees another designer's task");
  const card = page.locator("article.task", { hasText: "Question editor" });
  await card.locator('input[type="number"]').fill("3.5");
  await card.locator('input[type="range"]').fill("40");
  await card.getByPlaceholder("For example: Finished").fill("Explored three layouts");
  await card.getByRole("button", { name: /Save today's update/ }).click();
  await expectText(/Update saved for T-00/);
  const batch = page.locator("article.task", { hasText: "Product demo videos" });
  await batch.getByText("0 of 2 videos done").waitFor();
  await batch.getByRole("button", { name: "Done", exact: true }).click();
  await batch.getByRole("button", { name: /Save today's update/ }).click();
  await expectText("are not done yet");
  await batch.locator(".item select").nth(0).selectOption("Done");
  await batch.locator(".item select").nth(1).selectOption("Done");
  await batch.locator('input[id^="it-l-"]').first().fill("https://example.com/intro.mp4");
  await batch.locator('input[id^="hrs-"]').fill("5");
  await shot("05a-designer-batch");
  await batch.getByRole("button", { name: /Save today's update/ }).click();
  await expectText(/T-00\d marked done/);
  await shot("05-designer-tasks");
  await tab("My leave");
  await page.fill("#l-from", await plus(8));
  await page.fill("#l-to", await plus(9));
  await page.getByRole("button", { name: /Add leave/ }).click();
  await expectText("Leave added");
  const tabsSeen = await page.getByRole("tab").allTextContents();
  if (tabsSeen.some((t) => /Overview|funnel|Export|People|request/i.test(t))) fail("designer sees other tabs: " + tabsSeen);

  await as("raghav@knolskape.com", "pm");
  await tab(/My requests/);
  await page.getByRole("button", { name: "All" }).click();
  await expectText("T-001");
  await expectText("40%");

  // ---------------------------------------------------------- owner overview and export
  await as(OWNER, "owner");
  await shot("06-owner-overview");
  await tab("Export to Excel");
  await page.getByRole("button", { name: "Download Excel" }).click();
  await page.getByText(/^Saved "Product Designer Task Manager/).waitFor({ timeout: 20000 });
  const saved = await page.evaluate(() => window.__saved);
  fs.writeFileSync(path.join(OUT, "export.xlsx"), Buffer.from(saved.b64, "base64"));

  // ---------------------------------------------------------- margins and overflow at three widths
  const people = [["raghav@knolskape.com", "pm", ["new", "mine"]], ["pragati@knolskape.com", "designer", ["tasks", "leave"]],
    [OWNER, "owner", ["overview", "funnel", "tasks", "people", "lists", "export"]]];
  const report = {};
  for (const [w, h, dark] of [[1280, 900, false], [1024, 800, false], [390, 844, true]]) {
    await page.setViewportSize({ width: w, height: h });
    await page.emulateMedia({ colorScheme: dark ? "dark" : "light" });
    const seen = new Set();
    for (const [email, app, tabs] of people) {
      await as(email, app);
      for (const t of tabs) {
        const btn = page.locator(`[data-tab="${t}"]:visible`).first();
        if (await btn.count()) { await btn.click(); await page.waitForTimeout(120); }
        const m = await margins();
        if (m.left.length !== 1 || m.right.length !== 1) errors.push(`${app}/${t} at ${w}px: blocks do not share one edge ${JSON.stringify(m)}`);
        seen.add(`${m.left[0]}|${m.right[0]}`);
        report[`${w}:${app}/${t}`] = m;
        if (await overflow()) errors.push(`${app}/${t} overflows at ${w}px`);
      }
      await shot(`07-${app}-${w}${dark ? "-dark" : ""}`);
    }
    if (seen.size !== 1) errors.push(`margins differ between interfaces at ${w}px: ${[...seen].join(", ")}`);
    // Sign-in page at this width
    await page.evaluate(() => { sessionStorage.removeItem("mockcur"); localStorage.removeItem("mockcur"); });
    await open("pm");
    await expectText("Sign in to Task Creation");
    if (await overflow()) errors.push(`sign-in overflows at ${w}px`);
    await shot(`08-signin-${w}${dark ? "-dark" : ""}`);
  }
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 1280, height: 900 });

  // ---------------------------------------------------------- idle sign-out after 30 minutes
  await page.clock.install();
  await as("pragati@knolskape.com", "designer");
  await page.clock.fastForward("29:00");
  await expectText("You'll be signed out in 2 minutes");
  await page.clock.fastForward("02:00");
  await expectText("You were signed out after 30 minutes of inactivity.");

  await browser.close();
  console.log(JSON.stringify({ out: OUT, errors, file: saved.filename, margins: report["1280:owner/overview"] }, null, 2));
  if (errors.length) process.exit(1);
})().catch(async (e) => { console.error(e); try { await global.PAGE.screenshot({ path: path.join(OUT, "fail.png"), fullPage: true }); console.error("screenshot:", path.join(OUT, "fail.png")); } catch (x) {} process.exit(1); });
