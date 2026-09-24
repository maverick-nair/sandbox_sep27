// One decision moment, shown the way it would arrive at work: an email, a chat, a meeting,
// a call or a business update. The learner answers inside the conversation; the stakeholder
// replies, the consequences show, and a short coach's note explains why.
import { useEffect, useMemo, useState } from 'react';
import { CHANNELS, situationText, say, senderOf, conditionMet, textVars } from '../engine/decisions.js';
import { stageName, desiredStyle } from '../engine/engine.js';
import { shuffled, rankStart, avatarColor, initials, dayName } from './model.js';

export function Avatar({ name, size = 36, color }) {
  return <span className="lx-avatar" style={{ width: size, height: size, fontSize: size * 0.38, background: color || avatarColor(name) }} aria-hidden="true">{initials(name)}</span>;
}

export function EffectChips({ effects }) {
  if (!effects?.length) return null;
  return (
    <div className="lx-effects" aria-label="What changed">
      {effects.map((e, i) => (
        <span key={i} className={`lx-chip ${e.delta > 0 ? 'up' : 'down'}`}>
          <span aria-hidden="true">{e.delta > 0 ? '▲' : '▼'}</span> {e.label} {e.delta > 0 ? `+${e.delta}` : e.delta}
        </span>
      ))}
    </div>
  );
}

export default function Moment({ def, state, dp, answered, onSubmit, evaluating, onRewind, canRewind, rewindsLeft, xray, group, hintsOn, onBack, next, onNext }) {
  const sender = senderOf(def, state, dp);
  const ch = CHANNELS[dp.channel] || CHANNELS.email;
  const text = situationText(def, state, dp);
  const title = say(def, state, dp, dp.title);
  const prompt = say(def, state, dp, dp.prompt);
  const [typing, setTyping] = useState(!answered && (dp.channel === 'chat' || dp.channel === 'call'));
  useEffect(() => { if (!typing) return undefined; const t = setTimeout(() => setTyping(false), 900); return () => clearTimeout(t); }, [typing]);
  const about = dp.about ? state.actors[dp.about] : null;
  const participants = [sender.name, ...(dp.about2 && state.actors[dp.about2] ? [state.actors[dp.about2].name] : []), ...(dp.about && state.actors[dp.about] && state.actors[dp.about].name !== sender.name ? [state.actors[dp.about].name] : [])];

  return (
    <article className={`lx-moment ch-${dp.channel}`} aria-label={title}>
      {onBack && <button type="button" className="lx-back" onClick={onBack} disabled={evaluating}><span aria-hidden="true">←</span> Today</button>}
      <header className="lx-moment-head">
        {dp.channel === 'meeting' || dp.channel === 'call' ? (
          <div className="lx-room">
            <span className="lx-room-label">{dp.channel === 'call' ? 'Call' : 'Meeting room'} · {dayName(def, state.day)}</span>
            <div className="lx-room-people">{participants.map((n) => <span key={n} className="lx-room-person"><Avatar name={n} size={44} /><span>{n.split(' ')[0]}</span></span>)}<span className="lx-room-person you"><Avatar name="You" size={44} color="var(--ink)" /><span>You</span></span></div>
          </div>
        ) : (
          <div className="row nowrap" style={{ '--gap': '12px' }}>
            <Avatar name={sender.name} size={42} />
            <div className="grow">
              <div className="lx-from"><strong>{sender.name}</strong>{sender.role && <span className="muted"> · {sender.role}</span>}</div>
              <div className="lx-subject">{dp.channel === 'email' ? title : `${ch.label}: ${title}`}</div>
            </div>
            {!answered && <span className="lx-due">Reply by Friday</span>}
          </div>
        )}
      </header>

      <div className="lx-thread">
        {dp.channel === 'dashboard' && <DashboardSnap def={def} state={state} />}
        {typing ? <div className="lx-bubble them typing" aria-label={`${sender.name} is typing`}><span /><span /><span /></div> : (
          <div className={`lx-bubble them ${dp.channel === 'email' ? 'mail' : ''} ${dp.channel === 'meeting' || dp.channel === 'dashboard' ? 'scene' : ''}`}>
            {(dp.channel === 'meeting' || dp.channel === 'call') && about && <span className="lx-speaker">{about.name}</span>}
            <p>{text}</p>
          </div>
        )}
        {xray && about && <p className="lx-xray">X-ray: {about.name} has skill {Math.round(about.s)}, morale {Math.round(about.m)} and needs {def.leadership.styles.find((s) => s.id === desiredStyle(def, about.s, about.m))?.name}.</p>}

        {answered ? <Answered def={def} state={state} dp={dp} a={answered} sender={sender} onRewind={onRewind} canRewind={canRewind} rewindsLeft={rewindsLeft} onBack={onBack} next={next} onNext={onNext} /> : !typing && (
          <Respond def={def} state={state} dp={dp} prompt={prompt} verb={ch.verb} onSubmit={onSubmit} evaluating={evaluating} xray={xray} group={group} hintsOn={hintsOn} />
        )}
      </div>
    </article>
  );
}

function DashboardSnap({ def, state }) {
  const totals = state.funnel.stageTotals;
  const max = Math.max(1, ...totals);
  const lastWeek = state.funnel.daily.slice(-def.timeline.daysPerWeek);
  return (
    <div className="lx-dash">
      <div className="lx-dash-title">Work passed on by each stage, so far this quarter</div>
      {def.stages.map((s, i) => (
        <div key={s.id} className="lx-dash-row">
          <span>{s.name}</span>
          <span className="lx-dash-track"><span style={{ width: `${(totals[i] / max) * 100}%` }} /></span>
          <span className="num">{totals[i].toFixed(0)}</span>
        </div>
      ))}
      {lastWeek.length > 0 && <div className="small muted">Last {lastWeek.length} days: {lastWeek.reduce((t, d) => t + d.inflow, 0).toFixed(0)} leads in, {lastWeek.reduce((t, d) => t + d.conversions, 0).toFixed(1)} conversions out.</div>}
    </div>
  );
}

function Respond({ def, state, dp, prompt, verb, onSubmit, evaluating, xray, group, hintsOn }) {
  const opts = useMemo(() => shuffled((dp.options || []).filter((o) => conditionMet(o.requires, state.dx)), state.seed, dp.id), [dp, state.seed, state.dx]);
  const [choice, setChoice] = useState(null);
  const [multi, setMulti] = useState([]);
  const [order, setOrder] = useState(() => (dp.type === 'rank' ? rankStart(dp, state.seed) : []));
  const [text, setText] = useState('');
  const [hint, setHint] = useState(false);
  const [drag, setDrag] = useState(null);
  const max = dp.maxSelect || opts.length;
  const words = (text.trim().match(/\S+/g) || []).length;
  const minWords = dp.open?.minWords || 25;
  const move = (i, d) => setOrder((o) => { const n = [...o]; const j = i + d; if (j < 0 || j >= n.length) return o; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const ready = dp.type === 'multi' ? multi.length > 0 : dp.type === 'rank' ? true : dp.type === 'open' ? words >= 3 : !!choice;
  const submit = () => onSubmit(dp, dp.type === 'multi' ? { optionIds: multi } : dp.type === 'rank' ? { order } : dp.type === 'open' ? { text } : { optionId: choice });
  const best = xray && dp.type !== 'open' ? bestIds(def, state, dp) : null;
  const vars = textVars(def, state, dp);

  return (
    <div className="lx-respond">
      <div className="lx-prompt">{prompt}{dp.type === 'multi' ? <span className="muted"> ({multi.length} of up to {max})</span> : null}</div>
      {group && dp.type === 'open' && <p className="small muted">Playing as {group.name}: talk it through together, then agree one reply.</p>}

      {(dp.type === 'single' || dp.type === 'scenario') && (
        <div className={`lx-options ${dp.type}`} role="radiogroup" aria-label={prompt}>
          {opts.map((o) => (
            <button key={o.id} type="button" role="radio" aria-checked={choice === o.id} className={`lx-option ${choice === o.id ? 'on' : ''}`} onClick={() => setChoice(o.id)}>
              {o.style && <span className="lx-style-tag" style={{ '--c': def.leadership.styles.find((s) => s.id === o.style)?.color }}>{def.leadership.styles.find((s) => s.id === o.style)?.name}</span>}
              <span>{say(def, state, dp, o.text)}</span>
              {best?.includes(o.id) && <span className="lx-xray-tag">best</span>}
            </button>
          ))}
        </div>
      )}

      {dp.type === 'multi' && (
        <div className="lx-options multi" role="group" aria-label={prompt}>
          {opts.map((o) => {
            const on = multi.includes(o.id);
            return (
              <button key={o.id} type="button" role="checkbox" aria-checked={on} className={`lx-option ${on ? 'on' : ''}`} disabled={!on && multi.length >= max} onClick={() => setMulti((m) => (on ? m.filter((x) => x !== o.id) : [...m, o.id]))}>
                <span className="lx-check" aria-hidden="true">{on ? '✓' : ''}</span>
                <span>{say(def, state, dp, o.text)}</span>
                {best?.includes(o.id) && <span className="lx-xray-tag">right</span>}
              </button>
            );
          })}
        </div>
      )}

      {dp.type === 'rank' && (
        <ol className="lx-rank" aria-label={prompt}>
          {order.map((id, i) => {
            const o = dp.options.find((x) => x.id === id);
            return (
              <li key={id} className={`lx-rank-item ${drag === i ? 'dragging' : ''}`} draggable onDragStart={() => setDrag(i)} onDragOver={(e) => { e.preventDefault(); if (drag !== null && drag !== i) { setOrder((ord) => { const n = [...ord]; const [m] = n.splice(drag, 1); n.splice(i, 0, m); return n; }); setDrag(i); } }} onDragEnd={() => setDrag(null)}>
                <span className="lx-rank-num">{i + 1}</span>
                <span className="grow">{say(def, state, dp, o.text)}</span>
                <span className="row nowrap" style={{ '--gap': '2px' }}>
                  <button type="button" className="lx-icon-btn" aria-label={`Move ${say(def, state, dp, o.text)} up`} disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                  <button type="button" className="lx-icon-btn" aria-label={`Move ${say(def, state, dp, o.text)} down`} disabled={i === order.length - 1} onClick={() => move(i, 1)}>↓</button>
                </span>
              </li>
            );
          })}
        </ol>
      )}

      {dp.type === 'open' && (
        <div className="lx-compose">
          <textarea className="textarea" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={dp.channel === 'email' ? 'Write your reply…' : 'Write what you will say…'} aria-label={prompt} disabled={evaluating} />
          <div className="row spread small">
            <span className={words >= minWords ? 'muted' : 'muted'}>{words} word{words === 1 ? '' : 's'}{words < minWords ? ` · aim for ${minWords} or more` : ''}</span>
            {hintsOn && (dp.level || 1) <= 2 && dp.open?.keyIdeas?.length > 0 && <button type="button" className="link-btn small" onClick={() => setHint((h) => !h)}>{hint ? 'Hide hint' : 'Hint'}</button>}
          </div>
          {hint && <p className="lx-hint">A strong reply covers {dp.open.keyIdeas.length} things. Think about: {dp.open.keyIdeas.map((k) => def.decisions && say(def, state, dp, k.label).split(' ').slice(0, 3).join(' ').toLowerCase()).join('; ')}…</p>}
          {xray && <p className="lx-xray">X-ray: model answer: {say(def, state, dp, dp.open?.modelAnswer)}</p>}
        </div>
      )}

      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" className="btn primary lx-send" disabled={!ready || evaluating} onClick={submit}>
          {evaluating ? 'Reading your reply…' : dp.type === 'open' ? `${verb === 'Say' ? 'Say it' : 'Send'}` : verb === 'Decide' ? 'Decide' : verb === 'Say' ? 'Say it' : 'Send reply'}
        </button>
      </div>
      {vars && null}
    </div>
  );
}

function bestIds(def, state, dp) {
  if (dp.type === 'multi') return dp.options.filter((o) => o.correct).map((o) => o.id);
  if (dp.type === 'rank') return [];
  const a = dp.about && state.actors[dp.about];
  if (dp.options.some((o) => o.style) && a) return [desiredStyle(def, a.s, a.m)];
  const top = Math.max(...dp.options.map((o) => o.quality ?? 0));
  return dp.options.filter((o) => (o.quality ?? 0) === top).map((o) => o.id);
}

function Answered({ def, state, dp, a, sender, onRewind, canRewind, rewindsLeft, onBack, next, onNext }) {
  const [why, setWhy] = useState(a.band !== 'strong');
  const yours = a.expired ? null : dp.type === 'open' ? a.answer?.text : dp.type === 'rank' ? (a.answer?.order || []).map((id, i) => `${i + 1}. ${say(def, state, dp, dp.options?.find((o) => o.id === id)?.text)}`).join('\n') : (a.answer?.optionIds || [a.answer?.optionId]).map((id) => say(def, state, dp, dp.options?.find((o) => o.id === id)?.text)).filter(Boolean).join('\n');
  const toneLabel = { strong: 'Landed well', mixed: 'Partly landed', weak: 'Did not land' }[a.band];
  return (
    <div className="lx-answered">
      {yours ? <div className="lx-bubble you"><p>{yours}</p></div> : <p className="lx-missed">You did not respond in time.</p>}
      {a.reaction && <div className="lx-bubble them"><span className="lx-speaker">{sender.name}</span><p>{a.reaction}</p></div>}
      <EffectChips effects={a.effects} />
      <div className={`lx-coach band-${a.band}`}>
        <button type="button" className="lx-coach-head" aria-expanded={why} onClick={() => setWhy((w) => !w)}>
          <span className={`lx-band-dot ${a.band}`} aria-hidden="true" /> <strong>{toneLabel}</strong> <span className="muted">· coach's note</span> <span className="lx-caret" aria-hidden="true">{why ? '−' : '+'}</span>
        </button>
        {why && (
          <div className="lx-coach-body">
            <p>{a.feedback}</p>
            {a.detail?.criteria && (
              <div className="lx-criteria">
                {a.detail.criteria.map((c) => (
                  <div key={c.id} className="lx-crit" title={c.note}>
                    <span>{c.label}</span>
                    <span className="lx-crit-track"><span style={{ width: `${c.score}%` }} className={c.score >= 70 ? 'good' : c.score >= 40 ? 'mid' : 'low'} /></span>
                    <span className="num">{c.score}</span>
                  </div>
                ))}
                <p className="small muted">{a.detail.by === 'genie' ? 'Read by Genie against the criteria your programme set.' : 'Scored against the criteria your programme set.'}</p>
              </div>
            )}
            {a.detail?.ideas?.length > 0 && (
              <ul className="lx-ideas">
                {a.detail.ideas.map((i) => <li key={i.label} className={i.met ? 'met' : ''}><span aria-hidden="true">{i.met ? '✓' : '○'}</span> {i.label}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>
      {canRewind && (
        <div className="lx-rewind">
          <span className="small">Not what you wanted? You can rethink this moment before moving on.</span>
          <button type="button" className="btn sm" onClick={onRewind}>Rethink ({rewindsLeft} left)</button>
        </div>
      )}
      {(onBack || next) && (
        <div className="lx-next">
          {next ? (
            <>
              {onBack && <button type="button" className="btn ghost" onClick={onBack}>Back to today</button>}
              <button type="button" className="btn primary" onClick={onNext}>Next: {next.title} <span aria-hidden="true">→</span></button>
            </>
          ) : <button type="button" className="btn primary" onClick={onBack}>Back to today <span aria-hidden="true">→</span></button>}
        </div>
      )}
    </div>
  );
}

export { stageName };
