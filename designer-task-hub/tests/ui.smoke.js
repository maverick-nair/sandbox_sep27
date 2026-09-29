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
  const people = { owner: "Manu Nair", u_pm1: "Raghav K", u_des1: "Pragati S" };
  const user = {
    me: async () => ({ id: as, name: people[as] || "New Person", avatarUrl: "", color: "#888", email: null, isOwner: as === "owner", canEdit: as === "owner" }),
    isOwner: async () => as === "owner", id: async () => as,
    profiles: async (ids) => Object.fromEntries(ids.map((i) => [i, { id: i, name: people[i] || "", avatarUrl: "", color: "#888", email: null, isMe: i === as, guest: false }])),
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
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true });
  const tab = (name) => page.getByRole("tab", { name }).click();

  const go = async (as, app) => { await page.goto(`https://app.test/?as=${as}#${app}`); await page.waitForSelector("main:not(:has(.skeleton))"); };
  const expectText = (t, timeout = 4000) => page.getByText(t).first().waitFor({ timeout });
  await page.goto("https://app.test/?as=owner");
  await page.evaluate((seed) => localStorage.setItem("mockdb", JSON.stringify(seed)), SEED);
  const today = await page.evaluate(() => window.DTHMetrics.todayIso());
  const plus = (n) => page.evaluate(([t, n]) => window.DTHMetrics.addDays(t, n), [today, n]);

  // Owner dashboard opens; three links on People & links
  await go("owner", "owner");
  await page.locator(".brand b", { hasText: "Owner Dashboard" }).waitFor();
  await tab("People & links");
  if ((await page.locator(".link-row").count()) !== 3) throw new Error("expected three links");

  // A PM and a designer join through their own links; owner approves
  await go("u_pm1", "pm");
  await expectText("Join Task Creation");
  await page.selectOption("#join-name", "Raghav");
  await page.getByRole("button", { name: "Send request" }).click();
  await expectText("Waiting for approval");
  await go("u_des1", "designer");
  await expectText("Join Designer Tracker");
  await page.selectOption("#join-name", "Pragati");
  await page.getByRole("button", { name: "Send request" }).click();
  await expectText("Waiting for approval");
  await go("owner", "owner");
  await tab("People & links");
  await page.getByRole("button", { name: "Approve" }).first().click();
  await expectText("can now use");
  await page.getByRole("button", { name: "Approve" }).first().click();
  await page.waitForFunction(() => document.querySelectorAll("button").length && ![...document.querySelectorAll("button")].some((b) => b.textContent === "Approve"));

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
  await page.selectOption("#r-project", "Project 1 (rename)");
  await page.fill("#r-title", "Assessment builder revamp");
  const st = page.locator(".subtask");
  const fillSub = async (i, type, detail, designer, s0, e0, hrs) => {
    const b = st.nth(i);
    await b.locator("select").nth(0).selectOption(type);
    await b.locator("select").nth(1).selectOption(designer);
    await b.locator("textarea").fill(detail);
    await b.locator('input[type="date"]').nth(0).fill(s0);
    await b.locator('input[type="date"]').nth(1).fill(e0);
    await b.locator('input[type="number"]').fill(String(hrs));
    await page.waitForTimeout(420);
  };
  await fillSub(0, "Feature design", "Question editor with drag to reorder, empty and error states", "Pragati", await plus(0), await plus(4), 14);
  await page.getByRole("button", { name: "Add subtask" }).click();
  await fillSub(1, "UX research", "Five interviews with assessment admins", "", await plus(5), await plus(9), 10);
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
  await page.getByRole("button", { name: /Approve and create 2 tasks/ }).click();
  await expectText("Assign a designer.");
  await page.locator("article.req select").nth(1).selectOption("Swathi");
  await page.getByRole("button", { name: /Approve and create 2 tasks/ }).click();
  await expectText("Approved. 2 tasks added to the Tracker");

  // Second request goes back with changes, PM resubmits
  await go("u_pm1", "pm");
  await page.selectOption("#r-line", "Enable");
  await page.selectOption("#r-product", "AI Koach");
  await page.selectOption("#r-project", "Project 2 (rename)");
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

  // Designer sees approved work and posts an update
  await go("u_des1", "designer");
  await expectText("Question editor with drag to reorder, empty and error states");
  const card = page.locator("article.task").first();
  await card.locator('input[type="number"]').fill("3.5");
  await card.locator('input[type="range"]').fill("40");
  await card.getByPlaceholder("For example: Finished").fill("Explored three layouts");
  await card.getByRole("button", { name: /Save today's update/ }).click();
  await expectText(/Update saved for T-00/);
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
})().catch((e) => { console.error(e); process.exit(1); });
