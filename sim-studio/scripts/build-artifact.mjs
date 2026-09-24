// Packs the Vite build into one self-contained HTML file (inline CSS and JS) for sharing
// as a hosted page. Run with `npm run build:artifact`; output: dist/sim-studio.html
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const dist = new URL('../dist/', import.meta.url).pathname;
const assets = readdirSync(join(dist, 'assets'));
const js = assets.filter((f) => f.endsWith('.js'));
const css = assets.filter((f) => f.endsWith('.css'));
if (js.length !== 1) throw new Error(`Expected one JS chunk, found ${js.length}`);
const script = readFileSync(join(dist, 'assets', js[0]), 'utf8').replace(/<\/script/gi, '<\\/script');
const style = css.map((f) => readFileSync(join(dist, 'assets', f), 'utf8')).join('\n');
const html = `<title>GenieKreator Sim Studio</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,650;12..96,700&family=JetBrains+Mono:wght@400;500&family=Public+Sans:wght@400;500;600;700&display=swap">
<style>${style}</style>
<div id="root"></div>
<script type="module">${script}</script>
`;
writeFileSync(join(dist, 'sim-studio.html'), html);
console.log('wrote dist/sim-studio.html', (html.length / 1024).toFixed(0), 'KB');
