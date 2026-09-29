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
    masterTags: [{ name: "GenieTracker", group: "Platform" }, { name: "Nano AI", group: "Evaluate" }, { name: "AI Koach", group: "Enable" }],
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
  const go = async (as) => { await page.goto("https://app.test/?as=" + as); await page.waitForSelector("main:not(:has(.skeleton))"); };
  const shot = (n) => page.screenshot({ path: path.join(OUT, n + ".png"), fullPage: true });
  const tab = (name) => page.getByRole("tab", { name }).click();

  await page.goto("https://app.test/?as=owner");
  await page.evaluate((seed) => localStorage.setItem("mockdb", JSON.stringify(seed)), SEED);

  // Owner assigns two tasks
  await go("owner");
  await tab("Assign task");
  await page.getByRole("button", { name: "Assign task" }).click();
  await page.getByText("Pick a master task.").waitFor({ timeout: 3000 });
  const assign = async (master, sub, title, designer, target, effort) => {
    await page.getByRole("button", { name: master, exact: true }).click();
    await page.getByRole("button", { name: sub, exact: true }).click();
    await page.fill("#t-title", title);
    await page.selectOption("#t-project", "Project 1 (rename)");
    await page.selectOption("#t-designer", designer);
    await page.fill("#t-target", target);
    await page.fill("#t-effort", String(effort));
    await page.waitForTimeout(450);
    await page.getByRole("button", { name: "Assign task" }).click();
    await page.getByText(`Assigned to ${designer}`).waitFor();
  };
  const today = await page.evaluate(() => window.DTHMetrics.todayIso());
  const plus = (n) => page.evaluate(([t, n]) => window.DTHMetrics.addDays(t, n), [today, n]);
  await assign("GenieTracker", "Feature design", "Onboarding flow for admins", "Pragati", await plus(6), 16);
  await assign("Nano AI", "Wireframes", "Assessment builder", "Pragati", await plus(3), 10);
  await shot("01-owner-assign");
  await tab("All tasks");
  await page.getByText("Onboarding flow for admins").waitFor();
  await shot("02-owner-all");

  // A designer asks to join, the owner approves
  await go("u_des1");
  await page.getByText("Tell us who you are").waitFor();
  await page.selectOption("#claim-name", "Pragati");
  await page.getByRole("button", { name: "Send request" }).click();
  await page.getByText("Waiting for approval").waitFor();
  await go("owner");
  await tab("People");
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByText("can now use Design Task Hub").waitFor();

  // Designer posts a daily update and logs leave
  await go("u_des1");
  await page.getByText("Good ", { exact: false }).first().waitFor();
  const card = page.locator("article.task").first();
  await card.locator('input[type="number"]').fill("3.5");
  await card.locator('input[type="range"]').fill("40");
  await card.getByPlaceholder("For example: Finished").fill("Explored three layouts");
  await card.getByRole("button", { name: /Save today's update/ }).click();
  await page.getByText(/Update saved for T-00/).waitFor();
  await shot("03-designer-today");
  const card2 = page.locator("article.task").nth(1);
  await card2.getByRole("button", { name: "Blocked", exact: true }).click();
  await card2.getByRole("button", { name: /Save today's update/ }).click();
  await page.getByText("Say what is blocking").waitFor();
  await card2.getByPlaceholder("Waiting on copy").fill("Waiting on scoring rules from PM");
  await card2.getByRole("button", { name: /Save today's update/ }).click();
  await page.getByText(/Update saved for T-00/).waitFor();
  await tab("My leave");
  await page.fill("#l-from", await plus(8));
  await page.fill("#l-to", await plus(9));
  await page.getByRole("button", { name: "Add leave" }).click();
  await page.getByText("Leave added").waitFor();
  await shot("04-designer-leave");
  const tabsSeen = await page.getByRole("tab").allTextContents();
  if (tabsSeen.some((t) => /Dashboard|Lists|Export|People/.test(t))) throw new Error("designer sees owner tabs: " + tabsSeen);

  // Owner dashboard and export
  await go("owner");
  await tab("Dashboard");
  await shot("05-owner-dashboard");
  await tab("Export to Excel");
  await page.getByRole("button", { name: "Download Excel" }).click();
  await page.getByText(/^Saved "Product Designer Task Manager/).waitFor({ timeout: 20000 });
  const saved = await page.evaluate(() => window.__saved);
  fs.writeFileSync(path.join(OUT, "export.xlsx"), Buffer.from(saved.b64, "base64"));

  // Phone width, dark
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await go("u_des1");
  await shot("06-designer-phone-dark");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  if (overflow) errors.push("horizontal overflow at phone width");
  await go("owner");
  await tab("Dashboard");
  await shot("07-owner-dashboard-phone-dark");
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) errors.push("dashboard overflows at phone width");

  await browser.close();
  console.log(JSON.stringify({ out: OUT, errors, file: saved.filename }, null, 2));
  if (errors.length) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
