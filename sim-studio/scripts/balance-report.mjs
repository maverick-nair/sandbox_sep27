// Prints a balance check for the iLead template from the command line: `npm run balance`.
import { createIleadDefinition } from '../src/templates/ilead/index.js';
import { runBalance, pct } from '../src/engine/balance.js';

const def = createIleadDefinition();
const t0 = Date.now();
const res = runBalance(def, { runs: Number(process.argv[2] || 20) });
for (const b of Object.values(res.bots)) {
  console.log(`${b.name.padEnd(18)} p10 ${pct(b.p10).padStart(5)}  p50 ${pct(b.p50).padStart(5)}  p90 ${pct(b.p90).padStart(5)}  conv ${b.conversions.toFixed(1).padStart(5)}  acc ${pct(b.accuracy).padStart(4)}  leavers ${b.leavers.toFixed(1)}`);
}
console.log(res.status, res.findings.map((f) => f.text).join(' | '));
console.log('suggested target', res.suggestedTarget, 'in', Date.now() - t0, 'ms');
