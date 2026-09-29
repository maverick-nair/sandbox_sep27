// Browser smoke test: runs dist/index.html in Chromium with a stand-in for
// the claude.ai runtime (db, user, downloads) and walks the owner, PM and
// designer flows end to end. Screenshots go to $DTH_TMP (or the OS temp dir).
//   node tests/ui.smoke.js
const path = require("path");
const fs = require("fs");
const os = require("os");
const { chromium } = require(process.env.PLAYWRIGHT_PATH || "playwright");

const ROOT = path.join(__dirname, "..");
const OUT = fs.mkdtempSync(path.join(process.env.DTH_TMP || os.tmpdir(), "dth-ui-"));
const html = fs.readFileSync(path.join(ROOT, "dist/index.html"), "utf8");
const page_html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light}body{margin:0;font:14px system-ui}[hidden]{display:none!important}</style></head><body>${html}</body></html>`;
const jszip = fs.readFileSync(require.resolve("jszip/dist/jszip.min.js"), "utf8");

// Mock runtime. The store lives in localStorage so "different people" can
// take turns on the same origin; ?as=<id> picks the viewer.
const MOCK = () => {
  const params = new URLSearchParams(location.search);
  const as = params.get("as") || "owner";
  const load = () => JSON.parse(localStorage.getItem("mockdb") || "{}");
  const save = (s) => localStorage.setItem("mockdb", JSON.stringify(s));
  const listeners = [];
  const notify = () => listeners.forEach((l) => l());
  let seq = 0;
  const snapDoc = (path, s) => ({ id: path.split("/").pop(), exists: path in s, data: () => s[path], metadata: {} });
  const docRef = (path) => ({
    id: path.split("/").pop(), path,
    get: async () => snapDoc(path, load()),
    set: async (d) => { const s = load(); s[path] = JSON.parse(JSON.stringify(d)); save(s); notify(); },
    update: async (d) => { const s = load(); if (!(path in s)) throw { code: "invalid_argument" }; s[path] = { ...s[path], ...JSON.parse(JSON.stringify(d)) }; save(s); notify(); },
    delete: async () => { const s = load(); delete s[path]; save(s); notify(); },
    onSnapshot: (next) => { const f = () => next(snapDoc(path, load())); listeners.push(f); setTimeout(f, 5); return () => {}; },
  });
  const colRef = (cpath) => ({
    path: cpath,
    doc: (id) => docRef(cpath + "/" + (id || "d" + Date.now().toString(36) + (seq++))),
    add: async (d) => { const r = docRef(cpath + "/d" + Date.now().toString(36) + (seq++)); await r.set(d); return r; },
    onSnapshot: (next) => {
      const f = () => { const s = load(); const docs = Object.keys(s).filter((k) => k.startsWith(cpath + "/") && k.split("/").length === cpath.split("/").length + 1).sort().map((k) => snapDoc(k, s)); next({ docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: {} }); };
      listeners.push(f); setTimeout(f, 5); return () => {};
    },
  });
  const people = { owner: ["Manu Nair", "manu.nair@knolskape.com"], u_pm1: ["Raghav K", "raghav@knolskape.com"], u_des1: ["Pragati S", "pragati@knolskape.com"],
    u_des2: ["Swathi R", "swathi@knolskape.com"], u_ext: ["Outside Person", "outsider@gmail.com"] };
  const prof = (i) => ({ id: i, name: (people[i] || [""])[0], avatarUrl: "", color: "#888", email: (people[i] || [])[1] || null, isMe: i === as, guest: false });
  const user = {
    me: async () => ({ ...prof(as), isOwner: as === "owner", canEdit: as === "owner" }),
    isOwner: async () => as === "owner", id: async () => as,
    profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, prof(i)])),
    search: async (q) => Object.keys(people).filter((i) => q && (people[i][0] + " " + people[i][1]).toLowerCase().includes(q.toLowerCase())).map(prof),
  };
  window.__saved = null;
  const downloads = { save: async ({ filename, data }) => { const b = new Uint8Array(await data.arrayBuffer()); window.__saved = { filename, b64: btoa(Array.from(b, (c) => String.fromCharCode(c)).join("")) }; return { status: "saved" }; } };
  window.claude = { use: async (n) => ({ db: { doc: docRef, collection: colRef }, user, downloads }[n] || null) };
};

const SEED = {
  "config/main": {
    designers: ["Pragati", "Swathi"],
    pms: ["Raghav", "SL", "Arun", "Naveen", "Manu"],
    projects: [{ name: "Project 1 (rename)", lead: "Raghav" }, { name: "Project 2 (rename)", lead: "SL" }],
    lines: [{ name: "Evaluate", products: ["Conversation AI", "Nano AI", "PitchPerfect AI"] }, { name: "Enable", products: ["AI Koach"] }],
    subTags: ["Feature design", "UX research", "Wireframes"],
    holidays: [], scoring: {},
  },
};

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.route("https://app.test/**", (r) => r.fulfill({ contentType: "text/html", body: page_html }));
  await ctx.route("https://cdnjs.cloudflare.com/**", (r) => r.fulfill({ contentType: "application/javascript", body: jszip }));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await ctx.addInitScript(MOCK);
  const page = await ctx.newPage();
  global.PAGE = page;
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true });
  const tab = (name) => page.getByRole("tab", { name }).click();

  const go = async (as, app) => { await page.goto(`https://app.test/?as=${as}#${app}`); await page.waitForSelector("main:not(:has(.skeleton))"); };
  const expectText = (t, timeout = 4000) => page.getByText(t).first().waitFor({ timeout });
  await page.goto("https://app.test/?as=boot");
  await page.evaluate((seed) => localStorage.setItem("mockdb", JSON.stringify(seed)), SEED);
  const today = await page.evaluate(() => window.DTHMetrics.todayIso());
  const plus = (n) => page.evaluate(([t, n]) => window.DTHMetrics.addDays(t, n), [today, n]);

  // Owner dashboard opens; three links on People & access
  await go("owner", "owner");
  await page.locator(".app-id b", { hasText: "Owner Dashboard" }).waitFor();
  await tab("People & access");
  await page.locator(".link-row").first().waitFor();
  if ((await page.locator(".link-row").count()) !== 3) throw new Error("expected three links; errors: " + errors.join(" / "));

  // Role based access: owner adds Pragati and Swathi by official ID
  for (const [q, nm] of [["pragati@", "Pragati"], ["swathi@", "Swathi"]]) {
    await page.fill("#add-q", q);
    await page.locator(".results button").first().click();
    await page.selectOption("#add-name", nm);
    await page.getByRole("button", { name: "Give access" }).click();
    await expectText("can now use Designer Tracker");
  }
  // An outside account is turned away; a PM requests access and is approved
  await go("u_ext", "pm");
  await expectText("Use your official ID");
  await go("u_pm1", "pm");
  await expectText("You don't have access to Task Creation yet");
  await page.selectOption("#join-name", "Raghav");
  await page.getByRole("button", { name: "Request access" }).click();
  await expectText("Waiting for approval");
  await go("owner", "owner");
  await tab(/People & access/);
  await page.getByRole("button", { name: "Approve" }).first().click();
  await expectText("can now use Task Creation");

  // Wrong interface is refused
  await go("u_des1", "pm");
  await expectText("Task Creation is for product managers");
  await go("u_pm1", "owner");
  await expectText("Owner Dashboard is for the owner");

  // PM builds a request with two subtasks
  await go("u_pm1", "pm");
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expectText("Choose the 4E line.");
  await page.selectOption("#r-line", "Evaluate");
  await page.selectOption("#r-product", "Nano AI");
  await page.fill("#r-project", "project 1");
  await page.getByRole("button", { name: "Project 1 (rename)", exact: true }).click();
  await expectText("Existing project. Lead PM: Raghav");
  if (await page.getByText("Designer availability").count()) throw new Error("PM form still shows designer availability");
  if (await page.locator(".subtask select").count() !== 1) throw new Error("PM subtask should only have the type dropdown");
  await page.fill("#r-title", "Assessment builder revamp");
  const st = page.locator(".subtask");
  const fillSub = async (i, type, detail, designer, s0, e0, hrs) => {
    const b = st.nth(i);
    await b.locator("select").nth(0).selectOption(type);
    await b.locator('textarea[id^="st-det-"]').fill(detail);
    await b.locator('input[type="date"]').nth(0).fill(s0);
    await b.locator('input[type="date"]').nth(1).fill(e0);
    await b.locator('input[id^="st-eff-"]').fill(String(hrs));
    await page.waitForTimeout(420);
  };
  await fillSub(0, "Feature design", "Question editor with drag to reorder, empty and error states", "Pragati", await plus(0), await plus(4), 14);
  await page.getByRole("button", { name: "Add subtask" }).click();
  await fillSub(1, "UX research", "Five interviews with assessment admins", "", await plus(5), await plus(9), 10);
  // a batch: 4 product demo videos, two named up front
  await page.getByRole("button", { name: "Add subtask" }).click();
  await fillSub(2, "Feature design", "Product demo videos for the builder", "", await plus(1), await plus(8), 24);
  await st.nth(2).locator('input[id^="st-qty-"]').fill("4");
  await page.waitForTimeout(420);
  await st.nth(2).locator('textarea[id^="st-titles-"]').fill("Intro to the builder\nSetting up questions");
  await expectText("(4 videos)");
  await shot("01-pm-form");
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expectText("Sent to the owner for approval");
  await expectText("Awaiting approval");
  await shot("02-pm-requests");

  // Nothing reaches the designer before approval
  await go("u_des1", "designer");
  await expectText("You're all caught up");

  // Owner reviews: must assign subtask 2, then approves
  await go("owner", "owner");
  await tab(/Task funnel/);
  await expectText("Assessment builder revamp");
  await shot("03-owner-funnel");
  await page.getByRole("button", { name: /Approve and create 3 tasks/ }).click();
  await expectText("Assign a designer.");
  await page.getByRole("button", { name: "Split", exact: true }).click();
  await expectText("Split share");
  const des = page.locator("article.req select");
  for (const [i, n] of [[0, "Pragati"], [1, "Swathi"], [2, "Pragati"], [3, "Swathi"]]) await des.nth(i).selectOption(n);
  await page.getByRole("button", { name: /Approve and create 4 tasks/ }).click();
  await expectText("Approved. 4 tasks added to the Tracker");

  // Second request goes back with changes, PM resubmits
  await go("u_pm1", "pm");
  await page.selectOption("#r-line", "Enable");
  await page.selectOption("#r-product", "AI Koach");
  await page.fill("#r-project", "Coach Nudges Pilot");
  await page.waitForTimeout(420);
  await expectText("It joins the project list when the owner approves");
  await page.fill("#r-title", "Coach nudges");
  await fillSub(0, "Wireframes", "Nudge cards on the home screen", "Pragati", await plus(2), await plus(6), 8);
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await expectText("Sent to the owner for approval");
  await go("owner", "owner");
  await tab(/Task funnel/);
  await page.getByRole("button", { name: "Request changes" }).click();
  await expectText("Tell the PM what to change.");
  await page.locator("article.req textarea").fill("Split the wireframes into mobile and desktop");
  await page.getByRole("button", { name: "Request changes" }).click();
  await expectText("Sent back to the PM");
  await go("u_pm1", "pm");
  await tab(/My requests/);
  await expectText("Split the wireframes into mobile and desktop");
  await page.getByRole("button", { name: "Edit and resubmit" }).click();
  await expectText("Owner's note:");
  await page.getByRole("button", { name: "Resubmit for approval" }).click();
  await expectText("Sent to the owner for approval");
  await go("owner", "owner");
  await tab(/Task funnel/);
  await expectText("Approving adds it to Lists & 4E with lead PM Raghav");
  await page.locator("article.req select").nth(0).selectOption("Pragati");
  await page.getByRole("button", { name: /Approve and create 1 task/ }).click();
  await expectText('added to projects');
  const projects = await page.evaluate(() => JSON.parse(localStorage.getItem("mockdb"))["config/main"].projects);
  if (!projects.some((p) => p.name === "Coach Nudges Pilot" && p.lead === "Raghav")) throw new Error("new project not added: " + JSON.stringify(projects));

  // Designer sees approved work and posts an update
  await go("u_des1", "designer");
  await expectText("Question editor with drag to reorder, empty and error states");
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
  await shot("04a-designer-batch");
  await batch.getByRole("button", { name: /Save today's update/ }).click();
  await expectText(/T-00\d marked done/);
  await shot("04-designer-tasks");
  await tab("My leave");
  await page.fill("#l-from", await plus(8));
  await page.fill("#l-to", await plus(9));
  await page.getByRole("button", { name: /Add leave/ }).click();
  await expectText("Leave added");
  const tabsSeen = await page.getByRole("tab").allTextContents();
  if (tabsSeen.some((t) => /Overview|funnel|Export|People|request/i.test(t))) throw new Error("designer sees other tabs: " + tabsSeen);

  // PM sees live progress on the approved request
  await go("u_pm1", "pm");
  await tab(/My requests/);
  await page.getByRole("button", { name: "All" }).click();
  await expectText("T-001");
  await expectText("40%");

  // Owner overview and export
  await go("owner", "owner");
  await shot("05-owner-overview");
  await tab("Export to Excel");
  await page.getByRole("button", { name: "Download Excel" }).click();
  await page.getByText(/^Saved "Product Designer Task Manager/).waitFor({ timeout: 20000 });
  const saved = await page.evaluate(() => window.__saved);
  fs.writeFileSync(path.join(OUT, "export.xlsx"), Buffer.from(saved.b64, "base64"));

  // Tablet width: icon rail
  await page.setViewportSize({ width: 1024, height: 800 });
  await go("owner", "owner");
  await shot("07a-owner-tablet");
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) errors.push("owner overflows at tablet width");

  // Phone width, dark
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  for (const [as, app, n] of [["u_pm1", "pm", "06-pm-phone-dark"], ["u_des1", "designer", "07-designer-phone-dark"], ["owner", "owner", "08-owner-phone-dark"]]) {
    await go(as, app);
    await shot(n);
    if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) errors.push(`${app} overflows at phone width`);
  }
  await browser.close();
  console.log(JSON.stringify({ out: OUT, errors, file: saved.filename }, null, 2));
  if (errors.length) process.exit(1);
})().catch(async (e) => { console.error(e); try { await global.PAGE.screenshot({ path: path.join(OUT, "fail.png"), fullPage: true }); console.error("screenshot:", path.join(OUT, "fail.png")); } catch (x) {} process.exit(1); });
