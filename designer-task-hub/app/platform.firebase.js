/* Design Task Hub: platform adapter for the standalone deployment (Firebase).
 *
 * The app talks only to window.DTHPlatform:
 *   init()                       load config and SDKs
 *   auth.onChange(cb)            cb(user | null), user = {uid, email, emailVerified, displayName}
 *   auth.signIn(email, pw, keep) keep = stay signed in on this device
 *   auth.signUp(email, pw, name) creates the account and sends a verification email
 *   auth.sendVerification() / auth.refresh() / auth.resetPassword(email)
 *   auth.changePassword(current, next) / auth.signOut()
 *   db.doc(path) / db.collection(path)   same shape the app uses everywhere
 *   download(filename, blob)
 * Errors are rejected as {code, message}; Firestore permission errors map to
 * "invalid_argument" so the app shows its "no permission" message.
 */
(function () {
  "use strict";
  const CFG = window.DTH_CONFIG || {};
  let fb = null, auth = null, fs = null;

  const mapErr = (e) => {
    const code = String((e && e.code) || "unknown").replace(/^firestore\//, "");
    if (code === "permission-denied") return { code: "invalid_argument", message: e.message };
    if (code === "not-found") return { code: "invalid_argument", message: e.message };
    if (code === "resource-exhausted") return { code: "resource_exhausted", message: e.message };
    if (code === "unavailable" || code === "deadline-exceeded") return { code: "unavailable", message: e.message };
    return { code, message: (e && e.message) || String(e) };
  };
  const wrap = (p) => p.catch((e) => { throw mapErr(e); });
  const snap = (s) => ({ id: s.id, exists: s.exists, data: () => s.data(), metadata: s.metadata || {} });

  function docRef(path) {
    const r = fs.doc(path);
    return {
      id: r.id, path: r.path,
      get: () => wrap(r.get().then(snap)),
      set: (d) => wrap(r.set(d)),
      update: (d) => wrap(r.update(d)),
      delete: () => wrap(r.delete()),
      onSnapshot: (next, error) => r.onSnapshot((s) => next(snap(s)), (e) => error && error(mapErr(e))),
      collection: (p) => colRef(r.path + "/" + p),
    };
  }
  const qsnap = (q) => ({ docs: q.docs.map(snap), size: q.size, empty: q.empty, metadata: q.metadata || {} });
  function queryRef(q) {
    return {
      where: (f, op, v) => queryRef(q.where(f, op, v)),
      get: () => wrap(q.get().then(qsnap)),
      onSnapshot: (next, error) => q.onSnapshot((x) => next(qsnap(x)), (e) => error && error(mapErr(e))),
    };
  }
  function colRef(path) {
    const c = fs.collection(path);
    return {
      path,
      ...queryRef(c),
      doc: (id) => docRef(id ? path + "/" + id : c.doc().path),
      add: (d) => wrap(c.add(d).then((r) => docRef(r.path))),
    };
  }
  const userOf = (u) => (u ? { uid: u.uid, email: (u.email || "").toLowerCase(), emailVerified: !!u.emailVerified, displayName: u.displayName || "" } : null);
  // Links in verification and reset emails come back to this page
  const returnTo = () => ({ url: location.origin + location.pathname + location.hash });

  const platform = {
    kind: "firebase",
    config: CFG,
    async init() {
      if (!window.firebase || !CFG.firebase || !CFG.firebase.apiKey) throw { code: "not_configured", message: "Firebase is not configured. Fill in firebase-config.js." };
      fb = window.firebase;
      if (!fb.apps.length) fb.initializeApp(CFG.firebase);
      auth = fb.auth();
      fs = fb.firestore();
      fs.settings({ ignoreUndefinedProperties: true, merge: true });
      if (CFG.emulators) {
        auth.useEmulator(CFG.emulators.auth);
        fs.useEmulator(CFG.emulators.firestoreHost, CFG.emulators.firestorePort);
      }
    },
    auth: {
      onChange(cb) { return auth.onAuthStateChanged((u) => cb(userOf(u))); },
      current() { return userOf(auth.currentUser); },
      async signIn(email, password, keep) {
        await wrap(auth.setPersistence(keep ? fb.auth.Auth.Persistence.LOCAL : fb.auth.Auth.Persistence.SESSION));
        const r = await wrap(auth.signInWithEmailAndPassword(email, password));
        return userOf(r.user);
      },
      async signUp(email, password, name) {
        await wrap(auth.setPersistence(fb.auth.Auth.Persistence.SESSION));
        const r = await wrap(auth.createUserWithEmailAndPassword(email, password));
        if (name) await wrap(r.user.updateProfile({ displayName: name }));
        await wrap(r.user.sendEmailVerification(returnTo()));
        return userOf(auth.currentUser);
      },
      sendVerification() { return wrap(auth.currentUser.sendEmailVerification(returnTo())); },
      // Picks up a just-verified email and refreshes the token the rules read
      async refresh() {
        if (!auth.currentUser) return null;
        await wrap(auth.currentUser.reload());
        await wrap(auth.currentUser.getIdToken(true));
        return userOf(auth.currentUser);
      },
      resetPassword(email) { return wrap(auth.sendPasswordResetEmail(email, returnTo())); },
      async changePassword(current, next) {
        const u = auth.currentUser;
        const cred = fb.auth.EmailAuthProvider.credential(u.email, current);
        await wrap(u.reauthenticateWithCredential(cred));
        await wrap(u.updatePassword(next));
      },
      async updateName(name) { await wrap(auth.currentUser.updateProfile({ displayName: name })); return userOf(auth.currentUser); },
      signOut() { return wrap(auth.signOut()); },
    },
    db: { doc: (p) => docRef(p), collection: (p) => colRef(p) },
    async download(filename, blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.rel = "noopener";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      return { status: "saved" };
    },
  };
  window.DTHPlatform = platform;
})();
