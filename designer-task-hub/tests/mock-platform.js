// In-browser stand-in for platform.firebase.js used by tests/ui.smoke.js.
// Same interface; accounts and data live in localStorage so several "people"
// can take turns in one browser. No security rules here: those are covered by
// tests/rules.test.js against the Firestore emulator.
(function () {
  const L = window.localStorage;
  const load = (k, d) => JSON.parse(L.getItem(k) || JSON.stringify(d));
  const save = (k, v) => L.setItem(k, JSON.stringify(v));
  const listeners = new Set();
  const notify = () => listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
  let seq = 0;
  const snapDoc = (path, s) => ({ id: path.split("/").pop(), exists: path in s, data: () => (path in s ? JSON.parse(JSON.stringify(s[path])) : undefined), metadata: {} });
  const clean = (d) => JSON.parse(JSON.stringify(d));
  const docRef = (path) => ({
    id: path.split("/").pop(), path,
    get: async () => snapDoc(path, load("mockdb", {})),
    set: async (d) => { const s = load("mockdb", {}); s[path] = clean(d); save("mockdb", s); notify(); },
    update: async (d) => { const s = load("mockdb", {}); if (!(path in s)) throw { code: "invalid_argument" }; s[path] = { ...s[path], ...clean(d) }; save("mockdb", s); notify(); },
    delete: async () => { const s = load("mockdb", {}); delete s[path]; save("mockdb", s); notify(); },
    onSnapshot: (next) => { const f = () => next(snapDoc(path, load("mockdb", {}))); listeners.add(f); setTimeout(f, 5); return () => listeners.delete(f); },
  });
  const query = (cpath, filters) => {
    const run = () => {
      const s = load("mockdb", {});
      const docs = Object.keys(s).filter((k) => k.startsWith(cpath + "/") && k.split("/").length === cpath.split("/").length + 1)
        .filter((k) => filters.every(([f, , v]) => s[k][f] === v)).sort().map((k) => snapDoc(k, s));
      return { docs, size: docs.length, empty: !docs.length, metadata: {} };
    };
    return {
      where: (f, op, v) => query(cpath, filters.concat([[f, op, v]])),
      get: async () => run(),
      onSnapshot: (next) => { const f = () => next(run()); listeners.add(f); setTimeout(f, 5); return () => listeners.delete(f); },
    };
  };
  const colRef = (cpath) => ({
    path: cpath, ...query(cpath, []),
    doc: (id) => docRef(cpath + "/" + (id || "d" + Date.now().toString(36) + (seq++))),
    add: async (d) => { const r = docRef(cpath + "/d" + Date.now().toString(36) + (seq++)); await r.set(d); return r; },
  });

  // accounts: { email: {uid, password, displayName, verified} }; signed-in email in session (or local when kept)
  const users = () => load("mockauth", {});
  const cur = () => sessionStorage.getItem("mockcur") || L.getItem("mockcur");
  const userOf = (email) => { const u = email && users()[email]; return u ? { uid: u.uid, email, emailVerified: !!u.verified, displayName: u.displayName || "" } : null; };
  const authCbs = [];
  const fire = () => { const u = userOf(cur()); authCbs.forEach((cb) => cb(u)); };
  const err = (code) => Promise.reject({ code, message: code });
  window.__verifyEmail = (email) => { const all = users(); all[email].verified = true; save("mockauth", all); };
  window.__outbox = [];

  window.DTHPlatform = {
    kind: "mock",
    config: window.DTH_CONFIG,
    async init() {},
    auth: {
      onChange(cb) { authCbs.push(cb); setTimeout(() => cb(userOf(cur())), 5); return () => {}; },
      current() { return userOf(cur()); },
      async signIn(email, password, keep) {
        const u = users()[email];
        if (!u || u.password !== password) return err("auth/invalid-credential");
        sessionStorage.removeItem("mockcur"); L.removeItem("mockcur");
        (keep ? L : sessionStorage).setItem("mockcur", email); fire(); return userOf(email);
      },
      async signUp(email, password, name) {
        const all = users();
        if (all[email]) return err("auth/email-already-in-use");
        all[email] = { uid: "u_" + email.split("@")[0].replace(/[^a-z0-9]/g, ""), password, displayName: name, verified: false };
        save("mockauth", all); sessionStorage.setItem("mockcur", email); window.__outbox.push({ to: email, kind: "verify" }); fire(); return userOf(email);
      },
      async sendVerification() { window.__outbox.push({ to: cur(), kind: "verify" }); },
      async refresh() { return userOf(cur()); },
      async resetPassword(email) { window.__outbox.push({ to: email, kind: "reset" }); },
      async changePassword(current, next) { const all = users(); const e = cur(); if (all[e].password !== current) return err("auth/invalid-credential"); all[e].password = next; save("mockauth", all); },
      async updateName(name) { const all = users(); all[cur()].displayName = name; save("mockauth", all); return userOf(cur()); },
      async signOut() { sessionStorage.removeItem("mockcur"); L.removeItem("mockcur"); fire(); },
    },
    db: { doc: docRef, collection: colRef },
    async download(filename, blob) {
      const b = new Uint8Array(await blob.arrayBuffer());
      window.__saved = { filename, b64: btoa(Array.from(b, (c) => String.fromCharCode(c)).join("")) };
      return { status: "saved" };
    },
  };
})();
