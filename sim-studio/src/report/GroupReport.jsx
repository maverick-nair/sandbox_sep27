// The group report for a cohort or an organization. It follows the original iLead group report:
// competency proficiency against a benchmark, the percentage distribution, completion, business
// achievement, skill, morale and performance, style adaptability, preferences and distribution,
// consistency, the sales funnel, actions, management style and the key takeaway questions.
import { forwardRef } from 'react';
import { renderText } from '../engine/text.js';
import { groupInsights, LEVELS } from '../engine/group.js';
import { Section, Defs, Note, LevelScale, LevelChip, Donut, TargetBar, GroupedBars, Deviation, StyleGrid, Meter, ImpactLegend, Lines, Split, Columns, Tile, bandIndex, impactTone, pct, LEVEL_TONES } from './parts.jsx';
import { ReportCover, moneyFormat } from './LeadershipReport.jsx';

const edge = (v) => (v >= 8.6 ? 'edge-r' : v <= 1.4 ? 'edge-l' : '');

const GroupReport = forwardRef(function GroupReport({ def, group, bench, benchLabel = 'Benchmark', benchNote, title = 'Group report', subtitle, ideal, date }, ref) {
  const G = def.report.group || {};
  const on = (k) => G.sections?.[k] !== false;
  const T = (t, v) => renderText(def, t || '', v);
  const I = G.intro || {};
  const N = G.notes || {};
  const money = moneyFormat(def);
  const compact = new Intl.NumberFormat('en', { style: 'currency', currency: def.funnel.currency || 'USD', notation: 'compact', maximumFractionDigits: 2 });
  const ins = groupInsights(def, group);
  const styleDef = (id) => def.leadership.styles.find((s) => s.id === id) || {};
  const bands = def.report.competencies[0]?.bands || LEVELS.map((l, i) => ({ label: l, min: i * 2, max: i * 2 + 2 }));
  const b = bench?.n ? bench : null;
  const targetRevenue = def.funnel.target * (def.funnel.valuePerConversion || 0);
  const compOf = (set, id) => set?.comps?.find((c) => c.id === id);
  let n = 0;
  const num = () => (n += 1);

  return (
    <article className="rp" ref={ref} style={{ '--rp-brand': def.look?.brand || undefined }}>
      <ReportCover def={def} kicker={`${T('{{company}}')} · ${def.meta?.name || 'iLead'}`} title={title} who={subtitle} meta={[date, `${group.n} learner${group.n === 1 ? '' : 's'}`, b ? `Compared with ${benchNote || `${b.n} learners`}` : 'No benchmark yet']} />
      {G.cover && <p className="rp-about">{T(G.cover, { n: group.n })}</p>}
      {G.aboutReport?.length > 0 && <ul className="rp-bullets rp-about-list">{G.aboutReport.map((t, i) => <li key={i}>{T(t)}</li>)}</ul>}

      <div className="rp-tiles">
        <Tile label="Learners" value={group.n} sub={`${pct(group.finished)} finished the quarter`} />
        <Tile label="Average conversions" value={group.avgConversions} sub={b ? `${benchLabel}: ${b.avgConversions}` : `target ${def.funnel.target}`} />
        <Tile label="Over-achievers" value={pct(group.overAchievers)} sub="beat the target" tone={group.overAchievers >= 0.3 ? 'good' : undefined} />
        <Tile label="Adaptability" value={pct(group.adapt, 1)} sub={b ? `${benchLabel}: ${pct(b.adapt, 1)}` : 'right style for the person'} />
      </div>

      {on('competencies') && (
        <Section n={num()} id="g-competencies" title="Competency proficiency levels" intro={T(I.competencies)}>
          <Defs items={[['Group', T(I.group)], [benchLabel, b ? T(I.benchmark) : '']]} />
          <LevelScale bands={bands} />
          <div className="rp-gcomps">
            {group.comps.map((c) => {
              const bc = compOf(b, c.id);
              const i = bandIndex(c.score ?? 0);
              return (
                <div key={c.id} className="rp-gcomp">
                  <div className="rp-comp-head"><h3>{c.name}</h3>{c.score !== null && <LevelChip index={i} label={bands[i]?.label} />}</div>
                  {G.competencies?.[c.id]?.description && <p className="rp-muted small">{T(G.competencies[c.id].description)}</p>}
                  <div className="rp-vs" role="img" aria-label={`${c.name}: group ${c.score}${bc ? `, ${benchLabel.toLowerCase()} ${bc.score}` : ''} out of 10`}>
                    <div className="rp-vs-track">{LEVEL_TONES.map((t) => <span key={t} className={`lv-${t}`} />)}</div>
                    {c.score !== null && <span className={`rp-vs-mark group ${edge(c.score)}`} style={{ left: `${c.score * 10}%` }}><span>Group {c.score}</span></span>}
                    {bc?.score !== null && bc && <span className={`rp-vs-mark bench ${edge(bc.score)}`} style={{ left: `${bc.score * 10}%` }}><span>{benchLabel} {bc.score}</span></span>}
                  </div>
                  {ins.comps[c.id] && <p className="rp-insight small">{ins.comps[c.id]}</p>}
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {on('distribution') && (
        <Section n={num()} id="g-distribution" title="Percentage distribution" intro={T(I.distribution)}>
          <div className="rp-matrix-wrap" tabIndex={0} aria-label="Percentage of the group at each proficiency level">
            <table className="rp-pgrid">
              <thead><tr><th scope="col">Level</th>{group.comps.map((c) => <th key={c.id} scope="col">{c.name}</th>)}</tr></thead>
              <tbody>
                {[4, 3, 2, 1, 0].map((li) => (
                  <tr key={li}>
                    <th scope="row"><LevelChip index={li} label={bands[li]?.label || LEVELS[li]} /></th>
                    {group.comps.map((c) => { const v = c.dist[li]; return <td key={c.id}><span className="rp-pct" style={{ '--a': Math.min(1, v / 60) }}>{v}%</span></td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Note items={N.distribution?.map((t) => T(t))} />
        </Section>
      )}

      {on('completion') && (
        <Section n={num()} id="g-completion" title="Completion rate" intro={T(I.completion)}>
          <Columns rows={group.completion.map((c) => ({ label: c.label, value: c.value, tone: 'accent' }))} label="Share of learners by how much of the quarter they played" />
          <p className="rp-muted small center">Share of learners by how much of the quarter they played</p>
          <Note items={N.completion?.map((t) => T(t))} />
        </Section>
      )}

      {on('business') && (
        <Section n={num()} id="g-business" title="Business achievement" intro={T(I.business)}>
          <Defs items={[['Conversions', T(I.conversions)], ['Revenue', T(I.revenue)]]} />
          <div className="rp-two">
            <div className="rp-panel">
              <h3>Maximum revenue achieved</h3>
              <p className="rp-muted small">{T(I.maxRevenue)}</p>
              <TargetBar actual={group.maxRevenue} target={targetRevenue} format={money} actualLabel="Best in the group" targetLabel="Target revenue" />
            </div>
            <div className="rp-panel rp-over">
              <h3>Over-achievers</h3>
              <p className="rp-muted small">{T(I.overAchievers)}</p>
              <strong className="rp-big">{pct(group.overAchievers)}</strong>
              {b && <span className="rp-muted small">{benchLabel}: {pct(b.overAchievers)}</span>}
            </div>
          </div>
          <div className="rp-panel">
            <h3>Average conversions and revenue</h3>
            <p className="rp-muted small">{T(I.averages)}</p>
            <div className="rp-two tight">
              <GroupedBars label="Average conversions" groups={[{ label: 'Conversions', values: b ? [group.avgConversions, b.avgConversions] : [group.avgConversions] }]} series={b ? [{ label: 'Group', tone: 'accent' }, { label: benchLabel, tone: 'bench' }] : [{ label: 'Group', tone: 'accent' }]} format={(v) => v.toFixed(1)} height={160} />
              <GroupedBars label="Average revenue" groups={[{ label: 'Revenue', values: b ? [group.avgRevenue, b.avgRevenue] : [group.avgRevenue] }]} series={b ? [{ label: 'Group', tone: 'accent' }, { label: benchLabel, tone: 'bench' }] : [{ label: 'Group', tone: 'accent' }]} format={(v) => compact.format(v)} height={160} />
            </div>
          </div>
        </Section>
      )}

      {on('smp') && (
        <Section n={num()} id="g-smp" title="Skill, morale and performance" intro={T(I.smp)}>
          <GroupedBars label="Average skill, morale and performance at the end of the quarter" groups={[{ label: 'Group', values: [group.smpEnd.s, group.smpEnd.m, group.smpEnd.p] }, ...(b ? [{ label: benchLabel, values: [b.smpEnd.s, b.smpEnd.m, b.smpEnd.p] }] : []), { label: 'At the start', values: [group.smpStart.s, group.smpStart.m, group.smpStart.p] }]} series={[{ label: 'Skill', tone: 's1' }, { label: 'Morale', tone: 's2' }, { label: 'Performance', tone: 's3' }]} max={100} height={200} />
          <Note items={N.smp?.map((t) => T(t))} />
        </Section>
      )}

      {on('adaptability') && (
        <Section n={num()} id="g-adapt" title="Leadership style adaptability" intro={T(I.adaptability)}>
          <div className="rp-adapt">
            <div className="rp-donuts">
              <Donut value={group.adapt} label="Group" tone="accent" />
              {b && <Donut value={b.adapt} label={benchLabel} tone="bench" />}
            </div>
            <Note title="Reflect" items={N.adaptability?.map((t) => T(t))} />
          </div>
        </Section>
      )}

      {on('preferences') && (
        <Section n={num()} id="g-pref" title="Leadership style preferences" intro={[T(I.styles), T(I.preferences)].filter(Boolean)}>
          <div className="rp-two">
            <Columns rows={group.styles.map((s) => ({ label: s.name, value: Math.round(s.preferredBy * 1000) / 10, tone: `style-${s.id}` }))} label="Share of learners whose most used style was each style" />
            {ins.preference && <p className="rp-callout small">{ins.preference}</p>}
          </div>
          <p className="rp-muted small">Share of learners whose most used style was each style.</p>
        </Section>
      )}

      {on('quadrant') && (
        <Section n={num()} id="g-quadrant" title="Leadership styles distribution" intro={T(I.quadrant)}>
          <Defs items={[['Proportion', T(I.proportion)], ['Accuracy', T(I.accuracy)]]} />
          <StyleGrid styles={group.styles.map((s) => ({ ...s, skill: styleDef(s.id).skill, morale: styleDef(s.id).morale }))} render={(s) => {
            const bs = b?.styles?.find((x) => x.id === s.id);
            return (
              <>
                <div className="rp-cell-head"><strong style={{ color: styleDef(s.id).color }}>{s.name}</strong><span className="rp-muted small">Proportion {pct(s.proportion, 1)}</span></div>
                <p className="small">{T(G.styleDescriptions?.[s.id], { style: s.name })}</p>
                <Meter label="Accuracy" value={s.accuracy} color={styleDef(s.id).color} />
                {bs && <Meter label={benchLabel} value={bs.accuracy} color="var(--rp-bench)" />}
                {ins.styles[s.id] && <p className="rp-insight small">{ins.styles[s.id]}</p>}
              </>
            );
          }} />
        </Section>
      )}

      {on('consistency') && (
        <Section n={num()} id="g-consistency" title="Leadership styles consistency" intro={T(I.consistency)}>
          <Defs items={[['Desired style', T(I.desired)], ['Intended style', T(I.intended)], ['Actual style', T(I.actual)]]} />
          <div className="rp-devs">
            {[['desiredVsActual', 'desired-vs-actual', 'Desired', 'Actual'], ['intentVsActual', 'intent-vs-actual', 'Intended', 'Actual'], ['desiredVsIntent', 'desired-vs-intent', 'Desired', 'Intended']].map(([k, id, x, y]) => (
              <div key={k} className="rp-devrow">
                <h3>{x} vs {y.toLowerCase()}</h3>
                <Deviation from={`${x} style`} to={`${y} style`} value={group.cons[k]} bench={b?.cons?.[k]} />
                <div className="rp-two tight">
                  <p className="rp-muted small">{T(G.consistency?.[id]?.description)}{b?.cons?.[k] !== null && b ? ` The grey tick is the ${benchLabel.toLowerCase()} (${b.cons[k]}%).` : ''}</p>
                  <p className="rp-insight small">{ins.cons[k]}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {on('funnel') && (
        <Section n={num()} id="g-funnel" title="Sales funnel" intro={T(I.funnel)}>
          <Defs items={[['Ideal progression', `${T(I.ideal)} Here: an expert's run of this simulation.`], ['Actual progression', T(I.progression)]]} />
          <Lines weeks={def.timeline.weeks} series={[...(ideal ? [{ label: 'Ideal progression', tone: 's3', values: ideal }] : []), { label: 'Group (average)', tone: 'accent', values: group.cumulative }, ...(b ? [{ label: benchLabel, tone: 'bench', dash: true, values: b.cumulative }] : [])]} />
          <Note items={N.funnel?.map((t) => T(t))} />
        </Section>
      )}

      {on('actions') && (
        <Section n={num()} id="g-actions" title="Actions" intro={T(I.actions)}>
          <ImpactLegend />
          <div className="rp-lolli">
            {(() => {
              const max = Math.max(1, ...group.actions.map((a) => a.count));
              return group.actions.map((a) => (
                <div key={a.id} className="rp-lolli-row">
                  <span className="rp-lolli-label">{a.name}</span>
                  <span className="rp-lolli-track"><span className="rp-lolli-stem" style={{ width: `${(a.count / max) * 100}%` }} /><span className={`rp-lolli-dot im-${impactTone(a.impact)}`} style={{ left: `${(a.count / max) * 100}%` }} title={`${a.impact} impact`} /></span>
                  <span className="rp-lolli-val"><strong>{a.count}</strong> <span className="rp-muted small">{a.perLearner} each</span></span>
                </div>
              ));
            })()}
          </div>
          <Note items={N.actions?.map((t) => T(t))} />
        </Section>
      )}

      {on('time') && (
        <Section n={num()} id="g-time" title="Management style" intro={T(I.time)}>
          <Defs items={[['Top performers', T(I.top)], ['Average performers', T(I.average)], ['Bottom performers', T(I.bottom)]]} />
          <div className="rp-two">
            <Split parts={[{ label: 'Top performers', value: group.time.top, tone: 's1', note: b ? `${benchLabel} ${pct(b.time.top, 1)}` : '' }, { label: 'Average performers', value: group.time.average, tone: 's4', note: b ? `${benchLabel} ${pct(b.time.average, 1)}` : '' }, { label: 'Bottom performers', value: group.time.bottom, tone: 's2', note: b ? `${benchLabel} ${pct(b.time.bottom, 1)}` : '' }]} />
            <Note items={N.time?.map((t) => T(t))} />
          </div>
        </Section>
      )}

      {on('questions') && G.questions?.length > 0 && (
        <Section n={num()} id="g-questions" title="Key takeaways" intro={T(I.takeaways)}>
          <div className="rp-qcards">
            {G.questions.filter((q) => q.items?.some(Boolean)).map((q, i) => (
              <div key={i} className="rp-qcard">
                <h3>{q.title}</h3>
                <ul>{q.items.filter(Boolean).map((t, k) => <li key={k}>{T(t)}</li>)}</ul>
              </div>
            ))}
          </div>
        </Section>
      )}
    </article>
  );
});

export default GroupReport;
