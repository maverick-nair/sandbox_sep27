// The end of the quarter: what happened, why, and what to do next. Scores and badges support the
// story; they do not replace it.
import { useMemo, useState } from 'react';
import { LineChart, Histogram, BarList, Ring, SERIES } from '../studio/charts.jsx';
import { Avatar } from './Moment.jsx';

const BAND = { strong: 'Landed well', mixed: 'Partly landed', weak: 'Did not land' };

export default function Debrief({ def, d, benchmark = [], leaderboard = [], delivery = {}, onReplay, onFinish, finished, mode, you }) {
  const [practice, setPractice] = useState({});
  const weeks = def.timeline.weeks;
  const pace = Array.from({ length: weeks }, (_, i) => Math.round((def.funnel.target * (i + 1) / weeks) * 10) / 10);
  const bins = useMemo(() => {
    if (!benchmark.length) return null;
    const b = Array.from({ length: 10 }, (_, i) => ({ label: `${i * 10}`, value: 0 }));
    for (const s of benchmark) b[Math.min(9, Math.floor(s / 10))].value += 1;
    return b;
  }, [benchmark]);
  const percentile = benchmark.length ? Math.round((benchmark.filter((s) => s < d.overall.score).length / benchmark.length) * 100) : null;
  const tier = d.overall.tier;
  const recallQs = d.reinforce.map((c) => c.id);

  return (
    <div className="lx-debrief">
      <section className="lx-hero-debrief">
        <div className="grow">
          <div className="lx-kicker">End of the quarter{d.identity?.name ? ` · ${d.identity.name}` : ''}</div>
          <h1>{d.headline}</h1>
          <p className="ink2">{d.progress.conversions.toFixed(1)} of {d.progress.target} conversions · team morale {Math.round(d.team.start.m)} → {Math.round(d.team.end.m)}{d.left.length ? ` · ${d.left.join(', ')} left the team` : ' · nobody left the team'}</p>
          <div className="row" style={{ marginTop: 10 }}>
            <span className={`lx-tier ${tier.id}`}>{tier.label}</span>
            {def.gamification?.xp !== false && <span className="lx-chip">{d.xp} XP</span>}
            {percentile !== null && <span className="lx-chip">Better than {percentile}% of practice runs</span>}
          </div>
        </div>
        <Ring value={d.overall.score} size={132} label="Overall score" sub="out of 100" />
      </section>

      <section className="lx-card">
        <h2>How your score is made</h2>
        <BarList rows={[
          { label: 'Business results', value: d.overall.parts.results, note: `Weight ${d.overall.weights.results}%` },
          { label: 'Leadership of the team', value: d.overall.parts.leadership, note: `Weight ${d.overall.weights.leadership}%` },
          { label: 'Quality of your decisions', value: d.overall.parts.decisions, note: `Weight ${d.overall.weights.decisions}%` },
          { label: 'Recall of key ideas', value: d.overall.parts.recall, note: `Weight ${d.overall.weights.recall}%` },
        ]} />
      </section>

      <section className="lx-card">
        <h2>What happened</h2>
        <ol className="lx-story">
          {d.story.map((s, i) => (
            <li key={i} className={`lx-story-item ${s.kind}`}>
              <span className="lx-story-week">Week {s.week}</span>
              <span className={`lx-band-dot ${s.band || (s.kind === 'consequence' ? 'consequence' : s.kind === 'team' ? 'weak' : 'mixed')}`} aria-hidden="true" />
              <div><strong>{s.title}</strong>{s.text && <p className="small ink2">{s.text}</p>}</div>
            </li>
          ))}
        </ol>
      </section>

      <section className="lx-card">
        <h2>Business impact</h2>
        <LineChart title="Conversions over the quarter" xLabels={d.cumulative.map((_, i) => `W${i + 1}`)} series={[{ label: 'You', color: SERIES[0], values: d.cumulative }, { label: 'On-track pace', color: SERIES[3], values: pace }]} reference={{ label: 'Target', value: def.funnel.target }} />
        <div className="lx-kpi-row">
          {[{ label: 'Team morale', start: d.team.start.m, end: d.team.end.m }, { label: 'Team performance', start: d.team.start.p, end: d.team.end.p }, ...d.kpis].map((k) => (
            <div key={k.label} className="lx-kpi-end">
              <span className="small muted">{k.label}</span>
              <span className="num"><strong>{Math.round(k.start)} → {Math.round(k.end)}</strong> <span className={k.end >= k.start ? 'up' : 'down'}>{k.end >= k.start ? '▲' : '▼'} {Math.abs(Math.round(k.end - k.start))}</span></span>
            </div>
          ))}
        </div>
      </section>

      <section className="lx-card">
        <h2>Your key decisions</h2>
        <div className="lx-decisions">
          {d.keyDecisions.map((k) => (
            <details key={k.id} className={`lx-decision band-${k.band}`}>
              <summary><span className={`lx-band-dot ${k.band}`} aria-hidden="true" /><span className="grow"><strong>Week {k.week}: {k.title}</strong><span className="small muted"> · {BAND[k.band]} · {k.score}</span></span></summary>
              <p className="small"><span className="muted">You: </span>{k.chose}</p>
              {k.reaction && <p className="small"><span className="muted">Reaction: </span>{k.reaction}</p>}
              {k.effects.length > 0 && <p className="small"><span className="muted">Effect: </span>{k.effects.map((e) => `${e.label} ${e.delta > 0 ? '+' : ''}${e.delta}`).join(', ')}</p>}
              {k.feedback && <p className="small ink2">{k.feedback}</p>}
            </details>
          ))}
        </div>
      </section>

      {d.criteria.length > 0 && (
        <section className="lx-card">
          <h2>How you reasoned</h2>
          <p className="small muted">Across your written responses, scored against the criteria your programme set.</p>
          <BarList rows={d.criteria.map((c) => ({ label: c.label, value: c.score, color: c.score >= 70 ? 'var(--series-3)' : c.score >= 40 ? 'var(--series-1)' : 'var(--series-2)' }))} />
          {d.best && <blockquote className="lx-quote"><p>"{String(d.best.text).slice(0, 320)}"</p><footer className="small muted">Your strongest reply: {d.best.title} ({d.best.score})</footer></blockquote>}
        </section>
      )}

      <section className="lx-two">
        <div className="lx-card">
          <h2>Strengths you showed</h2>
          {d.strengths.length ? d.strengths.map((s) => <p key={s.label}><strong>{s.label}.</strong> <span className="small ink2">{s.text}</span></p>) : <p className="small muted">No clear strengths yet. Your replay is where they start.</p>}
        </div>
        <div className="lx-card">
          <h2>Where to grow</h2>
          {d.improve.length ? d.improve.map((s) => <p key={s.label}><strong>{s.label}.</strong> <span className="small ink2">{s.text}</span></p>) : <p className="small muted">Nothing below the bar. Try the Challenging level.</p>}
        </div>
      </section>

      <section className="lx-card">
        <h2>Your leadership styles</h2>
        <BarList rows={d.styles.map((s) => ({ label: s.name, value: Math.round(s.adaptability * 100), note: s.text, color: def.leadership.styles.find((x) => x.id === s.id)?.color }))} format={(v) => `${v}%`} title="How often you used each style when it was needed" />
        <p className="small muted">How often you chose each style when a person needed it.</p>
      </section>

      {d.reinforce.length > 0 && (
        <section className="lx-card">
          <h2>Worth reinforcing</h2>
          <p className="small muted">Retrieval beats rereading. One quick question on each idea that tripped you up:</p>
          {d.reinforce.map((c) => {
            const q = RECALL[c.id] || RECALL.default(c);
            const pick = practice[c.id];
            return (
              <div key={c.id} className="lx-recall">
                <div className="lx-kicker">{c.label}</div>
                <p><strong>{q.q}</strong></p>
                <div className="lx-recall-opts">{q.options.map((o, i) => <button key={o} type="button" disabled={pick !== undefined} className={`lx-option ${pick !== undefined ? (i === q.answer ? 'right' : i === pick ? 'wrong' : '') : ''}`} onClick={() => setPractice((p) => ({ ...p, [c.id]: i }))}>{o}</button>)}</div>
                {pick !== undefined && <p className="small">{q.explain}</p>}
              </div>
            );
          })}
          {recallQs.length === 0 && null}
        </section>
      )}

      <section className="lx-card">
        <h2>Back at work</h2>
        <ul className="lx-transfer">{d.transfer.map((t) => <li key={t}>{t}</li>)}</ul>
        <h3 style={{ marginTop: 14 }}>Recommended next</h3>
        <div className="lx-next">
          {d.next.map((n, i) => <div key={i} className="lx-next-card"><span className="lx-kicker">{n.product}</span><p className="small">{n.text}</p>{n.concept && <span className="small muted">For: {n.concept}</span>}</div>)}
        </div>
      </section>

      {(def.gamification?.achievements !== false || bins || (delivery.leaderboard && leaderboard.length)) && (
        <section className="lx-two">
          {def.gamification?.achievements !== false && (
            <div className="lx-card">
              <h2>Achievements</h2>
              <div className="lx-badges">
                {d.achievements.map((a) => <div key={a.id} className={`lx-badge ${a.earned ? 'on' : ''}`} title={a.note}><span className="lx-badge-mark" aria-hidden="true">{a.earned ? '★' : '☆'}</span><strong>{a.label}</strong><span className="small muted">{a.note}</span></div>)}
              </div>
            </div>
          )}
          <div className="lx-card">
            {bins && (
              <>
                <h2>How you compare</h2>
                <Histogram title="Scores of practice runs" bins={bins} marker={Math.min(9, Math.floor(d.overall.score / 10))} valueLabel="practice runs" />
                <p className="small muted">{benchmark.length} practice runs by synthetic learners of mixed ability, played on this exact simulation.</p>
              </>
            )}
            {delivery.leaderboard && leaderboard.length > 0 && <Leaderboard rows={leaderboard} you={you} delivery={delivery} />}
          </div>
        </section>
      )}

      {d.reflections.some((r) => r.text) && (
        <section className="lx-card">
          <h2>Your reflections</h2>
          {d.reflections.filter((r) => r.text).map((r, i) => <div key={i} className="lx-reflection"><span className="small muted">Week {r.week}: {r.prompt}</span><p>{r.text}</p></div>)}
        </section>
      )}

      <div className="lx-debrief-foot">
        <button type="button" className="btn" onClick={() => onReplay(false)}>Play again</button>
        <button type="button" className="btn" onClick={() => onReplay(true)}>Replay on Challenging</button>
        {!finished && <button type="button" className="btn primary lg" onClick={onFinish}>{mode === 'preview' ? 'Close preview' : 'Finish and save my result'}</button>}
        {finished && <span className="lx-chip up">Result saved</span>}
      </div>
    </div>
  );
}

export function Leaderboard({ rows, you, delivery }) {
  const metric = delivery.leaderboardMetric || 'score';
  const label = { score: 'Score', conversions: 'Conversions', xp: 'XP' }[metric];
  const name = (r) => (delivery.leaderboardNames === 'anonymous' ? (r.id === you ? 'You' : 'A colleague') : delivery.leaderboardNames === 'initials' ? String(r.nickname || r.name || '?').split(/\s+/).map((p) => p[0]).join('.').toUpperCase() : r.nickname || r.name || 'Anonymous');
  const sorted = [...rows].sort((a, b) => (b[metric] ?? 0) - (a[metric] ?? 0));
  const top = sorted.slice(0, delivery.leaderboardSize || 10);
  const rank = sorted.findIndex((r) => r.id === you);
  return (
    <div>
      <h2>Leaderboard</h2>
      <ol className="lx-board">
        {top.map((r, i) => (
          <li key={r.id} className={r.id === you ? 'you' : ''}>
            <span className="num lx-rank-num">{i + 1}</span>
            <Avatar name={name(r)} size={24} />
            <span className="grow">{name(r)}{r.group ? <span className="small muted"> · {r.group}</span> : null}</span>
            <span className="num"><strong>{metric === 'conversions' ? Number(r[metric]).toFixed(1) : r[metric]}</strong> <span className="small muted">{label}</span></span>
          </li>
        ))}
      </ol>
      {rank >= (delivery.leaderboardSize || 10) && <p className="small muted">You are number {rank + 1} of {sorted.length}.</p>}
    </div>
  );
}

// One retrieval question per concept, for the debrief.
const RECALL = {
  'match-style': { q: 'Someone has low skill but is keen and energetic. What do they need most?', options: ['Clear explanation and encouragement (Guiding)', 'Freedom to work it out alone (Entrusting)', 'Close supervision and firm deadlines'], answer: 0, explain: 'High morale with low skill needs Guiding: explain the why, show the way and keep the energy up.' },
  diagnose: { q: 'What should you read before choosing how to lead someone on a task?', options: ['Their skill and their morale for that task', 'Their seniority', 'Their results last quarter'], answer: 0, explain: 'Style follows skill and morale for the task in front of them, and both change over time.' },
  feedback: { q: 'Which makes feedback most useful to someone who is struggling?', options: ['A specific example, its impact and hands-on help with next steps', 'A general warning to improve', 'Keeping it light so they are not upset'], answer: 0, explain: 'Specific behaviour, its impact, listening, and a concrete plan with a check-in.' },
  stakeholder: { q: 'What does a strong update to your manager include?', options: ['Where you are, why, your plan, what you need and by when', 'Reassurance that the team is working hard', 'A list of everything that went wrong'], answer: 0, explain: 'Numbers, cause, plan, ask and timeline: the five things a manager needs to back you.' },
  conflict: { q: 'Two people want the same opportunity. What usually works best?', options: ['A fair solution that uses both strengths and develops someone', 'First come, first served', 'Take it over yourself'], answer: 0, explain: 'Fair, transparent decisions that turn the conflict into development keep trust intact.' },
  prioritise: { q: 'Work is piling up in one stage. What fixes it?', options: ['Skill, capacity and input quality in that stage', 'More effort from everyone', 'A lower target'], answer: 0, explain: 'Fix the bottleneck where it forms.' },
  recognise: { q: 'When is recognition most effective?', options: ['Soon after the good work, specific and in front of peers', 'At the end of the quarter', 'Only for the top performer'], answer: 0, explain: 'Timely, specific recognition reinforces the behaviour you want to see again.' },
  delegate: { q: 'An expert on your team is bored. What helps most?', options: ['Ownership of something meaningful, with freedom to run it', 'Closer supervision', 'A bigger target'], answer: 0, explain: 'High skill and high morale want Entrusting: the big picture and room to act.' },
  default: (c) => ({ q: `Which statement best reflects "${c.label}"?`, options: ['Adapt to the person and the moment', 'Treat everyone the same way', 'Wait until the end of the quarter'], answer: 0, explain: 'Adaptive leadership starts with reading the person and the situation.' }),
};
