// Builds dist-web/demo.html: the app with an in-browser stand-in for Firebase
// (tests/mock-platform.js) and sample data, for previewing the design without
// a backend. Usage: node tools/build_demo.js <seed.json from tests/ui.smoke.js>
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const seedPath = process.argv[2];
if (!seedPath) throw new Error("usage: node tools/build_demo.js <seed.json>");
const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
const PW = "Demo#2026";
for (const u of Object.values(seed.auth)) u.password = PW;
const accounts = [["Owner", "manu.nair@knolskape.com"], ["Product manager", "raghav@knolskape.com"], ["Designer", "pragati@knolskape.com"]]
  .map(([label, email]) => ({ label, email, password: PW }));
const config = { firebase: {}, ownerEmail: "manu.nair@knolskape.com", allowedDomain: "knolskape.com", demoAccounts: accounts };
const mock = fs.readFileSync(path.join(root, "tests/mock-platform.js"), "utf8");
const demo = `<script>
window.DTH_CONFIG = ${JSON.stringify(config)};
(function () {
  // Sample data on first open; new sign-ups are treated as verified
  try { if (!localStorage.getItem("mockdb")) { localStorage.setItem("mockdb", ${JSON.stringify(JSON.stringify(seed.db))}); localStorage.setItem("mockauth", ${JSON.stringify(JSON.stringify(seed.auth))}); } } catch (e) {}
})();
${mock}
(function () {
  const P = window.DTHPlatform, signUp = P.auth.signUp;
  P.auth.signUp = async (email, pw, name) => { const u = await signUp(email, pw, name); window.__verifyEmail(email); return { ...u, emailVerified: true }; };
  // Inside the claude.ai artifact viewer the save goes through its downloads capability; elsewhere a plain download link
  P.download = async (filename, blob) => {
    const dl = window.claude && window.claude.use ? await window.claude.use("downloads") : null;
    if (dl) return dl.save({ filename, data: blob });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); return { status: "saved" };
  };
})();
</script>
`;
let html = fs.readFileSync(path.join(root, "dist-web/index.html"), "utf8");
html = html.replace(/<script src="https:\/\/www\.gstatic\.com[^"]+"><\/script>\n/g, "").replace('<script src="firebase-config.js"></script>\n<script src="platform.js"></script>\n', demo);
if (!html.includes("DTH_CONFIG")) throw new Error("platform scripts not found in dist-web/index.html");
fs.writeFileSync(path.join(root, "dist-web/demo.html"), html);
// Same page as a fragment for publishing as a claude.ai artifact (the viewer adds the document skeleton)
const frag = html.replace(/^<!doctype html>\s*<html lang="en">\s*<head>\s*/, "").replace(/<meta[^>]*>\s*/g, "").replace("</head>\n<body>\n", "").replace("</body>\n</html>\n", "");
fs.writeFileSync(path.join(root, "dist-web/artifact.html"), frag);
console.log(`dist-web/demo.html ${(html.length / 1024).toFixed(0)} KB`);
