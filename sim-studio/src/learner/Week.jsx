// The weekly rhythm: Monday planning (how will you lead each person this week?) and the Friday
// wrap-up (what happened, what it cost, one retrieval question, and a reflection when due).
import { useMemo, useState } from 'react';
import { teamIds, weekOf, stageName, desiredStyle } from '../engine/engine.js';
import { answerRecall } from '../engine/decisions.js';
import { Avatar, EffectChips } from './Moment.jsx';
import { signalsFor, weekSummary } from './model.js';

const STYLE_PLAIN = {
  directing: 'Show them exactly what to do and check in often',
  guiding: 'Explain the why, encourage and guide',
  partnering: 'Involve them and decide together',
  entrusting: 'Give them ownership and step back',
};

export function WeekPlan({ def, state, onStart, xray, group }) {
  const week = weekOf(def, state.day);
  const ids = teamIds(state);
  const last = Object.fromEntries(state.log.intents.filter((i) => i.week === week - 1).map((i) => [i.actorId, i.style]));
  const [styles, setStyles] = useState(() => ({ ...last }));
  const done = ids.filter((id) => styles[id]).length;
  return (
    <div className="lx-overlay" role="dialog" aria-modal="true" aria-label={`Plan week ${week}`}>
      <div className="lx-sheet wide">
        <div className="lx-sheet-head">
          <div>
            <div className="lx-kicker">Monday · week {week} of {def.timeline.weeks}</div>
            <h2>How will you lead each person this week?</h2>
            <p className="muted">{week === 1 ? 'Read what you can see about each person, then choose an approach. You will see how they respond during the week.' : 'Look at what changed last week. People move: the approach that worked may not fit any more.'}{group ? ` Discuss each person as ${group.name} before choosing.` : ''}</p>
          </div>
          <div className="lx-count num">{done}/{ids.length}</div>
        </div>
        <div className="lx-plan-grid">
          {ids.map((id) => {
            const a = state.actors[id];
            const sig = signalsFor(def, state, id);
            const need = desiredStyle(def, a.s, a.m);
            return (
              <div key={id} className={`lx-plan-card ${styles[id] ? 'set' : ''}`}>
                <div className="row nowrap" style={{ '--gap': '10px' }}>
                  <Avatar name={a.name} size={34} />
                  <div className="grow" style={{ minWidth: 0 }}>
                    <strong>{a.name}</strong>
                    <div className="small muted">{stageName(def, a.stage)} · performance {Math.round(a.p)} {sig.trend === 'up' ? '▲' : sig.trend === 'down' ? '▼' : ''} · seems {sig.mood.label.toLowerCase()}</div>
                  </div>
                </div>
                {sig.lines[0] && <p className="lx-signal">"{sig.lines.at(-1).slice(0, 140)}{sig.lines.at(-1).length > 140 ? '…' : ''}"</p>}
                {sig.assessed && <p className="small muted">Your assessment: skill {sig.assessed.s}, morale {sig.assessed.m}</p>}
                {xray && <p className="lx-xray">X-ray: skill {Math.round(a.s)}, morale {Math.round(a.m)}, needs {def.leadership.styles.find((s) => s.id === need)?.name}</p>}
                <div className="lx-style-pick" role="radiogroup" aria-label={`Approach for ${a.name}`}>
                  {def.leadership.styles.map((s) => (
                    <button key={s.id} type="button" role="radio" aria-checked={styles[id] === s.id} className={styles[id] === s.id ? 'on' : ''} style={{ '--c': s.color }} title={STYLE_PLAIN[s.id] || s.definition} onClick={() => setStyles((x) => ({ ...x, [id]: s.id }))}>
                      <strong>{s.name}</strong>
                      <span>{STYLE_PLAIN[s.id] || s.definition}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div className="lx-sheet-foot">
          {week > 1 && Object.keys(last).length > 0 && <button type="button" className="btn ghost" onClick={() => setStyles({ ...last })}>Same as last week</button>}
          <button type="button" className="btn primary lg" disabled={done < ids.length} onClick={() => onStart(styles)}>{done < ids.length ? `${ids.length - done} still to plan` : 'Start the week'}</button>
        </div>
      </div>
    </div>
  );
}

export function WrapUp({ def, state, wrap, onContinue, onUpdate }) {
  const s = useMemo(() => weekSummary(def, state, wrap.week), [def, state, wrap.week]);
  const [picked, setPicked] = useState(null);
  const [reflection, setReflection] = useState('');
  const reflect = (def.learning?.reflection !== false) && (def.learning?.reflections || []).find((r) => r.week === wrap.week);
  const item = wrap.recall;
  const pct = Math.round(s.total.achieved * 100);
  const pace = Math.round((wrap.week / def.timeline.weeks) * 100);
  const answer = (id) => {
    if (picked) return;
    setPicked(id);
    onUpdate((st) => answerRecall(def, st, item, id));
  };
  return (
    <div className="lx-overlay" role="dialog" aria-modal="true" aria-label={`Week ${wrap.week} wrap-up`}>
      <div className="lx-sheet">
        <div className="lx-kicker">Friday · end of week {wrap.week}{wrap.ended ? ' · the quarter is over' : ''}</div>
        <h2>{wrap.ended ? 'The quarter is over' : `Week ${wrap.week} in review`}</h2>
        <div className="lx-wrap-stats">
          <div><span className="lx-big num">{s.conversions.toFixed(1)}</span><span className="small muted">conversions this week</span></div>
          <div><span className="lx-big num">{pct}%</span><span className="small muted">of target, with {pace}% of the quarter gone</span></div>
          <div><span className="lx-big num">{Math.round(s.team.m)}</span><span className="small muted">team morale</span></div>
        </div>
        <div className="lx-progress" aria-label={`${pct}% of target`}><span style={{ width: `${Math.min(100, pct)}%` }} /><i style={{ left: `${pace}%` }} title="On-track pace" /></div>
        <p className="small muted">{pct >= pace ? 'Ahead of the pace you need.' : `Behind pace: you need about ${Math.max(0, 100 - pct)}% more in ${def.timeline.weeks - wrap.week} week${def.timeline.weeks - wrap.week === 1 ? '' : 's'}.`}</p>

        {s.kpis.some((k) => k.delta) && <EffectChips effects={s.kpis.filter((k) => k.delta).map((k) => ({ label: k.label, delta: k.delta }))} />}

        {(s.moments.length > 0 || s.landed.length > 0 || s.quits.length > 0) && (
          <div className="lx-wrap-list">
            <h3>What happened</h3>
            {s.moments.map((m) => <div key={m.id} className="lx-wrap-item"><span className={`lx-band-dot ${m.band}`} aria-hidden="true" /><div><strong>{m.title}</strong><p className="small ink2">{m.reaction}</p></div></div>)}
            {s.landed.map((l, i) => <div key={i} className="lx-wrap-item"><span className="lx-band-dot consequence" aria-hidden="true" /><div><strong>{l.title}</strong><p className="small ink2">{l.text}{l.source ? ` (This goes back to "${l.source}".)` : ''}</p></div></div>)}
            {s.quits.map((q, i) => <div key={`q${i}`} className="lx-wrap-item"><span className="lx-band-dot weak" aria-hidden="true" /><div><strong>{q.title}</strong><p className="small ink2">{q.text}</p></div></div>)}
          </div>
        )}

        {s.movers.some((m) => m.delta) && (
          <div className="lx-movers">
            {s.movers.filter((m) => m.delta).map((m) => <span key={m.id} className={`lx-chip ${m.delta > 0 ? 'up' : 'down'}`}><Avatar name={m.name} size={18} /> {m.name.split(' ')[0]} {m.delta > 0 ? `+${m.delta}` : m.delta} performance</span>)}
          </div>
        )}

        {item && (
          <div className="lx-recall">
            <div className="lx-kicker">Quick recall</div>
            <p><strong>{item.q}</strong></p>
            <div className="lx-recall-opts">
              {item.options.map((o) => (
                <button key={o.id} type="button" disabled={!!picked} className={`lx-option ${picked ? (o.id === item.answer ? 'right' : o.id === picked ? 'wrong' : '') : ''}`} onClick={() => answer(o.id)}>{o.text}</button>
              ))}
            </div>
            {picked && <p className="small">{picked === item.answer ? 'Right. ' : 'Not quite. '}{item.explain}</p>}
          </div>
        )}

        {reflect && (
          <div className="lx-reflect">
            <div className="lx-kicker">Reflect</div>
            <p><strong>{reflect.prompt}</strong></p>
            <textarea className="textarea" rows={3} value={reflection} onChange={(e) => setReflection(e.target.value)} placeholder="A sentence or two is enough. Only you see this, in your debrief." />
          </div>
        )}

        <div className="lx-sheet-foot">
          <button type="button" className="btn primary lg" disabled={!!item && !picked} onClick={() => onContinue(reflect ? { prompt: reflect.prompt, text: reflection } : null)}>
            {item && !picked ? 'Answer the recall question first' : wrap.ended ? 'See your debrief' : `Start week ${wrap.week + 1}`}
          </button>
        </div>
      </div>
    </div>
  );
}
