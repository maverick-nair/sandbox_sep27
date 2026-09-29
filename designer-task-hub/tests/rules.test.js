// Security rules, checked against the Firestore emulator:
//   npm run test:rules     (starts the emulator and runs this file)
const test = require("node:test");
const fs = require("fs");
const path = require("path");
const { initializeTestEnvironment, assertSucceeds, assertFails } = require("@firebase/rules-unit-testing");

const RULES = fs.readFileSync(path.join(__dirname, "../firebase/firestore.rules"), "utf8");
let env;
const OWNER = { uid: "owner", email: "manu.nair@knolskape.com" };
const DES = { uid: "des1", email: "pragati@knolskape.com" };
const DES2 = { uid: "des2", email: "swathi@knolskape.com" };
const PM = { uid: "pm1", email: "raghav@knolskape.com" };
const OUT = { uid: "out", email: "someone@gmail.com" };
const as = (u, verified = true) => env.authenticatedContext(u.uid, { email: u.email, email_verified: verified }).firestore();

test.before(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-dth", firestore: { rules: RULES, host: "127.0.0.1", port: 8080 } });
});
test.after(async () => { await env.cleanup(); });
test.beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.doc("members/owner").set({ role: "owner", name: "", email: OWNER.email });
    await db.doc("members/pm1").set({ role: "pm", name: "Raghav", email: PM.email });
    await db.doc("members/des2").set({ role: "designer", name: "Swathi", email: DES2.email });
    await db.doc("config/main").set({ designers: ["Pragati", "Swathi"] });
    await db.doc("tasks/t1").set({ designer: "Pragati", assignedBy: "Raghav", title: "a" });
    await db.doc("tasks/t2").set({ designer: "Swathi", assignedBy: "SL", title: "b" });
  });
});

test("owner bootstraps only from the configured email", async () => {
  await env.withSecurityRulesDisabled((ctx) => ctx.firestore().doc("members/owner").delete());
  await assertFails(as(DES).doc("members/des1").set({ role: "owner", name: "", email: DES.email }));
  await assertSucceeds(as(OWNER).doc("members/owner").set({ role: "owner", name: "", email: OWNER.email }));
});

test("joining needs a matching invitation, a verified company email", async () => {
  await assertFails(as(DES).doc("members/des1").set({ role: "designer", name: "Pragati", email: DES.email }));
  await assertSucceeds(as(OWNER).doc(`invites/${DES.email}`).set({ role: "designer", name: "Pragati", email: DES.email }));
  await assertFails(as(OWNER).doc(`invites/${OUT.email}`).set({ role: "designer", name: "X", email: OUT.email }));
  await assertFails(as(OWNER).doc(`invites/${DES.email}`).set({ role: "owner", name: "Pragati", email: DES.email }));
  await assertFails(as(DES, false).doc("members/des1").set({ role: "designer", name: "Pragati", email: DES.email }));
  await assertFails(as(DES).doc("members/des1").set({ role: "pm", name: "Pragati", email: DES.email }));
  await assertSucceeds(as(DES).doc("members/des1").set({ role: "designer", name: "Pragati", email: DES.email }));
  await assertSucceeds(as(DES).doc(`invites/${DES.email}`).delete());
});

test("unverified and outside accounts see nothing", async () => {
  await assertFails(as(DES, false).doc("config/main").get());
  await assertFails(as(OUT).doc("config/main").get());
  await assertFails(as(OUT).collection("members").get());
  await assertSucceeds(as(DES).doc("config/main").get());
});

test("members cannot change their own role; only the owner manages people", async () => {
  await assertFails(as(DES2).doc("members/des2").update({ role: "owner" }));
  await assertSucceeds(as(DES2).doc("members/des2").update({ displayName: "Swathi R" }));
  await assertFails(as(PM).doc("members/des2").delete());
  await assertSucceeds(as(OWNER).doc("members/des2").update({ role: "pm", name: "SL" }));
  await assertFails(as(OWNER).doc("members/pm1").update({ role: "owner" }));
  await assertFails(as(OWNER).doc("members/owner").delete());
});

test("tasks: only the owner writes; designers and PMs read only their slice", async () => {
  await assertFails(as(DES2).doc("tasks/t3").set({ designer: "Swathi" }));
  await assertFails(as(PM).doc("tasks/t1").update({ designer: "Swathi" }));
  await assertSucceeds(as(OWNER).doc("tasks/t3").set({ designer: "Swathi", assignedBy: "Raghav" }));
  await assertSucceeds(as(DES2).doc("tasks/t2").get());
  await assertFails(as(DES2).doc("tasks/t1").get());
  await assertFails(as(DES2).collection("tasks").get());
  await assertSucceeds(as(DES2).collection("tasks").where("designer", "==", "Swathi").get());
  await assertSucceeds(as(PM).collection("tasks").where("assignedBy", "==", "Raghav").get());
  await assertFails(as(PM).collection("tasks").where("assignedBy", "==", "SL").get());
  await assertSucceeds(as(OWNER).collection("tasks").get());
});

test("requests: a PM files and edits their own, cannot approve, cannot read others", async () => {
  const pm = as(PM);
  await assertSucceeds(pm.doc("requests/pm1/items/r1").set({ status: "pending", masterTitle: "x" }));
  await assertFails(pm.doc("requests/pm1/items/r1").update({ status: "approved" }));
  await assertFails(pm.doc("requests/pm2/items/r9").set({ status: "pending" }));
  await assertFails(as(DES2).doc("requests/des2/items/r1").set({ status: "pending" }));
  await assertSucceeds(as(OWNER).doc("requests/pm1/items/r1").update({ status: "approved" }));
  await assertFails(pm.doc("requests/pm1/items/r1").update({ status: "pending" }));
  await assertFails(pm.doc("requests/pm1/items/r1").delete());
  await assertFails(as(DES2).doc("requests/pm1/items/r1").get());
  await assertSucceeds(as(OWNER).doc("requests/pm1/items/r1").get());
});

test("progress and leave: designers write only their own", async () => {
  await assertSucceeds(as(DES2).doc("progress/des2/tasks/t2").set({ taskId: "t2", status: "In Progress" }));
  await assertFails(as(DES2).doc("progress/des2/tasks/t1").set({ taskId: "t1", status: "Done" }));
  await assertFails(as(DES2).doc("progress/pm1/tasks/t2").set({ taskId: "t2" }));
  await assertFails(as(PM).doc("progress/pm1/tasks/t1").set({ taskId: "t1" }));
  await assertSucceeds(as(DES2).doc("leave/des2/items/l1").set({ designer: "Swathi", from: "2026-10-01", to: "2026-10-02" }));
  await assertFails(as(DES2).doc("leave/des2/items/l2").set({ designer: "Pragati", from: "2026-10-01", to: "2026-10-02" }));
  await assertFails(as(DES2).doc("leave/pm1/items/l3").set({ designer: "Swathi" }));
});

test("owner-only data: lists, access history, access requests", async () => {
  await assertFails(as(PM).doc("config/main").set({ designers: [] }));
  await assertSucceeds(as(OWNER).doc("config/main").set({ designers: ["Pragati"] }));
  await assertFails(as(PM).doc("audit/log").get());
  await assertSucceeds(as(OWNER).doc("audit/log").set({ entries: [] }));
  await assertSucceeds(as(DES).doc("claims/des1").set({ role: "designer", name: "Pragati", email: DES.email }));
  await assertFails(as(DES).doc("claims/des1").set({ role: "owner", name: "Pragati", email: DES.email }));
  await assertFails(as(DES2).doc("claims/des2").set({ role: "pm", name: "x", email: DES2.email }));
  await assertFails(as(PM).doc("claims/des1").get());
  await assertSucceeds(as(OWNER).collection("claims").get());
  await assertFails(as(PM).doc("sessions/des2").get());
  await assertSucceeds(as(PM).doc("sessions/pm1").set({ lastSignIn: "x" }));
});
