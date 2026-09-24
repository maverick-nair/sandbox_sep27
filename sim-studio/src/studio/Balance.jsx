import { useState } from 'react';
import { runBalanceAsync, pct } from '../engine/balance.js';
import { Button, Callout, Drawer, Seg } from './ui.jsx';

const BOT_COLORS = { expert: 'var(--good)', oneStyle: 'var(--style-directing)', random: 'var(--warn)', passive: 'var(--muted)' };

export default function Balance({ sim, def, store, update, onClose, notify }) {
  const [runs, setRuns] = useState(20);
  const [progress, setProgress] = useState(null);
  const result = sim.balance;
  const stale = result && result.at < sim.updatedAt;

  const run = async () => {
    setProgress(0);
    const summary = await runBalanceAsync(def, { runs }, setProgress);
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

  const axisMax = result ? Math.max(2, ...Object.values(result.bots).map((b) => b.p90 * 1.05)) : 2;
  const X = (v) => `${(Math.min(v, axisMax) / axisMax) * 100}%`;
  const ticks = [0, 0.5, 1, 1.5, 2, 2.5, 3].filter((t) => t <= axisMax);

  return (
    <Drawer title="Balance check" subtitle="Bots play the simulation many times so you can see who reaches the target" onClose={onClose} wide>
      <div className="stack" style={{ '--gap': '18px' }}>
        <div className="row spread">
          <div className="row">
            <span className="small ink2">Runs per bot</span>
            <Seg value={runs} onChange={setRuns} options={[{ value: 10, label: '10' }, { value: 20, label: '20' }, { value: 40, label: '40' }]} label="Runs per bot" />
          </div>
          <Button variant="primary" onClick={run} disabled={progress !== null} tip="Plays every bot the chosen number of times with this exact setup. Takes a few seconds." tipAlign="end">{progress !== null ? `Playing… ${Math.round(progress * 100)}%` : result ? 'Run again' : 'Run balance check'}</Button>
        </div>
        {progress !== null && <div className="bar"><span style={{ width: `${progress * 100}%` }} /></div>}
        {stale && <Callout tone="warn" icon="!">The simulation changed after this check. Run it again for current results.</Callout>}

        {!result && progress === null && (
          <div className="empty stack" style={{ '--gap': '6px' }}>
            <strong>Not run yet</strong>
            <span>Four bot leaders each play {runs} full runs with this exact configuration. It takes a few seconds.</span>
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

            <div className="card stack" style={{ '--gap': '14px' }}>
              <div className="row spread">
                <h3>Share of target reached</h3>
                <span className="small muted">Bar: middle 80% of runs · dot: typical run · line: target</span>
              </div>
              <div style={{ position: 'relative', paddingLeft: 0 }}>
                <div className="stack" style={{ '--gap': '16px' }}>
                  {Object.values(result.bots).map((b) => (
                    <div key={b.id} className="grid" style={{ gridTemplateColumns: 'minmax(120px, 170px) 1fr minmax(64px, auto)', gap: 12, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 650 }}>{b.name}</div>
                        <div className="small muted num">right style {pct(b.accuracy)}</div>
                      </div>
                      <div style={{ position: 'relative', height: 22 }}>
                        <div style={{ position: 'absolute', inset: '10px 0 auto 0', height: 2, background: 'var(--surface-3)' }} />
                        <div style={{ position: 'absolute', left: X(b.p10), width: `calc(${X(b.p90)} - ${X(b.p10)})`, top: 5, height: 12, borderRadius: 6, background: BOT_COLORS[b.id], opacity: 0.3, minWidth: 4 }} />
                        <div style={{ position: 'absolute', left: `calc(${X(b.p50)} - 6px)`, top: 5, width: 12, height: 12, borderRadius: '50%', background: BOT_COLORS[b.id], border: '2px solid var(--surface)' }} title={`Typical run ${pct(b.p50)}`} />
                        <div style={{ position: 'absolute', left: X(1), top: -6, bottom: -6, width: 2, background: 'var(--ink)', opacity: 0.55 }} />
                      </div>
                      <div className="num" style={{ fontWeight: 650, textAlign: 'right' }}>{pct(b.p50)}</div>
                    </div>
                  ))}
                </div>
                <div className="grid" style={{ gridTemplateColumns: 'minmax(120px, 170px) 1fr minmax(64px, auto)', gap: 12, marginTop: 8 }}>
                  <span />
                  <div style={{ position: 'relative', height: 16 }}>
                    {ticks.map((t) => (
                      <span key={t} className="small muted num" style={{ position: 'absolute', left: X(t), transform: t === 0 ? 'none' : 'translateX(-50%)', fontWeight: t === 1 ? 700 : 400, color: t === 1 ? 'var(--ink)' : undefined }}>{t === 1 ? 'target' : pct(t)}</span>
                    ))}
                  </div>
                  <span />
                </div>
              </div>
            </div>

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
