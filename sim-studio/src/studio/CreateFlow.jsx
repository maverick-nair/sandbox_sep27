// Guided co-creation. The author gives direction (a brief, the outcome, constraints); the flow
// infers the rest and walks through one stage at a time. Every stage is derived from the same
// state, so a change early on flows into everything after it, while the author's own edits stay.
// The whole flow autosaves, so a refresh or a click on the breadcrumb never loses work.
import { useEffect, useMemo, useRef, useState } from 'react';
import { TEMPLATES } from '../templates/registry.js';
import { INDUSTRIES } from '../templates/ilead/context-packs.js';
import { OUTCOMES, CONSTRAINT_CHIPS, AUDIENCES, EXAMPLE_BRIEFS, readBrief, briefPrompt, mergeGenieBrief } from '../templates/ilead/brief.js';
import { applyBriefSpecifics } from '../templates/ilead/brief-apply.js';
import { suggestProfile, suggestOfferingName, industryPack, locationPack, targetKey, refKey, geniePrompt, genieProposals } from '../templates/ilead/contextualize.js';
import { SESSION_LENGTHS, DIFFICULTY, rescaleTimeline, applyDifficulty } from '../engine/authoring.js';
import { desiredStyle, stageName } from '../engine/engine.js';
import { collectTexts, renderText } from '../engine/text.js';
import { runBalanceAsync, pct } from '../engine/balance.js';
import { validate } from '../engine/validate.js';
import { Button, Callout, Field, Pill, StylePill, Switch, TextInput, TokenArea, Tip } from './ui.jsx';
import { LocationFields, ProfileForm, useSample } from './Tailoring.jsx';
import { writeFlowDraft } from './store.js';
import { clone } from '../engine/clone.js';

const STEPS = [
  { id: 'brief', label: 'Your brief', hint: 'What you want, in your words' },
  { id: 'context', label: 'Context', hint: 'Who, what and where' },
  { id: 'story', label: 'Story', hint: 'Letter, product, stages' },
  { id: 'people', label: 'People and events', hint: 'The team and what happens' },
  { id: 'design', label: 'Learning design', hint: 'Length, difficulty, fairness' },
  { id: 'review', label: 'Review', hint: 'Create the draft' },
];

// "Needs you" is only ever shown on a question that is actually asked.
const SOURCE = {
  brief: { label: 'From your brief', tone: 'good' },
  inferred: { label: 'Inferred', tone: 'accent' },
  suggested: { label: 'Suggested', tone: 'accent' },
  default: { label: 'Suggested', tone: 'accent' },
  you: { label: 'Set by you', tone: '' },
};

const LENGTH_OF = Object.fromEntries(SESSION_LENGTHS.map((l) => [l.id, l]));
const GENIE_TIMEOUT_MS = 20000;
const EMPTY_BRIEF = { instructions: '', outcomes: [], outcomeText: '', constraints: '', chips: [] };
const DEFAULT_SETTINGS = { name: '', audience: ['First-time managers'], length: 'long', difficulty: 'standard', outcomes: ['adapt'], noFiring: false, formal: false, localNames: false, letterVariant: 0, namesVariant: 0, target: null, targetFrom: null, weeks: null, dealValue: null, currency: null };
const DRIVERS = ['orgName', 'industry', 'customIndustry', 'offeringType', 'customerType', 'country', 'customCountry', 'city'];
const briefText = (b) => [b.instructions, b.outcomeText, b.constraints, ...(b.outcomes || []), ...(b.chips || [])].join('|');

export default function CreateFlow({ templateId, resume, onCancel, onCreate }) {
  const template = TEMPLATES[templateId];
  const ctx = template.contextualize;
  const base = useMemo(() => template.create(), [template]);
  const sample = useSample();
  const r = resume || {};

  const [step, setStep] = useState(r.step || 0);
  const [reached, setReached] = useState(r.reached || 0);
  const [brief, setBrief] = useState(r.brief || EMPTY_BRIEF);
  const [readOf, setReadOf] = useState(r.readOf ?? null); // the brief as it was when last read
  const [reading, setReading] = useState(null); // { started } while Genie reads
  const [sources, setSources] = useState(r.sources || {});
  const [asked, setAsked] = useState(r.asked || []); // questions shown on the Context step; they stay while being answered
  const [resolved, setResolved] = useState(r.resolved || {}); // answers to "your brief says two things" questions
  const [readBy, setReadBy] = useState(r.readBy || null);
  const [profile, setProfile] = useState(() => r.profile || { ...base.context.profile });
  const [settings, setSettings] = useState(() => ({ ...DEFAULT_SETTINGS, ...(r.settings || {}) }));
  const [overrides, setOverrides] = useState(r.overrides || {});
  const [found, setFound] = useState(r.found || { conflicts: [], specifics: [], suggestions: {}, notes: [] });
  const [stale, setStale] = useState(r.stale || null); // edits made before the brief changed
  const [history, setHistory] = useState([]); // undo for regenerate, new versions and new names
  const [busy, setBusy] = useState('');
  const [genieError, setGenieError] = useState('');
  const [calibration, setCalibration] = useState(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const inflight = useRef(false); // set synchronously so a double click cannot start two requests
  const readRun = useRef(0);

  const mark = (keys) => setSources((s) => ({ ...s, ...Object.fromEntries(keys.map((k) => [k, 'you'])) }));
  const changeProfile = (next, keys = []) => { setProfile(next); mark(keys); };
  const setDriver = (key, value) => changeProfile(suggestProfile({ ...profile, [key]: value }, key, profile), [key]);
  const setS = (patch, keys = Object.keys(patch)) => { setSettings((s) => ({ ...s, ...patch })); mark(keys); };

  // A question is answered when it has a real value, not when the field was touched.
  const answered = (k) => {
    if (k === 'orgName') return !!profile.orgName?.trim();
    if (k === 'offeringName') return !!profile.offeringName?.trim();
    if (k === 'industry') return sources.industry === 'you' && (profile.industry !== 'other' || !!profile.customIndustry?.trim());
    if (k === 'country') return sources.country === 'you' && (profile.country !== 'custom' || !!profile.customCountry?.trim());
    if (k.startsWith('conflict:')) return !!resolved[k.slice(9)];
    return true;
  };
  const unanswered = asked.filter((k) => !answered(k));

  // ---------- autosave ----------
  const snapshot = { templateId, step, reached, brief, readOf, sources, asked, resolved, readBy, profile, settings, overrides, found, stale };
  const snapRef = useRef(snapshot);
  snapRef.current = snapshot;
  const hasWork = !!(brief.instructions.trim() || reached > 0);
  useEffect(() => {
    if (!hasWork) return undefined;
    const t = setTimeout(() => setSaveFailed(!writeFlowDraft(snapRef.current)), 300);
    return () => clearTimeout(t);
  }, [hasWork, step, reached, brief, readOf, sources, asked, resolved, readBy, profile, settings, overrides, found, stale]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const flush = () => { if (hasWork) writeFlowDraft(snapRef.current); };
    // Only ask before leaving when leaving would lose something: a reading in progress or a failed save.
    const warn = (e) => { if (reading || saveFailed) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('pagehide', flush);
    window.addEventListener('beforeunload', warn);
    return () => { window.removeEventListener('pagehide', flush); window.removeEventListener('beforeunload', warn); };
  }, [hasWork, reading, saveFailed]);

  // ---------- one derived draft for every stage ----------
  // template → tailoring → length and difficulty → brief specifics → the author's edits → settings.
  const specifics = found.specifics;
  const draft = useMemo(() => {
    let def = clone(base);
    const p = { ...profile, depth: settings.localNames ? 'deep' : 'standard', letterVariant: settings.letterVariant, namesVariant: settings.namesVariant };
    ctx.applyProposals(def, ctx.proposeContext(def, p), p);
    def = rescaleTimeline(def, settings.weeks || LENGTH_OF[settings.length].weeks);
    def = applyDifficulty(def, settings.difficulty);
    applyBriefSpecifics(def, specifics);
    for (const o of Object.values(overrides)) {
      try { ctx.writeTarget(def, o.target, o.value); } catch { /* an edit to something that no longer exists */ }
    }
    def.meta.name = settings.name.trim() || `iLead: ${profile.orgName?.trim() || 'New simulation'}`;
    def.meta.audience = settings.audience;
    def.meta.outcomes = settings.outcomes;
    const fire = def.actions.find((a) => a.id === 'fire');
    if (fire) fire.enabled = !settings.noFiring;
    const focus = new Set(settings.outcomes);
    def.report.competencies.sort((a, b) => Number(focus.has(b.id)) - Number(focus.has(a.id)));
    if (settings.dealValue > 0) def.funnel.valuePerConversion = settings.dealValue;
    if (settings.currency) def.funnel.currency = settings.currency;
    if (settings.target) def.funnel.target = settings.target;
    return def;
  }, [base, ctx, profile, settings, overrides, specifics]);

  const notes = [brief.instructions, brief.outcomeText && `Outcome: ${brief.outcomeText}`, brief.constraints && `Constraints: ${brief.constraints}`, settings.formal && 'Use a formal tone.'].filter(Boolean).join('\n');

  // ---------- reading the brief ----------
  const go = (i) => {
    setStep(i);
    setReached((x) => Math.max(x, i));
    document.querySelector('.main')?.scrollTo({ top: 0 });
  };

  const finishRead = (result, from, withBrief) => {
    // Keep anything the author already set by hand in the Context step.
    const mine = Object.entries(sources).filter(([, v]) => v === 'you').map(([k]) => k);
    const nextProfile = { ...result.profile };
    const nextSettings = { ...settings, ...result.settings, name: settings.name, letterVariant: settings.letterVariant, namesVariant: settings.namesVariant };
    for (const k of mine) {
      if (k in profile) nextProfile[k] = profile[k];
      if (k in settings) nextSettings[k] = settings[k];
    }
    nextSettings.targetFrom = result.settings.target ? 'brief' : null;
    if (!result.settings.target) nextSettings.target = null;
    // Edits written for the old context may no longer fit: offer to keep or refresh them.
    const changed = readOf !== null && DRIVERS.some((k) => String(nextProfile[k] ?? '') !== String(profile[k] ?? ''));
    const edited = Object.keys(overrides);
    if (changed && edited.length) setStale({ keys: edited, was: summary(profile) });
    setProfile(nextProfile);
    setSettings(nextSettings);
    setSources({ ...result.sources, ...Object.fromEntries(mine.map((k) => [k, 'you'])) });
    const conflictKeys = (result.conflicts || []).map((c) => `conflict:${c.key}`);
    setAsked([...result.missing.filter((k) => !mine.includes(k)), ...conflictKeys]);
    setResolved({});
    setFound({ conflicts: result.conflicts || [], specifics: result.specifics || [], suggestions: result.suggestions || {}, notes: result.notes || [] });
    setReadBy(from);
    setReadOf(briefText(withBrief));
    setCalibration(null);
    setReading(null);
    inflight.current = false;
    go(1);
  };

  const read = async (withBrief = brief) => {
    if (inflight.current) return;
    inflight.current = true;
    const run = ++readRun.current;
    setGenieError('');
    const rules = readBrief(withBrief, base.context.profile);
    if (!sample || !withBrief.instructions.trim()) { finishRead(rules, withBrief.instructions.trim() ? 'rules' : 'none', withBrief); return; }
    setReading({ started: Date.now() });
    let timer;
    const timeout = new Promise((_, reject) => { timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'timeout' })), GENIE_TIMEOUT_MS); });
    try {
      const g = await Promise.race([sample.json(briefPrompt(withBrief), { modelTier: 'default' }), timeout]);
      if (run !== readRun.current) return; // stopped meanwhile
      finishRead(mergeGenieBrief(rules, g, base.context.profile), 'genie', withBrief);
    } catch (e) {
      if (run !== readRun.current) return;
      if (e?.code === 'timeout') setGenieError('Genie was taking too long, so your brief was read with the built-in rules. You can read it again with Genie from the Context step.');
      else if (e?.code !== 'cancelled') setGenieError('Genie could not read the brief this time, so the built-in rules were used.');
      finishRead(rules, 'rules', withBrief);
    } finally {
      clearTimeout(timer);
    }
  };
  const stopReading = () => {
    readRun.current += 1;
    finishRead(readBrief(brief, base.context.profile), 'rules', brief);
    setGenieError('Stopped. Your brief was read with the built-in rules instead.');
  };

  // ---------- undo ----------
  const remember = (label) => setHistory((h) => [...h.slice(-9), { label, overrides, settings }]);
  const undo = () => {
    const last = history.at(-1);
    if (!last) return;
    setOverrides(last.overrides);
    setSettings(last.settings);
    setHistory((h) => h.slice(0, -1));
  };

  // ---------- Genie regeneration ----------
  const itemsFor = (pred) => collectTexts(draft).filter((t) => t.text && pred(t));
  const isEdited = (t) => overrides[`ref:${refKey(t.ref)}`]?.by === 'you';
  const regenerate = async (items, label, { replaceEdited = false } = {}) => {
    if (!sample || inflight.current) return;
    const keep = replaceEdited ? [] : items.filter(isEdited);
    const todo = replaceEdited ? items : items.filter((t) => !isEdited(t));
    if (!todo.length) { setGenieError('Everything here has your own edits, so nothing was regenerated.'); return; }
    inflight.current = true;
    setBusy(label);
    setGenieError('');
    try {
      const reply = await sample.json(geniePrompt(draft, profile, todo, notes), { cache: false });
      const all = genieProposals(draft, todo, reply);
      const good = all.filter((p) => p.status !== 'check');
      const bad = all.filter((p) => p.status === 'check');
      if (bad.length) console.warn('Genie changed field tokens', bad.map((p) => ({ label: p.label, note: p.note }))); // for the AI team's logs
      if (good.length) {
        remember(label);
        setOverrides((o) => ({ ...o, ...Object.fromEntries(good.map((p) => [p.id, { target: p.target, value: p.after, by: 'genie' }])) }));
      }
      const msgs = [];
      if (bad.length) msgs.push(`Genie's version of ${bad.length === 1 ? 'one item' : `${bad.length} items`} used a field we do not recognise, so we kept yours. Try again.`);
      if (!good.length && !bad.length) msgs.push('Genie returned the same text. Try again, or add notes to your brief.');
      if (keep.length) msgs.push(`${keep.length} item${keep.length === 1 ? '' : 's'} you edited ${keep.length === 1 ? 'was' : 'were'} kept as you wrote ${keep.length === 1 ? 'it' : 'them'}.`);
      if (msgs.length) setGenieError(msgs.join(' '));
    } catch (e) {
      if (e?.code !== 'cancelled') setGenieError(e?.code === 'rate_limited' ? 'Genie is busy. Try again in a minute.' : 'Genie could not finish. Your current version is kept.');
    }
    inflight.current = false;
    setBusy('');
  };
  const editText = (ref, value) => { const t = { kind: 'ref', ref }; setOverrides((o) => ({ ...o, [targetKey(t)]: { target: t, value, by: 'you' } })); };
  const editTarget = (target, value) => setOverrides((o) => ({ ...o, [targetKey(target)]: { target, value, by: 'you' } }));
  const dropOverrides = (pred) => setOverrides((o) => Object.fromEntries(Object.entries(o).filter(([, v]) => !pred(v.target))));

  // ---------- fairness: check the target automatically on the design step ----------
  const calKey = JSON.stringify([settings.length, settings.weeks, settings.difficulty, settings.noFiring, settings.targetFrom === 'brief' ? settings.target : null, specifics.map((x) => x.id)]);
  const calRun = useRef(0);
  useEffect(() => {
    if (STEPS[step].id !== 'design' || calibration?.key === calKey) return;
    const run = ++calRun.current;
    const def = clone(draft);
    setCalibration({ key: calKey, pending: true });
    runBalanceAsync(def, { runs: 8, bots: ['expert', 'oneStyle', 'random'] }).then((res) => {
      if (run !== calRun.current) return;
      const suggested = res.suggestedTarget;
      const own = settings.targetFrom === 'brief';
      const target = own ? def.funnel.target : suggested;
      const scale = def.funnel.target / target;
      const weak = Math.max(res.bots.random.p50, res.bots.oneStyle.p50) * scale;
      const hits = res.bots.expert.samples.filter((a) => a * scale >= 1).length;
      setCalibration({ key: calKey, own, target, suggested, expert: res.bots.expert.p50 * scale, weak, hits, runs: res.bots.expert.runs });
      if (!own) setSettings((s) => ({ ...s, target: suggested, targetFrom: 'calibrated' }));
    });
  }, [step, calKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = STEPS[step].id;
  const canContinue = current !== 'context' || unanswered.length === 0;
  const briefChanged = readOf !== null && readOf !== briefText(brief);
  const genieState = sample === undefined ? 'checking' : sample ? 'on' : 'off';

  return (
    <div className="shell compact-rail">
      <nav className="rail" aria-label="Steps">
        <div className="rail-group">
          <span className="eyebrow">{genieState === 'on' ? 'Create with Genie' : 'Create from a brief'} · {template.name}</span>
          {STEPS.map((s, i) => (
            <button key={s.id} type="button" className={`rail-item ${i === step ? 'active' : ''}`} onClick={() => i <= reached && go(i)} aria-disabled={i > reached} aria-current={i === step ? 'step' : undefined}>
              <span className="badge" style={{ marginLeft: 0, background: i < reached && i !== step ? 'var(--good)' : undefined, color: i < reached && i !== step ? '#fff' : undefined }}>{i < reached && i !== step ? '✓' : i + 1}</span>
              <span className="stack" style={{ '--gap': '0' }}>
                <span>{s.label}</span>
                <span className="small muted" style={{ fontWeight: 400 }}>{s.hint}</span>
              </span>
            </button>
          ))}
        </div>
        <div className="rail-group small muted stack" style={{ padding: '0 10px', '--gap': '8px' }}>
          <span><GenieStatus state={genieState} /></span>
          <span>{genieState === 'on' ? 'Genie reads your brief and drafts each stage. You review, edit or regenerate before moving on.' : 'Built-in rules read your brief here. In the hosted GenieKreator, Genie reads it and can regenerate any stage.'}</span>
          {saveFailed ? <strong style={{ color: 'var(--bad)' }}>This browser is not saving the draft.</strong> : hasWork ? <span>Your progress is saved in this browser as you go.</span> : null}
        </div>
      </nav>
      <div className="mobile-nav">
        <label className="sr-only" htmlFor="flow-step">Step</label>
        <select id="flow-step" className="select" value={step} onChange={(e) => go(Number(e.target.value))}>
          {STEPS.map((s, i) => <option key={s.id} value={i} disabled={i > reached}>{`Step ${i + 1} of ${STEPS.length}: ${s.label}`}</option>)}
        </select>
        <GenieStatus state={genieState} compact />
      </div>
      <main className="main">
        <div className="page stack" style={{ '--gap': '22px', maxWidth: 940 }}>
          {genieError && <Callout tone="warn" icon="!">{genieError}</Callout>}
          {history.length > 0 && current !== 'brief' && (
            <div className="row small" style={{ '--gap': '8px' }}>
              <span className="muted">Last change: {history.at(-1).label}.</span>
              <Button size="sm" onClick={undo} tip="Brings back the version you had before this change.">Undo</Button>
            </div>
          )}
          {current !== 'brief' && <BriefPin brief={brief} changed={briefChanged} onEdit={() => go(0)} onReread={() => read()} busy={!!reading} />}

          {current === 'brief' && <BriefStep brief={brief} setBrief={setBrief} locked={!!reading} genie={genieState === 'on'} />}
          {current === 'context' && (
            <ContextStep {...{ profile, settings, sources, asked, answered, found, resolved, readBy, stale, changeProfile, setDriver, setS, setResolved, mark, overrides, draft }}
              onReread={() => read()}
              onStale={(action, keys) => {
                if (action === 'refresh') { remember('refreshed your edits for the new context'); setOverrides((o) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)))); }
                setStale((st) => (st ? { ...st, keys: st.keys.filter((k) => !keys.includes(k)) } : st));
              }}
            />
          )}
          {current === 'story' && (
            <StoryStep draft={draft} profile={profile} sample={sample} busy={busy} editText={editText} editTarget={editTarget} overrides={overrides}
              onRegenerateLetter={(replaceEdited) => {
                if (sample) return regenerate(itemsFor((t) => t.ref.field === 'welcome'), 'rewrote the letter', { replaceEdited: true });
                // Without Genie: switch to the next letter version (an edited letter is confirmed first).
                remember('switched to another letter');
                setSettings((s) => ({ ...s, letterVariant: s.letterVariant + 1 }));
                return dropOverrides((t) => t.ref?.field === 'welcome');
              }}
              onRegenerateBrief={() => regenerate(itemsFor((t) => t.ref.field === 'overview' || t.ref.field === 'target'), 'rewrote the product brief', { replaceEdited: true })}
              onRegenerateStages={() => regenerate(itemsFor((t) => !!t.ref.stageId), 'rewrote the stage descriptions')}
            />
          )}
          {current === 'people' && (
            <PeopleStep draft={draft} profile={profile} settings={settings} setS={setS} sample={sample} busy={busy} editText={editText} editTarget={editTarget} overrides={overrides}
              onNewNames={() => { remember('picked new names'); setSettings((s) => ({ ...s, namesVariant: s.namesVariant + 1, localNames: true })); dropOverrides((t) => t.kind === 'actor' && t.field === 'name'); }}
              onRegenerateEvents={() => regenerate(itemsFor((t) => !!t.ref.eventId && draft.events.find((e) => e.id === t.ref.eventId)?.enabled), 'rewrote the events')}
              onRegenerateBios={() => regenerate(itemsFor((t) => !!t.ref.actorId && draft.actors.find((a) => a.id === t.ref.actorId)?.pool === 'team'), 'rewrote the backgrounds')}
            />
          )}
          {current === 'design' && <DesignStep settings={settings} setS={setS} sources={sources} calibration={calibration} />}
          {current === 'review' && <ReviewStep draft={draft} profile={profile} settings={settings} sources={sources} overrides={overrides} readBy={readBy} found={found} />}

          <div className="row spread" style={{ borderTop: '1px solid var(--line)', paddingTop: 16 }}>
            <Button variant="ghost" onClick={step === 0 ? onCancel : () => go(step - 1)} tip={step === 0 && hasWork ? 'Back to Simulations. This draft stays saved so you can resume it.' : undefined} tipAlign="start">{step === 0 ? (hasWork ? 'Save and exit' : 'Cancel') : 'Back'}</Button>
            <div className="row">
              {current === 'brief' && (
                reading ? (
                  <>
                    <ReadingTimer started={reading.started} />
                    <Button onClick={stopReading} tip="Stops Genie and reads your brief with the built-in rules instead.">Stop</Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" onClick={() => read(EMPTY_BRIEF)} tip="Skip the brief and answer a few questions instead. Everything else is pre-filled from the template.">Set up without a brief</Button>
                    {readOf !== null && !briefChanged ? (
                      <Button variant="primary" size="lg" onClick={() => go(1)} tip="Your brief has not changed since it was read. Continue where you were.">Continue</Button>
                    ) : (
                      <Button variant="primary" size="lg" disabled={!brief.instructions.trim()} onClick={() => read()} tip={genieState === 'on' ? 'Genie reads your brief, infers the organization, industry, location and settings, and asks only for what it cannot tell.' : 'Reads your brief with built-in rules and pre-fills every stage. You can change anything on the next steps.'} tipAlign="end">Build my simulation</Button>
                    )}
                  </>
                )
              )}
              {current !== 'brief' && current !== 'review' && (
                <Button variant="primary" disabled={!canContinue} onClick={() => go(step + 1)} tip={canContinue ? 'Keeps everything on this step and moves on. You can come back at any time.' : 'Answer the questions above first.'} tipAlign="end">
                  {canContinue ? 'Looks good, continue' : `Answer ${unanswered.length} question${unanswered.length === 1 ? '' : 's'} to continue`}
                </Button>
              )}
              {current === 'review' && (
                <Button variant="primary" size="lg" disabled={busy === 'create'} tip="Creates the draft and opens it in the Studio, with a fresh balance check attached." tipAlign="end" onClick={async () => {
                  setBusy('create');
                  const balance = await runBalanceAsync(draft, { runs: 10 });
                  onCreate(draft, 'overview', { ...balance, at: Date.now() + 1000, target: draft.funnel.target }, brief);
                }}>
                  {busy === 'create' ? 'Checking balance and creating…' : 'Create draft'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

const summary = (p) => [p.orgName, industryPack(p).label, p.city, locationPack(p).label].filter(Boolean).join(', ');

function GenieStatus({ state, compact }) {
  const map = { on: ['good', 'Genie on'], off: ['', 'Genie offline: built-in rules'], checking: ['', 'Checking for Genie…'] };
  const [tone, label] = map[state];
  return <Pill tone={tone} title={state === 'off' ? 'Genie runs in the hosted GenieKreator. Here, built-in rules read your brief and you can still edit everything.' : undefined}>{compact && state === 'off' ? 'Genie offline' : label}</Pill>;
}

function ReadingTimer({ started }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  const s = Math.floor((now - started) / 1000);
  return <span className="small muted num" role="status" aria-live="polite">Genie is reading your brief… {s}s{s >= 8 ? ` (built-in rules take over at ${GENIE_TIMEOUT_MS / 1000}s)` : ''}</span>;
}

// The brief stays in view on every step, so the author can check the draft against it.
function BriefPin({ brief, changed, onEdit, onReread, busy }) {
  const text = [brief.instructions, brief.outcomeText && `Outcome: ${brief.outcomeText}`, brief.constraints && `Constraints: ${brief.constraints}`].filter(Boolean).join('\n');
  return (
    <details className="brief-pin" open={changed || undefined}>
      <summary>Your brief{changed ? ' (changed since it was read)' : ''}</summary>
      <p>{text || 'No brief. You set this up by answering questions.'}</p>
      <div className="row" style={{ marginTop: 8 }}>
        <Button size="sm" onClick={onEdit}>Edit brief</Button>
        {changed && <Button size="sm" variant="primary" disabled={busy} onClick={onReread} tip="Reads the changed brief. Details you set by hand are kept.">Read it again</Button>}
      </div>
    </details>
  );
}

// ---------- step 1: the brief ----------

function BriefStep({ brief, setBrief, locked, genie }) {
  const set = (k, v) => setBrief((b) => ({ ...b, [k]: v }));
  const toggle = (k, id) => setBrief((b) => ({ ...b, [k]: b[k].includes(id) ? b[k].filter((x) => x !== id) : [...b[k], id] }));
  return (
    <>
      <div>
        <div className="eyebrow">Step 1 of 6</div>
        <h1>What do you want to create?</h1>
        <p className="ink2" style={{ marginTop: 6, maxWidth: '66ch' }}>Describe it the way you would to a colleague. Mention who it is for, your organization, what the team sells and where they work. {genie ? 'Genie fills in the rest and asks only for what it cannot tell.' : 'The rest is filled in for you, and you are asked only for what cannot be worked out.'}</p>
      </div>
      <fieldset disabled={locked} className="stack" style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
        <div className="row small" style={{ '--gap': '6px' }}>
          <span className="muted">Start from an example:</span>
          {EXAMPLE_BRIEFS.map((ex) => <Button key={ex.label} size="sm" onClick={() => setBrief((b) => ({ ...b, instructions: ex.instructions, outcomeText: ex.outcomeText, constraints: ex.constraints }))} tip="Fills in the brief with this example so you can see the flow. Edit it freely.">{ex.label}</Button>)}
        </div>
        <Field label="Your brief" id="b-ins" hint={locked ? 'Locked while Genie reads it.' : 'Two to four sentences is plenty. Specifics such as weeks, a target, stage names or events are used where the template allows.'}>
          <textarea id="b-ins" className="textarea" rows={5} value={brief.instructions} readOnly={locked} onChange={(e) => set('instructions', e.target.value)} placeholder="e.g. A 60-minute simulation for first-time sales managers at Meridian Bank in Mumbai. Their teams sell home loans to consumers, and new managers struggle to coach low performers." />
        </Field>
        <div className="field">
          <span className="label">What should learners be able to do afterwards?</span>
          <div className="row" style={{ '--gap': '6px' }}>
            {OUTCOMES.map((o) => <button key={o.id} type="button" className={`btn sm ${brief.outcomes.includes(o.id) ? 'primary' : ''}`} aria-pressed={brief.outcomes.includes(o.id)} onClick={() => toggle('outcomes', o.id)}>{o.label}</button>)}
          </div>
          <input className="input" aria-label="Outcome in your words" placeholder="Or in your own words (optional)" value={brief.outcomeText} onChange={(e) => set('outcomeText', e.target.value)} />
        </div>
        <div className="field">
          <span className="label">Anything to keep in mind?</span>
          <div className="row" style={{ '--gap': '6px' }}>
            {CONSTRAINT_CHIPS.map((c) => <button key={c.id} type="button" className={`btn sm ${brief.chips.includes(c.id) ? 'primary' : ''}`} aria-pressed={brief.chips.includes(c.id)} onClick={() => toggle('chips', c.id)}>{c.label}</button>)}
          </div>
          <input className="input" aria-label="Constraints and preferences" placeholder="Constraints or preferences (optional), e.g. avoid real brand names" value={brief.constraints} onChange={(e) => set('constraints', e.target.value)} />
        </div>
      </fieldset>
      <p className="small muted">{genie ? 'Genie reads your brief under your account to draft the simulation. ' : ''}Your brief is kept with this draft for you only. It is not part of what learners get, published versions or the exported file.</p>
    </>
  );
}

// ---------- step 2: context ----------

const QUESTIONS = {
  orgName: 'What is your organization called?',
  industry: 'Which industry is it?',
  country: 'Which country is the team in?',
  offeringName: 'What is the product or service called?',
};

function ContextStep({ profile, settings, sources, asked, answered, found, resolved, readBy, stale, changeProfile, setDriver, setS, setResolved, mark, onReread, onStale, overrides, draft }) {
  const done = (k) => asked.includes(k) && answered(k);
  const Q = ({ k, text }) => <span className="row" style={{ '--gap': '6px' }}>{text || QUESTIONS[k]}{done(k) ? <Pill tone="good">Answered</Pill> : <Pill tone="warn">Needs you</Pill>}</span>;
  const [editing, setEditing] = useState(false);
  const pack = industryPack(profile);
  const loc = locationPack(profile);
  // Suggestions follow the answers so far: pick Banking and the sample bank is offered; type the
  // organization and the product name suggestion uses it.
  const sug = { ...(found.suggestions || {}), orgName: pack.sampleOrg || found.suggestions?.orgName, offeringName: (pack[profile.offeringType] || pack.product)?.name || suggestOfferingName(profile) };
  const need = (k) => asked.includes(k) && !answered(k);
  const rows = [
    ['orgName', 'Organization', profile.orgName || 'Not known yet'],
    ['industry', 'Industry', pack.label],
    ['offeringName', 'Sells', `${profile.offeringType === 'service' ? 'A service' : 'A product'}: ${profile.offeringName || 'name not known yet'}${profile.offeringCategory ? ` (${profile.offeringCategory})` : ''}`],
    ['customerType', 'Buyers', profile.customerType === 'b2c' ? 'Consumers' : 'Businesses'],
    ['country', 'Location', `${profile.city ? `${profile.city}, ` : ''}${loc.label}`],
    ['learnerRole', "Learner's role", profile.learnerRole],
    ['audience', 'Audience', settings.audience.join(', ')],
  ];
  const conflicts = (found.conflicts || []).filter((c) => asked.includes(`conflict:${c.key}`));
  const used = (found.specifics || []).filter((x) => x.used);
  const unused = (found.specifics || []).filter((x) => !x.used);
  const staleItems = stale?.keys?.length ? stale.keys.filter((k) => overrides[k]).map((k) => ({ k, label: labelFor(draft, overrides[k]) })) : [];
  const industryName = pack.label === 'Other' ? 'your industry' : pack.label;
  return (
    <>
      <div>
        <div className="eyebrow">Step 2 of 6</div>
        <h1>{asked.length ? 'A few questions' : 'Here is what we understood'}</h1>
        <p className="ink2" style={{ marginTop: 6, maxWidth: '66ch' }}>{readBy === 'genie' ? 'Genie read your brief.' : readBy === 'none' ? 'No brief, so everything starts from the template.' : 'Your brief was read with built-in rules.'} Everything below is pre-filled; tell us only what could not be worked out.</p>
      </div>

      {(found.notes || []).map((n, i) => <Callout key={i} tone={n.kind === 'language' ? 'warn' : ''} icon={n.kind === 'question' ? '?' : '!'}>{n.kind === 'question' ? <>Genie asks: {n.text}</> : n.text}</Callout>)}

      {staleItems.length > 0 && (
        <div className="card stack" style={{ borderColor: 'var(--warn)' }}>
          <strong>You edited {staleItems.length} item{staleItems.length === 1 ? '' : 's'} before the brief changed</strong>
          <p className="small ink2">They were written for {stale.was}. Keep them as they are, or refresh them for the new context.</p>
          {staleItems.map(({ k, label }) => (
            <div key={k} className="row spread small" style={{ borderTop: '1px solid var(--line)', paddingTop: 6 }}>
              <span>{label}</span>
              <span className="row nowrap"><Button size="sm" onClick={() => onStale('keep', [k])}>Keep</Button><Button size="sm" variant="ghost" onClick={() => onStale('refresh', [k])}>Refresh</Button></span>
            </div>
          ))}
          <div className="row"><Button size="sm" onClick={() => onStale('keep', stale.keys)}>Keep all my edits</Button><Button size="sm" variant="primary" onClick={() => onStale('refresh', stale.keys)} tip="Drops these edits so they follow the new context. You can undo this.">Refresh all for the new context</Button></div>
        </div>
      )}

      {asked.length > 0 && (
        <div className="card stack" style={{ borderColor: asked.some(need) ? 'var(--warn)' : 'var(--good)' }}>
          {asked.includes('orgName') && (
            <div className="stack" style={{ '--gap': '6px' }}>
              <TextInput label={<Q k="orgName" />} value={profile.orgName} onChange={(v) => changeProfile({ ...profile, orgName: v }, v.trim() ? ['orgName'] : [])} placeholder={sug.orgName ? `e.g. ${sug.orgName}, or a fictional name` : 'Your organization, or a fictional name'} />
              {sug.orgName && !profile.orgName?.trim() && <div><Button size="sm" onClick={() => changeProfile({ ...profile, orgName: sug.orgName }, ['orgName'])} tip="Uses this sample name. You can change it at any time.">Use {sug.orgName}</Button></div>}
            </div>
          )}
          {asked.includes('industry') && (
            <div className="grid cols-2">
              <Field label={<Q k="industry" />} id="q-ind">
                <select id="q-ind" className="select" value={profile.industry} onChange={(e) => {
                  // Picking an industry must not answer other open questions with its sample names.
                  const next = suggestProfile({ ...profile, industry: e.target.value }, 'industry', profile);
                  if (asked.includes('orgName')) next.orgName = profile.orgName;
                  if (asked.includes('offeringName')) next.offeringName = profile.offeringName;
                  changeProfile(next, ['industry']);
                }}>
                  {Object.entries(INDUSTRIES).map(([id, p]) => <option key={id} value={id}>{p.label}</option>)}
                  <option value="other">Other (describe it)</option>
                </select>
              </Field>
              {profile.industry === 'other' && <TextInput label="Describe your industry" value={profile.customIndustry} onChange={(v) => changeProfile({ ...profile, customIndustry: v }, ['industry'])} placeholder="e.g. Solar energy" />}
              {need('industry') && profile.industry !== 'other' && <div style={{ alignSelf: 'end' }}><Button size="sm" variant="primary" onClick={() => mark(['industry'])}>Use {INDUSTRIES[profile.industry].label}</Button></div>}
            </div>
          )}
          {asked.includes('offeringName') && (
            <div className="stack" style={{ '--gap': '6px' }}>
              <TextInput label={<Q k="offeringName" text={`What is the ${profile.offeringType === 'service' ? 'service' : 'product'} the team sells called?`} />} value={profile.offeringName} onChange={(v) => changeProfile({ ...profile, offeringName: v }, v.trim() ? ['offeringName'] : [])} placeholder={sug.offeringName ? `e.g. ${sug.offeringName}` : 'e.g. SunRoof Home'} />
              {sug.offeringName && !profile.offeringName?.trim() && <div><Button size="sm" onClick={() => changeProfile({ ...profile, offeringName: sug.offeringName }, ['offeringName'])} tip="A name drafted from your organization's name. You can change it at any time.">Use {sug.offeringName}</Button></div>}
            </div>
          )}
          {asked.includes('country') && (
            <div className="stack" style={{ '--gap': '6px' }}>
              <span className="label small" style={{ fontWeight: 600 }}><Q k="country" text={sug.country ? 'Your brief mentions more than one place. Where is the team?' : undefined} /></span>
              {sug.country && (
                <div className="row" style={{ '--gap': '6px' }}>
                  {sug.country.map((o) => <Button key={o.label} size="sm" variant={profile.country === o.country && answered('country') ? 'primary' : ''} onClick={() => changeProfile({ ...profile, country: o.country, city: o.city }, ['country'])}>{o.label}</Button>)}
                </div>
              )}
              <LocationFields profile={profile} onChange={(p) => changeProfile(p, ['country'])} setDriver={(k, v) => changeProfile(suggestProfile({ ...profile, [k]: v }, k, profile), ['country'])} />
            </div>
          )}
          {conflicts.map((c) => (
            <div key={c.key} className="stack" style={{ '--gap': '6px' }}>
              <span className="label small" style={{ fontWeight: 600 }}><Q k={`conflict:${c.key}`} text={c.question} /></span>
              <div className="row" style={{ '--gap': '6px' }}>
                {c.options.map((o) => (
                  <Button key={o.label} size="sm" variant={resolved[c.key] === o.label ? 'primary' : ''} onClick={() => {
                    if (o.profile) changeProfile({ ...profile, ...o.profile }, Object.keys(o.profile));
                    if (o.settings) setS(o.settings);
                    setResolved((x) => ({ ...x, [c.key]: o.label }));
                  }}>{o.label}</Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {pack.generic && (
        <div className="card stack">
          <div className="row spread"><h3>Help us fit {industryName}</h3><Pill tone="warn">Optional</Pill></div>
          <p className="small ink2">{industryName.charAt(0).toUpperCase() + industryName.slice(1)} is not one of the built-in industry packs, so some items start generic. Three quick answers make them specific.</p>
          <div className="grid cols-2">
            <TextInput label="Your main competitor" placeholder="e.g. SunGrid Power" value={profile.customCompetitor || ''} onChange={(v) => changeProfile({ ...profile, customCompetitor: v })} />
            <TextInput label="Two other things you sell" placeholder="e.g. battery storage, EV chargers" value={profile.customPortfolio || ''} onChange={(v) => changeProfile({ ...profile, customPortfolio: v })} />
          </div>
          <TextInput label="A setback your teams dread" hint="Becomes the crisis event in the middle of the run." placeholder="e.g. a key panel supplier goes out of business" value={profile.customSetback || ''} onChange={(v) => changeProfile({ ...profile, customSetback: v })} />
        </div>
      )}

      <div className="card stack" style={{ '--gap': '0' }}>
        {rows.map(([key, label, value]) => {
          const src = SOURCE[sources[key]] || SOURCE.suggested;
          return (
            <div key={key} className="check-row" style={{ gridTemplateColumns: 'minmax(110px, 150px) 1fr auto' }}>
              <span className="small muted">{label}</span>
              <strong className="small">{value}</strong>
              <Pill tone={need(key) ? 'warn' : src.tone}>{need(key) ? 'Needs you' : src.label}</Pill>
            </div>
          );
        })}
      </div>

      {(used.length > 0 || unused.length > 0) && (
        <div className="card stack">
          <h3>Specific instructions in your brief</h3>
          {used.map((x) => <div key={x.id} className="row small" style={{ '--gap': '8px' }}><Pill tone="good">Used</Pill><span><strong>{x.label}:</strong> {x.text}</span></div>)}
          {unused.map((x) => <div key={x.id} className="row small" style={{ '--gap': '8px', alignItems: 'start' }}><Pill tone="warn">Not used yet</Pill><span><strong>{x.label}:</strong> {x.text}. {x.reason}</span></div>)}
        </div>
      )}

      <div className="row">
        <Button onClick={() => setEditing((e) => !e)} tip="Change any of the details above. Your changes are kept if the brief is read again.">{editing ? 'Hide details' : 'Edit details'}</Button>
        {readBy !== 'none' && <Button variant="ghost" onClick={onReread} tip="Reads your brief again. Details you changed here are kept.">Read my brief again</Button>}
      </div>
      {editing && (
        <div className="card stack">
          <ProfileForm profile={profile} onChange={(p0) => {
            const p = { ...p0 };
            // An industry change suggests sample names; they must not answer an open question.
            if (p.industry !== profile.industry) for (const k of ['orgName', 'offeringName']) if (asked.includes(k) && !profile[k]?.trim()) p[k] = profile[k];
            changeProfile(p, Object.keys(p).filter((k) => p[k] !== profile[k]));
          }} />
          <div className="field">
            <span className="label">Audience</span>
            <div className="row" style={{ '--gap': '6px' }}>
              {AUDIENCES.map((a) => <button key={a} type="button" className={`btn sm ${settings.audience.includes(a) ? 'primary' : ''}`} aria-pressed={settings.audience.includes(a)} onClick={() => setS({ audience: settings.audience.includes(a) ? settings.audience.filter((x) => x !== a) : [...settings.audience, a] })}>{a}</button>)}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function labelFor(draft, o) {
  if (!o) return 'An edit';
  const t = o.target;
  if (t.kind === 'ref') return collectTexts(draft).find((x) => refKey(x.ref) === refKey(t.ref))?.label || 'A text you edited';
  if (t.kind === 'stage') return `Stage name: ${o.value}`;
  if (t.kind === 'actor') return `Team member name: ${o.value}`;
  return `${t.kind}: ${o.value}`;
}

// ---------- step 3: story ----------

function GenericPill({ profile, what = 'This' }) {
  const pack = industryPack(profile);
  if (!pack.generic) return null;
  return <Tip text={`${what} is written for any industry because ${pack.label === 'Other' ? 'your industry' : pack.label} has no built-in pack. Answer the questions on the Context step, edit it, or regenerate it with Genie.`}><Pill tone="warn">Generic for your industry</Pill></Tip>;
}

function EditableText({ draft, title, textRef, onSave, onRegenerate, regenLabel, busy, canRegenerate, rows = 6, tip, edited, badge }) {
  const [editing, setEditing] = useState(false);
  const item = collectTexts(draft).find((t) => refKey(t.ref) === refKey(textRef));
  const [value, setValue] = useState(item?.text || '');
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { if (!editing) setValue(item?.text || ''); }, [item?.text, editing]);
  // Replacing the author's own words always asks first; either way there is Undo afterwards.
  const regen = () => { if (edited && !confirm) { setConfirm(true); return; } setConfirm(false); onRegenerate(); };
  return (
    <div className="card stack" style={{ '--gap': '10px' }}>
      <div className="row spread">
        <div className="row" style={{ '--gap': '8px' }}><h3>{title}</h3>{edited && <Pill>Your edit</Pill>}{badge}</div>
        <div className="row">
          {!editing && <Button size="sm" onClick={() => setEditing(true)} tip="Change the wording yourself. Names stay linked to your context.">Edit</Button>}
          {onRegenerate && !editing && (
            <Button size="sm" variant="ghost" disabled={!!busy || !canRegenerate} onClick={regen} tip={canRegenerate ? tip || 'Writes a fresh version from your brief and context.' : 'Regenerating this needs Genie, which runs in the hosted GenieKreator.'} tipAlign="end">
              {busy ? 'Writing…' : regenLabel || 'Regenerate'}
            </Button>
          )}
        </div>
      </div>
      {confirm && (
        <Callout tone="warn" icon="!">
          Replace your edited version? You can undo this afterwards. <Button size="sm" variant="primary" onClick={regen}>Replace my edit</Button> <Button size="sm" onClick={() => setConfirm(false)}>Keep mine</Button>
        </Callout>
      )}
      {editing ? (
        <>
          <TokenArea def={draft} value={value} rows={rows} tokens="actor" onChange={setValue} />
          <div className="row"><Button size="sm" variant="primary" onClick={() => { onSave(value); setEditing(false); }}>Save</Button><Button size="sm" onClick={() => setEditing(false)}>Cancel</Button></div>
        </>
      ) : (
        <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{renderText(draft, item?.text || '', { actor: 'a team member', pronoun: 'they' })}</p>
      )}
    </div>
  );
}

function StoryStep({ draft, profile, sample, busy, editText, editTarget, overrides, onRegenerateLetter, onRegenerateBrief, onRegenerateStages }) {
  const edited = (ref) => overrides[`ref:${refKey(ref)}`]?.by === 'you';
  return (
    <>
      <div>
        <div className="eyebrow">Step 3 of 6</div>
        <h1>Your story</h1>
        <p className="ink2" style={{ marginTop: 6, maxWidth: '66ch' }}>Written for your organization and market. Read it as your learners will; edit or regenerate anything.</p>
      </div>
      <EditableText draft={draft} title="Welcome letter" textRef={{ field: 'welcome' }} edited={edited({ field: 'welcome' })} onSave={(v) => editText({ field: 'welcome' }, v)} onRegenerate={onRegenerateLetter} canRegenerate busy={busy === 'rewrote the letter'} rows={10} tip={sample ? 'Genie writes a fresh letter from your brief.' : 'Switches to another version of the letter.'} regenLabel={sample ? 'Regenerate' : 'Try another version'} />
      <EditableText draft={draft} title="Product brief" textRef={{ field: 'overview' }} edited={edited({ field: 'overview' })} badge={<GenericPill profile={profile} what="The product brief" />} onSave={(v) => editText({ field: 'overview' }, v)} onRegenerate={onRegenerateBrief} canRegenerate={!!sample} busy={busy === 'rewrote the product brief'} />
      <div className="card stack">
        <div className="row spread">
          <h3>How the team's work flows</h3>
          <Button size="sm" variant="ghost" disabled={!sample || !!busy} onClick={onRegenerateStages} tip={sample ? 'Genie rewrites the stage descriptions for your market. Names stay as they are, and descriptions you edited are kept.' : 'Regenerating this needs Genie, which runs in the hosted GenieKreator.'} tipAlign="end">{busy === 'rewrote the stage descriptions' ? 'Writing…' : 'Regenerate descriptions'}</Button>
        </div>
        <p className="small muted">Five stages, each passing work to the next. Rename them to match how your teams talk.</p>
        {draft.stages.map((st, i) => (
          <div key={st.id} className="grid" style={{ gridTemplateColumns: 'auto minmax(140px, 220px) 1fr', gap: 10, alignItems: 'start', paddingTop: 8, borderTop: '1px solid var(--line)' }}>
            <span className="badge num" style={{ marginTop: 6 }}>{i + 1}</span>
            <input className="input" aria-label={`Stage ${i + 1} name`} value={st.name} onChange={(e) => editTarget({ kind: 'stage', id: st.id, field: 'name' }, e.target.value)} />
            <p className="small ink2" style={{ paddingTop: 6 }}>{renderText(draft, st.description)}</p>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------- step 4: people and events ----------

function PeopleStep({ draft, profile, settings, setS, sample, busy, editText, editTarget, overrides, onNewNames, onRegenerateEvents, onRegenerateBios }) {
  const team = draft.actors.filter((a) => a.pool === 'team');
  const events = draft.events.filter((e) => e.enabled).sort((a, b) => a.week - b.week || a.day - b.day);
  const loc = locationPack(profile);
  const regional = settings.localNames && loc.namesFrom === 'region';
  return (
    <>
      <div>
        <div className="eyebrow">Step 4 of 6</div>
        <h1>The team and what happens to them</h1>
        <p className="ink2" style={{ marginTop: 6, maxWidth: '66ch' }}>Ten people the learner will lead, each needing a different approach, and the events that test them. Timing and impact stay as designed, so the simulation stays fair.</p>
      </div>
      <div className="card stack">
        <div className="row spread">
          <h3>Starting team</h3>
          <div className="row">
            <Tip text="Gives every team member a name that fits your location. Pronouns stay the same."><Switch checked={settings.localNames} onChange={(v) => setS({ localNames: v })} label="Local names" /></Tip>
            <Button size="sm" onClick={onNewNames} tip="Picks a different set of local names for the team. Names you typed are replaced; you can undo this.">New names</Button>
            <Button size="sm" variant="ghost" disabled={!sample || !!busy} onClick={onRegenerateBios} tip={sample ? 'Genie rewrites the backgrounds for your industry and location. Backgrounds you edited are kept.' : 'Regenerating this needs Genie, which runs in the hosted GenieKreator.'} tipAlign="end">{busy === 'rewrote the backgrounds' ? 'Writing…' : 'Regenerate backgrounds'}</Button>
          </div>
        </div>
        {regional && <p className="small muted">Names follow a {loc.fictitious ? 'naming style you picked' : `regional naming style for ${loc.label}`}. Review them and type over any that do not fit.</p>}
        <div className="grid cols-2">
          {team.map((a) => {
            const st = a.stats[a.startStage];
            return (
              <div key={a.id} className="card tight stack" style={{ '--gap': '6px' }}>
                <div className="row spread nowrap">
                  <input className="input" style={{ fontWeight: 650, padding: '3px 6px' }} aria-label={`Name of ${a.name}`} value={a.name} onChange={(e) => editTarget({ kind: 'actor', id: a.id, field: 'name' }, e.target.value)} />
                  <StylePill def={draft} styleId={desiredStyle(draft, st.s, st.m)}>Needs {draft.leadership.styles.find((s) => s.id === desiredStyle(draft, st.s, st.m))?.name}</StylePill>
                </div>
                <span className="small muted">{stageName(draft, a.startStage)} · {a.experience || 'experience not stated'}</span>
                <p className="small ink2">{renderText(draft, a.bio) || 'No background yet.'}</p>
              </div>
            );
          })}
        </div>
      </div>
      <div className="card stack">
        <div className="row spread">
          <div className="row" style={{ '--gap': '8px' }}><h3>What happens during the run</h3><GenericPill profile={profile} what="Some events" /></div>
          <Button size="sm" variant="ghost" disabled={!sample || !!busy} onClick={onRegenerateEvents} tip={sample ? 'Genie rewrites the events for your industry and location. Timing and impact do not change, and events you edited are kept.' : 'Regenerating this needs Genie, which runs in the hosted GenieKreator.'} tipAlign="end">{busy === 'rewrote the events' ? 'Writing…' : 'Regenerate events'}</Button>
        </div>
        {events.map((e) => <EventRow key={e.id} draft={draft} ev={e} edited={overrides[`ref:${refKey({ eventId: e.id })}`]?.by === 'you'} onSave={(v) => editText({ eventId: e.id }, v)} />)}
        <p className="small muted">Plus {draft.triggers.filter((t) => t.enabled).length} consequences that fire from the learner's own decisions, such as a resignation after poor leadership.</p>
      </div>
    </>
  );
}

function EventRow({ draft, ev, onSave, edited }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(ev.text);
  return (
    <div className="grid" style={{ gridTemplateColumns: 'minmax(70px, 90px) 1fr auto', gap: 10, alignItems: 'start', paddingTop: 10, borderTop: '1px solid var(--line)' }}>
      <span className="small muted num">Week {ev.week}</span>
      <div className="stack" style={{ '--gap': '4px' }}>
        <span className="row" style={{ '--gap': '6px' }}><strong className="small">{ev.name}</strong>{ev.fromBrief && <Pill tone="good">From your brief</Pill>}{edited && <Pill>Your edit</Pill>}</span>
        {editing ? (
          <>
            <TokenArea def={draft} value={value} rows={3} tokens="actor" onChange={setValue} />
            <div className="row"><Button size="sm" variant="primary" onClick={() => { onSave(value); setEditing(false); }}>Save</Button><Button size="sm" onClick={() => setEditing(false)}>Cancel</Button></div>
          </>
        ) : <p className="small ink2">{renderText(draft, ev.text, { actor: 'one of your team', pronoun: 'they' })}</p>}
      </div>
      {!editing && <Button size="sm" variant="ghost" onClick={() => { setValue(ev.text); setEditing(true); }}>Edit</Button>}
    </div>
  );
}

// ---------- step 5: learning design ----------

function DesignStep({ settings, setS, sources, calibration }) {
  const pill = (k) => { const s = SOURCE[sources[k]] || SOURCE.suggested; return <Pill tone={s.tone}>{s.label}</Pill>; };
  const toggle = (id) => setS({ outcomes: settings.outcomes.includes(id) ? settings.outcomes.filter((x) => x !== id) : [...settings.outcomes, id] });
  const customWeeks = settings.weeks && !SESSION_LENGTHS.some((l) => l.weeks === settings.weeks);
  return (
    <>
      <div>
        <div className="eyebrow">Step 5 of 6</div>
        <h1>Learning design</h1>
        <p className="ink2" style={{ marginTop: 6, maxWidth: '66ch' }}>Set from your brief. The target is checked for you, so reading people well is what reaches it.</p>
      </div>
      <div className="card stack">
        <div className="row spread"><h3>Focus of the debrief</h3>{pill('outcomes')}</div>
        <div className="row" style={{ '--gap': '6px' }}>
          {OUTCOMES.map((o) => <button key={o.id} type="button" className={`btn sm ${settings.outcomes.includes(o.id) ? 'primary' : ''}`} aria-pressed={settings.outcomes.includes(o.id)} onClick={() => toggle(o.id)}>{o.label}</button>)}
        </div>
        <p className="small muted">The chosen competencies lead the learner's report.</p>
      </div>
      <div className="card stack">
        <div className="row spread"><h3>Session length</h3>{pill(settings.weeks ? 'weeks' : 'length')}</div>
        <div className="grid cols-3">
          {SESSION_LENGTHS.map((l) => <ChoiceCard key={l.id} on={settings.weeks ? settings.weeks === l.weeks : settings.length === l.id} title={l.label} note={l.note} onClick={() => setS({ length: l.id, weeks: null })} />)}
        </div>
        {customWeeks && <p className="small">Your brief asked for <strong>{settings.weeks} simulated weeks</strong>, so the calendar uses that. Pick a length above to use a standard one instead.</p>}
      </div>
      <div className="card stack">
        <div className="row spread"><h3>Difficulty</h3>{pill('difficulty')}</div>
        <div className="grid cols-3">
          {Object.entries(DIFFICULTY).map(([id, d]) => <ChoiceCard key={id} on={settings.difficulty === id} title={d.label} note={d.note} onClick={() => setS({ difficulty: id })} />)}
        </div>
      </div>
      <div className="card stack">
        <h3>Constraints</h3>
        <Switch checked={settings.noFiring} onChange={(v) => setS({ noFiring: v })} label="No firing: the Fire member action is switched off" />
        <Switch checked={settings.formal} onChange={(v) => setS({ formal: v })} label="Formal tone for anything Genie writes" />
      </div>
      <div className="card stack">
        <h3>Target</h3>
        {!calibration || calibration.pending ? (
          <p className="small" role="status">Checking fairness… bots are playing your simulation.</p>
        ) : calibration.own ? (
          <Callout tone={calibration.expert >= 1 && calibration.weak < 0.8 ? 'good' : 'warn'} icon={calibration.expert >= 1 && calibration.weak < 0.8 ? '✓' : '!'}>
            Your target is <strong className="num">{calibration.target}</strong> conversions, from your brief. A leader with perfect insight into the team reaches about <strong>{pct(calibration.expert)}</strong> of it and hits it in {calibration.hits} of {calibration.runs} runs; guessing or one habit reaches about <strong>{pct(calibration.weak)}</strong>.
            {calibration.suggested !== calibration.target && <> A fair target is about <strong className="num">{calibration.suggested}</strong>. <Button size="sm" onClick={() => setS({ target: calibration.suggested, targetFrom: 'calibrated' })}>Use {calibration.suggested}</Button></>}
          </Callout>
        ) : (
          <Callout tone="good" icon="✓">
            Target set to <strong className="num">{calibration.target}</strong> conversions: about three quarters of what a leader with perfect insight into the team reaches, so a learner who reads people well can hit it. Guessing or relying on one style reaches only about <strong>{pct(calibration.weak)}</strong> of it, so adapting clearly pays off.
          </Callout>
        )}
      </div>
    </>
  );
}

function ChoiceCard({ on, title, note, onClick }) {
  return (
    <button type="button" className="card" aria-pressed={on} onClick={onClick} style={{ textAlign: 'left', cursor: 'pointer', borderColor: on ? 'var(--accent)' : undefined, boxShadow: on ? '0 0 0 3px var(--accent-soft)' : undefined }}>
      <h3>{title}</h3>
      <p className="small muted">{note}</p>
    </button>
  );
}

// ---------- step 6: review ----------

function ReviewStep({ draft, profile, settings, sources, overrides, readBy, found }) {
  const inferred = Object.values(sources).filter((v) => v === 'brief' || v === 'inferred' || v === 'suggested').length;
  const yours = Object.values(sources).filter((v) => v === 'you').length + Object.values(overrides).filter((o) => o.by !== 'genie').length;
  let money;
  try { money = new Intl.NumberFormat('en', { style: 'currency', currency: draft.funnel.currency, notation: 'compact' }); } catch { money = { format: (v) => `${draft.funnel.currency} ${Math.round(v).toLocaleString('en')}` }; }
  const unused = (found.specifics || []).filter((x) => !x.used);
  const usedSpecifics = (found.specifics || []).filter((x) => x.used);
  const blocking = validate(draft).filter((i) => i.severity === 'error');
  const lengthLabel = settings.weeks && !SESSION_LENGTHS.some((l) => l.weeks === settings.weeks) ? 'Custom length' : (SESSION_LENGTHS.find((l) => l.weeks === draft.timeline.weeks) || LENGTH_OF[settings.length]).label;
  return (
    <>
      <div>
        <div className="eyebrow">Step 6 of 6</div>
        <h1>Ready to create</h1>
      </div>
      <div className="grid cols-3">
        <div className="card"><span className="eyebrow">{readBy === 'genie' ? 'Genie filled in' : 'Filled in for you'}</span><div style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 650 }} className="num">{inferred} details</div><span className="small muted">{readBy === 'none' ? 'from the template' : 'from your brief'}</span></div>
        <div className="card"><span className="eyebrow">You set or edited</span><div style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 650 }} className="num">{yours}</div><span className="small muted">kept exactly as you left them</span></div>
        <div className="card"><span className="eyebrow">Target</span><div style={{ fontSize: 24, fontFamily: 'var(--font-display)', fontWeight: 650 }} className="num">{draft.funnel.target}</div><span className="small muted">{money.format(draft.funnel.target * draft.funnel.valuePerConversion)} revenue</span></div>
      </div>
      <div className="card">
        <table className="table">
          <tbody>
            <tr><td className="muted">Name</td><td>{draft.meta.name}</td></tr>
            <tr><td className="muted">For</td><td>{settings.audience.join(', ')}</td></tr>
            <tr><td className="muted">World</td><td>{profile.orgName}, {industryPack(profile).label.toLowerCase()}, {profile.offeringType === 'service' ? 'a service' : 'a product'} for {profile.customerType === 'b2c' ? 'consumers' : 'businesses'}, {draft.context.entities.find((e) => e.key === 'city')?.value}, {locationPack(profile).label}</td></tr>
            <tr><td className="muted">Session</td><td>{lengthLabel}, {draft.timeline.weeks} simulated weeks, {DIFFICULTY[settings.difficulty].label.toLowerCase()}</td></tr>
            <tr><td className="muted">Stages</td><td>{draft.stages.map((s) => s.name).join(' → ')}</td></tr>
            <tr><td className="muted">Debrief focus</td><td>{settings.outcomes.map((o) => OUTCOMES.find((x) => x.id === o)?.label).join('; ')}</td></tr>
            {usedSpecifics.length > 0 && <tr><td className="muted">From your brief</td><td>{usedSpecifics.map((x) => `${x.label}: ${x.text}`).join('; ')}</td></tr>}
            <tr><td className="muted">Constraints</td><td>{[settings.noFiring && 'No firing', settings.formal && 'Formal tone', settings.localNames && 'Local names'].filter(Boolean).join(', ') || 'None'}</td></tr>
          </tbody>
        </table>
      </div>
      {blocking.length > 0 && (
        <Callout tone="bad" icon="!">
          {blocking.length} thing{blocking.length === 1 ? '' : 's'} to fix before this can be published: {blocking.slice(0, 4).map((i) => i.title.toLowerCase()).join('; ')}{blocking.length > 4 ? '; and more' : ''}. You can create the draft now and fix {blocking.length === 1 ? 'it' : 'them'} in the Studio, or go back and fix {blocking.length === 1 ? 'it' : 'them'} here.
        </Callout>
      )}
      {unused.length > 0 && <Callout tone="warn" icon="!">Not used from your brief: {unused.map((x) => `${x.label.toLowerCase()} (${x.text})`).join('; ')}. The Context step says why.</Callout>}
      <Callout>After you create the draft, everything stays editable in the Studio, and you can re-tailor from Story and context at any time.</Callout>
    </>
  );
}
