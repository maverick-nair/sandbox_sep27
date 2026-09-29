// Builds the standalone site into dist-web/ and the Firestore rules:
//   dist-web/index.html        the app (all three interfaces)
//   dist-web/platform.js       Firebase adapter
//   dist-web/firebase-config.js  copied from web/firebase-config.js
//   firebase/firestore.rules   from firestore.rules.template with the owner email and domain
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const b64 = (p) => fs.readFileSync(path.join(root, p)).toString("base64");

const sandbox = { window: {} };
vm.runInNewContext(read("web/firebase-config.js"), sandbox);
const cfg = sandbox.window.DTH_CONFIG || {};
if (!cfg.ownerEmail || !cfg.allowedDomain) throw new Error("web/firebase-config.js needs ownerEmail and allowedDomain");

const FB = "10.14.1";
let src = read("app/index.src.html")
  .replace("/*__METRICS__*/", () => read("app/metrics.js"))
  .replace("/*__EXPORT__*/", () => read("app/export.js"))
  .replace("/*__TEMPLATE__*/", () => b64("workbook/template.xlsx"))
  .replace("/*__APP__*/", () => read("app/app.js"))
  .replaceAll("/*__LOGO_DARK__*/", () => b64("app/assets/ks_logo.png"))
  .replaceAll("/*__LOGO_WHITE__*/", () => b64("app/assets/ks_logo_white.png"));
const platformScripts = ["app", "auth", "firestore"].map((m) => `<script src="https://www.gstatic.com/firebasejs/${FB}/firebase-${m}-compat.js"></script>`).join("\n")
  + '\n<script src="firebase-config.js"></script>\n<script src="platform.js"></script>\n';
src = src.replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>', (m) => platformScripts + m);
const split = src.indexOf("</style>") + "</style>".length;
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta name="theme-color" content="#111827">
${src.slice(0, split)}
</head>
<body>
${src.slice(split)}
</body>
</html>
`;
const out = path.join(root, "dist-web");
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, "index.html"), html);
fs.copyFileSync(path.join(root, "app/platform.firebase.js"), path.join(out, "platform.js"));
fs.copyFileSync(path.join(root, "web/firebase-config.js"), path.join(out, "firebase-config.js"));
const esc = (x) => String(x).toLowerCase().replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const domainRe = String(cfg.allowedDomain).toLowerCase().replace(/[.]/g, "[.]");
const rules = read("firebase/firestore.rules.template").replaceAll("__OWNER_EMAIL__", esc(cfg.ownerEmail)).replaceAll("__DOMAIN_RE__", domainRe);
fs.writeFileSync(path.join(root, "firebase/firestore.rules"), rules);
console.log(`dist-web/index.html ${(html.length / 1024).toFixed(0)} KB, rules for ${cfg.ownerEmail} @${cfg.allowedDomain}`);
