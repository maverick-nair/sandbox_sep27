// Assembles dist/index.html: app/index.src.html with metrics.js, export.js, app.js
// and the workbook template (base64) inlined, ready to publish as one page.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
let html = read("app/index.src.html");
const tpl = fs.readFileSync(path.join(root, "workbook/template.xlsx")).toString("base64");
html = html.replace("/*__METRICS__*/", () => read("app/metrics.js"))
  .replace("/*__EXPORT__*/", () => read("app/export.js"))
  .replace("/*__TEMPLATE__*/", () => tpl)
  .replace("/*__APP__*/", () => read("app/app.js"))
  .replaceAll("/*__LOGO_DARK__*/", () => fs.readFileSync(path.join(root, "app/assets/ks_logo.png")).toString("base64"))
  .replaceAll("/*__LOGO_WHITE__*/", () => fs.readFileSync(path.join(root, "app/assets/ks_logo_white.png")).toString("base64"));
fs.mkdirSync(path.join(root, "dist"), { recursive: true });
fs.writeFileSync(path.join(root, "dist/index.html"), html);
console.log(`dist/index.html ${(html.length / 1024).toFixed(0)} KB`);
