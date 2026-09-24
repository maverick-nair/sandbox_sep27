import { Field, ImpactInputs, NumberInput, SectionHead, TextInput, Callout, impactText } from '../ui.jsx';

const OUTCOME = { 0: 'Right style', 1: 'One read wrong', 2: 'Both reads wrong' };

export default function Leadership({ def, update, advanced }) {
  const L = def.leadership;
  const r = def.randomness;
  return (
    <div className="stack" style={{ '--gap': '22px' }}>
      <SectionHead eyebrow="Build" title="Leadership model">
        iLead uses situational leadership: read each person's skill and morale, then lead in the style that fits. Rename the styles to match your client's leadership framework; the logic stays the same.
      </SectionHead>

      <div className="grid cols-2">
        {L.styles.map((s, i) => (
          <div key={s.id} className="card stack" style={{ borderTop: `3px solid ${s.color}` }}>
            <div className="row spread">
              <span className="style-pill" style={{ '--c': s.color }}><span className="dot" />{s.skill} skill · {s.morale} morale</span>
              <span className="small muted">Legacy name: {s.legacy}</span>
            </div>
            <TextInput label="Style name" value={s.name} onChange={(v) => update((d) => { d.leadership.styles[i].name = v; })} />
            <Field label="What it means for the learner" id={`def-${s.id}`}>
              <textarea id={`def-${s.id}`} className="textarea" rows={2} value={s.definition} onChange={(e) => update((d) => { d.leadership.styles[i].definition = e.target.value; })} />
            </Field>
          </div>
        ))}
      </div>

      <div className="card stack">
        <h3>What counts as high</h3>
        <div className="row">
          <Field label="Skill or morale is high from" id="hi" hint="Legacy value 70. Below it counts as low.">
            <NumberInput id="hi" value={L.highThreshold} min={10} max={95} onChange={(v) => update((d) => { d.leadership.highThreshold = v; })} />
          </Field>
          <Field label="Red below" id="red" hint="Dashboard colour bands.">
            <NumberInput id="red" value={L.rag.red} min={0} max={100} onChange={(v) => update((d) => { d.leadership.rag.red = v; })} />
          </Field>
          <Field label="Green from" id="green">
            <NumberInput id="green" value={L.rag.green} min={0} max={100} onChange={(v) => update((d) => { d.leadership.rag.green = v; })} />
          </Field>
        </div>
      </div>

      {!advanced && <Callout>Turn on <strong>Show engine settings</strong> at the top to tune how strongly right and wrong reads play out.</Callout>}

      {advanced && (
        <>
          <div className="card stack">
            <div className="row"><h3>Weekly style decision</h3><span className="advanced-tag">Engine</span></div>
            <p className="small ink2">Applied to each person every Monday when the learner sets their style.</p>
            <table className="table">
              <tbody>
                {['0', '1', '2'].map((k) => (
                  <tr key={k}>
                    <td style={{ width: 180 }}><strong>{OUTCOME[k]}</strong></td>
                    <td><ImpactInputs value={L.weeklyImpact[k]} onChange={(v) => update((d) => { d.leadership.weeklyImpact[k] = v; })} /></td>
                    <td className="small muted">{impactText(L.weeklyImpact[k])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card stack">
            <div className="row"><h3>How often a wrong read shows</h3><span className="advanced-tag">Engine</span></div>
            <p className="small ink2">Real people do not always react to a poor approach. When the style is off, the reaction appears this often; otherwise the person responds as if it were right.</p>
            <div className="row nowrap">
              <input type="range" className="slider" min={20} max={100} value={Math.round(r.mismatchChance * 100)} aria-label="Chance a wrong style shows" onChange={(e) => update((d) => { d.randomness.mismatchChance = Number(e.target.value) / 100; d.meta.difficulty = 'custom'; })} />
              <strong className="num" style={{ width: 48, textAlign: 'right' }}>{Math.round(r.mismatchChance * 100)}%</strong>
            </div>
            <p className="small muted">Legacy value 60%. Every impact is also multiplied by a random factor between {r.impactMin} and {r.impactMax}.</p>
            <div className="row">
              <Field label="Random factor from" id="imin"><NumberInput id="imin" value={r.impactMin} min={0.1} max={1} step={0.05} onChange={(v) => update((d) => { d.randomness.impactMin = v; d.meta.difficulty = 'custom'; })} /></Field>
              <Field label="to" id="imax"><NumberInput id="imax" value={r.impactMax} min={1} max={2} step={0.05} onChange={(v) => update((d) => { d.randomness.impactMax = v; d.meta.difficulty = 'custom'; })} /></Field>
              <Field label="Stat buffer on reassign and assess" id="buf"><NumberInput id="buf" value={r.statBuffer} min={0} max={20} onChange={(v) => update((d) => { d.randomness.statBuffer = v; })} /></Field>
            </div>
          </div>

          <div className="card stack">
            <div className="row"><h3>Events and the weekly style</h3><span className="advanced-tag">Engine</span></div>
            <p className="small ink2">General events hit harder when the week's style was wrong for the person.</p>
            <div className="row">
              {['0', '1', '2'].map((k) => (
                <Field key={k} label={OUTCOME[k]} id={`ef-${k}`}>
                  <NumberInput id={`ef-${k}`} value={r.eventStyleFactor[k]} min={0} max={3} step={0.1} onChange={(v) => update((d) => { d.randomness.eventStyleFactor[k] = v; })} />
                </Field>
              ))}
            </div>
            <p className="small muted">Multiplier on the event's impact.</p>
          </div>
        </>
      )}
    </div>
  );
}
