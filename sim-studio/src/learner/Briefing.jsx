// The briefing: the first thing a learner sees. It opens, as the original iLead does, on three
// screens: Welcome (the CEO's letter), About the product and Your targets. Then the rest of the
// authored briefing (the team, how to lead them, how the simulation works), and finally the
// learner accepts the role. Each screen leads with a hero: a headline, the person or product it
// is about under a spotlight, and the numbers that matter.
import { useEffect, useMemo, useRef, useState } from 'react';
import { renderText } from '../engine/text.js';
import { ProductArt, TargetArt, Icon, sceneBackground } from './art.jsx';
import { Face } from './look.jsx';
import { Shell, TopChip, Profile, StatCard, HeroStage, ProgressStrip } from './Shell.jsx';
import { minutesFor, LANG_NAMES, CompanyChapter, MissionChapter, FlowChapter, TeamChapter, ModelChapter, HowtoChapter, CustomChapter } from './Prologue.jsx';
import { OPENING, briefingSteps } from '../templates/ilead/onboarding.js';

const t = (def, s, vars) => renderText(def, s || '', vars);
const team = (def) => def.actors.filter((a) => a.pool === 'team');
const paragraphs = (text) => String(text || '').split(/\n{2,}|\n/).map((p) => p.trim()).filter(Boolean);
const cur = (def) => (def.funnel.currency === 'USD' ? '$' : `${def.funnel.currency || ''} `);
const money = (def, v) => `${cur(def)}${Math.round(v).toLocaleString('en')}`;
const compact = (def, v) => `${cur(def)}${new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 2 }).format(v)}`;
const isOpening = (c) => OPENING.includes(c.kind);

const ICON = { welcome: 'letter', mission: 'letter', product: 'box', targets: 'target', company: 'building', flow: 'funnel', team: 'team', model: 'grid', howto: 'help', custom: 'book', ready: 'play' };
const KICKER = { welcome: 'Welcome on board', mission: 'Your mission', product: 'About the product', targets: 'Your targets' };
const TAB = { welcome: 'Welcome', mission: 'Welcome', product: 'About Product', targets: 'Your Targets' };

export default function Briefing({ def, preview, saved, savedWeek, langs = ['en'], language, setLanguage, onResume, onSkip, onExit, ready, identity }) {
  // Welcome, About Product and Your Targets always come first, whatever the settings or version.
  const { opening, rest } = useMemo(() => briefingSteps(def), [def]);
  const steps = useMemo(() => [...opening, ...rest, { id: 'ready', kind: 'ready', title: 'Accept the role' }], [opening, rest]);
  const [i, setI] = useState(0);
  const [gate, setGate] = useState({});
  const top = useRef(null);
  const step = steps[i];
  const canNext = gate[step.id] !== false;
  const reachable = (k) => k <= i || !steps.slice(i, k).some((x) => gate[x.id] === false);
  const go = (n) => setI(Math.max(0, Math.min(steps.length - 1, n)));
  useEffect(() => { top.current?.scrollTo?.({ top: 0 }); }, [i]);
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

  const item = (s, k) => ({ id: s.id, label: s.kind === 'ready' ? 'Accept the role' : TAB[s.kind] || t(def, s.title), icon: ICON[s.kind], done: k < i, disabled: !reachable(k), onClick: () => go(k) });
  const nav = [
    { label: 'Briefing', items: opening.map((s) => item(s, steps.indexOf(s))) },
    ...(rest.length ? [{ label: 'Get ready', items: rest.map((s) => item(s, steps.indexOf(s))) }] : []),
    { label: 'Begin', items: [item(steps.at(-1), steps.length - 1)] },
  ];
  const value = def.funnel.valuePerConversion * def.funnel.target;
  const sideCard = saved ? (
    <>
      <span className="nx-card-icon"><Icon name="play" size={20} /></span>
      <strong>Carry on{saved.identity?.name ? `, ${saved.identity.name.split(' ')[0]}` : ''}</strong>
      <p>You stopped in week {savedWeek}. Pick up exactly where you left off.</p>
      <button type="button" className="nx-btn primary block" onClick={onResume}>Resume week {savedWeek}</button>
    </>
  ) : (
    <>
      <span className="nx-card-icon"><Icon name="flag" size={20} /></span>
      <strong>Your quarter</strong>
      <p>{def.timeline.weeks} weeks · {team(def).length} people · {compact(def, value)} target. About {def.timeline.timeLimit || minutesFor(def)} minutes, saved as you go.</p>
    </>
  );
  const topBar = (
    <>
      {!isOpening(step) && <div className="nx-top-title"><span className="nx-muted small">{t(def, '{{company}}')}</span><strong>{step.kind === 'ready' ? 'Accept the role' : t(def, step.title)}</strong></div>}
      {isOpening(step) && (
        <div className="nx-pills" role="tablist" aria-label="Briefing">
          {opening.map((s) => { const k = steps.indexOf(s); return <button key={s.id} type="button" role="tab" aria-selected={k === i} className={`nx-pill ${k === i ? 'on' : ''}`} onClick={() => go(k)}>{TAB[s.kind]}</button>; })}
        </div>
      )}
      <div className="nx-top-right">
        {langs.length > 1 && (
          <label className="nx-chip nx-lang"><Icon name="globe" size={16} /><span className="sr-only">Language</span>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Language">{langs.map((l) => <option key={l} value={l}>{LANG_NAMES[l] || l}</option>)}</select>
          </label>
        )}
        {preview && !isOpening(step) && <TopChip icon="play" onClick={onSkip} title="Author preview only: jumps past the rest of the briefing">Skip to week 1</TopChip>}
        {onExit && <TopChip icon="exit" onClick={onExit}>{preview ? 'Back to Studio' : 'Leave'}</TopChip>}
        <Profile name={identity?.name && identity.name !== 'Author preview' ? identity.name : `New ${t(def, '{{learner_role}}')}`} sub={preview ? 'Author preview' : t(def, '{{company}}')} />
      </div>
    </>
  );
  const nextLabel = i >= steps.length - 2 ? 'I am ready' : steps[i + 1]?.kind === 'ready' ? 'I am ready' : `Next: ${steps[i + 1] ? (TAB[steps[i + 1].kind] || t(def, steps[i + 1].title)) : ''}`;
  const strip = step.kind === 'ready' ? null : (
    <ProgressStrip
      progress={(i + 1) / steps.length} progressLabel="Briefing" bar={{ label: `Part ${i + 1} of ${steps.length - 1}`, value: (i + 1) / (steps.length - 1) }}
      count={{ icon: 'clock', value: `${def.timeline.timeLimit || minutesFor(def)} min` }} countLabel="Simulation time"
      status={canNext ? 'Briefing' : 'Read on'} statusTone={canNext ? 'good' : 'warn'} statusSub={canNext ? 'Week 1 starts after this' : step.kind === 'team' ? `Turn over at least ${Math.min(def.onboarding?.teamToMeet ?? 3, team(def).length)} cards` : ''}
      action={(
        <>
          <button type="button" className="nx-round" aria-label="Previous" disabled={i === 0} onClick={() => go(i - 1)}><Icon name="arrowLeft" /></button>
          <button type="button" className="nx-btn primary lg nx-next" disabled={!canNext} onClick={() => go(i + 1)}>{nextLabel} <Icon name="arrowRight" size={18} /></button>
        </>
      )} />
  );

  return (
    <Shell def={def} nav={nav} active={step.id} top={topBar} sideCard={sideCard} className="nx-briefing" label="Briefing">
      <div className="nx-page" ref={top}>
        <div key={step.id} className="nx-enter">
          {step.kind === 'welcome' ? <WelcomeScreen def={def} ch={step} />
            : step.kind === 'product' ? <ProductScreen def={def} ch={step} />
              : step.kind === 'targets' ? <TargetsScreen def={def} ch={step} />
                : step.kind === 'ready' ? <ReadyScreen def={def}>{ready}</ReadyScreen>
                  : <ChapterScreen def={def} ch={step} n={i + 1} of={steps.length - 1} setReady={setReady(step.id)} />}
        </div>
        {strip}
      </div>
    </Shell>
  );
}

function Hero({ kicker, title, lead, children, stage, stats, def }) {
  return (
    <section className="nx-hero">
      {def && <div className="nx-hero-bg" aria-hidden="true" style={{ background: sceneBackground(def.look?.scene, def.look?.sceneImage) }} />}
      <div className="nx-hero-text">
        <span className="nx-kicker">{kicker}</span>
        <h1>{title}</h1>
        {lead && <p className="nx-lead">{lead}</p>}
        {children}
      </div>
      {stage}
      {stats && <div className="nx-hero-stats">{stats}</div>}
    </section>
  );
}

const firstWord = (s) => String(s || '').split(/\s+/)[0];

function WelcomeScreen({ def, ch }) {
  const ceo = t(def, '{{ceo}}');
  const company = t(def, '{{company}}');
  const facts = (def.onboarding?.chapters || []).find((c) => c.kind === 'company')?.facts || [];
  const text = paragraphs(t(def, def.story.welcome));
  return (
    <Hero def={def} kicker={KICKER.welcome} title={<>Welcome to<br />{company}.</>} lead={t(def, ch.lead)}
      stage={(
        <HeroStage word={firstWord(company).toUpperCase()} sub={t(def, '{{city}}')} plate={<><strong>{ceo}</strong><span>CEO, {company}</span></>}>
          <Face name={ceo} size={420} bare />
        </HeroStage>
      )}
      stats={(
        <>
          <StatCard icon="flag" label="Your role" value={t(def, '{{learner_role}}')} sub={`${t(def, '{{product}}')} sales team`} className="text" />
          <StatCard icon="team" tone="warm" label="Your team" value={team(def).length} unit="people" sub={`Across ${def.stages.length} sales stages`} />
          <StatCard icon="calendar" tone="cool" label="Your quarter" value={def.timeline.weeks} unit="weeks" sub={`${def.timeline.daysPerWeek} working days each`} />
          {facts.filter((f) => f.label && f.value).length > 0 && (
            <StatCard icon="building" tone="soft" label="The organization" className="text facts">
              <dl className="nx-facts">{facts.filter((f) => f.label && f.value).map((f, k) => <div key={k}><dt>{t(def, f.label)}</dt><dd>{t(def, f.value)}</dd></div>)}</dl>
            </StatCard>
          )}
        </>
      )}>
      <article className="nx-letter">
        <span className="nx-letter-from"><Icon name="letter" size={16} /> From {ceo}, CEO</span>
        {text.map((p, k) => <p key={k} className={k >= text.length - 2 && p.length < 60 ? 'sign' : ''}>{p}</p>)}
      </article>
    </Hero>
  );
}

function ProductScreen({ def, ch }) {
  const product = t(def, '{{product}}');
  const inflow = def.funnel.weeklyInflow?.[0];
  return (
    <Hero def={def} kicker={KICKER.product} title={product} lead={t(def, ch.lead)}
      stage={(
        <HeroStage word={product.toUpperCase()} sub={t(def, '{{company}}')} plate={<><strong>{product}</strong><span>{t(def, '{{company}}')}</span></>} className="product">
          <ProductArt kind={def.look?.productArt} image={def.look?.productImage} size={380} label={product} />
        </HeroStage>
      )}
      stats={(
        <>
          <StatCard icon="money" label="Each sale is worth" value={money(def, def.funnel.valuePerConversion)} sub="in revenue for the company" className="text" />
          <StatCard icon="funnel" tone="warm" label="Sales stages" value={def.stages.length} sub={def.stages.map((s) => s.name).join(' → ')} />
          {inflow ? <StatCard icon="inbox" tone="cool" label="New leads" value={inflow} unit="a week" sub="to start with" /> : null}
          <StatCard icon="team" tone="soft" label="Selling it" value={team(def).length} unit="people" sub="your team" />
        </>
      )}>
      <article className="nx-letter">
        {paragraphs(t(def, ch.body || def.story.overview)).map((p, k) => <p key={k}>{p}</p>)}
        <p className="sign">{t(def, '{{ceo}}')}<br />CEO, {t(def, '{{company}}')}</p>
      </article>
    </Hero>
  );
}

function TargetsScreen({ def, ch }) {
  const v = def.funnel.valuePerConversion;
  const revenue = def.funnel.target * v;
  const rows = [
    { h: `Sales revenue: ${money(def, revenue)}` },
    { h: `${def.funnel.target} sales conversions`, s: `1 conversion = ${money(def, v)}` },
    ...(def.story.goals || []).map((g) => ({ h: t(def, g) })),
  ];
  return (
    <Hero def={def} kicker={KICKER.targets} title={<>Your targets<br />for the quarter.</>} lead={t(def, def.story.target || ch.lead)}
      stage={(
        <HeroStage word={compact(def, revenue)} sub="Revenue target" plate={<><strong>{money(def, revenue)}</strong><span>by the end of week {def.timeline.weeks}</span></>} className="target">
          <TargetArt size={340} />
        </HeroStage>
      )}
      stats={(
        <>
          <StatCard icon="money" label="Revenue target" value={compact(def, revenue)} sub={money(def, revenue)} />
          <StatCard icon="target" tone="warm" label="Conversions" value={def.funnel.target} sub={`1 = ${money(def, v)}`} />
          <StatCard icon="calendar" tone="cool" label="Duration" value={def.timeline.weeks} unit="weeks" />
          {def.timeline.timeLimit ? <StatCard icon="clock" tone="bad" label="Simulation time" value={def.timeline.timeLimit} unit="minutes" /> : null}
        </>
      )}>
      <ol className="nx-targets">
        {rows.map((r, k) => <li key={k} style={{ '--i': k }}><span className="nx-target-n">{k + 1}</span><span><strong>{r.h}</strong>{r.s && <small>{r.s}</small>}</span></li>)}
        <li className="time" style={{ '--i': rows.length }}><span className="nx-target-n clock"><Icon name="clock" size={18} /></span><span>Duration: <strong>{def.timeline.weeks} weeks</strong>{def.timeline.timeLimit ? <><br />Simulation time: <strong>{def.timeline.timeLimit} minutes</strong></> : null}</span></li>
      </ol>
    </Hero>
  );
}

const BODY = { company: CompanyChapter, mission: MissionChapter, flow: FlowChapter, team: TeamChapter, model: ModelChapter, howto: HowtoChapter, custom: CustomChapter };

function ChapterScreen({ def, ch, n, of, setReady }) {
  const C = BODY[ch.kind];
  return (
    <section className="nx-chapter">
      <header className="nx-chapter-head">
        <span className="nx-kicker">Get ready · part {n} of {of}</span>
        <h1>{t(def, ch.title)}</h1>
        {ch.lead && <p className="nx-lead">{t(def, ch.lead)}</p>}
      </header>
      <div className="nx-panel">{C ? <C def={def} ch={ch} setReady={setReady} /> : null}</div>
    </section>
  );
}

function ReadyScreen({ def, children }) {
  const ceo = t(def, '{{ceo}}');
  return (
    <section className="nx-hero nx-ready">
      <div className="nx-hero-text">
        <span className="nx-kicker">Last step</span>
        <h1>Ready, {t(def, '{{learner_role}}')}?</h1>
        <div className="nx-panel">{children}</div>
      </div>
      <HeroStage word="READY" sub={t(def, '{{company}}')} plate={<><strong>{ceo}</strong><span>“The team is waiting for you.”</span></>}>
        <Face name={ceo} size={360} bare />
      </HeroStage>
    </section>
  );
}
