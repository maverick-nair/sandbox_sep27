import { CURRENCIES } from '../../templates/ilead/world.js';
import { NumberInput, SectionHead, TokenArea, Button, Callout, Switch, Field, Seg } from '../ui.jsx';
import { businessOf, suggestedProfitTarget, profitTarget, revenueTarget, METRICS, defaultBusiness } from '../../engine/finance.js';

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
            <h3>Volume: conversions</h3>
            <p className="small muted">The sales the team must close. Revenue and profit follow from them.</p>
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

          <BusinessTarget def={def} update={update} money={money} />

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

// The target the board sets, as a business metric: revenue, or operating profit after the cost of
// sales, the team's cost and what the leader spends on actions.
function BusinessTarget({ def, update, money }) {
  const b = businessOf(def);
  const setB = (patch) => update((d) => { d.business = { ...businessOf(d), ...patch }; });
  const setCost = (id, v) => update((d) => { const cur = businessOf(d); d.business = { ...cur, actionCosts: { ...cur.actionCosts, [id]: v } }; });
  const team = def.actors.filter((a) => a.pool === 'team').length;
  const rev = revenueTarget(def);
  const gp = rev * b.grossMargin;
  const teamCost = team * b.weeklyCostPerPerson * def.timeline.weeks;
  const suggested = suggestedProfitTarget(def);
  const target = profitTarget(def);
  return (
    <div className="card stack">
      <h3>Business target</h3>
      <p className="small muted">What the board judges the learner on. Revenue grows with every conversion. Operating profit also counts the cost of sales, the team and every action the learner pays for, so choices like training, rewards and hiring have a price.</p>
      <Seg label="Target metric" value={b.metric} onChange={(v) => setB({ metric: v })} options={Object.entries(METRICS).map(([value, m]) => ({ value, label: m.label }))} />
      <div className="grid cols-2">
        <Field label="Gross margin" hint="Share of revenue left after the cost of what was sold." id="gm">
          <div className="row nowrap"><NumberInput id="gm" className="num-input" value={Math.round(b.grossMargin * 100)} min={1} max={95} onChange={(v) => setB({ grossMargin: v / 100 })} /><span className="small">%</span></div>
        </Field>
        <Field label="Weekly cost per team member" hint="Salary and overheads, for everyone on the team that week." id="wc">
          <NumberInput id="wc" className="num-input" value={b.weeklyCostPerPerson} min={0} max={1000000} onChange={(v) => setB({ weeklyCostPerPerson: v })} />
        </Field>
      </div>
      {b.metric === 'profit' ? (
        <Field label="Operating profit target" hint={`Suggested ${money.format(suggested)}: gross profit at the conversions target, less the quarter's team cost and a spending allowance.`} id="pt">
          <div className="row nowrap">
            <NumberInput id="pt" className="num-input" value={target} min={0} max={1e12} onChange={(v) => setB({ profitTarget: v })} />
            {b.profitTarget !== null && b.profitTarget !== suggested && <Button size="sm" variant="ghost" onClick={() => setB({ profitTarget: null })}>Use {money.format(suggested)}</Button>}
          </div>
        </Field>
      ) : (
        <Switch checked={b.showProfit !== false} onChange={(v) => setB({ showProfit: v })} label="Also show operating profit to learners (not scored)" />
      )}
      <div className="fin-table">
        <div><span>Revenue at target</span><strong className="num">{money.format(rev)}</strong></div>
        <div><span>Gross profit ({Math.round(b.grossMargin * 100)}%)</span><strong className="num">{money.format(gp)}</strong></div>
        <div><span>Team cost ({team} people × {def.timeline.weeks} weeks)</span><strong className="num">−{money.format(teamCost)}</strong></div>
        <div><span>Operating profit before action spend</span><strong className="num">{money.format(gp - teamCost)}</strong></div>
        {b.metric === 'profit' && <div className="total"><span>Profit target</span><strong className="num">{money.format(target)}</strong></div>}
      </div>
      {gp - teamCost <= 0 && <Callout tone="bad" icon="!">Even at the conversions target the team loses money. Raise the margin or the value per conversion, or lower the team cost.</Callout>}
      <details>
        <summary className="small" style={{ cursor: 'pointer', fontWeight: 650 }}>What each action costs</summary>
        <div className="cost-grid">
          {def.actions.filter((a) => a.enabled).map((a) => (
            <label key={a.id} className="row nowrap small" style={{ '--gap': '8px' }}>
              <span className="grow">{a.name}<span className="muted"> {a.scope === 'team' || a.mechanic === 'hire' ? '(each time)' : '(per person)'}</span></span>
              <NumberInput className="xs" value={b.actionCosts[a.id] || 0} min={0} max={1e9} onChange={(v) => setCost(a.id, v)} aria-label={`Cost of ${a.name}`} />
            </label>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={() => setB({ actionCosts: { ...defaultBusiness().actionCosts } })}>Restore the standard costs</Button>
      </details>
    </div>
  );
}
