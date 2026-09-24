import { useState } from 'react';
import { runBalanceAsync, pct } from '../engine/balance.js';
import { Button, Callout, Drawer, Seg } from './ui.jsx';
import { LineChart, DotStrip, Histogram, BarList, SERIES } from './charts.jsx';
import { renderText } from '../engine/text.js';
import { textVars } from '../engine/decisions.js';

// Series colours follow the bot, never its rank.
const BOT_COLORS = { expert: SERIES[0], oneStyle: SERIES[1], random: SERIES[2], passive: SERIES[3] };

export default function Balance({ sim, def, store, update, onClose, notify }) {
  const [runs, setRuns] = useState(20);
  const [learners, setLearners] = useState(60);
  const [progress, setProgress] = useState(null);
  const result = sim.balance;
  const stale = result && result.at < sim.updatedAt;

  const run = async () => {
    setProgress(0);
    const summary = await runBalanceAsync(def, { runs, learners: learners }, setProgress);
    store.patchRecord(sim.id, { balance: { ...summary, at: Date.now() + 1, target: def.funnel.target } });
    setProgress(null);
    notify('Balance check finished');
  };

  const applyFix = (fix) => {
    update((d) => {
      if (fix.kind === 'target') { d.funnel.target = fix.value; d.meta.baseTarget = undefined; }
      if (fix.kind === 'mismatch') { d.randomness.mismatchChance = fix.value; d.meta.difficulty = 'custom'; }
    });
    notify('Change applied. Run the check again to confirm.');
  };


  return (
    <Drawer title="Balance check" subtitle="Bots play the simulation many times so you can see who reaches the target" onClose={onClose} wide>
      <div className="stack" style={{ '--gap': '18px' }}>
        <div className="row spread">
          <div className="row">
            <span className="small ink2">Runs per bot</span>
            <Seg value={runs} onChange={setRuns} options={[{ value: 10, label: '10' }, { value: 20, label: '20' }, { value: 40, label: '40' }]} label="Runs per bot" />
            <span className="small ink2">Practice learners</span>
            <Seg value={learners} onChange={setLearners} options={[{ value: 30, label: '30' }, { value: 60, label: '60' }, { value: 120, label: '120' }]} label="Practice learners" />
          </div>
          <Button variant="primary" onClick={run} disabled={progress !== null} tip="Plays every bot the chosen number of times with this exact setup. Takes a few seconds." tipAlign="end">{progress !== null ? `Playing… ${Math.round(progress * 100)}%` : result ? 'Run again' : 'Run balance check'}</Button>
        </div>
        {progress !== null && <div className="bar"><span style={{ width: `${progress * 100}%` }} /></div>}
        {stale && <Callout tone="warn" icon="!">The simulation changed after this check. Run it again for current results.</Callout>}

        {!result && progress === null && (
          <div className="empty stack" style={{ '--gap': '6px' }}>
            <strong>Not run yet</strong>
            <span>Four bot leaders each play {runs} full runs, then {learners} practice learners with a realistic spread of skill play it too, answering every decision moment. It takes a few seconds.</span>
          </div>
        )}

        {result && (
          <>
            <div className="stack" style={{ '--gap': '8px' }}>
              {result.findings.map((f, i) => (
                <Callout key={i} tone={f.tone === 'good' ? 'good' : f.tone === 'bad' ? 'bad' : 'warn'} icon={f.tone === 'good' ? '✓' : '!'}>
                  <div className="row spread">
                    <span>{f.text}</span>
                    {f.fix && <Button size="sm" variant="primary" onClick={() => applyFix(f.fix)} tip="Applies the change. Run the check again to confirm the effect." tipAlign="end">{f.fix.label}</Button>}
                  </div>
                </Callout>
              ))}
            </div>

            <BalanceCharts def={def} result={result} />

            <div className="card scroll-x" style={{ padding: 4 }}>
              <table className="table">
                <thead><tr><th>Bot</th><th>Typical</th><th>Range</th><th>Hit target</th><th>Conversions</th><th>People who quit</th></tr></thead>
                <tbody>
                  {Object.values(result.bots).map((b) => (
                    <tr key={b.id}>
                      <td><div style={{ fontWeight: 600 }}>{b.name}</div><div className="small muted" style={{ maxWidth: 340 }}>{b.description}</div></td>
                      <td className="num">{pct(b.p50)}</td>
                      <td className="num">{pct(b.p10)} to {pct(b.p90)}</td>
                      <td className="num">{pct(b.hitRate)}</td>
                      <td className="num">{b.conversions.toFixed(1)}</td>
                      <td className="num">{b.leavers.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="small muted">Checked against a target of {result.target} conversions, {result.bots.expert?.runs} runs per bot, fixed seeds so the same configuration gives the same result. The adaptive leader sees each person's true skill and morale; learners must infer them from profiles, responses and the Assess action, so expect real learners to land between the adaptive and guessing bots.</p>
          </>
        )}
      </div>
    </Drawer>
  );
}

function BalanceCharts({ def, result }) {
  const bots = Object.values(result.bots);
  const syn = result.synthetic;
  const weeks = Math.max(0, ...bots.map((b) => b.trajectory?.length || 0), syn?.trajectory?.length || 0);
  const target = result.target || def.funnel.target;
  const pass = def.delivery?.passScore ?? 65;
  const axis = Math.max(150, Math.ceil(Math.max(...bots.flatMap((b) => b.samples)) * 100 / 50) * 50);
  const points = def.decisions?.points || [];
  const decisionRows = syn ? Object.entries(syn.decisions).map(([id, x]) => {
    const p = points.find((q) => q.id === id);
    return { id, label: p ? renderText(def, p.title, textVars(def, null, p)) : id, value: x.avg, note: `${x.n} of ${syn.n} practice learners met it. ${x.bands[0]} strong, ${x.bands[1]} mixed, ${x.bands[2]} weak.`, week: p?.week ?? 0 };
  }).sort((a, b) => a.value - b.value) : [];
  const synFindings = [];
  if (syn) {
    if (syn.passRate > 0.85) synFindings.push({ tone: 'warn', text: `${Math.round(syn.passRate * 100)}% of practice learners pass. The pass mark of ${pass} may not separate strong from weak leadership; consider raising it or the target.` });
    else if (syn.passRate < 0.3) synFindings.push({ tone: 'warn', text: `Only ${Math.round(syn.passRate * 100)}% of practice learners pass. Consider a lower pass mark or a gentler target so typical learners have something to aim for.` });
    else synFindings.push({ tone: 'good', text: `${Math.round(syn.passRate * 100)}% of practice learners pass, and scores spread from ${Math.round(syn.p10)} to ${Math.round(syn.p90)} (middle 80%). The scoring separates stronger and weaker leadership.` });
    const hard = decisionRows.filter((r) => r.value < 40);
    if (hard.length) synFindings.push({ tone: 'warn', text: `${hard.map((r) => `"${r.label}"`).join(', ')} ${hard.length === 1 ? 'averages' : 'average'} below 40. Check the options or criteria are fair, or add a hint.` });
  }
  const binIndex = (v) => Math.min(9, Math.floor(v / 10));
  const bins = Array.from({ length: 10 }, (_, i) => ({ label: `${i * 10}${i === 9 ? '+' : ''}`, value: syn ? syn.scores.filter((v) => binIndex(v) === i).length : 0 }));
  return (
    <>
      {weeks > 0 && (
        <div className="card stack">
          <h3>Conversions week by week</h3>
          <p className="small muted">The typical run of each bot{syn ? ' and of the practice learners' : ''}, against the target.</p>
          <LineChart title="Cumulative conversions by week" xLabels={Array.from({ length: weeks }, (_, i) => `W${i + 1}`)} series={[...bots.filter((b) => b.trajectory?.length).map((b) => ({ label: b.name.replace(/ leader$/, ''), color: BOT_COLORS[b.id], values: b.trajectory }))]} reference={{ label: 'Target', value: target }} />
        </div>
      )}
      <div className="card stack">
        <h3>Every run, as a share of the target</h3>
        <p className="small muted">One dot per run. The dashed line is the target: a skilled leader should clear it, guessing should not.</p>
        <DotStrip title="Share of target reached per run" max={axis} markers={[{ label: 'Target', value: 100 }]} rows={bots.map((b) => ({ label: b.name, color: BOT_COLORS[b.id], points: b.samples.map((v) => ({ value: v * 100, label: `${Math.round(v * 100)}% of target` })) }))} />
      </div>
      {syn && (
        <>
          <div className="stack" style={{ '--gap': '8px' }}>
            {synFindings.map((f, i) => <Callout key={i} tone={f.tone} icon={f.tone === 'good' ? '✓' : '!'}>{f.text}</Callout>)}
          </div>
          <div className="card stack">
            <div className="row spread"><h3>Practice learners' overall scores</h3><span className="small muted">{syn.n} learners · median {Math.round(syn.median)} · {Math.round(syn.hitRate * 100)}% reach the target</span></div>
            <p className="small muted">What a cohort would likely score. Learners see this spread as the benchmark in their debrief.</p>
            <Histogram title="Practice learners by overall score" bins={bins} valueLabel="learners" marker={pass / 10 - 0.5} markerLabel={`Pass ${pass}`} />
          </div>
          <div className="card stack">
            <h3>How hard each decision moment is</h3>
            <p className="small muted">Average score of the practice learners, hardest first. Hover for how answers landed.</p>
            <BarList title="Average score per decision moment" rows={decisionRows} />
          </div>
        </>
      )}
    </>
  );
}
