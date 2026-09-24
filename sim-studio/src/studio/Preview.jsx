import { useEffect, useMemo, useState } from 'react';
import {
  createRun, setWeeklyStyles, takeAction, proceed, actionAvailability, teamIds, availableIds, desiredStyle,
  weekOf, dayOfWeek, daysLeftInWeek, progress, teamAverages, stageEfficiency, stageName, membersInStage,
} from '../engine/engine.js';
import { computeReport } from '../engine/report.js';
import { renderText } from '../engine/text.js';
import { Button, Callout, Pill, StylePill, Switch, Tip } from './ui.jsx';
import { ReportView } from './sections/Report.jsx';
import { clone } from '../engine/clone.js';

const rag = (def, v) => (v < def.leadership.rag.red ? 'var(--bad)' : v < def.leadership.rag.green ? 'var(--warn)' : 'var(--good)');

export default function Preview({ def, onClose }) {
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e6));
  const [state, setState] = useState(() => createRun(def, { seed }));
  const [xray, setXray] = useState(true);
  const [error, setError] = useState('');
  const act = (fn) => {
    const next = clone(state);
    const res = fn(next);
    if (res && res.ok === false) { setError(res.error); return res; }
    setError('');
    setState(next);
    return res;
  };
  // Starting over rebuilds every screen from a fresh run, so it is visibly a new start.
  const [run, setRun] = useState(1);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [notice, setNotice] = useState('');
  const started = state.day > 1 || state.phase !== 'weekStart';
  const restart = () => {
    const s = Math.floor(Math.random() * 1e6);
    setSeed(s);
    setState(createRun(def, { seed: s }));
    setError('');
    setConfirmRestart(false);
    setRun((n) => n + 1);
    setNotice('New run started from week 1, with fresh random outcomes.');
    document.querySelector('.preview-body')?.scrollTo({ top: 0 });
  };
  useEffect(() => { if (!notice) return undefined; const t = setTimeout(() => setNotice(''), 3500); return () => clearTimeout(t); }, [notice]);
  const pr = progress(def, state);
  const avg = teamAverages(state);
  const money = new Intl.NumberFormat('en', { style: 'currency', currency: def.funnel.currency, notation: 'compact' });
  const week = Math.min(weekOf(def, state.day), def.timeline.weeks);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 45, background: 'var(--bg)', display: 'grid', gridTemplateRows: 'auto 1fr' }} role="dialog" aria-label="Learner preview">
      <header className="topbar" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="stack" style={{ '--gap': '0' }}>
          <span className="eyebrow">Learner preview</span>
          <strong style={{ fontFamily: 'var(--font-display)', fontSize: 16 }}>{def.meta.name}</strong>
        </div>
        <Pill tone="accent">{state.phase === 'ended' ? 'Complete' : `Week ${week} of ${def.timeline.weeks} · Day ${dayOfWeek(def, state.day)}`}</Pill>
        <div className="stack grow" style={{ '--gap': '3px', minWidth: 180, maxWidth: 360 }}>
          <div className="row spread small"><span>Target</span><span className="num">{pr.conversions.toFixed(1)} / {pr.target} · {money.format(pr.revenue)}</span></div>
          <div className="bar"><span style={{ width: `${Math.min(100, pr.achieved * 100)}%`, background: pr.achieved >= 1 ? 'var(--good)' : 'var(--accent)' }} /></div>
        </div>
        <div className="row small num" style={{ '--gap': '12px' }}>
          <span>Skill <strong style={{ color: rag(def, avg.s) }}>{Math.round(avg.s)}</strong></span>
          <span>Morale <strong style={{ color: rag(def, avg.m) }}>{Math.round(avg.m)}</strong></span>
          <span>Performance <strong style={{ color: rag(def, avg.p) }}>{Math.round(avg.p)}</strong></span>
        </div>
        <div className="row" style={{ marginLeft: 'auto' }}>
          <Tip text="Shows each person's true skill and morale and the style they need. Learners never see this."><Switch checked={xray} onChange={setXray} label="Author x-ray" /></Tip>
          {confirmRestart ? (
            <span className="row nowrap" role="group" aria-label="Confirm start over">
              <span className="small">Lose this run's progress?</span>
              <Button size="sm" variant="danger" onClick={restart}>Start over</Button>
              <Button size="sm" onClick={() => setConfirmRestart(false)}>Keep playing</Button>
            </span>
          ) : (
            <Button size="sm" onClick={() => (started && state.phase !== 'ended' ? setConfirmRestart(true) : restart())} tip="Starts a new run from week 1 with fresh random outcomes.">Start over</Button>
          )}
          <Button size="sm" variant="primary" onClick={onClose} tip="Closes the preview. Nothing from this run is saved." tipAlign="end">Back to Studio</Button>
        </div>
      </header>
      <div className="preview-body" style={{ overflowY: 'auto' }}>
        <div className="page" style={{ maxWidth: 1320 }} key={run}>
          {notice && <div style={{ marginBottom: 12 }} role="status"><Callout tone="good" icon="✓">{notice}</Callout></div>}
          {error && <div style={{ marginBottom: 12 }}><Callout tone="bad" icon="!">{error}</Callout></div>}
          {state.phase === 'weekStart' && <WeekStart def={def} state={state} xray={xray} onDone={(styles) => act((s) => setWeeklyStyles(def, s, styles))} />}
          {state.phase === 'day' && <Day def={def} state={state} xray={xray} act={act} />}
          {state.phase === 'ended' && (
            <div className="stack">
              <h1>Your report</h1>
              <ReportView def={def} report={computeReport(def, state)} />
              <div className="row" style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
                <Button variant="primary" onClick={restart}>Play again</Button>
                <Button onClick={onClose}>Back to Studio</Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function WeekStart({ def, state, xray, onDone }) {
  const ids = teamIds(state);
  const last = state.log.intents.filter((i) => i.week === weekOf(def, state.day) - 1);
  const [styles, setStyles] = useState(() => Object.fromEntries(last.filter((i) => ids.includes(i.actorId)).map((i) => [i.actorId, i.style])));
  const done = ids.every((id) => styles[id]);
  const week = weekOf(def, state.day);
  return (
    <div className="stack" style={{ '--gap': '16px' }}>
      {week === 1 && (
        <div className="card stack">
          <span className="eyebrow">Welcome letter</span>
          <p style={{ whiteSpace: 'pre-wrap', maxWidth: '72ch' }}>{renderText(def, def.story.welcome)}</p>
          <p className="small ink2" style={{ maxWidth: '72ch' }}>{renderText(def, def.story.target)}</p>
        </div>
      )}
      <div>
        <h1>Week {week}: set your leadership style</h1>
        <p className="ink2" style={{ marginTop: 4 }}>Choose how you will lead each person this week, based on what you know of their skill and morale.</p>
      </div>
      <div className="card scroll-x" style={{ padding: 4 }}>
        <table className="table">
          <thead><tr><th>Team member</th><th>Stage</th><th>Performance</th>{xray && <th>X-ray</th>}<th>Your style this week</th></tr></thead>
          <tbody>
            {ids.map((id) => {
              const a = state.actors[id];
              return (
                <tr key={id}>
                  <td><strong>{a.name}</strong>{!availableIdsSet(state).has(id) && <div className="small muted">Away: {a.unavailableReason}</div>}</td>
                  <td className="small">{stageName(def, a.stage)}</td>
                  <td style={{ width: 130 }}><div className="row nowrap"><div className="bar grow"><span style={{ width: `${a.p}%`, background: rag(def, a.p) }} /></div><span className="num small">{Math.round(a.p)}</span></div></td>
                  {xray && <td className="small num" style={{ whiteSpace: 'nowrap' }}>S {Math.round(a.s)} · M {Math.round(a.m)} <StylePill def={def} styleId={desiredStyle(def, a.s, a.m)} /></td>}
                  <td>
                    <div className="seg" role="radiogroup" aria-label={`Style for ${a.name}`}>
                      {def.leadership.styles.map((s) => (
                        <button key={s.id} type="button" role="radio" aria-checked={styles[id] === s.id} className={styles[id] === s.id ? 'on' : ''} title={s.definition} onClick={() => setStyles((x) => ({ ...x, [id]: s.id }))} style={styles[id] === s.id ? { color: s.color } : undefined}>{s.name}</button>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="row"><Button variant="primary" size="lg" disabled={!done} onClick={() => onDone(styles)}>Start the week</Button>{!done && <span className="small muted">{ids.filter((id) => !styles[id]).length} still to set</span>}</div>
    </div>
  );
}

const availableIdsSet = (state) => new Set(availableIds(state));
const daysLabel = (a) => {
  const days = [...new Set(a.options.map((o) => o.dayCost))];
  return `${days.join(' or ')} day${days.length === 1 && days[0] === 1 ? '' : 's'}`;
};

function Day({ def, state, xray, act }) {
  const [actionId, setActionId] = useState(null);
  const action = def.actions.find((a) => a.id === actionId);
  const feed = [...state.log.feed].reverse().slice(0, 30);
  const avail = availableIdsSet(state);
  const today = state.funnel.daily.at(-1);

  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, alignItems: 'start' }}>
      <section className="stack" aria-label="Team">
        <div className="row spread"><h2>Team</h2><span className="small muted">{daysLeftInWeek(def, state)} day{daysLeftInWeek(def, state) === 1 ? '' : 's'} left this week</span></div>
        {def.stages.map((st) => {
          const ids = membersInStage(state, st.id);
          return (
            <div key={st.id} className="card tight stack" style={{ '--gap': '6px' }}>
              <div className="row spread"><strong className="small">{st.name}</strong><span className="small muted num">efficiency {Math.round(stageEfficiency(def, state, st.id) * 100)}%</span></div>
              {ids.length === 0 && <span className="small" style={{ color: 'var(--bad)' }}>No one in this stage. Work stops here.</span>}
              {ids.map((id) => {
                const a = state.actors[id];
                const est = a.assessed?.[a.stage];
                return (
                  <div key={id} className="grid" style={{ gridTemplateColumns: '1fr 90px', gap: 8, alignItems: 'center', opacity: avail.has(id) ? 1 : 0.55 }}>
                    <div>
                      <div className="small" style={{ fontWeight: 600 }}>{a.name}</div>
                      <div className="small muted">
                        {!avail.has(id) ? `Away (${a.unavailableReason})` : `Style: ${def.leadership.styles.find((s) => s.id === state.weeklyStyles[id])?.name || 'not set'}`}
                        {est && !xray ? ` · assessed S ${est.s} M ${est.m}` : ''}
                        {xray ? ` · S ${Math.round(a.s)} M ${Math.round(a.m)}` : ''}
                      </div>
                    </div>
                    <div className="row nowrap"><div className="bar grow"><span style={{ width: `${a.p}%`, background: rag(def, a.p) }} /></div><span className="num small">{Math.round(a.p)}</span></div>
                  </div>
                );
              })}
            </div>
          );
        })}
        {today && <p className="small muted num">Yesterday: {today.inflow.toFixed(0)} leads in, {today.conversions.toFixed(2)} conversions out.</p>}
      </section>

      <section className="stack" aria-label="Actions">
        <div className="row spread"><h2>Actions</h2><Button onClick={() => { setActionId(null); act((s) => proceed(def, s)); }} tip="Moves to the next day without taking an action. The funnel still runs." tipAlign="end">End the day</Button></div>
        {!action && (
          <div className="grid cols-2" style={{ '--gap': '8px' }}>
            {def.actions.filter((a) => a.enabled).map((a) => {
              const av = a.options.map((o) => actionAvailability(def, state, a, o));
              const ok = av.some((x) => x.ok);
              return (
                <button key={a.id} type="button" className="card tight stack" disabled={!ok} style={{ '--gap': '2px', textAlign: 'left', cursor: ok ? 'pointer' : 'not-allowed', opacity: ok ? 1 : 0.55 }} onClick={() => setActionId(a.id)}>
                  <strong className="small">{a.name}</strong>
                  <span className="small muted">{ok ? daysLabel(a) : av[0].reason}</span>
                </button>
              );
            })}
          </div>
        )}
        {action && <Composer key={action.id} def={def} state={state} action={action} xray={xray} onCancel={() => setActionId(null)} onSubmit={(req) => { const r = act((s) => takeAction(def, s, req)); if (r?.ok) setActionId(null); }} />}
      </section>

      <section className="stack" aria-label="Notifications">
        <h2>Notifications</h2>
        <div className="stack" style={{ '--gap': '8px' }}>
          {feed.map((f, i) => (
            <div key={i} className="card tight" style={{ borderLeft: `3px solid ${f.tone === 'good' ? 'var(--good)' : f.tone === 'bad' ? 'var(--bad)' : f.tone === 'mixed' ? 'var(--warn)' : 'var(--accent)'}` }}>
              <div className="row spread nowrap"><strong className="small">{f.title}</strong><span className="small muted num">W{weekOf(def, f.day)} D{dayOfWeek(def, f.day)}</span></div>
              <p className="small ink2" style={{ whiteSpace: 'pre-wrap', maxHeight: f.kind === 'story' ? 90 : undefined, overflow: 'hidden' }}>{f.text}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function Composer({ def, state, action, xray, onCancel, onSubmit }) {
  const usable = action.options.filter((o) => actionAvailability(def, state, action, o).ok);
  const [optionId, setOptionId] = useState(usable[0]?.id);
  const [targets, setTargets] = useState([]);
  const [stage, setStage] = useState('');
  const [candidate, setCandidate] = useState('');
  const option = action.options.find((o) => o.id === optionId);
  const ids = availableIds(state);
  const pool = useMemo(() => Object.values(state.actors).filter((a) => a.status === 'pool'), [state]);
  const max = action.mechanic === 'roleChange' ? (option?.mode === 'swap' ? 2 : 1) : action.maxTargets || 1;
  const needsStage = action.mechanic === 'hire' || (action.mechanic === 'roleChange' && option?.mode === 'reassign') || action.mechanic === 'assess';
  const toggle = (id) => setTargets((t) => (t.includes(id) ? t.filter((x) => x !== id) : max === 1 ? [id] : t.length < max ? [...t, id] : t));

  return (
    <div className="card stack">
      <div className="row spread"><h3>{action.name}</h3><Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button></div>
      <p className="small ink2">{renderText(def, action.description)}</p>
      {action.options.length > 1 && (
        <div className="stack" style={{ '--gap': '6px' }} role="radiogroup" aria-label="Options">
          {action.options.map((o) => {
            const av = actionAvailability(def, state, action, o);
            return (
              <label key={o.id} className="card tight row nowrap" style={{ cursor: av.ok ? 'pointer' : 'not-allowed', opacity: av.ok ? 1 : 0.5, alignItems: 'flex-start', borderColor: optionId === o.id ? 'var(--accent)' : undefined }}>
                <input type="radio" name="opt" disabled={!av.ok} checked={optionId === o.id} onChange={() => setOptionId(o.id)} style={{ marginTop: 3 }} />
                <span className="grow small">
                  {o.text ? renderText(def, o.text) : o.label}
                  <span className="muted"> · {o.dayCost} day{o.dayCost === 1 ? '' : 's'}{!av.ok ? ` · ${av.reason}` : ''}</span>
                  {xray && o.style && <> <StylePill def={def} styleId={o.style} /></>}
                </span>
              </label>
            );
          })}
        </div>
      )}
      {action.scope !== 'team' && action.mechanic !== 'hire' && (
        <div className="stack" style={{ '--gap': '6px' }}>
          <span className="small" style={{ fontWeight: 600 }}>{action.selectPrompt ? renderText(def, action.selectPrompt) : `Pick up to ${max}`} <span className="muted">({targets.length}/{max})</span></span>
          <div className="row" style={{ '--gap': '6px' }}>
            {ids.map((id) => (
              <button key={id} type="button" className={`btn sm ${targets.includes(id) ? 'primary' : ''}`} aria-pressed={targets.includes(id)} onClick={() => toggle(id)}>
                {state.actors[id].name.split(' ')[0]}
                <span className="muted small" style={{ color: targets.includes(id) ? 'inherit' : undefined }}>{stageName(def, state.actors[id].stage).split(' ')[0]}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {action.mechanic === 'hire' && (
        <div className="stack" style={{ '--gap': '6px' }}>
          <span className="small" style={{ fontWeight: 600 }}>Candidates</span>
          {pool.map((a) => {
            const src = def.actors.find((x) => x.id === a.id);
            return (
              <label key={a.id} className="card tight row nowrap" style={{ alignItems: 'flex-start', cursor: 'pointer', borderColor: candidate === a.id ? 'var(--accent)' : undefined }}>
                <input type="radio" name="cand" checked={candidate === a.id} onChange={() => setCandidate(a.id)} style={{ marginTop: 3 }} />
                <span className="small grow"><strong>{a.name}</strong> · {src.experience} · {src.domain}<br /><span className="ink2">{renderText(def, src.bio)}</span>{stage && <span className="muted num"><br />In {stageName(def, stage)}: skill {src.stats[stage].s}, morale {src.stats[stage].m}, performance {src.stats[stage].p}</span>}</span>
              </label>
            );
          })}
        </div>
      )}
      {needsStage && (
        <label className="field">
          <span className="label">{action.mechanic === 'assess' ? 'Assess for stage (optional)' : 'Stage'}</span>
          <select className="select" value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">{action.mechanic === 'assess' ? 'Current stage' : 'Pick a stage'}</option>
            {def.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
      )}
      {action.mechanic === 'assess' && targets[0] && state.actors[targets[0]].assessed && (
        <p className="small muted">Last assessment is kept on the team card.</p>
      )}
      <div className="row">
        <Button variant="primary" disabled={!option} onClick={() => onSubmit({ actionId: action.id, optionId, targets, stage: stage || undefined, candidate: candidate || undefined })}>
          Do it ({option?.dayCost || 1} day{option?.dayCost === 1 ? '' : 's'})
        </Button>
      </div>
    </div>
  );
}
