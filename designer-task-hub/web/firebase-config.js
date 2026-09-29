// Design Task Hub: deployment settings. Fill these in once (see DEPLOY.md).
// The Firebase values are public identifiers, not secrets; access is enforced by
// firestore.rules on the server.
window.DTH_CONFIG = {
  firebase: {
    apiKey: "",            // Project settings > General > Your apps > Web app
    authDomain: "",        // e.g. design-task-hub.firebaseapp.com
    projectId: "",         // e.g. design-task-hub
    appId: "",
  },
  ownerEmail: "manu.nair@knolskape.com", // becomes the Owner on first sign-up
  allowedDomain: "knolskape.com",        // only these emails can have accounts
  // emulators: { auth: "http://127.0.0.1:9099", firestoreHost: "127.0.0.1", firestorePort: 8080 },
};
