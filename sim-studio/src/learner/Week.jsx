// The weekly rhythm: Monday planning (how will you lead each person this week?) and the Friday
// wrap-up (what happened, what it cost, one retrieval question, and a reflection when due).
import { useEffect, useMemo, useState } from 'react';
import { renderText } from '../engine/text.js';
import { STYLE_PLAIN } from './Prologue.jsx';
import { teamIds, weekOf, stageName, desiredStyle } from '../engine/engine.js';
import { answerRecall } from '../engine/decisions.js';
import { Avatar, EffectChips } from './Moment.jsx';
import { signalsFor, weekSummary } from './model.js';

// Monday: one person at a time, like a deck. Read the card, play a style from your hand, and the
// next person comes up. "See everyone" shows the whole team at once for quick later weeks.
export function WeekPlan({ def, state, onStart, xray, group }) {
  const week = weekOf(def, state.day);
  const ids = teamIds(state);
  const last = Object.fromEntries(state.log.intents.filter((i) => i.week === week - 1).map((i) => [i.actorId, i.style]));
  const [styles, setStyles] = useState(() => ({ ...last }));
  const [at, setAt] = useState(0);
  const [grid, setGrid] = useState(false);
  const [played, setPlayed] = useState(null);
  const done = ids.filter((id) => styles[id]).length;
  const styleOf = (id) => def.leadership.styles.find((x) => x.id === id);
  const choose = (id, sid) => {
    setStyles((x) => ({ ...x, [id]: sid }));
    if (grid) return;
    setPlayed(sid);
    setTimeout(() => {
      setPlayed(null);
      const next = ids.findIndex((x, k) => k > ids.indexOf(id) && !styles[x] && x !== id);
      const wrap = ids.findIndex((x) => !styles[x] && x !== id);
      setAt(next >= 0 ? next : wrap >= 0 ? wrap : ids.indexOf(id));
    }, 420);
  };
  useEffect(() => {
    if (grid) return undefined;
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select')) return;
      if (e.key === 'ArrowRight') setAt((k) => Math.min(ids.length - 1, k + 1));
      if (e.key === 'ArrowLeft') setAt((k) => Math.max(0, k - 1));
      const n = Number(e.key);
      if (n >= 1 && n <= def.leadership.styles.length) choose(ids[at], def.leadership.styles[n - 1].id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const id = ids[at];
  const a = state.actors[id];
  const sig = signalsFor(def, state, id);
  const need = desiredStyle(def, a.s, a.m);
  const src = def.actors.find((x) => x.id === id);
  const first = week === 1;

  return (
    <div className="lx-overlay lx-plan-overlay" role="dialog" aria-modal="true" aria-label={`Plan week ${week}`}>
      <div className="lx-sheet wide lx-plan-sheet">
        <div className="lx-sheet-head">
          <div>
            <div className="lx-kicker">Monday · week {week} of {def.timeline.weeks}</div>
            <h2>{first ? 'How will you read each person this week?' : 'How will you lead each person this week?'}</h2>
            <p className="muted">{first ? 'Look at what you know about each person and play the style that fits their skill and morale right now. You will see how they respond during the week.' : 'Look at what changed last week. People move: the style that worked may not fit any more.'}{group ? ` Discuss each person as ${group.name} before choosing.` : ''}</p>
          </div>
          <div className="lx-count num" aria-label={`${done} of ${ids.length} planned`}>{done}/{ids.length}</div>
        </div>

        <div className="lx-plan-strip" role="tablist" aria-label="Team">
          {ids.map((x, k) => {
            const st = styleOf(styles[x]);
            return (
              <button key={x} type="button" role="tab" aria-selected={!grid && k === at} className={`lx-strip-person ${!grid && k === at ? 'on' : ''} ${st ? 'set' : ''}`} style={{ '--c': st?.color }} onClick={() => { setGrid(false); setAt(k); }} title={`${state.actors[x].name}${st ? `: ${st.name}` : ''}`}>
                <Avatar name={state.actors[x].name} size={30} />
                <span className="lx-strip-mark" aria-hidden="true">{st ? st.name.slice(0, 1) : ''}</span>
              </button>
            );
          })}
          <button type="button" className="btn ghost sm lx-strip-all" onClick={() => setGrid((g) => !g)}>{grid ? 'One at a time' : 'See everyone'}</button>
        </div>

        {!grid ? (
          <div className="lx-plan-stage">
            <article key={id} className={`lx-plan-person ${played ? 'played' : ''}`} style={{ '--c': styleOf(played || styles[id])?.color }}>
              <div className="row nowrap" style={{ '--gap': '12px' }}>
                <Avatar name={a.name} size={52} />
                <div className="grow" style={{ minWidth: 0 }}>
                  <h3>{a.name}</h3>
                  <div className="small muted">{stageName(def, a.stage)}{src?.experience ? ` · ${src.experience}` : ''}</div>
                </div>
                {styles[id] && <span className="lx-played-tag" style={{ '--c': styleOf(styles[id]).color }}>{styleOf(styles[id]).name}</span>}
              </div>
              <div className="lx-plan-facts">
                <span><span className="small muted">Performance</span><strong className="num">{Math.round(a.p)} {sig.trend === 'up' ? '▲' : sig.trend === 'down' ? '▼' : ''}</strong></span>
                <span><span className="small muted">Seems</span><strong className={`lx-mood ${sig.mood.tone}`}>{sig.mood.label}</strong></span>
                {sig.assessed && <span><span className="small muted">Your assessment</span><strong className="num">skill {sig.assessed.s} · morale {sig.assessed.m}</strong></span>}
              </div>
              {first && src?.bio && <p className="lx-plan-bio">{renderText(def, src.bio, { actor: a.name, pronoun: a.pronoun })}</p>}
              {sig.lines.length > 0 && <p className="lx-signal">"{sig.lines.at(-1).slice(0, 180)}{sig.lines.at(-1).length > 180 ? '…' : ''}"</p>}
              {xray && <p className="lx-xray">X-ray: skill {Math.round(a.s)}, morale {Math.round(a.m)}, needs {styleOf(need)?.name}</p>}
            </article>
            <div className="lx-hand" role="radiogroup" aria-label={`Approach for ${a.name}`}>
              {def.leadership.styles.map((st, k) => (
                <button key={st.id} type="button" role="radio" aria-checked={styles[id] === st.id} className={`lx-hand-card ${styles[id] === st.id ? 'on' : ''} ${played === st.id ? 'playing' : ''}`} style={{ '--c': st.color, '--i': k }} onClick={() => choose(id, st.id)}>
                  <span className="lx-hand-key" aria-hidden="true">{k + 1}</span>
                  <strong>{st.name}</strong>
                  <span>{STYLE_PLAIN[st.id] || st.definition}</span>
                  <span className="lx-hand-quad">Skill {st.skill} · morale {st.morale}</span>
                </button>
              ))}
            </div>
            <div className="row spread small muted">
              <button type="button" className="btn ghost sm" disabled={at === 0} onClick={() => setAt(at - 1)}>← Previous</button>
              <span>{at + 1} of {ids.length} · keys 1 to {def.leadership.styles.length} play a card</span>
              <button type="button" className="btn ghost sm" disabled={at === ids.length - 1} onClick={() => setAt(at + 1)}>Next →</button>
            </div>
          </div>
        ) : (
          <div className="lx-plan-grid">
            {ids.map((x) => {
              const p = state.actors[x];
              const sg = signalsFor(def, state, x);
              return (
                <div key={x} className={`lx-plan-card ${styles[x] ? 'set' : ''}`}>
                  <div className="row nowrap" style={{ '--gap': '10px' }}>
                    <Avatar name={p.name} size={34} />
                    <div className="grow" style={{ minWidth: 0 }}>
                      <strong>{p.name}</strong>
                      <div className="small muted">{stageName(def, p.stage)} · performance {Math.round(p.p)} {sg.trend === 'up' ? '▲' : sg.trend === 'down' ? '▼' : ''} · seems {sg.mood.label.toLowerCase()}</div>
                    </div>
                  </div>
                  {xray && <p className="lx-xray">X-ray: needs {styleOf(desiredStyle(def, p.s, p.m))?.name}</p>}
                  <div className="lx-style-pick" role="radiogroup" aria-label={`Approach for ${p.name}`}>
                    {def.leadership.styles.map((st) => (
                      <button key={st.id} type="button" role="radio" aria-checked={styles[x] === st.id} className={styles[x] === st.id ? 'on' : ''} style={{ '--c': st.color }} title={STYLE_PLAIN[st.id] || st.definition} onClick={() => choose(x, st.id)}>
                        <strong>{st.name}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="lx-sheet-foot">
          {week > 1 && Object.keys(last).length > 0 && <button type="button" className="btn ghost" onClick={() => setStyles({ ...last })}>Same as last week</button>}
          <button type="button" className="btn primary lg" disabled={done < ids.length} onClick={() => onStart(styles)}>{done < ids.length ? `${ids.length - done} still to plan` : first ? 'Start week 1' : 'Start the week'}</button>
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
