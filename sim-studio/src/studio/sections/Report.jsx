import { useMemo, useState } from 'react';
import { playBot, BOTS } from '../../engine/bots.js';
import { computeReport } from '../../engine/report.js';
import { Button, Field, NumberInput, Pill, SectionHead, Switch, TokenArea, Seg, StylePill } from '../ui.jsx';

const MISSING = /NO STRING AVAILABLE/i;
const USE = ['Low', 'Moderate', 'High'];

export default function Report({ def, update, advanced }) {
  const [tab, setTab] = useState('competencies');
  const missing = Object.values(def.report.styleInsights).reduce((n, g) => n + Object.values(g).filter((v) => !v || MISSING.test(v)).length, 0);
  const tabs = [
    ['competencies', 'Competencies'],
    ['outcome', 'Outcome and adaptability'],
    ['styles', `Style insights${missing ? ` (${missing} missing)` : ''}`],
    ['actions', 'Action insights'],
    ['reflect', 'Reflection'],
    ['sample', 'Sample report'],
  ];
  return (
    <div>
      <SectionHead eyebrow="Build" title="Report">
        The learner's report scores five competencies from 0 to 10 and explains each score in words. You write the words for each band; the engine picks the band.
      </SectionHead>
      <div className="tabs" role="tablist">
        {tabs.map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={tab === id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>)}
      </div>
      {tab === 'competencies' && <Competencies def={def} update={update} advanced={advanced} />}
      {tab === 'outcome' && (
        <div className="grid cols-2">
          <div className="card stack">
            <h3>Result against target</h3>
            {[['low', 'Below 70% of target'], ['medium', '70% to 99%'], ['high', 'Target reached']].map(([k, label]) => (
              <TokenArea key={k} def={def} label={label} rows={3} tokens="report" value={def.report.objective[k]} onChange={(v) => update((d) => { d.report.objective[k] = v; })} />
            ))}
          </div>
          <div className="card stack">
            <h3>Overall adaptability</h3>
            {[['low', 'Right style less than 40% of the time'], ['moderate', '40% to 69%'], ['high', '70% or more']].map(([k, label]) => (
              <TokenArea key={k} def={def} label={label} rows={3} tokens="report" value={def.report.adaptability[k]} onChange={(v) => update((d) => { d.report.adaptability[k] = v; })} />
            ))}
          </div>
        </div>
      )}
      {tab === 'styles' && <StyleInsights def={def} update={update} />}
      {tab === 'actions' && (
        <div className="stack">
          {Object.entries(def.report.actionInsights).map(([id, ai]) => {
            const action = def.actions.find((a) => a.id === id);
            return (
              <details key={id} className="card">
                <summary style={{ cursor: 'pointer', fontWeight: 650 }}>{action?.name || id}</summary>
                <div className="stack" style={{ marginTop: 12 }}>
                  <TokenArea def={def} label="What this action is for" rows={2} value={ai.description} onChange={(v) => update((d) => { d.report.actionInsights[id].description = v; })} />
                  {Object.keys(ai.bands).map((b) => (
                    <TokenArea key={b} def={def} label={{ HighPositive: 'Mostly positive (75%+)', LowPositive: 'More positive than not', LowNegative: 'More negative than not', HighNegative: 'Mostly negative', NoImpact: 'Never used' }[b] || b} rows={2} value={ai.bands[b]} onChange={(v) => update((d) => { d.report.actionInsights[id].bands[b] = v; })} />
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}
      {tab === 'reflect' && (
        <div className="grid cols-2">
          <div className="card stack">
            <h3>Food for thought</h3>
            {def.report.foodForThought.map((q, i) => (
              <div key={i} className="stack" style={{ '--gap': '6px', paddingTop: 8, borderTop: i ? '1px solid var(--line)' : 0 }}>
                <input className="input" aria-label={`Question ${i + 1}`} value={q.q} onChange={(e) => update((d) => { d.report.foodForThought[i].q = e.target.value; })} />
                <textarea className="textarea" rows={3} aria-label={`Answer ${i + 1}`} value={q.a} onChange={(e) => update((d) => { d.report.foodForThought[i].a = e.target.value; })} />
              </div>
            ))}
          </div>
          <div className="card stack">
            <h3>Key takeaways</h3>
            {def.report.takeaways.map((t, i) => (
              <textarea key={i} className="textarea" rows={2} aria-label={`Takeaway ${i + 1}`} value={t} onChange={(e) => update((d) => { d.report.takeaways[i] = e.target.value; })} />
            ))}
            <div><Button size="sm" onClick={() => update((d) => { d.report.takeaways.push(''); })}>Add takeaway</Button></div>
          </div>
        </div>
      )}
      {tab === 'sample' && <SampleReport def={def} />}
    </div>
  );
}

function Competencies({ def, update, advanced }) {
  return (
    <div className="stack">
      {advanced && (
        <div className="card row">
          <span className="advanced-tag">Engine</span>
          <Field label="Points of team change per score point" id="scale" hint="Upskill, motivate and enable start at 5 and move by the team's average change divided by this.">
            <NumberInput id="scale" value={def.report.scoreScale} min={1} max={20} onChange={(v) => update((d) => { d.report.scoreScale = v; })} />
          </Field>
          <p className="small muted grow">Adaptive leadership = share of right weekly styles × 10. Drive for results = share of target × 8 (125% of target scores 10).</p>
        </div>
      )}
      {def.report.competencies.map((c, ci) => (
        <details key={c.id} className="card" open={ci === 0}>
          <summary style={{ cursor: 'pointer' }} className="row spread">
            <span className="row"><strong>{c.name}</strong><Pill>{c.ontologyCode}</Pill></span>
            <span onClick={(e) => e.stopPropagation()}><Switch checked={c.enabled} onChange={(v) => update((d) => { d.report.competencies[ci].enabled = v; })} label="In report" /></span>
          </summary>
          <div className="stack" style={{ marginTop: 12 }}>
            <p className="small ink2">{c.description}</p>
            {c.bands.map((b, bi) => (
              <div key={b.label} className="grid" style={{ gridTemplateColumns: '130px 1fr', gap: 10, alignItems: 'start' }}>
                <div className="stack" style={{ '--gap': '2px' }}>
                  <strong className="small">{b.label}</strong>
                  <span className="small muted num">{b.min} to {b.max}</span>
                </div>
                <textarea className="textarea" rows={2} aria-label={`${c.name} ${b.label}`} value={b.text} onChange={(e) => update((d) => { d.report.competencies[ci].bands[bi].text = e.target.value; })} />
              </div>
            ))}
            <p className="small muted">Mapped to the KNOLSKAPE Skills Ontology ({c.ontologyCode}), so GenieTracker can roll scores into readiness dashboards.</p>
          </div>
        </details>
      ))}
    </div>
  );
}

function StyleInsights({ def, update }) {
  const [styleId, setStyleId] = useState(def.leadership.styles[0].id);
  const grid = def.report.styleInsights[styleId];
  return (
    <div className="stack">
      <p className="small ink2">For each style: how often the learner used it compared with how often it was needed (use), and how often it was the right call when they did (accuracy).</p>
      <Seg value={styleId} onChange={setStyleId} options={def.leadership.styles.map((s) => ({ value: s.id, label: s.name }))} label="Style" />
      <div className="row"><StylePill def={def} styleId={styleId} /><span className="small ink2">{def.report.styleDescriptions[styleId]}</span></div>
      <div className="scroll-x">
        <table className="table" style={{ minWidth: 720 }}>
          <thead><tr><th>Use vs accuracy</th>{USE.map((a) => <th key={a}>{a} accuracy</th>)}</tr></thead>
          <tbody>
            {USE.map((u) => (
              <tr key={u}>
                <td><strong>{u} use</strong></td>
                {USE.map((a) => {
                  const key = `${u}Use${a}Accuracy`;
                  const v = grid[key] || '';
                  const bad = !v || MISSING.test(v);
                  return (
                    <td key={a} style={{ verticalAlign: 'top', background: bad ? 'var(--bad-soft)' : undefined }}>
                      {bad && <Pill tone="bad">Write this</Pill>}
                      <textarea className="textarea" rows={5} aria-label={`${u} use, ${a} accuracy`} value={bad ? '' : v} placeholder={bad ? 'Legacy text was missing. Write the insight for this combination.' : ''} onChange={(e) => update((d) => { d.report.styleInsights[styleId][key] = e.target.value; })} style={{ marginTop: bad ? 6 : 0, fontSize: 12.5 }} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted">Use the style field in the text to insert the style's name.</p>
    </div>
  );
}

function SampleReport({ def }) {
  const [bot, setBot] = useState('expert');
  const [seed, setSeed] = useState(7);
  const report = useMemo(() => computeReport(def, playBot(def, bot, seed).state), [def, bot, seed]);
  return (
    <div className="stack">
      <div className="row">
        <Seg value={bot} onChange={setBot} options={Object.entries(BOTS).map(([id, b]) => ({ value: id, label: b.name }))} label="Played by" />
        <Button size="sm" onClick={() => setSeed((s) => s + 1)}>Play again</Button>
      </div>
      <p className="small muted">A report as a learner would see it, from one run played by a bot. {BOTS[bot].description}</p>
      <ReportView def={def} report={report} />
    </div>
  );
}

export function ReportView({ def, report }) {
  const money = new Intl.NumberFormat('en', { style: 'currency', currency: def.funnel.currency, notation: 'compact' });
  return (
    <div className="stack" style={{ '--gap': '16px' }}>
      <div className="grid cols-4">
        <div className="card"><span className="eyebrow">Conversions</span><div className="num" style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 650 }}>{report.progress.conversions.toFixed(1)} <span className="small muted">of {report.progress.target}</span></div></div>
        <div className="card"><span className="eyebrow">Revenue</span><div className="num" style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 650 }}>{money.format(report.progress.revenue)}</div></div>
        <div className="card"><span className="eyebrow">Right style</span><div className="num" style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 650 }}>{Math.round(report.accuracy * 100)}%</div></div>
        <div className="card"><span className="eyebrow">Dominant style</span><div style={{ fontSize: 20, fontFamily: 'var(--font-display)', fontWeight: 650 }}>{report.dominant || 'None'}</div></div>
      </div>
      <div className="card stack">
        <h3>Result</h3>
        <p>{report.objective.text}</p>
        <p className="small ink2" style={{ whiteSpace: 'pre-wrap' }}>{report.adaptability.text}</p>
      </div>
      <div className="card stack">
        <h3>Competencies</h3>
        {report.competencies.map((c) => (
          <div key={c.id} className="grid" style={{ gridTemplateColumns: 'minmax(150px, 200px) 1fr', gap: 12, alignItems: 'start', paddingTop: 10, borderTop: '1px solid var(--line)' }}>
            <div className="stack" style={{ '--gap': '4px' }}>
              <strong>{c.name}</strong>
              <div className="row nowrap"><div className="bar grow"><span style={{ width: `${c.score * 10}%` }} /></div><span className="num small">{c.score.toFixed(1)}</span></div>
              <span className="small muted">{c.band}</span>
            </div>
            <p className="small ink2">{c.text}</p>
          </div>
        ))}
      </div>
      <div className="card stack">
        <h3>Leadership styles</h3>
        <div className="scroll-x">
          <table className="table">
            <thead><tr><th>Style</th><th>Share of choices</th><th>Needed</th><th>Right when needed</th><th>Insight</th></tr></thead>
            <tbody>
              {report.styles.map((s) => (
                <tr key={s.id}>
                  <td><StylePill def={def} styleId={s.id} /></td>
                  <td className="num">{Math.round(s.proportion * 100)}%</td>
                  <td className="num">{s.needed}</td>
                  <td className="num">{Math.round(s.adaptability * 100)}%</td>
                  <td className="small ink2" style={{ minWidth: 260 }}>{/NO STRING/i.test(s.text) ? <Pill tone="bad">Missing copy</Pill> : s.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="card stack">
        <h3>Actions</h3>
        <div className="scroll-x">
          <table className="table">
            <thead><tr><th>Action</th><th>Times</th><th>Positive</th><th>Insight</th></tr></thead>
            <tbody>
              {report.actions.filter((a) => def.report.actionInsights[a.id]).map((a) => (
                <tr key={a.id}><td>{a.name}</td><td className="num">{a.count}</td><td className="num">{a.count ? `${Math.round(a.positive * 100)}%` : '-'}</td><td className="small ink2" style={{ minWidth: 260 }}>{a.text}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
