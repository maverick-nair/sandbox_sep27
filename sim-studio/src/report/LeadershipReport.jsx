// The learner's leadership report. It follows the sections of the original iLead user report
// (competencies, objectives, adaptability, styles, consistency, actions, distribution of actions,
// food for thought, key takeaways), each switchable by the author.
import { forwardRef } from 'react';
import { renderText } from '../engine/text.js';
import { Section, Defs, LevelScale, LevelChip, ScoreDial, Donut, TargetBar, PairBars, Deviation, StyleGrid, Meter, ImpactLegend, ImpactChip, Tile, bandIndex, impactTone, pct, LEVEL_TONES } from './parts.jsx';

export const lines = (t) => String(t || '').split(/\n+/).map((x) => x.replace(/^\s*-\s*/, '').trim()).filter(Boolean);
export const moneyFormat = (def) => {
  const f = new Intl.NumberFormat('en', { style: 'currency', currency: def.funnel.currency || 'USD', maximumFractionDigits: 0 });
  return (v) => f.format(Math.round(v || 0));
};

export function ReportMark({ def, size = 44 }) {
  const look = def.look || {};
  const name = renderText(def, '{{company}}');
  if (look.logo) return <img className="rp-logo" src={look.logo} alt={name} style={{ height: size }} />;
  return <span className="rp-mark" aria-hidden="true" style={{ width: size, height: size, background: look.brand || 'var(--accent)' }}>{name.slice(0, 1)}</span>;
}

export function ReportCover({ def, kicker, title, who, meta }) {
  return (
    <header className="rp-cover" style={{ '--rp-brand': def.look?.brand || undefined }}>
      <div className="rp-cover-row">
        <ReportMark def={def} />
        <div className="rp-cover-text">
          <span className="rp-kicker">{kicker}</span>
          <h1>{title}</h1>
          {who && <p className="rp-cover-who">{who}</p>}
        </div>
      </div>
      {meta?.length > 0 && <ul className="rp-cover-meta">{meta.filter(Boolean).map((m) => <li key={m}>{m}</li>)}</ul>}
    </header>
  );
}

const LeadershipReport = forwardRef(function LeadershipReport({ def, report, name, date }, ref) {
  const R = def.report;
  const on = (k) => R.sections?.[k] !== false;
  const T = (t, v) => renderText(def, t || '', v);
  const money = moneyFormat(def);
  const styleDef = (id) => def.leadership.styles.find((s) => s.id === id) || {};
  const bands = R.competencies[0]?.bands || [];
  const pr = report.progress;
  const enabledActions = def.actions.filter((a) => a.enabled);
  const preferred = [...report.styles].sort((a, b) => b.used - a.used)[0];
  let n = 0;
  const num = () => (n += 1);

  return (
    <article className="rp" ref={ref} style={{ '--rp-brand': def.look?.brand || undefined }}>
      <ReportCover def={def} kicker={`${T('{{company}}')} · Leadership report`} title={def.meta?.name || 'iLead'} who={name ? `Prepared for ${name}` : null} meta={[date, `${def.timeline.weeks} week quarter`, T('{{learner_role}}') ? `Role: ${T('{{learner_role}}')}` : null]} />
      {R.about && <p className="rp-about">{T(R.about)}</p>}

      {on('summary') && (
        <div className="rp-tiles">
          <Tile label="Target reached" value={pct(pr.achieved)} sub={`${pr.conversions.toFixed(1)} of ${pr.target} conversions`} tone={pr.achieved >= 1 ? 'good' : pr.achieved >= 0.7 ? 'warn' : 'bad'} />
          <Tile label="Leadership adaptability" value={pct(report.accuracy, 1)} sub="right style for the person" />
          <Tile label="Preferred style" value={preferred?.used ? preferred.name : 'None yet'} sub={preferred?.used ? `${pct(preferred.proportion)} of your choices` : ''} />
          <Tile label="Team morale" value={`${Math.round(report.start.m)} → ${Math.round(report.end.m)}`} sub={report.end.m >= report.start.m ? 'higher than you found it' : 'lower than you found it'} tone={report.end.m >= report.start.m ? 'good' : 'bad'} />
        </div>
      )}

      {on('competencies') && report.competencies.length > 0 && (
        <Section n={num()} id="competencies" title="Competencies" intro={['This section describes the competencies you demonstrated in the simulation. Each competency score represents your performance on a scale of 0 to 10.']}>
          <LevelScale bands={bands} />
          <div className="rp-comps">
            {report.competencies.map((c) => {
              const i = bandIndex(c.score);
              const cd = R.competencies.find((x) => x.id === c.id);
              return (
                <div key={c.id} className={`rp-comp lv-${LEVEL_TONES[i]}`}>
                  <ScoreDial score={c.score} index={i} />
                  <div className="rp-comp-body">
                    <div className="rp-comp-head"><h3>{c.name}</h3><LevelChip index={i} label={c.band} /></div>
                    {cd?.description && <p className="rp-muted small">{T(cd.description)}</p>}
                    <p className="rp-insight">{T(c.text)}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="rp-footnote">Morale and skill are the two factors that affect performance directly. Adapting your leadership style by reading what each team member needs, and what the situation demands, lifts performance. High performance drives results.</p>
        </Section>
      )}

      {on('objective') && (
        <Section n={num()} id="objective" title="Objectives">
          <p className="rp-callout">{T(report.objective.text)}</p>
          <div className="rp-two">
            <div className="rp-panel">
              <h3>Revenue</h3>
              <p className="rp-muted small">Revenue comes from the conversions your team made, against the target set at the start.</p>
              <TargetBar actual={pr.revenue} target={report.revenueTarget} format={money} actualLabel="Actual revenue" targetLabel="Target revenue" />
              <div className="rp-inline-stat"><span>Number of conversions</span><strong>{pr.conversions.toFixed(1)}</strong><span className="rp-muted">of {pr.target}</span></div>
            </div>
            <div className="rp-panel">
              <h3>Your team, start to finish</h3>
              <p className="rp-muted small">The team's average result, morale and skill at the start and at the end of the quarter.</p>
              <PairBars rows={[{ label: 'Team result', values: [report.start.p, report.end.p] }, { label: 'Team morale', values: [report.start.m, report.end.m] }, { label: 'Team skill', values: [report.start.s, report.end.s] }]} />
            </div>
          </div>
        </Section>
      )}

      {on('adaptability') && (
        <Section n={num()} id="adaptability" title="Overall leadership adaptability" intro="The way a leader manages each person in different situations shapes their skill and morale and, in turn, the results. Choosing the right style for each person, and changing it as they change, raises skill, morale and results. Consistently choosing the wrong style lowers them.">
          <div className="rp-adapt">
            <Donut value={report.accuracy} label="Adaptability" sub="share of weeks you chose the style each person needed" />
            <ul className="rp-bullets">{lines(T(report.adaptability.text)).map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
        </Section>
      )}

      {on('styles') && (
        <Section n={num()} id="styles" title="Leadership styles summary" intro="In the simulation you used different styles to lead different people. Here is how much you used each style and how well it fitted when you did.">
          <Defs items={[['Proportion', 'How often you used a style, as a share of all your style choices.'], ['Accuracy', 'How often the style you chose was the one the person needed.']]} />
          <StyleGrid styles={report.styles.map((s) => ({ ...s, skill: styleDef(s.id).skill, morale: styleDef(s.id).morale }))} render={(s) => (
            <>
              <div className="rp-cell-head"><strong style={{ color: styleDef(s.id).color }}>{s.name}</strong><span className="rp-muted small">Proportion {pct(s.proportion)}</span></div>
              <p className="small">{T(R.styleDescriptions?.[s.id])}</p>
              <Meter label="Accuracy" value={s.accuracy} color={styleDef(s.id).color} />
              {s.text && <p className="rp-insight small">{s.text}</p>}
            </>
          )} />
          {preferred?.used > 0 && <p className="rp-callout small">In most situations you used the <strong>{preferred.name}</strong> style. This is your preferred leadership style.</p>}
        </Section>
      )}

      {on('consistency') && (
        <Section n={num()} id="consistency" title="Consistency in styles" intro="How consistent you were in identifying, intending and actually using the most appropriate style. Meeting the team, meeting face to face, setting goals, coaching and giving feedback count towards this.">
          <Defs items={[['Desired style', 'The style each person needed, given their skill and morale.'], ['Intended style', 'The style you planned for each person at the start of the week.'], ['Actual style', 'The style you actually used through your actions.']]} />
          <div className="rp-devs">
            {[['desiredVsActual', 'desired-vs-actual', 'Desired', 'Actual'], ['intentVsActual', 'intent-vs-actual', 'Intended', 'Actual'], ['desiredVsIntent', 'desired-vs-intent', 'Desired', 'Intended']].map(([k, id, a, b]) => {
              const c = report.consistency.find((x) => x.id === id);
              return (
                <div key={k} className="rp-devrow">
                  <h3>{a} vs {b.toLowerCase()}</h3>
                  <Deviation from={`${a} style`} to={`${b} style`} value={report.consistencyPct[k]} />
                  <div className="rp-two tight">
                    <p className="rp-muted small">{T(R.consistency[id]?.description)}</p>
                    <p className="rp-insight small">{c?.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {on('actions') && (
        <Section n={num()} id="actions" title="Summary of actions" intro="The actions you took while leading your team, how often you took each one and how well it landed.">
          <Defs items={[['Impact', 'How often the action had a positive effect on the people it touched.'], ['Frequency', 'How many times you took the action.']]} />
          <div className="rp-actions">
            {report.actions.filter((a) => R.actionInsights[a.id] && enabledActions.some((x) => x.id === a.id)).map((a) => (
              <div key={a.id} className="rp-action">
                <div className="rp-action-head"><h3>{a.name}</h3><span className="rp-action-stats"><span>Impact <ImpactChip impact={a.impact} /></span><span>Frequency <strong className="rp-freq">{a.count}</strong></span></span></div>
                <p className="rp-muted small">{T(R.actionInsights[a.id].description)}</p>
                {a.text && <p className="rp-insight small">{T(a.text)}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {on('distribution') && report.distribution?.length > 0 && (
        <Section n={num()} id="distribution" title="Distribution of actions across the team" intro="As you read this table, keep the Food for thought questions in mind. It shows how often each action touched each person and how well it landed. Many zeros mean you did not use all the actions available to you.">
          <Defs items={[['Number', 'How many times an action touched that team member.'], ['Order', 'People are listed from the most positive impact to the least.'], ['Colour', 'How well the actions landed with that person.']]} />
          <ImpactLegend />
          <div className="rp-matrix-wrap" tabIndex={0} aria-label="Actions by team member">
            <table className="rp-matrix">
              <thead><tr><th scope="col">Team member</th>{enabledActions.map((a) => <th key={a.id} scope="col"><span>{a.name}</span></th>)}<th scope="col"><span>All actions</span></th></tr></thead>
              <tbody>
                {report.distribution.map((p) => (
                  <tr key={p.id}>
                    <th scope="row">{p.name}{p.left && <span className="rp-muted small"> (left)</span>}</th>
                    {enabledActions.map((a) => { const c = p.cells[a.id] || { n: 0, impact: 'No' }; return <td key={a.id}><span className={`rp-dot im-${impactTone(c.impact)}`} title={`${p.name}, ${a.name}: ${c.n} (${c.impact} impact)`}>{c.n}</span></td>; })}
                    <td><span className={`rp-dot total im-${impactTone(p.score >= 2.5 ? 'High' : p.score >= 1.5 ? 'Moderate' : p.score >= 0.75 ? 'Low' : p.total ? 'Very low' : 'No')}`}>{p.total}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">Whole team</th>
                  {enabledActions.map((a) => { const x = report.actions.find((y) => y.id === a.id); return <td key={a.id}><span className={`rp-dot im-${impactTone(x?.impact || 'No')}`}>{x?.count || 0}</span></td>; })}
                  <td><span className="rp-dot total im-none">{report.actions.reduce((t, a) => t + a.count, 0)}</span></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="rp-muted small">The Whole team row counts each action once, however many people it reached.</p>
        </Section>
      )}

      {on('foodForThought') && R.foodForThought?.length > 0 && (
        <Section n={num()} id="food" title="Food for thought">
          <div className="rp-qa">
            {R.foodForThought.map((q, i) => (
              <div key={i} className="rp-q">
                <p className="rp-q-q"><span className="rp-q-mark">Q</span>{T(q.q)}</p>
                {q.a && <p className="rp-q-a">{T(q.a)}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {on('takeaways') && R.takeaways?.length > 0 && (
        <Section n={num()} id="takeaways" title="Key takeaways">
          <p className="rp-callout">Thank you for playing the simulation. As we conclude, here is a summary of the key points and recommended next steps.</p>
          <ul className="rp-chevrons">{R.takeaways.filter(Boolean).map((t, i) => <li key={i}>{T(t)}</li>)}</ul>
        </Section>
      )}
    </article>
  );
});

export default LeadershipReport;
