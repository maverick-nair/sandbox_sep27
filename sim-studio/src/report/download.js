// Saves a report as one standalone HTML file: the report's markup, its stylesheet and the app's
// light-theme tokens, so it opens anywhere and prints cleanly (File, Print, Save as PDF).
import css from './report.css?raw';
import { downloadText } from '../studio/store.js';

const TOKENS = `:root{--bg:#f3f4f7;--surface:#fff;--surface-2:#eceef3;--surface-3:#e3e6ee;--ink:#161b26;--ink-2:#454c5e;--muted:#646c80;--line:#d9dde6;--line-strong:#c3c9d6;--accent:#3144c9;--good:#11784a;--warn:#9a6408;--bad:#b8322a;--style-directing:#cf5530;--style-guiding:#b98a00;--style-partnering:#1d8469;--style-entrusting:#3b5fd6;--series-1:#2a78d6;--series-2:#eb6834;--series-3:#1baf7a;--series-4:#eda100;--font-display:'Bricolage Grotesque','Segoe UI',system-ui,sans-serif;--font-body:'Public Sans','Segoe UI',system-ui,-apple-system,sans-serif}
*{box-sizing:border-box}body{margin:0;background:var(--bg);padding:24px 16px}@media print{body{background:#fff;padding:0}}`;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function reportDocument(node, title) {
  const html = node?.outerHTML || '';
  return `<!doctype html>
<html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;650;700&family=Public+Sans:wght@400;600;700&display=swap" rel="stylesheet">
<style>${TOKENS}
${css}</style></head><body>${html}</body></html>`;
}

export const fileSlug = (s) => String(s || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'report';

export async function downloadReport(node, title, filename) {
  return downloadText(filename.endsWith('.html') ? filename : `${filename}.html`, reportDocument(node, title), 'text/html');
}
