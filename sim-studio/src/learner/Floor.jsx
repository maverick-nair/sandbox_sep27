// The workspace: a HUD across the top (time, team, target, level, rank), the team floor as an
// org chart in the middle (the learner at the top, a column per stage, a portrait card per
// person), actions on the right, and the panels they open (profile, funnel, leaderboard,
// objective). Modelled on the legacy iLead floor, redrawn as a game.
import { useEffect, useMemo, useState } from 'react';
import { teamIds, stageName, weekOf, progress, teamAverages, actionAvailability, daysLeftInWeek, desiredStyle } from '../engine/engine.js';
import { renderText } from '../engine/text.js';
import { pointsOf, say, ACHIEVEMENTS } from '../engine/decisions.js';
import { levelOf } from '../templates/ilead/look.js';
import { Icon, StatRing, Logo, TrophyArt, TargetArt, ProductArt } from './art.jsx';
import { Face } from './look.jsx';
import { moodOf, trendOf, signalsFor, dayName, DAY_NAMES } from './model.js';
import { Leaderboard } from './Debrief.jsx';

const T = (def, s, v) => renderText(def, s || '', v);
const money = (def, v) => `${def.funnel.currency === 'USD' ? '$' : `${def.funnel.currency || ''} `}${Math.round(v).toLocaleString('en')}`;
const band = (v) => (v >= 67 ? 'high' : v >= 34 ? 'medium' : 'low');

// What the learner can see about a person's skill and morale, by the author's choice.
export function seenStats(def, a) {
  const mode = def.team?.visibility || 'numbers';
  const est = a.assessed?.[a.stage];
  if (mode === 'numbers') return { s: a.s, m: a.m, p: a.p, mode };
  if (mode === 'bands') return { s: a.s, m: a.m, p: a.p, sBand: band(a.s), mBand: band(a.m), mode };
  return { s: est?.s, m: est?.m, p: a.p, hideS: !est, hideM: !est, mode };
}

export function Rings({ def, a, size = 34 }) {
  const v = seenStats(def, a);
  return (
    <span className="lx-rings">
      <StatRing value={v.s} label="Skill" size={size} hidden={v.hideS} band={v.sBand} />
      <StatRing value={v.m} label="Morale" size={size} hidden={v.hideM} band={v.mBand} />
      <StatRing value={v.p} label="Result" size={size} />
    </span>
  );
}

// ---------- the HUD ----------

export function Hud({ def, state, identity, preview, xray, setXray, onExit, onPanel, ended, review, timeLeft, rank }) {
  const pr = progress(def, state);
  const avg = teamAverages(state);
  const week = Math.min(weekOf(def, state.day), def.timeline.weeks);
  const dpw = def.timeline.daysPerWeek;
  const lv = levelOf(def.gamification, state.dx.xp);
  const game = def.gamification || {};
  const vis = def.team?.visibility || 'numbers';
  const pts = pointsOf(def);
  const mm = timeLeft != null ? `${Math.floor(Math.max(0, timeLeft) / 60)}:${String(Math.floor(Math.max(0, timeLeft) % 60)).padStart(2, '0')}` : null;
  return (
    <header className="lx-hud" style={def.look?.brand ? { '--brand': def.look.brand } : undefined}>
      <div className="lx-hud-left">
        <div className="lx-brand"><Logo def={def} look={def.look} size={30} /><span className="lx-company">{T(def, '{{company}}')}</span></div>
        <div className="lx-clock">
          <span><small>Day</small><strong className="num">{ended ? '–' : (state.day % dpw) + 1}</strong></span>
          <span><small>Week</small><strong className="num">{week}/{def.timeline.weeks}</strong></span>
          {mm && <span className={timeLeft < 300 ? 'low' : ''}><small>Time left</small><strong className="num">{mm}</strong></span>}
        </div>
        <div className="lx-timeline" aria-label={`Week ${week} of ${def.timeline.weeks}${review ? `, Friday review of week ${review}` : ''}`}>
          {Array.from({ length: def.timeline.weeks }, (_, i) => {
            const w = i + 1;
            const bands = pts.filter((p) => p.week === w && state.dx.answered[p.id]).map((p) => state.dx.answered[p.id].band);
            return <span key={w} className={`lx-tl-week ${w < week || ended ? 'past' : w === week ? 'now' : ''}`} title={`Week ${w}`}>{bands.map((b, j) => <i key={j} className={b} />)}</span>;
          })}
        </div>
      </div>
      <div className="lx-hud-team">
        <StatRing value={avg.s} label="Team skill" size={40} hidden={vis === 'hidden'} band={vis === 'bands' ? band(avg.s) : undefined} />
        <StatRing value={avg.m} label="Team morale" size={40} hidden={vis === 'hidden'} band={vis === 'bands' ? band(avg.m) : undefined} />
        <StatRing value={avg.p} label="Team result" size={40} />
      </div>
      <div className="lx-hud-target" title={`${pr.conversions.toFixed(1)} of ${pr.target} conversions`}>
        <div className="row spread nowrap"><small>Target</small><strong className="num">{money(def, pr.revenue)} <span className="muted">/ {money(def, pr.target * def.funnel.valuePerConversion)}</span></strong></div>
        <span className="lx-target-bar"><span style={{ width: `${Math.min(100, pr.achieved * 100)}%` }} />{[25, 50, 75].map((m) => <i key={m} style={{ left: `${m}%` }} />)}</span>
        <div className="row spread nowrap small"><span className="muted">{pr.conversions.toFixed(1)} of {pr.target} conversions</span>{(def.decisions?.kpis || []).map((k) => <span key={k.id} className="lx-kpi-chip" title={k.note}>{k.label} <b className="num">{Math.round(state.dx.kpis[k.id] ?? k.start)}</b></span>)}</div>
      </div>
      {game.xp !== false && (
        <button type="button" className="lx-hud-level" onClick={() => onPanel('badges')} title="Your level, XP and badges">
          <span className="lx-level-badge num">{lv.index + 1}</span>
          <span className="lx-level-text"><small>{lv.level.name}</small><span className="lx-xp-bar"><span style={{ width: `${lv.progress * 100}%` }} /></span><small className="num">{state.dx.xp} XP{lv.next ? ` · ${lv.next.xp - state.dx.xp} to next` : ''}</small></span>
          {state.dx.streak >= 2 && game.streaks !== false && <span className="lx-streak" title={`${state.dx.streak} strong decisions in a row`}><Icon name="flame" size={14} />{state.dx.streak}</span>}
        </button>
      )}
      <nav className="lx-hud-nav" aria-label="Simulation">
        <button type="button" aria-label="Objective" title="Objective" onClick={() => onPanel('objective')}><Icon name="objective" /><span>Objective</span></button>
        <button type="button" aria-label="How it works" title="How it works" onClick={() => onPanel('guide')}><Icon name="help" /><span>How it works</span></button>
        {(game.liveLeaderboard !== false) && <button type="button" aria-label="Leaderboard" title="Leaderboard" onClick={() => onPanel('leaderboard')}><Icon name="trophy" /><span>Leaderboard{rank ? ` #${rank.rank}` : ''}</span></button>}
        <button type="button" aria-label="Notebook" title="Notebook" onClick={() => onPanel('notebook')}><Icon name="book" /><span>Notebook</span></button>
        {identity.group && <span className="lx-chip">{identity.group.name}</span>}
        {preview && <label className="lx-xray-toggle"><input type="checkbox" checked={xray} onChange={(e) => setXray(e.target.checked)} /> X-ray</label>}
        {onExit && <button type="button" className="lx-exit" onClick={onExit}>{preview ? 'Back to Studio' : 'Save and exit'}</button>}
      </nav>
    </header>
  );
}

// ---------- the team floor ----------

export function TeamFloor({ def, state, identity, onPerson, xray, pending, onOpen, onEndDay, onFastForward }) {
  const ids = teamIds(state);
  const week = weekOf(def, state.day);
  const dpw = def.timeline.daysPerWeek;
  const today = state.day % dpw;
  const left = daysLeftInWeek(def, state);
  const styles = Object.fromEntries(state.log.intents.filter((i) => i.week === week).map((i) => [i.actorId, i.style]));
  const firstDay = state.day === 0;
  return (
    <div className="lx-floor">
      <div className="lx-today-bar">
        <div>
          <div className="lx-kicker">{dayName(def, state.day)}, week {week}</div>
          <h2>{pending.length ? `${pending.length} thing${pending.length === 1 ? '' : 's'} need${pending.length === 1 ? 's' : ''} you today` : 'A quieter moment. Use it well.'}</h2>
        </div>
        <div className="lx-days" aria-label="This week">{Array.from({ length: dpw }, (_, i) => <span key={i} className={`lx-day ${i < today ? 'done' : i === today ? 'now' : ''}`}>{DAY_NAMES[i].slice(0, 3)}</span>)}</div>
        <div className="lx-today-end">
          <button type="button" className="btn ghost sm" onClick={onFastForward} title="Moves to Friday. Anything unanswered this week will pass without you.">Skip to Friday</button>
          <button type="button" className="btn primary" onClick={onEndDay}>{left <= 1 ? 'End the week' : 'End the day'}</button>
        </div>
      </div>
      {pending.length > 0 && (
        <div className="lx-waiting">
          {pending.map((p) => (
            <button key={p.key} type="button" className="lx-waiting-card" onClick={() => onOpen(p.key)}>
              <Face name={p.sender.name} size={38} />
              <span className="grow"><strong>{p.title}</strong><span className="small muted">{p.sender.name} · {p.channel === 'meeting' ? 'Meeting' : p.channel === 'call' ? 'Call' : p.channel === 'dashboard' ? 'Business update' : p.channel === 'chat' ? 'Chat' : 'Email'} · reply by Friday</span></span>
              <span className="lx-open">Open</span>
            </button>
          ))}
        </div>
      )}
      <div className="lx-org">
        <div className="lx-org-you"><Face name="You" size={26} /><span>{identity.name && identity.name !== 'Author preview' ? `${identity.name.split(' ')[0]}, ` : 'You, '}{T(def, '{{learner_role}}')}</span></div>
        <div className="lx-org-lines" aria-hidden="true" style={{ '--n': def.stages.length }} />
        <div className="lx-org-cols" style={{ '--n': def.stages.length }}>
          {def.stages.map((st, si) => (
            <section key={st.id} className="lx-org-col" aria-label={st.name}>
              <header className="lx-org-head" title={T(def, st.description)}><span>{st.name}</span><strong className="num">{Math.round(state.funnel.stageTotals[si] || 0)}</strong></header>
              {ids.filter((id) => state.actors[id].stage === st.id).map((id, k) => {
                const a = state.actors[id];
                const mood = moodOf(a.m);
                const tr = trendOf(def, state, id);
                const sig = signalsFor(def, state, id);
                const st2 = def.leadership.styles.find((x) => x.id === styles[id]);
                const quote = firstDay || !sig.lines.length ? `Hi, I’m ${a.name.split(' ')[0]}. How do you do?` : sig.lines.at(-1);
                return (
                  <button key={id} type="button" className={`lx-person tone-${mood.tone}`} style={{ '--i': si * 2 + k }} onClick={() => onPerson(id)} aria-label={`${a.name}, ${stageName(def, a.stage)}. Open profile`}>
                    <span className="lx-person-top">
                      <Face name={a.name} size={50} shape="square" mood={mood.tone} />
                      <span className="lx-person-id">
                        <strong>{a.name}</strong>
                        <span className={`lx-mood ${mood.tone}`}>{mood.label}</span>
                      </span>
                    </span>
                    <span className="lx-person-say">“{quote.length > 80 ? `${quote.slice(0, 78)}…` : quote}”</span>
                    <Rings def={def} a={a} size={32} />
                    <span className="lx-person-foot">
                      <span className="small">Your style</span>
                      <span className="lx-style-chip" style={{ '--c': st2?.color }}>{st2?.name || 'Not set'}</span>
                      {tr !== 'flat' && <span className={`lx-trend ${tr}`} aria-label={tr === 'up' ? 'Improving' : 'Slipping'}>{tr === 'up' ? '▲' : '▼'}</span>}
                    </span>
                    {xray && <span className="lx-xray-tag">needs {def.leadership.styles.find((x) => x.id === desiredStyle(def, a.s, a.m))?.name}</span>}
                  </button>
                );
              })}
              {!ids.some((id) => state.actors[id].stage === st.id) && <p className="lx-org-empty">Nobody in this stage. Work stops here.</p>}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- actions dock ----------

export const daysLabel = (a) => { const d = [...new Set(a.options.map((o) => o.dayCost))]; return `${d.join(' or ')} day${d.length === 1 && d[0] === 1 ? '' : 's'}`; };

export function ActionsDock({ def, state, onPick, onFunnel }) {
  const left = daysLeftInWeek(def, state);
  return (
    <aside className="lx-dock" aria-label="Actions">
      <button type="button" className="lx-funnel-btn" onClick={onFunnel}><Icon name="funnel" size={20} /> Sales funnel</button>
      <div className="lx-pane-head"><strong>Actions</strong><span className="small muted">{left} day{left === 1 ? '' : 's'} left</span></div>
      <ul className="lx-dock-list">
        {def.actions.filter((a) => a.enabled).map((a) => {
          const av = a.options.map((o) => actionAvailability(def, state, a, o));
          const ok = av.some((x) => x.ok);
          return (
            <li key={a.id}>
              <button type="button" disabled={!ok} onClick={() => onPick(a.id)} title={ok ? T(def, a.description) : av[0].reason}>
                <Icon name={a.id} size={18} />
                <span className="grow">{a.name}</span>
                <span className="small muted">{ok ? daysLabel(a) : ''}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

// ---------- panels ----------

function Side({ title, onClose, children, wide }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="lx-side" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`lx-side-panel ${wide ? 'wide' : ''}`}>
        <div className="row spread"><h2>{title}</h2><button type="button" className="btn ghost sm" onClick={onClose}>Close</button></div>
        {children}
      </div>
    </div>
  );
}

export function ProfileModal({ def, state, id, xray, onClose, onAction }) {
  const a = state.actors[id];
  const src = def.actors.find((x) => x.id === id);
  const week = weekOf(def, state.day);
  const style = def.leadership.styles.find((x) => x.id === state.log.intents.find((i) => i.week === week && i.actorId === id)?.style);
  const him = a.pronoun === 'she' ? 'her' : a.pronoun === 'he' ? 'him' : 'them';
  const history = [
    ...state.log.feed.filter((f) => f.actorId === id).map((f) => ({ day: f.day, title: f.title, text: f.text, tone: f.tone })),
    ...pointsOf(def).filter((p) => (p.about === id || p.about2 === id) && state.dx.answered[p.id]).map((p) => ({ day: state.dx.answered[p.id].day, title: say(def, state, p, p.title), text: state.dx.answered[p.id].reaction, tone: state.dx.answered[p.id].band === 'strong' ? 'good' : state.dx.answered[p.id].band === 'weak' ? 'bad' : 'mixed' })),
  ].sort((x, y) => y.day - x.day);
  const actions = def.actions.filter((x) => x.enabled && x.scope === 'individual');
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="lx-overlay" role="dialog" aria-modal="true" aria-label={`${a.name}, profile`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lx-profile">
        <button type="button" className="lx-profile-x" onClick={onClose} aria-label="Close">×</button>
        <section className="lx-profile-col">
          <h3 className="lx-profile-h">Profile</h3>
          <div className="lx-profile-top">
            <Face name={a.name} size={112} shape="square" mood={moodOf(a.m).tone} />
            <div><h2>{a.name}</h2><Rings def={def} a={a} size={42} /></div>
          </div>
          <div className="lx-profile-style">Your style with {him} <strong style={{ color: style?.color }}>{style?.name || 'Yet to be decided'}</strong></div>
          {xray && <p className="lx-xray">X-ray: skill {Math.round(a.s)}, morale {Math.round(a.m)}, needs {def.leadership.styles.find((x) => x.id === desiredStyle(def, a.s, a.m))?.name}</p>}
          <dl className="lx-profile-facts">
            <dt>Previous company</dt><dd>{src?.previousCompany ? T(def, src.previousCompany) : 'N/A'}</dd>
            <dt>Joined {T(def, '{{company}}')}</dt><dd>{src?.joined || 'Not stated'}</dd>
            <dt>Experience in industry</dt><dd>{src?.experience || 'Not stated'}</dd>
            <dt>Skills</dt><dd>{src?.domain || 'Not stated'}</dd>
            <dt>Now working in</dt><dd>{stageName(def, a.stage)}</dd>
            <dt>Remarks</dt><dd>{T(def, src?.bio, { actor: a.name, pronoun: a.pronoun }) || 'None.'}</dd>
          </dl>
        </section>
        <section className="lx-profile-col history">
          <h3 className="lx-profile-h">Your interactions</h3>
          {history.length ? (
            <ol className="lx-history">{history.map((h, k) => <li key={k} className={`tone-${h.tone || ''}`}><span className="small muted">W{weekOf(def, h.day)} {dayName(def, h.day).slice(0, 3)} · {h.title}</span><p>{h.text}</p></li>)}</ol>
          ) : <p className="lx-empty-big">No interactions yet</p>}
        </section>
        <section className="lx-profile-col act">
          <h3 className="lx-profile-h">Take an action</h3>
          <ul className="lx-dock-list">
            {actions.map((x) => {
              const ok = x.options.some((o) => actionAvailability(def, state, x, o).ok);
              return <li key={x.id}><button type="button" disabled={!ok || state.phase !== 'day'} onClick={() => onAction(x.id, id)}><Icon name={x.id} size={16} /><span className="grow">{x.name.replace(/member$/i, a.name.split(' ')[0])}</span></button></li>;
            })}
          </ul>
          {state.phase !== 'day' && <p className="small muted">Start of the week: plan first, then you can act.</p>}
        </section>
      </div>
    </div>
  );
}

export function FunnelBody({ def, state }) {
  const totals = state.funnel.stageTotals;
  const max = Math.max(1, ...totals);
  const ids = teamIds(state);
  const flows = def.stages.map((s, i) => ({ s, v: totals[i] || 0, n: ids.filter((id) => state.actors[id].stage === s.id).length, perf: ids.filter((id) => state.actors[id].stage === s.id).reduce((t, id) => t + state.actors[id].p, 0) }));
  // The narrowest point: the stage that passes on the least of what reaches it.
  let weakest = 1;
  flows.forEach((f, i) => { if (i > 0 && f.v / Math.max(1, flows[i - 1].v) < flows[weakest].v / Math.max(1, flows[weakest - 1].v)) weakest = i; });
  return (
    <>
      <p className="small muted">Work passed on by each stage so far this quarter. Conversions come out of the last stage.</p>
      <div className="lx-funnel">
        {flows.map((f, i) => (
          <div key={f.s.id} className={`lx-funnel-row ${i === weakest && state.day > 2 ? 'weak' : ''}`}>
            <span className="lx-funnel-name">{f.s.name}<small>{f.n} {f.n === 1 ? 'person' : 'people'} · passes on {Math.round(f.s.conversion * 100)}%</small></span>
            <span className="lx-funnel-bar" style={{ '--w': `${Math.max(4, (f.v / max) * 100)}%` }}><span /></span>
            <strong className="num">{f.v.toFixed(0)}</strong>
          </div>
        ))}
        <div className="lx-funnel-row out"><span className="lx-funnel-name">Conversions</span><span className="lx-funnel-bar" style={{ '--w': `${Math.max(4, (state.funnel.conversions / max) * 100)}%` }}><span /></span><strong className="num">{state.funnel.conversions.toFixed(1)}</strong></div>
      </div>
      {state.day > 2 && <p className="small">The narrowest point is <strong>{flows[weakest].s.name}</strong>. Skill and morale there decide how much reaches the end.</p>}
    </>
  );
}

export function FunnelPanel({ def, state, onClose }) {
  return <Side title="Sales funnel" onClose={onClose}><FunnelBody def={def} state={state} /></Side>;
}

export function ObjectivePanel({ def, state, onClose }) {
  const pr = progress(def, state);
  return (
    <Side title="Your objective" onClose={onClose}>
      <div className="row nowrap" style={{ '--gap': '16px' }}><TargetArt size={110} /><ProductArt kind={def.look?.productArt} image={def.look?.productImage} size={90} /></div>
      <ol className="lx-targets">
        <li><span className="lx-target-n">1</span><span>Sales revenue: <strong>{money(def, def.funnel.target * def.funnel.valuePerConversion)}</strong><small>{money(def, pr.revenue)} so far</small></span></li>
        <li><span className="lx-target-n">2</span><span><strong>{def.funnel.target} conversions</strong> <small>(1 conversion = {money(def, def.funnel.valuePerConversion)}), {pr.conversions.toFixed(1)} so far</small></span></li>
        {(def.story.goals || []).map((g, i) => <li key={i}><span className="lx-target-n">{i + 3}</span><span>{T(def, g)}</span></li>)}
      </ol>
      <p className="small muted">Duration: {def.timeline.weeks} weeks{def.timeline.timeLimit ? ` · simulation time ${def.timeline.timeLimit} minutes` : ''}.</p>
    </Side>
  );
}

export function LeaderPanel({ def, rows, you, delivery, benchmark, onClose }) {
  const scores = benchmark || [];
  const better = scores.length ? Math.round((scores.filter((s) => s < you.score).length / scores.length) * 100) : null;
  return (
    <Side title="Leaderboard" onClose={onClose}>
      <p className="small muted">Your live score so far, against everyone who finished{delivery.cohorts?.length ? ' in your cohort' : ''}. It settles when you finish the quarter.</p>
      <Leaderboard rows={[...rows, you]} you="you" delivery={delivery} />
      {rows.length === 0 && <p className="small">Nobody else has finished yet. You could be first on the board.</p>}
      {better !== null && <p className="small">You are ahead of <strong>{better}%</strong> of practice learners right now.</p>}
    </Side>
  );
}

export function BadgesPanel({ def, state, onClose }) {
  const lv = levelOf(def.gamification, state.dx.xp);
  const levels = (def.gamification?.levels || []).slice().sort((x, y) => x.xp - y.xp);
  const earned = new Set(state.dx.achievements);
  return (
    <Side title="Level and badges" onClose={onClose}>
      <div className="lx-level-hero"><TrophyArt size={80} tier={lv.index >= levels.length - 1 ? 'gold' : lv.index >= 2 ? 'silver' : 'bronze'} /><div><div className="lx-kicker">Level {lv.index + 1} of {levels.length}</div><h3>{lv.level.name}</h3><span className="lx-xp-bar big"><span style={{ width: `${lv.progress * 100}%` }} /></span><span className="small muted num">{state.dx.xp} XP{lv.next ? ` · ${lv.next.xp - state.dx.xp} XP to ${lv.next.name}` : ' · top level'}</span></div></div>
      <ol className="lx-levels">{levels.map((l, i) => <li key={l.name} className={i <= lv.index ? 'done' : ''}><span className="num">{l.xp}</span> {l.name}</li>)}</ol>
      {def.gamification?.achievements !== false && (
        <div className="lx-badges">
          {ACHIEVEMENTS.map((x) => <div key={x.id} className={`lx-badge ${earned.has(x.id) ? 'on' : ''}`}><span className="lx-badge-medal"><Icon name={earned.has(x.id) ? 'star' : 'trophy'} size={20} /></span><strong>{x.label}</strong><small>{x.note}</small></div>)}
        </div>
      )}
      <p className="small muted">XP comes from decisions, weighted by difficulty, with a bonus for strong decisions in a row. Speed never earns XP.</p>
    </Side>
  );
}

// ---------- celebration ----------

export function Confetti({ run }) {
  const pieces = useMemo(() => Array.from({ length: 70 }, (_, i) => ({ i, x: Math.random() * 100, d: 1.6 + Math.random() * 1.4, r: Math.random() * 360, c: ['#f5c542', '#4cc98b', '#7aa2ff', '#f07a70', '#c27aff'][i % 5], w: 6 + Math.random() * 6 })), [run]); // eslint-disable-line react-hooks/exhaustive-deps
  const [on, setOn] = useState(!!run);
  useEffect(() => { if (!run) return undefined; setOn(true); const t = setTimeout(() => setOn(false), 3200); return () => clearTimeout(t); }, [run]);
  if (!on) return null;
  return <div className="lx-confetti" aria-hidden="true">{pieces.map((p) => <i key={p.i} style={{ left: `${p.x}%`, background: p.c, width: p.w, height: p.w * 0.45, animationDuration: `${p.d}s`, transform: `rotate(${p.r}deg)` }} />)}</div>;
}
