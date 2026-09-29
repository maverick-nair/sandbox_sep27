// The workspace in the app shell. The sidebar holds the team floor, the inbox, every action and
// the quarter's panels; the top bar holds the clock and the learner. The main area leads with
// today: a headline, the person who needs the learner most under the spotlight, and what is
// waiting. Below it, view tabs switch between the team floor, the inbox and the sales pipeline.
// The team's numbers sit on the right and the quarter's progress runs along the bottom.
import { useState } from 'react';
import { weekOf, progress, teamAverages, teamIds, stageName, daysLeftInWeek, totalDays, actionAvailability } from '../engine/engine.js';
import { renderText } from '../engine/text.js';
import { levelOf } from '../templates/ilead/look.js';
import { Icon, sceneBackground } from './art.jsx';
import { Face } from './look.jsx';
import { Avatar } from './Moment.jsx';
import { Shell, TopChip, Profile, StatCard, HeroStage, ProgressStrip, ViewTabs } from './Shell.jsx';
import { TeamFloor, FunnelBody, daysLabel } from './Floor.jsx';
import { dayName, moodOf, DAY_NAMES } from './model.js';

const T = (def, s, v) => renderText(def, s || '', v);
const cur = (def) => (def.funnel.currency === 'USD' ? '$' : `${def.funnel.currency || ''} `);
const compact = (def, v) => `${cur(def)}${new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(v)}`;
const band = (v) => (v >= 67 ? 'High' : v >= 34 ? 'Medium' : 'Low');
const CHANNEL = { meeting: 'Meeting', call: 'Call', dashboard: 'Business update', chat: 'Chat', news: 'News' };

export default function Workspace({ def, state, identity, preview, xray, setXray, onExit, timeLeft, rank, inbox, pending, selected, onSelect, onPanel, onAction, onPerson, onEndDay, onFastForward, review, children, overlays }) {
  const [view, setView] = useState('floor');
  const pr = progress(def, state);
  const avg = teamAverages(state);
  const week = Math.min(weekOf(def, state.day), def.timeline.weeks);
  const dpw = def.timeline.daysPerWeek;
  const today = state.day % dpw;
  const left = daysLeftInWeek(def, state);
  const vis = def.team?.visibility || 'numbers';
  const game = def.gamification || {};
  const lv = levelOf(def.gamification, state.dx.xp);
  const ids = teamIds(state);
  // Change since the start of this week, for the deltas on the stat cards.
  const weekStart = (() => {
    const xs = ids.map((id) => state.actors[id].weekStart?.[week - 1]).filter(Boolean);
    if (!xs.length) return null;
    const n = xs.length;
    return { s: xs.reduce((t, x) => t + x.s, 0) / n, m: xs.reduce((t, x) => t + x.m, 0) / n, p: xs.reduce((t, x) => t + x.p, 0) / n };
  })();
  const d = (k) => (weekStart ? avg[k] - weekStart[k] : null);
  const pace = state.day / Math.max(1, totalDays(def));
  const status = pr.achieved >= pace * 1.05 ? ['Ahead of pace', 'good'] : pr.achieved >= pace * 0.85 ? ['On track', 'good'] : pr.achieved >= pace * 0.6 ? ['Behind pace', 'warn'] : ['Well behind', 'bad'];
  const mm = timeLeft != null ? `${Math.floor(Math.max(0, timeLeft) / 60)}:${String(Math.floor(Math.max(0, timeLeft) % 60)).padStart(2, '0')}` : null;
  const actions = def.actions.filter((a) => a.enabled);
  const actionId = selected?.startsWith('action:') ? selected.slice(7) : null;
  const go = (v) => { onSelect(null); setView(v); };

  const nav = [
    {
      label: 'Workspace',
      items: [
        { id: 'floor', label: 'Team floor', icon: 'home', onClick: () => go('floor') },
        { id: 'inbox', label: 'Inbox', icon: 'inbox', badge: pending.length || null, className: 'nx-nav-inbox', onClick: () => go('inbox') },
        {
          id: 'actions', label: `Actions · ${left} day${left === 1 ? '' : 's'} left`, icon: 'layers', className: 'nx-nav-actions',
          sub: actions.map((a) => {
            const av = a.options.map((o) => actionAvailability(def, state, a, o));
            const ok = av.some((x) => x.ok);
            return { id: `action:${a.id}`, label: a.name, meta: ok ? daysLabel(a) : '', disabled: !ok, title: ok ? T(def, a.description) : av[0]?.reason, onClick: () => onAction(a.id) };
          }),
        },
      ],
    },
    {
      label: 'Your quarter',
      items: [
        { id: 'objective', label: 'Objective', icon: 'target', onClick: () => onPanel('objective') },
        { id: 'pipeline', label: 'Sales funnel', icon: 'funnel', onClick: () => go('pipeline') },
        ...(game.liveLeaderboard !== false ? [{ id: 'leaderboard', label: `Leaderboard${rank ? ` #${rank.rank}` : ''}`, icon: 'trophy', onClick: () => onPanel('leaderboard') }] : []),
        { id: 'badges', label: 'Badges', icon: 'star', onClick: () => onPanel('badges') },
        { id: 'notebook', label: 'Notebook', icon: 'book', onClick: () => onPanel('notebook') },
        { id: 'guide', label: 'How it works', icon: 'help', onClick: () => onPanel('guide') },
      ],
    },
  ];
  const active = actionId ? `action:${actionId}` : selected ? 'inbox' : view;

  const sideCard = game.xp !== false ? (
    <div className="nx-level">
      <div className="nx-level-top"><span className="nx-level-n">{lv.index + 1}</span><div><strong>{lv.level.name}</strong><p>{state.dx.xp} XP{lv.next ? ` · ${lv.next.xp - state.dx.xp} to ${lv.next.name}` : ' · top level'}</p></div></div>
      <span className="nx-bar"><span style={{ width: `${lv.progress * 100}%` }} /></span>
      {state.dx.streak >= 2 && game.streaks !== false && <p><Icon name="flame" size={14} /> {state.dx.streak} strong decisions in a row</p>}
      <button type="button" className="nx-btn block" onClick={() => onPanel('badges')}>Your badges</button>
    </div>
  ) : null;

  const top = (
    <>
      <div className="nx-top-left">
        <TopChip icon="calendar" className="nx-clock"><span>Week <b>{week}</b> of {def.timeline.weeks} · {review ? 'Friday review' : state.phase === 'weekStart' ? 'Monday planning' : dayName(def, state.day)}</span></TopChip>
        {mm && <TopChip icon="clock" tone={timeLeft < 300 ? 'warn' : undefined} title="Simulation time left"><b>{mm}</b></TopChip>}
        {identity.group && <TopChip icon="team">{identity.group.name}</TopChip>}
      </div>
      <div className="nx-top-right">
        <button type="button" className="nx-chip nx-bell" aria-label={`Inbox, ${pending.length} waiting`} onClick={() => go('inbox')}><Icon name="bell" size={16} />{pending.length > 0 && <span className="nx-bell-dot" />}</button>
        {preview && <label className="nx-chip"><input type="checkbox" checked={xray} onChange={(e) => setXray(e.target.checked)} /> X-ray</label>}
        {onExit && <TopChip icon="exit" onClick={onExit}>{preview ? 'Back to Studio' : 'Save and exit'}</TopChip>}
        <Profile name={identity.name || 'You'} sub={rank ? `#${rank.rank} of ${rank.of} · ${T(def, '{{learner_role}}')}` : T(def, '{{learner_role}}')} />
      </div>
    </>
  );

  // Who is under the spotlight: whoever needs the learner first, otherwise the person struggling most.
  const first = pending[0];
  const struggling = [...ids].sort((a, b) => state.actors[a].m - state.actors[b].m)[0];
  const spotName = first?.sender?.name || state.actors[struggling]?.name;
  const spotActor = Object.values(state.actors).find((a) => a.name === spotName);
  const plate = first
    ? <><strong>{first.sender.name}</strong><span>{first.sender.role ? `${first.sender.role} · ` : ''}{CHANNEL[first.channel] || 'Email'} waiting</span></>
    : spotActor ? <><strong>{spotActor.name}</strong><span>{stageName(def, spotActor.stage)} · seems {moodOf(spotActor.m).label.toLowerCase()}</span></> : null;

  const skillV = vis === 'hidden' ? '?' : vis === 'bands' ? band(avg.s) : Math.round(avg.s);
  const moraleV = vis === 'hidden' ? '?' : vis === 'bands' ? band(avg.m) : Math.round(avg.m);
  const stats = (
    <>
      <StatCard icon="skill" label="Team skill" value={skillV} delta={vis === 'numbers' ? d('s') : null} deltaLabel="this week" sub={vis === 'hidden' ? 'Read it from what people say, or Assess' : null} className="nx-stats-team" />
      <StatCard icon="heart" tone="bad" label="Team morale" value={moraleV} delta={vis === 'numbers' ? d('m') : null} deltaLabel="this week" />
      <StatCard icon="chart" tone="cool" label="Team result" value={Math.round(avg.p)} delta={d('p')} deltaLabel="this week" />
      <StatCard icon="money" tone="good" label="Revenue" value={compact(def, pr.revenue)} sub={`of ${compact(def, pr.target * def.funnel.valuePerConversion)} target`} className="nx-stat-revenue" onClick={() => onPanel('objective')}>
        <span className="nx-bar" style={{ marginTop: 6 }}><span style={{ width: `${Math.min(100, pr.achieved * 100)}%` }} /></span>
      </StatCard>
      {(def.decisions?.kpis || []).map((k) => <StatCard key={k.id} icon="objective" tone="soft" label={k.label} value={Math.round(state.dx.kpis[k.id] ?? k.start)} sub={k.note} />)}
    </>
  );

  return (
    <Shell def={def} nav={nav} active={active} top={top} sideCard={sideCard} className="nx-play" label="Simulation">
      <div className="nx-work">
        <div className="nx-work-main">
          {children || (
            <>
              <section className="nx-hero play">
                <div className="nx-hero-text">
                  <span className="nx-kicker">{dayName(def, state.day)} · week {week}</span>
                  <h1>{pending.length ? <>{pending.length} thing{pending.length === 1 ? '' : 's'} need{pending.length === 1 ? 's' : ''}<br />you today.</> : <>A quieter moment.<br />Use it well.</>}</h1>
                  <p className="nx-lead">{left} day{left === 1 ? '' : 's'} left this week. {pending.length ? 'Reply before Friday, or the moment passes without you.' : 'Spend time with the people who need it, then end the day.'}</p>
                  <div className="nx-days" aria-label="This week">{Array.from({ length: dpw }, (_, i) => <span key={i} className={`nx-day ${i < today ? 'done' : i === today ? 'now' : ''}`}>{DAY_NAMES[i].slice(0, 3)}</span>)}</div>
                  {pending.length > 0 && (
                    <div className="nx-queue">
                      {pending.slice(0, 4).map((p) => (
                        <button key={p.key} type="button" className="nx-queue-item lx-waiting-card" onClick={() => onSelect(p.key)}>
                          <Face name={p.sender.name} size={38} />
                          <span className="nx-queue-text"><strong>{p.title}</strong><small>{p.sender.name} · {CHANNEL[p.channel] || 'Email'} · reply by Friday</small></span>
                          <span className="nx-queue-open">Open</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="nx-hero-actions">
                    {first ? <button type="button" className="nx-btn primary lg" onClick={() => onSelect(first.key)}><Icon name="play" size={16} /> Open {pending.length > 1 ? 'the first one' : 'it'}</button>
                      : <button type="button" className="nx-btn primary lg" onClick={() => onAction(actions[0]?.id)}><Icon name="layers" size={16} /> Take an action</button>}
                    {spotActor ? <button type="button" className="nx-btn lg" onClick={() => onPerson(spotActor.id)}><Icon name="team" size={16} /> See {spotActor.name.split(' ')[0]}'s profile</button>
                      : <button type="button" className="nx-btn lg" onClick={() => setView('floor')}><Icon name="grid" size={16} /> Look at the team</button>}
                  </div>
                </div>
                <HeroStage word={String(spotName || T(def, '{{company}}')).split(' ')[0].toUpperCase()} sub={spotActor ? stageName(def, spotActor.stage) : ''} plate={plate}>
                  {spotName && <Face name={spotName} size={320} bare />}
                </HeroStage>
              </section>
              <ViewTabs value={view} onChange={setView} tabs={[{ id: 'floor', label: 'Team floor', icon: 'grid' }, { id: 'inbox', label: 'Inbox', icon: 'inbox', badge: pending.length || null }, { id: 'pipeline', label: 'Sales funnel', icon: 'funnel' }]}
                right={<button type="button" className="nx-btn" onClick={() => onPanel('objective')}><Icon name="target" size={16} /> Objective</button>} />
              <div className="nx-surface">
                {view === 'floor' && <TeamFloor def={def} state={state} identity={identity} xray={xray} pending={pending} onOpen={onSelect} onPerson={onPerson} onEndDay={onEndDay} onFastForward={onFastForward} />}
                {view === 'inbox' && <Inbox def={def} inbox={inbox} selected={selected} onSelect={onSelect} />}
                {view === 'pipeline' && <FunnelBody def={def} state={state} />}
              </div>
            </>
          )}
        </div>
        <aside className="nx-work-side" aria-label="Your numbers">{stats}</aside>
      </div>
      <ProgressStrip className="nx-play-strip"
        progress={pace} progressLabel="Quarter" bar={{ label: `${left} day${left === 1 ? '' : 's'} left this week`, value: today / dpw }}
        count={{ icon: 'target', value: `${pr.conversions.toFixed(1)} / ${pr.target}` }} countLabel="Conversions"
        status={status[0]} statusTone={status[1]} statusSub={`${Math.round(pr.achieved * 100)}% of target`}
        action={(
          <>
            <button type="button" className="nx-btn" onClick={onFastForward} title="Moves to Friday. Anything unanswered this week will pass without you.">Skip to Friday</button>
            <button type="button" className="nx-btn primary lg nx-end-day lx-today-end" onClick={onEndDay}>{left <= 1 ? 'End the week' : 'End the day'} <Icon name="arrowRight" size={18} /></button>
          </>
        )} />
      {overlays}
    </Shell>
  );
}

function Inbox({ def, inbox, selected, onSelect }) {
  if (!inbox.length) return <p className="small muted">Nothing yet. Messages, meeting invites and business updates will land here.</p>;
  return (
    <ul className="nx-inbox lx-inbox" aria-label="Inbox">
      {inbox.map((i) => (
        <li key={i.key}>
          <button type="button" className={`lx-inbox-item ${selected === i.key ? 'on' : ''} ${i.pending ? 'pending' : ''} tone-${i.tone || i.band || ''}`} onClick={() => onSelect(i.key)}>
            <Avatar name={i.sender.name} size={34} />
            <span className="lx-inbox-text">
              <span className="row spread nowrap"><strong>{i.sender.name}</strong><span className="small muted">W{weekOf(def, i.day)} {dayName(def, i.day).slice(0, 3)}</span></span>
              <span className="lx-inbox-title">{i.title}</span>
              <span className="lx-inbox-preview">{i.preview}</span>
            </span>
            {i.pending && <span className="lx-dot" aria-label="Needs your reply" />}
            {i.band && <span className={`lx-band-dot ${i.band}`} aria-hidden="true" />}
          </button>
        </li>
      ))}
    </ul>
  );
}
