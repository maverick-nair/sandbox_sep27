/* Design Task Hub: three interfaces on one shared store.
 *   #pm        Task Creation      (product managers)   requests -> funnel
 *   #designer  Designer Tracker   (product designers)  daily progress, weekly leave
 *   #owner     Owner Dashboard    (the owner only)     funnel approval, dashboard, export
 * Store layout (see README): config/main, members/{uid}, invites/{email}, claims/{uid},
 * requests/{uid}/items/*, tasks/*, progress/{uid}/tasks/*, leave/{uid}, leave/{uid}/items/*
 */
(function () {
"use strict";
const M = window.DTHMetrics, X = window.DTHExport;
const P = window.DTHPlatform;
const CFG = (P && P.config) || window.DTH_CONFIG || {};
const baseUrl = () => location.origin + location.pathname;
const APPS = {
  pm: { name: "Task Creation", who: "product managers", role: "pm" },
  designer: { name: "Designer Tracker", who: "product designers", role: "designer" },
  owner: { name: "Owner Dashboard", who: "the owner", role: "admin" },
};
const STATUSES = ["Not Started", "In Progress", "In Review", "Blocked", "Done"];
const PRIORITIES = ["High", "Medium", "Low"];
const LEAVE_TYPES = ["Planned Leave", "Sick Leave", "Comp-off", "Other"];
const SERIES = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)"];
const DELIVERY = { "Done On Time": "good", "Done Late": "serious", "On Track": "info", "Scheduled": "neutral", "Overdue": "critical", "Blocked": "warn", "Not Scheduled": "neutral" };
const DELIVERY_COLOR = { "Done On Time": "var(--good)", "Done Late": "var(--serious)", "On Track": "var(--s1)", "Scheduled": "#86b6ef", "Overdue": "var(--critical)", "Blocked": "var(--warn)", "Not Scheduled": "var(--faint)" };
const WL = { "Overloaded": "critical", "Balanced": "good", "Under-utilised": "info", "On leave / holiday": "neutral" };
const UNITS = ["items", "videos", "product demos", "project overviews", "screens", "banners", "illustrations", "slides", "animations"];
const qtyOf = (x) => Math.max(1, Math.floor(Number(x && x.qty) || 1));
const unitLabel = (x) => `${qtyOf(x)} ${qtyOf(x) === 1 ? String(x.unit || "item").replace(/s$/, "") : x.unit || "items"}`;
const REQ = { draft: ["Draft", "neutral"], pending: ["Awaiting approval", "warn"], changes: ["Changes requested", "serious"], approved: ["Approved", "good"], rejected: ["Rejected", "critical"] };

// ------------------------------------------------------------------ state
const S = {
  ready: false, noDb: false,
  me: { id: null, name: "", email: "", avatarUrl: "", isOwner: false, emailVerified: false },
  config: null, people: {}, myMember: null, memberLoaded: false, coreStarted: false,
  claims: {}, myClaim: undefined, invites: {}, authView: "signin", auth: null, platformError: null,
  tasksRaw: [], progress: {}, leaveItems: {}, leaveDocs: {}, requests: {},
  tab: { owner: "overview", pm: "new", designer: "tasks" },
  form: null, joinForm: null, review: {}, drafts: {}, edit: null, confirm: null,
  filters: { q: "", designer: "", project: "", stage: "" }, funnelTab: "pending", pmFilter: "active",
  period: "month", custom: { from: "", to: "" }, actingDesigner: "", showDone: false,
  cfgDraft: null, exportOpts: { designerCopy: false, from: "", to: "" }, template: null, exportMsg: null,
  profiles: {}, toast: null, busy: {}, sessions: {}, auditLog: null, session: null, signedOutReason: "", keep: false, menu: false, confirmSignOut: false,
};
let db = null;
const subs = new Map();

// ---------------------------------------------------------------- helpers
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "value") el.value = v;
    else if (k === "checked") el.checked = !!v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
function svg(tag, attrs, ...kids) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v);
  for (const kid of kids.flat(Infinity)) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}
const today = () => M.todayIso();
const nowIso = () => new Date().toISOString();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
function fmtDate(iso, withDay) {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  const yr = String(y) !== today().slice(0, 4) ? ` ${y}` : "";
  const base = `${d} ${MONTHS[m - 1]}${yr}`;
  return withDay ? `${DAYS[M.isoWeekday(M.toDay(iso.slice(0, 10))) - 1]} ${base}` : base;
}
function fmtWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d)) return "";
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const local = M.todayIso(d);
  return (local === today() ? "Today" : local === M.addDays(today(), -1) ? "Yesterday" : fmtDate(local)) + ", " + t;
}
const fmt1 = (v) => (v === null || v === undefined || v === "" ? "-" : (Math.round(Number(v) * 10) / 10).toLocaleString());
const fmt0 = (v) => (v === null || v === undefined || v === "" ? "-" : Math.round(Number(v)).toLocaleString());
const pct = (v) => (v === null || v === undefined || v === "" ? "-" : Math.round(Number(v) * 100) + "%");
const clone = (x) => JSON.parse(JSON.stringify(x));
const EMPTY_CFG = { designers: [], pms: [], projects: [], lines: [], subTags: [], holidays: [], scoring: {} };
const cfg = () => S.config || EMPTY_CFG;
// Written once when the owner first signs in to a new deployment (names from the workbook's Settings sheet)
const STARTER_CFG = {
  designers: ["Pragati", "Swathi"], pms: ["Raghav", "SL", "Arun", "Naveen", "Manu"],
  projects: [1, 2, 3, 4, 5].map((i) => ({ name: `Project ${i} (rename)`, lead: ["Raghav", "SL", "Arun", "Naveen", "Manu"][i - 1] })),
  lines: [{ name: "Evaluate", products: ["Conversation AI", "Nano AI", "PitchPerfect AI"] }, { name: "Educate", products: ["AI Microlearn", "Interactive Learn"] },
    { name: "Experience", products: ["Simulations", "AI RolePlay"] }, { name: "Enable", products: ["AI Koach"] }],
  subTags: ["Feature design", "UX research", "Wireframes", "Prototype", "Visual design", "Design QA", "Product demo video", "Explainer video"],
  holidays: [], scoring: {},
};
function pill(text, kind) { return h("span", { class: "pill " + (kind || "neutral") }, text); }
function deliveryPill(t) { return t.delivery ? pill(t.delivery, DELIVERY[t.delivery]) : null; }
function reqPill(status) { const r = REQ[status] || REQ.draft; return pill(r[0], r[1]); }
function kpi(v, l, color) { return h("div", { class: "card kpi" }, h("div", { class: "v", style: color ? `color:${color}` : null }, v), h("div", { class: "l" }, l)); }
function toast(msg) { S.toast = msg; render(); clearTimeout(toast.t); toast.t = setTimeout(() => { S.toast = null; render(); }, 3200); }
function designerColor(name) { const i = cfg().designers.indexOf(name); return i >= 0 ? SERIES[i % SERIES.length] : "var(--faint)"; }
function workdays(a, b) { if (!a || !b || b < a) return null; const c = M.context(cfg()); return M.networkDays(a, b, c.s, c.holidays); }
function workdaysLeft(t) {
  if (!t.target || t.actualEnd) return "";
  const td = today();
  if (td > t.target) return `${workdays(M.addDays(t.target, 1), td)} working days overdue`;
  const n = workdays(td, t.target);
  return n <= 1 ? "Due today" : `${n} working days left`;
}
async function guard(key, fn) {
  if (S.busy[key]) return;
  S.busy[key] = true; render();
  try { await fn(); }
  catch (e) {
    const code = e && e.code;
    toast(code === "invalid_argument" ? "You don't have permission to save that. Ask the owner to check your access."
      : code === "quota_exceeded" ? "The store is full. Ask the owner to export and clear old records."
      : "Could not save. Check your connection and try again.");
    console.error(e);
  } finally { S.busy[key] = false; render(); }
}
function field(label, id, control, err, hint) {
  return h("div", { class: "field" }, h("label", { for: id }, label), control, hint ? h("div", { class: "hint" }, hint) : null, err ? h("div", { class: "err" }, err) : null);
}
function select(id, value, options, onchange, placeholder) {
  return h("select", { id, onchange: (e) => onchange(e.target.value) },
    placeholder !== undefined ? h("option", { value: "" }, placeholder) : null,
    options.map((o) => { const v = typeof o === "string" ? o : o.value; const l = typeof o === "string" ? o : o.label; return h("option", { value: v, selected: v === value }, l); }));
}
function copyText(text) {
  const done = () => toast("Link copied");
  try { navigator.clipboard.writeText(text).then(done, () => toast("Select the link and copy it")); } catch (e) { toast("Select the link and copy it"); }
}

// ---------------------------------------------------------------- data
const lines = () => cfg().lines || [];
const productsFor = (line) => ((lines().find((l) => l.name === line) || {}).products || []);
const lineOf = (product) => ((lines().find((l) => (l.products || []).includes(product)) || {}).name || "");
function allProgress() { return Object.values(S.progress).flat(); }
function allRequests() {
  const out = [];
  for (const [uid, list] of Object.entries(S.requests)) for (const r of list) out.push({ ...r, uid });
  const submitted = out.filter((r) => r.submittedAt).sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : 1));
  submitted.forEach((r, i) => { r.ref = "R-" + String(i + 1).padStart(3, "0"); });
  return out;
}
function allLeave() {
  const out = [];
  for (const [uid, list] of Object.entries(S.leaveItems)) for (const l of list) out.push({ ...l, uid });
  return out;
}
function checkinFor(name, monday) {
  for (const d of Object.values(S.leaveDocs)) {
    const w = d && d.byDesigner && d.byDesigner[name];
    if (w && w[monday]) return w[monday];
  }
  return null;
}
let memo = { key: null, value: [] };
function tasks() {
  const key = [S.tasksRaw, S.progress, S.config, S.requests];
  if (memo.key && memo.key.every((k, i) => k === key[i])) return memo.value;
  const refs = new Map(allRequests().map((r) => [r.id, r.ref]));
  const merged = M.mergeProgress(S.tasksRaw, allProgress()).map((t) => ({ ...t, requestRef: refs.get(t.requestId) || "" }));
  memo = { key, value: M.deriveAll(merged, cfg(), today()) };
  return memo.value;
}
function ownerUid() { return Object.keys(S.people).find((id) => S.people[id].role === "owner") || null; }
function uidsWithRole(role) { return Object.entries(S.people).filter(([, p]) => p.role === role).map(([id]) => id); }
function progressUids() {
  const set = new Set(uidsWithRole("designer"));
  const owner = ownerUid();
  if (owner) set.add(owner);
  if (S.me.id) set.add(S.me.id);
  return [...set];
}
function sub(key, make) {
  if (subs.has(key)) return;
  try { subs.set(key, make()); } catch (e) { console.error(e); }
}
function syncSubs() {
  if (!db) return;
  const want = new Set();
  for (const uid of progressUids()) {
    want.add("p:" + uid); want.add("li:" + uid); want.add("ld:" + uid);
    sub("p:" + uid, () => db.collection(`progress/${uid}/tasks`).onSnapshot((q) => { S.progress = { ...S.progress, [uid]: q.docs.map((d) => ({ id: d.id, ...d.data() })) }; render(); }, onErr));
    sub("li:" + uid, () => db.collection(`leave/${uid}/items`).onSnapshot((q) => { S.leaveItems = { ...S.leaveItems, [uid]: q.docs.map((d) => ({ id: d.id, ...d.data() })) }; render(); }, onErr));
    sub("ld:" + uid, () => db.doc(`leave/${uid}`).onSnapshot((s) => { S.leaveDocs = { ...S.leaveDocs, [uid]: s.exists ? s.data() : null }; render(); }, onErr));
  }
  if (S.me.isOwner) {
    want.add("audit");
    sub("audit", () => db.doc("audit/log").onSnapshot((d) => { S.auditLog = d.exists ? d.data() : null; render(); }, onErr));
    for (const uid of Object.keys(S.people)) {
      want.add("s:" + uid);
      sub("s:" + uid, () => db.doc(`sessions/${uid}`).onSnapshot((d) => { S.sessions = { ...S.sessions, [uid]: d.exists ? d.data() : null }; render(); }, onErr));
    }
  }
  const reqUids = S.me.isOwner ? [...new Set(uidsWithRole("pm").concat(S.me.id ? [S.me.id] : []))] : (S.me.id ? [S.me.id] : []);
  for (const uid of reqUids) {
    want.add("r:" + uid);
    sub("r:" + uid, () => db.collection(`requests/${uid}/items`).onSnapshot((q) => { S.requests = { ...S.requests, [uid]: q.docs.map((d) => ({ id: d.id, ...d.data() })) }; render(); }, onErr));
  }
  for (const [k, un] of subs) if (/^(p|li|ld|r|s):/.test(k) && !want.has(k)) { try { un(); } catch (e) {} subs.delete(k); }
}
function onErr(e) { console.error(e); }

// ---------------------------------------------------------------- roles
function roleOf() {
  const p = S.people[S.me.id] || S.myMember;
  if (!p) return null;
  return p.role === "owner" ? "admin" : p.role;
}
function rosterName() { const p = S.people[S.me.id]; return p ? p.name : ""; }
function homeApp() { const r = roleOf(); return r === "admin" ? "owner" : r === "pm" ? "pm" : r === "designer" ? "designer" : null; }
function currentApp() { const h0 = (location.hash || "").slice(1); return APPS[h0] ? h0 : homeApp(); }
function allowed(app) { const r = roleOf(); return r === "admin" || (app === "pm" && r === "pm") || (app === "designer" && r === "designer"); }
function designerName() { return roleOf() === "admin" ? (S.actingDesigner || cfg().designers[0] || "") : rosterName(); }
function pmName() {
  if (roleOf() !== "admin") return rosterName();
  if (S.form && S.form.asPm) return S.form.asPm;
  const first = (S.me.name || "").split(" ")[0].toLowerCase();
  return cfg().pms.find((p) => p.toLowerCase() === first) || cfg().pms[0] || "";
}
// Simple stroke icons (24px grid)
const ICONS = {
  overview: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  funnel: "M3 5h18l-7 8v6l-4-2v-4z",
  list: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01",
  designers: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17 11l2 2 4-4",
  calendar: "M4 5h16v16H4zM16 3v4M8 3v4M4 10h16",
  people: "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  sliders: "M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  plus: "M12 5v14M5 12h14",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z",
  check: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.3-4.3",
  bell: "M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0",
  pen: "M12 20h9M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4z",
  compass: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM16.2 7.8l-2.1 6.3-6.3 2.1 2.1-6.3z",
  layers: "M12 2 2 7l10 5 10-5zM2 17l10 5 10-5M2 12l10 5 10-5",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 6v6l4 2",
  "user-plus": "M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6",
  chart: "M3 3v18h18M7 14l4-4 4 4 5-6",
  key: "M21 2l-2 2m-7.6 7.6a5.5 5.5 0 1 1-7.8 7.8 5.5 5.5 0 0 1 7.8-7.8zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4",
};
function icon(name) {
  return svg("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "1.9", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" },
    svg("path", { d: ICONS[name] || ICONS.list }));
}
const APP_ICON = { pm: "pen", designer: "layers", owner: "compass" };
// [id, label, count, icon, group]
function tabsFor(app) {
  if (app === "owner") {
    const pending = allRequests().filter((r) => r.status === "pending").length;
    return [["overview", "Overview", 0, "overview", "Workspace"], ["funnel", "Task funnel", pending, "funnel", "Workspace"], ["tasks", "All tasks", 0, "list", "Workspace"],
      ["designers", "Designers", 0, "designers", "Workspace"], ["leave", "Leave & holidays", 0, "calendar", "Workspace"],
      ["people", "People & access", Object.keys(S.claims).length, "people", "Setup"], ["lists", "Lists & 4E", 0, "sliders", "Setup"], ["export", "Export to Excel", 0, "download", "Setup"]];
  }
  if (app === "pm") {
    const back = allRequests().filter((r) => r.status === "changes").length;
    return [["new", S.form && S.form.id ? "Edit request" : "New request", 0, "plus", "Requests"], ["mine", "My requests", back, "inbox", "Requests"]];
  }
  if (app === "designer") {
    const open = tasks().filter((t) => t.designer === designerName() && !t.actualEnd).length;
    return [["tasks", "My tasks", open, "check", "My work"], ["leave", "My leave", 0, "calendar", "My work"]];
  }
  return [];
}
function alerts(app) {
  if (app === "owner") { const n = allRequests().filter((r) => r.status === "pending").length + Object.keys(S.claims).length;
    return { n, label: `${n} waiting for you`, go: () => { S.tab.owner = Object.keys(S.claims).length && !allRequests().some((r) => r.status === "pending") ? "people" : "funnel"; S.funnelTab = "pending"; } }; }
  if (app === "pm") { const n = allRequests().filter((r) => r.uid === S.me.id && r.status === "changes").length; return { n, label: `${n} sent back to you`, go: () => { S.tab.pm = "mine"; } }; }
  if (app === "designer") { const td = today(); const n = tasks().filter((t) => t.designer === designerName() && !t.actualEnd && t.start && t.start <= td && !(t.updates || []).some((u) => u.d === td)).length;
    return { n, label: `${n} task${n === 1 ? "" : "s"} not updated today`, go: () => { S.tab.designer = "tasks"; } }; }
  return { n: 0, label: "", go: () => {} };
}
const ROLE_OPTIONS = [{ value: "designer", label: "Product designer" }, { value: "pm", label: "Product manager" }];
const ROLE_NAME = { pm: "Product manager", designer: "Product designer", admin: "Owner" };
const DOCK_LABEL = { overview: "Overview", funnel: "Funnel", tasks: "Tasks", designers: "Designers", leave: "Leave", people: "People", lists: "Lists", export: "Export", new: "New", mine: "Requests" };
const SEARCH_HINT = { owner: "Search tasks, products, IDs", pm: "Search my requests", designer: "Search my tasks" };

// ---------------------------------------------------------------- session
// Accounts live in the platform (Firebase Authentication): email + password,
// verified email, reset by email link. The database rules enforce each role on
// the server. This section adds the session behaviour around it: "keep me
// signed in", a 30 minute idle sign-out on shared devices, a sign-in history,
// and clearing anything typed when someone signs out.
const IDLE_MS = 30 * 60 * 1000, WARN_MS = 2 * 60 * 1000;
const KEEP_KEY = "dth-keep";
function keepFlag() { try { return window.localStorage.getItem(KEEP_KEY) === "1"; } catch (e) { return false; } }
function setKeepFlag(v) { try { if (v) window.localStorage.setItem(KEEP_KEY, "1"); else window.localStorage.removeItem(KEEP_KEY); } catch (e) {} }
let lastActivity = Date.now(), warned = false;
function touch() {
  lastActivity = Date.now();
  if (warned) { warned = false; S.toast = null; render(); }
}
["pointerdown", "keydown", "wheel", "touchstart"].forEach((ev) => document.addEventListener(ev, touch, { passive: true }));
setInterval(() => {
  if (!S.me.id || keepFlag()) return;
  const idle = Date.now() - lastActivity;
  if (idle > IDLE_MS) signOut("idle");
  else if (idle > IDLE_MS - WARN_MS && !warned) { warned = true; S.toast = "You'll be signed out in 2 minutes for inactivity. Move the mouse or press a key to stay signed in."; render(); }
}, 20000);
async function recordSession(kind) {
  if (!db || !S.me.id) return;
  const ref = db.doc(`sessions/${S.me.id}`);
  try {
    const cur = await ref.get();
    const prev = cur.exists ? cur.data() : {};
    const at = nowIso();
    const events = (prev.events || []).concat([{ at, kind, app: currentApp() || "" }]).slice(-20);
    await ref.set({ ...prev, email: S.me.email, events, [kind === "sign-in" ? "lastSignIn" : "lastSignOut"]: at });
  } catch (e) { console.error(e); }
}
function hasUnsaved() {
  const f = S.form;
  const pmDirty = f && (f.masterTitle || f.project || (f.subtasks || []).some((x) => x.detail || x.sub || x.effort));
  const desDirty = Object.values(S.drafts || {}).some((d) => d.note || d.hours);
  return !!(pmDirty || desDirty || S.cfgDraft || (S.addForm && (S.addForm.email || "").trim()));
}
function clearLocalState() {
  S.form = null; S.drafts = {}; S.review = {}; S.addForm = null; S.cfgDraft = null; S.edit = null; S.search = ""; S.joinForm = null; S.leaveForm = null;
  S.menu = false; S.confirmSignOut = false; S.accountForm = null; S.toast = null; warned = false;
}
async function signOut(reason) {
  if (!S.me.id) return;
  await recordSession("sign-out");
  clearLocalState();
  S.signedOutReason = reason || "signed-out";
  S.authView = "signin";
  setKeepFlag(false);
  try { await P.auth.signOut(); } catch (e) { console.error(e); }
  render(); window.scrollTo(0, 0);
}
function requestSignOut() {
  if (hasUnsaved()) { S.confirmSignOut = true; S.menu = false; render(); return; }
  signOut("signed-out");
}

// ---------------------------------------------------------------- render
let raf = 0;
function render() { cancelAnimationFrame(raf); raf = requestAnimationFrame(paint); }
let softT = 0;
function softRender() { clearTimeout(softT); softT = setTimeout(render, 350); }
function paint() {
  const a = document.activeElement;
  const focusId = a && a.id ? a.id : null;
  let sel = null;
  try { sel = focusId && a.selectionStart != null ? [a.selectionStart, a.selectionEnd] : null; } catch (e) { sel = null; }
  const scrollY = window.scrollY;
  const app = currentApp();
  document.body.dataset.app = app || "owner";
  document.body.classList.toggle("auth", S.ready && (!S.me.id || !S.me.emailVerified || (S.memberLoaded && !roleOf())));
  document.title = app ? APPS[app].name : "Design Task Hub";
  paintHeader(app);
  const next = h("main", { id: "main" });
  if (!S.ready) next.appendChild(h("div", { class: "skeleton" }, "Loading"));
  else body(next, app);
  if (S.toast) next.appendChild(h("div", { class: "toast", role: "status" }, S.toast));
  document.getElementById("main").replaceWith(next);
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) { el.focus({ preventScroll: true }); if (sel) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) {} }
  }
  window.scrollTo(0, scrollY);
}
function go(app, id) { S.tab[app] = id; S.confirm = null; if (app === "owner") S.edit = null; render(); window.scrollTo(0, 0); }
function paintHeader(app) {
  const role = roleOf();
  const ok = S.ready && S.me.id && app && role && allowed(app);
  const list = ok ? tabsFor(app) : [];
  if (list.length && !list.find((t) => t[0] === S.tab[app])) S.tab[app] = list[0][0];
  const cur = list.find((t) => t[0] === S.tab[app]);
  document.getElementById("brand").replaceChildren(h("div", { class: "app-id" },
    h("b", null, app ? APPS[app].name : "Design Task Hub"), cur ? h("span", { class: "crumb" }, "/ " + cur[1]) : null));
  const tabs = document.getElementById("tabs");
  tabs.replaceChildren();
  let group = null;
  for (const [id, label, count, ic, grp] of list) {
    if (grp !== group) { group = grp; tabs.appendChild(h("div", { class: "nav-group", role: "presentation", "aria-label": grp })); }
    tabs.appendChild(h("button", { class: "tab", role: "tab", "data-tab": id, "aria-selected": String(S.tab[app] === id), title: label, "aria-label": label, onclick: () => go(app, id) },
      icon(ic), h("span", { class: "label" }, DOCK_LABEL[id] || label), count ? h("span", { class: "count" }, String(count)) : null));
  }
  const dock = document.getElementById("dock");
  dock.replaceChildren(...list.map(([id, label, count, ic]) => h("button", { "data-tab": id, "aria-current": S.tab[app] === id ? "page" : null, "aria-label": label, onclick: () => go(app, id) },
    icon(ic), h("span", null, DOCK_LABEL[id] || label), count ? h("span", { class: "count" }, String(count)) : null)));
  dock.hidden = !list.length;
  const name = role === "admin" ? (S.me.name || "Owner") : rosterName() || S.me.name || "";
  const roleLabel = role ? ROLE_NAME[role] : S.me.email || "";
  document.getElementById("who").replaceChildren(
    S.me.id && role ? h("div", { class: "me", title: `${name}, ${roleLabel}` }, avatar(S.me.avatarUrl, name, "avatar")) : null,
    S.me.id && role ? h("button", { class: "tab signout", title: "Sign out", onclick: requestSignOut }, icon("logout"), h("span", { class: "label" }, "Sign out")) : null);
  const al = ok ? alerts(app) : { n: 0 };
  document.getElementById("tools").replaceChildren(
    ok ? h("label", { class: "search" }, h("input", { id: "top-search", type: "search", placeholder: SEARCH_HINT[app], "aria-label": SEARCH_HINT[app], value: S.search || "",
      oninput: (e) => { S.search = e.target.value; if (app === "owner") { S.filters.q = S.search; S.tab.owner = "tasks"; } if (app === "pm") S.tab.pm = "mine"; if (app === "designer") S.tab.designer = "tasks"; softRender(); } }), icon("search")) : null,
    ok ? h("button", { class: "icon-btn", "aria-label": al.n ? al.label : "Nothing needs you", "data-tip": al.n ? al.label : "Nothing needs you right now", onclick: () => { al.go(); render(); window.scrollTo(0, 0); } },
      icon("bell"), al.n ? h("span", { class: "count" }, String(al.n)) : null) : null,
    S.me.id && role ? h("div", { class: "acct" },
      h("button", { class: "acct-btn", "aria-haspopup": "menu", "aria-expanded": String(!!S.menu), "aria-label": "Account", onclick: (e) => { e.stopPropagation(); S.menu = !S.menu; render(); } }, avatar(S.me.avatarUrl, name, "me-mini")),
      S.menu ? h("div", { class: "menu", role: "menu", onclick: (e) => e.stopPropagation() },
        h("div", { class: "menu-head" }, avatar(S.me.avatarUrl, name, "avatar"), h("div", { style: "min-width:0" }, h("b", null, name || "You"), h("small", null, roleLabel))),
        h("div", { class: "menu-meta" }, h("div", null, S.me.email), h("div", null, h("span", null, "Signed in "), fmtWhen(S.signedInAt || nowIso())),
          h("div", null, keepFlag() ? "Kept signed in on this device" : "Signs out after 30 minutes of inactivity")),
        h("button", { class: "menu-item", role: "menuitem", onclick: () => { S.menu = false; S.accountForm = { name: S.me.name || "", current: "", next: "", confirm: "", err: "", info: "" }; render(); } }, icon("key"), "Account settings"),
        h("button", { class: "menu-item", role: "menuitem", onclick: requestSignOut }, icon("logout"), "Sign out")) : null) : null);
}
document.addEventListener("click", () => { if (S.menu) { S.menu = false; render(); } });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && (S.menu || S.confirmSignOut || S.accountForm)) { S.menu = false; S.confirmSignOut = false; S.accountForm = null; render(); } });
function body(root, app) {
  if (!S.me.id) return viewAuth(root, app);
  if (!S.me.emailVerified) return viewVerify(root);
  if (!S.memberLoaded) return root.appendChild(h("div", { class: "skeleton" }, "Checking your access"));
  if (S.confirmSignOut) root.appendChild(signOutConfirm());
  if (S.accountForm) root.appendChild(accountModal());
  const role = roleOf();
  if (!role) return viewJoin(root, app);
  if (!app) app = homeApp();
  if (!allowed(app)) {
    const home = homeApp();
    return root.appendChild(gate(`${APPS[app].name} is for ${APPS[app].who}`,
      app === "owner" ? "This dashboard is private to the owner." : `You're set up as ${role === "pm" ? "a product manager" : "a designer"}.`,
      h("button", { class: "btn accent", onclick: () => { location.hash = home; render(); } }, `Open ${APPS[home].name}`)));
  }
  if (!S.config && app === "owner") root.appendChild(h("div", { class: "banner info" }, "No lists yet. Set up the 4E lines, projects, designers and PMs under Lists & 4E."));
  const views = {
    owner: { overview: viewOverview, funnel: viewFunnel, tasks: viewAllTasks, designers: viewDesignerTasks, leave: viewLeaveAdmin, people: viewPeople, lists: viewLists, export: viewExport },
    pm: { new: viewPmForm, mine: viewPmRequests },
    designer: { tasks: viewDesignerTasks, leave: viewDesignerLeave },
  }[app];
  (views[S.tab[app]] || Object.values(views)[0])(root);
}
function gate(title, text, action) {
  return h("div", { class: "card pad gate" }, h("h2", null, title), h("p", { class: "muted", style: "margin:0" }, text), action || null);
}
function head(eyebrow, title, text, right) {
  return h("div", { class: "head" }, h("div", null, h("div", { class: "eyebrow" }, eyebrow), h("h1", null, title), text ? h("p", null, text) : null), right || null);
}
// Page head (title, text, actions) followed by a row of summary tiles:
// stats = [[value, label, tone, icon, note], ...]
function hero({ kicker, title, text, stats, actions, right }) {
  const acts = (actions || []).filter(Boolean);
  return h("div", { class: "stack section-stack" },
    h("div", { class: "head" }, h("div", null, kicker ? h("div", { class: "eyebrow" }, kicker) : null, h("h1", null, title), text ? h("p", null, text) : null),
      acts.length || right ? h("div", { class: "row" }, right, acts) : null),
    stats && stats.length ? h("div", { class: "stats" }, stats.map(([v, l, tone, ic, note]) => h("div", { class: "stat" },
      h("span", { class: "ic" }, icon(ic || "overview")), h("div", { style: "min-width:0" }, h("div", { class: "l" }, l),
        h("div", { class: "v" + (tone === "bad" ? " bad" : tone === "good" ? " good" : "") }, v, note ? h("small", null, note) : null))))) : null);
}
function cardHead(title, sub, onViewAll, viewLabel) {
  return h("div", { class: "card-title" }, h("div", { class: "section-title" }, h("h2", null, title), sub ? h("span", { class: "muted" }, sub) : null),
    onViewAll ? h("button", { class: "view-all", onclick: onViewAll }, viewLabel || "View all") : null);
}
function quickActions(items) {
  return h("div", { class: "card pad" }, cardHead("Quick actions"), h("div", { class: "qa", style: "margin-top:6px" }, items.filter(Boolean).map(([ic, label, go, count]) =>
    h("button", { onclick: go }, h("span", { class: "ic" }, icon(ic)), h("span", { class: "t" }, label), count ? h("span", { class: "count" }, String(count)) : null, h("span", { class: "chev" }, "\u203A")))));
}
const LINE_COLOR = { Evaluate: "#6C4BD6", Educate: "#7C8A1C", Experience: "#E8742A", Enable: "#D14343", "GENIE Platform": "#1F1B2E" };
const lineColor = (line) => LINE_COLOR[line] || "#8A7BD0";
function initials(name) {
  const caps = String(name || "?").match(/[A-Z0-9]/g) || [];
  const words = String(name || "?").split(/\s+/).filter(Boolean);
  const pick = caps.length >= 2 ? caps.slice(0, 2).join("") : words.map((w) => w[0]).join("").slice(0, 2);
  return (pick || "?").toUpperCase();
}
// Profile photo, or initials when the platform has no picture
function avatar(url, name, cls, style) {
  if (url) return h("img", { class: cls || "avatar", src: url, alt: "", style });
  return h("span", { class: (cls || "avatar") + " ini", style, "aria-hidden": "true" }, initials(name || "?"));
}
function tile(product, line, sm) {
  const c = lineColor(line || lineOf(product));
  return h("span", { class: "tile" + (sm ? " sm" : ""), style: `background:linear-gradient(145deg, color-mix(in srgb, ${c} 70%, #fff), ${c})`, title: product || "", "aria-hidden": "true" }, initials(product));
}
function lineTag(line) { return line ? h("span", { class: "tag sub" }, h("i", { class: "dot", style: `background:${lineColor(line)}` }), line) : null; }

// ------------------------------------------------------------- auth views
const AUTH_MSG = {
  "auth/invalid-credential": "That email and password don't match. Check both, or reset your password.",
  "auth/wrong-password": "That email and password don't match. Check both, or reset your password.",
  "auth/user-not-found": "That email and password don't match. Check both, or reset your password.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/email-already-in-use": "An account with this email already exists. Sign in instead, or reset the password.",
  "auth/weak-password": "Choose a stronger password.",
  "auth/too-many-requests": "Too many attempts. Wait a few minutes, or reset your password.",
  "auth/network-request-failed": "No connection. Check your network and try again.",
  "auth/user-disabled": "This account has been disabled. Contact the owner.",
  "auth/requires-recent-login": "For your security, sign in again before changing your password.",
  not_configured: "The platform isn't connected to its backend yet. The administrator needs to finish setup (firebase-config.js).",
};
const authMsg = (e) => AUTH_MSG[e && e.code] || "Something went wrong. Try again.";
const domainOk = (email) => { const d = (CFG.allowedDomain || "").toLowerCase(); return !d || String(email).toLowerCase().trim().endsWith("@" + d); };
function passwordIssues(pw) {
  const out = [];
  if (pw.length < 10) out.push("at least 10 characters");
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) out.push("upper and lower case letters");
  if (!/\d/.test(pw)) out.push("a number");
  if (!/[^A-Za-z0-9]/.test(pw)) out.push("a symbol");
  return out;
}
const put = (el, ...kids) => el.append(...kids.flat().filter((k) => k !== null && k !== undefined && k !== false));
function authShell(root, card) {
  const logoW = document.querySelector(".top-brand img");
  const brand = h("div", { class: "auth-brand" },
    h("div", { class: "shapes", "aria-hidden": "true" }, h("i", { class: "shape torus" }), h("i", { class: "shape sphere" }), h("i", { class: "shape cube" }), h("i", { class: "shape cone" })),
    logoW ? h("img", { class: "auth-logo", src: logoW.src, alt: "KNOLSKAPE" }) : null,
    h("div", { class: "auth-copy" }, h("div", { class: "eyebrow" }, "Design Task Hub"), h("h2", null, "Plan, approve and track design work across the 4E products."),
      h("ul", null, h("li", null, "Product managers request work with timelines"), h("li", null, "The owner approves and assigns designers"), h("li", null, "Designers post daily progress and deliverables"))));
  put(card, h("div", { class: "auth-foot" }, icon("shield"), h("span", null, "Role based access. You only see what your role allows, and every access change is recorded.")));
  root.appendChild(h("div", { class: "auth-wrap" }, brand, card));
}
function authField(label, id, type, value, oninput, opts = {}) {
  return h("div", { class: "field" }, h("label", { for: id }, label),
    h("div", { class: "pw-wrap" }, h("input", { id, type: opts.show ? "text" : type, value, autocomplete: opts.autocomplete || "off", placeholder: opts.placeholder || "", required: true, oninput: (e) => oninput(e.target.value) }),
      type === "password" ? h("button", { type: "button", class: "pw-toggle", "aria-label": opts.show ? "Hide password" : "Show password", onclick: opts.toggle }, opts.show ? "Hide" : "Show") : null),
    opts.hint ? h("div", { class: "hint" }, opts.hint) : null);
}
function viewAuth(root, app) {
  const f = S.auth || (S.auth = { email: "", password: "", confirm: "", name: "", show: false, err: "", info: "" });
  const view = S.authView || "signin";
  const target = app ? APPS[app].name : "Design Task Hub";
  const card = h("form", { class: "auth-card", novalidate: true, onsubmit: (e) => { e.preventDefault(); submitAuth(view); } });
  const reason = { idle: "You were signed out after 30 minutes of inactivity.", "signed-out": "You're signed out. Nothing you typed was kept on this device.",
    reset: "Password updated. Sign in with your new password." }[S.signedOutReason];
  const switchTo = (v) => { S.authView = v; f.err = ""; f.info = ""; S.signedOutReason = ""; render(); };
  const toggle = () => { f.show = !f.show; render(); };
  const errBox = f.err ? h("div", { class: "banner warn", role: "alert" }, f.err) : null;
  const infoBox = f.info ? h("div", { class: "banner good", role: "status" }, f.info) : null;
  if (S.platformError) {
    put(card, h("div", { class: "eyebrow" }, "Setup needed"), h("h1", null, "Almost ready"), h("div", { class: "banner warn" }, authMsg(S.platformError)));
    return authShell(root, card);
  }
  if (view === "signin") {
    put(card, h("div", { class: "eyebrow" }, "Sign in"), h("h1", null, `Sign in to ${target}`),
      h("p", { class: "muted" }, `Use your official ${CFG.allowedDomain ? "@" + CFG.allowedDomain : "work"} email.`),
      reason ? h("div", { class: "banner " + (S.signedOutReason === "idle" ? "warn" : "good") }, reason) : null, errBox, infoBox,
      authField("Work email", "a-email", "email", f.email, (v) => { f.email = v; }, { autocomplete: "username", placeholder: `name@${CFG.allowedDomain || "company.com"}` }),
      authField("Password", "a-pw", "password", f.password, (v) => { f.password = v; }, { autocomplete: "current-password", show: f.show, toggle }),
      h("div", { class: "row" }, h("label", { class: "row", style: "gap:8px;cursor:pointer" }, h("input", { id: "keep", type: "checkbox", checked: S.keep, onchange: (e) => { S.keep = e.target.checked; } }), h("span", { class: "small" }, "Keep me signed in")),
        h("span", { class: "spacer" }), h("button", { type: "button", class: "linkish", onclick: () => switchTo("forgot") }, "Forgot password?")),
      h("button", { id: "signin-submit", type: "submit", class: "btn accent auth-cta", disabled: S.busy.auth }, S.busy.auth ? "Signing in" : "Sign in"),
      h("div", { class: "hint" }, "Leave \"Keep me signed in\" unticked on shared computers. You'll be signed out after 30 minutes of inactivity."),
      h("div", { class: "auth-switch" }, "First time here? ", h("button", { type: "button", class: "linkish", onclick: () => switchTo("signup") }, "Create your account")));
  } else if (view === "signup") {
    const issues = f.password ? passwordIssues(f.password) : [];
    put(card, h("div", { class: "eyebrow" }, "Create account"), h("h1", null, "Set up your account"),
      h("p", { class: "muted" }, "Use the work email the owner invited. You'll get an email to confirm it's you."), errBox,
      authField("Full name", "a-name", "text", f.name, (v) => { f.name = v; }, { autocomplete: "name", placeholder: "First and last name" }),
      authField("Work email", "a-email", "email", f.email, (v) => { f.email = v; }, { autocomplete: "username", placeholder: `name@${CFG.allowedDomain || "company.com"}` }),
      authField("Password", "a-pw", "password", f.password, (v) => { f.password = v; softRender(); }, { autocomplete: "new-password", show: f.show, toggle,
        hint: f.password ? (issues.length ? "Still needs " + issues.join(", ") + "." : "Strong password.") : "At least 10 characters with upper and lower case letters, a number and a symbol." }),
      authField("Confirm password", "a-pw2", "password", f.confirm, (v) => { f.confirm = v; }, { autocomplete: "new-password", show: f.show, toggle }),
      h("button", { id: "signup-submit", type: "submit", class: "btn accent auth-cta", disabled: S.busy.auth }, S.busy.auth ? "Creating account" : "Create account"),
      h("div", { class: "auth-switch" }, "Already have an account? ", h("button", { type: "button", class: "linkish", onclick: () => switchTo("signin") }, "Sign in")));
  } else if (view === "forgot") {
    put(card, h("div", { class: "eyebrow" }, "Reset password"), h("h1", null, "Forgot your password?"),
      h("p", { class: "muted" }, "Enter your work email and we'll send you a link to choose a new password."), errBox, infoBox,
      authField("Work email", "a-email", "email", f.email, (v) => { f.email = v; }, { autocomplete: "username", placeholder: `name@${CFG.allowedDomain || "company.com"}` }),
      h("button", { id: "reset-submit", type: "submit", class: "btn accent auth-cta", disabled: S.busy.auth }, S.busy.auth ? "Sending" : "Send reset link"),
      h("div", { class: "hint" }, "The link works once and expires after an hour. Check your spam folder if it doesn't arrive."),
      h("div", { class: "auth-switch" }, h("button", { type: "button", class: "linkish", onclick: () => switchTo("signin") }, "Back to sign in")));
  }
  authShell(root, card);
}
async function submitAuth(view) {
  const f = S.auth;
  f.err = ""; f.info = "";
  const email = (f.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { f.err = "Enter a valid email address."; return render(); }
  if (view !== "forgot" && !domainOk(email)) { f.err = `Use your official @${CFG.allowedDomain} email.`; return render(); }
  if (view === "signin" && !f.password) { f.err = "Enter your password."; return render(); }
  if (view === "signup") {
    if (!f.name.trim()) { f.err = "Enter your full name."; return render(); }
    const issues = passwordIssues(f.password);
    if (issues.length) { f.err = "Choose a stronger password: " + issues.join(", ") + "."; return render(); }
    if (f.password !== f.confirm) { f.err = "The two passwords don't match."; return render(); }
  }
  S.busy.auth = true; render();
  try {
    if (view === "signin") { setKeepFlag(S.keep); await P.auth.signIn(email, f.password, S.keep); S.pendingSignInRecord = true; }
    else if (view === "signup") { setKeepFlag(false); await P.auth.signUp(email, f.password, f.name.trim()); S.pendingSignInRecord = true; }
    else {
      try { await P.auth.resetPassword(email); } catch (e) { if (e.code === "auth/too-many-requests" || e.code === "auth/network-request-failed") throw e; }
      // Same answer whether or not the account exists, so the form can't be used to discover emails
      f.info = `If an account exists for ${email}, a reset link is on its way.`;
    }
    f.password = ""; f.confirm = ""; lastActivity = Date.now();
  } catch (e) { f.err = authMsg(e); if (view === "signin") f.password = ""; }
  S.busy.auth = false; render();
}
function viewVerify(root) {
  const f = S.auth || (S.auth = {});
  const card = h("div", { class: "auth-card" },
    h("div", { class: "eyebrow" }, "Confirm your email"), h("h1", null, "Check your inbox"),
    h("p", { class: "muted" }, `We sent a confirmation link to ${S.me.email}. Open it, then come back here.`),
    f.info ? h("div", { class: "banner good", role: "status" }, f.info) : null, f.err ? h("div", { class: "banner warn", role: "alert" }, f.err) : null,
    h("button", { id: "verify-done", class: "btn accent auth-cta", disabled: S.busy.auth, onclick: async () => {
      S.busy.auth = true; f.err = ""; render();
      try { const u = await P.auth.refresh(); if (u && u.emailVerified) { S.me.emailVerified = true; startSession(); } else f.err = "Not confirmed yet. Open the link in the email first."; }
      catch (e) { f.err = authMsg(e); }
      S.busy.auth = false; render();
    } }, "I've confirmed my email"),
    h("div", { class: "row" }, h("button", { class: "btn sm", disabled: S.busy.auth, onclick: async () => { try { await P.auth.sendVerification(); f.info = "Sent again. It can take a minute."; } catch (e) { f.err = authMsg(e); } render(); } }, "Send the email again"),
      h("button", { class: "btn sm ghost", onclick: () => signOut("signed-out") }, "Use a different account")));
  authShell(root, card);
}
function signOutConfirm() {
  return h("div", { class: "modal-back", onclick: () => { S.confirmSignOut = false; render(); } },
    h("div", { class: "modal card pad stack", role: "dialog", "aria-modal": "true", "aria-labelledby": "so-title", onclick: (e) => e.stopPropagation() },
      h("h2", { id: "so-title" }, "Sign out with unsaved changes?"),
      h("p", { class: "muted", style: "margin:0" }, "Something you typed hasn't been saved yet. Signing out clears it from this device."),
      h("div", { class: "row" }, h("button", { class: "btn", onclick: () => { S.confirmSignOut = false; render(); } }, "Stay signed in"),
        h("button", { class: "btn accent", onclick: () => signOut("signed-out") }, "Sign out anyway"))));
}
// Account settings: name and password
function accountModal() {
  const f = S.accountForm;
  const issues = f.next ? passwordIssues(f.next) : [];
  return h("div", { class: "modal-back", onclick: () => { S.accountForm = null; render(); } },
    h("form", { class: "modal card pad stack", role: "dialog", "aria-modal": "true", "aria-labelledby": "acc-title", novalidate: true, onclick: (e) => e.stopPropagation(), onsubmit: async (e) => {
      e.preventDefault(); f.err = ""; f.info = "";
      if (f.next || f.current) {
        if (!f.current) { f.err = "Enter your current password."; return render(); }
        if (issues.length) { f.err = "Choose a stronger password: " + issues.join(", ") + "."; return render(); }
        if (f.next !== f.confirm) { f.err = "The new passwords don't match."; return render(); }
      }
      S.busy.acct = true; render();
      try {
        if (f.name.trim() && f.name.trim() !== S.me.name) { await P.auth.updateName(f.name.trim()); S.me.name = f.name.trim(); if (S.people[S.me.id]) await db.doc(`members/${S.me.id}`).update({ displayName: S.me.name }); }
        if (f.next) { await P.auth.changePassword(f.current, f.next); f.current = ""; f.next = ""; f.confirm = ""; }
        f.info = "Saved.";
      } catch (err) { f.err = err && err.code === "auth/invalid-credential" ? "Your current password isn't right." : authMsg(err); }
      S.busy.acct = false; render();
    } },
      h("h2", { id: "acc-title" }, "Account settings"), h("div", { class: "small muted" }, S.me.email),
      f.err ? h("div", { class: "banner warn", role: "alert" }, f.err) : null, f.info ? h("div", { class: "banner good", role: "status" }, f.info) : null,
      authField("Full name", "acc-name", "text", f.name, (v) => { f.name = v; }, { autocomplete: "name" }),
      h("div", { class: "label", style: "margin-top:6px" }, "Change password"),
      authField("Current password", "acc-cur", "password", f.current, (v) => { f.current = v; }, { autocomplete: "current-password", show: f.show, toggle: () => { f.show = !f.show; render(); } }),
      authField("New password", "acc-new", "password", f.next, (v) => { f.next = v; softRender(); }, { autocomplete: "new-password", show: f.show, toggle: () => { f.show = !f.show; render(); },
        hint: f.next ? (issues.length ? "Still needs " + issues.join(", ") + "." : "Strong password.") : "Leave blank to keep your current password." }),
      authField("Confirm new password", "acc-new2", "password", f.confirm, (v) => { f.confirm = v; }, { autocomplete: "new-password", show: f.show, toggle: () => { f.show = !f.show; render(); } }),
      h("div", { class: "row" }, h("button", { type: "button", class: "btn", onclick: () => { S.accountForm = null; render(); } }, "Close"), h("button", { type: "submit", class: "btn accent", disabled: S.busy.acct }, "Save"))));
}

// ------------------------------------------------------------------ join
function viewJoin(root, app) {
  const claim = S.myClaim;
  const card = h("div", { class: "auth-card" });
  if (claim) {
    put(card, h("div", { class: "eyebrow" }, "Access requested"), h("h1", null, "Waiting for approval"),
      h("p", { class: "muted" }, `You asked to join as ${claim.role === "pm" ? "a product manager" : "a product designer"} ("${claim.name}"). The owner will approve it from the Owner Dashboard, and this page updates on its own.`),
      h("div", { class: "row" }, h("button", { class: "btn", onclick: () => guard("claim", () => db.doc("claims/" + S.me.id).delete()) }, "Change my request"),
        h("button", { class: "btn ghost", onclick: () => signOut("signed-out") }, "Sign out")));
    return authShell(root, card);
  }
  const fixed = app === "pm" ? "pm" : app === "designer" ? "designer" : null;
  const f = S.joinForm || (S.joinForm = { role: fixed || "designer", name: "", err: "" });
  const names = f.role === "pm" ? cfg().pms : cfg().designers;
  put(card, h("div", { class: "eyebrow" }, "No access yet"), h("h1", null, "Request access"),
    h("p", { class: "muted" }, `You're signed in as ${S.me.email}, but the owner hasn't given this account a role yet. If you were invited, check you used the invited email. Otherwise, send a request.`),
    f.err ? h("div", { class: "banner warn" }, f.err) : null,
    field("I am a", "join-role", select("join-role", f.role, ROLE_OPTIONS, (v) => { f.role = v; f.name = ""; render(); })),
    field("My name on the tracker", "join-name", select("join-name", f.name, names, (v) => { f.name = v; f.err = ""; }, names.length ? "Choose your name" : "Ask the owner to add your name"), null,
      "The owner can also correct this when approving."),
    h("button", { class: "btn accent auth-cta", disabled: S.busy.claim, onclick: () => {
      if (!f.name && names.length) { f.err = "Choose your name from the list."; return render(); }
      guard("claim", () => db.doc("claims/" + S.me.id).set({ role: f.role, name: f.name || "", email: S.me.email, displayName: S.me.name || "", at: nowIso() }));
    } }, "Request access"),
    h("div", { class: "auth-switch" }, h("button", { class: "linkish", onclick: () => signOut("signed-out") }, "Sign out")));
  authShell(root, card);
}

// ============================================================ TASK CREATION
function blankSubtask() { return { key: Math.random().toString(36).slice(2, 9), sub: "", detail: "", designer: "", start: "", end: "", effort: "", qty: "1", unit: "videos", titles: "" }; }
function itemsFromTitles(titles, qty) {
  return String(titles || "").split("\n").map((t) => t.trim()).filter(Boolean).slice(0, qty).map((title, i) => ({ id: "i" + (i + 1), title }));
}
function blankRequest() {
  return { id: null, fourE: "", product: "", project: "", masterTitle: "", priority: "Medium", brief: "", subtasks: [blankSubtask()], errors: {}, asPm: "" };
}
function validateRequest(f) {
  const e = { subs: {} };
  if (!f.fourE) e.fourE = "Choose the 4E line.";
  if (!f.product) e.product = "Choose the product.";
  if (!f.project.trim()) e.project = "Name the project this work belongs to.";
  if (!f.masterTitle.trim()) e.masterTitle = "Name the master task.";
  if (!f.subtasks.length) e.subtasks = "Add at least one subtask.";
  f.subtasks.forEach((s) => {
    const x = {};
    if (!s.sub) x.sub = "Choose the subtask type.";
    if (!s.detail.trim()) x.detail = "Describe what needs designing.";
    if (!s.start) x.start = "Add a start date.";
    if (!s.end) x.end = "Add an end date.";
    else if (s.start && s.end < s.start) x.end = "End date is before the start date.";
    if (!(Number(s.effort) > 0)) x.effort = "Estimate the hours.";
    const q = Number(s.qty || 1);
    if (!Number.isInteger(q) || q < 1 || q > 200) x.qty = "Use a whole number from 1 to 200.";
    if (Object.keys(x).length) e.subs[s.key] = x;
  });
  if (!Object.keys(e.subs).length) delete e.subs;
  return e;
}
function requestBody(f, status, prev) {
  const history = (prev && prev.history ? prev.history.slice() : []);
  if (status !== "draft") history.push({ at: nowIso(), status, by: "pm", name: pmName() });
  return {
    pmName: pmName(), pmUid: S.me.id, fourE: f.fourE, product: f.product, project: f.project.trim(), projectIsNew: !projectNames().includes(f.project.trim()),
    masterTitle: f.masterTitle.trim(),
    priority: f.priority, brief: f.brief.trim(),
    subtasks: f.subtasks.map((s) => {
      const qty = qtyOf(s);
      return { key: s.key, sub: s.sub, detail: s.detail.trim(), designer: s.designer || "", start: s.start, end: s.end, effort: Number(s.effort) || 0,
        qty, unit: qty > 1 ? s.unit || "items" : "", titles: qty > 1 ? s.titles || "" : "", items: qty > 1 ? itemsFromTitles(s.titles, qty) : [] };
    }),
    status, updatedAt: nowIso(), submittedAt: prev && prev.submittedAt ? prev.submittedAt : status === "pending" ? nowIso() : "",
    resubmittedAt: prev && prev.submittedAt && status === "pending" ? nowIso() : prev && prev.resubmittedAt ? prev.resubmittedAt : "",
    ownerNote: prev ? prev.ownerNote || "" : "", history,
    createdAt: prev && prev.createdAt ? prev.createdAt : nowIso(),
  };
}
function saveRequest(f, status) {
  if (status === "pending") {
    f.errors = validateRequest(f);
    if (Object.keys(f.errors).length) { render(); toast("Some fields need attention"); return; }
  } else f.errors = {};
  const m = M.matchNames(f.project, projectNames());
  if (m.exact) f.project = m.exact;
  const prev = f.id ? allRequests().find((r) => r.id === f.id) : null;
  const ref = f.id ? db.doc(`requests/${S.me.id}/items/${f.id}`) : db.collection(`requests/${S.me.id}/items`).doc();
  guard("req", async () => {
    await ref.set(requestBody(f, status, prev));
    if (status === "pending") { S.form = blankRequest(); S.tab.pm = "mine"; toast("Sent to the owner for approval"); }
    else { f.id = ref.id; toast("Draft saved"); }
  });
}
function viewPmForm(root) {
  const f = S.form || (S.form = blankRequest());
  const c = cfg(), e = f.errors || {};
  const mineReq = allRequests().filter((r) => r.uid === S.me.id);
  const cnt = (st) => String(mineReq.filter((r) => r.status === st).length);
  root.appendChild(hero({ kicker: f.id ? "Edit request" : "New request", title: f.id ? f.masterTitle || "Untitled request" : "Create a design request",
    text: "Pick the 4E line and product, name the project, and describe each subtask with its own timeline. The owner reviews every request and assigns the designers.",
    stats: [[cnt("pending"), "Awaiting approval", null, "inbox"], [cnt("changes"), "Sent back", Number(cnt("changes")) ? "bad" : null, "pen"], [cnt("approved"), "Approved", null, "check"], [cnt("draft"), "Drafts", null, "list"]],
    right: roleOf() === "admin" ? h("div", { style: "max-width:240px" }, field("Requesting as", "as-pm", select("as-pm", pmName(), c.pms, (v) => { f.asPm = v; render(); }))) : null }));
  const back = f.id ? allRequests().find((r) => r.id === f.id) : null;
  if (back && back.status === "changes" && back.ownerNote) root.appendChild(h("div", { class: "note-box" }, h("b", null, "Owner's note: "), back.ownerNote));

  const products = productsFor(f.fourE);
  const master = h("section", { class: "card pad form-section" },
    h("h3", null, "Master task"),
    h("div", { class: "fields" },
      field("4E line", "r-line", select("r-line", f.fourE, lines().map((l) => l.name), (v) => { f.fourE = v; if (!productsFor(v).includes(f.product)) f.product = ""; delete e.fourE; render(); }, "Choose a line"), e.fourE),
      field("Product", "r-product", (() => { const s = select("r-product", f.product, products, (v) => { f.product = v; delete e.product; render(); }, f.fourE ? "Choose a product" : "Choose a 4E line first"); s.disabled = !f.fourE; return s; })(), e.product),
      h("div", { class: "field" }, h("label", { for: "r-project" }, "Project"),
        h("input", { id: "r-project", type: "text", list: "dl-projects", maxlength: "80", autocomplete: "off", placeholder: "Type the project name", value: f.project,
          oninput: (ev) => { f.project = ev.target.value; f.projectKeep = false; delete e.project; softRender(); },
          onchange: (ev) => { f.project = ev.target.value; render(); } }),
        projectDatalist(), projectHint(f, (v) => { f.project = v; f.projectKeep = false; render(); }, () => { f.projectKeep = true; render(); }, true),
        e.project ? h("div", { class: "err" }, e.project) : null),
      field("Priority", "r-priority", select("r-priority", f.priority, PRIORITIES, (v) => { f.priority = v; }))),
    field("Master task title", "r-title", h("input", { id: "r-title", type: "text", maxlength: "120", placeholder: "For example: Team analytics for managers", value: f.masterTitle, oninput: (ev) => { f.masterTitle = ev.target.value; delete e.masterTitle; softRender(); } }), e.masterTitle),
    field("Brief or link (optional)", "r-brief", h("textarea", { id: "r-brief", rows: "2", placeholder: "PRD section, Figma file, goals and constraints", value: f.brief, oninput: (ev) => { f.brief = ev.target.value; } })));

  const subtaskCards = f.subtasks.map((s, i) => subtaskEditor(f, s, i, (e.subs || {})[s.key] || {}));
  const subSection = h("section", { class: "card pad form-section" },
    h("div", { class: "row" }, h("h3", null, `Subtasks (${f.subtasks.length})`), h("span", { class: "spacer" }),
      h("span", { class: "hint" }, "Each subtask becomes one row on the Tracker once approved.")),
    subtaskCards, e.subtasks ? h("div", { class: "err" }, e.subtasks) : null,
    h("div", null, h("button", { class: "btn", onclick: () => { const last = f.subtasks[f.subtasks.length - 1]; const n = blankSubtask(); if (last) n.start = last.end || ""; f.subtasks.push(n); render(); } }, "Add subtask")));

  const tl = requestTimeline(f.subtasks, false);
  const totals = f.subtasks.reduce((a, s) => a + (Number(s.effort) || 0), 0);
  const starts = f.subtasks.map((s) => s.start).filter(Boolean).sort(), ends = f.subtasks.map((s) => s.end).filter(Boolean).sort();
  const span = starts.length && ends.length ? `${fmtDate(starts[0])} to ${fmtDate(ends[ends.length - 1])}, ${workdays(starts[0], ends[ends.length - 1])} working days` : "Add dates to see the timeline";
  const timeline = h("section", { class: "card pad form-section" },
    h("div", { class: "row" }, h("h3", null, "Timeline"), h("span", { class: "spacer" }), h("span", { class: "small muted" }, `${fmt1(totals)} hrs across ${f.subtasks.length} subtask${f.subtasks.length === 1 ? "" : "s"}. ${span}`)),
    tl || h("div", { class: "hint" }, "Bars appear once subtasks have start and end dates."));

  const preview = f.product || f.subtasks.some((s) => s.sub) ? h("div", { class: "preview" }, h("div", { class: "k" }, "On the Tracker, once approved"),
    f.subtasks.map((s) => h("div", null, X.taskAssigned({ master: f.product, sub: s.sub, title: s.detail.split("\n")[0].slice(0, 80), qty: qtyOf(s), unit: s.unit }) || "-"))) : null;

  const actions = h("div", { class: "row" },
    h("button", { class: "btn accent", disabled: S.busy.req, onclick: () => saveRequest(f, "pending") }, back && back.status === "changes" ? "Resubmit for approval" : "Submit for approval"),
    h("button", { class: "btn", disabled: S.busy.req, onclick: () => saveRequest(f, "draft") }, "Save draft"),
    f.id ? h("button", { class: "btn ghost", onclick: () => { S.form = blankRequest(); render(); } }, "Start a new request") : null,
    h("span", { class: "hint" }, `Submitted by ${pmName() || "you"}`));

  root.appendChild(h("div", { class: "grid2" }, h("div", { class: "stack section-stack" }, master, subSection),
    h("aside", { class: "stack section-stack sticky-col" }, timeline, preview, h("div", { class: "card pad" }, actions))));
}
function subtaskEditor(f, s, i, e) {
  const c = cfg();
  const id = (k) => `st-${k}-${s.key}`;
  return h("div", { class: "subtask" },
    h("div", { class: "subtask-head" }, h("span", { class: "n" }, String(i + 1)), h("b", null, s.sub || "Subtask"),
      s.start && s.end && s.end >= s.start ? h("span", { class: "small muted" }, `${workdays(s.start, s.end)} working days`) : null,
      h("span", { class: "spacer" }),
      h("button", { class: "btn sm ghost", onclick: () => { const cp = { ...clone(s), key: blankSubtask().key }; f.subtasks.splice(i + 1, 0, cp); render(); } }, "Duplicate"),
      f.subtasks.length > 1 ? h("button", { class: "btn sm ghost danger", onclick: () => { f.subtasks.splice(i, 1); render(); } }, "Remove") : null),
    h("div", { class: "fields" },
      field("Subtask type", id("sub"), select(id("sub"), s.sub, c.subTags, (v) => { s.sub = v; delete e.sub; render(); }, "Choose a type"), e.sub),
      field("Quantity", id("qty"), h("input", { id: id("qty"), type: "number", min: "1", max: "200", step: "1", inputmode: "numeric", value: s.qty || "1", oninput: (ev) => { s.qty = ev.target.value; delete e.qty; softRender(); } }), e.qty,
        qtyOf(s) > 1 ? "Tracked as one batch with a checklist" : "1 for a single piece of work"),
      qtyOf(s) > 1 ? field("Unit", id("unit"), select(id("unit"), s.unit || "videos", UNITS, (v) => { s.unit = v; render(); })) : null),
    qtyOf(s) > 1 ? field(`Titles of the ${s.unit || "items"} (optional, one per line)`, id("titles"), h("textarea", { id: id("titles"), rows: String(Math.min(6, qtyOf(s))), placeholder: `For example:\nIntro to the platform\nSetting up a cohort\nThe designer can name the rest`, value: s.titles || "", oninput: (ev) => { s.titles = ev.target.value; } }),
      null, `${Math.min(qtyOf(s), String(s.titles || "").split("\n").filter((x) => x.trim()).length)} of ${qtyOf(s)} named`) : null,
    field("Detail", id("det"), h("textarea", { id: id("det"), rows: "3", maxlength: "600", placeholder: "What exactly needs designing, which screens or states, and what done looks like", value: s.detail, oninput: (ev) => { s.detail = ev.target.value; delete e.detail; softRender(); } }), e.detail),
    h("div", { class: "fields" },
      field("Start", id("start"), h("input", { id: id("start"), type: "date", value: s.start, onchange: (ev) => { s.start = ev.target.value; if (s.end && s.end < s.start) s.end = s.start; delete e.start; render(); } }), e.start),
      field("End", id("end"), h("input", { id: id("end"), type: "date", value: s.end, min: s.start || null, onchange: (ev) => { s.end = ev.target.value; delete e.end; render(); } }), e.end),
      field("Effort (hours)", id("eff"), h("input", { id: id("eff"), type: "number", min: "0.5", step: "0.5", inputmode: "decimal", value: s.effort, oninput: (ev) => { s.effort = ev.target.value; delete e.effort; softRender(); } }), e.effort)));
}
// Peak weekly utilisation and leave days for one designer across a date range
function designerLoad(name, from, to) {
  const ctx = M.context(cfg()), all = tasks(), leave = allLeave();
  let peak = 0, status = "Balanced", leaveDays = 0;
  for (let w = M.mondayOf(from); w <= to; w = M.addDays(w, 7)) {
    const x = M.week(all, leave, name, w, ctx);
    if ((x.utilisation || 0) >= peak) { peak = x.utilisation || 0; status = x.status; }
  }
  for (let d = from; d <= to; d = M.addDays(d, 1)) if (leave.some((l) => l.designer === name && l.from <= d && l.to >= d) && M.isoWeekday(M.toDay(d)) <= ctx.s.daysPerWeek && !ctx.holidays.has(d)) leaveDays++;
  return { peak, status, leave: leaveDays };
}
const projectNames = () => cfg().projects.map((p) => p.name);
function projectDatalist() { return h("datalist", { id: "dl-projects" }, projectNames().map((n) => h("option", { value: n }))); }
// Existing, similar or new: the hint under a free-text project field
function projectHint(f, use, keep, isPm) {
  const name = (f.project || "").trim();
  if (!name) return h("div", { class: "hint" }, "Start typing to pick an existing project, or enter a new name.");
  const m = M.matchNames(name, projectNames());
  if (m.exact) return h("div", { class: "hint" }, `Existing project${m.exact !== name ? ` "${m.exact}"` : ""}. Lead PM: ${M.projectLead(cfg(), m.exact)}`);
  if (m.similar.length && !f.projectKeep) return h("div", { class: "cap" }, h("span", null, "Similar existing project:"),
    m.similar.map((n) => h("button", { class: "chip", type: "button", onclick: () => use(n) }, n)),
    h("button", { class: "btn sm ghost", type: "button", onclick: keep }, `Keep "${name}" as new`));
  return h("div", { class: "hint" }, pill("New project", "info"), " ", isPm ? "It joins the project list when the owner approves this request, with you as lead PM." : `Approving adds it to Lists & 4E with lead PM ${f.pmName || "the requesting PM"}.`);
}
function requestTimeline(subtasks, showDesigner = true) {
  const rows = subtasks.filter((s) => s.start && s.end && s.end >= s.start).map((s) => ({
    label: h("span", null, `${subtasks.indexOf(s) + 1}. ${s.sub || "Subtask"} `, qtyOf(s) > 1 ? h("small", null, `x${qtyOf(s)} `) : null, showDesigner ? h("small", null, s.designer || "unassigned") : null),
    start: s.start, end: s.end, color: showDesigner ? designerColor(s.designer) : "var(--accent)",
    text: showDesigner ? s.designer || "" : s.effort ? `${fmt1(s.effort)} hrs` : "",
    tip: `${s.sub || "Subtask"}${qtyOf(s) > 1 ? ", " + unitLabel(s) : ""}\n${fmtDate(s.start)} to ${fmtDate(s.end)}\n` + (showDesigner ? `${s.designer || "Not assigned yet"}, ` : "") + `${fmt1(s.effort)} hrs`,
  }));
  return rows.length ? gantt(rows) : null;
}
function gantt(rows) {
  let a = rows.map((r) => r.start).sort()[0], b = rows.map((r) => r.end).sort().slice(-1)[0];
  if (M.toDay(b) - M.toDay(a) < 13) b = M.addDays(a, 13);
  a = M.mondayOf(a);
  const span = M.toDay(b) - M.toDay(a) + 1;
  const pos = (iso) => ((M.toDay(iso) - M.toDay(a)) / span) * 100;
  const weeks = [];
  for (let w = a; w <= b; w = M.addDays(w, 7)) weeks.push(w);
  const step = weeks.length > 10 ? 2 : 1;
  const td = today();
  const grid = () => weeks.map((w) => h("i", { class: "g-grid", style: `left:${pos(w)}%` }));
  return h("div", { class: "tbl-wrap" }, h("div", { class: "gantt" },
    h("div", { class: "g-row" }, h("span"), h("div", { class: "g-axis" }, weeks.map((w, i) => i % step ? null : h("span", { style: `left:${Math.min(96, Math.max(3, pos(w) + 2))}%` }, fmtDate(w))))),
    rows.map((r) => h("div", { class: "g-row" }, h("div", { class: "g-label" }, r.label),
      h("div", { class: "g-track" }, grid(), td >= a && td <= b ? h("i", { class: "g-today", style: `left:${pos(td)}%`, title: "Today" }) : null,
        h("div", { class: "g-bar", style: `left:${pos(r.start)}%;width:${Math.max(1.2, pos(M.addDays(r.end, 1)) - pos(r.start))}%;background:${r.color}`, "data-tip": r.tip }, r.text))))));
}
function heatCell(all, leave, d, w, ctx) {
  const x = M.week(all, leave, d, w, ctx);
  const kind = WL[x.status];
  return h("div", { class: "cell", style: `background:var(--${kind === "neutral" ? "surface-2" : kind + "-bg"});color:var(--${kind === "neutral" ? "muted" : kind + "-ink"})`,
    "data-tip": `${d}, week of ${fmtDate(w)}\n${x.status}\n${fmt1(x.allocated)} of ${fmt1(x.available)} hrs allocated` + (x.leaveDays ? `\n${x.leaveDays} leave day(s)` : "") + (x.holidays ? `\n${x.holidays} holiday(s)` : "") },
    x.utilisation == null ? (x.status === "Overloaded" ? "!" : "Off") : pct(x.utilisation));
}
function viewPmRequests(root) {
  const mine = allRequests().filter((r) => r.uid === S.me.id).sort((a, b) => ((a.updatedAt || "") < (b.updatedAt || "") ? 1 : -1));
  const f = S.pmFilter;
  const q = (S.search || "").trim().toLowerCase();
  const list = mine.filter((r) => f === "all" || (f === "active" ? ["draft", "pending", "changes"].includes(r.status) : ["approved", "rejected"].includes(r.status)))
    .filter((r) => !q || [r.masterTitle, r.product, r.fourE, r.project, ...(r.subtasks || []).map((x) => `${x.sub} ${x.detail}`)].join(" ").toLowerCase().includes(q));
  const counts = (st) => mine.filter((r) => r.status === st).length;
  root.appendChild(head("My requests", `${counts("pending")} awaiting approval`,
    counts("changes") ? `${counts("changes")} sent back with changes requested.` : "Approved requests show live progress from designers.",
    h("div", { class: "seg" }, [["active", "In progress"], ["decided", "Decided"], ["all", "All"]].map(([k, l]) => h("button", { "aria-pressed": String(f === k), onclick: () => { S.pmFilter = k; render(); } }, l)))));
  if (!list.length) return root.appendChild(h("div", { class: "card empty" }, h("h3", null, "Nothing here yet"), h("p", { style: "margin:0" }, "Requests you submit appear here with the owner's decision.")));
  const byId = new Map(tasks().map((t) => [t.id, t]));
  for (const r of list) {
    const actions = [];
    if (r.status === "draft" || r.status === "changes") actions.push(h("button", { class: "btn sm accent", onclick: () => { S.form = { ...clone(r), errors: {}, asPm: r.pmName }; S.tab.pm = "new"; render(); window.scrollTo(0, 0); } }, r.status === "changes" ? "Edit and resubmit" : "Continue editing"));
    if (r.status === "pending") actions.push(h("button", { class: "btn sm", onclick: () => guard("req", () => db.doc(`requests/${S.me.id}/items/${r.id}`).update({ status: "draft", updatedAt: nowIso() })) }, "Withdraw to edit"));
    if (r.status === "draft") actions.push(S.confirm === r.id
      ? h("span", null, h("button", { class: "btn sm danger", onclick: () => guard("req", async () => { await db.doc(`requests/${S.me.id}/items/${r.id}`).delete(); S.confirm = null; }) }, "Delete draft"), h("button", { class: "btn sm ghost", onclick: () => { S.confirm = null; render(); } }, "Keep"))
      : h("button", { class: "btn sm ghost danger", onclick: () => { S.confirm = r.id; render(); } }, "Delete"));
    root.appendChild(h("article", { class: "card pad req" },
      h("div", { class: "req-head" }, h("div", { class: "t" }, h("div", { class: "row", style: "gap:6px" }, h("span", { class: "tag" }, r.fourE || "-"), h("span", { class: "tag sub" }, r.product || "-")),
        h("h3", { style: "margin-top:6px" }, r.masterTitle || "Untitled request"),
        h("div", { class: "small muted" }, `${r.project || "No project"}${r.projectIsNew && r.status !== "approved" ? " (new project)" : ""} · ${r.priority} priority` + (r.submittedAt ? ` · submitted ${fmtDate(r.submittedAt)}` : "") + (r.decidedAt ? ` · decided ${fmtDate(r.decidedAt)}` : ""))),
        reqPill(r.status)),
      r.ownerNote && r.status !== "pending" ? h("div", { class: "note-box" }, h("b", null, "Owner's note: "), r.ownerNote) : null,
      h("div", { class: "tbl-wrap" }, h("table", null, h("thead", null, h("tr", null, ["#", "Subtask", "Designer", "Timeline", "Hours", r.status === "approved" ? "Progress" : null].filter(Boolean).map((x) => h("th", null, x)))),
        h("tbody", null, (r.subtasks || []).map((s, i) => {
          const t = s.taskId ? byId.get(s.taskId) : null;
          return h("tr", null, h("td", { class: "mono" }, t ? t.taskId : String(i + 1)), h("td", null, h("b", null, s.sub), qtyOf(s) > 1 ? h("span", { class: "tag sub", style: "margin-left:6px" }, unitLabel(s)) : null, h("div", { class: "small muted", style: "max-width:44ch" }, s.detail)),
            h("td", null, r.status === "approved" && s.designer ? s.designer : h("span", { class: "muted small" }, "Owner assigns")), h("td", { class: "small" }, `${fmtDate(s.start)} to ${fmtDate(s.end)}`), h("td", { class: "n" }, fmt1(s.effort)),
            r.status === "approved" ? h("td", null, t ? h("div", null, deliveryPill(t), h("div", { class: "bar-cell", style: "margin-top:6px" }, h("span", { class: "track" }, h("i", { style: `width:${t.progress || 0}%;background:var(--ks-orange)` })), h("span", { class: "num small" }, (t.progress || 0) + "%"))) : h("span", { class: "muted small" }, "Removed")) : null);
        })))),
      actions.length ? h("div", { class: "row" }, actions) : null));
  }
}

// ========================================================= DESIGNER TRACKER
function viewDesignerTasks(root) {
  const name = designerName();
  const mine = tasks().filter((t) => t.designer === name);
  const q = (S.search || "").trim().toLowerCase();
  const match = (t) => !q || [t.title, t.master, t.sub, t.taskId, t.project, t.masterTitle].join(" ").toLowerCase().includes(q);
  const open = mine.filter((t) => !t.actualEnd && match(t)).sort((a, b) => ((a.target || "9") < (b.target || "9") ? -1 : 1));
  const done = mine.filter((t) => t.actualEnd).sort((a, b) => (a.actualEnd < b.actualEnd ? 1 : -1));
  const td = today();
  const updated = open.filter((t) => (t.updates || []).some((u) => u.d === td)).length;
  const hoursToday = mine.reduce((a, t) => a + (t.updates || []).filter((u) => u.d === td).reduce((x, u) => x + (Number(u.hours) || 0), 0), 0);
  const dueWeek = open.filter((t) => t.target && t.target <= M.addDays(M.mondayOf(td), 6)).length;
  const hr = new Date().getHours();
  const overdue = open.filter((t) => t.delivery === "Overdue").length;
  const itemsLeft = open.reduce((a, t) => a + (t.deliverables ? t.deliverables.length - (t.itemsDone || 0) : 0), 0);
  root.appendChild(hero({ kicker: fmtDate(td, true), title: `${hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening"}${name ? ", " + name : ""}`,
    text: open.length ? "Post one update per task each day: status, progress, hours spent and any blocker." : "No open tasks right now. New work appears here once the owner approves it.",
    stats: [[`${updated}/${open.length}`, "Updated today", null, "check"], [fmt1(hoursToday), "Hours today", null, "clock"], [String(dueWeek), "Due this week", null, "calendar", overdue ? `${overdue} overdue` : null], [String(itemsLeft), "Deliverables to go", null, "layers"]],
    right: roleOf() === "admin" ? h("div", { style: "max-width:240px" }, field("Viewing as", "acting-des", select("acting-des", name, cfg().designers, (v) => { S.actingDesigner = v; render(); }))) : null }));
  const nudge = leaveNudge(name);
  if (nudge) root.appendChild(nudge);
  if (open.length) {
    const rows = open.filter((t) => t.start && t.target).slice(0, 12).map((t) => ({ label: h("span", null, t.taskId + " ", h("small", null, t.sub)), start: t.start, end: t.target,
      color: t.delivery === "Overdue" ? "var(--critical)" : t.delivery === "Blocked" ? "var(--warn)" : "var(--ks-orange)", text: (t.product || t.master) + (qtyOf(t) > 1 ? ` · ${t.itemsDone || 0}/${qtyOf(t)}` : ""), tip: `${t.title}\n${fmtDate(t.start)} to ${fmtDate(t.target)}` }));
    if (rows.length) root.appendChild(h("div", { class: "card pad stack" }, h("h3", null, "My timeline"), gantt(rows)));
  }
  if (!open.length) root.appendChild(h("div", { class: "card empty" }, h("h3", null, "You're all caught up"), h("p", { style: "margin:0" }, "Tasks the owner approves for you appear here.")));
  open.forEach((t) => root.appendChild(taskCard(t, name)));
  if (done.length) root.appendChild(h("details", { open: S.showDone || null, ontoggle: (e) => { S.showDone = e.target.open; } }, h("summary", null, `Completed (${done.length})`),
    h("div", { class: "card tbl-wrap", style: "margin-top:10px" }, h("table", null, h("thead", null, h("tr", null, ["ID", "Task", "Done", "Delivery", "Revisions", "Score"].map((x) => h("th", null, x)))),
      h("tbody", null, done.map((t) => h("tr", null, h("td", { class: "mono" }, t.taskId), h("td", null, h("div", null, h("span", { class: "tag" }, t.master), " ", h("span", { class: "tag sub" }, t.sub)), h("div", { style: "margin-top:4px" }, t.title)),
        h("td", null, fmtDate(t.actualEnd)), h("td", null, deliveryPill(t)), h("td", { class: "n" }, t.revisions || 0), h("td", { class: "n" }, fmt0(t.score)))))))));
}
function draftFor(t) {
  const td = today();
  if (!S.drafts[t.id]) {
    const u = (t.updates || []).find((x) => x.d === td);
    S.drafts[t.id] = { status: u ? u.status : (t.status === "Not Started" ? "In Progress" : t.status), progress: u ? u.progress : (t.progress || 0),
      hours: u ? String(u.hours) : "", note: u ? u.note || "" : "", blocker: t.blockers || "", revisions: Number(t.revisions) || 0, actualEnd: t.actualEnd || td, err: "",
      items: t.deliverables ? Object.fromEntries(t.deliverables.map((x) => [x.id, { title: x.title, status: x.status, link: x.link, revisions: x.revisions }])) : null };
  }
  return S.drafts[t.id];
}
function taskCard(t, name) {
  const d = draftFor(t), td = today();
  const todays = (t.updates || []).find((u) => u.d === td);
  const k = (s) => `${s}-${t.id}`;
  const history = (t.updates || []).slice().sort((a, b) => (a.d < b.d ? 1 : -1)).slice(0, 4);
  return h("article", { class: "card task" + (t.delivery === "Overdue" ? " overdue" : t.delivery === "Blocked" ? " blocked" : "") },
    h("div", { class: "task-top" }, h("span", { class: "mono muted" }, t.taskId), t.fourE ? h("span", { class: "tag sub" }, t.fourE) : null, h("span", { class: "tag" }, t.master), h("span", { class: "tag sub" }, t.sub),
      h("span", { class: "spacer" }), t.priority === "High" ? pill("High priority", "serious") : null, deliveryPill(t)),
    h("div", null, t.masterTitle ? h("div", { class: "small muted" }, t.masterTitle) : null, h("div", { class: "task-title" }, t.title, qtyOf(t) > 1 ? h("span", { class: "tag sub", style: "margin-left:8px;vertical-align:2px" }, unitLabel(t)) : null),
      h("div", { class: "meta" }, h("span", null, t.project), h("span", null, "PM " + (t.assignedBy || t.pm)), h("span", null, `${fmtDate(t.start)} to ${fmtDate(t.target)}`),
        h("span", { style: t.delivery === "Overdue" ? "color:var(--critical-ink);font-weight:600" : null }, workdaysLeft(t)),
        t.effort ? h("span", null, `${fmt1(t.effort)} hrs estimated, ${fmt1(t.hoursLogged)} logged`) : null)),
    t.brief ? h("div", { class: "small muted", style: "overflow-wrap:anywhere" }, t.brief) : null,
    t.deliverables ? h("div", { class: "batch-bar" }, h("b", { class: "small", style: "white-space:nowrap" }, `${t.itemsDone || 0} of ${t.deliverables.length} ${t.unit || "items"} done`),
      h("div", { class: "progress", "aria-label": `Progress ${t.progress || 0}%` }, h("i", { style: `width:${t.progress || 0}%` })), h("span", { class: "num small" }, `${t.progress || 0}%`))
      : h("div", { class: "progress", "aria-label": `Progress ${t.progress || 0}%` }, h("i", { style: `width:${t.progress || 0}%` })),
    h("div", { class: "update" },
      h("div", { class: "row" }, h("b", { class: "small" }, todays ? "Today's update is saved. Change it any time today." : "Today's update"), h("span", { class: "spacer" }), todays ? pill("Updated today", "good") : pill("Not updated today", "neutral")),
      h("div", { class: "field" }, h("span", { class: "label" }, "Status"),
        h("div", { class: "seg" }, STATUSES.filter((s) => s !== "Not Started" || t.status === "Not Started").map((s) =>
          h("button", { "aria-pressed": String(d.status === s), onclick: () => { d.status = s; if (s === "Done") d.progress = 100; d.err = ""; render(); } }, s)))),
      d.items ? itemChecklist(t, d, k) : null,
      h("div", { class: "fields" },
        d.items ? null : h("div", { class: "field" }, h("label", { for: k("prog") }, `Progress: ${d.progress}%`),
          h("input", { id: k("prog"), type: "range", min: "0", max: "100", step: "5", value: d.progress, oninput: (e) => { d.progress = Number(e.target.value); e.target.previousSibling.textContent = `Progress: ${d.progress}%`; } })),
        field("Hours spent today", k("hrs"), h("input", { id: k("hrs"), type: "number", min: "0", max: "16", step: "0.5", inputmode: "decimal", placeholder: "0", value: d.hours, oninput: (e) => { d.hours = e.target.value; } })),
        d.items ? null : h("div", { class: "field" }, h("span", { class: "label" }, "Revision rounds"),
          h("div", { class: "stepper" }, h("button", { "aria-label": "One fewer revision", onclick: () => { d.revisions = Math.max(0, d.revisions - 1); render(); } }, "-"),
            h("span", null, d.revisions), h("button", { "aria-label": "One more revision", onclick: () => { d.revisions += 1; render(); } }, "+"))),
        d.status === "Done" ? field("Actual end date", k("end"), h("input", { id: k("end"), type: "date", value: d.actualEnd, max: td, onchange: (e) => { d.actualEnd = e.target.value; } })) : null),
      field("What moved today", k("note"), h("input", { id: k("note"), type: "text", maxlength: "280", placeholder: "For example: Finished empty states, sent v2 to PM", value: d.note, oninput: (e) => { d.note = e.target.value; } })),
      field(d.status === "Blocked" ? "Blocker (required)" : "Dependencies or blockers", k("blk"), h("input", { id: k("blk"), type: "text", maxlength: "200", placeholder: "Waiting on copy, API decision, review slot", value: d.blocker, oninput: (e) => { d.blocker = e.target.value; d.err = ""; } })),
      d.err ? h("div", { class: "err" }, d.err) : null,
      h("div", { class: "row" }, h("button", { class: "btn accent", disabled: S.busy["u" + t.id], onclick: () => saveUpdate(t, d, name) }, todays ? "Update today's entry" : "Save today's update"))),
    history.length ? h("details", null, h("summary", { class: "small" }, `Recent updates (${(t.updates || []).length})`),
      h("div", { class: "history", style: "margin-top:8px" }, history.map((u) => h("div", null, h("b", null, fmtDate(u.d, true)), `  ${u.status}, ${u.progress}%`, u.itemsDone ? `, ${u.itemsDone} ${t.unit || "items"} done` : "", u.hours ? `, ${fmt1(u.hours)} hrs` : "", u.note ? `. ${u.note}` : "")))) : null);
}
// Per-item checklist for batch tasks (for example 12 videos)
function itemChecklist(t, d, k) {
  const noun = String(t.unit || "items").replace(/s$/, "");
  const doneN = Object.values(d.items).filter((x) => x.status === "Done").length;
  return h("div", { class: "field" },
    h("div", { class: "row" }, h("span", { class: "label" }, `${t.unit || "Items"} (${doneN} of ${t.deliverables.length} done)`), h("span", { class: "spacer" }),
      h("span", { class: "hint" }, "Progress and revision rounds are worked out from this list")),
    h("div", { class: "items" }, t.deliverables.map((x) => {
      const st = d.items[x.id];
      return h("div", { class: "item" + (st.status === "Done" ? " done" : "") },
        h("span", { class: "n" }, String(x.n)),
        h("input", { id: k("it-t-" + x.id), type: "text", maxlength: "120", placeholder: `${noun[0].toUpperCase() + noun.slice(1)} ${x.n} title`, value: st.title, "aria-label": `Title of ${noun} ${x.n}`, oninput: (e) => { st.title = e.target.value; } }),
        select(k("it-s-" + x.id), st.status, ["Not Started", "In Progress", "In Review", "Done"], (v) => { st.status = v; d.err = ""; render(); }),
        h("div", { class: "stepper sm", title: "Revision rounds" }, h("button", { "aria-label": "One fewer revision", onclick: () => { st.revisions = Math.max(0, st.revisions - 1); render(); } }, "-"),
          h("span", null, st.revisions), h("button", { "aria-label": "One more revision", onclick: () => { st.revisions += 1; render(); } }, "+")),
        h("input", { id: k("it-l-" + x.id), class: "ilink", type: "url", placeholder: "Link to the file", value: st.link, "aria-label": `Link for ${noun} ${x.n}`, oninput: (e) => { st.link = e.target.value; } }));
    })));
}
function saveUpdate(t, d, name) {
  if (d.status === "Blocked" && !d.blocker.trim()) { d.err = "Say what is blocking this task so the PM can help."; return render(); }
  const hours = d.hours === "" ? 0 : Number(d.hours);
  if (!(hours >= 0 && hours <= 24)) { d.err = "Hours must be between 0 and 24."; return render(); }
  const td = today(), at = nowIso();
  let items = null, itemsDoneToday = 0;
  if (d.items) {
    const list = t.deliverables;
    const done = list.filter((x) => d.items[x.id].status === "Done").length;
    if (d.status === "Done" && done < list.length) { d.err = `${list.length - done} ${t.unit || "items"} are not done yet. Mark each one done first.`; return render(); }
    if (done === list.length && d.status !== "Blocked") d.status = "Done";
    items = {};
    for (const x of list) {
      const st = d.items[x.id];
      const changed = st.title !== x.title || st.status !== x.status || st.link !== x.link || st.revisions !== x.revisions;
      const doneAt = st.status === "Done" ? (x.status === "Done" && x.doneAt ? x.doneAt : td) : "";
      items[x.id] = { title: st.title.trim(), status: st.status, link: st.link.trim(), revisions: st.revisions, doneAt, at: changed ? at : x.at || at };
    }
    d.progress = Math.round((done / list.length) * 100);
    itemsDoneToday = Object.values(items).filter((x) => x.doneAt === td).length;
    d.revisions = Math.round(list.reduce((a, x) => a + d.items[x.id].revisions, 0) / list.length);
  }
  const entry = { d: td, status: d.status, progress: d.progress, hours, note: d.note.trim(), blocker: d.blocker.trim(), by: S.me.id, at };
  if (items) entry.itemsDone = itemsDoneToday;
  const updates = (t.updates || []).filter((u) => u.d !== td).concat([entry]).sort((a, b) => (a.d < b.d ? -1 : 1));
  guard("u" + t.id, async () => {
    const body = { taskId: t.id, designer: name, status: d.status, progress: d.progress, revisions: d.revisions,
      blockers: d.blocker.trim(), actualEnd: d.status === "Done" ? (items ? latestDone(items) || td : d.actualEnd || td) : "", updates, updatedAt: at };
    if (items) body.items = items;
    await db.doc(`progress/${S.me.id}/tasks/${t.id}`).set(body);
    await ensureOwnerId();
    delete S.drafts[t.id];
    toast(d.status === "Done" ? `${t.taskId} marked done` : `Update saved for ${t.taskId}`);
  });
}

function latestDone(items) { return Object.values(items).reduce((a, x) => (x.doneAt > a ? x.doneAt : a), ""); }

// ------------------------------------------------------------------ leave
function leaveNudge(name) {
  if (!name) return null;
  const mon = M.mondayOf(today());
  if (checkinFor(name, mon)) return null;
  return h("div", { class: "banner info" }, h("span", null, h("b", null, `Leave check for the week of ${fmtDate(mon)}. `), "Log any leave, or confirm you have none, so capacity stays right."),
    h("span", { class: "spacer" }), h("button", { class: "btn sm", onclick: () => { const app = currentApp(); S.tab[app] = "leave"; render(); } }, "Open leave"),
    h("button", { class: "btn sm", onclick: () => checkin(name, "none") }, "No leave this week"));
}
function checkin(name, state) {
  const mon = M.mondayOf(today());
  const cur = S.leaveDocs[S.me.id] || {};
  const byDesigner = clone(cur.byDesigner || {});
  byDesigner[name] = { ...(byDesigner[name] || {}), [mon]: { state, at: nowIso() } };
  guard("ci", async () => { await db.doc(`leave/${S.me.id}`).set({ byDesigner }); await ensureOwnerId(); toast(state === "none" ? "Thanks. No leave this week" : "Leave logged"); });
}
function leaveForm(name) {
  const f = S.leaveForm || (S.leaveForm = { from: "", to: "", type: "Planned Leave", note: "", err: "" });
  const days = workdays(f.from, f.to);
  return h("div", { class: "card pad stack" }, h("h3", null, "Add leave"),
    h("div", { class: "fields" },
      field("From", "l-from", h("input", { id: "l-from", type: "date", value: f.from, onchange: (e) => { f.from = e.target.value; if (!f.to || f.to < f.from) f.to = f.from; render(); } })),
      field("To", "l-to", h("input", { id: "l-to", type: "date", value: f.to, min: f.from || null, onchange: (e) => { f.to = e.target.value; render(); } })),
      field("Type", "l-type", select("l-type", f.type, LEAVE_TYPES, (v) => { f.type = v; }))),
    field("Note (optional)", "l-note", h("input", { id: "l-note", type: "text", maxlength: "120", value: f.note, oninput: (e) => { f.note = e.target.value; } })),
    h("div", { class: "hint" }, days != null ? `${days} working day${days === 1 ? "" : "s"} off (weekends and company holidays excluded)` : "One row per continuous leave."),
    f.err ? h("div", { class: "err" }, f.err) : null,
    h("div", null, h("button", { class: "btn accent", disabled: S.busy.leave || !name, onclick: () => {
      if (!f.from || !f.to) { f.err = "Add both dates."; return render(); }
      if (f.to < f.from) { f.err = "The end date is before the start date."; return render(); }
      guard("leave", async () => {
        await db.collection(`leave/${S.me.id}/items`).add({ designer: name, from: f.from, to: f.to, type: f.type, note: f.note.trim(), createdAt: nowIso() });
        await ensureOwnerId();
        const mon = M.mondayOf(today());
        S.leaveForm = null;
        if (f.from <= M.addDays(mon, 6) && f.to >= mon) checkin(name, "logged"); else toast("Leave added");
      });
    } }, `Add leave${roleOf() === "admin" && name ? " for " + name : ""}`)));
}
function leaveTable(rows, showName) {
  if (!rows.length) return h("div", { class: "card empty" }, h("h3", null, "No leave logged"), h("p", { style: "margin:0" }, "Leave added here reduces capacity on the Scorecard and in availability."));
  return h("div", { class: "card tbl-wrap" }, h("table", null,
    h("thead", null, h("tr", null, [showName ? "Designer" : null, "From", "To", "Type", "Working days", "Note", ""].filter((x) => x !== null).map((x) => h("th", null, x)))),
    h("tbody", null, rows.map((l) => {
      const mineRow = l.uid === S.me.id || S.me.isOwner;
      const key = "lv" + l.uid + l.id;
      return h("tr", null, showName ? h("td", null, l.designer) : null, h("td", null, fmtDate(l.from, true)), h("td", null, fmtDate(l.to, true)), h("td", null, l.type),
        h("td", { class: "n" }, workdays(l.from, l.to)), h("td", { class: "small muted" }, l.note || ""),
        h("td", { style: "text-align:right" }, !mineRow ? null : S.confirm === key
          ? h("span", null, h("button", { class: "btn sm danger", onclick: () => guard("dl", async () => { await db.doc(`leave/${l.uid}/items/${l.id}`).delete(); S.confirm = null; toast("Leave removed"); }) }, "Remove"),
            h("button", { class: "btn sm ghost", onclick: () => { S.confirm = null; render(); } }, "Keep"))
          : h("button", { class: "btn sm ghost danger", onclick: () => { S.confirm = key; render(); } }, "Remove")));
    }))));
}
function viewDesignerLeave(root) {
  const name = designerName();
  const mine = allLeave().filter((l) => l.designer === name).sort((a, b) => (a.from < b.from ? 1 : -1));
  const mon = M.mondayOf(today());
  const st = checkinFor(name, mon);
  root.appendChild(head("Weekly leave check", "My leave", "Update this every week. It feeds the Leave & Holidays sheet, so workload and capacity stay right."));
  root.appendChild(h("div", { class: "banner " + (st ? "good" : "info") }, st ? `Week of ${fmtDate(mon)} is confirmed (${st.state === "none" ? "no leave" : "leave logged"}).`
    : h("span", null, `Week of ${fmtDate(mon)} is not confirmed yet. Add leave below, or `, h("button", { class: "btn sm", onclick: () => checkin(name, "none") }, "confirm no leave this week"))));
  const hol = (cfg().holidays || []).filter((x) => x.date >= today()).slice(0, 5);
  root.appendChild(h("div", { class: "grid2" }, h("div", { class: "stack" }, leaveTable(mine, false),
    hol.length ? h("div", { class: "card pad small" }, h("b", null, "Upcoming company holidays: "), hol.map((x) => `${fmtDate(x.date, true)} ${x.name}`).join(", ")) : null), leaveForm(name)));
}

// ========================================================== OWNER DASHBOARD
async function ensureOwnerId() {}
function funnelStages() {
  const reqs = allRequests(), all = tasks();
  const open = all.filter((t) => !t.actualEnd);
  return [
    { key: "pending", label: "Awaiting approval", v: reqs.filter((r) => r.status === "pending").length, color: "var(--warn)", go: () => { S.tab.owner = "funnel"; S.funnelTab = "pending"; } },
    { key: "changes", label: "Changes requested", v: reqs.filter((r) => r.status === "changes").length, color: "var(--serious)", go: () => { S.tab.owner = "funnel"; S.funnelTab = "changes"; } },
    { key: "Not Started", label: "Approved, not started", v: open.filter((t) => t.status === "Not Started").length, color: "var(--s1)", go: () => { S.tab.owner = "tasks"; S.filters.stage = "Not Started"; } },
    { key: "In Progress", label: "In progress", v: open.filter((t) => t.status === "In Progress").length, color: "var(--s3)", go: () => { S.tab.owner = "tasks"; S.filters.stage = "In Progress"; } },
    { key: "In Review", label: "In review", v: open.filter((t) => t.status === "In Review").length, color: "var(--s5)", go: () => { S.tab.owner = "tasks"; S.filters.stage = "In Review"; } },
    { key: "Blocked", label: "Blocked", v: open.filter((t) => t.status === "Blocked").length, color: "var(--warn)", go: () => { S.tab.owner = "tasks"; S.filters.stage = "Blocked"; } },
    { key: "Done", label: "Done", v: all.filter((t) => t.actualEnd).length, color: "var(--good)", go: () => { S.tab.owner = "tasks"; S.filters.stage = "Done"; } },
  ];
}
function funnelStrip() {
  const st = funnelStages();
  const max = Math.max(1, ...st.map((s) => s.v));
  return h("div", { class: "funnel" }, st.map((s) => h("button", { class: "stage", onclick: () => { s.go(); render(); window.scrollTo(0, 0); } },
    h("span", { class: "v" }, s.v), h("span", { class: "l" }, s.label), h("span", { class: "meter" }, h("i", { style: `width:${(s.v / max) * 100}%;background:${s.color}` })))));
}
function periodRange() {
  const td = today(), [y, m] = td.split("-").map(Number);
  const iso = (Y, Mo, D) => `${Y}-${String(Mo).padStart(2, "0")}-${String(D).padStart(2, "0")}`;
  const lastDay = (Y, Mo) => new Date(Date.UTC(Y, Mo, 0)).getUTCDate();
  if (S.period === "month") return { from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)), label: `${MONTHS[m - 1]} ${y}` };
  if (S.period === "last") { const Y = m === 1 ? y - 1 : y, Mo = m === 1 ? 12 : m - 1; return { from: iso(Y, Mo, 1), to: iso(Y, Mo, lastDay(Y, Mo)), label: `${MONTHS[Mo - 1]} ${Y}` }; }
  if (S.period === "30") return { from: M.addDays(td, -29), to: td, label: "Last 30 days" };
  if (S.period === "quarter") { const q = Math.floor((m - 1) / 3); return { from: iso(y, q * 3 + 1, 1), to: iso(y, q * 3 + 3, lastDay(y, q * 3 + 3)), label: `Q${q + 1} ${y}` }; }
  return { from: S.custom.from || td, to: S.custom.to || td, label: "Custom" };
}
function viewOverview(root) {
  const c = cfg(), ctx = M.context(c), all = tasks(), p = periodRange(), leave = allLeave();
  const sc = M.scorecard(all, c.designers, p, ctx.s);
  const doneAll = all.filter((t) => String(t.delivery).startsWith("Done"));
  const onTime = doneAll.length ? doneAll.filter((t) => t.delivery === "Done On Time").length / doneAll.length : null;
  const scores = all.map((t) => t.score).filter((v) => v !== "");
  const inP = (d) => d >= p.from && d <= p.to;
  const hoursP = all.reduce((a, t) => a + (t.updates || []).filter((u) => inP(u.d)).reduce((x, u) => x + (Number(u.hours) || 0), 0), 0);
  const pendingN = allRequests().filter((r) => r.status === "pending").length;
  const overdueN = all.filter((t) => t.delivery === "Overdue").length;
  const itemsDoneP = all.reduce((a, t) => a + (t.deliverables || []).filter((x) => x.status === "Done" && x.doneAt && inP(x.doneAt)).length, 0);
  root.appendChild(hero({ kicker: "Performance and productivity", title: pendingN ? `${pendingN} request${pendingN === 1 ? "" : "s"} waiting for your approval` : "Your design team at a glance",
    text: "Same formulas as your Scorecard. Speed and Quality use tasks completed in the period; Commitment is as of today.",
    stats: [[String(all.length - doneAll.length), "Open tasks", overdueN ? "bad" : null, "list", overdueN ? `${overdueN} overdue` : "none overdue"],
      [pct(onTime), "On-time delivery", onTime !== null && onTime >= .8 ? "good" : null, "check", `${doneAll.length} done`],
      [scores.length ? fmt0(scores.reduce((a, b) => a + b, 0) / scores.length) : "-", "Avg task score", null, "chart", "out of 100"],
      [fmt1(hoursP), `Hours logged, ${p.label}`, null, "clock", `${itemsDoneP} deliverables done`]],
    actions: [h("div", { class: "seg" }, [["month", "This month"], ["last", "Last month"], ["30", "30 days"], ["quarter", "Quarter"], ["custom", "Custom"]].map(([k, l]) => h("button", { "aria-pressed": String(S.period === k), onclick: () => { S.period = k; render(); } }, l))),
      S.period === "custom" ? h("div", { class: "row" }, h("input", { id: "p-from", type: "date", value: S.custom.from, "aria-label": "Period from", onchange: (e) => { S.custom.from = e.target.value; render(); } }),
        h("input", { id: "p-to", type: "date", value: S.custom.to, "aria-label": "Period to", onchange: (e) => { S.custom.to = e.target.value; render(); } })) : null] }));
  const weeks = Array.from({ length: 8 }, (_, i) => M.addDays(M.mondayOf(today()), 7 * i));
  const heat = h("div", { class: "heat", style: "grid-template-columns: minmax(70px, 110px) repeat(8, minmax(42px, 1fr));min-width:470px" },
    h("div"), weeks.map((w) => h("div", { class: "hd" }, fmtDate(w))), c.designers.map((d) => [h("div", { class: "nm" }, d), weeks.map((w) => heatCell(all, leave, d, w, ctx))]));
  const dcounts = Object.keys(DELIVERY).map((k) => ({ label: k, values: [{ v: all.filter((t) => t.delivery === k).length, color: DELIVERY_COLOR[k], name: "Tasks" }] }));
  const lastWeeks = Array.from({ length: 8 }, (_, i) => M.addDays(M.mondayOf(today()), -7 * (7 - i)));
  const series = c.designers.slice(0, 5).map((d, i) => ({ name: d, color: SERIES[i], points: lastWeeks.map((w) => ({ x: fmtDate(w),
    y: all.filter((t) => t.designer === d).reduce((a, t) => a + (t.updates || []).filter((u) => u.d >= w && u.d < M.addDays(w, 7)).reduce((s2, u) => s2 + (Number(u.hours) || 0), 0), 0) })) }));
  const lineRows = lines().map((l) => { const ts = all.filter((t) => (t.fourE || lineOf(t.master)) === l.name);
    return { label: l.name, total: ts.length, values: [{ v: ts.reduce((a, t) => a + (Number(t.effort) || 0), 0), color: "var(--s1)", name: "Estimated hrs" }, { v: ts.reduce((a, t) => a + t.hoursLogged, 0), color: "var(--s2)", name: "Logged hrs" }] }; }).filter((r) => r.total);
  const claimsN = Object.keys(S.claims).length;
  root.appendChild(h("div", { class: "grid-main" },
    h("div", { class: "stack section-stack" },
      h("div", { class: "card pad stack" }, cardHead("Task funnel", "From request to done", () => go("owner", "funnel"), "Open funnel"), funnelStrip()),
      h("div", { class: "grid-half" },
        h("div", { class: "card pad stack" }, cardHead("Hours logged per week", null, () => go("owner", "designers")), series.length ? lineChart(series) : h("div", { class: "hint" }, "No designers yet."),
          series.length > 1 ? h("div", { class: "legend" }, series.map((s) => h("span", null, h("i", { style: `background:${s.color}` }), s.name))) : null),
        h("div", { class: "card pad stack" }, cardHead("Tasks by delivery status", null, () => go("owner", "tasks")), hbar(dcounts, { unit: "tasks" }))),
      h("div", { class: "card pad stack" }, cardHead("Workload, next 8 weeks", "Approved work as a share of capacity", () => go("owner", "leave"), "Leave & holidays"),
        c.designers.length ? h("div", { class: "tbl-wrap" }, heat) : h("div", { class: "hint" }, "No designers yet."),
        h("div", { class: "legend" }, Object.entries(WL).map(([k, v]) => h("span", null, h("i", { style: `background:var(--${v === "neutral" ? "faint" : v + "-ink"})` }), k))))),
    h("div", { class: "stack section-stack" },
      quickActions([["funnel", "Review requests", () => go("owner", "funnel"), pendingN], ["user-plus", "Approve access", () => go("owner", "people"), claimsN],
        ["list", "View all tasks", () => go("owner", "tasks")], ["sliders", "Edit lists and 4E", () => go("owner", "lists")], ["download", "Export to Excel", () => go("owner", "export")]]),
      h("div", { class: "card pad stack" }, cardHead("Effort by 4E line"), lineRows.length ? hbar(lineRows, { unit: "hrs" }) : h("div", { class: "hint" }, "Appears once tasks are approved."),
        lineRows.length ? h("div", { class: "legend" }, h("span", null, h("i", { style: "background:var(--s1)" }), "Estimated hours"), h("span", null, h("i", { style: "background:var(--s2)" }), "Logged hours")) : null))));
  root.appendChild(h("div", { class: "card" }, h("div", { class: "pad card-head" }, cardHead(`Designer scorecard, ${p.label}`, null, () => go("owner", "designers"))),
    h("div", { class: "tbl-wrap" }, h("table", null,
      h("thead", null, h("tr", null, h("th", null, "Designer"), h("th", { class: "n" }, "Done"), h("th", { class: "n" }, "Avg TAT"), h("th", { class: "n" }, "On-time"), h("th", null, "Speed"), h("th", null, "Quality"), h("th", null, "Commitment"), h("th", { class: "n" }, "Overall"), h("th", null, "Rating"), h("th", null, "Focus area"))),
      h("tbody", null, sc.length ? sc.map((r) => h("tr", null, h("td", { style: "font-weight:600" }, r.designer), h("td", { class: "n" }, r.completed), h("td", { class: "n" }, fmt1(r.avgTat)), h("td", { class: "n" }, pct(r.onTime)),
        scoreCell(r.speed, "var(--s1)"), scoreCell(r.quality, "var(--s2)"), scoreCell(r.commitment, "var(--s3)"), h("td", { class: "n", style: "font-weight:700" }, fmt0(r.overall)),
        h("td", null, r.rating === "-" ? pill("No data", "neutral") : pill(r.rating, { Excellent: "good", Good: "info", "Needs Improvement": "warn", "At Risk": "critical" }[r.rating])),
        h("td", { class: "small muted", style: "min-width:220px" }, r.focus))) : h("tr", null, h("td", { colspan: "10", class: "empty" }, "Add designers under Lists & 4E.")))))));
  const pmRows = M.pmTable(all.map((t) => ({ ...t, pm: t.assignedBy || t.pm })), c.pms);
  const stale = all.filter((t) => !t.actualEnd && t.start && t.start <= today() && (!t.lastUpdate || workdays(t.lastUpdate, today()) > 2));
  const attention = all.filter((t) => t.delivery === "Overdue" || t.delivery === "Blocked").concat(stale.filter((t) => t.delivery !== "Overdue" && t.delivery !== "Blocked"));
  root.appendChild(h("div", { class: "grid-half" },
    h("div", { class: "card" }, h("div", { class: "pad card-head" }, cardHead("Tasks by requesting PM")),
      h("div", { class: "tbl-wrap" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "PM"), ["Approved", "Open", "Blocked", "Overdue", "Avg revisions"].map((x) => h("th", { class: "n" }, x)))),
        h("tbody", null, pmRows.map((r) => h("tr", null, h("td", null, r.pm), h("td", { class: "n" }, r.created), h("td", { class: "n" }, r.open), h("td", { class: "n" }, r.blocked), h("td", { class: "n" }, r.overdue), h("td", { class: "n" }, fmt1(r.avgRevisions)))))))),
    h("div", { class: "card pad stack" }, cardHead("Needs attention", "Overdue, blocked, or quiet for 2+ working days", () => go("owner", "tasks")),
      attention.length ? h("div", { class: "stack", style: "gap:8px" }, attention.slice(0, 12).map((t) => h("div", { class: "row", style: "gap:8px;align-items:flex-start" },
        h("span", { class: "mono muted" }, t.taskId), h("div", { style: "flex:1;min-width:0" }, h("div", { style: "font-weight:600" }, t.title), h("div", { class: "small muted" }, `${t.designer} · ${t.master} / ${t.sub}` + (t.blockers ? ` · ${t.blockers}` : ""))),
        t.delivery === "Overdue" || t.delivery === "Blocked" ? deliveryPill(t) : pill(t.lastUpdate ? "Quiet since " + fmtDate(t.lastUpdate) : "No updates yet", "warn")))) : h("div", { class: "hint" }, "Nothing needs attention."))));
}

// ---- funnel review
function reviewFor(r) {
  if (!S.review[r.id] || S.review[r.id].updatedAt !== r.updatedAt) S.review[r.id] = { updatedAt: r.updatedAt, subtasks: clone(r.subtasks || []), note: "", err: "", subErr: {}, project: r.project || "", pmName: r.pmName, projectKeep: false };
  return S.review[r.id];
}
function viewFunnel(root) {
  const reqs = allRequests().filter((r) => r.status !== "draft");
  const tabs = [["pending", "Awaiting approval"], ["changes", "Changes requested"], ["decided", "Decided"]];
  const pick = (k) => reqs.filter((r) => (k === "decided" ? ["approved", "rejected"].includes(r.status) : r.status === k));
  const list = pick(S.funnelTab).sort((a, b) => ((a.resubmittedAt || a.submittedAt) < (b.resubmittedAt || b.submittedAt) ? (S.funnelTab === "decided" ? 1 : -1) : (S.funnelTab === "decided" ? -1 : 1)));
  root.appendChild(head("Review and approve", "Task funnel", "Requests from PMs wait here. Adjust designers and dates if needed, then approve to create Tracker tasks, or send it back with a note.",
    h("div", { class: "seg" }, tabs.map(([k, l]) => h("button", { "aria-pressed": String(S.funnelTab === k), onclick: () => { S.funnelTab = k; render(); } }, `${l} (${pick(k).length})`)))));
  root.appendChild(funnelStrip());
  root.appendChild(projectDatalist());
  if (!list.length) return root.appendChild(h("div", { class: "card empty" }, h("h3", null, S.funnelTab === "pending" ? "No requests waiting" : "Nothing here"),
    h("p", { style: "margin:0" }, S.funnelTab === "pending" ? "PMs submit requests from Task Creation. Share its link from People & links." : "")));
  for (const r of list) root.appendChild(S.funnelTab === "pending" ? reviewCard(r) : decidedCard(r));
}
function reqHeader(r) {
  return h("div", { class: "req-head" }, h("div", { class: "t" },
    h("div", { class: "row", style: "gap:6px" }, h("span", { class: "mono muted" }, r.ref || ""), h("span", { class: "tag" }, r.fourE), h("span", { class: "tag sub" }, r.product), r.priority === "High" ? pill("High priority", "serious") : null),
    h("h3", { style: "margin-top:6px" }, r.masterTitle),
    h("div", { class: "small muted" }, `${r.project}${projectNames().includes(r.project) ? ` (lead ${M.projectLead(cfg(), r.project)})` : r.status === "approved" ? "" : " (new project)"} · requested by ${r.pmName} · submitted ${fmtDate(r.submittedAt)}` + (r.resubmittedAt ? `, resubmitted ${fmtDate(r.resubmittedAt)}` : ""))),
    reqPill(r.status));
}
function reviewCard(r) {
  const rv = reviewFor(r), c = cfg();
  const hours = rv.subtasks.reduce((a, s) => a + (Number(s.effort) || 0), 0);
  const rows = rv.subtasks.map((s, i) => {
    const e = rv.subErr[s.key] || {};
    const id = (k) => `rv-${k}-${r.id}-${i}`;
    return h("tr", null, h("td", { class: "mono" }, String(i + 1)),
      h("td", { style: "min-width:220px" }, h("b", null, s.sub), s.parentKey ? h("span", { class: "tag sub", style: "margin-left:6px" }, "Split share") : null,
        h("div", { class: "small muted", style: "max-width:48ch;white-space:pre-line" }, s.detail),
        (s.items || []).length ? h("div", { class: "hint" }, `Named: ${(s.items || []).map((x) => x.title).join(", ")}`) : null),
      h("td", null, qtyOf(s) > 1 || s.parentKey ? h("div", { class: "stack", style: "gap:6px;min-width:120px" },
        h("div", { class: "row", style: "gap:6px;flex-wrap:nowrap" }, h("input", { id: id("q"), type: "number", min: "1", step: "1", value: s.qty, "aria-label": "Quantity", style: "width:72px", oninput: (ev) => { s.qty = Math.max(1, Math.floor(Number(ev.target.value) || 1)); softRender(); } }), h("span", { class: "small muted" }, s.unit || "items")),
        h("div", { class: "row", style: "gap:4px" }, qtyOf(s) > 1 ? h("button", { class: "btn sm ghost", onclick: () => { splitRow(rv, i); render(); } }, "Split") : null,
          s.parentKey && rv.subtasks.filter((x) => x.parentKey === s.parentKey).length > 1 ? h("button", { class: "btn sm ghost danger", onclick: () => { foldRow(rv, i); render(); } }, "Merge back") : null))
        : h("span", { class: "muted small" }, "1")),
      h("td", { style: "min-width:150px" }, select(id("d"), s.designer, c.designers, (v) => { s.designer = v; delete e.designer; render(); }, "Choose"), e.designer ? h("div", { class: "err" }, e.designer) : null),
      h("td", null, h("input", { id: id("s"), type: "date", value: s.start, "aria-label": "Start", onchange: (ev) => { s.start = ev.target.value; render(); } })),
      h("td", null, h("input", { id: id("e"), type: "date", value: s.end, min: s.start || null, "aria-label": "End", onchange: (ev) => { s.end = ev.target.value; render(); } }), e.end ? h("div", { class: "err" }, e.end) : null),
      h("td", null, h("input", { id: id("h"), type: "number", min: "0.5", step: "0.5", value: s.effort, "aria-label": "Hours", style: "width:84px", oninput: (ev) => { s.effort = ev.target.value; softRender(); } })));
  });
  const impact = capacityImpact(rv.subtasks);
  return h("article", { class: "card pad req" }, reqHeader(r),
    r.brief ? h("div", { class: "small", style: "overflow-wrap:anywhere" }, h("b", null, "Brief: "), r.brief) : null,
    projectNames().includes(rv.project.trim()) && rv.project.trim() === r.project ? null : h("div", { class: "field", style: "max-width:520px" }, h("label", { for: "rv-prj-" + r.id }, "Project"),
      h("input", { id: "rv-prj-" + r.id, type: "text", list: "dl-projects", maxlength: "80", autocomplete: "off", value: rv.project, oninput: (ev) => { rv.project = ev.target.value; rv.projectKeep = false; rv.err = ""; softRender(); }, onchange: (ev) => { rv.project = ev.target.value; render(); } }),
      projectHint(rv, (v) => { rv.project = v; render(); }, () => { rv.projectKeep = true; render(); }, false)),
    h("div", { class: "tbl-wrap" }, h("table", null, h("thead", null, h("tr", null, ["#", "Subtask", "Qty", "Designer", "Start", "End", "Hours"].map((x) => h("th", null, x)))), h("tbody", null, rows))),
    requestTimeline(rv.subtasks),
    impact.length ? h("div", { class: "stack", style: "gap:6px" }, h("div", { class: "label" }, "Capacity after approval"),
      impact.map((x) => h("div", { class: "cap" }, h("b", null, x.designer), pill(x.after.status, WL[x.after.status]),
        h("span", null, `week of ${fmtDate(x.week)}: ${pct(x.before.utilisation)} now, ${pct(x.after.utilisation)} with this request`), x.leave ? h("span", null, `, ${x.leave} leave day${x.leave === 1 ? "" : "s"} in range`) : null))) : null,
    field("Note to the PM", "rv-note-" + r.id, h("textarea", { id: "rv-note-" + r.id, rows: "2", placeholder: "Required when you send it back or reject it", value: rv.note, oninput: (ev) => { rv.note = ev.target.value; rv.err = ""; } }), rv.err),
    h("div", { class: "row" },
      h("button", { class: "btn accent", disabled: S.busy.decide, onclick: () => approveRequest(r, rv) }, `Approve and create ${rv.subtasks.length} task${rv.subtasks.length === 1 ? "" : "s"}`),
      h("button", { class: "btn", disabled: S.busy.decide, onclick: () => decide(r, rv, "changes") }, "Request changes"),
      h("button", { class: "btn ghost danger", disabled: S.busy.decide, onclick: () => decide(r, rv, "rejected") }, "Reject"),
      h("span", { class: "hint" }, `${fmt1(hours)} hrs total`)));
}
// Split one batch row into two shares (for two designers); items and hours follow the quantity
function splitRow(rv, i) {
  const s = rv.subtasks[i], q = qtyOf(s);
  if (q < 2) return;
  const qa = Math.ceil(q / 2), qb = q - qa;
  const items = s.items || [];
  const effort = Number(s.effort) || 0, ea = Math.round((effort * qa / q) * 2) / 2;
  const parent = s.parentKey || s.key;
  const b = { ...clone(s), key: Math.random().toString(36).slice(2, 9), parentKey: parent, qty: qb, designer: "", effort: Math.max(0.5, effort - ea),
    items: items.slice(qa).map((it, j) => ({ ...it, id: "i" + (j + 1) })) };
  Object.assign(s, { parentKey: parent, qty: qa, effort: ea || 0.5, items: items.slice(0, qa) });
  rv.subtasks.splice(i + 1, 0, b);
}
function foldRow(rv, i) {
  const s = rv.subtasks[i];
  const j = rv.subtasks.findIndex((x, k) => k !== i && x.parentKey === s.parentKey);
  if (j < 0) return;
  const t = rv.subtasks[j];
  const offset = qtyOf(t);
  t.qty = qtyOf(t) + qtyOf(s);
  t.effort = (Number(t.effort) || 0) + (Number(s.effort) || 0);
  t.items = (t.items || []).concat((s.items || []).map((it, k) => ({ ...it, id: "i" + (offset + k + 1) })));
  rv.subtasks.splice(i, 1);
  if (rv.subtasks.filter((x) => x.parentKey === t.parentKey).length === 1) delete t.parentKey;
}
function capacityImpact(subtasks) {
  const ctx = M.context(cfg()), all = tasks(), leave = allLeave();
  const out = [];
  for (const d of [...new Set(subtasks.map((s) => s.designer).filter(Boolean))]) {
    const mine = subtasks.filter((s) => s.designer === d && s.start && s.end && s.end >= s.start);
    if (!mine.length) continue;
    const hyp = mine.map((s) => M.derive({ master: "x", designer: d, start: s.start, target: s.end, effort: Number(s.effort) || 0 }, ctx));
    const from = mine.map((s) => s.start).sort()[0], to = mine.map((s) => s.end).sort().slice(-1)[0];
    let best = null;
    for (let w = M.mondayOf(from); w <= to; w = M.addDays(w, 7)) {
      const after = M.week(all.concat(hyp), leave, d, w, ctx);
      if (!best || (after.utilisation || 0) > (best.after.utilisation || 0)) best = { week: w, after, before: M.week(all, leave, d, w, ctx) };
    }
    const load = designerLoad(d, from, to);
    out.push({ designer: d, ...best, leave: load.leave });
  }
  return out;
}
function approveRequest(r, rv) {
  rv.subErr = {};
  rv.subtasks.forEach((s) => {
    const e = {};
    if (!s.designer) e.designer = "Assign a designer.";
    if (!s.start || !s.end || s.end < s.start) e.end = "Check the dates.";
    if (Object.keys(e).length) rv.subErr[s.key] = e;
  });
  if (Object.keys(rv.subErr).length) { toast("Assign a designer and valid dates to every subtask"); return render(); }
  const names = projectNames();
  const project = M.matchNames(rv.project, names).exact || rv.project.trim();
  if (!project) { rv.err = "Name the project before approving."; return render(); }
  const base = Date.now(), at = new Date(base).toISOString();
  guard("decide", async () => {
    if (!names.includes(project)) {
      const conf = S.config ? clone(S.config) : clone(EMPTY_CFG);
      conf.projects = conf.projects.concat([{ name: project, lead: r.pmName || "" }]);
      await db.doc("config/main").set(conf);
    }
    const out = [];
    for (let i = 0; i < rv.subtasks.length; i++) {
      const s = rv.subtasks[i];
      const ref = db.doc(`tasks/${r.id}-${s.key}`); // stable id: a retried approval overwrites instead of duplicating
      await ref.set({ requestId: r.id, requestUid: r.uid, fourE: r.fourE, master: r.product, masterTitle: r.masterTitle, sub: s.sub, title: s.detail.split("\n")[0].slice(0, 140),
        detail: s.detail, brief: r.brief || "", project, designer: s.designer, qty: qtyOf(s), unit: qtyOf(s) > 1 ? s.unit || "items" : "", items: qtyOf(s) > 1 ? (s.items || []).slice(0, qtyOf(s)) : [], priority: r.priority, start: s.start, target: s.end, effort: Number(s.effort) || 0,
        assignedBy: r.pmName, requestedAt: r.submittedAt, approvedAt: at, createdAt: new Date(base + i).toISOString(), createdBy: S.me.id });
      out.push({ ...s, qty: qtyOf(s), effort: Number(s.effort) || 0, taskId: ref.id });
    }
    await db.doc(`requests/${r.uid}/items/${r.id}`).update({ status: "approved", subtasks: out, project, decidedAt: at, ownerNote: rv.note.trim(), updatedAt: at,
      history: (r.history || []).concat([{ at, status: "approved", by: "owner", note: rv.note.trim() }]) });
    delete S.review[r.id];
    toast(`Approved. ${out.length} task${out.length === 1 ? "" : "s"} added to the Tracker` + (names.includes(project) ? "" : `, and "${project}" added to projects`));
  });
}
function decide(r, rv, status) {
  if (!rv.note.trim()) { rv.err = status === "changes" ? "Tell the PM what to change." : "Add a short reason for the PM."; return render(); }
  const at = nowIso();
  guard("decide", async () => {
    await db.doc(`requests/${r.uid}/items/${r.id}`).update({ status, ownerNote: rv.note.trim(), decidedAt: at, updatedAt: at, subtasks: rv.subtasks.map((s) => ({ ...s, effort: Number(s.effort) || 0 })),
      history: (r.history || []).concat([{ at, status, by: "owner", note: rv.note.trim() }]) });
    delete S.review[r.id];
    toast(status === "changes" ? "Sent back to the PM" : "Request rejected");
  });
}
function decidedCard(r) {
  const byId = new Map(tasks().map((t) => [t.id, t]));
  return h("article", { class: "card pad req" }, reqHeader(r),
    r.ownerNote ? h("div", { class: "note-box" }, h("b", null, "Your note: "), r.ownerNote) : null,
    h("div", { class: "tbl-wrap" }, h("table", null, h("thead", null, h("tr", null, ["Task", "Subtask", "Designer", "Timeline", "Hours", "Status"].map((x) => h("th", null, x)))),
      h("tbody", null, (r.subtasks || []).map((s, i) => { const t = s.taskId && byId.get(s.taskId);
        return h("tr", null, h("td", { class: "mono" }, t ? t.taskId : String(i + 1)), h("td", null, h("b", null, s.sub), qtyOf(s) > 1 ? h("span", { class: "tag sub", style: "margin-left:6px" }, unitLabel(s)) : null, h("div", { class: "small muted", style: "max-width:48ch" }, s.detail)), h("td", null, s.designer || "-"),
          h("td", { class: "small" }, `${fmtDate(s.start)} to ${fmtDate(s.end)}`), h("td", { class: "n" }, fmt1(s.effort)), h("td", null, t ? deliveryPill(t) : r.status === "approved" ? pill("Removed", "neutral") : "-")); })))));
}

// ---- all tasks (owner)
function viewAllTasks(root) {
  const f = S.filters, c = cfg();
  let list = tasks();
  if (f.designer) list = list.filter((t) => t.designer === f.designer);
  if (f.project) list = list.filter((t) => t.project === f.project);
  if (f.stage) list = list.filter((t) => (f.stage === "Done" ? !!t.actualEnd : !t.actualEnd && t.status === f.stage));
  if (f.q) { const q = f.q.toLowerCase(); list = list.filter((t) => [t.title, t.master, t.sub, t.taskId, t.assignedBy, t.masterTitle, t.fourE].join(" ").toLowerCase().includes(q)); }
  root.appendChild(head("Tracker", "All tasks", "Approved tasks in Tracker order. IDs match the workbook."));
  root.appendChild(h("div", { class: "fields" },
    field("Search", "f-q", h("input", { id: "f-q", type: "text", placeholder: "Title, product, ID or PM", value: f.q, oninput: (e) => { f.q = e.target.value; softRender(); } })),
    field("Designer", "f-des", select("f-des", f.designer, c.designers, (v) => { f.designer = v; render(); }, "All")),
    field("Project", "f-prj", select("f-prj", f.project, c.projects.map((p) => p.name), (v) => { f.project = v; render(); }, "All")),
    field("Stage", "f-stage", select("f-stage", f.stage, STATUSES, (v) => { f.stage = v; render(); }, "All"))));
  if (S.edit) root.appendChild(taskEditor());
  if (!list.length) return root.appendChild(h("div", { class: "card empty" }, h("h3", null, "No tasks match"), h("p", { style: "margin:0" }, "Approve a request in the Task funnel, or clear a filter.")));
  root.appendChild(h("div", { class: "card tbl-wrap" }, h("table", null,
    h("thead", null, h("tr", null, ["ID", "Task", "Designer", "Status", "Dates", "Delivery", "Last update", ""].map((x) => h("th", null, x)))),
    h("tbody", null, list.slice().reverse().map((t) => h("tr", null, h("td", { class: "mono" }, t.taskId),
      h("td", { style: "min-width:240px" }, h("div", { class: "row", style: "gap:6px" }, t.fourE ? h("span", { class: "tag sub" }, t.fourE) : null, h("span", { class: "tag" }, t.master), h("span", { class: "tag sub" }, t.sub)),
        h("div", { style: "font-weight:600;margin-top:4px" }, t.title, qtyOf(t) > 1 ? h("span", { class: "tag sub", style: "margin-left:6px" }, `${t.itemsDone || 0}/${qtyOf(t)} ${t.unit || "items"}`) : null), h("div", { class: "small muted" }, `${t.masterTitle ? t.masterTitle + " · " : ""}${t.project} · by ${t.assignedBy || "-"}`)),
      h("td", null, t.designer),
      h("td", null, h("div", null, t.status), h("div", { class: "bar-cell", style: "margin-top:6px" }, h("span", { class: "track" }, h("i", { style: `width:${t.progress || 0}%;background:var(--ks-orange)` })), h("span", { class: "num small" }, (t.progress || 0) + "%"))),
      h("td", { class: "small" }, h("div", null, `${fmtDate(t.start)} to ${fmtDate(t.target)}`), h("div", { class: "muted" }, t.actualEnd ? "Done " + fmtDate(t.actualEnd) : workdaysLeft(t))),
      h("td", null, deliveryPill(t), t.blockers ? h("div", { class: "small", style: "margin-top:4px;color:var(--warn-ink)" }, t.blockers) : null),
      h("td", { class: "small muted" }, t.lastUpdate ? fmtDate(t.lastUpdate) : "No updates", t.hoursLogged ? h("div", null, fmt1(t.hoursLogged) + " hrs") : null),
      h("td", { style: "white-space:nowrap;text-align:right" }, S.confirm === t.id
        ? h("span", null, h("button", { class: "btn sm danger", onclick: () => guard("del", async () => { await db.doc("tasks/" + t.id).delete(); S.confirm = null; toast("Task deleted"); }) }, "Delete"), h("button", { class: "btn sm ghost", onclick: () => { S.confirm = null; render(); } }, "Keep"))
        : h("span", null, h("button", { class: "btn sm ghost", onclick: () => { S.edit = { id: t.id, taskId: t.taskId, title: t.title, designer: t.designer, start: t.start, target: t.target, effort: String(t.effort || ""), priority: t.priority, err: "" }; render(); window.scrollTo(0, 0); } }, "Edit"),
          h("button", { class: "btn sm ghost danger", onclick: () => { S.confirm = t.id; render(); } }, "Delete")))))))));
}
function taskEditor() {
  const e = S.edit, c = cfg();
  return h("div", { class: "card pad stack" }, h("h3", null, `Edit ${e.taskId}`),
    field("Title", "te-title", h("input", { id: "te-title", type: "text", value: e.title, oninput: (ev) => { e.title = ev.target.value; } })),
    h("div", { class: "fields" },
      field("Designer", "te-des", select("te-des", e.designer, c.designers, (v) => { e.designer = v; })),
      field("Priority", "te-pri", select("te-pri", e.priority, PRIORITIES, (v) => { e.priority = v; })),
      field("Start", "te-start", h("input", { id: "te-start", type: "date", value: e.start, onchange: (ev) => { e.start = ev.target.value; } })),
      field("Target end", "te-end", h("input", { id: "te-end", type: "date", value: e.target, onchange: (ev) => { e.target = ev.target.value; } })),
      field("Effort (hours)", "te-eff", h("input", { id: "te-eff", type: "number", min: "0.5", step: "0.5", value: e.effort, oninput: (ev) => { e.effort = ev.target.value; } }))),
    e.err ? h("div", { class: "err" }, e.err) : null,
    h("div", { class: "row" }, h("button", { class: "btn accent", disabled: S.busy.te, onclick: () => {
      if (!e.title.trim() || !e.start || !e.target || e.target < e.start || !(Number(e.effort) > 0)) { e.err = "Check the title, dates and hours."; return render(); }
      guard("te", async () => { await db.doc("tasks/" + e.id).update({ title: e.title.trim(), designer: e.designer, priority: e.priority, start: e.start, target: e.target, effort: Number(e.effort) }); S.edit = null; toast("Task updated"); });
    } }, "Save"), h("button", { class: "btn", onclick: () => { S.edit = null; render(); } }, "Cancel")));
}

// ---- leave (owner)
function viewLeaveAdmin(root) {
  const c = cfg(), mon = M.mondayOf(today());
  root.appendChild(head("Leave & Holidays sheet", "Leave and holidays", "Designers log their own leave weekly. Company holidays are set under Lists & 4E."));
  root.appendChild(h("div", { class: "card pad" }, h("h3", null, `Weekly check, week of ${fmtDate(mon)}`),
    h("div", { class: "chips", style: "margin-top:10px" }, c.designers.map((d) => { const st = checkinFor(d, mon);
      return h("span", { class: "row", style: "gap:6px;margin-right:14px" }, h("b", null, d), st ? pill(st.state === "none" ? "No leave" : "Leave logged", "good") : pill("Not confirmed", "warn")); }))));
  const who = S.actingDesigner || c.designers[0] || "";
  root.appendChild(h("div", { class: "grid2" }, leaveTable(allLeave().sort((a, b) => (a.from < b.from ? 1 : -1)), true),
    h("div", { class: "stack" }, field("Add leave for", "la-des", select("la-des", who, c.designers, (v) => { S.actingDesigner = v; render(); })), leaveForm(who))));
}

// ---- people & links
function personOf(id) {
  const m = S.people[id] || S.claims[id];
  if (m) return { name: m.displayName || (m.email || "").split("@")[0] || "Member", email: m.email || "" };
  return { name: String(id || "").includes("@") ? id : "a member", email: String(id || "").includes("@") ? id : "" };
}
function inviteMessage(inv) {
  const link = `${baseUrl()}#${inv.role === "pm" ? "pm" : "designer"}`;
  return `Hi ${inv.name || ""},\n\nYou've been given access to Design Task Hub as ${ROLE_NAME[inv.role].toLowerCase()}.\n\n1. Open ${link}\n2. Choose "Create your account" and sign up with ${inv.email}\n3. Confirm your email from the message you receive\n\nAfter that the link opens straight to your page.`;
}
function viewPeople(root) {
  const c = cfg();
  root.appendChild(head("Role based access", "People & access", "Invite people by their official email and give each one a role. Product managers only see Task Creation, designers only see the Designer Tracker, and only you see this dashboard. The rules are enforced on the server, not just in the page."));
  const f = S.addForm || (S.addForm = { email: "", role: "designer", name: "", err: "", sent: null });
  const names = f.role === "pm" ? c.pms : c.designers;
  const memberEmails = new Set(Object.values(S.people).map((m) => (m.email || "").toLowerCase()));
  const invite = h("form", { class: "card pad stack", novalidate: true, onsubmit: (e) => {
    e.preventDefault();
    const email = f.email.trim().toLowerCase();
    f.err = ""; f.sent = null;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { f.err = "Enter their work email."; return render(); }
    if (!domainOk(email)) { f.err = `Only official @${CFG.allowedDomain} emails can be invited.`; return render(); }
    if (memberEmails.has(email)) { f.err = "This person already has access. Change their role in Members below."; return render(); }
    if (!f.name) { f.err = "Choose their name on the tracker."; return render(); }
    const inv = { email, role: f.role, name: f.name, invitedBy: S.me.id, at: nowIso() };
    guard("people", async () => { await db.doc(`invites/${email}`).set(inv); await audit("Invitation sent", email, `${ROLE_NAME[inv.role]} "${inv.name}"`);
      S.addForm = { email: "", role: f.role, name: "", err: "", sent: inv }; toast(`Invitation ready for ${email}`); });
  } },
    h("div", { class: "section-title" }, h("h2", null, "Invite someone"), h("span", { class: "muted" }, "They create their account with this email")),
    h("div", { class: "fields" },
      field("Work email", "add-email", h("input", { id: "add-email", type: "email", autocomplete: "off", placeholder: `name@${CFG.allowedDomain || "company.com"}`, value: f.email, oninput: (e) => { f.email = e.target.value; f.err = ""; } })),
      field("Role", "add-role", select("add-role", f.role, ROLE_OPTIONS, (v) => { f.role = v; f.name = ""; render(); })),
      field("Name on the tracker", "add-name", select("add-name", f.name, names, (v) => { f.name = v; f.err = ""; }, names.length ? "Choose" : "Add names under Lists & 4E"))),
    f.err ? h("div", { class: "err" }, f.err) : null,
    h("div", { class: "row" }, h("button", { type: "submit", class: "btn accent", disabled: S.busy.people }, "Invite"),
      h("span", { class: "hint" }, "Nothing is emailed automatically. Send them the invitation message below.")),
    f.sent ? h("div", { class: "banner good" }, h("span", null, h("b", null, `${f.sent.email} is invited. `), "Send them the sign-up steps."),
      h("span", { class: "spacer" }), h("button", { type: "button", class: "btn sm", onclick: () => copyText(inviteMessage(f.sent)) }, "Copy invitation message")) : null);

  const invites = Object.values(S.invites).sort((x, y) => (x.at < y.at ? 1 : -1));
  const pending = h("div", { class: "card pad stack" }, h("div", { class: "section-title" }, h("h2", null, "Pending invitations"), h("span", { class: "muted" }, String(invites.length))),
    invites.length ? invites.map((inv) => h("div", { class: "row", style: "gap:12px" }, avatar(null, inv.name || inv.email),
      h("div", { style: "flex:1;min-width:0" }, h("div", { style: "font-weight:600;color:var(--ink)" }, inv.email), h("div", { class: "small muted" }, `${ROLE_NAME[inv.role]} "${inv.name}", invited ${fmtWhen(inv.at)}`)),
      h("button", { class: "btn sm", onclick: () => copyText(inviteMessage(inv)) }, "Copy message"),
      h("button", { class: "btn sm ghost danger", onclick: () => guard("people", async () => { await db.doc(`invites/${inv.email}`).delete(); await audit("Invitation revoked", inv.email, `${ROLE_NAME[inv.role]} "${inv.name}"`); toast("Invitation revoked"); }) }, "Revoke")))
      : h("div", { class: "hint" }, "No open invitations. Invitations are used up when the person creates their account."));

  const claims = Object.entries(S.claims);
  const requests = h("div", { class: "card pad stack" }, h("div", { class: "section-title" }, h("h2", null, "Access requests"), h("span", { class: "muted" }, String(claims.length))),
    claims.length ? claims.map(([id, cl]) => h("div", { class: "row", style: "gap:12px" }, avatar(null, cl.displayName || cl.email),
      h("div", { style: "flex:1;min-width:0" }, h("div", { style: "font-weight:600;color:var(--ink)" }, cl.displayName || cl.email), h("div", { class: "small muted" }, `${cl.email} asks to join as ${ROLE_NAME[cl.role].toLowerCase()} "${cl.name || "?"}"`)),
      domainOk(cl.email) ? null : pill("Not an official email", "critical"),
      h("button", { class: "btn sm accent", disabled: S.busy.people || !domainOk(cl.email) || !cl.name, title: cl.name ? "" : "Pick a tracker name first", onclick: () => approveMember(id, cl) }, "Approve"),
      h("button", { class: "btn sm ghost danger", onclick: () => declineRequest(id, cl) }, "Decline"))) : h("div", { class: "hint" }, "No pending requests."));

  const link = (app, note) => h("div", { class: "link-row" }, h("div", null, h("b", { style: "color:var(--ink)" }, APPS[app].name), h("div", { class: "small muted" }, note), h("code", null, `${baseUrl()}#${app}`)),
    h("button", { class: "btn sm", onclick: () => copyText(`${baseUrl()}#${app}`) }, "Copy link"));
  const links = h("div", { class: "card pad stack" }, h("h2", null, "Links"), h("div", { class: "links" },
    link("pm", "For product managers. Create requests and follow approval."), link("designer", "For product designers. Daily progress, deliverables and weekly leave."), link("owner", "For you only. Anyone else is turned away.")));

  const members = Object.entries(S.people).sort(([, x], [, y]) => (x.role === "owner" ? -1 : y.role === "owner" ? 1 : (x.displayName || "").localeCompare(y.displayName || "")));
  const table = h("div", { class: "card" }, h("div", { class: "pad card-head" }, h("div", { class: "section-title" }, h("h2", null, "Members"), h("span", { class: "muted" }, String(members.length)))),
    h("div", { class: "tbl-wrap" }, h("table", null, h("thead", null, h("tr", null, ["Person", "Role", "Name on tracker", "Last signed in", ""].map((x) => h("th", null, x)))),
      h("tbody", null, members.map(([id, m]) => h("tr", null,
        h("td", null, h("span", { class: "row", style: "gap:8px;flex-wrap:nowrap" }, avatar(null, m.displayName || m.email, "avatar", "width:28px;height:28px"),
          h("span", { style: "min-width:0" }, h("b", { style: "display:block;color:var(--ink)" }, m.displayName || m.email), h("span", { class: "small muted" }, m.email)))),
        h("td", null, m.role === "owner" ? pill("Owner", "warn") : select("role-" + id, m.role, ROLE_OPTIONS, (v) => changeRole(id, { role: v, name: "" }))),
        h("td", null, m.role === "owner" ? h("span", { class: "muted small" }, "-") : select("rname-" + id, m.name, m.role === "pm" ? c.pms : c.designers, (v) => changeRole(id, { name: v }), "Choose")),
        h("td", { class: "small muted", style: "white-space:nowrap" }, S.sessions[id] && S.sessions[id].lastSignIn ? fmtWhen(S.sessions[id].lastSignIn) : "Not yet"),
        h("td", { style: "text-align:right" }, m.role === "owner" ? null : S.confirm === id
          ? h("span", null, h("button", { class: "btn sm danger", onclick: () => removeMember(id) }, "Remove"), h("button", { class: "btn sm ghost", onclick: () => { S.confirm = null; render(); } }, "Keep"))
          : h("button", { class: "btn sm ghost danger", onclick: () => { S.confirm = id; render(); } }, "Remove access"))))))));

  const log = ((S.auditLog && S.auditLog.entries) || []).slice(-40).reverse();
  const history = h("div", { class: "card pad stack" }, h("div", { class: "section-title" }, h("h2", null, "Access history"), h("span", { class: "muted" }, "Last 40 changes")),
    log.length ? h("div", { class: "stack", style: "gap:10px" }, log.map((e) => h("div", { class: "row", style: "gap:10px;align-items:flex-start;flex-wrap:nowrap" },
      avatar(null, personOf(e.target).name, "avatar", "width:28px;height:28px"),
      h("div", { style: "flex:1;min-width:0" }, h("div", { class: "small" }, h("b", { style: "color:var(--ink)" }, e.action), `: ${personOf(e.target).name}${e.detail ? ", " + e.detail : ""}`),
        h("div", { class: "hint" }, `${fmtWhen(e.at)} by ${e.by === S.me.id ? "you" : personOf(e.by).name}`))))) : h("div", { class: "hint" }, "Changes to access appear here."));
  root.appendChild(h("div", { class: "grid2" }, h("div", { class: "stack" }, invite, requests), h("div", { class: "stack" }, pending, links)));
  root.appendChild(table);
  root.appendChild(history);
}
// Access history (owner only): who changed whose access, and when. Bounded to the last 300 events.
async function audit(action, target, detail) {
  const entries = ((S.auditLog && S.auditLog.entries) || []).concat([{ at: nowIso(), by: S.me.id, action, target, detail: detail || "" }]).slice(-300);
  try { await db.doc("audit/log").set({ entries }); } catch (e) { console.error(e); }
}
function approveMember(id, cl) {
  guard("people", async () => {
    await db.doc(`members/${id}`).set({ role: cl.role, name: cl.name, email: cl.email, displayName: cl.displayName || "", joinedAt: nowIso(), approvedBy: S.me.id });
    await db.doc("claims/" + id).delete();
    await audit("Request approved", cl.email || id, `${ROLE_NAME[cl.role]} "${cl.name}"`); toast(`${cl.displayName || cl.email} can now use ${APPS[cl.role === "pm" ? "pm" : "designer"].name}`);
  });
}
function declineRequest(id, cl) {
  guard("people", async () => { await db.doc("claims/" + id).delete(); await audit("Request declined", cl.email || id, `${ROLE_NAME[cl.role]} "${cl.name}"`); toast("Request declined"); });
}
function removeMember(id) {
  const prev = S.people[id] || {};
  guard("people", async () => { await db.doc(`members/${id}`).delete(); await audit("Access removed", prev.email || id, `${ROLE_NAME[prev.role] || ""} "${prev.name || ""}"`); S.confirm = null; toast("Access removed"); });
}
function changeRole(id, patch) {
  const prev = S.people[id] || {};
  guard("people", async () => { await db.doc(`members/${id}`).update(patch);
    await audit(patch.role && patch.role !== prev.role ? "Role changed" : "Tracker name changed", id,
      patch.role && patch.role !== prev.role ? `${ROLE_NAME[prev.role]} to ${ROLE_NAME[patch.role]}. Pick their tracker name next.` : `"${prev.name || ""}" to "${patch.name}"`); toast("Access updated"); });
}

// ---- lists & 4E
function viewLists(root) {
  if (!S.cfgDraft) { S.cfgDraft = clone(cfg()); S.cfgDraft.scoring = { ...M.defaults(S.cfgDraft.scoring) }; delete S.cfgDraft.scoring.hoursPerDay; }
  const d = S.cfgDraft;
  const base = clone(cfg()); base.scoring = { ...M.defaults(base.scoring) }; delete base.scoring.hoursPerDay;
  const dirty = JSON.stringify(d) !== JSON.stringify(base);
  const all = S.tasksRaw, reqs = allRequests();
  const used = (fn) => all.some(fn) || reqs.some((r) => fn(r) || (r.subtasks || []).some(fn));
  const simpleList = (key, title, hint, isUsed) => h("div", { class: "card pad stack" }, h("div", null, h("h3", null, title), hint ? h("div", { class: "hint" }, hint) : null),
    h("div", { class: "list-edit" }, d[key].map((v, i) => h("div", { class: "li" },
      h("input", { id: `${key}-${i}`, type: "text", value: v, "aria-label": title, oninput: (e) => { d[key][i] = e.target.value; softRender(); } }),
      h("button", { class: "btn sm ghost danger", disabled: isUsed && isUsed(v), title: isUsed && isUsed(v) ? "In use" : "Remove", onclick: () => { d[key].splice(i, 1); render(); } }, "Remove")))),
    h("div", null, h("button", { class: "btn sm", onclick: () => { d[key].push(""); render(); } }, "Add")));
  root.appendChild(head("Settings sheet", "Lists & 4E", "These drive every dropdown in Task Creation and become the Settings sheet on export. Items in use cannot be removed.",
    h("div", { class: "row" }, dirty ? pill("Unsaved changes", "warn") : pill("Saved", "good"),
      h("button", { class: "btn", disabled: !dirty, onclick: () => { S.cfgDraft = null; render(); } }, "Discard"),
      h("button", { class: "btn accent", disabled: !dirty || S.busy.cfg, onclick: saveConfig }, "Save changes"))));
  root.appendChild(h("div", { class: "card pad stack" }, h("div", null, h("h3", null, "4E lines and products"), h("div", { class: "hint" }, "PMs pick a line first, then one of its products. Products are the master tasks on the Tracker.")),
    h("div", { class: "grid-half" }, d.lines.map((l, li) => h("div", { class: "subtask" },
      h("div", { class: "subtask-head" }, h("input", { id: `ln-${li}`, type: "text", value: l.name, "aria-label": "Line name", style: "font-weight:700;max-width:220px", oninput: (e) => { l.name = e.target.value; softRender(); } }),
        h("span", { class: "spacer" }), h("button", { class: "btn sm ghost danger", disabled: used((x) => x.fourE === l.name), onclick: () => { d.lines.splice(li, 1); render(); } }, "Remove line")),
      h("div", { class: "list-edit" }, l.products.map((p, pi) => h("div", { class: "li" },
        h("input", { id: `lp-${li}-${pi}`, type: "text", value: p, "aria-label": "Product", oninput: (e) => { l.products[pi] = e.target.value; softRender(); } }),
        h("button", { class: "btn sm ghost danger", disabled: used((x) => x.product === p || x.master === p), onclick: () => { l.products.splice(pi, 1); render(); } }, "Remove")))),
      h("div", null, h("button", { class: "btn sm", onclick: () => { l.products.push(""); render(); } }, "Add product"))))),
    h("div", null, h("button", { class: "btn sm", onclick: () => { d.lines.push({ name: "", products: [""] }); render(); } }, "Add line"))));
  root.appendChild(h("div", { class: "grid-half" }, simpleList("subTags", "Subtask types", "For example Feature design, Wireframes, Design QA.", (v) => used((x) => x.sub === v)),
    h("div", { class: "card pad stack" }, h("div", null, h("h3", null, "Projects"), h("div", { class: "hint" }, "Each project maps to a lead PM (PM (Project Lead) on the Tracker). Up to 30.")),
      h("div", { class: "list-edit" }, d.projects.map((p, i) => h("div", { class: "li two" },
        h("input", { id: `prj-${i}`, type: "text", value: p.name, "aria-label": "Project name", oninput: (e) => { p.name = e.target.value; softRender(); } }),
        select(`prjl-${i}`, p.lead, d.pms.filter(Boolean), (v) => { p.lead = v; render(); }, "Lead PM"),
        h("button", { class: "btn sm ghost danger", disabled: used((x) => x.project === p.name), onclick: () => { d.projects.splice(i, 1); render(); } }, "Remove")))),
      h("div", null, h("button", { class: "btn sm", disabled: d.projects.length >= 30, onclick: () => { d.projects.push({ name: "", lead: "" }); render(); } }, "Add project")))));
  root.appendChild(h("div", { class: "grid-half" }, simpleList("designers", "Designers", "The Scorecard and Excel dashboard show the first 5.", (v) => used((x) => x.designer === v)),
    simpleList("pms", "Product managers", "", (v) => used((x) => x.assignedBy === v || x.pmName === v))));
  root.appendChild(h("div", { class: "grid-half" },
    h("div", { class: "card pad stack" }, h("div", null, h("h3", null, "Company holidays"), h("div", { class: "hint" }, "Excluded from working days. Up to 30.")),
      h("div", { class: "list-edit" }, d.holidays.map((x, i) => h("div", { class: "li two" },
        h("input", { id: `hd-${i}`, type: "date", value: x.date, "aria-label": "Holiday date", onchange: (e) => { x.date = e.target.value; render(); } }),
        h("input", { id: `hn-${i}`, type: "text", value: x.name, "aria-label": "Holiday name", oninput: (e) => { x.name = e.target.value; softRender(); } }),
        h("button", { class: "btn sm ghost danger", onclick: () => { d.holidays.splice(i, 1); render(); } }, "Remove")))),
      h("div", null, h("button", { class: "btn sm", disabled: d.holidays.length >= 30, onclick: () => { d.holidays.push({ date: "", name: "" }); render(); } }, "Add holiday"))),
    h("div", { class: "card pad stack" }, h("h3", null, "Scoring and workload"),
      h("div", { class: "fields" }, [["speedWeight", "Speed weight", 0.05], ["qualityWeight", "Quality weight", 0.05], ["commitmentWeight", "Commitment weight", 0.05],
        ["revisionZero", "Revision rounds for Quality 0", 1], ["excellent", "Excellent if at least", 1], ["good", "Good if at least", 1], ["needsImprovement", "Needs Improvement if at least", 1],
        ["weeklyHours", "Weekly working hours", 1], ["overloadAbove", "Overloaded above (1 = 100%)", 0.05], ["underBelow", "Under-utilised below", 0.05]].map(([k, l, step]) =>
        field(l, "sc-" + k, h("input", { id: "sc-" + k, type: "number", step: String(step), value: d.scoring[k], oninput: (e) => { d.scoring[k] = Number(e.target.value); softRender(); } }))),
        h("div", { class: "field" }, h("span", { class: "label" }, "Working days per week"), h("div", { class: "seg" }, [5, 6].map((n) => h("button", { "aria-pressed": String(d.scoring.daysPerWeek === n), onclick: () => { d.scoring.daysPerWeek = n; render(); } }, n === 5 ? "Mon to Fri" : "Mon to Sat"))))),
      Math.abs(d.scoring.speedWeight + d.scoring.qualityWeight + d.scoring.commitmentWeight - 1) > 1e-6 ? h("div", { class: "err" }, "Weights should add up to 1 (100%).") : null)));
}
function uniq(a) { const out = []; for (const v of a.map((x) => String(x).trim()).filter(Boolean)) if (!out.includes(v)) out.push(v); return out; }
function saveConfig() {
  const d = S.cfgDraft;
  const clean = { designers: uniq(d.designers), pms: uniq(d.pms),
    projects: d.projects.filter((p) => p.name.trim()).map((p) => ({ name: p.name.trim(), lead: p.lead || "" })),
    lines: d.lines.filter((l) => l.name.trim()).map((l) => ({ name: l.name.trim(), products: uniq(l.products) })),
    subTags: uniq(d.subTags), holidays: d.holidays.filter((x) => x.date).map((x) => ({ date: x.date, name: (x.name || "").trim() })).sort((a, b) => (a.date < b.date ? -1 : 1)), scoring: d.scoring };
  guard("cfg", async () => { await db.doc("config/main").set(clean); S.cfgDraft = null; toast("Lists saved"); });
}

// ---- export
function viewExport(root) {
  const o = S.exportOpts, p = periodRange();
  if (!o.from) { o.from = p.from; o.to = p.to; }
  const all = tasks(), reqs = allRequests().filter((r) => r.status !== "draft");
  root.appendChild(head("Your workbook", "Export to Excel", "Builds the Product Designer Task Manager workbook with every approved task, daily update, leave entry and funnel decision. Your formulas, tables and dropdowns stay as you built them."));
  root.appendChild(h("div", { class: "grid2" },
    h("div", { class: "card pad stack" },
      h("div", { class: "fields" },
        field("Scorecard period from", "x-from", h("input", { id: "x-from", type: "date", value: o.from, onchange: (e) => { o.from = e.target.value; } })),
        field("Scorecard period to", "x-to", h("input", { id: "x-to", type: "date", value: o.to, onchange: (e) => { o.to = e.target.value; } }))),
      h("label", { class: "row", style: "gap:8px;cursor:pointer" }, h("input", { id: "x-dc", type: "checkbox", checked: o.designerCopy, onchange: (e) => { o.designerCopy = e.target.checked; render(); } }),
        h("span", null, h("b", null, "Designer copy. "), "Hides Scorecard, Settings, Dashboard, Task Details, Daily Log, Task Funnel and Deliverables, and locks the sheet list.")),
      h("div", { class: "field" }, h("span", { class: "label" }, "Workbook template"),
        h("div", { class: "small" }, S.template ? `Using your file "${S.template.name}".` : "Using the built-in copy of your Task Manager workbook."),
        h("div", { class: "row" }, h("label", { class: "btn sm", for: "x-file" }, "Use my current workbook instead"),
          h("input", { id: "x-file", type: "file", accept: ".xlsx", style: "position:absolute;opacity:0;width:1px;height:1px", onchange: pickTemplate }),
          S.template ? h("button", { class: "btn sm ghost", onclick: () => { S.template = null; render(); } }, "Use built-in") : null),
        h("div", { class: "hint" }, "The file must be an export from this app.")),
      h("div", { class: "row" }, h("button", { class: "btn accent", disabled: S.busy.export, onclick: runExport }, S.busy.export ? "Building workbook" : "Download Excel"),
        h("span", { class: "hint" }, `${all.length} tasks, ${reqs.length} requests, ${allLeave().length} leave entries, ${all.reduce((a, t) => a + (t.updates || []).length, 0)} daily updates`)),
      S.exportMsg ? h("div", { class: "banner " + S.exportMsg.kind }, h("div", null, S.exportMsg.text, S.exportMsg.list && S.exportMsg.list.length ? h("ul", { style: "margin:6px 0 0;padding-left:18px" }, S.exportMsg.list.map((w) => h("li", null, w))) : null)) : null),
    h("aside", { class: "card pad stack small" }, h("h3", null, "What lands where"),
      h("div", null, h("b", null, "Tracker. "), "One row per approved subtask. Task Assigned reads Product / Subtask: Detail, with the count for batches, for example (12 videos)."),
      h("div", null, h("b", null, "Task Funnel. "), "Every submitted request, one row per subtask, with your decision and note."),
      h("div", null, h("b", null, "Task Details. "), "4E line, product, master task title, request ID, progress and hours."),
      h("div", null, h("b", null, "Daily Log. "), "Every designer update."),
      h("div", null, h("b", null, "Leave & Holidays, Settings, Scorecard. "), "Leave entries, holidays, lists, scoring and the period above."),
      h("div", null, h("b", null, "Deliverables. "), "One row per video, demo or other item inside a batch task, with status, done date, revisions and link."),
      h("div", null, h("b", null, "Dashboard. "), "KPIs, seven charts including deliverables per week, plus funnel, 4E and hours-per-deliverable tables. Recalculates on open."))));
}
async function pickTemplate(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const zip = await JSZip.loadAsync(bytes);
    const need = ["xl/tables/table1.xml", "xl/worksheets/sheet5.xml", "xl/worksheets/sheet6.xml", "xl/worksheets/sheet7.xml", "xl/worksheets/sheet8.xml", "xl/charts/chart1.xml"];
    const t1 = zip.file("xl/tables/table1.xml") ? await zip.file("xl/tables/table1.xml").async("string") : "";
    if (need.some((n) => !zip.file(n)) || !/name="tblTasks"/.test(t1)) throw new Error("shape");
    S.template = { name: file.name, bytes };
    S.exportMsg = { kind: "good", text: `"${file.name}" will be used as the template. Its data rows are replaced by the app's data.` };
  } catch (err) { S.template = null; S.exportMsg = { kind: "warn", text: "That file doesn't look like a Design Task Hub export, so the built-in template stays in use." }; }
  render();
}
function b64ToBytes(b64) { const s = atob(b64); const out = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out; }
async function runExport() {
  const o = S.exportOpts;

  if (!o.from || !o.to || o.to < o.from) { S.exportMsg = { kind: "warn", text: "Set a Scorecard period where the end date is on or after the start date." }; return render(); }
  S.busy.export = true; S.exportMsg = null; render();
  try {
    const list = M.sortTasks(tasks());
    const leave = allLeave().sort((a, b) => (a.from === b.from ? (a.designer < b.designer ? -1 : 1) : a.from < b.from ? -1 : 1));
    const requests = allRequests().filter((r) => r.submittedAt).sort((a, b) => (a.submittedAt < b.submittedAt ? -1 : 1));
    const conf = { ...cfg(), masterTags: M.productsOf(cfg()) };
    const tpl = S.template ? S.template.bytes : b64ToBytes(window.DTH_TEMPLATE_B64);
    const { bytes, warnings } = await X.build({ JSZip, DOMParser, XMLSerializer }, tpl, { config: conf, tasks: list, leave, requests, period: { from: o.from, to: o.to }, designerCopy: o.designerCopy });
    const name = `Product Designer Task Manager ${today()}${o.designerCopy ? " (designer copy)" : ""}.xlsx`;
    await P.download(name, new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    S.exportMsg = { kind: "good", text: `Saved "${name}". Excel recalculates every formula and chart when you open it.`, list: warnings };
  } catch (e) {
    const code = e && e.code;
    S.exportMsg = { kind: "warn", text: code === "declined" ? "Download cancelled." : code === "rate_limited" ? "A download prompt is already open. Finish it, then try again." : "Could not build the workbook. " + (e && e.message ? e.message : "") };
    console.error(e);
  } finally { S.busy.export = false; render(); }
}

// ------------------------------------------------------------------ charts
function scoreCell(v, color) {
  return h("td", null, v == null ? h("span", { class: "muted" }, "-") : h("div", { class: "bar-cell", "data-tip": fmt1(v) + " of 100" },
    h("span", { class: "track" }, h("i", { style: `width:${Math.max(0, Math.min(100, v))}%;background:${color}` })), h("span", { class: "num small" }, fmt0(v))));
}
function niceMax(v) { const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p; return 10 * p; }
function hbar(rows, opts) {
  const W = 440, labelW = 118, rowH = rows[0] && rows[0].values.length > 1 ? 30 : 24, gap = 10, pad = 26;
  const max = Math.max(1, ...rows.flatMap((r) => r.values.map((v) => v.v)));
  const nice = niceMax(max), H = rows.length * (rowH + gap) + pad;
  const x = (v) => labelW + (v / nice) * (W - labelW - 40);
  const ticks = nice % 2 === 0 || nice > 4 ? [0, nice / 2, nice] : [0, nice];
  return svg("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": rows.map((r) => `${r.label} ${r.values.map((v) => fmt1(v.v)).join("/")}`).join(", ") },
    ticks.map((t) => [svg("line", { class: "gl", x1: x(t), x2: x(t), y1: 0, y2: H - pad + 4 }), svg("text", { x: x(t), y: H - 6, "text-anchor": "middle" }, fmt1(t))]),
    rows.map((r, i) => { const y0 = i * (rowH + gap), bh = (rowH - 2 * (r.values.length - 1)) / r.values.length;
      return svg("g", null, svg("text", { class: "lbl", x: labelW - 8, y: y0 + rowH / 2 + 4, "text-anchor": "end" }, r.label.length > 17 ? r.label.slice(0, 16) + "…" : r.label),
        r.values.map((v, j) => { const y = y0 + j * (bh + 2), w = Math.max(v.v > 0 ? 3 : 0, x(v.v) - labelW);
          return svg("g", { "data-tip": `${r.label}\n${v.name}: ${fmt1(v.v)} ${opts.unit}` }, svg("rect", { x: labelW, y: y - 1, width: W - labelW, height: bh + 2, fill: "transparent" }),
            svg("rect", { x: labelW, y, width: w, height: bh, rx: Math.min(4, bh / 2), fill: v.color }), svg("text", { x: labelW + w + 6, y: y + bh / 2 + 4 }, fmt1(v.v))); })); }));
}
function lineChart(series) {
  const W = 440, H = 220, L = 34, R = 10, T = 10, B = 26, n = series[0].points.length;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.points.map((p) => p.y))));
  const x = (i) => L + (i * (W - L - R)) / (n - 1), y = (v) => T + (1 - v / max) * (H - T - B);
  return svg("svg", { class: "chart", viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Hours logged per week by designer" },
    (max % 2 === 0 || max > 4 ? [0, max / 2, max] : [0, max]).map((t) => [svg("line", { class: "gl", x1: L, x2: W - R, y1: y(t), y2: y(t) }), svg("text", { x: L - 6, y: y(t) + 4, "text-anchor": "end" }, fmt1(t))]),
    series[0].points.map((p, i) => (i % 2 === 1 || i === n - 1 ? svg("text", { x: x(i), y: H - 6, "text-anchor": "middle" }, p.x) : null)),
    series.map((s) => [svg("polyline", { fill: "none", stroke: s.color, "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round", points: s.points.map((p, i) => `${x(i)},${y(p.y)}`).join(" ") }),
      svg("circle", { cx: x(n - 1), cy: y(s.points[n - 1].y), r: 4, fill: s.color, stroke: "var(--surface)", "stroke-width": 2 })]),
    series[0].points.map((p, i) => svg("rect", { x: x(i) - (W - L - R) / (n - 1) / 2, y: T, width: (W - L - R) / (n - 1), height: H - T - B, fill: "transparent",
      "data-tip": `Week of ${p.x}\n` + series.map((s) => `${s.name}: ${fmt1(s.points[i].y)} hrs`).join("\n") })));
}

// ------------------------------------------------------------------ tooltip
const tip = document.getElementById("tip");
document.addEventListener("mousemove", (e) => {
  const t = e.target.closest && e.target.closest("[data-tip]");
  if (!t) { tip.hidden = true; return; }
  tip.textContent = t.getAttribute("data-tip"); tip.hidden = false;
  tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, e.clientX + 14) + "px";
  tip.style.top = Math.min(window.innerHeight - tip.offsetHeight - 8, e.clientY + 14) + "px";
});
document.addEventListener("scroll", () => { tip.hidden = true; }, { passive: true });
window.addEventListener("hashchange", () => { S.confirm = null; render(); window.scrollTo(0, 0); });

// -------------------------------------------------------------------- boot
const coreSubs = [];
function stopAll() {
  for (const un of coreSubs.splice(0)) { try { un(); } catch (e) {} }
  for (const [k, un] of subs) { try { un(); } catch (e) {} subs.delete(k); }
  Object.assign(S, { people: {}, myMember: null, memberLoaded: false, coreStarted: false, config: null, tasksRaw: [], progress: {}, leaveItems: {}, leaveDocs: {},
    requests: {}, claims: {}, myClaim: undefined, invites: {}, sessions: {}, auditLog: null });
  memo = { key: null, value: [] };
}
function normalizeConfig(c) {
  return { designers: c.designers || [], pms: c.pms || [], projects: c.projects || [], lines: (c.lines || []).map((l) => ({ name: l.name, products: l.products || [] })),
    subTags: c.subTags || [], holidays: c.holidays || [], scoring: c.scoring || {} };
}
// A verified account joins by: being the configured owner, holding an invitation, or asking for access.
async function tryJoin() {
  const email = S.me.email;
  const base = { email, displayName: S.me.name || "", joinedAt: nowIso() };
  if (CFG.ownerEmail && email === String(CFG.ownerEmail).toLowerCase()) {
    await db.doc(`members/${S.me.id}`).set({ ...base, role: "owner", name: "" });
    const conf = await db.doc("config/main").get().catch(() => null);
    if (conf && !conf.exists) await db.doc("config/main").set(clone(STARTER_CFG));
    return true;
  }
  const inv = await db.doc(`invites/${email}`).get().catch(() => null);
  if (inv && inv.exists) {
    const d = inv.data();
    await db.doc(`members/${S.me.id}`).set({ ...base, role: d.role, name: d.name, invitedBy: d.invitedBy || "" });
    await db.doc(`invites/${email}`).delete().catch(() => {});
    return true;
  }
  return false;
}
function startSession() {
  S.memberLoaded = false; S.signedInAt = nowIso(); lastActivity = Date.now();
  let joining = false;
  coreSubs.push(db.doc(`members/${S.me.id}`).onSnapshot(async (d) => {
    if (d.exists) {
      S.myMember = d.data(); S.me.isOwner = S.myMember.role === "owner";
      if (!S.coreStarted) startCore();
      S.memberLoaded = true;
      if (S.pendingSignInRecord) { S.pendingSignInRecord = false; recordSession("sign-in"); }
      const home = homeApp();
      if (!(location.hash || "").slice(1) && home) location.hash = home;
    } else {
      S.myMember = null; S.me.isOwner = false;
      if (S.coreStarted) { const keep = { ...S.me }; stopAll(); S.me = keep; startSession(); return; } // access was removed
      if (!joining) { joining = true; try { if (await tryJoin()) return; } catch (e) { console.error(e); } }
      startGuest();
      S.memberLoaded = true;
    }
    render();
  }, (e) => { onErr(e); S.memberLoaded = true; render(); }));
}
let guestStarted = false;
function startGuest() {
  if (guestStarted) return;
  guestStarted = true;
  coreSubs.push(db.doc("config/main").onSnapshot((d) => { S.config = d.exists ? normalizeConfig(d.data()) : null; render(); }, onErr));
  coreSubs.push(db.doc("claims/" + S.me.id).onSnapshot((d) => { S.myClaim = d.exists ? d.data() : null; render(); }, onErr));
}
function startCore() {
  S.coreStarted = true; guestStarted = false;
  coreSubs.push(db.collection("members").onSnapshot((q) => { const m = {}; q.docs.forEach((x) => { m[x.id] = x.data(); }); S.people = m; syncSubs(); render(); }, onErr));
  coreSubs.push(db.doc("config/main").onSnapshot((d) => { S.config = d.exists ? normalizeConfig(d.data()) : null; render(); }, onErr));
  // Each role asks only for the tasks the server lets it read
  const mm = S.myMember || {};
  const taskQuery = mm.role === "owner" ? db.collection("tasks") : db.collection("tasks").where(mm.role === "designer" ? "designer" : "assignedBy", "==", mm.name || "-");
  coreSubs.push(taskQuery.onSnapshot((q) => { S.tasksRaw = q.docs.map((x) => ({ id: x.id, ...x.data() })); render(); }, onErr));
  if (S.me.isOwner) {
    coreSubs.push(db.collection("claims").onSnapshot((q) => { const m = {}; q.docs.forEach((x) => { m[x.id] = x.data(); }); S.claims = m; render(); }, onErr));
    coreSubs.push(db.collection("invites").onSnapshot((q) => { const m = {}; q.docs.forEach((x) => { m[x.id] = x.data(); }); S.invites = m; render(); }, onErr));
  }
  syncSubs();
}
async function boot() {
  if (!P) { S.platformError = { code: "not_configured" }; S.ready = true; return render(); }
  try { await P.init(); } catch (e) { S.platformError = e; S.ready = true; return render(); }
  db = P.db;
  S.keep = keepFlag();
  P.auth.onChange((u) => {
    stopAll(); guestStarted = false;
    if (!u) { S.me = { id: null, name: "", email: "", avatarUrl: "", isOwner: false, emailVerified: false }; S.ready = true; render(); return; }
    S.me = { id: u.uid, email: u.email, emailVerified: u.emailVerified, name: u.displayName || u.email.split("@")[0], avatarUrl: "", isOwner: false };
    S.ready = true;
    if (u.emailVerified) startSession();
    render();
  });
}
render();
boot().catch((e) => { console.error(e); S.ready = true; S.noDb = true; render(); });
})();
