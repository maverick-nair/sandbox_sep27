/* Design Task Hub: the workbook's formulas, in JavaScript.
 *
 * Mirrors the Tracker's auto columns (N to U), the Scorecard's designer and
 * PM tables and its weekly workload block, so the in-app dashboard shows the
 * same numbers the Excel file computes. Dates are ISO strings (YYYY-MM-DD).
 */
(function (root) {
  "use strict";

  const DAY = 86400000;
  const toDay = (iso) => {
    const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
    return Date.UTC(y, m - 1, d) / DAY;
  };
  const toIso = (day) => new Date(day * DAY).toISOString().slice(0, 10);
  // ISO weekday, Monday = 1 ... Sunday = 7 (Excel WEEKDAY(x, 2))
  const isoWeekday = (day) => ((new Date(day * DAY).getUTCDay() + 6) % 7) + 1;

  function todayIso(now = new Date()) {
    const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }

  function mondayOf(iso) {
    const d = toDay(iso);
    return toIso(d - isoWeekday(d) + 1);
  }

  function addDays(iso, n) { return toIso(toDay(iso) + n); }

  function defaults(scoring = {}) {
    const s = {
      speedWeight: 0.4, qualityWeight: 0.4, commitmentWeight: 0.2, revisionZero: 4,
      excellent: 85, good: 70, needsImprovement: 50, weeklyHours: 48, daysPerWeek: 5,
      overloadAbove: 1, underBelow: 0.7, ...scoring,
    };
    s.hoursPerDay = s.weeklyHours / s.daysPerWeek;
    return s;
  }

  function isWorkday(day, s) { return isoWeekday(day) <= (s.daysPerWeek === 6 ? 6 : 5); }

  // NETWORKDAYS.INTL(start, end, weekend code 1 or 11, holidays)
  function networkDays(startIso, endIso, s, holidaySet) {
    let a = toDay(startIso), b = toDay(endIso), sign = 1;
    if (b < a) { [a, b] = [b, a]; sign = -1; }
    let n = 0;
    for (let d = a; d <= b; d++) if (isWorkday(d, s) && !holidaySet.has(toIso(d))) n++;
    return sign * n;
  }

  function derive(task, ctx) {
    const { s, holidays, today } = ctx;
    const t = { ...task };
    const hasTask = !!(t.master || t.sub || t.title);
    t.tat = "";
    if (hasTask && t.start && !(!t.actualEnd && t.start > today)) {
      t.tat = networkDays(t.start, t.actualEnd || today, s, holidays);
    }
    t.planned = "";
    if (hasTask && t.start && t.target && t.target >= t.start) t.planned = networkDays(t.start, t.target, s, holidays);
    t.variance = t.actualEnd && t.tat !== "" && t.planned !== "" ? t.tat - t.planned : "";
    let ds = "";
    if (hasTask) {
      if (!t.start) ds = "Not Scheduled";
      else if (t.actualEnd) ds = !t.target || t.actualEnd <= t.target ? "Done On Time" : "Done Late";
      else if (t.status === "Blocked") ds = "Blocked";
      else if (t.target && today > t.target) ds = "Overdue";
      else if (t.start > today) ds = "Scheduled";
      else ds = "On Track";
    }
    t.delivery = ds;
    t.speed = t.actualEnd && t.tat !== "" && t.planned !== "" ? 100 * Math.min(1, t.planned / Math.max(t.tat, 1)) : "";
    t.quality = t.actualEnd ? 100 * Math.max(0, 1 - (Number(t.revisions) || 0) / s.revisionZero) : "";
    t.score = t.speed !== "" && t.quality !== ""
      ? (s.speedWeight * t.speed + s.qualityWeight * t.quality) / (s.speedWeight + s.qualityWeight) : "";
    t.hoursPerDay = t.effort && t.planned !== "" && t.planned !== 0 ? Number(t.effort) / t.planned : "";
    t.hoursLogged = (t.updates || []).reduce((a, u) => a + (Number(u.hours) || 0), 0);
    t.lastUpdate = (t.updates || []).reduce((a, u) => (u.d > a ? u.d : a), "");
    return t;
  }

  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  function rating(score, s) {
    if (score == null) return "-";
    if (score >= s.excellent) return "Excellent";
    if (score >= s.good) return "Good";
    if (score >= s.needsImprovement) return "Needs Improvement";
    return "At Risk";
  }

  function focusArea(r) {
    if (r.overall == null) return "Needs at least one completed task in the period";
    const m = Math.min(r.speed, r.quality, r.commitment);
    if (m >= 90) return "Strong across all areas. Keep it up";
    if (r.speed === m) return "Speed: tasks take longer than planned. Raise delays early and plan realistic dates";
    if (r.quality === m) return "Quality: too many revision rounds. Confirm the brief and self-review before sharing";
    return "Commitment: open tasks are past target date. Update status or log the blocker";
  }

  function scorecard(tasks, designers, period, s) {
    const inPeriod = (t) => t.actualEnd && t.actualEnd >= period.from && t.actualEnd <= period.to;
    return designers.map((name) => {
      const mine = tasks.filter((t) => t.designer === name);
      const done = mine.filter(inPeriod);
      const nums = (k) => done.map((t) => t[k]).filter((v) => v !== "" && v != null);
      const open = mine.filter((t) => !t.actualEnd);
      const overdue = mine.filter((t) => t.delivery === "Overdue").length;
      const r = {
        designer: name,
        completed: done.length,
        avgTat: avg(nums("tat")),
        onTime: done.length ? done.filter((t) => t.delivery === "Done On Time").length / done.length : null,
        avgRevisions: done.length ? done.reduce((a, t) => a + (Number(t.revisions) || 0), 0) / done.length : null,
        speed: avg(nums("speed")),
        quality: avg(nums("quality")),
        commitment: open.length ? 100 * (1 - overdue / open.length) : 100,
        open: open.length,
        overdue,
      };
      const wsum = s.speedWeight + s.qualityWeight + s.commitmentWeight;
      r.overall = r.speed != null && r.quality != null
        ? (s.speedWeight * r.speed + s.qualityWeight * r.quality + s.commitmentWeight * r.commitment) / wsum : null;
      r.rating = rating(r.overall, s);
      r.focus = focusArea(r);
      return r;
    });
  }

  function pmTable(tasks, pms) {
    return pms.map((pm) => {
      const mine = tasks.filter((t) => t.pm === pm);
      const done = mine.filter((t) => String(t.delivery).startsWith("Done"));
      return {
        pm,
        created: mine.length,
        open: mine.filter((t) => !t.actualEnd).length,
        blocked: mine.filter((t) => t.delivery === "Blocked").length,
        overdue: mine.filter((t) => t.delivery === "Overdue").length,
        avgRevisions: done.length ? done.reduce((a, t) => a + (Number(t.revisions) || 0), 0) / done.length : null,
      };
    });
  }

  // Scorecard "Weekly workload" block for one designer and one Monday
  function week(tasks, leave, designer, mondayIso, ctx) {
    const { s, holidays } = ctx;
    const m = toDay(mondayIso);
    let hol = 0, off = 0, alloc = 0;
    for (let k = 0; k < 6; k++) {
      const d = m + k, iso = toIso(d);
      if (isoWeekday(d) > s.daysPerWeek) continue;
      if (holidays.has(iso)) { hol++; continue; }
      if (leave.some((l) => l.designer === designer && l.from <= iso && l.to >= iso)) off++;
      for (const t of tasks) {
        if (t.designer === designer && t.hoursPerDay !== "" && t.start && t.target && t.start <= iso && t.target >= iso) alloc += t.hoursPerDay;
      }
    }
    const available = Math.max(0, s.daysPerWeek - hol - off) * s.hoursPerDay;
    const util = available === 0 ? null : alloc / available;
    let status;
    if (available === 0) status = alloc > 0 ? "Overloaded" : "On leave / holiday";
    else if (util > s.overloadAbove) status = "Overloaded";
    else if (util < s.underBelow) status = "Under-utilised";
    else status = "Balanced";
    return { monday: mondayIso, holidays: hol, leaveDays: off, available, allocated: alloc, utilisation: util, headroom: available - alloc, status };
  }

  function context(config, today = todayIso()) {
    const s = defaults(config && config.scoring);
    const holidays = new Set(((config && config.holidays) || []).map((h) => h.date));
    return { s, holidays, today };
  }

  function projectLead(config, project) {
    const p = ((config && config.projects) || []).find((x) => x.name === project);
    return p ? p.lead : project ? "Not mapped" : "";
  }

  // All tasks with the Tracker's auto columns filled in, in Tracker order.
  function deriveAll(tasks, config, today) {
    const ctx = context(config, today);
    return sortTasks(tasks).map((t, i) => ({ ...derive(t, ctx), taskId: "T-" + String(i + 1).padStart(3, "0"), pm: projectLead(config, t.project) }));
  }

  function sortTasks(tasks) {
    return tasks.slice().sort((a, b) => (a.createdAt === b.createdAt ? (a.id < b.id ? -1 : 1) : a.createdAt < b.createdAt ? -1 : 1));
  }

  // Approved tasks (owner-written) + designer progress docs (each designer
  // writes their own). Latest progress doc wins for status fields; daily
  // updates are merged by date, the most recent write for a date winning.
  const PROGRESS_FIELDS = ["status", "progress", "revisions", "blockers", "actualEnd"];
  function mergeProgress(tasks, progressDocs) {
    const byTask = new Map();
    for (const p of progressDocs || []) {
      if (!p || !p.taskId) continue;
      if (!byTask.has(p.taskId)) byTask.set(p.taskId, []);
      byTask.get(p.taskId).push(p);
    }
    return tasks.map((t) => {
      const ps = (byTask.get(t.id) || []).slice().sort((a, b) => (a.updatedAt < b.updatedAt ? -1 : 1));
      const out = { status: "Not Started", progress: 0, revisions: 0, blockers: "", actualEnd: "", ...t, updates: [] };
      const days = new Map();
      for (const p of ps) {
        for (const k of PROGRESS_FIELDS) if (p[k] !== undefined) out[k] = p[k];
        for (const u of p.updates || []) {
          const cur = days.get(u.d);
          if (!cur || (u.at || "") >= (cur.at || "")) days.set(u.d, u);
        }
      }
      out.updates = Array.from(days.values()).sort((a, b) => (a.d < b.d ? -1 : 1));
      return out;
    });
  }

  // 4E lines -> flat product list with their line (the "master tasks")
  function productsOf(config) {
    return ((config && config.lines) || []).flatMap((l) => (l.products || []).map((p) => ({ name: p, group: l.name })));
  }

  const api = {
    mergeProgress, productsOf,
    todayIso, mondayOf, addDays, networkDays, derive, deriveAll, sortTasks, scorecard, pmTable, week, context,
    defaults, rating, projectLead, toDay, toIso, isoWeekday,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.DTHMetrics = api;
})(typeof self !== "undefined" ? self : this);
