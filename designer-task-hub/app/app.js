/* Design Task Hub: three interfaces on one shared store.
 *   #pm        Task Creation      (product managers)   requests -> funnel
 *   #designer  Designer Tracker   (product designers)  daily progress, weekly leave
 *   #owner     Owner Dashboard    (the owner only)     funnel approval, dashboard, export
 * Store layout (see README): config/main, config/people, claims/{uid},
 * requests/{uid}/items/*, tasks/*, progress/{uid}/tasks/*, leave/{uid}, leave/{uid}/items/*
 */
(function () {
"use strict";
const M = window.DTHMetrics, X = window.DTHExport;
const ARTIFACT_URL = "https://claude.ai/artifact/861G225qPnkPvoad3XYy1b";
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
const REQ = { draft: ["Draft", "neutral"], pending: ["Awaiting approval", "warn"], changes: ["Changes requested", "serious"], approved: ["Approved", "good"], rejected: ["Rejected", "critical"] };

// ------------------------------------------------------------------ state
const S = {
  ready: false, noDb: false,
  me: { id: null, name: "", avatarUrl: "", isOwner: false },
  config: null, people: {}, ownerId: null, peopleLoaded: false,
  claims: {}, myClaim: undefined,
  tasksRaw: [], progress: {}, leaveItems: {}, leaveDocs: {}, requests: {},
  tab: { owner: "overview", pm: "new", designer: "tasks" },
  form: null, joinForm: null, review: {}, drafts: {}, edit: null, confirm: null,
  filters: { q: "", designer: "", project: "", stage: "" }, funnelTab: "pending", pmFilter: "active",
  period: "month", custom: { from: "", to: "" }, actingDesigner: "", showDone: false,
  cfgDraft: null, exportOpts: { designerCopy: false, from: "", to: "" }, template: null, exportMsg: null,
  profiles: {}, toast: null, busy: {},
};
let db = null, userApi = null, downloads = null;
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
const fmt1 = (v) => (v === null || v === undefined || v === "" ? "-" : (Math.round(Number(v) * 10) / 10).toLocaleString());
const fmt0 = (v) => (v === null || v === undefined || v === "" ? "-" : Math.round(Number(v)).toLocaleString());
const pct = (v) => (v === null || v === undefined || v === "" ? "-" : Math.round(Number(v) * 100) + "%");
const clone = (x) => JSON.parse(JSON.stringify(x));
const EMPTY_CFG = { designers: [], pms: [], projects: [], lines: [], subTags: [], holidays: [], scoring: {} };
const cfg = () => S.config || EMPTY_CFG;
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
function uidsWithRole(role) { return Object.entries(S.people).filter(([, p]) => p.role === role).map(([id]) => id); }
function progressUids() {
  const set = new Set(uidsWithRole("designer"));
  if (S.ownerId) set.add(S.ownerId);
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
  const reqUids = S.me.isOwner ? [...new Set(uidsWithRole("pm").concat(S.me.id ? [S.me.id] : []))] : (S.me.id ? [S.me.id] : []);
  for (const uid of reqUids) {
    want.add("r:" + uid);
    sub("r:" + uid, () => db.collection(`requests/${uid}/items`).onSnapshot((q) => { S.requests = { ...S.requests, [uid]: q.docs.map((d) => ({ id: d.id, ...d.data() })) }; render(); }, onErr));
  }
  for (const [k, un] of subs) if (/^(p|li|ld|r):/.test(k) && !want.has(k)) { try { un(); } catch (e) {} subs.delete(k); }
}
function onErr(e) { console.error(e); }

// ---------------------------------------------------------------- roles
function roleOf() {
  if (S.me.isOwner) return "admin";
  const p = S.people[S.me.id];
  return p ? p.role : null;
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
function tabsFor(app) {
  if (app === "owner") {
    const pending = allRequests().filter((r) => r.status === "pending").length;
    return [["overview", "Overview"], ["funnel", "Task funnel", pending], ["tasks", "All tasks"], ["designers", "Designers"],
      ["leave", "Leave & holidays"], ["people", "People & links", Object.keys(S.claims).length], ["lists", "Lists & 4E"], ["export", "Export to Excel"]];
  }
  if (app === "pm") {
    const back = allRequests().filter((r) => r.status === "changes").length;
    return [["new", S.form && S.form.id ? "Edit request" : "New request"], ["mine", "My requests", back]];
  }
  if (app === "designer") {
    const open = tasks().filter((t) => t.designer === designerName() && !t.actualEnd).length;
    return [["tasks", "My tasks", open], ["leave", "My leave"]];
  }
  return [];
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
function paintHeader(app) {
  const brand = document.getElementById("brand");
  brand.replaceChildren(h("span", { class: "brand-mark", "aria-hidden": "true" }, h("i"), h("i"), h("i"), h("i")),
    h("span", null, h("small", null, "Design Task Hub"), h("b", null, app ? APPS[app].name : "Welcome")));
  const who = document.getElementById("who");
  who.replaceChildren();
  const role = roleOf();
  if (S.me.id) {
    if (S.me.avatarUrl) who.appendChild(h("img", { src: S.me.avatarUrl, alt: "" }));
    who.appendChild(h("span", null, role === "admin" ? (S.me.name || "Owner") : rosterName() || S.me.name || "You"));
    if (role) who.appendChild(h("span", { class: "role" }, role === "admin" ? "Owner" : role === "pm" ? "Product manager" : "Designer"));
  }
  const tabs = document.getElementById("tabs");
  tabs.replaceChildren();
  const list = S.ready && app && allowed(app) ? tabsFor(app) : [];
  if (list.length && !list.find((t) => t[0] === S.tab[app])) S.tab[app] = list[0][0];
  for (const [id, label, count] of list) {
    const b = h("button", { class: "tab", role: "tab", "aria-selected": String(S.tab[app] === id),
      onclick: () => { S.tab[app] = id; S.confirm = null; if (app === "owner") S.edit = null; render(); window.scrollTo(0, 0); } }, label);
    if (count) b.appendChild(h("span", { class: "count" }, String(count)));
    tabs.appendChild(b);
  }
  tabs.hidden = !list.length;
}
function body(root, app) {
  if (S.noDb) root.appendChild(h("div", { class: "banner warn" }, "Saving is unavailable in this view. Open the link from claude.ai while signed in."));
  if (!S.me.id) return root.appendChild(gate("Sign in to continue", "Design Task Hub uses your claude.ai account to know whether you create tasks, design them, or run the dashboard."));
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

// ------------------------------------------------------------------ join
function viewJoin(root, app) {
  const claim = S.myClaim;
  if (claim) {
    root.appendChild(gate("Waiting for approval", `You asked to join as ${claim.role === "pm" ? "a product manager" : "a designer"}, named ${claim.name}. The owner approves requests from the Owner Dashboard.`,
      h("button", { class: "btn", onclick: () => guard("claim", () => db.doc("claims/" + S.me.id).delete()) }, "Change my request")));
    return;
  }
  const fixed = app === "pm" ? "pm" : app === "designer" ? "designer" : null;
  if (app === "owner") return root.appendChild(gate("This dashboard is private", "Only the owner can open the Owner Dashboard. Use the link you were given for Task Creation or the Designer Tracker."));
  const f = S.joinForm || (S.joinForm = { role: fixed || "designer", name: "", err: "" });
  if (fixed) f.role = fixed;
  const names = f.role === "pm" ? cfg().pms : cfg().designers;
  root.appendChild(head("First visit", fixed ? `Join ${APPS[app].name}` : "Tell us who you are", "The owner confirms each person once. After that this link opens straight to your page."));
  root.appendChild(h("div", { class: "card pad stack", style: "max-width:560px" },
    fixed ? null : h("div", { class: "field" }, h("span", { class: "label" }, "I am a"),
      h("div", { class: "seg" }, [["designer", "Product designer"], ["pm", "Product manager"]].map(([k, l]) =>
        h("button", { "aria-pressed": String(f.role === k), onclick: () => { f.role = k; f.name = ""; render(); } }, l)))),
    field("My name on the tracker", "join-name", select("join-name", f.name, names, (v) => { f.name = v; f.err = ""; }, names.length ? "Choose your name" : "The owner has not added names yet"), f.err),
    h("div", null, h("button", { class: "btn accent", disabled: S.busy.claim, onclick: () => {
      if (!f.name) { f.err = "Choose your name from the list."; return render(); }
      guard("claim", () => db.doc("claims/" + S.me.id).set({ role: f.role, name: f.name, at: nowIso() }));
    } }, "Send request"))));
}

// ============================================================ TASK CREATION
function blankSubtask() { return { key: Math.random().toString(36).slice(2, 9), sub: "", detail: "", designer: "", start: "", end: "", effort: "" }; }
function blankRequest() {
  return { id: null, fourE: "", product: "", project: "", masterTitle: "", priority: "Medium", brief: "", subtasks: [blankSubtask()], errors: {}, asPm: "" };
}
function validateRequest(f) {
  const e = { subs: {} };
  if (!f.fourE) e.fourE = "Choose the 4E line.";
  if (!f.product) e.product = "Choose the product.";
  if (!f.project) e.project = "Link the request to a project.";
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
    if (Object.keys(x).length) e.subs[s.key] = x;
  });
  if (!Object.keys(e.subs).length) delete e.subs;
  return e;
}
function requestBody(f, status, prev) {
  const history = (prev && prev.history ? prev.history.slice() : []);
  if (status !== "draft") history.push({ at: nowIso(), status, by: "pm", name: pmName() });
  return {
    pmName: pmName(), pmUid: S.me.id, fourE: f.fourE, product: f.product, project: f.project, masterTitle: f.masterTitle.trim(),
    priority: f.priority, brief: f.brief.trim(),
    subtasks: f.subtasks.map((s) => ({ key: s.key, sub: s.sub, detail: s.detail.trim(), designer: s.designer, start: s.start, end: s.end, effort: Number(s.effort) || 0 })),
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
  const lead = M.projectLead(c, f.project);
  root.appendChild(head(f.id ? "Edit request" : "New request", f.id ? f.masterTitle || "Untitled request" : "Create a design request",
    "Pick the 4E line and product, describe each subtask with its own timeline, then submit. Nothing reaches designers until the owner approves it.",
    roleOf() === "admin" ? field("Requesting as", "as-pm", select("as-pm", pmName(), c.pms, (v) => { f.asPm = v; render(); })) : null));
  const back = f.id ? allRequests().find((r) => r.id === f.id) : null;
  if (back && back.status === "changes" && back.ownerNote) root.appendChild(h("div", { class: "note-box" }, h("b", null, "Owner's note: "), back.ownerNote));

  const products = productsFor(f.fourE);
  const master = h("section", { class: "card pad form-section" },
    h("h3", null, "Master task"),
    h("div", { class: "fields" },
      field("4E line", "r-line", select("r-line", f.fourE, lines().map((l) => l.name), (v) => { f.fourE = v; if (!productsFor(v).includes(f.product)) f.product = ""; delete e.fourE; render(); }, "Choose a line"), e.fourE),
      field("Product", "r-product", (() => { const s = select("r-product", f.product, products, (v) => { f.product = v; delete e.product; render(); }, f.fourE ? "Choose a product" : "Choose a 4E line first"); s.disabled = !f.fourE; return s; })(), e.product),
      field("Project", "r-project", select("r-project", f.project, c.projects.map((p) => p.name), (v) => { f.project = v; delete e.project; render(); }, "Choose a project"), e.project, f.project ? "Lead PM: " + lead : null),
      field("Priority", "r-priority", select("r-priority", f.priority, PRIORITIES, (v) => { f.priority = v; }))),
    field("Master task title", "r-title", h("input", { id: "r-title", type: "text", maxlength: "120", placeholder: "For example: Team analytics for managers", value: f.masterTitle, oninput: (ev) => { f.masterTitle = ev.target.value; delete e.masterTitle; softRender(); } }), e.masterTitle),
    field("Brief or link (optional)", "r-brief", h("textarea", { id: "r-brief", rows: "2", placeholder: "PRD section, Figma file, goals and constraints", value: f.brief, oninput: (ev) => { f.brief = ev.target.value; } })));

  const subtaskCards = f.subtasks.map((s, i) => subtaskEditor(f, s, i, (e.subs || {})[s.key] || {}));
  const subSection = h("section", { class: "card pad form-section" },
    h("div", { class: "row" }, h("h3", null, `Subtasks (${f.subtasks.length})`), h("span", { class: "spacer" }),
      h("span", { class: "hint" }, "Each subtask becomes one row on the Tracker once approved.")),
    subtaskCards, e.subtasks ? h("div", { class: "err" }, e.subtasks) : null,
    h("div", null, h("button", { class: "btn", onclick: () => { const last = f.subtasks[f.subtasks.length - 1]; const n = blankSubtask(); if (last) { n.designer = last.designer; n.start = last.end || ""; } f.subtasks.push(n); render(); } }, "Add subtask")));

  const tl = requestTimeline(f.subtasks);
  const totals = f.subtasks.reduce((a, s) => a + (Number(s.effort) || 0), 0);
  const starts = f.subtasks.map((s) => s.start).filter(Boolean).sort(), ends = f.subtasks.map((s) => s.end).filter(Boolean).sort();
  const span = starts.length && ends.length ? `${fmtDate(starts[0])} to ${fmtDate(ends[ends.length - 1])}, ${workdays(starts[0], ends[ends.length - 1])} working days` : "Add dates to see the timeline";
  const timeline = h("section", { class: "card pad form-section" },
    h("div", { class: "row" }, h("h3", null, "Timeline"), h("span", { class: "spacer" }), h("span", { class: "small muted" }, `${fmt1(totals)} hrs across ${f.subtasks.length} subtask${f.subtasks.length === 1 ? "" : "s"}. ${span}`)),
    tl || h("div", { class: "hint" }, "Bars appear once subtasks have start and end dates."));

  const preview = f.product || f.subtasks.some((s) => s.sub) ? h("div", { class: "preview" }, h("div", { class: "k" }, "On the Tracker, once approved"),
    f.subtasks.map((s) => h("div", null, X.taskAssigned({ master: f.product, sub: s.sub, title: s.detail.split("\n")[0].slice(0, 80) }) || "-"))) : null;

  const actions = h("div", { class: "row" },
    h("button", { class: "btn accent", disabled: S.busy.req, onclick: () => saveRequest(f, "pending") }, back && back.status === "changes" ? "Resubmit for approval" : "Submit for approval"),
    h("button", { class: "btn", disabled: S.busy.req, onclick: () => saveRequest(f, "draft") }, "Save draft"),
    f.id ? h("button", { class: "btn ghost", onclick: () => { S.form = blankRequest(); render(); } }, "Start a new request") : null,
    h("span", { class: "hint" }, `Submitted by ${pmName() || "you"}`));

  root.appendChild(h("div", { class: "grid2" },
    h("div", { class: "stack", style: "gap:20px" }, master, subSection, timeline, preview, actions),
    h("div", { class: "stack", style: "gap:20px;position:sticky;top:130px" }, availabilityAside(f))));
}
function subtaskEditor(f, s, i, e) {
  const c = cfg();
  const id = (k) => `st-${k}-${s.key}`;
  const cap = s.designer && s.start && s.end && s.end >= s.start ? designerLoad(s.designer, s.start, s.end) : null;
  return h("div", { class: "subtask" },
    h("div", { class: "subtask-head" }, h("span", { class: "n" }, String(i + 1)), h("b", null, s.sub || "Subtask"),
      s.start && s.end && s.end >= s.start ? h("span", { class: "small muted" }, `${workdays(s.start, s.end)} working days`) : null,
      h("span", { class: "spacer" }),
      h("button", { class: "btn sm ghost", onclick: () => { const cp = { ...clone(s), key: blankSubtask().key }; f.subtasks.splice(i + 1, 0, cp); render(); } }, "Duplicate"),
      f.subtasks.length > 1 ? h("button", { class: "btn sm ghost danger", onclick: () => { f.subtasks.splice(i, 1); render(); } }, "Remove") : null),
    h("div", { class: "fields" },
      field("Subtask type", id("sub"), select(id("sub"), s.sub, c.subTags, (v) => { s.sub = v; delete e.sub; render(); }, "Choose a type"), e.sub),
      field("Designer", id("des"), select(id("des"), s.designer, c.designers, (v) => { s.designer = v; render(); }, "Owner decides"), null)),
    field("Detail", id("det"), h("textarea", { id: id("det"), rows: "3", maxlength: "600", placeholder: "What exactly needs designing, which screens or states, and what done looks like", value: s.detail, oninput: (ev) => { s.detail = ev.target.value; delete e.detail; softRender(); } }), e.detail),
    h("div", { class: "fields" },
      field("Start", id("start"), h("input", { id: id("start"), type: "date", value: s.start, onchange: (ev) => { s.start = ev.target.value; if (s.end && s.end < s.start) s.end = s.start; delete e.start; render(); } }), e.start),
      field("End", id("end"), h("input", { id: id("end"), type: "date", value: s.end, min: s.start || null, onchange: (ev) => { s.end = ev.target.value; delete e.end; render(); } }), e.end),
      field("Effort (hours)", id("eff"), h("input", { id: id("eff"), type: "number", min: "0.5", step: "0.5", inputmode: "decimal", value: s.effort, oninput: (ev) => { s.effort = ev.target.value; delete e.effort; softRender(); } }), e.effort)),
    cap ? h("div", { class: "cap" }, h("span", null, `${s.designer} in these dates:`), pill(cap.status, WL[cap.status]),
      h("span", null, `peak ${pct(cap.peak)} booked`), cap.leave ? h("span", null, `, ${cap.leave} leave day${cap.leave === 1 ? "" : "s"}`) : null) : null);
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
function requestTimeline(subtasks) {
  const rows = subtasks.filter((s) => s.start && s.end && s.end >= s.start).map((s, i) => ({
    label: h("span", null, `${subtasks.indexOf(s) + 1}. ${s.sub || "Subtask"} `, h("small", null, s.designer || "unassigned")),
    start: s.start, end: s.end, color: designerColor(s.designer), text: s.designer || "", tip: `${s.sub || "Subtask"}\n${fmtDate(s.start)} to ${fmtDate(s.end)}\n${s.designer || "Owner decides"}, ${fmt1(s.effort)} hrs`,
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
function availabilityAside(f) {
  const c = cfg(), ctx = M.context(c), all = tasks(), leave = allLeave();
  const weeks = Array.from({ length: 4 }, (_, i) => M.addDays(M.mondayOf(today()), 7 * i));
  const picked = new Set((f ? f.subtasks : []).map((s) => s.designer).filter(Boolean));
  return h("aside", { class: "card pad stack" },
    h("div", null, h("h3", null, "Designer availability"), h("div", { class: "hint" }, `Approved work as a share of capacity (${fmt0(ctx.s.weeklyHours)} hrs/week, less leave and holidays).`)),
    c.designers.length ? h("div", { class: "tbl-wrap" }, h("div", { class: "heat", style: "grid-template-columns: minmax(64px, 90px) repeat(4, minmax(46px, 1fr))" },
      h("div"), weeks.map((w) => h("div", { class: "hd" }, fmtDate(w))),
      c.designers.map((d) => [h("div", { class: "nm", style: picked.has(d) ? "color:var(--accent)" : null }, d), weeks.map((w) => heatCell(all, leave, d, w, ctx))]))) : h("div", { class: "hint" }, "No designers yet."),
    h("div", { class: "legend" }, Object.entries(WL).map(([k, v]) => h("span", null, h("i", { style: `background:var(--${v === "neutral" ? "faint" : v + "-ink"})` }), k))));
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
  const list = mine.filter((r) => f === "all" || (f === "active" ? ["draft", "pending", "changes"].includes(r.status) : ["approved", "rejected"].includes(r.status)));
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
        h("div", { class: "small muted" }, `${r.project || "No project"} · ${r.priority} priority` + (r.submittedAt ? ` · submitted ${fmtDate(r.submittedAt)}` : "") + (r.decidedAt ? ` · decided ${fmtDate(r.decidedAt)}` : ""))),
        reqPill(r.status)),
      r.ownerNote && r.status !== "pending" ? h("div", { class: "note-box" }, h("b", null, "Owner's note: "), r.ownerNote) : null,
      h("div", { class: "tbl-wrap" }, h("table", null, h("thead", null, h("tr", null, ["#", "Subtask", "Designer", "Timeline", "Hours", r.status === "approved" ? "Progress" : null].filter(Boolean).map((x) => h("th", null, x)))),
        h("tbody", null, (r.subtasks || []).map((s, i) => {
          const t = s.taskId ? byId.get(s.taskId) : null;
          return h("tr", null, h("td", { class: "mono" }, t ? t.taskId : String(i + 1)), h("td", null, h("b", null, s.sub), h("div", { class: "small muted", style: "max-width:44ch" }, s.detail)),
            h("td", null, s.designer || h("span", { class: "muted" }, "Owner decides")), h("td", { class: "small" }, `${fmtDate(s.start)} to ${fmtDate(s.end)}`), h("td", { class: "n" }, fmt1(s.effort)),
            r.status === "approved" ? h("td", null, t ? h("div", null, deliveryPill(t), h("div", { class: "bar-cell", style: "margin-top:6px" }, h("span", { class: "track" }, h("i", { style: `width:${t.progress || 0}%;background:var(--des)` })), h("span", { class: "num small" }, (t.progress || 0) + "%"))) : h("span", { class: "muted small" }, "Removed")) : null);
        })))),
      actions.length ? h("div", { class: "row" }, actions) : null));
  }
}

// ========================================================= DESIGNER TRACKER
function viewDesignerTasks(root) {
  const name = designerName();
  const mine = tasks().filter((t) => t.designer === name);
  const open = mine.filter((t) => !t.actualEnd).sort((a, b) => ((a.target || "9") < (b.target || "9") ? -1 : 1));
  const done = mine.filter((t) => t.actualEnd).sort((a, b) => (a.actualEnd < b.actualEnd ? 1 : -1));
  const td = today();
  const updated = open.filter((t) => (t.updates || []).some((u) => u.d === td)).length;
  const hoursToday = mine.reduce((a, t) => a + (t.updates || []).filter((u) => u.d === td).reduce((x, u) => x + (Number(u.hours) || 0), 0), 0);
  const dueWeek = open.filter((t) => t.target && t.target <= M.addDays(M.mondayOf(td), 6)).length;
  const hr = new Date().getHours();
  root.appendChild(head(fmtDate(td, true), `${hr < 12 ? "Good morning" : hr < 17 ? "Good afternoon" : "Good evening"}${name ? ", " + name : ""}`,
    open.length ? "Post one update per task each day: status, progress, hours spent and any blocker." : "No open tasks right now.",
    roleOf() === "admin" ? field("Viewing as", "acting-des", select("acting-des", name, cfg().designers, (v) => { S.actingDesigner = v; render(); })) : null));
  root.appendChild(h("div", { class: "kpis" }, kpi(`${updated}/${open.length}`, "Updated today"), kpi(fmt1(hoursToday), "Hours logged today"),
    kpi(String(dueWeek), "Due this week"), kpi(String(open.filter((t) => t.delivery === "Overdue").length), "Overdue")));
  const nudge = leaveNudge(name);
  if (nudge) root.appendChild(nudge);
  if (open.length) {
    const rows = open.filter((t) => t.start && t.target).slice(0, 12).map((t) => ({ label: h("span", null, t.taskId + " ", h("small", null, t.sub)), start: t.start, end: t.target,
      color: t.delivery === "Overdue" ? "var(--critical)" : t.delivery === "Blocked" ? "var(--warn)" : "var(--des)", text: t.product || t.master, tip: `${t.title}\n${fmtDate(t.start)} to ${fmtDate(t.target)}` }));
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
      hours: u ? String(u.hours) : "", note: u ? u.note || "" : "", blocker: t.blockers || "", revisions: Number(t.revisions) || 0, actualEnd: t.actualEnd || td, err: "" };
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
    h("div", null, t.masterTitle ? h("div", { class: "small muted" }, t.masterTitle) : null, h("div", { class: "task-title" }, t.title),
      h("div", { class: "meta" }, h("span", null, t.project), h("span", null, "PM " + (t.assignedBy || t.pm)), h("span", null, `${fmtDate(t.start)} to ${fmtDate(t.target)}`),
        h("span", { style: t.delivery === "Overdue" ? "color:var(--critical-ink);font-weight:600" : null }, workdaysLeft(t)),
        t.effort ? h("span", null, `${fmt1(t.effort)} hrs estimated, ${fmt1(t.hoursLogged)} logged`) : null)),
    t.brief ? h("div", { class: "small muted", style: "overflow-wrap:anywhere" }, t.brief) : null,
    h("div", { class: "progress", "aria-label": `Progress ${t.progress || 0}%` }, h("i", { style: `width:${t.progress || 0}%` })),
    h("div", { class: "update" },
      h("div", { class: "row" }, h("b", { class: "small" }, todays ? "Today's update is saved. Change it any time today." : "Today's update"), h("span", { class: "spacer" }), todays ? pill("Updated today", "good") : pill("Not updated today", "neutral")),
      h("div", { class: "field" }, h("span", { class: "label" }, "Status"),
        h("div", { class: "seg" }, STATUSES.filter((s) => s !== "Not Started" || t.status === "Not Started").map((s) =>
          h("button", { "aria-pressed": String(d.status === s), onclick: () => { d.status = s; if (s === "Done") d.progress = 100; d.err = ""; render(); } }, s)))),
      h("div", { class: "fields" },
        h("div", { class: "field" }, h("label", { for: k("prog") }, `Progress: ${d.progress}%`),
          h("input", { id: k("prog"), type: "range", min: "0", max: "100", step: "5", value: d.progress, oninput: (e) => { d.progress = Number(e.target.value); e.target.previousSibling.textContent = `Progress: ${d.progress}%`; } })),
        field("Hours spent today", k("hrs"), h("input", { id: k("hrs"), type: "number", min: "0", max: "16", step: "0.5", inputmode: "decimal", placeholder: "0", value: d.hours, oninput: (e) => { d.hours = e.target.value; } })),
        h("div", { class: "field" }, h("span", { class: "label" }, "Revision rounds"),
          h("div", { class: "stepper" }, h("button", { "aria-label": "One fewer revision", onclick: () => { d.revisions = Math.max(0, d.revisions - 1); render(); } }, "-"),
            h("span", null, d.revisions), h("button", { "aria-label": "One more revision", onclick: () => { d.revisions += 1; render(); } }, "+"))),
        d.status === "Done" ? field("Actual end date", k("end"), h("input", { id: k("end"), type: "date", value: d.actualEnd, max: td, onchange: (e) => { d.actualEnd = e.target.value; } })) : null),
      field("What moved today", k("note"), h("input", { id: k("note"), type: "text", maxlength: "280", placeholder: "For example: Finished empty states, sent v2 to PM", value: d.note, oninput: (e) => { d.note = e.target.value; } })),
      field(d.status === "Blocked" ? "Blocker (required)" : "Dependencies or blockers", k("blk"), h("input", { id: k("blk"), type: "text", maxlength: "200", placeholder: "Waiting on copy, API decision, review slot", value: d.blocker, oninput: (e) => { d.blocker = e.target.value; d.err = ""; } })),
      d.err ? h("div", { class: "err" }, d.err) : null,
      h("div", { class: "row" }, h("button", { class: "btn accent", disabled: S.busy["u" + t.id], onclick: () => saveUpdate(t, d, name) }, todays ? "Update today's entry" : "Save today's update"))),
    history.length ? h("details", null, h("summary", { class: "small" }, `Recent updates (${(t.updates || []).length})`),
      h("div", { class: "history", style: "margin-top:8px" }, history.map((u) => h("div", null, h("b", null, fmtDate(u.d, true)), `  ${u.status}, ${u.progress}%`, u.hours ? `, ${fmt1(u.hours)} hrs` : "", u.note ? `. ${u.note}` : "")))) : null);
}
function saveUpdate(t, d, name) {
  if (d.status === "Blocked" && !d.blocker.trim()) { d.err = "Say what is blocking this task so the PM can help."; return render(); }
  const hours = d.hours === "" ? 0 : Number(d.hours);
  if (!(hours >= 0 && hours <= 24)) { d.err = "Hours must be between 0 and 24."; return render(); }
  const td = today(), at = nowIso();
  const entry = { d: td, status: d.status, progress: d.progress, hours, note: d.note.trim(), blocker: d.blocker.trim(), by: S.me.id, at };
  const updates = (t.updates || []).filter((u) => u.d !== td).concat([entry]).sort((a, b) => (a.d < b.d ? -1 : 1));
  guard("u" + t.id, async () => {
    await db.doc(`progress/${S.me.id}/tasks/${t.id}`).set({ taskId: t.id, designer: name, status: d.status, progress: d.progress, revisions: d.revisions,
      blockers: d.blocker.trim(), actualEnd: d.status === "Done" ? (d.actualEnd || td) : "", updates, updatedAt: at });
    await ensureOwnerId();
    delete S.drafts[t.id];
    toast(d.status === "Done" ? `${t.taskId} marked done` : `Update saved for ${t.taskId}`);
  });
}

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
async function ensureOwnerId() {
  if (!S.me.isOwner || !S.peopleLoaded || S.ownerId === S.me.id) return;
  await db.doc("config/people").set({ map: S.people, ownerId: S.me.id });
}
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
  root.appendChild(head("Performance and productivity", "Overview", "Same formulas as your Scorecard. Speed and Quality use tasks completed in the period; Commitment is as of today.",
    h("div", { class: "stack", style: "gap:8px;align-items:flex-end" },
      h("div", { class: "seg" }, [["month", "This month"], ["last", "Last month"], ["30", "30 days"], ["quarter", "Quarter"], ["custom", "Custom"]].map(([k, l]) => h("button", { "aria-pressed": String(S.period === k), onclick: () => { S.period = k; render(); } }, l))),
      S.period === "custom" ? h("div", { class: "row" }, h("input", { id: "p-from", type: "date", value: S.custom.from, "aria-label": "Period from", onchange: (e) => { S.custom.from = e.target.value; render(); } }),
        h("input", { id: "p-to", type: "date", value: S.custom.to, "aria-label": "Period to", onchange: (e) => { S.custom.to = e.target.value; render(); } })) : null)));
  root.appendChild(h("div", { class: "stack", style: "gap:8px" }, h("div", { class: "eyebrow" }, "Task funnel"), funnelStrip()));
  root.appendChild(h("div", { class: "kpis" },
    kpi(String(all.length), "Approved tasks"), kpi(String(doneAll.length), "Completed"), kpi(String(all.length - doneAll.length), "Open"),
    kpi(String(all.filter((t) => t.delivery === "Overdue").length), "Overdue", all.some((t) => t.delivery === "Overdue") ? "var(--critical-ink)" : null),
    kpi(pct(onTime), "On-time (all done)"), kpi(scores.length ? fmt0(scores.reduce((a, b) => a + b, 0) / scores.length) : "-", "Avg task score"), kpi(fmt1(hoursP), `Hours logged, ${p.label}`)));
  root.appendChild(h("div", { class: "card" }, h("div", { class: "pad", style: "padding-bottom:4px" }, h("h2", null, `Designer scorecard, ${p.label}`)),
    h("div", { class: "tbl-wrap" }, h("table", null,
      h("thead", null, h("tr", null, h("th", null, "Designer"), h("th", { class: "n" }, "Done"), h("th", { class: "n" }, "Avg TAT"), h("th", { class: "n" }, "On-time"), h("th", null, "Speed"), h("th", null, "Quality"), h("th", null, "Commitment"), h("th", { class: "n" }, "Overall"), h("th", null, "Rating"), h("th", null, "Focus area"))),
      h("tbody", null, sc.length ? sc.map((r) => h("tr", null, h("td", { style: "font-weight:600" }, r.designer), h("td", { class: "n" }, r.completed), h("td", { class: "n" }, fmt1(r.avgTat)), h("td", { class: "n" }, pct(r.onTime)),
        scoreCell(r.speed, "var(--s1)"), scoreCell(r.quality, "var(--s2)"), scoreCell(r.commitment, "var(--s3)"), h("td", { class: "n", style: "font-weight:700" }, fmt0(r.overall)),
        h("td", null, r.rating === "-" ? pill("No data", "neutral") : pill(r.rating, { Excellent: "good", Good: "info", "Needs Improvement": "warn", "At Risk": "critical" }[r.rating])),
        h("td", { class: "small muted", style: "min-width:220px" }, r.focus))) : h("tr", null, h("td", { colspan: "10", class: "empty" }, "Add designers under Lists & 4E.")))))));
  const weeks = Array.from({ length: 8 }, (_, i) => M.addDays(M.mondayOf(today()), 7 * i));
  const heat = h("div", { class: "heat", style: "grid-template-columns: minmax(70px, 110px) repeat(8, minmax(42px, 1fr));min-width:470px" },
    h("div"), weeks.map((w) => h("div", { class: "hd" }, fmtDate(w))), c.designers.map((d) => [h("div", { class: "nm" }, d), weeks.map((w) => heatCell(all, leave, d, w, ctx))]));
  const dcounts = Object.keys(DELIVERY).map((k) => ({ label: k, values: [{ v: all.filter((t) => t.delivery === k).length, color: DELIVERY_COLOR[k], name: "Tasks" }] }));
  root.appendChild(h("div", { class: "grid-half" },
    h("div", { class: "card pad stack" }, h("div", null, h("h2", null, "Workload, next 8 weeks"), h("div", { class: "hint" }, "Approved work as a share of capacity. Hover a week for hours.")),
      c.designers.length ? h("div", { class: "tbl-wrap" }, heat) : h("div", { class: "hint" }, "No designers yet."),
      h("div", { class: "legend" }, Object.entries(WL).map(([k, v]) => h("span", null, h("i", { style: `background:var(--${v === "neutral" ? "faint" : v + "-ink"})` }), k)))),
    h("div", { class: "card pad stack" }, h("h2", null, "Tasks by delivery status"), hbar(dcounts, { unit: "tasks" }))));
  const lastWeeks = Array.from({ length: 8 }, (_, i) => M.addDays(M.mondayOf(today()), -7 * (7 - i)));
  const series = c.designers.slice(0, 5).map((d, i) => ({ name: d, color: SERIES[i], points: lastWeeks.map((w) => ({ x: fmtDate(w),
    y: all.filter((t) => t.designer === d).reduce((a, t) => a + (t.updates || []).filter((u) => u.d >= w && u.d < M.addDays(w, 7)).reduce((s2, u) => s2 + (Number(u.hours) || 0), 0), 0) })) }));
  const lineRows = lines().map((l) => { const ts = all.filter((t) => (t.fourE || lineOf(t.master)) === l.name);
    return { label: l.name, total: ts.length, values: [{ v: ts.reduce((a, t) => a + (Number(t.effort) || 0), 0), color: "var(--s1)", name: "Estimated hrs" }, { v: ts.reduce((a, t) => a + t.hoursLogged, 0), color: "var(--s2)", name: "Logged hrs" }] }; }).filter((r) => r.total);
  root.appendChild(h("div", { class: "grid-half" },
    h("div", { class: "card pad stack" }, h("h2", null, "Hours logged per week"), series.length ? lineChart(series) : h("div", { class: "hint" }, "No designers yet."),
      series.length > 1 ? h("div", { class: "legend" }, series.map((s) => h("span", null, h("i", { style: `background:${s.color}` }), s.name))) : null),
    h("div", { class: "card pad stack" }, h("h2", null, "Effort by 4E line"), lineRows.length ? hbar(lineRows, { unit: "hrs" }) : h("div", { class: "hint" }, "Appears once tasks are approved."),
      lineRows.length ? h("div", { class: "legend" }, h("span", null, h("i", { style: "background:var(--s1)" }), "Estimated hours"), h("span", null, h("i", { style: "background:var(--s2)" }), "Logged hours")) : null)));
  const pmRows = M.pmTable(all.map((t) => ({ ...t, pm: t.assignedBy || t.pm })), c.pms);
  const stale = all.filter((t) => !t.actualEnd && t.start && t.start <= today() && (!t.lastUpdate || workdays(t.lastUpdate, today()) > 2));
  const attention = all.filter((t) => t.delivery === "Overdue" || t.delivery === "Blocked").concat(stale.filter((t) => t.delivery !== "Overdue" && t.delivery !== "Blocked"));
  root.appendChild(h("div", { class: "grid-half" },
    h("div", { class: "card" }, h("div", { class: "pad", style: "padding-bottom:4px" }, h("h2", null, "Tasks by requesting PM")),
      h("div", { class: "tbl-wrap" }, h("table", null, h("thead", null, h("tr", null, h("th", null, "PM"), ["Approved", "Open", "Blocked", "Overdue", "Avg revisions"].map((x) => h("th", { class: "n" }, x)))),
        h("tbody", null, pmRows.map((r) => h("tr", null, h("td", null, r.pm), h("td", { class: "n" }, r.created), h("td", { class: "n" }, r.open), h("td", { class: "n" }, r.blocked), h("td", { class: "n" }, r.overdue), h("td", { class: "n" }, fmt1(r.avgRevisions)))))))),
    h("div", { class: "card pad stack" }, h("div", null, h("h2", null, "Needs attention"), h("div", { class: "hint" }, "Overdue, blocked, or no update for more than 2 working days.")),
      attention.length ? h("div", { class: "stack", style: "gap:8px" }, attention.slice(0, 12).map((t) => h("div", { class: "row", style: "gap:8px;align-items:flex-start" },
        h("span", { class: "mono muted" }, t.taskId), h("div", { style: "flex:1;min-width:0" }, h("div", { style: "font-weight:600" }, t.title), h("div", { class: "small muted" }, `${t.designer} · ${t.master} / ${t.sub}` + (t.blockers ? ` · ${t.blockers}` : ""))),
        t.delivery === "Overdue" || t.delivery === "Blocked" ? deliveryPill(t) : pill(t.lastUpdate ? "Quiet since " + fmtDate(t.lastUpdate) : "No updates yet", "warn")))) : h("div", { class: "hint" }, "Nothing needs attention."))));
}

// ---- funnel review
function reviewFor(r) {
  if (!S.review[r.id] || S.review[r.id].updatedAt !== r.updatedAt) S.review[r.id] = { updatedAt: r.updatedAt, subtasks: clone(r.subtasks || []), note: "", err: "", subErr: {} };
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
  if (!list.length) return root.appendChild(h("div", { class: "card empty" }, h("h3", null, S.funnelTab === "pending" ? "No requests waiting" : "Nothing here"),
    h("p", { style: "margin:0" }, S.funnelTab === "pending" ? "PMs submit requests from Task Creation. Share its link from People & links." : "")));
  for (const r of list) root.appendChild(S.funnelTab === "pending" ? reviewCard(r) : decidedCard(r));
}
function reqHeader(r) {
  return h("div", { class: "req-head" }, h("div", { class: "t" },
    h("div", { class: "row", style: "gap:6px" }, h("span", { class: "mono muted" }, r.ref || ""), h("span", { class: "tag" }, r.fourE), h("span", { class: "tag sub" }, r.product), r.priority === "High" ? pill("High priority", "serious") : null),
    h("h3", { style: "margin-top:6px" }, r.masterTitle),
    h("div", { class: "small muted" }, `${r.project} (lead ${M.projectLead(cfg(), r.project)}) · requested by ${r.pmName} · submitted ${fmtDate(r.submittedAt)}` + (r.resubmittedAt ? `, resubmitted ${fmtDate(r.resubmittedAt)}` : ""))),
    reqPill(r.status));
}
function reviewCard(r) {
  const rv = reviewFor(r), c = cfg();
  const hours = rv.subtasks.reduce((a, s) => a + (Number(s.effort) || 0), 0);
  const rows = rv.subtasks.map((s, i) => {
    const e = rv.subErr[s.key] || {};
    const id = (k) => `rv-${k}-${r.id}-${i}`;
    return h("tr", null, h("td", { class: "mono" }, String(i + 1)),
      h("td", { style: "min-width:220px" }, h("b", null, s.sub), h("div", { class: "small muted", style: "max-width:48ch;white-space:pre-line" }, s.detail)),
      h("td", null, select(id("d"), s.designer, c.designers, (v) => { s.designer = v; delete e.designer; render(); }, "Choose"), e.designer ? h("div", { class: "err" }, e.designer) : null),
      h("td", null, h("input", { id: id("s"), type: "date", value: s.start, "aria-label": "Start", onchange: (ev) => { s.start = ev.target.value; render(); } })),
      h("td", null, h("input", { id: id("e"), type: "date", value: s.end, min: s.start || null, "aria-label": "End", onchange: (ev) => { s.end = ev.target.value; render(); } }), e.end ? h("div", { class: "err" }, e.end) : null),
      h("td", null, h("input", { id: id("h"), type: "number", min: "0.5", step: "0.5", value: s.effort, "aria-label": "Hours", style: "width:84px", oninput: (ev) => { s.effort = ev.target.value; softRender(); } })));
  });
  const impact = capacityImpact(rv.subtasks);
  return h("article", { class: "card pad req" }, reqHeader(r),
    r.brief ? h("div", { class: "small", style: "overflow-wrap:anywhere" }, h("b", null, "Brief: "), r.brief) : null,
    h("div", { class: "tbl-wrap" }, h("table", null, h("thead", null, h("tr", null, ["#", "Subtask", "Designer", "Start", "End", "Hours"].map((x) => h("th", null, x)))), h("tbody", null, rows))),
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
  const base = Date.now(), at = new Date(base).toISOString();
  guard("decide", async () => {
    const out = [];
    for (let i = 0; i < rv.subtasks.length; i++) {
      const s = rv.subtasks[i];
      const ref = db.collection("tasks").doc();
      await ref.set({ requestId: r.id, requestUid: r.uid, fourE: r.fourE, master: r.product, masterTitle: r.masterTitle, sub: s.sub, title: s.detail.split("\n")[0].slice(0, 140),
        detail: s.detail, brief: r.brief || "", project: r.project, designer: s.designer, priority: r.priority, start: s.start, target: s.end, effort: Number(s.effort) || 0,
        assignedBy: r.pmName, requestedAt: r.submittedAt, approvedAt: at, createdAt: new Date(base + i).toISOString(), createdBy: S.me.id });
      out.push({ ...s, effort: Number(s.effort) || 0, taskId: ref.id });
    }
    await db.doc(`requests/${r.uid}/items/${r.id}`).update({ status: "approved", subtasks: out, decidedAt: at, ownerNote: rv.note.trim(), updatedAt: at,
      history: (r.history || []).concat([{ at, status: "approved", by: "owner", note: rv.note.trim() }]) });
    delete S.review[r.id];
    toast(`Approved. ${out.length} task${out.length === 1 ? "" : "s"} added to the Tracker`);
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
        return h("tr", null, h("td", { class: "mono" }, t ? t.taskId : String(i + 1)), h("td", null, h("b", null, s.sub), h("div", { class: "small muted", style: "max-width:48ch" }, s.detail)), h("td", null, s.designer || "-"),
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
        h("div", { style: "font-weight:600;margin-top:4px" }, t.title), h("div", { class: "small muted" }, `${t.masterTitle ? t.masterTitle + " · " : ""}${t.project} · by ${t.assignedBy || "-"}`)),
      h("td", null, t.designer),
      h("td", null, h("div", null, t.status), h("div", { class: "bar-cell", style: "margin-top:6px" }, h("span", { class: "track" }, h("i", { style: `width:${t.progress || 0}%;background:var(--des)` })), h("span", { class: "num small" }, (t.progress || 0) + "%"))),
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
function viewPeople(root) {
  const ids = Object.keys(S.claims).concat(Object.keys(S.people));
  if (userApi && ids.some((id) => !S.profiles[id])) userApi.profiles(ids).then((ps) => { let ch = false; for (const id of ids) if (!S.profiles[id] || S.profiles[id].name !== ps[id].name) { S.profiles[id] = ps[id]; ch = true; } if (ch) render(); });
  const prof = (id) => S.profiles[id] || { name: "", avatarUrl: "" };
  root.appendChild(head("Access", "People & links", "Send each group only its own link. Everyone needs Contributor access to this page (Share menu). First-time visitors ask to join and you approve them here."));
  const link = (app, note) => h("div", { class: "link-row" }, h("div", null, h("b", null, APPS[app].name), h("div", { class: "small muted" }, note), h("code", null, `${ARTIFACT_URL}#${app}`)),
    h("button", { class: "btn sm", onclick: () => copyText(`${ARTIFACT_URL}#${app}`) }, "Copy link"));
  root.appendChild(h("div", { class: "card pad stack" }, h("h2", null, "Links"), h("div", { class: "links" },
    link("pm", "For product managers. Create requests and follow their approval."),
    link("designer", "For product designers. Daily progress and weekly leave."),
    link("owner", "For you only. Anyone else who opens it is turned away."))));
  const claims = Object.entries(S.claims);
  root.appendChild(h("div", { class: "card pad stack" }, h("h2", null, `Join requests (${claims.length})`),
    claims.length ? claims.map(([id, cl]) => h("div", { class: "row", style: "gap:12px" }, h("img", { class: "avatar", src: prof(id).avatarUrl || "", alt: "" }),
      h("div", { style: "flex:1;min-width:0" }, h("div", { style: "font-weight:600" }, prof(id).name || "Someone in your organisation"), h("div", { class: "small muted" }, `Asks to join as ${cl.role === "pm" ? "product manager" : "designer"} "${cl.name}"`)),
      h("button", { class: "btn sm accent", disabled: S.busy.people, onclick: () => approveMember(id, cl) }, "Approve"),
      h("button", { class: "btn sm ghost danger", onclick: () => guard("people", () => db.doc("claims/" + id).delete()) }, "Decline"))) : h("div", { class: "hint" }, "No pending requests.")));
  const members = Object.entries(S.people);
  root.appendChild(h("div", { class: "card" }, h("div", { class: "pad", style: "padding-bottom:4px" }, h("h2", null, `Members (${members.length})`)),
    members.length ? h("div", { class: "tbl-wrap" }, h("table", null, h("thead", null, h("tr", null, ["Person", "Role", "Name on tracker", ""].map((x) => h("th", null, x)))),
      h("tbody", null, members.map(([id, p]) => h("tr", null, h("td", null, h("span", { class: "row", style: "gap:8px" }, h("img", { class: "avatar", style: "width:24px;height:24px", src: prof(id).avatarUrl || "", alt: "" }), prof(id).name || "Member")),
        h("td", null, pill(p.role === "pm" ? "Product manager" : "Designer", p.role === "pm" ? "info" : "good")), h("td", null, p.name),
        h("td", { style: "text-align:right" }, S.confirm === id ? h("span", null, h("button", { class: "btn sm danger", onclick: () => removeMember(id) }, "Remove"), h("button", { class: "btn sm ghost", onclick: () => { S.confirm = null; render(); } }, "Keep"))
          : h("button", { class: "btn sm ghost danger", onclick: () => { S.confirm = id; render(); } }, "Remove access"))))))) : h("div", { class: "pad hint" }, "Nobody approved yet.")));
}
function approveMember(id, cl) {
  guard("people", async () => { await db.doc("config/people").set({ map: { ...S.people, [id]: { role: cl.role, name: cl.name } }, ownerId: S.me.id }); await db.doc("claims/" + id).delete(); toast(`${cl.name} can now use ${APPS[cl.role === "pm" ? "pm" : "designer"].name}`); });
}
function removeMember(id) {
  const map = { ...S.people }; delete map[id];
  guard("people", async () => { await db.doc("config/people").set({ map, ownerId: S.me.id }); S.confirm = null; toast("Access removed"); });
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
        h("span", null, h("b", null, "Designer copy. "), "Hides Scorecard, Settings, Dashboard, Task Details, Daily Log and Task Funnel, and locks the sheet list.")),
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
      h("div", null, h("b", null, "Tracker. "), "One row per approved subtask. Task Assigned reads Product / Subtask: Detail."),
      h("div", null, h("b", null, "Task Funnel. "), "Every submitted request, one row per subtask, with your decision and note."),
      h("div", null, h("b", null, "Task Details. "), "4E line, product, master task title, request ID, progress and hours."),
      h("div", null, h("b", null, "Daily Log. "), "Every designer update."),
      h("div", null, h("b", null, "Leave & Holidays, Settings, Scorecard. "), "Leave entries, holidays, lists, scoring and the period above."),
      h("div", null, h("b", null, "Dashboard. "), "KPIs, six charts, funnel and 4E tables. Recalculates on open."))));
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
  if (!downloads) { S.exportMsg = { kind: "warn", text: "Downloads aren't available in this view. Open the page in claude.ai to download the workbook." }; return render(); }
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
    await downloads.save({ filename: name, data: new Blob([bytes]) });
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
function normalizeConfig(c) {
  return { designers: c.designers || [], pms: c.pms || [], projects: c.projects || [], lines: (c.lines || []).map((l) => ({ name: l.name, products: l.products || [] })),
    subTags: c.subTags || [], holidays: c.holidays || [], scoring: c.scoring || {} };
}
async function boot() {
  const claude = window.claude;
  const [u, d, dl] = claude && claude.use ? await Promise.all([claude.use("user"), claude.use("db"), claude.use("downloads")]) : [null, null, null];
  userApi = u; db = d; downloads = dl;
  if (u) { const me = await u.me(); S.me = { id: me.id, name: me.name, avatarUrl: me.avatarUrl, isOwner: me.isOwner }; }
  if (!db) { S.noDb = true; S.ready = true; return render(); }
  let pending = 3;
  const done = () => { if (--pending <= 0) S.ready = true; render(); };
  db.doc("config/main").onSnapshot((s) => { S.config = s.exists ? normalizeConfig(s.data()) : null; done(); }, (e) => { onErr(e); done(); });
  db.doc("config/people").onSnapshot((s) => {
    const data = s.exists ? s.data() : {};
    S.people = data.map || {}; S.ownerId = data.ownerId || null; S.peopleLoaded = true;
    syncSubs(); done();
    if (S.me.isOwner && S.ownerId !== S.me.id) ensureOwnerId().catch(onErr);
  }, (e) => { onErr(e); done(); });
  db.collection("tasks").onSnapshot((q) => { S.tasksRaw = q.docs.map((x) => ({ id: x.id, ...x.data() })); done(); }, (e) => { onErr(e); done(); });
  if (S.me.isOwner) db.collection("claims").onSnapshot((q) => { const m = {}; q.docs.forEach((x) => { m[x.id] = x.data(); }); S.claims = m; render(); }, onErr);
  else if (S.me.id) db.doc("claims/" + S.me.id).onSnapshot((s) => { S.myClaim = s.exists ? s.data() : null; render(); }, onErr);
  syncSubs();
}
render();
boot().catch((e) => { console.error(e); S.ready = true; S.noDb = true; render(); });
})();
