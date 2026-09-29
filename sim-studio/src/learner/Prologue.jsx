// The prologue: what the learner sees before any decision. A cover, then chapters that set the
// scene (the organization, the mission, how work flows, the team, how to lead them, how the
// simulation works), then the learner accepts the role and the first week begins.
// Chapters come from def.onboarding, authored in GenieKreator; their content draws on the story,
// stages, team and leadership model the author already has.
import { useEffect, useMemo, useRef, useState } from 'react';
import { renderText } from '../engine/text.js';
import { DEFAULT_SCORING } from '../engine/decisions.js';
import { Avatar } from './Moment.jsx';
import { moodOf, avatarColor } from './model.js';

export const LANG_NAMES = { en: 'English', hi: 'Hindi', 'zh-Hans': 'Chinese (Simplified)', es: 'Spanish', fr: 'French', ja: 'Japanese', ar: 'Arabic', de: 'German', pt: 'Portuguese', id: 'Indonesian' };

export const STYLE_PLAIN = {
  directing: 'Show them exactly what to do and check in often',
  guiding: 'Explain the why, encourage and guide',
  partnering: 'Involve them and decide together',
  entrusting: 'Give them ownership and step back',
};

const PERSONAS = {
  'low/low': 'has not done this kind of work before and is losing confidence. They say little in meetings and wait to be told.',
  'low/high': 'is new to this work, eager and full of ideas, but still makes basic mistakes.',
  'high/low': 'knows the job well but has seemed flat and disengaged for a few weeks.',
  'high/high': 'is experienced, confident and delivering, and wants room to run.',
};
const PRACTICE_NAMES = ['Sam', 'Alex'];

const t = (def, s, vars) => renderText(def, s || '', vars);
const team = (def) => def.actors.filter((a) => a.pool === 'team');
const paragraphs = (text) => String(text || '').split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean);
export const minutesFor = (def) => (def.timeline.weeks <= 6 ? 45 : def.timeline.weeks <= 8 ? 60 : 90);

export function chaptersOf(def) {
  const ob = def.onboarding;
  if (!ob || ob.enabled === false) return [];
  return (ob.chapters || []).filter((c) => c.enabled !== false);
}

// ---------- a card that turns over ----------

export function FlipCard({ flipped, onFlip, front, back, label, className = '', style, disabled }) {
  return (
    <div className={`lx-flip ${flipped ? 'flipped' : ''} ${className}`} style={style}>
      <div className="lx-flip-inner">
        <button type="button" className="lx-flip-face lx-flip-front" onClick={onFlip} disabled={disabled || flipped} aria-label={label} aria-hidden={flipped} tabIndex={flipped ? -1 : 0}>{front}</button>
        <div className="lx-flip-face lx-flip-back" aria-hidden={!flipped}>{back}</div>
      </div>
    </div>
  );
}

// ---------- cover ----------

export function Cover({ def, saved, savedWeek, langs, language, setLanguage, onBegin, onResume, onSkip, onExit, preview }) {
  const chapters = chaptersOf(def);
  return (
    <div className="lx-root lx-cover-root">
      <div className="lx-cover">
        <div className="lx-cover-card">
          <span className="lx-mark big" aria-hidden="true">{t(def, '{{company}}').slice(0, 1)}</span>
          <div className="lx-kicker">{t(def, '{{company}}')} · {t(def, '{{city}}')}</div>
          <h1>{t(def, 'Lead the {{product}} team at {{company}}')}</h1>
          <p className="lx-lede">{t(def, `You have just been appointed {{learner_role}}. For the next ${def.timeline.weeks} weeks, a team of ${team(def).length} people and a quarter's results are in your hands.`)}</p>
          <div className="lx-cover-meta">
            <span>About {minutesFor(def)} minutes</span>
            <span>{chapters.length ? `A ${chapters.length}-part briefing first` : 'Straight into week 1'}</span>
            <span>Progress saves as you go</span>
          </div>
          {langs.length > 1 && (
            <label className="lx-cover-lang"><span>Language</span>
              <select className="select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                {langs.map((l) => <option key={l} value={l}>{LANG_NAMES[l] || l}</option>)}
              </select>
            </label>
          )}
          <div className="lx-cover-actions">
            {saved ? (
              <>
                <button type="button" className="btn primary lg" onClick={onResume}>Carry on{saved.identity?.name ? `, ${saved.identity.name.split(' ')[0]}` : ''} (week {savedWeek})</button>
                <button type="button" className="btn lg lx-on-dark" onClick={onBegin}>Start again from the briefing</button>
              </>
            ) : (
              <button type="button" className="btn primary lg lx-begin" onClick={onBegin}>{chapters.length ? 'Begin the briefing' : 'Begin'}</button>
            )}
            {preview && chapters.length > 0 && <button type="button" className="btn ghost lx-on-dark" onClick={onSkip}>Skip to week 1 (author)</button>}
            {onExit && <button type="button" className="btn ghost lx-on-dark" onClick={onExit}>{preview ? 'Back to Studio' : 'Leave'}</button>}
          </div>
        </div>
        <div className="lx-cover-deck" aria-hidden="true">
          {team(def).slice(0, 5).map((a, i) => (
            <span key={a.id} className="lx-cover-cardback" style={{ '--i': i, '--c': avatarColor(a.name) }}><span className="lx-mark">{t(def, '{{company}}').slice(0, 1)}</span></span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- the chapters ----------

export default function Prologue({ def, preview, onExit, onBack, ready }) {
  const chapters = chaptersOf(def);
  const steps = [...chapters, { id: 'ready', kind: 'ready', title: 'Accept the role' }];
  const [i, setI] = useState(0);
  const [gate, setGate] = useState({});
  const [dir, setDir] = useState(1);
  const top = useRef(null);
  const step = steps[i];
  const canNext = gate[step.id] !== false;
  const go = (n) => { setDir(n > i ? 1 : -1); setI(Math.max(0, Math.min(steps.length - 1, n))); };
  useEffect(() => { top.current?.scrollTo?.({ top: 0 }); top.current?.focus?.({ preventScroll: true }); }, [i]);
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select')) return;
      if (e.key === 'ArrowRight' && canNext && i < steps.length - 1) go(i + 1);
      if (e.key === 'ArrowLeft' && i > 0) go(i - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const setReady = (id) => (ok) => setGate((g) => (g[id] === ok ? g : { ...g, [id]: ok }));
  const body = {
    company: CompanyChapter, mission: MissionChapter, flow: FlowChapter, team: TeamChapter, model: ModelChapter, howto: HowtoChapter, custom: CustomChapter,
  }[step.kind];

  return (
    <div className="lx-root lx-prologue-root">
      <header className="lx-pro-head">
        <div className="lx-brand"><span className="lx-mark" aria-hidden="true">{t(def, '{{company}}').slice(0, 1)}</span><span className="lx-company">{t(def, '{{company}}')}</span></div>
        <ol className="lx-pro-rail" aria-label="Briefing">
          {steps.map((s, k) => (
            <li key={s.id} className={k < i ? 'done' : k === i ? 'now' : ''}>
              <button type="button" disabled={k > i && steps.slice(i, k).some((x) => gate[x.id] === false)} onClick={() => go(k)} aria-current={k === i ? 'step' : undefined}>
                <span className="lx-pro-dot" aria-hidden="true">{k < i ? '✓' : k + 1}</span>
                <span className="lx-pro-label">{s.kind === 'ready' ? 'Begin' : t(def, s.title).replace(/^Welcome to /, '')}</span>
              </button>
            </li>
          ))}
        </ol>
        <div className="lx-head-actions">
          {onExit && <button type="button" className="btn ghost sm lx-on-dark" onClick={onExit}>{preview ? 'Back to Studio' : 'Save and exit'}</button>}
        </div>
      </header>
      <main className="lx-pro-main" ref={top} tabIndex={-1}>
        <section key={step.id} className={`lx-chapter ch-${step.kind} ${dir > 0 ? 'from-right' : 'from-left'}`} aria-labelledby={`ch-${step.id}`}>
          <div className="lx-kicker">{step.kind === 'ready' ? 'Last step' : `Part ${i + 1} of ${chapters.length}`}</div>
          <h1 id={`ch-${step.id}`}>{step.kind === 'ready' ? `Ready, ${t(def, '{{learner_role}}')}?` : t(def, step.title)}</h1>
          {step.lead && <p className="lx-lede">{t(def, step.lead)}</p>}
          {step.kind === 'ready' ? ready : body ? <BodyOf C={body} def={def} ch={step} setReady={setReady(step.id)} /> : null}
        </section>
      </main>
      {step.kind !== 'ready' && (
        <footer className="lx-pro-foot">
          <button type="button" className="btn ghost" onClick={() => (i ? go(i - 1) : onBack())}>{i ? 'Back' : 'Cover'}</button>
          <span className="small muted lx-pro-hint">{canNext ? 'Use the arrow keys to move between parts.' : step.kind === 'team' ? `Read at least ${Math.min(def.onboarding?.teamToMeet ?? 3, team(def).length)} people to continue.` : ''}</span>
          <button type="button" className="btn primary lg" disabled={!canNext} onClick={() => go(i + 1)}>{i === steps.length - 2 ? 'I am ready' : 'Next'} <span aria-hidden="true">→</span></button>
        </footer>
      )}
    </div>
  );
}

function BodyOf({ C, def, ch, setReady }) {
  return <C def={def} ch={ch} setReady={setReady} />;
}

function CompanyChapter({ def, ch }) {
  const [open, setOpen] = useState([]);
  const facts = (ch.facts || []).filter((f) => String(f.label || '').trim() || String(f.value || '').trim());
  return (
    <div className="lx-ch-grid">
      <div className="lx-ch-text">
        {paragraphs(t(def, ch.body || def.story.overview)).map((p, k) => <p key={k}>{p}</p>)}
      </div>
      {facts.length > 0 && (
        <div className="lx-facts">
          {facts.map((f, k) => (
            <FlipCard key={k} className="lx-fact" style={{ '--i': k }} flipped={open.includes(k)} onFlip={() => setOpen((o) => [...o, k])} label={`Reveal: ${t(def, f.label)}`}
              front={<><span className="lx-fact-label">{t(def, f.label)}</span><span className="lx-flip-cue">Tap to reveal</span></>}
              back={<><span className="lx-fact-label">{t(def, f.label)}</span><strong>{t(def, f.value)}</strong></>} />
          ))}
        </div>
      )}
    </div>
  );
}

function MissionChapter({ def }) {
  const [opened, setOpened] = useState(false);
  const cur = def.funnel.currency || '';
  const value = def.funnel.valuePerConversion ? `${cur} ${Number(def.funnel.valuePerConversion).toLocaleString('en')}` : null;
  const cards = [
    { k: 'Target', v: `${def.funnel.target} conversions`, n: 'Sales that reach the last stage' },
    { k: 'Time', v: `${def.timeline.weeks} weeks`, n: `${def.timeline.daysPerWeek} working days each` },
    { k: 'Team', v: `${team(def).length} people`, n: `Across ${def.stages.length} stages` },
    ...(value ? [{ k: 'Each conversion', v: value, n: 'In revenue for the company' }] : []),
  ];
  return (
    <div className="stack" style={{ '--gap': '18px' }}>
      <div className={`lx-envelope ${opened ? 'open' : ''}`}>
        {!opened ? (
          <button type="button" className="lx-envelope-closed" onClick={() => setOpened(true)}>
            <span className="lx-envelope-flap" aria-hidden="true" />
            <span className="lx-envelope-from">From {t(def, '{{ceo}}')}<br /><span className="small">CEO, {t(def, '{{company}}')}</span></span>
            <span className="lx-envelope-cta">Open the letter</span>
          </button>
        ) : (
          <article className="lx-letter-paper">
            <div className="small muted">From {t(def, '{{ceo}}')}, CEO · To the new {t(def, '{{learner_role}}')}</div>
            {paragraphs(t(def, def.story.welcome)).map((p, k) => <p key={k}>{p}</p>)}
            {def.story.target && <p className="lx-letter-ps">{t(def, def.story.target)}</p>}
          </article>
        )}
      </div>
      {opened && (
        <div className="lx-mission-cards">
          {cards.map((c, k) => <div key={c.k} className="lx-mission-card" style={{ '--i': k }}><span className="small muted">{c.k}</span><strong>{c.v}</strong><span className="small muted">{c.n}</span></div>)}
        </div>
      )}
    </div>
  );
}

function FlowChapter({ def }) {
  const [sel, setSel] = useState(0);
  const st = def.stages[sel];
  const people = team(def).filter((a) => a.startStage === st?.id);
  const inflow = def.funnel.weeklyInflow?.[0];
  return (
    <div className="stack" style={{ '--gap': '16px' }}>
      <div className="lx-pipeline" role="tablist" aria-label="Stages">
        <span className="lx-pipe-end">{inflow ? `${inflow} leads a week` : 'Leads'}</span>
        {def.stages.map((s, k) => (
          <button key={s.id} type="button" role="tab" aria-selected={sel === k} className={`lx-pipe-stage ${sel === k ? 'on' : ''}`} style={{ '--i': k }} onClick={() => setSel(k)}>
            <span className="lx-pipe-num">{k + 1}</span>
            <strong>{s.name}</strong>
            <span className="small muted">{team(def).filter((a) => a.startStage === s.id).length} people · pass on {Math.round(s.conversion * 100)}%</span>
          </button>
        ))}
        <span className="lx-pipe-end out">Conversions</span>
        <span className="lx-pipe-flow" aria-hidden="true"><i /><i /><i /><i /></span>
      </div>
      {st && (
        <div className="lx-pipe-detail" key={st.id}>
          <h3>{st.name}</h3>
          <p>{t(def, st.description)}</p>
          <div className="row" style={{ '--gap': '8px' }}>{people.map((a) => <span key={a.id} className="lx-chip-person"><Avatar name={a.name} size={24} />{a.name}</span>)}</div>
        </div>
      )}
      <p className="small muted">People can be moved between stages later. A stage with nobody good in it becomes the bottleneck.</p>
    </div>
  );
}

function TeamChapter({ def, ch, setReady }) {
  const need = Math.min(def.onboarding?.teamToMeet ?? 3, team(def).length);
  const [seen, setSeen] = useState([]);
  const n = seen.length;
  useEffect(() => { setReady(n >= need); }, [n, need, setReady]);
  const people = team(def);
  const stageOf = (id) => def.stages.find((s) => s.id === id)?.name;
  return (
    <div className="stack" style={{ '--gap': '14px' }}>
      <div className="row spread">
        <span className="lx-counter"><strong className="num">{n}</strong> of {people.length} read{need > 0 && n < need ? ` · read at least ${need} to continue` : ''}</span>
        {n >= need && n < people.length && <button type="button" className="btn sm" onClick={() => setSeen(people.map((a) => a.id))}>Turn over the rest</button>}
      </div>
      <div className="lx-team-deck">
        {people.map((a, k) => {
          const s0 = a.stats?.[a.startStage] || {};
          const mood = moodOf(s0.m ?? 50);
          return (
            <FlipCard key={a.id} className="lx-person-card" style={{ '--i': k }} flipped={seen.includes(a.id)} onFlip={() => setSeen((x) => (x.includes(a.id) ? x : [...x, a.id]))} label={`Turn over the card for ${a.name}`}
              front={<><span className="lx-mark">{t(def, '{{company}}').slice(0, 1)}</span><span className="lx-card-stage">{stageOf(a.startStage)}</span><span className="lx-flip-cue">Tap to meet</span></>}
              back={
                <div className="lx-person-back">
                  <div className="row nowrap" style={{ '--gap': '8px' }}><Avatar name={a.name} size={36} /><div style={{ minWidth: 0 }}><strong>{a.name}</strong><div className="small muted">{stageOf(a.startStage)} · {a.experience || 'experience not stated'}</div></div></div>
                  <p>{t(def, a.bio, { actor: a.name, pronoun: a.pronoun })}</p>
                  <span className={`lx-mood ${mood.tone}`}>First impression: {mood.label.toLowerCase()}</span>
                </div>
              } />
          );
        })}
      </div>
    </div>
  );
}

function ModelChapter({ def }) {
  const styles = def.leadership.styles;
  const [open, setOpen] = useState([]);
  const at = (skill, morale) => styles.find((s) => s.skill === skill && s.morale === morale);
  const practiceOn = def.onboarding?.practice !== false;
  const rounds = useMemo(() => [['low', 'high'], ['high', 'low']].map(([sk, mo], k) => ({ name: PRACTICE_NAMES[k], key: `${sk}/${mo}`, answer: at(sk, mo)?.id })), [styles]); // eslint-disable-line react-hooks/exhaustive-deps
  const [picks, setPicks] = useState({});
  const cell = (skill, morale) => {
    const s = at(skill, morale);
    if (!s) return <div className="lx-quad-empty" />;
    const k = styles.indexOf(s);
    return (
      <FlipCard key={s.id} className="lx-style-card" style={{ '--c': s.color, '--i': k }} flipped={open.includes(s.id)} onFlip={() => setOpen((o) => [...o, s.id])} label={`Turn over ${s.name}`}
        front={<><span className="lx-style-letter">{s.name.slice(0, 1)}</span><strong>{s.name}</strong><span className="small">Skill {skill} · morale {morale}</span><span className="lx-flip-cue">Tap to turn</span></>}
        back={<><strong>{s.name}</strong><p>{STYLE_PLAIN[s.id] || s.definition}</p><p className="small">{s.definition}</p></>} />
    );
  };
  return (
    <div className="stack" style={{ '--gap': '18px' }}>
      <div className="lx-quad">
        <span className="lx-quad-y" aria-hidden="true">Morale →</span>
        <div className="lx-quad-grid">
          {cell('low', 'high')}{cell('high', 'high')}
          {cell('low', 'low')}{cell('high', 'low')}
        </div>
        <span className="lx-quad-x" aria-hidden="true">Skill →</span>
      </div>
      <p className="small muted">Skill is what someone can do in their current stage. Morale is how motivated and confident they feel. You cannot see either directly: read their profile, what they say, how they perform, or use Assess member.</p>
      {practiceOn && (
        <div className="lx-practice">
          <h3>Try it <span className="small muted">(not scored)</span></h3>
          {rounds.map((r) => {
            const pick = picks[r.name];
            const right = pick && pick === r.answer;
            const ans = styles.find((s) => s.id === r.answer);
            return (
              <div key={r.name} className="lx-practice-q">
                <p><strong>{r.name}</strong> {PERSONAS[r.key]} Which style fits?</p>
                <div className="lx-practice-opts" role="radiogroup" aria-label={`Style for ${r.name}`}>
                  {styles.map((s) => (
                    <button key={s.id} type="button" role="radio" aria-checked={pick === s.id} disabled={!!pick} className={`${pick === s.id ? (right ? 'right' : 'wrong') : ''} ${pick && s.id === r.answer ? 'answer' : ''}`} style={{ '--c': s.color }} onClick={() => setPicks((p) => ({ ...p, [r.name]: s.id }))}>{s.name}</button>
                  ))}
                </div>
                {pick && <p className={`lx-practice-fb ${right ? 'good' : ''}`}>{right ? 'Exactly. ' : `Not quite: ${ans?.name}. `}{r.key === 'low/high' ? 'Keen but new: explain the why and guide them, so the energy turns into skill.' : 'Capable but flat: involve them and decide together, so they feel ownership again.'}</p>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function HowtoChapter({ def }) {
  const w = { ...DEFAULT_SCORING, ...(def.scoring || {}) };
  const total = Object.values(w).reduce((a, b) => a + b, 0) || 1;
  const steps = [
    { h: 'Monday', p: 'Choose how you will lead each person this week, from what you can see of them.' },
    { h: 'Your week', p: `Emails, chats, meetings and business updates land in your inbox. Reply the way you would at work. Actions such as one-to-ones or training take days out of your ${def.timeline.daysPerWeek}-day week.` },
    { h: 'Consequences', p: 'People and numbers respond straight away. Some decisions come back to you weeks later.' },
    { h: 'Friday', p: 'See what happened, answer one quick recall question and, some weeks, reflect.' },
    { h: 'The end', p: 'A debrief shows what happened and why, what you did well and what to practise next.' },
  ];
  const parts = [['results', 'Business results'], ['leadership', 'Leading your team'], ['decisions', 'Quality of your decisions'], ['recall', 'Recall of key ideas']].filter(([k]) => w[k] > 0);
  return (
    <div className="stack" style={{ '--gap': '20px' }}>
      <ol className="lx-howto">
        {steps.map((s, k) => <li key={s.h} style={{ '--i': k }}><span className="lx-howto-n">{k + 1}</span><strong>{s.h}</strong><p>{s.p}</p></li>)}
      </ol>
      <div className="lx-score-parts">
        <h3>How you are scored</h3>
        {parts.map(([k, l]) => (
          <div key={k} className="lx-score-part"><span>{l}</span><span className="lx-score-track"><span style={{ width: `${(w[k] / total) * 100}%` }} /></span><strong className="num">{Math.round((w[k] / total) * 100)}%</strong></div>
        ))}
      </div>
      <ul className="lx-tips">
        {(def.learning?.rewinds ?? 2) > 0 && <li>If a decision does not land, you can <strong>rethink</strong> it straight away, {def.learning?.rewinds ?? 2} times in the whole quarter.</li>}
        <li>Written replies are read for reasoning, relevance and judgement, not grammar.</li>
        <li><strong>How it works</strong> and your <strong>Notebook</strong> are at the top of the screen whenever you need them.</li>
      </ul>
    </div>
  );
}

function CustomChapter({ def, ch }) {
  return <div className="lx-ch-text">{paragraphs(t(def, ch.body)).map((p, k) => <p key={k}>{p}</p>)}</div>;
}
