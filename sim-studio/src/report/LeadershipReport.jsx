// The learner's leadership development report. It opens the way leading leadership development
// reports do (an executive summary, how to read the report, the competency profile, then each
// competency with the evidence, what the next level looks like and what to focus on), keeps every
// section of the original iLead user report as behavioural analytics, and closes with a
// development plan: priorities with a 70-20-10 plan, an individual development plan and a
// coaching conversation guide. Every section can be switched off by the author, and the standard
// content for each level is theirs to edit. Genie personalises the narrative when it can.
import { forwardRef } from 'react';
import { renderText } from '../engine/text.js';
import { Section, Defs, LevelScale, LevelChip, ScoreDial, Donut, TargetBar, PairBars, Deviation, StyleGrid, Meter, ImpactLegend, ImpactChip, Tile, Split, bandIndex, impactTone, pct, LEVEL_TONES } from './parts.jsx';

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

const LeadershipReport = forwardRef(function LeadershipReport({ def, report, name, date, narrative, bench }, ref) {
  const R = def.report;
  const on = (k) => R.sections?.[k] !== false;
  const T = (t, v) => renderText(def, t || '', v);
  const money = moneyFormat(def);
  const styleDef = (id) => def.leadership.styles.find((s) => s.id === id) || {};
  const bands = R.competencies[0]?.bands || [];
  const pr = report.progress;
  const enabledActions = def.actions.filter((a) => a.enabled);
  const preferred = [...report.styles].sort((a, b) => b.used - a.used)[0];
  const dev = report.dev;
  const N = narrative || null;
  const byId = (id) => dev?.comps.find((c) => c.id === id);
  let n = 0;
  const num = () => (n += 1);

  return (
    <article className="rp" ref={ref} style={{ '--rp-brand': def.look?.brand || undefined }}>
      <ReportCover def={def} kicker={`${T('{{company}}')} · Leadership development report`} title={def.meta?.name || 'iLead'} who={name ? `Prepared for ${name}` : null} meta={[date, `${def.timeline.weeks} week quarter`, T('{{learner_role}}') ? `Role: ${T('{{learner_role}}')}` : null]} />
      {R.about && <p className="rp-about">{T(R.about)}</p>}

      {on('summary') && (
        <Section n={num()} id="summary" title="Executive summary" className="rp-exec">
          <div className="rp-exec-top">
            <div className="rp-overall">
              <ScoreDial score={dev.overall.score} index={dev.overall.levelIndex} size={96} />
              <div><span className="rp-kicker-dark">Overall leadership profile</span><strong>{dev.overall.level}</strong><span className="rp-muted small">{dev.overall.definition}</span></div>
            </div>
            <p className="rp-summary">{N?.summary || dev.summary}</p>
          </div>
          <div className="rp-tiles">
            <Tile label={`${pr.metric?.label || 'Target'} target reached`} value={pct(pr.achieved)} sub={`${money(pr.metric?.value ?? pr.revenue)} of ${money(pr.metric?.target ?? report.revenueTarget)}`} tone={pr.achieved >= 1 ? 'good' : pr.achieved >= 0.7 ? 'warn' : 'bad'} />
            <Tile label="Leadership adaptability" value={pct(report.accuracy, 1)} sub="right style for the person" />
            <Tile label="Preferred style" value={preferred?.used ? preferred.name : 'None yet'} sub={preferred?.used ? `${pct(preferred.proportion)} of your choices` : ''} />
            <Tile label="Team morale" value={`${Math.round(report.start.m)} → ${Math.round(report.end.m)}`} sub={report.end.m >= report.start.m ? 'higher than you found it' : 'lower than you found it'} tone={report.end.m >= report.start.m ? 'good' : 'bad'} />
          </div>
          <div className="rp-two">
            <div className="rp-sp good">
              <h3>Strengths to build on</h3>
              {dev.strengths.length ? dev.strengths.map((c) => <div key={c.id} className="rp-sp-item"><strong>{c.name}</strong><span className="rp-muted small">{c.level} · {c.score}/10</span><p className="small">{N?.strengths?.find((x) => x.id === c.id)?.text || c.keep}</p></div>) : <p className="small rp-muted">No clear strength yet. Your development plan starts from here.</p>}
            </div>
            <div className="rp-sp focus">
              <h3>Development priorities</h3>
              {dev.priorities.map((c) => <div key={c.id} className="rp-sp-item"><strong>{c.name}</strong><span className="rp-muted small">{c.level} · {c.score}/10</span><p className="small">{N?.priorities?.find((x) => x.id === c.id)?.text || c.workOn}</p></div>)}
            </div>
          </div>
          <p className="rp-ai-note">{N ? 'The narrative in this report was written by Genie from your results and the programme’s standard content.' : 'This report uses the programme’s standard content for each level, chosen from your results.'}</p>
        </Section>
      )}

      {on('howToRead') && (
        <Section n={num()} id="read" title="How to read this report">
          <div className="rp-two">
            <div className="stack-sm"><p>{dev.purpose}</p><p className="rp-muted small">{dev.method}</p></div>
            <ol className="rp-steps">
              <li><strong>Read the summary and your profile</strong> for the overall picture.</li>
              <li><strong>Look at the evidence</strong> behind each competency: what you did, and what the next level looks like.</li>
              <li><strong>Choose one or two priorities</strong> and turn them into the development plan at the end.</li>
              <li><strong>Discuss it</strong> with your manager or coach using the conversation guide.</li>
            </ol>
          </div>
          <table className="rp-scale-table">
            <thead><tr><th scope="col">Level</th><th scope="col">Score</th><th scope="col">What it means</th></tr></thead>
            <tbody>{dev.scale.map((l, i) => <tr key={l.label}><td><LevelChip index={i} label={l.label} /></td><td className="num">{l.min} to {l.max}</td><td>{T(l.definition)}</td></tr>)}</tbody>
          </table>
        </Section>
      )}

      {on('profile') && dev.comps.length > 0 && (
        <Section n={num()} id="profile" title="Competency profile" intro="Your score for each competency on the 0 to 10 scale, against the five proficiency levels.">
          <div className="rp-profile" role="img" aria-label={dev.comps.map((c) => `${c.name} ${c.score}, ${c.level}`).join('; ')}>
            <div className="rp-profile-head"><span />{dev.scale.map((l, i) => <span key={l.label} className={`lv-${LEVEL_TONES[i]}`}>{l.label}</span>)}</div>
            {dev.comps.map((c) => {
              const b = bench?.comps?.find((x) => x.id === c.id)?.score;
              return (
                <div key={c.id} className="rp-profile-row">
                  <span className="rp-profile-name">{c.name}</span>
                  <span className="rp-profile-track">
                    {LEVEL_TONES.map((t) => <i key={t} className={`lv-${t}`} />)}
                    <span className={`rp-profile-bar lv-${LEVEL_TONES[c.levelIndex]}`} style={{ width: `${c.score * 10}%` }}><b>{c.score}</b></span>
                    {b !== undefined && b !== null && <span className="rp-profile-bench" style={{ left: `${b * 10}%` }} title={`Benchmark ${b}`} />}
                  </span>
                </div>
              );
            })}
          </div>
          {bench?.comps && <p className="rp-muted small">The grey tick on each row is the benchmark average.</p>}
        </Section>
      )}

      {on('competencies') && dev.comps.length > 0 && (
        <Section n={num()} id="competencies" title="Competency detail" intro="For each competency: what you did in the simulation, what your level looks like, what the next level looks like, and where to focus.">
          <LevelScale bands={dev.scale.length ? dev.scale : bands} />
          <div className="rp-cds">
            {dev.comps.map((c) => (
              <div key={c.id} className={`rp-cd lv-${LEVEL_TONES[c.levelIndex]}`}>
                <div className="rp-cd-head">
                  <ScoreDial score={c.score} index={c.levelIndex} />
                  <div className="grow"><div className="rp-comp-head"><h3>{c.name}</h3><LevelChip index={c.levelIndex} label={c.level} /></div>{c.definition && <p className="rp-muted small">{c.definition}</p>}{c.why && <p className="small rp-why">{c.why}</p>}</div>
                </div>
                <div className="rp-cd-grid">
                  <div className="rp-cd-block evidence">
                    <h4>What we observed</h4>
                    <p className="small">{N?.observed?.[c.id] || T(c.observed)}</p>
                    <ul className="rp-evidence">{c.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
                  </div>
                  <div className="rp-cd-block">
                    <h4>At the {c.level.toLowerCase()} level</h4>
                    <p className="small">{c.looksLike}</p>
                    {c.nextLevel && <><h4>What {c.nextLevel.label.toLowerCase()} looks like</h4><p className="small">{c.nextLevel.looksLike}</p></>}
                  </div>
                  <div className="rp-cd-block kc">
                    <h4>Keep doing</h4><p className="small">{c.keep}</p>
                    <h4>Work on</h4><p className="small">{c.workOn}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p className="rp-footnote">Morale and skill are the two factors that affect performance directly. Adapting your leadership style by reading what each team member needs, and what the situation demands, lifts performance. High performance drives results.</p>
        </Section>
      )}

      {on('objective') && (
        <Section n={num()} id="objective" title="Business results">
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
          {pr.finance && (
            <div className="rp-panel">
              <h3>Profit and loss for the quarter</h3>
              <table className="rp-pnl">
                <tbody>
                  <tr><td>Revenue</td><td className="num">{money(pr.finance.revenue)}</td></tr>
                  <tr><td>Gross profit</td><td className="num">{money(pr.finance.grossProfit)}</td></tr>
                  <tr><td>Team cost</td><td className="num">−{money(pr.finance.teamCost)}</td></tr>
                  <tr><td>Spent on actions</td><td className="num">−{money(pr.finance.actionSpend)}</td></tr>
                  <tr className="total"><td>Operating profit{pr.metric?.id === 'profit' ? ' (your target)' : ''}</td><td className="num">{money(pr.finance.operatingProfit)}{pr.finance.margin !== null ? ` · ${Math.round(pr.finance.margin * 100)}% margin` : ''}</td></tr>
                </tbody>
              </table>
            </div>
          )}
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

      {on('time') && report.time && (report.time.top + report.time.average + report.time.bottom) > 0 && (
        <Section n={num()} id="time" title="Where your time went" intro="The time you spent with top, average and bottom performers. A top or bottom performer was in the top or bottom quarter of the team that week.">
          {(() => { const t = report.time; const all = t.top + t.average + t.bottom; return <Split parts={[{ label: 'Top performers', value: t.top / all, tone: 's1' }, { label: 'Average performers', value: t.average / all, tone: 's4' }, { label: 'Bottom performers', value: t.bottom / all, tone: 's2' }]} />; })()}
        </Section>
      )}

      {on('plan') && dev.priorities.length > 0 && (
        <Section n={num()} id="plan" title="Development priorities and plan" intro="Most leadership growth comes from experience on the job, some from learning with others and a little from formal learning (the 70-20-10 principle). Here is a plan for each priority.">
          {dev.priorities.map((c) => (
            <div key={c.id} className="rp-plan">
              <div className="rp-plan-head"><h3>{c.name}</h3><LevelChip index={c.levelIndex} label={c.level} />{c.nextLevel && <span className="rp-muted small">Aim for: {c.nextLevel.label}</span>}</div>
              <p className="small"><strong>Focus:</strong> {c.workOn}</p>
              <div className="rp-plan-grid">
                <div><span className="rp-plan-pct">70%</span><strong>On the job</strong><p className="small">{c.plan.on70}</p></div>
                <div><span className="rp-plan-pct">20%</span><strong>With others</strong><p className="small">{c.plan.social20}</p></div>
                <div><span className="rp-plan-pct">10%</span><strong>Formal learning</strong><p className="small">{c.plan.formal10}</p></div>
              </div>
              {c.products.length > 0 && <div className="rp-products">{c.products.map((pp) => <div key={pp.product} className="rp-product"><span className="rp-kicker-dark">{pp.line} · {pp.product}</span><p className="small">{pp.text}</p></div>)}</div>}
              {c.reflect && <p className="rp-reflect small"><strong>Reflect:</strong> {c.reflect}</p>}
            </div>
          ))}
          {dev.strengths.length > 0 && <p className="small rp-muted">Build on your strengths too: {dev.strengths.map((c) => `${c.name.toLowerCase()} (${c.keep.charAt(0).toLowerCase()}${c.keep.slice(1).replace(/\.$/, '')})`).join('; ')}.</p>}
        </Section>
      )}

      {on('idp') && dev.priorities.length > 0 && (
        <Section n={num()} id="idp" title="Individual development plan" intro={dev.idp.intro}>
          <div className="rp-matrix-wrap">
            <table className="rp-idp">
              <thead><tr><th scope="col">Development goal</th><th scope="col">Actions (70-20-10)</th><th scope="col">Support I need</th><th scope="col">Milestones</th><th scope="col">How I will know</th></tr></thead>
              <tbody>
                {dev.priorities.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.name}</strong><span className="rp-muted small">{c.nextLevel ? `Move from ${c.level.toLowerCase()} towards ${c.nextLevel.label.toLowerCase()} in ${dev.idp.horizon} days.` : `Sustain ${c.level.toLowerCase()} and extend it beyond your own team in ${dev.idp.horizon} days.`}</span></td>
                    <td className="small"><ul><li>{c.plan.on70}</li><li>{c.plan.social20}</li><li>{c.plan.formal10}</li></ul></td>
                    <td className="write" />
                    <td className="small">30 days: <span className="write-line" /><br />60 days: <span className="write-line" /><br />90 days: <span className="write-line" /></td>
                    <td className="write" />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="rp-muted small">Download this report to fill in the blank columns, or copy the plan into your organization's development tool.</p>
        </Section>
      )}

      {on('coaching') && dev.coaching.length > 0 && (
        <Section n={num()} id="coaching" title="Coaching conversation guide" intro="Questions for a conversation with your manager or coach about this report.">
          <ol className="rp-coach">{dev.coaching.map((q, k) => <li key={k}>{q}</li>)}</ol>
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
