import { CURRENCIES } from '../../templates/ilead/world.js';
import { NumberInput, SectionHead, TokenArea, Button, Callout, Switch, Field } from '../ui.jsx';

// What the team converts if nobody improves: a quick, deterministic read of the starting position.
export function baselineConversions(def) {
  const team = def.actors.filter((a) => a.pool === 'team');
  const effs = def.stages.map((st) => {
    const ps = team.filter((a) => a.startStage === st.id).map((a) => a.stats[st.id].p);
    const avg = ps.length ? ps.reduce((a, b) => a + b, 0) / ps.length : 0;
    const e = (avg + def.funnel.buffer) / 100;
    return def.funnel.capEfficiency ? Math.min(1, e) : e;
  });
  const rate = def.stages.reduce((r, st, i) => r * st.conversion * effs[i], 1);
  const leads = def.funnel.weeklyInflow.reduce((a, b) => a + b, 0);
  return { conversions: leads * rate, effs, leads, rate };
}

export default function Funnel({ def, update, advanced, sim, openPanel }) {
  const base = baselineConversions(def);
  const money = new Intl.NumberFormat('en', { style: 'currency', currency: def.funnel.currency, maximumFractionDigits: 0 });
  const team = def.actors.filter((a) => a.pool === 'team');
  let cumulative = 1;
  const suggested = sim.balance && sim.balance.at >= sim.updatedAt ? sim.balance.suggestedTarget : null;

  return (
    <div className="stack" style={{ '--gap': '22px' }}>
      <SectionHead eyebrow="Build" title="Funnel and target">
        Work moves through the stages in order. Each stage passes on a share of what it receives, scaled by how well its people perform, so one weak stage caps the whole team.
      </SectionHead>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', alignItems: 'start', gap: 20 }}>
        <div className="card stack" aria-label="Funnel">
          <div className="row spread"><h3>Stages</h3><span className="small muted">Pass-on rate · people · starting efficiency</span></div>
          {def.stages.map((st, i) => {
            cumulative *= st.conversion;
            const people = team.filter((a) => a.startStage === st.id);
            const width = Math.max(28, 100 - i * 14);
            return (
              <div key={st.id} className="stack" style={{ '--gap': '6px', paddingTop: 10, borderTop: i ? '1px solid var(--line)' : 0 }}>
                <div className="row nowrap">
                  <div style={{ width: `${width}%`, background: 'color-mix(in srgb, var(--accent) 12%, var(--surface))', borderRadius: 8, padding: '6px 10px' }} className="row spread nowrap">
                    <input className="input" style={{ background: 'transparent', border: 0, padding: 0, fontWeight: 650, boxShadow: 'none' }} aria-label={`Stage ${i + 1} name`} value={st.name} onChange={(e) => update((d) => { d.stages[i].name = e.target.value; })} />
                    <span className="num small ink2" style={{ whiteSpace: 'nowrap' }}>{Math.round(st.conversion * 100)}%</span>
                  </div>
                  <span className="small muted num" style={{ whiteSpace: 'nowrap' }}>{people.length} · {Math.round(base.effs[i] * 100)}%</span>
                </div>
                <div className="row nowrap">
                  <input type="range" className="slider" min={5} max={100} value={Math.round(st.conversion * 100)} aria-label={`${st.name} pass-on rate`} onChange={(e) => update((d) => { d.stages[i].conversion = Number(e.target.value) / 100; })} />
                  <span className="small muted num" style={{ width: 120, textAlign: 'right', whiteSpace: 'nowrap' }}>{(cumulative * 100).toFixed(2)}% of leads</span>
                </div>
              </div>
            );
          })}
          <p className="small muted">Legacy ratios: 60 to 65% of leads qualify, 50% of qualified reach proposal, 30% of proposals reach negotiation, 50% of negotiations convert.</p>
        </div>

        <div className="stack">
          <div className="card stack">
            <h3>Target</h3>
            <div className="grid cols-2">
              <Field label="Conversions to hit" id="target">
                <NumberInput id="target" className="num-input" value={def.funnel.target} min={1} max={100000} onChange={(v) => update((d) => { d.funnel.target = v; d.meta.baseTarget = undefined; })} />
              </Field>
              <Field label="Value per conversion" id="value">
                <div className="row nowrap">
                  <select className="select" style={{ width: 92 }} value={def.funnel.currency} aria-label="Currency" onChange={(e) => update((d) => { d.funnel.currency = e.target.value; })}>
                    {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  <NumberInput id="value" className="num-input" style={{ width: 110 }} value={def.funnel.valuePerConversion} min={1} onChange={(v) => update((d) => { d.funnel.valuePerConversion = v; })} />
                </div>
              </Field>
            </div>
            <p className="ink2">Revenue target: <strong className="num">{money.format(def.funnel.target * def.funnel.valuePerConversion)}</strong></p>
            <Callout tone={base.conversions / def.funnel.target > 0.7 ? 'warn' : 'accent'}>
              If nobody improves, the starting team converts about <strong className="num">{base.conversions.toFixed(1)}</strong> ({Math.round((base.conversions / def.funnel.target) * 100)}% of target).
              {base.conversions / def.funnel.target > 0.7 ? ' That is close to target, so learners can succeed without leading well.' : ' Learners need to lift the team to get there.'}
            </Callout>
            {suggested && suggested !== def.funnel.target && (
              <div className="row spread">
                <span className="small">The balance check suggests <strong className="num">{suggested}</strong> conversions.</span>
                <Button size="sm" variant="primary" onClick={() => update((d) => { d.funnel.target = suggested; })}>Use {suggested}</Button>
              </div>
            )}
            {!suggested && <Button size="sm" onClick={() => openPanel('balance')}>Check the target with the balance check</Button>}
          </div>

          <div className="card stack">
            <h3>Stage descriptions</h3>
            <p className="small muted">Shown when a learner hovers the stage.</p>
            {def.stages.map((st, i) => (
              <TokenArea key={st.id} def={def} label={st.name} rows={2} value={st.description} onChange={(v) => update((d) => { d.stages[i].description = v; })} />
            ))}
          </div>
        </div>
      </div>

      {advanced && (
        <div className="card stack">
          <div className="row"><h3>Lead inflow and conversion formula</h3><span className="advanced-tag">Engine</span></div>
          <p className="small ink2 mono">output = input × pass-on rate × (average stage performance + buffer) / 100</p>
          <div className="row">
            <Field label="Performance buffer" hint="Added to average performance before scaling." id="buffer">
              <NumberInput id="buffer" value={def.funnel.buffer} min={0} max={60} onChange={(v) => update((d) => { d.funnel.buffer = v; })} />
            </Field>
            <Switch checked={def.funnel.capEfficiency} onChange={(v) => update((d) => { d.funnel.capEfficiency = v; })} label="Cap a stage at 100% efficiency" />
          </div>
          <span className="label small" style={{ fontWeight: 600 }}>New leads per week</span>
          <div className="scroll-x">
            <div className="row nowrap" style={{ alignItems: 'flex-end', '--gap': '6px', minWidth: def.timeline.weeks * 64 }}>
              {def.funnel.weeklyInflow.map((v, i) => {
                const max = Math.max(...def.funnel.weeklyInflow, 1);
                return (
                  <div key={i} className="stack" style={{ '--gap': '4px', alignItems: 'center', width: 58 }}>
                    <div style={{ height: 80, display: 'flex', alignItems: 'flex-end', width: '100%' }}>
                      <div style={{ height: `${(v / max) * 100}%`, width: '100%', background: 'var(--accent)', opacity: 0.8, borderRadius: '4px 4px 0 0' }} />
                    </div>
                    <NumberInput className="xs" value={v} min={0} max={100000} aria-label={`Week ${i + 1} leads`} onChange={(n) => update((d) => { d.funnel.weeklyInflow[i] = n; })} />
                    <span className="small muted">W{i + 1}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <p className="small muted">{base.leads.toLocaleString()} leads in total. The model document says inflow changes every week with the storyline; the legacy values were not in the workbook.</p>
        </div>
      )}
    </div>
  );
}
