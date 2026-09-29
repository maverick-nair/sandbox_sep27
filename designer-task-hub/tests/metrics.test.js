const test = require("node:test");
const assert = require("node:assert");
const M = require("../app/metrics.js");

const names = ["GenieTracker Revamp", "Nano AI Launch", "Project 1 (rename)", "Project 2 (rename)", "AI Koach v2"];

test("project names: exact matches ignore case, spacing, punctuation and order", () => {
  assert.equal(M.matchNames("genie tracker revamp", names).exact, "GenieTracker Revamp");
  assert.equal(M.matchNames("Launch - Nano AI", names).exact, "Nano AI Launch");
  assert.equal(M.matchNames("  NANO-AI launch ", names).exact, "Nano AI Launch");
});

test("project names: close names are suggested", () => {
  assert.deepEqual(M.matchNames("Genie Traker Revamp", names).similar.slice(0, 1), ["GenieTracker Revamp"]);
  assert.ok(M.matchNames("Nano AI", names).similar.includes("Nano AI Launch"));
  assert.ok(M.matchNames("AI Coach v2", names).similar.includes("AI Koach v2"));
  assert.ok(M.matchNames("project 1", names).similar.includes("Project 1 (rename)"));
});

test("project names: different numbers and unrelated names stay new", () => {
  assert.ok(!M.matchNames("project 1", names).similar.includes("Project 2 (rename)"));
  const r = M.matchNames("Coach nudges pilot", names);
  assert.equal(r.exact, null);
  assert.deepEqual(r.similar, []);
  assert.deepEqual(M.matchNames("", names), { exact: null, similar: [] });
});
