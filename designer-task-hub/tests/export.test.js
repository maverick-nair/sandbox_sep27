// Fills the template with generated data, recalculates it in LibreOffice and
// checks the workbook's own formulas against app/metrics.js.
//   npm test                 (the recalc checks skip when soffice is missing)
//   RECALC=path/to/recalc.py (optional) LibreOffice recalc script
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const JSZip = require("jszip");
const { DOMParser, XMLSerializer } = require("@xmldom/xmldom");
const X = require("../app/export.js");
const M = require("../app/metrics.js");

const ROOT = path.join(__dirname, "..");
const TEMPLATE = fs.readFileSync(path.join(ROOT, "workbook/template.xlsx"));
const today = M.todayIso();
const d = (n) => M.addDays(today, n);

// Test fixture only: names follow the workbook's Settings sheet.
const config = {
  designers: ["Pragati", "Swathi"],
  pms: ["Raghav", "SL", "Arun", "Naveen", "Manu"],
  projects: [
    { name: "GenieTracker Revamp", lead: "Raghav" },
    { name: "Nano AI Launch", lead: "SL" },
    { name: "AI Koach v2", lead: "Manu" },
  ],
  masterTags: [
    { name: "GenieTracker", group: "Platform" },
    { name: "Nano AI", group: "Evaluate" },
    { name: "AI Koach", group: "Enable" },
  ],
  subTags: ["Feature design", "UX research", "Wireframes"],
  holidays: [{ date: d(-20), name: "Test holiday" }],
  scoring: {},
};

function fixtureTasks(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const done = i % 3 === 0;
    const start = d(-30 + (i % 20));
    const target = M.addDays(start, 3 + (i % 7));
    out.push({
      id: "task" + String(i).padStart(3, "0"),
      createdAt: `2026-08-01T10:${String(i % 60).padStart(2, "0")}:00Z`,
      master: config.masterTags[i % 3].name,
      sub: config.subTags[i % 3],
      title: `Screen set ${i + 1} <&> "quoted"`,
      project: config.projects[i % 3].name,
      designer: config.designers[i % 2],
      priority: ["High", "Medium", "Low"][i % 3],
      start,
      target,
      effort: 4 + (i % 5) * 2,
      status: done ? "Done" : i % 7 === 0 ? "Blocked" : "In Progress",
      actualEnd: done ? M.addDays(target, (i % 4) - 1) : "",
      revisions: i % 4,
      blockers: i % 7 === 0 ? "Waiting on copy" : "",
      progress: done ? 100 : 40,
      assignedBy: config.pms[i % 5],
      updates: [
        { d: d(-3), hours: 2, progress: 20, status: "In Progress", note: "Started" },
        { d: d(-1), hours: 3.5, progress: 40, status: "In Progress", note: "Iterating" },
      ],
    });
  }
  return out;
}

const tasks = fixtureTasks(60); // more than the template's 50 table rows
const leave = [{ designer: "Pragati", from: d(1), to: d(2), type: "Planned Leave", note: "" }];
const period = { from: d(-40), to: d(10) };

async function buildFile() {
  const { bytes, warnings } = await X.build({ JSZip, DOMParser, XMLSerializer }, TEMPLATE,
    { config, tasks, leave, period });
  const dir = fs.mkdtempSync(path.join(process.env.DTH_TMP || os.tmpdir(), "dth-"));
  const file = path.join(dir, "out.xlsx");
  fs.writeFileSync(file, bytes);
  return { file, warnings };
}

test("export keeps the workbook structure and grows the tables", async () => {
  const { file } = await buildFile();
  const zip = await JSZip.loadAsync(fs.readFileSync(file));
  const t1 = await zip.file("xl/tables/table1.xml").async("string");
  assert.match(t1, /ref="A4:U64"/);
  const s1 = await zip.file("xl/worksheets/sheet1.xml").async("string");
  assert.match(s1, /x14:dataValidations/, "dropdown validations survive");
  assert.match(s1, /<row r="64"[^>]*>.*?<c r="Q64"[^>]*><f[^>]*>IF\(tblTasks/s, "formula rows cloned");
  const s2 = await zip.file("xl/worksheets/sheet2.xml").async("string");
  assert.match(s2, /cm="1"/, "dynamic array metadata survives");
  const c4 = await zip.file("xl/charts/chart4.xml").async("string");
  assert.equal((c4.match(/<c:ser>/g) || []).length, 2, "line chart trimmed to 2 designers");
  const c1 = await zip.file("xl/charts/chart1.xml").async("string");
  assert.match(c1, /\$A\$68:\$A\$69/);
  new DOMParser().parseFromString(s1, "application/xml"); // well-formed
});

const recalc = process.env.RECALC;
const hasSoffice = spawnSync("which", ["soffice"]).status === 0 && recalc && fs.existsSync(recalc);

test("workbook formulas agree with the app's metrics", { skip: !hasSoffice && "set RECALC and install LibreOffice Calc" }, async () => {
  const { file } = await buildFile();
  const res = JSON.parse(execFileSync("python3", [recalc, file, "300"], { encoding: "utf8" }));
  assert.equal(res.status, "success", JSON.stringify(res));
  assert.equal(res.total_errors, 0);
  const dump = execFileSync("python3", ["-c", `
import json, openpyxl, sys
wb = openpyxl.load_workbook(sys.argv[1], data_only=True)
t = wb["Tracker"]; s = wb["Scorecard"]; d = wb["Dashboard"]; td = wb["Task Details"]
rows = [[t.cell(r, c).value for c in range(1, 22)] for r in range(5, 65)]
sc = [[s.cell(r, c).value for c in range(1, 11)] for r in range(12, 14)]
wk = [[s.cell(r, c).value for c in range(3, 11)] for r in (39, 40, 45, 46)]
kpi = [d.cell(5, c).value for c in range(1, 17, 2)]
det = [[td.cell(r, c).value for c in range(1, 9)] for r in (5, 64)]
print(json.dumps({"rows": rows, "sc": sc, "wk": wk, "kpi": kpi, "det": det}, default=str))
`, file], { encoding: "utf8" });
  const x = JSON.parse(dump);
  const derived = M.deriveAll(tasks, config, today);
  const close = (a, b, msg) => {
    if (b === "" || b == null) return assert.ok(a === "" || a == null, `${msg}: ${a} vs ${b}`);
    assert.ok(Math.abs(Number(a) - Number(b)) < 1e-6, `${msg}: excel ${a} vs app ${b}`);
  };
  derived.forEach((t, i) => {
    const r = x.rows[i];
    assert.equal(r[0], t.taskId);
    assert.equal(r[3], t.pm, "PM mapped from project");
    close(r[13], t.tat, `TAT ${t.taskId}`);
    close(r[14], t.planned, `Planned ${t.taskId}`);
    close(r[15], t.variance, `Variance ${t.taskId}`);
    assert.equal(r[16], t.delivery, `Delivery ${t.taskId}`);
    close(r[17], t.speed, `Speed ${t.taskId}`);
    close(r[18], t.quality, `Quality ${t.taskId}`);
    close(r[19], t.score, `Score ${t.taskId}`);
    close(r[20], t.hoursPerDay, `Hrs/day ${t.taskId}`);
  });
  const ctx = M.context(config, today);
  const sc = M.scorecard(derived, config.designers, period, ctx.s);
  sc.forEach((r, i) => {
    const e = x.sc[i];
    assert.equal(e[0], r.designer);
    assert.equal(e[1], r.completed);
    close(e[5], r.speed, "speed avg");
    close(e[6], r.quality, "quality avg");
    close(e[7], r.commitment, "commitment");
    close(e[8], r.overall, "overall");
    assert.equal(e[9], r.rating);
  });
  const mon = M.mondayOf(today);
  const w = M.week(derived, leave, "Pragati", mon, ctx);
  close(x.wk[0][0], w.available, "available hrs Pragati");
  close(x.wk[1][0], w.allocated, "allocated hrs Pragati");
  assert.equal(x.kpi[0], 60);
  assert.equal(x.det[0][1], config.masterTags[0].name);
  assert.equal(x.det[1][0], "T-060");
  console.log("excel file:", file);
});
