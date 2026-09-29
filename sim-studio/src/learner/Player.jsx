// The learner experience: the learner steps into the role and runs a quarter. It is one
// workspace (inbox, the conversation or meeting in front of them, their team and the numbers),
// with a Monday plan and a Friday wrap-up each week, and a debrief at the end.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRun, setWeeklyStyles, takeAction, proceed, weekOf, daysLeftInWeek, progress, teamAverages, teamIds, stageName, totalDays, desiredStyle } from '../engine/engine.js';
import { initDecisions, resolveDecision, afterTime, checkAchievements, recallItem, addReflection, pointsOf, say, dueDecisions, ACHIEVEMENTS, textVars } from '../engine/decisions.js';
import { evaluateOpen, openEvalPrompt, parseGenieEval } from '../engine/nlp.js';
import { applyDifficulty } from '../engine/authoring.js';
import { renderText } from '../engine/text.js';
import { clone } from '../engine/clone.js';
import { useSample } from '../studio/Tailoring.jsx';
import Moment, { Avatar, EffectChips } from './Moment.jsx';
import { WeekPlan, WrapUp } from './Week.jsx';
import { ActionGrid, ActionComposer } from './ActionPanel.jsx';
import Debrief from './Debrief.jsx';
import Prologue, { Cover, chaptersOf, minutesFor, LANG_NAMES } from './Prologue.jsx';
import Tour from './Tour.jsx';
import { Hud, TeamFloor, ActionsDock, ProfileModal, FunnelPanel, ObjectivePanel, LeaderPanel, BadgesPanel, Confetti } from './Floor.jsx';
import { LookProvider } from './look.jsx';
import { levelOf } from '../templates/ilead/look.js';
import { inboxOf, dayName, moodOf, trendOf, translateDef, buildDebrief, resultRecord, signalsFor, DAY_NAMES } from './model.js';

const GENIE_EVAL_MS = 15000;

function readSave(key) {
  if (!key) return null;
  try { const s = JSON.parse(localStorage.getItem(key)); return s?.v === 1 ? s : null; } catch { return null; }
}
function writeSave(key, data) {
  if (!key) return;
  try { localStorage.setItem(key, JSON.stringify({ v: 1, at: Date.now(), ...data })); } catch { /* storage full: the run continues in memory */ }
}
function dropSave(key) { try { if (key) localStorage.removeItem(key); } catch { /* nothing */ } }

export default function Player({ def: authored, mode = 'live', saveKey, delivery: deliveryIn, benchmark = [], leaderboard = [], identityDefaults = {}, onFinish, onExit, scorm }) {
  const delivery = deliveryIn || authored.delivery || {};
  const sample = useSample();
  const preview = mode === 'preview';
  const saved = useMemo(() => (preview ? null : readSave(saveKey)), [preview, saveKey]);
  const [identity, setIdentity] = useState(() => ({ name: identityDefaults.name || (preview ? 'Author preview' : ''), nickname: identityDefaults.nickname || '', cohortId: identityDefaults.cohortId || '', group: null, language: delivery.defaultLanguage || 'en', level: 'standard', ...(identityDefaults.lti ? { lti: identityDefaults.lti } : {}) }));
  const def = useMemo(() => {
    const d = translateDef(authored, identity.language);
    return identity.level === 'challenging' ? applyDifficulty(d, 'challenging') : d;
  }, [authored, identity.language, identity.level]);
  const [stage, setStage] = useState('welcome');
  const [state, setState] = useState(null);
  const [wrap, setWrap] = useState(null);
  const [selected, setSelected] = useState(null); // inbox key, 'action:<id>', or null for Today
  const [toasts, setToasts] = useState([]);
  const [error, setError] = useState('');
  const [evaluating, setEvaluating] = useState(false);
  const [rewind, setRewind] = useState(null); // { dpId, snap } until time moves on
  const [pane, setPane] = useState('now'); // phone layout
  const [xray, setXray] = useState(preview);
  const [panel, setPanel] = useState(null); // 'notebook' | 'guide' | 'person:<id>'
  const [notes, setNotes] = useState('');
  const [finished, setFinished] = useState(false);
  const [resultId, setResultId] = useState(null);
  const [tour, setTour] = useState(null); // step index of the first-time workspace tour
  const [toured, setToured] = useState(false);
  const [preset, setPreset] = useState(null); // targets chosen from a profile
  const [party, setParty] = useState(0); // confetti trigger
  const [timeUp, setTimeUp] = useState(false);
  const clock = useRef({ base: 0, since: Date.now() });
  const [, tick] = useState(0);
  const inflight = useRef(false);
  const live = useRef(null); // the latest run, so async work never writes over newer state
  live.current = state;

  // Autosave: a learner can close the tab and pick up where they left off.
  useEffect(() => {
    if (preview || stage === 'welcome' || stage === 'prologue' || !state) return undefined;
    const t = setTimeout(() => writeSave(saveKey, { identity, stage, state, wrap, notes, finished, toured, elapsed: elapsedNow() }), 400);
    return () => clearTimeout(t);
  }, [preview, saveKey, identity, stage, state, wrap, notes, finished, toured]);

  const toast = useCallback((items) => {
    const list = items.filter(Boolean).map((t, i) => ({ id: `${Date.now()}-${i}-${Math.random()}`, ...t }));
    if (!list.length) return;
    setToasts((x) => [...x, ...list].slice(-4));
    for (const t of list) setTimeout(() => setToasts((x) => x.filter((y) => y.id !== t.id)), 4200);
  }, []);

  // The session clock: runs only while playing, survives a reload.
  const elapsedNow = () => clock.current.base + (clock.current.since ? (Date.now() - clock.current.since) / 1000 : 0);
  useEffect(() => {
    if (stage !== 'play') { clock.current = { base: elapsedNow(), since: null }; return undefined; }
    if (!clock.current.since) clock.current = { base: clock.current.base, since: Date.now() };
    if (!(def.timeline.timeLimit > 0)) return undefined;
    const t = setInterval(() => {
      tick((n) => n + 1);
      if (!timeUp && def.timeline.timeLimit * 60 - elapsedNow() <= 0) setTimeUp(true);
    }, 1000);
    return () => clearInterval(t);
  }, [stage, def.timeline.timeLimit, timeUp]); // eslint-disable-line react-hooks/exhaustive-deps
  const timeLeft = def.timeline.timeLimit > 0 ? def.timeline.timeLimit * 60 - elapsedNow() : null;
  const endNow = () => { setTimeUp(false); setSelected(null); act((x) => { x.phase = 'ended'; return { ok: true }; }); };

  const start = (who) => {
    clock.current = { base: 0, since: Date.now() };
    setTimeUp(false);
    const seed = Math.floor(Math.random() * 1e9);
    const s = createRun(def, { seed });
    initDecisions(def, s);
    setIdentity(who);
    setState(s);
    setWrap(null);
    setSelected(null);
    setFinished(false);
    setResultId(null);
    setStage('play');
    scorm?.start?.(who);
  };
  const resume = () => {
    setIdentity(saved.identity);
    setState(saved.state);
    setWrap(saved.wrap);
    setNotes(saved.notes || '');
    setFinished(!!saved.finished);
    setToured(saved.toured ?? true);
    clock.current = { base: saved.elapsed || 0, since: Date.now() };
    setStage(saved.stage === 'welcome' || saved.stage === 'prologue' ? 'play' : saved.stage);
  };

  // Every change goes through here: time, consequences, recall, achievements, wrap-ups.
  const act = (fn, { keepRewind } = {}) => {
    const next = clone(live.current);
    const beforeWeek = weekOf(def, next.day);
    const beforeDay = next.day;
    const wasEnded = next.phase === 'ended';
    const res = fn(next);
    if (res && res.ok === false) { setError(res.error); return res; }
    setError('');
    const t = afterTime(def, next);
    const earned = checkAchievements(def, next);
    const game = def.gamification || {};
    const lvBefore = levelOf(game, live.current.dx.xp).index;
    const lvAfter = levelOf(game, next.dx.xp);
    const pBefore = progress(def, live.current).achieved;
    const pAfter = progress(def, next).achieved;
    next.dx.milestones ||= [];
    const crossed = game.celebrations === false ? [] : [0.25, 0.5, 0.75, 1].filter((m) => pBefore < m && pAfter >= m && !next.dx.milestones.includes(m));
    next.dx.milestones.push(...crossed);
    const streakUp = game.streaks !== false && next.dx.streak >= 3 && next.dx.streak > (live.current.dx.streak || 0);
    if ((lvAfter.index > lvBefore && game.xp !== false) || crossed.length || earned.length) setParty((n) => n + 1);
    toast([
      ...(lvAfter.index > lvBefore && game.xp !== false ? [{ kind: 'achievement', title: `Level up: ${lvAfter.level.name}`, text: `Level ${lvAfter.index + 1} of ${lvAfter.count}. Keep reading your people well.` }] : []),
      ...crossed.map((m) => ({ kind: 'milestone', title: m >= 1 ? 'Target reached!' : `${Math.round(m * 100)}% of your target`, text: m >= 1 ? 'You have hit the number the board set. Now see how far past it you can go.' : `${progress(def, next).conversions.toFixed(1)} of ${def.funnel.target} conversions so far.` })),
      ...(streakUp ? [{ kind: 'streak', title: `${next.dx.streak} strong decisions in a row`, text: 'Streak bonus XP. Keep it going.' }] : []),
      ...t.landed.map((l) => ({ kind: 'consequence', title: l.title, text: l.text, effects: l.effects })),
      ...t.expired.map((e) => ({ kind: 'missed', title: 'A moment passed without you', text: e.reaction })),
      ...earned.map((id) => ({ kind: 'achievement', title: `Achievement: ${ACHIEVEMENTS.find((a) => a.id === id)?.label}`, text: ACHIEVEMENTS.find((a) => a.id === id)?.note })),
    ]);
    if (next.day !== beforeDay && !keepRewind) setRewind(null);
    const afterWeek = weekOf(def, next.day);
    if ((next.phase === 'weekStart' && afterWeek > beforeWeek) || (next.phase === 'ended' && !wasEnded)) {
      const recall = def.learning?.recall !== false ? recallItem(def, next, beforeWeek) : null;
      setWrap({ week: beforeWeek, ended: next.phase === 'ended', recall });
      setSelected(null);
    }
    live.current = next;
    setState(next);
    scorm?.progress?.(next);
    return res;
  };

  const startWeek = (styles) => {
    const first = weekOf(def, live.current.day) === 1;
    act((s) => setWeeklyStyles(def, s, styles));
    if (first && !toured && def.onboarding?.tour !== false) { setSelected(null); setPane('now'); setTour(0); }
  };
  const endTour = () => { setTour(null); setToured(true); };
  const endDay = () => { setSelected(null); act((s) => proceed(def, s)); };
  const fastForward = () => {
    setSelected(null);
    act((s) => { const w = weekOf(def, s.day); let g = 0; while (s.phase === 'day' && weekOf(def, s.day) === w && g++ < 10) { proceed(def, s); afterTime(def, s); } return { ok: true }; });
  };
  const doAction = (req) => { const r = act((s) => takeAction(def, s, req)); if (r?.ok) setSelected(null); };

  const submitMoment = async (dp, answer) => {
    if (inflight.current) return;
    inflight.current = true;
    const snap = clone(live.current);
    let openResult;
    if (dp.type === 'open') {
      const vars = textVars(def, state, dp);
      const rules = evaluateOpen(def, dp, answer.text, { vars, state });
      openResult = rules;
      if (sample && def.decisions?.nlp?.evaluator !== 'rules') {
        setEvaluating(true);
        try {
          let timer;
          const reply = await Promise.race([sample.json(openEvalPrompt(def, dp, answer.text, vars), { cache: false }), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), GENIE_EVAL_MS); })]);
          clearTimeout(timer);
          openResult = parseGenieEval(def, dp, reply, rules);
        } catch { openResult = rules; }
        setEvaluating(false);
      }
    }
    const rewound = !!rewind?.redo?.[dp.id];
    act((s) => { resolveDecision(def, s, dp, answer, { openResult, rewound }); return { ok: true }; }, { keepRewind: true });
    const canRetry = dp.retry !== false && (def.learning?.rewinds ?? 2) > (snap.dx.rewindsUsed || 0);
    setRewind((r) => (canRetry ? { dpId: dp.id, snap, redo: r?.redo || {} } : null));
    inflight.current = false;
  };
  const doRewind = () => {
    if (!rewind) return;
    const s = clone(rewind.snap);
    s.dx.rewindsUsed = (s.dx.rewindsUsed || 0) + 1;
    setState(s);
    setRewind({ dpId: rewind.dpId, snap: null, redo: { ...(rewind.redo || {}), [rewind.dpId]: true } });
  };

  const continueWrap = (reflection) => {
    const w = wrap;
    if (reflection) act((s) => { addReflection(def, s, reflection.prompt, reflection.text); return { ok: true }; });
    setWrap(null);
    if (w.ended) {
      setStage('debrief');
      scorm?.complete?.(state);
    }
  };
  const updateRun = (fn) => { const n = clone(live.current); fn(n); live.current = n; setState(n); };

  const debrief = useMemo(() => (stage === 'debrief' && state ? buildDebrief(def, state, identity) : null), [stage, state, def, identity]);
  const finish = () => {
    if (!debrief) return;
    if (preview) { onExit?.(); return; }
    const rec = resultRecord(def, state, debrief, { name: identity.name, nickname: identity.nickname || identity.name, cohortId: identity.cohortId || null, group: identity.group?.name || null, members: identity.group?.members || null, language: identity.language, level: identity.level, lti: identity.lti || null, reflections: state.dx.reflections });
    setResultId(rec.id);
    setFinished(true);
    onFinish?.(rec);
    scorm?.finish?.(rec);
    dropSave(saveKey);
  };
  const replay = (hard) => {
    dropSave(saveKey);
    const level = hard ? 'challenging' : identity.level;
    const base = translateDef(authored, identity.language);
    const d = level === 'challenging' ? applyDifficulty(base, 'challenging') : base;
    const s = createRun(d, { seed: Math.floor(Math.random() * 1e9) });
    initDecisions(d, s);
    setIdentity((x) => ({ ...x, level }));
    clock.current = { base: 0, since: Date.now() }; setTimeUp(false);
    setState(s); setWrap(null); setSelected(null); setFinished(false); setResultId(null); setRewind(null); setStage('play');
  };

  if (stage === 'welcome' || stage === 'prologue' || !state) {
    const langs = delivery.languages || ['en'];
    const ready = <ReadyForm def={def} identity={identity} delivery={delivery} preview={preview} onStart={start} />;
    if (stage === 'prologue') return <LookProvider def={def}><Prologue def={def} preview={preview} onExit={onExit} onBack={() => setStage('welcome')} ready={ready} /></LookProvider>;
    return (
      <LookProvider def={def}>
        <Cover def={def} saved={saved} savedWeek={saved ? Math.min(weekOf(authored, saved.state.day), authored.timeline.weeks) : 0} langs={langs} language={identity.language}
          setLanguage={(l) => setIdentity((x) => ({ ...x, language: l }))} preview={preview} onExit={onExit} onResume={resume}
          onBegin={() => setStage('prologue')} onSkip={() => start({ ...identity, name: identity.name || 'Author preview' })} />
      </LookProvider>
    );
  }

  const rows = leaderboard.filter((r) => !identity.cohortId || r.cohortId === identity.cohortId);
  const hudProps = { def, state, identity, preview, xray, setXray, onExit, timeLeft, onPanel: setPanel };
  if (stage === 'debrief' && debrief) {
    const you = resultId || 'you';
    const withYou = finished ? rows : [...rows, { id: 'you', name: identity.name, nickname: identity.nickname || identity.name || 'You', score: debrief.overall.score, parts: debrief.overall.parts, conversions: debrief.progress.conversions, xp: debrief.xp, group: identity.group?.name }];
    return (
      <LookProvider def={def}>
        <div className="lx-root">
          <Hud {...hudProps} onPanel={() => {}} ended timeLeft={null} />
          <main className="lx-scroll"><Debrief def={def} d={debrief} benchmark={benchmark} leaderboard={withYou} delivery={delivery} onReplay={replay} onFinish={finish} finished={finished} mode={mode} you={you} /></main>
        </div>
        <Confetti run={party} />
      </LookProvider>
    );
  }

  const inbox = inboxOf(def, state);
  const item = selected && inbox.find((i) => i.key === selected);
  const actionId = selected?.startsWith('action:') ? selected.slice(7) : null;
  const personId = panel?.startsWith('person:') ? panel.slice(7) : null;
  const pending = inbox.filter((i) => i.pending);
  const rewindsLeft = (def.learning?.rewinds ?? 2) - (state.dx.rewindsUsed || 0);
  const liveYou = (() => {
    const d = buildLiveScore(def, state);
    return { id: 'you', name: identity.name, nickname: `${identity.nickname || identity.name || 'You'} (now)`, score: d.score, parts: d.parts, conversions: progress(def, state).conversions, xp: state.dx.xp };
  })();
  const sorted = [...rows, liveYou].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const rank = def.gamification?.liveRank !== false && rows.length ? { rank: sorted.findIndex((r) => r.id === 'you') + 1, of: sorted.length } : null;
  const openAction = (aid, target) => { setPreset(target ? [target] : null); setPanel(null); setSelected(`action:${aid}`); setPane('now'); };

  return (
    <LookProvider def={def}>
      <div className="lx-root" style={def.look?.brand ? { '--brand': def.look.brand } : undefined}>
        <Hud {...hudProps} review={wrap?.week} rank={rank} />
        <div className={`lx-work pane-${pane}`}>
          <aside className="lx-inbox" aria-label="Inbox">
            <div className="lx-pane-head"><strong>Inbox</strong>{pending.length > 0 && <span className="lx-count-pill">{pending.length} need you</span>}</div>
            <ul>
              {inbox.map((i) => (
                <li key={i.key}>
                  <button type="button" className={`lx-inbox-item ${selected === i.key ? 'on' : ''} ${i.pending ? 'pending' : ''} tone-${i.tone || i.band || ''}`} onClick={() => { setSelected(i.key); setPane('now'); }}>
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
          </aside>

          <main className="lx-stage" aria-label="Now">
            {error && <div className="lx-error" role="alert">{error}</div>}
            {item?.kind === 'moment' ? (
              <Moment key={`${item.dp.id}:${state.dx.answered[item.dp.id]?.attempts || 0}:${state.dx.rewindsUsed}`} def={def} state={state} dp={item.dp} answered={state.dx.answered[item.dp.id]} onSubmit={submitMoment} evaluating={evaluating} xray={xray} group={identity.group} hintsOn={def.learning?.hints !== false}
                canRewind={!!rewind?.snap && rewind.dpId === item.dp.id && state.dx.answered[item.dp.id]?.band !== 'strong' && rewindsLeft > 0 && !state.dx.answered[item.dp.id]?.expired} rewindsLeft={rewindsLeft} onRewind={doRewind}
                onBack={() => setSelected(null)} next={pending.find((p) => p.key !== item.key)} onNext={() => setSelected(pending.find((p) => p.key !== item.key)?.key || null)} />
            ) : item ? (
              <article className="lx-moment">
                <button type="button" className="lx-back" onClick={() => setSelected(null)}><span aria-hidden="true">←</span> Team floor</button>
                <header className="lx-moment-head"><div className="row nowrap" style={{ '--gap': '12px' }}><Avatar name={item.sender.name} size={46} /><div><div className="lx-from"><strong>{item.sender.name}</strong>{item.sender.role && <span className="muted"> · {item.sender.role}</span>}</div><div className="lx-subject">{item.title}</div></div></div></header>
                <div className="lx-thread"><div className={`lx-bubble them ${item.kind === 'story' ? 'mail' : ''}`}><p>{item.text}</p></div></div>
              </article>
            ) : actionId ? (
              <ActionComposer key={`${actionId}:${(preset || []).join()}`} def={def} state={state} action={def.actions.find((a) => a.id === actionId)} xray={xray} initialTargets={preset || []} onCancel={() => { setSelected(null); setPreset(null); }} onSubmit={(r) => { setPreset(null); doAction(r); }} />
            ) : (
              <TeamFloor def={def} state={state} identity={identity} xray={xray} pending={pending} onOpen={setSelected} onPerson={(id) => setPanel(`person:${id}`)} onEndDay={endDay} onFastForward={fastForward} />
            )}
          </main>

          <ActionsDock def={def} state={state} onPick={(aid) => openAction(aid)} onFunnel={() => setPanel('funnel')} />
        </div>

        <nav className="lx-tabs" aria-label="Views">
          {[['inbox', `Inbox${pending.length ? ` (${pending.length})` : ''}`], ['now', 'Team floor'], ['team', 'Actions']].map(([id, l]) => <button key={id} type="button" className={pane === id ? 'on' : ''} onClick={() => setPane(id)}>{l}</button>)}
        </nav>

        {state.phase === 'weekStart' && !wrap && <WeekPlan def={def} state={state} onStart={startWeek} xray={xray} group={identity.group} />}
        {tour !== null && state.phase === 'day' && !wrap && <Tour step={tour} onStep={setTour} onDone={endTour} />}
        {wrap && <WrapUp key={wrap.week} def={def} state={state} wrap={wrap} onContinue={continueWrap} onUpdate={updateRun} />}
        {personId && state.actors[personId] && <ProfileModal def={def} state={state} id={personId} xray={xray} onClose={() => setPanel(null)} onAction={openAction} />}
        {panel === 'notebook' && <Notebook def={def} state={state} notes={notes} setNotes={setNotes} onClose={() => setPanel(null)} />}
        {panel === 'guide' && <Guide def={def} onClose={() => setPanel(null)} />}
        {panel === 'funnel' && <FunnelPanel def={def} state={state} onClose={() => setPanel(null)} />}
        {panel === 'objective' && <ObjectivePanel def={def} state={state} onClose={() => setPanel(null)} />}
        {panel === 'leaderboard' && <LeaderPanel def={def} rows={rows} you={liveYou} delivery={delivery} benchmark={benchmark} onClose={() => setPanel(null)} />}
        {panel === 'badges' && <BadgesPanel def={def} state={state} onClose={() => setPanel(null)} />}
        {timeUp && !wrap && state.phase !== 'ended' && (
          <div className="lx-overlay" role="dialog" aria-modal="true" aria-label="Time is up">
            <div className="lx-sheet lx-timeup">
              <div className="lx-kicker">Simulation time</div>
              <h2>Time is up</h2>
              <p className="muted">The {def.timeline.timeLimit} minutes for this session have run out. Your quarter ends here and your debrief shows how far you got.</p>
              <div className="lx-sheet-foot"><button type="button" className="btn primary lg" onClick={endNow}>See how the quarter went</button></div>
            </div>
          </div>
        )}

        <div className="lx-toasts" role="status" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`lx-toast ${t.kind}`}>
              <button type="button" className="lx-toast-x" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>×</button>
              <strong>{t.title}</strong>
              {t.text && <p>{t.text}</p>}
              {t.effects && <EffectChips effects={t.effects} />}
            </div>
          ))}
        </div>
        <Confetti run={party} />
      </div>
    </LookProvider>
  );
}

// The score so far, as the debrief would compute it now: used for the live leaderboard.
const liveCache = new WeakMap();
function buildLiveScore(def, state) {
  if (liveCache.has(state)) return liveCache.get(state);
  let v;
  try { v = buildDebrief(def, state, {}).overall; } catch { v = { score: 0, parts: {} }; }
  liveCache.set(state, v);
  return v;
}

function LxHeader({ def, state, identity, preview, xray, setXray, onExit, onNotebook, onGuide, ended, review }) {
  const pr = progress(def, state);
  const avg = teamAverages(state);
  const week = Math.min(weekOf(def, state.day), def.timeline.weeks);
  const pts = pointsOf(def);
  return (
    <header className="lx-header">
      <div className="lx-brand"><span className="lx-mark" aria-hidden="true">{renderText(def, '{{company}}').slice(0, 1)}</span><span className="lx-company">{renderText(def, '{{company}}')}</span></div>
      <div className="lx-when">
        <strong>{ended ? 'Quarter complete' : review ? `Week ${review} · Friday review` : `Week ${week} · ${state.phase === 'weekStart' ? 'Monday planning' : dayName(def, state.day)}`}</strong>
        <div className="lx-timeline" aria-label={`Week ${week} of ${def.timeline.weeks}`}>
          {Array.from({ length: def.timeline.weeks }, (_, i) => {
            const w = i + 1;
            const here = pts.filter((p) => p.week === w && state.dx.answered[p.id]);
            const bands = here.map((p) => state.dx.answered[p.id].band);
            return <span key={w} className={`lx-tl-week ${w < week || ended ? 'past' : w === week ? 'now' : ''}`} title={`Week ${w}`}>{bands.map((b, j) => <i key={j} className={b} />)}</span>;
          })}
        </div>
      </div>
      <div className="lx-kpis">
        <div className="lx-kpi"><span className="lx-kpi-label">Conversions</span><span className="lx-kpi-value num">{pr.conversions.toFixed(1)}<span className="muted">/{pr.target}</span></span><span className="lx-kpi-bar"><span style={{ width: `${Math.min(100, pr.achieved * 100)}%` }} /></span></div>
        <div className="lx-kpi"><span className="lx-kpi-label">Team morale</span><span className="lx-kpi-value num">{Math.round(avg.m)}</span></div>
        {(def.decisions?.kpis || []).map((k) => <div key={k.id} className="lx-kpi"><span className="lx-kpi-label">{k.label}</span><span className="lx-kpi-value num">{Math.round(state.dx.kpis[k.id] ?? k.start)}</span></div>)}
        {def.gamification?.xp !== false && <div className="lx-kpi xp"><span className="lx-kpi-label">XP</span><span className="lx-kpi-value num">{state.dx.xp}</span></div>}
      </div>
      <div className="lx-head-actions">
        {identity.group && <span className="lx-chip">{identity.group.name}</span>}
        {preview && <label className="lx-xray-toggle"><input type="checkbox" checked={xray} onChange={(e) => setXray(e.target.checked)} /> X-ray</label>}
        {onNotebook && <button type="button" className="btn ghost sm lx-on-dark" onClick={onNotebook}>Notebook</button>}
        {onGuide && <button type="button" className="btn ghost sm lx-on-dark" onClick={onGuide}>How it works</button>}
        {onExit && <button type="button" className="btn sm lx-on-dark" onClick={onExit}>{preview ? 'Back to Studio' : 'Save and exit'}</button>}
      </div>
    </header>
  );
}

function Today({ def, state, pending, onOpen, onAction, onEndDay, onFastForward }) {
  const left = daysLeftInWeek(def, state);
  const week = weekOf(def, state.day);
  const dpw = def.timeline.daysPerWeek;
  const today = state.day % dpw;
  const upcoming = pointsOf(def).filter((p) => p.week === week && !state.dx.answered[p.id] && (p.day || 1) - 1 > today).length;
  return (
    <div className="lx-today">
      <div>
        <div className="lx-kicker">{dayName(def, state.day)}, week {week}</div>
        <h1>{pending.length ? `${pending.length} thing${pending.length === 1 ? '' : 's'} need${pending.length === 1 ? 's' : ''} you today` : 'A quieter moment. Use it well.'}</h1>
        <p className="ink2">{left} day{left === 1 ? '' : 's'} left this week.{upcoming ? ` More will land in your inbox before Friday.` : ''}</p>
      </div>
      <div className="lx-days" aria-label="This week">
        {Array.from({ length: dpw }, (_, i) => <span key={i} className={`lx-day ${i < today ? 'done' : i === today ? 'now' : ''}`}>{DAY_NAMES[i].slice(0, 3)}</span>)}
      </div>
      {pending.length > 0 && (
        <div className="lx-waiting">
          {pending.map((p) => (
            <button key={p.key} type="button" className="lx-waiting-card" onClick={() => onOpen(p.key)}>
              <Avatar name={p.sender.name} size={36} />
              <span className="grow"><strong>{p.title}</strong><span className="small muted">{p.sender.name} · {p.channel === 'meeting' ? 'Meeting' : p.channel === 'call' ? 'Call' : p.channel === 'dashboard' ? 'Business update' : p.channel === 'chat' ? 'Chat' : 'Email'} · reply by Friday</span></span>
              <span className="lx-open">Open</span>
            </button>
          ))}
        </div>
      )}
      <div>
        <h3>Things you can do</h3>
        <p className="small muted">Each takes time from your week. Choose where your time goes.</p>
        <ActionGrid def={def} state={state} onPick={onAction} />
      </div>
      <div className="lx-today-foot">
        <button type="button" className="btn ghost" onClick={onFastForward} title="Moves to Friday. Anything unanswered this week will pass without you.">Skip to Friday</button>
        <button type="button" className="btn primary lg" onClick={onEndDay}>{left <= 1 ? 'End the week' : 'End the day'}</button>
      </div>
    </div>
  );
}

function PersonPanel({ def, state, a, xray, onClose }) {
  const src = def.actors.find((x) => x.id === a.id);
  const sig = signalsFor(def, state, a.id);
  return (
    <div className="lx-side" role="dialog" aria-modal="true" aria-label={a.name} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lx-side-panel">
        <div className="row spread"><div className="row nowrap" style={{ '--gap': '10px' }}><Avatar name={a.name} size={48} /><div><h2>{a.name}</h2><span className="small muted">{stageName(def, a.stage)} · {src?.experience}</span></div></div><button type="button" className="btn ghost sm" onClick={onClose}>Close</button></div>
        <p className="ink2">{renderText(def, src?.bio || '', { actor: a.name, pronoun: a.pronoun })}</p>
        <div className="lx-person-stats">
          <div><span className="small muted">Performance</span><strong className="num">{Math.round(a.p)}</strong></div>
          <div><span className="small muted">Seems</span><strong>{sig.mood.label}</strong></div>
          {sig.assessed && <div><span className="small muted">Assessed</span><strong className="num">S {sig.assessed.s} · M {sig.assessed.m}</strong></div>}
          {xray && <div><span className="small muted">X-ray</span><strong className="num">S {Math.round(a.s)} · M {Math.round(a.m)}</strong></div>}
        </div>
        {sig.lines.length > 0 && <><h3>Recently</h3>{sig.lines.map((l, i) => <p key={i} className="lx-signal">"{l}"</p>)}</>}
        <p className="small muted">Use Assess member to learn more about someone's skill and morale.</p>
      </div>
    </div>
  );
}

function Notebook({ def, state, notes, setNotes, onClose }) {
  const lessons = pointsOf(def).map((p) => ({ p, a: state.dx.answered[p.id] })).filter((x) => x.a && x.a.feedback);
  return (
    <div className="lx-side" role="dialog" aria-modal="true" aria-label="Notebook" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lx-side-panel">
        <div className="row spread"><h2>Notebook</h2><button type="button" className="btn ghost sm" onClick={onClose}>Close</button></div>
        <label className="field"><span className="label">Your notes</span><textarea className="textarea" rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What have you noticed about your team? Notes stay with this run." /></label>
        <h3>What you have learned so far</h3>
        {lessons.length ? lessons.map(({ p, a }) => <div key={p.id} className="lx-note"><span className={`lx-band-dot ${a.band}`} aria-hidden="true" /><div><strong className="small">{say(def, state, p, p.title)}</strong><p className="small ink2">{a.feedback}</p></div></div>) : <p className="small muted">Your coach's notes will collect here as you make decisions.</p>}
      </div>
    </div>
  );
}

function Guide({ def, onClose }) {
  return (
    <div className="lx-side" role="dialog" aria-modal="true" aria-label="How it works" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lx-side-panel">
        <div className="row spread"><h2>How it works</h2><button type="button" className="btn ghost sm" onClick={onClose}>Close</button></div>
        <ol className="lx-guide">
          <li><strong>Monday:</strong> choose how you will lead each person this week, from what you can see of them.</li>
          <li><strong>During the week:</strong> answer what lands in your inbox (emails, chats, meetings, updates) and choose where your time goes. Each action costs days.</li>
          <li><strong>Consequences:</strong> people, numbers and trust respond right away, and some decisions come back weeks later.</li>
          <li><strong>Friday:</strong> see what happened, answer one recall question and, when asked, reflect.</li>
          <li><strong>At the end:</strong> a debrief on what happened and why, and what to practise next.</li>
        </ol>
        <p className="small muted">The four styles: {def.leadership.styles.map((s) => `${s.name} (${s.definition.toLowerCase()})`).join(' · ')}</p>
      </div>
    </div>
  );
}

// The last step of the prologue: the learner accepts the role (name, cohort, group) and begins.
function ReadyForm({ def, identity, delivery, preview, onStart }) {
  const [who, setWho] = useState(identity);
  const [code, setCode] = useState(identity.cohortId ? (delivery.cohorts || []).find((c) => c.id === identity.cohortId)?.code || '' : '');
  const [asGroup, setAsGroup] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [members, setMembers] = useState('');
  const now = Date.now();
  const cohorts = (delivery.cohorts || []).filter((c) => c.status !== 'closed' && (!c.closes || new Date(`${c.closes}T23:59:59`).getTime() >= now) && (!c.opens || new Date(`${c.opens}T00:00:00`).getTime() <= now));
  const cohort = cohorts.find((c) => c.code.toLowerCase() === code.trim().toLowerCase());
  const needsCode = cohorts.length > 0 && !preview && !identity.lti;
  const memberList = members.split(/[,\n]/).map((m) => m.trim()).filter(Boolean);
  const gmin = delivery.groupSize?.min || 2;
  const gmax = delivery.groupSize?.max || 6;
  const groupOk = !asGroup || (groupName.trim() && memberList.length >= gmin && memberList.length <= gmax);
  const ok = (preview || who.name.trim() || (asGroup && groupName.trim())) && (!needsCode || cohort || !code.trim()) && groupOk;
  const T = (x) => renderText(def, x);
  return (
    <div className="lx-ready">
      <div className="lx-ready-summary">
        <p>{T(`You are the new {{learner_role}} at {{company}}. You lead ${teamIdsCount(def)} people selling {{product}}, and you have ${def.timeline.weeks} weeks to reach ${def.funnel.target} conversions.`)}</p>
        <ul>
          <li>Each Monday you choose how to lead each person.</li>
          <li>During the week you answer what lands in your inbox and decide where your time goes.</li>
          <li>Each Friday you see what happened. At the end, a debrief shows why.</li>
        </ul>
        <p className="small muted">About {minutesFor(def)} minutes. Your progress saves as you go, so you can stop and come back.</p>
      </div>
      <div className="lx-ready-form">
        {!preview && !identity.lti && (
          <label className="field"><span className="label">Sign as</span><input className="input" value={who.name} onChange={(e) => setWho({ ...who, name: e.target.value })} placeholder="Your first and last name" autoFocus /></label>
        )}
        {identity.lti && <p className="small">Signed in from {identity.lti.platform || 'your learning platform'} as <strong>{who.name}</strong>.</p>}
        {preview && <p className="small muted">Author preview: nothing you do here is saved as a result.</p>}
        {!preview && delivery.leaderboard && (
          <label className="field"><span className="label">Name on the leaderboard <span className="muted">(optional)</span></span><input className="input" value={who.nickname} onChange={(e) => setWho({ ...who, nickname: e.target.value })} placeholder={who.name || 'A nickname'} /></label>
        )}
        {needsCode && (
          <label className="field"><span className="label">Cohort code <span className="muted">(from your facilitator)</span></span><input className="input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. MUM-24" />
            {code.trim() && (cohort ? <span className="hint" style={{ color: 'var(--good)' }}>You are joining {cohort.name}.</span> : <span className="hint" style={{ color: 'var(--bad)' }}>That code does not match an open cohort.</span>)}
          </label>
        )}
        {delivery.group && !preview && (
          <div className="field">
            <label className="switch"><input type="checkbox" checked={asGroup} onChange={(e) => setAsGroup(e.target.checked)} /> <span>We are playing as a group</span></label>
            {asGroup && (
              <div className="stack" style={{ '--gap': '8px', marginTop: 8 }}>
                <input className="input" aria-label="Group name" value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Group name, e.g. Team Falcon" />
                <textarea className="textarea" rows={2} aria-label="Group members" value={members} onChange={(e) => setMembers(e.target.value)} placeholder={`Names of the ${gmin} to ${gmax} people playing, separated by commas`} />
                {members.trim() && !groupOk && <span className="hint" style={{ color: 'var(--bad)' }}>Groups have {gmin} to {gmax} people.</span>}
              </div>
            )}
          </div>
        )}
        <button type="button" className="btn primary lg lx-start" disabled={!ok} onClick={() => onStart({ ...who, cohortId: cohort?.id || who.cohortId || '', group: asGroup ? { name: groupName.trim(), members: memberList } : null, name: who.name || (asGroup ? groupName.trim() : '') || (preview ? 'Author preview' : '') })}>
          Accept the role and start week 1
        </button>
      </div>
    </div>
  );
}

const teamIdsCount = (def) => def.actors.filter((a) => a.pool === 'team').length;
export { totalDays, dueDecisions };
